// Gameplay & balance constants for Ragdoll Archer.
import { tx } from '../../i18n';

export type CardId =
  | 'ledak' | 'petir' | 'paku' | 'tameng' | 'tembus' | 'pemburu'
  | 'lifesteal' | 'perisai' | 'nyawa2' | 'lambat'
  | 'pedang' | 'kontrak'
  | 'j_lesat' | 'j_tarik' | 'j_fokus' | 'j_incar' | 'j_zirah' | 'j_jantung'
  | 'ganda';
export type CardType = 'PANAH' | 'BERTAHAN' | 'JALUR' | 'RISIKO' | 'KHUSUS';
/** `path` + `glyph`: kartu JALUR mewakili cabang skill tree dan memakai simbolnya */
export interface CardDef { id: CardId; name: string; type: CardType; icon: string; maxLv: number; locked?: boolean; path?: SkillBranch; glyph?: SkillNodeDef['icon'] }

/** 12 regular deck cards + DOUBLE ARROW (KHUSUS: boss-only drop, never offered/sold) */
export const CARDS: CardDef[] = [
  { id: 'ledak', name: 'BLAST ARROW', type: 'PANAH', icon: '💥', maxLv: 3, locked: true },
  { id: 'petir', name: 'CHAIN LIGHTNING', type: 'PANAH', icon: '⚡', maxLv: 3 },
  { id: 'paku', name: 'NAIL ARROW', type: 'PANAH', icon: '📌', maxLv: 3, locked: true },
  { id: 'tameng', name: 'SHIELD BREAKER', type: 'PANAH', icon: '🛡️', maxLv: 3, locked: true },
  { id: 'tembus', name: 'PIERCING ARROW', type: 'PANAH', icon: '➶', maxLv: 3 },
  { id: 'pemburu', name: 'HEADHUNTER', type: 'PANAH', icon: '🎯', maxLv: 3, locked: true },
  { id: 'lifesteal', name: 'LIFESTEAL', type: 'BERTAHAN', icon: '🩸', maxLv: 3 },
  { id: 'perisai', name: 'BARRIER', type: 'BERTAHAN', icon: '🔰', maxLv: 3 },
  { id: 'nyawa2', name: 'SECOND LIFE', type: 'BERTAHAN', icon: '💖', maxLv: 2 },
  { id: 'lambat', name: 'SLOW TIME', type: 'BERTAHAN', icon: '⏳', maxLv: 2 },
  { id: 'pedang', name: 'DOUBLE-EDGED BLADE', type: 'RISIKO', icon: '🗡️', maxLv: 3 },
  { id: 'kontrak', name: 'GOLD CONTRACT', type: 'RISIKO', icon: '📜', maxLv: 3 },
  // PATH: run bonuses matching skill tree families (+RESONANCE when branch is strong)
  { id: 'j_lesat', name: 'SWIFT FLIGHT', type: 'JALUR', icon: '💨', maxLv: 3, path: 'speed', glyph: 'wind' },
  { id: 'j_tarik', name: 'TEMPEST DRAW', type: 'JALUR', icon: '🏹', maxLv: 3, path: 'speed', glyph: 'bow' },
  { id: 'j_fokus', name: 'EAGLE FOCUS', type: 'JALUR', icon: '👁️', maxLv: 3, path: 'accuracy', glyph: 'eye' },
  { id: 'j_incar', name: 'GOLDEN AIM', type: 'JALUR', icon: '💰', maxLv: 3, path: 'accuracy', glyph: 'crosshair' },
  { id: 'j_zirah', name: 'IRON ARMOR', type: 'JALUR', icon: '🛡️', maxLv: 3, path: 'vitality', glyph: 'armor' },
  { id: 'j_jantung', name: 'STEEL HEART', type: 'JALUR', icon: '❤️', maxLv: 3, path: 'vitality', glyph: 'heart' },
  { id: 'ganda', name: 'DOUBLE ARROW', type: 'KHUSUS', icon: '🏹', maxLv: 2 },
];

const CARD_ID_NAMES: Record<CardId, string> = {
  ledak: 'PANAH LEDAK', petir: 'RANTAI PETIR', paku: 'PANAH PAKU', tameng: 'PECAH TAMENG',
  tembus: 'PANAH TEMBUS', pemburu: 'PEMBURU KEPALA', lifesteal: 'LIFESTEAL', perisai: 'PERISAI',
  nyawa2: 'NYAWA KEDUA', lambat: 'WAKTU MELAMBAT', pedang: 'PEDANG BERMATA DUA', kontrak: 'KONTRAK EMAS',
  j_lesat: 'LESAT KILAT', j_tarik: 'TARIKAN BADAI', j_fokus: 'FOKUS BIDIK', j_incar: 'INCARAN EMAS',
  j_zirah: 'ZIRAH BESI', j_jantung: 'JANTUNG BAJA', ganda: 'PANAH GANDA',
};

export function cardName(card: CardDef | CardId): string {
  const id = typeof card === 'string' ? card : card.id;
  const def = typeof card === 'string' ? CARDS.find((c) => c.id === id) : card;
  return tx(def?.name ?? id.toUpperCase(), CARD_ID_NAMES[id] ?? def?.name ?? id);
}

export function cardTypeLabel(type: CardType): string {
  switch (type) {
    case 'PANAH': return tx('ARROW', 'PANAH');
    case 'BERTAHAN': return tx('DEFENSE', 'BERTAHAN');
    case 'JALUR': return tx('PATH', 'JALUR');
    case 'RISIKO': return tx('RISK', 'RISIKO');
    case 'KHUSUS': return tx('SPECIAL', 'KHUSUS');
  }
}
/**
 * SORTIR KARTU — set 3 kartu yang adil & seru (lihat rollOffer di cards.ts):
 * 3 jenis berbeda dengan urutan tetap; jenis yang terlewat makin sering (dipaksa muncul setelah `pityForce` set);
 * kartu yang memperkuat build lebih sering, kartu yang barusan muncul lebih jarang; reroll tidak mengulang kartu.
 */
export const OFFER = {
  order: ['PANAH', 'BERTAHAN', 'JALUR', 'RISIKO'] as CardType[],
  typeWeight: { PANAH: 1, BERTAHAN: 1, JALUR: 1, RISIKO: 0.8, KHUSUS: 0 } as Record<CardType, number>,
  pityStep: 0.75, pityForce: 2,
  upgrade: 1.4, synergy: 1.9, resonance: 1.3, recent: 0.35,
  lowHpRatio: 0.35, lowHp: 0.4, hpCost: ['pedang'] as CardId[],
};
/** RESONANSI: cabang skill tree ≥50% terlatih → kartu JALUR-nya ×1.25, tuntas → ×1.5 */
export const RESONANCE = { half: 1.25, full: 1.5 };

/** automatic synergies (max 3) */
export const SYNERGIES: { id: string; name: string; need: [CardId, CardId]; desc: string }[] = [
  { id: 'petir_tembus', name: 'PIERCING STORM', need: ['petir', 'tembus'], desc: 'LIGHTNING STRIKES EVERY PIERCED ENEMY' },
  { id: 'ledak_petir', name: 'BLAST TEMPEST', need: ['ledak', 'petir'], desc: 'WIDER EXPLOSION THAT SHOCKS FOES' },
  { id: 'pemburu_lifesteal', name: 'HEAD VAMPIRE', need: ['pemburu', 'lifesteal'], desc: 'EVERY HEADSHOT RESTORES HP' },
];

const SYNERGY_ID_TEXT: Record<string, { name: string; desc: string }> = {
  petir_tembus: { name: 'PETIR MENEMBUS', desc: 'SAMBARAN IKUT DI TIAP MUSUH YANG DITEMBUS' },
  ledak_petir: { name: 'BADAI LEDAK', desc: 'LEDAKAN LEBIH LUAS & MENYETRUM' },
  pemburu_lifesteal: { name: 'VAMPIR KEPALA', desc: 'TIAP HEADSHOT MEMULIHKAN HP' },
};

export function synergyName(s: { id: string; name: string } | string): string {
  const id = typeof s === 'string' ? s : s.id;
  const def = typeof s === 'string' ? SYNERGIES.find((x) => x.id === id) : s;
  return tx(def?.name ?? id, SYNERGY_ID_TEXT[id]?.name ?? def?.name ?? id);
}

export function synergyDesc(s: { id: string; desc: string } | string): string {
  const id = typeof s === 'string' ? s : s.id;
  const def = typeof s === 'string' ? SYNERGIES.find((x) => x.id === id) : s;
  return tx(def?.desc ?? '', SYNERGY_ID_TEXT[id]?.desc ?? def?.desc ?? '');
}

