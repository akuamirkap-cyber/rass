// Meta progression: local save, achievements/unlocks, skill tree meta, telemetry CSV, and daily challenge.
import { tx } from '../../i18n';
import { CARDS, CFG, COSMETICS, CardId, StatKey, UNLOCKS, UnlockDef, unlockLabel, unlockName } from './config';
import { SkillLevels, normalizeSkillTree } from './progression';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem?(k: string): void }
const memKV = (): KV => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };
let fallback: KV | null = null;
export function defaultKV(): KV {
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* diblokir */ }
  return (fallback ??= memKV());
}
export const META_KEY = 'perfectshot.ragdoll.meta.v1';
export const LOG_KEY = 'perfectshot.ragdoll.telemetry.v1';

export type Stats = Record<StatKey, number>;
export interface Settings { shake: number; slowmo: boolean; dmgNum: boolean; zoom: boolean; trail: boolean; thunk: boolean; debug: boolean }
export interface DailyEntry { date: string; mod: string; score: number; level: number; kills: number; at: number }
export interface MetaSave {
  v: 1; coins: number; stats: Stats; unlocked: string[]; up: { hp: number; reroll: number };
  tree: SkillLevels;
  seen: string[]; killsBy: Record<string, number>; diedTo: Record<string, number>;
  settings: Settings; cos: { band: string; trail: string }; daily: DailyEntry[]; runIndex: number;
}

const STAT_KEYS: StatKey[] = ['runs', 'deaths', 'kills', 'headshots', 'bestStreak', 'hostages', 'forts', 'dragonMouth', 'bestLevel', 'bigBossKills', 'shieldsBroken', 'coinsEarned', 'playSec'];
export function newMeta(): MetaSave {
  return {
    v: 1, coins: 0, stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Stats, unlocked: [], up: { hp: 0, reroll: 0 },
    tree: {},
    seen: [], killsBy: {}, diedTo: {},
    settings: { shake: 1, slowmo: true, dmgNum: true, zoom: true, trail: true, thunk: true, debug: false },
    cos: { band: 'merah', trail: 'putih' }, daily: [], runIndex: 0,
  };
}

/** baca save; data rusak/hilang → default (field yang hilang diisi default) */
export function loadMeta(kv: KV = defaultKV()): MetaSave {
  const d = newMeta();
  try {
    const raw = JSON.parse(kv.getItem(META_KEY) ?? 'null') as Partial<MetaSave> | null;
    if (!raw || typeof raw !== 'object') return d;
    const tree = normalizeSkillTree(raw.tree, raw.up);
    return {
      ...d, ...raw, v: 1,
      coins: typeof raw.coins === 'number' && Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins)) : d.coins,
      stats: { ...d.stats, ...(raw.stats ?? {}) }, tree,
      up: { hp: tree.vitality ?? 0, reroll: tree.reroll ?? 0 },
      settings: { ...d.settings, ...(raw.settings ?? {}) }, cos: { ...d.cos, ...(raw.cos ?? {}) },
      unlocked: Array.isArray(raw.unlocked) ? raw.unlocked : [], seen: Array.isArray(raw.seen) ? raw.seen : [],
      daily: Array.isArray(raw.daily) ? raw.daily : [], killsBy: raw.killsBy ?? {}, diedTo: raw.diedTo ?? {},
    };
  } catch { return d; }
}
export function saveMeta(m: MetaSave, kv: KV = defaultKV()) { try { kv.setItem(META_KEY, JSON.stringify(m)); } catch { /* penuh/diblokir */ } }

export const isUnlocked = (m: MetaSave, id: string) => !id || m.unlocked.includes(id);
export const bowUnlocked = (m: MetaSave, bow: string) => bow === 'wood' || isUnlocked(m, `bow:${bow}`);
export const cardUnlocked = (m: MetaSave, id: CardId) => !CARDS.find((c) => c.id === id)?.locked || isUnlocked(m, `card:${id}`);
export const hatUnlocked = (m: MetaSave, hat: string) => isUnlocked(m, COSMETICS.lockedHats[hat] ?? '');
export const unlockOf = (id: string) => UNLOCKS.find((u) => u.id === id);

/** cek semua pencapaian; yang baru tercapai langsung ditandai terbuka. Kembalikan daftar baru */
export function evaluateUnlocks(m: MetaSave): UnlockDef[] {
  const fresh = UNLOCKS.filter((u) => !m.unlocked.includes(u.id) && m.stats[u.stat] >= u.need);
  for (const u of fresh) m.unlocked.push(u.id);
  return fresh;
}

