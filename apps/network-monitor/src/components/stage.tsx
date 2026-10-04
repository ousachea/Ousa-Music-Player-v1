// the screen never changes shape, so a quarter turn is laid out at the swapped size and rotated into place. touches
// arrive in screen coordinates and are turned back the same way before anything measures a swipe
import { createContext, useContext, type ReactNode } from 'react';

export type Rotate = 0 | 90 | 180 | 270;

export function Stage({ rotate, children }: { rotate: Rotate; children: ReactNode }) {
  const quarter = rotate === 90 || rotate === 270;
  return (
    <div className="absolute inset-0 overflow-hidden bg-screen">
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: quarter ? '100vh' : '100vw',
          height: quarter ? '100vw' : '100vh',
          transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
        }}>
        {children}
      </div>
    </div>
  );
}

/** a point on the glass, as the turned layout sees it */
export function toLayout(x: number, y: number, rotate: Rotate) {
  const dx = x - window.innerWidth / 2;
  const dy = y - window.innerHeight / 2;
  const [ax, ay] = rotate === 90 ? [dy, -dx] : rotate === 180 ? [-dx, -dy] : rotate === 270 ? [-dy, dx] : [dx, dy];
  return { x: ax, y: ay };
}

/** whether the layout is standing on its end, and by how much it is turned */
export const OrientationContext = createContext<{ rotate: Rotate; upright: boolean }>({ rotate: 0, upright: false });

export const useOrientation = () => useContext(OrientationContext);