export const CFG = {
  player: { baseHp: 100, lvlEvery: 2 },
  /** panah pemain: dmg = baseDmg × busur × (pullBase + pullK × tarikan) */
  arrow: { baseDmg: 42, pullBase: 0.45, pullK: 0.65, gravity: 980 },
  bowDmg: { legend: 1.5, gold: 1.3, thunder: 1.25, fire: 1.25, spike: 1.18, poison: 1.18, wood: 1 } as Record<string, number>,
  /** pengali bagian tubuh: musuh yang kena panah pemain / pemain yang kena panah musuh */
  hitMult: { head: 2.6, bigHead: 1.8, heart: 1.4, torso: 1, limb: 0.55, helm: 0.3 },
  hitMultPlayer: { head: 1.5, torso: 1, limb: 0.6 },
  enemy: {
    baseHp: 38, hpPerLevel: 5, hpCapLevel: 14,
    dmgBase: 8, dmgPerLevel: 0.6, dmgCapLevel: 15,
    lvlHp: [1, 1.48, 2.1], lvlHpStep: 0.42, bigHpBase: 85, bigHpPerLevel: 18,
    dmgMult: { big: 1.45, lvl3: 1.3, lvl2: 1.15 },
    /** skala tambahan Level 15+: HP ×(1 + k×(L−hpCapLevel)), dmg ×(1 + k×(L−dmgCapLevel)) */
    lateHpPerLevel: 0.08, lateDmgPerLevel: 0.05,
    footBase: 2, footCap: 14, aliveBase: 2, aliveCap: 5, batBase: 1, batCap: 4,
    shieldHp: 3,
    ranks: {
      normal: 1, veteran: 2, elite: 3, bossStep: 2, heavyBase: 2, heavyStep: 2,
      shieldEliteAt: 5, guardEliteAt: 6, helmEliteChance: 0.48,
      archerNormalChance: 0.52, archerVeteranChance: 0.82,
    },
    guardHpMult: [1, 1.2, 1.7], guardDmgMult: [1, 1.1, 1.25],
  },
  rewards: {
    kill: { axer: 60, rider: 60, boss: 60, heavy: 12, shield: 10, guard: 8, helm: 7, archer: 5 } as Record<string, number>,
    headshot: 5, levelBase: 10, levelPerLevel: 2, parry: 10, hostage: 15, hostageHeal: 20, hostagePenalty: 10,
    fortCollapse: 20, roof: 8, shieldBreak: 3, balloonCoin: 10, balloonHeart: 30, comboCap: 5,
    fireball: 5, dragonMouth: 8, dragonKill: 40, bigBoss: 150, bat: 5, bigBat: 9,
  },
  clearHealPct: 0.4,
  run: { startGold: 0 },
  reroll: { freePerRun: 1, costs: [30, 45, 60] },
  route: { risk: { hp: 1.25, dmg: 1.25, gold: 1.5 }, chestCostBase: 40, chestCostPerLevel: 6 },
  bigBoss: { every: 5, scale: 1.75, hpMult: 3.2, dmgMult: 1.2, bonusPicks: 1, introSlowT: 0.9, introSlowK: 0.3 },
  encounters: { firstLevel: 1, fortEvery: 3, fortOffset: 2, dragonEveryBoss: 3, hostageEvery: 4, hostageOffset: 3 },
  death: { slowT: 2.0, slowK: 0.2, screenDelay: 2.3, metaCarry: 0.5 },
  juice: { killSlowT: 0.3, killSlowK: 0.3, lastSlowT: 1.2, lastSlowK: 0.16, dmgSize: 18, headSize: 25, headCol: '#ffe14d', trailLen: 9 },
  cards: {
    ledak: { radius: [70, 85, 100], pct: [0.35, 0.5, 0.65], push: [260, 320, 380] },
    petir: { jumps: [1, 2, 3], range: 260, pct: [0.3, 0.35, 0.4], shock: 1.2 },
    paku: { stun: [1.5, 2, 2.5], immune: 1.0 },
    tameng: { pct: [0.6, 0.8, 1], speed: 1100, extraShieldDmg: [0, 0, 1] },
    tembus: { pierce: [1, 2, 3], falloff: 0.15 },
    pemburu: { step: [0.1, 0.1, 0.1], max: [1.5, 1.75, 2] },
    lifesteal: { hp: [2, 3, 4] },
    perisai: { cd: [14, 11, 8] },
    nyawa2: { pct: [0.35, 0.5] },
    lambat: { dur: 3, cd: [40, 32], timeScale: 0.35 },
    pedang: { dmg: [0.4, 0.55, 0.7], hp: [0.25, 0.3, 0.35] },
    kontrak: { gold: [2, 2.5, 3], hp: [0.25, 0.35, 0.45] },
    ganda: { arrows: 2, pct: 0.6, shots: [12, 18], spread: 0.075 },
    j_lesat: { speed: [0.06, 0.1, 0.14] },
    j_tarik: { draw: [0.1, 0.16, 0.22], reload: [0.1, 0.16, 0.22] },
    j_fokus: { stability: [0.12, 0.2, 0.28], dots: [6, 10, 14] },
    j_incar: { gold: [3, 5, 7] },
    j_zirah: { reduce: [0.06, 0.1, 0.14] },
    j_jantung: { hp: [0.1, 0.16, 0.22] },
  },
  synergy: { blastRadius: 1.2, blastShock: 1.2, vampHeal: 3 },
  meta: { hpPerLv: 0.03, hpMaxLv: 5, hpCosts: [80, 120, 160, 200, 250], rerollCost: 150, rerollMaxLv: 1 },
  daily: { giantScale: 1.35, giantHp: 1.4, lowGrav: 0.55, scorePerLevel: 1000, scorePerKill: 10, scorePerHead: 25, boardSize: 10 },
  telemetry: { maxRuns: 300 },
  debug: { showMaxPower: false },
};

export type SkillBranch = 'speed' | 'accuracy' | 'vitality' | 'legend';
export type SkillId =
  | 'speed' | 'draw' | 'reload' | 'reflex' | 'tailwind' | 'full_speed'
  | 'accuracy' | 'trajectory' | 'spread' | 'headhunter' | 'steady' | 'full_accuracy'
  | 'vitality' | 'reroll' | 'recovery' | 'supply' | 'armor' | 'full_vitality'
  | 'legend';
export interface TrainingBonuses {
  arrowSpeed: number; reloadSpeed: number; drawSpeed: number; stability: number;
  spreadReduction: number; guideDots: number; hpBonus: number; clearHeal: number; freeRerolls: number;
  /** damage diterima −x (0.04 = −4%), emas awal run +x, emas tiap headshot +x */
  dmgReduce: number; startGold: number; headGold: number;
}
export interface SkillNodeDef {
  id: SkillId; branch: SkillBranch; name: string; short: string; description: string;
  icon: 'wind' | 'quiver' | 'bow' | 'wing' | 'target' | 'trajectory' | 'arrows' | 'eye' | 'heart' | 'leaf' | 'reroll' | 'shield'
    | 'feather' | 'bolt' | 'crosshair' | 'anchor' | 'bag' | 'armor' | 'arrowhead';
  /** `costs` = harga yang benar-benar dibayar; `listCosts` = harga lama (sebelum diskon) untuk tampilan coret */
  maxLv: number; costs: number[]; listCosts: number[]; requires: { id: SkillId; level: number }[];
  effects: Partial<TrainingBonuses>; x: number; y: number; mastery?: boolean; apex?: boolean;
}
/** Semua latihan 30% lebih murah, dibulatkan ke kelipatan 5 supaya angkanya rapi. */
export const SKILL_PRICE = { discount: 0.3, step: 5 };
const price = (list: number[]) => ({
  listCosts: list,
  costs: list.map((c) => Math.max(SKILL_PRICE.step, Math.round((c * (1 - SKILL_PRICE.discount)) / SKILL_PRICE.step) * SKILL_PRICE.step)),
});
export const SKILL_BRANCHES: { id: SkillBranch; name: string; motto: string; color: string; x: number; hidden?: boolean }[] = [
  { id: 'speed', name: 'SPEED', motto: 'FASTER. SHARPER.', color: '#69d5ff', x: 160 },
  { id: 'accuracy', name: 'ACCURACY', motto: 'EVERY ARROW COUNTS.', color: '#ffd34e', x: 450 },
  { id: 'vitality', name: 'VITALITY', motto: 'ENDURE. RISE AGAIN.', color: '#85e271', x: 740 },
  { id: 'legend', name: 'LEGEND', motto: 'THE SHARPEST POINT.', color: '#ffd34e', x: 935, hidden: true },
];

const SKILL_BRANCH_ID: Record<SkillBranch, { name: string; motto: string }> = {
  speed: { name: 'KECEPATAN', motto: 'LEBIH CEPAT. LEBIH SIGAP.' },
  accuracy: { name: 'AKURASI', motto: 'SETIAP PANAH BERARTI.' },
  vitality: { name: 'KETAHANAN', motto: 'BERTAHAN. BANGKIT LAGI.' },
  legend: { name: 'LEGENDA', motto: 'TITIK PALING TAJAM.' },
};

export const branchName = (b: { id: SkillBranch; name: string }) => tx(b.name, SKILL_BRANCH_ID[b.id].name);

export const SKILL_NODES: SkillNodeDef[] = [
  // SPEED — upper edge of arrowhead
  { id: 'speed', branch: 'speed', name: 'SWIFT ARROW', short: 'SWIFT', icon: 'wind', description: 'Arrows fly faster. The aim guide updates to match your new arrow speed.', maxLv: 5, ...price([50, 80, 120, 170, 230]), requires: [], effects: { arrowSpeed: 0.03 }, x: 175, y: 100 },
  { id: 'draw', branch: 'speed', name: 'QUICK DRAW', short: 'DRAW', icon: 'bow', description: 'Reach your desired bow draw power much faster.', maxLv: 3, ...price([65, 110, 170]), requires: [{ id: 'speed', level: 2 }], effects: { drawSpeed: 0.04 }, x: 285, y: 205 },
  { id: 'reload', branch: 'speed', name: 'NIMBLE HANDS', short: 'RELOAD', icon: 'quiver', description: 'Nock your next arrow faster after releasing a shot.', maxLv: 3, ...price([65, 110, 170]), requires: [{ id: 'speed', level: 2 }], effects: { reloadSpeed: 0.04 }, x: 395, y: 135 },
  { id: 'reflex', branch: 'speed', name: 'HUNTER REFLEX', short: 'REFLEX', icon: 'feather', description: 'Trained fingers draw the bow to full tension even quicker.', maxLv: 3, ...price([80, 130, 190]), requires: [{ id: 'draw', level: 2 }], effects: { drawSpeed: 0.03 }, x: 505, y: 215 },
  { id: 'tailwind', branch: 'speed', name: 'TAILWIND', short: 'WIND', icon: 'bolt', description: 'Arrows ride the breeze for extra flight velocity and updated aim arcs.', maxLv: 3, ...price([80, 130, 190]), requires: [{ id: 'reload', level: 2 }], effects: { arrowSpeed: 0.02 }, x: 615, y: 175 },
  { id: 'full_speed', branch: 'speed', name: 'FULL SPEED', short: 'FULL SPEED', icon: 'wing', description: 'Peak of the speed path. Boosts arrow velocity and reload speed once all prerequisites are mastered.', maxLv: 1, ...price([300]), requires: [{ id: 'speed', level: 5 }, { id: 'draw', level: 3 }, { id: 'reload', level: 3 }, { id: 'reflex', level: 3 }, { id: 'tailwind', level: 3 }], effects: { arrowSpeed: 0.05, reloadSpeed: 0.08 }, x: 720, y: 218, mastery: true },
  // ACCURACY — center spine of arrowhead
  { id: 'accuracy', branch: 'accuracy', name: 'STEADY AIM', short: 'AIM', icon: 'target', description: 'Reduces hand sway deviation on release. Pure control — no auto-aim.', maxLv: 5, ...price([50, 80, 120, 170, 230]), requires: [], effects: { stability: 0.08 }, x: 285, y: 320 },
  { id: 'trajectory', branch: 'accuracy', name: 'EAGLE EYE', short: 'TRAJECTORY', icon: 'trajectory', description: 'Extends the prediction dotted arc to help read long-range shots.', maxLv: 3, ...price([60, 100, 160]), requires: [{ id: 'accuracy', level: 2 }], effects: { guideDots: 6 }, x: 395, y: 262 },
  { id: 'spread', branch: 'accuracy', name: 'TIGHT VOLLEY', short: 'VOLLEY', icon: 'arrows', description: 'Narrows the spread angle between Double Arrows without reducing damage.', maxLv: 3, ...price([60, 100, 160]), requires: [{ id: 'accuracy', level: 2 }], effects: { spreadReduction: 0.08 }, x: 395, y: 378 },
  { id: 'headhunter', branch: 'accuracy', name: 'HEAD BOUNTY', short: 'BOUNTY', icon: 'crosshair', description: 'Every headshot grants bonus gold. Aim for the head, harvest gold.', maxLv: 3, ...price([90, 140, 200]), requires: [{ id: 'trajectory', level: 2 }], effects: { headGold: 2 }, x: 615, y: 285 },
  { id: 'steady', branch: 'accuracy', name: 'FIRM GRIP', short: 'FIRM', icon: 'anchor', description: 'Steadier release: further cuts hand jitter when loosing arrows.', maxLv: 3, ...price([90, 140, 200]), requires: [{ id: 'spread', level: 2 }], effects: { stability: 0.04 }, x: 615, y: 355 },
  { id: 'full_accuracy', branch: 'accuracy', name: 'FULL ACCURACY', short: 'FULL ACCURACY', icon: 'eye', description: 'Peak of the accuracy path. Ultra-stable release while keeping aim and timing in your hands.', maxLv: 1, ...price([300]), requires: [{ id: 'accuracy', level: 5 }, { id: 'trajectory', level: 3 }, { id: 'spread', level: 3 }, { id: 'headhunter', level: 3 }, { id: 'steady', level: 3 }], effects: { stability: 0.1 }, x: 810, y: 320, mastery: true },
  // VITALITY — lower edge of arrowhead
  { id: 'vitality', branch: 'vitality', name: 'STARTING HP', short: 'VITALITY', icon: 'heart', description: 'Start every run with higher max health. Previous HP upgrades carry over.', maxLv: CFG.meta.hpMaxLv, ...price(CFG.meta.hpCosts), requires: [], effects: { hpBonus: CFG.meta.hpPerLv }, x: 175, y: 540 },
  { id: 'reroll', branch: 'vitality', name: 'SECOND CHANCE', short: 'REROLL', icon: 'reroll', description: 'Gain one extra free card reroll per run. Available from the start.', maxLv: CFG.meta.rerollMaxLv, ...price([CFG.meta.rerollCost]), requires: [], effects: { freeRerolls: 1 }, x: 285, y: 435 },
  { id: 'recovery', branch: 'vitality', name: 'SECOND WIND', short: 'RECOVER', icon: 'leaf', description: 'Restore bonus HP after clearing each level on top of normal healing.', maxLv: 3, ...price([65, 110, 170]), requires: [{ id: 'vitality', level: 2 }], effects: { clearHeal: 3 }, x: 395, y: 505 },
  { id: 'supply', branch: 'vitality', name: 'WAR RATIONS', short: 'SUPPLY', icon: 'bag', description: 'Start every run with bonus gold for early chests or rerolls.', maxLv: 3, ...price([80, 130, 190]), requires: [{ id: 'reroll', level: 1 }], effects: { startGold: 15 }, x: 505, y: 425 },
  { id: 'armor', branch: 'vitality', name: 'IRON SKIN', short: 'IRON SKIN', icon: 'armor', description: 'Reduce all incoming damage from arrows, axes, bat bites, and fireballs.', maxLv: 3, ...price([100, 150, 210]), requires: [{ id: 'recovery', level: 2 }], effects: { dmgReduce: 0.04 }, x: 615, y: 465 },
  { id: 'full_vitality', branch: 'vitality', name: 'STEEL SOUL', short: 'STEEL SOUL', icon: 'shield', description: 'Peak of the vitality path. Extra max health once all vitality nodes are complete.', maxLv: 1, ...price([300]), requires: [{ id: 'vitality', level: 5 }, { id: 'reroll', level: 1 }, { id: 'recovery', level: 3 }, { id: 'supply', level: 3 }, { id: 'armor', level: 3 }], effects: { hpBonus: 0.05 }, x: 720, y: 422, mastery: true },
  // ARROWHEAD TIP
  { id: 'legend', branch: 'legend', name: 'LEGEND ARROWHEAD', short: 'LEGEND', icon: 'arrowhead', description: 'Apex of all paths. Faster arrows, steadier release, and tougher health.', maxLv: 1, ...price([400]), requires: [{ id: 'full_speed', level: 1 }, { id: 'full_accuracy', level: 1 }, { id: 'full_vitality', level: 1 }], effects: { arrowSpeed: 0.05, stability: 0.05, hpBonus: 0.05 }, x: 935, y: 320, apex: true },
];

