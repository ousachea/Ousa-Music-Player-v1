// one icon for each kind of information, each with a small motion that says what it is: a core that pulses, a fan
// that spins, arrows that trade places, a hand that sweeps. drawn in currentColor so a tile or a card can tint it,
// and moved by transform and opacity only
import type { ReactNode } from 'react';

export type IconKind =
  | 'cpu'
  | 'memory'
  | 'gpu'
  | 'network'
  | 'storage'
  | 'battery'
  | 'clock'
  | 'calendar'
  | 'music'
  | 'claude'
  | 'cores'
  | 'apps'
  | 'system'
  | 'displays'
  | 'sun'
  | 'moon'
  | 'cloud'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'fog';

const PATHS: Record<IconKind, ReactNode> = {
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.8" className="icon-pulse" fill="currentColor" stroke="none" />
    </>
  ),
  memory: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="1.5" />
      <path d="M6 17v2M10 17v2M14 17v2M18 17v2" />
      {[5.5, 9.5, 13.5].map((x, i) => (
        <rect key={x} x={x} y="9.5" width="3" height="5" rx="0.6" fill="currentColor" stroke="none" className="icon-blink" style={{ animationDelay: `${i * 0.35}s` }} />
      ))}
    </>
  ),
  gpu: (
    <>
      <rect x="2.5" y="6" width="19" height="11" rx="1.5" />
      <path d="M6 17v2.5M10 17v2.5" />
      <g className="icon-spin">
        <circle cx="9" cy="11.5" r="3.4" />
        <path d="M9 8.1v6.8M5.6 11.5h6.8" />
      </g>
      <path d="M15.5 9.5h3M15.5 13.5h3" />
    </>
  ),
  network: (
    <>
      <g className="icon-bob-down">
        <path d="M8 4v14M8 18l-3.5-3.5M8 18l3.5-3.5" />
      </g>
      <g className="icon-bob-up">
        <path d="M16 20V6M16 6l-3.5 3.5M16 6l3.5 3.5" />
      </g>
    </>
  ),
  storage: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <g className="icon-spin">
        <circle cx="12" cy="11" r="4.5" />
        <path d="M12 6.5v2" />
      </g>
      <circle cx="12" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="17" r="0.9" fill="currentColor" stroke="none" className="icon-blink" />
    </>
  ),
  battery: (
    <>
      <rect x="2.5" y="7" width="17" height="10" rx="2.2" />
      <path d="M21.5 10.5v3" />
      <path d="M11.8 8.6 8.6 12.4h2.6L10.4 15.4l3.4-3.8h-2.6z" fill="currentColor" stroke="none" className="icon-pulse" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12V8.2" />
      <path d="M12 12 15.2 13.8" className="icon-sweep" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <circle cx="15.5" cy="15" r="1.6" fill="currentColor" stroke="none" className="icon-pulse" />
    </>
  ),
  music: (
    <>
      {[5, 9.5, 14, 18.5].map((x, i) => (
        <path key={x} d={`M${x} 20V6`} strokeWidth="2.6" className="icon-eq" style={{ animationDelay: `${i * -0.27}s`, animationDuration: `${0.8 + i * 0.13}s` }} />
      ))}
    </>
  ),
  claude: (
    <g className="icon-spin-slow">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" strokeWidth="2.2" />
    </g>
  ),
  cores: (
    <>
      {[
        [5, 5],
        [13, 5],
        [5, 13],
        [13, 13],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="6" height="6" rx="1.2" className="icon-blink" style={{ animationDelay: `${[0, 0.5, 0.75, 0.25][i]}s` }} />
      ))}
    </>
  ),
  apps: (
    <>
      {[6, 12, 18].map((x, i) => (
        <path key={x} d={`M${x} 20V8`} strokeWidth="3" className="icon-eq" style={{ animationDelay: `${i * -0.4}s`, animationDuration: '1.6s' }} />
      ))}
    </>
  ),
  system: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M5.5 13h3l1.5-4 2.5 7 1.5-3h4.5" pathLength={1} className="icon-trace" />
    </>
  ),
  displays: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="1.8" />
      <path d="M9 20h6M12 16.5V20" />
      <rect x="5.5" y="7" width="13" height="7" rx="0.8" fill="currentColor" stroke="none" className="icon-glow" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <g className="icon-spin-slow">
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </g>
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" className="icon-glow" />,
  cloud: (
    <g className="icon-drift">
      <path d="M7 17h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 7 17Z" />
    </g>
  ),
  rain: (
    <>
      <path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 7 14Z" />
      {[9, 13, 17].map((x, i) => (
        <path key={x} d={`M${x} 16.5l-1 3`} className="icon-fall" style={{ animationDelay: `${i * -0.3}s` }} />
      ))}
    </>
  ),
  snow: (
    <>
      <path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 7 14Z" />
      {[9, 12.5, 16].map((x, i) => (
        <circle key={x} cx={x} cy="18" r="1" fill="currentColor" stroke="none" className="icon-fall" style={{ animationDelay: `${i * -0.5}s`, animationDuration: '1.8s' }} />
      ))}
    </>
  ),
  storm: (
    <>
      <path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 7 14Z" />
      <path d="M13 13.5l-2.5 4h3l-2 4" className="icon-blink" />
    </>
  ),
  fog: (
    <>
      <path d="M4 9h16" className="icon-drift" />
      <path d="M3 13h18" className="icon-drift" style={{ animationDelay: '-1s' }} />
      <path d="M5 17h14" className="icon-drift" style={{ animationDelay: '-2s' }} />
    </>
  ),
};

export function AnimatedIcon({ kind, className }: { kind: IconKind; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? 'h-5 w-5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[kind]}
    </svg>
  );
}
