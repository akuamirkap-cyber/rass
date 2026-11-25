import { CSSProperties, useEffect, useId, useRef, useState } from 'react';
import { SKILL_BRANCHES, SKILL_NODES, SKILL_PRICE, SKILL_RULES, SKILL_TREE_ART, SkillBranch, SkillId, SkillNodeDef, TrainingBonuses, branchName, skillDesc, skillName, skillShort } from './game/ragdoll/config';
import type { MetaSave } from './game/ragdoll/meta';
import {
  SKILL_BY, formatSkillEffect, skillCost, skillEffectName, skillListCost, skillProgress, skillRank, skillRequirements, skillState,
} from './game/ragdoll/progression';
import { audioInit, snd } from './game/ragdoll/audio';
import { SkillGlyph, TreeArcher } from './SkillTreeArt';
import { tx, useLang } from './i18n';
import './skill-tree-game.css';

type TreeIconName = SkillNodeDef['icon'] | 'lock' | 'coin' | 'check';
const STROKE_ICONS: Partial<Record<TreeIconName, string>> = {
  shield: 'M12 2 3 6v6c0 5 5 8 9 10 4-2 9-5 9-10V6l-9-4zM8 12l3 3 6-7',
  check: 'm5 12 4 4L20 5',
};
export function TreeIcon({ icon, className = '' }: { icon: TreeIconName; className?: string }) {
  const d = STROKE_ICONS[icon];
  if (!d) return <SkillGlyph icon={icon as SkillNodeDef['icon'] | 'coin' | 'lock'} className={className} />;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={d} /></svg>;
}

const branchOf = (node: SkillNodeDef) => SKILL_BRANCHES.find((b) => b.id === node.branch)!;
const themeStyle = (branch: SkillBranch): CSSProperties => ({
  '--branch-color': SKILL_BRANCHES.find((b) => b.id === branch)!.color,
  '--branch-top': SKILL_TREE_ART.branches[branch].top,
  '--branch-bottom': SKILL_TREE_ART.branches[branch].bottom,
}) as CSSProperties;

/* ------------------------------------------------------------------
   RASI MATA PANAH — the archer's shaft enters the notch on the left and the
   stars fan out into a broadhead aimed right: KECEPATAN forms the upper edge,
   AKURASI the central ridge, KETAHANAN the lower edge, and the three
   masteries meet in the tip: MATA PANAH LEGENDA. Positions live in config.
   ------------------------------------------------------------------ */
