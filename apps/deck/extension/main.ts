// the deck's hands on the mac. it lists what the deck may ask for, the built-in controls, the user's shortcuts and
// the installed apps, and runs only what is on that list: the deck sends an id, never a command, path or script.
// every program runs from a fixed path with fixed arguments and no shell, and the only value from the deck that
// reaches a script is a volume step, clamped to a whole number first
import { homedir } from 'node:os';

import { asJson, defineExtension, json, type ExtensionContext } from '@bridgething/extension';

import { CONTROLS, type Action, type ToDeck, type ToMac } from '../src/protocol';

const decoder = new TextDecoder();
// the catalogue is read again this often, so a new shortcut or app turns up without a restart
const CATALOG_EVERY_MS = 5 * 60_000;
// volume can change from the keyboard too, so it is read again while a deck is watching
const STATE_EVERY_MS = 3000;
const APP_DIRS = ['/Applications', '/System/Applications', '/System/Applications/Utilities'];

async function run(binary: string, args: string[], timeoutMs = 8000): Promise<string | null> {
  try {
    const { success, stdout } = await new Deno.Command(binary, {
      args,
      stdout: 'piped',
      stderr: 'null',
      stdin: 'null',
      signal: AbortSignal.timeout(timeoutMs),
    }).output();
    return success ? decoder.decode(stdout) : null;
  } catch {
    return null;
  }
}

const osa = (...lines: string[]) => run('/usr/bin/osascript', lines.flatMap(line => ['-e', line]));

async function readState() {
  const out = await osa(
    'set s to get volume settings',
    'return (output volume of s as text) & "," & (output muted of s as text) & "," & (input volume of s as text)',
  );
  const [volume, muted, input] = (out ?? '').trim().split(',');
  return { volume: Number(volume) || 0, muted: muted === 'true', micMuted: Number(input) === 0 };
}

async function listShortcuts(): Promise<string[]> {
  const out = await run('/usr/bin/shortcuts', ['list']);
  // names are kept exactly, a trailing space included, since that is the name `shortcuts run` matches
  return (out ?? '').split('\n').filter(s => s.trim());
}

async function listApps(): Promise<string[]> {
  const names = new Set<string>();
  for (const dir of APP_DIRS) {
    try {
      for await (const entry of Deno.readDir(dir)) if (entry.name.endsWith('.app')) names.add(entry.name.slice(0, -4));
    } catch {
      // a folder this mac lacks, or one the permissions leave out, just adds nothing
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

let timers: ReturnType<typeof setInterval>[] = [];

defineExtension({
  start(ctx: ExtensionContext) {
    let shortcuts: string[] = [];
    let apps: string[] = [];
    const send = (message: ToDeck) => ctx.broadcast(json(message));
    const watching = () => ctx.devices.some(d => d.connected && d.active);

    const catalog = async () => {
      [shortcuts, apps] = await Promise.all([listShortcuts(), listApps()]);
      const actions: Action[] = [
        ...CONTROLS,
        ...shortcuts.map(name => ({ id: `shortcut:${name}`, label: name.trim(), kind: 'shortcut' as const })),
        ...apps.map(name => ({ id: `app:${name}`, label: name, kind: 'app' as const })),
      ];
      send({ type: 'catalog', actions });
    };
    const state = async () => send({ type: 'state', ...(await readState()) });

    // each id maps to one fixed program; a shortcut or app has to be one the mac listed itself
    const perform = async (id: string): Promise<boolean> => {
      if (id === 'mute') return (await osa('set volume output muted (not (output muted of (get volume settings)))')) !== null;
      if (id === 'vol-up' || id === 'vol-down') return step(id === 'vol-up' ? 6 : -6);
      if (id === 'mic') {
        const { micMuted } = await readState();
        const back = Number((await ctx.kv.get('micLevel')) ?? 75);
        if (!micMuted) {
          const level = Number(((await osa('input volume of (get volume settings)')) ?? '75').trim()) || 75;
          await ctx.kv.set('micLevel', level);
        }
        return (await osa(`set volume input volume ${micMuted ? Math.round(back) : 0}`)) !== null;
      }
      if (id === 'screenshot') {
        const stamp = new Date().toISOString().slice(0, 19).replace('T', ' at ').replaceAll(':', '.');
        return (await run('/usr/sbin/screencapture', ['-x', `${homedir()}/Desktop/Deck ${stamp}.png`])) !== null;
      }
      if (id === 'mission') return (await run('/usr/bin/open', ['-a', 'Mission Control'])) !== null;
      if (id === 'display-sleep') return (await run('/usr/bin/pmset', ['displaysleepnow'])) !== null;
      if (id === 'sleep') return (await run('/usr/bin/pmset', ['sleepnow'])) !== null;
      if (id.startsWith('shortcut:')) {
        const name = id.slice('shortcut:'.length);
        return shortcuts.includes(name) && (await run('/usr/bin/shortcuts', ['run', name], 120_000)) !== null;
      }
      if (id.startsWith('app:')) {
        const name = id.slice('app:'.length);
        return apps.includes(name) && (await run('/usr/bin/open', ['-a', name])) !== null;
      }
      return false;
    };

    const step = async (delta: number) => {
      const { volume } = await readState();
      const next = Math.max(0, Math.min(100, Math.round(volume + delta)));
      return (await osa(`set volume output volume ${next}`)) !== null;
    };

    ctx.on('device', event => {
      if (event.type === 'connected' || event.type === 'active') catalog().then(state);
    });

    ctx.on('message', (_device, message) => {
      const m = asJson<ToMac>(message);
      if (!m || typeof m !== 'object') return;
      if (m.type === 'hello') catalog().then(state);
      else if (m.type === 'run' && typeof m.id === 'string') {
        perform(m.id).then(ok => {
          ctx.log.info(`ran ${m.id}: ${ok ? 'ok' : 'failed'}`);
          send({ type: 'result', id: m.id, ok });
          state();
        });
      } else if (m.type === 'volume' && typeof m.delta === 'number' && Number.isFinite(m.delta)) {
        step(Math.max(-20, Math.min(20, m.delta))).then(state);
      }
    });

    timers = [
      setInterval(() => watching() && catalog(), CATALOG_EVERY_MS),
      setInterval(() => watching() && state(), STATE_EVERY_MS),
    ];
  },
  stop() {
    timers.forEach(clearInterval);
  },
});
