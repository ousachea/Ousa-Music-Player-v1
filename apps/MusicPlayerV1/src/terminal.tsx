// terminal: the song printed on a green-on-black command line. each new song prints a fresh block under the last
// few, with an ascii progress bar and a cursor waiting at the prompt; the buttons are bracketed commands
import { useEffect, useState } from 'react';

import { cells, fmt, type StyleProps } from './style-kit';

const GREEN = '#39ff7a';
const KEY_MS = 18;
const KEPT = 3;

// what has already scrolled past; the style is rebuilt for every track, so this lives here until the app reloads
const log: { title: string; artist: string }[] = [];

export function Terminal({
  title,
  artist,
  album,
  playing,
  motion,
  upright,
  showTransport,
  progress,
  elapsed,
  duration,
  onToggle,
  onPrev,
  onNext,
}: StyleProps) {
  if (log[log.length - 1]?.title !== title) {
    log.push({ title, artist });
    if (log.length > KEPT + 1) log.shift();
  }
  log[log.length - 1].artist = artist;
  const earlier = log.slice(0, -1);

  // the new block prints a character at a time, the way output streams in
  const block = `track   : ${title}\nartist  : ${artist}${album ? `\nalbum   : ${album}` : ''}`;
  const letters = cells(block);
  const [n, setN] = useState(motion ? 0 : letters.length);
  useEffect(() => {
    if (!motion) return setN(letters.length);
    setN(0);
    const timer = setInterval(() => setN(k => (k >= letters.length ? (clearInterval(timer), k) : k + 1)), KEY_MS);
    return () => clearInterval(timer);
    // keyed on the block's text; the letters are rebuilt from it every render
  }, [block, motion]);

  const width = upright ? 22 : 40;
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * width);
  const glow = { color: GREEN, textShadow: `0 0 6px color-mix(in srgb, ${GREEN} 60%, transparent)` };
  const command = (label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className="h-14 rounded-sm px-4 ring-1 transition active:bg-[#39ff7a] active:text-black"
      style={{ ...glow, ['--tw-ring-color' as string]: `color-mix(in srgb, ${GREEN} 45%, transparent)` }}>
      [ {label} ]
    </button>
  );

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#050806] font-mono">
      {/* the faint rows of an old monitor */}
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.25)_0_1px,transparent_1px_3px)]" />
      <div className={`relative flex h-full flex-col justify-end text-[17px] leading-[1.55] ${upright ? 'px-5 pb-6' : 'px-10 pb-7'}`} style={glow}>
        {earlier.map((l, i) => (
          <div key={i + l.title} className="truncate opacity-35">
            $ now-playing · {l.title} — {l.artist}
          </div>
        ))}
        <div className="mt-2">$ now-playing --watch</div>
        <div className="text-[20px] leading-[1.45] break-words whitespace-pre-wrap">
          {letters.slice(0, n).join('')}
        </div>
        <div className="mt-2 whitespace-pre">
          [{'#'.repeat(filled)}
          <span className="opacity-30">{'.'.repeat(width - filled)}</span>] {fmt(elapsed)} / {fmt(duration)}{' '}
          {playing ? '▶ playing' : '‖ paused'}
        </div>
        <div className="mt-1">
          $ <span className="inline-block h-5 w-2.5 translate-y-1 animate-pulse" style={{ background: GREEN }} />
        </div>
        {showTransport && (
          <div className={`mt-5 flex gap-3 ${upright ? 'justify-between' : ''}`}>
            {command('prev', onPrev)}
            {command(playing ? 'pause' : 'play', onToggle)}
            {command('next', onNext)}
          </div>
        )}
      </div>
    </div>
  );
}
