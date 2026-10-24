// pixel: the cover taken down to 32 by 32 and shown in big square pixels, in a handheld's few colours, with the
// track in block letters and the progress as a row of cells
import { useEffect, useRef } from 'react';

import { FitTitle } from './fit-title';
import { Transport, fmt, type StyleProps } from './style-kit';

const GRID = 32;
// steps per channel; few enough that the cover reads as pixel art rather than a blurry photo
const LEVELS = 5;
const CELLS = 16;

function useDownsample(url: string | null) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    ctx.clearRect(0, 0, GRID, GRID);
    if (!url) return;
    let stale = false;
    const img = new Image();
    img.onload = () => {
      if (stale) return;
      // smoothing on for the shrink, so each pixel is the average of its patch rather than one sample of it
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, GRID, GRID);
      const data = ctx.getImageData(0, 0, GRID, GRID);
      const step = 255 / (LEVELS - 1);
      for (let i = 0; i < data.data.length; i += 4) {
        for (let c = 0; c < 3; c++) data.data[i + c] = Math.round(data.data[i + c] / step) * step;
      }
      ctx.putImageData(data, 0, 0);
    };
    img.src = url;
    return () => {
      stale = true;
    };
  }, [url]);
  return canvas;
}

export function Pixel({
  artUrl,
  title,
  artist,
  accent,
  playing,
  upright,
  showTransport,
  progress,
  elapsed,
  duration,
  remaining,
  onToggle,
  onPrev,
  onNext,
}: StyleProps) {
  const canvas = useDownsample(artUrl);
  const tint = accent?.soft ?? '#9bbc0f';
  const lit = Math.round(Math.min(1, Math.max(0, progress)) * CELLS);
  const size = upright ? 352 : 320;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0f1013]">
      {/* scanlines, faint, the way a handheld's screen shows its rows */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.18)_0_1px,transparent_1px_4px)]" />
      <div className={`flex h-full items-center ${upright ? 'flex-col justify-center gap-7 px-6' : 'gap-10 px-10'}`}>
        <div className="shrink-0 bg-[#1d1f24] p-2 shadow-[6px_6px_0_#000]" style={{ width: size + 16 }}>
          <canvas ref={canvas} width={GRID} height={GRID} className="block" style={{ width: size, height: size, imageRendering: 'pixelated' }} />
        </div>

        <div className={`flex min-w-0 flex-col ${upright ? 'w-full' : 'flex-1'}`}>
          <div className="mb-3 font-pixel text-[10px] tracking-wider" style={{ color: tint }}>
            {playing ? '> NOW PLAYING' : '|| PAUSED'}
          </div>
          <FitTitle text={title.toUpperCase()} max={22} lines={3} className="font-pixel leading-[1.4] text-white" />
          <div className="mt-3 truncate font-pixel text-[11px] leading-normal text-white/60">{artist.toUpperCase()}</div>

          <div className="mt-8 flex gap-1">
            {Array.from({ length: CELLS }, (_, i) => (
              <div key={i} className="h-4 flex-1" style={{ backgroundColor: i < lit ? tint : 'rgba(255,255,255,0.1)' }} />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-pixel text-[10px] text-white/60">
            <span>{fmt(elapsed)}</span>
            <span>{remaining ? `-${fmt(Math.max(0, duration - elapsed))}` : fmt(duration)}</span>
          </div>

          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="mt-8 -ml-2 gap-4 text-white"
              play="grid h-14 w-14 place-items-center bg-white text-black shadow-[4px_4px_0_#000]"
              icon="h-7 w-7"
            />
          )}
        </div>
      </div>
    </div>
  );
}
