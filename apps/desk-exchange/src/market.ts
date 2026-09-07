// a fictional exchange. prices are a pure function of the clock rather than a running simulation:
// the same instant always gives the same price, so any span can be charted on demand and a reload
// or a view change never loses the market's history.

export type Listing = {
  sym: string;
  name: string;
  sector: string;
  base: number;
  vol: number;
  shares: number;
};

export const LISTINGS: Listing[] = [
  { sym: 'NIMB', name: 'Nimbus Systems', sector: 'Cloud', base: 284.5, vol: 0.052, shares: 4.1e6 },
  { sym: 'VOLT', name: 'Voltaic Motors', sector: 'Autos', base: 61.2, vol: 0.088, shares: 9.6e6 },
  { sym: 'HELX', name: 'Helix Biolabs', sector: 'Biotech', base: 132.75, vol: 0.095, shares: 2.4e6 },
  { sym: 'QRTZ', name: 'Quartz Foundry', sector: 'Semis', base: 517.3, vol: 0.061, shares: 1.7e6 },
  { sym: 'ORBT', name: 'Orbital Freight', sector: 'Logistics', base: 88.4, vol: 0.044, shares: 5.2e6 },
  { sym: 'TIDE', name: 'Tidewater Energy', sector: 'Energy', base: 47.9, vol: 0.058, shares: 12.3e6 },
  { sym: 'ANVL', name: 'Anvil Robotics', sector: 'Industrial', base: 196.05, vol: 0.049, shares: 3.3e6 },
  { sym: 'COBB', name: 'Cobblestone Bank', sector: 'Finance', base: 39.6, vol: 0.031, shares: 18.4e6 },
  { sym: 'MRSH', name: 'Marsh & Vine', sector: 'Retail', base: 74.15, vol: 0.037, shares: 6.8e6 },
  { sym: 'PXEL', name: 'Pixel Forge', sector: 'Games', base: 22.8, vol: 0.102, shares: 15.1e6 },
  { sym: 'ARGO', name: 'Argonaut Mining', sector: 'Materials', base: 158.9, vol: 0.066, shares: 2.9e6 },
  { sym: 'LUME', name: 'Lumen Optics', sector: 'Optics', base: 305.4, vol: 0.073, shares: 1.4e6 },
];

export const BY_SYM: Record<string, Listing> = Object.fromEntries(LISTINGS.map(l => [l.sym, l]));

/** the desk exchange never closes, so a session is a rolling window rather than a calendar day */
export const SESSION_MS = 6.5 * 3600e3;

export const SPANS = [
  { key: '1h', label: '1H', ms: 3600e3 },
  { key: '4h', label: '4H', ms: 4 * 3600e3 },
  { key: '1d', label: '1D', ms: 24 * 3600e3 },
  { key: '1w', label: '1W', ms: 7 * 24 * 3600e3 },
] as const;

export type SpanKey = (typeof SPANS)[number]['key'];

export const VOLATILITY: Record<string, number> = { calm: 0.55, normal: 1, wild: 1.8 };

const EPOCH = Date.UTC(2024, 0, 1);

/** virtual time: the pace setting stretches the clock the price function is sampled on */
export function virtualTime(now: number, pace: number) {
  return EPOCH + (now - EPOCH) * pace;
}

