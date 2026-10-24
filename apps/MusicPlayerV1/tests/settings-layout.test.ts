// a setting missing from the layout would vanish from both settings pages
import { expect, test } from 'bun:test';

import manifest from '../public/manifest.json';
import { GROUPS, STYLE_ROWS, shown, type Read } from '../src/settings-layout';

const placed = [...STYLE_ROWS, ...GROUPS.flatMap(g => g.rows)].map(r => r.key as string);

test('every config field is placed exactly once, besides the style picker', () => {
  const keys = (manifest.config as { data: { key: string } }[]).map(f => f.data.key).filter(k => k !== 'theme');
  expect([...placed].sort()).toEqual([...keys].sort());
});

test('dependent rows hide until their parent is on', () => {
  const row = (key: string) => [...STYLE_ROWS, ...GROUPS.flatMap(g => g.rows)].find(r => r.key === key)!;
  const read = (values: Record<string, string>): Read => key => values[key] ?? '';
  expect(shown(row('clockSize'), read({ theme: 'widget', clock: 'false' }))).toBe(false);
  expect(shown(row('clockSize'), read({ theme: 'widget', clock: 'true' }))).toBe(true);
  expect(shown(row('clockPos'), read({ theme: 'vinyl', clock: 'true', vinylStyle: 'picture' }))).toBe(false);
  expect(shown(row('clockPos'), read({ theme: 'cd', clock: 'true' }))).toBe(false);
  expect(shown(row('seekSeconds'), read({ theme: 'widget', wheel: 'volume' }))).toBe(false);
  expect(shown(row('blur'), read({ theme: 'widget', backdrop: '0' }))).toBe(false);
  expect(shown(row('tape'), read({ theme: 'widget' }))).toBe(false);
});