const SKILL_ID_TEXT: Record<SkillId, { name: string; short: string; description: string }> = {
  speed: { name: 'LESAT PANAH', short: 'LESAT', description: 'Panah melesat lebih cepat. Lintasan bantuan mengikuti kecepatan barumu.' },
  draw: { name: 'TARIKAN KILAT', short: 'TARIKAN', description: 'Capai tenaga tarikan yang kamu inginkan dengan lebih cepat.' },
  reload: { name: 'TANGAN SIGAP', short: 'ISI CEPAT', description: 'Siapkan anak panah berikutnya lebih cepat setelah melepas tembakan.' },
  reflex: { name: 'REFLEKS PEMBURU', short: 'REFLEKS', description: 'Jari makin terlatih: tarikan busur mencapai tenaga yang kamu mau lebih cepat lagi.' },
  tailwind: { name: 'ANGIN BURITAN', short: 'ANGIN', description: 'Panah menunggang angin. Lesatannya makin kencang dan lintasan ikut menyesuaikan.' },
  full_speed: { name: 'FULL SPEED', short: 'FULL SPEED', description: 'Puncak jalur kecepatan. Tambahkan laju panah dan isi panah setelah seluruh latihan selesai.' },
  accuracy: { name: 'BIDIKAN MANTAP', short: 'BIDIKAN', description: 'Kurangi penyimpangan arah akibat gerakan tangan saat melepas panah. Bukan auto-aim.' },
  trajectory: { name: 'MATA ELANG', short: 'LINTASAN', description: 'Perpanjang garis prediksi lintasan untuk membantu membaca tembakan jauh.' },
  spread: { name: 'FORMASI RAPAT', short: 'FORMASI', description: 'Rapatkan jarak sudut antar-panah pada Panah Ganda. Jumlah panah dan damage tetap.' },
  headhunter: { name: 'INCAR KEPALA', short: 'INCAR', description: 'Setiap headshot menghasilkan emas tambahan. Bidik kepala, panen emas.' },
  steady: { name: 'BIDIKAN KOKOH', short: 'KOKOH', description: 'Pelepasan makin kokoh: deviasi tangan saat melepas panah berkurang lagi.' },
  full_accuracy: { name: 'FULL ACCURACY', short: 'FULL ACCURACY', description: 'Puncak jalur akurasi. Pelepasan makin stabil, tetapi arah dan timing tetap di tanganmu.' },
  vitality: { name: 'NYAWA AWAL', short: 'VITALITAS', description: 'Mulai setiap run dengan nyawa maksimal lebih besar. Upgrade lamamu tetap dihitung.' },
  reroll: { name: 'KESEMPATAN BARU', short: 'REROLL', description: 'Satu kesempatan reroll gratis tambahan di setiap run. Bisa dipelajari sejak awal.' },
  recovery: { name: 'NAPAS KEDUA', short: 'PULIH', description: 'Pulihkan HP tambahan setelah menyelesaikan level, di atas pemulihan normal.' },
  supply: { name: 'BEKAL PERANG', short: 'BEKAL', description: 'Mulai setiap run dengan bekal emas. Cukup untuk peti atau reroll lebih awal.' },
  armor: { name: 'KULIT BAJA', short: 'KULIT BAJA', description: 'Kurangi semua damage yang kamu terima: panah, kapak, gigitan kelelawar, dan bola api.' },
  full_vitality: { name: 'JIWA BAJA', short: 'JIWA BAJA', description: 'Puncak jalur ketahanan. Nyawa maksimal bertambah setelah seluruh latihan dituntaskan.' },
  legend: { name: 'MATA PANAH LEGENDA', short: 'LEGENDA', description: 'Ujung tertajam semua jalur. Panah lebih cepat, pelepasan lebih stabil, dan nyawa lebih tebal.' },
};

export const skillName = (n: SkillNodeDef) => tx(n.name, SKILL_ID_TEXT[n.id].name);
export const skillShort = (n: SkillNodeDef) => tx(n.short, SKILL_ID_TEXT[n.id].short);
export const skillDesc = (n: SkillNodeDef) => tx(n.description, SKILL_ID_TEXT[n.id].description);
export const SKILL_RULES = {
  percent: 100, precision: 10000, baseGuideDots: 24,
  tree: { width: 900, height: 680, rootX: 450, rootY: 594, headingY: 34, iconRing: 43, lineBend: 65 },
  purchaseMotionMs: 650,
};

export const SKILL_TREE_ART = {
  themeIndex: 0, sceneSeed: 1, maxDpr: 2,
  upperVeil: 'rgba(3, 32, 47, 0.44)', lowerVeil: 'rgba(3, 39, 48, 0.59)',
  links: { outline: '#03212e', idle: '#4d8393', outlineWidth: 8, fillWidth: 4, liveWidth: 2, idleOpacity: 0.55 },
  branches: {
    speed: { top: '#68bee5', bottom: '#196e96' },
    accuracy: { top: '#f3d16c', bottom: '#a96f28' },
    vitality: { top: '#91d77c', bottom: '#34865b' },
    legend: { top: '#ffe07a', bottom: '#d58b22' },
  },
};

export type StatKey =
  | 'runs' | 'deaths' | 'kills' | 'headshots' | 'bestStreak' | 'hostages' | 'forts' | 'dragonMouth'
  | 'bestLevel' | 'bigBossKills' | 'shieldsBroken' | 'coinsEarned' | 'playSec';

/** unlock: bow (achievement only), card (achievement OR meta coins), cosmetic (achievement) */
export interface UnlockDef { id: string; name: string; label: string; stat: StatKey; need: number; cost?: number }
export const UNLOCKS: UnlockDef[] = [
  { id: 'bow:fire', name: 'INFERNO BLAZE BOW', label: 'DESTROY 2 FORTS', stat: 'forts', need: 2 },
  { id: 'card:paku', name: 'NAIL ARROW CARD', label: 'KILL 30 FOES', stat: 'kills', need: 30, cost: 150 },
  { id: 'cos:band_kuning', name: 'YELLOW HEADBAND', label: 'PLAY 2 RUNS', stat: 'runs', need: 2 },
  { id: 'bow:spike', name: 'SPIKE FUZE BOW', label: 'FREE 3 HOSTAGES', stat: 'hostages', need: 3 },
  { id: 'card:tameng', name: 'SHIELD BREAKER CARD', label: 'BREAK 6 SHIELDS', stat: 'shieldsBroken', need: 6, cost: 200 },
  { id: 'cos:trail_api', name: 'FIRE TRAIL', label: '25 HEADSHOTS', stat: 'headshots', need: 25 },
  { id: 'bow:poison', name: 'POISONOUS WHISPER BOW', label: 'HIT DRAGON MOUTH 5×', stat: 'dragonMouth', need: 5 },
  { id: 'card:ledak', name: 'BLAST ARROW CARD', label: '5 HEADSHOT STREAK', stat: 'bestStreak', need: 5, cost: 250 },
  { id: 'cos:hat_sephiroth', name: 'SEPHIROTH SKIN', label: 'CLEAR LEVEL 5', stat: 'bestLevel', need: 5 },
  { id: 'bow:gold', name: 'GOLDEN MIDAS', label: 'COLLECT 1500 COINS', stat: 'coinsEarned', need: 1500 },
  { id: 'card:pemburu', name: 'HEADHUNTER CARD', label: '60 HEADSHOTS', stat: 'headshots', need: 60, cost: 300 },
  { id: 'cos:band_biru', name: 'BLUE HEADBAND', label: 'DEFEAT BIG BOSS', stat: 'bigBossKills', need: 1 },
  { id: 'bow:thunder', name: 'THUNDER VOLT BOW', label: '10 HEADSHOT STREAK', stat: 'bestStreak', need: 10 },
  { id: 'cos:trail_pelangi', name: 'RAINBOW TRAIL', label: 'PLAY 10 RUNS', stat: 'runs', need: 10 },
  { id: 'bow:legend', name: 'LEGEND ASTRA BOW', label: 'CLEAR LEVEL 10', stat: 'bestLevel', need: 10 },
  { id: 'cos:hat_guts', name: 'GUTS SKIN', label: 'KILL 300 FOES', stat: 'kills', need: 300 },
];

