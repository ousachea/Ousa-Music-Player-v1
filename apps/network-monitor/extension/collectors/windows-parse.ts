// turns the lines the powershell loop prints into telemetry sections. pure, so it can be checked against sample lines
import type { DisplayInfo, ProcessInfo, StorageDevice } from '../../src/protocol/types';
import { round } from '../run';
import type { Section } from './collector';
import { parseNvidiaSmi } from './shared';

const GB = 1024 ** 3;

/** powershell 5 writes a one-element array as the bare object, so every list is read either way */
function many<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  return v && typeof v === 'object' ? [v as T] : [];
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export type PsLine = {
  tick: number;
  fast: { rx?: number; tx?: number; cpuPerf?: number; nvidia?: string };
  medium?: {
    processes?: unknown;
    disks?: unknown;
    readBps?: number;
    writeBps?: number;
    battery?: { percent?: number; status?: number };
    cachedBytes?: number;
    ping?: number;
    wlan?: string;
    gpuUsage?: number;
  };
  slow?: {
    os?: string;
    version?: string;
    build?: string;
    cpu?: { name?: string; cores?: number; threads?: number; maxMhz?: number };
    gpus?: unknown;
    adapter?: { name?: string; description?: string; bps?: number; media?: string };
    ips?: unknown;
    models?: Record<string, string>;
    batteryHealth?: number;
    batteryCycles?: number;
  };
};

export function parseLine(text: string): PsLine | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && typeof v.tick === 'number' && v.fast && typeof v.fast === 'object' ? (v as PsLine) : null;
  } catch {
    return null;
  }
}

/** the fast part that is not a rate: the live clock (base speed times how hard the cores are pushed) and an nvidia card */
export function mapFast(fast: PsLine['fast'], maxMhz: number | undefined): Section {
  const section: Section = {};
  const perf = num(fast.cpuPerf);
  if (perf !== undefined && maxMhz) section.cpu = { frequency: Math.round((maxMhz * perf) / 100) };
  const gpu = str(fast.nvidia) ? parseNvidiaSmi(fast.nvidia!) : null;
  if (gpu) section.gpu = gpu;
  return section;
}

/** netsh's labels are translated, but the signal is the only percentage it prints */
export function wlanSignal(text: string): number | undefined {
  const m = /:\s*(\d{1,3})\s*%/.exec(text);
  return m ? Math.min(100, Number(m[1])) : undefined;
}

/** a link rate in netsh is the first "(Mbps)" line; used when the adapter itself does not report a speed */
export function wlanRate(text: string): number | undefined {
  const m = /\(Mbps\)\s*:\s*([\d.]+)/.exec(text);
  return m ? Number(m[1]) : undefined;
}

