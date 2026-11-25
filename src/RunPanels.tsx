// Panel roguelite: pilih kartu, rute, peti, layar mati "SEKALI LAGI", HUD kartu, notifikasi, PROGRES & DEBUG.
// Gaya sama dengan panel lama (g-panel biru gelap, g-ribbon, tombol g-btn, font-game).
import { ReactNode, useEffect, useRef, useState } from 'react';
import type { RagWorld, RUi } from './game/ragdoll/game';
import { CARDS, COSMETICS, CardId, UNLOCKS, cardName, foeName, unlockName, unlockLabel } from './game/ragdoll/config';
import { CARD_BY, cardText } from './game/ragdoll/cards';
import { board, dailyInfo, modLabel, readLogs, unlockOf } from './game/ragdoll/meta';
import { audioInit, snd } from './game/ragdoll/audio';
import SkillTree, { TreeIcon } from './SkillTree';
import { SkillGlyph } from './SkillTreeArt';
import { CARD_ART } from './cardArt';
import { langLocale, tx, useLang } from './i18n';
import { LangToggle } from './LangToggle';

type W = () => RagWorld | undefined;
const TYPE_COL: Record<string, string> = { PANAH: '#ffb02e', BERTAHAN: '#5cf08a', JALUR: '#69d5ff', RISIKO: '#ff5a4f', KHUSUS: '#b98cff' };
const PATH_COL: Record<string, string> = { speed: '#69d5ff', accuracy: '#ffd34e', vitality: '#85e271' };
const pct = (x: number) => Math.round(x * 100);

function GBtn({ tone, onClick, children, className = '', disabled = false }: { tone: 'orange' | 'green' | 'dark' | 'red'; onClick: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={() => { audioInit(); snd.tap(); onClick(); }} className={`g-btn g-${tone} font-game overflow-hidden ${disabled ? 'opacity-50 saturate-50' : ''} ${className}`}>
      {children}
    </button>
  );
}

function Shell({ ribbon, tone = '', wide = false, children }: { ribbon: string; tone?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className="g-dead-backdrop absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-[#01121b]/65 px-3 py-8">
      <div className={`g-pop relative w-full ${wide ? 'max-w-[34rem]' : 'max-w-[24.5rem]'}`}>
        <div className={`g-ribbon ${tone} font-game text-xl sm:text-2xl`}>{ribbon}</div>
        <div className="g-panel px-4 pb-5 pt-10 text-white sm:px-6">{children}</div>
      </div>
    </div>
  );
}

function Chip({ children, col = 'text-white' }: { children: ReactNode; col?: string }) {
  return <span className={`g-chip font-game flex items-center gap-1 px-2.5 py-1 text-xs leading-none ${col}`}>{children}</span>;
}

export function CardChip({ id, lv }: { id: CardId; lv: number }) {
  useLang();
  const d = CARD_BY[id];
  const art = CARD_ART[id];
  return (
    <span title={`${cardName(d)} LV${lv}: ${cardText(id, lv)}`} className="g-chip font-game flex items-center gap-1.5 px-2 py-0.5 text-[11px] leading-none text-white" style={{ boxShadow: `inset 0 0 0 1px ${d.path ? PATH_COL[d.path] : TYPE_COL[d.type]}` }}>
      {art ? (
        <img src={art} alt={cardName(d)} referrerPolicy="no-referrer" className="h-4 w-4 rounded-sm object-cover" />
      ) : d.glyph ? (
        <SkillGlyph icon={d.glyph} className="h-4 w-4" />
      ) : (
        <span className="text-sm">{d.icon}</span>
      )}
      {lv}
    </span>
  );
}

// Kartu hadiah (LEVEL SELESAI / hadiah bos / peti) dan peta perjalanan (pilih rute) ada di file sendiri.
export { CardPickPanel, ChestPanel } from './RewardCards';
export { RoutePanel } from './JourneyMap';

