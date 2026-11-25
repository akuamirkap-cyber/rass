import { tx } from '../../i18n';
import { SKIN_PERKS, SKIN_RULES, SkinId } from './config';

export interface SkinRuntime {
  shots: Partial<Record<SkinId, number>>;
  levelShots: number;
  barrierCd: number;
  shadowReady: boolean;
}
export interface SkinShot {
  id: SkinId; speed: number; damage: number; gravity: number; head: number; limb: number; knock: number;
  pierce: number; proc: boolean; scale: number;
  burnDps: number; burnSeconds: number; headStun: number;
  chain: number; chainDamage: number; range: number; stun: number; blast: number; radius: number;
}
export interface SkinBurn { owner: SkinId; dps: number; left: number; accrued: number }
export interface SkinStatus { label: string; progress: number; ready: boolean }

export const newSkinRuntime = (): SkinRuntime => ({ shots: {}, levelShots: 0, barrierCd: 0, shadowReady: false });
export const nextSkinLevel = (state: SkinRuntime) => { state.levelShots = 0; };
export const tickSkinRuntime = (state: SkinRuntime, dt: number) => { state.barrierCd = Math.max(0, state.barrierCd - dt); };

/** Snapshot at release: changing equipment cannot retroactively change an arrow in flight. */
export function peekSkinShot(id: SkinId, state: SkinRuntime, pull: number, hpRatio: number): SkinShot {
  const { passive: p, signature: s } = SKIN_PERKS[id];
  const shot: SkinShot = {
    id, speed: 1 + (p.speed ?? 0), damage: 1 + (p.damage ?? 0), gravity: 1 - (p.gravity ?? 0),
    head: 1 + (p.headDamage ?? 0), limb: 1 + (p.limbDamage ?? 0), knock: 1 + (p.knockback ?? 0),
    pierce: 0, proc: false, scale: 1, burnDps: 0, burnSeconds: 0, headStun: 0,
    chain: 0, chainDamage: 0, range: 0, stun: 0, blast: 0, radius: 0,
  };
  if (s.kind === 'rage' && hpRatio <= s.below) { shot.damage += s.damage; shot.proc = true; }
  if (s.kind === 'charge' && pull >= s.pull) { shot.damage += s.damage; shot.speed += s.speed; shot.pierce = s.pierce; shot.proc = true; }
  if (s.kind === 'opening' && state.levelShots === 0) { shot.damage += s.damage; shot.proc = true; }
  if (s.kind === 'shadow' && state.shadowReady) { shot.damage += s.damage; shot.pierce = s.pierce; shot.proc = true; }
  if (s.kind === 'headShock') shot.headStun = s.stun;
  if (s.kind === 'cadence' && ((state.shots[id] ?? 0) + 1) % s.every === 0) {
    shot.proc = true; shot.damage += s.damage; shot.pierce = s.pierce;
    shot.burnDps = s.burnDps; shot.burnSeconds = s.burnSeconds;
    shot.chain = s.chain; shot.chainDamage = s.chainDamage; shot.range = s.range; shot.stun = s.stun;
  }
  if (s.kind === 'flame') { shot.burnDps = s.burnDps; shot.burnSeconds = s.burnSeconds; shot.blast = s.blast; shot.radius = s.radius; }
  return shot;
}

export function takeSkinShot(id: SkinId, state: SkinRuntime, pull: number, hpRatio: number): SkinShot {
  const shot = peekSkinShot(id, state, pull, hpRatio);
  state.shots[id] = (state.shots[id] ?? 0) + 1;
  state.levelShots++;
  if (SKIN_PERKS[id].signature.kind === 'shadow' && shot.proc) state.shadowReady = false;
  return shot;
}

export const skinReloadMult = (id: SkinId) => 1 + (SKIN_PERKS[id].passive.reload ?? 0);
export const skinIncomingMult = (id: SkinId, head = false) => (1 - (SKIN_PERKS[id].passive.reduction ?? 0)) * (head ? 1 - (SKIN_PERKS[id].passive.headGuard ?? 0) : 1);
export const skinHitMult = (shot: SkinShot | undefined, head: boolean, limb: boolean) => !shot ? 1 : head ? shot.head : limb ? shot.limb : 1;
export const skinKillGoldMult = (id?: SkinId) => 1 + (id ? SKIN_PERKS[id].passive.gold ?? 0 : 0);
export const skinHeadHeal = (id: SkinId | undefined, head: boolean) => id && head ? SKIN_PERKS[id].passive.headHeal ?? 0 : 0;

