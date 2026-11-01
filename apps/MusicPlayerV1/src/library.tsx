// the phone's spotify library, browsed and searched from the device so starting music never needs the phone
import type { BridgethingClient, BrowseEntry, LibraryItem } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Accent } from './artwork-color';
import { useThumbs } from './queue';

const PAGE = 50;
const WHEEL_SCROLL_PX = 26;

export type Row = {
  key: string;
  title: string;
  subtitle: string;
  artworkId: string | null;
  // a folder is opened in place; anything else is played
  nodeId?: string;
  uri?: string;
  kind?: string;
};

// tracks, albums and artists carry a bare id where the rest carry a uri, and play only takes a uri
export const uriOf = (kind: string, id: string) => (id.includes(':') ? id : `spotify:${kind}:${id}`);

export function rowOf(item: LibraryItem): Row {
  switch (item.type) {
    case 'track': {
      const t = item.data;
      return { key: t.id, title: t.name, subtitle: t.artist.name, artworkId: t.imageId, uri: uriOf('track', t.id), kind: 'track' };
    }
    case 'album':
      return { key: item.data.id, title: item.data.name, subtitle: 'Album', artworkId: item.data.artworkId, uri: uriOf('album', item.data.id), kind: 'album' };
    case 'artist':
      return { key: item.data.id, title: item.data.name, subtitle: 'Artist', artworkId: item.data.artworkId, uri: uriOf('artist', item.data.id), kind: 'artist' };
    case 'playlist': {
      const p = item.data;
      const count = p.trackCount != null ? `${p.trackCount} songs` : 'Playlist';
      return { key: p.uri, title: p.name, subtitle: p.ownerName ? `${count} · ${p.ownerName}` : count, artworkId: p.artworkId, uri: p.uri, kind: 'playlist' };
    }
    case 'podcastEpisode':
      return { key: item.data.uri, title: item.data.name, subtitle: item.data.showName ?? 'Episode', artworkId: item.data.artworkId, uri: item.data.uri, kind: 'podcastEpisode' };
    case 'show':
      return { key: item.data.uri, title: item.data.name, subtitle: item.data.publisher ?? 'Podcast', artworkId: item.data.artworkId, uri: item.data.uri, kind: 'show' };
    case 'station':
      return { key: item.data.uri, title: item.data.name, subtitle: 'Station', artworkId: item.data.artworkId, uri: item.data.uri, kind: 'station' };
  }
}

function entryRow(entry: BrowseEntry): Row {
  if (entry.type === 'item') return rowOf(entry.data);
  const f = entry.data;
  return { key: f.nodeId, title: f.title, subtitle: f.subtitle ?? (f.total != null ? `${f.total} items` : ''), artworkId: f.artworkId, nodeId: f.nodeId };
}

// what a failed request says, in words a listener can act on
function failure(error: unknown): string {
  const type = (error as { error?: { type?: string } } | undefined)?.error?.type;
  if (type === 'unauthorized') return 'Spotify on the phone has to be signed in.';
  if (type === 'noGateway') return 'No phone connected.';
  if (type === 'notSupported') return 'The phone app cannot do this yet.';
  return 'The phone did not answer. Try again.';
}

type Tab = 'Liked' | 'Browse' | 'Search';
type List = { rows: Row[] | null; error: string | null };

