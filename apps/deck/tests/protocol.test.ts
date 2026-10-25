// the deck only believes messages that check out, and drops actions of a kind it does not know
import { expect, test } from 'bun:test';

import { categoryOf, combo, readBattery, readToDeck } from '../src/protocol';

test('catalog keeps only well formed actions, with their group and last use', () => {
  const m = readToDeck({
    type: 'catalog',
    actions: [{ id: 'mic', label: 'Mute mic', kind: 'control' }, { id: 'x', label: 'X', kind: 'shell' }, null, { id: 1 }, { id: 'app:Notes', label: 'Notes', kind: 'app', group: 'Productivity', used: 5, extra: true }],
  });
  expect(m).toEqual({
    type: 'catalog',
    actions: [{ id: 'mic', label: 'Mute mic', kind: 'control' }, { id: 'app:Notes', label: 'Notes', kind: 'app', group: 'Productivity', used: 5 }],
  });
});

test('state is clamped, media must name a known player, and results need an id', () => {
  expect(readToDeck({ type: 'state', volume: 140, muted: true, micMuted: 'yes' })).toEqual({
    type: 'state',
    volume: 100,
    muted: true,
    micMuted: false,
    media: null,
    front: null,
    clip: { kind: 'empty', text: null },
    awake: false,
    wifi: null,
    network: null,
    ip: null,
    dark: null,
    battery: null,
    bluetooth: null,
  });
  expect(readToDeck({ type: 'state', volume: 1, bluetooth: { on: true, devices: ['MX Master 3', 4] } })).toMatchObject({ bluetooth: { on: true, devices: ['MX Master 3'] } });
  expect(readToDeck({ type: 'state', volume: 5, media: { app: 'Spotify', title: 'Song', artist: 'Band', playing: true } })).toMatchObject({ media: { app: 'Spotify', title: 'Song', playing: true } });
  expect(readToDeck({ type: 'state', volume: 5, media: { app: 'VLC', title: 'Song' } })).toMatchObject({ media: null });
  expect(readToDeck({ type: 'result', ok: true })).toBeNull();
  expect(readToDeck('nope')).toBeNull();
});

test('categories read the way a person groups apps', () => {
  expect(categoryOf('public.app-category.developer-tools', '/Applications/Code.app')).toBe('Developer Tools');
  expect(categoryOf('public.app-category.board-games', '/Applications/Chess.app')).toBe('Games');
  expect(categoryOf('public.app-category.productivity', '/System/Applications/Utilities/Terminal.app')).toBe('Utilities');
  expect(categoryOf(null, '/Applications/Chrome.app')).toBe('Other');
  expect(categoryOf('public.app-category.music', '/Applications/Spotify.app')).toBe('Music');
});

test('a hidden clipboard never carries its text, and odd kinds read as empty', () => {
  expect(readToDeck({ type: 'state', volume: 1, clip: { kind: 'hidden', text: 'hunter2' } })).toMatchObject({ clip: { kind: 'hidden', text: null } });
  expect(readToDeck({ type: 'state', volume: 1, clip: { kind: 'text', text: 'hello' } })).toMatchObject({ clip: { kind: 'text', text: 'hello' } });
  expect(readToDeck({ type: 'state', volume: 1, clip: { kind: 'secret', text: 'x' } })).toMatchObject({ clip: { kind: 'empty', text: null } });
});

test('battery reads from pmset, and a mac without one gives none', () => {
  expect(readBattery("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t80%; AC attached; not charging present: true")).toEqual({ percent: 80, charging: false, plugged: true, remaining: null });
  expect(readBattery("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t54%; discharging; 3:12 remaining present: true")).toEqual({ percent: 54, charging: false, plugged: false, remaining: '3:12' });
  expect(readBattery("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t31%; charging; 1:05 remaining present: true")).toMatchObject({ charging: true, remaining: '1:05' });
  expect(readBattery("Now drawing from 'AC Power'")).toBeNull();
});

test('wifi details, the switcher list and the clipboard history are checked too', () => {
  expect(readToDeck({ type: 'state', volume: 1, wifi: true, network: 'Home', ip: '192.168.3.12' })).toMatchObject({ network: 'Home', ip: '192.168.3.12' });
  expect(readToDeck({ type: 'state', volume: 1, ip: '<script>' })).toMatchObject({ ip: null });
  expect(readToDeck({ type: 'running', apps: [{ name: 'Code', path: '/Applications/Visual Studio Code.app', active: true }, { name: 1 }] })).toEqual({
    type: 'running',
    apps: [{ name: 'Code', path: '/Applications/Visual Studio Code.app', active: true, hidden: false }],
  });
  expect(readToDeck({ type: 'clips', items: [{ id: 2, text: 'b', at: 5 }, { id: 'x', text: 'a', at: 1 }] })).toEqual({ type: 'clips', items: [{ id: 2, text: 'b', at: 5 }] });
});

test('shortcuts read the way the mac writes them on its menus', () => {
  expect(combo({ key: 'S', mods: 0 })).toBe('⌘S');
  expect(combo({ key: 'p', mods: 1 })).toBe('⇧⌘P');
  expect(combo({ key: 'H', mods: 2 })).toBe('⌥⌘H');
  expect(combo({ key: 'N', mods: 6 })).toBe('⌃⌥⌘N');
  expect(combo({ key: '\u001b', mods: 8 })).toBe('⎋');
  expect(readToDeck({ type: 'keys', app: 'Code', items: [{ menu: 'File', title: 'Save', key: 'S', mods: 0 }, { menu: 'File' }] })).toEqual({
    type: 'keys',
    app: 'Code',
    items: [{ menu: 'File', title: 'Save', key: 'S', mods: 0, enabled: true }],
  });
});
