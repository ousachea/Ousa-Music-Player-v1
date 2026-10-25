// the phone link as the player needs it: whether a phone is there, the paired one to bring back when none is, and a
// reconnect that the player tries on its own with growing gaps, so a dropped link comes back without a trip to the
// phone. the device owns the link itself; this only asks it to reconnect, and never while anything is connected
import type { BridgethingClient, PlayerState } from '@bridgething/client';
import { useCallback, useEffect, useState } from 'react';

// waits before each automatic try while nothing is connected; the last one repeats until a phone is back
const RETRY_S = [10, 30, 60, 120];

export type PhoneLink = {
  // null until the device has said
  linked: boolean | null;
  phone: string | null;
  reconnect: () => void;
};

export function usePhoneLink(client: BridgethingClient): PhoneLink {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [phone, setPhone] = useState<{ mac: string; name: string } | null>(null);

  useEffect(() => {
    const offStatus = client.bluetooth.onStatus(s => setLinked(s.connected));
    // the default paired phone is the one to bring back; a network link like the desktop app has no radio to redial
    const pick = (devices: Record<string, { name: string; id: string; kind: string; default: boolean }>) => {
      const all = Object.values(devices).filter(d => d.kind === 'bluetooth');
      const best = all.find(d => d.default) ?? all[0];
      setPhone(best ? { mac: best.id, name: best.name } : null);
    };
    const offPaired = client.bluetooth.onPairedDevices(pick);
    client.bluetooth.list().then(r => r.ok && pick(r.response));
    return () => {
      offStatus();
      offPaired();
    };
  }, [client]);

  const reconnect = useCallback(() => {
    if (phone) client.bluetooth.connect({ mac: phone.mac }).catch(() => {});
  }, [client, phone]);

  // each try moves the count on, which schedules the next; a phone coming back starts the count over
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (linked !== false) setTries(0);
  }, [linked]);
  useEffect(() => {
    if (linked !== false || !phone) return;
    const timer = setTimeout(() => {
      reconnect();
      setTries(n => n + 1);
    }, RETRY_S[Math.min(tries, RETRY_S.length - 1)] * 1000);
    return () => clearTimeout(timer);
  }, [linked, phone, reconnect, tries]);

  return { linked, phone: phone?.name ?? null, reconnect };
}

// rides out a dropped song: a state without a track, while one is showing, is held back for `ms` with the song shown
// paused, and lands only if no track comes back first. `release` lets the hold go early
export function holdDrops(
  apply: (next: PlayerState | null | ((prev: PlayerState | null) => PlayerState | null)) => void,
  onHeld: (held: boolean) => void,
  ms: number,
  timer: { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void } = {
    set: (fn, wait) => setTimeout(fn, wait),
    clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
) {
  let handle: unknown = null;
  let showing = false;
  let pending: PlayerState | null = null;
  const release = () => {
    if (handle === null) return;
    timer.clear(handle);
    handle = null;
    showing = false;
    onHeld(false);
    apply(pending);
  };
  const take = (next: PlayerState | null) => {
    if (next?.track) {
      if (handle !== null) timer.clear(handle);
      handle = null;
      showing = true;
      onHeld(false);
      apply(next);
      return;
    }
    pending = next;
    if (handle !== null) return;
    if (!showing) return apply(next);
    onHeld(true);
    apply(prev => (prev ? { ...prev, playback: { ...prev.playback, state: 'paused' } } : prev));
    handle = timer.set(release, ms);
  };
  return { take, release, cancel: () => handle !== null && timer.clear(handle) };
}
