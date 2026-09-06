import { BridgethingClient, type ConnectionState, type PlayerState } from '@bridgething/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';

import { accentFrom, type Accent } from './artwork-color';
import { useClock, type ClockParts } from './clock';
import { usePrefs, type Prefs } from './config';
import { useUpdateCheck, type UpdateState } from './update';
import { daemonUrl } from './daemon';

const SCRUB_COMMIT_MS = 340;
// one rotary detent lands around deltaX 1, so a detent is a volume step
const WHEEL_PER_STEP = 1;
// a hard spin should not queue a hundred commands at the daemon
const MAX_STEPS_PER_EVENT = 3;
const HUD_MS = 1400;
// how long a knob press waits for a second or third one before it commits to an action
const MULTI_CLICK_MS = 300;
// the panel is only reachable by a hardware button, so say so once and then stop
const HINT_KEY = 'hint.settingsSeen';
const HINT_MS = 7000;
const WHEEL_SCROLL_PX = 26;

type Volume = { level: number; muted: boolean };

function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const { prefs, setPref } = usePrefs(client);
  const wallClock = useClock(client, prefs.clock, prefs.clockSeconds, prefs.clockFormat);
  const [panel, setPanel] = useState(false);
  const [hint, setHint] = useState(false);
  const hintSaved = useRef(false);
  const [conn, setConn] = useState<ConnectionState>(client.connectionState);
  const [state, setState] = useState<PlayerState | null>(null);
  const [artUrl, setArtUrl] = useState<string | null>(null);
  const [accent, setAccent] = useState<Accent | null>(null);
  const [volume, setVolume] = useState<Volume | null>(null);
  const [hud, setHud] = useState(false);
  const [playTap, bumpPlay] = useState(0);

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

  const accentOn = prefs.accent === 'artwork' ? accent : null;
  const seekStyle = prefs.seek === 'auto' ? (prefs.theme === 'poster' ? 'wave' : 'bar') : prefs.seek;
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

  useEffect(() => {
    let stale = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    client.doc
      .get({ key: HINT_KEY })
      .then(r => {
        if (stale || !r.ok || r.response.value) return;
        setHint(true);
        timer = setTimeout(() => setHint(false), HINT_MS);
      })
      .catch(() => {});
    return () => {
      stale = true;
      if (timer) clearTimeout(timer);
    };
  }, [client]);

  useEffect(() => {
    if (!panel) return;
    setHint(false);
    if (hintSaved.current) return;
    hintSaved.current = true;
    client.doc.set({ key: HINT_KEY, value: 'true' });
  }, [panel, client]);

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

  // one press plays or pauses, two skip forward, three skip back
  const clicks = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const press = useCallback(() => {
    clicks.current += 1;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      const count = clicks.current;
      clicks.current = 0;
      if (count === 1) toggle();
      else if (count === 2) client.player.skipNext();
      // a triple press means the previous track, never a restart of this one
      else client.player.skipPrev({ allowSeeking: false });
    }, MULTI_CLICK_MS);
  }, [client, toggle]);

  useEffect(() => {
    // both modes go through the same detent gate, so a click means the same amount either way
    const onWheel = (e: WheelEvent) => {
      if (panel || !e.deltaX) return;
      detents.current += e.deltaX;
      const steps = Math.trunc(detents.current / WHEEL_PER_STEP);
      if (!steps) return;
      detents.current -= steps * WHEEL_PER_STEP;
      const count = Math.min(Math.abs(steps), MAX_STEPS_PER_EVENT);

      if (prefs.wheel === 'seek') {
        if (!duration) return;
        seek((scrub ?? live) + Math.sign(steps) * count * prefs.seekSeconds * 1000);
        return;
      }

      for (let i = 0; i < count; i++) {
        if (steps > 0) client.audio.volumeUp();
        else client.audio.volumeDown();
      }
      flashHud();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === ' ' || e.key === 'Enter') press();
      else if (e.key === 'Escape') setPanel(open => !open);
      else if (e.key === 'ArrowLeft') client.player.skipPrev({ allowSeeking: true });
      else if (e.key === 'ArrowRight') client.player.skipNext();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [client, duration, flashHud, live, panel, prefs.seekSeconds, prefs.wheel, press, scrub, seek]);

  if (!track)
    return (
      <>
        <Empty conn={conn} />
        <VolumeHud show={hud} volume={volume} accent={accentOn} />
      </>
    );

  return (
    <div className="relative h-full w-full overflow-hidden bg-screen">
      {prefs.theme === 'poster' ? (
        <Poster
          artUrl={artUrl}
          context={conn === 'open' ? (state?.context?.name ?? track.album ?? 'now playing') : conn}
          title={track.title ?? 'unknown'}
          artist={track.artist ?? '—'}
          accent={accentOn}
          playing={playing}
          motion={prefs.motion}
          seekStyle={seekStyle}
          progress={progress}
          elapsed={elapsed}
          duration={duration}
          wallClock={wallClock}
          clockPos={prefs.clockPos}
          clockSize={prefs.clockSize}
          onToggle={toggle}
          onPrev={() => client.player.skipPrev({ allowSeeking: true })}
          onNext={() => client.player.skipNext()}
          onSeek={ratio => seek(ratio * duration)}
        />
      ) : (
        <>
          <Backdrop url={artUrl} intensity={prefs.backdrop} drift={prefs.drift} />

          <div className="relative flex h-full w-full items-stretch gap-7 p-7">
            {prefs.theme === 'vinyl' ? (
              <Turntable artUrl={artUrl} playing={playing} spin={prefs.motion} />
            ) : (
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
            )}

            <div className="flex h-full min-w-0 flex-1 flex-col">
              <div className={`flex min-h-5 items-center ${JUSTIFY[prefs.clockPos]}`}>
                <ClockView parts={wallClock} size={(11 * prefs.clockSize) / 100} className="text-dim" />
              </div>

              <div className="flex min-h-0 flex-1 flex-col justify-center">
                <div
                  className="mb-2 truncate font-mono text-eyebrow tracking-[0.22em] text-dim uppercase transition-colors duration-500"
                  style={accentOn ? { color: accentOn.soft } : undefined}>
                  {conn === 'open' ? (state?.context?.name ?? track.album ?? 'now playing') : conn}
                </div>
                <Roll
                  text={track.title ?? 'unknown'}
                  className="font-display text-[2.125rem] leading-[1.2] font-semibold tracking-display text-off-white"
                />
                <Roll text={track.artist ?? '—'} className="mt-2 text-title text-soft" />
              </div>

              <div>
                <Seek
                  style={seekStyle}
                  progress={progress}
                  playing={playing && prefs.motion}
                  tint={accentOn?.fill ?? '#efefef'}
                  onSeek={ratio => seek(ratio * duration)}
                />
                <div className="mt-2.5 flex justify-between font-mono text-hint tabular-nums text-dim">
                  <span>{clock(elapsed)}</span>
                  <span>{duration ? (prefs.remaining ? `-${clock(duration - elapsed)}` : clock(duration)) : '--:--'}</span>
                </div>

                <div className="mt-8 flex items-center justify-center gap-5">
                  <Ghost label="previous" onClick={() => client.player.skipPrev({ allowSeeking: true })}>
                    <Skip className="h-6 w-6 -scale-x-100" />
                  </Ghost>
                  <button
                    aria-label={playing ? 'pause' : 'play'}
                    onPointerDown={() => bumpPlay(n => n + 1)}
                    onClick={toggle}
                    style={accentOn ? { backgroundColor: accentOn.fill, color: accentOn.ink } : undefined}
                    className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full bg-off-white text-screen shadow-lg transition-[transform,background-color,color] duration-300 ease-spring active:scale-90">
                    {playTap > 0 && (
                      <span
                        key={playTap}
                        className="pointer-events-none absolute inset-0 animate-ripple rounded-full ring-3"
                        style={{ color: accentOn?.fill ?? '#efefef' }}
                      />
                    )}
                    <span key={playing ? 'pause' : 'play'} className="grid animate-pop place-items-center">
                      {playing ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8" />}
                    </span>
                  </button>
                  <Ghost label="next" onClick={() => client.player.skipNext()}>
                    <Skip className="h-6 w-6" />
                  </Ghost>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <VolumeHud show={hud} volume={volume} accent={accentOn} />
      <div
        className={`pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-black/78 px-4 py-2.5 text-hint text-near ring-1 ring-white/12 backdrop-blur-md transition-opacity duration-500 ${
          hint && !panel ? 'opacity-100' : 'opacity-0'
        }`}>
        <BackGlyph className="h-3.5 w-3.5" />
        Press the button under the wheel for settings
      </div>
      {panel && <Panel client={client} prefs={prefs} setPref={setPref} accent={accentOn} />}
    </div>
  );
}

const ENUMS: Record<string, { values: string[]; labels: string[] }> = {
  theme: { values: ['card', 'vinyl', 'poster'], labels: ['Cover', 'Vinyl', 'Poster'] },
  wheel: { values: ['volume', 'seek'], labels: ['Volume', 'Scrub'] },
  seek: { values: ['auto', 'bar', 'wave'], labels: ['Auto', 'Bar', 'Wave'] },
  clockPos: { values: ['left', 'center', 'right'], labels: ['Left', 'Centre', 'Right'] },
  clockFormat: { values: ['auto', 'h12', 'h24'], labels: ['Auto', '12h', '24h'] },
  accent: { values: ['artwork', 'mono'], labels: ['Album art', 'White'] },
};

const NUMERIC: Record<string, { min: number; max: number; step: number; suffix: string }> = {
  seekSeconds: { min: 1, max: 30, step: 1, suffix: 's' },
  backdrop: { min: 0, max: 100, step: 10, suffix: '%' },
  drift: { min: 0, max: 100, step: 10, suffix: '%' },
  clockSize: { min: 70, max: 200, step: 10, suffix: '%' },
};

// grouped so a related pair reads together rather than as nine unrelated lines
const GROUPS: { title: string; rows: { key: keyof Prefs; label: string }[] }[] = [
  {
    title: 'Player',
    rows: [
      { key: 'theme', label: 'Player style' },
      { key: 'accent', label: 'Accent colour' },
    ],
  },
  {
    title: 'Controls',
    rows: [
      { key: 'wheel', label: 'Rotary wheel' },
      { key: 'seekSeconds', label: 'Seek step' },
      { key: 'seek', label: 'Seek bar' },
    ],
  },
  {
    title: 'Backdrop',
    rows: [
      { key: 'backdrop', label: 'Intensity' },
      { key: 'drift', label: 'Drift' },
    ],
  },
  {
    title: 'Display',
    rows: [
      { key: 'motion', label: 'Animations' },
      { key: 'remaining', label: 'Show time remaining' },
    ],
  },
  {
    title: 'Clock',
    rows: [
      { key: 'clock', label: 'Show clock' },
      { key: 'clockPos', label: 'Position' },
      { key: 'clockSize', label: 'Size' },
      { key: 'clockFormat', label: 'Format' },
      { key: 'clockSeconds', label: 'Seconds' },
    ],
  },
];

function Panel({
  client,
  prefs,
  setPref,
  accent,
}: {
  client: BridgethingClient;
  prefs: Prefs;
  setPref: (key: keyof Prefs, value: string) => void;
  accent: Accent | null;
}) {
  const tint = accent?.fill ?? '#efefef';
  const ink = accent?.ink ?? '#060809';
  const { state: update, check } = useUpdateCheck(client);
  const list = useRef<HTMLDivElement>(null);

  // the wheel drives volume everywhere else, but while this is open it belongs to the list
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!list.current || !e.deltaX) return;
      list.current.scrollTop += e.deltaX * WHEEL_SCROLL_PX;
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  const control = (key: keyof Prefs) => {
    const enumeration = ENUMS[key];
    const value = prefs[key];
    const numeric = NUMERIC[key];

    if (numeric) {
      return (
        <div className="flex shrink-0 items-center gap-3">
          <Step label="less" onClick={() => setPref(key, String(Math.max(numeric.min, (value as number) - numeric.step)))}>
            −
          </Step>
          <span className="w-14 text-center font-mono text-title tabular-nums" style={{ color: tint }}>
            {value as number}
            {numeric.suffix}
          </span>
          <Step label="more" onClick={() => setPref(key, String(Math.min(numeric.max, (value as number) + numeric.step)))}>
            +
          </Step>
        </div>
      );
    }

    if (enumeration && enumeration.values.length > 2) {
      return (
        <Segments
          values={enumeration.values}
          labels={enumeration.labels}
          value={String(value)}
          tint={tint}
          ink={ink}
          onPick={next => setPref(key, next)}
        />
      );
    }

    if (enumeration) {
      return (
        <button
          onClick={() => {
            const i = enumeration.values.indexOf(String(value));
            setPref(key, enumeration.values[(i + 1) % enumeration.values.length]);
          }}
          className="shrink-0 rounded-full px-5 py-2 text-row font-medium transition active:scale-95"
          style={{ backgroundColor: 'rgba(255,255,255,0.10)', color: tint }}>
          {enumeration.labels[Math.max(0, enumeration.values.indexOf(String(value)))]}
        </button>
      );
    }

    return (
      <button
        role="switch"
        aria-checked={value === true}
        onClick={() => setPref(key, value ? 'false' : 'true')}
        className="relative h-9 w-16 shrink-0 rounded-full transition-colors duration-200"
        style={{ backgroundColor: value ? tint : 'rgba(255,255,255,0.16)' }}>
        <span
          className="absolute top-1 h-7 w-7 rounded-full bg-screen transition-[left] duration-200"
          style={{ left: value ? '32px' : '4px' }}
        />
      </button>
    );
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-screen/97 py-5 pl-8 pr-24 backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-hint tracking-[0.22em] text-dim uppercase">Settings</span>
        <span className="flex items-center gap-2 text-hint text-dim">
          <BackGlyph className="h-3.5 w-3.5" />
          the button under the wheel closes this
        </span>
      </div>

      <div
        ref={list}
        className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-width:none]">
        {GROUPS.map((group, gi) => (
          <section key={group.title} className={gi === 0 ? '' : 'mt-6'}>
            <h2 className="mb-1 font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">{group.title}</h2>
            <div className="rounded-2xl bg-white/4">
              {group.rows.map((row, ri) => (
                <div
                  key={row.key}
                  className={`flex items-center justify-between gap-5 px-4 py-2 ${
                    ri === group.rows.length - 1 ? '' : 'border-b border-white/6'
                  }`}>
                  <span className="min-w-0 truncate text-title text-near">{row.label}</span>
                  {control(row.key)}
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="mt-6 mb-1">
          <h2 className="mb-1 font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">About</h2>
          <div className="flex items-center justify-between gap-5 rounded-2xl bg-white/4 px-4 py-2">
            <div className="min-w-0">
              <div className="truncate text-title text-near">Software update</div>
              <div className="truncate text-hint text-dim">{updateLine(update)}</div>
            </div>
            <button
              onClick={check}
              disabled={update.kind === 'checking'}
              className="shrink-0 rounded-full px-5 py-2 text-row font-medium transition active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: 'rgba(255,255,255,0.10)', color: tint }}>
              {update.kind === 'checking' ? 'Checking...' : 'Check'}
            </button>
          </div>
        </section>
      </div>

      <p className="mt-2 text-hint text-dim">Changing a setting in the companion app overrides it here.</p>
    </div>
  );
}

function BackGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M10 5 3 12l7 7M3 12h13a5 5 0 0 1 0 10h-1" />
    </svg>
  );
}

function updateLine(state: UpdateState) {
  switch (state.kind) {
    case 'idle':
      return 'Ask the store whether a newer version is published';
    case 'checking':
      return 'Asking the store...';
    case 'current':
      return `Up to date on ${state.version}`;
    case 'behind':
      // the device installs from the store, so the app can only report, never pull
      return `${state.latest} is out. You are on ${state.installed}. Install it from the store.`;
    case 'failed':
      return `Could not check: ${state.reason}`;
  }
}

function Segments({
  values,
  labels,
  value,
  tint,
  ink,
  onPick,
}: {
  values: string[];
  labels: string[];
  value: string;
  tint: string;
  ink: string;
  onPick: (next: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 p-1">
      {values.map((option, i) => {
        const on = option === value;
        return (
          <button
            key={option}
            aria-pressed={on}
            onClick={() => onPick(option)}
            style={on ? { backgroundColor: tint, color: ink } : undefined}
            className={`rounded-full px-4 py-1.5 text-row font-medium transition duration-200 active:scale-95 ${
              on ? '' : 'text-dim'
            }`}>
            {labels[i]}
          </button>
        );
      })}
    </div>
  );
}

function Step({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-full text-title text-near ring-1 ring-white/15 transition active:scale-90 active:bg-white/15">
      {children}
    </button>
  );
}

// a marquee only earns its motion when the text actually overflows, so the width is measured rather than guessed
function Roll({ text, className }: { text: string; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    let stale = false;
    const measure = () => {
      if (stale || !outer.current || !inner.current) return;
      const over = Math.ceil(inner.current.scrollWidth - outer.current.clientWidth);
      setShift(over > 2 ? over : 0);
    };
    measure();
    // the bundled faces land after first paint and change every width
    document.fonts?.ready.then(measure).catch(() => {});
    // and the box itself can change without the text doing so, which would leave the measurement stale
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    return () => {
      stale = true;
      observer.disconnect();
    };
  }, [text]);

  return (
    <div ref={outer} className={`overflow-hidden ${className ?? ''}`}>
      <span
        ref={inner}
        className={`inline-block whitespace-nowrap ${shift ? 'roll' : ''}`}
        style={
          shift
            ? ({ '--roll-shift': `-${shift}px`, '--roll-duration': `${2600 + shift * 34}ms` } as CSSProperties)
            : undefined
        }>
        {text}
      </span>
    </div>
  );
}

// the sleeve sits behind, the record carries the art as its label, and the arm drops when the track runs
function Turntable({ artUrl, playing, spin }: { artUrl: string | null; playing: boolean; spin: boolean }) {
  return (
    <div className="relative aspect-square h-full shrink-0">
      <div className="absolute bottom-3 left-6 right-6 h-8 rounded-full bg-black/75 blur-2xl" />

      <div className="absolute left-0 top-[3%] h-[62%] w-[62%] -rotate-6 overflow-hidden rounded shadow-2xl ring-1 ring-white/10">
        {artUrl ? (
          <img src={artUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-white/8" />
        )}
      </div>

      <div
        className="absolute bottom-0 right-0 h-[88%] w-[88%] animate-platter rounded-full shadow-2xl"
        style={{
          animationPlayState: playing && spin ? 'running' : 'paused',
          background: [
            'repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.055) 0 1px, rgba(0,0,0,0) 1px 4px)',
            'radial-gradient(circle at 50% 50%, #121212 0 33%, #0b0b0b 33.4% 100%)',
          ].join(','),
        }}>
        {/* the sheen stays with the disc, which is what makes the rotation legible on a plain black circle */}
        <div
          className="absolute inset-0 rounded-full opacity-70"
          style={{
            background:
              'conic-gradient(from 210deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.16) 38deg, rgba(255,255,255,0) 92deg, rgba(255,255,255,0) 180deg, rgba(255,255,255,0.11) 220deg, rgba(255,255,255,0) 275deg)',
          }}
        />
        <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />

        <div className="absolute left-1/2 top-1/2 h-[34%] w-[34%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full ring-1 ring-black/40">
          {artUrl ? (
            <img src={artUrl} alt="" className="h-full w-full scale-[1.6] object-cover" />
          ) : (
            <div className="h-full w-full bg-white/12" />
          )}
        </div>
        <div className="absolute left-1/2 top-1/2 h-[4.5%] w-[4.5%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-screen ring-1 ring-white/25" />
      </div>

      <Tonearm playing={playing} />
    </div>
  );
}

function Tonearm({ playing }: { playing: boolean }) {
  // box coordinates: the record is 373 wide anchored bottom right, so its centre is 237,237 with radius 186
  return (
    <svg viewBox="0 0 424 424" className="pointer-events-none absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f6f8fa" />
          <stop offset="45%" stopColor="#bcc3c9" />
          <stop offset="100%" stopColor="#79828a" />
        </linearGradient>
      </defs>

      {/* the pivot sits clear of the record, up and to its right, the way a deck is actually laid out */}
      <circle cx="386" cy="40" r="27" fill="rgba(255,255,255,0.09)" />
      <circle cx="386" cy="40" r="15" fill="url(#chrome)" />
      <circle cx="386" cy="40" r="5.5" fill="#6b747b" />

      <g
        style={{
          transformOrigin: '386px 40px',
          transform: `rotate(${playing ? 0 : -16}deg)`,
          transition: 'transform 700ms cubic-bezier(0.4,0,0.2,1)',
        }}>
        <path
          d="M386 40 C 398 92, 380 128, 336 152"
          fill="none"
          stroke="url(#chrome)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        {/* the headshell lands on the outer grooves, never over the label */}
        <rect x="322" y="142" width="17" height="26" rx="4" fill="url(#chrome)" transform="rotate(28 330 155)" />
      </g>
    </svg>
  );
}

// the artwork is the whole ground here, so everything else sits on top of it
function Poster({
  artUrl,
  context,
  title,
  artist,
  accent,
  playing,
  motion,
  seekStyle,
  wallClock,
  clockPos,
  clockSize,
  progress,
  elapsed,
  duration,
  onToggle,
  onPrev,
  onNext,
  onSeek,
}: {
  artUrl: string | null;
  context: string;
  title: string;
  artist: string;
  accent: Accent | null;
  playing: boolean;
  motion: boolean;
  seekStyle: 'bar' | 'wave';
  wallClock: ClockParts | null;
  clockPos: 'left' | 'center' | 'right';
  clockSize: number;
  progress: number;
  elapsed: number;
  duration: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (ratio: number) => void;
}) {
  // soft is the lighter, less saturated variant; over an arbitrary cover it holds up where the full fill would not
  const tint = accent?.soft ?? '#f2f4f6';
  return (
    <div className="absolute inset-0 overflow-hidden">
      {artUrl ? (
        <img src={artUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-white/6" />
      )}
      {/* the art is arbitrary, so the text needs its own guaranteed contrast underneath */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/45" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-black/40" />

      <div className={`absolute inset-x-8 top-6 flex ${JUSTIFY[clockPos]}`}>
        <ClockView parts={wallClock} size={(12 * clockSize) / 100} className="text-off-white/75" />
      </div>

      <button
        aria-label={playing ? 'pause' : 'play'}
        onClick={onToggle}
        style={accent ? { backgroundColor: accent.fill, color: accent.ink } : undefined}
        className="absolute right-7 top-1/2 grid h-24 w-24 -translate-y-1/2 place-items-center rounded-[30px] bg-off-white text-screen shadow-2xl transition-[transform,background-color,color] duration-300 ease-spring active:scale-90">
        <span key={playing ? 'pause' : 'play'} className="grid animate-pop place-items-center">
          {playing ? <Pause className="h-9 w-9" /> : <Play className="h-9 w-9" />}
        </span>
      </button>

      <div className="absolute left-8 top-1/2 w-[52%] -translate-y-1/2">
        <div className="mb-2 truncate font-mono text-eyebrow tracking-[0.22em] text-off-white/65 uppercase">
          {context}
        </div>
        <Roll
          text={title}
          className="font-display text-[2.375rem] leading-[1.15] font-semibold tracking-display text-off-white"
        />
        <Roll text={artist} className="mt-1 text-title text-off-white/70" />
        <div className="mt-2.5 font-mono text-hint tabular-nums text-off-white/60">
          {clock(elapsed)} / {duration ? clock(duration) : '--:--'}
        </div>
      </div>

      <div className="absolute inset-x-8 bottom-7 flex items-center gap-6">
        <button
          aria-label="previous"
          onClick={onPrev}
          style={{ color: tint }}
          className="-m-3 shrink-0 p-3 text-off-white transition-[transform,color] duration-300 ease-spring active:scale-90">
          <Skip className="h-9 w-9 -scale-x-100" />
        </button>

        <Seek style={seekStyle} progress={progress} playing={playing && motion} tint={tint} onSeek={onSeek} />

        <button
          aria-label="next"
          onClick={onNext}
          style={{ color: tint }}
          className="-m-3 shrink-0 p-3 text-off-white transition-[transform,color] duration-300 ease-spring active:scale-90">
          <Skip className="h-9 w-9" />
        </button>
      </div>
    </div>
  );
}

const WAVE_AMPLITUDE = 5;
const WAVE_LENGTH = 26;

// played is drawn as a wave and the rest as a flat line, which is what separates this style from a plain bar.
// it runs a wavelength past each end so the travelling animation always has crests to pull into view.
function wavePath(from: number, to: number, mid: number) {
  if (to <= from) return '';
  let d = '';
  for (let x = from; x <= to; x += 2) {
    const y = (mid - Math.sin((x / WAVE_LENGTH) * Math.PI * 2) * WAVE_AMPLITUDE).toFixed(2);
    d += `${d ? ' L' : 'M'} ${x.toFixed(1)} ${y}`;
  }
  return d;
}

function Wave({
  progress,
  playing,
  tint,
  onSeek,
}: {
  progress: number;
  playing: boolean;
  tint: string;
  onSeek: (ratio: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!box.current) return;
    const measure = () => box.current && setWidth(box.current.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const height = 22;
  const mid = height / 2;
  const played = Math.max(0, Math.min(width, width * progress));
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };

  return (
    <div
      ref={box}
      className="-my-3 flex h-11 w-full min-w-0 flex-1 cursor-pointer items-center py-3"
      onPointerDown={pick}
      onPointerMove={e => e.buttons === 1 && pick(e)}>
      <svg width="100%" height={height} viewBox={`0 0 ${Math.max(1, width)} ${height}`} className="overflow-visible">
        <path
          d={`M ${played} ${mid} L ${width} ${mid}`}
          stroke="rgba(255,255,255,0.32)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <defs>
          {/* the wave is drawn long and clipped back to the playhead, so travel never spills past it */}
          <clipPath id="wave-played">
            <rect x="0" y="0" width={Math.max(0, played)} height={height} />
          </clipPath>
        </defs>
        <g clipPath="url(#wave-played)">
          <path
            className="wave-travel"
            style={{
              ['--wave-step' as string]: `${WAVE_LENGTH}px`,
              animationPlayState: playing ? 'running' : 'paused',
            }}
            d={wavePath(-WAVE_LENGTH, played + WAVE_LENGTH, mid)}
            stroke={tint}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
        <rect x={played - 1.5} y={mid - 9} width="3" height="18" rx="1.5" fill={tint} />
      </svg>
    </div>
  );
}

function Seek({
  style,
  progress,
  playing,
  tint,
  onSeek,
}: {
  style: 'bar' | 'wave';
  progress: number;
  playing: boolean;
  tint: string;
  onSeek: (ratio: number) => void;
}) {
  return style === 'wave' ? (
    <Wave progress={progress} playing={playing} tint={tint} onSeek={onSeek} />
  ) : (
    <Rail progress={progress} playing={playing} tint={tint} onSeek={onSeek} />
  );
}

const JUSTIFY: Record<'left' | 'center' | 'right', string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

// the colon is its own element so it can blink without the digits reflowing
function ClockView({ parts, size, className }: { parts: ClockParts | null; size: number; className?: string }) {
  if (!parts) return null;
  const colon = (
    <span className="transition-opacity duration-150" style={{ opacity: parts.colon ? 1 : 0.2 }}>
      :
    </span>
  );
  return (
    <span className={`shrink-0 font-mono tabular-nums ${className ?? ''}`} style={{ fontSize: `${size}px` }}>
      {parts.hour}
      {colon}
      {parts.minute}
      {parts.second !== null && (
        <>
          {colon}
          {parts.second}
        </>
      )}
      {parts.dayPeriod && <span className="ml-1.5">{parts.dayPeriod}</span>}
    </span>
  );
}

function Backdrop({ url, intensity, drift }: { url: string | null; intensity: number; drift: number }) {
  const level = Math.min(1, Math.max(0, intensity / 100));
  // travel has to stay inside the overhang the zoom creates, or the pan would drag an edge into frame
  const d = Math.min(1, Math.max(0, drift / 100));
  const driftVars = {
    '--drift-scale': (1.5 + 0.6 * d).toFixed(3),
    '--drift-x': `${-(1 + 9 * d).toFixed(2)}%`,
    '--drift-y': `${(0.6 + 5 * d).toFixed(2)}%`,
    '--drift-duration': `${Math.round(40 - 22 * d)}s`,
  } as CSSProperties;
  // the scrims were fixed, so raising the image opacity alone did almost nothing; they have to yield as it rises
  const scrim = (alpha: number) => `rgba(6, 8, 9, ${(alpha * (1 - 0.62 * level)).toFixed(3)})`;
  return (
    <div className="pointer-events-none absolute inset-0">
      {url && level > 0 && (
        <img
          src={url}
          alt=""
          // tailwind's scale utility sets the separate scale property, which would compound with the
          // keyframes' own transform, so the zoom is owned by one of them and never both
          style={{ opacity: level, transform: d > 0 ? undefined : 'scale(1.5)', ...(d > 0 ? driftVars : {}) }}
          className={`absolute inset-0 h-full w-full object-cover blur-[72px] saturate-[1.6] transition-opacity duration-500 ${
            d > 0 ? 'drift' : ''
          }`}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to right, ${scrim(0.62)}, ${scrim(0.58)}, ${scrim(0.86)})` }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to top, ${scrim(0.72)}, rgba(6, 8, 9, 0), ${scrim(0.45)})` }}
      />
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 140px 60px ${scrim(1)}` }} />
    </div>
  );
}

// pointer anywhere on the strip seeks, and the hit area is taller than the visible rail
function Rail({
  progress,
  playing,
  tint,
  onSeek,
}: {
  progress: number;
  playing: boolean;
  tint: string;
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
          style={{ width: `${Math.min(100, progress * 100)}%`, backgroundColor: tint }}>
          {playing && (
            <div className="absolute inset-y-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          )}
        </div>
        {playing && (
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-3 animate-halo rounded-full bg-off-white"
            style={{ left: `${Math.min(100, progress * 100)}%`, backgroundColor: tint }}
          />
        )}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-off-white shadow transition-colors duration-500"
          style={{ left: `${Math.min(100, progress * 100)}%`, backgroundColor: tint }}
        />
      </div>
    </div>
  );
}

function Ghost({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  // remounting on the tap counter is what replays the keyframes on every press
  const [tap, bump] = useState(0);
  return (
    <button
      aria-label={label}
      onPointerDown={() => bump(n => n + 1)}
      onClick={onClick}
      className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full text-near ring-1 ring-white/15 transition-[transform,background-color] duration-300 ease-spring active:scale-90 active:bg-white/20">
      {tap > 0 && (
        <span key={tap} className="pointer-events-none absolute inset-0 animate-ripple rounded-full text-off-white ring-2" />
      )}
      <span key={tap} className="grid animate-tap place-items-center">
        {children}
      </span>
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
      {/* the triangle's ink runs 8 to 20.5, so it is pulled back to sit centred with a hair of optical lead */}
      <path
        transform="translate(-1.6 0)"
        d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.7-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2Z"
      />
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
