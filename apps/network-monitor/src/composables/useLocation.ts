// where the phone is, roughly: a coarse fix is all the sun and the weather need, asked for once and again each hour.
// when the phone will not say, the public address gives the city, which is near enough for both and is marked as such
import type { BridgethingClient } from '@bridgething/client';
import { createContext, useContext, useEffect, useState } from 'react';

import { fetchJson } from './fetchJson';

export type Place = { lat: number; lon: number; city?: string; approximate?: boolean } | { error: string } | null;

const REFRESH_MS = 3_600_000;
const IP_LOOKUP = 'https://get.geojs.io/v1/ip/geo.json';

async function byAddress(client: BridgethingClient): Promise<Place> {
  const r = await fetchJson<{ latitude?: string; longitude?: string; city?: string }>(client, IP_LOOKUP);
  const lat = Number(r?.latitude);
  const lon = Number(r?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, city: r?.city, approximate: true } : null;
}

export function useLocation(client: BridgethingClient | null): Place {
  const [place, setPlace] = useState<Place>(null);
  useEffect(() => {
    if (!client) return;
    let gone = false;
    const ask = async () => {
      const r = await client.geo.getOnce({ accuracy: 'coarse', maxAgeS: 3600 }, { timeoutMs: 20_000 }).catch(() => null);
      if (gone) return;
      if (r?.ok) return setPlace({ lat: r.response.position.lat, lon: r.response.position.lon });
      const fallback = await byAddress(client);
      if (gone) return;
      setPlace(prev => fallback ?? (prev && 'lat' in prev ? prev : { error: r && r.kind === 'domain' ? r.error.error : 'no answer' }));
    };
    void ask();
    const id = setInterval(ask, REFRESH_MS);
    return () => {
      gone = true;
      clearInterval(id);
    };
  }, [client]);
  return place;
}

export const LocationContext = createContext<Place>(null);
export const usePlace = () => useContext(LocationContext);
