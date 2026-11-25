import { tx } from '../../i18n';
import { RESONANCE, SKILL_NODES, SKILL_RULES, SkillBranch, SkillId, SkillNodeDef, TrainingBonuses } from './config';

export type SkillLevels = Partial<Record<SkillId, number>>;
export interface SkillSource { tree?: SkillLevels; up?: { hp: number; reroll: number } }
export interface SkillWallet extends SkillSource { coins: number }
export type SkillState = 'locked' | 'available' | 'poor' | 'mastered';
export const SKILL_BY = Object.fromEntries(SKILL_NODES.map((n) => [n.id, n])) as Record<SkillId, SkillNodeDef>;

const rankNumber = (raw: unknown, max: number) => typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(0, Math.floor(raw))) : 0;

export function skillRank(source: SkillSource, id: SkillId): number {
  const node = SKILL_BY[id];
  const legacy = id === 'vitality' ? source.up?.hp : id === 'reroll' ? source.up?.reroll : 0;
  return Math.max(rankNumber(source.tree?.[id], node.maxLv), rankNumber(legacy, node.maxLv));
}

/** Old HP/reroll purchases migrate without charging coins or granting new combat upgrades. */
export function normalizeSkillTree(raw: unknown, legacy?: { hp?: unknown; reroll?: unknown }): SkillLevels {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const levels: SkillLevels = {};
  for (const node of SKILL_NODES) {
    const old = node.id === 'vitality' ? legacy?.hp : node.id === 'reroll' ? legacy?.reroll : 0;
    const rank = Math.max(rankNumber(input[node.id], node.maxLv), rankNumber(old, node.maxLv));
    if (rank) levels[node.id] = rank;
  }
  // Definitions are ordered root-first; corrupt descendants cannot bypass prerequisites.
  for (const node of SKILL_NODES) if (node.requires.some((r) => (levels[r.id] ?? 0) < r.level)) delete levels[node.id];
  return levels;
}

export const skillCost = (source: SkillSource, id: SkillId): number | null => {
  const n = SKILL_BY[id]; const rank = skillRank(source, id);
  return rank >= n.maxLv ? null : n.costs[rank];
};
/** harga lama sebelum diskon (hanya untuk tampilan harga coret) */
export const skillListCost = (source: SkillSource, id: SkillId): number | null => {
  const n = SKILL_BY[id]; const rank = skillRank(source, id);
  return rank >= n.maxLv ? null : n.listCosts[rank] ?? null;
};
export const skillRequirements = (source: SkillSource, id: SkillId) => SKILL_BY[id].requires.map((r) => ({ ...r, current: skillRank(source, r.id), met: skillRank(source, r.id) >= r.level }));

export function skillState(source: SkillWallet, id: SkillId): SkillState {
  if (skillRank(source, id) >= SKILL_BY[id].maxLv) return 'mastered';
  if (skillRequirements(source, id).some((r) => !r.met)) return 'locked';
  const cost = skillCost(source, id)!;
  return Number.isFinite(source.coins) && source.coins >= cost ? 'available' : 'poor';
}

export function purchaseSkill(source: SkillWallet, id: SkillId): boolean {
  if (!Object.prototype.hasOwnProperty.call(SKILL_BY, id)) return false;
  const normalized = normalizeSkillTree(source.tree, source.up);
  const view = { ...source, tree: normalized };
  if (skillState(view, id) !== 'available') return false;
  const cost = skillCost(view, id)!;
  source.coins -= cost;
  source.tree = { ...normalized, [id]: skillRank(view, id) + 1 };
  source.up = { hp: source.tree.vitality ?? 0, reroll: source.tree.reroll ?? 0 };
  return true;
}

export function trainingBonuses(source: SkillSource): TrainingBonuses {
  const levels = normalizeSkillTree(source.tree, source.up);
  const result: TrainingBonuses = { arrowSpeed: 0, reloadSpeed: 0, drawSpeed: 0, stability: 0, spreadReduction: 0, guideDots: 0, hpBonus: 0, clearHeal: 0, freeRerolls: 0, dmgReduce: 0, startGold: 0, headGold: 0 };
  for (const node of SKILL_NODES) {
    const rank = levels[node.id] ?? 0;
    for (const [key, amount] of Object.entries(node.effects) as [keyof TrainingBonuses, number][]) result[key] += amount * rank;
  }
  for (const key of Object.keys(result) as (keyof TrainingBonuses)[]) result[key] = Math.round(result[key] * SKILL_RULES.precision) / SKILL_RULES.precision;
  return result;
}