function mix(a: number, b: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 2654435761) ^ Math.imul(b + 0x85ebca6b, 2246822519);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function seedOf(sym: string) {
  let h = 2166136261;
  for (let i = 0; i < sym.length; i++) {
    h ^= sym.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SEEDS: Record<string, number> = Object.fromEntries(LISTINGS.map(l => [l.sym, seedOf(l.sym)]));

/** value noise: random per cell, smoothstepped between, so octaves join without corners */
function noise(seed: number, t: number, period: number) {
  const x = t / period;
  const cell = Math.floor(x);
  const f = x - cell;
  const s = f * f * (3 - 2 * f);
  const a = mix(seed, cell);
  const b = mix(seed, cell + 1);
  return (a + (b - a) * s) * 2 - 1;
}

// a slow trend under progressively faster chop, which is what gives a chart both a shape and a texture
const OCTAVES = [
  { period: 3 * 86400e3, amp: 1.4, salt: 11 },
  { period: 4 * 3600e3, amp: 1, salt: 23 },
  { period: 55 * 60e3, amp: 0.55, salt: 37 },
  { period: 13 * 60e3, amp: 0.3, salt: 53 },
  { period: 3 * 60e3, amp: 0.17, salt: 71 },
  { period: 41e3, amp: 0.09, salt: 97 },
];

const EVENT_BUCKET = 420e3;
const EVENT_CHANCE = 0.055;
const EVENT_RAMP = 25e3;
const EVENT_DECAY = 1500e3;
const EVENT_LOOKBACK = 16;

export type Headline = { id: string; sym: string; at: number; text: string; up: boolean; impact: number };

const UP_LINES = [
  '{name} beats on quarterly revenue',
  'Analysts upgrade {name} to overweight',
  '{name} lands a multi-year supply deal',
  '{name} raises full-year guidance',
  'Short interest in {sym} falls sharply',
  '{name} unveils a new product line',
  'Institutional buyers step into {sym}',
  '{name} settles its patent dispute',
];

const DOWN_LINES = [
  '{name} misses on margins',
  'A regulator opens a review of {name}',
  '{name} cuts its outlook for the quarter',
  'A key {name} supplier halts shipments',
  'Insiders trim their positions in {sym}',
  '{name} delays its flagship launch',
  'A downgrade weighs on {sym}',
  '{name} warns on input costs',
];

/** an event is a property of its time bucket, so the same shock is always there when you look back */
function eventAt(sym: string, bucket: number): Headline | null {
  const seed = SEEDS[sym] ?? 0;
  if (mix(seed ^ 0xa5a5, bucket) >= EVENT_CHANCE) return null;
  const listing = BY_SYM[sym];
  if (!listing) return null;
  const up = mix(seed ^ 0x5c5c, bucket) < 0.5;
  const scale = listing.vol / 0.05;
  const impact = (0.006 + mix(seed ^ 0x3333, bucket) * 0.03) * scale * (up ? 1 : -1);
  const lines = up ? UP_LINES : DOWN_LINES;
  const text = lines[Math.floor(mix(seed ^ 0x7777, bucket) * lines.length) % lines.length]!
    .replace('{name}', listing.name)
    .replace('{sym}', sym);
  return { id: `${sym}-${bucket}`, sym, at: bucket * EVENT_BUCKET, text, up, impact };
}

/** headlines move the price they belong to: the shock ramps in over seconds, then bleeds off */
function shockAt(sym: string, t: number) {
  const bucket = Math.floor(t / EVENT_BUCKET);
  let total = 0;
  for (let i = 0; i <= EVENT_LOOKBACK; i++) {
    const event = eventAt(sym, bucket - i);
    if (!event) continue;
    const elapsed = t - event.at;
    if (elapsed < 0) continue;
    total += event.impact * Math.min(1, elapsed / EVENT_RAMP) * Math.exp(-elapsed / EVENT_DECAY);
  }
  return total;
}

export function priceAt(sym: string, t: number, volatility = 1) {
  const listing = BY_SYM[sym];
  if (!listing) return 0;
  const seed = SEEDS[sym] ?? 0;
  let sum = 0;
  for (const o of OCTAVES) sum += noise(seed ^ o.salt, t, o.period) * o.amp;
  const drift = listing.vol * volatility * sum + shockAt(sym, t) * volatility;
  return listing.base * Math.exp(drift);
}

/** thin names print less often than liquid ones, so the board does not flash every cell in unison */
export function printPeriod(sym: string) {
  const shares = BY_SYM[sym]?.shares ?? 0;
  if (shares >= 10e6) return 1000;
  if (shares >= 5e6) return 2000;
  if (shares >= 2.5e6) return 3000;
  return 4000;
}

/** the price on the board is the last print, not the continuous curve the chart is drawn from */
export function lastPrint(sym: string, t: number, volatility = 1) {
  const period = printPeriod(sym);
  return priceAt(sym, Math.floor(t / period) * period, volatility);
}

export function seriesAt(sym: string, endT: number, spanMs: number, points: number, volatility = 1) {
  const out = new Array<number>(points);
  const step = spanMs / (points - 1);
  for (let i = 0; i < points; i++) out[i] = priceAt(sym, endT - spanMs + i * step, volatility);
  return out;
}

/** the index is an equal-weight basket rebased to 1000, so it reads like a real one from day one */
export function indexAt(t: number, volatility = 1) {
  let sum = 0;
  for (const l of LISTINGS) sum += lastPrint(l.sym, t, volatility) / l.base;
  return (sum / LISTINGS.length) * 1000;
}

export function volumeAt(sym: string, t: number) {
  const listing = BY_SYM[sym];
  if (!listing) return 0;
  const seed = SEEDS[sym] ?? 0;
  // volume builds through the session rather than jumping, so the octaves are all slow ones
  const shape = 0.5 + 0.5 * noise(seed ^ 0x1234, t, 2 * 3600e3) + 0.35 * noise(seed ^ 0x4321, t, 25 * 60e3);
  const shocked = Math.abs(shockAt(sym, t)) * 12;
  return Math.max(0.05, shape + shocked) * listing.shares;
}

/** the most recent headlines across the whole board, newest first */
export function recentHeadlines(t: number, limit = 12): Headline[] {
  const bucket = Math.floor(t / EVENT_BUCKET);
  const out: Headline[] = [];
  for (let i = 0; i <= EVENT_LOOKBACK; i++) {
    for (const l of LISTINGS) {
      const event = eventAt(l.sym, bucket - i);
      if (event && event.at <= t) out.push(event);
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

export function headlineFor(sym: string, t: number): Headline | null {
  const bucket = Math.floor(t / EVENT_BUCKET);
  for (let i = 0; i <= EVENT_LOOKBACK; i++) {
    const event = eventAt(sym, bucket - i);
    if (event && event.at <= t) return event;
  }
  return null;
}

export function fmtPrice(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(n: number) {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
}

export function fmtDelta(n: number) {
  return `${n >= 0 ? '+' : '−'}${fmtPrice(Math.abs(n))}`;
}

export function fmtVolume(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
