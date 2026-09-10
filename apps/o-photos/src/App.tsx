import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as cache from './cache';
import { usePrefs, CACHE_MB, INTERVALS, TRANSITIONS, type Prefs } from './config';
import { daemonUrl } from './daemon';
import * as api from './immich';
import { normalise, type Conn } from './immich';
import { forget, held, trim, want } from './pictures';
import { FAILURE_TEXT, type Album, type Asset, type Failure } from './types';

type View = 'photos' | 'favourites' | 'albums' | 'album' | 'search' | 'settings';
const PAGE = 40;

// the screen never resizes, so a quarter turn is laid out at the swapped size and rotated into place
function Stage({ rotate, children }: { rotate: number; children: React.ReactNode }) {
  const quarter = rotate === 90 || rotate === 270;
  return (
    <div className="absolute inset-0 overflow-hidden bg-screen">
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: quarter ? '100vh' : '100vw',
          height: quarter ? '100vw' : '100vh',
          transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
        }}>
        {children}
      </div>
    </div>
  );
}

/** a picture with no size in its exif is neither, so it stays out of the strict two */
function fits(asset: Asset, shape: Prefs['shape']) {
  if (shape === 'all') return true;
  if (!asset.width || !asset.height) return false;
  return shape === 'landscape' ? asset.width >= asset.height : asset.height > asset.width;
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const { prefs, setPref } = usePrefs(client);
  const conn: Conn = useMemo(() => ({ url: normalise(prefs.server), key: prefs.key }), [prefs.server, prefs.key]);
  const ready = Boolean(conn.url && conn.key);

  const [view, setView] = useState<View>('photos');
  const [server, setServer] = useState<{ version: string } | null>(null);
  const [trouble, setTrouble] = useState<Failure | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [album, setAlbum] = useState<Album | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [show, setShow] = useState(false);
  const [info, setInfo] = useState(false);
  const [tick, bump] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [usage, setUsage] = useState<{ bytes: number; count: number }>({ bytes: 0, count: 0 });
  const list = useRef<HTMLDivElement>(null);
  const order = useRef<number[]>([]);

  const repaint = useCallback(() => bump(n => n + 1), []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  // the connection is checked once, and again whenever the server or the key changes
  useEffect(() => {
    if (!ready) return;
    let stale = false;
    api.ping(client, conn).then(r => {
      if (stale) return;
      if (r.ok) {
        setServer(r.value);
        setTrouble(null);
      } else {
        setServer(null);
        setTrouble(r.error);
      }
    });
    return () => {
      stale = true;
    };
  }, [client, conn, ready]);

  const load = useCallback(
    async (which: View, at: number, q: string, id: string | null) => {
      if (!ready) return;
      setBusy(true);
      const reply =
        which === 'favourites'
          ? await api.favourites(client, conn, at, PAGE)
          : which === 'album' && id
            ? await api.inAlbum(client, conn, id, at, PAGE)
            : which === 'search'
              ? await api.search(client, conn, q, at, PAGE)
              : await api.recent(client, conn, at, PAGE);
      setBusy(false);
      if (!reply.ok) return setTrouble(reply.error);
      setTrouble(null);
      setAssets(prev => (at === 1 ? reply.value.items : [...prev, ...reply.value.items]));
      setMore(reply.value.next !== null && reply.value.items.length > 0);
      setPage(at);
    },
    [client, conn, ready],
  );

  // a view change starts its own list again rather than showing the last one's pictures
  useEffect(() => {
    if (!ready || view === 'settings' || view === 'albums') return;
    if (view === 'search' && !query.trim()) {
      setAssets([]);
      return;
    }
    const id = setTimeout(() => {
      setAssets([]);
      setOpen(null);
      load(view, 1, query, album?.id ?? null);
    }, view === 'search' ? 380 : 0);
    return () => clearTimeout(id);
  }, [view, query, album, ready, load]);

  useEffect(() => {
    if (!ready || view !== 'albums') return;
    api.albums(client, conn).then(r => (r.ok ? setAlbums(r.value) : setTrouble(r.error)));
  }, [client, conn, ready, view]);

  useEffect(() => {
    cache.usage().then(setUsage);
  }, [tick, view]);

  useEffect(() => {
    cache.sweep(prefs.cacheMb * 1024 * 1024);
  }, [prefs.cacheMb, assets.length]);

  // pictures land in the cache and stay there; the urls made from them do not need to
  useEffect(() => {
    trim(220);
  }, [assets.length, open]);

  useEffect(() => () => forget(), []);

  const turn = Number(prefs.rotate);
  const quarter = turn === 90 || turn === 270;
  // the shape filter runs here rather than at the server, which has no such search
  const shown = useMemo(() => assets.filter(a => fits(a, prefs.shape)), [assets, prefs.shape]);
  const current = open !== null ? shown[open] ?? null : null;

  const step = useCallback(
    (by: number) => {
      setOpen(at => {
        if (at === null || shown.length === 0) return at;
        if (prefs.shuffle && show) {
          const seq = order.current;
          const here = seq.indexOf(at);
          const next = seq[(here + by + seq.length) % seq.length];
          return next ?? at;
        }
        const next = at + by;
        if (next < 0) return prefs.loop ? shown.length - 1 : 0;
        if (next >= shown.length) {
          if (!prefs.loop && show) setShow(false);
          return prefs.loop ? 0 : shown.length - 1;
        }
        return next;
      });
    },
    [shown.length, prefs.shuffle, prefs.loop, show],
  );

  // the slideshow keeps one picture ahead of itself and nothing more
  useEffect(() => {
    if (open === null || !ready) return;
    want(client, conn, shown[open]!.id, 'preview', repaint, true);
    const nextAt = (open + 1) % Math.max(1, shown.length);
    const next = shown[nextAt];
    if (next) want(client, conn, next.id, 'preview', repaint);
  }, [open, shown, client, conn, ready, repaint]);

  useEffect(() => {
    if (!show || open === null) return;
    const id = setTimeout(() => step(1), prefs.interval * 1000);
    return () => clearTimeout(id);
  }, [show, open, prefs.interval, step, tick]);

  useEffect(() => {
    if (!show) return;
    order.current = shuffled(shown.length);
  }, [show, shown.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const typing = e.target instanceof HTMLInputElement;
      if (typing && e.key !== 'Escape') return;
      switch (e.key) {
        case 'Escape':
          if (show) return setShow(false);
          if (open !== null) return setOpen(null);
          return setView(v => (v === 'settings' ? 'photos' : 'settings'));
        case '1':
          return setView('photos');
        case '2':
          return setView('favourites');
        case '3':
          return setView('albums');
        case '4':
          return setPref('rotate', String((Number(prefs.rotate) + 90) % 360));
        case 'm':
        case 'M':
        case '5':
          if (open === null && shown.length) setOpen(0);
          return setShow(s => !s);
        case ' ':
          if (open !== null) setShow(s => !s);
          return;
        case 'ArrowLeft':
          return step(-1);
        case 'ArrowRight':
          return step(1);
        case 'i':
        case 'I':
          return setInfo(v => !v);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      if (open !== null) return step(Math.sign(e.deltaX));
      if (list.current) list.current.scrollTop += e.deltaX * 24;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, [open, show, shown.length, step, prefs.rotate, setPref]);

  const onScroll = () => {
    const box = list.current;
    if (!box || busy || !more) return;
    if (box.scrollTop + box.clientHeight > box.scrollHeight - 240) load(view, page + 1, query, album?.id ?? null);
  };

  if (!ready)
    return (
      <FirstRun
        onSettings={() => setView('settings')}
        onDemo={() => {
          setPref('server', 'demo');
          setPref('key', 'demo');
        }}
        open={view === 'settings'}
        prefs={prefs}
        setPref={setPref}
        usage={usage}
        onSweep={repaint}
      />
    );

  if (open !== null && current) {
    return (
      <Stage rotate={turn}>
      <Viewer
        asset={current}
        url={held(current.id, 'preview') ?? held(current.id, 'thumbnail')}
        at={open + 1}
        of={shown.length}
        show={show}
        info={info}
        ambient={prefs.ambient}
        motion={prefs.motion}
        transition={prefs.transition}
        clock={prefs.clock ? clockText(now, prefs.hour24) : null}
        date={prefs.date ? dateText(now) : null}
        onClose={() => {
          setShow(false);
          setOpen(null);
        }}
        onStep={step}
        onShow={() => setShow(s => !s)}
        onInfo={() => setInfo(v => !v)}
        onFavourite={async () => {
          const next = !current.favourite;
          const r = await api.setFavourite(client, conn, current.id, next);
          if (!r.ok) return setTrouble(r.error);
          setAssets(list => list.map(a => (a.id === current.id ? { ...a, favourite: next } : a)));
        }}
      />
      </Stage>
    );
  }

  return (
    <Stage rotate={turn}>
    <div className={`flex h-full w-full bg-screen text-off-white ${quarter ? 'flex-col' : ''}`}>
      <nav
        className={`flex shrink-0 gap-1 border-rule ${
          quarter ? 'w-full flex-row items-center overflow-x-auto border-b px-2 py-2' : 'w-[104px] flex-col border-r px-2 py-3'
        }`}>
        {!quarter && (
          <span className="px-2 pb-2 font-mono text-eyebrow tracking-[0.18em] text-dim uppercase">O-Photos</span>
        )}
        {(
          [
            ['photos', 'Photos', '1'],
            ['favourites', 'Loved', '2'],
            ['albums', 'Albums', '3'],
            ['search', 'Search', ''],
            ['settings', 'Settings', ''],
          ] as const
        ).map(([key, label, hint]) => (
          <button
            key={key}
            onClick={() => {
              setAlbum(null);
              setView(key);
            }}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-hint whitespace-nowrap transition ${
              quarter ? '' : 'justify-between'
            }`}
            style={{
              backgroundColor: view === key || (key === 'albums' && view === 'album') ? 'rgba(255,255,255,0.10)' : 'transparent',
              color: view === key || (key === 'albums' && view === 'album') ? '#efefef' : '#a7adb5',
            }}>
            {label}
            <span className="font-mono text-eyebrow opacity-40">{hint}</span>
          </button>
        ))}
        <button
          onClick={() => {
            if (shown.length) {
              setOpen(0);
              setShow(true);
            }
          }}
          className={`rounded-xl bg-white/10 px-3 py-2 text-left text-hint whitespace-nowrap text-off-white transition ${
            quarter ? '' : 'mt-auto'
          }`}>
          Slideshow
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-rule px-4">
          {view === 'search' ? (
            <input
              value={query}
              onChange={e => setQuery((e.target as HTMLInputElement).value)}
              placeholder="Search your photos"
              className="min-w-0 flex-1 rounded-full bg-white/6 px-4 py-1.5 text-row text-off-white outline-none placeholder:text-dim"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-row-lg font-semibold">
              {view === 'album' ? (album?.name ?? 'Album') : view === 'favourites' ? 'Loved' : view === 'albums' ? 'Albums' : view === 'settings' ? 'Settings' : 'Recent'}
            </span>
          )}
          <Status trouble={trouble} server={server} busy={busy} />
          {prefs.clock && <span className="font-mono text-hint tabular-nums text-dim">{clockText(now, prefs.hour24)}</span>}
        </header>

        {view === 'settings' ? (
          <SettingsView prefs={prefs} setPref={setPref} usage={usage} server={server} trouble={trouble} onSweep={repaint} />
        ) : view === 'albums' ? (
          <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:none]">
            {albums.length === 0 ? (
              <Nothing text={trouble ? FAILURE_TEXT[trouble.kind] : 'No albums here yet'} />
            ) : (
              <div className={`grid gap-3 ${quarter ? 'grid-cols-2' : 'grid-cols-4'}`}>
                {albums.map(a => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAlbum(a);
                      setView('album');
                    }}
                    className="overflow-hidden rounded-xl bg-white/5 text-left ring-1 ring-white/8 transition active:scale-[0.98]">
                    <Thumb client={client} conn={conn} id={a.coverId} onReady={repaint} tall />
                    <div className="px-2.5 py-2">
                      <div className="truncate text-hint text-off-white">{a.name}</div>
                      <div className="font-mono text-eyebrow text-dim tabular-nums">{a.count} photos</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div ref={list} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:none]">
            {shown.length === 0 ? (
              <Nothing
                text={
                  trouble
                    ? FAILURE_TEXT[trouble.kind]
                    : busy
                      ? 'Asking the phone…'
                      : view === 'search'
                        ? 'Type to search your library'
                        : 'Nothing here yet'
                }
              />
            ) : (
              <div className={`grid gap-2 ${quarter ? 'grid-cols-3' : 'grid-cols-5'}`}>
                {shown.map((asset, i) => (
                  <button
                    key={asset.id}
                    onClick={() => setOpen(i)}
                    className="relative aspect-square overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/8 transition active:scale-[0.97]">
                    <Thumb client={client} conn={conn} id={asset.id} onReady={repaint} />
                    {asset.type === 'VIDEO' && (
                      <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[0.5rem] tracking-wide text-off-white">
                        {asset.durationMs ? span(asset.durationMs) : 'video'}
                      </span>
                    )}
                    {asset.favourite && <span className="absolute top-1 left-1 text-[0.7rem]">♥</span>}
                  </button>
                ))}
              </div>
            )}
            {busy && shown.length > 0 && <div className="py-3 text-center text-hint text-dim">loading…</div>}
          </div>
        )}
      </div>
    </div>
    </Stage>
  );
}

function Thumb({
  client,
  conn,
  id,
  onReady,
  tall,
}: {
  client: BridgethingClient;
  conn: Conn;
  id: string | null;
  onReady: () => void;
  tall?: boolean;
}) {
  useEffect(() => {
    if (id) want(client, conn, id, 'thumbnail', onReady);
  }, [client, conn, id, onReady]);
  const url = id ? held(id, 'thumbnail') : null;
  return (
    <div className={`w-full ${tall ? 'aspect-[4/3]' : 'h-full'} overflow-hidden bg-white/5`}>
      {url ? (
        <img src={url} alt="" className="fade-in h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="shimmer h-full w-full" />
      )}
    </div>
  );
}

function Status({ trouble, server, busy }: { trouble: Failure | null; server: { version: string } | null; busy: boolean }) {
  const tone = trouble ? '#ff7070' : server ? '#3ddc84' : '#a7adb5';
  const text = trouble ? FAILURE_TEXT[trouble.kind] : server ? 'connected' : busy ? 'connecting' : 'waiting';
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-mono text-eyebrow tracking-[0.14em] uppercase" style={{ color: tone }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone }} />
      {text}
    </span>
  );
}

function Nothing({ text }: { text: string }) {
  return <div className="grid h-full place-items-center text-hint text-dim">{text}</div>;
}

function span(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function clockText(now: number, hour24: boolean) {
  return new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: !hour24 });
}

function dateText(now: number) {
  return new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** fisher-yates once, so a shuffled run is an order rather than a coin flip per picture */
function shuffled(length: number) {
  const out = Array.from({ length }, (_, i) => i);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function Viewer({
  asset,
  url,
  at,
  of,
  show,
  info,
  ambient,
  motion,
  transition,
  clock,
  date,
  onClose,
  onStep,
  onShow,
  onInfo,
  onFavourite,
}: {
  asset: Asset;
  url: string | null;
  at: number;
  of: number;
  show: boolean;
  info: boolean;
  ambient: boolean;
  motion: boolean;
  transition: Prefs['transition'];
  clock: string | null;
  date: string | null;
  onClose: () => void;
  onStep: (by: number) => void;
  onShow: () => void;
  onInfo: () => void;
  onFavourite: () => void;
}) {
  const [chrome, setChrome] = useState(true);
  const idle = useRef<number | null>(null);

  const wake = useCallback(() => {
    setChrome(true);
    if (idle.current) window.clearTimeout(idle.current);
    if (show || ambient) idle.current = window.setTimeout(() => setChrome(false), 2600);
  }, [show, ambient]);

  useEffect(() => {
    wake();
    return () => {
      if (idle.current) window.clearTimeout(idle.current);
    };
  }, [wake, at]);

  const style =
    transition === 'kenburns' || (transition === 'random' && at % 3 === 0)
      ? 'ken'
      : transition === 'zoom'
        ? 'zoom-in'
        : transition === 'slide'
          ? 'slide-in'
          : 'fade-in';

  return (
    <div className="relative h-full w-full overflow-hidden bg-black" onPointerMove={wake} onPointerDown={wake}>
      {url ? (
        <img
          key={asset.id}
          src={url}
          alt=""
          className={`h-full w-full object-contain ${motion ? style : 'fade-in'}`}
          draggable={false}
        />
      ) : (
        <div className="grid h-full place-items-center text-hint text-dim">loading…</div>
      )}

      <button className="absolute inset-y-0 left-0 w-1/4" aria-label="previous" onClick={() => onStep(-1)} />
      <button className="absolute inset-y-0 right-0 w-1/4" aria-label="next" onClick={() => onStep(1)} />

      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${chrome ? 'opacity-100' : 'opacity-0'}`}>
        <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 py-3">
          <button onClick={onClose} className="rounded-full bg-black/50 px-3 py-1.5 text-hint">
            Back
          </button>
          <span className="min-w-0 flex-1 truncate text-hint text-soft">{asset.name}</span>
          <button onClick={onFavourite} className="rounded-full bg-black/50 px-3 py-1.5 text-hint">
            {asset.favourite ? '♥' : '♡'}
          </button>
          <button onClick={onInfo} className="rounded-full bg-black/50 px-3 py-1.5 text-hint">
            Info
          </button>
          <button onClick={onShow} className="rounded-full bg-white px-3 py-1.5 text-hint text-screen">
            {show ? 'Pause' : 'Play'}
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
          <span className="font-mono text-hint tabular-nums text-soft">
            {at} / {of}
          </span>
          <span className="text-right text-hint text-soft">
            {clock && <span className="font-mono tabular-nums">{clock}</span>}
            {date && <span className="ml-2 opacity-70">{date}</span>}
          </span>
        </div>
      </div>

      {info && (
        <div className="absolute top-14 right-4 w-64 rounded-2xl bg-black/80 p-4 text-hint ring-1 ring-white/12 backdrop-blur-md">
          <div className="font-mono text-eyebrow tracking-[0.2em] text-dim uppercase">Photo details</div>
          <Line label="Taken" value={asset.takenAt ? new Date(asset.takenAt).toLocaleString() : null} />
          <Line label="Place" value={[asset.city, asset.country].filter(Boolean).join(', ') || null} />
          <Line label="Camera" value={asset.camera} />
          <Line label="Size" value={asset.width && asset.height ? `${asset.width} × ${asset.height}` : null} />
          <Line label="File" value={asset.name} />
        </div>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-2">
      <div className="font-mono text-eyebrow text-dim uppercase">{label}</div>
      <div className="truncate text-off-white">{value}</div>
    </div>
  );
}

function FirstRun({
  onSettings,
  onDemo,
  open,
  prefs,
  setPref,
  usage,
  onSweep,
}: {
  onSettings: () => void;
  onDemo: () => void;
  open: boolean;
  prefs: Prefs;
  setPref: (k: keyof Prefs, v: string) => void;
  usage: { bytes: number; count: number };
  onSweep: () => void;
}) {
  if (open) {
    return (
      <div className="h-full w-full bg-screen text-off-white">
        <SettingsView prefs={prefs} setPref={setPref} usage={usage} server={null} trouble={{ kind: 'unconfigured' }} onSweep={onSweep} />
      </div>
    );
  }
  return (
    <div className="grid h-full w-full place-items-center bg-screen text-off-white">
      <div className="text-center">
        <div className="font-mono text-eyebrow tracking-[0.28em] text-dim uppercase">O-Photos</div>
        <h1 className="mt-2 font-display text-screen-title font-semibold">Your Immich library, on the dash</h1>
        <p className="mt-2 text-hint text-dim">
          The server address and the key go in the companion app. This screen has nowhere to type them.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button onClick={onSettings} className="rounded-full bg-white px-5 py-2 text-row text-screen">
            What it needs
          </button>
          <button onClick={onDemo} className="rounded-full bg-white/10 px-5 py-2 text-row text-off-white">
            Look around a demo library
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsView({
  prefs,
  setPref,
  usage,
  server,
  trouble,
  onSweep,
}: {
  prefs: Prefs;
  setPref: (k: keyof Prefs, v: string) => void;
  usage: { bytes: number; count: number };
  server: { version: string } | null;
  trouble: Failure | null;
  onSweep: () => void;
}) {
  const chip = (on: boolean, label: string, onClick: () => void, key: string) => (
    <button
      key={key}
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-hint transition"
      style={{ backgroundColor: on ? '#efefef' : 'rgba(255,255,255,0.08)', color: on ? '#0a0c0e' : '#a7adb5' }}>
      {label}
    </button>
  );
  const mb = usage.bytes / 1048576;
  const full = Math.min(1, mb / prefs.cacheMb);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:none]">
      <div className="rounded-2xl bg-white/4 p-4">
        <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Immich</div>
        <div className="mt-2 text-hint text-soft">
          {prefs.server ? normalise(prefs.server) : 'No server set'} · {prefs.key ? 'key set' : 'no key'}
        </div>
        <div className="mt-1 text-hint text-dim">
          {server ? `connected, version ${server.version}` : trouble ? FAILURE_TEXT[trouble.kind] : 'not tried yet'}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chip(prefs.server === 'demo', 'demo library', () => setPref('server', prefs.server === 'demo' ? '' : 'demo'), 'demo')}
        </div>
        <p className="mt-2 text-hint text-dim">
          Both are typed in the companion app under O-Photos. Requests go out through the phone, so the server only has
          to be reachable from there.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/4 p-4">
          <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Slideshow</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INTERVALS.map(n => chip(prefs.interval === n, n < 60 ? `${n}s` : `${n / 60}m`, () => setPref('interval', String(n)), `i${n}`))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TRANSITIONS.map(t => chip(prefs.transition === t, t, () => setPref('transition', t), t))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chip(prefs.shuffle, 'shuffle', () => setPref('shuffle', prefs.shuffle ? 'false' : 'true'), 'sh')}
            {chip(prefs.loop, 'loop', () => setPref('loop', prefs.loop ? 'false' : 'true'), 'lo')}
            {chip(prefs.ambient, 'ambient', () => setPref('ambient', prefs.ambient ? 'false' : 'true'), 'am')}
            {chip(prefs.motion, 'animations', () => setPref('motion', prefs.motion ? 'false' : 'true'), 'mo')}
          </div>
        </div>

        <div className="rounded-2xl bg-white/4 p-4">
          <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Cache</div>
          <div className="mt-2 font-mono text-hint tabular-nums text-soft">
            {mb.toFixed(0)} MB of {prefs.cacheMb} MB · {usage.count} pictures
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-white/70" style={{ width: `${full * 100}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CACHE_MB.map(n => chip(prefs.cacheMb === n, n >= 1000 ? `${n / 1000} GB` : `${n} MB`, () => setPref('cacheMb', String(n)), `c${n}`))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chip(false, 'clear all', () => cache.clear('all').then(onSweep), 'ca')}
            {chip(false, 'thumbnails', () => cache.clear('thumbnail').then(onSweep), 'ct')}
            {chip(false, 'previews', () => cache.clear('preview').then(onSweep), 'cp')}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-white/4 p-4">
        <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Display</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chip(prefs.clock, 'clock', () => setPref('clock', prefs.clock ? 'false' : 'true'), 'cl')}
          {chip(prefs.date, 'date', () => setPref('date', prefs.date ? 'false' : 'true'), 'da')}
          {chip(prefs.hour24, '24 hour', () => setPref('hour24', prefs.hour24 ? 'false' : 'true'), 'h24')}
        </div>
        <div className="mt-3 font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Screen</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(['0', '90', '180', '270'] as const).map(turn =>
            chip(prefs.rotate === turn, `${turn}°`, () => setPref('rotate', turn), `r${turn}`),
          )}
        </div>
        <div className="mt-3 font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Which photos</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(['all', 'landscape', 'portrait'] as const).map(shape =>
            chip(prefs.shape === shape, shape, () => setPref('shape', shape), `s${shape}`),
          )}
        </div>
        <p className="mt-2 text-hint text-dim">
          Immich cannot search by shape, so this sifts what comes back: a page of portraits on a
          landscape screen may arrive nearly empty and the next page fills it.
        </p>
      </div>

      <p className="mt-3 font-mono text-hint text-dim">
        1 photos · 2 loved · 3 albums · 4 turn the screen · Mode slideshow · Esc back
      </p>
    </div>
  );
}
