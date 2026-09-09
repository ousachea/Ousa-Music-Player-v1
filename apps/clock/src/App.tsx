import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  CHOICES,
  CITIES,
  CITY_KEYS,
  FACES,
  FACE_LABELS,
  PALETTES,
  TIMER_LABELS,
  TIMER_MODES,
  fill,
  ms,
  spanLabel,
  useAlarm,
  usePrefs,
  type Alarm,
  type Palette,
  type Prefs,
} from './config';
import { useArtPalette, useNowPlaying, type NowPlaying } from './art';
import { ClockFace } from './faces';
import { useTimer } from './timers';
import { clockText, fields, useTick, useZone } from './time';
import { Big, Key } from './ui';
import { daemonUrl } from './daemon';

type View = 'clock' | 'timer' | 'stopwatch' | 'alarm';
const VIEWS: View[] = ['clock', 'timer', 'stopwatch', 'alarm'];
const LABELS: Record<View, string> = { clock: 'Clock', timer: 'Timer', stopwatch: 'Stopwatch', alarm: 'Alarm' };

// one rotary detent lands around deltaX 1
const WHEEL_PER_STEP = 1;
const MAX_STEPS_PER_EVENT = 4;
// the last stretch of a countdown leaves the chosen colour for one that reads as running out
const URGENT: Palette = { main: '#ff8a6b', second: '#ffcf5f', glow: '#5e2418' };

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const { prefs, setPref } = usePrefs(client);
  const zone = useZone(client);
  const [alarm, setAlarm] = useAlarm(client);

  const [view, setView] = useState<View>('clock');
  const [panel, setPanel] = useState(false);

  // the whole app runs off one ticker; 50ms is what the stopwatch's hundredths need
  const now = useTick(50);
  const at = useMemo(() => new Date(now + zone.offsetMs), [now, zone.offsetMs]);
  // the album's colour when there is one and the app is asked to follow it, the chosen pair otherwise
  const playing = useNowPlaying(client);
  const artPal = useArtPalette(client, prefs.artColour, playing?.artworkId ?? null);
  const pal = artPal ?? PALETTES[prefs.tint];

  // --- stopwatch -----------------------------------------------------------
  const [swFrom, setSwFrom] = useState<number | null>(null);
  const [swHeld, setSwHeld] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const swElapsed = swHeld + (swFrom === null ? 0 : now - swFrom);
  const swRunning = swFrom !== null;

  const swToggle = useCallback(() => {
    if (swFrom === null) setSwFrom(Date.now());
    else {
      setSwHeld(h => h + (Date.now() - swFrom));
      setSwFrom(null);
    }
  }, [swFrom]);
  const swReset = useCallback(() => {
    setSwFrom(null);
    setSwHeld(0);
    setLaps([]);
  }, []);
  const swLap = useCallback(() => swRunning && setLaps(l => [swElapsed, ...l].slice(0, 12)), [swRunning, swElapsed]);

  // --- ringing -------------------------------------------------------------
  const [ringing, setRinging] = useState<null | { kind: 'timer' | 'alarm'; since: number }>(null);
  const lastAlarmMinute = useRef<string | null>(null);

  const earcon = useCallback(() => client.audio.earcon({ name: 'notify' }).catch(() => {}), [client]);
  const timerRing = useCallback(() => setRinging({ kind: 'timer', since: Date.now() }), []);
  // a phase ending inside a pomodoro or an interval is a nudge, not an alarm: it says so and carries
  // on, because a screen you have to dismiss is no use to someone halfway through a set
  const timerChime = useCallback(() => prefs.timerSound && earcon(), [prefs.timerSound, earcon]);

  const timer = useTimer({ prefs, now, onRing: timerRing, onChime: timerChime });

  const { h: nowH, m: nowM } = fields(at, zone);
  useEffect(() => {
    if (!alarm.on) return;
    const stamp = `${at.toDateString()} ${nowH}:${nowM}`;
    if (nowH === alarm.h && nowM === alarm.m && lastAlarmMinute.current !== stamp) {
      lastAlarmMinute.current = stamp;
      setRinging({ kind: 'alarm', since: Date.now() });
    }
  }, [alarm, nowH, nowM, at]);

  const ringSound = ringing?.kind === 'alarm' ? prefs.alarmSound : prefs.timerSound;
  const ringSpan = ringing?.kind === 'alarm' ? prefs.alarmRing : prefs.timerRing;

  // the earcon is the only sound the daemon will make for us, so it repeats rather than sustains
  useEffect(() => {
    if (!ringing || !ringSound) return;
    earcon();
    const id = setInterval(earcon, 2500);
    return () => clearInterval(id);
  }, [ringing, ringSound, earcon]);

  useEffect(() => {
    if (!ringing) return;
    const id = setTimeout(() => setRinging(null), ms(ringSpan));
    return () => clearTimeout(id);
  }, [ringing, ringSpan]);

  const stopRinging = useCallback(() => setRinging(null), []);

  // --- controls ------------------------------------------------------------
  const cycleFace = useCallback(
    (by: number) => {
      const i = FACES.indexOf(prefs.style);
      setPref('style', FACES[(((i + by) % FACES.length) + FACES.length) % FACES.length]);
    },
    [prefs.style, setPref],
  );

  const detents = useRef(0);
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      // a trackpad drifts sideways through a vertical scroll; the rotary sends nothing vertical
      if (panel || !e.deltaX || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      detents.current += e.deltaX;
      const steps = Math.trunc(detents.current / WHEEL_PER_STEP);
      if (!steps) return;
      detents.current -= steps * WHEEL_PER_STEP;
      const count = Math.min(Math.abs(steps), MAX_STEPS_PER_EVENT) * Math.sign(steps);

      if (view === 'timer') timer.wheel(count);
      else if (view === 'alarm') setAlarm({ ...alarm, m: (((alarm.m + count) % 60) + 60) % 60 });
      else if (view === 'clock') cycleFace(count);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (ringing && e.key !== 'Escape') return stopRinging();
      if (e.key === 'Escape') return setPanel(open => !open);
      // a preset pressed again on the screen it already opened walks that screen's own list
      if (e.key === '1' && view === 'clock') return cycleFace(1);
      if (e.key >= '1' && e.key <= '4') return setView(VIEWS[Number(e.key) - 1]);
      if (e.key === 'm' || e.key === 'M' || e.key === '5') {
        return setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]);
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (view === 'stopwatch') swToggle();
        else if (view === 'timer') timer.toggle();
        else if (view === 'alarm') setAlarm({ ...alarm, on: !alarm.on });
      }
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [alarm, cycleFace, panel, ringing, setAlarm, stopRinging, swToggle, timer, view]);

  const screenPal = view === 'timer' && timer.urgent ? URGENT : pal;
  const turn = Number(prefs.rotate);

  return (
    <Stage rotate={turn}>
    <div className="absolute inset-0 overflow-hidden bg-screen text-off-white">
      <Wash pal={screenPal} />
      {/* whatever the screen is, it keeps clear of the strip the music sits in */}
      <div className={`absolute inset-0 ${playing ? 'pb-9' : ''}`}>
      {view === 'clock' && <ClockFace prefs={prefs} zone={zone} at={at} pal={pal} />}
      {view === 'timer' && timer.render(screenPal)}
      {view === 'stopwatch' && (
        <Stopwatch
          elapsed={swElapsed}
          running={swRunning}
          laps={prefs.swLaps ? laps : []}
          keepLaps={prefs.swLaps}
          hundredths={prefs.swHundredths}
          pal={pal}
          onToggle={swToggle}
          onLap={swLap}
          onReset={swReset}
        />
      )}
      {view === 'alarm' && (
        <AlarmView alarm={alarm} pal={pal} zone={zone} at={at} format={prefs.format} onSet={setAlarm} />
      )}
      </div>

      {playing && (
        <NowPlayingBar
          now={playing}
          pal={pal}
          onPrev={() => client.player.skipPrev({ allowSeeking: true })}
          onNext={() => client.player.skipNext()}
          onToggle={() => (playing.playing ? client.player.pause() : client.player.resume())}
        />
      )}

      <Presets
        view={view}
        prefs={prefs}
        pal={screenPal}
        rotate={turn}
        onPick={v => (v === 'clock' && view === 'clock' ? cycleFace(1) : setView(v))}
      />

      {ringing && <Ringing kind={ringing.kind} pal={ringing.kind === 'timer' ? URGENT : pal} onStop={stopRinging} />}
      {panel && <Settings view={view} prefs={prefs} setPref={setPref} pal={pal} />}
    </div>
    </Stage>
  );
}

