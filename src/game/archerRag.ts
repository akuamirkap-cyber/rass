// A proper jointed ragdoll for the archer figure (story mode). Verlet points for head, neck, hip,
// both arms and both legs; distance sticks, soft struts that keep the body shape, one-way hinges for
// knees and elbows, platform landing with friction, and momentum transfer from the arrow that did it.
import { Ctx, V, v, add, sub, mul, len, dist, lerpV, clamp, fromAngle, cap, capShade, circle, shape, stroke, headPath } from './util';
import { drawBow } from './gear';
import { ARMOR_COLORS, DEFAULT_LOOK, Look, drawAxe, drawEmblem, drawGreave, drawHeadExtras, drawPauldron, drawShield, drawSword, drawTowerShield } from './archer';

// joints: 0 head, 1 neck, 2 hip, 3 bow elbow, 4 bow hand, 5 draw elbow, 6 draw hand, 7 back knee, 8 back ankle, 9 front knee, 10 front ankle
// sticks are in the same order as the fighter's hit segments, so a lodged arrow keeps its segment index
export const RAG_STICKS: [number, number][] = [[1, 0], [2, 1], [2, 7], [7, 8], [2, 9], [9, 10], [1, 3], [3, 4], [1, 5], [5, 6]];
const RADIUS = [17, 12, 13, 6, 5, 6, 5, 9, 7, 9, 7];
const INV_M = [0.9, 0.42, 0.38, 1.4, 2, 1.4, 2, 0.85, 1.25, 0.85, 1.25];
const STRUTS: [number, number, number][] = [[0, 2, 0.86], [1, 7, 0.62], [1, 9, 0.62], [2, 8, 0.36], [2, 10, 0.36], [1, 4, 0.3], [1, 6, 0.3]];
type Hinge = [number, number, number, number];
const HINGES: Hinge[] = [[2, 7, 8, -1], [2, 9, 10, -1], [1, 3, 4, 1], [1, 5, 6, 1]];

export interface Slab { x0: number; x1: number; top: number } // world y of the surface
export interface ArcherRag {
  p: V[]; o: V[]; len: number[]; acc: number; hinges: Hinge[]; t: number;
  face: number; // +1 looks right, -1 looks left
  team: 0 | 1;
  look: Look;
  weapon: 'bow' | 'sword' | 'axe' | 'mace' | 'none';
  bow: { p: V; vel: V; ang: number; vr: number; rest: boolean } | null;
  bowAng: number;
}

/** joints lifted straight from a drawn pose (already in world space, mirrored by the caller) */
export function makeArcherRag(J: V[], face: number, team: 0 | 1, vel: V, _bowPos: V, bowAng: number, look?: Look, weapon: 'bow' | 'sword' | 'axe' | 'mace' | 'none' = 'bow'): ArcherRag {
  const p = J.map((q) => ({ ...q }));
  const hinges = HINGES.filter(([a, m, e, sign]) => {
    const d1 = sub(p[m], p[a]); const d2 = sub(p[e], p[m]);
    return (d1.x * d2.y - d1.y * d2.x) * sign * -face >= 0; // the limits were tuned on a left-facing figure
  });
  return {
    p, o: p.map((q) => v(q.x - vel.x / 120, q.y - vel.y / 120)),
    len: RAG_STICKS.map(([a, b]) => dist(p[a], p[b])), acc: 0, hinges, t: 0, face, team,
    look: look ?? { ...DEFAULT_LOOK, shirt: team ? '#7c3aed' : '#d8363c', hair: team ? '#26211f' : '#6b4a36', hairDark: team ? '#141110' : '#523727' },
    weapon, bow: null, bowAng,
  };
}

/**
 * The arrow's punch. Momentum goes into the part that was struck, in the arrow's own direction, scaled by how
 * fast it flew; everything else only follows through the joints. A head gets flung, a torso is shoved, a leg is
 * kicked out from under him - no made-up upward kicks, so a light arrow nudges and a full-draw shot throws.
 */
