// weather: the song as a forecast, laid out like a phone's weather app. the title is the place, the sky and the
// numbers are made from the song, and what is queued on the phone is the forecast; with nothing queued, earlier today
import type { Queue } from './queue';
import { Transport, fmt, hash, type StyleProps } from './style-kit';

const SKIES = ['Sunny', 'Partly cloudy', 'Cloudy', 'Rain', 'Thunderstorms', 'Clear night', 'Windy', 'Snow'] as const;
type Sky = (typeof SKIES)[number];

const BACKDROP: Record<Sky, string> = {
  Sunny: '#2f80ed, #56ccf2',
  'Partly cloudy': '#3d7cc9, #8fb8de',
  Cloudy: '#56636f, #98a5b1',
  Rain: '#283a4f, #4b6584',
  Thunderstorms: '#1c1a2e, #3d3a5c',
  'Clear night': '#0c1633, #2a3b6e',
  Windy: '#3a7bd5, #6fb1fc',
  Snow: '#5f7e9e, #b8cde0',
};

const skyOf = (text: string): Sky => SKIES[hash(text) % SKIES.length];
const tempOf = (text: string) => 8 + (hash(text + 't') % 26);

const CLOUD = 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18z';

function Icon({ sky, className }: { sky: Sky; className?: string }) {
  const sun = (
    <g>
      <circle cx="12" cy="12" r="4.5" fill="#ffd34d" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#ffd34d" strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
  const cloud = (fill = '#f2f5f8') => <path d={CLOUD} fill={fill} />;
  return (
    <svg viewBox="0 0 24 24" className={className}>
      {sky === 'Sunny' && sun}
      {sky === 'Partly cloudy' && (
        <>
          <g transform="translate(3 -3) scale(0.8)">{sun}</g>
          <g transform="translate(-1 3)">{cloud()}</g>
        </>
      )}
      {sky === 'Cloudy' && (
        <>
          <g transform="translate(3 -3) scale(0.8)">{cloud('#c9d1d9')}</g>
          <g transform="translate(-1 2)">{cloud()}</g>
        </>
      )}
      {sky === 'Rain' && (
        <>
          <g transform="translate(0 -3)">{cloud('#dfe5ea')}</g>
          <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="#6ec6ff" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {sky === 'Thunderstorms' && (
        <>
          <g transform="translate(0 -3)">{cloud('#b9c2cc')}</g>
          <path d="M12.5 15l-3 5h3l-1.5 4 4-6h-3l1.5-3z" fill="#ffd34d" />
        </>
      )}
      {sky === 'Clear night' && <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.4A7 7 0 0 1 15.5 3.5z" fill="#f1ecd2" />}
      {sky === 'Windy' && <path d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7" fill="none" stroke="#f2f5f8" strokeWidth="1.8" strokeLinecap="round" />}
      {sky === 'Snow' && (
        <>
          <g transform="translate(0 -3)">{cloud()}</g>
          {[7, 12, 17].map(x => (
            <circle key={x} cx={x} cy="20" r="1.2" fill="#fff" />
          ))}
        </>
      )}
    </svg>
  );
}

export function Weather({
  title,
  artist,
  album,
  accent,
  playing,
  upright,
  showTransport,
  elapsed,
  duration,
  seek,
  onToggle,
  onPrev,
  onNext,
  queue,
}: StyleProps & { queue: Queue | null }) {
  const sky = skyOf(title + artist);
  const h = hash(title + artist);
  const wind = 4 + ((h >>> 3) % 36);
  const humidity = 30 + ((h >>> 7) % 60);
  const tint = accent?.fill ?? '#ffffff';

  // the forecast: the songs queued next, each due when the ones before it have played; with nothing queued, the
  // songs that played before this one
  const room = upright ? 4 : 5;
  const next = (queue?.items ?? []).slice(0, room);
  const queued = next.length > 0;
  let at = Math.max(0, duration - elapsed);
  let ago = elapsed;
  const hours = queued
    ? next.map(t => {
        const row = { label: `+${fmt(at)}`, text: (t.title ?? '') + (t.artist ?? ''), title: t.title ?? '' };
        at += t.durationMs ?? 0;
        return row;
      })
    : (queue?.previous ?? [])
        .filter((t, i, all) => !(i === all.length - 1 && t.title === title))
        .slice(-room)
        .reverse()
        .map(t => {
          ago += t.durationMs ?? 0;
          return { label: `-${fmt(ago)}`, text: (t.title ?? '') + (t.artist ?? ''), title: t.title ?? '' };
        });

  return (
    <div
      className="absolute inset-0 overflow-hidden text-white"
      style={{ background: `linear-gradient(160deg, ${BACKDROP[sky]})`, ['--sky' as string]: BACKDROP[sky].split(',')[0] }}>
      {/* the album's colour washed over the sky, so the forecast still belongs to the cover */}
      <div className="absolute inset-0 opacity-25" style={{ background: `radial-gradient(circle at 80% 10%, ${tint}, transparent 60%)` }} />

      <div className={`relative flex h-full flex-col ${upright ? 'gap-5 p-6' : 'gap-3 px-7 pt-5 pb-5'}`}>
        <div className={`flex ${upright ? 'flex-col items-center text-center' : 'items-start justify-between'}`}>
          <div className={`min-w-0 ${upright ? 'w-full' : 'flex-1'}`}>
            <div className={`flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-white/85 ${upright ? 'justify-center' : ''}`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
              </svg>
              MY LOCATION
            </div>
            <div className="line-clamp-2 font-display text-[1.9rem] leading-tight font-semibold">{title}</div>
            <div className={`flex items-center gap-4 ${upright ? 'justify-center' : ''}`}>
              <div className="font-display text-[96px] leading-none font-extralight tracking-tight">{tempOf(title + artist)}°</div>
              {upright && <Icon sky={sky} className="h-24 w-24 drop-shadow-[0_6px_16px_rgba(0,0,0,0.25)]" />}
            </div>
            <div className="text-[1.1rem] font-medium">{sky}</div>
            <div className="truncate text-[0.95rem] text-white/80">
              Feels like {artist} · H:{fmt(duration)} L:{fmt(elapsed)}
            </div>
          </div>
          {!upright && (
            <div className="flex w-[300px] shrink-0 flex-col items-center gap-3">
              <Icon sky={sky} className="h-28 w-28 drop-shadow-[0_6px_16px_rgba(0,0,0,0.25)]" />
              <div className="grid w-full grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur-md">
                  <div className="text-white/65">WIND</div>
                  <div className="text-[1.1rem] font-semibold">{wind} km/h</div>
                </div>
                <div className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur-md">
                  <div className="text-white/65">HUMIDITY</div>
                  <div className="text-[1.1rem] font-semibold">{humidity}%</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* the hourly strip: the song now, then the forecast */}
        <div className="rounded-2xl bg-white/15 px-4 py-2.5 backdrop-blur-md">
          <div className="border-b border-white/20 pb-1.5 text-[11px] font-semibold tracking-wider text-white/70">
            {queued ? 'UP NEXT' : hours.length ? 'NOTHING QUEUED · EARLIER TODAY' : `NOW PLAYING${album ? ` FROM ${album.toUpperCase()}` : ''}`}
          </div>
          <div className="flex justify-between pt-2">
            {[{ label: 'Now', text: title + artist, title }, ...hours].slice(0, room + 1).map((hr, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="text-[12px] font-semibold">{hr.label}</div>
                <Icon sky={skyOf(hr.text)} className="h-7 w-7" />
                <div className="text-[1.05rem] font-semibold">{tempOf(hr.text)}°</div>
                <div className="w-full truncate px-1 text-center text-[10px] text-white/70">{hr.title}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={`mt-auto flex items-center gap-5 ${upright ? 'flex-col' : ''}`}>
          <div className="w-full min-w-0 flex-1">{seek('#ffffff', tint)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="shrink-0 gap-3 text-white"
              button="h-12 w-12 rounded-full bg-white/20 backdrop-blur-md"
              play="h-14 w-14 rounded-full bg-white text-[var(--sky)]"
              icon="h-7 w-7"
            />
          )}
        </div>
      </div>
    </div>
  );
}
