// the live spot quote and the only history this app is willing to claim: its own observations.
// no provider here offers free intraday history, so the ranges are built from what the app has
// actually seen rather than from numbers it cannot verify.
import type { BridgethingClient } from '@bridgething/client';

export const DEFAULT_ENDPOINT = 'https://api.gold-api.com/price/XAU';

export type Quote = { usdPerOzt: number; at: number; source: string };

export type Observation = { at: number; price: number };

export const WINDOWS = [
  { key: '1h', label: '1H', ms: 3600e3 },
  { key: '1d', label: '1D', ms: 24 * 3600e3 },
  { key: '1w', label: '1W', ms: 7 * 24 * 3600e3 },
  { key: '1m', label: '1M', ms: 30 * 24 * 3600e3 },
] as const;

export type WindowKey = (typeof WINDOWS)[number]['key'];

const OBSERVATIONS_KEY = 'observations';
const MAX_OBSERVATIONS = 2000;
const FINE_MS = 6 * 3600e3;
const COARSE_MS = 5 * 60e3;

function decodeBody(body: unknown) {
  const bytes = new Uint8Array(body as unknown as number[]);
  return new TextDecoder().decode(bytes);
}

function parseQuote(text: string, endpoint: string): Quote {
  const data = JSON.parse(text) as { price?: unknown; updatedAt?: unknown; symbol?: unknown };
  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('the provider sent no usable price');
  const at = typeof data.updatedAt === 'string' ? Date.parse(data.updatedAt) : Date.now();
  const host = (() => {
    try {
      return new URL(endpoint).host;
    } catch {
      return endpoint;
    }
  })();
  return {
    usdPerOzt: price,
    at: Number.isFinite(at) ? at : Date.now(),
    source: `${host} · ${typeof data.symbol === 'string' ? data.symbol : 'XAU'}/USD spot`,
  };
}

async function viaDaemon(client: BridgethingClient, endpoint: string, headers: { name: string; value: string }[]) {
  const reply = await client.net.fetch(
    { request: { url: endpoint, method: 'GET', headers, timeoutMs: 8000, redirect: 'follow' } },
    { timeoutMs: 11000 },
  );
  if (!reply.ok) throw new Error('the daemon did not answer');
  const { status, body } = reply.response.response;
  if (status !== 200) throw new Error(`the provider answered ${status}`);
  return parseQuote(decodeBody(body), endpoint);
}

async function direct(endpoint: string, headers: { name: string; value: string }[]) {
  const response = await fetch(endpoint, { headers: Object.fromEntries(headers.map(h => [h.name, h.value])) });
  if (!response.ok) throw new Error(`the provider answered ${response.status}`);
  return parseQuote(await response.text(), endpoint);
}

/** both routes at once, first answer wins: the phone is the only link some of the time, and the
    webview's own request is the faster one whenever the provider allows its origin */
export async function fetchQuote(client: BridgethingClient, endpoint: string, apiKey: string): Promise<Quote> {
  const headers = [{ name: 'accept', value: 'application/json' }];
  if (apiKey) headers.push({ name: 'x-api-key', value: apiKey });
  try {
    return await Promise.any([viaDaemon(client, endpoint, headers), direct(endpoint, headers)]);
  } catch (err) {
    const first = err instanceof AggregateError ? err.errors[0] : err;
    throw new Error(first instanceof Error ? first.message : 'the provider could not be reached');
  }
}

/** recent minutes are kept as seen; older ones thin out to one every five, so a month still fits */
export function prune(observations: Observation[], now: number): Observation[] {
  const kept: Observation[] = [];
  let lastCoarse = -Infinity;
  for (const o of observations) {
    if (now - o.at <= FINE_MS) {
      kept.push(o);
      continue;
    }
    const bucket = Math.floor(o.at / COARSE_MS);
    if (bucket === lastCoarse) continue;
    lastCoarse = bucket;
    kept.push(o);
  }
  return kept.slice(-MAX_OBSERVATIONS);
}

export async function loadObservations(client: BridgethingClient): Promise<Observation[]> {
  try {
    const r = await client.store.get({ key: OBSERVATIONS_KEY });
    if (!r.ok || !r.response.value) return [];
    const parsed = JSON.parse(r.response.value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((o): o is Observation => typeof o?.at === 'number' && typeof o?.price === 'number')
      .sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

export function saveObservations(client: BridgethingClient, observations: Observation[]) {
  client.store.put({ key: OBSERVATIONS_KEY, value: JSON.stringify(observations) }).catch(() => {});
}

export function clearObservations(client: BridgethingClient) {
  client.store.delete({ key: OBSERVATIONS_KEY }).catch(() => {});
}

export type Range = { low: number; high: number; lowAt: number; highAt: number; first: number; count: number };

export function rangeOver(observations: Observation[], now: number, ms: number): Range | null {
  const within = observations.filter(o => now - o.at <= ms);
  if (within.length === 0) return null;
  let low = within[0]!;
  let high = within[0]!;
  for (const o of within) {
    if (o.price < low.price) low = o;
    if (o.price > high.price) high = o;
  }
  return {
    low: low.price,
    high: high.price,
    lowAt: low.at,
    highAt: high.at,
    first: within[0]!.price,
    count: within.length,
  };
}

export function ago(ms: number) {
  if (ms < 45e3) return 'just now';
  const minutes = Math.round(ms / 60e3);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
