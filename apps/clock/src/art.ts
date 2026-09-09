// the clock can take its colour from whatever is playing: the daemon says which track is on, the
// artwork comes back as bytes, and the pair of hues pulled off it becomes the palette
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useState } from 'react';

import { accentFrom } from './artwork-color';
import type { Palette } from './config';

function shade(css: string, light: number) {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(css);
  return m ? `hsl(${m[1]} ${Math.min(60, Number(m[2]))}% ${light}%)` : css;
}

export function useArtPalette(client: BridgethingClient, on: boolean): Palette | null {
  const [artworkId, setArtworkId] = useState<string | null>(null);
  const [pal, setPal] = useState<Palette | null>(null);

  useEffect(() => {
    if (!on) {
      setArtworkId(null);
      setPal(null);
      return;
    }
    let stale = false;
    const take = (id: string | null) => !stale && setArtworkId(id);
    client.player.stateGet().then(r => r.ok && take(r.response.state.track?.artworkId ?? null));
    const off = client.player.onSnapshot(msg => take(msg.state.track?.artworkId ?? null));
    return () => {
      stale = true;
      off();
    };
  }, [client, on]);

  useEffect(() => {
    if (!on || !artworkId) return;
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
