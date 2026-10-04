// the plan's own limits, as claude code's /usage shows them: the account's five-hour session and weekly use and when
// each resets. they come from anthropic's usage endpoint for the account claude code is signed in to, using its
// stored login. the token goes to api.anthropic.com and nowhere else: never to the car thing, never into a log
import { homedir } from 'node:os';

import type { ClaudeLimit, ClaudeLimits } from '../../src/protocol/types';
import { run } from '../run';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const KEYCHAIN = '/usr/bin/security';
const KEYCHAIN_ITEM = 'Claude Code-credentials';

type Credentials = { accessToken: string; expiresAt?: number; subscriptionType?: string };

/** the login claude code keeps: a file on linux and windows, the keychain on a mac */
export function parseCredentials(text: string | null): Credentials | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text)?.claudeAiOauth;
    return typeof o?.accessToken === 'string' && o.accessToken
      ? { accessToken: o.accessToken, expiresAt: typeof o.expiresAt === 'number' ? o.expiresAt : undefined, subscriptionType: typeof o.subscriptionType === 'string' ? o.subscriptionType : undefined }
      : null;
  } catch {
    return null;
  }
}

async function credentials(): Promise<Credentials | null> {
  const home = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE') ?? homedir();
  const sep = Deno.build.os === 'windows' ? '\\' : '/';
  const fromFile = await Deno.readTextFile(`${home}${sep}.claude${sep}.credentials.json`).catch(() => null);
  if (fromFile) return parseCredentials(fromFile);
  if (Deno.build.os !== 'darwin') return null;
  return parseCredentials(await run(KEYCHAIN, ['find-generic-password', '-s', KEYCHAIN_ITEM, '-w'], 10_000));
}

const time = (v: unknown) => {
  const ms = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? ms : undefined;
};

function limit(o: unknown): ClaudeLimit | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const x = o as Record<string, unknown>;
  const used = typeof x.utilization === 'number' ? x.utilization : typeof x.percent === 'number' ? x.percent : undefined;
  const resetsAt = time(x.resets_at);
  if (used === undefined || resetsAt === undefined) return undefined;
  return { used: Math.min(100, Math.max(0, used)), resetsAt, ...(typeof x.severity === 'string' ? { severity: x.severity } : {}) };
}

/** the endpoint's reply reduced to what the dashboard shows; its many other fields are ignored */
export function parseUsage(body: unknown, plan: string | undefined, now: number): ClaudeLimits | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const list = Array.isArray(b.limits) ? (b.limits as Record<string, unknown>[]) : [];
  const severity = (kind: string) => list.find(l => l.kind === kind)?.severity;
  const session = limit(b.five_hour);
  const week = limit(b.seven_day);
  if (session && typeof severity('session') === 'string') session.severity = severity('session') as string;
  if (week && typeof severity('weekly_all') === 'string') week.severity = severity('weekly_all') as string;
  const out: ClaudeLimits = {
    checkedAt: now,
    ...(plan ? { plan: plan[0].toUpperCase() + plan.slice(1) } : {}),
    ...(session ? { session } : {}),
    ...(week ? { week } : {}),
  };
  const opus = limit(b.seven_day_opus);
  const sonnet = limit(b.seven_day_sonnet);
  if (opus) out.weekOpus = opus;
  if (sonnet) out.weekSonnet = sonnet;
  return session || week ? out : null;
}

/** asks once; null when there is no login on this machine, a reason when there is one but it did not work */
export async function readLimits(): Promise<ClaudeLimits | null> {
  const creds = await credentials();
  if (!creds) return null;
  const now = Date.now();
  if (creds.expiresAt && creds.expiresAt < now) return { checkedAt: now, error: 'Open Claude Code to sign in again' };
  try {
    const reply = await fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${creds.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' },
      signal: AbortSignal.timeout(15_000),
    });
    if (reply.status === 401 || reply.status === 403) return { checkedAt: now, error: 'Open Claude Code to sign in again' };
    if (!reply.ok) return { checkedAt: now, error: `Usage unavailable (${reply.status})` };
    return parseUsage(await reply.json(), creds.subscriptionType, now) ?? { checkedAt: now, error: 'Usage unavailable' };
  } catch {
    return { checkedAt: now, error: 'Usage unavailable offline' };
  }
}
