// a pocket music player held sideways: a small lcd on the left carrying the cover, the track and the
// bar, and a click wheel on the right whose four sides are the transport and whose ring turns the volume
import { useRef, useState, type PointerEvent } from 'react';

import type { Accent } from './artwork-color';
import type { ClockParts } from './clock';

type Rotate = 0 | 90 | 180 | 270;

// a turn of this many degrees round the ring is one step of volume, about a click of a real wheel
const STEP_DEG = 15;
const STEP_LEVEL = 0.04;

type Skin = { body: string; wheel: string; hub: string; glyph: string; edge: string; swatch: string };

/** a body in one colour: the anodised gradient, a wheel a shade lighter, its hub, and glyphs that read on it */
function anodised(base: string): Skin {
  const mix = (pct: number, to: string) => `color-mix(in oklab, ${base} ${pct}%, ${to})`;
  return {
    body: `linear-gradient(180deg, ${mix(78, '#ffffff')} 0%, ${base} 48%, ${mix(80, '#000000')} 100%)`,
    wheel: `radial-gradient(circle at 50% 35%, ${mix(35, '#ffffff')} 0%, ${mix(22, '#f4f4f6')} 55%, ${mix(30, '#e2e3e6')} 100%)`,
    hub: `linear-gradient(180deg, ${mix(55, '#ffffff')} 0%, ${mix(70, '#ffffff')} 100%)`,
    // the wheel is pale whatever the body, so its glyphs are a dark shade of the body's colour
    glyph: mix(65, '#3a3a3a'),
    edge: 'rgba(0,0,0,0.1)',
    swatch: base,
  };
}

const BODIES = {
  silver: {
    body: 'linear-gradient(180deg, #ededef 0%, #d9dadd 48%, #c9cacd 100%)',
    wheel: 'radial-gradient(circle at 50% 35%, #ffffff 0%, #f3f3f5 55%, #e4e5e8 100%)',
    hub: 'linear-gradient(180deg, #e3e4e6 0%, #d2d3d6 100%)',
    glyph: '#a3a6ab',
    edge: 'rgba(0,0,0,0.08)',
    swatch: '#d9dadd',
  },
  black: {
    body: 'linear-gradient(180deg, #3a3b3f 0%, #2a2b2e 48%, #1d1e21 100%)',
    wheel: 'radial-gradient(circle at 50% 35%, #4a4b50 0%, #3c3d41 55%, #313236 100%)',
    hub: 'linear-gradient(180deg, #2f3034 0%, #25262a 100%)',
    glyph: '#c6c8cc',
    edge: 'rgba(255,255,255,0.08)',
    swatch: '#2a2b2e',
  },
  // the anodised colours the small players came in
  blue: anodised('#3f7fd6'),
  pink: anodised('#e46aa5'),
  green: anodised('#5fae4a'),
  red: anodised('#c8322f'),
  gold: anodised('#c9a45c'),
} satisfies Record<string, Skin>;

/** the order the screen's colour button steps through; album takes the cover's own colour */
export const POCKET_BODIES = ['silver', 'black', 'blue', 'pink', 'green', 'red', 'gold', 'album'] as const;

export type PocketBody = (typeof POCKET_BODIES)[number];

function skinFor(body: PocketBody, accent: Accent | null): Skin {
  if (body === 'album') return accent ? anodised(accent.fill) : BODIES.silver;
  return BODIES[body];
}

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// the stage is turned with a css transform, so a pointer is turned back by the same angle to land in
// the element's own frame, measured from its centre
function local(e: PointerEvent<HTMLElement>, el: HTMLElement, rotate: Rotate) {
  const box = el.getBoundingClientRect();
  const sx = e.clientX - (box.left + box.width / 2);
  const sy = e.clientY - (box.top + box.height / 2);
  const t = (rotate * Math.PI) / 180;
  return { x: Math.cos(t) * sx + Math.sin(t) * sy, y: -Math.sin(t) * sx + Math.cos(t) * sy };
}

