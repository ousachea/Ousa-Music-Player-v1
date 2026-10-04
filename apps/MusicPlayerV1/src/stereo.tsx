// a car head unit's dot matrix lcd across the whole screen, reading out the track a character cell at a
// time the way the real ones scroll, with the transport drawn on the glass in the same dots
import { memo, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Accent } from './artwork-color';
import type { ClockParts } from './clock';

export type Glow = 'album' | 'rainbow' | 'ice' | 'amber' | 'red' | 'green' | 'white';

export const GLOWS: Glow[] = ['album', 'rainbow', 'ice', 'amber', 'red', 'green', 'white'];

const GLOW_FILL: Record<Exclude<Glow, 'album'>, string> = {
  // the hue the rainbow starts from; the layer is turned round the wheel from here
  rainbow: '#ff3d5a',
  ice: '#62d4ff',
  amber: '#ffb238',
  red: '#ff4d4d',
  green: '#6dff9c',
  white: '#e6f0ff',
};

// rows top to bottom, five bits each with the leftmost dot as the high bit: the classic 5x7 lcd set
const ROWS: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 17, 31, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 17, 25, 21, 19, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '!': [4, 4, 4, 4, 0, 0, 4],
  '"': [10, 10, 10, 0, 0, 0, 0],
  '#': [10, 10, 31, 10, 31, 10, 10],
  $: [4, 15, 20, 14, 5, 30, 4],
  '%': [24, 25, 2, 4, 8, 19, 3],
  '&': [12, 18, 20, 8, 21, 18, 13],
  "'": [12, 4, 8, 0, 0, 0, 0],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  '*': [0, 4, 21, 14, 21, 4, 0],
  '+': [0, 4, 4, 31, 4, 4, 0],
  ',': [0, 0, 0, 0, 12, 4, 8],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  '/': [0, 1, 2, 4, 8, 16, 0],
  ':': [0, 12, 12, 0, 12, 12, 0],
  ';': [0, 12, 12, 0, 12, 4, 8],
  '<': [2, 4, 8, 16, 8, 4, 2],
  '=': [0, 0, 31, 0, 31, 0, 0],
  '>': [8, 4, 2, 1, 2, 4, 8],
  '?': [14, 17, 1, 2, 4, 0, 4],
  '@': [14, 17, 1, 13, 21, 21, 14],
  '[': [14, 8, 8, 8, 8, 8, 14],
  ']': [14, 2, 2, 2, 2, 2, 14],
  _: [0, 0, 0, 0, 0, 0, 31],
};

// each glyph as five columns of seven bits, bit zero the top row, which is how they are drawn
const GLYPHS: Record<string, number[]> = Object.fromEntries(
  Object.entries(ROWS).map(([ch, rows]) => [
    ch,
    [0, 1, 2, 3, 4].map(c => rows.reduce((m, row, r) => (row & (1 << (4 - c)) ? m | (1 << r) : m), 0)),
  ]),
);

// the panel only has capitals and plain punctuation, so accents fall away and typographic marks
// are swapped for the ones it does have
function toPanel(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[×]/g, 'X')
    .toUpperCase();
}

// a title in a script the panel has no cells for would come out as a row of gaps, so past this
// share of unknown characters the line is set in type instead
function drawable(text: string) {
  const chars = [...text];
  if (chars.length === 0) return true;
  return chars.filter(ch => GLYPHS[ch]).length / chars.length >= 0.7;
}

type Cells = number[][];

function cells(text: string): Cells {
  return [...text].map(ch => GLYPHS[ch] ?? GLYPHS[' ']);
}

