// what the deck and the mac say to each other over the forward surface. the deck only ever names an action the mac
// listed for it; the mac never takes a command, a path or a script from the deck
export type Action = { id: string; label: string; kind: 'control' | 'shortcut' | 'app' };

export type ToMac = { type: 'hello' } | { type: 'run'; id: string } | { type: 'volume'; delta: number };

export type ToDeck =
  | { type: 'catalog'; actions: Action[] }
  | { type: 'state'; volume: number; muted: boolean; micMuted: boolean }
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

// a message from the mac, checked before the deck believes it
export function readToDeck(raw: unknown): ToDeck | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.type === 'catalog' && Array.isArray(m.actions)) {
    const actions = m.actions.filter(
      (a): a is Action =>
        !!a && typeof a === 'object' && typeof (a as Action).id === 'string' && typeof (a as Action).label === 'string' &&
        ['control', 'shortcut', 'app'].includes((a as Action).kind),
    );
    return { type: 'catalog', actions };
  }
  if (m.type === 'state' && typeof m.volume === 'number')
    return { type: 'state', volume: Math.max(0, Math.min(100, m.volume)), muted: m.muted === true, micMuted: m.micMuted === true };
  if (m.type === 'icons' && m.icons && typeof m.icons === 'object') {
    const icons: Record<string, string> = {};
    for (const [id, png] of Object.entries(m.icons as Record<string, unknown>))
      if (typeof png === 'string' && /^[A-Za-z0-9+/]+=*$/.test(png)) icons[id] = png;
    return { type: 'icons', icons };
  }
  if (m.type === 'result' && typeof m.id === 'string') return { type: 'result', id: m.id, ok: m.ok === true };
  return null;
}
