// every message on the wire names its type. agents speak these to the dashboard; the dashboard only ever sends
// hello, pair, ping and pong back, so nothing it says can make a monitored machine do anything
import type { DeviceCapabilities, DeviceInfo, DeviceTelemetry } from './types';

export type MessageType =
  | 'hello'
  | 'pair'
  | 'pair-success'
  | 'pair-failed'
  | 'telemetry'
  | 'device-status'
  | 'capabilities'
  | 'error'
  | 'ping'
  | 'pong';

export type HelloMessage = {
  type: 'hello';
  protocol: number;
  /** who is speaking: the dashboard, an agent, or the hub relaying agents */
  role: 'dashboard' | 'agent' | 'hub';
  /** ms between fast telemetry frames the dashboard would like */
  interval?: number;
  devices?: DeviceInfo[];
};

export type PairMessage = { type: 'pair'; deviceId: string; code: string };
export type PairSuccessMessage = { type: 'pair-success'; deviceId: string };
export type PairFailedMessage = { type: 'pair-failed'; deviceId: string; reason: string };

export type TelemetryMessage = {
  type: 'telemetry';
  timestamp: number;
  deviceId: string;
  data: DeviceTelemetry;
};

export type DeviceStatusMessage = {
  type: 'device-status';
  deviceId: string;
  online: boolean;
  timestamp: number;
  device?: DeviceInfo;
};

export type CapabilitiesMessage = {
  type: 'capabilities';
  deviceId: string;
  capabilities: DeviceCapabilities;
};

export type ErrorMessage = { type: 'error'; deviceId?: string; message: string };
export type PingMessage = { type: 'ping'; timestamp: number };
export type PongMessage = { type: 'pong'; timestamp: number };

export type Message =
  | HelloMessage
  | PairMessage
  | PairSuccessMessage
  | PairFailedMessage
  | TelemetryMessage
  | DeviceStatusMessage
  | CapabilitiesMessage
  | ErrorMessage
  | PingMessage
  | PongMessage;
