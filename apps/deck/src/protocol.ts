// what the deck and the mac say to each other over the forward surface. the deck only ever names an action the mac
// listed for it, or one of a fixed few media commands; the mac never takes a command, a path or a script from the deck
// an app carries its category and when it was last opened, so the deck can group and sort them
export type Action = { id: string; label: string; kind: 'control' | 'shortcut' | 'app'; group?: string; used?: number };

export const MEDIA_APPS = ['Spotify', 'Music'] as const;
export const MEDIA_COMMANDS = ['playpause', 'next', 'previous'] as const;
export type Media = { app: (typeof MEDIA_APPS)[number]; title: string; artist: string; playing: boolean };
// what the toggle and status tiles show; null where this mac has no such thing, a desktop without a battery say
export type Battery = { percent: number; charging: boolean; plugged: boolean; remaining: string | null };
// the wifi network's name is null where macos keeps it back, which it does from a process without location access
export type Extras = {
  awake: boolean;
  wifi: boolean | null;
  network: string | null;
  ip: string | null;
  dark: boolean | null;
  battery: Battery | null;
  // bluetooth's power and the names of the devices connected now; null where the mac reports nothing
  bluetooth: { on: boolean; devices: string[] } | null;
};
// the app in front on the mac, its name and the bundle file it runs from, and what the clipboard holds. a password
// manager marks what it copies as concealed, and that is only ever reported as hidden, never its text
export type Front = { name: string; file: string };
export type Clip = { kind: 'text' | 'image' | 'hidden' | 'empty'; text: string | null };
// an app running on the mac, as the command-tab switcher lists it; its icon arrives keyed `run:<path>`
export type Running = { name: string; path: string; active: boolean; hidden: boolean };
// a menu item in the app in front that has a keyboard shortcut: its menu, its name, the key and the modifiers as
// the menu reports them (a bitmask: 1 shift, 2 option, 4 control, 8 no command)
export type Key = { menu: string; title: string; key: string; mods: number; enabled: boolean };
// a piece of text copied on the mac, kept by the extension in memory only; the deck asks for one back by its id
export type Copied = { id: number; text: string; at: number };

export type ToMac =
  | { type: 'hello' }
  | { type: 'run'; id: string }
  | { type: 'volume'; delta: number }
  // a level dragged to on the slider, 0 to 100
  | { type: 'set-volume'; level: number }
  | { type: 'media'; command: (typeof MEDIA_COMMANDS)[number] }
  // the switcher asks for what is running, then names one by the path the mac gave it
  | { type: 'running' }
  | { type: 'switch'; path: string }
  // one of the running apps asked to quit, as command-q would, by the path the mac gave it
  | { type: 'quit-app'; path: string }
  // the clipboard sheet asks for the history, puts one entry back by its id, or clears the lot
  | { type: 'clips' }
  | { type: 'copy'; id: number }
  | { type: 'clear-clips' }
  // the shortcuts of the app in front, and one of them pressed, named by its menu and title from that list
  | { type: 'keys' }
  | { type: 'press'; app: string; menu: string; title: string };

export type ToDeck =
  | { type: 'catalog'; actions: Action[] }
  | ({ type: 'state'; volume: number; muted: boolean; micMuted: boolean; media: Media | null; front: Front | null; clip: Clip } & Extras)
  // an app's own icon as base64 png, keyed by its action id; sent in batches after the catalogue
  | { type: 'icons'; icons: Record<string, string> }
  | { type: 'result'; id: string; ok: boolean }
  | { type: 'running'; apps: Running[] }
  | { type: 'clips'; items: Copied[] }
  | { type: 'keys'; app: string; items: Key[] };