export function LibrarySheet({
  client,
  accent,
  onClose,
  onPlay,
}: {
  client: BridgethingClient;
  accent: Accent | null;
  onClose: () => void;
  onPlay: (row: Row) => void;
}) {
  const tint = accent?.fill ?? '#efefef';
  const ink = accent?.ink ?? '#060809';
  const [tab, setTab] = useState<Tab>('Liked');
  const [liked, setLiked] = useState<List>({ rows: null, error: null });
  // each folder opened pushes one level; back pops it
  const [trail, setTrail] = useState<{ nodeId: string | null; title: string; list: List }[]>([
    { nodeId: null, title: 'Browse', list: { rows: null, error: null } },
  ]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<List>({ rows: [], error: null });
  const [typing, setTyping] = useState(true);
  const [searched, setSearched] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab !== 'Liked' || liked.rows) return;
    client.library
      .favoritesList({ limit: PAGE, offset: 0 })
      .then(r => setLiked(r.ok ? { rows: r.response.page.items.map(rowOf), error: null } : { rows: [], error: failure(r) }))
      .catch(() => setLiked({ rows: [], error: failure(null) }));
  }, [client, tab, liked.rows]);

  const level = trail[trail.length - 1];
  useEffect(() => {
    if (tab !== 'Browse' || level.list.rows) return;
    const nodeId = level.nodeId;
    client.library
      .browse({ nodeId, limit: PAGE, offset: 0 })
      .then(r => {
        const next: List = r.ok ? { rows: r.response.result.entries.map(entryRow), error: null } : { rows: [], error: failure(r) };
        setTrail(t => t.map(l => (l.nodeId === nodeId && !l.list.rows ? { ...l, list: next } : l)));
      })
      .catch(() => {});
  }, [client, tab, level]);

  const search = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q) return;
      setTyping(false);
      setSearched(true);
      setFound({ rows: null, error: null });
      client.library
        .search({ query: q, kinds: null, limit: PAGE, offset: 0 })
        .then(r => setFound(r.ok ? { rows: r.response.result.items.map(rowOf), error: null } : { rows: [], error: failure(r) }))
        .catch(() => setFound({ rows: [], error: failure(null) }));
    },
    [client],
  );

  // back steps out of a folder, then out of the keyboard, then closes
  const back = useCallback(() => {
    if (tab === 'Browse' && trail.length > 1) setTrail(t => t.slice(0, -1));
    else onClose();
  }, [tab, trail.length, onClose]);

  // the player's own handlers stand down while this is open, so the wheel and back belong to it
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (list.current && Math.abs(e.deltaX) > Math.abs(e.deltaY)) list.current.scrollTop += e.deltaX * WHEEL_SCROLL_PX;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.repeat) back();
      else if (tab === 'Search' && typing && e.key.length === 1 && /[\w ]/.test(e.key)) setQuery(q => q + e.key);
      else if (tab === 'Search' && typing && e.key === 'Backspace') setQuery(q => q.slice(0, -1));
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [back, tab, typing]);

  useEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [tab, trail.length]);

  const shown: List = tab === 'Liked' ? liked : tab === 'Browse' ? level.list : found;
  const thumbs = useThumbs(client, (shown.rows ?? []).flatMap(r => (r.artworkId ? [r.artworkId] : [])).slice(0, PAGE));
  const pick = (row: Row) => {
    if (row.nodeId) setTrail(t => [...t, { nodeId: row.nodeId!, title: row.title, list: { rows: null, error: null } }]);
    else if (row.uri) onPlay(row);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-screen">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
        {(['Liked', 'Browse', 'Search'] as Tab[]).map(name => {
          const on = name === tab;
          return (
            <button
              key={name}
              aria-pressed={on}
              onClick={() => setTab(name)}
              style={on ? { backgroundColor: tint, color: ink } : undefined}
              className={`min-h-11 rounded-full px-5 text-row-lg font-semibold transition active:scale-95 ${on ? '' : 'bg-white/8 text-near'}`}>
              {name}
            </button>
          );
        })}
        {tab === 'Browse' && trail.length > 1 && (
          <span className="ml-2 min-w-0 truncate text-title text-dim">› {level.title}</span>
        )}
        <button
          onClick={back}
          aria-label={tab === 'Browse' && trail.length > 1 ? 'Back' : 'Close'}
          className="ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/8 text-near transition active:scale-95">
          {tab === 'Browse' && trail.length > 1 ? '‹' : '✕'}
        </button>
      </div>

      {tab === 'Search' && (
        <SearchBar
          client={client}
          query={query}
          tint={tint}
          typing={typing}
          onType={() => setTyping(true)}
          onHeard={text => {
            setQuery(text);
            search(text);
          }}
        />
      )}

      <div ref={list} data-library-list className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 [scrollbar-width:none]">
        {shown.rows === null && <p className="py-8 text-center text-hint text-dim">Asking the phone...</p>}
        {shown.error && <p className="py-8 text-center text-title text-dim">{shown.error}</p>}
        {shown.rows?.length === 0 && !shown.error && (
          <p className="py-8 text-center text-hint text-dim">
            {tab === 'Search' ? (searched ? 'Nothing found.' : 'Type what to play, then Search.') : 'Nothing here yet.'}
          </p>
        )}
        {shown.rows?.map(row => (
          <button
            key={row.key}
            onClick={() => pick(row)}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left transition active:scale-[0.99] active:bg-white/8">
            <div className={`h-11 w-11 shrink-0 overflow-hidden bg-white/8 ring-1 ring-white/10 ${row.kind === 'artist' ? 'rounded-full' : 'rounded-md'}`}>
              {row.artworkId && thumbs[row.artworkId] ? <img src={thumbs[row.artworkId]} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-row text-near">{row.title}</span>
              <span className="block truncate text-hint text-dim">{row.subtitle}</span>
            </span>
            <span className="shrink-0 px-2 text-title text-dim">{row.nodeId ? '›' : '▶'}</span>
          </button>
        ))}
      </div>

      {tab === 'Search' && typing && (
        <Keyboard
          tint={tint}
          ink={ink}
          onKey={k => setQuery(q => q + k)}
          onDelete={() => setQuery(q => q.slice(0, -1))}
          onEnter={() => search(query)}
        />
      )}
    </div>
  );
}

