// Pure card & run logic: 3-card offer drafting, upgrades, rerolls, synergies, damage/gold/HP multipliers, PATH cards.
import { tx } from '../../i18n';
import { CARDS, CFG, CardDef, CardId, CardType, OFFER, SYNERGIES, SkillBranch, TrainingBonuses, synergyName } from './config';

export type RouteId = 'aman' | 'risiko';
export interface RunState {
  cards: Partial<Record<CardId, number>>;
  freeRerolls: number; paidRerolls: number; rerolls: number;
  reviveUsed: boolean; shieldCd: number; slowCd: number; slowT: number; gandaLeft: number;
  hunterStacks: number; headStreak: number;
  synergies: string[]; picked: string[]; rejected: string[]; unlocks: string[];
  goldEarned: number; metaGain: number; startedAt: number; index: number; ended: boolean;
  route: RouteId; lastChest: boolean; bossPending: number; killedBy: string;
  daily: string; mod: string;
  /** sortir: berapa set berturut-turut tiap jenis tidak muncul, dan set terakhir yang ditawarkan */
  typeMiss: Partial<Record<CardType, number>>; lastOffer: CardId[];
}

export function newRunState(freeRerolls: number): RunState {
  return {
    cards: {}, freeRerolls, paidRerolls: 0, rerolls: 0,
    reviveUsed: false, shieldCd: 0, slowCd: 0, slowT: 0, gandaLeft: 0,
    hunterStacks: 0, headStreak: 0,
    synergies: [], picked: [], rejected: [], unlocks: [],
    goldEarned: 0, metaGain: 0, startedAt: 0, index: 0, ended: false,
    route: 'aman', lastChest: false, bossPending: 0, killedBy: tx('UNKNOWN', 'TIDAK DIKETAHUI'),
    daily: '', mod: '',
    typeMiss: {}, lastOffer: [],
  };
}

export const CARD_BY = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, CardDef>;
export const cardLv = (r: RunState, id: CardId) => r.cards[id] ?? 0;

export interface OfferContext {
  /** kartu yang baru saja di-reroll: tidak muncul lagi selama masih ada pengganti */
  avoid?: CardId[];
  /** pengali RESONANSI per cabang skill tree (1 = tidak ada) */
  resonance?: Partial<Record<SkillBranch, number>>;
  /** HP sekarang / HP maks */
  hpRatio?: number;
}

/** kartu ini langsung menyalakan sinergi baru (pasangannya sudah dimiliki) */
export const completesSynergy = (r: RunState, id: CardId) =>
  cardLv(r, id) === 0 && SYNERGIES.some((s) => s.need.includes(id) && s.need.some((o) => o !== id && cardLv(r, o) > 0));

/** bobot "seru": upgrade, sinergi & resonansi naik; kartu yang barusan muncul & jebakan saat HP kritis turun */
export function cardWeight(c: CardDef, r: RunState, ctx: OfferContext = {}): number {
  let w = 1;
  if (cardLv(r, c.id) > 0) w *= OFFER.upgrade;
  if (completesSynergy(r, c.id)) w *= OFFER.synergy;
  if (c.path && (ctx.resonance?.[c.path] ?? 1) > 1) w *= OFFER.resonance;
  if ((ctx.hpRatio ?? 1) < OFFER.lowHpRatio && OFFER.hpCost.includes(c.id)) w *= OFFER.lowHp;
  if (r.lastOffer.includes(c.id)) w *= OFFER.recent;
  return w;
}

function pickWeighted<T>(rng: () => number, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) { roll -= weights[i]; if (roll < 0) return items[i]; }
  return items[items.length - 1];
}

/**
 * Sortir set 3 kartu — adil & seru:
 * 1. hanya kartu sah: bukan KHUSUS (PANAH GANDA), sudah terbuka, belum level maks;
 * 2. 3 JENIS BERBEDA; jenis yang terlewat makin besar peluangnya dan DIPAKSA muncul setelah `pityForce` set;
 * 3. satu kartu per jenis, berbobot (upgrade · sinergi · resonansi naik; kartu yang barusan muncul turun);
 * 4. reroll tidak pernah menampilkan kartu yang sama selama masih ada pengganti;
 * 5. urutan tampil selalu PANAH → BERTAHAN → JALUR → RISIKO.
 */
