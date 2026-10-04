// what a widget opens into: the same widget large where that suits it, and everything else known about the thing
// below or beside it. back, or preset 1, returns to home on the page it came from
import { memo, useRef, type PointerEvent, type ReactNode } from 'react';

import { Label, Stat } from '../components/cards';
import { MiniGraph } from '../components/graphs';
import { AnimatedIcon, type IconKind } from '../components/icons';
import { toLayout, useOrientation } from '../components/stage';
import { duration, gb } from '../composables/useMetrics';
import { useClient, useNowPlaying } from '../composables/useNowPlaying';
import { usePlace } from '../composables/useLocation';
import { moonPhase, sunTimes } from '../composables/sun';
import { useWeatherContext } from '../composables/useWeather';
import { partsIn, useNow, useZoneContext } from '../composables/useZone';
import type { DeviceTelemetry } from '../protocol/types';
import type { Detail } from '../store/navigation';
import { updateSettings, useSettings, type Settings } from '../store/settings';
import type { DeviceEntry } from '../store/telemetry';
import { SCENE } from '../theme';
import { SunWidget } from './sun';
import { WeatherWidget } from './weather';
import { BatteryWidget, ClockWidget, sessionRecord, sessionShare } from './widgets-life';

function Head({ icon, color, children, right }: { icon: IconKind; color: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span style={{ color }}>
        <AnimatedIcon kind={icon} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1 truncate font-display text-[1.375rem] font-semibold text-near">{children}</span>
      {right}
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[var(--panel-radius)] bg-white/[0.045] px-4 py-3 ${className ?? ''}`}>{children}</div>;
}

/** a row of choices that sets one of the settings, as on the settings screen */
function Choice<K extends keyof Settings>({ k, options }: { k: K; options: { value: Settings[K]; label: string }[] }) {
  const client = useClient();
  const settings = useSettings();
  return (
    <div className="flex gap-1.5">
      {options.map(o => (
        <button
          key={String(o.value)}
          onClick={() => client && updateSettings(client, { [k]: o.value } as Partial<Settings>)}
          className={`rounded-md px-3 py-1.5 font-mono text-[0.8125rem] font-medium transition-colors duration-150 ${
            settings[k] === o.value ? 'bg-off-white text-screen' : 'bg-white/8 text-soft active:bg-white/14'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- weather

function WeatherDetail() {
  const w = useWeatherContext();
  const { tempUnit } = useSettings();
  const deg = (c: number | undefined) => (c === undefined ? '—' : `${Math.round(tempUnit === 'f' ? c * 1.8 + 32 : c)}°`);
  const compass = (d: number | undefined) => (d === undefined ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8]);
  const kind = (sky: string, day: boolean): IconKind => (sky === 'clear' ? (day ? 'sun' : 'moon') : sky === 'cloudy' ? 'cloud' : (sky as IconKind));
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="h-[44%] shrink-0">
        <WeatherWidget />
      </div>
      <div className="grid grid-cols-6 gap-3">
        <Stat label="Feels like" value={deg(w?.feels)} />
        <Stat label="High · low" value={w ? `${deg(w.high)} ${deg(w.low)}` : null} />
        <Stat label="Humidity" value={w?.humidity !== undefined ? `${Math.round(w.humidity)}%` : null} />
        <Stat label="Wind" value={w?.wind !== undefined ? `${Math.round(w.wind)} km/h` : null} sub={compass(w?.windFrom) || undefined} />
        <Stat label="UV index" value={w?.uv !== undefined ? w.uv.toFixed(1) : null} />
        <Stat label="Rain" value={w?.rainChance !== undefined ? `${Math.round(w.rainChance)}%` : null} sub="chance today" />
      </div>
      <Panel className="flex min-h-0 flex-1 items-center justify-between gap-1">
        {(w?.hours ?? []).map(h => (
          <div key={h.time} className="flex flex-col items-center gap-1.5">
            <span className="font-mono text-[0.6875rem] text-dim tabular-nums">{h.time}</span>
            <span className="text-near">
              <AnimatedIcon kind={kind(h.sky, h.day)} className="h-5 w-5" />
            </span>
            <span className="font-display text-[1rem] font-semibold text-off-white tabular-nums">{deg(h.celsius)}</span>
          </div>
        ))}
        {!w?.hours.length && <span className="font-mono text-[0.875rem] text-dim">The next hours appear once the forecast arrives</span>}
      </Panel>
    </div>
  );
}

// ---- sun

function MoonDisc({ phase, size = 56 }: { phase: number; size?: number }) {
  // the lit part as the overlap of the disc and an ellipse whose width follows the phase
  const r = size / 2;
  const k = Math.cos(phase * 2 * Math.PI) * r;
  const waxing = phase < 0.5;
  const d = `M${r} 0 A${r} ${r} 0 0 ${waxing ? 1 : 0} ${r} ${size} A${Math.abs(k)} ${r} 0 0 ${(k < 0) === waxing ? 1 : 0} ${r} 0Z`;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={r} cy={r} r={r} fill="rgba(255,255,255,0.1)" />
      <path d={d} fill="#f2efe4" />
    </svg>
  );
}

