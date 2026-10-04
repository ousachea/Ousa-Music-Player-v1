// the widgets about the day rather than the machine: a battery that moves, a clock in three faces, a calendar in
// three spans, and what the phone is playing with its controls. clock and calendar change face on a tap, and the
// choice is kept with the rest of the settings
import { memo, type ReactNode } from 'react';

import { Caption, Figure, Icon, LOOKS, Tile, Title } from '../components/widget-kit';
import { useClient, useNowPlaying } from '../composables/useNowPlaying';
import { partsIn, useNow, useZoneContext, type Zone } from '../composables/useZone';
import type { BatteryInfo, ClaudeUsage } from '../protocol/types';
import { updateSettings, useSettings, type Settings } from '../store/settings';

// ---- battery

function levelColors(pct: number): [string, string] {
  if (pct < 20) return ['#ff4d4d', '#ff9a8a'];
  if (pct < 40) return ['#ffaa2e', '#ffd27a'];
  return ['#6fdc3c', '#c9f78a'];
}

/** where the bubbles rise inside the charge, fixed so a re-render never restarts one mid-rise */
const BUBBLES = [
  { left: 12, size: 4, duration: 2.4, delay: 0 },
  { left: 28, size: 6, duration: 3.1, delay: -1.2 },
  { left: 44, size: 3, duration: 2.0, delay: -0.6 },
  { left: 58, size: 5, duration: 2.8, delay: -2.1 },
  { left: 72, size: 4, duration: 2.3, delay: -1.6 },
  { left: 86, size: 3, duration: 1.9, delay: -0.3 },
];

