import {
  Ctx, V, v, add, sub, mul, len, dist, lerpV, clamp, damp, fromAngle, rot, ik, segDist,
  cap, capShade, circle, shape, stroke, headPath, groundShadow,
} from './util';
import { ARROW_LEN, drawArrow } from './gear';
import { Box } from './target';

export type ZPart = 'head' | 'heart' | 'torso' | 'armU' | 'armL' | 'thigh' | 'shin' | 'shield' | 'helmet';
export interface ZHit { part: ZPart; a: number; b: number }

interface StuckArrow { a: number; b: number; u: number; w: number; rel: number }
type Hinge = [number, number, number, number];
interface ZRag { p: V[]; o: V[]; len: number[]; acc: number; hinges: Hinge[] }

export interface LooseProp {
  kind: 'helmet' | 'shield' | 'crown';
  p: V;
  vel: V;
  rot: number;
  vr: number;
}

export interface ZombieState {
  x: number;
  gy: number; // current standing surface y
  ground: number; // main floor y for ragdoll
  ph: number;
  walk: number; // 0.2 = swaying on podium, 1 = shambling run
  sp: number;
  kb: number;
  sway: number;
  alive: boolean;
  deadT: number;
  scale: number;
  dip: number;
  dipV: number;
  hurtTilt: number;
  hurtV: number;
  crippled: boolean;
  hasHelmet: boolean;
  hasShield: boolean;
  shieldHp: number;
  isBoss?: boolean;
  hp: number;
  maxHp: number;
  variant: number; // 0, 1, 2 visual variations
  stuck: StuckArrow[];
  rag: ZRag | null;
  boxes: Box[];
}

// 11 joints: 0 head, 1 neck, 2 hip, 3 near elbow, 4 near hand, 5 far elbow, 6 far hand,
//            7 near knee, 8 near foot, 9 far knee, 10 far foot
const STICKS: [number, number][] = [
  [0, 1], [1, 2], [1, 3], [3, 4], [1, 5], [5, 6], [2, 7], [7, 8], [2, 9], [9, 10],
];
const RADIUS = [15, 12, 13, 6, 5, 6, 5, 8.5, 6.5, 8.5, 6.5];
const INV_M = [0.95, 0.45, 0.38, 1.4, 2.0, 1.4, 2.0, 0.85, 1.25, 0.85, 1.25];
const STRUTS: [number, number, number][] = [
  [0, 2, 0.84], [1, 7, 0.6], [1, 9, 0.6], [2, 8, 0.35], [2, 10, 0.35], [1, 4, 0.28], [1, 6, 0.28],
];
const HINGES: Hinge[] = [[2, 7, 8, -1], [2, 9, 10, -1], [1, 3, 4, 1], [1, 5, 6, 1]];

const Z_LOOKS = [
  {
    skin: '#8fb573', skinFar: '#6f9457', bruise: '#5a7a44',
    shirt: '#4b5563', shirtFar: '#374151', tear: '#1f2937',
    pants: '#3d342c', pantsFar: '#2c251f', shoe: '#25221e',
    blood: '#dc2626', core: '#ef4444',
  },
  {
    skin: '#7da87b', skinFar: '#5e875c', bruise: '#486b47',
    shirt: '#5c4033', shirtFar: '#432e24', tear: '#271c15',
    pants: '#2e3b4e', pantsFar: '#202937', shoe: '#1e2024',
    blood: '#e11d48', core: '#f43f5e',
  },
  {
    skin: '#95b885', skinFar: '#749665', bruise: '#58754b',
    shirt: '#3f3f46', shirtFar: '#27272a', tear: '#18181b',
    pants: '#42332b', pantsFar: '#2f241e', shoe: '#1c1917',
    blood: '#dc2626', core: '#fb7185',
  },
];

