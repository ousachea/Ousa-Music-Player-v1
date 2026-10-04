// the agent for the computer the car thing is plugged into. it reads this machine on three clocks, lays the latest
// of each into one frame in the shared telemetry shape, and sends it to every car thing showing this app. it only
// ever answers hello: nothing that arrives from a device can make it run anything
import { asJson, defineExtension, json, type ExtensionContext } from '@bridgething/extension';

import { PROTOCOL_VERSION, type DeviceTelemetry, type Platform } from '../src/protocol/types';
import type { Collector, Section } from './collectors/collector';
import { macosCollector } from './collectors/macos';

const MIN_INTERVAL = 1000;
const MAX_INTERVAL = 5000;
const MEDIUM_EVERY = 5;
const SLOW_EVERY = 30;

function collectorFor(os: typeof Deno.build.os): { platform: Platform; collector: Collector } | null {
  if (os === 'darwin') return { platform: 'macos', collector: macosCollector() };
  return null;
}

/** sections are merged a level deep: a tier fills the fields it reads and leaves the others' alone */
function merge(...parts: Section[]): Section {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (value === undefined) continue;
      const prev = out[key];
      out[key] =
        value && typeof value === 'object' && !Array.isArray(value) && prev && typeof prev === 'object' && !Array.isArray(prev)
          ? { ...prev, ...value }
          : value;
    }
  }
  return out as Section;
}

let timer: ReturnType<typeof setTimeout> | undefined;

defineExtension({
  start(ctx: ExtensionContext) {
    const found = collectorFor(Deno.build.os);
    let interval = MIN_INTERVAL;
    let deviceId: string | null = null;
    let slow: Section = {};
    let medium: Section = {};
    let tick = 0;
    let busy = false;

    const watching = () => ctx.devices.some(d => d.connected && d.active);

    const hello = () =>
      ctx.broadcast(
        json({
          type: 'hello',
          role: 'agent',
          protocol: PROTOCOL_VERSION,
          ...(found && deviceId ? { devices: [{ id: deviceId, name: String(slow.device?.name ?? Deno.hostname()), platform: found.platform, online: true }] } : {}),
        }),
      );

    const sendCapabilities = () => {
      if (found && deviceId) ctx.broadcast(json({ type: 'capabilities', deviceId, capabilities: found.collector.capabilities() }));
    };

    // listeners first, before any await: the host replays the live devices the moment start begins
    ctx.on('device', event => {
      if (event.type === 'disconnected') return;
      hello();
      sendCapabilities();
    });
    ctx.on('message', (_device, message) => {
      const payload = asJson<{ type?: unknown; interval?: unknown }>(message);
      if (payload?.type !== 'hello') return;
      if (typeof payload.interval === 'number' && Number.isFinite(payload.interval)) {
        interval = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(payload.interval)));
      }
      hello();
      sendCapabilities();
    });

    if (!found) {
      ctx.log.warn(`no collector for ${Deno.build.os} yet`);
      ctx.broadcast(json({ type: 'error', message: `This computer (${Deno.build.os}) is not supported yet` }));
      return;
    }
    const { platform, collector } = found;

    const frame = async () => {
      // reading the machine costs something, so it only happens while a car thing is showing this app
      if (!busy && deviceId && watching()) {
        busy = true;
        try {
          if (tick % SLOW_EVERY === 0) slow = await collector.slow();
          if (tick % MEDIUM_EVERY === 0) medium = await collector.medium();
          const fast = await collector.fast();
          const now = Date.now();
          const merged = merge(slow, medium, fast);
          const data: DeviceTelemetry = {
            ...merged,
            device: { online: true, ...merged.device, id: deviceId, name: String(merged.device?.name ?? Deno.hostname()), platform },
            system: { ...merged.system, timestamp: now },
          };
          // a section the machine cannot read is said outright, so the dashboard shows nothing rather than waits
          const caps = collector.capabilities();
          if (!caps.gpu) data.gpu = null;
          if (!caps.battery) data.battery = null;
          if (tick === 0) sendCapabilities();
          ctx.broadcast(json({ type: 'telemetry', timestamp: now, deviceId, data }));
          tick++;
        } catch (err) {
          ctx.log.warn('collection failed', String(err));
        } finally {
          busy = false;
        }
      }
      timer = setTimeout(frame, interval);
    };

    // a stable id per machine, made once and kept, so the dashboard's chosen device survives a restart
    ctx.kv
      .get<string>('deviceId')
      .then(async stored => {
        deviceId = stored ?? `${platform}-${crypto.randomUUID().slice(0, 8)}`;
        if (!stored) await ctx.kv.set('deviceId', deviceId);
        ctx.log.info(`agent up on ${platform} as ${deviceId}`);
        hello();
        void frame();
      })
      .catch(err => ctx.log.error('could not read the device id', String(err)));
  },
  stop() {
    clearTimeout(timer);
  },
});