type Pt = [number, number];
const VW = 1000; const VH = 640;
const ROOT: Pt = [70, 320];
const P = (id: SkillId): Pt => [SKILL_BY[id].x, SKILL_BY[id].y];
const LABEL: Partial<Record<SkillId, 'above' | 'left'>> = {
  speed: 'left', vitality: 'left', tailwind: 'above', trajectory: 'above', headhunter: 'above', recovery: 'above', supply: 'above',
};
const BRANCH_TAG: Partial<Record<SkillBranch, Pt>> = { speed: [300, 56], accuracy: [180, 268], vitality: [300, 584] };
const OUTLINE: SkillId[] = ['speed', 'reload', 'tailwind', 'full_speed', 'legend', 'full_vitality', 'armor', 'recovery', 'vitality', 'accuracy'];
/** direct parents only: transitive requirements stay in the detail card */
const directParents = (n: SkillNodeDef) => n.requires.filter((r) => !n.requires.some((o) => SKILL_BY[o.id].requires.some((p) => p.id === r.id))).map((r) => r.id);
const LINKS = SKILL_NODES.flatMap((n) => {
  const parents = directParents(n);
  return (parents.length ? parents : ['root' as const]).map((pid) => ({ key: `${pid}-${n.id}`, child: n.id, branch: n.branch, from: pid === 'root' ? ROOT : P(pid), to: P(n.id) }));
});
const STARS = (() => {
  let s = 20240611;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 110 }, (_, i) => ({ x: r() * VW, y: r() * VH, r: 0.5 + r() * 1.5, o: 0.2 + r() * 0.6, tw: i % 3 === 0, d: r() * 4 }));
})();
const X = (x: number) => `${(x / VW) * 100}%`;
const Y = (y: number) => `${(y / VH) * 100}%`;
const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 0}%`;
const SALE = Math.round(SKILL_PRICE.discount * 100);
const VISIBLE_BRANCHES = SKILL_BRANCHES.filter((b) => !b.hidden);

/** level ring: one arc segment per training level */
function LevelRing({ max, level }: { max: number; level: number }) {
  const R = 47;
  if (max <= 1) return <svg className="cn-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r={R} className={`seg ${level ? 'on' : ''}`} /></svg>;
  const span = (Math.PI * 2) / max; const gap = 0.26;
  const at = (a: number) => `${(50 + R * Math.cos(a)).toFixed(2)} ${(50 + R * Math.sin(a)).toFixed(2)}`;
  return (
    <svg className="cn-ring" viewBox="0 0 100 100" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => {
        const a0 = -Math.PI / 2 + i * span + gap / 2; const a1 = a0 + span - gap;
        return <path key={i} d={`M ${at(a0)} A ${R} ${R} 0 0 1 ${at(a1)}`} className={`seg ${i < level ? 'on' : ''}`} />;
      })}
    </svg>
  );
}

export default function SkillTree({ meta, onBuy, inRun }: { meta: MetaSave; onBuy: (id: SkillId) => boolean; inRun: boolean }) {
  useLang();
  const uid = useId().replace(/:/g, '');
  const [selected, setSelected] = useState<SkillId>(() => SKILL_NODES.find((n) => skillState(meta, n.id) === 'available')?.id ?? 'speed');
  const [burst, setBurst] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const node = SKILL_BY[selected];
  const branch = branchOf(node);
  const rank = skillRank(meta, selected);
  const state = skillState(meta, selected);
  const cost = skillCost(meta, selected);
  const listCost = skillListCost(meta, selected);
  const total = skillProgress(meta);
  const requirements = skillRequirements(meta, selected);
  const effects = Object.entries(node.effects) as [keyof TrainingBonuses, number][];
  const next = Math.min(rank + 1, node.maxLv);
  const choose = (id: SkillId) => { audioInit(); snd.tap(); setSelected(id); setAnnouncement(''); };
  const chooseBranch = (b: SkillBranch) => {
    const nodes = SKILL_NODES.filter((n) => n.branch === b);
    choose((nodes.find((n) => skillState(meta, n.id) === 'available') ?? nodes[0]).id);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // phones: the sky is wider than the screen, keep the chosen star in view
  useEffect(() => {
    const el = fitRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 2) return;
    el.scrollTo({ left: Math.max(0, (node.x / VW) * el.scrollWidth - el.clientWidth / 2), behavior: 'smooth' });
  }, [node.x]);

  const purchase = () => {
    audioInit();
    if (!onBuy(selected)) return;
    setBurst(`${selected}-${next}`);
    setAnnouncement(next === node.maxLv ? `${skillName(node)}: ${tx('MAX LEVEL!', 'LEVEL MAKSIMAL!')}` : `${skillName(node)} ${tx(`UPGRADED TO LEVEL ${next}`, `NAIK KE LEVEL ${next}`)}`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setBurst(''), SKILL_RULES.purchaseMotionMs);
  };

  const tone = (child: SkillId): 'on' | 'open' | 'off' => (skillRank(meta, child) > 0 ? 'on' : skillState(meta, child) !== 'locked' ? 'open' : 'off');
  const order = { off: 0, open: 1, on: 2 } as const;
  const links = LINKS.map((l) => ({ ...l, tone: tone(l.child) })).sort((a, b) => order[a.tone] - order[b.tone]);
  const colorOf = (b: SkillBranch) => SKILL_BRANCHES.find((x) => x.id === b)!.color;
  const outline = OUTLINE.map((id) => P(id).join(',')).join(' ');
  const category = node.apex ? tx('LEGEND APEX', 'PUNCAK LEGENDA') : node.mastery ? tx('MASTERY PEAK', 'PUNCAK KEAHLIAN') : `${tx('PATH OF', 'JALUR')} ${branchName(branch)}`;

  return (
    <div className="st-layout">
      <section className="st-board" aria-label={tx('Arrowhead constellation skill tree', 'Pohon skill rasi mata panah')}>
        <div className="cn-fit" ref={fitRef}>
          <div className="cn-stage">
            <svg className="cn-sky" viewBox={`0 0 ${VW} ${VH}`} aria-hidden="true">
              <defs>
                <radialGradient id={`${uid}-neb-a`}><stop offset="0" stopColor="#2bb6c9" stopOpacity=".2" /><stop offset="1" stopColor="#2bb6c9" stopOpacity="0" /></radialGradient>
                <radialGradient id={`${uid}-neb-b`}><stop offset="0" stopColor="#ffc24a" stopOpacity=".16" /><stop offset="1" stopColor="#ffc24a" stopOpacity="0" /></radialGradient>
                <linearGradient id={`${uid}-head`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#69d5ff" stopOpacity=".05" /><stop offset="1" stopColor="#ffd34e" stopOpacity=".16" /></linearGradient>
              </defs>
              <ellipse cx="200" cy="320" rx="300" ry="260" fill={`url(#${uid}-neb-a)`} />
              <ellipse cx="820" cy="320" rx="260" ry="220" fill={`url(#${uid}-neb-b)`} />
              {STARS.map((s, i) => (
                <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} className={`cn-star ${s.tw ? 'tw' : ''}`} style={s.tw ? { animationDelay: `${-s.d}s` } : undefined} />
              ))}
              {/* the broadhead silhouette, its notch and centre ridge */}
              <polygon points={outline} className="cn-head-fill" fill={`url(#${uid}-head)`} />
              <path className="cn-deco" d={`M ${P('speed').join(' ')} L ${P('accuracy').join(' ')} L ${P('vitality').join(' ')}`} />
              <path className="cn-ridge" d={`M ${P('accuracy').join(' ')} L ${P('full_accuracy').join(' ')}`} />
              <path className="cn-shaft" d={`M 0 ${ROOT[1]} L ${ROOT[0]} ${ROOT[1]}`} />
              {links.map((l) => {
                const d = `M ${l.from[0]} ${l.from[1]} L ${l.to[0]} ${l.to[1]}`;
                return (
                  <g key={l.key} style={{ '--c': colorOf(l.branch) } as CSSProperties}>
                    {l.tone === 'on' && <path d={d} className="cn-link-glow" />}
                    <path d={d} className={`cn-link ${l.tone}`} />
                    {l.tone === 'on' && <path d={d} className="cn-flow" />}
                  </g>
                );
              })}
            </svg>

            <div className="cn-root" style={{ left: X(ROOT[0]), top: Y(ROOT[1]) }}>
              <span className="cn-root-ring"><TreeArcher /></span>
              <span className="cn-root-label font-game">{tx('ARCHER', 'PEMANAH')}<small>{tx('PATH ORIGIN', 'AWAL JALUR')}</small></span>
            </div>

            {VISIBLE_BRANCHES.map((b) => {
              const p = skillProgress(meta, b.id); const at = BRANCH_TAG[b.id]; if (!at) return null;
              const bName = branchName(b);
              return (
                <button key={b.id} type="button" className={`cn-tag ${branch.id === b.id ? 'is-active' : ''}`} style={{ left: X(at[0]), top: Y(at[1]), ...themeStyle(b.id) }} onClick={() => chooseBranch(b.id)} aria-label={tx(`Select ${bName} path`, `Pilih jalur ${bName}`)}>
                  <span className="dot"><SkillGlyph icon={SKILL_BY[b.id as SkillId]?.icon ?? 'target'} /></span>
                  <b className="font-game">{bName}</b>
                  <small>{p.current}/{p.max}</small>
                </button>
              );
            })}

            {SKILL_NODES.map((n) => {
              const level = skillRank(meta, n.id); const status = skillState(meta, n.id); const isSelected = selected === n.id;
              return (
                <button
                  key={n.id} type="button" data-skill-id={n.id} data-state={status}
                  className={`cn-node st-${status} ${n.mastery ? 'is-mastery' : ''} ${n.apex ? 'is-apex' : ''} ${isSelected ? 'is-selected' : ''} ${level > 0 ? 'is-learned' : ''}`}
                  style={{ left: X(n.x), top: Y(n.y), ...themeStyle(n.branch) }}
                  aria-label={`${skillName(n)}, LEVEL ${level}/${n.maxLv}, ${status === 'mastered' ? tx('MAXED', 'MAKSIMAL') : status === 'locked' ? tx('LOCKED', 'TERKUNCI') : status === 'available' ? tx('UPGRADEABLE', 'BISA DINAIKKAN') : tx('OPEN', 'TERBUKA')}`}
                  aria-pressed={isSelected} onClick={() => choose(n.id)}
                >
                  <LevelRing max={n.maxLv} level={level} />
                  <span className="cn-core"><SkillGlyph icon={n.icon} /></span>
                  {(n.mastery || n.apex) && <span className="cn-crown"><SkillGlyph icon="crown" /></span>}
                  {status === 'available' && <span className="cn-badge cn-plus font-game">+</span>}
                  {status === 'locked' && <span className="cn-badge cn-lock"><TreeIcon icon="lock" /></span>}
                  {status === 'mastered' && <span className="cn-badge cn-max"><TreeIcon icon="check" /></span>}
                  <span className={`cn-label ${LABEL[n.id] ?? 'below'}`}>
                    <b className="font-game">{skillShort(n)}</b>
                    <small>{status === 'mastered' ? tx('MAX', 'MAKS') : `${level}/${n.maxLv}`}</small>
                  </span>
                  {burst.startsWith(`${n.id}-`) && <span key={burst} className="cn-burst" />}
                </button>
              );
            })}

            <div className="cn-title">
              <span className="cn-kicker">{tx('TRAINING MAP', 'PETA LATIHAN')}</span>
              <b className="font-game">{tx('ARROWHEAD CONSTELLATION', 'RASI MATA PANAH')}</b>
            </div>
          </div>
        </div>
      </section>

      <aside className="sd" style={themeStyle(branch.id)} aria-label={tx('Skill details', 'Detail skill')}>
        <div className="sd-card" key={selected}>
          <div className="sd-head">
            <span className="sd-badge"><SkillGlyph icon={node.icon} /></span>
            <div className="sd-title">
              <small className="font-game">{category}</small>
              <h3 className="font-game">{skillName(node)}</h3>
            </div>
          </div>
          <div className="sd-lv">
            <span className="sd-track" aria-label={tx(`${rank} of ${node.maxLv} levels`, `${rank} dari ${node.maxLv} level`)}>
              {Array.from({ length: node.maxLv }, (_, i) => <i key={i} className={i < rank ? 'on' : ''} />)}
            </span>
            <b className="font-game">LV {rank}<small>/{node.maxLv}</small></b>
          </div>
          <p className="sd-desc">{skillDesc(node)}</p>
          <div className="sd-effects">
            {effects.map(([key, amount]) => {
              const related = SKILL_NODES.filter((n) => n.branch === node.branch);
              const currentValue = node.mastery ? related.reduce((sum, n) => sum + (n.effects[key] ?? 0) * skillRank(meta, n.id), 0) : amount * rank;
              const maxValue = node.mastery ? related.reduce((sum, n) => sum + (n.effects[key] ?? 0) * n.maxLv, 0) : amount * node.maxLv;
              const nextValue = node.mastery && state === 'locked' ? maxValue : currentValue + amount * (next - rank);
              return (
                <div className="sd-eff" key={key}>
                  <span className="lbl">{skillEffectName(key)}{node.mastery && ` · ${tx('PATH', 'JALUR')}`}</span>
                  <span className="val font-game"><b>{formatSkillEffect(key, currentValue)}</b><i>›</i><b className="nx">{formatSkillEffect(key, nextValue)}</b></span>
                  <small>{tx('MAX', 'MAKS')} {formatSkillEffect(key, maxValue)}</small>
                </div>
              );
            })}
          </div>
          {requirements.length > 0 && (
            <div className="sd-req">
              {requirements.map((r) => (
                <button key={r.id} onClick={() => choose(r.id)} className={r.met ? 'met' : ''} title={skillName(SKILL_BY[r.id])}>
                  <TreeIcon icon={r.met ? 'check' : 'lock'} /><span>{skillShort(SKILL_BY[r.id])}</span><strong>{Math.min(r.current, r.level)}/{r.level}</strong>
                </button>
              ))}
            </div>
          )}
          <div className="sd-buy">
            {cost !== null && (
              <div className="sd-price">
                {listCost !== null && listCost > cost && <s>{listCost}</s>}
                <TreeIcon icon="coin" /><b className="font-game">{cost}</b>
                {listCost !== null && listCost > cost && <em className="font-game">−{SALE}%</em>}
              </div>
            )}
            <button type="button" className={`st-buy font-game ${state === 'mastered' ? 'is-max' : ''}`} disabled={state !== 'available'} onClick={purchase}>
              {state === 'mastered' ? <><TreeIcon icon="check" />{tx('MAXED', 'MAKSIMAL')}</>
                : state === 'locked' ? <><TreeIcon icon="lock" />{tx('LOCKED', 'TERKUNCI')}</>
                : state === 'poor' ? tx('NOT ENOUGH COINS', 'KOIN KURANG')
                : <>{rank === 0 ? tx('LEARN', 'PELAJARI') : `${tx('UPGRADE LV', 'NAIK LV')} ${next}`}<span className="st-buy-plus">+</span></>}
            </button>
          </div>
          <p className="sd-note">
            {state === 'poor' && cost !== null ? tx(`NEED ${Math.max(0, cost - meta.coins)} MORE COINS`, `BUTUH ${Math.max(0, cost - meta.coins)} KOIN LAGI`)
              : state === 'locked' ? tx('COMPLETE PREREQUISITES FIRST', 'SELESAIKAN PRASYARAT DULU')
              : state === 'mastered' ? tx('TRAINING COMPLETE', 'LATIHAN TUNTAS')
              : inRun ? tx('ACTIVE ON NEXT RUN', 'AKTIF DI RUN BERIKUTNYA') : tx('PERMANENT · KEPT ON DEATH', 'PERMANEN · TIDAK HILANG SAAT MATI')}
          </p>
        </div>

        <div className="sd-sum">
          <div className="sd-total"><span>{tx('TOTAL TRAINING', 'TOTAL LATIHAN')}</span><b className="font-game">{total.current}<small>/{total.max}</small></b></div>
          <span className="sd-bar" aria-hidden="true"><i style={{ width: pct(total.current, total.max) }} /></span>
          <span className="st-sale font-game"><TreeIcon icon="coin" />{tx('ALL SKILLS', 'SEMUA SKILL')} −{SALE}%</span>
        </div>
        <div className="sd-legend" aria-hidden="true">
          <span><i className="lg-up">+</i>{tx('AVAILABLE', 'BISA NAIK')}</span>
          <span><i className="lg-on" />{tx('LEARNED', 'DIPELAJARI')}</span>
          <span><i className="lg-lock" />{tx('LOCKED', 'TERKUNCI')}</span>
          <span><i className="lg-max" />{tx('MAXED', 'MAKSIMAL')}</span>
        </div>
      </aside>
      <div className="sr-only" aria-live="polite">{announcement}</div>
    </div>
  );
}
