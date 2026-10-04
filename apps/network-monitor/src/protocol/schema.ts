// the bounds a message has to sit inside before any of it reaches the screen. a value outside its range is
// dropped, not clamped, since a 400% cpu or a -40 GB drive says the agent is wrong, not that the machine is busy

export const LIMITS = {
  string: 120,
  id: 64,
  processes: 60,
  storage: 16,
  displays: 8,
  cores: 512,
  load: 3,
  devices: 32,
  models: 8,
} as const;

export const RANGES = {
  percent: [0, 100],
  /** a process is measured against one core, as top and activity monitor do, so a busy one passes 100 */
  processCpu: [0, 51_200],
  temperature: [-40, 150],
  /** GB; a petabyte is past anything a dashboard will be watching */
  gigabytes: [0, 1_000_000],
  /** Mbps */
  mbps: [0, 1_000_000],
  /** ms */
  ping: [0, 60_000],
  /** MHz */
  frequency: [0, 20_000],
  watts: [0, 5_000],
  /** MB/s */
  diskSpeed: [0, 100_000],
  /** seconds */
  uptime: [0, 10 * 365 * 24 * 3600],
  load: [0, 10_000],
  cycles: [0, 100_000],
  pixels: [0, 32_768],
  hertz: [0, 1_000],
  pid: [0, 2 ** 31],
  /** tokens: a day of heavy use is billions, never trillions */
  tokens: [0, 1e13],
  count: [0, 1e9],
} as const satisfies Record<string, readonly [number, number]>;

export type Range = keyof typeof RANGES;
