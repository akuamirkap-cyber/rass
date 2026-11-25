import {
  Ctx, V, v, add, sub, mul, len, dist, lerp, lerpV, clamp, damp, fromAngle, rot, ik, segDist,
  cap, capShade, circle, shape, stroke, headPath,
} from './util';
import { ARROW_LEN, drawApple, drawArrow } from './gear';
import { tx } from '../i18n';

export type Mood = 'calm' | 'approve' | 'ragdoll';
export type Part = 'head' | 'torso' | 'armU' | 'armL' | 'thigh' | 'shin';
/** cross = arms folded, hips = hands on hips, hold = both hands keep the apple on the head */
export type PoseKind = 'cross' | 'hips' | 'hold';
export interface Hit { part: Part; a: number; b: number }
/** something solid a ragdoll can land on (trampoline bed, glass pane) */
export interface Box { l: number; r: number; top: number; bounce: number }
/** an arrow lodged in the body segment a->b (so it tumbles with that segment) */
interface Stuck { a: number; b: number; u: number; w: number; rel: number }
type Hinge = [number, number, number, number];
interface Rag { p: V[]; o: V[]; len: number[]; acc: number; hinges: Hinge[] }

export interface TargetState {
  kind: 0 | 1; // 0 = Pak Bejo, 1 = Mas Joko
  x: number; // feet position – `y` is whatever he stands on, not necessarily the floor
  y: number;
  ground: number;
  time: number;
  mood: Mood;
  t: number;
  look: V; // world point the eyes follow
  approve: number; // 0..1 smoothed thumbs-up blend
  brow: number; // 0..1 raised eyebrow (a near miss earns exactly this much)
  pose: PoseKind;
  hold: number; // 0..1 smoothed "hands are up on the apple"
  stance: number; // half distance between the feet
  dip: number; // knee bend in px – a spring that chases dipT
  dipV: number;
  dipT: number;
  tilt: number; // whole body rotation about the feet
  air: number; // 0..1 airborne (toes point down)
  hasApple: boolean;
  glasses: boolean;
  stuck: Stuck[];
  rag: Rag | null;
  boxes: Box[];
}

export function makeTarget(kind: 0 | 1, x: number, ground: number, pose: PoseKind): TargetState {
  return {
    kind, x, y: ground, ground, time: kind * 1.3, mood: 'calm', t: 0, look: v(x - 600, ground - 150),
    approve: 0, brow: 0, pose, hold: pose === 'hold' ? 1 : 0, stance: 8, dip: 0, dipV: 0, dipT: 0, tilt: 0, air: 0,
    hasApple: true, glasses: kind === 0, stuck: [], rag: null, boxes: [],
  };
}

export const APPLE_R = 14;
export const HEAD_R = 17.5;
export const PART_LABEL: Record<Part, string> = {
  head: 'HEAD!', torso: 'BODY!', armU: 'ARM!', armL: 'HAND!', thigh: 'THIGH!', shin: 'LEG!',
};
export const PART_LABEL_ID: Record<Part, string> = {
  head: 'KEPALA!', torso: 'BADAN!', armU: 'LENGAN!', armL: 'TANGAN!', thigh: 'PAHA!', shin: 'KAKI!',
};
export const partLabel = (p: Part): string => tx(PART_LABEL[p], PART_LABEL_ID[p]);
const APPLE_OFF = [29, 33]; // head centre -> apple centre (Joko's sits on his hair)

// joints: 0 head, 1 neck, 2 hip, 3 elbow, 4 hand, 5 far elbow, 6 far hand,
//         7 knee, 8 foot, 9 far knee, 10 far foot
const STICKS: [number, number][] = [[0, 1], [1, 2], [1, 3], [3, 4], [1, 5], [5, 6], [2, 7], [7, 8], [2, 9], [9, 10]];
const RADIUS = [15, 12, 13, 6, 5, 6, 5, 8.5, 6.5, 8.5, 6.5];
const INV_M = [0.9, 0.42, 0.38, 1.4, 2, 1.4, 2, 0.85, 1.25, 0.85, 1.25];
// [a, b, min distance as a fraction of the two bones between them] – cheap joint limits
const STRUTS: [number, number, number][] = [[0, 2, 0.86], [1, 7, 0.62], [1, 9, 0.62], [2, 8, 0.36], [2, 10, 0.36], [1, 4, 0.3], [1, 6, 0.3]];
// [root, mid, end, allowed bend sign] – knees and elbows only fold one way
const HINGES: Hinge[] = [[2, 7, 8, -1], [2, 9, 10, -1], [1, 3, 4, 1], [1, 5, 6, 1]];

