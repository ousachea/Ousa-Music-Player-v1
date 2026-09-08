import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { fill, ms, type Palette, type Prefs, type TimerMode } from './config';
import { clockText } from './time';
import { Big, Key, Ring } from './ui';

// a countdown that has to be dialled starts somewhere, and five minutes is the length people reach
// for first
const OPENING = 5 * 60000;
const MAX = 99 * 3600000;
// the kitchen dial is a real dial: one turn, an hour, whole minutes
const KITCHEN_MAX = 60 * 60000;
const PRESETS = [60000, 5 * 60000, 10 * 60000, 30 * 60000];
const MULTI_MAX = 4;

type Phase = 'work' | 'rest';
type Slot = { id: number; len: number; end: number | null; left: number };

export type TimerApi = {
  render: (pal: Palette) => ReactNode;
  toggle: () => void;
  reset: () => void;
  wheel: (count: number) => void;
  running: boolean;
  // the last stretch of a plain countdown, which the whole screen changes colour for
  urgent: boolean;
};

const single = (mode: TimerMode) => mode !== 'pomodoro' && mode !== 'interval' && mode !== 'multi';

export function useTimer({
  prefs,
  now,
  onRing,
  onChime,
}: {
  prefs: Prefs;
  now: number;
  onRing: () => void;
  onChime: () => void;
}): TimerApi {
  const mode = prefs.timerMode;
  const [len, setLen] = useState(OPENING);
  const [end, setEnd] = useState<number | null>(null);
  const [left, setLeft] = useState(OPENING);
  const [phase, setPhase] = useState<Phase>('work');
  const [round, setRound] = useState(1);
  const [slots, setSlots] = useState<Slot[]>([
    { id: 1, len: 5 * 60000, end: null, left: 5 * 60000 },
    { id: 2, len: 10 * 60000, end: null, left: 10 * 60000 },
  ]);
  const [pick, setPick] = useState(0);

  const work = mode === 'pomodoro' ? ms(prefs.pomodoroWork) : ms(prefs.intervalWork);
  const rest = mode === 'pomodoro' ? ms(prefs.pomodoroBreak) : ms(prefs.intervalRest);
  const rounds = Number(prefs.intervalRounds);

  const running = mode === 'multi' ? slots.some(s => s.end !== null) : end !== null;
  const remaining = end === null ? left : Math.max(0, end - now);

  // the length you dialled is yours, and a phase left over from pomodoro or interval is not, so a
  // mode change goes back to the dialled length rather than to whatever was on the clock
  const dialled = useRef(len);
  dialled.current = len;

  // switching mode, or changing a length the mode runs on, puts that mode back at its own start
  const head = useCallback(() => {
    setEnd(null);
    setPhase('work');
    setRound(1);
    if (mode === 'pomodoro') setLeft(ms(prefs.pomodoroWork));
    else if (mode === 'interval') setLeft(ms(prefs.intervalWork));
    else setLeft(mode === 'kitchen' ? Math.min(dialled.current, KITCHEN_MAX) : dialled.current);
  }, [mode, prefs.pomodoroWork, prefs.intervalWork]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    head();
  }, [head]);

  // --- what reaching zero means, which is the only thing the modes really differ on ---------
  useEffect(() => {
    if (end === null || now < end) return;
    if (mode === 'pomodoro') {
      const next = phase === 'work' ? 'rest' : 'work';
      onChime();
      setPhase(next);
      if (next === 'work') setRound(r => r + 1);
      setEnd(Date.now() + (next === 'work' ? work : rest));
      return;
    }
    if (mode === 'interval') {
      if (phase === 'work') {
        onChime();
        setPhase('rest');
        setEnd(Date.now() + rest);
        return;
      }
      if (round >= rounds) {
        setEnd(null);
        setLeft(0);
        onRing();
        return;
      }
      onChime();
      setPhase('work');
      setRound(r => r + 1);
      setEnd(Date.now() + work);
      return;
    }
    setEnd(null);
    setLeft(0);
    onRing();
  }, [now, end, mode, phase, round, rounds, work, rest, onChime, onRing]);

  useEffect(() => {
    if (mode !== 'multi') return;
    const done = slots.find(s => s.end !== null && now >= s.end);
    if (!done) return;
    setSlots(list => list.map(s => (s.id === done.id ? { ...s, end: null, left: s.len } : s)));
    onRing();
  }, [now, mode, slots, onRing]);

  // --- controls ----------------------------------------------------------------------------
  const startAt = useCallback((v: number) => {
    if (v <= 0) return;
    setLeft(v);
    setEnd(Date.now() + v);
  }, []);

  const toggle = useCallback(() => {
    if (mode === 'multi') {
      setSlots(list =>
        list.map((s, i) =>
          i !== pick ? s : s.end === null ? { ...s, end: Date.now() + s.left } : { ...s, left: Math.max(0, s.end - Date.now()), end: null },
        ),
      );
      return;
    }
    if (end === null) {
      if (mode === 'pomodoro' || mode === 'interval') startAt(left || (phase === 'work' ? work : rest));
      else startAt(left);
    } else {
      setLeft(Math.max(0, end - Date.now()));
      setEnd(null);
    }
  }, [mode, end, left, phase, work, rest, pick, startAt]);

  const reset = useCallback(() => {
    if (mode === 'multi') {
      setSlots(list => list.map(s => ({ ...s, end: null, left: s.len })));
      return;
    }
    setEnd(null);
    setPhase('work');
    setRound(1);
    if (mode === 'pomodoro') setLeft(work);
    else if (mode === 'interval') setLeft(work);
    else setLeft(len);
  }, [mode, work, len]);

  const nudge = useCallback(
    (by: number) => {
      if (mode === 'multi') {
        setSlots(list =>
          list.map((s, i) => {
            if (i !== pick || s.end !== null) return s;
            const v = Math.max(0, Math.min(MAX, s.left + by));
            return { ...s, left: v, len: v };
          }),
        );
        return;
      }
      if (end !== null || mode === 'pomodoro' || mode === 'interval') return;
      setLeft(v => {
        const cap = mode === 'kitchen' ? KITCHEN_MAX : MAX;
        const next = Math.max(0, Math.min(cap, v + by));
        setLen(next);
        return next;
      });
    },
    [mode, end, pick],
  );

  const step = mode === 'kitchen' ? 60000 : ms(prefs.timerStep);
  const wheel = useCallback((count: number) => nudge(count * step), [nudge, step]);

  const addSlot = useCallback(() => {
    setSlots(list => (list.length >= MULTI_MAX ? list : [...list, { id: Date.now(), len: OPENING, end: null, left: OPENING }]));
  }, []);
  const dropSlot = useCallback(() => {
    setSlots(list => (list.length <= 1 ? list : list.slice(0, -1)));
    setPick(i => Math.max(0, i - 1));
  }, []);

  const render = useCallback(
    (pal: Palette): ReactNode => {
      const common = { pal, remaining, running: end !== null, onToggle: toggle, onReset: reset };
      switch (mode) {
        case 'circular':
          return <Circular {...common} whole={len || 1} onStep={nudge} step={step} />;
        case 'kitchen':
          return <Kitchen {...common} onStep={nudge} />;
        case 'preset':
          return <Preset {...common} onPick={startAt} />;
        case 'pomodoro':
          return <Pomodoro {...common} phase={phase} round={round} whole={phase === 'work' ? work : rest} />;
        case 'interval':
          return <Interval {...common} phase={phase} round={round} rounds={rounds} whole={phase === 'work' ? work : rest} />;
        case 'multi':
          return (
            <Multi
              pal={pal}
              slots={slots}
              now={now}
              pick={pick}
              onPick={setPick}
              onToggle={toggle}
              onReset={reset}
              onAdd={addSlot}
              onDrop={dropSlot}
            />
          );
        default:
          return <Countdown {...common} onStep={nudge} step={step} />;
      }
    },
    [mode, remaining, end, toggle, reset, nudge, step, len, startAt, phase, round, rounds, work, rest, slots, now, pick, addSlot, dropSlot],
  );

  return { render, toggle, reset, wheel, running, urgent: single(mode) && end !== null && remaining <= 10000 };
}

