// Active-ragdoll stickman, grown out of the verlet ragdoll in ../archerRag (same joints, same sticks, same
// punch). It is ALWAYS simulated. While alive, soft "muscles" pull every joint toward a pose, so the body
// lags, sways, recoils and staggers for real; when it dies the muscles let go and the same body crumples.
//
// What makes him feel alive lives in the pose: he breathes (deeper after effort, panting when wounded),
// shifts his weight, blinks and looks around, leans and anchors through the draw, flinches and clutches a
// wound, hunches when he is nearly done - and when a blow takes his balance he windmills on the edge,
// drops to a knee, or lands on his back half off the ground and hauls himself up again.
import { Ctx, V, v, add, sub, mul, len, dist, lerp, lerpV, fromAngle, ik, clamp, damp } from '../util';
import { RAG_STICKS } from '../archerRag';

// joints: 0 head, 1 neck, 2 hip, 3 bow elbow, 4 bow hand, 5 draw elbow, 6 draw hand,
//         7 back knee, 8 back ankle, 9 front knee, 10 front ankle
export const HEAD_R = 11;
const NECK = 14;
const TORSO = 36;
const UARM = 18;
const FARM = 18;
const THIGH = 23;
const SHIN = 23;
const BONE = [NECK, TORSO, THIGH, SHIN, THIGH, SHIN, UARM, FARM, UARM, FARM];
const INV_M = [0.85, 0.45, 0.4, 1.3, 1.7, 1.3, 1.7, 0.9, 1.2, 0.9, 1.2];
const JRAD = [11, 4, 5, 3, 3, 3, 3, 3.5, 3, 3.5, 3];
/** how hard each joint is pulled to its pose, per 120 Hz step, at full muscle */
const STIFF = [0.045, 0.08, 0.11, 0.05, 0.2, 0.06, 0.2, 0.1, 0.55, 0.1, 0.55];
/** how much of that pull turns into velocity (1 = springy wobble, 0 = glued) */
const BOUNCE = [0.86, 0.76, 0.7, 0.55, 0.32, 0.55, 0.32, 0.5, 0, 0.5, 0];
/** knocked down: only the seat and the feet still hold on; everything above flops */
const LYING = [0.02, 0.03, 0.95, 0.02, 0.02, 0.02, 0.02, 0.35, 0.85, 0.35, 0.85];
const STRUTS: [number, number, number][] = [
  [0, 2, 0.86 * (NECK + TORSO)], [1, 7, 0.62 * (TORSO + THIGH)], [1, 9, 0.62 * (TORSO + THIGH)],
  [2, 8, 0.36 * (THIGH + SHIN)], [2, 10, 0.36 * (THIGH + SHIN)],
];
const HINGES: [number, number, number, number][] = [[2, 7, 8, -1], [2, 9, 10, -1], [1, 3, 4, 1], [1, 5, 6, 1]];
const G = 1400;
const H = 1 / 120;
/** string distance from the grip: at rest, and extra at full draw (full draw puts the hand under the jaw) */
const BRACE = 11;
const DRAW = 21.5;

