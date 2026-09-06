// the store listing this app publishes from, so the device can tell whether it is behind
import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useState } from 'react';

const CATALOG_URL = 'https://ousachea.github.io/Ousa-Music-Player-v1/catalog.v1.json';
const APP_ID = '01a07715-9963-72b3-9c4e-edcc6f6ebb6f';
const TIMEOUT_MS = 9000;

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current'; version: string }
  | { kind: 'behind'; installed: string; latest: string }
  | { kind: 'failed'; reason: string };

function compare(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// the running version comes from the bundle's own manifest, so it cannot drift from what is installed
async function installedVersion(): Promise<string> {
  const res = await fetch('manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  return (await res.json()).version as string;
}

export function useUpdateCheck(client: BridgethingClient) {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });

  const check = useCallback(async () => {
    setState({ kind: 'checking' });
    try {
      const installed = await installedVersion();
      const reply = await client.net.fetch(
        {
          request: {
            url: CATALOG_URL,
            method: 'GET',
            headers: [{ name: 'accept', value: 'application/json' }],
            timeoutMs: TIMEOUT_MS,
            redirect: 'follow',
          },
        },
        { timeoutMs: TIMEOUT_MS + 2000 },
      );
      if (!reply.ok) throw new Error('no answer from the daemon');
      const { status, body } = reply.response.response;
      if (status !== 200) throw new Error(`catalog ${status}`);

      const catalog = JSON.parse(new TextDecoder().decode(new Uint8Array(body as unknown as number[])));
      const app = catalog.apps?.find((a: { id: string }) => a.id === APP_ID);
      const latest = app?.versions?.[0]?.version as string | undefined;
      if (!latest) throw new Error('app not in the catalog');

      setState(compare(installed, latest) < 0 ? { kind: 'behind', installed, latest } : { kind: 'current', version: installed });
    } catch (err) {
      setState({ kind: 'failed', reason: err instanceof Error ? err.message : String(err) });
    }
  }, [client]);

  return { state, check };
}
