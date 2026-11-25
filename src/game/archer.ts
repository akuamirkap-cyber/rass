import {
  Ctx, V, v, add, sub, mul, dist, lerp, lerpV, clamp, fromAngle, rot, seg, ease, ik,
  cap, capShade, limb, circle, shape, stroke, headPath,
} from './util';
import { BRACE, MAX_DRAW, drawArrow, drawBow } from './gear';

const MAIL = '#8b949e';
const MAIL_DARK = '#5f6873';
const PLATE = '#aeb6c0';
const LEATHER = '#5c3b1e';

export type ArcherPhase = 'idle' | 'grab' | 'nock' | 'ready' | 'release' | 'recover' | 'win' | 'lose';
export const DUR: Record<string, number> = { grab: 1.25, nock: 1.5, recover: 0.45 };
/** how long the follow-through is held before the next arrow may be fetched */
export const RELEASE_HOLD = 0.25;
export const AIM_MIN = -1.5; // almost straight up
export const AIM_MAX = 0.95; // steeply down
/** shooting stance: ankle offsets from the body centre, and ankle height above the floor */
export const STANCE = { back: -21, front: 23, ankle: 10 };

export interface ArcherState {
  x: number;
  ground: number;
  phase: ArcherPhase;
  t: number; // seconds spent in the current phase
  time: number; // global clock (breathing)
  aim: number; // smoothed aim angle
  pull: number; // px of string pull (spring simulated after release)
  vib: number; // string blur amount
  relAim: number; // snapshot taken at the release instant
  relPull: number;
  kick: number; // bow rolling in the hand (spring, rad) – lives across phases
  recoil: number; // torso recoil (spring, rad)
  quiver: number; // arrows currently available (incl. the one in hand)
  vx: number; // walking speed, only used for a touch of body lean
  footB: V; // ankles – planted in world space by the engine so steps never slide
  footF: V;
  rotB: number; // foot pitch while a step is in the air
  rotF: number;
  e0: number; // how far the bow had already been lowered (0..1) when the round ended
  duck: number; // px the hips are lowered (crouch / tuck)
  team: 0 | 1; // 1 = the duel opponent (different shirt and hair)
  gear?: number; // scale of bow and arrows (the mini-bow level)
  look?: Look; // story mode: every enemy has his own colours and accessories
  weapon?: 'bow' | 'sword' | 'axe' | 'mace' | 'none'; // melee soldiers carry no bow; 'none' = empty-handed (dropped it)
  swing?: number; // sword: 0 hanging, 1 raised, 2 struck
  axeThrown?: boolean; // the thrower's hand is empty until he draws the next axe
}

