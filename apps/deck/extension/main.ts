// the deck's hands on the mac. it lists what the deck may ask for, the built-in controls, the user's shortcuts and
// the installed apps, and runs only what is on that list: the deck sends an id, never a command, path or script.
// every program runs from a fixed path with fixed arguments and no shell. the only values from the deck that reach a
// script are a volume step or level, each clamped to a whole number first, and a media command checked against a fixed
// three
import { asJson, defineExtension, json, type ExtensionContext } from '@bridgething/extension';

import { CONTROLS, FOCUS_SHORTCUT, MEDIA_APPS, MEDIA_COMMANDS, categoryOf, readBattery, type Action, type Clip, type Copied, type Extras, type Front, type Key, type Media, type Running, type ToDeck, type ToMac } from '../src/protocol';

const decoder = new TextDecoder();
// the catalogue is read again this often, so a new shortcut or app turns up without a restart
const CATALOG_EVERY_MS = 5 * 60_000;
// volume can change from the keyboard too, so it is read again while a deck is watching
const STATE_EVERY_MS = 3000;
const EXTRAS_EVERY_MS = 15_000;
const CLIP_EVERY_MS = 2000;
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
const STATE_SCRIPT = `ObjC.import('AppKit');
function run() {
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
  const fa = $.NSWorkspace.sharedWorkspace.frontmostApplication;
  const front = fa.isNil() ? null : { name: ObjC.unwrap(fa.localizedName), file: fa.bundleURL.isNil() ? '' : ObjC.unwrap(fa.bundleURL.path).split('/').pop().replace(/\\.app$/, '') };
  const pb = $.NSPasteboard.generalPasteboard;
  const types = ObjC.deepUnwrap(pb.types) || [];
  let clip = { kind: 'empty', text: null };
  if (types.includes('org.nspasteboard.ConcealedType')) clip = { kind: 'hidden', text: null };
  else {
    const s = pb.stringForType($.NSPasteboardTypeString);
    if (!s.isNil()) clip = { kind: 'text', text: ObjC.unwrap(s).slice(0, 240) };
    else if (types.some(t => /png|tiff|jpeg/i.test(t))) clip = { kind: 'image', text: null };
  }
  return JSON.stringify({ volume: v.outputVolume, muted: v.outputMuted, input: v.inputVolume, media, front, clip });
}`;
// show desktop hides every app the user can see but finder, and says which, so a second tap can bring those back.
// the names come from system events itself and go back to it as arguments
const HIDE_SCRIPT = `function run() {
  const se = Application('System Events');
  const names = se.applicationProcesses.whose({ visible: true, backgroundOnly: false }).name().filter(n => n !== 'Finder');
  for (const n of names) se.applicationProcesses.byName(n).visible = false;
  return JSON.stringify(names);
}`;
const SHOW_SCRIPT = `function run(argv) {
  const se = Application('System Events');
  for (const n of argv) try { se.applicationProcesses.byName(n).visible = true; } catch (e) {}
}`;
// every menu item with a keyboard shortcut in the app in front, read through system events in a few batched calls
// per menu; it needs accessibility access, and answers with none without it
const MENU_SCRIPT = `function run() {
  const se = Application('System Events');
  const p = se.applicationProcesses.whose({ frontmost: true })[0];
  const out = [];
  const bars = p.menuBars[0].menuBarItems;
  const menus = bars.name();
  for (let i = 1; i < menus.length; i++) {
    try {
      const items = bars[i].menus[0].menuItems;
      const titles = items.name();
      const keys = items.attributes.byName('AXMenuItemCmdChar').value();
      const mods = items.attributes.byName('AXMenuItemCmdModifiers').value();
      const enabled = items.enabled();
      for (let j = 0; j < titles.length; j++)
        if (titles[j] && keys[j]) out.push({ menu: menus[i], title: titles[j], key: keys[j], mods: mods[j] || 0, enabled: enabled[j] });
    } catch (e) {}
  }
  return JSON.stringify({ app: p.name(), items: out });
}`;
// clicks one menu item in an app, by its process name, menu and title, all three arriving as arguments
const PRESS_SCRIPT = `function run(argv) {
  const p = Application('System Events').applicationProcesses.byName(argv[0]);
  p.frontmost = true;
  p.menuBars[0].menuBarItems.byName(argv[1]).menus[0].menuItems.byName(argv[2]).click();
  return 'ok';
}`;
const KEYS_EVERY_MS = 30_000;

