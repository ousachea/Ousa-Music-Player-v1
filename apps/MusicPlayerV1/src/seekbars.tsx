// colours arrive as hsl(), so any transparency goes through color-mix rather than a hex suffix.
// the seek bars past the plain line and the wave. each only draws: the player wraps it in the one element that turns a
// touch into a position, so dragging and the turned screen work the same for every kind
import { useEffect, useId, useRef, useState } from 'react';

type Look = { progress: number; playing: boolean; dot: boolean; tint: string; tint2: string };

const clamp = (n: number) => Math.min(1, Math.max(0, n));
// the unplayed part in a faint take on the tint rather than white, so it still shows on a light page
const faint = (tint: string) => `color-mix(in srgb, ${tint} 35%, transparent)`;

function useWidth() {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!box.current) return;
    const measure = () => box.current && setWidth(box.current.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  return [box, width] as const;
}

// a row of lit segments, like a level meter or a tape counter's window; the one at the playhead breathes while playing
export function Cells({ progress, playing, tint, tint2 }: Look) {
  const count = 28;
  const lit = clamp(progress) * count;
  return (
    <div className="flex h-3 w-full gap-[3px]">
      {Array.from({ length: count }, (_, i) => {
        const on = i < Math.floor(lit);
        const head = i === Math.floor(lit) && lit < count;
        return (
          <div
            key={i}
            className={`h-full flex-1 rounded-[2px] transition-colors duration-300 ${head && playing ? 'animate-pulse' : ''}`}
            style={{
              background: on ? `color-mix(in oklab, ${tint} ${100 - (i / count) * 100}%, ${tint2})` : head ? `color-mix(in srgb, ${tint} 40%, transparent)` : 'rgba(255,255,255,0.12)',
            }}
          />
        );
      })}
    </div>
  );
}

// beads on a string: the played ones full, the rest hollow, the playhead a larger bead
export function Dots({ progress, dot, tint, tint2 }: Look) {
  const [box, width] = useWidth();
  const count = Math.max(8, Math.floor(width / 14));
  const at = clamp(progress) * (count - 1);
  return (
    <div ref={box} className="flex h-4 w-full items-center justify-between">
      {Array.from({ length: count }, (_, i) => {
        const head = dot && Math.round(at) === i;
        const on = i <= at;
        return (
          <div
            key={i}
            className="shrink-0 rounded-full transition-all duration-300"
            style={{
              width: head ? 12 : 6,
              height: head ? 12 : 6,
              background: on ? `color-mix(in oklab, ${tint} ${100 - (i / count) * 100}%, ${tint2})` : 'transparent',
              boxShadow: on ? undefined : 'inset 0 0 0 1.5px rgba(255,255,255,0.28)',
            }}
          />
        );
      })}
    </div>
  );
}

