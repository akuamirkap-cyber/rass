// Levels 45-60: sixteen fresh set pieces. They run inside the Game class through the `Host`
// view of it (the engine hands itself over), so each level only needs a reset / update /
// collide / draw quartet here.
import { Ctx, V, v, add, sub, mul, len, dist, clamp, lerp, lerpV, damp, fromAngle, segDist, stroke, groundShadow } from './util';
import { ARROW_LEN, drawApple } from './gear';
import { drawWoodWall } from './props2';
import { APPLE_R, Hit, TargetState, applePos, drawTarget, headPos, hitTest, joints, makeTarget, updateTarget } from './target';
import { ArcherState, ArcherPose } from './archer';
import { sfx } from './sfx';
import type { Shot, LevelDef } from './engine';
import { tx } from '../i18n';

export const G = 606;
const GRAV = 950;

export interface Host {
  readonly T: number; readonly def: LevelDef; readonly mini: string | undefined;
  a: ArcherState; pose: ArcherPose; men: TargetState[]; goals: { label: string; done: boolean }[]; appleGoal: number[];
  mg: any; shots: Shot[]; parts: any[]; loose: { kind: 'apple' | 'glasses'; p: V; vel: V; rot: number; vr: number }[];
  lt: number; result: 'win' | 'lose' | 'out' | null; ctx: Ctx; gk: number; vx: number; drag: unknown; hov: number;
  slowT: number; shake: number; why: string; vw: number; vh: number; scale: number;
  mark(i: number): void; miniWin(at: V, text: string): void; miniLose(why: string, at: V, text: string): void; miniLabel(t: string): void;
  burst(p: V, n: number, colors: string[], kind: 'star' | 'drop', speed: number): void;
  popText(p: V, text: string, color: string, size?: number): void;
  appleFx(s: Shot, at: V, label?: boolean): void; hitMan(i: number, hit: Hit, s: Shot): void; dropApple(m: TargetState, vel: V): void;
  glassBurst(at: V, n: number, speed: number): void; tumble(s: Shot): void; hurtMe(why: string, at: V): void;
  finish(r: 'win' | 'lose' | 'out'): void; dust(x: number, n?: number, speed?: number): void; chest(): V;
}

export const MINI5 = new Set([
  'timevault', 'saturn', 'cannon', 'domino', 'firerope', 'prism', 'coaster', 'tops', 'tarzan', 'tnt', 'claw', 'springs',
  'barongsai', 'paperplane', 'hologram', 'crab',
]);

// ---- small drawing helpers -------------------------------------------------------------------
export const box = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string, r = 0) => {
  ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
};
export const disc = (ctx: Ctx, p: V, r: number, c: string) => {
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
};
export const ring = (ctx: Ctx, p: V, r: number, c: string, lw: number) => {
  ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
};
export const stick = (s: Shot, n = 8) => {
  s.tip = add(s.tip, fromAngle(s.ang, n)); s.state = 'stuck'; s.embed = 11; sfx.thunk(); return true;
};
export const label = (ctx: Ctx, p: V, text: string, color: string, size = 12) => {
  ctx.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(text, p.x, p.y);
};
const RAINBOW = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6'];
const puff = (h: Host, p: V, color: string, vel: V, size = 4, max = 0.4) =>
  h.parts.push({ p: { ...p }, vel, life: 0, max, size, color, kind: 'drop', rot: 0, vr: 0 });
const glow = (ctx: Ctx, p: V, r: number, c: string, a = 0.35) => {
  ctx.save(); ctx.globalAlpha = a; disc(ctx, p, r, c); ctx.restore();
};

// ---- reset -------------------------------------------------------------------------------
export function reset5(h: Host) {
  const T = h.T; const k = h.mini; const mg = h.mg;
  if (!k || !MINI5.has(k)) return;
  const one = (x: number, y: number, pose: 'cross' | 'hips' | 'hold', lbl = tx("Mr. Bejo's Apple", 'Apel Pak Bejo')) => {
    h.men = [makeTarget(0, x, y, pose)]; h.goals = [{ label: lbl, done: false }]; h.appleGoal = [0]; return h.men[0];
  };
  if (k === 'timevault') {
    one(T + 40, G, 'cross');
    Object.assign(mg, {
      bub: [{ c: v(T - 440, G - 250), r: 74, w: 0.7, dx: 40 }, { c: v(T - 205, G - 350), r: 62, w: 0.95, dx: -34 }],
      crystal: { p: v(T - 320, G - 450), alive: true },
      door: { c: v(T - 60, G - 135), r: 96, ang: 0.4, w: 1.35, frozen: 0, flash: 0 },
    });
    h.goals = [{ label: tx('Freeze vault door (gold crystal)', 'Bekukan pintu brankas (kristal emas)'), done: false }, { label: tx("Mr. Bejo's Apple", 'Apel Pak Bejo'), done: false }];
    h.appleGoal = [1];
  } else if (k === 'saturn') {
    one(T + 30, G, 'cross');
  } else if (k === 'cannon') {
    const m = one(T + 40, G - 150, 'hold', tx("Mr. Bejo's Apple in mid-air", 'Apel Pak Bejo di udara'));
    m.hasApple = true;
    Object.assign(mg, { phase: 'load', t: 0, C: v(T + 40, G - 150), D: v(T - 330, G - 72), recoil: 0, squash: 0, dir: 1 });
  } else if (k === 'domino') {
    one(T, G, 'cross');
    Object.assign(mg, {
      rope: true, ball: { p: v(T - 395, G - 380), vy: 0, state: 'hang' },
      doms: Array.from({ length: 8 }, (_, i) => ({ x: T - 380 + i * 42, ang: 0, go: false })),
      bunker: true, flash: 0,
    });
    h.goals = [{ label: tx('Smash glass bunker (domino)', 'Hancurkan bunker kaca (domino)'), done: false }, { label: tx("Mr. Bejo's Apple", 'Apel Pak Bejo'), done: false }];
    h.appleGoal = [1];
  } else if (k === 'firerope') {
    const bejo = makeTarget(0, T - 40, G, 'hold');
    const joko = makeTarget(1, T - 250, G, 'hold');
    joko.hasApple = false;
    h.men = [bejo, joko];
    h.goals = [{ label: tx("Mr. Bejo's Apple (avoid the fire rope)", 'Apel Pak Bejo (jangan kena tali api)'), done: false }];
    h.appleGoal = [0, -1];
    Object.assign(mg, { th: 0, E2: v(T + 150, G - 150) });
  } else if (k === 'prism') {
    one(T + 10, G, 'cross');
    Object.assign(mg, { prism: v(T - 330, G - 395), shield: true, flash: 0 });
    h.goals = [{ label: tx('Shatter obsidian shield (rainbow arrow)', 'Pecahkan perisai obsidian (panah pelangi)'), done: false }, { label: tx("Mr. Bejo's Apple", 'Apel Pak Bejo'), done: false }];
    h.appleGoal = [1];
  } else if (k === 'coaster') {
    one(T - 160, G - 220, 'hold', tx("Mr. Bejo's Apple on coaster", 'Apel Pak Bejo di rollercoaster'));
    Object.assign(mg, { cx: T - 160, prevX: T - 160, spark: 0 });
  } else if (k === 'tops') {
    one(T + 60, G, 'cross');
    Object.assign(mg, { blue: { hits: 0, alive: true, fall: 0 }, clash: 0, sparks: 0 });
    h.goals = [{ label: tx("Mr. Bejo's Apple (past top duel)", 'Apel Pak Bejo (lewati duel gasing)'), done: false }];
  } else if (k === 'tarzan') {
    one(T - 340, G - 160, 'hold', tx("Mr. Bejo's Apple on the swing", 'Apel Pak Bejo di ayunan'));
    Object.assign(mg, { i: 0, ph: -Math.PI / 2, L: 200, A: Math.asin(90 / 200), vx: [T - 340, T - 160, T + 20], ay: G - 470, croc: 0 });
  } else if (k === 'tnt') {
    const m = one(T + 175, G, 'hips', tx('Collect 3 apples (0/3)', 'Kumpulkan 3 apel (0/3)'));
    m.hasApple = false;
    h.appleGoal = [-1];
    const crates: any[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      crates.push({ p: v(T - 48 + c * 48, G - 24 - r * 48), vel: v(0, 0), rot: 0, vr: 0, apple: r === 2, gone: false, rest: true });
    }
    Object.assign(mg, { crates, tnt: { p: v(T - 128, G - 26), alive: true, fuse: 0 }, apples: [] as any[], got: 0, boom: 0 });
  } else if (k === 'claw') {
    one(T + 12, G - 20, 'cross', tx("Mr. Bejo's Apple (pull from claw machine)", 'Apel Pak Bejo (keluarkan dari mesin capit)'));
    Object.assign(mg, { phase: 'idle', t: 0, cx: T - 30, cy: G - 262, open: 1, btn: 0, holding: false, flash: 0 });
  } else if (k === 'springs') {
    const m = one(T + 190, G, 'hips', tx('Sweep 3 apples behind pillar (0/3)', 'Sapu 3 apel di balik pilar (0/3)'));
    m.hasApple = false;
    h.appleGoal = [-1];
    Object.assign(mg, {
      pads: [{ x: T - 410, w: 76, fl: 0, col: '#f472b6', n: 0 }, { x: T - 270, w: 76, fl: 0, col: '#22d3ee', n: 1 }, { x: T - 140, w: 60, fl: 0, col: '#a3e635', n: 2 }],
      apples: [{ p: v(T + 5, G - 290), alive: true }, { p: v(T + 120, G - 240), alive: true }, { p: v(T + 215, G - 130), alive: true }],
      got: 0,
    });
  } else if (k === 'barongsai') {
    h.men = []; h.appleGoal = [];
    h.goals = [{ label: tx('Apple on the dragon tail', 'Apel di buntut naga'), done: false }];
    Object.assign(mg, { segs: [] as V[], dir: 1, hx: T - 400, prev: 0, apple: true, roar: 0 });
  } else if (k === 'paperplane') {
    one(T - 200, G - 260, 'hold', tx("Mr. Bejo's Apple on paper plane", 'Apel Pak Bejo di pesawat kertas'));
    Object.assign(mg, { p: v(T - 200, G - 260), ang: 0, holes: [] as V[], wob: 0 });
  } else if (k === 'hologram') {
    const m = one(T, G, 'cross', tx("The REAL Mr. Bejo's Apple", 'Apel Pak Bejo yang ASLI'));
    const holo = makeTarget(0, T - 170, G, 'cross');
    Object.assign(mg, { holo, t: 0, every: 2.6, flash: 0, swaps: 0 });
    m.hasApple = true;
  } else if (k === 'crab') {
    const m = one(T - 60, G - 200, 'hold', tx("Mr. Bejo's Apple", 'Apel Pak Bejo'));
    m.hasApple = false;
    Object.assign(mg, {
      hp: 5, hurt: 0, dead: false, fall: 0, x: T + 40, bubbles: [] as { p: V; vel: V; r: number }[], fireT: 2.2, open: 0, drop: false,
    });
    h.goals = [{ label: tx('Shoot crab eyes (0/5)', 'Tembak mata kepiting (0/5)'), done: false }, { label: tx("Mr. Bejo's Apple", 'Apel Pak Bejo'), done: false }];
    h.appleGoal = [1];
  }
}