const UNLOCK_ID_TEXT: Record<string, { name: string; label: string }> = {
  'bow:fire': { name: 'BUSUR INFERNO BLAZE', label: 'ROBOHKAN 2 ISTANA' },
  'card:paku': { name: 'KARTU PANAH PAKU', label: 'BUNUH 30 MUSUH' },
  'cos:band_kuning': { name: 'IKAT KUNING', label: 'MAIN 2 RUN' },
  'bow:spike': { name: 'BUSUR SPIKE FUZE', label: 'PUTUSKAN 3 TALI TAWANAN' },
  'card:tameng': { name: 'KARTU PECAH TAMENG', label: 'HANCURKAN 6 PERISAI' },
  'cos:trail_api': { name: 'JEJAK API', label: '25 HEADSHOT' },
  'bow:poison': { name: 'BUSUR POISONOUS WHISPER', label: 'TEMBAK MULUT NAGA 5X' },
  'card:ledak': { name: 'KARTU PANAH LEDAK', label: '5 HEADSHOT BERUNTUN' },
  'cos:hat_sephiroth': { name: 'TOPI SEPHIROTH', label: 'SELESAIKAN LEVEL 5' },
  'bow:gold': { name: 'GOLDEN MIDAS', label: 'KUMPULKAN 1500 KOIN' },
  'card:pemburu': { name: 'KARTU PEMBURU KEPALA', label: '60 HEADSHOT' },
  'cos:band_biru': { name: 'IKAT BIRU', label: 'KALAHKAN BOS BESAR' },
  'bow:thunder': { name: 'BUSUR THUNDER VOLT', label: '10 HEADSHOT BERUNTUN' },
  'cos:trail_pelangi': { name: 'JEJAK PELANGI', label: 'MAIN 10 RUN' },
  'bow:legend': { name: 'BUSUR LEGEND ASTRA', label: 'SELESAIKAN LEVEL 10' },
  'cos:hat_guts': { name: 'TOPI GUTS', label: 'BUNUH 300 MUSUH' },
};

export const unlockName = (u: UnlockDef) => tx(u.name, UNLOCK_ID_TEXT[u.id]?.name ?? u.name);
export const unlockLabel = (u: UnlockDef) => tx(u.label, UNLOCK_ID_TEXT[u.id]?.label ?? u.label);

/** kosmetik: warna ikat kepala & jejak panah ('' = gratis) */
export const COSMETICS = {
  band: { merah: { col: '#e5352f', unlock: '' }, kuning: { col: '#ffd23f', unlock: 'cos:band_kuning' }, biru: { col: '#2a9dff', unlock: 'cos:band_biru' } } as Record<string, { col: string; unlock: string }>,
  trail: { putih: { cols: ['#ffffff'], unlock: '' }, api: { cols: ['#ffd04a', '#ff5a1f'], unlock: 'cos:trail_api' }, pelangi: { cols: ['#ff5a5f', '#ffd23f', '#5cf08a', '#5cc8ff', '#b98cff'], unlock: 'cos:trail_pelangi' } } as Record<string, { cols: string[]; unlock: string }>,
  lockedHats: { sephiroth: 'cos:hat_sephiroth', guts: 'cos:hat_guts' } as Record<string, string>,
};

export type SkinId = 'band' | 'sephiroth' | 'guts' | 'luffy' | 'sanji' | 'sekiro' | 'racer' | 'robin' | 'cowboy' | 'punk' | RefinedHairId;
export interface SkinPassives {
  speed?: number; reload?: number; damage?: number; reduction?: number; headGuard?: number;
  knockback?: number; gold?: number; headHeal?: number; headDamage?: number; limbDamage?: number; gravity?: number;
}
export type SkinSignature =
  | { kind: 'passive' }
  | { kind: 'rage'; below: number; damage: number }
  | { kind: 'charge'; pull: number; damage: number; speed: number; pierce: number }
  | { kind: 'cadence'; every: number; damage: number; pierce: number; burnDps: number; burnSeconds: number; chain: number; chainDamage: number; range: number; stun: number }
  | { kind: 'parry'; heal: number; gold: number }
  | { kind: 'opening'; damage: number }
  | { kind: 'barrier'; cooldown: number }
  | { kind: 'headShock'; stun: number }
  | { kind: 'shadow'; damage: number; pierce: number }
  | { kind: 'flame'; burnDps: number; burnSeconds: number; blast: number; radius: number };
export interface SkinPerkDef {
  name: string; role: string; color: string; mark: string;
  trail: 'wind' | 'flame' | 'lightning' | 'shadow' | 'slash' | 'light';
  passive: SkinPassives; signature: SkinSignature;
}

// Initial playtest values. Equipment perks are not permanent meta upgrades.
export const SKIN_PERKS: Record<SkinId, SkinPerkDef> = {
  band: { name: 'WIND FLOW', role: 'SWIFT & LIGHT', color: '#a9edf7', mark: 'WF', trail: 'wind', passive: { speed: 0.12, reload: 0.1 }, signature: { kind: 'passive' } },
  guts: { name: 'BERSERKER RAGE', role: 'STRONG AT LOW HP', color: '#f47b77', mark: 'BR', trail: 'slash', passive: { damage: 0.1 }, signature: { kind: 'rage', below: 0.4, damage: 0.25 } },
  luffy: { name: 'RUBBER FORCE', role: 'TOUGH & KNOCKBACK', color: '#ffc275', mark: 'RF', trail: 'wind', passive: { reduction: 0.12, knockback: 0.5 }, signature: { kind: 'passive' } },
  sanji: { name: 'DIABLE JAMBE', role: 'FIRE COMBO', color: '#ffac5a', mark: 'DJ', trail: 'flame', passive: { reload: 0.12 }, signature: { kind: 'cadence', every: 3, damage: 0.2, pierce: 0, burnDps: 8, burnSeconds: 2.5, chain: 0, chainDamage: 0, range: 0, stun: 0 } },
  sephiroth: { name: 'ONE WING', role: 'FULL DRAW POWER', color: '#d2c5fa', mark: 'OW', trail: 'slash', passive: {}, signature: { kind: 'charge', pull: 0.9, damage: 0.18, speed: 0, pierce: 1 } },
  sekiro: { name: 'SHINOBI PARRY', role: 'PARRY MASTER', color: '#e4c7a5', mark: 'SP', trail: 'light', passive: { speed: 0.08 }, signature: { kind: 'parry', heal: 4, gold: 0.5 } },
  racer: { name: 'TURBO VISOR', role: 'SPEED & HEAD GUARD', color: '#ff8982', mark: 'TV', trail: 'wind', passive: { speed: 0.22, headGuard: 0.25 }, signature: { kind: 'passive' } },
  robin: { name: 'GENEROUS ARCHER', role: 'GOLD & HEALING', color: '#9ce3a7', mark: 'GA', trail: 'light', passive: { gold: 0.2, headHeal: 3 }, signature: { kind: 'passive' } },
  cowboy: { name: 'OPENING DUEL', role: 'FIRST SHOT', color: '#f6d38d', mark: 'OD', trail: 'light', passive: { speed: 0.08 }, signature: { kind: 'opening', damage: 0.45 } },
  punk: { name: 'VOLT DISTORTION', role: 'LIGHTNING COMBO', color: '#eea1f2', mark: 'VD', trail: 'lightning', passive: { reload: 0.12 }, signature: { kind: 'cadence', every: 4, damage: 0, pierce: 0, burnDps: 0, burnSeconds: 0, chain: 1, chainDamage: 0.35, range: 270, stun: 0.7 } },
  saiyan: { name: 'KI BURST', role: 'CHARGED ARROWS', color: '#ffe083', mark: 'KI', trail: 'light', passive: {}, signature: { kind: 'charge', pull: 0.9, damage: 0.15, speed: 0.18, pierce: 0 } },
  gojo: { name: 'INFINITY', role: 'AUTO BARRIER', color: '#a6e9ff', mark: 'IN', trail: 'light', passive: {}, signature: { kind: 'barrier', cooldown: 18 } },
  sasuke: { name: 'CHIDORI', role: 'SHOCK HEADSHOTS', color: '#a7b7ff', mark: 'CH', trail: 'lightning', passive: { headDamage: 0.15 }, signature: { kind: 'headShock', stun: 0.75 } },
  levi: { name: 'PRECISION SLASH', role: 'FAST & PRECISE', color: '#bdcfe1', mark: 'PS', trail: 'slash', passive: { reload: 0.2, limbDamage: 0.35 }, signature: { kind: 'passive' } },
  jinwoo: { name: 'ARISE', role: 'KILL CHAIN', color: '#bba1f6', mark: 'AR', trail: 'shadow', passive: { damage: 0.05 }, signature: { kind: 'shadow', damage: 0.25, pierce: 1 } },
  vergil: { name: 'JUDGEMENT CUT', role: 'MULTI-PIERCE', color: '#a4d7ff', mark: 'JC', trail: 'slash', passive: { speed: 0.1 }, signature: { kind: 'cadence', every: 4, damage: 0.25, pierce: 2, burnDps: 0, burnSeconds: 0, chain: 0, chainDamage: 0, range: 0, stun: 0 } },
  gojo_blue: { name: 'SIX EYES', role: 'VITAL TARGETING', color: '#80d9ff', mark: 'SE', trail: 'light', passive: { gravity: 0.25, headDamage: 0.18 }, signature: { kind: 'passive' } },
  rengoku: { name: 'FLAME BREATHING', role: 'BURN & BLAST', color: '#ffb05b', mark: 'FB', trail: 'flame', passive: {}, signature: { kind: 'flame', burnDps: 3, burnSeconds: 2, blast: 0.2, radius: 80 } },
};

