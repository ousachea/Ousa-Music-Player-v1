// the deck: big tiles that act on the mac the car thing is plugged into. the mac's extension lists what can be run,
// and this page only ever names one of those. presets pick the page, the wheel turns the mac's volume on the first
// page and scrolls the others, and holding a tile pins it to the last page
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

function hue(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}

const ICONS: Record<string, ReactNode> = {
  mic: <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />,
  mute: <path d="M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6" />,
  'vol-down': <path d="M4 9v6h4l5 4V5L8 9zM16.5 12h4" />,
  'vol-up': <path d="M4 9v6h4l5 4V5L8 9zM16.5 12h4M18.5 10v4" />,
  screenshot: <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0" />,
  mission: <path d="M3 5h8v6H3zM13 5h8v6h-8zM3 13h8v6H3zM13 13h8v6h-8z" />,
  'display-sleep': <path d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2" />,
  sleep: <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />,
  shortcut: <path d="M13 3L4 14h7l-1 7 9-11h-7z" />,
};

function Tile({ action, pinned, flash, onRun, onPin }: { action: Action; pinned: boolean; flash: 'ok' | 'fail' | 'busy' | null; onRun: () => void; onPin: () => void }) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const h = hue(action.label);
  const start = () => {
    held.current = false;
    hold.current = setTimeout(() => {
      held.current = true;
      onPin();
    }, HOLD_MS);
  };
  const end = () => {
    if (hold.current) clearTimeout(hold.current);
    if (!held.current) onRun();
  };
  const tone =
    action.kind === 'control'
      ? 'linear-gradient(160deg, #2a2f38, #181b21)'
      : action.kind === 'shortcut'
        ? `linear-gradient(160deg, hsl(${h} 70% 46%), hsl(${(h + 40) % 360} 70% 32%))`
        : `linear-gradient(160deg, hsl(${h} 30% 26%), hsl(${h} 30% 16%))`;
  return (
    <button
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={() => hold.current && clearTimeout(hold.current)}
      className={`relative flex h-[104px] flex-col items-start justify-between overflow-hidden rounded-2xl p-3.5 text-left text-white shadow-[0_6px_16px_rgba(0,0,0,0.35)] transition active:scale-95 ${
        flash === 'busy' ? 'animate-pulse' : ''
      }`}
      style={{ background: tone, outline: flash === 'ok' ? '3px solid #3ddc84' : flash === 'fail' ? '3px solid #dc3d3d' : undefined }}>
      {action.kind === 'app' ? (
        <span className="grid h-9 w-9 place-items-center rounded-xl text-[1.1rem] font-bold" style={{ background: `hsl(${h} 60% 55%)` }}>
          {action.label.slice(0, 1).toUpperCase()}
        </span>
      ) : (
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[action.kind === 'shortcut' ? 'shortcut' : action.id]}
        </svg>
      )}
      <span className="line-clamp-2 text-[0.95rem] leading-tight font-semibold">{action.label}</span>
      {pinned && <span className="absolute top-2.5 right-3 text-[11px] text-white/70">PINNED</span>}
    </button>
  );
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [page, setPage] = useState<Page>('Controls');
  const [actions, setActions] = useState<Action[] | null>(null);
  const [mac, setMac] = useState<{ volume: number; muted: boolean; micMuted: boolean } | null>(null);
  const [forward, setForward] = useState<boolean | null>(null);
  const [waited, setWaited] = useState(false);
  const [pins, setPins] = useState<string[]>([]);
  const [flash, setFlash] = useState<Record<string, 'ok' | 'fail' | 'busy'>>({});
  const list = useRef<HTMLDivElement>(null);

  const send = (m: ToMac) => client.forward.json(m).catch(() => {});

  useEffect(() => {
    const off = client.forward.onJson(raw => {
      const m = readToDeck(raw);
      if (!m) return;
      if (m.type === 'catalog') setActions(m.actions);
      else if (m.type === 'state') setMac({ volume: m.volume, muted: m.muted, micMuted: m.micMuted });
      else {
        setFlash(f => ({ ...f, [m.id]: m.ok ? 'ok' : 'fail' }));
        setTimeout(() => setFlash(({ [m.id]: _gone, ...rest }) => rest), 900);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) setPage(PAGES[i]);
      else if (e.key === 'm') setPage(p => PAGES[(PAGES.indexOf(p) + 1) % PAGES.length]);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX === 0 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      if (page === 'Controls') send({ type: 'volume', delta: e.deltaX > 0 ? 3 : -3 });
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
  const shown =
    page === 'Controls'
      ? all.filter(a => a.kind === 'control')
      : page === 'Shortcuts'
        ? all.filter(a => a.kind === 'shortcut')
        : page === 'Apps'
          ? all.filter(a => a.kind === 'app')
          : pins.map(id => all.find(a => a.id === id)).filter((a): a is Action => !!a);
  const linked = actions !== null;

  return (
    <div className="flex h-full w-full flex-col gap-3 bg-bg px-5 pt-4 pb-4 text-off-white">
      <div className="flex items-center gap-2">
        {PAGES.map((p, i) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[0.95rem] font-semibold transition ${p === page ? 'bg-accent text-screen' : 'bg-white/8 text-soft'}`}>
            <span className="font-mono text-[11px] opacity-60">{i + 1}</span>
            {p}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-dim uppercase">
          <span className={`h-2 w-2 rounded-full ${linked ? 'bg-ok' : 'bg-warn'}`} />
          {linked ? 'mac linked' : 'no mac'}
        </div>
      </div>

      {page === 'Controls' && mac && (
        <div className="flex items-center gap-4 rounded-2xl bg-white/6 px-4 py-2.5">
          <span className="font-mono text-[11px] tracking-[0.2em] text-dim">VOLUME</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${mac.muted ? 0 : mac.volume}%` }} />
          </div>
          <span className="w-12 text-right font-mono text-row tabular-nums">{mac.muted ? 'muted' : mac.volume}</span>
          <span className={`rounded-full px-3 py-1 font-mono text-[11px] ${mac.micMuted ? 'bg-err-soft text-err' : 'bg-ok-soft text-ok'}`}>{mac.micMuted ? 'MIC OFF' : 'MIC ON'}</span>
        </div>
      )}

      {!linked && waited ? (
        <div className="grid flex-1 place-items-center text-center">
          <div className="flex max-w-[560px] flex-col items-center gap-3">
            <div className="font-display text-[1.6rem] font-semibold">{forward === false ? 'No desktop link' : 'Waiting for the Mac'}</div>
            <div className="text-title text-soft">
              Deck works the Mac this Car Thing is plugged into. Open the bridgething desktop app on the Mac and turn on
              Deck&apos;s extension there.
            </div>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="grid flex-1 place-items-center text-center text-title text-soft">
          {page === 'Pinned'
            ? 'Hold any tile to pin it here.'
            : page === 'Shortcuts'
              ? 'No shortcuts yet. Make one in the Shortcuts app on the Mac.'
              : 'Nothing here yet.'}
        </div>
      ) : (
        <div ref={list} className="grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-3 overflow-y-auto pb-1 [scrollbar-width:none]">
          {shown.map(a => (
            <Tile key={a.id} action={a} pinned={pins.includes(a.id)} flash={flash[a.id] ?? null} onRun={() => run(a.id)} onPin={() => pin(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