// the screen never resizes, so a quarter turn is laid out at the swapped size and rotated into
// place; the strip left either side is dead space, which is what a turn costs
function Stage({ rotate, children }: { rotate: number; children: ReactNode }) {
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

// ---------------------------------------------------------------------------

// the screen is otherwise near black, and a clock is mostly empty screen. two soft washes in the
// chosen pair give the emptiness a temperature without lifting the black the numerals sit on
function Wash({ pal }: { pal: Palette }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 transition-[background] duration-700"
      style={{
        background:
          `radial-gradient(120% 85% at 12% -10%, ${pal.glow}88, transparent 62%),` +
          `radial-gradient(100% 70% at 92% 112%, ${pal.second}1f, transparent 60%)`,
      }}
    />
  );
}

// the four presets sit along the top edge of the glass, evenly spread with a matching margin at
// each end. the marker is a bump under each one rather than a tab somewhere else, so the thing on
// screen is where the finger already is
const PRESET_AT = [12.5, 37.5, 62.5, 87.5];
// the buttons stay where the hardware is, so a turned screen puts them along a different edge
const PRESET_EDGE: Record<number, { edge: 'top' | 'bottom' | 'left' | 'right'; mirror: boolean }> = {
  0: { edge: 'top', mirror: false },
  90: { edge: 'left', mirror: true },
  180: { edge: 'bottom', mirror: true },
  270: { edge: 'right', mirror: false },
};
// the names are there to teach the mapping, not to sit over a clock forever
const PRESET_LABEL_MS = 4200;

