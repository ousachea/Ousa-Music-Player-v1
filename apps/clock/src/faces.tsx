import { Fragment, useEffect, useRef, useState } from 'react';

import { CITIES, ink, type Palette, type Prefs } from './config';
import { dayShift, fields, readClock, readIn, type Zone } from './time';

export function ClockFace({ prefs, zone, at, pal }: { prefs: Prefs; zone: Zone; at: Date; pal: Palette }) {
  const parts = readClock(at, zone, prefs.format);
  const { h, m, s } = fields(at, zone);
  // a colon that blinks is how a clock says it is running; it is lit for the first half of a second
  const lit = !prefs.blink || at.getMilliseconds() < 500;

  // the world clock fills the screen with its own rows, so it keeps the date out of the way itself
  // the date belongs to the face, so it takes the same setting rather than staying small under a
  // clock that has grown to the screen
  const foot =
    prefs.style === 'world' ? null : (
      <div
        className="absolute inset-x-0 bottom-7 flex flex-col items-center gap-1 text-dim"
        style={{ fontSize: FOOT_SIZE[prefs.size] }}>
        {prefs.date && prefs.style !== 'digital-date' && <span>{parts.date}</span>}
        {!zone.synced && <span className="opacity-70">waiting for the phone's clock</span>}
      </div>
    );

  const stage = (children: React.ReactNode) => (
    <div className="grid h-full w-full place-items-center pt-7 pb-14">
      <Fit mode={prefs.size}>{children}</Fit>
      {foot}
    </div>
  );

  switch (prefs.style) {
    case 'analogue':
      return stage(<Analogue h={h} m={m} s={s} pal={pal} seconds={prefs.seconds} />);
    case 'flip':
      return stage(
        <div className="flex items-center gap-3">
          <Flip value={parts.hour} pal={pal} />
          <Flip value={parts.minute} pal={pal} />
          {prefs.seconds && <Flip value={parts.second} pal={pal} small />}
          {parts.dayPeriod && <span className="ml-1 self-end pb-3 font-mono text-title text-dim">{parts.dayPeriod}</span>}
        </div>,
      );
    case 'border':
      return (
        <>
          <Border
            // with the seconds off there is nothing for a second hand to say, so the border takes
            // the minute of the hour instead and moves once a second rather than sixty times
            fraction={prefs.seconds ? (s + at.getMilliseconds() / 1000) / 60 : (m * 60 + s) / 3600}
            quarter={prefs.rotate === '90' || prefs.rotate === '270'}
            pal={pal}
          />
          {stage(<Digits parts={parts} pal={pal} seconds={false} size="4.5rem" lit={lit} />)}
        </>
      );
    case 'minimal':
      return stage(
        <div className="flex items-baseline gap-2 font-display tracking-display">
          <span className="text-[7rem] leading-none font-light tabular-nums" style={{ color: pal.main }}>
            {parts.hour}
          </span>
          <span
            className="text-[7rem] leading-none font-light text-dim transition-opacity duration-150"
            style={{ opacity: lit ? 1 : 0.12 }}>
            :
          </span>
          <span className="text-[7rem] leading-none font-light tabular-nums" style={{ color: pal.second }}>
            {parts.minute}
          </span>
        </div>,
      );
    case 'digital-date':
      return stage(
        <div className="flex flex-col items-center gap-4">
          <Digits parts={parts} pal={pal} seconds={prefs.seconds} size="6rem" lit={lit} />
          <span className="rounded-full bg-white/6 px-5 py-1.5 text-title text-near">{parts.date}</span>
        </div>,
      );
    case 'world':
      return <World prefs={prefs} zone={zone} at={at} pal={pal} parts={parts} />;
    case 'binary':
      return stage(<Binary h={h} m={m} s={s} pal={pal} seconds={prefs.seconds} />);
    case 'word':
      return stage(<Word h={h} m={m} pal={pal} />);
    default:
      return stage(<Digits parts={parts} pal={pal} seconds={prefs.seconds} size="8rem" lit={lit} />);
  }
}

// ---------------------------------------------------------------------------

type Parts = ReturnType<typeof readClock>;

// the hour takes the first colour and the minute the second, so the two are told apart at a glance
function Digits({
  parts,
  pal,
  seconds,
  size,
  lit = true,
}: {
  parts: Parts;
  pal: Palette;
  seconds: boolean;
  size: string;
  lit?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1 font-mono tabular-nums" style={{ fontSize: size }}>
      <span className="leading-none" style={{ color: pal.main }}>
        {parts.hour}
      </span>
      <span
        className="leading-none transition-opacity duration-150"
        style={{ color: pal.main, opacity: lit ? 0.4 : 0.05 }}>
        :
      </span>
      <span className="leading-none" style={{ color: pal.second }}>
        {parts.minute}
      </span>
      {seconds && (
        <span className="ml-2 self-end pb-[0.35em] text-[0.31em] leading-none opacity-70" style={{ color: pal.second }}>
          {parts.second}
        </span>
      )}
      {parts.dayPeriod && <span className="ml-2 self-end pb-[0.45em] text-[0.16em] leading-none text-dim">{parts.dayPeriod}</span>}
    </div>
  );
}

const SIZES: Record<Exclude<Prefs['size'], 'fill'>, number> = { small: 0.78, medium: 1, large: 1.24 };
const FOOT_SIZE: Record<Prefs['size'], string> = {
  small: '0.75rem',
  medium: '0.875rem',
  large: '1.1rem',
  fill: '1.4rem',
};

// a face is drawn at the size it reads best and then scaled, so every one of them takes the same
// setting. fill measures what the face actually is and takes the largest scale the screen allows
function Fit({ mode, children }: { mode: Prefs['size']; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(1);

  useEffect(() => {
    if (mode !== 'fill') return;
    const node = box.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    // offsetWidth is the size before the transform, so measuring it here cannot chase its own tail
    const measure = () => {
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      if (!w || !h) return;
      // clientHeight counts the padding that keeps the date clear, so the box is measured without it
      const pad = getComputedStyle(parent);
      const room = {
        w: parent.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight),
        h: parent.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom),
      };
      setGrown(Math.max(0.4, Math.min((room.w * 0.96) / w, (room.h * 0.96) / h)));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    watch.observe(parent);
    return () => watch.disconnect();
  }, [mode]);

  const scale = mode === 'fill' ? grown : SIZES[mode];
  return (
    <div
      ref={box}
      className="transition-transform duration-500"
      style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
      {children}
    </div>
  );
}

// the seconds run round the edge of the screen itself, square into the corners: the frame is the
// second hand, drawn from the top and filling clockwise, so the time needs no second of its own
function Border({ fraction, quarter, pal }: { fraction: number; quarter: boolean; pal: Palette }) {
  const w = quarter ? 480 : 800;
  const h = quarter ? 800 : 480;
  const i = 3;
  const ring = `M ${w / 2} ${i} H ${w - i} V ${h - i} H ${i} V ${i} Z`;
  const done = Math.min(1, Math.max(0, fraction));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0 z-[1] h-full w-full">
      <defs>
        <linearGradient id="border-run" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={pal.main} />
          <stop offset="1" stopColor={pal.second} />
        </linearGradient>
      </defs>
      <path d={ring} fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="6" />
      <path d={ring} fill="none" stroke="url(#border-run)" strokeWidth="6" pathLength={1} strokeDasharray={`${done} 1`} />
    </svg>
  );
}

