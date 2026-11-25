// Story mode: you stand on a floating stone platform in the sky; enemy archers spawn on other
// platforms and try to shoot you down. Clear all ten chapters.
import { Ctx, V, v, add, sub, mul, len, dist, clamp, lerp, damp, fromAngle, rot, segDist, stroke } from './util';
import { ARROW_LEN, MAX_DRAW, drawArrow } from './gear';
import { AIM_MAX, AIM_MIN, ArcherPose, ArcherState, BOSS_LOOK, DUR, Look, RELEASE_HOLD, STANCE, armyLook, drawArcher, drawAxe, drawHeadExtras, drawShield, drawSword, drawTowerShield, poseArcher, swordArms } from './archer';
import { initAudio, sfx } from './sfx';
import { ArcherRag, TUCK, drawArcherRag, makeArcherRag, punchRag, ragCentre, ragStickFrame, spinRag, updateArcherRag } from './archerRag';
import { tx } from '../i18n';

const G = 606;
const GRAV = 950;
const JUMP_G = 1500;
const JUMP_V = 810;
const FLIP_T = 0.8; // seconds for one full somersault
const RUN = 270;
const WALK = 120;
const RELOAD = 6.5; // quick, still an animated nock
const speedOf = (f: number) => 720 + 1605 * f;

interface Plat { x0: number; x1: number; top: number } // top = height above G
interface Stick { s: number; u: number; w: number; rel: number }
/** things knocked loose: a helmet, a broken shield, a deflected arrow, a loaf of bread to pick up */
interface Prop { kind: 'helmet' | 'shield' | 'arrow' | 'bread' | 'axe' | 'sword'; p: V; vel: V; rot: number; vr: number; t: number; look?: Look; face: number; rest: boolean }
/** a thrown axe in flight - it can be shot out of the air */
interface Axe { p: V; vel: V; rot: number; t: number }
interface ShieldStick { d: V; rel: number }
const HELMETS = new Set(['helmet', 'nasal', 'kettle', 'greathelm', 'coif', 'crown']);
type Seg = [V, V, number];
interface Fighter {
  side: 1 | -1; a: ArcherState; pose: ArcherPose; segs: Seg[]; plat: Plat;
  x: number; h: number; vx: number; vy: number; air: boolean;
  move: number; crouch: boolean; duck: number; ph: number; run: number;
  flipK: number; flipDir: number; spin: number;
  aimT: number; pullT: number; fire: boolean; pullVel: number; crossed: boolean; kickV: number; recoilV: number;
  hp: number; maxHp: number; dead: boolean; deadT: number; rag: ArcherRag | null; down: number; getUp: number; sticks: Stick[];
  flipRag: ArcherRag | null; flipJ0: V[]; jumpT: number; land: number; spinRate: number; prevSpin: number;
  kind: 'bow' | 'sword' | 'tower' | 'axe'; dropT: number; atk: { phase: 'run' | 'wind' | 'strike' | 'cool'; t: number };
  shieldC: V | null; shieldHp: number; shieldSticks: ShieldStick[];
  /** injuries change how he moves: a bad leg limps, two bad legs crawl, a dazed head staggers, a hurt arm shoots badly */
  inj: { legs: number; arms: number; dazed: number; flee: boolean; crawl: boolean; crawlT: number; hand: number };
  blendT: number; blendDur: number; blendFrom: V[] | null; blendRag: ArcherRag | null;
  ai: { state: 'wait' | 'draw'; t: number; frac: number; err: number; head: boolean; dodge: number; spot: number; shots: number };
  hurt: number; name: string;
}
interface Shot { tip: V; vel: V; ang: number; owner: Fighter; stuck: boolean; t: number }
interface Pop { p: V; text: string; color: string; size: number; life: number }
interface Cloud { x: number; y: number; r: number; sp: number }
export interface StoryUi {
  stage: 'intro' | 'play' | 'clear' | 'over' | 'won';
  chapter: number; chapters: number; hp: number; maxHp: number; kills: number; left: number; score: number; best: number; title: string; mode: StoryMode;
}

/** platforms are given as [centre x, height above G, width]; enemies per chapter, their hit points & aim */
interface Chapter { title: string; titleId: string; plats: [number, number, number][]; total: number; hp: number; err: number; rate: number; alive?: number; march?: number; sword?: number; fly?: number; tower?: number; axe?: number }
export type StoryMode = 'sky' | 'war';
const CHAPTERS: Chapter[] = [
  { title: 'Sentinel Archer', titleId: 'Pemanah penjaga', plats: [[430, 60, 150]], total: 1, hp: 3, err: 0.32, rate: 4.8 },
  { title: 'Twin Towers', titleId: 'Dua menara', plats: [[300, 40, 140], [600, 220, 140]], total: 2, hp: 3, err: 0.27, rate: 4.3 },
  { title: 'Windy Valley', titleId: 'Lembah angin', plats: [[180, 260, 130], [520, 20, 160]], total: 3, hp: 3, err: 0.23, rate: 3.9 },
  { title: 'Sky Stairs', titleId: 'Tangga langit', plats: [[150, 120, 120], [400, 260, 120], [650, 60, 130]], total: 4, hp: 3, err: 0.17, rate: 3.4 },
  { title: 'Sharpshooter', titleId: 'Penembak jitu', plats: [[620, 320, 150], [260, 0, 160]], total: 4, hp: 3, err: 0.12, rate: 3.6 },
  { title: 'Surrounded', titleId: 'Kepungan', plats: [[120, 60, 120], [380, 180, 120], [640, 300, 120], [520, -20, 130]], total: 6, hp: 3, err: 0.15, rate: 3.0 },
  { title: 'Cloud Peak', titleId: 'Puncak awan', plats: [[220, 340, 130], [470, 120, 130], [700, 260, 130]], total: 6, hp: 3, err: 0.12, rate: 2.9 },
  { title: 'Narrow Cliff', titleId: 'Tebing sempit', plats: [[90, 200, 110], [330, 40, 110], [560, 280, 110], [720, 100, 110]], total: 7, hp: 3, err: 0.11, rate: 2.7 },
  { title: 'Arrow Storm', titleId: 'Badai panah', plats: [[160, 300, 120], [420, 200, 120], [660, 60, 120], [300, -10, 120]], total: 9, hp: 3, err: 0.1, rate: 2.3 },
  { title: 'Sky Captain', titleId: 'Kapten Langit', plats: [[520, 200, 190], [180, 320, 120], [700, 40, 120]], total: 8, hp: 3, err: 0.08, rate: 2.2 },
];
/** the open field: waves of archers march in from the right */
const WAR_CHAPTERS: Chapter[] = [
  { title: 'Border Patrol', titleId: 'Patroli perbatasan', plats: [], total: 3, hp: 3, err: 0.3, rate: 4.6, alive: 2, march: 110, sword: 0.3, fly: 0.2, tower: 0, axe: 0 },
  { title: 'Scout Squad', titleId: 'Regu pengintai', plats: [], total: 5, hp: 3, err: 0.26, rate: 4.2, alive: 2, march: 120, sword: 0.35, fly: 0.3, tower: 0, axe: 0.14 },
  { title: 'Frontline', titleId: 'Barisan depan', plats: [], total: 7, hp: 3, err: 0.22, rate: 3.8, alive: 3, march: 130, sword: 0.35, fly: 0.3, tower: 0.12, axe: 0.14 },
  { title: 'Dawn Raid', titleId: 'Serbuan fajar', plats: [], total: 9, hp: 3, err: 0.19, rate: 3.4, alive: 3, march: 145, sword: 0.45, fly: 0.3, tower: 0.12, axe: 0.14 },
  { title: 'Archer Corps', titleId: 'Pasukan pemanah', plats: [], total: 11, hp: 3, err: 0.16, rate: 3.1, alive: 4, march: 150, sword: 0.35, fly: 0.4, tower: 0.12, axe: 0.14 },
  { title: 'Second Wave', titleId: 'Gelombang kedua', plats: [], total: 13, hp: 3, err: 0.14, rate: 2.9, alive: 4, march: 160, sword: 0.45, fly: 0.35, tower: 0.12, axe: 0.14 },
  { title: 'The Siege', titleId: 'Pengepungan', plats: [], total: 15, hp: 3, err: 0.12, rate: 2.6, alive: 5, march: 170, sword: 0.45, fly: 0.4, tower: 0.12, axe: 0.14 },
  { title: 'War General', titleId: 'Jenderal Perang', plats: [], total: 14, hp: 3, err: 0.09, rate: 2.3, alive: 5, march: 180, sword: 0.5, fly: 0.4, tower: 0.12, axe: 0.14 },
];
/** floating stones over the field - you can hop up them, soldiers appear on them too */
const WAR_PLATS: Plat[] = [
  { x0: -480, x1: -280, top: 200 }, { x0: -40, x1: 140, top: 320 }, { x0: 360, x1: 590, top: 190 },
  { x0: 760, x1: 930, top: 330 }, { x0: 1140, x1: 1340, top: 210 },
];
const WAR_X0 = -820;
const WAR_X1 = 1450;

const HOME: Plat = { x0: -780, x1: -560, top: 70 };
const HOME_WAR: Plat = { x0: -820, x1: -260, top: 0 };
const FIELD: Plat = { x0: -1600, x1: 3000, top: 0 };
const STORE = 'perfectshot.story.best';
const STORE_WAR = 'perfectshot.war.best';

function makeFighter(side: 1 | -1, plat: Plat, x: number, hp: number, name: string): Fighter {
  const lx = side * x;
  const gy = G - plat.top - STANCE.ankle;
  const a: ArcherState = {
    x: lx, ground: G - plat.top, phase: 'nock', t: 0, time: side > 0 ? 0 : Math.random() * 3, aim: -0.1, pull: 0, vib: 0, relAim: -0.1, relPull: 0,
    kick: 0, recoil: 0, quiver: 5, vx: 0, e0: 0, duck: 0, team: side > 0 ? 0 : 1,
    footB: v(lx + STANCE.back, gy), footF: v(lx + STANCE.front, gy), rotB: 0, rotF: 0,
  };
  return {
    side, a, pose: poseArcher(a), segs: [], plat, x, h: plat.top, vx: 0, vy: 0, air: false,
    move: 0, crouch: false, duck: 0, ph: 0, run: 0, flipK: 1, flipDir: 1, spin: 0,
    aimT: -0.1, pullT: 0, fire: false, pullVel: 0, crossed: true, kickV: 0, recoilV: 0,
    hp, maxHp: hp, dead: false, deadT: 0, rag: null, down: 0, getUp: 0, sticks: [],
    flipRag: null, flipJ0: [], jumpT: 0, land: 0, spinRate: 0, prevSpin: 0,
    kind: 'bow', dropT: 0, atk: { phase: 'run', t: 0 },
    shieldC: null, shieldHp: 3, shieldSticks: [],
    inj: { legs: 0, arms: 0, dazed: 0, flee: false, crawl: false, crawlT: 0, hand: 0 }, blendT: 0, blendDur: 0.5, blendFrom: null, blendRag: null,
    ai: { state: 'wait', t: 1.2 + Math.random() * 1.5, frac: 1, err: 0, head: false, dodge: 0, spot: x, shots: 0 }, hurt: 0, name,
  };
}
function W(f: Fighter, p: V): V {
  const q = v(f.side * p.x, p.y);
  if (!f.spin) return q;
  const c = v(f.x, G - f.h - 92);
  return add(c, rot(sub(q, c), f.spin));
}
const Wang = (f: Fighter, ang: number) => (f.side > 0 ? ang : Math.PI - ang) + f.spin;
const NAMES: [string, string][] = [
  ['Sky Archer', 'Pemanah Awan'],
  ['Hawkeye', 'Si Mata Elang'],
  ['Big Jon', 'Bang Jono'],
  ['Udin', 'Kang Udin'],
  ['Sri', 'Mbak Sri'],
  ['Chief', 'Pak RT'],
  ['Lefty', 'Si Kidal'],
  ['Marksman', 'Juru Tembak'],
  ['Warden', 'Bu Lurah'],
  ['Sky Captain', 'Kapten Langit'],
];

