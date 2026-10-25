// the deck's hands on the mac. it lists what the deck may ask for, the built-in controls, the user's shortcuts and
// the installed apps, and runs only what is on that list: the deck sends an id, never a command, path or script.
// every program runs from a fixed path with fixed arguments and no shell. the only values from the deck that reach a
// script are a volume step or level, each clamped to a whole number first, and a media command checked against a fixed
// three
import { asJson, defineExtension, json, type ExtensionContext } from '@bridgething/extension';

import { CONTROLS, MEDIA_APPS, MEDIA_COMMANDS, categoryOf, type Action, type Media, type ToDeck, type ToMac } from '../src/protocol';

const decoder = new TextDecoder();
// the catalogue is read again this often, so a new shortcut or app turns up without a restart
const CATALOG_EVERY_MS = 5 * 60_000;
// volume can change from the keyboard too, so it is read again while a deck is watching
const STATE_EVERY_MS = 3000;
const APP_DIRS = ['/Applications', '/System/Applications', '/System/Applications/Utilities'];
const ICONS_PER_MESSAGE = 16;
// draws each app's own icon, as the finder shows it, into a 96 pixel png, sharp at the deck's 80. the paths come from this extension's own
// reading of the applications folders and arrive as arguments, never as part of the script
const ICON_SCRIPT = `ObjC.import('AppKit');
function run(argv) {
  const out = {};
  for (const path of argv) {
    const icon = $.NSWorkspace.sharedWorkspace.iconForFile(path);
    const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, 96, 96, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
    $.NSGraphicsContext.saveGraphicsState;
    $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
    icon.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, 96, 96), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1);
    $.NSGraphicsContext.restoreGraphicsState;
    out[path] = ObjC.unwrap(rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).base64EncodedStringWithOptions(0));
  }
  return JSON.stringify(out);
}`;

