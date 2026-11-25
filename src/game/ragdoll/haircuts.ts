import { Ctx, clamp } from '../util';
import type { Stick } from './stick';
import { HAIR_ART, HAIR_IRISES, REFINED_HAIR, HairIrisId, HairLines, HairShape, HairZone, RefinedHairId } from './config';

export interface CutMotion { sway: number; fringe: number; velocity: number; angle: number; x: number; y: number; face: number }

export const isRefinedHair = (style: string): style is RefinedHairId => Object.prototype.hasOwnProperty.call(REFINED_HAIR, style);
const headAngle = (k: Stick) => Math.atan2(k.p[0].x - k.p[1].x, k.p[1].y - k.p[0].y);

export function makeCutMotion(k: Stick): CutMotion {
  return { sway: 0, fringe: 0, velocity: 0, angle: headAngle(k), x: k.p[0].x, y: k.p[0].y, face: k.face };
}

/** Sculpted hair follows the skull, with a damped response at the ends rather than loose ribbons. */
export function stepCutMotion(k: Stick, state: CutMotion) {
  const c = HAIR_ART.motion;
  const angle = headAngle(k);
  const dx = k.p[0].x - state.x;
  const dy = k.p[0].y - state.y;
  const rotation = Math.atan2(Math.sin(angle - state.angle), Math.cos(angle - state.angle));
  if (k.face !== state.face || Math.hypot(dx, dy) > c.teleportDistance * k.s) {
    Object.assign(state, makeCutMotion(k));
    return;
  }
  const lateral = (Math.cos(angle) * dx + Math.sin(angle) * dy) * k.face / k.s;
  const air = k.alive ? Math.sin(k.t * c.breezeSpeed + k.seed * c.seedPhase) * c.breezeAmount : 0;
  const target = clamp(air - lateral / c.step * c.velocityGain - rotation / c.step * k.face * c.rotationGain, -c.limit, c.limit);
  state.velocity += ((target - state.sway) * c.stiffness - state.velocity * c.damping) * c.step;
  state.sway = clamp(state.sway + state.velocity * c.step, -c.limit, c.limit);
  state.fringe += (state.sway - state.fringe) * (1 - Math.exp(-c.fringeFollow * c.step));
  state.angle = angle; state.x = k.p[0].x; state.y = k.p[0].y; state.face = k.face;
}

type Command = { op: string; points: number[] };
const paths = new Map<string, Command[]>();
const arity: Record<string, number> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

function commands(path: string): Command[] {
  let result = paths.get(path);
  if (result) return result;
  const tokens = path.match(/[MLQCZ]|-?(?:\d*\.)?\d+/g) ?? [];
  result = [];
  for (let i = 0; i < tokens.length;) {
    const op = tokens[i++];
    const n = arity[op];
    if (n === undefined) throw new Error(`Unsupported hair path: ${op}`);
    result.push({ op, points: tokens.slice(i, i + n).map(Number) });
    i += n;
  }
  paths.set(path, result);
  return result;
}

export function hairPoint(x: number, y: number, zone: HairZone, motion?: CutMotion): [number, number] {
  if (!motion || zone === 'fixed') return [x, y];
  const c = HAIR_ART.motion;
  if (zone === 'crown') return [x + motion.sway * clamp((c.crownAnchor - y) / c.crownLength, 0, 1), y];
  if (zone === 'cloth') return [x, y + motion.fringe * c.clothFlex * clamp((c.tailAnchor - x) / c.tailLength, 0, 1)];
  if (zone === 'mane') {
    const weight = clamp((y - c.maneAnchor) / c.maneLength, 0, 1);
    return [x + motion.fringe * c.maneFlex * weight, y + Math.abs(motion.sway) * c.maneLift * weight];
  }
  const amount = clamp((y - c.fringeAnchor) / c.fringeLength, 0, 1);
  return [x + motion.fringe * c.fringeFlex * amount, y + Math.abs(motion.sway) * c.fringeLift * amount];
}