const SKIN_PERK_ID: Record<SkinId, { name: string; role: string }> = {
  band: { name: 'ALIRAN ANGIN', role: 'CEPAT & RINGAN' },
  guts: { name: 'AMUK BERSERKER', role: 'KUAT SAAT TERDESAK' },
  luffy: { name: 'TENAGA KARET', role: 'TAHAN & DORONG' },
  sanji: { name: 'DIABLE JAMBE', role: 'KOMBO API' },
  sephiroth: { name: 'SAYAP TUNGGAL', role: 'TARIKAN PENUH' },
  sekiro: { name: 'TANGKIS SHINOBI', role: 'AHLI TANGKIS' },
  racer: { name: 'TURBO VISOR', role: 'LAJU & PELINDUNG' },
  robin: { name: 'PEMANAH DERMAWAN', role: 'EMAS & PEMULIHAN' },
  cowboy: { name: 'DUEL PEMBUKA', role: 'TEMBAKAN PERTAMA' },
  punk: { name: 'DISTORSI LISTRIK', role: 'SAMBARAN KOMBO' },
  saiyan: { name: 'LEDAKAN KI', role: 'PANAH BERTENAGA' },
  gojo: { name: 'INFINITY', role: 'PENGHALANG OTOMATIS' },
  sasuke: { name: 'CHIDORI', role: 'HEADSHOT MENYETRUM' },
  levi: { name: 'TEBASAN PRESISI', role: 'CEPAT & AKURAT' },
  jinwoo: { name: 'ARISE', role: 'RANTAI PEMBUNUHAN' },
  vergil: { name: 'JUDGEMENT CUT', role: 'TEMBUS BERLAPIS' },
  gojo_blue: { name: 'MATA ENAM', role: 'BIDIK TITIK VITAL' },
  rengoku: { name: 'NAPAS API', role: 'BAKAR & LEDAKKAN' },
};

export const skinPerkName = (id: SkinId) => tx(SKIN_PERKS[id].name, SKIN_PERK_ID[id].name);

export const SKIN_RULES = {
  percent: 100, dotTick: 0.5, floatPrecision: 1000,
  reloadSeconds: 0.46, previewSpeed: 1250, previewGravity: 980,
  statusPrecision: 10, dotColor: '#ffb25b', neutral: '#ffffff',
  fx: {
    trailSeconds: 0.026, trailWidth: 1.8, chargedWidth: 3.2,
    trailAlpha: 0.35, chargedAlpha: 0.7, waveSpeed: 15, waveSize: 2.5,
    lightningSteps: 6, ringSeconds: 0.35, ringRadius: 35,
    noticeSize: 15, noticeY: 64, noticeSeconds: 1.1,
    burnSize: 3, burnLife: 0.24, burnRise: -55, burnGravity: -95, burnChance: 0.12,
    stunWingSpeed: 18, arcSeconds: 0.28, arcSpread: 7, arcSegments: 6, arcWidth: 1.5,
    barrierRadius: 44, barrierAlpha: 0.3, barrierPulse: 0.08,
    hpLagHold: 0.28, hpShowSeconds: 4.5,
  },
};

export type RefinedHairId = 'saiyan' | 'gojo' | 'sasuke' | 'levi' | 'jinwoo' | 'vergil' | 'gojo_blue' | 'rengoku';
export type HairZone = 'fixed' | 'crown' | 'fringe' | 'cloth' | 'mane';
export type HairIrisId = 'sixEyes' | 'shadow' | 'steel' | 'flame';
export interface HairShape {
  path: string;
  colors: [string, string];
  zone: HairZone;
  alpha?: number;
  edge?: string;
  clip?: boolean;
  gradient?: [number, number, number, number];
  stops?: [number, string][];
}
export interface HairLines { paths: string[]; color: string; width: number; zone: HairZone; clip?: boolean }
export interface RefinedHairDef {
  outline: HairShape;
  underneath: HairShape[];
  back: HairShape[];
  layers: HairShape[];
  lines: HairLines[];
  accessory: HairShape[];
  accessoryLines: HairLines[];
  backLines?: HairLines[];
  eye?: HairIrisId;
  portrait?: { worldSize: number; centerX: number; centerY: number };
}

// Sculpted cuts share a scalp-bound silhouette; bangs and mane tips respond without detaching.
export const HAIR_ART = {
  motion: {
    step: 1 / 120, stiffness: 170, damping: 24, velocityGain: 0.014,
    rotationGain: 0.042, limit: 1.15, fringeFollow: 11,
    breezeSpeed: 1.7, breezeAmount: 0.07, seedPhase: 3.1,
    teleportDistance: 65, crownAnchor: -9, crownLength: 21,
    fringeAnchor: -12, fringeLength: 21, tailAnchor: -10, tailLength: 10,
    fringeFlex: 0.85, fringeLift: 0.08, clothFlex: 1.5,
    maneAnchor: -3, maneLength: 34, maneFlex: 1.65, maneLift: 0.12,
  },
  paint: { edgeWidth: 0.65, top: -27, bottom: 10, xTop: -5, xBottom: 6 },
  eye: {
    forward: 3.4, lookX: 1.5, up: 0.3, lookY: 1.7,
    angle: 0.3, angleLook: 0.25, rx: 3.5, ry: 2.25,
    minHeight: 0.25, aimSquint: 0.38, weakSquint: 0.3,
    blinkCutoff: 0.65, hurtCutoff: 0.2, victoryCutoff: 0.25, happyCutoff: 0.5,
    iris: 1.85, pupil: 0.58, ring: 1.25, ringWidth: 0.16,
    tomoeCount: 3, tomoeRadius: 0.25, turn: 0.35, focusTurn: 1.5,
    gleamX: -0.65, gleamY: -0.65, gleamSize: 0.25,
    red: '#df403d', darkRed: '#851b26', ink: '#250c13', white: '#ffe5d9',
  },
  aura: {
    x: -2, y: -11, radius: 25, innerRadius: 8,
    idleAlpha: 0.06, drawAlpha: 0.12, pulse: 0.025, speed: 2.6,
    center: '#ffe293', edge: '#ffd45a00',
  },
  gojoGlow: {
    x: 5, y: -0.4, radius: 3.4, alpha: 0.14, pulse: 0.045,
    speed: 2, color: '#71d7f3', edge: '#71d7f300',
  },
  gemEye: {
    innerStop: 0.32, midStop: 0.72, outerStop: 0.92,
    pupilRatio: 0.31, rimWidth: 0.18, rayCount: 22,
    rayStart: 0.45, rayEnd: 0.86, rayVariation: 0.06, rayWidth: 0.1,
    rayAlpha: 0.48, ringRatio: 0.47, ringWidth: 0.11,
    gleamX: -0.38, gleamY: -0.43, gleamRadius: 0.24,
    smallGleamX: 0.4, smallGleamY: 0.42, smallGleamRadius: 0.1,
    shimmerSpeed: 1.8, shimmerBase: 0.81, shimmerRange: 0.19,
    white: '#f2ffff',
  },
  thumbnail: { worldSize: 58, centerX: 0.52, centerY: 0.62, seed: 0.42 },
};

export const HAIR_IRISES: Record<HairIrisId, { radius: number; center: string; middle: string; outer: string; rim: string; pupil: string; fiber: string }> = {
  sixEyes: { radius: 2.18, center: '#d6ffff', middle: '#54d5ff', outer: '#2883eb', rim: '#163974', pupil: '#082446', fiber: '#ddffff' },
  shadow: { radius: 1.86, center: '#d5c6ff', middle: '#9b89eb', outer: '#6550b2', rim: '#352b60', pupil: '#14112e', fiber: '#e3d9ff' },
  steel: { radius: 1.78, center: '#c1e9f2', middle: '#6eabcc', outer: '#47748f', rim: '#283b59', pupil: '#112031', fiber: '#deeff8' },
  flame: { radius: 2, center: '#ffeb9c', middle: '#ffb833', outer: '#e95323', rim: '#912a1a', pupil: '#38120c', fiber: '#fff2ae' },
};

