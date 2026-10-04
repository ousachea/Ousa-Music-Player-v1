// the screens about one device. each reads only the sections the device actually sent; a section it cannot
// report gets a plain line saying so rather than a screen of dashes
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Big, Label, MetricCard, ProcessRow, Stat, StorageCard, TemperatureBadge, platformLabel } from '../components/cards';
import { COLORS, MiniGraph, NetworkGraph, ProgressBar, levelColor } from '../components/graphs';
import { RING_COLORS, Ring, RingValue } from '../components/ring';
import { duration, gb, pct, type Formatters } from '../composables/useMetrics';
import { useWheelScroll } from '../composables/useWheel';
import type { DeviceCapabilities } from '../protocol/types';
import type { Screen } from '../store/navigation';
import type { DeviceEntry } from '../store/telemetry';

export type DeviceProps = {
  entry: DeviceEntry;
  caps: DeviceCapabilities;
  fmt: Formatters;
  windowSec: number;
  onOpen: (s: Screen) => void;
};

function Title({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="line-clamp-2 min-w-0 font-display text-[1.375rem] leading-tight font-semibold text-near">{children}</div>
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
              <MetricCard key={tile} label="CPU" color={COLORS.cpu} onOpen={() => onOpen('cpu')}>
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
              <MetricCard key={tile} label="GPU" color={COLORS.gpu} onOpen={() => onOpen('gpu')}>
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
              <MetricCard key={tile} label="RAM" color={COLORS.ram} onOpen={() => onOpen('memory')}>
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
              <MetricCard key={tile} label="Network" color={COLORS.up} onOpen={() => onOpen('network')}>
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
              <MetricCard key={tile} label="Battery" color={COLORS.battery}>
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
              <MetricCard key={tile} label="Storage" color={COLORS.storage} onOpen={() => onOpen('storage')}>
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
  const t = entry.telemetry;
  if (!t) return null;
  const tiles = tilesFor(caps);
  if (tiles.length === 0) return <NoData entry={entry} what="Hardware" />;
  const value = (v: number | undefined) => <RingValue value={v === undefined ? '—' : String(Math.round(v))} unit="%" />;
  return (
    <div className="flex h-full items-center justify-evenly">
      {tiles.map((tile, i) => {
        const divider = i > 0 && <span key={`d${tile}`} className="h-[70%] w-px bg-white/8" />;
        let ring: ReactNode;
        switch (tile) {
          case 'cpu':
            ring = <Ring percent={t.cpu?.usage} colors={RING_COLORS.cpu} center={value(t.cpu?.usage)} label="CPU" sub={fmt.temp(t.cpu?.temperature)} onOpen={() => onOpen('cpu')} />;
            break;
          case 'gpu':
            ring = <Ring percent={t.gpu?.usage} colors={RING_COLORS.gpu} center={value(t.gpu?.usage)} label="GPU" sub={fmt.temp(t.gpu?.temperature)} onOpen={() => onOpen('gpu')} />;
            break;
          case 'memory': {
            const m = t.memory;
            const usage = m?.usage ?? (m?.used !== undefined && m.total ? (m.used / m.total) * 100 : undefined);
            const sub = m?.used !== undefined && m.total !== undefined ? `${m.used.toFixed(1)} / ${Math.round(m.total)} GB` : null;
            ring = <Ring percent={usage} colors={RING_COLORS.ram} center={value(usage)} label="RAM" sub={sub} onOpen={() => onOpen('memory')} />;
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
            ring = <Ring percent={share} colors={RING_COLORS.network} center={<RingValue value={down.value} unit={down.unit} stacked />} label="Network" sub={sub || null} onOpen={() => onOpen('network')} />;
            break;
          }
          case 'battery':
            ring = <Ring percent={t.battery?.percentage} colors={RING_COLORS.battery} center={value(t.battery?.percentage)} label="Battery" sub={t.battery?.charging ? 'charging' : t.battery?.charging === false ? 'on battery' : null} />;
            break;
          case 'storage': {
            const d = t.storage?.[0];
            const usage = d?.usage ?? (d?.used !== undefined && d.total ? (d.used / d.total) * 100 : undefined);
            ring = <Ring percent={usage} colors={RING_COLORS.storage} center={value(usage)} label="Storage" sub={d ? `${gb(d.used)} / ${gb(d.total)}` : null} onOpen={() => onOpen('storage')} />;
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
  const c = entry.telemetry?.cpu;
  if (!caps.cpu || !c) return <NoData entry={entry} what="CPU" />;
  const cores = c.perCoreUsage;
  return (
    <div className="grid h-full grid-cols-[17rem_1fr] gap-5">
      <div className="flex min-w-0 flex-col gap-3">
        <Title>{c.name ?? 'CPU'}</Title>
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
      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative min-h-0 flex-1 rounded-lg bg-white/[0.045] px-3 py-2">
          <div className="absolute top-2 left-3">
            <Label>Usage · {windowSec}s</Label>
          </div>
          <MiniGraph windowSec={windowSec} max={100} lines={[{ points: entry.history.cpu, color: COLORS.cpu, fill: true }]} />
        </div>
        {cores && cores.length > 0 && (
          <div className="rounded-lg bg-white/[0.045] px-3 py-2">
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
  const g = entry.telemetry?.gpu;
  if (!caps.gpu || !g) return <NoData entry={entry} what="GPU" />;
  const vram = g.memoryUsed !== undefined && g.memoryTotal !== undefined ? `${g.memoryUsed.toFixed(1)} / ${Math.round(g.memoryTotal)} GB` : g.memoryUsed !== undefined ? gb(g.memoryUsed) : null;
  return (
    <div className="grid h-full grid-cols-[17rem_1fr] gap-5">
      <div className="flex min-w-0 flex-col gap-3">
        <Title>{g.name ?? 'GPU'}</Title>
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
      <div className="relative min-h-0 rounded-lg bg-white/[0.045] px-3 py-2">
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
  const m = entry.telemetry?.memory;
  if (!caps.memory || !m) return <NoData entry={entry} what="Memory" />;
  const usage = m.usage ?? (m.used !== undefined && m.total ? (m.used / m.total) * 100 : undefined);
  return (
    <div className="grid h-full grid-cols-[1fr_1fr] gap-5">
      <div className="flex min-w-0 flex-col gap-3">
        <Title>Memory</Title>
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
      <div className="relative min-h-0 rounded-lg bg-white/[0.045] px-3 py-2">
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
  const n = entry.telemetry?.network;
  if (!caps.network || !n) return <NoData entry={entry} what="Network" />;
  const down = fmt.rate(n.download);
  const up = fmt.rate(n.upload);
  const link = fmt.link(n.linkSpeed);
  return (
    <div className="grid h-full grid-cols-[17rem_1fr] gap-5">
      <div className="flex min-w-0 flex-col gap-2">
        <Title>Network</Title>
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
      <div className="relative min-h-0 rounded-lg bg-white/[0.045] px-3 py-2">
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
  const drives = entry.telemetry?.storage;
  const list = useRef<HTMLDivElement>(null);
  useWheelScroll(list);
  if (!caps.storage || !drives || drives.length === 0) return <NoData entry={entry} what="Storage" />;
  return (
    <div ref={list} data-scroll className="grid h-full auto-rows-min grid-cols-2 gap-3 overflow-y-auto [scrollbar-width:none]">
      {drives.map(d => (
        <StorageCard key={d.id} drive={d} temp={fmt.temp(d.temperature)} />
      ))}
    </div>
  );
});

// ---- processes

export const Processes = memo(function Processes({
  entry,
  caps,
  sort,
  onSort,
}: DeviceProps & { sort: 'cpu' | 'memory'; onSort: (s: 'cpu' | 'memory') => void }) {
  const list = useRef<HTMLDivElement>(null);
  useWheelScroll(list);
  const procs = entry.telemetry?.processes;
  const sorted = useMemo(
    () => [...(procs ?? [])].sort((a, b) => (sort === 'cpu' ? (b.cpu ?? 0) - (a.cpu ?? 0) : (b.memory ?? 0) - (a.memory ?? 0))),
    [procs, sort],
  );
  if (!caps.processes || !procs) return <NoData entry={entry} what="Process" />;
  const head = (key: 'cpu' | 'memory', label: string, width: string) => (
    <button
      onClick={() => onSort(key)}
      className={`${width} rounded-sm py-1 text-right font-mono text-[0.75rem] tracking-[0.18em] ${sort === key ? 'text-off-white' : 'text-dim'}`}>
      {label}
      {sort === key ? ' ▼' : ''}
    </button>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-white/12 pb-1">
        <span className="flex-1">
          <Label>Processes · {procs.length}</Label>
        </span>
        {head('cpu', 'CPU', 'w-20')}
        {head('memory', 'MEMORY', 'w-24')}
      </div>
      <div ref={list} data-scroll className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
        {sorted.map(p => (
          <ProcessRow key={`${p.name}-${p.pid ?? ''}`} process={p} sort={sort} />
        ))}
      </div>
    </div>
  );
});
