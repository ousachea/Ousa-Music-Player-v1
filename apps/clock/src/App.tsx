import { BridgethingClient } from '@bridgething/client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { PALETTES, useAlarm, usePrefs, type Alarm, type Palette, type Prefs } from './config';
import { clockText, fields, readClock, useTick, useZone } from './time';
import { daemonUrl } from './daemon';

type View = 'clock' | 'timer' | 'stopwatch' | 'alarm';
const VIEWS: View[] = ['clock', 'timer', 'stopwatch', 'alarm'];
const LABELS: Record<View, string> = { clock: 'Clock', timer: 'Timer', stopwatch: 'Stopwatch', alarm: 'Alarm' };

const STYLES: Prefs['style'][] = ['digital', 'analogue', 'flip', 'minimal'];
// one rotary detent lands around deltaX 1
const WHEEL_PER_STEP = 1;
const MAX_STEPS_PER_EVENT = 4;
// how long an alarm or a finished timer keeps announcing itself before it gives up
const RING_MS = 60000;
// the last stretch of a countdown leaves the chosen colour for one that reads as running out
const URGENT: Palette = { main: '#ff8a6b', second: '#ffcf5f', glow: '#5e2418' };
const URGENT_AT = 10000;

// one gradient across a single run of text. only safe where nothing inside carries its own opacity,
// which would composite separately and lose the background the glyphs are cut out of
const ink = (p: Palette) => ({
  backgroundImage: `linear-gradient(115deg, ${p.main} 8%, ${p.second} 92%)`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
});

