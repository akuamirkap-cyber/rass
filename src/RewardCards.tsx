// "LEVEL X CLEARED!" / boss reward / chest: clean collectible card selection UI.
import { CSSProperties, ReactNode, useEffect, useId, useRef, useState } from 'react';
import type { RagWorld, RUi } from './game/ragdoll/game';
import { CardDef, CardId, CardType, OFFER, SKILL_BRANCHES, SYNERGIES, SkillBranch, branchName as branchLabel, cardName, cardTypeLabel, synergyName } from './game/ragdoll/config';
import { SkillGlyph } from './SkillTreeArt';
import { CARD_BY, cardText } from './game/ragdoll/cards';
import { audioInit, snd } from './game/ragdoll/audio';
import { CARD_ART } from './cardArt';
import { tx, useLang } from './i18n';
import './run-panels.css';

type W = () => RagWorld | undefined;
export type RibbonTone = 'orange' | 'blue' | 'gold' | 'purple' | 'red';

/** vibrant 2D game card frame colours per card type */
export const TYPE_THEME: Record<CardType, { c1: string; c2: string; glow: string }> = {
  PANAH: { c1: '#ffd24c', c2: '#df6b08', glow: '#ffe169' },
  BERTAHAN: { c1: '#86e85f', c2: '#1f8a3c', glow: '#78f79b' },
  JALUR: { c1: '#359bd6', c2: '#104975', glow: '#69d5ff' },
  RISIKO: { c1: '#ff7d6b', c2: '#b81d29', glow: '#ff6e61' },
  KHUSUS: { c1: '#be8eff', c2: '#632ec4', glow: '#cfa8ff' },
};

/** JALUR cards wear rich, lively colours of their skill-tree branch */
const PATH_THEME: Partial<Record<SkillBranch, { c1: string; c2: string; glow: string }>> = {
  speed: { c1: '#237fb5', c2: '#0b3554', glow: '#69d5ff' },
  accuracy: { c1: '#c48f1f', c2: '#4d3206', glow: '#ffd34e' },
  vitality: { c1: '#299c5a', c2: '#0b3b28', glow: '#85e271' },
};
export const cardTheme = (d: CardDef) => ({ ...TYPE_THEME[d.type], ...(d.path ? PATH_THEME[d.path] : {}) });
const branchName = (b?: SkillBranch) => {
  const found = SKILL_BRANCHES.find((x) => x.id === b);
  return found ? branchLabel(found) : '';
};

export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------- crisp inline UI vector icons (replacing raw emojis & heavy outlines) ---------- */

function CoinIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rpCoinG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff4a8" />
          <stop offset="50%" stopColor="#ffd23f" />
          <stop offset="100%" stopColor="#d98207" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9.5" fill="url(#rpCoinG)" stroke="rgba(255,250,210,0.55)" strokeWidth="1" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="rgba(148,78,0,0.45)" strokeWidth="1.2" />
      <path d="M12 7.5v9M9.8 10.2h4.4" stroke="#9b5400" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rpHeartG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8affad" />
          <stop offset="100%" stopColor="#28b85c" />
        </linearGradient>
      </defs>
      <path d="M12 20.4S3.6 15 3.6 9.1a4.5 4.5 0 0 1 8.4-2.2 4.5 4.5 0 0 1 8.4 2.2c0 5.9-8.4 11.3-8.4 11.3z" fill="url(#rpHeartG)" />
      <path d="M7.5 7.7c.7-.9 1.8-1.1 2.7-.6" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BoltIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M13.5 2L5 13.5h6l-1.5 8.5L19 10.5h-6L13.5 2z" />
    </svg>
  );
}

function SparkIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.3 7.2L21.5 12l-7.2 2.8L12 22l-2.3-7.2L2.5 12l7.2-2.8L12 2z" />
    </svg>
  );
}

function DiceIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#fff8eb" stroke="rgba(160,75,0,0.35)" strokeWidth="1" />
      <rect x="4" y="4" width="16" height="16" rx="3.5" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1" />
      <circle cx="8.2" cy="8.2" r="1.5" fill="#1e293b" />
      <circle cx="15.8" cy="8.2" r="1.5" fill="#1e293b" />
      <circle cx="12" cy="12" r="1.6" fill="#d9480f" />
      <circle cx="8.2" cy="15.8" r="1.5" fill="#1e293b" />
      <circle cx="15.8" cy="15.8" r="1.5" fill="#1e293b" />
    </svg>
  );
}

