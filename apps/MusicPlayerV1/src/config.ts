// mirrors the config block in public/manifest.json; the daemon stores every value as a string
import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Prefs = {
  theme: 'card' | 'vinyl' | 'poster';
  wheel: 'volume' | 'seek';
  seekSeconds: number;
  seek: 'auto' | 'bar' | 'wave';
  accent: 'artwork' | 'mono';
  backdrop: number;
  drift: number;
  motion: boolean;
  remaining: boolean;
  clock: boolean;
};

const DEFAULTS: Prefs = { theme: 'card', wheel: 'volume', seekSeconds: 2, seek: 'auto', accent: 'artwork', backdrop: 70, drift: 40, motion: true, remaining: true, clock: true };

const SEEK_MIN = 1;
const SEEK_MAX = 30;

function apply(prefs: Prefs, key: string, value: string | null): Prefs {
  if (value === null) return { ...prefs, [key]: DEFAULTS[key as keyof Prefs] };
  switch (key) {
    case 'theme':
      return { ...prefs, theme: value === 'vinyl' || value === 'poster' ? value : 'card' };
    case 'wheel':
      return { ...prefs, wheel: value === 'seek' ? 'seek' : 'volume' };
    case 'drift': {
      // this key used to be a boolean too, so an old stored value still has to mean something sensible
      if (value === 'true') return { ...prefs, drift: DEFAULTS.drift };
      if (value === 'false') return { ...prefs, drift: 0 };
      const amount = Number(value);
      if (!Number.isFinite(amount)) return { ...prefs, drift: DEFAULTS.drift };
      return { ...prefs, drift: Math.min(100, Math.max(0, amount)) };
    }
    case 'backdrop': {
      // this key used to be a boolean, so an old stored value still has to mean something sensible
      if (value === 'true') return { ...prefs, backdrop: DEFAULTS.backdrop };
      if (value === 'false') return { ...prefs, backdrop: 0 };
      const level = Number(value);
      if (!Number.isFinite(level)) return { ...prefs, backdrop: DEFAULTS.backdrop };
      return { ...prefs, backdrop: Math.min(100, Math.max(0, level)) };
    }
    case 'seekSeconds': {
      // a stored value can be anything, and a zero or a NaN here would freeze scrubbing outright
      const n = Number(value);
      if (!Number.isFinite(n)) return { ...prefs, seekSeconds: DEFAULTS.seekSeconds };
      return { ...prefs, seekSeconds: Math.min(SEEK_MAX, Math.max(SEEK_MIN, n)) };
    }
    case 'seek':
      return { ...prefs, seek: value === 'bar' || value === 'wave' ? value : 'auto' };
    case 'accent':
      return { ...prefs, accent: value === 'mono' ? 'mono' : 'artwork' };
    case 'motion':
    case 'clock':
    case 'remaining':
      return { ...prefs, [key]: value !== 'false' };
    default:
      return prefs;
  }
}

export const PREF_KEYS = Object.keys(DEFAULTS) as (keyof Prefs)[];

// the device can only read config, so anything changed on the device is written as a doc override
const DOC_PREFIX = 'pref.';

export function usePrefs(client: BridgethingClient): {
  prefs: Prefs;
  setPref: (key: keyof Prefs, value: string) => void;
} {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const config = useRef<Record<string, string>>({});
  const overrides = useRef<Record<string, string>>({});

  const recompute = useCallback(() => {
    let next = PREF_KEYS.reduce((p, k) => ({ ...p, [k]: DEFAULTS[k] }), {} as Prefs);
    for (const [k, v] of Object.entries(config.current)) next = apply(next, k, v);
    for (const [k, v] of Object.entries(overrides.current)) next = apply(next, k, v);
    setPrefs(next);
  }, []);

  useEffect(() => {
    const offConfig = client.config.onChanged(msg => {
      if (msg.value === null) delete config.current[msg.key];
      else config.current[msg.key] = msg.value;
      // the companion app just spoke, so its value wins over whatever the device set earlier
      if (overrides.current[msg.key] !== undefined) {
        delete overrides.current[msg.key];
        client.doc.delete({ key: DOC_PREFIX + msg.key });
      }
      recompute();
    });

    const offDoc = client.doc.onChanged(msg => {
      if (!msg.key.startsWith(DOC_PREFIX)) return;
      const key = msg.key.slice(DOC_PREFIX.length);
      if (msg.value === null) delete overrides.current[key];
      else overrides.current[key] = msg.value;
      recompute();
    });

    // an unset key never comes back from either list, so the defaults have to stand on their own.
    // the two are kept independent: one of them timing out must not drop the other's values.
    client.config
      .list()
      .then(c => {
        if (!c.ok) return;
        config.current = Object.fromEntries(c.response.entries.map(e => [e.key, e.value]));
        recompute();
      })
      .catch(() => {});

    client.doc
      .list()
      .then(d => {
        if (!d.ok) return;
        overrides.current = Object.fromEntries(
          d.response.entries
            .filter(e => e.key.startsWith(DOC_PREFIX) && e.value !== null)
            .map(e => [e.key.slice(DOC_PREFIX.length), e.value as string]),
        );
        recompute();
      })
      .catch(() => {});

    return () => {
      offConfig();
      offDoc();
    };
  }, [client, recompute]);

  const setPref = useCallback(
    (key: keyof Prefs, value: string) => {
      overrides.current[key] = value;
      recompute();
      client.doc.set({ key: DOC_PREFIX + key, value });
    },
    [client, recompute],
  );

  return { prefs, setPref };
}
