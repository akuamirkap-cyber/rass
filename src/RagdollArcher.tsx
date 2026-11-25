import { ReactNode, useEffect, useRef, useState } from 'react';
import { BossId, BowId, RagdollGame, RUi } from './game/ragdoll/game';
import { CardPickPanel, ChestPanel, DeathPanel, DebugPanel, MetaModal, RoutePanel, RunHud, Toasts } from './RunPanels';
import { modLabel, dailyInfo, unlockOf } from './game/ragdoll/meta';
import { audioInit, audioMute, snd } from './game/ragdoll/audio';
import BowShopModal from './BowShopModal';
import BossCodexModal from './BossCodexModal';
import EnemyCodexModal from './EnemyCodexModal';
import SkinModal, { SKIN_LIST } from './SkinModal';
import { HEAD_STYLES, HeadStyle } from './game/ragdoll/head';
import { CFG, COSMETICS, unlockLabel } from './game/ragdoll/config';
import { tx, useLang } from './i18n';
import { LangToggle } from './LangToggle';

/* ---------- icons ---------- */

function Coins({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 32" className={className} aria-hidden>
      <path d="M4 20l7-9 9 2 2 9-9 7z" fill="#f59f1b" />
      <path d="M4 20l7-9 4 6-2 12z" fill="#ffc94a" />
      <path d="M15 9l10-6 9 6-3 10-12 1z" fill="#ffb52e" />
      <path d="M15 9l10-6 1 9-7 8z" fill="#ffe08a" />
      <path d="M20 24l9-5 8 4-5 7-10-1z" fill="#f08c12" />
      <path d="M20 24l9-5 1 6-8 4z" fill="#ffc94a" />
    </svg>
  );
}

function Skull({ className = '', fill = '#ffffff', hole = '#000000' }: { className?: string; fill?: string; hole?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 1.8C6.8 1.8 3 5.5 3 10.3c0 2.6 1.1 4.6 2.9 5.9v3A1.8 1.8 0 0 0 7.7 21h8.6a1.8 1.8 0 0 0 1.8-1.8v-3c1.8-1.3 2.9-3.3 2.9-5.9C21 5.5 17.2 1.8 12 1.8z" fill={fill} />
      <circle cx="8.4" cy="10.8" r="2.5" fill={hole} />
      <circle cx="15.6" cy="10.8" r="2.5" fill={hole} />
      <path d="M12 13.3l-1.4 2.6h2.8z" fill={hole} />
      <path d="M9.5 17.8V21M12 17.8V21M14.5 17.8V21" stroke={hole} strokeWidth="1.1" />
    </svg>
  );
}

function Castle({ n, color, small = false }: { n: number; color: string; small?: boolean }) {
  return (
    <div className={`relative z-10 shrink-0 ${small ? 'h-9 w-9 sm:h-10 sm:w-10' : 'h-10 w-10 sm:h-13 sm:w-13'}`}>
      <svg viewBox="0 0 44 44" className="h-full w-full drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]" aria-hidden>
        <path d="M3 2h8v6h6V2h10v6h6V2h8v15l-4 4v21H7V21l-4-4z" fill={color} />
      </svg>
      <span className={`font-game absolute inset-0 grid place-items-center pt-2.5 leading-none text-white ${small ? 'text-sm sm:text-base' : 'text-base sm:text-xl'}`}>{n}</span>
    </div>
  );
}

const I = {
  play: <path d="M8 4.5v15l12-7.5z" fill="currentColor" />,
  pause: <><rect x="6" y="5" width="4.5" height="14" rx="1" fill="currentColor" /><rect x="13.5" y="5" width="4.5" height="14" rx="1" fill="currentColor" /></>,
  retry: <path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor" />,
  home: <path d="M12 3l9 8h-2.5v9h-5v-6h-3v6h-5v-9H3z" fill="currentColor" />,
  first: <path d="M6 5h2.5v14H6zM19 5v14l-9.5-7z" fill="currentColor" />,
  soundOn: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" /><path d="M15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></>,
  soundOff: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" /><path d="M15 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></>,
  target: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" /><circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" strokeWidth="2.4" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></>,
  grid: <path d="M4 4h4.5v4.5H4zM9.750 4h4.5v4.5h-4.5zM15.5 4H20v4.5h-4.5zM4 9.750h4.5v4.5H4zM9.750 9.750h4.5v4.5h-4.5zM15.5 9.750H20v4.5h-4.5zM4 15.5h4.5V20H4zM9.750 15.5h4.5V20h-4.5zM15.5 15.5H20V20h-4.5z" fill="currentColor" />,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.600-8.960A6 6 0 0 1 18 10.2 4 4 0 0 1 17.5 18z" fill="currentColor" />,
  swords: <path d="M4 3l9.5 9.5-2 2L3 5zM20 3l-9.5 9.5 2 2L21 5zM6.5 14.5l3 3-1.5 1.5 1.5 1.5-1.5 1.5L6.5 20.5 5 22l-3-3 1.5-1.5L2 16l1.5-1.5L5 16zM17.5 14.5l-3 3 1.5 1.5-1.5 1.5 1.5 1.5 1.5-1.5L19 22l3-3-1.5-1.5L22 16l-1.5-1.5L19 16z" fill="currentColor" />,
  ground: <path d="M3 9h18v7H3zM6 16h3v4H6zM14 16h4v3h-4z" fill="currentColor" />,
};

