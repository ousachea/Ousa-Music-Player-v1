// mirrors the config block in public/manifest.json; the daemon stores every value as a string
import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Prefs = {
  style: 'digital' | 'analogue' | 'flip' | 'minimal';
  format: 'auto' | 'h12' | 'h24';
  seconds: boolean;
  date: boolean;
  tint: 'white' | 'amber' | 'cyan' | 'green' | 'magenta';
  chime: boolean;
};

const DEFAULTS: Prefs = { style: 'digital', format: 'auto', seconds: true, date: true, tint: 'white', chime: true };

export const TINTS: Record<Prefs['tint'], string> = {
  white: '#f2f4f7',
  amber: '#ffb454',
  cyan: '#5fd3f3',
  green: '#5fe39b',
  magenta: '#f08bd0',
};

export function apply(prefs: Prefs, key: string, value: string | null): Prefs {
  if (value === null) return { ...prefs, [key]: DEFAULTS[key as keyof Prefs] };
  switch (key) {
    case 'style':
      return {
        ...prefs,
        style: value === 'analogue' || value === 'flip' || value === 'minimal' ? value : 'digital',
      };
    case 'format':
      return { ...prefs, format: value === 'h12' || value === 'h24' ? value : 'auto' };
    case 'tint':
      return { ...prefs, tint: value in TINTS ? (value as Prefs['tint']) : 'white' };
    case 'seconds':
    case 'date':
    case 'chime':
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
      const before = config.current[msg.key];
      if (msg.value === null) delete config.current[msg.key];
      else config.current[msg.key] = msg.value;
      // installing or updating rewrites every declared default with the value that was already
      // there, and that must not wipe a setting made on the device
      const changed = msg.value !== null && msg.value !== before && before !== undefined;
      if (changed && overrides.current[msg.key] !== undefined) {
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

// the alarm outlives a restart, so it lives in the same document store the prefs use
const ALARM_KEY = 'alarm';
export type Alarm = { h: number; m: number; on: boolean };
const NO_ALARM: Alarm = { h: 7, m: 0, on: false };

export function useAlarm(client: BridgethingClient): [Alarm, (next: Alarm) => void] {
  const [alarm, setLocal] = useState<Alarm>(NO_ALARM);

  useEffect(() => {
    const read = (value: string | null) => {
      if (!value) return;
      try {
        const parsed = JSON.parse(value) as Partial<Alarm>;
        if (typeof parsed.h === 'number' && typeof parsed.m === 'number') {
          setLocal({ h: parsed.h % 24, m: parsed.m % 60, on: parsed.on === true });
        }
      } catch {
        // a document written by hand is not worth taking the screen down for
      }
    };
    const off = client.doc.onChanged(msg => msg.key === ALARM_KEY && read(msg.value));
    client.doc
      .get({ key: ALARM_KEY })
      .then(r => r.ok && read(r.response.value ?? null))
      .catch(() => {});
    return off;
  }, [client]);

  const set = useCallback(
    (next: Alarm) => {
      setLocal(next);
      client.doc.set({ key: ALARM_KEY, value: JSON.stringify(next) });
    },
    [client],
  );

  return [alarm, set];
}