const LOOKS = [
  {
    skin: '#e9b48b', skinFar: '#d19a70', shirt: '#f0b429', shirtFar: '#d99a17', stripe: '#fff7dc',
    jeans: '#3d6db0', jeansFar: '#30588f', shoe: '#5d3b22', shoeFar: '#4a2e19', beard: '#cf6a1f', hair: '#9a5a2a', ink: '#22252c',
  },
  {
    skin: '#c88f64', skinFar: '#b17a51', shirt: '#1f9d8a', shirtFar: '#178373', stripe: '#f4f5f7',
    jeans: '#3b3f4a', jeansFar: '#2e313a', shoe: '#f1f3f5', shoeFar: '#d5d9df', beard: '#1d1a19', hair: '#1d1a19', ink: '#1d1a19',
  },
];
type Look = (typeof LOOKS)[number];

/** kinematic pose (he faces the archer, i.e. looks left). Local +x = his forward. */
function pose(s: TargetState): { J: V[]; apple: V } {
  const W = (p: V) => {
    const r = rot(v(-p.x, p.y), s.tilt);
    return v(s.x + r.x, s.y + r.y);
  };
  const breath = Math.sin(s.time * 1.9) * 0.7;
  const d = clamp(s.dip, 0, 40);
  const lean = d * 0.0045; // crouching tips the torso forward a little
  const hip = v(-d * 0.22, -82 + d);
  const neck = add(hip, rot(v(-1.5, -58 - breath), lean));
  const head = add(neck, rot(v(3, -30), lean * 0.6));
  const apple = v(head.x - 1, head.y - APPLE_OFF[s.kind]);

  const k = s.approve;
  const folded = s.pose === 'cross' || (s.pose === 'hold' && s.kind === 0);
  const restN = folded
    ? v(neck.x + lerp(22.5, 26.5, k), neck.y + lerp(21, -12, k))
    : v(neck.x + lerp(8.5, 26.5, k), neck.y + lerp(48, -12, k));
  const restF = folded ? v(neck.x + 20.5, neck.y + 27) : v(neck.x + 6.5, neck.y + 50);
  const handN = lerpV(restN, v(apple.x + 3.5, apple.y + 9), s.hold);
  const handF = lerpV(restF, v(apple.x - 3, apple.y + 9), s.hold);
  // raised arms keep their elbows towards the camera so the face stays readable
  const bend = lerp(1, -0.3, s.hold);
  const armN = ik(neck, handN, 30, 28.5, bend);
  const armF = ik(v(neck.x + 2, neck.y), handF, 30, 28.5, bend);
  const footN = v(-s.stance, -7);
  const footF = v(s.stance, -7);
  const legN = ik(hip, footN, 39.5, 37.5, -1);
  const legF = ik(hip, footF, 39.5, 37.5, -1);
  return {
    J: [head, neck, hip, armN.mid, armN.end, armF.mid, armF.end, legN.mid, footN, legF.mid, footF].map(W),
    apple: W(apple),
  };
}

export const joints = (s: TargetState): V[] => (s.rag ? s.rag.p : pose(s).J);
export const applePos = (s: TargetState): V => pose(s).apple;
export const headPos = (s: TargetState): V => joints(s)[0];

/** which body part (if any) contains this point – nearest-to-camera parts first */
export function hitTest(s: TargetState, p: V): Hit | null {
  const J = joints(s);
  const inCap = (a: number, b: number, r: number) => segDist(p, J[a], J[b]).d < r;
  if (inCap(3, 4, 6.5)) return { part: 'armL', a: 3, b: 4 };
  if (inCap(1, 3, 8)) return { part: 'armU', a: 1, b: 3 };
  if (dist(p, J[0]) < HEAD_R) return { part: 'head', a: 1, b: 0 };
  const belly = v(lerp(J[2].x, J[1].x, 0.42) - 7, lerp(J[2].y, J[1].y, 0.42));
  if (inCap(1, 2, s.kind === 0 ? 16.5 : 14.5) || (s.kind === 0 && dist(p, belly) < 19)) return { part: 'torso', a: 2, b: 1 };
  if (inCap(2, 7, 11.5)) return { part: 'thigh', a: 2, b: 7 };
  if (inCap(2, 9, 11.5)) return { part: 'thigh', a: 2, b: 9 };
  if (inCap(7, 8, 8.5)) return { part: 'shin', a: 7, b: 8 };
  if (inCap(9, 10, 8.5)) return { part: 'shin', a: 9, b: 10 };
  return null;
}

