// mirrors the config block in public/manifest.json; the daemon stores every value as a string
import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

// every screen keeps its own settings; only the colour is shared, because it paints all of them
export type Face = 'digital' | 'digital-date' | 'minimal' | 'border' | 'flip' | 'analogue' | 'world' | 'binary' | 'word';
export type TimerMode = 'countdown' | 'circular' | 'pomodoro' | 'interval' | 'kitchen' | 'preset' | 'multi';

export const FACES: Face[] = ['digital', 'digital-date', 'minimal', 'border', 'flip', 'analogue', 'world', 'binary', 'word'];
export const FACE_LABELS: Record<Face, string> = {
  digital: 'Digital',
  'digital-date': 'Digital + Date',
  minimal: 'Minimal',
  border: 'Border',
  flip: 'Flip',
  analogue: 'Analogue',
  world: 'World',
  binary: 'Binary',
  word: 'Word',
};

export const TIMER_MODES: TimerMode[] = ['countdown', 'circular', 'pomodoro', 'interval', 'kitchen', 'preset', 'multi'];
export const TIMER_LABELS: Record<TimerMode, string> = {
  countdown: 'Countdown',
  circular: 'Circular',
  pomodoro: 'Pomodoro',
  interval: 'Interval',
  kitchen: 'Kitchen',
  preset: 'Preset',
  multi: 'Multi',
};

