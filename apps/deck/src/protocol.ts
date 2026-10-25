// what the deck and the mac say to each other over the forward surface. the deck only ever names an action the mac
// listed for it, or one of a fixed few media commands; the mac never takes a command, a path or a script from the deck
// an app carries its category and when it was last opened, so the deck can group and sort them
export type Action = { id: string; label: string; kind: 'control' | 'shortcut' | 'app'; group?: string; used?: number };

export const MEDIA_APPS = ['Spotify', 'Music'] as const;
export const MEDIA_COMMANDS = ['playpause', 'next', 'previous'] as const;
export type Media = { app: (typeof MEDIA_APPS)[number]; title: string; artist: string; playing: boolean };

export type ToMac =
  | { type: 'hello' }
  | { type: 'run'; id: string }
  | { type: 'volume'; delta: number }
  | { type: 'media'; command: (typeof MEDIA_COMMANDS)[number] };

export type ToDeck =
  | { type: 'catalog'; actions: Action[] }
  | { type: 'state'; volume: number; muted: boolean; micMuted: boolean; media: Media | null }
  // an app's own icon as base64 png, keyed by its action id; sent in batches after the catalogue
  | { type: 'icons'; icons: Record<string, string> }
  | { type: 'result'; id: string; ok: boolean };

// the built-in controls, in the order the first page shows them
export const CONTROLS: Action[] = [
  { id: 'mic', label: 'Mute mic', kind: 'control' },
  { id: 'mute', label: 'Mute sound', kind: 'control' },
  { id: 'vol-down', label: 'Volume down', kind: 'control' },
  { id: 'vol-up', label: 'Volume up', kind: 'control' },
  { id: 'screenshot', label: 'Screenshot', kind: 'control' },
  { id: 'mission', label: 'Mission Control', kind: 'control' },
  { id: 'display-sleep', label: 'Lock screen', kind: 'control' },
  { id: 'sleep', label: 'Sleep Mac', kind: 'control' },
];

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
  if (m.type === 'state' && typeof m.volume === 'number')
    return { type: 'state', volume: Math.max(0, Math.min(100, m.volume)), muted: m.muted === true, micMuted: m.micMuted === true, media: readMedia(m.media) };
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
