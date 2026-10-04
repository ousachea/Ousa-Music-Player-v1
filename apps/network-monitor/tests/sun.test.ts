// the sunrise equation checked against published times
import { expect, test } from 'bun:test';

import { sunTimes } from '../src/composables/sun';

const minutesOff = (ms: number | null, iso: string) => Math.abs((ms ?? NaN) - Date.parse(iso)) / 60_000;

test('london at midsummer', () => {
  const day = sunTimes(Date.parse('2024-06-21T12:00:00Z'), 51.5074, -0.1278);
  // timeanddate: sunrise 04:43 BST, sunset 21:21 BST
  expect(minutesOff(day.rise, '2024-06-21T03:43:00Z')).toBeLessThan(3);
  expect(minutesOff(day.set, '2024-06-21T20:21:00Z')).toBeLessThan(3);
});

test('phnom penh in october', () => {
  const day = sunTimes(Date.parse('2026-10-04T05:00:00Z'), 11.5564, 104.9282);
  // about 05:47 and 17:47 local time, utc+7
  expect(minutesOff(day.rise, '2026-10-03T22:47:00Z')).toBeLessThan(5);
  expect(minutesOff(day.set, '2026-10-04T10:47:00Z')).toBeLessThan(5);
});

test('the arctic in june never sets, and in december never rises', () => {
  expect(sunTimes(Date.parse('2024-06-21T12:00:00Z'), 78.22, 15.65).polar).toBe('day');
  expect(sunTimes(Date.parse('2024-12-21T12:00:00Z'), 78.22, 15.65).polar).toBe('night');
});
