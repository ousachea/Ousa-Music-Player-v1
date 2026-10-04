// every physical control goes through this one table, so a different button layout is a change here and
// nowhere else. a screen that scrolls takes the wheel first; anywhere else the wheel walks the screens
import { useEffect, useRef } from 'react';

import { toLayout, type Rotate } from '../components/stage';

import { back, go, navStore, step, toggleBare, type Screen } from '../store/navigation';

export type Action =
  | { type: 'go'; screen: Screen }
  | { type: 'back' }
  | { type: 'turn'; dir: 1 | -1 }
  | { type: 'press' }
  | { type: 'rotate' }
  | { type: 'style' }
  | { type: 'home' }
  | { type: 'swipe'; dir: 1 | -1 };

export const KEYMAP: Record<string, Action> = {
  // home, and pressed again on home, the next page of widgets
  '1': { type: 'home' },
  '2': { type: 'go', screen: 'cpu' },
  '3': { type: 'go', screen: 'gpu' },
  '4': { type: 'rotate' },
  // mode, the button past the presets, steps through the home styles; 5 stands in for it at a keyboard
  m: { type: 'style' },
  '5': { type: 'style' },
  Escape: { type: 'back' },
  ArrowRight: { type: 'turn', dir: 1 },
  ArrowLeft: { type: 'turn', dir: -1 },
  // the wheel press arrives as enter; space stands in for it at a keyboard
  Enter: { type: 'press' },
  ' ': { type: 'press' },
};

/** one wheel click is this much horizontal delta; a fast spin arrives as one big event */
const WHEEL_STEP = 40;
const SWIPE_MIN_PX = 70;

/** the home pager registers here while it is up, so preset 1 can turn its page */
let pagerNext: (() => void) | null = null;

export function takePager(next: (() => void) | null) {
  pagerNext = next;
}

export type WheelTaker = { turn: (dir: 1 | -1) => void; press?: () => void };

/** the screen with a list registers here while it is up, and the wheel is its until it goes */
let wheelTaker: WheelTaker | null = null;

export function takeWheel(taker: WheelTaker | null) {
  wheelTaker = taker;
}

function act(action: Action, rotate: () => void, style: () => void) {
  switch (action.type) {
    case 'go':
      return go(action.screen);
    case 'back':
      return back();
    case 'turn':
      if (wheelTaker) return wheelTaker.turn(action.dir);
      return step(action.dir);
    case 'press':
      // a list on screen uses the press to choose; anywhere else it puts the bars away or brings them back
      if (wheelTaker?.press) return wheelTaker.press();
      return toggleBare();
    case 'swipe':
      return step(action.dir);
    case 'rotate':
      return rotate();
    case 'style':
      return style();
    case 'home':
      if (navStore.get().screen === 'home' && pagerNext) return pagerNext();
      return go('home');
  }
}

/** `rotate` is the current turn, so a swipe is read along the axis the viewer swiped; `onRotate` turns it further */
export function useCarThingInput(rotate: Rotate, onRotate: () => void, onStyle: () => void) {
  const turn = useRef(rotate);
  turn.current = rotate;
  const spin = useRef(onRotate);
  spin.current = onRotate;
  const restyle = useRef(onStyle);
  restyle.current = onStyle;
  const doAct = (action: Action) => act(action, () => spin.current(), () => restyle.current());
  const wheelAcc = useRef(0);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = KEYMAP[e.key];
      if (!action) return;
      e.preventDefault();
      doAct(action);
    };
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : 0;
      if (!d) return;
      wheelAcc.current += d;
      while (Math.abs(wheelAcc.current) >= WHEEL_STEP) {
        const dir = wheelAcc.current > 0 ? 1 : -1;
        wheelAcc.current -= dir * WHEEL_STEP;
        doAct({ type: 'turn', dir });
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      // a list being dragged is scrolling, not asking for another screen
      swipeFrom.current = target?.closest('[data-scroll]') ? null : toLayout(e.clientX, e.clientY, turn.current);
    };
    const onUp = (e: PointerEvent) => {
      const from = swipeFrom.current;
      swipeFrom.current = null;
      if (!from) return;
      const to = toLayout(e.clientX, e.clientY, turn.current);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx) * 0.7) return;
      doAct({ type: 'swipe', dir: dx < 0 ? 1 : -1 });
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