/** layar mati "SEKALI LAGI" */
export function DeathPanel({ ui, w, onMenu, onMeta }: { ui: RUi; w: W; onMenu: () => void; onMeta: () => void }) {
  useLang();
  const r = ui.run;
  const stat = (v: ReactNode, s: string) => (
    <div className="g-chip flex flex-col items-center rounded-2xl px-2 py-2.5">
      <span className="font-game text-xl leading-none text-white tabular-nums">{v}</span>
      <span className="mt-1 text-xs font-black tracking-wider text-cyan-200/85">{s}</span>
    </div>
  );
  return (
    <Shell ribbon="GAME OVER" tone="red">
      <div className="text-center">
        <div className="text-xs font-black tracking-[0.16em] text-cyan-100/80">{tx('KILLED BY', 'DIBUNUH OLEH')}</div>
        <div className="font-game mt-0.5 text-2xl leading-tight text-[#ff5a4f]">{r.killedBy}</div>
        {r.daily && <div className="mt-1 text-xs font-black text-[#7fe9f2]">{tx('DAILY', 'HARIAN')}: {r.daily}</div>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {stat(`LV.${ui.level}`, tx('LEVEL', 'LEVEL'))}
        {stat(ui.totalKills, tx('KILLS', 'TUMBANG'))}
        {stat(r.goldEarned, tx('GOLD', 'EMAS'))}
      </div>
      {r.metaGain > 0 && (
        <div className="mt-3 flex justify-center">
          <span className="g-chip font-game rounded-full px-3.5 py-1 text-xs text-[#ffd23f]">
            +{r.metaGain} {tx('META COINS', 'KOIN META')}
          </span>
        </div>
      )}
      {r.cards.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          {r.cards.map(([id, lv]) => <CardChip key={id} id={id} lv={lv} />)}
        </div>
      )}
      {r.unlocks.length > 0 && (
        <div className="mt-3 rounded-xl border border-[#5cf08a]/30 bg-[#5cf08a]/10 px-3 py-1.5 text-center text-xs font-black text-[#5cf08a]">
          {tx('UNLOCKED', 'TERBUKA')}: {r.unlocks.map((id) => { const u = unlockOf(id); return u ? unlockName(u) : id; }).join(', ')}
        </div>
      )}
      <GBtn tone="orange" onClick={() => w()?.newRun(!!r.daily)} className="g-sheen mt-4 h-15 w-full text-2xl">{tx('↻ TRY AGAIN', '↻ COBA LAGI')}</GBtn>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <GBtn tone="dark" onClick={onMeta} className="h-11 text-xs text-[#ffd23f]">SKILL TREE</GBtn>
        <GBtn tone="dark" onClick={onMenu} className="h-11 text-xs text-cyan-100">🏠 MENU</GBtn>
      </div>
    </Shell>
  );
}

/** HUD saat bermain: kartu aktif, perisai, panah ganda, pemburu, tombol skill WAKTU MELAMBAT */
export function RunHud({ ui, w }: { ui: RUi; w: W; onSkin?: () => void }) {
  useLang();
  const r = ui.run;
  return (
    <>
      <div className="pointer-events-none absolute left-2 top-24 z-10 flex max-w-[55%] flex-wrap gap-1 sm:left-3.5 sm:top-[6.6rem]">
        {r.cards.filter(([id]) => id !== 'ganda').map(([id, lv]) => <CardChip key={id} id={id} lv={lv} />)}
        {r.gandaMax > 0 && <Chip col={r.ganda ? 'text-[#b98cff]' : 'text-white/40'}>🏹 {r.ganda}/{r.gandaMax}</Chip>}
        {r.hunter > 1 && <Chip col="text-[#ffe14d]">🎯 x{r.hunter}</Chip>}
        {r.shieldOn && <Chip col={r.shield >= 1 ? 'text-[#7fe9f2]' : 'text-white/50'}>🔰 {r.shield >= 1 ? tx('READY', 'SIAP') : `${pct(r.shield)}%`}</Chip>}
        {r.route === 'risiko' && <Chip col="text-[#ff5a4f]">☠️ {tx('RISKY', 'BERISIKO')}</Chip>}
        {r.daily && <Chip col="text-[#7fe9f2]">📅 {r.daily}</Chip>}
      </div>
      {r.hasSlow && (
        <button
          onClick={() => w()?.activateSlow()}
          aria-label={tx('Slow Time (Q)', 'Waktu melambat (Q)')}
          className="font-game absolute bottom-20 right-3 z-10 grid h-16 w-16 place-items-center rounded-full border-4 border-[#031a24] text-[11px] text-white shadow-lg active:scale-95 sm:bottom-24"
          style={{ background: `conic-gradient(#5cc8ff ${r.slow * 360}deg, #0b2a3a 0deg)` }}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#041926]">{r.slowOn ? tx('ACTIVE', 'AKTIF') : r.slow >= 1 ? '⏳ Q' : `${pct(r.slow)}%`}</span>
        </button>
      )}
    </>
  );
}