// ---------------------------------------------------------------------------

type Common = {
  pal: Palette;
  remaining: number;
  running: boolean;
  onToggle: () => void;
  onReset: () => void;
};

const stepLabel = (step: number) => (step < 60000 ? `${step / 1000} sec` : `${step / 60000} min`);

function Frame({ children }: { children: ReactNode }) {
  return <div className="flex h-full w-full flex-col items-center justify-center gap-6 pt-10">{children}</div>;
}

function Transport({ running, pal, onToggle, onReset, extra }: Common & { extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {extra}
      <Key label={running ? 'Pause' : 'Start'} onClick={onToggle} pal={pal} wide />
      <Key label="Reset" onClick={onReset} />
    </div>
  );
}

function Countdown(props: Common & { onStep: (ms: number) => void; step: number }) {
  const { pal, remaining, running, onStep, step } = props;
  return (
    <Frame>
      <Big pal={pal}>{clockText(remaining)}</Big>
      <Transport
        {...props}
        extra={!running ? <Key label={`−${stepLabel(step)}`} onClick={() => onStep(-step)} /> : undefined}
      />
      <div className="text-hint text-dim">{running ? 'counting down' : `turn the wheel, ${stepLabel(step)} a click`}</div>
    </Frame>
  );
}

function Circular(props: Common & { whole: number; onStep: (ms: number) => void; step: number }) {
  const { pal, remaining, whole, running, onStep, step } = props;
  return (
    <div className="flex h-full w-full items-center justify-center gap-12 pt-8">
      <Ring fraction={whole ? remaining / whole : 0} pal={pal} size="17rem">
        <Big pal={pal} size="3.25rem">
          {clockText(remaining)}
        </Big>
        <span className="mt-1 text-hint text-dim">{running ? 'counting down' : 'ready'}</span>
      </Ring>
      <div className="flex flex-col items-stretch gap-3">
        <Transport {...props} />
        {!running && (
          <div className="flex items-center gap-3">
            <Key label={`−${stepLabel(step)}`} onClick={() => onStep(-step)} small />
            <Key label={`+${stepLabel(step)}`} onClick={() => onStep(step)} small />
          </div>
        )}
      </div>
    </div>
  );
}

