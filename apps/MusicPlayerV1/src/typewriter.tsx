// typewriter: each song typed onto the sheet a letter at a time when it starts, the last few still on the page above
// it, with the machine's round keys for the buttons
import { useEffect, useState } from 'react';

import { Transport, cells, type StyleProps } from './style-kit';

const KEY_MS = 55;
const PAGE = 4;

// what is already on the page; the style is rebuilt for every track, so this lives here, until the app reloads
const page: { title: string; artist: string }[] = [];

function useTyped(text: string, motion: boolean) {
  const letters = cells(text);
  const [n, setN] = useState(motion ? 0 : letters.length);
  useEffect(() => {
    if (!motion) return setN(letters.length);
    setN(0);
    const timer = setInterval(() => setN(k => (k >= letters.length ? (clearInterval(timer), k) : k + 1)), KEY_MS);
    return () => clearInterval(timer);
    // keyed on the text rather than the letters, which are rebuilt from it every render
  }, [text, motion]);
  return { shown: letters.slice(0, n).join(''), done: n >= letters.length };
}

export function Typewriter({ title, artist, playing, motion, upright, showTransport, seek, onToggle, onPrev, onNext }: StyleProps) {
  if (page[page.length - 1]?.title !== title) {
    page.push({ title, artist });
    if (page.length > PAGE + 1) page.shift();
  }
  page[page.length - 1].artist = artist;
  const earlier = page.slice(0, -1);
  const line = `${title} — ${artist}`;
  const { shown, done } = useTyped(line, motion);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#1b1a18]">
      <div className={`flex h-full flex-col ${upright ? 'px-5 pt-5' : 'px-12 pt-6'}`}>
        {/* the sheet, ruled faintly, with the typing line near its foot as on a real platen */}
        <div className="relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden rounded-t-sm bg-[#f6f1e4] px-8 pb-5 font-mono text-[#26231f] shadow-[0_-10px_30px_rgba(0,0,0,0.5)] [background-image:repeating-linear-gradient(transparent_0_31px,rgba(80,110,160,0.12)_31px_32px)]">
          {earlier.map((l, i) => (
            <div key={i + l.title} className="truncate text-[17px] leading-8 opacity-45">
              {l.title} — {l.artist}
            </div>
          ))}
          <div className="text-[24px] leading-9 font-bold break-words">
            {shown}
            {/* the carriage: a block where the next letter strikes, blinking once the line is done */}
            <span className={`ml-0.5 inline-block h-6 w-3 translate-y-1 bg-[#26231f] ${done ? 'animate-pulse' : ''}`} />
          </div>
          <div className="mt-3">{seek('#26231f', '#26231f')}</div>
        </div>

        {/* the machine's body across the foot, with its keys */}
        <div className="flex h-[96px] shrink-0 items-center justify-center rounded-b-2xl bg-gradient-to-b from-[#2e2c29] to-[#151413] ring-1 ring-white/5">
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="gap-5 text-[#f6f1e4]"
              button="h-14 w-14 rounded-full bg-[#111] ring-[3px] ring-[#b9b4aa] shadow-[0_4px_0_#000]"
              play="h-16 w-16 rounded-full bg-[#111] ring-[3px] ring-[#b9b4aa] shadow-[0_4px_0_#000]"
              icon="h-7 w-7"
            />
          )}
        </div>
      </div>
    </div>
  );
}
