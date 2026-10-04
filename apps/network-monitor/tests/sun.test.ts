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

test('civil dawn comes before sunrise, and the moon was full on 17 september 2024', async () => {
  const { moonPhase } = await import('../src/composables/sun');
  const at = Date.parse('2024-06-21T12:00:00Z');
  const rise = sunTimes(at, 51.5074, -0.1278).rise!;
  const dawn = sunTimes(at, 51.5074, -0.1278, -6).rise!;
  expect(dawn).toBeLessThan(rise);
  expect((rise - dawn) / 60_000).toBeGreaterThan(30);
  const full = moonPhase(Date.parse('2024-09-18T02:34:00Z'));
  expect(full.name).toBe('Full moon');
  expect(full.lit).toBeGreaterThan(0.98);
});

test('the sun stands about 62 degrees over london at midsummer noon, and is down at midnight', async () => {
  const { sunAltitude } = await import('../src/composables/sun');
  expect(sunAltitude(Date.parse('2024-06-21T12:02:00Z'), 51.5074, -0.1278)).toBeCloseTo(62, 0);
  expect(sunAltitude(Date.parse('2024-06-21T00:00:00Z'), 51.5074, -0.1278)).toBeLessThan(0);
});