export function makeZombie(
  x: number,
  gy: number,
  ground: number,
  walk: number,
  sp = 0,
  opts?: { helmet?: boolean; shield?: boolean; boxes?: Box[]; scale?: number; isBoss?: boolean; hp?: number; variant?: number },
): ZombieState {
  const hp = opts?.hp ?? 1;
  return {
    x,
    gy,
    ground,
    ph: Math.random() * 6.28,
    walk,
    sp,
    kb: 0,
    sway: 0,
    alive: true,
    deadT: 0,
    scale: opts?.scale ?? 1,
    dip: 0,
    dipV: 0,
    hurtTilt: 0,
    hurtV: 0,
    crippled: false,
    hasHelmet: !!opts?.helmet,
    hasShield: !!opts?.shield,
    shieldHp: opts?.shield ? 2 : 0,
    isBoss: opts?.isBoss,
    hp,
    maxHp: hp,
    variant: opts?.variant ?? Math.floor(Math.random() * 3),
    stuck: [],
    rag: null,
    boxes: opts?.boxes ?? [],
  };
}

/** Kinematic pose for an alive zombie facing left (towards the archer) */
export function poseZombie(z: ZombieState): { J: V[]; heart: V; shieldA: V; shieldB: V } {
  const sc = z.scale;
  const bx = z.x + z.sway;
  const gy = z.gy;
  const w = z.walk;
  const limp = z.crippled ? 1.45 : 1;
  const bob = Math.abs(Math.sin(z.ph)) * 5 * w * limp + clamp(z.dip, -12, 32);
  // Zombie hunches forward (-x is left/forward, +x is right/back in world space)
  // In local space (+x = forward/left), lean > 0 tilts forward toward the archer
  const hunch = 0.22 * w + 0.06 * Math.sin(z.ph * 1.5) + (z.crippled ? 0.12 : 0) - z.hurtTilt;

  const W = (p: V) => v(bx - p.x * sc, gy + p.y * sc);

  const hip = v(-4, -80 + bob);
  const neck = add(hip, rot(v(10, -54), hunch));
  const headNod = 0.12 * Math.sin(z.ph * 2.1) - z.hurtTilt * 0.6;
  const head = add(neck, rot(v(8, -28), hunch * 0.7 + headNod));

  // Pulsing vital heart on the zombie's upper chest
  const heartLocal = lerpV(hip, neck, 0.64);
  const heart = W(add(heartLocal, v(7, 2)));

  // Outstretched zombie arms reaching towards the archer (+x in local space)
  const reachWave = Math.sin(z.ph * 1.7) * 9;
  const handN = z.hasShield
    ? add(neck, v(34, 18 + reachWave * 0.3))
    : add(neck, v(46 + Math.cos(z.ph * 1.3) * 6, 4 + reachWave));
  const handF = add(neck, v(42 - Math.sin(z.ph * 1.3) * 6, -4 - reachWave * 0.8));

  const armN = ik(neck, handN, 29, 27.5, 1);
  const armF = ik(add(neck, v(-2, 1)), handF, 29, 27.5, 1);

  // Shambling legs: one steps, the other drags
  const stride = 22 * w;
  const s1 = Math.sin(z.ph);
  const s2 = Math.sin(z.ph + Math.PI);
  const lift1 = Math.max(0, Math.cos(z.ph)) * 13 * w;
  const lift2 = Math.max(0, Math.cos(z.ph + Math.PI)) * (z.crippled ? 4 : 11) * w;

  const footN = v(s1 * stride + (w < 0.5 ? -7 : 0), -6 - lift1);
  const footF = v(s2 * stride + (w < 0.5 ? 7 : -3), -6 - lift2);
  const legN = ik(hip, footN, 39, 37, -1);
  const legF = ik(hip, footF, 39, 37, -1);

  const J = [head, neck, hip, armN.mid, armN.end, armF.mid, armF.end, legN.mid, footN, legF.mid, footF].map(W);
  const shC = J[4];
  const shieldA = v(shC.x - 4 * sc, shC.y - 30 * sc);
  const shieldB = v(shC.x - 4 * sc, shC.y + 30 * sc);
  return { J, heart, shieldA, shieldB };
}

export const zombieJoints = (z: ZombieState): V[] => (z.rag ? z.rag.p : poseZombie(z).J);
export const zombieHeadPos = (z: ZombieState): V => zombieJoints(z)[0];
export const zombieHeartPos = (z: ZombieState): V => (z.rag ? lerpV(z.rag.p[2], z.rag.p[1], 0.64) : poseZombie(z).heart);

