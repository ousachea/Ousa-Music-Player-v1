// reads claude code's session logs on this machine and keeps a running tally. the logs grow all day and run to
// hundreds of megabytes, so only files touched this week are read, and each only from where the last read stopped
import { homedir } from 'node:os';

import type { ClaudeUsage } from '../../src/protocol/types';
import { parseReply, tally } from './claude-parse';

const WEEK_MS = 8 * 86_400_000;
const CHUNK = 1 << 20;
/** projects sit two levels down, and a session's subagents one more */
const DEPTH = 3;

type Cursor = { offset: number; rest: string };

/** the host may start the agent without the user's environment, so the system's own record of home is the fallback */
function home(): string | null {
  const fromEnv = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE');
  if (fromEnv) return fromEnv;
  try {
    return homedir() || null;
  } catch {
    return null;
  }
}

/** where claude code keeps its sessions: the config dir it was told to use, else either of its defaults */
function roots(): string[] {
  const configured = Deno.env.get('CLAUDE_CONFIG_DIR');
  const h = home();
  const sep = Deno.build.os === 'windows' ? '\\' : '/';
  const out = configured ? configured.split(',').map(p => `${p.trim()}${sep}projects`) : [];
  if (h) out.push(`${h}${sep}.claude${sep}projects`, `${h}${sep}.config${sep}claude${sep}projects`);
  return out;
}

async function walk(dir: string, depth: number, since: number, out: string[]) {
  let entries: AsyncIterable<{ name: string; isDirectory: boolean; isSymlink: boolean }>;
  try {
    entries = Deno.readDir(dir);
    for await (const e of entries) {
      const path = `${dir}${Deno.build.os === 'windows' ? '\\' : '/'}${e.name}`;
      if (e.isDirectory && depth > 0) await walk(path, depth - 1, since, out);
      else if (e.name.endsWith('.jsonl')) {
        const info = await Deno.stat(path).catch(() => null);
        if (info?.mtime && info.mtime.getTime() >= since) out.push(path);
      }
    }
  } catch {
    // a root that does not exist on this machine
  }
}

export function claudeReader(log: (...args: unknown[]) => void = () => {}) {
  const counts = tally();
  const cursors = new Map<string, Cursor>();
  const decoder = new TextDecoder();
  let found = false;
  let told = false;

  async function readFrom(path: string, cursor: Cursor) {
    const info = await Deno.stat(path).catch(() => null);
    if (!info) return;
    // a file that shrank was replaced; start it over, and the tally's ids keep anything already counted from counting twice
    if (info.size < cursor.offset) Object.assign(cursor, { offset: 0, rest: '' });
    if (info.size === cursor.offset) return;
    const file = await Deno.open(path, { read: true });
    try {
      await file.seek(cursor.offset, Deno.SeekMode.Start);
      const buffer = new Uint8Array(CHUNK);
      for (;;) {
        const read = await file.read(buffer);
        if (read === null || read === 0) break;
        cursor.offset += read;
        const text = cursor.rest + decoder.decode(buffer.subarray(0, read), { stream: true });
        const lines = text.split('\n');
        // the last piece may be half a line still being written; it waits for the next read
        cursor.rest = lines.pop() ?? '';
        for (const line of lines) {
          const reply = parseReply(line);
          if (reply) counts.add(reply);
        }
      }
    } finally {
      file.close();
    }
  }

  return {
    /** null until a log has been seen, so a machine without claude code reports nothing rather than zero */
    async read(): Promise<ClaudeUsage | null> {
      const now = Date.now();
      const files: string[] = [];
      for (const root of roots()) await walk(root, DEPTH, now - WEEK_MS, files);
      for (const path of files) {
        let cursor = cursors.get(path);
        if (!cursor) cursors.set(path, (cursor = { offset: 0, rest: '' }));
        await readFrom(path, cursor).catch(() => {});
      }
      if (files.length) found = true;
      else if (!found && !told) {
        told = true;
        log('no claude code logs found under', roots().join(', ') || 'no home directory');
      }
      counts.prune(now);
      return found ? counts.summary(now) : null;
    },
  };
}
