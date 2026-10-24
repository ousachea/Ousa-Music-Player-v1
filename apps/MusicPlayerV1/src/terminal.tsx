// terminal: the song printed on a green-on-black command line, with code raining down the screen behind it the whole
// time. each new song prints a fresh block under the last few, with an ascii progress bar and a cursor waiting at the
// prompt; the buttons are bracketed commands
import { useEffect, useRef, useState } from 'react';

import { cells, fmt, type StyleProps } from './style-kit';

const TERMINAL_GREEN = '#39ff7a';
const KEY_MS = 18;
const KEPT = 3;

// the rain: a column every few pixels, each dropping a character a step, leaving a fading trail. one canvas, redrawn
// at about 25 frames a second, which the device keeps up with. latin, digits and symbols only, since the device has
// no font for the katakana the film used; the song's own letters are mixed in
const DROP_PX = 16;
const FRAME_MS = 40;

function Rain({ title, running, ink, head }: { title: string; running: boolean; ink: string; head: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const glyphs = `0123456789ABCDEF$#@%&*+=<>/|{}[]${title.toUpperCase().replace(/\s+/g, '')}`;
    const pick = () => glyphs[Math.floor(Math.random() * glyphs.length)];
    let drops: number[] = [];
    const size = () => {
      el.width = el.clientWidth;
      el.height = el.clientHeight;
      // each column starts somewhere above the screen, so the rain does not arrive as one line
      drops = Array.from({ length: Math.ceil(el.width / DROP_PX) }, () => -Math.floor(Math.random() * (el.height / DROP_PX)));
      ctx.fillStyle = '#050806';
      ctx.fillRect(0, 0, el.width, el.height);
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(el);
    if (!running) return () => observer.disconnect();
    let last = 0;
    let frame = requestAnimationFrame(function draw(now) {
      frame = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      last = now;
      // a translucent wash over the last frame is what leaves the trails
      ctx.fillStyle = 'rgba(5, 8, 6, 0.12)';
      ctx.fillRect(0, 0, el.width, el.height);
      ctx.font = `${DROP_PX - 2}px ui-monospace, monospace`;
      drops.forEach((row, i) => {
        if (row < 0) return void (drops[i] = row + 1);
        const x = i * DROP_PX;
        const y = row * DROP_PX;
        // the head of each drop bright, the rest of it the screen's green
        ctx.fillStyle = head;
        ctx.fillText(pick(), x, y);
        // the trail through globalAlpha, since the colour can arrive as hsl() and canvas has no color-mix to lean on
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = ink;
        ctx.fillText(pick(), x, y - DROP_PX);
        ctx.globalAlpha = 1;
        drops[i] = y > el.height && Math.random() > 0.975 ? 0 : row + 1;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [title, running, ink, head]);
  return <canvas ref={canvas} className="absolute inset-0 h-full w-full" />;
}

// what has already scrolled past; the style is rebuilt for every track, so this lives here until the app reloads
const log: { title: string; artist: string }[] = [];

export function Terminal({
  title,
  artist,
  album,
  playing,
  motion,
  upright,
  showTransport,
  progress,
  elapsed,
  duration,
  onToggle,
  onPrev,
  onNext,
  accent,
  colour,
  onColour,
}: StyleProps & { colour: 'green' | 'album'; onColour: () => void }) {
  // the classic green, or the cover's own colour; with the cover's, the drops' heads stay near white so they read on any
  const GREEN = colour === 'album' && accent ? accent.soft : TERMINAL_GREEN;
  const head = colour === 'album' && accent ? '#f4f4f4' : '#c8ffd9';
  if (log[log.length - 1]?.title !== title) {
    log.push({ title, artist });
    if (log.length > KEPT + 1) log.shift();
  }
  log[log.length - 1].artist = artist;
  const earlier = log.slice(0, -1);

  // the new block prints a character at a time, the way output streams in
  const block = `track   : ${title}\nartist  : ${artist}${album ? `\nalbum   : ${album}` : ''}`;
  const letters = cells(block);
  const [n, setN] = useState(motion ? 0 : letters.length);
  useEffect(() => {
    if (!motion) return setN(letters.length);
    setN(0);
    const timer = setInterval(() => setN(k => (k >= letters.length ? (clearInterval(timer), k) : k + 1)), KEY_MS);
    return () => clearInterval(timer);
    // keyed on the block's text; the letters are rebuilt from it every render
  }, [block, motion]);

  // the bar and its readout on one line: 40 cells fit across, 16 in the narrow turned column
  const width = upright ? 16 : 40;
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * width);
  const glow = { color: GREEN, textShadow: `0 0 6px color-mix(in srgb, ${GREEN} 60%, transparent)` };
  // each key a text icon in keyboard characters, the word beside it where there is room for one
  const command = (icon: string, label: string, onClick: () => void, extra = '', iconOnly = false) => (
    <button
      onClick={onClick}
      className={`h-14 rounded-sm ring-1 transition active:bg-[#39ff7a] active:text-black ${upright ? 'w-full px-1 text-[15px]' : 'px-4'} ${extra}`}
      style={{ ...glow, ['--tw-ring-color' as string]: `color-mix(in srgb, ${GREEN} 45%, transparent)` }}>
      [ {icon}
      {iconOnly ? '' : ` ${label}`} ]
    </button>
  );

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#050806] font-mono">
      <Rain title={title} running={motion} ink={GREEN} head={head} />
      {/* the faint rows of an old monitor */}
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.25)_0_1px,transparent_1px_3px)]" />
      {/* the output sits on a dark pane so it reads over the rain */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#050806] via-[#050806]/92 to-transparent ${upright ? 'top-1/3' : 'top-[18%]'}`}
      />
      <div className={`relative flex h-full flex-col justify-end text-[17px] leading-[1.55] ${upright ? 'px-5 pb-6' : 'px-10 pb-7'}`} style={glow}>
        {earlier.map((l, i) => (
          // turned, the column is narrow, so an earlier song gets two lines rather than being cut to one
          <div key={i + l.title} className={`opacity-35 ${upright ? 'line-clamp-2 break-words' : 'truncate'}`}>
            $ now-playing · {l.title} — {l.artist}
          </div>
        ))}
        <div className="mt-2">$ now-playing --watch</div>
        <div className="text-[20px] leading-[1.45] break-words whitespace-pre-wrap">
          {letters.slice(0, n).join('')}
        </div>
        <div className="mt-2 whitespace-pre">
          [{'#'.repeat(filled)}
          <span className="opacity-30">{'.'.repeat(width - filled)}</span>] {fmt(elapsed)} / {fmt(duration)}{' '}
          {playing ? '▶ playing' : '‖ paused'}
        </div>
        <div className="mt-1">
          $ <span className="inline-block h-5 w-2.5 translate-y-1 animate-pulse" style={{ background: GREEN }} />
        </div>
        {/* the controls, and in the bottom right the colour key, which trades green for the cover's colour */}
        {/* turned, the column is too narrow for the row, so the keys share its width equally instead */}
        <div className={`mt-5 ${upright ? 'grid grid-cols-4 gap-2' : 'flex items-center gap-3'}`}>
          {showTransport && (
            <>
              {command('|<', 'prev', onPrev, '', upright)}
              {command(playing ? '||' : '>', playing ? 'pause' : 'play', onToggle, '', upright)}
              {command('>|', 'next', onNext, '', upright)}
            </>
          )}
          {command('*', colour === 'album' ? 'album' : 'green', onColour, `animate-hint ${upright ? (showTransport ? '' : 'col-start-4') : 'ml-auto'}`)}
        </div>
      </div>
    </div>
  );
}
