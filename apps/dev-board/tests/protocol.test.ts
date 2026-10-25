// the board opens links on the mac, so what it believes from the forward surface and how it builds links matter
import { expect, test } from 'bun:test';

import { htmlUrl, readToBoard } from '../src/protocol';

test('notification api urls become the page a person opens', () => {
  expect(htmlUrl('https://api.github.com/repos/a/b/pulls/12', 'a/b')).toBe('https://github.com/a/b/pull/12');
  expect(htmlUrl('https://api.github.com/repos/a/b/issues/3', 'a/b')).toBe('https://github.com/a/b/issues/3');
  expect(htmlUrl('https://api.github.com/repos/a/b/commits/abc', 'a/b')).toBe('https://github.com/a/b/commit/abc');
  expect(htmlUrl(null, 'a/b')).toBe('https://github.com/a/b');
  expect(htmlUrl('https://evil.example/repos/a/b/pulls/1', 'a/b')).toBe('https://github.com/a/b');
});

test('only a well formed message is believed', () => {
  expect(readToBoard(null)).toBeNull();
  expect(readToBoard({ type: 'error', reason: 'other' })).toBeNull();
  expect(readToBoard({ type: 'board', board: { login: 'x', repos: [], mine: [] } })).toBeNull();
  expect(readToBoard({ type: 'board', board: { login: 'x', repos: [], mine: [], reviews: [], inbox: [], at: 1 } })?.type).toBe('board');
  expect(readToBoard({ type: 'error', reason: 'auth' })).toEqual({ type: 'error', reason: 'auth' });
});
