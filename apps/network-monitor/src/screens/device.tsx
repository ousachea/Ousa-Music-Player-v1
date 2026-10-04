// the screens about one device. each reads only the sections the device actually sent; a section it cannot
// report gets a plain line saying so rather than a screen of dashes
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Big, Label, MetricCard, Stat, StorageCard, TemperatureBadge, platformLabel } from '../components/cards';
import { COLORS, MiniGraph, NetworkGraph, ProgressBar, levelColor } from '../components/graphs';
import { AnimatedIcon, type IconKind } from '../components/icons';
import { RING_COLORS, Ring, RingValue } from '../components/ring';
import { duration, gb, pct, type Formatters } from '../composables/useMetrics';
import { useWheelScroll } from '../composables/useWheel';
import type { DeviceCapabilities } from '../protocol/types';
import { openDetail, type Screen } from '../store/navigation';
import type { DeviceEntry } from '../store/telemetry';
import { useOrientation } from '../components/stage';
import { ProcessRadar } from './radar';

export type DeviceProps = {
  entry: DeviceEntry;
  caps: DeviceCapabilities;
  fmt: Formatters;
  windowSec: number;
  onOpen: (s: Screen) => void;
};

function Title({ children, right, icon, color }: { children: ReactNode; right?: ReactNode; icon?: IconKind; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="shrink-0 self-center" style={{ color }}>
            <AnimatedIcon kind={icon} className="h-6 w-6" />
          </span>
        )}
        <div className="line-clamp-2 min-w-0 font-display text-[1.375rem] leading-tight font-semibold text-near">{children}</div>
      </div>
      {right}
    </div>
  );
}

export function NoData({ entry, what }: { entry: DeviceEntry; what: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="font-display text-[1.75rem] font-semibold text-soft">No {what} data</div>
      <div className="max-w-md font-mono text-[0.9375rem] text-dim">
        {entry.info.name} ({platformLabel(entry.info)}) does not report {what.toLowerCase()} information.
      </div>
    </div>
  );
}

export function Offline({ entry }: { entry: DeviceEntry }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ago = entry.lastUpdate === null ? null : Math.round((Date.now() - entry.lastUpdate) / 1000);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="font-display text-[1.75rem] font-semibold tracking-[0.06em] text-soft uppercase">{entry.info.name}</div>
      <div className="flex items-center gap-3 font-display text-[3.5rem] leading-none font-bold tracking-[0.08em] text-dim">
        <span className="h-4 w-4 rounded-full border-2 border-current" />
        OFFLINE
      </div>
      <div className="mt-2 font-mono text-[0.875rem] tracking-[0.18em] text-dim uppercase">Last update</div>
      <div className="font-display text-[1.5rem] text-near tabular-nums">{ago === null ? 'never' : `${duration(ago)} ago`}</div>
    </div>
  );
}

// ---- home

type Tile = 'cpu' | 'gpu' | 'memory' | 'network' | 'battery' | 'storage';

/** the four that matter most, with the gaps a device cannot fill taken by what it can */
function tilesFor(caps: DeviceCapabilities): Tile[] {
  const wanted: Tile[] = ['cpu', 'gpu', 'memory', 'network'].filter(t => caps[t as keyof DeviceCapabilities]) as Tile[];
  for (const spare of ['battery', 'storage'] as Tile[]) if (wanted.length < 4 && caps[spare]) wanted.push(spare);
  return wanted;
}