// puts a piece of text back on the clipboard; the text arrives as an argument, never as part of the script
const COPY_SCRIPT = `ObjC.import('AppKit');
function run(argv) {
  const pb = $.NSPasteboard.generalPasteboard;
  pb.clearContents;
  return pb.setStringForType(argv[0], $.NSPasteboardTypeString) ? 'ok' : '';
}`;
// the clipboard's full text, for the history; the state script only carries a short preview
const CLIP_SCRIPT = `ObjC.import('AppKit');
function run() {
  const pb = $.NSPasteboard.generalPasteboard;
  const types = ObjC.deepUnwrap(pb.types) || [];
  if (types.includes('org.nspasteboard.ConcealedType') || types.includes('org.nspasteboard.TransientType')) return '';
  const s = pb.stringForType($.NSPasteboardTypeString);
  return s.isNil() ? '' : JSON.stringify(ObjC.unwrap(s));
}`;
const CLIPS_KEPT = 25;
const CLIP_MAX = 10_000;

// every app the user can switch to, the one in front first, as command-tab would list them
const RUNNING_SCRIPT = `ObjC.import('AppKit');
function run() {
  const out = [];
  for (const a of ObjC.unwrap($.NSWorkspace.sharedWorkspace.runningApplications)) {
    if (a.activationPolicy !== $.NSApplicationActivationPolicyRegular || a.bundleURL.isNil()) continue;
    out.push({ name: ObjC.unwrap(a.localizedName), path: ObjC.unwrap(a.bundleURL.path), active: a.active, hidden: a.hidden });
  }
  out.sort((x, y) => (y.active ? 1 : 0) - (x.active ? 1 : 0));
  return JSON.stringify(out);
}`;
// quits the app in front, never finder, nor the desktop app this extension lives in
const QUIT_SCRIPT = `function run() {
  const front = Application('System Events').applicationProcesses.whose({ frontmost: true })[0];
  const name = front.name();
  if (name === 'Finder' || /bridgething/i.test(name)) return '';
  Application(name).quit();
  return name;
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

// the status tiles' readings, all from commands that need no permission to answer
let wifiDevice: string | null | undefined;
async function readExtras(awake: boolean): Promise<Extras> {
  if (wifiDevice === undefined) {
    const ports = (await run('/usr/sbin/networksetup', ['-listallhardwareports'])) ?? '';
    wifiDevice = /Hardware Port: Wi-Fi\nDevice: (\S+)/.exec(ports)?.[1] ?? null;
  }
  const [power, summary, ip, style, batt, bt] = await Promise.all([
    wifiDevice ? run('/usr/sbin/networksetup', ['-getairportpower', wifiDevice]) : null,
    wifiDevice ? run('/usr/sbin/ipconfig', ['getsummary', wifiDevice]) : null,
    wifiDevice ? run('/usr/sbin/ipconfig', ['getifaddr', wifiDevice]) : null,
    // the key is missing in light mode, which reads as a failed command
    run('/usr/bin/defaults', ['read', '-g', 'AppleInterfaceStyle']),
    run('/usr/bin/pmset', ['-g', 'batt']),
    jxa(BLUETOOTH_SCRIPT),
  ]);
  let bluetooth: Extras['bluetooth'] = null;
  try {
    bluetooth = bt ? JSON.parse(bt) : null;
  } catch {
    // a reading that will not parse shows as no bluetooth
  }
  return {
    awake,
    wifi: power === null ? null : /: On/.test(power),
    // macos writes <redacted> in place of the name for a process it has not given location access
    network: (() => {
      const name = /^\s*SSID : (.+)$/m.exec(summary ?? '')?.[1]?.trim();
      return name && name !== '<redacted>' ? name : null;
    })(),
    ip: ip?.trim() || null,
    dark: (style ?? '').trim() === 'Dark',
    battery: batt ? readBattery(batt) : null,
    bluetooth,
  };
}

// bluetooth's power and what is connected now, from the bluetooth framework, which answers without a permission
const BLUETOOTH_SCRIPT = `ObjC.import('IOBluetooth');
function run() {
  const paired = ObjC.unwrap($.IOBluetoothDevice.pairedDevices) || [];
  return JSON.stringify({
    on: $.IOBluetoothHostController.defaultController.powerState === 1,
    devices: paired.filter(d => d.isConnected).map(d => ObjC.unwrap(d.name)),
  });
}`;

const jxa = (script: string, args: string[] = [], timeoutMs = 8000) => run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, ...args], timeoutMs);

async function readState(): Promise<{ volume: number; muted: boolean; micMuted: boolean; input: number; media: Media | null; front: Front | null; clip: Clip }> {
  try {
    const s = JSON.parse((await jxa(STATE_SCRIPT)) ?? '{}');
    return { volume: Number(s.volume) || 0, muted: s.muted === true, micMuted: Number(s.input) === 0, input: Number(s.input) || 0, media: s.media ?? null, front: s.front ?? null, clip: s.clip ?? { kind: 'empty', text: null } };
  } catch {
    return { volume: 0, muted: false, micMuted: false, input: 0, media: null, front: null, clip: { kind: 'empty', text: null } };
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
// the extension stopping lets the mac sleep again, rather than leaving caffeinate behind
let stopAwake = () => {};

defineExtension({
  start(ctx: ExtensionContext) {
    logWarn = (...args) => ctx.log.warn(...args);
    let shortcuts: string[] = [];
    let apps = new Map<string, string>();
    // drawn once per app path, and only again for an app that is new; sent once to each page that asks
    const icons = new Map<string, string>();
    let sent = new Set<string>();
    let media: Media | null = null;
    // keep awake is a caffeinate child kept running until it is turned off
    let awake: { kill(signal?: string): void } | null = null;
    let hidden: string[] = [];
    // the last list the switcher was sent, so a switch can only name one of those
    let running: Running[] = [];
    // the running apps' icons already sent to this page, since the list is asked for every few seconds
    let runSent = new Set<string>();
    // the last shortcuts read, and for which app, so a press can only name one of them
    let keys: { app: string; items: Key[]; at: number } = { app: '', items: [], at: 0 };
    const listKeys = async () => {
      try {
        const read = JSON.parse((await jxa(MENU_SCRIPT, [], 20_000)) ?? '{}');
        if (typeof read.app === 'string') keys = { app: read.app, items: Array.isArray(read.items) ? read.items : [], at: Date.now() };
      } catch {
        // no accessibility access, or the app in front went away while it was read
      }
      send({ type: 'keys', app: keys.app, items: keys.items });
    };
    // copied text, newest first, in memory only, so it is gone when the extension stops
    let clips: Copied[] = [];
    let clipId = 0;
    const listClips = () => send({ type: 'clips', items: clips });
    const noteClip = async () => {
      const out = await jxa(CLIP_SCRIPT);
      if (!out?.trim()) return;
      let text: string;
      try {
        text = JSON.parse(out);
      } catch {
        return;
      }
      if (!text.trim() || clips[0]?.text === text) return;
      clips = [{ id: ++clipId, text: text.slice(0, CLIP_MAX), at: Date.now() }, ...clips.filter(c => c.text !== text)].slice(0, CLIPS_KEPT);
      if (watching()) listClips();
    };
    stopAwake = () => awake?.kill('SIGTERM');
    let extras: Extras | null = null;
    let extrasAt = 0;
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
      runSent = new Set();
      catalog().then(() => state());
    };
    // the status readings change slowly, so they are read again only every so often, or after a tile changes one
    const state = async (fresh = false) => {
      const [{ input: _input, ...now }, more] = await Promise.all([
        readState(),
        fresh || !extras || Date.now() - extrasAt > EXTRAS_EVERY_MS ? readExtras(!!awake) : extras,
      ]);
      if (more !== extras) [extras, extrasAt] = [more, Date.now()];
      media = now.media;
      send({ type: 'state', ...now, ...more, awake: !!awake });
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
      // macos has no supported switch for bluetooth's power, and turning it off would drop a bluetooth mouse or
      // keyboard, so the tile opens bluetooth's settings, where devices are connected and the power is
      if (id === 'bluetooth') return (await run('/usr/bin/open', ['x-apple.systempreferences:com.apple.BluetoothSettings'])) !== null;
      if (id === 'display-sleep') return (await run('/usr/bin/pmset', ['displaysleepnow'])) !== null;
      if (id === 'sleep') return (await run('/usr/bin/pmset', ['sleepnow'])) !== null;
      if (id === 'awake') {
        if (awake) {
          awake.kill('SIGTERM');
          awake = null;
        } else awake = new Deno.Command('/usr/bin/caffeinate', { args: ['-di'], stdout: 'null', stderr: 'null', stdin: 'null' }).spawn();
        return true;
      }
      if (id === 'dark') return (await osa('tell application "System Events" to tell appearance preferences to set dark mode to not dark mode')) !== null;
      if (id === 'desktop') {
        if (hidden.length) {
          await jxa(SHOW_SCRIPT, hidden);
          hidden = [];
          return true;
        }
        try {
          hidden = JSON.parse((await jxa(HIDE_SCRIPT)) ?? '[]');
          return true;
        } catch {
          return false;
        }
      }
      if (id === 'wifi') {
        const now = await readExtras(!!awake);
        if (!wifiDevice || now.wifi === null) return false;
        return (await run('/usr/sbin/networksetup', ['-setairportpower', wifiDevice, now.wifi ? 'off' : 'on'], 15_000)) !== null;
      }
      if (id === 'battery') return true;
      if (id === 'focus') return shortcuts.includes(FOCUS_SHORTCUT) && (await run('/usr/bin/shortcuts', ['run', FOCUS_SHORTCUT], 30_000)) !== null;
      if (id === 'screensaver') return (await run('/usr/bin/open', ['-a', 'ScreenSaverEngine'])) !== null;
      if (id === 'quit') return !!(await jxa(QUIT_SCRIPT))?.trim();
      // the keyboard's own brightness keys, pressed through system events
      if (id === 'bright-up' || id === 'bright-down') return (await osa(`tell application "System Events" to key code ${id === 'bright-up' ? 144 : 145}`)) !== null;
      if (id === 'trash') return (await osa('tell application "Finder" to empty trash')) !== null;
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
          state(true);
        });
      } else if (m.type === 'volume' && typeof m.delta === 'number' && Number.isFinite(m.delta)) {
        step(Math.max(-20, Math.min(20, m.delta))).then(() => state());
      } else if (m.type === 'set-volume' && typeof m.level === 'number' && Number.isFinite(m.level)) {
        const level = Math.max(0, Math.min(100, Math.round(m.level)));
        osa(`set volume output volume ${level}`).then(() => state());
      } else if (m.type === 'keys') {
        // the same app asked again soon after is answered from the last read, which is slow for a big menu
        if (keys.app && Date.now() - keys.at < KEYS_EVERY_MS) send({ type: 'keys', app: keys.app, items: keys.items });
        listKeys();
      } else if (m.type === 'press' && typeof m.app === 'string' && m.app === keys.app && keys.items.some(k => k.menu === m.menu && k.title === m.title)) {
        jxa(PRESS_SCRIPT, [m.app, m.menu, m.title]).then(out => {
          const id = `key:${m.menu}/${m.title}`;
          send({ type: 'result', id, ok: out?.trim() === 'ok' });
        });
      } else if (m.type === 'clips') listClips();
      else if (m.type === 'clear-clips') {
        clips = [];
        listClips();
      } else if (m.type === 'copy' && typeof m.id === 'number') {
        const found = clips.find(c => c.id === m.id);
        if (found) jxa(COPY_SCRIPT, [found.text]).then(() => noteClip()).then(() => state());
      } else if (m.type === 'running') {
        jxa(RUNNING_SCRIPT).then(async out => {
          try {
            running = JSON.parse(out ?? '[]');
          } catch {
            running = [];
          }
          send({ type: 'running', apps: running });
          // icons for running apps the catalogue does not hold, finder say, drawn once by path
          const missing = running.map(a => a.path).filter(path => !icons.has(path));
          for (const [path, png] of Object.entries(await jxaJson<string>(ICON_SCRIPT, missing))) icons.set(path, png);
          const due = running.filter(a => icons.has(a.path) && !runSent.has(a.path));
          if (due.length) send({ type: 'icons', icons: Object.fromEntries(due.map(a => [`run:${a.path}`, icons.get(a.path)!])) });
          due.forEach(a => runSent.add(a.path));
        });
      } else if (m.type === 'switch' && typeof m.path === 'string' && running.some(a => a.path === m.path)) {
        // open brings a running app to the front, unhiding it, as choosing it in command-tab does
        run('/usr/bin/open', [m.path]).then(() => setTimeout(() => state(), 300));
      } else if (m.type === 'media' && MEDIA_COMMANDS.includes(m.command) && media && MEDIA_APPS.includes(media.app)) {
        // only the player already reported as playing or paused is told what to do
        jxa(MEDIA_SCRIPT, [media.app, m.command]).then(() => setTimeout(state, 300));
      }
    });

    timers = [
      setInterval(() => watching() && catalog(), CATALOG_EVERY_MS),
      setInterval(() => watching() && state(), STATE_EVERY_MS),
      // the clipboard is watched all the time the extension runs, so the history has what was copied while the deck was away
      setInterval(noteClip, CLIP_EVERY_MS),
    ];
  },
  stop() {
    timers.forEach(clearInterval);
    stopAwake();
  },
});