function Analogue({ h, m, s, pal, seconds }: { h: number; m: number; s: number; pal: Palette; seconds: boolean }) {
  const hand = (deg: number, len: number, width: number, colour: string, round = true) => (
    <line
      x1="100"
      y1="100"
      x2={100 + len * Math.sin((deg * Math.PI) / 180)}
      y2={100 - len * Math.cos((deg * Math.PI) / 180)}
      stroke={colour}
      strokeWidth={width}
      strokeLinecap={round ? 'round' : 'butt'}
    />
  );
  return (
    <svg viewBox="0 0 200 200" className="h-[18rem] w-[18rem]">
      <defs>
        <linearGradient id="dial" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={pal.main} />
          <stop offset="100%" stopColor={pal.second} />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="none" stroke="url(#dial)" strokeOpacity="0.35" strokeWidth="2" />
      {Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        const a = (i * 6 * Math.PI) / 180;
        const r1 = major ? 80 : 86;
        return (
          <line
            key={i}
            x1={100 + r1 * Math.sin(a)}
            y1={100 - r1 * Math.cos(a)}
            x2={100 + 90 * Math.sin(a)}
            y2={100 - 90 * Math.cos(a)}
            stroke={major ? pal.main : 'rgba(255,255,255,0.18)'}
            strokeOpacity={major ? 0.6 : 1}
            strokeWidth={major ? 3 : 1.5}
            strokeLinecap="round"
          />
        );
      })}
      {hand(((h % 12) + m / 60) * 30, 48, 7, '#efefef')}
      {hand((m + s / 60) * 6, 68, 5, pal.main)}
      {seconds && hand(s * 6, 76, 2, pal.second)}
      <circle cx="100" cy="100" r="5" fill="url(#dial)" />
    </svg>
  );
}

