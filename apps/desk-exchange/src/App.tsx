import { BridgethingClient } from '@bridgething/client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { daemonUrl } from './daemon';
import { clockAt, useZone, type Zone } from './device-time';
import {
  LISTINGS,
  SESSION_MS,
  SPANS,
  VOLATILITY,
  fmtDelta,
  fmtPct,
  fmtPrice,
  fmtVolume,
  headlineFor,
  indexAt,
  lastPrint,
  priceAt,
  recentHeadlines,
  seriesAt,
  virtualTime,
  volumeAt,
  type Headline,
  type SpanKey,
} from './market';
import { loadWatchlist, saveWatchlist } from './store';

/** gains green and losses red, or the other way round, which is how much of Asia reads a board */
const PALETTES = {
  'green-up': { up: '#3ddc84', down: '#ff6b6b' },
  'red-up': { up: '#ff6b6b', down: '#3ddc84' },
};

type PaletteKey = keyof typeof PALETTES;
type View = 'board' | 'chart';

const TICK_MS = 1000;
const SPARK_POINTS = 28;
const CHART_POINTS = 150;

function spanMs(key: SpanKey) {
  return (SPANS.find(s => s.key === key) ?? SPANS[0]).ms;
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const zone = useZone(client);

  const [pace, setPace] = useState(1);
  const [volatility, setVolatility] = useState('normal');
  const [palette, setPalette] = useState<PaletteKey>('green-up');
  const [tape, setTape] = useState(true);
  const [news, setNews] = useState(true);
  const [span, setSpan] = useState<SpanKey>('4h');
  const [watchOnly, setWatchOnly] = useState(false);

  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>('board');
  const [cursor, setCursor] = useState(0);
  const [held, setHeld] = useState<number | null>(null);
  const [panel, setPanel] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // config is read only on the device, so anything changed here is kept as a doc override
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const setOverride = useCallback(
    (key: string, value: string) => {
      setOverrides(o => ({ ...o, [key]: value }));
      client.doc.set({ key: `pref.${key}`, value }).catch(() => {});
    },
    [client],
  );

  useEffect(() => {
    loadWatchlist(client).then(setWatchlist);
  }, [client]);

  useEffect(() => {
    const apply = (entries: { key: string; value: string }[]) => {
      for (const e of entries) {
        if (e.key === 'pace') {
          const n = Number(e.value);
          if (Number.isFinite(n) && n > 0) setPace(Math.min(8, Math.max(0.25, n)));
        }
        if (e.key === 'volatility' && e.value in VOLATILITY) setVolatility(e.value);
        if (e.key === 'palette' && e.value in PALETTES) setPalette(e.value as PaletteKey);
        if (e.key === 'tape') setTape(e.value !== 'false');
        if (e.key === 'headlines') setNews(e.value !== 'false');
        if (e.key === 'span' && SPANS.some(s => s.key === e.value)) setSpan(e.value as SpanKey);
        if (e.key === 'watchlistOnly') setWatchOnly(e.value !== 'false');
      }
    };
    client.config.list().then(r => r.ok && apply(r.response.entries)).catch(() => {});
    const off = client.config.onChanged(msg => msg.value !== null && apply([{ key: msg.key, value: msg.value }]));
    return off;
  }, [client]);

  useEffect(() => {
    const request = client.doc.list().then(r => {
      if (!r.ok) return;
      setOverrides(
        Object.fromEntries(
          r.response.entries
            .filter(e => e.key.startsWith('pref.') && e.value !== null)
            .map(e => [e.key.slice(5), e.value as string]),
        ),
      );
    });
    request.catch(() => {});
  }, [client]);

  useEffect(() => {
    const o = overrides;
    if (o.pace) {
      const n = Number(o.pace);
      if (Number.isFinite(n) && n > 0) setPace(Math.min(8, Math.max(0.25, n)));
    }
    if (o.volatility && o.volatility in VOLATILITY) setVolatility(o.volatility);
    if (o.palette && o.palette in PALETTES) setPalette(o.palette as PaletteKey);
    if (o.tape !== undefined) setTape(o.tape !== 'false');
    if (o.headlines !== undefined) setNews(o.headlines !== 'false');
    if (o.span && SPANS.some(s => s.key === o.span)) setSpan(o.span as SpanKey);
    if (o.watchlistOnly !== undefined) setWatchOnly(o.watchlistOnly !== 'false');
  }, [overrides]);

  useEffect(() => {
    if (held !== null) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [held]);

  const clock = held ?? now;
  const vol = VOLATILITY[volatility] ?? 1;
  const t = virtualTime(clock, pace);
  const colours = PALETTES[palette];

  const board = useMemo(
    () => (watchOnly && watchlist.size > 0 ? LISTINGS.filter(l => watchlist.has(l.sym)) : LISTINGS),
    [watchOnly, watchlist],
  );

  // the board can shrink under a running cursor, so it wraps rather than pointing past the end
  const at = board.length > 0 ? ((cursor % board.length) + board.length) % board.length : 0;
  const selected = board[at] ?? LISTINGS[0]!;

  const move = useCallback((by: number) => setCursor(c => c + by), []);

  const toggleWatch = useCallback(() => {
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(selected.sym)) next.delete(selected.sym);
      else next.add(selected.sym);
      saveWatchlist(client, next);
      return next;
    });
  }, [client, selected.sym]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') setPanel(open => !open);
      else if (e.key === '1') setView('board');
      else if (e.key === '2') setView('chart');
      else if (e.key === '3') toggleWatch();
      else if (e.key === '4') setHeld(h => (h === null ? Date.now() : null));
      else if (e.key === 'm') setView(v => (v === 'board' ? 'chart' : 'board'));
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.deltaX) return;
      move(e.deltaX > 0 ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, [move, toggleWatch]);

  const index = indexAt(t, vol);
  const indexOpen = indexAt(t - SESSION_MS, vol);
  const indexPct = ((index - indexOpen) / indexOpen) * 100;

  const headlines = useMemo(() => (news ? recentHeadlines(t, 8) : []), [news, t]);

  return (
    <div className="flex h-full w-full flex-col bg-screen text-off-white">
      <Header
        index={index}
        pct={indexPct}
        colours={colours}
        clock={clock}
        zone={zone}
        held={held !== null}
        pace={pace}
        breadth={LISTINGS.filter(l => lastPrint(l.sym, t, vol) >= priceAt(l.sym, t - SESSION_MS, vol)).length}
      />

      {news && <NewsBar headlines={headlines} colours={colours} />}

      <div className="relative min-h-0 flex-1">
        {view === 'board' ? (
          <Board
            board={board}
            at={at}
            t={t}
            vol={vol}
            colours={colours}
            watchlist={watchlist}
            onPick={i => {
              setCursor(i);
              setView('chart');
            }}
          />
        ) : (
          <Chart
            listing={selected}
            t={t}
            vol={vol}
            span={span}
            colours={colours}
            watched={watchlist.has(selected.sym)}
            onSpan={next => setOverride('span', next)}
            onWatch={toggleWatch}
          />
        )}
      </div>

      {tape && <Tape t={t} vol={vol} colours={colours} />}

      {panel && (
        <Panel
          pace={pace}
          volatility={volatility}
          palette={palette}
          span={span}
          tape={tape}
          news={news}
          watchOnly={watchOnly}
          held={held !== null}
          watchCount={watchlist.size}
          onPace={next => setOverride('pace', String(next))}
          onVolatility={next => setOverride('volatility', next)}
          onPalette={next => setOverride('palette', next)}
          onSpan={next => setOverride('span', next)}
          onTape={next => setOverride('tape', String(next))}
          onNews={next => setOverride('headlines', String(next))}
          onWatchOnly={next => setOverride('watchlistOnly', String(next))}
          onHold={next => setHeld(next ? Date.now() : null)}
        />
      )}
    </div>
  );
}

