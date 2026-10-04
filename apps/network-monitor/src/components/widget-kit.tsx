// the pieces every widget is built from: a tile in its own colour with light turning slowly behind it, a title,
// a large figure, a caption, bars and the icons
import { createContext, useContext, type ReactNode } from 'react';

import { METRIC, SCENE, type Tone } from '../theme';

/** colour for the widgets style; flat for the pages that follow cards and rings, so they match what came before */
export const ToneContext = createContext<'color' | 'flat'>('color');

/** a tile's colours, and how its light moves: seconds for one turn, and which way */
export type Look = { from: string; to: string; glow: string; turn: number; reverse?: boolean };

/** each tile takes its colour from the theme, with its own pace of light so no two move together */
const look = (t: Tone, turn: number, reverse?: boolean): Look => ({ from: t.from, to: t.to, glow: t.glow, turn, reverse });

export const LOOKS = {
  cpu: look(METRIC.cpu, 19),
  memory: look(METRIC.memory, 23, true),
  gpu: look(METRIC.gpu, 21),
  network: look(METRIC.network, 27, true),
  disk: look(METRIC.disk, 25),
  clock: look(SCENE.clock, 22),
  calendar: look(SCENE.calendar, 26, true),
  apps: look(SCENE.apps, 20),
  displays: look(SCENE.displays, 24, true),
  claude: look(SCENE.claude, 23, true),
  graphite: look(SCENE.graphite, 28),
} satisfies Record<string, Look>;

export function Tile({ look, onOpen, className, children }: { look: Look; onOpen?: () => void; className?: string; children: ReactNode }) {
  // a tile with controls of its own cannot itself be a button, so only a tile that opens something is one
  const Tag = onOpen ? 'button' : 'div';
  const flat = useContext(ToneContext) === 'flat';
  if (flat) {
    return (
      <Tag
        onClick={onOpen}
        className={`relative min-w-0 overflow-hidden rounded-[var(--tile-radius)] bg-white/[0.045] text-left ${onOpen ? 'transition-transform duration-150 active:scale-[0.98]' : ''} ${className ?? ''}`}>
        {/* a hairline of the tile's colour along the top is all the colour a flat tile keeps */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ backgroundColor: look.glow }} />
        <span className="relative flex h-full flex-col px-4 py-3">{children}</span>
      </Tag>
    );
  }
  return (
    <Tag
      onClick={onOpen}
      className={`relative isolate min-w-0 overflow-hidden rounded-[var(--tile-radius)] text-left shadow-[0_10px_30px_rgba(0,0,0,0.45)] ${onOpen ? 'transition-transform duration-150 active:scale-[0.98]' : ''} ${className ?? ''}`}
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
      <span className="pointer-events-none absolute inset-0 rounded-[var(--tile-radius)] ring-1 ring-white/8 ring-inset" />
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
              ? { background: `repeating-linear-gradient(135deg, ${METRIC.disk.accent} 0 4px, ${METRIC.disk.from} 4px 8px)` }
              : { background: 'rgba(245,245,250,0.92)' }
          }
        />
      ))}
    </div>
  );
}


