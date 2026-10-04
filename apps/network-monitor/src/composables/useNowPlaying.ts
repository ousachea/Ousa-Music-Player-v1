// what the phone is playing, its artwork, and a playhead that runs between the sparse snapshots the daemon sends
import { type BridgethingClient, type PlayerState } from '@bridgething/client';
import { createContext, useContext, useEffect, useState } from 'react';

export type NowPlaying = {
  state: PlayerState | null;
  artUrl: string | null;
  /** ms into the track right now */
  position: number;
};

export function useNowPlaying(client: BridgethingClient): NowPlaying {
  const [state, setState] = useState<PlayerState | null>(null);
  const [anchor, setAnchor] = useState({ at: Date.now(), position: 0 });
  const [artUrl, setArtUrl] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const apply = (s: PlayerState) => {
      setState(s);
      setAnchor({ at: Date.now(), position: s.playback.positionMs });
    };
    const off = client.player.onSnapshot(r => apply(r.state));
    client.player
      .stateGet()
      .then(r => r.ok && apply(r.response.state))
      .catch(() => {});
    return off;
  }, [client]);

  const playing = state?.playback.state === 'playing';
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [playing]);

  const artworkId = state?.track?.artworkId ?? null;
  useEffect(() => {
    if (!artworkId) return setArtUrl(null);
    let url: string | null = null;
    let gone = false;
    client.asset
      .get({ id: artworkId, requestId: crypto.randomUUID() })
      .then(r => {
        if (gone || !r.ok) return;
        const bytes = new Uint8Array(r.response.bytes as unknown as number[]);
        url = URL.createObjectURL(new Blob([bytes], { type: r.response.mime ?? 'image/jpeg' }));
        setArtUrl(url);
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, artworkId]);

  const duration = state?.track?.durationMs ?? 0;
  const position = Math.min(duration || Infinity, anchor.position + (playing ? Date.now() - anchor.at : 0));
  return { state, artUrl, position };
}

export const ClientContext = createContext<BridgethingClient | null>(null);
export const useClient = () => useContext(ClientContext);
