// home as a set of widgets: each tile a colour of its own fading to black in one corner, a title, one large figure
// and a bar. cpu, memory and the gpu sit along the top, network runs wide underneath beside the disk. a device that
// cannot fill a tile hands it to what it can, so a phone's cpu tile becomes its battery
import { memo, type ReactNode } from 'react';

import { gb, type Formatters } from '../composables/useMetrics';
import type { DeviceCapabilities, DeviceTelemetry } from '../protocol/types';
import type { Screen } from '../store/navigation';
import type { DeviceEntry } from '../store/telemetry';
import { NoData, type DeviceProps } from './device';

type Look = { from: string; to: string; shade: string };

// each gradient runs corner to corner, with black pooled where the reference pools it
const LOOKS = {
  green: { from: '#5b8f17', to: '#2e4c0a', shade: 'radial-gradient(90% 90% at 100% 100%, rgba(0,0,0,0.85), transparent 60%)' },
  blue: { from: '#0f4a7d', to: '#0a2c4d', shade: 'radial-gradient(70% 60% at 50% 0%, rgba(0,0,0,0.75), transparent 70%)' },
  magenta: { from: '#d24fe6', to: '#6d2a73', shade: 'radial-gradient(90% 90% at 0% 100%, rgba(0,0,0,0.8), transparent 60%)' },
  cardio: { from: '#2f74db', to: '#5a3fd8', shade: 'radial-gradient(60% 80% at 45% 100%, rgba(0,0,0,0.8), transparent 70%)' },
  violet: { from: '#7a5cf2', to: '#2a1d57', shade: 'linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.85))' },
} satisfies Record<string, Look>;

