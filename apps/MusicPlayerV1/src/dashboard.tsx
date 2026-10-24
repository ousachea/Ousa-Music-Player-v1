// dashboard: the song as an instrument cluster. the big gauge's needle sweeps the length of the track, the small one
// reads the volume, and the screen between them carries the cover, the title and an odometer of the time played
import { FitTitle } from './fit-title';
import { Transport, type StyleProps } from './style-kit';

// a gauge sweeps 240 degrees, from lower left round to lower right, the way a speedometer does
const FROM = -210;
const SWEEP = 240;

function Gauge({
  value,
  labels,
  size,
  unit,
  tint,
  minor = 4,
}: {
  value: number;
  labels: string[];
  size: number;
  unit: string;
  tint: string;
  minor?: number;
}) {
  const r = size / 2;
  const angle = FROM + Math.min(1, Math.max(0, value)) * SWEEP;
  const at = (deg: number, radius: number) => {
    const rad = (deg * Math.PI) / 180;
    return [r + Math.cos(rad) * radius, r + Math.sin(rad) * radius] as const;
  };
  const steps = (labels.length - 1) * minor;
  const arc = (to: number, radius: number) => {
    const [x1, y1] = at(FROM, radius);
    const [x2, y2] = at(to, radius);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${to - FROM > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={r} cy={r} r={r - 2} fill="#0d0f12" stroke="#2c3036" strokeWidth="4" />
      <circle cx={r} cy={r} r={r - 10} fill="none" stroke="#1a1d22" strokeWidth="1" />
      {/* the swept part of the dial lit in the album's colour */}
      <path d={arc(angle, r * 0.84)} stroke={tint} strokeWidth={r * 0.05} strokeLinecap="round" fill="none" opacity="0.85" />
      {Array.from({ length: steps + 1 }, (_, i) => {
        const deg = FROM + (i / steps) * SWEEP;
        const major = i % minor === 0;
        const [x1, y1] = at(deg, r * (major ? 0.68 : 0.72));
        const [x2, y2] = at(deg, r * 0.78);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e8eaee" strokeWidth={major ? 2.5 : 1.2} strokeLinecap="round" />;
      })}
      {labels.map((label, i) => {
        const [x, y] = at(FROM + (i / (labels.length - 1)) * SWEEP, r * 0.53);
        return (
          <text key={i} x={x} y={y} fill="#c9ccd2" fontSize={r * 0.13} fontWeight="600" textAnchor="middle" dominantBaseline="central" className="font-display">
            {label}
          </text>
        );
      })}
      <text x={r} y={r * 1.45} fill="#7d828a" fontSize={r * 0.1} textAnchor="middle" className="font-mono tracking-widest">
        {unit}
      </text>
      {/* the needle, red, turned about the hub */}
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${r}px ${r}px` }} className="transition-transform duration-500 ease-out">
        <line x1={r - r * 0.12} y1={r} x2={r + r * 0.8} y2={r} stroke="#ff3b30" strokeWidth={r * 0.035} strokeLinecap="round" />
      </g>
      <circle cx={r} cy={r} r={r * 0.08} fill="#1d2025" stroke="#3a3f46" strokeWidth="2" />
    </svg>
  );
}

export function Dashboard({
  artUrl,
  title,
  artist,
  accent,
  playing,
  upright,
  showTransport,
  progress,
  elapsed,
  duration,
  onToggle,
  onPrev,
  onNext,
  volume,
}: StyleProps & { volume: { level: number; muted: boolean } | null }) {
  const tint = accent?.fill ?? '#00a8e8';
  const minutes = Math.max(1, Math.ceil(duration / 60000));
  // a label per minute, or every other one on a long track, so the dial never crowds
  const every = minutes > 8 ? 2 : 1;
  const marks = Array.from({ length: Math.floor(minutes / every) + 1 }, (_, i) => String(i * every));
  const level = volume?.muted ? 0 : (volume?.level ?? 0);
  // the odometer: minutes and seconds played, a digit to a drum
  const s = Math.floor(elapsed / 1000);
  const odo = `${String(Math.floor(s / 60)).padStart(3, '0')}${String(s % 60).padStart(2, '0')}`;

  const screen = (
    <div className={`flex min-w-0 flex-col items-center rounded-2xl bg-[#05070a] p-3 ring-1 ring-white/10 ${upright ? 'w-full' : 'w-[220px]'}`}>
      <div className="flex w-full items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white/10">{artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover" />}</div>
        <div className="min-w-0 flex-1">
          <FitTitle text={title} max={17} lines={2} className="font-display leading-tight font-semibold text-white" />
          <div className="truncate text-hint text-white/55">{artist}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-[2px] font-mono text-[15px] font-bold">
        {odo.split('').map((d, i) => (
          <span key={i} className={`grid h-7 w-5 place-items-center rounded-[3px] ${i >= 3 ? 'bg-[#e8eaee] text-black' : 'bg-[#1d2025] text-white'}`}>
            {d}
          </span>
        ))}
      </div>
      <div className="mt-1 font-mono text-[9px] tracking-[0.25em] text-white/40">MIN · SEC</div>
      {showTransport && (
        <Transport
          playing={playing}
          onToggle={onToggle}
          onPrev={onPrev}
          onNext={onNext}
          className="mt-2 gap-1 text-white"
          button="h-12 w-12"
          play="h-14 w-14 rounded-full bg-white/12 ring-1 ring-white/25"
          icon="h-7 w-7"
        />
      )}
    </div>
  );

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#1a1d22,#070809)]">
      <div className={`flex h-full items-center justify-center ${upright ? 'flex-col gap-5 px-5' : 'gap-3 px-4'}`}>
        <Gauge value={progress} labels={marks} size={upright ? 340 : 316} unit="MIN" tint={tint} />
        {screen}
        {!upright && <Gauge value={level} labels={['0', '2', '4', '6', '8', '10']} size={200} unit={volume?.muted ? 'MUTED' : 'VOL'} tint={tint} minor={2} />}
      </div>
    </div>
  );
}
