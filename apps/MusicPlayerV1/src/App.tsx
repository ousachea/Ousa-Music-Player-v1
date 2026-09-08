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
import { explicitFor, hdArtwork } from './hd-art';
import { activeIndex, useLyrics } from './lyrics';
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
// long enough that the note is not the first thing a track does, short enough to still be about it
const TIP_DELAY_MS = 6000;
const WHEEL_SCROLL_PX = 26;
// how long a browsed lyric view stays put before it goes back to following the song
const LYRIC_BROWSE_MS = 5000;
// how long the blurred art takes to dissolve from one track to the next
const BACKDROP_FADE_MS = 700;
// a swipe has to travel this far, and stay flat enough, to count as one rather than a stray drag
const SWIPE_MIN_PX = 70;
const SWIPE_MAX_DRIFT = 0.7;

type Volume = { level: number; muted: boolean };

// the rotary reports a horizontal delta and nothing vertical. a trackpad almost never does, so
// requiring the horizontal to dominate is what separates a turn of the wheel from a two finger scroll
function turned(e: WheelEvent) {
  return e.deltaX !== 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY);
}

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
  const [tip, setTip] = useState(false);
  const [tipAgain, setTipAgain] = useState(true);
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
  // Cover is drawn after a lock screen, which has a plain line and no room for a wave, so it keeps
  // one whatever the seek setting says; every other style honours the choice
  const seekStyle =
    prefs.theme === 'widget' ? 'bar' : prefs.seek === 'auto' ? (prefs.theme === 'poster' ? 'wave' : 'bar') : prefs.seek;
  const seekDot = prefs.seekDot === 'auto' ? prefs.theme !== 'widget' : prefs.seekDot === 'on';
  const ownsVolume = prefs.theme === 'widget' && prefs.coverVolume;
  // a quarter turn lays the player out portrait, where a square cover cannot sit beside the track
  const upright = prefs.rotate === 90 || prefs.rotate === 270;
  const track = state?.track ?? null;
  const [foundArtist, setFoundArtist] = useState<string | null>(null);
  const [explicit, setExplicit] = useState(false);
  const artistName = track?.artist ?? foundArtist;
  const lyrics = useLyrics(client, prefs.theme === 'lyrics' ? (track?.persistentId ?? track?.title ?? null) : null);
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
    if (!prefs.hdArt || !track?.album) return;
    let stale = false;
    setFoundArtist(null);
    hdArtwork(client, { artist: track.artist ?? null, album: track.album, title: track.title ?? null })
      .then(async found => {
        if (stale || !found) return;
        setArtUrl(found.url);
        if (found.artist) setFoundArtist(found.artist);
        // the sharper source also gives the palette more to work with
        const blob = await fetch(found.url).then(r => r.blob());
        if (!stale) setAccent(await accentFrom(blob));
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [client, prefs.hdArt, track?.artist, track?.album]);

  useEffect(() => setBrowse(0), [track?.persistentId, track?.title, prefs.theme]);

  useEffect(() => {
    setExplicit(false);
    if (!prefs.hdArt || !track?.title) return;
    let stale = false;
    explicitFor(client, { artist: track.artist ?? null, title: track.title })
      .then(flag => {
        if (!stale && flag) setExplicit(true);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [client, prefs.hdArt, track?.artist, track?.title]);

  useEffect(() => {
    if (!prefs.tip || !prefs.transport || !track) return;
    const id = setTimeout(() => setTip(true), TIP_DELAY_MS);
    return () => clearTimeout(id);
  }, [prefs.tip, prefs.transport, track]);

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
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  // lines away from the one being sung, while the wheel is being used to read ahead or back
  const [browse, setBrowse] = useState(0);
  const browseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // a track can also change on its own when one ends, which counts as going forward
  const skipDir = useRef<'next' | 'prev'>('next');
  const goNext = useCallback(() => {
    skipDir.current = 'next';
    client.player.skipNext();
  }, [client]);
  const goPrev = useCallback(
    (allowSeeking: boolean) => {
      skipDir.current = 'prev';
      client.player.skipPrev({ allowSeeking });
    },
    [client],
  );

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
      else if (count === 2) goNext();
      // a triple press means the previous track, never a restart of this one
      else goPrev(false);
    }, MULTI_CLICK_MS);
  }, [client, toggle]);

  useEffect(() => {
    // both modes go through the same detent gate, so a click means the same amount either way
    const onWheel = (e: WheelEvent) => {
      if (panel || !turned(e)) return;
      detents.current += e.deltaX;
      const steps = Math.trunc(detents.current / WHEEL_PER_STEP);
      if (!steps) return;
      detents.current -= steps * WHEEL_PER_STEP;
      const count = Math.min(Math.abs(steps), MAX_STEPS_PER_EVENT);

      // in Lyrics the wheel belongs to the words: a detent is a line, and landing on one plays from
      // it. that is worth more than volume here, so it takes the wheel whatever the setting says
      if (prefs.theme === 'lyrics' && lyrics.state === 'timed') {
        // the wheel reads, it does not scrub: the song keeps playing and the view comes back on its own
        const at = Math.max(0, activeIndex(lyrics.lines, scrub ?? live));
        setBrowse(b => {
          const next = b + Math.sign(steps) * count;
          return Math.min(lyrics.lines.length - 1 - at, Math.max(-at, next));
        });
        if (browseTimer.current) clearTimeout(browseTimer.current);
        browseTimer.current = setTimeout(() => setBrowse(0), LYRIC_BROWSE_MS);
        return;
      }
      if (prefs.theme === 'lyrics' && lyrics.state === 'plain') {
        const page = document.querySelector<HTMLElement>('[data-lyric-page]');
        if (page) page.scrollTop += e.deltaX * WHEEL_SCROLL_PX;
        return;
      }

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
      else if (e.key === 'ArrowLeft' || e.key === '1') goPrev(true);
      else if (e.key === '2') toggle();
      else if (e.key === 'ArrowRight' || e.key === '3') goNext();
      else if (e.key === '4') setPref('rotate', String((prefs.rotate + 90) % 360));
      // the button past the four presets; the launcher still owns five fast presses of it. no button
      // sends 5, so it costs the device nothing and gives a keyboard the same thing in reach
      else if (e.key === 'm' || e.key === 'M' || e.key === '5') {
        const order: Prefs['theme'][] = ['widget', 'vinyl', 'cd', 'poster', 'lyrics'];
        setPref('theme', order[(order.indexOf(prefs.theme) + 1) % order.length]);
      }
    };
    // a flick across the screen skips a track. the seek bar and the buttons take their own pointer
    // events first, so a swipe only ever starts on the artwork or the empty parts of the layout
    // the origin lives in a ref because this effect re-registers on every progress tick, and a
    // local would be wiped between the press and the release
    const onDown = (e: globalThis.PointerEvent) => {
      if (panel) return;
      swipeFrom.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: globalThis.PointerEvent) => {
      const from = swipeFrom.current;
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      swipeFrom.current = null;
      // upright the screen is turned, so the swipe the viewer makes arrives on the other axis
      const along = upright ? dy : dx;
      const across = upright ? dx : dy;
      if (Math.abs(along) < SWIPE_MIN_PX) return;
      if (Math.abs(across) > Math.abs(along) * SWIPE_MAX_DRIFT) return;
      // swiping the artwork away to the left brings the next track in behind it, as on a phone
      const back = prefs.rotate === 180 || prefs.rotate === 270 ? along < 0 : along > 0;
      if (back) goPrev(true);
      else goNext();
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    const onCancel = () => {
      swipeFrom.current = null;
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [client, duration, flashHud, live, lyrics, panel, prefs.rotate, prefs.seekSeconds, prefs.theme, prefs.wheel, press, scrub, seek, setPref, toggle, upright]);

  if (!track)
    return (
      <Stage rotate={prefs.rotate}>
        <Empty conn={conn} />
        <VolumeHud show={hud} volume={volume} accent={accentOn} />
      </Stage>
    );

  // the cover only runs to the edge in the style that draws a cover at all
  const edge = prefs.theme === 'widget' && prefs.coverEdge;

  return (
    <Stage rotate={prefs.rotate}>
    <div className="relative h-full w-full overflow-hidden bg-screen">
      {/* outside the keyed wrapper: inside it, every track change tore the blurred art down and
          built it again, which showed as a flash while the new one decoded */}
      {prefs.theme !== 'poster' && <Backdrop url={artUrl} intensity={prefs.backdrop} drift={prefs.drift} blur={prefs.blur} />}

      <div
        key={track.persistentId ?? track.title ?? ''}
        className={`relative h-full w-full ${
          !prefs.motion
            ? ''
            : prefs.theme === 'cd' || prefs.theme === 'vinyl'
              ? 'skip-fade'
              : skipDir.current === 'prev'
                ? 'skip-prev'
                : 'skip-next'
        }`}>
      {prefs.theme === 'lyrics' ? (
        <Lyrics
          lyrics={lyrics}
          elapsed={elapsed}
          artUrl={artUrl}
          title={track.title ?? 'unknown'}
          artist={artistName ?? '—'}
          accent={accentOn}
          motion={prefs.motion}
          upright={upright}
          offset={browse}
          words={prefs.words}
          onWords={() => setPref('words', prefs.words ? 'false' : 'true')}
          corner={prefs.lyricsInfo}
          playing={playing}
          showTransport={prefs.transport}
          onToggle={toggle}
          onPrev={() => goPrev(true)}
          onNext={() => goNext()}
          onSeekMs={ms => {
            // the column parks at the sung line plus however far the wheel has read ahead. seeking
            // to a line makes it the sung one, so the offset has to go or the view lands past it
            setBrowse(0);
            if (browseTimer.current) clearTimeout(browseTimer.current);
            seek(ms);
          }}
        />
      ) : prefs.theme === 'cd' ? (
        <>
          <CdDeck
            artUrl={artUrl}
            context={conn === 'open' ? (state?.context?.name ?? track.album ?? 'now playing') : conn}
            title={track.title ?? 'unknown'}
            artist={artistName ?? '—'}
            explicit={explicit}
            accent={accentOn}
            playing={playing}
            motion={prefs.motion}
            rotate={prefs.rotate}
            upright={upright}
            showTransport={prefs.transport}
            progress={progress}
            elapsed={elapsed}
            duration={duration}
            remaining={prefs.remaining}
            wallClock={wallClock}
            clockSize={prefs.clockSize}
            onToggle={toggle}
            onPrev={() => goPrev(true)}
            onNext={() => goNext()}
            onSeek={ratio => seek(ratio * duration)}
          />
        </>
      ) : prefs.theme === 'widget' ? (
        <>
          <Widget
            artUrl={artUrl}
            context={conn === 'open' ? (state?.context?.name ?? track.album ?? 'now playing') : conn}
            title={track.title ?? 'unknown'}
            artist={artistName ?? '—'}
            explicit={explicit}
            accent={accentOn}
            playing={playing}
            motion={prefs.motion}
            seekStyle={seekStyle}
            rotate={prefs.rotate}
            dot={seekDot}
            showTransport={prefs.transport}
            edge={edge}
            panel={prefs.coverPanel}
            showVolume={prefs.coverVolume}
            pulse={prefs.motion && prefs.pulse}
            pulseMs={Math.round(60000 / (prefs.pulseBpm || AUTO_PULSE_BPM))}
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
            onPrev={() => goPrev(true)}
            onNext={() => goNext()}
            onSeek={ratio => seek(ratio * duration)}
            onVolume={level => {
              // reaching for the slider means you want sound, so a muted device comes back first
              if (volume?.muted) client.audio.muteToggle();
              client.audio.setVolume({ level });
            }}
          />
        </>
      ) : prefs.theme === 'poster' ? (
        <Poster
          artUrl={artUrl}
          context={conn === 'open' ? (state?.context?.name ?? track.album ?? 'now playing') : conn}
          title={track.title ?? 'unknown'}
          artist={artistName ?? '—'}
          explicit={explicit}
          accent={accentOn}
          playing={playing}
          motion={prefs.motion}
          seekStyle={seekStyle}
          dot={seekDot}
          showTransport={prefs.transport}
          progress={progress}
          elapsed={elapsed}
          duration={duration}
          wallClock={wallClock}
          clockPos={prefs.clockPos}
          clockSize={prefs.clockSize}
          rotate={prefs.rotate}
          onToggle={toggle}
          onPrev={() => goPrev(true)}
          onNext={() => goNext()}
          onSeek={ratio => seek(ratio * duration)}
        />
      ) : (
        <>

          <div
            className={`relative flex h-full w-full items-stretch gap-7 ${upright ? 'flex-col' : ''} ${
              upright
                ? // portrait drops the transport to the bottom edge, which needs more room than the sides
                  `pb-12 ${edge ? 'px-0 pt-0' : 'px-7 pt-7'}`
                : edge
                  ? 'py-0 pr-7 pl-0'
                  : 'p-7'
            }`}>
            <Turntable
              artUrl={artUrl}
              playing={playing}
              spin={prefs.motion}
              upright={upright}
              roomy={!prefs.transport}
            />

            <div
              className={`flex min-w-0 flex-1 flex-col justify-between gap-2 ${upright ? 'w-full' : 'h-full'} ${
                edge ? (upright ? 'px-7' : 'py-7') : ''
              }`}>
              <div
                className={`flex items-center ${upright && !prefs.transport ? '' : 'min-h-5'} ${
                  JUSTIFY[prefs.clockPos]
                }`}>
                <ClockView
                  parts={wallClock}
                  size={(11 * prefs.clockSize) / 100}
                  className="text-dim"
                  color={accentOn?.soft}
                />
              </div>

              <div className="min-w-0 shrink-0">
                <div
                  className="mb-2 truncate font-mono text-eyebrow tracking-[0.22em] text-dim uppercase transition-colors duration-500"
                  style={accentOn ? { color: accentOn.soft } : undefined}>
                  {conn === 'open' ? (state?.context?.name ?? track.album ?? 'now playing') : conn}
                </div>
                <Roll
                  text={track.title ?? 'unknown'}
                  wrap={!prefs.transport}
                  className="font-display text-[2.125rem] leading-[1.2] font-semibold tracking-display text-off-white"
                />
                <div className="mt-2 flex min-w-0 items-center gap-2">
                  {explicit && <Explicit />}
                  <Roll text={artistName ?? '—'} wrap={!prefs.transport} lines={2} className="min-w-0 text-title text-soft" />
                </div>
              </div>

              <div className="shrink-0">
                <Seek
                  style={seekStyle}
                  rotate={prefs.rotate}
                  dot={seekDot}
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
              </div>

              {prefs.transport && (
              <div className="flex shrink-0 items-center justify-center gap-12">
                <Ghost label="previous" onClick={() => goPrev(true)}>
                  <Skip className="h-10 w-10 -scale-x-100" />
                </Ghost>
                <Ghost label={playing ? 'pause' : 'play'} tint={accentOn?.fill} onClick={toggle}>
                  <span key={playing ? 'pause' : 'play'} className="grid animate-pop place-items-center">
                    {playing ? <Pause className="h-11 w-11" /> : <Play className="h-11 w-11" />}
                  </span>
                </Ghost>
                <Ghost label="next" onClick={() => goNext()}>
                  <Skip className="h-10 w-10" />
                </Ghost>
              </div>
              )}
            </div>
          </div>
        </>
      )}

      </div>

      {prefs.notes && prefs.motion && <Notes accent={accentOn} playing={playing} />}

      {/* which style is on, small enough to ignore and low enough to clear the settings hint */}
      <div className="pointer-events-none absolute inset-x-0 bottom-1 z-[2] flex justify-center">
        <span className="font-mono text-[0.5625rem] tracking-[0.28em] text-dim uppercase opacity-60">
          {ENUMS.theme.labels[ENUMS.theme.values.indexOf(prefs.theme)]}
        </span>
      </div>
      {!prefs.transport && <PresetHint playing={playing} rotate={prefs.rotate} accent={accentOn} cue={track.persistentId ?? track.title ?? ''} />}

      <VolumeHud show={hud && !ownsVolume} volume={volume} accent={accentOn} />
      <div
        className={`pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-black/78 px-4 py-2.5 text-hint text-near ring-1 ring-white/12 backdrop-blur-md transition-opacity duration-500 ${
          hint && !panel ? 'opacity-100' : 'opacity-0'
        }`}>
        <BackGlyph className="h-3.5 w-3.5" />
        Press the button under the wheel for settings
      </div>
      {tip && !panel && (
        <Tip
          tint={accentOn?.fill ?? '#efefef'}
          again={tipAgain}
          onAgain={setTipAgain}
          onHide={() => {
            setPref('transport', 'false');
            if (!tipAgain) setPref('tip', 'false');
            setTip(false);
          }}
          onKeep={() => {
            if (!tipAgain) setPref('tip', 'false');
            setTip(false);
          }}
        />
      )}
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
  theme: { values: ['widget', 'vinyl', 'cd', 'poster', 'lyrics'], labels: ['Cover', 'Vinyl', 'CD', 'Poster', 'Lyrics'] },
  wheel: { values: ['volume', 'seek'], labels: ['Volume', 'Scrub'] },
  seek: { values: ['auto', 'bar', 'wave'], labels: ['Auto', 'Bar', 'Wave'] },
  seekDot: { values: ['auto', 'on', 'off'], labels: ['Auto', 'On', 'Off'] },
  clockPos: { values: ['left', 'center', 'right'], labels: ['Left', 'Centre', 'Right'] },
  clockFormat: { values: ['auto', 'h12', 'h24'], labels: ['Auto', '12h', '24h'] },
  accent: { values: ['artwork', 'mono'], labels: ['Album art', 'White'] },
  lyricsInfo: { values: ['tl', 'bl', 'tr', 'br'], labels: ['Top left', 'Bottom left', 'Top right', 'Bottom right'] },
  rotate: { values: ['0', '90', '180', '270'], labels: ['0°', '90°', '180°', '270°'] },
};

const NUMERIC: Record<string, { min: number; max: number; step: number; suffix: string; auto?: number }> = {
  seekSeconds: { min: 1, max: 30, step: 1, suffix: 's' },
  backdrop: { min: 0, max: 100, step: 10, suffix: '%' },
  blur: { min: 0, max: 100, step: 10, suffix: '%' },
  drift: { min: 0, max: 100, step: 10, suffix: '%' },
  clockSize: { min: 70, max: 200, step: 10, suffix: '%' },
  pulseBpm: { min: PULSE_BPM_MIN, max: PULSE_BPM_MAX, step: 5, suffix: '', auto: 0 },
};

// grouped so a related pair reads together rather than as nine unrelated lines
type Row = { key: keyof Prefs; label: string; only?: Prefs['theme'][] };

// rows that only some styles can use, kept together under the name of the style you are in
const STYLE_ROWS: Row[] = [
  { key: 'lyricsInfo', label: 'Track corner', only: ['lyrics'] },
  { key: 'words', label: 'Show the words', only: ['lyrics'] },
  { key: 'coverEdge', label: 'Art to the edge', only: ['widget'] },
  { key: 'coverPanel', label: 'Panel behind the track', only: ['widget'] },
  { key: 'coverVolume', label: 'Volume slider', only: ['widget'] },
  { key: 'pulse', label: 'Art pulse', only: ['widget'] },
  { key: 'pulseBpm', label: 'Pulse tempo', only: ['widget'] },
  { key: 'backdrop', label: 'Backdrop intensity', only: ['widget', 'vinyl', 'cd', 'lyrics'] },
  { key: 'blur', label: 'Backdrop blur', only: ['widget', 'vinyl', 'cd', 'lyrics'] },
  { key: 'drift', label: 'Backdrop drift', only: ['widget', 'vinyl', 'cd', 'lyrics'] },
  { key: 'remaining', label: 'Show time remaining', only: ['widget', 'vinyl', 'cd'] },
];

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Player',
    rows: [
      { key: 'accent', label: 'Accent colour' },
      { key: 'hdArt', label: 'HD album art' },
    ],
  },
  {
    title: 'Controls',
    rows: [
      { key: 'wheel', label: 'Rotary wheel' },
      { key: 'seekSeconds', label: 'Seek step' },
      { key: 'seek', label: 'Seek bar' },
      { key: 'seekDot', label: 'Dot at the playhead' },
      { key: 'transport', label: 'On-screen buttons' },
      { key: 'tip', label: 'Offer to hide them' },
    ],
  },
  {
    title: 'Display',
    rows: [
      { key: 'motion', label: 'Animations' },
      { key: 'notes', label: 'Floating notes' },
      { key: 'rotate', label: 'Screen rotation' },
    ],
  },
  {
    title: 'Clock',
    rows: [
      { key: 'clock', label: 'Show clock' },
      // CD pins its clock to the corner of the tray, so there is no position to choose there
      { key: 'clockPos', label: 'Position', only: ['widget', 'vinyl', 'poster'] },
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
  const upright = prefs.rotate === 90 || prefs.rotate === 270;
  const styleName = ENUMS.theme.labels[ENUMS.theme.values.indexOf(prefs.theme)] ?? 'Player';
  // the wheel scrolls this list and there is no scrollbar, so a rail has to say how far it runs
  const [scroll, setScroll] = useState({ shown: 1, at: 0 });
  const onScroll = useCallback(() => {
    const el = list.current;
    if (!el || el.scrollHeight <= el.clientHeight) return setScroll({ shown: 1, at: 0 });
    setScroll({
      shown: el.clientHeight / el.scrollHeight,
      at: el.scrollTop / (el.scrollHeight - el.clientHeight),
    });
  }, []);
  useEffect(onScroll, [onScroll, prefs.theme]);
  const tint = accent?.fill ?? '#efefef';
  const ink = accent?.ink ?? '#060809';
  const { state: update, check } = useUpdateCheck(client);
  const list = useRef<HTMLDivElement>(null);

  // the wheel drives volume everywhere else, but while this is open it belongs to the list
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      // a vertical scroll is the browser's to handle here; the list already scrolls itself
      if (!list.current || !turned(e)) return;
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
    <div
      className={`absolute inset-0 z-10 flex flex-col bg-screen/97 backdrop-blur-sm ${
        // the wide right margin keeps the rows clear of the wheel in landscape; turned, that edge is
        // the bottom of the screen and the column is only 480 wide, so it evens out instead
        upright ? 'p-5' : 'py-5 pl-8 pr-24'
      }`}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-hint tracking-[0.22em] text-dim uppercase">Settings</span>
        <span className="flex items-center gap-2 text-hint text-dim">
          <BackGlyph className="h-3.5 w-3.5" />
          the button under the wheel closes this
        </span>
      </div>

      {/* the style picker decides what the rest of the list holds, so it sits above it rather than
          scrolling away inside it */}
      <div className="mt-3 flex shrink-0 items-center gap-4">
        {artUrl && (
          <img
            src={artUrl}
            alt=""
            onLoad={e => setArtPx(`${e.currentTarget.naturalWidth} x ${e.currentTarget.naturalHeight}`)}
            className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-white/12"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Player style</span>
            {artPx && (
              <span className="truncate text-hint text-dim">
                art {artPx}
                {prefs.hdArt ? ', HD' : ''}
              </span>
            )}
          </div>
          {control('theme')}
        </div>
      </div>

      <div className="relative mt-3 flex min-h-0 flex-1">
      <div
        ref={list}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pl-4 [scrollbar-width:none]">
        {[{ title: styleName, rows: STYLE_ROWS, own: true }, ...GROUPS.map(g => ({ ...g, own: false }))]
          .map(group => ({ ...group, rows: group.rows.filter(r => !r.only || r.only.includes(prefs.theme)) }))
          .filter(group => group.rows.length > 0)
          .map((group, gi) => (
            <section key={group.title} className={gi === 0 ? '' : 'mt-6'}>
              <h2 className="mb-1 flex items-baseline gap-2 font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">
                {group.title}
                {group.own && <span className="tracking-normal normal-case opacity-60">only in this style</span>}
              </h2>
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

      {scroll.shown < 1 && (
        <div className="absolute top-0 bottom-0 left-0 w-[3px] rounded-full bg-white/8">
          <div
            className="absolute w-full rounded-full transition-[top] duration-100"
            style={{
              height: `${Math.max(12, scroll.shown * 100)}%`,
              top: `${scroll.at * (100 - Math.max(12, scroll.shown * 100))}%`,
              backgroundColor: tint,
              opacity: 0.55,
            }}
          />
        </div>
      )}
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
function Roll({ text, className, wrap, lines = 3 }: { text: string; className?: string; wrap?: boolean; lines?: number }) {
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

  // written out rather than built, so tailwind sees the class names and emits them
  const clamp = lines === 2 ? 'line-clamp-2' : lines === 4 ? 'line-clamp-4' : 'line-clamp-3';
  if (wrap) return <div className={`${clamp} ${className ?? ''}`}>{text}</div>;

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
  roomy,
}: {
  artUrl: string | null;
  playing: boolean;
  spin: boolean;
  upright: boolean;
  // with the transport hidden there is a row's worth of height going spare, and the record takes it
  roomy: boolean;
}) {
  return (
    <div
      className={`relative aspect-square shrink-0 ${spin ? 'disc-swap' : ''} ${
        upright ? `self-center ${roomy ? 'h-[56%]' : 'h-[52%]'}` : 'h-full'
      }`}>
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

// a cd sat in a dark tray: a mirrored disc, the track lettered across the bottom of it, and the
// album art as a small print in the corner the way a case carries it. the disc is plain chrome
// rather than the artwork, which is what a pressed disc actually looks like from the top
function CdDeck({
  artUrl,
  context,
  title,
  artist,
  explicit,
  accent,
  playing,
  motion,
  rotate,
  upright,
  showTransport,
  progress,
  elapsed,
  duration,
  remaining,
  wallClock,
  clockSize,
  onToggle,
  onPrev,
  onNext,
  onSeek,
}: {
  artUrl: string | null;
  context: string;
  title: string;
  artist: string;
  explicit: boolean;
  accent: Accent | null;
  playing: boolean;
  motion: boolean;
  rotate: Prefs['rotate'];
  upright: boolean;
  showTransport: boolean;
  progress: number;
  elapsed: number;
  duration: number;
  remaining: boolean;
  wallClock: ClockParts | null;
  clockSize: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (ratio: number) => void;
}) {
  const tint = accent?.fill ?? '#efefef';

  const tray = (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[28px] shadow-2xl ring-1 ring-white/8 ${
        upright ? 'aspect-square w-full' : 'aspect-square h-full'
      }`}
      style={{
        // the tray takes a dark wash of the album's own colour rather than a flat grey
        background: accent
          ? `linear-gradient(155deg, color-mix(in oklab, ${accent.fill} 16%, #0b0c0e), #0b0c0e 70%)`
          : '#141517',
      }}>
      <div className={`relative aspect-square w-[88%] ${motion ? 'disc-swap' : ''}`}>
      <div
        className="animate-platter absolute inset-0 overflow-hidden rounded-full shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
        style={{ animationPlayState: playing && motion ? 'running' : 'paused' }}>
        {artUrl ? (
          <img src={artUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-white/8">
            <Disc className="h-12 w-12 text-off-white/30" />
          </div>
        )}
        {/* a pressed disc throws a radial sheen over whatever is printed on it */}
        <div
          className="absolute inset-0 rounded-full mix-blend-screen opacity-30"
          style={{
            background:
              'conic-gradient(from 208deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.55) 34deg, rgba(255,255,255,0) 74deg, rgba(255,255,255,0) 150deg, rgba(255,255,255,0.4) 188deg, rgba(255,255,255,0) 228deg, rgba(255,255,255,0) 300deg, rgba(255,255,255,0.32) 332deg, rgba(255,255,255,0) 360deg)',
          }}
        />
        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-black/35" />

        {/* the clamping ring and the hole punched through the middle of the print */}
        <div className="absolute inset-0 grid place-items-center">
          <div
            className="grid aspect-square w-[30%] place-items-center rounded-full ring-1 ring-black/30"
            style={{ background: 'linear-gradient(150deg, #e9ecf0 0%, #b7bdc5 44%, #d8dce1 70%, #a7aeb7 100%)' }}>
            <div className="aspect-square w-[46%] rounded-full bg-[#0b0c0e] shadow-[inset_0_0_14px_rgba(0,0,0,0.8)] ring-1 ring-white/15" />
          </div>
        </div>
      </div>
      </div>

      {/* the disc is round inside a rounded square, so the corner is free; the clock lives there */}
      {wallClock && (
        <div className="absolute bottom-4 left-5">
          <ClockView
            parts={wallClock}
            size={(10 * clockSize) / 100}
            className="text-off-white/55"
            color={accent?.soft}
          />
        </div>
      )}
    </div>
  );

  const titles = (
    <div className="min-w-0 shrink-0">
      <div className="mb-1 truncate font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">{context}</div>
      {/* the track is centred in the space the controls leave, which is deep enough to wrap into
          whether or not the on-screen buttons are drawn */}
      <Roll
        text={title}
        wrap
        lines={3}
        className={`font-display font-semibold leading-[1.2] tracking-display text-off-white ${
          upright ? 'text-[1.75rem]' : 'text-[1.625rem]'
        }`}
      />
      <div className="mt-1 flex min-w-0 items-center gap-2">
        {explicit && <Explicit />}
        <Roll text={artist} wrap lines={2} className="min-w-0 text-title text-soft" />
      </div>
    </div>
  );

  const bar = (
    <div className="shrink-0">
      <Rail rotate={rotate} dot progress={progress} playing={playing && motion} tint={tint} tint2={tint} onSeek={onSeek} />
      <div className="mt-2 flex justify-between font-mono text-hint tabular-nums text-dim">
        <span>{clock(elapsed)}</span>
        <span>{duration ? (remaining ? `-${clock(duration - elapsed)}` : clock(duration)) : '--:--'}</span>
      </div>
    </div>
  );

  // one outlined block split into three, rather than three separate buttons
  const keys = showTransport ? (
    <div
      className="flex shrink-0 divide-x divide-white/10 overflow-hidden rounded-2xl ring-1 ring-white/12"
      style={{
        // the same wash the tray takes, over a lighter base, so the bar reads as part of the style
        // without sinking to the tray's depth
        background: accent
          ? `linear-gradient(155deg, color-mix(in oklab, ${accent.fill} 14%, #1c1e22), #1c1e22 75%)`
          : '#1c1e22',
      }}>
      {[
        { label: 'previous', on: onPrev, icon: <Skip className="h-6 w-6 -scale-x-100" /> },
        {
          label: playing ? 'pause' : 'play',
          on: onToggle,
          icon: playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />,
        },
        { label: 'next', on: onNext, icon: <Skip className="h-6 w-6" /> },
      ].map(k => (
        <button
          key={k.label}
          aria-label={k.label}
          onClick={k.on}
          className="grid flex-1 place-items-center py-4 text-near transition-colors duration-200 active:bg-white/12">
          {k.icon}
        </button>
      ))}
    </div>
  ) : null;

  if (upright)
    return (
      <div className="relative flex h-full w-full flex-col justify-between gap-4 p-6">
        {tray}
        {titles}
        <div className="flex flex-col gap-4">
          {bar}
          {keys}
        </div>
      </div>
    );

  return (
    <div className="absolute inset-0 flex items-stretch gap-7 p-6">
      {tray}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* the track sits in the middle of what the controls leave, rather than at the top of it.
            min-w-0 or this refuses to shrink under the marquee's full text width and pushes the
            column past the edge of the screen */}
        <div className="flex min-h-0 min-w-0 flex-1 items-center">
          {/* titles carries shrink-0 for the column it sits in when turned, where it stops the block
              being squeezed vertically. in a row that same flag refuses to give up width, so it goes
              inside something that can */}
          <div className="min-w-0 flex-1">{titles}</div>
        </div>
        {/* the bar belongs directly above the buttons, not spread away from them */}
        <div className="flex flex-col gap-4">
          {bar}
          {keys}
        </div>
      </div>
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
  explicit,
  accent,
  playing,
  motion,
  seekStyle,
  dot,
  showTransport,
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
  explicit: boolean;
  accent: Accent | null;
  playing: boolean;
  motion: boolean;
  seekStyle: 'bar' | 'wave';
  dot: boolean;
  showTransport: boolean;
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

      {showTransport && (
        <button
          aria-label={playing ? 'pause' : 'play'}
          onClick={onToggle}
          style={accent ? { color: accent.ink } : undefined}
          className="absolute right-7 top-1/2 grid h-24 w-24 -translate-y-1/2 place-items-center text-screen">
          {/* the shape turns on its own layer; the glyph sits above it and stays upright */}
          <span
            className={`absolute inset-0 rounded-[30px] shadow-2xl ${motion ? 'animate-platter' : ''}`}
            style={{
              backgroundColor: accent?.fill ?? '#efefef',
              animationDuration: '9s',
              animationPlayState: playing && motion ? 'running' : 'paused',
            }}
          />
          <span key={playing ? 'pause' : 'play'} className="relative grid animate-pop place-items-center">
            {playing ? <Pause className="h-9 w-9" /> : <Play className="h-9 w-9" />}
          </span>
        </button>
      )}

      {/* the 52% is there to clear the play button; with it gone the track gets the whole width,
          inset the same on both sides */}
      <div className={`absolute top-1/2 -translate-y-1/2 ${showTransport ? 'left-8 w-[52%]' : 'inset-x-8'}`}>
        <div className="mb-2 truncate font-mono text-eyebrow tracking-[0.22em] text-off-white/65 uppercase">
          {context}
        </div>
        <Roll
          text={title}
          wrap
          lines={3}
          className="font-display text-[2.375rem] leading-[1.15] font-semibold tracking-display text-off-white"
        />
        <div className="mt-1 flex min-w-0 items-center gap-2">
          {explicit && <Explicit />}
          <Roll text={artist} wrap lines={2} className="min-w-0 text-title text-off-white/70" />
        </div>
        <div className="mt-2.5 font-mono text-hint tabular-nums text-off-white/60">
          {clock(elapsed)} / {duration ? clock(duration) : '--:--'}
        </div>
      </div>

      <div className="absolute inset-x-8 bottom-7 flex items-center gap-6">
        {showTransport && (
          <button
            aria-label="previous"
            onClick={onPrev}
            style={{ color: tint }}
            className="-m-3 shrink-0 p-3 text-off-white transition-[transform,color] duration-300 ease-spring active:scale-90">
            <Skip className="h-9 w-9 -scale-x-100" />
          </button>
        )}

        <Seek
          style={seekStyle}
          rotate={rotate}
          dot={dot}
          progress={progress}
          playing={playing && motion}
          tint={tint}
          tint2={tint2}
          onSeek={onSeek}
        />

        {showTransport && (
          <button
            aria-label="next"
            onClick={onNext}
            style={{ color: tint }}
            className="-m-3 shrink-0 p-3 text-off-white transition-[transform,color] duration-300 ease-spring active:scale-90">
            <Skip className="h-9 w-9" />
          </button>
        )}
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
  explicit,
  accent,
  playing,
  motion,
  seekStyle,
  dot,
  showTransport,
  edge,
  panel,
  showVolume,
  pulse,
  pulseMs,
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
}: {
  artUrl: string | null;
  context: string;
  title: string;
  artist: string;
  explicit: boolean;
  accent: Accent | null;
  playing: boolean;
  motion: boolean;
  seekStyle: 'bar' | 'wave';
  dot: boolean;
  showTransport: boolean;
  edge: boolean;
  panel: boolean;
  showVolume: boolean;
  pulse: boolean;
  pulseMs: number;
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
}) {
  const tint = accent?.fill ?? '#efefef';
  const tint2 = accent?.fill2 ?? '#efefef';
  const level = volume?.level ?? 0;
  // the card is 280px wide against a 480px tall screen, so every row it holds has to come down a size
  const small = !upright;

  const round = small ? 'rounded-2xl' : 'rounded-[22px]';
  const cover = (
    <div
      className={`relative aspect-square bg-white/6 ${small ? 'h-full shrink-0' : 'w-full min-h-0 shrink'} ${
        edge ? '' : `overflow-hidden shadow-2xl ring-1 ring-white/10 ${round}`
      }`}>
      {/* the glow sits outside the art rather than over it, so it never veils the cover */}
      {accent && pulse && (
        <div
          className={`cover-pulse pointer-events-none absolute inset-0 ${edge ? '' : round}`}
          style={{
            boxShadow: `0 0 0 1.5px ${accent.soft}, 0 0 38px 5px ${accent.fill}`,
            ['--pulse-duration' as string]: `${pulseMs}ms`,
          }}
        />
      )}
      {artUrl ? (
        <img src={artUrl} alt="" className={`relative h-full w-full object-cover ${edge ? '' : round}`} />
      ) : (
        <div className={`relative grid h-full w-full place-items-center ${edge ? '' : round}`}>
          <Disc className={`text-off-white/25 ${small ? 'h-12 w-12' : 'h-16 w-16'}`} />
        </div>
      )}
    </div>
  );

  const clockRow = wallClock ? (
    <div className={`flex shrink-0 ${JUSTIFY[clockPos]}`}>
      <ClockView
        parts={wallClock}
        size={((small ? 10 : 11) * clockSize) / 100}
        className="text-dim"
        color={accent?.soft}
      />
    </div>
  ) : null;

  const titles = (
    <div className="min-w-0 shrink-0">
      {!small && <div className="mb-1 truncate font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">{context}</div>}
      {/* the column is deep in either orientation, so a long track grows into it rather than
          scrolling past on one line */}
      <Roll
        text={title}
        wrap
        lines={3}
        className={`font-display leading-[1.2] font-semibold tracking-display text-off-white ${
          small ? 'text-[1.75rem]' : 'text-[1.875rem]'
        }`}
      />
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        {explicit && <Explicit />}
        <Roll text={artist} wrap lines={2} className="min-w-0 text-title text-soft" />
      </div>
    </div>
  );

  const bar = (
    <Seek
      style={seekStyle}
      rotate={rotate}
      dot={dot}
      progress={progress}
      playing={playing && motion}
      tint={tint}
      tint2={tint2}
      onSeek={onSeek}
    />
  );

  const times = (
    <div className="flex justify-between font-mono text-hint tabular-nums text-dim">
      <span>{clock(elapsed)}</span>
      <span>{duration ? (remaining ? `-${clock(duration - elapsed)}` : clock(duration)) : '--:--'}</span>
    </div>
  );

  const transport = !showTransport ? null : (
    <div className={`flex shrink-0 items-center justify-center ${small ? 'gap-12' : 'gap-10'}`}>
      <Ghost label="previous" onClick={onPrev}>
        <Skip className={small ? 'h-9 w-9 -scale-x-100' : 'h-8 w-8 -scale-x-100'} />
      </Ghost>
      <Ghost label={playing ? 'pause' : 'play'} tint={accent?.fill} onClick={onToggle}>
        <span key={playing ? 'pause' : 'play'} className="grid animate-pop place-items-center">
          {playing ? (
            <Pause className={small ? 'h-10 w-10' : 'h-9 w-9'} />
          ) : (
            <Play className={small ? 'h-10 w-10' : 'h-9 w-9'} />
          )}
        </span>
      </Ghost>
      <Ghost label="next" onClick={onNext}>
        <Skip className={small ? 'h-9 w-9' : 'h-8 w-8'} />
      </Ghost>
    </div>
  );

  const volumeRow = !showVolume ? null : (
    <div className="flex shrink-0 items-center gap-2.5">
      <Speaker className="h-4 w-4 shrink-0 text-dim" muted={volume?.muted === true} />
      <div className="min-w-0 flex-1">
        <VolumeBar level={level} rotate={rotate} tint={tint} onPick={onVolume} />
      </div>
      <Speaker className="h-5 w-5 shrink-0 text-dim" />
    </div>
  );

  // the track and the controls on a panel of their own rather than straight over the artwork
  const wrap = (inner: ReactNode) =>
    panel ? (
      <div
        className="flex min-h-0 flex-1 flex-col rounded-2xl px-5 py-4 ring-1 ring-white/10 backdrop-blur-md"
        style={{
          background: accent
            ? `linear-gradient(155deg, color-mix(in oklab, ${accent.fill} 18%, rgba(10,12,14,0.72)), rgba(10,12,14,0.72) 78%)`
            : 'rgba(10,12,14,0.72)',
        }}>
        {inner}
      </div>
    ) : (
      <>{inner}</>
    );

  const rest = (
    <>
      {clockRow}
      {titles}
      {/* the times sit either side of the bar upright, where the column is too tall to stack them */}
      <div className="flex shrink-0 items-center gap-2.5 font-mono text-hint tabular-nums text-dim">
        <span className="w-11 shrink-0">{clock(elapsed)}</span>
        <div className="min-w-0 flex-1">{bar}</div>
        <span className="w-11 shrink-0 text-right">
          {duration ? (remaining ? `-${clock(duration - elapsed)}` : clock(duration)) : '--:--'}
        </span>
      </div>
      {transport}
      {volumeRow}
    </>
  );

  if (upright)
    return (
      <div className={`relative flex h-full w-full flex-col ${edge ? 'p-0' : 'p-7'}`}>
        {cover}
        <div className={`flex min-h-0 flex-1 flex-col ${edge ? 'p-7' : 'pt-4'}`}>
          {wrap(<div className="flex min-h-0 flex-1 flex-col justify-between gap-4">{rest}</div>)}
        </div>
      </div>
    );

  return (
    // one surface: no panel of its own, so the blurred artwork behind runs the whole screen and the
    // content sits straight on it. inset-0 also keeps the box definite, which the cover's aspect
    // ratio needs or a content-sized track grows to fit it
    <div className={`absolute inset-0 flex items-stretch overflow-hidden ${edge ? 'gap-0 p-0' : 'gap-7 p-7'}`}>
      {cover}
      <div className={`flex min-w-0 flex-1 flex-col ${edge ? 'p-7' : ''}`}>
        {wrap(
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            {/* the track takes the space above; the controls hold the bottom edge whatever is left */}
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-4 py-1">
              {clockRow}
              {titles}
              <div className="shrink-0">
                {bar}
                <div className="mt-2">{times}</div>
              </div>
            </div>
            {transport}
            {volumeRow}
          </div>,
        )}
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
  dot,
  progress,
  playing,
  tint,
  tint2,
  onSeek,
}: {
  rotate: Prefs['rotate'];
  dot: boolean;
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
        {dot && <rect x={played - 1.5} y={mid - 9} width="3" height="18" rx="1.5" fill={tint2} />}
      </svg>
    </div>
  );
}

function Seek({
  style,
  rotate,
  dot,
  progress,
  playing,
  tint,
  tint2,
  onSeek,
}: {
  style: 'bar' | 'wave';
  rotate: Prefs['rotate'];
  dot: boolean;
  progress: number;
  playing: boolean;
  tint: string;
  tint2: string;
  onSeek: (ratio: number) => void;
}) {
  return style === 'wave' ? (
    <Wave rotate={rotate} dot={dot} progress={progress} playing={playing} tint={tint} tint2={tint2} onSeek={onSeek} />
  ) : (
    <Rail rotate={rotate} dot={dot} progress={progress} playing={playing} tint={tint} tint2={tint2} onSeek={onSeek} />
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

function Backdrop({
  url,
  intensity,
  drift,
  blur,
}: {
  url: string | null;
  intensity: number;
  drift: number;
  blur: number;
}) {
  // 60 lands on the 72px the backdrop always used, so the default look is unchanged
  const blurPx = Math.round((Math.min(100, Math.max(0, blur)) / 100) * 120);
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

  // the outgoing art stays underneath while the incoming one fades over it, so a track change is a
  // dissolve rather than a cut back to bare screen and up again
  const [shown, setShown] = useState(url);
  const [under, setUnder] = useState<string | null>(null);
  useEffect(() => {
    if (url === shown) return;
    setUnder(shown);
    setShown(url);
    const t = setTimeout(() => setUnder(null), BACKDROP_FADE_MS);
    return () => clearTimeout(t);
  }, [url, shown]);

  // tailwind's scale utility sets the separate scale property, which would compound with the
  // keyframes' own transform, so the zoom is owned by one of them and never both
  const art = (src: string) => (
    <img
      src={src}
      alt=""
      style={{
        opacity: level,
        filter: `blur(${blurPx}px) saturate(1.6)`,
        transform: d > 0 ? undefined : 'scale(1.5)',
        ...(d > 0 ? driftVars : {}),
      }}
      className={`absolute inset-0 h-full w-full object-cover ${d > 0 ? 'drift' : ''}`}
    />
  );

  return (
    <div className="pointer-events-none absolute inset-0">
      {level > 0 && under && art(under)}
      {level > 0 && shown && (
        <div key={shown} className="backdrop-in absolute inset-0">
          {art(shown)}
        </div>
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
  dot,
  progress,
  playing,
  tint,
  tint2,
  onSeek,
}: {
  rotate: Prefs['rotate'];
  dot: boolean;
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
        {dot && playing && (
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-3 animate-halo rounded-full bg-off-white"
            style={{ left: `${Math.min(100, progress * 100)}%`, backgroundColor: tint2 }}
          />
        )}
        {dot && (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-off-white shadow transition-colors duration-500"
            style={{ left: `${Math.min(100, progress * 100)}%`, backgroundColor: tint2 }}
          />
        )}
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

// a bubble machine for music notes. every note is one element with two css animations on it, a rise
// and a sway at a different period, so nothing here costs a frame of javascript. the seeded values
// are generated once and never change, or a re-render would restart every note mid-flight.
const NOTE_GLYPHS = ['\u266a', '\u266b', '\u266c', '\u2669'];

const NOTES = Array.from({ length: 14 }, (_, i) => {
  // a fixed spread rather than Math.random at render: same layout every mount, no clustering
  const t = (i * 0.6180339887) % 1;
  return {
    left: 4 + t * 92,
    glyph: NOTE_GLYPHS[i % NOTE_GLYPHS.length],
    size: 15 + ((i * 7) % 5) * 5,
    life: 8.5 + ((i * 5) % 7) * 0.9,
    delay: (i * 11) % 9,
    sway: 10 + ((i * 3) % 5) * 6,
    tilt: 8 + ((i * 5) % 4) * 5,
    period: 2.1 + ((i * 4) % 5) * 0.45,
    peak: 0.34 + ((i * 3) % 4) * 0.08,
    mix: ((i * 2) % 5) / 4,
  };
});

function Notes({ accent, playing }: { accent: Accent | null; playing: boolean }) {
  const from = accent?.fill ?? '#efefef';
  const to = accent?.fill2 ?? accent?.soft ?? '#cfd6de';
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      {NOTES.map((n, i) => (
        <span
          key={i}
          className="note-rise absolute block will-change-transform"
          style={{
            left: `${n.left}%`,
            bottom: '-12%',
            ['--note-life' as string]: `${n.life}s`,
            ['--note-delay' as string]: `${n.delay}s`,
            ['--note-peak' as string]: `${n.peak}`,
            animationPlayState: playing ? 'running' : 'paused',
          }}>
          <span
            className="note-sway block will-change-transform"
            style={{
              ['--note-sway' as string]: `${n.sway}px`,
              ['--note-tilt' as string]: `${n.tilt}deg`,
              ['--note-period' as string]: `${n.period}s`,
              ['--note-delay' as string]: `${n.delay}s`,
              animationPlayState: playing ? 'running' : 'paused',
              fontSize: `${n.size}px`,
              lineHeight: 1,
              // each note lands somewhere between the two accent tones, so no two are the same shade
              color: `color-mix(in oklab, ${from} ${Math.round(n.mix * 100)}%, ${to})`,
            }}>
            {n.glyph}
          </span>
        </span>
      ))}
    </div>
  );
}

// with the on-screen buttons off, the presets are the only way to work the player, so a marker sits
// against the edge at each button's own position rather than floating in the middle of the layout.
//
// the presets run across the top of the device, evenly spread. the stage turns the whole ui to suit
// how the device is mounted, so that edge lands somewhere different in layout space each time, and
// the run of buttons can end up mirrored along it. rotate(90) maps layout +x to screen down, so the
// screen's top edge is the layout's left, and screen-left is the layout's bottom: hence the flips.
// four presets, evenly spread across the width of the screen with a matching margin at each end.
// the fourth sits just inside the screen's right edge; the settings button past it is over the dial,
// off the glass entirely, so there is nowhere on screen to point at it
const PRESET_AT = [12.5, 37.5, 62.5, 87.5];
// how long the glyphs stay up after a track changes before they fade back to just the bumps
const PRESET_ICON_MS = 4200;

const PRESET_EDGE: Record<number, { edge: 'top' | 'bottom' | 'left' | 'right'; mirror: boolean }> = {
  0: { edge: 'top', mirror: false },
  90: { edge: 'left', mirror: true },
  180: { edge: 'bottom', mirror: true },
  270: { edge: 'right', mirror: false },
};

function PresetHint({
  playing,
  rotate,
  accent,
  cue,
}: {
  playing: boolean;
  rotate: Prefs['rotate'];
  accent: Accent | null;
  cue: string;
}) {
  // the glyphs are there to teach the mapping, not to sit on the artwork forever. they show
  // themselves on every new track and then fade, leaving the bumps to mark where the buttons are
  const [showIcons, setShowIcons] = useState(true);
  useEffect(() => {
    setShowIcons(true);
    const t = setTimeout(() => setShowIcons(false), PRESET_ICON_MS);
    return () => clearTimeout(t);
  }, [cue]);
  const { edge, mirror } = PRESET_EDGE[rotate];
  const vertical = edge === 'left' || edge === 'right';
  // one soft band along the whole edge rather than a chip behind each glyph: four dark discs read as
  // stuck on top of the player, a single fade reads as part of the edge they are pointing at
  const scrim = { top: 'bg-gradient-to-b', bottom: 'bg-gradient-to-t', left: 'bg-gradient-to-r', right: 'bg-gradient-to-l' }[edge];
  const icons = [
    <Skip key="p" className="h-4 w-4 -scale-x-100" />,
    playing ? <Pause key="t" className="h-4 w-4" /> : <Play key="t" className="h-4 w-4" />,
    <Skip key="n" className="h-4 w-4" />,
    <Turn key="r" className="h-4 w-4" />,
  ];
  return (
    <div key={rotate} className="preset-settle pointer-events-none absolute inset-0 z-[2]">
      <div
        className={`absolute ${scrim} from-black/55 via-black/20 to-transparent ${
          vertical ? 'inset-y-0 w-16' : 'inset-x-0 h-16'
        }`}
        style={{ [edge]: 0 }}
      />
      {PRESET_AT.map((at, i) => {
        const along = `${mirror ? 100 - at : at}%`;
        return (
          <div
            key={i}
            className={`absolute flex items-center gap-1.5 ${
              vertical ? '-translate-y-1/2 flex-row' : '-translate-x-1/2 flex-col'
            } ${edge === 'bottom' ? 'flex-col-reverse' : ''} ${edge === 'right' ? 'flex-row-reverse' : ''}`}
            style={{
              [vertical ? 'top' : 'left']: along,
              [edge]: 0,
            }}>
            {/* the bump takes the album's colour, so the marker belongs to the player it sits over */}
            {/* once the glyphs have gone the bump is the whole marker, so it thins out and dims
                rather than staying as loud as it was while it had a label to introduce */}
            <span
              className={`shrink-0 transition-opacity duration-700 ${
                showIcons ? 'opacity-80' : 'opacity-40'
              } ${
                vertical
                  ? `h-[61px] rounded-r-full ${showIcons ? 'w-[2px]' : 'w-px'}`
                  : `w-[61px] rounded-b-full ${showIcons ? 'h-[2px]' : 'h-px'}`
              } ${edge === 'bottom' ? 'rounded-t-full rounded-b-none' : ''} ${
                edge === 'right' ? 'rounded-l-full rounded-r-none' : ''
              }`}
              style={{ backgroundColor: accent?.soft ?? 'rgba(239,239,239,0.7)' }}
            />
            {/* the stage turns the interface; these describe hardware, so they turn back and stay
                square to the device however the player around them is laid out */}
            <span
              className={`text-off-white/65 transition-opacity duration-700 ${showIcons ? 'opacity-100' : 'opacity-0'}`}
              style={{ transform: `rotate(${-rotate}deg)` }}>
              {icons[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// the presets already do previous, play and next, which is worth saying once rather than leaving
// someone to find the setting
function Tip({
  tint,
  again,
  onAgain,
  onHide,
  onKeep,
}: {
  tint: string;
  again: boolean;
  onAgain: (v: boolean) => void;
  onHide: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-screen/80 px-16 backdrop-blur-sm">
      <div className="w-full max-w-[30rem] rounded-3xl bg-screen p-6 ring-1 ring-white/12 shadow-2xl">
        <div className="font-display text-title font-semibold text-off-white">Use the buttons on the device?</div>
        <p className="mt-2 text-body text-soft">
          The four presets already do previous, play and next. Hiding the on-screen ones gives the
          artwork the room, and a small marker shows which preset does what.
        </p>

        <button
          onClick={() => onAgain(!again)}
          className="mt-4 flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left"
          role="checkbox"
          aria-checked={!again}>
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 ring-white/25"
            style={{ backgroundColor: again ? 'transparent' : tint }}>
            {!again && <Tick className="h-3.5 w-3.5 text-screen" />}
          </span>
          <span className="text-body text-soft">Don't show this again</span>
        </button>

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onKeep}
            className="rounded-full bg-white/10 px-5 py-2.5 text-row font-medium text-near transition active:scale-95">
            Keep them
          </button>
          <button
            onClick={onHide}
            className="rounded-full px-5 py-2.5 text-row font-medium transition active:scale-95"
            style={{ backgroundColor: tint, color: '#060809' }}>
            Hide them
          </button>
        </div>
      </div>
    </div>
  );
}

function Tick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 5 5L19 7" />
    </svg>
  );
}

// the words, with the line being sung held on the middle of the screen and the rest falling away
// above and below it. the column moves rather than the lines, which is one transform for the lot
const LYRIC_LINE_PX = 58;

// the ends are masked rather than covered. laying a dark gradient over the screen dims the artwork
// along with the words; masking takes the words themselves to nothing and leaves what is behind them
// alone. the stops are eased for the same reason a fade was: a straight ramp shows its own edge.
const MASK_STOPS = [
  [0, 0],
  [7, 0.07],
  [13, 0.2],
  [19, 0.4],
  [25, 0.63],
  [31, 0.84],
  [38, 0.96],
  [45, 1],
] as const;
const LYRIC_MASK = `linear-gradient(to bottom, ${[
  ...MASK_STOPS.map(([at, a]) => `rgba(0, 0, 0, ${a}) ${at}%`),
  ...[...MASK_STOPS].reverse().map(([at, a]) => `rgba(0, 0, 0, ${a}) ${100 - at}%`),
].join(', ')})`;

function Lyrics({
  lyrics,
  elapsed,
  artUrl,
  title,
  artist,
  accent,
  motion,
  upright,
  offset,
  words,
  onWords,
  corner,
  playing,
  showTransport,
  onToggle,
  onPrev,
  onNext,
  onSeekMs,
}: {
  lyrics: ReturnType<typeof useLyrics>;
  elapsed: number;
  artUrl: string | null;
  title: string;
  artist: string;
  accent: Accent | null;
  motion: boolean;
  upright: boolean;
  offset: number;
  words: boolean;
  onWords: () => void;
  corner: Prefs['lyricsInfo'];
  playing: boolean;
  showTransport: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeekMs: (ms: number) => void;
}) {
  const tint = accent?.fill ?? '#efefef';
  // there is only something to hide when the phone actually gave us words
  const has = lyrics.state === 'timed' || lyrics.state === 'plain';
  const right = corner === 'tr' || corner === 'br';
  const bottom = corner === 'bl' || corner === 'br';
  const edge = `${bottom ? 'bottom-5' : 'top-5'} ${right ? 'right-6' : 'left-6'}`;
  // play and pause take the other end of the same edge, which is the end previous and next leave free
  const other = `${bottom ? 'bottom-5' : 'top-5'} ${right ? 'left-6' : 'right-6'}`;

  const chrome = (
    <>
      {/* on the right the artwork leads and the track reads back towards it, so the pair stays
          anchored to its own corner rather than pointing out of the screen */}
      <div className={`pointer-events-none absolute z-[3] flex max-w-[46%] items-center gap-3 ${edge} ${right ? 'flex-row-reverse' : ''}`}>
        {artUrl ? (
          <img src={artUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover shadow-lg ring-1 ring-white/15" />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-white/8 ring-1 ring-white/15">
            <Disc className="h-6 w-6 text-off-white/30" />
          </div>
        )}
        <div className={`min-w-0 ${right ? 'text-right' : ''}`}>
          <div className="truncate text-row-lg font-semibold text-off-white">{title}</div>
          <div className="truncate text-hint text-soft">{artist}</div>
        </div>
      </div>

      {has && (
        <button
          aria-label={words ? 'hide the words' : 'show the words'}
          onClick={onWords}
          style={{ color: words ? tint : undefined }}
          className={`absolute top-1/2 left-6 z-[3] -m-3 -translate-y-1/2 p-3 transition-[transform,color,opacity] duration-300 ease-spring active:scale-90 ${
            words ? '' : 'text-off-white/50'
          }`}>
          <Words className="h-7 w-7" off={!words} />
        </button>
      )}

      {showTransport && (
        <>
          {/* Poster's play button, smaller: the shape turns and the glyph stays upright on top of it */}
          <button
            aria-label={playing ? 'pause' : 'play'}
            onClick={onToggle}
            className={`absolute z-[3] grid h-14 w-14 place-items-center text-screen ${other}`}
            style={accent ? { color: accent.ink } : undefined}>
            <span
              className={`absolute inset-0 rounded-[18px] bg-off-white shadow-2xl ${motion ? 'animate-platter' : ''}`}
              style={{
                backgroundColor: accent?.fill ?? '#efefef',
                animationDuration: '9s',
                animationPlayState: playing && motion ? 'running' : 'paused',
              }}
            />
            <span key={playing ? 'pause' : 'play'} className="relative grid animate-pop place-items-center">
              {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </span>
          </button>

          {/* the skips take the far ends of the edge the track is not on, so nothing shares a corner */}
          <button
            aria-label="previous"
            onClick={onPrev}
            style={{ color: tint }}
            className={`absolute left-6 z-[3] -m-3 p-3 transition-[transform,color] duration-300 ease-spring active:scale-90 ${
              bottom ? 'top-7' : 'bottom-7'
            }`}>
            <Skip className="h-9 w-9 -scale-x-100" />
          </button>
          <button
            aria-label="next"
            onClick={onNext}
            style={{ color: tint }}
            className={`absolute right-6 z-[3] -m-3 p-3 transition-[transform,color] duration-300 ease-spring active:scale-90 ${
              bottom ? 'top-7' : 'bottom-7'
            }`}>
            <Skip className="h-9 w-9" />
          </button>
        </>
      )}
    </>
  );

  if (words && lyrics.state === 'timed') {
    const at = activeIndex(lyrics.lines, elapsed);
    // the line the column is parked on, which is the sung one unless the wheel has moved away
    const shown = Math.min(lyrics.lines.length - 1, Math.max(0, at + offset));
    return (
      <div className="absolute inset-0 overflow-hidden">
        {/* the mask goes on the words alone, not on this box, or it would take the corners with it */}
        <div className="absolute inset-0" style={{ maskImage: LYRIC_MASK, WebkitMaskImage: LYRIC_MASK }}>
        <div
          className={`absolute inset-x-0 top-1/2 ${motion ? 'lyric-scroll' : ''}`}
          style={{ transform: `translate3d(0, ${-(shown + 0.5) * LYRIC_LINE_PX}px, 0)` }}>
          {lyrics.lines.map((line, i) => {
            const away = Math.abs(i - at);
            return (
              <button
                key={i}
                onClick={() => onSeekMs(line.startMs)}
                aria-label={`play from ${line.text}`}
                className={`flex w-full cursor-pointer items-center justify-center px-20 text-center ${
                  motion ? 'lyric-line' : ''
                }`}
                style={{
                  height: LYRIC_LINE_PX,
                  color: i === at ? tint : '#efefef',
                  opacity: i === at ? 1 : Math.max(0.12, 0.5 - away * 0.11),
                  transform: `scale(${i === at ? 1 : 0.9})`,
                }}>
                <span
                  className={`truncate font-display leading-tight font-semibold tracking-display ${
                    upright ? 'text-[1.5rem]' : 'text-[1.75rem]'
                  }`}>
                  {line.text || '\u00b7 \u00b7 \u00b7'}
                </span>
              </button>
            );
          })}
        </div>
        </div>

        {chrome}
      </div>
    );
  }

  if (words && lyrics.state === 'plain')
    return (
      <div className="absolute inset-0">
        <div
          data-lyric-page
          className="absolute inset-0 overflow-y-auto overscroll-contain px-24 py-24 [scrollbar-width:none]">
          <div className="whitespace-pre-line text-center font-display text-title leading-relaxed text-soft">
            {lyrics.text}
          </div>
        </div>
        {chrome}
      </div>
    );

  // with no words on screen there is nothing for the corners to keep clear of, so the track comes
  // to the middle and brings the transport with it
  return (
    <div className="absolute inset-0 grid place-items-center px-16 text-center">
      <div className="flex flex-col items-center gap-4">
        {artUrl ? (
          <img src={artUrl} alt="" className="h-36 w-36 rounded-2xl object-cover shadow-2xl ring-1 ring-white/12" />
        ) : (
          <div className="grid h-36 w-36 place-items-center rounded-2xl bg-white/6 ring-1 ring-white/12">
            <Disc className="h-12 w-12 text-off-white/25" />
          </div>
        )}
        <div className="flex flex-col items-center gap-1">
          <Roll
            text={title}
            wrap
            lines={2}
            className="font-display text-[1.875rem] leading-tight font-semibold tracking-display text-off-white"
          />
          <div className="text-title text-soft">{artist}</div>
        </div>
        <div className="text-hint text-dim">
          {lyrics.state === 'loading'
            ? 'looking for the words'
            : has
              ? 'words hidden'
              : 'no lyrics for this track'}
        </div>
        {showTransport && (
          <div className="mt-1 flex items-center gap-10">
            <button
              aria-label="previous"
              onClick={onPrev}
              style={{ color: tint }}
              className="-m-3 p-3 transition-[transform,color] duration-300 ease-spring active:scale-90">
              <Skip className="h-8 w-8 -scale-x-100" />
            </button>
            <button
              aria-label={playing ? 'pause' : 'play'}
              onClick={onToggle}
              className="grid h-16 w-16 place-items-center rounded-[22px] bg-off-white text-screen shadow-2xl transition-[transform,background-color,color] duration-300 ease-spring active:scale-90"
              style={accent ? { backgroundColor: accent.fill, color: accent.ink } : undefined}>
              <span key={playing ? 'pause' : 'play'} className="grid animate-pop place-items-center">
                {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
              </span>
            </button>
            <button
              aria-label="next"
              onClick={onNext}
              style={{ color: tint }}
              className="-m-3 p-3 transition-[transform,color] duration-300 ease-spring active:scale-90">
              <Skip className="h-8 w-8" />
            </button>
          </div>
        )}
      </div>
      {has && (
        <button
          aria-label="show the words"
          onClick={onWords}
          className="absolute top-1/2 left-6 z-[3] -m-3 -translate-y-1/2 p-3 text-off-white/50 transition-[transform,color] duration-300 ease-spring active:scale-90">
          <Words className="h-7 w-7" off />
        </button>
      )}
    </div>
  );
}

// lines of text, struck through when the words are off
function Words({ className, off }: { className?: string; off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6h16M4 11h11M4 16h14M4 21h8" />
      {off && <path d="M3 21 21 3" strokeWidth="2.2" />}
    </svg>
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

// preset 4 turns the screen, so the marker over it says so
function Turn({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.6h-4.6" strokeLinejoin="round" />
    </svg>
  );
}

// the mark a store puts on a track, at the size a store puts it
function Explicit({ className }: { className?: string }) {
  return (
    <span
      aria-label="explicit"
      className={`grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[3px] bg-off-white/65 font-mono text-[0.5625rem] leading-none font-bold text-screen ${
        className ?? ''
      }`}>
      E
    </span>
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
