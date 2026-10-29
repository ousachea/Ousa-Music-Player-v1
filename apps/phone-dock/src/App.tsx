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

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [conn, setConn] = useState<ConnectionState>(client.connectionState);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [muted, setMuted] = useState(false);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [selected, setSelected] = useState(0);
  const [now, setNow] = useState(Date.now());
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
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      offs.forEach(off => off());
      clearInterval(tick);
    };
  }, [client]);

  // ringing incoming wins over an active call so a second caller can be answered
  const call = calls.find(c => c.status === 'ringing' && c.direction === 'incoming') ?? calls[0] ?? null;
  const ringing = call?.status === 'ringing' && call.direction === 'incoming';
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

  return (
    <div className="relative flex h-full w-full flex-col bg-bg text-off-white">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-rule px-6">
        <div className="font-display text-title font-medium">{clock(now)}</div>
        <div className="min-w-0 flex-1 truncate text-body text-soft">
          {track ? `♪ ${track.title ?? 'unknown'}${track.artist ? ` · ${track.artist}` : ''}` : ''}
        </div>
        <div className={`font-mono text-eyebrow tracking-[0.25em] uppercase ${conn === 'open' ? 'text-ok' : 'text-dim'}`}>
          {conn === 'open' ? 'linked' : conn}
        </div>
      </header>

      {conn !== 'open' ? (
        <div className="grid flex-1 place-items-center text-title text-soft">connect a phone to use the dock</div>
      ) : notes.length === 0 ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <div className="text-title text-soft">no notifications</div>
            <div className="mt-2 font-mono text-hint text-dim">new ones from your phone show up here</div>
          </div>
        </div>
      ) : (
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {notes.map((n, i) => (
            <button
              key={n.id}
              onClick={() => setSelected(i)}
              className={`flex w-full gap-4 border-b border-rule px-6 py-3 text-left ${i === sel ? 'bg-accent-soft' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="flex gap-3 font-mono text-eyebrow tracking-[0.15em] text-dim uppercase">
                  <span className="truncate">{n.app.displayName ?? n.app.bundleId}</span>
                  <span>{ago(n.timestampUnixS, now)}</span>
                </div>
                <div className="truncate text-row-lg font-medium">{n.title ?? n.subtitle ?? ''}</div>
                <div className={`text-body text-soft ${i === sel ? 'line-clamp-3' : 'truncate'}`}>{n.message ?? ''}</div>
              </div>
              {i === sel && (n.positiveAction || n.negativeAction) && (
                <div className="flex shrink-0 flex-col justify-center gap-2">
                  {n.positiveAction && (
                    <span
                      onClick={e => (e.stopPropagation(), act(n, true))}
                      className="border border-accent px-4 py-2 font-mono text-hint text-accent">
                      1 · {n.positiveAction.label}
                    </span>
                  )}
                  {n.negativeAction && (
                    <span
                      onClick={e => (e.stopPropagation(), act(n, false))}
                      className="border border-edge px-4 py-2 font-mono text-hint text-near">
                      4 · {n.negativeAction.label}
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {call && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-screen">
          <div className="font-mono text-eyebrow tracking-[0.25em] text-dim uppercase">
            {ringing ? 'incoming call' : call.status === 'active' ? (muted ? 'on call · muted' : 'on call') : call.status}
          </div>
          <div className="max-w-[90%] truncate font-display text-screen-title font-medium">
            {call.displayName || call.remoteId}
          </div>
          {call.displayName && call.remoteId && <div className="font-mono text-row text-soft">{call.remoteId}</div>}
          <div className="mt-6 flex gap-6">
            {ringing ? (
              <button onClick={answer} className="bg-ok px-10 py-4 font-mono text-row-lg text-screen active:opacity-80">
                1 · answer
              </button>
            ) : (
              <button
                onClick={toggleMute}
                className={`border px-10 py-4 font-mono text-row-lg active:opacity-80 ${muted ? 'border-warn text-warn' : 'border-edge text-near'}`}>
                2 · {muted ? 'unmute' : 'mute'}
              </button>
            )}
            <button onClick={hangUp} className="bg-err px-10 py-4 font-mono text-row-lg text-off-white active:opacity-80">
              4 · {ringing ? 'decline' : 'end'}
            </button>
          </div>
          {!ringing && <div className="font-mono text-hint text-dim">wheel adjusts volume</div>}
        </div>
      )}
    </div>
  );
}