function Presets({
  view,
  prefs,
  pal,
  rotate,
  onPick,
}: {
  view: View;
  prefs: Prefs;
  pal: Palette;
  rotate: number;
  onPick: (v: View) => void;
}) {
  // a screen with a list of its own names the one it is showing, so the preset explains itself
  const here = view === 'clock' ? FACE_LABELS[prefs.style] : view === 'timer' ? TIMER_LABELS[prefs.timerMode] : LABELS[view];
  const [named, setNamed] = useState(true);
  useEffect(() => {
    setNamed(true);
    const id = setTimeout(() => setNamed(false), PRESET_LABEL_MS);
    return () => clearTimeout(id);
  }, [view, here]);

  const { edge, mirror } = PRESET_EDGE[rotate] ?? PRESET_EDGE[0];
  const vertical = edge === 'left' || edge === 'right';
  const scrim = { top: 'bg-gradient-to-b', bottom: 'bg-gradient-to-t', left: 'bg-gradient-to-r', right: 'bg-gradient-to-l' }[edge];

  return (
    <div className="pointer-events-none absolute inset-0 z-[6]">
      {/* one band along the whole edge rather than a chip behind each name: four dark patches read
          as stuck on top of the clock, a single fade reads as part of the edge they point at */}
      <div
        className={`absolute ${scrim} from-black/55 via-black/15 to-transparent ${vertical ? 'inset-y-0 w-16' : 'inset-x-0 h-16'}`}
        style={{ [edge]: 0 }}
      />
      {VIEWS.map((v, i) => {
        const on = v === view;
        const along = `${mirror ? 100 - PRESET_AT[i] : PRESET_AT[i]}%`;
        return (
          <button
            key={v}
            onClick={() => onPick(v)}
            className={`pointer-events-auto absolute flex items-center gap-1.5 ${
              vertical ? '-translate-y-1/2 flex-row py-5 pr-3' : '-translate-x-1/2 flex-col px-5 pb-3'
            } ${edge === 'bottom' ? 'flex-col-reverse' : ''} ${edge === 'right' ? 'flex-row-reverse pr-0 pl-3' : ''}`}
            style={{ [vertical ? 'top' : 'left']: along, [edge]: 0 }}>
            <span
              className={`shrink-0 transition-all duration-700 ${
                vertical
                  ? `h-[61px] rounded-r-full ${on || named ? 'w-[2px]' : 'w-px'}`
                  : `w-[61px] rounded-b-full ${on || named ? 'h-[2px]' : 'h-px'}`
              } ${edge === 'bottom' ? 'rounded-t-full rounded-b-none' : ''} ${
                edge === 'right' ? 'rounded-l-full rounded-r-none' : ''
              }`}
              style={{ background: on ? fill(pal) : '#efefef', opacity: on ? 0.95 : named ? 0.45 : 0.22 }}
            />
            <span
              className={`text-hint whitespace-nowrap transition-opacity duration-700 ${named ? 'opacity-100' : 'opacity-0'}`}
              style={{ color: on ? pal.main : 'rgba(239,239,239,0.5)' }}>
              {on ? here : LABELS[v]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Stopwatch({
  elapsed,
  running,
  laps,
  keepLaps,
  hundredths,
  pal,
  onToggle,
  onLap,
  onReset,
}: {
  elapsed: number;
  running: boolean;
  laps: number[];
  keepLaps: boolean;
  hundredths: boolean;
  pal: Palette;
  onToggle: () => void;
  onLap: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex h-full w-full items-center gap-8 px-10 pt-10">
      <div className="flex flex-1 flex-col items-center gap-6">
        <Big pal={pal}>{clockText(elapsed, hundredths)}</Big>
        <div className="flex items-center gap-3">
          <Key label={running ? 'Stop' : 'Start'} onClick={onToggle} pal={pal} wide />
          {keepLaps && <Key label="Lap" onClick={onLap} />}
          <Key label="Reset" onClick={onReset} />
        </div>
      </div>
      {laps.length > 0 && (
        <div className="h-full max-h-[19rem] w-52 shrink-0 self-center overflow-y-auto rounded-2xl bg-white/4 p-3 [scrollbar-width:none]">
          {laps.map((lap, i) => (
            <div key={i} className="flex justify-between border-b border-white/6 py-1.5 font-mono text-hint last:border-0">
              <span className="text-dim">{laps.length - i}</span>
              <span className="tabular-nums" style={{ color: i === 0 ? pal.main : undefined, opacity: 1 - Math.min(i, 6) * 0.09 }}>
                {clockText(lap, hundredths)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlarmView({
  alarm,
  pal,
  zone,
  at,
  format,
  onSet,
}: {
  alarm: Alarm;
  pal: Palette;
  zone: ReturnType<typeof useZone>;
  at: Date;
  format: Prefs['format'];
  onSet: (a: Alarm) => void;
}) {
  const label = useMemo(() => {
    const d = new Date(at);
    d.setHours(alarm.h, alarm.m, 0, 0);
    try {
      return new Intl.DateTimeFormat(zone.locale ?? undefined, {
        hour: 'numeric',
        minute: '2-digit',
        ...(format === 'auto' ? {} : { hour12: format === 'h12' }),
      }).format(d);
    } catch {
      return `${String(alarm.h).padStart(2, '0')}:${String(alarm.m).padStart(2, '0')}`;
    }
  }, [alarm.h, alarm.m, at, zone.locale, format]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 pt-10">
      <div style={{ opacity: alarm.on ? 1 : 0.45 }}>
        <Big pal={pal}>{label}</Big>
      </div>
      <div className="flex items-center gap-3">
        <Key label="− hour" onClick={() => onSet({ ...alarm, h: (alarm.h + 23) % 24 })} />
        <Key label="+ hour" onClick={() => onSet({ ...alarm, h: (alarm.h + 1) % 24 })} />
        <Key label={alarm.on ? 'On' : 'Off'} onClick={() => onSet({ ...alarm, on: !alarm.on })} pal={alarm.on ? pal : undefined} wide />
      </div>
      <div className="text-hint text-dim">turn the wheel for the minutes</div>
    </div>
  );
}

function Ringing({ kind, pal, onStop }: { kind: 'timer' | 'alarm'; pal: Palette; onStop: () => void }) {
  return (
    <button onClick={onStop} className="absolute inset-0 z-10 grid place-items-center bg-screen/95 backdrop-blur-sm">
      <Wash pal={pal} />
      <div className="relative flex flex-col items-center gap-5">
        <div className="animate-ring font-display text-[3.5rem] leading-none font-semibold" style={{ color: pal.main }}>
          {kind === 'alarm' ? 'Alarm' : 'Time up'}
        </div>
        <div className="text-title text-dim">touch anywhere, or any button, to stop</div>
      </div>
    </button>
  );
}

function Settings({
  view,
  prefs,
  setPref,
  pal,
}: {
  view: View;
  prefs: Prefs;
  setPref: (k: keyof Prefs, v: string) => void;
  pal: Palette;
}) {
  const tint = pal.main;
  const group = (children: ReactNode) => (
    <div className="flex shrink-0 flex-col overflow-hidden rounded-2xl bg-white/4">{children}</div>
  );
  const row = (label: string, control: ReactNode) => (
    <div key={label} className="flex items-center justify-between gap-5 border-b border-white/6 px-4 py-2.5 last:border-0">
      <span className="text-title text-near">{label}</span>
      {control}
    </div>
  );
  // a list too long to sit beside its own label gets the width of the row instead
  const stack = (label: string, control: ReactNode) => (
    <div key={label} className="flex flex-col gap-2 border-b border-white/6 px-4 py-3 last:border-0">
      <span className="text-title text-near">{label}</span>
      {control}
    </div>
  );
  const pill = (on: boolean, label: string, onPick: () => void, key: string) => (
    <button
      key={key}
      onClick={onPick}
      className="rounded-full px-3.5 py-1.5 text-hint font-medium transition"
      style={{ background: on ? fill(pal) : 'rgba(255,255,255,0.08)', color: on ? '#0a0c0e' : '#a7adb5' }}>
      {label}
    </button>
  );
  const seg = <T extends string>(values: readonly T[], labels: string[], value: T, onPick: (v: T) => void) => (
    <div className="flex shrink-0 rounded-full bg-white/8 p-1">
      {values.map((v, i) => (
        <button
          key={v}
          onClick={() => onPick(v)}
          className="rounded-full px-3.5 py-1.5 text-hint font-medium transition"
          style={{ backgroundColor: v === value ? tint : 'transparent', color: v === value ? '#0a0c0e' : '#a7adb5' }}>
          {labels[i]}
        </button>
      ))}
    </div>
  );
  const wrap = <T extends string>(values: readonly T[], label: (v: T) => string, value: T, onPick: (v: T) => void) => (
    <div className="flex flex-wrap gap-2">{values.map(v => pill(v === value, label(v), () => onPick(v), v))}</div>
  );
  // nineteen cities will not fit as pills and a dropdown is no use on glass, so it steps
  const stepper = (key: 'world1' | 'world2' | 'world3') => {
    const i = Math.max(0, CITY_KEYS.indexOf(prefs[key]));
    const move = (by: number) => setPref(key, CITY_KEYS[(i + by + CITY_KEYS.length) % CITY_KEYS.length]);
    return (
      <div className="flex shrink-0 items-center gap-2">
        <Key label="‹" onClick={() => move(-1)} small />
        <span className="w-40 text-center text-row" style={{ color: prefs[key] === 'off' ? '#a7adb5' : tint }}>
          {CITIES[prefs[key]]?.label ?? 'off'}
        </span>
        <Key label="›" onClick={() => move(1)} small />
      </div>
    );
  };
  const toggle = (on: boolean, onPick: () => void) => (
    <button
      role="switch"
      aria-checked={on}
      onClick={onPick}
      className="relative h-8 w-14 shrink-0 rounded-full transition-colors"
      style={{ background: on ? fill(pal) : 'rgba(255,255,255,0.16)' }}>
      <span className="absolute top-1 h-6 w-6 rounded-full bg-screen transition-[left]" style={{ left: on ? '28px' : '4px' }} />
    </button>
  );
  const flag = (label: string, key: keyof Prefs, on: boolean) => row(label, toggle(on, () => setPref(key, on ? 'false' : 'true')));
  const spans = (label: string, key: 'timerRing' | 'alarmRing') =>
    row(label, seg(CHOICES[key], CHOICES[key].map(spanLabel), prefs[key], v => setPref(key, v)));
  const lengths = (label: string, key: 'pomodoroWork' | 'pomodoroBreak' | 'intervalWork' | 'intervalRest') =>
    row(label, seg(CHOICES[key], CHOICES[key].map(spanLabel), prefs[key], v => setPref(key, v)));
  const hours = () => row('Hour format', seg(CHOICES.format, ['Auto', '12h', '24h'], prefs.format, v => setPref('format', v)));

  const clockRows = [
    stack('Clock face', wrap(FACES, f => FACE_LABELS[f], prefs.style, v => setPref('style', v))),
    ...(prefs.style === 'world'
      ? ([1, 2, 3] as const).map(n => row(`City ${n}`, stepper(`world${n}` as 'world1')))
      : []),
    row('Face size', seg(CHOICES.size, ['Small', 'Medium', 'Large', 'Fill'], prefs.size, v => setPref('size', v))),
    hours(),
    flag('Show seconds', 'seconds', prefs.seconds),
    flag('Flashing colon', 'blink', prefs.blink),
    ...(prefs.style === 'digital-date' ? [] : [flag('Show the date', 'date', prefs.date)]),
  ];

  const dialled = prefs.timerMode === 'countdown' || prefs.timerMode === 'circular' || prefs.timerMode === 'multi';
  const timerRows = [
    stack('Timer style', wrap(TIMER_MODES, m => TIMER_LABELS[m], prefs.timerMode, v => setPref('timerMode', v))),
    ...(prefs.timerMode === 'pomodoro' ? [lengths('Work', 'pomodoroWork'), lengths('Break', 'pomodoroBreak')] : []),
    ...(prefs.timerMode === 'interval'
      ? [
          lengths('Work', 'intervalWork'),
          lengths('Rest', 'intervalRest'),
          row('Rounds', seg(CHOICES.intervalRounds, [...CHOICES.intervalRounds], prefs.intervalRounds, v => setPref('intervalRounds', v))),
        ]
      : []),
    flag('Sound when it rings', 'timerSound', prefs.timerSound),
    spans('How long it rings', 'timerRing'),
    ...(dialled
      ? [row('One click of the wheel', seg(CHOICES.timerStep, CHOICES.timerStep.map(spanLabel), prefs.timerStep, v => setPref('timerStep', v)))]
      : []),
  ];

  const rows: Record<View, ReactNode[]> = {
    clock: clockRows,
    timer: timerRows,
    stopwatch: [flag('Show hundredths', 'swHundredths', prefs.swHundredths), flag('Keep laps', 'swLaps', prefs.swLaps)],
    // the alarm reads its own time back, so the format it reads it in belongs on this screen too
    alarm: [flag('Sound when it rings', 'alarmSound', prefs.alarmSound), spans('How long it rings', 'alarmRing'), hours()],
  };

  return (
    <div className="absolute inset-0 z-[5] flex flex-col bg-screen/97 px-8 pt-8 pb-4 backdrop-blur-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-eyebrow tracking-[0.22em] uppercase" style={{ color: tint }}>
          {LABELS[view]}
        </span>
        <span className="text-hint text-dim">the presets move between screens, the wheel button closes this</span>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto [scrollbar-width:none]">
        {group(rows[view])}
        {group([
          row(
            'Screen rotation',
            seg(CHOICES.rotate, ['0°', '90°', '180°', '270°'], prefs.rotate, v => setPref('rotate', v)),
          ),
          row('Follow the album art', toggle(prefs.artColour, () => setPref('artColour', prefs.artColour ? 'false' : 'true'))),
          row(
            prefs.artColour ? 'Colour, when nothing is playing' : 'Colour, on every screen',
            <div className="flex shrink-0 items-center gap-2">
              {(Object.keys(PALETTES) as Prefs['tint'][]).map(k => (
                <button
                  key={k}
                  aria-label={k}
                  onClick={() => setPref('tint', k)}
                  className="h-8 w-8 rounded-full transition"
                  style={{
                    background: fill(PALETTES[k]),
                    outline: k === prefs.tint ? '2px solid #efefef' : '2px solid transparent',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>,
          ),
        ])}
      </div>
      <div className="mt-2 text-hint text-dim">Changing a setting in the companion app overrides it here.</div>
    </div>
  );
}

// what is playing, along the bottom of whichever screen you are on: enough to know the track and
// change it without leaving the clock for the player
function NowPlayingBar({
  now,
  pal,
  onPrev,
  onToggle,
  onNext,
}: {
  now: NowPlaying;
  pal: Palette;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
}) {
  const key = (label: string, onClick: () => void, path: ReactNode) => (
    <button
      key={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-full text-off-white/70 transition active:scale-90">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        {path}
      </svg>
    </button>
  );

  return (
    <div className="absolute inset-x-0 bottom-0 z-[4] flex h-9 items-center justify-center gap-3 px-4">
      <span className="max-w-[46%] truncate text-hint text-dim">
        {now.title}
        {now.artist ? ` · ${now.artist}` : ''}
      </span>
      <span className="flex items-center gap-1" style={{ color: pal.main }}>
        {key('previous', onPrev, <path d="M18 5v14l-9-7 9-7ZM7 5h2v14H7V5Z" />)}
        {key(
          now.playing ? 'pause' : 'play',
          onToggle,
          now.playing ? <path d="M8 5h3v14H8V5Zm5 0h3v14h-3V5Z" /> : <path d="M8 5l11 7-11 7V5Z" />,
        )}
        {key('next', onNext, <path d="M6 5l9 7-9 7V5ZM15 5h2v14h-2V5Z" />)}
      </span>
    </div>
  );
}