export function rollOffer(rng: () => number, r: RunState, unlocked: (id: CardId) => boolean, ctx: OfferContext = {}): CardId[] {
  const pool = CARDS.filter((c) => c.type !== 'KHUSUS' && unlocked(c.id) && cardLv(r, c.id) < c.maxLv);
  const avoid = new Set(ctx.avoid ?? []);
  const fresh = (list: CardDef[]) => { const f = list.filter((c) => !avoid.has(c.id)); return f.length ? f : list; };
  const types = OFFER.order.filter((t) => pool.some((c) => c.type === t));
  const slots = Math.min(3, types.length);
  const chosen = types.filter((t) => (r.typeMiss[t] ?? 0) >= OFFER.pityForce).slice(0, slots);
  while (chosen.length < slots) {
    const left = types.filter((t) => !chosen.includes(t));
    chosen.push(pickWeighted(rng, left, left.map((t) => OFFER.typeWeight[t] * (1 + OFFER.pityStep * (r.typeMiss[t] ?? 0)))));
  }
  const out: CardDef[] = [];
  for (const t of chosen) {
    const list = fresh(pool.filter((c) => c.type === t));
    out.push(pickWeighted(rng, list, list.map((c) => cardWeight(c, r, ctx))));
  }
  while (out.length < 3) { // fewer than 3 types left: top up with any other legal card
    const rest = fresh(pool.filter((c) => !out.includes(c)));
    if (!rest.length) break;
    out.push(pickWeighted(rng, rest, rest.map((c) => cardWeight(c, r, ctx))));
  }
  out.sort((a, b) => OFFER.order.indexOf(a.type) - OFFER.order.indexOf(b.type));
  for (const t of OFFER.order) r.typeMiss[t] = out.some((c) => c.type === t) ? 0 : (r.typeMiss[t] ?? 0) + 1;
  r.lastOffer = out.map((c) => c.id);
  return r.lastOffer.slice();
}

/** pick card (increment level up to max); return newly activated synergy names */
export function takeCard(r: RunState, id: CardId): string[] {
  const def = CARD_BY[id];
  r.cards[id] = Math.min(def.maxLv, cardLv(r, id) + 1);
  if (id === 'ganda') r.gandaLeft = gandaShots(r);
  const fresh = activeSynergies(r.cards).filter((s) => !r.synergies.includes(s.id));
  for (const s of fresh) r.synergies.push(s.id);
  return fresh.map((s) => synergyName(s));
}

export const activeSynergies = (cards: Partial<Record<CardId, number>>) =>
  SYNERGIES.filter((s) => s.need.every((id) => (cards[id] ?? 0) > 0));
export const hasSyn = (r: RunState, id: string) => r.synergies.includes(id);

/** biaya reroll berikutnya: 0 selama masih ada jatah gratis */
export function rerollCost(r: RunState): number {
  if (r.freeRerolls > 0) return 0;
  const c = CFG.reroll.costs;
  return c[Math.min(r.paidRerolls, c.length - 1)];
}
export function useReroll(r: RunState): number {
  const cost = rerollCost(r);
  if (r.freeRerolls > 0) r.freeRerolls--; else r.paidRerolls++;
  r.rerolls++;
  return cost;
}

/** nilai per-level dari tabel config (lv 1-based, 0 = tidak punya) */
export const lvVal = (arr: number[], lv: number) => (lv > 0 ? arr[Math.min(lv, arr.length) - 1] : 0);

