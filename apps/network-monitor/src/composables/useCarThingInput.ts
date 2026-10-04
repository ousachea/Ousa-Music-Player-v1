// every physical control goes through this one table, so a different button layout is a change here and
// nowhere else. a screen that scrolls takes the wheel first; anywhere else the wheel walks the screens
import { useEffect, useRef } from 'react';

import { back, go, step, type Screen } from '../store/navigation';

export type Action =
  | { type: 'go'; screen: Screen }
  | { type: 'back' }
  | { type: 'turn'; dir: 1 | -1 }
  | { type: 'press' }
  | { type: 'swipe'; dir: 1 | -1 };

export const KEYMAP: Record<string, Action> = {
  '1': { type: 'go', screen: 'home' },
  '2': { type: 'go', screen: 'cpu' },
  '3': { type: 'go', screen: 'gpu' },
  '4': { type: 'go', screen: 'network' },
  m: { type: 'go', screen: 'more' },
  Escape: { type: 'back' },
  ArrowRight: { type: 'turn', dir: 1 },
  ArrowLeft: { type: 'turn', dir: -1 },
  Enter: { type: 'press' },
};

/** one wheel click is this much horizontal delta; a fast spin arrives as one big event */
const WHEEL_STEP = 40;
const SWIPE_MIN_PX = 70;

export type WheelTaker = { turn: (dir: 1 | -1) => void; press?: () => void };

/** the screen with a list registers here while it is up, and the wheel is its until it goes */
let wheelTaker: WheelTaker | null = null;

export function takeWheel(taker: WheelTaker | null) {
  wheelTaker = taker;
}

function act(action: Action) {
  switch (action.type) {
    case 'go':
      return go(action.screen);
    case 'back':
      return back();
    case 'turn':
      if (wheelTaker) return wheelTaker.turn(action.dir);
      return step(action.dir);
    case 'press':
      return wheelTaker?.press?.();
    case 'swipe':
      return step(action.dir);
  }
}

export function useCarThingInput() {
  const wheelAcc = useRef(0);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = KEYMAP[e.key];
      if (!action) return;
      e.preventDefault();
      act(action);
    };
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : 0;
      if (!d) return;
      wheelAcc.current += d;
      while (Math.abs(wheelAcc.current) >= WHEEL_STEP) {
        const dir = wheelAcc.current > 0 ? 1 : -1;
        wheelAcc.current -= dir * WHEEL_STEP;
        act({ type: 'turn', dir });
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      // a list being dragged is scrolling, not asking for another screen
      swipeFrom.current = target?.closest('[data-scroll]') ? null : { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const from = swipeFrom.current;
      swipeFrom.current = null;
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx) * 0.7) return;
      act({ type: 'swipe', dir: dx < 0 ? 1 : -1 });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);
}
