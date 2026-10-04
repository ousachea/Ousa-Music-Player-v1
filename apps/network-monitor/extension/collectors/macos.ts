// macos without root: cpu from the kernel's tick counters, memory the way activity monitor counts it, gpu load from
// the accelerator's own statistics, throughput from interface byte counters, and the slow facts from
// system_profiler. temperatures need root or private interfaces, so they are left out rather than guessed
import { cpus } from 'node:os';

import type { DeviceCapabilities, DisplayInfo, ProcessInfo, StorageDevice } from '../../src/protocol/types';
import { GB, after, round, run, runJson } from '../run';
import type { Collector, Section } from './collector';
import { cpuMeter, rssiPercent } from './shared';

const BIN = {
  vmStat: '/usr/bin/vm_stat',
  sysctl: '/usr/sbin/sysctl',
  ioreg: '/usr/sbin/ioreg',
  netstat: '/usr/sbin/netstat',
  ps: '/bin/ps',
  pmset: '/usr/bin/pmset',
  df: '/bin/df',
  ping: '/sbin/ping',
  route: '/sbin/route',
  profiler: '/usr/sbin/system_profiler',
  swVers: '/usr/bin/sw_vers',
  scutil: '/usr/sbin/scutil',
  ifconfig: '/sbin/ifconfig',
  networksetup: '/usr/sbin/networksetup',
} as const;

const PING_HOST = '1.1.1.1';
const PROCESS_COUNT = 25;

/** activity monitor's split: app memory, wired and compressed are used; file-backed and purgeable are cache */
function memory(text: string, totalBytes: number) {
  const page = after(text, 'page size of') ?? 16384;
  const pages = (label: string) => (after(text, label) ?? 0) * page;
  const app = pages('Anonymous pages:') - pages('Pages purgeable:');
  const used = app + pages('Pages wired down:') + pages('Pages occupied by compressor:');
  const cached = pages('File-backed pages:') + pages('Pages purgeable:');
  return { used: used / GB, cached: cached / GB, available: (totalBytes - used) / GB, usage: (used / totalBytes) * 100 };
}

/** "total = 4096.00M  used = 2655.94M ..." */
function swap(text: string) {
  const mb = (label: string) => {
    const m = new RegExp(`${label} = ([\\d.]+)([MG])`).exec(text);
    if (!m) return undefined;
    return Number(m[1]) / (m[2] === 'G' ? 1 : 1024);
  };
  return { swapTotal: mb('total'), swapUsed: mb('used') };
}

function ioregNumber(text: string, key: string) {
  const m = new RegExp(`"${key.replace(/[()%]/g, c => `\\${c}`)}"=(\\d+)`).exec(text);
  return m ? Number(m[1]) : undefined;
}

type Profiler<K extends string, T> = Record<K, T[]>;