// the wedge is the dial you turned, so it shrinks back to twelve o'clock as the hour runs out
function Kitchen(props: Common & { onStep: (ms: number) => void }) {
  const { pal, remaining, running, onStep } = props;
  const turn = Math.min((remaining / KITCHEN_MAX) * 360, 359.9);
  const large = turn > 180 ? 1 : 0;
  const rad = ((turn - 90) * Math.PI) / 180;
  return (
    <div className="flex h-full w-full items-center justify-center gap-12 pt-8">
      <div className="relative grid h-[17rem] w-[17rem] place-items-center">
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="wedge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={pal.main} />
              <stop offset="100%" stopColor={pal.second} />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="94" fill="rgba(255,255,255,0.04)" />
          {turn > 0.5 && (
            <path
              d={`M100 100 L100 6 A94 94 0 ${large} 1 ${100 + 94 * Math.cos(rad)} ${100 + 94 * Math.sin(rad)} Z`}
              fill="url(#wedge)"
              opacity="0.85"
            />
          )}
          {Array.from({ length: 12 }, (_, i) => {
            const a = ((i * 30 - 90) * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={100 + 84 * Math.cos(a)}
                y1={100 + 84 * Math.sin(a)}
                x2={100 + 94 * Math.cos(a)}
                y2={100 + 94 * Math.sin(a)}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="2"
              />
            );
          })}
          <circle cx="100" cy="100" r="52" fill="#080a0c" />
        </svg>
        <div className="relative flex flex-col items-center">
          <Big pal={pal} size="2.5rem">
            {clockText(remaining)}
          </Big>
        </div>
      </div>
      <div className="flex flex-col items-stretch gap-3">
        <Transport {...props} />
        {!running && (
          <div className="flex items-center gap-3">
            <Key label="−1 min" onClick={() => onStep(-60000)} small />
            <Key label="+1 min" onClick={() => onStep(60000)} small />
          </div>
        )}
        <span className="text-center text-hint text-dim">one turn of the wheel, one minute</span>
      </div>
    </div>
  );
}

