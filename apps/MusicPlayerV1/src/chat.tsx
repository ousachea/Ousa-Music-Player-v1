// chat: the song arrives as a conversation with the artist. the cover comes in as a photo, the title and album as
// texts, and when the phone has timed words each line arrives as a message as it is sung, the next one typing
import { activeIndex, type Lyrics } from './lyrics';
import { Transport, fmt, type StyleProps } from './style-kit';

type Message = { key: string; from: 'them' | 'me'; text?: string; photo?: boolean; small?: string };

export function Chat({ artUrl, title, artist, album, accent, playing, upright, showTransport, elapsed, seek, onToggle, onPrev, onNext, lyrics }: StyleProps & { lyrics: Lyrics }) {
  const tint = accent?.fill ?? '#2f7cf6';
  const ink = accent?.ink ?? '#ffffff';
  const timed = lyrics.state === 'timed' ? lyrics.lines : null;
  const at = timed ? activeIndex(timed, elapsed) : -1;

  const messages: Message[] = [
    { key: 'photo', from: 'them', photo: true },
    { key: 'title', from: 'them', text: title },
  ];
  if (album) messages.push({ key: 'album', from: 'them', text: `from ${album}` });
  messages.push({ key: 'me', from: 'me', text: playing ? 'playing it now' : 'paused it for a sec', small: `${fmt(elapsed)} · Read` });
  // the words sung so far, the newest at the bottom; the column clips what has scrolled off the top
  if (timed) for (let i = Math.max(0, at - 5); i <= at; i++) if (timed[i].text) messages.push({ key: `l${i}`, from: 'them', text: timed[i].text });
  if (lyrics.state === 'plain') messages.push({ key: 'plain', from: 'them', text: lyrics.text.split('\n').slice(0, 2).join(' / ') });
  const typing = playing && timed !== null && at < timed.length - 1;

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-[#0d0f14] text-white" style={{ ['--tint' as string]: tint }}>
      {/* the header: who it is from and whether they are there */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/8 bg-[#15181f] px-5 py-2.5">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-[var(--tint)]" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-white/10">
          {artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[1.05rem] font-semibold">{artist}</div>
          <div className={`text-[12px] ${playing ? 'text-[#5dd879]' : 'text-white/45'}`}>{playing ? (typing ? 'typing...' : 'online') : 'last seen just now'}</div>
        </div>
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-[var(--tint)]" fill="currentColor">
          <path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1z" />
        </svg>
      </div>

      {/* the thread, filling from the bottom */}
      <div className={`flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden ${upright ? 'px-4 py-3' : 'px-6 py-3'}`}>
        {messages.map(m => (
          <div key={m.key} className={`flex animate-msg-in flex-col ${m.from === 'me' ? 'items-end' : 'items-start'}`}>
            {m.photo ? (
              <div className={`overflow-hidden rounded-2xl rounded-bl-md bg-white/10 ${upright ? 'h-44 w-44' : 'h-32 w-32'}`}>{artUrl && <img src={artUrl} alt="" className="h-full w-full object-cover" />}</div>
            ) : (
              <div
                className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-[1rem] leading-snug ${m.from === 'me' ? 'rounded-br-md' : 'rounded-bl-md bg-[#262a33]'}`}
                style={m.from === 'me' ? { background: tint, color: ink } : undefined}>
                {m.text}
              </div>
            )}
            {m.small && <div className="mt-0.5 px-1 text-[10px] text-white/40">{m.small}</div>}
          </div>
        ))}
        {typing && (
          <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-[#262a33] px-3.5 py-3">
            {[0, 1, 2].map(i => (
              <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-white/60" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        )}
      </div>

      {/* where the message would be typed: the seek bar in the field, the buttons beside it */}
      <div className={`flex shrink-0 items-center gap-3 border-t border-white/8 bg-[#15181f] ${upright ? 'flex-col px-4 py-3' : 'px-5 py-2.5'}`}>
        <div className="flex w-full min-w-0 flex-1 items-center rounded-full bg-[#262a33] px-4 py-3">{seek(tint, accent?.fill2 ?? tint)}</div>
        {showTransport && (
          <Transport
            playing={playing}
            onToggle={onToggle}
            onPrev={onPrev}
            onNext={onNext}
            className="shrink-0 gap-2 text-white"
            button="h-12 w-12 rounded-full bg-[#262a33]"
            play="h-12 w-12 rounded-full bg-[var(--tint)] text-white"
            icon="h-6 w-6"
          />
        )}
      </div>
    </div>
  );
}
