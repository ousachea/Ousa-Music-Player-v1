// bars and line graphs, drawn as plain svg. a graph only redraws when its own series changes, which is once per
// frame for its device; no chart library, since the device pays for every kilobyte and every layout
import { memo } from 'react';

import type { MetricHistory } from '../store/telemetry';

export const COLORS = {
  cpu: '#4cc9f0',
  gpu: '#80ed99',
  ram: '#c3a6ff',
  down: '#4cc9f0',
  up: '#ffb066',
  storage: '#ffd166',
  battery: '#80ed99',
  ok: 'var(--color-ok)',
  warn: 'var(--color-experimental)',
  err: 'var(--color-err)',
} as const;

/** a usage reads in its own colour until it is high enough to matter */
export function levelColor(value: number | undefined, base: string, warn = 85, err = 95) {
  if (value === undefined) return base;
  return value >= err ? COLORS.err : value >= warn ? COLORS.warn : base;
}

export const ProgressBar = memo(function ProgressBar({
  value,
  color,
  height = 8,
}: {
  value: number | undefined;
  color: string;
  height?: number;
}) {
  const v = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="w-full overflow-hidden rounded-sm bg-white/8" style={{ height }}>
      <div
        className="h-full rounded-sm transition-[width] duration-700 ease-out"
        style={{ width: `${v}%`, backgroundColor: levelColor(value, color) }}
      />
    </div>
  );
});

const W = 600;
const H = 100;

function path(points: MetricHistory[], windowMs: number, max: number, now: number) {
  if (points.length < 2) return '';
  return points
    .map((p, i) => {
      const x = W - ((now - p.timestamp) / windowMs) * W;
      const y = H - (Math.min(p.value, max) / max) * (H - 6) - 3;
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
}

export type Line = { points: MetricHistory[]; color: string; fill?: boolean };

/** fixed max for a percentage, or the series' own peak for something open ended like throughput */
export const MiniGraph = memo(function MiniGraph({
  lines,
  windowSec,
  max,
  className,
}: {
  lines: Line[];
  windowSec: number;
  max?: number;
  className?: string;
}) {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const peak = max ?? Math.max(1, ...lines.flatMap(l => l.points.map(p => p.value))) * 1.15;
  const drawn = lines.map(l => ({ ...l, d: path(l.points, windowMs, peak, now) }));
  const empty = drawn.every(l => !l.d);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className ?? 'h-full w-full'}>
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.06)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {drawn.map(
        (l, i) =>
          l.d && (
            <g key={i}>
              {l.fill && <path d={`${l.d}L${W} ${H}L${W - ((now - l.points[0].timestamp) / windowMs) * W} ${H}Z`} fill={l.color} opacity={0.12} />}
              <path d={l.d} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          ),
      )}
      {empty && (
        <text x={W / 2} y={H / 2 + 5} textAnchor="middle" fill="rgba(239,239,239,0.3)" fontSize="14" fontFamily="ui-monospace, monospace">
          collecting
        </text>
      )}
    </svg>
  );
});

export const NetworkGraph = memo(function NetworkGraph({
  down,
  up,
  windowSec,
  className,
}: {
  down: MetricHistory[];
  up: MetricHistory[];
  windowSec: number;
  className?: string;
}) {
  return (
    <MiniGraph
      className={className}
      windowSec={windowSec}
      lines={[
        { points: down, color: COLORS.down, fill: true },
        { points: up, color: COLORS.up },
      ]}
    />
  );
});