export const Home = memo(function Home({ entry, caps, fmt, onOpen }: DeviceProps) {
  const t = entry.telemetry;
  if (!t) return null;
  const tiles = tilesFor(caps);
  const layout = tiles.length === 1 ? 'grid-cols-1' : tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2';
  return (
    <div className={`grid h-full gap-3 ${layout}`}>
      {tiles.map(tile => {
        switch (tile) {
          case 'cpu':
            return (
              <MetricCard key={tile} icon="cpu" label="CPU" color={COLORS.cpu} onOpen={() => onOpen('cpu')}>
                <div className="flex items-end justify-between">
                  <Big value={pct(t.cpu?.usage)} />
                  <TemperatureBadge celsius={t.cpu?.temperature} text={fmt.temp(t.cpu?.temperature)} />
                </div>
                <div className="mt-auto">
                  <ProgressBar value={t.cpu?.usage} color={COLORS.cpu} />
                </div>
              </MetricCard>
            );
          case 'gpu':
            return (
              <MetricCard key={tile} icon="gpu" label="GPU" color={COLORS.gpu} onOpen={() => onOpen('gpu')}>
                <div className="flex items-end justify-between">
                  <Big value={pct(t.gpu?.usage)} />
                  <TemperatureBadge celsius={t.gpu?.temperature} text={fmt.temp(t.gpu?.temperature)} />
                </div>
                <div className="mt-auto">
                  <ProgressBar value={t.gpu?.usage} color={COLORS.gpu} />
                </div>
              </MetricCard>
            );
          case 'memory': {
            const m = t.memory;
            const usage = m?.usage ?? (m?.used !== undefined && m.total ? (m.used / m.total) * 100 : undefined);
            return (
              <MetricCard key={tile} icon="memory" label="RAM" color={COLORS.ram} onOpen={() => onOpen('memory')}>
                <div className="flex items-end justify-between">
                  <Big value={pct(usage)} />
                  <span className="font-mono text-[1rem] text-soft tabular-nums">
                    {m?.used?.toFixed(1) ?? '—'} / {m?.total !== undefined ? gb(m.total) : '—'}
                  </span>
                </div>
                <div className="mt-auto">
                  <ProgressBar value={usage} color={COLORS.ram} />
                </div>
              </MetricCard>
            );
          }
          case 'network': {
            const n = t.network;
            const down = fmt.rate(n?.download);
            const up = fmt.rate(n?.upload);
            return (
              <MetricCard key={tile} icon="network" label="Network" color={COLORS.down} onOpen={() => onOpen('network')}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-[1.5rem]" style={{ color: COLORS.down }}>↓</span>
                    <Big value={down.value} unit={down.unit} size={2.25} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-[1.5rem]" style={{ color: COLORS.up }}>↑</span>
                    <Big value={up.value} unit={up.unit} size={2.25} dim={n?.upload === undefined} />
                  </div>
                </div>
                <div className="mt-auto font-mono text-[1rem] text-soft tabular-nums">
                  {n?.ping !== undefined ? `${Math.round(n.ping)} ms` : '— ms'}
                  {n?.interface ? `  ·  ${n.interface}` : ''}
                </div>
              </MetricCard>
            );
          }
          case 'battery': {
            const b = t.battery;
            return (
              <MetricCard key={tile} icon="battery" label="Battery" color={COLORS.battery} onOpen={() => openDetail('battery')}>
                <div className="flex items-end justify-between">
                  <Big value={pct(b?.percentage)} />
                  <span className="font-mono text-[1rem] text-soft">{b?.charging === undefined ? '' : b.charging ? 'charging' : 'on battery'}</span>
                </div>
                <div className="mt-auto">
                  <ProgressBar value={b?.percentage} color={b?.percentage !== undefined && b.percentage < 15 ? COLORS.err : COLORS.battery} />
                </div>
              </MetricCard>
            );
          }
          case 'storage': {
            const d = t.storage?.[0];
            const usage = d?.usage ?? (d?.used !== undefined && d.total ? (d.used / d.total) * 100 : undefined);
            return (
              <MetricCard key={tile} icon="storage" label="Storage" color={COLORS.storage} onOpen={() => onOpen('storage')}>
                <div className="flex items-end justify-between">
                  <Big value={pct(usage)} />
                  <span className="font-mono text-[1rem] text-soft tabular-nums">
                    {gb(d?.used)} / {gb(d?.total)}
                  </span>
                </div>
                <div className="mt-auto">
                  <ProgressBar value={usage} color={COLORS.storage} />
                </div>
              </MetricCard>
            );
          }
        }
      })}
      {tiles.length === 0 && <NoData entry={entry} what="Hardware" />}
    </div>
  );
});

