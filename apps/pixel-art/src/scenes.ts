// the animated scenes. each one is a stepper over the same small wall of pixels: given the time that
// has passed it moves its own state on and paints the whole frame
import { COLS, ROWS, put, type Frame } from './led';

export type Scene = {
  id: string;
  name: string;
  // the colour an unlit cell sits at, so each scene's dark reads as part of it
  floor: [number, number, number];
  start: () => (frame: Frame, dt: number, now: Date) => void;
};

function clear(frame: Frame) {
  frame.fill(0);
}

function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][((i % 6) + 6) % 6];
  return [r * 255, g * 255, b * 255];
}

// black through deep red, orange and yellow to white: the heat of a flame, coolest first
const FIRE = Array.from({ length: 37 }, (_, i) => {
  const t = i / 36;
  const r = Math.min(255, t * 3.2 * 255);
  const g = Math.max(0, Math.min(255, (t - 0.32) * 2.4 * 255));
  const b = Math.max(0, Math.min(255, (t - 0.72) * 3.6 * 255));
  return [r, g, b] as const;
});

const fire: Scene = {
  id: 'fire',
  name: 'Fire',
  floor: [34, 4, 3],
  start: () => {
    // the classic spreading fire: the bottom row burns hottest, and each cell takes the heat of the
    // one below it, a little cooler and nudged sideways, which is what makes the flames lick
    const heat = new Uint8Array(COLS * (ROWS + 1));
    for (let x = 0; x < COLS; x++) heat[ROWS * COLS + x] = 36;
    let acc = 0;
    return (frame, dt) => {
      acc += dt;
      while (acc > 0.055) {
        acc -= 0.055;
        for (let y = 1; y <= ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const src = y * COLS + x;
            const roll = Math.floor(Math.random() * 3.6);
            const dst = src - COLS - (roll & 1) + 1;
            // about two and a half steps of the palette lost a row, so the flames reach two thirds of
            // the way up and only their tips flick higher
            const cooled = heat[src] - Math.floor(Math.random() * 4.2) - (Math.random() < 0.5 ? 1 : 0);
            if (dst >= 0 && dst < ROWS * COLS) heat[dst] = Math.max(0, cooled);
          }
        }
      }
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const [r, g, b] = FIRE[heat[y * COLS + x]];
          put(frame, x, y, r, g, b);
        }
    };
  },
};

const plasma: Scene = {
  id: 'plasma',
  name: 'Plasma',
  floor: [10, 6, 16],
  start: () => {
    let t = 0;
    return (frame, dt) => {
      t += dt * 0.6;
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const v =
            Math.sin(x * 0.28 + t) +
            Math.sin((y * 0.33 + t * 0.7) * 1.3) +
            Math.sin((x * 0.2 + y * 0.25 + t * 1.1) * 0.9) +
            Math.sin(Math.hypot(x - COLS / 2 + Math.sin(t) * 6, y - ROWS / 2) * 0.42);
          const [r, g, b] = hsv((v / 8 + 0.5 + t * 0.05) % 1, 0.85, 0.95);
          put(frame, x, y, r, g, b);
        }
    };
  },
};

const code: Scene = {
  id: 'code',
  name: 'Digital rain',
  floor: [2, 14, 5],
  start: () => {
    // each column has a falling head and a trail that fades behind it
    const heads = Array.from({ length: COLS }, () => ({ y: -Math.random() * ROWS * 2, speed: 6 + Math.random() * 9, tail: 5 + Math.random() * 9 }));
    return (frame, dt) => {
      clear(frame);
      for (let x = 0; x < COLS; x++) {
        const d = heads[x];
        d.y += d.speed * dt;
        if (d.y - d.tail > ROWS) Object.assign(d, { y: -Math.random() * 8, speed: 6 + Math.random() * 9, tail: 5 + Math.random() * 9 });
        for (let k = 0; k <= d.tail; k++) {
          const y = Math.floor(d.y) - k;
          const fade = 1 - k / d.tail;
          if (k === 0) put(frame, x, y, 200, 255, 210);
          else put(frame, x, y, 20 * fade, 230 * fade * fade + 20, 60 * fade);
        }
      }
    };
  },
};

const stars: Scene = {
  id: 'stars',
  name: 'Starfield',
  floor: [3, 4, 12],
  start: () => {
    const fresh = () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: 1 });
    const field = Array.from({ length: 70 }, () => ({ ...fresh(), z: Math.random() }));
    return (frame, dt) => {
      clear(frame);
      for (const s of field) {
        s.z -= dt * 0.35;
        const px = Math.round(COLS / 2 + (s.x / s.z) * 6);
        const py = Math.round(ROWS / 2 + (s.y / s.z) * 6);
        if (s.z <= 0.05 || px < 0 || py < 0 || px >= COLS || py >= ROWS) {
          Object.assign(s, fresh());
          continue;
        }
        const v = Math.min(1, (1 - s.z) * 1.4);
        put(frame, px, py, 170 * v + 60, 190 * v + 50, 255 * v);
      }
    };
  },
};

