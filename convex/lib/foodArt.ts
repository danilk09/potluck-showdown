// Simple top-down food illustrations for seeded dishes, drawn in plain JS and
// encoded as PNG data URLs (Convex can't run image libraries like sharp).
import { zlibSync } from "fflate";

export type ArtKind = "bowl" | "plate" | "musubi" | "bars" | "rolls" | "cookies" | "cake" | "drink" | "spread";

export interface Art {
  kind: ArtKind;
  /** Main food colors, most prominent first (hex). */
  colors: string[];
  /** Small garnish color (hex), e.g. green onion or sesame. */
  garnish?: string;
}

const W = 480;
const H = 300;

type RGB = [number, number, number];

function hex(c: string): RGB {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade([r, g, b]: RGB, f: number): RGB {
  return [Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f)];
}

/** Deterministic random numbers, so a dish always gets the same picture. */
function rng(seedText: string) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Canvas {
  px = new Float32Array(W * H * 3);

  /** Fills where `sdf` (signed distance in pixels, < 0 inside) is inside, anti-aliased at the edge. */
  fill(x0: number, y0: number, x1: number, y1: number, sdf: (x: number, y: number) => number, color: RGB, opacity = 1) {
    const xa = Math.max(0, Math.floor(x0) - 1);
    const xb = Math.min(W - 1, Math.ceil(x1) + 1);
    const ya = Math.max(0, Math.floor(y0) - 1);
    const yb = Math.min(H - 1, Math.ceil(y1) + 1);
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const cover = Math.max(0, Math.min(1, 0.5 - sdf(x + 0.5, y + 0.5))) * opacity;
        if (cover <= 0) continue;
        const i = (y * W + x) * 3;
        for (let k = 0; k < 3; k++) this.px[i + k] += (color[k] - this.px[i + k]) * cover;
      }
    }
  }

  circle(cx: number, cy: number, r: number, color: RGB, opacity = 1) {
    this.fill(cx - r, cy - r, cx + r, cy + r, (x, y) => Math.hypot(x - cx, y - cy) - r, color, opacity);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: RGB, opacity = 1) {
    const m = Math.min(rx, ry);
    this.fill(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * m, color, opacity);
  }

  /** Rounded rectangle centered on (cx, cy), rotated by `angle` radians. */
  rect(cx: number, cy: number, w: number, h: number, r: number, color: RGB, angle = 0, opacity = 1) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ext = Math.hypot(w, h) / 2 + 1;
    this.fill(cx - ext, cy - ext, cx + ext, cy + ext, (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const lx = Math.abs(dx * cos + dy * sin) - w / 2 + r;
      const ly = Math.abs(-dx * sin + dy * cos) - h / 2 + r;
      return Math.hypot(Math.max(lx, 0), Math.max(ly, 0)) + Math.min(Math.max(lx, ly), 0) - r;
    }, color, opacity);
  }

  png(): string {
    const raw = new Uint8Array((W * 3 + 1) * H);
    for (let y = 0; y < H; y++) {
      raw[y * (W * 3 + 1)] = 0; // filter: none
      for (let x = 0; x < W * 3; x++) raw[y * (W * 3 + 1) + 1 + x] = Math.round(this.px[y * W * 3 + x]);
    }
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, W);
    dv.setUint32(4, H);
    ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
    const bytes = concat([
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlibSync(raw, { level: 9 })),
      chunk("IEND", new Uint8Array(0)),
    ]);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:image/png;base64,${btoa(bin)}`;
  }
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
  dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const WHITE: RGB = [250, 248, 244];
const RICE: RGB = [238, 231, 214];
const RICE_EDGE: RGB = [214, 204, 182];
const NORI: RGB = [38, 52, 40];

function table(c: Canvas, rand: () => number) {
  const wood = hex(["#c99a6b", "#b98b5e", "#d4a77a", "#a97c55"][Math.floor(rand() * 4)]);
  c.rect(W / 2, H / 2, W, H, 0, wood);
  for (let i = 0; i < 7; i++) c.rect(W / 2, 20 + i * 45 + rand() * 10, W + 20, 3, 1.5, shade(wood, 0.9), 0, 0.6);
}

function plate(c: Canvas, cx: number, cy: number, r: number) {
  c.circle(cx + 4, cy + 6, r, [0, 0, 0], 0.12); // shadow
  c.circle(cx, cy, r, WHITE);
  c.circle(cx, cy, r * 0.8, [238, 235, 229]);
  c.circle(cx, cy, r * 0.78, WHITE);
}

function sprinkle(c: Canvas, rand: () => number, cx: number, cy: number, spread: number, color: RGB, n: number, size: number) {
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * spread;
    c.rect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * 1.6, size, size / 2, color, rand() * Math.PI);
  }
}

function drawDish(c: Canvas, art: Art, rand: () => number, cx: number, cy: number, scale: number) {
  const col = art.colors.map(hex);
  const main = col[0] ?? [200, 120, 80];
  const second = col[1] ?? shade(main, 0.8);
  const third = col[2] ?? shade(main, 1.15);
  const garnish = art.garnish ? hex(art.garnish) : null;
  const R = 118 * scale;

  switch (art.kind) {
    case "bowl": {
      c.circle(cx + 4, cy + 6, R, [0, 0, 0], 0.14);
      c.circle(cx, cy, R, hex("#2f3b45"));
      c.circle(cx, cy, R * 0.88, third);
      // toppings in wedges, like a poke or rice bowl
      for (let i = 0; i < 26; i++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * R * 0.62;
        const color = i % 3 === 0 ? second : main;
        c.rect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 26 * scale, 22 * scale, 5 * scale, color, rand() * Math.PI);
      }
      if (garnish) sprinkle(c, rand, cx, cy, R * 0.7, garnish, 30, 5 * scale);
      break;
    }
    case "plate": {
      plate(c, cx, cy, R);
      c.circle(cx - R * 0.35, cy - R * 0.25, R * 0.31, RICE_EDGE); // scoops of rice
      c.circle(cx - R * 0.05, cy - R * 0.45, R * 0.25, RICE_EDGE);
      c.circle(cx - R * 0.36, cy - R * 0.26, R * 0.29, RICE);
      c.circle(cx - R * 0.06, cy - R * 0.46, R * 0.23, RICE);
      for (let i = 0; i < 6; i++) {
        c.ellipse(cx + R * 0.25 + (rand() - 0.5) * R * 0.5, cy + R * 0.15 + (rand() - 0.5) * R * 0.45, 30 * scale, 20 * scale, i % 2 ? main : shade(main, 0.88));
      }
      c.ellipse(cx - R * 0.35, cy + R * 0.4, R * 0.24, R * 0.16, second); // side
      if (garnish) sprinkle(c, rand, cx + R * 0.2, cy + R * 0.1, R * 0.35, garnish, 18, 4 * scale);
      break;
    }
    case "musubi": {
      plate(c, cx, cy, R);
      for (let i = -1; i <= 1; i++) {
        const x = cx + i * R * 0.5;
        c.rect(x + 2, cy + 3, R * 0.42, R * 0.97, 8 * scale, RICE_EDGE, 0.12);
        c.rect(x, cy, R * 0.4, R * 0.95, 8 * scale, RICE, 0.12);
        c.rect(x + R * 0.02, cy - R * 0.25, R * 0.42, R * 0.22, 4 * scale, main, 0.12);
        c.rect(x, cy + R * 0.08, R * 0.44, R * 0.22, 2 * scale, NORI, 0.12);
      }
      break;
    }
    case "bars": {
      plate(c, cx, cy, R);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if ((i === 0 || i === 2) && (j === 0 || j === 2) && rand() < 0.5) continue;
          const x = cx + (i - 1) * R * 0.42;
          const y = cy + (j - 1) * R * 0.42;
          c.rect(x, y, R * 0.38, R * 0.38, 5 * scale, second);
          c.rect(x, y - R * 0.02, R * 0.36, R * 0.32, 5 * scale, main);
          if (garnish) c.circle(x, y, 5 * scale, garnish);
        }
      }
      break;
    }
    case "rolls": {
      plate(c, cx, cy, R);
      for (let i = 0; i < 4; i++) {
        const y = cy + (i - 1.5) * R * 0.36;
        const a = (rand() - 0.5) * 0.3;
        c.rect(cx, y, R * 1.15, R * 0.28, R * 0.14, main, a);
        c.rect(cx, y, R * 1.0, R * 0.1, R * 0.05, second, a, 0.55);
      }
      if (garnish) c.ellipse(cx + R * 0.55, cy + R * 0.55, R * 0.18, R * 0.12, garnish);
      break;
    }
    case "cookies": {
      plate(c, cx, cy, R);
      const spots: [number, number][] = [[0, 0], [-0.45, -0.25], [0.45, -0.25], [-0.3, 0.42], [0.3, 0.42], [0, -0.55]];
      for (const [dx, dy] of spots) {
        const x = cx + dx * R;
        const y = cy + dy * R;
        c.circle(x, y, R * 0.24, shade(main, 0.85));
        c.circle(x - 2, y - 2, R * 0.22, main);
        for (let k = 0; k < 5; k++) c.circle(x + (rand() - 0.5) * R * 0.3, y + (rand() - 0.5) * R * 0.3, 3.5 * scale, second);
      }
      break;
    }
    case "cake": {
      plate(c, cx, cy, R);
      c.circle(cx, cy, R * 0.72, shade(main, 0.85));
      c.circle(cx, cy, R * 0.68, main);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        c.circle(cx + Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.52, 9 * scale, second);
      }
      c.circle(cx, cy, R * 0.2, third);
      if (garnish) sprinkle(c, rand, cx, cy, R * 0.4, garnish, 14, 4 * scale);
      break;
    }
    case "drink": {
      for (let i = 0; i < 3; i++) {
        const x = cx + (i - 1) * R * 0.75;
        const y = cy + (i === 1 ? -R * 0.2 : R * 0.15);
        c.circle(x + 3, y + 5, R * 0.36, [0, 0, 0], 0.12);
        c.circle(x, y, R * 0.36, [235, 242, 245]);
        c.circle(x, y, R * 0.31, main);
        for (let k = 0; k < 3; k++) c.rect(x + (rand() - 0.5) * R * 0.3, y + (rand() - 0.5) * R * 0.3, 16 * scale, 16 * scale, 3, [240, 248, 250], rand(), 0.7);
        c.circle(x + R * 0.22, y - R * 0.22, R * 0.11, second);
        if (garnish) c.ellipse(x - R * 0.12, y + R * 0.12, 10 * scale, 5 * scale, garnish);
      }
      break;
    }
    case "spread": {
      // Cover photo: a table of several dishes.
      const kinds: ArtKind[] = ["bowl", "plate", "bars", "musubi", "rolls"];
      const spots: [number, number][] = [[-150, -55], [0, -70], [150, -50], [-80, 70], [85, 72]];
      spots.forEach(([dx, dy], i) => {
        drawDish(c, { kind: kinds[i], colors: [art.colors[i % art.colors.length], art.colors[(i + 1) % art.colors.length]], garnish: art.garnish }, rand, cx + dx, cy + dy, 0.48);
      });
      break;
    }
  }
}

/** A PNG data URL picturing the dish. The same seed text always gives the same picture. */
export function foodPicture(art: Art, seedText: string): string {
  const rand = rng(seedText);
  const c = new Canvas();
  table(c, rand);
  drawDish(c, art, rand, W / 2, H / 2, 1);
  return c.png();
}
