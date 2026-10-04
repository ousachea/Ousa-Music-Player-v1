// nothing from the wire is trusted: each field is read on its own, checked against its type and range, and left
// out when it fails, so one bad value costs that value rather than the whole frame
import type { Message } from './messages';
import { LIMITS, RANGES, type Range } from './schema';
import {
  PLATFORMS,
  type BatteryInfo,
  type ClaudeUsage,
  type CpuInfo,
  type DeviceCapabilities,
  type DeviceInfo,
  type DeviceTelemetry,
  type DisplayInfo,
  type GpuInfo,
  type MemoryInfo,
  type NetworkInfo,
  type Platform,
  type ProcessInfo,
  type StorageDevice,
} from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, max: number = LIMITS.string): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return s ? s.slice(0, max) : undefined;
}

function num(v: unknown, range: Range): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const [lo, hi] = RANGES[range];
  return v >= lo && v <= hi ? v : undefined;
}

const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

function nums(v: unknown, range: Range, max: number): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.slice(0, max).map(x => num(x, range));
  return out.every((x): x is number => x !== undefined) ? out : undefined;
}

/** strips the keys whose value failed, so `in` and `?.` read the same */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

/** a section is absent, explicitly null, or an object; anything else is treated as absent */
function section<T>(v: unknown, read: (o: Obj) => T): T | null | undefined {
  if (v === null) return null;
  return isObj(v) ? read(v) : undefined;
}

function list<T>(v: unknown, max: number, read: (o: Obj) => T | undefined): T[] | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v)) return undefined;
  return v
    .slice(0, max)
    .map(x => (isObj(x) ? read(x) : undefined))
    .filter((x): x is T => x !== undefined);
}

const platform = (v: unknown): Platform | undefined =>
  PLATFORMS.includes(v as Platform) ? (v as Platform) : undefined;

export function readDevice(o: unknown): DeviceInfo | undefined {
  if (!isObj(o)) return undefined;
  const id = str(o.id, LIMITS.id);
  const name = str(o.name);
  const p = platform(o.platform);
  if (!id || !name || !p) return undefined;
  return compact({
    id,
    name,
    platform: p,
    version: str(o.version),
    architecture: str(o.architecture),
    online: bool(o.online) ?? true,
  });
}

const readCpu = (o: Obj): CpuInfo =>
  compact({
    name: str(o.name),
    usage: num(o.usage, 'percent'),
    temperature: num(o.temperature, 'temperature'),
    frequency: num(o.frequency, 'frequency'),
    cores: num(o.cores, 'pixels'),
    threads: num(o.threads, 'pixels'),
    load: nums(o.load, 'load', LIMITS.load),
    perCoreUsage: nums(o.perCoreUsage, 'percent', LIMITS.cores),
  });

const readMemory = (o: Obj): MemoryInfo =>
  compact({
    used: num(o.used, 'gigabytes'),
    total: num(o.total, 'gigabytes'),
    available: num(o.available, 'gigabytes'),
    cached: num(o.cached, 'gigabytes'),
    usage: num(o.usage, 'percent'),
    swapUsed: num(o.swapUsed, 'gigabytes'),
    swapTotal: num(o.swapTotal, 'gigabytes'),
  });

const readGpu = (o: Obj): GpuInfo =>
  compact({
    name: str(o.name),
    usage: num(o.usage, 'percent'),
    temperature: num(o.temperature, 'temperature'),
    memoryUsed: num(o.memoryUsed, 'gigabytes'),
    memoryTotal: num(o.memoryTotal, 'gigabytes'),
    frequency: num(o.frequency, 'frequency'),
    power: num(o.power, 'watts'),
    fan: num(o.fan, 'percent'),
  });

