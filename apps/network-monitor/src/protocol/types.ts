// the one telemetry shape every agent produces, whatever it runs on. units are fixed so the screens never convert
// per platform: temperature °C, memory and storage GB, network Mbps, frequency MHz, power W, usage percent.
// a section an agent cannot read is left out rather than filled with a guess.

export const PROTOCOL_VERSION = 1;

export type Platform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'carthing';

export const PLATFORMS: readonly Platform[] = ['windows', 'macos', 'linux', 'android', 'ios', 'carthing'];

export interface DeviceInfo {
  id: string;
  name: string;
  platform: Platform;
  version?: string;
  architecture?: string;
  online: boolean;
}

export interface SystemInfo {
  hostname?: string;
  os?: string;
  kernel?: string;
  /** seconds */
  uptime?: number;
  /** unix ms */
  timestamp: number;
}

export interface CpuInfo {
  name?: string;
  usage?: number;
  temperature?: number;
  frequency?: number;
  cores?: number;
  threads?: number;
  load?: number[];
  perCoreUsage?: number[];
}

export interface MemoryInfo {
  used?: number;
  total?: number;
  available?: number;
  cached?: number;
  usage?: number;
  swapUsed?: number;
  swapTotal?: number;
}

export interface GpuInfo {
  name?: string;
  usage?: number;
  temperature?: number;
  memoryUsed?: number;
  memoryTotal?: number;
  frequency?: number;
  power?: number;
  fan?: number;
}

export interface StorageDevice {
  id: string;
  name: string;
  model?: string;
  total?: number;
  used?: number;
  free?: number;
  usage?: number;
  temperature?: number;
  /** MB/s */
  readSpeed?: number;
  /** MB/s */
  writeSpeed?: number;
}

export interface NetworkInfo {
  interface?: string;
  ip?: string;
  ipv6?: string;
  publicIp?: string;
  download?: number;
  upload?: number;
  /** ms */
  ping?: number;
  /** Mbps */
  linkSpeed?: number;
  /** percent, for a wireless link */
  signal?: number;
  connected?: boolean;
  metered?: boolean;
}

export interface BatteryInfo {
  percentage?: number;
  charging?: boolean;
  health?: number;
  cycleCount?: number;
}

export interface ProcessInfo {
  name: string;
  pid?: number;
  /** percent of one core, so a process busy on several reads past 100 */
  cpu?: number;
  /** GB */
  memory?: number;
}

export interface DisplayInfo {
  name?: string;
  width?: number;
  height?: number;
  refreshRate?: number;
}

/** claude code's own record on this machine: tokens by kind, replies and sessions, for today and the week */
export interface ClaudeDay {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  replies: number;
  sessions: number;
}

/** claude's limits run in five-hour windows that open with the first message after a quiet spell */
export interface ClaudeSession {
  /** unix ms the window opened, and when it resets */
  start: number;
  resetAt: number;
  tokens: number;
  replies: number;
  /** tokens a minute since the window opened, and where that pace lands by the reset */
  burnPerMin: number;
  projected: number;
  /** the busiest earlier window this week, the yardstick for how much of this one is used */
  peak: number;
}

/** one of the plan's limits: how much of it is used, as a percentage, and when it resets */
export interface ClaudeLimit {
  used: number;
  resetsAt: number;
  severity?: string;
}

/** the plan's own limits, from the account claude code is signed in to; an error says why they are missing */
export interface ClaudeLimits {
  checkedAt: number;
  plan?: string;
  session?: ClaudeLimit;
  week?: ClaudeLimit;
  weekOpus?: ClaudeLimit;
  weekSonnet?: ClaudeLimit;
  error?: string;
}

export interface ClaudeUsage {
  today: ClaudeDay;
  limits?: ClaudeLimits | null;
  /** the window open now, or null between them */
  session?: ClaudeSession | null;
  /** total tokens a day, oldest first, today last */
  week: number[];
  /** today's tokens by model, largest first */
  models: { name: string; tokens: number }[];
}

export interface DeviceTelemetry {
  device: DeviceInfo;
  system: SystemInfo;
  cpu?: CpuInfo | null;
  memory?: MemoryInfo | null;
  gpu?: GpuInfo | null;
  storage?: StorageDevice[] | null;
  network?: NetworkInfo | null;
  battery?: BatteryInfo | null;
  processes?: ProcessInfo[] | null;
  displays?: DisplayInfo[] | null;
  claude?: ClaudeUsage | null;
}

export interface DeviceCapabilities {
  cpu: boolean;
  cpuTemperature: boolean;
  gpu: boolean;
  gpuTemperature: boolean;
  memory: boolean;
  storage: boolean;
  network: boolean;
  battery: boolean;
  processes: boolean;
  displays: boolean;
}

/** what a device can show when it never said, read off the sections its telemetry actually carries */
export function capabilitiesOf(t: DeviceTelemetry): DeviceCapabilities {
  return {
    cpu: !!t.cpu,
    cpuTemperature: t.cpu?.temperature !== undefined,
    gpu: !!t.gpu,
    gpuTemperature: t.gpu?.temperature !== undefined,
    memory: !!t.memory,
    storage: !!t.storage && t.storage.length > 0,
    network: !!t.network,
    battery: !!t.battery,
    processes: !!t.processes && t.processes.length > 0,
    displays: !!t.displays && t.displays.length > 0,
  };
}