const fill = (p: Palette) => `linear-gradient(115deg, ${p.main}, ${p.second})`;

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
  const pal = PALETTES[prefs.tint];
  const tint = pal.main;

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

  // --- timer ---------------------------------------------------------------
  const [timerSet, setTimerSet] = useState(5 * 60000);
  const [timerEnd, setTimerEnd] = useState<number | null>(null);
  const [timerLeft, setTimerLeft] = useState(5 * 60000);
  const timerRunning = timerEnd !== null;
  const timerRemaining = timerRunning ? Math.max(0, timerEnd - now) : timerLeft;

  const timerToggle = useCallback(() => {
    if (timerEnd === null) {
      if (timerLeft <= 0) return;
      setTimerEnd(Date.now() + timerLeft);
    } else {
      setTimerLeft(Math.max(0, timerEnd - Date.now()));
      setTimerEnd(null);
    }
  }, [timerEnd, timerLeft]);
  const timerReset = useCallback(() => {
    setTimerEnd(null);
    setTimerLeft(timerSet);
  }, [timerSet]);

  // --- ringing -------------------------------------------------------------
  const [ringing, setRinging] = useState<null | { kind: 'timer' | 'alarm'; since: number }>(null);
  const lastAlarmMinute = useRef<string | null>(null);

  useEffect(() => {
    if (timerRunning && timerEnd !== null && now >= timerEnd) {
      setTimerEnd(null);
      setTimerLeft(0);
      setRinging({ kind: 'timer', since: Date.now() });
    }
  }, [now, timerRunning, timerEnd]);

  const { h: nowH, m: nowM } = fields(at, zone);
  useEffect(() => {
    if (!alarm.on) return;
    const stamp = `${at.toDateString()} ${nowH}:${nowM}`;
    if (nowH === alarm.h && nowM === alarm.m && lastAlarmMinute.current !== stamp) {
      lastAlarmMinute.current = stamp;
      setRinging({ kind: 'alarm', since: Date.now() });
    }
  }, [alarm, nowH, nowM, at]);

  // the earcon is the only sound the daemon will make for us, so it repeats rather than sustains
  useEffect(() => {
    if (!ringing) return;
    if (!prefs.chime) return;
    const beep = () => client.audio.earcon({ name: 'notify' }).catch(() => {});
    beep();
    const id = setInterval(beep, 2500);
    return () => clearInterval(id);
  }, [ringing, prefs.chime, client]);

  useEffect(() => {
    if (!ringing) return;
    const id = setTimeout(() => setRinging(null), RING_MS);
    return () => clearTimeout(id);
  }, [ringing]);

  const stopRinging = useCallback(() => setRinging(null), []);

  // --- controls ------------------------------------------------------------
  const cycleStyle = useCallback(
    (by: number) => {
      const i = STYLES.indexOf(prefs.style);
      setPref('style', STYLES[(((i + by) % STYLES.length) + STYLES.length) % STYLES.length]);
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

      if (view === 'timer' && !timerRunning) {
        setTimerLeft(v => {
          const next = Math.max(0, Math.min(99 * 3600000, v + count * 60000));
          setTimerSet(next);
          return next;
        });
      } else if (view === 'alarm') {
        setAlarm({ ...alarm, m: (((alarm.m + count) % 60) + 60) % 60 });
      } else if (view === 'clock') {
        cycleStyle(count);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (ringing && e.key !== 'Escape') return stopRinging();
      if (e.key === 'Escape') return setPanel(open => !open);
      // preset 1 pressed again on the screen it already opened walks the faces, so one button is the whole clock
      if (e.key === '1' && view === 'clock') return cycleStyle(1);
      if (e.key >= '1' && e.key <= '4') return setView(VIEWS[Number(e.key) - 1]);
      if (e.key === 'm' || e.key === 'M' || e.key === '5') {
        return setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]);
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (view === 'stopwatch') swToggle();
        else if (view === 'timer') timerToggle();
        else if (view === 'alarm') setAlarm({ ...alarm, on: !alarm.on });
      }
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [alarm, cycleStyle, panel, ringing, setAlarm, stopRinging, swToggle, timerRunning, timerToggle, view]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-screen text-off-white">
      <Wash pal={timerRunning && timerRemaining <= URGENT_AT ? URGENT : pal} />
      {view === 'clock' && <ClockFace prefs={prefs} zone={zone} at={at} pal={pal} />}
      {view === 'timer' && (
        <Timer
          remaining={timerRemaining}
          running={timerRunning}
          pal={timerRunning && timerRemaining <= URGENT_AT ? URGENT : pal}
          onToggle={timerToggle}
          onReset={timerReset}
          onStep={n => !timerRunning && setTimerLeft(v => { const x = Math.max(0, v + n); setTimerSet(x); return x; })}
        />
      )}
      {view === 'stopwatch' && (
        <Stopwatch elapsed={swElapsed} running={swRunning} laps={laps} pal={pal} onToggle={swToggle} onLap={swLap} onReset={swReset} />
      )}
      {view === 'alarm' && (
        <AlarmView alarm={alarm} pal={pal} zone={zone} at={at} format={prefs.format} onSet={setAlarm} />
      )}

      <Presets
        view={view}
        face={prefs.style}
        pal={pal}
        onPick={v => (v === 'clock' && view === 'clock' ? cycleStyle(1) : setView(v))}
      />

      {ringing && <Ringing kind={ringing.kind} pal={ringing.kind === 'timer' ? URGENT : pal} onStop={stopRinging} />}
      {panel && <Settings prefs={prefs} setPref={setPref} tint={tint} />}
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
// the names are there to teach the mapping, not to sit over a clock forever
const PRESET_LABEL_MS = 4200;

const FACE_LABELS: Record<Prefs['style'], string> = {
  digital: 'Digital',
  analogue: 'Analogue',
  flip: 'Flip',
  minimal: 'Minimal',
};

function Presets({
  view,
  face,
  pal,
  onPick,
}: {
  view: View;
  face: Prefs['style'];
  pal: Palette;
  onPick: (v: View) => void;
}) {
  const [named, setNamed] = useState(true);
  useEffect(() => {
    setNamed(true);
    const id = setTimeout(() => setNamed(false), PRESET_LABEL_MS);
    return () => clearTimeout(id);
  }, [view, face]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[2]">
      {/* one band along the whole edge rather than a chip behind each name: four dark patches read
          as stuck on top of the clock, a single fade reads as part of the edge they point at */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 via-black/15 to-transparent" />
      {VIEWS.map((v, i) => {
        const here = v === view;
        return (
          <button
            key={v}
            onClick={() => onPick(v)}
            className="pointer-events-auto absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1.5 px-5 pb-3"
            style={{ left: `${PRESET_AT[i]}%` }}>
            <span
              className={`w-[61px] shrink-0 rounded-b-full transition-all duration-700 ${
                here || named ? 'h-[2px]' : 'h-px'
              }`}
              style={{
                background: here ? fill(pal) : '#efefef',
                opacity: here ? 0.95 : named ? 0.45 : 0.22,
              }}
            />
            <span
              className={`text-hint whitespace-nowrap transition-opacity duration-700 ${named ? 'opacity-100' : 'opacity-0'}`}
              style={{ color: here ? pal.main : 'rgba(239,239,239,0.5)' }}>
              {v === 'clock' && here ? FACE_LABELS[face] : LABELS[v]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ClockFace({ prefs, zone, at, pal }: { prefs: Prefs; zone: ReturnType<typeof useZone>; at: Date; pal: Palette }) {
  const parts = readClock(at, zone, prefs.format);
  const { h, m, s } = fields(at, zone);

  const foot = (
    <div className="absolute inset-x-0 bottom-7 flex flex-col items-center gap-1 text-hint text-dim">
      {prefs.date && <span>{parts.date}</span>}
      {!zone.synced && <span className="opacity-70">waiting for the phone's clock</span>}
    </div>
  );

  if (prefs.style === 'analogue')
    return (
      <div className="grid h-full w-full place-items-center">
        <Analogue h={h} m={m} s={s} pal={pal} seconds={prefs.seconds} />
        {foot}
      </div>
    );

  if (prefs.style === 'flip')
    return (
      <div className="grid h-full w-full place-items-center">
        <div className="flex items-center gap-3">
          <Flip value={parts.hour} pal={pal} />
          <Flip value={parts.minute} pal={pal} />
          {prefs.seconds && <Flip value={parts.second} pal={pal} small />}
          {parts.dayPeriod && <span className="ml-1 self-end pb-3 font-mono text-title text-dim">{parts.dayPeriod}</span>}
        </div>
        {foot}
      </div>
    );

  if (prefs.style === 'minimal')
    return (
      <div className="grid h-full w-full place-items-center">
        <div className="flex items-baseline gap-2 font-display tracking-display">
          <span className="text-[7rem] leading-none font-light tabular-nums" style={{ color: pal.main }}>
            {parts.hour}
          </span>
          <span className="text-[7rem] leading-none font-light text-dim">:</span>
          <span className="text-[7rem] leading-none font-light tabular-nums" style={{ color: pal.second }}>
            {parts.minute}
          </span>
        </div>
        {foot}
      </div>
    );

  return (
    <div className="grid h-full w-full place-items-center">
      <div className="flex items-baseline gap-1 font-mono tabular-nums">
        <span className="text-[8rem] leading-none" style={{ color: pal.main }}>
          {parts.hour}
        </span>
        <span className="text-[8rem] leading-none opacity-40" style={{ color: pal.main }}>
          :
        </span>
        <span className="text-[8rem] leading-none" style={{ color: pal.second }}>
          {parts.minute}
        </span>
        {prefs.seconds && (
          <span className="ml-2 self-end pb-4 text-[2.5rem] leading-none opacity-70" style={{ color: pal.second }}>
            {parts.second}
          </span>
        )}
        {parts.dayPeriod && <span className="ml-2 self-end pb-5 text-title text-dim">{parts.dayPeriod}</span>}
      </div>
      {foot}
    </div>
  );
}

function Analogue({ h, m, s, pal, seconds }: { h: number; m: number; s: number; pal: Palette; seconds: boolean }) {
  const hand = (deg: number, len: number, width: number, colour: string, round = true) => (
    <line
      x1="100"
      y1="100"
      x2={100 + len * Math.sin((deg * Math.PI) / 180)}
      y2={100 - len * Math.cos((deg * Math.PI) / 180)}
      stroke={colour}
      strokeWidth={width}
      strokeLinecap={round ? 'round' : 'butt'}
    />
  );
  return (
    <svg viewBox="0 0 200 200" className="h-[19rem] w-[19rem]">
      <defs>
        <linearGradient id="dial" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={pal.main} />
          <stop offset="100%" stopColor={pal.second} />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="none" stroke="url(#dial)" strokeOpacity="0.35" strokeWidth="2" />
      {Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        const a = (i * 6 * Math.PI) / 180;
        const r1 = major ? 80 : 86;
        return (
          <line
            key={i}
            x1={100 + r1 * Math.sin(a)}
            y1={100 - r1 * Math.cos(a)}
            x2={100 + 90 * Math.sin(a)}
            y2={100 - 90 * Math.cos(a)}
            stroke={major ? pal.main : 'rgba(255,255,255,0.18)'}
            strokeOpacity={major ? 0.6 : 1}
            strokeWidth={major ? 3 : 1.5}
            strokeLinecap="round"
          />
        );
      })}
      {hand(((h % 12) + m / 60) * 30, 48, 7, '#efefef')}
      {hand((m + s / 60) * 6, 68, 5, pal.main)}
      {seconds && hand(s * 6, 76, 2, pal.second)}
      <circle cx="100" cy="100" r="5" fill="url(#dial)" />
    </svg>
  );
}

// matches the two 0.2s halves of the flip animation in index.css
const FLIP_MS = 400;

function Flip({ value, pal, small }: { value: string; pal: Palette; small?: boolean }) {
  // the app re-renders twenty times a second, so the card has to remember what it is turning from
  // rather than try to infer it from a render
  const [card, setCard] = useState({ shown: value, from: null as string | null, turn: 0 });

  useEffect(() => {
    setCard(c => (c.shown === value ? c : { shown: value, from: c.shown, turn: c.turn + 1 }));
  }, [value]);

  useEffect(() => {
    if (card.from === null) return;
    const id = setTimeout(() => setCard(c => ({ ...c, from: null })), FLIP_MS);
    return () => clearTimeout(id);
  }, [card.from, card.turn]);

  // every leaf is a full-card digit clipped to one half, so all four cut the same glyph in the same
  // place. they stay direct children of the card because that is as far as its perspective reaches
  const leaf = (half: 'top' | 'bottom', v: string, cls: string, shade?: string) => (
    <div
      className={`absolute inset-x-0 h-1/2 overflow-hidden ${
        half === 'top' ? 'top-0 flip-top rounded-t-2xl' : 'bottom-0 flip-bottom rounded-b-2xl'
      } ${cls}`}>
      <div className={`absolute inset-x-0 grid h-[200%] place-items-center ${half === 'top' ? 'top-0' : 'bottom-0'}`}>
        <span className="tabular-nums" style={ink(pal)}>
          {v}
        </span>
      </div>
      {shade && <span className={`${shade} absolute inset-0 bg-black`} />}
    </div>
  );

  return (
    <div
      className={`flip-card relative rounded-2xl font-mono leading-none ring-1 ring-white/10 ${
        small ? 'h-24 w-20 text-[3rem]' : 'h-40 w-32 text-[5.5rem]'
      }`}>
      {leaf('top', card.shown, 'z-[1]')}
      {leaf('bottom', card.from ?? card.shown, 'z-[1]')}
      {card.from !== null && (
        <Fragment key={card.turn}>
          {leaf('bottom', card.shown, 'z-[2] flip-leaf flip-rise', 'flip-shade-out')}
          {leaf('top', card.from, 'z-[3] flip-leaf flip-fall', 'flip-shade-in')}
        </Fragment>
      )}
      <div className="absolute inset-x-0 top-1/2 z-[4] h-px bg-black/55" />
    </div>
  );
}

function Big({ children, pal }: { children: ReactNode; pal: Palette }) {
  return (
    <div className="font-mono text-[5.5rem] leading-none tabular-nums" style={ink(pal)}>
      {children}
    </div>
  );
}

function Key({ label, onClick, pal, wide }: { label: string; onClick: () => void; pal?: Palette; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-6 py-3 text-row font-medium transition active:scale-95 ${wide ? 'min-w-32' : ''}`}
      style={{ background: pal ? fill(pal) : 'rgba(255,255,255,0.10)', color: pal ? '#0a0c0e' : '#efefef' }}>
      {label}
    </button>
  );
}

function Timer({
  remaining,
  running,
  pal,
  onToggle,
  onReset,
  onStep,
}: {
  remaining: number;
  running: boolean;
  pal: Palette;
  onToggle: () => void;
  onReset: () => void;
  onStep: (ms: number) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 pt-10">
      <Big pal={pal}>{clockText(remaining)}</Big>
      <div className="flex items-center gap-3">
        {!running && <Key label="−1 min" onClick={() => onStep(-60000)} />}
        <Key label={running ? 'Pause' : 'Start'} onClick={onToggle} pal={pal} wide />
        {!running && <Key label="+1 min" onClick={() => onStep(60000)} />}
        <Key label="Reset" onClick={onReset} />
      </div>
      <div className="text-hint text-dim">{running ? 'counting down' : 'turn the wheel to set the minutes'}</div>
    </div>
  );
}

function Stopwatch({
  elapsed,
  running,
  laps,
  pal,
  onToggle,
  onLap,
  onReset,
}: {
  elapsed: number;
  running: boolean;
  laps: number[];
  pal: Palette;
  onToggle: () => void;
  onLap: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex h-full w-full items-center gap-8 px-10 pt-10">
      <div className="flex flex-1 flex-col items-center gap-6">
        <Big pal={pal}>{clockText(elapsed, true)}</Big>
        <div className="flex items-center gap-3">
          <Key label={running ? 'Stop' : 'Start'} onClick={onToggle} pal={pal} wide />
          <Key label="Lap" onClick={onLap} />
          <Key label="Reset" onClick={onReset} />
        </div>
      </div>
      {laps.length > 0 && (
        <div className="h-full max-h-[19rem] w-52 shrink-0 self-center overflow-y-auto rounded-2xl bg-white/4 p-3 [scrollbar-width:none]">
          {laps.map((lap, i) => (
            <div key={i} className="flex justify-between border-b border-white/6 py-1.5 font-mono text-hint last:border-0">
              <span className="text-dim">{laps.length - i}</span>
              <span className="tabular-nums" style={{ color: i === 0 ? pal.main : undefined, opacity: 1 - Math.min(i, 6) * 0.09 }}>
                {clockText(lap, true)}
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
        <div className="animate-ring font-display text-[3.5rem] leading-none font-semibold" style={ink(pal)}>
          {kind === 'alarm' ? 'Alarm' : 'Time up'}
        </div>
        <div className="text-title text-dim">touch anywhere, or any button, to stop</div>
      </div>
    </button>
  );
}

function Settings({ prefs, setPref, tint }: { prefs: Prefs; setPref: (k: keyof Prefs, v: string) => void; tint: string }) {
  const row = (label: string, control: ReactNode) => (
    <div className="flex items-center justify-between gap-5 border-b border-white/6 px-4 py-2.5 last:border-0">
      <span className="text-title text-near">{label}</span>
      {control}
    </div>
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
  const toggle = (on: boolean, onPick: () => void) => (
    <button
      role="switch"
      aria-checked={on}
      onClick={onPick}
      className="relative h-8 w-14 shrink-0 rounded-full transition-colors"
      style={{ backgroundColor: on ? tint : 'rgba(255,255,255,0.16)' }}>
      <span className="absolute top-1 h-6 w-6 rounded-full bg-screen transition-[left]" style={{ left: on ? '28px' : '4px' }} />
    </button>
  );

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-screen/97 px-8 py-5 backdrop-blur-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Settings</span>
        <span className="text-hint text-dim">the button under the wheel closes this</span>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl bg-white/4 [scrollbar-width:none]">
        {row('Clock face', seg(STYLES, ['Digital', 'Analogue', 'Flip', 'Minimal'], prefs.style, v => setPref('style', v)))}
        {row('Hour format', seg(['auto', 'h12', 'h24'] as const, ['Auto', '12h', '24h'], prefs.format, v => setPref('format', v)))}
        {row(
          'Colour',
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
        )}
        {row('Show seconds', toggle(prefs.seconds, () => setPref('seconds', prefs.seconds ? 'false' : 'true')))}
        {row('Show the date', toggle(prefs.date, () => setPref('date', prefs.date ? 'false' : 'true')))}
        {row('Sound when it rings', toggle(prefs.chime, () => setPref('chime', prefs.chime ? 'false' : 'true')))}
      </div>
      <div className="mt-2 text-hint text-dim">Changing a setting in the companion app overrides it here.</div>
    </div>
  );
}