function readDrive(o: Obj): StorageDevice | undefined {
  const id = str(o.id, LIMITS.id);
  const name = str(o.name);
  if (!id || !name) return undefined;
  return compact({
    id,
    name,
    model: str(o.model),
    total: num(o.total, 'gigabytes'),
    used: num(o.used, 'gigabytes'),
    free: num(o.free, 'gigabytes'),
    usage: num(o.usage, 'percent'),
    temperature: num(o.temperature, 'temperature'),
    readSpeed: num(o.readSpeed, 'diskSpeed'),
    writeSpeed: num(o.writeSpeed, 'diskSpeed'),
  });
}

const readNetwork = (o: Obj): NetworkInfo =>
  compact({
    interface: str(o.interface),
    ip: str(o.ip, 45),
    ipv6: str(o.ipv6, 45),
    publicIp: str(o.publicIp, 45),
    download: num(o.download, 'mbps'),
    upload: num(o.upload, 'mbps'),
    ping: num(o.ping, 'ping'),
    linkSpeed: num(o.linkSpeed, 'mbps'),
    signal: num(o.signal, 'percent'),
    connected: bool(o.connected),
    metered: bool(o.metered),
  });

const readBattery = (o: Obj): BatteryInfo =>
  compact({
    percentage: num(o.percentage, 'percent'),
    charging: bool(o.charging),
    health: num(o.health, 'percent'),
    cycleCount: num(o.cycleCount, 'cycles'),
  });

function readProcess(o: Obj): ProcessInfo | undefined {
  const name = str(o.name, 64);
  if (!name) return undefined;
  return compact({ name, pid: num(o.pid, 'pid'), cpu: num(o.cpu, 'processCpu'), memory: num(o.memory, 'gigabytes') });
}

const readDisplay = (o: Obj): DisplayInfo =>
  compact({
    name: str(o.name),
    width: num(o.width, 'pixels'),
    height: num(o.height, 'pixels'),
    refreshRate: num(o.refreshRate, 'hertz'),
  });

function readClaude(o: Obj): ClaudeUsage | undefined {
  if (!isObj(o.today)) return undefined;
  const t = o.today;
  const today = {
    input: num(t.input, 'tokens'),
    output: num(t.output, 'tokens'),
    cacheWrite: num(t.cacheWrite, 'tokens'),
    cacheRead: num(t.cacheRead, 'tokens'),
    replies: num(t.replies, 'count'),
    sessions: num(t.sessions, 'count'),
  };
  if (Object.values(today).some(v => v === undefined)) return undefined;
  const week = nums(o.week, 'tokens', 7);
  const models = (Array.isArray(o.models) ? o.models : [])
    .slice(0, LIMITS.models)
    .map(m => (isObj(m) ? { name: str(m.name, 64), tokens: num(m.tokens, 'tokens') } : null))
    .filter((m): m is { name: string; tokens: number } => !!m?.name && m.tokens !== undefined);
  let session: ClaudeUsage['session'];
  if (o.session === null) session = null;
  else if (isObj(o.session)) {
    const x = o.session;
    const fields = {
      start: num(x.start, 'tokens'),
      resetAt: num(x.resetAt, 'tokens'),
      tokens: num(x.tokens, 'tokens'),
      replies: num(x.replies, 'count'),
      burnPerMin: num(x.burnPerMin, 'tokens'),
      projected: num(x.projected, 'tokens'),
      peak: num(x.peak, 'tokens'),
    };
    // a window is all or nothing: half of one would show a reset time against the wrong tokens
    if (Object.values(fields).every(v => v !== undefined) && fields.resetAt! > fields.start!) session = fields as NonNullable<ClaudeUsage['session']>;
  }
  return { today: today as ClaudeUsage['today'], week: week ?? [], models, ...(session !== undefined ? { session } : {}) };
}

