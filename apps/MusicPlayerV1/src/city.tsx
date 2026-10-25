// night city: a skyline after dark whose windows light up left to right as the song plays, so the city itself is the
// progress bar. the song is on a billboard on the tallest roof, and the controls sit on the street below
import { FitTitle } from './fit-title';
import { Transport, hash, type StyleProps } from './style-kit';

function seq(seed: number) {
  let h = seed || 1;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    return (h % 10000) / 10000;
  };
}

const LAMP = '#ffd98a';

export function NightCity({ title, artist, accent, playing, upright, showTransport, progress, seek, onToggle, onPrev, onNext }: StyleProps) {
  const tint = accent?.fill ?? '#ff4fd8';
  const glow = accent?.soft ?? '#ff9be8';
  const width = upright ? 480 : 800;
  const height = upright ? 520 : 330;
  // the street keeps the skyline's feet clear of the controls laid over it
  const street = upright ? 150 : 96;

  // the buildings are laid out the same for the same song; only which windows are lit changes as it plays
  const rnd = seq(hash(title + artist));
  const buildings: { x: number; w: number; h: number }[] = [];
  for (let x = 0; x < width; ) {
    const w = 34 + Math.round(rnd() * 34);
    buildings.push({ x, w, h: street + (height - street) * (0.25 + rnd() * 0.55) });
    x += w + 2;
  }
  // one tower carries the billboard, so it is always tall enough to hold it up above the rest
  const tower = Math.min(buildings.length - 2, Math.max(1, Math.floor(rnd() * buildings.length)));
  buildings[tower].h = height * 0.86;
  buildings[tower].w = Math.max(buildings[tower].w, 52);
  const stars = Array.from({ length: 40 }, () => ({ x: rnd() * 100, y: rnd() * 45, r: 0.6 + rnd() * 1.2 }));
  const light = seq(hash(title));
  const sign = buildings[tower];
  const signX = Math.min(width - 170, Math.max(170, sign.x + sign.w / 2));

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(#04050d 0%, #0b0d24 45%, color-mix(in oklab, ${tint} 35%, #1a0f33) 100%)`, ['--tint' as string]: tint }}>
      {stars.map((s, i) => (
        <div key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r * 2, height: s.r * 2, opacity: 0.4 + (i % 3) * 0.2 }} />
      ))}
      <div className="absolute top-8 right-10 h-14 w-14 rounded-full bg-[#f4f1e6] shadow-[0_0_40px_rgba(244,241,230,0.5)]" />

      <svg viewBox={`0 0 ${width} ${height}`} className="absolute bottom-0 left-0" width={width} height={height}>
        {buildings.map((b, i) => {
          const top = height - b.h;
          // a building is lit once the song has played past it, and a few windows are on anywhere
          const passed = (b.x + b.w / 2) / width <= progress;
          const cols = Math.max(1, Math.floor((b.w - 8) / 10));
          const rows = Math.max(1, Math.floor((b.h - street - 14) / 14));
          return (
            <g key={i}>
              <rect x={b.x} y={top} width={b.w} height={b.h} fill={i % 2 ? '#0c0f1f' : '#10142a'} />
              {i === tower && <line x1={b.x + b.w / 2} x2={b.x + b.w / 2} y1={top - 18} y2={top} stroke="#2a2f4a" strokeWidth="3" />}
              {Array.from({ length: rows * cols }, (_, k) => {
                const on = light() < (passed ? 0.72 : 0.07);
                if (!on) return null;
                const c = k % cols;
                const r = Math.floor(k / cols);
                return <rect key={k} x={b.x + 5 + c * 10} y={top + 9 + r * 14} width="5" height="7" fill={k % 5 === 0 ? glow : LAMP} opacity={passed ? 0.95 : 0.5} />;
              })}
            </g>
          );
        })}
      </svg>

      {/* the billboard on the tower's roof, lit in the album's colour */}
      <div className="absolute w-[300px] -translate-x-1/2" style={{ left: signX, bottom: sign.h + 14 }}>
        <div className="rounded-md border-2 bg-[#0b0b18]/90 px-4 py-2 text-center" style={{ borderColor: tint, boxShadow: `0 0 24px ${tint}, inset 0 0 18px color-mix(in srgb, ${tint} 35%, transparent)` }}>
          <FitTitle text={title} max={28} lines={2} className="font-display leading-[1.05] font-black text-white uppercase" />
          <div className="truncate font-mono text-[11px] tracking-[0.3em]" style={{ color: glow }}>
            {artist.toUpperCase()}
          </div>
        </div>
        <div className="mx-auto flex w-40 justify-between">
          <div className="h-3 w-1 bg-[#2a2f4a]" />
          <div className="h-3 w-1 bg-[#2a2f4a]" />
        </div>
      </div>

      {/* the street, with the controls on it */}
      <div className={`absolute inset-x-0 bottom-0 flex items-center gap-6 bg-gradient-to-t from-[#04050d] via-[#04050d]/90 to-transparent ${upright ? 'flex-col px-6 pt-6 pb-6' : 'px-8 pt-8 pb-5'}`} style={{ height: street + (upright ? 20 : 0) }}>
        <div className="w-full min-w-0 flex-1">{seek(tint, accent?.fill2 ?? tint)}</div>
        {showTransport && (
          <Transport
            playing={playing}
            onToggle={onToggle}
            onPrev={onPrev}
            onNext={onNext}
            className="shrink-0 gap-3 text-white"
            button="h-12 w-12 rounded-md border-2 border-[var(--tint)] shadow-[0_0_10px_var(--tint)]"
            play="h-14 w-14 rounded-md bg-[var(--tint)] text-white shadow-[0_0_20px_var(--tint)]"
            icon="h-7 w-7"
          />
        )}
      </div>
    </div>
  );
}