/** hands the body over to physics, keeping whatever velocity it already had */
export function toRagdoll(s: TargetState, bodyVel: V = v(0, 0)): Rag {
  if (s.rag) return s.rag;
  const J = pose(s).J.map((p) => ({ ...p }));
  // a joint that already sits past its limit in this pose (raised arms) is left free
  const hinges = HINGES.filter(([a, m, e, sign]) => {
    const d1 = sub(J[m], J[a]);
    const d2 = sub(J[e], J[m]);
    return (d1.x * d2.y - d1.y * d2.x) * sign >= 0;
  });
  s.rag = {
    p: J, o: J.map((p) => v(p.x - bodyVel.x / 120, p.y - bodyVel.y / 120)),
    len: STICKS.map(([a, b]) => dist(J[a], J[b])), acc: 0, hinges,
  };
  s.mood = 'ragdoll';
  s.t = 0;
  return s.rag;
}

/** ragdolls him and transfers the arrow's momentum to the part it struck */
export function strike(s: TargetState, hit: Hit, tip: V, ang: number, vel: V, bodyVel: V = v(0, 0)) {
  const r = toRagdoll(s, bodyVel);
  // lodge the arrow in the segment's local frame
  const A = r.p[hit.a];
  const B = r.p[hit.b];
  const d = sub(B, A);
  const L = len(d) || 1;
  const rel = sub(tip, A);
  const u = (rel.x * d.x + rel.y * d.y) / (L * L);
  s.stuck.push({ a: hit.a, b: hit.b, u, w: (d.x * rel.y - d.y * rel.x) / L, rel: ang - Math.atan2(d.y, d.x) });
  // momentum transfer (per-frame displacement at the 120 Hz physics rate)
  const gain = { head: 0.4, torso: 0.2, armU: 0.3, armL: 0.36, thigh: 0.3, shin: 0.4 }[hit.part];
  const push = (i: number, k: number) => {
    r.o[i] = sub(r.o[i], mul(add(mul(vel, gain), v(0, -110)), k / 120));
  };
  const t = clamp(u, 0, 1);
  push(hit.a, 1 - t * 0.6);
  push(hit.b, 0.4 + t * 0.6);
  const core = hit.part === 'torso' ? 0.55 : hit.part === 'head' ? 0.32 : 0.22;
  for (const i of [1, 2]) if (i !== hit.a && i !== hit.b) push(i, core);
  for (let i = 0; i < r.p.length; i++) push(i, 0.05);
  if (hit.part === 'head') s.glasses = false;
}

// rest length between two joints that share a stick
function boneLen(r: Rag, a: number, b: number) {
  const i = STICKS.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return i >= 0 ? r.len[i] : 0;
}

let RAG_G = 1500;
/** ragdoll gravity in px/s² – the moon level lowers it */
export const setRagGravity = (g: number) => {
  RAG_G = g;
};

