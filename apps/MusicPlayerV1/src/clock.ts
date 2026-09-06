// the daemon carries the phone's wall clock, zone and locale, which beats trusting the kiosk's own clock
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useMemo, useState } from 'react';

type Zone = { tz: string | null; locale: string | null; offsetMs: number };

export type ClockParts = {
  hour: string;
  minute: string;
  second: string | null;
  dayPeriod: string | null;
  // the colon blinks on the half second, so the readout has to be rebuilt at that rate
  colon: boolean;
};

export function useClock(
  client: BridgethingClient,
  enabled: boolean,
  seconds: boolean,
  format: 'auto' | 'h12' | 'h24',
): ClockParts | null {
  const [zone, setZone] = useState<Zone>({ tz: null, locale: null, offsetMs: 0 });
  const [now, setNow] = useState(() => Date.now());

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

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) return null;
    const at = new Date(now + zone.offsetMs);
    const options: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      ...(seconds ? { second: '2-digit' } : {}),
      ...(format === 'auto' ? {} : { hour12: format === 'h12' }),
    };
    const read = (formatter: Intl.DateTimeFormat) => {
      const parts = formatter.formatToParts(at);
      const of = (type: string) => parts.find(p => p.type === type)?.value ?? null;
      return {
        hour: of('hour') ?? '--',
        minute: of('minute') ?? '--',
        second: seconds ? of('second') : null,
        dayPeriod: of('dayPeriod'),
        colon: (now + zone.offsetMs) % 1000 < 500,
      };
    };
    try {
      // a zone the runtime does not know would throw and take the whole screen with it
      return read(new Intl.DateTimeFormat(zone.locale ?? undefined, { ...options, timeZone: zone.tz ?? undefined }));
    } catch {
      return read(new Intl.DateTimeFormat(undefined, options));
    }
  }, [enabled, seconds, format, zone, now]);
}
