// Layered silhouette backdrop: sky gradient, celestial disc, two depth-separated forest layers
// with smooth tapered trunks and sculpted bonsai-like canopies, and rolling grassy hills.

export interface Theme {
  name: string; top: string; mid: string; bot: string;
  tree: string; hill: string; plat: string; platTop: string; glow: string;
  /** rim light on the stickmen, firefly colour, light-shaft colour, foreground grass */
  rim: string; fly: string; ray: string; fg: string;
  /** sun or moon: x,y as fractions, radius factor, colour; night skies also get stars */
  disc: [number, number, number, string]; stars: boolean;
}

export const THEMES: Theme[] = [
  { name: 'Teal Forest', top: '#0a4767', mid: '#0f8097', bot: '#37ebf1', tree: '#052f48', hill: '#075f74', plat: '#0a3b48', platTop: '#11596a', glow: 'rgba(150,255,250,0.28)', rim: '#1c5566', fly: '#eaff9a', ray: '190,255,250', fg: '#04303d', disc: [0.72, 0.2, 0.09, '#c9fffb'], stars: false },
  { name: 'Violet Dusk', top: '#2a1a5e', mid: '#7440a6', bot: '#f6a3c6', tree: '#170b3d', hill: '#4a2278', plat: '#27144c', platTop: '#40236e', glow: 'rgba(255,200,225,0.3)', rim: '#4b3478', fly: '#ffd9f2', ray: '255,200,235', fg: '#1d0d3f', disc: [0.3, 0.26, 0.1, '#ffd6ec'], stars: true },
  { name: 'Amber Valley', top: '#7a2a1c', mid: '#d9652b', bot: '#ffd870', tree: '#47130c', hill: '#8a3516', plat: '#4a1810', platTop: '#70281a', glow: 'rgba(255,240,170,0.35)', rim: '#7a3a22', fly: '#fff0a8', ray: '255,225,150', fg: '#3a0f09', disc: [0.62, 0.42, 0.13, '#fff3b8'], stars: false },
  { name: 'Midnight Blue', top: '#050b28', mid: '#14306e', bot: '#4897dc', tree: '#02051a', hill: '#0b2a62', plat: '#071235', platTop: '#12265a', glow: 'rgba(170,215,255,0.25)', rim: '#23407e', fly: '#d8f6ff', ray: '170,210,255', fg: '#020820', disc: [0.76, 0.18, 0.075, '#eef6ff'], stars: true },
  { name: 'Emerald Marsh', top: '#0a3a2b', mid: '#1c8a5c', bot: '#bdf47e', tree: '#05241a', hill: '#136043', plat: '#0a3324', platTop: '#145038', glow: 'rgba(230,255,170,0.3)', rim: '#1f5a40', fly: '#f4ff9a', ray: '225,255,170', fg: '#04211a', disc: [0.28, 0.22, 0.09, '#eaffc0'], stars: false },
];

type C2 = CanvasRenderingContext2D;
export interface CanvasLike { width: number; height: number; getContext(t: '2d'): unknown }
export type MakeCanvas = (w: number, h: number) => CanvasLike;
/** three parallax bitmaps, each `pad` px wider than the screen on both sides */
export interface Scene { sky: CanvasLike; near: CanvasLike; hills: CanvasLike; pad: number }

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth tapered quadratic Bézier branch/trunk rendered as a single clean filled silhouette. */
function taperedCurve(
  ctx: C2,
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
  r0: number, r1: number,
  flare = 0,
) {
  const steps = 12;
  const left: [number, number][] = [];
  const right: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const px = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const py = u * u * y0 + 2 * u * t * cy + t * t * y1;

    // Derivative of quadratic Bézier for smooth perpendicular normal
    let tx = 2 * u * (cx - x0) + 2 * t * (x1 - cx);
    let ty = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
    const mag = Math.hypot(tx, ty) || 1;
    tx /= mag;
    ty /= mag;
    const nx = -ty;
    const ny = tx;

    // Smooth taper + subtle organic root flare near t=0
    const rootBoost = flare > 0 ? flare * Math.pow(Math.max(0, 1 - t / 0.34), 2.2) : 0;
    const r = r0 + (r1 - r0) * t + rootBoost;
    left.push([px + nx * r, py + ny * r]);
    right.push([px - nx * r, py - ny * r]);
  }

  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  // Rounded tip
  if (r1 >= 1.2) {
    const endAngle = Math.atan2(y1 - cy, x1 - cx);
    ctx.arc(x1, y1, r1, endAngle + Math.PI / 2, endAngle - Math.PI / 2, true);
  }
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
}

