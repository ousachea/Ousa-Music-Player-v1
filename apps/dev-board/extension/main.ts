// the board's reader on the mac. it asks github, through the gh cli this mac is already signed in with, for the
// repos pushed to most lately, open pull requests, reviews waiting and the notification inbox, and sends the lot to
// the car thing. the car thing can ask for a refresh or to open a link; only a link this extension sent is opened
import { asJson, defineExtension, json, type ExtensionContext } from '@bridgething/extension';

import { htmlUrl, type Board, type Ci, type Pull, type ToBoard, type ToMac } from '../src/protocol';

const decoder = new TextDecoder();
// homebrew on apple silicon, then on intel
const GH = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh'];
const EVERY_MS = 2 * 60_000;

const QUERY = `query {
  viewer {
    login
    repositories(first: 8, orderBy: {field: PUSHED_AT, direction: DESC}, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
      nodes { nameWithOwner url pushedAt isPrivate pullRequests(states: OPEN) { totalCount } issues(states: OPEN) { totalCount }
        defaultBranchRef { target { ... on Commit { messageHeadline statusCheckRollup { state } } } } }
    }
    pullRequests(first: 25, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { number title url isDraft updatedAt reviewDecision repository { nameWithOwner }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
    }
  }
  reviews: search(query: "is:open is:pr review-requested:@me archived:false", type: ISSUE, first: 25) {
    nodes { ... on PullRequest { number title url isDraft updatedAt author { login } repository { nameWithOwner }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } } }
  }
}`;

type Rollup = { commits?: { nodes?: { commit?: { statusCheckRollup?: { state?: Ci } | null } }[] } };
type RawPull = Rollup & {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  reviewDecision?: string | null;
  author?: { login: string } | null;
  repository: { nameWithOwner: string };
};

async function gh(args: string[]): Promise<{ ok: boolean; out: string; missing: boolean }> {
  for (const bin of GH) {
    try {
      const { success, stdout } = await new Deno.Command(bin, { args, stdout: 'piped', stderr: 'null', stdin: 'null', signal: AbortSignal.timeout(20_000) }).output();
      return { ok: success, out: decoder.decode(stdout), missing: false };
    } catch {
      // not at this path; try the next
    }
  }
  return { ok: false, out: '', missing: true };
}

const ciOf = (p: Rollup): Ci => p.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;

const pull = (p: RawPull): Pull => ({
  repo: p.repository.nameWithOwner,
  number: p.number,
  title: p.title,
  url: p.url,
  updatedAt: p.updatedAt,
  draft: p.isDraft,
  ci: ciOf(p),
  review: p.reviewDecision ?? null,
  author: p.author?.login ?? null,
});

async function read(): Promise<Exclude<ToBoard, { type: 'loading' }>> {
  const [graph, notes] = await Promise.all([gh(['api', 'graphql', '-f', `query=${QUERY}`]), gh(['api', 'notifications?per_page=30'])]);
  if (graph.missing) return { type: 'error', reason: 'no-gh' };
  if (!graph.ok) {
    const auth = await gh(['auth', 'status']);
    return { type: 'error', reason: auth.ok ? 'network' : 'auth' };
  }
  try {
    const data = JSON.parse(graph.out).data;
    const inbox = notes.ok
      ? (JSON.parse(notes.out) as { reason: string; updated_at: string; subject: { title: string; type: string; url: string | null }; repository: { full_name: string } }[]).map(n => ({
          repo: n.repository.full_name,
          title: n.subject.title,
          kind: n.subject.type,
          reason: n.reason,
          url: htmlUrl(n.subject.url, n.repository.full_name),
          updatedAt: n.updated_at,
        }))
      : [];
    const board: Board = {
      login: data.viewer.login,
      repos: data.viewer.repositories.nodes.map((r: { nameWithOwner: string; url: string; pushedAt: string; isPrivate: boolean; pullRequests: { totalCount: number }; issues: { totalCount: number }; defaultBranchRef: { target?: { messageHeadline?: string; statusCheckRollup?: { state?: Ci } | null } } | null }) => ({
        name: r.nameWithOwner,
        url: r.url,
        pushedAt: r.pushedAt,
        commit: r.defaultBranchRef?.target?.messageHeadline ?? '',
        ci: r.defaultBranchRef?.target?.statusCheckRollup?.state ?? null,
        prs: r.pullRequests.totalCount,
        issues: r.issues.totalCount,
        private: r.isPrivate,
      })),
      mine: data.viewer.pullRequests.nodes.map(pull),
      reviews: data.reviews.nodes.filter((n: RawPull) => n && n.url).map(pull),
      inbox,
      at: Date.now(),
    };
    return { type: 'board', board };
  } catch {
    return { type: 'error', reason: 'network' };
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

defineExtension({
  start(ctx: ExtensionContext) {
    // the links last sent, so an open request can only ever name one of them
    let sent = new Set<string>();
    let busy = false;
    const watching = () => ctx.devices.some(d => d.connected && d.active);

    const refresh = async () => {
      if (busy) return;
      busy = true;
      ctx.broadcast(json({ type: 'loading' } satisfies ToBoard));
      const result = await read();
      busy = false;
      if (result.type === 'board') {
        const b = result.board;
        sent = new Set([...b.repos.map(r => r.url), ...b.mine.map(p => p.url), ...b.reviews.map(p => p.url), ...b.inbox.map(n => n.url)]);
      } else ctx.log.warn(`github read failed: ${result.reason}`);
      ctx.broadcast(json(result));
    };

    ctx.on('device', event => {
      if (event.type === 'connected' || event.type === 'active') refresh();
    });

    ctx.on('message', (_device, message) => {
      const m = asJson<ToMac>(message);
      if (!m || typeof m !== 'object') return;
      if (m.type === 'hello' || m.type === 'refresh') refresh();
      else if (m.type === 'open' && typeof m.url === 'string' && sent.has(m.url)) {
        new Deno.Command('/usr/bin/open', { args: [m.url], stdout: 'null', stderr: 'null', stdin: 'null' }).output().catch(() => {});
      }
    });

    timer = setInterval(() => watching() && refresh(), EVERY_MS);
  },
  stop() {
    clearInterval(timer);
  },
});
