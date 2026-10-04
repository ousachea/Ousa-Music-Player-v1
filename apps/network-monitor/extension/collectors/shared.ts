// what every platform reads the same way. node:os hands back each core's tick counters on macos, linux and
// windows alike, so cpu usage is one piece of code; nvidia-smi answers the same on windows and linux
import { cpus } from 'node:os';

import type { GpuInfo } from '../../src/protocol/types';
import { round } from '../run';

export type Ticks = { idle: number; total: number };

export function readTicks(): Ticks[] {
  return cpus().map(c => {
    const t = c.times;
    return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq };
  });
}

export function busy(prev: Ticks, now: Ticks) {
  const total = now.total - prev.total;
  return total > 0 ? Math.min(100, Math.max(0, (1 - (now.idle - prev.idle) / total) * 100)) : 0;
}

const sum = (list: Ticks[]) => list.reduce((a, t) => ({ idle: a.idle + t.idle, total: a.total + t.total }), { idle: 0, total: 0 });

/** usage since the last call, overall and per core */
export function cpuMeter() {
  let last = readTicks();
  return () => {
    const now = readTicks();
    const perCore = now.map((t, i) => (last[i] ? Math.round(busy(last[i], t)) : 0));
    const usage = round(busy(sum(last), sum(now)));
    last = now;
    return { usage, perCoreUsage: perCore };
  };
}

/** turns ever-growing byte counters into a rate; a counter that went backwards (a reset, a new interface) is skipped */
export function rateMeter() {
  let last: { at: number; values: number[] } | null = null;
  return (values: number[], at = Date.now()): number[] | null => {
    const prev = last;
    last = { at, values };
    if (!prev || at <= prev.at || values.length !== prev.values.length) return null;
    if (values.some((v, i) => v < prev.values[i])) return null;
    const secs = (at - prev.at) / 1000;
    return values.map((v, i) => (v - prev.values[i]) / secs);
  };
}

export const mbps = (bytesPerSec: number) => round((bytesPerSec * 8) / 1e6, 2);

/** -30 dBm is as strong as wi-fi gets and -90 is as weak as it still works */
export const rssiPercent = (dbm: number) => Math.round(Math.min(100, Math.max(0, ((dbm + 90) / 60) * 100)));

export const NVIDIA_QUERY = 'name,utilization.gpu,temperature.gpu,memory.used,memory.total,clocks.gr,power.draw,fan.speed';

/** one line of `nvidia-smi --query-gpu=<NVIDIA_QUERY> --format=csv,noheader,nounits`; "[N/A]" fields are left out */
export function parseNvidiaSmi(text: string): GpuInfo | null {
  const line = text.split(/\r?\n/).find(l => l.trim());
  if (!line) return null;
  const f = line.split(',').map(s => s.trim());
  if (f.length < 8 || !f[0]) return null;
  const n = (s: string) => {
    const v = Number.parseFloat(s);
    return Number.isFinite(v) ? v : undefined;
  };
  const mib = (s: string) => {
    const v = n(s);
    return v === undefined ? undefined : round(v / 1024);
  };
  const gpu: GpuInfo = {
    name: f[0],
    usage: n(f[1]),
    temperature: n(f[2]),
    memoryUsed: mib(f[3]),
    memoryTotal: mib(f[4]),
    frequency: n(f[5]),
    power: n(f[6]) === undefined ? undefined : Math.round(n(f[6])!),
    fan: n(f[7]),
  };
  for (const k of Object.keys(gpu) as (keyof GpuInfo)[]) if (gpu[k] === undefined) delete gpu[k];
  return gpu;
}