function stepRag(r: Rag, G: number, boxes: Box[]) {
  const n = r.p.length;
  const before: number[] = [];
  for (let i = 0; i < n; i++) {
    const vx = (r.p[i].x - r.o[i].x) * 0.997;
    const vy = (r.p[i].y - r.o[i].y) * 0.997;
    before[i] = vy;
    r.o[i] = { ...r.p[i] };
    r.p[i] = v(r.p[i].x + vx, r.p[i].y + vy + RAG_G / (120 * 120));
  }
  const solve = (a: number, b: number, target: number, onlyIfShorter: boolean) => {
    const d = sub(r.p[b], r.p[a]);
    const l = len(d) || 0.0001;
    if (onlyIfShorter && l >= target) return;
    const wa = INV_M[a];
    const wb = INV_M[b];
    const k = (l - target) / l / (wa + wb);
    r.p[a] = add(r.p[a], mul(d, k * wa));
    r.p[b] = sub(r.p[b], mul(d, k * wb));
  };
  const onBox: (Box | null)[] = new Array(n).fill(null);
  for (let it = 0; it < 10; it++) {
    STICKS.forEach(([a, b], i) => solve(a, b, r.len[i], false));
    for (const [a, b, frac] of STRUTS) {
      const mid = a === 0 ? 1 : a === 1 && b >= 7 ? 2 : b - 1;
      solve(a, b, (boneLen(r, a, mid) + boneLen(r, mid, b)) * frac, true);
    }
    for (const [a, m, e, sign] of r.hinges) {
      const d1 = sub(r.p[m], r.p[a]);
      const d2 = sub(r.p[e], r.p[m]);
      if ((d1.x * d2.y - d1.y * d2.x) * sign < 0) {
        // swing the lower bone back in line; mass-weighted so no momentum is invented
        const straight = add(r.p[m], mul(d1, len(d2) / (len(d1) || 1)));
        const c = mul(sub(straight, r.p[e]), 0.5);
        const we = INV_M[e] / (INV_M[e] + INV_M[m]);
        r.p[e] = add(r.p[e], mul(c, we));
        r.p[m] = sub(r.p[m], mul(c, 1 - we));
      }
    }
    for (let i = 0; i < n; i++) {
      const rad = RADIUS[i];
      const p = r.p[i];
      for (const b of boxes) {
        if (p.x > b.l - rad * 0.5 && p.x < b.r + rad * 0.5 && p.y > b.top - rad) {
          // came from above (or only just dipped in) -> lands on it, otherwise it is a wall
          if (r.o[i].y <= b.top - rad + 3 || p.y - (b.top - rad) < 14) {
            p.y = b.top - rad;
            onBox[i] = b;
          } else p.x = p.x < (b.l + b.r) / 2 ? b.l - rad * 0.5 : b.r + rad * 0.5;
        }
      }
      if (p.y > G - rad) p.y = G - rad;
    }
  }
  // contact response: a little bounce, a lot of friction
  for (let i = 0; i < n; i++) {
    const b = onBox[i];
    const onFloor = r.p[i].y >= G - RADIUS[i] - 0.01;
    const resting = onFloor || (b !== null && r.p[i].y >= b.top - RADIUS[i] - 0.01);
    if (resting) {
      const fr = i === 8 || i === 10 ? 0.55 : 0.8;
      r.o[i].x = r.p[i].x - (r.p[i].x - r.o[i].x) * fr;
      if (before[i] > 1.2) r.o[i].y = r.p[i].y + before[i] * (onFloor || !b ? 0.28 : b.bounce);
    }
  }
}

export function updateTarget(s: TargetState, dt: number) {
  s.time += dt;
  s.t += dt;
  s.approve = damp(s.approve, s.mood === 'approve' ? 1 : 0, 9, dt);
  s.brow = damp(s.brow, 0, 1.6, dt);
  s.hold = damp(s.hold, s.pose === 'hold' && s.hasApple ? 1 : 0, 7, dt);
  s.dipV += (-420 * (s.dip - s.dipT) - 30 * s.dipV) * dt;
  s.dip += s.dipV * dt;
  if (s.rag) {
    s.rag.acc += dt;
    let guard = 0;
    while (s.rag.acc >= 1 / 120 && guard++ < 6) {
      stepRag(s.rag, s.ground, s.boxes);
      s.rag.acc -= 1 / 120;
    }
  }
}

/* ---- drawing -------------------------------------------------------------- */

function leg(ctx: Ctx, L: Look, k: number, kind: number, hip: V, knee: V, foot: V, far: boolean, shoeAng: number | null) {
  const c = far ? L.jeansFar : L.jeans;
  cap(ctx, hip, knee, 12 * k, 9.4 * k, c);
  cap(ctx, knee, foot, 9.2 * k, 7 * k, c);
  capShade(ctx, hip, knee, 12 * k, 9.4 * k, 0.18);
  capShade(ctx, knee, foot, 9.2 * k, 7 * k, 0.18);
  ctx.save();
  ctx.translate(foot.x, foot.y);
  // planted feet stay flat; a ragdoll's shoe simply follows the shin
  ctx.rotate(shoeAng ?? Math.atan2(foot.y - knee.y, foot.x - knee.x) - Math.PI / 2);
  shape(ctx, (p) => {
    p.moveTo(8, -4); p.lineTo(-6, -4.5); p.quadraticCurveTo(-19, -1, -20, 7); p.lineTo(9, 7); p.closePath();
  }, far ? L.shoeFar : L.shoe);
  if (kind === 1) {
    ctx.fillStyle = far ? '#178373' : '#1f9d8a';
    ctx.fillRect(-18, 4.4, 26.5, 2.6);
  }
  ctx.restore();
}

