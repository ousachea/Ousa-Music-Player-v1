// what every platform's collector provides. the agent calls the three tiers on their own clocks and lays the
// latest of each into one frame, so a slow read never holds up a fast one
import type { DeviceCapabilities, DeviceTelemetry } from '../../src/protocol/types';

export type Section = Omit<Partial<DeviceTelemetry>, 'device' | 'system'> & {
  device?: Partial<DeviceTelemetry['device']>;
  system?: Partial<DeviceTelemetry['system']>;
};

export interface Collector {
  /** cpu, memory, gpu load, network throughput: every interval */
  fast(): Promise<Section>;
  /** processes, battery, drives, ping: every fifth interval */
  medium(): Promise<Section>;
  /** names, models, os, displays, link details: every thirtieth, and first */
  slow(): Promise<Section>;
  /** what this machine can report, known once the first slow read is in */
  capabilities(): DeviceCapabilities;
}
