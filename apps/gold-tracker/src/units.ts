// khmer and chinese gold weights, all defined against the gram so the conversions stay exact.
// 1 damlung = 10 chi = 100 hun = 1000 li, and a troy ounce is the international standard the
// spot market is quoted in.
export const TROY_OUNCE_G = 31.1034768;

export type Unit = 'li' | 'hun' | 'chi' | 'damlung' | 'gram' | 'ozt';

export const GRAMS: Record<Unit, number> = {
  li: 0.0375,
  hun: 0.375,
  chi: 3.75,
  damlung: 37.5,
  gram: 1,
  ozt: TROY_OUNCE_G,
};

export const UNIT_LABEL: Record<Unit, string> = {
  li: 'Li',
  hun: 'Hun',
  chi: 'Chi',
  damlung: 'Damlung',
  gram: 'Gram',
  ozt: 'Troy Oz',
};

export const UNITS: Unit[] = ['li', 'hun', 'chi', 'damlung', 'gram', 'ozt'];

/** the order the converter reads in: smallest khmer weight up to the ounce the market quotes */
export const CONVERTER_ORDER: Unit[] = ['li', 'hun', 'chi', 'damlung', 'gram', 'ozt'];

export type PurityKey = '24k' | '22k' | '18k' | 'custom';

export const PURITY: Record<Exclude<PurityKey, 'custom'>, number> = {
  '24k': 1,
  '22k': 0.9167,
  '18k': 0.75,
};

export const PURITY_LABEL: Record<PurityKey, string> = {
  '24k': '24K',
  '22k': '22K',
  '18k': '18K',
  custom: 'Custom',
};

export function purityFactor(key: PurityKey, custom: number) {
  return key === 'custom' ? Math.min(1, Math.max(0, custom / 100)) : PURITY[key];
}

export function gramsOf(amount: number, unit: Unit) {
  return amount * GRAMS[unit];
}

export function perGram(usdPerOzt: number, factor = 1) {
  return (usdPerOzt / TROY_OUNCE_G) * factor;
}

export function usd(n: number, decimals = 2) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** a value that rounds away to nothing gets no sign: "−0.00%" claims a direction it does not have */
export function signedUsd(n: number, decimals = 2) {
  const zero = Math.abs(n) < 0.5 / 10 ** decimals;
  return `${zero ? '' : n > 0 ? '+' : '−'}${usd(Math.abs(n), decimals)}`;
}

export function signedPct(n: number) {
  const zero = Math.abs(n) < 0.005;
  return `${zero ? '' : n > 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
}

/** a weight the way someone would say it out loud: 1 chi, not 1.0000 chi */
export function amountText(n: number) {
  return Number(n.toFixed(4)).toString();
}

/** grams beside a unit name, exact but without a tail of zeros */
export function gramText(n: number) {
  return `${Number(n.toFixed(4))}g`;
}

/** enough places to keep a li readable without printing noise on a damlung */
export function weight(n: number) {
  if (n === 0) return '0';
  if (Math.abs(n) >= 100) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return n.toFixed(6);
}
