import { Ctx, V, v, add, sub, mul, len, dist, clamp, lerp, damp, fromAngle, rot, segDist, groundShadow, stroke } from './util';
import { ARROW_LEN, MAX_DRAW, drawArrow } from './gear';
import { AIM_MAX, AIM_MIN, ArcherPose, ArcherState, DUR, RELEASE_HOLD, STANCE, armyLook, drawArcher, poseArcher } from './archer';
import { initAudio, sfx } from './sfx';
import { tx } from '../i18n';

const G = 606;
const GRAV = 950;
const JUMP_G = 1500;
const JUMP_V = 560;
const RUN = 290;
const WALK = 120;
const MATCH = 60;
const RELOAD = 6.5; // quick, still an animated nock
const speedOf = (f: number) => 720 + 1605 * f;

/** wooden piece: x range and height range above the floor. `walk` = you can stand on it */
interface Box { x0: number; x1: number; lo: number; hi: number; walk: boolean }
// one half of the arena in "own side" coordinates (negative x = your side, 0 = centre)
const HALF: Box[] = [
  { x0: -710, x1: -580, lo: 0, hi: 70, walk: true }, // high ground: great view, no cover
  { x0: -495, x1: -445, lo: 0, hi: 56, walk: true }, // crate: flip over it or stand on it
  { x0: -350, x1: -320, lo: 0, hi: 152, walk: true }, // barricade: crouch to disappear
];
const BOXES: Box[] = [
  ...HALF,
  ...HALF.map((b) => ({ ...b, x0: -b.x1, x1: -b.x0 })),
  { x0: -20, x1: 20, lo: 0, hi: 118, walk: true }, // centre tower, with a slit to shoot through
  { x0: -26, x1: 26, lo: 178, hi: 232, walk: false },
];

interface Stick { s: number; u: number; w: number; rel: number }
type Seg = [V, V, number];
interface Fighter {
  side: 1 | -1; a: ArcherState; pose: ArcherPose; segs: Seg[];
  x: number; h: number; vx: number; vy: number; air: boolean; blocked: boolean;
  move: number; crouch: boolean; duck: number; ph: number; run: number;
  flipK: number; flipDir: number; spin: number;
  aimT: number; pullT: number; fire: boolean; pullVel: number; crossed: boolean; kickV: number; recoilV: number;
  score: number; sticks: Stick[];
}
interface Shot { tip: V; vel: V; ang: number; owner: Fighter; stuck: boolean; t: number }
interface Pop { p: V; text: string; color: string; size: number; life: number }
export interface DuelUi {
  stage: 'intro' | 'play' | 'over'; you: number; bot: number; time: number; result: 'win' | 'lose' | 'draw' | null;
}

function makeFighter(side: 1 | -1): Fighter {
  const lx = -535;
  const gy = G - STANCE.ankle;
  const a: ArcherState = {
    x: lx, ground: G, phase: 'nock', t: 0, time: side > 0 ? 0 : 1.7, aim: -0.1, pull: 0, vib: 0, relAim: -0.1, relPull: 0,
    kick: 0, recoil: 0, quiver: 5, vx: 0, e0: 0, duck: 0, team: side > 0 ? 0 : 1,
    footB: v(lx + STANCE.back, gy), footF: v(lx + STANCE.front, gy), rotB: 0, rotF: 0,
    look: side < 0 ? armyLook(42) : undefined,
  };
  return {
    side, a, pose: poseArcher(a), segs: [], x: side * lx, h: 0, vx: 0, vy: 0, air: false, blocked: false,
    move: 0, crouch: false, duck: 0, ph: 0, run: 0, flipK: 1, flipDir: 1, spin: 0,
    aimT: -0.1, pullT: 0, fire: false, pullVel: 0, crossed: true, kickV: 0, recoilV: 0, score: 0, sticks: [],
  };
}

/** fighter-local point / angle -> world (mirrors the right-hand fighter, applies the flip rotation) */
function W(f: Fighter, p: V): V {
  const q = v(f.side * p.x, p.y);
  if (!f.spin) return q;
  const c = v(f.x, G - f.h - 92);
  return add(c, rot(sub(q, c), f.spin));
}
const Wang = (f: Fighter, ang: number) => (f.side > 0 ? ang : Math.PI - ang) + f.spin;