type Colours = { up: string; down: string };

function Header({
  index,
  pct,
  colours,
  clock,
  zone,
  held,
  pace,
  breadth,
}: {
  index: number;
  pct: number;
  colours: Colours;
  clock: number;
  zone: Zone;
  held: boolean;
  pace: number;
  breadth: number;
}) {
  const up = pct >= 0;
  const colour = up ? colours.up : colours.down;
  const time = clockAt(clock, zone);
  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-rule px-5">
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${held ? '' : 'animate-pulse'}`}
          style={{ backgroundColor: held ? '#ffb066' : colour }}
        />
        <span className="font-display text-row font-semibold tracking-display">Desk Exchange</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">DXI</span>
        <span className="font-mono text-row-lg tabular-nums" style={{ color: colour }}>
          {fmtPrice(index)}
        </span>
        <span className="font-mono text-hint tabular-nums" style={{ color: colour }}>
          {fmtPct(pct)}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4 font-mono text-hint text-dim tabular-nums">
        <span className="flex items-center gap-2">
          <span style={{ color: colours.up }}>▲ {breadth}</span>
          <span style={{ color: colours.down }}>▼ {LISTINGS.length - breadth}</span>
        </span>
        {pace !== 1 && <span className="text-experimental">{pace}×</span>}
        {held && <span className="text-experimental tracking-[0.18em]">HELD</span>}
        <span className="text-soft">{time}</span>
      </div>
    </header>
  );
}

/** the newest print for each name, rolling past the way a broadcast ticker does */
const Tape = memo(function Tape({ t, vol, colours }: { t: number; vol: number; colours: Colours }) {
  const run = LISTINGS.map(l => {
    const price = lastPrint(l.sym, t, vol);
    const open = priceAt(l.sym, t - SESSION_MS, vol);
    const pct = ((price - open) / open) * 100;
    return { sym: l.sym, price, pct };
  });
  return (
    <div className="relative h-9 shrink-0 overflow-hidden border-t border-rule">
      <div className="tape-run absolute flex h-full w-max items-center">
        {[0, 1].map(copy => (
          <div key={copy} className="flex items-center">
            {run.map(r => (
              <span key={r.sym} className="flex items-baseline gap-1.5 px-4 font-mono text-hint tabular-nums">
                <span className="text-soft">{r.sym}</span>
                <span className="text-near">{fmtPrice(r.price)}</span>
                <span style={{ color: r.pct >= 0 ? colours.up : colours.down }}>{fmtPct(r.pct)}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

function NewsBar({ headlines, colours }: { headlines: Headline[]; colours: Colours }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN(i => i + 1), 7000);
    return () => clearInterval(id);
  }, []);
  if (headlines.length === 0) {
    return (
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-rule px-5 font-mono text-hint text-dim">
        The wire is quiet.
      </div>
    );
  }
  const item = headlines[n % headlines.length]!;
  return (
    <div className="flex h-8 shrink-0 items-center gap-2.5 overflow-hidden border-b border-rule px-5">
      <span
        className="shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-eyebrow tabular-nums"
        style={{ backgroundColor: `${item.up ? colours.up : colours.down}22`, color: item.up ? colours.up : colours.down }}>
        {item.sym}
      </span>
      <span key={item.id} className="rise truncate text-hint text-soft">
        {item.text}
      </span>
    </div>
  );
}

function Board({
  board,
  at,
  t,
  vol,
  colours,
  watchlist,
  onPick,
}: {
  board: typeof LISTINGS;
  at: number;
  t: number;
  vol: number;
  colours: Colours;
  watchlist: Set<string>;
  onPick: (i: number) => void;
}) {
  if (board.length === 0) {
    return (
      <div className="grid h-full place-items-center text-body text-dim">
        Nothing on the watchlist yet. Press 3 on a name to add it.
      </div>
    );
  }
  return (
    <div className="grid h-full grid-cols-2 content-start gap-x-3 px-3 py-1">
      {board.map((l, i) => (
        <Row
          key={l.sym}
          listing={l}
          t={t}
          vol={vol}
          colours={colours}
          selected={i === at}
          watched={watchlist.has(l.sym)}
          onPick={() => onPick(i)}
        />
      ))}
    </div>
  );
}

function Row({
  listing,
  t,
  vol,
  colours,
  selected,
  watched,
  onPick,
}: {
  listing: (typeof LISTINGS)[number];
  t: number;
  vol: number;
  colours: Colours;
  selected: boolean;
  watched: boolean;
  onPick: () => void;
}) {
  const price = lastPrint(listing.sym, t, vol);
  const open = priceAt(listing.sym, t - SESSION_MS, vol);
  const pct = ((price - open) / open) * 100;
  const up = pct >= 0;
  const colour = up ? colours.up : colours.down;
  const spark = seriesAt(listing.sym, t, SESSION_MS, SPARK_POINTS, vol);

  // the flash marks the direction of the last print, which is not the same as the session's direction
  const previous = useRef(price);
  const tick = price > previous.current ? 1 : price < previous.current ? -1 : 0;
  useEffect(() => {
    previous.current = price;
  });

  return (
    <button
      onClick={onPick}
      className={`flex h-[59px] items-center gap-2 rounded-lg px-2 text-left transition ${
        selected ? 'bg-white/8' : 'active:bg-white/5'
      }`}>
      <span
        className="h-8 w-0.5 shrink-0 rounded-full transition-opacity"
        style={{ backgroundColor: colour, opacity: selected ? 1 : 0.25 }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-row font-semibold tracking-tight-1">{listing.sym}</span>
          {watched && <span className="h-1 w-1 rounded-full bg-off-white/70" />}
        </span>
        <span className="block truncate text-[10px] leading-tight text-dim">{listing.name}</span>
      </span>
      <Spark values={spark} colour={colour} className="h-6 w-[68px] shrink-0" />
      <span
        key={price}
        className={`w-[76px] shrink-0 rounded-sm text-right font-mono text-row tabular-nums ${tick !== 0 ? 'flash' : ''}`}
        style={{ '--flash': tick > 0 ? colours.up : colours.down } as React.CSSProperties}>
        {fmtPrice(price)}
      </span>
      <span className="w-[58px] shrink-0 text-right font-mono text-hint tabular-nums" style={{ color: colour }}>
        {fmtPct(pct)}
      </span>
    </button>
  );
}

function Spark({ values, colour, className }: { values: number[]; colour: string; className?: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / range) * 26 - 1}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={className}>
      <polyline
        points={points}
        fill="none"
        stroke={colour}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Chart({
  listing,
  t,
  vol,
  span,
  colours,
  watched,
  onSpan,
  onWatch,
}: {
  listing: (typeof LISTINGS)[number];
  t: number;
  vol: number;
  span: SpanKey;
  colours: Colours;
  watched: boolean;
  onSpan: (next: SpanKey) => void;
  onWatch: () => void;
}) {
  const ms = spanMs(span);
  const values = seriesAt(listing.sym, t, ms, CHART_POINTS, vol);
  const price = lastPrint(listing.sym, t, vol);
  values[values.length - 1] = price;
  const first = values[0]!;
  const open = priceAt(listing.sym, t - SESSION_MS, vol);
  const pct = ((price - open) / open) * 100;
  const up = pct >= 0;
  const colour = up ? colours.up : colours.down;

  const session = seriesAt(listing.sym, t, SESSION_MS, 80, vol);
  const high = Math.max(...session);
  const low = Math.min(...session);
  const headline = headlineFor(listing.sym, t);

  const min = Math.min(...values, first);
  const max = Math.max(...values, first);
  const pad = (max - min || max * 0.01) * 0.12;
  const lo = min - pad;
  const hi = max + pad;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `0,100 ${line} 100,100`;
  const gradientId = `fill-${listing.sym}`;

  return (
    <div className="flex h-full gap-4 px-5 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-title font-semibold tracking-tight-1">{listing.sym}</span>
          <span className="min-w-0 flex-1 truncate text-hint text-dim">
            {listing.name} · {listing.sector}
          </span>
        </div>

        <div className="mt-0.5 flex items-baseline gap-3">
          <span className="font-mono text-screen-title tabular-nums" style={{ color: colour }}>
            {fmtPrice(price)}
          </span>
          <span className="font-mono text-row tabular-nums" style={{ color: colour }}>
            {fmtDelta(price - open)} {fmtPct(pct)}
          </span>
        </div>

        <div className="relative mt-2 min-h-0 flex-1">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colour} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colour} stopOpacity={0} />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map(g => (
              <line key={g} x1="0" y1={g * 100} x2="100" y2={g * 100} stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.5} />
            ))}
            <line
              x1="0"
              y1={y(first)}
              x2="100"
              y2={y(first)}
              stroke="#ffffff"
              strokeOpacity={0.22}
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
            <polygon points={area} fill={`url(#${gradientId})`} />
            <polyline
              points={line}
              fill="none"
              stroke={colour}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* the last print sits outside the stretched viewBox so its halo stays a circle */}
          <span
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: colour, left: '100%', top: `${y(price)}%` }}>
            <span
              className="absolute inset-0 animate-ping rounded-full"
              style={{ backgroundColor: colour, opacity: 0.5 }}
            />
          </span>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {SPANS.map(s => (
            <button
              key={s.key}
              aria-pressed={s.key === span}
              onClick={() => onSpan(s.key)}
              className={`rounded-full px-3 py-1 font-mono text-hint transition active:scale-95 ${
                s.key === span ? 'bg-off-white text-screen' : 'bg-white/8 text-dim'
              }`}>
              {s.label}
            </button>
          ))}
          <span className="ml-auto font-mono text-eyebrow tracking-[0.18em] text-dim uppercase">
            Wheel changes name
          </span>
        </div>
      </div>

      <div className="flex w-[210px] shrink-0 flex-col gap-1.5">
        <Stat label="Session open" value={fmtPrice(open)} />
        <Stat label="Session high" value={fmtPrice(high)} colour={colours.up} />
        <Stat label="Session low" value={fmtPrice(low)} colour={colours.down} />
        <Stat label="Volume" value={fmtVolume(volumeAt(listing.sym, t))} />
        <Stat label="Market cap" value={`${fmtVolume(price * listing.shares)}`} />

        <button
          onClick={onWatch}
          className="mt-auto rounded-xl bg-white/4 px-3 py-2 text-left transition active:scale-[0.98]">
          <div className="font-mono text-eyebrow tracking-[0.2em] text-dim uppercase">Watchlist</div>
          <div className={`text-body ${watched ? 'text-off-white' : 'text-dim'}`}>{watched ? 'On it' : 'Not watched'}</div>
        </button>

        {headline && (
          <div className="rounded-xl bg-white/4 px-3 py-2">
            <div className="font-mono text-eyebrow tracking-[0.2em] uppercase" style={{ color: headline.up ? colours.up : colours.down }}>
              Latest
            </div>
            <div className="mt-0.5 text-hint leading-snug text-soft">{headline.text}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div className="flex items-baseline justify-between rounded-lg bg-white/4 px-3 py-1.5">
      <span className="font-mono text-eyebrow tracking-[0.18em] text-dim uppercase">{label}</span>
      <span className="font-mono text-body tabular-nums" style={colour ? { color: colour } : undefined}>
        {value}
      </span>
    </div>
  );
}