/** bonus kartu JALUR selama run (keluarga stat skill tree), sudah termasuk RESONANSI cabangnya */
export function cardBonuses(r: RunState, res?: Partial<Record<SkillBranch, number>>): Partial<TrainingBonuses> {
  const C = CFG.cards;
  const v = (id: CardId, arr: number[]) => lvVal(arr, cardLv(r, id)) * (res?.[CARD_BY[id].path ?? 'legend'] ?? 1);
  return {
    arrowSpeed: v('j_lesat', C.j_lesat.speed),
    drawSpeed: v('j_tarik', C.j_tarik.draw), reloadSpeed: v('j_tarik', C.j_tarik.reload),
    stability: v('j_fokus', C.j_fokus.stability), guideDots: Math.round(v('j_fokus', C.j_fokus.dots)),
    headGold: Math.round(v('j_incar', C.j_incar.gold)),
    dmgReduce: v('j_zirah', C.j_zirah.reduce),
    hpBonus: v('j_jantung', C.j_jantung.hp),
  };
}
/** skill tree + kartu JALUR; damage diterima tidak pernah turun lebih dari 60% */
export function mergeTraining(base: TrainingBonuses, extra: Partial<TrainingBonuses>): TrainingBonuses {
  const out = { ...base };
  for (const [k, val] of Object.entries(extra) as [keyof TrainingBonuses, number][]) out[k] = (out[k] ?? 0) + (val ?? 0);
  out.dmgReduce = Math.min(0.6, out.dmgReduce);
  return out;
}

export function playerMaxHp(r: RunState, metaHpLv: number, extraMetaHp = 0): number {
  const base = CFG.player.baseHp * (1 + CFG.meta.hpPerLv * Math.min(metaHpLv, CFG.meta.hpMaxLv) + extraMetaHp);
  return Math.max(1, Math.round(base * (1 - lvVal(CFG.cards.pedang.hp, cardLv(r, 'pedang')))));
}
export const playerDmgMult = (r: RunState) => 1 + lvVal(CFG.cards.pedang.dmg, cardLv(r, 'pedang'));
export function hunterMult(r: RunState): number {
  const lv = cardLv(r, 'pemburu');
  if (!lv) return 1;
  return Math.min(lvVal(CFG.cards.pemburu.max, lv), 1 + lvVal(CFG.cards.pemburu.step, lv) * r.hunterStacks);
}
export const gandaShots = (r: RunState) => lvVal(CFG.cards.ganda.shots, cardLv(r, 'ganda'));

/** pengali level dari rute + kartu risiko + modifier harian + skala L15+ */
export function levelMods(r: RunState, modHp: number, lateHp: number, lateDmg: number) {
  const risk = r.route === 'risiko'; const R = CFG.route.risk; const k = cardLv(r, 'kontrak');
  return {
    hp: (risk ? R.hp : 1) * (1 + lvVal(CFG.cards.kontrak.hp, k)) * modHp * lateHp,
    dmg: (risk ? R.dmg : 1) * lateDmg,
    gold: (risk ? R.gold : 1) * (k ? lvVal(CFG.cards.kontrak.gold, k) : 1),
  };
}

