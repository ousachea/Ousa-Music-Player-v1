// the daemon hands over 512px whatever art.heroPx asks for, which the poster style has to upscale.
// apple's search endpoint carries the same covers far larger, keyed by artist and album.
import type { BridgethingClient } from '@bridgething/client';

const SEARCH = 'https://itunes.apple.com/search';
// 1000 covers the 800px screen with room to spare; 1500 is available but triples the bytes per track
const WANTED_PX = 1000;
const TIMEOUT_MS = 8000;
const CACHE_MAX = 6;

// keyed by album, because every track on one album resolves to the same cover
const cache = new Map<string, Found>();

// the phone leaves the artist out on some tracks, and the search answers with it either way
export type Found = { url: string; artist: string | null };

function remember(key: string, found: Found) {
  cache.set(key, found);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value as string;
    const stale = cache.get(oldest);
    cache.delete(oldest);
    if (stale) URL.revokeObjectURL(stale.url);
  }
}

async function get(client: BridgethingClient, url: string) {
  const reply = await client.net.fetch(
    { request: { url, method: 'GET', headers: [], timeoutMs: TIMEOUT_MS, redirect: 'follow' } },
    { timeoutMs: TIMEOUT_MS + 2000 },
  );
  if (!reply.ok) throw new Error('no answer from the daemon');
  const { status, headers, body } = reply.response.response;
  if (status !== 200) throw new Error(`http ${status}`);
  const type = headers.find(h => h.name.toLowerCase() === 'content-type')?.value ?? '';
  return { bytes: new Uint8Array(body as unknown as number[]), type };
}

export async function hdArtwork(
  client: BridgethingClient,
  track: { artist: string | null; album: string | null; title: string | null },
): Promise<Found | null> {
  const artist = track.artist?.trim();
  const album = track.album?.trim();
  // the album alone is enough to search on, which is the only way tracks with no artist get a cover
  if (!album) return null;

  const key = `${artist ?? ''}|${album}`.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const term = artist ? `${artist} ${album}` : album;
  const query = `${SEARCH}?term=${encodeURIComponent(term)}&entity=album&limit=1`;
  const found = await get(client, query);
  const results = JSON.parse(new TextDecoder().decode(found.bytes))?.results;
  const small: string | undefined = results?.[0]?.artworkUrl100;
  const named: string | undefined = results?.[0]?.artistName;
  if (!small) return null;

  // the url carries its own size, so a bigger one is a substitution rather than a separate lookup
  const big = small.replace(/\/\d+x\d+bb\./, `/${WANTED_PX}x${WANTED_PX}bb.`);
  if (big === small) return null;

  const image = await get(client, big);
  if (!image.type.startsWith('image/')) return null;

  const url = URL.createObjectURL(new Blob([image.bytes], { type: image.type }));
  // only worth reporting when the phone gave nothing; a match on the album name alone can be wrong
  const result: Found = { url, artist: artist ? null : (named?.trim() ?? null) };
  remember(key, result);
  return result;
}