export function skinKill(state: SkinRuntime, owner?: SkinId) {
  if (owner && SKIN_PERKS[owner].signature.kind === 'shadow') state.shadowReady = true;
}
export function skinParry(owner?: SkinId) {
  const s = owner ? SKIN_PERKS[owner].signature : undefined;
  return s?.kind === 'parry' ? { heal: s.heal, gold: 1 + s.gold } : { heal: 0, gold: 1 };
}
export function consumeSkinBarrier(id: SkinId, state: SkinRuntime): boolean {
  const s = SKIN_PERKS[id].signature;
  if (s.kind !== 'barrier' || state.barrierCd > 0) return false;
  state.barrierCd = s.cooldown;
  return true;
}

/** Skin fire refreshes, never stacks with itself; bow elements keep their separate original timers. */
export function applySkinBurn(old: SkinBurn | undefined, shot: SkinShot): SkinBurn | undefined {
  if (!shot.burnDps) return old;
  const dps = shot.burnDps * shot.scale;
  if (old && old.left > 0 && old.dps > dps) return old;
  return { owner: shot.id, dps, left: shot.burnSeconds, accrued: old?.owner === shot.id && old.dps === dps ? old.accrued : 0 };
}
export function stepSkinBurn(burn: SkinBurn, dt: number): number {
  const elapsed = Math.min(Math.max(0, dt), burn.left);
  burn.left = Math.max(0, burn.left - elapsed);
  burn.accrued += elapsed;
  if (burn.accrued < SKIN_RULES.dotTick && burn.left > 0) return 0;
  const damage = burn.dps * burn.accrued;
  burn.accrued = 0;
  return Math.round(damage * SKIN_RULES.floatPrecision) / SKIN_RULES.floatPrecision;
}

const percent = (v: number) => `${Math.round(v * SKIN_RULES.percent)}%`;
export function skinPerkLines(id: SkinId): string[] {
  const { passive: p, signature: s } = SKIN_PERKS[id];
  const lines: string[] = [];
  if (p.speed) lines.push(tx(`ARROW SPEED +${percent(p.speed)}`, `KECEPATAN PANAH +${percent(p.speed)}`));
  if (p.reload) lines.push(tx(`RELOAD SPEED +${percent(p.reload)}`, `LAJU ISI PANAH +${percent(p.reload)}`));
  if (p.damage) lines.push(tx(`ARROW DAMAGE +${percent(p.damage)}`, `DAMAGE PANAH +${percent(p.damage)}`));
  if (p.reduction) lines.push(tx(`DAMAGE TAKEN -${percent(p.reduction)}`, `DAMAGE DITERIMA -${percent(p.reduction)}`));
  if (p.headGuard) lines.push(tx(`HEADSHOT DMG TAKEN -${percent(p.headGuard)}`, `DAMAGE KE KEPALA -${percent(p.headGuard)}`));
  if (p.knockback) lines.push(tx(`RAGDOLL KNOCKBACK +${percent(p.knockback)}`, `DORONGAN RAGDOLL +${percent(p.knockback)}`));
  if (p.gold) lines.push(tx(`GOLD PER KILL +${percent(p.gold)}`, `EMAS PER KILL +${percent(p.gold)}`));
  if (p.headHeal) lines.push(tx(`LETHAL HEADSHOT: +${p.headHeal} HP`, `HEADSHOT MEMATIKAN: +${p.headHeal} HP`));
  if (p.headDamage) lines.push(tx(`HEADSHOT DAMAGE +${percent(p.headDamage)}`, `DAMAGE HEADSHOT +${percent(p.headDamage)}`));
  if (p.limbDamage) lines.push(tx(`LIMB DAMAGE +${percent(p.limbDamage)}`, `DAMAGE LENGAN/KAKI +${percent(p.limbDamage)}`));
  if (p.gravity) lines.push(tx(`ARROW GRAVITY -${percent(p.gravity)}`, `GRAVITASI PANAH -${percent(p.gravity)}`));
  if (s.kind === 'rage') lines.push(tx(`HP <=${percent(s.below)}: BONUS DAMAGE +${percent(s.damage)}`, `HP <=${percent(s.below)}: TAMBAHAN DAMAGE +${percent(s.damage)}`));
  if (s.kind === 'charge') {
    const effects = [
      s.damage && tx(`DAMAGE +${percent(s.damage)}`, `DAMAGE +${percent(s.damage)}`),
      s.speed && tx(`SPEED +${percent(s.speed)}`, `LAJU +${percent(s.speed)}`),
      s.pierce && tx(`PIERCE ${s.pierce}`, `TEMBUS ${s.pierce}`),
    ].filter(Boolean);
    lines.push(tx(`DRAW >=${percent(s.pull)}: ${effects.join(' / ')}`, `TARIKAN >=${percent(s.pull)}: ${effects.join(' / ')}`));
  }
  if (s.kind === 'parry') lines.push(tx(`PARRY BOSS WEAPON: +${s.heal} HP, GOLD +${percent(s.gold)}`, `TANGKIS SENJATA BOS: +${s.heal} HP, EMAS +${percent(s.gold)}`));
  if (s.kind === 'opening') lines.push(tx(`FIRST SHOT EACH LEVEL: DAMAGE +${percent(s.damage)}`, `TEMBAKAN PERTAMA TIAP LEVEL: DAMAGE +${percent(s.damage)}`));
  if (s.kind === 'barrier') lines.push(tx(`AUTO BLOCK HIT / COOLDOWN ${s.cooldown}S`, `BLOK SERANGAN OTOMATIS / COOLDOWN ${s.cooldown} DTK`));
  if (s.kind === 'headShock') lines.push(tx(`HEADSHOT: STUN ${s.stun}S`, `HEADSHOT: SETRUM ${s.stun} DTK`));
  if (s.kind === 'shadow') lines.push(tx(`AFTER KILL: NEXT SHOT +${percent(s.damage)} DAMAGE & PIERCE ${s.pierce}`, `SETELAH KILL: TEMBAKAN BERIKUTNYA +${percent(s.damage)} DAMAGE & TEMBUS ${s.pierce}`));
  if (s.kind === 'cadence') {
    const effects = [
      s.damage && tx(`DAMAGE +${percent(s.damage)}`, `DAMAGE +${percent(s.damage)}`),
      s.pierce && tx(`PIERCE ${s.pierce}`, `TEMBUS ${s.pierce}`),
      s.burnDps && tx(`BURN ${s.burnDps} HP/S FOR ${s.burnSeconds}S`, `BAKAR ${s.burnDps} HP/DTK SELAMA ${s.burnSeconds} DTK`),
      s.chain && tx(`CHAIN ${s.chain} FOE, ${percent(s.chainDamage)} DAMAGE + STUN ${s.stun}S`, `SAMBAR ${s.chain} MUSUH, ${percent(s.chainDamage)} DAMAGE + SETRUM ${s.stun} DTK`),
    ].filter(Boolean);
    lines.push(tx(`EVERY ${s.every} SHOTS: ${effects.join(' / ')}`, `TIAP TEMBAKAN KE-${s.every}: ${effects.join(' / ')}`));
  }
  if (s.kind === 'flame') {
    lines.push(tx(`BURN FOES ${s.burnDps} HP/S FOR ${s.burnSeconds}S`, `BAKAR MUSUH ${s.burnDps} HP/DTK SELAMA ${s.burnSeconds} DTK`));
    lines.push(tx(`HEADSHOT: BLAST ${percent(s.blast)} ARROW DMG / RADIUS ${s.radius}`, `HEADSHOT: LEDAKAN ${percent(s.blast)} DAMAGE PANAH / RADIUS ${s.radius}`));
  }
  return lines;
}

