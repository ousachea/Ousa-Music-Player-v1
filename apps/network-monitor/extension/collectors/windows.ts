// windows reads through one long-lived powershell, which prints a json line each interval; this side keeps the
// latest of each part, turns the byte counters into rates, and reads cpu and memory itself, since node:os and deno
// answer those directly. temperatures need administrator rights on windows, so they are left out
import type { DeviceCapabilities } from '../../src/protocol/types';
import { round } from '../run';
import type { Collector, Section } from './collector';
import { cpuMeter, mbps, rateMeter } from './shared';
import { encodePowerShell, windowsScript } from './windows-script';
import { mapFast, mapMedium, mapSlow, parseLine, wlanRate, type PsLine } from './windows-parse';

export const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

const GB = 1024 ** 3;
const RESTART_MS = 5000;

export function windowsCollector(log: (...args: unknown[]) => void): Collector {
  const cpu = cpuMeter();
  const net = rateMeter();
  let interval = 1000;
  let child: Deno.ChildProcess | null = null;
  let stopped = false;
  let active = false;
  let restart: ReturnType<typeof setTimeout> | undefined;

  let fast: Section = {};
  let medium: Section = {};
  let slow: Section = {};
  let rawMedium: PsLine['medium'];
  let models: Record<string, string> = {};
  let maxMhz: number | undefined;
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

  const take = (line: PsLine) => {
    if (line.slow) {
      slow = mapSlow(line.slow);
      models = line.slow.models ?? models;
      maxMhz = line.slow.cpu?.maxMhz ?? maxMhz;
      caps = { ...caps, gpu: caps.gpu || !!slow.gpu, displays: !!slow.displays?.length };
      // the adapter may not know a wi-fi link's rate; netsh does
      if (!slow.network?.linkSpeed && rawMedium?.wlan) {
        const rate = wlanRate(rawMedium.wlan);
        if (rate) slow.network = { ...slow.network, linkSpeed: rate };
      }
    }
    if (line.medium) {
      rawMedium = line.medium;
      medium = mapMedium(line.medium, models);
      if (medium.battery) caps = { ...caps, battery: true };
      if (medium.gpu) caps = { ...caps, gpu: true };
    }
    const next = mapFast(line.fast, maxMhz);
    if (next.gpu) caps = { ...caps, gpu: true, gpuTemperature: next.gpu.temperature !== undefined };
    const rx = line.fast.rx;
    const tx = line.fast.tx;
    if (typeof rx === 'number' && typeof tx === 'number') {
      const rate = net([rx, tx]);
      if (rate) next.network = { download: mbps(rate[0]), upload: mbps(rate[1]), connected: true };
    }
    fast = next;
  };

  async function pump(proc: Deno.ChildProcess) {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let at: number;
        while ((at = buffer.indexOf('\n')) !== -1) {
          const text = buffer.slice(0, at).trim();
          buffer = buffer.slice(at + 1);
          const line = text ? parseLine(text) : null;
          if (line) take(line);
        }
      }
    } catch {
      // the process went away mid-line; the restart below picks things up
    }
  }

  function start() {
    if (stopped || !active || child) return;
    try {
      child = new Deno.Command(POWERSHELL, {
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(windowsScript(interval))],
        stdout: 'piped',
        stderr: 'null',
        stdin: 'null',
      }).spawn();
    } catch (err) {
      log('powershell would not start', String(err));
      restart = setTimeout(start, RESTART_MS);
      return;
    }
    const proc = child;
    void pump(proc);
    proc.status.then(() => {
      if (child === proc) child = null;
      if (!stopped && active) restart = setTimeout(start, RESTART_MS);
    });
  }

  function kill() {
    clearTimeout(restart);
    const proc = child;
    child = null;
    try {
      proc?.kill();
    } catch {
      // already gone
    }
  }

  return {
    streaming: true,
    capabilities: () => caps,

    async fast() {
      const { usage, perCoreUsage } = cpu();
      const m = Deno.systemMemoryInfo();
      const used = m.total - m.available;
      const cached = rawMedium?.cachedBytes;
      return {
        ...fast,
        cpu: { ...fast.cpu, usage, perCoreUsage },
        memory: {
          total: round(m.total / GB),
          used: round(used / GB),
          available: round(m.available / GB),
          usage: round((used / m.total) * 100),
          ...(typeof cached === 'number' ? { cached: round(cached / GB) } : {}),
          // deno reads the page file as swap on windows
          ...(m.swapTotal > 0 ? { swapTotal: round(m.swapTotal / GB), swapUsed: round((m.swapTotal - m.swapFree) / GB) } : {}),
        },
        system: { uptime: Math.round(Deno.osUptime()) },
      };
    },

    async medium() {
      return medium;
    },

    async slow() {
      return {
        ...slow,
        device: { name: Deno.hostname(), architecture: Deno.build.arch === 'x86_64' ? 'x64' : Deno.build.arch === 'aarch64' ? 'arm64' : Deno.build.arch, ...slow.device },
        system: { hostname: Deno.hostname(), ...slow.system },
      };
    },

    setInterval(ms: number) {
      if (ms === interval) return;
      interval = ms;
      kill();
      start();
    },

    setActive(on: boolean) {
      if (on === active) return;
      active = on;
      if (on) start();
      else kill();
    },

    stop() {
      stopped = true;
      kill();
    },
  };
}