export const angWrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const angLerp = (a: number, b: number, t: number) => a + angWrap(b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export interface Slab2 { x0: number; x1: number; top: number; bot: number }
export type React = 'none' | 'teeter' | 'down' | 'knee';
/** archer with a bow, the axe-throwing boss, or the tied-up prisoner */
export type Role = 'archer' | 'thrower' | 'hostage';

export interface Stick {
  p: V[]; o: V[]; L: number[];
  s: number; face: number;
  alive: boolean; muscle: number; base: V; kneel: boolean; role: Role;
  /** the prisoner once his rope is cut: 0 bound .. 1 jumping for joy */
  happy: number;
  /** intended aim (world angle), draw 0..1, arrow readiness 0..1 (1 = hand on the string), idle→aim blend */
  aim: number; pull: number; nock: number; aiming: number;
  /** where the bow really points right now - read from the two hands */
  bowAng: number; hasBow: boolean; t: number; seed: number;
  /** life signs */
  breath: number; exert: number; vigor: number;
  look: V; lookAt: V | null; blink: number; lid: number;
  /** pain: flinch 0..1, which way the blow travelled, where it landed, and the hand that goes to it */
  hurt: number; hurtDir: number; wound: { stick: number; u: number } | null; clutch: number;
  /** losing and finding his balance again: which way, how far along, how long it takes */
  react: React; rt: number; rdur: number;
  /** what is left of the muscles after death: he crumples before he goes slack */
  fade: number;
  ribbon: V[] | null; ribbonO: V[] | null;
  /** shield bearer only: 0..1 how far he is braced behind a shield held out in front of him */
  guard?: number;
  /** proud charismatic freestyle celebration timer (seconds > 0 when celebrating a win) & chosen style (0, 1, 2) */
  victory?: number;
  victoryStyle?: number;
}

/** at rest the bow is carried tipped up; a man behind a shield holds it upright and close, hidden by the board */
const idleAng = (k: Stick) => { const up = 0.55 * (1 - (k.guard ?? 0)); return k.face > 0 ? -up : Math.PI + up; };
const handAngle = (k: Stick) => angLerp(idleAng(k), k.aim, k.aiming);
/** true while the string hand is actually on the string */
export const onString = (k: Stick) => !(k.victory && k.victory > 0) && k.nock >= 1 && k.clutch < 0.3 && k.react !== 'down' && k.react !== 'teeter';

/** knock him off balance; he will find his feet again after `dur` seconds */
export function startReact(k: Stick, kind: React, dur: number) {
  k.react = kind; k.rt = 0; k.rdur = dur; k.pull = 0;
}

/** two-bone IK whose middle joint drifts toward a preferred side - continuously, so it never pops over */
function ikToward(root: V, target: V, l1: number, l2: number, pref: V, max = 1) {
  const th = Math.atan2(target.y - root.y, target.x - root.x);
  const bend = clamp((-Math.sin(th) * pref.x + Math.cos(th) * pref.y) * 3, -max, max);
  return ik(root, target, l1, l2, bend).mid;
}

export function woundPoint(k: Stick): V | null {
  if (!k.wound) return null;
  const [a, b] = RAG_STICKS[k.wound.stick];
  return lerpV(k.p[a], k.p[b], k.wound.stick === 0 ? 0.85 : k.wound.u);
}

/** the pose the muscles are reaching for */
export function poseTargets(k: Stick): V[] {
  const f = k.face; const s = k.s; const B = k.base;
  const am = k.aiming; const pull = k.pull; const calm = 1 - am;
  const dying = k.alive ? 0 : 1;
  const hurt = k.hurt; const low = 1 - k.vigor;
  const br = Math.sin(k.breath);                       // +1 = lungs full
  const depth = 1.3 + 1.7 * k.exert + 1.0 * low;       // how big the breath is
  const steady = 1 - 0.8 * am;                         // a drawn bow is held still: the breath barely moves it
  const shift = Math.sin(k.t * 0.55 + k.seed) * 1.9 * calm; // idle weight shift from foot to foot
  const back = hurt * -k.hurtDir * f;                  // >0: knocked backwards, <0: shoved forwards
  const push = k.hurtDir * hurt;                       // world x of the shove

  // balance lost and found
  const ru = k.react === 'none' ? 0 : clamp(k.rt / k.rdur, 0, 1);
  const side = -k.hurtDir * f >= 0 ? 1 : -1;           // +1: thrown backwards, -1: pitched forwards
  const teeter = k.react === 'teeter' ? Math.sin(Math.PI * Math.pow(ru, 0.75)) : 0;
  const kneeDrop = k.react === 'knee' ? smooth(0, 0.13, ru) * (1 - smooth(0.6, 1, ru)) : 0;
  const up = k.react === 'down' ? smooth(0.45, 1, ru) : 1; // 0 = sat on the ground, 1 = back on his feet
  const sit = 1 - up;
  const heave = k.react === 'down' ? Math.sin(Math.PI * up) : 0; // bowed over, one hand down, pushing up
  const buckle = hurt * 5 + low * 2.2 * calm + dying * 17 + heave * 9;

  // Boss thrower dynamic coil & lunge factors
  const isThrower = k.role === 'thrower';
  const wind = isThrower ? smooth(0, 1, pull) : 0;
  const swing = isThrower && k.nock < 1 ? Math.sin(Math.PI * Math.min(1, k.nock * 1.95)) : 0;
  const lunge = isThrower && k.nock < 1 ? smooth(0, 0.14, k.nock) * (1 - smooth(0.42, 0.88, k.nock)) : 0;

  // legs: standing and kneeling are two poses he can slide between (a hit in the leg drops him to a knee)
  const kb = k.kneel ? 1 : kneeDrop;
  const wide = k.role === 'hostage' ? 6 + 6 * k.happy : 15 + 3 * pull * am + (isThrower ? 3 * wind : 0);
  const throwerHipX = isThrower ? (-7.5 * wind + 11.5 * lunge) * f * s : 0;
  const throwerHipY = isThrower ? (3.5 * wind + 4.5 * lunge) * s : 0;
  const hipS = v(
    B.x - (2 + pull * 5 * am - shift) * f * s + throwerHipX + push * 5 * s - teeter * side * f * 7 * s,
    B.y - (43 - pull * 3 * am - buckle) * s + throwerHipY - br * depth * 0.45 * steady * s
  );
  const hipK = v(B.x - (3 - shift * 0.4) * f * s + push * 3 * s, B.y - (27 - buckle * 0.45 - (k.kneel ? kneeDrop * 6 : 0)) * s - br * depth * 0.3 * steady * s);
  let hip = lerpV(hipS, hipK, kb);
  let ankB = lerpV(v(B.x - wide * f * s, B.y - 3 * s), v(B.x - 31 * f * s, B.y - 3 * s), kb);
  let ankF = lerpV(v(B.x + wide * f * s, B.y - 3 * s), v(B.x + 13 * f * s, B.y - 3 * s), kb);
  // braced behind a shield: feet planted wider, knees bent, his weight sunk in behind the board
  const guard = k.alive ? clamp(k.guard ?? 0, 0, 1) * (1 - kb) : 0;
  if (guard > 0) {
    hip = add(hip, v(-2 * f * s * guard, 4.5 * s * guard));
    ankB = add(ankB, v(-4 * f * s * guard, 0)); ankF = add(ankF, v(3 * f * s * guard, 0));
  }
  if (isThrower && kb < 0.5) {
    // Boss coils back onto his rear leg, lifting his front foot before stomping forward on the throw!
    const liftF = Math.pow(wind, 1.4) * (k.nock >= 1 ? 1 : 0);
    ankF = add(ankF, v((-4 * liftF + 8.5 * lunge) * f * s, -8.5 * liftF * s));
    ankB = add(ankB, v(-2.5 * wind * f * s, 0));
  }
  if (kb < 0.5) {
    // a stagger step: the foot on the side he is shoved to lifts and replants a little further out
    const step = v(push * 7 * s, -Math.max(0, hurt - 0.7) * 16 * s);
    if (back > 0) ankB = add(ankB, step); else if (back < 0) ankF = add(ankF, step);
    // teetering on the edge: the far foot comes right off the ground
    if (teeter > 0) {
      if (side > 0) ankF = add(ankF, v(f * 8 * s * teeter, -15 * s * teeter));
      else ankB = add(ankB, v(-f * 8 * s * teeter, -15 * s * teeter));
    }
  }
  if (sit > 0) {
    // sat down hard, legs out in front, the rest of him hanging over the edge
    const far = v(B.x + side * f * 19 * s, B.y - 3 * s); const near = v(B.x + side * f * 8 * s, B.y - 3 * s);
    hip = lerpV(hip, v(B.x - side * f * 11 * s, B.y - 7 * s), sit);
    ankF = lerpV(ankF, side > 0 ? far : near, sit);
    ankB = lerpV(ankB, side > 0 ? near : far, sit);
  }
  if (k.happy > 0) {
    // free! he hops on the spot
    const jump = Math.abs(Math.sin(k.t * 7.5)) * 13 * s * k.happy;
    hip = add(hip, v(0, -jump)); ankB = add(ankB, v(0, -jump)); ankF = add(ankF, v(0, -jump));
  }
  const kneeF = ik(hip, ankF, THIGH * s, SHIN * s, -f).mid;
  let kneeB = lerpV(ik(hip, ankB, THIGH * s, SHIN * s, -f * 0.6).mid, v(B.x - 9 * f * s, B.y - 4 * s), kb);
  if (sit > 0) kneeB = lerpV(kneeB, ik(hip, ankB, THIGH * s, SHIN * s, -f).mid, sit);

  const dir = fromAngle(k.aim);
  const elev = Math.atan2(-dir.y, dir.x * f);
  // lean: back into the draw, a tired hunch at rest, thrown by a hit, way out over the edge when teetering
  let lean = am * (0.08 + 0.15 * pull + clamp(elev, -0.6, 1.2) * 0.22) - calm * (0.04 + low * 0.24) + back * 0.3 - br * 0.018 * calm - dying * 0.5
    + teeter * side * (0.62 + Math.sin(k.t * 13) * 0.1) - heave * 0.75 - kneeDrop * 0.3;
  // the boss thrower coils deep backward to wind up and whips violently forward on the hurl
  if (isThrower) lean += 0.44 * wind - 0.64 * swing;
  if (k.role === 'hostage') lean += Math.sin(k.t * 6.3) * 0.05 * (1 - k.happy);
  lean -= guard * calm * 0.13; // hunched forward in behind the shield
  lean = lerp(lean, side * 1.25, sit);
  const neck = add(hip, v(-Math.sin(lean) * f * TORSO * s, -Math.cos(lean) * TORSO * s));
  // head: tips toward the string at anchor, droops when worn out, snaps with a blow (boss keeps eyes locked forward during wind-up)
  const tilt = am * (0.12 + 0.1 * pull) + (isThrower ? 0.28 * wind - 0.32 * swing : 0) + calm * (0.05 + low * 0.42) - back * 0.7 + dying * 0.8 + Math.sin(k.t * 0.37 + k.seed * 2) * 0.05 * calm
    + teeter * side * 0.5 + heave * 0.3 + sit * 0.2;
  const ha = lean - tilt;
  const head = add(neck, v(-Math.sin(ha) * f * NECK * s, -Math.cos(ha) * NECK * s));

  const hd = handAngle(k); const d = fromAngle(hd);
  const idleHand = add(neck, v((17 + shift * 0.4) * f * s, (23 - br * depth * 0.55) * s));
  const aimHand = add(neck, mul(dir, 33.5 * s));
  let bowHand = lerpV(idleHand, aimHand, am);
  // behind a shield both hands come in close to the chest: the bow stands upright, out of sight behind the board
  if (guard > 0) bowHand = lerpV(bowHand, add(neck, v(9 * f * s, 16 * s)), guard * calm);
  bowHand = add(bowHand, v(push * 4 * s, (hurt * 7 + dying * 14 + heave * 10) * s)); // the bow arm sags with the pain
  // the string hand: rock steady on the string, all the way back to the jaw
  const rest = sub(bowHand, mul(d, (BRACE + DRAW * pull) * s));
  let drawHand = rest;
  if (k.nock < 1) {
    // release: the hand opens and swings back and down past the hip, takes an arrow from the hip quiver,
    // and brings it up to the string - the arm never has to fold up over the shoulder
    const follow = add(neck, add(mul(d, -19 * s), v(0, 10 * s)));
    const quiver = add(hip, v(-10 * f * s, -5 * s));
    const q = k.nock;
    drawHand = q < 0.2 ? lerpV(rest, follow, smooth(0, 0.2, q))
      : q < 0.55 ? lerpV(follow, quiver, smooth(0.2, 0.55, q))
        : lerpV(quiver, rest, smooth(0.55, 1, q));
  }
  if (isThrower) {
    // Boss overhead wind-up & circular whip throw arc:
    const idleA = add(neck, v(12 * f * s, 22 * s));
    const midLift = add(neck, v(14 * f * s, -16 * s));
    const cocked = add(neck, v(-22 * f * s, -29 * s));
    const apex = add(neck, v(8 * f * s, -34 * s));
    const thrown = add(neck, v(34 * f * s, -2 * s));
    const followDown = add(neck, v(21 * f * s, 23 * s));
    const rack = add(hip, v(-12 * f * s, -2 * s));
    let hand = wind < 0.45 ? lerpV(idleA, midLift, smooth(0, 0.45, wind)) : lerpV(midLift, cocked, smooth(0.45, 1, wind));
    if (k.nock < 1) {
      const q = k.nock;
      hand =
        q < 0.09 ? lerpV(cocked, apex, smooth(0, 0.09, q))
        : q < 0.22 ? lerpV(apex, thrown, smooth(0.09, 0.22, q))
        : q < 0.44 ? lerpV(thrown, followDown, smooth(0.22, 0.44, q))
        : q < 0.72 ? lerpV(followDown, rack, smooth(0.44, 0.72, q))
        : lerpV(rack, idleA, smooth(0.72, 1, q));
    }
    bowHand = add(hand, v(push * 4 * s, hurt * 7 * s));
    // Off-hand points menacingly at the target during wind-up, then snaps backward as counter-balance during the hurl!
    const offIdle = add(neck, v(6 * f * s, 24 * s));
    const offPoint = add(neck, v(29 * f * s, -4 * s));
    const offCounter = add(neck, v(-19 * f * s, 14 * s));
    drawHand = k.nock < 1
      ? lerpV(offCounter, offIdle, smooth(0.15, 0.85, k.nock))
      : lerpV(offIdle, offPoint, wind);
  } else if (k.role === 'hostage') {
    // wrists tied behind him; arms thrown up and waving once he is loose
    const wave = Math.sin(k.t * 9);
    bowHand = lerpV(add(hip, v(-5 * f * s, -9 * s)), add(neck, v((16 + wave * 6) * f * s, -27 * s)), k.happy);
    drawHand = lerpV(add(hip, v(-8 * f * s, -6 * s)), add(neck, v((-14 + wave * 6) * f * s, -27 * s)), k.happy);
  }
  const wp = woundPoint(k);
  if (wp && k.clutch > 0.01) {
    const r = sub(wp, neck); const l = len(r) || 1;
    const reach = add(neck, mul(r, Math.min(1, (33 * s) / l)));
    drawHand = lerpV(drawHand, reach, k.clutch);
  }
  if (teeter > 0) {
    // arms windmilling for balance, half a turn apart
    const spin = k.t * 13 * side * f;
    bowHand = lerpV(bowHand, add(neck, fromAngle(spin, 27 * s)), teeter * 0.9);
    drawHand = lerpV(drawHand, add(neck, fromAngle(spin + Math.PI, 27 * s)), teeter * 0.9);
  }
  if (heave > 0) drawHand = lerpV(drawHand, v(B.x + f * 20 * s, B.y - 4 * s), heave * 0.85); // a hand on the ground to push off
  // elbows hang down-and-back; for the boss thrower during wind-up, the throwing elbow lifts high behind the shoulder
  const pref = isThrower && wind > 0.2 ? v(-0.75 * f, -0.45 * wind + 0.5 * (1 - wind)) : v(-0.6 * f, 0.8);
  const bowEl = ikToward(neck, bowHand, UARM * s, FARM * s, pref, isThrower ? 0.85 : 0.6);
  let drawEl = ikToward(neck, drawHand, UARM * s, FARM * s, v(-0.6 * f, 0.8), 1);
  const tuck = smooth(0.4, 1, pull) * am * (1 - k.clutch) * (k.nock >= 1 && k.react === 'none' && k.role === 'archer' ? 1 : 0);
  if (tuck > 0) drawEl = lerpV(drawEl, add(neck, add(mul(d, -17 * s), v(0, 3 * s))), tuck);

  // ==================== PROUD CHARISMATIC FREESTYLE VICTORY CHOREOGRAPHY ====================
  if (k.alive && k.victory && k.victory > 0) {
    const vt = k.victory;
    const style = (k.victoryStyle ?? 0) % 3;
    const blendIn = smooth(0, 0.16, vt);
    let vHip = hip;
    let vNeck = neck;
    let vHead = head;
    let vBowH = bowHand;
    let vDrawH = drawHand;
    let vAnkB = ankB;
    let vAnkF = ankF;
    let vKneeB = kneeB;
    let vKneeF = kneeF;
    let vBowEl = bowEl;
    let vDrawEl = drawEl;

    if (style === 0) {
      // STYLE 0: ACROBATIC 360° BACKFLIP -> BLAZING WRIST BOW-SPIN -> PROUD SKY CHAMPION SALUTE
      if (vt < 0.26) {
        // Athletic crouch coil before backflip
        const c = smooth(0, 0.26, vt);
        vHip = v(B.x - 3 * f * s, B.y - (43 - 10 * c) * s);
        vAnkB = v(B.x - 16 * f * s, B.y - 3 * s);
        vAnkF = v(B.x + 15 * f * s, B.y - 3 * s);
        const ln = -0.24 * c;
        vNeck = add(vHip, v(-Math.sin(ln) * f * TORSO * s, -Math.cos(ln) * TORSO * s));
        vHead = add(vNeck, v(-Math.sin(ln - 0.12) * f * NECK * s, -Math.cos(ln - 0.12) * f * NECK * s));
        vBowH = add(vNeck, v((-14 * c + 12 * (1 - c)) * f * s, 20 * s));
        vDrawH = add(vNeck, v(-18 * c * f * s, 20 * s));
        vKneeF = ik(vHip, vAnkF, THIGH * s, SHIN * s, -f).mid;
        vKneeB = ik(vHip, vAnkB, THIGH * s, SHIN * s, -f * 0.8).mid;
        vBowEl = ikToward(vNeck, vBowH, UARM * s, FARM * s, v(-0.7 * f, 0.7), 0.9);
        vDrawEl = ikToward(vNeck, vDrawH, UARM * s, FARM * s, v(-0.7 * f, 0.7), 0.9);
      } else if (vt < 0.98) {
        // High clean 360° aerial backflip right above his floating pillar!
        const u = (vt - 0.26) / 0.72;
        const easeFlip = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const th = -f * easeFlip * Math.PI * 2;
        const jumpH = Math.sin(Math.PI * u) * 58 * s;
        const tuckK = Math.sin(Math.PI * u);
        const pivot = v(B.x, B.y - 36 * s - jumpH);
        const rotPt = (lx: number, ly: number): V => {
          const cs = Math.cos(th);
          const sn = Math.sin(th);
          return v(pivot.x + (lx * f * cs - ly * sn) * s, pivot.y + (lx * f * sn + ly * cs) * s);
        };
        vHip = rotPt(-2, 10 - 3 * tuckK);
        vNeck = rotPt(2, -24 + 3 * tuckK);
        vHead = rotPt(4, -37 + 4 * tuckK);
        vKneeF = rotPt(15, 16 - 10 * tuckK);
        vAnkF = rotPt(13 - 8 * tuckK, 39 - 14 * tuckK);
        vKneeB = rotPt(-10, 18 - 8 * tuckK);
        vAnkB = rotPt(-15 - 4 * tuckK, 39 - 12 * tuckK);
        vBowEl = rotPt(14, -14);
        vBowH = rotPt(24, -4 - 8 * tuckK);
        vDrawEl = rotPt(-12, -14);
        vDrawH = rotPt(-18, -2 - 10 * tuckK);
      } else {
        // Superhero landing -> Blazing Bow Twirl -> Proud Skyward Champion Pose!
        const lt = vt - 0.98;
        const absorb = Math.exp(-lt * 8) * Math.sin(lt * 16) * 6;
        const poseIn = smooth(0.28, 0.68, lt);
        const swagger = Math.sin(lt * 3.2) * 1.4;
        vAnkB = v(B.x - 18.5 * f * s, B.y - 3 * s);
        vAnkF = v(B.x + 19.5 * f * s, B.y - 3 * s);
        vHip = v(B.x + (2.5 * poseIn + swagger * 0.4) * f * s, B.y - (43.5 - absorb) * s);
        const ln = 0.18 * poseIn - 0.12 * (1 - poseIn);
        vNeck = add(vHip, v(-Math.sin(ln) * f * TORSO * s, -Math.cos(ln) * TORSO * s));
        const ha2 = ln + 0.14 * poseIn; // Chin tilted proudly upward!
        vHead = add(vNeck, v(-Math.sin(ha2) * f * NECK * s, -Math.cos(ha2) * f * NECK * s));
        // Spin out front, then thrust gleaming bow high into the heavens!
        const spinHand = add(vNeck, v(27 * f * s, -4 * s));
        const skyHand = add(vNeck, v((13 + swagger * 0.3) * f * s, (-32.5 - Math.sin(lt * 3.2) * 1.5) * s));
        vBowH = lerpV(spinHand, skyHand, poseIn);
        // Left hand planted charismatically on the hip with flared elbow!
        vDrawH = add(vHip, v(-5.5 * f * s, -4 * s));
        vKneeF = ik(vHip, vAnkF, THIGH * s, SHIN * s, -f).mid;
        vKneeB = ik(vHip, vAnkB, THIGH * s, SHIN * s, -f * 0.7).mid;
        vBowEl = ikToward(vNeck, vBowH, UARM * s, FARM * s, v(0.5 * f, 0.4), 0.75);
        vDrawEl = add(vHip, v(-18.5 * f * s, -16 * s));
      }
    } else if (style === 1) {
      // STYLE 1: FIGURE-8 FREESTYLE BOW TWIRL -> OVER-SHOULDER PENDEKAR BOSS STANCE (Guts / Sekiro / Sephiroth vibe!)
      const spinPhase = clamp(vt / 0.92, 0, 1);
      const poseIn = smooth(0.82, 1.32, vt);
      const hop = vt > 0.76 && vt < 1.16 ? Math.sin(((vt - 0.76) / 0.4) * Math.PI) * 18 * s : 0;
      const groove = Math.sin(vt * 6.2) * (1 - poseIn) * 3.5 + Math.sin(vt * 2.8) * poseIn * 1.3;

      vAnkB = v(B.x - (16 + 3 * poseIn) * f * s, B.y - 3 * s - hop * 0.75);
      vAnkF = v(B.x + (16 + 4.5 * poseIn) * f * s, B.y - 3 * s - hop);
      vHip = v(B.x + (groove * 0.6 + 2.8 * poseIn) * f * s, B.y - 43.5 * s - hop);

      const ln = Math.sin(vt * 6.2) * 0.08 * (1 - poseIn) + 0.17 * poseIn;
      vNeck = add(vHip, v(-Math.sin(ln) * f * TORSO * s, -Math.cos(ln) * TORSO * s));
      const ha2 = ln + 0.15 * poseIn;
      vHead = add(vNeck, v(-Math.sin(ha2) * f * NECK * s, -Math.cos(ha2) * f * NECK * s));

      // Twirl bow in a figure-8 arc out front, then extend it sleekly forward-low while punching fist skyward!
      const twirlHand = add(vNeck, v((25 + Math.cos(spinPhase * Math.PI * 2) * 5) * f * s, (-2 + Math.sin(spinPhase * Math.PI * 4) * 7) * s));
      const sweptLowBow = add(vNeck, v(27 * f * s, (12 + Math.sin(vt * 3) * 1.2) * s));
      vBowH = lerpV(twirlHand, sweptLowBow, poseIn);

      // Other arm: cocked on hip during spin, then punches a victorious #1 fist HIGH & CLEAR into the sky!
      const grooveOff = add(vHip, v(-6 * f * s, -4 * s));
      const fistSky = add(vNeck, v((-17 + Math.sin(vt * 3.4) * 1.2) * f * s, (-32 - Math.abs(Math.sin(vt * 3.4)) * 2) * s));
      vDrawH = lerpV(grooveOff, fistSky, poseIn);

      vKneeF = ik(vHip, vAnkF, THIGH * s, SHIN * s, -f).mid;
      vKneeB = ik(vHip, vAnkB, THIGH * s, SHIN * s, -f * 0.7).mid;
      vBowEl = ikToward(vNeck, vBowH, UARM * s, FARM * s, v(-0.2 * f, 0.85), 0.75);
      vDrawEl = poseIn > 0.4
        ? ikToward(vNeck, vDrawH, UARM * s, FARM * s, v(-0.85 * f, 0.2), 0.85)
        : add(vHip, v(-18 * f * s, -15 * s));
    } else {
      // STYLE 2: RHYTHMIC SWAGGER GROOVE -> TRIUMPHANT LEAP -> CHARISMATIC ANIME "NEXT!" POINT & BACK-BOW POSE
      const leapU = vt > 0.72 && vt < 1.34 ? (vt - 0.72) / 0.62 : 0;
      const leapH = leapU > 0 ? Math.sin(Math.PI * leapU) * 38 * s : 0;
      const poseIn = smooth(1.26, 1.66, vt);
      const rhythm = vt < 0.72 ? Math.sin(vt * 8.7) : 0;

      vAnkB = v(B.x - (16.5 + 2.5 * poseIn) * f * s, B.y - 3 * s - leapH * 0.75);
      vAnkF = v(B.x + (16.5 + 4.0 * poseIn - leapU * 5) * f * s, B.y - 3 * s - leapH * 1.15);
      vHip = v(B.x + (rhythm * 4.2 + 2.6 * poseIn) * f * s, B.y - (43 - Math.abs(rhythm) * 3.5) * s - leapH);

      const ln = rhythm * 0.11 + (leapU > 0 ? 0.2 * Math.sin(Math.PI * leapU) : 0) + 0.18 * poseIn;
      vNeck = add(vHip, v(-Math.sin(ln) * f * TORSO * s, -Math.cos(ln) * TORSO * s));
      const ha2 = ln + 0.14 * poseIn + rhythm * 0.08;
      vHead = add(vNeck, v(-Math.sin(ha2) * f * NECK * s, -Math.cos(ha2) * f * NECK * s));

      const grooveBow = add(vNeck, v((24 + rhythm * 4) * f * s, (-3 - Math.abs(rhythm) * 6) * s));
      const leapBow = add(vNeck, v(-18 * f * s, 10 * s));
      const backWingBow = add(vNeck, v(-16 * f * s, (-10 + Math.sin(vt * 3) * 1.2) * s));
      vBowH = leapU > 0
        ? lerpV(grooveBow, leapBow, Math.sin(Math.PI * leapU))
        : lerpV(grooveBow, backWingBow, poseIn);

      const grooveDraw = add(vNeck, v((-12 - rhythm * 5) * f * s, (8 - Math.abs(rhythm) * 8) * s));
      const skyPunch = add(vNeck, v(10 * f * s, -34 * s));
      const coolPoint = add(vNeck, v(31 * f * s, (-6 + Math.sin(vt * 3) * 1.1) * s));
      vDrawH = leapU > 0
        ? lerpV(grooveDraw, skyPunch, Math.sin(Math.PI * leapU))
        : lerpV(grooveDraw, coolPoint, poseIn);

      vKneeF = ik(vHip, vAnkF, THIGH * s, SHIN * s, -f).mid;
      vKneeB = ik(vHip, vAnkB, THIGH * s, SHIN * s, -f * 0.7).mid;
      vBowEl = ikToward(vNeck, vBowH, UARM * s, FARM * s, v(-0.85 * f, 0.5), 0.85);
      vDrawEl = ikToward(vNeck, vDrawH, UARM * s, FARM * s, v(0.2 * f, 0.85), 0.65);
    }

    return [
      lerpV(head, vHead, blendIn),
      lerpV(neck, vNeck, blendIn),
      lerpV(hip, vHip, blendIn),
      lerpV(bowEl, vBowEl, blendIn),
      lerpV(bowHand, vBowH, blendIn),
      lerpV(drawEl, vDrawEl, blendIn),
      lerpV(drawHand, vDrawH, blendIn),
      lerpV(kneeB, vKneeB, blendIn),
      lerpV(ankB, vAnkB, blendIn),
      lerpV(kneeF, vKneeF, blendIn),
      lerpV(ankF, vAnkF, blendIn),
    ];
  }

  return [head, neck, hip, bowEl, bowHand, drawEl, drawHand, kneeB, ankB, kneeF, ankF];
}

export function makeStick(base: V, face: number, s: number, kneel: boolean, ribbon: boolean, role: Role = 'archer'): Stick {
  const k: Stick = {
    p: [], o: [], L: BONE.map((b) => b * s), s, face, alive: true, muscle: 1, base: { ...base }, kneel, role, happy: 0,
    aim: face > 0 ? -0.1 : Math.PI + 0.1, pull: 0, nock: 1, aiming: 0, bowAng: 0, hasBow: role === 'archer', t: Math.random() * 10, seed: Math.random() * 6.28,
    breath: Math.random() * 6.28, exert: 0, vigor: 1, look: v(face, 0), lookAt: null, blink: 1 + Math.random() * 3, lid: 0,
    hurt: 0, hurtDir: 0, wound: null, clutch: 0, react: 'none', rt: 0, rdur: 1, fade: 0,
    ribbon: null, ribbonO: null,
  };
  k.bowAng = idleAng(k);
  k.p = poseTargets(k);
  k.o = k.p.map((q) => ({ ...q }));
  if (ribbon) {
    k.ribbon = Array.from({ length: 6 }, (_, i) => v(k.p[0].x - face * (10 + i * 6) * s, k.p[0].y - 5 * s));
    k.ribbonO = k.ribbon.map((q) => ({ ...q }));
  }
  return k;
}

/** shove one joint (px/s) */
export function impulse(k: Stick, i: number, vel: V) {
  k.o[i] = v(k.o[i].x - vel.x * H, k.o[i].y - vel.y * H);
}

/** where a shot would really go: the line through both hands, held near the intended aim */
export function fireAngle(k: Stick) {
  const phys = Math.atan2(k.p[4].y - k.p[6].y, k.p[4].x - k.p[6].x);
  return k.aim + Math.max(-0.2, Math.min(0.2, angWrap(phys - k.aim)));
}

/** one 120 Hz physics step */
export function stepStick(k: Stick, slabs: Slab2[]) {
  const n = k.p.length; const s = k.s;
  k.t += H;
  // life signs
  k.breath += H * Math.PI * 2 * (0.27 + 0.55 * k.exert + 0.36 * (1 - k.vigor));
  k.exert = Math.max(0, k.exert - H * 0.22);
  k.hurt = Math.max(0, k.hurt - H * (k.alive ? 1.45 : 0));
  if (!k.alive) k.react = 'none';
  else if (k.react !== 'none') { k.rt += H; if (k.rt >= k.rdur) k.react = 'none'; }
  const canClutch = (k.react === 'none' || k.react === 'knee') && k.role !== 'hostage';
  const wantClutch = k.wound && ((k.alive && canClutch && k.hurt > 0.22 && k.pull < 0.2) || (!k.alive && k.fade > 0.02)) ? 1 : 0;
  k.clutch = damp(k.clutch, wantClutch, wantClutch ? 16 : 6, H);
  k.fade = Math.max(0, k.fade - H * 2.4);
  k.blink -= H;
  if (k.blink < 0) k.blink = Math.random() < 0.2 ? 0.28 : 1.6 + Math.random() * 3.6;
  k.lid = damp(k.lid, k.blink < 0.11 ? 1 : 0, 45, H);
  const to = k.lookAt ? sub(k.lookAt, k.p[0]) : fromAngle(k.aim);
  const tl = len(to) || 1;
  k.look = v(damp(k.look.x, to.x / tl, 9, H), damp(k.look.y, to.y / tl, 9, H));

  // how much muscle each joint has right now
  let m = k.alive ? k.muscle : k.fade;
  let mult: number[] | null = null;
  let dm = m;
  if (k.alive && k.react === 'down') {
    const w = smooth(0.42, 0.92, k.rt / k.rdur);
    mult = LYING.map((l) => lerp(l, 1, w)); m = 1; dm = w * 0.9;
  } else if (k.alive && k.react !== 'none') { m = Math.max(m, 0.75); dm = m; }
  const dampK = k.alive ? lerp(0.99, 0.925, dm) : lerp(0.997, 0.95, m);
  const before: number[] = [];
  for (let i = 0; i < n; i++) {
    const vx = (k.p[i].x - k.o[i].x) * dampK;
    const vy = (k.p[i].y - k.o[i].y) * dampK;
    before[i] = vy;
    k.o[i] = { ...k.p[i] };
    k.p[i] = v(k.p[i].x + vx, k.p[i].y + vy + G * H * H);
  }
  if (m > 0.01) {
    const T = poseTargets(k);
    const vicBoost = k.alive && k.victory && k.victory > 0 ? 1.55 : 1;
    for (let i = 0; i < n; i++) {
      // a dying man's feet are no longer planted: he can go over the edge
      const st = Math.min(0.72, STIFF[i] * vicBoost) * m * (mult ? mult[i] : 1) * (!k.alive && (i === 8 || i === 10) ? 0.12 : 1);
      const dx = (T[i].x - k.p[i].x) * st; const dy = (T[i].y - k.p[i].y) * st;
      k.p[i].x += dx; k.p[i].y += dy;
      const keep = 1 - BOUNCE[i] * (vicBoost > 1 ? 0.65 : 1);
      k.o[i].x += dx * keep; k.o[i].y += dy * keep;
    }
  }
  const solve = (a: number, b: number, target: number, onlyIfShorter: boolean) => {
    const dx = k.p[b].x - k.p[a].x; const dy = k.p[b].y - k.p[a].y;
    const l = Math.hypot(dx, dy) || 0.0001;
    if (onlyIfShorter && l >= target) return;
    const wa = INV_M[a]; const wb = INV_M[b];
    const c = (l - target) / l / (wa + wb);
    k.p[a].x += dx * c * wa; k.p[a].y += dy * c * wa;
    k.p[b].x -= dx * c * wb; k.p[b].y -= dy * c * wb;
  };
  const onSlab: (Slab2 | null)[] = new Array(n).fill(null);
  const limp = 1 - (mult ? dm : m);
  for (let it = 0; it < 9; it++) {
    RAG_STICKS.forEach(([a, b], i) => solve(a, b, k.L[i], false));
    for (const [a, b, l] of STRUTS) solve(a, b, l * s, true);
    if (limp > 0.4) {
      // knees and elbows only fold the human way once the body has gone slack
      for (const [a, mid, e, sign] of HINGES) {
        const d1 = sub(k.p[mid], k.p[a]); const d2 = sub(k.p[e], k.p[mid]);
        if ((d1.x * d2.y - d1.y * d2.x) * sign * -k.face < 0) {
          const straight = add(k.p[mid], mul(d1, len(d2) / (len(d1) || 1)));
          const c = mul(sub(straight, k.p[e]), 0.4 * limp);
          const we = INV_M[e] / (INV_M[e] + INV_M[mid]);
          k.p[e] = add(k.p[e], mul(c, we));
          k.p[mid] = sub(k.p[mid], mul(c, 1 - we));
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const rad = JRAD[i] * s; const p = k.p[i];
      for (const sl of slabs) {
        const inX = p.x > sl.x0 - rad * 0.5 && p.x < sl.x1 + rad * 0.5;
        const bottom = sl.bot + rad * 0.6;
        if (!inX || p.y <= sl.top - rad || p.y >= bottom) continue;
        const o = k.o[i];
        const wasAbove = o.y <= sl.top - rad + 4;
        const wasBelow = o.y >= bottom - 4;
        const wasOutX = o.x <= sl.x0 - rad * 0.5 || o.x >= sl.x1 + rad * 0.5;
        if (wasAbove || (!wasBelow && !wasOutX && p.y - (sl.top - rad) < 14)) { p.y = sl.top - rad; onSlab[i] = sl; }
        // for the living a ground is one-way: he can be hauled back up onto it from wherever he ended up hanging
        else if (k.alive) continue;
        else if (wasBelow || (!wasOutX && bottom - p.y < 14)) { p.y = bottom; o.y = Math.max(o.y, bottom); }
        else if (wasOutX) p.x = p.x < (sl.x0 + sl.x1) / 2 ? sl.x0 - rad * 0.5 : sl.x1 + rad * 0.5;
        else p.y = sl.top - rad;
      }
    }
  }
  if (!k.alive) {
    for (let i = 0; i < n; i++) {
      const sl = onSlab[i];
      if (sl && k.p[i].y >= sl.top - JRAD[i] * s - 0.01) {
        k.o[i].x = k.p[i].x - (k.p[i].x - k.o[i].x) * (i === 0 ? 0.8 : 0.7);
        if (before[i] > 1.2) k.o[i].y = k.p[i].y + before[i] * (i === 0 ? 0.3 : 0.22);
      }
    }
  }
  // the bow follows the real hands, so every wobble of the body shows in the aim;
  // after a release it tips forward in the hand and comes back as the next arrow goes on
  if (k.alive && k.victory && k.victory > 0) {
    const vt = k.victory;
    const style = (k.victoryStyle ?? 0) % 3;
    const f = k.face;
    if (style === 0) {
      if (vt < 1.52) {
        // Rapid 2.5-turn wrist twirl during backflip & landing flourish!
        k.bowAng = idleAng(k) - f * smooth(0.2, 1.52, vt) * Math.PI * 5;
      } else {
        const heroAng = f > 0 ? -1.08 : Math.PI + 1.08;
        k.bowAng = angLerp(k.bowAng, heroAng, 0.25);
      }
    } else if (style === 1) {
      if (vt < 1.08) {
        // Blazing 3-turn figure-8 bow twirl!
        k.bowAng = idleAng(k) + f * smooth(0, 1.08, vt) * Math.PI * 6;
      } else {
        // Bow aimed sleekly outward-down away from body so face & raised sky-fist shine 100% clear!
        const lowSweptAng = f > 0 ? 0.22 : Math.PI - 0.22;
        k.bowAng = angLerp(k.bowAng, lowSweptAng, 0.24);
      }
    } else {
      if (vt < 0.85) {
        k.bowAng = idleAng(k) + f * smooth(0, 0.85, vt) * Math.PI * 4;
      } else {
        // Arched proudly behind his back like wings while his front arm points charismatically forward!
        const backWingAng = f > 0 ? -2.85 : Math.PI + 2.85;
        k.bowAng = angLerp(k.bowAng, backWingAng, 0.24);
      }
    }
  } else {
    const phys = Math.atan2(k.p[4].y - k.p[6].y, k.p[4].x - k.p[6].x);
    const tip = k.nock < 1 ? k.face * 0.42 * Math.sin(Math.PI * Math.min(1, k.nock * 1.25)) : 0;
    const loose = k.react === 'down' || k.react === 'teeter' ? Math.atan2(k.p[4].y - k.p[3].y, k.p[4].x - k.p[3].x) - k.face * 0.9 : handAngle(k) + tip;
    k.bowAng = angLerp(k.bowAng, onString(k) ? phys : loose, 0.3);
  }

  // headband tails / cape: a little verlet chain pinned behind the head
  if (k.ribbon && k.ribbonO) {
    const R = k.ribbon; const O = k.ribbonO;
    const u = headUp(k); const fw = v(-u.y * k.face, u.x * k.face);
    const anchor = v(k.p[0].x + u.x * 5.5 * s - fw.x * 9.5 * s, k.p[0].y + u.y * 5.5 * s - fw.y * 9.5 * s);
    for (let i = 1; i < R.length; i++) {
      const vx = (R[i].x - O[i].x) * 0.965; const vy = (R[i].y - O[i].y) * 0.965;
      O[i] = { ...R[i] };
      const wind = (-k.face * 260 + Math.sin(k.t * 5 + i * 0.9) * 240) * H * H;
      R[i] = v(R[i].x + vx + wind, R[i].y + vy + 330 * H * H + Math.cos(k.t * 6.3 + i * 1.3) * 150 * H * H);
    }
    R[0] = anchor;
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < R.length; i++) {
        const dx = R[i].x - R[i - 1].x; const dy = R[i].y - R[i - 1].y;
        const l = Math.hypot(dx, dy) || 0.001; const c = (l - 6 * s) / l;
        R[i].x -= dx * c; R[i].y -= dy * c;
      }
    }
  }
}

function headUp(k: Stick): V {
  const d = sub(k.p[0], k.p[1]); const l = len(d) || 1;
  return v(d.x / l, d.y / l);
}

/** how flat his feet sit: planted while he stands, loose while he is down or dead */
const planted = (k: Stick) => (!k.alive ? 0 : k.react === 'down' ? smooth(0.5, 0.9, k.rt / k.rdur) : 1);

/** where the toes are: straight ahead along the ground when planted, hanging off the shin otherwise */
function toeOf(k: Stick, kn: number, an: number): V {
  const P = k.p; const f = k.face; const s = k.s;
  const d = sub(P[an], P[kn]); const l = len(d) || 1;
  const flat = planted(k);
  const tx = lerp((d.y / l) * f, f, flat); const ty = lerp(-(d.x / l) * f, 0, flat);
  const tl = Math.hypot(tx, ty) || 1;
  return v(P[an].x + (tx / tl) * 9.5 * s, P[an].y + (ty / tl) * 9.5 * s + flat * 0.5 * s);
}

/** the curved spine: control point of the quadratic from hip to neck */
function spineCtrl(k: Stick): V {
  const P = k.p; const u = headUp(k);
  const sd = sub(P[1], P[2]); const sl = len(sd) || 1;
  const cross = (sd.x / sl) * u.y - (sd.y / sl) * u.x;
  const mid = lerpV(P[2], P[1], 0.5);
  return v(mid.x + (sd.y / sl) * cross * 11 * k.s, mid.y - (sd.x / sl) * cross * 11 * k.s);
}

/* ------------------------------------------------------------------ */
/* drawing                                                             */
/* ------------------------------------------------------------------ */

export type BossId = 'axer' | 'thunder_lord' | 'inferno_king' | 'xeno_queen' | 'thorn_warden';

export interface StickLook {
  color: string;
  rim: string | null;
  eye: string;
  helm: boolean;
  crown: boolean;
  band: string | null;
  quiver: boolean;
  horns?: boolean;
  bound?: boolean;
  bossKind?: BossId;
}

/** a limb as one flowing shape: thick at the root, thin at the end, the joint rounded instead of cornered */
function limb(ctx: Ctx, A: V, J: V, B: V, w0: number, w1: number, w2: number) {
  const la = dist(A, J) || 1; const lb = dist(J, B) || 1;
  const r = Math.min(la, lb) * 0.46;
  const p1 = lerpV(J, A, r / la); const p2 = lerpV(J, B, r / lb);
  const pts: V[] = [A, p1]; const ts: number[] = [0, 0.5 * (1 - r / la)];
  for (let i = 1; i <= 3; i++) {
    const t = i / 4; const m = 1 - t;
    pts.push(v(m * m * p1.x + 2 * m * t * J.x + t * t * p2.x, m * m * p1.y + 2 * m * t * J.y + t * t * p2.y));
    ts.push(0.5 * (1 - r / la) + (0.5 * r / la + 0.5 * r / lb) * t);
  }
  pts.push(p2); ts.push(0.5 + 0.5 * r / lb);
  pts.push(B); ts.push(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const t = (ts[i] + ts[i + 1]) / 2;
    ctx.lineWidth = t < 0.5 ? lerp(w0, w1, t * 2) : lerp(w1, w2, (t - 0.5) * 2);
    ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); ctx.stroke();
  }
}

