// "Ragdoll Archer" mode. Black stickmen on floating grounds, drag-back-and-release archery, and every body
// is a live ragdoll: drawing leans it back, the release kicks it, a hit staggers it, a kill lets it crumple.
// Each level adds grounds and enemies. RagWorld is DOM-free (it is fed a size, a clock and pointer events,
// and paints into any 2D context); RagdollGame at the bottom wires it to a real canvas.
// The same world also runs behind the title screen as a self-playing demo.
import { Ctx, V, v, add, mul, dist, clamp, damp, ease, fromAngle, lerpV, segDist } from '../util';
import { ArcherRag, RAG_STICKS, punchRag } from '../archerRag';
import { ambStart, ambStop, ambTick, audioDuck, audioInit, snd } from './audio';
import { ARROW_LEN, BossId, BowId, HEAD_R, Slab2, Stick, StickLook, angLerp, drawArrow, drawAxe, drawBolt, drawBossHeldWeapon, drawBow, drawSimFlame, drawSkeleton, drawStick, fireAngle, impulse, makeStick, onString, startReact, stepStick, woundPoint } from './stick';
import { CanvasLike, MakeCanvas, Scene, THEMES, Theme, glowSprite, paintScene } from './scenery';
import { SHIELD_HH, drawBat, drawShield, shieldHalf } from './critters';
import { FORT, FortBlock, blockBox, blockCentre, drawFortBackdrop, drawFortBlock, drawFortFlag, makeFort } from './fort';
import { dragonRig, dragonToWorld, drawDragon } from './dragon';
import { HEAD_STYLES, Hair, HeadStyle, drawHead, drawHeadBack, makeHair, stepHair } from './head';
import { CFG, COSMETICS, CardId, SYNERGIES, SKIN_PERKS, SKIN_RULES, SkinId, SkillId, UNLOCKS, foeName, skinPerkName, synergyDesc, synergyName, unlockLabel, unlockName } from './config';
import { RouteId, RunState, cardLv, gandaShots, hasSyn, hunterMult, levelMods, lvVal, newRunState, playerDmgMult, playerMaxHp, rerollCost, rollOffer, takeCard, useReroll, cardBonuses, mergeTraining } from './cards';
import { arrowDmg, encounterPlan, enemyDmg, enemyHp, enemyLevelFor, isBossLevel, killReward, lateDmgMult, lateHpMult, levelCounts, levelReward, nextBossLevel, weaponBossIndex } from './formulas';
import { MetaSave, SESSION, Settings, addDaily, bowUnlocked, buyUnlock as mBuyUnlock, cardUnlocked, clearLogs, dailyInfo, dailyScore, evaluateUnlocks, hatUnlocked, isUnlocked, loadMeta, logRun, modEffects, modLabel, mulberry32, newMeta, nextUnlock, readLogs, saveMeta, toCsv, unlockOf } from './meta';
import { SkinBurn, SkinShot, SkinStatus, applySkinBurn, consumeSkinBarrier, newSkinRuntime, nextSkinLevel, peekSkinShot, skinHeadHeal, skinHitMult, skinIncomingMult, skinKill, skinKillGoldMult, skinParry, skinReloadMult, skinStatus, stepSkinBurn, takeSkinShot, tickSkinRuntime } from './skinPerks';
import { drawSkinShot } from './skinFx';
import { purchaseSkill, steadyRelease, trainedArrowSpeed, trainedGuideDots, trainedSpread, trainingBonuses, branchResonance } from './progression';
import { tx } from '../../i18n';

export type { BowId, BossId };
export const BOSS_IDS: BossId[] = ['axer', 'thunder_lord', 'inferno_king', 'xeno_queen', 'thorn_warden'];

const bossBowOf = (b?: BossId): BowId =>
  b === 'thunder_lord' ? 'thunder'
  : b === 'inferno_king' ? 'fire'
  : b === 'xeno_queen' ? 'poison'
  : b === 'thorn_warden' ? 'spike'
  : 'wood';

const bossWeaponLabel = (b?: BossId): string =>
  b === 'thunder_lord' ? tx('TRIDENT', 'TRISULA')
  : b === 'inferno_king' ? tx('GREATSWORD', 'PEDANG')
  : b === 'xeno_queen' ? tx('SCYTHE', 'SABIT')
  : b === 'thorn_warden' ? tx('THORN MACE', 'GADA DURI')
  : tx('AXE', 'KAPAK');

const bossEmbedAng = (b: BossId | undefined, flightAng: number): number =>
  b === 'thunder_lord' || b === 'inferno_king' || b === 'thorn_warden'
    ? flightAng
    : flightAng + Math.PI + 0.24;

const bossTitleOf = (b: BossId): [string, string] =>
  b === 'thunder_lord' ? [tx('THUNDER EMPEROR BOSS!', 'BOS KAISAR PETIR!'), tx('SHOOT HIS LIGHTNING TRIDENT MID-AIR!', 'PANAH TRISULA PETIRNYA DI UDARA!')]
  : b === 'inferno_king' ? [tx('MAGMA DEMON KING BOSS!', 'BOS RAJA IBLIS MAGMA!'), tx('SHOOT HIS FLAME GREATSWORD MID-AIR!', 'PANAH PEDANG APINYA DI UDARA!')]
  : b === 'xeno_queen' ? [tx('XENOMORPH QUEEN BOSS!', 'BOS RATU XENOMORPH!'), tx('SHOOT HER ACID SCYTHE MID-AIR!', 'PANAH SABIT ASAMNYA DI UDARA!')]
  : b === 'thorn_warden' ? [tx('THORN WARDEN BOSS!', 'BOS PANGLIMA DURI!'), tx('SHOOT HIS THORN MACE MID-AIR!', 'PANAH GADA DURINYA DI UDARA!')]
  : [tx('VIKING AXE KING BOSS!', 'BOS RAJA VIKING KAPAK!'), tx('SHOOT HIS AXE WHILE IN MID-AIR!', 'PANAH KAPAKNYA SAAT DI UDARA!')];

const H = 1 / 120;
const AG = CFG.arrow.gravity; // gravity on arrows
const DEFAULT_SPEED_MULT = 1.4; // Default arrow speed is 1.4x normal
const MAX_SPEED_MULT = 1.9;     // Max arrow speed is 1.9x normal
const speedMultOf = (pull: number, upDmg = 0) => {
  const pullBoost = Math.pow(clamp((pull - 0.5) / 0.5, 0, 1), 1.3);
  const upBoost = clamp(upDmg / 8, 0, 1) * 0.35;
  return clamp(DEFAULT_SPEED_MULT + (MAX_SPEED_MULT - DEFAULT_SPEED_MULT) * clamp(pullBoost + upBoost, 0, 1), DEFAULT_SPEED_MULT, MAX_SPEED_MULT);
};
/** Player arrow speed: 1.4x normal by default, ramping up to 1.9x max at full draw */
const speedOf = (pull: number, upDmg = 0) => (430 + 800 * pull) * speedMultOf(pull, upDmg);
/** Enemy arrow speed: scales with enemy level (`lvl` 1 = 1.0x, `lvl` 3 = 1.24x sharpshooter!) */
const foeSpeedOf = (pull: number, lvl = 1) => (430 + 800 * pull) * clamp(1 + (lvl - 1) * 0.12, 1, 1.45);
const rand = Math.random;
const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15;
const FONT = '"Russo One","Arial Black","Segoe UI Black",system-ui,sans-serif';
const BEST_KEY = 'perfectshot.ragdoll.best';
const BOW_KEY = 'perfectshot.ragdoll.bow';

export type RangeMult = 1 | 1.5 | 2;

/** what the run panels & HUD need about the current roguelite run */
export interface RunUi {
  cards: [CardId, number][]; offer: CardId[]; pickTitle: string; rerollCost: number; freeRerolls: number;
  shieldOn: boolean; shield: number; hasSlow: boolean; slow: number; slowOn: boolean; ganda: number; gandaMax: number;
  hunter: number; streak: number; synergies: string[]; killedBy: string; goldEarned: number; metaGain: number;
  chestCost: number; canChest: boolean; lastChest: boolean; route: string; daily: string; next: string; nextPct: number; unlocks: string[];
  /** RESONANSI per cabang skill tree (1 = none) */
  resonance: Record<string, number>;
}

export interface RUi {
  /** 'shop' = pick 1 of 3 cards; 'route' = AMAN / BERISIKO / PETI; 'chest' = card OR full heal */
  stage: 'play' | 'clear' | 'shop' | 'route' | 'chest' | 'dying' | 'dead';
  demo: boolean; level: number; kills: number; total: number; grounds: number; coins: number; shown: number; bump: number;
  /** the prisoner this level: 0 none, 1 still tied, 2 freed */
  hostage: number; totalKills: number; headshots: number;
  hp: number; maxHp: number; best: number; boss: boolean; hint: boolean; paused: boolean; theme: string; stars: number; reward: number;
  run: RunUi; toasts: { id: number; title: string; sub: string }[]; metaRev: number; debug: boolean;
  skin: SkinStatus & { id: SkinId };
  bow: BowId;
  /** whether the Image-1 style dotted parabolic trajectory arc is shown */
  showGuide: boolean;
  /** spawn distance multiplier for this round: 1x normal, 1.5x medium-far, or 2x sniper far */
  rangeMult: RangeMult;
  /** true when MAX POWER mode is active (instant 1.9x full draw, pierces 2 enemies, auto-dead, embeds half-through in the last enemy!) */
  maxPower: boolean;
}

type Kind = 'player' | 'archer' | 'helm' | 'heavy' | 'boss' | 'axer' | 'hostage' | 'shield' | 'guard' | 'rider';
/** what the enemy codex can put on its stage: one kind of enemy at a time (and the prisoner, who is not one) */
export type FoeShow = 'archer' | 'helm' | 'heavy' | 'shield' | 'bat' | 'vampire' | 'hostage' | 'fort' | 'dragon';
export type { HeadStyle };
const HEAD_KEY = 'perfectshot.ragdoll.head';
/**
 * The wooden fort: its own wide ground, its timbers, the unseen grounds its guards stand on (`on`: the timber that
 * floor is, -1 for the fort's ground itself), and the guards. `fallen`: it has collapsed; `done`: nobody is left in it.
 */
interface Fort { base: Plat; blocks: FortBlock[]; stands: { plat: Plat; x: number; y: number; on: number }[]; guards: Fighter[]; fallen: boolean; done: boolean }
/**
 * The red dragon. It flies `in`, hovers (`fly`), draws breath (`inhale`: `glow` rises, `jaw` opens, `shots` balls
 * of fire to come), reels when the fire goes off in its mouth (`stun`), flies off once its rider is down (`leave`)
 * or falls out of the sky (`dying`). `dip`: height lost to a hit in the wing. `plat`: the saddle its rider stands on.
 */
interface SkinVictimState { skinBurn?: SkinBurn; skinStunT?: number; lastSkin?: SkinId }
interface Dragon extends SkinVictimState {
  p: V; from: V; vel: V; vr: number; fx: number; ph: number; s: number; t: number; st: number; flap: number; tilt: number;
  hp: number; maxHp: number; hpLag: number; flash: number;
  state: 'in' | 'fly' | 'inhale' | 'stun' | 'leave' | 'dying';
  fireT: number; shots: number; jaw: number; glow: number; dip: number; spit: number;
  rider: Fighter | null; plat: Plat;
}
interface Fireball { p: V; vel: V; r: number; life: number; dead: boolean; dmg: number }
/** where a shield is: its centre, how far its long axis is turned off upright (clockwise), and its bearer's scale */
interface ShieldPose { c: V; rot: number; s: number }
/** an arrow left standing in a shield: where on its face (the shield's own frame, scale 1) and its angle against it */
interface ShieldArrow { x: number; y: number; rel: number; bow: BowId }
/**
 * The board a shield bearer hides behind. `g` 1 = held out in front (it covers him from the thighs to the eyes),
 * 0 = swung round onto his back (he is open from head to toe). `openT` keeps it off him after a shot in the leg.
 * `hp` is how many more arrows it can stop before it splits; `told` counts the "shoot his legs" hints already given.
 */
interface Shield {
  hp: number; max: number;
  /** `g` rides a spring (`gv` is its speed), so the shield swings round with some weight and settles */
  g: number; gv: number;
  /** flash and recoil from the last arrow it stopped: both 1 at the blow, dying away */
  flash: number; kick: number;
  openT: number; told: number; stuck: ShieldArrow[];
}
/** a shield that outlived its owner, tumbling away */
interface LooseShield { p: V; vel: V; rot: number; vr: number; s: number; hp: number; max: number }
/**
 * A bat. It rides its own lane of air up and down (`fx` across, `amp`/`freq` the swing), and every so often it
 * stops, shrieks (`warn`) and comes for the player's head (`dive`); bitten or not, it flies `back` to its lane.
 */
interface Bat extends SkinVictimState {
  lvl: number;
  p: V; vel: V; from: V; fx: number; ph: number; amp: number; freq: number; s: number; big: boolean;
  hp: number; maxHp: number; dmg: number; state: 'in' | 'hover' | 'warn' | 'dive' | 'back' | 'dead';
  t: number; atkT: number; flap: number; flash: number; hpShow: number; deadT: number;
  /** seen from the side: which way it looks (-1 left, +1 right), and how far its nose is up or down */
  face: number; rot: number; vr: number;
}
interface Plat {
  x: number; y: number; w: number; h: number; fx: number; fy: number;
  /** a ground nobody sees and that is not placed by `fx`/`fy`: a floor of the fort, the dragon's saddle */
  hidden?: boolean;
  rise: number; state: 'rise' | 'on' | 'sink' | 'off'; phase: number; amp: number; sway: number; sinkT: number;
  /** a little spring: the ground dips when its archer is struck or looses an arrow */
  off: number; vel: number;
}
interface Stuck {
  stick: number; u: number; lx: number; ly: number; rel: number; bow: BowId; fxT: number;
  isAxe?: boolean; bossKind?: BossId; s?: number;
  /** true when a MAX POWER arrow lodged half-way through (`ARROW_LEN * 0.5`) the final enemy hit */
  halfThrough?: boolean;
}
interface Ai { state: 'wait' | 'draw' | 'hold'; t: number; aim: number; pull: number; drawT: number; spread: number; floor: number }
interface Fighter extends SkinVictimState {
  k: Stick; kind: Kind; bossKind?: BossId; team: 0 | 1;
  /** fighter level (1 = normal, 2 = veteran, 3+ = thick HP & sharpshooter aim!) */
  lvl: number;
  hp: number; maxHp: number;
  /** delayed white damage catch-up bar value & hold timer (like Image 1) */
  hpLag: number; hpLagHold: number; barBump: number;
  helm: boolean; plat: Plat; stuck: Stuck[];
  vib: number; hpShow: number; flash: number; deadT: number; dmg: number; pitch: number; ai: Ai;
  /** elemental simulation timers: electrocution, fire combustion, poison acid */
  shockT: number; burnT: number; poisonT: number; dotTick: number;
    /** only the shield bearer carries one */
  shield?: Shield;
  /** what he wears on his head, and - for the styles that have it - the hair that flows from it */
  hat?: HeadStyle; hair?: Hair | null;
  /** PANAH PAKU: pinned (stunned) time left, where the nail goes in, and a short immunity after */
  pinT?: number; pinAt?: V; pinImm?: number;
  /** the big boss of every fifth level */
  bigBoss?: boolean;
}
type SkinTarget = Fighter | Bat | Dragon;
interface Arrow {
  p: V; prev: V; vel: V; ang: number; team: 0 | 1; dmg: number; main: boolean; near: boolean;
  stuckIn: Plat | null; ox: number; oy: number; life: number; dead: boolean; bow: BowId;
  /** MAX POWER arrow: pierces up to 2 enemies (auto-kill) and lodges half-through in the 2nd enemy */
  maxPower?: boolean; pierced?: number; hitIds?: Set<SkinTarget>;
  /** who shot it (cause of death), cards: pierces left, bounced off a shield, chain done, trail, hit anyone */
  src?: string; pierceLeft?: number; ricochet?: boolean; chainDone?: boolean; trail?: V[]; hitAny?: boolean;
  skin?: SkinShot; skinChainDone?: boolean; skinBlastDone?: boolean;
}
interface Part {
  p: V; prev?: V; vel: V; life: number; max: number; r: number; col: string; grav: number;
  kind?: 'helm' | 'ring' | 'fire' | 'smoke' | 'spark' | 'ember' | 'thorn' | 'acid' | 'acidSmoke' | 'acidBubble';
  rot?: number; drag?: number; turb?: number; seed?: number;
}
interface ArcFx { a: V; b: V; life: number; max: number; spread: number; segs: number; col: string; lw: number; seed: number }
/** a coin on its way to the purse (screen space, CSS px) */
interface Coin {
  x: number; y: number; ox: number; oy: number; slx: number; sly: number; t: number; i: number; n: number; sc: number;
  fly: number; sx: number; sy: number; cx: number; cy: number; val: number; spin: number; trail: V[]; done: boolean; born: boolean;
  from: V | null; at: V | null;
}
/** `full`: the whole-screen head shot; otherwise a small window over just the bone that was hit */
interface Xray { f: Fighter; stick: number; u: number; pt: V; ang: number; t: number; dur: number; full: boolean }
interface Axe {
  p: V; vel: V; ang: number; vr: number; s: number; dmg: number; spent: boolean; life: number; dead: boolean;
  bossKind: BossId; stuckIn: Plat | null; ox: number; oy: number;
}
interface Txt { x: number; y: number; life: number; max: number; text: string; col: string; size: number }
interface LooseBow { p: V; vel: V; ang: number; vr: number; s: number; bow: BowId }
interface Balloon { x: number; y: number; kind: 'heart' | 'coin'; phase: number }

const toSlab = (p: Plat): Slab2 => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, top: p.y, bot: p.y + p.h });

export class RagWorld {
  w = 960; h = 600; dpr = 1; VW = 1200; VH = 680; sc = 1; cy = 380; span = 180; pullPx = 140;
  t = 0; rt = 0; private acc = 0; private ts = 1; private slowT = 0; private slowK = 1; private hitStop = 0;
  private shake = 0; private hurt = 0; private banner = 0; private bannerText = ''; private bannerSub = '';
  private cam = 0; private zoom = 1; private zoomTo = 1; private focus: V = v(0, 0);
  private camX = 600; private camY = 340;
  stage: RUi['stage'] = 'play'; paused = false; hint = true; demo = true;
  /** Shows the clean Image-1 style parabolic dotted trajectory arc from the arrow tip (no circle/ring UI!) */
  showGuide = true;
  /** Spawn distance multiplier for the current round: 1 (Normal), 1.5 (1.5x Far), or 2 (2x Sniper Far) */
  rangeMult: RangeMult = 1;
  /** MAX POWER mode: full 1.9x power draw, pierces up to 2 enemies (auto-dead!) & embeds half-through in the last enemy */
  maxPower = false;
  level = 1; kills = 0; total = 2; spawned = 0; maxAlive = 1;
  coins = 0; totalKills = 0; headshots = 0; best = 1; stars = 0;
  bow: BowId = 'wood';
  /** meta-progress (saved locally) and the current run */
  meta: MetaSave = loadMeta();
  training = trainingBonuses(this.meta);
  /** skill tree only (snapshot); `training` = this + JALUR cards of the run */
  private metaTraining = this.training;
  resonance = branchResonance(this.meta);
  run: RunState = newRunState(0);
  skinState = newSkinRuntime();
  offer: CardId[] = []; pickTitle = ''; metaRev = 0; queueDaily = false; private pickQueue = 0;
  private toastQ: { id: number; title: string; sub: string; t: number }[] = []; private toastId = 0;
  private foeHpMult = 1; private foeDmgMult = 1; private goldMult = 1; private bigBossDue = false;
  private bossSpawned = false; private preferredBoss: BossId | undefined;
  private rng: (() => number) | null = null; private mods = modEffects('');
  /** gameplay RNG for spawns & card sets: seeded in the daily challenge, Math.random otherwise */
  srand = (): number => (this.rng ? this.rng() : Math.random());
  private spawnT = 0; private clearT = 0; private deadT = 0; private holdAim = 0; private balloonT = 9;
  private creakAt = 0.14; private heartT = 0; private combo = 0; private coinSeq = 0;
  private lvShots = 0; private lvHits = 0; private lvHurt = 0;
  private pFyT = 0.25;
  pPlat: Plat = { x: 200, y: 400, w: 66, h: 30, fx: 0.17, fy: 0.25, rise: 1, state: 'on', phase: 0.6, amp: 5, sway: 0, sinkT: 0, off: 0, vel: 0 };
  player!: Fighter;
  foes: Fighter[] = []; plats: Plat[] = []; arrows: Arrow[] = [];
  private parts: Part[] = []; private arcs: ArcFx[] = []; private texts: Txt[] = []; private bows: LooseBow[] = []; private balloons: Balloon[] = [];
  private drag = { on: false, sx: 0, sy: 0, x: 0, y: 0 };
  private theme: Theme = THEMES[0]; private scene: Scene | null = null; private sceneKey = '';
  private flySpr: CanvasLike | null = null; private mistSpr: CanvasLike | null = null;
  private cyanSpr: CanvasLike | null = null; private fireSpr: CanvasLike | null = null; private acidSpr: CanvasLike | null = null;
  // the living backdrop (all in 0..1 screen fractions, so it survives any resize)
  private flies: { x: number; y: number; ph: number; sp: number; bl: number; r: number; front: boolean }[] = [];
  private leaves: { x: number; y: number; ph: number; sp: number; rs: number; r: number }[] = [];
  private rays: { x: number; w: number; ph: number }[] = [];
  private mists: { x: number; y: number; sp: number }[] = [];
  private vines: { x: number; len: number; ph: number }[] = [];
  private blades: { x: number; h: number; w: number; ph: number }[] = [];
  private birds: { x: number; y: number; vx: number; n: number; ph: number }[] = []; private birdT = 5;
  private coinFx: Coin[] = []; private pending = 0; private bumpN = 0; private hudFlash = 0; private rewardPaid = false;
  private goldSpr: CanvasLike | null = null;
  private xray: Xray | null = null; private panK = 0;
  private axes: Axe[] = [];
  /** the bats of this level: how many it holds in all (they count as enemies), how many have come, and the next one's clock */
  bats: Bat[] = []; private batTotal = 0; private batSpawned = 0; private batT = 0; private batTold = false;
  private looseShields: LooseShield[] = [];
  /** set while this world is the enemy codex's stage: the one kind of enemy it is showing */
    show: FoeShow | null = null;
  /** the set pieces: the wooden fort, the red dragon and its balls of fire; and whether this level still owes one */
  fort: Fort | null = null; dragon: Dragon | null = null;
  private fireballs: Fireball[] = []; private fortDue = false; private dragonDue = false;
  /** what the player wears on his head */
  head: HeadStyle = 'band';
  hostage: Fighter | null = null; hostState = 0; private freeT = 0;
  private last = '';

  /** `codex`: this world is only a stage inside the codex - it leaves the game's music and volume alone */
  constructor(private emit: (ui: RUi) => void, private make: MakeCanvas, private codex = false) {
    try {
      this.best = Math.max(1, Number(localStorage.getItem(BEST_KEY) ?? 1) || 1);
      const savedBow = localStorage.getItem(BOW_KEY) as BowId | null;
      if (savedBow && ['thunder', 'fire', 'wood', 'spike', 'poison', 'gold', 'legend'].includes(savedBow) && bowUnlocked(this.meta, savedBow)) this.bow = savedBow;
      const savedHead = localStorage.getItem(HEAD_KEY) as HeadStyle | null;
      if (savedHead && HEAD_STYLES.includes(savedHead) && hatUnlocked(this.meta, savedHead)) this.head = savedHead;
    } catch { this.best = 1; }
    for (let i = 0; i < 38; i++) {
      const front = i >= 27;
      this.flies.push({ x: rand(), y: 0.28 + rand() * 0.66, ph: rand() * 6.28, sp: 0.25 + rand() * 0.45, bl: 0.6 + rand() * 1.3, r: front ? 13 + rand() * 12 : 4.5 + rand() * 5, front });
    }
    for (let i = 0; i < 13; i++) this.leaves.push({ x: rand(), y: rand(), ph: rand() * 6.28, sp: 0.018 + rand() * 0.03, rs: (rand() - 0.5) * 1.6, r: 4 + rand() * 4 });
    for (let i = 0; i < 5; i++) this.rays.push({ x: 0.08 + i * 0.2 + rand() * 0.1, w: 0.03 + rand() * 0.05, ph: rand() * 6.28 });
    for (let i = 0; i < 3; i++) this.mists.push({ x: rand() * 1.4, y: 0.74 + i * 0.07, sp: (0.006 + rand() * 0.008) * (i % 2 ? -1 : 1) });
    for (let i = 0; i < 6; i++) this.vines.push({ x: (i + 0.2 + rand() * 0.6) / 6, len: 0.1 + rand() * 0.2, ph: rand() * 6.28 });
    for (let i = 0; i < 96; i++) this.blades.push({ x: (i + rand()) / 96, h: 10 + rand() * 30 + (rand() < 0.12 ? 22 : 0), w: 2 + rand() * 2.4, ph: rand() * 6.28 });
    this.resize(960, 600, 1);
    this.makePlayer();
    this.setupDemo();
    if (!this.codex) audioDuck(0.3);
  }

  setBow(b: BowId) {
    if (!bowUnlocked(this.meta, b)) {
      snd.deny();
      const u = unlockOf(`bow:${b}`);
      this.toast(tx('BOW LOCKED', 'BUSUR TERKUNCI'), u ? unlockLabel(u) : '');
      return;
    }
    this.bow = b;
    try { localStorage.setItem(BOW_KEY, b); } catch { /* ignore */ }
    snd.buy();
    this.previewShot();
    this.emitUi();
  }

  /** Fires a live demonstration shot from the player stickman in the gameplay arena */
  previewShot() {
    const pf = this.player;
    const pk = pf.k;
    if (!pk.alive) return;
    let tgt: Fighter | null = null;
    for (const f of this.foes) {
      if (f.k.alive && f.plat.state === 'on') { tgt = f; break; }
    }
    if (this.show) tgt = this.demoTarget(tgt, 0.3); // on the codex stage: at whatever is on show, bat and rope included
    if (tgt) {
      this.aimAt(pf, tgt);
      pk.aim = pf.ai.aim;
      pk.pull = pf.ai.pull;
    } else {
      pk.aim = -0.26;
      pk.pull = 0.88;
    }
    pk.aiming = 1;
    pk.nock = 1;
    this.holdAim = 0.7;
    this.fire(pf);
  }

  addCoins(n: number) {
    this.coins += n;
    this.bumpN++;
    this.hudFlash = 1;
    snd.coinPop();
    snd.buy();
    this.emitUi();
  }

  /** Toggle the Image-1 style parabolic dotted trajectory arc on/off */
  toggleGuide() {
    this.showGuide = !this.showGuide;
    snd.tap();
    this.emitUi();
  }

  /** Toggle MAX POWER mode on/off (instant 1.9x draw, pierces 2 enemies -> auto-dead, lodges half-through in the last enemy!) */
  toggleMaxPower(force?: boolean) {
    this.maxPower = force !== undefined ? force : !this.maxPower;
    this.banner = 1.9;
    this.bannerText = this.maxPower ? tx('⚡ MAX POWER ACTIVE!', '⚡ MAX POWER AKTIF!') : tx('MAX POWER OFF', 'MAX POWER MATI');
    this.bannerSub = this.maxPower
      ? tx('ARROWS PIERCE 2 FOES (AUTO DEAD) & EMBED HALFWAY IN THE LAST FOE!', 'PANAH TEMBUS 2 MUSUH (AUTO DEAD) & NANCEP SETENGAH DI MUSUH TERAKHIR!')
      : tx('STANDARD SHOT MODE', 'MODE TEMBAKAN STANDAR');
    snd.buy();
    this.emitUi();
  }

  /** Cycle or set enemy spawn distance multiplier: 1x Normal -> 1.5x Jarak Menengah -> 2x Jarak Jauh */
  cycleRange(force?: RangeMult) {
    const next: RangeMult =
      force !== undefined
        ? force
        : this.rangeMult === 1
          ? 1.5
          : this.rangeMult === 1.5
            ? 2
            : 1;
    this.rangeMult = next;
    for (const f of this.foes) {
      if (!f.k.alive) continue;
      const big = f.kind === 'boss' || f.kind === 'axer';
      if (next === 2) {
        f.plat.fx = big ? 1.32 + rand() * 0.32 : 1.05 + rand() * 0.58;
      } else if (next === 1.5) {
        f.plat.fx = big ? 1.02 + rand() * 0.24 : 0.78 + rand() * 0.44;
      } else {
        f.plat.fx = big ? 0.68 + rand() * 0.22 : 0.5 + rand() * 0.42;
      }
      this.placePlat(f.plat);
    }
    this.banner = 2.0;
    this.bannerText =
      next === 2 ? tx('2X LONG RANGE ROUND!', 'RONDE JARAK JAUH 2X!')
      : next === 1.5 ? tx('1.5X RANGE ROUND!', 'RONDE JARAK 1.5X!')
      : tx('1X NORMAL RANGE ROUND', 'RONDE JARAK 1X NORMAL');
    this.bannerSub =
      next === 1
        ? tx('STANDARD PLATFORM DISTANCE', 'JARAK PIJAKAN STANDAR')
        : tx(`FOES SPAWN ${next}X FARTHER · CAMERA AUTO-ZOOMS OUT!`, `MUSUH SPAWN ${next}X LEBIH JAUH · KAMERA ZOOM OUT OTOMATIS!`);
    snd.banner();
    this.emitUi();
  }

  /* ---------------- layout ---------------- */

  resize(w: number, h: number, dpr: number) {
    this.w = w; this.h = h; this.dpr = dpr;
    let VW = clamp((w / h) * 680, 660, 1400);
    let sc = w / VW; let VH = h / sc;
    if (VH < 560) { sc = h / 560; VW = w / sc; VH = 560; }
    this.VW = VW; this.VH = VH; this.sc = sc;
    const topSafe = (h < 520 ? 80 : 120) / sc; // the HUD lives up there
    this.cy = (topSafe + VH) / 2 + 12;
    this.span = clamp((VH - topSafe) / 2 - 112, 80, 240);
    this.pullPx = clamp(Math.min(w, h) * 0.3, 90, 170);
    this.pPlat.fx = clamp(VW * 0.17, 110, 260) / VW;
    this.camX = VW * 0.5; this.camY = VH * 0.5;
    this.sceneKey = '';
  }

  private placePlat(p: Plat) {
    const ty = this.cy + p.fy * this.span;
    const e = ease.out(clamp(p.rise, 0, 1));
    p.x = p.fx * this.VW + Math.sin(this.t * 0.7 + p.phase * 1.7) * p.sway;
    p.y = ty + (1 - e) * (this.VH - ty + 170) + Math.sin(this.t * 1.3 + p.phase) * p.amp + p.off;
  }
  private pan(x: number) { return clamp((x / this.VW) * 2 - 1, -0.85, 0.85); }

  /* ---------------- run / level flow ---------------- */

  private makePlayer() {
    this.pPlat.off = 0; this.pPlat.vel = 0;
    this.placePlat(this.pPlat);
    const maxHp = this.demo ? CFG.player.baseHp : playerMaxHp(this.run, 0, this.training.hpBonus);
    const lvl = Math.max(1, 1 + Math.floor((this.level - 1) / CFG.player.lvlEvery));
    this.player = {
      k: makeStick(v(this.pPlat.x, this.pPlat.y), 1, 1, false, true), kind: 'player', team: 0,
      lvl, hp: maxHp, maxHp, hpLag: maxHp, hpLagHold: 0, barBump: 0,
      helm: false, plat: this.pPlat, stuck: [], vib: 9, hpShow: 0, flash: 0, deadT: 0, dmg: 0, pitch: 1.12,
      ai: { state: 'wait', t: 1.2, aim: 0, pull: 0.9, drawT: 0.6, spread: 0.045, floor: 0.045 },
            shockT: 0, burnT: 0, poisonT: 0, dotTick: 0,
    };
    this.player.hat = this.head; this.player.hair = makeHair(this.head, this.player.k);
  }

  private setupLevel() {
    const L = this.level;
    const plan = encounterPlan(L);
    this.kills = 0; this.spawned = 0;
    // bats come on top of the archers and count as enemies of the level: 1 on level 1, up to 4 later on
    this.bigBossDue = plan.weapon; this.bossSpawned = false; this.preferredBoss = undefined;
    this.batTotal = levelCounts(L).bats; this.batSpawned = 0; this.batT = 3.1;
        this.bats = this.bats.filter((b) => b.state === 'dead');
    // Forts keep their usual cadence; dragons only occupy scheduled boss milestones.
    this.fortDue = plan.fort; this.dragonDue = plan.dragon;
    if (this.fort) this.fort.base.sinkT = Math.max(this.fort.base.sinkT, 0.01);
    this.fireballs = [];
    const lc = levelCounts(L);
    this.total = lc.foot + this.batTotal;
    this.maxAlive = lc.alive;
    this.spawnT = 0.45; this.clearT = 0; this.stage = 'play';
    this.player.k.victory = 0;
    this.theme = THEMES[Math.floor((L - 1) / 3) % THEMES.length];
    this.pFyT = [0.25, -0.05, 0.4, 0.1, -0.2][(L - 1) % 5];
    this.pPlat.amp = 4 + Math.min(L, 8) * 0.7;
    // Rounds cycle across 1x Normal (Level 1, 4, 7...), 1.5x Medium-Far (Level 2, 5, 8...), and 2x Sniper Far (Level 3, 6, 9...)!
    this.rangeMult = L % 3 === 0 ? 2 : L % 3 === 2 ? 1.5 : 1;
    this.banner = 2.5;
    this.bannerText =
      plan.boss
        ? `LEVEL ${L} / ${plan.dragon ? tx('RED DRAGON BOSS!', 'BOS NAGA MERAH!') : tx('BIG BOSS!', 'BOS BESAR!')}`
        : this.fortDue
          ? `LEVEL ${L} / ${tx('STURDY WOODEN FORT!', 'ISTANA KAYU KOKOH!')}`
          : `LEVEL ${L} / ${tx('ARCHERY ARENA', 'ARENA PEMANAH')}`;
    const prisoner = plan.hostage;
    this.bannerSub =
      this.fortDue
        ? tx('IRON-CLAD WALLS · AIM AT FOUNDATION PEG & ROOF JOINT!', 'DINDING DILAPIS BESI · BIDIK PASAK PONDASI & SENDI ATAP!')
        : this.rangeMult > 1
          ? tx(`FOES ${this.rangeMult}X FARTHER · CAMERA AUTO-ZOOMS OUT!`, `MUSUH ${this.rangeMult}X LEBIH JAUH · KAMERA ZOOM OUT OTOMATIS!`)
          : prisoner ? tx('FREE THE HOSTAGE! AIM AT THE ROPE!', 'BEBASKAN TAWANAN! BIDIK TALINYA!') : tx(`DEFEAT ALL FOES · BOSS AT LEVEL ${nextBossLevel(L)}`, `KALAHKAN SEMUA MUSUH / BOS DI LEVEL ${nextBossLevel(L)}`);
    if (L === CFG.encounters.firstLevel) this.bannerSub = tx(`ALL FOES LV.${CFG.enemy.ranks.normal} · FIRST BOSS AT LEVEL ${CFG.bigBoss.every}`, `SEMUA MUSUH LV.${CFG.enemy.ranks.normal} / BOS PERTAMA DI LEVEL ${CFG.bigBoss.every}`);
    this.lvShots = 0; this.lvHits = 0; this.lvHurt = 0; this.combo = 0; this.stars = 0; this.rewardPaid = false;
    if (L > this.best) { this.best = L; try { localStorage.setItem(BEST_KEY, String(L)); } catch { /* not kept */ } }
    this.axes = []; this.hostage = null; this.hostState = 0;
    if (prisoner) this.spawnHostage();
    this.levelInit();
    snd.banner();
  }

  /** per-level card/route state: route & risk-card multipliers, Panah Ganda shots, Level 15+ scaling */
  private levelInit() {
    nextSkinLevel(this.skinState);
    const r = this.run; const L = this.level;
    const m = levelMods(r, this.mods.hp, lateHpMult(L), lateDmgMult(L));
    this.foeHpMult = m.hp; this.foeDmgMult = m.dmg; this.goldMult = m.gold;
    r.gandaLeft = gandaShots(r); r.slowT = 0;
    if (r.route === 'risiko') this.bannerSub = tx(`RISKY ROUTE · FOES +${Math.round((CFG.route.risk.hp - 1) * 100)}% · GOLD +${Math.round((CFG.route.risk.gold - 1) * 100)}%`, `RUTE BERISIKO · MUSUH +${Math.round((CFG.route.risk.hp - 1) * 100)}% · EMAS +${Math.round((CFG.route.risk.gold - 1) * 100)}%`);
    if (this.bigBossDue || this.dragonDue) this.bannerSub = tx('BIG BOSS INCOMING · REWARD: DOUBLE ARROW + BONUS CARD', 'BOS BESAR DATANG / HADIAH: PANAH GANDA + KARTU BONUS');
    if (r.mod) this.bannerSub = `${tx('DAILY', 'HARIAN')}: ${modLabel(r.mod)}`;
  }

  /** the title screen: he fights on by himself, forever */
  private setupDemo() {
    this.bigBossDue = false; this.dragonDue = false; this.fortDue = false; this.bossSpawned = false; this.preferredBoss = undefined;
    this.level = 1; this.kills = 0; this.spawned = 0; this.total = 1e9; this.maxAlive = 2;
    this.spawnT = 0.6; this.stage = 'play'; this.theme = THEMES[0]; this.pFyT = 0.25; this.pPlat.amp = 5;
    this.rangeMult = 1;
    this.banner = 0; this.hint = false;
    this.batTotal = 0; this.batSpawned = 0; // the title screen keeps to archers: nobody there could deal with a bat
  }

  private clearWorld() {
    this.foes = []; this.plats = []; this.arrows = []; this.parts = []; this.arcs = []; this.texts = []; this.bows = []; this.balloons = [];
    this.slowT = 0; this.hitStop = 0; this.hurt = 0; this.drag.on = false; this.balloonT = 9;
    this.zoom = 1; this.zoomTo = 1; this.camX = this.VW * 0.5; this.camY = this.VH * 0.5; this.ts = 1;
    this.coinFx = []; this.pending = 0; this.xray = null; this.panK = 0;
    this.axes = []; this.hostage = null; this.hostState = 0;
        this.bats = []; this.looseShields = [];
    this.fort = null; this.dragon = null; this.fireballs = [];
  }

  /* ---------------- run (roguelite) flow: cards → route → next level; death ends the run ---------------- */

