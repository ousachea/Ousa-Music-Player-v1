// the deck only believes messages that check out, and drops actions of a kind it does not know
import { expect, test } from 'bun:test';

import { categoryOf, readToDeck } from '../src/protocol';

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
  expect(readToDeck({ type: 'state', volume: 140, muted: true, micMuted: 'yes' })).toEqual({ type: 'state', volume: 100, muted: true, micMuted: false, media: null });
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
