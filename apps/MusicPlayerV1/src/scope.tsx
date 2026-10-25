// oscilloscope: a green trace on a crt with its graticule. the phone sends no audio, so the trace is a wave made
// from the song itself that moves while it plays and lies flat when paused. tap the screen for an x-y circle
import { useEffect, useRef, useState } from 'react';

import { Transport, fmt, hash, type StyleProps } from './style-kit';

const PHOSPHOR = '#5dff8f';

export function Scope({ title, artist, accent, playing, motion, upright, showTransport, elapsed, duration, seek, onToggle, onPrev, onNext }: StyleProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [xy, setXy] = useState(false);
  const h = hash(title + artist);
  // two partials and a ratio for the circle, the same for the same song
  const f1 = 2 + (h % 3);
  const f2 = 5 + ((h >>> 4) % 5);
  const ratio = [1, 2, 3, 1.5][(h >>> 9) % 4];
  const hz = 110 + (h % 770);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    let frame = 0;
    let level = playing ? 1 : 0;
    const draw = (now: number) => {
      const w = el.width;
      const ht = el.height;
      // the trace swells in and dies away rather than jumping when play is pressed
      level += ((playing ? 1 : 0.04) - level) * 0.08;
      const t = now / 1000;
      ctx.clearRect(0, 0, w, ht);
      ctx.strokeStyle = PHOSPHOR;
      ctx.lineWidth = 3;
      ctx.shadowColor = PHOSPHOR;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      const n = 400;
      for (let i = 0; i <= n; i++) {
        const p = i / n;
        let x: number;
        let y: number;
        if (xy) {
          const a = p * Math.PI * 2;
          const r = 0.38 * (0.35 + 0.65 * level);
          x = w / 2 + Math.sin(a * ratio + t * 0.7) * r * ht;
          y = ht / 2 + Math.sin(a) * r * ht;
        } else {
          const beat = 0.75 + 0.25 * Math.sin(t * 4.2);
          const v = Math.sin(p * Math.PI * 2 * f1 + t * 3) * 0.6 + Math.sin(p * Math.PI * 2 * f2 - t * 5.3) * 0.3 * beat;
          x = p * w;
          y = ht / 2 + v * level * ht * 0.32;
        }
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (motion) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playing, motion, xy, f1, f2, ratio]);

  const tint = accent?.fill ?? PHOSPHOR;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#2a2c2e]" style={{ background: 'linear-gradient(#3a3d40, #232527)' }}>
      <div className={`flex h-full ${upright ? 'flex-col gap-4 p-4' : 'gap-5 p-5'}`}>
        {/* the tube, with its graticule ruled over the trace the way the glass carries it */}
        <button
          aria-label="switch the trace"
          onClick={() => setXy(v => !v)}
          className={`relative shrink-0 overflow-hidden rounded-[22px] border-[10px] border-[#121314] bg-[#04140a] shadow-[inset_0_0_60px_rgba(0,0,0,0.9)] ${upright ? 'h-[400px] w-full' : 'h-full w-[480px]'}`}>
          <canvas ref={canvas} width={upright ? 432 : 460} height={upright ? 380 : 420} className="absolute inset-0 h-full w-full" />
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage: `linear-gradient(${PHOSPHOR} 1px, transparent 1px), linear-gradient(90deg, ${PHOSPHOR} 1px, transparent 1px)`,
              backgroundSize: '10% 12.5%',
            }}
          />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[#5dff8f]/50" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-[#5dff8f]/50" />
          <div className="pointer-events-none absolute inset-0 rounded-[12px] bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.08),transparent_50%)]" />
          <div className="absolute top-2 left-3 font-mono text-[11px] text-[#5dff8f]/80">CH1 {xy ? 'X-Y' : 'Y-T'}</div>
          <div className="absolute right-3 bottom-2 font-mono text-[11px] text-[#5dff8f]/80">{hz} Hz</div>
        </button>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 font-mono text-[#d8dcd8]">
          <div className="flex items-center justify-between text-[11px] tracking-[0.3em] text-white/50">
            <span>OUSA · OS-480</span>
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${playing ? 'bg-[#5dff8f] shadow-[0_0_8px_#5dff8f]' : 'bg-[#1d3a26]'}`} />
              {playing ? 'RUN' : 'STOP'}
            </span>
          </div>
          <div className="min-w-0 rounded-md bg-black/40 p-3">
            <div className="text-[10px] tracking-[0.3em] text-white/45">SIGNAL</div>
            <div className="line-clamp-2 font-display text-[1.6rem] leading-tight font-bold text-white">{title}</div>
            <div className="truncate text-[14px]" style={{ color: tint }}>
              {artist}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-md bg-black/40 p-2">
              <div className="text-[9px] tracking-[0.3em] text-white/45">TIME</div>
              <div className="text-[18px] text-[#5dff8f]">{fmt(elapsed)}</div>
            </div>
            <div className="rounded-md bg-black/40 p-2">
              <div className="text-[9px] tracking-[0.3em] text-white/45">SWEEP</div>
              <div className="text-[18px] text-[#5dff8f]">{fmt(duration)}</div>
            </div>
          </div>
          <div className="w-full">{seek(PHOSPHOR, tint)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="justify-center gap-3 text-[#d8dcd8]"
              button="h-11 w-14 rounded-[4px] bg-gradient-to-b from-[#c9cdc9] to-[#9a9e9a] text-[#232527] shadow-[0_3px_0_#5a5d5a]"
              play="h-11 w-16 rounded-[4px] bg-gradient-to-b from-[#c9cdc9] to-[#9a9e9a] text-[#0b5a24] shadow-[0_3px_0_#5a5d5a,0_0_14px_rgba(93,255,143,0.55)] ring-2 ring-[#5dff8f]"
              icon="h-7 w-7"
            />
          )}
        </div>
      </div>
    </div>
  );
}
