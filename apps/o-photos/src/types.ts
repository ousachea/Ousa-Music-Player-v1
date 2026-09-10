// what the app needs from an immich asset, which is a fraction of what the api sends back
export type Asset = {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'OTHER';
  name: string;
  takenAt: string | null;
  favourite: boolean;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  city: string | null;
  country: string | null;
  camera: string | null;
};

export type Album = {
  id: string;
  name: string;
  count: number;
  coverId: string | null;
};

export type Server = { version: string; reachable: boolean };

export type Page<T> = { items: T[]; next: number | null };

export type Failure =
  | { kind: 'unconfigured' }
  | { kind: 'auth' }
  | { kind: 'permission' }
  | { kind: 'offline' }
  | { kind: 'server'; status: number }
  | { kind: 'shape' };

export const FAILURE_TEXT: Record<Failure['kind'], string> = {
  unconfigured: 'No server yet',
  auth: 'The key was refused',
  permission: 'The key lacks permission',
  offline: 'The phone could not reach it',
  server: 'The server answered badly',
  shape: 'The answer was not what this app reads',
};