export const REFINED_HAIR: Record<RefinedHairId, RefinedHairDef> = {
  saiyan: {
    outline: {
      path: 'M -8.6 5.9 Q -12.2 2.4 -12.6 -1.7 L -16.7 -3.2 Q -13.9 -5.1 -12.5 -7.7 Q -17 -10.4 -18.2 -16.3 Q -13.4 -14.5 -10.1 -12.9 Q -14.2 -20.4 -12.4 -26.7 Q -8.9 -23.5 -5.5 -18.6 Q -5.4 -26.5 -0.2 -31 Q -0.7 -23.7 2.1 -18.5 Q 4.3 -25.7 8 -27.6 Q 7.3 -20.7 8.3 -15.4 Q 11.4 -20.3 14.3 -21.5 Q 13.9 -15.7 11.8 -11.3 Q 12.9 -8.8 10.7 -5.3 Q 7.8 -8.7 4.8 -9.1 L 2.6 -7.2 Q 0.6 -9.4 -2.7 -9.3 Q -5.5 -6.6 -5.6 -1.9 L -6.4 2.4 L -6.6 6.5 Z',
      colors: ['#ffeb80', '#d99a1a'], edge: '#80591e', zone: 'crown',
    },
    underneath: [], back: [],
    layers: [
      { path: 'M -12.4 -26.7 Q -10.4 -18.5 -3.5 -10.8 Q -6.9 -10.5 -8 -8.9 Q -13 -16.7 -12.4 -26.7 Z', colors: ['#fff5ba', '#efc047'], zone: 'crown', clip: true },
      { path: 'M -0.2 -31 Q -2.9 -21.3 1.4 -13 Q -1.2 -13.7 -4.1 -11.4 Q -6.4 -21.7 -0.2 -31 Z', colors: ['#fff8cc', '#ffe26b'], zone: 'crown', clip: true },
      { path: 'M 8 -27.6 Q 4.7 -18.5 5.4 -12.4 L 2.1 -14.6 Q 3.9 -24.4 8 -27.6 Z', colors: ['#fff5b3', '#f6c94c'], zone: 'crown', clip: true },
      { path: 'M -17.9 -15.9 Q -11.6 -9.2 -7.2 -7.8 L -8.6 -4.4 Q -14.8 -8.7 -17.9 -15.9 Z', colors: ['#fff0a0', '#f6c347'], zone: 'crown', clip: true },
      { path: 'M -5.8 -9.2 Q -8.1 -3.1 -6.6 6.5 Q -10.6 4.4 -10.8 0.2 Q -10.2 -6.8 -5.8 -9.2 Z', colors: ['#e7ae26', '#b97913'], zone: 'fixed', clip: true },
      { path: 'M 2.7 -12 Q 6.9 -11.4 10 -7.2 L 9.3 -2.8 Q 7.5 -7.3 3.3 -8.3 Q 0.7 -6.8 0.3 -4.2 Q -1.3 -8.5 2.7 -12 Z', colors: ['#ffe570', '#e4ae2e'], edge: '#a47720', zone: 'fringe' },
    ],
    lines: [
      { paths: ['M -2.1 -24.5 Q -3.1 -17.9 -1.4 -13.5', 'M -10.5 -21.2 Q -9 -16.5 -5.4 -12.7', 'M 6.6 -22 Q 4.8 -17.8 4.3 -14.6', 'M -14.3 -13 Q -11.2 -10 -8.7 -8.9'], color: '#ad751f80', width: 0.4, zone: 'crown', clip: true },
      { paths: ['M -0.9 -25.1 Q -1.6 -19.2 0.4 -15', 'M -10.9 -22 Q -9.5 -17.7 -7.5 -15.5', 'M 11.7 -17.4 L 9.9 -13.1'], color: '#fff6c4b0', width: 0.55, zone: 'crown', clip: true },
      { paths: ['M 3.1 -10.5 Q 6.7 -10 8.6 -6.3'], color: '#fff1a2a0', width: 0.45, zone: 'fringe' },
    ],
    accessory: [], accessoryLines: [],
  },
  gojo: {
    outline: {
      path: 'M -9.9 1.9 Q -12.3 -0.9 -11.9 -4.8 L -15.3 -6 Q -13.5 -7.7 -12.4 -9.7 L -15.7 -14.4 Q -11.4 -13.1 -9.3 -11.9 Q -11 -16.5 -9.9 -20.5 Q -6.6 -18.5 -5.4 -15.8 Q -5.8 -22.1 -1.7 -24.1 Q -1.7 -18.8 1.2 -16 Q 3.8 -21.8 6.4 -23.1 Q 7.1 -19.3 6.2 -15.7 Q 10.1 -19.1 13.3 -19.3 Q 11.9 -15.8 11.7 -12.2 L 14.8 -13.2 Q 14 -8.4 10.2 -5.2 L 7.1 -6.2 L 5.6 -4.9 L 3 -6.3 L 0.3 -5.4 L -3 -6.3 L -6.4 -3.8 L -7.3 1.6 Z',
      colors: ['#ffffff', '#b9ccdc'], edge: '#56748c', zone: 'crown',
    },
    underneath: [],
    back: [
      { path: 'M -10.2 -1.8 Q -14.4 -1.1 -17.1 3.1 L -20 3.8 Q -18.2 -1.2 -14.1 -3.6 Z', colors: ['#26343d', '#101920'], edge: '#0b151b', zone: 'cloth' },
      { path: 'M -10.9 -1.1 Q -15.6 2.1 -15.9 6.1 L -18.3 7.4 Q -18.6 2.5 -13.1 -2 Z', colors: ['#31414e', '#17222b'], zone: 'cloth' },
    ],
    layers: [
      { path: 'M -9.9 -20.5 Q -8.1 -13.3 -2.1 -8.2 L -6.2 -7.1 Q -10.3 -12.1 -9.9 -20.5 Z', colors: ['#ffffff', '#edf3f7'], zone: 'crown', clip: true },
      { path: 'M -1.7 -24.1 Q -3.7 -16.4 1.7 -9.6 L -1.2 -6.6 Q -6.2 -13.2 -1.7 -24.1 Z', colors: ['#ffffff', '#f6f9fb'], zone: 'crown', clip: true },
      { path: 'M 6.4 -23.1 Q 3.2 -16.5 4.2 -9.5 L 1.6 -10.5 Q 2.8 -18.6 6.4 -23.1 Z', colors: ['#ffffff', '#e4eef6'], zone: 'crown', clip: true },
      { path: 'M 13.3 -19.3 Q 8.2 -14.6 8.6 -7.2 L 5.9 -8.3 Q 7.4 -16.6 13.3 -19.3 Z', colors: ['#ffffff', '#eff5fa'], zone: 'crown', clip: true },
      { path: 'M -12.1 -10.1 Q -10.2 -5.1 -5.8 -4.3 L -7.3 1.6 L -10 1.8 Q -13.5 -3.3 -12.1 -10.1 Z', colors: ['#d5e4ef', '#93adbf'], zone: 'fixed', clip: true },
    ],
    lines: [
      { paths: ['M -8.3 -16.3 Q -7 -12.1 -4 -9.3', 'M -2.4 -18.7 Q -3.1 -13.4 0.1 -9.1', 'M 4.7 -18.8 Q 3.3 -14.5 4 -10.9', 'M 10.5 -15.9 Q 8.4 -13.5 8 -10'], color: '#7799b261', width: 0.42, zone: 'crown', clip: true },
      { paths: ['M -13 -12.3 Q -10.9 -10 -8.5 -8.9', 'M -7.6 -12.9 Q -5.2 -9.2 -2.8 -8.3'], color: '#ffffffaf', width: 0.55, zone: 'crown', clip: true },
    ],
    accessory: [
      { path: 'M -10.8 -4.6 Q -1.8 -6 9.9 -4.5 Q 11.8 -1.5 10.5 2.5 Q 6 4.1 -0.6 3.2 Q -6.5 2.4 -10.7 0.8 Q -11.8 -1.2 -10.8 -4.6 Z', colors: ['#202d39', '#0d171f'], edge: '#08121b', zone: 'fixed' },
      { path: 'M -11 -3.3 Q -14 -4.5 -13.5 -1.9 Q -13.9 0.4 -11.4 0.5 L -9.7 -1.5 Z', colors: ['#2b3b47', '#14212a'], edge: '#0b151c', zone: 'fixed' },
    ],
    accessoryLines: [
      { paths: ['M -8.9 -3.7 Q -5.1 -4.6 -1.5 -4.3', 'M -8.3 0.4 Q -4.3 -0.2 -1.6 0.4'], color: '#5e74824a', width: 0.4, zone: 'fixed' },
      { paths: ['M -8.6 -2.4 Q -5.5 -2.8 -3.5 -2.2', 'M 5.7 1.3 L 9.4 1.8'], color: '#050c126a', width: 0.45, zone: 'fixed' },
    ],
  },
  sasuke: {
    outline: {
      path: 'M -8.3 8.2 Q -11.4 5.9 -11.8 2.4 L -15 3.2 L -13.3 -0.7 L -17.6 -3 Q -14.7 -4.9 -13 -6.1 L -17.4 -10.3 L -12.8 -10.4 L -15.1 -16.2 Q -11.8 -15.6 -9.3 -14.3 Q -6.5 -16.4 -2.4 -16.2 Q 2.6 -16.5 5.6 -13.8 Q 9.4 -12.9 11 -8.4 Q 10.3 -5.6 8.7 -3.8 Q 7.7 -8.4 4.7 -10.4 Q 2.4 -9.2 0.7 -6.3 Q -2.8 -5.4 -4.3 -1.4 L -5.3 4.7 L -6.7 8.5 Z',
      colors: ['#34435c', '#101a2a'], edge: '#070e19', zone: 'crown',
    },
    underneath: [],
    back: [
      { path: 'M 6.2 -12 Q 12 -8.9 12.1 -3.5 Q 12.5 3.1 10 6.7 Q 10.5 1.5 8.6 -2.8 Q 8.8 -6.4 5 -9.1 Z', colors: ['#334157', '#111b29'], edge: '#070f19', zone: 'fringe' },
    ],
    layers: [
      { path: 'M -14.8 -15.9 Q -10.6 -11.4 -5.4 -10 Q -9 -8.4 -11.1 -9.2 Q -14.1 -12.4 -14.8 -15.9 Z', colors: ['#3f526f', '#233249'], zone: 'crown', clip: true },
      { path: 'M -17.4 -10.2 Q -12.9 -8.1 -9.1 -6.6 L -11.5 -4.7 Q -14.5 -7 -17.4 -10.2 Z', colors: ['#384b66', '#1b2a40'], zone: 'crown', clip: true },
      { path: 'M -12.9 -6 Q -12.4 -1 -6.1 2.9 L -6.7 8.5 Q -11.8 6.7 -13.7 -1.4 Z', colors: ['#26384f', '#101925'], zone: 'fixed', clip: true },
      { path: 'M 3.1 -14.4 Q -2.9 -15 -7.8 -9.4 Q -10.8 -6 -8.9 -1.1 Q -8.9 -5.9 -4.8 -8.4 Q -1.1 -9.8 3.8 -10.2 Z', colors: ['#465a74', '#202e43'], alpha: 0.68, zone: 'crown', clip: true },
      { path: 'M 2.1 -13.2 Q -4.1 -11.3 -5.7 -6 Q -7.2 0.1 -4.6 10 Q -3.8 4.4 -1.3 0.8 L -0.3 2.3 Q -0.5 -3.1 2.8 -7.6 Q 4.8 -10 5.2 -12.3 Q 3.8 -13.4 2.1 -13.2 Z', colors: ['#35465f', '#111b2b'], edge: '#101b2a', zone: 'fringe' },
    ],
    lines: [
      { paths: ['M -7 -12 Q -2.7 -15.1 2.6 -13.5', 'M -13.6 -12.9 Q -10.7 -10.6 -8.8 -10', 'M -14.7 -8.7 L -11.1 -6.8'], color: '#8197b559', width: 0.45, zone: 'crown', clip: true },
      { paths: ['M 0.9 -11.6 Q -3.1 -8.4 -3.8 -3.3', 'M -4.1 -2.2 Q -5 2.8 -4.7 5.7'], color: '#7e94b14a', width: 0.42, zone: 'fringe' },
      { paths: ['M 3.7 -10.5 Q 1.1 -7 -0.3 -3.5'], color: '#080f1b8c', width: 0.5, zone: 'fringe' },
    ],
    accessory: [], accessoryLines: [],
  },
  levi: {
    outline: {
      path: 'M -10.8 -0.8 Q -13.1 -4.7 -10.8 -9.4 Q -8.6 -14.7 -2.6 -15.1 Q 1.4 -15.7 3.8 -13.4 Q 7 -13.4 9.8 -9.9 Q 12.7 -6.7 10.6 -0.9 Q 9.2 -3.1 7 -4.3 Q 4.7 -6.2 3.5 -9.4 Q 1.7 -5.4 -2 -2.6 Q -6.3 -0.4 -10.8 -0.8 Z',
      colors: ['#3c485b', '#151e2a'], edge: '#0a121d', zone: 'crown',
    },
    underneath: [
      { path: 'M -10.4 -6.3 Q -12.7 -0.3 -8.5 6.8 L -6.8 8.1 Q -4.6 4.9 -4.4 1.2 Q -6.3 -1.7 -3.5 -5.1 Z', colors: ['#48545e', '#1c2934'], zone: 'fixed' },
    ],
    back: [],
    layers: [
      { path: 'M 2.6 -13.4 Q -2.5 -13.9 -7.6 -8.3 Q -9.2 -6.4 -10 -2.9 Q -5.7 -5.2 -2.6 -7.5 Q 0 -9.8 2.6 -13.4 Z', colors: ['#566278', '#283648'], alpha: 0.65, zone: 'crown', clip: true },
      { path: 'M 4.4 -12.4 Q 7.1 -11.7 9.2 -8 Q 10 -5.5 9.6 -3.2 Q 8.5 -7.9 4.4 -12.4 Z', colors: ['#4b5a70', '#293849'], zone: 'crown', clip: true },
      { path: 'M 2.8 -12.8 Q 0.8 -8.8 -2.9 -5.3 Q -6.2 -2.2 -6.1 2.9 Q -9.5 -0.1 -7.6 -4.2 Q -4.6 -9.4 2.8 -12.8 Z', colors: ['#3c4b61', '#1d2a3a'], edge: '#152335', zone: 'fringe' },
      { path: 'M 4.7 -12 Q 5.1 -8.7 8 -6.3 Q 10.7 -4.7 10.7 -0.7 Q 8.7 -4 6.8 -4.8 Q 2.8 -7.8 3.5 -12.5 Z', colors: ['#36455a', '#1b2939'], zone: 'fringe' },
    ],
    lines: [
      { paths: ['M -9.2 -0.6 L -8.6 1', 'M -8.7 1.5 L -8 2.8', 'M -7.9 3.3 L -7.2 4.5'], color: '#5c6e7b32', width: 0.4, zone: 'fixed' },
      { paths: ['M 0.9 -13 Q -3.7 -11.8 -6.7 -8.1', 'M -2 -13.8 Q -7.3 -12.7 -9.2 -8.8', 'M 5.4 -11.6 Q 8 -9.9 8.8 -7.7'], color: '#8696ae54', width: 0.42, zone: 'crown', clip: true },
      { paths: ['M 3.7 -13.2 Q 2.6 -11.7 3.7 -9'], color: '#080e176e', width: 0.65, zone: 'fixed' },
      { paths: ['M 0.7 -10.6 Q -3.3 -6.8 -5.1 -3.5', 'M 5.2 -9.4 Q 6.2 -7.5 8.1 -6'], color: '#7c8fa658', width: 0.45, zone: 'fringe' },
    ],
    accessory: [], accessoryLines: [],
  },
  jinwoo: {
    eye: 'shadow',
    outline: {
      path: 'M -9 6.4 Q -12.5 2 -11.9 -2.9 L -14.1 -4.6 L -12.2 -7.6 L -14 -11.8 L -10.1 -10.6 Q -11.1 -16 -8.5 -17.7 L -6.9 -14.6 Q -4.1 -19.8 0.3 -20.3 L -0.9 -16.9 Q 3.9 -19.6 7.5 -18.3 L 5.3 -15.4 Q 11.1 -14.6 13 -10.8 L 10.7 -10.6 Q 14.1 -6.3 12.1 -1.2 Q 10.4 -4.5 8.2 -5.8 L 6.3 -8.7 Q 5.7 -5.5 3.3 -3.7 L 3.4 -7 Q 0.6 -3.8 -1.1 -0.3 L -1.4 -3.1 Q -3.8 -0.2 -4.8 3.9 L -5.9 1.3 L -6.9 7.5 Z',
      colors: ['#34394e', '#101624'], edge: '#090f1c', zone: 'crown',
    },
    underneath: [], back: [],
    layers: [
      { path: 'M 0.1 -19.8 Q -5.1 -14.8 -5.4 -7.5 Q -8.6 -7.4 -9 -5.6 Q -10 -13.3 0.1 -19.8 Z', colors: ['#51536d', '#252d43'], alpha: 0.72, zone: 'crown', clip: true },
      { path: 'M 7.2 -17.9 Q 0.7 -14.7 -1.2 -6.7 L -3.3 -5.8 Q -4.4 -12.8 2.4 -16.4 Z', colors: ['#46516b', '#202c42'], zone: 'crown', clip: true },
      { path: 'M -12.4 -10.6 Q -9.9 -7.1 -7.3 -5.5 L -9.9 -0.6 Q -12.9 -4.1 -12.4 -10.6 Z', colors: ['#303b50', '#182337'], zone: 'fixed', clip: true },
      { path: 'M 2.8 -13.6 Q -1.5 -9.8 -2.4 -3 Q -2.6 -0.3 -4.4 2.8 Q -3.7 -1.3 -4.1 -2.4 L -6.2 1.8 Q -7.2 -7.1 -1.9 -12.1 Q 0.3 -13.5 2.8 -13.6 Z', colors: ['#354058', '#141f31'], edge: '#142035', zone: 'fringe' },
      { path: 'M 4.1 -13.9 Q 7.3 -12.8 9.4 -9.1 L 8.1 -8.6 Q 9.2 -6 9.4 -2.6 Q 6.3 -6.2 5.7 -8.7 Q 4.5 -6.2 3.2 -4.6 Q 4.7 -9.5 4.1 -13.9 Z', colors: ['#38425b', '#182237'], zone: 'fringe' },
    ],
    lines: [
      { paths: ['M -4.4 -15.8 Q -7.5 -12.5 -7.4 -9', 'M 3.4 -16 Q -0.4 -13.7 -1.8 -10.3', 'M 7.8 -13.6 Q 10.1 -12.6 10.8 -11.1'], color: '#9394c04e', width: 0.43, zone: 'crown', clip: true },
      { paths: ['M -0.5 -11.2 Q -3.8 -7.5 -4 -3.4', 'M 5.2 -11.7 Q 6.9 -9.4 7 -7.4'], color: '#7185ae50', width: 0.38, zone: 'fringe' },
      { paths: ['M -7 -3.5 L -7.8 0.3', 'M -8.4 0.3 L -7.4 4.3'], color: '#414a713c', width: 0.35, zone: 'fixed' },
    ],
    accessory: [], accessoryLines: [],
  },
  vergil: {
    eye: 'steel',
    outline: {
      path: 'M -10.2 4.2 Q -13 0.9 -11.8 -5.5 L -15.8 -7 Q -13 -8.8 -13 -11.4 L -18.8 -13 Q -16.7 -17 -11.5 -18 L -15.7 -21 Q -10.3 -23.2 -6.1 -20.9 L -7.9 -23.3 Q -1.4 -24 2.7 -20.8 Q 7.7 -18.4 9.6 -12.5 Q 10.8 -9.7 9.2 -5.4 Q 6.2 -8 4.3 -9.2 L 2.7 -6.3 Q 0.6 -8.3 -2.6 -8.9 Q -7.7 -6.9 -7.9 -0.9 L -8.6 4.8 Z',
      colors: ['#f5f8fb', '#a6b6c7'], edge: '#566b80', zone: 'crown',
    },
    underneath: [], back: [],
    layers: [
      { path: 'M -7.9 -23.3 Q 0.4 -23 4.5 -12.8 L 5.5 -9.6 Q 6.4 -16.5 0.5 -20.1 Q -3.2 -22.5 -7.9 -23.3 Z', colors: ['#ffffff', '#e0eaf2'], zone: 'crown', clip: true },
      { path: 'M -15.4 -20.8 Q -7.1 -19.6 -1.6 -14.6 Q 0.7 -12.6 2.7 -6.3 Q -2.5 -10.1 -4.7 -12.8 Q -8 -17.4 -15.4 -20.8 Z', colors: ['#f2f8fc', '#c3d4e2'], zone: 'crown', clip: true },
      { path: 'M -18.4 -13.1 Q -9.8 -15.1 -3.7 -8.2 Q -8 -9.3 -11.3 -10.5 Q -14.7 -12.4 -18.4 -13.1 Z', colors: ['#f8fcff', '#c4d3e0'], zone: 'crown', clip: true },
      { path: 'M -12.3 -7.2 Q -10.2 -6.2 -7.5 -5.3 L -8.6 4.8 Q -12.4 2.6 -12.3 -7.2 Z', colors: ['#c0cedd', '#758ba4'], zone: 'fixed', clip: true },
      { path: 'M 2.5 -20.1 Q 7 -17.4 8.5 -11.1 L 9.1 -6 Q 7.1 -7.8 6.1 -10 Q 6.9 -15 2.5 -20.1 Z', colors: ['#ffffff', '#dce6ee'], zone: 'crown', clip: true },
    ],
    lines: [
      { paths: ['M 4.2 -11.2 C 1.2 -17.8 -3.7 -21.9 -9.6 -21.8', 'M 1 -10.2 Q -5.6 -18.3 -12.7 -19.3', 'M -2.5 -8.9 Q -8.6 -15.5 -14.7 -14.5', 'M 7.7 -10.1 Q 7.9 -16 2.4 -19.6'], color: '#5f799368', width: 0.45, zone: 'crown', clip: true },
      { paths: ['M -2 -18.6 Q 2 -16.9 3.3 -13.9', 'M -9.7 -17.7 Q -5.9 -16.4 -3.2 -13.2', 'M -12.7 -12.8 Q -8.6 -11.4 -6.7 -9.5'], color: '#ffffffb5', width: 0.6, zone: 'crown', clip: true },
      { paths: ['M -10.1 -5.4 L -10.5 -0.6', 'M -8.8 -4.9 L -9 1.8'], color: '#637d9755', width: 0.42, zone: 'fixed' },
    ],
    accessory: [], accessoryLines: [],
  },
  gojo_blue: {
    eye: 'sixEyes',
    outline: {
      path: 'M -9.8 6 Q -12.8 2 -12 -3 L -14.8 -4.6 L -12.4 -6.7 L -15.5 -10.5 Q -12 -10 -9.8 -9.6 L -11.5 -16.4 Q -8.5 -14.6 -6.9 -13 L -5.7 -18.6 Q -3 -16.6 -2 -14.8 Q 0.9 -19.9 3.7 -20.1 Q 2.8 -16.5 4.2 -14.3 Q 8.7 -17.8 11.5 -17.1 L 9.4 -13.1 Q 14.2 -11.4 14.2 -7.6 L 11.7 -8 Q 13 -3.3 11.6 0.7 Q 10.1 -3.2 7.9 -4.8 Q 6.5 -7.5 5.1 -9.1 Q 3.1 -7 0.4 -3.5 L -1.2 -5.2 Q -4 -2.5 -4.4 3.5 L -5.8 1.3 L -6.1 7.3 L -8.6 4.4 Z',
      colors: ['#ffffff', '#c7dbe7'], edge: '#6e8c9f', zone: 'crown',
    },
    underneath: [], back: [],
    layers: [
      { path: 'M -10.7 -15.8 Q -8.9 -10.1 -2.9 -8.9 L -6.6 -5.7 Q -9.7 -9.4 -10.7 -15.8 Z', colors: ['#ffffff', '#edf6fa'], zone: 'crown', clip: true },
      { path: 'M -5.7 -18.6 Q -4.8 -13.1 -0.6 -10.1 L -2.2 -7 Q -7.4 -11.7 -5.7 -18.6 Z', colors: ['#ffffff', '#f7fbfe'], zone: 'crown', clip: true },
      { path: 'M 3.7 -20.1 Q -1.3 -14.6 2.7 -9.8 Q -0.8 -8.7 -2.7 -9.6 Q -3.6 -14.2 3.7 -20.1 Z', colors: ['#ffffff', '#eaf5fb'], zone: 'crown', clip: true },
      { path: 'M 11.5 -17.1 Q 5.8 -12.4 7.9 -6.8 L 5.7 -9 Q 2.4 -13.4 11.5 -17.1 Z', colors: ['#ffffff', '#edf8ff'], zone: 'crown', clip: true },
      { path: 'M -6.4 -9.4 Q -10.2 -1.4 -6.1 7.3 L -8.6 4.4 L -9.8 6 Q -13 0.7 -11.2 -5.3 Z', colors: ['#daeaf3', '#9fb9ce'], zone: 'fixed', clip: true },
      { path: 'M 3.1 -12.7 Q -0.3 -10.1 -2.5 -6.2 Q -4.3 -2.8 -3.9 2 Q -7.7 -2.4 -4.9 -7.5 Q -2 -11.5 3.1 -12.7 Z', colors: ['#fcffff', '#bfd7e5'], edge: '#8aaaba', zone: 'fringe' },
      { path: 'M 5.9 -12.1 Q 10.2 -10.3 10.9 -4.5 L 11.6 0.7 Q 8.5 -3.7 7.1 -6.9 Q 4.7 -9.5 5.9 -12.1 Z', colors: ['#ffffff', '#d2e5f1'], zone: 'fringe' },
    ],
    lines: [
      { paths: ['M -3.9 -15.6 Q -4.1 -12.7 -1.5 -10.9', 'M 0.9 -16.5 Q -0.4 -13.7 1.3 -11.2', 'M 8 -14.8 Q 5.1 -12.6 6.6 -10.3', 'M -10.2 -11.9 Q -7.9 -9.7 -6.8 -8.8'], color: '#88adbf65', width: 0.38, zone: 'crown', clip: true },
      { paths: ['M 0.6 -10.4 Q -3 -7.1 -3.6 -3.7', 'M 7.4 -9.9 Q 9.1 -7.8 9.5 -5.9'], color: '#779eaf58', width: 0.36, zone: 'fringe' },
    ],
    accessory: [],
    accessoryLines: [{ paths: ['M 2 -4.2 Q 4.1 -5.2 7.1 -4.4'], color: '#e4f5fcba', width: 0.45, zone: 'fixed' }],
  },
  rengoku: {
    eye: 'flame',
    portrait: { worldSize: 65, centerX: 0.52, centerY: 0.48 },
    outline: {
      path: 'M -11.3 4.7 Q -14.5 0.8 -13.4 -4.3 L -17.7 -6.8 L -14.7 -9 L -17.9 -14.6 Q -11.8 -13.3 -9.5 -11.8 L -10.8 -19.8 Q -5.9 -17.8 -3 -14.3 Q -2.8 -18 0.3 -20.4 Q 1.5 -17.2 3.7 -15.9 Q 5.5 -20.2 9.1 -21.1 L 8.7 -16 Q 14 -16.7 16.6 -13.4 L 13.7 -11.2 L 17.2 -8.6 Q 13.6 -7.1 12.5 -4.9 Q 12.9 0.8 10.5 5.2 L 8.5 -0.3 Q 9.2 -6.8 5.6 -10.1 L 3.1 -7.1 L 1.1 -9.7 Q -2.4 -7.3 -4.4 -2.2 L -4.3 3.6 L -7.1 2 L -9.4 8.1 Z',
      colors: ['#ffe786', '#fbb632'], edge: '#9e4a21', zone: 'crown',
    },
    underneath: [],
    back: [
      { path: 'M -7.8 -11.6 C -16.6 -8.8 -13.2 1.8 -19 7.9 L -15.7 6.4 Q -18.3 12.4 -21.3 16.3 L -17.9 15.2 Q -19 22 -16 28 L -12.8 23.3 Q -10.7 29.2 -6.2 31.4 L -7.6 23 Q -2.6 26.9 0.4 28 Q -2.8 17.8 -2.7 7 Q -0.9 -4.6 -7.8 -11.6 Z', colors: ['#ffcf56', '#c73525'], gradient: [-10, -8, -10, 29], stops: [[0.54, '#ffc54b'], [0.75, '#f48225'], [0.83, '#e34b26']], edge: '#943c24', zone: 'mane' },
      { path: 'M 4 -10 Q 13 -9 13.6 1.4 Q 15.4 7.3 20.2 11.8 L 17.2 10.5 Q 20.7 17.1 19 24.8 L 14.8 22.3 L 14.9 29.8 Q 9.3 26 7.3 19 Q 4.1 12.7 4.5 4 Q 2 -4.3 4 -10 Z', colors: ['#ffe17b', '#d53b24'], gradient: [10, -6, 10, 27], stops: [[0.53, '#ffd25b'], [0.74, '#fa9a2a'], [0.85, '#ec5528']], edge: '#9d4324', zone: 'mane' },
      { path: 'M -8.1 -5.2 Q -11.5 2.6 -11.3 10.4 Q -11.8 18.1 -8.2 25.1 Q -14.5 18.8 -14 10.7 Q -12 0.9 -8.1 -5.2 Z', colors: ['#fff19a', '#f06a26'], gradient: [-10, -6, -10, 25], stops: [[0.63, '#ffd459']], zone: 'mane' },
      { path: 'M 8.2 -3.4 Q 9.1 6.5 14.2 15 Q 15.5 20.4 14.3 24 Q 9.7 16.9 8 10 Q 5.8 0.3 8.2 -3.4 Z', colors: ['#fff2aa', '#f78c2c'], gradient: [10, -4, 10, 24], stops: [[0.63, '#ffd865']], zone: 'mane' },
    ],
    backLines: [
      { paths: ['M -11 -3 Q -14.3 4.2 -15.3 8.5', 'M -12 10.2 Q -12.7 15.4 -10.9 20.6', 'M 10.4 5.2 Q 12.6 11.3 15.5 16.3'], color: '#a9512360', width: 0.46, zone: 'mane' },
      { paths: ['M -9.7 -1.2 Q -11.9 4.6 -12.6 7.8', 'M 9.5 3.3 Q 10.1 9.1 13 13'], color: '#fff5ae80', width: 0.48, zone: 'mane' },
    ],
    layers: [
      { path: 'M -17.9 -14.6 Q -14.4 -10.8 -11.1 -9.9 L -12.4 -7.8 Q -15 -10.9 -17.9 -14.6 Z', colors: ['#ee5b29', '#cb3325'], zone: 'crown', clip: true },
      { path: 'M -10.8 -19.8 L -10 -15 Q -7.2 -15.1 -5.5 -13.2 Q -6.6 -17.7 -10.8 -19.8 Z', colors: ['#ed5425', '#d23722'], zone: 'crown', clip: true },
      { path: 'M 0.3 -20.4 Q -1.8 -18.8 -2.1 -16.3 L 1 -15.1 Q 1.3 -17.5 0.3 -20.4 Z', colors: ['#ef652b', '#da3e24'], zone: 'crown', clip: true },
      { path: 'M 9.1 -21.1 Q 6.2 -20.4 4.9 -17.9 L 7.1 -16.6 L 8.7 -16 Z', colors: ['#eb4e27', '#cf3222'], zone: 'crown', clip: true },
      { path: 'M 12 -15.9 Q 13.4 -13.8 13.7 -11.2 L 16.6 -13.4 Q 14.5 -16.1 12 -15.9 Z', colors: ['#f37627', '#db3a21'], zone: 'crown', clip: true },
      { path: 'M -4.6 -15.7 Q -8.4 -10.6 -8 -5 Q -9.9 -2.1 -10.4 2.5 Q -12.7 -5.1 -10.1 -10 Q -8.3 -13.2 -4.6 -15.7 Z', colors: ['#fff0a8', '#ffc13e'], zone: 'crown', clip: true },
      { path: 'M 3 -15.9 Q 8.3 -15.1 11.7 -10.1 L 8.5 -8.5 Q 6.1 -12 3 -15.9 Z', colors: ['#fff2b1', '#ffcf59'], zone: 'crown', clip: true },
      { path: 'M 1.1 -12.7 Q -4.8 -9.3 -6.9 -4.6 Q -9.2 2.3 -6.8 12.8 L -3.5 16 Q -6.1 8.7 -2 0.9 L -2.5 4 Q 1.2 -2.2 1.6 -7.4 L 3.1 -7.1 Q 3.1 -10.6 1.1 -12.7 Z', colors: ['#ffec86', '#dd3e23'], gradient: [-3, -12, -3, 16], stops: [[0.6, '#ffd04c'], [0.82, '#f77e28']], edge: '#a85b27', zone: 'mane' },
      { path: 'M 5.6 -12 Q 12.7 -9 12.8 -0.8 Q 12.4 7.4 15.7 12.5 L 11.4 10.7 Q 9.6 5.8 9.7 2.6 Q 9.9 -3.9 7 -6.7 Q 4.7 -9.8 5.6 -12 Z', colors: ['#ffec95', '#de4323'], gradient: [10, -12, 10, 13], stops: [[0.63, '#ffd052'], [0.85, '#f57c27']], zone: 'mane' },
    ],
    lines: [
      { paths: ['M -7.5 -13.6 Q -9.7 -10.4 -10.1 -6.6', 'M 0.4 -17.4 L 0.9 -15', 'M 6 -17.9 L 5 -15.4', 'M 8.3 -13.4 L 10.3 -11.2'], color: '#ba77234f', width: 0.4, zone: 'crown', clip: true },
      { paths: ['M -0.9 -10.4 Q -5.4 -7.2 -5.9 -2.9', 'M -5.8 0 Q -6.2 5.7 -5.4 8.5', 'M 8.1 -9 Q 10.8 -6.4 10.6 -3.2'], color: '#fff6b69e', width: 0.48, zone: 'mane' },
    ],
    accessory: [],
    accessoryLines: [{ paths: ['M 1.7 -5 Q 4.7 -5.9 7.5 -3.7'], color: '#a46a288c', width: 0.7, zone: 'fixed' }],
  },
};

/** death cause & Bestiary names */
export const FOE_NAMES: Record<string, string> = {
  archer: 'ARCHER', helm: 'HELMETED ARCHER', heavy: 'GIANT ARCHER', shield: 'SHIELD KNIGHT', guard: 'FORT GUARD',
  rider: 'DRAGON RIDER', axer: 'MINI-BOSS', boss: 'BIG BOSS', bat: 'BAT', dragon: 'RED DRAGON', fort: 'WOODEN FORT',
};

const FOE_ID_NAMES: Record<string, string> = {
  archer: 'PEMANAH', helm: 'PEMANAH HELM', heavy: 'PEMANAH BERAT', shield: 'PEMBAWA PERISAI', guard: 'PENJAGA ISTANA',
  rider: 'PENUNGGANG NAGA', axer: 'MINI-BOS', boss: 'BOS BESAR', bat: 'KELELAWAR', dragon: 'NAGA MERAH', fort: 'ISTANA KAYU',
};

export const foeName = (k: string) => tx(FOE_NAMES[k] ?? k.toUpperCase(), FOE_ID_NAMES[k] ?? FOE_NAMES[k] ?? k);
