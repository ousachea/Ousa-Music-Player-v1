// four pretend machines speaking the real protocol, so every screen can be built and checked with no agent running.
// each reads only what its platform could: the windows box has no load average, the mac no temperatures, the
// phone no cpu or processes. frames go through the same validator a real agent's would
import type { DeviceCapabilities, DeviceTelemetry, ProcessInfo, StorageDevice } from '../protocol/types';
import { PROTOCOL_VERSION } from '../protocol/types';
import type { Source } from './source';

/** a value that wanders: pulled toward a target that itself moves now and then, plus a little noise */
function walker(lo: number, hi: number, start: number, jumpiness = 0.08) {
  let value = start;
  let target = start;
  return (busy = 1) => {
    if (Math.random() < jumpiness) target = lo + Math.random() * (hi - lo) * busy;
    value += (target - value) * 0.25 + (Math.random() - 0.5) * (hi - lo) * 0.03;
    value = Math.min(hi, Math.max(lo, value));
    return value;
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Agent = {
  capabilities: DeviceCapabilities;
  /** fast sections every tick, medium every fifth, slow every thirtieth */
  frame: (tick: number) => DeviceTelemetry;
  /** for a machine that drops off the network now and then */
  online?: (tick: number) => boolean;
};

function processes(names: [string, number, number][]) {
  const walkers = names.map(([name, cpu, mem]) => ({ name, cpu: walker(0, cpu * 2.2, cpu, 0.15), mem: walker(mem * 0.7, mem * 1.4, mem) }));
  return (): ProcessInfo[] =>
    walkers.map((w, i) => ({ name: w.name, pid: 1000 + i * 137, cpu: r1(w.cpu()), memory: r2(w.mem()) }));
}

function windowsPc(): Agent {
  const usage = walker(4, 96, 22, 0.1);
  const freq = walker(4200, 5050, 4600);
  const gpuUse = walker(0, 99, 35, 0.06);
  const vram = walker(1.8, 11.2, 5.2);
  const ram = walker(9, 21, 12.4);
  const down = walker(0.2, 890, 40, 0.12);
  const up = walker(0.1, 42, 6, 0.12);
  const ping = walker(5, 16, 8);
  const cores = Array.from({ length: 16 }, () => walker(0, 100, 20, 0.2));
  const nvme = { read: walker(0, 2400, 40, 0.1), write: walker(0, 900, 20, 0.1) };
  const sata = { read: walker(0, 480, 5, 0.05), write: walker(0, 300, 2, 0.05) };
  const procs = processes([
    ['chrome.exe', 8, 2.1],
    ['Discord.exe', 3, 0.6],
    ['steam.exe', 2, 0.4],
    ['Code.exe', 2.5, 1.1],
    ['obs64.exe', 6, 0.5],
    ['Spotify.exe', 1.2, 0.35],
    ['explorer.exe', 0.6, 0.15],
    ['MsMpEng.exe', 1.5, 0.3],
    ['dwm.exe', 1.8, 0.12],
    ['svchost.exe', 0.4, 0.09],
    ['RTSS.exe', 0.3, 0.05],
    ['nvcontainer.exe', 0.5, 0.08],
  ]);
  let medium: Pick<DeviceTelemetry, 'processes' | 'storage'> = {};
  const boot = Date.now() - 3 * 3600_000 - 1260_000;

  return {
    capabilities: {
      cpu: true,
      cpuTemperature: true,
      gpu: true,
      gpuTemperature: true,
      memory: true,
      storage: true,
      network: true,
      battery: false,
      processes: true,
      displays: true,
    },
    frame(tick) {
      const u = usage();
      const g = gpuUse();
      const gpuTemp = 34 + g * 0.5 + Math.random() * 2;
      const drives: StorageDevice[] = [
        { id: 'nvme0', name: 'NVMe 0', model: 'Samsung 990 PRO', total: 1000, used: 612.4, free: 387.6, usage: 61.2, temperature: r1(42 + Math.random() * 4), readSpeed: r1(nvme.read()), writeSpeed: r1(nvme.write()) },
        { id: 'sata0', name: 'SATA 1', model: 'Crucial MX500', total: 2000, used: 1431, free: 569, usage: 71.6, temperature: r1(35 + Math.random() * 2), readSpeed: r1(sata.read()), writeSpeed: r1(sata.write()) },
      ];
      if (tick % 5 === 0) medium = { processes: procs(), storage: drives };
      const used = ram();
      return {
        device: { id: 'ousa-pc', name: 'OUSA Gaming PC', platform: 'windows', version: 'Windows 11 Pro 23H2', architecture: 'x64', online: true },
        system: { hostname: 'OUSA-PC', os: 'Windows 11 Pro', kernel: '10.0.22631', uptime: Math.round((Date.now() - boot) / 1000), timestamp: Date.now() },
        cpu: {
          name: 'AMD Ryzen 7 7800X3D',
          usage: r1(u),
          temperature: r1(41 + u * 0.38 + Math.random() * 2),
          frequency: Math.round(freq()),
          cores: 8,
          threads: 16,
          perCoreUsage: cores.map(c => Math.round(Math.min(100, c() * 0.6 + u * 0.5))),
        },
        gpu: {
          name: 'NVIDIA GeForce RTX 4070 SUPER',
          usage: Math.round(g),
          temperature: r1(gpuTemp),
          memoryUsed: r1(vram()),
          memoryTotal: 12,
          frequency: Math.round(210 + (g / 100) * 2535),
          power: Math.round(14 + g * 2.05),
          fan: gpuTemp < 50 ? 0 : Math.round(Math.min(100, (gpuTemp - 45) * 2.4)),
        },
        memory: { used: r1(used), total: 32, available: r1(32 - used), cached: 4.1, usage: r1((used / 32) * 100), swapUsed: 0.4, swapTotal: 8 },
        storage: medium.storage ?? drives,
        network: { interface: 'Ethernet', ip: '192.168.1.20', ipv6: 'fe80::1c2a:9f:4e10', download: r1(down()), upload: r1(up()), ping: Math.round(ping()), linkSpeed: 1000, connected: true },
        battery: null,
        processes: medium.processes ?? procs(),
        displays: [{ name: 'LG 27GP850', width: 2560, height: 1440, refreshRate: 165 }],
      };
    },
  };
}

function macbook(): Agent {
  const usage = walker(3, 80, 14);
  const gpuUse = walker(0, 70, 8);
  const ram = walker(9, 16.5, 11.8);
  const down = walker(0.5, 420, 30, 0.1);
  const up = walker(0.2, 60, 4, 0.1);
  const ping = walker(9, 30, 14);
  const signal = walker(58, 92, 78);
  let battery = 83;
  const procs = processes([
    ['Safari', 4, 1.2],
    ['Xcode', 6, 2.4],
    ['WindowServer', 3, 0.5],
    ['Slack', 1.5, 0.7],
    ['Music', 0.8, 0.3],
    ['Finder', 0.3, 0.12],
    ['mds_stores', 1.1, 0.2],
  ]);
  const boot = Date.now() - 2 * 86400_000 - 5400_000;
  let medium: Pick<DeviceTelemetry, 'processes' | 'battery'> = {};

  return {
    capabilities: {
      cpu: true,
      cpuTemperature: false,
      gpu: true,
      gpuTemperature: false,
      memory: true,
      storage: true,
      network: true,
      battery: true,
      processes: true,
      displays: true,
    },
    frame(tick) {
      if (tick % 5 === 0) {
        battery = Math.max(5, battery - 0.05);
        medium = { processes: procs(), battery: { percentage: Math.round(battery), charging: false, health: 96, cycleCount: 142 } };
      }
      const u = usage();
      const used = ram();
      return {
        device: { id: 'macbook-pro', name: 'MacBook Pro', platform: 'macos', version: 'macOS 15.1', architecture: 'arm64', online: true },
        system: { hostname: 'Ousas-MacBook-Pro', os: 'macOS Sequoia', kernel: 'Darwin 24.1.0', uptime: Math.round((Date.now() - boot) / 1000), timestamp: Date.now() },
        cpu: { name: 'Apple M3 Pro', usage: r1(u), frequency: 4050, cores: 12, threads: 12, load: [r2(u / 25), r2(u / 28 + 0.3), r2(u / 30 + 0.5)] },
        gpu: { name: 'Apple M3 Pro GPU', usage: Math.round(gpuUse()) },
        memory: { used: r1(used), total: 18, available: r1(18 - used), cached: 3.2, usage: r1((used / 18) * 100), swapUsed: 0.9, swapTotal: 2 },
        storage: [{ id: 'disk0', name: 'Macintosh HD', model: 'APPLE SSD AP0512Z', total: 494.4, used: 301.7, free: 192.7, usage: 61 }],
        network: { interface: 'Wi-Fi (en0)', ip: '192.168.1.34', download: r1(down()), upload: r1(up()), ping: Math.round(ping()), linkSpeed: 1201, signal: Math.round(signal()), connected: true },
        battery: medium.battery ?? { percentage: Math.round(battery), charging: false, health: 96, cycleCount: 142 },
        processes: medium.processes ?? procs(),
        displays: [{ name: 'Built-in Liquid Retina XDR', width: 3024, height: 1964, refreshRate: 120 }],
        claude: {
          today: { input: 18_400, output: 412_000 + tick * 90, cacheWrite: 3_100_000, cacheRead: 38_600_000 + tick * 4_000, replies: 287 + Math.floor(tick / 20), sessions: 5 },
          week: [21_000_000, 34_000_000, 12_500_000, 0, 27_800_000, 45_200_000, 42_130_000 + tick * 4_090],
          session: {
            start: Math.floor(Date.now() / 3_600_000) * 3_600_000 - 2 * 3_600_000,
            resetAt: Math.floor(Date.now() / 3_600_000) * 3_600_000 + 3 * 3_600_000,
            tokens: 18_200_000 + tick * 3_000,
            replies: 96 + Math.floor(tick / 30),
            burnPerMin: 131_000,
            projected: 41_800_000,
            peak: 30_500_000,
          },
          models: [
            { name: 'Opus 5.5', tokens: 39_800_000 },
            { name: 'Haiku 4.5', tokens: 2_330_000 },
          ],
        },
      };
    },
  };
}

function linuxServer(): Agent {
  const usage = walker(2, 70, 12);
  const ram = walker(21, 38, 26);
  const down = walker(0.1, 120, 8, 0.1);
  const up = walker(0.1, 260, 20, 0.1);
  const ping = walker(1, 4, 2);
  const procs = processes([
    ['postgres', 4, 3.8],
    ['dockerd', 1.2, 0.4],
    ['nginx', 0.8, 0.1],
    ['node', 3.5, 1.4],
    ['jellyfin', 6, 1.9],
    ['zfs', 0.5, 0.2],
  ]);
  const boot = Date.now() - 41 * 86400_000;
  return {
    capabilities: {
      cpu: true,
      cpuTemperature: true,
      gpu: false,
      gpuTemperature: false,
      memory: true,
      storage: true,
      network: true,
      battery: false,
      processes: true,
      displays: false,
    },
    // forty frames up, twenty down: enough to show offline and coming back without waiting long
    online: tick => tick % 60 < 40,
    frame() {
      const u = usage();
      const used = ram();
      return {
        device: { id: 'linux-server', name: 'Linux Server', platform: 'linux', version: 'Ubuntu 24.04 LTS', architecture: 'x86_64', online: true },
        system: { hostname: 'homelab', os: 'Ubuntu 24.04.1 LTS', kernel: '6.8.0-45-generic', uptime: Math.round((Date.now() - boot) / 1000), timestamp: Date.now() },
        cpu: { name: 'Intel Xeon E-2236', usage: r1(u), temperature: r1(38 + u * 0.4), frequency: 3400, cores: 6, threads: 12, load: [r2(u / 12), r2(u / 14), r2(u / 16)] },
        gpu: null,
        memory: { used: r1(used), total: 64, available: r1(64 - used), cached: 18.6, usage: r1((used / 64) * 100), swapUsed: 0, swapTotal: 8 },
        storage: [
          { id: 'nvme0n1', name: 'nvme0n1', model: 'WD Black SN770', total: 500, used: 88, free: 412, usage: 17.6, temperature: 39 },
          { id: 'tank', name: 'tank (zfs)', model: '4x WD Red Plus 8TB', total: 21_800, used: 13_950, free: 7_850, usage: 64 },
        ],
        network: { interface: 'eno1', ip: '10.0.0.5', download: r1(down()), upload: r1(up()), ping: Math.round(ping()), linkSpeed: 1000, connected: true },
        battery: null,
        processes: procs(),
        displays: null,
      };
    },
  };
}

function pixel(): Agent {
  const ram = walker(4.2, 7.1, 5.4);
  const down = walker(1, 240, 25, 0.1);
  const up = walker(0.5, 30, 5, 0.1);
  const ping = walker(18, 60, 28);
  const signal = walker(40, 85, 66);
  let battery = 64;
  return {
    capabilities: {
      cpu: false,
      cpuTemperature: false,
      gpu: false,
      gpuTemperature: false,
      memory: true,
      storage: true,
      network: true,
      battery: true,
      processes: false,
      displays: true,
    },
    frame(tick) {
      if (tick % 5 === 0) battery = Math.min(100, battery + 0.2);
      const used = ram();
      return {
        device: { id: 'pixel-8', name: 'Pixel 8', platform: 'android', version: 'Android 15', architecture: 'arm64', online: true },
        system: { os: 'Android 15', timestamp: Date.now() },
        cpu: null,
        gpu: null,
        memory: { used: r1(used), total: 8, available: r1(8 - used), usage: r1((used / 8) * 100) },
        storage: [{ id: 'internal', name: 'Internal storage', total: 128, used: 79.4, free: 48.6, usage: 62 }],
        network: { interface: 'Wi-Fi', ip: '192.168.1.51', download: r1(down()), upload: r1(up()), ping: Math.round(ping()), signal: Math.round(signal()), connected: true },
        battery: { percentage: Math.round(battery), charging: true },
        processes: null,
        displays: [{ name: 'Built-in', width: 1080, height: 2400, refreshRate: 120 }],
      };
    },
  };
}

export function mockSource(intervalMs: number): Source {
  return {
    kind: 'mock',
    start(sink) {
      const agents = [windowsPc(), macbook(), linuxServer(), pixel()];
      let tick = 0;
      const wasOnline = agents.map(() => true);

      sink({ type: 'hello', role: 'hub', protocol: PROTOCOL_VERSION });
      const send = () => {
        agents.forEach((agent, i) => {
          const online = agent.online?.(tick) ?? true;
          const frame = agent.frame(tick);
          if (tick === 0) sink({ type: 'capabilities', deviceId: frame.device.id, capabilities: agent.capabilities });
          if (!online) {
            // the hub sees the socket close and says so, rather than leaving the dashboard to time it out
            if (wasOnline[i]) sink({ type: 'device-status', deviceId: frame.device.id, online: false, timestamp: Date.now() });
            wasOnline[i] = false;
            return;
          }
          wasOnline[i] = true;
          sink({ type: 'telemetry', timestamp: Date.now(), deviceId: frame.device.id, data: frame });
        });
        tick++;
      };
      send();
      const timer = setInterval(send, intervalMs);
      return () => clearInterval(timer);
    },
  };
}
