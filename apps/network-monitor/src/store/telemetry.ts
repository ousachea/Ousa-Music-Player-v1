// every device the dashboard has heard from, its latest frame and a short history per graphed metric. entries
// are replaced rather than mutated, so a memoised screen redraws only when its own device changed
import type { Message } from '../protocol/messages';
import {
  capabilitiesOf,
  type DeviceCapabilities,
  type DeviceInfo,
  type DeviceTelemetry,
} from '../protocol/types';
import { createStore, useStore } from './create';

export type Series = 'cpu' | 'cpuTemp' | 'gpu' | 'gpuTemp' | 'ram' | 'down' | 'up' | 'ping';

export interface MetricHistory {
  timestamp: number;
  value: number;
}

export type DeviceEntry = {
  info: DeviceInfo;
  telemetry: DeviceTelemetry | null;
  /** what the agent declared; null means read it off the telemetry */
  declared: DeviceCapabilities | null;
  lastUpdate: number | null;
  online: boolean;
  /** when it last came back, so the screen can say so for a moment */
  backAt: number | null;
  history: Record<Series, MetricHistory[]>;
};

export type TelemetryState = {
  devices: Record<string, DeviceEntry>;
  /** arrival order, so the device list does not reshuffle as frames land */
  order: string[];
  lastMessageAt: number | null;
  lastError: string | null;
};

// coalesced to a paint rate: several devices reporting in the same second cost one render, not several
export const telemetryStore = createStore<TelemetryState>(
  { devices: {}, order: [], lastMessageAt: null, lastError: null },
  250,
);

export const useTelemetry = () => useStore(telemetryStore);

const emptyHistory = (): Record<Series, MetricHistory[]> => ({
  cpu: [],
  cpuTemp: [],
  gpu: [],
  gpuTemp: [],
  ram: [],
  down: [],
  up: [],
  ping: [],
});

export function capabilities(entry: DeviceEntry): DeviceCapabilities | null {
  return entry.declared ?? (entry.telemetry ? capabilitiesOf(entry.telemetry) : null);
}

function sample(t: DeviceTelemetry): Partial<Record<Series, number>> {
  const ram =
    t.memory?.usage ??
    (t.memory?.used !== undefined && t.memory.total ? (t.memory.used / t.memory.total) * 100 : undefined);
  return {
    cpu: t.cpu?.usage,
    cpuTemp: t.cpu?.temperature,
    gpu: t.gpu?.usage,
    gpuTemp: t.gpu?.temperature,
    ram,
    down: t.network?.download,
    up: t.network?.upload,
    ping: t.network?.ping,
  };
}

let historyMs = 60_000;

export function setHistoryWindow(seconds: number) {
  historyMs = seconds * 1000;
}

function extend(history: Record<Series, MetricHistory[]>, t: DeviceTelemetry, at: number) {
  const next = { ...history };
  const values = sample(t);
  for (const key of Object.keys(next) as Series[]) {
    const value = values[key];
    const kept = next[key].filter(p => at - p.timestamp <= historyMs);
    next[key] = value === undefined ? kept : [...kept, { timestamp: at, value }];
  }
  return next;
}

function entryFor(state: TelemetryState, info: DeviceInfo): DeviceEntry {
  return (
    state.devices[info.id] ?? {
      info,
      telemetry: null,
      declared: null,
      lastUpdate: null,
      online: info.online,
      backAt: null,
      history: emptyHistory(),
    }
  );
}

function put(state: TelemetryState, entry: DeviceEntry): TelemetryState {
  const id = entry.info.id;
  return {
    ...state,
    devices: { ...state.devices, [id]: entry },
    order: state.order.includes(id) ? state.order : [...state.order, id],
  };
}

/** the one place a validated message changes what the dashboard knows */
export function receive(message: Message) {
  const now = Date.now();
  telemetryStore.set(state => {
    const touched: TelemetryState = { ...state, lastMessageAt: now };
    switch (message.type) {
      case 'telemetry': {
        const prev = entryFor(touched, message.data.device);
        return put(touched, {
          ...prev,
          info: message.data.device,
          telemetry: message.data,
          // timed by arrival, not by the agent's clock, which may be anywhere
          lastUpdate: now,
          online: true,
          backAt: prev.online || prev.lastUpdate === null ? prev.backAt : now,
          history: extend(prev.history, message.data, now),
        });
      }
      case 'device-status': {
        const known = touched.devices[message.deviceId];
        const info = message.device ?? known?.info;
        if (!info) return touched;
        const prev = entryFor(touched, info);
        return put(touched, {
          ...prev,
          info,
          online: message.online,
          backAt: message.online && !prev.online ? now : prev.backAt,
        });
      }
      case 'capabilities': {
        const prev = touched.devices[message.deviceId];
        return prev ? put(touched, { ...prev, declared: message.capabilities }) : touched;
      }
      case 'hello': {
        let next = touched;
        for (const info of message.devices ?? []) next = put(next, { ...entryFor(next, info), info });
        return next;
      }
      case 'error':
        return { ...touched, lastError: message.message };
      default:
        return touched;
    }
  });
}

/** a device that has gone quiet for this many frames is called offline rather than waited on forever */
const STALE_FRAMES = 5;

export function sweep(intervalMs: number) {
  const now = Date.now();
  const limit = Math.max(4000, intervalMs * STALE_FRAMES);
  const state = telemetryStore.get();
  const stale = state.order.filter(id => {
    const d = state.devices[id];
    return d.online && d.lastUpdate !== null && now - d.lastUpdate > limit;
  });
  if (stale.length === 0) return;
  telemetryStore.set(s => {
    let next = s;
    for (const id of stale) next = put(next, { ...next.devices[id], online: false });
    return next;
  });
}

/** switching between mock and live starts the device list over, so the two never mix */
export function resetTelemetry() {
  telemetryStore.set({ devices: {}, order: [], lastMessageAt: null, lastError: null });
}
