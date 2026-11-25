// "MENUJU LEVEL X": peta perjalanan bergaya art game (A → … → F BOS), pratinjau tujuan, pilih rute lalu berangkat.
import { ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { RagWorld, RUi } from './game/ragdoll/game';
import { CFG } from './game/ragdoll/config';
import { encounterPlan, levelCounts, levelReward } from './game/ragdoll/formulas';
import { THEMES } from './game/ragdoll/scenery';
import { audioInit, snd } from './game/ragdoll/audio';
import { SceneArt, TreeArcher } from './SkillTreeArt';
import { prefersReducedMotion } from './RewardCards';
import { tx, useLang } from './i18n';
import './run-panels.css';

type W = () => RagWorld | undefined;
type Route = 'aman' | 'risiko' | 'peti';
type Pt = [number, number];
type Kind = 'camp' | 'won' | 'arena' | 'fort' | 'hostage' | 'boss' | 'dragon';
type IconName = 'swords' | 'castle' | 'chain' | 'skull' | 'flame' | 'tent' | 'trophy' | 'shield' | 'chest' | 'coin' | 'heart' | 'users' | 'bat' | 'crosshair' | 'check' | 'arrow' | 'map' | 'info';

/* ---------------- icons: drawn twice (ink outline + colour) for the game's cartoon look ---------------- */
const ICON: Record<IconName, ReactNode> = {
  swords: <><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6M16 16l4 4M19 21l2-2" /><path d="M14.5 6.5 18 3h3v3l-3.5 3.5" /><path d="m5 14 4 4M7 17l-3 3M3 19l2 2" /></>,
  castle: <><path d="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z" /><path d="M18 11V4H6v7M15 22v-4a3 3 0 0 0-6 0v4M22 11V9M2 11V9M6 4V2M18 4V2M10 4V2M14 4V2" /></>,
  chain: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  skull: <><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20" /><path d="M8 20v2h8v-2" /><path d="M9 12h.01M15 12h.01" strokeWidth="3.4" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  tent: <path d="M3.5 21 14 3M20.5 21 10 3M15.5 21 12 15l-3.5 6M2 21h20" />,
  trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>,
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  chest: <><path d="M4 11h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M4 11V9a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" /><path d="M10 11v3h4v-3M4 15h6M14 15h6" /></>,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10" /><path d="M15 9.5h-4a1.75 1.75 0 0 0 0 3.5h2a1.75 1.75 0 0 1 0 3.5H9" /></>,
  heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  bat: <path d="M12 9c-.8 0-1.4.8-1.8 1.8C9 9.7 6.8 8.9 3 9.6c1.3 1 1.9 2.7 1.6 4.7 1.4-.8 3.1-.6 4.4.9.6-1.1 1.7-1.7 3-1.7s2.4.6 3 1.7c1.3-1.5 3-1.7 4.4-.9-.3-2 .3-3.7 1.6-4.7-3.8-.7-6 .1-7.2 1.2C13.4 9.8 12.8 9 12 9z" />,
  crosshair: <><circle cx="12" cy="12" r="9" /><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  arrow: <path d="M5 12h14M12 5l7 7-7 7" />,
  map: <><path d="M14.1 6.03 9.9 4a1 1 0 0 0-.84 0L3.55 6.56A1 1 0 0 0 3 7.45v12.03a1 1 0 0 0 1.45.89l4.45-2.22a1 1 0 0 1 .89 0l4.31 2.15a1 1 0 0 0 .9 0l5.45-2.73a1 1 0 0 0 .55-.89V4.65a1 1 0 0 0-1.45-.89l-4.45 2.22a1 1 0 0 1-.89 0" /><path d="M15 5.76v15M9 3.24v15" /></>,
  info: <><path d="M12 16v-5" /><path d="M12 7.5h.01" strokeWidth="3.4" /></>,
};
function Ico({ name, className = '', ink = true }: { name: IconName; className?: string; ink?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" overflow="visible" aria-hidden="true">
      {ink && <g stroke="#031a24" strokeWidth="5.4">{ICON[name]}</g>}
      <g stroke="currentColor" strokeWidth={ink ? 2.5 : 2}>{ICON[name]}</g>
    </svg>
  );
}

/* ---------------- encounters ---------------- */
const getKinds = (): Record<Kind, { icon: IconName; label: string; title: string; desc: string }> => ({
  camp: { icon: 'tent', label: tx('CAMP', 'KEMAH'), title: tx('START CAMP', 'KEMAH AWAL'), desc: '' },
  won: { icon: 'trophy', label: tx('BOSS SLAIN', 'BOS TUMBANG'), title: tx('BOSS DEFEATED', 'BOS TUMBANG'), desc: '' },
  arena: { icon: 'swords', label: 'ARENA', title: tx('ARCHER ARENA', 'ARENA PEMANAH'), desc: tx('Defeat every enemy archer across the arena.', 'Kalahkan semua pemanah musuh di seberang arena.') },
  fort: { icon: 'castle', label: tx('WOODEN FORT', 'ISTANA KAYU'), title: tx('STURDY WOODEN FORT', 'ISTANA KAYU KOKOH'), desc: tx('Bring down the fort: aim for its foundation pegs and roof joints.', 'Robohkan istana: bidik pasak pondasi dan sendi atapnya.') },
  hostage: { icon: 'chain', label: tx('HOSTAGE', 'TAWANAN'), title: tx('RESCUE HOSTAGE', 'SELAMATKAN TAWANAN'), desc: tx(`Cut the hostage rope: +${CFG.rewards.hostage} gold & +${CFG.rewards.hostageHeal} HP.`, `Panah tali tawanan: +${CFG.rewards.hostage} emas & +${CFG.rewards.hostageHeal} HP.`) },
  boss: { icon: 'skull', label: tx('BIG BOSS', 'BOS BESAR'), title: tx('BIG BOSS', 'BOS BESAR'), desc: tx('An armed boss awaits. Victory: Double Arrow + bonus card.', 'Bos bersenjata menunggu. Menang: Panah Ganda + kartu bonus.') },
  dragon: { icon: 'flame', label: tx('RED DRAGON', 'NAGA MERAH'), title: tx('RED DRAGON', 'NAGA MERAH'), desc: tx('The dragon attacks from the sky. Victory: Double Arrow + bonus card.', 'Naga menyerang dari udara. Menang: Panah Ganda + kartu bonus.') },
});
/** a short tactical hint for the next stop: makes the map worth reading */
const getTips = (): Partial<Record<Kind, string>> => ({
  arena: tx(`Headshot = ${CFG.hitMult.head}× damage. Take out veteran archers first.`, `Headshot = damage ${CFG.hitMult.head}×. Jatuhkan pemanah veteran lebih dulu.`),
  fort: tx('Foundation pegs are the weakest. Collapsing roofs crush foes above.', 'Pasak pondasi paling rapuh. Atap yang runtuh ikut menjatuhkan musuh di atasnya.'),
  hostage: tx('Aim for the rope, not the captive. Clear nearby guards first.', 'Bidik talinya, bukan tubuhnya. Habisi penjaga di dekat tawanan dulu.'),
  boss: tx('Bosses have huge HP: keep your rhythm and aim for the head between swings.', 'HP bos sangat besar: jaga tempo dan incar kepala di sela ayunan senjatanya.'),
  dragon: tx(`Shoot its mouth while charging fire: +${CFG.rewards.dragonMouth} gold & massive damage.`, `Tembak mulut naga saat bersiap menyembur: +${CFG.rewards.dragonMouth} emas & damage besar.`),
});
const kindOf = (level: number, first: boolean, chapter: number): Kind => {
  if (first) return chapter === 0 ? 'camp' : 'won';
  const p = encounterPlan(level);
  return p.dragon ? 'dragon' : p.boss ? 'boss' : p.fort ? 'fort' : p.hostage ? 'hostage' : 'arena';
};
const rangeOf = (level: number) => (level % 3 === 0 ? 2 : level % 3 === 2 ? 1.5 : 1);

/* ---------------- map geometry (viewBox 1000 × 320) ---------------- */
const VW = 1000; const VH = 320;
const ROW_TOP = 122; const ROW_BOT = 206;
const X = (x: number) => `${(x / VW) * 100}%`;
const Y = (y: number) => `${(y / VH) * 100}%`;
const fmt = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** zig-zag stations; the crossroads segment gets extra room so its lanes never crowd */
function layout(n: number, forkAt: number): Pt[] {
  const x0 = 78; const x1 = 918;
  const weights = Array.from({ length: Math.max(1, n - 1) }, (_, i) => (i === forkAt ? 1.65 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = x0;
  return Array.from({ length: n }, (_, i) => {
    const p: Pt = [x, i % 2 === 0 ? ROW_BOT : ROW_TOP];
    if (i < n - 1) x += ((x1 - x0) * weights[i]) / sum;
    return p;
  });
}
type Cubic = [Pt, Pt, Pt, Pt];
const cubic = (a: Pt, b: Pt, lift = 0): Cubic => { const dx = b[0] - a[0]; return [a, [a[0] + dx * 0.5, a[1] - lift], [b[0] - dx * 0.5, b[1] - lift], b]; };
const cPath = ([a, c1, c2, b]: Cubic) => `M ${fmt(a)} C ${fmt(c1)} ${fmt(c2)} ${fmt(b)}`;
const cAt = ([a, c1, c2, b]: Cubic, t: number): Pt => {
  const u = 1 - t;
  return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]];
};
/** the crossroads: safe main road, a danger lane bowing away from it, and a chest camp off the road */
function roadsFor(p1: Pt, p2: Pt): Record<Route, { d: string; at: Pt }> {
  const s = p2[1] < p1[1] ? -1 : 1; // open the lanes away from the direction of travel
  const safe = cubic(p1, p2); const risky = cubic(p1, p2, 60 * s);
  const T = 0.25; const [a, c1, c2, b] = safe; // de Casteljau: the chest spur shares the first stretch of road
  const q1 = lerp(a, c1, T); const r1 = lerp(c1, c2, T); const q2 = lerp(q1, r1, T);
  const m = lerp(q2, lerp(r1, lerp(c2, b, T), T), T);
  const chest: Pt = [m[0] - 20, m[1] + 70 * s]; // a side camp, well clear of the main road's badge
  return {
    aman: { d: cPath(safe), at: cAt(safe, 0.66) },
    risiko: { d: cPath(risky), at: cAt(risky, 0.48) },
    peti: { d: `M ${fmt(a)} C ${fmt(q1)} ${fmt(q2)} ${fmt(m)} C ${fmt([m[0] + 2, m[1] + 24 * s])} ${fmt([chest[0], chest[1] - 26 * s])} ${fmt(chest)}`, at: chest },
  };
}
const fortress = (x: number, y: number) =>
  `M ${x - 74} ${y + 12} V ${y - 26} h 12 v -10 h 8 v 10 h 7 v -10 h 8 v 10 h 9 V ${y - 50} h 9 v -10 h 8 v 10 h 7 v -10 h 8 v 10 h 7 v -10 h 8 v 10 h 9 V ${y - 26} h 9 v -10 h 8 v 10 h 7 v -10 h 8 v 10 h 12 V ${y + 12} Z`;

const ROUTE_ICON: Record<Route, IconName> = { aman: 'shield', risiko: 'skull', peti: 'chest' };

function Meter({ n, kind }: { n: number; kind: 'danger' | 'reward' }) {
  const label = kind === 'danger' ? tx('DANGER', 'BAHAYA') : tx('REWARD', 'HADIAH');
  return <span className={`gx-meter ${kind}`} aria-label={tx(`${label} ${n} of 3`, `${label} ${n} dari 3`)}><em>{label}</em>{[0, 1, 2].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}

export function RoutePanel({ ui, w }: { ui: RUi; w: W }) {
  useLang();
  const KIND = getKinds();
  const TIP = getTips();
  const uid = useId().replace(/:/g, '');
  const r = ui.run; const R = CFG.route.risk; const every = CFG.bigBoss.every;
  const next = ui.level + 1;
  const chapter = Math.floor((next - 1) / every);
  const start = chapter * every;
  const cur = Math.max(0, Math.min(every - 1, ui.level - start));
  const pts = layout(every + 1, cur);
  const nodes = pts.map((p, i) => {
    const level = start + i; const kind = kindOf(level, i === 0, chapter);
    const state = i < cur ? 'done' : i === cur ? 'here' : i === cur + 1 ? 'next' : 'todo';
    return { p, i, level, kind, state, letter: 'ABCDEFGHIJ'[i] ?? '?' };
  });
  const target = nodes[cur + 1];
  const bossNode = nodes[nodes.length - 1];
  const toBoss = target.kind === 'boss' || target.kind === 'dragon';
  const bossIn = bossNode.level - next;
  const themeIndex = Math.floor((next - 1) / 3) % THEMES.length;
  const theme = THEMES[themeIndex];
  const roads = roadsFor(pts[cur], pts[cur + 1]);
  const counts = levelCounts(next); const range = rangeOf(next);
  const disabled = (k: Route) => k === 'peti' && !r.canChest;

  const [sel, setSel] = useState<Route>('aman');
  const [hover, setHover] = useState<Route | null>(null);
  const [moving, setMoving] = useState<Route | null>(null);
  const [tok, setTok] = useState<Pt>(pts[cur]);
  const pathEls = useRef<Partial<Record<Route, SVGPathElement | null>>>({});
  const raf = useRef(0);
  const born = useRef(performance.now());
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => { if (disabled(sel)) setSel('aman'); }, [r.canChest]); // eslint-disable-line react-hooks/exhaustive-deps
  // phones: the map is wider than the screen; start with the crossroads centred
  useLayoutEffect(() => {
    const el = scroller.current; if (!el || el.scrollWidth <= el.clientWidth + 2) return;
    el.scrollLeft = Math.max(0, ((pts[cur][0] + pts[cur + 1][0]) / 2 / VW) * el.scrollWidth - el.clientWidth / 2);
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (k: Route) => {
    if (moving) return;
    if (disabled(k)) { snd.deny(); return; }
    audioInit(); snd.tap(); setSel(k);
  };
  const go = (k: Route) => {
    if (moving) return;
    if (disabled(k)) { snd.deny(); return; }
    audioInit(); snd.open(); setMoving(k); setSel(k);
    const el = pathEls.current[k]; const total = el?.getTotalLength?.() ?? 0;
    const dur = prefersReducedMotion() ? 180 : k === 'peti' ? 820 : 1050;
    const t0 = performance.now(); let step = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur); const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      if (el && total) { const q = el.getPointAtLength(total * e); setTok([q.x, q.y]); }
      const s = Math.floor(t * 5); if (s > step) { step = s; snd.tap(); }
      if (t < 1) { raf.current = requestAnimationFrame(tick); return; }
      w()?.chooseRoute(k);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const latest = useRef({ select, go, sel }); latest.current = { select, go, sel };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || performance.now() - born.current < 400) return;
      const k = ({ '1': 'aman', '2': 'risiko', '3': 'peti' } as Record<string, Route>)[e.key];
      if (k) { e.preventDefault(); latest.current.select(k); return; }
      if (e.key === 'Enter') { e.preventDefault(); latest.current.go(latest.current.sel); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const preview = moving ?? hover ?? sel;
  const order = (['aman', 'risiko', 'peti'] as Route[]).sort((a, b) => Number(a === preview) - Number(b === preview));
  const routes: { k: Route; name: string; desc: string; danger: number; reward: number; stat: ReactNode }[] = [
    { k: 'aman', name: tx('SAFE ROAD', 'JALAN AMAN'), desc: tx('Standard foes. Steady path toward the boss.', 'Musuh normal. Langkah stabil menuju bos.'), danger: 1, reward: 1, stat: <span className="gx-gold font-game"><Ico name="coin" ink={false} />{tx('GOLD', 'EMAS')} ×1</span> },
    { k: 'risiko', name: tx('DANGER ROAD', 'JALAN BERBAHAYA'), desc: tx(`Foes +${Math.round((R.hp - 1) * 100)}% HP & +${Math.round((R.dmg - 1) * 100)}% damage.`, `Musuh +${Math.round((R.hp - 1) * 100)}% HP & +${Math.round((R.dmg - 1) * 100)}% damage.`), danger: 3, reward: 3, stat: <span className="gx-gold font-game"><Ico name="coin" ink={false} />{tx('GOLD', 'EMAS')} ×{R.gold}</span> },
    { k: 'peti', name: tx('VISIT CHEST', 'SINGGAH KE PETI'), desc: r.lastChest ? tx('Chest already opened. Continue onward.', 'Peti baru saja dibuka. Lanjutkan perjalanan.') : tx('1 card or full heal. No combat.', '1 kartu atau pulih penuh. Tanpa bertarung.'), danger: 0, reward: 2, stat: <span className={`gx-gold font-game ${r.canChest ? '' : 'short'}`}><Ico name="coin" ink={false} />{r.chestCost}</span> },
  ];
  const goTone = sel === 'peti' ? 'g-green' : sel === 'risiko' || toBoss ? 'g-red' : 'g-orange';
  const goLabel = moving ? tx('TRAVELING…', 'DALAM PERJALANAN…')
    : sel === 'peti' ? tx(`OPEN CHEST · ${r.chestCost} GOLD`, `BUKA PETI · ${r.chestCost} EMAS`)
    : toBoss ? tx(`FACE BOSS AT LV ${next}`, `HADAPI BOS DI LV ${next}`)
    : sel === 'risiko' ? tx('TAKE DANGER ROAD', 'AMBIL JALAN BERBAHAYA') : tx(`ADVANCE TO LV ${next}`, `BERANGKAT KE LV ${next}`);

  return (
    <div className="rp-overlay g-dead-backdrop">
      <div className="rp-wrap gx-wrap g-pop" role="dialog" aria-label={tx(`Toward level ${next}`, `Menuju level ${next}`)}>
        <div className="rp-ribbon-wrap"><div className={`rp-ribbon rp-ribbon-${toBoss ? 'red' : 'blue'} font-game`}>{tx(`TO LEVEL ${next}`, `MENUJU LEVEL ${next}`)}{toBoss ? tx(' · BOSS!', ' · BOS!') : ''}</div></div>
        <div className="g-panel gx-panel">
          <div className="gx-top">
            <div className="gx-kicker">
              <span className="flag"><Ico name="map" /></span>
              <span><b className="font-game">{tx(`CHAPTER ${chapter + 1}`, `BAB ${chapter + 1}`)} · {theme.name.toUpperCase()}</b><small>{tx('JOURNEY MAP', 'PETA PERJALANAN')}</small></span>
            </div>
            <div className="gx-chips">
              <span className="gx-chip gold font-game" aria-label={tx(`${ui.coins} gold`, `${ui.coins} emas`)}><Ico name="coin" ink={false} />{ui.coins}</span>
              <span className="gx-chip hp font-game" aria-label={tx(`HP ${ui.hp} of ${ui.maxHp}`, `HP ${ui.hp} dari ${ui.maxHp}`)}><Ico name="heart" ink={false} />{ui.hp}<small>/{ui.maxHp}</small></span>
            </div>
          </div>

          <div className="gx-frame">
            <div className="gx-scroll" ref={scroller}>
              <div className="gx-map" onMouseLeave={() => setHover(null)}>
                <SceneArt themeIndex={themeIndex} seed={chapter + 3} veilTop="rgba(3, 26, 36, 0.2)" veilBottom="rgba(3, 26, 36, 0.55)" className="gx-scene" />
                <svg className="gx-svg" viewBox={`0 0 ${VW} ${VH}`} aria-hidden="true">
                  <defs>
                    <radialGradient id={`${uid}-boss`}><stop offset="0" stopColor="#ff4a3a" stopOpacity=".55" /><stop offset="1" stopColor="#ff4a3a" stopOpacity="0" /></radialGradient>
                    <radialGradient id={`${uid}-dest`}><stop offset="0" stopColor="#fff3a8" stopOpacity=".38" /><stop offset="1" stopColor="#fff3a8" stopOpacity="0" /></radialGradient>
                  </defs>
                  <circle cx={bossNode.p[0]} cy={bossNode.p[1]} r="92" fill={`url(#${uid}-boss)`} className="gx-boss-glow" />
                  <path d={fortress(bossNode.p[0], bossNode.p[1])} fill={theme.tree} className="gx-fort" />
                  <path d={`M ${bossNode.p[0] + 56} ${bossNode.p[1] - 36} V ${bossNode.p[1] - 64} l 20 7 l -20 7`} className="gx-flag" />
                  {[-50, 50].map((dx) => <rect key={dx} x={bossNode.p[0] + dx - 4} y={bossNode.p[1] - 18} width="8" height="12" rx="3" className="gx-window" />)}
                  {!toBoss && <circle cx={target.p[0]} cy={target.p[1]} r="62" fill={`url(#${uid}-dest)`} />}

                  {pts.slice(0, -1).map((p, i) => {
                    if (i === cur) return null;
                    const d = cPath(cubic(p, pts[i + 1])); const done = i < cur;
                    return <g key={i}><path d={d} className={`gx-out ${done ? '' : 'dots'}`} /><path d={d} className={`gx-road ${done ? 'done' : 'todo'}`} /></g>;
                  })}
                  {order.map((k) => <path key={`o-${k}`} d={roads[k].d} className={`gx-out ${preview === k ? 'on' : 'dim'}`} />)}
                  {order.map((k) => (
                    <path key={k} d={roads[k].d} ref={(el) => { pathEls.current[k] = el; }} className={`gx-opt ${k} ${preview === k ? 'on' : ''} ${disabled(k) ? 'off' : ''}`} />
                  ))}
                  <path d={roads[preview].d} className="gx-flow" />
                  {(['aman', 'risiko', 'peti'] as Route[]).map((k) => (
                    <path key={`h-${k}`} d={roads[k].d} className="gx-hit" onMouseEnter={() => !moving && setHover(k)} onClick={() => select(k)} />
                  ))}
                </svg>

                {nodes.map((n) => {
                  const isBoss = n.kind === 'boss' || n.kind === 'dragon'; const here = n.state === 'here';
                  const above = n.p[1] < VH / 2;
                  return (
                    <div key={n.i} className={`gn ${n.state} ${isBoss ? 'boss' : ''} ${here && moving ? 'left' : ''}`} style={{ left: X(n.p[0]), top: Y(n.p[1]) }}>
                      <span className="gn-core">
                        {here ? <span className="gn-archer"><TreeArcher /></span> : <Ico name={n.state === 'done' ? 'check' : KIND[n.kind].icon} />}
                      </span>
                      <span className="gn-letter font-game">{n.letter}</span>
                      <span className={`gn-label ${above ? 'above' : 'below'}`}>
                        <small>{here ? tx('YOU ARE HERE', 'KAMU DI SINI') : n.state === 'next' ? `LV ${n.level} · ${tx('NEXT', 'BERIKUTNYA')}` : n.i === 0 ? tx('CHAPTER START', 'AWAL BAB') : `LV ${n.level}`}</small>
                        <b className="font-game">{here && n.i > 0 ? `LV ${n.level}` : KIND[n.kind].label}</b>
                      </span>
                    </div>
                  );
                })}

                {(['aman', 'risiko', 'peti'] as Route[]).map((k) => (
                  <button
                    key={k} type="button" disabled={disabled(k)} tabIndex={-1}
                    className={`gb ${k} ${preview === k ? 'on' : ''}`}
                    style={{ left: X(roads[k].at[0]), top: Y(roads[k].at[1]), visibility: moving ? 'hidden' : 'visible' }}
                    onMouseEnter={() => !moving && setHover(k)} onClick={() => select(k)} aria-label={tx(`Route ${k}`, `Rute ${k}`)}
                  >
                    <Ico name={ROUTE_ICON[k]} />
                  </button>
                ))}
                {moving && <div className="gx-token" style={{ left: X(tok[0]), top: Y(tok[1]) }}><span className="gx-token-ring"><TreeArcher /></span></div>}
              </div>
            </div>
          </div>

          <div className="gx-body">
            <section className={`gx-intel ${toBoss ? 'boss' : ''}`} aria-label={tx('Next destination', 'Tujuan berikutnya')}>
              <div className="gx-intel-main">
              <div className="gx-sec">{tx('NEXT STOP', 'TUJUAN BERIKUTNYA')}</div>
              <div className="gx-enc">
                <span className={`gx-enc-ico k-${target.kind}`}><Ico name={KIND[target.kind].icon} /></span>
                <div className="gx-enc-text">
                  <h3 className="font-game">{KIND[target.kind].title}</h3>
                  <p>{KIND[target.kind].desc}</p>
                </div>
              </div>
              <div className="gx-stats">
                <span className="gx-stat font-game"><Ico name="users" ink={false} />{counts.foot} {tx('FOES', 'MUSUH')}</span>
                {counts.bats > 0 && <span className="gx-stat font-game"><Ico name="bat" ink={false} />{counts.bats} {tx('BATS', 'KELELAWAR')}</span>}
                {range > 1 && <span className="gx-stat warn font-game"><Ico name="crosshair" ink={false} />{tx('RANGE', 'JARAK')} {range}×</span>}
                <span className="gx-stat gold font-game"><Ico name="coin" ink={false} />+{levelReward(next)}</span>
              </div>
              {(TIP[target.kind] || range > 1) && (
                <p className="gx-tip"><span className="ic"><Ico name="info" /></span><span>{TIP[target.kind]}{range > 1 ? tx(` Foes ${range}× farther: use full draw.`, ` Musuh ${range}× lebih jauh: tarik busur penuh.`) : ''}</span></p>
              )}
              </div>
              <div className="gx-trail">
                <span className="gx-trail-label font-game">{toBoss ? tx('BOSS FIGHT!', 'PERTARUNGAN BOS!') : tx(`BOSS IN ${bossIn} LEVELS`, `BOS DALAM ${bossIn} LEVEL`)}</span>
                <span className="gx-steps" aria-hidden="true">{nodes.slice(1).map((n) => <i key={n.i} className={`${n.state} ${n === bossNode ? 'boss' : ''}`} />)}</span>
              </div>
            </section>

            <section className="gx-routes" aria-label={tx('Choose route', 'Pilih rute')}>
              <div className="gx-sec">{tx('CHOOSE ROUTE', 'PILIH RUTE')}</div>
              <div role="radiogroup" aria-label={tx('Route', 'Rute')}>
                {routes.map(({ k, name, desc, danger, reward, stat }, i) => (
                  <button
                    key={k} type="button" role="radio" aria-checked={sel === k} disabled={disabled(k) || (!!moving && moving !== k)}
                    className={`gx-route ${k}`}
                    onClick={() => select(k)} onDoubleClick={() => go(k)} onMouseEnter={() => !moving && setHover(k)} onMouseLeave={() => setHover(null)}
                  >
                    <span className="ri"><Ico name={ROUTE_ICON[k]} /></span>
                    <span className="rt"><b className="font-game">{name}</b><small>{desc}</small></span>
                    <span className="rs">{stat}<span className="gx-meters"><Meter n={danger} kind="danger" /><Meter n={reward} kind="reward" /></span></span>
                    <kbd className="gx-key font-game" aria-hidden="true">{i + 1}</kbd>
                    {sel === k && <span className="gx-check"><Ico name="check" /></span>}
                  </button>
                ))}
              </div>
              <button type="button" className={`g-btn ${goTone} g-sheen font-game gx-go`} disabled={!!moving || disabled(sel)} onClick={() => go(sel)}>
                <span>{goLabel}</span><Ico name="arrow" />
              </button>
              <p className="gx-hint">{tx('1–3 SELECT ROUTE · ENTER EMBARK', '1–3 PILIH RUTE · ENTER BERANGKAT')}</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
