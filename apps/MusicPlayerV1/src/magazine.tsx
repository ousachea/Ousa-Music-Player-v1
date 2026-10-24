// magazine: the cover laid out as the front of a magazine. a masthead across the top, the art full bleed, the title
// as the cover story over it, and the artist, album and running time as the smaller cover lines down the side
import { FitTitle } from './fit-title';
import { Transport, fmt, hash, type StyleProps } from './style-kit';

export function Magazine({
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
  seek,
  onToggle,
  onPrev,
  onNext,
}: StyleProps) {
  const tint = accent?.fill ?? '#ff3b30';
  const issue = 1 + (hash(title + artist) % 240);
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase();

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {artUrl && <img src={artUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {/* dark at the top for the masthead and at the foot for the story, clear in the middle for the art */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/85" />

      <div className={`relative flex h-full flex-col ${upright ? 'px-6 pt-5 pb-6' : 'px-8 pt-3 pb-6'}`}>
        <div className="flex items-end justify-between gap-4">
          <div className="font-display text-[92px] leading-[0.85] font-black tracking-[-0.04em] text-white uppercase drop-shadow-[0_4px_18px_rgba(0,0,0,0.4)]" style={{ color: tint }}>
            O-Music
          </div>
          <div className="pb-2 text-right font-mono text-[11px] leading-tight tracking-[0.2em] text-white/85">
            <div>ISSUE {String(issue).padStart(3, '0')}</div>
            <div>{month}</div>
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 justify-between gap-6">
          {/* the cover lines down the side, labelled in white with a mark of the album's colour, so they read on any cover */}
          <div className="flex w-[220px] flex-col gap-4 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            <div>
              <div className="border-l-2 pl-1.5 font-mono text-[10px] tracking-[0.3em] text-white/80" style={{ borderColor: tint }}>
                IN CONVERSATION
              </div>
              <div className="font-display text-[1.25rem] leading-tight font-bold">{artist}</div>
            </div>
            {album && (
              <div>
                <div className="border-l-2 pl-1.5 font-mono text-[10px] tracking-[0.3em] text-white/80" style={{ borderColor: tint }}>
                  THE RECORD
                </div>
                <div className="font-display text-row leading-tight font-semibold">{album}</div>
              </div>
            )}
            <div>
              <div className="border-l-2 pl-1.5 font-mono text-[10px] tracking-[0.3em] text-white/80" style={{ borderColor: tint }}>
                PLUS
              </div>
              <div className="font-display text-row leading-tight font-semibold">
                {fmt(duration)} of new music, {fmt(elapsed)} in
              </div>
            </div>
          </div>
          {/* a barcode in the corner, as every cover has */}
          {!upright && (
            <div className="self-start rounded-sm bg-white p-1.5">
              <div className="flex h-10 gap-[2px]">
                {Array.from({ length: 18 }, (_, i) => (
                  <div key={i} className="h-full bg-black" style={{ width: 1 + ((hash(title) >>> i) % 3) }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* the cover story */}
        <div className="flex items-end gap-6">
          <div className="min-w-0 flex-1">
            <FitTitle text={title} max={54} lines={2} className="font-display leading-[0.95] font-black tracking-[-0.02em] text-white uppercase" />
            <div className="mt-4">{seek(tint, accent?.fill2 ?? tint)}</div>
          </div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="shrink-0 gap-2 text-white"
              button="h-14 w-14"
              play="h-16 w-16 rounded-full bg-white text-black"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
