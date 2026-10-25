// the deck: tiles that act on the mac the car thing is plugged into. the mac's extension lists what can be run, with
// each app's own icon, and this page only ever names one of those. presets pick the page, the wheel turns the mac's
// volume on the first page and scrolls the others, and holding a tile pins it to the head of its own list
import { BridgethingClient, type PlayerState } from '@bridgething/client';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { daemonUrl } from './daemon';
import { CONTROLS, FOCUS_SHORTCUT, combo, readToDeck, type Action, type Clip, type Copied, type Extras, type Front, type Key, type Media, type Running, type ToMac } from './protocol';

// presets 1 to 4 reach the first four; the clipboard is a tap or the mode button away
const PAGES = ['Controls', 'Shortcuts', 'Apps', 'Running', 'Clipboard'] as const;
type Page = (typeof PAGES)[number];
const HOLD_MS = 550;
// how long the deck waits for the mac to answer before it says what is missing
const WAIT_MS = 4000;
const PINS_KEY = 'pins';

type Flash = 'ok' | 'fail' | 'busy';
type Mac = { volume: number; muted: boolean; micMuted: boolean; media: Media | null; front: Front | null; clip: Clip } & Extras;
// how long the trash stays armed after a first tap, waiting for the second
const ARM_MS = 3000;
// how far a finger travels before it is a swipe rather than a tap
const SWIPE_PX = 50;
// how long a running app is held down before it quits
const QUIT_HOLD_MS = 1000;
const RUNNING_EVERY_MS = 3000;
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

// the running apps with the one in front in the middle and the rest split either side of it, in their own order
function centred(apps: Running[]) {
  const front = apps.find(a => a.active);
  if (!front) return apps;
  const others = apps.filter(a => a !== front);
  const half = Math.floor(others.length / 2);
  return [...others.slice(0, half), front, ...others.slice(half)];
}

function ago(at: number) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}

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
  awake: <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M9 3v3M12 3v3" />,
  dark: <path d="M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18" />,
  desktop: <path d="M3 5h18v11H3zM8 20h8M12 16v4" />,
  wifi: <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />,
  battery: <path d="M3 8h16v8H3zM19 10.5h2v3h-2" />,
  bluetooth: <path d="M7 7l10 10-5 4V3l5 4L7 17" />,
  focus: <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5zM17 3v4M15 5h4" />,
  screensaver: <path d="M3 5h18v12H3zM7 13l3-3 3 3 2-2 3 3M9 20h6" />,
  quit: <path d="M6 6l12 12M18 6L6 18" />,
  'bright-down': <path d="M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM12 5v1M12 18v1M5 12h1M18 12h1" />,
  'bright-up': <path d="M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  clipboard: <path d="M9 4h6v3H9zM9 5.5H6v15h12v-15h-3M9 11h6M9 14.5h6M9 18h3" />,
  front: <path d="M4 5h16v14H4zM4 9h16M7 7h.01M9.5 7h.01" />,
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
  bluetooth: '#3b82f6',
  mute: '#ffb627',
  screenshot: '#4fc3ff',
  mission: '#a78bfa',
  'display-sleep': '#94a3b8',
  sleep: '#818cf8',
  awake: '#f59e0b',
  dark: '#8b9cff',
  desktop: '#38bdf8',
  wifi: '#22d3ee',
  battery: '#3ddc84',
  focus: '#c084fc',
  screensaver: '#f472b6',
  quit: '#fb7185',
  'bright-down': '#facc15',
  'bright-up': '#fde047',
  trash: '#f87171',
  front: '#60a5fa',
  clipboard: '#a3e635',
  brightness: '#facc15',
};