export function Pocket({
  artUrl,
  title,
  artist,
  accent,
  body,
  onBody,
  playing,
  upright,
  rotate,
  progress,
  elapsed,
  duration,
  remaining,
  volume,
  showVolume,
  wallClock,
  onToggle,
  onPrev,
  onNext,
  onMenu,
  onSeek,
  onVolume,
  artOnly,
  onArtOnly,
}: {
  artUrl: string | null;
  title: string;
  artist: string;
  accent: Accent | null;
  body: PocketBody;
  /** the colour button on the screen: the next finish */
  onBody: () => void;
  // held above the player, which is rebuilt on every track, so the cover stays up from song to song
  artOnly: boolean;
  onArtOnly: (on: boolean) => void;
  playing: boolean;
  upright: boolean;
  rotate: Rotate;
  progress: number;
  elapsed: number;
  duration: number;
  remaining: boolean;
  volume: { level: number; muted: boolean } | null;
  showVolume: boolean;
  wallClock: ClockParts | null;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onMenu: () => void;
  onSeek: (ratio: number) => void;
  onVolume: (level: number) => void;
}) {
  const skin = skinFor(body, accent);
  return (
    <div
      className={`absolute inset-0 flex items-center justify-evenly overflow-hidden ${upright ? 'flex-col' : ''}`}
      style={{ background: skin.body, transition: 'background 700ms' }}>
      {/* brushed finish: fine horizontal grain over the gradient */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 1px, rgba(0,0,0,0.03) 1px 2px, rgba(0,0,0,0) 2px 3px)',
        }}
      />

      <Screen
        artUrl={artUrl}
        title={title}
        artist={artist}
        accent={accent}
        playing={playing}
        upright={upright}
        rotate={rotate}
        progress={progress}
        elapsed={elapsed}
        duration={duration}
        remaining={remaining}
        volume={volume}
        showVolume={showVolume}
        wallClock={wallClock}
        onSeek={onSeek}
        artOnly={artOnly}
        onArt={() => onArtOnly(!artOnly)}
        swatch={body === 'album' ? 'conic-gradient(#e46aa5, #3f7fd6, #5fae4a, #c9a45c, #e46aa5)' : skin.swatch}
        onBody={onBody}
      />

      <Wheel
        skin={skin}
        upright={upright}
        rotate={rotate}
        playing={playing}
        level={volume?.level ?? 0}
        onToggle={onToggle}
        onPrev={onPrev}
        onNext={onNext}
        onMenu={onMenu}
        onVolume={onVolume}
      />
    </div>
  );
}

