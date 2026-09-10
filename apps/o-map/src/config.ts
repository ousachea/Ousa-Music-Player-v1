// mirrors the config block in public/manifest.json; the daemon stores every value as a string, and
// anything set on the device is kept as a doc override because config itself is read only there
import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Prefs = {
  place: string;
  base: 'streets' | 'minimal' | 'night' | 'plain';
  traffic: boolean;
  trafficKey: string;
};

const DEFAULTS: Prefs = { place: 'phnom-penh', base: 'streets', traffic: true, trafficKey: '' };

export function apply(prefs: Prefs, key: string, value: string | null): Prefs {
  if (!(key in DEFAULTS)) return prefs;
  if (value === null) return { ...prefs, [key]: DEFAULTS[key as keyof Prefs] };
  switch (key) {
    case 'base':
      return {
        ...prefs,
        base: value === 'minimal' || value === 'night' || value === 'plain' ? value : 'streets',
      };
    case 'traffic':
      return { ...prefs, traffic: value !== 'false' };
    case 'place':
    case 'trafficKey':
      return { ...prefs, [key]: value };
    default:
      return prefs;
  }
}

const DOC_PREFIX = 'pref.';

export function usePrefs(client: BridgethingClient): {
  prefs: Prefs;
  setPref: (key: keyof Prefs, value: string) => void;
} {
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