export class Story {
  private ctx: Ctx;
  private raf = 0;
  private last = 0;
  private vw = 1;
  private vh = 1;
  private pl!: Fighter;
  private foes: Fighter[] = [];
  private arrows: Shot[] = [];
  private pops: Pop[] = [];
  private props: Prop[] = [];
  private axes: Axe[] = [];
  private combo = { n: 0, t: 0 };
  private clouds: Cloud[] = [];
  private stage: StoryUi['stage'] = 'intro';
  private chapter = 0;
  private spawned = 0;
  private kills = 0;
  private score = 0;
  private best = 0;
  private spawnT = 0;
  private clearT = 0;
  private time = 0;
  private keys = { l: false, r: false, d: false };
  private btn = 0;
  private btnDuck = false;
  private drag: { id: number; ax: number; ay: number; cx: number; cy: number } | null = null;
  private cine = true;
  private slowT = 0;
  private ts = 1;
  private shake = 0;
  private flashHurt = 0;
  private cam = { x: 0, y: G - 180, z: 1 };
  private focus = v(0, G - 180);
  private uiKey = '';
  private view = { scale: 1, ox: 0, oy: 0 }; // world -> css px, refreshed every render
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private onUi: (u: StoryUi) => void, readonly mode: StoryMode = 'sky') {
    this.ctx = canvas.getContext('2d')!;
    try { this.best = Number(localStorage.getItem(this.mode === 'war' ? STORE_WAR : STORE) ?? 0) || 0; } catch { this.best = 0; }
    this.reset();
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

  private get list() { return this.mode === 'war' ? WAR_CHAPTERS : CHAPTERS; }
  private get war() { return this.mode === 'war'; }
  reset(chapter = 0) {
    this.chapter = clamp(chapter, 0, this.list.length - 1);
    this.pl = makeFighter(1, this.war ? HOME_WAR : HOME, this.war ? -560 : -670, 100, tx('YOU', 'KAMU'));
    this.pl.a.phase = 'nock';
    this.foes = [];
    this.arrows = [];
    this.pops = [];
    this.props = [];
    this.axes = [];
    this.combo = { n: 0, t: 0 };
    this.spawned = 0;
    this.kills = chapter === 0 ? 0 : this.kills;
    this.score = chapter === 0 ? 0 : this.score;
    this.spawnT = 0.6;
    this.stage = 'intro';
    this.drag = null;
    this.slowT = 0;
    this.ts = 1;
    this.shake = 0;
    this.clouds = Array.from({ length: 14 }, (_, i) => ({ x: -900 + i * 140 + Math.random() * 80, y: G - 560 + Math.random() * 700, r: 26 + Math.random() * 40, sp: 6 + Math.random() * 10 }));
  }
  setCine(on: boolean) { this.cine = on; }
  setMove(dir: number) { this.btn = clamp(dir, -1, 1); }
  setCrouch(on: boolean) { this.btnDuck = on; }
  flip() { if (this.stage === 'play') this.doFlip(this.pl); }
  /** after a game over: start the chapter again with full health */
  retry() { this.reset(this.chapter); }

  private get ch() { return this.list[this.chapter]; }
  private plats(): Plat[] {
    if (this.war) return [FIELD, ...WAR_PLATS];
    return [HOME, ...this.ch.plats.map(([cx, top, w]) => ({ x0: cx - w / 2, x1: cx + w / 2, top }))];
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = Math.max(1, r.width);
    this.vh = Math.max(1, r.height);
    this.canvas.width = Math.round(this.vw * dpr);
    this.canvas.height = Math.round(this.vh * dpr);
  }

  // ---- input ----------------------------------------------------------------
  private announce() {
    const at = v(this.pl.x, G - this.pl.h - 250);
    this.pop(at, `${tx(this.war ? 'WAVE' : 'CHAPTER', this.war ? 'GELOMBANG' : 'BAB')} ${this.chapter + 1}`, '#111827', 36);
    this.pop(add(at, v(0, 34)), tx(this.ch.title, this.ch.titleId).toUpperCase(), '#7c3aed', 20);
    sfx.boom();
  }
  private stepProps(dt: number) {
    const pl = this.pl;
    for (const q of [...this.props]) {
      q.t += dt;
      if (!q.rest) {
        q.vel.y += 1100 * dt;
        q.p = add(q.p, mul(q.vel, dt));
        q.rot += q.vr * dt;
        const floorY = G - (this.war ? this.floorUnder(q.p.x, G - q.p.y - 10) : 0);
        const onPlat = !this.war && this.plats().some((p) => q.p.x > p.x0 && q.p.x < p.x1 && Math.abs(G - p.top - q.p.y) < 14 && q.vel.y > 0);
        if ((q.p.y >= floorY - 6 && q.vel.y > 0 && (this.war || q.p.y < G + 2)) || onPlat) {
          q.p.y = onPlat ? q.p.y : floorY - 6;
          q.vel = v(q.vel.x * 0.5, -q.vel.y * 0.35);
          q.vr *= 0.5;
          if (Math.abs(q.vel.y) < 70) { q.rest = true; q.vel = v(0, 0); if (q.kind === 'arrow') q.rot = Math.cos(q.rot) > 0 ? 0.15 : Math.PI - 0.15; }
          else sfx.tuk();
        }
      }
      // bread heals whoever walks over it
      if (q.kind === 'bread' && !pl.dead && Math.abs(pl.x - q.p.x) < 42 && Math.abs(G - pl.h - 40 - q.p.y) < 70) {
        pl.hp = Math.min(pl.maxHp, pl.hp + 15);
        this.pop(add(q.p, v(0, -40)), tx('+15 BREAD', '+15 ROTI'), '#16a34a', 24);
        sfx.crunch();
        this.props.splice(this.props.indexOf(q), 1);
        continue;
      }
      if (q.t > (q.kind === 'bread' ? 14 : 8) || q.p.y > G + 600) this.props.splice(this.props.indexOf(q), 1);
    }
  }
  private drawProps() {
    const ctx = this.ctx;
    for (const q of this.props) {
      ctx.save();
      ctx.globalAlpha = clamp(((q.kind === 'bread' ? 14 : 8) - q.t) / 1.2, 0, 1);
      ctx.translate(q.p.x, q.p.y);
      if (q.kind === 'arrow') drawArrow(ctx, fromAngle(q.rot + Math.PI, ARROW_LEN / 2), q.rot);
      else if (q.kind === 'axe') { ctx.rotate(q.rot); drawAxe(ctx, v(-14, 0), 0); }
      else if (q.kind === 'sword') { ctx.rotate(q.rot); drawSword(ctx, v(-20, 0), 0); }
      else if (q.kind === 'helmet' && q.look) { ctx.rotate(q.rot); ctx.scale(q.face, 1); drawHeadExtras(ctx, { ...q.look, beard: false, glasses: false }); }
      else if (q.kind === 'shield' && q.look) { ctx.rotate(q.rot); if (q.look.tower) drawTowerShield(ctx, v(0, 0), q.look.shirt, q.look.emblem ?? 0); else drawShield(ctx, v(0, 0), q.look.shirt, q.look.emblem ?? 0); ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(12, 8); ctx.stroke(); }
      else if (q.kind === 'bread') {
        ctx.rotate(q.rot * 0.2);
        ctx.fillStyle = '#d6a35c'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f3d9a4'; ctx.beginPath(); ctx.ellipse(-3, -3, 9, 4, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#b07a3a'; ctx.lineWidth = 1.5; for (const x of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(x - 2, -6); ctx.lineTo(x + 2, -1); ctx.stroke(); }
        if (!q.rest || Math.sin(q.t * 6) > 0) { ctx.fillStyle = '#16a34a'; ctx.font = '900 11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+15', 0, -18); }
      }
      ctx.restore();
    }
  }

  private onDown = (e: PointerEvent) => {
    initAudio();
    if (this.stage === 'intro') { this.stage = 'play'; this.announce(); return; }
    if (this.stage !== 'play' && this.stage !== 'clear') return;
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
    if (f.air || f.flipK < 1 || f.dead || f.rag || f.jumpT > 0) return;
    f.jumpT = 0.14; // a quick crouch first, then the jump
    f.flipDir = (f === this.pl ? f.move * f.side : f.move) < 0 ? -1 : 1; // moving backwards = back flip
  }
  private launchFlip(f: Fighter) {
    f.air = true;
    f.vy = JUMP_V;
    f.flipK = 0;
    f.prevSpin = 0;
    // remember how he stood, in body-centre coordinates and facing +x, to blend into the tuck
    const S = f.segs;
    const c = v(f.x, G - f.h - 92);
    const J: V[] = [S[0][1], S[0][0], S[1][0], S[6][1], S[7][1], S[8][1], S[9][1], S[2][1], S[3][1], S[4][1], S[5][1]];
    f.flipJ0 = J.map((q) => v((q.x - c.x) * f.side, q.y - c.y));
    f.blendT = 0; f.blendRag = null; f.blendFrom = null;
    const old = this.framesOf(f);
    f.flipRag = makeArcherRag(J, f.side, f.a.team, v(0, 0), W(f, f.pose.bow.pos), 0, f.a.look, f.a.weapon ?? 'bow');
    this.rebase(f, old, this.ragFrames(f.flipRag));
    sfx.boing();
  }

  private stepFighter(f: Fighter, dt: number, real: number) {
    const a = f.a;
    if (f.dead || f.rag) {
      // a limp ragdoll: it slumps where it stood or tumbles off the edge
      if (f.dead) f.deadT += dt;
      if (f.rag) {
        updateArcherRag(f.rag, dt, this.plats().map((p) => ({ x0: p.x0, x1: p.x1, top: G - p.top })));
        const c = ragCentre(f.rag);
        f.x = c.x;
        f.h = G - c.y - 92;
        // the ragdoll stays shootable: hit segments follow the bones
        f.segs = f.rag.p.length ? ragSegs(f.rag) : f.segs;
        if (!f.dead && f.inj.crawl) {
          // can't stand any more: drags himself away hand over hand
          this.crawl(f, dt);
          const edge = c.x > WAR_X1 + 60 || c.x < WAR_X0 - 60;
          if (edge) this.escaped(f, tx('CRAWLED AWAY', 'MERANGKAK KABUR'));
        } else if (!f.dead) {
          f.down -= dt;
          const slabY = G - f.plat.top;
          const off = c.x < f.plat.x0 - 10 || c.x > f.plat.x1 + 10 || c.y > slabY + 40;
          if (off && c.y > slabY + 120) this.fallDeath(f);
          else if (off && f.down < -3) { if (c.y < slabY + 60) this.standUp(f); else this.fallDeath(f); }
          else if (f.down <= 0 && !off) {
            const settled = f.rag.p.every((q, i) => Math.abs(q.y - f.rag!.o[i].y) < 1.2);
            if (settled || f.down < -2.5) this.standUp(f);
          }
        }
      }
      a.time += real;
      return;
    }
    f.getUp = damp(f.getUp, 0, 5, dt);
    f.land = damp(f.land, 0, 7, dt);
    f.inj.dazed = Math.max(0, f.inj.dazed - dt);
    const limp = f !== this.pl && f.inj.legs >= 1;
    if (f.jumpT > 0) { f.jumpT -= dt; if (f.jumpT <= 0) this.launchFlip(f); }
    const drawn = a.phase === 'ready' && a.pull > 6;
    const sp0 = f.crouch && !f.air ? 0 : drawn ? WALK : f !== this.pl && this.war ? (f.kind === 'sword' ? 300 : f.kind === 'tower' ? 115 : f.kind === 'axe' ? 230 : this.ch.march ?? 130) : RUN;
    const sp = sp0 * (limp ? 0.5 : 1) * (f.inj.dazed > 0 ? 0.7 : 1) * (f.inj.flee ? 1.25 : 1);
    f.vx = damp(f.vx, (f === this.pl ? 1 : f.side) * f.move * sp, f.air ? 2.5 : 16, dt); // your keys are world left/right; a bot moves in his facing
    if (this.war) {
      // open arena: the ground plus floating stones you can land on, or drop through with crouch
      f.x = clamp(f.x + f.vx * dt, WAR_X0, WAR_X1);
      f.dropT -= dt;
      if (f === this.pl && f.crouch && !f.air && f.h > 0 && f.dropT <= 0) { f.dropT = 0.4; f.air = true; f.vy = -40; f.crouch = false; }
      const floor = this.floorUnder(f.x, f.h, f.dropT > 0);
      if (f.air) {
        f.vy -= JUMP_G * dt;
        f.h += f.vy * dt;
        if (f.h <= floor && f.vy <= 0) { f.h = floor; f.air = false; f.vy = 0; f.land = 1; sfx.hup(); }
      } else if (f.h > floor + 1) { f.air = true; f.vy = 0; } else f.h = floor;
    } else {
      f.x = clamp(f.x + f.vx * dt, f.plat.x0 + 24, f.plat.x1 - 24); // f.x is world x; a.x is the mirrored local x
      const floor = f.plat.top;
      if (f.air) {
        f.vy -= JUMP_G * dt;
        f.h += f.vy * dt;
        if (f.h <= floor && f.vy <= 0) { f.h = floor; f.air = false; f.vy = 0; f.land = 1; sfx.hup(); }
      } else f.h = floor;
    }
    if (f.flipK < 1) f.flipK = Math.min(1, f.flipK + dt * (f.air ? 1 / FLIP_T : 5));
    const k = f.flipK;
    f.spin = k < 1 ? f.side * f.flipDir * Math.PI * 2 * (k * k * (3 - 2 * k)) : 0;
    f.spinRate = dt > 0 ? (f.spin - f.prevSpin) / dt : 0;
    f.prevSpin = f.spin;
    const tuck = k < 1 ? Math.sin(Math.PI * k) : 0;
    let flipOld: [V, V][] | null = null;
    if (k >= 1 && f.flipRag) { flipOld = this.ragFrames(f.flipRag); f.flipRag = null; }
    f.duck = damp(f.duck, f.crouch && !f.air ? 1 : 0, 14, dt);
    const lv = f.vx * f.side;
    const runK = clamp(Math.abs(lv) / RUN, 0, 1);
    const S = lerp(16, 30, runK);
    f.ph += (lv * dt) / (4 * S);
    f.run = damp(f.run, f.air ? 0 : Math.min(1, runK * 3), 12, dt);
    a.x = f.side * f.x;
    a.ground = G - f.h;
    // hobbling: the body dips with every step on the bad leg; a dazed man sways; a weak man never quite straightens up
    const weak = f !== this.pl ? clamp(1 - f.hp / f.maxHp, 0, 1) : 0;
    const hobble = limp ? 14 * f.run * Math.max(0, Math.sin(f.ph * Math.PI * 2)) + 10 : 0;
    const sway = f.inj.dazed > 0 ? 10 * Math.sin(a.time * 7) : 0;
    a.duck = 64 * f.duck + 60 * f.getUp + 30 * f.land + (f.jumpT > 0 ? 40 * (1 - f.jumpT / 0.14) : 0) + 20 * tuck + hobble + 12 * weak;
    a.recoil += (limp ? 0.06 * Math.sin(f.ph * Math.PI * 2) : 0) * 0.2 + (f.inj.dazed > 0 ? 0.004 * Math.sin(a.time * 5) : 0) + sway * 0;
    a.vx = lv * 0.5;
    const gy = a.ground - STANCE.ankle;
    const foot = (i: number, home: number): [V, number] => {
      const p = (((f.ph + i * 0.5) % 1) + 1) % 1;
      const bad = limp && i === 0; // the back leg is the lame one: it drags instead of stepping
      const rel = p < 0.5 ? S - p * 4 * S : -S + (p - 0.5) * 4 * S;
      const lift = p < 0.5 || bad ? 0 : Math.sin((p - 0.5) * 2 * Math.PI) * lerp(8, 18, runK);
      const dragBack = bad ? 14 * f.run : 0;
      return [v(a.x + lerp(home, home * 0.3 + rel * (bad ? 0.5 : 1), f.run) * (1 - 0.5 * tuck) - dragBack * Math.sign(lv || 1), gy - lift * f.run - 26 * tuck), p < 0.5 ? 0 : (bad ? 0.1 : 0.35) * f.run * Math.sign(lv)];
    };
    [a.footB, a.rotB] = foot(0, STANCE.back);
    [a.footF, a.rotF] = foot(1, STANCE.front);
    a.time += real;
    a.t += dt * (a.phase === 'nock' || a.phase === 'recover' ? RELOAD : 1);
    if (a.phase === 'nock' || a.phase === 'ready') a.aim = damp(a.aim, f.aimT, 14, dt);
    if (a.phase === 'nock' && a.t >= DUR.nock) { a.phase = 'ready'; a.t = 0; a.pull = 0; a.vib = 0; f.pullVel = 0; }
    else if (a.phase === 'ready') {
      const was = a.pull;
      a.pull = damp(a.pull, f.pullT, 13, dt);
      // the limbs groan as the string comes back; a click at full draw
      const step = Math.floor((a.pull / MAX_DRAW) * 7);
      if (a.pull > was + 0.2 && step > Math.floor((was / MAX_DRAW) * 7)) sfx.creak(a.pull / MAX_DRAW);
      if (was < MAX_DRAW * 0.96 && a.pull >= MAX_DRAW * 0.96) sfx.click();
    }
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
    f.hurt = Math.max(0, f.hurt - dt);
    f.pose = poseArcher(a);
    this.segsOf(f);
    void flipOld; // the arrow stays in the limb (same stick index) as the body opens out of the tuck
    if (f.blendT > 0 && f.blendFrom && f.blendRag) {
      // getting up: the ragdoll eases into the standing pose instead of snapping to it
      f.blendT = Math.max(0, f.blendT - dt / f.blendDur);
      const k = 1 - f.blendT; const e = k * k * (3 - 2 * k);
      const S2 = f.segs;
      const J: V[] = [S2[0][1], S2[0][0], S2[1][0], S2[6][1], S2[7][1], S2[8][1], S2[9][1], S2[2][1], S2[3][1], S2[4][1], S2[5][1]];
      const r = f.blendRag;
      for (let i = 0; i < r.p.length; i++) { const q = lerpV(f.blendFrom[i], J[i], e); r.o[i] = { ...r.p[i] }; r.p[i] = q; }
      f.segs = ragSegs(r);
      if (f.blendT <= 0) { f.blendRag = null; f.blendFrom = null; }
    }
    if (f.flipRag && k < 1) {
      // somersault: blend the stance into a tight tuck, spin it about the body centre
      const r = f.flipRag;
      const sm = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
      const tk = sm(k / 0.22) * (1 - sm((k - 0.7) / 0.3));
      const c = v(f.x, G - f.h - 92);
      const cs = Math.cos(f.spin); const sn = Math.sin(f.spin);
      for (let i = 0; i < r.p.length; i++) {
        const l = lerpV(f.flipJ0[i], TUCK[i], tk);
        const lx = l.x * f.side; const ly = l.y;
        const q = v(c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs);
        r.o[i] = r.p[i].x === 0 && r.p[i].y === 0 ? q : { ...r.p[i] };
        r.p[i] = q;
      }
      f.segs = ragSegs(r);
    }
    const p = f.pose;
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
  private segsOf(f: Fighter) {
    const p = f.pose;
    const arms = f.kind !== 'bow' ? swordArms(p, f.a.swing ?? 0, f.kind === 'tower' ? 0.15 : undefined) : { front: p.fa, rear: p.ra };
    // radii match what is drawn: head disc 17.5, torso ~13 wide at the chest, thighs 11 -> shins 8.5, arms 7.4 -> 6
    const raw: [V, V, number][] = [
      [p.neck, p.headC, 17.5], [p.hip, p.neck, 13.2], [p.hip, p.legB.mid, 10.8], [p.legB.mid, p.ankB, 8.6],
      [p.hip, p.legF.mid, 10.8], [p.legF.mid, p.ankF, 8.6], [p.Sf, arms.front.mid, 7.2], [arms.front.mid, arms.front.end, 5.8],
      [p.Sr, arms.rear.mid, 7.2], [arms.rear.mid, arms.rear.end, 5.8],
    ];
    f.segs = raw.map(([s0, s1, r]) => [W(f, s0), W(f, s1), r]);
    f.shieldC = f.kind === 'sword' && f.a.look?.shield && f.shieldHp > 0 ? W(f, lerpV(arms.front.mid, arms.front.end, 0.7))
      : f.kind === 'tower' && f.shieldHp > 0 ? W(f, add(lerpV(arms.front.mid, arms.front.end, 0.6), v(6, 28))) : null;
  }

  private foeThink(b: Fighter, dt: number) {
    if (b.rag) return;
    const ai = b.ai;
    const ch = this.ch;
    ai.t -= dt;
    ai.dodge = Math.max(0, ai.dodge - dt);
    b.move = 0;
    if (b.flipK >= 1 && Math.abs(this.pl.x - b.x) > 30) this.turn(b, this.pl.x < b.x ? -1 : 1); // always turn to face you (not mid-somersault)
    if (b.inj.flee) {
      // running for it, back the way he came
      b.move = -1; b.pullT = 0; b.crouch = false; b.a.swing = 0;
      if (b.x > WAR_X1 + 60 || b.x < WAR_X0 - 60) this.escaped(b, tx('FLED', 'KABUR'));
      return;
    }
    if (b.inj.dazed > 0) {
      // staggering about, seeing stars
      if (Math.floor(b.a.time * 2.5) % 2 === 0) b.move = Math.sin(b.a.time * 3.1) > 0 ? 1 : -1;
      b.pullT = 0; b.crouch = false;
      ai.t = Math.max(ai.t, 0.4);
      return;
    }
    if (b.kind === 'sword' || b.kind === 'tower') return this.swordThink(b, dt);
    if (b.kind === 'axe') return this.axeThink(b, dt);
    if (this.war && Math.abs(b.x - ai.spot) > 10) {
      // marching in from the right; the bow stays down until he reaches his spot
      b.move = Math.sign(ai.spot - b.x) * b.side; // in his own facing
      b.crouch = false;
      b.pullT = 0;
      ai.t = Math.max(ai.t, 0.6);
      return;
    }
    if (ai.state === 'wait') {
      b.crouch = ai.dodge > 0;
      b.pullT = 0;
      if (ai.t <= 0 && b.a.phase === 'ready') {
        ai.state = 'draw';
        ai.t = 0.5 + Math.random() * 0.5;
        ai.frac = 0.75 + Math.random() * 0.25;
        ai.err = (Math.random() - 0.5) * ch.err * 2 * (1 + 1.5 * b.inj.arms);
        ai.head = Math.random() < 0.4;
      }
      return;
    }
    b.crouch = false;
    const from = W(b, b.pose.bow.pos);
    const pl = this.pl;
    const to = ai.head && pl.segs[0] ? pl.segs[0][1] : pl.segs[1] ? lerpV(pl.segs[1][0], pl.segs[1][1], 0.6) : v(pl.x, G - pl.h - 100);
    const dx = Math.max(60, Math.abs(to.x - from.x));
    const up = from.y - to.y;
    const sp = speedOf(ai.frac);
    const disc = sp ** 4 - GRAV * (GRAV * dx * dx + 2 * up * sp * sp);
    const th = disc > 0 ? Math.atan((sp * sp - Math.sqrt(disc)) / (GRAV * dx)) : 0.7;
    b.aimT = clamp(-th + ai.err, AIM_MIN, AIM_MAX);
    b.pullT = ai.frac * MAX_DRAW;
    if (ai.t <= 0 && b.a.pull > b.pullT * 0.93) {
      b.fire = true;
      ai.state = 'wait';
      ai.t = ch.rate * (0.7 + Math.random() * 0.6) * (1 + 0.6 * b.inj.arms);
      // a war party keeps creeping closer between volleys
      if (this.war && ++ai.shots % 2 === 0) ai.spot = Math.max(this.pl.x + 330, ai.spot - 90 - Math.random() * 60);
    }
  }

  /** knocked down but alive: full ragdoll for a moment, then he gets back up */
  private knock(f: Fighter, s: Shot, hit: number, u: number) {
    if (!f.rag) {
      const S = f.segs;
      const J: V[] = [S[0][1], S[0][0], S[1][0], S[6][1], S[7][1], S[8][1], S[9][1], S[2][1], S[3][1], S[4][1], S[5][1]];
      const old = this.framesOf(f);
      f.rag = makeArcherRag(J, f.side, f.a.team, v(f.vx, -f.vy), W(f, f.pose.bow.pos), Wang(f, f.pose.bow.ang), f.a.look, f.a.weapon ?? 'bow');
      this.rebase(f, old, this.ragFrames(f.rag));
      if (f.flipRag) spinRag(f.rag, v(f.x, G - f.h - 92), f.spinRate);
      f.spin = 0; f.air = false; f.flipK = 1; f.flipRag = null;
      f.blendT = 0; f.blendRag = null; f.blendFrom = null;
    }
    punchRag(f.rag, hit, u, s.vel, false);
    f.down = Math.max(f.down, hit <= 1 ? 1.5 : hit <= 5 ? 1.9 : 1.1) + Math.random() * 0.4;
    f.ai.state = 'wait'; f.ai.t = 1.2 + Math.random() * 0.8; f.pullT = 0;
  }
  /** lodged arrows are stored relative to body segments: when the skeleton changes (pose <-> somersault <-> ragdoll)
   *  keep every arrow exactly where it is in the world by re-expressing it in the new frames */
  private rebase(f: Fighter, oldF: [V, V][], newF: [V, V][]) {
    for (const st of f.sticks) {
      const [a0, b0] = oldF[st.s]; const d0 = sub(b0, a0); const L0 = len(d0) || 1;
      const tip = add(add(a0, mul(d0, st.u)), mul(v(-d0.y / L0, d0.x / L0), st.w));
      const ang = Math.atan2(d0.y, d0.x) + st.rel;
      const [a1, b1] = newF[st.s]; const d1 = sub(b1, a1); const L1 = len(d1) || 1;
      const rel = sub(tip, a1);
      st.u = (rel.x * d1.x + rel.y * d1.y) / (L1 * L1);
      st.w = (d1.x * rel.y - d1.y * rel.x) / L1;
      st.rel = ang - Math.atan2(d1.y, d1.x);
    }
  }
  private framesOf(f: Fighter): [V, V][] { return f.segs.map(([a, b]) => [a, b]); }
  /** turning round mirrors the body - every lodged arrow must mirror with it (other side of the limb, mirrored angle) */
  private turn(f: Fighter, side: 1 | -1) {
    if (f.side === side) return;
    f.side = side;
    for (const st of f.sticks) { st.w = -st.w; st.rel = -st.rel; }
    f.pose = poseArcher(f.a);
    f.a.x = f.side * f.x;
    this.segsOf(f);
  }
  private ragFrames(r: ArcherRag): [V, V][] { return RAG_R.map((_, i) => ragStickFrame(r, i)); }

  /** highest surface under (x, h) that can be stood on; a dropping fighter ignores the stones */
  private floorUnder(x: number, h: number, dropping = false): number {
    let floor = 0;
    if (dropping) return 0;
    for (const s of WAR_PLATS) if (x > s.x0 - 9 && x < s.x1 + 9 && h >= s.top - 4) floor = Math.max(floor, s.top);
    return floor;
  }
  /** a sword soldier's blade lands */
  private slash(from: Fighter, dmg: number) {
    const pl = this.pl;
    if (pl.dead || pl.rag) return;
    pl.hp = Math.max(0, pl.hp - dmg);
    pl.recoilV += 3 * from.side * -1;
    this.flashHurt = 1; this.shake = 11;
    this.pop(v(pl.x, G - pl.h - 200), `${tx('SWORD!', 'PEDANG!')} -${dmg}`, '#dc2626', 28);
    sfx.ouch();
    if (pl.hp <= 0) this.die(pl, { tip: v(pl.x, G - pl.h - 120), vel: v(-from.side * 900, -200), ang: 0, owner: from, stuck: false, t: 0 }, 1, 0.5);
  }
  private standUp(f: Fighter) {
    if (!f.rag) return;
    const c = ragCentre(f.rag);
    f.x = this.war ? clamp(c.x, WAR_X0, WAR_X1) : clamp(c.x, f.plat.x0 + 24, f.plat.x1 - 24);
    f.h = this.war ? this.floorUnder(c.x, G - c.y + 30) : f.plat.top;
    f.getUp = 1;
    f.vx = 0; f.vy = 0; f.air = false;
    f.a.phase = f.kind !== 'bow' ? 'idle' : 'nock'; f.a.t = 0; f.a.pull = 0; f.pullVel = 0;
    f.a.ground = G - f.h;
    const weak = clamp(1 - f.hp / f.maxHp, 0, 1);
    f.blendFrom = f.rag.p.map((q) => ({ ...q }));
    f.blendRag = f.rag; f.blendRag.bow = null;
    f.blendT = 1; f.blendDur = 0.45 + 0.6 * weak + (f.inj.legs ? 0.3 : 0);
    f.rag = null; // lodged arrows keep their place in each limb (same stick index) as he gets up
    f.pose = poseArcher(f.a);
    this.segsOf(f);
    sfx.hup();
  }
  /** hand over hand, away from you: lift one hand forward, drag the trunk after it */
  private crawl(f: Fighter, dt: number) {
    const r = f.rag!;
    const dir = Math.sign(f.x - this.pl.x) || 1; // away
    f.inj.crawlT += dt;
    const cycle = 0.95;
    if (f.inj.crawlT > cycle) {
      f.inj.crawlT -= cycle;
      f.inj.hand = f.inj.hand ? 0 : 1;
      const hand = f.inj.hand ? 4 : 6;
      // reach: the hand hops forward and up, the shoulder follows
      r.o[hand] = sub(r.o[hand], mul(v(dir * 150, -150), 1 / 120));
      r.o[1] = sub(r.o[1], mul(v(dir * 60, -40), 1 / 120));
      sfx.step();
    }
    // steady drag of the trunk while the hands are planted; the head stays up to look where he is going
    const pull = v(dir * 13, 0);
    for (const i of [1, 2]) r.o[i] = sub(r.o[i], mul(pull, dt));
    r.o[0] = sub(r.o[0], mul(v(dir * 30, -26), dt));
  }
  /** a wounded man who makes it off the field counts as beaten */
  private escaped(f: Fighter, text: string) {
    f.dead = true; f.deadT = 10; // gone at once
    this.kills++;
    this.score += 50;
    this.pop(v(this.pl.x + 200 * Math.sign(f.x - this.pl.x), G - this.pl.h - 230), `${text} +50`, '#6b7280', 22);
  }
  private fallDeath(f: Fighter) {
    f.dead = true; f.deadT = 0;
    this.kills++;
    this.score += 120;
    this.pop(v(f.x, G - f.h - 140), tx('FELL! +120', 'JATUH! +120'), '#d97706', 26);
    sfx.miss();
  }

  /** run at you, jump after you onto the stones, wind up and cut */
  private swordThink(b: Fighter, dt: number) {
    const pl = this.pl;
    const atk = b.atk;
    const dx = pl.x - b.x;
    const near = Math.abs(dx) < 78 && Math.abs(pl.h - b.h) < 70;
    b.pullT = 0; b.crouch = false;
    atk.t -= dt;
    if (atk.phase === 'run') {
      b.move = pl.dead ? 0 : 1; // forward, in his own facing
      if (Math.abs(dx) < 50) b.move = 0;
      if (!b.air && pl.h > b.h + 60 && Math.abs(dx) < 170 && b.flipK >= 1 && b.jumpT <= 0) this.doFlip(b);
      if (near && !pl.dead) { atk.phase = 'wind'; atk.t = b.kind === 'tower' ? 0.55 : 0.38; }
    } else if (atk.phase === 'wind') {
      b.move = 0;
      if (atk.t <= 0) { atk.phase = 'strike'; atk.t = 0.16; if (Math.abs(dx) < 95 && Math.abs(pl.h - b.h) < 80) this.slash(b, b.kind === 'tower' ? 10 : 14); else sfx.miss(); }
    } else if (atk.phase === 'strike') {
      if (atk.t <= 0) { atk.phase = 'cool'; atk.t = 0.7; }
    } else if (atk.t <= 0) atk.phase = 'run';
    const want = atk.phase === 'wind' ? 1 : atk.phase === 'strike' ? 2 : atk.phase === 'cool' ? 1.6 : 0;
    b.a.swing = damp(b.a.swing ?? 0, want, atk.phase === 'strike' ? 40 : 9, dt);
  }

  /** closes to throwing range, winds up, hurls a spinning axe at you, then reaches for the next one */
  private axeThink(b: Fighter, dt: number) {
    const pl = this.pl;
    const atk = b.atk;
    const dx = pl.x - b.x;
    const d = Math.abs(dx);
    b.pullT = 0; b.crouch = false;
    atk.t -= dt;
    if (atk.phase === 'run') {
      b.move = pl.dead ? 0 : d > 420 ? 1 : d < 200 ? -1 : 0; // keep his distance
      if (!pl.dead && d <= 460 && d >= 160 && atk.t <= 0) { atk.phase = 'wind'; atk.t = 0.55; b.a.axeThrown = false; }
    } else if (atk.phase === 'wind') {
      b.move = 0;
      if (atk.t <= 0) {
        atk.phase = 'strike'; atk.t = 0.2;
        this.throwAxe(b);
      }
    } else if (atk.phase === 'strike') {
      if (atk.t <= 0) { atk.phase = 'cool'; atk.t = 1.6 + Math.random() * 0.8; }
    } else if (atk.t <= 0) { atk.phase = 'run'; atk.t = 0.3; b.a.axeThrown = false; }
    const want = atk.phase === 'wind' ? 1 : atk.phase === 'strike' ? 2 : atk.phase === 'cool' ? 1.4 : 0;
    b.a.swing = damp(b.a.swing ?? 0, want, atk.phase === 'strike' ? 40 : 9, dt);
  }
  private throwAxe(b: Fighter) {
    const pl = this.pl;
    const hand = b.segs[9] ? b.segs[9][1] : v(b.x, G - b.h - 120);
    const to = pl.segs[1] ? lerpV(pl.segs[1][0], pl.segs[1][1], 0.6) : v(pl.x, G - pl.h - 110);
    const T = clamp(Math.abs(to.x - hand.x) / 560, 0.45, 0.95);
    const vel = v((to.x - hand.x) / T + (Math.random() - 0.5) * 60, (to.y - hand.y) / T - 0.5 * GRAV * T);
    this.axes.push({ p: { ...hand }, vel, rot: 0, t: 0 });
    b.a.axeThrown = true;
    this.pop(add(hand, v(0, -40)), tx('AXE!', 'KAPAK!'), '#b91c1c', 20);
    sfx.snap();
  }
  private stepAxes(dt: number) {
    const pl = this.pl;
    for (const ax of [...this.axes]) {
      ax.t += dt;
      ax.vel.y += GRAV * dt;
      ax.p = add(ax.p, mul(ax.vel, dt));
      ax.rot += 15 * dt * Math.sign(ax.vel.x || 1);
      // an arrow in flight knocks it out of the air
      let shot = false;
      for (const s of this.arrows) {
        if (s.stuck || s.owner !== pl) continue;
        if (dist(s.tip, ax.p) < 18) {
          shot = true;
          this.arrows.splice(this.arrows.indexOf(s), 1);
          this.props.push({ kind: 'arrow', p: { ...s.tip }, vel: v(s.vel.x * 0.1, -120), rot: s.ang, vr: 10, t: 0, face: 1, rest: false });
          break;
        }
      }
      if (shot) {
        this.axes.splice(this.axes.indexOf(ax), 1);
        this.props.push({ kind: 'axe', p: { ...ax.p }, vel: v(ax.vel.x * 0.2, -Math.abs(ax.vel.y) * 0.3 - 140), rot: ax.rot, vr: 12, t: 0, face: 1, rest: false });
        this.score += 25;
        this.pop(add(ax.p, v(0, -40)), tx('AXE PARRIED! +25', 'KAPAK DITEPIS! +25'), '#16a34a', 22);
        this.shake = 5; sfx.ting();
        if (this.cine) { this.slowT = 0.25; this.focus = { ...ax.p }; }
        continue;
      }
      // hits you
      if (!pl.dead && !pl.rag) {
        let hit = -1;
        pl.segs.forEach(([p0, p1, r], j) => { if (hit < 0 && (j === 0 ? dist(ax.p, p1) < r + 10 : segDist(ax.p, p0, p1).d < r + 10)) hit = j; });
        if (hit >= 0) {
          this.axes.splice(this.axes.indexOf(ax), 1);
          const dmg = hit === 0 ? 24 : 16;
          pl.hp = Math.max(0, pl.hp - dmg);
          pl.recoilV += 3 * Math.sign(ax.vel.x);
          this.flashHurt = 1; this.shake = 12;
          this.pop(add(ax.p, v(0, -46)), `${tx('AXE!', 'KAPAK!')} -${dmg}`, '#dc2626', 30);
          sfx.smack(); sfx.ouch();
          this.props.push({ kind: 'axe', p: { ...ax.p }, vel: v(-ax.vel.x * 0.15, -160), rot: ax.rot, vr: 9, t: 0, face: 1, rest: false });
          if (pl.hp <= 0) this.die(pl, { tip: { ...ax.p }, vel: ax.vel, ang: Math.atan2(ax.vel.y, ax.vel.x), owner: pl, stuck: false, t: 0 }, hit, 0.5);
          continue;
        }
      }
      // the ground or a stone
      const floorY = G - this.floorUnder(ax.p.x, G - ax.p.y + 20);
      if (ax.p.y >= floorY - 6 && ax.vel.y > 0) {
        this.axes.splice(this.axes.indexOf(ax), 1);
        this.props.push({ kind: 'axe', p: v(ax.p.x, floorY - 6), vel: v(0, 0), rot: -0.9, vr: 0, t: 0, face: 1, rest: true });
        sfx.tok();
        continue;
      }
      if (ax.p.x < -1600 || ax.p.x > 3200 || ax.p.y > G + 400) this.axes.splice(this.axes.indexOf(ax), 1);
    }
  }
  private drawAxes() {
    const ctx = this.ctx;
    for (const ax of this.axes) {
      ctx.save();
      ctx.translate(ax.p.x, ax.p.y);
      ctx.rotate(ax.rot);
      // spinning blur ring + the axe itself
      ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 26, ax.rot, ax.rot + 2.2); ctx.stroke();
      drawAxe(ctx, v(-14, 0), 0);
      ctx.restore();
    }
  }

  private toScreen(p: V): V { return v(this.view.ox + p.x * this.view.scale, this.view.oy + p.y * this.view.scale); }
  /** where the string is held right now (css px): the drag line and the pull are measured from here */
  private nockScreen(): V {
    const pl = this.pl;
    const nock = pl.pose.arrow ? W(pl, pl.pose.arrow.nock) : W(pl, pl.pose.ra.end);
    return this.toScreen(nock);
  }

  private pop(p: V, text: string, color: string, size = 26) {
    this.pops.push({ p: { ...p }, text, color, size, life: 0 });
  }

  private spawn() {
    const boss = this.chapter === this.list.length - 1 && this.spawned === this.ch.total - 1;
    const nm = NAMES[(this.chapter + this.spawned) % NAMES.length];
    const name = boss ? (this.war ? tx('WAR GENERAL', 'JENDERAL PERANG') : tx('SKY CAPTAIN', 'KAPTEN LANGIT')) : tx(nm[0], nm[1]);
    if (this.war) {
      const seed = this.chapter * 17 + this.spawned * 7 + 101;
      const r = Math.random();
      const ch = this.ch;
      if (!boss && r < (ch.sword ?? 0)) {
        // sword soldier: comes running
        const f = makeFighter(-1, FIELD, 1150 + Math.random() * 150, 2, name);
        f.kind = 'sword'; f.a.weapon = 'sword'; f.a.phase = 'idle'; f.a.swing = 0;
        f.a.look = armyLook(seed, true);
        this.foes.push(f); this.spawned++;
        this.pop(v(f.x - 40, G - 200), tx('SWORD!', 'PEDANG!'), '#b91c1c', 20);
        sfx.hup();
        return;
      }
      if (!boss && r < (ch.sword ?? 0) + (ch.tower ?? 0)) {
        // pavise bearer: a walking wall with a mace
        const f = makeFighter(-1, FIELD, 1150 + Math.random() * 150, 4, tx('PAVISE BEARER', 'PEMBAWA PAVISE'));
        f.kind = 'tower'; f.a.weapon = 'mace'; f.a.phase = 'idle'; f.a.swing = 0; f.shieldHp = 8;
        f.a.look = { ...armyLook(seed, true), tower: true, shield: false, hat: 'greathelm' };
        this.foes.push(f); this.spawned++;
        this.pop(v(f.x - 40, G - 200), 'PAVISE!', '#1f2937', 20);
        sfx.hup();
        return;
      }
      if (!boss && r < (ch.sword ?? 0) + (ch.tower ?? 0) + (ch.axe ?? 0)) {
        // axe thrower: keeps his distance and hurls axes
        const f = makeFighter(-1, FIELD, 1150 + Math.random() * 150, 2, tx('AXE THROWER', 'PELEMPAR KAPAK'));
        f.kind = 'axe'; f.a.weapon = 'axe'; f.a.phase = 'idle'; f.a.swing = 0;
        f.a.look = { ...armyLook(seed, true), shield: false, hat: 'kettle' };
        this.foes.push(f); this.spawned++;
        this.pop(v(f.x - 40, G - 200), tx('AXE!', 'KAPAK!'), '#b45309', 20);
        sfx.hup();
        return;
      }
      if (!boss && r < (ch.sword ?? 0) + (ch.tower ?? 0) + (ch.axe ?? 0) + (ch.fly ?? 0)) {
        // archer appearing on a floating stone
        const used = new Set(this.foes.filter((q) => !q.dead && q.h > 0).map((q) => this.floorUnder(q.x, q.h)));
        const free = WAR_PLATS.filter((p) => !used.has(p.top) && p.x0 > this.pl.x + 120);
        if (free.length) {
          const p = free[Math.floor(Math.random() * free.length)];
          const x = lerp(p.x0 + 30, p.x1 - 30, Math.random());
          const f = makeFighter(-1, FIELD, x, ch.hp, name);
          f.h = p.top; f.ai.spot = x; f.a.look = armyLook(seed);
          this.foes.push(f); this.spawned++;
          this.pop(v(x, G - p.top - 200), name, '#7c3aed', 18);
          sfx.warp();
          return;
        }
      }
      const f = makeFighter(-1, FIELD, 1080 + Math.random() * 160, boss ? 6 : ch.hp, name);
      f.ai.spot = this.pl.x + 520 + Math.random() * 520 + (boss ? -120 : 0);
      f.a.look = boss ? BOSS_LOOK : armyLook(seed);
      this.foes.push(f);
      this.spawned++;
      sfx.step();
      return;
    }
    const used = new Set(this.foes.filter((f) => !f.dead).map((f) => f.plat));
    const free = this.plats().slice(1).filter((p) => !used.has(p));
    if (!free.length) return;
    const plat = free[Math.floor(Math.random() * free.length)];
    const f = makeFighter(-1, plat, (plat.x0 + plat.x1) / 2, boss ? 6 : this.ch.hp, name);
    f.a.look = boss ? BOSS_LOOK : armyLook(this.chapter * 17 + this.spawned * 7 + 3);
    f.ai.t = 1.4 + Math.random() * 1.2;
    this.foes.push(f);
    this.spawned++;
    this.pop(v(f.x, G - f.h - 190), name, '#7c3aed', 18);
    sfx.warp();
  }

  /** a deflected arrow leaves as a tumbling prop */
  private deflect(s: Shot, at: V, back = true) {
    this.arrows.splice(this.arrows.indexOf(s), 1);
    const sp = len(s.vel);
    this.props.push({
      kind: 'arrow', p: { ...at }, vel: v(back ? -Math.sign(s.vel.x) * sp * 0.12 : s.vel.x * 0.2, -Math.abs(sp) * 0.14 - 80),
      rot: s.ang, vr: (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 6), t: 0, face: 1, rest: false,
    });
  }
  private hitShield(foe: Fighter, s: Shot) {
    const c = foe.shieldC!;
    foe.shieldHp--;
    foe.recoilV += 1.4 * Math.sign(s.vel.x) * foe.side;
    this.shake = 4;
    if (foe.shieldHp <= 0) {
      // the shield splinters and falls
      foe.shieldSticks = [];
      const broken = foe.a.look;
      if (foe.a.look) foe.a.look = { ...foe.a.look, shield: false, tower: false };
      this.props.push({ kind: 'shield', p: { ...c }, vel: v(Math.sign(s.vel.x) * 160, -260), rot: 0, vr: 6, t: 0, look: broken, face: foe.side, rest: false });
      this.pop(add(c, v(0, -40)), tx('SHIELD BROKEN!', 'TAMENG PECAH!'), '#b45309', 24);
      this.deflect(s, c);
      sfx.shatter();
      this.knock(foe, s, 6, 0.5);
      return;
    }
    // the arrow stays in the shield
    const rel = sub(add(s.tip, fromAngle(s.ang, 8)), c);
    foe.shieldSticks.push({ d: v(rel.x * foe.side, rel.y), rel: foe.side > 0 ? s.ang : Math.PI - s.ang });
    this.arrows.splice(this.arrows.indexOf(s), 1);
    this.pop(add(c, v(0, -36)), foe.kind === 'tower' ? `PAVISE! ${foe.shieldHp}` : [tx('SHIELD!', 'TAMENG!'), tx('BLOCKED!', 'DITAHAN!')][foe.shieldHp % 2], '#78716c', 20);
    sfx.ting();
  }
  private hitFighter(foe: Fighter, s: Shot, hit: number) {
    const t = s.tip;
    const lk = foe.a.look;
    const sp = len(s.vel);
    if (foe !== this.pl && lk) {
      if (hit === 0 && HELMETS.has(lk.hat) && lk.hat !== 'crown') {
        // helmet: a hard shot punches through, anything else rings it off his head
        const pierce = sp > 1900 && Math.random() < 0.55;
        const helmet = lk.hat;
        foe.a.look = { ...lk, hat: 'none' };
        const head = add(foe.segs[0][1], v(0, -6));
        this.props.push({ kind: 'helmet', p: head, vel: v(Math.sign(s.vel.x) * (120 + sp * 0.08), -(220 + sp * 0.06)), rot: 0, vr: Math.sign(s.vel.x) * 7, t: 0, look: { ...lk, hat: helmet }, face: foe.side, rest: false });
        if (!pierce) {
          foe.hp = Math.max(0, foe.hp - 0.5);
          foe.hurt = 0.4;
          this.pop(add(t, v(0, -52)), tx('HELMET OFF! -0.5', 'HELM LEPAS! -0.5'), '#78716c', 24);
          this.shake = 6; sfx.ting();
          this.deflect(s, t);
          if (foe.hp <= 0) this.kill(foe, s, hit, 0.5, 100);
          else this.knock(foe, s, 0, 0.9);
          return;
        }
        this.pop(add(t, v(0, -70)), tx('PIERCED HELM!', 'TEMBUS HELM!'), '#dc2626', 24);
      } else if (hit === 1 && lk.armor === 'plate') {
        // breastplate: slow arrows skip off, fast ones go through
        if (sp < 1550) {
          foe.hp = Math.max(0, foe.hp - 0.25);
          foe.hurt = 0.3;
          foe.recoilV += 1.2 * Math.sign(s.vel.x) * foe.side;
          this.pop(add(t, v(0, -46)), tx('RICOCHET! -0.25', 'MENTAL! -0.25'), '#78716c', 22);
          this.shake = 4; sfx.ting();
          this.deflect(s, t);
          if (foe.hp <= 0) this.kill(foe, s, hit, 0.5, 100);
          return;
        }
        this.pop(add(t, v(0, -70)), tx('PIERCED ARMOR!', 'TEMBUS ZIRAH!'), '#dc2626', 22);
      }
    }
    const [p0, p1] = foe.segs[hit];
    const d = sub(p1, p0);
    const L = len(d) || 1;
    const deep = add(t, fromAngle(s.ang, 9));
    const rel = sub(deep, p0);
    // keep the point inside the limb: never past its ends, never outside its radius
    const r = foe.segs[hit][2];
    const u = clamp((rel.x * d.x + rel.y * d.y) / (L * L), 0.02, 0.98);
    foe.sticks.push({ s: hit, u, w: clamp((d.x * rel.y - d.y * rel.x) / L, -r * 0.8, r * 0.8), rel: s.ang - Math.atan2(d.y, d.x) });
    if (foe.sticks.length > 12) foe.sticks.shift();
    foe.recoilV += (hit < 2 ? 2.2 : 1.1) * Math.sign(s.vel.x) * foe.side;
    foe.hurt = 0.4;
    this.arrows.splice(this.arrows.indexOf(s), 1);
    const vital = hit < 2;
    if (foe === this.pl) {
      const dmg = hit === 0 ? 30 : hit === 1 ? 20 : 8;
      foe.hp = Math.max(0, foe.hp - dmg);
      this.flashHurt = 1;
      this.shake = 10;
      this.pop(add(t, v(0, -46)), `-${dmg}`, '#dc2626', 30);
      sfx.smack(); sfx.ouch();
      if (foe.hp <= 0) this.die(foe, s, hit, u);
      return;
    }
    const dmg = hit === 0 ? 2 : hit === 1 ? 1 : 0.5;
    foe.hp = Math.max(0, foe.hp - dmg);
    const PART = [
      tx('HEAD!', 'KEPALA!'), tx('CHEST!', 'DADA!'),
      tx('THIGH!', 'PAHA!'), tx('LEG!', 'KAKI!'), tx('THIGH!', 'PAHA!'), tx('LEG!', 'KAKI!'),
      tx('ARM!', 'LENGAN!'), tx('HAND!', 'TANGAN!'), tx('ARM!', 'LENGAN!'), tx('HAND!', 'TANGAN!'),
    ];
    this.pop(add(t, v(0, -46)), `${PART[hit]} -${dmg}`, vital ? '#16a34a' : '#f97316', vital ? 28 : 20);
    this.shake = vital ? 7 : 4;
    if (vital) sfx.smack(); else sfx.thunk();
    if (foe.hp <= 0) {
      this.kill(foe, s, hit, u, hit === 0 ? 150 : 100);
    } else {
      this.injure(foe, hit, s);
      this.knock(foe, s, hit, u);
      if (this.cine && hit <= 1) { this.slowT = 0.25; this.focus = { ...t }; }
    }
  }
  /** what a hit leaves behind once he is back on his feet */
  private injure(foe: Fighter, hit: number, s: Shot) {
    const inj = foe.inj;
    const at = add(s.tip, v(0, -80));
    if (hit >= 2 && hit <= 5) {
      inj.legs++;
      if (inj.legs >= 2 && !inj.crawl) { inj.crawl = true; inj.crawlT = 0; this.pop(at, tx('LEGS CRIPPLED! CRAWLING', 'KAKINYA HABIS! MERANGKAK'), '#7c3aed', 22); }
      else if (inj.legs === 1) this.pop(at, tx('LIMPING!', 'PINCANG!'), '#7c3aed', 22);
    } else if (hit >= 6) {
      inj.arms++;
      if (foe.kind === 'sword' && !inj.flee) {
        // the sword arm: he drops it and runs
        inj.flee = true;
        const hand = foe.segs[9][1];
        this.props.push({ kind: 'sword', p: { ...hand }, vel: v(-foe.side * 80, -200), rot: 0, vr: 7, t: 0, face: foe.side, rest: false });
        foe.a.weapon = 'none';
        foe.a.swing = 0;
        this.pop(at, tx('DROPPED SWORD! FLEEING!', 'PEDANGNYA JATUH! KABUR!'), '#7c3aed', 22);
      } else if (foe.kind === 'bow') this.pop(at, inj.arms === 1 ? tx('SHAKY ARM', 'TANGAN GEMETAR') : tx('WEAK ARM', 'TANGAN LEMAS'), '#7c3aed', 20);
    } else if (hit === 0) {
      inj.dazed = 2.6;
      this.pop(at, tx('DAZED…', 'PUSING…'), '#7c3aed', 22);
    }
  }
  /** a foe goes down for good: score, combo, the odd loaf of bread, and a slow look at the last one standing */
  private kill(foe: Fighter, s: Shot, hit: number, u: number, base: number) {
    this.die(foe, s, hit, u);
    this.kills++;
    this.combo.n = this.combo.t > 0 ? this.combo.n + 1 : 1;
    this.combo.t = 2.6;
    const pts = base * this.combo.n;
    this.score += pts;
    const at = v(foe.x, G - foe.h - 200);
    this.pop(at, `+${pts}`, '#d97706', 26);
    if (hit === 0) this.pop(add(at, v(0, -30)), 'HEADSHOT!', '#dc2626', 22);
    if (this.combo.n >= 2) this.pop(add(at, v(0, -58)), `COMBO x${this.combo.n}!`, '#7c3aed', 26 + this.combo.n * 2);
    if (this.war && Math.random() < 0.2) this.props.push({ kind: 'bread', p: v(foe.x, G - foe.h - 60), vel: v((Math.random() - 0.5) * 120, -220), rot: 0, vr: 3, t: 0, face: 1, rest: false });
    const last = this.spawned >= this.ch.total && this.foes.every((q) => q.dead);
    if (this.cine) { this.slowT = last ? 1.1 : 0.45; this.focus = foe.rag ? { ...ragCentre(foe.rag) } : v(foe.x, G - foe.h - 110); }
  }
  private die(f: Fighter, s: Shot, hit: number, u: number) {
    f.dead = true;
    f.deadT = 0;
    if (!f.rag) {
      const S = f.segs;
      const J: V[] = [S[0][1], S[0][0], S[1][0], S[6][1], S[7][1], S[8][1], S[9][1], S[2][1], S[3][1], S[4][1], S[5][1]];
      const old = this.framesOf(f);
      f.rag = makeArcherRag(J, f.side, f.a.team, v(f.vx, -f.vy), W(f, f.pose.bow.pos), Wang(f, f.pose.bow.ang), f.a.look, f.a.weapon ?? 'bow');
      this.rebase(f, old, this.ragFrames(f.rag));
      if (f.flipRag) spinRag(f.rag, v(f.x, G - f.h - 92), f.spinRate);
    }
    f.flipRag = null;
    f.blendT = 0; f.blendRag = null; f.blendFrom = null;
    punchRag(f.rag, hit, u, s.vel, true);
    f.rag.t = 0;
    f.spin = 0;
    sfx.ouch();
  }

  private stepArrows(dt: number) {
    for (const s of [...this.arrows]) {
      s.t += dt;
      if (s.stuck) continue;
      s.vel.y += GRAV * dt;
      s.ang = Math.atan2(s.vel.y, s.vel.x);
      const n = Math.max(1, Math.ceil((len(s.vel) * dt) / 4));
      const targets = s.owner === this.pl ? this.foes.filter((f) => !f.dead) : this.pl.dead ? [] : [this.pl];
      let gone = false;
      for (let i = 0; i < n && !gone; i++) {
        const prev = s.tip;
        s.tip = add(s.tip, mul(s.vel, dt / n));
        const t = s.tip;
        if (this.stage === 'play' || this.stage === 'clear') {
          for (const foe of targets) {
            // the shield comes first: it is held out in front
            if (foe.shieldC && !foe.rag && (foe.kind === 'tower' ? Math.abs(t.x - foe.shieldC.x) < 24 && t.y > foe.shieldC.y - 60 && t.y < foe.shieldC.y + 58 : dist(t, foe.shieldC) < 23)) { this.hitShield(foe, s); gone = true; break; }
            let hit = -1;
            // a helmet sits higher and wider than the bare head
            const lk = foe.a.look;
            if (lk && HELMETS.has(lk.hat) && foe.segs[0] && dist(t, add(foe.segs[0][1], v(0, -7))) < 22) hit = 0;
            foe.segs.forEach(([p0, p1, r], j) => {
              if (hit < 0 && (j === 0 ? dist(t, p1) < r : segDist(t, p0, p1).d < r)) hit = j;
            });
            if (hit >= 0) { this.hitFighter(foe, s, hit); gone = true; break; }
          }
          if (gone) break;
        }
        for (const p of this.plats()) {
          const top = G - p.top;
          // a stone only catches arrows that come down onto it: shooting up past one from below is fine
          const fromAbove = p.top === 0 || prev.y <= top + 1;
          if (fromAbove && t.x > p.x0 && t.x < p.x1 && t.y > top && t.y < top + (p.top === 0 ? 46 : 16)) {
            s.tip = add(t, fromAngle(s.ang, 8)); s.stuck = true; s.t = 0; sfx.tok(); gone = true; break;
          }
        }
        if (!gone && (t.x < -1500 || t.x > (this.war ? 3000 : 1500) || t.y < -2500 || t.y > G + 500)) { this.arrows.splice(this.arrows.indexOf(s), 1); gone = true; }
      }
    }
    this.arrows = this.arrows.filter((s) => !s.stuck || s.t < 9);
  }

  private update(real: number) {
    if (!this.cine) this.slowT = 0;
    this.slowT = Math.max(0, this.slowT - real);
    const zoom = this.slowT > 0;
    this.ts = damp(this.ts, zoom ? 0.18 : 1, 30, real);
    const homeX = this.war ? clamp(this.pl.x + 380, -300, 950) : 0;
    const homeY = this.war ? G - 150 : G - 180;
    this.cam.x = damp(this.cam.x, zoom ? lerp(homeX, this.focus.x, 0.6) : homeX, 7, real);
    this.cam.y = damp(this.cam.y, zoom ? lerp(homeY, this.focus.y, 0.5) : homeY, 7, real);
    this.cam.z = damp(this.cam.z, zoom ? 1.4 : 1, 7, real);
    this.shake = damp(this.shake, 0, 9, real);
    this.flashHurt = Math.max(0, this.flashHurt - real * 2.5);
    const dt = real * this.ts;
    this.time += dt;
    const playing = this.stage === 'play';
    for (const c of this.clouds) { c.x += c.sp * dt; if (c.x > 1100) c.x = -1100; }
    const pl = this.pl;
    pl.move = playing || this.stage === 'clear' ? clamp((this.keys.r ? 1 : 0) - (this.keys.l ? 1 : 0) + this.btn, -1, 1) : 0;
    pl.crouch = playing && (this.keys.d || this.btnDuck);
    pl.pullT = 0;
    if (this.drag && (playing || this.stage === 'clear')) {
      // the pull is measured from the nock itself, so the line always lines up with the arrow
      const r = this.canvas.getBoundingClientRect();
      const A = this.nockScreen();
      const dx = A.x + r.left - this.drag.cx;
      const dy = A.y + r.top - this.drag.cy;
      const l = Math.hypot(dx, dy);
      const full = clamp(Math.min(this.vw, this.vh) * 0.3, 110, 220);
      // pull back to shoot forward; pull the other way and he turns round and shoots that way
      const canTurn = pl.flipK >= 1 && !pl.rag && !pl.dead;
      if (l > 12 && canTurn) { if (dx < -14) this.turn(pl, -1); else if (dx > 14) this.turn(pl, 1); }
      const fx = dx * pl.side;
      if (l > 12) pl.aimT = fx <= 4 ? (dy < 0 ? AIM_MIN : AIM_MAX) : clamp(Math.atan2(dy, fx), AIM_MIN, AIM_MAX);
      pl.pullT = (1 - Math.pow(1 - clamp((l - 10) / full, 0, 1), 1.35)) * MAX_DRAW;
    }
    if (!this.drag && pl.move !== 0 && pl.flipK >= 1 && !pl.rag && !pl.dead && !(pl.a.phase === 'ready' && pl.a.pull > 6)) this.turn(pl, pl.move > 0 ? 1 : -1);
    if (playing) {
      // keep the platforms stocked until the chapter quota is spent
      const alive = this.foes.filter((f) => !f.dead).length;
      const cap = this.war ? this.ch.alive ?? 2 : this.ch.plats.length;
      if (this.spawned < this.ch.total && alive < cap) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) { this.spawn(); this.spawnT = 1.6 + Math.random() * 1.2; }
      }
      for (const f of this.foes) if (!f.dead) this.foeThink(f, dt);
      const aliveNow = this.foes.filter((f) => !f.dead).length;
      if (this.spawned >= this.ch.total && aliveNow === 0) {
        this.stage = 'clear';
        this.clearT = 0;
        this.score += 200;
        this.pop(v(pl.x, G - pl.h - 200), tx(this.war ? 'WAVE CLEARED! +200' : 'CHAPTER CLEARED! +200', this.war ? 'GELOMBANG SELESAI! +200' : 'BAB SELESAI! +200'), '#16a34a', 30);
        sfx.crunch();
      }
    } else if (this.stage === 'clear') {
      this.clearT += dt;
      if (this.clearT > 2.4) {
        if (this.chapter >= this.list.length - 1) { this.stage = 'won'; this.saveBest(); }
        else {
          const hp = Math.min(100, pl.hp + 30);
          const kills = this.kills; const score = this.score;
          this.reset(this.chapter + 1);
          this.kills = kills; this.score = score;
          this.pl.hp = hp;
          this.stage = 'play';
          this.announce();
        }
      }
    } else {
      for (const f of this.foes) { f.move = 0; f.pullT = 0; f.crouch = false; }
    }
    this.stepFighter(pl, dt, real);
    for (const f of this.foes) this.stepFighter(f, dt, real);
    this.foes = this.foes.filter((f) => !f.dead || (f.deadT < 6 && (!f.rag || ragCentre(f.rag).y < G + 700)));
    this.stepArrows(dt);
    this.stepProps(dt);
    this.stepAxes(dt);
    this.combo.t = Math.max(0, this.combo.t - dt);
    if (pl.dead && this.stage !== 'over' && pl.deadT > 1.6) { this.stage = 'over'; this.drag = null; this.saveBest(); }
    for (const p of this.pops) { p.life += dt; p.p.y -= 46 * dt; }
    this.pops = this.pops.filter((p) => p.life < 1.3);
    const ui: StoryUi = {
      stage: this.stage, chapter: this.chapter + 1, chapters: this.list.length, hp: Math.round(pl.hp), maxHp: pl.maxHp, kills: this.kills,
      left: Math.max(0, this.ch.total - this.kills + this.killsBefore()), score: this.score, best: this.best, title: tx(this.ch.title, this.ch.titleId), mode: this.mode,
    };
    const key = JSON.stringify(ui);
    if (key !== this.uiKey) { this.uiKey = key; this.onUi(ui); }
  }
  private killsBefore() { return this.list.slice(0, this.chapter).reduce((n, c) => n + c.total, 0); }
  private saveBest() {
    if (this.score > this.best) {
      this.best = this.score;
      try { localStorage.setItem(this.war ? STORE_WAR : STORE, String(this.best)); } catch { /* fine */ }
    }
  }

  // ---- rendering --------------------------------------------------------------
  private frame = (now: number) => {
    const real = clamp((now - this.last) / 1000, 0, 1 / 30);
    this.last = now;
    this.update(real);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawPlat(p: Plat) {
    const ctx = this.ctx;
    const y = G - p.top;
    const w = p.x1 - p.x0;
    // floating stone slab with a soft underside, in the game's light palette
    ctx.fillStyle = 'rgba(15,23,42,0.06)';
    ctx.beginPath(); ctx.ellipse((p.x0 + p.x1) / 2, y + 62, w * 0.5, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b5bdc8';
    ctx.beginPath(); ctx.moveTo(p.x0, y + 14); ctx.lineTo(p.x1, y + 14); ctx.lineTo(p.x1 - w * 0.18, y + 48); ctx.lineTo(p.x0 + w * 0.22, y + 46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d7dce3';
    ctx.beginPath(); ctx.roundRect(p.x0, y, w, 16, 4); ctx.fill();
    ctx.fillStyle = '#f1f3f6';
    ctx.fillRect(p.x0 + 4, y + 2, w - 8, 4);
    ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(p.x0, y, w, 16, 4); ctx.stroke();
    for (let x = p.x0 + 28; x < p.x1 - 10; x += 34) stroke(ctx, [v(x, y + 16), v(x - 6, y + 30)], 'rgba(71,85,105,0.25)', 2);
    if (p === HOME) stroke(ctx, [v(p.x0 + 6, y - 2), v(p.x1 - 6, y - 2)], '#ef4444', 3, 'butt');
  }

  /** the open field: a quiet ground line, distant hills and a few trees, in the game's light palette */
  private drawField() {
    const ctx = this.ctx;
    const t = this.time;
    // hills
    ctx.fillStyle = '#eef1f5';
    for (const [cx, r] of [[-900, 420], [-200, 520], [600, 460], [1400, 560], [2200, 480]] as [number, number][]) {
      ctx.beginPath(); ctx.ellipse(cx, G + 40, r, r * 0.28, 0, Math.PI, 0); ctx.fill();
    }
    // trees
    for (const [x, h] of [[-1050, 150], [-860, 120], [1500, 140], [1750, 170], [2050, 130], [2350, 160]] as [number, number][]) {
      ctx.fillStyle = '#c9cfd8'; ctx.fillRect(x - 4, G - h * 0.45, 8, h * 0.45);
      ctx.fillStyle = '#dfe4ea';
      ctx.beginPath(); ctx.moveTo(x, G - h); ctx.lineTo(x + h * 0.32, G - h * 0.38); ctx.lineTo(x - h * 0.32, G - h * 0.38); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, G - h * 0.8); ctx.lineTo(x + h * 0.4, G - h * 0.15); ctx.lineTo(x - h * 0.4, G - h * 0.15); ctx.closePath(); ctx.fill();
    }
    // field band + ground line
    ctx.fillStyle = '#f0f4ea'; ctx.fillRect(-1600, G, 4600, 60);
    stroke(ctx, [v(-1600, G), v(3000, G)], '#cfd6c6', 2.5, 'butt');
    for (let x = -1600; x < 3000; x += 83.5) stroke(ctx, [v(x, G + 5), v(x, G + 11)], '#dde3d4', 2, 'butt');
    for (let x = -1500; x < 3000; x += 57) {
      const sway = Math.sin(t * 1.4 + x * 0.05) * 2;
      stroke(ctx, [v(x, G), v(x - 3 + sway, G - 9)], '#b7c4a8', 2); stroke(ctx, [v(x + 4, G), v(x + 7 + sway, G - 7)], '#b7c4a8', 2);
    }
    // your line: a red marker like the missions' foul line
    stroke(ctx, [v(HOME_WAR.x1 + 20, G + 1), v(HOME_WAR.x1 + 20, G + 16)], '#ef4444', 3, 'butt');
    ctx.fillStyle = '#e9ecf0'; ctx.fillRect(HOME_WAR.x0, G + 1, HOME_WAR.x1 - HOME_WAR.x0 + 20, 5);
    // war banners on the far right
    for (const x of [1180, 1320]) {
      stroke(ctx, [v(x, G), v(x, G - 190)], '#9aa3ad', 3);
      ctx.fillStyle = '#7c3aed'; ctx.beginPath(); ctx.moveTo(x, G - 190); ctx.lineTo(x + 58 + 4 * Math.sin(t * 3), G - 172); ctx.lineTo(x, G - 150); ctx.closePath(); ctx.fill();
    }
  }

  private drawFighter(f: Fighter) {
    const ctx = this.ctx;
    if (this.war) {
      const cx = f.rag ? ragCentre(f.rag).x : f.x;
      const fl = this.floorUnder(cx, f.rag ? G - ragCentre(f.rag).y : f.h);
      ctx.fillStyle = `rgba(15,23,42,${0.09 * (1 - clamp((f.h - fl) / 300, 0, 0.7))})`;
      ctx.beginPath(); ctx.ellipse(cx, G - fl + 2, f.rag ? 70 : 42, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (f.rag) {
      ctx.save();
      ctx.globalAlpha = f.dead ? clamp((6 - f.deadT) / 1.2, 0, 1) : 1;
      drawArcherRag(ctx, f.rag, !f.dead);
      for (const st of f.sticks) {
        const [p0, p1] = ragStickFrame(f.rag, st.s);
        const d = sub(p1, p0);
        const L = len(d) || 1;
        const tip = add(add(p0, mul(d, st.u)), mul(v(-d.y / L, d.x / L), st.w));
        const ang = Math.atan2(d.y, d.x) + st.rel;
        drawArrow(ctx, sub(tip, fromAngle(ang, ARROW_LEN)), ang, { embed: 12 });
      }
      if (!f.dead) this.drawHearts(f, add(f.rag.p[0], v(0, -40)));
      ctx.restore();
      return;
    }
    if (f.blendRag && f.blendT > 0) {
      drawArcherRag(ctx, f.blendRag, true, { face: 'wince' });
      ctx.save();
      for (const st of f.sticks) {
        const [p0, p1] = ragStickFrame(f.blendRag, st.s);
        const d = sub(p1, p0);
        const L = len(d) || 1;
        const tip = add(add(p0, mul(d, st.u)), mul(v(-d.y / L, d.x / L), st.w));
        const ang = Math.atan2(d.y, d.x) + st.rel;
        drawArrow(ctx, sub(tip, fromAngle(ang, ARROW_LEN)), ang, { embed: 12 });
      }
      this.drawHearts(f, add(f.blendRag.p[0], v(0, -40)));
      ctx.restore();
      return;
    }
    if (f.flipRag && f.flipK < 1) {
      if (Math.abs(f.spinRate) > 5) {
        // speed arcs around a fast somersault
        const c = v(f.x, G - f.h - 92);
        ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(c.x, c.y, 52 + i * 9, f.spin - 2.2 - i * 0.3, f.spin - 1.0 - i * 0.3); ctx.stroke(); }
        ctx.restore();
      }
      if (f.kind !== 'bow') drawArcherRag(ctx, f.flipRag, true, { face: 'ok' });
      else drawArcherRag(ctx, f.flipRag, true, { face: 'ok', bow: { ang: f.spin + (f.side > 0 ? -1.25 : Math.PI + 1.25) } });
      ctx.save();
      for (const st of f.sticks) {
        const [p0, p1] = ragStickFrame(f.flipRag, st.s);
        const d = sub(p1, p0);
        const L = len(d) || 1;
        const tip = add(add(p0, mul(d, st.u)), mul(v(-d.y / L, d.x / L), st.w));
        const ang = Math.atan2(d.y, d.x) + st.rel;
        drawArrow(ctx, sub(tip, fromAngle(ang, ARROW_LEN)), ang, { embed: 12 });
      }
      this.drawHearts(f, add(f.flipRag.p[0], v(0, -40)));
      ctx.restore();
      return;
    }
    ctx.save();
    const alpha = 1;
    ctx.globalAlpha = alpha;
    if (f.spin) { ctx.translate(f.x, G - f.h - 92); ctx.rotate(f.spin); ctx.translate(-f.x, -(G - f.h - 92)); }
    else if (!f.air) { ctx.beginPath(); ctx.rect(f.x - 400, -4000, 800, 4000 + G - f.h + 2.5); ctx.clip(); }
    ctx.scale(f.side, 1);
    drawArcher(ctx, f.pose);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const st of f.sticks) {
      const [p0, p1] = f.segs[st.s];
      const d = sub(p1, p0);
      const L = len(d) || 1;
      const tip = add(add(p0, mul(d, st.u)), mul(v(-d.y / L, d.x / L), st.w));
      const ang = Math.atan2(d.y, d.x) + st.rel;
      drawArrow(ctx, sub(tip, fromAngle(ang, ARROW_LEN)), ang, { embed: 12 });
    }
    if (f.shieldC && f.shieldSticks.length) {
      for (const st of f.shieldSticks) {
        const at = add(f.shieldC, v(st.d.x * f.side, st.d.y));
        const ang = f.side > 0 ? st.rel : Math.PI - st.rel;
        drawArrow(ctx, sub(at, fromAngle(ang, ARROW_LEN)), ang, { embed: 10 });
      }
    }
    if (!f.dead) {
      const head = f.segs[0] ? f.segs[0][1] : v(f.x, G - f.h - 180);
      this.drawHearts(f, v(head.x, head.y - 44));
      if (f.inj.dazed > 0) {
        for (let i = 0; i < 3; i++) {
          const a = f.a.time * 5 + (i * Math.PI * 2) / 3;
          const q = add(head, v(Math.cos(a) * 24, -14 + Math.sin(a) * 6));
          ctx.fillStyle = '#fbbf24'; ctx.beginPath();
          for (let k = 0; k < 10; k++) { const rr = k % 2 ? 2 : 4.5; const t = (k / 10) * Math.PI * 2 + a; ctx.lineTo(q.x + Math.cos(t) * rr, q.y + Math.sin(t) * rr); }
          ctx.closePath(); ctx.fill();
        }
      }
    }
    ctx.restore();
  }
  /** three hearts per bot (half hearts for limb hits); the player keeps a bar */
  private drawHearts(f: Fighter, at: V) {
    const ctx = this.ctx;
    ctx.save();
    if (f === this.pl) {
      const w = 70;
      ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.roundRect(at.x - w / 2, at.y, w, 7, 3.5); ctx.fill();
      ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.roundRect(at.x - w / 2, at.y, w * clamp(f.hp / f.maxHp, 0, 1), 7, 3.5); ctx.fill();
    } else {
      const n = f.maxHp; const sz = n > 3 ? 9 : 12; const gap = sz + 4;
      const x0 = at.x - ((n - 1) * gap) / 2;
      for (let i = 0; i < n; i++) {
        const fill = clamp(f.hp - i, 0, 1);
        const cx = x0 + i * gap; const cy = at.y + 2;
        const heart = (c: string, half: boolean) => {
          ctx.save(); ctx.translate(cx, cy); ctx.scale(sz / 12, sz / 12);
          if (half) { ctx.beginPath(); ctx.rect(-8, -8, 8, 16); ctx.clip(); }
          ctx.fillStyle = c; ctx.beginPath();
          ctx.moveTo(0, 5); ctx.bezierCurveTo(-8, -1, -6, -8, 0, -4); ctx.bezierCurveTo(6, -8, 8, -1, 0, 5); ctx.fill();
          ctx.restore();
        };
        heart('#e5e7eb', false);
        if (fill >= 1) heart(f.hurt > 0 ? '#fca5a5' : '#ef4444', false);
        else if (fill > 0) heart('#ef4444', true);
      }
    }
    ctx.fillStyle = f === this.pl ? '#16a34a' : '#7c3aed';
    ctx.font = '900 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.name, at.x, at.y - 9);
    ctx.restore();
  }

  private render() {
    const ctx = this.ctx;
    const dpr = this.canvas.width / this.vw;
    const scale = Math.min(this.vw / (this.war ? 1900 : 1640), (this.vh - 90) / (this.war ? 560 : 640)) * this.cam.z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // sky: white with the faintest blue toward the top
    const grd = ctx.createLinearGradient(0, 0, 0, this.vh);
    grd.addColorStop(0, '#f3f7fb'); grd.addColorStop(0.6, '#ffffff');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.translate(this.vw / 2, this.vh / 2 + 40 * (scale / this.cam.z));
    ctx.scale(scale, scale);
    ctx.translate(-this.cam.x + Math.sin(this.time * 97) * this.shake, -this.cam.y + Math.cos(this.time * 83) * this.shake);
    this.view = { scale, ox: this.vw / 2 - this.cam.x * scale, oy: this.vh / 2 + 40 * (scale / this.cam.z) - this.cam.y * scale };

    for (const c of this.clouds) {
      ctx.fillStyle = 'rgba(203,213,225,0.35)';
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r * 1.6, c.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c.x - c.r * 0.5, c.y - c.r * 0.25, c.r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c.x + c.r * 0.3, c.y - c.r * 0.4, c.r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    if (this.war) { this.drawField(); for (const p of WAR_PLATS) this.drawPlat(p); } else for (const p of this.plats()) this.drawPlat(p);
    for (const s of this.arrows) {
      if (!s.stuck) continue;
      ctx.globalAlpha = clamp((9 - s.t) / 1.5, 0, 1);
      drawArrow(ctx, sub(s.tip, fromAngle(s.ang, ARROW_LEN)), s.ang, { embed: 11 });
      ctx.globalAlpha = 1;
    }
    this.drawProps();
    for (const f of this.foes) this.drawFighter(f);
    this.drawFighter(this.pl);
    this.drawAxes();
    for (const s of this.arrows) if (!s.stuck) drawArrow(ctx, sub(s.tip, fromAngle(s.ang, ARROW_LEN)), s.ang, { flex: 6 * Math.exp(-4.5 * s.t) * Math.sin(s.t * 42) });

    const pl = this.pl;
    const frac = clamp(pl.a.pull / MAX_DRAW, 0, 1);
    if (!pl.dead && pl.a.phase === 'ready' && pl.pose.arrow && frac > 0.06) {
      const ang = Wang(pl, pl.pose.arrow.angle);
      const tip = add(W(pl, pl.pose.arrow.nock), fromAngle(ang, ARROW_LEN));
      const vel = add(fromAngle(ang, speedOf(frac)), v(pl.vx, 0));
      ctx.fillStyle = '#111827';
      for (let i = 1; i <= 12; i++) {
        const k = i * 0.026;
        ctx.globalAlpha = 0.5 * (1 - i / 13);
        ctx.beginPath();
        ctx.arc(tip.x + vel.x * k, tip.y + vel.y * k + 0.5 * GRAV * k * k, 4.2 - i * 0.18, 0, Math.PI * 2);
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
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.flashHurt > 0) {
      ctx.fillStyle = `rgba(239,68,68,${0.28 * this.flashHurt})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    if (this.drag && (this.stage === 'play' || this.stage === 'clear')) {
      const r = this.canvas.getBoundingClientRect();
      const A = this.nockScreen();
      const B = v(this.drag.cx - r.left, this.drag.cy - r.top);
      ctx.setLineDash([6, 7]);
      stroke(ctx, [A, B], 'rgba(17,24,39,0.35)', 2);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(17,24,39,0.5)';
      ctx.beginPath(); ctx.arc(A.x, A.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(239,68,68,0.9)';
      ctx.beginPath(); ctx.arc(B.x, B.y, 9, 0, Math.PI * 2); ctx.fill();
    }
  }
}
const lerpV = (a: V, b: V, t: number): V => v(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
const RAG_R = [17.5, 13.2, 10.8, 8.6, 10.8, 8.6, 7.2, 5.8, 7.2, 5.8];
const ragSegs = (r: ArcherRag): Seg[] => RAG_R.map((rad, i) => { const [a, b] = ragStickFrame(r, i); return [a, b, rad]; });
export const STORY_CHAPTERS = CHAPTERS.length;
export const WAR_CHAPTERS_N = WAR_CHAPTERS.length;
