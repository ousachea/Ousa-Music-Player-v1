// every kind of information home can show, which the settings can hide. hiding one takes it off home in every style;
// its own screen stays, so hiding cpu does not cost the cpu screen
import type { DeviceCapabilities } from '../protocol/types';

export const INFO = [
  { key: 'cpu', label: 'CPU' },
  { key: 'gpu', label: 'GPU' },
  { key: 'memory', label: 'Memory' },
  { key: 'network', label: 'Network' },
  { key: 'storage', label: 'Disk' },
  { key: 'battery', label: 'Battery' },
  { key: 'weather', label: 'Weather' },
  { key: 'sun', label: 'Sunrise & sunset' },
  { key: 'clock', label: 'Clock' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'music', label: 'Music' },
  { key: 'claude', label: 'Claude Code' },
  { key: 'cores', label: 'Cores' },
  { key: 'apps', label: 'Top apps' },
  { key: 'system', label: 'System' },
  { key: 'displays', label: 'Displays' },
  { key: 'drives', label: 'Other drives' },
] as const;

export type InfoKey = (typeof INFO)[number]['key'];

export const INFO_KEYS: readonly string[] = INFO.map(i => i.key);

/** what home may show of a device: what it reports, less what has been hidden */
export function shownCaps(caps: DeviceCapabilities, hidden: readonly string[]): DeviceCapabilities {
  const off = (key: InfoKey) => hidden.includes(key);
  return {
    ...caps,
    cpu: caps.cpu && !off('cpu'),
    gpu: caps.gpu && !off('gpu'),
    memory: caps.memory && !off('memory'),
    network: caps.network && !off('network'),
    storage: caps.storage && !off('storage'),
    battery: caps.battery && !off('battery'),
  };
}
