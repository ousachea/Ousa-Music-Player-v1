// cover flow: the track's cover square in the middle with its name over it, and the queue fanned out
// in perspective either side, what is up next to the right and what has just played to the left
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

import type { Accent } from './artwork-color';
import type { Queue } from './queue';

// how many covers stand either side of the middle one
const SIDE = 3;

// a swipe across a cover is the player's skip gesture, so a cover only counts as tapped when the
// finger came up close to where it went down
function useTap(onTap: () => void) {
  const from = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => (from.current = { x: e.clientX, y: e.clientY }),
    onClick: (e: { clientX: number; clientY: number }) => {
      const start = from.current;
      from.current = null;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) return;
      onTap();
    },
  };
}

function Card({ url, style, onTap, children }: { url: string | null; style: CSSProperties; onTap?: () => void; children?: ReactNode }) {
  const tap = useTap(() => onTap?.());
  return (
    <div
      {...(onTap ? tap : {})}
      className={`absolute top-1/2 left-1/2 overflow-hidden rounded-[22px] shadow-[0_24px_60px_rgba(0,0,0,0.7)] transition-[transform,filter] duration-500 ease-spring ${
        // a slot the queue has nothing for is only an outline, so the fan keeps its shape
        url ? 'bg-white/6 ring-1 ring-white/10' : 'bg-white/[0.025] ring-1 ring-white/[0.06]'
      }`}
      style={style}>
      {url && <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />}
      {children}
    </div>
  );
}

function Glyph({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d={d} />
    </svg>
  );
}

const PLAY = 'M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z';
const PAUSE = 'M7 5h3.2v14H7zM13.8 5H17v14h-3.2z';
const NEXT = 'M5 6.2v11.6a.8.8 0 0 0 1.2.7l8.3-5.8a.8.8 0 0 0 0-1.4L6.2 5.5a.8.8 0 0 0-1.2.7zM16 5.5h2.6v13H16z';

export function CoverFlow({
  artUrl,
  title,
  artist,
  queue,
  thumbs,
  accent,
  playing,
  progress,
  upright,
  showTransport,
  onToggle,
  onPrev,
  onNext,
  onSkipTo,
}: {
  artUrl: string | null;
  title: string;
  artist: string;
  queue: Queue | null;
  thumbs: Record<string, string>;
  accent: Accent | null;
  playing: boolean;
  progress: number;
  upright: boolean;
  showTransport: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSkipTo: (index: number) => void;
}) {
  const next = (queue?.items ?? []).slice(0, SIDE);
  // history arrives oldest first, and the one nearest the middle is the one that just finished
  const played = (queue?.previous ?? []).slice(-SIDE).reverse();
  const art = (id: string | null) => (id ? thumbs[id] || null : null);
  const tint = accent?.fill ?? '#ffffff';

  // the middle cover is as tall as the screen allows; turned, the flow runs down the screen instead
  const size = upright ? 360 : 392;
  const along = upright ? 'translateY' : 'translateX';
  const turn = upright ? 'rotateX' : 'rotateY';

  // each step out sits further back, turned further away and darker, the way the covers recede
  // each cover is drawn in a perspective of its own rather than one shared 3d space: in a shared one
  // the turned covers cut through each other, where on their own they simply stack, nearest on top
  const side = (k: number, dir: 1 | -1): CSSProperties => {
    const scale = [1, 0.9, 0.8, 0.72][k];
    // the outer edge of each cover lands a fixed step further out than the one before, and the cover
    // is placed by its middle, so the step is taken back by half of its turned width
    const width = size * scale * 0.9;
    const shift = size / 2 + 118 * k - width / 2;
    // each cover faces in towards the middle, its inner edge nearer than its outer one. turned about
    // the horizontal axis, a cover below the middle has to tip the other way
    const angle = (upright ? -1 : 1) * dir * (26 + k * 3);
    return {
      width: size,
      height: size,
      marginLeft: -size / 2,
      marginTop: -size / 2,
      transform: `${along}(${dir * shift}px) scale(${scale}) perspective(${size * 2.4}px) ${turn}(${angle}deg)`,
      filter: `brightness(${[1, 0.7, 0.48, 0.32][k]})`,
      zIndex: 10 - k,
    };
  };

  const slots = (dir: 1 | -1) =>
    Array.from({ length: SIDE }, (_, i) => {
      const k = i + 1;
      const item = dir === 1 ? next[i] : played[i];
      // a cover to the right is in the queue, so it can be played; history only steps back one
      const onTap = dir === 1 ? (item ? () => onSkipTo(i) : undefined) : k === 1 ? onPrev : undefined;
      return <Card key={`${dir}${k}`} url={item ? art(item.artworkId) : null} style={side(k, dir)} onTap={onTap} />;
    });

  const done = Math.min(1, Math.max(0, progress));

  return (
    // isolated, so the covers' stacking order stays inside the style and never over the settings
    <div className="absolute inset-0 isolate overflow-hidden bg-black">
      <div className="absolute inset-0">
        {/* the far covers first, so the nearer ones are laid over them */}
        {slots(-1).reverse()}
        {slots(1).reverse()}

        <Card
          url={artUrl}
          onTap={onToggle}
          style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, zIndex: 20 }}>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-6 text-center">
            <div className="line-clamp-2 font-display text-[1.65rem] leading-tight font-semibold tracking-display text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
              {title}
            </div>
            <div className="mt-0.5 truncate text-row text-white/75">{artist}</div>
            {showTransport && (
              <div className="mt-3 flex items-center gap-9 text-white" onClick={e => e.stopPropagation()}>
                <button aria-label="previous" onClick={onPrev} className="p-1 transition active:scale-90">
                  <Glyph d={NEXT} className="h-7 w-7 -scale-x-100" />
                </button>
                <button aria-label={playing ? 'pause' : 'play'} onClick={onToggle} className="p-1 transition active:scale-90">
                  <span key={playing ? 'pause' : 'play'} className="grid animate-pop place-items-center">
                    <Glyph d={playing ? PAUSE : PLAY} className="h-9 w-9" />
                  </span>
                </button>
                <button aria-label="next" onClick={onNext} className="p-1 transition active:scale-90">
                  <Glyph d={NEXT} className="h-7 w-7" />
                </button>
              </div>
            )}
          </div>
          {/* the song's progress runs along the cover's own bottom edge */}
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
            <div className="h-full transition-[width] duration-300 ease-linear" style={{ width: `${done * 100}%`, backgroundColor: tint }} />
          </div>
        </Card>
      </div>
    </div>
  );
}