// ---- forces on a flying arrow ------------------------------------------------------------------
export const hasField5 = (k?: string) => k === 'saturn';
export function field5(h: Host, p: V): V | null {
  const k = h.mini; const mg = h.mg;
  if (k === 'saturn') {
    const d = sub(mg.P, p); const L = len(d);
    if (L < 1 || L > 560) return v(0, 0);
    const f = Math.min(9000, 3.4e7 / (L * L)) * clamp((560 - L) / 70, 0, 1);
    return mul(d, f / L);
  }
  return null;
}


export function focus5(h: Host, m: TargetState): { c: V; h: number } | null {
  const k = h.mini;
  if (!k || !MINI5.has(k)) return null;
  const hip = joints(m)[2];
  if (hip.y < G - 140) return { c: v(hip.x - 50, Math.min(G - 150, hip.y - 40)), h: 480 };
  return null;
}

// ---- update ---------------------------------------------------------------------------------------
export function update5(h: Host, dt: number, live: boolean) {
  const T = h.T; const k = h.mini; const mg = h.mg; const lt = h.lt; const m = h.men[0];
  if (!k || !MINI5.has(k)) return;
  const flying = h.shots.filter((s) => s.state === 'fly');

  if (k === 'timevault') {
    for (const b of mg.bub) b.c.x += Math.sin(lt * b.w) * b.dx * dt;
    const d = mg.door;
    d.flash = Math.max(0, d.flash - dt);
    if (d.frozen > 0) {
      d.frozen -= dt;
      const want = m.hasApple ? Math.atan2(applePos(m).y - d.c.y, applePos(m).x - d.c.x) : 0;
      d.ang = damp(d.ang, want, 7, dt);
    } else d.ang += d.w * dt;
    for (const s of flying) {
      const x = s as any;
      const inside = mg.bub.some((b: any) => dist(s.tip, b.c) < b.r);
      if (inside && !x.bub) { x.bub = true; s.vel = mul(s.vel, 0.3); h.popText(add(s.tip, v(0, -30)), 'SLOW-MO', '#0ea5e9', 18); sfx.warp(); }
      else if (!inside && x.bub) { x.bub = false; s.vel = mul(s.vel, 1 / 0.3); }
      if (inside) s.vel.y -= GRAV * 0.91 * dt; // time runs at 30 %: gravity at 9 %, so the path itself does not change
      if (inside && Math.random() < 0.3) puff(h, s.tip, '#7dd3fc', v(0, -20), 3, 0.5);
    }
    h.miniLabel(d.frozen > 0
      ? tx(`Door FROZEN ${d.frozen.toFixed(1)}s — shoot through the gap!`, `Pintu BEKU ${d.frozen.toFixed(1)}s — tembak lewat celah!`)
      : tx('Shoot gold crystal to freeze the door', 'Tembak kristal emas untuk membekukan pintu'));
  } else if (k === 'saturn') {
    mg.flash = Math.max(0, mg.flash - dt);
    for (const s of flying) if (Math.random() < 0.25 && dist(s.tip, mg.P) < 300) puff(h, s.tip, '#c4b5fd', v(0, 0), 2.5, 0.35);
  } else if (k === 'cannon') {
    mg.t += dt;
    mg.recoil = Math.max(0, mg.recoil - dt * 2);
    mg.squash = Math.max(0, mg.squash - dt * 3);
    const FLY = 1.55;
    const C = mg.C; const D = mg.D;
    const arc = (from: V, to: V, t: number) => {
      const vx = (to.x - from.x) / FLY; const vy = (to.y - from.y) / FLY - 0.5 * 620 * FLY;
      return v(from.x + vx * t, from.y + vy * t + 0.5 * 620 * t * t);
    };
    if (m && !m.rag) {
      if (!h.goals[0].done) m.hasApple = mg.phase !== 'load';
      if (mg.phase === 'load') {
        m.x = C.x + 18; m.y = C.y + 36; m.air = 1; m.tilt = 0;
        if (mg.t > 1.3 && live) {
          mg.phase = 'fly1'; mg.t = 0; mg.recoil = 1; h.shake = Math.max(h.shake, 6); sfx.boom();
          h.burst(add(C, v(-30, -30)), 14, ['#9ca3af', '#e5e7eb', '#f97316'], 'drop', 260);
          h.popText(add(C, v(-40, -70)), tx('BOOM!', 'DUAR!'), '#f97316', 30);
        }
      } else if (mg.phase === 'fly1' || mg.phase === 'fly2') {
        const back = mg.phase === 'fly2';
        const p = arc(back ? D : C, back ? C : D, Math.min(mg.t, FLY));
        m.x = p.x; m.y = p.y; m.air = 1;
        m.tilt = (back ? 1 : -1) * 0.25 * Math.sin((mg.t / FLY) * Math.PI);
        if (mg.t >= FLY) {
          if (!back) { mg.phase = 'fly2'; mg.squash = 1; sfx.boing(); h.popText(add(D, v(0, -90)), tx('BOING!', 'DUNG!'), '#2563eb', 26); }
          else { mg.phase = 'load'; sfx.thunk(); }
          mg.t = 0;
        }
      }
    }
  } else if (k === 'domino') {
    const b = mg.ball;
    mg.flash = Math.max(0, mg.flash - dt);
    if (b.state === 'fall') {
      b.vy += 900 * dt; b.p.y += b.vy * dt;
      const d0 = mg.doms[0];
      if (!d0.go && b.p.y + 26 > G - 70 && Math.abs(b.p.x - d0.x) < 40) { d0.go = true; sfx.tuk(); }
      if (b.p.y > G - 26) { b.p.y = G - 26; b.state = 'down'; h.dust(b.p.x, 8, 150); sfx.slam(); h.shake = Math.max(h.shake, 5); }
    }
    mg.busy = b.state === 'fall';
    mg.doms.forEach((d: any, i: number) => {
      if (!d.go || d.ang >= Math.PI / 2) return;
      mg.busy = true;
      d.ang = Math.min(Math.PI / 2, d.ang + 4.6 * dt);
      if (d.ang > 0.55 && mg.doms[i + 1] && !mg.doms[i + 1].go) { mg.doms[i + 1].go = true; sfx.tuk(); }
      if (i === mg.doms.length - 1 && d.ang > 0.8 && mg.bunker) {
        mg.bunker = false;
        h.glassBurst(v(T - 50, G - 90), 24, 300);
        h.popText(v(T - 50, G - 200), tx('BUNKER SHATTERED!', 'BUNKER PECAH!'), '#0ea5e9', 28);
        sfx.shatter(); h.shake = Math.max(h.shake, 9); h.slowT = 0.3;
        h.mark(0);
      }
    });
  } else if (k === 'firerope') {
    mg.th += 4.8 * dt;
    const bejo = h.men[0];
    if (bejo && !bejo.rag) {
      const c = Math.cos(mg.th);
      bejo.y = G - 78 * Math.max(0, c);
      bejo.air = c > 0.1 ? 1 : 0;
      if (c < 0.1) bejo.dipT = Math.max(0, -c) * 10;
    }
    // sparks along the rope
    const pts = ropePts(h);
    for (let i = 0; i < 2; i++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      puff(h, p, Math.random() < 0.5 ? '#f97316' : '#fbbf24', v((Math.random() - 0.5) * 40, -60 - Math.random() * 60), 3 + Math.random() * 2, 0.35);
    }
  } else if (k === 'prism') {
    mg.flash = Math.max(0, mg.flash - dt);
    for (const s of flying) {
      if ((s as any).rainbow) {
        const i = Math.floor(lt * 30) % RAINBOW.length;
        puff(h, sub(s.tip, fromAngle(s.ang, 30 + Math.random() * 50)), RAINBOW[i], v(0, 10), 4, 0.5);
      }
    }
  } else if (k === 'coaster') {
    const u = 0.5 + 0.5 * Math.sin(lt * 1.05);
    mg.prevX = mg.cx;
    mg.cx = lerp(T - 440, T + 120, u);
    const y = trackY(T, mg.cx);
    const slope = Math.atan2(trackY(T, mg.cx + 6) - trackY(T, mg.cx - 6), 12);
    mg.slope = slope;
    if (m && !m.rag) { m.x = mg.cx; m.y = y - 14; m.tilt = slope * 0.55; m.air = 0; m.dipT = 6 + 4 * Math.abs(mg.cx - mg.prevX) / Math.max(dt, 1e-3) / 300; }
    if (Math.abs(slope) > 0.6 && Math.random() < 0.5) puff(h, v(mg.cx - 28, y + 6), '#fbbf24', v(-120, -40), 2.5, 0.25);
  } else if (k === 'tops') {
    const s = Math.sin(lt * 2.0);
    mg.s = s;
    mg.clash = Math.max(0, mg.clash - dt);
    if (s > 0.96 && mg.clash <= 0 && mg.blue.alive) {
      mg.clash = 0.5; h.shake = Math.max(h.shake, 4); sfx.ting();
      const c = v(T - 205, G - 150);
      h.burst(c, 10, ['#fbbf24', '#fde68a', '#ffffff'], 'star', 260);
    }
    if (!mg.blue.alive) mg.blue.fall = Math.min(1, mg.blue.fall + dt * 1.8);
  } else if (k === 'tarzan') {
    const HALF = Math.PI / 2;
    const prev = mg.ph;
    mg.ph += 2.1 * dt;
    if (prev < HALF && mg.ph >= HALF && mg.i < 2) { mg.i++; mg.ph -= Math.PI; sfx.hup(); }
    if (prev < 3 * HALF && mg.ph >= 3 * HALF) {
      if (mg.i > 0) { mg.i--; mg.ph -= Math.PI; sfx.hup(); } else mg.ph -= 2 * Math.PI;
    }
    const th = mg.A * Math.sin(mg.ph);
    const hand = v(mg.vx[mg.i] + mg.L * Math.sin(th), mg.ay + mg.L * Math.cos(th));
    mg.hand = hand; mg.th = th;
    if (m && !m.rag) { m.x = hand.x; m.y = hand.y + 186; m.tilt = -th * 0.6; m.air = 1; }
    mg.croc += dt;
  } else if (k === 'tnt') {
    mg.boom = Math.max(0, mg.boom - dt);
    mg.busy = false;
    for (const c of mg.crates) {
      if (c.rest || c.gone) continue;
      mg.busy = true;
      c.vel.y += 900 * dt; c.p = add(c.p, mul(c.vel, dt)); c.rot += c.vr * dt;
      if (c.p.y > G - 22) {
        c.p.y = G - 22; c.vel.y *= -0.3; c.vel.x *= 0.6; c.vr *= 0.5;
        if (Math.abs(c.vel.y) < 60) { c.rest = true; c.vel = v(0, 0); c.vr = 0; }
      }
      if (c.p.x > T + 3000 || c.p.x < -500) c.gone = true;
    }
    for (const ap of mg.apples) {
      if (ap.state !== 'air') continue;
      mg.busy = true;
      ap.vel.y += 620 * dt; ap.p = add(ap.p, mul(ap.vel, dt)); ap.rot += 4 * dt;
      if (ap.p.y > G - APPLE_R) { ap.p.y = G - APPLE_R; ap.state = 'ground'; ap.vel = v(0, 0); sfx.tuk(); }
    }
    h.miniLabel(tx(`Collect 3 apples (${mg.got}/3)` + (mg.tnt.alive ? ' — blow up TNT!' : ''), `Kumpulkan 3 apel (${mg.got}/3)` + (mg.tnt.alive ? ' — ledakkan TNT!' : '')));
  } else if (k === 'claw') {
    mg.flash = Math.max(0, mg.flash - dt);
    mg.btn = Math.max(0, mg.btn - dt * 3);
    mg.t += dt;
    const ph = mg.phase;
    const home = v(T - 30, G - 262);
    if (ph === 'down') { mg.cy = lerp(home.y, G - 205, Math.min(1, mg.t / 1.0)); mg.open = 1; if (mg.t >= 1.0) { mg.phase = 'grab'; mg.t = 0; mg.cx = T + 12; } }
    else if (ph === 'grab') { mg.open = 1 - Math.min(1, mg.t / 0.3); if (mg.t >= 0.35) { mg.phase = 'up'; mg.t = 0; mg.holding = true; sfx.boing(); } }
    else if (ph === 'up') { mg.cy = lerp(G - 205, G - 345, Math.min(1, mg.t / 1.1)); if (mg.t >= 1.1) { mg.phase = 'left'; mg.t = 0; } }
    else if (ph === 'left') { mg.cx = lerp(T + 12, T - 165, Math.min(1, mg.t / 1.2)); if (mg.t >= 1.2) { mg.phase = 'hang'; mg.t = 0; h.popText(v(mg.cx, mg.cy - 40), tx('SHOOT NOW!', 'TEMBAK SEKARANG!'), '#16a34a', 22); } }
    else if (ph === 'hang') { if (mg.t >= 3.6) { mg.phase = 'drop'; mg.t = 0; mg.holding = false; mg.open = 1; sfx.miss(); h.popText(v(mg.cx, mg.cy - 40), tx('OOPS, DROPPED…', 'YAH, LEPAS…'), '#dc2626', 22); } }
    else if (ph === 'drop') { mg.cx = lerp(T - 165, home.x, Math.min(1, mg.t / 1.2)); mg.cy = lerp(G - 345, home.y, Math.min(1, mg.t / 1.2)); if (mg.t >= 1.3) { mg.phase = 'idle'; mg.t = 0; } }
    mg.busy = ph !== 'idle' && ph !== 'hang';
    if (m && !m.rag) {
      if (mg.holding) { m.x = mg.cx; m.y = mg.cy + 168; m.air = 1; m.tilt = 0.08 * Math.sin(lt * 3); }
      else if (ph === 'drop' || (ph === 'idle' && m.y < G - 20)) {
        m.y = Math.min(G - 20, m.y + 700 * dt); m.air = m.y < G - 20 ? 1 : 0;
        if (m.y >= G - 20 && m.air === 0 && mg.t < 0.5) { m.dipT = 16; }
        m.x = damp(m.x, T + 12, 5, dt);
        m.tilt = 0;
      }
    }
    h.miniLabel(ph === 'idle'
      ? tx('Shoot the RED button above', 'Tembak tombol MERAH di atas')
      : ph === 'hang'
        ? tx('Claw lifted Mr. Bejo — shoot the apple!', 'Capit mengangkat Pak Bejo — panah apelnya!')
        : tx('Claw moving…', 'Capit bergerak…'));
  } else if (k === 'springs') {
    for (const p of mg.pads) p.fl = Math.max(0, p.fl - dt * 2.5);
  } else if (k === 'barongsai') {
    const u = 0.5 + 0.5 * Math.sin(lt * 0.5);
    const hx = lerp(T - 540, T + 150, u);
    mg.dir = hx >= mg.hx ? 1 : -1;
    mg.hx = hx;
    mg.roar = Math.max(0, mg.roar - dt);
    const segs: V[] = [];
    for (let i = 0; i < 15; i++) {
      const x = hx - mg.dir * i * 30;
      segs.push(v(x, G - 160 - 70 * Math.sin(x * 0.017 + lt * 2.6)));
    }
    mg.segs = segs;
    const tail = segs[segs.length - 1];
    mg.applePos = v(tail.x, tail.y - 26);
    if (Math.random() < 0.3) puff(h, add(segs[0], v(mg.dir * 30, 0)), '#f97316', v(mg.dir * 60, -40), 3, 0.3);
  } else if (k === 'paperplane') {
    const p = v(T - 200 + 200 * Math.sin(lt * 0.9), G - 270 + 85 * Math.sin(lt * 1.8));
    const vel = v(200 * 0.9 * Math.cos(lt * 0.9), 85 * 1.8 * Math.cos(lt * 1.8));
    mg.vel = vel;
    mg.ang = Math.atan2(vel.y, Math.abs(vel.x)) * 0.5;
    mg.flip = vel.x >= 0 ? 1 : -1;
    mg.p = p;
    mg.wob = Math.max(0, mg.wob - dt * 2);
    if (m && !m.rag) { m.x = p.x - 6 * mg.flip; m.y = p.y - 4; m.tilt = mg.ang * mg.flip * 0.8 + 0.15 * mg.wob * Math.sin(lt * 25); m.air = 0; }
  } else if (k === 'hologram') {
    const holo: TargetState = mg.holo;
    mg.flash = Math.max(0, mg.flash - dt);
    if (live && !m.rag) {
      mg.t += dt;
      if (mg.t > mg.every) {
        mg.t = 0; mg.swaps++;
        const hx = holo.x; holo.x = m.x; m.x = hx;
        mg.flash = 0.5; sfx.warp();
        h.burst(headPos(m), 10, ['#22d3ee', '#a5f3fc', '#ffffff'], 'star', 220);
        h.burst(headPos(holo), 10, ['#22d3ee', '#a5f3fc', '#ffffff'], 'star', 220);
      }
    }
    holo.look = m.look;
    updateTarget(holo, dt);
    h.miniLabel(tx(`The REAL Mr. Bejo's Apple (swaps in ${Math.max(0, mg.every - mg.t).toFixed(1)}s)`, `Apel Pak Bejo yang ASLI (tukar dalam ${Math.max(0, mg.every - mg.t).toFixed(1)}s)`));
  } else if (k === 'crab') {
    mg.hurt = Math.max(0, mg.hurt - dt);
    if (!mg.dead) {
      mg.x = T + 40 + 70 * Math.sin(lt * 0.6);
      if (m && !m.rag) { m.x = mg.x - 95; m.y = G - 215 + 6 * Math.sin(lt * 2); m.air = 1; m.tilt = 0.1 * Math.sin(lt * 2.4); }
      if (live) {
        mg.fireT -= dt;
        if (mg.fireT <= 0) {
          mg.fireT = 2.3 + Math.random() * 0.8;
          const from = v(mg.x + 40, G - 150);
          const to = h.chest();
          const d = sub(to, from); const L = len(d) || 1;
          mg.bubbles.push({ p: from, vel: mul(d, 250 / L), r: 20 + Math.random() * 8 });
          sfx.pop();
        }
      }
    } else {
      mg.fall = Math.min(1, mg.fall + dt * 1.5);
      if (m && !m.rag) {
        if (m.y < G) { m.y = Math.min(G, m.y + 600 * dt); m.air = 1; if (m.y >= G) { m.air = 0; m.dipT = 18; h.dust(m.x, 8); sfx.hup(); } }
        if (!m.hasApple && m.y >= G && !mg.drop) { mg.drop = true; m.hasApple = true; m.pose = 'hips'; }
      }
    }
    for (const b of [...mg.bubbles]) {
      b.p = add(b.p, mul(b.vel, dt));
      b.p.y += Math.sin(lt * 6 + b.r) * 20 * dt;
      if (!h.result && dist(b.p, h.chest()) < b.r + 14) {
        mg.bubbles.splice(mg.bubbles.indexOf(b), 1);
        h.burst(b.p, 10, ['#bae6fd', '#7dd3fc', '#ffffff'], 'drop', 200);
        h.hurtMe('bubble', b.p);
      } else if (b.p.x < -400 || b.p.y > G) mg.bubbles.splice(mg.bubbles.indexOf(b), 1);
    }
    h.goals[0].label = mg.dead
      ? tx('Crab defeated!', 'Kepiting tumbang!')
      : tx(`Shoot crab eyes (${5 - mg.hp}/5)`, `Tembak mata kepiting (${5 - mg.hp}/5)`);
  }
}

