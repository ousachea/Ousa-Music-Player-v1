// the wire is always °C and Mbps; these turn it into what the settings ask to read
import { useSettings } from '../store/settings';

export type Formatters = ReturnType<typeof useMetrics>;

const one = (v: number) => (v >= 100 ? Math.round(v).toString() : v.toFixed(1));

export function gb(v: number | undefined) {
  if (v === undefined) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)} TB`;
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} GB`;
}

export function pct(v: number | undefined) {
  return v === undefined ? '—' : `${Math.round(v)}%`;
}

export function duration(seconds: number | undefined) {
  if (seconds === undefined) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${seconds % 60}s` : `${seconds}s`;
}

export function useMetrics() {
  const { tempUnit, netUnit } = useSettings();
  return {
    temp(c: number | undefined) {
      if (c === undefined) return null;
      return tempUnit === 'f' ? `${Math.round(c * 1.8 + 32)}°F` : `${Math.round(c)}°C`;
    },
    /** the figure and its unit apart, so a screen can set them at different sizes */
    rate(mbps: number | undefined): { value: string; unit: string } {
      if (mbps === undefined) return { value: '—', unit: netUnit === 'mbs' ? 'MB/s' : 'Mbps' };
      if (netUnit === 'mbs') return { value: one(mbps / 8), unit: 'MB/s' };
      return mbps >= 1000 ? { value: (mbps / 1000).toFixed(2), unit: 'Gbps' } : { value: one(mbps), unit: 'Mbps' };
    },
    link(mbps: number | undefined) {
      if (mbps === undefined) return null;
      return mbps >= 1000 ? `${(mbps / 1000).toFixed(mbps % 1000 ? 1 : 0)} Gbps` : `${Math.round(mbps)} Mbps`;
    },
    ghz(mhz: number | undefined) {
      return mhz === undefined ? null : `${(mhz / 1000).toFixed(2)} GHz`;
    },
  };
}
