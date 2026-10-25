// the deck's hands on the mac. it lists what the deck may ask for, the built-in controls, the user's shortcuts and
// the installed apps, and runs only what is on that list: the deck sends an id, never a command, path or script.
// every program runs from a fixed path with fixed arguments and no shell, and the only value from the deck that
// reaches a script is a volume step, clamped to a whole number first
import { asJson, defineExtension, json, type ExtensionContext } from '@bridgething/extension';

import { CONTROLS, type Action, type ToDeck, type ToMac } from '../src/protocol';

const decoder = new TextDecoder();
// the catalogue is read again this often, so a new shortcut or app turns up without a restart
const CATALOG_EVERY_MS = 5 * 60_000;
// volume can change from the keyboard too, so it is read again while a deck is watching
const STATE_EVERY_MS = 3000;
const APP_DIRS = ['/Applications', '/System/Applications', '/System/Applications/Utilities'];
const ICONS_PER_MESSAGE = 16;
// draws each app's own icon, as the finder shows it, into a 64 pixel png. the paths come from this extension's own
// reading of the applications folders and arrive as arguments, never as part of the script
const ICON_SCRIPT = `ObjC.import('AppKit');
function run(argv) {
  const out = {};
  for (const path of argv) {
    const icon = $.NSWorkspace.sharedWorkspace.iconForFile(path);
    const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, 64, 64, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
    $.NSGraphicsContext.saveGraphicsState;
    $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
    icon.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, 64, 64), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1);
    $.NSGraphicsContext.restoreGraphicsState;
    out[path] = ObjC.unwrap(rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).base64EncodedStringWithOptions(0));
  }
  return JSON.stringify(out);
}`;

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

// app name to its bundle path, the first found winning, as `open -a` would
async function listApps(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const dir of APP_DIRS) {
    try {
      for await (const entry of Deno.readDir(dir)) {
        const name = entry.name.slice(0, -4);
        if (entry.name.endsWith('.app') && !found.has(name)) found.set(name, `${dir}/${entry.name}`);
      }
    } catch {
      // a folder this mac lacks, or one the permissions leave out, just adds nothing
    }
  }
  return new Map([...found].sort(([a], [b]) => a.localeCompare(b)));
}

async function drawIcons(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const out = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', ICON_SCRIPT, ...paths], 30_000);
  try {
    return out ? JSON.parse(out) : {};
  } catch {
    return {};
  }
}

let timers: ReturnType<typeof setInterval>[] = [];

defineExtension({
  start(ctx: ExtensionContext) {
    let shortcuts: string[] = [];
    let apps = new Map<string, string>();
    // drawn once per app path, and only again for an app that is new
    const icons = new Map<string, string>();
    const send = (message: ToDeck) => ctx.broadcast(json(message));
    const watching = () => ctx.devices.some(d => d.connected && d.active);

    const catalog = async () => {
      [shortcuts, apps] = await Promise.all([listShortcuts(), listApps()]);
      const actions: Action[] = [
        ...CONTROLS,
        ...shortcuts.map(name => ({ id: `shortcut:${name}`, label: name.trim(), kind: 'shortcut' as const })),
        ...[...apps.keys()].map(name => ({ id: `app:${name}`, label: name, kind: 'app' as const })),
      ];
      send({ type: 'catalog', actions });
      const missing = [...apps.values()].filter(path => !icons.has(path));
      for (const [path, png] of Object.entries(await drawIcons(missing))) icons.set(path, png);
      const all = [...apps].flatMap(([name, path]) => (icons.has(path) ? [[`app:${name}`, icons.get(path)!] as const] : []));
      for (let i = 0; i < all.length; i += ICONS_PER_MESSAGE) send({ type: 'icons', icons: Object.fromEntries(all.slice(i, i + ICONS_PER_MESSAGE)) });
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
        const home = Deno.env.get('HOME');
        return !!home && (await run('/usr/sbin/screencapture', ['-x', `${home}/Desktop/Deck ${stamp}.png`])) !== null;
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
        return apps.has(name) && (await run('/usr/bin/open', ['-a', name])) !== null;
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
        // an action that throws counts as failed, so the tile says so rather than waiting forever
        perform(m.id).catch(() => false).then(ok => {
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