function SunDetail() {
  const place = usePlace();
  const zone = useZoneContext();
  const now = useNow(zone, 30_000);
  const at = now?.getTime() ?? Date.now();
  const fmt = (ms: number | null) => (ms === null || !zone ? '—' : partsIn(new Date(ms), zone).format({ hour: 'numeric', minute: '2-digit' }).format(new Date(ms)));
  const where = place && 'lat' in place ? place : null;
  const day = where ? sunTimes(at, where.lat, where.lon) : null;
  const civil = where ? sunTimes(at, where.lat, where.lon, -6) : null;
  const golden = where ? sunTimes(at, where.lat, where.lon, 6) : null;
  const moon = moonPhase(at);
  const length = day?.rise && day.set ? duration(Math.round((day.set - day.rise) / 1000)) : null;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="h-[46%] shrink-0">
        <SunWidget />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_auto] gap-3">
        <Panel className="grid grid-cols-4 content-center gap-x-4 gap-y-3">
          <Stat label="Dawn" value={fmt(civil?.rise ?? null)} sub="first light" />
          <Stat label="Sunrise" value={fmt(day?.rise ?? null)} />
          <Stat label="Solar noon" value={fmt(day?.noon ?? null)} />
          <Stat label="Sunset" value={fmt(day?.set ?? null)} />
          <Stat label="Dusk" value={fmt(civil?.set ?? null)} sub="last light" />
          <Stat label="Golden hour" value={fmt(golden?.set ?? null)} sub="evening begins" />
          <Stat label="Daylight" value={length} />
          <Stat label="Where" value={where ? `${where.lat.toFixed(2)}, ${where.lon.toFixed(2)}` : null} sub={where?.approximate ? 'approximate' : undefined} />
        </Panel>
        <Panel className="flex flex-col items-center justify-center gap-2">
          <MoonDisc phase={moon.phase} />
          <div className="text-center">
            <div className="font-display text-[1rem] font-semibold text-near">{moon.name}</div>
            <div className="font-mono text-[0.75rem] text-dim">{Math.round(moon.lit * 100)}% lit</div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ---- clock

