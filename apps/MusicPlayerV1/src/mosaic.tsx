// mosaic: a wall of what has played, the newest nearest the middle, where the song playing now is large and lit;
// the further back a cover is, the darker it sits
import { FitTitle } from './fit-title';
import type { Queue } from './queue';
import { Transport, type StyleProps } from './style-kit';

export function Mosaic({
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
}: StyleProps & { queue: Queue | null; thumbs: Record<string, string> }) {
  // a 6 by 4 wall turned 4 by 6 upright; the middle four cells are the song playing now and the row under it the panel
  const cols = upright ? 4 : 6;
  const rowsN = upright ? 7 : 4;
  const middle = upright ? { c: 1, r: 1, w: 2, h: 2 } : { c: 2, r: 0, w: 2, h: 2 };
  const panel = upright ? { c: 0, r: 3, w: 4, h: 2 } : { c: 1, r: 2, w: 4, h: 2 };
  const taken = (c: number, r: number) =>
    [middle, panel].some(b => c >= b.c && c < b.c + b.w && r >= b.r && r < b.r + b.h);

  // the free cells, nearest the middle first, so the newest covers gather round the one playing
  const cx = middle.c + middle.w / 2 - 0.5;
  const cy = middle.r + middle.h / 2 - 0.5;
  const free: { c: number; r: number; d: number }[] = [];
  for (let r = 0; r < rowsN; r++) for (let c = 0; c < cols; c++) if (!taken(c, r)) free.push({ c, r, d: Math.hypot(c - cx, r - cy) });
  free.sort((a, b) => a.d - b.d);

  // history arrives oldest first and can end on the song playing
  const played = (queue?.previous ?? []).filter((item, i, all) => !(i === all.length - 1 && item.title === title)).reverse();
  const tint = accent?.fill ?? '#ffffff';
  const place = (c: number, r: number, w = 1, h = 1) => ({ gridColumn: `${c + 1} / span ${w}`, gridRow: `${r + 1} / span ${h}` });

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div className="grid h-full w-full gap-[3px] p-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rowsN}, 1fr)` }}>
        {free.map(({ c, r }, i) => {
          const item = played[i];
          const url = item?.artworkId ? thumbs[item.artworkId] : null;
          return (
            <div
              key={`${c}-${r}`}
              className="overflow-hidden rounded-[6px] bg-white/[0.04] transition-opacity duration-700"
              style={{ ...place(c, r), opacity: url ? Math.max(0.22, 0.85 - i * 0.04) : 1 }}>
              {url && <img src={url} alt="" className="h-full w-full object-cover" />}
            </div>
          );
        })}

        <button
          onClick={onToggle}
          aria-label={playing ? 'pause' : 'play'}
          className="relative overflow-hidden rounded-[10px] ring-2 transition active:scale-[0.99]"
          style={{ ...place(middle.c, middle.r, middle.w, middle.h), ['--tw-ring-color' as string]: tint, boxShadow: `0 0 30px color-mix(in srgb, ${tint} 45%, transparent)` }}>
          {artUrl && <img src={artUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        </button>

        <div className="flex min-w-0 flex-col justify-center gap-2 rounded-[10px] bg-[#0c0d0f]/95 px-5 py-3 ring-1 ring-white/10" style={place(panel.c, panel.r, panel.w, panel.h)}>
          <div className="flex min-w-0 items-center gap-4">
            <div className="min-w-0 flex-1">
              <FitTitle text={title} max={24} lines={2} className="font-display leading-tight font-semibold text-white" />
              <div className="truncate text-row text-white/60">{artist}</div>
            </div>
            {showTransport && (
              <Transport
                playing={playing}
                onToggle={onToggle}
                onPrev={onPrev}
                onNext={onNext}
                className="shrink-0 gap-1 text-white"
                button="h-12 w-12"
                play="h-14 w-14 rounded-full bg-white text-black"
                icon="h-7 w-7"
              />
            )}
          </div>
          <div>{seek(accent?.fill ?? '#ffffff', accent?.fill2 ?? '#ffffff')}</div>
        </div>
      </div>
    </div>
  );
}
