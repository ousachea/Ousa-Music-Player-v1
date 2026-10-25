// the deck: tiles that act on the mac the car thing is plugged into. the mac's extension lists what can be run, with
// each app's own icon, and this page only ever names one of those. presets pick the page, the wheel turns the mac's
// volume on the first page and scrolls the others, and holding a tile pins it to the last page
import { BridgethingClient, type PlayerState } from '@bridgething/client';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { daemonUrl } from './daemon';
import { CONTROLS, readToDeck, type Action, type Media, type ToMac } from './protocol';

const PAGES = ['Controls', 'Shortcuts', 'Apps', 'Pinned'] as const;
type Page = (typeof PAGES)[number];
const HOLD_MS = 550;
// how long the deck waits for the mac to answer before it says what is missing
const WAIT_MS = 4000;
const PINS_KEY = 'pins';

type Flash = 'ok' | 'fail' | 'busy';
type Mac = { volume: number; muted: boolean; micMuted: boolean; media: Media | null };
// what the music card shows: the car thing's own player, which the desktop app feeds with whatever the mac plays,
// or failing that what spotify or music reports on the mac
type Playing = { title: string; artist: string; source: string; playing: boolean; art: string | null; via: 'player' | 'mac' };
type Sort = 'category' | 'az' | 'recent';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'category', label: 'Category' },
  { id: 'az', label: 'A–Z' },
  { id: 'recent', label: 'Recent' },
];
const SORT_KEY = 'sort';
const KEYS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

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
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none" />,
  next: <path d="M6 6v12l8.5-6zM16 6h2.5v12H16z" fill="currentColor" stroke="none" />,
  previous: <path d="M18 6v12l-8.5-6zM8 6H5.5v12H8z" fill="currentColor" stroke="none" />,
  search: <path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13zM15.5 15.5L20 20" />,
  back: <path d="M21 6H9l-6 6 6 6h12zM11.5 9.5l5 5M16.5 9.5l-5 5" />,
  plus: <path d="M5 12h14M12 5v14" />,
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

// how a tile answers a press, in its own colour: a sheen runs across it while the mac works, then a ring of light
// spreads off it when done, or it shakes with a red edge when not
const FLASH_CLASS: Record<Flash, string> = { busy: '', ok: 'animate-tile-done', fail: 'animate-tile-fail ring-2 ring-err' };

