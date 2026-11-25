// The red dragon, seen from the side and facing left — toward the archer it has come for. Its rider is an ordinary
// fighter drawn by RagWorld on the saddle; this file is the beast: seamless S-neck-to-tail dragon anatomy,
// biomechanical wingbeat & aerial pendulum kinematics, muscular raptorial forelimbs ("tangan naga") with grasping
// 4-clawed hands, powerful digitigrade hindlegs ("kaki naga") with taloned feet, and 4-fingered bat-dragon wings.
import { Ctx, V, v, clamp } from '../util';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export type DragonState = 'in' | 'fly' | 'inhale' | 'stun' | 'leave' | 'dying';

export interface DragonRig {
  /** points down the neck, from the shoulders to the skull */
  neck: V[];
  head: V;
  /** how far the nose points down (negative: lifted) */
  headTilt: number;
  /** where a fireball leaves it - and where an arrow has to go while it draws breath */
  mouth: V;
  saddle: V;
  /** the middle of the near wing, wherever the beat has it */
  wingMid: V;
  /** vertical torso heave from the wingbeat, in local dragon units */
  heaveY: number;
  /** torso pitch flex from wingbeat & breath, in radians */
  bodyFlex: number;
}

export interface DragonLook {
  /** 0 shut .. 1 gaping */
  jaw: number;
  /** 0..1 fire building in the throat */
  glow: number;
  /** 0..1 flash of a hit */
  flash: number;
  /** current behaviour state for expressive limb & wing poses */
  state?: DragonState;
  /** 0..1 recoil snap immediately after spitting a fireball */
  spit?: number;
}

/**
 * Asymmetric aerodynamic wingbeat cycle:
 * Crisp cambered power downstroke (`down` 0 -> 1) and folded recovery upstroke (`down` 1 -> 0),
 * with figure-8 aerodynamic wrist/tip whip (`whip`).
 */
function wingCycle(phase: number) {
  const wPhase = phase - 0.18 * Math.cos(phase);
  const s = Math.sin(wPhase);
  const c = Math.cos(wPhase);
  const down = 0.5 - 0.5 * s;
  const whip = -c;
  const fold = clamp(0.5 + 0.5 * c, 0, 1) * (1 - down * 0.45);
  return { down, whip, fold };
}

/**
 * The dragon's moving parts in its own frame (scale 1, +y down, nose toward -x).
 * `flap` is the wingbeat phase; `glow` 0..1 is breath being drawn; `spit` 0..1 is fireball release lunge.
 */
export function dragonRig(t: number, flap: number, glow: number, spit = 0): DragonRig {
  const wc = wingCycle(flap);
  // Torso surges upward during the power downstroke and settles during recovery
  const heaveY = Math.cos(flap - 0.38) * 4.8 * (1 - glow * 0.4);
  const bodyFlex = Math.sin(flap - 0.25) * 0.036 - glow * 0.075 + spit * 0.085;

  // Inhale coils the neck high & back; spit snaps the head & neck forward!
  const rear = glow * 16 - spit * 13;
  const lift = glow * 12 - spit * 8;

  // Predator head stabilization: head dampens torso heave so its fierce gaze locks onto the archer
  const hx = -118 + Math.sin(t * 1.35) * 3.5 + rear;
  const hy = -53 + heaveY * 0.32 + Math.sin(t * 1.7 + 0.9) * 3.0 - lift;

  const sh = v(-44, -10 + heaveY);
  const c1 = v(-60 + rear * 0.25, -56 + heaveY * 0.7 - lift * 0.35);
  const c2 = v(-92 + rear * 0.75, -67 + heaveY * 0.45 - lift * 0.75);
  const hd = v(hx, hy);

  const neck: V[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    const m = 1 - u;
    neck.push(
      v(
        m * m * m * sh.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u * u * u * hd.x,
        m * m * m * sh.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u * u * u * hd.y,
      ),
    );
  }

  const headTilt = 0.14 - glow * 0.28 + spit * 0.2 + Math.sin(flap - 0.8) * 0.035 + Math.sin(t * 1.1) * 0.025;
  return {
    neck,
    head: hd,
    headTilt,
    mouth: v(hx - Math.cos(headTilt) * 31.5, hy + Math.sin(headTilt) * 31.5 + 4.5),
    saddle: v(-20, -28 + heaveY),
    wingMid: v(mix(66, 56, wc.down) - wc.fold * 10, mix(-98, 54, wc.down) + heaveY),
    heaveY,
    bodyFlex,
  };
}

/** a point of the dragon's own frame, out in the world */
export const dragonToWorld = (q: V, p: V, s: number, tilt: number): V => {
  const cs = Math.cos(tilt);
  const sn = Math.sin(tilt);
  return v(p.x + (q.x * cs - q.y * sn) * s, p.y + (q.x * sn + q.y * cs) * s);
};

interface DragonColors {
  top: string;
  main: string;
  dark: string;
  deep: string;
  belly: string;
  bellyShade: string;
  wing: string;
  wingMid: string;
  wingEdge: string;
  far: string;
  farDark: string;
  farBone: string;
  bone: string;
  horn: string;
  hornShade: string;
  key: string;
}

/**
 * Computes left & right offset rails along a curved spine `pts` with variable half-widths `hw(u)`
 * and draws a smooth, seamless tapered tube without internal circular joint artifacts!
 */
function buildTubeRails(pts: V[], hwLeft: (u: number) => number, hwRight: (u: number) => number) {
  const n = pts.length;
  const L: V[] = [];
  const R: V[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const u = i / (n - 1);
    const wl = hwLeft(u);
    const wr = hwRight(u);
    L.push(v(pts[i].x + nx * wl, pts[i].y + ny * wl));
    R.push(v(pts[i].x - nx * wr, pts[i].y - ny * wr));
  }
  return { L, R };
}

function traceSmoothRail(ctx: Ctx, pts: V[], moveFirst: boolean) {
  const n = pts.length;
  if (!n) return;
  if (moveFirst) ctx.moveTo(pts[0].x, pts[0].y);
  else ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n - 1; i++) {
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) * 0.5, (pts[i].y + pts[i + 1].y) * 0.5);
  }
  ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
}

/**
 * Draws a sculpted muscular limb segment from `a` (radius `ra`) to `b` (radius `rb`) with bowed muscle belly.
 * When `openRoot = true`, both the gradient and keyline blend seamlessly out of the dragon's flank!
 */