/** Hit test against shield, helmet, vital points (head & heart), and limbs */
export function hitTestZombie(z: ZombieState, p: V): ZHit | null {
  if (!z.alive || z.rag) return null;
  const sc = z.scale;
  const { J, heart, shieldA, shieldB } = poseZombie(z);
  const inCap = (a: number, b: number, r: number) => segDist(p, J[a], J[b]).d < r * sc;

  // 1. Check shield first if carried
  if (z.hasShield && segDist(p, shieldA, shieldB).d < 11 * sc) {
    return { part: 'shield', a: 3, b: 4 };
  }

  // 2. Check Head (or Helmet on upper/front cranium)
  if (dist(p, J[0]) < 18.5 * sc) {
    if (z.hasHelmet && p.y < J[0].y + 8 * sc) {
      return { part: 'helmet', a: 1, b: 0 };
    }
    return { part: 'head', a: 1, b: 0 };
  }

  // 3. Check pulsing Vital Heart Core on chest
  if (dist(p, heart) < 13.5 * sc) {
    return { part: 'heart', a: 2, b: 1 };
  }

  // 4. Arms, torso, legs
  if (inCap(3, 4, 6.5)) return { part: 'armL', a: 3, b: 4 };
  if (inCap(1, 3, 8)) return { part: 'armU', a: 1, b: 3 };
  if (inCap(1, 2, 15.5)) return { part: 'torso', a: 2, b: 1 };
  if (inCap(2, 7, 11)) return { part: 'thigh', a: 2, b: 7 };
  if (inCap(2, 9, 11)) return { part: 'thigh', a: 2, b: 9 };
  if (inCap(7, 8, 8.5)) return { part: 'shin', a: 7, b: 8 };
  if (inCap(9, 10, 8.5)) return { part: 'shin', a: 9, b: 10 };
  return null;
}

/** Lodges an arrow into bone a->b so it rides with the zombie's animation and ragdoll */
export function lodgeArrowInZombie(z: ZombieState, a: number, b: number, tip: V, ang: number) {
  const J = zombieJoints(z);
  const A = J[a];
  const B = J[b];
  const d = sub(B, A);
  const L = len(d) || 1;
  const rel = sub(tip, A);
  const u = clamp((rel.x * d.x + rel.y * d.y) / (L * L), -0.2, 1.2);
  const w = clamp((d.x * rel.y - d.y * rel.x) / L, -18, 18);
  z.stuck.push({ a, b, u, w, rel: ang - Math.atan2(d.y, d.x) });
  if (z.stuck.length > 7) z.stuck.shift();
}

/** Converts the zombie into a full 11-joint Verlet ragdoll and transfers impact momentum */
export function ragdollZombie(z: ZombieState, hit: ZHit, tip: V, ang: number, vel: V): ZRag {
  const J = poseZombie(z).J.map((p) => ({ ...p }));
  const bodyVel = v(-z.sp * 0.4 + z.kb * 0.3, 0);
  const hinges = HINGES.filter(([a, m, e, sign]) => {
    const d1 = sub(J[m], J[a]);
    const d2 = sub(J[e], J[m]);
    return (d1.x * d2.y - d1.y * d2.x) * sign >= 0;
  });
  const r: ZRag = {
    p: J,
    o: J.map((p) => v(p.x - bodyVel.x / 120, p.y - bodyVel.y / 120)),
    len: STICKS.map(([a, b]) => dist(J[a], J[b])),
    acc: 0,
    hinges,
  };
  z.rag = r;
  z.alive = false;
  z.deadT = 0;

  lodgeArrowInZombie(z, hit.a, hit.b, add(tip, fromAngle(ang, 10)), ang);

  // Dramatic ragdoll impulse: headshots whip the head & upper spine backward; heart shots blast the chest back
  const gain = hit.part === 'head' ? 0.46 : hit.part === 'heart' ? 0.38 : 0.28;
  const lift = hit.part === 'head' ? -155 : -130;
  const push = (i: number, k: number) => {
    r.o[i] = sub(r.o[i], mul(add(mul(vel, gain), v(0, lift)), k / 120));
  };
  push(hit.a, 0.75);
  push(hit.b, 1.05);
  if (hit.part === 'head') {
    push(0, 0.55); // extra head whip
    push(1, 0.35);
    push(3, 0.25);
    push(5, 0.25);
  } else {
    push(1, 0.5);
    push(2, 0.45);
  }
  for (let i = 0; i < r.p.length; i++) push(i, 0.06);
  return r;
}