// ---- helpers shared by update / collide / draw -----------------------------------------------------
function ropePts(h: Host): V[] {
  const mg = h.mg; const joko = h.men[1];
  const E1 = joko ? joints(joko)[4] : v(h.T - 250, G - 150);
  const E2: V = mg.E2;
  const mid = lerpV(E1, E2, 0.5);
  const sag = 150 * Math.cos(mg.th);
  const pts: V[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const p = lerpV(E1, E2, u);
    pts.push(v(p.x, Math.min(G - 4, p.y + sag * 4 * u * (1 - u) + (mid.y - p.y) * 0)));
  }
  return pts;
}
const trackY = (T: number, x: number) => G - 215 - 95 * Math.sin((x - T + 200) / 85);

// ---- collisions -------------------------------------------------------------------------------------
export function collide5(h: Host, s: Shot): boolean | null {
  const T = h.T; const k = h.mini; const mg = h.mg; const tip = s.tip; const x = s as any;
  if (!k || !MINI5.has(k)) return null;
  const drop = () => { h.tumble(s); return true; };

  if (k === 'timevault') {
    const c = mg.crystal;
    if (c.alive && dist(tip, c.p) < 26) {
      c.alive = false; mg.door.frozen = 6; mg.door.flash = 1;
      h.burst(c.p, 18, ['#fbbf24', '#fde68a', '#ffffff', '#f59e0b'], 'star', 320);
      h.popText(add(c.p, v(0, -50)), tx('TIME FROZEN!', 'WAKTU BEKU!'), '#d97706', 30);
      h.mark(0); h.slowT = 0.3; sfx.ting();
      return false;
    }
    const d = mg.door;
    const rel = sub(tip, d.c); const L = len(rel);
    if (L < d.r && L > 0) {
      const n = fromAngle(d.ang + Math.PI / 2);
      const off = Math.abs(rel.x * n.x + rel.y * n.y);
      if (off > 13) {
        h.burst(tip, 5, ['#cbd5e1', '#94a3b8'], 'drop', 120);
        if (!s.apples) h.popText(add(tip, v(-20, -30)), tx('CLANG!', 'TENG!'), '#64748b', 22);
        sfx.ting();
        return stick(s, 4);
      }
    }
  } else if (k === 'saturn') {
    if (dist(tip, mg.P) < mg.r + 2) {
      mg.flash = 1;
      h.burst(tip, 8, ['#c4b5fd', '#a78bfa', '#ffffff'], 'drop', 150);
      if (!s.apples) h.popText(add(tip, v(0, -40)), tx('STUCK IN PLANET!', 'TANCAP DI PLANET!'), '#7c3aed', 22);
      return stick(s, 6);
    }
    if (tip.x > T - 80 && tip.x < T - 56 && tip.y > G - 250) {
      h.burst(tip, 5, ['#cbd5e1', '#e2e8f0'], 'drop', 120);
      if (!s.apples) h.popText(add(tip, v(-30, -30)), 'TITANIUM!', '#475569', 22);
      sfx.ting();
      return drop();
    }
  } else if (k === 'cannon') {
    const C = mg.C;
    if (dist(tip, add(C, v(60, 40))) < 60 || (tip.x > T - 5 && tip.x < T + 120 && tip.y > G - 90)) return stick(s);
    if (Math.abs(tip.x - mg.D.x) < 70 && tip.y > mg.D.y && tip.y < G) {
      mg.squash = 0.6; sfx.boing();
      s.vel = v(s.vel.x * 0.8, -Math.abs(s.vel.y) * 0.8 - 150);
      s.ang = Math.atan2(s.vel.y, s.vel.x);
      h.popText(add(tip, v(0, -30)), tx('BOING!', 'DUNG!'), '#2563eb', 22);
      return false;
    }
  } else if (k === 'domino') {
    const A = v(T - 395, G - 470);
    const b = mg.ball;
    if (mg.rope && b.state === 'hang' && segDist(tip, A, v(b.p.x, b.p.y - 26)).d < 6) {
      mg.rope = false; b.state = 'fall'; mg.busy = true;
      h.burst(tip, 8, ['#8a6a3c', '#c9a86a', '#fff'], 'drop', 160);
      h.popText(add(tip, v(0, -40)), tx('SNAPPED!', 'PUTUS!'), '#f97316', 28);
      sfx.snap(); h.slowT = 0.25;
      return false;
    }
    if (dist(tip, b.p) < 27) return stick(s, 5);
    if (tip.x > T - 452 && tip.x < T - 436 && tip.y > G - 85) return stick(s);
    for (const d of mg.doms) {
      if (d.go) continue;
      if (Math.abs(tip.x - d.x) < 8 && tip.y > G - 72 && tip.y < G) { d.go = true; sfx.tuk(); return drop(); }
    }
    if (mg.bunker && tip.x > T - 52 && tip.x < T + 52 && tip.y > G - 172) {
      mg.flash = 1;
      h.glassBurst(tip, 6, 150);
      if (!s.apples) h.popText(add(tip, v(-40, -30)), tx('BULLETPROOF GLASS!', 'KACA ANTI-PANAH!'), '#0ea5e9', 20);
      sfx.ting();
      return drop();
    }
  } else if (k === 'firerope') {
    const pts = ropePts(h);
    for (let i = 0; i < pts.length - 1; i++) {
      if (segDist(tip, pts[i], pts[i + 1]).d < 8) {
        h.burst(tip, 14, ['#f97316', '#fbbf24', '#ef4444', '#1f2937'], 'star', 260);
        h.miniLose('burn', tip, tx('SCORCHED!', 'GOSONG!'));
        return drop();
      }
    }
    if (Math.abs(tip.x - mg.E2.x) < 7 && tip.y > mg.E2.y - 10 && tip.y < G) return stick(s);
  } else if (k === 'prism') {
    if (!x.rainbow && dist(tip, mg.prism) < 32) {
      x.rainbow = true; mg.flash = 1;
      s.vel = mul(s.vel, 1.3); s.grace = 0;
      h.burst(tip, 18, RAINBOW, 'star', 300);
      h.popText(add(tip, v(0, -50)), tx('RAINBOW ARROW!', 'PANAH PELANGI!'), '#8b5cf6', 28);
      sfx.beam(); h.slowT = 0.25;
      return false;
    }
    if (mg.shield && tip.x > T - 64 && tip.x < T - 42 && tip.y > G - 232) {
      if (x.rainbow) {
        mg.shield = false;
        h.burst(tip, 26, ['#1f2937', '#4b5563', ...RAINBOW], 'drop', 320);
        h.popText(add(tip, v(0, -60)), tx('OBSIDIAN SHATTERED!', 'OBSIDIAN PECAH!'), '#16a34a', 28);
        sfx.shatter(); h.shake = Math.max(h.shake, 9); h.mark(0);
        return false;
      }
      h.burst(tip, 5, ['#4b5563', '#9ca3af'], 'drop', 120);
      if (!s.apples) h.popText(add(tip, v(-30, -30)), tx('OBSIDIAN! NEED RAINBOW', 'OBSIDIAN! BUTUH PELANGI'), '#1f2937', 18);
      sfx.ting();
      return drop();
    }
  } else if (k === 'coaster') {
    const cy = trackY(T, mg.cx);
    if (Math.abs(tip.x - mg.cx) < 34 && tip.y > cy - 34 && tip.y < cy + 6) return stick(s);
  } else if (k === 'tops') {
    const s_ = mg.s ?? 0;
    const R = v(T - 300 + 55 * s_, G - 100);
    const B = v(T - 110 - 55 * s_, G - 92);
    if (dist(tip, R) < 100) {
      h.burst(tip, 12, ['#ef4444', '#fbbf24', '#ffffff'], 'star', 280);
      h.popText(add(tip, v(0, -40)), tx('OUCH! SPIKES!', 'DUAR! DURI!'), '#dc2626', 24);
      sfx.ting(); h.shake = Math.max(h.shake, 5);
      s.vel = v(-Math.abs(s.vel.x) * 0.3, -Math.abs(s.vel.y) - 320); s.ang = Math.atan2(s.vel.y, s.vel.x);
      s.state = 'bounce'; s.spin = 14; s.tip = sub(tip, fromAngle(s.ang, ARROW_LEN / 2));
      return true;
    }
    if (mg.blue.alive) {
      const crown = v(B.x, B.y - 86);
      if (dist(tip, crown) < 15) {
        mg.blue.hits++;
        h.burst(crown, 10, ['#3b82f6', '#bfdbfe', '#ffffff'], 'star', 240);
        if (mg.blue.hits >= 2) {
          mg.blue.alive = false; sfx.slam(); h.shake = Math.max(h.shake, 8);
          h.popText(add(crown, v(0, -40)), tx('BLUE TOP KNOCKED OUT!', 'GASING BIRU TUMBANG!'), '#2563eb', 26);
        } else { sfx.tuk(); h.popText(add(crown, v(0, -40)), tx('BUTTON HIT! 1 MORE', 'TOMBOL! 1 LAGI'), '#2563eb', 22); }
        return drop();
      }
      if (dist(tip, B) < 86) return stick(s, 5);
    } else if (tip.y > G - 40 && tip.x > B.x - 110 && tip.x < B.x + 60) return stick(s, 5);
  } else if (k === 'tarzan') {
    // vines are soft, the water is deep
    if (tip.y > G - 30 && tip.x > T - 430 && tip.x < T + 130) {
      h.burst(v(tip.x, G - 30), 8, ['#7dd3fc', '#bae6fd', '#ffffff'], 'drop', 160);
      if (!s.apples) h.popText(v(tip.x, G - 70), tx('SPLASH!', 'BYUR!'), '#0ea5e9', 22);
      sfx.step();
      h.shots.splice(h.shots.indexOf(s), 1);
      return true;
    }
  } else if (k === 'tnt') {
    const t = mg.tnt;
    if (t.alive && dist(tip, t.p) < 26) {
      t.alive = false; mg.boom = 1; mg.busy = true;
      h.burst(t.p, 30, ['#f97316', '#fbbf24', '#ef4444', '#1f2937'], 'star', 420);
      h.burst(t.p, 20, ['#9ca3af', '#6b7280'], 'drop', 320);
      h.popText(add(t.p, v(0, -80)), 'BOOM!', '#f97316', 40);
      sfx.boom(); h.shake = 16; h.slowT = 0.5;
      mg.crates.forEach((c: any, i: number) => {
        c.rest = false;
        const d = sub(c.p, t.p); const L = len(d) || 1;
        c.vel = v((d.x / L) * (260 + Math.random() * 120) + 80, -(380 + Math.random() * 260));
        c.vr = (Math.random() - 0.5) * 9;
        if (c.apple) {
          c.apple = false;
          const n = mg.apples.length;
          mg.apples.push({ p: { ...c.p }, vel: v(90 + n * 12 + (Math.random() - 0.5) * 20, -660 - n * 18), rot: 0, state: 'air' });
        }
        void i;
      });
      for (const m of h.men) m.brow = 1;
      h.shots.splice(h.shots.indexOf(s), 1);
      return true;
    }
    for (const ap of mg.apples) {
      if (ap.state === 'gone') continue;
      if (dist(tip, ap.p) < APPLE_R + 7) {
        ap.state = 'gone'; mg.got++;
        if (mg.got >= 3) { h.mark(0); }
        h.appleFx(s, { ...ap.p });
        return false;
      }
    }
    for (const c of mg.crates) {
      if (c.gone) continue;
      if (Math.abs(tip.x - c.p.x) < 23 && Math.abs(tip.y - c.p.y) < 23) {
        if (!s.apples) h.popText(add(tip, v(-20, -30)), tx('THUNK!', 'TOK!'), '#8a5a2e', 22);
        x.crate = c; x.crateOff = sub(add(tip, fromAngle(s.ang, 8)), c.p);
        return stick(s);
      }
    }
  } else if (k === 'claw') {
    const btn = v(T - 215, G - 340);
    if (mg.phase === 'idle' && dist(tip, btn) < 18) {
      mg.phase = 'down'; mg.t = 0; mg.btn = 1; mg.cx = T - 30;
      h.burst(btn, 10, ['#ef4444', '#fca5a5', '#ffffff'], 'star', 220);
      h.popText(add(btn, v(0, -40)), tx('CLICK!', 'KLIK!'), '#dc2626', 26);
      sfx.click();
      return drop();
    }
    if (Math.abs(tip.x - (T - 215)) < 6 && tip.y > G - 330 && tip.y < G) return stick(s);
    if (tip.x > T - 96 && tip.x < T + 96 && tip.y > G - 300 && tip.y < G - 240) return stick(s);
    if (tip.x > T - 92 && tip.x < T + 92 && tip.y > G - 240 && tip.y < G) {
      mg.flash = 1;
      h.glassBurst(tip, 5, 140);
      if (!s.apples) h.popText(add(tip, v(-40, -30)), tx('MACHINE GLASS!', 'KACA MESIN!'), '#0ea5e9', 20);
      sfx.ting();
      return drop();
    }
  } else if (k === 'springs') {
    for (const p of mg.pads) {
      if (tip.y >= G - 12 && Math.abs(tip.x - p.x) < p.w / 2 && s.vel.y > 0) {
        p.fl = 1;
        s.tip = v(tip.x, G - 14);
        s.vel = v(s.vel.x * 0.95, -Math.max(Math.abs(s.vel.y) * 1.15, 760));
        s.ang = Math.atan2(s.vel.y, s.vel.x);
        s.grace = 20;
        h.burst(s.tip, 10, [p.col, '#ffffff'], 'star', 220);
        h.popText(add(s.tip, v(0, -50)), ['DO!', 'MI!', 'SOL!'][p.n], p.col, 26);
        sfx.note(p.n);
        return false;
      }
    }
    for (const ap of mg.apples) {
      if (ap.alive && dist(tip, ap.p) < APPLE_R + 6) {
        ap.alive = false; mg.got++;
        h.goals[0].label = tx(`Sweep 3 apples behind pillar (${mg.got}/3)`, `Sapu 3 apel di balik pilar (${mg.got}/3)`);
        if (mg.got >= 3) h.mark(0);
        h.appleFx(s, { ...ap.p });
        return false;
      }
    }
    if (tip.x > T - 72 && tip.x < T - 28 && tip.y > G - 252) return stick(s);
  } else if (k === 'barongsai') {
    if (mg.apple && mg.applePos && dist(tip, mg.applePos) < APPLE_R + 7) {
      mg.apple = false; h.mark(0); h.appleFx(s, { ...mg.applePos });
      return false;
    }
    const segs: V[] = mg.segs;
    if (segs.length && dist(tip, segs[0]) < 38) {
      mg.roar = 1;
      h.burst(tip, 14, ['#ef4444', '#fbbf24', '#ffffff'], 'star', 300);
      h.miniLose('dragon', tip, tx('ANGRY DRAGON! ROAR!', 'NAGA MARAH! AUM!'));
      return drop();
    }
    for (let i = 1; i < segs.length - 1; i++) {
      if (dist(tip, segs[i]) < 23) {
        h.burst(tip, 6, ['#fbbf24', '#ef4444'], 'drop', 140);
        if (!s.apples) h.popText(add(tip, v(0, -36)), tx('THUD!', 'PLOK!'), '#b91c1c', 22);
        sfx.tuk();
        return drop();
      }
    }
  } else if (k === 'paperplane') {
    const p: V = mg.p; const f = mg.flip;
    const nose = add(p, v(f * 78, 0)); const tail = add(p, v(-f * 70, 8));
    if (!x.tore && segDist(tip, nose, tail).d < 11) {
      x.tore = true; mg.wob = 1;
      mg.holes.push(sub(tip, p));
      if (mg.holes.length > 6) mg.holes.shift();
      h.burst(tip, 6, ['#e2e8f0', '#ffffff'], 'drop', 120);
      if (!s.apples) h.popText(add(tip, v(0, -34)), tx('RIP!', 'SREK!'), '#64748b', 22);
      s.vel = mul(s.vel, 0.9);
      sfx.pick();
      return false;
    }
  } else if (k === 'hologram') {
    const holo: TargetState = mg.holo;
    if (!x.holo && (dist(tip, applePos(holo)) < APPLE_R + 4 || hitTest(holo, tip))) {
      x.holo = true;
      h.burst(tip, 10, ['#22d3ee', '#a5f3fc', '#ffffff'], 'drop', 160);
      h.popText(add(tip, v(0, -50)), 'HOLOGRAM!', '#0891b2', 26);
      sfx.zap();
      return false;
    }
  } else if (k === 'crab') {
    const m = h.men[0];
    for (const b of mg.bubbles) {
      if (dist(tip, b.p) < b.r + 4) {
        mg.bubbles.splice(mg.bubbles.indexOf(b), 1);
        h.burst(b.p, 10, ['#bae6fd', '#7dd3fc', '#ffffff'], 'drop', 200);
        h.popText(add(b.p, v(0, -30)), 'POP!', '#0ea5e9', 22);
        sfx.pop();
        return false;
      }
    }
    if (!mg.dead) {
      // the free claw covers the apple
      if (m && !m.rag) {
        const ap = add(headPos(m), v(0, -29));
        if (dist(tip, ap) < 30) {
          h.burst(tip, 6, ['#fca5a5', '#ef4444'], 'drop', 120);
          if (!s.apples) h.popText(add(tip, v(0, -40)), tx('CLAWED! SHOOT ITS EYES', 'CAPIT! TEMBAK MATANYA'), '#b91c1c', 18);
          sfx.ting();
          return drop();
        }
      }
      for (let i = 0; i < 2; i++) {
        const e = crabEye(h, i);
        if (dist(tip, e) < 17) {
          mg.hp--; mg.hurt = 1;
          h.burst(e, 12, ['#ffffff', '#1f2937', '#ef4444'], 'star', 260);
          h.popText(add(e, v(0, -40)), mg.hp > 0 ? tx('OUCH!', 'AWW!') : 'K.O.!', '#dc2626', 28);
          sfx.ouch(); h.shake = Math.max(h.shake, 7); h.slowT = 0.2;
          if (mg.hp <= 0) { mg.dead = true; h.mark(0); h.popText(v(mg.x, G - 260), tx('CRAB DEFEATED!', 'KEPITING TUMBANG!'), '#16a34a', 30); }
          return drop();
        }
      }
      if (Math.abs(tip.x - mg.x) < 85 && tip.y > G - 150 && tip.y < G) {
        h.burst(tip, 5, ['#fca5a5', '#ef4444'], 'drop', 120);
        if (!s.apples) h.popText(add(tip, v(0, -40)), tx('HARD SHELL!', 'CANGKANG KERAS!'), '#b91c1c', 20);
        sfx.ting();
        return drop();
      }
    } else if (Math.abs(tip.x - mg.x) < 85 && tip.y > G - 100) return stick(s);
  }
  return null;
}

