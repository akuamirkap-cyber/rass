// Levels 75-84: ten absurd little games. Same Host contract as mini5.
import { V, v, add, sub, mul, len, dist, clamp, lerp, lerpV, damp, stroke, groundShadow } from './util';
import { drawApple } from './gear';
import { APPLE_R, TargetState, applePos, drawTarget, headPos, hitTest, joints, makeTarget, updateTarget } from './target';
import { sfx } from './sfx';
import type { Shot } from './engine';
import { G, Host, box, disc, ring, stick, label } from './mini5';
import { tx } from '../i18n';

export const MINI6 = new Set(['chicken', 'fart', 'cat', 'jackbox', 'melon', 'duckwave', 'selfie', 'bees', 'pinata', 'bejorain']);
const START_X = 215;
const puff = (h: Host, p: V, color: string, vel: V, size = 4, max = 0.4) =>
  h.parts.push({ p: { ...p }, vel, life: 0, max, size, color, kind: 'drop', rot: 0, vr: 0 });

export function reset6(h: Host) {
  const T = h.T; const k = h.mini; const mg = h.mg;
  if (!k || !MINI6.has(k)) return;
  const one = (x: number, y: number, pose: 'cross' | 'hips' | 'hold', lbl = tx('Mr. Bejo’s Apple', 'Apel Pak Bejo')) => {
    h.men = [makeTarget(0, x, y, pose)]; h.goals = [{ label: lbl, done: false }]; h.appleGoal = [0]; return h.men[0];
  };
  if (k === 'chicken') {
    h.men = []; h.appleGoal = [];
    h.goals = [{ label: tx('Golden eggs 0/3', 'Telur emas 0/3'), done: false }];
    Object.assign(mg, { cx: T - 200, dir: 1, layT: 1.2, eggs: [] as any[], gold: 0, time: 45, feathers: 0, flap: 0 });
  } else if (k === 'fart') {
    one(T, G, 'hold');
    Object.assign(mg, { vy: 0, y: G, nextT: 1.0, gas: 0 });
  } else if (k === 'cat') {
    one(T - 40, G, 'cross');
    Object.assign(mg, { cx: T + 340, phase: 'sneak', t: 0, stolen: false, tail: 0, step: 0 });
    h.goals = [{ label: tx('Mr. Bejo’s Apple — before the orange cat!', 'Apel Pak Bejo — sebelum kucing oren!'), done: false }];
  } else if (k === 'jackbox') {
    h.men = []; h.appleGoal = [];
    h.goals = [{ label: tx('Jack-in-the-box apples 0/3', 'Apel badut kotak 0/3'), done: false }];
    Object.assign(mg, { phase: 'wait', t: 1.5, up: 0, hits: 0, crank: 0, time: 45, sulk: 0 });
  } else if (k === 'melon') {
    const m = one(T, G, 'hold', tx('Watermelon: split 2 halves (0/2)', 'Semangka: pecahkan 2 belahan (0/2)'));
    m.hasApple = false;
    h.appleGoal = [-1];
    Object.assign(mg, { pieces: [{ p: v(0, 0), vel: v(0, 0), r: 38, gen: 0, held: true, rot: 0, vr: 0 }], done: 0, juice: 0 });
  } else if (k === 'duckwave') {
    one(T + 220, G - 130, 'hold', tx('Mr. Bejo’s Apple on the giant duck', 'Apel Pak Bejo di atas bebek raksasa'));
    Object.assign(mg, { dx: T + 220, sp: 36, angry: 0, quacks: 0 });
  } else if (k === 'selfie') {
    const bejo = makeTarget(0, T, G, 'hips');
    const joko = makeTarget(1, T - 230, G, 'hold');
    joko.hasApple = false;
    h.men = [bejo, joko];
    h.goals = [{ label: tx('Mr. Bejo’s Apple (watch for FLASH!)', 'Apel Pak Bejo (awas FLASH!)'), done: false }];
    h.appleGoal = [0, -1];
    Object.assign(mg, { flash: 0, nextT: 2.0, pose: 0, cheese: 0 });
  } else if (k === 'bees') {
    one(T - 60, G, 'hold');
    Object.assign(mg, { dir: 1, turnT: 1.2, swarm: v(T - 60, G - 220), bees: Array.from({ length: 18 }, () => ({ o: v((Math.random() - 0.5) * 70, (Math.random() - 0.5) * 60), ph: Math.random() * 7 })), sting: 0 });
  } else if (k === 'pinata') {
    const bejo = makeTarget(0, T - 190, G, 'hold');
    const joko = makeTarget(1, T + 30, G, 'hold');
    bejo.hasApple = false; joko.hasApple = false;
    h.men = [bejo, joko];
    h.goals = [{ label: tx('Hit the piñata 3x (0/3)', 'Pukul piñata 3x (0/3)'), done: false }];
    h.appleGoal = [-1, -1];
    Object.assign(mg, { A: 0.3, w: 1.5, hits: 0, ph: 0, anchor: v(T - 90, G - 470), L: 240, burst: 0, candy: [] as any[], broke: false });
  } else if (k === 'bejorain') {
    h.men = []; h.appleGoal = [];
    h.goals = [{ label: tx('Mini Bejo apples 0/5', 'Apel Bejo mini 0/5'), done: false }];
    Object.assign(mg, { minis: [] as any[], spawnT: 0.5, got: 0, time: 50 });
  }
}