// one cell is five dots and a gap column, and the unlit dots stay faintly visible as they do on the glass.
// the player re-renders on every progress tick, so the dots only rebuild when the cells themselves change
const Dots = memo(function Dots({ cells: shown, pitch, color, className }: { cells: Cells; pitch: number; color: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const dot = pitch * 0.8;
  const w = shown.length * 6 * pitch - pitch;
  const h = 7 * pitch;
  let lit = '';
  shown.forEach((cols, c) =>
    cols.forEach((m, x) => {
      for (let r = 0; r < 7; r++) if (m & (1 << r)) lit += `M${(c * 6 + x) * pitch} ${r * pitch}h${dot}v${dot}h${-dot}z`;
    }),
  );
  return (
    <svg
      width={Math.max(0, w)}
      height={h}
      viewBox={`0 0 ${Math.max(0, w)} ${h}`}
      className={`shrink-0 overflow-visible ${className ?? ''}`}
      style={{ willChange: 'transform' }}>
      <defs>
        <pattern id={id} width={pitch * 6} height={h} patternUnits="userSpaceOnUse">
          {[0, 1, 2, 3, 4].map(x =>
            [0, 1, 2, 3, 4, 5, 6].map(r => (
              <rect key={`${x}${r}`} x={x * pitch} y={r * pitch} width={dot} height={dot} fill={color} />
            )),
          )}
        </pattern>
      </defs>
      <rect width={w} height={h} fill={`url(#${id})`} opacity={0.085} />
      <path d={lit} fill={color} style={{ filter: `drop-shadow(0 0 ${pitch * 0.7}px ${color})` }} />
    </svg>
  );
});

// the line steps a whole cell at a time, holding at the start of each pass so it can be read
const STEP_MS = 300;
const HOLD_STEPS = 6;
const LOOP_GAP = 3;

function Line({
  text,
  chars,
  pitch,
  color,
  motion,
}: {
  text: string;
  chars: number;
  pitch: number;
  color: string;
  motion: boolean;
}) {
  const panel = useMemo(() => toPanel(text), [text]);
  const all = useMemo(() => cells(panel), [panel]);
  const fits = all.length <= chars;
  const loop = useMemo(() => [...all, ...cells(' '.repeat(LOOP_GAP))], [all]);
  const [at, setAt] = useState(0);

  useEffect(() => {
    setAt(0);
    if (fits || !motion) return;
    let hold = HOLD_STEPS;
    const timer = setInterval(() => {
      if (hold > 0) return void hold--;
      setAt(prev => {
        const next = (prev + 1) % loop.length;
        if (next === 0) hold = HOLD_STEPS;
        return next;
      });
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [loop, fits, motion]);

  const shown = useMemo<Cells>(() => {
    if (!fits) return Array.from({ length: chars }, (_, i) => loop[(at + i) % loop.length]);
    // a short line sits in the middle of the glass, padded a whole cell at a time
    const pad = Math.floor((chars - all.length) / 2);
    return [...cells(' '.repeat(pad)), ...all, ...cells(' '.repeat(chars - all.length - pad))];
  }, [fits, chars, loop, at, all]);

  if (!drawable(panel)) {
    return (
      <div
        className="truncate text-center font-mono font-bold uppercase"
        style={{ color, height: 7 * pitch, lineHeight: `${7 * pitch}px`, fontSize: 6 * pitch, textShadow: `0 0 ${pitch}px ${color}` }}>
        {text}
      </div>
    );
  }

  return <Dots cells={shown} pitch={pitch} color={color} />;
}

function Label({ text, pitch, color }: { text: string; pitch: number; color: string }) {
  const shown = useMemo(() => cells(toPanel(text)), [text]);
  return <Dots cells={shown} pitch={pitch} color={color} />;
}

// there is no audio level to read, so the meter makes its own: louder at the bass end, falling back a
// segment at a time the way a peak meter does, and flat while the track is paused
const Spectrum = memo(function Spectrum({
  bars,
  playing,
  motion,
  color,
  height,
}: {
  bars: number;
  playing: boolean;
  motion: boolean;
  color: string;
  height: number;
}) {
  const segs = 8;
  const rest = useMemo(
    () => Array.from({ length: bars }, (_, i) => Math.max(2, Math.round(segs * (0.55 + 0.35 * Math.sin(i * 0.9 + 1)) - i / bars))),
    [bars],
  );
  const [levels, setLevels] = useState<number[]>(rest);

  useEffect(() => {
    if (!playing) return setLevels(Array(bars).fill(1));
    if (!motion) return setLevels(rest);
    const timer = setInterval(() => {
      setLevels(prev =>
        Array.from({ length: bars }, (_, i) => {
          const lean = 1 - (i / bars) * 0.5;
          const target = Math.round((0.3 + Math.random() * 0.7) * lean * segs);
          return Math.max(target, (prev[i] ?? 0) - 1);
        }),
      );
    }, 120);
    return () => clearInterval(timer);
  }, [bars, playing, motion, rest]);

  const seg = height / segs;
  const bw = seg * 1.25;
  const gap = seg * 0.5;
  const w = bars * (bw + gap) - gap;
  let ghost = '';
  let lit = '';
  for (let i = 0; i < bars; i++) {
    for (let s = 0; s < segs; s++) {
      const piece = `M${i * (bw + gap)} ${height - (s + 1) * seg}h${bw}v${seg * 0.72}h${-bw}z`;
      ghost += piece;
      if (s < (levels[i] ?? 0)) lit += piece;
    }
  }
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} className="shrink-0 overflow-visible" style={{ willChange: 'transform' }}>
      <path d={ghost} fill={color} opacity={0.085} />
      <path d={lit} fill={color} style={{ filter: `drop-shadow(0 0 ${seg * 0.6}px ${color})` }} />
    </svg>
  );
});

function Badge({ on, color, ink, children }: { on: boolean; color: string; ink: string; children: ReactNode }) {
  return (
    <span
      className="rounded-[3px] px-1.5 font-mono text-[0.72rem] leading-[1.25rem] font-bold tracking-wide transition-opacity duration-300"
      style={{
        backgroundColor: on ? color : 'transparent',
        color: on ? ink : color,
        boxShadow: `inset 0 0 0 1.5px ${color}`,
        opacity: on ? 1 : 0.22,
        filter: on ? `drop-shadow(0 0 4px ${color})` : undefined,
      }}>
      {children}
    </span>
  );
}

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Bluetooth({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M7 7l10 10-5 4V3l5 4L7 17" {...STROKE} />
    </svg>
  );
}

// pixel art drawn on the same dot grid as the type, one string per row with x for a lit dot
function Bitmap({ rows, pitch, color, className }: { rows: string[]; pitch: number; color: string; className?: string }) {
  const dot = pitch * 0.8;
  const w = rows[0].length * pitch;
  const h = rows.length * pitch;
  let d = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => c === 'x' && (d += `M${x * pitch} ${y * pitch}h${dot}v${dot}h${-dot}z`)));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`shrink-0 overflow-visible ${className ?? ''}`}>
      <path d={d} fill={color} style={{ filter: `drop-shadow(0 0 ${pitch * 0.7}px ${color})` }} />
    </svg>
  );
}

