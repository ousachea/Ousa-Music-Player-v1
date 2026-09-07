import { BridgethingClient, type ConnectionState } from '@bridgething/client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { daemonUrl } from './daemon';
import { createProbe, unavailableFields, type LinkStatus, type NetState, type Sample } from './net';

const HISTORY_MS = 60_000;
const PING_EVERY_MS = 2000;
// a metered link should not be spending data on measurements, so sampling only runs on an unmetered one
const THROUGHPUT_EVERY_MS = 6000;
const THROUGHPUT_BYTES = 65_536;
// the readouts settle at this rate; the probes run faster than the eye needs
const PAINT_EVERY_MS = 500;

const STATUS_LABEL: Record<LinkStatus, string> = {
  connected: 'CONNECTED',
  degraded: 'DEGRADED',
  offline: 'OFFLINE',
  unknown: 'CHECKING',
};

const STATUS_COLOR: Record<LinkStatus, string> = {
  connected: 'var(--color-ok)',
  degraded: 'var(--color-experimental)',
  offline: 'var(--color-err)',
  unknown: 'var(--color-dim)',
};

function mbps(kbps: number | null) {
  if (kbps === null) return null;
  return kbps >= 1000 ? (kbps / 1000).toFixed(kbps >= 10_000 ? 0 : 1) : (kbps / 1000).toFixed(2);
}