  /** a brand-new run: no cards, fresh gold. `daily`: the seeded daily challenge with its modifier */
  newRun(daily = false, startLevel = 1) {
    if (!this.demo) this.endRun('SURRENDER');
    this.level = Math.max(1, Math.round(startLevel)); this.coins = CFG.run.startGold; this.totalKills = 0; this.headshots = 0;
    // Meta training is snapshotted for the run; purchases never alter a fight halfway through.
    this.training = trainingBonuses(this.meta);
    this.metaTraining = this.training; this.resonance = branchResonance(this.meta);
    this.coins += this.training.startGold; // BEKAL PERANG: not counted as earned gold
    this.run = newRunState(CFG.reroll.freePerRun + this.training.freeRerolls);
    this.skinState = newSkinRuntime();
    this.run.startedAt = Date.now(); this.run.index = this.meta.runIndex + 1;
    this.offer = []; this.pickQueue = 0; this.rng = null; this.mods = modEffects('');
    if (daily) {
      const d = dailyInfo(new Date());
      this.rng = mulberry32(d.seed); this.run.daily = d.key; this.run.mod = d.mod; this.mods = modEffects(d.mod);
      this.toast(tx('DAILY CHALLENGE', 'TANTANGAN HARIAN'), modLabel(d.mod));
    }
    this.clearWorld(); this.makePlayer(); this.setupLevel(); this.paused = false; this.hint = this.meta.stats.runs === 0;
  }
  restart() { this.newRun(); }
  /** (the old checkpoint retry is gone: dying ends the run, so "again" is always a new run) */
  retry() { this.newRun(); }
  /** leave the title screen and start a run */
  startRun() { this.demo = false; audioDuck(1); const d = this.queueDaily; this.queueDaily = false; this.run.ended = true; this.newRun(d); }
  /** start a fresh run directly at a chosen level (e.g. Level 2 Istana Kayu Kokoh from Codex) */
  startLevelRun(lv: number) { this.demo = false; audioDuck(1); this.run.ended = true; this.newRun(false, lv); this.hint = lv === 1; }
  /** Codex practice starts on a real boss milestone, never by inserting a boss into level one. */
  startBossRun(choice: BossId | 'dragon') {
    this.queueDaily = false;
    this.startLevelRun(CFG.bigBoss.every);
    this.bigBossDue = choice !== 'dragon'; this.dragonDue = choice === 'dragon';
    this.preferredBoss = choice === 'dragon' ? undefined : choice;
    this.bannerText = `LEVEL ${this.level} / ${choice === 'dragon' ? tx('RED DRAGON BOSS!', 'BOS NAGA MERAH!') : tx('BIG BOSS!', 'BOS BESAR!')}`;
    this.emitUi();
  }
  /** back to the self-playing title screen (a run left this way still banks its gold) */
  toDemo() {
    if (!this.demo) this.endRun('QUIT');
    this.demo = true; audioDuck(0.3);
    this.coins = 0; this.totalKills = 0; this.headshots = 0; this.run = newRunState(0); this.rng = null; this.mods = modEffects('');
    this.skinState = newSkinRuntime();
    this.offer = [];
    this.clearWorld(); this.makePlayer(); this.setupDemo(); this.paused = false;
  }

  /** the run is over: stats, meta gold (a share of what was earned), daily score, unlocks, telemetry */
  private endRun(cause: string) {
    const r = this.run;
    if (this.demo || r.ended || !r.startedAt) return;
    r.ended = true;
    const M = this.meta; const st = M.stats;
    st.runs++;
    if (cause === 'DEAD') { st.deaths++; M.diedTo[r.killedBy] = (M.diedTo[r.killedBy] ?? 0) + 1; }
    r.metaGain = Math.floor(r.goldEarned * CFG.death.metaCarry);
    M.coins += r.metaGain; st.coinsEarned += r.goldEarned;
    const dur = Math.round((Date.now() - r.startedAt) / 1000); st.playSec += dur; M.runIndex = Math.max(M.runIndex, r.index);
    if (r.daily) addDaily(M, { date: r.daily, mod: r.mod, score: dailyScore(this.level, this.totalKills, this.headshots), level: this.level, kills: this.totalKills, at: Date.now() });
    this.checkUnlocks();
    logRun({
      run: r.index, date: new Date().toISOString(), session: SESSION.id, sessionSec: Math.round((Date.now() - SESSION.start) / 1000),
      level: this.level, cause: cause === 'DEAD' ? r.killedBy : cause, picked: r.picked.join(' '), rejected: r.rejected.join(' '),
      durSec: dur, rerolls: r.rerolls, unlocks: r.unlocks.join(' '), daily: r.daily ? `${r.daily}:${r.mod}` : '', gold: r.goldEarned,
    });
    saveMeta(M); this.metaRev++;
  }

  private checkUnlocks() {
    if (this.demo) return;
    const fresh = evaluateUnlocks(this.meta);
    for (const u of fresh) { this.toast(tx(`UNLOCKED: ${unlockName(u)}`, `TERBUKA: ${unlockName(u)}`), unlockLabel(u)); this.run.unlocks.push(u.id); snd.buy(); }
    if (fresh.length) { saveMeta(this.meta); this.metaRev++; }
  }
  private toast(title: string, sub: string) {
    this.toastQ.push({ id: ++this.toastId, title, sub, t: 3.4 });
    if (this.toastQ.length > 4) this.toastQ.shift();
  }

  /** level won: the card pick (after a big boss: Panah Ganda + a bonus pick first) */
  private openShop() {
    this.stage = 'shop'; this.drag.on = false;
    const boss = this.run.bossPending > 0;
    if (boss) { this.run.bossPending = 0; this.applyCard('ganda'); this.toast(tx('BIG BOSS REWARD', 'HADIAH BOS BESAR'), tx('DOUBLE ARROW + BONUS CARD', 'PANAH GANDA + KARTU BONUS')); }
    this.pickQueue = boss ? CFG.bigBoss.bonusPicks : 0;
    this.openPick(boss ? tx('BIG BOSS REWARD!', 'HADIAH BOS BESAR!') : tx(`LEVEL ${this.level} CLEARED!`, `LEVEL ${this.level} SELESAI!`));
  }
  private cardOk = (id: CardId) => cardUnlocked(this.meta, id);
  private openPick(title: string, avoid: CardId[] = []) {
    const pf = this.player;
    this.offer = rollOffer(this.srand, this.run, this.cardOk, { avoid, resonance: this.resonance, hpRatio: pf.maxHp ? pf.hp / pf.maxHp : 1 });
    this.pickTitle = title;
  }
  /** take one of the offered cards (the other two are logged as rejected) */
  pickCard(id: CardId) {
    if ((this.stage !== 'shop' && this.stage !== 'chest') || !this.offer.includes(id)) return;
    for (const o of this.offer) if (o !== id) this.run.rejected.push(`${o}@${this.level}`);
    this.run.picked.push(`${id}@${this.level}`);
    this.applyCard(id);
    if (this.stage === 'shop' && this.pickQueue > 0) { this.pickQueue--; this.openPick(tx(`LEVEL ${this.level} CLEARED!`, `LEVEL ${this.level} SELESAI!`)); return; }
    const chest = this.stage === 'chest';
    this.offer = []; this.toRoute(chest);
  }
  /** nothing left to offer (every card maxed): move on */
  skipPick() {
    if (this.stage !== 'shop' && this.stage !== 'chest') return;
    const chest = this.stage === 'chest';
    this.offer = []; this.pickQueue = 0; this.toRoute(chest);
  }
  reroll() {
    if ((this.stage !== 'shop' && this.stage !== 'chest') || !this.offer.length) return;
    const cost = rerollCost(this.run);
    if (this.coins < cost) { snd.deny(); return; }
    this.coins -= cost; useReroll(this.run);
    for (const o of this.offer) this.run.rejected.push(`${o}@${this.level}`);
    this.openPick(this.pickTitle, this.offer); snd.tap();
  }
  private toRoute(afterChest: boolean) { this.stage = 'route'; this.run.lastChest = afterChest; snd.open(); }
  chestCost() { return CFG.route.chestCostBase + CFG.route.chestCostPerLevel * this.level; }
  /** AMAN / BERISIKO start the next level; PETI is a paid stop without a fight (a card OR a full heal) */
  chooseRoute(r: RouteId | 'peti') {
    if (this.stage !== 'route') return;
    if (r === 'peti') {
      const c = this.chestCost();
      if (this.run.lastChest || this.coins < c) { snd.deny(); return; }
      this.coins -= c; this.stage = 'chest'; this.offer = []; snd.buy();
      return;
    }
    this.run.route = r; this.advance();
  }
  chestCard() { if (this.stage === 'chest' && !this.offer.length) this.openPick(tx('TREASURE CHEST', 'PETI HARTA')); }
  chestHeal() {
    if (this.stage !== 'chest' || this.offer.length) return;
    const pf = this.player; pf.hp = pf.maxHp; pf.hpLag = pf.hp; snd.heal();
    this.run.picked.push(`HEAL@${this.level}`); this.toRoute(true);
  }
  private advance() {
    // a fresh start: whatever was left standing in him - arrows, axes - is pulled out between levels
    this.player.stuck = []; this.player.shockT = 0; this.player.burnT = 0; this.player.poisonT = 0;
    this.level++;
    this.setupLevel();
  }
  /** (kept for old callers) */
  nextLevel() { this.chooseRoute('aman'); }

  private applyCard(id: CardId) {
    const fresh = takeCard(this.run, id);
    this.training = mergeTraining(this.metaTraining, cardBonuses(this.run, this.resonance));
    if (id === 'pedang' || id === 'j_jantung') this.refreshMaxHp();
    for (const s of fresh) {
      const syn = SYNERGIES.find((x) => synergyName(x) === s);
      this.toast(tx(`SYNERGY: ${s}`, `SINERGI: ${s}`), syn ? synergyDesc(syn) : '');
    }
    snd.buy();
  }
  private refreshMaxHp() {
    const pf = this.player; const nm = playerMaxHp(this.run, 0, this.training.hpBonus);
    pf.hp = clamp(pf.hp + (nm - pf.maxHp), 1, nm); pf.maxHp = nm; pf.hpLag = pf.hp;
  }
  /** WAKTU MELAMBAT: the active skill */
  activateSlow() {
    const lv = cardLv(this.run, 'lambat');
    if (!lv || this.run.slowCd > 0 || this.stage !== 'play' || this.paused || this.demo) { snd.deny(); return; }
    this.run.slowT = CFG.cards.lambat.dur; this.run.slowCd = lvVal(CFG.cards.lambat.cd, lv);
    this.banner = 1.4; this.bannerText = tx('SLOW TIME!', 'WAKTU MELAMBAT!'); this.bannerSub = ''; snd.xray();
  }

  /* ---------------- meta actions & DEBUG ---------------- */
  buyUnlock(id: string) { if (mBuyUnlock(this.meta, id)) { this.run.unlocks.push(id); saveMeta(this.meta); this.metaRev++; snd.buy(); } else snd.deny(); }
  buyMetaUp(k: 'hp' | 'reroll') { return this.buySkill(k === 'hp' ? 'vitality' : 'reroll'); }
  buySkill(id: SkillId): boolean {
    if (!purchaseSkill(this.meta, id)) { snd.deny(); return false; }
    saveMeta(this.meta); this.metaRev++; this.emitUi(); snd.buy();
    return true;
  }
  setSetting<K extends keyof Settings>(k: K, val: Settings[K]) { this.meta.settings[k] = val; saveMeta(this.meta); this.metaRev++; }
  setCosmetic(k: 'band' | 'trail', id: string) {
    const need = k === 'band' ? COSMETICS.band[id]?.unlock : COSMETICS.trail[id]?.unlock;
    if (need === undefined || !isUnlocked(this.meta, need)) { snd.deny(); return; }
    this.meta.cos[k] = id; saveMeta(this.meta); this.metaRev++; snd.tap();
  }
  exportCsv() { return toCsv(readLogs()); }
  bowOk(b: BowId) { return bowUnlocked(this.meta, b); }
  headOk(h: HeadStyle) { return hatUnlocked(this.meta, h); }
  resetSave() { this.meta = newMeta(); saveMeta(this.meta); clearLogs(); this.bow = 'wood'; this.head = 'band'; this.metaRev++; }
  debugCard(id: CardId) { if (!this.demo) this.applyCard(id); }
  debugLevel(L: number) { if (this.demo) return; this.level = Math.max(1, Math.round(L)); this.offer = []; this.clearWorld(); this.makePlayer(); this.setupLevel(); }
  debugBoss(big: boolean) {
    if (this.stage !== 'play' || this.demo) return;
    if (!isBossLevel(this.level)) this.debugLevel(nextBossLevel(this.level));
    this.bigBossDue = big; this.dragonDue = false;
    this.total++; this.spawnEnemy('axer', undefined, true);
  }
  debugGold(n: number) { this.coins += n; }
  debugMeta(n: number) { this.meta.coins += n; saveMeta(this.meta); this.metaRev++; }
  debugUnlockAll() { for (const u of UNLOCKS) if (!this.meta.unlocked.includes(u.id)) this.meta.unlocked.push(u.id); saveMeta(this.meta); this.metaRev++; }
  debugClear() {
    if (this.stage !== 'play' || this.demo) return;
    for (const f of this.foes) if (f.k.alive) this.die(f, false);
    for (const b of this.bats) if (b.state !== 'dead') { b.state = 'dead'; b.hp = 0; b.deadT = 0; }
    if (this.hostState === 1) this.hostState = 2;
    this.kills = this.total;
    if (this.stage === 'play') this.beginClear(null);
  }

  setPaused(p: boolean) { this.paused = p; if (p) this.drag.on = false; }

  /* ---------------- input ---------------- */

  pointerDown(x: number, y: number) {
    audioInit();
    if (this.paused || this.stage === 'shop' || this.stage === 'route' || this.stage === 'chest' || this.stage === 'dead' || this.stage === 'dying') return;
    this.drag = { on: true, sx: x, sy: y, x, y };
  }
  pointerMove(x: number, y: number) { if (this.drag.on) { this.drag.x = x; this.drag.y = y; } }
  pointerUp() {
    if (!this.drag.on) return;
    this.drag.on = false;
    const k = this.player.k;
    if (k.alive && onString(k) && k.pull > 0.12 && !this.paused) this.fire(this.player);
  }
  pointerCancel() { this.drag.on = false; }

  /* ---------------- coins ---------------- */

  /** where the HUD Coin Icon sits (CSS px) — coins tuck directly behind the Coin Icon */
  private purse(): V { return this.w >= 640 ? v(36, 36) : v(26, 24); }
  /** a point in the world → CSS px on screen, through the current zoom */
  private toScreen(p: V): V {
    const [ck, cx0, cy0] = this.camTf();
    return v(p.x * ck + cx0, p.y * ck + cy0);
  }
  /**
   * The camera: scale and offset (CSS px).
   * In normal/long-range play (`zoom <= 1`), it frames the span from the player's ground to the furthest active enemy ground
   * by centering `camX, camY` at mid-screen. When zooming in (`zoom > 1` or headshot `X-ray`), it zooms about `this.focus`.
   */
  private camTf(): [number, number, number] {
    const k = this.sc * this.zoom;
    if (this.show) return [k, this.w * 0.5 - this.camX * k, this.h * 0.5 - this.camY * k]; // the codex stage: simply centred
    const F = this.focus;
    const baseCx = this.w * 0.5 - this.camX * k;
    const baseCy = this.h * 0.5 - this.camY * k;
    const focusScreenX = F.x * this.sc + (this.w * 0.5 - F.x * this.sc) * this.panK;
    const focusScreenY = F.y * this.sc + (this.h * 0.5 - F.y * this.sc) * this.panK;
    const focusCx = focusScreenX - F.x * k;
    const focusCy = focusScreenY - F.y * k;
    const useFocus = clamp(Math.max(this.panK, (this.zoom - 1) * 5), 0, 1);
    return [
      k,
      baseCx + (focusCx - baseCx) * useFocus,
      baseCy + (focusCy - baseCy) * useFocus,
    ];
  }