/** beli unlock kartu dengan koin meta (busur & kosmetik tidak bisa dibeli) */
export function buyUnlock(m: MetaSave, id: string): boolean {
  const u = unlockOf(id);
  if (!u || u.cost === undefined || m.unlocked.includes(id) || m.coins < u.cost) return false;
  m.coins -= u.cost; m.unlocked.push(id);
  return true;
}

/** Nearest unlock progress for death screen bar, e.g. "40 MORE COINS: GOLDEN MIDAS" */
export function nextUnlock(m: MetaSave): { text: string; pct: number } | null {
  let best: { text: string; pct: number } | null = null;
  for (const u of UNLOCKS) {
    if (m.unlocked.includes(u.id)) continue;
    const val = m.stats[u.stat]; const left = Math.max(0, u.need - val);
    const uname = unlockName(u);
    const ulabel = unlockLabel(u);
    const cand = [{
      pct: Math.min(1, val / u.need),
      text: u.stat === 'coinsEarned'
        ? tx(`${left} MORE COINS: ${uname}`, `${left} KOIN LAGI: ${uname}`)
        : `${ulabel} (${Math.min(val, u.need)}/${u.need}): ${uname}`,
    }];
    if (u.cost !== undefined) {
      const mLeft = Math.max(0, u.cost - m.coins);
      cand.push({
        pct: Math.min(1, m.coins / u.cost),
        text: tx(`${mLeft} MORE META COINS: ${uname}`, `${mLeft} KOIN META LAGI: ${uname}`),
      });
    }
    for (const c of cand) if (!best || c.pct > best.pct) best = c;
  }
  return best;
}

/* ---------------- telemetri (log lokal + CSV) ---------------- */
export const SESSION = { id: Date.now().toString(36), start: Date.now() };
export interface RunLog {
  run: number; date: string; session: string; sessionSec: number; level: number; cause: string;
  picked: string; rejected: string; durSec: number; rerolls: number; unlocks: string; daily: string; gold: number;
}
export function readLogs(kv: KV = defaultKV()): RunLog[] {
  try { const a = JSON.parse(kv.getItem(LOG_KEY) ?? '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function logRun(e: RunLog, kv: KV = defaultKV()) {
  const all = [...readLogs(kv), e].slice(-CFG.telemetry.maxRuns);
  try { kv.setItem(LOG_KEY, JSON.stringify(all)); } catch { /* penuh */ }
}
export function clearLogs(kv: KV = defaultKV()) { try { kv.setItem(LOG_KEY, '[]'); } catch { /* */ } }
const LOG_COLS: (keyof RunLog)[] = ['run', 'date', 'session', 'sessionSec', 'level', 'cause', 'picked', 'rejected', 'durSec', 'rerolls', 'unlocks', 'daily', 'gold'];
export function toCsv(logs: RunLog[]): string {
  const esc = (x: unknown) => { const s = String(x ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [LOG_COLS.join(','), ...logs.map((l) => LOG_COLS.map((c) => esc(l[c])).join(','))].join('\n');
}

/* ---------------- daily challenge ---------------- */
export const MODS = ['raksasa', 'gravitasi', 'kepala'] as const;
export type ModId = (typeof MODS)[number];
export const MOD_LABEL: Record<string, string> = { raksasa: 'GIANT FOES', gravitasi: 'LOW GRAVITY', kepala: 'HEADSHOTS ONLY' };
const MOD_ID_LABEL: Record<string, string> = { raksasa: 'MUSUH RAKSASA', gravitasi: 'GRAVITASI RENDAH', kepala: 'HANYA HEADSHOT' };
export const modLabel = (mod: string) => tx(MOD_LABEL[mod] ?? mod, MOD_ID_LABEL[mod] ?? MOD_LABEL[mod] ?? mod);
const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** RNG ber-seed (mulberry32): seed sama → urutan sama */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function dailyInfo(d: Date) {
  const key = dateKey(d); const seed = hashSeed(`ragdoll-${key}`);
  return { key, seed, mod: MODS[seed % MODS.length] as ModId };
}
export function modEffects(mod: string) {
  const D = CFG.daily;
  return { scale: mod === 'raksasa' ? D.giantScale : 1, hp: mod === 'raksasa' ? D.giantHp : 1, grav: mod === 'gravitasi' ? D.lowGrav : 1, headOnly: mod === 'kepala' };
}
export const dailyScore = (level: number, kills: number, heads: number) =>
  level * CFG.daily.scorePerLevel + kills * CFG.daily.scorePerKill + heads * CFG.daily.scorePerHead;
export function addDaily(m: MetaSave, e: DailyEntry) {
  m.daily = [...m.daily, e].sort((a, b) => b.score - a.score).slice(0, 60);
}
export const board = (m: MetaSave, date: string) => m.daily.filter((e) => e.date === date).slice(0, CFG.daily.boardSize);
