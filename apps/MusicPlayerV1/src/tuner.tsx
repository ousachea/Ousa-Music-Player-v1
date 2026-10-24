// tuner: an old radio. a red needle travels the fm scale across the dial glass as the song plays, the song is typed on
// the station card in the cabinet below, and the buttons are the set's ivory preset keys
import { FitTitle } from './fit-title';
import { Transport, type StyleProps } from './style-kit';

const BAND = [88, 90, 92, 94, 96, 98, 100, 102, 104, 106, 108];

export function Tuner({
  title,
  artist,
  accent,
  playing,
  upright,
  showTransport,
  progress,
  seek,
  onToggle,
  onPrev,
  onNext,
}: StyleProps) {
  const at = Math.min(1, Math.max(0, progress));
  // the frequency the needle sits on, to one decimal, as the set would read it
  const mhz = (88 + at * 20).toFixed(1);
  const lamp = accent?.soft ?? '#ffb347';

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#2a1a10]">
      {/* walnut: long grain lines over a warm ground */}
      <div className="absolute inset-0 bg-[repeating-linear-gradient(92deg,rgba(0,0,0,0.12)_0_2px,transparent_2px_9px),linear-gradient(180deg,#5a3720,#3a2414)]" />

      <div className={`relative flex h-full flex-col ${upright ? 'gap-5 p-5' : 'gap-4 p-6'}`}>
        {/* the dial glass, lit warm from behind */}
        <div
          className="relative h-[150px] shrink-0 overflow-hidden rounded-xl ring-4 ring-[#c9a46a]/70"
          style={{ background: `radial-gradient(ellipse at 50% 60%, color-mix(in srgb, ${lamp} 55%, #1a120b), #120c07)` }}>
          {/* each number centred over its tick, so the ends stay inside the glass */}
          <div className="absolute inset-x-6 top-5 h-5 font-display text-[15px] font-semibold text-[#2a1a10]">
            {BAND.map((f, i) => (
              <span key={f} className="absolute -translate-x-1/2" style={{ left: `${(i / (BAND.length - 1)) * 100}%` }}>
                {f}
              </span>
            ))}
          </div>
          <div className="absolute inset-x-6 top-12 flex h-10 items-start justify-between">
            {Array.from({ length: 41 }, (_, i) => (
              <div key={i} className="w-[1.5px] bg-[#2a1a10]/80" style={{ height: i % 4 === 0 ? 26 : 12 }} />
            ))}
          </div>
          <div className="absolute inset-x-6 bottom-4 flex items-baseline justify-between font-mono text-[11px] tracking-[0.3em] text-[#2a1a10]/70">
            <span>FM</span>
            <span>{mhz} MHz</span>
          </div>
          {/* the needle, across the whole height of the glass */}
          <div className="absolute inset-y-2 left-6 right-6">
            <div className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-full bg-[#d12b1f] shadow-[0_0_6px_rgba(209,43,31,0.7)] transition-[left] duration-500 ease-out" style={{ left: `${at * 100}%` }} />
          </div>
          {/* the glass catching the room */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/18 to-transparent" />
        </div>

        <div className={`flex min-h-0 flex-1 gap-5 ${upright ? 'flex-col' : 'items-stretch'}`}>
          {/* the station card */}
          <div className="flex min-w-0 flex-1 -rotate-[0.6deg] flex-col justify-center rounded-sm bg-[#f2ead8] px-5 py-3 shadow-[0_6px_18px_rgba(0,0,0,0.45)]">
            <div className="font-mono text-[10px] tracking-[0.3em] text-[#7a5a3a]">NOW ON {mhz}</div>
            <FitTitle text={title} max={26} lines={2} className="font-display leading-tight font-bold text-[#2a1a10]" />
            <div className="truncate font-hand text-[22px] leading-tight text-[#5a3720]">{artist}</div>
            <div className="mt-2">{seek('#5a3720', '#2a1a10')}</div>
          </div>

          {showTransport && (
            // ivory piano keys, the play key a little longer than its neighbours
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className={`shrink-0 items-start gap-1.5 text-[#3a2414] ${upright ? 'justify-center' : ''}`}
              button="h-[120px] w-16 rounded-b-lg rounded-t-sm bg-gradient-to-b from-[#fbf6ea] to-[#d9cfb8] shadow-[0_6px_0_#8a7a5c,0_10px_16px_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-[0_2px_0_#8a7a5c]"
              play="h-[132px] w-20 rounded-b-lg rounded-t-sm bg-gradient-to-b from-[#fbf6ea] to-[#d9cfb8] shadow-[0_6px_0_#8a7a5c,0_10px_16px_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-[0_2px_0_#8a7a5c]"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
