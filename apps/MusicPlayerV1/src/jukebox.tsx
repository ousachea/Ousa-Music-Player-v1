// jukebox: what is playing under a lit arch, and what is queued as the title strips a jukebox's selector shows.
// a strip plays its song. a source with no queue of its own, a browser tab say, still has a history, so the
// selector falls back to what has played, where only the latest can be gone back to
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
}: StyleProps & {
  queue: Queue | null;
  thumbs: Record<string, string>;
  onSkipTo: (index: number) => void;
}) {
  const room = upright ? 6 : STRIPS;
  const next = (queue?.items ?? []).slice(0, room);
  // history arrives oldest first, and can end on the song that is playing
  const played = (queue?.previous ?? [])
    .filter((item, i, all) => !(i === all.length - 1 && item.title === title))
    .slice(-room)
    .reverse();
  const queued = next.length > 0;
  const strips = queued ? next : played;
  const glow = accent?.fill ?? '#ff8a3d';
  const glow2 = accent?.fill2 ?? '#ff3d7f';

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#120d0b]">
      <div className={`flex h-full gap-6 p-6 ${upright ? 'flex-col' : ''}`}>
        {/* the arch: chrome rim, a lit tube in the album's colours, the cover in the window */}
        <div
          className={`relative flex shrink-0 flex-col items-center rounded-t-[160px] rounded-b-3xl p-[6px] ${upright ? 'w-full' : 'w-[300px]'}`}
          style={{
            background: `linear-gradient(180deg, ${glow}, ${glow2})`,
            boxShadow: `0 0 40px color-mix(in srgb, ${glow} 33%, transparent)`,
          }}>
          <div className="flex h-full w-full flex-col items-center rounded-t-[154px] rounded-b-[20px] bg-gradient-to-b from-[#2a211d] to-[#140f0d] px-5 pt-8 pb-4">
            <div className="aspect-square w-[180px] shrink-0 overflow-hidden rounded-full ring-4 ring-[#d9d4cc]/70">
              {artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="mt-4 w-full text-center">
              <FitTitle
                text={title}
                max={22}
                lines={2}
                className="font-display leading-tight font-semibold text-[#fbf3e4]"
              />
              <div className="mt-0.5 truncate text-row text-[#fbf3e4]/60">{artist}</div>
            </div>
            <div className="mt-auto w-full">{seek(glow, glow2)}</div>
            {showTransport && (
              <Transport
                playing={playing}
                onToggle={onToggle}
                onPrev={onPrev}
                onNext={onNext}
                // chrome buttons on the cabinet, the middle one the big red select button
                className="mt-4 justify-center gap-3"
                button="h-11 w-11 rounded-full bg-gradient-to-b from-[#f4f1ea] to-[#9a948a] text-[#2a1d16] shadow-[0_3px_8px_rgba(0,0,0,0.5)]"
                play="h-14 w-14 rounded-full bg-gradient-to-b from-[#e8574c] to-[#9e1f17] text-white shadow-[0_4px_12px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.4)]"
                icon="h-6 w-6"
              />
            )}
          </div>
        </div>

        {/* the selector: two columns of strips behind glass */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl bg-[#1c1512] p-3 ring-1 ring-[#d9d4cc]/15">
          <div className="mb-2 px-1 font-mono text-eyebrow tracking-[0.3em] text-[#fbf3e4]/50 uppercase">
            {queued ? 'Up next' : 'Recently played'}
          </div>
          {strips.length === 0 ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-row text-[#fbf3e4]/45">
              Nothing queued yet. Songs you queue on the phone appear here, and what has played shows once a few have.
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-2">
              {strips.map((item, i) => {
                // a queued strip plays its song; of the history only the latest can be stepped back to
                const onTap = queued ? () => onSkipTo(i) : i === 0 ? onPrev : undefined;
                return (
                  <button
                    key={`${item.uri}${i}`}
                    onClick={onTap}
                    disabled={!onTap}
                    className={`flex min-w-0 items-center gap-2.5 overflow-hidden rounded-md bg-[#f4ecdc] p-1.5 pr-2.5 text-left transition active:scale-[0.97] ${
                      onTap ? '' : 'opacity-60'
                    }`}>
                    <span className="grid h-full min-h-9 shrink-0 place-items-center rounded-sm bg-[#b3261e] px-1.5 font-mono text-[11px] font-bold text-white">
                      {String.fromCharCode(65 + Math.floor(i / 4))}
                      {(i % 4) + 1}
                    </span>
                    {item.artworkId && thumbs[item.artworkId] && (
                      <img src={thumbs[item.artworkId]} alt="" className="h-9 w-9 shrink-0 rounded-sm object-cover" />
                    )}
                    <span className="min-w-0 flex-1 border-y border-[#b3261e]/40 py-0.5">
                      <span className="block truncate text-[13px] leading-tight font-semibold text-[#2a1d16] uppercase">
                        {item.title ?? 'unknown'}
                      </span>
                      <span className="block truncate text-[11px] leading-tight text-[#2a1d16]/65">
                        {item.artist ?? ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
