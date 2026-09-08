import type { ReactNode } from 'react';

import { fill, ink, type Palette } from './config';

export function Big({ children, pal, size = '5.5rem' }: { children: ReactNode; pal: Palette; size?: string }) {
  return (
    <div className="font-mono leading-none tabular-nums" style={{ ...ink(pal), fontSize: size }}>
      {children}
    </div>
  );
}

export function Key({
  label,
  onClick,
  pal,
  wide,
  small,
}: {
  label: string;
  onClick: () => void;
  pal?: Palette;
  wide?: boolean;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full font-medium transition active:scale-95 ${
        small ? 'px-4 py-2 text-hint' : 'px-6 py-3 text-row'
      } ${wide ? 'min-w-32' : ''}`}
      style={{ background: pal ? fill(pal) : 'rgba(255,255,255,0.10)', color: pal ? '#0a0c0e' : '#efefef' }}>
      {label}
    </button>
  );
}

// a ring that empties as the time does, drawn from the top and turning clockwise
export function Ring({
  fraction,
  pal,
  size,
  width = 10,
  children,
}: {
  fraction: number;
  pal: Palette;
  size: string;
  width?: number;
  children?: ReactNode;
}) {
  const r = 90;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={pal.main} />
            <stop offset="100%" stopColor={pal.second} />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={width} />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="url(#ring)"
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, fraction)))}
        />
      </svg>
      <div className="relative flex flex-col items-center">{children}</div>
    </div>
  );
}
