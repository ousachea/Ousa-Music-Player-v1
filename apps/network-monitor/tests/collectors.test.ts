// the linux and windows readers checked against samples of what those systems actually print, since neither can
// be run on the machine this app is developed on. run with `bun test` from the app folder
import { describe, expect, test } from 'bun:test';

import {
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
} from '../extension/collectors/linux-parse';
import { mbps, parseNvidiaSmi, rateMeter, rssiPercent } from '../extension/collectors/shared';
import { mapFast, mapMedium, mapSlow, parseLine, wlanRate, wlanSignal } from '../extension/collectors/windows-parse';
import { encodePowerShell, windowsScript } from '../extension/collectors/windows-script';
import { readTelemetry } from '../src/protocol/validators';

const MEMINFO = `MemTotal:       32765432 kB
MemFree:         1203456 kB
MemAvailable:   20123456 kB
Buffers:          345678 kB
Cached:          8123456 kB
SwapCached:            0 kB
SReclaimable:     612345 kB
SwapTotal:       8388604 kB
SwapFree:        7864316 kB
`;

describe('linux', () => {
  test('meminfo counts used as what is not available', () => {
    const m = parseMeminfo(MEMINFO)!;
    expect(m.total).toBe(31.2);
    expect(m.available).toBe(19.2);
    expect(m.used).toBe(12.1);
    expect(m.usage).toBeCloseTo(38.6, 0);
    expect(m.swapTotal).toBe(8);
    expect(m.swapUsed).toBe(0.5);
    expect(m.cached).toBe(8.7);
  });

  test('default route picks 0.0.0.0/0 with the lowest metric', () => {
    const route = `Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT
wlp2s0\t00000000\t0101A8C0\t0003\t0\t0\t600\t00000000\t0\t0\t0
enp3s0\t00000000\t0101A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0
enp3s0\t0001A8C0\t00000000\t0001\t0\t0\t100\t00FFFFFF\t0\t0\t0`;
    expect(parseDefaultRoute(route)).toBe('enp3s0');
    expect(parseDefaultRoute('Iface\tDestination\n')).toBeNull();
  });

  test('total jiffies sums the first eight fields of the cpu line', () => {
    expect(parseTotalJiffies('cpu  10 20 30 40 50 60 70 80 90 100\ncpu0 1 2 3 4 5 6 7 8 9 10')).toBe(360);
  });

  test('a process name with spaces and parentheses survives', () => {
    const line = '4242 (Web Content (1)) S 1 4242 4242 0 -1 4194560 100 0 0 0 1500 250 0 0 20 0 30 0 12345 1000000 5120 18446744073709551615';
    const p = parsePidStat(line)!;
    expect(p.name).toBe('Web Content (1)');
    expect(p.jiffies).toBe(1750);
    expect(p.rssPages).toBe(5120);
  });

  test('mounts keep real filesystems once each and skip boot and snaps', () => {
    const mounts = `/dev/nvme0n1p2 / ext4 rw,relatime 0 0
/dev/nvme0n1p1 /boot/efi vfat rw 0 0
tmpfs /run tmpfs rw 0 0
/dev/loop3 /snap/core/123 squashfs ro 0 0
/dev/sda1 /mnt/My\\040Files ntfs3 rw 0 0
/dev/sdb1 /home btrfs rw,subvol=/@home 0 0
/dev/sdb1 /var btrfs rw,subvol=/@var 0 0`;
    expect(parseMounts(mounts)).toEqual([
      { device: '/dev/nvme0n1p2', mount: '/', fstype: 'ext4' },
      { device: '/dev/sda1', mount: '/mnt/My Files', fstype: 'ntfs3' },
      { device: '/dev/sdb1', mount: '/home', fstype: 'btrfs' },
    ]);
  });

  test('df reads sizes per mount point, spaces included', () => {
    const df = `Filesystem     1024-blocks      Used Available Capacity Mounted on
/dev/nvme0n1p2   487652372 210345678 252456789      46% /
/dev/sda1       1953514584 976757292 976757292      50% /mnt/My Files`;
    const sizes = parseDf(df);
    expect(sizes.get('/')!.total).toBeCloseTo(465.06, 1);
    expect(sizes.get('/mnt/My Files')!.used).toBeCloseTo(931.5, 0);
  });

  test('a partition belongs to its whole disk', () => {
    expect(parentDisk('/dev/nvme0n1p2')).toBe('nvme0n1');
    expect(parentDisk('/dev/sda3')).toBe('sda');
    expect(parentDisk('/dev/mmcblk0p1')).toBe('mmcblk0');
  });

  test('diskstats counts 512 byte sectors', () => {
    const stats = ` 259       0 nvme0n1 123456 0 2000000 1000 654321 0 3000000 2000 0 0 0
 259       1 nvme0n1p1 100 0 200 10 0 0 0 0 0 0 0`;
    expect(parseDiskstats(stats, 'nvme0n1')).toEqual({ read: 2000000 * 512, write: 3000000 * 512 });
    expect(parseDiskstats(stats, 'sda')).toBeNull();
  });

  test('os-release, cpuinfo, wireless and ping', () => {
    expect(parseOsRelease('NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\nID=ubuntu')).toBe('Ubuntu 24.04.1 LTS');
    expect(parseOsRelease('PRETTY_NAME=Arch Linux\n')).toBe('Arch Linux');
    const cpuinfo = `processor\t: 0
model name\t: AMD Ryzen 7 7800X3D 8-Core Processor
cpu MHz\t\t: 4200.000
physical id\t: 0
core id\t\t: 0

processor\t: 1
model name\t: AMD Ryzen 7 7800X3D 8-Core Processor
cpu MHz\t\t: 4800.000
physical id\t: 0
core id\t\t: 0

processor\t: 2
model name\t: AMD Ryzen 7 7800X3D 8-Core Processor
cpu MHz\t\t: 4500.000
physical id\t: 0
core id\t\t: 1`;
    expect(parseCpuinfo(cpuinfo)).toEqual({ model: 'AMD Ryzen 7 7800X3D 8-Core Processor', cores: 2, frequency: 4500 });
    const wireless = `Inter-| sta-|   Quality        |   Discarded packets
 face | tus | link level noise |  nwid  crypt   frag  retry   misc
wlp2s0: 0000   60.  -50.  -256        0      0      0      0     12        0`;
    expect(parseWireless(wireless, 'wlp2s0')).toBe(-50);
    expect(rssiPercent(-50)).toBe(67);
    expect(parsePing('64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.4 ms')).toBe(12.4);
  });
});