/** Reduce physical release error, without searching for enemies or redirecting toward a target. */
export function steadyRelease(actual: number, intended: number, stability: number): number {
  const delta = Math.atan2(Math.sin(intended - actual), Math.cos(intended - actual));
  return actual + delta * Math.max(0, Math.min(1, stability));
}
export const trainedArrowSpeed = (base: number, bonuses: TrainingBonuses) => base * (1 + bonuses.arrowSpeed);
export const trainedSpread = (base: number, bonuses: TrainingBonuses) => base * (1 - bonuses.spreadReduction);
export const trainedGuideDots = (bonuses: TrainingBonuses) => SKILL_RULES.baseGuideDots + bonuses.guideDots;

export function skillProgress(source: SkillSource, branch?: SkillBranch) {
  const nodes = SKILL_NODES.filter((n) => !branch || n.branch === branch);
  return { current: nodes.reduce((n, node) => n + skillRank(source, node.id), 0), max: nodes.reduce((n, node) => n + node.maxLv, 0) };
}

/** RESONANSI per cabang (dipotret saat run dimulai): kartu JALUR dari cabang yang kuat jadi lebih kuat */
export function branchResonance(source: SkillSource): Record<SkillBranch, number> {
  const out: Record<SkillBranch, number> = { speed: 1, accuracy: 1, vitality: 1, legend: 1 };
  for (const b of ['speed', 'accuracy', 'vitality'] as SkillBranch[]) {
    const p = skillProgress(source, b); const k = p.max ? p.current / p.max : 0;
    out[b] = k >= 1 ? RESONANCE.full : k >= 0.5 ? RESONANCE.half : 1;
  }
  return out;
}

export const SKILL_EFFECT_NAMES: Record<keyof TrainingBonuses, string> = {
  arrowSpeed: 'ARROW SPEED', reloadSpeed: 'RELOAD SPEED', drawSpeed: 'DRAW SPEED',
  stability: 'RELEASE DEVIATION', spreadReduction: 'DOUBLE ARROW SPREAD', guideDots: 'AIM GUIDE DOTS',
  hpBonus: 'MAX HEALTH', clearHeal: 'POST-LEVEL HEAL', freeRerolls: 'FREE REROLLS / RUN',
  dmgReduce: 'DAMAGE TAKEN', startGold: 'STARTING GOLD', headGold: 'GOLD / HEADSHOT',
};
const SKILL_EFFECT_ID_NAMES: Record<keyof TrainingBonuses, string> = {
  arrowSpeed: 'KECEPATAN PANAH', reloadSpeed: 'LAJU ISI PANAH', drawSpeed: 'LAJU TARIKAN',
  stability: 'DEVIASI PELEPASAN', spreadReduction: 'SEBARAN PANAH GANDA', guideDots: 'TITIK LINTASAN',
  hpBonus: 'NYAWA MAKSIMAL', clearHeal: 'HP SETELAH LEVEL', freeRerolls: 'REROLL GRATIS / RUN',
  dmgReduce: 'DAMAGE DITERIMA', startGold: 'EMAS AWAL RUN', headGold: 'EMAS / HEADSHOT',
};
export const skillEffectName = (k: keyof TrainingBonuses) => tx(SKILL_EFFECT_NAMES[k], SKILL_EFFECT_ID_NAMES[k]);
export function formatSkillEffect(key: keyof TrainingBonuses, amount: number): string {
  if (key === 'guideDots' || key === 'clearHeal' || key === 'freeRerolls' || key === 'startGold' || key === 'headGold') return `+${amount}`;
  if (!amount) return '0%';
  const sign = key === 'stability' || key === 'spreadReduction' || key === 'dmgReduce' ? '-' : '+';
  return `${sign}${Math.round(amount * SKILL_RULES.percent)}%`;
}