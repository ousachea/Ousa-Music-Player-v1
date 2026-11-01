// a dark room dims the backlight to a glow, and the light coming back puts it back as it was
import type { BridgethingClient } from '@bridgething/client';
import { useEffect, useRef, useState } from 'react';

// the sensor reads 0 to 100; the gap between the two stops a lamp at the threshold from flickering the screen
const DARK_AT = 4;
const LIGHT_AT = 12;
const NIGHT_LEVEL = 0.12;

export function nightFrom(night: boolean, ambient: number): boolean {
  if (ambient <= DARK_AT) return true;
  if (ambient >= LIGHT_AT) return false;
  return night;
}

type Brightness = { mode: 'auto' | 'manual'; level: number };

// `off` is set while the screen is turned off, which owns the backlight until it wakes
export function useNightDim(
  client: BridgethingClient,
  on: boolean,
  off: boolean,
) {
  const [night, setNight] = useState(false);
  const saved = useRef<Brightness | null>(null);

  useEffect(() => {
    if (!on) return;
    const take = (ambient: number) => setNight((n) => nightFrom(n, ambient));
    client.hardware
      .stateGet()
      .then((r) => r.ok && take(r.response.state.ambientLevel))
      .catch(() => {});
    return client.hardware.onAmbientLightUpdate((u) => take(u.ambientLevel));
  }, [client, on]);

  useEffect(() => {
    if (off) return;
    const restore = () => {
      const was = saved.current;
      if (!was) return;
      saved.current = null;
      if (was.mode === 'auto')
        client.hardware.displaySetMode({ mode: 'auto' }).catch(() => {});
      else
        client.hardware
          .displaySetLevel({ level: was.level || 1 })
          .catch(() => {});
    };
    if (!on || !night) return restore();
    let stale = false;
    if (!saved.current)
      client.hardware
        .stateGet()
        .then(async (r) => {
          if (stale || !r.ok || saved.current) return;
          saved.current = r.response.state.brightness;
          // a level is refused in auto mode, so manual has to land first
          await client.hardware
            .displaySetMode({ mode: 'manual' })
            .catch(() => {});
          client.hardware
            .displaySetLevel({ level: NIGHT_LEVEL })
            .catch(() => {});
        })
        .catch(() => {});
    window.addEventListener('pagehide', restore);
    return () => {
      stale = true;
      window.removeEventListener('pagehide', restore);
    };
  }, [client, on, night, off]);
}
