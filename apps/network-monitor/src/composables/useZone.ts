// the kiosk's own clock is never set, so time comes from the daemon, which carries the phone's: its offset from
// this machine's clock, its zone and its locale
import type { BridgethingClient } from '@bridgething/client';
import { createContext, useContext, useEffect, useState } from 'react';

export type Zone = { tz: string | null; locale: string | null; offsetMs: number };

export function useZone(client: BridgethingClient): Zone | null {
  const [zone, setZone] = useState<Zone | null>(null);
  useEffect(() => {
    const apply = (info: { tzIana: string | null; locale: string | null; wallClockUnixS: number | null }) => {
      if (info.wallClockUnixS === null) return;
      setZone({ tz: info.tzIana, locale: info.locale, offsetMs: info.wallClockUnixS * 1000 - Date.now() });
    };
    const offChanged = client.time.onChanged(msg => apply(msg.time));
    const offSnapshot = client.time.onSnapshot(msg => apply(msg.time));
    client.time
      .get()
      .then(r => r.ok && apply(r.response.time))
      .catch(() => {});
    return () => {
      offChanged();
      offSnapshot();
    };
  }, [client]);
  return zone;
}

/** ticks at the given pace and hands back the phone's present moment, or null until the daemon has said */
export function useNow(zone: Zone | null, everyMs = 1000): Date | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return zone ? new Date(now + zone.offsetMs) : null;
}

/** the wall-clock fields in the phone's zone, which may not be this machine's */
export function partsIn(at: Date, zone: Zone) {
  const read = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(zone.locale ?? undefined, { ...options, timeZone: zone.tz ?? undefined });
    } catch {
      return new Intl.DateTimeFormat(undefined, options);
    }
  };
  const p = read({ year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(at)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    format: read,
  };
}

export const ZoneContext = createContext<Zone | null>(null);
export const useZoneContext = () => useContext(ZoneContext);
