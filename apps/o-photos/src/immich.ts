// every request goes through the phone: the screen has no network of its own, so this is one fetch
// helper over net.fetch rather than the browser's. it also means CORS never enters into it
import type { BridgethingClient } from '@bridgething/client';

import * as demo from './demo';
import type { Album, Asset, Failure, Page, Server } from './types';

/** the pretend library, which needs no server and no key. the url has been through normalise by the
 * time it arrives, so the scheme it added has to come back off before comparing */
export const isDemo = (conn: Conn) => conn.url.trim().replace(/^https?:\/\//i, '') === demo.DEMO_URL;

export type Conn = { url: string; key: string };

const enc = new TextEncoder();
const dec = new TextDecoder();

/** trailing slashes, a missing scheme and a path pasted from a browser all arrive here */
export function normalise(raw: string): string {
  let url = raw.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/api$/i, '');
  return url;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };

async function call<T>(
  client: BridgethingClient,
  conn: Conn,
  path: string,
  init?: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; binary?: boolean },
): Promise<Result<T>> {
  if (!conn.url || !conn.key) return { ok: false, error: { kind: 'unconfigured' } };
  const method = init?.method ?? 'GET';
  const headers = [
    { name: 'x-api-key', value: conn.key },
    { name: 'Accept', value: init?.binary ? '*/*' : 'application/json' },
  ];
  if (init?.body !== undefined) headers.push({ name: 'Content-Type', value: 'application/json' });

  let reply;
  try {
    reply = await client.net.fetch({
      request: {
        url: `${conn.url}/api${path}`,
        method,
        headers,
        body: init?.body === undefined ? null : enc.encode(JSON.stringify(init.body)),
        timeoutMs: 15000,
        redirect: 'follow',
      },
    });
  } catch {
    return { ok: false, error: { kind: 'offline' } };
  }
  if (!reply.ok) return { ok: false, error: { kind: 'offline' } };

  const { status, body } = reply.response.response;
  if (status === 401) return { ok: false, error: { kind: 'auth' } };
  if (status === 403) return { ok: false, error: { kind: 'permission' } };
  if (status < 200 || status >= 300) return { ok: false, error: { kind: 'server', status } };

  const bytes = new Uint8Array(body as unknown as number[]);
  if (init?.binary) return { ok: true, value: bytes as unknown as T };
  try {
    return { ok: true, value: JSON.parse(dec.decode(bytes)) as T };
  } catch {
    return { ok: false, error: { kind: 'shape' } };
  }
}

type RawAsset = {
  id: string;
  type?: string;
  originalFileName?: string;
  fileCreatedAt?: string;
  localDateTime?: string;
  isFavorite?: boolean;
  duration?: string;
  exifInfo?: {
    exifImageWidth?: number | null;
    exifImageHeight?: number | null;
    city?: string | null;
    country?: string | null;
    make?: string | null;
    model?: string | null;
  } | null;
};

function readAsset(raw: RawAsset): Asset {
  const exif = raw.exifInfo ?? {};
  const make = exif.make?.trim() ?? '';
  const model = exif.model?.trim() ?? '';
  const camera = [make, model].filter(Boolean).join(' ');
  // duration arrives as HH:MM:SS.mmm, which is only worth reading for a video
  const parts = (raw.duration ?? '').split(':').map(Number);
  const durationMs =
    parts.length === 3 && parts.every(n => Number.isFinite(n)) ? (parts[0]! * 3600 + parts[1]! * 60 + parts[2]!) * 1000 : null;
  return {
    id: raw.id,
    type: raw.type === 'VIDEO' ? 'VIDEO' : raw.type === 'IMAGE' ? 'IMAGE' : 'OTHER',
    name: raw.originalFileName ?? 'untitled',
    takenAt: raw.localDateTime ?? raw.fileCreatedAt ?? null,
    favourite: raw.isFavorite === true,
    durationMs: durationMs && durationMs > 0 ? durationMs : null,
    width: exif.exifImageWidth ?? null,
    height: exif.exifImageHeight ?? null,
    city: exif.city ?? null,
    country: exif.country ?? null,
    camera: camera || null,
  };
}

export async function ping(client: BridgethingClient, conn: Conn): Promise<Result<Server>> {
  if (isDemo(conn)) return { ok: true, value: { version: 'demo', reachable: true } };
  const about = await call<{ version?: string }>(client, conn, '/server/about');
  if (!about.ok) return about;
  return { ok: true, value: { version: about.value.version ?? 'unknown', reachable: true } };
}