/** "chrome#3" is the third chrome in the performance counters; the name people know is "chrome" */
const processName = (name: string) => name.replace(/#\d+$/, '');

export function mapMedium(m: NonNullable<PsLine['medium']>, models: Record<string, string>): Section {
  const section: Section = {};

  const procs = many<{ name?: unknown; pid?: unknown; cpu?: unknown; bytes?: unknown }>(m.processes)
    .map((p): ProcessInfo | null => {
      const name = str(p.name);
      if (!name) return null;
      // the counter is already per core summed, as task manager's details tab and top both count it
      return { name: processName(name), pid: num(p.pid), cpu: num(p.cpu), memory: num(p.bytes) === undefined ? undefined : round(num(p.bytes)! / GB, 2) };
    })
    .filter((p): p is ProcessInfo => p !== null);
  if (procs.length) section.processes = procs;

  const drives = many<{ id?: unknown; label?: unknown; size?: unknown; free?: unknown }>(m.disks)
    .map((d): StorageDevice | null => {
      const id = str(d.id);
      const size = num(d.size);
      const free = num(d.free);
      if (!id || !size || free === undefined) return null;
      const label = str(d.label);
      return {
        id,
        name: label ? `${label} (${id})` : `Local Disk (${id})`,
        ...(models[id] ? { model: models[id] } : {}),
        total: round(size / GB),
        used: round((size - free) / GB),
        free: round(free / GB),
        usage: round(((size - free) / size) * 100),
      };
    })
    .filter((d): d is StorageDevice => d !== null);
  // the io counter is for all disks together, so it is shown on the system drive rather than spread across them
  const system = drives.find(d => d.id === 'C:') ?? drives[0];
  if (system && num(m.readBps) !== undefined) {
    system.readSpeed = round(num(m.readBps)! / 1e6);
    system.writeSpeed = round((num(m.writeBps) ?? 0) / 1e6);
  }
  if (drives.length) section.storage = drives;

  const pct = num(m.battery?.percent);
  if (pct !== undefined) {
    // BatteryStatus: 1 discharging, 2 on mains, 6-9 charging, 3 fully charged
    const status = num(m.battery?.status);
    section.battery = { percentage: pct, charging: status !== undefined && status !== 1 && status !== 4 && status !== 5 };
  }

  const ping = num(m.ping);
  const signal = str(m.wlan) ? wlanSignal(m.wlan!) : undefined;
  section.network = {
    ...(ping !== undefined ? { ping } : {}),
    ...(signal !== undefined ? { signal } : {}),
  };

  const gpuUsage = num(m.gpuUsage);
  if (gpuUsage !== undefined) section.gpu = { usage: Math.min(100, Math.round(gpuUsage)) };
  return section;
}

export function mapSlow(s: NonNullable<PsLine['slow']>): Section {
  const section: Section = {};
  const os = str(s.os);
  const version = os ? `${os.replace(/^Microsoft\s+/, '')}${s.build ? ` (build ${s.build})` : ''}` : undefined;
  section.device = { ...(version ? { version } : {}) };
  section.system = { ...(os ? { os: os.replace(/^Microsoft\s+/, '') } : {}), ...(str(s.version) ? { kernel: `NT ${s.version}` } : {}) };
  if (s.cpu) section.cpu = { name: str(s.cpu.name), cores: num(s.cpu.cores), threads: num(s.cpu.threads) };

  const gpus = many<{ name?: unknown; width?: unknown; height?: unknown; hz?: unknown }>(s.gpus);
  // the first real adapter, past the basic display driver and remote desktop's
  const real = gpus.find(g => str(g.name) && !/basic display|remote|virtual/i.test(String(g.name)));
  if (real) section.gpu = { name: str(real.name) };
  const displays: DisplayInfo[] = gpus
    .filter(g => num(g.width))
    .map(g => ({ name: str(g.name), width: num(g.width), height: num(g.height), refreshRate: num(g.hz) }));
  if (displays.length) section.displays = displays;

  const ips = many<{ address?: unknown; family?: unknown }>(s.ips);
  const v4 = ips.find(i => String(i.family).includes('IPv4') || String(i.family) === '2');
  const v6 = ips.find(i => (String(i.family).includes('IPv6') || String(i.family) === '23') && !String(i.address).startsWith('fe80'));
  const bps = num(s.adapter?.bps);
  const wifi = /802\.11|wireless|wi-?fi/i.test(`${s.adapter?.media ?? ''} ${s.adapter?.description ?? ''}`);
  section.network = {
    ...(str(s.adapter?.name) ? { interface: `${wifi ? 'Wi-Fi' : 'Ethernet'} (${str(s.adapter?.name)})` } : {}),
    ...(str(v4?.address) ? { ip: str(v4?.address) } : {}),
    ...(str(v6?.address) ? { ipv6: str(v6?.address) } : {}),
    ...(bps ? { linkSpeed: Math.round(bps / 1e6) } : {}),
  };

  if (num(s.batteryHealth) !== undefined || num(s.batteryCycles) !== undefined) {
    section.battery = {
      ...(num(s.batteryHealth) !== undefined ? { health: Math.min(100, num(s.batteryHealth)!) } : {}),
      ...(num(s.batteryCycles) !== undefined ? { cycleCount: num(s.batteryCycles) } : {}),
    };
  }
  return section;
}