export class Duel {
  private ctx: Ctx;
  private raf = 0;
  private last = 0;
  private vw = 1;
  private vh = 1;
  private pl = makeFighter(1);
  private bot = makeFighter(-1);
  private arrows: Shot[] = [];
  private pops: Pop[] = [];
  private ai = { state: 'hide' as 'hide' | 'draw', t: 1.2, spot: -400, shots: 0, frac: 1, err: 0, head: false };
  private stage: DuelUi['stage'] = 'intro';
  private time = MATCH;
  private keys = { l: false, r: false, d: false };
  private btn = 0;
  private btnDuck = false;
  private drag: { id: number; ax: number; ay: number; cx: number; cy: number } | null = null;
  private cine = true;
  private slowT = 0;
  private ts = 1;
  private shake = 0;
  private cam = { x: 0, y: G - 130, z: 1 };
  private focus = v(0, G - 130);
  private uiKey = '';
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private onUi: (u: DuelUi) => void) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
  }

  reset() {
    this.pl = makeFighter(1);
    this.bot = makeFighter(-1);
    this.arrows = [];
    this.pops = [];
    this.ai = { state: 'hide', t: 1.2, spot: -400, shots: 0, frac: 1, err: 0, head: false };
    this.stage = 'intro';
    this.time = MATCH;
    this.drag = null;
    this.slowT = 0;
    this.ts = 1;
    this.shake = 0;
  }
  setCine(on: boolean) { this.cine = on; }
  setMove(dir: number) { this.btn = clamp(dir, -1, 1); }
  setCrouch(on: boolean) { this.btnDuck = on; }
  flip() { if (this.stage === 'play') this.doFlip(this.pl); }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = Math.max(1, r.width);
    this.vh = Math.max(1, r.height);
    this.canvas.width = Math.round(this.vw * dpr);
    this.canvas.height = Math.round(this.vh * dpr);
  }

  // ---- input ----------------------------------------------------------------
  private onDown = (e: PointerEvent) => {
    initAudio();
    if (this.stage === 'intro') { this.stage = 'play'; return; }
    if (this.stage !== 'play') return;
    this.drag = { id: e.pointerId, ax: e.clientX, ay: e.clientY, cx: e.clientX, cy: e.clientY };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* optional */ }
    e.preventDefault();
  };
  private onMove = (e: PointerEvent) => {
    if (this.drag && e.pointerId === this.drag.id) { this.drag.cx = e.clientX; this.drag.cy = e.clientY; }
  };
  private onUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    this.pl.fire = true;
  };
  private onCancel = () => { this.drag = null; };
  private onBlur = () => { this.drag = null; this.keys = { l: false, r: false, d: false }; this.btn = 0; this.btnDuck = false; };
  private onKey = (e: KeyboardEvent) => {
    const down = e.type === 'keydown';
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') this.keys.l = down;
    else if (k === 'arrowright' || k === 'd') this.keys.r = down;
    else if (k === 'arrowdown' || k === 's') this.keys.d = down;
    else if (k === 'arrowup' || k === 'w' || k === ' ') { if (down && !e.repeat) this.flip(); }
    else return;
    e.preventDefault();
  };

  // ---- fighters -------------------------------------------------------------
  private doFlip(f: Fighter) {
    if (f.air || f.flipK < 1) return;
    f.air = true;
    f.vy = JUMP_V;
    f.flipK = 0;
    f.flipDir = f.move < 0 ? -1 : 1; // moving backwards = back flip
    sfx.boing();
  }

  private stepFighter(f: Fighter, dt: number, real: number) {
    const a = f.a;
    // -- movement: run, slower with a drawn bow, planted while crouching
    const drawn = a.phase === 'ready' && a.pull > 6;
    const sp = f.crouch && !f.air ? 0 : drawn ? WALK : RUN;
    f.vx = damp(f.vx, f.side * f.move * sp, f.air ? 2.5 : 16, dt);
    let nx = clamp(f.x + f.vx * dt, -725, 725);
    f.blocked = false;
    for (const b of BOXES) {
      const mid = (b.x0 + b.x1) / 2;
      if (b.walk && nx > b.x0 - 13 && nx < b.x1 + 13 && f.h < b.hi - 4 && Math.abs(nx - mid) < Math.abs(f.x - mid)) {
        nx = f.x;
        f.blocked = true;
      }
    }
    f.x = nx;
    let floor = 0;
    for (const b of BOXES) if (b.walk && f.x > b.x0 - 9 && f.x < b.x1 + 9 && f.h >= b.hi - 4) floor = Math.max(floor, b.hi);
    if (f.air) {
      f.vy -= JUMP_G * dt;
      f.h += f.vy * dt;
      if (f.h <= floor && f.vy <= 0) { f.h = floor; f.air = false; f.vy = 0; sfx.hup(); }
    } else if (f.h > floor + 1) { f.air = true; f.vy = 0; } else f.h = floor;
    // -- flip: one full turn, finished quickly on the ground if he lands early
    if (f.flipK < 1) f.flipK = Math.min(1, f.flipK + dt * (f.air ? 1 / 0.75 : 5));
    const k = f.flipK;
    f.spin = k < 1 ? f.side * f.flipDir * Math.PI * 2 * (k * k * (3 - 2 * k)) : 0;
    const tuck = k < 1 ? Math.sin(Math.PI * k) : 0;
    f.duck = damp(f.duck, f.crouch && !f.air ? 1 : 0, 14, dt);
    // -- feet: a planted foot stays exactly where it is while the body passes over it
    const lv = f.vx * f.side;
    const runK = clamp(Math.abs(lv) / RUN, 0, 1);
    const S = lerp(16, 30, runK);
    f.ph += (lv * dt) / (4 * S);
    f.run = damp(f.run, f.air ? 0 : Math.min(1, runK * 3), 12, dt);
    a.x = f.side * f.x;
    a.ground = G - f.h;
    a.duck = 64 * f.duck + 34 * tuck;
    a.vx = lv * 0.5;
    const gy = a.ground - STANCE.ankle;
    const foot = (i: number, home: number): [V, number] => {
      const p = (((f.ph + i * 0.5) % 1) + 1) % 1;
      const rel = p < 0.5 ? S - p * 4 * S : -S + (p - 0.5) * 4 * S;
      const lift = p < 0.5 ? 0 : Math.sin((p - 0.5) * 2 * Math.PI) * lerp(8, 18, runK);
      return [v(a.x + lerp(home, home * 0.3 + rel, f.run) * (1 - 0.5 * tuck), gy - lift * f.run - 26 * tuck), p < 0.5 ? 0 : 0.35 * f.run * Math.sign(lv)];
    };
    [a.footB, a.rotB] = foot(0, STANCE.back);
    [a.footF, a.rotF] = foot(1, STANCE.front);
    // -- bow
    a.time += real;
    a.t += dt * (a.phase === 'nock' || a.phase === 'recover' ? RELOAD : 1);
    if (a.phase === 'nock' || a.phase === 'ready') a.aim = damp(a.aim, f.aimT, 14, dt);
    if (a.phase === 'nock' && a.t >= DUR.nock) { a.phase = 'ready'; a.t = 0; a.pull = 0; a.vib = 0; f.pullVel = 0; }
    else if (a.phase === 'ready') a.pull = damp(a.pull, f.pullT, 13, dt);
    else if (a.phase === 'release' && a.t > RELEASE_HOLD) { a.phase = 'recover'; a.t = 0; }
    else if (a.phase === 'recover' && a.t >= DUR.recover) { a.phase = 'nock'; a.t = 0; }
    if (a.phase !== 'ready') {
      const n = Math.max(1, Math.ceil(dt / 0.002));
      for (let i = 0; i < n; i++) {
        f.pullVel += (-5200 * a.pull - 26 * f.pullVel) * (dt / n);
        a.pull += f.pullVel * (dt / n);
        if (!f.crossed && a.pull <= 0) { f.crossed = true; f.pullVel *= 0.2; }
      }
      a.vib = clamp(Math.abs(f.pullVel) * 0.012, 0, 7) * (f.crossed ? 1 : 0);
    }
    const firm = a.phase === 'ready' || (a.phase === 'nock' && a.t > DUR.nock * 0.7);
    f.kickV += (firm ? -400 * a.kick - 30 * f.kickV : -46 * a.kick - 5.4 * f.kickV) * dt;
    a.kick += f.kickV * dt;
    f.recoilV += (-160 * a.recoil - 16 * f.recoilV) * dt;
    a.recoil += f.recoilV * dt;
    f.pose = poseArcher(a);
    const p = f.pose;
    const raw: [V, V, number][] = [
      [p.neck, p.headC, 17], [p.hip, p.neck, 13], [p.hip, p.legB.mid, 10], [p.legB.mid, p.ankB, 8],
      [p.hip, p.legF.mid, 10], [p.legF.mid, p.ankF, 8], [p.Sf, p.fa.mid, 6.5], [p.fa.mid, p.fa.end, 6],
      [p.Sr, p.ra.mid, 6.5], [p.ra.mid, p.ra.end, 6],
    ];
    f.segs = raw.map(([s0, s1, r]) => [W(f, s0), W(f, s1), r]);
    // -- loose
    if (f.fire) {
      f.fire = false;
      if (a.phase === 'ready' && a.pull > MAX_DRAW * 0.18 && p.arrow) {
        const frac = clamp(a.pull / MAX_DRAW, 0, 1);
        const ang = Wang(f, p.arrow.angle);
        this.arrows.push({
          tip: add(W(f, p.arrow.nock), fromAngle(ang, ARROW_LEN)), vel: add(fromAngle(ang, speedOf(frac)), v(f.vx, 0)),
          ang, owner: f, stuck: false, t: 0,
        });
        a.relAim = a.aim; a.relPull = a.pull; a.phase = 'release'; a.t = 0;
        f.pullVel = 0; f.crossed = false; f.kickV += 2.4 + 2.4 * frac; f.recoilV -= 0.55 * frac;
        sfx.twang(frac);
      }
    }
  }

  /** hide, pop up, shoot, relocate – with a human amount of aiming error */
  private botThink(dt: number) {
    const b = this.bot;
    const ai = this.ai;
    ai.t -= dt;
    const lx = b.side * b.x;
    b.move = 0;
    if (Math.abs(lx - ai.spot) > 8) {
      b.move = Math.sign(ai.spot - lx);
      b.crouch = false;
      b.pullT = 0;
      if (b.blocked && !b.air) this.doFlip(b); // parkour over the crate
      return;
    }
    if (ai.state === 'hide') {
      b.crouch = true;
      b.pullT = 0;
      if (ai.t <= 0 && b.a.phase === 'ready') {
        const lob = Math.random() < 0.2;
        ai.state = 'draw';
        ai.t = 0.4 + Math.random() * 0.45;
        ai.frac = lob ? 0.2 + Math.random() * 0.1 : 0.8 + Math.random() * 0.2;
        ai.err = (Math.random() - 0.5) * (lob ? 0.2 : 0.11);
        ai.head = Math.random() < 0.5;
      }
      return;
    }
    b.crouch = false;
    const from = W(b, b.pose.bow.pos);
    const to = ai.head ? this.pl.segs[0][1] : lerpV2(this.pl.segs[1][0], this.pl.segs[1][1], 0.6);
    const dx = Math.max(60, Math.abs(to.x - from.x));
    const up = from.y - to.y;
    const sp = speedOf(ai.frac);
    const disc = sp ** 4 - GRAV * (GRAV * dx * dx + 2 * up * sp * sp);
    const th = disc > 0 ? Math.atan((sp * sp - Math.sqrt(disc)) / (GRAV * dx)) : 0.7;
    b.aimT = clamp(-th + ai.err, AIM_MIN, AIM_MAX);
    b.pullT = ai.frac * MAX_DRAW;
    if (ai.t <= 0 && b.a.pull > b.pullT * 0.93) {
      b.fire = true;
      ai.state = 'hide';
      ai.t = 0.5 + Math.random() * 1.0;
      if (++ai.shots % 3 === 0 && Math.random() < 0.7) ai.spot = ai.spot === -400 ? -540 : -400;
    }
  }

  private pop(p: V, text: string, color: string, size = 26) {
    this.pops.push({ p: { ...p }, text, color, size, life: 0 });
  }

  private stepArrows(dt: number) {
    for (const s of [...this.arrows]) {
      s.t += dt;
      if (s.stuck) continue;
      s.vel.y += GRAV * dt;
      s.ang = Math.atan2(s.vel.y, s.vel.x);
      const n = Math.max(1, Math.ceil((len(s.vel) * dt) / 4));
      const foe = s.owner === this.pl ? this.bot : this.pl;
      for (let i = 0; i < n && !s.stuck; i++) {
        s.tip = add(s.tip, mul(s.vel, dt / n));
        const t = s.tip;
        let hit = -1;
        if (this.stage === 'play') {
          foe.segs.forEach(([p0, p1, r], j) => {
            if (hit < 0 && (j === 0 ? dist(t, p1) < r : segDist(t, p0, p1).d < r)) hit = j;
          });
        }
        if (hit >= 0) {
          const [p0, p1] = foe.segs[hit];
          const d = sub(p1, p0);
          const L = len(d) || 1;
          const deep = add(t, fromAngle(s.ang, 9));
          const rel = sub(deep, p0);
          foe.sticks.push({ s: hit, u: (rel.x * d.x + rel.y * d.y) / (L * L), w: (d.x * rel.y - d.y * rel.x) / L, rel: s.ang - Math.atan2(d.y, d.x) });
          if (foe.sticks.length > 14) foe.sticks.shift();
          foe.recoilV += (hit < 2 ? 2.2 : 1.1) * Math.sign(s.vel.x) * foe.side;
          this.arrows.splice(this.arrows.indexOf(s), 1);
          if (hit < 2) {
            s.owner.score++;
            this.pop(add(t, v(0, -46)), hit === 0 ? tx('HEAD! +1', 'KEPALA! +1') : tx('CHEST! +1', 'DADA! +1'), s.owner === this.pl ? '#16a34a' : '#dc2626', 30);
            this.shake = 9;
            this.slowT = 0.3;
            this.focus = v(foe.x, G - foe.h - 110);
            sfx.ouch();
          } else {
            this.pop(add(t, v(0, -30)), tx('not vital', 'bukan titik vital'), '#6b7280', 17);
            this.shake = 4;
            sfx.thunk();
          }
          break;
        }
        const ht = G - t.y;
        if (ht <= 0 || BOXES.some((b) => t.x > b.x0 && t.x < b.x1 && ht > b.lo && ht < b.hi)) {
          s.tip = add(t, fromAngle(s.ang, 8));
          s.stuck = true;
          s.t = 0;
          sfx.thunk();
        } else if (Math.abs(t.x) > 1100 || t.y < -2500) this.arrows.splice(this.arrows.indexOf(s), 1);
      }
    }
    // old arrows fade out so the arena never clogs up
    this.arrows = this.arrows.filter((s) => !s.stuck || s.t < 9);
  }

  private update(real: number) {
    if (!this.cine) this.slowT = 0;
    this.slowT = Math.max(0, this.slowT - real);
    const zoom = this.slowT > 0;
    this.ts = damp(this.ts, zoom ? 0.15 : 1, 30, real);
    this.cam.x = damp(this.cam.x, zoom ? this.focus.x * 0.7 : 0, 7, real);
    this.cam.y = damp(this.cam.y, zoom ? lerp(G - 130, this.focus.y, 0.5) : G - 130, 7, real);
    this.cam.z = damp(this.cam.z, zoom ? 1.45 : 1, 7, real);
    this.shake = damp(this.shake, 0, 9, real);
    const dt = real * this.ts;
    const playing = this.stage === 'play';
    if (playing && (this.time -= dt) <= 0) { this.time = 0; this.stage = 'over'; this.drag = null; }
    const pl = this.pl;
    pl.move = playing ? clamp((this.keys.r ? 1 : 0) - (this.keys.l ? 1 : 0) + this.btn, -1, 1) : 0;
    pl.crouch = playing && (this.keys.d || this.btnDuck);
    pl.pullT = 0;
    if (this.drag && playing) {
      const dx = this.drag.ax - this.drag.cx;
      const dy = this.drag.ay - this.drag.cy;
      const l = Math.hypot(dx, dy);
      const full = clamp(Math.min(this.vw, this.vh) * 0.3, 110, 220);
      if (l > 12) pl.aimT = dx <= 4 ? (dy < 0 ? AIM_MIN : AIM_MAX) : clamp(Math.atan2(dy, dx), AIM_MIN, AIM_MAX);
      pl.pullT = (1 - Math.pow(1 - clamp((l - 10) / full, 0, 1), 1.35)) * MAX_DRAW;
    }
    if (playing) this.botThink(dt);
    else { this.bot.move = 0; this.bot.pullT = 0; this.bot.crouch = false; }
    this.stepFighter(pl, dt, real);
    this.stepFighter(this.bot, dt, real);
    this.stepArrows(dt);
    for (const p of this.pops) { p.life += dt; p.p.y -= 46 * dt; }
    this.pops = this.pops.filter((p) => p.life < 1.3);
    const you = pl.score;
    const bot = this.bot.score;
    const ui: DuelUi = {
      stage: this.stage, you, bot, time: Math.ceil(this.time),
      result: this.stage === 'over' ? (you > bot ? 'win' : you < bot ? 'lose' : 'draw') : null,
    };
    const key = JSON.stringify(ui);
    if (key !== this.uiKey) { this.uiKey = key; this.onUi(ui); }
  }

  // ---- rendering --------------------------------------------------------------
  private frame = (now: number) => {
    const real = clamp((now - this.last) / 1000, 0, 1 / 30);
    this.last = now;
    this.update(real);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawFighter(f: Fighter, label: string) {
    const ctx = this.ctx;
    groundShadow(ctx, f.x, G, 60 * (1 - clamp(f.h / 300, 0, 0.6)), 0.12);
    ctx.save();
    if (f.spin) { ctx.translate(f.x, G - f.h - 92); ctx.rotate(f.spin); ctx.translate(-f.x, -(G - f.h - 92)); }
    else if (!f.air) { ctx.beginPath(); ctx.rect(f.x - 400, -4000, 800, 4000 + G - f.h + 2.5); ctx.clip(); } // nothing pokes through the floor
    ctx.scale(f.side, 1);
    drawArcher(ctx, f.pose);
    ctx.restore();
    for (const st of f.sticks) {
      const [p0, p1] = f.segs[st.s];
      const d = sub(p1, p0);
      const L = len(d) || 1;
      const tip = add(add(p0, mul(d, st.u)), mul(v(-d.y / L, d.x / L), st.w));
      const ang = Math.atan2(d.y, d.x) + st.rel;
      drawArrow(ctx, sub(tip, fromAngle(ang, ARROW_LEN)), ang, { embed: 12 });
    }
    const head = f.segs[0] ? f.segs[0][1] : v(f.x, G - 180);
    ctx.fillStyle = f.side > 0 ? '#d8363c' : '#7c3aed';
    ctx.font = '900 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, head.x, head.y - 38);
  }

  private render() {
    const ctx = this.ctx;
    const dpr = this.canvas.width / this.vw;
    const floorPx = clamp(this.vh * 0.2, 100, 130);
    const scale = Math.min(this.vw / 1520, (this.vh - floorPx - 70) / 300) * this.cam.z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.translate(this.vw / 2, this.vh - floorPx - 130 * (scale / this.cam.z));
    ctx.scale(scale, scale);
    ctx.translate(-this.cam.x + Math.sin(this.pl.a.time * 97) * this.shake, -this.cam.y + Math.cos(this.pl.a.time * 83) * this.shake);

    stroke(ctx, [v(-3000, G), v(3000, G)], '#d5d9e0', 2, 'butt');
    for (let x = -1500; x < 1500; x += 83.5) stroke(ctx, [v(x, G + 5), v(x, G + 11)], '#e2e5ea', 2, 'butt');
    // posts that carry the upper beam of the centre tower (background, arrows pass in front)
    ctx.fillStyle = '#dcb98c';
    ctx.fillRect(-25, G - 232, 5, 232);
    ctx.fillRect(20, G - 232, 5, 232);
    for (const b of BOXES) {
      const y = G - b.hi;
      const w = b.x1 - b.x0;
      const h = b.hi - b.lo;
      ctx.fillStyle = '#c58f52';
      ctx.fillRect(b.x0, y, w, h);
      ctx.fillStyle = 'rgba(90,45,10,0.24)';
      for (let yy = y + 23; yy < y + h - 5; yy += 23) ctx.fillRect(b.x0, yy, w, 2.5);
      ctx.fillRect(b.x1 - 5, y, 5, h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x0, y, w, 3);
      ctx.fillStyle = '#8a5a2e';
      for (let yy = y + 11; yy < y + h; yy += 23) { ctx.fillRect(b.x0 + 4, yy, 2.5, 2.5); ctx.fillRect(b.x1 - 11, yy, 2.5, 2.5); }
    }
    for (const s of this.arrows) {
      if (!s.stuck) continue;
      ctx.globalAlpha = clamp((9 - s.t) / 1.5, 0, 1);
      drawArrow(ctx, sub(s.tip, fromAngle(s.ang, ARROW_LEN)), s.ang, { embed: 11 });
      ctx.globalAlpha = 1;
    }
    this.drawFighter(this.bot, 'BOT');
    this.drawFighter(this.pl, tx('YOU', 'KAMU'));
    for (const s of this.arrows) if (!s.stuck) drawArrow(ctx, sub(s.tip, fromAngle(s.ang, ARROW_LEN)), s.ang, { flex: 6 * Math.exp(-4.5 * s.t) * Math.sin(s.t * 42) });

    // aim guide
    const pl = this.pl;
    const frac = clamp(pl.a.pull / MAX_DRAW, 0, 1);
    if (pl.a.phase === 'ready' && pl.pose.arrow && frac > 0.06) {
      const ang = Wang(pl, pl.pose.arrow.angle);
      const tip = add(W(pl, pl.pose.arrow.nock), fromAngle(ang, ARROW_LEN));
      const vel = add(fromAngle(ang, speedOf(frac)), v(pl.vx, 0));
      ctx.fillStyle = '#111827';
      for (let i = 1; i <= 10; i++) {
        const k = i * 0.024;
        ctx.globalAlpha = 0.5 * (1 - i / 11);
        ctx.beginPath();
        ctx.arc(tip.x + vel.x * k, tip.y + vel.y * k + 0.5 * GRAV * k * k, 4.2 - i * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const p of this.pops) {
      const pop = 1 + 0.5 * Math.exp(-p.life * 9) * Math.cos(p.life * 22);
      ctx.save();
      ctx.globalAlpha = clamp(1 - (p.life / 1.3) ** 2, 0, 1);
      ctx.translate(p.p.x, p.p.y);
      ctx.scale(pop, pop);
      ctx.font = `900 ${p.size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    if (this.drag && this.stage === 'play') {
      const r = this.canvas.getBoundingClientRect();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const A = v(this.drag.ax - r.left, this.drag.ay - r.top);
      const B = v(this.drag.cx - r.left, this.drag.cy - r.top);
      ctx.setLineDash([6, 7]);
      stroke(ctx, [A, B], 'rgba(17,24,39,0.35)', 2);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(239,68,68,0.9)';
      ctx.beginPath(); ctx.arc(B.x, B.y, 9, 0, Math.PI * 2); ctx.fill();
    }
  }
}

const lerpV2 = (a: V, b: V, t: number): V => v(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
