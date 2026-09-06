import { BridgethingClient, type ConnectionState, type PlayerState } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import { accentFrom, type Accent } from './artwork-color';
import { daemonUrl } from './daemon';

const SCRUB_COMMIT_MS = 340;
// one rotary detent lands around deltaX 1, so a detent is a volume step
const WHEEL_PER_STEP = 1;
// a hard spin should not queue a hundred commands at the daemon
const MAX_STEPS_PER_EVENT = 3;
const HUD_MS = 1400;

type Volume = { level: number; muted: boolean };

function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [conn, setConn] = useState<ConnectionState>(client.connectionState);
  const [state, setState] = useState<PlayerState | null>(null);
  const [artUrl, setArtUrl] = useState<string | null>(null);
  const [accent, setAccent] = useState<Accent | null>(null);
  const [volume, setVolume] = useState<Volume | null>({ level: 0.65, muted: false });
  const [hud, setHud] = useState(true);

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
      setAccent(null);
      return;
    }
    let revoked = false;
    let blobUrl: string | null = null;
    (async () => {
      const result = await client.asset.get({ id: artworkId, requestId: crypto.randomUUID() });
      if (revoked) return;
      if (result.ok) {
        const bytes = new Uint8Array(result.response.bytes as unknown as number[]);
        const blob = new Blob([bytes], { type: result.response.mime ?? 'image/jpeg' });
        blobUrl = URL.createObjectURL(blob);
        setArtUrl(blobUrl);
        const next = await accentFrom(blob);
        if (!revoked) setAccent(next);
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

  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashHud = useCallback(() => {
    setHud(true);
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setHud(false), HUD_MS);
  }, []);

  useEffect(() => {
    const off = client.audio.onVolumeChanged(msg => {
      setVolume({ level: msg.level, muted: msg.muted });
      flashHud();
    });
    return off;
  }, [client, flashHud]);

  const toggle = useCallback(() => {
    if (playback?.state === 'playing') client.player.pause();
    else client.player.resume();
  }, [client, playback?.state]);

  // the daemon owns the step size and the clamping, and its level cannot be read back, so nudge rather than compute one
  const detents = useRef(0);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.deltaX) return;
      detents.current += e.deltaX;
      const steps = Math.trunc(detents.current / WHEEL_PER_STEP);
      if (!steps) return;
      detents.current -= steps * WHEEL_PER_STEP;
      const count = Math.min(Math.abs(steps), MAX_STEPS_PER_EVENT);
      for (let i = 0; i < count; i++) {
        if (steps > 0) client.audio.volumeUp();
        else client.audio.volumeDown();
      }
      flashHud();
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
  }, [client, flashHud, toggle]);

  if (!track)
    return (
      <>
        <Empty conn={conn} />
        <VolumeHud show={hud} volume={volume} accent={accent} />
      </>
    );

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
            <span
              className="min-w-0 truncate font-mono text-eyebrow tracking-[0.22em] text-dim uppercase transition-colors duration-500"
              style={accent ? { color: accent.soft } : undefined}>
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
            <Rail progress={progress} accent={accent} playing={playing} onSeek={ratio => seek(ratio * duration)} />
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
                style={accent ? { backgroundColor: accent.fill, color: accent.ink } : undefined}
                className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-off-white text-screen shadow-lg transition-[transform,background-color,color] duration-300 ease-spring active:scale-90">
                <span key={playing ? 'pause' : 'play'} className="grid animate-pop place-items-center">
                  {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
                </span>
              </button>
              <Ghost label="next" onClick={() => client.player.skipNext()}>
                <Skip className="h-5 w-5" />
              </Ghost>
            </div>
          </div>
        </div>
      </div>

      <VolumeHud show={hud} volume={volume} accent={accent} />
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
function Rail({
  progress,
  accent,
  playing,
  onSeek,
}: {
  progress: number;
  accent: Accent | null;
  playing: boolean;
  onSeek: (ratio: number) => void;
}) {
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
          className="absolute inset-y-0 left-0 overflow-hidden rounded-full bg-off-white transition-colors duration-500"
          style={{ width: `${Math.min(100, progress * 100)}%`, backgroundColor: accent?.fill }}>
          {playing && (
            <div className="absolute inset-y-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          )}
        </div>
        {playing && (
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-3 animate-halo rounded-full bg-off-white"
            style={{ left: `${Math.min(100, progress * 100)}%`, backgroundColor: accent?.fill }}
          />
        )}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-off-white shadow transition-colors duration-500"
          style={{ left: `${Math.min(100, progress * 100)}%`, backgroundColor: accent?.fill }}
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
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-near ring-1 ring-white/15 transition-[transform,background-color] duration-300 ease-spring active:scale-90 active:bg-white/20">
      {children}
    </button>
  );
}

function VolumeHud({ show, volume, accent }: { show: boolean; volume: Volume | null; accent: Accent | null }) {
  const level = volume ? (volume.muted ? 0 : volume.level) : 0;
  return (
    <div
      className={`pointer-events-none fixed inset-0 grid place-items-center transition-opacity duration-300 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}>
      <div className="flex items-center gap-3.5 rounded-full bg-black/72 px-5 py-3.5 ring-1 ring-white/12 backdrop-blur-md">
        <Speaker className="h-5 w-5 text-off-white" muted={volume?.muted === true} />
        <div className="relative h-[3px] w-40 rounded-full bg-white/20">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-off-white transition-[width,background-color] duration-200"
            style={{ width: `${Math.round(level * 100)}%`, backgroundColor: accent?.fill }}
          />
        </div>
        <span className="w-9 text-right font-mono text-hint tabular-nums text-dim">
          {volume ? `${Math.round(level * 100)}%` : '--'}
        </span>
      </div>
    </div>
  );
}

function Speaker({ className, muted }: { className?: string; muted?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4Z" fill="currentColor" stroke="none" />
      {muted ? <path d="m16 9.5 4.5 5M20.5 9.5l-4.5 5" /> : <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.8a7.6 7.6 0 0 1 0 10.4" />}
    </svg>
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