/** Sculpted flat-bottomed cloud/bonsai canopy pad with a cohesive silhouette. */
function canopyPad(ctx: C2, rnd: () => number, cx: number, cy: number, rw: number, rh: number) {
  const shift = (rnd() - 0.5) * 0.14;
  // Base elliptical body keeps bottom calm and cohesive
  ctx.beginPath();
  ctx.ellipse(cx, cy + rh * 0.08, rw * 0.88, rh * 0.54, 0, 0, Math.PI * 2);
  ctx.fill();

  // Balanced dome lobes forming an asymmetric cloud-like crown
  const lobes: [number, number, number, number][] = [
    [-0.56 + shift * 0.3, 0.08, 0.36, 0.34],
    [-0.24 + shift * 0.6, -0.14, 0.44, 0.46],
    [0.06 + shift, -0.22, 0.48, 0.52],
    [0.34 + shift * 0.5, -0.1, 0.4, 0.42],
    [0.6 + shift * 0.2, 0.1, 0.34, 0.32],
  ];
  ctx.beginPath();
  for (const [ox, oy, rx, ry] of lobes) {
    const px = cx + ox * rw;
    const py = cy + oy * rh;
    const rxPx = rw * rx * (0.94 + rnd() * 0.12);
    const ryPx = rh * ry * (0.94 + rnd() * 0.12);
    ctx.moveTo(px + rxPx, py);
    ctx.ellipse(px, py, rxPx, ryPx, 0, 0, Math.PI * 2);
  }
  ctx.fill();
}

/**
 * Clean bonsai-inspired forest tree:
 * smooth flared root -> gracefully curved trunk -> staggered non-crossing boughs -> layered canopy pads.
 */