export function readTelemetry(o: unknown): DeviceTelemetry | undefined {
  if (!isObj(o)) return undefined;
  const device = readDevice(o.device);
  if (!device || !isObj(o.system)) return undefined;
  const timestamp = time(o.system.timestamp);
  if (timestamp === undefined) return undefined;
  return compact({
    device,
    system: compact({
      hostname: str(o.system.hostname),
      os: str(o.system.os),
      kernel: str(o.system.kernel),
      uptime: num(o.system.uptime, 'uptime'),
      timestamp,
    }),
    cpu: section(o.cpu, readCpu),
    memory: section(o.memory, readMemory),
    gpu: section(o.gpu, readGpu),
    storage: list(o.storage, LIMITS.storage, readDrive),
    network: section(o.network, readNetwork),
    battery: section(o.battery, readBattery),
    processes: list(o.processes, LIMITS.processes, readProcess),
    displays: list(o.displays, LIMITS.displays, readDisplay),
    claude: o.claude === null ? null : isObj(o.claude) ? readClaude(o.claude) : undefined,
  });
}

const CAPABILITY_KEYS: (keyof DeviceCapabilities)[] = [
  'cpu',
  'cpuTemperature',
  'gpu',
  'gpuTemperature',
  'memory',
  'storage',
  'network',
  'battery',
  'processes',
  'displays',
];

function readCapabilities(o: unknown): DeviceCapabilities | undefined {
  if (!isObj(o)) return undefined;
  const out = {} as DeviceCapabilities;
  for (const k of CAPABILITY_KEYS) out[k] = o[k] === true;
  return out;
}

/** the single gate every inbound message passes; anything that fails comes back undefined and is ignored */
export function readMessage(raw: unknown): Message | undefined {
  if (!isObj(raw)) return undefined;
  switch (raw.type) {
    case 'telemetry': {
      const deviceId = str(raw.deviceId, LIMITS.id);
      const data = readTelemetry(raw.data);
      const timestamp = time(raw.timestamp);
      // a frame that claims to be one device but carries another is refused rather than filed under either
      if (!deviceId || !data || !timestamp || data.device.id !== deviceId) return undefined;
      return { type: 'telemetry', deviceId, timestamp, data };
    }
    case 'device-status': {
      const deviceId = str(raw.deviceId, LIMITS.id);
      const online = bool(raw.online);
      const timestamp = time(raw.timestamp);
      if (!deviceId || online === undefined || !timestamp) return undefined;
      const device = readDevice(raw.device);
      return compact({ type: 'device-status' as const, deviceId, online, timestamp, device });
    }
    case 'capabilities': {
      const deviceId = str(raw.deviceId, LIMITS.id);
      const capabilities = readCapabilities(raw.capabilities);
      if (!deviceId || !capabilities) return undefined;
      return { type: 'capabilities', deviceId, capabilities };
    }
    case 'hello': {
      const role = (['agent', 'hub', 'dashboard'] as const).find(r => r === raw.role);
      const protocol = typeof raw.protocol === 'number' && Number.isInteger(raw.protocol) ? raw.protocol : undefined;
      if (!role || protocol === undefined) return undefined;
      const devices = Array.isArray(raw.devices)
        ? raw.devices.slice(0, LIMITS.devices).map(readDevice).filter((d): d is DeviceInfo => !!d)
        : undefined;
      return compact({ type: 'hello' as const, role, protocol, devices });
    }
    case 'pair-success': {
      const deviceId = str(raw.deviceId, LIMITS.id);
      return deviceId ? { type: 'pair-success', deviceId } : undefined;
    }
    case 'pair-failed': {
      const deviceId = str(raw.deviceId, LIMITS.id);
      return deviceId ? { type: 'pair-failed', deviceId, reason: str(raw.reason) ?? 'refused' } : undefined;
    }
    case 'error': {
      const message = str(raw.message);
      return message ? compact({ type: 'error' as const, message, deviceId: str(raw.deviceId, LIMITS.id) }) : undefined;
    }
    case 'ping':
    case 'pong': {
      const timestamp = time(raw.timestamp);
      return timestamp ? { type: raw.type, timestamp } : undefined;
    }
    default:
      return undefined;
  }
}
