// the dev board: github at a glance, read on the mac through its gh cli. presets pick the page, the wheel moves down
// the list, and a press of the wheel or a tap opens the row on the mac. the last board is kept on the device, so it
// still shows, marked with its age, while the mac is away
import { BridgethingClient } from '@bridgething/client';
import { useEffect, useMemo, useRef, useState } from 'react';

import { daemonUrl } from './daemon';
import { readToBoard, type Board, type Ci, type ToMac } from './protocol';

const PAGES = ['Repos', 'My PRs', 'Reviews', 'Inbox'] as const;
type Page = (typeof PAGES)[number];
const SAVED_KEY = 'board';
const WAIT_MS = 5000;

type Row = { key: string; url: string; ci: Ci | 'none'; title: string; meta: string; badge?: { text: string; tone: 'ok' | 'err' | 'warn' | 'dim' } };

function ago(iso: string | number) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const CI_TONE: Record<string, string> = { SUCCESS: '#3ddc84', FAILURE: '#dc3d3d', ERROR: '#dc3d3d', PENDING: '#ffb627', EXPECTED: '#ffb627' };

function rows(board: Board, page: Page): Row[] {
  if (page === 'Repos')
    return board.repos.map(r => ({
      key: r.url,
      url: r.url,
      ci: r.ci ?? 'none',
      title: r.name.split('/')[1] ?? r.name,
      meta: `${r.commit || 'no commits'} · pushed ${ago(r.pushedAt)}`,
      badge: r.prs || r.issues ? { text: `${r.prs} PR · ${r.issues} issue${r.issues === 1 ? '' : 's'}`, tone: 'dim' } : r.private ? { text: 'private', tone: 'dim' } : undefined,
    }));
  if (page === 'Inbox')
    return board.inbox.map(n => ({
      key: n.url + n.updatedAt,
      url: n.url,
      ci: 'none',
      title: n.title,
      meta: `${n.repo} · ${n.kind.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} · ${ago(n.updatedAt)}`,
      badge: { text: n.reason.replaceAll('_', ' '), tone: n.reason === 'review_requested' || n.reason === 'mention' ? 'warn' : 'dim' },
    }));
  return (page === 'My PRs' ? board.mine : board.reviews).map(p => ({
    key: p.url,
    url: p.url,
    ci: p.ci ?? 'none',
    title: `#${p.number} ${p.title}`,
    meta: `${p.repo}${p.author && page === 'Reviews' ? ` · ${p.author}` : ''} · ${ago(p.updatedAt)}`,
    badge: p.draft
      ? { text: 'draft', tone: 'dim' }
      : p.review === 'APPROVED'
        ? { text: 'approved', tone: 'ok' }
        : p.review === 'CHANGES_REQUESTED'
          ? { text: 'changes', tone: 'err' }
          : p.review === 'REVIEW_REQUIRED'
            ? { text: 'needs review', tone: 'warn' }
            : undefined,
  }));
}

