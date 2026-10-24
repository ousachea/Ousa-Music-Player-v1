// neon: the title bent in glowing tube on a dark brick wall, in the album's colours. it flickers on when the song
// changes and now and then buzzes, the way an old sign does
import { FitTitle } from './fit-title';
import { Transport, type StyleProps } from './style-kit';

// the glow is stacked shadows: a white-hot core, then the colour spreading wider and fainter
const glow = (colour: string) =>
  `0 0 2px #fff, 0 0 6px ${colour}, 0 0 14px ${colour}, 0 0 28px ${colour}, 0 0 48px ${colour}`;

export function Neon({ title, artist, accent, playing, motion, upright, showTransport, seek, onToggle, onPrev, onNext }: StyleProps) {
  const tube = accent?.soft ?? '#ff4fd8';
  const tube2 = accent?.soft2 ?? '#4fd8ff';

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#140f10]"
      style={{
        // brick courses: mortar lines across, and the joints offset row to row
        backgroundImage:
          'linear-gradient(#0a0708 2px, transparent 2px), linear-gradient(90deg, #0a0708 2px, transparent 2px), linear-gradient(90deg, #0a0708 2px, transparent 2px)',
        backgroundSize: '100% 34px, 96px 68px, 96px 68px',
        backgroundPosition: '0 0, 0 0, 48px 34px',
        // the buttons glow in the tube's colour through this, since their classes are fixed strings
        ['--tube' as string]: tube,
      }}>
      {/* the wall lit by the sign, brightest behind the words */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 60% 50% at 50% 42%, color-mix(in srgb, ${tube} 18%, transparent), transparent 70%)` }} />

      <div className={`relative flex h-full flex-col items-center justify-center text-center ${upright ? 'gap-10 px-6' : 'gap-10 px-12'}`}>
        <div key={title} className={`w-full ${motion ? 'animate-neon-on' : ''}`}>
          <div className={motion && playing ? 'animate-neon-buzz' : ''} style={{ color: '#fff', textShadow: glow(tube) }}>
            <FitTitle text={title} max={upright ? 60 : 72} lines={2} className="w-full font-hand leading-[1.02] font-bold" />
          </div>
          <div className="mt-3 truncate font-display text-[1.375rem] tracking-[0.3em] uppercase" style={{ color: '#fff', textShadow: glow(tube2) }}>
            {artist}
          </div>
        </div>

        <div className={`flex w-full items-center gap-6 ${upright ? 'flex-col' : 'max-w-[620px]'}`}>
          <div className="w-full min-w-0 flex-1">{seek(tube, tube2)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className="shrink-0 gap-3 text-white"
              button="h-14 w-14 [filter:drop-shadow(0_0_6px_var(--tube))]"
              play="h-16 w-16 rounded-full ring-2 ring-white [filter:drop-shadow(0_0_8px_var(--tube))]"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
