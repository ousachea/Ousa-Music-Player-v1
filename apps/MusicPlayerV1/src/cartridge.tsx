// the cd style's other look: a gold disc in a clear cartridge, the way a minidisc sits in its shell. a frosted shell
// with screws in its corners, the gold turning under a black slider that carries the cover, and the black hub over
// the middle. the disc turns while the track plays and holds its angle on pause, like the tray's
import type { ReactNode } from 'react';

import type { Accent } from './artwork-color';

const GOLD =
  'conic-gradient(from 0deg, #f8e7a6, #d9b35b 11%, #fff4cf 21%, #c99a3e 33%, #f2d98f 46%, #b98a35 58%, #fbecb8 70%, #d4ad55 84%, #f8e7a6)';

/** the same metal, pressed in the cover's two colours: each band of light and shade mixed from them, so the disc keeps
 * its sheen and takes the album's colour */
function pressing(accent: Accent | null) {
  if (!accent) return GOLD;
  const a = accent.fill;
  const b = accent.fill2 ?? accent.fill;
  const light = (c: string, pct: number) => `color-mix(in oklab, ${c} ${pct}%, #ffffff)`;
  const dark = (c: string, pct: number) => `color-mix(in oklab, ${c} ${pct}%, #2a2118)`;
  return `conic-gradient(from 0deg, ${light(a, 45)}, ${a} 11%, ${light(b, 30)} 21%, ${dark(a, 70)} 33%, ${light(b, 55)} 46%, ${dark(b, 75)} 58%, ${light(a, 35)} 70%, ${b} 84%, ${light(a, 45)})`;
}

/** a screw head sunk in the shell: a dish with a cross */
function Screw({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="1.9" fill="#d6d1c6" stroke="rgba(0,0,0,0.14)" strokeWidth="0.3" />
      <circle r="1.25" fill="#c2bcaf" />
      <path d="M-0.8 -0.8 0.8 0.8M0.8 -0.8 -0.8 0.8" stroke="#7a7468" strokeWidth="0.35" strokeLinecap="round" />
    </g>
  );
}

export function Cartridge({
  artUrl,
  accent,
  playing,
  motion,
  label,
  onLook,
  corner,
}: {
  artUrl: string | null;
  /** the cover's colours; null keeps the disc gold */
  accent: Accent | null;
  playing: boolean;
  motion: boolean;
  /** what the slider's spine says */
  label: string;
  /** a tap on the hub trades back to the tray */
  onLook: () => void;
  /** the clock, set in the shell's free corner */
  corner?: ReactNode;
}) {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[7%] shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
      style={{ background: 'linear-gradient(150deg, #f5f3ec 0%, #e3dfd5 55%, #d4cfc3 100%)' }}>
      {/* the shell's mouldings: an inner rim, the notches and rings a cartridge is cast with, and four screws */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <rect x="2.5" y="2.5" width="95" height="95" rx="5" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="0.5" />
        <rect x="12" y="3.2" width="9" height="5.5" rx="2" fill="rgba(255,255,255,0.55)" stroke="rgba(0,0,0,0.08)" strokeWidth="0.35" />
        <circle cx="10" cy="14" r="5" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="0.6" />
        <circle cx="90" cy="12" r="3.6" fill="rgba(255,255,255,0.5)" stroke="rgba(0,0,0,0.1)" strokeWidth="0.4" />
        <circle cx="88" cy="86" r="4.2" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="0.6" />
        <rect x="70" y="92.5" width="12" height="3.2" rx="1.6" fill="rgba(0,0,0,0.06)" />
        <Screw x={6.5} y={6.5} />
        <Screw x={93.5} y={6.5} />
        <Screw x={93.5} y={93.5} />
        {!corner && <Screw x={6.5} y={93.5} />}
      </svg>

      {/* the disc: the colour turns with it, the light on it stays put, the way light falls on a real one */}
      <div className="absolute top-[5%] left-[7%] aspect-square w-[88%]">
        <div
          className="animate-platter absolute inset-0 rounded-full"
          style={{ background: pressing(accent), transition: 'background 700ms', animationPlayState: playing && motion ? 'running' : 'paused', animationDuration: '6s' }}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle at 30% 26%, rgba(255,255,255,0.75), rgba(255,255,255,0) 42%), radial-gradient(circle at 74% 78%, rgba(255,250,225,0.45), rgba(255,255,255,0) 38%)',
          }}
        />
        {/* the clear band inside the data, then the shell's frosting over the disc's rim */}
        <div className="pointer-events-none absolute inset-[30%] rounded-full bg-white/25 ring-1 ring-white/40" />
        <div className="pointer-events-none absolute inset-0 rounded-full ring-[3px] ring-inset ring-white/35" />
      </div>

      {/* the slider: black, out from the left edge to the middle, carrying the cover and a spine label */}
      <div className="absolute top-[36%] -left-[1%] flex h-[27%] w-[54%] items-center rounded-r-[6px] bg-[#141414] shadow-[0_6px_16px_rgba(0,0,0,0.35)]">
        <div className="ml-[3%] grid h-[62%] w-[9%] place-items-center rounded-[3px] bg-[#d9d9d9]">
          <span className="font-display text-[0.5625rem] font-bold whitespace-nowrap text-[#2a2a2a] [writing-mode:vertical-rl] rotate-180">{label}</span>
        </div>
        <div className="ml-[12%] aspect-square h-[82%] overflow-hidden rounded-[4px] bg-black ring-1 ring-white/10">
          {artUrl ? <img src={artUrl} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-white/10" />}
        </div>
      </div>

      {/* the hub: a black ring with fine grooves, the grey clamp inside it, and the spindle hole */}
      <button
        aria-label="cd look"
        onClick={onLook}
        className="absolute top-[49%] left-[51%] grid aspect-square w-[35%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full transition active:scale-95"
        style={{ background: 'repeating-radial-gradient(circle, #121212 0 2px, #1d1d1d 2px 3px)', boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }}>
        <span
          className="grid aspect-square w-[56%] place-items-center rounded-full ring-1 ring-black/20"
          style={{ background: 'radial-gradient(circle at 40% 35%, #f1f2f4, #c7cbd1 60%, #aeb3ba)' }}>
          <span className="grid aspect-square w-[62%] place-items-center rounded-full ring-1 ring-black/10" style={{ background: 'linear-gradient(150deg, #dfe2e6, #c3c8ce)' }}>
            <span className="aspect-square w-[34%] rounded-full bg-[#141414] shadow-[inset_0_0_4px_rgba(0,0,0,0.8)]" />
          </span>
        </span>
      </button>

      {corner && <div className="absolute bottom-[3%] left-[4%]">{corner}</div>}
    </div>
  );
}