const EMPTY: Record<Page, string> = {
  Repos: 'No repositories yet.',
  'My PRs': 'No open pull requests. Nice and clear.',
  Reviews: 'Nobody is waiting on your review.',
  Inbox: 'Inbox zero.',
};

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [page, setPage] = useState<Page>('Repos');
  const [board, setBoard] = useState<Board | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'no-gh' | 'auth' | 'network' | null>(null);
  const [waited, setWaited] = useState(false);
  const [at, setAt] = useState(0);
  const [, tick] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const send = (m: ToMac) => client.forward.json(m).catch(() => {});

  useEffect(() => {
    const off = client.forward.onJson(raw => {
      const m = readToBoard(raw);
      if (!m) return;
      setLive(true);
      if (m.type === 'loading') return setLoading(true);
      setLoading(false);
      if (m.type === 'error') return setError(m.reason);
      setError(null);
      setBoard(m.board);
      client.store.put({ key: SAVED_KEY, value: JSON.stringify(m.board) }).catch(() => {});
    });
    client.store.get({ key: SAVED_KEY }).then(r => {
      if (!r.ok || !r.response.value) return;
      try {
        const saved = readToBoard({ type: 'board', board: JSON.parse(r.response.value) });
        if (saved?.type === 'board') setBoard(b => b ?? saved.board);
      } catch {
        // a saved board that will not parse is dropped
      }
    });
    const offConn = client.on(e => e.type === 'open' && send({ type: 'hello' }));
    send({ type: 'hello' });
    const timer = setTimeout(() => setWaited(true), WAIT_MS);
    // the ages on screen move on even when nothing new arrives
    const clock = setInterval(() => tick(n => n + 1), 30_000);
    return () => {
      off();
      offConn();
      clearTimeout(timer);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const shown = board ? rows(board, page) : [];
  const counts: Record<Page, number> = board
    ? { Repos: board.repos.length, 'My PRs': board.mine.length, Reviews: board.reviews.length, Inbox: board.inbox.length }
    : { Repos: 0, 'My PRs': 0, Reviews: 0, Inbox: 0 };
  const open = (url: string) => send({ type: 'open', url });

  useEffect(() => setAt(0), [page]);
  useEffect(() => {
    list.current?.querySelector(`[data-row="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) setPage(PAGES[i]);
      else if (e.key === 'm') setPage(p => PAGES[(PAGES.indexOf(p) + 1) % PAGES.length]);
      else if ((e.key === 'Enter' || e.key === ' ') && shown[at]) open(shown[at].url);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX === 0 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      setAt(a => Math.max(0, Math.min(shown.length - 1, a + (e.deltaX > 0 ? 1 : -1))));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.length, at, page]);

  const problem =
    error === 'no-gh'
      ? 'The Mac has no GitHub CLI. Install it with Homebrew (brew install gh), then sign in with gh auth login.'
      : error === 'auth'
        ? 'The GitHub CLI on the Mac is signed out. Run gh auth login there.'
        : error === 'network'
          ? 'GitHub did not answer. The board tries again in a couple of minutes.'
          : !live && waited
            ? 'Waiting for the Mac. Open the bridgething desktop app there and turn on Dev Board’s extension.'
            : null;

  return (
    <div className="flex h-full w-full flex-col gap-3 px-5 pt-4 pb-4 text-off-white" style={{ background: 'radial-gradient(120% 90% at 50% -20%, #1d2535, #0a0c10 62%)' }}>
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5 rounded-full border border-white/8 bg-white/5 p-0.5">
          {PAGES.map((p, i) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8rem] font-semibold transition duration-200 ${p === page ? 'bg-white text-screen shadow-[0_4px_14px_rgba(0,0,0,0.35)]' : 'text-soft'}`}>
              {p}
              {counts[p] > 0 && p !== 'Repos' ? (
                <span className={`rounded-full px-1.5 font-mono text-[10px] ${p === page ? 'bg-screen/12' : 'bg-white/12'}`}>{counts[p]}</span>
              ) : (
                <span className={`font-mono text-[10px] ${p === page ? 'text-screen/45' : 'text-dim'}`}>{i + 1}</span>
              )}
            </button>
          ))}
        </div>
        <button onClick={() => send({ type: 'refresh' })} className="ml-auto flex items-center gap-1.5 rounded-full border border-white/8 bg-white/5 px-2.5 py-1.5 font-mono text-[10px] text-soft">
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
          </svg>
          {board ? ago(board.at) : 'never'}
        </button>
      </div>

      {problem && <div className={`rounded-xl px-4 py-2.5 text-row ${error ? 'bg-err-soft text-err' : 'bg-white/6 text-soft'}`}>{problem}</div>}

      {!board ? (
        <div className="grid flex-1 place-items-center text-title text-dim">{problem ? '' : 'Reading GitHub on the Mac...'}</div>
      ) : shown.length === 0 ? (
        <div className="grid flex-1 place-items-center text-title text-soft">{EMPTY[page]}</div>
      ) : (
        // padded inside and pulled back out, so the chosen row's border and shadow are not clipped by the scroll edge
        <div ref={list} className="-m-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 [scroll-padding:8px] [scrollbar-width:none]">
          {shown.map((r, i) => (
            <button
              key={r.key}
              data-row={i}
              onClick={() => {
                setAt(i);
                open(r.url);
              }}
              className={`flex shrink-0 items-center gap-3.5 rounded-2xl border px-4 py-2.5 text-left transition duration-200 ${
                i === at ? 'border-white/25 bg-white/14 shadow-[0_8px_22px_rgba(0,0,0,0.35)]' : 'border-white/6 bg-white/5'
              }`}>
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                title={r.ci === 'none' ? 'no checks' : r.ci ?? ''}
                style={r.ci === 'none' || !r.ci ? { border: '2px solid rgba(255,255,255,0.25)' } : { background: CI_TONE[r.ci], boxShadow: `0 0 8px ${CI_TONE[r.ci]}` }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[1.05rem] font-semibold">{r.title}</span>
                <span className="block truncate text-hint text-dim">{r.meta}</span>
              </span>
              {r.badge && (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] ${
                    r.badge.tone === 'ok' ? 'bg-ok-soft text-ok' : r.badge.tone === 'err' ? 'bg-err-soft text-err' : r.badge.tone === 'warn' ? 'bg-[#ffb627]/15 text-[#ffb627]' : 'bg-white/8 text-soft'
                  }`}>
                  {r.badge.text}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {board && (
        <div className="flex justify-between font-mono text-[11px] tracking-[0.15em] text-dim uppercase">
          <span>@{board.login}</span>
          <span>{live ? 'wheel to move · press to open on the mac' : `saved ${ago(board.at)} · mac away`}</span>
        </div>
      )}
    </div>
  );
}
