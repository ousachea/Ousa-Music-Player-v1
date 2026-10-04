// the two ways a screen takes the wheel: moving a highlight down a list, or scrolling a long view
import { useEffect, useRef, useState, type RefObject } from 'react';

import { takeWheel } from './useCarThingInput';

const SCROLL_PX = 64;

export function useWheelList(count: number, onPress?: (index: number) => void) {
  const [index, setIndex] = useState(0);
  const at = useRef(0);
  at.current = Math.min(index, Math.max(0, count - 1));
  const press = useRef(onPress);
  press.current = onPress;

  useEffect(() => {
    takeWheel({
      turn: dir => setIndex(i => Math.min(Math.max(0, count - 1), Math.max(0, i + dir))),
      press: () => press.current?.(at.current),
    });
    return () => takeWheel(null);
  }, [count]);

  return [at.current, setIndex] as const;
}

export function useWheelScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    takeWheel({ turn: dir => ref.current?.scrollBy({ top: dir * SCROLL_PX, behavior: 'smooth' }) });
    return () => takeWheel(null);
  }, [ref]);
}

/** keeps the highlighted row in view as the wheel walks past the edge of the list */
export function useKeepInView(container: RefObject<HTMLElement | null>, index: number) {
  useEffect(() => {
    const row = container.current?.children[index] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [container, index]);
}