function drawMuscleSeg(
  ctx: Ctx,
  a: V,
  b: V,
  ra: number,
  rb: number,
  bow: number,
  rootCol: string,
  midCol: string,
  shadeCol: string,
  keyCol: string,
  lw: number,
  openRoot = false,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;

  const mx = (a.x + b.x) * 0.5 + nx * bow;
  const my = (a.y + b.y) * 0.5 + ny * bow;
  const rm = (ra + rb) * 0.56;

  const aL = v(a.x + nx * ra, a.y + ny * ra);
  const aR = v(a.x - nx * ra, a.y - ny * ra);
  const mL = v(mx + nx * rm, my + ny * rm);
  const mR = v(mx - nx * rm, my - ny * rm);
  const bL = v(b.x + nx * rb, b.y + ny * rb);
  const bR = v(b.x - nx * rb, b.y - ny * rb);
  const tipCap = v(b.x + ux * rb * 0.92, b.y + uy * rb * 0.92);
  const rootCap = v(a.x - ux * ra * 0.92, a.y - uy * ra * 0.92);

  ctx.beginPath();
  ctx.moveTo(aL.x, aL.y);
  ctx.quadraticCurveTo(mL.x, mL.y, bL.x, bL.y);
  ctx.quadraticCurveTo(tipCap.x, tipCap.y, bR.x, bR.y);
  ctx.quadraticCurveTo(mR.x, mR.y, aR.x, aR.y);
  ctx.quadraticCurveTo(rootCap.x, rootCap.y, aL.x, aL.y);
  ctx.closePath();

  // Longitudinal + cross-muscle shading so the shoulder/haunch matches the body seamlessly at `a`
  const g = openRoot
    ? ctx.createLinearGradient(a.x, a.y - ra * 0.5, b.x, b.y + rb)
    : ctx.createLinearGradient(mL.x, mL.y, mR.x, mR.y);
  g.addColorStop(0, rootCol);
  g.addColorStop(0.55, midCol);
  g.addColorStop(1, shadeCol);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = keyCol;
  ctx.lineWidth = lw;
  if (openRoot) {
    // Skip the top 42% around the shoulder/hip attachment so there is zero seam line against the torso!
    const sL = v(aL.x + (mL.x - aL.x) * 0.42, aL.y + (mL.y - aL.y) * 0.42);
    const sR = v(aR.x + (mR.x - aR.x) * 0.42, aR.y + (mR.y - aR.y) * 0.42);
    ctx.beginPath();
    ctx.moveTo(sL.x, sL.y);
    ctx.quadraticCurveTo(mL.x, mL.y, bL.x, bL.y);
    ctx.quadraticCurveTo(tipCap.x, tipCap.y, bR.x, bR.y);
    ctx.quadraticCurveTo(mR.x, mR.y, sR.x, sR.y);
    ctx.stroke();
  } else {
    ctx.stroke();
  }
}

/**
 * Draws a wickedly curved keratin dragon talon (`root` -> arched blade -> razor `tip`).
 * Positive `hookDown` hooks the claw downward/inward cleanly in local claw coordinates!
 */
