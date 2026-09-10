// one place decides what a picture costs: the cache first, the phone second, and never more than a
// few requests at once, because the tunnel is shared with whatever else the device is doing
import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

import * as cache from './cache';
import * as demo from './demo';
import { image, isDemo, type Conn, type Size } from './immich';

const CONCURRENCY = 4;

type Job = { key: string; run: () => Promise<void> };

class Queue {
  private waiting: Job[] = [];
  private live = 0;

  push(job: Job, front = false) {
    if (front) this.waiting.unshift(job);
    else this.waiting.push(job);
    this.pump();
  }

  private pump() {
    while (this.live < CONCURRENCY) {
      const job = this.waiting.shift();
      if (!job) return;
      this.live++;
      job.run().finally(() => {
        this.live--;
        this.pump();
      });
    }
  }
}

const queue = new Queue();
const urls = new Map<string, string>();
const asked = new Set<string>();

export function held(id: string, size: Size): string | null {
  return urls.get(cache.keyFor(id, size)) ?? null;
}

export function want(
  client: BridgethingClient,
  conn: Conn,
  id: string,
  size: Size,
  onReady: () => void,
  urgent = false,
) {
  const key = cache.keyFor(id, size);
  if (urls.has(key) || asked.has(key)) return;
  asked.add(key);
  queue.push(
    {
      key,
      run: async () => {
        const cached = await cache.read(key);
        if (cached) {
          urls.set(key, URL.createObjectURL(cached));
          asked.delete(key);
          onReady();
          return;
        }
        if (isDemo(conn)) {
          const drawn = await demo.picture(id, size);
          await cache.write(key, drawn);
          urls.set(key, URL.createObjectURL(drawn));
          asked.delete(key);
          onReady();
          return;
        }
        const got = await image(client, conn, id, size);
        if (!got.ok) {
          asked.delete(key);
          return;
        }
        const blob = new Blob([new Uint8Array(got.value)], { type: 'image/jpeg' });
        await cache.write(key, blob);
        urls.set(key, URL.createObjectURL(blob));
        asked.delete(key);
        onReady();
      },
    },
    urgent,
  );
}

/** long runs would otherwise hold every object url they ever made */
export function trim(keep: number) {
  if (urls.size <= keep) return;
  const spare = urls.size - keep;
  let n = 0;
  for (const [key, url] of urls) {
    if (n++ >= spare) break;
    URL.revokeObjectURL(url);
    urls.delete(key);
  }
}

export function forget() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  asked.clear();
}

/** a component asks for a picture and rerenders when it lands */
export function usePicture(client: BridgethingClient, conn: Conn, id: string | null, size: Size, on = true) {
  const [, bump] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ready = useCallback(() => mounted.current && bump(n => n + 1), []);
  useEffect(() => {
    if (!on || !id) return;
    want(client, conn, id, size, ready);
  }, [client, conn, id, size, on, ready]);
  return id ? held(id, size) : null;
}