const PACES = [0.5, 1, 2, 4];

const VOLATILITY_LABEL: Record<string, string> = { calm: 'Calm', normal: 'Normal', wild: 'Wild' };

function Panel({
  pace,
  volatility,
  palette,
  span,
  tape,
  news,
  watchOnly,
  held,
  watchCount,
  onPace,
  onVolatility,
  onPalette,
  onSpan,
  onTape,
  onNews,
  onWatchOnly,
  onHold,
}: {
  pace: number;
  volatility: string;
  palette: PaletteKey;
  span: SpanKey;
  tape: boolean;
  news: boolean;
  watchOnly: boolean;
  held: boolean;
  watchCount: number;
  onPace: (next: number) => void;
  onVolatility: (next: string) => void;
  onPalette: (next: PaletteKey) => void;
  onSpan: (next: SpanKey) => void;
  onTape: (next: boolean) => void;
  onNews: (next: boolean) => void;
  onWatchOnly: (next: boolean) => void;
  onHold: (next: boolean) => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-screen/97 px-8 py-4 backdrop-blur-sm">
      <div className="font-mono text-hint tracking-[0.22em] text-dim uppercase">Settings</div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Group label="Pace">
          {PACES.map(p => (
            <Chip key={p} on={p === pace} onClick={() => onPace(p)}>
              {p}×
            </Chip>
          ))}
        </Group>

        <Group label="Volatility">
          {Object.keys(VOLATILITY).map(v => (
            <Chip key={v} on={v === volatility} onClick={() => onVolatility(v)}>
              {VOLATILITY_LABEL[v] ?? v}
            </Chip>
          ))}
        </Group>

        <Group label="Colours">
          <Chip on={palette === 'green-up'} onClick={() => onPalette('green-up')}>
            Green up
          </Chip>
          <Chip on={palette === 'red-up'} onClick={() => onPalette('red-up')}>
            Red up
          </Chip>
        </Group>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Group label="Chart span">
          {SPANS.map(sp => (
            <Chip key={sp.key} on={sp.key === span} onClick={() => onSpan(sp.key)}>
              {sp.label}
            </Chip>
          ))}
        </Group>

        <Group label="Board">
          <Chip on={!watchOnly} onClick={() => onWatchOnly(false)}>
            Every name
          </Chip>
          <Chip on={watchOnly} onClick={() => onWatchOnly(true)}>
            Watchlist · {watchCount}
          </Chip>
        </Group>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Toggle label="Ticker tape" on={tape} onClick={() => onTape(!tape)} />
        <Toggle label="Headline wire" on={news} onClick={() => onNews(!news)} />
        <Toggle label="Market" on={held} onText="Held" offText="Live" warn onClick={() => onHold(!held)} />
      </div>

      <div className="mt-auto grid grid-cols-2 gap-x-8 font-mono text-hint text-dim">
        <span>1 · board</span>
        <span>2 · chart of the selected name</span>
        <span>3 · add or drop from the watchlist</span>
        <span>4 · hold the market where it is</span>
        <span>M · swap between board and chart</span>
        <span>Esc · close this</span>
      </div>

      <p className="mt-2 font-mono text-hint text-dim">
        Every price here is invented. Nothing on this screen is a real quote.
      </p>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/4 px-4 py-3">
      <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">{label}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-hint font-medium transition active:scale-95 ${
        on ? 'bg-off-white text-screen' : 'bg-white/8 text-dim'
      }`}>
      {children}
    </button>
  );
}

function Toggle({
  label,
  on,
  onText = 'Shown',
  offText = 'Hidden',
  warn,
  onClick,
}: {
  label: string;
  on: boolean;
  onText?: string;
  offText?: string;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="rounded-2xl bg-white/4 px-4 py-3 text-left transition active:scale-[0.98]">
      <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">{label}</div>
      <div className={`mt-1 text-title ${on ? (warn ? 'text-experimental' : 'text-off-white') : 'text-dim'}`}>
        {on ? onText : offText}
      </div>
    </button>
  );
}