export function update6(h: Host, dt: number, live: boolean) {
  const T = h.T; const k = h.mini; const mg = h.mg; const lt = h.lt; const m = h.men[0]; const a = h.a;
  if (!k || !MINI6.has(k)) return;
  if (k === 'chicken' || k === 'jackbox' || k === 'bejorain') {
    if (a.quiver < 2) a.quiver = h.def.arrows;
    h.shots = h.shots.filter((s) => !(s.state === 'stuck' && s.stuckT > 2.5));
    if (live && mg.time !== undefined) {
      mg.time -= dt;
      if (mg.time <= 0) { mg.time = 0; h.why = 'time'; h.finish('lose'); }
    }
  }
  const secs = Math.ceil(mg.time ?? 0);

  if (k === 'chicken') {
    mg.cx += mg.dir * 95 * dt;
    if (mg.cx > T + 90) mg.dir = -1; if (mg.cx < T - 470) mg.dir = 1;
    mg.flap = Math.max(0, mg.flap - dt * 3);
    mg.feathers = Math.max(0, mg.feathers - dt);
    if (live) {
      mg.layT -= dt;
      if (mg.layT <= 0) {
        mg.layT = 1.5 + Math.random() * 0.8;
        const gold = Math.random() < 0.45;
        mg.eggs.push({ p: v(mg.cx - mg.dir * 20, G - 380), vy: 0, gold, rot: 0, state: 'air' });
        mg.flap = 1; sfx.tuk();
        if (gold) h.popText(v(mg.cx, G - 440), tx('GOLD!', 'EMAS!'), '#d97706', 22);
      }
    }
    for (const e of [...mg.eggs]) {
      if (e.state !== 'air') { e.t = (e.t ?? 0) + dt; if (e.t > 1.2) mg.eggs.splice(mg.eggs.indexOf(e), 1); continue; }
      e.vy += 420 * dt; e.p.y += e.vy * dt; e.rot += 2 * dt;
      if (e.p.y > G - 10) { e.p.y = G - 10; e.state = 'splat'; e.t = 0; sfx.step(); }
    }
    h.miniLabel(`${tx('Golden eggs', 'Telur emas')} ${mg.gold}/3 · ${secs}s`);
  } else if (k === 'fart') {
    mg.gas = Math.max(0, mg.gas - dt * 2);
    if (live && m && !m.rag) {
      mg.nextT -= dt;
      if (mg.nextT <= 0 && mg.y >= G - 2) {
        mg.nextT = 0.9 + Math.random() * 1.1;
        mg.vy = -(330 + Math.random() * 180); mg.gas = 1;
        h.popText(v(m.x, G - 230), [tx('TOOT!', 'PRUUT!'), 'BRRT!', 'PFFT!', tx('POOT!', 'DUUT!')][Math.floor(Math.random() * 4)], '#65a30d', 28);
        sfx.quack();
      }
      mg.vy += 760 * dt; mg.y = Math.min(G, mg.y + mg.vy * dt);
      if (mg.y >= G && mg.vy > 0) { if (mg.vy > 100) { m.dipT = 14; h.dust(m.x, 5); } mg.vy = 0; }
      m.y = mg.y; m.air = mg.y < G - 4 ? 1 : 0;
      if (mg.y < G - 4 && Math.random() < 0.7) puff(h, v(m.x + (Math.random() - 0.5) * 20, mg.y - 70), Math.random() < 0.5 ? '#a3e635' : '#bef264', v((Math.random() - 0.5) * 60, 90 + Math.random() * 80), 5 + Math.random() * 5, 0.5);
    }
  } else if (k === 'cat') {
    mg.t += dt;
    const aiming = !!h.drag;
    if (m && !m.rag && !h.result) {
      if (mg.phase === 'sneak') {
        if (!aiming && live) { mg.cx -= 58 * dt; mg.step += dt * 9; }
        if (mg.cx < m.x + 34) { mg.phase = 'climb'; mg.t = 0; }
      } else if (mg.phase === 'climb') {
        if (mg.t > 1.0) {
          mg.phase = 'run'; mg.t = 0; mg.stolen = true; m.hasApple = false; m.brow = 1;
          h.popText(add(headPos(m), v(0, -70)), tx('MY APPLE!', 'APELKU!'), '#dc2626', 26);
          sfx.miss();
          h.why = 'cat'; h.finish('lose');
        }
      } else if (mg.phase === 'run') { mg.cx += 260 * dt; mg.step += dt * 16; }
    }
    h.miniLabel(aiming ? tx('The cat freezes while you aim…', 'Kucing berhenti saat kamu membidik…') : tx('The orange cat is sneaking closer!', 'Kucing oren mengendap-endap!'));
  } else if (k === 'jackbox') {
    mg.crank += dt * (mg.phase === 'wait' ? 5 : 0);
    mg.sulk = Math.max(0, mg.sulk - dt);
    if (live) {
      mg.t -= dt;
      if (mg.phase === 'wait' && mg.t <= 0) {
        mg.phase = 'up'; mg.t = 1.0; sfx.boing(); h.shake = Math.max(h.shake, 5);
        h.popText(v(T, G - 300), tx('BOO!', 'BA!'), '#dc2626', 40);
      } else if (mg.phase === 'up' && mg.t <= 0) { mg.phase = 'wait'; mg.t = 1.2 + Math.random() * 2.0; }
    }
    mg.up = damp(mg.up, mg.phase === 'up' ? 1 : 0, mg.phase === 'up' ? 22 : 10, dt);
    h.miniLabel(`${tx('Jack-in-the-box apples', 'Apel badut kotak')} ${mg.hits}/3 · ${secs}s`);
  } else if (k === 'melon') {
    mg.juice = Math.max(0, mg.juice - dt);
    mg.busy = false;
    for (const p of mg.pieces) {
      if (p.held) { if (m && !m.rag) { p.p = add(headPos(m), v(0, -17 - p.r)); } else { p.held = false; p.vel = v(60, -200); } continue; }
      mg.busy = true;
      p.vel.y += 700 * dt; p.p = add(p.p, mul(p.vel, dt)); p.rot += p.vr * dt;
      if (p.p.y > G - p.r) { p.p.y = G - p.r; p.vel.y = -Math.abs(p.vel.y) * 0.82; p.vel.x *= 0.9; if (Math.abs(p.vel.y) > 120) { sfx.boing(); h.dust(p.p.x, 4); } }
      if (p.p.x > T + 300) { p.vel.x = -Math.abs(p.vel.x); }
      if (p.p.x < T - 500) { p.vel.x = Math.abs(p.vel.x); }
      if (Math.abs(p.vel.y) < 60 && p.p.y > G - p.r - 2) mg.busy = false;
    }
  } else if (k === 'duckwave') {
    if (live && !h.result) mg.dx -= mg.sp * dt;
    mg.angry = Math.max(0, mg.angry - dt);
    const bob = G - 120 - 22 * Math.sin(lt * 1.6);
    mg.dy = bob;
    if (m && !m.rag) { m.x = mg.dx - 10; m.y = bob - 40; m.tilt = 0.08 * Math.cos(lt * 1.6); m.air = 0; }
    if (!h.result && mg.dx < START_X + 420) {
      h.hurtMe('duck2', v(mg.dx - 80, G - 120));
      h.popText(v(mg.dx, bob - 160), tx('QUAAACK!', 'KWEEEK!'), '#d97706', 34);
    }
    const distM = Math.max(0, Math.round((mg.dx - START_X - 420) / 10) / 10);
    h.miniLabel(tx(`Mr. Bejo’s Apple — duck ${distM}m away!`, `Apel Pak Bejo — bebek ${distM}m lagi!`));
  } else if (k === 'selfie') {
    mg.flash = Math.max(0, mg.flash - dt * 1.5);
    mg.cheese = Math.max(0, mg.cheese - dt);
    const joko = h.men[1];
    if (live && joko && !joko.rag && m && !m.rag) {
      mg.nextT -= dt;
      if (mg.nextT < 0.6 && mg.cheese <= 0 && mg.nextT > 0) { mg.cheese = 0.6; h.popText(add(headPos(joko), v(0, -70)), 'CHEESE!', '#7c3aed', 24); }
      if (mg.nextT <= 0) {
        mg.nextT = 2.2 + Math.random() * 1.6; mg.flash = 1; mg.pose = (mg.pose + 1) % 4;
        sfx.click(); h.shake = Math.max(h.shake, 3);
        m.tilt = [0.12, -0.14, 0.05, -0.08][mg.pose]; m.dipT = [0, 12, 4, 16][mg.pose]; m.pose = (['hips', 'cross', 'hold', 'hips'] as const)[mg.pose];
      }
    }
  } else if (k === 'bees') {
    if (m && !m.rag) {
      mg.turnT -= dt;
      if (mg.turnT <= 0) { mg.turnT = 0.5 + Math.random() * 1.1; mg.dir *= -1; }
      m.x += mg.dir * 190 * dt;
      if (m.x > T + 110) { m.x = T + 110; mg.dir = -1; } if (m.x < T - 230) { m.x = T - 230; mg.dir = 1; }
      m.tilt = damp(m.tilt, -mg.dir * 0.12, 8, dt);
      m.dipT = 6 + 5 * Math.abs(Math.sin(lt * 14));
      m.y = G - 10 * Math.abs(Math.sin(lt * 14));
      m.air = m.y < G - 5 ? 1 : 0;
      const want = add(headPos(m), v(-mg.dir * 85, -62));
      mg.swarm = v(damp(mg.swarm.x, want.x, 3.5, dt), damp(mg.swarm.y, want.y, 3.5, dt));
    }
    mg.sting = Math.max(0, mg.sting - dt);
  } else if (k === 'pinata') {
    mg.ph += mg.w * dt;
    mg.burst = Math.max(0, mg.burst - dt);
    const th = mg.A * Math.sin(mg.ph);
    mg.p = add(mg.anchor, v(mg.L * Math.sin(th), mg.L * Math.cos(th)));
    mg.th = th;
    for (const c of mg.candy) { c.vel.y += 700 * dt; c.p = add(c.p, mul(c.vel, dt)); c.rot += c.vr * dt; if (c.p.y > G - 6) { c.p.y = G - 6; c.vel = v(0, 0); c.vr = 0; } }
    for (const q of h.men) if (!q.rag) { q.look = mg.p; }
  } else if (k === 'bejorain') {
    if (live) {
      mg.spawnT -= dt;
      if (mg.spawnT <= 0 && mg.minis.length < 6) {
        mg.spawnT = 1.1 + Math.random() * 0.9;
        const x = T - 460 + Math.random() * 560;
        const mm = makeTarget(Math.random() < 0.5 ? 0 : 1, x, G - 560, 'hold');
        mm.ground = G; mm.air = 1;
        mg.minis.push({ m: mm, ph: Math.random() * 7, vy: 58 + Math.random() * 20, state: 'fall', t: 0 });
      }
    }
    for (const q of [...mg.minis]) {
      const mm: TargetState = q.m;
      if (mm.rag) { updateTarget(mm, dt); q.t += dt; if (q.t > 3) mg.minis.splice(mg.minis.indexOf(q), 1); continue; }
      if (q.state === 'fall') {
        mm.y += q.vy * dt; mm.x += 30 * Math.sin(lt * 1.3 + q.ph) * dt; mm.tilt = 0.12 * Math.sin(lt * 1.3 + q.ph); mm.air = 1;
        if (mm.y >= G) { mm.y = G; q.state = 'walk'; mm.air = 0; mm.dipT = 12; mm.tilt = 0; mm.pose = 'hips'; }
      } else { mm.x += 70 * dt; q.t += dt; if (q.t > 2.5 || mm.x > T + 260) mg.minis.splice(mg.minis.indexOf(q), 1); }
      mm.look = h.pose.bow.pos;
      updateTarget(mm, dt);
    }
    h.miniLabel(`${tx('Mini Bejo apples', 'Apel Bejo mini')} ${mg.got}/5 · ${secs}s`);
  }
}