// matches the two 0.2s halves of the flip animation in index.css
const FLIP_MS = 400;

export function Flip({ value, pal, small }: { value: string; pal: Palette; small?: boolean }) {
  // the app re-renders twenty times a second, so the card has to remember what it is turning from
  // rather than try to infer it from a render
  const [card, setCard] = useState({ shown: value, from: null as string | null, turn: 0 });

  useEffect(() => {
    setCard(c => (c.shown === value ? c : { shown: value, from: c.shown, turn: c.turn + 1 }));
  }, [value]);

  useEffect(() => {
    if (card.from === null) return;
    const id = setTimeout(() => setCard(c => ({ ...c, from: null })), FLIP_MS);
    return () => clearTimeout(id);
  }, [card.from, card.turn]);

  // every leaf is a full-card digit clipped to one half, so all four cut the same glyph in the same
  // place. they stay direct children of the card because that is as far as its perspective reaches
  const leaf = (half: 'top' | 'bottom', v: string, cls: string, shade?: string) => (
    <div
      className={`absolute inset-x-0 h-1/2 overflow-hidden ${
        half === 'top' ? 'top-0 flip-top rounded-t-2xl' : 'bottom-0 flip-bottom rounded-b-2xl'
      } ${cls}`}>
      <div className={`absolute inset-x-0 grid h-[200%] place-items-center ${half === 'top' ? 'top-0' : 'bottom-0'}`}>
        <span className="tabular-nums" style={ink(pal)}>
          {v}
        </span>
      </div>
      {shade && <span className={`${shade} absolute inset-0 bg-black`} />}
    </div>
  );

  return (
    <div
      className={`flip-card relative rounded-2xl font-mono leading-none ring-1 ring-white/10 ${
        small ? 'h-24 w-20 text-[3rem]' : 'h-40 w-32 text-[5.5rem]'
      }`}>
      {leaf('top', card.shown, 'z-[1]')}
      {leaf('bottom', card.from ?? card.shown, 'z-[1]')}
      {card.from !== null && (
        <Fragment key={card.turn}>
          {leaf('bottom', card.shown, 'z-[2] flip-leaf flip-rise', 'flip-shade-out')}
          {leaf('top', card.from, 'z-[3] flip-leaf flip-fall', 'flip-shade-in')}
        </Fragment>
      )}
      <div className="absolute inset-x-0 top-1/2 z-[4] h-px bg-black/55" />
    </div>
  );
}

