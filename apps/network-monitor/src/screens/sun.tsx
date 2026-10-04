// sunset and sunrise as the sun's own path: its height through the next day drawn as a curve over a horizon, the
// daylight above it filled warm, the next sunset and sunrise marked where the curve crosses, and the sun where it is
// now. the curve is drawn stretched to the card; the marks over it are placed by hand so they stay round
import { memo, type ReactNode } from 'react';

import { AnimatedIcon } from '../components/icons';
import { usePlace } from '../composables/useLocation';
import { sunAltitude, sunTimes } from '../composables/sun';
import { partsIn, useNow, useZoneContext } from '../composables/useZone';
import { openDetail } from '../store/navigation';
import { SCENE } from '../theme';

const HOUR = 3_600_000;
/** the window runs from a little before now to most of a day ahead, so the next sunset and sunrise both fit */
const BEFORE = 4 * HOUR;
const SPAN = 24 * HOUR;
const STEPS = 96;
/** where the horizon sits down the graph, and how much of it the sun's highest point may use */
const HORIZON = 0.56;
const REACH = 0.5;

const W = 1000;
const H = 100;

export const SunWidget = memo(function SunWidget() {
  const place = usePlace();
  const zone = useZoneContext();
  const now = useNow(zone, 60_000);

  const shell = (body: ReactNode) => (
    <div
      onClick={() => openDetail('sun')}
      className="relative isolate flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[var(--tile-radius)] shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
      style={{ background: `linear-gradient(160deg, ${SCENE.graphite.from}, ${SCENE.graphite.to})` }}>
      <div className="pt-3 text-center font-display text-[0.9375rem] font-medium tracking-[0.18em] text-soft uppercase">Sunset &amp; Sunrise</div>
      {body}
    </div>
  );
  if (!place || 'error' in place || !now || !zone) {
    return shell(<div className="grid flex-1 place-items-center font-body text-[0.875rem] text-dim">{place && 'error' in place ? 'Location unavailable' : 'Finding where you are'}</div>);
  }

  const at = now.getTime();
  const start = at - BEFORE;
  const samples = Array.from({ length: STEPS + 1 }, (_, i) => sunAltitude(start + (i / STEPS) * SPAN, place.lat, place.lon));
  const peak = Math.max(10, ...samples.map(Math.abs));
  const x = (ms: number) => ((ms - start) / SPAN) * W;
  const y = (alt: number) => (HORIZON - (alt / peak) * REACH) * H;
  const curve = samples.map((alt, i) => `${i ? 'L' : 'M'}${((i / STEPS) * W).toFixed(1)} ${y(alt).toFixed(2)}`).join('');
  const area = `${curve}L${W} ${HORIZON * H}L0 ${HORIZON * H}Z`;
  const nowX = x(at);

  // the first sunset and the first sunrise inside the window, today's or tomorrow's
  const events = [0, 1].flatMap(day => {
    const t = sunTimes(at + day * 24 * HOUR, place.lat, place.lon);
    return [
      t.set !== null ? { kind: 'set' as const, at: t.set } : null,
      t.rise !== null ? { kind: 'rise' as const, at: t.rise } : null,
    ].filter((e): e is { kind: 'set' | 'rise'; at: number } => !!e && e.at > start && e.at < start + SPAN);
  });
  const sunset = events.filter(e => e.kind === 'set').sort((a, b) => a.at - b.at)[0];
  const sunrise = events.filter(e => e.kind === 'rise' && e.at > at).sort((a, b) => a.at - b.at)[0];
  const fmt = (ms: number) => partsIn(new Date(ms), zone).format({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  const up = sunAltitude(at, place.lat, place.lon) > 0;
  const pct = (px: number) => `${(px / W) * 100}%`;
  const marks = [sunset && { ...sunset, label: 'Sunset' }, sunrise && { ...sunrise, label: 'Sunrise' }].filter(Boolean) as { kind: 'set' | 'rise'; at: number; label: string }[];

  return shell(
    <>
      {/* the two times, each over the dotted line down to where the curve meets the horizon */}
      <div className="relative h-[42px] shrink-0">
        {marks.map(m => (
          <div key={m.label} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `clamp(48px, ${pct(x(m.at))}, calc(100% - 48px))` }}>
            <div className="font-body text-[0.75rem] text-soft">{m.label}</div>
            <div className="font-display text-[1.25rem] leading-tight font-medium tabular-nums text-off-white">{fmt(m.at)}</div>
          </div>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id="sun-day" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f7a21b" />
              <stop offset="100%" stopColor="#ffc457" />
            </linearGradient>
            {/* daylight is whatever of the curve stands above the horizon */}
            <clipPath id="sun-above">
              <rect x="0" y="-50" width={W} height={HORIZON * H + 50} />
            </clipPath>
            <clipPath id="sun-past">
              <rect x="0" y="-50" width={nowX} height={H + 100} />
            </clipPath>
            <clipPath id="sun-ahead">
              <rect x={nowX} y="-50" width={W - nowX} height={H + 100} />
            </clipPath>
          </defs>
          <g clipPath="url(#sun-above)">
            <path d={area} fill="url(#sun-day)" clipPath="url(#sun-past)" />
            <path d={area} fill="url(#sun-day)" opacity="0.18" clipPath="url(#sun-ahead)" />
          </g>
          <line x1="0" x2={W} y1={HORIZON * H} y2={HORIZON * H} stroke="rgba(255,255,255,0.28)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={curve} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          {marks.map(m => (
            <line key={m.label} x1={x(m.at)} x2={x(m.at)} y1={-42} y2={HORIZON * H} stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <span className="absolute right-3 font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-dim" style={{ top: `calc(${HORIZON * 100}% - 14px)` }}>
          HORIZON
        </span>
        {sunrise && (
          <span
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white/80 bg-[#14171e]"
            style={{ left: pct(x(sunrise.at)), top: `${HORIZON * 100}%` }}
          />
        )}
        {/* the sun where it is now, glowing; after dark it is the moon's pale dot under the horizon */}
        <span className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pct(nowX), top: `${(y(sunAltitude(at, place.lat, place.lon)) / H) * 100}%` }}>
          {up ? (
            <span className="relative grid place-items-center">
              <span className="sun-glow absolute h-9 w-9 rounded-full bg-[radial-gradient(circle,rgba(255,196,87,0.7),transparent_65%)]" />
              <span className="relative text-[#ffc457]">
                <AnimatedIcon kind="sun" className="h-6 w-6" />
              </span>
            </span>
          ) : (
            <span className="relative text-[#cfd6ff]">
              <AnimatedIcon kind="moon" className="h-5 w-5" />
            </span>
          )}
        </span>
      </div>
    </>,
  );
});
