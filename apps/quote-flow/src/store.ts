// client.store is this app's own key/value space on the device: favourites live there.
// custom quotes come through doc instead, because the companion settings page writes those.
import type { BridgethingClient } from '@bridgething/client';

const FAVOURITES_KEY = 'favourites';
export const CUSTOM_DOC_KEY = 'custom.quotes';

export async function loadFavourites(client: BridgethingClient): Promise<Set<string>> {
  try {
    const r = await client.store.get({ key: FAVOURITES_KEY });
    if (!r.ok || !r.response.value) return new Set();
    const parsed = JSON.parse(r.response.value);
    return new Set(Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveFavourites(client: BridgethingClient, favourites: Set<string>) {
  client.store.put({ key: FAVOURITES_KEY, value: JSON.stringify([...favourites]) }).catch(() => {});
}

export async function loadCustom(client: BridgethingClient): Promise<string | null> {
  try {
    const r = await client.doc.get({ key: CUSTOM_DOC_KEY });
    return r.ok ? r.response.value : null;
  } catch {
    return null;
  }
}