/** a mini man is drawn at half size around his feet: map a world point into his full-size frame */
const unscale = (mm: TargetState, p: V, s: number) => v(mm.x + (p.x - mm.x) / s, mm.y + (p.y - mm.y) / s);

export function collide6(h: Host, s: Shot): boolean | null {
  const T = h.T; const k = h.mini; const mg = h.mg; const tip = s.tip; const m = h.men[0];
  if (!k || !MINI6.has(k)) return null;
  const drop = () => { h.tumble(s); return true; };

  if (k === 'chicken') {
    const c = v(mg.cx, G - 392);
    if (dist(tip, c) < 28) {
      mg.feathers = 1;
      h.burst(c, 16, ['#ffffff', '#f1f5f9', '#f97316'], 'drop', 240);
      h.miniLose('chicken', c, tx('HIT THE CHICKEN! BAWK!', 'KENA AYAM! PETOK!'));
      return drop();
    }
    for (const e of mg.eggs) {
      if (e.state !== 'air') continue;
      if (dist(tip, e.p) < 16) {
        e.state = 'gone';
        if (e.gold) {
          mg.gold++;
          h.burst(e.p, 14, ['#fbbf24', '#fde68a', '#ffffff'], 'star', 260);
          h.popText(add(e.p, v(0, -40)), [tx('GOLD!', 'EMAS!'), tx('DOUBLE GOLD!', 'DOBEL EMAS!'), tx('TRIPLE GOLD!', 'TRIPEL EMAS!')][Math.min(2, mg.gold - 1)], '#d97706', 28);
          sfx.ting(); h.slowT = 0.2;
          if (mg.gold >= 3) { h.mark(0); h.miniWin(e.p, tx('STRUCK IT RICH!', 'KAYA RAYA!')); }
        } else {
          h.burst(e.p, 10, ['#fde68a', '#ffffff'], 'drop', 180);
          h.popText(add(e.p, v(0, -36)), tx('EGG CRACKED!', 'TELUR PECAH!'), '#6b7280', 20);
          sfx.pop();
        }
        return false;
      }
    }
  } else if (k === 'cat') {
    const cp = catPos(h);
    if (dist(tip, cp) < 24) {
      h.burst(cp, 12, ['#f97316', '#fdba74', '#ffffff'], 'star', 240);
      h.miniLose('catHit', cp, tx('MEOOOW! POOR KITTY!', 'MEOOONG! KASIHAN!'));
      return drop();
    }
  } else if (k === 'jackbox') {
    const hp = clownHead(h);
    if (mg.up > 0.3) {
      const ap = add(hp, v(0, -40));
      if (dist(tip, ap) < APPLE_R + 6) {
        mg.hits++;
        h.goals[0].label = `${tx('Jack-in-the-box apples', 'Apel badut kotak')} ${mg.hits}/3`;
        h.appleFx(s, ap);
        if (mg.hits >= 3) { h.mark(0); h.miniWin(ap, tx('CLOWN BEATEN!', 'BADUT KALAH!')); }
        mg.phase = 'wait'; mg.t = 1.4 + Math.random() * 1.5;
        return false;
      }
      if (dist(tip, hp) < 26) {
        mg.sulk = 1.5; mg.phase = 'wait'; mg.t = 1.2;
        h.burst(hp, 8, ['#ef4444', '#ffffff'], 'drop', 160);
        h.popText(add(hp, v(0, -60)), tx('CLOWN SULKING!', 'BADUT NGAMBEK!'), '#dc2626', 22);
        sfx.quack();
        return drop();
      }
    }
    if (tip.x > T - 60 && tip.x < T + 60 && tip.y > G - 120) return stick(s);
  } else if (k === 'melon') {
    for (const p of [...mg.pieces]) {
      if (dist(tip, p.p) < p.r + 4) {
        mg.pieces.splice(mg.pieces.indexOf(p), 1);
        mg.juice = 0.4;
        h.burst(p.p, 18, ['#f43f5e', '#fb7185', '#22c55e', '#1f2937'], 'drop', 320);
        if (p.gen === 0) {
          if (m) h.dropApple(m, v(0, 0));
          for (const sgn of [-1, 1]) mg.pieces.push({ p: add(p.p, v(sgn * 10, 0)), vel: v(sgn * (140 + Math.random() * 60) + s.vel.x * 0.05, -520 - Math.random() * 80), r: 25, gen: 1, held: false, rot: 0, vr: sgn * 6 });
          h.popText(add(p.p, v(0, -60)), tx('CRACK! SPLIT IN TWO!', 'KRAK! BELAH DUA!'), '#16a34a', 28);
          s.vel = mul(s.vel, 0.8);
          sfx.crunch(); h.slowT = 0.3; h.shake = 6;
        } else {
          mg.done++;
          h.goals[0].label = tx(`Watermelon: split 2 halves (${mg.done}/2)`, `Semangka: pecahkan 2 belahan (${mg.done}/2)`);
          h.appleFx(s, p.p);
          if (mg.done >= 2) { h.mark(0); h.miniWin(p.p, tx('WATERMELON JUICE!', 'JUS SEMANGKA!')); }
        }
        return false;
      }
    }
  } else if (k === 'duckwave') {
    const c = v(mg.dx, mg.dy ?? G - 120);
    const hd = add(c, v(-70, -62));
    if (dist(tip, hd) < 34 || Math.hypot(tip.x - c.x, (tip.y - c.y) / 0.7) < 80) {
      mg.angry = 1.2; mg.sp *= 1.18; mg.quacks++;
      h.burst(tip, 10, ['#fbbf24', '#fde68a', '#ffffff'], 'drop', 200);
      h.popText(add(hd, v(0, -50)), tx('QUACK! EVEN FASTER!', 'KWEK! MAKIN NGEBUT!'), '#d97706', 22);
      sfx.quack(); h.shake = Math.max(h.shake, 4);
      return drop();
    }
  } else if (k === 'bees') {
    if (dist(tip, mg.swarm) < 36) {
      mg.sting = 1;
      h.burst(tip, 10, ['#fbbf24', '#1f2937'], 'drop', 200);
      if (!s.apples) h.popText(add(tip, v(0, -40)), tx('HIT A BEE! BZZZ', 'KENA LEBAH! BZZZ'), '#d97706', 22);
      sfx.zap();
      return drop();
    }
  } else if (k === 'pinata') {
    if (!mg.broke && mg.p && dist(tip, mg.p) < 44) {
      mg.hits++; mg.burst = 0.5;
      mg.A = [0.3, 0.55, 0.85, 1.1][Math.min(3, mg.hits)]; mg.w += 0.35;
      h.goals[0].label = tx(`Hit the piñata 3x (${mg.hits}/3)`, `Pukul piñata 3x (${mg.hits}/3)`);
      const cols = ['#f472b6', '#22d3ee', '#fbbf24', '#a3e635', '#f97316'];
      for (let i = 0; i < 8 + mg.hits * 6; i++) {
        mg.candy.push({ p: { ...mg.p }, vel: v((Math.random() - 0.5) * 400, -200 - Math.random() * 300), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: cols[i % cols.length] });
      }
      h.burst(mg.p, 14, cols, 'star', 300);
      sfx.crunch(); h.shake = Math.max(h.shake, 6); h.slowT = 0.2;
      if (mg.hits >= 3) { mg.broke = true; h.mark(0); h.miniWin(mg.p, tx('CANDY RAIN!', 'HUJAN PERMEN!')); for (const q of h.men) if (!q.rag) q.mood = 'approve'; }
      else h.popText(add(mg.p, v(0, -70)), [tx('WHACK!', 'PLAK!'), tx('THWACK!', 'BUK!')][mg.hits - 1], '#db2777', 30);
      return drop();
    }
  } else if (k === 'bejorain') {
    for (const q of mg.minis) {
      const mm: TargetState = q.m;
      if (mm.rag) continue;
      const pt = unscale(mm, tip, 0.5);
      if (mm.hasApple && dist(pt, applePos(mm)) < APPLE_R + 8) {
        mm.hasApple = false; mg.got++;
        h.goals[0].label = `${tx('Mini Bejo apples', 'Apel Bejo mini')} ${mg.got}/5`;
        h.appleFx(s, { ...tip });
        if (mg.got >= 5) { h.mark(0); h.miniWin(tip, tx('RAIN OF BEJO CLEARED!', 'HUJAN BEJO TAKLUK!')); }
        return false;
      }
      const hit = hitTest(mm, pt);
      if (hit && s.grace <= 0) {
        mm.brow = 1; mm.dipT = 14;
        h.burst(tip, 9, ['#ffd23f', '#ff9f1c', '#fff'], 'star', 260);
        h.miniLose('man', tip, tx('OUCH! MINI BEJO!', 'ADUH! BEJO MINI!'));
        return drop();
      }
    }
  }
  return null;
}

