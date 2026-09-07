// client.store is this app's own key/value space on the device: the watchlist lives there.
import type { BridgethingClient } from '@bridgething/client';

const WATCHLIST_KEY = 'watchlist';

export async function loadWatchlist(client: BridgethingClient): Promise<Set<string>> {
  try {
    const r = await client.store.get({ key: WATCHLIST_KEY });
    if (!r.ok || !r.response.value) return new Set();
    const parsed = JSON.parse(r.response.value);
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveWatchlist(client: BridgethingClient, watchlist: Set<string>) {
  client.store.put({ key: WATCHLIST_KEY, value: JSON.stringify([...watchlist]) }).catch(() => {});
}
