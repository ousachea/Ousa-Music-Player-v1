// the building blocks every screen is set from: a labelled figure, a stat line, a temperature, a status dot, and
// the rows for drives, devices and processes
import { memo, type ReactNode } from 'react';

import { gb, pct } from '../composables/useMetrics';
import { AnimatedIcon, type IconKind } from './icons';
import type { DeviceInfo, StorageDevice } from '../protocol/types';
import { COLORS, ProgressBar, levelColor } from './graphs';

export function Label({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div className="font-mono text-[0.75rem] font-medium tracking-[0.2em] uppercase" style={{ color: color ?? 'var(--color-dim)' }}>
      {children}
    </div>
  );
}

/** the figure is the point of the card, so it is set large and the unit beside it small */
export function Big({ value, unit, size = 3.5, dim }: { value: string; unit?: string; size?: number; dim?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={`font-display leading-none font-semibold tabular-nums tracking-display ${dim ? 'text-dim' : 'text-off-white'}`}
        style={{ fontSize: `${size}rem` }}>
        {value}
      </span>
      {unit && <span className="font-display text-[1.25rem] font-medium text-soft">{unit}</span>}
    </div>
  );
}

export const MetricCard = memo(function MetricCard({
  label,
  color,
  icon,
  onOpen,
  children,
  className,
}: {
  label: string;
  color: string;
  icon?: IconKind;
  onOpen?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2" style={{ color }}>
        {icon && <AnimatedIcon kind={icon} className="h-[18px] w-[18px]" />}
        <Label color={color}>{label}</Label>
      </div>
      {children}
    </>
  );
  const box = `flex min-w-0 flex-col gap-2 rounded-[var(--tile-radius)] bg-white/[0.045] px-4 py-3 text-left ${className ?? ''}`;
  return onOpen ? (
    <button onClick={onOpen} className={`${box} transition-[transform,background-color] duration-150 active:scale-[0.98] active:bg-white/8`}>
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
});

/** a quiet label over a value, for the facts that sit around a screen's main figure */
export function Stat({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <div className={`mt-0.5 truncate font-display text-[1.5rem] leading-tight font-medium tabular-nums ${value === null ? 'text-dim' : 'text-near'}`}>
        {value ?? '—'}
      </div>
      {sub && <div className="truncate font-mono text-[0.75rem] text-dim">{sub}</div>}
    </div>
  );
}

export function TemperatureBadge({ celsius, text }: { celsius: number | undefined; text: string | null }) {
  if (celsius === undefined || text === null) return null;
  const color = levelColor(celsius, 'var(--color-near)', 80, 90);
  return (
    <span className="rounded-sm px-1.5 py-0.5 font-mono text-[0.9375rem] font-medium tabular-nums" style={{ color, backgroundColor: 'rgba(255,255,255,0.06)' }}>
      {text}
    </span>
  );
}

export function StatusIndicator({ online, label }: { online: boolean; label?: boolean }) {
  const color = online ? COLORS.ok : 'var(--color-dim)';
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[0.75rem] tracking-[0.16em]" style={{ color }}>
      <span className={`h-2 w-2 rounded-full ${online ? '' : 'border border-current bg-transparent'}`} style={online ? { backgroundColor: color } : undefined} />
      {label !== false && (online ? 'ONLINE' : 'OFFLINE')}
    </span>
  );
}

export const StorageCard = memo(function StorageCard({
  drive,
  temp,
}: {
  drive: StorageDevice;
  temp: string | null;
}) {
  const usage = drive.usage ?? (drive.used !== undefined && drive.total ? (drive.used / drive.total) * 100 : undefined);
  return (
    <div className="flex flex-col gap-2 rounded-[var(--tile-radius)] bg-white/[0.045] px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-[1.25rem] font-semibold text-off-white">{drive.name}</div>
          {drive.model && <div className="truncate font-mono text-[0.75rem] text-dim">{drive.model}</div>}
        </div>
        <TemperatureBadge celsius={drive.temperature} text={temp} />
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[1rem] text-near tabular-nums">
          {gb(drive.used)} / {gb(drive.total)}
        </span>
        <span className="font-display text-[1.5rem] font-semibold tabular-nums text-off-white">{pct(usage)}</span>
      </div>
      <ProgressBar value={usage} color={COLORS.storage} />
      {(drive.readSpeed !== undefined || drive.writeSpeed !== undefined) && (
        <div className="flex justify-between font-mono text-[0.875rem] text-soft tabular-nums">
          <span>Read {speed(drive.readSpeed)}</span>
          <span>Write {speed(drive.writeSpeed)}</span>
        </div>
      )}
    </div>
  );
});

function speed(mbs: number | undefined) {
  if (mbs === undefined) return '—';
  return mbs >= 1000 ? `${(mbs / 1000).toFixed(1)} GB/s` : `${Math.round(mbs)} MB/s`;
}

const PLATFORM_LABEL: Record<DeviceInfo['platform'], string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
  carthing: 'Car Thing',
};

export function platformLabel(info: DeviceInfo) {
  return info.version ?? PLATFORM_LABEL[info.platform];
}

export const DeviceCard = memo(function DeviceCard({
  info,
  online,
  selected,
  focused,
  onPick,
}: {
  info: DeviceInfo;
  online: boolean;
  selected: boolean;
  focused: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className={`flex w-full items-center gap-4 rounded-[var(--panel-radius)] px-4 py-3 text-left transition-colors duration-150 ${
        focused ? 'bg-white/10' : 'bg-white/[0.045]'
      } ${selected ? 'ring-1 ring-white/30' : ''}`}>
      <StatusIndicator online={online} label={false} />
      <div className="min-w-0 flex-1">
        <div className={`truncate font-display text-[1.375rem] font-semibold ${online ? 'text-off-white' : 'text-soft'}`}>{info.name}</div>
        <div className="truncate font-mono text-[0.8125rem] text-dim">{platformLabel(info)}</div>
      </div>
      <span className="font-mono text-[0.75rem] tracking-[0.16em]" style={{ color: online ? COLORS.ok : 'var(--color-dim)' }}>
        {online ? 'ONLINE' : 'OFFLINE'}
      </span>
      {selected && <span className="font-mono text-[0.75rem] tracking-[0.16em] text-near">SHOWING</span>}
    </button>
  );
});
