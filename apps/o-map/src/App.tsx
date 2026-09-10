import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { usePrefs, type Prefs } from './config';
import { daemonUrl } from './daemon';
import {
  BASE,
  BY_KEY,
  MAX_ZOOM,
  MIN_ZOOM,
  PLACES,
  TILE,
  Tiles,
  latToY,
  lonToX,
  trafficUrl,
  xToLon,
  yToLat,
  type Place,
} from './map';

const W = 800;
const H = 480;
// one rotary detent lands around deltaX 1, and a zoom step per detent is too fast to aim
const WHEEL_PER_STEP = 2;

// the flow colours tomtom paints, which is what the legend along the bottom is naming
const FLOW = [
  { label: 'free', colour: '#3ddc84' },
  { label: 'slow', colour: '#ffcf5f' },
  { label: 'queuing', colour: '#ff8a3d' },
  { label: 'stopped', colour: '#ef4444' },
];

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const { prefs, setPref } = usePrefs(client);
  const tiles = useMemo(() => new Tiles(client), [client]);

  const [view, setView] = useState<{ lat: number; lon: number; zoom: number }>(() => {
    const start = BY_KEY['phnom-penh']!;
    return { lat: start.lat, lon: start.lon, zoom: start.zoom };
  });
  const [panel, setPanel] = useState(false);
  const [ready, setReady] = useState(0);
  const [missing, setMissing] = useState(false);
  const started = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // the app opens where the settings say, once, rather than snapping back on every change
  useEffect(() => {
    if (started.current) return;
    const place = BY_KEY[prefs.place];
    if (!place) return;
    started.current = true;
    setView({ lat: place.lat, lon: place.lon, zoom: place.zoom });
  }, [prefs.place]);

  const goTo = useCallback((place: Place) => setView({ lat: place.lat, lon: place.lon, zoom: place.zoom }), []);
  const zoomBy = useCallback((by: number) => {
    setView(v => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom + by)) }));
  }, []);

  // which tiles the screen is actually looking at, in world pixels at this zoom
  const grid = useMemo(() => {
    const zoom = Math.round(view.zoom);
    const span = Math.pow(2, zoom);
    const left = lonToX(view.lon, zoom) * TILE - W / 2;
    const top = latToY(view.lat, zoom) * TILE - H / 2;
    const cells: { key: string; x: number; y: number; left: number; top: number }[] = [];
    for (let x = Math.floor(left / TILE); x <= Math.floor((left + W) / TILE); x++) {
      for (let y = Math.floor(top / TILE); y <= Math.floor((top + H) / TILE); y++) {
        if (y < 0 || y >= span) continue;
        const wrapped = ((x % span) + span) % span;
        cells.push({ key: `${zoom}/${wrapped}/${y}`, x: wrapped, y, left: x * TILE - left, top: y * TILE - top });
      }
    }
    return { zoom, cells };
  }, [view]);

  const source = BASE[prefs.base] ?? BASE.streets!;
  const flowUrl = prefs.traffic && prefs.trafficKey ? trafficUrl(prefs.trafficKey) : null;

  // every visible tile is asked for once; the counter is what tells react a picture arrived
  useEffect(() => {
    let stale = false;
    for (const cell of grid.cells) {
      const urls = [source.url(grid.zoom, cell.x, cell.y)];
      if (flowUrl) urls.push(flowUrl(grid.zoom, cell.x, cell.y));
      for (const url of urls) {
        if (tiles.get(url)) continue;
        tiles.load(url).then(got => {
          if (stale) return;
          if (got) setReady(n => n + 1);
          else setMissing(true);
        });
      }
    }
    return () => {
      stale = true;
    };
  }, [grid, source, flowUrl, tiles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') return setPanel(open => !open);
      if (e.key >= '1' && e.key <= '4') return goTo(PLACES[Number(e.key) - 1]!);
      if (e.key === 'm' || e.key === 'M' || e.key === '5') return goTo(PLACES[4]!);
      if (e.key === '+' || e.key === '=') return zoomBy(1);
      if (e.key === '-') return zoomBy(-1);
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      const steps = Math.trunc(e.deltaX / WHEEL_PER_STEP);
      if (steps) zoomBy(Math.sign(steps));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, [goTo, zoomBy]);

  // dragging moves the map under the finger: pixels become degrees at this zoom and no other
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from) return;
    const zoom = Math.round(view.zoom);
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (!dx && !dy) return;
    drag.current = { x: e.clientX, y: e.clientY };
    setView(v => {
      const px = lonToX(v.lon, zoom) * TILE - dx;
      const py = latToY(v.lat, zoom) * TILE - dy;
      return { ...v, lon: xToLon(px / TILE, zoom), lat: yToLat(py / TILE, zoom) };
    });
  };
  const onUp = () => {
    drag.current = null;
  };

  const here = PLACES.find(p => Math.abs(p.lat - view.lat) < 0.06 && Math.abs(p.lon - view.lon) < 0.06);
  const live = Boolean(flowUrl);

  return (
    <div className="relative h-full w-full overflow-hidden bg-screen text-off-white select-none">
      <div
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}>
        {grid.cells.map(cell => {
          const base = tiles.get(source.url(grid.zoom, cell.x, cell.y));
          const flow = flowUrl ? tiles.get(flowUrl(grid.zoom, cell.x, cell.y)) : null;
          return (
            <div key={cell.key} className="absolute" style={{ left: cell.left, top: cell.top, width: TILE, height: TILE }}>
              {base && <img src={base} alt="" width={TILE} height={TILE} className="block" draggable={false} />}
              {flow && (
                <img src={flow} alt="" width={TILE} height={TILE} className="absolute inset-0 block" draggable={false} />
              )}
            </div>
          );
        })}
        {/* a data counter the render depends on, so a tile arriving repaints the grid */}
        <span className="hidden">{ready}</span>
      </div>

      {/* the card the reference carries at the top: where you are and what is drawn over it */}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex items-center gap-3 rounded-2xl bg-black/70 px-4 py-3 ring-1 ring-white/12 backdrop-blur-md">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10">
          <Pin className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-row-lg font-semibold">{here?.label ?? 'Cambodia'}</div>
          <div className="truncate font-mono text-hint text-dim tabular-nums">
            {view.lat.toFixed(4)}, {view.lon.toFixed(4)} · z{grid.zoom}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 font-mono text-eyebrow tracking-[0.18em] uppercase"
          style={{
            backgroundColor: live ? 'rgba(61,220,132,0.16)' : 'rgba(255,255,255,0.08)',
            color: live ? '#3ddc84' : '#a7adb5',
          }}>
          {live ? 'traffic live' : 'no traffic key'}
        </span>
      </div>

      {/* the chips down the left, which on this map are the cities worth jumping to */}
      <div className="absolute top-24 left-4 flex flex-col gap-2">
        {PLACES.slice(0, 4).map((place, i) => (
          <button
            key={place.key}
            onClick={() => goTo(place)}
            className="flex items-center gap-2 rounded-full bg-black/70 py-2 pr-4 pl-2 text-left ring-1 ring-white/12 backdrop-blur-md transition active:scale-95">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/12 font-mono text-eyebrow">
              {i + 1}
            </span>
            <span className="text-hint whitespace-nowrap">{place.label}</span>
          </button>
        ))}
      </div>

      <div className="absolute right-4 bottom-24 flex flex-col gap-2">
        <button
          aria-label="zoom in"
          onClick={() => zoomBy(1)}
          className="grid h-12 w-12 place-items-center rounded-full bg-black/70 text-row-lg ring-1 ring-white/12 backdrop-blur-md transition active:scale-95">
          +
        </button>
        <button
          aria-label="zoom out"
          onClick={() => zoomBy(-1)}
          className="grid h-12 w-12 place-items-center rounded-full bg-black/70 text-row-lg ring-1 ring-white/12 backdrop-blur-md transition active:scale-95">
          −
        </button>
        <button
          aria-label="recentre"
          onClick={() => goTo(BY_KEY[prefs.place] ?? PLACES[0]!)}
          className="grid h-12 w-12 place-items-center rounded-full bg-white text-screen shadow-lg transition active:scale-95">
          <Target className="h-6 w-6" />
        </button>
      </div>

      {/* the bar the reference runs along the bottom, carrying the legend rather than a route */}
      <div className="absolute inset-x-4 bottom-4 flex items-center gap-4 rounded-full bg-gradient-to-r from-[#4f2bd6] to-[#7b52ff] px-5 py-3 shadow-lg">
        <span className="shrink-0 font-mono text-eyebrow tracking-[0.2em] uppercase opacity-80">traffic</span>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {FLOW.map(f => (
            <span key={f.label} className="flex items-center gap-1.5 text-hint">
              <span className="h-2.5 w-6 rounded-full" style={{ backgroundColor: f.colour }} />
              {f.label}
            </span>
          ))}
        </div>
        <span className="shrink-0 font-mono text-hint tabular-nums opacity-80">
          {live ? 'tomtom flow' : 'osm only'}
        </span>
      </div>

      {panel && (
        <Settings
          prefs={prefs}
          setPref={setPref}
          missing={missing}
          onClose={() => setPanel(false)}
        />
      )}
    </div>
  );
}

