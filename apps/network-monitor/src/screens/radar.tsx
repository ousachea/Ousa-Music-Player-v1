// the busiest processes as a radar: one spoke each, cpu in green and memory in orange, each scaled to its own leader
// so the two shapes can be compared even though one is a share of a core and the other a share of ram. the shapes
// glide to each new reading rather than jump, over a few frames once every few seconds
import { memo, useEffect, useRef, useState } from 'react';

import type { ProcessInfo } from '../protocol/types';

const CPU = '#6ff2b4';
const RAM = '#ff5a2a';
const RINGS = 5;
const TWEEN_MS = 700;

/** eases a list of numbers from where they were to where they now are */
function useTweened(target: number[]): number[] {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const live = useRef(target);
  const key = target.join(',');
  useEffect(() => {
    from.current = live.current.length === target.length ? live.current : target.map(() => 0);
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / TWEEN_MS);
      const ease = 1 - (1 - k) ** 3;
      const next = target.map((v, i) => from.current[i] + (v - from.current[i]) * ease);
      live.current = next;
      setShown(next);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // keyed on the joined values: a new array holding the same numbers is not a change
  }, [key]);
  return shown;
}

const short = (name: string) => (name.length > 18 ? `${name.slice(0, 17)}…` : name);

export const ProcessRadar = memo(function ProcessRadar({
  procs,
  ram,
  upright,
}: {
  procs: ProcessInfo[];
  ram: number | undefined;
  upright: boolean;
}) {
  const n = Math.max(3, procs.length);
  const cpu = procs.map(p => p.cpu ?? 0);
  const mem = procs.map(p => (p.memory !== undefined && ram ? (p.memory / ram) * 100 : 0));
  const cpuTop = Math.max(0.1, ...cpu);
  const memTop = Math.max(0.01, ...mem);
  // both series tweened together, so they arrive at the same moment
  const shown = useTweened([...cpu.map(v => v / cpuTop), ...mem.map(v => v / memTop)]);
  const cpuShown = shown.slice(0, procs.length);
  const memShown = shown.slice(procs.length);

  const W = upright ? 440 : 520;
  const H = upright ? 400 : 344;
  const cx = W / 2;
  const cy = upright ? 190 : H / 2;
  const r = upright ? 120 : 112;
  const at = (i: number, k: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k] as const;
  };
  const ring = (k: number) => Array.from({ length: n }, (_, i) => at(i, k).join(',')).join(' ');
  const shape = (values: number[]) => values.map((v, i) => at(i, Math.max(0.04, v)).join(',')).join(' ');

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible">
        <defs>
          <filter id="radar-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="radar-cpu">
            <stop offset="0%" stopColor={CPU} stopOpacity="0.02" />
            <stop offset="100%" stopColor={CPU} stopOpacity="0.22" />
          </radialGradient>
          <radialGradient id="radar-ram">
            <stop offset="0%" stopColor={RAM} stopOpacity="0.05" />
            <stop offset="100%" stopColor={RAM} stopOpacity="0.32" />
          </radialGradient>
        </defs>

        {Array.from({ length: RINGS }, (_, i) => (
          <polygon key={i} points={ring((i + 1) / RINGS)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray={i < RINGS - 1 ? '2 3' : undefined} />
        ))}
        {procs.map((_, i) => {
          const [x, y] = at(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />;
        })}

        <polygon points={shape(cpuShown)} fill="url(#radar-cpu)" stroke={CPU} strokeWidth="2.4" strokeLinejoin="round" filter="url(#radar-glow)" />
        <polygon points={shape(memShown)} fill="url(#radar-ram)" stroke={RAM} strokeWidth="2.4" strokeLinejoin="round" filter="url(#radar-glow)" />
        {cpuShown.map((v, i) => {
          const [x, y] = at(i, Math.max(0.04, v));
          return <circle key={`c${i}`} cx={x} cy={y} r="4.2" fill={CPU} />;
        })}
        {memShown.map((v, i) => {
          const [x, y] = at(i, Math.max(0.04, v));
          return <circle key={`m${i}`} cx={x} cy={y} r="4.2" fill={RAM} />;
        })}

        {procs.map((p, i) => {
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
          const [x, y] = at(i, 1.16);
          const anchor = Math.abs(Math.cos(a)) < 0.25 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
          const dy = Math.sin(a) < -0.5 ? -12 : Math.sin(a) > 0.5 ? 6 : -4;
          return (
            <g key={`l${i}`} transform={`translate(${x} ${y + dy})`} textAnchor={anchor}>
              <text className="fill-off-white font-body text-[12.5px] font-semibold">{short(p.name)}</text>
              <text y="15" className="font-body text-[11.5px] tabular-nums">
                <tspan fill={CPU}>{(p.cpu ?? 0).toFixed(1)}%</tspan>
                <tspan fill="rgba(239,239,239,0.4)"> · </tspan>
                <tspan fill={RAM}>{mem[i] < 0.1 ? mem[i].toFixed(2) : mem[i].toFixed(1)}%</tspan>
              </text>
            </g>
          );
        })}
      </svg>

      <div className={`absolute flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 ${upright ? 'right-0 bottom-0' : 'top-0 right-0'}`}>
        <span className="flex items-center gap-2 font-body text-[0.8125rem] text-off-white/85">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CPU, boxShadow: `0 0 8px ${CPU}` }} />
          CPU <span className="text-off-white/45">of a core</span>
        </span>
        <span className="flex items-center gap-2 font-body text-[0.8125rem] text-off-white/85">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: RAM, boxShadow: `0 0 8px ${RAM}` }} />
          Memory <span className="text-off-white/45">of RAM</span>
        </span>
      </div>
    </div>
  );
});
