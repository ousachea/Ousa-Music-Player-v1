// karaoke: the words on a karaoke screen, two lines at a time, the sung one filling with colour left to right as the
// song reaches it. lines take turns at the top and the bottom, so the next one is always waiting to be read
import { FitTitle } from './fit-title';
import { activeIndex, type Lyrics } from './lyrics';
import { Transport, type StyleProps } from './style-kit';

function Line({ text, sung, tint, motion }: { text: string; sung: number; tint: string; motion: boolean }) {
  const words = text || '♪';
  return (
    <span className="relative inline-block font-display leading-tight font-extrabold whitespace-nowrap text-white [-webkit-text-stroke:2px_#0b0b2a] [paint-order:stroke_fill]">
      {words}
      {/* the sung part is a second copy over the first, clipped to how far into the line the song is */}
      <span
        aria-hidden
        className="absolute inset-0 overflow-hidden whitespace-nowrap"
        style={{ width: `${sung * 100}%`, color: tint, transition: motion ? 'width 1s linear' : undefined }}>
        {words}
      </span>
    </span>
  );
}

export function Karaoke({ title, artist, accent, playing, motion, upright, showTransport, elapsed, duration, seek, onToggle, onPrev, onNext, lyrics }: StyleProps & { lyrics: Lyrics }) {
  const tint = accent?.soft ?? '#ffd400';
  const timed = lyrics.state === 'timed' ? lyrics.lines : null;
  const at = timed ? activeIndex(timed, elapsed) : -1;
  // a long line is set smaller rather than cut off
  const size = (text: string) => `${(upright ? 1.9 : 2.6) * Math.min(1, (upright ? 26 : 30) / Math.max(1, text.length))}rem`;

  // the two lines on screen: the sung one keeps its row, by its parity, and the next one takes the other
  const rows: { text: string; sung: number }[] = [];
  if (timed && at >= 0) {
    const from = timed[at].startMs;
    const to = timed[at + 1]?.startMs ?? (duration || from + 4000);
    const now = { text: timed[at].text, sung: Math.min(1, Math.max(0, (elapsed - from) / Math.max(300, to - from))) };
    const next = { text: timed[at + 1]?.text ?? '', sung: 0 };
    if (at % 2 === 0) rows.push(now, next);
    else rows.push(next, now);
  }
  // the count in before the first line, as dots that go out one by one
  const lead = timed && at < 0 ? Math.max(0, Math.ceil((timed[0].startMs - elapsed) / 1000)) : 0;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#06062a]" style={{ background: `radial-gradient(ellipse at 50% 120%, color-mix(in oklab, ${tint} 30%, #1b0b5a), #06062a 70%)` }}>
      {/* the stage lights, sweeping slowly while it plays */}
      <div className={`absolute -top-1/2 left-1/2 h-[150%] w-[140%] -translate-x-1/2 opacity-25 ${motion && playing ? 'animate-swirl' : ''}`} style={{ background: `conic-gradient(from 0deg, transparent 0 20deg, ${tint} 30deg, transparent 40deg 140deg, #ff4fd8 150deg, transparent 160deg 260deg, #4fd8ff 270deg, transparent 280deg)` }} />

      <div className={`relative flex h-full flex-col ${upright ? 'px-5 pt-6 pb-6' : 'px-10 pt-5 pb-6'}`}>
        <div className="flex items-center justify-between gap-4 font-mono text-[12px] tracking-[0.25em] text-white/70">
          <div className="min-w-0 truncate">
            <span className="mr-2 rounded-sm px-1.5 py-0.5 font-bold text-[#06062a]" style={{ background: tint }}>
              {playing ? 'SING' : 'PAUSED'}
            </span>
            {title.toUpperCase()} · {artist.toUpperCase()}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 text-center">
          {rows.length > 0 ? (
            rows.map((r, i) => (
              <div key={i} style={{ fontSize: size(r.text) }} className={`w-full ${i === 0 ? 'self-start text-left' : 'self-end text-right'}`}>
                <Line text={r.text} sung={r.sung} tint={tint} motion={motion} />
              </div>
            ))
          ) : (
            // the title card, before the words start and for a song with no timed words at all
            <div className="w-full">
              <FitTitle text={title} max={upright ? 46 : 60} lines={2} className="font-display leading-[1.05] font-black text-white [-webkit-text-stroke:2px_#0b0b2a] [paint-order:stroke_fill]" />
              <div className="mt-2 font-display text-[1.5rem] font-semibold" style={{ color: tint }}>
                {artist}
              </div>
              <div className="mt-6 font-mono text-[13px] tracking-[0.3em] text-white/60">
                {lead > 0
                  ? Array.from({ length: Math.min(4, lead) }, () => '●').join('  ')
                  : lyrics.state === 'loading'
                    ? 'FINDING THE WORDS'
                    : timed
                      ? ''
                      : 'NO TIMED WORDS FOR THIS SONG · HUM ALONG'}
              </div>
            </div>
          )}
        </div>

        <div className={`flex items-center gap-6 ${upright ? 'flex-col' : ''}`}>
          <div className="w-full min-w-0 flex-1">{seek(tint, accent?.soft2 ?? tint)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="shrink-0 gap-2 text-white"
              button="h-14 w-14 rounded-full bg-[#120a3a] ring-2 ring-white/35 shadow-[0_0_12px_rgba(255,79,216,0.45)]"
              play="h-[72px] w-[72px] rounded-full bg-gradient-to-b from-[#fff07a] to-[#ff9d00] text-[#3a1500] shadow-[0_0_22px_rgba(255,200,0,0.6),inset_0_2px_0_rgba(255,255,255,0.6)]"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