function Settings({
  prefs,
  setPref,
  missing,
  onClose,
}: {
  prefs: Prefs;
  setPref: (key: keyof Prefs, value: string) => void;
  missing: boolean;
  onClose: () => void;
}) {
  const chip = (on: boolean, label: string, onClick: () => void, key: string) => (
    <button
      key={key}
      onClick={onClick}
      className="rounded-full px-4 py-2 text-hint font-medium transition"
      style={{ backgroundColor: on ? '#efefef' : 'rgba(255,255,255,0.08)', color: on ? '#0a0c0e' : '#a7adb5' }}>
      {label}
    </button>
  );

  return (
    <div className="absolute inset-0 z-10 flex flex-col gap-4 bg-screen/97 px-8 py-6 backdrop-blur-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">O-Map</span>
        <button onClick={onClose} className="text-hint text-dim">
          the button under the wheel closes this
        </button>
      </div>

      <div className="rounded-2xl bg-white/4 px-4 py-3">
        <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Opens at</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLACES.map(p => chip(p.key === prefs.place, p.label, () => setPref('place', p.key), p.key))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white/4 px-4 py-3">
          <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Map style</div>
          <div className="mt-2 flex gap-2">
            {chip(prefs.base === 'streets', 'Streets', () => setPref('base', 'streets'), 'streets')}
            {chip(prefs.base === 'plain', 'Plain', () => setPref('base', 'plain'), 'plain')}
          </div>
        </div>
        <div className="rounded-2xl bg-white/4 px-4 py-3">
          <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Traffic</div>
          <div className="mt-2 flex gap-2">
            {chip(prefs.traffic, 'On', () => setPref('traffic', 'true'), 'on')}
            {chip(!prefs.traffic, 'Off', () => setPref('traffic', 'false'), 'off')}
          </div>
        </div>
      </div>

      <p className="text-hint text-dim">
        {prefs.trafficKey
          ? 'Traffic comes from TomTom, drawn over the map a tile at a time.'
          : 'Traffic needs a TomTom key, which their free tier gives away. Put it in the companion app under O-Map; the device has nowhere to type it.'}
      </p>
      <p className="mt-auto text-hint text-dim">
        Map tiles © OpenStreetMap contributors. Everything is fetched through the phone.
        {missing ? ' Some tiles did not arrive; the phone may be offline.' : ''}
      </p>
    </div>
  );
}

function Pin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

function Target({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}