const pc = (x: number) => Math.round(x * 100);
/** Card effect description at lv (1-based) for cards & hold details. `res` = PATH card resonance */
export function cardText(id: CardId, lv: number, res = 1): string {
  const C = CFG.cards; const v = (a: number[]) => lvVal(a, lv); const x = (a: number[]) => v(a) * res;
  switch (id) {
    case 'ledak': return tx(`EXPLOSIVE HEADSHOT: ${pc(v(C.ledak.pct))}% AOE DMG · RADIUS ${v(C.ledak.radius)}`, `HEADSHOT MELEDAK: ${pc(v(C.ledak.pct))}% DMG AREA · RADIUS ${v(C.ledak.radius)}`);
    case 'petir': return tx(`CHAINS TO ${v(C.petir.jumps)} FOES · ${pc(v(C.petir.pct))}% DMG`, `SETRUM MENYAMBAR ${v(C.petir.jumps)} MUSUH · ${pc(v(C.petir.pct))}% DMG`);
    case 'paku': return tx(`NAILS TARGET · STUN ${v(C.paku.stun)}S`, `MEMAKU MUSUH · STUN ${v(C.paku.stun)} DTK`);
    case 'tameng': return tx(`BOUNCES OFF SHIELDS · ${pc(v(C.tameng.pct))}% DMG`, `PANAH MEMANTUL DARI TAMENG · ${pc(v(C.tameng.pct))}% DMG`);
    case 'tembus': return tx(`PIERCES ${v(C.tembus.pierce)} FOES · -${pc(C.tembus.falloff)}% DMG/PIERCE`, `TEMBUS ${v(C.tembus.pierce)} MUSUH · -${pc(C.tembus.falloff)}% DMG/TEMBUSAN`);
    case 'pemburu': return tx(`HEADSHOT STREAK +${pc(v(C.pemburu.step))}% GOLD & DMG · MAX x${v(C.pemburu.max)}`, `HEADSHOT BERUNTUN +${pc(v(C.pemburu.step))}% EMAS & DMG · MAKS x${v(C.pemburu.max)}`);
    case 'lifesteal': return tx(`+${v(C.lifesteal.hp)} HP PER KILL`, `+${v(C.lifesteal.hp)} HP TIAP KILL`);
    case 'perisai': return tx(`BLOCK 1 HIT · CD ${v(C.perisai.cd)}S`, `BLOK 1 SERANGAN · CD ${v(C.perisai.cd)} DTK`);
    case 'nyawa2': return tx(`ONCE PER RUN: REVIVE AT ${pc(v(C.nyawa2.pct))}% HP`, `SEKALI PER RUN: HIDUP LAGI ${pc(v(C.nyawa2.pct))}% HP`);
    case 'lambat': return tx(`SKILL [Q]: SLOW-MO ${C.lambat.dur}S · CD ${v(C.lambat.cd)}S`, `SKILL [Q]: SLOW-MO ${C.lambat.dur} DTK · CD ${v(C.lambat.cd)} DTK`);
    case 'pedang': return tx(`DAMAGE +${pc(v(C.pedang.dmg))}% · MAX HP -${pc(v(C.pedang.hp))}%`, `DAMAGE +${pc(v(C.pedang.dmg))}% · MAX HP -${pc(v(C.pedang.hp))}%`);
    case 'kontrak': return tx(`GOLD x${v(C.kontrak.gold)} · FOE HP +${pc(v(C.kontrak.hp))}%`, `EMAS x${v(C.kontrak.gold)} · HP MUSUH +${pc(v(C.kontrak.hp))}%`);
    case 'ganda': return tx(`${C.ganda.arrows} ARROWS @${pc(C.ganda.pct)}% · ${v(C.ganda.shots)} SHOTS/LEVEL`, `${C.ganda.arrows} PANAH @${pc(C.ganda.pct)}% · ${v(C.ganda.shots)} TEMBAKAN/LEVEL`);
    case 'j_lesat': return tx(`ARROW SPEED +${pc(x(C.j_lesat.speed))}% THIS RUN`, `KECEPATAN PANAH +${pc(x(C.j_lesat.speed))}% SELAMA RUN`);
    case 'j_tarik': return tx(`DRAW & RELOAD +${pc(x(C.j_tarik.draw))}% THIS RUN`, `TARIKAN & ISI PANAH +${pc(x(C.j_tarik.draw))}% SELAMA RUN`);
    case 'j_fokus': return tx(`DEVIATION -${pc(x(C.j_fokus.stability))}% · +${Math.round(x(C.j_fokus.dots))} AIM DOTS`, `DEVIASI -${pc(x(C.j_fokus.stability))}% · +${Math.round(x(C.j_fokus.dots))} TITIK LINTASAN`);
    case 'j_incar': return tx(`+${Math.round(x(C.j_incar.gold))} GOLD PER HEADSHOT`, `+${Math.round(x(C.j_incar.gold))} EMAS TIAP HEADSHOT`);
    case 'j_zirah': return tx(`DAMAGE TAKEN -${pc(x(C.j_zirah.reduce))}% THIS RUN`, `DAMAGE DITERIMA -${pc(x(C.j_zirah.reduce))}% SELAMA RUN`);
    case 'j_jantung': return tx(`MAX HP +${pc(x(C.j_jantung.hp))}% · HEALS INSTANTLY`, `MAX HP +${pc(x(C.j_jantung.hp))}% · LANGSUNG TERISI`);
  }
}