/** silhouette stickman; `held` is called just before the bow arm so the bow sits in his front hand */
export function drawStick(ctx: Ctx, k: Stick, look: StickLook, held?: () => void, behind?: () => void) {
  const P = k.p; const s = k.s; const f = k.face;
  const u = headUp(k); const fw = v(-u.y * f, u.x * f);
  const ua = Math.atan2(u.y, u.x);
  const br = Math.sin(k.breath) * (0.5 + k.exert * 0.5 + (1 - k.vigor) * 0.4);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // the whole sole on the ground - heel and toe - whenever he is standing on it
  const foot = (kn: number, an: number) => {
    const toe = toeOf(k, kn, an);
    const heel = lerpV(P[an], toe, -0.22);
    limb(ctx, heel, lerpV(heel, toe, 0.5), toe, 5 * s, 4.6 * s, 3.4 * s);
  };
  const leg = (kn: number, an: number) => { limb(ctx, P[2], P[kn], P[an], 7.6 * s, 6.3 * s, 4.9 * s); foot(kn, an); };
  const arm = (el: number, ha: number) => {
    limb(ctx, P[1], P[el], P[ha], 6.4 * s, 5.3 * s, 4.3 * s);
    ctx.beginPath(); ctx.arc(P[ha].x, P[ha].y, 3.7 * s, 0, Math.PI * 2); ctx.fill();
  };
  // the spine bows toward wherever the head has gone, so the torso reads as one supple line
  const spine = () => {
    limb(ctx, P[2], spineCtrl(k), P[1], 7.8 * s, (8.7 + br * 0.9) * s, 6.3 * s);
    ctx.lineWidth = 5.6 * s;
    ctx.beginPath(); ctx.moveTo(P[1].x, P[1].y); ctx.lineTo(P[0].x, P[0].y); ctx.stroke();
  };
  const body = (front: boolean) => {
    if (!front) {
      arm(5, 6);
      leg(7, 8);
      spine();
      ctx.beginPath(); ctx.arc(P[0].x, P[0].y, HEAD_R * s, 0, Math.PI * 2); ctx.fill();
      leg(9, 10);
    } else arm(3, 4);
  };

  // quiver on the rear hip
  if (look.quiver) {
    ctx.save();
    ctx.translate(P[2].x - f * 6 * s, P[2].y - 1 * s);
    ctx.rotate(Math.atan2(P[1].y - P[2].y, P[1].x - P[2].x) + Math.PI / 2 - f * 0.5);
    ctx.scale(s, s);
    ctx.fillStyle = '#e5352f';
    for (const ox of [-2.2, 1.2]) { ctx.beginPath(); ctx.moveTo(ox, -11); ctx.lineTo(ox - 2.4, -17); ctx.lineTo(ox + 2.6, -16); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#24130b';
    ctx.beginPath(); ctx.moveTo(-4.2, -11); ctx.lineTo(4.2, -11); ctx.lineTo(3, 8); ctx.lineTo(-3, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a3320'; ctx.fillRect(-4.4, -11.5, 8.8, 2.4);
    ctx.restore();
  }

  if (k.ribbon && look.band) {
    ctx.strokeStyle = look.band; ctx.lineWidth = 3.4 * s;
    ctx.beginPath();
    k.ribbon.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
    ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    k.ribbon.slice(0, 5).forEach((q, i) => (i ? ctx.lineTo(q.x + i * 0.6 * s, q.y + i * 2.2 * s) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
  }

  // whatever is stuck in him goes down first, so the body closes over the buried end
  behind?.();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // a thin rim of light on the upper-left edge lifts the silhouette off the forest
  if (look.rim) {
    ctx.save();
    ctx.translate(-1.2 * s, -1.4 * s);
    ctx.strokeStyle = look.rim; ctx.fillStyle = look.rim;
    body(false);
    ctx.restore();
  }
  ctx.strokeStyle = look.color; ctx.fillStyle = look.color;
  body(false);

  // head dressing
  if (look.band) {
    ctx.lineCap = 'butt'; ctx.strokeStyle = look.band; ctx.lineWidth = 4.2 * s;
    ctx.beginPath();
    ctx.moveTo(P[0].x + u.x * 5.5 * s - fw.x * 9.3 * s, P[0].y + u.y * 5.5 * s - fw.y * 9.3 * s);
    ctx.lineTo(P[0].x + u.x * 5.5 * s + fw.x * 9.3 * s, P[0].y + u.y * 5.5 * s + fw.y * 9.3 * s);
    ctx.stroke();
    ctx.lineCap = 'round';
  }
  if (look.helm) {
    ctx.fillStyle = '#51666f';
    ctx.beginPath(); ctx.arc(P[0].x, P[0].y, (HEAD_R + 2) * s, ua - 1.75, ua + 1.75); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#9fb4bb'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.arc(P[0].x, P[0].y, (HEAD_R + 1) * s, ua - 1.2, ua + 0.2); ctx.stroke();
  }
  if (look.crown) {
    ctx.save();
    ctx.translate(P[0].x, P[0].y); ctx.rotate(ua + Math.PI / 2); ctx.scale(s, s);
    ctx.fillStyle = '#ffc933';
    ctx.beginPath();
    ctx.moveTo(-9, -HEAD_R + 3); ctx.lineTo(-11, -HEAD_R - 9); ctx.lineTo(-5, -HEAD_R - 3); ctx.lineTo(0, -HEAD_R - 11);
    ctx.lineTo(5, -HEAD_R - 3); ctx.lineTo(11, -HEAD_R - 9); ctx.lineTo(9, -HEAD_R + 3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  if (look.horns && !look.bossKind) {
    // classic horned cap
    ctx.save();
    ctx.translate(P[0].x, P[0].y); ctx.rotate(ua + Math.PI / 2); ctx.scale(s, s);
    ctx.fillStyle = '#efe6d0';
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 7, -7); ctx.quadraticCurveTo(sd * 17, -8, sd * 15.5, -21); ctx.quadraticCurveTo(sd * 12, -12, sd * 4, -10.5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#414e56';
    ctx.beginPath(); ctx.arc(0, 0, HEAD_R + 1.8, Math.PI * 1.04, Math.PI * 1.96); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8fa3ab'; ctx.fillRect(-HEAD_R - 1.5, -3.2, (HEAD_R + 1.5) * 2, 2.2);
    ctx.restore();
  }

  // 5 UNIQUE BOSS HEADGEAR & SHOULDER ARMOR DESIGNS
  if (look.bossKind) {
    const bk = look.bossKind;
    ctx.save();
    ctx.translate(P[0].x, P[0].y); ctx.rotate(ua + Math.PI / 2); ctx.scale(s, s);
    if (bk === 'axer') {
      // BOS 1: RAJA VIKING KAPAK — Spiked Iron Viking Helm + Giant Curved Bone Horns + Nose Guard
      ctx.fillStyle = '#efe6d0';
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sd * 7, -6);
        ctx.quadraticCurveTo(sd * 20, -7, sd * 18, -23);
        ctx.quadraticCurveTo(sd * 13, -13, sd * 4, -10);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#3b4852';
      ctx.beginPath(); ctx.arc(0, 0, HEAD_R + 2.2, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9fb4c0';
      ctx.fillRect(-HEAD_R - 2, -3.5, (HEAD_R + 2) * 2, 2.6);
      ctx.fillRect(-1.5, -3.5, 3, 7); // Iron nose guard
      ctx.fillStyle = '#d92b2b';
      ctx.beginPath(); ctx.moveTo(-2.5, -HEAD_R - 1); ctx.lineTo(0, -HEAD_R - 9); ctx.lineTo(2.5, -HEAD_R - 1); ctx.closePath(); ctx.fill();
    } else if (bk === 'thunder_lord') {
      // BOS 2: KAISAR PETIR ZEUS — Golden Lightning-Spire Crown + Floating Tesla Halo
      ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2.0;
      ctx.beginPath(); ctx.ellipse(0, -HEAD_R - 8, 15, 3.8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd23f'; stroke: '#8a5200';
      ctx.beginPath();
      ctx.moveTo(-10, -HEAD_R + 3);
      ctx.lineTo(-13, -HEAD_R - 10); ctx.lineTo(-6, -HEAD_R - 4);
      ctx.lineTo(-4, -HEAD_R - 13); ctx.lineTo(0, -HEAD_R - 17); ctx.lineTo(4, -HEAD_R - 13);
      ctx.lineTo(6, -HEAD_R - 4); ctx.lineTo(13, -HEAD_R - 10);
      ctx.lineTo(10, -HEAD_R + 3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath(); ctx.arc(0, -HEAD_R - 4, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (bk === 'inferno_king') {
      // BOS 3: RAJA IBLIS MAGMA — Swept Obsidian Demon Horns + Molten Core Crown
      for (const sd of [-1, 1]) {
        ctx.fillStyle = '#260802';
        ctx.beginPath();
        ctx.moveTo(sd * 6, -7);
        ctx.quadraticCurveTo(sd * 22, -12, sd * 21, -26);
        ctx.quadraticCurveTo(sd * 13, -18, sd * 3, -11);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ff6a00'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(sd * 8, -9); ctx.quadraticCurveTo(sd * 17, -13, sd * 19, -23); ctx.stroke();
      }
      ctx.fillStyle = '#ff4d00';
      ctx.beginPath();
      ctx.moveTo(-8, -HEAD_R + 2); ctx.lineTo(-6, -HEAD_R - 7); ctx.lineTo(0, -HEAD_R - 12); ctx.lineTo(6, -HEAD_R - 7); ctx.lineTo(8, -HEAD_R + 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff066';
      ctx.beginPath(); ctx.arc(0, -HEAD_R - 3, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (bk === 'xeno_queen') {
      // BOS 4: RATU XENOMORPH ACID — Elongated Biomechanical Queen Crest + Acid Tubes
      ctx.fillStyle = '#0d140c';
      ctx.strokeStyle = '#8cff00'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(f * 8, -HEAD_R + 2);
      ctx.quadraticCurveTo(f * 2, -HEAD_R - 14, -f * 24, -HEAD_R - 19);
      ctx.quadraticCurveTo(-f * 28, -HEAD_R - 9, -f * 20, -HEAD_R - 2);
      ctx.quadraticCurveTo(-f * 10, -HEAD_R + 1, -f * 6, 3);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Bioluminescent acid veins along the crest
      ctx.strokeStyle = '#d4ff00'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(0, -HEAD_R - 3); ctx.quadraticCurveTo(-f * 10, -HEAD_R - 10, -f * 21, -HEAD_R - 13); ctx.stroke();
    } else if (bk === 'thorn_warden') {
      // BOS 5: PANGLIMA DURI ZAMRUD — Emerald Gladiator Crest + Briar Thorn Antlers
      ctx.fillStyle = '#1b5e20';
      ctx.beginPath(); ctx.arc(0, 0, HEAD_R + 2, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7dff24';
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sd * 7, -8); ctx.lineTo(sd * 16, -18); ctx.lineTo(sd * 12, -19); ctx.lineTo(sd * 18, -26);
        ctx.lineTo(sd * 9, -18); ctx.lineTo(sd * 4, -10);
        ctx.closePath(); ctx.fill();
      }
      // Emerald plume
      ctx.fillStyle = '#38d92b';
      ctx.beginPath(); ctx.moveTo(-6, -HEAD_R - 1); ctx.quadraticCurveTo(0, -HEAD_R - 16, 8, -HEAD_R - 1); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // Boss Shoulder Pauldron at Neck/Shoulder (`P[1]`)
    ctx.save();
    ctx.translate(P[1].x, P[1].y);
    ctx.scale(s, s);
    const pCol =
      bk === 'axer' ? '#5c6e78'
      : bk === 'thunder_lord' ? '#00b4ff'
      : bk === 'inferno_king' ? '#d42a00'
      : bk === 'xeno_queen' ? '#3d6600'
      : '#28a428';
    const pHi =
      bk === 'axer' ? '#d92b2b'
      : bk === 'thunder_lord' ? '#ffd23f'
      : bk === 'inferno_king' ? '#ffae19'
      : bk === 'xeno_queen' ? '#cfff04'
      : '#8eff2b';
    ctx.fillStyle = pCol;
    ctx.beginPath(); ctx.ellipse(-f * 2, 1, 7.5, 4.8, -f * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pHi;
    ctx.beginPath(); ctx.moveTo(-f * 4, -2); ctx.lineTo(-f * 9, -8); ctx.lineTo(f * 1, -3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // the face: an eye that looks, blinks, narrows on the draw and screws shut in pain; a mouth only when it hurts
  const lf = k.look.x * fw.x + k.look.y * fw.y; const lu = k.look.x * u.x + k.look.y * u.y;
  const ex = P[0].x + fw.x * (3.4 + 1.5 * lf) * s + u.x * (0.3 + 1.7 * lu) * s;
  const ey = P[0].y + fw.y * (3.4 + 1.5 * lf) * s + u.y * (0.3 + 1.7 * lu) * s;
  const dizzy = k.react === 'down' && k.rt / k.rdur < 0.5;
  const pain = k.alive ? Math.max(smooth(0.2, 0.5, k.hurt), dizzy ? 1 : 0, k.react === 'teeter' ? 0.4 : 0) : 0;
  ctx.save();
  ctx.translate(ex, ey); ctx.rotate(ua + Math.PI / 2); ctx.scale(f * s, s);
  if (!k.alive) {
    ctx.strokeStyle = look.eye; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(-2.6, -2.6); ctx.lineTo(2.6, 2.6); ctx.moveTo(2.6, -2.6); ctx.lineTo(-2.6, 2.6); ctx.stroke();
  } else if (k.victory && k.victory > 0.25) {
    // Proud charismatic anime champion eye + golden star glint!
    ctx.rotate(-0.14);
    ctx.fillStyle = look.eye;
    ctx.beginPath();
    ctx.moveTo(-3.6, -0.4);
    ctx.quadraticCurveTo(0.4, -2.7, 3.8, -0.8);
    ctx.quadraticCurveTo(1.2, 1.8, -3.6, -0.4);
    ctx.closePath();
    ctx.fill();
    // Twinkling anime star glint at outer eye corner
    const gl = 0.65 + 0.35 * Math.sin(k.t * 11);
    const gr = 3.2 * gl;
    ctx.strokeStyle = '#ffe566';
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.moveTo(-3.6 - gr, -1.6); ctx.lineTo(-3.6 + gr, -1.6);
    ctx.moveTo(-3.6, -1.6 - gr); ctx.lineTo(-3.6, -1.6 + gr);
    ctx.stroke();
  } else if (k.happy > 0.5) {
    // eyes squeezed into a smile
    ctx.strokeStyle = look.eye; ctx.lineWidth = 1.9;
    ctx.beginPath(); ctx.moveTo(-3, 1.3); ctx.quadraticCurveTo(0, -3.3, 3, 1.3); ctx.stroke();
  } else if (pain > 0.5) {
    ctx.strokeStyle = look.eye; ctx.lineWidth = 1.8; ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(-2.8, -2.6); ctx.lineTo(2.2, 0); ctx.lineTo(-2.8, 2.6); ctx.stroke();
    ctx.lineJoin = 'round';
  } else {
    // wide-eyed while he fights for balance, narrowed down the arrow
    const squint = k.react === 'teeter' ? 1.35 : 1 - 0.38 * k.pull * k.aiming - 0.3 * (1 - k.vigor);
    ctx.rotate(0.3 - lu * 0.25);
    ctx.fillStyle = look.eye;
    ctx.beginPath(); ctx.ellipse(0, 0, 3.5, Math.max(0.25, 2.25 * (1 - k.lid) * squint), 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (k.alive && k.victory && k.victory > 0.25) {
    // Charismatic proud anime smirk on the lower cheek!
    ctx.save();
    ctx.translate(P[0].x + fw.x * 5.2 * s - u.x * 4.8 * s, P[0].y + fw.y * 5.2 * s - u.y * 4.8 * s);
    ctx.rotate(ua + Math.PI / 2);
    ctx.scale(f * s, s);
    ctx.strokeStyle = look.eye;
    ctx.lineWidth = 1.55;
    ctx.beginPath();
    ctx.moveTo(-2.6, -0.9);
    ctx.quadraticCurveTo(0.4, 1.4, 3.2, 0.2);
    ctx.stroke();
    ctx.restore();
  } else {
    const mouth = k.alive ? Math.max(pain, k.react === 'teeter' ? 0.9 : 0, k.happy * 0.95) : 0.8;
    if (mouth > 0.05) {
      ctx.fillStyle = look.eye;
      ctx.beginPath();
      ctx.ellipse(P[0].x + fw.x * 6.4 * s - u.x * 5.2 * s, P[0].y + fw.y * 6.4 * s - u.y * 5.2 * s, 2 * s * mouth, 2.5 * s * mouth, ua, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  held?.();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (look.rim) {
    ctx.save(); ctx.translate(-1.2 * s, -1.4 * s);
    ctx.strokeStyle = look.rim; ctx.fillStyle = look.rim; body(true);
    ctx.restore();
  }
  ctx.strokeStyle = look.color; ctx.fillStyle = look.color;
  body(true);
  if (look.bound) {
    // coils of rope round his chest
    const C = spineCtrl(k); const sd = sub(P[1], P[2]); const sl = len(sd) || 1;
    const nx = -sd.y / sl; const ny = sd.x / sl;
    for (const q of [0.3, 0.46, 0.62]) {
      const m = 1 - q;
      const cx = m * m * P[2].x + 2 * m * q * C.x + q * q * P[1].x; const cy = m * m * P[2].y + 2 * m * q * C.y + q * q * P[1].y;
      for (const [col, lw] of [['#8a6a34', 4.4], ['#e3c283', 2.6]] as [string, number][]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw * s;
        ctx.beginPath(); ctx.moveTo(cx - nx * 8 * s, cy - ny * 8 * s - 1.5 * s); ctx.lineTo(cx + nx * 8 * s, cy + ny * 8 * s + 1.5 * s); ctx.stroke();
      }
    }
  }
}

/**
 * The inside of him, for the X-ray: skull with jaw and socket, vertebrae, rib cage, pelvis, long bones.
 * `crack` is the stick (bone) that just took the arrow at world point `pt`: the skull splits, ribs snap,
 * or the long bone of that limb breaks in two - growing with `t` (0..1).
 * With `local` only the part that was hit is drawn: that one arm, that one leg, or the spine and ribs.
 */
export function drawSkeleton(ctx: Ctx, k: Stick, crack: number | null, pt: V, t: number, local = false) {
  const P = k.p; const s = k.s; const f = k.face;
  const up = headUp(k); const fw = v(-up.y * f, up.x * f);
  const BONE_C = '#ecfcff'; const DARK = '#04121f';
  ctx.strokeStyle = BONE_C; ctx.fillStyle = BONE_C; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const seg = (a: V, b: V) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  /** where along a→b the arrow went through, and the two broken ends pushed apart */
  const split = (a: V, b: V): [V, V, V] => {
    const d = sub(b, a); const l = len(d) || 1; const ux = d.x / l; const uy = d.y / l;
    const q = clamp(((pt.x - a.x) * ux + (pt.y - a.y) * uy) / l, 0.22, 0.78);
    const m = lerpV(a, b, q); const gap = (1.2 + 2.2 * t) * s; const off = 2.6 * t * s;
    return [v(m.x - ux * gap, m.y - uy * gap), v(m.x + ux * gap - uy * off, m.y + uy * gap + ux * off), v(-uy, ux)];
  };
  const long = (a: V, b: V, w: number, broken: boolean) => {
    ctx.lineWidth = w * s;
    if (!broken) seg(a, b);
    else {
      const [e1, e2, n] = split(a, b);
      seg(a, e1); seg(e2, b);
      // splintered ends
      ctx.lineWidth = 1.1 * s;
      for (const [e, sg] of [[e1, 1], [e2, -1]] as [V, number][]) {
        seg(v(e.x + n.x * w * 0.5 * s, e.y + n.y * w * 0.5 * s), v(e.x + n.x * w * 0.9 * s + (b.x - a.x) * 0.04 * sg, e.y + n.y * w * 0.9 * s + (b.y - a.y) * 0.04 * sg));
      }
    }
    for (const q of [a, b]) { ctx.beginPath(); ctx.arc(q.x, q.y, w * 0.92 * s, 0, Math.PI * 2); ctx.fill(); }
  };
  const twin = (a: V, b: V, w: number, gap: number, broken: boolean) => {
    const d = sub(b, a); const l = len(d) || 1; const nx = (-d.y / l) * gap * s; const ny = (d.x / l) * gap * s;
    ctx.lineWidth = w * s;
    for (const sg of [-1, 1]) {
      const a2 = v(a.x + nx * sg, a.y + ny * sg); const b2 = v(b.x + nx * sg * 0.7, b.y + ny * sg * 0.7);
      if (!broken) seg(a2, b2);
      else { const [e1, e2] = split(a2, b2); seg(a2, e1); seg(v(e2.x + nx * sg * t, e2.y + ny * sg * t), b2); }
    }
  };
  // limbs: humerus, radius+ulna, hand; femur, kneecap, tibia+fibula, foot
  for (const [el, ha, su, sf] of [[5, 6, 8, 9], [3, 4, 6, 7]]) {
    if (local && crack !== su && crack !== sf) continue;
    long(P[1], P[el], 2.1, crack === su); twin(P[el], P[ha], 1.2, 1.15, crack === sf);
    ctx.beginPath(); ctx.arc(P[ha].x, P[ha].y, 2.1 * s, 0, Math.PI * 2); ctx.fill();
  }
  for (const [kn, an, st, ss] of [[7, 8, 2, 3], [9, 10, 4, 5]]) {
    if (local && crack !== st && crack !== ss) continue;
    long(P[2], P[kn], 2.6, crack === st); twin(P[kn], P[an], 1.4, 1.3, crack === ss);
    ctx.beginPath(); ctx.arc(P[kn].x, P[kn].y, 2.2 * s, 0, Math.PI * 2); ctx.fill();
    const toe = toeOf(k, kn, an);
    ctx.lineWidth = 1.7 * s; seg(P[an], toe);
  }
  // spine: a row of vertebrae along the same curve the body draws, ribs hanging off the upper ones
  const C = spineCtrl(k);
  const at = (q: number) => { const m = 1 - q; return v(m * m * P[2].x + 2 * m * q * C.x + q * q * P[1].x, m * m * P[2].y + 2 * m * q * C.y + q * q * P[1].y); };
  const sd = sub(P[1], P[2]); const sl = len(sd) || 1;
  const along = v(sd.x / sl, sd.y / sl); const front = v(-along.y * f, along.x * f); // toward his chest
  const hitQ = clamp(((pt.x - P[2].x) * along.x + (pt.y - P[2].y) * along.y) / sl, 0.5, 0.95);
  const ends: V[] = [];
  for (let i = 0; i <= 10; i++) {
    if (local && crack !== 1) break;
    const q = i / 10; const c = at(q);
    ctx.lineWidth = 2.5 * s;
    seg(v(c.x - front.x * 2.1 * s, c.y - front.y * 2.1 * s), v(c.x + front.x * 1.2 * s, c.y + front.y * 1.2 * s));
    if (i >= 5 && i <= 9) {
      const reach = (8.2 - Math.abs(i - 7) * 0.7) * s;
      const end = v(c.x + front.x * reach - along.x * 4.4 * s, c.y + front.y * reach - along.y * 4.4 * s);
      const ctl = v(c.x + front.x * reach * 1.05 + along.x * 1.2 * s, c.y + front.y * reach * 1.05 + along.y * 1.2 * s);
      const broken = crack === 1 && Math.abs(q - hitQ) < 0.11;
      ctx.lineWidth = 1.5 * s;
      if (!broken) { ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.quadraticCurveTo(ctl.x, ctl.y, end.x, end.y); ctx.stroke(); }
      else {
        // snapped: a stump on the spine, the front half knocked loose and turning
        seg(c, lerpV(c, ctl, 0.55));
        const off = v(front.x * 3 * s * t + along.x * (i % 2 ? 2 : -2) * s * t, front.y * 3 * s * t + 3 * s * t);
        seg(v(ctl.x + off.x, ctl.y + off.y), v(end.x + off.x * 1.6, end.y + off.y * 1.6));
      }
      ends.push(end);
    }
  }
  if (ends.length > 1) { ctx.lineWidth = 1.6 * s; seg(ends[0], ends[ends.length - 1]); } // sternum
  for (const q of [0.3, 0.6]) { // neck vertebrae
    if (local && crack !== 0) break;
    const c = lerpV(P[1], P[0], q);
    ctx.lineWidth = 2.2 * s; seg(v(c.x - fw.x * 1.7 * s, c.y - fw.y * 1.7 * s), v(c.x + fw.x * 1.2 * s, c.y + fw.y * 1.2 * s));
  }
  if (local && crack !== 0) return;
  ctx.lineWidth = 2.2 * s; // pelvis
  ctx.beginPath(); ctx.ellipse(P[2].x, P[2].y - 0.5 * s, 6 * s, 4.2 * s, Math.atan2(along.y, along.x) + Math.PI / 2, 0, Math.PI * 2); ctx.stroke();

  // skull, in the head's own frame: x toward the face, y toward the chin
  ctx.save();
  ctx.transform(fw.x, fw.y, -up.x, -up.y, P[0].x, P[0].y);
  ctx.scale(s, s);
  ctx.beginPath(); ctx.ellipse(-0.8, -1.6, 8.9, 8.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(1.5, 1); ctx.lineTo(8.3, 1.2); ctx.lineTo(8.7, 5.2); ctx.lineTo(6.4, 9.6); ctx.lineTo(0.4, 8.8); ctx.lineTo(-2, 4); ctx.closePath(); ctx.fill();
  const glow = ctx.shadowBlur; ctx.shadowBlur = 0;
  ctx.fillStyle = DARK; ctx.strokeStyle = DARK;
  ctx.beginPath(); ctx.ellipse(4.5, -1.1, 2.5, 2.9, 0.15, 0, Math.PI * 2); ctx.fill();          // eye socket
  ctx.beginPath(); ctx.moveTo(8.6, 1.4); ctx.lineTo(6.9, 3.4); ctx.lineTo(8.9, 3.6); ctx.closePath(); ctx.fill(); // nose
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(3.2, 6.3); ctx.lineTo(8.2, 5.8);                                   // teeth
  for (let i = 0; i < 4; i++) { ctx.moveTo(4.2 + i * 1.15, 5.3); ctx.lineTo(4.3 + i * 1.15, 7.2); }
  ctx.stroke();
  if (crack === 0) {
    // the fracture runs out from where the arrow went in
    let lx = ((pt.x - P[0].x) * fw.x + (pt.y - P[0].y) * fw.y) / s; let ly = ((pt.x - P[0].x) * -up.x + (pt.y - P[0].y) * -up.y) / s;
    const ll = Math.hypot(lx, ly); if (ll > 7.5) { lx *= 7.5 / ll; ly *= 7.5 / ll; }
    ctx.lineWidth = 1.15; ctx.lineJoin = 'miter';
    const grow = 0.35 + 0.65 * Math.min(1, t * 2.2);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.4 + Math.sin(i * 7.3) * 0.3; const L = (5 + (i % 3) * 2.6) * grow;
      const mx = lx + Math.cos(a) * L * 0.5 + Math.cos(a + 1.5) * 1.3; const my = ly + Math.sin(a) * L * 0.5 + Math.sin(a + 1.5) * 1.3;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(mx, my); ctx.lineTo(lx + Math.cos(a) * L, ly + Math.sin(a) * L); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(lx, ly, 1.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = glow;
  ctx.restore();
}

export type BowId = 'thunder' | 'fire' | 'wood' | 'spike' | 'poison' | 'gold' | 'legend';

/**
 * Natural, time-coherent plasma filament renderer (`drawBolt`).
 * Uses smooth harmonic waves instead of harsh random per-frame spikes so electrical arcs
 * flow organically and feel comfortable on the eyes.
 */
export function drawBolt(
  ctx: Ctx,
  a: V,
  b: V,
  spread = 6,
  segs = 6,
  coreCol = '#ffffff',
  glowCol = '#00e5ff',
  lw = 1.4,
  branch = false,
  seed = 0
) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L; const ny = dx / L;
  const N = Math.max(4, segs);
  const pts: V[] = [a];
  for (let i = 1; i < N; i++) {
    const u = i / N;
    const env = Math.sin(u * Math.PI);
    const w1 = Math.sin(seed * 0.45 + i * 2.3);
    const w2 = Math.cos(seed * 0.72 - i * 3.7);
    const offset = (w1 * 0.65 + w2 * 0.35) * spread * env;
    pts.push(v(a.x + dx * u + nx * offset, a.y + dy * u + ny * offset));
  }
  pts.push(b);

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const baseAlpha = ctx.globalAlpha;

  const traceSmooth = (points: V[], col: string, width: number, alpha: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.globalAlpha = baseAlpha * alpha;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) * 0.5;
      const my = (points[i].y + points[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  };

  // Soft outer cyan-blue aura + crisp white filament core
  traceSmooth(pts, glowCol, lw * 2.8, 0.28);
  traceSmooth(pts, glowCol, lw * 1.4, 0.65);
  traceSmooth(pts, coreCol, lw * 0.65, 0.95);

  if (branch && N >= 5) {
    const bi = Math.max(1, Math.min(N - 2, Math.floor(N * 0.5)));
    const bp = pts[bi];
    const side = Math.sin(seed * 0.3 + bi) >= 0 ? 1 : -1;
    const bEnd = v(
      bp.x + dx * 0.25 + nx * side * spread * 1.15,
      bp.y + dy * 0.25 + ny * side * spread * 1.15
    );
    const bMid = v(
      (bp.x + bEnd.x) * 0.5 + nx * Math.cos(seed * 0.5) * spread * 0.35,
      (bp.y + bEnd.y) * 0.5 + ny * Math.cos(seed * 0.5) * spread * 0.35
    );
    traceSmooth([bp, bMid, bEnd], glowCol, lw * 1.0, 0.48);
    traceSmooth([bp, bMid, bEnd], coreCol, lw * 0.45, 0.82);
  }
  ctx.restore();
}

/**
 * Natural Fluid-Simulation Flame Wisp (`drawSimFlame`):
 * Renders a smooth, buoyant teardrop flame tongue that sways gently with laminar/turbulent
 * thermal flow, without harsh flickering.
 */
export function drawSimFlame(
  ctx: Ctx,
  origin: V,
  ang: number,
  length: number,
  width: number,
  temp = 1,
  time = 0,
  seed = 0
) {
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.rotate(ang);
  const wv1 = Math.sin(time * 9.5 + seed * 3.1) * width * 0.28;
  const wv2 = Math.sin(time * 13.0 + seed * 5.7 - 1.1) * width * 0.45;
  const tipY = wv2 * 0.75;

  const grad = ctx.createLinearGradient(0, 0, length, tipY);
  if (temp > 0.72) {
    grad.addColorStop(0, 'rgba(255, 252, 235, 0.92)');
    grad.addColorStop(0.32, 'rgba(255, 215, 75, 0.82)');
    grad.addColorStop(0.7, 'rgba(255, 105, 15, 0.48)');
    grad.addColorStop(1, 'rgba(190, 25, 0, 0)');
  } else if (temp > 0.4) {
    grad.addColorStop(0, 'rgba(255, 225, 95, 0.82)');
    grad.addColorStop(0.42, 'rgba(255, 115, 18, 0.65)');
    grad.addColorStop(0.78, 'rgba(210, 35, 5, 0.32)');
    grad.addColorStop(1, 'rgba(110, 10, 0, 0)');
  } else {
    grad.addColorStop(0, 'rgba(255, 125, 22, 0.58)');
    grad.addColorStop(0.55, 'rgba(195, 30, 5, 0.3)');
    grad.addColorStop(1, 'rgba(70, 10, 5, 0)');
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-width * 0.3, 0);
  ctx.bezierCurveTo(
    length * 0.25, -width * 0.95 + wv1 * 0.35,
    length * 0.65, -width * 0.48 + wv2,
    length, tipY
  );
  ctx.bezierCurveTo(
    length * 0.65, width * 0.48 + wv2,
    length * 0.25, width * 0.95 + wv1 * 0.35,
    -width * 0.3, 0
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draws each Boss's unique signature weapon (`bossKind`):
 * - `axer` (Raja Viking): Heavy Viking Battle Axe (Kapak Perang Viking)
 * - `thunder_lord` (Kaisar Petir Zeus): Golden Thunderbolt Trident Spear (Trisula Halilintar Zeus)
 * - `inferno_king` (Raja Iblis Magma): Molten Demon Greatsword (Pedang Raksasa Iblis Magma)
 * - `xeno_queen` (Ratu Xenomorph Acid): Biomechanical Acid Tail-Scythe (Sabit Ekor Ratu Xenomorph)
 * - `thorn_warden` (Panglima Duri Zamrud): Spiked Briar Morning-Star Mace (Gada Bintang Duri Zamrud)
 *
 * When `embedded = true` (`nancep`), the weapon's biting blade/prongs/tip sit buried inside the target
 * bone or platform at `p` while the shaft/hilt sticks out!
 */
export function drawAxe(
  ctx: Ctx,
  p: V,
  ang: number,
  s: number,
  embedded = false,
  bossKind: BossId = 'axer',
  time = 0
) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const upAng = -Math.PI / 2 - ang;
  const downAng = Math.PI / 2 - ang;

  if (bossKind === 'thunder_lord') {
    // =========================================================================
    // BOS #2: KAISAR PETIR ZEUS — TRISULA HALILINTAR ZEUS (THUNDERBOLT TRIDENT)
    // =========================================================================
    if (embedded) ctx.translate(-29, 0); // Prongs (18..38) buried deep inside target

    // Golden-Cobalt Storm Shaft
    ctx.strokeStyle = '#092347'; ctx.lineWidth = 5.0;
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.stroke();
    ctx.strokeStyle = '#f5b82e'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(17, 0); ctx.stroke();
    // Glowing Cyan Tesla Rings on Shaft
    ctx.fillStyle = '#00f0ff';
    for (const rx of [-11, -3, 5]) {
      ctx.fillRect(rx - 1.2, -2.8, 2.4, 5.6);
    }
    // Pommel Lightning Spike
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.moveTo(-18, -3); ctx.lineTo(-24, 0); ctx.lineTo(-18, 3); ctx.closePath(); ctx.fill();

    // Olympian Golden Winged Crossguard at x = 15..19
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#6e4200'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.quadraticCurveTo(15, -10, 21, -13);
    ctx.lineTo(23, -8);
    ctx.quadraticCurveTo(18, -4, 19, 0);
    ctx.quadraticCurveTo(18, 4, 23, 8);
    ctx.lineTo(21, 13);
    ctx.quadraticCurveTo(15, 10, 14, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Outer Left & Right Jagged Lightning Prongs
    for (const sd of [-1, 1]) {
      ctx.fillStyle = '#00d9ff';
      ctx.beginPath();
      ctx.moveTo(19, sd * 4.5);
      ctx.lineTo(26, sd * 11.5);
      ctx.lineTo(28, sd * 8.2);
      ctx.lineTo(36, sd * 9.5);
      ctx.lineTo(29, sd * 4.2);
      ctx.lineTo(26, sd * 6.8);
      ctx.lineTo(20, sd * 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(26, sd * 9.5); ctx.lineTo(35, sd * 9.2); ctx.lineTo(28, sd * 5.5); ctx.closePath(); ctx.fill();
    }

    // Center Main Thunderbolt Spearhead
    if (!embedded) {
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.moveTo(18, -3.2); ctx.lineTo(28, -4.5); ctx.lineTo(26, -1.8); ctx.lineTo(40, 0);
      ctx.lineTo(26, 1.8); ctx.lineTo(28, 4.5); ctx.lineTo(18, 3.2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(20, -1.5); ctx.lineTo(38, 0); ctx.lineTo(20, 1.5); ctx.closePath(); ctx.fill();
    } else {
      // Base of prongs entering the wound
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(18, -2.5, 11, 5);
    }

    // Center Dynamo Core Orb
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(17, 0, 2.8, 0, Math.PI * 2); ctx.fill();

    if (time > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawBolt(ctx, v(28, -9), v(36, 0), 2.5, 4, '#ffffff', '#00f0ff', 1.1, false, time * 22);
      drawBolt(ctx, v(28, 9), v(36, 0), 2.5, 4, '#ffffff', '#00f0ff', 1.1, false, time * 22 + 4);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  if (bossKind === 'inferno_king') {
    // =========================================================================
    // BOS #3: RAJA IBLIS MAGMA — PEDANG RAKSASA IBLIS MAGMA (DEMON GREATSWORD)
    // =========================================================================
    if (embedded) ctx.translate(-26, 0); // Front half of greatsword blade buried in target

    // Obsidian Demon Hilt & Crimson Grip (`x: -16..2`)
    ctx.strokeStyle = '#1c0502'; ctx.lineWidth = 5.4;
    ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(3, 0); ctx.stroke();
    ctx.strokeStyle = '#9e1b0b'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(2, 0); ctx.stroke();
    // Demon Skull Pommel
    ctx.fillStyle = '#ff5500';
    ctx.beginPath(); ctx.moveTo(-15, -4); ctx.lineTo(-21, 0); ctx.lineTo(-15, 4); ctx.closePath(); ctx.fill();

    // Massive Serrated Magma Greatsword Blade (`x: 3..39`)
    ctx.fillStyle = '#2b0904';
    ctx.strokeStyle = '#ff6a00';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(3, -6.5);
    // Serrated saw-teeth along upper & lower edges
    ctx.lineTo(11, -8.5); ctx.lineTo(13, -5.8);
    ctx.lineTo(20, -8.2); ctx.lineTo(22, -5.5);
    ctx.lineTo(29, -7.2); ctx.lineTo(39, 0);
    ctx.lineTo(29, 7.2);
    ctx.lineTo(22, 5.5); ctx.lineTo(20, 8.2);
    ctx.lineTo(13, 5.8); ctx.lineTo(11, 8.5);
    ctx.lineTo(3, 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing Molten Lava Fuller Channel down the center of the blade
    ctx.strokeStyle = '#ffae19'; ctx.lineWidth = 3.0;
    ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(embedded ? 26 : 33, 0); ctx.stroke();
    ctx.strokeStyle = '#fff6a6'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(embedded ? 25 : 31, 0); ctx.stroke();

    // Swept Obsidian Demon-Horn Crossguard at `x: 3`
    ctx.fillStyle = '#1f0602'; ctx.strokeStyle = '#ff5100'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(1, 0);
    ctx.quadraticCurveTo(2, -11, 9, -15);
    ctx.quadraticCurveTo(6, -8, 6, -4);
    ctx.lineTo(6, 4);
    ctx.quadraticCurveTo(6, 8, 9, 15);
    ctx.quadraticCurveTo(2, 11, 1, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Molten Hellfire Gem in Crossguard
    ctx.fillStyle = '#fff066';
    ctx.beginPath(); ctx.arc(4, 0, 2.8, 0, Math.PI * 2); ctx.fill();

    if (time > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawSimFlame(ctx, v(18, 0), upAng, 14, 4.8, 0.78, time, 2.3);
      if (!embedded) drawSimFlame(ctx, v(29, 0), upAng, 12, 4.0, 0.92, time, 5.1);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  if (bossKind === 'xeno_queen') {
    // =========================================================================
    // BOS #4: RATU XENOMORPH ACID — SABIT EKOR XENOMORPH (BIOMECHANICAL SCYTHE)
    // =========================================================================
    if (embedded) ctx.translate(-18, 15); // Curved Xenomorph scythe-point buried deep in target

    // Segmented Biomechanical Chitin Spine-Shaft (`x: -11..22`)
    ctx.strokeStyle = '#0d1409'; ctx.lineWidth = 5.4;
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(22, 0); ctx.stroke();
    // Ribbed Exoskeleton Vertebra Nodes along the shaft
    ctx.fillStyle = '#293d10';
    for (const vx of [-7, -1, 5, 11, 17]) {
      ctx.beginPath(); ctx.ellipse(vx, 0, 2.4, 3.8, 0.2, 0, Math.PI * 2); ctx.fill();
    }
    // Glowing Pressurized Acid Tube along shaft
    ctx.strokeStyle = '#bfff00'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(21, 0); ctx.stroke();

    // Sweeping Curved Xenomorph Queen Tail-Scythe Blade
    ctx.fillStyle = '#111a08';
    ctx.strokeStyle = '#9dff00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, 2);
    ctx.quadraticCurveTo(31, 1, 33, -9);
    ctx.quadraticCurveTo(34, -21, 12, -25); // Lethal hooked reaper tip
    ctx.quadraticCurveTo(24, -15, 21, -7);
    ctx.quadraticCurveTo(19, -2, 15, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner Razor Acid Edge Gleam
    if (!embedded) {
      ctx.fillStyle = '#eaff66';
      ctx.beginPath();
      ctx.moveTo(12, -25);
      ctx.quadraticCurveTo(26, -18, 28, -9);
      ctx.quadraticCurveTo(23, -12, 12, -25);
      ctx.closePath();
      ctx.fill();
    }

    // Bioluminescent Pressurized Acid Sacs on Scythe Cheek
    for (const [sx, sy, sr] of [[23, -6, 2.6], [26, -12, 2.2], [21, -16, 1.8]]) {
      ctx.fillStyle = '#8cff00';
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2ff99';
      ctx.beginPath(); ctx.arc(sx - 0.5, sy - 0.5, sr * 0.45, 0, Math.PI * 2); ctx.fill();
    }

    // Gravity-accurate dripping molecular acid strand from scythe tip
    if (time > 0) {
      const cycle = (time * 1.7) % 1;
      const dropLen = 3 + cycle * 9;
      const dx = Math.cos(downAng) * dropLen; const dy = Math.sin(downAng) * dropLen;
      ctx.strokeStyle = '#a6ff00'; ctx.lineWidth = 1.4 * (1 - cycle * 0.4);
      ctx.beginPath(); ctx.moveTo(15, -21); ctx.lineTo(15 + dx, -21 + dy); ctx.stroke();
      ctx.fillStyle = '#eaff66';
      ctx.beginPath(); ctx.arc(15 + dx, -21 + dy, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (bossKind === 'thorn_warden') {
    // =========================================================================
    // BOS #5: PANGLIMA DURI ZAMRUD — GADA BINTANG DURI (BRIAR MORNING-STAR MACE)
    // =========================================================================
    if (embedded) ctx.translate(-25, 0); // Spiked Morning-Star head buried deep into target

    // Living Ironwood & Briar Vine Shaft (`x: -14..15`)
    ctx.strokeStyle = '#2d1a0e'; ctx.lineWidth = 5.4;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(15, 0); ctx.stroke();
    ctx.strokeStyle = '#2eb82e'; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-12, -2); ctx.quadraticCurveTo(-4, 4, 4, -2); ctx.quadraticCurveTo(10, -4, 15, 1);
    ctx.stroke();

    // Heavy Spiked Briar Morning-Star / Chakram Head centered at `(21, 0)`
    const cx = 21; const cy = 0;
    // 8 Radiating Emerald Briar Thorns around the Morning-Star sphere
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cos = Math.cos(a); const sin = Math.sin(a);
      const nx = -sin; const ny = cos;
      const rIn = 6.5; const rOut = i % 2 === 0 ? 16.5 : 13.5;
      ctx.fillStyle = i % 2 === 0 ? '#7dff24' : '#2eb82e';
      ctx.strokeStyle = '#0c3b10'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + cos * rIn - nx * 3.2, cy + sin * rIn - ny * 3.2);
      ctx.lineTo(cx + cos * rOut + nx * 1.2, cy + sin * rOut + ny * 1.2);
      ctx.lineTo(cx + cos * rIn + nx * 3.2, cy + sin * rIn + ny * 3.2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // Armored Briar Core Sphere
    ctx.fillStyle = '#174d1b'; ctx.strokeStyle = '#0a290c'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(cx, cy, 7.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Glowing Emerald Heart Gem
    ctx.fillStyle = '#9eff2e';
    ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx - 1, cy - 1, 1.3, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
    return;
  }

  // =========================================================================
  // BOS #1: RAJA VIKING KAPAK — KAPAK PERANG VIKING (HEAVY VIKING BATTLE AXE)
  // =========================================================================
  if (embedded) {
    // Shift so the biting edge of the Viking axe blade (21, -11) sits buried at `p`
    ctx.translate(-21, 11);
  }
  // Oak Haft with leather grip bands
  ctx.strokeStyle = '#3a2013'; ctx.lineWidth = 5.4; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(27, 0); ctx.stroke();
  ctx.strokeStyle = '#8b522c'; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(25, 0); ctx.stroke();
  ctx.strokeStyle = '#d49b56'; ctx.lineWidth = 5.5;
  for (const gx of [-4, 2, 13]) { ctx.beginPath(); ctx.moveTo(gx, -0.2); ctx.lineTo(gx + 1.2, 0.2); ctx.stroke(); }

  // Main heavy curved Viking war-blade
  ctx.fillStyle = '#5c6e78';
  ctx.beginPath();
  ctx.moveTo(13, -1.5);
  ctx.quadraticCurveTo(15, -13, 9, -20);
  ctx.quadraticCurveTo(23, -23, 33, -13);
  ctx.quadraticCurveTo(28, -6, 28, -1.5);
  ctx.closePath();
  ctx.fill();

  if (!embedded) {
    ctx.fillStyle = '#e6f4f8';
    ctx.beginPath();
    ctx.moveTo(10.8, -18.2);
    ctx.quadraticCurveTo(23, -21.5, 31.8, -13.2);
    ctx.quadraticCurveTo(23, -16, 14, -12.5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.strokeStyle = '#8c0d14'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(13, -10.5); ctx.lineTo(28, -10.5); ctx.stroke();
  }

  // Back spike
  ctx.fillStyle = '#5c6e78';
  ctx.beginPath(); ctx.moveTo(16, 1.5); ctx.lineTo(20, 11); ctx.lineTo(24, 1.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e6f4f8';
  ctx.beginPath(); ctx.moveTo(17.5, 4); ctx.lineTo(20, 10.5); ctx.lineTo(22.5, 4); ctx.closePath(); ctx.fill();

  // Glowing Norse rune on blade cheek
  ctx.strokeStyle = '#ff5238'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(18, -5.5); ctx.lineTo(22, -10); ctx.lineTo(19, -12); ctx.stroke();

  ctx.restore();
}

/**
 * Renders the Boss's held weapon during ready/wind-up (with wrist cocking & power-charge aura)
 * and a dynamic Crescent Slash Arc during the explosive hurl follow-through (`k.nock < 0.42`).
 */
export function drawBossHeldWeapon(ctx: Ctx, k: Stick, bossKind: BossId = 'axer', time = 0) {
  if (!k.alive) return;
  const s = k.s;
  const f = k.face;
  const accent =
    bossKind === 'thunder_lord' ? '#00f0ff'
    : bossKind === 'inferno_king' ? '#ff6a00'
    : bossKind === 'xeno_queen' ? '#cfff04'
    : bossKind === 'thorn_warden' ? '#6bff2b'
    : '#ff5238';

  // Phase B: Explosive Hurl Crescent Slash Trail (`k.nock` 0 -> 0.36 right after release)
  if (k.nock < 0.38) {
    const u = k.nock / 0.38;
    const al = (1 - u) * 0.85;
    const neck = k.p[1];
    ctx.save();
    ctx.translate(neck.x, neck.y);
    ctx.scale(f * s, s);
    ctx.globalAlpha = al;
    ctx.lineCap = 'round';
    const startA = -2.35 + u * 0.7;
    const endA = 0.45 + u * 0.45;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 7.5 * (1 - u * 0.5);
    ctx.beginPath();
    ctx.arc(2, -2, 34, startA, endA);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.8 * (1 - u * 0.5);
    ctx.beginPath();
    ctx.arc(2, -2, 34, startA + 0.15, endA);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Phase A: Ready, Draw from Hip, & Overhead Wind-Up (`k.nock >= 0.44`)
  if (k.nock < 0.44) return;
  const armAng = Math.atan2(k.p[4].y - k.p[3].y, k.p[4].x - k.p[3].x);
  const wristCock = -f * (0.22 + 0.52 * k.pull);
  const wAng = armAng + wristCock;

  // Wind-up power charge aura around the weapon head as `k.pull` approaches 1
  if (k.pull > 0.12) {
    const headPt = add(k.p[4], fromAngle(wAng, 22 * s));
    const pulse = 0.75 + 0.25 * Math.sin(time * 24);
    const r = (10 + 12 * k.pull) * s * pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k.pull * 0.65;
    const rg = ctx.createRadialGradient(headPt.x, headPt.y, 1, headPt.x, headPt.y, r);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.45, accent);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(headPt.x, headPt.y, r, 0, Math.PI * 2);
    ctx.fill();
    // Converging charge ring
    const ringR = (22 * (1 - ((time * 2.8) % 1))) * s;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = k.pull * ((time * 2.8) % 1) * 0.75;
    ctx.beginPath();
    ctx.arc(headPt.x, headPt.y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawAxe(ctx, k.p[4], wAng, s * 1.26, false, bossKind, time);
}

const cubic = (a: number, b: number, c: number, d: number, t: number) => {
  const m = 1 - t;
  return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d;
};

/**
 * Draws the equipped bow (`wood`, `thunder`, `fire`, `spike`, `poison`) with dynamic limb bending
 * and live elemental simulation effects on the bow and nocked arrow.
 */
export function drawBow(
  ctx: Ctx,
  grip: V,
  ang: number,
  s: number,
  nockDist: number | null,
  vib = 0,
  arrow = false,
  bowId: BowId = 'wood',
  time = 0
) {
  ctx.save();
  ctx.translate(grip.x, grip.y); ctx.rotate(ang); ctx.scale(s, s);
  const nd = nockDist === null ? BRACE - 2 : nockDist / s;
  const pull = Math.max(0, Math.min(1.15, (nd - BRACE) / DRAW));
  const tipX = -9 - 10 * pull; const tipY = 35 - 5 * pull;
  const nx = nockDist === null ? tipX + vib : -nd;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const palette: Record<BowId, [string, string, string, string, string]> = {
    wood: ['#632412', '#a84422', '#de7543', '#2e313d', '#ffffff'],
    thunder: ['#091e3a', '#1668c4', '#6cf0ff', '#ffd23f', '#9ef8ff'],
    fire: ['#2b0802', '#b82306', '#ff7b14', '#4a1205', '#ffcb52'],
    spike: ['#114214', '#28a428', '#8eff2b', '#4d2e18', '#baff75'],
        poison: ['#3b4a08', '#a89c14', '#33e05c', '#293318', '#9eff54'],
    gold: ['#8a5a00', '#ffc933', '#fff6c8', '#7a1016', '#fff3c4'],
    legend: ['#2a1a8a', '#8e7bff', '#f4f0ff', '#101a4a', '#bff8ff'],
  };
  const [cDark, cMid, cHi, cGrip, cStr] = palette[bowId] || palette.wood;

  for (const sd of [-1, 1]) {
    const X = (t: number) => cubic(1.5, 12, 6, tipX, t);
    const Y = (t: number) => sd * cubic(4, 13, 25, tipY, t);
    const run = (t0: number, t1: number, col: string, lw: number) => {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const t = t0 + ((t1 - t0) * i) / 10; if (i) ctx.lineTo(X(t), Y(t)); else ctx.moveTo(X(t), Y(t)); }
      ctx.stroke();
    };
    run(0, 1, cDark, 6.0);
    run(0.03, 0.97, cMid, 3.8);
    run(0.08, 0.92, cHi, 1.45);

    // Recurve flick at tip
    ctx.strokeStyle = cDark; ctx.lineWidth = 3.8;
    ctx.beginPath(); ctx.moveTo(tipX, sd * tipY); ctx.quadraticCurveTo(tipX + 1, sd * (tipY + 4), tipX + 6.5, sd * (tipY + 5.2)); ctx.stroke();

        if (bowId === 'gold') {
      // ruby-studded bands of darker gold, and a ruby at each tip
      run(0.3, 0.42, '#b8860b', 5.8); run(0.62, 0.72, '#b8860b', 5.4);
      for (const gt of [0.36, 0.67, 1]) {
        const gx = X(gt); const gy = Y(gt);
        ctx.fillStyle = '#7a0f12'; ctx.beginPath(); ctx.arc(gx, gy, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff4a4a'; ctx.beginPath(); ctx.arc(gx - 0.4, gy - 0.4, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    } else if (bowId === 'legend') {
      // star-crystal: feathers of light swept back off each limb, and a star at the tip that slowly pulses
      for (const lt of [0.34, 0.58, 0.82]) {
        const lx = X(lt); const ly = Y(lt);
        ctx.fillStyle = lt < 0.5 ? '#5cf4ff' : lt < 0.7 ? '#9d8cff' : '#ff7be5';
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(lx + 9, ly + sd * 2, lx + 13, ly + sd * 9); ctx.quadraticCurveTo(lx + 4, ly + sd * 5, lx - 2, ly + sd * 1); ctx.closePath(); ctx.fill();
      }
      const pr = 2.6 + Math.sin(time * 4 + sd) * 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(tipX - pr * 1.9, sd * tipY); ctx.lineTo(tipX, sd * tipY - pr * 0.7); ctx.lineTo(tipX + pr * 1.9, sd * tipY); ctx.lineTo(tipX, sd * tipY + pr * 0.7); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tipX, sd * tipY - pr * 1.9); ctx.lineTo(tipX + pr * 0.7, sd * tipY); ctx.lineTo(tipX, sd * tipY + pr * 1.9); ctx.lineTo(tipX - pr * 0.7, sd * tipY); ctx.closePath(); ctx.fill();
    } else if (bowId === 'wood') {
      // White cloth bandage wraps on limbs like Image 1's Wood Bow
      run(0.28, 0.52, '#d8e2e8', 5.8);
      run(0.31, 0.49, '#ffffff', 4.4);
    } else if (bowId === 'thunder') {
      // Golden/cyan Tesla coils on limbs
      for (const ct of [0.35, 0.72]) {
        const cx = X(ct); const cy = Y(ct);
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9ef8ff';
        ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    } else if (bowId === 'fire') {
      // Fiery magma horns & flickering flame fins along limbs
      for (const ft of [0.32, 0.62, 0.88]) {
        const fx = X(ft); const fy = Y(ft);
        const flk = Math.sin(time * 18 + ft * 11 + sd) * 2.2;
        ctx.fillStyle = '#ff5100';
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + 8, fy + sd * 3, fx + 5 + flk, fy + sd * 9); ctx.quadraticCurveTo(fx + 1, fy + sd * 4, fx - 2, fy); ctx.fill();
        ctx.fillStyle = '#ffd942';
        ctx.beginPath(); ctx.arc(fx + 1, fy + sd * 1.5, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    } else if (bowId === 'spike') {
      // Emerald briar thorns protruding along limbs like Image 1's Spike Fuze
      for (const st of [0.26, 0.52, 0.78]) {
        const sx = X(st); const sy = Y(st);
        ctx.fillStyle = '#7dff24';
        ctx.beginPath(); ctx.moveTo(sx + 1, sy); ctx.lineTo(sx + 7.5, sy + sd * 4.5); ctx.lineTo(sx - 1.5, sy + sd * 3); ctx.closePath(); ctx.fill();
      }
    } else if (bowId === 'poison') {
      // Golden armor plates & Xenomorph bioluminescent acid glands
      run(0.22, 0.48, '#ffd23f', 5.6);
      for (const vt of [0.42, 0.74]) {
        const vx = X(vt); const vy = Y(vt);
        ctx.fillStyle = '#80ff00';
        ctx.beginPath(); ctx.arc(vx + 2, vy, 3.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e5ff66';
        ctx.beginPath(); ctx.arc(vx + 2, vy, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Center riser / grip
  ctx.strokeStyle = cGrip; ctx.lineWidth = 7.2;
  ctx.beginPath(); ctx.moveTo(1.5, -6.2); ctx.lineTo(1.5, 6.2); ctx.stroke();

  // Bowstring
  ctx.strokeStyle = cStr; ctx.lineWidth = bowId === 'thunder' || bowId === 'fire' ? 1.8 : 1.45;
  ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(nx, 0); ctx.lineTo(tipX, tipY); ctx.stroke();

  // Subtle, natural Level-1 elemental energy on the bow itself, aligned with true world gravity
  const upAng = -Math.PI / 2 - ang;   // True world UP in bow-local space
  const downAng = Math.PI / 2 - ang;  // True world DOWN in bow-local space

  if (bowId === 'thunder' && pull > 0.05) {
    // Gentle plasma filament charging along the drawn arrow as tension increases
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.85, pull * 0.9);
    const tipLocal = v(-nd + ARROW_LEN - 3, 0);
    drawBolt(ctx, v(1.5, 0), tipLocal, 3.5 * pull, 5, '#ffffff', '#00e5ff', 0.9 + pull * 0.4, false, time * 16);
    ctx.restore();
  } else if (bowId === 'fire') {
    // Soft ember glow at the volcanic riser core, rising naturally upward against gravity
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.65 + 0.25 * pull;
    drawSimFlame(ctx, v(2, 0), upAng, 8 + pull * 6, 3.2 + pull * 1.2, 0.75, time, 1.5);
    ctx.restore();
  } else if (bowId === 'poison') {
    // Gravity-accurate Xenomorph acid drop hanging straight DOWN from the lower limb gland
    ctx.save();
    const cycle = (time * 1.5) % 1;
    const dropLen = 3 + cycle * 9;
    const gx = 6; const gy = 22;
    const dx = Math.cos(downAng) * dropLen; const dy = Math.sin(downAng) * dropLen;
    ctx.globalAlpha = 1 - cycle * 0.65;
    ctx.strokeStyle = '#9dff00'; ctx.lineWidth = 1.3 * (1 - cycle * 0.4);
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + dx, gy + dy); ctx.stroke();
    ctx.fillStyle = '#e5ff66';
    ctx.beginPath(); ctx.arc(gx + dx, gy + dy, 1.7 * (1 - cycle * 0.25), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.restore();
  if (arrow) {
    const tip = add(grip, fromAngle(ang, (-nd + ARROW_LEN) * s));
    drawArrow(ctx, tip, ang, s, false, bowId, time, false);
  }
}

export const ARROW_LEN = 48;
/** the colours of one arrow: its shaft, vanes, cresting bands, and mirror-faceted razor broadhead */
interface ArrowSkin {
  lit: string;
  shaft: string;
  dark: string;
  vane: string;
  vaneDark: string;
  crest: string;
  /** bright mirror-lit upper bevel, mid metallic body, deep shaded lower bevel, dark keyline, and socket binding */
  headLit: string;
  head: string;
  headDark: string;
  headKey: string;
  bind: string;
}

const ARROW_SKINS: Record<BowId, ArrowSkin> = {
  wood: {
    lit: '#ffdc90', shaft: '#f5a92f', dark: '#b9741a', vane: '#e5352f', vaneDark: '#a81d19', crest: '#ffffff',
    headLit: '#f6fbff', head: '#b8c8d1', headDark: '#60727d', headKey: '#1d2930', bind: '#5a3215',
  },
  thunder: {
    lit: '#ffffff', shaft: '#7df4ff', dark: '#2aa9d6', vane: '#00aaff', vaneDark: '#0668b8', crest: '#ffd23f',
    headLit: '#ffffff', head: '#5cf0ff', headDark: '#0b78b8', headKey: '#042742', bind: '#ffd23f',
  },
  fire: {
    lit: '#ffb25a', shaft: '#e8741e', dark: '#9c3a0a', vane: '#e53517', vaneDark: '#8f1408', crest: '#ffcb52',
    headLit: '#ffe29e', head: '#c94a18', headDark: '#591808', headKey: '#240702', bind: '#2b0802',
  },
  spike: {
    lit: '#7a4c2c', shaft: '#4e2f1d', dark: '#2a170c', vane: '#44d62c', vaneDark: '#1f8a1c', crest: '#8eff2b',
    headLit: '#ecffd4', head: '#6ce62e', headDark: '#1f8018', headKey: '#0b2e08', bind: '#28a428',
  },
  poison: {
    lit: '#5d7d18', shaft: '#364d0a', dark: '#1c2a04', vane: '#9eff00', vaneDark: '#4f9a00', crest: '#ffd23f',
    headLit: '#f7ffbd', head: '#90eb00', headDark: '#367d00', headKey: '#142e00', bind: '#a89c14',
  },
  gold: {
    lit: '#fff6c8', shaft: '#ffc933', dark: '#b8860b', vane: '#fff3c4', vaneDark: '#e0a91e', crest: '#e5352f',
    headLit: '#ffffff', head: '#ffd642', headDark: '#b37400', headKey: '#4a2c00', bind: '#8a5a00',
  },
  legend: {
    lit: '#ffffff', shaft: '#efeaff', dark: '#9d8cff', vane: '#8e7bff', vaneDark: '#4a35c9', crest: '#5cf4ff',
    headLit: '#ffffff', head: '#dcd4ff', headDark: '#6f5ce0', headKey: '#221659', bind: '#ffd23f',
  },
};

/**
 * Draws the arrow matching `bowId` at its classic sturdy proportions, with ZERO blurry tip glow —
 * instead featuring a crisp, razor-sharp, mirror-faceted metallic broadhead with honed white cutting edges,
 * recessed center fuller, and a gleaming specular sheen across the blade!
 */
export function drawArrow(
  ctx: Ctx,
  tip: V,
  ang: number,
  s = 1,
  embedded = false,
  bowId: BowId = 'wood',
  time = 0,
  inFlight = true
) {
  const sk = ARROW_SKINS[bowId] ?? ARROW_SKINS.wood;
  ctx.save();
  ctx.translate(tip.x, tip.y); ctx.rotate(ang); ctx.scale(s, s);
  const L = ARROW_LEN;
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';

  const upAng = -Math.PI / 2 - ang;
  const downAng = Math.PI / 2 - ang;
  const x1 = embedded ? -0.5 : -8.2;

  // Classic sturdy round shaft: shaded underside, rich body, crisp top highlight
  ctx.strokeStyle = sk.dark; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-L + 1, 0.3); ctx.lineTo(x1, 0.3); ctx.stroke();
  ctx.strokeStyle = sk.shaft; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(-L + 1, -0.1); ctx.lineTo(x1, -0.1); ctx.stroke();
  ctx.strokeStyle = sk.lit; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-L + 3, -0.78); ctx.lineTo(x1 - 1, -0.78); ctx.stroke();

  if (bowId === 'spike') {
    ctx.fillStyle = sk.vane;
    for (const [x, sd] of [[-33, -1], [-25, 1], [-17, -1]]) {
      ctx.beginPath(); ctx.moveTo(x - 2, sd * 1.2); ctx.lineTo(x + 1.5, sd * 4.6); ctx.lineTo(x + 2.6, sd * 1.2); ctx.closePath(); ctx.fill();
    }
  }

  // Nock and two cresting bands in front of the vanes
  ctx.fillStyle = sk.vaneDark; ctx.fillRect(-L - 1.2, -1.75, 3, 3.5);
  ctx.fillStyle = sk.crest; ctx.fillRect(-L + 15.4, -1.7, 1.5, 3.4); ctx.fillRect(-L + 18.2, -1.7, 1, 3.4);

  // Full swept parabolic fletching vanes
  ctx.lineJoin = 'round';
  for (const sd of [-1, 1]) {
    if (bowId === 'legend') {
      const vg = ctx.createLinearGradient(-L - 3, 0, -L + 14, 0);
      vg.addColorStop(0, '#5cf4ff'); vg.addColorStop(0.55, sd < 0 ? '#9d8cff' : '#6a55e0'); vg.addColorStop(1, '#ff7be5');
      ctx.fillStyle = vg;
    } else ctx.fillStyle = sd < 0 ? sk.vane : sk.vaneDark;
    ctx.beginPath();
    ctx.moveTo(-L + 13.6, sd * 0.9);
    ctx.quadraticCurveTo(-L + 8.6, sd * 5.7, -L + 1.4, sd * 5.5);
    ctx.lineTo(-L - 2.8, sd * 4.2);
    ctx.lineTo(-L + 0.6, sd * 0.9);
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.24)'; ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (const sd of [-1, 1]) {
    for (const [fx, top] of [[3.4, 4.9], [7, 4.5], [10.4, 3.2]]) { ctx.moveTo(-L + fx, sd * 1.1); ctx.lineTo(-L + fx - 2.6, sd * top); }
  }
  ctx.stroke();
  ctx.strokeStyle = sk.vane; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(-L + 0.6, 0); ctx.lineTo(-L + 13, 0); ctx.stroke();

  if (bowId === 'gold') {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const tw = Math.max(0, Math.sin(time * 4.2 + i * 2.1)) ** 5;
      if (tw < 0.05) continue;
      const x = -L + 9 + i * 13; const y = i % 2 ? -3 : 3; const r = 3.2 * tw;
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // ==================== GLEAMING RAZOR-SHARP METALLIC BROADHEAD (NO BLURRY GLOW!) ====================
  if (!embedded) {
    // Bound metallic collar socket
    ctx.fillStyle = sk.headKey; ctx.fillRect(-12.2, -2.1, 4.4, 4.2);
    ctx.fillStyle = sk.bind; ctx.fillRect(-11.8, -1.75, 3.7, 3.5);
    ctx.fillStyle = sk.lit; ctx.fillRect(-11.1, -1.75, 0.75, 3.5); ctx.fillRect(-9.5, -1.75, 0.75, 3.5);

    /**
     * Forged 4-facet diamond-bevel broadhead with razor-honed mirror bevels,
     * dark steel keyline, recessed blood-groove fuller, and an animated metallic sheen band!
     */
    const blade = (tipX: number, wide: number, back: number) => {
      const barbX = back - 2.2;
      const shX = back + 2.0;
      const neckX = back + 0.9;

      const traceHead = () => {
        ctx.beginPath();
        ctx.moveTo(tipX, 0);
        ctx.lineTo(shX, -wide);
        ctx.lineTo(barbX, -wide * 0.86);
        ctx.lineTo(neckX, -1.35);
        ctx.lineTo(neckX, 1.35);
        ctx.lineTo(barbX, wide * 0.86);
        ctx.lineTo(shX, wide);
        ctx.closePath();
      };

      // 1. Crisp dark metallic keyline so the razor silhouette pops sharply against any sky!
      ctx.save();
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 6;
      traceHead();
      ctx.strokeStyle = sk.headKey;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 2. Upper-outer mirror-polished bevel (catches bright sky light)
      const ug = ctx.createLinearGradient(back, -wide, tipX, 0);
      ug.addColorStop(0, sk.head);
      ug.addColorStop(0.55, sk.headLit);
      ug.addColorStop(1, '#ffffff');
      ctx.fillStyle = ug;
      ctx.beginPath();
      ctx.moveTo(tipX, 0);
      ctx.lineTo(shX, -wide);
      ctx.lineTo(barbX, -wide * 0.86);
      ctx.lineTo(neckX, -1.35);
      ctx.lineTo(neckX, 0);
      ctx.closePath();
      ctx.fill();

      // 3. Lower-outer deep metallic bevel (high-contrast shadow side for 3D steel sharpness)
      const dg = ctx.createLinearGradient(back, 0, tipX, wide);
      dg.addColorStop(0, sk.headDark);
      dg.addColorStop(0.7, sk.head);
      dg.addColorStop(1, sk.headLit);
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.moveTo(tipX, 0);
      ctx.lineTo(neckX, 0);
      ctx.lineTo(neckX, 1.35);
      ctx.lineTo(barbX, wide * 0.86);
      ctx.lineTo(shX, wide);
      ctx.closePath();
      ctx.fill();

      // 4. Inner recessed central fuller / bevel facet + crisp center spine ridge
      ctx.fillStyle = sk.headDark;
      ctx.beginPath();
      ctx.moveTo(tipX - 2.6, 0);
      ctx.lineTo(neckX + 0.4, -1.45);
      ctx.lineTo(neckX + 1.2, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = sk.head;
      ctx.beginPath();
      ctx.moveTo(tipX - 2.6, 0);
      ctx.lineTo(neckX + 1.2, 0);
      ctx.lineTo(neckX + 0.4, 1.45);
      ctx.closePath();
      ctx.fill();

      // 5. Moving diagonal specular metallic glint sweeping across the polished steel face!
      ctx.save();
      traceHead();
      ctx.clip();
      const sweep = ((time * 1.35) % 1.8) - 0.4; // sweeps periodically from socket to tip
      const gx = back + (tipX - back) * sweep;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.beginPath();
      ctx.moveTo(gx - 2.4, -wide - 2);
      ctx.lineTo(gx + 0.4, -wide - 2);
      ctx.lineTo(gx + 3.2, wide + 2);
      ctx.lineTo(gx + 0.4, wide + 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 6. Razor-honed pure white upper cutting edge & central spine needle-line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(tipX, 0);
      ctx.lineTo(shX, -wide + 0.35);
      ctx.lineTo(barbX + 0.5, -wide * 0.84);
      ctx.stroke();

      ctx.strokeStyle = sk.headLit;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(tipX, 0);
      ctx.lineTo(neckX + 0.6, 0);
      ctx.moveTo(tipX, 0);
      ctx.lineTo(shX, wide - 0.4);
      ctx.stroke();
      ctx.restore();
    };

    if (bowId === 'thunder') {
      // Crisp cyan-chrome broadhead with sharp electric micro-arc along shaft (NO blurry glow ball!)
      drawBolt(ctx, v(-16, 0), v(1.5, 0), 2.1, 5, '#ffffff', '#00e5ff', 0.95, false, time * 18);
      blade(4.6, 4.5, -7.4);
    } else if (bowId === 'fire') {
      // Forged magma-steel broadhead + clean tongue of flame (NO circular glow halo!)
      blade(4.0, 4.2, -7.2);
      const flameAng = inFlight
        ? Math.atan2(Math.sin(upAng) * 0.32, -1 + Math.cos(upAng) * 0.32)
        : upAng;
      const flameLen = inFlight ? 16 : 12;
      const flameWid = inFlight ? 4.0 : 3.5;
      ctx.save();
      drawSimFlame(ctx, v(-3.5, 0), flameAng, flameLen, flameWid, 0.7, time, 1.3);
      ctx.restore();
    } else if (bowId === 'spike') {
      blade(4.4, 4.6, -7.4);
      ctx.fillStyle = sk.head;
      ctx.strokeStyle = sk.headKey;
      ctx.lineWidth = 1.0;
      ctx.beginPath(); ctx.moveTo(-5.2, 3.8); ctx.lineTo(-11.4, 6.2); ctx.lineTo(-7.6, 2.2); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (bowId === 'poison') {
      blade(4.4, 4.3, -7.2);
      const dripAmt = inFlight ? 3.4 : 4.4 + Math.sin(time * 7) * 1.4;
      const dropDir = inFlight ? Math.atan2(Math.sin(downAng) * 0.6, -0.8 + Math.cos(downAng) * 0.6) : downAng;
      const dx = Math.cos(dropDir) * dripAmt; const dy = Math.sin(dropDir) * dripAmt;
      ctx.strokeStyle = '#9dff00'; ctx.lineWidth = 1.35;
      ctx.beginPath(); ctx.moveTo(-2, 0.8); ctx.lineTo(-2 + dx, 0.8 + dy); ctx.stroke();
      ctx.fillStyle = '#eaff66';
      ctx.beginPath(); ctx.arc(-2 + dx, 0.8 + dy, 1.6, 0, Math.PI * 2); ctx.fill();
    } else if (bowId === 'gold') {
      blade(4.8, 4.7, -7.4);
      ctx.fillStyle = '#7a0f12'; ctx.beginPath(); ctx.moveTo(-9.9, 0); ctx.lineTo(-8, -2.2); ctx.lineTo(-6.1, 0); ctx.lineTo(-8, 2.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff4a4a'; ctx.beginPath(); ctx.moveTo(-9.3, 0); ctx.lineTo(-8, -1.5); ctx.lineTo(-6.7, 0); ctx.lineTo(-8, 1.5); ctx.closePath(); ctx.fill();
    } else if (bowId === 'legend') {
      // Faceted star-crystal wings & mirror-sharp diamond point (NO blurry glow ball!)
      ctx.fillStyle = '#8e7bff';
      ctx.strokeStyle = sk.headKey;
      ctx.lineWidth = 1.0;
      for (const sd of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(-6.2, sd * 1.2); ctx.lineTo(-14.6, sd * 7.0); ctx.lineTo(-9.4, sd * 1.2); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      blade(5.8, 4.4, -8.6);
      ctx.fillStyle = '#5cf4ff'; ctx.beginPath(); ctx.arc(-8, 0, 1.5, 0, Math.PI * 2); ctx.fill();
    } else {
      blade(4.5, 4.5, -7.2);
    }
  }
  ctx.restore();
}
