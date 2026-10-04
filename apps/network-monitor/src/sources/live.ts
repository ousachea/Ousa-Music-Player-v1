// live data has two halves. the car thing's own link is measured here, by the probe this app always had, and
// shows as a device of its own. everything else arrives from the desktop extension over the daemon's forward
// channel, which is the hub agents pair with; with no extension attached that half is simply quiet
import type { BridgethingClient } from '@bridgething/client';

import { createProbe, type NetState } from '../net';
import { PROTOCOL_VERSION, type DeviceTelemetry } from '../protocol/types';
import { readMessage } from '../protocol/validators';
import type { Source } from './source';

const CAR_THING_ID = 'car-thing';
const HISTORY_MS = 120_000;
const THROUGHPUT_EVERY_MS = 6000;
const THROUGHPUT_BYTES = 65_536;

function carThingFrame(state: NetState, startedAt: number): DeviceTelemetry {
  const online = state.status === 'connected' || state.status === 'degraded';
  return {
    device: { id: CAR_THING_ID, name: 'Car Thing', platform: 'carthing', version: 'bridgething', online },
    system: { uptime: Math.round((Date.now() - startedAt) / 1000), timestamp: Date.now() },
    cpu: null,
    memory: null,
    gpu: null,
    storage: null,
    battery: null,
    processes: null,
    displays: null,
    network: {
      // the daemon says unknown when it cannot tell, which is not a name worth printing
      ...(state.kind && state.kind !== 'unknown' ? { interface: state.kind } : {}),
      ...(state.publicIp ? { publicIp: state.publicIp } : {}),
      // kbps from the probe, Mbps on the wire
      ...(state.downKbps !== null ? { download: state.downKbps / 1000 } : {}),
      ...(state.pingMs !== null ? { ping: state.pingMs } : {}),
      ...(state.metered !== null ? { metered: state.metered } : {}),
      connected: online,
    },
  };
}

export function liveSource(client: BridgethingClient, intervalMs: number): Source {
  return {
    kind: 'live',
    start(sink) {
      const startedAt = Date.now();
      let state: NetState = {
        status: 'unknown',
        pingMs: null,
        downKbps: null,
        upKbps: null,
        kind: null,
        metered: null,
        publicIp: null,
        localIp: null,
        observedUpMs: null,
        history: [],
      };
      let probe: ReturnType<typeof createProbe> | null = null;

      const emit = () => {
        const data = carThingFrame(state, startedAt);
        const message = readMessage({ type: 'telemetry', timestamp: Date.now(), deviceId: CAR_THING_ID, data });
        if (message) sink(message);
      };

      // a metered link should not spend data on measurements, so throughput only runs on an unmetered one
      const startProbe = (metered: boolean) => {
        probe?.stop();
        probe = createProbe(client, {
          pingEveryMs: Math.max(2000, intervalMs),
          throughputEveryMs: metered ? 0 : THROUGHPUT_EVERY_MS,
          throughputBytes: THROUGHPUT_BYTES,
          historyMs: HISTORY_MS,
        });
        probe.start(partial => {
          state = { ...state, ...partial };
          emit();
        });
      };

      const applyNetwork = (info: { kind: string; metered: boolean } | null) => {
        const metered = info?.metered ?? false;
        const changed = state.metered !== metered || probe === null;
        state = { ...state, kind: info?.kind ?? null, metered };
        if (changed) startProbe(metered);
      };
      const offCaps = client.capabilities.onUpdate(msg => applyNetwork(msg.capabilities.network));
      client.capabilities
        .get()
        .then(r => applyNetwork(r.ok ? r.response.capabilities.network : null))
        .catch(() => applyNetwork(null));

      // the hub's half: validate everything, drop what fails
      const offForward = client.forward.onJson(raw => {
        const message = readMessage(raw);
        if (message) sink(message);
      });
      const hello = () =>
        client.forward.json({ type: 'hello', role: 'dashboard', protocol: PROTOCOL_VERSION, interval: intervalMs }).catch(() => {});
      void hello();
      // the extension may start after the page does; saying hello again now and then lets it catch up
      const helloTimer = setInterval(hello, 15_000);

      return () => {
        probe?.stop();
        offCaps();
        offForward();
        clearInterval(helloTimer);
      };
    },
  };
}