// the built-in controls, in the order the pages show them, nine to a page
export const CONTROLS: Action[] = [
  { id: 'mic', label: 'Mute mic', kind: 'control' },
  { id: 'mute', label: 'Mute sound', kind: 'control' },
  { id: 'screenshot', label: 'Screenshot', kind: 'control' },
  { id: 'display-sleep', label: 'Lock screen', kind: 'control' },
  { id: 'mission', label: 'Mission Control', kind: 'control' },
  { id: 'awake', label: 'Keep awake', kind: 'control' },
  { id: 'dark', label: 'Dark mode', kind: 'control' },
  { id: 'desktop', label: 'Show desktop', kind: 'control' },
  { id: 'wifi', label: 'Wi-Fi', kind: 'control' },
  { id: 'bluetooth', label: 'Bluetooth', kind: 'control' },
  { id: 'battery', label: 'Battery', kind: 'control' },
  { id: 'focus', label: 'Focus', kind: 'control' },
  { id: 'screensaver', label: 'Screen saver', kind: 'control' },
  { id: 'quit', label: 'Quit app', kind: 'control' },
  { id: 'brightness', label: 'Brightness', kind: 'control' },
  { id: 'trash', label: 'Empty Trash', kind: 'control' },
  { id: 'sleep', label: 'Sleep Mac', kind: 'control' },
];
// what a control tile can ask for besides its own id: the volume steps are the wheel's, and the brightness tile has
// a dimmer and a brighter half
export const CONTROL_STEPS = ['vol-up', 'vol-down', 'bright-up', 'bright-down'] as const;
// the shortcut the focus tile runs, since macos has no command for focus of its own
export const FOCUS_SHORTCUT = 'Toggle Focus';

function readBluetooth(raw: unknown): Extras['bluetooth'] {
  const b = raw as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || typeof b.on !== 'boolean') return null;
  return { on: b.on, devices: Array.isArray(b.devices) ? b.devices.filter((d): d is string => typeof d === 'string') : [] };
}

function readClip(raw: unknown): Clip {
  const c = raw as Clip | null;
  if (!c || typeof c !== 'object' || !['text', 'image', 'hidden', 'empty'].includes(c.kind)) return { kind: 'empty', text: null };
  return { kind: c.kind, text: c.kind === 'text' && typeof c.text === 'string' ? c.text : null };
}

function readMedia(raw: unknown): Media | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!MEDIA_APPS.includes(m.app as Media['app']) || typeof m.title !== 'string') return null;
  return { app: m.app as Media['app'], title: m.title, artist: typeof m.artist === 'string' ? m.artist : '', playing: m.playing === true };
}

// a message from the mac, checked before the deck believes it
export function readToDeck(raw: unknown): ToDeck | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.type === 'catalog' && Array.isArray(m.actions)) {
    const actions: Action[] = [];
    for (const a of m.actions as Record<string, unknown>[]) {
      if (!a || typeof a !== 'object' || typeof a.id !== 'string' || typeof a.label !== 'string') continue;
      if (a.kind !== 'control' && a.kind !== 'shortcut' && a.kind !== 'app') continue;
      actions.push({
        id: a.id,
        label: a.label,
        kind: a.kind,
        ...(typeof a.group === 'string' ? { group: a.group } : {}),
        ...(typeof a.used === 'number' && Number.isFinite(a.used) ? { used: a.used } : {}),
      });
    }
    return { type: 'catalog', actions };
  }
  if (m.type === 'state' && typeof m.volume === 'number') {
    const b = m.battery as Record<string, unknown> | null;
    const battery =
      b && typeof b === 'object' && typeof b.percent === 'number'
        ? { percent: Math.max(0, Math.min(100, b.percent)), charging: b.charging === true, plugged: b.plugged === true, remaining: typeof b.remaining === 'string' ? b.remaining : null }
        : null;
    const flag = (v: unknown) => (typeof v === 'boolean' ? v : null);
    return {
      type: 'state',
      volume: Math.max(0, Math.min(100, m.volume)),
      muted: m.muted === true,
      micMuted: m.micMuted === true,
      media: readMedia(m.media),
      front: m.front && typeof m.front === 'object' && typeof (m.front as Front).name === 'string' ? { name: (m.front as Front).name, file: String((m.front as Front).file ?? '') } : null,
      clip: readClip(m.clip),
      awake: m.awake === true,
      wifi: flag(m.wifi),
      network: typeof m.network === 'string' && m.network ? m.network : null,
      ip: typeof m.ip === 'string' && /^[0-9a-f.:]+$/i.test(m.ip) ? m.ip : null,
      dark: flag(m.dark),
      battery,
      bluetooth: readBluetooth(m.bluetooth),
    };
  }
  if (m.type === 'icons' && m.icons && typeof m.icons === 'object') {
    const icons: Record<string, string> = {};
    for (const [id, png] of Object.entries(m.icons as Record<string, unknown>))
      if (typeof png === 'string' && /^[A-Za-z0-9+/]+=*$/.test(png)) icons[id] = png;
    return { type: 'icons', icons };
  }
  if (m.type === 'result' && typeof m.id === 'string') return { type: 'result', id: m.id, ok: m.ok === true };
  if (m.type === 'keys' && typeof m.app === 'string' && Array.isArray(m.items))
    return {
      type: 'keys',
      app: m.app,
      items: (m.items as Record<string, unknown>[])
        .filter(k => k && typeof k.menu === 'string' && typeof k.title === 'string' && typeof k.key === 'string' && typeof k.mods === 'number')
        .map(k => ({ menu: k.menu as string, title: k.title as string, key: k.key as string, mods: k.mods as number, enabled: k.enabled !== false })),
    };
  if (m.type === 'clips' && Array.isArray(m.items))
    return {
      type: 'clips',
      items: (m.items as Record<string, unknown>[])
        .filter(c => c && typeof c.id === 'number' && typeof c.text === 'string' && typeof c.at === 'number')
        .map(c => ({ id: c.id as number, text: c.text as string, at: c.at as number })),
    };
  if (m.type === 'running' && Array.isArray(m.apps))
    return {
      type: 'running',
      apps: (m.apps as Record<string, unknown>[])
        .filter(a => a && typeof a.name === 'string' && typeof a.path === 'string')
        .map(a => ({ name: a.name as string, path: a.path as string, active: a.active === true, hidden: a.hidden === true })),
    };
  return null;
}