// push-to-talk only shows when the device says it has a voice pipeline to talk to
function SearchBar({
  client,
  query,
  tint,
  typing,
  onType,
  onHeard,
}: {
  client: BridgethingClient;
  query: string;
  tint: string;
  typing: boolean;
  onType: () => void;
  onHeard: (text: string) => void;
}) {
  const [voice, setVoice] = useState(false);
  const [phase, setPhase] = useState<string>('idle');
  const heard = useRef(onHeard);
  heard.current = onHeard;

  useEffect(() => {
    client.voice
      .stateGet({ timeoutMs: 3000 })
      .then(r => setVoice(r.ok && !r.response.state.muted))
      .catch(() => {});
    const offActivity = client.voice.onActivity(a => setPhase(a.phase));
    // a spoken "play x" names x in the target slot; anything else falls back to the whole transcript
    const offIntent = client.voice.onIntent(i => {
      const text = i.slots.target ?? i.slots.playlist ?? i.transcript;
      if (text) heard.current(text);
    });
    return () => {
      offActivity();
      offIntent();
    };
  }, [client]);

  const listening = phase === 'listening' || phase === 'thinking';
  return (
    <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
      <button
        onClick={onType}
        className="flex min-h-11 min-w-0 flex-1 items-center rounded-full bg-white/8 px-4 text-left text-title text-near">
        <span className="truncate">{listening ? (phase === 'listening' ? 'Listening...' : 'Thinking...') : query || <span className="text-dim">Search Spotify</span>}</span>
        {typing && !listening && <span className="ml-0.5 h-5 w-[2px] animate-pulse" style={{ backgroundColor: tint }} />}
      </button>
      {voice && (
        <button
          aria-label="Hold to speak"
          onPointerDown={() => client.voice.pushToTalk().catch(() => {})}
          onPointerUp={() => client.voice.release().catch(() => {})}
          onPointerLeave={() => listening && client.voice.release().catch(() => {})}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-95"
          style={{ backgroundColor: listening ? tint : 'rgba(255,255,255,0.08)' }}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={listening ? '#060809' : tint} strokeWidth="2" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      )}
    </div>
  );
}

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

export function Keyboard({
  tint,
  ink,
  onKey,
  onDelete,
  onEnter,
}: {
  tint: string;
  ink: string;
  onKey: (k: string) => void;
  onDelete: () => void;
  onEnter: () => void;
}) {
  const key = 'grid h-11 place-items-center rounded-lg bg-white/10 text-title text-near transition active:scale-95 active:bg-white/25';
  return (
    <div className="flex shrink-0 flex-col gap-1.5 bg-black/40 px-3 py-2">
      {ROWS.map((row, i) => (
        <div key={row} className="flex justify-center gap-1.5">
          {i === 2 && <span className="w-[6%]" />}
          {[...row].map(k => (
            <button key={k} onClick={() => onKey(k)} className={`${key} w-[9%]`}>
              {k}
            </button>
          ))}
          {i === 2 && (
            <button onClick={onDelete} aria-label="Delete" className={`${key} w-[13%]`}>
              ⌫
            </button>
          )}
        </div>
      ))}
      <div className="flex justify-center gap-1.5">
        <button onClick={() => onKey(' ')} className={`${key} w-[60%]`}>
          space
        </button>
        <button onClick={onEnter} className={`${key} w-[25%] font-semibold`} style={{ backgroundColor: tint, color: ink }}>
          Search
        </button>
      </div>
    </div>
  );
}