export function macosCollector(): Collector {
  const cpu = cpuMeter();
  let lastNet: { at: number; rx: number; tx: number } | null = null;
  let lastDisk: { at: number; read: number; write: number } | null = null;
  let iface: string | null = null;
  let totalBytes = 0;
  let internalModel: string | undefined;
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

  async function defaultInterface() {
    const out = await run(BIN.route, ['-n', 'get', 'default']);
    const m = out && /interface:\s*(\S+)/.exec(out);
    iface = m ? m[1] : null;
  }

  return {
    capabilities: () => caps,

    async fast() {
      const now = Date.now();
      const { usage, perCoreUsage } = cpu();

      const [vm, swapText, gpuText, netText] = await Promise.all([
        run(BIN.vmStat, []),
        run(BIN.sysctl, ['-n', 'vm.swapusage']),
        run(BIN.ioreg, ['-r', '-d', '1', '-w0', '-c', 'IOAccelerator']),
        iface ? run(BIN.netstat, ['-ibn', '-I', iface]) : Promise.resolve(null),
      ]);

      const section: Section = {
        cpu: { usage, perCoreUsage, load: Deno.loadavg().map(v => round(v, 2)) },
        system: { uptime: Math.round(Deno.osUptime()) },
      };
      // apple silicon answers with one fixed nominal figure whatever the cores are doing, which would read as a
      // live clock, so only an intel mac's speed is passed on
      const speed = cpus()[0]?.speed ?? 0;
      if (Deno.build.arch === 'x86_64' && speed > 100 && section.cpu) section.cpu.frequency = speed;

      if (vm && totalBytes > 0) {
        const m = memory(vm, totalBytes);
        section.memory = { total: round(totalBytes / GB), used: round(m.used), available: round(m.available), cached: round(m.cached), usage: round(m.usage), ...(swapText ? swap(swapText) : {}) };
      }

      const gpuUse = gpuText ? ioregNumber(gpuText, 'Device Utilization %') : undefined;
      if (gpuUse !== undefined) {
        const inUse = ioregNumber(gpuText!, 'In use system memory');
        section.gpu = { usage: gpuUse, ...(inUse !== undefined ? { memoryUsed: round(inUse / GB) } : {}) };
      }

      // the first row for the interface is its link-level counters: name mtu network address ipkts ierrs ibytes ...
      const row = netText?.split('\n').find(l => l.startsWith(`${iface} `) && l.includes('<Link#'));
      if (row) {
        const cols = row.trim().split(/\s+/);
        const rx = Number(cols[6]);
        const tx = Number(cols[9]);
        if (lastNet && now > lastNet.at && rx >= lastNet.rx && tx >= lastNet.tx) {
          const secs = (now - lastNet.at) / 1000;
          section.network = { download: round(((rx - lastNet.rx) * 8) / secs / 1e6, 2), upload: round(((tx - lastNet.tx) * 8) / secs / 1e6, 2), connected: true };
        }
        lastNet = { at: now, rx, tx };
      }
      return section;
    },

    async medium() {
      await defaultInterface();
      const now = Date.now();
      const [psText, batt, dfText, pingText, diskText] = await Promise.all([
        run(BIN.ps, ['-Aceo', 'pid=,pcpu=,rss=,comm=', '-r']),
        run(BIN.pmset, ['-g', 'batt']),
        run(BIN.df, ['-k', '-P']),
        run(BIN.ping, ['-c', '1', '-t', '2', PING_HOST], 4000),
        run(BIN.ioreg, ['-c', 'IOBlockStorageDriver', '-r', '-w0', '-d', '1']),
      ]);
      const section: Section = {};

      if (psText) {
        const procs: ProcessInfo[] = [];
        for (const line of psText.split('\n')) {
          const m = /^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/.exec(line);
          if (m) procs.push({ pid: Number(m[1]), cpu: Number(m[2]), memory: round(Number(m[3]) / 1024 / 1024, 2), name: m[4].trim() });
          if (procs.length >= PROCESS_COUNT) break;
        }
        section.processes = procs;
      }

      // "-InternalBattery-0 (id=...)	42%; charging; (no estimate) present: true"
      const battery = batt && /(\d+)%;\s*([a-z ]+);/i.exec(batt);
      if (battery) {
        section.battery = { percentage: Number(battery[1]), charging: battery[2].trim() === 'charging' || batt!.includes("'AC Power'") };
        caps = { ...caps, battery: true };
      }

      if (dfText) {
        const drives: StorageDevice[] = [];
        let read: number | undefined;
        let write: number | undefined;
        if (diskText) {
          const sum = (key: string) => [...diskText.matchAll(new RegExp(`"Bytes \\(${key}\\)"=(\\d+)`, 'g'))].reduce((a, m) => a + Number(m[1]), 0);
          const r = sum('Read');
          const w = sum('Write');
          if (lastDisk && now > lastDisk.at && r >= lastDisk.read && w >= lastDisk.write) {
            const secs = (now - lastDisk.at) / 1000;
            read = round((r - lastDisk.read) / secs / 1e6);
            write = round((w - lastDisk.write) / secs / 1e6);
          }
          lastDisk = { at: now, read: r, write: w };
        }
        for (const line of dfText.split('\n').slice(1)) {
          const cols = line.trim().split(/\s+/);
          if (cols.length < 6) continue;
          const mount = cols.slice(5).join(' ');
          const isData = mount === '/System/Volumes/Data';
          const isExternal = mount.startsWith('/Volumes/') && !mount.includes('TimeMachine');
          if (!isData && !isExternal) continue;
          const total = Number(cols[1]) / 1024 / 1024;
          const free = Number(cols[3]) / 1024 / 1024;
          // apfs volumes share a container, so used is the container's: everything that is not free
          const used = total - free;
          drives.push({
            id: cols[0],
            name: isData ? 'Macintosh HD' : mount.slice('/Volumes/'.length),
            ...(isData && internalModel ? { model: internalModel } : {}),
            total: round(total),
            used: round(used),
            free: round(free),
            usage: round((used / total) * 100),
            // the block counters are for the internal drive; an external one gets its own figures later
            ...(isData && read !== undefined ? { readSpeed: read, writeSpeed: write } : {}),
          });
        }
        section.storage = drives;
      }

      const ping = pingText ? /time=([\d.]+)/.exec(pingText) : null;
      // a default route is what being on a network means here; a ping can fail behind a firewall that drops it
      section.network = { ...(ping ? { ping: round(Number(ping[1])) } : {}), connected: iface !== null };
      return section;
    },

    async slow() {
      if (!iface) await defaultInterface();
      const [brand, physical, logical, memsize, version, computerName, ports, displays, airport, power, nvme, media] = await Promise.all([
        run(BIN.sysctl, ['-n', 'machdep.cpu.brand_string']),
        run(BIN.sysctl, ['-n', 'hw.physicalcpu']),
        run(BIN.sysctl, ['-n', 'hw.logicalcpu']),
        run(BIN.sysctl, ['-n', 'hw.memsize']),
        run(BIN.swVers, ['-productVersion']),
        run(BIN.scutil, ['--get', 'ComputerName']),
        run(BIN.networksetup, ['-listallhardwareports']),
        runJson<Profiler<'SPDisplaysDataType', { sppci_model?: string; sppci_cores?: string; spdisplays_ndrvs?: { _name?: string; _spdisplays_pixels?: string; _spdisplays_resolution?: string }[] }>>(BIN.profiler, ['SPDisplaysDataType', '-json']),
        runJson<Profiler<'SPAirPortDataType', { spairport_airport_interfaces?: { _name?: string; spairport_current_network_information?: { spairport_network_rate?: number; spairport_signal_noise?: string } }[] }>>(BIN.profiler, ['SPAirPortDataType', '-json']),
        runJson<Profiler<'SPPowerDataType', { sppower_battery_health_info?: { sppower_battery_cycle_count?: number; sppower_battery_health_maximum_capacity?: string } }>>(BIN.profiler, ['SPPowerDataType', '-json']),
        runJson<Profiler<'SPNVMeDataType', { _items?: { device_model?: string }[] }>>(BIN.profiler, ['SPNVMeDataType', '-json']),
        iface ? run(BIN.ifconfig, [iface]) : Promise.resolve(null),
      ]);

      totalBytes = Number(memsize) || totalBytes;
      const section: Section = {
        device: { name: computerName?.trim() || Deno.hostname(), version: version ? `macOS ${version.trim()}` : 'macOS', architecture: Deno.build.arch === 'aarch64' ? 'arm64' : Deno.build.arch },
        system: { hostname: Deno.hostname(), os: version ? `macOS ${version.trim()}` : 'macOS', kernel: `Darwin ${Deno.osRelease()}`, uptime: Math.round(Deno.osUptime()) },
        cpu: { name: brand?.trim() || cpus()[0]?.model, cores: Number(physical) || undefined, threads: Number(logical) || undefined },
      };

      const card = displays?.SPDisplaysDataType?.[0];
      if (card) {
        const name = card.sppci_model ? `${card.sppci_model} GPU${card.sppci_cores ? ` (${card.sppci_cores}-core)` : ''}` : undefined;
        section.gpu = { name };
        caps = { ...caps, gpu: true };
        const list: DisplayInfo[] = (card.spdisplays_ndrvs ?? []).map(d => {
          const px = /(\d+)\s*x\s*(\d+)/.exec(d._spdisplays_pixels ?? d._spdisplays_resolution ?? '');
          const hz = /@\s*([\d.]+)Hz/.exec(d._spdisplays_resolution ?? '');
          return { name: d._name, width: px ? Number(px[1]) : undefined, height: px ? Number(px[2]) : undefined, refreshRate: hz ? Math.round(Number(hz[1])) : undefined };
        });
        if (list.length) {
          section.displays = list;
          caps = { ...caps, displays: true };
        }
      }

      // the port name the user knows, "Wi-Fi" rather than en0
      const portName = ports && iface ? new RegExp(`Hardware Port: (.+)\\nDevice: ${iface}\\b`).exec(ports)?.[1] : undefined;
      const addresses = Deno.networkInterfaces().filter(n => n.name === iface);
      section.network = {
        interface: portName ? `${portName} (${iface})` : (iface ?? undefined),
        ip: addresses.find(a => a.family === 'IPv4')?.address,
        ipv6: addresses.find(a => a.family === 'IPv6' && !a.address.startsWith('fe80'))?.address,
      };
      const wifi = airport?.SPAirPortDataType?.[0]?.spairport_airport_interfaces?.find(i => i._name === iface)?.spairport_current_network_information;
      if (wifi?.spairport_network_rate) section.network.linkSpeed = wifi.spairport_network_rate;
      const rssi = wifi?.spairport_signal_noise ? /(-\d+)\s*dBm/.exec(wifi.spairport_signal_noise) : null;
      if (rssi) section.network.signal = rssiPercent(Number(rssi[1]));
      // a wired link names its speed in ifconfig's media line, "1000baseT"
      const wired = media ? /media:.*?(\d+)base/.exec(media) : null;
      if (!section.network.linkSpeed && wired) section.network.linkSpeed = Number(wired[1]);

      const health = power?.SPPowerDataType?.find(p => p.sppower_battery_health_info)?.sppower_battery_health_info;
      if (health) {
        section.battery = {
          cycleCount: health.sppower_battery_cycle_count,
          health: health.sppower_battery_health_maximum_capacity ? Number.parseInt(health.sppower_battery_health_maximum_capacity, 10) : undefined,
        };
      }

      internalModel = nvme?.SPNVMeDataType?.flatMap(c => c._items ?? [])[0]?.device_model ?? internalModel;
      return section;
    },
  };
}
