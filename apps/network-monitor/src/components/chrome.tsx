// the frame around every screen: the name, which device is showing and the time along the top, the screens
// along the bottom, and the banner that says a device has gone or come back
import { memo } from 'react';

import { MAIN, type Screen } from '../store/navigation';
import { StatusIndicator } from './cards';

export const TopBar = memo(function TopBar({
  device,
  online,
  clock,
  onDevice,
}: {
  device: string | null;
  online: boolean;
  clock: string | null;
  onDevice: () => void;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-4 border-b border-white/8 px-5">
      <span className="font-display text-[1.125rem] font-bold tracking-[0.08em] text-off-white">O-NETWORK</span>
      <button onClick={onDevice} className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1 active:bg-white/8">
        {device && <StatusIndicator online={online} label={false} />}
        <span className="truncate font-mono text-[0.875rem] tracking-[0.1em] text-soft uppercase">{device ?? 'no device'}</span>
      </button>
      <span className="ml-auto font-display text-[1.25rem] font-medium tabular-nums text-near">{clock ?? ''}</span>
    </div>
  );
});

const NAV_LABEL: Partial<Record<Screen, string>> = {
  home: 'HOME',
  cpu: 'CPU',
  gpu: 'GPU',
  memory: 'RAM',
  network: 'NET',
  more: 'MORE',
};

const MORE_SCREENS: Screen[] = ['more', 'storage', 'processes', 'devices', 'settings', 'debug'];

export const BottomNavigation = memo(function BottomNavigation({
  screen,
  onGo,
}: {
  screen: Screen;
  onGo: (s: Screen) => void;
}) {
  return (
    <div className="flex h-14 shrink-0 border-t border-white/8">
      {MAIN.map(s => {
        const on = s === screen || (s === 'more' && MORE_SCREENS.includes(screen));
        return (
          <button
            key={s}
            onClick={() => onGo(s)}
            className={`relative flex-1 font-mono text-[0.9375rem] font-medium tracking-[0.16em] outline-none transition-colors duration-150 active:bg-white/6 ${
              on ? 'text-off-white' : 'text-dim'
            }`}>
            {on && <span className="absolute inset-x-6 top-0 h-0.5 bg-off-white" />}
            {NAV_LABEL[s]}
          </button>
        );
      })}
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
