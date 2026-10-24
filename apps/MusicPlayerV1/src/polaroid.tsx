// polaroid: the cover as an instant print with the title written under it by hand, dropped at its own slight angle
// on a table, an older print showing beneath it
import { FitTitle } from './fit-title';
import { Transport, fmt, hash, type StyleProps } from './style-kit';

export function Polaroid({
  artUrl,
  title,
  artist,
  album,
  accent,
  playing,
  upright,
  showTransport,
  elapsed,
  duration,
  remaining,
  seek,
  onToggle,
  onPrev,
  onNext,
}: StyleProps) {
  const h = hash(title + artist);
  // between -4 and 4 degrees, fixed per track, so the print lands differently each time
  const tilt = ((h % 81) - 40) / 10;
  const under = tilt > 0 ? -5 - (h % 3) : 5 + (h % 3);
  const table = accent ? `color-mix(in oklab, ${accent.fill2} 30%, #17120f)` : '#17120f';
  const width = upright ? 330 : 300;

  const print = (
    <div className="relative shrink-0" style={{ width, height: width * 1.26 }}>
      <div className="absolute inset-0 bg-[#ece8df] shadow-[0_12px_30px_rgba(0,0,0,0.5)]" style={{ transform: `rotate(${under}deg)` }} />
      <div
        className="absolute inset-0 flex flex-col bg-[#faf8f3] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
        style={{ transform: `rotate(${tilt}deg)` }}>
        <div className="aspect-square w-full shrink-0 overflow-hidden bg-[#1a1a1a]">
          {artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover saturate-[1.1] sepia-[0.08]" />}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-1 text-center">
          <FitTitle text={title} max={34} lines={2} className="w-full font-hand leading-[1.05] font-bold text-[#22324f]" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 overflow-hidden transition-[background] duration-700" style={{ background: `radial-gradient(ellipse at 40% 40%, ${table}, #0b0908)` }}>
      <div className={`flex h-full items-center ${upright ? 'flex-col justify-center gap-8 px-6' : 'gap-12 px-12'}`}>
        {print}
        <div className={`flex min-w-0 flex-col ${upright ? 'w-full items-center text-center' : 'flex-1'}`}>
          <div className="font-hand text-[30px] leading-tight text-[#f4efe6]">{artist}</div>
          {album && <div className="mt-1 truncate text-row text-[#f4efe6]/55">{album}</div>}
          <div className="mt-6 flex w-full items-center gap-4">
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
              className={`mt-6 gap-5 text-[#f4efe6] ${upright ? 'justify-center' : '-ml-2'}`}
              play="grid h-16 w-16 place-items-center rounded-full bg-[#faf8f3] text-[#22324f]"
            />
          )}
        </div>
      </div>
    </div>
  );
}
