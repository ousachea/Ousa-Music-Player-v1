// the daemon proxies http and reports the link kind, but exposes no interface counters, so throughput
// has to be measured by timing real transfers. anything that needs counters is marked unavailable
// rather than guessed at; see EXTENSION_CAPABILITY below for what would supply it.
import type { BridgethingClient } from '@bridgething/client';

export type LinkStatus = 'connected' | 'degraded' | 'offline' | 'unknown';

export type Sample = {
  at: number;
  /** kilobits per second, or null when nothing measured it */
  downKbps: number | null;
  upKbps: number | null;
  pingMs: number | null;
};

export type NetState = {
  status: LinkStatus;
  pingMs: number | null;
  downKbps: number | null;
  upKbps: number | null;
  kind: string | null;
  metered: boolean | null;
  publicIp: string | null;
  localIp: string | null;
  /** ms the link has been up as observed by this app, not by the interface */
  observedUpMs: number | null;
  history: Sample[];
};

export type Unavailable = { field: string; reason: string };

// what a desktop extension would have to expose for the fields this app cannot measure
export const EXTENSION_CAPABILITY = {
  name: 'net.interface',
  needs: [
    'rx_bytes and tx_bytes per interface, sampled on a timer, for true throughput without generating traffic',
    'the active interface name, its local address, and its link speed',
    'the timestamp the link last came up, for real uptime rather than observed uptime',
  ],
  hostPermissions: ['read network interface statistics'],
} as const;

const PING_URL = 'https://cloudflare.com/cdn-cgi/trace';
// a fixed, cache-busted payload whose size we know; small enough not to cost much on a metered link
const THROUGHPUT_URL = 'https://speed.cloudflare.com/__down?bytes=';
const PING_TIMEOUT_MS = 4000;
const THROUGHPUT_TIMEOUT_MS = 12000;

const DEGRADED_PING_MS = 250;

export type ProbeOptions = {
  pingEveryMs: number;
  /** 0 disables throughput sampling entirely, which is the right default on a metered link */
  throughputEveryMs: number;
  throughputBytes: number;
  historyMs: number;
};

async function timedFetch(client: BridgethingClient, url: string, timeoutMs: number) {
  const started = performance.now();
  const reply = await client.net.fetch(
    { request: { url, method: 'GET', headers: [], timeoutMs, redirect: 'follow' } },
    { timeoutMs: timeoutMs + 2000 },
  );
  const elapsed = performance.now() - started;
  if (!reply.ok) throw new Error('no answer from the daemon');
  const { status, body } = reply.response.response;
  if (status !== 200) throw new Error(`http ${status}`);
  return { elapsed, bytes: new Uint8Array(body as unknown as number[]) };
}

/** cloudflare's trace endpoint answers with key=value lines, one of which is the caller's address */
function ipFromTrace(text: string): string | null {
  return text.split('\n').find(l => l.startsWith('ip='))?.slice(3).trim() || null;
}

export function createProbe(client: BridgethingClient, options: ProbeOptions) {
  let stopped = false;
  let upSince: number | null = null;
  let history: Sample[] = [];
  let lastDown: number | null = null;
  let publicIp: string | null = null;
  let pingTimer: ReturnType<typeof setTimeout> | null = null;
  let downTimer: ReturnType<typeof setTimeout> | null = null;

  const push = (sample: Sample) => {
    history = [...history, sample].filter(s => sample.at - s.at <= options.historyMs);
  };

  const run = (emit: (state: Partial<NetState>) => void) => {
    const ping = async () => {
      if (stopped) return;
      try {
        const { elapsed, bytes } = await timedFetch(client, PING_URL, PING_TIMEOUT_MS);
        if (stopped) return;
        const pingMs = Math.round(elapsed);
        if (upSince === null) upSince = Date.now();
        if (!publicIp) publicIp = ipFromTrace(new TextDecoder().decode(bytes));
        push({ at: Date.now(), downKbps: lastDown, upKbps: null, pingMs });
        emit({
          status: pingMs > DEGRADED_PING_MS ? 'degraded' : 'connected',
          pingMs,
          publicIp,
          observedUpMs: upSince === null ? null : Date.now() - upSince,
          history,
        });
      } catch {
        if (stopped) return;
        upSince = null;
        push({ at: Date.now(), downKbps: null, upKbps: null, pingMs: null });
        emit({ status: 'offline', pingMs: null, observedUpMs: null, history });
      }
      pingTimer = setTimeout(ping, options.pingEveryMs);
    };

    const throughput = async () => {
      if (stopped || options.throughputEveryMs <= 0) return;
      try {
        const { elapsed, bytes } = await timedFetch(
          client,
          `${THROUGHPUT_URL}${options.throughputBytes}&r=${Math.random()}`,
          THROUGHPUT_TIMEOUT_MS,
        );
        if (stopped) return;
        // the proxy hop is included, so this is what the app can actually pull, not the link's ceiling
        lastDown = elapsed > 0 ? Math.round((bytes.length * 8) / elapsed) : null;
        emit({ downKbps: lastDown });
      } catch {
        if (stopped) return;
        lastDown = null;
        emit({ downKbps: null });
      }
      downTimer = setTimeout(throughput, options.throughputEveryMs);
    };

    void ping();
    void throughput();
  };

  return {
    start(emit: (state: Partial<NetState>) => void) {
      run(emit);
    },
    stop() {
      stopped = true;
      if (pingTimer) clearTimeout(pingTimer);
      if (downTimer) clearTimeout(downTimer);
    },
  };
}

export function unavailableFields(hasExtension: boolean): Unavailable[] {
  if (hasExtension) return [];
  return [
    { field: 'Upload', reason: 'needs interface counters' },
    { field: 'Local IP', reason: 'needs interface counters' },
  ];
}
