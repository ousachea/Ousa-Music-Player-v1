// linux keeps nearly everything readable under /proc and /sys without root, temperatures included, so the
// collector mostly reads files. only drive sizes, ping and an nvidia gpu need a program run
import { cpus } from 'node:os';

import type { DeviceCapabilities, GpuInfo, ProcessInfo, StorageDevice } from '../../src/protocol/types';
import { round, run } from '../run';
import type { Collector, Section } from './collector';
import {
  CPU_SENSORS,
  parentDisk,
  parseCpuinfo,
  parseDefaultRoute,
  parseDf,
  parseDiskstats,
  parseMeminfo,
  parseMounts,
  parseOsRelease,
  parsePidStat,
  parsePing,
  parseTotalJiffies,
  parseWireless,
} from './linux-parse';
import { NVIDIA_QUERY, cpuMeter, mbps, parseNvidiaSmi, rateMeter, rssiPercent } from './shared';

const PING_HOST = '1.1.1.1';
const PROCESS_COUNT = 25;
const PAGE_BYTES = 4096;
const GB = 1024 ** 3;

async function read(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

async function readNumber(path: string): Promise<number | undefined> {
  const text = await read(path);
  const v = text === null ? NaN : Number(text.trim());
  return Number.isFinite(v) ? v : undefined;
}

async function list(path: string): Promise<string[]> {
  const out: string[] = [];
  try {
    for await (const entry of Deno.readDir(path)) out.push(entry.name);
  } catch {
    // a directory this kernel does not have is simply empty
  }
  return out.sort();
}

/** hwmon directories by driver name, so a sensor is found by what it is rather than where it was numbered */
async function hwmons(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const dir of await list('/sys/class/hwmon')) {
    const name = (await read(`/sys/class/hwmon/${dir}/name`))?.trim();
    if (name && !out.has(name)) out.set(name, `/sys/class/hwmon/${dir}`);
  }
  return out;
}

type AmdGpu = { base: string; hwmon: string | null };