function catPos(h: Host): V {
  const mg = h.mg; const m = h.men[0];
  if (mg.phase === 'climb' && m) return lerpV(v(m.x + 34, G - 22), add(headPos(m), v(16, -10)), clamp(mg.t, 0, 1));
  return v(mg.cx, G - 22);
}
function clownHead(h: Host): V {
  const mg = h.mg;
  return v(h.T + 6 * Math.sin(h.lt * 18) * mg.up, G - 120 - 190 * mg.up);
}

export function draw6(h: Host) {
  const ctx = h.ctx; const T = h.T; const k = h.mini; const mg = h.mg; const lt = h.lt;
  if (!k || !MINI6.has(k)) return;

  if (k === 'chicken') {
    // rope between two posts
    box(ctx, T - 500, G - 420, 10, 420, '#b08c5a'); box(ctx, T + 120, G - 420, 10, 420, '#b08c5a');
    stroke(ctx, [v(T - 495, G - 410), v(T - 190, G - 396), v(T + 125, G - 410)], '#8a6a3c', 3);
    for (const e of mg.eggs) {
      if (e.state === 'splat') { ctx.save(); ctx.globalAlpha = 1 - e.t / 1.2; ctx.fillStyle = e.gold ? '#fbbf24' : '#f8fafc'; ctx.beginPath(); ctx.ellipse(e.p.x, G - 3, 22, 6, 0, 0, Math.PI * 2); ctx.fill(); disc(ctx, v(e.p.x, G - 5), 6, '#fbbf24'); ctx.restore(); continue; }
      if (e.state !== 'air') continue;
      ctx.save(); ctx.translate(e.p.x, e.p.y); ctx.rotate(e.rot);
      ctx.fillStyle = e.gold ? '#fbbf24' : '#f8fafc'; ctx.strokeStyle = e.gold ? '#d97706' : '#cbd5e1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (e.gold) disc(ctx, v(-3, -5), 3, '#fde68a');
      ctx.restore();
    }
    // chicken
    const c = v(mg.cx, G - 392); const d = mg.dir;
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(-d, 1);
    const flap = 0.5 * mg.flap * Math.sin(lt * 40);
    stroke(ctx, [v(-6, 18), v(-10, 30)], '#f59e0b', 3); stroke(ctx, [v(6, 18), v(10 + 6 * Math.sin(lt * 12), 30)], '#f59e0b', 3);
    ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.rotate(flap); ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.ellipse(2, 2, 16, 10, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    disc(ctx, v(22, -14), 12, '#f8fafc');
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(18, -26); ctx.lineTo(24, -32); ctx.lineTo(28, -25); ctx.lineTo(32, -31); ctx.lineTo(34, -24); ctx.fill();
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(32, -14); ctx.lineTo(44, -10); ctx.lineTo(32, -6); ctx.fill();
    disc(ctx, v(26, -16), 2.5, '#1f2937');
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.ellipse(30, -4, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (mg.feathers > 0) label(ctx, add(c, v(0, -50)), tx('BAWK!!', 'PETOK!!'), '#dc2626', 22);
  } else if (k === 'fart') {
    if (mg.gas > 0 && h.men[0]) {
      const m = h.men[0];
      ctx.save(); ctx.globalAlpha = 0.35 * mg.gas;
      for (let i = 0; i < 4; i++) disc(ctx, v(m.x - 10 + (Math.random() - 0.5) * 30, m.y - 60 + i * 14), 16 + i * 6 * (1 - mg.gas), '#a3e635');
      ctx.restore();
    }
  } else if (k === 'cat') {
    const p = catPos(h); const m = h.men[0];
    const facing = mg.phase === 'run' ? 1 : -1;
    const stepB = Math.sin(mg.step) * 4;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(-facing, 1);
    // tail
    stroke(ctx, [v(-22, -4), v(-36, -14 + 6 * Math.sin(lt * 3)), v(-42, -30 + 8 * Math.sin(lt * 3 + 1))], '#f97316', 6);
    // body + legs
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 15, 0, 0, Math.PI * 2); ctx.fill();
    for (const [lx, ph] of [[-16, 0], [-6, Math.PI], [8, Math.PI], [18, 0]] as [number, number][]) stroke(ctx, [v(lx, 8), v(lx + Math.sin(mg.step + ph) * 5, 22)], '#ea580c', 5);
    for (let i = 0; i < 3; i++) stroke(ctx, [v(-12 + i * 9, -12), v(-8 + i * 9, -4)], '#c2410c', 3);
    // head
    disc(ctx, v(26, -12 + stepB * 0.3), 15, '#f97316');
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(14, -22); ctx.lineTo(16, -36); ctx.lineTo(24, -24); ctx.fill();
    ctx.beginPath(); ctx.moveTo(30, -24); ctx.lineTo(36, -36); ctx.lineTo(38, -22); ctx.fill();
    const sneaky = mg.phase === 'sneak' && !h.drag;
    disc(ctx, v(22, -14), 3.5, '#1f2937'); disc(ctx, v(32, -14), 3.5, '#1f2937');
    if (!sneaky) { stroke(ctx, [v(18, -18), v(26, -16)], '#f97316', 4); stroke(ctx, [v(28, -16), v(36, -18)], '#f97316', 4); }
    disc(ctx, v(28, -8), 2.5, '#fb7185');
    for (const sgn of [-1, 1]) for (let i = 0; i < 2; i++) stroke(ctx, [v(28, -8 + i * 3), v(28 + 14 * (sgn > 0 ? 1 : 0.6) * sgn + (sgn > 0 ? 6 : -4), -8 + i * 5 - 2)], '#1f2937', 1);
    if (mg.stolen) drawApple(ctx, v(30, -36), APPLE_R);
    ctx.restore();
    if (mg.phase === 'sneak' && h.drag) label(ctx, add(p, v(0, -54)), '…', '#6b7280', 22);
    if (mg.phase === 'climb' && m) label(ctx, add(p, v(0, -54)), tx('YOINK!', 'HAP!'), '#dc2626', 18);
  } else if (k === 'jackbox') {
    const up = mg.up;
    const hp = clownHead(h);
    groundShadow(ctx, T, G, 140, 0.12);
    // spring
    if (up > 0.02) {
      const pts: V[] = [];
      const top = hp.y + 24; const bot = G - 110;
      for (let i = 0; i <= 12; i++) pts.push(v(T + (i % 2 ? 18 : -18) * Math.min(1, up * 2), lerp(bot, top, i / 12)));
      stroke(ctx, pts, '#6b7280', 4);
      // clown
      ctx.save(); ctx.translate(hp.x, hp.y);
      box(ctx, -28, 14, 56, 30, '#8b5cf6', 10); disc(ctx, v(0, 18), 7, '#fbbf24');
      disc(ctx, v(0, 0), 26, '#ffffff');
      disc(ctx, v(-24, -4), 12, '#ef4444'); disc(ctx, v(24, -4), 12, '#ef4444');
      disc(ctx, v(0, 4), 7, '#ef4444');
      disc(ctx, v(-9, -7), 4, '#1f2937'); disc(ctx, v(9, -7), 4, '#1f2937');
      if (mg.sulk > 0) stroke(ctx, [v(-10, 16), v(0, 12), v(10, 16)], '#1f2937', 3);
      else stroke(ctx, [v(-12, 12), v(0, 20), v(12, 12)], '#dc2626', 3);
      ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.moveTo(-18, -20); ctx.lineTo(0, -58); ctx.lineTo(18, -20); ctx.fill();
      ctx.restore();
      if (mg.phase === 'up') drawApple(ctx, add(hp, v(0, -40)), APPLE_R);
    }
    // box with lid
    box(ctx, T - 60, G - 120, 120, 120, '#ef4444', 8);
    box(ctx, T - 60, G - 120, 120, 120, 'rgba(255,255,255,0)');
    for (let i = 0; i < 3; i++) box(ctx, T - 60, G - 115 + i * 40, 120, 14, '#fbbf24', 3);
    box(ctx, T - 52, G - 80, 104, 40, '#2563eb', 4);
    label(ctx, v(T, G - 60), '?', '#ffffff', 30);
    ctx.save(); ctx.translate(T - 60, G - 120); ctx.rotate(-1.4 * Math.min(1, up * 3)); box(ctx, 0, -10, 120, 10, '#b91c1c', 3); ctx.restore();
    // crank
    ctx.save(); ctx.translate(T + 72, G - 60); ctx.rotate(mg.crank);
    stroke(ctx, [v(0, 0), v(18, 0), v(18, -14)], '#6b7280', 5); disc(ctx, v(18, -14), 5, '#1f2937'); ctx.restore();
  } else if (k === 'melon') {
    for (const p of mg.pieces) {
      ctx.save(); ctx.translate(p.p.x, p.p.y); ctx.rotate(p.rot);
      if (p.gen === 0) {
        disc(ctx, v(0, 0), p.r, '#15803d');
        for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate((i * Math.PI) / 3); box(ctx, -3, -p.r, 6, p.r * 2, '#166534', 3); ctx.restore(); }
        disc(ctx, v(-12, -12), 8, 'rgba(255,255,255,0.3)');
      } else {
        ctx.fillStyle = '#15803d'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#f43f5e'; ctx.beginPath(); ctx.arc(0, 0, p.r - 5, 0, Math.PI); ctx.fill();
        for (let i = 0; i < 4; i++) disc(ctx, v(-12 + i * 8, 8 + 3 * (i % 2)), 2.5, '#1f2937');
      }
      ctx.restore();
    }
    if (mg.juice > 0) { ctx.save(); ctx.globalAlpha = mg.juice; for (let i = 0; i < 5; i++) disc(ctx, v(T - 100 + i * 50, G - 2), 12, '#fb7185'); ctx.restore(); }
  } else if (k === 'duckwave') {
    const dx = mg.dx; const dy = mg.dy ?? G - 120;
    // water
    const pts: V[] = [];
    for (let x = -600; x < T + 900; x += 20) pts.push(v(x, G - 30 - 14 * Math.sin(x * 0.02 - lt * 2.2) - 30 * Math.exp(-((x - dx) ** 2) / 40000)));
    ctx.fillStyle = '#bae6fd'; ctx.beginPath(); ctx.moveTo(-600, G); for (const p of pts) ctx.lineTo(p.x, p.y); ctx.lineTo(T + 900, G); ctx.fill();
    stroke(ctx, pts, '#7dd3fc', 3);
    // duck
    ctx.save(); ctx.translate(dx, dy);
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(0, 0, 110, 70, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.ellipse(70, -20, 50, 30, -0.3, 0, Math.PI * 2); ctx.fill();
    disc(ctx, v(-70, -62), 44, '#fbbf24');
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(-100, -62); ctx.lineTo(-150, -54 + (mg.angry > 0 ? -6 : 0)); ctx.lineTo(-100, -46); ctx.fill();
    disc(ctx, v(-84, -72), 7, '#1f2937'); disc(ctx, v(-86, -74), 2.5, '#ffffff');
    if (mg.angry > 0) stroke(ctx, [v(-100, -90), v(-72, -82)], '#1f2937', 4);
    ctx.restore();
    if (mg.angry > 0) label(ctx, v(dx - 70, dy - 130), tx('QUACK!!', 'KWEK!!'), '#d97706', 22);
  } else if (k === 'selfie') {
    const joko = h.men[1];
    if (joko && !joko.rag) {
      const J = joints(joko); const hand = J[4];
      ctx.save(); ctx.translate(hand.x + 6, hand.y - 8); ctx.rotate(0.2);
      box(ctx, -8, -16, 16, 30, '#1f2937', 3); box(ctx, -6, -13, 12, 22, '#60a5fa', 2);
      disc(ctx, v(-3, -13), 2, '#ffffff');
      if (mg.flash > 0.6) disc(ctx, v(-3, -13), 10, '#ffffff');
      ctx.restore();
      if (mg.cheese > 0) label(ctx, add(headPos(joko), v(-10, -58)), '📸', '#7c3aed', 18);
    }
  } else if (k === 'bees') {
    const c: V = mg.swarm;
    for (const b of mg.bees) {
      const p = add(c, add(b.o, v(12 * Math.sin(lt * 9 + b.ph), 9 * Math.cos(lt * 11 + b.ph))));
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 4, 0.3, 0, Math.PI * 2); ctx.fill();
      stroke(ctx, [v(p.x - 1, p.y - 4), v(p.x - 1, p.y + 4)], '#1f2937', 1.5);
      disc(ctx, v(p.x - 1, p.y - 5), 3, 'rgba(255,255,255,0.7)');
    }
    label(ctx, add(c, v(0, -50 + 3 * Math.sin(lt * 10))), 'BZZZZ', '#d97706', 13);
    if (mg.sting > 0) ring(ctx, c, 46, `rgba(251,191,36,${mg.sting * 0.6})`, 3);
  } else if (k === 'pinata') {
    const A: V = mg.anchor; const p: V = mg.p ?? add(A, v(0, mg.L));
    box(ctx, A.x - 120, A.y - 12, 240, 12, '#8a6a3c', 4);
    box(ctx, A.x + 100, A.y - 12, 10, 482, '#b08c5a');
    for (const c of mg.candy) { ctx.save(); ctx.translate(c.p.x, c.p.y); ctx.rotate(c.rot); box(ctx, -7, -4, 14, 8, c.c, 3); stroke(ctx, [v(-10, -5), v(-7, 0), v(-10, 5)], c.c, 2); stroke(ctx, [v(10, -5), v(7, 0), v(10, 5)], c.c, 2); ctx.restore(); }
    if (!mg.broke) {
      stroke(ctx, [A, p], '#8a6a3c', 3);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-mg.th + 0.3 * mg.burst * Math.sin(lt * 30));
      const cols = ['#f472b6', '#22d3ee', '#fbbf24', '#a3e635'];
      // donkey piñata: body, legs, head
      for (let i = 0; i < 6; i++) box(ctx, -36 + i * 12, -22, 12, 44, cols[i % 4], 2);
      for (const lx of [-28, -12, 10, 26]) box(ctx, lx, 20, 9, 26, cols[(lx + 40) % 4 === 0 ? 1 : 2], 2);
      box(ctx, 28, -40, 30, 30, '#22d3ee', 6); box(ctx, 50, -34, 16, 18, '#f472b6', 4);
      disc(ctx, v(40, -32), 3, '#1f2937');
      stroke(ctx, [v(30, -42), v(26, -58)], '#fbbf24', 5); stroke(ctx, [v(44, -42), v(46, -58)], '#fbbf24', 5);
      stroke(ctx, [v(-36, -10), v(-54, 10 + 6 * Math.sin(lt * 4))], '#a3e635', 5);
      if (mg.hits > 0) stroke(ctx, [v(-10, -22), v(0, 0), v(-8, 20)], '#1f2937', 2);
      ctx.restore();
    }
  } else if (k === 'bejorain') {
    for (const q of mg.minis) {
      const mm: TargetState = q.m;
      if (!mm.rag && q.state === 'fall') {
        // parachute
        const hd = headPos(mm); const top = unscaleDraw(mm, hd, 0.5);
        const c = v(top.x, top.y - 70);
        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(c.x, c.y, 44, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(c.x, c.y, 44, Math.PI + 0.9, Math.PI + 2.2); ctx.lineTo(c.x, c.y); ctx.fill();
        for (const dx of [-44, -15, 15, 44]) stroke(ctx, [v(c.x + dx, c.y), v(top.x, top.y - 14)], '#6b7280', 1.5);
      }
      ctx.save(); ctx.translate(mm.x, mm.y); ctx.scale(0.5, 0.5); ctx.translate(-mm.x, -mm.y);
      drawTarget(ctx, mm);
      ctx.restore();
    }
  }
}
const unscaleDraw = (mm: TargetState, p: V, s: number) => v(mm.x + (p.x - mm.x) * s, mm.y + (p.y - mm.y) * s);

/** the selfie flash and other full-screen things over the archer */
export function drawOver6(h: Host) {
  const k = h.mini; const ctx = h.ctx; const mg = h.mg;
  if (k === 'selfie' && mg.flash > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, mg.flash * 1.4); box(ctx, -6000, -6000, 16000, 12000, '#ffffff'); ctx.restore();
  }
}

void sub; void len; void lerpV;
