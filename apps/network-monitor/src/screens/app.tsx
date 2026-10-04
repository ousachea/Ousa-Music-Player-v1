// the screens about the dashboard rather than a device: which device to watch, the settings, a raw look at the
// data for troubleshooting, and the menu that reaches them
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';

import { DeviceCard, Label, StatusIndicator } from '../components/cards';
import { useOrientation } from '../components/stage';
import { useKeepInView, useWheelList, useWheelScroll } from '../composables/useWheel';
import type { Screen } from '../store/navigation';
import type { Settings } from '../store/settings';
import type { DeviceEntry, TelemetryState } from '../store/telemetry';

export const Devices = memo(function Devices({
  state,
  selected,
  onPick,
  live,
}: {
  state: TelemetryState;
  selected: string | null;
  onPick: (id: string) => void;
  live: boolean;
}) {
  const ids = state.order;
  const [focus, setFocus] = useWheelList(ids.length, i => ids[i] && onPick(ids[i]));
  const list = useRef<HTMLDivElement>(null);
  useKeepInView(list, focus);
  // the wheel starts on the device already showing, not the top of the list
  useEffect(() => {
    const at = selected ? ids.indexOf(selected) : -1;
    if (at >= 0) setFocus(at);
  }, []);
  if (ids.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <div className="font-display text-[1.75rem] font-semibold text-soft">No devices yet</div>
        <div className="font-mono text-[0.9375rem] text-dim">Waiting for an agent to report in.</div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-2">
      <Label>Devices · turn to choose, press or tap to show</Label>
      <div ref={list} data-scroll className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto [scrollbar-width:none]">
        {ids.map((id, i) => {
          const d = state.devices[id];
          return <DeviceCard key={id} info={d.info} online={d.online} selected={id === selected} focused={i === focus} onPick={() => onPick(id)} />;
        })}
        {/* with only the car thing listed, nothing on the desktop is reporting yet */}
        {live && ids.every(id => state.devices[id].info.platform === 'carthing') && (
          <div className="rounded-[var(--panel-radius)] border border-dashed border-white/12 px-4 py-3 font-mono text-[0.875rem] leading-relaxed text-dim">
            No computer reporting. Install O-System Monitor in the bridgething desktop app on the computer this Car
            Thing is plugged into, and allow its extension.
          </div>
        )}
      </div>
    </div>
  );
});

type Row = {
  key: keyof Settings;
  label: string;
  choices: { value: Settings[keyof Settings]; label: string }[];
  note?: string;
};

const ROWS: Row[] = [
  {
    key: 'homeStyle',
    label: 'Home style',
    choices: [
      { value: 'cards', label: 'Cards' },
      { value: 'rings', label: 'Rings' },
      { value: 'widgets', label: 'Widgets' },
    ],
  },
  {
    key: 'rotate',
    label: 'Screen rotation',
    choices: [
      { value: 0, label: '0°' },
      { value: 90, label: '90°' },
      { value: 180, label: '180°' },
      { value: 270, label: '270°' },
    ],
    note: 'Preset 4 turns it a quarter at a time',
  },
  {
    key: 'source',
    label: 'Data source',
    choices: [
      { value: 'live', label: 'Live' },
      { value: 'mock', label: 'Mock' },
    ],
    note: 'Live reads this Car Thing and any agent on the desktop extension',
  },
  {
    key: 'interval',
    label: 'Refresh',
    choices: [
      { value: 1000, label: '1s' },
      { value: 2000, label: '2s' },
      { value: 5000, label: '5s' },
    ],
  },
  {
    key: 'tempUnit',
    label: 'Temperature',
    choices: [
      { value: 'c', label: '°C' },
      { value: 'f', label: '°F' },
    ],
  },
  {
    key: 'netUnit',
    label: 'Network unit',
    choices: [
      { value: 'mbps', label: 'Mbps' },
      { value: 'mbs', label: 'MB/s' },
    ],
  },
  {
    key: 'historySec',
    label: 'Graph history',
    choices: [
      { value: 30, label: '30s' },
      { value: 60, label: '60s' },
      { value: 120, label: '120s' },
    ],
  },
];

