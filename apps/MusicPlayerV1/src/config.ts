// mirrors the config block in public/manifest.json; the daemon stores every value as a string
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useState } from 'react';

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

export function usePrefs(client: BridgethingClient): Prefs {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    // an unset key never comes back from list, so the defaults have to stand on their own
    const off = client.config.onChanged(msg => setPrefs(p => apply(p, msg.key, msg.value)));
    client.config.list().then(r => {
      if (!r.ok) return;
      setPrefs(r.response.entries.reduce((p, e) => apply(p, e.key, e.value), DEFAULTS));
    });
    return off;
  }, [client]);

  return prefs;
}