export function punchRag(r: ArcherRag, stick: number, u: number, vel: V, fatal = true) {
  const [a, b] = RAG_STICKS[stick];
  const sp = len(vel) || 1;
  const dir = mul(vel, 1 / sp);
  // part mass: how much of the arrow's speed the struck part picks up, and how fast it may end up going
  const part = stick === 0 ? 'head' : stick === 1 ? 'torso' : stick <= 5 ? 'leg' : 'arm';
  const gain = { head: 0.36, torso: 0.17, leg: 0.27, arm: 0.34 }[part];
  const cap = { head: 760, torso: 430, leg: 620, arm: 700 }[part];
  const dv = Math.min(sp * gain, cap) * (fatal ? 1 : 0.72);
  const kick = (i: number, k: number) => { r.o[i] = sub(r.o[i], mul(dir, (dv * k) / 120)); };
  const t = clamp(u, 0, 1);
  // the two ends of the struck bone share the hit according to where it landed
  kick(a, 1 - 0.7 * t);
  kick(b, 0.3 + 0.7 * t);
  if (part === 'head') { kick(1, 0.35); kick(2, 0.12); } // whiplash: the neck follows, the hips barely
  else if (part === 'torso') { kick(0, 0.5); kick(7, 0.08); kick(9, 0.08); } // the head comes along; feet stay planted
  else if (part === 'leg') { r.o[2] = sub(r.o[2], mul(v(0, -(dv * 0.25)), 1 / 120)); } // the leg goes, the hips drop
  for (let i = 0; i < r.p.length; i++) kick(i, 0.04);
}

function boneLen(r: ArcherRag, a: number, b: number) {
  const i = RAG_STICKS.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return i >= 0 ? r.len[i] : 0;
}

