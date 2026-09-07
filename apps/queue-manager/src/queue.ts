// the daemon can read the queue, jump to an index and push a track to play next, but has no way to
// remove an entry or move one. re-queueing without a remove would duplicate the track, so reorder is
// reported unavailable rather than faked. a mock provider stands in when there is no phone attached.
import type { BridgethingClient } from '@bridgething/client';

export type Item = {
  uri: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkId: string | null;
  durationMs: number | null;
};

export type Snapshot = {
  current: Item | null;
  items: Item[];
  playing: boolean;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  positionMs: number;
  durationMs: number;
  source: 'device' | 'mock';
};

export type Capabilities = {
  select: boolean;
  playNext: boolean;
  remove: boolean;
  reorder: boolean;
  /** why the unsupported ones are unsupported, shown in the ui rather than hidden */
  note: string;
};

export const DEVICE_CAPABILITIES: Capabilities = {
  select: true,
  playNext: true,
  remove: false,
  reorder: false,
  note: 'the player exposes no remove, so a move would duplicate',
};

export const MOCK_CAPABILITIES: Capabilities = { select: true, playNext: true, remove: true, reorder: true, note: '' };

export const EMPTY: Snapshot = {
  current: null,
  items: [],
  playing: false,
  shuffle: false,
  repeat: 'off',
  positionMs: 0,
  durationMs: 0,
  source: 'device',
};

const MOCK_TRACKS: Item[] = [
  ['Midnight City', 'M83', 'Hurry Up, We’re Dreaming', 244000],
  ['A Really Quite Extraordinarily Long Song Title For Testing', 'An Artist With A Very Long Name Indeed', 'Edge Cases', 198000],
  ['Nightcall', 'Kavinsky', 'OutRun', 258000],
  ['Instant Crush', 'Daft Punk', 'Random Access Memories', 337000],
  ['Digital Love', 'Daft Punk', 'Discovery', 301000],
  ['Alive', 'Empire of the Sun', 'Ice on the Dune', 194000],
  ['Ghosts', 'Japan', 'Tin Drum', 275000],
  ['Teardrop', 'Massive Attack', 'Mezzanine', 330000],
  ['Faded', 'ZHU', 'Genesis Series', 214000],
  ['Redbone', 'Childish Gambino', 'Awaken, My Love!', 326000],
].map(([title, artist, album, durationMs]) => ({
  uri: `mock:${title}`,
  title: title as string,
  artist: artist as string,
  album: album as string,
  artworkId: null,
  durationMs: durationMs as number,
}));

export function mockSnapshot(seed: Snapshot): Snapshot {
  return {
    ...seed,
    current: MOCK_TRACKS[0],
    items: MOCK_TRACKS.slice(1),
    playing: true,
    durationMs: MOCK_TRACKS[0].durationMs ?? 0,
    source: 'mock',
  };
}

export function mockReorder(items: Item[], from: number, to: number): Item[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
  return next;
}

export function fromQueueItem(q: {
  uri: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkId: string | null;
  durationMs: number | null;
}): Item {
  return {
    uri: q.uri,
    title: q.title,
    artist: q.artist,
    album: q.album,
    artworkId: q.artworkId,
    durationMs: q.durationMs,
  };
}

export function deviceActions(client: BridgethingClient) {
  return {
    previous: () => client.player.skipPrev({ allowSeeking: true }),
    next: () => client.player.skipNext(),
    toggle: (playing: boolean) => (playing ? client.player.pause() : client.player.resume()),
    setShuffle: (on: boolean) => client.player.setShuffle({ on }),
    setRepeat: (mode: 'off' | 'all' | 'one') => client.player.setRepeat({ mode }),
    select: (index: number) => client.player.skipToIndex({ index }),
    playNext: (uri: string) => client.player.queue({ uri, position: { type: 'next' } }),
  };
}
