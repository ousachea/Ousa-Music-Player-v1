import { BridgethingClient, type ConnectionState } from '@bridgething/client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { AlertBanner, BottomNavigation, TopBar } from './components/chrome';
import { OrientationContext, Stage } from './components/stage';
import { useCarThingInput } from './composables/useCarThingInput';
import { useMetrics } from './composables/useMetrics';
import { useTelemetrySource } from './composables/useTelemetrySource';
import { useWallClock } from './composables/useWallClock';
import { daemonUrl } from './daemon';
import { Debug, Devices, More, SettingsScreen } from './screens/app';
import { HomeWidgets } from './screens/widgets';
import { Cpu, Gpu, Home, HomeRings, Memory, Network, Offline, Processes, Storage, type DeviceProps } from './screens/device';
import { go, selectDevice, useNav, type Screen } from './store/navigation';
import { loadSettings, updateSettings, useSettings } from './store/settings';
import { capabilities, useTelemetry } from './store/telemetry';

/** screens about the dashboard itself, which stay usable whatever state the device is in */
const APP_SCREENS: Screen[] = ['devices', 'settings', 'debug', 'more'];

const BANNER_MS = 2500;

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [daemon, setDaemon] = useState<ConnectionState>(client.connectionState);
  const settings = useSettings();
  const telemetry = useTelemetry();
  const nav = useNav();
  const fmt = useMetrics();
  const clock = useWallClock(client);

  useEffect(() => {
    void loadSettings(client);
    return client.on(event => {
      if (event.type === 'open' || event.type === 'close' || event.type === 'connecting') setDaemon(client.connectionState);
    });
  }, [client]);

  useTelemetrySource(client);
  useCarThingInput(settings.rotate, () =>
    updateSettings(client, { rotate: ((settings.rotate + 90) % 360) as 0 | 90 | 180 | 270 }),
  );
  const upright = settings.rotate === 90 || settings.rotate === 270;
  const orientation = useMemo(() => ({ rotate: settings.rotate, upright }), [settings.rotate, upright]);

  // the device shown: the one picked this session, else the saved default, else the first computer to report,
  // since the car thing's own link is the least interesting thing on the list
  const firstComputer = telemetry.order.find(d => telemetry.devices[d].info.platform !== 'carthing');
  const id =
    [nav.device, settings.defaultDevice].find(d => d && telemetry.devices[d]) ?? firstComputer ?? telemetry.order[0] ?? null;
  const entry = id ? telemetry.devices[id] : null;
  const caps = entry ? capabilities(entry) : null;

  // a device coming back is worth a word; going is shown by the offline screen itself
  const [banner, setBanner] = useState<string | null>(null);
  const seenBack = useRef<number | null>(null);
  useEffect(() => {
    if (!entry?.backAt || entry.backAt === seenBack.current) return;
    seenBack.current = entry.backAt;
    setBanner(entry.info.name);
    const t = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [entry?.backAt, entry?.info.name]);

  const pick = (device: string) => {
    selectDevice(device);
    updateSettings(client, { defaultDevice: device });
    go('home');
  };

  const deviceProps: DeviceProps | null =
    entry && caps ? { entry, caps, fmt, windowSec: settings.historySec, onOpen: go } : null;

  let body: ReactNode;
  if (nav.screen === 'devices') body = <Devices state={telemetry} selected={id} onPick={pick} live={settings.source === 'live'} />;
  else if (nav.screen === 'settings') body = <SettingsScreen settings={settings} onChange={patch => updateSettings(client, patch)} />;
  else if (nav.screen === 'debug') body = <Debug daemon={daemon} source={settings.source} state={telemetry} entry={entry} />;
  else if (nav.screen === 'more') body = <More onGo={go} />;
  else if (!deviceProps) body = <Waiting source={settings.source} />;
  else if (!deviceProps.entry.online) body = <Offline entry={deviceProps.entry} />;
  else {
    switch (nav.screen) {
      case 'cpu':
        body = <Cpu {...deviceProps} />;
        break;
      case 'gpu':
        body = <Gpu {...deviceProps} />;
        break;
      case 'memory':
        body = <Memory {...deviceProps} />;
        break;
      case 'network':
        body = <Network {...deviceProps} />;
        break;
      case 'storage':
        body = <Storage {...deviceProps} />;
        break;
      case 'processes':
        body = (
          <Processes {...deviceProps} sort={settings.processSort} onSort={processSort => updateSettings(client, { processSort })} />
        );
        break;
      default:
        body =
          settings.homeStyle === 'rings' ? (
            <HomeRings {...deviceProps} />
          ) : settings.homeStyle === 'widgets' ? (
            <HomeWidgets {...deviceProps} />
          ) : (
            <Home {...deviceProps} />
          );
    }
  }

  return (
    <Stage rotate={settings.rotate}>
    <OrientationContext.Provider value={orientation}>
    <div className="relative flex h-full w-full flex-col bg-screen">
      {!nav.bare && <TopBar device={entry?.info.name ?? null} online={entry?.online ?? false} clock={clock} onDevice={() => go('devices')} />}
      {/* keyed on screen and device, so switching either starts the view fresh rather than morphing the last one */}
      <div key={`${nav.screen}:${APP_SCREENS.includes(nav.screen) ? '' : id}`} className="min-h-0 flex-1 animate-[enter_180ms_ease-out] px-5 py-4">
        {body}
      </div>
      {!nav.bare && <BottomNavigation screen={nav.screen} onGo={go} />}
      {banner && <AlertBanner tone="ok" title="ONLINE" detail={`${banner} connected`} />}
      {daemon !== 'open' && <AlertBanner tone="warn" title="DAEMON" detail="reconnecting…" />}
    </div>
    </OrientationContext.Provider>
    </Stage>
  );
}

function Waiting({ source }: { source: 'mock' | 'live' }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="font-display text-[1.75rem] font-semibold text-soft">Waiting for telemetry</div>
      <div className="max-w-lg font-mono text-[0.9375rem] text-dim">
        {source === 'mock' ? 'The mock agent is starting.' : 'Measuring this Car Thing; agents appear here once the desktop extension reports.'}
      </div>
    </div>
  );
}
