// ticket: the song as a concert ticket. the cover is the poster, the title the act, the artist the venue, and the stub
// carries a barcode and a seat made from the song itself. tap the stub to tear it off; a new one grows back
import { useState } from 'react';

import { FitTitle } from './fit-title';
import { Transport, fmt, hash, type StyleProps } from './style-kit';

// a barcode's bars from the song, so each song has its own and keeps it
function bars(seed: number) {
  const out: number[] = [];
  let h = seed || 1;
  for (let i = 0; i < 26; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    out.push(1 + (h % 4));
  }
  return out;
}

export function Ticket({
  artUrl,
  title,
  artist,
  album,
  accent,
  playing,
  upright,
  showTransport,
  elapsed,
  duration,
  seek,
  onToggle,
  onPrev,
  onNext,
}: StyleProps) {
  const [torn, setTorn] = useState(false);
  const h = hash(title + artist);
  const row = String.fromCharCode(65 + (h % 20));
  const seat = 1 + ((h >>> 5) % 40);
  const tint = accent?.fill ?? '#e94f37';
  const today = new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  const tear = () => {
    if (torn) return;
    setTorn(true);
    setTimeout(() => setTorn(false), 1800);
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#141210]" style={{ background: `radial-gradient(ellipse at 50% 40%, color-mix(in oklab, ${tint} 22%, #141210), #0b0a09)` }}>
      <div className={`flex h-full flex-col items-center justify-center ${upright ? 'gap-6 px-4' : 'gap-5 px-8'}`}>
        <div className={`flex w-full drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)] ${upright ? 'flex-col' : 'h-[300px]'}`}>
          {/* the main part: the poster and the bill */}
          <div className={`flex min-w-0 flex-1 overflow-hidden rounded-l-xl bg-[#f4ecdc] ${upright ? 'flex-col rounded-t-xl rounded-bl-none' : ''}`}>
            {/* the poster is square and shows the whole cover; a cover that is not square sits on a blur of itself */}
            <div className={`relative shrink-0 overflow-hidden bg-black ${upright ? 'h-[220px] w-full' : 'aspect-square h-full'}`}>
              {artUrl && (
                <>
                  <img src={artUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl" />
                  <img src={artUrl} alt="" className="relative h-full w-full object-contain" />
                </>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between p-5 text-[#2a211b]">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-[#2a211b]/60">
                <span className="rounded-[3px] px-1.5 py-0.5 font-bold text-white" style={{ background: tint }}>
                  ADMIT ONE
                </span>
                LIVE · ONE NIGHT
              </div>
              <div className="min-w-0">
                <FitTitle text={title} max={38} lines={2} className="font-display leading-[1.05] font-black tracking-tight uppercase" />
                <div className="mt-1 truncate font-display text-[1.25rem] font-semibold" style={{ color: tint }}>
                  at {artist}
                </div>
                {album && <div className="truncate text-row text-[#2a211b]/60">{album}</div>}
              </div>
              <div className="grid grid-cols-3 gap-3 border-t border-dashed border-[#2a211b]/30 pt-3 font-mono text-[11px] leading-tight">
                <div>
                  <div className="text-[#2a211b]/50">DATE</div>
                  <div className="font-bold">{today}</div>
                </div>
                <div>
                  <div className="text-[#2a211b]/50">DOORS</div>
                  <div className="font-bold">{fmt(elapsed)}</div>
                </div>
                <div>
                  <div className="text-[#2a211b]/50">ENDS</div>
                  <div className="font-bold">{fmt(duration)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* the stub, behind a perforated line with a notch at each end; a tap tears it away */}
          <button
            aria-label="tear the stub"
            onClick={tear}
            className={`relative flex shrink-0 animate-hint items-center justify-between border-dashed border-[#2a211b]/35 bg-[#f4ecdc] text-[#2a211b] transition-[transform,opacity] duration-700 ease-in ${
              upright ? 'h-[110px] w-full flex-row rounded-b-xl border-t-2 px-5' : 'w-[120px] flex-col rounded-r-xl border-l-2 py-5'
            } ${torn ? (upright ? 'translate-y-16 rotate-6 opacity-0' : 'translate-x-12 translate-y-10 rotate-12 opacity-0') : ''}`}>
            <div className={`font-mono text-[11px] font-bold tracking-[0.25em] ${upright ? '' : '[writing-mode:vertical-rl] rotate-180'}`}>
              ROW {row} · SEAT {seat}
            </div>
            {/* the bars run across the stub, so in the tall stub they stack down it rather than being turned */}
            <div className={`flex gap-[2px] ${upright ? 'h-12 items-stretch' : 'w-16 flex-col'}`}>
              {bars(h).map((w, i) => (
                <div key={i} className="bg-[#2a211b]" style={upright ? { width: w } : { height: w }} />
              ))}
            </div>
            <div className="font-mono text-[10px] text-[#2a211b]/60">No. {String(h % 100000).padStart(5, '0')}</div>
          </button>
        </div>

        <div className={`flex w-full items-center gap-6 ${upright ? 'flex-col' : ''}`}>
          <div className="w-full min-w-0 flex-1">{seek(tint, accent?.fill2 ?? tint)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="shrink-0 gap-2 text-[#f4ecdc]"
              button="h-14 w-14"
              play="h-16 w-16 rounded-full bg-[#f4ecdc] text-[#2a211b]"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
