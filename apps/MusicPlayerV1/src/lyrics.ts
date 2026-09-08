// the daemon answers with whatever the phone has for the current track: timed lines, a plain block,
// or nothing at all. all three are ordinary outcomes, so none of them is an error here.
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useState } from 'react';

export type Line = { startMs: number; text: string };
export type Lyrics =
  | { state: 'loading' }
  | { state: 'none' }
  | { state: 'timed'; lines: Line[]; source: string | null }
  | { state: 'plain'; text: string; source: string | null };

type Reply = {
  lyrics?: { synced?: Line[] | null; plain?: string | null; source?: string | null } | null;
};

export function useLyrics(client: BridgethingClient, trackKey: string | null): Lyrics {
  const [lyrics, setLyrics] = useState<Lyrics>({ state: 'loading' });

  useEffect(() => {
    if (!trackKey) return setLyrics({ state: 'none' });
    let stale = false;
    setLyrics({ state: 'loading' });
    client.lyrics
      .get()
      .then(r => {
        if (stale) return;
        if (!r.ok) return setLyrics({ state: 'none' });
        const found = (r.response as unknown as Reply).lyrics;
        const source = found?.source ?? null;
        const synced = found?.synced;
        if (synced && synced.length > 0) return setLyrics({ state: 'timed', lines: synced, source });
        const plain = found?.plain?.trim();
        if (plain) return setLyrics({ state: 'plain', text: plain, source });
        setLyrics({ state: 'none' });
      })
      .catch(() => !stale && setLyrics({ state: 'none' }));
    return () => {
      stale = true;
    };
  }, [client, trackKey]);

  return lyrics;
}

// the line that should be lit at this moment: the last one that has started
export function activeIndex(lines: Line[], elapsedMs: number) {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].startMs <= elapsedMs) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
