// the dashboard's own preferences, kept in the webapp's store on the device so they survive a restart
import type { BridgethingClient } from '@bridgething/client';

import { createStore, useStore } from './create';

export type Settings = {
  source: 'mock' | 'live';
  /** ms between fast frames; slower sections run at five and thirty times this */
  interval: 1000 | 2000 | 5000;
  tempUnit: 'c' | 'f';
  netUnit: 'mbps' | 'mbs';
  historySec: 30 | 60 | 120;
  defaultDevice: string | null;
  processSort: 'cpu' | 'memory';
  homeStyle: 'cards' | 'rings';
};

export const DEFAULT_SETTINGS: Settings = {
  source: 'mock',
  interval: 1000,
  tempUnit: 'c',
  netUnit: 'mbps',
  historySec: 60,
  defaultDevice: null,
  processSort: 'cpu',
  homeStyle: 'cards',
};

const KEY = 'settings';

export const settingsStore = createStore<Settings>(DEFAULT_SETTINGS);

export const useSettings = () => useStore(settingsStore);

function pick<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/** a stored value is read field by field, so a setting added later or a hand-edited one falls back on its own */
function parse(raw: string | null | undefined): Settings {
  let o: Record<string, unknown> = {};
  try {
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (typeof v === 'object' && v !== null) o = v as Record<string, unknown>;
  } catch {
    // a corrupt value is the defaults, not a crash
  }
  const d = DEFAULT_SETTINGS;
  return {
    source: pick(o.source, ['mock', 'live'] as const, d.source),
    interval: pick(o.interval, [1000, 2000, 5000] as const, d.interval),
    tempUnit: pick(o.tempUnit, ['c', 'f'] as const, d.tempUnit),
    netUnit: pick(o.netUnit, ['mbps', 'mbs'] as const, d.netUnit),
    historySec: pick(o.historySec, [30, 60, 120] as const, d.historySec),
    defaultDevice: typeof o.defaultDevice === 'string' ? o.defaultDevice.slice(0, 64) : null,
    processSort: pick(o.processSort, ['cpu', 'memory'] as const, d.processSort),
    homeStyle: pick(o.homeStyle, ['cards', 'rings'] as const, d.homeStyle),
  };
}

export async function loadSettings(client: BridgethingClient) {
  try {
    const r = await client.store.get({ key: KEY });
    if (r.ok) settingsStore.set(parse(r.response.value));
  } catch {
    // no daemon yet: the defaults stand until it answers
  }
}

export function updateSettings(client: BridgethingClient, patch: Partial<Settings>) {
  settingsStore.set(prev => ({ ...prev, ...patch }));
  client.store.put({ key: KEY, value: JSON.stringify(settingsStore.get()) }).catch(() => {});
}
