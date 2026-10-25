// aquarium: a dark tank lit from above. the cover is a glowing rock on the sand, fish in the album's colours swim
// across while the song plays and hang in the water when it pauses, bubbles rise, and the song is the tank's label
import type { CSSProperties } from 'react';

import { FitTitle } from './fit-title';
import { Transport, fmt, hash, type StyleProps } from './style-kit';

// a small steady sequence from the song, so the same song keeps the same fish
function seq(seed: number) {
  let h = seed || 1;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    return (h % 10000) / 10000;
  };
}

function Fish({ colour, size }: { colour: string; size: number }) {
  return (
    <svg viewBox="0 0 64 32" width={size} height={size / 2} style={{ filter: `drop-shadow(0 0 6px ${colour})` }}>
      <path d="M44 16 L62 4 L58 16 L62 28 Z" fill={colour} opacity="0.85" />
      <path d="M2 16 C 10 2, 34 0, 46 16 C 34 32, 10 30, 2 16 Z" fill={colour} />
      <path d="M20 6 C 24 2, 30 2, 32 6" fill="none" stroke={colour} strokeWidth="3" />
      <circle cx="11" cy="14" r="2.6" fill="#071226" />
    </svg>
  );
}

export function Aquarium({ artUrl, title, artist, album, accent, playing, motion, upright, showTransport, elapsed, duration, seek, onToggle, onPrev, onNext }: StyleProps) {
  const tint = accent?.fill ?? '#3fd0ff';
  const colours = [accent?.fill ?? '#ff8a3d', accent?.soft ?? '#ffd166', accent?.fill2 ?? '#3fd0ff', accent?.soft2 ?? '#c38bff'];
  const rnd = seq(hash(title + artist));
  const fish = Array.from({ length: upright ? 6 : 8 }, (_, i) => ({
    colour: colours[i % colours.length],
    size: 34 + rnd() * 46,
    top: 14 + rnd() * (upright ? 50 : 46),
    seconds: 16 + rnd() * 18,
    // a negative delay starts each fish part way across, so the tank is never empty
    delay: -rnd() * 30,
    left: rnd() < 0.5,
    at: rnd() * 100,
  }));
  const bubbles = Array.from({ length: 16 }, () => ({ x: rnd() * 100, size: 4 + rnd() * 9, seconds: 5 + rnd() * 7, delay: -rnd() * 12 }));
  const weed = Array.from({ length: upright ? 4 : 6 }, () => ({ x: rnd() * 100, h: 70 + rnd() * 90, seconds: 4 + rnd() * 3 }));
  const run: CSSProperties = { animationPlayState: playing ? 'running' : 'paused' };

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(#0a3b5c, color-mix(in oklab, ${tint} 22%, #06223a) 55%, #03101e)`, ['--tint' as string]: tint }}>
      {/* light falling through the surface */}
      <div className="absolute inset-0 opacity-50 [background:repeating-linear-gradient(100deg,transparent_0_60px,rgba(255,255,255,0.05)_60px_90px,transparent_90px_170px)] [mask-image:linear-gradient(#000,transparent_70%)]" />
      <div className="absolute inset-x-0 top-0 h-2 bg-white/15" />

      {/* sand, and weed swaying from it */}
      <div className="absolute inset-x-0 bottom-0 h-[16%] rounded-t-[50%_30px] bg-gradient-to-b from-[#c9ab6b] to-[#6e5631]" />
      {weed.map((w, i) => (
        <svg key={i} viewBox="0 0 20 100" className={`absolute bottom-[10%] origin-bottom ${motion ? 'animate-sway' : ''}`} style={{ left: `${w.x}%`, height: w.h, animationDuration: `${w.seconds}s` }}>
          <path d="M10 100 C 0 80, 20 60, 10 40 C 2 25, 16 12, 10 0" fill="none" stroke="#1f7a4a" strokeWidth="5" strokeLinecap="round" />
        </svg>
      ))}

      {bubbles.map((b, i) => (
        <div
          key={i}
          className={`absolute rounded-full border border-white/50 bg-white/10 ${motion ? 'animate-bubble' : ''}`}
          style={{ left: `${b.x}%`, top: motion ? undefined : `${30 + (i * 37) % 60}%`, width: b.size, height: b.size, animationDuration: `${b.seconds}s`, animationDelay: `${b.delay}s` }}
        />
      ))}

      {fish.map((f, i) => (
        <div
          key={i}
          className={`absolute ${motion ? (f.left ? 'animate-swim-left' : 'animate-swim-right') : ''}`}
          style={{ top: `${f.top}%`, left: motion ? undefined : `${f.at}%`, animationDuration: `${f.seconds}s`, animationDelay: `${f.delay}s`, ...run }}>
          {/* the drawing faces left, so a fish going right is turned round */}
          <div className={f.left ? '' : '-scale-x-100'}>
            <Fish colour={f.colour} size={f.size} />
          </div>
        </div>
      ))}

      <div className={`relative flex h-full ${upright ? 'flex-col justify-between p-5' : 'justify-between p-6'}`}>
        {/* the label on the glass */}
        <div className={`h-fit rounded-xl border border-white/20 bg-white/10 p-4 text-white shadow-[0_8px_30px_rgba(0,0,0,0.3)] backdrop-blur-md ${upright ? 'w-full' : 'w-[360px]'}`}>
          <div className="font-mono text-[10px] tracking-[0.3em] text-white/60">{playing ? 'NOW SWIMMING' : 'FEEDING TIME'} · {fmt(elapsed)} / {fmt(duration)}</div>
          <FitTitle text={title} max={34} lines={2} className="mt-1 font-display leading-[1.05] font-bold" />
          <div className="truncate font-display text-[1.125rem] text-white/75">{artist}</div>
          {album && <div className="truncate text-row text-white/45 italic">{album}</div>}
        </div>

        <div className={`flex items-end ${upright ? 'flex-col items-stretch gap-6' : 'flex-col justify-end gap-4'}`}>
          {/* the cover as a rock on the sand, glowing from inside */}
          <div
            className={`overflow-hidden ${upright ? 'mx-auto h-[220px] w-[240px]' : 'absolute bottom-6 left-6 h-[170px] w-[190px]'}`}
            style={{ borderRadius: '46% 54% 40% 60% / 56% 46% 54% 44%', boxShadow: `0 0 40px color-mix(in srgb, ${tint} 60%, transparent), inset 0 0 20px rgba(0,0,0,0.5)` }}>
            {artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className={`flex flex-col gap-4 ${upright ? 'w-full' : 'w-[340px]'}`}>
            <div className="w-full">{seek(tint, accent?.fill2 ?? tint)}</div>
            {showTransport && (
              <Transport
                playing={playing}
                onToggle={onToggle}
                onPrev={onPrev}
                onNext={onNext}
                className="justify-center gap-4 text-white"
                button="h-14 w-14 rounded-full bg-white/10 ring-1 ring-white/45 shadow-[inset_4px_-4px_8px_rgba(255,255,255,0.15)] backdrop-blur-sm"
                play="h-[72px] w-[72px] rounded-full bg-white/15 ring-2 ring-white/60 shadow-[0_0_24px_var(--tint),inset_6px_-6px_12px_rgba(255,255,255,0.2)] backdrop-blur-sm"
                icon="h-8 w-8"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
