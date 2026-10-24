import { useLayoutEffect, useRef, useState } from 'react';

// a long title shrinks until all of it fits the lines a short one gets at full size, rather than losing its end.
// the line height comes from the class, so each style keeps its own leading
export function FitTitle({ text, max, lines, className }: { text: string; max: number; lines: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(max);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const min = Math.round(max / 2);
    const fit = () => {
      let px = max;
      el.style.fontSize = `${px}px`;
      // measured at full size, so a short title never changes
      const room = parseFloat(getComputedStyle(el).lineHeight) * lines + 1;
      while (px > min && el.scrollHeight > room) {
        px -= 1;
        el.style.fontSize = `${px}px`;
      }
      setSize(px);
    };
    fit();
    // the bundled faces land after first paint and change every width
    document.fonts?.ready.then(fit).catch(() => {});
    // watching the parent rather than the title, whose own height moves with every step of the fit
    const observer = new ResizeObserver(fit);
    if (el.parentElement) observer.observe(el.parentElement);
    return () => observer.disconnect();
  }, [text, max, lines]);

  return (
    <div ref={box} className={`break-words ${className ?? ''}`} style={{ fontSize: size }}>
      {text}
    </div>
  );
}