/** the same tiles as rings: a percentage reads as a ring directly; throughput is set against the link it runs on,
 * or against the busiest moment in the graph when the device does not say how fast its link is */
export const HomeRings = memo(function HomeRings({ entry, caps, fmt, onOpen }: DeviceProps) {
  const { upright } = useOrientation();
  const t = entry.telemetry;
  if (!t) return null;
  const tiles = tilesFor(caps);
  if (tiles.length === 0) return <NoData entry={entry} what="Hardware" />;
  const value = (v: number | undefined) => <RingValue value={v === undefined ? '—' : String(Math.round(v))} unit="%" />;
  return (
    <div className={`h-full ${upright ? 'grid grid-cols-2 place-items-center' : 'flex items-center justify-evenly'}`}>
      {tiles.map((tile, i) => {
        const divider = i > 0 && !upright && <span key={`d${tile}`} className="h-[70%] w-px bg-white/8" />;
        let ring: ReactNode;
        switch (tile) {
          case 'cpu':
            ring = <Ring percent={t.cpu?.usage} colors={RING_COLORS.cpu} center={value(t.cpu?.usage)} icon="cpu" label="CPU" sub={fmt.temp(t.cpu?.temperature)} onOpen={() => onOpen('cpu')} />;
            break;
          case 'gpu':
            ring = <Ring percent={t.gpu?.usage} colors={RING_COLORS.gpu} center={value(t.gpu?.usage)} icon="gpu" label="GPU" sub={fmt.temp(t.gpu?.temperature)} onOpen={() => onOpen('gpu')} />;
            break;
          case 'memory': {
            const m = t.memory;
            const usage = m?.usage ?? (m?.used !== undefined && m.total ? (m.used / m.total) * 100 : undefined);
            const sub = m?.used !== undefined && m.total !== undefined ? `${m.used.toFixed(1)} / ${Math.round(m.total)} GB` : null;
            ring = <Ring percent={usage} colors={RING_COLORS.ram} center={value(usage)} icon="memory" label="RAM" sub={sub} onOpen={() => onOpen('memory')} />;
            break;
          }
          case 'network': {
            const n = t.network;
            const peak = Math.max(1, ...entry.history.down.map(p => p.value));
            const share = n?.download === undefined ? undefined : (n.download / (n.linkSpeed ?? peak)) * 100;
            const down = fmt.rate(n?.download);
            const sub = [n?.upload !== undefined ? `↑ ${fmt.rate(n.upload).value} ${fmt.rate(n.upload).unit}` : null, n?.ping !== undefined ? `${Math.round(n.ping)} ms` : null]
              .filter(Boolean)
              .join(' · ');
            ring = <Ring percent={share} colors={RING_COLORS.network} center={<RingValue value={down.value} unit={down.unit} stacked />} icon="network" label="Network" sub={sub || null} onOpen={() => onOpen('network')} />;
            break;
          }
          case 'battery':
            ring = <Ring percent={t.battery?.percentage} colors={RING_COLORS.battery} center={value(t.battery?.percentage)} icon="battery" label="Battery" sub={t.battery?.charging ? 'charging' : t.battery?.charging === false ? 'on battery' : null} onOpen={() => openDetail('battery')} />;
            break;
          case 'storage': {
            const d = t.storage?.[0];
            const usage = d?.usage ?? (d?.used !== undefined && d.total ? (d.used / d.total) * 100 : undefined);
            ring = <Ring percent={usage} colors={RING_COLORS.storage} center={value(usage)} icon="storage" label="Storage" sub={d ? `${gb(d.used)} / ${gb(d.total)}` : null} onOpen={() => onOpen('storage')} />;
            break;
          }
        }
        return [divider, <div key={tile}>{ring}</div>];
      })}
    </div>
  );
});

