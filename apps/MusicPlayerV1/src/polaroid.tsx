// polaroid: the cover as an instant print with the title written under it by hand, dropped at its own slight angle
// on a table, an older print showing beneath it
import { useRef, useState, type CSSProperties } from 'react';

import { FitTitle } from './fit-title';
import { Transport, fmt, hash, type StyleProps } from './style-kit';

// the frame, the older print under it, and the ink the title is written in, per frame colour
const FRAME = {
  white: { face: '#faf8f3', under: '#ece8df', ink: '#22324f' },
  black: { face: '#1a1a1a', under: '#2a2a2a', ink: '#f1ece2' },
  cream: { face: '#efe3c8', under: '#e2d4b4', ink: '#4a3420' },
};

// a tap shuffles the print to the bottom of the pile, the way the top card of a deck is: it slides out, tucks in
// behind, and the next print, already in the new frame, rises from underneath into its place
const SHUFFLE_MS = 720;

export function Polaroid({
  artUrl,
  title,
  artist,
  album,
  accent,
  playing,
  motion,
  upright,
  showTransport,
  elapsed,
  duration,
  remaining,
  seek,
  onToggle,
  onPrev,
  onNext,
  frame,
  onFrame,
}: StyleProps & { frame: keyof typeof FRAME | 'album'; onFrame: () => void }) {
  // the album frame is the cover's own colour, with the ink it carries for text on it
  const f =
    frame === 'album'
      ? { face: accent?.fill ?? FRAME.white.face, under: `color-mix(in oklab, ${accent?.fill ?? FRAME.white.under} 75%, #000)`, ink: accent?.ink ?? FRAME.white.ink }
      : FRAME[frame];
  // the print being shuffled away keeps the frame it had
  const [leaving, setLeaving] = useState<typeof f | null>(null);
  const busy = useRef(false);
  const shuffle = () => {
    if (!motion) return onFrame();
    if (busy.current) return;
    busy.current = true;
    setLeaving(f);
    onFrame();
    setTimeout(() => {
      busy.current = false;
      setLeaving(null);
    }, SHUFFLE_MS);
  };
  const h = hash(title + artist);
  // between -4 and 4 degrees, fixed per track, so the print lands differently each time
  const tilt = ((h % 81) - 40) / 10;
  const under = tilt > 0 ? -5 - (h % 3) : 5 + (h % 3);
  const table = accent ? `color-mix(in oklab, ${accent.fill2} 30%, #17120f)` : '#17120f';
  const width = upright ? 330 : 300;

  const face = (colours: typeof f, className: string, style?: CSSProperties) => (
    <div className={`absolute inset-0 flex flex-col p-4 shadow-[0_18px_40px_rgba(0,0,0,0.55)] ${className}`} style={{ transform: `rotate(${tilt}deg)`, background: colours.face, ...style }}>
      <div className="aspect-square w-full shrink-0 overflow-hidden bg-[#1a1a1a]">
        {artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover saturate-[1.1] sepia-[0.08]" />}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-1 text-center">
        <div className="w-full" style={{ color: colours.ink }}>
          <FitTitle text={title} max={34} lines={2} className="w-full font-hand leading-[1.05] font-bold" />
        </div>
      </div>
    </div>
  );
  const angles = { '--tilt': `${tilt}deg`, '--under': `${under}deg` } as CSSProperties;

  const print = (
    // the print is the thing to tap: it shuffles to the next frame colour, and every so often lights up to say so
    <button aria-label="frame colour" onClick={shuffle} className="relative isolate shrink-0 animate-hint text-left transition active:scale-[0.98]" style={{ width, height: width * 1.26, ...angles }}>
      <div className="absolute inset-0 shadow-[0_12px_30px_rgba(0,0,0,0.5)]" style={{ transform: `rotate(${under}deg)`, background: f.under }} />
      {face(f, leaving ? 'animate-polaroid-in' : '')}
      {leaving && face(leaving, 'z-[3] animate-polaroid-out')}
    </button>
  );

  return (
    <div className="absolute inset-0 overflow-hidden transition-[background] duration-700" style={{ background: `radial-gradient(ellipse at 40% 40%, ${table}, #0b0908)` }}>
      <div className={`flex h-full items-center ${upright ? 'flex-col justify-center gap-8 px-6' : 'gap-12 px-12'}`}>
        {print}
        <div className={`flex min-w-0 flex-col ${upright ? 'w-full items-center text-center' : 'flex-1'}`}>
          <div className="font-hand text-[30px] leading-tight text-[#f4efe6]">{artist}</div>
          {album && <div className="mt-1 truncate text-row text-[#f4efe6]/55">{album}</div>}
          <div className="mt-8 flex w-full items-center gap-4">
            <span className="font-mono text-hint tabular-nums text-[#f4efe6]/60">{fmt(elapsed)}</span>
            <div className="min-w-0 flex-1">{seek(accent?.soft ?? '#f4efe6', accent?.soft2 ?? '#f4efe6')}</div>
            <span className="font-mono text-hint tabular-nums text-[#f4efe6]/60">
              {remaining ? `-${fmt(Math.max(0, duration - elapsed))}` : fmt(duration)}
            </span>
          </div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className={`mt-9 gap-5 text-[#f4efe6] ${upright ? 'justify-center' : '-ml-2'}`}
              play="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-b from-[#ff5a4e] to-[#c2261b] text-white ring-4 ring-[#f4efe6] shadow-[0_6px_14px_rgba(0,0,0,0.5)]"
            />
          )}
        </div>
      </div>
    </div>
  );
}
