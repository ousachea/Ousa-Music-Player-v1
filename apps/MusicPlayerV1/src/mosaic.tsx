// mosaic: a wall of what has played, the newest nearest the middle, where the song playing now is large and lit;
// the further back a cover is, the darker it sits. every so often a tile turns over to show another cover, and the
// one in the middle slowly pushes in and back
import { useEffect, useState } from 'react';

import { FitTitle } from './fit-title';
import type { Queue } from './queue';
import { Transport, type StyleProps } from './style-kit';

// how often a tile turns over
const TURN_MS = 2600;

export function Mosaic({
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

  // history arrives newest last and repeats itself: a song played twice, or an album's tracks sharing one cover. each
  // cover goes on the wall once, newest first, and never the one already large in the middle
  const seen = new Set<string>([queue?.current?.artworkId ?? '', `${title}|${artist}`]);
  const played = [...(queue?.previous ?? [])].reverse().filter(item => {
    const keys = [item.artworkId ?? '', `${item.title ?? ''}|${item.artist ?? ''}`].filter(k => k && k !== '|');
    if (keys.some(k => seen.has(k))) return false;
    keys.forEach(k => seen.add(k));
    return true;
  });
  const tint = accent?.fill ?? '#ffffff';

  // the covers there are to show, and which one each free cell shows; it starts newest nearest the middle
  const pool = played.flatMap(item => (item.artworkId && thumbs[item.artworkId] ? [thumbs[item.artworkId]] : []));
  const poolKey = pool.join('|');
  const [shown, setShown] = useState<string[]>([]);
  useEffect(() => {
    setShown(prev => {
      // a cell keeps its cover while it is still in the history; an empty one takes the newest not yet up
      const kept = free.map((_, i) => (prev[i] && pool.includes(prev[i]) ? prev[i] : ''));
      const used = new Set(kept);
      return kept.map(u => {
        if (u) return u;
        const next = pool.find(p => !used.has(p)) ?? '';
        used.add(next);
        return next;
      });
    });
    // keyed on the covers and the cell count; the arrays themselves are rebuilt every render
  }, [poolKey, free.length]);
  useEffect(() => {
    if (!motion) return;
    const timer = setInterval(
      () =>
        setShown(prev => {
          const filled = prev.flatMap((u, i) => (u ? [i] : []));
          if (filled.length === 0) return prev;
          const at = filled[Math.floor(Math.random() * filled.length)];
          const next = [...prev];
          // a cover not on the wall yet if there is one, otherwise two tiles trade places
          const spare = pool.filter(u => !prev.includes(u));
          if (spare.length) next[at] = spare[Math.floor(Math.random() * spare.length)];
          else if (filled.length > 1) {
            const other = filled.filter(i => i !== at)[Math.floor(Math.random() * (filled.length - 1))];
            [next[at], next[other]] = [next[other], next[at]];
          }
          return next;
        }),
      TURN_MS,
    );
    return () => clearInterval(timer);
  }, [motion, poolKey]);
  const place = (c: number, r: number, w = 1, h = 1) => ({ gridColumn: `${c + 1} / span ${w}`, gridRow: `${r + 1} / span ${h}` });

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div className="grid h-full w-full gap-[3px] p-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rowsN}, 1fr)` }}>
        {free.map(({ c, r }, i) => {
          const url = shown[i] || null;
          return (
            <div
              key={`${c}-${r}`}
              className="overflow-hidden rounded-[6px] bg-white/[0.04] transition-opacity duration-700"
              style={{ ...place(c, r), opacity: url ? Math.max(0.22, 0.85 - i * 0.04) : 1 }}>
              {/* keyed on the cover, so a new one turns in rather than just appearing */}
              {url && <img key={url} src={url} alt="" className={`h-full w-full object-cover ${motion ? 'animate-turn-in' : ''}`} />}
            </div>
          );
        })}

        <button
          onClick={onToggle}
          aria-label={playing ? 'pause' : 'play'}
          className="relative overflow-hidden rounded-[10px] ring-2 transition active:scale-[0.99]"
          style={{ ...place(middle.c, middle.r, middle.w, middle.h), ['--tw-ring-color' as string]: tint, boxShadow: `0 0 30px color-mix(in srgb, ${tint} 45%, transparent)` }}>
          {artUrl && <img src={artUrl} alt="" className={`absolute inset-0 h-full w-full object-cover ${motion ? 'animate-push' : ''}`} />}
        </button>

        <div className="flex min-w-0 flex-col justify-center gap-5 rounded-[10px] bg-[#0c0d0f]/95 px-5 py-3 ring-1 ring-white/10" style={place(panel.c, panel.r, panel.w, panel.h)}>
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
