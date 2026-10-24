// night: for driving in the dark. nothing on screen is bright: the clock leads in a dim grey, the track sits under it
// in a dimmer one, and the cover is only a faint smear of its own colour behind them
import { FitTitle } from './fit-title';
import { Transport, fmt, type StyleProps } from './style-kit';

// the brightest anything gets; white at full would glare from the dash at night
const INK = '#8b9097';
const DIM = '#4f545a';

export function Night({
  artUrl,
  title,
  artist,
  playing,
  upright,
  showTransport,
  elapsed,
  duration,
  remaining,
  clock,
  seek,
  onToggle,
  onPrev,
  onNext,
}: StyleProps) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {artUrl && (
        <img
          src={artUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-[0.13] blur-3xl saturate-150"
        />
      )}

      <div className={`relative flex h-full flex-col justify-center ${upright ? 'px-8' : 'px-14'}`} style={{ color: INK }}>
        <div className="mb-6">{clock(upright ? 64 : 88, INK)}</div>
        <FitTitle
          text={title}
          max={upright ? 30 : 34}
          lines={2}
          className="font-display leading-[1.15] font-medium tracking-display"
        />
        <div className="mt-1 truncate text-title" style={{ color: DIM }}>
          {artist}
        </div>

        <div className="mt-8 flex items-center gap-5">
          <span className="font-mono text-hint tabular-nums" style={{ color: DIM }}>
            {fmt(elapsed)}
          </span>
          <div className="min-w-0 flex-1">{seek(DIM, DIM)}</div>
          <span className="font-mono text-hint tabular-nums" style={{ color: DIM }}>
            {remaining ? `-${fmt(Math.max(0, duration - elapsed))}` : fmt(duration)}
          </span>
        </div>

        {showTransport && (
          <Transport
            playing={playing}
            onToggle={onToggle}
            onPrev={onPrev}
            onNext={onNext}
            className="mt-6 -ml-2 gap-6"
            icon="h-7 w-7"
          />
        )}
      </div>
    </div>
  );
}
