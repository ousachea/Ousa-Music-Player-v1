// receipt: every song printed on a till roll as it starts, with the time it came on, so what has played stacks up
// above what is playing. the roll scrolls with a finger
import { useEffect, useRef } from 'react';

import { Transport, fmt, type StyleProps } from './style-kit';

type Line = { key: string; title: string; artist: string; at: string; ms: number };

// the style is rebuilt for every track, so the roll lives here and lasts until the app reloads.
// shortcut: lost on reload, keep it in the doc store if a roll across restarts is wanted
const roll: Line[] = [];
const ROLL_MAX = 40;

function stamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function Receipt({
  title,
  artist,
  album,
  playing,
  motion,
  upright,
  showTransport,
  elapsed,
  duration,
  progress,
  onToggle,
  onPrev,
  onNext,
}: StyleProps) {
  // keyed on the title alone: the artist and the length can arrive after it, and must not print the song twice
  const key = title;
  if (roll[roll.length - 1]?.key !== key) {
    // between songs the phone can send no title for a moment; that placeholder is overwritten, not kept on the roll
    if (roll[roll.length - 1]?.key === 'unknown') roll.pop();
    roll.push({ key, title, artist, at: stamp(), ms: duration });
    if (roll.length > ROLL_MAX) roll.shift();
  }
  roll[roll.length - 1].artist = artist;
  roll[roll.length - 1].ms = duration;

  const paper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (paper.current) paper.current.scrollTop = paper.current.scrollHeight;
  }, [key]);

  const earlier = roll.slice(0, -1);
  const total = roll.reduce((sum, line) => sum + line.ms, 0);
  // the printed bar fills with the song, in the dotted rule a till prints, as wide as the roll allows
  const dots = upright ? 50 : 86;
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * dots);
  const current = roll[roll.length - 1];

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0e0d0c]">
      <div ref={paper} className="absolute inset-0 overflow-y-auto overscroll-contain font-mono text-[#2b2925] [scrollbar-width:none]">
        <div className={`min-h-full bg-[#f3efe6] ${showTransport ? 'pb-36' : 'pb-10'} pt-7 text-[13px] leading-[1.45] ${upright ? 'px-6' : 'px-10'}`}>
          <div>
            <div className="text-[15px] font-bold tracking-[0.3em]">O-MUSIC</div>
            <div className="truncate text-[11px] opacity-60">{album ?? 'now playing'}</div>
          </div>
          <div className="my-3 border-t border-dashed border-[#2b2925]/40" />

          {/* on a roll this wide an earlier song fits on one line: when it came on, what, who, how long */}
          {earlier.map(line => (
            <div key={line.key + line.at} className="flex items-baseline gap-4 py-0.5 opacity-55">
              <span className="w-11 shrink-0">{line.at}</span>
              <span className="min-w-0 flex-1 truncate uppercase">{line.title}</span>
              {!upright && <span className="w-40 shrink-0 truncate text-[11px]">{line.artist}</span>}
              <span className="w-10 shrink-0 text-right">{line.ms ? fmt(line.ms) : ''}</span>
            </div>
          ))}

          <div key={current.key} className={`mt-2 ${motion ? 'animate-feed' : ''}`}>
            <div className="flex justify-between gap-3 font-bold">
              <span>
                {current.at} {playing ? '>' : '||'}
              </span>
              <span>{duration ? fmt(duration) : ''}</span>
            </div>
            <div className="text-[22px] leading-tight font-bold break-words uppercase">{title}</div>
            <div className="text-[13px]">{artist}</div>
            <div className="mt-1.5 overflow-hidden tracking-[0.05em] whitespace-nowrap">
              {'#'.repeat(filled)}
              <span className="opacity-30">{'.'.repeat(dots - filled)}</span>
            </div>
            <div className="text-[11px] opacity-60">{fmt(elapsed)} played</div>
          </div>

          <div className="my-3 border-t border-dashed border-[#2b2925]/40" />
          <div className="flex justify-between font-bold">
            <span>
              {roll.length} {roll.length === 1 ? 'SONG' : 'SONGS'}
            </span>
            <span>{fmt(total)}</span>
          </div>
          <div className="mt-3 text-center text-[11px] opacity-60">THANK YOU FOR LISTENING</div>
        </div>
      </div>
      {/* the torn edge, pinned to the foot of the screen so the roll always reads as torn off, whatever is scrolled */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-[#0e0d0c]">
        <div className="h-full bg-[linear-gradient(135deg,#f3efe6_25%,transparent_25%),linear-gradient(225deg,#f3efe6_25%,transparent_25%)] bg-[length:12px_12px]" />
      </div>

      {showTransport && (
        <Transport
          playing={playing}
          onToggle={onToggle}
          onPrev={onPrev}
          onNext={onNext}
          // over the foot of the roll, where they stay put while it scrolls; the roll's padding lets its last line clear them
          className={`absolute bottom-6 gap-4 text-[#2b2925] ${upright ? 'right-4' : 'right-8'}`}
          play="grid h-[76px] w-[76px] place-items-center rounded-full bg-[#2b2925] text-[#f3efe6] shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
          icon="h-9 w-9"
        />
      )}
    </div>
  );
}
