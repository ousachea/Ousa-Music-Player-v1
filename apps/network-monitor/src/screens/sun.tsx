// the sun's day as a wide card: the part of the day it is, a line about it, the temperature, and a glowing arc the
// sun rides from rise to set and the moon from set to rise. dawn and dusk are the hour either side of the horizon
import { memo } from 'react';

import { usePlace } from '../composables/useLocation';
import { sunTimes } from '../composables/sun';
import { useWeatherContext } from '../composables/useWeather';
import { partsIn, useNow, useZoneContext } from '../composables/useZone';
import { useSettings } from '../store/settings';

const HOUR = 3_600_000;

type Phase = 'night' | 'dawn' | 'day' | 'dusk';

const LOOK: Record<Phase, { title: string; sky: string; arc: [string, string, string]; orb: string; glow: string }> = {
  night: {
    title: 'Night',
    sky: 'radial-gradient(120% 140% at 70% 0%, #3a3a3e 0%, #121214 45%, #050506 100%)',
    arc: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0.15)'],
    orb: '#ffffff',
    glow: 'rgba(255,255,255,0.65)',
  },
  dawn: {
    title: 'Dawn',
    sky: 'linear-gradient(180deg, #8e5aa8 0%, #d9708a 45%, #ff9a6a 80%, #ffc27a 100%)',
    arc: ['rgba(255,214,150,0.2)', 'rgba(255,240,215,0.95)', 'rgba(170,200,255,0.6)'],
    orb: '#ffd08a',
    glow: 'rgba(255,170,90,0.85)',
  },
  day: {
    title: 'Day',
    sky: 'linear-gradient(200deg, #b17ee8 0%, #8f8cf0 40%, #5aa0f4 75%, #4cb2f6 100%)',
    arc: ['rgba(255,255,255,0.35)', 'rgba(255,224,190,0.95)', 'rgba(255,255,255,0.45)'],
    orb: '#ffc58a',
    glow: 'rgba(255,160,80,0.9)',
  },
  dusk: {
    title: 'Dusk',
    sky: 'linear-gradient(180deg, #4a3a8f 0%, #b45a8f 50%, #ff8a5c 85%, #ffb06a 100%)',
    arc: ['rgba(170,200,255,0.5)', 'rgba(255,230,205,0.95)', 'rgba(255,200,140,0.2)'],
    orb: '#ffb07a',
    glow: 'rgba(255,130,80,0.85)',
  },
};

// the arc is the top of an ellipse whose ends fall below the card, as in the reference
const CX = 150;
const CY = 118;
const RX = 168;
const RY = 100;

export const SunWidget = memo(function SunWidget() {
  const place = usePlace();
  const zone = useZoneContext();
  const weather = useWeatherContext();
  const now = useNow(zone, 30_000);
  const { tempUnit } = useSettings();

  let phase: Phase = 'day';
  let line = 'Finding where you are';
  let t = 0.5;
  let moon = false;
  if (place && 'error' in place) line = 'Location unavailable';
  if (place && 'lat' in place && now && zone) {
    const at = now.getTime();
    const day = sunTimes(at, place.lat, place.lon);
    const fmt = (ms: number) => partsIn(new Date(ms), zone).format({ hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
    if (day.polar) {
      phase = day.polar === 'day' ? 'day' : 'night';
      moon = day.polar === 'night';
      line = day.polar === 'day' ? 'Midnight sun' : 'Polar night';
    } else {
      const rise = day.rise!;
      const set = day.set!;
      const nextRise = at > set ? sunTimes(at + 24 * HOUR, place.lat, place.lon).rise ?? rise + 24 * HOUR : rise;
      const lastSet = at < rise ? sunTimes(at - 24 * HOUR, place.lat, place.lon).set ?? set - 24 * HOUR : set;
      if (at >= rise - HOUR / 2 && at < rise + HOUR) {
        phase = 'dawn';
        line = `Golden sun · sunrise ${fmt(rise)}`;
      } else if (at > set - HOUR && at <= set + HOUR / 2) {
        phase = 'dusk';
        line = `Golden hour · sunset ${fmt(set)}`;
      } else if (at > rise && at < set) {
        phase = 'day';
        line = Math.abs(at - day.noon) < HOUR ? 'The very peak' : `Sunset ${fmt(set)}`;
      } else {
        phase = 'night';
        line = `Sunrise ${fmt(nextRise)}`;
      }
      if (at >= rise && at <= set) {
        t = (at - rise) / (set - rise);
      } else {
        // after dark the moon takes the arc, from last sunset to the next sunrise
        moon = true;
        t = (at - lastSet) / (nextRise - lastSet);
      }
    }
  }
  const look = LOOK[phase];
  // the ends of the arc are below the card, so the orb is kept to the part that shows
  const angle = Math.PI - (0.12 + Math.min(1, Math.max(0, t)) * 0.76) * Math.PI;
  const ox = CX + RX * Math.cos(angle);
  const oy = CY - RY * Math.sin(angle);
  const temp = weather ? `${Math.round(tempUnit === 'f' ? weather.celsius * 1.8 + 32 : weather.celsius)} ${tempUnit === 'f' ? 'F°' : 'C°'}` : '';
  const arc = `M${CX - RX} ${CY} A${RX} ${RY} 0 0 1 ${CX + RX} ${CY}`;

  return (
    <div className="relative isolate h-full w-full overflow-hidden rounded-[26px] border-[4px] border-white/85 shadow-[0_10px_30px_rgba(0,0,0,0.45)]" style={{ background: look.sky }}>
      <svg viewBox="0 0 300 100" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 -z-10 h-full w-full">
        <defs>
          <linearGradient id={`arc-${phase}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={look.arc[0]} />
            <stop offset="55%" stopColor={look.arc[1]} />
            <stop offset="100%" stopColor={look.arc[2]} />
          </linearGradient>
          <radialGradient id={`orb-${phase}`}>
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor={look.orb} />
            <stop offset="100%" stopColor={look.orb} stopOpacity="0" />
          </radialGradient>
          <filter id="arc-blur" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        {/* the arc twice: once blurred wide for its glow, once crisp, and a light running along it */}
        <path d={arc} fill="none" stroke={`url(#arc-${phase})`} strokeWidth="11" opacity="0.55" filter="url(#arc-blur)" />
        <path d={arc} fill="none" stroke={`url(#arc-${phase})`} strokeWidth="6" strokeLinecap="round" />
        <path d={arc} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round" pathLength={100} strokeDasharray="6 94" className="sun-arc-run" />
        <g transform={`translate(${ox} ${oy})`}>
          <circle r="22" fill={look.glow} opacity="0.55" filter="url(#arc-blur)" className="sun-glow" />
          <circle r="11" fill={`url(#orb-${phase})`} />
          <circle r={moon ? 7.5 : 6.5} fill={moon ? '#f4f4f6' : '#fff6e6'} />
        </g>
      </svg>
      <div className="flex items-start justify-between px-5 pt-3.5">
        <div>
          <div className="font-display text-[1.75rem] leading-tight font-semibold text-white">{look.title}</div>
          <div className="font-body text-[0.8125rem] text-white/70">{line}</div>
        </div>
        <div className="font-display text-[1.25rem] font-medium tabular-nums text-white">{temp}</div>
      </div>
    </div>
  );
});
