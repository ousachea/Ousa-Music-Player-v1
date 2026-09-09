// the clock can take its colour from whatever is playing, and carry the transport for it: the daemon
// says which track is on, and the artwork comes back as bytes to pull a pair of hues from
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useState } from 'react';

import { accentFrom } from './artwork-color';
import type { Palette } from './config';

export type NowPlaying = { title: string; artist: string | null; artworkId: string | null; playing: boolean };

function shade(css: string, light: number) {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(css);
  return m ? `hsl(${m[1]} ${Math.min(60, Number(m[2]))}% ${light}%)` : css;
}

export function useNowPlaying(client: BridgethingClient): NowPlaying | null {
  const [now, setNow] = useState<NowPlaying | null>(null);

  useEffect(() => {
    let stale = false;
    const take = (state: { track?: { title?: string | null; artist?: string | null; artworkId?: string | null } | null; playback?: { state?: string } | null }) => {
      const track = state.track;
      if (stale) return;
      setNow(
        track
          ? {
              title: track.title ?? 'unknown',
              artist: track.artist ?? null,
              artworkId: track.artworkId ?? null,
              playing: state.playback?.state === 'playing',
            }
          : null,
      );
    };
    client.player.stateGet().then(r => r.ok && take(r.response.state));
    const off = client.player.onSnapshot(msg => take(msg.state));
    return () => {
      stale = true;
      off();
    };
  }, [client]);

  return now;
}

export function useArtPalette(client: BridgethingClient, on: boolean, artworkId: string | null): Palette | null {
  const [pal, setPal] = useState<Palette | null>(null);

  useEffect(() => {
    if (!on || !artworkId) return setPal(null);
    let stale = false;
    (async () => {
      const result = await client.asset.get({ id: artworkId, requestId: crypto.randomUUID() });
      if (stale || !result.ok) return;
      const bytes = new Uint8Array(result.response.bytes as unknown as number[]);
      const accent = await accentFrom(new Blob([bytes], { type: result.response.mime ?? 'image/jpeg' }));
      // a cover with no usable hue leaves the palette alone rather than washing the clock grey
      if (!stale && accent) setPal({ main: accent.fill, second: accent.fill2, glow: shade(accent.fill, 22) });
    })();
    return () => {
      stale = true;
    };
  }, [client, on, artworkId]);

  return on ? pal : null;
}