// an app's category from the type its bundle declares, in words a person would group by
// a shortcut's modifiers and key as the mac writes them on its menus, control, option, shift and command in that order
export function combo(k: Pick<Key, 'key' | 'mods'>): string {
  const keys: Record<string, string> = {
    '\u001b': '⎋',
    '\b': '⌫',
    '\u007f': '⌫',
    '\r': '↩',
    '\t': '⇥',
    ' ': 'Space',
    // appkit's private-use codes for the keys that have no character: arrows, delete forward, home, end, pages
    '\uf700': '↑',
    '\uf701': '↓',
    '\uf702': '←',
    '\uf703': '→',
    '\uf728': '⌦',
    '\uf729': '↖',
    '\uf72b': '↘',
    '\uf72c': '⇞',
    '\uf72d': '⇟',
  };
  const code = k.key.charCodeAt(0);
  // the function keys run from f1 at u+f704 to f35
  const key = code >= 0xf704 && code <= 0xf726 ? `F${code - 0xf704 + 1}` : (keys[k.key] ?? k.key.toUpperCase());
  const mods = (k.mods & 4 ? '⌃' : '') + (k.mods & 2 ? '⌥' : '') + (k.mods & 1 ? '⇧' : '') + (k.mods & 8 ? '' : '⌘');
  return mods + key;
}

// `pmset -g batt` read into a battery, or null on a mac without one
export function readBattery(text: string): Battery | null {
  const m = /(\d+)%;\s*([^;]+);?\s*([^\n]*)/.exec(text);
  if (!m) return null;
  const status = m[2].trim().toLowerCase();
  const left = /(\d+:\d+) remaining/.exec(m[3]);
  return { percent: Number(m[1]), charging: status === 'charging', plugged: /'AC Power'/.test(text), remaining: left ? left[1] : null };
}

export function categoryOf(uti: string | null, path: string): string {
  if (path.includes('/Utilities/')) return 'Utilities';
  if (!uti) return 'Other';
  const kind = uti.replace(/^public\.app-category\./, '');
  if (kind === 'games' || kind.endsWith('-games')) return 'Games';
  const named: Record<string, string> = {
    'graphics-design': 'Graphics & Design',
    'healthcare-fitness': 'Health & Fitness',
    'social-networking': 'Social',
    'developer-tools': 'Developer Tools',
  };
  return named[kind] ?? kind.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
