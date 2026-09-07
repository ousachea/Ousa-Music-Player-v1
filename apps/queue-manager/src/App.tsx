import { BridgethingClient, type ConnectionState } from '@bridgething/client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { daemonUrl } from './daemon';
import {
  DEVICE_CAPABILITIES,
  EMPTY,
  MOCK_CAPABILITIES,
  deviceActions,
  fromQueueItem,
  mockReorder,
  mockSnapshot,
  type Item,
  type Snapshot,
} from './queue';

const WHEEL_SCROLL_PX = 34;

function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [conn, setConn] = useState<ConnectionState>(client.connectionState);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [artUrl, setArtUrl] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const demo = useMemo(() => new URLSearchParams(location.search).has('demo'), []);
  const caps = snap.source === 'mock' ? MOCK_CAPABILITIES : DEVICE_CAPABILITIES;
  const act = useMemo(() => deviceActions(client), [client]);

  useEffect(() => {
    const off = client.on(event => {
      if (event.type === 'open' || event.type === 'close' || event.type === 'connecting') {
        setConn(client.connectionState);
      }
    });
    return off;
  }, [client]);

  useEffect(() => {
    if (demo) {
      setSnap(current => mockSnapshot(current));
      return;
    }
    const pullQueue = () => {
      client.player.queueGet().then(r => {
        if (!r.ok) return;
        setSnap(s => ({
          ...s,
          current: r.response.current ? fromQueueItem(r.response.current) : null,
          items: r.response.items.map(fromQueueItem),
          source: 'device',
        }));
      });
    };
    const offQueue = client.player.onQueueChanged(pullQueue);
    const offState = client.player.onSnapshot(reply => {
      const playback = reply.state?.playback;
      const track = reply.state?.track;
      setSnap(s => ({
        ...s,
        playing: playback?.state === 'playing',
        shuffle: playback?.shuffle === true,
        repeat: playback?.repeat ?? 'off',
        positionMs: playback?.positionMs ?? 0,
        durationMs: track?.durationMs ?? 0,
      }));
    });
    client.player.stateGet().then(r => {
      if (!r.ok) return;
      const playback = r.response.state?.playback;
      const track = r.response.state?.track;
      setSnap(s => ({
        ...s,
        playing: playback?.state === 'playing',
        shuffle: playback?.shuffle === true,
        repeat: playback?.repeat ?? 'off',
        positionMs: playback?.positionMs ?? 0,
        durationMs: track?.durationMs ?? 0,
      }));
    });
    pullQueue();
    return () => {
      offQueue();
      offState();
    };
  }, [client, demo]);

  const artworkId = snap.current?.artworkId ?? null;
  useEffect(() => {
    if (!artworkId) {
      setArtUrl(null);
      return;
    }
    let stale = false;
    let blobUrl: string | null = null;
    client.asset.get({ id: artworkId, requestId: crypto.randomUUID() }).then(result => {
      if (stale || !result.ok) return;
      const bytes = new Uint8Array(result.response.bytes as unknown as number[]);
      blobUrl = URL.createObjectURL(new Blob([bytes], { type: result.response.mime ?? 'image/jpeg' }));
      setArtUrl(blobUrl);
    });
    return () => {
      stale = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [client, artworkId]);

  const say = useCallback((message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(null), 1600);
  }, []);

  const select = useCallback(
    (index: number) => {
      if (snap.source === 'mock') {
        setSnap(s => ({ ...s, current: s.items[index], items: s.items.filter((_, i) => i !== index) }));
        return say('playing');
      }
      act.select(index);
      say('playing');
    },
    [act, say, snap.source],
  );

  const playNext = useCallback(
    (item: Item, index: number) => {
      if (snap.source === 'mock') {
        setSnap(s => ({ ...s, items: mockReorder(s.items, index, 0) }));
        return say('moved to next');
      }
      act.playNext(item.uri);
      say('queued next');
    },
    [act, say, snap.source],
  );

  const toggle = useCallback(() => {
    if (snap.source === 'mock') return setSnap(s => ({ ...s, playing: !s.playing }));
    act.toggle(snap.playing);
  }, [act, snap.playing, snap.source]);

  const offline = conn !== 'open' && snap.source !== 'mock';
  const progress = snap.durationMs > 0 ? Math.min(1, snap.positionMs / snap.durationMs) : 0;

  return (
    <div className="flex h-full w-full gap-4 bg-screen p-5">
      <section className="flex w-[430px] shrink-0 flex-col">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Now playing</span>
          {snap.source === 'mock' && (
            <span className="rounded-full bg-experimental-soft px-2.5 py-0.5 font-mono text-hint text-experimental">
              DEMO DATA
            </span>
          )}
        </div>

        <div className="mt-3 flex gap-4">
          <div className="h-[168px] w-[168px] shrink-0 overflow-hidden rounded-2xl bg-white/6 ring-1 ring-white/10">
            {artUrl ? (
              <img src={artUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <Disc className="h-12 w-12 text-off-white/20" />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className="line-clamp-2 font-display text-[1.75rem] leading-[1.15] font-semibold tracking-display text-off-white">
              {snap.current?.title ?? (offline ? 'Not connected' : 'Nothing playing')}
            </div>
            <div className="mt-1 truncate text-title text-soft">
              {snap.current?.artist ?? (offline ? conn : 'Start a track on your phone')}
            </div>
            {snap.current?.album && <div className="mt-1 truncate font-mono text-hint text-dim">{snap.current.album}</div>}
          </div>
        </div>

        <div className="mt-4">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-hint tabular-nums text-dim">
            <span>{clock(snap.positionMs)}</span>
            <span>{snap.durationMs ? clock(snap.durationMs) : '--:--'}</span>
          </div>
        </div>

        <div className="mt-auto flex items-center gap-3">
          <Round label="previous" onClick={() => (snap.source === 'mock' ? say('previous') : act.previous())}>
            <Skip className="h-6 w-6 -scale-x-100" />
          </Round>
          <button
            aria-label={snap.playing ? 'pause' : 'play'}
            onClick={toggle}
            className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full bg-off-white text-screen transition active:scale-90">
            {snap.playing ? <Pause className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}
          </button>
          <Round label="next" onClick={() => (snap.source === 'mock' ? say('next') : act.next())}>
            <Skip className="h-6 w-6" />
          </Round>

          <div className="ml-auto flex items-center gap-2">
            <Toggle
              label="shuffle"
              on={snap.shuffle}
              onClick={() => {
                const on = !snap.shuffle;
                setSnap(s => ({ ...s, shuffle: on }));
                if (snap.source !== 'mock') act.setShuffle(on);
              }}>
              <Shuffle className="h-5 w-5" />
            </Toggle>
            <Toggle
              label={`repeat ${snap.repeat}`}
              on={snap.repeat !== 'off'}
              onClick={() => {
                const mode = snap.repeat === 'off' ? 'all' : snap.repeat === 'all' ? 'one' : 'off';
                setSnap(s => ({ ...s, repeat: mode }));
                if (snap.source !== 'mock') act.setRepeat(mode);
              }}>
              <Repeat className="h-5 w-5" one={snap.repeat === 'one'} />
            </Toggle>
          </div>
        </div>
      </section>

      <Queue items={snap.items} caps={caps} onSelect={select} onPlayNext={playNext} flash={flash} />
    </div>
  );
}

const Queue = memo(function Queue({
  items,
  caps,
  onSelect,
  onPlayNext,
  flash,
}: {
  items: Item[];
  caps: typeof DEVICE_CAPABILITIES;
  onSelect: (index: number) => void;
  onPlayNext: (item: Item, index: number) => void;
  flash: string | null;
}) {
  const list = useRef<HTMLDivElement>(null);

  // the wheel is the only way through a long queue without reaching across the screen
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!list.current || !e.deltaX) return;
      list.current.scrollTop += e.deltaX * WHEEL_SCROLL_PX;
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-2xl bg-white/4 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Up next</span>
        <span className="font-mono text-hint tabular-nums text-dim">{items.length}</span>
      </div>

      <div ref={list} className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-width:none]">
        {items.length === 0 ? (
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <div className="text-row text-soft">Queue is empty</div>
              <div className="mt-1 font-mono text-hint text-dim">tracks queued on your phone show up here</div>
            </div>
          </div>
        ) : (
          items.map((item, i) => (
            <Row key={`${item.uri}-${i}`} item={item} index={i} caps={caps} onSelect={onSelect} onPlayNext={onPlayNext} />
          ))
        )}
      </div>

      <div className="mt-2 flex h-4 items-center justify-between font-mono text-hint">
        <span className="text-dim">{caps.remove ? '' : caps.note}</span>
        <span className="text-ok">{flash ?? ''}</span>
      </div>
    </section>
  );
});