function TypeBadgeIcon({ type }: { type: CardType }) {
  if (type === 'PANAH') {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 16L16 4M10 4h6v6" />
        <path d="M4 11l5 5" />
      </svg>
    );
  }
  if (type === 'BERTAHAN') {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        <path d="M10 2.2L3.5 5v4.6c0 4.2 2.8 7.3 6.5 8.6 3.7-1.3 6.5-4.4 6.5-8.6V5L10 2.2z" opacity="0.92" />
      </svg>
    );
  }
  if (type === 'RISIKO') {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        <path d="M10.7 2.2c.4 2.5-1.2 4-2.5 5.4-1.2 1.3-1.9 2.6-1.9 4.2a3.9 3.9 0 0 0 7.7.9c.5-2.1-.3-4.3-1.5-5.8 0 1.4-.6 2.2-1.4 2.6.3-1.6.4-4.7-.4-7.3z" />
      </svg>
    );
  }
  return <SparkIcon className="h-3.5 w-3.5" />;
}

export function PanelShell({ ribbon, tone = 'orange', size = 'lg', children }: { ribbon: ReactNode; tone?: RibbonTone; size?: 'md' | 'lg' | 'xl'; children: ReactNode }) {
  return (
    <div className="rp-overlay g-dead-backdrop">
      <div className={`rp-wrap rp-${size} g-pop`}>
        <div className="rp-ribbon-wrap"><div className={`rp-ribbon rp-ribbon-${tone} font-game`}>{ribbon}</div></div>
        <div className="rp-panel">{children}</div>
      </div>
    </div>
  );
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`rp-chip font-game ${className}`}>{children}</span>;
}

