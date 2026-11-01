import { expect, test } from 'bun:test';

import { apply, PREF_KEYS, type Prefs } from '../src/config';
import { rowOf, uriOf } from '../src/library';
import { parseSlot } from '../src/presets';

test('a stored preset only comes back whole', () => {
  expect(parseSlot('{"uri":"spotify:playlist:x","name":"Mix"}')).toEqual({ uri: 'spotify:playlist:x', name: 'Mix' });
  expect(parseSlot('{"uri":"","name":"Mix"}')).toBeNull();
  expect(parseSlot('not json')).toBeNull();
  expect(parseSlot(null)).toBeNull();
});

test('the new settings reject what they do not offer', () => {
  const base = Object.fromEntries(PREF_KEYS.map(k => [k, undefined])) as unknown as Prefs;
  expect(apply(base, 'idleOff', '15').idleOff).toBe(15);
  expect(apply(base, 'idleOff', '7').idleOff).toBe(0);
  expect(apply(base, 'presets', 'favourites').presets).toBe('favourites');
  expect(apply(base, 'presets', 'junk').presets).toBe('transport');
});

test('a bare id becomes a playable uri, a uri stays as it is', () => {
  expect(uriOf('track', 'abc')).toBe('spotify:track:abc');
  expect(uriOf('track', 'spotify:track:abc')).toBe('spotify:track:abc');
  const album = { id: 'a1', name: 'Discovery', artworkId: null };
  const row = rowOf({ type: 'track', data: { id: 't1', name: 'One More Time', album, artist: { id: 'r', name: 'Daft Punk', artworkId: null }, artists: [], durationMs: 1, imageId: 'img', saved: false } });
  expect(row).toMatchObject({ uri: 'spotify:track:t1', title: 'One More Time', subtitle: 'Daft Punk', artworkId: 'img' });
});