function World({
  prefs,
  zone,
  at,
  pal,
  parts,
}: {
  prefs: Prefs;
  zone: Zone;
  at: Date;
  pal: Palette;
  parts: Parts;
}) {
  const picks = [prefs.world1, prefs.world2, prefs.world3].map(k => CITIES[k] ?? null);
  const chosen = picks.filter((c): c is { label: string; tz: string } => c !== null);

  return (
    <div className="flex h-full w-full items-center gap-8 px-12 pt-7">
      <div className="flex flex-1 flex-col items-start gap-1">
        <span className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Here</span>
        <div className="flex items-baseline gap-1 font-mono text-[4.5rem] leading-none tabular-nums">
          <span style={{ color: pal.main }}>{parts.hour}</span>
          <span className="opacity-40" style={{ color: pal.main }}>
            :
          </span>
          <span style={{ color: pal.second }}>{parts.minute}</span>
          {parts.dayPeriod && <span className="ml-2 text-title text-dim">{parts.dayPeriod}</span>}
        </div>
        <span className="text-hint text-dim">{parts.date}</span>
        {!zone.synced && <span className="text-hint text-dim opacity-70">waiting for the phone's clock</span>}
      </div>

      <div className="flex w-[22rem] shrink-0 flex-col gap-2">
        {chosen.length === 0 && <span className="text-hint text-dim">pick some cities in this screen's settings</span>}
        {chosen.map(city => {
          const shift = dayShift(at, city.tz, zone.tz);
          return (
            <div key={city.tz} className="flex items-baseline justify-between rounded-xl bg-white/5 px-4 py-2.5">
              <span className="text-row-lg text-near">{city.label}</span>
              <span className="flex items-baseline gap-2">
                {shift !== 0 && <span className="text-hint text-dim">{shift > 0 ? 'tomorrow' : 'yesterday'}</span>}
                <span className="font-mono text-title tabular-nums" style={{ color: pal.main }}>
                  {readIn(at, city.tz, zone.locale, prefs.format)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// four rows of 8-4-2-1, one column per digit of the clock, which is how a binary clock is read:
// down a column for the digit, left to right for the time
function Binary({ h, m, s, pal, seconds }: { h: number; m: number; s: number; pal: Palette; seconds: boolean }) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const digits = (pad(h) + pad(m) + (seconds ? pad(s) : '')).split('').map(Number);
  // the tens of an hour never reach four, and no tens digit reaches eight; those dots are not drawn
  const ceiling = [2, 9, 5, 9, 5, 9];
  const bits = [8, 4, 2, 1];

  return (
    <div className="flex items-end gap-5">
      {digits.map((d, col) => (
        <div key={col} className="flex flex-col items-center gap-3">
          <div className="flex flex-col gap-3">
            {bits.map(bit => {
              const usable = bit <= ceiling[col];
              const on = usable && (d & bit) !== 0;
              return (
                <span
                  key={bit}
                  className="h-8 w-8 rounded-full transition-colors duration-200"
                  style={{
                    background: on ? (col % 2 === 0 ? pal.main : pal.second) : 'rgba(255,255,255,0.07)',
                    boxShadow: on ? `0 0 18px ${col % 2 === 0 ? pal.main : pal.second}55` : 'none',
                    opacity: usable ? 1 : 0.12,
                  }}
                />
              );
            })}
          </div>
          <span className="font-mono text-hint text-dim tabular-nums">{d}</span>
        </div>
      ))}
    </div>
  );
}

// a word clock reads a twelve hour dial however the rest of the app is set, because "seventeen
// forty-five" is not how anyone says it
const HOURS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const UNDER_TWENTY = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];

function minuteWords(m: number) {
  if (m === 0) return "o'clock";
  if (m < 10) return `oh ${UNDER_TWENTY[m]}`;
  if (m < 20) return UNDER_TWENTY[m];
  const unit = m % 10;
  return unit === 0 ? TENS[Math.floor(m / 10)] : `${TENS[Math.floor(m / 10)]}-${UNDER_TWENTY[unit]}`;
}

function Word({ h, m, pal }: { h: number; m: number; pal: Palette }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-display text-[4.25rem] leading-[1.05] font-semibold tracking-display uppercase" style={{ color: pal.main }}>
        {HOURS[h % 12]}
      </span>
      <span className="font-display text-[4.25rem] leading-[1.05] font-semibold tracking-display uppercase" style={{ color: pal.second }}>
        {minuteWords(m)}
      </span>
      <span className="mt-1 font-mono text-eyebrow tracking-[0.3em] text-dim uppercase">{h < 12 ? 'am' : 'pm'}</span>
    </div>
  );
}
