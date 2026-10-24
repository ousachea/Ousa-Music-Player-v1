// night: for driving in the dark. nothing on screen is bright: the clock leads in a dim tint of the cover, the track sits under it
// in a dimmer one, and the cover is only a faint smear of its own colour behind them
import { FitTitle } from './fit-title';
import { Transport, fmt, type StyleProps } from './style-kit';

// the brightest anything gets; white at full would glare from the dash at night. with a cover, the greys take on
// its colour, mixed down so they stay as dim as the plain ones
const INK = '#8b9097';
const DIM = '#4f545a';
const tinted = (base: string, accent: string | undefined, share: number) =>
  accent ? `color-mix(in oklab, ${accent} ${share}%, ${base})` : base;

export function Night({
  artUrl,
  accent,
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
  const ink = tinted(INK, accent?.soft, 55);
  const dim = tinted(DIM, accent?.soft, 45);
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {artUrl && (
        <img
          src={artUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-[0.13] blur-3xl saturate-150"
        />
      )}

      {/* clock at the top, the song in the middle, the bar and the buttons along the foot, so it fills the screen */}
      <div
        className={`relative flex h-full flex-col justify-between ${upright ? 'px-8 py-10' : 'px-12 py-7'}`}
        style={{ color: ink }}>
        <div>{clock(upright ? 60 : 114, ink)}</div>

        <div className="min-w-0">
          <FitTitle
            text={title}
            max={upright ? 40 : 48}
            lines={2}
            className="font-display leading-[1.12] font-medium tracking-display"
          />
          <div className="mt-1.5 truncate text-[1.5rem]" style={{ color: dim }}>
            {artist}
          </div>
        </div>

        <div className={`flex gap-6 ${upright ? 'flex-col items-stretch' : 'items-center'}`}>
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="font-mono text-row tabular-nums" style={{ color: dim }}>
              {fmt(elapsed)}
            </span>
            <div className="min-w-0 flex-1">{seek(dim, ink)}</div>
            <span className="font-mono text-row tabular-nums" style={{ color: dim }}>
              {remaining ? `-${fmt(Math.max(0, duration - elapsed))}` : fmt(duration)}
            </span>
          </div>

          {showTransport && (
            // big enough to hit without looking, and still dim: an outline rather than a lit button
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className={`shrink-0 gap-3 ${upright ? 'justify-center' : ''}`}
              button="h-16 w-16"
              play="h-20 w-20 rounded-full ring-2 ring-current"
              icon="h-11 w-11"
            />
          )}
        </div>
      </div>
    </div>
  );
}