const RAG_G = 1500;
function stepRag(r: ArcherRag, slabs: Slab[]) {
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
    const wa = INV_M[a]; const wb = INV_M[b];
    const k = (l - target) / l / (wa + wb);
    r.p[a] = add(r.p[a], mul(d, k * wa));
    r.p[b] = sub(r.p[b], mul(d, k * wb));
  };
  const onSlab: (Slab | null)[] = new Array(n).fill(null);
  for (let it = 0; it < 10; it++) {
    RAG_STICKS.forEach(([a, b], i) => solve(a, b, r.len[i], false));
    for (const [a, b, frac] of STRUTS) {
      const mid = a === 0 ? 1 : a === 1 && b >= 7 ? 2 : b - 1;
      solve(a, b, (boneLen(r, a, mid) + boneLen(r, mid, b)) * frac, true);
    }
    for (const [a, m, e, sign] of r.hinges) {
      const d1 = sub(r.p[m], r.p[a]); const d2 = sub(r.p[e], r.p[m]);
      if ((d1.x * d2.y - d1.y * d2.x) * sign * -r.face < 0) {
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
      for (const s of slabs) {
        const inX = p.x > s.x0 - rad * 0.5 && p.x < s.x1 + rad * 0.5;
        const bottom = s.top + 18 + rad * 0.6;
        if (!inX || p.y <= s.top - rad || p.y >= bottom) continue;
        const o = r.o[i];
        const wasAbove = o.y <= s.top - rad + 3;
        const wasBelow = o.y >= bottom - 3;
        const wasOutX = o.x <= s.x0 - rad * 0.5 || o.x >= s.x1 + rad * 0.5;
        if (wasAbove || (!wasBelow && !wasOutX && p.y - (s.top - rad) < 14)) { p.y = s.top - rad; onSlab[i] = s; } // lands on it
        else if (wasBelow || (!wasOutX && bottom - p.y < 14)) { p.y = bottom; r.o[i].y = Math.max(r.o[i].y, bottom); } // bonks the underside
        else if (wasOutX) p.x = p.x < (s.x0 + s.x1) / 2 ? s.x0 - rad * 0.5 : s.x1 + rad * 0.5; // ran into the side
        else p.y = s.top - rad - p.y < p.y - bottom ? s.top - rad : bottom; // ambiguous: nearest face
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const s = onSlab[i];
    if (s && r.p[i].y >= s.top - RADIUS[i] - 0.01) {
      const fr = i === 8 || i === 10 ? 0.45 : 0.7;
      r.o[i].x = r.p[i].x - (r.p[i].x - r.o[i].x) * fr;
      if (before[i] > 1.2) r.o[i].y = r.p[i].y + before[i] * 0.28;
    }
  }
}

export function updateArcherRag(r: ArcherRag, dt: number, slabs: Slab[]) {
  r.t += dt;
  r.acc += dt;
  let guard = 0;
  while (r.acc >= 1 / 120 && guard++ < 6) { stepRag(r, slabs); r.acc -= 1 / 120; }
  const b = r.bow;
  if (b && !b.rest) {
    b.vel.y += 1100 * dt;
    b.p = add(b.p, mul(b.vel, dt));
    b.ang += b.vr * dt;
    for (const s of slabs) {
      if (b.p.x > s.x0 && b.p.x < s.x1 && b.p.y > s.top - 6 && b.vel.y > 0 && b.p.y < s.top + 30) {
        b.p.y = s.top - 6; b.vel = v(b.vel.x * 0.4, -b.vel.y * 0.3); b.vr *= 0.5;
        if (Math.abs(b.vel.y) < 60) { b.rest = true; b.ang = Math.round(b.ang / Math.PI) * Math.PI + Math.PI / 2 * 0.9; }
      }
    }
  }
}

/** world point of an arrow lodged in stick `s` at (u, w) */
export function ragStickFrame(r: ArcherRag, s: number): [V, V] {
  const [a, b] = RAG_STICKS[s];
  return [r.p[a], r.p[b]];
}

function shoe(ctx: Ctx, knee: V, ank: V, far: boolean, lk: Look) {
  const d = sub(ank, knee); const L = len(d) || 1;
  const dir = v(d.x / L, d.y / L);
  const n = v(-dir.y, dir.x);
  const toe = add(ank, mul(n, 14));
  cap(ctx, add(ank, mul(dir, 2)), toe, 7, 5.5, far ? lk.shoeFar : lk.shoe);
  stroke(ctx, [add(ank, mul(dir, 6)), add(toe, mul(dir, 3))], far ? '#d9dee4' : '#eef1f4', 3);
}

export interface RagDrawOpts { face?: 'ok' | 'wince' | 'ko'; bow?: { ang: number } }
export function drawArcherRag(ctx: Ctx, r: ArcherRag, alive = false, opts: RagDrawOpts = {}) {
  const P = r.p; const lk = r.look;
  const face = opts.face ?? (alive ? 'wince' : 'ko');
  const GUARD = '#1b1c20';
  const armor = lk.armor ?? 'none';
  const armored = armor !== 'none';
  const { MAIL, MAIL_DARK, PLATE, LEATHER } = ARMOR_COLORS;
  const legDraw = (knee: number, ank: number, far: boolean) => {
    const c = far ? lk.jeansFar : lk.jeans;
    cap(ctx, P[2], P[knee], 11.2, 9.4, c); cap(ctx, P[knee], P[ank], 9.4, 8.2, c);
    capShade(ctx, P[2], P[knee], 11.2, 9.4, 0.2); capShade(ctx, P[knee], P[ank], 9.4, 8.2, 0.2);
    if (armored) drawGreave(ctx, P[knee], P[ank]);
    shoe(ctx, P[knee], P[ank], far, lk);
  };
  const armDraw = (el: number, hand: number, bracer: boolean) => {
    const sh = lerpV(P[1], P[2], 0.08);
    const sleeve = armored ? MAIL : lk.skin;
    cap(ctx, sh, P[el], 7.4, 6, sleeve); cap(ctx, P[el], P[hand], 5.9, 4.8, sleeve);
    capShade(ctx, sh, P[el], 7.4, 6, 0.18); capShade(ctx, P[el], P[hand], 5.9, 4.8, 0.18);
    cap(ctx, sh, lerpV(sh, P[el], 0.5), 8.8, 7.7, armored ? (armor === 'plate' ? PLATE : MAIL_DARK) : lk.shirt);
    if (bracer || armored) cap(ctx, lerpV(P[el], P[hand], 0.22), lerpV(P[el], P[hand], 0.82), 6.2, 5.4, armored ? LEATHER : GUARD);
    circle(ctx, P[hand], 5.6, lk.skin);
    if (armored) drawPauldron(ctx, sh, armor === 'plate');
  };
  legDraw(7, 8, true);
  armDraw(3, 4, true);
  if (r.weapon !== 'bow' && lk.tower) drawTowerShield(ctx, add(lerpV(P[3], P[4], 0.6), v(0, 20)), lk.shirt, lk.emblem ?? 0);
  else if (r.weapon !== 'bow' && lk.shield) drawShield(ctx, lerpV(P[3], P[4], 0.7), lk.shirt, lk.emblem ?? 0);
  // the weapon stays in the hand: a bow lies along the bow forearm, a sword along the sword forearm
  if (r.weapon === 'bow') {
    const fa = sub(P[4], P[3]);
    drawBow(ctx, P[4], opts.bow ? opts.bow.ang : Math.atan2(fa.y, fa.x), 0, 0);
    circle(ctx, P[4], 5.8, lk.skin);
  }
  // torso: a capsule from hip to neck with belt and chest guard
  const d = sub(P[1], P[2]); const L = len(d) || 1;
  cap(ctx, P[2], P[1], 13.5, 12.5, armored ? (armor === 'plate' ? PLATE : MAIL) : lk.shirt);
  ctx.save();
  ctx.translate(P[2].x, P[2].y);
  ctx.rotate(Math.atan2(d.y, d.x) + Math.PI / 2);
  ctx.fillStyle = lk.jeans; ctx.beginPath(); ctx.roundRect(-13, -14, 26, 14, 4); ctx.fill();
  ctx.fillStyle = armored ? LEATHER : '#141518'; ctx.fillRect(-13, -17, 26, 5);
  if (armored) {
    if (armor === 'mail') { ctx.fillStyle = 'rgba(0,0,0,0.22)'; for (let yy = -L + 6; yy < -18; yy += 4) for (let xx = -12; xx < 12; xx += 4) { ctx.beginPath(); ctx.arc(xx + (yy % 8 ? 2 : 0), yy, 1.05, 0, Math.PI * 2); ctx.fill(); } }
    else { ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(-13.5, -L + 4, 7, L - 22); }
    ctx.fillStyle = lk.shirt; ctx.beginPath(); ctx.moveTo(-8, -L + 6); ctx.lineTo(8, -L + 6); ctx.lineTo(8.5, -20); ctx.lineTo(0, -24); ctx.lineTo(-8.5, -20); ctx.closePath(); ctx.fill();
    drawEmblem(ctx, lk.emblem ?? 0, -L * 0.55);
  } else {
    ctx.fillStyle = 'rgba(70,0,10,0.3)'; ctx.fillRect(-13.5, -L + 4, 8, L - 20);
    ctx.fillStyle = GUARD; ctx.beginPath(); ctx.moveTo(1, -L + 2); ctx.lineTo(13, -L + 4); ctx.lineTo(13, -L + 26); ctx.quadraticCurveTo(6, -L + 36, 0, -L + 24); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  cap(ctx, lerpV(P[1], P[0], 0.1), lerpV(P[1], P[0], 0.45), 5.2, 5, lk.skin);
  legDraw(9, 10, false);
  // head: mirror first (so the face looks the way he faced), then turn it with the neck bone
  ctx.save();
  ctx.translate(P[0].x, P[0].y);
  ctx.scale(r.face, 1);
  const hd = sub(P[0], P[1]);
  ctx.rotate(Math.atan2(hd.y, r.face * hd.x) + Math.PI / 2);
  shape(ctx, headPath, lk.skin);
  shape(ctx, (q) => {
    q.moveTo(-16.6, 1.5); q.bezierCurveTo(-21.5, -8, -17, -21.5, -2, -22);
    q.bezierCurveTo(7.5, -22, 14, -18, 15.4, -10.5); q.bezierCurveTo(10, -14, 5, -13, 1.6, -8);
    q.lineTo(0.6, -2.6); q.bezierCurveTo(-3, -4.6, -6.2, -2, -7, 3.4);
    q.bezierCurveTo(-10, 5, -14, 4.4, -16.6, 1.5); q.closePath();
  }, lk.hair);
  circle(ctx, v(-3.4, 1.6), 3.5, lk.skinFar);
  ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  if (face === 'ok') {
    ctx.fillStyle = '#2b1a12'; ctx.beginPath(); ctx.ellipse(10.4, -2.4, 1.6, 1.15, 0, 0, Math.PI * 2); ctx.fill();
    stroke(ctx, [v(6, -7.6), v(13.6, -5.2)], lk.hairDark, 1.9);
    ctx.beginPath(); ctx.moveTo(11.4, 10.7); ctx.lineTo(15.2, 10.3); ctx.lineWidth = 1.5; ctx.strokeStyle = '#9a5a40'; ctx.stroke();
  } else {
    if (face === 'wince') { stroke(ctx, [v(7.5, -3), v(10.5, -1.5), v(13.5, -3)], '#2b1a12', 1.8); stroke(ctx, [v(6.2, -8.4), v(13.2, -6.4)], lk.hairDark, 1.9); }
    else { stroke(ctx, [v(8, -5), v(13, 0)], '#2b1a12', 1.8); stroke(ctx, [v(13, -5), v(8, 0)], '#2b1a12', 1.8); }
    ctx.beginPath(); ctx.ellipse(13, 9.5, 2.2, 2.8, 0, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = '#9a5a40'; ctx.stroke();
  }
  drawHeadExtras(ctx, lk);
  ctx.restore();
  armDraw(5, 6, false);
  if (r.weapon !== 'bow') {
    const fa = sub(P[6], P[5]);
    const ang = Math.atan2(fa.y, fa.x) + 0.35 * r.face;
    if (r.weapon === 'none') { /* empty */ } else if (r.weapon === 'axe') drawAxe(ctx, P[6], ang); else if (r.weapon === 'mace') { stroke(ctx, [P[6], add(P[6], fromAngle(ang, 40))], '#5b3a21', 5); circle(ctx, add(P[6], fromAngle(ang, 44)), 9, '#6b7280'); } else drawSword(ctx, P[6], ang);
    ctx.save(); ctx.translate(P[6].x, P[6].y); ctx.rotate(ang);
    shape(ctx, (q) => q.roundRect(-7, -6, 14, 12, 4), lk.skin);
    ctx.restore();
  }
  if (face === 'ko' && r.t < 2.2) {
    for (let i = 0; i < 3; i++) {
      const a = r.t * 5 + (i * Math.PI * 2) / 3;
      const q = add(P[0], v(Math.cos(a) * 26, -22 + Math.sin(a) * 7));
      ctx.fillStyle = '#fbbf24';
      ctx.globalAlpha = clamp((2.2 - r.t) / 0.6, 0, 1);
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const rr = k % 2 ? 2 : 4.5; const t = (k / 10) * Math.PI * 2 + a; ctx.lineTo(q.x + Math.cos(t) * rr, q.y + Math.sin(t) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

export const ragCentre = (r: ArcherRag) => r.p[2];

/** give every joint the velocity of a rigid spin (rad/s) about `c`, on top of what it already has */
export function spinRag(r: ArcherRag, c: V, omega: number) {
  for (let i = 0; i < r.p.length; i++) {
    const d = sub(r.p[i], c);
    r.o[i] = sub(r.o[i], mul(v(-d.y * omega, d.x * omega), 1 / 120));
  }
}

/** tucked somersault shape, upright and facing +x, relative to the body centre */
export const TUCK: V[] = [
  v(27, -41), v(11, -26), v(-20, 18), // head (chin tucked), neck, hip - torso curled forward
  v(32, -9), v(1, 25), v(28, -5), v(-3, 29), // bow elbow / hand, draw elbow / hand - arms wrapped round the shins
  v(4, -23), v(12, 23), v(0, -19), v(8, 27), // knees up to the chest, shins folded back
];
void fromAngle;
