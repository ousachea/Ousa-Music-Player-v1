// a phone link that blinks should not throw the player back to its empty screen, and one that is really gone should
import { expect, test } from 'bun:test';

import type { PlayerState } from '@bridgething/client';

import { holdDrops } from '../src/link';

const song = (title: string) => ({ track: { title }, playback: { state: 'playing' } }) as unknown as PlayerState;
const empty = { track: null, playback: { state: 'stopped' } } as unknown as PlayerState;

function rig() {
  let state: PlayerState | null = null;
  let held = false;
  const due: (() => void)[] = [];
  const drops = holdDrops(
    next => (state = typeof next === 'function' ? next(state) : next),
    h => (held = h),
    20000,
    { set: fn => due.push(fn), clear: () => due.splice(0) },
  );
  return { drops, run: () => due.splice(0).forEach(fn => fn()), get state() { return state; }, get held() { return held; } };
}

test('a drop keeps the song on screen, paused', () => {
  const r = rig();
  r.drops.take(song('a'));
  r.drops.take(empty);
  expect(r.held).toBe(true);
  expect(r.state?.track).toEqual({ title: 'a' } as never);
  expect(r.state?.playback.state).toBe('paused');
});

test('the song coming back ends the hold with the new state', () => {
  const r = rig();
  r.drops.take(song('a'));
  r.drops.take(empty);
  r.drops.take(song('b'));
  expect(r.held).toBe(false);
  expect(r.state?.track).toEqual({ title: 'b' } as never);
  r.run();
  expect(r.state?.track).toEqual({ title: 'b' } as never);
});

test('a hold that runs out lands the empty state', () => {
  const r = rig();
  r.drops.take(song('a'));
  r.drops.take(empty);
  r.run();
  expect(r.held).toBe(false);
  expect(r.state?.track).toBeNull();
});

test('release lets go early, and nothing is held before a song has shown', () => {
  const r = rig();
  r.drops.take(empty);
  expect(r.held).toBe(false);
  expect(r.state?.track).toBeNull();
  r.drops.take(song('a'));
  r.drops.take(empty);
  r.drops.release();
  expect(r.held).toBe(false);
  expect(r.state?.track).toBeNull();
});