function boneLen(r: ZRag, a: number, b: number) {
  const i = STICKS.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return i >= 0 ? r.len[i] : 0;
}

function stepZombieRag(r: ZRag, G: number, boxes: Box[], sc: number) {
  const n = r.p.length;
  const before: number[] = [];
  const grav = 1480;
  for (let i = 0; i < n; i++) {
    const vx = (r.p[i].x - r.o[i].x) * 0.996;
    const vy = (r.p[i].y - r.o[i].y) * 0.996;
    before[i] = vy;
    r.o[i] = { ...r.p[i] };
    r.p[i] = v(r.p[i].x + vx, r.p[i].y + vy + grav / (120 * 120));
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
        const straight = add(r.p[m], mul(d1, len(d2) / (len(d1) || 1)));
        const c = mul(sub(straight, r.p[e]), 0.5);
        const we = INV_M[e] / (INV_M[e] + INV_M[m]);
        r.p[e] = add(r.p[e], mul(c, we));
        r.p[m] = sub(r.p[m], mul(c, 1 - we));
      }
    }
    for (let i = 0; i < n; i++) {
      const rad = RADIUS[i] * sc;
      const p = r.p[i];
      for (const b of boxes) {
        if (p.x > b.l - rad * 0.5 && p.x < b.r + rad * 0.5 && p.y > b.top - rad) {
          if (r.o[i].y <= b.top - rad + 4 || p.y - (b.top - rad) < 15) {
            p.y = b.top - rad;
            onBox[i] = b;
          } else {
            p.x = p.x < (b.l + b.r) / 2 ? b.l - rad * 0.5 : b.r + rad * 0.5;
          }
        }
      }
      if (p.y > G - rad) p.y = G - rad;
    }
  }
  for (let i = 0; i < n; i++) {
    const rad = RADIUS[i] * sc;
    const b = onBox[i];
    const onFloor = r.p[i].y >= G - rad - 0.01;
    const resting = onFloor || (b !== null && r.p[i].y >= b.top - rad - 0.01);
    if (resting) {
      const fr = i === 8 || i === 10 ? 0.58 : 0.78;
      r.o[i].x = r.p[i].x - (r.p[i].x - r.o[i].x) * fr;
      if (before[i] > 1.1) r.o[i].y = r.p[i].y + before[i] * (onFloor || !b ? 0.3 : b.bounce);
    }
  }
}

export function updateZombie(z: ZombieState, dt: number, canAdvance: boolean) {
  const rate = z.walk > 0.5 ? (z.crippled ? 4.4 : 6.8) : 1.7;
  z.ph += dt * rate;
  z.dipV += (-380 * z.dip - 26 * z.dipV) * dt;
  z.dip += z.dipV * dt;
  z.hurtV += (-180 * z.hurtTilt - 18 * z.hurtV) * dt;
  z.hurtTilt += z.hurtV * dt;

  if (!z.alive) {
    z.deadT += dt;
    if (z.rag) {
      z.rag.acc += dt;
      let guard = 0;
      while (z.rag.acc >= 1 / 120 && guard++ < 6) {
        stepZombieRag(z.rag, z.ground, z.boxes, z.scale);
        z.rag.acc -= 1 / 120;
      }
    }
    return;
  }

  if (z.walk <= 0.35) {
    z.sway = 6.5 * Math.sin(z.ph * 0.95);
  } else if (canAdvance) {
    const effSp = z.sp * (z.crippled ? 0.52 : 1);
    // Shambling lurch: faster during the step push, slower between steps
    const lurch = 0.75 + 0.45 * Math.abs(Math.sin(z.ph));
    z.x += (z.kb - effSp * lurch) * dt;
    z.kb = damp(z.kb, 0, 5.5, dt);
  }
}

/* ---- Rendering the Articulated Zombie ----------------------------------------- */