export function skinStatus(id: SkinId, state: SkinRuntime, pull: number, hpRatio: number): SkinStatus {
  const s = SKIN_PERKS[id].signature;
  if (s.kind === 'barrier') return { label: state.barrierCd > 0 ? tx(`${Math.ceil(state.barrierCd)}S`, `${Math.ceil(state.barrierCd)} DTK`) : tx('BARRIER READY', 'PENGHALANG SIAP'), progress: 1 - state.barrierCd / s.cooldown, ready: state.barrierCd <= 0 };
  if (s.kind === 'cadence') {
    const n = (state.shots[id] ?? 0) % s.every;
    return { label: n === s.every - 1 ? tx('SPECIAL SHOT READY', 'TEMBAKAN SPESIAL SIAP') : tx(`${n}/${s.every} SHOTS`, `${n}/${s.every} TEMBAKAN`), progress: n / (s.every - 1), ready: n === s.every - 1 };
  }
  if (s.kind === 'charge') return { label: pull >= s.pull ? tx('FULL DRAW', 'TARIKAN PENUH') : tx(`DRAW >=${percent(s.pull)}`, `TARIK >=${percent(s.pull)}`), progress: Math.min(1, pull / s.pull), ready: pull >= s.pull };
  if (s.kind === 'opening') return { label: state.levelShots === 0 ? tx('OPENER READY', 'PEMBUKA SIAP') : tx('OPENER SPENT', 'PEMBUKA TERPAKAI'), progress: state.levelShots === 0 ? 1 : 0, ready: state.levelShots === 0 };
  if (s.kind === 'shadow') return { label: state.shadowReady ? tx('ARISE READY', 'ARISE SIAP') : tx('KILL TO ARISE', 'KILL UNTUK ARISE'), progress: state.shadowReady ? 1 : 0, ready: state.shadowReady };
  if (s.kind === 'rage') return { label: hpRatio <= s.below ? tx('BERSERKER ACTIVE', 'BERSERKER AKTIF') : tx(`ACTIVE AT HP <=${percent(s.below)}`, `AKTIF DI HP <=${percent(s.below)}`), progress: hpRatio <= s.below ? 1 : 0, ready: hpRatio <= s.below };
  return { label: tx('PASSIVE ACTIVE', 'PASIF AKTIF'), progress: 1, ready: true };
}