function crabEye(h: Host, i: number): V {
  const mg = h.mg;
  return v(mg.x - 28 + i * 56, G - 150 - 70 - 22 * Math.sin(h.lt * 3 + i * 2) + (mg.dead ? 90 : 0));
}

// arrows lodged in a flying crate ride along
export function carry5(h: Host) {
  if (h.mini !== 'tnt') return;
  for (const s of h.shots) {
    const x = s as any;
    if (s.state === 'stuck' && x.crate) s.tip = add(x.crate.p, x.crateOff);
  }
}

// ---- drawing: behind the men ----------------------------------------------------------------------
export function draw5(h: Host) {
  const ctx = h.ctx; const T = h.T; const k = h.mini; const mg = h.mg; const lt = h.lt;
  if (!k || !MINI5.has(k)) return;

  if (k === 'timevault') {
    for (const b of mg.bub) {
      ctx.save(); ctx.globalAlpha = 0.18; disc(ctx, b.c, b.r, '#38bdf8'); ctx.restore();
      ring(ctx, b.c, b.r, 'rgba(14,165,233,0.55)', 2.5);
      ctx.save(); ctx.globalAlpha = 0.5; disc(ctx, add(b.c, v(-b.r * 0.4, -b.r * 0.45)), b.r * 0.16, '#ffffff'); ctx.restore();
      // little clock
      ring(ctx, b.c, 14, '#0284c7', 2.5);
      stroke(ctx, [b.c, add(b.c, fromAngle(-Math.PI / 2 + (lt * 0.5) % (Math.PI * 2), 9))], '#0284c7', 2.5);
      stroke(ctx, [b.c, add(b.c, fromAngle(-Math.PI / 2 + lt * 0.08, 6))], '#0284c7', 2.5);
    }
    const c = mg.crystal;
    if (c.alive) {
      const p = add(c.p, v(0, 8 * Math.sin(lt * 2)));
      glow(ctx, p, 40, '#fde68a', 0.35 + 0.15 * Math.sin(lt * 5));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(lt * 1.2);
      box(ctx, -16, -16, 32, 32, '#f59e0b', 5); box(ctx, -9, -9, 18, 18, '#fde68a', 3);
      ctx.restore();
    }
    // vault frame around the door
    const d = mg.door;
    box(ctx, d.c.x - 14, G - 280, 28, 280 - 0, '#9aa3ad', 4);
    box(ctx, d.c.x - 120, G - 280, 240, 24, '#9aa3ad', 6);
    box(ctx, T - 30, G - 256, 180, 10, '#cbd5e1');
  } else if (k === 'saturn') {
    const P: V = mg.P;
    // orbit hint
    ctx.setLineDash([4, 9]); ring(ctx, P, 140, 'rgba(124,58,237,0.25)', 1.5); ring(ctx, P, 230, 'rgba(124,58,237,0.15)', 1.5); ctx.setLineDash([]);
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(-0.35);
    ctx.strokeStyle = '#c4b5fd'; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(0, 0, 92, 24, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
    ctx.restore();
    glow(ctx, P, 60, '#a78bfa', 0.2 + 0.4 * mg.flash);
    disc(ctx, P, mg.r, '#7c3aed'); disc(ctx, add(P, v(-10, -10)), mg.r * 0.45, '#a78bfa');
    box(ctx, P.x - 42, P.y - 6, 84, 8, '#6d28d9');
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(-0.35);
    ctx.strokeStyle = '#ddd6fe'; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(0, 0, 92, 24, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.restore();
    // titanium wall
    box(ctx, T - 80, G - 250, 24, 250, '#64748b', 4); box(ctx, T - 76, G - 246, 6, 242, '#94a3b8');
    label(ctx, v(T - 68, G - 265), 'Ti', '#475569', 13);
  } else if (k === 'cannon') {
    const D: V = mg.D;
    // bouncing drum
    const sq = 1 - 0.18 * mg.squash;
    groundShadow(ctx, D.x, G, 90, 0.12);
    ctx.save(); ctx.translate(D.x, G); ctx.scale(1 + 0.18 * mg.squash, sq);
    box(ctx, -70, -(G - D.y), 140, G - D.y, '#2563eb', 10);
    box(ctx, -70, -(G - D.y), 140, 14, '#93c5fd', 6);
    for (let i = 0; i < 5; i++) stroke(ctx, [v(-62 + i * 31, -(G - D.y) + 20), v(-62 + i * 31, -8)], 'rgba(255,255,255,0.35)', 4);
    ctx.restore();
    // cannon
    const C: V = mg.C;
    groundShadow(ctx, T + 60, G, 90, 0.12);
    ctx.save(); ctx.translate(C.x + 60, G - 40); ctx.rotate(-2.35); ctx.translate(-mg.recoil * 16, 0);
    box(ctx, -20, -26, 150, 52, '#334155', 12); box(ctx, 118, -30, 20, 60, '#1e293b', 6);
    for (let i = 0; i < 3; i++) stroke(ctx, [v(10 + i * 36, -26), v(10 + i * 36, 26)], '#475569', 4);
    ctx.restore();
    box(ctx, T + 8, G - 60, 112, 60, '#ef4444', 10); box(ctx, T + 8, G - 60, 112, 12, '#fecaca', 6);
    disc(ctx, v(T + 36, G - 22), 20, '#fbbf24'); disc(ctx, v(T + 92, G - 22), 20, '#fbbf24');
    disc(ctx, v(T + 36, G - 22), 7, '#b45309'); disc(ctx, v(T + 92, G - 22), 7, '#b45309');
    label(ctx, v(T + 64, G - 44), tx('CIRCUS', 'SIRKUS'), '#ffffff', 11);
    // path hint
    ctx.fillStyle = 'rgba(37,99,235,0.18)';
    for (let t = 0.1; t < 1.5; t += 0.1) {
      const vx = (D.x - C.x) / 1.55; const vy = (D.y - C.y) / 1.55 - 0.5 * 620 * 1.55;
      ctx.beginPath(); ctx.arc(C.x + vx * t, C.y + vy * t + 0.5 * 620 * t * t, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (k === 'domino') {
    const A = v(T - 395, G - 470);
    box(ctx, A.x - 60, A.y - 14, 120, 14, '#8a6a3c', 4);
    box(ctx, A.x + 50, A.y - 14, 10, 470, '#b08c5a');
    const b = mg.ball;
    if (mg.rope && b.state === 'hang') stroke(ctx, [A, v(b.p.x, b.p.y - 26)], '#8a6a3c', 3);
    else stroke(ctx, [A, add(A, v(8 * Math.sin(lt * 5), 30))], '#8a6a3c', 3);
    groundShadow(ctx, b.p.x, G, 50, 0.1);
    disc(ctx, b.p, 26, '#1f2937'); disc(ctx, add(b.p, v(-8, -9)), 8, '#4b5563');
    for (const o of [v(-5, 4), v(5, 4), v(0, -5)]) disc(ctx, add(b.p, o), 3, '#111827');
    drawWoodWall(ctx, T - 452, T - 436, G, 85);
    for (const d of mg.doms) {
      ctx.save(); ctx.translate(d.x + 7, G); ctx.rotate(d.ang);
      box(ctx, -14, -72, 14, 72, '#f8fafc', 3);
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1.5; ctx.strokeRect(-14, -72, 14, 72);
      stroke(ctx, [v(-13, -36), v(-1, -36)], '#1f2937', 1.5);
      for (const o of [v(-7, -54), v(-7, -18)]) disc(ctx, o, 2.5, '#1f2937');
      ctx.restore();
    }
  } else if (k === 'firerope') {
    const E2: V = mg.E2;
    box(ctx, E2.x - 8, E2.y, 16, G - E2.y, '#6b7280', 4);
    disc(ctx, E2, 14, '#374151'); disc(ctx, E2, 6, '#f97316');
    ctx.save(); ctx.translate(E2.x, E2.y); ctx.rotate(mg.th); box(ctx, -3, -24, 6, 24, '#9ca3af', 2); ctx.restore();
    // scorch marks on the floor
    for (let i = 0; i < 6; i++) { ctx.save(); ctx.globalAlpha = 0.12; disc(ctx, v(T - 200 + i * 60, G - 2), 10, '#1f2937'); ctx.restore(); }
  } else if (k === 'prism') {
    const p = add(mg.prism, v(0, 8 * Math.sin(lt * 1.8)));
    // light beams
    ctx.save(); ctx.globalAlpha = 0.22;
    RAINBOW.forEach((c, i) => stroke(ctx, [p, add(p, fromAngle(0.35 + i * 0.09, 160))], c, 4));
    ctx.restore();
    glow(ctx, p, 44, '#ffffff', 0.5 * mg.flash);
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = '#e0f2fe'; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(30, 20); ctx.lineTo(-30, 20); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3; ctx.stroke();
    stroke(ctx, [v(-8, 0), v(4, -18)], '#ffffff', 3);
    ctx.restore();
  } else if (k === 'coaster') {
    // supports + rails
    for (let x = T - 480; x <= T + 160; x += 64) {
      const y = trackY(T, x);
      box(ctx, x - 4, y, 8, G - y, '#cbd5e1');
      if (x + 64 <= T + 160) stroke(ctx, [v(x, y + 30), v(x + 64, trackY(T, x + 64) + 30)], '#e2e8f0', 3);
    }
    const rail: V[] = [];
    for (let x = T - 500; x <= T + 180; x += 10) rail.push(v(x, trackY(T, x)));
    stroke(ctx, rail, '#ef4444', 7);
    stroke(ctx, rail.map((p) => v(p.x, p.y + 10)), '#ef4444', 4);
    for (let i = 0; i < rail.length; i += 2) stroke(ctx, [rail[i], v(rail[i].x, rail[i].y + 10)], '#b91c1c', 3);
  } else if (k === 'tops') {
    const s_ = mg.s ?? 0;
    const R = v(T - 300 + 55 * s_, G - 100);
    const B = v(T - 110 - 55 * s_, G - 92);
    groundShadow(ctx, R.x, G, 150, 0.12);
    // red spiked top
    ctx.save(); ctx.translate(R.x, R.y);
    for (let i = 0; i < 12; i++) {
      const a = lt * 14 + (i * Math.PI) / 6;
      ctx.fillStyle = '#b91c1c'; ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.12) * 86, Math.sin(a - 0.12) * 86); ctx.lineTo(Math.cos(a) * 104, Math.sin(a) * 104); ctx.lineTo(Math.cos(a + 0.12) * 86, Math.sin(a + 0.12) * 86); ctx.fill();
    }
    disc(ctx, v(0, 0), 88, '#ef4444');
    for (let i = 0; i < 4; i++) { ctx.save(); ctx.rotate(lt * 14 + i * Math.PI / 2); box(ctx, -5, -80, 10, 160, 'rgba(255,255,255,0.35)', 4); ctx.restore(); }
    disc(ctx, v(0, 0), 22, '#7f1d1d');
    ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.moveTo(-28, 70); ctx.lineTo(28, 70); ctx.lineTo(0, 106); ctx.fill();
    ctx.restore();
    if (mg.blue.alive) {
      groundShadow(ctx, B.x, G, 130, 0.12);
      ctx.save(); ctx.translate(B.x, B.y);
      disc(ctx, v(0, 0), 82, '#2563eb');
      for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(-lt * 11 + i * Math.PI / 3); box(ctx, -6, -76, 12, 152, 'rgba(255,255,255,0.3)', 4); ctx.restore(); }
      disc(ctx, v(0, 0), 20, '#1e3a8a');
      ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.moveTo(-26, 66); ctx.lineTo(26, 66); ctx.lineTo(0, 100); ctx.fill();
      box(ctx, -7, -96, 14, 20, '#1e3a8a', 3);
      const pulse = (lt * 1.2) % 1;
      ring(ctx, v(0, -86), 12 + pulse * 10, `rgba(239,68,68,${0.7 * (1 - pulse)})`, 3);
      disc(ctx, v(0, -86), 10, mg.blue.hits ? '#f97316' : '#ef4444');
      ctx.restore();
    } else {
      // toppled, lying on its side
      ctx.save(); ctx.translate(B.x - 20, G - 40); ctx.rotate(Math.PI / 2 * mg.blue.fall); ctx.translate(0, -50 * (1 - mg.blue.fall));
      disc(ctx, v(0, 0), 40, '#2563eb'); disc(ctx, v(0, 0), 10, '#1e3a8a');
      ctx.restore();
    }
    if (mg.clash > 0) {
      const c = v(T - 205, G - 150);
      ctx.save(); ctx.globalAlpha = mg.clash * 2;
      for (let i = 0; i < 8; i++) stroke(ctx, [c, add(c, fromAngle((i * Math.PI) / 4 + lt * 5, 30 + 30 * (1 - mg.clash * 2)))], '#fbbf24', 3);
      ctx.restore();
    }
  } else if (k === 'tarzan') {
    // canopy beam + vines
    box(ctx, T - 440, mg.ay - 16, 580, 16, '#4d7c0f', 6);
    for (let i = 0; i < 3; i++) {
      const top = v(mg.vx[i], mg.ay);
      const end = i === mg.i && mg.hand ? mg.hand : v(mg.vx[i] + 6 * Math.sin(lt * 1.3 + i), mg.ay + mg.L);
      const mid = lerpV(top, end, 0.5);
      stroke(ctx, [top, add(mid, v(i === mg.i ? 0 : 10 * Math.sin(lt + i), 0)), end], '#65a30d', 5);
      stroke(ctx, [top, add(mid, v(i === mg.i ? 0 : 10 * Math.sin(lt + i), 0)), end], '#a3e635', 2);
    }
    // crocodile pool
    const y = G - 28;
    box(ctx, T - 430, y, 560, 28, '#bae6fd', 6);
    stroke(ctx, [v(T - 430, y + 2), v(T + 130, y + 2)], '#7dd3fc', 3, 'butt');
    for (let i = 0; i < 3; i++) {
      const cx = T - 330 + i * 190 + 30 * Math.sin(lt * 0.8 + i * 2);
      const open = Math.max(0, Math.sin(lt * 2.5 + i * 1.7));
      box(ctx, cx - 50, y - 10, 100, 12, '#15803d', 6);
      ctx.save(); ctx.translate(cx + 50, y - 4); ctx.rotate(-0.9 * open); box(ctx, -60, -12, 60, 12, '#166534', 4);
      for (let t = 0; t < 5; t++) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-54 + t * 12, 0); ctx.lineTo(-49 + t * 12, 6); ctx.lineTo(-44 + t * 12, 0); ctx.fill(); }
      ctx.restore();
      disc(ctx, v(cx - 20, y - 14), 6, '#15803d'); disc(ctx, v(cx - 20, y - 15), 2.5, '#fbbf24');
    }
  } else if (k === 'tnt') {
    for (const c of mg.crates) {
      if (c.gone) continue;
      ctx.save(); ctx.translate(c.p.x, c.p.y); ctx.rotate(c.rot);
      box(ctx, -23, -23, 46, 46, '#c58f52', 4);
      ctx.strokeStyle = '#8a5a2e'; ctx.lineWidth = 2; ctx.strokeRect(-23, -23, 46, 46);
      stroke(ctx, [v(-23, -23), v(23, 23)], '#8a5a2e', 2); stroke(ctx, [v(23, -23), v(-23, 23)], '#8a5a2e', 2);
      if (c.apple) drawApple(ctx, v(0, 0), 10);
      ctx.restore();
    }
    const t = mg.tnt;
    if (t.alive) {
      box(ctx, t.p.x - 22, t.p.y - 28, 44, 54, '#dc2626', 6);
      box(ctx, t.p.x - 22, t.p.y - 10, 44, 10, '#7f1d1d');
      label(ctx, t.p, 'TNT', '#ffffff', 12);
      const fz = add(t.p, v(0, -28 - 14 * Math.abs(Math.sin(lt * 2))));
      stroke(ctx, [add(t.p, v(0, -28)), fz], '#1f2937', 2);
      disc(ctx, fz, 4 + 2 * Math.sin(lt * 20), '#f97316');
    }
    for (const ap of mg.apples) if (ap.state !== 'gone') drawApple(ctx, ap.p, APPLE_R, ap.rot);
  } else if (k === 'claw') {
    // button pole
    box(ctx, T - 220, G - 330, 10, 330, '#9ca3af');
    box(ctx, T - 240, G - 334, 50, 14, '#6b7280', 4);
    const by = G - 340 + 6 * mg.btn;
    disc(ctx, v(T - 215, by), 18, '#ef4444'); disc(ctx, v(T - 220, by - 5), 6, '#fca5a5');
    const pulse = (lt * 1.1) % 1;
    if (mg.phase === 'idle') ring(ctx, v(T - 215, G - 340), 22 + pulse * 16, `rgba(239,68,68,${0.6 * (1 - pulse)})`, 3);
    // machine body: housing & base (back)
    box(ctx, T - 100, G - 302, 200, 62, '#ef4444', 8);
    label(ctx, v(T, G - 272), tx('BEJO CLAW', 'CAPIT BEJO'), '#ffffff', 14);
    box(ctx, T - 100, G - 22, 200, 22, '#ef4444', 4);
    box(ctx, T - 92, G - 240, 184, 220, '#f8fafc');
    // rail + cable + claw (behind him)
    box(ctx, T - 90, G - 246, 180, 6, '#9ca3af');
    stroke(ctx, [v(mg.cx, G - 246), v(mg.cx, mg.cy)], '#6b7280', 3);
    ctx.save(); ctx.translate(mg.cx, mg.cy);
    box(ctx, -14, -14, 28, 22, '#6b7280', 4);
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.rotate(sgn * (0.35 + 0.5 * mg.open)); box(ctx, sgn > 0 ? 0 : -8, 0, 8, 46, '#9ca3af', 3); ctx.restore();
    }
    ctx.restore();
  } else if (k === 'springs') {
    for (const p of mg.pads) {
      const h0 = 14 + 10 * p.fl;
      glow(ctx, v(p.x, G - 6), 46, p.col, 0.25 + 0.5 * p.fl);
      box(ctx, p.x - p.w / 2, G - h0, p.w, h0, p.col, 6);
      box(ctx, p.x - p.w / 2 + 6, G - h0 + 3, p.w - 12, 4, 'rgba(255,255,255,0.6)', 2);
      label(ctx, v(p.x, G - h0 - 14), ['DO', 'MI', 'SOL'][p.n], p.col, 12);
    }
    // pillar
    box(ctx, T - 72, G - 252, 44, 252, '#334155', 4);
    for (let y = G - 230; y < G; y += 30) stroke(ctx, [v(T - 72, y), v(T - 28, y)], '#1e293b', 2, 'butt');
    for (const ap of mg.apples) {
      box(ctx, ap.p.x - 2, ap.p.y + 10, 4, G - ap.p.y - 10, '#cbd5e1');
      if (ap.alive) drawApple(ctx, ap.p, APPLE_R);
    }
  } else if (k === 'barongsai') {
    const segs: V[] = mg.segs; if (!segs.length) return;
    const dir = mg.dir;
    // dancers' legs under head and tail
    for (const i of [1, segs.length - 2]) {
      const p = segs[i];
      for (const dx of [-10, 10]) {
        const lift = 8 * Math.max(0, Math.sin(lt * 7 + dx + i));
        stroke(ctx, [v(p.x + dx, p.y + 10), v(p.x + dx, G - lift)], '#1f2937', 6);
        box(ctx, p.x + dx - 8, G - lift - 6, 18, 7, '#1f2937', 3);
      }
    }
    // body from tail to head
    for (let i = segs.length - 1; i >= 1; i--) {
      const p = segs[i];
      const r = 20 - i * 0.4;
      disc(ctx, p, r + 3, '#b91c1c'); disc(ctx, p, r, i % 2 ? '#ef4444' : '#f59e0b');
      disc(ctx, add(p, v(0, -r * 0.5)), r * 0.35, 'rgba(255,255,255,0.4)');
    }
    const tail = segs[segs.length - 1];
    for (let i = 0; i < 5; i++) stroke(ctx, [tail, add(tail, fromAngle(Math.PI / 2 - dir * 0.8 + i * 0.25 * dir + 0.2 * Math.sin(lt * 6 + i), 34))], '#fbbf24', 4);
    if (mg.apple && mg.applePos) drawApple(ctx, mg.applePos, APPLE_R);
    // head
    const hd = segs[0];
    ctx.save(); ctx.translate(hd.x, hd.y); ctx.scale(dir, 1);
    disc(ctx, v(0, 0), 36, '#ef4444'); disc(ctx, v(8, 6), 28, '#f59e0b');
    box(ctx, 12, -4, 36, 26, '#ef4444', 8);
    box(ctx, 20, 16, 30, 8, '#ffffff', 3);
    disc(ctx, v(10, -10), 11, '#ffffff'); disc(ctx, v(13, -10), 6, '#1f2937');
    for (const a of [-2.4, -2.0, -1.6]) stroke(ctx, [v(-10, -20), add(v(-10, -20), fromAngle(a, 40 + 6 * Math.sin(lt * 8 + a)))], '#fbbf24', 5);
    stroke(ctx, [v(-20, -30), v(-34, -62)], '#1f2937', 5); stroke(ctx, [v(0, -34), v(6, -66)], '#1f2937', 5);
    if (mg.roar > 0) label(ctx, v(0, -80), tx('ROAR!', 'AUM!'), '#dc2626', 26);
    ctx.restore();
  } else if (k === 'paperplane') {
    const p: V = mg.p; const f = mg.flip ?? 1;
    groundShadow(ctx, p.x, G, 120, 0.08);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(f, 1); ctx.rotate(mg.ang);
    ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(80, 0); ctx.lineTo(-70, -34); ctx.lineTo(-50, 0); ctx.lineTo(-70, 30); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.moveTo(80, 0); ctx.lineTo(-50, 0); ctx.lineTo(-70, 30); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    for (const hpos of mg.holes) disc(ctx, add(p, hpos), 4, '#cbd5e1');
    // a few clouds
    for (const [cx, cy, r] of [[T - 500, G - 450, 26], [T + 120, G - 420, 32], [T - 150, G - 520, 22]]) {
      ctx.save(); ctx.globalAlpha = 0.5;
      disc(ctx, v(cx + 10 * Math.sin(lt * 0.3), cy), r, '#e5e7eb'); disc(ctx, v(cx + 28, cy + 6), r * 0.8, '#e5e7eb'); disc(ctx, v(cx - 24, cy + 8), r * 0.7, '#e5e7eb');
      ctx.restore();
    }
  } else if (k === 'hologram') {
    const holo: TargetState = mg.holo;
    // projector on the floor
    box(ctx, holo.x - 30, G - 8, 60, 8, '#0e7490', 3);
    ctx.save();
    const flick = 0.5 + 0.12 * Math.sin(lt * 23) + (Math.random() < 0.06 ? -0.25 : 0);
    ctx.globalAlpha = clamp(flick, 0.2, 0.7);
    ctx.fillStyle = 'rgba(34,211,238,0.18)'; ctx.beginPath(); ctx.moveTo(holo.x - 30, G - 8); ctx.lineTo(holo.x + 30, G - 8); ctx.lineTo(holo.x + 42, G - 230); ctx.lineTo(holo.x - 42, G - 230); ctx.fill();
    drawTarget(ctx, holo);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.25;
    for (let y = G - 230; y < G; y += 6) stroke(ctx, [v(holo.x - 44, y), v(holo.x + 44, y)], '#22d3ee', 1, 'butt');
    ctx.restore();
    if (mg.flash > 0) { ctx.save(); ctx.globalAlpha = mg.flash; box(ctx, T - 260, G - 260, 400, 260, '#a5f3fc'); ctx.restore(); }
  } else if (k === 'crab') {
    const cx = mg.x; const dead = mg.dead; const fall = mg.fall;
    groundShadow(ctx, cx, G, 220, 0.12);
    ctx.save(); ctx.translate(cx, G - 90); if (dead) { ctx.rotate(Math.PI * fall); ctx.translate(0, -30 * fall); }
    // legs
    for (const sgn of [-1, 1]) for (let i = 0; i < 3; i++) {
      const a = lt * 6 + i * 1.3;
      const k1 = v(sgn * (90 + i * 10), -10 + i * 14); const k2 = v(sgn * (120 + i * 14), 40 + 8 * Math.sin(a));
      stroke(ctx, [v(sgn * 60, 10 + i * 10), k1, add(k2, v(0, dead ? 0 : 50 - 8 * Math.abs(Math.sin(a))))], '#b91c1c', 7);
    }
    // body
    ctx.fillStyle = mg.hurt > 0 ? '#fca5a5' : '#ef4444'; ctx.beginPath(); ctx.ellipse(0, 0, 90, 60, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f87171'; ctx.beginPath(); ctx.ellipse(-20, -18, 40, 22, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) disc(ctx, v(-60 + i * 30, 20), 5, '#b91c1c');
    // mouth
    stroke(ctx, [v(-16, 36), v(0, dead ? 30 : 44), v(16, 36)], '#7f1d1d', 4);
    // claws: one holds Bejo (left), one guards the apple
    stroke(ctx, [v(-70, -20), v(-120, -80), v(-120, -120)], '#dc2626', 14);
    ctx.restore();
    if (!dead) {
      // claw gripping Bejo's torso
      const m = h.men[0];
      if (m && !m.rag) {
        const J = joints(m); const hip = J[2];
        ctx.save(); ctx.translate(hip.x, hip.y - 20);
        box(ctx, -26, -12, 52, 24, '#dc2626', 8);
        ctx.restore();
      }
    }
    // eyes on stalks
    for (let i = 0; i < 2; i++) {
      const e = crabEye(h, i);
      const base = v(cx - 28 + i * 56, G - 150 + (dead ? 90 : 0));
      stroke(ctx, [base, lerpV(base, e, 0.5), e], '#b91c1c', 6);
      disc(ctx, e, 15, '#ffffff'); disc(ctx, add(e, v(2, 2)), 7, dead ? '#9ca3af' : '#1f2937');
      if (dead) { stroke(ctx, [add(e, v(-6, -6)), add(e, v(6, 6))], '#1f2937', 3); stroke(ctx, [add(e, v(6, -6)), add(e, v(-6, 6))], '#1f2937', 3); }
      else if (mg.hurt <= 0) { const pulse = (lt * 1.3) % 1; ring(ctx, e, 18 + pulse * 10, `rgba(239,68,68,${0.6 * (1 - pulse)})`, 2.5); }
    }
    // bubbles
    for (const b of mg.bubbles) {
      ctx.save(); ctx.globalAlpha = 0.5; disc(ctx, b.p, b.r, '#bae6fd'); ctx.restore();
      ring(ctx, b.p, b.r, '#38bdf8', 2.5); disc(ctx, add(b.p, v(-b.r * 0.4, -b.r * 0.4)), b.r * 0.2, '#ffffff');
    }
    // hp bar
    box(ctx, cx - 60, G - 290, 120, 12, '#e5e7eb', 6);
    box(ctx, cx - 60, G - 290, 120 * (mg.hp / 5), 12, '#ef4444', 6);
    label(ctx, v(cx, G - 304), tx('KING CRAB', 'RAJA KEPITING'), '#b91c1c', 12);
  }
}