function tree(ctx: C2, rnd: () => number, x: number, baseY: number, height: number, lean: number, detail = true) {
  const rRoot = Math.max(2.4, height * 0.032);
  const rMid = rRoot * 0.64;
  const rCrown = Math.max(1.6, rRoot * 0.38);

  // Subtle S-curve trunk from buried foot up to main crown split
  const trunkH = height * 0.58;
  const sway = (rnd() - 0.5) * height * 0.045;
  const midX = x + Math.sin(lean) * trunkH * 0.46 + sway;
  const midY = baseY - trunkH * 0.5;
  const topX = x + Math.sin(lean) * trunkH + sway * 0.6;
  const topY = baseY - trunkH;

  // Root-to-mid lower trunk with smooth flare
  taperedCurve(ctx, x, baseY + 6, x + sway * 0.5, baseY - trunkH * 0.24, midX, midY, rRoot, rMid, rRoot * 0.95);
  // Mid-to-top upper trunk
  taperedCurve(ctx, midX, midY, midX + Math.sin(lean) * trunkH * 0.26, baseY - trunkH * 0.78, topX, topY, rMid, rCrown);

  const pads: [number, number, number, number][] = [];
  const firstLeft = rnd() < 0.5;

  // Two staggered side boughs (lower & upper) branching cleanly left and right
  const boughs: { t: number; side: number; len: number; lift: number; r0: number }[] = [
    { t: 0.62 + rnd() * 0.08, side: firstLeft ? -1 : 1, len: height * (0.23 + rnd() * 0.05), lift: height * (0.14 + rnd() * 0.04), r0: rMid * 0.72 },
    { t: 0.8 + rnd() * 0.08, side: firstLeft ? 1 : -1, len: height * (0.2 + rnd() * 0.05), lift: height * (0.15 + rnd() * 0.04), r0: rCrown * 0.95 },
  ];

  for (const b of boughs) {
    // Interpolate attachment point along upper trunk segment
    const u = (b.t - 0.5) / 0.5;
    const bx0 = (1 - u) * midX + u * topX;
    const by0 = (1 - u) * midY + u * topY;
    const bx1 = bx0 + b.side * b.len;
    const by1 = by0 - b.lift;
    const bcx = bx0 + b.side * b.len * 0.48;
    const bcy = by0 - b.lift * 0.25;
    const br1 = Math.max(1.2, b.r0 * 0.34);

    taperedCurve(ctx, bx0, by0, bcx, bcy, bx1, by1, b.r0, br1);
    pads.push([bx1, by1 - height * 0.025, height * (0.17 + rnd() * 0.03), height * (0.085 + rnd() * 0.02)]);

    // Secondary upward sub-branch on outer/inner shoulder for fuller silhouette
    if (detail) {
      const sx0 = (bx0 + bx1) * 0.52;
      const sy0 = (by0 + by1) * 0.5 + b.lift * 0.08;
      const sx1 = sx0 + b.side * b.len * 0.32;
      const sy1 = sy0 - b.lift * 0.78;
      taperedCurve(ctx, sx0, sy0, sx0 + b.side * b.len * 0.1, sy0 - b.lift * 0.42, sx1, sy1, b.r0 * 0.48, Math.max(1, br1 * 0.75));
      pads.push([sx1, sy1 - height * 0.02, height * 0.135, height * 0.072]);
    }
  }

  // Central crown leader continuing smoothly upward
  const crownTilt = lean * 0.55 + (rnd() - 0.5) * 0.12;
  const crownLen = height * (0.22 + rnd() * 0.04);
  const cx1 = topX + Math.sin(crownTilt) * crownLen;
  const cy1 = topY - Math.cos(crownTilt) * crownLen;
  taperedCurve(ctx, topX, topY, topX + Math.sin(crownTilt) * crownLen * 0.45, topY - crownLen * 0.55, cx1, cy1, rCrown, Math.max(1.2, rCrown * 0.38));

  // Main upper crown pad + slight side shoulder pad so the top reads full and layered
  pads.push([cx1, cy1 - height * 0.025, height * (0.23 + rnd() * 0.03), height * (0.115 + rnd() * 0.02)]);
  if (detail) {
    const side = firstLeft ? -1 : 1;
    const ax0 = (topX + cx1) * 0.5;
    const ay0 = (topY + cy1) * 0.5;
    const ax1 = ax0 + side * height * 0.11;
    const ay1 = ay0 - height * 0.09;
    taperedCurve(ctx, ax0, ay0, ax0 + side * height * 0.05, ay0 - height * 0.04, ax1, ay1, rCrown * 0.62, Math.max(1, rCrown * 0.28));
    pads.push([ax1, ay1 - height * 0.015, height * 0.145, height * 0.075]);
  }

  for (const [px, py, pw, ph] of pads) canopyPad(ctx, rnd, px, py, pw, ph);
}

/** Continuous rolling hill profile function so hills & tree roots share exact ground elevation. */
function makeHillSampler(w: number, y0: number, amp: number, rnd: () => number) {
  const ph = rnd() * Math.PI * 2;
  const f1 = (1.15 + rnd() * 0.45) / w * Math.PI * 2;
  const f2 = (2.4 + rnd() * 0.9) / w * Math.PI * 2;
  return (x: number) =>
    y0 - Math.sin(x * f1 + ph) * amp - Math.sin(x * f2 + ph * 1.9) * amp * 0.42;
}