// the press handling every tile shares: a tap runs, a hold pins, and only a press that began on the tile counts
function usePress(onRun: () => void, onPin: () => void) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const pressed = useRef(false);
  const from = useRef({ x: 0, y: 0 });
  const cancel = () => {
    pressed.current = false;
    if (hold.current) clearTimeout(hold.current);
  };
  return {
    // a finger that travels is swiping or scrolling, not pressing
    onPointerMove: (e: { clientX: number; clientY: number }) => {
      if (pressed.current && Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > 10) cancel();
    },
    onPointerDown: (e: { clientX: number; clientY: number }) => {
      from.current = { x: e.clientX, y: e.clientY };
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
const FLASH_CLASS: Record<Flash, string> = { busy: '', ok: 'animate-tile-done', fail: 'animate-tile-fail ring-2 ring-inset ring-err' };

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

function ControlTile({
  action,
  mac,
  flash,
  pinned,
  armed,
  missing,
  onRun,
  onStep,
  onPin,
}: {
  action: Action;
  mac: Mac | null;
  flash: Flash | null;
  pinned: boolean;
  armed?: boolean;
  missing?: boolean;
  onRun: () => void;
  onStep: (id: 'bright-up' | 'bright-down') => void;
  onPin: () => void;
}) {
  const press = usePress(onRun, onPin);
  const tint = CONTROL_TINT[action.id] ?? '#94a3b8';
  const id = action.id;
  const battery = mac?.battery ?? null;
  // the toggles show what they are set to, lit while on; the trash lights red while it waits for its second tap
  const on =
    (id === 'mic' && mac?.micMuted) ||
    (id === 'mute' && mac?.muted) ||
    (id === 'awake' && mac?.awake) ||
    (id === 'dark' && mac?.dark) ||
    (id === 'wifi' && mac?.wifi) ||
    (id === 'bluetooth' && mac?.bluetooth?.on) ||
    (id === 'trash' && armed);
  const glyph = id === 'mic' && mac?.micMuted ? 'mic-off' : id === 'mute' && !mac?.muted ? 'sound' : id;
  const label =
    id === 'mic'
      ? mac?.micMuted ? 'Mic is off' : 'Mute mic'
      : id === 'mute'
        ? mac?.muted ? 'Sound is off' : 'Mute sound'
        : id === 'awake'
          ? mac?.awake ? 'Staying awake' : 'Keep awake'
          : id === 'wifi'
            ? mac?.wifi === null ? 'No Wi-Fi' : mac?.wifi ? (mac.network ?? 'Wi-Fi on') : 'Wi-Fi off'
            : id === 'bluetooth'
              ? !mac?.bluetooth ? 'Bluetooth' : !mac.bluetooth.on ? 'Bluetooth off' : (mac.bluetooth.devices[0] ?? 'Bluetooth on')
            : id === 'battery'
              ? battery ? `${battery.percent}%` : 'No battery'
              : id === 'trash' && armed
                ? 'Tap again'
                : action.label;
  // a second line where the tile has more to say
  const sub =
    id === 'battery' && battery
      ? battery.charging ? `Charging${battery.remaining ? ` · ${battery.remaining}` : ''}` : battery.plugged ? 'On power' : battery.remaining ? `${battery.remaining} left` : 'On battery'
      : id === 'focus' && missing
        ? `Make a “${FOCUS_SHORTCUT}” shortcut`
        : id === 'trash' && armed
          ? 'to empty the Trash'
          : id === 'bluetooth' && mac?.bluetooth?.on
            ? mac.bluetooth.devices.length > 1
              ? `and ${mac.bluetooth.devices.slice(1).join(', ')}`
              : mac.bluetooth.devices.length
                ? 'Connected'
                : 'Nothing connected'
          : id === 'wifi' && mac?.wifi
              ? [mac.ip, mac.network ? null : 'name hidden by macOS'].filter(Boolean).join(' · ') || null
              : null;
  return (
    <button
      {...press}
      className={`relative flex flex-col justify-between overflow-hidden rounded-[20px] border p-3 text-left transition duration-200 active:scale-[0.96] ${flash ? FLASH_CLASS[flash] : ''}`}
      style={{
        ['--glow' as string]: tint,
        background: on ? `linear-gradient(150deg, ${tint}, color-mix(in oklab, ${tint} 55%, #000))` : 'linear-gradient(150deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))',
        borderColor: on ? 'transparent' : 'rgba(255,255,255,0.08)',
      }}>
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: on ? 'rgba(255,255,255,0.22)' : `color-mix(in srgb, ${tint} 20%, transparent)`, color: on ? '#fff' : tint }}>
        <Svg className="h-5 w-5">{GLYPH[id === 'brightness' ? 'bright-up' : glyph]}</Svg>
        {/* the battery's charge drawn inside its outline */}
        {id === 'battery' && battery && <span className="absolute top-[15px] left-[10.5px] h-[7px] rounded-[1px] bg-current" style={{ width: `${(battery.percent / 100) * 12}px` }} />}
      </span>
      {id === 'brightness' ? (
        // two halves, dimmer and brighter, each its own button
        <span className="text-[0.92rem] leading-tight font-semibold text-white">Brightness</span>
      ) : (
        <span className="leading-tight">
          <span className="block text-[0.92rem] font-semibold text-white">{label}</span>
          {sub && <span className="mt-0.5 line-clamp-2 block text-[10px] text-white/60">{sub}</span>}
        </span>
      )}
      {id === 'brightness' && (
          <span className="absolute top-3 right-3 flex w-[96px] gap-1.5" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
            {(['bright-down', 'bright-up'] as const).map(step => (
              <span
                key={step}
                role="button"
                onClick={() => onStep(step)}
                className="grid h-9 flex-1 place-items-center rounded-xl bg-white/10 text-white transition active:scale-90 active:bg-white/20">
                <Svg className="h-4 w-4">{GLYPH[step === 'bright-up' ? 'plus' : 'minus']}</Svg>
              </span>
            ))}
          </span>
      )}
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

// an image's main colour: its pixels averaged, the vivid ones counting most, so a press or a slider can glow in it
const TINTS = new Map<string, string>();
function useTint(src: string | null | undefined) {
  const [tint, setTint] = useState(() => (src ? TINTS.get(src) : undefined));
  useEffect(() => {
    if (!src) return setTint(undefined);
    if (TINTS.has(src)) return setTint(TINTS.get(src));
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
      TINTS.set(src, found);
      setTint(found);
    };
    img.src = src;
  }, [src]);
  return tint;
}

function AppTile({ action, icon, flash, pinned, card, onRun, onPin }: { action: Action; icon: string | undefined; flash: Flash | null; pinned: boolean; card?: boolean; onRun: () => void; onPin: () => void }) {
  const press = usePress(onRun, onPin);
  const h = hue(action.label);
  const tint = useTint(icon ? `data:image/png;base64,${icon}` : null) ?? `hsl(${h} 70% 60%)`;
  return (
    <button
      {...press}
      // pressed, the tile is edged and lit in the icon's own colour
      className={`relative flex flex-col items-center justify-start gap-2 overflow-hidden rounded-[22px] px-1 py-2.5 transition duration-200 active:scale-[0.94] active:bg-[color-mix(in_oklab,var(--glow)_14%,transparent)] active:shadow-[inset_0_0_0_2px_var(--glow),0_0_18px_color-mix(in_oklab,var(--glow)_45%,transparent)] ${card ? 'h-[112px] border border-white/8 bg-white/6' : ''} ${flash ? FLASH_CLASS[flash] : ''}`}
      style={{ ['--glow' as string]: tint }}>
      {icon ? (
        <img src={`data:image/png;base64,${icon}`} alt="" className={`${card ? 'h-[60px] w-[60px]' : 'h-[80px] w-[80px]'} drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]`} draggable={false} />
      ) : (
        <span className={`grid place-items-center rounded-[18px] font-bold text-white ${card ? 'h-[52px] w-[52px] text-[1.4rem]' : 'h-[70px] w-[70px] text-[1.8rem]'}`} style={{ background: `linear-gradient(150deg, hsl(${h} 60% 55%), hsl(${h} 60% 38%))` }}>
          {action.label.slice(0, 1).toUpperCase()}
        </span>
      )}
      {/* the whole name, over two lines where it needs them, the icons kept level along the top */}
      <span className={`line-clamp-2 w-full text-center leading-tight font-medium break-words text-white/85 ${card ? 'text-[0.8rem]' : 'text-[0.85rem]'}`}>{action.label}</span>
      <Badge flash={flash} pinned={pinned} />
    </button>
  );
}

// a line that scrolls sideways when it is too long to fit, two copies end to end so the loop has no seam; one that
// fits sits still. the speed is fixed per character, so long and short lines read at the same pace
function Marquee({ text, className }: { text: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const fit = () => setOver(!!box.current && !!line.current && line.current.scrollWidth > box.current.clientWidth + 1);
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
  }, [text]);
  return (
    <div ref={box} className={`overflow-hidden whitespace-nowrap ${over ? '[mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]' : 'text-center'} ${className ?? ''}`}>
      {over ? (
        <div className="inline-flex animate-marquee" style={{ animationDuration: `${Math.max(6, text.length * 0.32)}s` }}>
          <span className="pr-10">{text}</span>
          <span className="pr-10" aria-hidden>
            {text}
          </span>
        </div>
      ) : (
        // inline-block, since a plain inline span reports no scroll width to measure
        <span ref={line} className="inline-block">
          {text}
        </span>
      )}
      {over && (
        <span ref={line} className="invisible absolute">
          {text}
        </span>
      )}
    </div>
  );
}