function ClockDetail() {
  const zone = useZoneContext();
  const now = useNow(zone, 1000);
  if (!now || !zone) return <Head icon="clock" color={SCENE.clock.accent}>Waiting for the phone's time</Head>;
  const t = partsIn(now, zone);
  const start = Date.UTC(t.year, 0, 1);
  const today = Date.UTC(t.year, t.month - 1, t.day);
  const dayOfYear = Math.round((today - start) / 86_400_000) + 1;
  // iso week: the week holding the year's first thursday is week one
  const thursday = new Date(today + (3 - ((new Date(today).getUTCDay() + 6) % 7)) * 86_400_000);
  const week = Math.ceil(((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  const offsetMin = Math.round((Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute) - Math.floor(now.getTime() / 60_000) * 60_000) / 60_000);
  const offset = `UTC${offsetMin >= 0 ? '+' : '−'}${Math.floor(Math.abs(offsetMin) / 60)}${Math.abs(offsetMin) % 60 ? `:${String(Math.abs(offsetMin) % 60).padStart(2, '0')}` : ''}`;
  return (
    <div className="grid h-full grid-cols-[1.2fr_1fr] gap-4">
      <div className="grid min-h-0">
        <ClockWidget />
      </div>
      <div className="flex flex-col gap-3">
        <Head icon="clock" color={SCENE.clock.accent}>
          {t.format({ weekday: 'long' }).format(now)}
        </Head>
        <Panel className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Date" value={t.format({ day: 'numeric', month: 'short', year: 'numeric' }).format(now)} />
          <Stat label="Time zone" value={offset} sub={zone.tz ?? undefined} />
          <Stat label="Week" value={String(week)} />
          <Stat label="Day of year" value={String(dayOfYear)} />
        </Panel>
        <div className="mt-auto flex items-center justify-between gap-3">
          <Label>Face</Label>
          <Choice
            k="clockStyle"
            options={[
              { value: 'digital', label: 'Digital' },
              { value: 'led', label: 'LED' },
              { value: 'analog', label: 'Analog' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

// ---- calendar

function CalendarDetail() {
  const zone = useZoneContext();
  const now = useNow(zone, 60_000);
  if (!now || !zone) return <Head icon="calendar" color={SCENE.calendar.accent}>Waiting for the phone's date</Head>;
  const t = partsIn(now, zone);
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
  const first = utc(t.year, t.month, 1);
  const days = new Date(Date.UTC(t.year, t.month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells = [...Array.from({ length: lead }, () => 0), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(0);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const isoWeek = (d: number) => {
    const date = Date.UTC(t.year, t.month - 1, d);
    const thursday = new Date(date + (3 - ((new Date(date).getUTCDay() + 6) % 7)) * 86_400_000);
    return Math.ceil(((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  };
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(zone.locale ?? undefined, { ...o, timeZone: 'UTC' });
  const letters = Array.from({ length: 7 }, (_, i) => fmt({ weekday: 'short' }).format(utc(2024, 1, 1 + i)));
  const yearDays = (Date.UTC(t.year + 1, 0, 1) - Date.UTC(t.year, 0, 1)) / 86_400_000;
  const dayOfYear = Math.round((Date.UTC(t.year, t.month - 1, t.day) - Date.UTC(t.year, 0, 1)) / 86_400_000) + 1;
  return (
    <div className="grid h-full grid-cols-[1.5fr_1fr] gap-4">
      <Panel className="flex flex-col">
        <Head icon="calendar" color={SCENE.calendar.accent}>
          {fmt({ month: 'long', year: 'numeric' }).format(first)}
        </Head>
        <div className="mt-2 grid flex-1 grid-cols-[2rem_repeat(7,1fr)] content-between text-center font-body tabular-nums">
          <span className="font-mono text-[0.6875rem] text-dim">WK</span>
          {letters.map(l => (
            <span key={l} className="font-mono text-[0.6875rem] text-dim uppercase">
              {l}
            </span>
          ))}
          {weeks.map(row => (
            <div key={row.join()} className="contents">
              <span className="font-mono text-[0.75rem] leading-8 text-dim">{isoWeek(row.find(Boolean) ?? 1)}</span>
              {row.map((d, i) => (
                <span key={i} className="grid place-items-center">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full text-[1rem] ${
                      d === t.day ? 'font-semibold text-screen' : d ? (i >= 5 ? 'text-soft' : 'text-near') : ''
                    }`}
                    style={d === t.day ? { backgroundColor: SCENE.calendar.accent } : undefined}>
                    {d || ''}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </Panel>
      <div className="flex flex-col gap-3">
        <Panel className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Today" value={fmt({ weekday: 'long', day: 'numeric' }).format(utc(t.year, t.month, t.day))} />
          <Stat label="Week" value={String(isoWeek(t.day))} />
          <Stat label="Day of year" value={`${dayOfYear}`} sub={`of ${yearDays}`} />
          <Stat label="Left this year" value={`${yearDays - dayOfYear} days`} />
        </Panel>
        <Panel>
          <Label>{Math.round((dayOfYear / yearDays) * 100)}% of the year</Label>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${(dayOfYear / yearDays) * 100}%`, backgroundColor: SCENE.calendar.accent }} />
          </div>
        </Panel>
        <div className="mt-auto flex items-center justify-between gap-3">
          <Label>Widget</Label>
          <Choice
            k="calendarView"
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'day', label: 'Day' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

// ---- music

const clockText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function MusicDetail() {
  const client = useClient();
  return client ? <Music client={client} /> : null;
}

function Music({ client }: { client: NonNullable<ReturnType<typeof useClient>> }) {
  const { rotate } = useOrientation();
  const now = useNowPlaying(client);
  const bar = useRef<HTMLDivElement>(null);
  const track = now.state?.track ?? null;
  const playing = now.state?.playback.state === 'playing';
  const length = track?.durationMs ?? 0;
  // the bar is a scrubber: where it is touched, along its own length, is where the track goes
  const seek = (e: PointerEvent<HTMLDivElement>) => {
    if (!bar.current || !length) return;
    const box = bar.current.getBoundingClientRect();
    const mid = toLayout(box.left + box.width / 2, box.top + box.height / 2, rotate);
    const hit = toLayout(e.clientX, e.clientY, rotate);
    const ratio = Math.min(1, Math.max(0, 0.5 + (hit.x - mid.x) / bar.current.offsetWidth));
    void client.player.seekTo({ positionMs: Math.round(ratio * length) });
  };
  const key = (label: string, path: ReactNode, run: () => void, big?: boolean) => (
    <button
      aria-label={label}
      onClick={run}
      className={`grid place-items-center rounded-full transition-transform duration-150 active:scale-90 ${big ? 'h-16 w-16 bg-off-white text-screen' : 'h-12 w-12 text-off-white'}`}>
      <svg viewBox="0 0 24 24" className={big ? 'h-8 w-8' : 'h-7 w-7'} fill="currentColor">
        {path}
      </svg>
    </button>
  );
  const prev = <g transform="translate(24 0) scale(-1 1)"><path d="M5 6.2v11.6a.9.9 0 0 0 1.4.75l8.7-5.8a.9.9 0 0 0 0-1.5L6.4 5.45A.9.9 0 0 0 5 6.2ZM16.5 5.5h2.5v13h-2.5z" /></g>;
  const next = <path d="M5 6.2v11.6a.9.9 0 0 0 1.4.75l8.7-5.8a.9.9 0 0 0 0-1.5L6.4 5.45A.9.9 0 0 0 5 6.2ZM16.5 5.5h2.5v13h-2.5z" />;
  const play = <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />;
  const pause = <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />;
  return (
    <div className="relative isolate flex h-full gap-6 overflow-hidden rounded-[var(--tile-radius)] p-5">
      {now.artUrl && <img src={now.artUrl} alt="" className="absolute -inset-10 -z-10 h-[calc(100%+5rem)] w-[calc(100%+5rem)] object-cover opacity-45 blur-3xl" />}
      <div className="absolute inset-0 -z-10 bg-black/35" />
      <div className="aspect-square h-full shrink-0 overflow-hidden rounded-2xl bg-black/30 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
        {now.artUrl ? <img src={now.artUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center font-display text-[4rem] text-off-white/30">♪</div>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 text-off-white/70">
          {playing && <AnimatedIcon kind="music" className="h-4 w-4" />}
          <span className="font-mono text-[0.75rem] tracking-[0.16em] uppercase">{playing ? 'Playing' : track ? 'Paused' : 'Nothing playing'}</span>
        </div>
        <div className="mt-2 line-clamp-2 font-display text-[1.875rem] leading-tight font-semibold text-off-white">{track?.title ?? 'Start music on your phone'}</div>
        <div className="mt-1 truncate font-body text-[1.0625rem] text-off-white/75">{track?.artist ?? ''}</div>
        <div className="truncate font-body text-[0.9375rem] text-off-white/50">{track?.album ?? ''}</div>
        <div className="mt-auto">
          <div ref={bar} className="-my-3 cursor-pointer py-3" onPointerDown={seek}>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-off-white transition-[width] duration-1000 ease-linear" style={{ width: `${length ? Math.min(100, (now.position / length) * 100) : 0}%` }} />
            </div>
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[0.75rem] text-off-white/60 tabular-nums">
            <span>{clockText(now.position)}</span>
            <span>{length ? clockText(length) : '--:--'}</span>
          </div>
          <div className="mt-2 flex items-center justify-center gap-8">
            {key('previous', prev, () => void client.player.skipPrev({ allowSeeking: true }))}
            {key(playing ? 'pause' : 'play', playing ? pause : play, () => void (playing ? client.player.pause() : client.player.resume()), true)}
            {key('next', next, () => void client.player.skipNext())}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- battery

function BatteryDetail({ entry }: { entry: DeviceEntry }) {
  const { historySec } = useSettings();
  const b = entry.telemetry?.battery;
  if (!b) return <Head icon="battery" color={SCENE.graphite.accent}>No battery on {entry.info.name}</Head>;
  return (
    <div className="grid h-full grid-cols-[1fr_1fr] gap-4">
      <div className="grid min-h-0">
        <BatteryWidget battery={b} />
      </div>
      <div className="flex flex-col gap-3">
        <Panel className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Level" value={b.percentage !== undefined ? `${b.percentage}%` : null} />
          <Stat label="State" value={b.charging === undefined ? null : b.charging ? 'Charging' : 'On battery'} />
          <Stat label="Health" value={b.health !== undefined ? `${b.health}%` : null} sub="of its design capacity" />
          <Stat label="Cycles" value={b.cycleCount !== undefined ? String(b.cycleCount) : null} />
        </Panel>
        <Panel className="relative min-h-0 flex-1">
          <div className="absolute top-2 left-4">
            <Label>Level · since this opened</Label>
          </div>
          <MiniGraph windowSec={historySec} max={100} lines={[{ points: entry.history.battery, color: '#6fdc3c', fill: true }]} />
        </Panel>
      </div>
    </div>
  );
}

// ---- claude

const tokens = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)));

function ClaudeDetail({ t }: { t: DeviceTelemetry }) {
  const zone = useZoneContext();
  const now = useNow(zone, 15_000);
  const u = t.claude;
  if (!u) return <Head icon="claude" color={SCENE.claude.accent}>No Claude Code logs on this computer</Head>;
  const d = u.today;
  const total = d.input + d.output + d.cacheWrite + d.cacheRead;
  const s = u.session ?? null;
  const used = s ? sessionShare(s) : null;
  const at = (ms: number) => (zone ? partsIn(new Date(ms), zone).format({ hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) : '—');
  const left = s && now ? Math.max(0, s.resetAt - now.getTime()) : 0;
  const elapsed = s && now ? Math.min(100, ((now.getTime() - s.start) / (s.resetAt - s.start)) * 100) : 0;
  const parts = [
    { label: 'Cache read', value: d.cacheRead, color: SCENE.claude.accent },
    { label: 'Cache write', value: d.cacheWrite, color: SCENE.claude.soft },
    { label: 'Output', value: d.output, color: '#ffffff' },
    { label: 'Input', value: d.input, color: SCENE.apps.accent },
  ];
  const peak = Math.max(1, ...u.week);
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 86_400_000));
  const bar = (pct: number, color: string) => (
    <div className="h-2 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
  return (
    <div className="grid h-full grid-cols-[1.1fr_1fr] gap-4">
      <div className="flex min-h-0 flex-col gap-3">
        <Head icon="claude" color={SCENE.claude.accent} right={u.models[0] && <span className="rounded-full bg-white/10 px-2 py-0.5 font-body text-[0.75rem] text-soft">{u.models[0].name}</span>}>
          Current session
        </Head>
        {s ? (
          <Panel className="flex flex-1 flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[2.25rem] leading-none font-semibold tabular-nums text-off-white">{tokens(s.tokens)}</span>
              <span className="font-mono text-[0.75rem] text-dim">resets {at(s.resetAt)}</span>
            </div>
            <div>
              <div className="mb-1 flex justify-between font-body text-[0.8125rem]">
                <span className="text-soft">{used !== null ? `${Math.round(used)}% used` : sessionRecord(s) ? 'Busiest session this week' : 'Used'}</span>
                <span className="text-near">{used !== null ? `${100 - Math.round(used)}% left` : sessionRecord(s) ? `${Math.round((s.tokens / s.peak) * 100)}% of the last peak` : 'nothing to measure against yet'}</span>
              </div>
              {bar(used ?? (sessionRecord(s) ? 100 : 0), SCENE.claude.accent)}
            </div>
            <div>
              <div className="mb-1 flex justify-between font-body text-[0.8125rem]">
                <span className="text-soft">Window {Math.round(elapsed)}% gone</span>
                <span className="text-near">{span(left)} left</span>
              </div>
              {bar(elapsed, SCENE.claude.soft)}
            </div>
            <div className="mt-auto grid grid-cols-3 gap-x-3 gap-y-2">
              <Stat label="Started" value={at(s.start)} />
              <Stat label="Replies" value={String(s.replies)} />
              <Stat label="Pace" value={`${tokens(s.burnPerMin)}/m`} />
              <Stat label="By reset" value={tokens(s.projected)} />
              <Stat label="Last peak" value={s.peak ? tokens(s.peak) : null} />
              <Stat label="Today" value={tokens(total)} />
            </div>
            <div className="font-mono text-[0.625rem] leading-snug text-dim">Measured against your busiest session this week. Your plan's own limit is not in the logs.</div>
          </Panel>
        ) : (
          <Panel className="flex flex-1 flex-col justify-center gap-2">
            <span className="font-display text-[1.375rem] text-near">No session open</span>
            <span className="font-body text-[0.875rem] text-dim">The next message opens a five-hour window. Today: {tokens(total)} tokens, {d.replies} replies.</span>
          </Panel>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-3">
        <Panel className="flex flex-col gap-1.5">
          <Label>Today · {tokens(total)} · {d.replies} replies</Label>
          <div className="flex h-2.5 overflow-hidden rounded-full">
            {parts.map(p => (
              <span key={p.label} style={{ width: `${total ? (p.value / total) * 100 : 0}%`, backgroundColor: p.color }} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {parts.map(p => (
              <div key={p.label} className="flex items-center gap-1.5 font-body text-[0.8125rem]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="flex-1 truncate text-soft">{p.label}</span>
                <span className="text-near tabular-nums">{tokens(p.value)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="flex min-h-0 flex-1 flex-col">
          <Label>This week</Label>
          <div className="mt-1 flex min-h-0 flex-1 items-end gap-2">
            {u.week.map((v, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="font-mono text-[0.5625rem] text-dim tabular-nums">{v ? tokens(v) : ''}</span>
                <span className="w-full rounded-[4px]" style={{ height: `${Math.max(2, (v / peak) * 70)}%`, background: i === 6 ? SCENE.claude.soft : `${SCENE.claude.accent}80` }} />
                <span className={`font-body text-[0.625rem] ${i === 6 ? 'text-off-white' : 'text-dim'}`}>{days[i].toLocaleDateString(undefined, { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function span(ms: number) {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

// ---- system and displays

function SystemDetail({ entry }: { entry: DeviceEntry }) {
  const t = entry.telemetry;
  if (!t) return null;
  return (
    <div className="flex h-full flex-col gap-3">
      <Head icon="system" color={SCENE.graphite.accent}>
        {t.device.name}
      </Head>
      <Panel className="grid flex-1 grid-cols-3 content-center gap-x-6 gap-y-4">
        <Stat label="System" value={t.system.os ?? t.device.version ?? t.device.platform} />
        <Stat label="Kernel" value={t.system.kernel ?? null} />
        <Stat label="Up for" value={t.system.uptime !== undefined ? duration(t.system.uptime) : null} />
        <Stat label="Hostname" value={t.system.hostname ?? null} />
        <Stat label="Architecture" value={t.device.architecture ?? null} />
        <Stat label="Platform" value={t.device.platform} />
        <Stat label="Processor" value={t.cpu?.name ?? null} sub={t.cpu?.cores ? `${t.cpu.cores} cores · ${t.cpu.threads ?? t.cpu.cores} threads` : undefined} />
        <Stat label="Graphics" value={t.gpu?.name ?? null} />
        <Stat label="Memory" value={t.memory?.total !== undefined ? gb(t.memory.total) : null} />
        <Stat label="Disks" value={t.storage?.length ? String(t.storage.length) : null} sub={t.storage?.[0] ? `${t.storage[0].name} · ${gb(t.storage[0].total)}` : undefined} />
        <Stat label="Displays" value={t.displays?.length ? String(t.displays.length) : null} />
        <Stat label="Device id" value={t.device.id} />
      </Panel>
    </div>
  );
}

function DisplaysDetail({ t }: { t: DeviceTelemetry }) {
  const list = t.displays ?? [];
  const ratio = (w?: number, h?: number) => {
    if (!w || !h) return null;
    const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
    const d = g(w, h);
    return `${w / d}:${h / d}`;
  };
  return (
    <div className="flex h-full flex-col gap-3">
      <Head icon="displays" color={SCENE.displays.accent}>
        {list.length === 1 ? 'One display' : `${list.length} displays`}
      </Head>
      <div className="grid flex-1 grid-cols-2 gap-3">
        {list.map((d, i) => (
          <Panel key={i} className="flex flex-col justify-between">
            <div className="truncate font-display text-[1.25rem] font-semibold text-near">{d.name ?? `Display ${i + 1}`}</div>
            <div className="font-display text-[2.25rem] leading-none font-semibold tabular-nums text-off-white">{d.width && d.height ? `${d.width} × ${d.height}` : '—'}</div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Refresh" value={d.refreshRate ? `${d.refreshRate} Hz` : null} />
              <Stat label="Shape" value={ratio(d.width, d.height)} />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

export const DetailScreen = memo(function DetailScreen({ detail, entry }: { detail: Detail; entry: DeviceEntry | null }) {
  const t = entry?.telemetry ?? null;
  switch (detail) {
    case 'weather':
      return <WeatherDetail />;
    case 'sun':
      return <SunDetail />;
    case 'clock':
      return <ClockDetail />;
    case 'calendar':
      return <CalendarDetail />;
    case 'music':
      return <MusicDetail />;
    case 'battery':
      return entry ? <BatteryDetail entry={entry} /> : null;
    case 'claude':
      return t ? <ClaudeDetail t={t} /> : null;
    case 'system':
      return entry ? <SystemDetail entry={entry} /> : null;
    case 'displays':
      return t ? <DisplaysDetail t={t} /> : null;
  }
});