function uptime(ms: number | null) {
  if (ms === null) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function quality(status: LinkStatus, pingMs: number | null) {
  if (status === 'offline') return 'no route';
  if (pingMs === null) return '—';
  if (pingMs < 60) return 'excellent';
  if (pingMs < 120) return 'good';
  if (pingMs < 250) return 'fair';
  return 'poor';
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [conn, setConn] = useState<ConnectionState>(client.connectionState);
  const [kind, setKind] = useState<string | null>(null);
  const [metered, setMetered] = useState<boolean | null>(null);

  // the probe writes here on every result; react only sees it on the paint tick
  const latest = useRef<NetState>({
    status: 'unknown',
    pingMs: null,
    downKbps: null,
    upKbps: null,
    kind: null,
    metered: null,
    publicIp: null,
    localIp: null,
    observedUpMs: null,
    history: [],
  });
  const [view, setView] = useState<NetState>(latest.current);

  useEffect(() => {
    const off = client.on(event => {
      if (event.type === 'open' || event.type === 'close' || event.type === 'connecting') {
        setConn(client.connectionState);
      }
    });
    return off;
  }, [client]);

  useEffect(() => {
    const apply = (info: { kind: string; metered: boolean } | null) => {
      setKind(info?.kind ?? null);
      setMetered(info?.metered ?? null);
    };
    const off = client.capabilities.onUpdate(msg => apply(msg.capabilities.network));
    client.capabilities.get().then(r => r.ok && apply(r.response.capabilities.network));
    return off;
  }, [client]);

  useEffect(() => {
    if (metered === null) return;
    const probe = createProbe(client, {
      pingEveryMs: PING_EVERY_MS,
      throughputEveryMs: metered ? 0 : THROUGHPUT_EVERY_MS,
      throughputBytes: THROUGHPUT_BYTES,
      historyMs: HISTORY_MS,
    });
    probe.start(partial => {
      latest.current = { ...latest.current, ...partial };
    });
    return () => probe.stop();
  }, [client, metered]);

  // one timer drives every readout, so a fast probe cannot force a fast repaint
  useEffect(() => {
    const id = setInterval(() => setView({ ...latest.current }), PAINT_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  const status: LinkStatus = conn === 'open' ? view.status : 'offline';
  const missing = unavailableFields(false);

  return (
    <div className="flex h-full w-full flex-col bg-screen px-7 py-5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Network status</span>
        <span className="flex items-center gap-2.5 font-mono text-row tracking-[0.16em]" style={{ color: STATUS_COLOR[status] }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric
          label="Download"
          value={mbps(view.downKbps)}
          unit="Mbps"
          note={metered ? 'paused on metered link' : 'measured through the proxy'}
        />
        <Metric label="Upload" value={null} unit="Mbps" note="needs extension" />
        <Metric label="Ping" value={view.pingMs === null ? null : String(view.pingMs)} unit="ms" />
      </div>

      <Graph history={view.history} />

      <div className="mt-3 grid grid-cols-4 gap-3">
        <Fact label="Connection" value={kind ? kind.toUpperCase() : '—'} sub={metered === null ? undefined : metered ? 'metered' : 'unmetered'} />
        <Fact label="Public IP" value={view.publicIp ?? '—'} />
        <Fact label="Local IP" value="—" sub="needs extension" />
        <Fact label="Uptime" value={uptime(view.observedUpMs)} sub="observed" />
      </div>

      <div className="mt-auto flex items-baseline justify-between pt-3 font-mono text-hint text-dim">
        <span>QUALITY {quality(status, view.pingMs).toUpperCase()}</span>
        <span>{missing.length > 0 ? `${missing.map(m => m.field).join(' + ')} need a desktop extension` : ''}</span>
      </div>
    </div>
  );
}

const Metric = memo(function Metric({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string | null;
  unit: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/4 px-4 py-3">
      <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={`font-display text-[2.75rem] leading-none font-semibold tabular-nums tracking-display ${
            value === null ? 'text-dim' : 'text-off-white'
          }`}>
          {value ?? '—'}
        </span>
        <span className="text-row text-soft">{unit}</span>
      </div>
      {note && <div className="mt-1 font-mono text-hint text-dim">{note}</div>}
    </div>
  );
});

const Fact = memo(function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/4 px-3 py-2">
      <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">{label}</div>
      <div className="truncate font-mono text-row text-near tabular-nums">{value}</div>
      {sub && <div className="truncate font-mono text-hint text-dim">{sub}</div>}
    </div>
  );
});

const GRAPH_W = 738;
const GRAPH_H = 96;

/** only redraws when the sample list identity changes, which is once per probe result */
const Graph = memo(function Graph({ history }: { history: Sample[] }) {
  const now = Date.now();
  const points = history.filter(s => now - s.at <= HISTORY_MS);
  const peak = Math.max(1, ...points.map(s => s.downKbps ?? 0), ...points.map(s => s.upKbps ?? 0));

  const line = (pick: (s: Sample) => number | null) => {
    const usable = points.filter(s => pick(s) !== null);
    if (usable.length < 2) return '';
    return usable
      .map((s, i) => {
        const x = GRAPH_W - ((now - s.at) / HISTORY_MS) * GRAPH_W;
        const y = GRAPH_H - ((pick(s) as number) / peak) * (GRAPH_H - 8) - 4;
        return `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const down = line(s => s.downKbps);
  const up = line(s => s.upKbps);

  return (
    <div className="mt-3 rounded-2xl bg-white/4 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Last 60s</span>
        <span className="flex items-center gap-4 font-mono text-hint">
          <span className="flex items-center gap-1.5 text-soft">
            <span className="h-0.5 w-4 rounded" style={{ backgroundColor: 'var(--color-accent)' }} />
            Down
          </span>
          <span className="flex items-center gap-1.5 text-dim">
            <span className="h-0.5 w-4 rounded" style={{ backgroundColor: 'var(--color-experimental)' }} />
            Up
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} className="mt-2 h-24 w-full" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1="0" x2={GRAPH_W} y1={GRAPH_H * f} y2={GRAPH_H * f} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {down && <path d={down} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {up && <path d={up} fill="none" stroke="var(--color-experimental)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {!down && !up && (
          <text x={GRAPH_W / 2} y={GRAPH_H / 2 + 4} textAnchor="middle" fill="rgba(239,239,239,0.3)" fontSize="13" fontFamily="ui-monospace, monospace">
            waiting for samples
          </text>
        )}
      </svg>
    </div>
  );
});
