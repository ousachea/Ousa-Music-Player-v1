// the frame around every screen: the name, which device is showing, the time and the gear for everything else along
// the top, and the banner that says a device has gone or come back
import { memo } from 'react';

import { StatusIndicator } from './cards';

export const TopBar = memo(function TopBar({
  device,
  online,
  clock,
  onDevice,
  onMore,
  moreOpen,
}: {
  device: string | null;
  online: boolean;
  clock: string | null;
  onDevice: () => void;
  /** the gear: processes, devices, settings and debug */
  onMore: () => void;
  moreOpen: boolean;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-4 border-b border-white/8 px-5">
      <span className="font-display text-[1.125rem] font-bold tracking-[0.08em] text-off-white">O-SYSTEM</span>
      <button onClick={onDevice} className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1 active:bg-white/8">
        {device && <StatusIndicator online={online} label={false} />}
        <span className="truncate font-mono text-[0.875rem] tracking-[0.1em] text-soft uppercase">{device ?? 'no device'}</span>
      </button>
      <span className="ml-auto font-display text-[1.25rem] font-medium tabular-nums text-near">{clock ?? ''}</span>
      <button
        aria-label="more"
        onClick={onMore}
        className={`-mr-2 grid h-9 w-9 place-items-center rounded-full transition-[background-color,transform] duration-150 active:scale-90 ${
          moreOpen ? 'bg-white/14 text-off-white' : 'text-soft active:bg-white/10'
        }`}>
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      </button>
    </div>
  );
});

export function AlertBanner({ tone, title, detail }: { tone: 'ok' | 'warn'; title: string; detail?: string }) {
  const color = tone === 'ok' ? 'var(--color-ok)' : 'var(--color-experimental)';
  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center">
      <div className="flex animate-[banner_260ms_ease-out] items-center gap-3 rounded-md bg-black/85 px-4 py-2 ring-1 ring-white/12">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-mono text-[0.875rem] tracking-[0.16em]" style={{ color }}>
          {title}
        </span>
        {detail && <span className="font-mono text-[0.875rem] text-soft">{detail}</span>}
      </div>
    </div>
  );
}
