// the daemon carries the phone's wall clock, zone and locale. the kiosk's own clock is not set from
// anything, so a clock app in particular has no business trusting it
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useState } from 'react';

export type Zone = { tz: string | null; locale: string | null; offsetMs: number; synced: boolean };

export function useZone(client: BridgethingClient): Zone {
  const [zone, setZone] = useState<Zone>({ tz: null, locale: null, offsetMs: 0, synced: false });

  useEffect(() => {
    const apply = (info: { tzIana: string | null; locale: string | null; wallClockUnixS: number | null }) => {
      setZone({
        tz: info.tzIana,
        locale: info.locale,
        offsetMs: info.wallClockUnixS === null ? 0 : info.wallClockUnixS * 1000 - Date.now(),
        synced: info.wallClockUnixS !== null,
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

// one ticker for the whole app rather than one per view, at the rate the second hand needs
export function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set(n => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return Date.now();
}

export type Parts = { hour: string; minute: string; second: string; dayPeriod: string | null; date: string };

export function readClock(at: Date, zone: Zone, format: 'auto' | 'h12' | 'h24'): Parts {
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    ...(format === 'auto' ? {} : { hour12: format === 'h12' }),
  };
  const read = (fmt: Intl.DateTimeFormat, dateFmt: Intl.DateTimeFormat) => {
    const parts = fmt.formatToParts(at);
    const of = (t: string) => parts.find(p => p.type === t)?.value ?? '--';
    return {
      hour: of('hour'),
      minute: of('minute'),
      second: of('second'),
      dayPeriod: parts.find(p => p.type === 'dayPeriod')?.value ?? null,
      date: dateFmt.format(at),
    };
  };
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  try {
    // a zone the runtime does not know would throw and take the whole screen with it
    const tz = zone.tz ?? undefined;
    return read(
      new Intl.DateTimeFormat(zone.locale ?? undefined, { ...opts, timeZone: tz }),
      new Intl.DateTimeFormat(zone.locale ?? undefined, { ...dateOpts, timeZone: tz }),
    );
  } catch {
    return read(new Intl.DateTimeFormat(undefined, opts), new Intl.DateTimeFormat(undefined, dateOpts));
  }
}

// hours and minutes as numbers, for the analogue hands and for matching an alarm
export function fields(at: Date, zone: Zone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: zone.tz ?? undefined,
    });
    const [h, m, s] = fmt.format(at).split(':').map(Number);
    return { h, m, s, ms: at.getMilliseconds() };
  } catch {
    return { h: at.getHours(), m: at.getMinutes(), s: at.getSeconds(), ms: at.getMilliseconds() };
  }
}

export function clockText(ms: number, showMs = false) {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  const head = h > 0 ? `${h}:${pad(m)}` : `${m}`;
  return showMs ? `${head}:${pad(s)}.${pad(cs)}` : `${head}:${pad(s)}`;
}
