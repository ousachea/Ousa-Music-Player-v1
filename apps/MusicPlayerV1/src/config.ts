// mirrors the config block in public/manifest.json; the daemon stores every value as a string
import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Prefs = {
  wheel: 'volume' | 'seek';
  seekSeconds: number;
  accent: 'artwork' | 'mono';
  backdrop: boolean;
  motion: boolean;
  remaining: boolean;
};

const DEFAULTS: Prefs = { wheel: 'volume', seekSeconds: 2, accent: 'artwork', backdrop: true, motion: true, remaining: true };

const SEEK_MIN = 1;
const SEEK_MAX = 30;

function apply(prefs: Prefs, key: string, value: string | null): Prefs {
  if (value === null) return { ...prefs, [key]: DEFAULTS[key as keyof Prefs] };
  switch (key) {
    case 'wheel':
      return { ...prefs, wheel: value === 'seek' ? 'seek' : 'volume' };
    case 'seekSeconds': {
      // a stored value can be anything, and a zero or a NaN here would freeze scrubbing outright
      const n = Number(value);
      if (!Number.isFinite(n)) return { ...prefs, seekSeconds: DEFAULTS.seekSeconds };
      return { ...prefs, seekSeconds: Math.min(SEEK_MAX, Math.max(SEEK_MIN, n)) };
    }
    case 'accent':
      return { ...prefs, accent: value === 'mono' ? 'mono' : 'artwork' };
    case 'backdrop':
    case 'motion':
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