  /** a haul of coins: they pop out big into a neat fan, hang there a beat, then stream home in single file */
  private spawnCoins(at: V, total: number, screen = false): number {
    if (this.demo || total <= 0) return 0;
    // route / KONTRAK EMAS multiplier; everything paid in a run counts toward the meta share at the end
    total = Math.max(1, Math.round(total * this.goldMult)); this.run.goldEarned += total;
    const n = Math.min(total, clamp(Math.round(total / 1.5), 4, 10));
    this.coins += total; this.pending += total;
    const hold = this.xray && this.xray.full ? this.xray.dur - this.xray.t + 0.12 : 0;
    const outer = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      const row = i < outer ? 0 : 1; const cnt = row ? n - outer : outer; const j = row ? i - outer : i;
      const ang = -Math.PI / 2 + (j - (cnt - 1) / 2) * (row ? 0.86 : 0.44);
      const R = row ? 38 : 74;
      this.coinFx.push({
        x: 0, y: 0, ox: 0, oy: 0, slx: Math.cos(ang) * R, sly: Math.sin(ang) * R, t: -hold, i, n, sc: 0, fly: -1, sx: 0, sy: 0, cx: 0, cy: 0,
        val: Math.floor(total / n) + (i < total % n ? 1 : 0), spin: i * 0.7, trail: [], done: false, born: false,
        from: screen ? null : { ...at }, at: screen ? { ...at } : null,
      });
    }
    return total;
  }

  private stepCoins(dt: number) {
    this.hudFlash = Math.max(0, this.hudFlash - dt * 3.8);
    if (!this.coinFx.length) return;
    const tgt = this.purse();
    for (const c of this.coinFx) {
      c.t += dt;
      if (c.t < 0) continue;
      if (!c.born) {
        c.born = true;
        const o = c.from ? this.toScreen(c.from) : (c.at as V);
        c.ox = clamp(o.x, 84, this.w - 84); c.oy = clamp(o.y - 8, 100, this.h - 30);
        c.x = c.ox; c.y = c.oy;
      }
      const lt = c.t - c.i * 0.035;
      if (lt < 0) continue;
      if (lt - dt < 0) snd.coinTick(c.i);
      c.spin += dt * (c.fly < 0 ? 7.5 : 11.5);
      const depart = c.n * 0.035 + 0.48 + c.i * 0.068;
      if (c.t < depart) {
        const u = Math.min(1, lt / 0.34); const e = ease.outBack(u);
        c.x = c.ox + c.slx * e;
        c.y = c.oy + c.sly * e + (u >= 1 ? Math.sin(c.t * 6.5 - c.i * 0.7) * 2.5 : 0);
        c.sc = 1.65 * Math.min(1.08, 0.18 + e * 0.9);
        continue;
      }
      if (c.fly < 0) {
        // Curve smoothly toward the left/bottom of the HUD Coin Icon so it tucks directly BEHIND the coin icon
        // without crossing over the score digits
        c.fly = 0; c.sx = c.x; c.sy = c.y;
        c.cx = tgt.x + (c.sx - tgt.x) * 0.24;
        c.cy = Math.max(tgt.y + 42, (c.sy + tgt.y) * 0.54 - Math.min(75, Math.abs(c.sx - tgt.x) * 0.08));
      }
      c.fly = Math.min(1, c.fly + dt / 0.64);
      // Ultra-smooth C1 cubic/quintic blend: gentle liftoff, smooth glide, soft arrival
      const u = c.fly;
      const smoothStep = u * u * (3 - 2 * u);
      const e = 0.55 * smoothStep + 0.45 * (u * u);
      const m = 1 - e;
      const nx = m * m * c.sx + 2 * m * e * c.cx + e * e * tgt.x;
      const ny = m * m * c.sy + 2 * m * e * c.cy + e * e * tgt.y;
      if (Math.hypot(nx - c.x, ny - c.y) > 1.2) {
        c.trail.push(v(c.x, c.y));
        if (c.trail.length > 14) c.trail.shift();
      }
      c.x = nx; c.y = ny;
      // Keep coin large and plump all the way to the HUD Coin Icon (no tiny shrinking!)
      c.sc = 1.65 - 0.16 * e;
      if (c.fly >= 1) {
        c.done = true;
        this.pending = Math.max(0, this.pending - c.val); this.bumpN++; this.hudFlash = 1;
        snd.coin(this.coinSeq++);
      }
    }
    this.coinFx = this.coinFx.filter((c) => !c.done);
    if (!this.coinFx.length) { snd.coinEnd(this.coinSeq - 1); this.coinSeq = 0; this.pending = 0; }
  }

  private drawCoins(ctx: Ctx) {
    const gold = this.goldSpr;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // PASS 1 (BACK LAYER — strictly behind the coin images):
    // Draw the purse landing ring, golden glow halos, and smooth tapered light ribbons first!
    if (this.hudFlash > 0.01) {
      const tgt = this.purse(); const u = 1 - this.hudFlash;
      if (gold) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.hudFlash * 0.55;
        const gr = 28 + u * 18;
        ctx.drawImage(gold as unknown as CanvasImageSource, tgt.x - gr, tgt.y - gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.strokeStyle = '#ffe27a';
      ctx.globalAlpha = this.hudFlash * 0.85; ctx.lineWidth = 2.8 * this.hudFlash + 0.8;
      ctx.beginPath(); ctx.arc(tgt.x, tgt.y, 13 + u * 18, 0, Math.PI * 2); ctx.stroke();
    }

    for (const c of this.coinFx) {
      if (!c.born || c.t - c.i * 0.035 < 0) continue;
      const r = 7.5 * c.sc;
      // Smooth quadratic ribbon trail behind the coin
      if (c.trail.length > 1) {
        for (let i = 1; i < c.trail.length; i++) {
          const u = i / c.trail.length;
          ctx.strokeStyle = '#ffe27a';
          ctx.globalAlpha = u * u * 0.55;
          ctx.lineWidth = r * 0.88 * u;
          ctx.beginPath();
          ctx.moveTo(c.trail[i - 1].x, c.trail[i - 1].y);
          ctx.lineTo(c.trail[i].x, c.trail[i].y);
          ctx.stroke();
        }
      }
      // Soft golden halo in the back layer behind the coin face
      if (gold) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.42;
        ctx.drawImage(gold as unknown as CanvasImageSource, c.x - r * 2.1, c.y - r * 2.1, r * 4.2, r * 4.2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // PASS 2 (FRONT LAYER — the crisp spinning gold coin images themselves):
    for (const c of this.coinFx) {
      if (!c.born || c.t - c.i * 0.035 < 0) continue;
      const r = 7.5 * c.sc;
      ctx.globalAlpha = 1;
      const wx = c.fly < 0 ? 0.84 + 0.16 * Math.cos(c.spin) : 0.25 + 0.75 * Math.abs(Math.cos(c.spin));
      ctx.fillStyle = '#9a6200'; ctx.beginPath(); ctx.ellipse(c.x, c.y + r * 0.1, r * wx + r * 0.16, r * 1.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffc933'; ctx.beginPath(); ctx.ellipse(c.x, c.y, r * wx + r * 0.07, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e39a00'; ctx.lineWidth = Math.max(0.8, r * 0.13);
      ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(0.4, r * wx * 0.68), r * 0.68, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e39a00'; ctx.fillRect(c.x - r * 0.12 * wx, c.y - r * 0.4, r * 0.24 * wx, r * 0.8);
      ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.ellipse(c.x - r * wx * 0.34, c.y - r * 0.4, Math.max(0.3, r * wx * 0.2), r * 0.17, -0.5, 0, Math.PI * 2); ctx.fill();
      const tw = Math.max(0, Math.sin(c.t * 8 + c.i * 2.1)) ** 6;
      if (tw > 0.05) {
        const gx = c.x + r * 0.5; const gy = c.y - r * 0.55; const gl = r * 0.65 * tw;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.3; ctx.globalAlpha = tw;
        ctx.beginPath(); ctx.moveTo(gx - gl, gy); ctx.lineTo(gx + gl, gy); ctx.moveTo(gx, gy - gl); ctx.lineTo(gx, gy + gl); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- the prisoner ---------------- */

  /** some rounds a prisoner stands tied on a ground of his own, leashed to a peg above: cut the rope, not him */
  private spawnHostage() {
    const plat: Plat = {
      x: 0, y: 0, w: 58, h: 28, fx: 0.4 + rand() * 0.11, fy: -0.15 + rand() * 0.6, rise: 0, state: 'rise', phase: rand() * 6.28,
      amp: 6, sway: 0, sinkT: 0, off: 0, vel: 0,
    };
    this.placePlat(plat);
    this.plats.push(plat);
    this.hostage = {
      k: makeStick(v(plat.x, plat.y), -1, 1, false, true, 'hostage'), kind: 'hostage', team: 0,
      lvl: 1, hp: 1, maxHp: 1, hpLag: 1, hpLagHold: 0, barBump: 0,
      helm: false, plat, stuck: [],
      vib: 9, hpShow: 0, flash: 0, deadT: 0, dmg: 0, pitch: 1.3,
      ai: { state: 'wait', t: 0, aim: 0, pull: 0, drawT: 1, spread: 0, floor: 0 },
      shockT: 0, burnT: 0, poisonT: 0, dotTick: 0,
    };
    this.hostState = 1; this.freeT = 0;
  }
  /** the taut stretch of rope you have to hit: from the peg down to just above his head */
  private rope(hs: Fighter): [V, V] {
    return [v(hs.plat.x, hs.plat.y - 176), v(hs.k.p[0].x, hs.k.p[0].y - HEAD_R - 3)];
  }

  private freeHostage(at: V) {
    const hs = this.hostage;
    if (!hs || this.hostState !== 1) return;
    const k = hs.k; const pan = this.pan(at.x);
    this.hostState = 2; this.freeT = 0;
    this.burst(at, v(0, -1), 9, '#e3c283', 170);
    for (let i = 0; i < 8; i++) this.parts.push({ p: lerpV(k.p[2], k.p[1], 0.3 + rand() * 0.4), vel: v((rand() - 0.5) * 220, -60 - rand() * 120), life: 0, max: 0.7 + rand() * 0.3, r: 2.2, col: '#e3c283', grav: 900 });
    this.parts.push({ p: { ...at }, vel: v(0, 0), life: 0, max: 0.25, r: 20, col: '#ffe9b0', grav: 0, kind: 'ring' });
    snd.ropeSnap(pan); snd.yay(pan); snd.heal();
    this.say(k.p[0].x, k.p[0].y - 64, tx('FREED! THANK YOU!', 'BEBAS!  TERIMA KASIH!'), '#7dffa0', 19, 1.7);
    this.spawnCoins(k.p[1], CFG.rewards.hostage);
    const pf = this.player; pf.hp = Math.min(pf.maxHp, pf.hp + CFG.rewards.hostageHeal);
    if (!this.demo) { this.meta.stats.hostages++; this.checkUnlocks(); }
    this.lvHits++; this.combo++;
    if (this.kills >= this.total) this.beginClear(null);
  }

  /** you shot the man you were meant to save */
  private hostageHit(a: Arrow, hs: Fighter, hit: { stick: number; u: number }) {
    const k = hs.k; const pan = this.pan(a.p.x);
    this.lodge(a, hs, hit);
    a.dead = true;
    punchRag(k as unknown as ArcherRag, hit.stick, hit.u, a.vel, false);
    k.muscle = Math.min(k.muscle, 0.5); k.hurt = 1; k.hurtDir = Math.sign(a.vel.x) || 1; k.wound = { stick: hit.stick, u: hit.u };
    hs.flash = 1; hs.plat.vel += 70;
    this.burst(a.p, mul(a.vel, -1), 6, '#d3141f', 200);
    this.hitStop = 0.04; this.shake = Math.max(this.shake, 5);
    snd.hit(pan, false); snd.grunt(pan, hs.pitch); snd.deny();
    this.coins = Math.max(0, this.coins - CFG.rewards.hostagePenalty); this.combo = 0;
    this.say(k.p[0].x, k.p[0].y - 56, tx(`DON'T SHOOT THE HOSTAGE! -${CFG.rewards.hostagePenalty}`, `JANGAN TEMBAK TAWANAN!  -${CFG.rewards.hostagePenalty}`), '#ff6b6b', 16, 1.5);
  }

  private drawHostage(ctx: Ctx) {
    const hs = this.hostage;
    if (!hs) return;
    const k = hs.k; const th = this.theme; const pl = hs.plat;
    const al = pl.state === 'on' ? 1 : clamp(pl.rise * 1.5, 0, 1);
    const [top, bot] = this.rope(hs);
    ctx.globalAlpha = al;
    // the peg: a chip of floating rock with an iron ring under it
    ctx.fillStyle = th.plat; ctx.fillRect(top.x - 14, top.y - 14, 28, 12);
    ctx.fillStyle = th.platTop; ctx.fillRect(top.x - 14, top.y - 14, 28, 3);
    ctx.strokeStyle = '#9fb4bb'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(top.x, top.y + 2, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.lineCap = 'round';
    const rope = (a: V, b: V, sag: number) => {
      for (const [col, lw] of [['#8a6a34', 4.2], ['#e3c283', 2.4]] as [string, number][]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2 + sag, (a.y + b.y) / 2, b.x, b.y); ctx.stroke();
      }
    };
    if (this.hostState === 1) {
      rope(v(top.x, top.y + 5), k.p[1], Math.sin(this.t * 2.1) * 2.5);
      // a ring on the rope: this is the place to hit
      const m = lerpV(top, bot, 0.52); const pu = 0.5 + 0.5 * Math.sin(this.rt * 5);
      ctx.strokeStyle = '#ffe27a'; ctx.globalAlpha = al * (0.45 + 0.5 * pu); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m.x, m.y, 10 + pu * 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m.x - 17 - pu * 4, m.y); ctx.lineTo(m.x - 11, m.y); ctx.moveTo(m.x + 11, m.y); ctx.lineTo(m.x + 17 + pu * 4, m.y); ctx.stroke();
      ctx.globalAlpha = al;
    } else {
      // what is left of it swings from the peg
      const sw = Math.sin(this.freeT * 9) * 9 * Math.exp(-this.freeT * 1.4);
      rope(v(top.x, top.y + 5), v(top.x + sw, top.y + 34), sw * 0.5);
    }
    this.drawFighter(ctx, hs);
    if (this.hostState === 1 && pl.state === 'on' && Math.sin(this.rt * 1.6 + 1) > -0.2) {
      this.text(ctx, tx('HELP!', 'TOLONG!'), k.p[0].x + 44, k.p[0].y - 26 + Math.sin(this.rt * 9) * 1.5, 13, '#ffffff', 0.95);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- the axe boss ---------------- */

  /** Hurls the Boss's unique signature weapon (`bossKind`); it lands and EMBEDS (`nancep`) unless shot down in mid-air */
  private throwAxe(f: Fighter) {
    const k = f.k; const pk = this.player.k;
    const from = { ...k.p[4] }; const to = lerpV(pk.p[1], pk.p[2], 0.3);
    const T = 1.62 + rand() * 0.28; const g = 620; // slow enough to answer with an arrow
    const bk: BossId = f.bossKind ?? 'axer';
    const initVel = v((to.x - from.x) / T, (to.y - from.y) / T - 0.5 * g * T);
    // Zeus's Thunderbolt Trident flies point-first like a javelin (`vr = 0`), while the Axe, Greatsword, Scythe & Morning-Star spin!
    const vr = bk === 'thunder_lord' ? 0 : bk === 'thorn_warden' ? -k.face * 15 : -k.face * 12;
    this.axes.push({
      p: from, vel: initVel,
      ang: Math.atan2(initVel.y, initVel.x), vr, s: 1.38, dmg: f.dmg * 1.4,
      spent: false, life: 0, dead: false, bossKind: bk, stuckIn: null, ox: 0, oy: 0,
    });
    impulse(k, 4, v(k.face * 260, -40)); impulse(k, 1, v(k.face * 90, 0)); impulse(k, 0, v(k.face * 120, 20));
    k.muscle = Math.min(k.muscle, 0.6); k.exert = Math.min(1, k.exert + 0.4);
    k.pull = 0; k.nock = 0; f.plat.vel += 40;
    snd.throwAxe(this.pan(from.x), f.pitch);
    const shout =
      bk === 'thunder_lord' ? tx('⚡ CATCH LIGHTNING TRIDENT!', '⚡ TERIMA TRISULA PETIR!')
      : bk === 'inferno_king' ? tx('🔥 MAGMA DEMON SWORD!', '🔥 PEDANG IBLIS MAGMA!')
      : bk === 'xeno_queen' ? tx('🧪 XENO TAIL SCYTHE!', '🧪 SABIT EKOR XENO!')
      : bk === 'thorn_warden' ? tx('🌿 THORN MORNING STAR!', '🌿 GADA BINTANG DURI!')
      : tx('🪓 CATCH VIKING AXE!', '🪓 TERIMA KAPAK VIKING!');
    const sCol =
      bk === 'thunder_lord' ? '#5cf4ff'
      : bk === 'inferno_king' ? '#ff942e'
      : bk === 'xeno_queen' ? '#d4ff00'
      : bk === 'thorn_warden' ? '#8eff3b'
      : '#ff8a47';
    if (!this.demo) this.say(k.p[0].x, k.p[0].y - 68 * k.s, shout, sCol, 16, 1.0);
  }

  private parry(ax: Axe, a: Arrow) {
    if (ax.dead || a.dead) return;
    ax.dead = true; a.dead = true;
    const pan = this.pan(ax.p.x);
    this.burst(ax.p, a.vel, 14, '#dbe8ec', 360);
    this.burst(ax.p, v(0, -1), 9, '#7a4a2a', 240);
    this.parts.push({ p: { ...ax.p }, vel: v(0, 0), life: 0, max: 0.28, r: 42, col: '#ffffff', grav: 0, kind: 'ring' });
    this.hitStop = 0.06; this.slowT = 0.32; this.slowK = 0.28;
    this.shake = Math.max(this.shake, 9);
    snd.parry(pan);

    // Elemental impact when shooting the Boss's weapon mid-air
    if (a.bow === 'thunder') this.triggerThunderHit(ax.p, a.ang, null, null, pan);
    else if (a.bow === 'fire') this.triggerFireHit(ax.p, a.ang, null, null, pan);
    else if (a.bow === 'spike') this.triggerSpikeHit(ax.p, a.ang, null, pan);
    else if (a.bow === 'poison') this.triggerPoisonHit(ax.p, a.ang, null, null, pan);

    const wName = bossWeaponLabel(ax.bossKind);
    const perk = skinParry(a.skin?.id);
    const got = this.spawnCoins(ax.p, CFG.rewards.parry * perk.gold);
    if (!this.demo && perk.heal && this.player.k.alive) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + perk.heal);
      this.skinNotice(a.skin!.id, tx(`PARRY! +${perk.heal} HP`, `TANGKIS! +${perk.heal} HP`)); snd.heal();
    }
    this.say(ax.p.x, ax.p.y - 28, tx(`${wName} DESTROYED! +${got}`, `${wName} HANCUR! +${got}`), '#ffe24a', 21, 1.25);
    this.lvHits++; this.combo++;
  }

  /**
   * Lodge the Boss's thrown weapon (`ax`) deeply into the bone `hit.stick` at `hit.u` so it stays embedded (`nancep`)
   * and moves with the ragdoll instead of bouncing off!
   */
  private lodgeAxe(ax: Axe, f: Fighter, hit: { stick: number; u: number }): V {
    const k = f.k;
    const [ia, ib] = RAG_STICKS[hit.stick];
    const A = k.p[ia]; const B = k.p[ib];
    const tip = hit.stick === 0 ? lerpV(k.p[1], k.p[0], 0.85) : lerpV(A, B, hit.u);
    const ba = Math.atan2(B.y - A.y, B.x - A.x);
    const rx = tip.x - A.x; const ry = tip.y - A.y; const c = Math.cos(-ba); const sn = Math.sin(-ba);
    const flightAng = Math.atan2(ax.vel.y, ax.vel.x);
    const embedAng = bossEmbedAng(ax.bossKind, flightAng);
    const bowElem = bossBowOf(ax.bossKind);
    const fxDur = bowElem === 'wood' ? 0 : 2.2;
    f.stuck.push({
      stick: hit.stick, u: hit.u,
      lx: rx * c - ry * sn, ly: rx * sn + ry * c,
      rel: embedAng - ba,
      bow: bowElem, fxT: fxDur,
      isAxe: true, bossKind: ax.bossKind, s: ax.s * 0.92,
    });
    if (f.stuck.length > 7) f.stuck.shift();
    return tip;
  }

  private axeHit(ax: Axe, hit: { stick: number; u: number }) {
    const pf = this.player; const k = pf.k; const pan = this.pan(ax.p.x);
    if (!this.demo && this.shieldTry(ax.p)) { ax.dead = true; return; }
    this.run.killedBy = tx(`${bossWeaponLabel(ax.bossKind)} BOSS`, `${bossWeaponLabel(ax.bossKind)} BOS`);
    const tip = this.lodgeAxe(ax, pf, hit);
    ax.dead = true; // The Boss weapon is now embedded (`nancep`) inside `pf.stuck`, NOT bouncing away!

    const flightAng = Math.atan2(ax.vel.y, ax.vel.x);
    const bowElem = bossBowOf(ax.bossKind);
    if (bowElem === 'thunder') this.triggerThunderHit(tip, flightAng, pf, hit, pan);
    else if (bowElem === 'fire') this.triggerFireHit(tip, flightAng, pf, hit, pan);
    else if (bowElem === 'poison') this.triggerPoisonHit(tip, flightAng, pf, hit, pan);
    else if (bowElem === 'spike') this.triggerSpikeHit(tip, flightAng, pf, pan, hit.stick === 0);

    const dmg = Math.max(1, Math.round(ax.dmg * (this.demo ? 1 : (1 - this.training.dmgReduce) * skinIncomingMult(this.head, hit.stick === 0))));
    pf.hpLag = Math.max(pf.hpLag, pf.hp);
    pf.hpLagHold = 0.28;
    pf.barBump = 1;
    pf.hp -= dmg; pf.flash = 1; this.lvHurt += dmg;
    if (this.demo) pf.hp = Math.max(pf.hp, 20); // the title screen fights on forever: nothing there is ever fatal to him
    const fatal = pf.hp <= 0;
    punchRag(k as unknown as ArcherRag, hit.stick, hit.u, mul(ax.vel, 2.2), fatal);
    k.muscle = Math.min(k.muscle, 0.3); k.hurt = 1; k.hurtDir = Math.sign(ax.vel.x) || -1; k.wound = { stick: hit.stick, u: hit.u }; k.exert = 1;
    pf.plat.vel += 140;
    this.burst(tip, mul(ax.vel, -1), 14, '#d3141f', 320);
    this.parts.push({ p: { ...tip }, vel: v(0, 0), life: 0, max: 0.24, r: 30, col: '#ffffff', grav: 0, kind: 'ring' });
    this.hitStop = 0.08; this.shake = Math.max(this.shake, 13); this.hurt = 1;
    snd.hit(pan, true);
    if (!fatal) snd.grunt(pan, pf.pitch);
    const wName = bossWeaponLabel(ax.bossKind);
    this.say(k.p[0].x, k.p[0].y - 52, tx(`${wName} EMBEDDED! -${dmg}`, `${wName} NANCEP! -${dmg}`), '#ff6b6b', 20);
    if (fatal) this.die(pf, false);
  }

  /** the round is won: every enemy down and nobody left tied up */
  private beginClear(focus: V | null) {
    this.stage = 'clear'; this.clearT = 0; this.drag.on = false;
    if (focus) { this.zoomTo = 1.13; if (!(this.xray && this.xray.full)) this.focus = { ...focus }; }
    const pk = this.player.k;
    pk.victory = 0;
    pk.victoryStyle = (this.level - 1) % 3;
    pk.hurt = 0; pk.clutch = 0; pk.wound = null; pk.react = 'none';
    pk.pull = 0; pk.aiming = 0;
    if (!this.demo) { this.meta.stats.bestLevel = Math.max(this.meta.stats.bestLevel, this.level); this.checkUnlocks(); saveMeta(this.meta); }
    const acc = this.lvHits / Math.max(1, this.lvShots);
    this.stars = 1 + (acc >= 0.5 ? 1 : 0) + (this.lvHurt <= this.player.maxHp * 0.35 ? 1 : 0);
    snd.win();
  }

  /* ---------------- spawning ---------------- */

  private canSummonBoss(): boolean {
    if (this.demo || this.stage !== 'play') return false;
    if (!isBossLevel(this.level)) {
      this.toast(tx(`BOSS EVERY ${CFG.bigBoss.every} LEVELS`, `BOS HANYA SETIAP ${CFG.bigBoss.every} LEVEL`), tx(`NEXT BOSS: LEVEL ${nextBossLevel(this.level)}`, `BOS BERIKUTNYA: LEVEL ${nextBossLevel(this.level)}`));
      this.emitUi();
      return false;
    }
    if (this.bossSpawned) {
      this.toast(tx('LEVEL BOSS ALREADY SPAWNED', 'BOS LEVEL INI SUDAH MUNCUL'), tx(`NEXT BOSS: LEVEL ${nextBossLevel(this.level)}`, `BOS BERIKUTNYA: LEVEL ${nextBossLevel(this.level)}`));
      this.emitUi();
      return false;
    }
    return true;
  }

  /** Consume the reserved boss slot, without increasing the level's enemy quota. */
  spawnAxeBossNow(bossKind?: BossId) {
    if (!this.canSummonBoss()) return false;
    this.bigBossDue = true; this.dragonDue = false;
    return this.spawnEnemy('axer', bossKind);
  }

  private spawnEnemy(forceKind?: Kind, forceBoss?: BossId, debugSpawn = false) {
    const L = this.level;
    const rand = this.srand; // seeded in the daily challenge: same enemies for everyone that day
    if (!this.demo && (forceKind === 'axer' || forceKind === 'boss') && (!isBossLevel(L) || (this.bossSpawned && !debugSpawn))) return false;
    if (!forceKind && !this.demo) {
      // the set pieces come first on their levels: the wooden fort with its guards, or the dragon with its rider
      if (this.fortDue && this.total - this.batTotal - this.spawned >= 2) { this.fortDue = false; this.spawnFort(); return; }
      if (this.dragonDue) { this.spawnDragon(); return; }
    }
    const boss = !this.demo && isBossLevel(L) && this.bigBossDue && !this.bossSpawned;
    const r = rand();
    // every level fields a shield bearer: the second man up is always one, and from level 2 more may follow
    const wantShield = !this.demo && this.spawned === 1;
    const kind: Kind =
      forceKind ? forceKind
      : boss ? 'axer'
      : wantShield ? 'shield'
      : this.demo && r < 0.32 ? 'axer'
      : this.demo && r < 0.56 ? 'shield'
      : L >= 2 && r < 0.22 ? 'shield'
      : L >= 3 && r < 0.44 ? 'heavy'
      : r < 0.7 ? 'helm'
      : 'archer';
    const big = kind === 'boss' || kind === 'axer';
    const bossKind: BossId | undefined = big ? (forceBoss ?? this.preferredBoss ?? BOSS_IDS[this.demo ? (L - 1 + this.spawned) % BOSS_IDS.length : weaponBossIndex(L, BOSS_IDS.length)]) : undefined;

    // Enemy Level (`lvl`):
    // - Level 1: Normal HP & normal archery
    // - Level 2: Veteran (thicker HP & tighter aim)
    // - Level 3+: Elite / Boss ("lebih tebal dan dia manahnya lebih jago!")
    const roll = rand();
    const foeLvl = enemyLevelFor(L, kind, roll, this.demo);

    // the big boss of every fifth level: the first weapon boss to walk on, much bigger and tougher
    const isBig = big && !this.demo && !this.show && this.bigBossDue;
    if (big && !this.demo) { this.bigBossDue = false; this.dragonDue = false; this.bossSpawned = true; this.preferredBoss = undefined; }
    const s = (isBig ? CFG.bigBoss.scale : big ? 1.45 : kind === 'heavy' ? 1.22 : kind === 'shield' ? 1.12 : foeLvl >= 3 ? 1.12 : foeLvl === 2 ? 1.05 : 1) * (this.demo ? 1 : this.mods.scale);
    // a shield bearer always stands: the whole point is the shins showing under his board
    const kneel = !big && kind !== 'shield' && rand() < 0.5;
    // Spawn distance adapts to `this.rangeMult` (1x Normal, 1.5x Medium-Far, 2x Sniper Far)!
    const rm: RangeMult = this.demo ? 1 : this.rangeMult;
    let fx = rm === 2 ? 1.42 : rm === 1.5 ? 1.08 : 0.78; let fy = 0.08;
    for (let i = 0; i < 40; i++) {
      fx = this.demo
        ? 0.74 + rand() * 0.2
        : rm === 2
          ? big ? 1.32 + rand() * 0.34 : 1.02 + rand() * 0.62
          : rm === 1.5
            ? big ? 1.02 + rand() * 0.24 : 0.76 + rand() * 0.46
            : big ? 0.68 + rand() * 0.22 : 0.5 + rand() * 0.43;
      fy = big ? -0.15 + rand() * 0.45 : rand() * 2 - 1;
      // not on top of the fort, nor under the dragon: a ground that would land there is set down in front of it instead
      const keepX = this.fort ? this.fort.base.fx * this.VW : this.dragon ? this.dragon.fx * this.VW : NaN;
      const keepR = this.fort ? 172 : 150;
      if (Math.abs(keepX - fx * this.VW) < keepR) fx = (keepX - keepR - 6 - rand() * 150) / this.VW;
      const x = fx * this.VW; const y = this.cy + fy * this.span;
      const hp = this.hostState === 1 && this.hostage ? this.hostage.plat : null;
      if (hp && Math.abs(hp.fx * this.VW - x) < 115 && y < this.cy + hp.fy * this.span) continue;
      if (!this.plats.some((p) => Math.abs(p.fx * this.VW - x) < 135 && Math.abs(this.cy + p.fy * this.span - y) < 150)) break;
    }
    // the codex stage: always the same ground, close by and level with the archer who shows how it is done
    if (this.show) { fx = (this.pPlat.x + 345) / this.VW; fy = this.pFyT; }
    const plat: Plat = {
      x: 0, y: 0, w: (kneel ? 72 : 64) * s, h: 28 * Math.min(s, 1.25), fx, fy, rise: 0, state: 'rise', phase: rand() * 6.28,
      amp: 5 + Math.min(L, 10) * 1.4, sway: L >= 4 && !big ? rand() * Math.min(L * 3, 26) : 0, sinkT: 0, off: 0, vel: 0,
    };
    this.placePlat(plat);
    this.plats.push(plat);

    // HP scales distinctly with Enemy Level (`foeLvl` 1 = normal, `foeLvl` 3 = ~2.1x thicker!)
    // formulas.ts (identical to the old inline numbers) × route / risk card / daily / Level 15+ / big boss
    const hp = Math.round(enemyHp(L, foeLvl, big) * (this.demo ? 1 : this.foeHpMult) * (isBig ? CFG.bigBoss.hpMult : 1));
    const dmg = enemyDmg(L, foeLvl, big) * (this.demo ? 1 : this.foeDmgMult) * (isBig ? CFG.bigBoss.dmgMult : 1);

    // Archery skill scales with Enemy Level (`foeLvl` 3 draws faster, aims much tighter & shoots more often!)
    const initSpread = foeLvl === 1 ? 0.22 : foeLvl === 2 ? 0.12 : Math.max(0.032, 0.055 - (foeLvl - 3) * 0.006);
    const minFloor = foeLvl === 1 ? 0.065 : foeLvl === 2 ? 0.038 : 0.018;
    const initWait = kind === 'axer' ? 1.0 + rand() * 0.5 : foeLvl >= 3 ? 1.15 + rand() * 0.65 : foeLvl === 2 ? 1.6 + rand() * 0.9 : 2.1 + rand() * 1.2;

    this.foes.push({
      k: makeStick(v(plat.x, plat.y), -1, s, kneel, big || foeLvl >= 3, kind === 'axer' ? 'thrower' : 'archer'),
      kind, bossKind, team: 1, bigBoss: isBig,
      lvl: foeLvl, hp, maxHp: hp, hpLag: hp, hpLagHold: 0, barBump: 0,
      helm: kind === 'helm' || (kind !== 'shield' && foeLvl >= 3 && !big && rand() < 0.5), plat, stuck: [],
      shield: kind === 'shield' ? this.newShield() : undefined,
      vib: 9, hpShow: 0, flash: 0, deadT: 0, dmg, pitch: big ? 0.68 : foeLvl >= 3 ? 0.78 : 0.9 + rand() * 0.2,
      ai: { state: 'wait', t: initWait, aim: Math.PI, pull: foeLvl >= 3 ? 0.92 : 0.8, drawT: foeLvl >= 3 ? 0.5 : 0.72, spread: initSpread, floor: minFloor },
      shockT: 0, burnT: 0, poisonT: 0, dotTick: 0,
    });
        // plain archers come with heads of their own now and then: a mohawk, a tied-back tail, a racing helmet
    const nf = this.foes[this.foes.length - 1];
    if (kind === 'archer' && !nf.helm) {
      const hr = rand();
      // (never the racing helmet: on an enemy it would read as armour, and it is not)
      nf.hat =
        hr < 0.11 ? 'punk'
        : hr < 0.21 ? 'sekiro'
        : hr < 0.3 ? 'guts'
        : hr < 0.39 ? 'luffy'
        : hr < 0.47 ? 'sanji'
        : hr < 0.54 ? 'cowboy'
        : hr < 0.6 ? 'robin'
        : undefined;
      if (nf.hat) nf.hair = makeHair(nf.hat, nf.k);
    }
    this.spawned++;
    snd.rise(this.pan(plat.x));
    if (!this.demo && !this.show && !this.meta.seen.includes(isBig ? 'boss' : kind)) this.meta.seen.push(isBig ? 'boss' : kind);
    if (big && !this.demo && bossKind) {
      const [bt, bs] = bossTitleOf(bossKind);
      this.banner = 2.4;
      this.bannerText = isBig ? tx(`BIG BOSS: ${bt}`, `BOS BESAR: ${bt.replace(/^BOS /, '')}`) : `MINI-${bt}`;
      this.bannerSub = isBig ? tx('GIANT HP · REWARD: DOUBLE ARROW + BONUS CARD', 'HP RAKSASA · HADIAH: PANAH GANDA + KARTU BONUS') : bs;
      if (isBig) { this.slowT = CFG.bigBoss.introSlowT; this.slowK = CFG.bigBoss.introSlowK; this.shake = Math.max(this.shake, 10); }
      snd.boss();
    }
    return true;
  }

  /* ---------------- the shield bearer ---------------- */

  private newShield(): Shield {
    const n = CFG.enemy.shieldHp + (this.level >= 4 ? 1 : 0) + (this.level >= 8 ? 1 : 0);
    return { hp: n, max: n, g: 1, gv: 0, flash: 0, kick: 0, openT: 0, told: 0, stuck: [] };
  }

  /**
   * Where his shield is right now: its centre, and how far its long axis is turned off upright (clockwise).
   * Held out (g = 1) it stands between him and you and covers him from the thighs to the eyes: only the shins and
   * the top of the head show. Whenever he needs both hands or loses his feet - shooting, down on a knee, stunned -
   * it swings up and round onto his back (g = 0) and he is wide open. It is always its full size: it only moves.
   */
  private shieldPose(f: Fighter): ShieldPose | null {
    const sh = f.shield;
    if (!sh || sh.hp <= 0) return null;
    const k = f.k; const s = k.s; const hip = k.p[2]; const chest = k.p[1]; const face = k.face; const g = sh.g;
    const lean = clamp(Math.atan2(chest.x - hip.x, hip.y - chest.y), -0.7, 0.7); // the torso's own tilt
    const front = add(lerpV(hip, chest, 0.55), v(face * 8 * s, 0));
    const back = add(lerpV(hip, chest, 0.5), v(-face * 10 * s, 2 * s));
    const swing = Math.sin(Math.PI * clamp(g, 0, 1)); // 0 at either end, 1 half-way round
    const m = lerpV(back, front, g);
    // an arrow thumping into it drives it back against him and rocks it; the ringing dies away
    const ring = Math.sin(this.t * 44) * sh.kick;
    return {
      c: v(m.x - face * (sh.kick * 5 + ring * 1.2) * s, m.y - swing * 9 * s),
      rot: lean * (0.9 - 0.35 * g) - face * 0.3 * (1 - g) + face * swing * 0.4 - face * sh.kick * 0.13 + ring * 0.05,
      s,
    };
  }

  /** is this point on his shield? Tested in the shield's own frame, against the very outline that is drawn */
  private onShield(p: V, sp: ShieldPose, pad = 2.5): boolean {
    const dx = p.x - sp.c.x; const dy = p.y - sp.c.y; const cs = Math.cos(sp.rot); const sn = Math.sin(sp.rot);
    const half = shieldHalf((-dx * sn + dy * cs) / sp.s);
    return half > 0 && Math.abs(dx * cs + dy * sn) / sp.s < half + pad;
  }

  /** an arrow met the shield: it stays standing in its face, and the shield is one blow nearer to splitting */
  private shieldBlock(a: Arrow, f: Fighter, sp: ShieldPose) {
    const sh = f.shield as Shield; const k = f.k; const pan = this.pan(a.p.x);
    if (a.maxPower) { this.breakShield(f, sp, a.vel); return; } // nothing stops that one: it flies on into him
    a.dead = true;
    const fire = a.bow === 'fire';
    sh.hp -= (fire ? 2 : 1) + (a.team === 0 && !this.demo ? lvVal(CFG.cards.tameng.extraShieldDmg, cardLv(this.run, 'tameng')) : 0); sh.flash = 1; sh.kick = 1;
    this.ricochet(a, f);
    // he takes the blow through his arms: the whole man rocks back behind it
    impulse(k, 1, mul(a.vel, 0.04)); impulse(k, 2, mul(a.vel, 0.025)); impulse(k, 0, mul(a.vel, 0.03));
    f.plat.vel += 45;
    this.burst(a.p, mul(a.vel, -1), 7, '#cfe3ea', 230);
    this.parts.push({ p: { ...a.p }, vel: v(0, 0), life: 0, max: 0.2, r: 17, col: '#ffffff', grav: 0, kind: 'ring' });
    if (a.bow === 'thunder') this.triggerThunderHit(a.p, a.ang, null, null, pan);
    else if (fire) this.triggerFireHit(a.p, a.ang, null, null, pan);
    else if (a.bow === 'poison') this.triggerPoisonHit(a.p, a.ang, null, null, pan);
    this.hitStop = 0.03; this.shake = Math.max(this.shake, 4 * (this.demo ? 0.3 : 1));
    if (!this.demo) this.lvHits++; // stopped, but not a miss
    if (sh.hp <= 0) { this.breakShield(f, sp, a.vel); return; }
    // the point drives a little way into the face before it stops
    let tip = a.p; const deep = 6 + rand() * 12;
    for (let d = 3; d <= deep; d += 3) {
      const q = add(a.p, fromAngle(a.ang, d));
      if (!this.onShield(q, sp, -3)) break;
      tip = q;
    }
    const dx = tip.x - sp.c.x; const dy = tip.y - sp.c.y; const cs = Math.cos(sp.rot); const sn = Math.sin(sp.rot);
    sh.stuck.push({ x: (dx * cs + dy * sn) / sp.s, y: (-dx * sn + dy * cs) / sp.s, rel: a.ang - sp.rot, bow: a.bow });
    if (sh.stuck.length > 5) sh.stuck.shift();
    snd.shieldBlock(pan);
    const hx = k.p[0].x; const hy = k.p[0].y - (HEAD_R + 24) * k.s;
    this.say(hx, hy, fire ? tx(`🔥 SHIELD BURNING!  ${sh.hp}/${sh.max}`, `🔥 PERISAI TERBAKAR!  ${sh.hp}/${sh.max}`) : tx(`BLOCKED!  SHIELD ${sh.hp}/${sh.max}`, `DITANGKIS!  PERISAI ${sh.hp}/${sh.max}`), '#cfe3ea', 16, 1.0);
    if (sh.told < 2 && sh.g > 0.6) { sh.told++; this.say(hx, hy - 22, tx('SHOOT HIS LEGS!', 'PANAH KAKINYA!'), '#ffe24a', 17, 1.5); }
  }

  /** the shield gives way: splinters everywhere, and the man behind it left staggering in the open */
  private breakShield(f: Fighter, sp: ShieldPose, vel: V) {
    const sh = f.shield as Shield; const k = f.k; const pan = this.pan(sp.c.x);
    sh.hp = 0; sh.stuck = [];
    const up = fromAngle(sp.rot - Math.PI / 2, SHIELD_HH * sp.s);
    for (const [u, col] of [[0.65, '#93a8b1'], [0.2, '#e5352f'], [-0.25, '#1b262c'], [-0.7, '#cfe3ea']] as [number, string][]) {
      this.burst(add(sp.c, mul(up, u)), vel, 7, col, 330);
    }
    this.parts.push({ p: { ...sp.c }, vel: v(0, 0), life: 0, max: 0.3, r: 48, col: '#ffffff', grav: 0, kind: 'ring' });
    this.shake = Math.max(this.shake, 10 * (this.demo ? 0.3 : 1));
    if (!this.demo) { this.hitStop = 0.07; this.slowT = Math.max(this.slowT, 0.28); this.slowK = 0.3; }
    snd.shieldBreak(pan);
    if (k.alive) {
      if (k.react === 'none') { startReact(k, 'teeter', 1.05); snd.whoa(pan, f.pitch); }
      f.ai.state = 'wait'; f.ai.t = Math.max(f.ai.t, 1.4);
    }
    const got = this.spawnCoins(sp.c, CFG.rewards.shieldBreak);
    this.say(k.p[0].x, k.p[0].y - (HEAD_R + 46) * k.s, this.demo ? tx('SHIELD BROKEN!', 'PERISAI HANCUR!') : tx(`SHIELD BROKEN!  +${got}`, `PERISAI HANCUR!  +${got}`), '#ffe24a', 21, 1.3);
    if (!this.demo) this.meta.stats.shieldsBroken++;
  }

  /** the shield, the arrows standing in its face, and - while it is up - where to shoot him instead */
  private drawShieldOf(ctx: Ctx, f: Fighter) {
    const sh = f.shield; const sp = this.shieldPose(f);
    if (!sh || !sp) return;
    const k = f.k;
    const al = f.plat.state === 'on' ? 1 : clamp(f.plat.rise * 1.5, 0, 1);
    ctx.globalAlpha = al;
    drawShield(ctx, sp.c, sp.rot, sp.s, { hp: sh.hp, max: sh.max, flash: sh.flash, rim: this.theme.rim, shade: clamp(1 - sh.g * 2, 0, 1) });
    const cs = Math.cos(sp.rot); const sn = Math.sin(sp.rot);
    for (const st of sh.stuck) {
      const at = v(sp.c.x + (st.x * cs - st.y * sn) * sp.s, sp.c.y + (st.x * sn + st.y * cs) * sp.s);
      drawArrow(ctx, at, sp.rot + st.rel, 1, true, st.bow, this.rt, false);
    }
    if ((!this.demo || this.show) && k.alive && f.plat.state === 'on') {
      const pu = 0.5 + 0.5 * Math.sin(this.rt * 5);
      if (sh.g > 0.6) {
        // the place to hit: the shins showing under the shield
        const m = lerpV(lerpV(k.p[7], k.p[9], 0.5), lerpV(k.p[8], k.p[10], 0.5), 0.6);
        ctx.strokeStyle = '#ffe27a'; ctx.globalAlpha = al * (0.45 + 0.5 * pu); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(m.x, m.y, 12 + pu * 4, 0, Math.PI * 2); ctx.stroke();
        this.text(ctx, tx('LEGS!', 'KAKI!'), m.x + k.face * 40, m.y + 1, 12, '#ffe27a', 0.6 + 0.4 * pu);
      } else if (sh.g < 0.35) {
        this.text(ctx, f.ai.state !== 'wait' ? tx("OPEN — HE'S AIMING!", 'TERBUKA — DIA MEMANAH!') : tx('WIDE OPEN! STRIKE!', 'TERBUKA!  HAJAR!'), k.p[0].x, k.p[0].y - (HEAD_R + 46) * k.s, 13 + pu * 1.5, '#7dffa0', 0.95);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- bats ---------------- */

  /** where this bat's lane has it at time `t`: it rides the air up and down, with a small sway */
  private batHome(b: Bat, t = this.t): V {
    const y0 = this.show ? this.cy + this.pFyT * this.span - 80 : this.cy - 26; // the codex stage is framed lower
    return v(b.fx * this.VW + Math.sin(t * 0.8 + b.ph) * 22, y0 + Math.sin(t * b.freq + b.ph) * b.amp);
  }
  private batSpeed() { return 350 + Math.min(this.level, 12) * 11; }

  private spawnBat() {
    const L = this.level; const rm = this.rangeMult; const stage = !!this.show;
    const big = stage ? this.show === 'vampire' : L >= 4 && rand() < 0.3;
    // its lane lies between you and them, so it is also in the way of your shots
    const fx = stage ? (this.pPlat.x + 215) / this.VW : rm === 2 ? 0.5 + rand() * 0.4 : rm === 1.5 ? 0.42 + rand() * 0.3 : 0.36 + rand() * 0.2;
    const hp = Math.round((16 + 3 * Math.min(L, 12)) * (big ? 2.4 : 1) * (stage || this.demo ? 1 : this.foeHpMult));
    const at = v(fx * this.VW + (rand() - 0.5) * 160, stage ? this.cy + this.pFyT * this.span - 330 : -70);
    this.bats.push({
      lvl: this.demo ? CFG.enemy.ranks.normal : L,
      p: at, vel: v(0, 0), from: { ...at }, fx, ph: rand() * 6.28,
      amp: stage ? 62 : this.span * (0.6 + rand() * 0.3), freq: stage ? 1 : 1.4 + rand() * 0.6 + Math.min(L, 10) * 0.05,
      s: big ? 1.7 : 1.35, big, hp, maxHp: hp, dmg: (5 + 0.45 * Math.min(L, 15)) * (big ? 1.5 : 1) * (stage || this.demo ? 1 : this.foeDmgMult), state: 'in',
      t: 0, atkT: 2.6 + rand() * 2.4, flap: rand() * 6.28, flash: 0, rot: 0, vr: 0, face: -1, hpShow: 0, deadT: 0,
    });
    this.batSpawned++;
    snd.batScreech(this.pan(at.x));
    if (!this.batTold && this.banner < 0.3) {
      this.batTold = true;
      this.banner = 2.2; this.bannerText = tx('BATS INCOMING!', 'KELELAWAR DATANG!'); this.bannerSub = tx('BOBBING FLIGHT · SHOOT BEFORE THEY BITE!', 'TERBANG NAIK-TURUN · PANAH SEBELUM MENGGIGIT!');
    }
  }

  private stepBats() {
    const pk = this.player.k;
    const hunting = this.bats.some((b) => b.state === 'warn' || b.state === 'dive');
    for (const b of this.bats) {
      b.t += H; b.flash = Math.max(0, b.flash - H * 5); b.hpShow -= H;
      if (b.state === 'dead') {
        b.deadT += H; b.vel.y += 1000 * H; b.vel.x *= Math.exp(-0.9 * H);
        b.p = add(b.p, mul(b.vel, H)); b.rot += b.vr * H;
        continue;
      }
      if ((b.skinStunT ?? 0) > 0) { b.t -= H; b.flap += H * SKIN_RULES.fx.stunWingSpeed; continue; }
      const prev = b.p; const home = this.batHome(b);
      b.flap += H * (b.state === 'dive' ? 27 : b.state === 'warn' ? 36 : 15);
      if (b.state === 'in' || b.state === 'back') {
        // a set glide from wherever he was to wherever his lane is by now: he always makes it home
        const u = clamp(b.t / (b.state === 'in' ? 1.3 : 0.9), 0, 1);
        b.p = lerpV(b.from, home, u * u * (3 - 2 * u));
        if (u >= 1) b.state = 'hover';
      } else if (b.state === 'hover') {
        b.p = home;
        if (this.stage === 'play' && pk.alive) b.atkT -= H;
        if (b.atkT <= 0) {
          if (hunting) b.atkT = 0.7 + rand() * 0.6; // one at a time: the other waits his turn
          else { b.state = 'warn'; b.t = 0; b.from = { ...b.p }; snd.batScreech(this.pan(b.p.x)); }
        }
      } else if (b.state === 'warn') {
        // he hangs where he is and shivers: this is the moment to shoot him
        b.p = v(b.from.x + Math.sin(b.t * 70) * 1.6, b.from.y - b.t * 14);
        if (!pk.alive || this.stage !== 'play') { b.state = 'back'; b.t = 0; b.from = { ...b.p }; b.atkT = 3; }
        else if (b.t > 0.75) {
          const to = lerpV(pk.p[0], pk.p[1], 0.35); const d = dist(to, b.p) || 1;
          b.state = 'dive'; b.t = 0; b.vel = mul(v(to.x - b.p.x, to.y - b.p.y), this.batSpeed() / d);
        }
      } else {
        // the dive: straight for the head, bending as you bob
        const to = lerpV(pk.p[0], pk.p[1], 0.35); const d = dist(to, b.p) || 1;
        const want = mul(v(to.x - b.p.x, to.y - b.p.y), this.batSpeed() / d);
        b.vel = lerpV(b.vel, want, 1 - Math.exp(-5 * H));
        b.p = add(b.p, mul(b.vel, H));
        if (pk.alive && d < 17 * b.s + 5) { this.batBite(b); b.state = 'back'; b.t = 0; b.from = { ...b.p }; b.atkT = 3.2 + rand() * 2.6; }
        else if (!pk.alive || b.t > 3.5) { b.state = 'back'; b.t = 0; b.from = { ...b.p }; b.atkT = 2.5 + rand() * 2; }
      }
      const warn = b.state === 'warn';
      if (b.state !== 'dive') b.vel = mul(v(b.p.x - prev.x, b.p.y - prev.y), 1 / H);
      // seen from the side: he looks where he is going - and at you while he hangs in his lane
      const going = warn ? 0 : b.vel.x;
      // (he turns in one beat: the picture is flipped, never squeezed)
      b.face = Math.abs(going) > 70 ? Math.sign(going) : pk.p[0].x < b.p.x ? -1 : 1;
      // nose down as he sinks, up as he climbs
      b.rot = damp(b.rot, warn ? -0.15 : clamp(b.vel.y * 0.0013, -0.5, 0.6), 8, H);
    }
    this.bats = this.bats.filter((b) => b.state !== 'dead' || (b.deadT < 4 && b.p.y < this.VH + 220));
    for (const ls of this.looseShields) { ls.vel.y += 1100 * H; ls.p = add(ls.p, mul(ls.vel, H)); ls.rot += ls.vr * H; }
    this.looseShields = this.looseShields.filter((ls) => ls.p.y < this.VH + 160);
  }

  /** teeth in the player's head: a small wound, a big fright */
  private batBite(b: Bat) {
    const pf = this.player; const k = pf.k; const pan = this.pan(b.p.x);
    if (!this.demo && this.shieldTry(b.p)) return;
    this.run.killedBy = b.big ? tx('VAMPIRE BAT', 'KELELAWAR VAMPIR') : foeName('bat');
    const dmg = Math.max(1, Math.round(b.dmg * (this.demo ? 1 : (1 - this.training.dmgReduce) * skinIncomingMult(this.head, true))));
    pf.hpLag = Math.max(pf.hpLag, pf.hp); pf.hpLagHold = 0.28; pf.barBump = 1;
    pf.hp -= dmg; pf.flash = 1;
    if (this.demo) pf.hp = Math.max(pf.hp, 20); // nobody dies on the title screen or the codex stage
    else this.lvHurt += dmg;
    const fatal = pf.hp <= 0;
    punchRag(k as unknown as ArcherRag, 0, 1, mul(b.vel, 1.6), fatal);
    k.muscle = Math.min(k.muscle, 0.5); k.hurt = 1; k.hurtDir = Math.sign(b.vel.x) || -1; k.wound = { stick: 0, u: 1 }; k.exert = Math.min(1, k.exert + 0.4);
    pf.plat.vel += 60;
    this.burst(b.p, mul(b.vel, -1), 8, '#d3141f', 220);
    this.parts.push({ p: { ...b.p }, vel: v(0, 0), life: 0, max: 0.22, r: 22, col: '#ffffff', grav: 0, kind: 'ring' });
    this.hitStop = 0.05; this.shake = Math.max(this.shake, 8 * (this.demo ? 0.3 : 1)); this.combo = 0;
    if (!this.demo) this.hurt = 1;
    snd.bite(pan);
    if (!fatal) snd.grunt(pan, pf.pitch);
    this.say(k.p[0].x, k.p[0].y - 52, tx(`BAT BITE!  -${dmg}`, `DIGIGIT KELELAWAR!  -${dmg}`), '#ff6b6b', 19);
    if (fatal) this.die(pf, false);
  }

  /** an arrow found a bat */
  private hitBat(a: Arrow, b: Bat) {
    if (b.state === 'dead' || a.hitIds?.has(b)) return;
    const pan = this.pan(b.p.x);
    const hitDmg = a.dmg;
    const dmg = a.maxPower ? Math.max(b.hp, 999) : Math.max(1, Math.round(hitDmg * 1.15));
    this.pierceCreature(a, b);
    b.lastSkin = a.skin?.id;
    b.hp -= dmg; b.flash = 1; b.hpShow = 3;
    this.burst(a.p, mul(a.vel, -1), 7, '#2f1946', 240);
    this.burst(a.p, mul(a.vel, -1), 4, '#d3141f', 200);
    this.parts.push({ p: { ...a.p }, vel: v(0, 0), life: 0, max: 0.22, r: 20, col: '#ffffff', grav: 0, kind: 'ring' });
    if (a.bow === 'thunder') this.triggerThunderHit(a.p, a.ang, null, null, pan);
    else if (a.bow === 'fire') this.triggerFireHit(a.p, a.ang, null, null, pan);
    else if (a.bow === 'poison') this.triggerPoisonHit(a.p, a.ang, null, null, pan);
    else if (a.bow === 'spike') this.triggerSpikeHit(a.p, a.ang, null, pan);
    this.hitStop = 0.04; this.shake = Math.max(this.shake, 5 * (this.demo ? 0.3 : 1));
    snd.hit(pan, false);
    if (!this.demo) {
      this.lvHits++; this.combo++;
      if (this.combo >= 2) {
        const bonus = Math.min(this.combo - 1, CFG.rewards.comboCap);
        this.spawnCoins(this.player.k.p[0], bonus);
        this.say(this.player.k.p[0].x + 60, this.player.k.p[0].y - 64, `COMBO x${this.combo}  +${bonus}`, '#7fe9f2', 16, 1.2);
        snd.combo(this.combo);
      }
    }
    this.skinOnHit(a, b, false, a.p, hitDmg);
    if (b.hp > 0) {
      // knocked out of his dive: he shrieks and flaps back to his lane
      this.say(b.p.x, b.p.y - 30 * b.s, `-${dmg}`, '#ffffff', 18);
      snd.batScreech(pan);
      const sp = Math.hypot(a.vel.x, a.vel.y) || 1;
      b.state = 'back'; b.t = 0; b.from = add(b.p, mul(a.vel, 26 / sp)); b.atkT = Math.max(b.atkT, 1.8);
      return;
    }
    this.killBat(b, a.vel);
  }

  private killBat(b: Bat, velocity: V) {
    if (b.state === 'dead') return;
    const pan = this.pan(b.p.x);
    b.state = 'dead'; b.hp = 0; b.deadT = 0; b.vel = v(velocity.x * 0.2, velocity.y * 0.2 - 170); b.vr = (rand() < 0.5 ? -1 : 1) * (7 + rand() * 9);
    snd.batDie(pan);
    if (this.demo) { this.say(b.p.x, b.p.y - 34 * b.s, tx('BAT!', 'KELELAWAR!'), '#ffd23f', 19, 1.3); return; }
    this.kills++; this.totalKills++;
    const reward = this.spawnCoins(b.p, (b.big ? CFG.rewards.bigBat : CFG.rewards.bat) * skinKillGoldMult(b.lastSkin));
    this.say(b.p.x, b.p.y - 34 * b.s, tx(`BAT!  +${reward}`, `KELELAWAR!  +${reward}`), '#ffd23f', 19, 1.3);
    this.meta.stats.kills++; this.meta.killsBy.bat = (this.meta.killsBy.bat ?? 0) + 1;
    if (!this.meta.seen.includes('bat')) this.meta.seen.push('bat');
    this.killHeal();
    this.afterSkinKill(b.lastSkin, false);
    const last = this.kills >= this.total && this.hostState !== 1;
    const J = CFG.juice;
    this.slowT = last ? J.lastSlowT : J.killSlowT; this.slowK = last ? J.lastSlowK : J.killSlowK;
    if (last && this.stage === 'play') this.beginClear({ ...b.p });
    else if (this.kills >= this.total && this.hostState === 1) { this.banner = 2.4; this.bannerText = tx('FREE THE HOSTAGE!', 'BEBASKAN TAWANAN!'); this.bannerSub = tx('SHOOT RIGHT THROUGH THE ROPE', 'PANAH TEPAT DI TALINYA'); }
  }

  private drawBats(ctx: Ctx) {
    for (const b of this.bats) {
      const dead = b.state === 'dead';
      const angry = b.state === 'warn' || b.state === 'dive';
      if (angry && (!this.demo || this.show)) {
        // a reticle and a shout, like the boss's weapon in the air: shoot it before it lands
        const pulse = 0.5 + 0.5 * Math.sin(this.rt * 18);
        ctx.save();
        ctx.strokeStyle = pulse > 0.5 ? '#ff4d4d' : '#ffd23f'; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.78;
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(b.p.x, b.p.y, (30 + pulse * 5) * b.s, this.rt * 4, this.rt * 4 + Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        this.text(ctx, b.state === 'warn' ? tx('WATCH THE BITE!', 'AWAS GIGITAN!') : tx('SHOOT THE BAT!', 'PANAH KELELAWAR!'), b.p.x, b.p.y - 44 * b.s, 12, '#ffe24a', 0.92);
      }
      ctx.globalAlpha = dead ? clamp(1.5 - b.deadT * 0.45, 0, 1) : 1;
      drawBat(ctx, b.p, b.s, b.flap, { rim: this.theme.rim, flash: b.flash, angry: angry ? 1 : 0, tilt: b.rot, face: b.face, dead, big: b.big });
      if (!dead && b.hpShow > 0 && b.hp < b.maxHp) {
        const bw = 30 * b.s; const x = b.p.x - bw / 2; const y = b.p.y - 36 * b.s;
        ctx.fillStyle = '#142b42'; ctx.fillRect(x - 1.5, y - 1.5, bw + 3, 7);
        ctx.fillStyle = '#ff5e5e'; ctx.fillRect(x, y, bw * clamp(b.hp / b.maxHp, 0, 1), 4);
      }
    }
    for (const ls of this.looseShields) drawShield(ctx, ls.p, ls.rot, ls.s, { hp: ls.hp, max: ls.max, flash: 0, rim: this.theme.rim, shade: 0 });
    ctx.globalAlpha = 1;
  }

    /* ---------------- head ornaments ---------------- */

  /** what the player wears on his head: kept between visits, like his bow */
  setHead(h: HeadStyle) {
    if (!HEAD_STYLES.includes(h)) return;
    if (!hatUnlocked(this.meta, h)) {
      snd.deny();
      const u = unlockOf(COSMETICS.lockedHats[h] ?? '');
      this.toast(tx('SKIN LOCKED', 'TOPI TERKUNCI'), u ? unlockLabel(u) : '');
      return;
    }
    if (this.head === h) return;
    this.head = h;
    try { localStorage.setItem(HEAD_KEY, h); } catch { /* not kept */ }
    this.player.hat = h; this.player.hair = makeHair(h, this.player.k);
    // Do not reset shot counts, opening-shot use, or barrier cooldown on equipment changes.
    this.emitUi();
    snd.buy();
  }

  /* ---------------- the golden and the legendary arrow ---------------- */

  /** the golden arrow pays for itself: every hit on an enemy shakes a couple of coins loose */
  private triggerGoldHit(at: V, victim: Fighter) {
    for (let i = 0; i < 10; i++) {
      const a = rand() * 6.28; const sp = 80 + rand() * 220;
      this.parts.push({ p: { ...at }, prev: { ...at }, vel: v(Math.cos(a) * sp, Math.sin(a) * sp - 70), life: 0, max: 0.3 + rand() * 0.3, r: 1.4 + rand() * 1.1, col: i % 2 ? '#ffe27a' : '#ffc933', grav: 700, kind: 'spark', drag: 1.6 });
    }
    this.parts.push({ p: { ...at }, vel: v(0, 0), life: 0, max: 0.24, r: 24, col: '#ffd23f', grav: 0, kind: 'ring' });
    if (victim.team === 1 && !this.demo) { this.spawnCoins(at, 2); snd.coinPop(); }
  }

  /** the legendary arrow bursts into a star: rays of light, and the man it struck loses his rhythm */
  private triggerLegendHit(at: V, victim: Fighter) {
    const cols = ['#ffffff', '#b9a8ff', '#5cf4ff', '#ff7be5'];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.283; const sp = i % 2 ? 150 : 340;
      this.parts.push({ p: { ...at }, prev: { ...at }, vel: v(Math.cos(a) * sp, Math.sin(a) * sp), life: 0, max: i % 2 ? 0.26 : 0.4, r: i % 2 ? 1.3 : 2, col: cols[i % 4], grav: 60, kind: 'spark', drag: 3 });
    }
    this.parts.push({ p: { ...at }, vel: v(0, 0), life: 0, max: 0.3, r: 34, col: '#ffffff', grav: 0, kind: 'ring' });
    this.parts.push({ p: { ...at }, vel: v(0, 0), life: 0, max: 0.42, r: 52, col: '#b9a8ff', grav: 0, kind: 'ring' });
    this.shake = Math.max(this.shake, 8 * (this.demo ? 0.3 : 1));
    snd.legend(this.pan(at.x));
    if (victim.k.alive && victim.team === 1) victim.ai.t = Math.max(victim.ai.t, 1);
  }

  /* ---------------- the wooden fort ---------------- */

  /**
   * A fort of posts and planks rises on a wide ground of its own, a guard on each of its two floors. They shoot out
   * through the slits in the front posts, and those posts stop every arrow meant for them: the fort has to come down.
   */
  private spawnFort() {
    const L = this.level; const stage = !!this.show; const rm = this.demo ? 1 : this.rangeMult;
    // out at the far side, so the other grounds still have room in front of it
    const fx = stage ? (this.pPlat.x + 400) / this.VW : rm === 2 ? 1.45 : rm === 1.5 ? 1.14 : 0.86;
    const base: Plat = { x: 0, y: 0, w: FORT.W, h: 30, fx, fy: stage ? this.pFyT : 0.72, rise: 0, state: 'rise', phase: rand() * 6.28, amp: 3, sway: 0, sinkT: 0, off: 0, vel: 0 };
    this.placePlat(base);
    this.plats.push(base);
    const fort: Fort = { base, blocks: makeFort(L), stands: [], guards: [], fallen: false, done: false };
    const lvl = enemyLevelFor(L, 'guard', 0, this.demo);
    const hp = Math.round(enemyHp(L, CFG.enemy.ranks.normal, false) * CFG.enemy.guardHpMult[lvl - CFG.enemy.ranks.normal] * (stage || this.demo ? 1 : this.foeHpMult));
    for (const [x, y, on] of [[FORT.G1X, 0, -1], [FORT.G2X, FORT.DECK_Y, FORT.DECK]]) {
      // each man stands on an unseen ground of his own, which goes wherever the fort goes
      const plat: Plat = { x: base.x + x, y: base.y - y, w: 46, h: 0, fx, fy: 0, rise: 0, state: 'rise', phase: 0, amp: 0, sway: 0, sinkT: 0, off: 0, vel: 0, hidden: true };
      this.plats.push(plat);
      fort.stands.push({ plat, x, y, on });
      const g: Fighter = {
        k: makeStick(v(plat.x, plat.y), -1, 0.9, false, true), kind: 'guard', team: 1,
        lvl, hp, maxHp: hp, hpLag: hp, hpLagHold: 0, barBump: 0, helm: L >= 5, plat, stuck: [],
        vib: 9, hpShow: 0, flash: 0, deadT: 0, dmg: enemyDmg(L, CFG.enemy.ranks.normal, false) * CFG.enemy.guardDmgMult[lvl - CFG.enemy.ranks.normal] * (stage || this.demo ? 1 : this.foeDmgMult), pitch: 0.95 + rand() * 0.15,
        ai: { state: 'wait', t: 2.4 + rand() * 1.8, aim: Math.PI, pull: 0.85, drawT: 0.7, spread: 0.14, floor: 0.04 },
        shockT: 0, burnT: 0, poisonT: 0, dotTick: 0,
      };
      this.foes.push(g); fort.guards.push(g);
      this.spawned++;
    }
    this.fort = fort;
    snd.rise(this.pan(base.x));
    if (!this.demo) {
      if (!this.meta.seen.includes('fort')) this.meta.seen.push('fort');
      this.banner = 2.6;
      this.bannerText = tx('STURDY WOODEN FORT!', 'ISTANA KAYU KOKOH!');
      this.bannerSub = tx('IRON-CLAD WALLS · AIM AT PEGS & WEAK JOINTS!', 'DINDING LAPIS BESI · BIDIK PASAK & SENDI LEMAHNYA!');
      snd.boss();
    }
  }

  /** an arrow against the fortress: iron-clad walls deflect most force; weak joints take critical structural damage */
  private hitBlock(fort: Fort, i: number, a: Arrow) {
    const b = fort.blocks[i]; const pan = this.pan(a.p.x);
    b.skinOwner = a.skin?.id;
    const c = blockCentre(b, fort.base.x, fort.base.y);
    const before = b.hp / b.max;
    const isWeak = b.kind === 'weak';
    const isArmor = b.kind === 'armor';
    const mult = isWeak ? 1.68 : isArmor ? (a.bow === 'fire' ? 0.34 : 0.2) : b.kind === 'plank' ? 1.15 : 1;
    b.hp -= a.maxPower ? b.max : Math.max(1, a.dmg * mult);
    b.flash = 1; fort.base.vel += isWeak ? 48 : 22;
    if (!a.maxPower) a.dead = true; // MAX POWER smashes straight through it

    if (isArmor && !a.maxPower) {
      // Metallic sparks bounce off the iron-plated oak wall
      for (let s = 0; s < 7; s++) {
        const sa = a.ang + Math.PI + (rand() - 0.5) * 1.3;
        const sp = 110 + rand() * 190;
        this.parts.push({ p: { ...a.p }, prev: { ...a.p }, vel: v(Math.cos(sa) * sp, Math.sin(sa) * sp - 40), life: 0, max: 0.18 + rand() * 0.12, r: 1.6, col: s % 2 ? '#ffe588' : '#d6ebff', grav: 620, kind: 'spark', drag: 3 });
      }
      snd.parry(pan);
    } else if (isWeak) {
      this.burst(a.p, mul(a.vel, -1), 11, '#ffd478', 260);
      this.parts.push({ p: { ...a.p }, vel: v(0, 0), life: 0, max: 0.24, r: 30, col: '#ffd23f', grav: 0, kind: 'ring' });
      snd.woodCrack(pan);
      this.shake = Math.max(this.shake, 5 * (this.demo ? 0.3 : 1));
    } else {
      this.burst(a.p, mul(a.vel, -1), 6, '#e3b77a', 220);
    }

    if (a.bow === 'fire') { b.burn = Math.max(b.burn, isWeak ? 4.4 : isArmor ? 2.0 : 3.6); b.spread = false; this.triggerFireHit(a.p, a.ang, null, null, pan); }
    else if (a.bow === 'thunder') this.triggerThunderHit(a.p, a.ang, null, null, pan);
    else if (a.bow === 'poison') this.triggerPoisonHit(a.p, a.ang, null, null, pan);
    else if (!isArmor && !isWeak) snd.wood(pan);

    this.hitStop = isWeak ? 0.04 : 0.02;
    if (!this.demo) this.lvHits++; // stopped by the fort, but not a miss
    if (b.hp <= 0) { this.breakBlock(fort, i, a.vel); return; }
    const now = b.hp / b.max;
    if ((before > 0.7 && now <= 0.7) || (before > 0.38 && now <= 0.38)) snd.woodCrack(pan);
    if (!a.maxPower) {
      // arrows bounce shallower or stick in the timber
      const q = add(a.p, fromAngle(a.ang, isArmor ? 2 : 6));
      b.stuck.push({ x: clamp(q.x - c.x, -b.w / 2 + 1, b.w / 2 - 1), y: clamp(q.y - c.y, -b.h / 2 + 1, b.h / 2 - 1), ang: a.ang, bow: a.bow });
      if (b.stuck.length > 4) b.stuck.shift();
    }
    if (isArmor) {
      this.say(c.x - 16, a.p.y - 14, tx('IRON ARMOR! AIM FOR WEAK JOINT!', 'LAPIS BESI! INCAR TITIK LEMAH!'), '#cfe6f7', 13, 0.95);
    } else if (isWeak) {
      this.say(c.x - 10, c.y - b.h / 2 - 14, tx(`WEAK JOINT! ${Math.ceil(now * 100)}%`, `TITIK LEMAH! ${Math.ceil(now * 100)}%`), '#ffe24a', 16, 1.05);
    } else {
      this.say(c.x, c.y - b.h / 2 - 12, `${b.label} ${Math.ceil(now * 100)}%`, '#f0cf9a', 13, 0.8);
    }
  }

  /** a timber gives way - and everything that stood on it comes down after it */
  private breakBlock(fort: Fort, i: number, dir: V) {
    const { base, blocks } = fort; const b = blocks[i];
    if (b.state !== 'up') return;
    const c = blockCentre(b, base.x, base.y); const pan = this.pan(c.x);
    b.state = 'gone'; b.stuck = [];
    for (let n = 0; n < 16; n++) this.burst(v(c.x + (rand() - 0.5) * b.w, c.y + (rand() - 0.5) * b.h), dir, 1, n % 3 ? '#ad6f35' : '#ffd478', 320);
    this.parts.push({ p: { ...c }, vel: v(0, 0), life: 0, max: 0.28, r: 46, col: b.kind === 'weak' ? '#ffd23f' : '#ffffff', grav: 0, kind: 'ring' });
    snd.woodBreak(pan);
    this.hitStop = 0.055; this.shake = Math.max(this.shake, 8 * (this.demo ? 0.3 : 1));
    // whatever rested on it has nothing under it now: it tips and falls - and so does whatever rested on that
    let fell = 0;
    let roofFell = false;
    for (let again = true; again;) {
      again = false;
      for (let idx = 0; idx < blocks.length; idx++) {
        const o = blocks[idx];
        if (o.state !== 'up' || !o.on.some((j) => blocks[j].state !== 'up')) continue;
        const oc = blockCentre(o, base.x, base.y); const side = oc.x < c.x ? -1 : 1;
        o.state = 'fall'; o.p = oc; o.life = 0; o.landed = false; o.rot = 0;
        o.skinOwner = b.skinOwner;
        o.vel = v(side * (18 + rand() * 38), -16 - rand() * 44);
        o.vr = side * (0.5 + rand() * 1.35) * (o.h > o.w ? 1.65 : 0.48);
        if (idx === FORT.ROOF) roofFell = true;
        fell++; again = true;
      }
    }
    // a man standing on a floor that is no longer there goes down with it
    for (const st of fort.stands) {
      if (st.on < 0 || blocks[st.on].state === 'up' || st.plat.state === 'off') continue;
      st.plat.state = 'off'; st.plat.y = this.VH + 4000; // (nothing unseen is left for him to land on)
      const g = fort.guards.find((q) => q.plat === st.plat);
      if (g && g.k.alive) {
        g.lastSkin = b.skinOwner;
        punchRag(g.k as unknown as ArcherRag, 1, 0.5, v((rand() - 0.5) * 300, 500), true);
        this.say(g.k.p[0].x, g.k.p[0].y - 40, tx('FELL!', 'JATUH!'), '#ffe24a', 19, 1.2);
        this.die(g, false);
      }
    }
    if (fell >= 3 && !fort.fallen) {
      fort.fallen = true;
      snd.collapse(pan);
      this.shake = Math.max(this.shake, 14 * (this.demo ? 0.3 : 1));
      if (!this.demo) { this.slowT = Math.max(this.slowT, 0.75); this.slowK = 0.28; }
      const got = this.spawnCoins(v(base.x, base.y - 120), CFG.rewards.fortCollapse);
      this.say(base.x, base.y - 265, this.demo ? tx('FORTRESS COLLAPSED!', 'ISTANA ROBOH!') : tx(`FORTRESS COLLAPSED!  +${got}`, `ISTANA ROBOH!  +${got}`), '#ffd23f', 25, 1.8);
      if (!this.demo) { this.meta.stats.forts++; this.checkUnlocks(); }
    } else if (roofFell && !fort.fallen) {
      snd.collapse(pan);
      const got = this.spawnCoins(v(base.x - 20, base.y - 195), CFG.rewards.roof);
      this.say(base.x - 10, base.y - 235, this.demo ? tx('TOWER ROOF COLLAPSED!', 'ATAP MENARA RUNTUH!') : tx(`TOWER ROOF COLLAPSED!  +${got}`, `ATAP MENARA RUNTUH!  +${got}`), '#ffe24a', 20, 1.4);
    }
  }

  /** a falling timber lands on a man */
  private crush(g: Fighter, b: FortBlock) {
    g.lastSkin = b.skinOwner;
    const k = g.k; const pan = this.pan(k.p[0].x);
    punchRag(k as unknown as ArcherRag, 0, 1, v(b.vel.x * 0.6, 900), true);
    g.hp = 0; g.flash = 1;
    this.burst(k.p[0], v(0, -1), 10, '#d3141f', 260);
    snd.hit(pan, true);
    this.say(k.p[0].x, k.p[0].y - 42, tx('CRUSHED!', 'TERTIMPA!'), '#ffe24a', 19, 1.2);
    this.die(g, false);
  }

  private stepFort() {
    const fort = this.fort;
    if (!fort) return;
    const { base, blocks } = fort; const gx = base.x; const gy = base.y;
    blocks.forEach((b, i) => {
      b.flash = Math.max(0, b.flash - H * 5);
      if (b.state === 'up' && b.burn > 0) {
        // burning timber weakens, and the fire creeps on to whatever rests on it or carries it
        b.burn -= H; b.hp -= 16 * H;
        if (rand() < 0.32) {
          const bx = blockBox(b, gx, gy);
          this.parts.push({ p: v(bx.x0 + rand() * b.w, bx.y0 + rand() * b.h), vel: v((rand() - 0.5) * 30, -50 - rand() * 50), life: 0, max: 0.3 + rand() * 0.25, r: 5 + rand() * 5, col: '#ff6a00', grav: -220, kind: 'fire', drag: 3, turb: 8, seed: rand() * 100 });
        }
        if (b.burn < 2.3 && !b.spread) {
          b.spread = true;
          blocks.forEach((o, j) => { if (o.state === 'up' && o.burn <= 0 && (o.on.includes(i) || b.on.includes(j))) { o.burn = 3.4; o.spread = false; o.skinOwner = b.skinOwner; } });
        }
        if (b.hp <= 0) this.breakBlock(fort, i, v(0, -1));
      } else if (b.state === 'fall') {
        b.life += H; b.vel.y += 1300 * H; b.p = add(b.p, mul(b.vel, H)); b.rot += b.vr * H;
        // it lands on the fort's ground once, kicks up dust, and tumbles off
        if (!b.landed && b.vel.y > 0 && b.p.y + Math.min(b.w, b.h) / 2 > gy && Math.abs(b.p.x - gx) < base.w / 2 + 10) {
          b.landed = true;
          b.vel = v((b.p.x >= gx ? 1 : -1) * (60 + rand() * 120) + b.vel.x * 0.3, -b.vel.y * 0.28); b.vr = (rand() - 0.5) * 9;
          base.vel += 55;
          this.burst(v(b.p.x, gy), v(0, -1), 6, '#c9a36c', 190);
          snd.thud(this.pan(b.p.x), 0);
          this.shake = Math.max(this.shake, 4 * (this.demo ? 0.3 : 1));
        }
        // whoever is under it as it comes down is crushed
        if (!b.landed && b.vel.y > 120) {
          for (const g of this.foes) {
            const hd = g.k.p[0];
            if (g.k.alive && Math.abs(hd.x - b.p.x) < Math.max(b.w, b.h) / 2 + 4 && Math.abs(hd.y - b.p.y) < 22) this.crush(g, b);
          }
        }
        if (b.life > 2.4 || b.p.y > this.VH + 240) b.state = 'gone';
      }
    });
    // with nobody left to guard it, what is left of it sinks away
    if (!fort.done && fort.guards.every((g) => !g.k.alive)) { fort.done = true; base.sinkT = Math.max(base.sinkT, 2.6); }
    if (base.state === 'off') this.fort = null;
  }

  /* ---------------- the red dragon and its rider ---------------- */

  /**
   * The red dragon flies in with an archer on its back. He shoots; it breathes balls of fire. While it draws breath
   * its throat lights up and its jaws stand open - an arrow into its mouth then sets the fire off inside it.
   * It can be beaten either way round: bring the rider down and it flies off, or kill the beast and he falls with it.
   */
  spawnDragon() {
    if (this.dragon) return false;
    if (!this.demo && !this.canSummonBoss()) return false;
    const L = this.level; const stage = !!this.show; const rm = this.demo ? 1 : this.rangeMult;
    if (!this.demo) { this.bigBossDue = false; this.dragonDue = false; this.bossSpawned = true; this.preferredBoss = undefined; }
    // it keeps to the far side, beyond the grounds, so it is never tangled up with the men standing on them
    const fx = stage ? (this.pPlat.x + 395) / this.VW : rm === 2 ? 1.48 : rm === 1.5 ? 1.16 : 0.88;
    const hm = stage || this.demo ? 1 : this.foeHpMult;
    const maxHp = Math.round((240 + 42 * L) * hm);
    const start = v(this.VW * fx + 520, -240);
    // the saddle is an unseen ground that rides on the dragon's back; it only counts as ground once the beast has arrived
    const plat: Plat = { x: start.x, y: start.y, w: 40, h: 0, fx, fy: 0, rise: -1, state: 'rise', phase: 0, amp: 0, sway: 0, sinkT: 0, off: 0, vel: 0, hidden: true };
    const hp = Math.round(((38 + 5 * Math.min(L, 14)) * 2.1 + 30 + 8 * L) * hm);
    const rider: Fighter = {
      k: makeStick(v(start.x, start.y), -1, 1.12, true, false), kind: 'rider', team: 1, bigBoss: !this.demo,
      lvl: enemyLevelFor(L, 'rider', 0, this.demo), hp, maxHp: hp, hpLag: hp, hpLagHold: 0, barBump: 0, helm: false, plat, stuck: [],
      vib: 9, hpShow: 0, flash: 0, deadT: 0, dmg: enemyDmg(L, 1, false) * 1.4 * (stage || this.demo ? 1 : this.foeDmgMult), pitch: 0.7,
      ai: { state: 'wait', t: 3, aim: Math.PI, pull: 0.92, drawT: 0.5, spread: 0.08, floor: 0.022 },
      shockT: 0, burnT: 0, poisonT: 0, dotTick: 0,
    };
    rider.hat = 'sephiroth'; rider.hair = makeHair('sephiroth', rider.k);
    this.plats.push(plat); this.foes.push(rider); this.spawned++;
    this.dragon = {
      p: start, from: { ...start }, vel: v(0, 0), vr: 0, fx, ph: rand() * 6.28, s: stage ? 0.78 : 0.92, t: 0, st: 0, flap: 0, tilt: 0,
      hp: maxHp, maxHp, hpLag: maxHp, flash: 0, state: 'in', fireT: 3.6, shots: 0, jaw: 0, glow: 0, dip: 0, spit: 0, rider, plat,
    };
    snd.dragonRoar(this.pan(this.VW * fx));
    if (!this.demo && !stage && !this.meta.seen.includes('dragon')) this.meta.seen.push('dragon');
    if (!this.demo) { this.banner = 2.4; this.bannerText = tx('RED DRAGON BOSS!', 'BOS NAGA MERAH!'); this.bannerSub = tx('SHOOT ITS MOUTH WHILE INHALING · SHOOT FIREBALLS!', 'PANAH MULUTNYA SAAT MENGHIRUP NAPAS · PANAH BOLA APINYA!'); snd.boss(); }
    return true;
  }

  /** it spits what it drew: a ball of fire lobbed at the archer - slow enough to be shot out of the air */
  private spitFire(d: Dragon) {
    const m = dragonToWorld(dragonRig(d.t, d.flap, d.glow, d.spit).mouth, d.p, d.s, d.tilt);
    const pk = this.player.k; const to = lerpV(pk.p[1], pk.p[2], 0.3);
    const T = (dist(to, m) || 1) / (300 + Math.min(this.level, 12) * 9); const g = 70;
    this.fireballs.push({ p: m, vel: v((to.x - m.x) / T, (to.y - m.y) / T - 0.5 * g * T), r: 15, life: 0, dead: false, dmg: (13 + 1.1 * Math.min(this.level, 15)) * (this.demo || this.show ? 1 : this.foeDmgMult) });
    d.dip -= 14; d.glow = 0.25; d.spit = 1; d.jaw = 1;
    for (let i = 0; i < 8; i++) this.parts.push({ p: { ...m }, vel: v(-60 - rand() * 160, (rand() - 0.5) * 140), life: 0, max: 0.3 + rand() * 0.25, r: 6 + rand() * 6, col: '#ff6a00', grav: -200, kind: 'fire', drag: 3.2, turb: 8, seed: rand() * 100 });
    this.shake = Math.max(this.shake, 6 * (this.demo ? 0.3 : 1));
    snd.fireSpit(this.pan(m.x));
  }

  /** a ball of fire reaches the archer */
  private fireballHit(fb: Fireball) {
    const pf = this.player; const k = pf.k; const pan = this.pan(fb.p.x);
    fb.dead = true;
    if (!this.demo && this.shieldTry(fb.p)) return;
    this.run.killedBy = tx('DRAGON FIREBALL', 'BOLA API NAGA');
    const dmg = Math.max(1, Math.round(fb.dmg * (this.demo ? 1 : (1 - this.training.dmgReduce) * skinIncomingMult(this.head))));
    pf.hpLag = Math.max(pf.hpLag, pf.hp); pf.hpLagHold = 0.28; pf.barBump = 1;
    pf.hp -= dmg; pf.flash = 1;
    if (this.demo) pf.hp = Math.max(pf.hp, 20); // nobody dies on the title screen or the codex stage
    else { this.lvHurt += dmg; this.hurt = 1; }
    const fatal = pf.hp <= 0;
    punchRag(k as unknown as ArcherRag, 1, 0.7, mul(fb.vel, 2.4), fatal);
    k.muscle = Math.min(k.muscle, 0.35); k.hurt = 1; k.hurtDir = Math.sign(fb.vel.x) || -1; k.wound = { stick: 1, u: 0.7 }; k.exert = 1;
    pf.plat.vel += 110;
    this.triggerFireHit(fb.p, Math.atan2(fb.vel.y, fb.vel.x), null, null, pan);
    this.parts.push({ p: { ...fb.p }, vel: v(0, 0), life: 0, max: 0.3, r: 46, col: '#ffb347', grav: 0, kind: 'ring' });
    this.hitStop = 0.07; this.shake = Math.max(this.shake, 12 * (this.demo ? 0.3 : 1)); this.combo = 0;
    if (!fatal) snd.grunt(pan, pf.pitch);
    this.say(k.p[0].x, k.p[0].y - 54, tx(`BURNED!  -${dmg}`, `TERBAKAR!  -${dmg}`), '#ff942e', 20);
    if (fatal) this.die(pf, false);
  }

  /** an arrow against the beast: its head (its mouth, while it draws breath), its neck, its body, or a wing */
  private hitDragon(a: Arrow, tip: V): boolean {
    const d = this.dragon;
    if (!d || d.state === 'dying' || d.state === 'leave' || a.hitIds?.has(d)) return false;
    const rig = dragonRig(d.t, d.flap, d.glow, d.spit);
    const W = (q: V) => dragonToWorld(q, d.p, d.s, d.tilt);
    const part =
      dist(tip, W(rig.head)) < 25 * d.s || dist(tip, W(rig.mouth)) < 15 * d.s ? 'head'
      : Math.hypot((tip.x - d.p.x) / 1.9, tip.y - d.p.y) < 30 * d.s ? 'body'
      : rig.neck.some((q) => dist(tip, W(q)) < 13 * d.s) ? 'neck'
      : dist(tip, W(rig.wingMid)) < 42 * d.s ? 'wing'
      : null;
    if (!part) return false;
    const pan = this.pan(tip.x); const breath = d.state === 'inhale';
    a.p = tip;
    const hitDmg = a.dmg;
    this.pierceCreature(a, d);
    d.lastSkin = a.skin?.id;
    let dmg = a.maxPower ? d.maxHp * 0.34 : hitDmg * (part === 'head' ? 1.6 : part === 'neck' ? 1.2 : part === 'wing' ? 0.5 : 1) * skinHitMult(a.skin, part === 'head', part === 'wing');
    this.burst(tip, mul(a.vel, -1), 8, part === 'wing' ? '#9a171b' : '#e23b2e', 250);
    this.parts.push({ p: { ...tip }, vel: v(0, 0), life: 0, max: 0.22, r: part === 'head' ? 28 : 20, col: '#ffffff', grav: 0, kind: 'ring' });
    if (a.bow === 'thunder') this.triggerThunderHit(tip, a.ang, null, null, pan);
    else if (a.bow === 'fire') this.triggerFireHit(tip, a.ang, null, null, pan);
    else if (a.bow === 'poison') this.triggerPoisonHit(tip, a.ang, null, null, pan);
    this.hitStop = 0.04; this.shake = Math.max(this.shake, 6 * (this.demo ? 0.3 : 1));
    snd.hit(pan, part === 'head');
    if (!this.demo) { this.lvHits++; this.combo++; }
    let note = '';
    if (part === 'head' && breath) {
      // the fire goes off in its mouth
      dmg = dmg * 1.5 + d.maxHp * 0.08; // about a third of it at a blow: three good shots down its throat finish it
      d.state = 'stun'; d.st = 0; d.shots = 0; d.glow = 0; d.dip += 30;
      this.triggerFireHit(tip, a.ang + Math.PI, null, null, pan);
      this.parts.push({ p: { ...tip }, vel: v(0, 0), life: 0, max: 0.4, r: 70, col: '#ffb347', grav: 0, kind: 'ring' });
      this.shake = Math.max(this.shake, 14 * (this.demo ? 0.3 : 1));
      if (!this.demo) { this.slowT = Math.max(this.slowT, 0.5); this.slowK = 0.25; }
      snd.dragonRoar(pan);
      note = tx('BLAST IN MOUTH!', 'MELEDAK DI MULUT!');
      this.spawnCoins(tip, CFG.rewards.dragonMouth);
      if (!this.demo) { this.meta.stats.dragonMouth++; this.checkUnlocks(); }
      const r = d.rider;
      if (r && r.k.alive) { r.ai.state = 'wait'; r.ai.t = Math.max(r.ai.t, 2); if (r.k.react === 'none') startReact(r.k, 'teeter', 1.05); }
    } else if (part === 'wing') {
      // a hit in the wing costs it height - and its breath
      d.dip += 55;
      if (breath) { d.state = 'fly'; d.fireT = 2.4; d.shots = 0; note = tx('FIRE BREATH STOPPED!', 'NAPAS API BATAL!'); } else note = tx('WING HIT!', 'SAYAP KENA!');
    } else if (part === 'head') note = tx('DRAGON HEAD!', 'KEPALA NAGA!');
    dmg = Math.max(1, Math.round(dmg));
    d.hp -= dmg; d.flash = 1;
    const hd = W(rig.head);
    this.say(tip.x, tip.y - 26, `-${dmg}`, part === 'head' ? '#ffe14d' : '#ffffff', part === 'head' ? 22 : 18);
    if (note) this.say(hd.x, hd.y - 58 * d.s, note, breath ? '#ffe24a' : '#ffb38a', 17, 1.3);
    this.skinOnHit(a, d, part === 'head', tip, hitDmg);
    if (d.hp <= 0) this.killDragon(d, part === 'head');
    return true;
  }

  private killDragon(d: Dragon, head = false) {
    if (d.state === 'dying' || d.state === 'leave') return;
    const pan = this.pan(d.p.x);
      d.hp = 0; d.state = 'dying'; d.st = 0; d.vel = v(-70, -170); d.vr = 0.9; d.jaw = 0.9;
      d.plat.state = 'off'; d.plat.y = this.VH + 4000;
      snd.dragonRoar(pan);
      if (!this.demo) { this.slowT = Math.max(this.slowT, 0.9); this.slowK = 0.25; }
      const got = this.spawnCoins(d.p, CFG.rewards.dragonKill * skinKillGoldMult(d.lastSkin));
      this.say(d.p.x, d.p.y - 130 * d.s, this.demo ? tx('DRAGON SLAIN!', 'NAGA TUMBANG!') : tx(`DRAGON SLAIN!  +${got}`, `NAGA TUMBANG!  +${got}`), '#ffd23f', 24, 1.8);
      this.afterSkinKill(d.lastSkin, head);
      const r = d.rider;
      if (r && r.k.alive) { r.lastSkin = d.lastSkin; punchRag(r.k as unknown as ArcherRag, 1, 0.5, v(-200, -300), true); this.die(r, false); }
  }

  private stepDragon() {
    // balls of fire fly on whether or not the dragon is still about
    for (const fb of this.fireballs) {
      fb.life += H; fb.vel.y += 70 * H; fb.p = add(fb.p, mul(fb.vel, H));
      if (rand() < 0.7) this.parts.push({ p: v(fb.p.x + (rand() - 0.5) * 8, fb.p.y + (rand() - 0.5) * 8), vel: v(-fb.vel.x * 0.1 + (rand() - 0.5) * 40, -fb.vel.y * 0.1 - 30), life: 0, max: 0.3 + rand() * 0.25, r: 7 + rand() * 6, col: '#ff6a00', grav: -200, kind: 'fire', drag: 3, turb: 8, seed: rand() * 100 });
      const k = this.player.k;
      if (k.alive && dist(fb.p, lerpV(k.p[0], k.p[2], 0.45)) < fb.r + 22) { this.fireballHit(fb); continue; }
      if (fb.life > 6 || fb.p.y > this.VH + 200 || fb.p.x < -300) fb.dead = true;
    }
    this.fireballs = this.fireballs.filter((q) => !q.dead);

    const d = this.dragon;
    if (!d) return;
    if ((d.skinStunT ?? 0) > 0 && (!d.rider || d.rider.k.alive) && d.state !== 'dying' && d.state !== 'leave') return;
    const pk = this.player.k; const L = this.level; const stage = !!this.show;
    d.t += H; d.st += H; d.flash = Math.max(0, d.flash - H * 4); d.spit = Math.max(0, d.spit - H * 3.4); d.dip *= Math.exp(-2.4 * H);
    d.hpLag = damp(d.hpLag, Math.max(0, d.hp), 4, H);
    d.flap += H * (d.state === 'stun' ? 14 : d.state === 'dying' ? 2.6 : d.state === 'inhale' ? 4.8 : d.state === 'leave' ? 8.2 : 6.2);
    const ground = this.cy + this.pFyT * this.span;
    const prevX = d.p.x;
    const home = v(
      d.fx * this.VW + Math.sin(d.t * 0.45 + d.ph) * (stage ? 14 : 46),
      (stage ? ground - 165 : this.cy - 60) + Math.sin(d.t * 0.8 + d.ph) * (stage ? 22 : Math.min(70, this.span * 0.45)) + d.dip - Math.cos(d.flap - 0.35) * 6.5
    );
    const end = () => { d.plat.state = 'off'; d.plat.y = this.VH + 4000; this.dragon = null; };
    if (d.rider && !d.rider.k.alive && d.state !== 'dying' && d.state !== 'leave') {
      // nobody on its back any more: it has no quarrel with you
      d.state = 'leave'; d.st = 0; d.from = { ...d.p }; d.jaw = 0.6; d.glow = 0;
      d.plat.state = 'off'; d.plat.y = this.VH + 4000;
      snd.dragonRoar(this.pan(d.p.x));
      this.say(d.p.x, d.p.y - 120 * d.s, tx('DRAGON FLED!', 'NAGA KABUR!'), '#ffd23f', 22, 1.6);
    }
    if (d.state === 'in') {
      const u = clamp(d.st / 2.2, 0, 1);
      d.p = lerpV(d.from, home, u * u * (3 - 2 * u));
      if (u >= 1) d.state = 'fly';
    } else if (d.state === 'fly') {
      d.p = v(damp(d.p.x, home.x, 3, H), damp(d.p.y, home.y, 3, H));
      d.jaw = damp(d.jaw, 0, 6, H); d.glow = damp(d.glow, 0, 5, H);
      if (this.stage === 'play' && pk.alive) d.fireT -= H;
      if (d.fireT <= 0) { d.state = 'inhale'; d.st = 0; d.shots = L >= 6 ? 2 : 1; snd.dragonInhale(this.pan(d.p.x)); }
    } else if (d.state === 'inhale') {
      // it rears its head and draws breath: the throat lights up - this is when its mouth is open to an arrow
      d.p = v(damp(d.p.x, home.x, 3, H), damp(d.p.y, home.y - 14, 3, H));
      d.jaw = damp(d.jaw, 1, 7, H); d.glow = clamp(d.st / 1.05, 0, 1);
      if (rand() < 0.35) {
        // embers drawn in toward the mouth
        const m = dragonToWorld(dragonRig(d.t, d.flap, d.glow).mouth, d.p, d.s, d.tilt);
        const a = Math.PI + (rand() - 0.5) * 1.6; const r = 50 + rand() * 40;
        this.parts.push({ p: v(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r), prev: v(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r), vel: v(-Math.cos(a) * r * 3.2, -Math.sin(a) * r * 3.2), life: 0, max: 0.28, r: 1.5, col: rand() < 0.5 ? '#ffe552' : '#ff8a2a', grav: 0, kind: 'ember' });
      }
      if (d.st >= 1.05) {
        this.spitFire(d);
        if (--d.shots > 0) d.st = 0.5;
        else { d.state = 'fly'; d.fireT = Math.max(3.2, 6 - Math.min(L, 10) * 0.2) + rand() * 2; }
      }
    } else if (d.state === 'stun') {
      d.p = v(damp(d.p.x, home.x + 30, 2, H) + Math.sin(d.st * 50) * 0.8, damp(d.p.y, home.y + 46, 2.5, H));
      d.jaw = 0.7; d.glow = damp(d.glow, 0, 6, H);
      if (rand() < 0.25) {
        const m = dragonToWorld(dragonRig(d.t, d.flap, d.glow).mouth, d.p, d.s, d.tilt);
        this.parts.push({ p: m, vel: v((rand() - 0.5) * 40, -50 - rand() * 40), life: 0, max: 0.5 + rand() * 0.3, r: 7 + rand() * 5, col: '#241c1c', grav: -105, kind: 'smoke', drag: 2.2, turb: 4 });
      }
      if (d.st > 1.5) { d.state = 'fly'; d.fireT = 3 + rand() * 1.5; }
    } else if (d.state === 'leave') {
      const u = clamp(d.st / 2.6, 0, 1);
      d.p = lerpV(d.from, v(this.VW * 1.7 + 320, -280), u * u);
      d.jaw = damp(d.jaw, 0, 3, H);
      if (u >= 1) end();
    } else {
      // shot out of the sky: it falls, turning over
      d.vel.y += 700 * H; d.p = add(d.p, mul(d.vel, H)); d.tilt += d.vr * H;
      if (rand() < 0.4) this.parts.push({ p: v(d.p.x + (rand() - 0.5) * 80, d.p.y + (rand() - 0.5) * 40), vel: v((rand() - 0.5) * 40, -40), life: 0, max: 0.6, r: 9 + rand() * 6, col: '#241c1c', grav: -105, kind: 'smoke', drag: 2.2, turb: 4 });
      if (d.p.y > this.VH + 340) end();
    }
    const vx = (d.p.x - prevX) / H;
    if (d.state !== 'dying') {
      const targetTilt =
        clamp((d.p.y - home.y) * 0.0014 + vx * 0.00028, -0.14, 0.14) +
        Math.sin(d.flap - 0.35) * 0.025 -
        d.glow * 0.045 +
        d.spit * 0.065;
      d.tilt = damp(d.tilt, targetTilt, 4.5, H);
    }
  }

  /** from the codex: bring the fort or the dragon into the level being played, right now (they count as extra enemies) */
  spawnSpecial(kind: 'fort' | 'dragon') {
    if (this.demo || this.stage !== 'play') return;
    if (kind === 'fort') {
      if (this.fort) return;
      this.total += 2; this.fortDue = false; this.spawnFort();
    } else {
      this.spawnDragon();
    }
  }

  /* ---------------- how the fort and the dragon plug into the world ---------------- */

  /** grounds that are not floating islands - the fort's floors, the dragon's saddle - go where their owner goes */
  private placeExtras() {
    const fort = this.fort;
    if (fort) {
      for (const st of fort.stands) {
        if (st.plat.state !== 'off') { st.plat.x = fort.base.x + st.x; st.plat.y = fort.base.y - st.y; }
      }
    }
    const d = this.dragon;
    if (d && d.plat.state !== 'off') {
      const q = dragonToWorld(dragonRig(d.t, d.flap, d.glow, d.spit).saddle, d.p, d.s, d.tilt);
      d.plat.x = q.x; d.plat.y = q.y;
    }
  }

  private stepExtras() { this.stepFort(); this.stepDragon(); }

  /** one of the player's arrows against a ball of fire, the fort's timbers or the dragon; true if it struck any of them */
  private hitExtras(a: Arrow, tip: V): boolean {
    if (a.team !== 0) return false;
    const fb = this.fireballs.find((q) => dist(tip, q.p) < q.r + 14);
    if (fb) {
      // shot out of the air, like a boss's weapon
      const pan = this.pan(fb.p.x);
      fb.dead = true; a.p = tip;
      if (!a.maxPower) a.dead = true;
      this.triggerFireHit(fb.p, a.ang, null, null, pan);
      this.parts.push({ p: { ...fb.p }, vel: v(0, 0), life: 0, max: 0.3, r: 44, col: '#ffe9b0', grav: 0, kind: 'ring' });
      this.hitStop = 0.05;
      if (!this.demo) { this.slowT = Math.max(this.slowT, 0.25); this.slowK = 0.35; this.lvHits++; this.combo++; }
      snd.pop(pan);
      const got = this.spawnCoins(fb.p, CFG.rewards.fireball);
      this.say(fb.p.x, fb.p.y - 26, this.demo ? tx('FIREBALL SNUFFED!', 'BOLA API PADAM!') : tx(`FIREBALL SNUFFED!  +${got}`, `BOLA API PADAM!  +${got}`), '#ffe24a', 19, 1.2);
      return true;
    }
    const fort = this.fort;
    if (fort) {
      for (let i = 0; i < fort.blocks.length; i++) {
        const b = fort.blocks[i];
        if (b.state !== 'up') continue;
        const bx = blockBox(b, fort.base.x, fort.base.y);
        if (tip.x < bx.x0 || tip.x > bx.x1 || tip.y < bx.y0 || tip.y > bx.y1) continue;
        a.p = tip;
        this.hitBlock(fort, i, a);
        return true;
      }
    }
    return this.hitDragon(a, tip);
  }

  /** behind the fighters: the fort as it stands, and the dragon (its rider is drawn over it with the other enemies) */
  private drawExtrasBack(ctx: Ctx) {
    const fort = this.fort;
    if (fort) {
      const { base, blocks } = fort;
      ctx.globalAlpha = base.state === 'on' ? 1 : clamp(base.rise * 1.6, 0, 1);
      drawFortBackdrop(ctx, blocks, base.x, base.y, fort.fallen, this.rt);
      for (const b of blocks) if (b.state === 'up') drawFortBlock(ctx, b, base.x, base.y, this.rt);
      drawFortFlag(ctx, blocks[FORT.ROOF], base.x, base.y, this.rt);
      ctx.globalAlpha = 1;
    }
    const d = this.dragon;
    if (d) drawDragon(ctx, d.p, d.s, d.tilt, d.t, d.flap, { jaw: d.jaw, glow: d.glow, flash: d.flash, state: d.state, spit: d.spit });
  }

  /** in front of them: timbers on their way down, balls of fire, the dragon's bar, and what to aim at */
  private drawExtrasFront(ctx: Ctx) {
    const hints = !this.demo || !!this.show;
    const pu = 0.5 + 0.5 * Math.sin(this.rt * 5.5); const fast = 0.5 + 0.5 * Math.sin(this.rt * 18);
    const fort = this.fort;
    if (fort) {
      const { base, blocks } = fort;
      for (const b of blocks) if (b.state === 'fall') drawFortBlock(ctx, b, base.x, base.y, this.rt);
      if (hints && base.state === 'on' && fort.guards.some((g) => g.k.alive)) {
        // Highlight both structural weak joints ("Sisi Lemah"): Lower Foundation Keystone & Upper Roof Truss
        const low = blocks[FORT.W_LOW];
        const high = blocks[FORT.W_HIGH];
        const drawWeakTarget = (wb: FortBlock, txt: string, ox: number) => {
          const c = blockCentre(wb, base.x, base.y);
          const rad = 14 + pu * 3.5;
          ctx.save();
          ctx.strokeStyle = '#ffd23f';
          ctx.globalAlpha = 0.55 + 0.42 * pu;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
          ctx.stroke();
          // Crosshair ticks
          ctx.beginPath();
          for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
            ctx.moveTo(c.x + Math.cos(a) * (rad - 4), c.y + Math.sin(a) * (rad - 4));
            ctx.lineTo(c.x + Math.cos(a) * (rad + 4), c.y + Math.sin(a) * (rad + 4));
          }
          ctx.stroke();
          ctx.restore();
          this.text(ctx, txt, c.x + ox, c.y, 11.5, '#ffe24a', 0.72 + 0.28 * pu);
        };
        if (low && low.state === 'up') drawWeakTarget(low, tx('WEAK JOINT →', 'TITIK LEMAH →'), -68);
        if (high && high.state === 'up') drawWeakTarget(high, tx('ROOF JOINT →', 'SENDI ATAP →'), -64);
      }
    }
    for (const fb of this.fireballs) {
      const r = fb.r * (1 + 0.12 * Math.sin(this.rt * 30 + fb.life * 9));
      if (this.fireSpr) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85;
        ctx.drawImage(this.fireSpr as unknown as CanvasImageSource, fb.p.x - r * 2.6, fb.p.y - r * 2.6, r * 5.2, r * 5.2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      for (const [col, k] of [['#ff7b14', 1], ['#ffd24a', 0.68], ['#fff6d0', 0.36]] as [string, number][]) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(fb.p.x, fb.p.y, r * k, 0, Math.PI * 2); ctx.fill();
      }
      if (hints) {
        ctx.save();
        ctx.strokeStyle = fast > 0.5 ? '#ff4d4d' : '#ffd23f'; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.78;
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(fb.p.x, fb.p.y, 28 + fast * 5, this.rt * 4, this.rt * 4 + Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        this.text(ctx, tx('SHOOT FIREBALL!', 'PANAH BOLA API!'), fb.p.x, fb.p.y - 38, 12, '#ffe24a', 0.92);
      }
    }
    const d = this.dragon;
    if (d && d.state !== 'dying') {
      // its own bar, over its back
      const al = d.state === 'in' ? clamp(d.st - 1, 0, 1) : d.state === 'leave' ? clamp(1 - d.st, 0, 1) : 1;
      // (over its head, well clear of the rider's own bar)
      const hd = dragonToWorld(dragonRig(d.t, d.flap, d.glow).head, d.p, d.s, d.tilt);
      const bw = 112; const x0 = hd.x - bw / 2 - 8; const y0 = hd.y - 46 * d.s;
      const hf = clamp(d.hp / d.maxHp, 0, 1); const lf = clamp(d.hpLag / d.maxHp, hf, 1);
      ctx.globalAlpha = al;
      ctx.fillStyle = '#142b42'; ctx.fillRect(x0 - 2.5, y0 - 2.5, bw + 5, 13);
      ctx.strokeStyle = '#8faabf'; ctx.lineWidth = 1.4; ctx.strokeRect(x0 - 2, y0 - 2, bw + 4, 12);
      ctx.fillStyle = 'rgba(34,74,114,0.9)'; ctx.fillRect(x0, y0, bw, 8);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 + bw * hf, y0, bw * (lf - hf), 8);
      ctx.fillStyle = '#c41c22'; ctx.fillRect(x0, y0, bw * hf, 8);
      ctx.fillStyle = '#ff7b4a'; ctx.fillRect(x0, y0, bw * hf, 3.4);
      this.text(ctx, tx('RED DRAGON', 'NAGA MERAH'), x0 + bw / 2, y0 - 12, 12, '#ffd9c8', 0.95 * al);
      if (hints && d.state === 'inhale') {
        // the moment its mouth is open to an arrow
        const m = dragonToWorld(dragonRig(d.t, d.flap, d.glow).mouth, d.p, d.s, d.tilt);
        ctx.save();
        ctx.strokeStyle = fast > 0.5 ? '#ffffff' : '#ffd23f'; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.9;
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(m.x, m.y, 22 + fast * 5, -this.rt * 4, -this.rt * 4 + Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        this.text(ctx, tx('SHOOT ITS MOUTH!', 'PANAH MULUTNYA!'), m.x - 10, m.y + 40, 13 + fast * 1.5, '#ffe24a', 0.95);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- the codex stage ---------------- */

  /**
   * The enemy codex: a small self-playing bout against one kind of enemy only, framed close.
   * The archer on the left is the same one who fights on the title screen; here he shows how each enemy is beaten.
   */
  showcase(kind: FoeShow) {
    this.demo = true; this.show = kind; this.paused = false;
    this.clearWorld(); this.makePlayer(); this.setupDemo();
    this.level = kind === 'heavy' || kind === 'vampire' ? 4 : kind === 'shield' ? 2 : 1;
    this.maxAlive = 1; this.spawnT = 0.35; this.batT = 0.5;
    if (kind === 'hostage') this.spawnShowHostage();
  }
  /** which man stands on the far ground of the codex stage (none while a bat or the prisoner is being shown) */
  private showFoot(): Kind | undefined {
    const k = this.show;
    return k === 'archer' || k === 'helm' || k === 'heavy' || k === 'shield' ? k : undefined;
  }
  private spawnShowHostage() {
    this.spawnHostage();
    const hs = this.hostage;
    if (!hs) return;
    hs.plat.fx = (this.pPlat.x + 290) / this.VW; hs.plat.fy = this.pFyT;
    this.placePlat(hs.plat);
  }
  /** a stand-in "fighter" at a point in the air, so the self-playing archer can aim at things that are not men */
  private ghost(p: V): Fighter { return { k: { p: [p, p, p] } } as unknown as Fighter; }
  /** who the self-playing archer shoots at: the nearest man - or, on the codex stage, the bat or the rope on show */
  private demoTarget(nearest: Fighter | null, lead = 1.5): Fighter | null {
    if (this.show === 'bat' || this.show === 'vampire') {
      const b = this.bats.find((x) => x.state !== 'dead' && x.state !== 'in');
      if (!b) return null;
      // in its lane he shoots at where it will be by the time the arrow gets there (`lead` seconds on: his draw,
      // his hold and the flight); in a dive, straight at it
      return this.ghost(b.state === 'hover' ? this.batHome(b, this.t + lead) : b.p);
    }
    if (this.show === 'hostage') {
      const hs = this.hostage;
      if (!hs || this.hostState !== 1 || hs.plat.state !== 'on') return null;
      const [top, bot] = this.rope(hs);
      return this.ghost(lerpV(top, bot, 0.5));
    }
    if (this.show === 'fort' && this.fort && this.fort.base.state === 'on') {
      // On the codex stage: aim deliberately at the fortress's structural weak joints ("Sisi Lemah")!
      const { base, blocks } = this.fort;
      const high = blocks[FORT.W_HIGH];
      const low = blocks[FORT.W_LOW];
      if (high && high.state === 'up' && Math.floor(this.t / 5) % 2 === 1) {
        return this.ghost(blockCentre(high, base.x, base.y));
      }
      if (low && low.state === 'up') {
        return this.ghost(blockCentre(low, base.x, base.y));
      }
    }
    if (this.show === 'dragon' && this.dragon && this.dragon.state === 'inhale') {
      const d = this.dragon;
      return this.ghost(dragonToWorld(dragonRig(d.t, d.flap, d.glow, d.spit).mouth, d.p, d.s, d.tilt));
    }
    return nearest;
  }
  /** keeps the codex stage supplied: one bat at a time, or the prisoner tied up again after each rescue */
    private stepShow() {
    if (this.show === 'fort' || this.show === 'dragon') {
      // one fort, or one dragon, at a time: the next comes a moment after the last is gone
      if (this.show === 'fort' ? this.fort : this.dragon) return;
      this.batT -= H;
      if (this.batT <= 0) { if (this.show === 'fort') this.spawnFort(); else this.spawnDragon(); this.batT = 1.8; }
      return;
    }
    if (this.show === 'bat' || this.show === 'vampire') {
      this.batT -= H;
      if (this.batT <= 0 && !this.bats.some((b) => b.state !== 'dead')) { this.spawnBat(); this.batT = 1.3; }
    } else if (this.show === 'hostage' && !this.hostage) {
      this.batT -= H;
      if (this.batT <= 0) { this.spawnShowHostage(); this.batT = 1.2; }
    }
  }

  /* ---------------- shooting ---------------- */

  private fire(f: Fighter) {
    const k = f.k; const mine = f.team === 0 && !this.demo;
    const ang = mine ? steadyRelease(fireAngle(k), k.aim, this.training.stability) : fireAngle(k);
    const isMaxPwr = f.team === 0 && !this.demo && this.maxPower;
    const pull = isMaxPwr ? 1 : k.pull;
    const perk = mine && !isMaxPwr ? takeSkinShot(this.head, this.skinState, pull, f.hp / f.maxHp) : undefined;
    const playerSpeed = speedOf(pull) * (perk?.speed ?? 1);
    const sp = f.team === 0 ? (isMaxPwr ? (430 + 800) * MAX_SPEED_MULT : mine ? trainedArrowSpeed(playerSpeed, this.training) : playerSpeed) : foeSpeedOf(pull, f.lvl);
    const dir = fromAngle(ang);
    // PANAH GANDA (big-boss reward only, never sold): 2 arrows @60% each for a limited number of shots per level
    const ganda = mine && !isMaxPwr && this.run.gandaLeft > 0;
    if (ganda) this.run.gandaLeft--;
    const n = f.team === 0 ? (ganda ? CFG.cards.ganda.arrows : 1) : (f.kind === 'boss' && this.level >= 15) || (f.lvl >= 4 && f.kind !== 'axer' && rand() < 0.35) ? 2 : 1;
    const bowUsed: BowId = f.team === 0 ? this.bow : 'wood';
    const spread = mine ? trainedSpread(CFG.cards.ganda.spread, this.training) : CFG.cards.ganda.spread;
        // (bow damage multipliers now live in config.ts → CFG.bowDmg)
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * spread;
      const tip = add(k.p[4], fromAngle(a, 14 * k.s));
      const dmg = f.team === 0 ? (isMaxPwr ? 9999 : arrowDmg(pull, bowUsed) * (mine ? playerDmgMult(this.run) * (ganda ? CFG.cards.ganda.pct : 1) * (perk?.damage ?? 1) : 1)) : f.dmg * (0.7 + 0.3 * pull);
      this.arrows.push({
        p: tip, prev: { ...tip }, vel: fromAngle(a, sp), ang: a, team: f.team, dmg,
        main: i === Math.floor((n - 1) / 2), near: false, stuckIn: null, ox: 0, oy: 0, life: 0, dead: false, bow: bowUsed,
        maxPower: isMaxPwr, pierced: 0, hitIds: isMaxPwr ? new Set<SkinTarget>() : undefined,
        src: f.team === 1 ? this.foeLabel(f) : undefined, pierceLeft: mine ? lvVal(CFG.cards.tembus.pierce, cardLv(this.run, 'tembus')) + (perk?.pierce ?? 0) : 0, trail: mine ? [] : undefined,
        skin: perk ? { ...perk, scale: ganda ? CFG.cards.ganda.pct : 1 } : undefined,
      });
    }
    if (perk?.proc) this.skinNotice(perk.id, skinPerkName(perk.id));
    // Natural Level-1 release burst aligned with bow angle `ang` and real world gravity
    const releasePt = add(k.p[4], mul(dir, 14 * k.s));
    if (bowUsed === 'thunder') {
      for (let i = 0; i < 6; i++) {
        const sa = ang + (rand() - 0.5) * 0.55; const ssp = 120 + rand() * 220;
        this.parts.push({ p: { ...releasePt }, prev: { ...releasePt }, vel: v(Math.cos(sa) * ssp, Math.sin(sa) * ssp), life: 0, max: 0.14 + rand() * 0.12, r: 1.5, col: i % 2 ? '#00f0ff' : '#ffffff', grav: 640, kind: 'spark', drag: 3.5 });
      }
      snd.thunderRelease(pull, this.pan(k.p[4].x));
    } else if (bowUsed === 'fire') {
      for (let i = 0; i < 6; i++) {
        const sa = ang + (rand() - 0.5) * 0.45; const ssp = 85 + rand() * 140;
        this.parts.push({ p: { ...releasePt }, vel: v(Math.cos(sa) * ssp, Math.sin(sa) * ssp), life: 0, max: 0.22 + rand() * 0.16, r: 4.5 + rand() * 3.5, col: '#ff7b1c', grav: -220, kind: 'fire', drag: 3.8, turb: 7, seed: rand() * 50 });
      }
      snd.fireRelease(pull, this.pan(k.p[4].x));
    } else if (bowUsed === 'poison') {
      for (let i = 0; i < 5; i++) {
        const sa = ang + (rand() - 0.5) * 0.45; const ssp = 90 + rand() * 150;
        this.parts.push({ p: { ...releasePt }, prev: { ...releasePt }, vel: v(Math.cos(sa) * ssp, Math.sin(sa) * ssp), life: 0, max: 0.24 + rand() * 0.18, r: 1.8 + rand() * 1.4, col: i % 2 ? '#d4ff00' : '#6eff00', grav: 720, kind: 'acid', drag: 1.6 });
      }
      snd.acidSpit(this.pan(k.p[4].x));
    } else {
      snd.release(f.team === 0 ? pull : pull * 0.6, this.pan(k.p[4].x));
    }
    // the release: bow hand jumps forward, the string hand swings back, the torso rocks, the muscles go soft a moment
    impulse(k, 4, mul(dir, 100 * pull)); impulse(k, 3, mul(dir, 45 * pull));
    impulse(k, 6, mul(dir, -250 * pull)); impulse(k, 5, mul(dir, -170 * pull));
    impulse(k, 1, mul(dir, -115 * pull)); impulse(k, 0, mul(dir, -160 * pull)); impulse(k, 2, mul(dir, -45 * pull));
    k.muscle = Math.min(k.muscle, 0.58);
    k.exert = Math.min(1, k.exert + 0.3);
    k.pull = 0; k.nock = 0; f.vib = 0;
    f.plat.vel += 26 * pull;
    if (f.team === 0 && !this.demo) { this.hint = false; this.holdAim = 0.55; this.shake = Math.max(this.shake, 1.5 + pull * 3); this.lvShots++; }
    if (this.arrows.length > 60) this.arrows.splice(0, this.arrows.length - 60);
  }

  /** pick an angle and draw for a lobbed shot at the target, with an error that shrinks every shot */
  private aimAt(f: Fighter, tgt: Fighter) {
    const from = f.k.p[1]; const tk = tgt.k;
    // the self-playing archer knows the trick: while a shield is held out against him he goes for the shins under it
    const shins = f.team === 0 && !!tgt.shield && tgt.shield.hp > 0 && tgt.shield.g > 0.5;
    const to = shins ? lerpV(lerpV(tk.p[7], tk.p[9], 0.5), lerpV(tk.p[8], tk.p[10], 0.5), 0.6) : lerpV(tk.p[1], tk.p[2], 0.35);
    const dx = to.x - from.x; const dy = to.y - from.y; const X = Math.max(40, Math.abs(dx));
    let pull = clamp(0.5 + X / 1300 + rand() * 0.12 + (f.lvl >= 3 ? 0.15 : 0), 0.55, 1);
    const calcSp = (p: number) => (f.team === 0 ? speedOf(p) : foeSpeedOf(p, f.lvl));
    const G = AG * (this.demo ? 1 : this.mods.grav);
    let sp = calcSp(pull);
    let disc = sp ** 4 - G * (G * X * X - 2 * dy * sp * sp);
    if (disc < 0) { pull = 1; sp = calcSp(1); disc = sp ** 4 - G * (G * X * X - 2 * dy * sp * sp); }
    const th = (disc < 0 ? Math.PI / 4 : Math.atan((sp * sp - Math.sqrt(disc)) / (G * X))) + gauss() * f.ai.spread;
    f.ai.aim = Math.atan2(-Math.sin(th), Math.sign(dx || -1) * Math.cos(th));
    f.ai.pull = pull;
    f.ai.drawT = f.kind === 'boss' || f.lvl >= 3 ? 0.44 + rand() * 0.18 : f.lvl === 2 ? 0.58 + rand() * 0.22 : 0.74 + rand() * 0.28;
    if (f.kind === 'axer') { f.ai.pull = 1; f.ai.drawT = 0.76; } // dramatic wind-up before hurling
  }

  /** wait → raise and draw → hold a breath → loose. Runs the enemies, and the player on the title screen */
  private think(f: Fighter, tgt: Fighter | null, can: boolean) {
    const k = f.k; const ai = f.ai;
    if (ai.state === 'wait') {
      k.aiming = damp(k.aiming, 0, 4, H); k.pull = damp(k.pull, 0, 12, H);
      if (can) ai.t -= H;
      if (can && tgt && ai.t <= 0 && onString(k) && k.react === 'none' && k.muscle > 0.85 && k.hurt < 0.05) {
        const busy = f.team === 1 ? this.foes.reduce((n, o) => n + (o.k.alive && o.ai.state !== 'wait' ? 1 : 0), 0) : 0;
        if (busy >= (this.level >= 9 ? 3 : 2) && f.kind !== 'axer' && f.lvl < 3) ai.t = 0.35 + rand() * 0.4;
        else { this.aimAt(f, tgt); ai.state = 'draw'; }
      }
    } else if (ai.state === 'draw') {
      k.aim = angLerp(k.aim, ai.aim, 1 - Math.exp(-10 * H));
      k.aiming = damp(k.aiming, 1, 9, H);
      if (k.aiming > 0.6) k.pull = Math.min(ai.pull, k.pull + (H * ai.pull) / ai.drawT);
      if (!can || !tgt) { ai.state = 'wait'; ai.t = 1; }
      else if (k.pull >= ai.pull - 0.001 && k.aiming > 0.97) { ai.state = 'hold'; ai.t = f.lvl >= 3 ? 0.1 + rand() * 0.15 : 0.16 + rand() * 0.25; }
    } else {
      ai.t -= H;
      if (!can || !tgt) { ai.state = 'wait'; ai.t = 1; }
      else if (ai.t <= 0) {
        if (f.kind === 'axer') this.throwAxe(f); else this.fire(f);
        ai.state = 'wait';
        const lvlWaitMult = f.lvl >= 3 ? 0.65 : f.lvl === 2 ? 0.82 : 1.05;
        ai.t = f.team === 0 ? 0.5 + rand() * 0.8 : f.kind === 'axer' ? 1.15 + rand() * 0.6 : Math.max(1.15, (2.6 - this.level * 0.06) * lvlWaitMult) + rand() * 0.9;
        ai.spread = Math.max(ai.floor, ai.spread * (f.lvl >= 3 ? 0.68 : 0.8));
      }
    }
  }

  private hitTest(tip: V, f: Fighter): { stick: number; u: number } | null {
    const P = f.k.p; const s = f.k.s;
    if (Math.abs(tip.x - P[2].x) > 95 * s || Math.abs(tip.y - P[2].y) > 115 * s) return null;
    if (dist(tip, P[0]) < HEAD_R * s + 2.5) return { stick: 0, u: 1 };
    let best: { stick: number; u: number } | null = null; let bd = 1e9;
    for (let i = 1; i < RAG_STICKS.length; i++) {
      const [a, b] = RAG_STICKS[i];
      const r = segDist(tip, P[a], P[b]);
      if (r.d < (i === 1 ? 5.6 : 4.6) * s + 2 && r.d < bd) { bd = r.d; best = { stick: i, u: r.t }; }
    }
    return best;
  }

  private burst(p: V, dir: V, n: number, col: string, speed = 260) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dir.y, dir.x) + (rand() - 0.5) * 1.5;
      const sp = speed * (0.3 + rand() * 0.9);
      this.parts.push({ p: { ...p }, vel: v(Math.cos(a) * sp, Math.sin(a) * sp - 60), life: 0, max: 0.35 + rand() * 0.4, r: 1.6 + rand() * 2.6, col, grav: 900 });
    }
    if (this.parts.length > 520) this.parts.splice(0, this.parts.length - 520);
  }

  /* ---------------- localized Level-1 elemental simulation impacts ---------------- */

  /**
   * Level-1 Localized Electro-Shock Impact:
   * Emits fine, gravity-driven sparks along the arrow's impact/reflection vector `ang`
   * and localizes the plasma discharge ONLY to the specific body part (`hit.stick`) that was struck!
   */
  private triggerThunderHit(at: V, ang: number, victim: Fighter | null, hit: { stick: number; u: number } | null, pan: number) {
    snd.zap(pan, false);
    this.shake = Math.max(this.shake, 7 * (this.demo ? 0.3 : 1));
    this.parts.push({ p: { ...at }, vel: v(0, 0), life: 0, max: 0.22, r: 24, col: '#00f0ff', grav: 0, kind: 'ring' });
    // Fine electric sparks spraying along impact reflection + falling with real gravity
    for (let i = 0; i < 12; i++) {
      const refAng = (i < 7 ? ang + Math.PI : ang) + (rand() - 0.5) * 1.3;
      const sp = 95 + rand() * 250;
      this.parts.push({
        p: { ...at }, prev: { ...at },
        vel: v(Math.cos(refAng) * sp, Math.sin(refAng) * sp - 35),
        life: 0, max: 0.22 + rand() * 0.25, r: 1.4 + rand() * 1.1,
        col: i % 2 === 0 ? '#ffffff' : '#00f0ff',
        grav: 680, kind: 'spark', drag: 2.4,
      });
    }
    if (victim && hit) {
      victim.shockT = Math.max(victim.shockT, 1.8);
      // Localize initial plasma arc strictly to the struck bone (`hit.stick`)
      const [ia, ib] = RAG_STICKS[hit.stick];
      this.arcs.push({ a: { ...at }, b: { ...victim.k.p[ia] }, life: 0, max: 0.2, spread: 5, segs: 5, col: '#00f0ff', lw: 1.35, seed: rand() * 100 });
      this.arcs.push({ a: { ...at }, b: { ...victim.k.p[ib] }, life: 0, max: 0.2, spread: 5, segs: 5, col: '#00f0ff', lw: 1.35, seed: rand() * 100 });
    } else {
      for (let i = 0; i < 2; i++) {
        const a = ang + Math.PI + (rand() - 0.5) * 1.4; const d = 18 + rand() * 20;
        this.arcs.push({ a: { ...at }, b: v(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d), life: 0, max: 0.16, spread: 5, segs: 5, col: '#00f0ff', lw: 1.3, seed: rand() * 100 });
      }
    }
  }

  /**
   * Level-1 Localized Fluid Flame Impact:
   * Launches flame wisps along the arrow's momentum vector `ang` which decelerate via air drag
   * while thermal buoyancy (`grav = -240`) curves them smoothly upward, plus falling gravity embers!
   */
  private triggerFireHit(at: V, ang: number, victim: Fighter | null, _hit: { stick: number; u: number } | null, pan: number) {
    snd.fireball(pan);
    this.shake = Math.max(this.shake, 7 * (this.demo ? 0.3 : 1));
    this.parts.push({ p: { ...at }, vel: v(0, 0), life: 0, max: 0.22, r: 24, col: '#ff881c', grav: 0, kind: 'ring' });
    // Directional fluid flame splash that curves upward with buoyancy
    for (let i = 0; i < 11; i++) {
      const a = ang + (rand() - 0.5) * 1.25;
      const sp = 35 + rand() * 125;
      this.parts.push({
        p: v(at.x + (rand() - 0.5) * 6, at.y + (rand() - 0.5) * 6),
        vel: v(Math.cos(a) * sp, Math.sin(a) * sp - 35),
        life: 0, max: 0.32 + rand() * 0.28, r: 5.5 + rand() * 4.5,
        col: '#ff6a00', grav: -230, kind: 'fire', drag: 3.6, turb: 8 + rand() * 5, seed: rand() * 100,
      });
    }
    // Small glowing embers that fall with real downward gravity and bounce on platforms
    for (let i = 0; i < 10; i++) {
      const a = ang + Math.PI + (rand() - 0.5) * 1.6;
      const sp = 75 + rand() * 210;
      this.parts.push({
        p: { ...at }, prev: { ...at },
        vel: v(Math.cos(a) * sp, Math.sin(a) * sp - 55),
        life: 0, max: 0.38 + rand() * 0.38, r: 1.4 + rand() * 1.2,
        col: i % 2 ? '#ffe552' : '#ff6219', grav: 760, kind: 'ember', drag: 1.0,
      });
    }
    // Subtle thermal smoke wisp rising above the impact
    for (let i = 0; i < 4; i++) {
      this.parts.push({
        p: { ...at }, vel: v((rand() - 0.5) * 35, -55 - rand() * 40),
        life: 0, max: 0.5 + rand() * 0.3, r: 6 + rand() * 5,
        col: '#241c1c', grav: -105, kind: 'smoke', drag: 2.2, turb: 4,
      });
    }
    if (victim) victim.burnT = Math.max(victim.burnT, 2.4);
  }

  /** Spike Fuze: Level-1 Localized Thorn Burst aligned with impact angle & gravity */
  private triggerSpikeHit(at: V, ang: number, victim: Fighter | null, pan: number, head = false) {
    snd.snap(pan);
    this.parts.push({ p: { ...at }, vel: v(0, 0), life: 0, max: 0.2, r: 22, col: '#6bff2b', grav: 0, kind: 'ring' });
    for (let i = 0; i < 9; i++) {
      const a = ang + (rand() - 0.5) * 1.8;
      const sp = 110 + rand() * 180;
      this.parts.push({
        p: { ...at }, prev: { ...at },
        vel: v(Math.cos(a) * sp, Math.sin(a) * sp - 40),
        life: 0, max: 0.32 + rand() * 0.2, r: 2.6,
        col: i % 2 ? '#7dff24' : '#1fa62a', grav: 720, kind: 'thorn', rot: a,
      });
    }
    if (victim && victim.k.alive) {
      victim.hpLag = Math.max(victim.hpLag, victim.hp);
      victim.hpLagHold = 0.28;
      victim.barBump = 1;
      const damage = Math.round(10 * (victim.team === 0 && !this.demo ? (1 - this.training.dmgReduce) * skinIncomingMult(this.head, head) : 1));
      victim.hp -= damage;
      this.say(victim.k.p[0].x, victim.k.p[0].y - 46, tx(`THORNS! -${damage}`, `DURI! -${damage}`), '#8eff3b', 15, 0.95);
    }
  }

  /**
   * Poisonous Whisper: Level-1 Localized Xenomorph Acid Splatter & Gravity Drip
   * Sprays cohesive molecular acid droplets along the impact vector `ang` that arc downward under real gravity (`grav = 740`).
   */
  private triggerPoisonHit(at: V, ang: number, victim: Fighter | null, _hit: { stick: number; u: number } | null, pan: number) {
    snd.acidSpit(pan);
    this.shake = Math.max(this.shake, 6 * (this.demo ? 0.3 : 1));
    this.parts.push({ p: { ...at }, vel: v(0, 0), life: 0, max: 0.22, r: 22, col: '#cfff04', grav: 0, kind: 'ring' });
    // Directional Xenomorph acid droplets following parabolic gravity arcs
    for (let i = 0; i < 12; i++) {
      const a = (i < 8 ? ang : ang + Math.PI) + (rand() - 0.5) * 1.2;
      const sp = 65 + rand() * 190;
      this.parts.push({
        p: { ...at }, prev: { ...at },
        vel: v(Math.cos(a) * sp, Math.sin(a) * sp - 45),
        life: 0, max: 0.38 + rand() * 0.35, r: 1.8 + rand() * 1.8,
        col: i % 3 === 0 ? '#eaff66' : i % 3 === 1 ? '#a6ff00' : '#3dff14',
        grav: 740, kind: 'acid', drag: 1.4, seed: rand() * 50,
      });
    }
    // Subtle corrosive vapor wisps rising from the splash
    for (let i = 0; i < 4; i++) {
      this.parts.push({
        p: { ...at }, vel: v((rand() - 0.5) * 28, -45 - rand() * 35),
        life: 0, max: 0.45 + rand() * 0.3, r: 5 + rand() * 4,
        col: '#b8ff70', grav: -95, kind: 'acidSmoke', drag: 2.4, turb: 5,
      });
    }
    if (victim) victim.poisonT = Math.max(victim.poisonT, 2.8);
  }

  /* ---------------- equipped skin effects ---------------- */

  private skinNotice(id: SkinId, text: string) {
    const f = SKIN_RULES.fx;
    this.say(this.player.k.p[0].x, this.player.k.p[0].y - f.noticeY, text, SKIN_PERKS[id].color, f.noticeSize, f.noticeSeconds);
  }

  private skinPosition(target: SkinTarget): V { return 'k' in target ? target.k.p[1] : target.p; }
  private skinAlive(target: SkinTarget): boolean {
    return target.hp > 0 && ('k' in target ? target.k.alive : 'rider' in target ? target.state !== 'dying' && target.state !== 'leave' : target.state !== 'dead');
  }
  private skinTargets(): SkinTarget[] {
    return [...this.foes, ...this.bats, ...(this.dragon ? [this.dragon] : [])].filter((t) => this.skinAlive(t));
  }
  private pierceCreature(a: Arrow, target: Bat | Dragon) {
    a.hitAny = true;
    if (!a.hitIds) a.hitIds = new Set<SkinTarget>();
    a.hitIds.add(target);
    if (a.maxPower) return;
    if ((a.pierceLeft ?? 0) > 0) { a.pierceLeft!--; a.dmg *= 1 - CFG.cards.tembus.falloff; }
    else a.dead = true;
  }
  private afterSkinKill(owner: SkinId | undefined, head: boolean) {
    if (this.demo || !this.player.k.alive || this.run.ended) return;
    skinKill(this.skinState, owner);
    const heal = skinHeadHeal(owner, head);
    if (heal) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      this.skinNotice(owner!, `HEADSHOT! +${heal} HP`);
      snd.heal();
    }
  }
  private skinDamage(target: SkinTarget, damage: number, owner: SkinId, color: string) {
    if (!this.skinAlive(target) || damage <= 0 || this.mods.headOnly) return;
    if ('hpLag' in target) target.hpLag = Math.max(target.hpLag, target.hp);
    if ('hpLagHold' in target) { target.hpLagHold = SKIN_RULES.fx.hpLagHold; target.barBump = 1; }
    if ('hpShow' in target) target.hpShow = SKIN_RULES.fx.hpShowSeconds;
    target.lastSkin = owner; target.hp -= damage; target.flash = 1;
    const at = this.skinPosition(target);
    if (this.meta.settings.dmgNum) this.say(at.x, at.y - SKIN_RULES.fx.noticeY, `-${damage}`, color, SKIN_RULES.fx.noticeSize);
    if (target.hp > 0) return;
    if ('k' in target) this.die(target, false);
    else if ('rider' in target) this.killDragon(target);
    else this.killBat(target, v(0, 0));
  }
  private skinStun(target: SkinTarget, duration: number, at: V, color: string) {
    if (!this.skinAlive(target) || duration <= 0) return;
    target.skinStunT = Math.max(target.skinStunT ?? 0, duration);
    if ('k' in target) { target.ai.state = 'wait'; target.ai.t = Math.max(target.ai.t, duration); }
    const f = SKIN_RULES.fx;
    this.arcs.push({ a: { ...at }, b: { ...this.skinPosition(target) }, life: 0, max: f.arcSeconds, spread: f.arcSpread, segs: f.arcSegments, col: color, lw: f.arcWidth, seed: rand() * SKIN_RULES.percent });
  }
  private skinOnHit(a: Arrow, target: SkinTarget, head: boolean, at: V, hitDmg: number) {
    const perk = a.skin;
    if (!perk || this.demo || a.maxPower) return;
    const color = SKIN_PERKS[perk.id].color;
    const f = SKIN_RULES.fx;
    if (head && perk.headStun > 0) {
      this.skinStun(target, perk.headStun, at, color);
      this.triggerThunderHit(at, a.ang, null, null, this.pan(at.x));
    }
    // Secondary effects never bypass the daily headshot-only modifier or recursively trigger more perks.
    if (this.mods.headOnly) return;
    if (perk.burnDps > 0 && this.skinAlive(target)) {
      target.skinBurn = applySkinBurn(target.skinBurn, perk);
      this.triggerFireHit(at, a.ang, null, null, this.pan(at.x));
    }
    if (perk.chain > 0 && !a.skinChainDone) {
      a.skinChainDone = true;
      const targets = this.skinTargets().filter((t) => t !== target && dist(this.skinPosition(t), at) <= perk.range)
        .sort((x, y) => dist(this.skinPosition(x), at) - dist(this.skinPosition(y), at)).slice(0, perk.chain);
      for (const other of targets) {
        this.skinStun(other, perk.stun, at, color);
        this.skinDamage(other, Math.round(hitDmg * perk.chainDamage), perk.id, color);
      }
      if (targets.length) snd.zap(this.pan(at.x), true);
    }
    if (head && perk.blast > 0 && !a.skinBlastDone) {
      a.skinBlastDone = true;
      this.parts.push({ p: { ...at }, vel: v(0, 0), life: 0, max: f.ringSeconds, r: perk.radius, col: color, grav: 0, kind: 'ring' });
      this.triggerFireHit(at, a.ang, null, null, this.pan(at.x));
      for (const other of this.skinTargets()) if (other !== target && dist(this.skinPosition(other), at) <= perk.radius) {
        this.skinDamage(other, Math.round(hitDmg * perk.blast), perk.id, color);
      }
    }
  }
  private stepSkinStatuses() {
    if (this.demo || this.stage !== 'play') return;
    const f = SKIN_RULES.fx;
    for (const target of this.skinTargets()) {
      target.skinStunT = Math.max(0, (target.skinStunT ?? 0) - H);
      const burn = target.skinBurn;
      if (!burn) continue;
      const damage = stepSkinBurn(burn, H);
      if (damage) this.skinDamage(target, damage, burn.owner, SKIN_RULES.dotColor);
      if (burn.left <= 0) { target.skinBurn = undefined; continue; }
      if (this.meta.settings.trail && rand() < f.burnChance) {
        const p = this.skinPosition(target);
        this.parts.push({ p: { ...p }, vel: v(0, f.burnRise), life: 0, max: f.burnLife, r: f.burnSize, col: SKIN_RULES.dotColor, grav: f.burnGravity, kind: 'fire' });
      }
    }
  }

  /* ---------------- card effects ---------------- */

  private foeLabel(f: Fighter): string {
    if (f.kind === 'axer') return `${bossWeaponLabel(f.bossKind)} ${f.bigBoss ? tx('BIG BOSS', 'BOS BESAR') : tx('MINI-BOSS', 'MINI-BOS')}`;
    return foeName(f.kind);
  }
  /** PERISAI: blocks one blow outright, then recharges */
  private shieldTry(at: V): boolean {
    const skinBlock = consumeSkinBarrier(this.head, this.skinState);
    const lv = cardLv(this.run, 'perisai');
    if (!skinBlock && (!lv || this.run.shieldCd > 0)) return false;
    if (!skinBlock) this.run.shieldCd = lvVal(CFG.cards.perisai.cd, lv);
    const pk = this.player.k; const c = lerpV(pk.p[0], pk.p[1], 0.5);
    this.parts.push({ p: c, vel: v(0, 0), life: 0, max: 0.35, r: 46, col: '#7fe9f2', grav: 0, kind: 'ring' });
    this.burst(at, v(1, -1), 10, '#bff4fa', 260);
    this.shake = Math.max(this.shake, 6); this.hitStop = 0.05;
    snd.shieldBlock(this.pan(at.x));
    this.say(pk.p[0].x, pk.p[0].y - 56, skinBlock ? tx('INFINITY! BLOCKED!', 'INFINITY! DITANGKIS!') : tx('SHIELD BLOCKED!', 'DITANGKIS PERISAI!'), '#7fe9f2', 19, 1.2);
    return true;
  }
  /** NYAWA KEDUA: once per run he gets back up */
  private tryRevive(f: Fighter): boolean {
    const lv = cardLv(this.run, 'nyawa2');
    if (!lv || this.run.reviveUsed) return false;
    this.run.reviveUsed = true;
    const p = lvVal(CFG.cards.nyawa2.pct, lv);
    f.hp = Math.max(1, Math.round(f.maxHp * p)); f.hpLag = f.hp;
    f.k.muscle = Math.max(f.k.muscle, 0.6);
    this.banner = 2; this.bannerText = tx('SECOND LIFE!', 'NYAWA KEDUA!'); this.bannerSub = tx(`REVIVED WITH ${Math.round(p * 100)}% HP`, `BANGKIT DENGAN ${Math.round(p * 100)}% HP`);
    this.slowT = 0.8; this.slowK = 0.25; this.hurt = 0;
    this.parts.push({ p: { ...f.k.p[1] }, vel: v(0, 0), life: 0, max: 0.5, r: 70, col: '#ff7be5', grav: 0, kind: 'ring' });
    snd.heal();
    return true;
  }
  /** LIFESTEAL */
  private killHeal() {
    const pf = this.player; const lv = cardLv(this.run, 'lifesteal');
    if (!lv || !pf.k.alive || this.demo) return;
    pf.hp = Math.min(pf.maxHp, pf.hp + lvVal(CFG.cards.lifesteal.hp, lv));
  }
  /** damage dealt by a card effect (chain lightning, explosion) */
  private damageFoe(o: Fighter, dmg: number, col: string, owner?: SkinId) {
    if (!o.k.alive || dmg <= 0 || this.mods.headOnly) return;
    if (owner) o.lastSkin = owner;
    o.hpLag = Math.max(o.hpLag, o.hp); o.hpLagHold = 0.28; o.barBump = 1;
    o.hp -= dmg; o.hpShow = 4.5; o.flash = 1;
    if (this.meta.settings.dmgNum) this.say(o.k.p[0].x + (rand() - 0.5) * 14, o.k.p[0].y - (HEAD_R + 22) * o.k.s, `-${dmg}`, col, 16, 0.8);
    if (o.hp <= 0) this.die(o, false);
  }
  /** a clean miss breaks the headshot streaks */
  private onMiss() { this.run.headStreak = 0; this.run.hunterStacks = 0; }
  /** the arrow cards, after one of the player's arrows has struck an enemy */
  private cardOnHit(a: Arrow, f: Fighter, head: boolean, fatal: boolean, tip: V, hitDmg: number) {
    const r = this.run; const C = CFG.cards; const pan = this.pan(tip.x);
    if (this.meta.settings.thunk) snd.thunk(pan);
    // streaks: a head shot adds; a body shot breaks the plain streak (PEMBURU KEPALA only breaks on a miss)
    if (head) {
      r.headStreak++; this.meta.stats.bestStreak = Math.max(this.meta.stats.bestStreak, r.headStreak);
      if (cardLv(r, 'pemburu')) {
        const before = hunterMult(r); r.hunterStacks++;
        const now = hunterMult(r);
        if (now > before) this.say(this.player.k.p[0].x + 50, this.player.k.p[0].y - 84, tx(`HUNTER x${now.toFixed(1)}`, `PEMBURU x${now.toFixed(1)}`), '#ffe14d', 16, 1);
        if (hasSyn(r, 'pemburu_lifesteal')) this.player.hp = Math.min(this.player.maxHp, this.player.hp + CFG.synergy.vampHeal);
      }
    } else r.headStreak = 0;
    // PANAH LEDAK: a head shot goes off - area damage and a shove for every ragdoll around
    const ll = cardLv(r, 'ledak');
    if (head && ll) {
      const storm = hasSyn(r, 'ledak_petir');
      const R = lvVal(C.ledak.radius, ll) * (storm ? CFG.synergy.blastRadius : 1); const push = lvVal(C.ledak.push, ll);
      this.triggerFireHit(tip, a.ang, null, null, pan);
      this.parts.push({ p: { ...tip }, vel: v(0, 0), life: 0, max: 0.32, r: R, col: '#ffb347', grav: 0, kind: 'ring' });
      this.shake = Math.max(this.shake, 10);
      for (const o of this.foes) {
        const d = dist(o.k.p[1], tip);
        if (d > R) continue;
        const dx = (o.k.p[1].x - tip.x) / (d || 1); const dy = (o.k.p[1].y - tip.y) / (d || 1);
        for (let i = 0; i < o.k.p.length; i++) impulse(o.k, i, v(dx * push, dy * push - push * 0.35));
        if (o === f || !o.k.alive) continue;
        if (storm) o.shockT = Math.max(o.shockT, CFG.synergy.blastShock);
        this.damageFoe(o, Math.round(hitDmg * lvVal(C.ledak.pct, ll)), '#ffb347', a.skin?.id);
      }
    }
    // RANTAI PETIR: lightning jumps on to the nearest enemies (once per arrow; on every pierced man with PETIR MENEMBUS)
    const pl = cardLv(r, 'petir');
    if (pl && (!a.chainDone || hasSyn(r, 'petir_tembus'))) {
      a.chainDone = true;
      const targets = this.foes.filter((o) => o !== f && o.k.alive && dist(o.k.p[1], tip) < C.petir.range)
        .sort((p, q) => dist(p.k.p[1], tip) - dist(q.k.p[1], tip)).slice(0, lvVal(C.petir.jumps, pl));
      let from = tip;
      for (const o of targets) {
        const to = { ...o.k.p[1] };
        this.arcs.push({ a: { ...from }, b: to, life: 0, max: 0.3, spread: 9, segs: 7, col: '#00f0ff', lw: 2, seed: rand() * 100 });
        o.shockT = Math.max(o.shockT, C.petir.shock);
        this.damageFoe(o, Math.round(hitDmg * lvVal(C.petir.pct, pl)), '#5cf4ff', a.skin?.id);
        from = to;
      }
      if (targets.length) snd.zap(pan, true);
    }
    // PANAH PAKU: nailed down to his ground and stunned
    const kl = cardLv(r, 'paku');
    if (kl && !fatal && f.k.alive && (f.pinImm ?? 0) <= 0 && !(f.pinT && f.pinT > 0)) {
      const stun = lvVal(C.paku.stun, kl);
      f.pinT = stun; f.pinAt = v(f.k.p[2].x + Math.sign(a.vel.x || 1) * 16, f.plat.y + 3);
      startReact(f.k, 'knee', stun);
      f.ai.state = 'wait'; f.ai.t = Math.max(f.ai.t, stun);
      this.say(f.k.p[0].x, f.k.p[0].y - (HEAD_R + 40) * f.k.s, tx('PINNED!', 'TERPAKU!'), '#cfd8dc', 17, 1.1);
      snd.wood(pan);
    }
  }
  /** PECAH TAMENG: an arrow stopped by a shield bounces on to the enemy behind it */
  private ricochet(a: Arrow, bearer: Fighter) {
    const lv = cardLv(this.run, 'tameng');
    if (!lv || a.team !== 0 || a.ricochet || a.maxPower || this.demo) return;
    let tgt: Fighter = bearer; let bd = 1e9;
    for (const o of this.foes) { if (o === bearer || !o.k.alive) continue; const d = dist(o.k.p[1], a.p); if (d < bd) { bd = d; tgt = o; } }
    const to = tgt === bearer ? { ...bearer.k.p[0] } : lerpV(tgt.k.p[1], tgt.k.p[0], 0.3);
    const T = (dist(to, a.p) || 1) / CFG.cards.tameng.speed; const G = AG * this.mods.grav * (a.skin?.gravity ?? 1);
    const vel = v((to.x - a.p.x) / T, (to.y - a.p.y) / T - 0.5 * G * T);
    const ang = Math.atan2(vel.y, vel.x); const p0 = add(a.p, fromAngle(ang, 8));
    this.arrows.push({
      p: p0, prev: { ...p0 }, vel, ang, team: 0, dmg: a.dmg * lvVal(CFG.cards.tameng.pct, lv), main: false, near: false,
      stuckIn: null, ox: 0, oy: 0, life: 0, dead: false, bow: a.bow, ricochet: true, hitAny: true, pierceLeft: 0,
      hitIds: tgt === bearer ? undefined : new Set<SkinTarget>([bearer]), trail: [],
      skin: a.skin ? { ...a.skin } : undefined, skinChainDone: a.skinChainDone, skinBlastDone: a.skinBlastDone,
    });
    this.say(a.p.x, a.p.y - 20, tx('RICOCHET!', 'MEMANTUL!'), '#ffe24a', 15, 0.9);
  }

  private say(x: number, y: number, text: string, col: string, size = 18, max = 0.9) {
    if (!this.demo || this.show) this.texts.push({ x, y, life: 0, max, text, col, size }); // (the codex stage shows them too)
  }

  /**
   * Leave the arrow in the bone it struck.
   * When `halfThrough = false`, the point sits in the middle of that bone so the shaft meets the body with no gap.
   * When `halfThrough = true` (MAX POWER final target), the arrow penetrates HALF OF ITS LENGTH (`ARROW_LEN * 0.5 = 24px`)
   * out the back of the bone with its arrowhead visible on the exit side!
   */
  private lodge(a: Arrow, f: Fighter, hit: { stick: number; u: number }, halfThrough = false): V {
    const k = f.k; const head = hit.stick === 0;
    const [ia, ib] = RAG_STICKS[hit.stick];
    const A = k.p[ia]; const B = k.p[ib];
    let bonePt = a.p; let best = 1e9;
    for (let i = 0; i <= 18; i++) {
      const q = add(a.p, fromAngle(a.ang, i));
      const dd = head ? dist(q, k.p[0]) : segDist(q, A, B).d;
      if (dd < best) { best = dd; bonePt = q; } else if (dd > best + 1) break;
    }
    if (head && !halfThrough) bonePt = add(bonePt, fromAngle(a.ang, -3 * k.s));
    // If `halfThrough`, slide the arrow tip forward by half of ARROW_LEN (24px) past the bone center!
    const tip = halfThrough ? add(bonePt, fromAngle(a.ang, ARROW_LEN * 0.5)) : bonePt;
    const ba = Math.atan2(B.y - A.y, B.x - A.x);
    const rx = tip.x - A.x; const ry = tip.y - A.y; const c = Math.cos(-ba); const sn = Math.sin(-ba);
    const fxDur = a.bow === 'thunder' ? 1.8 : a.bow === 'fire' ? 2.4 : a.bow === 'poison' ? 2.8 : 0;
    f.stuck.push({ stick: hit.stick, u: hit.u, lx: rx * c - ry * sn, ly: rx * sn + ry * c, rel: a.ang - ba, bow: a.bow, fxT: fxDur, halfThrough });
    if (f.stuck.length > 7) f.stuck.shift();
    return bonePt;
  }

  private onHit(a: Arrow, f: Fighter, hit: { stick: number; u: number }) {
    const k = f.k; const head = hit.stick === 0; const torso = hit.stick === 1;
    // PERISAI card: the blow on the player is blocked outright
    if (f.team === 0 && a.team === 1 && !this.demo && this.shieldTry(a.p)) { a.dead = true; return; }
    if (f.team === 0 && a.src) this.run.killedBy = a.src;
    const isMax = !!a.maxPower && f.team === 1;
    if (isMax) {
      a.hitIds?.add(f);
      a.pierced = (a.pierced ?? 0) + 1;
    }
    // Check if this MAX POWER arrow should keep flying to pierce a 2nd enemy, or stop & lodge half-through in this final enemy!
    const otherAlive = isMax && (a.pierced ?? 0) < 2 && this.foes.some((o) => o !== f && o.k.alive && !a.hitIds?.has(o));
    const shouldPassThrough = isMax && (a.pierced ?? 0) === 1 && otherAlive;

    // PANAH TEMBUS card: the arrow leaves a shaft in this man and flies on, a little weaker each time
    const cardPierce = !isMax && f.team === 1 && a.team === 0 && (a.pierceLeft ?? 0) > 0 && k.alive;
    const hitDmg = a.dmg;
    if (a.team === 0 && f.team === 1) a.hitAny = true;
    let tip = a.p;
    if (cardPierce) {
      tip = this.lodge(a, f, hit);
      a.dead = false; a.pierceLeft = (a.pierceLeft ?? 0) - 1; a.dmg *= 1 - CFG.cards.tembus.falloff;
      if (!a.hitIds) a.hitIds = new Set<SkinTarget>();
      a.hitIds.add(f);
    } else if (shouldPassThrough) {
      // Pierces completely through the 1st enemy and keeps flying toward the 2nd enemy!
      a.dead = false;
    } else {
      // Lodges in the enemy; if MAX POWER, penetrates half the arrow's length (`halfThrough = true`)!
      tip = this.lodge(a, f, hit, isMax);
      a.dead = true;
    }

    const back = mul(a.vel, -1); const pan = this.pan(a.p.x);
    // Trigger localized Level-1 elemental simulation on the struck body part!
    if (a.bow === 'thunder') this.triggerThunderHit(tip, a.ang, f, hit, pan);
    else if (a.bow === 'fire') this.triggerFireHit(tip, a.ang, f, hit, pan);
    else if (a.bow === 'spike') this.triggerSpikeHit(tip, a.ang, f, pan, head);
        else if (a.bow === 'poison') this.triggerPoisonHit(tip, a.ang, f, hit, pan);
    else if (a.bow === 'gold') this.triggerGoldHit(tip, f);
    else if (a.bow === 'legend') this.triggerLegendHit(tip, f);

    if (!k.alive) {
      punchRag(k as unknown as ArcherRag, hit.stick, hit.u, a.vel, true);
      this.burst(a.p, back, 5, '#b3121b'); snd.hit(pan, false);
      return;
    }
    // the player's headshots are the big reward; an enemy's lucky one hurts but does not end the run
    const heart = torso && hit.u > 0.58 && hit.u < 0.93; // the upper chest
    let helmHit = false;
    const HM = CFG.hitMult; const HPm = CFG.hitMultPlayer;
    let dmg = hitDmg * (f.team === 0 ? (head ? HPm.head : torso ? HPm.torso : HPm.limb) : head ? (f.kind === 'boss' || f.kind === 'axer' ? HM.bigHead : HM.head) : heart ? HM.heart : torso ? HM.torso : HM.limb);
    if (f.team === 1 && a.team === 0 && !this.demo) {
      dmg *= hunterMult(this.run) * skinHitMult(a.skin, head, !head && !torso);
      f.lastSkin = a.skin?.id;
    } else if (f.team === 0 && !this.demo) dmg *= (1 - this.training.dmgReduce) * skinIncomingMult(this.head, head);
    // daily modifier HANYA HEADSHOT: body hits stagger but do not count
    const noCount = f.team === 1 && this.mods.headOnly && !head && !this.demo;
    if (this.demo && f.team === 0) dmg *= 0.25;
    if (head && f.helm && !isMax) {
      f.helm = false; dmg *= HM.helm; helmHit = true;
      this.parts.push({ p: { ...k.p[0] }, vel: v(a.vel.x * 0.25 + (rand() - 0.5) * 80, -330), life: 0, max: 2.4, r: (HEAD_R + 2) * k.s, col: '#51666f', grav: 1100, kind: 'helm', rot: 0 });
      this.say(k.p[0].x, k.p[0].y - 34, tx('HELMET OFF!', 'HELM LEPAS!'), '#cfe3ea', 15);
      snd.clang(pan);
    } else if (head && f.helm && isMax) {
      f.helm = false;
      this.parts.push({ p: { ...k.p[0] }, vel: v(a.vel.x * 0.35, -360), life: 0, max: 2.4, r: (HEAD_R + 2) * k.s, col: '#51666f', grav: 1100, kind: 'helm', rot: 0 });
    }
    // MAX POWER arrows AUTO-KILL (`f.hp = 0`) any enemy they pierce or lodge into!
    dmg = isMax ? Math.max(f.hp, 999) : noCount ? 0 : Math.max(1, Math.round(dmg));
    f.hpLag = Math.max(f.hpLag, f.hp);
    f.hpLagHold = 0.28;
    f.barBump = 1;
    f.hp = isMax ? 0 : f.hp - dmg;
    f.hpShow = 4.5; f.flash = 1;
    if (this.demo && f.team === 0) f.hp = Math.max(f.hp, 20);
    const fatal = f.hp <= 0;
    const knock = f.team === 1 ? a.skin?.knock ?? 1 : 1;
    const beforeKick = knock !== 1 ? k.o.map((p) => ({ ...p })) : null;
    punchRag(k as unknown as ArcherRag, hit.stick, hit.u, a.vel, fatal);
    if (beforeKick) for (let i = 0; i < k.o.length; i++) {
      k.o[i] = add(beforeKick[i], mul(v(k.o[i].x - beforeKick[i].x, k.o[i].y - beforeKick[i].y), knock));
    }
    k.muscle = Math.min(k.muscle, head ? 0.26 : torso ? 0.44 : 0.6);
    // the pain: flinch away from the blow, a hand to the wound, breath knocked short
    k.hurt = 1; k.hurtDir = Math.sign(a.vel.x) || 1; k.wound = { stick: hit.stick, u: hit.u }; k.exert = Math.min(1, k.exert + 0.45);
    f.plat.vel += head ? 120 : 80;
    this.burst(a.p, back, head ? 14 : 8, '#d3141f', head ? 330 : 240);
    this.parts.push({ p: { ...a.p }, vel: v(0, 0), life: 0, max: 0.22, r: head ? 26 : 18, col: '#ffffff', grav: 0, kind: 'ring' });
    this.hitStop = head ? 0.07 : 0.035;
    this.shake = Math.max(this.shake, (head ? 9 : 5) * (this.demo ? 0.3 : 1));
    snd.hit(pan, head);
    if (!fatal) snd.grunt(pan, f.pitch);
    // every hit shows what it did inside. A head shot gets the full treatment - the world goes dark and the camera
    // closes in on the whole skeleton; anywhere else a bone X-ray renders directly inside the black stickman body!
    if (!this.demo && !helmHit) {
      const full = head && this.meta.settings.zoom;
      this.xray = { f, stick: hit.stick, u: hit.u, pt: { ...tip }, ang: a.ang, t: 0, dur: full ? (f.team === 0 ? 0.42 : fatal ? 0.8 : 0.5) : fatal ? 0.65 : 0.42, full };
      if (full) { this.ts = 0.03; this.hitStop = 0; this.focus = { ...a.p }; snd.crack(pan); snd.xray(); }
      else snd.snap(pan);
    }
    const hx = k.p[0].x; const hy = k.p[0].y - (HEAD_R + 22) * k.s;
    if (f.team === 1) {
      const hitCol = isMax ? '#ffd23f' : a.bow === 'thunder' ? '#5cf4ff' : a.bow === 'fire' ? '#ff942e' : a.bow === 'poison' ? '#d4ff00' : head ? '#ffe14d' : '#ffffff';
      if (isMax) this.say(hx, hy, 'AUTO DEAD!', hitCol, 22);
      else if (noCount) this.say(hx, hy, tx('HEADSHOTS ONLY!', 'KEPALA SAJA!'), '#cfe3ea', 15);
      else if (this.demo || this.meta.settings.dmgNum) this.say(hx + (rand() - 0.5) * 16, hy, `-${dmg}`, head ? CFG.juice.headCol : hitCol, head ? CFG.juice.headSize : CFG.juice.dmgSize, head ? 1.1 : 0.9);
      if (isMax) {
        this.say(hx, hy - 22, shouldPassThrough ? tx('⚡ MAX POWER PIERCE!', '⚡ MAX POWER TEMBUS!') : tx('⚡ HALF-EMBEDDED ARROW!', '⚡ NANCEP SETENGAH PANAH!'), '#ffe24a', 16, 1.15);
      } else if (head && !fatal) this.say(hx, hy - 20, 'HEADSHOT!', '#ffe14d', 17, 1.1);
      else if (a.bow === 'thunder' && !fatal) this.say(hx, hy - 20, tx('⚡ ELECTROCUTED!', '⚡ TERSENGAT LISTRIK!'), '#5cf4ff', 16, 1.1);
      else if (a.bow === 'fire' && !fatal) this.say(hx, hy - 20, tx('🔥 BURNING!', '🔥 TERBAKAR API!'), '#ff942e', 16, 1.1);
      else if (a.bow === 'poison' && !fatal) this.say(hx, hy - 20, '🧪 XENOMORPH ACID!', '#d4ff00', 16, 1.1);
      else if (heart && !fatal) this.say(hx, hy - 20, tx('HEART SHOT!', 'JANTUNG!'), '#ff9a9a', 16, 1.1);
      if (!this.demo) {
        this.lvHits++; this.combo++;
        if (this.combo >= 2) {
          const bonus = Math.min(this.combo - 1, CFG.rewards.comboCap);
          this.spawnCoins(this.player.k.p[0], bonus);
          this.say(this.player.k.p[0].x + 60, this.player.k.p[0].y - 64, `COMBO x${this.combo}  +${bonus}`, '#7fe9f2', 16, 1.2);
          snd.combo(this.combo);
        }
      }
      // a staggered archer loses his draw
      if (f.ai.state !== 'wait' && (head || torso || a.bow === 'thunder')) { f.ai.state = 'wait'; f.ai.t = 0.9 + rand() * 0.5; }
      else f.ai.t = Math.max(f.ai.t, 0.7);
      if (!fatal) {
        const leg = hit.stick >= 2 && hit.stick <= 5;
        const strong = Math.hypot(a.vel.x, a.vel.y) > 900;
        if (head && f.kind !== 'boss' && f.kind !== 'axer') { startReact(k, 'down', 2.1); snd.thud(pan, 0.28); snd.hup(pan, f.pitch, 1.05); }
        else if (leg) { startReact(k, 'knee', 1.35); snd.thud(pan, 0.16); }
        else if ((torso && strong) || head) { startReact(k, 'teeter', 1.05); snd.whoa(pan, f.pitch); }
        if (k.react !== 'none') { f.ai.state = 'wait'; f.ai.t = Math.max(f.ai.t, k.rdur + 0.3); }
        // a shield bearer shot in the leg lets his board drop to the ground: now his chest and head are open
        if (leg && f.shield && f.shield.hp > 0) {
          f.shield.openT = 2.4;
          this.say(hx, hy - 42, tx('SHIELD OPEN! STRIKE!', 'PERISAI TERBUKA!  HAJAR!'), '#7dffa0', 17, 1.4);
        }
      }
    } else {
      this.say(hx, hy, `-${dmg}`, '#ff6b6b', 20);
      if (!this.demo) { this.hurt = 1; this.lvHurt += dmg; }
      if (this.demo) { f.ai.state = 'wait'; f.ai.t = 0.8; }
    }
    if (f.team === 1 && a.team === 0 && !this.demo) {
      this.cardOnHit(a, f, head, fatal, tip, hitDmg);
      if (!noCount) this.skinOnHit(a, f, head, tip, hitDmg);
    }
    if (fatal) this.die(f, head);
  }

  private die(f: Fighter, head: boolean) {
    if (!f.k.alive) return;
    if (f.team === 0 && !this.demo && this.tryRevive(f)) return;
    const k = f.k; const pan = this.pan(k.p[1].x);
    // a board that outlives its bearer drops out of his hands and tumbles away
    const sp = this.shieldPose(f);
    if (sp && f.shield) {
      this.looseShields.push({
        p: { ...sp.c }, vel: v(k.face * (40 + rand() * 70), -190), rot: sp.rot,
        vr: k.face * (2.5 + rand() * 3), s: sp.s, hp: f.shield.hp, max: f.shield.max,
      });
    }
    f.shield = undefined; k.guard = 0;
    k.alive = false; k.muscle = 0; k.pull = 0; k.hasBow = false; f.hp = 0;
    // a headshot drops him like a cut string; anything else and he folds over the wound first
    k.fade = head ? 0.05 : 0.38; k.hurt = 1;
    snd.cry(pan, f.pitch); snd.fall(pan);
    this.bows.push({
      p: { ...k.p[4] }, vel: v(((k.p[4].x - k.o[4].x) / H) * 0.6 + (rand() - 0.5) * 140, ((k.p[4].y - k.o[4].y) / H) * 0.6 - 190),
      ang: k.bowAng, vr: (rand() - 0.5) * 16, s: k.s, bow: f.team === 0 ? this.bow : 'wood',
    });
    if (f.team === 1) {
      f.plat.sinkT = 1.7;
      this.spawnT = Math.max(this.spawnT, this.demo ? 1.4 : 0.6);
      if (this.demo) return;
      this.kills++; this.totalKills++;
      if (head) this.headshots++;
      // gold (× PEMBURU KEPALA streak), LIFESTEAL, stats, and the big boss's reward
      const reward = this.spawnCoins(k.p[1], Math.round((killReward(f.kind, head, !!f.bigBoss) + (head ? this.training.headGold : 0)) * hunterMult(this.run) * skinKillGoldMult(f.lastSkin)));
      this.killHeal();
      this.afterSkinKill(f.lastSkin, head);
      const st = this.meta.stats; st.kills++; if (head) st.headshots++;
      this.meta.killsBy[f.bigBoss ? 'boss' : f.kind] = (this.meta.killsBy[f.bigBoss ? 'boss' : f.kind] ?? 0) + 1;
      if (f.bigBoss) { st.bigBossKills++; this.run.bossPending++; this.toast(tx('BIG BOSS DEFEATED!', 'BOS BESAR TUMBANG!'), tx('REWARD: DOUBLE ARROW + BONUS CARD', 'HADIAH: PANAH GANDA + KARTU BONUS')); }
      const hx = k.p[0].x; const hy = k.p[0].y - (HEAD_R + 44) * k.s;
      this.say(hx, hy, head ? `HEADSHOT! +${reward}` : `+${reward}`, '#ffd23f', head ? 21 : 18, 1.3);
      const last = this.kills >= this.total && this.hostState !== 1;
      const J = CFG.juice;
      this.slowT = last ? J.lastSlowT : J.killSlowT; this.slowK = last ? J.lastSlowK : J.killSlowK;
      if (last) this.beginClear(k.p[1]);
      else if (this.kills >= this.total) { this.banner = 2.4; this.bannerText = tx('FREE THE HOSTAGE!', 'BEBASKAN TAWANAN!'); this.bannerSub = tx('SHOOT RIGHT THROUGH THE ROPE', 'PANAH TEPAT DI TALINYA'); }
    } else {
      this.stage = 'dying'; this.deadT = 0; this.drag.on = false;
      this.slowT = CFG.death.slowT; this.slowK = CFG.death.slowK;
      this.zoomTo = 1.16; if (!(this.xray && this.xray.full)) this.focus = { ...k.p[1] };
    }
  }

  /* ---------------- simulation ---------------- */

  private step() {
    this.t += H;
    this.stepSkinStatuses();
    const pl = this.pPlat;
    pl.fy = damp(pl.fy, this.pFyT, 1.4, H);
    const all = [pl, ...this.plats];
    for (const p of all) {
      p.vel += (-p.off * 110 - p.vel * 9) * H; p.off += p.vel * H;
      if (p !== pl) {
        if (p.state === 'rise') { p.rise = Math.min(1, p.rise + H / 1.1); if (p.rise >= 1) p.state = 'on'; }
        else if (p.state === 'on' && p.sinkT > 0) { p.sinkT -= H; if (p.sinkT <= 0) p.state = 'sink'; }
        else if (p.state === 'sink') { p.rise -= H / 1.4; if (p.rise <= 0) p.state = 'off'; }
      }
      this.placePlat(p);
      // crumbs of earth drift off the underside
      if (p.state === 'on' && rand() < 0.005) {
        this.parts.push({ p: v(p.x + (rand() - 0.5) * p.w * 0.8, p.y + p.h), vel: v((rand() - 0.5) * 8, 14), life: 0, max: 0.9 + rand() * 0.6, r: 1 + rand() * 1.4, col: this.theme.platTop, grav: 260 });
      }
    }
        this.placeExtras();
    this.plats = this.plats.filter((p) => p.state !== 'off');
    // a ground that is still floating in (or sinking away) only carries its own archer
    const slabs = all.filter((p) => p.state === 'on').map(toSlab);
    const slabsFor = (f: Fighter) => (f.plat.state === 'on' ? slabs : [...slabs, toSlab(f.plat)]);

    const pf = this.player; const pk = pf.k;
    pk.base = v(pl.x, pl.y);
    pk.vigor = clamp(pf.hp / pf.maxHp, 0, 1);
    let nearest: Fighter | null = null; let nd = 1e9;
    for (const f of this.foes) {
      if (!f.k.alive || f.plat.state !== 'on') continue;
      const d = dist(f.k.p[1], pk.p[1]);
      if (d < nd) { nd = d; nearest = f; }
    }
    if (pk.alive) {
      const d = this.drag; let want = 0;
      // WAKTU MELAMBAT: the world slows down, his hands do not
      const pr = this.run.slowT > 0 ? 1 / CFG.cards.lambat.timeScale : 1;
      const wasNock = pk.nock;
      if (pk.nock < 1) pk.nock = Math.min(1, pk.nock + (H * pr * (this.demo ? 1 : skinReloadMult(this.head) * (1 + this.training.reloadSpeed))) / SKIN_RULES.reloadSeconds);
      if (!this.demo) {
        if (wasNock < 0.55 && pk.nock >= 0.55) snd.quiver();
        if (wasNock < 1 && pk.nock >= 1) snd.nock();
      }
      if (this.demo && !d.on) {
        this.think(pf, this.demoTarget(nearest), this.stage === 'play');
        pf.hp = Math.min(pf.maxHp, pf.hp + 5 * H);
      } else {
        // aim follows the drag; the draw follows with a little lag, like real arms taking the load
        this.holdAim -= H;
        if (d.on) {
          const dx = d.sx - d.x; const dy = d.sy - d.y; const L = Math.hypot(dx, dy);
          if (L > 4) {
            pk.aim = angLerp(pk.aim, clamp(Math.atan2(dy, dx), -1.45, 1.15), 1 - Math.exp(-22 * H * pr));
            want = this.maxPower ? 1 : clamp((L - 6) / this.pullPx, 0, 1);
          } else if (this.maxPower) {
            want = 1;
          }
          pk.aiming = damp(pk.aiming, 1, 14, H);
        } else pk.aiming = damp(pk.aiming, this.holdAim > 0 ? 1 : 0, 5, H);
        if (!onString(pk)) want = 0;
        // the last part of the draw is the heaviest: it comes slower
        pk.pull = damp(pk.pull, want, (want > pk.pull ? 17 - 7 * pk.pull : 20) * pr * (this.demo ? 1 : 1 + this.training.drawSpeed), H);
        if (pk.pull > this.creakAt) { snd.creak(pk.pull); this.creakAt += 0.14; }
        if (pk.pull < this.creakAt - 0.3) this.creakAt = Math.max(0.14, this.creakAt - 0.14);
      }
      pk.muscle = Math.min(1, pk.muscle + H * 1.1);
      // eyes: down the arrow while aiming, otherwise on the nearest danger
      let threat: V | null = null; let td = 420;
      for (const a of this.arrows) if (a.team === 1 && !a.stuckIn) { const dd = dist(a.p, pk.p[0]); if (dd < td) { td = dd; threat = a.p; } }
      pk.lookAt = (d.on && !this.demo) || pk.aiming > 0.5 ? null : threat ?? (nearest ? nearest.k.p[0] : null);
    } else pf.deadT += H;
    pf.vib += H; pf.flash = Math.max(0, pf.flash - H * 5); pf.barBump = Math.max(0, pf.barBump - H * 6);
    if (pf.hp > pf.hpLag) pf.hpLag = pf.hp;
    if (pf.hpLagHold > 0) pf.hpLagHold = Math.max(0, pf.hpLagHold - H);
    else pf.hpLag = damp(pf.hpLag, Math.max(0, pf.hp), 5.2, H);
        stepStick(pk, slabsFor(pf));
    if (pf.hair) stepHair(pk, pf.hair);

    for (const f of this.foes) {
      const k = f.k;
      f.vib += H; f.flash = Math.max(0, f.flash - H * 5); f.hpShow -= H; f.barBump = Math.max(0, f.barBump - H * 6);
      if (f.hp > f.hpLag) f.hpLag = f.hp;
      if (f.hpLagHold > 0) f.hpLagHold = Math.max(0, f.hpLagHold - H);
      else f.hpLag = damp(f.hpLag, Math.max(0, f.hp), 5.2, H);
      if (k.alive) {
        k.base = v(f.plat.x, f.plat.y);
        k.vigor = clamp(f.hp / f.maxHp, 0, 1);
        k.muscle = Math.min(1, k.muscle + H * (f.shockT > 0 ? 0.25 : 0.9));
        if (k.nock < 1) k.nock = Math.min(1, k.nock + H / (f.kind === 'axer' ? 1 : 0.6));
        if (f.pinT && f.pinT > 0) { f.pinT -= H; if (f.pinT <= 0) f.pinImm = CFG.cards.paku.immune; }
        else if (f.pinImm && f.pinImm > 0) f.pinImm -= H;
        this.think(f, pf, this.stage === 'play' && pk.alive && f.plat.state === 'on' && f.shockT <= 0.1 && !(f.pinT && f.pinT > 0) && (f.skinStunT ?? 0) <= 0);
        // he watches you - and now and then glances away
        k.lookAt = k.aiming > 0.5 ? null : Math.sin(this.t * 0.45 + k.seed * 3) > 0.9 ? v(k.p[0].x + 80 * Math.sin(k.seed * 7), k.p[0].y - 60) : pk.p[0];
      } else f.deadT += H;
      if (f.shield) {
        // the board comes down whenever he needs both hands or loses his feet: to shoot, on a knee, stunned
        const sh = f.shield;
        sh.flash = Math.max(0, sh.flash - H * 5); sh.kick *= Math.exp(-6.5 * H); sh.openT = Math.max(0, sh.openT - H);
        const open = sh.hp <= 0 || f.ai.state !== 'wait' || k.react !== 'none' || f.shockT > 0.1 || sh.openT > 0;
        // it rides a spring: thrown round fast, brought back up a touch slower, settling with a small overshoot
        sh.gv += (((open ? 0 : 1) - sh.g) * (open ? 520 : 300) - sh.gv * (open ? 34 : 24)) * H;
        sh.g += sh.gv * H;
        // and he braces in behind it for exactly as long as it is held out
        k.guard = sh.hp > 0 ? clamp(sh.g, 0, 1) : damp(k.guard ?? 0, 0, 8, H);
      }
            this.stepElementalFighter(f);
      stepStick(k, slabsFor(f));
      if (f.hair) stepHair(k, f.hair);
      // blood drips from a fresh wound
      if (k.hurt > 0.2 && k.alive && rand() < 0.2) {
        const wp = woundPoint(k);
        if (wp) this.parts.push({ p: wp, vel: v((rand() - 0.5) * 40, -10 + rand() * 30), life: 0, max: 0.5 + rand() * 0.3, r: 1.3 + rand() * 1.3, col: '#c4121c', grav: 900 });
      }
    }
    if (pk.hurt > 0.2 && pk.alive && rand() < 0.2) {
      const wp = woundPoint(pk);
      if (wp) this.parts.push({ p: wp, vel: v((rand() - 0.5) * 40, -10 + rand() * 30), life: 0, max: 0.5 + rand() * 0.3, r: 1.3 + rand() * 1.3, col: '#c4121c', grav: 900 });
    }
    this.foes = this.foes.filter((f) => f.k.alive || (f.deadT < 6 && f.k.p[2].y < this.VH + 260));

    // the prisoner: squirming while tied; once free he celebrates, then his ground carries him away
    const hs = this.hostage;
    if (hs) {
      const hk = hs.k;
      hk.base = v(hs.plat.x, hs.plat.y); hk.muscle = Math.min(1, hk.muscle + H); hk.lookAt = pk.p[0];
      hk.happy = damp(hk.happy, this.hostState === 2 ? 1 : 0, 7, H);
      hs.flash = Math.max(0, hs.flash - H * 5);
      stepStick(hk, slabsFor(hs));
      if (this.hostState === 2) {
        this.freeT += H;
        if (this.freeT > 1.9 && hs.plat.state === 'on' && hs.plat.sinkT <= 0) hs.plat.sinkT = 0.01;
      }
      if (hs.plat.state === 'off') this.hostage = null;
    }

    // axes in the air: heavy, slow, spinning - and when they hit a body or platform, they EMBED (`nancep`)!
    for (const ax of this.axes) {
      ax.life += H;
      if (ax.stuckIn) {
        ax.p = v(ax.stuckIn.x + ax.ox, ax.stuckIn.y + ax.oy);
        if (ax.life > 6 || ax.stuckIn.state === 'off') ax.dead = true;
        continue;
      }
      ax.vel.y += 620 * H;
      ax.p = add(ax.p, mul(ax.vel, H));
      if (ax.bossKind === 'thunder_lord') ax.ang = Math.atan2(ax.vel.y, ax.vel.x);
      else ax.ang += ax.vr * H;
      if (!ax.spent) {
        if (Math.floor(ax.life / 0.26) !== Math.floor((ax.life - H) / 0.26)) snd.whup(this.pan(ax.p.x));
        // Check hit on Player ragdoll body -> embed (`nancep`) into the closest bone!
        if (pk.alive && Math.abs(ax.p.x - pk.p[2].x) < 75 && Math.abs(ax.p.y - pk.p[2].y) < 105) {
          let bestStick = 0; let bestU = 1;
          let near = dist(ax.p, pk.p[0]) - HEAD_R;
          for (let si = 1; si < RAG_STICKS.length; si++) {
            const [ia, ib] = RAG_STICKS[si];
            const sd = segDist(ax.p, pk.p[ia], pk.p[ib]);
            if (sd.d < near) { near = sd.d; bestStick = si; bestU = sd.t; }
          }
          if (near < 16) {
            this.axeHit(ax, { stick: bestStick, u: bestU });
            continue;
          }
        }
        // Check hit on any Platform -> embed (`nancep`) into the platform surface!
        const sl = all.find((p) => p.rise > 0.6 && ax.p.x > p.x - p.w / 2 && ax.p.x < p.x + p.w / 2 && ax.p.y >= p.y - 4 && ax.p.y <= p.y + p.h);
        if (sl) {
          const flightAng = Math.atan2(ax.vel.y, ax.vel.x);
          ax.stuckIn = sl;
          ax.spent = true;
          ax.ox = ax.p.x - sl.x;
          ax.oy = 3;
          ax.ang = bossEmbedAng(ax.bossKind, flightAng);
          ax.life = 0;
          sl.vel += 65;
          const bowElem = bossBowOf(ax.bossKind);
          if (bowElem === 'thunder') this.triggerThunderHit(ax.p, flightAng, null, null, this.pan(ax.p.x));
          else if (bowElem === 'fire') this.triggerFireHit(ax.p, flightAng, null, null, this.pan(ax.p.x));
          else if (bowElem === 'poison') this.triggerPoisonHit(ax.p, flightAng, null, null, this.pan(ax.p.x));
          else {
            this.burst(ax.p, v(0, -1), 7, this.theme.platTop, 180);
            snd.wood(this.pan(ax.p.x));
          }
          continue;
        }
      }
      if (ax.p.y > this.VH + 240 || ax.p.x < -300 || ax.p.x > this.VW * 2.2) ax.dead = true;
    }
    this.axes = this.axes.filter((x) => !x.dead);

    // arrows
    for (const a of this.arrows) {
      a.life += H;
      if (a.stuckIn) {
        a.p = v(a.stuckIn.x + a.ox, a.stuckIn.y + a.oy);
        if (a.life > 5 || a.stuckIn.state === 'off') a.dead = true;
        continue;
      }
      a.prev = { ...a.p };
      a.vel.y += AG * (this.demo ? 1 : this.mods.grav) * (a.skin?.gravity ?? 1) * H;
      a.p = add(a.p, mul(a.vel, H));
      if (a.trail) { a.trail.push({ ...a.p }); if (a.trail.length > CFG.juice.trailLen) a.trail.shift(); }
      a.ang = Math.atan2(a.vel.y, a.vel.x);
      const end = { ...a.p };

      // Natural Level-1 in-flight trails aligned with arrow velocity `a.vel`, angle `a.ang`, and world gravity
            if ((a.bow === 'gold' || a.bow === 'legend') && rand() < 0.5) {
        // gold dust, or motes of starlight, shed along the way
        const gold = a.bow === 'gold';
        this.parts.push({
          p: { ...a.p }, prev: { ...a.prev },
          vel: v(-a.vel.x * 0.05 + (rand() - 0.5) * 70, -a.vel.y * 0.05 + (rand() - 0.5) * 70),
          life: 0, max: 0.2 + rand() * 0.22, r: 1.2 + rand() * 1.1,
          col: gold ? (rand() < 0.5 ? '#ffe27a' : '#ffc933') : ['#ffffff', '#b9a8ff', '#5cf4ff', '#ff7be5'][Math.floor(rand() * 4)],
          grav: gold ? 520 : 60, kind: 'spark', drag: 2.4,
        });
      } else if (a.bow === 'thunder' && rand() < 0.45) {
        this.parts.push({
          p: { ...a.p }, prev: { ...a.prev },
          vel: v(-a.vel.x * 0.08 + (rand() - 0.5) * 90, -a.vel.y * 0.08 + (rand() - 0.5) * 90),
          life: 0, max: 0.14 + rand() * 0.1, r: 1.3 + rand() * 0.8,
          col: rand() < 0.5 ? '#ffffff' : '#00f0ff', grav: 640, kind: 'spark', drag: 3.5,
        });
      } else if (a.bow === 'fire') {
        if (rand() < 0.58) {
          this.parts.push({
            p: v(a.p.x + (rand() - 0.5) * 3, a.p.y + (rand() - 0.5) * 3),
            vel: v(-a.vel.x * 0.08 + (rand() - 0.5) * 35, -a.vel.y * 0.08 - 35 + (rand() - 0.5) * 35),
            life: 0, max: 0.22 + rand() * 0.16, r: 4.5 + rand() * 3.5,
            col: '#ff6a00', grav: -210, kind: 'fire', drag: 3.8, turb: 8, seed: rand() * 100,
          });
        }
        if (rand() < 0.28) {
          this.parts.push({
            p: { ...a.p }, prev: { ...a.p },
            vel: v(-a.vel.x * 0.06 + (rand() - 0.5) * 70, -a.vel.y * 0.06 + (rand() - 0.5) * 70),
            life: 0, max: 0.28 + rand() * 0.22, r: 1.3 + rand() * 1.0,
            col: '#ffe552', grav: 680, kind: 'ember', drag: 1.2,
          });
        }
      } else if (a.bow === 'spike' && rand() < 0.28) {
        this.parts.push({
          p: { ...a.p }, vel: v(-a.vel.x * 0.05 + (rand() - 0.5) * 45, (rand() - 0.5) * 45),
          life: 0, max: 0.2, r: 1.9, col: '#7dff24', grav: 640, kind: 'thorn', rot: a.ang,
        });
      } else if (a.bow === 'poison' && rand() < 0.45) {
        // Gravity-driven Xenomorph acid droplets detaching from the flying arrow
        this.parts.push({
          p: { ...a.p }, prev: { ...a.prev },
          vel: v(-a.vel.x * 0.04 + (rand() - 0.5) * 40, -a.vel.y * 0.04 + (rand() - 0.5) * 40),
          life: 0, max: 0.32 + rand() * 0.2, r: 1.6 + rand() * 1.4,
          col: rand() < 0.45 ? '#eaff66' : '#8cff00', grav: 720, kind: 'acid', drag: 1.4, seed: rand() * 50,
        });
      }

      if (a.team === 1 && !a.near && pk.alive && !this.demo && dist(a.p, pk.p[0]) < 80) { a.near = true; snd.whoosh(this.pan(a.p.x)); }
      for (const tt of [0.25, 0.5, 0.75, 1]) {
        const tip = lerpV(a.prev, end, tt);
        if (a.team === 0) {
          // an axe in the air can be shot down (generous hit radius so shooting the Boss's axe feels awesome!)
          const ax = this.axes.find((x) => !x.dead && !x.spent && dist(tip, x.p) < 38 * x.s);
          if (ax) { this.parry(ax, a); break; }
          // the prisoner: the rope is the target, the man is not
          if (hs && this.hostState === 1 && hs.plat.state === 'on') {
            const [top, bot] = this.rope(hs);
            if (segDist(tip, top, bot).d < 7) this.freeHostage(tip);
            else {
              const hh = this.hitTest(tip, hs);
              if (hh) { a.p = tip; this.hostageHit(a, hs, hh); break; }
            }
          }
        }
        if (a.team === 0) {
          for (const b of this.balloons) {
            if (dist(tip, v(b.x, b.y)) < 19) { this.popBalloon(b); break; }
          }
          // a bat, seen from the side: its body and the wing beating above and below it
          const bat = this.bats.find((b) => b.state !== 'dead' && !a.hitIds?.has(b) && Math.hypot((tip.x - b.p.x) / 1.12, tip.y - b.p.y) < 17 * b.s);
          if (bat) {
            a.p = tip;
            this.hitBat(a, bat);
            if (a.dead) break;
          }
          // a ball of fire, the fortress's iron-clad walls / weak joints, or the dragon (checked before guards inside!)
          if (this.hitExtras(a, tip) && a.dead) break;
        }
        for (const f of a.team === 0 ? this.foes : [pf]) {
          if (a.hitIds?.has(f)) continue;
          // a shield bearer's board stops whatever reaches it before it reaches him
          if (a.team === 0 && f.shield && f.shield.g > 0.5 && f.k.alive) { // (on his back it is out of the way)
            const sp = this.shieldPose(f);
            if (sp && this.onShield(tip, sp)) {
              a.p = tip;
              this.shieldBlock(a, f, sp);
              if (a.dead) break;
            }
          }
          const hit = this.hitTest(tip, f);
          if (hit) {
            a.p = tip;
            this.onHit(a, f, hit);
            if (a.dead) break;
          }
        }
        if (a.dead) break;
        const canPiercePlat =
          a.maxPower &&
          (a.pierced ?? 0) === 1 &&
          this.foes.some((o) => o.k.alive && !a.hitIds?.has(o));
        const sl = canPiercePlat
          ? undefined
          : all.find((p) => p.rise > 0.6 && tip.x > p.x - p.w / 2 && tip.x < p.x + p.w / 2 && tip.y > p.y && tip.y < p.y + p.h);
        if (sl) {
          const in4 = add(tip, fromAngle(a.ang, 9)); // well into the wood: the ground is drawn over the buried end
          a.stuckIn = sl; a.ox = in4.x - sl.x; a.oy = in4.y - sl.y; a.life = 0;
          sl.vel += 30;
          if (a.bow === 'thunder') this.triggerThunderHit(tip, a.ang, null, null, this.pan(tip.x));
          else if (a.bow === 'fire') this.triggerFireHit(tip, a.ang, null, null, this.pan(tip.x));
          else if (a.bow === 'poison') this.triggerPoisonHit(tip, a.ang, null, null, this.pan(tip.x));
          else {
            this.burst(tip, mul(a.vel, -1), 4, this.theme.platTop, 150);
            snd.wood(this.pan(tip.x));
          }
          if (a.team === 0 && a.main) { this.combo = 0; if (!a.hitAny && !this.demo) this.onMiss(); }
          break;
        }
      }
      if (a.p.y > this.VH + 240 || a.p.x < -360 || a.p.x > this.VW * 2.3) { a.dead = true; if (a.team === 0 && a.main) { this.combo = 0; if (!a.hitAny && !this.demo) this.onMiss(); } }
    }
    this.arrows = this.arrows.filter((a) => !a.dead);

    for (const p of this.parts) {
      p.life += H;
      if (p.prev) p.prev = { ...p.p };
      if (p.drag) {
        const d = Math.exp(-p.drag * H);
        p.vel.x *= d; p.vel.y *= d;
      }
      if (p.turb) {
        p.vel.x += Math.sin(this.t * p.turb + p.p.y * 0.06) * 260 * H;
      }
      p.vel.y += p.grav * H;
      p.p = add(p.p, mul(p.vel, H));
      // Real physics platform collision bounce for sparks, embers, thorns, and acid droplets!
      if (p.vel.y > 0 && (p.kind === 'spark' || p.kind === 'ember' || p.kind === 'acid' || p.kind === 'thorn')) {
        for (const sl of all) {
          if (sl.rise > 0.6 && p.p.x > sl.x - sl.w * 0.5 && p.p.x < sl.x + sl.w * 0.5 && p.p.y >= sl.y && p.p.y <= sl.y + 10) {
            p.p.y = sl.y - 0.5;
            if (p.kind === 'acid') {
              p.vel.y = -p.vel.y * 0.18; p.vel.x *= 0.35;
              if (rand() < 0.25) {
                this.parts.push({ p: { ...p.p }, vel: v((rand() - 0.5) * 14, -22 - rand() * 18), life: 0, max: 0.28, r: 2.2, col: '#d4ff00', grav: -35, kind: 'acidBubble', drag: 3 });
              }
            } else {
              p.vel.y = -p.vel.y * 0.44; p.vel.x *= 0.72;
            }
            break;
          }
        }
      }
      if (p.rot !== undefined) p.rot += H * 9;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    for (const arc of this.arcs) arc.life += H;
    this.arcs = this.arcs.filter((arc) => arc.life < arc.max);
    for (const b of this.bows) { b.vel.y += 1100 * H; b.p = add(b.p, mul(b.vel, H)); b.ang += b.vr * H; }
    this.bows = this.bows.filter((b) => b.p.y < this.VH + 120);
    for (const b of this.balloons) { b.y -= 46 * H; b.x += Math.sin(this.t * 1.4 + b.phase) * 12 * H; }
    this.balloons = this.balloons.filter((b) => b.y > -70);
        this.stepBats();
    this.stepExtras();

    if (this.stage === 'play') {
      this.spawnT -= H;
      const alive = this.foes.reduce((n, f) => n + (f.k.alive ? 1 : 0), 0);
      // the level's bats are part of `total`, but they do not need a ground: the archers' share is what is left
      const footTotal = this.total - this.batTotal;
      // (the codex stage fields only the one kind it is showing - or nobody, while a bat or the prisoner has the stage)
      const empty = !!this.show && !this.showFoot();
      if (!empty && alive < this.maxAlive && this.spawned < footTotal && this.spawnT <= 0) { this.spawnEnemy(this.showFoot()); this.spawnT = this.demo ? 1.2 : 0.55; }
      if (this.show) this.stepShow();
      if (!this.demo && this.batSpawned < this.batTotal) {
        // bats drift in one by one while the fight goes on - and at once when there is nobody else left to shoot
        const flying = this.bats.reduce((n, b) => n + (b.state !== 'dead' ? 1 : 0), 0);
        const footLeft = alive > 0 || this.spawned < footTotal;
        this.batT -= H * (footLeft ? 1 : 4);
        if (this.batT <= 0 && flying < (footLeft ? (this.level >= 6 ? 2 : 1) : 2)) { this.spawnBat(); this.batT = 5 + rand() * 3.5; }
      }
      this.balloonT -= H;
      if (this.balloonT <= 0 && !this.demo) {
        this.balloonT = 12 + rand() * 9;
        this.balloons.push({ x: this.VW * (0.3 + rand() * 0.16), y: this.VH + 40, kind: pf.hp < pf.maxHp * 0.8 ? 'heart' : 'coin', phase: rand() * 6 });
      }
    }
  }

  /**
   * Localized Level-1 120Hz Elemental Simulation on a Fighter:
   * Only affects the specific body parts (`st.stick` at `st.u`) where elemental arrows are embedded!
   */
  private stepElementalFighter(f: Fighter) {
    const k = f.k;
    if (f.shockT > 0) f.shockT = Math.max(0, f.shockT - H);
    if (f.burnT > 0) f.burnT = Math.max(0, f.burnT - H);
    if (f.poisonT > 0) f.poisonT = Math.max(0, f.poisonT - H);

    let hasActiveStuck = false;
    for (const st of f.stuck) {
      if (st.fxT <= 0) continue;
      st.fxT = Math.max(0, st.fxT - H);
      hasActiveStuck = true;
      const [ia, ib] = RAG_STICKS[st.stick];
      const A = k.p[ia]; const B = k.p[ib];
      const wp = lerpV(A, B, st.u);
      const limbVx = ((B.x - k.o[ib].x) / H) * 0.25;
      const limbVy = ((B.y - k.o[ib].y) / H) * 0.25;

      if (st.bow === 'thunder') {
        // Localize micro-spasms strictly to the two joints `[ia, ib]` of the struck limb/part
        if (rand() < 0.28) {
          impulse(k, ia, v((rand() - 0.5) * 130, (rand() - 0.5) * 130));
          impulse(k, ib, v((rand() - 0.5) * 130, (rand() - 0.5) * 130));
        }
        // Subtle gravity spark detaching from the struck point `wp`
        if (rand() < 0.16) {
          const a = rand() * Math.PI * 2; const sp = 60 + rand() * 140;
          this.parts.push({ p: { ...wp }, prev: { ...wp }, vel: v(limbVx + Math.cos(a) * sp, limbVy + Math.sin(a) * sp - 20), life: 0, max: 0.16 + rand() * 0.12, r: 1.3, col: rand() < 0.5 ? '#ffffff' : '#00f0ff', grav: 680, kind: 'spark', drag: 2.8 });
        }
        if (rand() < 0.04) snd.sparkTick(this.pan(wp.x));
      } else if (st.bow === 'fire') {
        // Buoyant flame wisp rising specifically from the wound `wp` on the struck body part
        if (rand() < 0.35) {
          this.parts.push({
            p: v(wp.x + (rand() - 0.5) * 4, wp.y + (rand() - 0.5) * 4),
            vel: v(limbVx + (rand() - 0.5) * 24, limbVy - 42 - rand() * 45),
            life: 0, max: 0.26 + rand() * 0.2, r: (4.2 + rand() * 3.5) * k.s,
            col: '#ff6a00', grav: -210, kind: 'fire', drag: 3.2, turb: 8, seed: rand() * 100,
          });
        }
        if (rand() < 0.1) {
          this.parts.push({
            p: { ...wp }, prev: { ...wp },
            vel: v(limbVx + (rand() - 0.5) * 65, limbVy - 30 - rand() * 50),
            life: 0, max: 0.32 + rand() * 0.25, r: 1.3,
            col: '#ffe552', grav: 720, kind: 'ember', drag: 1.1,
          });
        }
      } else if (st.bow === 'poison') {
        // Gravity-driven Xenomorph acid droplet falling straight DOWN from the struck body part `wp`
        if (rand() < 0.26) {
          this.parts.push({
            p: { ...wp }, prev: { ...wp },
            vel: v(limbVx * 0.4 + (rand() - 0.5) * 18, 10 + rand() * 30),
            life: 0, max: 0.36 + rand() * 0.26, r: 1.6 + rand() * 1.4,
            col: rand() < 0.5 ? '#eaff66' : '#8cff00', grav: 720, kind: 'acid', drag: 1.2,
          });
        }
        if (rand() < 0.1) {
          this.parts.push({
            p: { ...wp }, vel: v((rand() - 0.5) * 16, -35 - rand() * 25),
            life: 0, max: 0.38 + rand() * 0.25, r: 4.2 + rand() * 3.5,
            col: '#c4ff80', grav: -85, kind: 'acidSmoke', drag: 2.5, turb: 5,
          });
        }
      }
    }

    if (!hasActiveStuck && f.shockT <= 0 && f.burnT <= 0 && f.poisonT <= 0) return;
    f.dotTick += H;
    if (k.alive && f.dotTick >= 0.55) {
      f.dotTick = 0;
      let dot = 0;
      let label = '';
      let col = '#ffffff';
      if (f.shockT > 0) { dot += 7; label = '⚡ -7'; col = '#5cf4ff'; }
      if (f.burnT > 0) { dot += 8; label = '🔥 -8'; col = '#ff942e'; snd.sizzle(this.pan(k.p[1].x)); }
      if (f.poisonT > 0) { dot += 7; label = '🧪 -7'; col = '#d4ff00'; snd.sizzle(this.pan(k.p[1].x)); }
      if (dot > 0 && !this.mods.headOnly) {
        f.hp -= dot; f.hpShow = 2.5; f.flash = 0.5;
        this.say(k.p[0].x + (rand() - 0.5) * 18, k.p[0].y - (HEAD_R + 22) * k.s, label, col, 14, 0.7);
        if (f.hp <= 0) this.die(f, false);
      }
    }
  }

  private popBalloon(b: Balloon) {
    this.balloons = this.balloons.filter((x) => x !== b);
    const p = v(b.x, b.y);
    this.burst(p, v(0, -1), 12, b.kind === 'heart' ? '#ff5a5f' : '#ffc933', 220);
    snd.pop(this.pan(b.x));
    if (b.kind === 'heart') {
      const pf = this.player;
      pf.hp = Math.min(pf.maxHp, pf.hp + CFG.rewards.balloonHeart);
      this.say(b.x, b.y - 20, tx(`+${CFG.rewards.balloonHeart} HP`, `+${CFG.rewards.balloonHeart} NYAWA`), '#7dffa0', 18, 1.2);
      snd.heal();
    } else {
      const got = this.spawnCoins(p, CFG.rewards.balloonCoin);
      this.say(b.x, b.y - 20, `+${got}`, '#ffd23f', 18, 1.2);
    }
  }

  update(dtReal: number) {
    const dt = Math.min(Math.max(dtReal, 0), 0.05);
    this.rt += dt;
    if (!this.codex) ambTick(dt, THEMES.indexOf(this.theme));
    // the camera breathes, and leans a little toward where you aim
    const pk = this.player.k;
    this.cam = damp(this.cam, Math.sin(this.rt * 0.11) * 0.55 + (this.drag.on ? Math.cos(pk.aim) * 0.3 * pk.pull : 0), 2, dt);
    if (this.xray) { this.xray.t += dt; if (this.xray.t >= this.xray.dur) this.xray = null; }
    const fullX = !!this.xray && this.xray.full; // only the head shot takes over the camera

    // Dynamic Camera Zoom-Out & Framing:
    // Automatically fits the span from the player's ground on the left to the furthest active enemy ground on the right!
    let minWorldX = Math.max(20, this.pPlat.x - 155);
    let maxWorldX = this.VW;
    if (!this.demo && this.stage === 'play') {
      let furthestRight = this.VW * 0.92;
      for (const f of this.foes) {
        if (!f.k.alive && f.deadT > 1.2) continue;
        const rEdge = f.plat.x + f.plat.w * 0.5 + (f.kind === 'rider' ? 300 : 150); // (room for the whole dragon under its rider)
        if (rEdge > furthestRight) furthestRight = rEdge;
      }
      if (this.hostage && this.hostState === 1) {
        furthestRight = Math.max(furthestRight, this.hostage.plat.x + 150);
      }
      maxWorldX = Math.max(this.VW, furthestRight);
    }
    const reqSpanX = Math.max(this.VW, maxWorldX - minWorldX);
    const fitZoom = clamp(this.VW / reqSpanX, 0.52, 1);
    const targetZoom = fullX ? 2.3 : this.stage === 'play' ? fitZoom : this.zoomTo;
    const targetCamX = fitZoom < 0.99 ? (minWorldX + maxWorldX) * 0.5 : this.VW * 0.5;
    const targetCamY = this.VH * 0.5 - (1 - fitZoom) * 55;

    this.zoom = damp(this.zoom, targetZoom, fullX ? 16 : 4.2, dt);
    this.camX = damp(this.camX, targetCamX, 4.2, dt);
    this.camY = damp(this.camY, targetCamY, 4.2, dt);
    if (this.show) {
      // the codex stage: one fixed, close frame on the two grounds and the air between and above them
      // (a bat or the prisoner's rope needs the air overhead; two men on their grounds can be framed closer)
            // the dragon and the fort need the widest frame of all
      const fr = this.show === 'dragon' ? [700, 400, 250, 150] : this.show === 'fort' ? [715, 370, 260, 136] : !this.showFoot() ? [575, 305, 172, 98] : [530, 232, 172, 66];
      this.zoom = Math.min(this.w / fr[0], this.h / fr[1]) / this.sc;
      this.camX = this.pPlat.x + fr[2]; this.camY = this.cy + this.pFyT * this.span - fr[3];
    }
    const heroSpot = !this.demo && !fullX && this.stage === 'clear' && this.clearT > 0.55;
    if (heroSpot) {
      const heroPt = v(pk.p[1].x + 26, pk.p[1].y - 12);
      this.focus = v(damp(this.focus.x, heroPt.x, 5.5, dt), damp(this.focus.y, heroPt.y, 5.5, dt));
    }
    this.panK = damp(this.panK, fullX ? 0.82 : heroSpot ? 0.62 : 0, fullX ? 16 : 5.5, dt);
    this.stepCoins(dt);
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 11 + rand() * 16;
      const dir = rand() < 0.5 ? 1 : -1;
      this.birds.push({ x: dir > 0 ? -0.08 : 1.08, y: 0.08 + rand() * 0.22, vx: dir * (0.045 + rand() * 0.03), n: 3 + Math.floor(rand() * 3), ph: rand() * 6 });
    }
    for (const b of this.birds) b.x += b.vx * dt;
    this.birds = this.birds.filter((b) => b.x > -0.3 && b.x < 1.3);
    if (!this.paused) {
      if (this.hitStop > 0) this.hitStop -= dt;
      else {
        // an X-ray all but stops the clock; the kill's slow motion picks up after it
        if (!fullX) this.slowT -= dt;
        let pace = this.slowT > 0 && (this.demo || this.meta.settings.slowmo) ? this.slowK : 1;
        if (this.run.slowT > 0) pace = Math.min(pace, CFG.cards.lambat.timeScale);
        this.ts = fullX ? 0.03 : damp(this.ts, this.xray ? Math.min(0.3, pace) : pace, 14, dt);
        this.acc += dt * this.ts;
        let guard = 0;
        while (this.acc >= H && guard++ < 10) { this.step(); this.acc -= H; }
        if (guard >= 10) this.acc = 0;
      }
      if (this.stage === 'play' && !this.demo) {
        tickSkinRuntime(this.skinState, dt);
        const r = this.run;
        r.shieldCd = Math.max(0, r.shieldCd - dt); r.slowCd = Math.max(0, r.slowCd - dt); r.slowT = Math.max(0, r.slowT - dt);
      }
      for (const t of this.toastQ) t.t -= dt;
      if (this.toastQ.length) this.toastQ = this.toastQ.filter((t) => t.t > 0);
      this.shake = Math.max(0, this.shake - dt * 28);
      this.hurt = Math.max(0, this.hurt - dt * 2.2);
      this.banner = Math.max(0, this.banner - dt);
      for (const t of this.texts) t.life += dt;
      this.texts = this.texts.filter((t) => t.life < t.max);
      const pf = this.player;
      if (!this.demo && pf.k.alive && pf.hp < pf.maxHp * 0.3 && this.stage === 'play') {
        this.heartT -= dt;
        if (this.heartT <= 0) { this.heartT = 0.85; snd.heart(); }
      }
      if (fullX) { /* the moment holds */ }
      else if (this.stage === 'clear') {
        const prevClear = this.clearT;
        this.clearT += dt;
        // Spotlight camera zooms in on our archer as he launches his charismatic victory freestyle!
        if (this.clearT > 0.55) {
          this.zoomTo = this.clearT < 3.45 ? 1.36 : 1.08;
          const prevVic = pk.victory ?? 0;
          pk.victory = prevVic + dt;
          const vStyle = (pk.victoryStyle ?? 0) % 3;

          // Victory shout & charismatic callout as freestyle begins
          if (prevClear <= 0.62 && this.clearT > 0.62) {
            snd.yay(this.pan(pk.p[0].x));
            const brag =
              this.stars >= 3 ? tx('✦ PERFECT · CHAMPION FORM! ✦', '✦ SEMPURNA · GAYA JUARA! ✦')
              : vStyle === 0 ? tx('✦ CHAMPION FLIP! ✦', '✦ SALTO JUARA! ✦')
              : vStyle === 1 ? tx('✦ WARRIOR POSE! ✦', '✦ GAYA PENDEKAR! ✦')
              : tx('✦ UNSTOPPABLE! ✦', '✦ TAK TERKALAHKAN! ✦');
            this.say(pk.p[0].x, pk.p[0].y - 58, brag, '#ffe24a', 19, 1.8);
          }

          // Crisp shockwave ring & platform bounce right when he sticks his backflip / fist-pump landing!
          const landAt = vStyle === 0 ? 0.98 : vStyle === 1 ? 1.14 : 1.32;
          if (prevVic < landAt && pk.victory >= landAt) {
            pf.plat.vel += 48;
            this.parts.push({ p: v(pf.plat.x, pf.plat.y - 2), vel: v(0, 0), life: 0, max: 0.32, r: 38, col: '#ffd23f', grav: 0, kind: 'ring' });
            snd.thud(this.pan(pf.plat.x), 0);
          }

          // Rising golden champion sparkles around our victorious archer
          if (rand() < 0.38) {
            this.parts.push({
              p: v(pk.p[1].x + (rand() - 0.5) * 48, pk.p[2].y + 8 - rand() * 54),
              prev: v(pk.p[1].x, pk.p[2].y),
              vel: v((rand() - 0.5) * 26, -42 - rand() * 48),
              life: 0,
              max: 0.45 + rand() * 0.3,
              r: 1.7 + rand() * 1.1,
              col: rand() < 0.6 ? '#ffe566' : '#7ef9ff',
              grav: -40,
              kind: 'ember',
            });
          }
        }
        if (this.clearT > 1.05 && !this.rewardPaid) {
          this.rewardPaid = true;
          this.spawnCoins(v(this.w / 2, this.h * 0.24 + 42), levelReward(this.level), true);
        }
        if (this.clearT > 3.85) {
          pk.victory = 0;
          this.pending = 0; this.coinFx = [];
          pf.hp = Math.min(pf.maxHp, Math.round(pf.hp + pf.maxHp * CFG.clearHealPct + this.training.clearHeal));
          this.openShop();
          snd.open();
        }
      } else if (this.stage === 'dying') {
        this.deadT += dt;
        if (this.deadT > CFG.death.screenDelay) { this.stage = 'dead'; snd.lose(); this.endRun('DEAD'); }
      }
    }
    this.emitUi();
  }

  private runUi(): RunUi {
    const r = this.run; const C = CFG.cards; const r1 = (x: number) => Math.round(x * 10) / 10;
    const ls = cardLv(r, 'perisai'); const ll = cardLv(r, 'lambat');
    const nx = this.stage === 'dead' ? nextUnlock(this.meta) : null;
    return {
      cards: (Object.keys(r.cards) as CardId[]).filter((id) => cardLv(r, id) > 0).map((id) => [id, cardLv(r, id)] as [CardId, number]),
      offer: this.offer, pickTitle: this.pickTitle, rerollCost: rerollCost(r), freeRerolls: r.freeRerolls,
      shieldOn: ls > 0, shield: ls ? r1(1 - r.shieldCd / lvVal(C.perisai.cd, ls)) : 0,
      hasSlow: ll > 0, slow: ll ? r1(1 - r.slowCd / lvVal(C.lambat.cd, ll)) : 0, slowOn: r.slowT > 0,
      ganda: r.gandaLeft, gandaMax: gandaShots(r), hunter: r1(hunterMult(r)), streak: r.headStreak,
      synergies: SYNERGIES.filter((s) => r.synergies.includes(s.id)).map((s) => synergyName(s)),
      killedBy: r.killedBy, goldEarned: r.goldEarned, metaGain: r.metaGain,
      chestCost: this.chestCost(), canChest: !r.lastChest && this.coins >= this.chestCost(), lastChest: r.lastChest,
      route: r.route, daily: r.mod ? modLabel(r.mod) : '', next: nx?.text ?? '', nextPct: nx?.pct ?? 0, unlocks: r.unlocks,
      resonance: this.resonance,
    };
  }

  private emitUi() {
    const pf = this.player;
    const perkStatus = skinStatus(this.head, this.skinState, pf.k.pull, pf.hp / pf.maxHp);
    const hasBoss = this.foes.some((f) => f.k.alive && (f.bigBoss || f.kind === 'axer' || f.kind === 'boss'));
    const ui: RUi = {
      stage: this.stage, demo: this.demo, level: this.level, kills: this.kills, total: this.demo ? 1 : this.total, grounds: this.maxAlive, coins: this.demo ? this.meta.coins : this.coins, shown: this.demo ? this.meta.coins : this.coins - this.pending, bump: this.bumpN, hostage: this.hostState,
      totalKills: this.totalKills, headshots: this.headshots, hp: Math.max(0, Math.round(pf.hp)), maxHp: pf.maxHp, best: this.best,
      boss: hasBoss || this.bigBossDue || this.dragonDue, hint: this.hint, paused: this.paused, theme: this.theme.name, stars: this.stars, reward: levelReward(this.level),
      run: this.runUi(), toasts: this.toastQ.map((t) => ({ id: t.id, title: t.title, sub: t.sub })), metaRev: this.metaRev, debug: this.meta.settings.debug,
      skin: { ...perkStatus, id: this.head, progress: Math.round(perkStatus.progress * SKIN_RULES.statusPrecision) / SKIN_RULES.statusPrecision },
      bow: this.bow,
      showGuide: this.showGuide,
      rangeMult: this.rangeMult,
      maxPower: this.maxPower,
    };
    const key = JSON.stringify(ui);
    if (key !== this.last) { this.last = key; this.emit(ui); }
  }

  /* ---------------- drawing ---------------- */

  private drawFighter(ctx: Ctx, f: Fighter) {
    const k = f.k;
    const fl = Math.round(f.flash * 215);
    const big = f.kind === 'boss' || f.kind === 'axer';
    const bk = f.bossKind;
    const bossEye =
      bk === 'thunder_lord' ? '#00f0ff'
      : bk === 'inferno_king' ? '#ff9419'
      : bk === 'xeno_queen' ? '#cfff04'
      : bk === 'thorn_warden' ? '#7dff24'
      : big || f.kind === 'heavy' ? '#ff4b4b' : '#ffffff';
    const bossBand =
      bk === 'thunder_lord' ? '#00b4ff'
      : bk === 'inferno_king' ? '#ff4800'
      : bk === 'xeno_queen' ? '#7bff00'
      : bk === 'thorn_warden' ? '#2eb82e'
            : f.kind === 'player' ? (f.hat && f.hat !== 'band' ? null : (COSMETICS.band[this.meta.cos.band]?.col ?? COSMETICS.band.merah.col))
      : f.kind === 'guard' ? '#ffb02e'
      : big ? '#c4161c'
      : f.kind === 'hostage' ? '#5ad1ff' : null;
    const look: StickLook = {
      color: fl > 4 ? `rgb(${fl},${Math.round(fl * 0.1)},${Math.round(fl * 0.1)})` : '#000000',
      rim: fl > 4 ? null : this.theme.rim,
      eye: bossEye,
      helm: f.helm, crown: f.kind === 'boss', horns: f.kind === 'axer',
      band: bossBand,
      quiver: f.kind !== 'axer' && f.kind !== 'hostage', bound: f.kind === 'hostage' && this.hostState === 1,
      bossKind: bk,
    };
    const base = ctx.globalAlpha;
    if (f.kind !== 'hostage') ctx.globalAlpha = f.deadT > 5 ? clamp(6 - f.deadT, 0, 1) : 1;

        // long hair hangs behind him: it goes down first
    if (f.hat && f.hat !== 'band') drawHeadBack(ctx, k, f.hat, f.hair);
    const activeBow: BowId = f.team === 0 ? this.bow : 'wood';
    drawStick(ctx, k, look, () => {
      if (f.kind === 'axer') {
        drawBossHeldWeapon(ctx, k, bk ?? 'axer', this.rt);
        return;
      }
      if (!k.hasBow) return;
      const hold = onString(k);
      const inVic = !!(k.victory && k.victory > 0);
      if (inVic) {
        const vt = k.victory!;
        const vs = (k.victoryStyle ?? 0) % 3;
        const spinning =
          (vs === 0 && vt > 0.35 && vt < 1.52) ||
          (vs === 1 && vt > 0.05 && vt < 1.08) ||
          (vs === 2 && vt > 0.05 && vt < 0.85);
        if (spinning) {
          ctx.save();
          ctx.translate(k.p[4].x, k.p[4].y);
          ctx.rotate(k.bowAng);
          ctx.scale(k.s, k.s);
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255, 224, 115, 0.45)';
          ctx.lineWidth = 3.4;
          ctx.beginPath(); ctx.arc(0, 0, 32, -1.25, 1.25); ctx.stroke();
          ctx.strokeStyle = 'rgba(130, 244, 255, 0.38)';
          ctx.lineWidth = 2.1;
          ctx.beginPath(); ctx.arc(0, 0, 32, Math.PI - 1.15, Math.PI + 1.15); ctx.stroke();
          ctx.restore();
        }
      }
      const vib = f.vib < 0.5 ? Math.exp(-f.vib * 12) * Math.cos(f.vib * 85) * 7 : 0;
      drawBow(ctx, k.p[4], k.bowAng, k.s, hold ? dist(k.p[4], k.p[6]) : null, vib, !inVic && k.nock >= 1, activeBow, this.rt);
      if (!inVic && k.nock < 1 && k.nock > 0.55) drawArrow(ctx, add(k.p[6], fromAngle(k.bowAng, ARROW_LEN * k.s)), k.bowAng, k.s, false, activeBow, this.rt, false);
    }, () => {
      // arrows & axes embedded (`nancep`) in him go down first: the body then closes over the buried points/blades!
      // When `st.halfThrough === true` (MAX POWER final hit), half of the arrow (`ARROW_LEN * 0.5`) juts out the back with its arrowhead visible!
      for (const st of f.stuck) {
        const [ia, ib] = RAG_STICKS[st.stick];
        const A = k.p[ia]; const B = k.p[ib];
        const ba = Math.atan2(B.y - A.y, B.x - A.x); const c = Math.cos(ba); const sn = Math.sin(ba);
        const wp = v(A.x + st.lx * c - st.ly * sn, A.y + st.lx * sn + st.ly * c);
        if (st.isAxe) {
          drawAxe(ctx, wp, ba + st.rel, st.s ?? 1.25, true, st.bossKind ?? 'axer', this.rt);
        } else {
          drawArrow(ctx, wp, ba + st.rel, 1, !st.halfThrough, st.bow, this.rt, false);
        }
      }
    });

    // whatever he wears on his head goes on last: hair flows over his shoulders, a visor covers his eyes
    if (f.hat && f.hat !== 'band') drawHead(ctx, k, f.hat, f.hair, this.rt);

    // LEVEL-1 LOCALIZED ELEMENTAL SIMULATION ON THE STRUCK BODY PART ONLY (`st.stick` at `st.u`):
    for (let si = 0; si < f.stuck.length; si++) {
      const st = f.stuck[si];
      if (st.fxT <= 0) continue;
      const [ia, ib] = RAG_STICKS[st.stick];
      const A = k.p[ia]; const B = k.p[ib];
      const wp = lerpV(A, B, st.u);
      const inten = clamp(st.fxT / 1.2, 0, 1);
      const limbVx = (B.x - k.o[ib].x) / H;

      if (st.bow === 'thunder') {
        // 1. Localized Level-1 Electro-Shock ONLY on `st.stick`:
        if (this.cyanSpr) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = inten * 0.42;
          const r = 28 * k.s;
          ctx.drawImage(this.cyanSpr as unknown as CanvasImageSource, wp.x - r, wp.y - r, r * 2, r * 2);
          ctx.restore();
        }
        // Only the bone of the struck body part (`st.stick`) softly illuminates inside the black silhouette
        if (Math.sin(this.rt * 38 + si * 2) > -0.2) {
          ctx.save();
          ctx.shadowColor = 'rgba(0, 235, 255, 0.9)';
          ctx.shadowBlur = 6 * this.dpr;
          ctx.globalAlpha = inten * 0.85;
          drawSkeleton(ctx, k, st.stick, wp, 0, true);
          ctx.restore();
        }
        // Delicate, smooth plasma filament hugging only the struck bone segment (`A` <-> `wp` <-> `B`)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = inten * 0.9;
        drawBolt(ctx, A, wp, 4.2 * k.s, 5, '#ffffff', '#00e5ff', 1.15, false, this.rt * 18 + si * 7);
        drawBolt(ctx, wp, B, 4.2 * k.s, 5, '#ffffff', '#00e5ff', 1.15, false, this.rt * 18 + si * 7 + 3);
        ctx.restore();
      } else if (st.bow === 'fire') {
        // 2. Localized Level-1 Fluid Simulation Flame ONLY at `wp` on the struck body part:
        // Flame naturally rises straight UP against world gravity (`-Math.PI / 2`), swaying gently with limb motion!
        if (this.fireSpr) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = inten * 0.38;
          const r = 26 * k.s;
          ctx.drawImage(this.fireSpr as unknown as CanvasImageSource, wp.x - r, wp.y - r, r * 2, r * 2);
          ctx.restore();
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = inten * 0.92;
        const sway = clamp(-limbVx * 0.0018, -0.35, 0.35) + Math.sin(this.rt * 9 + si * 2.3) * 0.12;
        drawSimFlame(ctx, wp, -Math.PI / 2 + sway, 19 * k.s, 6.2 * k.s, 0.5, this.rt, si * 3.1 + 1);
        drawSimFlame(ctx, wp, -Math.PI / 2 + sway * 0.6, 13 * k.s, 4.2 * k.s, 0.92, this.rt, si * 5.7 + 2);
        ctx.restore();
      } else if (st.bow === 'poison') {
        // 3. Localized Level-1 Xenomorph Acid ONLY at `wp` on the struck body part:
        // Subtle green acid-etched gleam on the struck bone + gravity-accurate dripping strand straight DOWN (`+y`)!
        if (this.acidSpr) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = inten * 0.35;
          const r = 24 * k.s;
          ctx.drawImage(this.acidSpr as unknown as CanvasImageSource, wp.x - r, wp.y - r, r * 2, r * 2);
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = inten * 0.88;
        const cycle = (this.rt * 1.6 + si * 0.37) % 1;
        const dropLen = (4 + cycle * 14) * k.s;
        const lagX = clamp(-limbVx * 0.015, -4, 4);
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#7bff00'; ctx.lineWidth = 1.9 * (1 - cycle * 0.45) * k.s;
        ctx.beginPath(); ctx.moveTo(wp.x, wp.y); ctx.lineTo(wp.x + lagX, wp.y + dropLen); ctx.stroke();
        ctx.strokeStyle = '#eaff66'; ctx.lineWidth = 0.85 * k.s;
        ctx.beginPath(); ctx.moveTo(wp.x, wp.y); ctx.lineTo(wp.x + lagX, wp.y + dropLen); ctx.stroke();
        ctx.fillStyle = '#d4ff00';
        ctx.beginPath(); ctx.ellipse(wp.x + lagX, wp.y + dropLen, 1.6 * k.s, 2.3 * k.s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    ctx.globalAlpha = f.kind === 'hostage' ? base : 1;
  }

  /**
   * Draws the thick glossy Health Bar + 3D Circular Level Badge + Delayed White Damage Catch-Up Bar
   * matching Image 1 (`Gambar 1`).
   */
  private drawBar(ctx: Ctx, f: Fighter) {
    const k = f.k;
    const big = f.kind === 'boss' || f.kind === 'axer';
    const sc = clamp(k.s, 0.96, 1.32);
    const bump = f.barBump > 0 ? 1 + 0.13 * Math.sin(f.barBump * Math.PI) : 1;
    const fade = k.alive ? clamp((f.plat.rise - 0.55) * 3, 0, 1) : clamp(1 - f.deadT / 0.55, 0, 1);
    if (fade <= 0.01) return;

    const bw = (big ? 68 : f.lvl >= 3 ? 56 : f.lvl === 2 ? 51 : 46) * sc;
    const bh = 11.5 * sc;
    const rOrb = 11.2 * sc;
    const headX = k.p[0].x;
    const headY = Math.min(k.p[0].y, k.p[1].y - 12 * k.s) - (HEAD_R + 22) * k.s - (big ? 20 : f.helm ? 6 : 0);

    const hpFrac = clamp(f.hp / f.maxHp, 0, 1);
    const lagFrac = clamp(f.hpLag / f.maxHp, hpFrac, 1);
    const isEnemyOrLow = f.team === 1 || hpFrac <= 0.3;

    ctx.save();
    ctx.globalAlpha *= fade;
    ctx.translate(headX, headY);
    if (bump !== 1) ctx.scale(bump, bump);

    // Total width of (Orb + Bar) centered above the head
    const xBar = -bw * 0.42;
    const yBar = -bh * 0.5;
    const cxOrb = xBar - rOrb * 0.32;
    const cyOrb = 0;

    // 1. Rectangular Bar Outer Metallic Frame & Dark Bevel (Image 1 style)
    ctx.fillStyle = '#142b42';
    ctx.fillRect(xBar - 2, yBar - 2, bw + 4, bh + 4);
    ctx.strokeStyle = '#8faabf';
    ctx.lineWidth = 1.5 * sc;
    ctx.strokeRect(xBar - 1.5, yBar - 1.5, bw + 3, bh + 3);

    // 2. Empty Track (Slate-Blue like Image 1's right side)
    ctx.fillStyle = 'rgba(34, 74, 114, 0.88)';
    ctx.fillRect(xBar, yBar, bw, bh);
    ctx.fillStyle = 'rgba(18, 44, 72, 0.65)';
    ctx.fillRect(xBar, yBar + bh * 0.52, bw, bh * 0.48);

    // 3. Delayed White Damage Catch-Up Bar (`hpLag` — the crisp white middle section in Image 1!)
    if (lagFrac > hpFrac + 0.003) {
      const wx = xBar + bw * hpFrac;
      const ww = bw * (lagFrac - hpFrac);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx, yBar, ww, bh);
      ctx.fillStyle = '#dceeff';
      ctx.fillRect(wx, yBar + bh * 0.62, ww, bh * 0.38);
    }

    // 4. Glossy Two-Tone Health Fill (Bright top highlight + rich bottom shade like Image 1)
    if (hpFrac > 0.002) {
      const fw = bw * hpFrac;
      const topCol = isEnemyOrLow ? '#ff5e5e' : '#70f588';
      const botCol = isEnemyOrLow ? '#c41c22' : '#1ca339';
      ctx.fillStyle = botCol;
      ctx.fillRect(xBar, yBar, fw, bh);
      ctx.fillStyle = topCol;
      ctx.fillRect(xBar, yBar, fw, bh * 0.44);
      // Thin specular top edge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(xBar, yBar + 0.6, fw, 1.3 * sc);
    }

    // Subtle divider ticks for thick HP enemies (Level 2 / Level 3 / Bosses)
    const segs = Math.min(6, Math.max(1, Math.round(f.maxHp / 42)));
    if (segs > 1) {
      ctx.fillStyle = 'rgba(10, 26, 42, 0.38)';
      for (let i = 1; i < segs; i++) {
        ctx.fillRect(xBar + (bw * i) / segs - 0.6, yBar, 1.2, bh);
      }
    }

    // 5. Glossy 3D Circular Level Badge on the Left (Image 1's shiny red orb with level number!)
    const orbRim = isEnemyOrLow ? '#6b0b11' : '#0a471b';
    const orbBody = isEnemyOrLow ? '#de2027' : '#22b845';
    const orbHi = isEnemyOrLow ? '#ff8888' : '#94ffa4';

    // Drop shadow behind orb
    ctx.fillStyle = 'rgba(0, 12, 24, 0.45)';
    ctx.beginPath();
    ctx.arc(cxOrb + 1, cyOrb + 1.5, rOrb + 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Outer dark rim + main orb body
    ctx.fillStyle = orbRim;
    ctx.beginPath();
    ctx.arc(cxOrb, cyOrb, rOrb + 1.2 * sc, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = orbBody;
    ctx.beginPath();
    ctx.arc(cxOrb, cyOrb, rOrb, 0, Math.PI * 2);
    ctx.fill();

    // Inner lower-right shading crescent
    ctx.fillStyle = 'rgba(70, 0, 8, 0.28)';
    ctx.beginPath();
    ctx.arc(cxOrb, cyOrb, rOrb, -0.2, Math.PI * 0.85);
    ctx.fill();

    // Upper-left glossy highlight crescent & specular dot (matching Image 1!)
    ctx.save();
    ctx.translate(cxOrb - rOrb * 0.26, cyOrb - rOrb * 0.3);
    ctx.rotate(-0.55);
    ctx.fillStyle = orbHi;
    ctx.beginPath();
    ctx.ellipse(0, 0, rOrb * 0.52, rOrb * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.ellipse(-rOrb * 0.08, -rOrb * 0.06, rOrb * 0.28, rOrb * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bold Italic Level Number inside the Orb (`1`, `2`, `3`, ...)
    const lvlStr = String(f.lvl);
    ctx.font = `italic 900 ${Math.round(13.5 * sc)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#290914';
    ctx.lineWidth = 3.2 * sc;
    ctx.strokeText(lvlStr, cxOrb - 0.5 * sc, cyOrb + 0.8 * sc);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lvlStr, cxOrb - 0.5 * sc, cyOrb + 0.8 * sc);

    ctx.restore();
  }

  private text(ctx: Ctx, s: string, x: number, y: number, size: number, col: string, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.font = `italic 900 ${size}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = 'rgba(0,18,30,0.6)';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = col; ctx.fillText(s, x, y);
    ctx.globalAlpha = 1;
  }

  /** everything that lives in the forest behind and in front of the fight */
  private ambience(ctx: Ctx, W: number, Hh: number, part: 'sky' | 'mid' | 'front', off: number) {
    const th = this.theme; const dpr = this.dpr; const rt = this.rt;
    const u = Math.max(0.5, Math.min(W, Hh * 1.5) / (1100 * dpr));
    if (part === 'sky') {
      // shafts of light through the canopy
      ctx.globalCompositeOperation = 'lighter';
      const leanX = Math.tan(th.disc[0] > 0.5 ? -0.36 : 0.36) * Hh;
      for (const r of this.rays) {
        const a = 0.05 + 0.04 * Math.sin(rt * 0.35 + r.ph);
        const x = r.x * W + off + Math.sin(rt * 0.12 + r.ph) * 24 * dpr; const w0 = r.w * W;
        const g = ctx.createLinearGradient(x, 0, x + leanX, Hh * 0.95);
        g.addColorStop(0, `rgba(${th.ray},${a})`); g.addColorStop(1, `rgba(${th.ray},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x - w0 / 2, -10); ctx.lineTo(x + w0 / 2, -10); ctx.lineTo(x + leanX + w0 * 1.4, Hh * 0.95); ctx.lineTo(x + leanX - w0 * 1.4, Hh * 0.95); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // a flock crossing far away
      ctx.strokeStyle = th.tree; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.8 * dpr * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const b of this.birds) {
        const dir = Math.sign(b.vx);
        for (let i = 0; i < b.n; i++) {
          const x = (b.x - dir * i * 0.02) * W; const y = (b.y + (i % 2 ? 1 : -1) * i * 0.012 + Math.sin(rt * 0.9 + i + b.ph) * 0.006) * Hh;
          const s = (6 + (i % 3)) * dpr * u; const flap = Math.sin(rt * 9 + i * 1.3 + b.ph) * 0.7;
          ctx.beginPath(); ctx.moveTo(x - s, y - s * flap); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.25 * flap - s * 0.2, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.25 * flap - s * 0.2, x + s, y - s * flap); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    if (part === 'sky' || part === 'front') {
      // fireflies: small and many among the trees, a few big soft ones close to the lens
      const front = part === 'front'; const spr = this.flySpr;
      if (spr) {
        ctx.globalCompositeOperation = 'lighter';
        for (const fl of this.flies) {
          if (fl.front !== front) continue;
          const t = rt * fl.sp;
          const b = Math.pow(Math.max(0, Math.sin(rt * fl.bl + fl.ph * 3)), 1.6);
          if (b < 0.02) continue;
          const x = (fl.x + Math.sin(t + fl.ph) * 0.035 + Math.sin(t * 0.37 + fl.ph * 2.1) * 0.05) * W;
          const y = (fl.y + Math.cos(t * 0.8 + fl.ph * 1.3) * 0.04 + Math.sin(t * 0.23 + fl.ph) * 0.03) * Hh;
          const r = fl.r * dpr * u;
          ctx.globalAlpha = b * (front ? 0.42 : 0.95);
          ctx.drawImage(spr as unknown as CanvasImageSource, x - r, y - r, r * 2, r * 2);
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    }
    if (part === 'mid') {
      // vines swaying from the canopy
      ctx.strokeStyle = th.tree; ctx.fillStyle = th.tree; ctx.globalAlpha = 0.4; ctx.lineWidth = 2.4 * dpr * u; ctx.lineCap = 'round';
      for (const vn of this.vines) {
        const x = vn.x * W + off; const L = vn.len * Hh;
        const sw = Math.sin(rt * 0.8 + vn.ph) * L * 0.09 + Math.sin(rt * 1.9 + vn.ph * 2) * L * 0.02;
        ctx.beginPath(); ctx.moveTo(x, -4); ctx.quadraticCurveTo(x + sw * 0.35, L * 0.55, x + sw, L); ctx.stroke();
        let side = 1;
        for (const t of [0.3, 0.52, 0.72, 0.9, 1]) {
          const m = 1 - t;
          const px = m * m * x + 2 * m * t * (x + sw * 0.35) + t * t * (x + sw); const py = 2 * m * t * L * 0.55 + t * t * L;
          ctx.beginPath(); ctx.ellipse(px + side * 5 * dpr * u, py, 6.5 * dpr * u, 3.2 * dpr * u, side * 0.6, 0, Math.PI * 2); ctx.fill();
          side = -side;
        }
      }
      // low mist drifting between the trunks
      const mist = this.mistSpr;
      if (mist) {
        for (const m of this.mists) {
          const x = ((((m.x + rt * m.sp) % 1.5) + 1.5) % 1.5) - 0.25;
          ctx.globalAlpha = 0.1 + 0.04 * Math.sin(rt * 0.3 + m.y * 20);
          ctx.drawImage(mist as unknown as CanvasImageSource, x * W - W * 0.45, m.y * Hh - Hh * 0.11, W * 0.9, Hh * 0.22);
        }
      }
      // leaves tumbling down
      ctx.fillStyle = th.tree; ctx.globalAlpha = 0.5;
      for (const lf of this.leaves) {
        const y = ((lf.y + rt * lf.sp) % 1.15) - 0.08;
        const x = ((lf.x + Math.sin(rt * 0.9 + lf.ph) * 0.03 + rt * 0.012) % 1.1) - 0.05;
        ctx.save();
        ctx.translate(x * W, y * Hh); ctx.rotate(rt * lf.rs + lf.ph + Math.sin(rt * 1.7 + lf.ph));
        ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(rt * 1.3 + lf.ph)));
        ctx.beginPath(); ctx.ellipse(0, 0, lf.r * dpr * u, lf.r * dpr * u * 0.48, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    if (part === 'front') {
      // tall grass right at the lens, moving with the wind
      ctx.fillStyle = th.fg; ctx.globalAlpha = 0.94;
      ctx.beginPath();
      const gust = Math.sin(rt * 0.5) * 0.12;
      for (const b of this.blades) {
        const x = b.x * W; const hh = b.h * dpr * u; const bw = b.w * dpr * u;
        const sw = (Math.sin(rt * 1.5 + b.x * 14 + b.ph) * 0.2 + Math.sin(rt * 0.63 + b.x * 5) * 0.16 + gust) * hh;
        ctx.moveTo(x - bw, Hh + 2);
        ctx.quadraticCurveTo(x + sw * 0.3 - bw * 0.3, Hh - hh * 0.6, x + sw, Hh - hh);
        ctx.quadraticCurveTo(x + sw * 0.3 + bw, Hh - hh * 0.5, x + bw, Hh + 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /**
   * X-ray. A head shot is the Mortal-Kombat moment: the world goes dark and cold, the camera closes in and you
   * see the whole skeleton with the skull splitting. Any other hit opens a small window over just the bone that
   * was struck - no zoom, the fight carries on around it.
   */
  private drawXray(ctx: Ctx, W: number, Hh: number, shx: number, shy: number) {
    const x = this.xray;
    if (!x) return;
    const { w, h, dpr } = this; const k = x.f.k; const s = k.s;
    const u = x.t / x.dur;
    const e = clamp(x.t / 0.06, 0, 1) * clamp((x.dur - x.t) / 0.12, 0, 1);
    const [ck, cx0, cy0] = this.camTf();
    const world = () => ctx.setTransform(dpr * ck, 0, 0, dpr * ck, dpr * (cx0 + shx), dpr * (cy0 + shy));
    const inside = () => {
      // the flesh is only a dim blue shadow with a cold halo, and inside it, the bones
      ctx.shadowColor = 'rgba(60,180,255,0.95)'; ctx.shadowBlur = 14 * dpr;
      drawStick(ctx, k, { color: '#17588a', rim: null, eye: 'rgba(0,0,0,0)', helm: false, crown: false, band: null, quiver: false });
      ctx.shadowColor = 'rgba(170,240,255,0.95)'; ctx.shadowBlur = 7 * dpr;
      drawSkeleton(ctx, k, x.stick, x.pt, u, !x.full);
      ctx.shadowBlur = 0;
      drawArrow(ctx, add(x.pt, fromAngle(x.ang, 2)), x.ang, 1, false);
    };
    const chips = (n: number, reach: number) => {
      ctx.fillStyle = '#ecfcff';
      for (let i = 0; i < n; i++) {
        const a = x.ang + (i - (n - 1) / 2) * 0.33; const dd = 5 + u * (reach + i * 7);
        ctx.globalAlpha = e * (1 - u * 0.6);
        ctx.save();
        ctx.translate(x.pt.x + Math.cos(a) * dd, x.pt.y + Math.sin(a) * dd + u * u * 26); ctx.rotate(i * 2 + u * 9);
        ctx.beginPath(); ctx.moveTo(-2.4, -1.2); ctx.lineTo(2.6, 0); ctx.lineTo(-1.6, 1.8); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    };
    if (!x.full) {
      world();
      // Non-head X-ray: DO NOT draw a black panel or capsule border!
      // Because the stickman body is already black (#000000), the glowing cyan-white bones & fracture show right inside the body!
      const [ia, ib] = RAG_STICKS[x.stick];
      let A = k.p[ia]; let B = k.p[ib];
      if (x.stick === 1) { A = lerpV(k.p[2], k.p[1], clamp(x.u - 0.2, 0, 1)); B = lerpV(k.p[2], k.p[1], clamp(x.u + 0.2, 0, 0.97)); }
      const r = (x.stick === 1 ? 17 : 14) * s * (0.55 + 0.45 * ease.out(Math.min(1, x.t / 0.09)));
      ctx.save();
      ctx.globalAlpha = e;
      ctx.shadowColor = 'rgba(110, 235, 255, 0.98)';
      ctx.shadowBlur = 9 * dpr;
      drawSkeleton(ctx, k, x.stick, x.pt, u, true);
      ctx.shadowBlur = 0;
      ctx.restore();
      chips(5, 22);
      const mid = lerpV(A, B, 0.5);
      const label = x.stick === 1 ? tx('CRACKED RIBS!', 'RUSUK RETAK!') : x.stick <= 5 ? tx('BROKEN LEG BONE!', 'TULANG KAKI RETAK!') : tx('BROKEN ARM BONE!', 'TULANG LENGAN RETAK!');
      this.text(ctx, label, mid.x, Math.min(A.y, B.y) - r - 11 - u * 8, 12 * (1 + 0.3 * Math.max(0, 1 - u * 5)), '#dffaff', e);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.84 * e; ctx.fillStyle = '#020a18'; ctx.fillRect(0, 0, W, Hh);
    world();
    ctx.globalAlpha = e;
    inside();
    // the shock of the impact, a red ring, chips of bone leaving with the arrow
    const pop = Math.max(0, 1 - u * 2.2);
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + 0.3; const r0 = 9 + u * 30; const r1 = r0 + (10 + (i % 3) * 7) * (0.4 + pop);
      ctx.globalAlpha = e * (0.3 + 0.7 * pop); ctx.lineWidth = 2.2 * (0.4 + pop);
      ctx.beginPath(); ctx.moveTo(x.pt.x + Math.cos(a) * r0, x.pt.y + Math.sin(a) * r0); ctx.lineTo(x.pt.x + Math.cos(a) * r1, x.pt.y + Math.sin(a) * r1); ctx.stroke();
    }
    ctx.strokeStyle = '#ff4d4d'; ctx.globalAlpha = e * (1 - u); ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(x.pt.x, x.pt.y, 6 + u * 30, 0, Math.PI * 2); ctx.stroke();
    chips(7, 34);
    // on the glass: scan lines, a cold vignette, and what just happened
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 0.07 * e; ctx.fillStyle = '#9fe6ff';
    for (let y = (this.rt * 60) % 4; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    ctx.globalAlpha = e;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(30,120,200,0)'); g.addColorStop(1, 'rgba(30,120,200,0.4)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const size = clamp(w * 0.05, 22, 44) * (1 + 0.35 * Math.max(0, 1 - u * 5));
    this.text(ctx, tx('SKULL FRACTURED!', 'TENGKORAK RETAK!'), w / 2 + (rand() - 0.5) * 3 * pop, h * 0.84, size, '#eafcff', e);
    ctx.globalAlpha = 1;
  }

  render(ctx: Ctx) {
    const { w, h, dpr } = this;
    const W = Math.round(w * dpr); const Hh = Math.round(h * dpr);
    const th = this.theme;
    const key = `${W}x${Hh}:${th.name}`;
    if (key !== this.sceneKey || !this.scene) {
      this.scene = paintScene(W, Hh, th, THEMES.indexOf(th) + 1, this.make);
      this.flySpr = glowSprite(this.make, th.fly, 64);
      if (!this.mistSpr) this.mistSpr = glowSprite(this.make, '#ffffff', 128);
      if (!this.goldSpr) this.goldSpr = glowSprite(this.make, '#ffc933', 64);
      if (!this.cyanSpr) this.cyanSpr = glowSprite(this.make, '#00e5ff', 96);
      if (!this.fireSpr) this.fireSpr = glowSprite(this.make, '#ff6a00', 96);
      if (!this.acidSpr) this.acidSpr = glowSprite(this.make, '#a6ff00', 96);
      this.sceneKey = key;
    }
    const sn = this.scene; const pad = sn.pad; const cam = clamp(this.cam, -1, 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sn.sky as unknown as CanvasImageSource, -pad - cam * pad * 0.25, 0);
    this.ambience(ctx, W, Hh, 'sky', -cam * pad * 0.3);
    ctx.drawImage(sn.near as unknown as CanvasImageSource, -pad - cam * pad * 0.55, 0);
    this.ambience(ctx, W, Hh, 'mid', -cam * pad * 0.55);
    ctx.drawImage(sn.hills as unknown as CanvasImageSource, -pad - cam * pad * 0.9, 0);

    const shk = this.shake * (this.demo ? 1 : this.meta.settings.shake);
    const shx = (rand() - 0.5) * shk; const shy = (rand() - 0.5) * shk;
    const [ck, cx0, cy0] = this.camTf();
    ctx.setTransform(dpr * ck, 0, 0, dpr * ck, dpr * (cx0 + shx), dpr * (cy0 + shy));

    for (const b of this.balloons) {
      const col = b.kind === 'heart' ? '#ff5a5f' : '#ffc933';
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y + 17); ctx.quadraticCurveTo(b.x + Math.sin(this.t * 3 + b.phase) * 5, b.y + 30, b.x, b.y + 42); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 14, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(b.x - 3.5, b.y + 16); ctx.lineTo(b.x + 3.5, b.y + 16); ctx.lineTo(b.x, b.y + 21); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(b.x - 5, b.y - 7, 3, 5, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.kind === 'heart' ? '+' : '$', b.x + 1, b.y + 1);
    }

    // arrows & axes stuck (`nancep`) in a ground go down first, so the ground closes over the buried point/blade
    for (const a of this.arrows) if (a.stuckIn) { ctx.globalAlpha = clamp(5 - a.life, 0, 1); drawArrow(ctx, a.p, a.ang, 1, true, a.bow, this.rt, false); }
    for (const ax of this.axes) if (ax.stuckIn) { ctx.globalAlpha = clamp(6 - ax.life, 0, 1); drawAxe(ctx, ax.p, ax.ang, ax.s, true, ax.bossKind, this.rt); }
    ctx.globalAlpha = 1;
    // the floating grounds, each on its own cushion of light
        for (const p of [this.pPlat, ...this.plats]) {
      if (p.hidden) continue;
      const x = p.x - p.w / 2;
      ctx.globalAlpha = (p.state === 'on' ? 1 : clamp(p.rise * 1.6, 0, 1)) * (0.75 + 0.25 * Math.sin(this.rt * 2.2 + p.phase));
      const g = ctx.createLinearGradient(0, p.y + p.h, 0, p.y + p.h + 38);
      g.addColorStop(0, th.glow); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x + 5, p.y + p.h, p.w - 10, 38);
      ctx.globalAlpha = p.state === 'on' ? 1 : clamp(p.rise * 1.6, 0, 1);
      ctx.fillStyle = th.plat; ctx.fillRect(x, p.y, p.w, p.h);
      ctx.fillStyle = th.platTop; ctx.fillRect(x, p.y, p.w, 3.5);
    }
    ctx.globalAlpha = 1;

        this.drawExtrasBack(ctx);
    for (const f of this.foes) if (!f.k.alive) this.drawFighter(ctx, f);
    for (const f of this.foes) {
      if (!f.k.alive) continue;
      // the board is drawn in front of him while he holds it out, and behind him once it is slung on his back
      const onBack = !!f.shield && f.shield.g < 0.5;
      if (onBack) this.drawShieldOf(ctx, f);
      this.drawFighter(ctx, f);
      if (!onBack) this.drawShieldOf(ctx, f);
    }
    this.drawHostage(ctx);
    this.drawFighter(ctx, this.player);
    if (!this.demo && this.player.k.alive && SKIN_PERKS[this.head].signature.kind === 'barrier' && this.skinState.barrierCd <= 0) {
      const f = SKIN_RULES.fx; const at = this.player.k.p[1];
      ctx.save(); ctx.strokeStyle = SKIN_PERKS[this.head].color; ctx.lineWidth = f.trailWidth;
      ctx.globalAlpha = f.barrierAlpha + Math.sin(this.rt) * f.barrierPulse;
      ctx.beginPath(); ctx.arc(at.x, at.y, f.barrierRadius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // PANAH PAKU nails, and the PERISAI bubble while it is charged
    for (const f of this.foes) {
      if (!f.k.alive || !f.pinT || f.pinT <= 0 || !f.pinAt) continue;
      const hip = f.k.p[2];
      ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2.6; ctx.globalAlpha = clamp(f.pinT * 2, 0, 1);
      ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(f.pinAt.x, f.pinAt.y); ctx.stroke();
      ctx.fillStyle = '#8a9aa3'; ctx.fillRect(f.pinAt.x - 4, f.pinAt.y - 3, 8, 4);
      ctx.globalAlpha = 1;
    }
    if (!this.demo && this.player.k.alive && cardLv(this.run, 'perisai') && this.run.shieldCd <= 0) {
      const c = lerpV(this.player.k.p[0], this.player.k.p[2], 0.45);
      ctx.strokeStyle = '#7fe9f2'; ctx.lineWidth = 2; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.rt * 4);
      ctx.beginPath(); ctx.arc(c.x, c.y, 46, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
        this.drawBats(ctx);
    this.drawExtrasFront(ctx);
    for (const b of this.bows) drawBow(ctx, b.p, b.ang, b.s, null, 0, false, b.bow, this.rt);
    for (const ax of this.axes) {
      if (ax.stuckIn) continue;
      const wLabel = bossWeaponLabel(ax.bossKind);
      // Target reticle & callout around the Boss's thrown weapon so the player knows to shoot it out of the air!
      if (!ax.spent && !this.demo) {
        const pulse = 0.5 + 0.5 * Math.sin(this.rt * 18);
        ctx.save();
        ctx.strokeStyle = pulse > 0.5 ? '#ff4d4d' : '#ffd23f';
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = 0.78;
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(ax.p.x, ax.p.y, 28 + pulse * 5, this.rt * 4, this.rt * 4 + Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        this.text(ctx, tx(`SHOOT ${wLabel}!`, `PANAH ${wLabel}!`), ax.p.x, ax.p.y - 36, 12, '#ffe24a', 0.92);
      }
      // Spinning or javelin weapon with motion-trail ghosts
      for (const [back, al] of [[0.5, 0.18], [0.25, 0.32], [0, 1]]) {
        ctx.globalAlpha = ax.spent ? al * 0.7 : al;
        if (ax.bossKind === 'thunder_lord') {
          const pos = add(ax.p, mul(ax.vel, -0.025 * back));
          drawAxe(ctx, add(pos, fromAngle(ax.ang, -14 * ax.s)), ax.ang, ax.s, false, ax.bossKind, this.rt);
        } else {
          const an = ax.ang - ax.vr * 0.045 * back * 2;
          drawAxe(ctx, add(ax.p, fromAngle(an, -12 * ax.s)), an, ax.s, false, ax.bossKind, this.rt);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'round';
    for (const a of this.arrows) {
      if (a.stuckIn) continue;
      // Elemental ribbon behind every arrow in flight
      const tail = add(a.p, mul(a.vel, a.bow === 'thunder' || a.bow === 'fire' ? -0.068 : -0.048));
      const g = ctx.createLinearGradient(a.p.x, a.p.y, tail.x, tail.y);
      if (a.bow === 'thunder') {
        g.addColorStop(0, 'rgba(180, 255, 255, 0.98)'); g.addColorStop(0.5, 'rgba(0, 220, 255, 0.55)'); g.addColorStop(1, 'rgba(0, 120, 255, 0)');
        ctx.lineWidth = 4.5;
      } else if (a.bow === 'fire') {
        g.addColorStop(0, 'rgba(255, 240, 130, 0.95)'); g.addColorStop(0.45, 'rgba(255, 100, 15, 0.65)'); g.addColorStop(1, 'rgba(200, 20, 0, 0)');
        ctx.lineWidth = 5.2;
      } else if (a.bow === 'spike') {
        g.addColorStop(0, 'rgba(125, 255, 36, 0.85)'); g.addColorStop(1, 'rgba(40, 180, 30, 0)');
        ctx.lineWidth = 3.4;
            } else if (a.bow === 'gold') {
        g.addColorStop(0, 'rgba(255, 246, 200, 0.95)'); g.addColorStop(0.5, 'rgba(255, 201, 51, 0.6)'); g.addColorStop(1, 'rgba(184, 134, 11, 0)');
        ctx.lineWidth = 4;
      } else if (a.bow === 'legend') {
        g.addColorStop(0, 'rgba(255, 255, 255, 0.98)'); g.addColorStop(0.4, 'rgba(185, 168, 255, 0.7)'); g.addColorStop(0.75, 'rgba(92, 244, 255, 0.4)'); g.addColorStop(1, 'rgba(255, 123, 229, 0)');
        ctx.lineWidth = 5.4;
      } else if (a.bow === 'poison') {
        g.addColorStop(0, 'rgba(230, 255, 80, 0.95)'); g.addColorStop(0.5, 'rgba(130, 255, 0, 0.68)'); g.addColorStop(1, 'rgba(30, 170, 0, 0)');
        ctx.lineWidth = 4.2;
      } else {
        g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.lineWidth = 2.6;
      }
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
      // cosmetic arrow trail (JEJAK PANAH)
      if (a.trail && a.trail.length > 1 && this.meta.settings.trail) {
        const cols = (COSMETICS.trail[this.meta.cos.trail] ?? COSMETICS.trail.putih).cols;
        for (let i = 1; i < a.trail.length; i++) {
          const u = i / a.trail.length;
          ctx.globalAlpha = u * 0.5; ctx.strokeStyle = cols[i % cols.length]; ctx.lineWidth = 1 + 2.4 * u;
          ctx.beginPath(); ctx.moveTo(a.trail[i - 1].x, a.trail[i - 1].y); ctx.lineTo(a.trail[i].x, a.trail[i].y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if (a.skin && this.meta.settings.trail) drawSkinShot(ctx, a.p, a.vel, a.skin, this.rt);
      drawArrow(ctx, a.p, a.ang, 1, false, a.bow, this.rt);
    }

    // Render simulation particles (smoke, Xenomorph acid globules & normal first, then additive fire/sparks/lightning)
    for (const p of this.parts) {
      const u = p.life / p.max;
      if (p.kind === 'ring') {
        ctx.globalAlpha = (1 - u) * 0.9; ctx.strokeStyle = p.col; ctx.lineWidth = 3.8 * (1 - u) + 0.5;
        ctx.beginPath(); ctx.arc(p.p.x, p.p.y, p.r * (0.25 + 0.75 * ease.out(u)), 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      if (p.kind === 'smoke') {
        ctx.globalAlpha = (1 - u) * 0.38;
        const r = p.r * (0.65 + 1.05 * u);
        const sg = ctx.createRadialGradient(p.p.x, p.p.y, r * 0.1, p.p.x, p.p.y, r);
        sg.addColorStop(0, 'rgba(38, 28, 28, 0.85)');
        sg.addColorStop(0.6, 'rgba(28, 22, 22, 0.45)');
        sg.addColorStop(1, 'rgba(20, 16, 16, 0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(p.p.x, p.p.y, r, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (p.kind === 'acidSmoke') {
        // Xenomorph corrosive greenish-white vapor plume
        ctx.globalAlpha = (1 - u) * 0.45;
        const r = p.r * (0.6 + 1.1 * u);
        const ag = ctx.createRadialGradient(p.p.x, p.p.y, r * 0.1, p.p.x, p.p.y, r);
        ag.addColorStop(0, 'rgba(215, 255, 140, 0.85)');
        ag.addColorStop(0.55, 'rgba(130, 230, 50, 0.42)');
        ag.addColorStop(1, 'rgba(40, 120, 10, 0)');
        ctx.fillStyle = ag;
        ctx.beginPath(); ctx.arc(p.p.x, p.p.y, r, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (p.kind === 'acid') {
        // Xenomorph pressurized viscous molecular acid globule + sticky filament tail
        const al = clamp(1 - u, 0, 1);
        ctx.globalAlpha = al;
        const vx = p.vel.x; const vy = p.vel.y;
        const va = Math.atan2(vy, vx);
        const stretch = clamp(Math.hypot(vx, vy) / 140, 1, 2.5);
        if (p.prev) {
          const tail = add(p.p, mul(v(vx, vy), -0.032));
          ctx.strokeStyle = '#7bff00'; ctx.lineWidth = p.r * 1.1;
          ctx.beginPath(); ctx.moveTo(p.p.x, p.p.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
          ctx.strokeStyle = '#eaff66'; ctx.lineWidth = p.r * 0.45;
          ctx.beginPath(); ctx.moveTo(p.p.x, p.p.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
        }
        ctx.save();
        ctx.translate(p.p.x, p.p.y); ctx.rotate(va);
        ctx.fillStyle = '#2db300';
        ctx.beginPath(); ctx.ellipse(0, 0, p.r * stretch * 1.15, p.r * 1.05, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a6ff00';
        ctx.beginPath(); ctx.ellipse(0, 0, p.r * stretch * 0.85, p.r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f5ff99';
        ctx.beginPath(); ctx.ellipse(p.r * 0.2, -p.r * 0.15, p.r * stretch * 0.42, p.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        continue;
      }
      if (p.kind === 'acidBubble') {
        const al = clamp(1 - u, 0, 1);
        const br = p.r * (0.4 + 0.8 * ease.out(u));
        ctx.globalAlpha = al * 0.85;
        ctx.fillStyle = 'rgba(180, 255, 20, 0.35)';
        ctx.strokeStyle = '#eaff66'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.p.x, p.p.y, br, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(p.p.x - br * 0.32, p.p.y - br * 0.32, br * 0.25, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (p.kind === 'fire' || p.kind === 'spark' || p.kind === 'ember') continue; // drawn in additive pass below
      if (p.kind === 'thorn') {
        ctx.save();
        ctx.globalAlpha = clamp(1 - u, 0, 1);
        ctx.translate(p.p.x, p.p.y); ctx.rotate(p.rot ?? 0);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -2.5); ctx.lineTo(-4, 2.5); ctx.closePath(); ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.globalAlpha = clamp(1 - u, 0, 1) ** 0.6;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      if (p.kind === 'helm') { ctx.arc(p.p.x, p.p.y, p.r, (p.rot ?? 0) - 1.75 - Math.PI / 2, (p.rot ?? 0) + 1.75 - Math.PI / 2); ctx.closePath(); }
      else ctx.arc(p.p.x, p.p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Additive simulation pass for Fluid-Simulation Flames (`drawSimFlame`), Magma Embers, Plasma Sparks, and Smooth Plasma Arcs
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const u = p.life / p.max;
      if (p.kind === 'fire') {
        const temp = 1 - u;
        // Align flame tongue with its instantaneous physical velocity vector (which starts at impact angle and curves upward with buoyancy!)
        const fAng = Math.atan2(p.vel.y - 45, p.vel.x);
        const fLen = p.r * (1.55 + 0.85 * Math.sin(u * Math.PI));
        const fWid = p.r * (0.68 - u * 0.32);
        if (this.fireSpr && u < 0.65) {
          const gr = p.r * 1.8;
          ctx.globalAlpha = (1 - u) * 0.24;
          ctx.drawImage(this.fireSpr as unknown as CanvasImageSource, p.p.x - gr, p.p.y - gr, gr * 2, gr * 2);
        }
        ctx.globalAlpha = clamp((1 - u) * 0.95, 0, 1);
        drawSimFlame(ctx, p.p, fAng, Math.max(3.5, fLen), Math.max(1.4, fWid), temp, this.rt, p.seed ?? 0);
      } else if (p.kind === 'ember' || p.kind === 'spark') {
        ctx.globalAlpha = clamp(1 - u, 0, 1);
        ctx.strokeStyle = p.col;
        ctx.lineWidth = p.r * 1.25;
        const tail = p.prev ? add(p.p, mul(v(p.p.x - p.prev.x, p.p.y - p.prev.y), -2.8)) : p.p;
        ctx.beginPath(); ctx.moveTo(p.p.x, p.p.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(p.p.x, p.p.y, p.r * 0.65, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const arc of this.arcs) {
      const u = arc.life / arc.max;
      ctx.globalAlpha = clamp(1 - u, 0, 1);
      drawBolt(ctx, arc.a, arc.b, arc.spread, arc.segs, '#ffffff', arc.col, arc.lw * (1 - u * 0.35), false, arc.seed + this.rt * 16);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    for (const f of this.foes) {
      if (f.k.alive || f.deadT < 0.55) this.drawBar(ctx, f);
      // the boss winding up his signature weapon: a warning over his head
      if (!this.demo && f.kind === 'axer' && f.k.alive && f.ai.state !== 'wait') {
        this.text(ctx, tx(`INCOMING ${bossWeaponLabel(f.bossKind)}!`, `AWAS ${bossWeaponLabel(f.bossKind)}!`), f.k.p[0].x, f.k.p[0].y - 68 * f.k.s, 17 + 3.5 * Math.sin(this.rt * 22), '#ff5a4f', 1);
      }
    }
    if (this.player.k.alive) this.drawBar(ctx, this.player);

    for (const t of this.texts) {
      const u = t.life / t.max;
      this.text(ctx, t.text, t.x, t.y - ease.out(u) * 38, t.size * (1 + 0.5 * Math.max(0, 1 - u * 6)), t.col, clamp((1 - u) * 2.5, 0, 1));
    }

    // Image-1 style Parabolic Dotted Trajectory Arc:
    // Clean, evenly spaced circular white dots starting right from the arrow tip, curving to the apex and fading smoothly!
    const pk = this.player.k;
    if (this.showGuide && this.drag.on && pk.alive && onString(pk) && pk.pull > 0.06) {
      const ang = this.demo ? fireAngle(pk) : steadyRelease(fireAngle(pk), pk.aim, this.training.stability);
      const pullUsed = this.maxPower ? 1 : pk.pull;
      const perk = this.demo || this.maxPower ? undefined : peekSkinShot(this.head, this.skinState, pullUsed, this.player.hp / this.player.maxHp);
      const baseSpeed = speedOf(pullUsed) * (perk?.speed ?? 1);
      const sp = this.maxPower ? (430 + 800) * MAX_SPEED_MULT : this.demo ? baseSpeed : trainedArrowSpeed(baseSpeed, this.training);
      const o = add(pk.p[4], fromAngle(ang, 18 * pk.s));
      const vel = fromAngle(ang, sp);
      const N = trainedGuideDots(this.demo ? trainingBonuses({}) : this.training);
      ctx.save();
      ctx.fillStyle = this.maxPower ? '#fff4b8' : '#ffffff';
      ctx.shadowColor = this.maxPower ? 'rgba(255, 200, 40, 0.85)' : 'rgba(255, 255, 255, 0.6)';
      ctx.shadowBlur = 4 * dpr;
      for (let i = 1; i <= N; i++) {
        const tt = i * 0.0175;
        const u = (i - 1) / (N - 1);
        const px = o.x + vel.x * tt;
        const py = o.y + vel.y * tt + 0.5 * AG * (this.demo ? 1 : this.mods.grav) * (perk?.gravity ?? 1) * tt * tt;
        const rad = Math.max(1.2, (3.2 - u * 1.45) * pk.s);
        ctx.globalAlpha = Math.pow(1 - u, 1.25) * 0.94;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // back to the lens: big fireflies and the grass in front of everything
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ambience(ctx, W, Hh, 'front', 0);
    if (this.xray) this.drawXray(ctx, W, Hh, shx, shy);

    // screen space (NO drag circle or '1.9x MAX!' ring UI from Image 2!)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawCoins(ctx);
    const pf = this.player;
    const lowHp = !this.demo && pf.k.alive && pf.hp < pf.maxHp * 0.3 ? 0.16 + 0.12 * Math.sin(this.rt * 7) : 0;
    const red = Math.max(this.hurt * 0.5, lowHp);
    if (red > 0.01) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,20,30,${red})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    if (this.run.slowT > 0) { ctx.fillStyle = `rgba(90,200,255,${0.1 + 0.04 * Math.sin(this.rt * 6)})`; ctx.fillRect(0, 0, w, h); }
    const title = this.demo ? '' : this.stage === 'clear' ? tx('LEVEL CLEARED!', 'LEVEL SELESAI!') : this.banner > 0 ? this.bannerText : '';
    if (title) {
      const clear = this.stage === 'clear';
      const ty = clear ? h * 0.22 : h * 0.36; // Placed higher on clear so our archer's freestyle victory pose takes center stage!
      const al = clear ? clamp(this.clearT * 3, 0, 1) : clamp(this.banner * 2, 0, 1) * clamp((2.4 - this.banner) * 5, 0, 1);
      const pop = clear ? 1 + 0.25 * Math.max(0, 1 - this.clearT * 4) : 1 + 0.3 * Math.max(0, 1 - (2.4 - this.banner) * 5);
      const size = clamp(w * (clear ? 0.064 : 0.075), 28, clear ? 56 : 66) * pop;
      // a dark band behind the words, like a title card
      ctx.globalAlpha = al * 0.36; ctx.fillStyle = '#00141f';
      ctx.fillRect(0, ty - size * 0.75, w, size * 2.05);
      ctx.globalAlpha = 1;
      this.text(ctx, title, w / 2, ty, size, clear ? '#ffd23f' : '#ffffff', al);
      this.text(ctx, clear ? tx(`+${levelReward(this.level)} COINS`, `+${levelReward(this.level)} KOIN`) : this.bannerSub, w / 2, ty + size * 0.85, clamp(size * 0.3, 13, 20), '#dffcff', al);
    }
  }
}

/** binds a RagWorld to a real canvas: sizing, the frame loop and pointer input */
export class RagdollGame {
  world: RagWorld;
  private ctx: Ctx;
  private raf = 0;
  private prev = 0;

  constructor(private canvas: HTMLCanvasElement, emit: (ui: RUi) => void) {
    this.ctx = canvas.getContext('2d') as Ctx;
    this.world = new RagWorld(emit, (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    });
    this.fit();
    ambStart();
    window.addEventListener('resize', this.fit);
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    this.raf = requestAnimationFrame(this.loop);
  }

  private fit = () => {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(200, r.width); const h = Math.max(200, r.height);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.world.resize(w, h, dpr);
  };
  private pos(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  private down = (e: PointerEvent) => {
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* fine without capture */ }
    this.world.pointerDown(...this.pos(e));
  };
  private move = (e: PointerEvent) => this.world.pointerMove(...this.pos(e));
  private up = () => this.world.pointerUp();
  private cancel = () => this.world.pointerCancel();
  private loop = (now: number) => {
    const dt = this.prev ? (now - this.prev) / 1000 : 0.016;
    this.prev = now;
    this.world.update(dt);
    this.world.render(this.ctx);
    this.raf = requestAnimationFrame(this.loop);
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    ambStop();
    window.removeEventListener('resize', this.fit);
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.cancel);
  }
}
