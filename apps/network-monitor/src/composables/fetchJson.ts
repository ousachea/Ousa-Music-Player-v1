// json from the web through the phone, the only route the car thing has out
import type { BridgethingClient } from '@bridgething/client';

export async function fetchJson<T>(client: BridgethingClient, url: string, timeoutMs = 10_000): Promise<T | null> {
  try {
    const reply = await client.net.fetch(
      { request: { url, method: 'GET', headers: [], timeoutMs, redirect: 'follow' } },
      { timeoutMs: timeoutMs + 2000 },
    );
    if (!reply.ok || reply.response.response.status !== 200) return null;
    const bytes = new Uint8Array(reply.response.response.body as unknown as number[]);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}