// ---- drawing: in front of the men (but behind the archer) -----------------------------------------
export function drawFront5(h: Host) {
  const ctx = h.ctx; const T = h.T; const k = h.mini; const mg = h.mg; const lt = h.lt;
  if (!k || !MINI5.has(k)) return;
  if (k === 'timevault') {
    const d = mg.door;
    ctx.save(); ctx.translate(d.c.x, d.c.y);
    ctx.globalAlpha = 0.96;
    disc(ctx, v(0, 0), d.r, d.frozen > 0 ? '#bfdbfe' : '#9aa3ad');
    ring(ctx, v(0, 0), d.r - 6, d.frozen > 0 ? '#60a5fa' : '#6b7280', 4);
    for (let i = 0; i < 8; i++) disc(ctx, fromAngle((i * Math.PI) / 4 + d.ang, d.r - 16), 4, '#475569');
    ctx.rotate(d.ang);
    box(ctx, -d.r, -13, d.r * 2, 26, '#ffffff', 6);
    box(ctx, -d.r + 4, -9, d.r * 2 - 8, 18, d.frozen > 0 ? '#dbeafe' : '#f1f5f9', 4);
    ctx.restore();
    if (d.frozen > 0) {
      ctx.save(); ctx.globalAlpha = 0.4 + 0.3 * Math.sin(lt * 10); ring(ctx, d.c, d.r + 6, '#38bdf8', 4); ctx.restore();
      label(ctx, add(d.c, v(0, -d.r - 20)), `${tx('FROZEN', 'BEKU')} ${d.frozen.toFixed(1)}`, '#0284c7', 14);
    }
  } else if (k === 'cannon') {
    const m = h.men[0];
    if (m && !m.rag && mg.phase === 'load') {
      // the cannon mouth hides most of him
      const C: V = mg.C;
      ctx.save(); ctx.translate(C.x + 60, G - 40); ctx.rotate(-2.35);
      box(ctx, 40, -30, 100, 60, '#334155', 12); box(ctx, 118, -30, 20, 60, '#1e293b', 6);
      ctx.restore();
    }
    if (m && !m.rag) {
      const hd = headPos(m);
      ctx.save(); ctx.translate(hd.x, hd.y);
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, 2, 21, Math.PI, 0); ctx.fill();
      box(ctx, -22, 0, 44, 5, '#fecaca', 2);
      label(ctx, v(0, -9), '★', '#ffffff', 12);
      ctx.restore();
    }
  } else if (k === 'domino') {
    if (mg.bunker) {
      ctx.save(); ctx.globalAlpha = 0.55;
      box(ctx, T - 52, G - 172, 104, 172, '#bae6fd', 6);
      ctx.globalAlpha = 0.9; box(ctx, T - 48, G - 166, 6, 160, '#ffffff', 3);
      ctx.restore();
      ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3; ctx.strokeRect(T - 52, G - 172, 104, 172);
      if (mg.flash > 0) { ctx.save(); ctx.globalAlpha = mg.flash * 0.6; box(ctx, T - 52, G - 172, 104, 172, '#ffffff'); ctx.restore(); }
    }
  } else if (k === 'firerope') {
    const pts = ropePts(h);
    stroke(ctx, pts, '#f97316', 7); stroke(ctx, pts, '#fde047', 3);
  } else if (k === 'prism') {
    if (mg.shield) {
      box(ctx, T - 64, G - 232, 22, 232, '#111827', 4);
      box(ctx, T - 60, G - 226, 5, 220, '#374151');
      for (let y = G - 210; y < G; y += 40) stroke(ctx, [v(T - 64, y), v(T - 50, y + 14)], '#4b5563', 2);
      label(ctx, v(T - 53, G - 246), 'OBSIDIAN', '#111827', 10);
    }
  } else if (k === 'coaster') {
    const cx = mg.cx; const cy = trackY(T, cx); const sl = mg.slope ?? 0;
    ctx.save(); ctx.translate(cx, cy - 8); ctx.rotate(sl);
    box(ctx, -34, -30, 68, 32, '#2563eb', 6); box(ctx, -30, -30, 60, 6, '#93c5fd', 3);
    box(ctx, -34, -10, 68, 10, '#1e40af', 3);
    disc(ctx, v(-20, 6), 9, '#1f2937'); disc(ctx, v(20, 6), 9, '#1f2937');
    ctx.restore();
  } else if (k === 'tarzan') {
    const m = h.men[0];
    if (m && !m.rag && mg.hand) {
      // hands wrapped around the vine
      disc(ctx, add(mg.hand, v(-4, 4)), 7, '#e9b48b'); disc(ctx, add(mg.hand, v(5, 6)), 7, '#d19a70');
    }
  } else if (k === 'claw') {
    // glass front
    ctx.save(); ctx.globalAlpha = 0.28; box(ctx, T - 92, G - 240, 184, 220, '#bae6fd'); ctx.globalAlpha = 0.7; box(ctx, T - 86, G - 232, 6, 200, '#ffffff', 3); ctx.restore();
    ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3; ctx.strokeRect(T - 92, G - 240, 184, 220);
    if (mg.flash > 0) { ctx.save(); ctx.globalAlpha = mg.flash * 0.5; box(ctx, T - 92, G - 240, 184, 220, '#ffffff'); ctx.restore(); }
    // prize chute on the left
    box(ctx, T - 100, G - 90, 20, 70, '#1f2937', 3);
    label(ctx, v(T - 90, G - 100), 'OUT', '#1f2937', 9);
    // front jaws of the claw
    ctx.save(); ctx.translate(mg.cx, mg.cy);
    ctx.rotate(0.35 + 0.5 * mg.open); box(ctx, -4, 0, 8, 46, '#cbd5e1', 3);
    ctx.restore();
  } else if (k === 'crab') {
    const m = h.men[0];
    if (!mg.dead && m && !m.rag) {
      // the second claw hovers over the apple
      const ap = add(headPos(m), v(0, -29));
      ctx.save(); ctx.translate(ap.x, ap.y);
      const op = 0.25 + 0.1 * Math.sin(lt * 4);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath(); ctx.ellipse(0, -8, 30, 16, 0, Math.PI + op, Math.PI * 2 - op); ctx.lineTo(0, -8); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 8, 30, 16, 0, op, Math.PI - op); ctx.lineTo(0, 8); ctx.fill();
      ctx.restore();
      stroke(ctx, [add(ap, v(30, 0)), v(mg.x - 30, G - 140)], '#dc2626', 12);
    }
  }
}

// ---- drawing over everything -----------------------------------------------------------------------
export function drawOver5(h: Host) {
  const k = h.mini; const ctx = h.ctx; const mg = h.mg;
  if (k === 'prism') {
    for (const s of h.shots) {
      if (s.state === 'fly' && (s as any).rainbow) {
        ctx.save(); ctx.globalAlpha = 0.8;
        RAINBOW.forEach((c, i) => stroke(ctx, [sub(s.tip, fromAngle(s.ang, 20 + i * 2)), sub(s.tip, fromAngle(s.ang, 110 + i * 10))], c, 3));
        ctx.restore();
      }
    }
  } else if (k === 'tnt' && mg.boom > 0) {
    ctx.save(); ctx.globalAlpha = mg.boom * 0.5; box(ctx, -5000, -5000, 20000, 20000, '#fff7ed'); ctx.restore();
  }
}
