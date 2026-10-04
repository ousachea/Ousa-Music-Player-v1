// the pieces every widget is built from: a tile in its own colour with light turning slowly behind it, a title,
// a large figure, a caption, bars and the icons
import { createContext, useContext, type ReactNode } from 'react';

/** colour for the widgets style; flat for the pages that follow cards and rings, so they match what came before */
export const ToneContext = createContext<'color' | 'flat'>('color');

/** a tile's colours, and how its light moves: seconds for one turn, and which way */
export type Look = { from: string; to: string; glow: string; turn: number; reverse?: boolean };

export const LOOKS = {
  green: { from: '#5b8f17', to: '#2e4c0a', glow: '#a6e04a', turn: 19 },
  blue: { from: '#0f4a7d', to: '#0a2c4d', glow: '#2f8fe0', turn: 23, reverse: true },
  magenta: { from: '#d24fe6', to: '#6d2a73', glow: '#f08cff', turn: 21 },
  cardio: { from: '#2f74db', to: '#5a3fd8', glow: '#7fc4ff', turn: 27, reverse: true },
  violet: { from: '#7a5cf2', to: '#2a1d57', glow: '#a993ff', turn: 25 },
  teal: { from: '#118a83', to: '#0a3b3d', glow: '#4fe0cf', turn: 24, reverse: true },
  amber: { from: '#d9811c', to: '#5a2c08', glow: '#ffc56b', turn: 20 },
  rose: { from: '#d6336c', to: '#4d1030', glow: '#ff8fb3', turn: 26, reverse: true },
  cyan: { from: '#1b8fd1', to: '#0b2f4f', glow: '#7fd8ff', turn: 22 },
} satisfies Record<string, Look>;

export function Tile({ look, onOpen, className, children }: { look: Look; onOpen?: () => void; className?: string; children: ReactNode }) {
  // a tile with controls of its own cannot itself be a button, so only a tile that opens something is one
  const Tag = onOpen ? 'button' : 'div';
  const flat = useContext(ToneContext) === 'flat';
  if (flat) {
    return (
      <Tag
        onClick={onOpen}
        className={`relative min-w-0 overflow-hidden rounded-lg bg-white/[0.045] text-left ${onOpen ? 'transition-transform duration-150 active:scale-[0.98]' : ''} ${className ?? ''}`}>
        {/* a hairline of the tile's colour along the top is all the colour a flat tile keeps */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ backgroundColor: look.glow }} />
        <span className="relative flex h-full flex-col px-4 py-3">{children}</span>
      </Tag>
    );
  }
  return (
    <Tag
      onClick={onOpen}
      className={`relative isolate min-w-0 overflow-hidden rounded-[26px] text-left shadow-[0_10px_30px_rgba(0,0,0,0.45)] ${onOpen ? 'transition-transform duration-150 active:scale-[0.98]' : ''} ${className ?? ''}`}
      style={{ background: `linear-gradient(150deg, ${look.from}, ${look.to})` }}>
      {/* the moving light: a glow and a pool of black on a layer larger than the tile, turning slowly about its
          middle. only the layer's transform changes, so the device moves pixels it already has rather than
          repainting a gradient every frame */}
      <span
        aria-hidden
        className="widget-drift pointer-events-none absolute -inset-[60%] -z-10"
        style={{
          background: `radial-gradient(circle at 32% 34%, color-mix(in oklab, ${look.glow} 70%, transparent) 0, transparent 26%), radial-gradient(circle at 68% 66%, rgba(0,0,0,0.85) 0, transparent 30%)`,
          animationDuration: `${look.turn}s`,
          animationDirection: look.reverse ? 'reverse' : 'normal',
        }}
      />
      <span className="pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-white/8 ring-inset" />
      <span className="relative flex h-full flex-col px-4 py-3">{children}</span>
    </Tag>
  );
}

export function Title({ children, icon, iconRight }: { children: ReactNode; icon?: ReactNode; iconRight?: boolean }) {
  const chip = icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/14 text-off-white">{icon}</span>;
  return (
    <div className="flex items-center gap-3">
      {!iconRight && chip}
      <span className="min-w-0 flex-1 truncate font-display text-[1.25rem] font-semibold text-off-white">{children}</span>
      {iconRight && chip}
    </div>
  );
}

export function Figure({ value, unit, size = 2.75 }: { value: string; unit?: string; size?: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-display leading-none font-semibold tabular-nums tracking-display text-off-white" style={{ fontSize: `${size}rem` }}>
        {value}
      </span>
      {unit && <span className="font-display text-[1.125rem] font-medium text-off-white/55">{unit}</span>}
    </div>
  );
}

export const Caption = ({ children }: { children: ReactNode }) => <div className="truncate font-body text-[0.875rem] leading-snug text-off-white/55">{children}</div>;

export function Bar({ value, fill, label, right, thick }: { value: number | undefined; fill: string; label?: string; right?: string; thick?: boolean }) {
  const v = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="w-full">
      {(label || right) && (
        <div className="mb-1 flex items-baseline justify-between font-body text-[0.8125rem]">
          <span className="truncate tracking-[0.02em] text-off-white/55 uppercase">{label}</span>
          <span className="font-medium text-off-white tabular-nums">{right}</span>
        </div>
      )}
      <div className={`w-full overflow-hidden rounded-full bg-white/12 ${thick ? 'h-3.5' : 'h-2'}`}>
        <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${v}%`, background: fill }} />
      </div>
    </div>
  );
}

/** the reference's progress strip: a row of slats, the done ones striped in colour and the rest left white */
export function Slats({ value, count = 14 }: { value: number | undefined; count?: number }) {
  const lit = Math.round((Math.min(100, Math.max(0, value ?? 0)) / 100) * count);
  return (
    <div className="flex h-10 gap-[5px]">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="flex-1 rounded-[5px] transition-colors duration-500"
          style={
            i < lit
              ? { background: 'repeating-linear-gradient(135deg, #7b52f5 0 4px, #6a42e6 4px 8px)' }
              : { background: 'rgba(245,245,250,0.92)' }
          }
        />
      ))}
    </div>
  );
}

export const Icon = {
  chip: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.8" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </svg>
  ),
  memory: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="7" width="18" height="10" rx="1.5" />
      <path d="M7 10v4M11 10v4M15 10v4M6 17v2M10 17v2M14 17v2M18 17v2" />
    </svg>
  ),
  gpu: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="6" width="18" height="11" rx="1.5" />
      <circle cx="9" cy="11.5" r="2.6" />
      <path d="M15 9.5h3M15 13.5h3M6 17v2M10 17v2" />
    </svg>
  ),
  network: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4v15M8 19l-3.5-3.5M8 19l3.5-3.5M16 20V5M16 5l-3.5 3.5M16 5l3.5 3.5" />
    </svg>
  ),
  battery: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="7" width="16" height="10" rx="2" />
      <path d="M21 10.5v3M7 10v4M10.5 10v4" />
    </svg>
  ),
};