function Preset(props: Common & { onPick: (ms: number) => void }) {
  const { pal, remaining, running, onPick } = props;
  return (
    <Frame>
      <Big pal={pal}>{clockText(remaining)}</Big>
      <div className="flex items-center gap-3">
        {PRESETS.map(p => (
          <Key key={p} label={p < 60000 ? `${p / 1000}s` : `${p / 60000} min`} onClick={() => onPick(p)} />
        ))}
      </div>
      <Transport {...props} />
      <div className="text-hint text-dim">{running ? 'counting down' : 'pick a length and it starts'}</div>
    </Frame>
  );
}

function Phased({
  pal,
  remaining,
  whole,
  phase,
  label,
  under,
  children,
}: {
  pal: Palette;
  remaining: number;
  whole: number;
  phase: Phase;
  label: string;
  under: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-12 pt-8">
      <Ring fraction={whole ? remaining / whole : 0} pal={pal} size="17rem">
        <span
          className="font-mono text-eyebrow tracking-[0.3em] uppercase"
          style={{ color: phase === 'work' ? pal.main : pal.second }}>
          {label}
        </span>
        <Big pal={pal} size="3.25rem">
          {clockText(remaining)}
        </Big>
        {under}
      </Ring>
      <div className="flex flex-col items-stretch gap-3">{children}</div>
    </div>
  );
}

function Pomodoro(props: Common & { phase: Phase; round: number; whole: number }) {
  const { pal, remaining, phase, round, whole } = props;
  return (
    <Phased
      pal={pal}
      remaining={remaining}
      whole={whole}
      phase={phase}
      label={phase === 'work' ? 'work' : 'break'}
      under={<span className="mt-1 text-hint text-dim">round {round}</span>}>
      <Transport {...props} />
      <span className="text-center text-hint text-dim">it moves itself between work and break</span>
    </Phased>
  );
}

function Interval(props: Common & { phase: Phase; round: number; rounds: number; whole: number }) {
  const { pal, remaining, phase, round, rounds, whole } = props;
  return (
    <Phased
      pal={pal}
      remaining={remaining}
      whole={whole}
      phase={phase}
      label={phase === 'work' ? 'work' : 'rest'}
      under={
        <span className="mt-1 text-hint text-dim">
          round {Math.min(round, rounds)} of {rounds}
        </span>
      }>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: rounds }, (_, i) => (
          <span
            key={i}
            className="h-2 w-6 rounded-full"
            style={{ background: i < round - 1 ? fill(pal) : i === round - 1 ? pal.main : 'rgba(255,255,255,0.14)' }}
          />
        ))}
      </div>
      <Transport {...props} />
      <span className="text-center text-hint text-dim">work and rest are settings on this screen</span>
    </Phased>
  );
}

function Multi({
  pal,
  slots,
  now,
  pick,
  onPick,
  onToggle,
  onReset,
  onAdd,
  onDrop,
}: {
  pal: Palette;
  slots: Slot[];
  now: number;
  pick: number;
  onPick: (i: number) => void;
  onToggle: () => void;
  onReset: () => void;
  onAdd: () => void;
  onDrop: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 pt-9">
      <div className="flex items-stretch gap-3">
        {slots.map((s, i) => {
          const left = s.end === null ? s.left : Math.max(0, s.end - now);
          const here = i === pick;
          return (
            <button
              key={s.id}
              onClick={() => onPick(i)}
              className="flex w-40 flex-col items-center gap-2 rounded-2xl px-3 py-4 transition"
              style={{
                background: here ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
                outline: here ? `2px solid ${pal.main}` : '2px solid transparent',
              }}>
              <span className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">{i + 1}</span>
              <Big pal={pal} size="1.9rem">
                {clockText(left)}
              </Big>
              <span className="text-hint text-dim">{s.end === null ? 'held' : 'running'}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Key label="−" onClick={onDrop} />
        <Key label="Start / Pause" onClick={onToggle} pal={pal} wide />
        <Key label="Reset all" onClick={onReset} />
        <Key label="+" onClick={onAdd} />
      </div>
      <div className="text-hint text-dim">the wheel sets the one you picked; the button starts it</div>
    </div>
  );
}
