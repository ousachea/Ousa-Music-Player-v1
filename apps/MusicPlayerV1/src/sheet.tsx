// sheet music: the song engraved as a score. the title heads the page, the artist signs it as the composer, and a
// line of notes made from the song itself runs across the staff, inked in as the song plays past them
import { FitTitle } from './fit-title';
import { Transport, hash, type StyleProps } from './style-kit';

const NOTES = 24;
const GAP = 12;

// the same tune for the same song: a step on the staff for each note, and whether it is a quick one
function tune(seed: number) {
  const out: { step: number; quick: boolean }[] = [];
  let h = seed || 1;
  let step = 4;
  for (let i = 0; i < NOTES; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    // mostly steps and small leaps, the way a melody moves, kept on or near the staff
    step = Math.min(10, Math.max(-1, step + ((h % 5) - 2)));
    out.push({ step, quick: ((h >>> 8) & 3) === 0 });
  }
  return out;
}

export function SheetMusic({ title, artist, album, accent, playing, upright, showTransport, progress, seek, onToggle, onPrev, onNext }: StyleProps) {
  const ink = '#24201a';
  const tint = accent?.fill ?? '#9c2f2f';
  const notes = tune(hash(title + artist)).slice(0, upright ? NOTES / 2 : NOTES);
  const width = upright ? 440 : 740;
  const left = 70;
  const span = (width - left - 20) / notes.length;
  const top = 40;
  const lineY = (i: number) => top + i * GAP;
  // step 0 is the bottom line, each step half a gap up
  const noteY = (step: number) => top + 4 * GAP - (step * GAP) / 2;
  const head = left + progress * (width - left - 20);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#efe7d6]" style={{ background: 'radial-gradient(ellipse at 50% 30%, #f7f1e4, #e4d9c2)' }}>
      <div className={`flex h-full flex-col items-center ${upright ? 'justify-center gap-6 px-5' : 'justify-between px-8 pt-6 pb-6'}`}>
        <div className="w-full text-center" style={{ color: ink }}>
          <FitTitle text={title} max={upright ? 40 : 44} lines={2} className="font-display leading-[1.05] font-bold tracking-tight" />
          <div className={`mt-2 flex items-baseline gap-4 ${upright ? 'flex-col items-center gap-0' : 'justify-between'}`}>
            <div className="font-mono text-[11px] tracking-[0.25em] opacity-60">{album ? album.toUpperCase() : 'FOR ONE VOICE'}</div>
            <div className="font-hand text-[1.75rem] leading-none">{artist}</div>
          </div>
        </div>

        <svg viewBox={`0 0 ${width} 150`} className="w-full" style={{ color: ink }}>
          {[0, 1, 2, 3, 4].map(i => (
            <line key={i} x1="10" x2={width - 10} y1={lineY(i)} y2={lineY(i)} stroke="currentColor" strokeWidth="1.4" opacity="0.8" />
          ))}
          <line x1="10" x2="10" y1={lineY(0)} y2={lineY(4)} stroke="currentColor" strokeWidth="2" />
          <line x1={width - 10} x2={width - 10} y1={lineY(0)} y2={lineY(4)} stroke="currentColor" strokeWidth="4" />
          <line x1={width - 18} x2={width - 18} y1={lineY(0)} y2={lineY(4)} stroke="currentColor" strokeWidth="1.4" />
          {/* the time signature in place of a clef, set in the face the rest of the page uses */}
          <text x="36" y={lineY(2) - 2} textAnchor="middle" fill="currentColor" className="font-display" fontSize="26" fontWeight="800">
            4
          </text>
          <text x="36" y={lineY(4) - 2} textAnchor="middle" fill="currentColor" className="font-display" fontSize="26" fontWeight="800">
            4
          </text>
          {notes.map((n, i) => {
            const x = left + span * (i + 0.5);
            const y = noteY(n.step);
            const sung = x <= head;
            const colour = sung ? tint : 'currentColor';
            const up = n.step < 4;
            return (
              <g key={i} opacity={sung ? 1 : 0.55}>
                <ellipse cx={x} cy={y} rx="7.5" ry="5.5" transform={`rotate(-20 ${x} ${y})`} fill={colour} />
                <line x1={up ? x + 6.5 : x - 6.5} x2={up ? x + 6.5 : x - 6.5} y1={y} y2={up ? y - 36 : y + 36} stroke={colour} strokeWidth="1.8" />
                {n.quick && <path d={up ? `M ${x + 6.5} ${y - 36} q 12 8 8 22` : `M ${x - 6.5} ${y + 36} q 12 -8 8 -22`} fill="none" stroke={colour} strokeWidth="2" />}
              </g>
            );
          })}
          {/* bar lines every four notes */}
          {[4, 8, 12, 16, 20].filter(b => b < notes.length).map(b => (
            <line key={b} x1={left + span * b} x2={left + span * b} y1={lineY(0)} y2={lineY(4)} stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
          ))}
          <line x1={head} x2={head} y1={lineY(0) - 14} y2={lineY(4) + 14} stroke={tint} strokeWidth="2" opacity={playing ? 0.9 : 0.4} />
        </svg>

        <div className={`flex w-full items-center gap-6 ${upright ? 'flex-col' : ''}`}>
          <div className="w-full min-w-0 flex-1">{seek(tint, accent?.fill2 ?? tint)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="shrink-0 gap-2"
              button="h-14 w-14 text-[#24201a]"
              play="h-16 w-16 rounded-full bg-[#24201a] text-[#efe7d6]"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