function Badge({ flash, pinned }: { flash: Flash | null; pinned: boolean }) {
  return (
    <>
      {flash === 'busy' && (
        <span
          className="pointer-events-none absolute inset-0 animate-tile-sheen"
          style={{ backgroundImage: 'linear-gradient(100deg, transparent 35%, rgba(255,255,255,0.3) 50%, transparent 65%)', backgroundSize: '250% 100%' }}
        />
      )}
      {pinned && (
        <span className="absolute top-2.5 right-2.5 text-white/55">
          <Svg className="h-4 w-4">{GLYPH.pin}</Svg>
        </span>
      )}
    </>
  );
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
      className={`relative flex flex-col justify-between overflow-hidden rounded-[22px] border p-4 text-left transition duration-200 active:scale-[0.96] ${flash ? FLASH_CLASS[flash] : ''}`}
      style={{
        ['--glow' as string]: tint,
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
      className={`relative flex h-[112px] flex-col justify-between overflow-hidden rounded-[22px] p-4 text-left text-white transition duration-200 active:scale-[0.96] ${flash ? FLASH_CLASS[flash] : ''}`}
      style={{
        ['--glow' as string]: `hsl(${h} 80% 62%)`,
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

// an icon's main colour: its pixels averaged, the vivid ones counting most, so a press can glow in it
const TINTS = new Map<string, string>();
function useIconTint(png: string | undefined) {
  const [tint, setTint] = useState(() => (png ? TINTS.get(png) : undefined));
  useEffect(() => {
    if (!png) return;
    if (TINTS.has(png)) return setTint(TINTS.get(png));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 24;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return;
      g.drawImage(img, 0, 0, 24, 24);
      const d = g.getImageData(0, 0, 24, 24).data;
      let r = 0, gr = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) {
        const max = Math.max(d[i], d[i + 1], d[i + 2]);
        const sat = max ? (max - Math.min(d[i], d[i + 1], d[i + 2])) / max : 0;
        const weight = (d[i + 3] / 255) * (0.05 + sat * sat) * (max / 255);
        r += d[i] * weight;
        gr += d[i + 1] * weight;
        b += d[i + 2] * weight;
        w += weight;
      }
      if (!w) return;
      // lifted towards white so a dark icon still glows
      const found = `color-mix(in oklab, rgb(${Math.round(r / w)} ${Math.round(gr / w)} ${Math.round(b / w)}) 80%, white)`;
      TINTS.set(png, found);
      setTint(found);
    };
    img.src = `data:image/png;base64,${png}`;
  }, [png]);
  return tint;
}

function AppTile({ action, icon, flash, pinned, card, onRun, onPin }: { action: Action; icon: string | undefined; flash: Flash | null; pinned: boolean; card?: boolean; onRun: () => void; onPin: () => void }) {
  const press = usePress(onRun, onPin);
  const h = hue(action.label);
  const tint = useIconTint(icon) ?? `hsl(${h} 70% 60%)`;
  return (
    <button
      {...press}
      // pressed, the tile is edged and lit in the icon's own colour
      className={`relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[22px] px-1 py-2.5 transition duration-200 active:scale-[0.94] active:bg-[color-mix(in_oklab,var(--glow)_14%,transparent)] active:shadow-[inset_0_0_0_2px_var(--glow),0_0_18px_color-mix(in_oklab,var(--glow)_45%,transparent)] ${card ? 'h-[112px] border border-white/8 bg-white/6' : ''} ${flash ? FLASH_CLASS[flash] : ''}`}
      style={{ ['--glow' as string]: tint }}>
      {icon ? (
        <img src={`data:image/png;base64,${icon}`} alt="" className={`${card ? 'h-[60px] w-[60px]' : 'h-[80px] w-[80px]'} drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]`} draggable={false} />
      ) : (
        <span className={`grid place-items-center rounded-[18px] font-bold text-white ${card ? 'h-[52px] w-[52px] text-[1.4rem]' : 'h-[70px] w-[70px] text-[1.8rem]'}`} style={{ background: `linear-gradient(150deg, hsl(${h} 60% 55%), hsl(${h} 60% 38%))` }}>
          {action.label.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className={`w-full truncate text-center font-medium text-white/85 ${card ? 'text-[0.8rem]' : 'text-[0.85rem]'}`}>{action.label}</span>
      <Badge flash={flash} pinned={pinned} />
    </button>
  );
}

// the volume as a tall panel that fills from the bottom, dragged up and down or turned with the wheel, with what
// spotify or music is playing under it. a drag shows its own level at once and sends it a few times a second
const SEND_EVERY_MS = 90;

function Volume({ mac, media, onSet, onMedia }: { mac: Mac | null; media: Playing | null; onSet: (level: number) => void; onMedia: (command: 'playpause' | 'next' | 'previous') => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const sent = useRef(0);
  const level = drag ?? (mac ? (mac.muted ? 0 : mac.volume) : 0);
  const at = (e: { clientY: number; currentTarget: Element }) => {
    const box = e.currentTarget.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (box.bottom - e.clientY) / box.height)) * 100);
  };
  const move = (next: number, force = false) => {
    setDrag(next);
    if (force || Date.now() - sent.current > SEND_EVERY_MS) {
      sent.current = Date.now();
      onSet(next);
    }
  };
  // the speaker draws as many waves as the level earns
  const waves = level === 0 ? 0 : level < 34 ? 1 : level < 67 ? 2 : 3;
  return (
    <div className="flex w-[230px] shrink-0 flex-col gap-3 rounded-[26px] border border-white/8 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="flex items-baseline justify-between px-1">
        <span className="font-mono text-[10px] tracking-[0.3em] text-dim">VOLUME</span>
        <span className="font-display text-[1.9rem] leading-none font-semibold tabular-nums">
          {mac?.muted && drag === null ? 'off' : level}
        </span>
      </div>
      <div
        className="relative min-h-0 flex-1 cursor-ns-resize touch-none overflow-hidden rounded-[22px] bg-white/8"
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(at(e), true);
        }}
        onPointerMove={e => drag !== null && move(at(e))}
        onPointerUp={e => {
          move(at(e), true);
          // the mac's own report takes over once it has caught up
          setTimeout(() => setDrag(null), 600);
        }}>
        <div
          className={`absolute inset-x-0 bottom-0 ${drag === null ? 'transition-[height] duration-300' : ''}`}
          style={{ height: `${level}%`, background: 'linear-gradient(to top, #00a8e8, #7c5cff)', boxShadow: '0 -6px 24px rgba(124,92,255,0.45)' }}
        />
        {/* notches every quarter, so a level can be judged at a glance */}
        {[25, 50, 75].map(n => (
          <div key={n} className="absolute inset-x-3 h-px bg-white/10" style={{ bottom: `${n}%` }} />
        ))}
        <div className={`absolute bottom-3 left-3.5 ${level > 12 ? 'text-white' : 'text-soft'}`}>
          <Svg className="h-7 w-7">
            <path d="M4 9v6h4l5 4V5L8 9z" />
            {waves >= 1 && <path d="M16 9.5a3.5 3.5 0 0 1 0 5" />}
            {waves >= 2 && <path d="M18.5 7.5a6.5 6.5 0 0 1 0 9" />}
            {waves >= 3 && <path d="M21 5.5a9.5 9.5 0 0 1 0 13" />}
            {waves === 0 && <path d="M16 10l4 4M20 10l-4 4" />}
          </Svg>
        </div>
        <div className="absolute right-3.5 bottom-3.5 font-mono text-[10px] tracking-[0.15em] text-white/60">DRAG · WHEEL</div>
      </div>
      {/* what spotify or music is playing on the mac, with its transport */}
      <div className="w-full">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/10">{media?.art && <img src={media.art} alt="" className="h-full w-full object-cover" />}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.85rem] font-semibold">{media ? media.title : 'Nothing playing'}</div>
            <div className="truncate text-[11px] text-dim">{media ? [media.artist, media.source].filter(Boolean).join(' · ') : 'Play something on the Mac'}</div>
          </div>
        </div>
        <div className={`mt-2 flex items-center justify-center gap-2 ${media ? '' : 'opacity-35'}`}>
          {(['previous', 'playpause', 'next'] as const).map(c => (
            <button
              key={c}
              disabled={!media}
              onClick={() => onMedia(c)}
              className={`grid place-items-center rounded-full transition active:scale-90 ${c === 'playpause' ? 'h-11 w-11 bg-white text-screen' : 'h-9 w-9 bg-white/8 text-white'}`}>
              <Svg className={c === 'playpause' ? 'h-5 w-5' : 'h-4 w-4'}>{GLYPH[c === 'playpause' ? (media?.playing ? 'pause' : 'play') : c]}</Svg>
            </button>
          ))}
        </div>
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

// the moving background: three soft lights drifting behind everything
function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#0a0c10]">
      <div className="absolute -top-40 -left-32 h-[420px] w-[420px] animate-drift-a rounded-full bg-[#00a8e8] opacity-25 blur-[90px]" />
      <div className="absolute -right-40 -bottom-48 h-[460px] w-[460px] animate-drift-b rounded-full bg-[#7c5cff] opacity-25 blur-[100px]" />
      <div className="absolute top-20 left-[45%] h-[300px] w-[300px] animate-drift-c rounded-full bg-[#14b8a6] opacity-15 blur-[90px]" />
    </div>
  );
}

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
  const [sort, setSort] = useState<Sort>('category');
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const send = (m: ToMac) => client.forward.json(m).catch(() => {});

  useEffect(() => {
    const off = client.forward.onJson(raw => {
      const m = readToDeck(raw);
      if (!m) return;
      if (m.type === 'catalog') setActions(m.actions);
      else if (m.type === 'icons') setIcons(prev => ({ ...prev, ...m.icons }));
      else if (m.type === 'state') setMac({ volume: m.volume, muted: m.muted, micMuted: m.micMuted, media: m.media });
      else {
        setFlash(f => ({ ...f, [m.id]: m.ok ? 'ok' : 'fail' }));
        setTimeout(() => setFlash(({ [m.id]: _gone, ...rest }) => rest), 1100);
      }
    });
    const offPlayer = client.player.onSnapshot(reply => setPlayer(reply.state));
    client.player.stateGet().then(r => r.ok && setPlayer(r.response.state));
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
    client.store.get({ key: SORT_KEY }).then(r => {
      const saved = r.ok ? r.response.value : null;
      if (saved === 'category' || saved === 'az' || saved === 'recent') setSort(saved);
    });
    // the mac answers hello with its catalogue; asking again on reconnect covers a daemon or extension restart
    const offConn = client.on(e => e.type === 'open' && send({ type: 'hello' }));
    send({ type: 'hello' });
    const timer = setTimeout(() => setWaited(true), WAIT_MS);
    return () => {
      off();
      offPlayer();
      offCaps();
      offConn();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // the cover for the player's song, fetched by its asset id and let go when the song changes
  const artworkId = player?.track?.artworkId ?? null;
  useEffect(() => {
    if (!artworkId) return setArt(null);
    let url: string | null = null;
    let gone = false;
    client.asset.get({ id: artworkId, requestId: crypto.randomUUID() }).then(r => {
      if (gone || !r.ok) return;
      url = URL.createObjectURL(new Blob([new Uint8Array(r.response.bytes as unknown as number[])], { type: r.response.mime ?? 'image/jpeg' }));
      setArt(url);
    });
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, artworkId]);

  const track = player?.track ?? null;
  const playing: Playing | null = track
    ? { title: track.title ?? 'Unknown', artist: track.artist ?? '', source: '', playing: player?.playback.state === 'playing', art, via: 'player' }
    : mac?.media
      ? { title: mac.media.title, artist: mac.media.artist, source: mac.media.app, playing: mac.media.playing, art: null, via: 'mac' }
      : null;
  const media = (command: 'playpause' | 'next' | 'previous') => {
    if (playing?.via === 'mac') return send({ type: 'media', command });
    if (command === 'next') client.player.skipNext().catch(() => {});
    else if (command === 'previous') client.player.skipPrev({ allowSeeking: true }).catch(() => {});
    else (playing?.playing ? client.player.pause() : client.player.resume()).catch(() => {});
  };

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
  const sortBy = (next: Sort) => {
    setSort(next);
    client.store.put({ key: SORT_KEY, value: next }).catch(() => {});
  };
  const go = (next: Page) => {
    setPage(next);
    setQuery('');
    setTyping(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // with the keyboard up, a real keyboard types too, and back closes it
      if (typing) {
        if (e.key === 'Escape' || e.key === 'Enter') setTyping(false);
        else if (e.key === 'Backspace') setQuery(q => q.slice(0, -1));
        else if (e.key.length === 1 && /[\p{L}\p{N} ]/u.test(e.key)) setQuery(q => q + e.key);
        return;
      }
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) go(PAGES[i]);
      else if (e.key === 'm') go(PAGES[(PAGES.indexOf(page) + 1) % PAGES.length]);
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
  }, [page, typing]);

  const all = actions ?? CONTROLS;
  const of = (kind: Action['kind']) => all.filter(a => a.kind === kind);
  const pinned = pins.map(id => all.find(a => a.id === id)).filter((a): a is Action => !!a);
  const linked = actions !== null;
  const searchable = (page === 'Apps' || page === 'Shortcuts') && of(page === 'Apps' ? 'app' : 'shortcut').length > 0;

  const tile = (a: Action, card = false) => {
    const common = { flash: flash[a.id] ?? null, pinned: pins.includes(a.id), onRun: () => run(a.id), onPin: () => pin(a.id) };
    if (a.kind === 'control') return <ControlTile key={a.id} {...common} action={a} mac={mac} />;
    if (a.kind === 'shortcut') return <ShortcutTile key={a.id} {...common} action={a} />;
    return <AppTile key={a.id} {...common} action={a} icon={icons[a.id]} card={card} />;
  };

  const empty = (text: string) => <div className="grid flex-1 place-items-center px-10 text-center text-title text-soft">{text}</div>;

  const found = (kind: 'shortcut' | 'app') => {
    const q = query.trim().toLowerCase();
    return of(kind).filter(a => !q || a.label.toLowerCase().includes(q));
  };
  // apps grouped under their category, biggest groups first and other last, or one list by name or by last opened
  const appSections = (): { title: string | null; items: Action[] }[] => {
    const apps = found('app');
    const byName = (a: Action, b: Action) => a.label.localeCompare(b.label);
    if (sort === 'az') return [{ title: null, items: [...apps].sort(byName) }];
    if (sort === 'recent') return [{ title: null, items: [...apps].sort((a, b) => (b.used ?? 0) - (a.used ?? 0) || byName(a, b)) }];
    const groups = new Map<string, Action[]>();
    for (const a of apps) groups.set(a.group ?? 'Other', [...(groups.get(a.group ?? 'Other') ?? []), a]);
    return [...groups]
      .sort(([a, x], [b, y]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : y.length - x.length || a.localeCompare(b)))
      .map(([title, items]) => ({ title: `${title} · ${items.length}`, items: items.sort(byName) }));
  };

  // search and, for apps, the sort; the field opens the on-screen keyboard
  const toolbar = (sorts: boolean) => (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <button
        onClick={() => setTyping(true)}
        className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full border px-3 text-left text-[0.8rem] backdrop-blur-md transition ${typing ? 'border-accent bg-black/50' : 'border-white/10 bg-black/35'}`}>
        <Svg className="h-4 w-4 shrink-0 text-dim">{GLYPH.search}</Svg>
        <span className={`truncate ${query ? 'text-white' : 'text-dim'}`}>{query || (sorts ? 'Search apps' : 'Search shortcuts')}</span>
        {typing && <span className="h-4 w-px animate-pulse bg-accent" />}
      </button>
      {query && (
        <button onClick={() => setQuery('')} className="h-8 shrink-0 rounded-full bg-white/8 px-2.5 text-[0.75rem] text-soft">
          Clear
        </button>
      )}
      {sorts && (
        <div className="flex shrink-0 gap-0.5">
          {SORTS.map(s => (
            <button
              key={s.id}
              onClick={() => sortBy(s.id)}
              className={`rounded-full px-2.5 py-1.5 text-[0.75rem] font-semibold transition ${sort === s.id ? 'bg-white/90 text-screen' : 'text-soft'}`}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const keyboard = (
    <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1.5 border-t border-white/10 bg-[#11151d]/95 px-3 pt-2.5 pb-3 backdrop-blur-md">
      {KEYS.map((row, r) => (
        <div key={r} className="flex justify-center gap-1.5">
          {[...row].map(k => (
            <button key={k} onClick={() => setQuery(q => q + k.toLowerCase())} className="h-11 w-[66px] rounded-xl bg-white/10 text-[1.05rem] font-semibold transition active:scale-90 active:bg-white/25">
              {k}
            </button>
          ))}
          {r === 2 && (
            <button onClick={() => setQuery(q => q.slice(0, -1))} className="grid h-11 w-[100px] place-items-center rounded-xl bg-white/6 text-soft transition active:scale-90">
              <Svg className="h-5 w-5">{GLYPH.back}</Svg>
            </button>
          )}
        </div>
      ))}
      <div className="flex justify-center gap-1.5">
        <button onClick={() => setQuery('')} className="h-11 w-[100px] rounded-xl bg-white/6 text-[0.85rem] text-soft">
          Clear
        </button>
        <button onClick={() => setQuery(q => q + ' ')} className="h-11 w-[360px] rounded-xl bg-white/10 text-[0.85rem] text-soft">
          space
        </button>
        <button onClick={() => setTyping(false)} className="h-11 w-[100px] rounded-xl bg-accent text-[0.9rem] font-semibold text-screen">
          Done
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full w-full flex-col gap-3 px-5 pt-[50px] pb-4 isolate text-off-white">
      <Backdrop />
      {/* the nav floats over the page with nothing behind it; the lists run the full height and scroll up under it,
          and a shadow keeps its words readable over whatever passes beneath */}
      <div className="absolute inset-x-5 top-2.5 z-10 flex items-center gap-2 [filter:drop-shadow(0_2px_6px_rgba(0,0,0,0.7))]">
        <div className="flex shrink-0 gap-0.5">
          {PAGES.map((p, i) => (
            <button
              key={p}
              onClick={() => go(p)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8rem] font-semibold transition duration-200 ${p === page ? 'bg-white text-screen shadow-[0_4px_14px_rgba(0,0,0,0.35)]' : 'text-soft'}`}>
              <Svg className="h-3.5 w-3.5">{TAB_GLYPH[p]}</Svg>
              {/* beside search and sort only the page you are on keeps its name, the others their icon */}
              {(p === page || !searchable) && p}
              <span className={`font-mono text-[10px] ${p === page ? 'text-screen/45' : 'text-dim'}`}>{i + 1}</span>
            </button>
          ))}
        </div>
        {searchable && linked && toolbar(page === 'Apps')}
        <div className={`flex shrink-0 items-center gap-2 px-1 py-1.5 font-mono text-[10px] tracking-[0.2em] text-soft uppercase ${searchable && linked ? '' : 'ml-auto'}`} title={linked ? 'mac linked' : 'no mac'}>
          <span className={`h-2 w-2 rounded-full ${linked ? 'bg-ok shadow-[0_0_8px_#3ddc84]' : 'bg-warn'}`} />
          {!searchable && (linked ? 'mac' : 'no mac')}
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
          <Volume mac={mac} media={playing} onSet={level => send({ type: 'set-volume', level })} onMedia={media} />
          <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-3">{of('control').filter(a => a.id !== 'vol-up' && a.id !== 'vol-down').map(a => tile(a))}</div>
        </div>
      ) : page === 'Shortcuts' ? (
        of('shortcut').length === 0 ? (
          empty('No shortcuts yet. Make one in the Shortcuts app on the Mac and it appears here.')
        ) : (
          <>
            {found('shortcut').length === 0 ? (
              empty(`No shortcut matches “${query}”.`)
            ) : (
              <div ref={list} className={`-mx-5 -mt-[50px] -mb-4 grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-3 overflow-y-auto px-5 pt-[50px] [mask-image:linear-gradient(to_bottom,transparent_18px,#000_50px)] [scrollbar-width:none] ${typing ? 'pb-[230px]' : 'pb-4'}`}>
                {found('shortcut').map(a => tile(a))}
              </div>
            )}
          </>
        )
      ) : page === 'Apps' ? (
        <>
          {found('app').length === 0 ? (
            empty(`No app matches “${query}”.`)
          ) : (
            <div ref={list} className={`-mx-5 -mt-[50px] -mb-4 grid min-h-0 flex-1 auto-rows-min grid-cols-5 gap-x-2 gap-y-2 overflow-y-auto px-5 pt-[50px] [mask-image:linear-gradient(to_bottom,transparent_18px,#000_50px)] [scrollbar-width:none] ${typing ? 'pb-[230px]' : 'pb-4'}`}>
              {appSections().map(s => (
                <Fragment key={s.title ?? 'all'}>
                  {s.title && <div className="col-span-full px-1 pt-2 font-mono text-[10px] tracking-[0.25em] text-dim uppercase first:pt-0">{s.title}</div>}
                  {s.items.map(a => tile(a))}
                </Fragment>
              ))}
            </div>
          )}
        </>
      ) : pinned.length === 0 ? (
        empty('Hold any tile on the other pages to pin it here.')
      ) : (
        <div ref={list} className="-mx-5 -mt-[50px] -mb-4 grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-3 overflow-y-auto px-5 pt-[50px] [mask-image:linear-gradient(to_bottom,transparent_18px,#000_50px)] pb-4 [scrollbar-width:none]">
          {pinned.map(a => (a.kind === 'control' ? <div key={a.id} className="h-[112px] [&>button]:h-full">{tile(a)}</div> : tile(a, true)))}
        </div>
      )}
      {typing && (page === 'Apps' || page === 'Shortcuts') && keyboard}
    </div>
  );
}
