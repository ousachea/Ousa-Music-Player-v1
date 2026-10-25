// stamp: the song as a postage stamp on an airmail envelope. the cover is the stamp's picture, the artist its
// country and the length its value, and a postmark cancels it with today's date and how far in the song is
import type { CSSProperties } from 'react';

import { FitTitle } from './fit-title';
import { Transport, fmt, hash, type StyleProps } from './style-kit';

// perforations: a hole every 16px round the edge, over a solid middle so only the edge is bitten
const PERFORATED: CSSProperties = {
  maskImage: 'radial-gradient(circle at 8px 8px, transparent 5px, #000 5.5px), linear-gradient(#000 0 0)',
  maskSize: '16px 16px, calc(100% - 16px) calc(100% - 16px)',
  maskPosition: '-8px -8px, center',
  maskRepeat: 'repeat, no-repeat',
  WebkitMaskImage: 'radial-gradient(circle at 8px 8px, transparent 5px, #000 5.5px), linear-gradient(#000 0 0)',
  WebkitMaskSize: '16px 16px, calc(100% - 16px) calc(100% - 16px)',
  WebkitMaskPosition: '-8px -8px, center',
  WebkitMaskRepeat: 'repeat, no-repeat',
};

export function Stamp({ artUrl, title, artist, album, accent, playing, upright, showTransport, elapsed, duration, seek, onToggle, onPrev, onNext }: StyleProps) {
  const tint = accent?.fill ?? '#c0392b';
  const tilt = ((hash(title) % 7) - 3) * 0.8;
  const date = new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const size = upright ? 250 : 270;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#efe6d2]" style={{ background: 'radial-gradient(ellipse at 40% 40%, #f6efde, #e2d5b8)' }}>
      {/* the airmail border round the envelope */}
      <div
        className="absolute inset-0"
        style={{
          background: 'repeating-linear-gradient(-45deg, #c8102e 0 18px, transparent 18px 30px, #1d3f8f 30px 48px, transparent 48px 60px)',
          maskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
          maskSize: '100% 100%, calc(100% - 20px) calc(100% - 20px)',
          maskPosition: 'center',
          maskRepeat: 'no-repeat',
          maskComposite: 'exclude',
          WebkitMaskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
          WebkitMaskSize: '100% 100%, calc(100% - 20px) calc(100% - 20px)',
          WebkitMaskPosition: 'center',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskComposite: 'xor',
        }}
      />

      <div className={`relative flex h-full ${upright ? 'flex-col items-center justify-center gap-6 px-8' : 'flex-row-reverse items-center gap-10 px-12'}`}>
        <div className="relative shrink-0" style={{ transform: `rotate(${tilt}deg)` }}>
          <div className="bg-[#fbf8f1] p-[18px] drop-shadow-[0_6px_10px_rgba(60,40,10,0.3)]" style={PERFORATED}>
            <div className="relative overflow-hidden border border-black/20 bg-black" style={{ width: size - 36, height: (size - 36) * 1.18 }}>
              {artUrl && <img src={artUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
              <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-2 pt-1.5 pb-4 font-display text-[13px] font-bold tracking-[0.2em] text-white uppercase">
                <div className="truncate">{artist}</div>
              </div>
              <div className="absolute right-2 bottom-1.5 font-display text-[26px] leading-none font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                {fmt(duration)}
              </div>
            </div>
          </div>
          {/* the postmark: a ringed date and wavy cancel lines, struck across a corner of the stamp */}
          <svg viewBox="0 0 260 120" className={`pointer-events-none absolute w-[260px] -rotate-12 opacity-75 ${upright ? '-top-8 -right-36' : '-bottom-6 -left-24'}`} style={{ color: '#1f2a44' }}>
            <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle cx="60" cy="60" r="38" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <text x="60" y="56" textAnchor="middle" fill="currentColor" className="font-mono" fontSize="12" fontWeight="700">
              {date}
            </text>
            <text x="60" y="74" textAnchor="middle" fill="currentColor" className="font-mono" fontSize="13" fontWeight="700">
              {fmt(elapsed)}
            </text>
            {[38, 52, 66, 80].map(y => (
              <path key={y} d={`M 118 ${y} q 17 -10 34 0 t 34 0 t 34 0 t 34 0`} fill="none" stroke="currentColor" strokeWidth="3" />
            ))}
          </svg>
        </div>

        <div className={`flex min-w-0 flex-1 flex-col gap-4 text-[#2b2418] ${upright ? 'w-full' : ''}`}>
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.3em]">
            <span className="rounded-sm px-1.5 py-0.5 text-white" style={{ background: tint }}>
              PAR AVION
            </span>
            {playing ? 'IN TRANSIT' : 'HELD AT DEPOT'}
          </div>
          <FitTitle text={title} max={upright ? 40 : 46} lines={2} className="font-display leading-[1.05] font-black tracking-tight" />
          {/* the address, written by hand on ruled lines */}
          <div className="font-hand text-[1.75rem] leading-[1.15]">
            <div className="border-b border-[#2b2418]/25">to whoever is driving,</div>
            <div className="truncate border-b border-[#2b2418]/25">{album ?? 'somewhere on the road'}</div>
          </div>
          <div className="w-full">{seek(tint, accent?.fill2 ?? tint)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className={`gap-2 text-[#2b2418] ${upright ? 'justify-center' : ''}`}
              button="h-14 w-14"
              play="h-16 w-16 rounded-full bg-[#2b2418] text-[#efe6d2]"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
