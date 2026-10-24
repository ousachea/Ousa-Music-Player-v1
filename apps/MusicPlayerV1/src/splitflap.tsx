// split-flap: the track on a departures board. every cell flips through letters before it lands on its own, in a
// ripple from the left, whenever what it shows changes, the time included
import { useEffect, useRef, useState } from 'react';

import { Transport, fmt, type StyleProps } from './style-kit';

const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-.';
const FLIP_MS = 55;
// a ripple, not a wall: each cell starts this much after the one to its left
const STAGGER_MS = 28;

// grapheme clusters, so a khmer consonant with its marks stays in one cell
function cells(text: string): string[] {
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  return seg ? Array.from(seg.segment(text), s => s.segment) : Array.from(text);
}

// fills rows of `cols` cells, breaking at spaces where it can; a word longer than a row is split
function rows(text: string, cols: number, max: number): string[][] {
  const out: string[][] = [];
  let line: string[] = [];
  for (const word of text.toUpperCase().split(/\s+/).filter(Boolean)) {
    let w = cells(word);
    while (w.length > cols) {
      if (line.length) out.push(line), (line = []);
      out.push(w.slice(0, cols));
      w = w.slice(cols);
    }
    if (line.length + (line.length ? 1 : 0) + w.length > cols) out.push(line), (line = []);
    line = line.length ? [...line, ' ', ...w] : w;
  }
  if (line.length) out.push(line);
  const kept = out.slice(0, max);
  // the board has a fixed number of rows; what will not fit ends on a mark that says so
  if (out.length > max) kept[max - 1] = [...kept[max - 1].slice(0, cols - 1), '…'];
  return kept.map(r => [...r, ...Array(cols - r.length).fill(' ')]);
}

function Cell({ ch, delay, motion, size }: { ch: string; delay: number; motion: boolean; size: number }) {
  const [shown, setShown] = useState(ch);
  const first = useRef(true);

  useEffect(() => {
    // the board comes up already set; it only flips for a change
    if (first.current || !motion || ch.length > 1 || !DRUM.includes(ch)) {
      first.current = false;
      setShown(ch);
      return;
    }
    const target = DRUM.indexOf(ch);
    // a few flips before the letter rather than a full turn of the drum, which the device's cpu could not keep up with
    let i = (target - 5 - (delay % 4) + DRUM.length) % DRUM.length;
    let timer = setTimeout(function step() {
      i = (i + 1) % DRUM.length;
      setShown(DRUM[i]);
      if (i !== target) timer = setTimeout(step, FLIP_MS);
    }, delay);
    return () => clearTimeout(timer);
  }, [ch, motion, delay]);

  return (
    <div
      className="relative grid place-items-center overflow-hidden rounded-[4px] bg-[#1b1c1f] font-display font-semibold text-[#f1efe8] shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)]"
      style={{ width: size * 0.74, height: size, fontSize: size * 0.66 }}>
      <span key={shown} className={motion ? 'animate-flap' : ''}>
        {shown === ' ' ? ' ' : shown}
      </span>
      {/* the hinge every flap folds about */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/70" />
    </div>
  );
}

function Board({ lines, size, motion }: { lines: string[][]; size: number; motion: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, r) => (
        <div key={r} className="flex gap-[3px]">
          {line.map((ch, c) => (
            <Cell key={c} ch={ch} delay={(c + r * 3) * STAGGER_MS} motion={motion} size={size} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SplitFlap({
  title,
  artist,
  accent,
  playing,
  motion,
  upright,
  showTransport,
  elapsed,
  duration,
  remaining,
  seek,
  onToggle,
  onPrev,
  onNext,
}: StyleProps) {
  const cols = upright ? 13 : 20;
  const size = upright ? 44 : 40;
  const time = remaining ? `-${fmt(Math.max(0, duration - elapsed))}` : fmt(elapsed);
  const tint = accent?.soft ?? '#f2c94c';

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b0b0c]">
      <div className={`flex h-full flex-col justify-center gap-4 ${upright ? 'px-5' : 'px-10'}`}>
        <div className="flex items-baseline justify-between font-mono text-eyebrow tracking-[0.3em] uppercase" style={{ color: tint }}>
          <span>Now playing</span>
          <span>{playing ? 'On time' : 'Held'}</span>
        </div>
        <Board lines={rows(title, cols, 3)} size={size} motion={motion} />
        <Board lines={rows(artist, cols, 1)} size={size * 0.7} motion={motion} />

        <div className="mt-2 flex items-center gap-5">
          <Board lines={[cells(time.padStart(6, ' '))]} size={size * 0.7} motion={motion} />
          <div className="min-w-0 flex-1">{seek(tint, tint)}</div>
          {showTransport && (
            <Transport playing={playing} onToggle={onToggle} onPrev={onPrev} onNext={onNext} className="gap-2 text-[#f1efe8]" icon="h-7 w-7" />
          )}
        </div>
      </div>
    </div>
  );
}
