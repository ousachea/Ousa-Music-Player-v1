// your own pixel art: kept on the device as one string per drawing, a palette index per cell, and shown
// in the scene list beside the animated ones with a slow twinkle so the wall still looks alive
import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useState } from 'react';

import { COLS, ROWS, put, type Frame } from './led';
import type { Scene } from './scenes';

// index 0 is an unlit cell, which is also the eraser
export const PALETTE: [number, number, number][] = [
  [0, 0, 0],
  [255, 255, 255],
  [255, 64, 64],
  [255, 140, 30],
  [255, 214, 40],
  [140, 240, 60],
  [30, 200, 90],
  [40, 230, 210],
  [40, 150, 255],
  [70, 70, 255],
  [160, 80, 255],
  [255, 80, 200],
  [255, 170, 190],
  [150, 90, 50],
  [120, 120, 130],
  [255, 230, 170],
];

export type Drawing = { id: string; cells: string };

const STORE_KEY = 'drawings';
export const EMPTY = '0'.repeat(COLS * ROWS);

export function cellIndex(cells: string, x: number, y: number) {
  return parseInt(cells[y * COLS + x], 16) || 0;
}

export function setCell(cells: string, x: number, y: number, colour: number) {
  const i = y * COLS + x;
  return cells.slice(0, i) + colour.toString(16) + cells.slice(i + 1);
}

export function paint(frame: Frame, cells: string, glow = 1) {
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const [r, g, b] = PALETTE[cellIndex(cells, x, y)];
      put(frame, x, y, r * glow, g * glow, b * glow);
    }
}

export function drawingScene(drawing: Drawing, n: number): Scene {
  return {
    id: drawing.id,
    name: `Drawing ${n}`,
    floor: [8, 8, 11],
    start: () => {
      let t = 0;
      return frame => {
        t += 1 / 30;
        for (let y = 0; y < ROWS; y++)
          for (let x = 0; x < COLS; x++) {
            // each lit cell breathes on its own phase, a little, the way a real led wall shimmers
            const i = y * COLS + x;
            const glow = 0.86 + 0.14 * Math.sin(t * 1.8 + i * 1.7);
            const [r, g, b] = PALETTE[cellIndex(drawing.cells, x, y)];
            put(frame, x, y, r * glow, g * glow, b * glow);
          }
      };
    },
  };
}

export function useDrawings(client: BridgethingClient) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  useEffect(() => {
    client.store
      .get({ key: STORE_KEY })
      .then(r => {
        if (!r.ok || !r.response.value) return;
        const parsed = JSON.parse(String(r.response.value)) as Drawing[];
        setDrawings(parsed.filter(d => typeof d.cells === 'string' && d.cells.length === COLS * ROWS));
      })
      .catch(() => {});
  }, [client]);

  const persist = useCallback(
    (next: Drawing[]) => {
      setDrawings(next);
      client.store.put({ key: STORE_KEY, value: JSON.stringify(next) }).catch(() => {});
    },
    [client],
  );

  const save = useCallback(
    (drawing: Drawing) =>
      setDrawings(prev => {
        const next = prev.some(d => d.id === drawing.id) ? prev.map(d => (d.id === drawing.id ? drawing : d)) : [...prev, drawing];
        client.store.put({ key: STORE_KEY, value: JSON.stringify(next) }).catch(() => {});
        return next;
      }),
    [client],
  );

  const remove = useCallback((id: string) => persist(drawings.filter(d => d.id !== id)), [drawings, persist]);

  return { drawings, save, remove };
}