function Ico({ d, className = 'h-6 w-6' }: { d: ReactNode; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden>{d}</svg>;
}

const BOW_QUICK_META: Record<BowId, { icon: string; en: string; id: string }> = {
  legend: { icon: '✦', en: 'ASTRA', id: 'ASTRA' },
  gold: { icon: '👑', en: 'GOLD', id: 'EMAS' },
  thunder: { icon: '⚡', en: 'THUNDER', id: 'PETIR' },
  fire: { icon: '🔥', en: 'FIRE', id: 'API' },
  wood: { icon: '🪵', en: 'WOOD', id: 'KAYU' },
  spike: { icon: '🌿', en: 'SPIKE', id: 'DURI' },
  poison: { icon: '🧪', en: 'ACID', id: 'ASAM' },
};

/* ---------- little pieces ---------- */

/** numbers that roll up to their value instead of jumping */
function useCount(target: number) {
  const [val, setVal] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const d = target - cur.current;
      if (Math.abs(d) < 1) { cur.current = target; setVal(target); return; }
      cur.current += d * 0.16 + Math.sign(d) * 0.6;
      setVal(Math.round(cur.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

function Btn({
  tone,
  className = '',
  onClick,
  children,
  label,
  disabled,
}: {
  tone: 'orange' | 'green' | 'dark' | 'red';
  className?: string;
  onClick: () => void;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => {
        audioInit();
        snd.tap();
        onClick();
      }}
      className={`g-btn g-${tone} font-game overflow-hidden ${className}`}
    >
      {children}
    </button>
  );
}

function Pill({ icon, children, label }: { icon: ReactNode; children: ReactNode; label: string }) {
  return (
    <div aria-label={label} className="relative ml-3 flex h-8 min-w-[4.6rem] items-center rounded-full bg-black/80 pl-7 pr-3.5 ring-1 ring-white/15 sm:ml-4 sm:h-9 sm:min-w-[6rem] sm:pl-10 sm:pr-4">
      <span className="pointer-events-none absolute -left-3.5 top-1/2 z-20 -translate-y-1/2 drop-shadow-[0_3px_5px_rgba(0,0,0,0.55)] sm:-left-4">{icon}</span>
      <span className="font-game relative z-10 text-base leading-none text-white tabular-nums sm:text-xl">{children}</span>
    </div>
  );
}

function Panel({ ribbon, tone = '', children }: { ribbon: string; tone?: string; children: ReactNode }) {
  return (
    <div className="g-dead-backdrop absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-[#01121b]/65 px-3 py-8">
      <div className="g-pop relative w-full max-w-[24.5rem]">
        <div className={`g-ribbon ${tone} font-game text-xl sm:text-2xl`}>{ribbon}</div>
        <div className="g-panel px-4 pb-5 pt-10 text-white sm:px-6">{children}</div>
      </div>
    </div>
  );
}

interface ShutterState {
  key: number;
  title: string;
  sub: string;
}

interface Props {
  title: boolean; onStart: () => void; onExit: () => void; mute: boolean; onMute: () => void;
  cleared: number; levels: number; onPlay: () => void; onLevels: () => void; onStory: () => void; onWar: () => void; onDuel: () => void;
}

export default function RagdollArcher({
  title,
  onStart,
  onExit,
  mute,
  onMute,
  cleared,
  levels,
  onPlay,
  onLevels,
  onStory,
  onWar,
  onDuel,
}: Props) {
  useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<RagdollGame | null>(null);
  const pendingStartLvl = useRef<number | null>(null);
  const pendingBoss = useRef<BossId | 'dragon' | null>(null);
  const shutterTimers = useRef<number[]>([]);

  const [ui, setUi] = useState<RUi | null>(null);
  const [bowShopOpen, setBowShopOpen] = useState(false);
  const [bossCodexOpen, setBossCodexOpen] = useState(false);
  const [codexTab, setCodexTab] = useState<'musuh' | 'boss'>('musuh');
  const [skinOpen, setSkinOpen] = useState(false);
  const [classicOpen, setClassicOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [dbgOpen, setDbgOpen] = useState(false);

  // Transition choreography states
  const [introVeil, setIntroVeil] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [shutter, setShutter] = useState<ShutterState | null>(null);
  const [quickFlashKey, setQuickFlashKey] = useState(0);

  const closeCodex = () => {
    setBossCodexOpen(false);
    setCodexTab('musuh');
  };

  const [head, setHeadState] = useState<HeadStyle>(() => {
    try {
      const h = localStorage.getItem('perfectshot.ragdoll.head') as HeadStyle | null;
      return h && HEAD_STYLES.includes(h) ? h : 'band';
    } catch {
      return 'band';
    }
  });
  const pickHead = (h: HeadStyle) => {
    if (w()?.headOk(h) === false) { w()?.setHead(h); return; } // locked: the world says why
    setHeadState(h);
    w()?.setHead(h);
  };

  const openSkin = () => {
    if (!(ui?.demo ?? true)) w()?.setPaused(true);
    setSkinOpen(true);
  };
  const closeSkin = () => {
    setSkinOpen(false);
    w()?.setPaused(false);
  };
  const skinName = SKIN_LIST.find((m) => m.id === (ui?.skin.id ?? head))?.name ?? tx('NINJA BAND', 'IKAT NINJA');

  const clearTimers = () => {
    shutterTimers.current.forEach((id) => window.clearTimeout(id));
    shutterTimers.current = [];
  };

  // Choreographed transition when clicking PLAY (or starting directly at Level 2 Wooden Fort)
  const triggerStartTransition = (startLvl = 1, bannerTitle?: string, bannerSub?: string, bossChoice?: BossId | 'dragon') => {
    if (launching) return;
    pendingBoss.current = bossChoice ?? null;
    audioInit();
    snd.banner();
    setClassicOpen(false);
    setLaunching(true);
    clearTimers();

    const sTitle = bannerTitle ?? (startLvl === 2 ? tx('LEVEL 2 · WOODEN FORT!', 'LEVEL 2 · ISTANA KAYU!') : tx('ENTERING ARENA!', 'MEMASUKI ARENA!'));
    const sSub = bannerSub ?? (startLvl === 2 ? tx('AIM AT WEAK PEGS & JOINTS!', 'INCAR PASAK & SENDI LEMAHNYA!') : tx('DRAW BOW & LOOSE ARROWS!', 'TARIK BUSUR & LEPASKAN PANAH!'));
    setShutter({ key: Date.now(), title: sTitle, sub: sSub });

    const tSwitch = window.setTimeout(() => {
      pendingStartLvl.current = startLvl;
      onStart();
      // If `title` was already false for any reason, start directly on world
      if (!title) {
        if (bossChoice) { w()?.startBossRun(bossChoice); pendingBoss.current = null; }
        else if (startLvl > 1) w()?.startLevelRun(startLvl);
        else w()?.startRun();
      }
      setLaunching(false);
    }, 285);

    const tDone = window.setTimeout(() => {
      setShutter(null);
    }, 700);

    shutterTimers.current.push(tSwitch, tDone);
  };

  // Choreographed transition back to Menu
  const triggerExitTransition = () => {
    audioInit();
    clearTimers();
    setShutter({ key: Date.now(), title: tx('MAIN MENU', 'MENU UTAMA'), sub: 'RAGDOLL ARCHER' });
    const tSwitch = window.setTimeout(() => {
      onExit();
    }, 280);
    const tDone = window.setTimeout(() => {
      setShutter(null);
    }, 690);
    shutterTimers.current.push(tSwitch, tDone);
  };

  // Quick clean flash transition on Retry / Next Level / Restart
  const triggerQuickAction = (fn: () => void) => {
    setQuickFlashKey((k) => k + 1);
    window.setTimeout(fn, 110);
  };

  // From Codex: launch directly into facing the Sturdy Wooden Fort (Level 2) or Red Dragon
  const fightSpecial = (kind: 'fort' | 'dragon') => {
    closeCodex();
    setBowShopOpen(false);
    if (ui?.demo ?? true) {
      if (kind === 'fort') {
        triggerStartTransition(2, tx('LEVEL 2 · WOODEN FORT!', 'LEVEL 2 · ISTANA KAYU!'), tx('IRON WALLS · HIT THE WEAK POINTS!', 'DINDING BESI · BIDIK TITIK LEMAH!'));
      } else {
        triggerStartTransition(CFG.bigBoss.every, tx(`LEVEL ${CFG.bigBoss.every} / RED DRAGON BOSS!`, `LEVEL ${CFG.bigBoss.every} / BOS NAGA MERAH!`), tx('SHOOT THE DRAGON MOUTH WHILE CHARGING FIRE!', 'BIDIK MULUT NAGA SAAT MENGHIRUP API!'), 'dragon');
      }
    } else {
      w()?.spawnSpecial(kind);
    }
  };

  const fightSpecificBoss = (bk: BossId) => {
    setBossCodexOpen(false);
    setBowShopOpen(false);
    if (ui?.demo ?? true) {
      triggerStartTransition(CFG.bigBoss.every, tx(`LEVEL ${CFG.bigBoss.every} / BOSS FIGHT!`, `LEVEL ${CFG.bigBoss.every} / PERTARUNGAN BOS!`), tx('SHOOT BOSS WEAPONS OUT OF MID-AIR!', 'PANAH SENJATA BOS DI UDARA!'), bk);
    } else {
      w()?.spawnAxeBossNow(bk);
    }
  };

  const coins = useCount(ui?.coins ?? 70);
  
  const activeBow: BowId = ui?.bow ?? 'thunder';

  useEffect(() => {
    const id = window.setTimeout(() => setIntroVeil(false), 780);
    return () => {
      window.clearTimeout(id);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const g = new RagdollGame(c, setUi);
    gameRef.current = g;
    return () => {
      g.destroy();
      gameRef.current = null;
    };
  }, []);

  // The same world is the self-playing title backdrop and the live game
  useEffect(() => {
    const world = gameRef.current?.world;
    if (!world || world.demo === title) return;
    if (title) {
      world.toDemo();
    } else if (pendingBoss.current) {
      const choice = pendingBoss.current;
      pendingBoss.current = null; pendingStartLvl.current = null;
      world.startBossRun(choice);
    } else if (pendingStartLvl.current && pendingStartLvl.current > 1) {
      const lv = pendingStartLvl.current;
      pendingStartLvl.current = null;
      world.startLevelRun(lv);
    } else {
      pendingStartLvl.current = null;
      world.startRun();
    }
  }, [title]);

  useEffect(() => {
    audioMute(mute);
  }, [mute]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && classicOpen) {
        setClassicOpen(false);
        return;
      }
      const world = gameRef.current?.world;
      if (world && !world.demo && e.key.toLowerCase() === 'q') { world.activateSlow(); return; }
      if (world && e.key === '`' && world.meta.settings.debug) { setDbgOpen((o) => !o); return; }
      if (!world || world.demo || (e.key !== 'Escape' && e.key.toLowerCase() !== 'p')) return;
      if (world.stage === 'play' || world.stage === 'clear') world.setPaused(!world.paused);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [classicOpen]);

  // Stars land one by one with musical notes
  const shop = ui?.stage === 'shop';
  const stars = ui?.stars ?? 0;
  useEffect(() => {
    if (!shop) return;
    const ids = Array.from({ length: stars }, (_, i) => window.setTimeout(() => snd.star(i), 380 + i * 280));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [shop, stars]);

  const w = () => gameRef.current?.world;
  const demo = ui?.demo ?? true;
  const dying = !demo && ui?.stage === 'dying';
  const dead = !demo && ui?.stage === 'dead';
  const pct = ui ? Math.round((ui.kills / Math.max(1, ui.total)) * 100) : 0;
  const hpPct = ui ? Math.round((ui.hp / Math.max(1, ui.maxHp)) * 100) : 100;
  
  const sound = <Ico d={mute ? I.soundOff : I.soundOn} className="h-5 w-5" />;

  const modes: [string, ReactNode, () => void][] = [
    [tx('MISSIONS', 'MISI'), I.target, onPlay],
    [tx('LEVELS', 'LEVEL'), I.grid, onLevels],
    ['STORY', I.cloud, onStory],
    [tx('WAR', 'PERANG'), I.swords, onWar],
    ['DUEL', <text key="vs" x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="900" fontStyle="italic" fill="currentColor">VS</text>, onDuel],
  ];

  const activeBowMeta = BOW_QUICK_META[activeBow] ?? BOW_QUICK_META.thunder;
  const activeBowShort = tx(activeBowMeta.en, activeBowMeta.id);

  return (
    <div className="absolute inset-0 z-30 overflow-hidden bg-[#0a4767] select-none">
      <canvas
        ref={canvasRef}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={tx('Ragdoll archer arena', 'Arena ragdoll archer')}
        className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
      />

      {/* ============ INITIAL MOUNT VEIL REVEAL ============ */}
      {introVeil && (
        <div
          aria-hidden
          className="g-intro-veil pointer-events-none absolute inset-0 z-40 bg-[radial-gradient(circle_at_center,rgba(8,46,66,0.35)_0%,#02131d_85%)]"
        />
      )}

      {/* ============ QUICK RETRY / NEXT LEVEL FLASH ============ */}
      {quickFlashKey > 0 && (
        <div
          key={quickFlashKey}
          aria-hidden
          className="g-quick-flash pointer-events-none absolute inset-0 z-40 bg-[#041d2b]"
        />
      )}

      {/* ============ CHOREOGRAPHED BATTLE SHUTTER TRANSITION (ON MAIN / EXIT) ============ */}
      {shutter && (
        <div key={shutter.key} aria-hidden className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
          <div className="g-shutter-top absolute inset-x-0 top-0 h-[52%] border-b-4 border-[#ffd23f] bg-gradient-to-b from-[#02121b] via-[#072a3b] to-[#0c3f57] shadow-[0_12px_32px_rgba(0,0,0,0.65)]" />
          <div className="g-shutter-bot absolute inset-x-0 bottom-0 h-[52%] border-t-4 border-[#ffd23f] bg-gradient-to-t from-[#02121b] via-[#072a3b] to-[#0c3f57] shadow-[0_-12px_32px_rgba(0,0,0,0.65)]" />
          <div className="absolute inset-0 grid place-items-center px-4">
            <div className="g-shutter-badge flex flex-col items-center rounded-3xl border-4 border-[#031a24] bg-gradient-to-b from-[#165770] to-[#082736] px-7 py-4 text-center shadow-[0_14px_40px_rgba(0,0,0,0.65)] ring-2 ring-[#ffd23f]/65">
              <span className="font-game g-outline text-2xl tracking-wide text-[#ffd23f] sm:text-4xl">{shutter.title}</span>
              <span className="mt-1 text-xs font-black tracking-[0.16em] text-cyan-100 uppercase sm:text-sm">{shutter.sub}</span>
            </div>
          </div>
        </div>
      )}

      {/* ============ CLEAN TITLE SCREEN (CENTERED SAFE ZONE — NEVER BLOCKS LEFT/RIGHT ARCHERS!) ============ */}
      {demo && !bowShopOpen && !bossCodexOpen && (
        <div
          onClick={() => classicOpen && setClassicOpen(false)}
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-between bg-gradient-to-b from-[#02141f]/40 via-transparent to-[#02141f]/50 p-3 sm:p-5"
        >
          {/* Top Bar: Best Level + Coins on Left, Classic Modes Popover + Sound on Right */}
          <div className={`pointer-events-auto flex w-full items-start justify-between gap-2 ${launching ? 'g-title-exit-up' : 'g-drop'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="g-chip flex items-center gap-2 py-1 pl-1.5 pr-3.5 ring-1 ring-white/15" aria-label={tx(`Best level ${ui?.best ?? 1}`, `Level terbaik ${ui?.best ?? 1}`)}>
                <Castle n={ui?.best ?? 1} color="#2a78d8" small />
                <span className="font-game text-[11px] leading-tight text-white/85">{tx('BEST', 'REKOR')}<br />LEVEL</span>
              </div>
              <div className="g-chip hidden items-center gap-1.5 py-1.5 pl-2 pr-3.5 ring-1 ring-white/15 sm:flex" aria-label={tx(`Coins ${coins}`, `Koin ${coins}`)}>
                <Coins className="h-6 w-8" />
                <span className="font-game text-base leading-none text-[#ffd23f] tabular-nums">{coins}</span>
              </div>
            </div>

            <div className="relative flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <LangToggle compact />
              <Btn
                tone="dark"
                label={tx('Other classic game modes', 'Mode permainan klasik lainnya')}
                onClick={() => setClassicOpen((v) => !v)}
                className={`h-10 px-3 text-xs text-[#bff4fa] sm:h-11 sm:px-3.5 sm:text-sm ${classicOpen ? 'ring-2 ring-[#ffd23f]' : ''}`}
              >
                <Ico d={I.grid} className="h-4 w-4 sm:h-5 sm:w-5" />
                <span>{tx('MODES', 'MODE')}</span>
              </Btn>
              <Btn
                tone="dark"
                label={mute ? tx('Unmute sound', 'Nyalakan suara') : tx('Mute sound', 'Matikan suara')}
                onClick={onMute}
                className="h-10 w-10 sm:h-11 sm:w-11"
              >
                {sound}
              </Btn>

              {/* Tucked-away Classic Modes Dropdown */}
              {classicOpen && (
                <div className="g-pop absolute right-0 top-13 z-30 w-64 rounded-2xl border-3 border-[#031a24] bg-[#0a2f40]/95 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.65)] backdrop-blur-md">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="font-game text-xs tracking-wider text-[#ffd23f]">{tx('CLASSIC MODES', 'MODE KLASIK')}</span>
                    <span className="text-[10px] font-bold text-cyan-200/75">{cleared}/{levels} {tx('missions', 'misi')}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {modes.map(([name, icon, go]) => (
                      <button
                        key={name}
                        onClick={() => {
                          audioInit();
                          snd.tap();
                          setClassicOpen(false);
                          go();
                        }}
                        className="flex flex-col items-center gap-1 rounded-xl border-2 border-[#031a24] bg-[#13495e] py-2 text-[#bff4fa] transition hover:bg-[#1c627d] active:scale-95"
                        title={name}
                      >
                        <Ico d={icon} className="h-5 w-5" />
                        <span className="font-game text-[9px] text-white">{name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center Hero Stack: Strictly constrained width so left & right stickmen remain 100% unobstructed */}
          <div className="my-auto flex w-full max-w-[23.5rem] flex-col items-center px-2">
            <div className={launching ? 'g-title-exit-up' : 'g-logo-enter'}>
              <h1 aria-label="Ragdoll Archer" className="g-float font-game relative text-center leading-[0.84]">
                <svg
                  viewBox="0 0 300 24"
                  className="g-arrow-streak absolute left-1/2 top-1/2 z-10 w-[116%] drop-shadow-[0_3px_0_rgba(0,0,0,0.38)]"
                  aria-hidden
                >
                  <path d="M14 12H282" stroke="#f5a92f" strokeWidth="4" strokeLinecap="round" />
                  <path d="M2 4l14 8-14 8 6-8zM10 2l18 10-18 10 6-10z" fill="#e5352f" stroke="#031a24" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M298 12l-22-8 5 8-5 8z" fill="#cfdde2" stroke="#031a24" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
                <span className="g-title relative block text-[clamp(2.85rem,12vw,5.7rem)] text-white">RAGDOLL</span>
                <span className="g-title relative z-20 block text-[clamp(2.85rem,12vw,5.7rem)] text-[#ffb02e]">ARCHER</span>
              </h1>
            </div>

            {/* Primary CTA: PLAY */}
            <div className={`pointer-events-auto mt-5 w-full max-w-[17.5rem] sm:mt-6 ${launching ? 'g-dock-exit-down' : 'g-cta-enter'}`}>
              <div className="g-pulse">
                <Btn
                  tone="orange"
                  label={tx('Start playing', 'Mulai bermain')}
                  onClick={() => triggerStartTransition(1)}
                  className="g-sheen h-15 w-full gap-3 text-3xl shadow-[0_8px_0_#031a24,0_16px_30px_rgba(0,0,0,0.45)] sm:h-[4.4rem] sm:text-4xl"
                >
                  <Ico d={I.play} className="h-8 w-8 sm:h-9 sm:w-9" />
                  {tx('PLAY', 'MAIN')}
                </Btn>
              </div>
            </div>

            {/* Secondary Compact 3-Button Dock (Short, essential labels only) */}
            <div className={`pointer-events-auto mt-3 grid w-full grid-cols-3 gap-2 ${launching ? 'g-dock-exit-down' : 'g-dock-enter'}`}>
              <Btn
                tone="green"
                label={tx(`Select Bow (${activeBowShort})`, `Pilih Busur (${activeBowShort})`)}
                onClick={() => {
                  w()?.setPaused(false);
                  setBowShopOpen(true);
                  w()?.previewShot();
                }}
                className="h-12 px-2 text-sm sm:h-13 sm:text-base"
              >
                <span>{activeBowMeta.icon}</span>
                <span>{tx('BOW', 'BUSUR')}</span>
              </Btn>
              <Btn
                tone="dark"
                label={tx(`Change Head Skin (Active: ${skinName})`, `Ganti Skin Kepala (Aktif: ${skinName})`)}
                onClick={openSkin}
                className="h-12 px-2 text-sm text-[#ffd93b] sm:h-13 sm:text-base"
              >
                <span>🎭</span>
                <span>SKIN</span>
              </Btn>
              <Btn
                tone="red"
                label={tx('Codex of Enemies, Wooden Fort & 5 Bosses', 'Kamus Musuh, Istana Kayu & 5 Bos')}
                onClick={() => setBossCodexOpen(true)}
                className="h-12 px-2 text-sm sm:h-13 sm:text-base"
              >
                <span>📖</span>
                <span>{tx('CODEX', 'KAMUS')}</span>
              </Btn>
            </div>

            {/* PROGRESSION & DAILY CHALLENGE */}
            <div className={`pointer-events-auto mt-2 grid w-full grid-cols-2 gap-2 ${launching ? 'g-dock-exit-down' : 'g-dock-enter'}`}>
              <Btn tone="dark" label={tx('Skill tree, progress, unlocks & stats', 'Skill tree, progres, unlock & statistik')} onClick={() => setMetaOpen(true)} className="h-11 px-2 text-sm text-[#ffd23f]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M12 19V9M5 6v5l7 4 7-4V6" /><circle cx="5" cy="4" r="2" /><circle cx="12" cy="6" r="2" /><circle cx="19" cy="4" r="2" /><circle cx="12" cy="21" r="2" /></svg>
                <span>SKILL TREE</span>
              </Btn>
              <Btn
                tone="dark"
                label={tx('Daily challenge', 'Tantangan harian')}
                onClick={() => { const g = w(); if (g) g.queueDaily = true; triggerStartTransition(1, tx('DAILY CHALLENGE!', 'TANTANGAN HARIAN!'), modLabel(dailyInfo(new Date()).mod)); }}
                className="h-11 px-2 text-sm text-[#7fe9f2]"
              >
                <span>📅</span>
                <span>{tx('DAILY', 'HARIAN')}</span>
              </Btn>
            </div>

            {/* Subtle 1-line shortcut to directly test Level 2 Sturdy Wooden Castle */}
            <div className={`pointer-events-auto mt-2.5 ${launching ? 'g-dock-exit-down' : 'g-dock-enter'}`}>
              <button
                onClick={() => triggerStartTransition(2, tx('LEVEL 2 · WOODEN FORT!', 'LEVEL 2 · ISTANA KAYU!'), tx('AIM AT FOUNDATION PEGS & ROOF JOINTS!', 'INCAR PASAK PONDASI & SENDI ATAP!'))}
                className="flex items-center gap-1.5 rounded-full border border-[#ffd23f]/35 bg-[#041b28]/75 px-3.5 py-1 text-[11px] font-extrabold text-[#ffe28a] backdrop-blur-xs transition hover:border-[#ffd23f] hover:bg-[#082d42] active:scale-95"
                title={tx('Start directly at Level 2 to face the Sturdy Wooden Fort', 'Langsung mulai di Level 2 untuk menghadapi Istana Kayu Kokoh')}
              >
                <span>🏰</span>
                <span>{tx('Quick Test Lv.2: Sturdy Wooden Fort →', 'Langsung Uji Lv.2: Istana Kayu Kokoh →')}</span>
              </button>
            </div>
          </div>

          {/* Minimal bottom spacer so layout stays balanced without blocking pillars */}
          <div className="h-2 sm:h-3" aria-hidden />
        </div>
      )}

      {/* ============ CLEAN IN-GAME TOP HUD (ONLY ESSENTIALS VISIBLE!) ============ */}
      {ui && !demo && !bowShopOpen && (
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start gap-x-3 gap-y-1.5 p-2 transition-all duration-300 sm:p-3.5 ${
            dying || dead ? '-translate-y-6 opacity-0' : 'g-hud-top-in opacity-100'
          }`}
        >
          {/* Top-Left: Purse, Kills & Player HP Bar */}
          <div className="order-1">
            <div className="flex gap-2.5 pl-1 sm:gap-3.5">
              <Pill
                label={tx('Coins', 'Koin')}
                icon={<span key={ui.bump} className="g-bump-icon block"><Coins className="h-7 w-9 sm:h-9 sm:w-11" /></span>}
              >
                <span key={ui.bump} className="g-bump inline-block">{ui.shown}</span>
              </Pill>
              <Pill label={tx('Total enemies defeated', 'Total musuh tumbang')} icon={<Skull className="h-8 w-8 sm:h-10 sm:w-10" hole="#111" />}>
                {ui.totalKills}
              </Pill>
            </div>
            <div className="mt-1.5 flex items-center gap-2 pl-0.5" aria-label={tx(`HP ${ui.hp} of ${ui.maxHp}`, `Nyawa ${ui.hp} dari ${ui.maxHp}`)}>
              <svg viewBox="0 0 24 24" className={`h-8 w-8 shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)] sm:h-10 sm:w-10 ${hpPct <= 30 ? 'g-pulse' : ''}`} aria-hidden>
                <path d="M12 20.5S3.5 15 3.5 9a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2c0 6-8.5 11.5-8.5 11.5z" fill={hpPct <= 30 ? '#ff5a4f' : '#5cf08a'} stroke="#031a24" strokeWidth="1.5" />
              </svg>
              <div className="h-3.5 w-28 overflow-hidden rounded-full border-2 border-[#031a24] bg-black/65 sm:h-4 sm:w-36">
                <div className={`h-full transition-all duration-300 ${hpPct <= 30 ? 'bg-[#ff5a4f]' : 'bg-[#5cf08a]'}`} style={{ width: `${hpPct}%` }} />
              </div>
              <span className="font-game g-outline text-sm text-white tabular-nums sm:text-base">{ui.hp}</span>
            </div>
          </div>

          {/* Top-Center: Castle Progress Bar */}
          <div className="order-3 mx-auto w-full max-w-[420px] sm:order-2 sm:w-auto sm:flex-1" aria-label={tx(`Level ${ui.level}, ${ui.kills} of ${ui.total} enemies`, `Level ${ui.level}, ${ui.kills} dari ${ui.total} musuh`)}>
            <div className="flex items-center">
              <Castle n={ui.level} color="#2a78d8" />
              <div className="relative -mx-1.5 h-3 flex-1 overflow-hidden bg-[#06202e]/90 sm:h-3.5">
                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#2a78d8] to-[#a9dcff] transition-all duration-500" style={{ width: `${pct}%` }} />
                <div className="absolute inset-x-0 top-0 h-1 bg-white/15" />
              </div>
              <Castle n={ui.level + 1} color="#06202e" />
            </div>
            <div className="relative mx-auto -mt-0.5 flex w-fit items-center gap-1.5 rounded-md bg-[#a7c3c8]/92 px-2.5 py-0.5 shadow">
              <span className="absolute -top-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-[#a7c3c8]/92" />
              <Skull className="relative h-4 w-4 sm:h-5 sm:w-5" hole="#06202e" />
              <span className="font-game relative text-sm leading-none text-[#06202e] tabular-nums sm:text-base">{ui.kills}/{ui.total}</span>
              {ui.level % 3 === 2 && <span className="font-game relative rounded bg-[#9c5618] px-1.5 text-[10px] leading-4 text-[#ffe8a3]">{tx('FORT', 'ISTANA')}</span>}
              {ui.boss && <span className="font-game relative rounded bg-[#e5352f] px-1.5 text-[10px] leading-4 text-white">{tx('BOSS', 'BOS')}</span>}
              {ui.maxPower && <span className="font-game relative rounded bg-[#f47a00] px-1.5 text-[10px] leading-4 text-white">MAX</span>}
              {ui.hostage > 0 && (
                <span
                  aria-label={ui.hostage === 2 ? tx('Hostage freed', 'Tawanan bebas') : tx('Free the hostage', 'Bebaskan tawanan')}
                  className={`font-game relative flex items-center gap-1 rounded px-1.5 text-[10px] leading-4 text-white ${ui.hostage === 2 ? 'bg-[#2fae3c]' : 'bg-[#d98a00]'}`}
                >
                  {ui.hostage === 2 ? tx('FREED', 'BEBAS') : tx('HOSTAGE', 'TAWANAN')}
                </span>
              )}
            </div>
          </div>

          {/* Top-Right: Only Sound & Pause */}
          <div className="pointer-events-auto order-2 ml-auto flex items-center gap-1.5 sm:order-3 sm:gap-2">
            <Btn
              tone="dark"
              label={mute ? tx('Unmute sound', 'Nyalakan suara') : tx('Mute sound', 'Matikan suara')}
              onClick={onMute}
              className="h-10 w-10"
            >
              {sound}
            </Btn>
            <Btn
              tone="orange"
              label={tx('Pause & Gear Menu', 'Jeda & Menu Perlengkapan')}
              onClick={() => w()?.setPaused(true)}
              className="h-10 w-10"
            >
              <Ico d={I.pause} className="h-5 w-5" />
            </Btn>
          </div>
        </div>
      )}

      {/* ============ RUN HUD, NOTIFICATIONS & DEBUG ============ */}
      {ui && !demo && !bowShopOpen && ui.stage === 'play' && !ui.paused && <RunHud ui={ui} w={w} />}
      {ui && <Toasts ui={ui} />}
      {ui && !demo && ui.debug && (
        <button onClick={() => setDbgOpen((o) => !o)} className="font-game absolute right-2 top-[3.7rem] z-40 rounded-lg border-2 border-[#031a24] bg-[#ff5a4f] px-2 py-1 text-[10px] text-white sm:top-16">DBG</button>
      )}
      {dbgOpen && ui?.debug && <DebugPanel w={w} onClose={() => setDbgOpen(false)} />}

      {/* ============ DRAG GESTURE HINT ============ */}
      {ui?.hint && !demo && !bowShopOpen && ui.stage === 'play' && !ui.paused && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[16%] z-10 flex flex-col items-center gap-3">
          <div className="relative h-14 w-28">
            <span className="absolute right-3 top-2 h-9 w-9 rounded-full border-[3px] border-dashed border-white/60" />
            <span className="g-drag absolute right-5 top-4 h-5 w-5 rounded-full bg-white shadow-[0_0_0_6px_rgba(255,255,255,0.25)]" />
          </div>
          <span className="font-game g-outline text-lg text-white sm:text-xl">{tx('DRAG & RELEASE', 'TARIK & LEPAS')}</span>
        </div>
      )}

      {/* ============ CINEMATIC SLOW-MO DEFEAT OVERLAY (STAGE === 'DYING') ============ */}
      {dying && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between overflow-hidden">
          <div className="g-letterbox-top h-9 w-full bg-gradient-to-b from-[#020a10] to-[#020a10]/85 shadow-lg sm:h-12" />
          <div className="flex flex-col items-center justify-center px-4">
            <div className="g-ko-banner rounded-2xl border-y-2 border-[#ff5a4f]/70 bg-gradient-to-r from-transparent via-[#2b0508]/80 to-transparent px-10 py-2 text-center">
              <span className="font-game g-title block text-4xl text-[#ff5a4f] sm:text-6xl">{tx('DEFEATED!', 'TUMBANG!')}</span>
              {ui && <span className="font-game mt-1 block text-sm text-white sm:text-base">{tx('KILLED BY', 'DIBUNUH OLEH')}: {ui.run.killedBy}</span>}
            </div>
          </div>
          <div className="g-letterbox-bot h-9 w-full bg-gradient-to-t from-[#020a10] to-[#020a10]/85 shadow-lg sm:h-12" />
        </div>
      )}

      {/* ============ PAUSE MODAL (HOUSES ALL SECONDARY MENUS CLEANLY!) ============ */}
      {ui?.paused && !demo && !bowShopOpen && !skinOpen && !bossCodexOpen && (
        <Panel ribbon={tx('PAUSED', 'JEDA')} tone="blue">
          <div className="flex items-center justify-center gap-4 pt-1">
            <Btn tone="dark" label={tx('Main Menu', 'Ke Menu Utama')} onClick={triggerExitTransition} className="h-14 w-14">
              <Ico d={I.home} className="h-7 w-7" />
            </Btn>
            <Btn tone="green" label={tx('Resume Game', 'Lanjutkan Permainan')} onClick={() => w()?.setPaused(false)} className="h-20 w-20">
              <Ico d={I.play} className="h-11 w-11" />
            </Btn>
            <Btn
              tone="dark"
              label={tx('Start new run', 'Mulai run baru')}
              onClick={() => triggerQuickAction(() => w()?.retry())}
              className="h-14 w-14"
            >
              <Ico d={I.retry} className="h-7 w-7" />
            </Btn>
          </div>

          {/* Tucked-away Secondary Menus neatly accessible in Pause */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Btn
              tone="green"
              label={tx('Switch Bow', 'Ganti Busur')}
              onClick={() => {
                w()?.setPaused(false);
                setBowShopOpen(true);
                w()?.previewShot();
              }}
              className="h-12 flex-col gap-0.5 py-1 text-xs"
            >
              <span className="text-base">🏹</span>
              <span>{tx('BOW', 'BUSUR')}</span>
            </Btn>
            <Btn
              tone="dark"
              label={tx('Change Head Skin', 'Ganti Skin Kepala')}
              onClick={openSkin}
              className="h-12 flex-col gap-0.5 py-1 text-xs text-[#ffd93b]"
            >
              <span className="text-base">🎭</span>
              <span>SKIN</span>
            </Btn>
            <Btn
              tone="red"
              label={tx('Enemy & Boss Codex', 'Kamus Musuh & Bos')}
              onClick={() => setBossCodexOpen(true)}
              className="h-12 flex-col gap-0.5 py-1 text-xs"
            >
              <span className="text-base">📖</span>
              <span>{tx('CODEX', 'KAMUS')}</span>
            </Btn>
          </div>

          <Btn tone="dark" onClick={() => setMetaOpen(true)} className="mt-3 h-10 w-full text-xs text-[#f5d99c]">{tx('SKILL TREE / PERMANENT PROGRESS', 'SKILL TREE / PROGRES PERMANEN')}</Btn>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-black/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <Castle n={ui.level} color="#2a78d8" small />
              <span className="font-game text-sm text-cyan-100">{ui.theme.toUpperCase()}</span>
            </div>
            <div className="flex items-center gap-2">
              <LangToggle compact />
              <Btn tone="dark" label={tx('Switch distance', 'Ubah jarak')} onClick={() => w()?.cycleRange()} className="h-10 px-2.5 text-xs">
                🔭 {ui.rangeMult}×
              </Btn>
              <Btn tone="dark" label={mute ? tx('Unmute sound', 'Nyalakan suara') : tx('Mute sound', 'Matikan suara')} onClick={onMute} className="h-10 w-10">
                {sound}
              </Btn>
            </div>
          </div>
        </Panel>
      )}

      {/* ============ ROGUELITE: PICK CARD → CHOOSE ROUTE → CHEST ============ */}
      {ui && !demo && !ui.paused && !bowShopOpen && ui.stage === 'shop' && <CardPickPanel ui={ui} w={w} />}
      {ui && !demo && !ui.paused && !bowShopOpen && ui.stage === 'route' && <RoutePanel ui={ui} w={w} />}
      {ui && !demo && !ui.paused && !bowShopOpen && ui.stage === 'chest' && <ChestPanel ui={ui} w={w} />}

      {/* ============ DEATH SCREEN ============ */}
      {dead && ui && !ui.paused && !bowShopOpen && <DeathPanel ui={ui} w={w} onMenu={triggerExitTransition} onMeta={() => setMetaOpen(true)} />}

      {/* ============ PROGRESS MODAL ============ */}
      {metaOpen && (
        <MetaModal
          ui={ui}
          w={w}
          onClose={() => setMetaOpen(false)}
          onDaily={() => {
            setMetaOpen(false);
            const g = w();
            if (!g) return;
            if (g.demo) { g.queueDaily = true; triggerStartTransition(1, tx('DAILY CHALLENGE!', 'TANTANGAN HARIAN!'), modLabel(dailyInfo(new Date()).mod)); }
            else g.newRun(true);
          }}
        />
      )}

      {/* ============ BOW SHOP MODAL ============ */}
      {bowShopOpen && (
        <BowShopModal
          selected={activeBow}
          onSelect={(b) => w()?.setBow(b)}
          lockOf={(b) => (w()?.bowOk(b) === false ? (() => { const u = unlockOf(`bow:${b}`); return u ? unlockLabel(u) : tx('LOCKED', 'TERKUNCI'); })() : null)}
          onClose={() => setBowShopOpen(false)}
          onSpawnAxeBoss={() => {
            setBowShopOpen(false);
            setCodexTab('boss');
            setBossCodexOpen(true);
          }}
          mute={mute}
          onMute={onMute}
        />
      )}

      {/* ============ BOSS CODEX ============ */}
      {bossCodexOpen && codexTab === 'boss' && (
        <BossCodexModal
          onClose={closeCodex}
          onFightBoss={fightSpecificBoss}
          onEnemies={() => setCodexTab('musuh')}
        />
      )}

      {/* ============ HEAD SKIN MODAL ============ */}
      {skinOpen && <SkinModal selected={ui?.skin.id ?? head} bow={activeBow} onSelect={pickHead} onClose={closeSkin} lockOf={(h) => w()?.headOk(h) === false ? (() => { const u = unlockOf(COSMETICS.lockedHats[h]); return u ? unlockLabel(u) : tx('LOCKED', 'TERKUNCI'); })() : null} />}

      {/* ============ ENEMY & WOODEN FORT CODEX ============ */}
      {bossCodexOpen && codexTab === 'musuh' && (
        <EnemyCodexModal onClose={closeCodex} onBosses={() => setCodexTab('boss')} onFight={fightSpecial} />
      )}
    </div>
  );
}
