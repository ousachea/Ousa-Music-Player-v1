// what the deck and the mac say to each other over the forward surface. the deck only ever names an action the mac
// listed for it, or one of a fixed few media commands; the mac never takes a command, a path or a script from the deck
// an app carries its category and when it was last opened, so the deck can group and sort them
export type Action = { id: string; label: string; kind: 'control' | 'shortcut' | 'app'; group?: string; used?: number };

export const MEDIA_APPS = ['Spotify', 'Music'] as const;
export const MEDIA_COMMANDS = ['playpause', 'next', 'previous'] as const;
export type Media = { app: (typeof MEDIA_APPS)[number]; title: string; artist: string; playing: boolean };
// what the toggle and status tiles show; null where this mac has no such thing, a desktop without a battery say
export type Battery = { percent: number; charging: boolean; plugged: boolean; remaining: string | null };
export type Extras = { awake: boolean; wifi: boolean | null; dark: boolean | null; battery: Battery | null };
// the app in front on the mac, its name and the bundle file it runs from, and what the clipboard holds. a password
// manager marks what it copies as concealed, and that is only ever reported as hidden, never its text
export type Front = { name: string; file: string };
export type Clip = { kind: 'text' | 'image' | 'hidden' | 'empty'; text: string | null };

export type ToMac =
  | { type: 'hello' }
  | { type: 'run'; id: string }
  | { type: 'volume'; delta: number }
  // a level dragged to on the slider, 0 to 100
  | { type: 'set-volume'; level: number }
  | { type: 'media'; command: (typeof MEDIA_COMMANDS)[number] };

export type ToDeck =
  | { type: 'catalog'; actions: Action[] }
  | ({ type: 'state'; volume: number; muted: boolean; micMuted: boolean; media: Media | null; front: Front | null; clip: Clip } & Extras)
  // an app's own icon as base64 png, keyed by its action id; sent in batches after the catalogue
  | { type: 'icons'; icons: Record<string, string> }
  | { type: 'result'; id: string; ok: boolean };

// the built-in controls, in the order the pages show them, nine to a page
export const CONTROLS: Action[] = [
  { id: 'front', label: 'Active app', kind: 'control' },
  { id: 'clipboard', label: 'Clipboard', kind: 'control' },
  { id: 'mic', label: 'Mute mic', kind: 'control' },
  { id: 'mute', label: 'Mute sound', kind: 'control' },
  { id: 'screenshot', label: 'Screenshot', kind: 'control' },
  { id: 'display-sleep', label: 'Lock screen', kind: 'control' },
  { id: 'mission', label: 'Mission Control', kind: 'control' },
  { id: 'awake', label: 'Keep awake', kind: 'control' },
  { id: 'dark', label: 'Dark mode', kind: 'control' },
  { id: 'desktop', label: 'Show desktop', kind: 'control' },
  { id: 'wifi', label: 'Wi-Fi', kind: 'control' },
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
      dark: flag(m.dark),
      battery,
    };
  }
  if (m.type === 'icons' && m.icons && typeof m.icons === 'object') {
    const icons: Record<string, string> = {};
    for (const [id, png] of Object.entries(m.icons as Record<string, unknown>))
      if (typeof png === 'string' && /^[A-Za-z0-9+/]+=*$/.test(png)) icons[id] = png;
    return { type: 'icons', icons };
  }
  if (m.type === 'result' && typeof m.id === 'string') return { type: 'result', id: m.id, ok: m.ok === true };
  return null;
}

// an app's category from the type its bundle declares, in words a person would group by
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