function drawCurvedClaw(
  ctx: Ctx,
  root: V,
  ang: number,
  len: number,
  thick: number,
  hook: number,
  hornCol: string,
  shadeCol: string,
  keyCol: string,
) {
  const sgn = hook < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(root.x, root.y);
  ctx.rotate(ang);
  ctx.beginPath();
  // Sickle raptor curve: outer ridge arches out, inner edge hollows cleanly to a razor point at (len, hook)
  ctx.moveTo(0, -sgn * thick * 0.52);
  ctx.quadraticCurveTo(len * 0.52, -sgn * (thick * 0.68 + Math.abs(hook) * 0.12), len, hook);
  ctx.quadraticCurveTo(len * 0.48, sgn * thick * 0.12 + hook * 0.52, 0, sgn * thick * 0.52);
  ctx.closePath();

  const g = ctx.createLinearGradient(0, 0, len, hook);
  g.addColorStop(0, shadeCol);
  g.addColorStop(0.5, hornCol);
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = keyCol;
  ctx.lineWidth = 1.35;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws one articulated Dragon Forelimb ("Tangan Naga"):
 * Muscular Deltoid Shoulder -> Humerus (with elbow spike) -> Plated Forearm -> Grasping Palm & 4 Hooked Claws!
 */
function drawDragonForelimb(
  ctx: Ctx,
  anchor: V,
  flap: number,
  t: number,
  o: DragonLook,
  C: DragonColors,
  far: boolean,
) {
  const phase = flap - (far ? 0.1 : 0.72);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const glow = o.glow;
  const spit = o.spit ?? 0;
  const stun = o.state === 'stun' ? Math.sin(t * 26) * 0.32 : 0;
  const dying = o.state === 'dying' ? 1 : 0;

  // Expressive Dragon Arm Kinematics (facing left -x, +y down):
  // - Flight: humerus sweeps back-and-down (`~1.05 rad`), forearm sweeps forward-and-down (`~2.35 rad`) with
  //   graceful follow-through lag on the wrist & claws!
  // - Inhale (`glow` -> 1): Dragon raises its arms HIGH & FORWARD (`humAng` -> 1.75, `foreAng` -> 2.88) and
  //   spreads all 4 claws wide open toward the archer in an intimidating roar!
  // - Spit (`spit` -> 1): Arms slash downward-back (`humAng` -> 0.82, `foreAng` -> 1.95) in blast recoil!
  const humAng =
    1.06 +
    s * 0.18 +
    glow * 0.68 -
    spit * 0.32 +
    stun -
    dying * 0.55;

  const foreAng =
    2.36 +
    c * 0.22 +
    glow * 0.52 -
    spit * 0.42 -
    stun * 0.75 +
    dying * 0.45;

  const clawSpread = clamp(0.32 + (0.5 + 0.5 * c) * 0.25 + glow * 0.65 + Math.abs(stun) * 0.4, 0.2, 1.15);

  const sc = far ? 0.86 : 1.0;
  const humLen = 19.5 * sc;
  const foreLen = 20.5 * sc;

  const S = anchor;
  const E = v(S.x + Math.cos(humAng) * humLen, S.y + Math.sin(humAng) * humLen);
  const W = v(E.x + Math.cos(foreAng) * foreLen, E.y + Math.sin(foreAng) * foreLen);

  const rootCol = far ? C.far : C.main;
  const midCol = far ? C.far : C.main;
  const botCol = far ? C.farDark : C.dark;
  const hornCol = far ? '#b89f78' : C.horn;
  const hornShade = far ? '#7d6647' : C.hornShade;

  ctx.save();

  // 1. Muscular Deltoid & Upper Arm (`S` -> `E`), seamlessly blended into the pectoral chest!
  drawMuscleSeg(ctx, S, E, 10.2 * sc, 6.2 * sc, -2.4 * sc, rootCol, midCol, botCol, C.key, far ? 2.0 : 2.4, !far);

  // Sharp keratin Elbow Spur (`olecranon`) jutting out from the back of the elbow
  drawCurvedClaw(
    ctx,
    v(E.x + 2.4 * sc, E.y + 0.4 * sc),
    humAng - 1.35,
    8.8 * sc,
    3.4 * sc,
    -2.2 * sc,
    hornCol,
    hornShade,
    C.key,
  );

  // 2. Muscular Scaled Forearm (`E` -> `W`)
  drawMuscleSeg(ctx, E, W, 6.4 * sc, 4.6 * sc, 2.1 * sc, far ? C.far : C.top, midCol, botCol, C.key, far ? 2.0 : 2.3, false);

  // Overlapping golden-edged forearm armor scutes on the near arm
  if (!far) {
    ctx.strokeStyle = C.belly;
    ctx.lineWidth = 1.45;
    for (const q of [0.28, 0.54, 0.78]) {
      const px = mix(E.x, W.x, q) - 1.4;
      const py = mix(E.y, W.y, q) + 0.4;
      ctx.beginPath();
      ctx.arc(px, py, 2.9, 1.9, 3.9);
      ctx.stroke();
    }
  }

  // 3. Grasping Reptilian Dragon Hand (`Manus`) & 4 Wickedly Hooked Talons
  // Inner opposing Dewclaw / Thumb Talon on the lower-inner side of the palm
  const thumbRoot = v(W.x + Math.cos(foreAng - 1.2) * 3.2 * sc, W.y + Math.sin(foreAng - 1.2) * 3.2 * sc);
  drawCurvedClaw(
    ctx,
    thumbRoot,
    foreAng - 0.85 - clawSpread * 0.18,
    8.6 * sc,
    3.0 * sc,
    -3.2 * sc, // Hooks inward/downward!
    hornCol,
    hornShade,
    C.key,
  );

  // 3 Well-Separated Grasping Fingers (lower-outer, long middle finger, upper index finger)
  // Note: around `foreAng ≈ 2.4 rad` (pointing down-left), negative `hook` curves downward/clockwise toward `+y`!
  const fingerSpecs: [number, number, number][] = [
    [-0.44 * clawSpread - 0.1, 6.8, 9.4], // Lower ring/outer finger
    [0.02 * clawSpread, 8.8, 11.8], // Long central dragon finger
    [0.48 * clawSpread + 0.12, 7.6, 10.4], // Upper index finger
  ];

  for (const [angOff, phalLen, clawLen] of fingerSpecs) {
    const fAng = foreAng + angOff - 0.08;
    const kn = v(W.x + Math.cos(fAng) * phalLen * sc, W.y + Math.sin(fAng) * phalLen * sc);

    // Scaly finger bone
    ctx.strokeStyle = C.key;
    ctx.lineWidth = 5.2 * sc;
    ctx.beginPath();
    ctx.moveTo(W.x, W.y);
    ctx.lineTo(kn.x, kn.y);
    ctx.stroke();

    ctx.strokeStyle = midCol;
    ctx.lineWidth = 3.1 * sc;
    ctx.beginPath();
    ctx.moveTo(W.x, W.y);
    ctx.lineTo(kn.x, kn.y);
    ctx.stroke();

    // Downward-hooking ivory talon (`hook < 0` in flipped quadrant curves toward ground/prey!)
    drawCurvedClaw(
      ctx,
      kn,
      fAng - 0.24 - (1 - clawSpread) * 0.25,
      clawLen * sc,
      3.4 * sc,
      -4.2 * sc,
      hornCol,
      hornShade,
      C.key,
    );
  }

  // Armored wrist/knuckle cap
  ctx.fillStyle = midCol;
  ctx.strokeStyle = C.key;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(W.x, W.y, 4.3 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws one articulated Digitigrade Dragon Hindleg ("Kaki Belakang Naga"):
 * Seamless Muscular Haunch/Thigh -> Z-Bent Crus/Shin (with heel spur) -> Armored Tarsus -> 4-Taloned Raptorial Foot!
 */
function drawDragonHindleg(
  ctx: Ctx,
  anchor: V,
  flap: number,
  t: number,
  o: DragonLook,
  C: DragonColors,
  far: boolean,
) {
  const phase = flap - (far ? 0.22 : 0.88);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const glow = o.glow;
  const spit = o.spit ?? 0;
  const stun = o.state === 'stun' ? Math.cos(t * 24) * 0.28 : 0;
  const dying = o.state === 'dying' ? 1 : 0;

  // Digitigrade Z-leg kinematics:
  // Power downstroke sweeps the leg slightly back in aerial thrust; upstroke & inhale draw the knee forward
  // with talons poised to strike!
  const thighAng = 2.16 - s * 0.18 + glow * 0.28 - spit * 0.2 + stun - dying * 0.45;
  const shinAng = 0.86 - c * 0.2 - glow * 0.16 + spit * 0.22 - stun * 0.7 - dying * 0.35;
  const footAng = 2.18 + s * 0.2 + glow * 0.28 - spit * 0.18 + dying * 0.3;
  const talonOpen = clamp(0.36 + (0.5 - 0.5 * c) * 0.26 + glow * 0.55, 0.2, 1.08);

  const sc = far ? 0.86 : 1.0;
  const thighLen = 23.0 * sc;
  const shinLen = 19.5 * sc;
  const footLen = 15.0 * sc;

  const H = anchor;
  const K = v(H.x + Math.cos(thighAng) * thighLen, H.y + Math.sin(thighAng) * thighLen);
  const A = v(K.x + Math.cos(shinAng) * shinLen, K.y + Math.sin(shinAng) * shinLen);
  const F = v(A.x + Math.cos(footAng) * footLen, A.y + Math.sin(footAng) * footLen);

  const rootCol = far ? C.far : C.main;
  const midCol = far ? C.far : C.main;
  const botCol = far ? C.farDark : C.dark;
  const hornCol = far ? '#b89f78' : C.horn;
  const hornShade = far ? '#7d6647' : C.hornShade;

  ctx.save();

  // 1. Massive Muscular Haunch / Thigh (`H` -> `K`), seamlessly growing out of the pelvic flank!
  drawMuscleSeg(ctx, H, K, 14.2 * sc, 7.5 * sc, 3.4 * sc, rootCol, midCol, botCol, C.key, far ? 2.1 : 2.5, !far);

  if (!far) {
    // Warm crimson dorsal thigh highlight & muscle definition arc
    ctx.strokeStyle = C.top;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(H.x - 5, H.y - 1);
    ctx.quadraticCurveTo(mix(H.x, K.x, 0.55) - 5, mix(H.y, K.y, 0.55) - 2, K.x - 2, K.y - 1);
    ctx.stroke();
  }

  // 2. Sinewy Reptilian Crus / Drumstick (`K` -> `A`) with prominent rear Hock Spur
  drawMuscleSeg(ctx, K, A, 7.3 * sc, 4.9 * sc, -2.2 * sc, far ? C.far : C.top, midCol, botCol, C.key, far ? 2.0 : 2.35, false);

  // Rear calcaneal Hock Spur jutting from the high ankle `A`
  drawCurvedClaw(ctx, v(A.x + 2.6 * sc, A.y - 0.6 * sc), -0.18, 8.8 * sc, 3.5 * sc, 2.0 * sc, hornCol, hornShade, C.key);

  // 3. Armored Reptilian Tarsometatarsus / Instep (`A` -> `F`)
  drawMuscleSeg(ctx, A, F, 5.0 * sc, 4.2 * sc, 1.4 * sc, far ? C.far : C.top, midCol, botCol, C.key, far ? 1.9 : 2.25, false);

  if (!far) {
    ctx.strokeStyle = C.belly;
    ctx.lineWidth = 1.55;
    for (const q of [0.28, 0.55, 0.8]) {
      const px = mix(A.x, F.x, q) - 1.6;
      const py = mix(A.y, F.y, q) - 0.5;
      ctx.beginPath();
      ctx.moveTo(px - 1.6, py - 1.0);
      ctx.lineTo(px + 2.4, py + 1.3);
      ctx.stroke();
    }
  }

  // 4. Heavy Raptorial Taloned Foot (`Pes`): Opposing Rear Hallux + 3 Forward Killing Talons
  const halluxRoot = v(F.x + 3.2 * sc, F.y + 0.5 * sc);
  drawCurvedClaw(
    ctx,
    halluxRoot,
    0.82 - talonOpen * 0.22,
    9.4 * sc,
    3.3 * sc,
    3.2 * sc, // Curves inward to oppose the front talons!
    hornCol,
    hornShade,
    C.key,
  );

  const toeSpecs: [number, number, number][] = [
    [-0.38 * talonOpen - 0.08, 6.8, 9.8],
    [0.02 * talonOpen, 9.0, 12.8], // Massive central raptor killing talon
    [0.42 * talonOpen + 0.08, 7.6, 10.8],
  ];

  for (const [angOff, toeLen, clawLen] of toeSpecs) {
    const tAng = footAng + angOff - 0.1;
    const kn = v(F.x + Math.cos(tAng) * toeLen * sc, F.y + Math.sin(tAng) * toeLen * sc);

    ctx.strokeStyle = C.key;
    ctx.lineWidth = 5.6 * sc;
    ctx.beginPath();
    ctx.moveTo(F.x, F.y);
    ctx.lineTo(kn.x, kn.y);
    ctx.stroke();

    ctx.strokeStyle = midCol;
    ctx.lineWidth = 3.4 * sc;
    ctx.beginPath();
    ctx.moveTo(F.x, F.y);
    ctx.lineTo(kn.x, kn.y);
    ctx.stroke();

    drawCurvedClaw(
      ctx,
      kn,
      tAng - 0.3 - (1 - talonOpen) * 0.22,
      clawLen * sc,
      3.8 * sc,
      -4.6 * sc,
      hornCol,
      hornShade,
      C.key,
    );
  }

  // Armored foot knuckle cap
  ctx.fillStyle = midCol;
  ctx.strokeStyle = C.key;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(F.x, F.y, 4.3 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

export function drawDragon(ctx: Ctx, p: V, s: number, tilt: number, t: number, flap: number, o: DragonLook) {
  const spit = o.spit ?? 0;
  const rig = dragonRig(t, flap, o.glow, spit);
  const hv = rig.heaveY;
  const hot = o.flash > 0.3;

  const C: DragonColors = hot
    ? {
        top: '#ffd0c4',
        main: '#ff8e79',
        dark: '#d44b3e',
        deep: '#9e261d',
        belly: '#fff5d6',
        bellyShade: '#f0c978',
        wing: '#eb6c5e',
        wingMid: '#f78d80',
        wingEdge: '#ffb39e',
        far: '#ad372d',
        farDark: '#7d1e17',
        farBone: '#59100c',
        bone: '#8a1a14',
        horn: '#ffffff',
        hornShade: '#ffe4b8',
        key: '#4a0a0c',
      }
    : {
        top: '#f24e38',
        main: '#c41e1b',
        dark: '#820f13',
        deep: '#4f070a',
        belly: '#f5cb73',
        bellyShade: '#b87b28',
        wing: '#9c151a',
        wingMid: '#ba2424',
        wingEdge: '#de3b2b',
        far: '#5c0b10',
        farDark: '#380508',
        farBone: '#2b0406',
        bone: '#45080b',
        horn: '#faecc8',
        hornShade: '#c49d56',
        key: '#1c0405',
      };

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(tilt + rig.bodyFlex * 0.45);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const keyed = (fill: string | CanvasGradient, lw = 2.6) => {
    ctx.strokeStyle = C.key;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  /**
   * Computes & traces one articulated 4-fingered dragon wing for cycle phase `ph`.
   * Features folded upstroke, cambered downstroke, 4 curved bone spars, and scalloped membrane!
   */
  const buildWing = (ph: number) => {
    const { down, whip, fold } = wingCycle(ph);
    const sx = -2;
    const sy = -20 + hv;
    const ex = mix(10, 4, down) - fold * 6;
    const ey = mix(-56, 10, down) + hv - whip * 5;
    const wx = mix(28, 22, down) - fold * 10;
    const wy = mix(-102, 46, down) + hv - whip * 12;

    const lag = whip * 16;
    const f1 = v(mix(96, 82, down) - fold * 16, mix(-138, 100, down) + hv - lag * 1.15);
    const f2 = v(mix(128, 114, down) - fold * 14, mix(-92, 66, down) + hv - lag * 0.95);
    const f3 = v(mix(116, 104, down) - fold * 11, mix(-44, 28, down) + hv - lag * 0.7);
    const f4 = v(mix(84, 78, down) - fold * 7, mix(-18, 8, down) + hv - lag * 0.4);
    const hip = v(40, mix(-12, -3, down) + hv);

    const scallop = (a: V, b: V, pullPt: V, depth: number) => {
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      ctx.quadraticCurveTo(mx + (pullPt.x - mx) * depth, my + (pullPt.y - my) * depth, b.x, b.y);
    };

    const traceMembrane = () => {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(ex - 8, ey, wx, wy);
      ctx.quadraticCurveTo((wx + f1.x) * 0.5 - 6, (wy + f1.y) * 0.5 - 8 * (1 - 2 * down), f1.x, f1.y);
      scallop(f1, f2, v(wx, wy), 0.36);
      scallop(f2, f3, v(wx, wy), 0.36);
      scallop(f3, f4, v(ex, ey), 0.32);
      scallop(f4, hip, v(sx, sy), 0.26);
      ctx.closePath();
    };

    traceMembrane();
    return { sx, sy, ex, ey, wx, wy, f1, f2, f3, f4, hip, down, whip, traceMembrane };
  };

  // ==================== 1. FAR WING & FAR SHADOW LIMBS (3D DEPTH LAYER) ====================
  ctx.save();
  ctx.translate(-15, -6);
  const fw = buildWing(flap - 0.48);
  keyed(C.far, 2.4);
  ctx.strokeStyle = C.farBone;
  for (const [fpt, lw] of [[fw.f1, 2.6], [fw.f2, 2.2], [fw.f3, 1.8]] as [V, number][]) {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(fw.wx, fw.wy);
    ctx.quadraticCurveTo((fw.wx + fpt.x) * 0.5, (fw.wy + fpt.y) * 0.5 - fw.whip * 3, fpt.x, fpt.y);
    ctx.stroke();
  }
  ctx.restore();

  // Far-side Hindleg & Forelimb in deep shadow behind the belly
  drawDragonHindleg(ctx, v(14, 5 + hv), flap, t, o, C, true);
  drawDragonForelimb(ctx, v(-44, 7 + hv), flap, t, o, C, true);

  // ==================== 2. SEAMLESS UNIFIED NECK + TORSO + WHIP TAIL ====================
  const swell = o.glow * 5.2 + Math.sin(flap) * 1.4;
  const tailWave = (lag: number) => Math.sin(flap * 0.5 + t * 2.1 - lag) * (1 + o.glow * 0.35);

  // 2A. Serpentine Tail Spine (`x = 40` inside pelvis -> `x = 176` tail tip)
  const tl = [
    v(36, -2 + hv),
    v(86, 12 + hv * 0.7 + tailWave(0.6) * 7.5),
    v(130, -18 + hv * 0.3 + tailWave(1.5) * 11.5),
    v(176, -4 + tailWave(2.4) * 15.5),
  ];
  const tailPts: V[] = [];
  const T_N = 18;
  for (let i = 0; i <= T_N; i++) {
    const u = i / T_N;
    const m = 1 - u;
    tailPts.push(
      v(
        m * m * m * tl[0].x + 3 * m * m * u * tl[1].x + 3 * m * u * u * tl[2].x + u * u * u * tl[3].x,
        m * m * m * tl[0].y + 3 * m * m * u * tl[1].y + 3 * m * u * u * tl[2].y + u * u * u * tl[3].y,
      ),
    );
  }
  // Note: along +x tail, `nx = -dy, ny = dx` points DOWN (+y = belly), `-n` points UP (-y = dorsal back)!
  const tailRails = buildTubeRails(
    tailPts,
    (u) => mix(16.5, 2.3, Math.pow(u, 0.82)), // Underside belly half-width
    (u) => mix(14.5, 2.2, Math.pow(u, 0.85)), // Dorsal top half-width
  );

  // Dorsal tail spikes (drawn behind tail outline so bases sit cleanly on the spine)
  for (let i = 3; i < T_N - 1; i += 3) {
    const u = i / T_N;
    const dPt = tailRails.R[i];
    const a = tailPts[i - 1];
    const b = tailPts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    const upX = dy / l;
    const upY = -dx / l;
    const spH = mix(8.5, 4.5, u);

    ctx.fillStyle = C.horn;
    ctx.strokeStyle = C.key;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(dPt.x - ux * 3.8 - upX * 1.2, dPt.y - uy * 3.8 - upY * 1.2);
    ctx.lineTo(dPt.x + upX * spH + ux * 2.6, dPt.y + upY * spH + uy * 2.6);
    ctx.lineTo(dPt.x + ux * 3.8 - upX * 1.2, dPt.y + uy * 3.8 - upY * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Paint smooth tapered Tail Ribbon (open root inside pelvis so there is ZERO pelvis-tail seam!)
  const traceTailPoly = () => {
    ctx.beginPath();
    traceSmoothRail(ctx, tailRails.R, true);
    ctx.lineTo(tailRails.L[T_N].x, tailRails.L[T_N].y);
    traceSmoothRail(ctx, [...tailRails.L].reverse(), false);
    ctx.closePath();
  };

  traceTailPoly();
  const tailGrad = ctx.createLinearGradient(0, -24 + hv, 0, 22 + hv);
  tailGrad.addColorStop(0, C.top);
  tailGrad.addColorStop(0.5, C.main);
  tailGrad.addColorStop(1, C.dark);
  ctx.fillStyle = tailGrad;
  ctx.fill();

  // Golden underside scute band clipped cleanly inside the tail
  ctx.save();
  traceTailPoly();
  ctx.clip();
  const tailBellyPts = tailPts.map((pt, i) => {
    const bPt = tailRails.L[i];
    return v(mix(pt.x, bPt.x, 0.52), mix(pt.y, bPt.y, 0.52));
  });
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  traceSmoothRail(ctx, tailBellyPts, true);
  traceSmoothRail(ctx, [...tailRails.L].reverse(), false);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Outer tail keyline starting smoothly from `i = 2` (outside pelvis)
  ctx.strokeStyle = C.key;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  traceSmoothRail(ctx, tailRails.R.slice(2), true);
  ctx.lineTo(tailRails.L[T_N].x, tailRails.L[T_N].y);
  traceSmoothRail(ctx, tailRails.L.slice(2).reverse(), false);
  ctx.stroke();

  // Wicked barbed tail spade blade at the tip
  const te = tailPts[T_N];
  const tb = tailPts[T_N - 1];
  const ta = Math.atan2(te.y - tb.y, te.x - tb.x);
  ctx.save();
  ctx.translate(te.x, te.y);
  ctx.rotate(ta);
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.quadraticCurveTo(3, -13, 12, -13);
  ctx.quadraticCurveTo(16, -5, 28, 0);
  ctx.quadraticCurveTo(16, 5, 12, 13);
  ctx.quadraticCurveTo(3, 13, -5, 0);
  ctx.closePath();
  const tbg = ctx.createLinearGradient(-4, 0, 26, 0);
  tbg.addColorStop(0, C.dark);
  tbg.addColorStop(0.65, C.main);
  tbg.addColorStop(1, C.horn);
  keyed(tbg, 2.2);
  ctx.restore();

  // 2B. Dorsal Spine Spikes along the back
  for (const [sx, sy, sh] of [[10, -23, 9.5], [22, -19, 8.5], [34, -15, 7.5]] as [number, number, number][]) {
    ctx.fillStyle = C.horn;
    ctx.strokeStyle = C.key;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy + hv + 2);
    ctx.lineTo(sx + 3, sy + hv - sh);
    ctx.lineTo(sx + 5, sy + hv + 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 2C. Sculpted Muscular Torso (open rear transition into tail!)
  const pTopRear = tailRails.R[2];
  const pBotRear = tailRails.L[2];
  const traceTorso = () => {
    ctx.beginPath();
    ctx.moveTo(-54, -9 + hv);
    ctx.bezierCurveTo(-46, -31 + hv, -8, -31 + hv, pTopRear.x, pTopRear.y);
    ctx.lineTo(pBotRear.x, pBotRear.y);
    ctx.bezierCurveTo(28, 22 + hv, -10, 31 + hv + swell, -44, 26 + hv + swell * 0.8);
    ctx.quadraticCurveTo(-58, 17 + hv + swell * 0.3, -54, -9 + hv);
    ctx.closePath();
  };

  traceTorso();
  const tg = ctx.createLinearGradient(0, -31 + hv, 0, 32 + hv);
  tg.addColorStop(0, C.top);
  tg.addColorStop(0.45, C.main);
  tg.addColorStop(1, C.dark);
  ctx.fillStyle = tg;
  ctx.fill();

  ctx.save();
  traceTorso();
  ctx.clip();

  // Dorsal scale sheen
  ctx.fillStyle = C.top;
  ctx.beginPath();
  ctx.ellipse(-8, -24 + hv, 54, 12, 0.06, 0, Math.PI * 2);
  ctx.fill();

  // Continuous golden-amber armored belly scutes
  const bg = ctx.createLinearGradient(0, 12 + hv, 0, 34 + hv + swell);
  bg.addColorStop(0, C.belly);
  bg.addColorStop(1, C.bellyShade);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-58, 6 + hv);
  ctx.bezierCurveTo(-34, 16 + hv + swell * 0.6, 12, 16 + hv + swell * 0.3, pBotRear.x + 4, pBotRear.y - 5);
  ctx.lineTo(pBotRear.x + 4, 38 + hv + swell);
  ctx.lineTo(-58, 38 + hv + swell);
  ctx.closePath();
  ctx.fill();

  // Overlapping belly plate seams
  ctx.strokeStyle = 'rgba(95, 50, 8, 0.56)';
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  ctx.moveTo(-56, 8 + hv);
  ctx.bezierCurveTo(-32, 16.5 + hv + swell * 0.6, 12, 16.5 + hv + swell * 0.3, pBotRear.x + 2, pBotRear.y - 5);
  for (let x = -44; x <= 34; x += 11) {
    ctx.moveTo(x, 12 + hv);
    ctx.quadraticCurveTo(x + 2, 22 + hv + swell * 0.5, x + 5, 34 + hv + swell);
  }
  ctx.stroke();

  // Internal magma furnace glow radiating between chest plates when inhaling fire!
  if (o.glow > 0.04) {
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(-28, 8 + hv, 2, -28, 8 + hv, 38);
    fg.addColorStop(0, `rgba(255, 210, 80, ${0.52 * o.glow})`);
    fg.addColorStop(0.55, `rgba(255, 95, 15, ${0.26 * o.glow})`);
    fg.addColorStop(1, 'rgba(255, 50, 0, 0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(-28, 8 + hv, 38, 0, Math.PI * 2);
    ctx.fill();
  }

  // Clean single Saddle Girth Strap behind the near shoulder (`x ≈ -18`)
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#26150b';
  ctx.lineWidth = 4.8;
  ctx.beginPath();
  ctx.moveTo(-19, -28 + hv);
  ctx.quadraticCurveTo(-16, 2 + hv, -13, 29 + hv + swell * 0.5);
  ctx.stroke();
  ctx.strokeStyle = '#6e4526';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#26150b';
  ctx.lineWidth = 1.1;
  ctx.fillRect(-18.5, 4 + hv, 4.8, 5.6);
  ctx.strokeRect(-18.5, 4 + hv, 4.8, 5.6);

  ctx.restore();

  // 2D. Seamless Tapered Serpentine S-Neck Ribbon (`N[0]` merges invisibly into the chest — NO black loop!)
  const N = rig.neck;
  // Along N (`dx < 0, dy < 0`): `L` (`+nx, +ny`) is UP-RIGHT (Dorsal Nape), `R` (`-nx, -ny`) is DOWN-LEFT (Throat Underside)!
  const neckRails = buildTubeRails(
    N,
    (u) => mix(15.5, 8.2, u), // L = Dorsal top/nape half-width
    (u) => mix(16.8, 8.2, u), // R = Throat underside half-width
  );

  // Dorsal neck spines along `neckRails.L` (top of the neck!) drawn behind neck outline
  for (let i = 2; i < N.length - 1; i += 2) {
    const u = i / (N.length - 1);
    const dPt = neckRails.L[i];
    const a = N[i - 1];
    const b = N[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    const upX = -dy / l;
    const upY = dx / l;
    const spH = mix(10.5, 6.8, u);

    ctx.fillStyle = i % 4 === 2 ? C.horn : C.dark;
    ctx.strokeStyle = C.key;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(dPt.x + ux * 4.5 - upX * 1.2, dPt.y + uy * 4.5 - upY * 1.2);
    ctx.lineTo(dPt.x + upX * spH - ux * 3.5, dPt.y + upY * spH - uy * 3.5);
    ctx.lineTo(dPt.x - ux * 4.5 - upX * 1.2, dPt.y - uy * 4.5 - upY * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  const traceNeckPoly = () => {
    const rDorsal = v(neckRails.L[0].x + 10, neckRails.L[0].y + 4);
    const rThroat = v(neckRails.R[0].x + 12, neckRails.R[0].y + 18);
    ctx.beginPath();
    ctx.moveTo(rDorsal.x, rDorsal.y);
    traceSmoothRail(ctx, neckRails.L, false);
    ctx.lineTo(neckRails.R[N.length - 1].x, neckRails.R[N.length - 1].y);
    traceSmoothRail(ctx, [...neckRails.R].reverse(), false);
    ctx.lineTo(rThroat.x, rThroat.y);
    ctx.closePath();
  };

  traceNeckPoly();
  const ng = ctx.createLinearGradient(-95, -62, -55, 8 + hv);
  ng.addColorStop(0, C.top);
  ng.addColorStop(0.55, C.main);
  ng.addColorStop(1, C.main);
  ctx.fillStyle = ng;
  ctx.fill();

  // Continuous Golden Throat Scute Band along `neckRails.R` (underside of neck -> chest belly!)
  ctx.save();
  traceNeckPoly();
  ctx.clip();

  const throatInPts = N.map((pt, i) => {
    const tPt = neckRails.R[i];
    return v(mix(pt.x, tPt.x, 0.44), mix(pt.y, tPt.y, 0.44));
  });
  const tbg2 = ctx.createLinearGradient(-85, -35, -48, 22 + hv);
  tbg2.addColorStop(0, C.belly);
  tbg2.addColorStop(1, C.bellyShade);
  ctx.fillStyle = tbg2;
  ctx.beginPath();
  ctx.moveTo(throatInPts[0].x + 6, throatInPts[0].y + 24);
  ctx.quadraticCurveTo(throatInPts[0].x + 2, throatInPts[0].y + 10, throatInPts[0].x, throatInPts[0].y);
  traceSmoothRail(ctx, throatInPts.slice(1), false);
  ctx.lineTo(neckRails.R[N.length - 1].x, neckRails.R[N.length - 1].y);
  traceSmoothRail(ctx, [...neckRails.R].reverse(), false);
  ctx.lineTo(neckRails.R[0].x + 10, neckRails.R[0].y + 24);
  ctx.closePath();
  ctx.fill();

  // Overlapping horizontal throat plate creases along the underside
  ctx.strokeStyle = 'rgba(95, 50, 8, 0.52)';
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  traceSmoothRail(ctx, throatInPts, true);
  for (let i = 1; i < N.length - 1; i += 2) {
    ctx.moveTo(throatInPts[i].x, throatInPts[i].y);
    ctx.lineTo(neckRails.R[i].x, neckRails.R[i].y);
  }
  ctx.stroke();
  ctx.restore();

  // Unified Outer Keyline: Dorsal Back + Belly + Neck Sides (100% seamless from jaw -> chest -> belly -> tail!)
  ctx.strokeStyle = C.key;
  ctx.lineWidth = 2.85;
  ctx.beginPath();
  // Dorsal nape rail into upper back & pelvis
  traceSmoothRail(ctx, [...neckRails.L].reverse(), true);
  ctx.bezierCurveTo(-24, -30 + hv, 4, -27.5 + hv, pTopRear.x, pTopRear.y);
  // Underside jaw/throat rail smoothly into front chest & plated belly
  ctx.moveTo(neckRails.R[N.length - 1].x, neckRails.R[N.length - 1].y);
  traceSmoothRail(ctx, [...neckRails.R].reverse(), false);
  ctx.quadraticCurveTo(-55, 19 + hv + swell * 0.4, -44, 26 + hv + swell * 0.8);
  ctx.bezierCurveTo(-10, 31 + hv + swell, 28, 22 + hv, pBotRear.x, pBotRear.y);
  ctx.stroke();

  // Rising molten fire travelling up the throat during inhale
  if (o.glow > 0.03) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 2; i < N.length; i++) {
      const u = i / (N.length - 1);
      const pulse = clamp((o.glow * 1.35 - (1 - u) * 0.45) * 1.2, 0, 1);
      if (pulse <= 0.01) continue;
      const rad = 16 + pulse * 8;
      const g = ctx.createRadialGradient(N[i].x, N[i].y, 1, N[i].x, N[i].y, rad);
      g.addColorStop(0, `rgba(255, 220, 95, ${0.58 * pulse})`);
      g.addColorStop(0.5, `rgba(255, 105, 20, ${0.32 * pulse})`);
      g.addColorStop(1, 'rgba(255, 60, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(N[i].x, N[i].y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ==================== 3. NEAR-SIDE MUSCULAR HINDLEG & FORELIMB ("KAKI & TANGAN NAGA") ====================
  // Drawn OVER the unified torso flank so thighs & deltoid shoulders blend cleanly with full clarity!
  drawDragonHindleg(ctx, v(25, 5 + hv), flap, t, o, C, false);
  drawDragonForelimb(ctx, v(-35, 8 + hv + swell * 0.2), flap, t, o, C, false);

  // ==================== 4. FIERCE SCULPTED DRAGON HEAD, HORNS & BLAZING JAWS ====================
  ctx.save();
  ctx.translate(rig.head.x, rig.head.y);
  ctx.scale(-1, 1);
  ctx.rotate(rig.headTilt);

  // Primary swept-back regal dragon horn
  ctx.beginPath();
  ctx.moveTo(-6, -12);
  ctx.quadraticCurveTo(-24, -19, -42, -30);
  ctx.quadraticCurveTo(-23, -12, -11, -5);
  ctx.closePath();
  const hg = ctx.createLinearGradient(-8, -8, -40, -29);
  hg.addColorStop(0, C.hornShade);
  hg.addColorStop(0.55, C.horn);
  hg.addColorStop(1, '#ffffff');
  keyed(hg, 2.1);

  // Secondary lower temple horn
  ctx.beginPath();
  ctx.moveTo(-10, -5);
  ctx.quadraticCurveTo(-23, -6, -34, -12);
  ctx.quadraticCurveTo(-21, 0, -11, 1.5);
  ctx.closePath();
  keyed(C.horn, 1.9);

  // Armored crimson jaw-frill fin
  ctx.beginPath();
  ctx.moveTo(-8, 2.5);
  ctx.lineTo(-25, 11);
  ctx.lineTo(-19, 14.5);
  ctx.lineTo(-6, 10.5);
  ctx.closePath();
  keyed(C.dark, 2.0);

  // Hinged Lower Jaw
  const jawAng = (o.jaw + 0.045 * (0.5 + 0.5 * Math.sin(t * 2.6))) * 0.64;
  ctx.save();
  ctx.translate(1, 4.2);
  ctx.rotate(jawAng);
  ctx.beginPath();
  ctx.moveTo(-7, -0.5);
  ctx.lineTo(29.5, 0.8);
  ctx.lineTo(27.5, 5.5);
  ctx.quadraticCurveTo(14, 8.8, -1, 8.2);
  ctx.lineTo(-8.5, 4.0);
  ctx.closePath();
  keyed(C.dark, 2.2);

  // Chin barb spike
  ctx.fillStyle = C.horn;
  ctx.strokeStyle = C.key;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(21, 6.2);
  ctx.lineTo(24.5, 11.2);
  ctx.lineTo(26.8, 5.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sharp lower fangs
  ctx.fillStyle = C.horn;
  for (const [fx, fh] of [[9, 4.2], [15.5, 4.8], [22.5, 5.4]] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(fx - 1.9, 1.0);
    ctx.lineTo(fx + 0.4, -fh);
    ctx.lineTo(fx + 1.9, 1.0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Molten fireball core glowing inside the open jaws
  if ((o.glow > 0.03 || spit > 0.05) && jawAng > 0.06) {
    const pwr = Math.max(o.glow, spit * 0.8);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const mg = ctx.createRadialGradient(17, 6, 1, 17, 6, 25);
    mg.addColorStop(0, `rgba(255, 252, 220, ${0.96 * pwr})`);
    mg.addColorStop(0.42, `rgba(255, 155, 30, ${0.72 * pwr})`);
    mg.addColorStop(1, 'rgba(255, 55, 0, 0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(17, 6, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Sculpted Upper Skull, Heavy Brow & Snout Bridge
  ctx.beginPath();
  ctx.moveTo(-13.5, -9.2);
  ctx.lineTo(2.5, -14.6);
  ctx.lineTo(13.5, -9.8);
  ctx.lineTo(25.0, -8.0);
  ctx.lineTo(34.0, -3.8);
  ctx.lineTo(32.8, 2.8);
  ctx.quadraticCurveTo(18, 4.8, 4, 4.6);
  ctx.lineTo(-9, 6.2);
  ctx.lineTo(-15.5, 0);
  ctx.closePath();
  keyed(C.main, 2.4);

  // Snout tip nasal horn
  ctx.beginPath();
  ctx.moveTo(29.5, -6.2);
  ctx.lineTo(34.8, -11.4);
  ctx.lineTo(33.6, -4.0);
  ctx.closePath();
  keyed(C.horn, 1.5);

  // Dorsal snout highlight ridge
  ctx.fillStyle = C.top;
  ctx.beginPath();
  ctx.moveTo(-10, -9);
  ctx.lineTo(2.5, -13.4);
  ctx.lineTo(13.5, -9.0);
  ctx.lineTo(25, -7.2);
  ctx.lineTo(31.5, -3.6);
  ctx.lineTo(20, -3.6);
  ctx.lineTo(4, -6.2);
  ctx.closePath();
  ctx.fill();

  // Upper maxillary fangs
  ctx.fillStyle = C.horn;
  for (const [fx, fh] of [[11, 4.6], [17.5, 5.4], [24, 4.8], [29.2, 5.8]] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(fx - 2.0, 2.6);
    ctx.lineTo(fx + 0.3, 2.6 + fh);
    ctx.lineTo(fx + 2.0, 2.6);
    ctx.closePath();
    ctx.fill();
  }

  // Blazing Reptile Eye under Armored Brow + Flaring Nostril
  ctx.fillStyle = o.glow > 0.2 ? '#fff494' : '#ffe14d';
  ctx.beginPath();
  ctx.ellipse(7.8, -5.5, 3.9, 2.5, 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a0405';
  ctx.beginPath();
  ctx.ellipse(8.5, -5.3, mix(1.05, 0.65, o.glow), 2.3, 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.dark;
  ctx.beginPath();
  ctx.moveTo(1.0, -9.8);
  ctx.lineTo(13.6, -5.3);
  ctx.lineTo(12.6, -9.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = o.glow > 0.25 ? '#ff942e' : C.key;
  ctx.beginPath();
  ctx.ellipse(28.5, -3.6, 2.0, 1.15, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // ==================== 5. ROYAL DRAGON WAR-SADDLE ====================
  ctx.beginPath();
  ctx.moveTo(-37, -29 + hv);
  ctx.quadraticCurveTo(-32, -36 + hv, -27, -30 + hv);
  ctx.quadraticCurveTo(-18, -26 + hv, -8, -32 + hv);
  ctx.lineTo(-4, -28 + hv);
  ctx.lineTo(-7, -19 + hv);
  ctx.lineTo(-34, -18 + hv);
  ctx.closePath();
  keyed('#3d2516', 2.0);
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-33, -21.5 + hv);
  ctx.quadraticCurveTo(-19, -20 + hv, -8, -22 + hv);
  ctx.stroke();

  // ==================== 6. NEAR ARTICULATED 4-FINGERED BAT-DRAGON WING ====================
  const nw = buildWing(flap);
  const wg = ctx.createLinearGradient(nw.wx, nw.wy, nw.f2.x, nw.f2.y);
  wg.addColorStop(0, C.wing);
  wg.addColorStop(0.55, C.wingMid);
  wg.addColorStop(1, C.wingEdge);
  keyed(wg, 2.6);

  // Subtle translucent inner-web highlights between wing fingers
  ctx.save();
  nw.traceMembrane();
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 130, 95, 0.16)';
  for (const [pa, pb] of [
    [nw.f1, nw.f2],
    [nw.f2, nw.f3],
    [nw.f3, nw.f4],
  ] as [V, V][]) {
    ctx.beginPath();
    ctx.moveTo(nw.wx, nw.wy);
    ctx.lineTo(mix(nw.wx, pa.x, 0.92), mix(nw.wy, pa.y, 0.92));
    ctx.lineTo(mix(nw.wx, pb.x, 0.92), mix(nw.wy, pb.y, 0.92));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Wing finger bone spars radiating from the wrist
  ctx.strokeStyle = C.bone;
  for (const [fpt, lw] of [
    [nw.f1, 3.8],
    [nw.f2, 3.1],
    [nw.f3, 2.6],
    [nw.f4, 2.1],
  ] as [V, number][]) {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(nw.wx, nw.wy);
    ctx.quadraticCurveTo((nw.wx + fpt.x) * 0.5, (nw.wy + fpt.y) * 0.5 - nw.whip * 4, fpt.x, fpt.y);
    ctx.stroke();
  }

  // Muscular Wing-Arm (Shoulder -> Elbow -> Wrist)
  ctx.strokeStyle = C.key;
  ctx.lineWidth = 10.8;
  ctx.beginPath();
  ctx.moveTo(nw.sx, nw.sy);
  ctx.quadraticCurveTo(nw.ex - 8, nw.ey, nw.wx, nw.wy);
  ctx.stroke();

  ctx.strokeStyle = C.main;
  ctx.lineWidth = 7.0;
  ctx.beginPath();
  ctx.moveTo(nw.sx, nw.sy);
  ctx.quadraticCurveTo(nw.ex - 8, nw.ey, nw.wx, nw.wy);
  ctx.stroke();

  ctx.strokeStyle = C.top;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(nw.sx - 1, nw.sy - 1);
  ctx.quadraticCurveTo(nw.ex - 9, nw.ey - 1, nw.wx - 1, nw.wy);
  ctx.stroke();

  // Curved Alula Wing-Thumb Claw at the wrist joint
  drawCurvedClaw(
    ctx,
    v(nw.wx - 1, nw.wy),
    Math.PI + (0.45 - nw.down * 0.85),
    12.0,
    3.8,
    -3.4,
    C.horn,
    C.hornShade,
    C.key,
  );

  ctx.restore();
}