describe('shared', () => {
  test('nvidia-smi line, with [N/A] fields left out', () => {
    const gpu = parseNvidiaSmi('NVIDIA GeForce RTX 4070 SUPER, 71, 63, 8396, 12282, 2745, 182.51, 48\n')!;
    expect(gpu).toEqual({ name: 'NVIDIA GeForce RTX 4070 SUPER', usage: 71, temperature: 63, memoryUsed: 8.2, memoryTotal: 12, frequency: 2745, power: 183, fan: 48 });
    const laptop = parseNvidiaSmi('NVIDIA GeForce RTX 3060 Laptop GPU, 5, 45, 300, 6144, 210, [N/A], [N/A]')!;
    expect(laptop.power).toBeUndefined();
    expect(laptop.fan).toBeUndefined();
    expect(parseNvidiaSmi('')).toBeNull();
  });

  test('a byte counter becomes a rate, and a reset is skipped', () => {
    const meter = rateMeter();
    expect(meter([1000, 500], 0)).toBeNull();
    expect(meter([126_000, 63_000], 1000)).toEqual([125_000, 62_500]);
    expect(mbps(125_000)).toBe(1);
    expect(meter([10, 10], 2000)).toBeNull();
  });
});

describe('windows', () => {
  // powershell 5 writes a one-element array as the bare object: one process and one disk here
  const LINE = JSON.stringify({
    tick: 0,
    fast: { rx: 1_000_000, tx: 400_000, cpuPerf: 112.5, nvidia: 'NVIDIA GeForce RTX 4070 SUPER, 40, 55, 4096, 12282, 1800, 120.3, 30\r\n' },
    medium: {
      processes: { name: 'chrome#3', pid: 1234, cpu: 37.5, bytes: 524_288_000 },
      disks: { id: 'C:', label: '', size: 1_000_202_039_296, free: 400_000_000_000 },
      readBps: 52_000_000,
      writeBps: 3_000_000,
      battery: { percent: 64, status: 2 },
      cachedBytes: 4_294_967_296,
      ping: 9,
      wlan: '    Name                   : Wi-Fi\r\n    Receive rate (Mbps)    : 866.7\r\n    Signal                 : 87%\r\n',
    },
    slow: {
      os: 'Microsoft Windows 11 Pro',
      version: '10.0.22631',
      build: '22631',
      cpu: { name: 'AMD Ryzen 7 7800X3D 8-Core Processor', cores: 8, threads: 16, maxMhz: 4201 },
      gpus: [
        { name: 'Microsoft Basic Display Adapter', width: 0, height: 0, hz: 0 },
        { name: 'NVIDIA GeForce RTX 4070 SUPER', width: 2560, height: 1440, hz: 165 },
      ],
      adapter: { name: 'Ethernet', description: 'Realtek PCIe 2.5GbE Family Controller', bps: 2_500_000_000, media: '802.3' },
      ips: [
        { address: '192.168.1.20', family: 'IPv4' },
        { address: 'fe80::1', family: 'IPv6' },
      ],
      models: { 'C:': 'Samsung SSD 990 PRO 1TB' },
      batteryHealth: 91,
      batteryCycles: 212,
    },
  });

  test('a line parses, and junk does not', () => {
    expect(parseLine(LINE)?.tick).toBe(0);
    expect(parseLine('WARNING: something')).toBeNull();
    expect(parseLine('{"tick":1}')).toBeNull();
  });

  test('fast: live clock from base speed and performance, nvidia from its line', () => {
    const line = parseLine(LINE)!;
    const fast = mapFast(line.fast, line.slow!.cpu!.maxMhz);
    expect(fast.cpu?.frequency).toBe(4726);
    expect(fast.gpu?.name).toBe('NVIDIA GeForce RTX 4070 SUPER');
    expect(fast.gpu?.usage).toBe(40);
  });

  test('medium: lone process and disk, battery, ping, signal', () => {
    const line = parseLine(LINE)!;
    const m = mapMedium(line.medium!, line.slow!.models!);
    expect(m.processes).toEqual([{ name: 'chrome', pid: 1234, cpu: 37.5, memory: 0.49 }]);
    expect(m.storage?.[0]).toMatchObject({ id: 'C:', name: 'Local Disk (C:)', model: 'Samsung SSD 990 PRO 1TB', total: 931.5, readSpeed: 52, writeSpeed: 3 });
    expect(m.battery).toEqual({ percentage: 64, charging: true });
    expect(m.network).toEqual({ ping: 9, signal: 87 });
    expect(wlanSignal(line.medium!.wlan!)).toBe(87);
    expect(wlanRate(line.medium!.wlan!)).toBe(866.7);
  });

  test('slow: os, cpu, the real gpu past the basic adapter, link and battery health', () => {
    const s = mapSlow(parseLine(LINE)!.slow!);
    expect(s.device?.version).toBe('Windows 11 Pro (build 22631)');
    expect(s.cpu).toEqual({ name: 'AMD Ryzen 7 7800X3D 8-Core Processor', cores: 8, threads: 16 });
    expect(s.gpu?.name).toBe('NVIDIA GeForce RTX 4070 SUPER');
    expect(s.displays).toEqual([{ name: 'NVIDIA GeForce RTX 4070 SUPER', width: 2560, height: 1440, refreshRate: 165 }]);
    expect(s.network).toEqual({ interface: 'Ethernet (Ethernet)', ip: '192.168.1.20', linkSpeed: 2500 });
    expect(s.battery).toEqual({ health: 91, cycleCount: 212 });
  });

  test('the whole frame passes the dashboard validator', () => {
    const line = parseLine(LINE)!;
    const slow = mapSlow(line.slow!);
    const medium = mapMedium(line.medium!, line.slow!.models!);
    const frame = {
      ...slow,
      ...medium,
      device: { id: 'windows-1234abcd', name: 'OUSA-PC', platform: 'windows', online: true, ...slow.device },
      system: { ...slow.system, timestamp: Date.now() },
      cpu: { ...slow.cpu, usage: 12 },
      network: { ...slow.network, ...medium.network },
    };
    const checked = readTelemetry(frame)!;
    expect(checked.device.platform).toBe('windows');
    expect(checked.processes?.[0].name).toBe('chrome');
    expect(checked.storage?.[0].model).toBe('Samsung SSD 990 PRO 1TB');
    expect(checked.network?.linkSpeed).toBe(2500);
  });

  test('the powershell script encodes to utf-16le base64 and carries only the interval', () => {
    const script = windowsScript(2000);
    expect(script).toContain('$interval = 2000');
    expect(windowsScript(99_999)).toContain('$interval = 10000');
    const decoded = atob(encodePowerShell('ab'));
    expect([...decoded].map(c => c.charCodeAt(0))).toEqual([97, 0, 98, 0]);
    expect(encodePowerShell(script).length).toBeLessThan(32_000);
  });
});
