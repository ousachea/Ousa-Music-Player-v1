import { BridgethingClient, type ConnectionState, type PlayerState } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import { daemonUrl } from './daemon';

// one rotary detent lands around deltaX 1, so this is roughly two seconds a click
const SCRUB_MS_PER_DELTA = 2000;
const SCRUB_COMMIT_MS = 340;

function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [conn, setConn] = useState<ConnectionState>(client.connectionState);
  const [state, setState] = useState<PlayerState | null>(null);
  const [artUrl, setArtUrl] = useState<string | null>(null);

  useEffect(() => {
    const offConn = client.on(event => {
      if (event.type === 'open' || event.type === 'close' || event.type === 'connecting') {
        setConn(client.connectionState);
      }
    });
    const offSnapshot = client.player.onSnapshot(reply => setState(reply.state));
    client.player.stateGet().then(r => r.ok && setState(r.response.state));
    return () => {
      offConn();
      offSnapshot();
    };
  }, [client]);

  const track = state?.track ?? null;
  const playback = state?.playback ?? null;
  const artworkId = track?.artworkId ?? null;
  const playing = playback?.state === 'playing';
  const duration = track?.durationMs ?? 0;

  useEffect(() => {
    if (!artworkId) {
      setArtUrl(null);
      return;
    }
    let revoked = false;
    let blobUrl: string | null = null;
    (async () => {
      const result = await client.asset.get({ id: artworkId, requestId: crypto.randomUUID() });
      if (revoked) return;
      if (result.ok) {
        const bytes = new Uint8Array(result.response.bytes as unknown as number[]);
        blobUrl = URL.createObjectURL(new Blob([bytes], { type: result.response.mime ?? 'image/jpeg' }));
        setArtUrl(blobUrl);
      }
    })();
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [client, artworkId]);

  // snapshots are sparse, so the bar runs off an anchor and wall clock between them
  const anchor = useRef({ posMs: 0, at: 0 });
  const [, setTick] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    if (!playback) return;
    anchor.current = { posMs: playback.positionMs + (playback.positionAgeMs ?? 0), at: Date.now() };
    setTick(t => t + 1);
    setScrub(null);
  }, [playback?.positionMs, playback?.state, track?.persistentId]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTick(t => t + 1), 250);
    return () => clearInterval(id);
  }, [playing]);

  const live = playing ? anchor.current.posMs + (Date.now() - anchor.current.at) : anchor.current.posMs;
  const elapsed = Math.min(duration || live, Math.max(0, scrub ?? live));
  const progress = duration > 0 ? elapsed / duration : 0;

  const commit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seek = useCallback(
    (positionMs: number) => {
      const next = Math.min(duration, Math.max(0, positionMs));
      setScrub(next);
      if (commit.current) clearTimeout(commit.current);
      commit.current = setTimeout(() => client.player.seekTo({ positionMs: Math.round(next) }), SCRUB_COMMIT_MS);
    },
    [client, duration],
  );

  const toggle = useCallback(() => {
    if (playback?.state === 'playing') client.player.pause();
    else client.player.resume();
  }, [client, playback?.state]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!duration || !e.deltaX) return;
      seek((scrub ?? live) + e.deltaX * SCRUB_MS_PER_DELTA);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') toggle();
      else if (e.key === 'ArrowLeft') client.player.skipPrev({ allowSeeking: true });
      else if (e.key === 'ArrowRight') client.player.skipNext();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [client, duration, live, scrub, seek, toggle]);

  if (!track) return <Empty conn={conn} />;

  return (
    <div className="relative h-full w-full overflow-hidden bg-screen">
      <Backdrop url={artUrl} />

      <div className="relative flex h-full w-full items-stretch gap-7 p-7">
        <div className="relative aspect-square h-full shrink-0">
          <div className="absolute inset-x-4 bottom-0 h-10 rounded-full bg-black/70 blur-2xl" />
          {artUrl ? (
            <img
              src={artUrl}
              alt=""
              className="relative h-full w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/12"
            />
          ) : (
            <div className="relative grid h-full w-full place-items-center rounded-2xl bg-white/6 ring-1 ring-white/12">
              <Disc className="h-16 w-16 text-off-white/25" />
            </div>
          )}
        </div>

        <div className="flex h-full min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2.5">
            <span className={`h-1.5 w-1.5 rounded-full ${conn === 'open' ? 'bg-ok' : 'bg-warn'}`} />
            <span className="min-w-0 truncate font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">
              {conn === 'open' ? (state?.context?.name ?? track.album ?? 'now playing') : conn}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <h1 className="line-clamp-3 font-display text-[1.75rem] leading-[1.15] font-semibold tracking-display text-off-white">
              {track.title ?? 'unknown'}
            </h1>
            <p className="mt-2 truncate text-title text-soft">{track.artist ?? '—'}</p>
          </div>

          <div>
            <Rail progress={progress} onSeek={ratio => seek(ratio * duration)} />
            <div className="mt-2.5 flex justify-between font-mono text-hint tabular-nums text-dim">
              <span>{clock(elapsed)}</span>
              <span>{duration ? `-${clock(duration - elapsed)}` : '--:--'}</span>
            </div>

            <div className="mt-6 flex items-center justify-center gap-4">
              <Ghost label="previous" onClick={() => client.player.skipPrev({ allowSeeking: true })}>
                <Skip className="h-5 w-5 -scale-x-100" />
              </Ghost>
              <button
                aria-label={playing ? 'pause' : 'play'}
                onClick={toggle}
                className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-off-white text-screen shadow-lg transition active:scale-95 active:bg-near">
                {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
              </button>
              <Ghost label="next" onClick={() => client.player.skipNext()}>
                <Skip className="h-5 w-5" />
              </Ghost>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Backdrop({ url }: { url: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {url && (
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full scale-150 object-cover opacity-70 blur-[72px] saturate-[1.6]"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-screen/62 via-screen/58 to-screen/86" />
      <div className="absolute inset-0 bg-gradient-to-t from-screen/72 via-transparent to-screen/45" />
      <div className="absolute inset-0 shadow-[inset_0_0_140px_60px_var(--color-screen)]" />
    </div>
  );
}

// pointer anywhere on the strip seeks, and the hit area is taller than the visible rail
function Rail({ progress, onSeek }: { progress: number; onSeek: (ratio: number) => void }) {
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
  };
  return (
    <div
      className="group -my-3 flex h-6 w-full cursor-pointer items-center py-3"
      onPointerDown={pick}
      onPointerMove={e => e.buttons === 1 && pick(e)}>
      <div className="relative h-[3px] w-full rounded-full bg-white/18">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-off-white"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-off-white shadow"
          style={{ left: `${Math.min(100, progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Ghost({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-near ring-1 ring-white/15 transition active:scale-95 active:bg-white/12">
      {children}
    </button>
  );
}

function Empty({ conn }: { conn: ConnectionState }) {
  return (
    <div className="grid h-full w-full place-items-center bg-screen px-16 text-center">
      <div className="flex flex-col items-center gap-5">
        <Disc className="h-14 w-14 text-off-white/20" />
        <div className="font-display text-screen-title font-medium tracking-display text-off-white">
          {conn === 'open' ? 'Nothing playing' : 'Waiting for the daemon'}
        </div>
        <div className="text-title text-dim">
          {conn === 'open' ? 'Start a track on your phone to see it here.' : `link ${conn}`}
        </div>
      </div>
    </div>
  );
}

function Play({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.7-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2Z" />
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

function Disc({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
