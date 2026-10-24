// jukebox: what is playing under a lit arch, and what is queued as the title strips a jukebox's selector shows.
// a strip plays its song
import { FitTitle } from './fit-title';
import type { Queue } from './queue';
import { Transport, type StyleProps } from './style-kit';

const STRIPS = 8;

export function Jukebox({
  artUrl,
  title,
  artist,
  accent,
  playing,
  upright,
  showTransport,
  seek,
  onToggle,
  onPrev,
  onNext,
  queue,
  thumbs,
  onSkipTo,
}: StyleProps & { queue: Queue | null; thumbs: Record<string, string>; onSkipTo: (index: number) => void }) {
  const next = (queue?.items ?? []).slice(0, upright ? 6 : STRIPS);
  const glow = accent?.fill ?? '#ff8a3d';
  const glow2 = accent?.fill2 ?? '#ff3d7f';

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#120d0b]">
      <div className={`flex h-full gap-6 p-6 ${upright ? 'flex-col' : ''}`}>
        {/* the arch: chrome rim, a lit tube in the album's colours, the cover in the window */}
        <div
          className={`relative flex shrink-0 flex-col items-center rounded-t-[160px] rounded-b-3xl p-[6px] ${upright ? 'w-full' : 'w-[300px]'}`}
          style={{ background: `linear-gradient(180deg, ${glow}, ${glow2})`, boxShadow: `0 0 40px ${glow}55` }}>
          <div className="flex h-full w-full flex-col items-center rounded-t-[154px] rounded-b-[20px] bg-gradient-to-b from-[#2a211d] to-[#140f0d] px-5 pt-8 pb-4">
            <div className="aspect-square w-[180px] shrink-0 overflow-hidden rounded-full ring-4 ring-[#d9d4cc]/70">
              {artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="mt-4 w-full text-center">
              <FitTitle text={title} max={22} lines={2} className="font-display leading-tight font-semibold text-[#fbf3e4]" />
              <div className="mt-0.5 truncate text-row text-[#fbf3e4]/60">{artist}</div>
            </div>
            <div className="mt-auto w-full">{seek(glow, glow2)}</div>
            {showTransport && (
              <Transport playing={playing} onToggle={onToggle} onPrev={onPrev} onNext={onNext} className="justify-center gap-3 text-[#fbf3e4]" icon="h-7 w-7" />
            )}
          </div>
        </div>

        {/* the selector: two columns of strips behind glass */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl bg-[#1c1512] p-3 ring-1 ring-[#d9d4cc]/15">
          <div className="mb-2 px-1 font-mono text-eyebrow tracking-[0.3em] text-[#fbf3e4]/50 uppercase">Up next</div>
          {next.length === 0 ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-row text-[#fbf3e4]/45">
              Nothing queued on the phone. Queue songs there and they appear here.
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-2">
              {next.map((item, i) => (
                <button
                  key={`${item.uri}${i}`}
                  onClick={() => onSkipTo(i)}
                  className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-md bg-[#f4ecdc] p-1.5 pr-2.5 text-left transition active:scale-[0.97]">
                  <span className="grid h-full min-h-9 shrink-0 place-items-center rounded-sm bg-[#b3261e] px-1.5 font-mono text-[11px] font-bold text-white">
                    {String.fromCharCode(65 + Math.floor(i / 4))}
                    {(i % 4) + 1}
                  </span>
                  {item.artworkId && thumbs[item.artworkId] && (
                    <img src={thumbs[item.artworkId]} alt="" className="h-9 w-9 shrink-0 rounded-sm object-cover" />
                  )}
                  <span className="min-w-0 flex-1 border-y border-[#b3261e]/40 py-0.5">
                    <span className="block truncate text-[13px] leading-tight font-semibold text-[#2a1d16] uppercase">{item.title ?? 'unknown'}</span>
                    <span className="block truncate text-[11px] leading-tight text-[#2a1d16]/65">{item.artist ?? ''}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
