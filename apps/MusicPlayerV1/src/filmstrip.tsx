// film strip: what has played runs past as frames on a strip of film, sprocket holes and all, and the song playing now
// sits lit in the projector's gate in the middle of it
import { FitTitle } from './fit-title';
import type { Queue } from './queue';
import { Transport, type StyleProps } from './style-kit';

const FRAME = 150;
const GAP = 14;

// a row of sprocket holes along one edge of the strip
function Sprockets() {
  return <div className="h-3 w-full bg-[repeating-linear-gradient(90deg,transparent_0_8px,#e9e4d8_8px_20px,transparent_20px_28px)] opacity-80" />;
}

export function FilmStrip({
  artUrl,
  title,
  artist,
  accent,
  playing,
  motion,
  upright,
  showTransport,
  seek,
  onToggle,
  onPrev,
  onNext,
  queue,
  thumbs,
}: StyleProps & { queue: Queue | null; thumbs: Record<string, string> }) {
  // each cover once, newest first, and never the one in the gate
  const seen = new Set<string>([queue?.current?.artworkId ?? '']);
  const frames = [...(queue?.previous ?? [])].reverse().flatMap(item => {
    const url = item.artworkId ? thumbs[item.artworkId] : null;
    if (!url || seen.has(item.artworkId!)) return [];
    seen.add(item.artworkId!);
    return [url];
  });
  // the strip is drawn twice end to end and slid by one length, so the loop has no seam; it needs enough frames to
  // cover the screen, so a short history repeats round
  const reel = frames.length ? Array.from({ length: Math.max(1, Math.ceil(10 / frames.length)) }, () => frames).flat() : [];
  const length = reel.length * (FRAME + GAP);
  const tint = accent?.fill ?? '#f5c542';

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0a0a0b]">
      {/* the strip */}
      <div className={`absolute inset-x-0 overflow-hidden bg-[#141414] py-2 ${upright ? 'top-24' : 'top-8'}`}>
        <Sprockets />
        <div className="my-2 h-[150px] overflow-hidden">
          {reel.length > 0 && (
            <div
              className={`flex h-full w-max ${motion && playing ? 'animate-reel' : ''}`}
              style={{ gap: GAP, paddingLeft: GAP, ['--reel' as string]: `-${length}px`, animationDuration: `${reel.length * 4}s` }}>
              {[...reel, ...reel].map((url, i) => (
                <img key={i} src={url} alt="" className="h-full shrink-0 rounded-[3px] object-cover opacity-60 sepia-[0.25]" style={{ width: FRAME }} />
              ))}
            </div>
          )}
        </div>
        <Sprockets />

        {/* the gate: the song playing now, lit, over the middle of the running strip */}
        <div
          className="absolute top-1/2 left-1/2 aspect-square h-[190px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[4px] ring-4 ring-[#e9e4d8]"
          style={{ boxShadow: `0 0 50px color-mix(in srgb, ${tint} 55%, transparent), 0 0 0 9999px rgba(0,0,0,0.25)` }}>
          {artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover" />}
        </div>
      </div>

      {/* the credits under the screen */}
      <div className={`absolute inset-x-0 bottom-0 flex items-end gap-6 ${upright ? 'flex-col items-stretch px-6 pb-6' : 'px-10 pb-6'}`}>
        <div className="min-w-0 flex-1">
          <FitTitle text={title} max={28} lines={2} className="font-display leading-tight font-semibold text-white" />
          <div className="mb-4 truncate text-title text-white/60">{artist}</div>
          {seek(tint, accent?.fill2 ?? tint)}
        </div>
        {showTransport && (
          <Transport
            playing={playing}
            onToggle={onToggle}
            onPrev={onPrev}
            onNext={onNext}
            className={`shrink-0 gap-2 text-white ${upright ? 'justify-center' : ''}`}
            button="h-14 w-14"
            play="h-16 w-16 rounded-full bg-white text-black"
            icon="h-8 w-8"
          />
        )}
      </div>
    </div>
  );
}
