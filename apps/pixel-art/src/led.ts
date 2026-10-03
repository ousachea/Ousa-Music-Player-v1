// the led wall: a small buffer of pixel colours drawn as soft glowing squares. three passes, all of them
// one drawImage of the whole wall, so it stays cheap on the device however busy the scene is: the
// colours blown up blocky, a mask that rounds each square and darkens the gaps between them, and the
// same colours blown up smooth and added back on top as the bloom
export const COLS = 32;
export const ROWS = 19;

export type Frame = Uint8ClampedArray;

export function blank(): Frame {
  return new Uint8ClampedArray(COLS * ROWS * 4);
}

export function put(frame: Frame, x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
  const i = (y * COLS + x) * 4;
  frame[i] = r;
  frame[i + 1] = g;
  frame[i + 2] = b;
  frame[i + 3] = 255;
}

// one cell of the mask: white in a rounded square with a soft falloff, black in the gap round it
function cellSprite(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const inset = size * 0.09;
  const glow = ctx.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size * 0.62);
  glow.addColorStop(0, '#fff');
  glow.addColorStop(0.7, '#d8d8d8');
  glow.addColorStop(1, '#5a5a5a');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.roundRect(inset, inset, size - inset * 2, size - inset * 2, size * 0.2);
  ctx.fill();
  return c;
}

export class Wall {
  private small = document.createElement('canvas');
  private smallCtx = this.small.getContext('2d')!;
  private image = new ImageData(COLS, ROWS);
  private mask: HTMLCanvasElement | null = null;
  private maskKey = '';

  constructor() {
    this.small.width = COLS;
    this.small.height = ROWS;
  }

  draw(ctx: CanvasRenderingContext2D, frame: Frame, w: number, h: number, bloom: number, floor: [number, number, number]) {
    // unlit cells still show, faintly, as an led wall does when it is on but dark
    const data = this.image.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(frame[i], floor[0]);
      data[i + 1] = Math.max(frame[i + 1], floor[1]);
      data[i + 2] = Math.max(frame[i + 2], floor[2]);
      data[i + 3] = 255;
    }
    this.smallCtx.putImageData(this.image, 0, 0);

    const cell = Math.min(w / COLS, h / ROWS);
    const gw = cell * COLS;
    const gh = cell * ROWS;
    const ox = (w - gw) / 2;
    const oy = (h - gh) / 2;

    const key = `${w}x${h}`;
    if (key !== this.maskKey) {
      const sprite = cellSprite(Math.round(cell));
      const mask = document.createElement('canvas');
      mask.width = gw;
      mask.height = gh;
      const mctx = mask.getContext('2d')!;
      const pattern = mctx.createPattern(sprite, 'repeat')!;
      pattern.setTransform(new DOMMatrix().scale(cell / Math.round(cell)));
      mctx.fillStyle = pattern;
      mctx.fillRect(0, 0, gw, gh);
      this.mask = mask;
      this.maskKey = key;
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.small, ox, oy, gw, gh);

    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.mask!, ox, oy);

    if (bloom > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = bloom;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      // a half cell wider all round, so the glow spills past the edge cells instead of stopping at them
      ctx.drawImage(this.small, ox - cell / 2, oy - cell / 2, gw + cell, gh + cell);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

// the cell a point on the canvas lands in, for painting
export function cellAt(x: number, y: number, w: number, h: number): [number, number] | null {
  const cell = Math.min(w / COLS, h / ROWS);
  const cx = Math.floor((x - (w - cell * COLS) / 2) / cell);
  const cy = Math.floor((y - (h - cell * ROWS) / 2) / cell);
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return null;
  return [cx, cy];
}