function trace(ctx: Ctx, path: string, zone: HairZone, motion?: CutMotion) {
  ctx.beginPath();
  for (const { op, points } of commands(path)) {
    const p: number[] = [];
    for (let i = 0; i < points.length; i += 2) p.push(...hairPoint(points[i], points[i + 1], zone, motion));
    if (op === 'M') ctx.moveTo(p[0], p[1]);
    else if (op === 'L') ctx.lineTo(p[0], p[1]);
    else if (op === 'Q') ctx.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else if (op === 'C') ctx.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
    else ctx.closePath();
  }
}

function shape(ctx: Ctx, piece: HairShape, outline: HairShape, motion?: CutMotion) {
  const p = HAIR_ART.paint;
  ctx.save();
  if (piece.clip) { trace(ctx, outline.path, outline.zone, motion); ctx.clip(); }
  if (piece.alpha !== undefined) ctx.globalAlpha *= piece.alpha;
  const bounds = piece.gradient ?? [p.xTop, p.top, p.xBottom, p.bottom];
  const gradient = ctx.createLinearGradient(bounds[0], bounds[1], bounds[2], bounds[3]);
  gradient.addColorStop(0, piece.colors[0]); gradient.addColorStop(1, piece.colors[1]);
  for (const [at, color] of piece.stops ?? []) gradient.addColorStop(at, color);
  trace(ctx, piece.path, piece.zone, motion);
  ctx.fillStyle = gradient; ctx.fill();
  if (piece.edge) { ctx.lineWidth = p.edgeWidth; ctx.strokeStyle = piece.edge; ctx.stroke(); }
  ctx.restore();
}

function lines(ctx: Ctx, detail: HairLines, outline: HairShape, motion?: CutMotion) {
  ctx.save();
  if (detail.clip) { trace(ctx, outline.path, outline.zone, motion); ctx.clip(); }
  ctx.strokeStyle = detail.color; ctx.lineWidth = detail.width;
  for (const path of detail.paths) { trace(ctx, path, detail.zone, motion); ctx.stroke(); }
  ctx.restore();
}

