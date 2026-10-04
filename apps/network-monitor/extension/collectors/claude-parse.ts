// claude code keeps every session as json lines on this machine, and each reply it receives records the tokens it
// used. a reply can be written several times, once for each block of its content, carrying the same usage, so it
// is counted once by its message and request ids. pure, so it can be checked against sample lines
import type { ClaudeSession, ClaudeUsage } from '../../src/protocol/types';

const HOUR = 3_600_000;
/** claude's usage limits reset five hours after the window opened */
const WINDOW = 5 * HOUR;

export type Reply = {
  key: string;
  /** unix ms */
  at: number;
  day: string;
  model: string;
  session: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

/** the machine's own calendar day, which is the day a person means by today */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

export function parseReply(line: string): Reply | null {
  // most lines are prompts, tool output and the like; skip them before paying for a parse
  if (!line.includes('"usage"') || !line.includes('"assistant"')) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  const message = o.message as Record<string, unknown> | undefined;
  const usage = message?.usage as Record<string, unknown> | undefined;
  if (o.type !== 'assistant' || !message || !usage || typeof o.timestamp !== 'string') return null;
  const at = Date.parse(o.timestamp);
  if (!Number.isFinite(at)) return null;
  const model = typeof message.model === 'string' ? message.model : 'unknown';
  // a synthetic entry claude code writes for itself is not a reply from the api
  if (model === '<synthetic>') return null;
  const id = typeof message.id === 'string' ? message.id : '';
  const request = typeof o.requestId === 'string' ? o.requestId : '';
  return {
    key: `${id}:${request}` === ':' ? `${o.uuid ?? at}` : `${id}:${request}`,
    at,
    day: localDay(at),
    model,
    session: typeof o.sessionId === 'string' ? o.sessionId : '',
    input: n(usage.input_tokens),
    output: n(usage.output_tokens),
    cacheWrite: n(usage.cache_creation_input_tokens),
    cacheRead: n(usage.cache_read_input_tokens),
  };
}

type Day = { input: number; output: number; cacheWrite: number; cacheRead: number; replies: number; sessions: Set<string>; models: Map<string, number> };

/** "claude-opus-5-5" -> "Opus 5.5", "claude-sonnet-4-5-20250929" -> "Sonnet 4.5" */
export function modelName(id: string): string {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(id);
  if (!m) return id;
  const family = m[1][0].toUpperCase() + m[1].slice(1);
  return m[3] ? `${family} ${m[2]}.${m[3]}` : `${family} ${m[2]}`;
}

/** replies in, a running tally per day out; each reply counted once however often it was written */
/** the five-hour windows replies fall into: a window opens on the hour of the first reply after the last one closed
 * (or after five quiet hours), as claude itself counts them */
export function windows(replies: { at: number; tokens: number }[]) {
  const sorted = [...replies].sort((a, b) => a.at - b.at);
  const out: { start: number; last: number; tokens: number; replies: number }[] = [];
  for (const r of sorted) {
    const cur = out[out.length - 1];
    if (!cur || r.at >= cur.start + WINDOW || r.at - cur.last > WINDOW) out.push({ start: Math.floor(r.at / HOUR) * HOUR, last: r.at, tokens: r.tokens, replies: 1 });
    else {
      cur.tokens += r.tokens;
      cur.replies += 1;
      cur.last = r.at;
    }
  }
  return out;
}

/** the window open at `now`, with its pace and what it is on course for, against the busiest closed one */
export function currentSession(replies: { at: number; tokens: number }[], now: number): ClaudeSession | null {
  const all = windows(replies);
  const last = all[all.length - 1];
  if (!last || now >= last.start + WINDOW) return null;
  const minutes = Math.max(1, (now - last.start) / 60_000);
  const burnPerMin = last.tokens / minutes;
  const left = Math.max(0, (last.start + WINDOW - now) / 60_000);
  return {
    start: last.start,
    resetAt: last.start + WINDOW,
    tokens: last.tokens,
    replies: last.replies,
    burnPerMin: Math.round(burnPerMin),
    projected: Math.round(last.tokens + burnPerMin * left),
    peak: Math.max(0, ...all.slice(0, -1).map(w => w.tokens)),
  };
}

export function tally() {
  const days = new Map<string, Day>();
  const seen = new Map<string, Set<string>>();
  // every reply this week with its moment, for the five-hour windows
  let recent: { at: number; tokens: number }[] = [];
  return {
    add(r: Reply) {
      let keys = seen.get(r.day);
      if (!keys) seen.set(r.day, (keys = new Set()));
      if (keys.has(r.key)) return;
      keys.add(r.key);
      let d = days.get(r.day);
      if (!d) days.set(r.day, (d = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, replies: 0, sessions: new Set(), models: new Map() }));
      d.input += r.input;
      d.output += r.output;
      d.cacheWrite += r.cacheWrite;
      d.cacheRead += r.cacheRead;
      d.replies += 1;
      if (r.session) d.sessions.add(r.session);
      recent.push({ at: r.at, tokens: r.input + r.output + r.cacheWrite + r.cacheRead });
      const name = modelName(r.model);
      d.models.set(name, (d.models.get(name) ?? 0) + r.input + r.output + r.cacheWrite + r.cacheRead);
    },
    /** forgets every day before the week that ends today */
    prune(today: number) {
      const keep = new Set(Array.from({ length: 8 }, (_, i) => localDay(today - i * 86_400_000)));
      for (const day of days.keys()) if (!keep.has(day)) days.delete(day);
      for (const day of seen.keys()) if (!keep.has(day)) seen.delete(day);
      recent = recent.filter(r => today - r.at < 8 * 86_400_000);
    },
    summary(today: number): ClaudeUsage {
      const d = days.get(localDay(today));
      const total = (x: Day | undefined) => (x ? x.input + x.output + x.cacheWrite + x.cacheRead : 0);
      return {
        today: {
          input: d?.input ?? 0,
          output: d?.output ?? 0,
          cacheWrite: d?.cacheWrite ?? 0,
          cacheRead: d?.cacheRead ?? 0,
          replies: d?.replies ?? 0,
          sessions: d?.sessions.size ?? 0,
        },
        week: Array.from({ length: 7 }, (_, i) => total(days.get(localDay(today - (6 - i) * 86_400_000)))),
        models: [...(d?.models ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([name, tokens]) => ({ name, tokens })),
        session: currentSession(recent, today),
      };
    },
  };
}