export type Hat = 'none' | 'cap' | 'band' | 'helmet' | 'beanie' | 'crown' | 'nasal' | 'kettle' | 'coif' | 'greathelm';
export interface Look {
  shirt: string; hair: string; hairDark: string; skin: string; skinFar: string;
  jeans: string; jeansFar: string; shoe: string; shoeFar: string;
  hat: Hat; hatColor: string; beard: boolean; glasses: boolean;
  armor?: 'none' | 'mail' | 'plate'; emblem?: number; plume?: boolean; shield?: boolean; tower?: boolean;
}
export const DEFAULT_LOOK: Look = {
  shirt: '#d8363c', hair: '#6b4a36', hairDark: '#523727', skin: '#e3b286', skinFar: '#cd9b70',
  jeans: '#31566b', jeansFar: '#274657', shoe: '#3f76c8', shoeFar: '#3363ab', hat: 'none', hatColor: '#1f2937', beard: false, glasses: false,
};
const SHIRTS = ['#7c3aed', '#0ea5e9', '#16a34a', '#f59e0b', '#db2777', '#0f766e', '#ea580c', '#4f46e5', '#64748b', '#b91c1c'];
const HAIRS: [string, string][] = [['#26211f', '#141110'], ['#6b4a36', '#523727'], ['#c2410c', '#9a3412'], ['#e5e7eb', '#9ca3af'], ['#fbbf24', '#d97706'], ['#1e3a8a', '#172554']];
const SKINS: [string, string][] = [['#e3b286', '#cd9b70'], ['#c88f64', '#b17a51'], ['#f1c9a5', '#dcae88'], ['#8d5a3b', '#73462c'], ['#a9744f', '#8f5f3f']];
const JEANS: [string, string][] = [['#31566b', '#274657'], ['#3b3f4a', '#2e313a'], ['#5b3a29', '#45291b'], ['#374151', '#1f2937'], ['#166534', '#14532d']];
const SHOES: [string, string][] = [['#3f76c8', '#3363ab'], ['#f1f3f5', '#d5d9df'], ['#1f2937', '#111827'], ['#dc2626', '#991b1b'], ['#f59e0b', '#b45309']];
const HATS: Hat[] = ['none', 'none', 'cap', 'band', 'helmet', 'beanie'];
/** a deterministic look for enemy number `seed` */
export function randomLook(seed: number): Look {
  let x = (seed * 9301 + 49297) % 233280;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const [hair, hairDark] = pick(HAIRS); const [skin, skinFar] = pick(SKINS);
  const [jeans, jeansFar] = pick(JEANS); const [shoe, shoeFar] = pick(SHOES);
  return {
    shirt: pick(SHIRTS), hair, hairDark, skin, skinFar, jeans, jeansFar, shoe, shoeFar,
    hat: pick(HATS), hatColor: pick(['#1f2937', '#dc2626', '#2563eb', '#f59e0b', '#16a34a', '#f8fafc']), beard: rnd() < 0.3, glasses: rnd() < 0.22,
  };
}
const TABARDS = ['#9f1239', '#1e3a8a', '#166534', '#1f2937', '#92400e', '#5b21b6', '#0f766e', '#7f1d1d'];
/** medieval men-at-arms: mail or plate, a tabard in the company colour, helmets - archers get the mail coif or kettle hat */
export function armyLook(seed: number, sword = false): Look {
  const base = randomLook(seed);
  let x = (seed * 7919 + 13) % 10007;
  const rnd = () => { x = (x * 7919 + 13) % 10007; return x / 10007; };
  const shirt = TABARDS[Math.floor(rnd() * TABARDS.length)];
  const officer = rnd() < 0.18;
  const hat: Hat = sword ? (officer ? 'greathelm' : rnd() < 0.5 ? 'nasal' : 'kettle') : officer ? 'nasal' : rnd() < 0.55 ? 'coif' : 'kettle';
  return {
    ...base, shirt, jeans: '#3f3a36', jeansFar: '#2b2724', shoe: '#3b2a1a', shoeFar: '#271b10',
    hat, hatColor: '#9aa3ad', glasses: false, beard: rnd() < 0.45,
    armor: sword ? 'plate' : 'mail', emblem: Math.floor(rnd() * 4), plume: officer, shield: sword,
  };
}
function pauldron(ctx: Ctx, at: V, plate: boolean) {
  circle(ctx, add(at, v(0, 1)), 10, plate ? PLATE : MAIL_DARK);
  circle(ctx, add(at, v(-1, -1)), 7, plate ? '#d5dae0' : MAIL);
  circle(ctx, at, 1.8, '#3f3f46');
}
/** metal shin guard over the lower leg */
function greave(ctx: Ctx, knee: V, ank: V) {
  cap(ctx, lerpV(knee, ank, 0.18), lerpV(knee, ank, 0.9), 9.6, 8.4, PLATE);
  capShade(ctx, lerpV(knee, ank, 0.18), lerpV(knee, ank, 0.9), 9.6, 8.4, 0.25);
  stroke(ctx, [lerpV(knee, ank, 0.35), lerpV(knee, ank, 0.7)], '#e5e7eb', 1.2);
}
/** the company badge on the tabard, in the torso's local frame (0,0 = neck) */
function emblem(ctx: Ctx, kind: number, y: number) {
  ctx.fillStyle = '#f5e6c8';
  if (kind === 0) { ctx.fillRect(-1.6, y - 7, 3.2, 14); ctx.fillRect(-6, y - 2.4, 12, 3.2); } // cross
  else if (kind === 1) { ctx.beginPath(); ctx.moveTo(-6, y + 5); ctx.lineTo(0, y - 6); ctx.lineTo(6, y + 5); ctx.lineTo(3.2, y + 5); ctx.lineTo(0, y - 0.5); ctx.lineTo(-3.2, y + 5); ctx.closePath(); ctx.fill(); } // chevron
  else if (kind === 2) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 2.8 : 6.5; const a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); } // star
  else { ctx.beginPath(); ctx.arc(0, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(0, y, 3, 0, Math.PI * 2); ctx.fill(); } // roundel
}
export const ARMOR_COLORS = { MAIL, MAIL_DARK, PLATE, LEATHER };
export { pauldron as drawPauldron, greave as drawGreave, emblem as drawEmblem };
export function drawShield(ctx: Ctx, at: V, color: string, emb: number) {
  ctx.save();
  ctx.translate(at.x, at.y);
  circle(ctx, v(0, 0), 21, '#4b3621');
  circle(ctx, v(0, 0), 18, color);
  ctx.strokeStyle = '#d6b36a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
  emblem(ctx, emb, 0);
  circle(ctx, v(0, 0), 4.5, '#9aa3ad');
  ctx.restore();
}
/** arm positions of a sword soldier for a given swing (0 carry, 1 raised, 2 struck) - shared by drawing and hit tests */
export function swordArms(p: ArcherPose, swing: number, frontSwing = swing) {
  const sw = clamp(swing, 0, 2);
  const fs = clamp(frontSwing, 0, 2);
  const armAng = sw <= 1 ? lerp(0.25, -1.95, sw) : lerp(-1.95, 0.95, sw - 1);
  const rear = ik(p.Sr, add(p.Sr, fromAngle(armAng, 66)), UA, FA, sw > 1 ? -1 : 1);
  const swordAng = sw <= 1 ? lerp(-0.45, -2.75, sw) : lerp(-2.75, 1.15, sw - 1);
  const front = ik(p.Sf, add(p.Sf, fromAngle(fs <= 1 ? lerp(1.0, 1.9, fs) : lerp(1.9, 0.6, fs - 1), 58)), UA, FA, 1);
  return { rear, front, swordAng };
}
/** a tall pavise: covers a man from shin to shoulder */
export function drawTowerShield(ctx: Ctx, at: V, color: string, emb: number) {
  ctx.save();
  ctx.translate(at.x, at.y);
  shape(ctx, (q) => { q.moveTo(-18, 56); q.lineTo(-18, -40); q.quadraticCurveTo(0, -62, 18, -40); q.lineTo(18, 56); q.closePath(); }, '#4b3621');
  shape(ctx, (q) => { q.moveTo(-14, 52); q.lineTo(-14, -38); q.quadraticCurveTo(0, -56, 14, -38); q.lineTo(14, 52); q.closePath(); }, color);
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(-14, -38, 7, 90);
  stroke(ctx, [v(-14, 10), v(14, 10)], '#d6b36a', 2.5, 'butt');
  for (const yy of [-30, 40]) { ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(0, yy, 2.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.save(); ctx.translate(0, -12); ctx.scale(1.3, 1.3); emblem(ctx, emb, 0); ctx.restore();
  ctx.restore();
}
/** throwing axe: short haft, broad bearded blade (blade toward +x) */
export function drawAxe(ctx: Ctx, hand: V, ang: number) {
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(ang);
  shape(ctx, (q) => q.roundRect(-16, -2.4, 46, 4.8, 2), '#5b3a21');
  stroke(ctx, [v(-12, 0), v(-6, 0)], '#2b1a12', 2);
  shape(ctx, (q) => { q.moveTo(24, -4); q.lineTo(30, -18); q.quadraticCurveTo(46, -10, 46, 12); q.lineTo(30, 14); q.lineTo(24, 4); q.closePath(); }, '#aeb6c0');
  stroke(ctx, [v(44, -7), v(44, 9)], '#f1f3f5', 1.5);
  ctx.restore();
}
export function drawSword(ctx: Ctx, hand: V, ang: number) {
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(ang);
  shape(ctx, (q) => q.roundRect(-9, -2.6, 18, 5.2, 2), '#5b3a21'); // grip, the fist sits on its middle
  circle(ctx, v(-11, 0), 3.6, '#b45309'); // pommel
  shape(ctx, (q) => q.roundRect(9, -9, 4.5, 18, 1.5), '#374151'); // crossguard
  shape(ctx, (q) => { q.moveTo(13.5, -3.4); q.lineTo(72, -2.4); q.lineTo(82, 0); q.lineTo(72, 2.4); q.lineTo(13.5, 3.4); q.closePath(); }, '#cbd5e1'); // blade
  stroke(ctx, [v(15, 0), v(70, 0)], '#f8fafc', 1);
  ctx.restore();
}
export const BOSS_LOOK: Look = {
  shirt: '#111827', hair: '#e5e7eb', hairDark: '#9ca3af', skin: '#c88f64', skinFar: '#b17a51',
  jeans: '#3f3a36', jeansFar: '#2b2724', shoe: '#3b2a1a', shoeFar: '#271b10', hat: 'crown', hatColor: '#fbbf24', beard: true, glasses: false,
  armor: 'plate', emblem: 2, plume: true,
};

/** hat / beard / glasses, drawn in the head's local frame (face toward +x) */
export function drawHeadExtras(ctx: Ctx, look: Look) {
  if (look.beard) {
    shape(ctx, (q) => { q.moveTo(3, 7); q.bezierCurveTo(6, 20, 16, 20, 17, 8); q.bezierCurveTo(13, 12, 8, 12, 3, 7); q.closePath(); }, look.hairDark);
  }
  if (look.glasses) {
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(10.4, -2.4, 5, 0, Math.PI * 2); ctx.stroke();
    stroke(ctx, [v(5.4, -2.4), v(-6, -5)], '#1f2937', 1.6);
  }
  const c = look.hatColor;
  if (look.hat === 'cap') {
    shape(ctx, (q) => { q.moveTo(-17, -4); q.bezierCurveTo(-18, -20, 10, -26, 16, -9); q.lineTo(-17, -4); q.closePath(); }, c);
    shape(ctx, (q) => q.roundRect(8, -11, 20, 4.5, 2), c);
  } else if (look.hat === 'band') {
    shape(ctx, (q) => { q.moveTo(-17, -5); q.lineTo(16, -8); q.lineTo(16, -3); q.lineTo(-17, 0); q.closePath(); }, c);
    stroke(ctx, [v(-17, -3), v(-26, 2), v(-28, 10)], c, 3);
  } else if (look.hat === 'helmet') {
    shape(ctx, (q) => { q.moveTo(-19, -2); q.bezierCurveTo(-20, -24, 16, -26, 18, -4); q.lineTo(-19, -2); q.closePath(); }, '#9ca3af');
    shape(ctx, (q) => q.roundRect(-19, -5, 37, 4, 2), '#6b7280');
    stroke(ctx, [v(-1, -24), v(-1, -6)], '#4b5563', 2.5);
  } else if (look.hat === 'beanie') {
    shape(ctx, (q) => { q.moveTo(-18, -1); q.bezierCurveTo(-19, -24, 14, -27, 17, -4); q.lineTo(-18, -1); q.closePath(); }, c);
    shape(ctx, (q) => q.roundRect(-18, -7, 35, 6, 3), 'rgba(0,0,0,0.25)');
    circle(ctx, v(-1, -25), 4, '#f8fafc');
  } else if (look.hat === 'nasal') {
    // conical helm with a nose guard
    shape(ctx, (q) => { q.moveTo(-19, -3); q.bezierCurveTo(-18, -22, -4, -34, 2, -34); q.bezierCurveTo(10, -34, 18, -20, 18, -5); q.closePath(); }, PLATE);
    shape(ctx, (q) => { q.moveTo(-19, -3); q.bezierCurveTo(-18, -22, -4, -34, 2, -34); q.lineTo(2, -5); q.closePath(); }, 'rgba(0,0,0,0.12)');
    shape(ctx, (q) => q.roundRect(-20, -7, 39, 5, 2), '#6b7280');
    shape(ctx, (q) => q.roundRect(11, -6, 4, 16, 1.5), '#6b7280'); // nasal bar
    if (look.plume) { stroke(ctx, [v(0, -33), v(-10, -44), v(-24, -40)], '#b91c1c', 5); stroke(ctx, [v(-10, -44), v(-22, -52)], '#b91c1c', 4); }
  } else if (look.hat === 'kettle') {
    // wide-brimmed kettle hat
    shape(ctx, (q) => { q.moveTo(-17, -6); q.bezierCurveTo(-16, -24, 14, -27, 16, -6); q.closePath(); }, PLATE);
    ctx.fillStyle = '#6b7280'; ctx.beginPath(); ctx.ellipse(0, -5, 27, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PLATE; ctx.beginPath(); ctx.ellipse(0, -6.5, 25, 4, 0, Math.PI, 0); ctx.fill();
    stroke(ctx, [v(-2, -25), v(-2, -8)], '#6b7280', 2);
  } else if (look.hat === 'coif') {
    // mail coif: a hood of rings framing the face
    shape(ctx, (q) => { q.moveTo(-18, 2); q.bezierCurveTo(-21, -14, -12, -24, 0, -24); q.bezierCurveTo(10, -24, 15, -18, 15, -8); q.lineTo(12, -6); q.bezierCurveTo(12, -14, 6, -17, -1, -17); q.bezierCurveTo(-11, -17, -14, -8, -12, 4); q.lineTo(-14, 14); q.bezierCurveTo(-20, 12, -22, 8, -18, 2); q.closePath(); }, MAIL);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let yy = -20; yy < 10; yy += 4) for (let xx = -17; xx < 12; xx += 4) { if (Math.hypot(xx + 1, yy + 6) > 14) { ctx.beginPath(); ctx.arc(xx, yy, 1, 0, Math.PI * 2); ctx.fill(); } }
  } else if (look.hat === 'greathelm') {
    // bucket helm with an eye slit
    shape(ctx, (q) => { q.moveTo(-17, 14); q.lineTo(-18, -22); q.bezierCurveTo(-10, -30, 10, -30, 18, -22); q.lineTo(17, 14); q.closePath(); }, PLATE);
    ctx.fillStyle = '#1f2937'; ctx.fillRect(-4, -8, 22, 3.2);
    for (const yy of [2, 7]) for (const xx of [2, 7, 12]) circle(ctx, v(xx, yy), 1, '#1f2937');
    stroke(ctx, [v(-18, -22), v(17, -22)], '#6b7280', 1.5);
    if (look.plume) { stroke(ctx, [v(0, -29), v(-8, -42), v(-22, -40)], '#b91c1c', 5); }
  } else if (look.hat === 'crown') {
    shape(ctx, (q) => { q.moveTo(-15, -8); q.lineTo(-14, -24); q.lineTo(-7, -15); q.lineTo(0, -27); q.lineTo(7, -15); q.lineTo(13, -24); q.lineTo(14, -8); q.closePath(); }, c);
    circle(ctx, v(0, -20), 2.5, '#ef4444');
  }
}

const QA = 1.72; // quiver axis (nock -> tip): almost straight down, slightly back
const UA = 38;
const FA = 36;
const LEG_MAX = 95.3; // thigh + shin, minus a hair so the knee never locks
const C = {
  armor: 'none' as 'none' | 'mail' | 'plate', emblem: 0,
  skin: '#e3b286', skinFar: '#cd9b70',
  hair: '#6b4a36', hairDark: '#523727',
  shirt: '#d8363c', guard: '#1b1c20',
  jeans: '#31566b', jeansFar: '#274657',
  shoe: '#3f76c8', shoeFar: '#3363ab', sole: '#eef1f4',
  quiver: '#1d1e23', quiverHi: '#3b3e47', belt: '#141518',
};

export function poseArcher(s: ArcherState) {
  const { x, ground: G, phase, t } = s;
  const gs = s.gear ?? 1;
  const hgs = Math.min(gs, 1.05);
  // a mini bow has its string much closer to the grip; a giant bow keeps the hand within arm reach
  const nockPoint = (g0: V, ang: number, pull: number): V => sub(g0, fromAngle(ang, (BRACE + pull) * hgs));
  const u = clamp(t / (DUR[phase] ?? 1), 0, 1);
  const breath = Math.sin(s.time * 2.1);
  const endE = ease.inOut(seg(t, 0, 0.55));
  const e0 = s.e0; // win / lose start from exactly the 'recover' pose at this progress
  // draw fraction: shoulders stay "loaded" for a moment after the release and are
  // fully relaxed again by the time the follow-through ends
  const f = clamp(
    phase === 'ready' ? s.pull / MAX_DRAW
      : phase === 'release' ? (s.relPull / MAX_DRAW) * Math.exp(-9 * t) * (1 - ease.inOut(seg(t, 0.1, RELEASE_HOLD)))
      : 0,
    0, 1,
  );

  // ---- body ---------------------------------------------------------------
  const ga = ease.inOut(seg(u, 0.06, 0.42)); // grab: reach in
  const gb = ease.inOut(seg(u, 0.54, 0.96)); // grab: stand back up
  let raise = 0;
  let lean = 0.02;
  let crouch = 0;
  let hipBack = 0;
  let look = 0;
  if (phase === 'grab') {
    const bell = ga * (1 - gb);
    lean += 0.5 * bell;
    crouch = 16 * bell;
    hipBack = -7 * bell;
    look = 0.14 * ease.sine(seg(u, 0, 0.12)) * (1 - gb) + 0.12 * bell;
  } else if (phase === 'nock') {
    raise = ease.inOut(seg(u, 0.78, 1));
    const toQuiver = ease.sine(seg(u, 0, 0.16)) * (1 - ease.sine(seg(u, 0.36, 0.56)));
    const toBow = ease.sine(seg(u, 0.44, 0.6)) * (1 - raise);
    look = 0.34 * toQuiver + 0.2 * toBow;
  } else if (phase === 'ready' || phase === 'release') raise = 1;
  else if (phase === 'recover') raise = 1 - ease.inOut(u);
  else if (phase === 'win' || phase === 'lose') raise = (1 - e0) * (1 - endE);
  const aim = s.aim;
  lean += raise * (aim * 0.38 - 0.03) - 0.035 * f + s.recoil + clamp(s.vx / 165, -1, 1) * 0.035 + s.duck * 0.007;

  // feet first: the hips ride as high as both legs allow, which gives the walk its bob
  const hop = phase === 'win' ? Math.abs(Math.sin(s.time * 9)) * 5 * endE : 0;
  const ankB = v(s.footB.x, s.footB.y - hop);
  const ankF = v(s.footF.x, s.footF.y - hop);
  const hipX = x + hipBack + lean * 8;
  const reach = (a: V) => a.y - Math.sqrt(Math.max(1, LEG_MAX * LEG_MAX - (a.x - hipX) * (a.x - hipX)));
  const hip = v(hipX, Math.max(G - 102 + crouch + s.duck + breath * 0.5 - hop, reach(ankB), reach(ankF)));
  const neck = add(hip, rot(v(0, -62), lean));
  const P = (lx: number, ly: number) => add(neck, rot(v(lx, ly), lean));
  const Sf = P(6 + 2 * f, 6 + breath * 0.4);
  const Sr = P(-6 - 5 * f, 7 + breath * 0.4 - f);
  const Pv = P(10, -9);
  const headC = P(3, -22);
  const headRot =
    lean * 0.4 + raise * aim * 0.42 + look + 0.04 * f +
    (phase === 'win' ? -0.2 * endE : phase === 'lose' ? 0.25 * endE : 0);

  // ---- bow arm ------------------------------------------------------------
  const hangF = v(Sf.x + 4, Sf.y + 70);
  const hangR = v(Sr.x - 3, Sr.y + 72);
  const standGrip = v(x + 82, G - 84);
  const standAng = 0.14;
  const lowBow = add(hip, v(40, -16));
  const lowAng = 0.52;
  const aimGrip = add(Pv, fromAngle(aim, 62 + 1.5 * f));

  let F = hangF;
  let bowAng = standAng;
  let held = phase !== 'idle';
  switch (phase) {
    case 'grab': {
      // hand travels in an arc, the lifted bow swings a little past its rest angle
      const arcIn = Math.sin(Math.PI * ga);
      const arcUp = Math.sin(Math.PI * gb);
      F = add(lerpV(lerpV(hangF, standGrip, ga), lowBow, gb), v(7 * arcIn + 6 * arcUp, -11 * arcIn - 9 * arcUp));
      bowAng = lerp(standAng, lowAng, ease.outBack(seg(u, 0.55, 1)));
      held = u >= 0.47;
      break;
    }
    case 'nock':
    case 'recover':
      F = lerpV(lowBow, aimGrip, raise);
      bowAng = lerp(lowAng, aim, raise);
      break;
    case 'ready':
    case 'release':
      F = aimGrip;
      bowAng = aim;
      break;
    case 'win':
      F = lerpV(lerpV(lowBow, aimGrip, 1 - e0), v(Sf.x + 30, Sf.y - 58), endE);
      bowAng = lerp(lerp(lowAng, aim, 1 - e0), -0.95, endE);
      break;
    case 'lose':
      F = lerpV(lerpV(lowBow, aimGrip, 1 - e0), lowBow, endE);
      bowAng = lerp(lerp(lowAng, aim, 1 - e0), lowAng, endE);
      break;
  }
  const fa = ik(Sf, F, UA, FA, 1);
  const grip = fa.end;
  const attach = phase === 'idle' ? 0 : phase === 'grab' ? seg(u, 0.42, 0.5) : 1;
  bowAng += s.kick * attach;
  const bowPos = lerpV(standGrip, grip, attach);

  // ---- draw arm -----------------------------------------------------------
  const bdir = fromAngle(bowAng);
  // the string gives a tiny bit when the nock clicks on
  const seat = phase === 'nock' ? Math.sin(Math.PI * seg(u, 0.77, 0.9)) * 2.2 : 0;
  const stringPull = phase === 'ready' ? s.pull : seat;
  const hold = sub(nockPoint(grip, bowAng, stringPull), mul(bdir, 5));
  const rdir = fromAngle(s.relAim);
  const gripAim = ik(Sf, aimGrip, UA, FA, 1).end;
  const hold0 = sub(nockPoint(gripAim, s.relAim, s.relPull), mul(rdir, 5));
  const follow = add(sub(hold0, mul(rdir, 15)), v(0, -2));

  const quiverM = add(hip, v(-8, 8));
  const qdir = fromAngle(QA);
  const grabPt = sub(quiverM, mul(qdir, 35));
  const outPt = add(hip, v(30, -84));

  let R = hangR;
  let bendR = 1;
  let fingers: 'relaxed' | 'pinch' | 'hook' | 'open' | 'fist' = 'relaxed';
  let fingerAng = Math.PI / 2;
  let r2 = 0;
  let r3 = 0;
  if (phase === 'grab') {
    const bell = ga * (1 - gb);
    R = add(hangR, v(-17 * bell, -9 * bell)); // counter-balance swing
  } else if (phase === 'nock') {
    const r1 = ease.inOut(seg(u, 0, 0.2));
    r2 = ease.inOut(seg(u, 0.24, 0.48));
    r3 = ease.inOut(seg(u, 0.48, 0.72));
    const r4 = ease.inOut(seg(u, 0.72, 0.8));
    const lay = add(hold, mul(bdir, 14)); // shaft on the rest, nock still in front of the string
    const lift = Math.sin(Math.PI * r3);
    R = lerpV(lerpV(lerpV(lerpV(hangR, grabPt, r1), outPt, r2), add(lay, v(4 * lift, -10 * lift)), r3), hold, r4);
    fingers = u < 0.21 ? 'relaxed' : u < 0.8 ? 'pinch' : 'hook';
  } else if (phase === 'ready') {
    R = hold;
    bendR = -1;
    fingers = 'hook';
  } else if (phase === 'release') {
    R = lerpV(hold0, follow, ease.out(seg(t, 0, 0.13)));
    bendR = -1;
    fingers = 'open';
  } else if (phase === 'recover') {
    const e = ease.inOut(u);
    R = lerpV(follow, hangR, e);
    bendR = lerp(-1, 1, e);
    fingers = u < 0.4 ? 'open' : 'relaxed';
  } else if (phase === 'win') {
    R = lerpV(lerpV(follow, hangR, e0), v(Sr.x - 8, Sr.y - 68), endE);
    bendR = lerp(lerp(-1, 1, e0), -1, endE);
    fingers = 'fist';
  } else if (phase === 'lose') {
    R = lerpV(lerpV(follow, hangR, e0), add(headC, rot(v(12, -2), headRot)), endE);
    bendR = lerp(lerp(-1, 1, e0), 1, endE);
  }
  // The draw elbow really travels in a level arc at shoulder height: forward, then towards
  // the camera, then back. From the side that reads as a foreshortened upper arm sweeping
  // from front to back under the chin – it never has to cross the face.
  const relF = s.relPull / MAX_DRAW;
  const after = Math.min(1.08, relF + 0.4); // follow-through carries the elbow further round
  const fDraw =
    phase === 'ready' ? clamp(s.pull / MAX_DRAW, 0, 1)
    : phase === 'release' ? lerp(relF, after, ease.out(seg(t, 0, 0.13)))
    : phase === 'nock' ? 0 : after;
  const wDraw =
    phase === 'nock' ? ease.inOut(seg(u, 0.78, 0.98))
    : phase === 'ready' || phase === 'release' ? 1
    : phase === 'recover' ? 1 - ease.inOut(u)
    : phase === 'win' || phase === 'lose' ? (1 - e0) * (1 - endE) : 0;
  const armIK = ik(Sr, R, UA, FA, bendR);
  let elbowR = armIK.mid;
  if (wDraw > 0 && gs >= 1) {
    const phi = lerp(0.42, 3.0, ease.sine(clamp(fDraw, 0, 1))) + 1.2 * clamp(fDraw - 1, 0, 0.08);
    let e = add(Sr, rot(v(UA * Math.cos(phi), -5 * clamp(fDraw, 0, 1)), lean));
    const dl = dist(e, armIK.end);
    if (dl > FA) e = add(armIK.end, mul(sub(e, armIK.end), FA / dl));
    elbowR = lerpV(armIK.mid, e, wDraw);
  }
  const ra = { mid: elbowR, end: armIK.end };

  // ---- arrow --------------------------------------------------------------
  const hasArrow = (phase === 'nock' && u >= 0.21) || phase === 'ready';
  let arrow: { nock: V; angle: number } | null = null;
  let arrowClip = false;
  if (hasArrow) {
    let ang = bowAng;
    if (phase === 'nock') {
      // while it leaves the quiver the shaft keeps sliding through the quiver mouth
      const outEnd = ik(Sr, outPt, UA, FA, 1).end;
      const through = (h: V) => Math.atan2(quiverM.y - h.y, quiverM.x - h.x);
      ang = r2 < 1 ? through(ra.end) : lerp(through(outEnd), bowAng, r3);
      arrowClip = r2 < 1;
    }
    arrow = { nock: add(ra.end, fromAngle(ang, 5)), angle: ang };
    fingerAng = ang;
  } else if (phase === 'release' || phase === 'recover') {
    fingerAng = lerp(s.relAim, Math.PI / 2, phase === 'recover' ? ease.inOut(u) : 0);
  } else if (phase === 'win' || phase === 'lose') {
    fingerAng = lerp(lerp(s.relAim, Math.PI / 2, e0), -Math.PI / 2, endE);
  }

  // ---- legs ---------------------------------------------------------------
  const legB = ik(hip, ankB, 48.5, 47, -1);
  const legF = ik(hip, ankF, 48.5, 47, -1);

  const expr = phase === 'win' ? 'happy' : phase === 'lose' ? 'shock' : phase === 'ready' || phase === 'release' ? 'focus' : 'neutral';
  return {
    s, hip, neck, lean, Sf, Sr, headC, headRot, fa, ra, legB, legF, ankB, ankF, held, arrow, arrowClip,
    fingers, fingerAng, quiverM, expr, f, rotB: s.rotB, rotF: s.rotF,
    // outside 'ready' s.pull is only the string's own ringing after a shot
    bow: {
      pos: bowPos,
      ang: bowAng,
      pull: gs > 1
        ? ((BRACE + (phase === 'ready' ? s.pull : s.pull + seat)) * hgs) / gs - BRACE
        : phase === 'ready' ? s.pull : s.pull + seat,
      vib: s.vib,
    },
    quiverCount: Math.max(0, s.quiver - (hasArrow ? 1 : 0)),
    slotStart: hasArrow ? 1 : 0,
  };
}
export type ArcherPose = ReturnType<typeof poseArcher>;

function sneaker(ctx: Ctx, a: V, far: boolean, pitch: number) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(pitch);
  shape(ctx, (p) => {
    p.moveTo(-9.5, -5);
    p.lineTo(7, -6);
    p.quadraticCurveTo(19, -1, 21.5, 6.5);
    p.lineTo(-10.5, 6.5);
    p.closePath();
  }, far ? C.shoeFar : C.shoe);
  shape(ctx, (p) => {
    p.moveTo(14.5, 0.6);
    p.quadraticCurveTo(20.5, 1.6, 21.5, 6.5);
    p.lineTo(13.5, 6.5);
    p.closePath();
  }, far ? '#d9dee4' : C.sole);
  shape(ctx, (p) => p.roundRect(-11, 5.6, 33, 4.4, 2), far ? '#d9dee4' : C.sole);
  stroke(ctx, [v(3.5, -3.6), v(7.5, -0.8)], '#ffffff', 1.4);
  stroke(ctx, [v(7.5, -2.2), v(11.5, 0.6)], '#ffffff', 1.4);
  ctx.restore();
}

function leg(ctx: Ctx, hip: V, knee: V, ank: V, far: boolean, pitch: number) {
  const c = far ? C.jeansFar : C.jeans;
  cap(ctx, hip, knee, 11.2, 9.4, c);
  cap(ctx, knee, ank, 9.4, 8.2, c);
  capShade(ctx, hip, knee, 11.2, 9.4, 0.2);
  capShade(ctx, knee, ank, 9.4, 8.2, 0.2);
  if (C.armor !== 'none') greave(ctx, knee, ank);
  sneaker(ctx, ank, far, pitch);
}

function arm(ctx: Ctx, sh: V, el: V, hand: V, bracer: boolean) {
  const armored = C.armor !== 'none';
  const sleeve = armored ? MAIL : C.skin;
  cap(ctx, sh, el, 7.4, 6, sleeve);
  cap(ctx, el, hand, 5.9, 4.8, sleeve);
  capShade(ctx, sh, el, 7.4, 6, 0.18);
  capShade(ctx, el, hand, 5.9, 4.8, 0.18);
  limb(ctx, sh, lerpV(sh, el, 0.5), 8.8, 7.7, armored ? (C.armor === 'plate' ? PLATE : MAIL_DARK) : C.shirt, 0.2);
  if (bracer || armored) limb(ctx, lerpV(el, hand, 0.22), lerpV(el, hand, 0.82), 6.2, 5.4, armored ? LEATHER : C.guard, 0);
}

export function drawArcher(ctx: Ctx, p: ArcherPose) {
  const t1 = p.s.team === 1;
  const lk = p.s.look ?? { ...DEFAULT_LOOK, shirt: t1 ? '#7c3aed' : '#d8363c', hair: t1 ? '#26211f' : '#6b4a36', hairDark: t1 ? '#141110' : '#523727' };
  C.shirt = lk.shirt; C.hair = lk.hair; C.hairDark = lk.hairDark; C.skin = lk.skin; C.skinFar = lk.skinFar;
  C.jeans = lk.jeans; C.jeansFar = lk.jeansFar; C.shoe = lk.shoe; C.shoeFar = lk.shoeFar;
  C.armor = lk.armor ?? 'none'; C.emblem = lk.emblem ?? 0;
  const armored = C.armor !== 'none';
  const gs = p.s.gear ?? 1;
  const scaled = (c: V, fn: () => void) => {
    if (gs === 1) return fn();
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(gs, gs);
    ctx.translate(-c.x, -c.y);
    fn();
    ctx.restore();
  };
  leg(ctx, p.hip, p.legB.mid, p.ankB, true, p.rotB);
  leg(ctx, p.hip, p.legF.mid, p.ankF, false, p.rotF);

  // torso
  ctx.save();
  ctx.translate(p.neck.x, p.neck.y);
  ctx.rotate(p.lean);
  shape(ctx, (q) => {
    q.moveTo(-12.6, 52); q.lineTo(12.6, 52); q.lineTo(13, 64);
    q.quadraticCurveTo(0, 73, -13, 64); q.closePath();
  }, C.jeans);
  limb(ctx, v(1, 2), v(2, -9), 5.2, 5, C.skin, 0.2);
  const torso = shape(ctx, (q) => {
    q.moveTo(-11.5, 0); q.quadraticCurveTo(0, -5, 11.5, 0);
    q.bezierCurveTo(17.5, 12, 16, 30, 12.6, 46); q.lineTo(12.2, 56); q.lineTo(-12.6, 56);
    q.bezierCurveTo(-13.6, 44, -17.6, 24, -11.5, 0); q.closePath();
  }, armored ? (C.armor === 'plate' ? PLATE : MAIL) : C.shirt);
  ctx.save();
  ctx.clip(torso);
  if (armored) {
    if (C.armor === 'mail') {
      // rings
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let yy = 2; yy < 56; yy += 4) for (let xx = -16; xx < 18; xx += 4) { ctx.beginPath(); ctx.arc(xx + (yy % 8 ? 2 : 0), yy, 1.05, 0, Math.PI * 2); ctx.fill(); }
    } else {
      // breastplate: shaded plates with rivets
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(-20, -8, 9, 70);
      stroke(ctx, [v(-13, 30), v(13, 30)], '#7c8591', 1.5, 'butt');
      for (const xx of [-8, 0, 8]) circle(ctx, v(xx, 33), 1.3, '#4b5563');
    }
    // tabard in the company colour, split at the hem
    ctx.fillStyle = C.shirt;
    ctx.beginPath(); ctx.moveTo(-8.5, 1); ctx.lineTo(8.5, 1); ctx.lineTo(9, 50); ctx.lineTo(0, 46); ctx.lineTo(-9, 50); ctx.closePath(); ctx.fill();
    stroke(ctx, [v(-8.5, 1), v(-9, 50)], 'rgba(0,0,0,0.25)', 1.5, 'butt');
    emblem(ctx, C.emblem, 20);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-20, 49, 40, 8);
  } else {
    ctx.fillStyle = 'rgba(70,0,10,0.3)';
    ctx.fillRect(-20, -8, 10.5, 70);
    ctx.fillRect(-20, 49, 40, 8);
    // chest guard with its straps
    ctx.fillStyle = C.guard;
    ctx.beginPath();
    ctx.moveTo(1.5, -4); ctx.lineTo(20, -2); ctx.lineTo(20, 20); ctx.quadraticCurveTo(10, 31, 1, 19); ctx.closePath();
    ctx.fill();
    stroke(ctx, [v(2, 17), v(-18, 27)], C.guard, 2.6, 'butt');
  }
  ctx.restore();
  ctx.fillStyle = armored ? LEATHER : C.belt;
  ctx.fillRect(-12.8, 52, 25.6, armored ? 5.5 : 4.2);
  if (armored) circle(ctx, v(0, 54.5), 2.4, '#d6b36a');
  ctx.restore();

  // head: short brown crop, no accessories
  ctx.save();
  ctx.translate(p.headC.x, p.headC.y);
  ctx.rotate(p.headRot);
  const face = shape(ctx, headPath, C.skin);
  ctx.save();
  ctx.clip(face);
  ctx.fillStyle = 'rgba(150,80,40,0.22)';
  ctx.beginPath(); ctx.ellipse(1, 16.5, 10, 4.2, -0.15, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const hair = shape(ctx, (q) => {
    q.moveTo(-16.6, 1.5); q.bezierCurveTo(-21.5, -8, -17, -21.5, -2, -22);
    q.bezierCurveTo(7.5, -22, 14, -18, 15.4, -10.5); q.bezierCurveTo(10, -14, 5, -13, 1.6, -8);
    q.lineTo(0.6, -2.6); q.bezierCurveTo(-3, -4.6, -6.2, -2, -7, 3.4);
    q.bezierCurveTo(-10, 5, -14, 4.4, -16.6, 1.5); q.closePath();
  }, C.hair);
  ctx.save();
  ctx.clip(hair);
  ctx.fillStyle = C.hairDark;
  ctx.beginPath(); ctx.ellipse(-13, -3, 8, 15, 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  circle(ctx, v(-3.4, 1.6), 3.5, C.skinFar);
  const ex = p.expr;
  ctx.lineCap = 'round';
  if (ex === 'happy') {
    ctx.beginPath(); ctx.arc(10, -1.6, 2.7, Math.PI * 1.1, Math.PI * 1.9);
    ctx.lineWidth = 1.7; ctx.strokeStyle = '#2b1a12'; ctx.stroke();
  } else {
    ctx.fillStyle = '#2b1a12';
    ctx.beginPath();
    ctx.ellipse(10.4, -2.4, 1.6, ex === 'shock' ? 2.4 : ex === 'focus' ? 1.15 : 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const brow = ex === 'focus' ? [v(6, -7.6), v(13.6, -5.2)] : ex === 'shock' ? [v(6.4, -8.6), v(13, -9)] : [v(6.2, -7), v(13.2, -6.4)];
  stroke(ctx, brow, C.hairDark, 1.9);
  ctx.beginPath();
  if (ex === 'happy') ctx.arc(11.5, 8.6, 3.8, 0.1, Math.PI * 0.75);
  else if (ex === 'shock') ctx.ellipse(13, 10.6, 1.9, 2.6, 0, 0, Math.PI * 2);
  else { ctx.moveTo(11.4, 10.7); ctx.lineTo(15.2, 10.3); }
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#9a5a40'; ctx.stroke();
  if (p.s.look) drawHeadExtras(ctx, p.s.look);
  ctx.restore();

  const sword = !!p.s.weapon && p.s.weapon !== 'bow';
  // hip quiver: spare arrows first, then the black tube over them
  for (let i = sword ? -1 : p.quiverCount - 1; i >= 0; i--) {
    const k = i + p.slotStart;
    const ang = QA + (k % 2 ? 1 : -1) * 0.04 * Math.ceil(k / 2);
    scaled(p.quiverM, () => drawArrow(ctx, sub(p.quiverM, fromAngle(ang, 30 - (k % 3) * 2 * Math.sign(k))), ang));
  }
  if (!sword) {
    const qEnd = add(p.quiverM, fromAngle(QA, 60));
    stroke(ctx, [add(p.quiverM, fromAngle(QA, 4)), add(p.hip, v(-3, -7))], C.belt, 3.4);
    limb(ctx, p.quiverM, qEnd, 8.6, 7.4, C.quiver, 0);
    cap(ctx, add(p.quiverM, fromAngle(QA, 1)), add(p.quiverM, fromAngle(QA, 6)), 9.2, 9.2, C.quiverHi);
    cap(ctx, add(p.quiverM, fromAngle(QA, 22)), add(p.quiverM, fromAngle(QA, 40)), 4.6, 4.2, '#2c2e36');
  }

  // bow arm, bow, gripping fingers
  if (sword) {
    // sword soldier: the front arm swings for balance, the near arm wields the blade
    const { rear, front, swordAng } = swordArms(p, p.s.swing ?? 0, lk.tower ? 0.15 : undefined);
    arm(ctx, p.Sf, front.mid, front.end, false);
    circle(ctx, front.end, 5.6, C.skin);
    if (armored) pauldron(ctx, p.Sf, C.armor === 'plate');
    if (lk.tower) drawTowerShield(ctx, add(lerpV(front.mid, front.end, 0.6), v(6, 28)), C.shirt, C.emblem);
    else if (lk.shield) drawShield(ctx, lerpV(front.mid, front.end, 0.7), C.shirt, C.emblem);
    arm(ctx, p.Sr, rear.mid, rear.end, false);
    if (armored) pauldron(ctx, p.Sr, C.armor === 'plate');
    if (p.s.weapon === 'axe') { if (!p.s.axeThrown) drawAxe(ctx, rear.end, swordAng + 0.3); }
    else if (p.s.weapon === 'none') { /* empty hands */ }
    else if (p.s.weapon === 'mace') { stroke(ctx, [rear.end, add(rear.end, fromAngle(swordAng, 40))], '#5b3a21', 5); circle(ctx, add(rear.end, fromAngle(swordAng, 44)), 9, '#6b7280'); for (let i = 0; i < 6; i++) circle(ctx, add(add(rear.end, fromAngle(swordAng, 44)), fromAngle(i, 10)), 2.5, '#4b5563'); }
    else drawSword(ctx, rear.end, swordAng);
    // fist wrapped round the grip, over the blade
    ctx.save(); ctx.translate(rear.end.x, rear.end.y); ctx.rotate(swordAng);
    shape(ctx, (q) => q.roundRect(-7, -6, 14, 12, 4), C.skin);
    for (const x of [-4, 0, 4]) stroke(ctx, [v(x, -5), v(x, 5)], C.skinFar, 1);
    ctx.restore();
    return;
  }
  arm(ctx, p.Sf, p.fa.mid, p.fa.end, true);
  if (armored) pauldron(ctx, p.Sf, C.armor === 'plate');
  circle(ctx, sub(p.fa.end, fromAngle(p.bow.ang, p.held ? 2.5 : 0)), 5.6, C.skin);
  scaled(p.bow.pos, () => drawBow(ctx, p.bow.pos, p.bow.ang, p.bow.pull, p.bow.vib));
  if (p.held) {
    ctx.save();
    ctx.translate(p.bow.pos.x, p.bow.pos.y);
    ctx.rotate(p.bow.ang);
    shape(ctx, (q) => q.roundRect(-0.5, -6.6, 7.4, 13.2, 3.4), C.skin);
    for (const y of [-3.2, 0, 3.2]) stroke(ctx, [v(2, y), v(6.2, y)], C.skinFar, 1);
    ctx.restore();
  }

  // arrow in hand / on the string
  if (p.arrow) {
    ctx.save();
    if (p.arrowClip) {
      ctx.translate(p.quiverM.x, p.quiverM.y);
      ctx.rotate(QA);
      ctx.beginPath();
      ctx.rect(-600, -600, 600, 1200);
      ctx.clip();
      ctx.rotate(-QA);
      ctx.translate(-p.quiverM.x, -p.quiverM.y);
    }
    const an = p.arrow;
    scaled(an.nock, () => drawArrow(ctx, an.nock, an.angle));
    ctx.restore();
  }

  // draw arm (nearest to the camera)
  arm(ctx, p.Sr, p.ra.mid, p.ra.end, false);
  if (armored) pauldron(ctx, p.Sr, C.armor === 'plate');
  const h = p.ra.end;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(p.fingerAng);
  if (p.fingers === 'open') for (const a of [-0.75, -0.25, 0.25, 0.7]) stroke(ctx, [v(0, 0), fromAngle(a, 10.5)], C.skin, 3.6);
  circle(ctx, v(0, 0), p.fingers === 'fist' ? 6.4 : 5.5, C.skin);
  if (p.fingers === 'hook') {
    shape(ctx, (q) => q.roundRect(-1.5, -5.2, 9.5, 10.4, 3.2), C.guard);
    for (const y of [-2.6, 0.2, 3]) stroke(ctx, [v(4.5, y), v(8.4, y)], C.skin, 2.3);
  } else if (p.fingers === 'pinch') {
    shape(ctx, (q) => q.roundRect(0, -4.6, 8.5, 9.2, 3.4), C.skin);
    stroke(ctx, [v(3, -3.4), v(7.4, -1.2)], C.skinFar, 1);
  } else if (p.fingers === 'fist') for (const y of [-2.4, 0.4, 3.2]) stroke(ctx, [v(1.5, y), v(5.6, y)], C.skinFar, 1);
  else if (p.fingers === 'relaxed') shape(ctx, (q) => q.roundRect(1, -4, 8, 8, 3.4), C.skin);
  ctx.restore();
}
