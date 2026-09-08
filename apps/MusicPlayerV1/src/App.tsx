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
import { hdArtwork } from './hd-art';
import { useClock, type ClockParts } from './clock';
import { AUTO_PULSE_BPM, PULSE_BPM_MAX, PULSE_BPM_MIN, usePrefs, type Prefs } from './config';
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

  // the daemon's 512 shows immediately; the sharper copy replaces it when it arrives
  useEffect(() => {
    if (!prefs.hdArt || !track?.artist || !track?.album) return;
    let stale = false;
    hdArtwork(client, { artist: track.artist, album: track.album, title: track.title ?? null })
      .then(async url => {
        if (stale || !url) return;
        setArtUrl(url);
        // the sharper source also gives the palette more to work with
        const blob = await fetch(url).then(r => r.blob());
        if (!stale) setAccent(await accentFrom(blob));
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [client, prefs.hdArt, track?.artist, track?.album]);

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
      else if (e.key === 'ArrowLeft' || e.key === '1') client.player.skipPrev({ allowSeeking: true });
      else if (e.key === '2') toggle();
      else if (e.key === 'ArrowRight' || e.key === '3') client.player.skipNext();
      else if (e.key === '4') setPref('rotate', String((prefs.rotate + 90) % 360));
      // the button past the four presets; the launcher still owns five fast presses of it
      else if (e.key === 'm' || e.key === 'M') {
        const order: Prefs['theme'][] = ['card', 'vinyl', 'poster', 'widget'];
        setPref('theme', order[(order.indexOf(prefs.theme) + 1) % order.length]);
      }
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [client, duration, flashHud, live, panel, prefs.rotate, prefs.seekSeconds, prefs.theme, prefs.wheel, press, scrub, seek, setPref, toggle]);

  if (!track)
    return (
      <Stage rotate={prefs.rotate}>
        <Empty conn={conn} />
        <VolumeHud show={hud} volume={volume} accent={accentOn} />
      </Stage>
    );

  // the cover only runs to the edge in the style that draws a cover at all
  const edge = prefs.theme === 'card' && prefs.coverEdge;
  // a quarter turn lays the player out portrait, where a square cover cannot sit beside the track
  const upright = prefs.rotate === 90 || prefs.rotate === 270;

  return (
    <Stage rotate={prefs.rotate}>
    <div className="relative h-full w-full overflow-hidden bg-screen">
      {prefs.theme === 'widget' ? (
        <>
          <Backdrop url={artUrl} intensity={prefs.backdrop} drift={prefs.drift} />
          <Widget
            artUrl={artUrl}
            context={conn === 'open' ? (state?.context?.name ?? track.album ?? 'now playing') : conn}
            title={track.title ?? 'unknown'}
            artist={track.artist ?? '—'}
            accent={accentOn}
            playing={playing}
            motion={prefs.motion}
            seekStyle={seekStyle}
            rotate={prefs.rotate}
            upright={upright}
            progress={progress}
            elapsed={elapsed}
            duration={duration}
            remaining={prefs.remaining}
            volume={volume}
            wallClock={wallClock}
            clockPos={prefs.clockPos}
            clockSize={prefs.clockSize}
            onToggle={toggle}
            onPrev={() => client.player.skipPrev({ allowSeeking: true })}
            onNext={() => client.player.skipNext()}
            onSeek={ratio => seek(ratio * duration)}
            onVolume={level => client.audio.setVolume({ level })}
            onMute={() => client.audio.muteToggle()}
          />
        </>
      ) : prefs.theme === 'poster' ? (
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
          rotate={prefs.rotate}
          onToggle={toggle}
          onPrev={() => client.player.skipPrev({ allowSeeking: true })}
          onNext={() => client.player.skipNext()}
          onSeek={ratio => seek(ratio * duration)}
        />
      ) : (
        <>
          <Backdrop url={artUrl} intensity={prefs.backdrop} drift={prefs.drift} />

          <div
            className={`relative flex h-full w-full items-stretch gap-7 ${upright ? 'flex-col' : ''} ${
              upright
                ? // portrait drops the transport to the bottom edge, which needs more room than the sides
                  `pb-12 ${edge ? 'px-0 pt-0' : 'px-7 pt-7'}`
                : edge
                  ? 'py-0 pr-7 pl-0'
                  : 'p-7'
            }`}>
            {prefs.theme === 'vinyl' ? (
              <Turntable artUrl={artUrl} playing={playing} spin={prefs.motion} upright={upright} />
            ) : (
              <div className={`relative aspect-square ${upright ? 'w-full min-h-0 shrink' : 'h-full shrink-0'}`}>
                {!edge && <div className="absolute inset-x-4 bottom-0 h-10 rounded-full bg-black/70 blur-2xl" />}
                {accentOn && prefs.motion && prefs.pulse && (
                  <div
                    className={`cover-pulse pointer-events-none absolute inset-0 ${edge ? '' : 'rounded-2xl'}`}
                    style={{
                      boxShadow: `0 0 0 1.5px ${accentOn.soft}, 0 0 38px 5px ${accentOn.fill}`,
                      ['--pulse-duration' as string]: `${Math.round(60000 / (prefs.pulseBpm || AUTO_PULSE_BPM))}ms`,
                    }}
                  />
                )}
                {artUrl ? (
                  <img
                    src={artUrl}
                    alt=""
                    className={`relative h-full w-full object-cover ${
                      edge ? '' : 'rounded-2xl shadow-2xl ring-1 ring-white/12'
                    }`}
                  />
                ) : (
                  <div
                    className={`relative grid h-full w-full place-items-center bg-white/6 ${
                      edge ? '' : 'rounded-2xl ring-1 ring-white/12'
                    }`}>
                    <Disc className="h-16 w-16 text-off-white/25" />
                  </div>
                )}
              </div>
            )}

            <div
              className={`flex min-w-0 flex-1 flex-col ${upright ? 'w-full' : 'h-full'} ${
                edge ? (upright ? 'px-7' : 'py-7') : ''
              }`}>
              <div className={`flex min-h-5 items-center ${JUSTIFY[prefs.clockPos]}`}>
                <ClockView
                  parts={wallClock}
                  size={(11 * prefs.clockSize) / 100}
                  className="text-dim"
                  color={accentOn?.soft}
                />
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
                  rotate={prefs.rotate}
                  progress={progress}
                  playing={playing && prefs.motion}
                  tint={accentOn?.fill ?? '#efefef'}
                  tint2={accentOn?.fill2 ?? '#efefef'}
                  onSeek={ratio => seek(ratio * duration)}
                />
                <div className="mt-2.5 flex justify-between font-mono text-hint tabular-nums text-dim">
                  <span>{clock(elapsed)}</span>
                  <span>{duration ? (prefs.remaining ? `-${clock(duration - elapsed)}` : clock(duration)) : '--:--'}</span>
                </div>

                <div className="mt-8 flex items-center justify-center gap-12">
                  <Ghost label="previous" onClick={() => client.player.skipPrev({ allowSeeking: true })}>
                    <Skip className="h-10 w-10 -scale-x-100" />
                  </Ghost>
                  <Ghost label={playing ? 'pause' : 'play'} tint={accentOn?.fill} onClick={toggle}>
                    <span key={playing ? 'pause' : 'play'} className="grid animate-pop place-items-center">
                      {playing ? <Pause className="h-11 w-11" /> : <Play className="h-11 w-11" />}
                    </span>
                  </Ghost>
                  <Ghost label="next" onClick={() => client.player.skipNext()}>
                    <Skip className="h-10 w-10" />
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
      {panel && <Panel client={client} prefs={prefs} setPref={setPref} accent={accentOn} artUrl={artUrl} />}
    </div>
    </Stage>
  );
}

// the screen never resizes, so a quarter turn is laid out at the swapped size and rotated into place;
// the strip left either side is dead space, which is why 90 and 270 cost the player its width
function Stage({ rotate, children }: { rotate: Prefs['rotate']; children: ReactNode }) {
  const quarter = rotate === 90 || rotate === 270;
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
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

// the stage is turned with a css transform, so a drag reads along the axis the bar lies on for the
// viewer, not the one it lies on in the layout
function alongBar(e: PointerEvent<HTMLDivElement>, rotate: Prefs['rotate']) {
  const box = e.currentTarget.getBoundingClientRect();
  const ratio =
    rotate === 90
      ? (e.clientY - box.top) / box.height
      : rotate === 180
        ? (box.right - e.clientX) / box.width
        : rotate === 270
          ? (box.bottom - e.clientY) / box.height
          : (e.clientX - box.left) / box.width;
  return Math.min(1, Math.max(0, ratio));
}

const ENUMS: Record<string, { values: string[]; labels: string[] }> = {
  theme: { values: ['card', 'vinyl', 'poster', 'widget'], labels: ['Cover', 'Vinyl', 'Poster', 'Widget'] },
  wheel: { values: ['volume', 'seek'], labels: ['Volume', 'Scrub'] },
  seek: { values: ['auto', 'bar', 'wave'], labels: ['Auto', 'Bar', 'Wave'] },
  clockPos: { values: ['left', 'center', 'right'], labels: ['Left', 'Centre', 'Right'] },
  clockFormat: { values: ['auto', 'h12', 'h24'], labels: ['Auto', '12h', '24h'] },
  accent: { values: ['artwork', 'mono'], labels: ['Album art', 'White'] },
  rotate: { values: ['0', '90', '180', '270'], labels: ['0°', '90°', '180°', '270°'] },
};

const NUMERIC: Record<string, { min: number; max: number; step: number; suffix: string; auto?: number }> = {
  seekSeconds: { min: 1, max: 30, step: 1, suffix: 's' },
  backdrop: { min: 0, max: 100, step: 10, suffix: '%' },
  drift: { min: 0, max: 100, step: 10, suffix: '%' },
  clockSize: { min: 70, max: 200, step: 10, suffix: '%' },
  pulseBpm: { min: PULSE_BPM_MIN, max: PULSE_BPM_MAX, step: 5, suffix: '', auto: 0 },
};

// grouped so a related pair reads together rather than as nine unrelated lines
type Row = { key: keyof Prefs; label: string; only?: Prefs['theme'][] };

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Player',
    rows: [
      { key: 'theme', label: 'Player style' },
      { key: 'coverEdge', label: 'Cover to the edge', only: ['card'] },
      { key: 'accent', label: 'Accent colour' },
      { key: 'hdArt', label: 'HD album art' },
      { key: 'pulse', label: 'Cover pulse', only: ['card'] },
      { key: 'pulseBpm', label: 'Pulse tempo', only: ['card'] },
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
      { key: 'backdrop', label: 'Intensity', only: ['card', 'vinyl', 'widget'] },
      { key: 'drift', label: 'Drift', only: ['card', 'vinyl', 'widget'] },
    ],
  },
  {
    title: 'Display',
    rows: [
      { key: 'motion', label: 'Animations' },
      { key: 'rotate', label: 'Screen rotation' },
      { key: 'remaining', label: 'Show time remaining', only: ['card', 'vinyl', 'widget'] },
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
  artUrl,
}: {
  client: BridgethingClient;
  prefs: Prefs;
  setPref: (key: keyof Prefs, value: string) => void;
  accent: Accent | null;
  artUrl: string | null;
}) {
  // the pixel size is what tells you whether the sharper lookup actually landed
  const [artPx, setArtPx] = useState<string | null>(null);
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
      const current = value as number;
      const isAuto = numeric.auto !== undefined && current === numeric.auto;
      const less = () =>
        numeric.auto !== undefined && current <= numeric.min
          ? numeric.auto
          : Math.max(numeric.min, current - numeric.step);
      const more = () => (isAuto ? numeric.min : Math.min(numeric.max, current + numeric.step));
      return (
        <div className="flex shrink-0 items-center gap-3">
          <Step label="less" onClick={() => setPref(key, String(less()))}>
            −
          </Step>
          <span className="w-20 text-center font-mono text-title tabular-nums" style={{ color: tint }}>
            {isAuto ? 'Auto' : `${current}${numeric.suffix}`}
          </span>
          <Step label="more" onClick={() => setPref(key, String(more()))}>
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

      {artUrl && (
        <div className="mt-3 flex shrink-0 items-center gap-4">
          <img
            src={artUrl}
            alt=""
            onLoad={e => setArtPx(`${e.currentTarget.naturalWidth} x ${e.currentTarget.naturalHeight}`)}
            className="h-20 w-20 rounded-xl object-cover ring-1 ring-white/12"
          />
          <div className="min-w-0">
            <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Cover</div>
            <div className="font-mono text-row tabular-nums" style={{ color: tint }}>
              {artPx ?? '...'}
            </div>
            <div className="text-hint text-dim">{prefs.hdArt ? 'HD lookup on' : 'device copy only'}</div>
          </div>
        </div>
      )}

      <div
        ref={list}
        className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-width:none]">
        {GROUPS.map(group => ({ ...group, rows: group.rows.filter(r => !r.only || r.only.includes(prefs.theme)) }))
          .filter(group => group.rows.length > 0)
          .map((group, gi) => (
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
function Turntable({
  artUrl,
  playing,
  spin,
  upright,
}: {
  artUrl: string | null;
  playing: boolean;
  spin: boolean;
  upright: boolean;
}) {
  return (
    <div className={`relative aspect-square shrink-0 ${upright ? 'h-[52%] self-center' : 'h-full'}`}>
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
  rotate,
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
  rotate: Prefs['rotate'];
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
  const tint2 = accent?.soft2 ?? '#f2f4f6';
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
        <ClockView parts={wallClock} size={(12 * clockSize) / 100} className="text-off-white/75" color={tint} />
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

        <Seek
          style={seekStyle}
          rotate={rotate}
          progress={progress}
          playing={playing && motion}
          tint={tint}
          tint2={tint2}
          onSeek={onSeek}
        />

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
// the phone lock screen card: art above, then the track, a bar with the times either side, the
// transport and a volume slider. the arrangement never changes; only the frame around it does.
// landscape floats it as a narrow card over the blurred art, because stacking six rows is the whole
// look and a full width version of it would just be the Cover style again
function Widget({
  artUrl,
  context,
  title,
  artist,
  accent,
  playing,
  motion,
  seekStyle,
  rotate,
  upright,
  progress,
  elapsed,
  duration,
  remaining,
  volume,
  wallClock,
  clockPos,
  clockSize,
  onToggle,
  onPrev,
  onNext,
  onSeek,
  onVolume,
  onMute,
}: {
  artUrl: string | null;
  context: string;
  title: string;
  artist: string;
  accent: Accent | null;
  playing: boolean;
  motion: boolean;
  seekStyle: 'bar' | 'wave';
  rotate: Prefs['rotate'];
  upright: boolean;
  progress: number;
  elapsed: number;
  duration: number;
  remaining: boolean;
  volume: Volume | null;
  wallClock: ClockParts | null;
  clockPos: 'left' | 'center' | 'right';
  clockSize: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (ratio: number) => void;
  onVolume: (level: number) => void;
  onMute: () => void;
}) {
  const tint = accent?.fill ?? '#efefef';
  const tint2 = accent?.fill2 ?? '#efefef';
  const level = volume ? (volume.muted ? 0 : volume.level) : 0;
  // the card is 280px wide against a 480px tall screen, so every row it holds has to come down a size
  const small = !upright;

  const stack = (
    <>
      <div
        className={`relative aspect-square w-full min-h-0 shrink overflow-hidden bg-white/6 shadow-2xl ring-1 ring-white/10 ${
          small ? 'rounded-2xl' : 'rounded-[22px]'
        }`}>
        {artUrl ? (
          <img src={artUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Disc className={`text-off-white/25 ${small ? 'h-10 w-10' : 'h-16 w-16'}`} />
          </div>
        )}
      </div>

      {wallClock && (
        <div className={`flex shrink-0 ${JUSTIFY[clockPos]}`}>
          <ClockView
            parts={wallClock}
            size={((small ? 9 : 11) * clockSize) / 100}
            className="text-dim"
            color={accent?.soft}
          />
        </div>
      )}

      <div className="min-w-0 shrink-0">
        <div className="mb-1 truncate font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">{context}</div>
        <Roll
          text={title}
          className={`font-display leading-[1.2] font-semibold tracking-display text-off-white ${
            small ? 'text-[1.375rem]' : 'text-[1.875rem]'
          }`}
        />
        <Roll text={artist} className={`mt-0.5 text-soft ${small ? 'text-row-lg' : 'text-title'}`} />
      </div>

      {/* the times sit either side of the bar rather than under it, which is the whole look */}
      <div className="flex shrink-0 items-center gap-2.5 font-mono text-hint tabular-nums text-dim">
        <span className={`shrink-0 ${small ? 'w-9' : 'w-11'}`}>{clock(elapsed)}</span>
        <div className="min-w-0 flex-1">
          <Seek
            style={seekStyle}
            rotate={rotate}
            progress={progress}
            playing={playing && motion}
            tint={tint}
            tint2={tint2}
            onSeek={onSeek}
          />
        </div>
        <span className={`shrink-0 text-right ${small ? 'w-9' : 'w-11'}`}>
          {duration ? (remaining ? `-${clock(duration - elapsed)}` : clock(duration)) : '--:--'}
        </span>
      </div>

      <div className={`flex shrink-0 items-center justify-center ${small ? 'gap-6' : 'gap-10'}`}>
        <Ghost label="previous" onClick={onPrev}>
          <Skip className={`-scale-x-100 ${small ? 'h-6 w-6' : 'h-8 w-8'}`} />
        </Ghost>
        <Ghost label={playing ? 'pause' : 'play'} tint={accent?.fill} onClick={onToggle}>
          <span key={playing ? 'pause' : 'play'} className="grid animate-pop place-items-center">
            {playing ? (
              <Pause className={small ? 'h-7 w-7' : 'h-9 w-9'} />
            ) : (
              <Play className={small ? 'h-7 w-7' : 'h-9 w-9'} />
            )}
          </span>
        </Ghost>
        <Ghost label="next" onClick={onNext}>
          <Skip className={small ? 'h-6 w-6' : 'h-8 w-8'} />
        </Ghost>
        {/* the device has no output picker, so the slot that holds one on a phone toggles mute */}
        <Ghost label={volume?.muted ? 'unmute' : 'mute'} onClick={onMute}>
          <Speaker className={small ? 'h-5 w-5' : 'h-7 w-7'} muted={volume?.muted === true} />
        </Ghost>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <Speaker className="h-3.5 w-3.5 shrink-0 text-dim" />
        <div className="min-w-0 flex-1">
          <VolumeBar level={level} rotate={rotate} tint={tint} onPick={onVolume} />
        </div>
        <Speaker className="h-[18px] w-[18px] shrink-0 text-dim" />
      </div>
    </>
  );

  if (upright) return <div className="relative flex h-full w-full flex-col gap-4 p-7">{stack}</div>;

  return (
    <div className="relative grid h-full w-full place-items-center">
      <div className="flex h-[95%] w-[245px] flex-col justify-center gap-2.5 rounded-[26px] bg-black/45 p-4 ring-1 ring-white/10 backdrop-blur-2xl">
        {stack}
      </div>
    </div>
  );
}

// the same drag as the seek rail, against the daemon's volume rather than the track position
function VolumeBar({
  level,
  rotate,
  tint,
  onPick,
}: {
  level: number;
  rotate: Prefs['rotate'];
  tint: string;
  onPick: (level: number) => void;
}) {
  const pick = (e: PointerEvent<HTMLDivElement>) => onPick(alongBar(e, rotate));
  return (
    <div
      className="group -my-3 flex h-6 w-full cursor-pointer items-center py-3"
      onPointerDown={pick}
      onPointerMove={e => e.buttons === 1 && pick(e)}>
      <div className="relative h-[5px] w-full rounded-full bg-white/18">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, level)) * 100)}%`, backgroundColor: tint }}
        />
      </div>
    </div>
  );
}

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
  rotate,
  progress,
  playing,
  tint,
  tint2,
  onSeek,
}: {
  rotate: Prefs['rotate'];
  progress: number;
  playing: boolean;
  tint: string;
  tint2: string;
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
  const pick = (e: PointerEvent<HTMLDivElement>) => onSeek(alongBar(e, rotate));

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
          <linearGradient id="wave-tint" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={Math.max(1, width)} y2="0">
            <stop offset="0%" stopColor={tint} />
            <stop offset="100%" stopColor={tint2} />
          </linearGradient>
        </defs>
        <g clipPath="url(#wave-played)">
          <path
            className="wave-travel"
            style={{
              ['--wave-step' as string]: `${WAVE_LENGTH}px`,
              animationPlayState: playing ? 'running' : 'paused',
            }}
            d={wavePath(-WAVE_LENGTH, played + WAVE_LENGTH, mid)}
            stroke="url(#wave-tint)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
        <rect x={played - 1.5} y={mid - 9} width="3" height="18" rx="1.5" fill={tint2} />
      </svg>
    </div>
  );
}

function Seek({
  style,
  rotate,
  progress,
  playing,
  tint,
  tint2,
  onSeek,
}: {
  style: 'bar' | 'wave';
  rotate: Prefs['rotate'];
  progress: number;
  playing: boolean;
  tint: string;
  tint2: string;
  onSeek: (ratio: number) => void;
}) {
  return style === 'wave' ? (
    <Wave rotate={rotate} progress={progress} playing={playing} tint={tint} tint2={tint2} onSeek={onSeek} />
  ) : (
    <Rail rotate={rotate} progress={progress} playing={playing} tint={tint} tint2={tint2} onSeek={onSeek} />
  );
}

const JUSTIFY: Record<'left' | 'center' | 'right', string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

// the colon is its own element so it can blink without the digits reflowing
function ClockView({
  parts,
  size,
  className,
  color,
}: {
  parts: ClockParts | null;
  size: number;
  className?: string;
  color?: string;
}) {
  if (!parts) return null;
  const colon = (
    <span className="transition-opacity duration-150" style={{ opacity: parts.colon ? 1 : 0.2 }}>
      :
    </span>
  );
  return (
    <span
      className={`shrink-0 font-mono tabular-nums transition-colors duration-500 ${className ?? ''}`}
      style={{ fontSize: `${size}px`, color }}>
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
  rotate,
  progress,
  playing,
  tint,
  tint2,
  onSeek,
}: {
  rotate: Prefs['rotate'];
  progress: number;
  playing: boolean;
  tint: string;
  tint2: string;
  onSeek: (ratio: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // the gradient spans the whole track, so its colours do not slide as the played length grows
  useEffect(() => {
    if (!track.current) return;
    const measure = () => track.current && setWidth(track.current.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track.current);
    return () => observer.disconnect();
  }, []);
  const pick = (e: PointerEvent<HTMLDivElement>) => onSeek(alongBar(e, rotate));
  return (
    <div
      className="group -my-3 flex h-6 w-full cursor-pointer items-center py-3"
      onPointerDown={pick}
      onPointerMove={e => e.buttons === 1 && pick(e)}>
      <div ref={track} className="relative h-[3px] w-full rounded-full bg-white/18">
        <div
          className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
          style={{ width: `${Math.min(100, progress * 100)}%` }}>
          <div
            className="absolute inset-y-0 left-0 transition-[background] duration-500"
            style={{
              width: width ? `${width}px` : '100%',
              background: `linear-gradient(90deg, ${tint}, ${tint2})`,
            }}
          />
          {playing && (
            <div className="absolute inset-y-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          )}
        </div>
        {playing && (
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-3 animate-halo rounded-full bg-off-white"
            style={{ left: `${Math.min(100, progress * 100)}%`, backgroundColor: tint2 }}
          />
        )}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-off-white shadow transition-colors duration-500"
          style={{ left: `${Math.min(100, progress * 100)}%`, backgroundColor: tint2 }}
        />
      </div>
    </div>
  );
}

function Ghost({
  label,
  tint,
  onClick,
  children,
}: {
  label: string;
  tint?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  // remounting on the tap counter is what replays the keyframes on every press
  const [tap, bump] = useState(0);
  return (
    <button
      aria-label={label}
      onPointerDown={() => bump(n => n + 1)}
      onClick={onClick}
      // the padding is the only hit area a bare glyph has, and the negative margin keeps it off the layout
      style={tint ? { color: tint } : undefined}
      className="-m-3 shrink-0 p-3 text-off-white transition-[transform,color] duration-300 ease-spring active:scale-90">
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
      <rect x="5.5" y="3.5" width="4.6" height="17" rx="0.9" />
      <rect x="13.9" y="3.5" width="4.6" height="17" rx="0.9" />
    </svg>
  );
}

// two solid triangles rather than a triangle and a bar: the pair reads as scan at a glance, and the
// mirrored copy is what draws previous
function Skip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M1.6 5.6v12.8a0.9 0.9 0 0 0 1.38.76l9.6-6.4a0.9 0.9 0 0 0 0-1.52l-9.6-6.4a0.9 0.9 0 0 0-1.38.76Z" />
      <path d="M11.4 5.6v12.8a0.9 0.9 0 0 0 1.38.76l9.6-6.4a0.9 0.9 0 0 0 0-1.52l-9.6-6.4a0.9 0.9 0 0 0-1.38.76Z" />
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