export const BatteryWidget = memo(function BatteryWidget({ battery }: { battery: BatteryInfo }) {
  const pct = Math.min(100, Math.max(0, battery.percentage ?? 0));
  const [from, to] = levelColors(pct);
  const charging = !!battery.charging;
  return (
    <Tile look={LOOKS.graphite}>
      <div className="flex items-center justify-between gap-2">
        <Title icon={Icon.battery}>Battery</Title>
        {battery.health !== undefined && (
          <span className="font-mono text-[0.6875rem] tracking-[0.16em] whitespace-nowrap text-off-white/60 uppercase">Health {battery.health}%</span>
        )}
      </div>
      <div className="mt-auto flex items-center gap-3">
        <div className="relative h-[58px] flex-1 rounded-[14px] border-2 border-white/60 p-[5px] shadow-[inset_0_0_12px_rgba(0,0,0,0.5)]">
          <span className="absolute top-1/2 -right-[9px] h-6 w-[6px] -translate-y-1/2 rounded-r-[3px] bg-white/60" />
          {/* the inside: an empty well the charge fills, clipped to its corners */}
          <div className="relative h-full overflow-hidden rounded-[9px] bg-white/[0.06]">
            <div
              className={`absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-1000 ease-out ${!charging && pct < 20 ? 'battery-low' : ''}`}
              style={{ width: `${Math.max(6, pct)}%`, background: `linear-gradient(90deg, ${from}, ${to})` }}>
              {/* gloss along the top, so the charge reads as something with depth */}
              <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent" />
              {charging &&
                BUBBLES.map((b, i) => (
                  <span
                    key={i}
                    className="battery-bubble absolute bottom-1 rounded-full bg-white/70"
                    style={{ left: `${b.left}%`, width: b.size, height: b.size, animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }}
                  />
                ))}
            </div>
            {/* the charge's leading edge rolls like the surface of a liquid; slower when nothing is coming in */}
            {pct < 99 && (
              <span className="absolute inset-y-0 w-[10px] overflow-hidden" style={{ left: `calc(${Math.max(6, pct)}% - 1px)` }}>
                <svg viewBox="0 0 10 40" preserveAspectRatio="none" className="battery-wave absolute top-0 left-0 h-[200%] w-full" style={{ animationDuration: charging ? '1.4s' : '4s' }}>
                  <path d="M0 0H4C9 2.5 9 7.5 4 10S-1 17.5 4 20 9 27.5 4 30-1 37.5 4 40H0Z" fill={to} />
                </svg>
              </span>
            )}
            {/* energy coming in: pulses travelling from the tip across the empty well into the charge */}
            {charging && pct < 97 && (
              <span className="absolute inset-y-0 right-0 overflow-hidden" style={{ left: `${Math.max(6, pct)}%` }}>
                {[0, 1, 2].map(i => (
                  <span key={i} className="battery-flow absolute inset-0" style={{ animationDelay: `${i * -0.6}s` }}>
                    <span className="absolute top-1/2 right-0 h-[6px] w-[14px] -translate-y-1/2 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${to})`, boxShadow: `0 0 8px ${to}` }} />
                  </span>
                ))}
              </span>
            )}
          </div>
          {charging && (
            <>
              <span className="bolt-halo absolute top-1/2 left-1/2 h-12 w-12 rounded-full" style={{ background: `radial-gradient(circle, ${to} 0%, transparent 65%)` }} />
              <svg viewBox="0 0 24 24" className="absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]">
                <defs>
                  <linearGradient id="bolt-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#fff4c2" />
                  </linearGradient>
                </defs>
                <path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z" fill="url(#bolt-fill)" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <Figure value={String(Math.round(pct))} unit="%" size={2} />
        <div className="min-w-0 text-right">
          <Caption>{charging ? 'Charging' : 'On battery'}</Caption>
          {battery.cycleCount !== undefined && <Caption>{battery.cycleCount} cycles</Caption>}
        </div>
      </div>
    </Tile>
  );
});

// ---- clock

const CLOCK_STYLES: Settings['clockStyle'][] = ['digital', 'led', 'analog'];
const CLOCK_NAMES: Record<Settings['clockStyle'], string> = { digital: 'Digital', led: 'LED', analog: 'Analog' };

/** the seven segments a-g of each digit, as which are lit */
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
};

const SEGMENT_SHAPES: Record<string, string> = {
  a: 'M8 4h24l-4 5H12z',
  b: 'M33 6l4 4v22l-4 3-4-4V11z',
  c: 'M33 37l4 3v21l-4 4-4-5V41z',
  d: 'M12 61h16l4 5H8z',
  e: 'M7 37l4 4v19l-4 5-4-4V40z',
  f: 'M7 6l4 5v20l-4 4-4-3V10z',
  g: 'M11 33h18l3 2.5-3 2.5H11l-3-2.5z',
};

function LedDigit({ digit, x, color }: { digit: string; x: number; color: string }) {
  const lit = SEGMENTS[digit] ?? '';
  return (
    <g transform={`translate(${x} 0) skewX(-6)`}>
      {Object.entries(SEGMENT_SHAPES).map(([seg, d]) => (
        <path key={seg} d={d} fill={color} opacity={lit.includes(seg) ? 1 : 0.08} />
      ))}
    </g>
  );
}

function hour12(zone: Zone) {
  try {
    return new Intl.DateTimeFormat(zone.locale ?? undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false;
  } catch {
    return false;
  }
}

export const ClockWidget = memo(function ClockWidget() {
  const zone = useZoneContext();
  const client = useClient();
  const { clockStyle } = useSettings();
  const now = useNow(zone, 1000);
  const next = () => client && updateSettings(client, { clockStyle: CLOCK_STYLES[(CLOCK_STYLES.indexOf(clockStyle) + 1) % CLOCK_STYLES.length] });

  let face: ReactNode = <Caption>Waiting for the phone's time</Caption>;
  if (now && zone) {
    const t = partsIn(now, zone);
    const twelve = hour12(zone);
    const h = twelve ? t.hour % 12 || 12 : t.hour;
    const hh = twelve ? String(h) : String(h).padStart(2, '0');
    const mm = String(t.minute).padStart(2, '0');
    const date = t.format({ weekday: 'short', day: 'numeric', month: 'short' }).format(now);
    if (clockStyle === 'analog') {
      const hand = (deg: number, len: number, width: number, color: string) => (
        <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} stroke={color} strokeWidth={width} strokeLinecap="round" />
      );
      face = (
        <div className="mt-1 flex min-h-0 flex-1 items-center gap-3">
          <svg viewBox="0 0 100 100" className="aspect-square h-full max-h-[118px]">
            <circle cx="50" cy="50" r="47" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
            {Array.from({ length: 12 }, (_, i) => (
              <line key={i} x1="50" y1={i % 3 === 0 ? 7 : 9} x2="50" y2="13" stroke="rgba(255,255,255,0.8)" strokeWidth={i % 3 === 0 ? 2.6 : 1.4} strokeLinecap="round" transform={`rotate(${i * 30} 50 50)`} />
            ))}
            {hand((t.hour % 12) * 30 + t.minute * 0.5, 24, 4.5, '#ffffff')}
            {hand(t.minute * 6 + t.second * 0.1, 35, 3, '#ffffff')}
            {hand(t.second * 6, 38, 1.4, '#ff6b4a')}
            <circle cx="50" cy="50" r="3.2" fill="#ff6b4a" />
          </svg>
          <div className="min-w-0">
            <Figure value={`${hh}:${mm}`} size={1.5} />
            <Caption>{date}</Caption>
          </div>
        </div>
      );
    } else if (clockStyle === 'led') {
      const digits = `${hh.padStart(2, ' ')}${mm}`;
      const color = '#ff4b3a';
      face = (
        <div className="mt-auto">
          <svg viewBox="0 0 190 70" className="w-full drop-shadow-[0_0_8px_rgba(255,75,58,0.55)]">
            <LedDigit digit={digits[0]} x={0} color={color} />
            <LedDigit digit={digits[1]} x={44} color={color} />
            {/* the colon blinks with the seconds, the way a bedside clock's does */}
            <circle cx="93" cy="24" r="3.6" fill={color} opacity={t.second % 2 ? 0.15 : 1} />
            <circle cx="91" cy="46" r="3.6" fill={color} opacity={t.second % 2 ? 0.15 : 1} />
            <LedDigit digit={digits[2]} x={104} color={color} />
            <LedDigit digit={digits[3]} x={148} color={color} />
          </svg>
          <div className="mt-1">
            <Caption>{date}</Caption>
          </div>
        </div>
      );
    } else {
      face = (
        <div className="mt-auto">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-[3.25rem] leading-none font-semibold tabular-nums tracking-display text-off-white">
              {hh}:{mm}
            </span>
            <span className="font-display text-[1.25rem] font-medium tabular-nums text-off-white/55">{String(t.second).padStart(2, '0')}</span>
          </div>
          <Caption>{date}</Caption>
        </div>
      );
    }
  }
  return (
    <Tile look={LOOKS.clock} onOpen={next}>
      <div className="flex items-baseline justify-between">
        <Title>Clock</Title>
        <span className="font-mono text-[0.6875rem] tracking-[0.16em] text-off-white/50 uppercase">{CLOCK_NAMES[clockStyle]}</span>
      </div>
      {face}
    </Tile>
  );
});

// ---- calendar

const CAL_VIEWS: Settings['calendarView'][] = ['month', 'week', 'day'];

/** a plain date, kept in utc so day arithmetic never trips over a daylight-saving change */
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
/** monday first, as most of the world counts a week */
const mondayIndex = (date: Date) => (date.getUTCDay() + 6) % 7;

export const CalendarWidget = memo(function CalendarWidget() {
  const zone = useZoneContext();
  const client = useClient();
  const { calendarView } = useSettings();
  const now = useNow(zone, 30_000);
  const next = () => client && updateSettings(client, { calendarView: CAL_VIEWS[(CAL_VIEWS.indexOf(calendarView) + 1) % CAL_VIEWS.length] });

  let body: ReactNode = <Caption>Waiting for the phone's date</Caption>;
  let title = 'Calendar';
  if (now && zone) {
    const t = partsIn(now, zone);
    const today = utc(t.year, t.month, t.day);
    const fmt = (o: Intl.DateTimeFormatOptions) => {
      try {
        return new Intl.DateTimeFormat(zone.locale ?? undefined, { ...o, timeZone: 'UTC' });
      } catch {
        return new Intl.DateTimeFormat(undefined, { ...o, timeZone: 'UTC' });
      }
    };
    const weekdayLetters = Array.from({ length: 7 }, (_, i) => fmt({ weekday: 'narrow' }).format(utc(2024, 1, 1 + i)));

    if (calendarView === 'month') {
      title = fmt({ month: 'long', year: 'numeric' }).format(today);
      const first = utc(t.year, t.month, 1);
      const days = new Date(Date.UTC(t.year, t.month, 0)).getUTCDate();
      const lead = mondayIndex(first);
      const cells = [...Array.from({ length: lead }, () => 0), ...Array.from({ length: days }, (_, i) => i + 1)];
      body = (
        <div className="mt-1 grid flex-1 grid-cols-7 content-start gap-x-0.5 text-center font-body text-[0.6875rem] leading-[15px] tabular-nums">
          {weekdayLetters.map((l, i) => (
            <span key={`h${i}`} className="text-off-white/45">
              {l}
            </span>
          ))}
          {cells.map((d, i) => (
            <span key={i} className={d === t.day ? 'mx-auto w-[18px] rounded-full bg-off-white font-semibold text-screen' : d ? 'text-off-white/85' : ''}>
              {d || ''}
            </span>
          ))}
        </div>
      );
    } else if (calendarView === 'week') {
      title = fmt({ month: 'long', year: 'numeric' }).format(today);
      const monday = new Date(today.getTime() - mondayIndex(today) * 86_400_000);
      const week = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86_400_000));
      body = (
        <div className="mt-auto grid grid-cols-7 gap-1 text-center">
          {week.map((d, i) => {
            const on = d.getTime() === today.getTime();
            return (
              <div key={i} className={`flex flex-col items-center gap-1 rounded-full py-2 ${on ? 'bg-off-white text-screen' : 'text-off-white/80'}`}>
                <span className={`font-body text-[0.6875rem] ${on ? 'text-screen/70' : 'text-off-white/45'}`}>{weekdayLetters[i]}</span>
                <span className="font-display text-[1rem] font-semibold tabular-nums">{d.getUTCDate()}</span>
              </div>
            );
          })}
        </div>
      );
    } else {
      title = fmt({ weekday: 'long' }).format(today);
      body = (
        <div className="mt-auto">
          <div className="font-display text-[4rem] leading-none font-semibold tabular-nums tracking-display text-off-white">{t.day}</div>
          <Caption>{fmt({ month: 'long', year: 'numeric' }).format(today)}</Caption>
        </div>
      );
    }
  }
  return (
    <Tile look={LOOKS.calendar} onOpen={next}>
      <div className="flex items-baseline justify-between gap-2">
        <Title>{title}</Title>
        <span className="font-mono text-[0.6875rem] tracking-[0.16em] text-off-white/50 uppercase">{calendarView}</span>
      </div>
      {body}
    </Tile>
  );
});

