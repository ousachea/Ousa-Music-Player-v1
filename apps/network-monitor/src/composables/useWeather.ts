// the weather now, from open-meteo, which needs no key: temperature, the wmo condition code and whether it is day
import type { BridgethingClient } from '@bridgething/client';
import { createContext, useContext, useEffect, useState } from 'react';

import { fetchJson } from './fetchJson';
import type { Place } from './useLocation';

export type Sky = 'clear' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow';

export type Weather = { celsius: number; code: number; day: boolean; sky: Sky; label: string; city: string | null };

const REFRESH_MS = 15 * 60_000;

/** wmo weather interpretation codes, folded into the scenes the widget can draw */
export function describe(code: number): { sky: Sky; label: string } {
  if (code === 0) return { sky: 'clear', label: 'Clear' };
  if (code <= 2) return { sky: 'clear', label: code === 1 ? 'Mostly clear' : 'Partly cloudy' };
  if (code === 3) return { sky: 'cloudy', label: 'Cloudy' };
  if (code === 45 || code === 48) return { sky: 'fog', label: 'Fog' };
  if (code >= 51 && code <= 57) return { sky: 'rain', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { sky: 'rain', label: code >= 65 ? 'Heavy rain' : 'Rain' };
  if (code >= 71 && code <= 77) return { sky: 'snow', label: 'Snow' };
  if (code >= 80 && code <= 82) return { sky: 'rain', label: code === 82 ? 'Heavy rain' : 'Showers' };
  if (code === 85 || code === 86) return { sky: 'snow', label: 'Snow showers' };
  if (code >= 95) return { sky: 'storm', label: 'Thunderstorm' };
  return { sky: 'cloudy', label: 'Cloudy' };
}

export function useWeather(client: BridgethingClient | null, place: Place): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);
  const lat = place && 'lat' in place ? place.lat : null;
  const lon = place && 'lat' in place ? place.lon : null;
  const ipCity = place && 'lat' in place ? (place.city ?? null) : null;

  useEffect(() => {
    if (!client || lat === null || lon === null) return;
    let gone = false;
    let city = ipCity;
    const load = async () => {
      const r = await fetchJson<{ current?: { temperature_2m?: number; weather_code?: number; is_day?: number } }>(
        client,
        `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,is_day&timezone=auto`,
      );
      // the phone's fix comes without a name, so the city is looked up once from the coordinates
      if (!city) {
        const g = await fetchJson<{ city?: string; locality?: string }>(
          client,
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&localityLanguage=en`,
        );
        city = g?.city || g?.locality || null;
      }
      const c = r?.current;
      if (gone || !c || typeof c.temperature_2m !== 'number' || typeof c.weather_code !== 'number') return;
      // development only, and gone from a published build: a code and day flag in local storage stand in for the
      // sky, so every scene can be looked at without waiting for the weather to oblige
      let code = c.weather_code;
      let day = c.is_day !== 0;
      if (import.meta.env.DEV) {
        const forced = localStorage.getItem('weather.force');
        if (forced) [code, day] = [Number(forced.split(',')[0]), forced.split(',')[1] !== 'night'];
      }
      setWeather({ celsius: c.temperature_2m, code, day, city, ...describe(code) });
    };
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      gone = true;
      clearInterval(id);
    };
  }, [client, lat, lon, ipCity]);
  return weather;
}

/** fetched once in the app and shared, so the weather card and the sun's temperature agree and cost one request */
export const WeatherContext = createContext<Weather | null>(null);
export const useWeatherContext = () => useContext(WeatherContext);
