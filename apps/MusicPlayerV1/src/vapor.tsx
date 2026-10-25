// vaporwave: a striped sun setting behind a grid that runs to the horizon, a chrome title, and the cover in an old
// desktop window. the palette is the genre's own, pink to cyan, so it does not follow the album
import { FitTitle } from './fit-title';
import { Transport, type StyleProps } from './style-kit';

const PINK = '#ff71ce';
const CYAN = '#01cdfe';

// the sun cut by bands that thicken towards its foot
const SUN_MASK = 'linear-gradient(to bottom, #000 0 52%, transparent 52% 56%, #000 56% 64%, transparent 64% 69%, #000 69% 76%, transparent 76% 82%, #000 82% 87%, transparent 87% 94%, #000 94%)';

export function Vapor({ artUrl, title, artist, album, playing, motion, upright, showTransport, seek, onToggle, onPrev, onNext }: StyleProps) {
  // upright, the horizon rises to the window so the sun stays behind it and off the words
  const horizon = upright ? 45 : 62;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(#1a0533 0%, #4b0f5e ${horizon * 0.65}%, #b8336a ${horizon}%, #1a0533 ${horizon + 0.2}%)` }}>
      {/* the sun sits on the horizon, which is the top of the grid */}
      <div
        className={`absolute h-[300px] w-[300px] -translate-x-1/2 rounded-full ${upright ? 'left-1/2' : 'left-[175px]'}`}
        // behind the window in landscape, so the title and the bar sit on the dark sky rather than on the sun
        style={{ top: `calc(${horizon}% - 230px)`, background: 'linear-gradient(#ffe259, #ff71ce 70%)', maskImage: SUN_MASK, WebkitMaskImage: SUN_MASK, filter: 'drop-shadow(0 0 30px #ff71ce)' }}
      />
      <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ height: `${100 - horizon}%`, perspective: 220, perspectiveOrigin: '50% 90px' }}>
        <div
          className={`absolute -inset-x-1/2 top-0 h-[200%] origin-top [transform:rotateX(62deg)] ${motion && playing ? 'animate-grid-run' : ''}`}
          style={{
            backgroundImage: `linear-gradient(${PINK} 2px, transparent 2px), linear-gradient(90deg, ${PINK} 2px, transparent 2px)`,
            backgroundSize: '60px 60px',
            filter: `drop-shadow(0 0 4px ${PINK})`,
          }}
        />
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#1a0533] to-transparent" />
      </div>

      <div className={`relative flex h-full items-center ${upright ? 'flex-col justify-center gap-6 px-6' : 'gap-8 px-10'}`}>
        {/* the cover in a window with a grey frame and a title bar, the way an old desktop drew one */}
        <div className={`shrink-0 border-2 border-t-white border-r-[#404040] border-b-[#404040] border-l-white bg-[#c0c0c0] p-1 shadow-[8px_8px_0_rgba(1,205,254,0.6)] ${upright ? 'w-[260px]' : 'w-[250px]'}`}>
          <div className="mb-1 flex items-center justify-between bg-gradient-to-r from-[#000080] to-[#1084d0] px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">
            <span className="truncate">{(album ?? 'cover').toLowerCase().replace(/\s+/g, '_')}.jpg</span>
            <span className="ml-2 grid h-3.5 w-3.5 place-items-center border border-t-white border-r-black border-b-black border-l-white bg-[#c0c0c0] text-[9px] leading-none text-black">x</span>
          </div>
          <div className="aspect-square bg-black">{artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover" />}</div>
        </div>

        <div className={`flex min-w-0 flex-1 flex-col gap-4 ${upright ? 'w-full text-center' : ''}`}>
          <div className="drop-shadow-[3px_3px_0_#01cdfe]">
            <FitTitle
              text={title}
              max={upright ? 46 : 54}
              lines={2}
              className="bg-gradient-to-b from-white via-[#ffd1f0] to-[#b967ff] bg-clip-text font-display leading-[1.02] font-black text-transparent italic"
            />
          </div>
          <div className="truncate font-display text-[1.375rem] tracking-[0.5em] uppercase" style={{ color: CYAN, textShadow: `0 0 10px ${CYAN}` }}>
            {artist}
          </div>
          <div className="w-full">{seek(PINK, CYAN)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className={`gap-3 text-white ${upright ? 'justify-center' : ''}`}
              button="h-14 w-14 [filter:drop-shadow(0_0_6px_#ff71ce)]"
              play="h-16 w-16 rounded-full bg-gradient-to-br from-[#ff71ce] to-[#01cdfe] text-white"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