function armDraw(ctx: Ctx, L: Look, k: number, sh: V, el: V, hand: V, far: boolean, thumb: number) {
  const skin = far ? L.skinFar : L.skin;
  cap(ctx, sh, el, 8 * k, 6.4 * k, skin);
  cap(ctx, el, hand, 6.4 * k, 5.2 * k, skin);
  if (!far) {
    capShade(ctx, sh, el, 8 * k, 6.4 * k, 0.16);
    capShade(ctx, el, hand, 6.4 * k, 5.2 * k, 0.16);
  }
  const mid = v(lerp(sh.x, el.x, 0.5), lerp(sh.y, el.y, 0.5));
  cap(ctx, sh, mid, 9.4 * k, 8.4 * k, far ? L.shirtFar : L.shirt);
  if (!far) capShade(ctx, sh, mid, 9.4 * k, 8.4 * k, 0.16);
  circle(ctx, hand, 6 * k, skin);
  if (thumb > 0.02) cap(ctx, hand, add(hand, v(1.5 * thumb, -11 * thumb)), 2.8, 2.5, skin);
}

function torsoBejo(ctx: Ctx, L: Look) {
  shape(ctx, (p) => {
    p.moveTo(-15, -10); p.lineTo(19, -10); p.lineTo(15, 10);
    p.quadraticCurveTo(0, 16, -15, 8); p.closePath();
  }, L.jeans);
  cap(ctx, v(-0.5, -62), v(1, -72), 6, 5.6, L.skin);
  const torso = shape(ctx, (p) => {
    p.moveTo(-13, -64); p.quadraticCurveTo(0, -69, 12, -64);
    p.bezierCurveTo(21, -54, 29, -28, 23, -11); p.lineTo(20, -4); p.lineTo(-16, -4);
    p.bezierCurveTo(-19, -20, -20, -44, -13, -64); p.closePath();
  }, L.shirt);
  ctx.save();
  ctx.clip(torso);
  ctx.fillStyle = L.stripe;
  for (const y of [-46, -30, -16]) ctx.fillRect(-24, y, 56, 3.2);
  ctx.fillStyle = 'rgba(120,70,0,0.26)';
  ctx.fillRect(-24, -70, 11, 70);
  ctx.beginPath(); ctx.ellipse(8, -2, 26, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  shape(ctx, (p) => { p.moveTo(-6, -67); p.lineTo(11, -66); p.lineTo(15, -57); p.lineTo(4, -61); p.closePath(); }, L.stripe);
}

function torsoJoko(ctx: Ctx, L: Look) {
  shape(ctx, (p) => {
    p.moveTo(-13.5, -10); p.lineTo(15, -10); p.lineTo(13, 10);
    p.quadraticCurveTo(0, 15, -13.5, 8); p.closePath();
  }, L.jeans);
  cap(ctx, v(-0.5, -62), v(1, -72), 5.4, 5, L.skin);
  const torso = shape(ctx, (p) => {
    p.moveTo(-12, -64); p.quadraticCurveTo(0, -69, 11.5, -64);
    p.bezierCurveTo(17.5, -52, 18, -28, 15.5, -11); p.lineTo(14.5, -4); p.lineTo(-14, -4);
    p.bezierCurveTo(-16.5, -20, -18, -44, -12, -64); p.closePath();
  }, L.shirt);
  ctx.save();
  ctx.clip(torso);
  ctx.fillStyle = L.stripe;
  ctx.fillRect(-24, -41, 56, 8);
  ctx.fillStyle = 'rgba(0,50,45,0.3)';
  ctx.fillRect(-24, -70, 10.5, 70);
  ctx.fillRect(-24, -8, 56, 6);
  ctx.restore();
  shape(ctx, (p) => { p.moveTo(-5, -67); p.lineTo(10, -66.5); p.lineTo(13.5, -58.5); p.lineTo(4, -61.5); p.closePath(); }, L.stripe);
  ctx.fillStyle = '#17181c';
  ctx.fillRect(-13.8, -5.4, 28.4, 3.4);
}

/** pupils that follow `look`, half-closed lids for the unbothered expression */
function eye(ctx: Ctx, s: TargetState, head: V, c: V, lid: string, ink: string) {
  const lw = { x: s.look.x - head.x, y: s.look.y - head.y };
  const ll = Math.hypot(lw.x, lw.y) || 1;
  if (s.time % 3.6 > 3.47) stroke(ctx, [v(c.x - 2.2, c.y + 0.4), v(c.x + 2.2, c.y + 0.4)], ink, 1.5);
  else {
    circle(ctx, v(c.x + clamp(-lw.x / ll, -1, 1) * 2, c.y + 0.4 + clamp(lw.y / ll, -1, 1) * 1.4), 1.6, ink);
    ctx.fillStyle = lid;
    ctx.beginPath(); ctx.rect(c.x - 5, c.y - 5.4, 10, 3.2 - 1.6 * s.brow); ctx.fill();
  }
}
function koEyes(ctx: Ctx, c: V, ink: string) {
  stroke(ctx, [v(c.x - 2.2, c.y - 2.2), v(c.x + 2.2, c.y + 2.2)], ink, 1.6);
  stroke(ctx, [v(c.x + 2.2, c.y - 2.2), v(c.x - 2.2, c.y + 2.2)], ink, 1.6);
}
function koMouth(ctx: Ctx) {
  shape(ctx, (p) => p.ellipse(12, 12.5, 3, 3.6, 0, 0, Math.PI * 2), '#5a1414');
  shape(ctx, (p) => p.roundRect(11, 13, 4.4, 6.5, 2), '#ef6b7b');
}

function headBejo(ctx: Ctx, L: Look, s: TargetState, head: V, rag: boolean) {
  const face = shape(ctx, headPath, L.skin);
  ctx.save();
  ctx.clip(face);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(-3, -13, 8, 3.2, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  shape(ctx, (p) => {
    p.moveTo(-16.6, -4); p.bezierCurveTo(-18, 5, -14, 9.5, -8, 9.5); p.lineTo(-6.5, 2);
    p.bezierCurveTo(-9, -3, -12, -5.5, -16.6, -4); p.closePath();
  }, L.hair);
  shape(ctx, (p) => {
    p.moveTo(-7.5, 3); p.lineTo(0, 5.5); p.lineTo(14.5, 5.8); p.lineTo(17.5, 7); p.lineTo(16.5, 11);
    p.bezierCurveTo(17, 18, 12, 23.5, 4, 23.5); p.bezierCurveTo(-4, 23.5, -8, 15, -7.5, 3); p.closePath();
  }, L.beard);
  circle(ctx, v(-3.5, 1.5), 3.8, L.skinFar);
  ctx.lineCap = 'round';
  // mouth: calm half-smile, grin when approving, slack when knocked out
  if (rag) koMouth(ctx);
  else if (s.approve > 0.5) {
    shape(ctx, (p) => { p.moveTo(7, 10); p.lineTo(15.5, 9.4); p.quadraticCurveTo(13, 16.5, 7, 10); p.closePath(); }, '#5a1414');
  } else {
    ctx.beginPath(); ctx.moveTo(8.5, 11.2); ctx.quadraticCurveTo(12, 12.6, 15.2, 10);
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#5a1414'; ctx.stroke();
  }
  const lens = v(9.6, -3.2);
  if (s.glasses) circle(ctx, lens, 5.6, 'rgba(255,255,255,0.92)');
  if (rag) koEyes(ctx, lens, L.ink);
  else eye(ctx, s, head, lens, s.glasses ? 'rgba(233,180,139,0.96)' : L.skin, L.ink);
  if (s.glasses) {
    ctx.beginPath(); ctx.arc(lens.x, lens.y, 5.6, 0, Math.PI * 2);
    ctx.lineWidth = 1.7; ctx.strokeStyle = L.ink; ctx.stroke();
    stroke(ctx, [v(4.2, -3.6), v(-4.5, -2.2)], L.ink, 1.7);
    stroke(ctx, [v(15, -3.6), v(17, -3)], L.ink, 1.7);
  }
  stroke(ctx, [v(4.8, -10.6 - 2.4 * s.brow), v(13.4, -11.2 - 3 * s.brow)], '#7c3909', 2.2);
}

function headJoko(ctx: Ctx, L: Look, s: TargetState, head: V, rag: boolean) {
  const face = shape(ctx, headPath, L.skin);
  ctx.save();
  ctx.clip(face);
  ctx.fillStyle = 'rgba(110,55,25,0.2)';
  ctx.beginPath(); ctx.ellipse(1, 16.5, 10, 4.2, -0.15, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // full black hair with a quiff
  const hair = shape(ctx, (p) => {
    p.moveTo(-16.8, 6); p.bezierCurveTo(-22.5, -6, -18.5, -22.5, -3, -23.5);
    p.bezierCurveTo(4, -27.5, 13.5, -26.5, 17, -19); p.bezierCurveTo(15.2, -15.5, 14.8, -12, 15.3, -9.5);
    p.bezierCurveTo(9.5, -14, 3.5, -13, 0, -8); p.lineTo(-1.2, -2.6);
    p.bezierCurveTo(-5.4, -4.6, -8, -1, -8.2, 5); p.bezierCurveTo(-11, 7.6, -14.5, 7.6, -16.8, 6); p.closePath();
  }, L.hair);
  ctx.save();
  ctx.clip(hair);
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath(); ctx.ellipse(4, -21, 9, 2.6, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  circle(ctx, v(-3.4, 1.6), 3.6, L.skinFar);
  ctx.lineCap = 'round';
  // moustache
  shape(ctx, (p) => {
    p.moveTo(11, 6.4); p.quadraticCurveTo(15.5, 4.4, 19.6, 6.6); p.quadraticCurveTo(15.5, 9.4, 11, 8.6); p.closePath();
  }, L.hair);
  if (rag) koMouth(ctx);
  else if (s.approve > 0.5) {
    shape(ctx, (p) => { p.moveTo(9.5, 10.6); p.lineTo(16, 10.2); p.quadraticCurveTo(13.5, 15.6, 9.5, 10.6); p.closePath(); }, '#5a1414');
  } else {
    ctx.beginPath(); ctx.moveTo(10.6, 11.8); ctx.quadraticCurveTo(13.4, 12.8, 15.6, 11);
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#6b2a1c'; ctx.stroke();
  }
  const c = v(10.2, -2.8);
  if (rag) koEyes(ctx, c, L.ink);
  else eye(ctx, s, head, c, L.skin, L.ink);
  stroke(ctx, [v(5.4, -8.8 - 2.4 * s.brow), v(13.8, -8 - 3 * s.brow)], L.hair, 2.8);
}

export function drawTarget(ctx: Ctx, s: TargetState) {
  const J = joints(s);
  const rag = s.mood === 'ragdoll';
  const L = LOOKS[s.kind];
  const k = s.kind === 0 ? 1 : 0.88;
  const [head, neck, hip] = J;
  const shoeAng = rag ? null : s.tilt - 0.5 * s.air;

  armDraw(ctx, L, k, add(neck, v(-2, 0)), J[5], J[6], true, 0);
  leg(ctx, L, k, s.kind, hip, J[9], J[10], true, shoeAng);
  leg(ctx, L, k, s.kind, hip, J[7], J[8], false, shoeAng);

  // torso, rotated with the spine
  ctx.save();
  ctx.translate(hip.x, hip.y);
  ctx.rotate(Math.atan2(neck.y - hip.y, neck.x - hip.x) - Math.atan2(-58, 1.5));
  ctx.scale(-1, 1);
  if (s.kind === 0) torsoBejo(ctx, L);
  else torsoJoko(ctx, L);
  ctx.restore();

  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(Math.atan2(head.y - neck.y, head.x - neck.x) - Math.atan2(-30, -3) + (rag ? 0 : -0.07 - 0.05 * s.approve));
  ctx.scale(-1, 1);
  if (s.kind === 0) headBejo(ctx, L, s, head, rag);
  else headJoko(ctx, L, s, head, rag);
  ctx.restore();

  if (s.hasApple && !rag) drawApple(ctx, pose(s).apple, APPLE_R, s.tilt);

  armDraw(ctx, L, k, neck, J[3], J[4], false, rag ? 0 : s.approve * (1 - s.hold));

  // lodged arrows never show through the floor
  ctx.save();
  ctx.beginPath();
  ctx.rect(head.x - 4000, s.ground - 4000, 8000, 4001.5);
  ctx.clip();
  for (const a of s.stuck) {
    const A = J[a.a];
    const d = sub(J[a.b], A);
    const Ln = len(d) || 1;
    const tip = add(add(A, mul(d, a.u)), mul(v(-d.y / Ln, d.x / Ln), a.w));
    const ang = Math.atan2(d.y, d.x) + a.rel;
    drawArrow(ctx, sub(tip, fromAngle(ang, ARROW_LEN)), ang, { embed: 12 });
  }
  ctx.restore();
}