function Screen({
  artUrl,
  title,
  artist,
  accent,
  playing,
  upright,
  rotate,
  progress,
  elapsed,
  duration,
  remaining,
  volume,
  showVolume,
  wallClock,
  onSeek,
  artOnly,
  onArt,
  swatch,
  onBody,
}: {
  artUrl: string | null;
  title: string;
  artist: string;
  accent: Accent | null;
  playing: boolean;
  upright: boolean;
  rotate: Rotate;
  progress: number;
  elapsed: number;
  duration: number;
  remaining: boolean;
  volume: { level: number; muted: boolean } | null;
  showVolume: boolean;
  wallClock: ClockParts | null;
  onSeek: (ratio: number) => void;
  artOnly: boolean;
  onArt: () => void;
  /** the body's colour, shown on the button that changes it */
  swatch: string;
  onBody: () => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    if (!bar.current) return;
    const { x } = local(e, bar.current, rotate);
    onSeek(Math.min(1, Math.max(0, 0.5 + x / bar.current.offsetWidth)));
  };
  const at = Math.min(1, Math.max(0, progress));
  const level = volume?.muted ? 0 : (volume?.level ?? 0);
  return (
    <div
      onClick={onArt}
      className={`relative shrink-0 cursor-pointer rounded-[18px] bg-[#0c0c0d] p-2.5 shadow-[0_2px_0_rgba(255,255,255,0.5),inset_0_2px_6px_rgba(0,0,0,0.6)] ${
        upright ? 'h-[320px] w-[424px]' : 'h-[calc(100%-40px)] w-[470px]'
      }`}>
      <div className="relative h-full w-full overflow-hidden rounded-[9px] bg-[#6b6578]">
        {/* the lcd takes its light from the cover, blurred into a wash the type reads over */}
        {artUrl && (
          <img src={artUrl} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl saturate-[0.8]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-black/15 to-black/35" />
        {/* the glass: a faint sheen across the top third, the way a plastic window catches light */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/14 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-[18px]">
          <div className="flex min-h-0 flex-1 items-center gap-5">
            <div className={`aspect-square shrink-0 ${upright ? 'h-[200px]' : 'h-[236px]'} overflow-hidden rounded-[6px] shadow-[0_6px_18px_rgba(0,0,0,0.35)]`}>
              {artUrl ? (
                <img src={artUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-white/15" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-3 font-body text-[1.75rem] leading-[1.15] font-bold break-words text-white">
                {title}
              </div>
              <div className="mt-1.5 line-clamp-2 font-body text-[1.0625rem] leading-snug text-white/75">{artist}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-[0.9375rem] text-white tabular-nums">
            {showVolume ? (
              <>
                <Speaker className="h-4 w-4 shrink-0 opacity-80" waves={0} />
                <div className="relative h-[14px] flex-1 overflow-hidden rounded-full bg-white/25">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-white/90 transition-[width] duration-150"
                    style={{ width: `${level * 100}%` }}
                  />
                </div>
                <Speaker className="h-4 w-4 shrink-0 opacity-80" waves={2} />
              </>
            ) : (
              <>
                <span className="w-11 shrink-0">{clock(elapsed)}</span>
                <div
                  ref={bar}
                  className="relative -my-3 flex-1 cursor-pointer py-3"
                  onPointerDown={pick}
                  onPointerMove={e => e.buttons === 1 && pick(e)}
                  // seeking is not a request for the artwork
                  onClick={e => e.stopPropagation()}>
                  <div className="relative h-[14px] overflow-hidden rounded-full bg-white/25">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${at * 100}%`,
                        background: accent
                          ? `linear-gradient(90deg, color-mix(in oklab, ${accent.soft} 55%, white), white)`
                          : 'rgba(255,255,255,0.9)',
                      }}
                    />
                  </div>
                </div>
                <span className="w-11 shrink-0 text-right">
                  {duration ? (remaining ? `-${clock(duration - elapsed)}` : clock(duration)) : '--:--'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* the body's colour, as a small dot in the corner: each tap steps to the next finish. its own tap, not the
            screen's, which would turn the screen over to the artwork */}
        <button
          aria-label="body colour"
          onClick={e => {
            e.stopPropagation();
            onBody();
          }}
          className="absolute top-1.5 left-2 grid h-7 w-7 place-items-center rounded-full transition-transform active:scale-90">
          <span className="h-3.5 w-3.5 rounded-full ring-2 ring-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.5)]" style={{ background: swatch }} />
        </button>

        {/* a status corner the way the small screens had one: the clock, and play or pause */}
        <div className="absolute top-2 right-3 flex items-center gap-1.5 font-mono text-[0.6875rem] text-white/80 tabular-nums">
          {wallClock && (
            <span>
              {wallClock.hour}:{wallClock.minute}
              {wallClock.dayPeriod && <span className="ml-0.5">{wallClock.dayPeriod}</span>}
            </span>
          )}
          <span className="text-[0.625rem]">{playing ? '▶' : '❚❚'}</span>
        </div>

        {/* the cover alone on the glass, over a blur of itself; another tap brings the track back */}
        {artOnly && (
          <div className="absolute inset-0 animate-pop overflow-hidden bg-black">
            {artUrl ? (
              <>
                <img src={artUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />
                <img src={artUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
              </>
            ) : (
              <span className="absolute inset-0 grid place-items-center font-body text-title text-white/60">no artwork</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Wheel({
  skin,
  upright,
  rotate,
  playing,
  level,
  onToggle,
  onPrev,
  onNext,
  onMenu,
  onVolume,
}: {
  skin: Skin;
  upright: boolean;
  rotate: Rotate;
  playing: boolean;
  level: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onMenu: () => void;
  onVolume: (level: number) => void;
}) {
  const ring = useRef<HTMLDivElement>(null);
  // where the finger went down, how far it has turned since, and whether it turned enough to count
  const drag = useRef<{ last: number; turned: number; spun: boolean; level: number } | null>(null);
  const [pressed, setPressed] = useState<'top' | 'right' | 'bottom' | 'left' | 'hub' | null>(null);

  const angleOf = (e: PointerEvent<HTMLDivElement>) => {
    const { x, y } = local(e, ring.current!, rotate);
    return { deg: (Math.atan2(y, x) * 180) / Math.PI, x, y };
  };
  const sideOf = (x: number, y: number) =>
    Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'bottom' : 'top';

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!ring.current) return;
    ring.current.setPointerCapture(e.pointerId);
    const { deg, x, y } = angleOf(e);
    drag.current = { last: deg, turned: 0, spun: false, level };
    setPressed(sideOf(x, y));
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !ring.current) return;
    const { deg } = angleOf(e);
    let delta = deg - d.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    d.last = deg;
    d.turned += delta;
    const steps = Math.trunc(d.turned / STEP_DEG);
    if (steps !== 0) {
      d.turned -= steps * STEP_DEG;
      d.spun = true;
      setPressed(null);
      // clockwise is louder, as on the real thing
      d.level = Math.min(1, Math.max(0, d.level + steps * STEP_LEVEL));
      onVolume(Math.round(d.level * 100) / 100);
    }
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setPressed(null);
    if (!d || d.spun || !ring.current) return;
    const { x, y } = angleOf(e);
    const side = sideOf(x, y);
    if (side === 'top') onMenu();
    else if (side === 'left') onPrev();
    else if (side === 'right') onNext();
    else onToggle();
  };

  // the wheel tips a hair towards whichever side is under the finger, the way the real one rocks
  const tilt =
    pressed === 'top'
      ? 'rotateX(5deg)'
      : pressed === 'bottom'
        ? 'rotateX(-5deg)'
        : pressed === 'left'
          ? 'rotateY(-5deg)'
          : pressed === 'right'
            ? 'rotateY(5deg)'
            : 'none';

  return (
    <div className={`relative shrink-0 [perspective:700px] ${upright ? 'h-[340px] w-[340px]' : 'h-[272px] w-[272px]'}`}>
      <div
        ref={ring}
        data-no-swipe
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          drag.current = null;
          setPressed(null);
        }}
        className="absolute inset-0 cursor-pointer touch-none rounded-full transition-transform duration-150 select-none"
        style={{
          background: skin.wheel,
          transform: tilt,
          boxShadow: `0 1px 0 rgba(255,255,255,0.6), 0 6px 16px rgba(0,0,0,0.12), inset 0 0 0 1px ${skin.edge}`,
          color: skin.glyph,
        }}>
        <span className="absolute top-[9%] left-1/2 -translate-x-1/2 font-body text-[1.0625rem] font-medium tracking-[0.06em]">
          MUSIC
        </span>
        <span className="absolute top-1/2 left-[9%] -translate-y-1/2">
          <Glyph kind="prev" />
        </span>
        <span className="absolute top-1/2 right-[9%] -translate-y-1/2">
          <Glyph kind="next" />
        </span>
        <span className="absolute bottom-[9%] left-1/2 -translate-x-1/2">
          <Glyph kind="playpause" />
        </span>

        <button
          aria-label={playing ? 'pause' : 'play'}
          onPointerDown={e => {
            e.stopPropagation();
            setPressed('hub');
          }}
          onPointerUp={e => {
            e.stopPropagation();
            setPressed(null);
          }}
          onPointerLeave={() => setPressed(p => (p === 'hub' ? null : p))}
          onClick={onToggle}
          className="absolute top-1/2 left-1/2 h-[38%] w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full transition-[filter] duration-100"
          style={{
            background: skin.hub,
            boxShadow: `inset 0 1px 2px rgba(0,0,0,0.12), 0 0 0 1px ${skin.edge}`,
            filter: pressed === 'hub' ? 'brightness(0.92)' : undefined,
          }}
        />
      </div>
    </div>
  );
}

function Glyph({ kind }: { kind: 'prev' | 'next' | 'playpause' }) {
  if (kind === 'playpause') {
    return (
      <svg viewBox="0 0 34 18" className="h-[18px] w-[34px]" fill="currentColor">
        <path d="M2 2.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 2 2.2Z" />
        <rect x="19" y="2" width="4.2" height="14" rx="1" />
        <rect x="26.5" y="2" width="4.2" height="14" rx="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 22 18" className={`h-[18px] w-[22px] ${kind === 'prev' ? '-scale-x-100' : ''}`} fill="currentColor">
      <path d="M2 2.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 2 2.2Z" />
      <rect x="16" y="2" width="4.2" height="14" rx="1" />
    </svg>
  );
}

function Speaker({ className, waves }: { className?: string; waves: 0 | 2 }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none" />
      {waves > 0 && (
        <>
          <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" />
          <path d="M19 7a7 7 0 0 1 0 10" />
        </>
      )}
    </svg>
  );
}