// a curated list rather than every zone the runtime knows: the wheel has to get through it, and a
// world clock is about the four places you care about
export const CITIES: Record<string, { label: string; tz: string } | null> = {
  off: null,
  london: { label: 'London', tz: 'Europe/London' },
  paris: { label: 'Paris', tz: 'Europe/Paris' },
  newyork: { label: 'New York', tz: 'America/New_York' },
  chicago: { label: 'Chicago', tz: 'America/Chicago' },
  losangeles: { label: 'Los Angeles', tz: 'America/Los_Angeles' },
  saopaulo: { label: 'Sao Paulo', tz: 'America/Sao_Paulo' },
  utc: { label: 'UTC', tz: 'UTC' },
  dubai: { label: 'Dubai', tz: 'Asia/Dubai' },
  mumbai: { label: 'Mumbai', tz: 'Asia/Kolkata' },
  bangkok: { label: 'Bangkok', tz: 'Asia/Bangkok' },
  phnompenh: { label: 'Phnom Penh', tz: 'Asia/Phnom_Penh' },
  singapore: { label: 'Singapore', tz: 'Asia/Singapore' },
  hongkong: { label: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  tokyo: { label: 'Tokyo', tz: 'Asia/Tokyo' },
  seoul: { label: 'Seoul', tz: 'Asia/Seoul' },
  sydney: { label: 'Sydney', tz: 'Australia/Sydney' },
  auckland: { label: 'Auckland', tz: 'Pacific/Auckland' },
};
export const CITY_KEYS = Object.keys(CITIES);

// every duration setting is written the way it reads, and turns into milliseconds here
export const ms = (spec: string) =>
  spec.endsWith('s') ? Number(spec.slice(0, -1)) * 1000 : Number(spec.slice(0, -1)) * 60000;
export const spanLabel = (spec: string) =>
  spec.endsWith('s') ? `${spec.slice(0, -1)} sec` : `${spec.slice(0, -1)} min`;

const SPANS = ['30s', '1m', '5m'] as const;
const STEPS = ['10s', '1m', '5m'] as const;

export type Prefs = {
  // held as a string like every other choice, so one table checks them all
  rotate: '0' | '90' | '180' | '270';
  tint: 'white' | 'amber' | 'cyan' | 'green' | 'magenta' | 'sunset' | 'aurora' | 'ember';
  style: Face;
  size: 'small' | 'medium' | 'large' | 'fill';
  format: 'auto' | 'h12' | 'h24';
  seconds: boolean;
  date: boolean;
  world1: string;
  world2: string;
  world3: string;
  timerMode: TimerMode;
  timerSound: boolean;
  timerRing: (typeof SPANS)[number];
  timerStep: (typeof STEPS)[number];
  pomodoroWork: '15m' | '25m' | '45m';
  pomodoroBreak: '5m' | '10m' | '15m';
  intervalWork: '30s' | '45s' | '1m' | '2m';
  intervalRest: '10s' | '15s' | '30s' | '1m';
  intervalRounds: '4' | '6' | '8' | '12';
  swHundredths: boolean;
  swLaps: boolean;
  alarmSound: boolean;
  alarmRing: (typeof SPANS)[number];
};

const DEFAULTS: Prefs = {
  rotate: '0',
  tint: 'white',
  style: 'digital',
  size: 'medium',
  format: 'auto',
  seconds: true,
  date: true,
  world1: 'london',
  world2: 'newyork',
  world3: 'tokyo',
  timerMode: 'countdown',
  timerSound: true,
  timerRing: '1m',
  timerStep: '1m',
  pomodoroWork: '25m',
  pomodoroBreak: '5m',
  intervalWork: '45s',
  intervalRest: '15s',
  intervalRounds: '8',
  swHundredths: true,
  swLaps: true,
  alarmSound: true,
  alarmRing: '1m',
};

// one table of what each key may hold, so a value from the daemon is checked in one place rather
// than in a case per setting
export const CHOICES = {
  rotate: ['0', '90', '180', '270'],
  tint: ['white', 'amber', 'cyan', 'green', 'magenta', 'sunset', 'aurora', 'ember'],
  style: FACES,
  size: ['small', 'medium', 'large', 'fill'],
  format: ['auto', 'h12', 'h24'],
  world1: CITY_KEYS,
  world2: CITY_KEYS,
  world3: CITY_KEYS,
  timerMode: TIMER_MODES,
  timerRing: SPANS,
  timerStep: STEPS,
  alarmRing: SPANS,
  pomodoroWork: ['15m', '25m', '45m'],
  pomodoroBreak: ['5m', '10m', '15m'],
  intervalWork: ['30s', '45s', '1m', '2m'],
  intervalRest: ['10s', '15s', '30s', '1m'],
  intervalRounds: ['4', '6', '8', '12'],
} as const satisfies Partial<Record<keyof Prefs, readonly string[]>>;

const FLAGS = ['seconds', 'date', 'timerSound', 'swHundredths', 'swLaps', 'alarmSound'] as const;

// every colour is a pair, not one value: the numerals run a gradient between them and the screen
// behind takes a wash of the same pair, so the app has a temperature rather than one lit shape
export type Palette = { main: string; second: string; glow: string };

export const PALETTES: Record<Prefs['tint'], Palette> = {
  white: { main: '#f2f4f7', second: '#9db4cc', glow: '#2b4460' },
  amber: { main: '#ffb454', second: '#ff7a59', glow: '#5e2f10' },
  cyan: { main: '#5fd3f3', second: '#6b8bf5', glow: '#123f63' },
  green: { main: '#5fe39b', second: '#b6e35f', glow: '#154d33' },
  magenta: { main: '#f08bd0', second: '#9b8bf0', glow: '#4a2258' },
  sunset: { main: '#ffa46b', second: '#ff5f9e', glow: '#63204a' },
  aurora: { main: '#7cf0c8', second: '#6bb0ff', glow: '#144c5c' },
  ember: { main: '#ff7d6b', second: '#ffd36b', glow: '#5e2418' },
};

// one gradient across a single run of text. only safe where nothing inside carries its own opacity,
// which would composite separately and lose the background the glyphs are cut out of
export const ink = (p: Palette) => ({
  backgroundImage: `linear-gradient(115deg, ${p.main} 8%, ${p.second} 92%)`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
});

export const fill = (p: Palette) => `linear-gradient(115deg, ${p.main}, ${p.second})`;

export const TINTS: Record<Prefs['tint'], string> = Object.fromEntries(
  Object.entries(PALETTES).map(([k, v]) => [k, v.main]),
) as Record<Prefs['tint'], string>;

export function apply(prefs: Prefs, key: string, value: string | null): Prefs {
  if (!(key in DEFAULTS)) return prefs;
  const k = key as keyof Prefs;
  if (value === null) return { ...prefs, [k]: DEFAULTS[k] };
  if (k in CHOICES) {
    const allowed = CHOICES[k as keyof typeof CHOICES] as readonly string[];
    return { ...prefs, [k]: allowed.includes(value) ? value : DEFAULTS[k] };
  }
  if ((FLAGS as readonly string[]).includes(k)) return { ...prefs, [k]: value !== 'false' };
  return prefs;
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