const PREV = ['x....x', 'x...xx', 'x..xxx', 'x.xxxx', 'x..xxx', 'x...xx', 'x....x'];
const NEXT = PREV.map(row => [...row].reverse().join(''));
const PLAY = ['x....', 'xx...', 'xxx..', 'xxxx.', 'xxx..', 'xx...', 'x....'];
const PAUSE = ['xx.xx', 'xx.xx', 'xx.xx', 'xx.xx', 'xx.xx', 'xx.xx', 'xx.xx'];

// the notes that float over this style, set on the same grid as everything else on the glass
export const PIXEL_NOTES = [
  ['...x...', '...xx..', '...x.x.', '...x..x', '...x...', '.xxx...', 'xxxx...', 'xxxx...', '.xx....'],
  ['..xxxxx', '..x...x', '..x...x', '..x...x', 'xxx.xxx', 'xxx.xxx', '.x...x.'],
  ['...x', '...x', '...x', '...x', '.xxx', 'xxxx', '.xx.'],
];

export function PixelNote({ kind, size, color }: { kind: number; size: number; color: string }) {
  const rows = PIXEL_NOTES[kind % PIXEL_NOTES.length];
  return <Bitmap rows={rows} pitch={size / 5.5} color={color} />;
}

export function glowColor(glow: Glow, accent: Accent | null) {
  return glow === 'album' ? (accent?.fill ?? GLOW_FILL.ice) : GLOW_FILL[glow];
}

