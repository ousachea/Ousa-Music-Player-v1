// the daemon carries the phone's wall clock, zone and locale, which beats trusting the kiosk's own clock
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useMemo, useState } from 'react';

type Zone = { tz: string | null; locale: string | null; offsetMs: number };

export function useClock(client: BridgethingClient, enabled: boolean): string | null {
  const [zone, setZone] = useState<Zone>({ tz: null, locale: null, offsetMs: 0 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const apply = (info: { tzIana: string | null; locale: string | null; wallClockUnixS: number | null }) => {
      setZone({
        tz: info.tzIana,
        locale: info.locale,
        offsetMs: info.wallClockUnixS === null ? 0 : info.wallClockUnixS * 1000 - Date.now(),
      });
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
  }, [client, enabled]);

  // only minutes are shown, so wake on the minute boundary rather than every second
  useEffect(() => {
    if (!enabled) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const untilNextMinute = 60_000 - ((Date.now() + zone.offsetMs) % 60_000);
    const timeout = setTimeout(() => {
      setTick(t => t + 1);
      interval = setInterval(() => setTick(t => t + 1), 60_000);
    }, untilNextMinute + 50);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [enabled, zone.offsetMs, tick]);

  return useMemo(() => {
    if (!enabled) return null;
    const at = new Date(Date.now() + zone.offsetMs);
    const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
    try {
      // a zone the runtime does not know would throw and take the whole screen with it
      return new Intl.DateTimeFormat(zone.locale ?? undefined, { ...options, timeZone: zone.tz ?? undefined }).format(at);
    } catch {
      return new Intl.DateTimeFormat(undefined, options).format(at);
    }
  }, [enabled, zone, tick]);
}