const Row = memo(function Row({
  item,
  index,
  caps,
  onSelect,
  onPlayNext,
}: {
  item: Item;
  index: number;
  caps: typeof DEVICE_CAPABILITIES;
  onSelect: (index: number) => void;
  onPlayNext: (item: Item, index: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/6 py-2 last:border-b-0">
      <button
        onClick={() => onSelect(index)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition active:scale-[0.98]">
        <span className="w-6 shrink-0 font-mono text-hint tabular-nums text-dim">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-row-lg text-near">{item.title ?? 'unknown'}</span>
          <span className="block truncate font-mono text-hint text-dim">{item.artist ?? '—'}</span>
        </span>
      </button>
      <button
        aria-label={caps.playNext ? 'play next' : 'reordering unavailable'}
        disabled={!caps.playNext}
        onClick={() => onPlayNext(item, index)}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-dim ring-1 ring-white/12 transition active:scale-90 active:bg-white/15 disabled:opacity-30">
        <Bump className="h-4 w-4" />
      </button>
    </div>
  );
});

function Round({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-near ring-1 ring-white/15 transition active:scale-90 active:bg-white/15">
      {children}
    </button>
  );
}

function Toggle({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`grid h-10 w-10 place-items-center rounded-full transition active:scale-90 ${
        on ? 'bg-accent-soft text-accent' : 'text-dim'
      }`}>
      {children}
    </button>
  );
}

function Play({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path transform="translate(-1.6 0)" d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.7-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2Z" />
    </svg>
  );
}

function Pause({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1.4" />
      <rect x="14" y="5" width="4" height="14" rx="1.4" />
    </svg>
  );
}

function Skip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M5 6.3v11.4a1 1 0 0 0 1.54.84l8.9-5.7a1 1 0 0 0 0-1.68l-8.9-5.7A1 1 0 0 0 5 6.3Z" />
      <rect x="17" y="5" width="2.6" height="14" rx="1.3" />
    </svg>
  );
}

function Shuffle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
}

function Repeat({ className, one }: { className?: string; one?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" />
      {one && <path d="M11 10.5l1.5-1v5" />}
    </svg>
  );
}

/** an upward chevron over a line: push this track to the front of what plays next */
function Bump({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V8M6 14l6-6 6 6M5 4h14" />
    </svg>
  );
}

function Disc({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
