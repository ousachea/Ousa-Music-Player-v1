// the kiosk browser reports UTC no matter what the device's own clock says, so the zone has to come
// from the daemon, which carries the phone's zone, locale and wall clock.
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useState } from 'react';

export type Zone = { tz: string | null; locale: string | null; offsetMs: number };

export function useZone(client: BridgethingClient): Zone {
  const [zone, setZone] = useState<Zone>({ tz: null, locale: null, offsetMs: 0 });

  useEffect(() => {
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
  }, [client]);

  return zone;
}

function withZone(zone: Zone, options: Intl.DateTimeFormatOptions) {
  try {
    // a zone the runtime does not know would throw and take the whole screen with it
    return new Intl.DateTimeFormat(zone.locale ?? undefined, { ...options, timeZone: zone.tz ?? undefined });
  } catch {
    return new Intl.DateTimeFormat(undefined, options);
  }
}

export function clockAt(at: number, zone: Zone) {
  return withZone(zone, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(
    at + zone.offsetMs,
  );
}

export function timeAt(at: number, zone: Zone) {
  return withZone(zone, { hour: 'numeric', minute: '2-digit' }).format(at + zone.offsetMs);
}

export function dateAt(at: number, zone: Zone) {
  return withZone(zone, { month: 'short', day: 'numeric', year: '2-digit' }).format(at + zone.offsetMs);
}
