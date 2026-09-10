// pictures are expensive to fetch twice over a phone, so every one that arrives is kept in
// indexeddb with the time it was last wanted, and the oldest go when the box is full
const DB = 'o-photos';
const STORE = 'images';

export type Cached = { key: string; blob: Blob; bytes: number; type: string; at: number };

let open: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (open) return open;
  open = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'key' });
      store.createIndex('at', 'at');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return open;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return db()
    .then(
      handle =>
        new Promise<T | null>(resolve => {
          const tx = handle.transaction(STORE, mode);
          const req = work(tx.objectStore(STORE));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        }),
    )
    .catch(() => null);
}

export const keyFor = (id: string, size: string) => `${id}/${size}`;

export async function read(key: string): Promise<Blob | null> {
  const row = (await run<Cached>('readonly', store => store.get(key) as IDBRequest<Cached>)) as Cached | null;
  if (!row) return null;
  // touching it is what keeps it out of the next sweep, and is cheap enough to do on every hit
  run('readwrite', store => store.put({ ...row, at: Date.now() }));
  return row.blob;
}

export async function write(key: string, blob: Blob) {
  await run('readwrite', store => store.put({ key, blob, bytes: blob.size, type: blob.type, at: Date.now() }));
}

export async function usage(): Promise<{ bytes: number; count: number }> {
  const rows = (await run<Cached[]>('readonly', store => store.getAll() as IDBRequest<Cached[]>)) ?? [];
  return { bytes: rows.reduce((sum, row) => sum + (row.bytes || 0), 0), count: rows.length };
}

/** oldest first until the box is back under four fifths of its limit, rather than emptying it */
export async function sweep(limitBytes: number) {
  const rows = (await run<Cached[]>('readonly', store => store.getAll() as IDBRequest<Cached[]>)) ?? [];
  let total = rows.reduce((sum, row) => sum + (row.bytes || 0), 0);
  if (total <= limitBytes) return;
  const target = limitBytes * 0.8;
  for (const row of rows.sort((a, b) => a.at - b.at)) {
    if (total <= target) break;
    await run('readwrite', store => store.delete(row.key));
    total -= row.bytes || 0;
  }
}

export async function clear(which: 'all' | 'thumbnail' | 'preview') {
  const rows = (await run<Cached[]>('readonly', store => store.getAll() as IDBRequest<Cached[]>)) ?? [];
  for (const row of rows) {
    if (which !== 'all' && !row.key.endsWith(`/${which}`)) continue;
    await run('readwrite', store => store.delete(row.key));
  }
}