// the song and the mac's volume as one card: the cover large, blurred behind the whole card too, the song and its
// transport under it, and the volume a slim pill at the foot that takes the cover's colour. the pill is dragged
// sideways or turned with the wheel; a drag shows its own level at once and sends it a few times a second
const SEND_EVERY_MS = 90;

function NowPlaying({ mac, media, onSet, onMedia }: { mac: Mac | null; media: Playing | null; onSet: (level: number) => void; onMedia: (command: 'playpause' | 'next' | 'previous') => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const sent = useRef(0);
  const tint = useTint(media?.art) ?? '#7c9cff';
  const level = drag ?? (mac ? (mac.muted ? 0 : mac.volume) : 0);
  const at = (e: { clientX: number; currentTarget: Element }) => {
    const box = e.currentTarget.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * 100);
  };
  const move = (next: number, force = false) => {
    setDrag(next);
    if (force || Date.now() - sent.current > SEND_EVERY_MS) {
      sent.current = Date.now();
      onSet(next);
    }
  };
  const waves = level === 0 ? 0 : level < 34 ? 1 : level < 67 ? 2 : 3;
  return (
    <div className="relative isolate flex w-[230px] shrink-0 flex-col items-center overflow-hidden rounded-[26px] border border-white/10 p-3.5 shadow-[0_14px_36px_rgba(0,0,0,0.45)]" style={{ ['--tint' as string]: tint }}>
      {/* the cover again, blurred to fill the card, so the card is the song's colour */}
      <div className="absolute inset-0 -z-10 bg-[#141821]">
        {media?.art && <img src={media.art} alt="" className="h-full w-full scale-150 object-cover opacity-55 blur-2xl" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70" />
      </div>

      <div className="aspect-square w-full shrink-0 overflow-hidden rounded-[18px] bg-white/10 shadow-[0_12px_28px_rgba(0,0,0,0.55)]">
        {media?.art ? (
          <img src={media.art} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[linear-gradient(150deg,#2b3a67,#5a3f8f)] text-white/70">
            <Svg className="h-12 w-12">
              <path d="M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" />
            </Svg>
          </div>
        )}
      </div>

      <div className="mt-2.5 w-full">
        <Marquee text={media ? media.title : 'Nothing playing'} className="text-[0.95rem] leading-tight font-semibold" />
        <Marquee text={media ? [media.artist, media.source].filter(Boolean).join(' · ') : 'Play something on the Mac'} className="mt-0.5 text-[11px] text-white/60" />
      </div>

      <div className={`mt-auto flex items-center justify-center gap-3 pt-1 ${media ? '' : 'opacity-35'}`}>
        {(['previous', 'playpause', 'next'] as const).map(c => (
          <button
            key={c}
            disabled={!media}
            onClick={() => onMedia(c)}
            className={`grid place-items-center rounded-full transition active:scale-90 ${c === 'playpause' ? 'h-12 w-12 bg-white text-screen shadow-[0_6px_16px_rgba(0,0,0,0.4)]' : 'h-9 w-9 text-white'}`}>
            <Svg className="h-5 w-5">{GLYPH[c === 'playpause' ? (media?.playing ? 'pause' : 'play') : c]}</Svg>
          </button>
        ))}
      </div>

      <div
        className="relative mt-2.5 h-9 w-full shrink-0 cursor-ew-resize touch-none overflow-hidden rounded-full bg-white/12 backdrop-blur-sm"
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
          className={`absolute inset-y-0 left-0 rounded-full ${drag === null ? 'transition-[width] duration-300' : ''}`}
          style={{ width: `${Math.max(level, 12)}%`, background: 'var(--tint)', boxShadow: '0 0 18px color-mix(in srgb, var(--tint) 55%, transparent)', opacity: level === 0 ? 0.35 : 1 }}
        />
        <div className="absolute inset-0 flex items-center justify-between px-2.5 text-screen">
          <Svg className="h-[18px] w-[18px]">
            <path d="M4 9v6h4l5 4V5L8 9z" />
            {waves >= 1 && <path d="M16 9.5a3.5 3.5 0 0 1 0 5" />}
            {waves >= 2 && <path d="M18.5 7.5a6.5 6.5 0 0 1 0 9" />}
            {waves >= 3 && <path d="M21 5.5a9.5 9.5 0 0 1 0 13" />}
            {waves === 0 && <path d="M16 10l4 4M20 10l-4 4" />}
          </Svg>
          <span className={`font-mono text-[11px] font-semibold tabular-nums ${level > 82 ? 'text-screen' : 'text-white/80'}`}>{mac?.muted && drag === null ? 'off' : level}</span>
        </div>
      </div>
    </div>
  );
}

const TAB_GLYPH: Record<Page, ReactNode> = {
  Controls: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" />,
  Shortcuts: GLYPH.shortcut,
  Apps: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  Running: <path d="M3 7h12v10H3zM9 4h12v10h-2M6 17v3h12" />,
  Clipboard: GLYPH.clipboard,
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
  const [ctlPage, setCtlPage] = useState(0);
  // the running apps and the clipboard pages: what each was sent, and which row the wheel is on
  const switcher = page === 'Running';
  const [running, setRunning] = useState<Running[]>([]);
  // the shortcuts of the app in front, read from its menus, and the menu they are narrowed to
  const [keys, setKeys] = useState<{ app: string; items: Key[] } | null>(null);
  const [keyMenu, setKeyMenu] = useState<string | null>(null);
  // the app whose shortcuts are open on the running page, or 'front' for whichever comes forward after opening one
  // from apps; null shows the running apps themselves
  const [shortcutsOf, setShortcutsOf] = useState<Running | 'front' | null>(null);
  // a running app answers a tap by opening its shortcuts and a hold by quitting; the hold fills a bar as it goes, and
  // letting go early, or sliding off, lets it be
  const [holding, setHolding] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const startHold = (app: Running) => {
    held.current = false;
    setHolding(app.path);
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setHolding(null);
      setFlash(f => ({ ...f, [`quit:${app.path}`]: 'busy' }));
      send({ type: 'quit-app', path: app.path });
    }, QUIT_HOLD_MS);
  };
  const stopHold = (app: Running | null) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setHolding(null);
    // a lift before the hold was up is a tap
    if (app && !held.current) {
      switchTo(app);
      openShortcuts(app);
    }
    held.current = true;
  };
  const [pick, setPick] = useState(0);
  // set on arriving at the running apps, so the first list to come puts the wheel on the app in front
  const aim = useRef(false);
  const clipSheet = page === 'Clipboard';
  const [clips, setClips] = useState<Copied[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const sheetList = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const swipe = useRef<number | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const send = (m: ToMac) => client.forward.json(m).catch(() => {});

  useEffect(() => {
    const off = client.forward.onJson(raw => {
      const m = readToDeck(raw);
      if (!m) return;
      if (m.type === 'catalog') setActions(m.actions);
      else if (m.type === 'icons') setIcons(prev => ({ ...prev, ...m.icons }));
      else if (m.type === 'state') {
        const { type: _type, ...now } = m;
        setMac(now);
      }
      else if (m.type === 'running') {
        const apps = centred(m.apps);
        setRunning(apps);
        // on arriving at the page the wheel starts on the app in front, from where the others spread either side
        if (aim.current) {
          aim.current = false;
          setPick(Math.max(0, apps.findIndex(a => a.active)));
        }
      }
      else if (m.type === 'clips') setClips(m.items);
      else if (m.type === 'keys') setKeys({ app: m.app, items: m.items });
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

  // the running apps are asked for on arriving and every few seconds after, so a newly opened app turns up
  useEffect(() => {
    if (page !== 'Running') return;
    aim.current = true;
    send({ type: 'running' });
    const timer = setInterval(() => send({ type: 'running' }), RUNNING_EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  // the front app's shortcuts are read on arriving and again whenever another app comes to the front
  const frontName = mac?.front?.name ?? null;
  useEffect(() => {
    if (page !== 'Running' || !shortcutsOf) return;
    send({ type: 'keys' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, frontName, shortcutsOf]);
  const openShortcuts = (app: Running | 'front') => {
    setKeyMenu(null);
    setShortcutsOf(app);
  };
  const pressKey = (k: Key) => {
    if (!keys || !k.enabled) return;
    const id = `key:${k.menu}/${k.title}`;
    setFlash(f => ({ ...f, [id]: 'busy' }));
    send({ type: 'press', app: keys.app, menu: k.menu, title: k.title });
  };
  useEffect(() => {
    if (page !== 'Clipboard') return;
    setPick(0);
    send({ type: 'clips' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  const switchTo = (app: Running) => {
    send({ type: 'switch', path: app.path });
    setTimeout(() => send({ type: 'running' }), 500);
    setTimeout(() => send({ type: 'keys' }), 700);
  };
  // a copy marks the one copied for a moment, so several can be taken in turn
  const copyBack = (clip: Copied) => {
    send({ type: 'copy', id: clip.id });
    setCopied(clip.id);
    setTimeout(() => setCopied(c => (c === clip.id ? null : c)), 1400);
  };

  const run = (id: string) => {
    // emptying the trash cannot be undone, so the first tap only arms it
    if (id === 'trash' && !armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), ARM_MS);
      return;
    }
    if (id === 'trash') setArmed(false);
    setFlash(f => ({ ...f, [id]: 'busy' }));
    send({ type: 'run', id });
    // opening an app takes you to its shortcuts once it has come to the front
    if (id.startsWith('app:'))
      setTimeout(() => {
        go('Running');
        openShortcuts('front');
      }, 900);
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
    setShortcutsOf(null);
    setQuery('');
    setTyping(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // on the running apps and the clipboard a press of the wheel chooses the row it is on
      if (page === 'Running' && shortcutsOf && e.key === 'Escape') {
        setShortcutsOf(null);
        return;
      }
      if (clipSheet && (e.key === 'Enter' || e.key === ' ')) {
        if (clips[pick]) copyBack(clips[pick]);
        return;
      }
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
      if (clipSheet) {
        setPick(p => Math.max(0, Math.min(clips.length - 1, p + (e.deltaX > 0 ? 1 : -1))));
        return;
      }
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
  }, [page, typing, switcher, clipSheet, running, clips, pick, shortcutsOf]);

  useEffect(() => {
    sheetList.current?.querySelector(`[data-pick="${pick}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pick]);

  const all = actions ?? CONTROLS;
  const of = (kind: Action['kind']) => all.filter(a => a.kind === kind);
  // pinned ones lead their own list, in the order they were pinned
  const pinnedFirst = (list: Action[]) => [...pins.flatMap(id => list.filter(a => a.id === id)), ...list.filter(a => !pins.includes(a.id))];
  const linked = actions !== null;
  const searchable = (page === 'Apps' || page === 'Shortcuts') && of(page === 'Apps' ? 'app' : 'shortcut').length > 0;

  const tile = (a: Action, card = false) => {
    const common = { flash: flash[a.id] ?? null, pinned: pins.includes(a.id), onRun: () => run(a.id), onPin: () => pin(a.id) };
    if (a.kind === 'control')
      return (
        <ControlTile
          key={a.id}
          {...common}
          action={a}
          mac={mac}
          armed={a.id === 'trash' && armed}
          missing={a.id === 'focus' && !all.some(s => s.id === `shortcut:${FOCUS_SHORTCUT}`)}
          onStep={step => send({ type: 'run', id: step })}
        />
      );
    if (a.kind === 'shortcut') return <ShortcutTile key={a.id} {...common} action={a} />;
    return <AppTile key={a.id} {...common} action={a} icon={icons[a.id]} card={card} />;
  };

  const controlPages: Action[][] = [];
  pinnedFirst(of('control')).forEach((a, i) => (i % 9 ? controlPages[controlPages.length - 1].push(a) : controlPages.push([a])));

  const empty = (text: string) => <div className="grid flex-1 place-items-center px-10 text-center text-title text-soft">{text}</div>;

  const found = (kind: 'shortcut' | 'app') => {
    const q = query.trim().toLowerCase();
    return pinnedFirst(of(kind).filter(a => !q || a.label.toLowerCase().includes(q)));
  };
  // apps grouped under their category, biggest groups first and other last, or one list by name or by last opened;
  // either way the pinned ones come first, in a group of their own
  const appSections = (): { title: string | null; items: Action[] }[] => {
    const apps = found('app');
    const pinnedApps = apps.filter(a => pins.includes(a.id));
    const rest = apps.filter(a => !pins.includes(a.id));
    const head = pinnedApps.length ? [{ title: `Pinned · ${pinnedApps.length}`, items: pinnedApps }] : [];
    const byName = (a: Action, b: Action) => a.label.localeCompare(b.label);
    if (sort === 'az') return [...head, { title: head.length ? 'All apps' : null, items: [...rest].sort(byName) }];
    if (sort === 'recent') return [...head, { title: head.length ? 'All apps' : null, items: [...rest].sort((a, b) => (b.used ?? 0) - (a.used ?? 0) || byName(a, b)) }];
    const groups = new Map<string, Action[]>();
    for (const a of rest) groups.set(a.group ?? 'Other', [...(groups.get(a.group ?? 'Other') ?? []), a]);
    return [
      ...head,
      ...[...groups]
        .sort(([a, x], [b, y]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : y.length - x.length || a.localeCompare(b)))
        .map(([title, items]) => ({ title: `${title} · ${items.length}`, items: items.sort(byName) })),
    ];
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
              {/* only the page you are on shows its name; the others are their icon and number */}
              {p === page && p}
              <span className={`font-mono text-[10px] ${p === page ? 'text-screen/45' : 'text-dim'}`}>{i + 1}</span>
            </button>
          ))}
        </div>
        {searchable && linked && toolbar(page === 'Apps')}
        <span
          title={linked ? 'mac linked' : 'no mac'}
          className={`mx-1.5 h-2 w-2 shrink-0 rounded-full ${linked ? 'bg-ok shadow-[0_0_8px_#3ddc84]' : 'bg-warn'} ${searchable && linked ? '' : 'ml-auto'}`}
        />
      </div>

      {!linked && waited ? (
        empty(
          forward === false
            ? 'No desktop link. Deck works the Mac this Car Thing is plugged into: open the bridgething desktop app there and turn on Deck’s extension.'
            : 'Waiting for the Mac. Open the bridgething desktop app there and turn on Deck’s extension.',
        )
      ) : page === 'Controls' ? (
        <div className="flex min-h-0 flex-1 gap-3.5">
          <NowPlaying mac={mac} media={playing} onSet={level => send({ type: 'set-volume', level })} onMedia={media} />
          {/* the controls in pages of nine, three by three, swiped sideways, with a dot for each page under them */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div
              // room round the pages for a tapped tile's ring of light, which the clipping would otherwise cut
              className="-m-4 min-h-0 flex-1 touch-pan-y overflow-hidden p-4"
              onPointerDown={e => (swipe.current = e.clientX)}
              onPointerUp={e => {
                if (swipe.current === null) return;
                const dx = e.clientX - swipe.current;
                swipe.current = null;
                if (dx < -SWIPE_PX) setCtlPage(p => Math.min(controlPages.length - 1, p + 1));
                else if (dx > SWIPE_PX) setCtlPage(p => Math.max(0, p - 1));
              }}>
              <div className="flex h-full gap-8 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ transform: `translateX(calc(${-ctlPage} * (100% + 32px)))` }}>
                {controlPages.map((pageTiles, i) => (
                  <div key={i} className="grid h-full w-full shrink-0 grid-cols-3 grid-rows-3 gap-2.5">
                    {pageTiles.map(a => tile(a))}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-center gap-1.5">
              {controlPages.map((_, i) => (
                <button key={i} onClick={() => setCtlPage(i)} aria-label={`controls page ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === ctlPage ? 'w-5 bg-white' : 'w-1.5 bg-white/30'}`} />
              ))}
            </div>
          </div>
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
      ) : page === 'Running' ? (
        running.length === 0 ? (
          empty('Asking the Mac what is running…')
        ) : (
          shortcutsOf ? (
            // one app's shortcuts, from its own menus, narrowed by menu; a tap clicks that menu item, back returns
            (() => {
              const front = running.find(a => a.active);
              const app = shortcutsOf === 'front' ? front : shortcutsOf;
              const name = shortcutsOf === 'front' ? (keys?.app ?? front?.name ?? 'the app') : shortcutsOf.name;
              const ready = keys && keys.app === name && keys.app === mac?.front?.name;
              // the menus in the app's own order, but its app menu (hide, quit) last, as the least reached for
              const order = ready ? [...new Set(keys.items.map(k => k.menu))] : [];
              const menus = order.length > 1 ? [...order.slice(1), order[0]] : order;
              const groups = menus.filter(m => !keyMenu || m === keyMenu).map(m => [m, keys!.items.filter(k => k.menu === m)] as const);
              return (
                <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                  <div className="flex shrink-0 items-center gap-2.5">
                    <button onClick={() => setShortcutsOf(null)} className="flex items-center gap-1.5 rounded-full bg-white/10 py-1.5 pr-3.5 pl-2.5 text-[0.8rem] font-semibold transition active:scale-95">
                      <Svg className="h-4 w-4">
                        <path d="M15 5l-7 7 7 7" />
                      </Svg>
                      Apps
                    </button>
                    {app && icons[`run:${app.path}`] && <img src={`data:image/png;base64,${icons[`run:${app.path}`]}`} alt="" className="h-8 w-8" draggable={false} />}
                    <span className="truncate text-[1rem] font-semibold">{name}</span>
                    {ready && <span className="font-mono text-[10px] tracking-[0.15em] text-dim uppercase">{keys.items.length} shortcuts</span>}
                  </div>
                  {!ready ? (
                    empty(`Reading ${name}’s shortcuts…`)
                  ) : keys.items.length === 0 ? (
                    empty('No shortcuts to show. Deck reads them from the app’s menus, which needs Accessibility: allow bridgething in System Settings › Privacy & Security › Accessibility.')
                  ) : (
                    <>
                      <div className="-mx-5 flex shrink-0 gap-1 overflow-x-auto px-5 [scrollbar-width:none]">
                        {[null, ...menus].map(m => (
                          <button
                            key={m ?? 'all'}
                            onClick={() => setKeyMenu(m)}
                            className={`shrink-0 rounded-full px-3 py-1.5 text-[0.75rem] font-semibold transition ${keyMenu === m ? 'bg-white text-screen' : 'bg-white/8 text-soft'}`}>
                            {m ?? 'All'}
                          </button>
                        ))}
                      </div>
                      {/* a card per menu, like a cheat sheet: its name, then each shortcut as a row with its keys, the cards
                          flowing in three columns so short and long menus pack together; one menu chosen fills the width */}
                      <div ref={list} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
                        <div className={keyMenu ? '' : 'columns-3 gap-2.5'}>
                          {groups.map(([menu, items]) => (
                            <div key={menu} className="mb-2.5 break-inside-avoid rounded-2xl border border-white/8 bg-white/5 p-1.5">
                              <div className="flex items-baseline justify-between px-2 pt-1 pb-1.5">
                                <span className="font-mono text-[10px] tracking-[0.2em] text-soft uppercase">{menu}</span>
                                <span className="font-mono text-[10px] text-dim">{items.length}</span>
                              </div>
                              <div className={keyMenu ? 'grid grid-cols-2 gap-x-2' : ''}>
                                {items.map(k => {
                                  const state = flash[`key:${k.menu}/${k.title}`];
                                  return (
                                    <button
                                      key={k.title}
                                      disabled={!k.enabled}
                                      onClick={() => pressKey(k)}
                                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition active:scale-[0.98] active:bg-white/10 disabled:opacity-35 ${
                                        state === 'ok' ? 'bg-ok-soft' : state === 'fail' ? 'bg-err-soft' : ''
                                      } ${state === 'busy' ? 'animate-pulse' : ''}`}>
                                      <span className="min-w-0 flex-1 truncate text-[0.8rem]">{k.title}</span>
                                      <kbd className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-[0.74rem] tracking-[0.05em] text-white/90">{combo(k)}</kbd>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()
          ) : (
          <div className="relative min-h-0 flex-1">
            {/* every app open on the mac, the one in front in the middle, centred both ways; a tap brings it forward
                and opens its shortcuts. the inner block centres itself with auto margins, which give way once it
                outgrows the page, so a long list scrolls from its top */}
            <div ref={sheetList} className="absolute inset-0 flex flex-col overflow-y-auto [scrollbar-width:none]">
              <div className="my-auto flex flex-wrap justify-center gap-2">
                {running.map(app => (
                  <div key={app.path} className="relative">
                  <button
                    onPointerDown={() => startHold(app)}
                    onPointerUp={() => stopHold(app)}
                    onPointerLeave={() => stopHold(null)}
                    onPointerCancel={() => stopHold(null)}
                    onContextMenu={e => e.preventDefault()}
                    className={`relative flex w-[140px] flex-col items-center justify-start gap-2 rounded-2xl p-3 transition duration-200 active:scale-95 ${
                      app.active ? 'bg-white/12 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.28)]' : ''
                    } ${flash[`quit:${app.path}`] === 'fail' ? 'animate-tile-fail' : ''} ${flash[`quit:${app.path}`] === 'busy' ? 'scale-90 opacity-40' : ''}`}>
                    {icons[`run:${app.path}`] ? (
                      <img src={`data:image/png;base64,${icons[`run:${app.path}`]}`} alt="" className={`h-[72px] w-[72px] ${app.hidden ? 'opacity-55' : ''}`} draggable={false} />
                    ) : (
                      <span className="grid h-[72px] w-[72px] place-items-center rounded-[18px] bg-white/10 text-[1.6rem] font-bold">{app.name.slice(0, 1)}</span>
                    )}
                    <span className="line-clamp-2 w-full text-center text-[0.82rem] leading-tight font-medium break-words text-white/85">{app.name}</span>
                    {app.active && <span className="rounded-full bg-ok-soft px-2 py-0.5 font-mono text-[9px] tracking-[0.15em] text-ok uppercase">in front</span>}
                    {!app.active && app.hidden && <span className="font-mono text-[9px] tracking-[0.15em] text-dim uppercase">hidden</span>}
                    {/* while held, a bar under the name fills towards quitting; it hangs below the tile, so the tile keeps
                        its size while it shows */}
                    {holding === app.path && (
                      <span className="absolute inset-x-4 top-full mt-1.5 flex flex-col items-center gap-1">
                        <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                          <span className="block h-full animate-[hold-fill_1s_linear_forwards] rounded-full bg-err" />
                        </span>
                        <span className="font-mono text-[9px] tracking-[0.15em] whitespace-nowrap text-err uppercase">keep holding to quit</span>
                      </span>
                    )}
                  </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center font-mono text-[10px] tracking-[0.2em] text-dim uppercase">
              tap an app for its shortcuts · hold to quit it
            </div>
          </div>
          )
        )
      ) : page === 'Clipboard' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          <div className="flex items-center gap-3 px-1">
            <span className="font-mono text-[10px] tracking-[0.15em] text-dim uppercase">copied text, kept on the mac until it restarts · never a password manager’s</span>
            {clips.length > 0 && (
              <button onClick={() => send({ type: 'clear-clips' })} className="ml-auto rounded-full bg-white/8 px-3 py-1.5 text-[0.75rem] text-soft">
                Clear
              </button>
            )}
          </div>
          {clips.length === 0 ? (
            empty('Nothing copied yet. Text you copy on the Mac turns up here.')
          ) : (
            <div ref={sheetList} className="-m-1.5 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5 [scrollbar-width:none]">
              {clips.map((c, i) => (
                <button
                  key={c.id}
                  data-pick={i}
                  onClick={() => {
                    setPick(i);
                    copyBack(c);
                  }}
                  className={`flex shrink-0 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition active:scale-[0.98] ${
                    i === pick ? 'bg-white/14 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.28)]' : 'bg-white/5'
                  }`}>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[0.88rem] break-all whitespace-pre-wrap">{c.text}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-dim">{i === 0 ? 'on the clipboard now' : ago(c.at)}</span>
                  </span>
                  {/* the copy button; the whole row copies too, this says so and shows when it has */}
                  <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.75rem] font-semibold transition ${copied === c.id ? 'bg-ok text-screen' : 'bg-white/10 text-white'}`}>
                    <Svg className="h-3.5 w-3.5">{copied === c.id ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : GLYPH.clipboard}</Svg>
                    {copied === c.id ? 'Copied' : 'Copy'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {typing && (page === 'Apps' || page === 'Shortcuts') && keyboard}

    </div>
  );
}