function drawHill(ctx: C2, rnd: () => number, w: number, h: number, top: (x: number) => number, u: number, withTufts: boolean) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, top(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  if (!withTufts) return;
  // Neat, evenly spaced grass tufts tucked cleanly along the ridge
  for (let x = (18 + rnd() * 28) * u; x < w - 12 * u; x += (46 + rnd() * 58) * u) {
    const y = top(x) + 2;
    const blades = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < blades; i++) {
      const a = -Math.PI / 2 + (i / (blades - 1) - 0.5) * 1.15 + (rnd() - 0.5) * 0.14;
      const L = (8 + rnd() * 11) * u;
      ctx.beginPath();
      ctx.moveTo(x - 2 * u, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.45, y + Math.sin(a) * L * 0.65, x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.35, y + Math.sin(a) * L * 0.45, x + 2 * u, y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** paint the backdrop layers (w,h = screen size in device px) */
export function paintScene(w: number, h: number, th: Theme, seed: number, make: MakeCanvas): Scene {
  const rnd = rng(seed * 7919 + 13);
  const u = Math.max(0.5, Math.min(w, h * 1.5) / 1100);
  const pad = Math.round(46 * u);
  const W = w + pad * 2;
  const sky = make(W, h); const near = make(W, h); const hill = make(W, h);
  const cs = sky.getContext('2d') as C2; const cn = near.getContext('2d') as C2; const ch = hill.getContext('2d') as C2;

  // every silhouette layer is drawn opaque on its own bitmap, then laid down with one even alpha
  const layer = (into: C2, alpha: number, color: string, draw: (c: C2) => void) => {
    const cv = make(W, h);
    const c = cv.getContext('2d') as C2;
    c.fillStyle = color; c.strokeStyle = color;
    draw(c);
    into.globalAlpha = alpha;
    into.drawImage(cv as unknown as CanvasImageSource, 0, 0);
    into.globalAlpha = 1;
  };

  // --- sky: gradient, stars, sun/moon, ground glow
  const g = cs.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, th.top); g.addColorStop(0.5, th.mid); g.addColorStop(1, th.bot);
  cs.fillStyle = g; cs.fillRect(0, 0, W, h);
  if (th.stars) {
    cs.fillStyle = '#ffffff';
    for (let i = 0; i < 120; i++) {
      const y = rnd() * h * 0.58;
      cs.globalAlpha = (0.15 + rnd() * 0.58) * (1 - y / (h * 0.6));
      cs.beginPath(); cs.arc(rnd() * W, y, (0.5 + rnd() * 1.05) * u, 0, Math.PI * 2); cs.fill();
    }
    cs.globalAlpha = 1;
  }

  const [dx, dy, dr, dc] = th.disc;
  const cx = pad + dx * w; const cy = dy * h; const R = dr * Math.min(w, h * 1.4);
  const halo = cs.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 4.2);
  halo.addColorStop(0, th.glow); halo.addColorStop(1, 'rgba(255,255,255,0)');
  cs.fillStyle = halo; cs.fillRect(0, 0, W, h);
  cs.globalAlpha = 0.5; cs.fillStyle = dc;
  cs.beginPath(); cs.arc(cx, cy, R, 0, Math.PI * 2); cs.fill();
  cs.globalAlpha = 0.35;
  cs.beginPath(); cs.arc(cx, cy, R * 0.8, 0, Math.PI * 2); cs.fill();
  cs.globalAlpha = 1;

  const glow = cs.createRadialGradient(W * 0.5, h * 1.02, 0, W * 0.5, h * 1.02, Math.max(w, h) * 0.75);
  glow.addColorStop(0, th.glow); glow.addColorStop(1, 'rgba(255,255,255,0)');
  cs.fillStyle = glow; cs.fillRect(0, 0, W, h);

  // Compute hill profiles up front so every tree roots seamlessly behind its hill ridge
  const backHillTop = makeHillSampler(W, h * 0.875, h * 0.032, rnd);
  const frontHillTop = makeHillSampler(W, h * 0.948, h * 0.024, rnd);

  // Balanced slot spacing (handles both tall 16:9 arenas and wide Journey Map banners)
  const slotSpan = Math.max(255 * u, h * 0.54);
  const nearCount = Math.max(3, Math.min(6, Math.round(W / slotSpan)));
  const slotW = W / nearCount;
  const discClear = Math.max(R * 2.0, slotW * 0.34);

  // --- near tree positions: evenly distributed, framing edges & keeping sun/moon clear
  const nearXs: number[] = [];
  for (let i = 0; i < nearCount; i++) {
    let tx = (i + 0.5 + (rnd() - 0.5) * 0.24) * slotW;
    // Nudge trees away from the celestial disc so it stays clearly framed between canopies
    if (Math.abs(tx - cx) < discClear) {
      const pushDir = tx >= cx ? 1 : -1;
      tx = cx + pushDir * discClear;
    }
    // Enforce minimum separation from previous near tree
    if (nearXs.length > 0 && tx - nearXs[nearXs.length - 1] < slotW * 0.58) {
      tx = nearXs[nearXs.length - 1] + slotW * 0.58;
    }
    tx = Math.max(slotW * 0.25, Math.min(W - slotW * 0.25, tx));
    nearXs.push(tx);
  }

  // --- far trees: tucked cleanly in the gaps between near trees at gentler height
  const farCount = nearCount + 1;
  const farSlotW = W / farCount;
  layer(cs, 0.21, th.tree, (c) => {
    for (let i = 0; i < farCount; i++) {
      let tx = (i + 0.5 + (rnd() - 0.5) * 0.24) * farSlotW;
      // Gently steer far tree away from directly behind a near trunk
      for (const nx of nearXs) {
        if (Math.abs(tx - nx) < farSlotW * 0.28) {
          tx += tx >= nx ? farSlotW * 0.24 : -farSlotW * 0.24;
        }
      }
      tx = Math.max(farSlotW * 0.2, Math.min(W - farSlotW * 0.2, tx));
      const height = h * (0.48 + (i % 2 === 0 ? 0.08 : 0) + rnd() * 0.09);
      const lean = (rnd() - 0.5) * 0.14;
      tree(c, rnd, tx, backHillTop(tx) + h * 0.025, height, lean, false);
    }
  });

  // faint horizontal scan texture
  cs.fillStyle = 'rgba(255,255,255,0.018)';
  for (let y = 0; y < h; y += Math.max(3, Math.round(4 * u))) cs.fillRect(0, y, W, 1);

  // --- near trees: rhythmic height variation & subtle inward framing lean
  const rhythm = [0.76, 0.62, 0.82, 0.68, 0.78, 0.64, 0.74];
  layer(cn, 0.35, th.tree, (c) => {
    nearXs.forEach((tx, i) => {
      const normX = tx / W - 0.5; // negative on left, positive on right
      const frameLean = -normX * 0.14 + (rnd() - 0.5) * 0.08;
      const nearDisc = Math.abs(tx - cx) < discClear * 1.25;
      const baseScale = rhythm[i % rhythm.length] + (rnd() - 0.5) * 0.06;
      const height = h * (nearDisc ? Math.min(baseScale, 0.64) : baseScale);
      tree(c, rnd, tx, frontHillTop(tx) + h * 0.018, height, frameLean, true);
    });
  });

  // --- hills, plus the corner vignette
  layer(ch, 0.42, th.hill, (c) => drawHill(c, rnd, W, h, backHillTop, u, false));
  layer(ch, 0.62, th.hill, (c) => drawHill(c, rnd, W, h, frontHillTop, u, true));
  const vg = ch.createRadialGradient(W * 0.5, h * 0.55, Math.min(w, h) * 0.45, W * 0.5, h * 0.55, Math.max(w, h) * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,10,25,0.4)');
  ch.fillStyle = vg; ch.fillRect(0, 0, W, h);
  return { sky, near, hills: hill, pad };
}

/** a soft round glow sprite (white core fading out), tinted by the caller's colour */
export function glowSprite(make: MakeCanvas, color: string, size = 64): CanvasLike {
  const cv = make(size, size);
  const c = cv.getContext('2d') as C2;
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, color); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.globalAlpha = 1; c.fillStyle = g; c.fillRect(0, 0, size, size);
  // the second stop carries the colour; fade it out toward the edge
  c.globalCompositeOperation = 'destination-in';
  const a = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  a.addColorStop(0, 'rgba(0,0,0,1)'); a.addColorStop(0.25, 'rgba(0,0,0,0.55)'); a.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = a; c.fillRect(0, 0, size, size);
  c.globalCompositeOperation = 'source-over';
  return cv;
}
