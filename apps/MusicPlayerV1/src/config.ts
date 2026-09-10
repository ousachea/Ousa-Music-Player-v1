// mirrors the config block in public/manifest.json; the daemon stores every value as a string
import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Prefs = {
  theme: 'widget' | 'vinyl' | 'cd' | 'cassette' | 'poster' | 'lyrics';
  rotate: 0 | 90 | 180 | 270;
  lyricsInfo: 'tl' | 'bl' | 'tr' | 'br';
  words: boolean;
  lyricSize: number;
  coverEdge: boolean;
  coverPanel: boolean;
  coverVolume: boolean;
  tapeArt: boolean;
  tape: 'written' | 'printed' | 'clear';
  vinylTint: 'black' | 'album' | 'marble';
  wheel: 'volume' | 'seek';
  seekSeconds: number;
  seek: 'auto' | 'bar' | 'wave';
  seekDot: 'auto' | 'on' | 'off';
  accent: 'artwork' | 'mono';
  hdArt: boolean;
  pulse: boolean;
  pulseBpm: number;
  backdrop: number;
  blur: number;
  drift: number;
  transport: boolean;
  tip: boolean;
  motion: boolean;
  notes: boolean;
  remaining: boolean;
  clock: boolean;
  clockPos: 'left' | 'center' | 'right';
  clockSeconds: boolean;
  clockSize: number;
  clockFormat: 'auto' | 'h12' | 'h24';
};

const DEFAULTS: Prefs = { theme: 'widget', rotate: 0, lyricsInfo: 'tl', words: true, lyricSize: 100, coverEdge: false, coverPanel: false, coverVolume: true, tapeArt: true, tape: 'written', vinylTint: 'black', wheel: 'volume', seekSeconds: 2, seek: 'auto', seekDot: 'auto', accent: 'artwork', hdArt: true, pulse: false, pulseBpm: 0, backdrop: 100, blur: 60, drift: 100, transport: true, tip: true, motion: true, notes: true, remaining: true, clock: true, clockPos: 'left', clockSize: 150, clockSeconds: true, clockFormat: 'auto' };

// zero means auto, which is only ever this tempo: the app has no way to know the song's own
export const AUTO_PULSE_BPM = 90;
export const PULSE_BPM_MIN = 40;
export const PULSE_BPM_MAX = 180;

export const LYRIC_SIZE_MIN = 70;
export const LYRIC_SIZE_MAX = 160;

const SEEK_MIN = 1;
const SEEK_MAX = 30;

// exported for the round trip test: every key has to land in its own field, and a stray
// fall-through in this switch silently writes a different setting instead
export function apply(prefs: Prefs, key: string, value: string | null): Prefs {
  if (value === null) return { ...prefs, [key]: DEFAULTS[key as keyof Prefs] };
  switch (key) {
    case 'theme':
      return {
        ...prefs,
        theme:
          value === 'vinyl' || value === 'cd' || value === 'cassette' || value === 'poster' || value === 'lyrics'
            ? value
            : 'widget',
      };
    case 'wheel':
      return { ...prefs, wheel: value === 'seek' ? 'seek' : 'volume' };
    case 'rotate': {
      const turn = Number(value);
      return { ...prefs, rotate: turn === 90 || turn === 180 || turn === 270 ? turn : 0 };
    }
    case 'pulseBpm': {
      const bpm = Number(value);
      if (!Number.isFinite(bpm)) return { ...prefs, pulseBpm: DEFAULTS.pulseBpm };
      if (bpm <= 0) return { ...prefs, pulseBpm: 0 };
      return { ...prefs, pulseBpm: Math.min(PULSE_BPM_MAX, Math.max(PULSE_BPM_MIN, bpm)) };
    }
    case 'drift': {
      // this key used to be a boolean too, so an old stored value still has to mean something sensible
      if (value === 'true') return { ...prefs, drift: DEFAULTS.drift };
      if (value === 'false') return { ...prefs, drift: 0 };
      const amount = Number(value);
      if (!Number.isFinite(amount)) return { ...prefs, drift: DEFAULTS.drift };
      return { ...prefs, drift: Math.min(100, Math.max(0, amount)) };
    }
    case 'blur': {
      const px = Number(value);
      if (!Number.isFinite(px)) return { ...prefs, blur: DEFAULTS.blur };
      return { ...prefs, blur: Math.min(100, Math.max(0, px)) };
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
    case 'seekDot':
      return { ...prefs, seekDot: value === 'on' || value === 'off' ? value : 'auto' };
    case 'lyricsInfo':
      return { ...prefs, lyricsInfo: value === 'bl' || value === 'tr' || value === 'br' ? value : 'tl' };
    case 'accent':
      return { ...prefs, accent: value === 'mono' ? 'mono' : 'artwork' };
    case 'clockSize': {
      const size = Number(value);
      if (!Number.isFinite(size)) return { ...prefs, clockSize: DEFAULTS.clockSize };
      return { ...prefs, clockSize: Math.min(200, Math.max(70, size)) };
    }
    case 'lyricSize': {
      const size = Number(value);
      if (!Number.isFinite(size)) return { ...prefs, lyricSize: DEFAULTS.lyricSize };
      return { ...prefs, lyricSize: Math.min(LYRIC_SIZE_MAX, Math.max(LYRIC_SIZE_MIN, size)) };
    }
    case 'clockPos':
      return { ...prefs, clockPos: value === 'left' || value === 'center' ? value : 'right' };
    case 'vinylTint':
      return { ...prefs, vinylTint: value === 'album' || value === 'marble' ? value : 'black' };
    case 'tape':
      return { ...prefs, tape: value === 'printed' || value === 'clear' ? value : 'written' };
    case 'clockFormat':
      return { ...prefs, clockFormat: value === 'h12' || value === 'h24' ? value : 'auto' };
    case 'clockSeconds':
    case 'clock':
    case 'words':
    case 'tip':
    case 'coverPanel':
    case 'coverVolume':
    case 'tapeArt':
    case 'transport':
    case 'notes':
    case 'coverEdge':
    case 'hdArt':
    case 'motion':
    case 'pulse':
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
      const before = config.current[msg.key];
      if (msg.value === null) delete config.current[msg.key];
      else config.current[msg.key] = msg.value;

      // only a real change means the companion chose something: installing or updating rewrites every
      // declared default with the value that was already there, and that must not wipe a device setting
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
