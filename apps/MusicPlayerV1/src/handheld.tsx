// handheld: an old pocket console with a four shade green screen. the cover is sampled down to a few dozen pixels
// and mapped onto the four greens, the track is set in block type, and the pad and the a and b keys work the player
import { useEffect, useRef } from 'react';

import { FitTitle } from './fit-title';
import { fmt, type StyleProps } from './style-kit';

const SHADES = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];
const PX = 40;

// luminance first, then each channel stepped onto the four greens
function Greens() {
  return (
    <svg className="absolute h-0 w-0" aria-hidden>
      <filter id="handheld-greens" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0" />
        <feComponentTransfer>
          <feFuncR type="discrete" tableValues="0.059 0.188 0.545 0.608" />
          <feFuncG type="discrete" tableValues="0.22 0.384 0.675 0.737" />
          <feFuncB type="discrete" tableValues="0.059 0.188 0.059 0.059" />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

function Cover({ url, size }: { url: string | null; size: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = SHADES[1];
    ctx.fillRect(0, 0, PX, PX);
    if (!url) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, PX, PX);
    img.src = url;
  }, [url]);
  return (
    <canvas
      ref={canvas}
      width={PX}
      height={PX}
      className="shrink-0"
      style={{ width: size, height: size, imageRendering: 'pixelated', filter: 'url(#handheld-greens)' }}
    />
  );
}

function Pad({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <div className="relative h-[120px] w-[120px] shrink-0">
      <div className="absolute inset-x-[40px] inset-y-0 rounded-md bg-[#2b2b33] shadow-[0_4px_0_#16161b]" />
      <div className="absolute inset-x-0 inset-y-[40px] rounded-md bg-[#2b2b33] shadow-[0_4px_0_#16161b]" />
      <button aria-label="previous" onClick={onPrev} className="absolute top-[40px] left-0 h-[40px] w-[44px] active:translate-y-0.5" />
      <button aria-label="next" onClick={onNext} className="absolute top-[40px] right-0 h-[40px] w-[44px] active:translate-y-0.5" />
      <div className="pointer-events-none absolute top-[54px] left-[10px] h-0 w-0 border-y-[6px] border-r-[9px] border-y-transparent border-r-[#555]" />
      <div className="pointer-events-none absolute top-[54px] right-[10px] h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-[#555]" />
    </div>
  );
}

function Keys({ playing, onToggle, onNext }: { playing: boolean; onToggle: () => void; onNext: () => void }) {
  const key = 'grid h-[62px] w-[62px] place-items-center rounded-full bg-[#9a2257] font-pixel text-[12px] text-[#f3c9da] shadow-[0_4px_0_#5e1033] active:translate-y-1 active:shadow-none';
  return (
    <div className="flex shrink-0 -rotate-[25deg] items-center gap-4">
      <div className="flex flex-col items-center gap-1">
        <button aria-label="next" onClick={onNext} className={`${key} translate-y-4`}>
          B
        </button>
      </div>
      <div className="flex flex-col items-center gap-1">
        <button aria-label={playing ? 'pause' : 'play'} onClick={onToggle} className={`${key} -translate-y-4`}>
          A
        </button>
      </div>
    </div>
  );
}

export function Handheld({ artUrl, title, artist, playing, upright, elapsed, duration, progress, onToggle, onPrev, onNext }: StyleProps) {
  const blocks = 16;
  const lit = Math.round(progress * blocks);

  const screen = (
    <div className="rounded-[14px] rounded-br-[44px] bg-[#55555f] p-4 pb-3 shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)]">
      <div className="mb-2 flex items-center gap-2 text-[8px] tracking-[0.2em] text-[#c9c9d4]">
        <span className={`h-2 w-2 rounded-full ${playing ? 'bg-[#ff3b3b] shadow-[0_0_6px_#ff3b3b]' : 'bg-[#4a1818]'}`} />
        BATTERY
      </div>
      <div className={`flex gap-4 p-3 font-pixel ${upright ? 'w-[372px] flex-col items-center' : 'h-[230px] w-[400px] items-center'}`} style={{ background: SHADES[3], color: SHADES[0] }}>
        <Cover url={artUrl} size={upright ? 180 : 170} />
        <div className={`flex min-w-0 flex-1 flex-col gap-3 ${upright ? 'w-full' : ''}`}>
          <FitTitle text={title.toUpperCase()} max={upright ? 18 : 20} lines={3} className="leading-[1.35]" />
          <div className="truncate text-[10px] leading-relaxed" style={{ color: SHADES[1] }}>
            {artist.toUpperCase()}
          </div>
          <div className="flex gap-[3px]">
            {Array.from({ length: blocks }, (_, i) => (
              <div key={i} className="h-3 flex-1" style={{ background: i < lit ? SHADES[0] : SHADES[2] }} />
            ))}
          </div>
          <div className="flex justify-between text-[9px]">
            <span>{fmt(elapsed)}</span>
            <span>{playing ? '▶' : 'II'}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 font-display text-[13px] font-bold tracking-[0.06em] text-[#c9c9d4] italic">
        OUSA <span className="font-normal not-italic">POCKET SOUND</span>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#1b1a20]">
      <Greens />
      <div
        className={`absolute flex items-center justify-between bg-[#cfcac0] shadow-[inset_0_-6px_0_rgba(0,0,0,0.12)] ${
          upright ? 'inset-3 flex-col rounded-[28px] rounded-br-[90px] px-6 pt-6 pb-10' : 'inset-3 rounded-[60px] px-6'
        }`}>
        {upright ? (
          <>
            {screen}
            <div className="flex w-full items-center justify-between px-2">
              <Pad onPrev={onPrev} onNext={onNext} />
              <Keys playing={playing} onToggle={onToggle} onNext={onNext} />
            </div>
          </>
        ) : (
          <>
            <Pad onPrev={onPrev} onNext={onNext} />
            {screen}
            <Keys playing={playing} onToggle={onToggle} onNext={onNext} />
          </>
        )}
      </div>
    </div>
  );
}
