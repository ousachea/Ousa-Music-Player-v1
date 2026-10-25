// the deck: tiles that act on the mac the car thing is plugged into. the mac's extension lists what can be run, with
// each app's own icon, and this page only ever names one of those. presets pick the page, the wheel turns the mac's
// volume on the first page and scrolls the others, and holding a tile pins it to the last page
import { BridgethingClient } from '@bridgething/client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { daemonUrl } from './daemon';
import { CONTROLS, readToDeck, type Action, type ToMac } from './protocol';

const PAGES = ['Controls', 'Shortcuts', 'Apps', 'Pinned'] as const;
type Page = (typeof PAGES)[number];
const HOLD_MS = 550;
// how long the deck waits for the mac to answer before it says what is missing
const WAIT_MS = 4000;
const PINS_KEY = 'pins';

type Flash = 'ok' | 'fail' | 'busy';
type Mac = { volume: number; muted: boolean; micMuted: boolean };

function hue(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}

const Svg = ({ children, className = 'h-7 w-7' }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const GLYPH: Record<string, ReactNode> = {
  mic: <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />,
  'mic-off': <path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5.5 11a6.5 6.5 0 0 0 10.9 4.8M18.5 11c0 .6-.1 1.2-.2 1.8M12 17.5V21M3 3l18 18" />,
  mute: <path d="M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6" />,
  sound: <path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />,
  screenshot: <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0" />,
  mission: <path d="M3 5h8v6H3zM13 5h8v6h-8zM3 13h8v6H3zM13 13h8v6h-8z" />,
  'display-sleep': <path d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2" />,
  sleep: <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />,
  shortcut: <path d="M13 3L4 14h7l-1 7 9-11h-7z" />,
  pin: <path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M5 12h14M12 5v14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
};

// each control keeps its own colour, the way a hardware deck labels its keys
const CONTROL_TINT: Record<string, string> = {
  mic: '#ff5d6c',
  mute: '#ffb627',
  screenshot: '#4fc3ff',
  mission: '#a78bfa',
  'display-sleep': '#94a3b8',
  sleep: '#818cf8',
};

// the press handling every tile shares: a tap runs, a hold pins, and only a press that began on the tile counts
function usePress(onRun: () => void, onPin: () => void) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const pressed = useRef(false);
  const cancel = () => {
    pressed.current = false;
    if (hold.current) clearTimeout(hold.current);
  };
  return {
    onPointerDown: () => {
      pressed.current = true;
      held.current = false;
      hold.current = setTimeout(() => {
        held.current = true;
        onPin();
      }, HOLD_MS);
    },
    onPointerUp: () => {
      const tap = pressed.current && !held.current;
      cancel();
      if (tap) onRun();
    },
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}

function Badge({ flash, pinned }: { flash: Flash | null; pinned: boolean }) {
  if (flash === 'ok' || flash === 'fail')
    return (
      <span className={`absolute top-2 right-2 grid h-6 w-6 animate-pop place-items-center rounded-full ${flash === 'ok' ? 'bg-ok text-screen' : 'bg-err text-white'}`}>
        <Svg className="h-4 w-4">{GLYPH[flash === 'ok' ? 'check' : 'cross']}</Svg>
      </span>
    );
  return pinned ? (
    <span className="absolute top-2.5 right-2.5 text-white/55">
      <Svg className="h-4 w-4">{GLYPH.pin}</Svg>
    </span>
  ) : null;
}

function ControlTile({ action, mac, flash, pinned, onRun, onPin }: { action: Action; mac: Mac | null; flash: Flash | null; pinned: boolean; onRun: () => void; onPin: () => void }) {
  const press = usePress(onRun, onPin);
  const tint = CONTROL_TINT[action.id] ?? '#94a3b8';
  // the two toggles show what they are set to, lit while on
  const on = (action.id === 'mic' && mac?.micMuted) || (action.id === 'mute' && mac?.muted);
  const glyph = action.id === 'mic' && mac?.micMuted ? 'mic-off' : action.id === 'mute' && !mac?.muted ? 'sound' : action.id;
  const label = action.id === 'mic' ? (mac?.micMuted ? 'Mic is off' : 'Mute mic') : action.id === 'mute' ? (mac?.muted ? 'Sound is off' : 'Mute sound') : action.label;
  return (
    <button
      {...press}
      className={`relative flex flex-col justify-between overflow-hidden rounded-[22px] border p-4 text-left transition duration-200 active:scale-[0.96] ${flash === 'busy' ? 'animate-pulse' : ''}`}
      style={{
        background: on ? `linear-gradient(150deg, ${tint}, color-mix(in oklab, ${tint} 55%, #000))` : 'linear-gradient(150deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))',
        borderColor: on ? 'transparent' : 'rgba(255,255,255,0.08)',
        boxShadow: on ? `0 10px 30px color-mix(in srgb, ${tint} 40%, transparent)` : '0 8px 22px rgba(0,0,0,0.3)',
      }}>
      <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: on ? 'rgba(255,255,255,0.22)' : `color-mix(in srgb, ${tint} 20%, transparent)`, color: on ? '#fff' : tint }}>
        <Svg className="h-6 w-6">{GLYPH[glyph]}</Svg>
      </span>
      <span className="text-[1rem] leading-tight font-semibold text-white">{label}</span>
      <Badge flash={flash} pinned={pinned} />
    </button>
  );
}