// ---- music

const clockText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Glyph({ kind }: { kind: 'prev' | 'next' | 'play' | 'pause' }) {
  if (kind === 'play') return <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />;
  if (kind === 'pause') return <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />;
  const shape = <path d="M5 6.2v11.6a.9.9 0 0 0 1.4.75l8.7-5.8a.9.9 0 0 0 0-1.5L6.4 5.45A.9.9 0 0 0 5 6.2ZM16.5 5.5h2.5v13h-2.5z" />;
  return kind === 'next' ? shape : <g transform="translate(24 0) scale(-1 1)">{shape}</g>;
}

export const MusicWidget = memo(function MusicWidget() {
  const client = useClient();
  if (!client) return null;
  return <Music client={client} />;
});

function Music({ client }: { client: NonNullable<ReturnType<typeof useClient>> }) {
  const { state, artUrl, position } = useNowPlaying(client);
  const track = state?.track ?? null;
  const playing = state?.playback.state === 'playing';
  const duration = track?.durationMs ?? 0;
  const key = (label: string, kind: 'prev' | 'next' | 'play' | 'pause', run: () => void, big?: boolean) => (
    <button
      aria-label={label}
      onClick={run}
      className={`grid place-items-center rounded-full transition-transform duration-150 active:scale-90 ${big ? 'h-12 w-12 bg-off-white text-screen' : 'h-10 w-10 text-off-white'}`}>
      <svg viewBox="0 0 24 24" className={big ? 'h-6 w-6' : 'h-6 w-6'} fill="currentColor">
        <Glyph kind={kind} />
      </svg>
    </button>
  );
  return (
    <Tile look={LOOKS.graphite}>
      {/* the cover, blurred, is the tile's light while something plays */}
      {artUrl && <img src={artUrl} alt="" className="pointer-events-none absolute -inset-6 -z-10 h-[calc(100%+3rem)] w-[calc(100%+3rem)] scale-110 object-cover opacity-55 blur-2xl" />}
      <div className="flex h-full min-h-0 gap-4">
        <div className="aspect-square h-full shrink-0 overflow-hidden rounded-2xl bg-black/30 shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
          {artUrl ? (
            <img src={artUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center font-display text-[2.5rem] text-off-white/40">♪</div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate font-display text-[1.25rem] leading-tight font-semibold text-off-white">{track?.title ?? 'Nothing playing'}</div>
          <Caption>{track ? (track.artist ?? '—') : 'Start music on your phone'}</Caption>
          <div className="mt-auto">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-off-white transition-[width] duration-1000 ease-linear" style={{ width: `${duration ? Math.min(100, (position / duration) * 100) : 0}%` }} />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[0.6875rem] text-off-white/55 tabular-nums">
              <span>{clockText(position)}</span>
              <span>{duration ? clockText(duration) : '--:--'}</span>
            </div>
            <div className="mt-1 flex items-center justify-center gap-5">
              {key('previous', 'prev', () => void client.player.skipPrev({ allowSeeking: true }))}
              {key(playing ? 'pause' : 'play', playing ? 'pause' : 'play', () => void (playing ? client.player.pause() : client.player.resume()), true)}
              {key('next', 'next', () => void client.player.skipNext())}
            </div>
          </div>
        </div>
      </div>
    </Tile>
  );
}

// ---- claude

const tokens = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(Math.round(v));

/** claude code's day on this machine: today's tokens, how they split, and the week as bars */
export const ClaudeWidget = memo(function ClaudeWidget({ usage }: { usage: ClaudeUsage }) {
  const d = usage.today;
  const total = d.input + d.output + d.cacheWrite + d.cacheRead;
  const peak = Math.max(1, ...usage.week);
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 86_400_000));
  return (
    <Tile look={LOOKS.claude}>
      <div className="flex h-full gap-5">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2.5">
            {/* the asterisk claude wears, drawn as eight rays */}
            <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-[#ffd2bd]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
            </svg>
            <span className="truncate font-display text-[1.25rem] font-semibold text-off-white">Claude Code</span>
            {usage.models[0] && <span className="ml-auto rounded-full bg-white/14 px-2 py-0.5 font-body text-[0.75rem] whitespace-nowrap text-off-white/85">{usage.models[0].name}</span>}
          </div>
          <div className="mt-auto">
            <Figure value={tokens(total)} unit="tokens" size={2.75} />
            <Caption>
              today · {d.replies} {d.replies === 1 ? 'reply' : 'replies'} · {d.sessions} {d.sessions === 1 ? 'session' : 'sessions'}
            </Caption>
            <div className="mt-1 truncate font-mono text-[0.6875rem] text-off-white/55 tabular-nums">
              in {tokens(d.input)} · out {tokens(d.output)} · cache {tokens(d.cacheWrite + d.cacheRead)}
            </div>
          </div>
        </div>
        <div className="flex w-[40%] shrink-0 flex-col">
          <span className="font-mono text-[0.6875rem] tracking-[0.16em] text-off-white/55">THIS WEEK</span>
          <div className="mt-2 flex min-h-0 flex-1 items-end gap-1.5">
            {usage.week.map((v, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span
                  className="w-full rounded-[4px] transition-[height] duration-700 ease-out"
                  style={{ height: `${Math.max(3, (v / peak) * 100)}%`, background: i === 6 ? '#fff4ee' : 'rgba(255,214,196,0.45)' }}
                />
                <span className={`font-body text-[0.625rem] ${i === 6 ? 'text-off-white' : 'text-off-white/50'}`}>
                  {days[i].toLocaleDateString(undefined, { weekday: 'narrow' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Tile>
  );
});