const rain: Scene = {
  id: 'rain',
  name: 'Rain',
  floor: [4, 8, 18],
  start: () => {
    const level = new Float32Array(COLS * ROWS);
    const drops: { x: number; y: number; v: number }[] = [];
    return (frame, dt) => {
      for (let i = 0; i < level.length; i++) level[i] *= Math.pow(0.02, dt);
      if (Math.random() < dt * 14) drops.push({ x: Math.floor(Math.random() * COLS), y: -1, v: 14 + Math.random() * 8 });
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.y += d.v * dt;
        const y = Math.floor(d.y);
        if (y >= ROWS - 1) {
          // a splash either side where it lands
          for (const dx of [-1, 1]) if (d.x + dx >= 0 && d.x + dx < COLS) level[(ROWS - 1) * COLS + d.x + dx] = 0.8;
          drops.splice(i, 1);
          continue;
        }
        if (y >= 0) level[y * COLS + d.x] = 1;
      }
      for (let i = 0; i < level.length; i++) {
        const v = level[i];
        put(frame, i % COLS, Math.floor(i / COLS), 60 * v, 150 * v, 255 * v);
      }
    };
  },
};

const life: Scene = {
  id: 'life',
  name: 'Life',
  floor: [10, 4, 14],
  start: () => {
    // conway's game of life, with each cell coloured by how long it has lived; it seeds itself again
    // when it settles into something that no longer changes
    let age = new Uint16Array(COLS * ROWS);
    const seed = () => {
      for (let i = 0; i < age.length; i++) age[i] = Math.random() < 0.32 ? 1 : 0;
    };
    seed();
    let acc = 0;
    let still = 0;
    let hue = Math.random();
    return (frame, dt) => {
      acc += dt;
      while (acc > 0.16) {
        acc -= 0.16;
        const next = new Uint16Array(age.length);
        let changed = 0;
        for (let y = 0; y < ROWS; y++)
          for (let x = 0; x < COLS; x++) {
            let n = 0;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++)
                if ((dx || dy) && age[((y + dy + ROWS) % ROWS) * COLS + ((x + dx + COLS) % COLS)]) n++;
            const i = y * COLS + x;
            const alive = age[i] > 0;
            next[i] = alive ? (n === 2 || n === 3 ? Math.min(age[i] + 1, 60) : 0) : n === 3 ? 1 : 0;
            if (!!next[i] !== alive) changed++;
          }
        age = next;
        still = changed < 3 ? still + 1 : 0;
        if (still > 12) {
          seed();
          still = 0;
          hue = Math.random();
        }
      }
      for (let i = 0; i < age.length; i++) {
        const a = age[i];
        const [r, g, b] = a ? hsv((hue + Math.min(a, 30) / 90) % 1, 0.75, 1) : [0, 0, 0];
        put(frame, i % COLS, Math.floor(i / COLS), r, g, b);
      }
    };
  },
};

// digits three wide and five tall, drawn doubled so four of them and a colon span the wall
const DIGITS: Record<string, string[]> = {
  '0': ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'],
  '1': ['.x.', 'xx.', '.x.', '.x.', 'xxx'],
  '2': ['xxx', '..x', 'xxx', 'x..', 'xxx'],
  '3': ['xxx', '..x', 'xxx', '..x', 'xxx'],
  '4': ['x.x', 'x.x', 'xxx', '..x', '..x'],
  '5': ['xxx', 'x..', 'xxx', '..x', 'xxx'],
  '6': ['xxx', 'x..', 'xxx', 'x.x', 'xxx'],
  '7': ['xxx', '..x', '.x.', '.x.', '.x.'],
  '8': ['xxx', 'x.x', 'xxx', 'x.x', 'xxx'],
  '9': ['xxx', 'x.x', 'xxx', '..x', 'xxx'],
};

const clock: Scene = {
  id: 'clock',
  name: 'Clock',
  floor: [16, 8, 4],
  start: () => (frame, _dt, now) => {
    clear(frame);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const top = 4;
    const glyph = (ch: string, ox: number) =>
      DIGITS[ch].forEach((row, ry) =>
        [...row].forEach((c, rx) => {
          if (c !== 'x') return;
          for (let sy = 0; sy < 2; sy++)
            for (let sx = 0; sx < 2; sx++) {
              const y = top + ry * 2 + sy;
              // warm at the top of the figures and hotter towards their feet
              const t = (y - top) / 10;
              put(frame, ox + rx * 2 + sx, y, 255, 150 + 90 * (1 - t), 40 + 60 * (1 - t));
            }
        }),
      );
    glyph(hh[0], 1);
    glyph(hh[1], 8);
    glyph(mm[0], 18);
    glyph(mm[1], 25);
    // the colon blinks with the seconds
    if (now.getSeconds() % 2 === 0) for (const y of [7, 11]) for (const dx of [0, 1]) put(frame, 15 + dx, y, 255, 200, 90);
    // the seconds run along the bottom row
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    for (let x = 0; x < Math.round((sec / 60) * COLS); x++) put(frame, x, ROWS - 2, 255, 110, 30);
  },
};

export const SCENES: Scene[] = [fire, plasma, code, stars, rain, life, clock];