export function linuxCollector(): Collector {
  const cpu = cpuMeter();
  const net = rateMeter();
  const disk = rateMeter();
  let iface: string | null = null;
  let sensors = new Map<string, string>();
  let nvidia = false;
  let amd: AmdGpu | null = null;
  let rootDisk: string | null = null;
  let lastProcs = new Map<number, number>();
  let lastJiffies: number | null = null;
  let caps: DeviceCapabilities = {
    cpu: true,
    cpuTemperature: false,
    gpu: false,
    gpuTemperature: false,
    memory: true,
    storage: true,
    network: true,
    battery: false,
    processes: true,
    displays: false,
  };

  async function cpuTemperature(): Promise<number | undefined> {
    for (const name of CPU_SENSORS) {
      const dir = sensors.get(name);
      if (!dir) continue;
      const milli = await readNumber(`${dir}/temp1_input`);
      if (milli !== undefined) return round(milli / 1000);
    }
    // no named sensor: the thermal zone the kernel calls the package
    for (const zone of await list('/sys/class/thermal')) {
      if (!zone.startsWith('thermal_zone')) continue;
      const type = (await read(`/sys/class/thermal/${zone}/type`))?.trim() ?? '';
      if (!/x86_pkg_temp|cpu|soc/i.test(type)) continue;
      const milli = await readNumber(`/sys/class/thermal/${zone}/temp`);
      if (milli !== undefined) return round(milli / 1000);
    }
    return undefined;
  }

  async function gpu(): Promise<GpuInfo | null> {
    if (nvidia) return parseNvidiaSmi((await run('nvidia-smi', [`--query-gpu=${NVIDIA_QUERY}`, '--format=csv,noheader,nounits'])) ?? '');
    if (!amd) return null;
    const usage = await readNumber(`${amd.base}/gpu_busy_percent`);
    const used = await readNumber(`${amd.base}/mem_info_vram_used`);
    const total = await readNumber(`${amd.base}/mem_info_vram_total`);
    const temp = amd.hwmon ? await readNumber(`${amd.hwmon}/temp1_input`) : undefined;
    const power = amd.hwmon ? await readNumber(`${amd.hwmon}/power1_average`) : undefined;
    return {
      ...(usage !== undefined ? { usage } : {}),
      ...(used !== undefined ? { memoryUsed: round(used / GB) } : {}),
      ...(total !== undefined ? { memoryTotal: round(total / GB) } : {}),
      ...(temp !== undefined ? { temperature: round(temp / 1000) } : {}),
      // microwatts
      ...(power !== undefined ? { power: Math.round(power / 1e6) } : {}),
    };
  }

  return {
    capabilities: () => caps,

    async fast() {
      const [mem, loadavg, info, rx, tx, temp, card] = await Promise.all([
        read('/proc/meminfo'),
        read('/proc/loadavg'),
        read('/proc/cpuinfo'),
        iface ? readNumber(`/sys/class/net/${iface}/statistics/rx_bytes`) : Promise.resolve(undefined),
        iface ? readNumber(`/sys/class/net/${iface}/statistics/tx_bytes`) : Promise.resolve(undefined),
        cpuTemperature(),
        gpu(),
      ]);
      const { usage, perCoreUsage } = cpu();
      const section: Section = {
        cpu: {
          usage,
          perCoreUsage,
          ...(loadavg ? { load: loadavg.split(' ').slice(0, 3).map(v => round(Number(v), 2)) } : {}),
          ...(temp !== undefined ? { temperature: temp } : {}),
          ...(info && parseCpuinfo(info).frequency ? { frequency: parseCpuinfo(info).frequency } : {}),
        },
        system: { uptime: Math.round(Deno.osUptime()) },
      };
      if (temp !== undefined) caps = { ...caps, cpuTemperature: true };
      const m = mem ? parseMeminfo(mem) : null;
      if (m) section.memory = m;
      if (card) section.gpu = card;
      if (rx !== undefined && tx !== undefined) {
        const rate = net([rx, tx]);
        if (rate) section.network = { download: mbps(rate[0]), upload: mbps(rate[1]), connected: true };
      }
      return section;
    },

    async medium() {
      const [routes, mounts, dfText, pingText, diskstats, stat, pids] = await Promise.all([
        read('/proc/net/route'),
        read('/proc/mounts'),
        run('df', ['-kP']),
        run('ping', ['-c', '1', '-W', '2', PING_HOST], 4000),
        read('/proc/diskstats'),
        read('/proc/stat'),
        list('/proc'),
      ]);
      iface = routes ? parseDefaultRoute(routes) : iface;
      const section: Section = {};

      // processes: each one's jiffies since the last read, against the whole machine's, scaled to one core
      const jiffies = stat ? parseTotalJiffies(stat) : null;
      const now = new Map<number, number>();
      const rows: { pid: number; name: string; delta: number; rss: number }[] = [];
      await Promise.all(
        pids
          .filter(p => /^\d+$/.test(p))
          .map(async p => {
            const s = await read(`/proc/${p}/stat`);
            const parsed = s ? parsePidStat(s) : null;
            if (!parsed) return;
            const pid = Number(p);
            now.set(pid, parsed.jiffies);
            const before = lastProcs.get(pid);
            rows.push({ pid, name: parsed.name, delta: before === undefined ? 0 : parsed.jiffies - before, rss: parsed.rssPages });
          }),
      );
      if (jiffies !== null && lastJiffies !== null && jiffies > lastJiffies) {
        const span = (jiffies - lastJiffies) / cpus().length;
        section.processes = rows
          .sort((a, b) => b.delta - a.delta || b.rss - a.rss)
          .slice(0, PROCESS_COUNT)
          .map((r): ProcessInfo => ({ name: r.name, pid: r.pid, cpu: round((r.delta / span) * 100), memory: round((r.rss * PAGE_BYTES) / GB, 2) }));
      }
      lastProcs = now;
      lastJiffies = jiffies;

      if (mounts && dfText) {
        const sizes = parseDf(dfText);
        const drives: StorageDevice[] = [];
        for (const m of parseMounts(mounts)) {
          const size = sizes.get(m.mount);
          if (!size) continue;
          const parent = parentDisk(m.device);
          const model = (await read(`/sys/block/${parent}/device/model`))?.trim();
          drives.push({
            id: m.device,
            name: m.mount === '/' ? 'System' : m.mount,
            ...(model ? { model } : {}),
            total: round(size.total),
            used: round(size.used),
            free: round(size.free),
            usage: round((size.used / size.total) * 100),
          });
          if (m.mount === '/') rootDisk = parent;
        }
        // read and write speed for the disk the system runs from, and its temperature where the drive reports one
        const io = rootDisk && diskstats ? parseDiskstats(diskstats, rootDisk) : null;
        const rate = io ? disk([io.read, io.write]) : null;
        const temp = sensors.has('nvme') ? await readNumber(`${sensors.get('nvme')}/temp1_input`) : undefined;
        const system = drives.find(d => d.name === 'System');
        if (system && rate) Object.assign(system, { readSpeed: round(rate[0] / 1e6), writeSpeed: round(rate[1] / 1e6) });
        if (system && temp !== undefined) system.temperature = round(temp / 1000);
        section.storage = drives;
      }

      const ping = pingText ? parsePing(pingText) : undefined;
      section.network = { ...(ping !== undefined ? { ping } : {}), connected: iface !== null };

      for (const bat of await list('/sys/class/power_supply')) {
        if (!bat.startsWith('BAT')) continue;
        const base = `/sys/class/power_supply/${bat}`;
        const [capacity, status, cycles, full, design, chargeFull, chargeDesign] = await Promise.all([
          readNumber(`${base}/capacity`),
          read(`${base}/status`),
          readNumber(`${base}/cycle_count`),
          readNumber(`${base}/energy_full`),
          readNumber(`${base}/energy_full_design`),
          readNumber(`${base}/charge_full`),
          readNumber(`${base}/charge_full_design`),
        ]);
        if (capacity === undefined) continue;
        const now = full ?? chargeFull;
        const was = design ?? chargeDesign;
        section.battery = {
          percentage: capacity,
          charging: /charging|full/i.test(status ?? '') && !/discharging/i.test(status ?? ''),
          ...(cycles ? { cycleCount: cycles } : {}),
          ...(now && was ? { health: Math.round(Math.min(100, (now / was) * 100)) } : {}),
        };
        caps = { ...caps, battery: true };
        break;
      }
      return section;
    },

    async slow() {
      sensors = await hwmons();
      const [osRelease, info, routes, wireless, nvidiaText, cards] = await Promise.all([
        read('/etc/os-release'),
        read('/proc/cpuinfo'),
        read('/proc/net/route'),
        read('/proc/net/wireless'),
        run('nvidia-smi', [`--query-gpu=${NVIDIA_QUERY}`, '--format=csv,noheader,nounits']),
        list('/sys/class/drm'),
      ]);
      iface = routes ? parseDefaultRoute(routes) : iface;
      const os = osRelease ? parseOsRelease(osRelease) : undefined;
      const cpuInfo = info ? parseCpuinfo(info) : { model: undefined, cores: undefined };
      const section: Section = {
        device: { name: Deno.hostname(), version: os ?? 'Linux', architecture: Deno.build.arch === 'x86_64' ? 'x64' : Deno.build.arch === 'aarch64' ? 'arm64' : Deno.build.arch },
        system: { hostname: Deno.hostname(), os: os ?? 'Linux', kernel: Deno.osRelease(), uptime: Math.round(Deno.osUptime()) },
        cpu: { name: cpuInfo.model ?? cpus()[0]?.model, cores: cpuInfo.cores, threads: cpus().length },
      };

      // the gpu: nvidia through its own tool, an amd card through the files amdgpu publishes
      const nv = nvidiaText ? parseNvidiaSmi(nvidiaText) : null;
      nvidia = !!nv;
      amd = null;
      if (!nvidia) {
        for (const card of cards.filter(c => /^card\d+$/.test(c))) {
          const base = `/sys/class/drm/${card}/device`;
          if ((await readNumber(`${base}/gpu_busy_percent`)) === undefined) continue;
          const mons = await list(`${base}/hwmon`);
          amd = { base, hwmon: mons[0] ? `${base}/hwmon/${mons[0]}` : null };
          break;
        }
      }
      if (nv) section.gpu = { name: nv.name };
      else if (amd) section.gpu = { name: 'AMD Radeon GPU' };
      caps = { ...caps, gpu: nvidia || !!amd, gpuTemperature: nvidia || !!amd?.hwmon };

      if (iface) {
        const addresses = Deno.networkInterfaces().filter(n => n.name === iface);
        const speed = await readNumber(`/sys/class/net/${iface}/speed`);
        const level = wireless ? parseWireless(wireless, iface) : undefined;
        const wifi = level !== undefined || iface.startsWith('wl');
        section.network = {
          interface: `${wifi ? 'Wi-Fi' : 'Ethernet'} (${iface})`,
          ip: addresses.find(a => a.family === 'IPv4')?.address,
          ipv6: addresses.find(a => a.family === 'IPv6' && !a.address.startsWith('fe80'))?.address,
          // a wireless driver answers -1 here; only a wired link knows its speed this way
          ...(speed !== undefined && speed > 0 ? { linkSpeed: speed } : {}),
          ...(level !== undefined ? { signal: rssiPercent(level) } : {}),
        };
      }
      return section;
    },
  };
}
