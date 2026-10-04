// a gauge as a ring: a raised bezel, a dark track, and an arc that runs clockwise from twelve in a gradient of its
// own, with the figure in the middle. the arc is a conic gradient cut to a ring, and --p is a registered number so
// the browser can ease it from one reading to the next instead of jumping
import { memo, type CSSProperties, type ReactNode } from 'react';

export const RING_COLORS = {
  cpu: ['#ff5a1f', '#ffc46b'],
  gpu: ['#d9f24a', '#16b33a'],
  ram: ['#b9d2ff', '#6e56f0'],
  network: ['#7fe3ff', '#2f6bff'],
  battery: ['#d9f24a', '#16b33a'],
  storage: ['#ffe28a', '#ff9f1c'],
} as const;

/** the arc's width as a share of the ring's radius */
const THICK = 0.2;

export const Ring = memo(function Ring({
  percent,
  colors,
  center,
  label,
  sub,
  onOpen,
}: {
  percent: number | undefined;
  colors: readonly [string, string];
  center: ReactNode;
  label: string;
  sub?: string | null;
  onOpen?: () => void;
}) {
  const p = Math.min(100, Math.max(0, percent ?? 0));
  const [start, end] = colors;
  const inner = `${(1 - THICK) * 100}%`;
  const ring = `radial-gradient(circle closest-side, transparent calc(${inner} - 0.5px), #000 ${inner}, #000 calc(100% - 0.5px), transparent 100%)`;
  // the round caps at twelve and at the arc's end are as wide as the band
  const capSize = `${THICK * 50}%`;
  return (
    <button onClick={onOpen} className="flex min-w-0 flex-col items-center gap-3 transition-transform duration-150 active:scale-[0.97]">
      <div
        className="relative aspect-square w-[168px] rounded-full p-[14px]"
        style={{
          background: 'linear-gradient(145deg, #3a3d44, #24262b)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)',
        }}>
        <div className="relative h-full w-full">
          {/* the track */}
          <div className="absolute inset-0 rounded-full" style={{ background: '#17181c', mask: ring, WebkitMask: ring }} />
          {/* the arc */}
          <div
            className="ring-arc absolute inset-0 rounded-full"
            style={
              {
                '--p': p,
                background: `conic-gradient(from 0deg, ${start} 0%, ${end} calc(var(--p) * 1%), transparent calc(var(--p) * 1%))`,
                mask: ring,
                WebkitMask: ring,
              } as CSSProperties
            }
          />
          {p > 0 && (
            <>
              <span
                className="absolute rounded-full"
                style={{ width: capSize, height: capSize, left: '50%', top: `${(THICK * 100) / 4}%`, transform: 'translate(-50%, -50%)', backgroundColor: start }}
              />
              {/* the end cap turns with the arc, so it rides the same eased --p */}
              <span className="ring-arc absolute inset-0" style={{ '--p': p, transform: 'rotate(calc(var(--p) * 3.6deg))' } as CSSProperties}>
                <span
                  className="absolute rounded-full"
                  style={{ width: capSize, height: capSize, left: '50%', top: `${(THICK * 100) / 4}%`, transform: 'translate(-50%, -50%)', backgroundColor: end }}
                />
              </span>
            </>
          )}
          {/* the face, raised a little off the track the way the reference sits */}
          <div
            className="absolute grid place-items-center rounded-full"
            style={{
              inset: `${THICK * 50 + 3}%`,
              background: 'linear-gradient(145deg, #34373e, #2a2c32)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 6px rgba(0,0,0,0.35)',
            }}>
            {center}
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className="font-display text-[1.375rem] font-semibold text-off-white">{label}</div>
        {sub && <div className="font-mono text-[0.875rem] text-soft tabular-nums">{sub}</div>}
      </div>
    </button>
  );
});

/** the figure in the middle: the number large, the unit beside it smaller, as in the reference */
export function RingValue({ value, unit, stacked }: { value: string; unit: string; stacked?: boolean }) {
  // a rate's unit is too long to sit beside its figure inside the ring, so it goes underneath
  if (stacked) {
    return (
      <span className="flex flex-col items-center">
        <span className="font-display text-[2.125rem] leading-none font-medium tabular-nums text-off-white">{value}</span>
        <span className="mt-1 font-mono text-[0.8125rem] tracking-[0.12em] text-soft">↓ {unit}</span>
      </span>
    );
  }
  return (
    <span className="flex items-baseline">
      <span className="font-display text-[2.375rem] leading-none font-medium tabular-nums text-off-white">{value}</span>
      <span className="ml-0.5 font-display text-[1.125rem] font-medium text-near">{unit}</span>
    </span>
  );
}