function inHeadFrame(ctx: Ctx, k: Stick, draw: () => void) {
  const angle = headAngle(k);
  const sin = Math.sin(angle); const cos = Math.cos(angle);
  ctx.save();
  ctx.transform(cos * k.face * k.s, sin * k.face * k.s, -sin * k.s, cos * k.s, k.p[0].x, k.p[0].y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  draw();
  ctx.restore();
}

/** Fine iris fibers and paired catchlights stay clipped inside the original animated eye. */
function drawGemIris(ctx: Ctx, id: HairIrisId, t: number) {
  const p = HAIR_IRISES[id];
  const c = HAIR_ART.gemEye;
  const radius = p.radius;
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, p.center);
  gradient.addColorStop(c.innerStop, p.center);
  gradient.addColorStop(c.midStop, p.middle);
  gradient.addColorStop(c.outerStop, p.outer);
  gradient.addColorStop(1, p.rim);
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = p.rim; ctx.lineWidth = c.rimWidth; ctx.stroke();
  ctx.save();
  ctx.globalAlpha *= c.rayAlpha;
  ctx.strokeStyle = p.fiber; ctx.lineWidth = c.rayWidth;
  for (let i = 0; i < c.rayCount; i++) {
    const angle = i * Math.PI * 2 / c.rayCount;
    const reach = radius * (c.rayEnd + (i % 2 ? c.rayVariation : -c.rayVariation));
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * radius * c.rayStart, Math.sin(angle) * radius * c.rayStart);
    ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
    ctx.stroke();
  }
  ctx.lineWidth = c.ringWidth;
  ctx.beginPath(); ctx.arc(0, 0, radius * c.ringRatio, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = p.pupil;
  ctx.beginPath(); ctx.arc(0, 0, radius * c.pupilRatio, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.globalAlpha *= c.shimmerBase + Math.sin(t * c.shimmerSpeed) * c.shimmerRange;
  ctx.fillStyle = c.white;
  ctx.beginPath(); ctx.arc(radius * c.gleamX, radius * c.gleamY, radius * c.gleamRadius, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(radius * c.smallGleamX, radius * c.smallGleamY, radius * c.smallGleamRadius, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** The iris follows the head, gaze, blink, and aim squint without replacing facial expressions. */
function drawIris(ctx: Ctx, k: Stick, t: number, tint?: HairIrisId) {
  const e = HAIR_ART.eye;
  if (!k.alive || k.hurt > e.hurtCutoff || k.react !== 'none' || k.happy > e.happyCutoff || (k.victory ?? 0) > e.victoryCutoff) return;
  const angle = headAngle(k);
  const sin = Math.sin(angle); const cos = Math.cos(angle);
  const lf = (k.look.x * cos + k.look.y * sin) * k.face;
  const lu = k.look.x * sin - k.look.y * cos;
  const ry = Math.max(e.minHeight, e.ry * (1 - k.lid) * (1 - e.aimSquint * k.pull * k.aiming - e.weakSquint * (1 - k.vigor)));
  if (ry < e.blinkCutoff) return;
  ctx.save();
  ctx.translate(e.forward + lf * e.lookX, -(e.up + lu * e.lookY));
  ctx.rotate(e.angle - lu * e.angleLook);
  ctx.beginPath(); ctx.ellipse(0, 0, e.rx, ry, 0, 0, Math.PI * 2); ctx.clip();
  if (tint) { drawGemIris(ctx, tint, t); ctx.restore(); return; }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, e.iris);
  g.addColorStop(0, e.red); g.addColorStop(1, e.darkRed);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.iris, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = e.ink; ctx.lineWidth = e.ringWidth;
  ctx.beginPath(); ctx.arc(0, 0, e.ring, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = e.ink;
  ctx.beginPath(); ctx.arc(0, 0, e.pupil, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < e.tomoeCount; i++) {
    const a = t * (e.turn + k.pull * k.aiming * e.focusTurn) + i * Math.PI * 2 / e.tomoeCount;
    ctx.beginPath(); ctx.arc(Math.cos(a) * e.ring, Math.sin(a) * e.ring, e.tomoeRadius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = e.white;
  ctx.beginPath(); ctx.arc(e.gleamX, e.gleamY, e.gleamSize, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawRefinedHair(ctx: Ctx, k: Stick, style: RefinedHairId, motion: CutMotion | undefined, t: number, layer: 'back' | 'front') {
  const art = REFINED_HAIR[style];
  inHeadFrame(ctx, k, () => {
    if (layer === 'back') {
      if (style === 'saiyan' && k.alive) {
        const a = HAIR_ART.aura;
        ctx.save();
        ctx.globalAlpha *= a.idleAlpha + k.pull * k.aiming * a.drawAlpha + (1 + Math.sin(t * a.speed)) * a.pulse;
        const g = ctx.createRadialGradient(a.x, a.y, a.innerRadius, a.x, a.y, a.radius);
        g.addColorStop(0, a.center); g.addColorStop(1, a.edge);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      for (const piece of art.back) shape(ctx, piece, art.outline, motion);
      for (const detail of art.backLines ?? []) lines(ctx, detail, art.outline, motion);
      return;
    }
    if (art.eye) drawIris(ctx, k, t, art.eye);
    else if (style === 'sasuke') drawIris(ctx, k, t);
    for (const piece of art.underneath) shape(ctx, piece, art.outline, motion);
    shape(ctx, art.outline, art.outline, motion);
    for (const piece of art.layers) shape(ctx, piece, art.outline, motion);
    for (const detail of art.lines) lines(ctx, detail, art.outline, motion);
    for (const piece of art.accessory) shape(ctx, piece, art.outline, motion);
    for (const detail of art.accessoryLines) lines(ctx, detail, art.outline, motion);
    if (style === 'gojo' && k.alive && k.pull * k.aiming) {
      const a = HAIR_ART.gojoGlow;
      ctx.save();
      ctx.globalAlpha *= k.pull * k.aiming * (a.alpha + a.pulse * Math.sin(t * a.speed));
      const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.radius);
      g.addColorStop(0, a.color); g.addColorStop(1, a.edge);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  });
}