export const SettingsScreen = memo(function SettingsScreen({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const cycle = (row: Row) => {
    const at = row.choices.findIndex(c => c.value === settings[row.key]);
    onChange({ [row.key]: row.choices[(at + 1) % row.choices.length].value } as Partial<Settings>);
  };
  const [focus] = useWheelList(ROWS.length, i => cycle(ROWS[i]));
  const list = useRef<HTMLDivElement>(null);
  useKeepInView(list, focus);
  return (
    <div ref={list} data-scroll className="flex h-full flex-col gap-1.5 overflow-y-auto [scrollbar-width:none]">
      {ROWS.map((row, i) => (
        <div key={row.key} className={`flex items-center gap-4 rounded-[var(--panel-radius)] px-4 py-2.5 ${i === focus ? 'bg-white/10' : 'bg-white/[0.045]'}`}>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[1.25rem] font-medium text-near">{row.label}</div>
            {row.note && <div className="truncate font-mono text-[0.75rem] text-dim">{row.note}</div>}
          </div>
          <div className="flex gap-1.5">
            {row.choices.map(c => {
              const on = settings[row.key] === c.value;
              return (
                <button
                  key={String(c.value)}
                  onClick={() => onChange({ [row.key]: c.value } as Partial<Settings>)}
                  className={`min-w-16 rounded-md px-3 py-2 font-mono text-[0.9375rem] font-medium transition-colors duration-150 ${
                    on ? 'bg-off-white text-screen' : 'bg-white/8 text-soft active:bg-white/14'
                  }`}>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});

export const Debug = memo(function Debug({
  daemon,
  source,
  state,
  entry,
}: {
  daemon: string;
  source: Settings['source'];
  state: TelemetryState;
  entry: DeviceEntry | null;
}) {
  const { upright } = useOrientation();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const view = useRef<HTMLDivElement>(null);
  useWheelScroll(view);
  const ago = (t: number | null) => (t === null ? 'never' : `${((Date.now() - t) / 1000).toFixed(1)}s ago`);
  const json = entry?.telemetry ? JSON.stringify(entry.telemetry, null, 2) : 'no telemetry yet';
  return (
    <div className={`h-full gap-5 ${upright ? 'flex flex-col' : 'grid grid-cols-[15rem_1fr]'}`}>
      <div className="flex flex-col gap-3 font-mono text-[0.875rem]">
        <Field label="Connection" value={daemon.toUpperCase()} />
        <Field label="Source" value={source.toUpperCase()} />
        <Field label="Device" value={entry?.info.id ?? '—'} extra={entry && <StatusIndicator online={entry.online} />} />
        <Field label="Last update" value={ago(entry?.lastUpdate ?? null)} />
        <Field label="Any message" value={ago(state.lastMessageAt)} />
        <Field label="Devices" value={String(state.order.length)} />
        {state.lastError && <Field label="Last error" value={state.lastError} />}
      </div>
      <div ref={view} data-scroll className="min-h-0 flex-1 overflow-y-auto rounded-[var(--panel-radius)] bg-black/60 px-3 py-2 ring-1 ring-white/8 [scrollbar-width:none]">
        <pre className="font-mono text-[0.75rem] leading-snug whitespace-pre-wrap text-soft">{json}</pre>
      </div>
    </div>
  );
});

function Field({ label, value, extra }: { label: string; value: string; extra?: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2 truncate text-[1rem] text-near">
        <span className="truncate">{value}</span>
        {extra}
      </div>
    </div>
  );
}

const MORE: { screen: Screen; label: string; note: string }[] = [
  { screen: 'processes', label: 'Processes', note: 'What is using it' },
  { screen: 'devices', label: 'Devices', note: 'Pick what to watch' },
  { screen: 'settings', label: 'Settings', note: 'Source, units, history' },
  { screen: 'debug', label: 'Debug', note: 'Raw telemetry' },
];

export const More = memo(function More({ onGo }: { onGo: (s: Screen) => void }) {
  const [focus] = useWheelList(MORE.length, i => onGo(MORE[i].screen));
  return (
    <div className="grid h-full grid-cols-2 grid-rows-2 gap-3">
      {MORE.map((m, i) => (
        <button
          key={m.screen}
          onClick={() => onGo(m.screen)}
          className={`flex flex-col justify-end gap-1 rounded-[var(--tile-radius)] px-4 py-3 text-left transition-colors duration-150 active:scale-[0.98] ${
            i === focus ? 'bg-white/12' : 'bg-white/[0.045]'
          }`}>
          <span className="font-display text-[1.625rem] font-semibold text-off-white">{m.label}</span>
          <span className="font-mono text-[0.8125rem] text-dim">{m.note}</span>
        </button>
      ))}
    </div>
  );
});