function drawZLeg(ctx: Ctx, L: (typeof Z_LOOKS)[number], sc: number, hip: V, knee: V, foot: V, far: boolean, rag: boolean) {
  const col = far ? L.pantsFar : L.pants;
  cap(ctx, hip, knee, 11.2 * sc, 8.8 * sc, col);
  cap(ctx, knee, foot, 8.6 * sc, 6.6 * sc, far ? L.skinFar : L.skin);
  // Tattered pant cuff at knee
  const mid = lerpV(knee, foot, 0.38);
  cap(ctx, knee, mid, 9.2 * sc, 8.2 * sc, col);
  if (!far) {
    capShade(ctx, hip, knee, 11.2 * sc, 8.8 * sc, 0.2);
    capShade(ctx, knee, foot, 8.6 * sc, 6.6 * sc, 0.18);
  }
  ctx.save();
  ctx.translate(foot.x, foot.y);
  ctx.rotate(rag ? Math.atan2(foot.y - knee.y, foot.x - knee.x) - Math.PI / 2 : 0);
  shape(
    ctx,
    (p) => {
      p.moveTo(8 * sc, -4 * sc);
      p.lineTo(-6 * sc, -4.5 * sc);
      p.quadraticCurveTo(-18 * sc, -1 * sc, -19 * sc, 6.8 * sc);
      p.lineTo(8.5 * sc, 6.8 * sc);
      p.closePath();
    },
    L.shoe,
  );
  ctx.restore();
}

function drawZArm(ctx: Ctx, L: (typeof Z_LOOKS)[number], sc: number, sh: V, el: V, hand: V, far: boolean) {
  const skin = far ? L.skinFar : L.skin;
  cap(ctx, sh, el, 7.4 * sc, 6 * sc, skin);
  cap(ctx, el, hand, 6 * sc, 4.8 * sc, skin);
  if (!far) {
    capShade(ctx, sh, el, 7.4 * sc, 6 * sc, 0.18);
    capShade(ctx, el, hand, 6 * sc, 4.8 * sc, 0.18);
  }
  const sleeve = lerpV(sh, el, 0.55);
  cap(ctx, sh, sleeve, 8.8 * sc, 7.6 * sc, far ? L.shirtFar : L.shirt);
  circle(ctx, hand, 5.4 * sc, skin);
  // Zombie claw fingers
  if (!far) {
    stroke(ctx, [hand, add(hand, v(-6 * sc, 2 * sc))], L.bruise, 2.2 * sc);
    stroke(ctx, [hand, add(hand, v(-5 * sc, 5 * sc))], L.bruise, 2 * sc);
  }
}

export function drawHelmetProp(ctx: Ctx, c: V, rotAng: number, sc = 1) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(rotAng);
  ctx.scale(sc, sc);
  // Iron bucket/pot helmet with rivets
  shape(
    ctx,
    (p) => {
      p.arc(0, -2, 19.5, Math.PI * 0.96, Math.PI * 2.04);
      p.lineTo(21, 4);
      p.lineTo(-21, 4);
      p.closePath();
    },
    '#64748b',
  );
  shape(ctx, (p) => p.roundRect(-22, 1, 44, 5.5, 2.5), '#475569');
  circle(ctx, v(-6, -10), 2.2, '#cbd5e1');
  circle(ctx, v(5, -11), 2.2, '#cbd5e1');
  stroke(ctx, [v(-12, -8), v(-4, -14)], 'rgba(255,255,255,0.55)', 2.5);
  ctx.restore();
}

export function drawShieldProp(ctx: Ctx, c: V, rotAng: number, sc = 1, damaged = false) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(rotAng);
  ctx.scale(sc, sc);
  shape(ctx, (p) => p.roundRect(-6, -30, 12, 60, 4), '#8a5a2e');
  shape(ctx, (p) => p.roundRect(-7, -30, 4, 60, 2), '#b47b44');
  // Iron rim bands & boss
  ctx.fillStyle = '#475569';
  ctx.fillRect(-7, -24, 14, 5);
  ctx.fillRect(-7, 19, 14, 5);
  circle(ctx, v(-6, 0), 7, '#64748b');
  circle(ctx, v(-6, 0), 3, '#cbd5e1');
  if (damaged) {
    stroke(ctx, [v(-5, -16), v(2, -4), v(-4, 8)], '#271c15', 2.4);
  }
  ctx.restore();
}

