// ambient: only the album's colours, drifting. the song's name shows when it starts and fades away; a tap brings the
// name and the buttons back for a few seconds, and the presets work throughout
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { FitTitle } from './fit-title';
import { Transport, type StyleProps } from './style-kit';

// how long the name stays up when a song starts, and after a tap
const SHOW_MS = 7000;
const TAP_MS = 5000;

export function Ambient({ title, artist, accent, playing, motion, showTransport, clock, onToggle, onPrev, onNext }: StyleProps) {
  // the style is rebuilt for every track, so mounting is the song starting
  const [awake, setAwake] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = (ms: number) => {
    setAwake(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAwake(false), ms);
  };
  useEffect(() => {
    wake(SHOW_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const a = accent?.fill ?? '#5b6cff';
  const b = accent?.fill2 ?? '#ff5bb0';
  const c = accent?.soft ?? '#5bffd9';
  const d = accent?.soft2 ?? '#ffd25b';
  const cloud = (colour: string, cls: string, style: CSSProperties) => (
    <div className={`absolute rounded-full blur-[70px] ${motion ? cls : ''}`} style={{ background: colour, opacity: 0.75, ...style }} />
  );

  return (
    <div className="absolute inset-0 overflow-hidden bg-black" onClick={() => wake(TAP_MS)}>
      {/* the field is scaled past the screen so its turning never shows a corner */}
      <div className={`absolute inset-0 scale-[1.6] ${motion ? 'animate-swirl' : ''}`}>
        {/* small against the scaled field, so black still shows between them and each colour stays its own */}
        {cloud(a, 'animate-drift-a', { width: '30%', height: '40%', left: '18%', top: '16%' })}
        {cloud(b, 'animate-drift-b', { width: '28%', height: '38%', right: '16%', bottom: '18%' })}
        {cloud(c, 'animate-drift-c', { width: '22%', height: '30%', left: '42%', top: '34%' })}
        {cloud(d, 'animate-drift-d', { width: '20%', height: '28%', left: '24%', bottom: '22%' })}
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 bg-gradient-to-t from-black/50 to-transparent px-10 pt-16 pb-8 transition-opacity duration-[1500ms] ${
          awake ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}>
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-white/70">{clock(18)}</div>
          <FitTitle text={title} max={32} lines={2} className="font-display leading-tight font-semibold text-white" />
          <div className="truncate text-title text-white/70">{artist}</div>
        </div>
        {showTransport && (
          <div onClick={e => (e.stopPropagation(), wake(TAP_MS))}>
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="shrink-0 gap-2 text-white"
              button="h-14 w-14"
              play="h-16 w-16 rounded-full bg-white/15 ring-1 ring-white/40"
              icon="h-8 w-8"
            />
          </div>
        )}
      </div>
    </div>
  );
}
