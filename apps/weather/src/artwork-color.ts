// the accent is pulled off the album art, so it has to survive dark covers, blown out covers and greyscale ones

const SAMPLE_PX = 32;
const HUE_BUCKETS = 12;

export type Accent = { fill: string; ink: string; soft: string };

function toHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  return { h, s, l };
}

// srgb relative luminance, to decide whether the play glyph sits dark or light on the fill
function luminance(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h * 6) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg].map(v => {
    const u = v + m;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function accentFrom(blob: Blob): Promise<Accent | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_PX;
  canvas.height = SAMPLE_PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, SAMPLE_PX, SAMPLE_PX);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX);
  const weight = new Float64Array(HUE_BUCKETS);
  const satSum = new Float64Array(HUE_BUCKETS);
  // circular mean per bucket, so a red that straddles both ends of the wheel averages back to red
  const cosSum = new Float64Array(HUE_BUCKETS);
  const sinSum = new Float64Array(HUE_BUCKETS);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const { h, s, l } = toHsl(data[i], data[i + 1], data[i + 2]);
    // greys, crushed blacks and blown highlights carry no usable hue
    if (s < 0.18 || l < 0.12 || l > 0.92) continue;
    const w = s * (1 - Math.abs(l - 0.5));
    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor(h * HUE_BUCKETS));
    weight[bucket] += w;
    satSum[bucket] += s * w;
    cosSum[bucket] += Math.cos(h * 2 * Math.PI) * w;
    sinSum[bucket] += Math.sin(h * 2 * Math.PI) * w;
  }

  let best = -1;
  let bestWeight = 0;
  for (let i = 0; i < HUE_BUCKETS; i++) {
    if (weight[i] > bestWeight) {
      bestWeight = weight[i];
      best = i;
    }
  }
  if (best < 0) return null;

  let h = Math.atan2(sinSum[best], cosSum[best]) / (2 * Math.PI);
  if (h < 0) h += 1;
  // the cover's own saturation would read muddy at this size, so it is pushed up and floored
  const s = Math.min(0.92, Math.max(0.55, (satSum[best] / weight[best]) * 1.25));
  const deg = Math.round(h * 360);
  const sat = Math.round(s * 100);

  return {
    fill: `hsl(${deg} ${sat}% 62%)`,
    ink: luminance(h, s, 0.62) > 0.42 ? '#060809' : '#f4f6f8',
    soft: `hsl(${deg} ${Math.round(Math.min(s, 0.6) * 100)}% 74%)`,
  };
}