/** notifikasi layar: unlock, sinergi, hadiah */
export function Toasts({ ui }: { ui: RUi }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-40 flex flex-col items-center gap-1.5 px-3">
      {ui.toasts.map((t) => (
        <div key={t.id} className="g-pop rounded-2xl border-2 border-[#031a24] bg-gradient-to-b from-[#165770] to-[#082736] px-4 py-2 text-center shadow-lg ring-2 ring-[#ffd23f]/60">
          <div className="font-game text-sm text-[#ffd23f]">{t.title}</div>
          {t.sub && <div className="text-xs font-black tracking-wider text-cyan-100">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** DEBUG: beri kartu, lompat level, panggil bos, emas, unlock, reset */
export function DebugPanel({ w, onClose }: { w: W; onClose: () => void }) {
  useLang();
  const [lv, setLv] = useState(5);
  const g = w();
  const b = (label: string, fn: () => void) => (
    <button key={label} onClick={() => { audioInit(); fn(); }} className="font-game rounded-lg bg-white/10 px-2 py-1.5 text-[10px] hover:bg-white/20">{label}</button>
  );
  return (
    <div className="absolute right-2 top-24 z-50 w-72 rounded-2xl border-2 border-[#031a24] bg-[#041926]/95 p-3 text-white shadow-xl">
      <div className="mb-2 flex items-center justify-between"><span className="font-game text-sm text-[#ff5a4f]">DEBUG</span><button onClick={onClose} className="font-game px-2">✕</button></div>
      <div className="text-[10px] font-black text-cyan-100/70">{tx('GRANT CARD (+1 LV)', 'BERI KARTU (+1 LV)')}</div>
      <div className="mt-1 grid grid-cols-5 gap-1">
        {CARDS.map((c) => <button key={c.id} title={cardName(c)} onClick={() => g?.debugCard(c.id)} className="rounded-lg bg-white/10 py-1 text-lg hover:bg-white/20">{c.icon}</button>)}
      </div>
      <div className="mt-2 flex items-center gap-1">
        <input type="number" min={1} value={lv} onChange={(e) => setLv(Math.max(1, Number(e.target.value) || 1))} className="w-16 rounded bg-black/40 px-2 py-1 text-sm" />
        {b(tx('JUMP LEVEL', 'LOMPAT LEVEL'), () => g?.debugLevel(lv))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {b(tx('BIG BOSS', 'BOS BESAR'), () => g?.debugBoss(true))}
        {b('MINI-BOSS', () => g?.debugBoss(false))}
        {b(tx('CLEAR LEVEL', 'MENANG LEVEL'), () => g?.debugClear())}
        {b(tx('+500 GOLD', '+500 EMAS'), () => g?.debugGold(500))}
        {b(tx('+1000 META COINS', '+1000 KOIN META'), () => g?.debugMeta(1000))}
        {b(tx('UNLOCK ALL', 'BUKA SEMUA'), () => g?.debugUnlockAll())}
        {b('MAX POWER', () => g?.toggleMaxPower())}
        {b('RESET SAVE', () => { if (window.confirm(tx('DELETE ALL SAVE DATA & TELEMETRY?', 'HAPUS SEMUA SAVE & TELEMETRI?'))) g?.resetSave(); })}
      </div>
    </div>
  );
}

type TabKey = 'tree' | 'unlock' | 'stats' | 'book' | 'daily' | 'settings';
const TABS: { id: TabKey; en: string; idLabel: string }[] = [
  { id: 'tree', en: 'SKILL TREE', idLabel: 'POHON SKILL' },
  { id: 'unlock', en: 'UNLOCKS', idLabel: 'UNLOCK' },
  { id: 'stats', en: 'STATS', idLabel: 'STATISTIK' },
  { id: 'book', en: 'BESTIARY', idLabel: 'BUKU' },
  { id: 'daily', en: 'DAILY', idLabel: 'HARIAN' },
  { id: 'settings', en: 'SETTINGS', idLabel: 'ATUR' },
];
const STAT_LABEL: [string, string, string][] = [
  ['runs', 'RUNS PLAYED', 'RUN DIMAINKAN'], ['bestLevel', 'BEST LEVEL', 'LEVEL TERTINGGI'], ['kills', 'FOES DEFEATED', 'MUSUH TUMBANG'], ['headshots', 'HEADSHOTS', 'HEADSHOT'],
  ['bestStreak', 'BEST HEADSHOT STREAK', 'HEADSHOT BERUNTUN TERBAIK'], ['bigBossKills', 'BIG BOSSES SLAIN', 'BOS BESAR TUMBANG'], ['forts', 'FORTS DESTROYED', 'ISTANA ROBOH'],
  ['hostages', 'HOSTAGES FREED', 'TAWANAN BEBAS'], ['dragonMouth', 'DRAGON MOUTH HITS', 'TEMBAKAN MULUT NAGA'], ['shieldsBroken', 'SHIELDS BROKEN', 'PERISAI HANCUR'], ['coinsEarned', 'TOTAL GOLD', 'TOTAL EMAS'], ['deaths', 'DEATHS', 'KEMATIAN'],
];
const COS_BAND_LABEL: Record<string, [string, string]> = { merah: ['RED', 'MERAH'], kuning: ['YELLOW', 'KUNING'], biru: ['BLUE', 'BIRU'] };
const COS_TRAIL_LABEL: Record<string, [string, string]> = { putih: ['WHITE', 'PUTIH'], api: ['FIRE', 'API'], pelangi: ['RAINBOW', 'PELANGI'] };
const BOOK = ['archer', 'helm', 'heavy', 'shield', 'guard', 'rider', 'axer', 'boss', 'bat', 'dragon', 'fort'];

/** Progression uses the same outlined, pressable game UI as the arena and equipment menus. */
export function MetaModal({ ui, w, onClose, onDaily }: { ui: RUi | null; w: W; onClose: () => void; onDaily: () => void }) {
  useLang();
  const [tab, setTab] = useState<TabKey>('tree');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href], [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length);
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  const g = w(); const m = g?.meta;
  if (!g || !m) return null;
  void ui?.metaRev;
  const today = dailyInfo(new Date());
  const row = (k: ReactNode, v: ReactNode, key?: string) => (
    <div key={key} className="flex items-center justify-between gap-2 border-b border-white/10 py-1.5 text-xs font-bold"><span className="text-cyan-100/85">{k}</span><span className="font-game text-white">{v}</span></div>
  );
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([g.exportCsv()], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `ragdoll-telemetry-${today.key}.csv`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const toggle = (k: 'slowmo' | 'dmgNum' | 'zoom' | 'trail' | 'thunk' | 'debug', label: string) => row(label, (
    <button onClick={() => g.setSetting(k, !m.settings[k])} className={`font-game rounded-lg px-3 py-1 text-[11px] ${m.settings[k] ? 'bg-[#2b9e37]' : 'bg-white/15'}`}>{m.settings[k] ? tx('ON', 'NYALA') : tx('OFF', 'MATI')}</button>
  ), k);
  return (
    <div className="progress-backdrop">
      <div ref={dialogRef} className="progress-modal g-pop" role="dialog" aria-modal="true" aria-labelledby="progress-title">
        <div className="progress-shell">
          <header className="progress-header">
            <div className="progress-heading"><div className="progress-brand">{tx('RAGDOLL ARCHER / PERMANENT PROGRESS', 'RAGDOLL ARCHER / PROGRES PERMANEN')}</div><h2 id="progress-title" className="progress-title font-game">{tx('PATH OF LEGENDS', 'JALUR LEGENDA')}</h2></div>
            <div className="progress-header-actions">
              <div className="progress-wallet" aria-label={tx(`${m.coins} meta coins`, `${m.coins} koin meta`)}><TreeIcon icon="coin" /><div><strong className="font-game">{m.coins.toLocaleString(langLocale())}</strong><small>{tx('META COINS', 'KOIN META')}</small></div></div>
              <button onClick={onClose} className="progress-close" aria-label={tx('Close progress', 'Tutup progres')}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg></button>
            </div>
          </header>
          <div className="progress-tabs" role="tablist" aria-label={tx('Progress menu', 'Menu progres')}>
            {TABS.map((t) => (
              <button key={t.id} className="font-game" role="tab" id={`progress-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="progress-content" onClick={() => { audioInit(); snd.tap(); setTab(t.id); }}>{tx(t.en, t.idLabel)}</button>
            ))}
          </div>
          <div id="progress-content" role="tabpanel" aria-labelledby={`progress-tab-${tab}`} className={`progress-main ${tab === 'tree' ? 'progress-main-tree' : 'progress-main-other'}`}>
            {tab === 'tree' && <SkillTree meta={m} onBuy={(id) => g.buySkill(id)} inRun={!!ui && !ui.demo && ui.stage !== 'dead'} />}
            {tab === 'unlock' && (
              <>
                <div className="font-game text-lg text-[#efd39a]">{tx('COLLECTION & ACHIEVEMENTS', 'KOLEKSI & PENCAPAIAN')}</div>
                <div className="mt-2 text-xs font-black tracking-wider text-cyan-100/80">{tx('UNLOCKED', 'TERBUKA')} {m.unlocked.length}/{UNLOCKS.length}</div>
                {UNLOCKS.map((u) => {
                  const done = m.unlocked.includes(u.id); const val = Math.min(m.stats[u.stat], u.need);
                  return (
                    <div key={u.id} className="border-b border-white/10 py-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm font-bold">
                        <span className={done ? 'text-[#5cf08a]' : 'text-white'}>{done ? '✓ ' : '🔒 '}{unlockName(u)}</span>
                        {!done && u.cost !== undefined && <button onClick={() => g.buyUnlock(u.id)} className="font-game rounded-lg bg-[#ffb02e] px-2.5 py-0.5 text-xs text-[#031a24]">🪙 {u.cost}</button>}
                      </div>
                      {!done && (
                        <div className="mt-0.5 flex items-center gap-2 text-xs font-bold text-cyan-100/80">
                          <span className="min-w-0 flex-1 truncate">{unlockLabel(u)}</span>
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-black/50"><span className="block h-full bg-[#ffd23f]" style={{ width: `${pct(val / u.need)}%` }} /></span>
                          <span>{val}/{u.need}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="mt-3 text-xs font-black tracking-wider text-cyan-100/80">{tx('COSMETICS', 'KOSMETIK')}</div>
                {row(tx('HEADBAND COLOR', 'WARNA IKAT'), (
                  <span className="flex gap-1">{Object.entries(COSMETICS.band).map(([id, c]) => {
                    const pair = COS_BAND_LABEL[id];
                    const lbl = pair ? tx(pair[0], pair[1]) : id.toUpperCase();
                    return <button key={id} title={lbl} onClick={() => g.setCosmetic('band', id)} className={`h-6 w-6 rounded-full border-2 ${m.cos.band === id ? 'border-white' : 'border-black/50'} ${m.unlocked.includes(c.unlock) || !c.unlock ? '' : 'opacity-30'}`} style={{ background: c.col }} />;
                  })}</span>
                ))}
                {row(tx('ARROW TRAIL', 'JEJAK PANAH'), (
                  <span className="flex gap-1">{Object.entries(COSMETICS.trail).map(([id, c]) => {
                    const pair = COS_TRAIL_LABEL[id];
                    const lbl = pair ? tx(pair[0], pair[1]) : id.toUpperCase();
                    return <button key={id} onClick={() => g.setCosmetic('trail', id)} className={`font-game rounded-lg px-2.5 py-0.5 text-xs ${m.cos.trail === id ? 'bg-white text-[#031a24]' : 'bg-white/10'} ${m.unlocked.includes(c.unlock) || !c.unlock ? '' : 'opacity-30'}`}>{lbl}</button>;
                  })}</span>
                ))}
                <div className="mt-1.5 text-xs font-bold text-white/65">{tx('LOCKED SKINS OPEN VIA ACHIEVEMENTS (SEE ABOVE) · EQUIP IN THE SKIN MENU', 'TOPI TERKUNCI DIBUKA LEWAT PENCAPAIAN (LIHAT DAFTAR DI ATAS) · PILIH DI MENU SKIN')}</div>
              </>
            )}
            {tab === 'stats' && (
              <>
                {STAT_LABEL.map(([k, en, idL]) => row(tx(en, idL), m.stats[k as keyof typeof m.stats], k))}
                {row(tx('TIME PLAYED', 'WAKTU BERMAIN'), `${Math.round(m.stats.playSec / 60)} ${tx('MIN', 'MENIT')}`)}
                <div className="mt-3 text-xs font-black tracking-wider text-cyan-100/80">{tx('TOP CAUSES OF DEATH', 'PENYEBAB MATI TERBANYAK')}</div>
                {Object.entries(m.diedTo).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => row(k, v, k))}
                <GBtn tone="green" onClick={exportCsv} className="mt-3 h-11 w-full text-sm">⬇ {tx('EXPORT TELEMETRY CSV', 'EKSPOR CSV TELEMETRI')} ({readLogs().length} {tx('RUNS', 'RUN')})</GBtn>
              </>
            )}
            {tab === 'book' && (
              <div className="grid grid-cols-2 gap-1.5">
                {BOOK.map((k) => {
                  const seen = m.seen.includes(k);
                  return (
                    <div key={k} className="g-chip rounded-xl px-2 py-2.5 text-center">
                      <div className="font-game text-sm">{seen ? foeName(k) : '???'}</div>
                      <div className="mt-0.5 text-xs font-bold text-cyan-100/80">{seen ? `${tx('DEFEATED', 'TUMBANG')}: ${m.killsBy[k] ?? 0}` : tx('NOT ENCOUNTERED', 'BELUM DITEMUI')}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {tab === 'daily' && (
              <>
                {row(tx('DATE', 'TANGGAL'), today.key)}
                {row(tx("TODAY'S MODIFIER", 'MODIFIER HARI INI'), modLabel(today.mod))}
                <div className="mt-1.5 text-xs font-bold text-white/75">{tx('SAME SEED FOR ALL PLAYERS TODAY (CARDS & FOES).', 'SEED SAMA UNTUK SEMUA PEMAIN HARI INI (KARTU & MUSUH).')}</div>
                <GBtn tone="orange" onClick={onDaily} className="mt-3 h-12 w-full text-lg">📅 {tx('PLAY DAILY', 'MAIN HARIAN')}</GBtn>
                <div className="mt-3 text-xs font-black tracking-wider text-cyan-100/80">{tx('LOCAL SCOREBOARD', 'PAPAN SKOR LOKAL')} · {today.key}</div>
                {board(m, today.key).length ? board(m, today.key).map((e, i) => row(`#${i + 1} · LV.${e.level} · ${e.kills} ${tx('KILLS', 'KILL')}`, e.score, String(e.at))) : <div className="py-2 text-xs font-bold text-white/65">{tx('NO SCORES TODAY YET', 'BELUM ADA SKOR HARI INI')}</div>}
              </>
            )}
            {tab === 'settings' && (
              <>
                {row(tx('LANGUAGE', 'BAHASA'), <LangToggle compact />)}
                {row(tx('SCREEN SHAKE', 'GETARAN LAYAR'), (
                  <span className="flex gap-1">{[0, 0.5, 1].map((s) => (
                    <button key={s} onClick={() => g.setSetting('shake', s)} className={`font-game rounded-lg px-2 py-1 text-[10px] ${m.settings.shake === s ? 'bg-[#2b9e37]' : 'bg-white/15'}`}>{pct(s)}%</button>
                  ))}</span>
                ))}
                {toggle('slowmo', 'SLOW-MO KILL')}
                {toggle('dmgNum', tx('DAMAGE NUMBERS', 'ANGKA DAMAGE'))}
                {toggle('zoom', tx('HEADSHOT ZOOM', 'ZOOM HEADSHOT'))}
                {toggle('trail', tx('ARROW TRAIL', 'JEJAK PANAH'))}
                {toggle('thunk', tx('IMPACT THUNK SFX', 'SUARA THUNK'))}
                {toggle('debug', tx('DEBUG MODE (DBG BUTTON / `)', 'MODE DEBUG (TOMBOL DBG / `)'))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
