// sunrise and sunset from a place and a day, worked out here rather than fetched: the standard sunrise equation,
// with the sun's centre 0.833° below the horizon to allow for refraction and its own radius. a day the sun never
// rises or never sets comes back with null times and says which
const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;
const TILT = RAD * 23.4397;

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY_MS;
const meanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (m: number) =>
  m + RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m)) + RAD * 102.9372 + Math.PI;
const transit = (ds: number, m: number, l: number) => J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);

export type SunDay = { rise: number | null; set: number | null; noon: number; polar: 'day' | 'night' | null };

/** `at` is any moment on the day wanted; times come back as unix ms. `angle` is how far below the horizon the sun's
 * centre is at the moment wanted: -0.833 for sunrise and sunset, -6 for the civil dawn and dusk around them */
export function sunTimes(at: number, lat: number, lon: number, angle = -0.833): SunDay {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(at);
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const m = meanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = Math.asin(Math.sin(TILT) * Math.sin(l));
  const noon = transit(ds, m, l);
  const cos = (Math.sin(angle * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cos < -1) return { rise: null, set: null, noon: fromJulian(noon), polar: 'day' };
  if (cos > 1) return { rise: null, set: null, noon: fromJulian(noon), polar: 'night' };
  const w = Math.acos(cos);
  const set = transit(J0 + (w + lw) / (2 * Math.PI) + n, m, l);
  const rise = noon - (set - noon);
  return { rise: fromJulian(rise), set: fromJulian(set), noon: fromJulian(noon), polar: null };
}

const SYNODIC_DAYS = 29.530588853;
/** a new moon to count from: 6 january 2000, 18:14 utc */
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

const PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];

/** how far through its month the moon is (0 new, 0.5 full), how much of it is lit, and the phase's name */
export function moonPhase(at: number) {
  const age = ((((at - KNOWN_NEW_MOON) / DAY_MS) % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
  const phase = age / SYNODIC_DAYS;
  const lit = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  return { phase, lit, name: PHASES[Math.round(phase * 8) % 8] };
}

/** how high the sun stands at a moment, in degrees above the horizon (negative below it) */
export function sunAltitude(at: number, lat: number, lon: number): number {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(at);
  const m = meanAnomaly(d);
  const l = eclipticLongitude(m);
  const dec = Math.asin(Math.sin(TILT) * Math.sin(l));
  const ra = Math.atan2(Math.sin(l) * Math.cos(TILT), Math.cos(l));
  const hour = RAD * (280.16 + 360.9856235 * d) - lw - ra;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hour)) / RAD;
}
