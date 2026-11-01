// the four preset buttons as saved favourites: a hold saves what is playing, a press plays it back
import type { BridgethingClient, PlayerState } from '@bridgething/client';
import { useCallback, useEffect, useState } from 'react';

export type Slot = { uri: string; name: string };
const PREFIX = 'preset.';

export function parseSlot(value: string | null | undefined): Slot | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value) as Partial<Slot>;
    return typeof v.uri === 'string' && v.uri && typeof v.name === 'string' ? { uri: v.uri, name: v.name } : null;
  } catch {
    return null;
  }
}

export function usePresetSlots(client: BridgethingClient) {
  const [slots, setSlots] = useState<Record<string, Slot>>({});

  useEffect(() => {
    const take = (key: string, value: string | null) => {
      if (!key.startsWith(PREFIX)) return;
      const n = key.slice(PREFIX.length);
      const slot = parseSlot(value);
      setSlots(s => {
        const next = { ...s };
        if (slot) next[n] = slot;
        else delete next[n];
        return next;
      });
    };
    const off = client.doc.onChanged(msg => take(msg.key, msg.value));
    client.doc
      .list()
      .then(r => r.ok && r.response.entries.forEach(e => take(e.key, e.value)))
      .catch(() => {});
    return off;
  }, [client]);

  // the playlist or album the song came from is what a preset should bring back, not the one song
  const save = useCallback(
    async (n: string, state: PlayerState | null): Promise<Slot | null> => {
      const track = state?.track;
      const uri = state?.context?.uri ?? track?.uri;
      if (!uri) return null;
      let name = state?.context?.uri ? state.context.name : track?.title ?? null;
      if (!name) {
        const r = await client.library.resolveContext({ uri }).catch(() => null);
        name = (r?.ok && r.response.name) || track?.title || 'Saved';
      }
      const slot = { uri, name };
      setSlots(s => ({ ...s, [n]: slot }));
      client.doc.set({ key: PREFIX + n, value: JSON.stringify(slot) });
      return slot;
    },
    [client],
  );

  return { slots, save };
}
