// what every newer style is handed. the clock and the seek bar come in as render functions so the styles reuse the
// player's own, which live in App, without importing App back
import type { ReactNode } from 'react';

import type { Accent } from './artwork-color';

export type StyleProps = {
  artUrl: string | null;
  title: string;
  artist: string;
  album: string | null;
  explicit: boolean;
  accent: Accent | null;
  playing: boolean;
  motion: boolean;
  upright: boolean;
  showTransport: boolean;
  progress: number;
  elapsed: number;
  duration: number;
  remaining: boolean;
  clock: (size: number, color?: string) => ReactNode;
  seek: (tint: string, tint2: string) => ReactNode;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// a stable small number per string, so each track gets its own tilt or shade and keeps it
export function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PLAY = 'M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z';
const PAUSE = 'M7 5h3.2v14H7zM13.8 5H17v14h-3.2z';
const NEXT = 'M5 6.2v11.6a.8.8 0 0 0 1.2.7l8.3-5.8a.8.8 0 0 0 0-1.4L6.2 5.5a.8.8 0 0 0-1.2.7zM16 5.5h2.6v13H16z';

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d={d} />
    </svg>
  );
}

// previous, play and next in a row; each style dresses the play button through `play` and the other two through `button`
export function Transport({
  playing,
  onToggle,
  onPrev,
  onNext,
  className,
  play,
  button = 'p-2',
  icon = 'h-8 w-8',
}: {
  playing: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
  play?: string;
  button?: string;
  icon?: string;
}) {
  return (
    <div className={`flex items-center ${className ?? ''}`}>
      <button aria-label="previous" onClick={onPrev} className={`grid place-items-center transition active:scale-90 ${button}`}>
        <Icon d={NEXT} className={`-scale-x-100 ${icon}`} />
      </button>
      <button
        aria-label={playing ? 'pause' : 'play'}
        onClick={onToggle}
        className={`grid place-items-center transition active:scale-90 ${play ?? 'p-2'}`}>
        <span key={playing ? 'pause' : 'play'} className="grid animate-pop place-items-center">
          <Icon d={playing ? PAUSE : PLAY} className={icon} />
        </span>
      </button>
      <button aria-label="next" onClick={onNext} className={`grid place-items-center transition active:scale-90 ${button}`}>
        <Icon d={NEXT} className={icon} />
      </button>
    </div>
  );
}