// ---- cpu

export const Cpu = memo(function Cpu({ entry, caps, fmt, windowSec }: DeviceProps) {
  const { upright } = useOrientation();
  const c = entry.telemetry?.cpu;
  if (!caps.cpu || !c) return <NoData entry={entry} what="CPU" />;
  const cores = c.perCoreUsage;
  return (
    <div className={`h-full gap-5 ${upright ? 'flex flex-col' : 'grid grid-cols-[17rem_1fr]'}`}>
      <div className="flex min-w-0 flex-col gap-3">
        <Title icon="cpu" color={COLORS.cpu}>{c.name ?? 'CPU'}</Title>
        <div className="flex items-end gap-3">
          <Big value={pct(c.usage)} size={5} />
          <TemperatureBadge celsius={c.temperature} text={fmt.temp(c.temperature)} />
        </div>
        <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Clock" value={fmt.ghz(c.frequency)} />
          <Stat label="Load" value={c.load ? c.load[0].toFixed(2) : null} sub={c.load ? c.load.slice(1).map(l => l.toFixed(2)).join(' · ') : undefined} />
          <Stat label="Cores" value={c.cores !== undefined ? String(c.cores) : null} />
          <Stat label="Threads" value={c.threads !== undefined ? String(c.threads) : null} />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="relative min-h-0 flex-1 rounded-[var(--panel-radius)] bg-white/[0.045] px-3 py-2">
          <div className="absolute top-2 left-3">
            <Label>Usage · {windowSec}s</Label>
          </div>
          <MiniGraph windowSec={windowSec} max={100} lines={[{ points: entry.history.cpu, color: COLORS.cpu, fill: true }]} />
        </div>
        {cores && cores.length > 0 && (
          <div className="rounded-[var(--panel-radius)] bg-white/[0.045] px-3 py-2">
            <Label>{cores.length} cores</Label>
            <div className="mt-2 flex h-16 items-end gap-[3px]">
              {cores.map((v, i) => (
                <div key={i} className="flex h-full flex-1 items-end rounded-[2px] bg-white/6">
                  <div className="w-full rounded-[2px] transition-[height] duration-700 ease-out" style={{ height: `${v}%`, backgroundColor: levelColor(v, COLORS.cpu) }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ---- gpu

export const Gpu = memo(function Gpu({ entry, caps, fmt, windowSec }: DeviceProps) {
  const { upright } = useOrientation();
  const g = entry.telemetry?.gpu;
  if (!caps.gpu || !g) return <NoData entry={entry} what="GPU" />;
  const vram = g.memoryUsed !== undefined && g.memoryTotal !== undefined ? `${g.memoryUsed.toFixed(1)} / ${Math.round(g.memoryTotal)} GB` : g.memoryUsed !== undefined ? gb(g.memoryUsed) : null;
  return (
    <div className={`h-full gap-5 ${upright ? 'flex flex-col' : 'grid grid-cols-[17rem_1fr]'}`}>
      <div className="flex min-w-0 flex-col gap-3">
        <Title icon="gpu" color={COLORS.gpu}>{g.name ?? 'GPU'}</Title>
        <div className="flex items-end gap-3">
          <Big value={pct(g.usage)} size={5} />
          <TemperatureBadge celsius={g.temperature} text={fmt.temp(g.temperature)} />
        </div>
        <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3">
          {/* a gpu with no memory of its own, as on apple silicon, is reporting its share of system memory */}
          <Stat label={g.memoryTotal !== undefined ? 'VRAM' : 'GPU memory'} value={vram} />
          <Stat label="Clock" value={g.frequency !== undefined ? `${g.frequency} MHz` : null} />
          <Stat label="Power" value={g.power !== undefined ? `${g.power} W` : null} />
          <Stat label="Fan" value={g.fan !== undefined ? `${g.fan}%` : null} />
        </div>
      </div>
      <div className="relative min-h-0 flex-1 rounded-[var(--panel-radius)] bg-white/[0.045] px-3 py-2">
        <div className="absolute top-2 left-3 flex gap-4">
          <Label>Usage · {windowSec}s</Label>
          {caps.gpuTemperature && <Label color={COLORS.warn}>Temp</Label>}
        </div>
        <MiniGraph
          windowSec={windowSec}
          max={100}
          lines={[
            { points: entry.history.gpu, color: COLORS.gpu, fill: true },
            { points: entry.history.gpuTemp, color: COLORS.warn },
          ]}
        />
      </div>
    </div>
  );
});

// ---- memory

export const Memory = memo(function Memory({ entry, caps, windowSec }: DeviceProps) {
  const { upright } = useOrientation();
  const m = entry.telemetry?.memory;
  if (!caps.memory || !m) return <NoData entry={entry} what="Memory" />;
  const usage = m.usage ?? (m.used !== undefined && m.total ? (m.used / m.total) * 100 : undefined);
  return (
    <div className={`h-full gap-5 ${upright ? 'flex flex-col' : 'grid grid-cols-[1fr_1fr]'}`}>
      <div className="flex min-w-0 flex-col gap-3">
        <Title icon="memory" color={COLORS.ram}>Memory</Title>
        <Big value={`${m.used?.toFixed(1) ?? '—'} / ${m.total !== undefined ? Math.round(m.total) : '—'}`} unit="GB" size={3.5} />
        <div className="flex items-center gap-4">
          <span className="font-display text-[2rem] font-semibold tabular-nums" style={{ color: levelColor(usage, COLORS.ram) }}>
            {pct(usage)}
          </span>
          <div className="flex-1">
            <ProgressBar value={usage} color={COLORS.ram} height={14} />
          </div>
        </div>
        <div className="mt-auto grid grid-cols-3 gap-4">
          <Stat label="Available" value={m.available !== undefined ? gb(m.available) : null} />
          <Stat label="Cached" value={m.cached !== undefined ? gb(m.cached) : null} />
          <Stat label="Swap" value={m.swapUsed !== undefined ? gb(m.swapUsed) : null} sub={m.swapTotal !== undefined ? `of ${gb(m.swapTotal)}` : undefined} />
        </div>
      </div>
      <div className="relative min-h-0 flex-1 rounded-[var(--panel-radius)] bg-white/[0.045] px-3 py-2">
        <div className="absolute top-2 left-3">
          <Label>Usage · {windowSec}s</Label>
        </div>
        <MiniGraph windowSec={windowSec} max={100} lines={[{ points: entry.history.ram, color: COLORS.ram, fill: true }]} />
      </div>
    </div>
  );
});

// ---- network

export const Network = memo(function Network({ entry, caps, fmt, windowSec }: DeviceProps) {
  const { upright } = useOrientation();
  const n = entry.telemetry?.network;
  if (!caps.network || !n) return <NoData entry={entry} what="Network" />;
  const down = fmt.rate(n.download);
  const up = fmt.rate(n.upload);
  const link = fmt.link(n.linkSpeed);
  return (
    <div className={`h-full gap-5 ${upright ? 'flex flex-col' : 'grid grid-cols-[17rem_1fr]'}`}>
      <div className="flex min-w-0 flex-col gap-2">
        <Title icon="network" color={COLORS.down}>Network</Title>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[2rem]" style={{ color: COLORS.down }}>↓</span>
          <Big value={down.value} unit={down.unit} size={3.25} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[2rem]" style={{ color: COLORS.up }}>↑</span>
          <Big value={up.value} unit={up.unit} size={3.25} dim={n.upload === undefined} />
        </div>
        <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Ping" value={n.ping !== undefined ? `${Math.round(n.ping)} ms` : null} />
          <Stat label={n.interface ?? 'Link'} value={link ?? (n.signal !== undefined ? `${n.signal}%` : null)} sub={link && n.signal !== undefined ? `signal ${n.signal}%` : n.metered ? 'metered' : undefined} />
          {/* an address needs the width of both columns to show whole */}
          <div className="col-span-2">
            <Stat label={n.ip ? 'IP' : 'Public IP'} value={n.ip ?? n.publicIp ?? null} />
          </div>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 rounded-[var(--panel-radius)] bg-white/[0.045] px-3 py-2">
        <div className="absolute top-2 left-3 flex gap-4">
          <Label color={COLORS.down}>RX</Label>
          <Label color={COLORS.up}>TX</Label>
          <Label>{windowSec}s</Label>
        </div>
        <NetworkGraph windowSec={windowSec} down={entry.history.down} up={entry.history.up} />
      </div>
    </div>
  );
});

// ---- storage

export const Storage = memo(function Storage({ entry, caps, fmt }: DeviceProps) {
  const { upright } = useOrientation();
  const drives = entry.telemetry?.storage;
  const list = useRef<HTMLDivElement>(null);
  useWheelScroll(list);
  if (!caps.storage || !drives || drives.length === 0) return <NoData entry={entry} what="Storage" />;
  return (
    <div ref={list} data-scroll className={`grid h-full auto-rows-min gap-3 overflow-y-auto [scrollbar-width:none] ${upright ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {drives.map(d => (
        <StorageCard key={d.id} drive={d} temp={fmt.temp(d.temperature)} />
      ))}
    </div>
  );
});

// ---- processes

/** one colour per row, cycling, so a process is the same colour in its bar and its trend */
const PROCESS_COLORS = ['#ef3a52', '#ff9f3a', '#bf9a72', '#b56ce3', '#f6d04d', '#6f63ea', '#3a8ef2', '#4cc6cc', '#ececf0'];
/** readings kept per process for its trend; the agent sends processes every fifth frame, so about a minute */
const TREND_POINTS = 12;

type Trend = { cpu: number[]; memory: number[]; seen: number };

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 72;
  const h = 18;
  if (points.length < 2) {
    return <path d={`M2 ${h / 2}H${w - 2}`} stroke={color} strokeWidth="1.6" opacity={0.5} />;
  }
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const d = points
    .map((v, i) => `${i ? 'L' : 'M'}${(2 + (i / (points.length - 1)) * (w - 4)).toFixed(1)} ${(h - 3 - ((v - lo) / span) * (h - 6)).toFixed(1)}`)
    .join('');
  return <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />;
}

export const Processes = memo(function Processes({
  entry,
  caps,
  sort,
  onSort,
  view,
  onView,
}: DeviceProps & {
  sort: 'cpu' | 'memory';
  onSort: (s: 'cpu' | 'memory') => void;
  view: 'radar' | 'list';
  onView: (v: 'radar' | 'list') => void;
}) {
  const { upright } = useOrientation();
  const list = useRef<HTMLDivElement>(null);
  useWheelScroll(list);
  // upright the name keeps its room and the share column narrows
  const cols = upright ? 'grid-cols-[1fr_8rem_4.75rem]' : 'grid-cols-[1fr_15rem_5.5rem]';
  const procs = entry.telemetry?.processes;
  const ram = entry.telemetry?.memory?.total;

  // each new list of processes adds a reading to every process's trend; guarded on the list itself, so a render
  // that is not a new reading adds nothing
  const trends = useRef(new Map<string, Trend>());
  const lastList = useRef<typeof procs>(undefined);
  if (procs && procs !== lastList.current) {
    lastList.current = procs;
    const now = Date.now();
    for (const p of procs) {
      const key = `${p.pid ?? ''}:${p.name}`;
      const t = trends.current.get(key) ?? { cpu: [], memory: [], seen: now };
      t.cpu = [...t.cpu, p.cpu ?? 0].slice(-TREND_POINTS);
      t.memory = [...t.memory, p.memory ?? 0].slice(-TREND_POINTS);
      t.seen = now;
      trends.current.set(key, t);
    }
    // a process gone for a few minutes takes its history with it
    for (const [key, t] of trends.current) if (now - t.seen > 180_000) trends.current.delete(key);
  }

  const sorted = useMemo(
    () => [...(procs ?? [])].sort((a, b) => (sort === 'cpu' ? (b.cpu ?? 0) - (a.cpu ?? 0) : (b.memory ?? 0) - (a.memory ?? 0))),
    [procs, sort],
  );
  if (!caps.processes || !procs) return <NoData entry={entry} what="Process" />;

  // cpu reads as a share of one core; memory as a share of the machine's ram
  const share = (p: (typeof sorted)[number]) =>
    sort === 'cpu' ? p.cpu : p.memory !== undefined && ram ? (p.memory / ram) * 100 : undefined;
  const top = Math.max(0.1, ...sorted.map(p => share(p) ?? 0));

  const tab = (key: 'cpu' | 'memory', label: string) => (
    <button
      onClick={() => onSort(key)}
      className={`rounded-md px-2 py-0.5 font-mono text-[0.75rem] font-medium tracking-[0.14em] transition-colors duration-150 ${
        sort === key ? 'bg-white/12 text-off-white' : 'text-dim active:bg-white/8'
      }`}>
      {label}
    </button>
  );

  const views = (
    <div className="flex items-center gap-1">
      {(['radar', 'list'] as const).map(v => (
        <button
          key={v}
          onClick={() => onView(v)}
          className={`rounded-md px-2 py-0.5 font-mono text-[0.75rem] font-medium tracking-[0.14em] uppercase transition-colors duration-150 ${
            view === v ? 'bg-white/12 text-off-white' : 'text-dim active:bg-white/8'
          }`}>
          {v}
        </button>
      ))}
    </div>
  );

  if (view === 'radar') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-4 pb-1">
          <Label>Processes</Label>
          {views}
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-1 font-mono text-[0.75rem] font-medium tracking-[0.2em] text-dim">TOP 8 BY</span>
            {tab('cpu', 'CPU')}
            {tab('memory', 'RAM')}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <ProcessRadar procs={sorted.slice(0, 8)} ram={ram} upright={upright} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className={`grid ${cols} items-center gap-5 pb-2`}>
        <div className="flex items-center gap-3">
          <Label>Processes · {procs.length}</Label>
          {views}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 font-mono text-[0.75rem] font-medium tracking-[0.2em] text-dim">SHARE</span>
          {tab('cpu', 'CPU')}
          {tab('memory', 'RAM')}
        </div>
        <Label>Trend</Label>
      </div>
      <div ref={list} data-scroll className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
        {sorted.map((p, i) => {
          const color = PROCESS_COLORS[i % PROCESS_COLORS.length];
          const value = share(p);
          const trend = trends.current.get(`${p.pid ?? ''}:${p.name}`);
          return (
            <div key={`${p.pid ?? ''}:${p.name}`} className={`grid h-9 ${cols} items-center gap-5`}>
              <span className="truncate font-body text-[1rem] text-near">{p.name}</span>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(3, ((value ?? 0) / top) * 100)}%`, backgroundColor: color }}
                  />
                </div>
                <span className="w-14 text-right font-body text-[0.9375rem] text-near tabular-nums">
                  {value === undefined ? '—' : `${value.toFixed(1)}%`}
                </span>
              </div>
              <div className="grid h-7 place-items-center rounded-md bg-white/[0.07] ring-1 ring-white/6">
                <svg viewBox="0 0 72 18" className="h-[18px] w-[72px] overflow-visible">
                  <Sparkline points={(sort === 'cpu' ? trend?.cpu : trend?.memory) ?? []} color={color} />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