export function drawZombieFull(ctx: Ctx, z: ZombieState, lt: number) {
  const J = zombieJoints(z);
  const rag = !z.alive || !!z.rag;
  const L = Z_LOOKS[z.variant % Z_LOOKS.length];
  const sc = z.scale;
  const [head, neck, hip] = J;

  // Ground shadow under hip
  const lift = clamp((z.ground - 80 - hip.y) / 380, 0, 0.75);
  groundShadow(ctx, hip.x, z.ground, 54 * sc * (1 - lift * 0.5), 0.13 * (1 - lift));

  // Far arm & legs
  drawZArm(ctx, L, sc, add(neck, v(2 * sc, 0)), J[5], J[6], true);
  drawZLeg(ctx, L, sc, hip, J[9], J[10], true, rag);
  drawZLeg(ctx, L, sc, hip, J[7], J[8], false, rag);

  // Torso rotated with spine
  ctx.save();
  ctx.translate(hip.x, hip.y);
  ctx.rotate(Math.atan2(neck.y - hip.y, neck.x - hip.x) - Math.atan2(-54, -10));
  ctx.scale(-sc, sc);
  // Pelvis
  shape(
    ctx,
    (p) => {
      p.moveTo(-13, -9);
      p.lineTo(15, -9);
      p.lineTo(13, 9);
      p.quadraticCurveTo(0, 14, -13, 8);
      p.closePath();
    },
    L.pants,
  );
  // Neck column
  cap(ctx, v(0, -56), v(1, -66), 5.5, 5, L.skin);
  // Tattered zombie shirt/jacket
  const torso = shape(
    ctx,
    (p) => {
      p.moveTo(-12, -58);
      p.quadraticCurveTo(0, -63, 12, -58);
      p.bezierCurveTo(18, -46, 18, -24, 15, -6);
      p.lineTo(9, -2);
      p.lineTo(4, -11);
      p.lineTo(-2, -3);
      p.lineTo(-9, -10);
      p.lineTo(-14, -3);
      p.bezierCurveTo(-16, -20, -17, -42, -12, -58);
      p.closePath();
    },
     z.isBoss ? '#3b0764' : L.shirt,
  );
  ctx.save();
  ctx.clip(torso);
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.fillRect(-22, -64, 10, 64);
  // Exposed ribs / tear on chest
  ctx.fillStyle = L.tear;
  ctx.beginPath();
  ctx.ellipse(6, -35, 9, 12, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  for (const ry of [-41, -36, -31]) {
    ctx.beginPath();
    ctx.moveTo(1, ry);
    ctx.lineTo(11, ry + 1);
    ctx.stroke();
  }
  ctx.restore();

  // Pulsing Vital Heart Core on chest (glows when alive!)
  if (!rag) {
    const pulse = 1 + 0.22 * Math.sin(lt * 9 + z.ph);
    ctx.globalAlpha = 0.32;
    circle(ctx, v(6.5, -35), 9.5 * pulse, L.core);
    ctx.globalAlpha = 1;
    circle(ctx, v(6.5, -35), 5.2 * pulse, L.blood);
    circle(ctx, v(5.2, -36.5), 2, '#fecdd3');
  } else {
    circle(ctx, v(6.5, -35), 4.2, '#450a0a');
  }
  ctx.restore();

  // Head rotated with neck->head bone
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(Math.atan2(head.y - neck.y, head.x - neck.x) - Math.atan2(-28, -8));
  ctx.scale(-sc, sc);
  const face = shape(ctx, headPath, L.skin);
  ctx.save();
  ctx.clip(face);
  // Exposed cranium/bruise patch
  ctx.fillStyle = L.bruise;
  ctx.beginPath();
  ctx.ellipse(-4, -13, 9, 6, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fda4af';
  ctx.beginPath();
  ctx.ellipse(-5, -14, 5.5, 3.2, -0.25, 0, Math.PI * 2);
  ctx.fill();
  // Dark eye socket shadow
  ctx.fillStyle = 'rgba(20,30,15,0.35)';
  ctx.beginPath();
  ctx.ellipse(9.8, -3, 6.2, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Stitch scar on cheek
  stroke(ctx, [v(-4, 4), v(3, 8)], '#3f4f33', 1.5);
  for (const sx of [-2.5, -0.2, 2]) stroke(ctx, [v(sx, 3.8 + (sx + 3) * 0.5), v(sx - 1, 6.8 + (sx + 3) * 0.5)], '#3f4f33', 1.2);

  // Ear
  circle(ctx, v(-3.5, 1.5), 3.4, L.skinFar);

  // Eyes & Mouth
  if (rag) {
    // Knocked-out X eyes and hanging tongue
    const c = v(9.8, -3);
    stroke(ctx, [v(c.x - 2.6, c.y - 2.6), v(c.x + 2.6, c.y + 2.6)], '#1f2937', 1.8);
    stroke(ctx, [v(c.x + 2.6, c.y - 2.6), v(c.x - 2.6, c.y + 2.6)], '#1f2937', 1.8);
    shape(ctx, (p) => p.ellipse(11.5, 11.5, 4.2, 3.8, 0, 0, Math.PI * 2), '#3b1d1d');
    shape(ctx, (p) => p.roundRect(10.5, 12, 4.6, 7.5, 2.2), '#fb7185');
  } else {
    // Wild glowing zombie eye
    circle(ctx, v(9.8, -3), 4.6, '#fef08a');
    circle(ctx, v(11.1, -3), 2.1, z.isBoss ? '#a855f7' : '#dc2626');
    stroke(ctx, [v(4.8, -9.8), v(14.2, -7.2)], '#2d3b22', 2.4);
    // Snarling open mouth with teeth
    shape(ctx, (p) => p.ellipse(11.2, 10.5, 5.8, 3.6, 0.1, 0, Math.PI * 2), '#3b1d1d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(8.2, 7.4, 2.2, 2.4);
    ctx.fillRect(11.4, 7.6, 2.2, 2.6);
    ctx.fillRect(9.6, 11.6, 2.2, 2.2);
  }

  // Boss crown or bucket helmet
  if (z.isBoss) {
    shape(
      ctx,
      (p) => {
        p.moveTo(-14, -14);
        p.lineTo(-10, -28);
        p.lineTo(-3, -19);
        p.lineTo(3, -30);
        p.lineTo(9, -19);
        p.lineTo(15, -27);
        p.lineTo(16, -13);
        p.closePath();
      },
      '#fbbf24',
    );
    circle(ctx, v(3, -21), 3.5, '#a855f7');
  } else if (z.hasHelmet) {
    drawHelmetProp(ctx, v(0, -10), -0.08, 1);
  }
  ctx.restore();

  // Near arm
  drawZArm(ctx, L, sc, neck, J[3], J[4], false);

  // Shield on near hand if carried
  if (z.hasShield && !rag) {
    drawShieldProp(ctx, v(J[4].x - 4 * sc, J[4].y), 0.06 * Math.sin(z.ph * 2), sc, z.shieldHp === 1);
  }

  // Boss HP bar if boss
  if (z.isBoss && z.alive && z.maxHp > 1) {
    const bw = 66;
    const bx = head.x - bw / 2;
    const by = head.y - 46 * sc;
    ctx.fillStyle = 'rgba(17,24,39,0.25)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw * clamp(z.hp / z.maxHp, 0, 1), 8, 4);
    ctx.fill();
  }

  // Lodged arrows riding with the zombie's bones (clipped above floor)
  ctx.save();
  ctx.beginPath();
  ctx.rect(head.x - 4000, z.ground - 4000, 8000, 4001.5);
  ctx.clip();
  for (const a of z.stuck) {
    const A = J[a.a];
    const d = sub(J[a.b], A);
    const Ln = len(d) || 1;
    const tip = add(add(A, mul(d, a.u)), mul(v(-d.y / Ln, d.x / Ln), a.w));
    const ang = Math.atan2(d.y, d.x) + a.rel;
    drawArrow(ctx, sub(tip, fromAngle(ang, ARROW_LEN)), ang, { embed: 12 });
  }
  ctx.restore();
}
