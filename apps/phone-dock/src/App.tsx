import { BridgethingClient, type ConnectionState, type PlayerState } from '@bridgething/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { daemonUrl } from './daemon';

type Handler<F> = F extends (handler: (msg: infer M) => void) => unknown ? M : never;
type PhoneCall = Handler<BridgethingClient['phone']['onCallStarted']>;
type Notification = Handler<BridgethingClient['notifications']['onPosted']>;

const LIVE: PhoneCall['status'][] = ['ringing', 'sending', 'connecting', 'active', 'held'];
const MAX_NOTIFICATIONS = 50;

function upsertCall(calls: PhoneCall[], call: PhoneCall): PhoneCall[] {
  const rest = calls.filter(c => c.callId !== call.callId);
  return LIVE.includes(call.status) ? [...rest, call] : rest;
}

function upsertNotification(list: Notification[], n: Notification): Notification[] {
  return [n, ...list.filter(x => x.id !== n.id)].slice(0, MAX_NOTIFICATIONS);
}

function ago(unixS: number | null, now: number): string {
  if (unixS == null) return '';
  const m = Math.max(0, Math.round((now / 1000 - unixS) / 60));
  return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}

function clock(now: number): string {
  return new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function day(now: number): string {
  return new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function elapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(w => /\p{L}/u.test(w));
  return words.length ? words.slice(0, 2).map(w => [...w][0]).join('').toUpperCase() : '#';
}

const GLOW = '#38bdf8';

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [conn, setConn] = useState<ConnectionState>(client.connectionState);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [muted, setMuted] = useState(false);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [selected, setSelected] = useState(0);
  const [now, setNow] = useState(Date.now());
  // when each call went live, for phones that leave startedAtUnixS null
  const liveSince = useRef(new Map<string, number>());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offs = [
      client.on(event => {
        if (event.type === 'open' || event.type === 'close' || event.type === 'connecting') {
          setConn(client.connectionState);
        }
        if (event.type === 'open') {
          client.player.stateGet().then(r => r.ok && setPlayer(r.response.state));
          client.phone.stateGet().then(r => r.ok && setCalls(r.response.state.activeCalls.filter(c => LIVE.includes(c.status))));
        }
      }),
      client.player.onSnapshot(reply => setPlayer(reply.state)),
      client.phone.onCallStarted(call => setCalls(cs => upsertCall(cs, call))),
      client.phone.onCallUpdated(call => setCalls(cs => upsertCall(cs, call))),
      client.phone.onCallEnded(({ callId }) => setCalls(cs => cs.filter(c => c.callId !== callId))),
      client.phone.onCommunicationsChanged(({ state }) => setMuted(state.muteStatus === true)),
      client.notifications.onPosted(n => setNotes(ns => upsertNotification(ns, n))),
      client.notifications.onUpdated(n => setNotes(ns => upsertNotification(ns, n))),
      client.notifications.onRemoved(({ id }) => setNotes(ns => ns.filter(n => n.id !== id))),
    ];
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      offs.forEach(off => off());
      clearInterval(tick);
    };
  }, [client]);

  // ringing incoming wins over an active call so a second caller can be answered
  const call = calls.find(c => c.status === 'ringing' && c.direction === 'incoming') ?? calls[0] ?? null;
  const ringing = call?.status === 'ringing' && call.direction === 'incoming';
  if (call?.status === 'active' && !liveSince.current.has(call.callId)) liveSince.current.set(call.callId, Date.now());
  const callStart = call && (call.startedAtUnixS != null ? call.startedAtUnixS * 1000 : liveSince.current.get(call.callId));
  const sel = Math.min(selected, Math.max(0, notes.length - 1));
  const note = notes[sel] ?? null;

  const act = (n: Notification | null, positive: boolean) => {
    if (!n) return;
    if (positive ? !n.positiveAction : !n.negativeAction) return;
    (positive ? client.notifications.invokePositive : client.notifications.invokeNegative).call(client.notifications, {
      id: n.id,
    });
  };

  const answer = () => call && client.phone.accept({ callId: call.callId, action: 'accept' });
  const hangUp = () => call && (ringing ? client.phone.decline({ callId: call.callId }) : client.phone.end({ callId: call.callId }));
  const toggleMute = () => client.phone.mute({ mute: !muted }).then(() => setMuted(m => !m));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (call) {
        if (e.key === '1' && ringing) answer();
        else if (e.key === '2' && !ringing) toggleMute();
        else if (e.key === '4') hangUp();
        return;
      }
      if (e.key === '1') act(note, true);
      else if (e.key === '4') act(note, false);
      else if (e.key === 'Escape') setSelected(0);
    };
    const onWheel = (e: WheelEvent) => {
      if (call) {
        if (e.deltaX > 0) client.audio.volumeUp();
        else if (e.deltaX < 0) client.audio.volumeDown();
        return;
      }
      if (e.deltaX === 0) return;
      setSelected(s => Math.max(0, Math.min(notes.length - 1, Math.min(s, notes.length - 1) + Math.sign(e.deltaX))));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  });

  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const track = player?.track ?? null;
  const song = track ? `${track.title ?? 'unknown'}${track.artist ? ` · ${track.artist}` : ''}` : null;
  const idle = conn !== 'open' || notes.length === 0;
  const glowText = { textShadow: `0 0 24px ${GLOW}66` };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-off-white">
      {idle ? (
        <div
          className="flex flex-1 flex-col items-center justify-center"
          style={{ background: `radial-gradient(ellipse at 50% 40%, ${GLOW}1f, transparent 65%)` }}>
          <div className="font-display text-[132px] leading-none font-medium tracking-display" style={glowText}>
            {clock(now)}
          </div>
          <div className="mt-3 text-hero text-soft">{day(now)}</div>
          {song && conn === 'open' && (
            <div className="mt-8 max-w-[80%] truncate rounded-full border border-rule-strong px-6 py-2 text-row-lg text-near">
              ♪ {song}
            </div>
          )}
          <div className="mt-6 flex items-center gap-3 font-mono text-body text-dim">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: conn === 'open' ? GLOW : 'var(--color-dim)', boxShadow: conn === 'open' ? `0 0 10px ${GLOW}` : 'none' }}
            />
            {conn === 'open' ? 'no new notifications' : 'connect a phone to use the dock'}
          </div>
        </div>
      ) : (
        <>
          <header className="flex h-16 shrink-0 items-center gap-5 border-b border-rule px-7">
            <div className="font-display text-hero font-medium">{clock(now)}</div>
            <div className="min-w-0 flex-1 truncate text-row-lg text-soft">{song ? `♪ ${song}` : ''}</div>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: GLOW, boxShadow: `0 0 10px ${GLOW}` }} />
          </header>
          <div ref={listRef} className="flex-1 overflow-y-auto">
            {notes.map((n, i) => {
              const on = i === sel;
              return (
                <button
                  key={n.id}
                  onClick={() => setSelected(i)}
                  className="flex w-full items-center gap-5 border-b border-rule py-4 pr-7 pl-6 text-left"
                  style={{
                    borderLeft: `4px solid ${on ? GLOW : 'transparent'}`,
                    background: on ? `linear-gradient(90deg, ${GLOW}24, ${GLOW}08)` : undefined,
                  }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex gap-3 font-mono text-body tracking-[0.12em] uppercase">
                      <span className="truncate" style={{ color: on ? GLOW : 'var(--color-soft)' }}>
                        {n.app.displayName ?? n.app.bundleId}
                      </span>
                      <span className="text-dim">{ago(n.timestampUnixS, now)}</span>
                    </div>
                    <div className="mt-1 truncate text-[24px] leading-tight font-medium">{n.title ?? n.subtitle ?? ''}</div>
                    {n.message && (
                      <div className={`mt-1 text-[18px] leading-snug text-near ${on ? 'line-clamp-3' : 'truncate'}`}>{n.message}</div>
                    )}
                  </div>
                  {on && (n.positiveAction || n.negativeAction) && (
                    <div className="flex shrink-0 flex-col gap-3">
                      {n.positiveAction && (
                        <span
                          onClick={e => (e.stopPropagation(), act(n, true))}
                          className="rounded-xl border-2 px-5 py-3 text-center font-mono text-row-lg"
                          style={{ borderColor: GLOW, color: GLOW, boxShadow: `0 0 16px ${GLOW}55` }}>
                          1 · {n.positiveAction.label}
                        </span>
                      )}
                      {n.negativeAction && (
                        <span
                          onClick={e => (e.stopPropagation(), act(n, false))}
                          className="rounded-xl border-2 border-edge px-5 py-3 text-center font-mono text-row-lg text-near">
                          4 · {n.negativeAction.label}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {call && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            background: `radial-gradient(ellipse at 50% 35%, ${ringing ? '#3ddc84' : GLOW}26, transparent 70%), var(--color-screen)`,
          }}>
          <div className="relative grid h-28 w-28 place-items-center">
            {ringing && <div className="absolute inset-0 animate-ping rounded-full border-4 border-ok opacity-60" />}
            <div
              className="grid h-28 w-28 place-items-center rounded-full border-4 font-display text-[40px] font-medium"
              style={{
                borderColor: ringing ? 'var(--color-ok)' : GLOW,
                boxShadow: `0 0 28px ${ringing ? '#3ddc84' : GLOW}88`,
              }}>
              {initials(call.displayName || '')}
            </div>
          </div>
          <div className="mt-5 font-mono text-body tracking-[0.25em] text-soft uppercase">
            {ringing ? 'incoming call' : call.status === 'active' ? (muted ? 'on call · muted' : 'on call') : call.status}
          </div>
          <div className="mt-1 max-w-[90%] truncate font-display text-[44px] leading-tight font-medium">
            {call.displayName || call.remoteId}
          </div>
          <div className="mt-1 font-mono text-title text-soft">
            {call.status === 'active' && callStart ? (
              <span style={{ color: GLOW, ...glowText }}>{elapsed(now - callStart)}</span>
            ) : (
              call.displayName && call.remoteId
            )}
          </div>
          <div className="mt-8 flex gap-6">
            {ringing ? (
              <button
                onClick={answer}
                className="min-w-56 rounded-2xl bg-ok py-5 font-mono text-title text-screen active:opacity-80"
                style={{ boxShadow: '0 0 28px #3ddc8477' }}>
                1 · answer
              </button>
            ) : (
              <button
                onClick={toggleMute}
                className={`min-w-56 rounded-2xl border-2 py-5 font-mono text-title active:opacity-80 ${muted ? 'border-warn text-warn' : 'border-edge text-near'}`}>
                2 · {muted ? 'unmute' : 'mute'}
              </button>
            )}
            <button
              onClick={hangUp}
              className="min-w-56 rounded-2xl bg-err py-5 font-mono text-title text-off-white active:opacity-80"
              style={{ boxShadow: '0 0 28px #dc3d3d77' }}>
              4 · {ringing ? 'decline' : 'end'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
