// the kiosk's own clock is never set, so the time comes from the daemon, which carries the phone's
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useState } from 'react';

type Zone = { tz: string | null; locale: string | null; offsetMs: number } | null;

export function useWallClock(client: BridgethingClient): string | null {
  const [zone, setZone] = useState<Zone>(null);
  const [now, setNow] = useState(() => Date.now());

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
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      offChanged();
      offSnapshot();
      clearInterval(id);
    };
  }, [client]);

  if (!zone) return null;
  const at = new Date(now + zone.offsetMs);
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  try {
    return at.toLocaleTimeString(zone.locale ?? undefined, { ...options, timeZone: zone.tz ?? undefined });
  } catch {
    return at.toLocaleTimeString(undefined, options);
  }
}