function Control({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid h-full flex-1 place-items-center transition-[opacity,transform] duration-150 active:scale-90 active:opacity-60">
      {children}
    </button>
  );
}

function clockText(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// what the second line reads; the display key steps through them as it does on a head unit
type Page = 'artist' | 'album' | 'time';
const PAGES: Page[] = ['artist', 'album', 'time'];

export function Stereo({
  title,
  artist,
  album,
  glow,
  day,
  accent,
  playing,
  motion,
  upright,
  shuffle,
  repeat,
  elapsed,
  duration,
  progress,
  remaining,
  wallClock,
  volume,
  showVolume,
  showTransport,
  onToggle,
  onPrev,
  onNext,
  onDayNight,
}: {
  title: string;
  artist: string;
  album: string | null;
  glow: Glow;
  // a daylight display: dark dots on pale glass with no glow, the way an lcd reads in sun
  day: boolean;
  accent: Accent | null;
  playing: boolean;
  motion: boolean;
  upright: boolean;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  elapsed: number;
  duration: number;
  progress: number;
  remaining: boolean;
  wallClock: ClockParts | null;
  volume: { level: number; muted: boolean } | null;
  showVolume: boolean;
  showTransport: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDayNight: () => void;
}) {
  const lit = glowColor(glow, accent);
  // the hue stays, taken down far enough to read as ink on the pale glass
  const color = day ? `color-mix(in oklab, ${lit} 58%, #0b0d0f)` : lit;
  const paper = day ? '#dde2da' : '#030405';
  const [page, setPage] = useState<Page>('artist');
  const frame = useId().replace(/[^a-zA-Z0-9]/g, '');
  const glass = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = glass.current;
    if (!el) return;
    const watch = new ResizeObserver(() => setWidth(el.clientWidth));
    watch.observe(el);
    setWidth(el.clientWidth);
    return () => watch.disconnect();
  }, []);

  // the title takes as many cells as fit at about eight pixels a dot, sized to fill the glass exactly,
  // and the line under it runs at a smaller pitch with more cells
  const chars = Math.max(6, Math.round(width / (6 * 8)));
  const pitch = width > 0 ? width / (chars * 6 - 1) : 8;
  const subChars = Math.max(8, Math.round(width / (6 * 5)));
  const subPitch = width > 0 ? width / (subChars * 6 - 1) : 5;
  const top = Math.max(4, pitch * 0.8);
  const keyPitch = Math.max(4, pitch * 0.7);

  const level = volume ? Math.round((volume.muted ? 0 : volume.level) * 100) : null;
  const main = showVolume ? `VOLUME ${level ?? '--'}` : title;
  const sub =
    page === 'artist'
      ? artist
      : page === 'album'
        ? (album ?? 'NO ALBUM')
        : `${clockText(elapsed)} ${duration ? (remaining ? `-${clockText(duration - elapsed)}` : clockText(duration)) : '--:--'}`;
  const label = showVolume ? 'VOL' : 'BT';
  const nextPage = () => setPage(p => PAGES[(PAGES.indexOf(p) + 1) % PAGES.length]);
  const done = Math.min(1, Math.max(0, progress));

  return (
    // a layer of its own, so the notes drifting over the glass do not make every glowing dot repaint
    <div
      className={`absolute inset-0 overflow-hidden ${upright ? 'px-6 pt-8 pb-11' : 'px-8 pt-6 pb-10'} ${
        glow === 'rainbow' && motion ? 'rainbow' : ''
      } ${day ? 'stereo-day' : ''}`}
      style={{ willChange: 'transform', background: paper }}>
      {/* the backlight bleeding through the glass, and a reflection across it */}
      <div className="pointer-events-none absolute inset-0" style={{ background: color, opacity: day ? 0.07 : 0.05 }} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(165deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.012) 34%, transparent 35%)' }}
      />

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-end justify-between gap-3">
          <div className="shrink-0">
            <Label text={label} pitch={top} color={color} />
          </div>
          {/* turned on its side the row is too narrow for the meter and the clock both, and the clock wins */}
          {!upright && (
            <div className="flex flex-1 justify-center">
              <Spectrum bars={16} playing={playing} motion={motion} color={color} height={7 * top} />
            </div>
          )}
          {/* the clock is the light switch: a head unit dims its display from the same corner */}
          <button
            aria-label={day ? 'dark display' : 'light display'}
            onClick={onDayNight}
            className="-m-2 flex shrink-0 items-start justify-end gap-2 p-2 transition-transform duration-150 active:scale-95">
            {wallClock && (
              <>
                {wallClock.dayPeriod && (
                  <span
                    className="font-display text-[0.95rem] leading-none font-bold"
                    style={{ color, filter: `drop-shadow(0 0 4px ${color})` }}>
                    {wallClock.dayPeriod.toUpperCase()}
                  </span>
                )}
                <Label text={`${wallClock.hour}${wallClock.colon ? ':' : ' '}${wallClock.minute}`} pitch={top} color={color} />
              </>
            )}
          </button>
        </div>

        <div ref={glass} className="flex w-full flex-col gap-5">
          {width > 0 && (
            <>
              <Line text={main} chars={chars} pitch={pitch} color={color} motion={motion} />
              <button aria-label="change what the second line shows" onClick={nextPage} className="block w-full">
                <Line text={sub} chars={subChars} pitch={subPitch} color={color} motion={motion} />
              </button>
            </>
          )}
        </div>

        {/* the transport is drawn on the glass in the same dots as everything else */}
        {showTransport && (
          <div className="flex h-14 items-stretch">
            <Control label="previous" onClick={onPrev}>
              <Bitmap rows={PREV} pitch={keyPitch} color={color} />
            </Control>
            <Control label={playing ? 'pause' : 'play'} onClick={onToggle}>
              <Bitmap rows={playing ? PAUSE : PLAY} pitch={keyPitch} color={color} />
            </Control>
            <Control label="next" onClick={onNext}>
              <Bitmap rows={NEXT} pitch={keyPitch} color={color} />
            </Control>
            <Control label="display" onClick={nextPage}>
              <Label text="DISP" pitch={keyPitch * 0.75} color={color} />
            </Control>
          </div>
        )}

        <div className="relative flex h-6 items-center gap-2.5">
          <Badge on color={color} ink={paper}>
            BT
          </Badge>
          <span style={{ color, filter: `drop-shadow(0 0 3px ${color})` }}>
            <Bluetooth className="h-[18px] w-[18px]" />
          </span>
          <span style={{ color, filter: `drop-shadow(0 0 3px ${color})` }}>
            <svg viewBox="0 0 12 12" className="h-3 w-3">
              {playing ? <path d="M2 1l9 5-9 5z" fill="currentColor" /> : <path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor" />}
            </svg>
          </span>
          {/* the frame along the bottom of the glass rises over the middle; it fills as the song plays */}
          <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-5 min-w-0 flex-1 overflow-visible">
            <path
              d="M0 9 H40 L44 1 H56 L60 9 H100"
              fill="none"
              stroke={color}
              strokeOpacity={0.18}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <clipPath id={`${frame}-c`}>
              <rect x={-1} y={-2} width={done * 100 + 1} height={14} />
            </clipPath>
            <path
              d="M0 9 H40 L44 1 H56 L60 9 H100"
              fill="none"
              stroke={color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              clipPath={`url(#${frame}-c)`}
              style={{ filter: `drop-shadow(0 0 3px ${color})` }}
            />
          </svg>
          <Badge on={shuffle} color={color} ink={paper}>
            RDM
          </Badge>
          <Badge on={repeat !== 'off'} color={color} ink={paper}>
            {repeat === 'one' ? 'RPT 1' : 'RPT'}
          </Badge>
        </div>
      </div>
    </div>
  );
}
