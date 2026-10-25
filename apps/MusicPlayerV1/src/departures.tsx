// departures: the airport board. the song playing is the flight boarding now, and what is queued on the phone
// lines up under it as the later departures, each due when the ones before it have played. a source that shares
// no up next, autoplay or a browser tab say, still has a history, so the board then lists what has already left
import type { Queue } from './queue';
import { Transport, fmt, hash, type StyleProps } from './style-kit';

const AMBER = '#ffb627';

// a flight number from the song, so each one keeps the same
function flight(text: string) {
  const h = hash(text);
  return `${String.fromCharCode(65 + (h % 26))}${String.fromCharCode(65 + ((h >>> 5) % 26))} ${100 + ((h >>> 10) % 900)}`;
}

function gate(text: string) {
  const h = hash(text);
  return `${String.fromCharCode(65 + (h % 6))}${1 + ((h >>> 3) % 24)}`;
}

export function Departures({
  title,
  artist,
  accent,
  playing,
  upright,
  showTransport,
  elapsed,
  duration,
  clock,
  seek,
  onToggle,
  onPrev,
  onNext,
  queue,
}: StyleProps & { queue: Queue | null }) {
  const tint = accent?.fill ?? AMBER;
  const room = upright ? 6 : 4;
  const next = (queue?.items ?? []).slice(0, room);
  const queued = next.length > 0;
  // each later song leaves once this one and every one before it has played
  let wait = Math.max(0, duration - elapsed);
  // history arrives oldest first, and can end on the song that is playing; each left that long before this one
  let ago = elapsed;
  const later = queued
    ? next.map(t => {
        const row = { title: t.title ?? 'unknown', artist: t.artist ?? '', due: `+${fmt(wait)}` };
        wait += t.durationMs ?? 0;
        return row;
      })
    : (queue?.previous ?? [])
        .filter((t, i, all) => !(i === all.length - 1 && t.title === title))
        .slice(-room)
        .reverse()
        .map(t => {
          ago += t.durationMs ?? 0;
          return { title: t.title ?? 'unknown', artist: t.artist ?? '', due: `-${fmt(ago)}` };
        });

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0a0f1c] font-mono" style={{ color: AMBER }}>
      <div className={`flex h-full flex-col ${upright ? 'gap-4 px-4 pt-6 pb-6' : 'gap-3 px-6 pt-4 pb-5'}`}>
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
            </svg>
            <div className="font-pixel text-[18px] tracking-[0.1em]">DEPARTURES</div>
          </div>
          <div className="text-white">{clock(26, '#ffffff')}</div>
        </div>

        {/* the column heads; the narrow board drops the gate to keep the song readable */}
        <div className={`grid gap-3 text-[10px] tracking-[0.25em] text-white/45 ${upright ? 'grid-cols-[1fr_auto]' : 'grid-cols-[76px_100px_1fr_56px_120px]'}`}>
          {!upright && <div>TIME</div>}
          {!upright && <div>FLIGHT</div>}
          <div>DESTINATION</div>
          {!upright && <div>GATE</div>}
          <div className="text-right">STATUS</div>
        </div>

        <div
          className={`grid items-center gap-3 rounded-md px-2 py-3 ${upright ? 'grid-cols-[1fr_auto]' : 'grid-cols-[76px_100px_1fr_56px_120px]'}`}
          style={{ background: `color-mix(in oklab, ${tint} 16%, transparent)`, boxShadow: `inset 3px 0 0 ${tint}` }}>
          {!upright && <div className="text-[18px] text-white">NOW</div>}
          {!upright && <div className="text-[16px]">{flight(title + artist)}</div>}
          <div className="min-w-0">
            <div className="truncate font-display text-[26px] leading-tight font-bold text-white uppercase">{title}</div>
            <div className="truncate text-[13px] tracking-[0.15em] uppercase opacity-80">via {artist}</div>
          </div>
          {!upright && <div className="text-[18px]">{gate(title)}</div>}
          <div className={`text-right text-[15px] font-bold tracking-[0.15em] ${playing ? 'animate-pulse' : ''}`} style={{ color: playing ? '#5dff8f' : AMBER }}>
            {playing ? 'BOARDING' : 'DELAYED'}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
          {later.length === 0 && <div className="px-2 pt-2 text-[13px] tracking-[0.2em] text-white/40">NO FURTHER DEPARTURES · QUEUE SONGS ON YOUR PHONE</div>}
          {!queued && later.length > 0 && <div className="px-2 text-[10px] tracking-[0.25em] text-white/40">NOTHING QUEUED · EARLIER DEPARTURES</div>}
          {later.map((t, i) => (
            <div
              key={i}
              className={`grid items-center gap-3 border-b border-white/5 px-2 py-1.5 ${upright ? 'grid-cols-[1fr_auto]' : 'grid-cols-[76px_100px_1fr_56px_120px]'}`}>
              {!upright && <div className="text-[15px] text-white/80">{t.due}</div>}
              {!upright && <div className="text-[14px]">{flight(t.title + t.artist)}</div>}
              <div className={`truncate text-[16px] uppercase ${queued ? 'text-white/90' : 'text-white/55'}`}>{t.title}</div>
              {!upright && <div className="text-[14px]">{gate(t.title)}</div>}
              <div className={`text-right text-[13px] tracking-[0.15em] ${queued ? '' : 'text-white/45'}`}>
                {upright ? t.due : !queued ? 'DEPARTED' : i === 0 ? 'GO TO GATE' : 'ON TIME'}
              </div>
            </div>
          ))}
        </div>

        <div className={`flex items-center gap-6 ${upright ? 'flex-col' : ''}`}>
          <div className="w-full min-w-0 flex-1">{seek(tint, accent?.fill2 ?? tint)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="shrink-0 gap-2"
              button="h-12 w-12 text-[#ffb627]"
              play="h-14 w-14 rounded-md bg-[#ffb627] text-[#0a0f1c]"
              icon="h-7 w-7"
            />
          )}
        </div>
      </div>
    </div>
  );
}
