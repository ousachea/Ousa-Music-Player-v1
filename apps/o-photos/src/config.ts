// mirrors the config block in public/manifest.json. the server and the key are typed in the
// companion app, since a Car Thing has nowhere to type a url; everything else can be set on the
// device and is kept as a doc override, because config itself is read only there
import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Prefs = {
  server: string;
  key: string;
  interval: number;
  transition: 'fade' | 'crossfade' | 'slide' | 'zoom' | 'kenburns' | 'random';
  source: 'recent' | 'favourites' | 'album';
  shuffle: boolean;
  loop: boolean;
  ambient: boolean;
  cacheMb: number;
  clock: boolean;
  date: boolean;
  hour24: boolean;
  motion: boolean;
};

export const INTERVALS = [5, 10, 15, 30, 60, 300];
export const TRANSITIONS: Prefs['transition'][] = ['fade', 'crossfade', 'slide', 'zoom', 'kenburns', 'random'];
export const CACHE_MB = [100, 250, 500, 1000, 2000];

const DEFAULTS: Prefs = {
  server: '',
  key: '',
  interval: 10,
  transition: 'kenburns',
  source: 'recent',
  shuffle: false,
  loop: true,
  ambient: false,
  cacheMb: 500,
  clock: true,
  date: true,
  hour24: true,
  motion: true,
};

const FLAGS = ['shuffle', 'loop', 'ambient', 'clock', 'date', 'hour24', 'motion'] as const;

export function apply(prefs: Prefs, key: string, value: string | null): Prefs {
  if (!(key in DEFAULTS)) return prefs;
  const k = key as keyof Prefs;
  if (value === null) return { ...prefs, [k]: DEFAULTS[k] };
  if ((FLAGS as readonly string[]).includes(k)) return { ...prefs, [k]: value !== 'false' };
  switch (k) {
    case 'interval': {
      const n = Number(value);
      return { ...prefs, interval: INTERVALS.includes(n) ? n : DEFAULTS.interval };
    }
    case 'cacheMb': {
      const n = Number(value);
      return { ...prefs, cacheMb: CACHE_MB.includes(n) ? n : DEFAULTS.cacheMb };
    }
    case 'transition':
      return { ...prefs, transition: (TRANSITIONS as string[]).includes(value) ? (value as Prefs['transition']) : DEFAULTS.transition };
    case 'source':
      return { ...prefs, source: value === 'favourites' || value === 'album' ? value : 'recent' };
    default:
      return { ...prefs, [k]: value };
  }
}

const DOC_PREFIX = 'pref.';

export function usePrefs(client: BridgethingClient) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const config = useRef<Record<string, string>>({});
  const overrides = useRef<Record<string, string>>({});

  const recompute = useCallback(() => {
    let next = { ...DEFAULTS };
    for (const [k, v] of Object.entries(config.current)) next = apply(next, k, v);
    for (const [k, v] of Object.entries(overrides.current)) next = apply(next, k, v);
    setPrefs(next);
  }, []);

  useEffect(() => {
    const offConfig = client.config.onChanged(msg => {
      if (msg.value === null) delete config.current[msg.key];
      else config.current[msg.key] = msg.value;
      recompute();
    });
    const offDoc = client.doc.onChanged(msg => {
      if (!msg.key.startsWith(DOC_PREFIX)) return;
      const key = msg.key.slice(DOC_PREFIX.length);
      if (msg.value === null) delete overrides.current[key];
      else overrides.current[key] = msg.value;
      recompute();
    });
    client.config.list().then(r => {
      if (!r.ok) return;
      for (const entry of r.response.entries) config.current[entry.key] = entry.value;
      recompute();
    });
    client.doc.list().then(r => {
      if (!r.ok) return;
      for (const entry of r.response.entries) {
        if (entry.key.startsWith(DOC_PREFIX) && entry.value !== null) {
          overrides.current[entry.key.slice(DOC_PREFIX.length)] = entry.value;
        }
      }
      recompute();
    });
    return () => {
      offConfig();
      offDoc();
    };
  }, [client, recompute]);

  const setPref = useCallback(
    (key: keyof Prefs, value: string) => {
      overrides.current[key] = value;
      recompute();
      client.doc.set({ key: DOC_PREFIX + key, value }).catch(() => {});
    },
    [client, recompute],
  );

  return { prefs, setPref };
}
