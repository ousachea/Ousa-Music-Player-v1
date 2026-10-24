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
  // the printed bar fills with the song, in the dotted rule a till prints
  const dots = 28;
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * dots);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,#2a2724,#0e0d0c)]">
      <div className={`flex h-full ${upright ? 'flex-col items-center gap-4 pt-6 pb-4' : 'items-center justify-center gap-10'}`}>
        <div
          ref={paper}
          className={`relative overflow-y-auto overscroll-contain bg-[#f3efe6] font-mono text-[#2b2925] shadow-[0_20px_50px_rgba(0,0,0,0.6)] [scrollbar-width:none] ${
            upright ? 'w-[400px] flex-1' : 'h-full w-[380px]'
          }`}>
          <div className="px-6 pt-8 pb-6 text-[13px] leading-[1.45]">
            <div className="text-center text-[15px] font-bold tracking-[0.3em]">O-MUSIC</div>
            <div className="text-center text-[11px] opacity-60">{album ?? 'now playing'}</div>
            <div className="my-3 border-t border-dashed border-[#2b2925]/40" />

            {earlier.map(line => (
              <div key={line.key + line.at} className="mb-2 opacity-55">
                <div className="flex justify-between gap-3">
                  <span>{line.at}</span>
                  <span>{line.ms ? fmt(line.ms) : ''}</span>
                </div>
                <div className="break-words uppercase">{line.title}</div>
                <div className="truncate text-[11px]">{line.artist}</div>
              </div>
            ))}

            <div key={roll[roll.length - 1].key} className={`mb-2 ${motion ? 'animate-feed' : ''}`}>
              <div className="flex justify-between gap-3 font-bold">
                <span>{roll[roll.length - 1].at} {playing ? '>' : '||'}</span>
                <span>{duration ? fmt(duration) : ''}</span>
              </div>
              <div className="text-[17px] leading-tight font-bold break-words uppercase">{title}</div>
              <div className="text-[12px]">{artist}</div>
              <div className="mt-1.5 tracking-[0.05em] whitespace-nowrap">
                {'#'.repeat(filled)}
                <span className="opacity-30">{'.'.repeat(dots - filled)}</span>
              </div>
              <div className="text-[11px] opacity-60">{fmt(elapsed)} played</div>
            </div>

            <div className="my-3 border-t border-dashed border-[#2b2925]/40" />
            <div className="flex justify-between font-bold">
              <span>{roll.length} {roll.length === 1 ? 'SONG' : 'SONGS'}</span>
              <span>{fmt(total)}</span>
            </div>
            <div className="mt-3 text-center text-[11px] opacity-60">THANK YOU FOR LISTENING</div>
          </div>
          {/* the torn edge at the foot of the roll */}
          <div className="h-3 bg-[linear-gradient(135deg,#f3efe6_25%,transparent_25%),linear-gradient(225deg,#f3efe6_25%,transparent_25%)] bg-[length:12px_12px]" />
        </div>

        {showTransport && (
          <Transport
            playing={playing}
            onToggle={onToggle}
            onPrev={onPrev}
            onNext={onNext}
            className={`text-[#f3efe6] ${upright ? 'gap-8' : 'flex-col gap-6'}`}
            play="grid h-16 w-16 place-items-center rounded-full bg-[#f3efe6] text-[#2b2925]"
          />
        )}
      </div>
    </div>
  );
}