function ShortcutTile({ action, flash, pinned, onRun, onPin }: { action: Action; flash: Flash | null; pinned: boolean; onRun: () => void; onPin: () => void }) {
  const press = usePress(onRun, onPin);
  const h = hue(action.label);
  return (
    <button
      {...press}
      className={`relative flex h-[112px] flex-col justify-between overflow-hidden rounded-[22px] p-4 text-left text-white transition duration-200 active:scale-[0.96] ${flash === 'busy' ? 'animate-pulse' : ''}`}
      style={{
        background: `linear-gradient(150deg, hsl(${h} 78% 58%), hsl(${(h + 35) % 360} 72% 38%))`,
        boxShadow: `0 10px 24px hsl(${h} 70% 20% / 0.45), inset 0 1px 0 rgba(255,255,255,0.25)`,
      }}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/22">
        <Svg className="h-5 w-5">{GLYPH.shortcut}</Svg>
      </span>
      <span className="line-clamp-2 text-[0.98rem] leading-tight font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">{action.label}</span>
      <Badge flash={flash} pinned={pinned} />
    </button>
  );
}

function AppTile({ action, icon, flash, pinned, card, onRun, onPin }: { action: Action; icon: string | undefined; flash: Flash | null; pinned: boolean; card?: boolean; onRun: () => void; onPin: () => void }) {
  const press = usePress(onRun, onPin);
  const h = hue(action.label);
  return (
    <button
      {...press}
      className={`relative flex flex-col items-center justify-center gap-2 rounded-[22px] px-1 py-2.5 transition duration-200 active:scale-[0.92] ${card ? 'h-[112px] border border-white/8 bg-white/6' : ''} ${flash === 'busy' ? 'animate-pulse' : ''}`}>
      {icon ? (
        <img src={`data:image/png;base64,${icon}`} alt="" className="h-[60px] w-[60px] drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]" draggable={false} />
      ) : (
        <span className="grid h-[52px] w-[52px] place-items-center rounded-[14px] text-[1.4rem] font-bold text-white" style={{ background: `linear-gradient(150deg, hsl(${h} 60% 55%), hsl(${h} 60% 38%))` }}>
          {action.label.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="w-full truncate text-center text-[0.8rem] font-medium text-white/85">{action.label}</span>
      <Badge flash={flash} pinned={pinned} />
    </button>
  );
}

// the volume as a dial, with the wheel's job written under it
function Volume({ mac, onStep }: { mac: Mac | null; onStep: (delta: number) => void }) {
  const level = mac ? (mac.muted ? 0 : mac.volume) : 0;
  const r = 52;
  const arc = 2 * Math.PI * r * 0.75;
  return (
    <div className="flex w-[230px] shrink-0 flex-col items-center justify-between rounded-[26px] border border-white/8 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="font-mono text-[10px] tracking-[0.3em] text-dim">MAC VOLUME</div>
      <div className="relative h-[140px] w-[140px]">
        <svg viewBox="0 0 120 120" className="h-full w-full rotate-[135deg]">
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${arc} 999`} />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="url(#deck-vol)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(arc * level) / 100} 999`}
            className="transition-[stroke-dasharray] duration-300"
          />
          <defs>
            <linearGradient id="deck-vol" x1="0" x2="1">
              <stop offset="0" stopColor="#00a8e8" />
              <stop offset="1" stopColor="#7c5cff" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="font-display text-[2.6rem] leading-none font-semibold tabular-nums">{mac ? (mac.muted ? '–' : mac.volume) : '··'}</div>
            <div className="mt-1 text-[11px] text-dim">{mac?.muted ? 'muted' : 'turn the wheel'}</div>
          </div>
        </div>
      </div>
      <div className="flex w-full gap-2">
        {[-6, 6].map(d => (
          <button key={d} onClick={() => onStep(d)} className="grid h-11 flex-1 place-items-center rounded-2xl bg-white/8 text-white transition active:scale-95 active:bg-white/15">
            <Svg className="h-5 w-5">{GLYPH[d < 0 ? 'minus' : 'plus']}</Svg>
          </button>
        ))}
      </div>
    </div>
  );
}

const TAB_GLYPH: Record<Page, ReactNode> = {
  Controls: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" />,
  Shortcuts: GLYPH.shortcut,
  Apps: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  Pinned: GLYPH.pin,
};

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [page, setPage] = useState<Page>('Controls');
  const [actions, setActions] = useState<Action[] | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [mac, setMac] = useState<Mac | null>(null);
  const [forward, setForward] = useState<boolean | null>(null);
  const [waited, setWaited] = useState(false);
  const [pins, setPins] = useState<string[]>([]);
  const [flash, setFlash] = useState<Record<string, Flash>>({});
  const list = useRef<HTMLDivElement>(null);

  const send = (m: ToMac) => client.forward.json(m).catch(() => {});

  useEffect(() => {
    const off = client.forward.onJson(raw => {
      const m = readToDeck(raw);
      if (!m) return;
      if (m.type === 'catalog') setActions(m.actions);
      else if (m.type === 'icons') setIcons(prev => ({ ...prev, ...m.icons }));
      else if (m.type === 'state') setMac({ volume: m.volume, muted: m.muted, micMuted: m.micMuted });
      else {
        setFlash(f => ({ ...f, [m.id]: m.ok ? 'ok' : 'fail' }));
        setTimeout(() => setFlash(({ [m.id]: _gone, ...rest }) => rest), 1100);
      }
    });
    const offCaps = client.capabilities.onUpdate(s => setForward(s.capabilities.available.forward));
    client.capabilities.get().then(r => r.ok && setForward(r.response.capabilities.available.forward));
    client.store.get({ key: PINS_KEY }).then(r => {
      if (!r.ok || !r.response.value) return;
      try {
        const saved = JSON.parse(r.response.value);
        if (Array.isArray(saved)) setPins(saved.filter((p): p is string => typeof p === 'string'));
      } catch {
        // a pin list that will not parse is started over
      }
    });
    // the mac answers hello with its catalogue; asking again on reconnect covers a daemon or extension restart
    const offConn = client.on(e => e.type === 'open' && send({ type: 'hello' }));
    send({ type: 'hello' });
    const timer = setTimeout(() => setWaited(true), WAIT_MS);
    return () => {
      off();
      offCaps();
      offConn();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const run = (id: string) => {
    setFlash(f => ({ ...f, [id]: 'busy' }));
    send({ type: 'run', id });
  };
  const pin = (id: string) => {
    setPins(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      client.store.put({ key: PINS_KEY, value: JSON.stringify(next) }).catch(() => {});
      return next;
    });
  };
  const step = (delta: number) => send({ type: 'volume', delta });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) setPage(PAGES[i]);
      else if (e.key === 'm') setPage(p => PAGES[(PAGES.indexOf(p) + 1) % PAGES.length]);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX === 0 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      if (page === 'Controls') step(e.deltaX > 0 ? 3 : -3);
      else if (list.current) list.current.scrollTop += e.deltaX * 28;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const all = actions ?? CONTROLS;
  const of = (kind: Action['kind']) => all.filter(a => a.kind === kind);
  const pinned = pins.map(id => all.find(a => a.id === id)).filter((a): a is Action => !!a);
  const linked = actions !== null;

  const tile = (a: Action, card = false) => {
    const common = { flash: flash[a.id] ?? null, pinned: pins.includes(a.id), onRun: () => run(a.id), onPin: () => pin(a.id) };
    if (a.kind === 'control') return <ControlTile key={a.id} {...common} action={a} mac={mac} />;
    if (a.kind === 'shortcut') return <ShortcutTile key={a.id} {...common} action={a} />;
    return <AppTile key={a.id} {...common} action={a} icon={icons[a.id]} card={card} />;
  };

  const empty = (text: string) => <div className="grid flex-1 place-items-center px-10 text-center text-title text-soft">{text}</div>;

  return (
    <div className="flex h-full w-full flex-col gap-3.5 px-5 pt-4 pb-4 text-off-white" style={{ background: 'radial-gradient(120% 90% at 50% -20%, #1d2535, #0a0c10 62%)' }}>
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5 rounded-full border border-white/8 bg-white/5 p-0.5">
          {PAGES.map((p, i) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8rem] font-semibold transition duration-200 ${p === page ? 'bg-white text-screen shadow-[0_4px_14px_rgba(0,0,0,0.35)]' : 'text-soft'}`}>
              <Svg className="h-3.5 w-3.5">{TAB_GLYPH[p]}</Svg>
              {p}
              <span className={`font-mono text-[10px] ${p === page ? 'text-screen/45' : 'text-dim'}`}>{i + 1}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-2.5 py-1.5 font-mono text-[10px] tracking-[0.2em] text-soft uppercase">
          <span className={`h-2 w-2 rounded-full ${linked ? 'bg-ok shadow-[0_0_8px_#3ddc84]' : 'bg-warn'}`} />
          {linked ? 'mac' : 'no mac'}
        </div>
      </div>

      {!linked && waited ? (
        empty(
          forward === false
            ? 'No desktop link. Deck works the Mac this Car Thing is plugged into: open the bridgething desktop app there and turn on Deck’s extension.'
            : 'Waiting for the Mac. Open the bridgething desktop app there and turn on Deck’s extension.',
        )
      ) : page === 'Controls' ? (
        <div className="flex min-h-0 flex-1 gap-3.5">
          <Volume mac={mac} onStep={step} />
          <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-3">{of('control').filter(a => a.id !== 'vol-up' && a.id !== 'vol-down').map(a => tile(a))}</div>
        </div>
      ) : page === 'Shortcuts' ? (
        of('shortcut').length === 0 ? (
          empty('No shortcuts yet. Make one in the Shortcuts app on the Mac and it appears here.')
        ) : (
          <div ref={list} className="-m-2 grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-3 overflow-y-auto p-2 [scrollbar-width:none]">
            {of('shortcut').map(a => tile(a))}
          </div>
        )
      ) : page === 'Apps' ? (
        <div ref={list} className="-m-2 grid min-h-0 flex-1 auto-rows-min grid-cols-6 gap-x-2 gap-y-1 overflow-y-auto p-2 [scrollbar-width:none]">
          {of('app').map(a => tile(a))}
        </div>
      ) : pinned.length === 0 ? (
        empty('Hold any tile on the other pages to pin it here.')
      ) : (
        <div ref={list} className="-m-2 grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-3 overflow-y-auto p-2 [scrollbar-width:none]">
          {pinned.map(a => (a.kind === 'control' ? <div key={a.id} className="h-[112px] [&>button]:h-full">{tile(a)}</div> : tile(a, true)))}
        </div>
      )}
    </div>
  );
}
