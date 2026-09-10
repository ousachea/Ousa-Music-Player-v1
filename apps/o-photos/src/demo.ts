// a library that needs no server, for looking at the app before a key exists. it lives apart from
// the immich client so the real code never grows a branch for pretend data
import type { Album, Asset, Page } from './types';

export const DEMO_URL = 'demo';

const PLACES = [
  ['Phnom Penh', 'Cambodia'],
  ['Siem Reap', 'Cambodia'],
  ['Kampot', 'Cambodia'],
  ['Kep', 'Cambodia'],
];
const CAMERAS = ['iPhone 16 Pro', 'Fujifilm X100VI', 'Ricoh GR III', null];

function asset(n: number): Asset {
  const place = PLACES[n % PLACES.length]!;
  const day = new Date(Date.UTC(2026, 8, 10) - n * 7200_000).toISOString();
  return {
    id: `demo-${n}`,
    type: n % 11 === 0 ? 'VIDEO' : 'IMAGE',
    name: `IMG_${String(1000 + n).padStart(4, '0')}.JPG`,
    takenAt: day,
    favourite: n % 5 === 0,
    durationMs: n % 11 === 0 ? 12_000 + (n % 7) * 4000 : null,
    width: 4032,
    height: 3024,
    city: place[0]!,
    country: place[1]!,
    camera: CAMERAS[n % CAMERAS.length] ?? null,
  };
}

export function assets(page: number, size: number, only?: 'favourites'): Page<Asset> {
  const all = Array.from({ length: 240 }, (_, i) => asset(i)).filter(a => (only === 'favourites' ? a.favourite : true));
  const from = (page - 1) * size;
  const items = all.slice(from, from + size);
  return { items, next: from + size < all.length ? page + 1 : null };
}

export function search(query: string, page: number, size: number): Page<Asset> {
  const q = query.trim().toLowerCase();
  const all = Array.from({ length: 240 }, (_, i) => asset(i)).filter(
    a => a.name.toLowerCase().includes(q) || (a.city ?? '').toLowerCase().includes(q),
  );
  const from = (page - 1) * size;
  return { items: all.slice(from, from + size), next: from + size < all.length ? page + 1 : null };
}

export function albums(): Album[] {
  return [
    { id: 'a1', name: 'Cambodia', count: 248, coverId: 'demo-3' },
    { id: 'a2', name: 'Kampot weekend', count: 64, coverId: 'demo-12' },
    { id: 'a3', name: 'Family', count: 104, coverId: 'demo-21' },
    { id: 'a4', name: 'Rooftops', count: 39, coverId: 'demo-30' },
  ];
}

export function inAlbum(albumId: string, page: number, size: number): Page<Asset> {
  const seed = albumId.charCodeAt(1) % 5;
  const all = Array.from({ length: 96 }, (_, i) => asset(i * 2 + seed));
  const from = (page - 1) * size;
  return { items: all.slice(from, from + size), next: from + size < all.length ? page + 1 : null };
}

/** a picture drawn rather than downloaded, so demo mode needs nothing at all */
export function picture(id: string, size: 'thumbnail' | 'preview'): Promise<Blob> {
  const n = Number(id.replace('demo-', '')) || 0;
  const w = size === 'preview' ? 960 : 320;
  const h = size === 'preview' ? 640 : 320;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const hue = (n * 37) % 360;
  const sky = g.createLinearGradient(0, 0, w, h);
  sky.addColorStop(0, `hsl(${hue} 62% 24%)`);
  sky.addColorStop(1, `hsl(${(hue + 48) % 360} 58% 52%)`);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = `hsl(${(hue + 190) % 360} 40% 12%)`;
  g.beginPath();
  g.moveTo(0, h * 0.78);
  for (let x = 0; x <= w; x += w / 8) g.lineTo(x, h * (0.62 + 0.18 * Math.abs(Math.sin((x + n) / 90))));
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = `${Math.round(h / 12)}px ui-monospace, monospace`;
  g.fillText(`demo ${n}`, 16, h - 16);
  return new Promise(resolve => canvas.toBlob(b => resolve(b ?? new Blob()), 'image/jpeg', 0.86));
}
