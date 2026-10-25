// the deck only believes messages that check out, and drops actions of a kind it does not know
import { expect, test } from 'bun:test';

import { readToDeck } from '../src/protocol';

test('catalog keeps only well formed actions', () => {
  const m = readToDeck({ type: 'catalog', actions: [{ id: 'mic', label: 'Mute mic', kind: 'control' }, { id: 'x', label: 'X', kind: 'shell' }, null, { id: 1 }] });
  expect(m).toEqual({ type: 'catalog', actions: [{ id: 'mic', label: 'Mute mic', kind: 'control' }] });
});

test('state is clamped and results need an id', () => {
  expect(readToDeck({ type: 'state', volume: 140, muted: true, micMuted: 'yes' })).toEqual({ type: 'state', volume: 100, muted: true, micMuted: false });
  expect(readToDeck({ type: 'result', ok: true })).toBeNull();
  expect(readToDeck('nope')).toBeNull();
});
