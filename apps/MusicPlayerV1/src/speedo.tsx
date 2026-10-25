// speedometer: one big sports car dial. the needle sweeps the song's length, the dial is marked in its minutes,
// and the last stretch of it is the red line
import { FitTitle } from './fit-title';
import { Transport, fmt, type StyleProps } from './style-kit';

// the dial runs from 225 degrees round to -45, the way a real one does, leaving the bottom open
const FROM = 225;
const SWEEP = 270;
const RED = 0.88;

function at(ratio: number, r: number) {
  const a = ((FROM - SWEEP * ratio) * Math.PI) / 180;
  return [200 + r * Math.cos(a), 200 - r * Math.sin(a)];
}

function arc(from: number, to: number, r: number) {
  const [x1, y1] = at(from, r);
  const [x2, y2] = at(to, r);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${SWEEP * (to - from) > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

export function Speedo({ title, artist, album, accent, playing, motion, upright, showTransport, progress, elapsed, duration, seek, onToggle, onPrev, onNext }: StyleProps) {
  const tint = accent?.fill ?? '#ff5a1f';
  const minutes = Math.max(1, Math.ceil(duration / 60000));
  // a mark a minute, but never so many that the numbers run into each other
  const step = Math.ceil(minutes / 8);
  const marks = Array.from({ length: Math.floor(minutes / step) + 1 }, (_, i) => i * step);
  const ticks = Array.from({ length: 41 }, (_, i) => i / 40);
  const [nx, ny] = at(progress, 150);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#08090b]" style={{ background: `radial-gradient(circle at ${upright ? '50% 32%' : '32% 50%'}, color-mix(in oklab, ${tint} 16%, #111318), #050607 70%)` }}>
      <div className={`flex h-full items-center ${upright ? 'flex-col justify-center gap-6 px-6' : 'gap-8 px-8'}`}>
        <svg viewBox="0 0 400 400" className={upright ? 'w-[400px]' : 'h-[440px] shrink-0'}>
          <circle cx="200" cy="200" r="196" fill="#0d0f13" stroke="#2a2e36" strokeWidth="4" />
          <circle cx="200" cy="200" r="186" fill="none" stroke="#1a1d23" strokeWidth="2" />
          <path d={arc(RED, 1, 170)} fill="none" stroke="#ff2a2a" strokeWidth="10" opacity="0.85" />
          <path d={arc(0, progress, 178)} fill="none" stroke={tint} strokeWidth="4" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${tint})` }} />
          {ticks.map(t => {
            const major = Math.round(t * 40) % 5 === 0;
            const [x1, y1] = at(t, 174);
            const [x2, y2] = at(t, major ? 150 : 162);
            return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke={t >= RED ? '#ff4a4a' : '#e8eaee'} strokeWidth={major ? 4 : 2} />;
          })}
          {marks.map(m => {
            const [x, y] = at(m / minutes, 124);
            return (
              <text key={m} x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#e8eaee" className="font-display" fontSize="24" fontWeight="700">
                {m}
              </text>
            );
          })}
          <text x="200" y="128" textAnchor="middle" fill="#8a909c" className="font-mono" fontSize="12" letterSpacing="3">
            MIN
          </text>
          <line
            x1="200"
            y1="200"
            x2={nx}
            y2={ny}
            stroke={tint}
            strokeWidth="6"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${tint})`, transition: motion ? 'all 1s linear' : undefined }}
          />
          <circle cx="200" cy="200" r="18" fill="#1d2027" stroke="#3a3f49" strokeWidth="3" />
          <text x="200" y="290" textAnchor="middle" fill="#ffffff" className="font-mono" fontSize="40" fontWeight="700">
            {fmt(elapsed)}
          </text>
          <text x="200" y="318" textAnchor="middle" fill="#8a909c" className="font-mono" fontSize="13" letterSpacing="2">
            {playing ? 'OF' : 'PARKED ·'} {fmt(duration)}
          </text>
        </svg>

        <div className={`flex min-w-0 flex-1 flex-col gap-5 ${upright ? 'w-full text-center' : ''}`}>
          <div className="font-mono text-[11px] tracking-[0.35em]" style={{ color: tint }}>
            NOW DRIVING
          </div>
          <FitTitle text={title} max={upright ? 44 : 48} lines={2} className="font-display leading-[1.02] font-black tracking-tight text-white" />
          <div className="-mt-3">
            <div className="truncate font-display text-[1.375rem] font-semibold text-white/80">{artist}</div>
            {album && <div className="truncate text-row text-white/45">{album}</div>}
          </div>
          <div className="w-full">{seek(tint, accent?.fill2 ?? tint)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className={`gap-3 text-white ${upright ? 'justify-center' : ''}`}
              button="h-14 w-14 rounded-full bg-white/8"
              play="h-16 w-16 rounded-full bg-white text-black"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
