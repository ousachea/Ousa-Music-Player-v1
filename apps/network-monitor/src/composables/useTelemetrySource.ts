// runs whichever source the settings name, feeds it through the validator into the store, and calls a device
// offline once it has gone quiet. switching source starts the device list over
import type { BridgethingClient } from '@bridgething/client';
import { useEffect } from 'react';

import { readMessage } from '../protocol/validators';
import { useSettings } from '../store/settings';
import { receive, resetTelemetry, setHistoryWindow, sweep } from '../store/telemetry';
import { liveSource } from '../sources/live';
import { mockSource } from '../sources/mock';

export function useTelemetrySource(client: BridgethingClient) {
  const { source, interval, historySec } = useSettings();

  useEffect(() => setHistoryWindow(historySec), [historySec]);

  useEffect(() => {
    resetTelemetry();
    const s = source === 'mock' ? mockSource(interval) : liveSource(client, interval);
    // the mock builds typed messages, but they take the same road in as anything off the wire
    const stop = s.start(message => {
      const checked = readMessage(message);
      if (checked) receive(checked);
    });
    const sweeper = setInterval(() => sweep(interval), 1000);
    return () => {
      stop();
      clearInterval(sweeper);
    };
  }, [client, source, interval]);
}