function Tile({ look, onOpen, className, children }: { look: Look; onOpen?: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      onClick={onOpen}
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-[26px] px-4 py-3 text-left shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition-transform duration-150 active:scale-[0.98] ${className ?? ''}`}
      style={{ background: `${look.shade}, linear-gradient(150deg, ${look.from}, ${look.to})` }}>
      <span className="pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-white/8 ring-inset" />
      {children}
    </button>
  );
}

function Title({ children, icon, iconRight }: { children: ReactNode; icon?: ReactNode; iconRight?: boolean }) {
  const chip = icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/14 text-off-white">{icon}</span>;
  return (
    <div className="flex items-center gap-3">
      {!iconRight && chip}
      <span className="min-w-0 flex-1 truncate font-display text-[1.25rem] font-semibold text-off-white">{children}</span>
      {iconRight && chip}
    </div>
  );
}

function Figure({ value, unit, size = 2.75 }: { value: string; unit?: string; size?: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-display leading-none font-semibold tabular-nums tracking-display text-off-white" style={{ fontSize: `${size}rem` }}>
        {value}
      </span>
      {unit && <span className="font-display text-[1.125rem] font-medium text-off-white/55">{unit}</span>}
    </div>
  );
}

const Caption = ({ children }: { children: ReactNode }) => <div className="truncate font-body text-[0.875rem] leading-snug text-off-white/55">{children}</div>;

function Bar({ value, fill, label, right, thick }: { value: number | undefined; fill: string; label?: string; right?: string; thick?: boolean }) {
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
function Slats({ value, count = 14 }: { value: number | undefined; count?: number }) {
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

const Icon = {
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

const usageOf = (part: { usage?: number; used?: number; total?: number } | null | undefined) =>
  part?.usage ?? (part?.used !== undefined && part.total ? (part.used / part.total) * 100 : undefined);

function CpuTile({ t, fmt, onOpen }: { t: DeviceTelemetry; fmt: Formatters; onOpen: () => void }) {
  const c = t.cpu!;
  const temp = fmt.temp(c.temperature);
  // the big figure is the most telling thing the cpu reports: its temperature, else its load, else its clock
  const big = temp
    ? { value: temp.replace(/°[CF]$/, ''), unit: temp.slice(-2), caption: 'Temperature' }
    : c.load
      ? { value: c.load[0].toFixed(2), unit: '', caption: 'Load average' }
      : { value: String(c.cores ?? '—'), unit: 'cores', caption: c.name ?? 'Processor' };
  return (
    <Tile look={LOOKS.green} onOpen={onOpen}>
      <Title>CPU</Title>
      <div className="mt-2">
        <Bar value={c.usage} fill="#b5f03c" label="Usage" right={c.usage === undefined ? '—' : `${Math.round(c.usage)}%`} />
      </div>
      <div className="mt-auto">
        <Figure value={big.value} unit={big.unit} />
        <Caption>{big.caption}</Caption>
      </div>
    </Tile>
  );
}

function MemoryTile({ t, onOpen }: { t: DeviceTelemetry; onOpen: () => void }) {
  const m = t.memory!;
  return (
    <Tile look={LOOKS.blue} onOpen={onOpen}>
      <Title icon={Icon.memory} iconRight>
        Memory
      </Title>
      <div className="mt-auto">
        <Figure value={m.used?.toFixed(1) ?? '—'} size={3.5} />
        <Caption>GB of {m.total !== undefined ? Math.round(m.total) : '—'} used</Caption>
      </div>
    </Tile>
  );
}

function GpuTile({ t, onOpen }: { t: DeviceTelemetry; onOpen: () => void }) {
  const g = t.gpu!;
  const mem = g.memoryUsed !== undefined && g.memoryTotal !== undefined ? `${g.memoryUsed.toFixed(1)} of ${Math.round(g.memoryTotal)} GB` : g.memoryUsed !== undefined ? gb(g.memoryUsed) : undefined;
  const memPct = g.memoryUsed !== undefined && g.memoryTotal ? (g.memoryUsed / g.memoryTotal) * 100 : undefined;
  return (
    <Tile look={LOOKS.magenta} onOpen={onOpen}>
      <Title icon={Icon.gpu}>GPU</Title>
      <div className="mt-auto">
        <Figure value={g.usage === undefined ? '—' : String(Math.round(g.usage))} unit="%" />
        <Caption>{g.name ?? 'Graphics load'}</Caption>
      </div>
      <div className="mt-2">
        <Bar value={memPct ?? g.usage} fill="linear-gradient(90deg, #e3349b, #f6c6f7 75%, #ffffff)" label={mem ? 'Memory' : 'Load'} right={mem ?? (g.usage === undefined ? '—' : `${Math.round(g.usage)}%`)} />
      </div>
    </Tile>
  );
}

function BatteryTile({ t, look }: { t: DeviceTelemetry; look: Look }) {
  const b = t.battery!;
  return (
    <Tile look={look}>
      <Title icon={Icon.battery}>Battery</Title>
      <div className="mt-auto">
        <Figure value={b.percentage === undefined ? '—' : String(b.percentage)} unit="%" />
        <Caption>{b.charging ? 'Charging' : 'On battery'}{b.health !== undefined ? ` · health ${b.health}%` : ''}</Caption>
      </div>
      <div className="mt-2">
        <Bar value={b.percentage} fill="linear-gradient(90deg, #b5f03c, #effcd2)" />
      </div>
    </Tile>
  );
}

function NetworkTile({ t, fmt, onOpen }: { t: DeviceTelemetry; fmt: Formatters; onOpen: () => void }) {
  const n = t.network!;
  const down = fmt.rate(n.download);
  const up = fmt.rate(n.upload);
  const share = n.download !== undefined && n.linkSpeed ? (n.download / n.linkSpeed) * 100 : undefined;
  const stat = (value: string, unit: string, caption: string) => (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[1.625rem] leading-none font-semibold tabular-nums text-off-white">{value}</span>
        <span className="font-display text-[1rem] text-off-white/55">{unit}</span>
      </div>
      <Caption>{caption}</Caption>
    </div>
  );
  return (
    <Tile look={LOOKS.cardio} onOpen={onOpen}>
      <Title icon={Icon.network}>Network</Title>
      <div className="mt-auto">
        <Bar
          thick
          value={share ?? (n.download !== undefined ? Math.min(100, n.download) : undefined)}
          fill="linear-gradient(90deg, #3d8bff, #8fd8ff 65%, #ffffff)"
          label={n.interface ?? 'Download'}
          right={n.linkSpeed ? `of ${fmt.link(n.linkSpeed)}` : `${down.value} ${down.unit}`}
        />
        <div className="mt-2 grid grid-cols-3 gap-4">
          {stat(down.value, down.unit, 'Download')}
          {stat(up.value, up.unit, 'Upload')}
          {stat(n.ping === undefined ? '—' : String(Math.round(n.ping)), 'ms', 'Ping')}
        </div>
      </div>
    </Tile>
  );
}

function DiskTile({ t, onOpen }: { t: DeviceTelemetry; onOpen: () => void }) {
  const d = t.storage![0];
  const usage = usageOf(d);
  return (
    <Tile look={LOOKS.violet} onOpen={onOpen}>
      <Title>{d.name}</Title>
      <div className="mt-auto flex items-baseline gap-1">
        <span className="font-display text-[3rem] leading-none font-semibold tabular-nums text-off-white">{usage === undefined ? '—' : Math.round(usage)}</span>
        <span className="font-display text-[1.5rem] text-off-white/55">%</span>
        <span className="ml-auto truncate pl-2 font-body text-[0.8125rem] whitespace-nowrap text-off-white/55 tabular-nums">
          {gb(d.used)} / {gb(d.total)}
        </span>
      </div>
      <div className="mt-2">
        <Slats value={usage} />
      </div>
    </Tile>
  );
}

function slots(caps: DeviceCapabilities) {
  // battery is the understudy: it takes the first of the cpu and gpu places the device leaves empty
  let battery = caps.battery;
  const take = () => (battery ? ((battery = false), 'battery' as const) : null);
  const first = caps.cpu ? ('cpu' as const) : take();
  const third = caps.gpu ? ('gpu' as const) : take();
  return { first, third };
}

export const HomeWidgets = memo(function HomeWidgets({ entry, caps, fmt, onOpen }: DeviceProps & { entry: DeviceEntry }) {
  const t = entry.telemetry;
  if (!t) return null;
  const { first, third } = slots(caps);
  const go = (s: Screen) => () => onOpen(s);
  const top = [
    first === 'cpu' ? <CpuTile key="cpu" t={t} fmt={fmt} onOpen={go('cpu')} /> : first === 'battery' ? <BatteryTile key="bat1" t={t} look={LOOKS.green} /> : null,
    caps.memory && t.memory ? <MemoryTile key="mem" t={t} onOpen={go('memory')} /> : null,
    third === 'gpu' ? <GpuTile key="gpu" t={t} onOpen={go('gpu')} /> : third === 'battery' ? <BatteryTile key="bat2" t={t} look={LOOKS.magenta} /> : null,
  ].filter(Boolean);
  const bottom = [
    caps.network && t.network ? <NetworkTile key="net" t={t} fmt={fmt} onOpen={go('network')} /> : null,
    caps.storage && t.storage?.length ? <DiskTile key="disk" t={t} onOpen={go('storage')} /> : null,
  ].filter(Boolean);
  if (top.length + bottom.length === 0) return <NoData entry={entry} what="Hardware" />;
  // three columns a row; whatever a row is short of goes to its widest tile, network below and the last one above
  const row = (tiles: ReactNode[], wide: number) =>
    tiles.map((tile, i) => {
      const cols = i === wide ? 3 - (tiles.length - 1) : 1;
      return (
        <div key={i} className={`grid ${cols === 3 ? 'col-span-3' : cols === 2 ? 'col-span-2' : ''}`}>
          {tile}
        </div>
      );
    });
  return (
    <div className="grid h-full grid-cols-3 grid-rows-2 gap-3">
      {row(top, top.length - 1)}
      {row(bottom, 0)}
    </div>
  );
});