// each app's category and when it was last opened, read from its bundle and from spotlight
const META_SCRIPT = `ObjC.import('Foundation');
function run(argv) {
  const out = {};
  for (const path of argv) {
    const bundle = $.NSBundle.bundleWithPath(path);
    const kind = bundle.isNil() ? null : bundle.objectForInfoDictionaryKey('LSApplicationCategoryType');
    const item = $.NSMetadataItem.alloc.initWithURL($.NSURL.fileURLWithPath(path));
    const used = item.isNil() ? null : item.valueForAttribute('kMDItemLastUsedDate');
    out[path] = { kind: kind && !kind.isNil() ? ObjC.unwrap(kind) : null, used: used && !used.isNil() ? Math.round(used.timeIntervalSince1970 * 1000) : 0 };
  }
  return JSON.stringify(out);
}`;
// the volume, the mic, and what spotify or music is playing, the one that is playing winning. an app that is not
// running is never started by asking
const STATE_SCRIPT = `function run() {
  const me = Application.currentApplication();
  me.includeStandardAdditions = true;
  const v = me.getVolumeSettings();
  let media = null;
  for (const name of ${JSON.stringify(MEDIA_APPS)}) {
    try {
      const app = Application(name);
      if (!app.running()) continue;
      const state = app.playerState();
      if (state === 'stopped') continue;
      const track = app.currentTrack;
      const found = { app: name, title: track.name(), artist: track.artist(), playing: state === 'playing' };
      if (!media || found.playing) media = found;
    } catch (e) {}
  }
  return JSON.stringify({ volume: v.outputVolume, muted: v.outputMuted, input: v.inputVolume, media });
}`;
// the player and the command arrive as arguments, each checked against a fixed list before this runs
const MEDIA_SCRIPT = `function run(argv) {
  const app = Application(argv[0]);
  if (argv[1] === 'playpause') app.playpause();
  else if (argv[1] === 'next') app.nextTrack();
  else if (argv[1] === 'previous') app.previousTrack();
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

// screencapture says why it failed on stderr, which is the only way to tell a missing macos permission apart
let logWarn: (...args: unknown[]) => void = () => {};
async function capture(args: string[]): Promise<boolean> {
  try {
    const { success, stderr } = await new Deno.Command('/usr/sbin/screencapture', { args, stdout: 'null', stderr: 'piped', stdin: 'null', signal: AbortSignal.timeout(8000) }).output();
    if (!success) logWarn(`screencapture ${args.join(' ')} failed: ${decoder.decode(stderr).trim() || 'no reason given'}`);
    return success;
  } catch (err) {
    logWarn(`screencapture could not start: ${err}`);
    return false;
  }
}

const osa = (...lines: string[]) => run('/usr/bin/osascript', lines.flatMap(line => ['-e', line]));

const jxa = (script: string, args: string[] = [], timeoutMs = 8000) => run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, ...args], timeoutMs);

async function readState(): Promise<{ volume: number; muted: boolean; micMuted: boolean; input: number; media: Media | null }> {
  try {
    const s = JSON.parse((await jxa(STATE_SCRIPT)) ?? '{}');
    return { volume: Number(s.volume) || 0, muted: s.muted === true, micMuted: Number(s.input) === 0, input: Number(s.input) || 0, media: s.media ?? null };
  } catch {
    return { volume: 0, muted: false, micMuted: false, input: 0, media: null };
  }
}

// the folder apple fills with its starter shortcuts, by the names it goes by in each language seen so far
const STARTER = /^(starter shortcuts|phím tắt khởi đầu)$/i;
// a shortcut still called what the editor named it is an untouched draft
const UNTITLED = /^New Shortcut( \d+)?$/;

const lines = (out: string | null) => (out ?? '').split('\n').filter(s => s.trim());

// only the user's own: not apple's starters, not drafts left with the editor's name. names are kept exactly, a
// trailing space included, since that is the name `shortcuts run` matches
async function listShortcuts(): Promise<string[]> {
  const [all, folders] = await Promise.all([run('/usr/bin/shortcuts', ['list']), run('/usr/bin/shortcuts', ['list', '--folders'])]);
  const starters = new Set(
    (await Promise.all(lines(folders).filter(f => STARTER.test(f.trim())).map(f => run('/usr/bin/shortcuts', ['list', '--folder-name', f])))).flatMap(lines),
  );
  return lines(all).filter(name => !starters.has(name) && !UNTITLED.test(name.trim()));
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

async function jxaJson<T>(script: string, paths: string[]): Promise<Record<string, T>> {
  if (!paths.length) return {};
  try {
    return JSON.parse((await jxa(script, paths, 30_000)) ?? '{}');
  } catch {
    return {};
  }
}

let timers: ReturnType<typeof setInterval>[] = [];

defineExtension({
  start(ctx: ExtensionContext) {
    logWarn = (...args) => ctx.log.warn(...args);
    let shortcuts: string[] = [];
    let apps = new Map<string, string>();
    // drawn once per app path, and only again for an app that is new; sent once to each page that asks
    const icons = new Map<string, string>();
    let sent = new Set<string>();
    let media: Media | null = null;
    const send = (message: ToDeck) => ctx.broadcast(json(message));
    const watching = () => ctx.devices.some(d => d.connected && d.active);

    const catalog = async () => {
      [shortcuts, apps] = await Promise.all([listShortcuts(), listApps()]);
      const meta = await jxaJson<{ kind: string | null; used: number }>(META_SCRIPT, [...apps.values()]);
      const actions: Action[] = [
        ...CONTROLS,
        ...shortcuts.map(name => ({ id: `shortcut:${name}`, label: name.trim(), kind: 'shortcut' as const })),
        ...[...apps].map(([name, path]) => ({
          id: `app:${name}`,
          label: name,
          kind: 'app' as const,
          group: categoryOf(meta[path]?.kind ?? null, path),
          used: meta[path]?.used ?? 0,
        })),
      ];
      send({ type: 'catalog', actions });
      const missing = [...apps.values()].filter(path => !icons.has(path));
      for (const [path, png] of Object.entries(await jxaJson<string>(ICON_SCRIPT, missing))) icons.set(path, png);
      const due = [...apps].flatMap(([name, path]) => (icons.has(path) && !sent.has(path) ? [[`app:${name}`, icons.get(path)!, path] as const] : []));
      for (let i = 0; i < due.length; i += ICONS_PER_MESSAGE) {
        const batch = due.slice(i, i + ICONS_PER_MESSAGE);
        send({ type: 'icons', icons: Object.fromEntries(batch.map(([id, png]) => [id, png])) });
        batch.forEach(([, , path]) => sent.add(path));
      }
    };
    // a page that has just opened has no icons yet, so they all go again
    const fresh = () => {
      sent = new Set();
      catalog().then(state);
    };
    const state = async () => {
      const { input: _input, ...now } = await readState();
      media = now.media;
      send({ type: 'state', ...now });
    };

    // each id maps to one fixed program; a shortcut or app has to be one the mac listed itself
    const perform = async (id: string): Promise<boolean> => {
      if (id === 'mute') return (await osa('set volume output muted (not (output muted of (get volume settings)))')) !== null;
      if (id === 'vol-up' || id === 'vol-down') return step(id === 'vol-up' ? 6 : -6);
      if (id === 'mic') {
        const { micMuted, input } = await readState();
        const back = Number((await ctx.kv.get('micLevel')) ?? 75);
        if (!micMuted) await ctx.kv.set('micLevel', input || 75);
        return (await osa(`set volume input volume ${micMuted ? Math.round(back) : 0}`)) !== null;
      }
      if (id === 'screenshot') {
        const stamp = new Date().toISOString().slice(0, 19).replace('T', ' at ').replaceAll(':', '.');
        const home = Deno.env.get('HOME');
        if (home && (await capture(['-x', `${home}/Desktop/Deck ${stamp}.png`]))) return true;
        // macos keeps the desktop folder from a process it has not been allowed into; the clipboard needs no folder
        return capture(['-x', '-c']);
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
      if (event.type === 'connected' || event.type === 'active') fresh();
    });

    ctx.on('message', (_device, message) => {
      const m = asJson<ToMac>(message);
      if (!m || typeof m !== 'object') return;
      if (m.type === 'hello') fresh();
      else if (m.type === 'run' && typeof m.id === 'string') {
        // an action that throws counts as failed, so the tile says so rather than waiting forever
        perform(m.id).catch(() => false).then(ok => {
          ctx.log.info(`ran ${m.id}: ${ok ? 'ok' : 'failed'}`);
          send({ type: 'result', id: m.id, ok });
          state();
        });
      } else if (m.type === 'volume' && typeof m.delta === 'number' && Number.isFinite(m.delta)) {
        step(Math.max(-20, Math.min(20, m.delta))).then(state);
      } else if (m.type === 'set-volume' && typeof m.level === 'number' && Number.isFinite(m.level)) {
        const level = Math.max(0, Math.min(100, Math.round(m.level)));
        osa(`set volume output volume ${level}`).then(state);
      } else if (m.type === 'media' && MEDIA_COMMANDS.includes(m.command) && media && MEDIA_APPS.includes(media.app)) {
        // only the player already reported as playing or paused is told what to do
        jxa(MEDIA_SCRIPT, [media.app, m.command]).then(() => setTimeout(state, 300));
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
