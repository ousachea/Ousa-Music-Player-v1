// the weather as a wide card: the condition and the temperature on the left, the time, date and city on the right,
// over a scene for the sky that moves. sun and moon breathe in their rings, clouds and fog drift, rain slants down,
// snow falls, and a storm flashes. every moving part animates by transform or opacity, never by repainting
import { memo, type ReactNode } from 'react';

import { AnimatedIcon, type IconKind } from '../components/icons';

import { usePlace } from '../composables/useLocation';
import { useWeatherContext, type Sky } from '../composables/useWeather';
import { partsIn, useNow, useZoneContext } from '../composables/useZone';
import { useSettings } from '../store/settings';

type Scene = { background: string; layers: ReactNode };

const Rings = ({ disc, ring }: { disc: string; ring: string }) => (
  <div className="absolute -top-[70px] -right-[40px] h-[300px] w-[300px]">
    {[300, 230, 160].map((size, i) => (
      <span
        key={size}
        className="weather-breathe absolute top-1/2 left-1/2 rounded-full"
        style={{ width: size, height: size, margin: -size / 2, backgroundColor: ring, animationDelay: `${i * -1.4}s` }}
      />
    ))}
    <span className="absolute top-1/2 left-1/2 h-[92px] w-[92px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: disc }} />
  </div>
);

/** a strip of soft hills twice the card's width, sliding by one width so the loop never shows its seam */
const Waves = ({ color, top, duration, reverse }: { color: string; top: string; duration: number; reverse?: boolean }) => (
  <svg viewBox="0 0 800 100" preserveAspectRatio="none" className="weather-slide absolute left-0 h-[70%] w-[200%]" style={{ top, animationDuration: `${duration}s`, animationDirection: reverse ? 'reverse' : 'normal' }}>
    <path d="M0 40 C100 10 200 70 300 40 S500 10 600 40 S750 70 800 40 V100 H0Z" fill={color} />
  </svg>
);

const STARS = [
  [12, 22], [28, 70], [44, 30], [58, 80], [70, 18], [8, 60], [36, 50], [64, 55],
] as const;

/** fixed positions and paces, so a re-render never restarts a flake mid-fall */
const FLAKES = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37) % 100,
  size: 4 + ((i * 7) % 7),
  duration: 5 + ((i * 13) % 6),
  delay: -((i * 11) % 9),
}));

function scene(sky: Sky, day: boolean): Scene {
  switch (sky) {
    case 'clear':
      return day
        ? { background: 'linear-gradient(100deg, #ee6b66, #f39a5b)', layers: <Rings disc="#f7d77c" ring="rgba(255,255,255,0.12)" /> }
        : {
            background: 'linear-gradient(100deg, #26357a, #1f2c66)',
            layers: (
              <>
                <Rings disc="#f3dc93" ring="rgba(255,255,255,0.06)" />
                {STARS.map(([x, y], i) => (
                  <span key={i} className="weather-twinkle absolute h-[3px] w-[3px] rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * -0.7}s` }} />
                ))}
              </>
            ),
          };
    case 'cloudy':
      return {
        background: day ? 'linear-gradient(100deg, #3f8be0, #6aa9ef)' : 'linear-gradient(100deg, #2f4c86, #3d5c99)',
        layers: (
          <>
            <Waves color="rgba(255,255,255,0.16)" top="-8%" duration={26} />
            <Waves color="rgba(255,255,255,0.12)" top="12%" duration={34} reverse />
          </>
        ),
      };
    case 'fog':
      return {
        background: 'linear-gradient(100deg, #687b95, #8d9fb7)',
        layers: (
          <>
            <Waves color="rgba(255,255,255,0.18)" top="20%" duration={30} />
            <Waves color="rgba(255,255,255,0.14)" top="38%" duration={40} reverse />
          </>
        ),
      };
    case 'rain':
    case 'storm':
      return {
        background: 'linear-gradient(100deg, #282e4d, #3a4068)',
        layers: (
          <>
            {/* the streaks are one tall layer of slanted lines, slid down a tile at a time */}
            <span
              className="weather-rain absolute -inset-x-1/4 -top-full h-[200%]"
              style={{ background: 'repeating-linear-gradient(105deg, transparent 0 14px, rgba(255,255,255,0.22) 14px 15px, transparent 15px 31px)' }}
            />
            {sky === 'storm' && <span className="weather-flash absolute inset-0 bg-white" />}
          </>
        ),
      };
    case 'snow':
      return {
        background: day ? 'linear-gradient(100deg, #f39a55, #f7b56f)' : 'linear-gradient(100deg, #1f2b5c, #253366)',
        layers: (
          <>
            {day && <Waves color="rgba(255,255,255,0.14)" top="30%" duration={32} />}
            {FLAKES.map((f, i) => (
              <span
                key={i}
                className="weather-snow absolute -top-3 rounded-full bg-white/90"
                style={{ left: `${f.left}%`, width: f.size, height: f.size, animationDuration: `${f.duration}s`, animationDelay: `${f.delay}s` }}
              />
            ))}
          </>
        ),
      };
  }
}

function SkyIcon({ sky, day }: { sky: Sky; day: boolean }) {
  const kind: IconKind = sky === 'clear' ? (day ? 'sun' : 'moon') : sky === 'cloudy' ? 'cloud' : sky;
  return <AnimatedIcon kind={kind} className="h-6 w-6" />;
}

export const WeatherWidget = memo(function WeatherWidget() {
  const place = usePlace();
  const zone = useZoneContext();
  const weather = useWeatherContext();
  const now = useNow(zone, 10_000);
  const { tempUnit } = useSettings();

  const t = now && zone ? partsIn(now, zone) : null;
  const time = t ? `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}` : '--:--';
  const date = now && t ? `${t.format({ weekday: 'short' }).format(now).toUpperCase()} ${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}` : '';
  const view = weather ? scene(weather.sky, weather.day) : scene('cloudy', true);
  const temp = weather ? Math.round(tempUnit === 'f' ? weather.celsius * 1.8 + 32 : weather.celsius) : null;
  const status = !place ? 'Finding where you are' : 'error' in place ? 'Location unavailable' : 'Loading the weather';

  return (
    <div className="relative isolate h-full w-full overflow-hidden rounded-[var(--tile-radius)] text-off-white shadow-[0_10px_30px_rgba(0,0,0,0.45)]" style={{ background: view.background }}>
      <div className="pointer-events-none absolute inset-0 -z-10">{view.layers}</div>
      <div className="flex h-full justify-between px-5 py-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 font-display text-[1.25rem] font-semibold">
            {weather && <SkyIcon sky={weather.sky} day={weather.day} />}
            {weather?.label ?? status}
          </div>
          <div className="mt-auto font-display text-[4rem] leading-none font-semibold tracking-display tabular-nums">{temp === null ? '—' : `${temp}°`}</div>
        </div>
        <div className="flex flex-col items-end text-right">
          <div className="font-display text-[2rem] leading-none font-semibold tabular-nums">{time}</div>
          <div className="mt-1 font-mono text-[0.75rem] tracking-[0.12em] tabular-nums opacity-80">{date}</div>
          <div className="mt-auto font-body text-[0.875rem] opacity-80">
            {weather?.city ?? ''}
            {place && 'approximate' in place && place.approximate ? <span className="opacity-60"> ≈</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
});