type SearchBody = {
  page: number;
  size: number;
  isFavorite?: boolean;
  albumIds?: string[];
  withExif?: boolean;
  order?: 'desc' | 'asc';
};

async function metadata(client: BridgethingClient, conn: Conn, body: SearchBody): Promise<Result<Page<Asset>>> {
  const reply = await call<{ assets?: { items?: RawAsset[]; nextPage?: string | number | null } }>(
    client,
    conn,
    '/search/metadata',
    { method: 'POST', body: { withExif: true, order: 'desc', ...body } },
  );
  if (!reply.ok) return reply;
  const assets = reply.value.assets;
  if (!assets?.items) return { ok: false, error: { kind: 'shape' } };
  const next = assets.nextPage === null || assets.nextPage === undefined ? null : Number(assets.nextPage);
  return { ok: true, value: { items: assets.items.map(readAsset), next: Number.isFinite(next) ? next : null } };
}

export const recent = (client: BridgethingClient, conn: Conn, page: number, size: number) =>
  isDemo(conn) ? Promise.resolve({ ok: true as const, value: demo.assets(page, size) }) : metadata(client, conn, { page, size });

export const favourites = (client: BridgethingClient, conn: Conn, page: number, size: number) =>
  isDemo(conn)
    ? Promise.resolve({ ok: true as const, value: demo.assets(page, size, 'favourites') })
    : metadata(client, conn, { page, size, isFavorite: true });

export const inAlbum = (client: BridgethingClient, conn: Conn, albumId: string, page: number, size: number) =>
  isDemo(conn)
    ? Promise.resolve({ ok: true as const, value: demo.inAlbum(albumId, page, size) })
    : metadata(client, conn, { page, size, albumIds: [albumId] });

/** the smart index when the server has one, the filename search when it does not */
export async function search(
  client: BridgethingClient,
  conn: Conn,
  query: string,
  page: number,
  size: number,
): Promise<Result<Page<Asset>>> {
  if (isDemo(conn)) return { ok: true, value: demo.search(query, page, size) };
  const smart = await call<{ assets?: { items?: RawAsset[]; nextPage?: string | number | null } }>(
    client,
    conn,
    '/search/smart',
    { method: 'POST', body: { query, page, size, withExif: true } },
  );
  if (smart.ok && smart.value.assets?.items) {
    const next = smart.value.assets.nextPage == null ? null : Number(smart.value.assets.nextPage);
    return { ok: true, value: { items: smart.value.assets.items.map(readAsset), next: Number.isFinite(next) ? next : null } };
  }
  const plain = await call<{ assets?: { items?: RawAsset[]; nextPage?: string | number | null } }>(
    client,
    conn,
    '/search/metadata',
    { method: 'POST', body: { originalFileName: query, page, size, withExif: true } },
  );
  if (!plain.ok) return plain;
  const items = plain.value.assets?.items ?? [];
  const next = plain.value.assets?.nextPage == null ? null : Number(plain.value.assets.nextPage);
  return { ok: true, value: { items: items.map(readAsset), next: Number.isFinite(next) ? next : null } };
}

export async function albums(client: BridgethingClient, conn: Conn): Promise<Result<Album[]>> {
  if (isDemo(conn)) return { ok: true, value: demo.albums() };
  const reply = await call<{ id: string; albumName?: string; assetCount?: number; albumThumbnailAssetId?: string | null }[]>(
    client,
    conn,
    '/albums',
  );
  if (!reply.ok) return reply;
  if (!Array.isArray(reply.value)) return { ok: false, error: { kind: 'shape' } };
  return {
    ok: true,
    value: reply.value.map(a => ({
      id: a.id,
      name: a.albumName ?? 'untitled',
      count: a.assetCount ?? 0,
      coverId: a.albumThumbnailAssetId ?? null,
    })),
  };
}

export async function setFavourite(
  client: BridgethingClient,
  conn: Conn,
  id: string,
  on: boolean,
): Promise<Result<true>> {
  if (isDemo(conn)) return { ok: true, value: true };
  const reply = await call<unknown>(client, conn, `/assets/${id}`, { method: 'PUT', body: { isFavorite: on } });
  return reply.ok ? { ok: true, value: true } : reply;
}

export type Size = 'thumbnail' | 'preview';

export async function image(
  client: BridgethingClient,
  conn: Conn,
  id: string,
  size: Size,
): Promise<Result<Uint8Array>> {
  return call<Uint8Array>(client, conn, `/assets/${id}/thumbnail?size=${size}`, { binary: true });
}
