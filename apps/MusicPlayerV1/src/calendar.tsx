// calendar: a tear-off desk calendar with the song as the day's entry. the date is today's, the cover is pinned to
// the page, and the song is written in under it. tap the page to tear it off; the same day is under it
import { useState } from 'react';

import { FitTitle } from './fit-title';
import { Transport, type StyleProps } from './style-kit';

export function Calendar({ artUrl, title, artist, album, accent, playing, upright, showTransport, seek, onToggle, onPrev, onNext }: StyleProps) {
  const [torn, setTorn] = useState(false);
  const tint = accent?.fill ?? '#d7263d';
  const today = new Date();
  const month = today.toLocaleDateString(undefined, { month: 'long' }).toUpperCase();
  const weekday = today.toLocaleDateString(undefined, { weekday: 'long' });
  const year = today.getFullYear();

  const tear = () => {
    if (torn) return;
    setTorn(true);
    setTimeout(() => setTorn(false), 1400);
  };

  // the page itself, drawn twice: once torn away on top, once whole underneath
  const page = (
    <div className="flex h-full flex-col overflow-hidden rounded-b-lg bg-[#fbfaf6]">
      <div className="py-2 text-center font-display text-[22px] font-black tracking-[0.3em] text-white" style={{ background: tint }}>
        {month} {year}
      </div>
      <div className={`flex min-h-0 flex-1 ${upright ? 'flex-col items-center gap-3 p-4' : 'items-center gap-6 px-6'}`}>
        <div className="shrink-0 text-center">
          <div className="font-display text-[150px] leading-[0.85] font-black tracking-[-0.01em]" style={{ color: tint }}>
            {today.getDate()}
          </div>
          <div className="mt-1 font-display text-[22px] font-semibold text-[#3a342c]">{weekday}</div>
        </div>
        <div className={`flex min-w-0 flex-1 flex-col gap-2 ${upright ? 'w-full items-center text-center' : ''}`}>
          {/* the cover pinned on with a strip of tape */}
          <div className="relative w-[120px] rotate-2 shadow-[0_4px_10px_rgba(0,0,0,0.25)]">
            <div className="absolute -top-3 left-1/2 z-[1] h-5 w-16 -translate-x-1/2 -rotate-3 bg-[#f3e6a8]/80" />
            <div className="aspect-square bg-[#ddd]">{artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover" />}</div>
          </div>
          <div className="mt-2 w-full border-t border-[#3a342c]/15 pt-2 text-[#2b2620]">
            <FitTitle text={title} max={30} lines={2} className="font-display leading-[1.08] font-bold" />
            <div className="truncate font-hand text-[1.6rem] leading-tight" style={{ color: tint }}>
              {artist}
              {album ? `, ${album}` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#3b3530]" style={{ ['--tint' as string]: tint, background: 'radial-gradient(ellipse at 50% 30%, #5a4f45, #2a2521)' }}>
      <div className={`flex h-full items-center ${upright ? 'flex-col justify-center gap-6 px-6' : 'gap-8 px-8'}`}>
        <div className={`relative shrink-0 ${upright ? 'h-[520px] w-full' : 'h-[420px] w-[470px]'}`}>
          {/* the binding across the top, with its rings */}
          <div className="absolute inset-x-0 top-0 z-[2] flex h-6 items-center justify-around rounded-t-lg bg-[#22201d] px-6">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="h-7 w-2 -translate-y-2 rounded-full bg-gradient-to-b from-[#ddd] to-[#777]" />
            ))}
          </div>
          <div className="absolute inset-x-0 top-6 bottom-0 shadow-[0_14px_30px_rgba(0,0,0,0.45)]">{page}</div>
          <button
            aria-label="tear off the page"
            onClick={tear}
            className={`absolute inset-x-0 top-6 bottom-0 origin-top-left transition-[transform,opacity] duration-700 ease-in ${torn ? 'translate-y-24 rotate-[18deg] opacity-0' : ''}`}>
            {page}
          </button>
        </div>

        <div className={`flex min-w-0 flex-1 flex-col gap-5 ${upright ? 'w-full' : ''}`}>
          <div className="font-mono text-[11px] tracking-[0.3em] text-white/60">{playing ? "TODAY'S SONG" : 'ON HOLD'}</div>
          <div className="w-full">{seek(tint, accent?.fill2 ?? tint)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className={`gap-2 text-white ${upright ? 'justify-center' : ''}`}
              button="h-14 w-14 rounded-md border-t-[6px] border-[var(--tint)] bg-[#fbfaf6] text-[#2a2521] shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
              play="h-16 w-16 rounded-md border-t-[8px] border-[var(--tint)] bg-[#fbfaf6] text-[#2a2521] shadow-[0_6px_14px_rgba(0,0,0,0.4)]"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
