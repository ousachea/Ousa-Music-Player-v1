// comic: the cover as a panel printed in halftone, the title said in a speech bubble, the artist in a caption box, and
// a burst going off whenever the song changes. the buttons are inked and offset like the panels
import { useState } from 'react';

import { FitTitle } from './fit-title';
import { Transport, hash, type StyleProps } from './style-kit';

const BURSTS = ['POW!', 'BAM!', 'ZAP!', 'WHAM!', 'BOOM!', 'KAPOW!'];
const INK = '#141414';

// the corners the burst lands in, a tap moving it on to the next
const SPOTS = ['top-2 right-2', 'bottom-2 left-2', 'top-2 left-2', 'bottom-2 right-2'];

// how far a tap has stepped the burst word and its corner on from where the song starts them; kept here, outside the style that is rebuilt
// for every track, so the word chosen carries on to the next songs until the app reloads
let stepped = 0;

// a starburst's points, alternating far and near, round a centre
function star(points: number, outer: number, inner: number, c: number) {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    return `${(c + Math.cos(a) * r).toFixed(1)},${(c + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
}

export function Comic({ artUrl, title, artist, accent, playing, motion, upright, showTransport, seek, onToggle, onPrev, onNext }: StyleProps) {
  const [step, setStep] = useState(stepped);
  const word = BURSTS[(hash(title) + step) % BURSTS.length];
  const nextWord = () => {
    stepped = step + 1;
    setStep(stepped);
  };
  const paper = accent ? `color-mix(in oklab, ${accent.fill} 35%, #fff3d6)` : '#fff3d6';

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background: paper,
        // the halftone dots a comic's flat colour is printed in
        backgroundImage: `radial-gradient(color-mix(in srgb, ${INK} 18%, transparent) 1.4px, transparent 1.6px)`,
        backgroundSize: '9px 9px',
      }}>
      <div className={`flex h-full ${upright ? 'flex-col justify-center gap-4 p-5' : 'items-center gap-7 p-7'}`}>
        {/* the panel */}
        {/* the whole panel is the tap target: a tap gives the burst a new word and moves it to the next corner */}
        <button
          aria-label="another burst"
          onClick={nextWord}
          // turned, the panel takes the column's full width as a square, so the whole cover shows and the screen fills
          className={`relative shrink-0 -rotate-[1.5deg] animate-hint overflow-hidden border-[5px] bg-black text-left shadow-[8px_8px_0_#141414] transition active:scale-[0.99] ${upright ? 'aspect-square w-full' : 'aspect-square h-[400px]'}`}
          style={{ borderColor: INK }}>
          {artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover saturate-[1.6] contrast-[1.15]" />}
          {/* halftone over the art, as if it went through the press */}
          <div className="pointer-events-none absolute inset-0 mix-blend-multiply [background-image:radial-gradient(rgba(0,0,0,0.55)_1.2px,transparent_1.6px)] [background-size:6px_6px]" />
          {/* the burst, going off as the song comes in */}
          <div className={`pointer-events-none absolute h-36 w-36 ${SPOTS[step % SPOTS.length]}`}>
          <svg viewBox="0 0 200 200" className={`h-full w-full ${motion ? 'animate-pop' : ''}`} key={title + word}>
            <polygon points={star(12, 96, 62, 100)} fill={INK} transform="translate(5 5)" />
            <polygon points={star(12, 96, 62, 100)} fill="#ffd400" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
            {/* the longer words set smaller, so every one sits inside the star */}
            <text x="100" y="112" textAnchor="middle" fontSize={word.length > 4 ? 31 : 40} fontWeight="900" fill="#e8202a" stroke={INK} strokeWidth="2.5" className="font-display italic">
              {word}
            </text>
          </svg>
          </div>
        </button>

        <div className={`flex min-w-0 flex-col ${upright ? 'gap-4' : 'flex-1 gap-6'}`}>
          {/* the speech bubble, its tail pointing back at the panel */}
          <div className="relative rounded-[28px] border-[4px] bg-white px-6 py-4 shadow-[6px_6px_0_#141414]" style={{ borderColor: INK }}>
            <FitTitle text={title} max={upright ? 30 : 34} lines={upright ? 2 : 3} className="font-display leading-[1.08] font-black text-[#141414] uppercase italic" />
            {upright ? (
              // turned, the panel is above, so the tail points up at it
              <svg viewBox="0 0 40 40" className="absolute -top-[34px] left-12 h-10 w-10">
                <polygon points="6,40 22,0 30,40" fill="#fff" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
                <rect x="8" y="36" width="20" height="8" fill="#fff" />
              </svg>
            ) : (
              <svg viewBox="0 0 40 40" className="absolute top-1/2 -left-[34px] h-10 w-10 -translate-y-1/2">
                <polygon points="40,6 0,22 40,30" fill="#fff" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
                <rect x="36" y="8" width="8" height="20" fill="#fff" />
              </svg>
            )}
          </div>
          {/* the caption box, the narrator's voice */}
          <div className="self-start border-[3px] bg-[#ffd400] px-4 py-1.5 font-display text-[1.125rem] font-bold text-[#141414] uppercase shadow-[4px_4px_0_#141414]" style={{ borderColor: INK }}>
            — {artist}
          </div>
          <div>{seek(INK, INK)}</div>
          {showTransport && (
            <Transport
              playing={playing}
              onToggle={onToggle}
              onPrev={onPrev}
              onNext={onNext}
              className={`gap-3 text-[#141414] ${upright ? 'justify-center' : ''}`}
              button="h-14 w-14 border-[3px] border-[#141414] bg-white shadow-[4px_4px_0_#141414] active:translate-x-1 active:translate-y-1 active:shadow-none"
              play="h-16 w-20 border-[3px] border-[#141414] bg-[#e8202a] text-white shadow-[4px_4px_0_#141414] active:translate-x-1 active:translate-y-1 active:shadow-none"
              icon="h-8 w-8"
            />
          )}
        </div>
      </div>
    </div>
  );
}