// a thin neon tube: the played length glows in the tint and the playhead is a bright point of light
export function Glow({ progress, playing, dot, tint, tint2 }: Look) {
  const at = `${clamp(progress) * 100}%`;
  return (
    <div className="relative h-[2px] w-full rounded-full bg-white/12">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-linear"
        style={{ width: at, background: `linear-gradient(90deg, ${tint}, ${tint2})`, boxShadow: `0 0 8px ${tint2}, 0 0 18px color-mix(in srgb, ${tint2} 53%, transparent)` }}
      />
      {dot && (
        <div
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ${playing ? 'animate-pulse' : ''}`}
          style={{ left: at, boxShadow: `0 0 10px 3px ${tint2}` }}
        />
      )}
    </div>
  );
}

// ink drawn by hand: a line that wanders a little, the played part inked over in the tint and the rest pencilled in
export function Hand({ progress, dot, tint }: Look) {
  const [box, width] = useWidth();
  // the settings show several bars at once, so each clip needs an id of its own
  const clip = useId();
  const height = 18;
  const mid = height / 2;
  // the wobble is fixed, so the line does not redraw itself as the song plays
  const count = Math.max(2, Math.floor(width / 18) + 1);
  const points = Array.from({ length: count }, (_, i) => {
    const x = (i / (count - 1)) * width;
    const y = mid + Math.sin(i * 1.7) * 1.6 + Math.sin(i * 0.6 + 1) * 1.2;
    return [x, y] as const;
  });
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const played = clamp(progress) * width;
  const headY = points.length > 1 ? points[Math.min(points.length - 1, Math.round((played / Math.max(1, width)) * (points.length - 1)))][1] : mid;
  return (
    <div ref={box} className="h-[18px] w-full">
      <svg width="100%" height={height} viewBox={`0 0 ${Math.max(1, width)} ${height}`} className="overflow-visible">
        <defs>
          <clipPath id={clip}>
            <rect x="0" y="-4" width={played} height={height + 8} />
          </clipPath>
        </defs>
        <path d={d} stroke={faint(tint)} strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round" fill="none" />
        <path d={d} clipPath={`url(#${clip})`} stroke={tint} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {dot && <circle cx={played} cy={headY} r="5.5" fill="none" stroke={tint} strokeWidth="2" />}
      </svg>
    </div>
  );
}

// a chunky rounded bar, filled from the left, with a knob at the playhead
export function Pill({ progress, dot, tint, tint2 }: Look) {
  const at = `${clamp(progress) * 100}%`;
  return (
    <div className="relative h-2.5 w-full rounded-full" style={{ background: faint(tint) }}>
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-linear"
        style={{ width: at, background: `linear-gradient(90deg, ${tint}, ${tint2})` }}
      />
      {dot && (
        <div
          className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
          style={{ left: at }}
        />
      )}
    </div>
  );
}

// a ruler: a tick every few pixels, a taller one every fifth, inked up to the playhead, with a pointer over it
export function Ruler({ progress, dot, tint }: Look) {
  const [box, width] = useWidth();
  const count = Math.max(10, Math.floor(width / 7));
  const at = clamp(progress);
  return (
    <div ref={box} className="relative flex h-4 w-full items-end justify-between">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="w-[1.5px] shrink-0 rounded-full"
          style={{ height: i % 5 === 0 ? 14 : 7, background: i / (count - 1) <= at ? tint : faint(tint) }}
        />
      ))}
      {dot && (
        <div
          className="absolute -top-2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent"
          style={{ left: `${at * 100}%`, borderTopColor: tint }}
        />
      )}
    </div>
  );
}

// a heartbeat trace: flat with a beat every so often, the played part drawn in the tint
export function Pulse({ progress, dot, tint }: Look) {
  const [box, width] = useWidth();
  const clip = useId();
  const height = 22;
  const mid = height / 2;
  const beat = 56;
  let d = `M 0 ${mid}`;
  for (let x = 0; x < width; x += beat) {
    const b = x + beat * 0.45;
    // a beat that would run past the end is left off, so the trace never spills out of its box
    if (b + 19 <= width) d += ` L ${b} ${mid} L ${b + 4} ${mid - 3} L ${b + 8} ${mid + 2} L ${b + 11} ${mid - 9} L ${b + 15} ${mid + 7} L ${b + 19} ${mid}`;
    d += ` L ${Math.min(width, x + beat)} ${mid}`;
  }
  const played = clamp(progress) * width;
  return (
    <div ref={box} className="h-[22px] w-full">
      <svg width="100%" height={height} viewBox={`0 0 ${Math.max(1, width)} ${height}`} className="overflow-visible">
        <defs>
          <clipPath id={clip}>
            <rect x="0" y="-4" width={played} height={height + 8} />
          </clipPath>
        </defs>
        <path d={d} stroke={faint(tint)} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <path d={d} clipPath={`url(#${clip})`} stroke={tint} strokeWidth="2.2" strokeLinejoin="round" fill="none" />
        {dot && <circle cx={played} cy={mid} r="3.5" fill={tint} />}
      </svg>
    </div>
  );
}

// a candy-striped bar whose stripes run while the song plays
export function Stripes({ progress, playing, tint, tint2 }: Look) {
  const at = `${clamp(progress) * 100}%`;
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/12">
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-linear ${playing ? 'animate-stripes' : ''}`}
        style={{
          width: at,
          backgroundColor: tint,
          backgroundImage: `repeating-linear-gradient(-45deg, transparent 0 6px, ${tint2} 6px 12px)`,
          backgroundSize: '17px 17px',
        }}
      />
    </div>
  );
}
