// the claude code log reader checked against lines shaped like the ones it writes
import { expect, test } from 'bun:test';

import { localDay, modelName, parseReply, tally } from '../extension/collectors/claude-parse';

const at = Date.parse('2026-10-04T05:00:00Z');
const line = (id: string, request: string, usage: Record<string, number>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: new Date(at).toISOString(),
    sessionId: 's1',
    requestId: request,
    message: { id, model: 'claude-opus-5-5', usage },
    ...extra,
  });

test('a reply line parses; other lines do not', () => {
  const r = parseReply(line('m1', 'r1', { input_tokens: 2, output_tokens: 118, cache_creation_input_tokens: 18880, cache_read_input_tokens: 23073 }))!;
  expect(r).toMatchObject({ key: 'm1:r1', day: localDay(at), model: 'claude-opus-5-5', input: 2, output: 118, cacheWrite: 18880, cacheRead: 23073 });
  expect(parseReply(JSON.stringify({ type: 'user', message: { content: 'usage please' } }))).toBeNull();
  expect(parseReply('{not json "usage" "assistant"')).toBeNull();
  expect(parseReply(line('m9', 'r9', { input_tokens: 1 }, { message: { model: '<synthetic>', usage: { input_tokens: 1 } } }))).toBeNull();
});

test('a reply written once per content block is counted once', () => {
  const t = tally();
  const usage = { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 };
  for (let i = 0; i < 3; i++) t.add(parseReply(line('m1', 'r1', usage))!);
  t.add(parseReply(line('m2', 'r2', usage, { sessionId: 's2' }))!);
  const s = t.summary(at);
  expect(s.today).toEqual({ input: 20, output: 40, cacheWrite: 60, cacheRead: 80, replies: 2, sessions: 2 });
  expect(s.week).toHaveLength(7);
  expect(s.week[6]).toBe(200);
  expect(s.models).toEqual([{ name: 'Opus 5.5', tokens: 200 }]);
});

test('model ids read as names', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5');
  expect(modelName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5');
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
  expect(modelName('claude-fable-5-1')).toBe('Fable 5.1');
});

test('replies fall into five-hour windows, and the open one knows when it resets', async () => {
  const { windows, currentSession } = await import('../extension/collectors/claude-parse');
  const h = 3_600_000;
  const base = Date.parse('2026-10-04T01:20:00Z');
  const replies = [
    { at: base, tokens: 100 },
    { at: base + 2 * h, tokens: 300 },
    // past the first window's five hours: a new one, opening on its hour
    { at: base + 5.5 * h, tokens: 50 },
    { at: base + 6 * h, tokens: 70 },
  ];
  const w = windows(replies);
  expect(w.map(x => [new Date(x.start).toISOString().slice(11, 16), x.tokens])).toEqual([
    ['01:00', 400],
    ['06:00', 120],
  ]);
  const now = base + 6.5 * h; // 07:50, fifty minutes into a window that opened at 06:00
  const s = currentSession(replies, now)!;
  expect(new Date(s.resetAt).toISOString().slice(11, 16)).toBe('11:00');
  expect(s.tokens).toBe(120);
  expect(s.peak).toBe(400);
  expect(s.burnPerMin).toBe(Math.round(120 / 110));
  expect(currentSession(replies, base + 12 * h)).toBeNull();
});
