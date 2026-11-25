// Pure combat formulas and encounter rules shared by spawning, menus and tests.
import { CFG } from './config';

const E = CFG.enemy;

/** level musuh besar (bos senjata): 3 + floor((L−1)/2), minimal 3 — sama dengan kode lama */
export const bigFoeLevel = (L: number) => Math.max(E.ranks.elite, E.ranks.elite + Math.floor((L - CFG.encounters.firstLevel) / E.ranks.bossStep));

export const isBossLevel = (level: number) => Number.isInteger(level) && level >= CFG.bigBoss.every && level % CFG.bigBoss.every === 0;
export const nextBossLevel = (level: number) => (Math.floor(Math.max(0, Number.isFinite(level) ? level : 0) / CFG.bigBoss.every) + 1) * CFG.bigBoss.every;
export const firstDragonLevel = () => CFG.bigBoss.every * CFG.encounters.dragonEveryBoss;

/** A dragon replaces the weapon boss on every third boss milestone; no extra boss between them. */
export function encounterPlan(level: number) {
  const boss = isBossLevel(level);
  const dragon = boss && (level / CFG.bigBoss.every) % CFG.encounters.dragonEveryBoss === 0;
  return {
    boss, dragon, weapon: boss && !dragon,
    fort: level % CFG.encounters.fortEvery === CFG.encounters.fortOffset,
    hostage: level % CFG.encounters.hostageEvery === CFG.encounters.hostageOffset && !boss,
  };
}

export function weaponBossIndex(level: number, count: number): number {
  const previous = Math.max(0, Math.floor(level / CFG.bigBoss.every) - 1);
  return (previous - Math.floor(previous / CFG.encounters.dragonEveryBoss)) % count;
}

/** A campaign round never rolls an enemy above its level; round one therefore always means LV1. */
export function enemyLevelFor(level: number, kind: string, roll: number, demo = false): number {
  const r = E.ranks;
  const L = Math.max(CFG.encounters.firstLevel, Math.floor(Number.isFinite(level) ? level : CFG.encounters.firstLevel));
  const rank = kind === 'boss' || kind === 'axer' || kind === 'rider' ? bigFoeLevel(L)
    : kind === 'heavy' ? Math.max(r.elite, r.heavyBase + Math.floor(L / r.heavyStep))
    : kind === 'shield' ? (L >= r.shieldEliteAt ? r.elite : r.veteran)
    : kind === 'guard' ? (L >= r.guardEliteAt ? r.elite : r.veteran)
    : kind === 'helm' ? (roll < r.helmEliteChance ? r.elite : r.veteran)
    : roll < r.archerNormalChance ? r.normal : roll < r.archerVeteranChance ? r.veteran : r.elite;
  return demo ? rank : Math.min(L, rank);
}

/** pengali HP per level musuh (foeLvl 1 = 1.0, 2 = 1.48, 3+ = 2.1 + 0.42/level) */
export const lvlHpMult = (foeLvl: number) =>
  foeLvl <= 1 ? E.lvlHp[0] : foeLvl === 2 ? E.lvlHp[1] : E.lvlHp[2] + (foeLvl - 3) * E.lvlHpStep;

/** HP dasar musuh (tanpa rute/kartu/bos besar/skala L15+) */
export function enemyHp(L: number, foeLvl: number, big: boolean): number {
  const base = E.baseHp + E.hpPerLevel * Math.min(L, E.hpCapLevel);
  return Math.round(base * lvlHpMult(foeLvl) + (big ? E.bigHpBase + E.bigHpPerLevel * L : 0));
}

/** damage dasar musuh */
export function enemyDmg(L: number, foeLvl: number, big: boolean): number {
  const m = big ? E.dmgMult.big : foeLvl >= 3 ? E.dmgMult.lvl3 : foeLvl === 2 ? E.dmgMult.lvl2 : 1;
  return (E.dmgBase + E.dmgPerLevel * Math.min(L, E.dmgCapLevel)) * m;
}

/** skala tambahan Level 15+ (kode lama: HP berhenti naik di L14, damage di L15) */
export const lateHpMult = (L: number) => (L > E.hpCapLevel ? 1 + (L - E.hpCapLevel) * E.lateHpPerLevel : 1);
export const lateDmgMult = (L: number) => (L > E.dmgCapLevel ? 1 + (L - E.dmgCapLevel) * E.lateDmgPerLevel : 1);

/** damage satu panah pemain sebelum pengali kartu */
export function arrowDmg(pull: number, bow: string): number {
  const A = CFG.arrow;
  return A.baseDmg * (CFG.bowDmg[bow] ?? 1) * (A.pullBase + A.pullK * pull);
}

/** emas hadiah kill (sebelum pengali rute/kartu) */
export function killReward(kind: string, head: boolean, bigBoss = false): number {
  const R = CFG.rewards;
  return (bigBoss ? R.bigBoss : (R.kill[kind] ?? R.kill.archer)) + (head ? R.headshot : 0);
}

export const levelReward = (L: number) => CFG.rewards.levelBase + CFG.rewards.levelPerLevel * L;

/** jumlah musuh berjalan, kelelawar, dan maksimal yang hidup bersamaan di level L */
export function levelCounts(L: number) {
  return {
    foot: Math.min(E.footBase + L, E.footCap),
    bats: Math.min(E.batBase + Math.floor(L / 2), E.batCap),
    alive: Math.min(E.aliveBase + Math.floor(L / 2), E.aliveCap),
  };
}
