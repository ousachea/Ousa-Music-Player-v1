// home as a set of widgets: each tile a colour of its own fading to black in one corner, a title, one large figure
// and a bar. cpu, memory and the gpu sit along the top, network runs wide underneath beside the disk. a device that
// cannot fill a tile hands it to what it can, so a phone's cpu tile becomes its battery
import { memo, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import { useSettings } from '../store/settings';
import { METRIC } from '../theme';
import { Bar, Caption, Figure, Icon, LOOKS, Slats, Tile, Title, ToneContext } from '../components/widget-kit';

import { toLayout, useOrientation } from '../components/stage';
import { takePager, takeWheel } from '../composables/useCarThingInput';
import { duration, gb, type Formatters } from '../composables/useMetrics';
import type { DeviceCapabilities, DeviceTelemetry, StorageDevice } from '../protocol/types';
import { step, type Screen } from '../store/navigation';
import type { DeviceEntry } from '../store/telemetry';
import { NoData, type DeviceProps } from './device';
import { SunWidget } from './sun';
import { WeatherWidget } from './weather';
import { BatteryWidget, CalendarWidget, ClaudeWidget, ClockWidget, MusicWidget } from './widgets-life';

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
    <Tile look={LOOKS.cpu} onOpen={onOpen}>
      <Title>CPU</Title>
      <div className="mt-2">
        <Bar value={c.usage} fill={METRIC.cpu.accent} label="Usage" right={c.usage === undefined ? '—' : `${Math.round(c.usage)}%`} />
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
    <Tile look={LOOKS.memory} onOpen={onOpen}>
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
    <Tile look={LOOKS.gpu} onOpen={onOpen}>
      <Title icon={Icon.gpu}>GPU</Title>
      <div className="mt-auto">
        <Figure value={g.usage === undefined ? '—' : String(Math.round(g.usage))} unit="%" />
        <Caption>{g.name ?? 'Graphics load'}</Caption>
      </div>
      <div className="mt-2">
        <Bar value={memPct ?? g.usage} fill={`linear-gradient(90deg, ${METRIC.gpu.accent}, ${METRIC.gpu.soft} 75%, #ffffff)`} label={mem ? 'Memory' : 'Load'} right={mem ?? (g.usage === undefined ? '—' : `${Math.round(g.usage)}%`)} />
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
    <Tile look={LOOKS.network} onOpen={onOpen}>
      <Title icon={Icon.network}>Network</Title>
      <div className="mt-auto">
        <Bar
          thick
          value={share ?? (n.download !== undefined ? Math.min(100, n.download) : undefined)}
          fill={`linear-gradient(90deg, ${METRIC.network.accent}, ${METRIC.network.soft} 65%, #ffffff)`}
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

function DiskTile({ d, onOpen }: { d: StorageDevice; onOpen: () => void }) {
  const usage = usageOf(d);
  return (
    <Tile look={LOOKS.disk} onOpen={onOpen}>
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

function CoresTile({ t, onOpen }: { t: DeviceTelemetry; onOpen: () => void }) {
  const cores = t.cpu!.perCoreUsage!;
  return (
    <Tile look={LOOKS.cpu} onOpen={onOpen}>
      <Title icon={Icon.chip}>Cores</Title>
      <div className="mt-auto flex h-[60%] items-end gap-[3px]">
        {cores.map((v, i) => (
          <span key={i} className="flex h-full flex-1 items-end rounded-[3px] bg-white/10">
            <span className="w-full rounded-[3px] transition-[height] duration-700 ease-out" style={{ height: `${Math.max(4, v)}%`, background: `linear-gradient(180deg, #ffffff, ${METRIC.cpu.accent})` }} />
          </span>
        ))}
      </div>
      <div className="mt-1.5">
        <Caption>{cores.length} cores · busiest {Math.max(...cores)}%</Caption>
      </div>
    </Tile>
  );
}

function AppsTile({ t, onOpen }: { t: DeviceTelemetry; onOpen: () => void }) {
  const busiest = [...t.processes!].sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0)).slice(0, 3);
  return (
    <Tile look={LOOKS.apps} onOpen={onOpen}>
      <Title>Top apps</Title>
      <div className="mt-auto flex flex-col gap-1.5">
        {busiest.map(p => (
          <div key={`${p.pid ?? ''}:${p.name}`} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate font-body text-[0.9375rem] text-off-white/85">{p.name}</span>
            <span className="font-display text-[1.125rem] font-semibold tabular-nums text-off-white">{p.cpu === undefined ? '—' : `${Math.round(p.cpu)}%`}</span>
          </div>
        ))}
      </div>
    </Tile>
  );
}

function SystemTile({ t }: { t: DeviceTelemetry }) {
  const up = t.system.uptime;
  return (
    <Tile look={LOOKS.graphite}>
      <Title>System</Title>
      <div className="mt-auto">
        <Figure value={up === undefined ? '—' : duration(up)} size={2.25} />
        <Caption>Up time</Caption>
        <div className="mt-1.5">
          <Caption>{t.device.version ?? t.system.os ?? t.device.platform}</Caption>
          {t.system.hostname && <Caption>{t.system.hostname}</Caption>}
        </div>
      </div>
    </Tile>
  );
}

function DisplaysTile({ t }: { t: DeviceTelemetry }) {
  const list = t.displays!;
  return (
    <Tile look={LOOKS.displays}>
      <Title>{list.length === 1 ? 'Display' : `${list.length} displays`}</Title>
      <div className="mt-auto flex flex-col gap-1">
        {list.slice(0, 3).map((d, i) => (
          <div key={i} className="min-w-0">
            <div className="truncate font-display text-[1.125rem] font-semibold tabular-nums text-off-white">
              {d.width && d.height ? `${d.width} × ${d.height}` : '—'}
              {d.refreshRate ? <span className="text-off-white/55"> · {d.refreshRate} Hz</span> : null}
            </div>
            {d.name && <Caption>{d.name}</Caption>}
          </div>
        ))}
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
  const { upright } = useOrientation();
  const { hidden } = useSettings();
  const t = entry.telemetry;
  if (!t) return null;
  const { first, third } = slots(caps);
  const go = (s: Screen) => () => onOpen(s);
  const top = [
    first === 'cpu' ? <CpuTile key="cpu" t={t} fmt={fmt} onOpen={go('cpu')} /> : first === 'battery' ? <BatteryWidget key="bat1" battery={t.battery!} /> : null,
    caps.memory && t.memory ? <MemoryTile key="mem" t={t} onOpen={go('memory')} /> : null,
    third === 'gpu' ? <GpuTile key="gpu" t={t} onOpen={go('gpu')} /> : third === 'battery' ? <BatteryWidget key="bat2" battery={t.battery!} /> : null,
  ].filter(Boolean);
  const bottom = [
    caps.network && t.network ? <NetworkTile key="net" t={t} fmt={fmt} onOpen={go('network')} /> : null,
    caps.storage && t.storage?.length ? <DiskTile key="disk" d={t.storage[0]} onOpen={go('storage')} /> : null,
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
  // upright the page is two columns by three rows: the tiles in pairs and network last, across the full width
  const isNet = (tile: ReactNode) => (tile as { key?: string }).key === 'net';
  const home = upright ? (
    [...top, ...bottom.filter(b => !isNet(b)), ...bottom.filter(isNet)].map((tile, i) => (
      <div key={i} className={`grid ${isNet(tile) ? 'col-span-2' : ''}`}>
        {tile}
      </div>
    ))
  ) : (
    [...row(top, top.length - 1), ...row(bottom, 0)]
  );

  const usedBattery = first === 'battery' || third === 'battery';
  return <Pager pages={[home, ...extraPages(t, caps, go, usedBattery, hidden)]} upright={upright} />;
});


/** the pages after the first, the same under every home style: the day first, then the machine, six cells a page */
function extraPages(t: DeviceTelemetry, caps: DeviceCapabilities, go: (s: Screen) => () => void, usedBattery: boolean, hidden: readonly string[]): ReactNode[][] {
  // everything the first page had no room for, six cells to a page after it: the day first, then the machine
  type Item = { node: ReactNode; wide?: boolean };
  const listed: (Item | null)[] = [
    { node: <WeatherWidget key="weather" />, wide: true },
    { node: <ClockWidget key="clock" /> },
    t.claude ? { node: <ClaudeWidget key="claude" usage={t.claude} />, wide: true } : null,
    { node: <MusicWidget key="music" />, wide: true },
    { node: <CalendarWidget key="calendar" /> },
    caps.battery && t.battery && !usedBattery ? { node: <BatteryWidget key="bat" battery={t.battery} /> } : null,
    { node: <SunWidget key="sun" />, wide: true },
    t.cpu?.perCoreUsage && t.cpu.perCoreUsage.length > 1 ? { node: <CoresTile key="cores" t={t} onOpen={go('cpu')} /> } : null,
    caps.processes && t.processes?.length ? { node: <AppsTile key="apps" t={t} onOpen={go('processes')} /> } : null,
    { node: <SystemTile key="system" t={t} /> },
    caps.displays && t.displays?.length ? { node: <DisplaysTile key="displays" t={t} /> } : null,
    ...(t.storage ?? []).slice(1).map(d => ({ node: <DiskTile key={`disk-${d.id}`} d={d} onOpen={go('storage')} /> })),
  ];
  // a widget's key names what it shows; any the settings have hidden are left out, the other drives under one name
  const hide = (node: ReactNode) => {
    const key = String((node as { key?: string }).key ?? '');
    return hidden.includes(key.startsWith('disk-') ? 'drives' : key === 'bat' ? 'battery' : key);
  };
  const more = listed.filter((x): x is Item => x !== null && !hide(x.node));
  // first fit: each widget takes the first page with room for it, so a wide one moving on does not leave a hole
  const pages: { tiles: ReactNode[]; cells: number }[] = [];
  more.forEach((item, i) => {
    const size = item.wide ? 2 : 1;
    let page = pages.find(p => p.cells + size <= 6);
    if (!page) pages.push((page = { tiles: [], cells: 0 }));
    page.tiles.push(
      <div key={(item.node as { key?: string }).key ?? i} className={`grid ${item.wide ? 'col-span-2' : ''}`}>
        {item.node}
      </div>,
    );
    page.cells += size;
  });
  return pages.map(p => p.tiles);
}

/** cards and rings keep their own first page, and the widget pages follow it in a plain dress to match */
export const HomePaged = memo(function HomePaged({ entry, caps, onOpen, children }: DeviceProps & { children: ReactNode }) {
  const { upright } = useOrientation();
  const { hidden } = useSettings();
  const t = entry.telemetry;
  if (!t) return null;
  const go = (s: Screen) => () => onOpen(s);
  // the first page lends the battery a place only when it is short of cpu, gpu, memory or network
  const primary = [caps.cpu, caps.gpu, caps.memory, caps.network].filter(Boolean).length;
  const extras = extraPages(t, caps, go, primary < 4 && caps.battery, hidden).map((page, i) => [
    <ToneContext.Provider key={`tone-${i}`} value="flat">
      {page}
    </ToneContext.Provider>,
  ]);
  return <Pager pages={[children, ...extras]} upright={upright} />;
});

const SWIPE_PX = 50;

/** pages side by side, moved a whole page at a time by a swipe or a click of the wheel. moved by hand rather than
 * scrolled natively, since the wheel also arrives as horizontal scroll and would move it twice */
function Pager({ pages, upright }: { pages: ReactNode[]; upright: boolean }) {
  const { rotate } = useOrientation();
  const [page, setPage] = useState(0);
  const count = pages.length;
  const at = Math.min(page, count - 1);
  const atRef = useRef(at);
  atRef.current = at;
  const from = useRef<number | null>(null);

  useEffect(() => {
    takeWheel({
      turn: dir => {
        const next = atRef.current + dir;
        // past either end the wheel goes on to the next screen, as it does everywhere else
        if (next < 0 || next >= count) return step(dir);
        setPage(next);
      },
    });
    // preset 1 on home turns the page, round to the first after the last
    takePager(() => setPage(p => (Math.min(p, count - 1) + 1) % count));
    return () => {
      takeWheel(null);
      takePager(null);
    };
  }, [count]);

  // read along the layout's own horizontal, which is the glass's vertical when the screen is turned
  const down = (e: PointerEvent<HTMLDivElement>) => {
    from.current = toLayout(e.clientX, e.clientY, rotate).x;
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (from.current === null) return;
    const dx = toLayout(e.clientX, e.clientY, rotate).x - from.current;
    from.current = null;
    if (Math.abs(dx) < SWIPE_PX) return;
    setPage(p => Math.min(count - 1, Math.max(0, Math.min(p, count - 1) + (dx < 0 ? 1 : -1))));
  };

  return (
    <div data-scroll className="relative h-full overflow-hidden" onPointerDown={down} onPointerUp={up} onPointerCancel={() => (from.current = null)}>
      <div className={`flex transition-transform duration-500 ${count > 1 ? 'h-[calc(100%-14px)]' : 'h-full'} ease-[cubic-bezier(0.22,1,0.36,1)]`} style={{ transform: `translateX(-${at * 100}%)` }}>
        {pages.map((tiles, i) =>
          Array.isArray(tiles) ? (
            <div key={i} className={`grid h-full w-full shrink-0 gap-3 pr-px ${upright ? 'grid-cols-2 grid-rows-3' : 'grid-cols-3 grid-rows-2'}`}>
              {tiles}
            </div>
          ) : (
            <div key={i} className="h-full w-full shrink-0 pr-px">
              {tiles}
            </div>
          ),
        )}
      </div>
      {count > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-1.5">
          {pages.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === at ? 'w-4 bg-off-white' : 'w-1.5 bg-white/30'}`} />
          ))}
        </div>
      )}
    </div>
  );
}
