// what the board and the mac say over the forward surface. the mac reads github through the gh cli it is signed in
// with, so no token ever reaches the car thing; the board can ask for a refresh, or to open one of the links it was
// sent, and nothing else
export type Ci = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED' | null;

export type Repo = { name: string; url: string; pushedAt: string; commit: string; ci: Ci; prs: number; issues: number; private: boolean };
export type Pull = { repo: string; number: number; title: string; url: string; updatedAt: string; draft: boolean; ci: Ci; review: string | null; author: string | null };
export type Note = { repo: string; title: string; kind: string; reason: string; url: string; updatedAt: string };

export type Board = { login: string; repos: Repo[]; mine: Pull[]; reviews: Pull[]; inbox: Note[]; at: number };

export type ToMac = { type: 'hello' } | { type: 'refresh' } | { type: 'open'; url: string };
export type ToBoard = { type: 'board'; board: Board } | { type: 'error'; reason: 'no-gh' | 'auth' | 'network' } | { type: 'loading' };

// the board believes a message only once its shape checks out
export function readToBoard(raw: unknown): ToBoard | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.type === 'loading') return { type: 'loading' };
  if (m.type === 'error' && (m.reason === 'no-gh' || m.reason === 'auth' || m.reason === 'network')) return { type: 'error', reason: m.reason };
  if (m.type === 'board' && m.board && typeof m.board === 'object') {
    const b = m.board as Board;
    if (typeof b.login === 'string' && [b.repos, b.mine, b.reviews, b.inbox].every(Array.isArray)) return { type: 'board', board: b };
  }
  return null;
}

// an api url for a notification's subject turned into the page a person opens
export function htmlUrl(api: string | null, repo: string): string {
  const m = api?.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(pulls|issues|commits|releases)\/([^/]+)$/);
  if (!m) return `https://github.com/${repo}`;
  const kind = m[2] === 'pulls' ? 'pull' : m[2] === 'commits' ? 'commit' : m[2] === 'releases' ? 'releases' : 'issues';
  return kind === 'releases' ? `https://github.com/${m[1]}/releases` : `https://github.com/${m[1]}/${kind}/${m[3]}`;
}
