// pure readers for the text linux keeps under /proc and /sys and what df and ping print. no io here, so each one
// can be checked against a sample of the real thing
import { round } from '../run';

const KB_PER_GB = 1024 * 1024;

/** /proc/meminfo, in GB; used is what is not available, the way free and every desktop monitor count it */
export function parseMeminfo(text: string) {
  const kb = (key: string) => {
    const m = new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(text);
    return m ? Number(m[1]) : undefined;
  };
  const total = kb('MemTotal');
  const available = kb('MemAvailable') ?? kb('MemFree');
  if (total === undefined || available === undefined) return null;
  const cached = (kb('Cached') ?? 0) + (kb('Buffers') ?? 0) + (kb('SReclaimable') ?? 0);
  const swapTotal = kb('SwapTotal');
  const swapFree = kb('SwapFree');
  const used = total - available;
  return {
    total: round(total / KB_PER_GB),
    used: round(used / KB_PER_GB),
    available: round(available / KB_PER_GB),
    cached: round(cached / KB_PER_GB),
    usage: round((used / total) * 100),
    ...(swapTotal !== undefined ? { swapTotal: round(swapTotal / KB_PER_GB) } : {}),
    ...(swapTotal !== undefined && swapFree !== undefined ? { swapUsed: round((swapTotal - swapFree) / KB_PER_GB) } : {}),
  };
}

/** /proc/net/route: the interface carrying 0.0.0.0/0 with the lowest metric */
export function parseDefaultRoute(text: string): string | null {
  let best: { iface: string; metric: number } | null = null;
  for (const line of text.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 8 || f[1] !== '00000000' || f[7] !== '00000000') continue;
    const metric = Number(f[6]);
    if (!best || metric < best.metric) best = { iface: f[0], metric };
  }
  return best?.iface ?? null;
}

/** the first line of /proc/stat summed: every jiffy every core has spent */
export function parseTotalJiffies(text: string): number | null {
  const line = text.split('\n').find(l => l.startsWith('cpu '));
  if (!line) return null;
  return line
    .trim()
    .split(/\s+/)
    .slice(1, 9)
    .reduce((a, v) => a + Number(v), 0);
}

/** /proc/<pid>/stat: the name sits in parentheses and may itself hold spaces or parentheses, so it is cut at the last ")" */
export function parsePidStat(text: string): { name: string; jiffies: number; rssPages: number } | null {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open === -1 || close < open) return null;
  const rest = text.slice(close + 2).split(' ');
  // after the name: state(0) ppid(1) ... utime(11) stime(12) ... rss(21)
  const utime = Number(rest[11]);
  const stime = Number(rest[12]);
  const rss = Number(rest[21]);
  if (!Number.isFinite(utime) || !Number.isFinite(stime)) return null;
  return { name: text.slice(open + 1, close), jiffies: utime + stime, rssPages: Number.isFinite(rss) ? rss : 0 };
}

const REAL_FS = new Set(['ext2', 'ext3', 'ext4', 'xfs', 'btrfs', 'f2fs', 'vfat', 'exfat', 'ntfs', 'ntfs3', 'zfs', 'bcachefs', 'jfs', 'reiserfs']);

/** /proc/mounts reduced to the filesystems a person stores things on, one entry per device */
export function parseMounts(text: string): { device: string; mount: string; fstype: string }[] {
  const seen = new Set<string>();
  const out: { device: string; mount: string; fstype: string }[] = [];
  for (const line of text.split('\n')) {
    const [device, rawMount, fstype] = line.split(' ');
    if (!device || !rawMount || !REAL_FS.has(fstype)) continue;
    // mount points escape spaces as \040
    const mount = rawMount.replace(/\\040/g, ' ');
    if (mount.startsWith('/boot') || mount.startsWith('/snap') || mount.startsWith('/var/lib/docker')) continue;
    // a btrfs volume mounted at several subvolumes is still one drive
    if (seen.has(device)) continue;
    seen.add(device);
    out.push({ device, mount, fstype });
  }
  return out;
}

/** `df -kP`: size, used and free per mount point, in GB */
export function parseDf(text: string): Map<string, { total: number; used: number; free: number }> {
  const out = new Map<string, { total: number; used: number; free: number }>();
  for (const line of text.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 6) continue;
    const total = Number(f[1]);
    const used = Number(f[2]);
    const free = Number(f[3]);
    if (!Number.isFinite(total) || total <= 0) continue;
    out.set(f.slice(5).join(' '), { total: total / KB_PER_GB, used: used / KB_PER_GB, free: free / KB_PER_GB });
  }
  return out;
}

/** the whole disk a partition lives on, "nvme0n1p2" -> "nvme0n1", "sda3" -> "sda", "mmcblk0p1" -> "mmcblk0" */
export function parentDisk(device: string): string {
  const name = device.replace(/^\/dev\//, '');
  if (/^(nvme\d+n\d+|mmcblk\d+)p\d+$/.test(name)) return name.replace(/p\d+$/, '');
  return name.replace(/\d+$/, '');
}

/** /proc/diskstats: bytes read and written by one disk so far (sectors are always 512 bytes there) */
export function parseDiskstats(text: string, disk: string): { read: number; write: number } | null {
  for (const line of text.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f[2] === disk) return { read: Number(f[5]) * 512, write: Number(f[9]) * 512 };
  }
  return null;
}

export function parseOsRelease(text: string): string | undefined {
  const m = /^PRETTY_NAME="?([^"\n]+)"?/m.exec(text);
  return m?.[1];
}

/** /proc/cpuinfo: the model, physical cores, and the average live clock where the cpu reports one (x86 does) */
export function parseCpuinfo(text: string) {
  const model = /^(model name|Model|Hardware)\s*:\s*(.+)$/m.exec(text)?.[2]?.trim();
  const mhz = [...text.matchAll(/^cpu MHz\s*:\s*([\d.]+)/gm)].map(m => Number(m[1]));
  const cores = new Set<string>();
  let physical = '0';
  for (const line of text.split('\n')) {
    if (line.startsWith('physical id')) physical = line.split(':')[1].trim();
    if (line.startsWith('core id')) cores.add(`${physical}:${line.split(':')[1].trim()}`);
  }
  return {
    model,
    cores: cores.size || undefined,
    frequency: mhz.length ? Math.round(mhz.reduce((a, v) => a + v, 0) / mhz.length) : undefined,
  };
}

/** /proc/net/wireless: "wlan0: 0000   60.  -50.  -256 ..." where the third column is the level in dBm */
export function parseWireless(text: string, iface: string): number | undefined {
  const line = text.split('\n').find(l => l.trim().startsWith(`${iface}:`));
  if (!line) return undefined;
  const f = line.trim().split(/\s+/);
  const level = Number.parseFloat(f[3]);
  return Number.isFinite(level) && level < 0 ? level : undefined;
}

export function parsePing(text: string): number | undefined {
  const m = /time[=<]([\d.]+)\s*ms/.exec(text);
  return m ? round(Number(m[1])) : undefined;
}

/** the hwmon a cpu's temperature lives under, by driver name, best first */
export const CPU_SENSORS = ['k10temp', 'zenpower', 'coretemp', 'cpu_thermal', 'soc_thermal', 'acpitz'];
