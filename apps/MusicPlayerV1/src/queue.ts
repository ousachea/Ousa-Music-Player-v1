// the queue comes from the phone, so it is only ever read: the daemon sends a new one whenever it
// changes and skipToIndex is the only thing that acts on it
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useRef, useState } from 'react';

// randomUUID only exists in a secure context, and the dev server reaches the device over plain http.
// the daemon parses the id as a 16 byte uuid, so the fallback has to be a real v4 one
export function requestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type QueueTrack = {
  uri: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkId: string | null;
  durationMs: number | null;
  queued: boolean;
};

export type Queue = { current: QueueTrack | null; items: QueueTrack[]; previous: QueueTrack[] };

export function useQueue(client: BridgethingClient, live: boolean, trackKey: string | null): Queue | null {
  const [queue, setQueue] = useState<Queue | null>(null);

  useEffect(() => {
    if (!live) return;
    let stale = false;
    const take = (reply: Queue) => {
      if (!stale) setQueue({ current: reply.current, items: reply.items, previous: reply.previous });
    };
    client.player.queueGet().then(result => {
      if (result.ok) take(result.response);
    });
    const off = client.player.onQueueChanged(take);
    return () => {
      stale = true;
      off();
    };
  }, [client, live, trackKey]);

  return queue;
}

// artwork arrives as bytes per id, so the urls are cached across renders and revoked together
export function useThumbs(client: BridgethingClient, ids: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const cache = useRef(new Map<string, string>());
  const key = ids.join('|');

  useEffect(() => {
    let stale = false;
    (async () => {
      for (const id of key ? key.split('|') : []) {
        if (stale || cache.current.has(id)) continue;
        // held before the fetch resolves so a second pass over the same id does not fetch it twice
        cache.current.set(id, '');
        const result = await client.asset.get({ id, requestId: requestId() });
        if (stale || !result.ok) continue;
        const bytes = new Uint8Array(result.response.bytes as unknown as number[]);
        const url = URL.createObjectURL(new Blob([bytes], { type: result.response.mime ?? 'image/jpeg' }));
        cache.current.set(id, url);
        setUrls(Object.fromEntries(cache.current));
      }
    })();
    return () => {
      stale = true;
    };
  }, [client, key]);

  useEffect(() => {
    const held = cache.current;
    return () => {
      for (const url of held.values()) if (url) URL.revokeObjectURL(url);
      held.clear();
    };
  }, []);

  return urls;
}
