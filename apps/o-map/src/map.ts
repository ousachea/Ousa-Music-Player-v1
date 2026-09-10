// the map is a grid of 256px tiles fetched through the phone. web mercator, the same maths every
// slippy map uses: the world is one tile at zoom 0 and four times as many at every zoom after it
import type { BridgethingClient } from '@bridgething/client';

export const TILE = 256;
export const MIN_ZOOM = 6;
export const MAX_ZOOM = 16;

export type Place = { key: string; label: string; lat: number; lon: number; zoom: number };

// the places worth jumping to on a screen this size, which on a Cambodian map is the cities the
// traffic is actually in
export const PLACES: Place[] = [
  { key: 'phnom-penh', label: 'Phnom Penh', lat: 11.5564, lon: 104.9282, zoom: 13 },
  { key: 'siem-reap', label: 'Siem Reap', lat: 13.3671, lon: 103.8448, zoom: 13 },
  { key: 'sihanoukville', label: 'Sihanoukville', lat: 10.6104, lon: 103.5288, zoom: 13 },
  { key: 'battambang', label: 'Battambang', lat: 13.0957, lon: 103.2022, zoom: 13 },
  { key: 'cambodia', label: 'All of Cambodia', lat: 12.5657, lon: 104.991, zoom: 7 },
];

export const BY_KEY: Record<string, Place> = Object.fromEntries(PLACES.map(p => [p.key, p]));

export function lonToX(lon: number, zoom: number) {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

export function latToY(lat: number, zoom: number) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
}

export function xToLon(x: number, zoom: number) {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

export function yToLat(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export type Source = { id: string; url: (z: number, x: number, y: number) => string };

export const BASE: Record<string, Source> = {
  streets: { id: 'streets', url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png` },
  // pale roads on almost no colour: the traffic is then the only thing on the map with any in it.
  // esri's canvas tiles are y before x, which is the one thing that differs between the sources
  minimal: {
    id: 'minimal',
    url: (z, x, y) =>
      `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
  },
  night: {
    id: 'night',
    url: (z, x, y) =>
      `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
  },
  // the humanitarian style is flatter and lighter, which leaves the traffic colours somewhere to sit
  plain: { id: 'plain', url: (z, x, y) => `https://tile.openstreetmap.fr/hot/${z}/${x}/${y}.png` },
};

export const BASE_LABELS: Record<string, string> = {
  streets: 'Streets',
  minimal: 'Minimal',
  night: 'Night',
  plain: 'Plain',
};

/** who to credit for what is on screen, which is not the same source for every style */
export const CREDIT: Record<string, string> = {
  streets: '© OpenStreetMap contributors',
  minimal: '© Esri, HERE, Garmin, © OpenStreetMap contributors',
  night: '© Esri, HERE, Garmin, © OpenStreetMap contributors',
  plain: '© OpenStreetMap contributors, tiles by HOT',
};

export const trafficUrl = (key: string) => (z: number, x: number, y: number) =>
  `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${key}&thickness=6`;

type Pending = Promise<string | null>;

/** tiles are bytes over the phone's connection, so each one is fetched once and kept */
export class Tiles {
  private cache = new Map<string, string>();
  private inflight = new Map<string, Pending>();

  constructor(
    private client: BridgethingClient,
    private limit = 320,
  ) {}

  get(url: string): string | null {
    return this.cache.get(url) ?? null;
  }

  load(url: string): Pending {
    const held = this.cache.get(url);
    if (held) return Promise.resolve(held);
    const running = this.inflight.get(url);
    if (running) return running;

    const job = (async () => {
      try {
        const result = await this.client.net.fetch({
          request: {
            url,
            method: 'GET',
            headers: [{ name: 'User-Agent', value: 'O-Map/1.0 (bridgething webapp)' }],
            timeoutMs: 9000,
            redirect: 'follow',
          },
        });
        if (!result.ok || result.response.response.status !== 200) return null;
        const bytes = new Uint8Array(result.response.response.body as unknown as number[]);
        if (bytes.length === 0) return null;
        const blob = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        // the oldest tile goes when the cache is full: a map moves on and never looks back at it
        if (this.cache.size >= this.limit) {
          const oldest = this.cache.keys().next().value;
          if (oldest) {
            URL.revokeObjectURL(this.cache.get(oldest)!);
            this.cache.delete(oldest);
          }
        }
        this.cache.set(url, blob);
        return blob;
      } catch {
        return null;
      } finally {
        this.inflight.delete(url);
      }
    })();
    this.inflight.set(url, job);
    return job;
  }
}
