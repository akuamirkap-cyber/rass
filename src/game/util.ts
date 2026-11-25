export type V = { x: number; y: number };
export type Ctx = CanvasRenderingContext2D;

export const v = (x: number, y: number): V => ({ x, y });
export const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
export const len = (a: V) => Math.hypot(a.x, a.y);
export const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: V, b: V, t: number): V => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const fromAngle = (a: number, l = 1): V => ({ x: Math.cos(a) * l, y: Math.sin(a) * l });
export const rot = (p: V, a: number): V => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

/** progress of t inside the sub range [a,b], clamped 0..1 */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
/** frame-rate independent exponential smoothing */
export const damp = (cur: number, target: number, rate: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-rate * dt));

export const ease = {
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  sine: (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  outBack: (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2),
};

/**
 * Two bone inverse kinematics. `bend` is continuous (-1..1): values in between
 * read as the joint swinging towards the camera, so an elbow can change sides
 * without ever popping.
 */
export function ik(root: V, target: V, l1: number, l2: number, bend: number) {
  const d = sub(target, root);
  const raw = len(d);
  const reach = clamp(raw, Math.abs(l1 - l2) + 1, l1 + l2 - 0.05);
  const base = raw < 0.0001 ? Math.PI / 2 : Math.atan2(d.y, d.x);
  const cosA = (l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach);
  const a = Math.acos(clamp(cosA, -1, 1));
  const local = v(Math.cos(a) * l1, Math.sin(a) * l1 * clamp(bend, -1, 1));
  return { mid: add(root, rot(local, base)), end: add(root, fromAngle(base, reach)) };
}

/** distance from point p to segment ab, plus the 0..1 position along it */
export function segDist(p: V, a: V, b: V) {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y || 1;
  const t = clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2, 0, 1);
  return { d: Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t)), t };
}

/* ------------------------------------------------------------------ */
/* drawing primitives – flat vector shapes, NO outlines.               */
/* Form is described by soft shading that follows a fixed light, so it */
/* changes continuously while limbs rotate (nothing ever flips).       */
/* ------------------------------------------------------------------ */

const LIGHT = { x: -0.5, y: -0.866 }; // unit vector pointing towards the light
const SHADE = '#0a1024';

function capsule(a: V, b: V, ra: number, rb: number) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const p = new Path2D();
  p.arc(a.x, a.y, ra, ang + Math.PI / 2, ang - Math.PI / 2);
  p.arc(b.x, b.y, rb, ang - Math.PI / 2, ang + Math.PI / 2);
  p.closePath();
  return p;
}

/** flat tapered capsule between two joints */
export function cap(ctx: Ctx, a: V, b: V, ra: number, rb: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.fill(capsule(a, b, ra, rb));
}

/** soft shadow band on whichever side of the capsule faces away from the light */
export function capShade(ctx: Ctx, a: V, b: V, ra: number, rb: number, k = 0.2) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const alpha = ctx.globalAlpha;
  ctx.save();
  ctx.clip(capsule(a, b, ra, rb));
  ctx.lineCap = 'round';
  ctx.strokeStyle = SHADE;
  ctx.lineWidth = Math.max(ra, rb) * 0.95;
  for (const s of [1, -1]) {
    const n = v(-Math.sin(ang) * s, Math.cos(ang) * s);
    const away = -(n.x * LIGHT.x + n.y * LIGHT.y);
    if (away <= 0.01) continue;
    ctx.globalAlpha = alpha * k * Math.min(1, away * 1.3);
    ctx.beginPath();
    ctx.moveTo(a.x + n.x * ra * 0.95, a.y + n.y * ra * 0.95);
    ctx.lineTo(b.x + n.x * rb * 0.95, b.y + n.y * rb * 0.95);
    ctx.stroke();
  }
  ctx.restore();
}

export function limb(ctx: Ctx, a: V, b: V, ra: number, rb: number, fill: string, k = 0.2) {
  cap(ctx, a, b, ra, rb, fill);
  if (k > 0) capShade(ctx, a, b, ra, rb, k);
}

export function circle(ctx: Ctx, c: V, r: number, fill: string) {
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** free shape helper – returns the path so callers can clip to it */
export function shape(ctx: Ctx, build: (p: Path2D) => void, fill: string) {
  const p = new Path2D();
  build(p);
  ctx.fillStyle = fill;
  ctx.fill(p);
  return p;
}

export function stroke(ctx: Ctx, pts: V[], color: string, lw: number, capStyle: CanvasLineCap = 'round') {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.lineCap = capStyle;
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** soft contact shadow on the white floor */
export function groundShadow(ctx: Ctx, x: number, y: number, w: number, alpha = 0.13) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.16);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, `rgba(20,24,40,${alpha})`);
  g.addColorStop(1, 'rgba(20,24,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** shared side-profile head silhouette (facing +x), origin = skull centre */
export function headPath(p: Path2D) {
  p.moveTo(-2, -17);
  p.bezierCurveTo(9, -18, 15, -11, 15, -3);
  p.lineTo(20.5, 3.5);
  p.lineTo(15.5, 5.5);
  p.lineTo(16, 9.5);
  p.bezierCurveTo(15.5, 14.5, 11, 17.5, 5, 17.5);
  p.bezierCurveTo(-2, 17.5, -6, 14, -8, 9);
  p.bezierCurveTo(-16, 8, -18.5, -4, -15.5, -10);
  p.bezierCurveTo(-12.5, -15.5, -8, -17, -2, -17);
  p.closePath();
}