/** Plump, glossy 2D golden casual-game star with lively float/sway & animated shine sweep */
function Star2D({ lit, index, mid, delay, uid }: { lit: boolean; index: number; mid: boolean; delay: string; uid: string }) {
  const starPath = 'M32 10.5 L38.2 23.2 L52.2 25.2 L42 35 L44.4 48.8 L32 42.2 L19.6 48.8 L22 35 L11.8 25.2 L25.8 23.2 Z';
  const tilt = index === 0 ? '-10deg' : index === 2 ? '10deg' : '0deg';
  const danceDelay = `${index * 0.34}s`;
  const sweepId = `${uid}-clip-${index}`;
  return (
    <div
      className={`rp-star-slot pos-${index} ${mid ? 'mid' : ''} ${lit ? 'on' : 'off'}`}
      style={{ '--tilt': tilt, '--dance-delay': danceDelay, animationDelay: delay } as CSSProperties}
    >
      {lit && <span className="rp-star-aura" aria-hidden="true" />}
      {lit && mid && <span className="rp-star-rays" aria-hidden="true" />}
      <div className="rp-star-dance">
        <svg viewBox="0 0 64 64" className="rp-star-svg" aria-hidden="true">
          <defs>
            <clipPath id={sweepId}>
              <path d={starPath} strokeLinejoin="round" />
            </clipPath>
          </defs>
          {/* Soft grounded drop shadow beneath star */}
          <path
            d={starPath}
            transform="translate(0, 2.6)"
            fill={lit ? 'rgba(92, 34, 0, 0.48)' : 'rgba(2, 12, 18, 0.5)'}
            stroke={lit ? 'rgba(92, 34, 0, 0.48)' : 'rgba(2, 12, 18, 0.5)'}
            strokeWidth="10"
            strokeLinejoin="round"
          />
          {/* Outer rounded warm orange / slate-teal rim */}
          <path
            d={starPath}
            fill={lit ? `url(#${uid}-rim)` : '#0a2b3a'}
            stroke={lit ? `url(#${uid}-rim)` : '#0a2b3a'}
            strokeWidth="10"
            strokeLinejoin="round"
          />
          {/* Main smooth 2D golden / slate face */}
          <path
            d={starPath}
            fill={lit ? `url(#${uid}-face)` : '#144459'}
            stroke={lit ? `url(#${uid}-face)` : '#144459'}
            strokeWidth="6"
            strokeLinejoin="round"
          />
          {lit && (
            <>
              <path
                d={starPath}
                fill={`url(#${uid}-glow)`}
                stroke={`url(#${uid}-glow)`}
                strokeWidth="2"
                strokeLinejoin="round"
                opacity="0.78"
              />
              {/* Animated glossy sheen sweeping across the star */}
              <g clipPath={`url(#${sweepId})`}>
                <rect
                  x="-36"
                  y="0"
                  width="22"
                  height="64"
                  transform="skewX(-22)"
                  fill="rgba(255, 255, 255, 0.45)"
                  className="rp-star-sheen"
                />
              </g>
              {/* Glossy top-left highlight arcs */}
              <path
                d="M29.6 13.5 C28 17.5 26.8 21.5 24.4 23.8 C21.5 24.4 17.2 25 14.5 25.8"
                fill="none"
                stroke="rgba(255, 255, 255, 0.92)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="31.5" cy="12" r="1.5" fill="rgba(255, 255, 255, 0.95)" />
              <path
                d="M23 44.5 C20.5 46 21 41 21.8 37"
                fill="none"
                stroke="rgba(255, 250, 200, 0.5)"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
      </div>
      {lit && (
        <>
          <span className="rp-star-glint g1" aria-hidden="true" />
          <span className="rp-star-glint g2" aria-hidden="true" />
          <span className="rp-star-glint g3" aria-hidden="true" />
        </>
      )}
    </div>
  );
}

function Stars({ n }: { n: number }) {
  const uid = useId().replace(/:/g, '');
  useEffect(() => {
    const ids = Array.from({ length: Math.max(0, Math.min(3, n)) }, (_, i) => window.setTimeout(() => snd.star(i), 260 + i * 160));
    return () => ids.forEach((t) => window.clearTimeout(t));
  }, [n]);
  return (
    <div className="rp-stars" aria-label={tx(`${n} stars`, `${n} bintang`)}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-rim`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#ffae19" />
            <stop offset="55%" stopColor="#f47c00" />
            <stop offset="100%" stopColor="#d15200" />
          </linearGradient>
          <linearGradient id={`${uid}-face`} x1="0.25" y1="0" x2="0.75" y2="1">
            <stop offset="0%" stopColor="#fff46b" />
            <stop offset="52%" stopColor="#ffd217" />
            <stop offset="100%" stopColor="#ffa200" />
          </linearGradient>
          <radialGradient id={`${uid}-glow`} cx="45%" cy="38%" r="55%">
            <stop offset="0%" stopColor="#fffcb8" />
            <stop offset="65%" stopColor="#ffe138" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ffb700" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      {[0, 1, 2].map((i) => (
        <Star2D key={i} index={i} lit={i < n} mid={i === 1} delay={`${0.14 + i * 0.14}s`} uid={uid} />
      ))}
    </div>
  );
}

type CardState = 'idle' | 'chosen' | 'gone';

/** Card visual artwork: clean full-bleed AI-generated casual 2D illustration (zero black circle) */
function CardArtwork({ d, name }: { d: CardDef; name: string }) {
  const artSrc = CARD_ART[d.id];
  const [imgErr, setImgErr] = useState(false);

  if (artSrc && !imgErr) {
    return (
      <span className="rc-art has-img">
        <img
          src={artSrc}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgErr(true)}
          className="rc-art-img"
        />
        <span className="rc-art-vignette" aria-hidden="true" />
        <span className="rc-spark s1" /><span className="rc-spark s2" />
      </span>
    );
  }

  if (d.glyph) {
    return (
      <span className="rc-art sky">
        <span className="rc-rays" />
        <span className="rc-glyph"><SkillGlyph icon={d.glyph} /></span>
        <span className="rc-spark s1" /><span className="rc-spark s2" />
      </span>
    );
  }

  return (
    <span className="rc-art">
      <span className="rc-rays" />
      <span className="rc-fallback-icon"><TypeBadgeIcon type={d.type} /></span>
      <span className="rc-art-vignette" aria-hidden="true" />
      <span className="rc-spark s1" /><span className="rc-spark s2" />
    </span>
  );
}

/** one collectible card: tap = pick, press-and-hold = detail (current → next level) */
function RewardCard({ id, lv, index, synergy, res, state, onPick }: { id: CardId; lv: number; index: number; synergy: string | null; res: number; state: CardState; onPick: () => void }) {
  const d = CARD_BY[id]; const next = Math.min(d.maxLv, lv + 1); const t = cardTheme(d);
  const name = cardName(d);
  const typeText = d.path ? branchName(d.path) : cardTypeLabel(d.type);
  const [hold, setHold] = useState(false); const timer = useRef(0); const held = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const style = { '--c1': t.c1, '--c2': t.c2, '--glow': t.glow, '--gloss': `${1 + index * 0.35}s`, animationDelay: state === 'idle' ? `${0.12 + index * 0.12}s` : '0s' } as CSSProperties;
  return (
    <button
      type="button"
      className={`rc-card ${d.path ? 'jalur' : ''} ${state !== 'idle' ? `is-${state}` : ''}`}
      style={style}
      aria-label={`${name} (${typeText}). ${lv ? tx(`Upgrade to level ${next}`, `Naik ke level ${next}`) : tx('New card', 'Kartu baru')}: ${cardText(id, next, res)}`}
      onPointerDown={() => { held.current = false; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { held.current = true; setHold(true); }, 380); }}
      onPointerUp={() => { window.clearTimeout(timer.current); if (held.current) { setHold(false); return; } onPick(); }}
      onPointerLeave={() => { window.clearTimeout(timer.current); setHold(false); }}
      onPointerCancel={() => { window.clearTimeout(timer.current); setHold(false); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); } }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {state === 'chosen' && <span className="rc-burst" />}
      <span className="rc-inner">
        <span className="rc-head">
          <span className="rc-type"><TypeBadgeIcon type={d.type} /><b>{typeText}</b></span>
          <span className={`rc-tag font-game ${lv ? 'up' : 'new'}`}>{lv ? `LV ${next}` : tx('NEW!', 'BARU!')}</span>
        </span>
        <CardArtwork d={d} name={name} />
        <span className="rc-name font-game">{name}</span>
        <span className="rc-gems" aria-hidden="true">
          {Array.from({ length: d.maxLv }, (_, i) => <i key={i} className={i < lv ? 'own' : i < next ? 'gain' : ''} />)}
        </span>
        <span className="rc-desc">{cardText(id, next, res)}</span>
        <span className="rc-foot font-game">
          {d.path
            ? `${branchName(d.path)} · ${lv ? `LV ${lv} → ${next}` : tx('UNLOCK', 'BUKA')}`
            : lv ? `LV ${lv} → LV ${next}` : tx('NEW CARD', 'KARTU BARU')}
        </span>
      </span>
      {synergy ? (
        <span className="rc-syn font-game"><BoltIcon className="h-3 w-3 shrink-0" /> {tx('SYNERGY', 'SINERGI')}: {synergy}</span>
      ) : res > 1 && (
        <span className="rc-res font-game"><SparkIcon className="h-3 w-3 shrink-0" /> {tx('RESONANCE', 'RESONANSI')} +{Math.round((res - 1) * 100)}%</span>
      )}
      <span className="rc-key font-game" aria-hidden="true">{index + 1}</span>
      {hold && (
        <span className="rc-detail">
          <b className="font-game">{name}</b>
          <span>{tx('CURRENT', 'SEKARANG')}: {lv ? `LV${lv} · ${cardText(id, lv, res)}` : tx('NOT OWNED', 'BELUM PUNYA')}</span>
          <span className="nx">{tx('NEXT', 'BERIKUTNYA')}: LV{next} · {cardText(id, next, res)}</span>
          {d.path && <span>{tx(`RUN BONUS · ${branchName(d.path)} PATH`, `BONUS SELAMA RUN · JALUR ${branchName(d.path)}`)}{res > 1 ? ` · ${tx('RESONANCE', 'RESONANSI')} ×${res}` : ''}</span>}
        </span>
      )}
    </button>
  );
}

/** "LEVEL X CLEARED!" (also boss reward & chest card): 3 collectible cards + reroll */
export function CardPickPanel({ ui, w }: { ui: RUi; w: W }) {
  useLang();
  const r = ui.run;
  const lvOf = (id: CardId) => r.cards.find(([c]) => c === id)?.[1] ?? 0;
  const free = r.rerollCost === 0;
  const canReroll = free || r.rerollCost <= ui.coins;
  const sig = `${r.offer.join('|')}#${r.cards.map(([c, l]) => `${c}${l}`).join(',')}#${r.freeRerolls}:${r.rerollCost}`;
  const [chosen, setChosen] = useState<CardId | null>(null);
  const [info, setInfo] = useState(false);
  const lock = useRef(false);
  const born = useRef(0);
  useEffect(() => { lock.current = false; setChosen(null); born.current = performance.now(); }, [sig]);

  const title = r.pickTitle || tx(`LEVEL ${ui.level} CLEARED!`, `LEVEL ${ui.level} SELESAI!`);
  const boss = title.startsWith('BIG BOSS') || title.startsWith('HADIAH BOS');
  const chest = ui.stage === 'chest';
  const tone: RibbonTone = boss ? 'purple' : chest ? 'gold' : 'orange';

  const pick = (id: CardId) => {
    if (lock.current || !r.offer.includes(id)) return;
    lock.current = true; audioInit(); snd.pop(); setChosen(id);
    window.setTimeout(() => w()?.pickCard(id), prefersReducedMotion() ? 60 : 470);
  };
  const reroll = () => {
    if (lock.current) return;
    if (!canReroll) { snd.deny(); return; }
    audioInit(); w()?.reroll();
  };
  const latest = useRef({ pick, reroll, offer: r.offer });
  latest.current = { pick, reroll, offer: r.offer };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || performance.now() - born.current < 350) return;
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i >= 0 && latest.current.offer[i]) { e.preventDefault(); latest.current.pick(latest.current.offer[i]); }
      else if (e.key.toLowerCase() === 'r' && latest.current.offer.length) { e.preventDefault(); latest.current.reroll(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  /** picking this card would switch on a synergy right away */
  const synergyFor = (id: CardId) => {
    if (lvOf(id) > 0) return null;
    const found = SYNERGIES.find((s) => s.need.includes(id) && s.need.some((o) => o !== id && lvOf(o) > 0) && !r.synergies.includes(synergyName(s)) && !r.synergies.includes(s.name));
    return found ? synergyName(found) : null;
  };

  return (
    <PanelShell ribbon={title} tone={tone} size="lg">
      {boss ? (
        <div className="rp-boss-prize font-game"><TypeBadgeIcon type="PANAH" />{tx('DOUBLE ARROW ACQUIRED!', 'PANAH GANDA DIDAPAT!')}</div>
      ) : ui.stage === 'shop' ? (
        <Stars n={ui.stars} />
      ) : null}
      <div className="rp-chips mt-1.5">
        <Chip className="gold"><CoinIcon className="h-4 w-4 shrink-0" /><span className="tabular-nums">{ui.coins}</span></Chip>
        <Chip className="hp"><HeartIcon className="h-4 w-4 shrink-0" /><span className="tabular-nums">{ui.hp}/{ui.maxHp}</span></Chip>
        {ui.stage === 'shop' && !boss && <Chip className="plus">+{ui.reward} {tx('REWARD', 'HADIAH')}</Chip>}
      </div>
      <div className="rp-subtitle">
        <span>{tx('CHOOSE 1 CARD', 'PILIH 1 KARTU')}</span>
        <button type="button" className="rp-info-btn" aria-expanded={info} onClick={() => { audioInit(); snd.tap(); setInfo((v) => !v); }}>
          <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 7.2v4M8 4.8v.4" strokeLinecap="round" />
          </svg>
          {tx('HOW DRAFTING WORKS', 'CARA SORTIR')}
        </button>
      </div>
      {info && (
        <ul className="rp-info">
          <li><b>{tx('3 DIFFERENT TYPES', '3 JENIS BERBEDA')}</b> {tx('per hand, fixed order:', 'tiap set, urutan tetap:')} {OFFER.order.map(cardTypeLabel).join(' → ')}.</li>
          <li><b>{tx('FAIR:', 'ADIL:')}</b> {tx('skipped types appear more often and are', 'jenis yang terlewat makin sering muncul dan')} <b>{tx('guaranteed', 'dijamin keluar')}</b> {tx(`by hand #${OFFER.pityForce + 1}.`, `paling lambat set ke-${OFFER.pityForce + 1}.`)}</li>
          <li><b>REROLL</b> {tx('always shows fresh cards · no duplicates, locked cards, or maxed cards.', 'selalu kartu baru · tanpa kembar, kartu terkunci, atau kartu level maks.')}</li>
          <li><b>{tx('SMART:', 'SERU:')}</b> {tx('upgrades you own,', 'upgrade kartu milikmu, penyala')} <b>{tx('SYNERGY', 'SINERGI')}</b> {tx('enablers, and skill-tree resonant', 'dan kartu')} <b>{tx('PATH', 'JALUR')}</b> {tx('cards appear more often.', 'yang beresonansi dengan skill tree lebih sering muncul.')}</li>
          <li><b>{tx('RESONANCE:', 'RESONANSI:')}</b> {tx('skill branch ≥50% trained → PATH card +25%, mastered → +50%.', 'cabang skill tree ≥50% terlatih → kartu JALUR-nya +25%, tuntas → +50%.')}</li>
          <li>{tx('Low HP: cards that reduce max HP are offered less often.', 'HP kritis: kartu yang memotong max HP lebih jarang ditawarkan.')}</li>
        </ul>
      )}

      {r.offer.length ? (
        <div className="rc-grid" key={sig}>
          {r.offer.map((id, i) => (
            <RewardCard
              key={id} id={id} lv={lvOf(id)} index={i} synergy={synergyFor(id)} res={CARD_BY[id].path ? r.resonance?.[CARD_BY[id].path!] ?? 1 : 1}
              state={!chosen ? 'idle' : chosen === id ? 'chosen' : 'gone'}
              onPick={() => pick(id)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 text-center">
          <div className="font-game text-base text-white/80">{tx('ALL CARDS ARE MAXED!', 'SEMUA KARTU SUDAH MAKS!')}</div>
          <button onClick={() => { audioInit(); snd.tap(); w()?.skipPick(); }} className="g-btn g-green font-game mt-3 h-12 w-full text-lg">{tx('CONTINUE ➜', 'LANJUT ➜')}</button>
        </div>
      )}

      {r.offer.length > 0 && (
        <div className="rp-actions">
          <button type="button" disabled={!canReroll || !!chosen} onClick={reroll} className="g-btn g-orange font-game rp-reroll">
            <span className="rp-dice"><DiceIcon className="h-5 w-5" /></span>
            <span>REROLL</span>
            <span className="rp-cost">
              {free ? `${tx('FREE', 'GRATIS')} ×${r.freeRerolls}` : <><CoinIcon className="h-3.5 w-3.5" /><span className="tabular-nums">{r.rerollCost}</span></>}
            </span>
          </button>
        </div>
      )}
      {r.synergies.length > 0 && (
        <div className="rp-syn-line"><BoltIcon className="inline h-3.5 w-3.5 align-text-bottom" /> {tx('ACTIVE SYNERGIES', 'SINERGI AKTIF')}: {r.synergies.join(' · ')}</div>
      )}
      <p className="rp-hint">{tx('CLICK = PICK · HOLD = DETAILS · KEYS 1–3 · R = REROLL', 'KLIK = PILIH · TAHAN = DETAIL · TOMBOL 1–3 · R = REROLL')}</p>
    </PanelShell>
  );
}

function ChestChoiceArt({ kind }: { kind: 'cards' | 'heal' | 'chest' }) {
  if (kind === 'chest') {
    return (
      <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
        <defs>
          <linearGradient id="chGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffe77a" /><stop offset="100%" stopColor="#d98207" /></linearGradient>
          <linearGradient id="chWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9c5624" /><stop offset="100%" stopColor="#5c2c0e" /></linearGradient>
        </defs>
        <rect x="10" y="25" width="44" height="28" rx="6" fill="url(#chWood)" stroke="rgba(255,215,120,0.45)" strokeWidth="1.2" />
        <path d="M10 28c0-9 8-14 22-14s22 5 22 14H10z" fill="#b86b2f" stroke="rgba(255,215,120,0.5)" strokeWidth="1.2" />
        <rect x="10" y="25" width="44" height="5" fill="url(#chGold)" />
        <rect x="27" y="24" width="10" height="11" rx="2.5" fill="url(#chGold)" />
        <circle cx="32" cy="29.5" r="2" fill="#4a2406" />
      </svg>
    );
  }
  if (kind === 'cards') {
    return (
      <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
        <rect x="12" y="14" width="24" height="34" rx="5" transform="rotate(-12 24 31)" fill="#6f3fd0" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
        <rect x="28" y="14" width="24" height="34" rx="5" transform="rotate(12 40 31)" fill="#8e5ef0" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
        <rect x="20" y="11" width="24" height="36" rx="5" fill="#b98cff" stroke="#fff" strokeWidth="1.4" />
        <path d="M32 21l2.5 5.5 5.5 2.5-5.5 2.5L32 37l-2.5-5.5L24 29l5.5-2.5L32 21z" fill="#fff8d6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
      <defs>
        <linearGradient id="chHeal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9cffb8" /><stop offset="100%" stopColor="#26a653" /></linearGradient>
      </defs>
      <path d="M32 54S10 39 10 23a12 12 0 0 1 22-6.2A12 12 0 0 1 54 23c0 16-22 31-22 31z" fill="url(#chHeal)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.4" />
      <path d="M29 22h6v6h6v6h-6v6h-6v-6h-6v-6h6z" fill="#ffffff" />
    </svg>
  );
}

/** a big two-way choice card (chest: card OR heal) in the same collectible style */
function OptionCard({ kind, title, desc, tag, theme, index, disabled = false, onPick }: { kind: 'cards' | 'heal'; title: string; desc: string; tag: string; theme: CardType; index: number; disabled?: boolean; onPick: () => void }) {
  const t = TYPE_THEME[theme];
  const style = { '--c1': t.c1, '--c2': t.c2, '--glow': t.glow, '--gloss': `${1.2 + index * 0.4}s`, animationDelay: `${0.15 + index * 0.12}s` } as CSSProperties;
  return (
    <button type="button" className="rc-card" style={style} disabled={disabled} onClick={() => { if (disabled) return; audioInit(); onPick(); }}>
      <span className="rc-inner" style={{ minHeight: '15rem' }}>
        <span className="rc-head"><span className="rc-type"><TypeBadgeIcon type={theme} /><b>{tag}</b></span></span>
        <span className="rc-art"><span className="rc-rays" /><span className="rc-fallback-icon"><ChestChoiceArt kind={kind} /></span><span className="rc-spark s1" /><span className="rc-spark s2" /></span>
        <span className="rc-name font-game">{title}</span>
        <span className="rc-desc">{desc}</span>
      </span>
      <span className="rc-key font-game" aria-hidden="true">{index + 1}</span>
    </button>
  );
}

function ChestChoice({ ui, w }: { ui: RUi; w: W }) {
  useLang();
  const latest = useRef(w); latest.current = w;
  useEffect(() => {
    const born = performance.now();
    const key = (e: KeyboardEvent) => {
      if (e.repeat || performance.now() - born < 350) return;
      if (e.key === '1') { audioInit(); latest.current()?.chestCard(); }
      if (e.key === '2') { audioInit(); latest.current()?.chestHeal(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const full = ui.hp >= ui.maxHp;
  return (
    <PanelShell ribbon={tx('TREASURE CHEST', 'PETI HARTA')} tone="gold" size="md">
      <div className="rp-chest-hero"><span className="rays" /><span className="chest"><ChestChoiceArt kind="chest" /></span></div>
      <div className="rp-subtitle"><span>{tx('CHOOSE CHEST REWARD', 'PILIH ISI PETI')}</span></div>
      <div className="rc-grid two">
        <OptionCard kind="cards" title={tx('1 CARD', '1 KARTU')} desc={tx('CHOOSE 1 OF 3 NEW CARDS', 'PILIH 1 DARI 3 KARTU BARU')} tag={tx('CARD', 'KARTU')} theme="KHUSUS" index={0} onPick={() => { snd.tap(); w()?.chestCard(); }} />
        <OptionCard kind="heal" title={tx('FULL HEAL', 'HEAL PENUH')} desc={full ? tx('HP ALREADY FULL', 'HP SUDAH PENUH') : `HP ${ui.hp} → ${ui.maxHp}`} tag={tx('HEAL', 'PULIH')} theme="BERTAHAN" index={1} onPick={() => w()?.chestHeal()} />
      </div>
      <div className="rp-chips mt-6">
        <Chip className="gold"><CoinIcon className="h-4 w-4 shrink-0" /><span className="tabular-nums">{ui.coins}</span></Chip>
        <Chip className="hp"><HeartIcon className="h-4 w-4 shrink-0" /><span className="tabular-nums">{ui.hp}/{ui.maxHp}</span></Chip>
      </div>
    </PanelShell>
  );
}

/** chest: 1 card OR full heal (then the card pick) */
export function ChestPanel({ ui, w }: { ui: RUi; w: W }) {
  if (ui.run.offer.length) return <CardPickPanel ui={ui} w={w} />;
  return <ChestChoice ui={ui} w={w} />;
}
