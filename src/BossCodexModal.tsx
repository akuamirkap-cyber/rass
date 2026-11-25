import { useEffect, useRef, useState } from 'react';
import { Ctx, V, v, add, mul, dist, clamp, fromAngle, lerpV, segDist } from './game/util';
import { ArcherRag, RAG_STICKS, punchRag } from './game/archerRag';
import {
  BossId,
  BowId,
  HEAD_R,
  Slab2,
  Stick,
  StickLook,
  drawArrow,
  drawAxe,
  drawBolt,
  drawBossHeldWeapon,
  drawSimFlame,
  drawSkeleton,
  drawStick,
  impulse,
  makeStick,
  startReact,
  stepStick,
} from './game/ragdoll/stick';
import { audioInit, snd } from './game/ragdoll/audio';
import { CFG } from './game/ragdoll/config';
import { enemyHp, enemyLevelFor, lateHpMult } from './game/ragdoll/formulas';
import { tx, useLang } from './i18n';

const FIRST_BOSS_HP = Math.round(enemyHp(CFG.bigBoss.every, enemyLevelFor(CFG.bigBoss.every, 'axer', 0), true) * CFG.bigBoss.hpMult * lateHpMult(CFG.bigBoss.every));
const BOSS_HP_TEXT = `HP ${FIRST_BOSS_HP}+ / FROM LEVEL ${CFG.bigBoss.every}`;
const BOSS_HP_TEXT_ID = `HP ${FIRST_BOSS_HP}+ / MULAI LEVEL ${CFG.bigBoss.every}`;

export interface BossEntry {
  id: BossId;
  num: number;
  name: string;
  nameId: string;
  title: string;
  elementTag: string;
  elementTagId: string;
  bowElem: BowId;
  hpText: string;
  hpTextId: string;
  dmgText: string;
  dmgTextId: string;
  weaponName: string;
  weaponNameId: string;
  weaponShort: string;
  weaponShortId: string;
  desc: string;
  descId: string;
  abilityDesc: string;
  abilityDescId: string;
  accent: string;
  eyeCol: string;
  bandCol: string;
}

export const BOSS_CODEX: BossEntry[] = [
  {
    id: 'axer',
    num: 1,
    name: 'VIKING AXE KING',
    nameId: 'RAJA VIKING KAPAK',
    title: 'BERSERKER AXE LORD',
    elementTag: '🪓 WEAPON: VIKING BATTLE AXE',
    elementTagId: '🪓 SENJATA: KAPAK PERANG VIKING',
    bowElem: 'wood',
    hpText: BOSS_HP_TEXT,
    hpTextId: BOSS_HP_TEXT_ID,
    dmgText: 'DAMAGE 140% · EMBEDDING AXE',
    dmgTextId: 'DAMAGE 140% · KAPAK NANCEP',
    weaponName: 'Viking Battle Axe (Heavy Battle Axe)',
    weaponNameId: 'Kapak Perang Viking (Heavy Battle Axe)',
    weaponShort: 'VIKING AXE',
    weaponShortId: 'KAPAK VIKING',
    desc: 'Giant Viking warlord wearing an iron helm with curved bone horns and spiked shoulder plates. Swings a massive battle axe from behind his shoulder with brutal force.',
    descId: 'Panglima Viking raksasa dengan helm besi bertanduk tulang melengkung dan pelindung bahu berduri. Mengayunkan kapak perang raksasa dari belakang bahu dengan tenaga brutal.',
    abilityDesc: 'Hurls a spinning steel Viking Axe that embeds deep into bones or wooden platforms if you do not shoot it out of the air!',
    abilityDescId: 'Melempar Kapak Baja Viking berputar yang menancap dalam (nancep) pada tulang tubuh atau pijakan kayu jika tidak ditembak jatuh di udara!',
    accent: '#ff5a4f',
    eyeCol: '#ff4b4b',
    bandCol: '#c4161c',
  },
  {
    id: 'thunder_lord',
    num: 2,
    name: 'THUNDER EMPEROR ZEUS',
    nameId: 'KAISAR PETIR ZEUS',
    title: 'STORM & THUNDER EMPEROR',
    elementTag: '🔱 WEAPON: ZEUS THUNDERBOLT TRIDENT',
    elementTagId: '🔱 SENJATA: TRISULA HALILINTAR ZEUS',
    bowElem: 'thunder',
    hpText: BOSS_HP_TEXT,
    hpTextId: BOSS_HP_TEXT_ID,
    dmgText: 'DAMAGE 145% + LOCAL BONE SHOCK',
    dmgTextId: 'DAMAGE 145% + SETRUM TULANG LOKAL',
    weaponName: 'Zeus Thunderbolt Trident',
    weaponNameId: 'Trisula Halilintar Zeus (Thunderbolt Trident)',
    weaponShort: 'THUNDER TRIDENT',
    weaponShortId: 'TRISULA PETIR',
    desc: 'Storm sovereign crowned with five golden lightning spikes, a Tesla halo ring above his head, and a billowing electric-blue cloak.',
    descId: 'Penguasa badai bermahkota lima tombak petir emas dengan lingkaran halo Tesla di atas kepalanya dan jubah biru elektrik yang berkibar.',
    abilityDesc: 'Fires a three-pronged Thunderbolt Trident straight into the target, embedding on impact and electrocuting the struck limb!',
    abilityDescId: 'Melontarkan Tombak Trisula Halilintar bermata tiga lurus menghujam target hingga menancap (nancep) dan menyetrum tulang bagian tubuh yang terkena!',
    accent: '#00f0ff',
    eyeCol: '#00f0ff',
    bandCol: '#00b4ff',
  },
  {
    id: 'inferno_king',
    num: 3,
    name: 'MAGMA DEMON KING',
    nameId: 'RAJA IBLIS MAGMA',
    title: 'INFERNO DEMON OVERLORD',
    elementTag: '🗡️ WEAPON: DEMON MAGMA GREATSWORD',
    elementTagId: '🗡️ SENJATA: PEDANG RAKSASA IBLIS MAGMA',
    bowElem: 'fire',
    hpText: BOSS_HP_TEXT,
    hpTextId: BOSS_HP_TEXT_ID,
    dmgText: 'DAMAGE 150% + SIMULATION FLAME',
    dmgTextId: 'DAMAGE 150% + SIMULATION FLAME',
    weaponName: 'Demon Magma Greatsword',
    weaponNameId: 'Pedang Raksasa Iblis Magma (Demon Greatsword)',
    weaponShort: 'MAGMA GREATSWORD',
    weaponShortId: 'PEDANG MAGMA',
    desc: 'Demon king from the volcanic caldera with massive obsidian horns veined with magma, a blazing ember crown, and volcanic shoulder armor.',
    descId: 'Raja iblis dari kawah vulkanik dengan tanduk obsidian raksasa berlapis urat magma, mahkota bara menyala, dan zirah bahu vulkanik.',
    abilityDesc: 'Hurls a jagged Demon Greatsword that embeds straight through the victim and scorches the wound with fluid simulation flames!',
    abilityDescId: 'Melempar Pedang Bergigi Iblis Magma yang menancap (nancep) menembus tubuh lawan dan membakar titik luka dengan lidah api fluida (simulation flame)!',
    accent: '#ff7b14',
    eyeCol: '#ff9419',
    bandCol: '#ff4800',
  },
  {
    id: 'xeno_queen',
    num: 4,
    name: 'XENOMORPH ACID QUEEN',
    nameId: 'RATU XENOMORPH ACID',
    title: 'BIOMECHANICAL ACID SOVEREIGN',
    elementTag: '🧪 WEAPON: XENOMORPH TAIL-SCYTHE',
    elementTagId: '🧪 SENJATA: SABIT EKOR RATU XENOMORPH',
    bowElem: 'poison',
    hpText: BOSS_HP_TEXT,
    hpTextId: BOSS_HP_TEXT_ID,
    dmgText: 'DAMAGE 145% + XENOMORPH ACID DRIP',
    dmgTextId: 'DAMAGE 145% + XENOMORPH ACID DRIP',
    weaponName: 'Xenomorph Biomechanical Tail-Scythe',
    weaponNameId: 'Sabit Ekor Xenomorph (Biomechanical Tail-Scythe)',
    weaponShort: 'XENO TAIL-SCYTHE',
    weaponShortId: 'SABIT XENOMORPH',
    desc: 'Biomechanical sovereign with an elongated Xenomorph Queen crest, glowing yellow-green bioluminescent veins, and corrosive chitin armor.',
    descId: 'Entitas biomekanik dengan tengkorak memanjang khas Ratu Xenomorph, urat bioluminesensi hijau-kuning menyala, dan zirah kitin korosif.',
    abilityDesc: 'Launches a high-pressure biomechanical Tail-Scythe that hooks and embeds into bone while dripping molecular acid straight downward!',
    abilityDescId: 'Melempar Sabit Ekor Biomekanik bertekanan tinggi yang mengait & menancap (nancep) di tulang lawan sambil meneteskan asam molekuler lurus ke bawah!',
    accent: '#cfff04',
    eyeCol: '#cfff04',
    bandCol: '#7bff00',
  },
  {
    id: 'thorn_warden',
    num: 5,
    name: 'EMERALD THORN WARDEN',
    nameId: 'PANGLIMA DURI ZAMRUD',
    title: 'BRAMBLE THORN WARLORD',
    elementTag: '🌿 WEAPON: EMERALD BRIAR MORNING-STAR',
    elementTagId: '🌿 SENJATA: GADA BINTANG DURI ZAMRUD',
    bowElem: 'spike',
    hpText: BOSS_HP_TEXT,
    hpTextId: BOSS_HP_TEXT_ID,
    dmgText: 'DAMAGE 142% + THORN SHARDS',
    dmgTextId: 'DAMAGE 142% + SERPIHAN DURI',
    weaponName: 'Emerald Briar Morning-Star',
    weaponNameId: 'Gada Bintang Duri Zamrud (Briar Morning-Star)',
    weaponShort: 'THORN MORNING-STAR',
    weaponShortId: 'GADA BINTANG DURI',
    desc: 'Ancient forest guardian sporting an emerald-crested gladiator helm, razor-spiked root horns, and living-wood pauldrons.',
    descId: 'Penjaga hutan purba dengan helm gladiator jambul zamrud, tanduk akar berduri tajam, dan pelindung bahu kayu hidup.',
    abilityDesc: 'Flings a fast-spinning Emerald Briar Morning-Star that buries itself firmly into bone while scattering sharp thorns!',
    abilityDescId: 'Melempar Gada Bintang Berduri Zamrud yang berputar cepat dan menancap (nancep) erat di tulang lawan sambil menyebarkan duri tajam!',
    accent: '#6bff2b',
    eyeCol: '#7dff24',
    bandCol: '#2eb82e',
  },
];

/** Mini SVG icon for each Boss's unique signature weapon in the Kamus Bos list */
function BossWeaponIcon({ id }: { id: BossId }) {
  if (id === 'thunder_lord') {
    // Trisula Halilintar Zeus
    return (
      <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0" aria-hidden>
        <line x1="6" y1="42" x2="32" y2="16" stroke="#f5b82e" strokeWidth="3.5" strokeLinecap="round" />
        <polygon points="44,4 28,14 34,20" fill="#00f0ff" />
        <polyline points="24,18 28,8 38,6" fill="none" stroke="#00f0ff" strokeWidth="2.5" strokeLinecap="round" />
        <polyline points="30,24 40,20 42,10" fill="none" stroke="#00f0ff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="28" cy="20" r="3" fill="#ffffff" />
      </svg>
    );
  }
  if (id === 'inferno_king') {
    // Pedang Raksasa Iblis Magma
    return (
      <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0" aria-hidden>
        <line x1="7" y1="41" x2="16" y2="32" stroke="#9e1b0b" strokeWidth="4" strokeLinecap="round" />
        <path d="M11 25 Q16 32 23 37" fill="none" stroke="#ff5500" strokeWidth="3.5" strokeLinecap="round" />
        <polygon points="43,5 21,19 15,27 21,33 29,27" fill="#2b0904" stroke="#ff7b14" strokeWidth="1.8" />
        <line x1="18" y1="30" x2="39" y2="9" stroke="#ffe552" strokeWidth="2" />
      </svg>
    );
  }
  if (id === 'xeno_queen') {
    // Sabit Ekor Ratu Xenomorph
    return (
      <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0" aria-hidden>
        <line x1="8" y1="40" x2="32" y2="16" stroke="#293d10" strokeWidth="4" strokeLinecap="round" />
        <path d="M28 20 Q42 8 34 4 Q20 2 12 22 Q24 14 28 20 Z" fill="#111a08" stroke="#bfff00" strokeWidth="2" />
        <circle cx="13" cy="26" r="2.2" fill="#eaff66" />
      </svg>
    );
  }
  if (id === 'thorn_warden') {
    // Gada Bintang Duri Zamrud
    return (
      <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0" aria-hidden>
        <line x1="7" y1="41" x2="26" y2="22" stroke="#4e2f1d" strokeWidth="4" strokeLinecap="round" />
        <polygon points="31,5 34,14 43,17 34,20 31,29 28,20 19,17 28,14" fill="#7dff24" stroke="#0c3b10" strokeWidth="1.4" />
        <circle cx="31" cy="17" r="5.5" fill="#174d1b" stroke="#9eff2e" strokeWidth="1.5" />
      </svg>
    );
  }
  // Kapak Perang Viking
  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0" aria-hidden>
      <line x1="8" y1="40" x2="36" y2="12" stroke="#8b522c" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 18 Q18 8 28 4 Q40 8 34 20 Z" fill="#5c6e78" stroke="#e6f4f8" strokeWidth="1.8" />
    </svg>
  );
}

interface CodexStuck {
  stick: number;
  u: number;
  lx: number;
  ly: number;
  rel: number;
  bow: BowId;
  fxT: number;
  isAxe?: boolean;
  bossKind?: BossId;
  s?: number;
}

interface CodexAxe {
  p: V;
  vel: V;
  ang: number;
  vr: number;
  s: number;
  bossKind: BossId;
  dead: boolean;
  stuckPlat: boolean;
}

interface CodexArrow {
  p: V;
  prev: V;
  vel: V;
  ang: number;
  bow: BowId;
  dead: boolean;
}

interface CodexPart {
  p: V;
  prev?: V;
  vel: V;
  life: number;
  max: number;
  r: number;
  col: string;
  grav: number;
  kind: 'spark' | 'fire' | 'ember' | 'acid' | 'thorn' | 'ring' | 'blood';
  drag?: number;
  seed?: number;
}

interface Props {
  onClose: () => void;
  onFightBoss: (bossKind: BossId) => void;
  /** switch to the other half of the codex: every ordinary enemy */
  onEnemies?: () => void;
}

export default function BossCodexModal({ onClose, onFightBoss, onEnemies }: Props) {
  useLang();
  const [selectedId, setSelectedId] = useState<BossId>(BOSS_CODEX[0].id);
  const selected = BOSS_CODEX.find((b) => b.id === selectedId) ?? BOSS_CODEX[0];
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs for the live 120Hz ragdoll simulation inside Kamus Bos
  const simRef = useRef<{
    t: number;
    rt: number;
    acc: number;
    boss: Stick;
    dummy: Stick;
    bossStuck: CodexStuck[];
    dummyStuck: CodexStuck[];
    axes: CodexAxe[];
    arrows: CodexArrow[];
    parts: CodexPart[];
    xrayT: number;
    xrayStick: number;
    xrayPt: V;
    throwTimer: number;
    aiState: 'idle' | 'windup' | 'hold';
    aiT: number;
    bossFlash: number;
    dummyFlash: number;
  } | null>(null);

  // Re-initialize Boss ragdoll whenever selected Boss changes
  useEffect(() => {
    const bossBase = v(470, 290);
    const dummyBase = v(150, 295);
    const boss = makeStick(bossBase, -1, 1.48, false, true, 'thrower');
    const dummy = makeStick(dummyBase, 1, 1.0, false, true, 'archer');
    simRef.current = {
      t: 0,
      rt: 0,
      acc: 0,
      boss,
      dummy,
      bossStuck: [],
      dummyStuck: [],
      axes: [],
      arrows: [],
      parts: [],
      xrayT: 0,
      xrayStick: 1,
      xrayPt: v(0, 0),
      throwTimer: 0.6,
      aiState: 'windup',
      aiT: 0.55,
      bossFlash: 0,
      dummyFlash: 0,
    };
  }, [selected]);

  // Trigger Boss Axe Throw on demand
  const triggerBossThrow = () => {
    const s = simRef.current;
    if (!s) return;
    audioInit();
    s.aiState = 'windup';
    s.aiT = 0.05;
    s.boss.nock = 1;
  };

  // Trigger test arrow into Boss to inspect his stagger & X-Ray skeleton
  const triggerShootBoss = () => {
    const s = simRef.current;
    if (!s) return;
    audioInit();
    const from = v(s.dummy.p[4].x + 12, s.dummy.p[4].y - 6);
    const to = lerpV(s.boss.p[1], s.boss.p[2], 0.35 + (Math.random() - 0.5) * 0.4);
    const T = 0.36;
    const g = 980;
    const vx = (to.x - from.x) / T;
    const vy = (to.y - from.y) / T - 0.5 * g * T;
    s.arrows.push({
      p: { ...from },
      prev: { ...from },
      vel: v(vx, vy),
      ang: Math.atan2(vy, vx),
      bow: selected.bowElem,
      dead: false,
    });
    snd.release(0.95, -0.4);
  };

  const clearDummyAxes = () => {
    const s = simRef.current;
    if (!s) return;
    audioInit();
    snd.tap();
    s.dummyStuck = [];
    s.bossStuck = [];
    s.axes = [];
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 120Hz Physics + Render loop for the Kamus Bos live stage
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d') as Ctx;
    let raf = 0;
    let prev = 0;
    const H = 1 / 120;

    const loop = (now: number) => {
      const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 0.016);
      prev = now;
      const s = simRef.current;
      if (s) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        const cw = Math.max(300, rect.width);
        const ch = Math.max(240, rect.height);
        if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
          canvas.width = Math.round(cw * dpr);
          canvas.height = Math.round(ch * dpr);
        }

        s.rt += dt;
        s.xrayT = Math.max(0, s.xrayT - dt);
        s.bossFlash = Math.max(0, s.bossFlash - dt * 4);
        s.dummyFlash = Math.max(0, s.dummyFlash - dt * 4);
        s.acc += dt;

        const bossPlat: Slab2 = { x0: 415, x1: 525, top: 290, bot: 325 };
        const dummyPlat: Slab2 = { x0: 105, x1: 195, top: 295, bot: 325 };
        const slabs = [bossPlat, dummyPlat];

        let guard = 0;
        while (s.acc >= H && guard++ < 10) {
          s.acc -= H;
          s.t += H;
          const bk = s.boss;
          const dk = s.dummy;

          bk.base = v(470, 290 + Math.sin(s.t * 1.5) * 3.5);
          dk.base = v(150, 295 + Math.sin(s.t * 1.5 + 2) * 3.5);
          bk.muscle = Math.min(1, bk.muscle + H * 1.1);
          dk.muscle = Math.min(1, dk.muscle + H * 1.1);
          if (bk.nock < 1) bk.nock = Math.min(1, bk.nock + H / 0.85);
          bk.lookAt = dk.p[0];
          dk.lookAt = bk.p[0];

          // Boss AI wind-up & throw cycle in Kamus Bos
          if (s.aiState === 'idle') {
            bk.aiming = clamp(bk.aiming - H * 4, 0, 1);
            bk.pull = clamp(bk.pull - H * 8, 0, 1);
            s.aiT -= H;
            if (s.aiT <= 0 && bk.nock >= 1) {
              s.aiState = 'windup';
              s.aiT = 0.65;
            }
          } else if (s.aiState === 'windup') {
            bk.aim = Math.PI - 0.25;
            bk.aiming = clamp(bk.aiming + H * 6, 0, 1);
            bk.pull = clamp(bk.pull + H / 0.6, 0, 1);
            if (bk.pull >= 0.99) {
              s.aiState = 'hold';
              s.aiT = 0.18;
            }
          } else if (s.aiState === 'hold') {
            s.aiT -= H;
            if (s.aiT <= 0) {
              // Hurl Boss Axe toward the target dummy stickman so the user sees it embed (`nancep`)!
              const from = { ...bk.p[4] };
              const targetStick = [1, 1, 0, 6, 4][Math.floor(Math.random() * 5)];
              const [ia, ib] = RAG_STICKS[targetStick];
              const to = lerpV(dk.p[ia], dk.p[ib], 0.5);
              const T = 0.92;
              const g = 620;
              const initVel = v((to.x - from.x) / T, (to.y - from.y) / T - 0.5 * g * T);
              const vr = selected.id === 'thunder_lord' ? 0 : selected.id === 'thorn_warden' ? 16 : 13;
              s.axes.push({
                p: from,
                vel: initVel,
                ang: Math.atan2(initVel.y, initVel.x),
                vr,
                s: 1.35,
                bossKind: selected.id,
                dead: false,
                stuckPlat: false,
              });
              impulse(bk, 4, v(-260, -40));
              impulse(bk, 1, v(-90, 0));
              impulse(bk, 0, v(-120, 20));
              bk.muscle = 0.6;
              bk.exert = 0.6;
              bk.pull = 0;
              bk.nock = 0;
              snd.throwAxe(0.35, 0.7);
              s.aiState = 'idle';
              s.aiT = 2.1;
            }
          }

          stepStick(bk, slabs);
          stepStick(dk, slabs);

          // Step flying weapons and embed (`nancep`) on hit!
          for (const ax of s.axes) {
            if (ax.stuckPlat) continue;
            ax.vel.y += 620 * H;
            ax.p = add(ax.p, mul(ax.vel, H));
            if (ax.bossKind === 'thunder_lord') ax.ang = Math.atan2(ax.vel.y, ax.vel.x);
            else ax.ang += ax.vr * H;

            // Check collision with Target Dummy Stickman (`dk`)
            if (Math.abs(ax.p.x - dk.p[2].x) < 65 && Math.abs(ax.p.y - dk.p[2].y) < 95) {
              let bestStick = 0;
              let bestU = 1;
              let near = dist(ax.p, dk.p[0]) - HEAD_R;
              for (let si = 1; si < RAG_STICKS.length; si++) {
                const [ia, ib] = RAG_STICKS[si];
                const sd = segDist(ax.p, dk.p[ia], dk.p[ib]);
                if (sd.d < near) {
                  near = sd.d;
                  bestStick = si;
                  bestU = sd.t;
                }
              }
              if (near < 16) {
                // EMBED (`NANCEP`) THE BOSS WEAPON INTO THE DUMMY'S BONE!
                const [ia, ib] = RAG_STICKS[bestStick];
                const A = dk.p[ia];
                const B = dk.p[ib];
                const tip = bestStick === 0 ? lerpV(dk.p[1], dk.p[0], 0.85) : lerpV(A, B, bestU);
                const ba = Math.atan2(B.y - A.y, B.x - A.x);
                const rx = tip.x - A.x;
                const ry = tip.y - A.y;
                const c = Math.cos(-ba);
                const sn = Math.sin(-ba);
                const flightAng = Math.atan2(ax.vel.y, ax.vel.x);
                const embedAng =
                  ax.bossKind === 'thunder_lord' || ax.bossKind === 'inferno_king' || ax.bossKind === 'thorn_warden'
                    ? flightAng
                    : flightAng + Math.PI + 0.24;

                s.dummyStuck.push({
                  stick: bestStick,
                  u: bestU,
                  lx: rx * c - ry * sn,
                  ly: rx * sn + ry * c,
                  rel: embedAng - ba,
                  bow: selected.bowElem,
                  fxT: selected.bowElem === 'wood' ? 0 : 2.2,
                  isAxe: true,
                  bossKind: ax.bossKind,
                  s: ax.s * 0.92,
                });
                if (s.dummyStuck.length > 4) s.dummyStuck.shift();
                ax.dead = true;

                // Ragdoll impact stagger + particles
                punchRag(dk as unknown as ArcherRag, bestStick, bestU, mul(ax.vel, 1.8), false);
                dk.muscle = 0.32;
                dk.hurt = 1;
                dk.hurtDir = -1;
                dk.wound = { stick: bestStick, u: bestU };
                startReact(dk, bestStick >= 2 && bestStick <= 5 ? 'knee' : 'teeter', 1.1);
                s.dummyFlash = 1;
                snd.hit(-0.35, bestStick === 0);
                s.parts.push({ p: { ...tip }, vel: v(0, 0), life: 0, max: 0.22, r: 26, col: selected.accent, grav: 0, kind: 'ring' });
                for (let i = 0; i < 10; i++) {
                  const pa = flightAng + Math.PI + (Math.random() - 0.5) * 1.4;
                  const psp = 90 + Math.random() * 200;
                  s.parts.push({
                    p: { ...tip },
                    prev: { ...tip },
                    vel: v(Math.cos(pa) * psp, Math.sin(pa) * psp - 40),
                    life: 0,
                    max: 0.28 + Math.random() * 0.2,
                    r: 1.8,
                    col: selected.bowElem === 'wood' ? '#d3141f' : selected.accent,
                    grav: 680,
                    kind: selected.bowElem === 'thunder' ? 'spark' : selected.bowElem === 'poison' ? 'acid' : 'ember',
                    drag: 2,
                  });
                }
                continue;
              }
            }

            // Or embed into the dummy platform if it lands on the slab
            if (ax.p.x >= dummyPlat.x0 && ax.p.x <= dummyPlat.x1 && ax.p.y >= dummyPlat.top - 3 && ax.p.y <= dummyPlat.bot) {
              const flightAng = Math.atan2(ax.vel.y, ax.vel.x);
              ax.stuckPlat = true;
              ax.p.y = dummyPlat.top + 2;
              ax.ang =
                ax.bossKind === 'thunder_lord' || ax.bossKind === 'inferno_king' || ax.bossKind === 'thorn_warden'
                  ? flightAng
                  : flightAng + Math.PI + 0.25;
              snd.wood(-0.35);
            }
            if (ax.p.y > 420 || ax.p.x < -80 || ax.p.x > 700) ax.dead = true;
          }
          s.axes = s.axes.filter((x) => !x.dead);

          // Step test arrows fired at Boss
          for (const ar of s.arrows) {
            ar.prev = { ...ar.p };
            ar.vel.y += 980 * H;
            ar.p = add(ar.p, mul(ar.vel, H));
            ar.ang = Math.atan2(ar.vel.y, ar.vel.x);
            if (Math.abs(ar.p.x - bk.p[2].x) < 85 && Math.abs(ar.p.y - bk.p[2].y) < 120) {
              let bestStick = 1;
              let bestU = 0.5;
              let near = dist(ar.p, bk.p[0]) - HEAD_R * bk.s;
              if (near < 4) {
                bestStick = 0;
                bestU = 1;
              } else {
                for (let si = 1; si < RAG_STICKS.length; si++) {
                  const [ia, ib] = RAG_STICKS[si];
                  const sd = segDist(ar.p, bk.p[ia], bk.p[ib]);
                  if (sd.d < near) {
                    near = sd.d;
                    bestStick = si;
                    bestU = sd.t;
                  }
                }
              }
              if (near < 14) {
                const [ia, ib] = RAG_STICKS[bestStick];
                const A = bk.p[ia];
                const B = bk.p[ib];
                const tip = bestStick === 0 ? lerpV(bk.p[1], bk.p[0], 0.85) : lerpV(A, B, bestU);
                const ba = Math.atan2(B.y - A.y, B.x - A.x);
                const rx = tip.x - A.x;
                const ry = tip.y - A.y;
                const c = Math.cos(-ba);
                const sn = Math.sin(-ba);
                s.bossStuck.push({
                  stick: bestStick,
                  u: bestU,
                  lx: rx * c - ry * sn,
                  ly: rx * sn + ry * c,
                  rel: ar.ang - ba,
                  bow: ar.bow,
                  fxT: 2.0,
                });
                if (s.bossStuck.length > 5) s.bossStuck.shift();
                ar.dead = true;
                punchRag(bk as unknown as ArcherRag, bestStick, bestU, mul(ar.vel, 1.4), false);
                bk.muscle = 0.45;
                bk.hurt = 1;
                bk.hurtDir = 1;
                s.bossFlash = 1;
                s.xrayT = 0.55;
                s.xrayStick = bestStick;
                s.xrayPt = { ...tip };
                snd.hit(0.35, bestStick === 0);
                snd.snap(0.35);
              }
            }
            if (ar.p.x > 700 || ar.p.y > 420) ar.dead = true;
          }
          s.arrows = s.arrows.filter((a) => !a.dead);

          // Step localized elemental timers on stuck weapons
          for (const st of [...s.dummyStuck, ...s.bossStuck]) {
            if (st.fxT > 0) st.fxT = Math.max(0, st.fxT - H);
          }

          // Step particles
          for (const p of s.parts) {
            p.life += H;
            if (p.prev) p.prev = { ...p.p };
            if (p.drag) {
              const d = Math.exp(-p.drag * H);
              p.vel.x *= d;
              p.vel.y *= d;
            }
            p.vel.y += p.grav * H;
            p.p = add(p.p, mul(p.vel, H));
          }
          s.parts = s.parts.filter((p) => p.life < p.max);
        }

        // ============ RENDER KAMUS BOS STAGE ============
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const W = canvas.width;
        const Hh = canvas.height;
        const bg = ctx.createLinearGradient(0, 0, 0, Hh);
        bg.addColorStop(0, '#071624');
        bg.addColorStop(0.6, '#0d2b42');
        bg.addColorStop(1, '#06131e');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, Hh);

        // Subtle tactical grid
        ctx.strokeStyle = 'rgba(120, 210, 255, 0.06)';
        ctx.lineWidth = 1;
        const step = 28 * dpr;
        for (let x = 0; x < W; x += step) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Hh); ctx.stroke();
        }
        for (let y = 0; y < Hh; y += step) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Fit 620x360 virtual stage into canvas
        const sc = Math.min(W / 620, Hh / 360);
        const ox = (W - 620 * sc) * 0.5;
        const oy = (Hh - 360 * sc) * 0.5 + 10 * sc;
        ctx.setTransform(sc, 0, 0, sc, ox, oy);

        // Draw axes stuck in platform first
        for (const ax of s.axes) {
          if (ax.stuckPlat) drawAxe(ctx, ax.p, ax.ang, ax.s, true, ax.bossKind, s.rt);
        }

        // Draw Floating Platforms (Target Dummy on Left, Boss on Right)
        for (const [pl, yOff, label] of [
          [dummyPlat, Math.sin(s.t * 1.5 + 2) * 3.5, tx('TEST TARGET (EMBED)', 'TARGET UJI (NANCEP)')],
          [bossPlat, Math.sin(s.t * 1.5) * 3.5, tx(selected.name, selected.nameId)],
        ] as [Slab2, number, string][]) {
          const py = pl.top + yOff;
          const pw = pl.x1 - pl.x0;
          const g = ctx.createLinearGradient(0, py + 28, 0, py + 62);
          g.addColorStop(0, 'rgba(90, 210, 255, 0.25)');
          g.addColorStop(1, 'rgba(90, 210, 255, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(pl.x0 + 6, py + 28, pw - 12, 34);
          ctx.fillStyle = '#102938';
          ctx.fillRect(pl.x0, py, pw, 28);
          ctx.fillStyle = pl === bossPlat ? selected.accent : '#6bc5e8';
          ctx.fillRect(pl.x0, py, pw, 3.5);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '900 9px "Russo One", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(label, (pl.x0 + pl.x1) * 0.5, py + 18);
        }

        // Helper to draw a stickman + its embedded (`nancep`) axes/arrows + localized Level-1 effects
        const renderActor = (k: Stick, look: StickLook, stuckList: CodexStuck[], isBoss: boolean, flash: number) => {
          const fl = Math.round(flash * 200);
          const curLook: StickLook = {
            ...look,
            color: fl > 5 ? `rgb(${fl},25,25)` : '#000000',
          };
          drawStick(
            ctx,
            k,
            curLook,
            () => {
              if (isBoss) {
                drawBossHeldWeapon(ctx, k, selected.id, s.rt);
              }
            },
            () => {
              // Embedded axes & arrows go down BEFORE the body so the blade/point sits buried (`nancep`) inside!
              for (const st of stuckList) {
                const [ia, ib] = RAG_STICKS[st.stick];
                const A = k.p[ia];
                const B = k.p[ib];
                const ba = Math.atan2(B.y - A.y, B.x - A.x);
                const c = Math.cos(ba);
                const sn = Math.sin(ba);
                const wp = v(A.x + st.lx * c - st.ly * sn, A.y + st.lx * sn + st.ly * c);
                if (st.isAxe) {
                  drawAxe(ctx, wp, ba + st.rel, st.s ?? 1.2, true, st.bossKind ?? 'axer', s.rt);
                } else {
                  drawArrow(ctx, wp, ba + st.rel, 1, true, st.bow, s.rt, false);
                }
              }
            }
          );

          // Render localized Level-1 elemental simulation on the struck body part (`st.stick`)
          for (let si = 0; si < stuckList.length; si++) {
            const st = stuckList[si];
            if (st.fxT <= 0) continue;
            const [ia, ib] = RAG_STICKS[st.stick];
            const A = k.p[ia];
            const B = k.p[ib];
            const wp = lerpV(A, B, st.u);
            const inten = clamp(st.fxT / 1.2, 0, 1);
            if (st.bow === 'thunder') {
              ctx.save();
              ctx.shadowColor = 'rgba(0, 235, 255, 0.9)';
              ctx.shadowBlur = 6;
              ctx.globalAlpha = inten * 0.85;
              drawSkeleton(ctx, k, st.stick, wp, 0, true);
              ctx.globalCompositeOperation = 'lighter';
              drawBolt(ctx, A, wp, 4 * k.s, 5, '#ffffff', '#00e5ff', 1.15, false, s.rt * 18 + si * 5);
              drawBolt(ctx, wp, B, 4 * k.s, 5, '#ffffff', '#00e5ff', 1.15, false, s.rt * 18 + si * 5 + 3);
              ctx.restore();
            } else if (st.bow === 'fire') {
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = inten * 0.92;
              const sway = Math.sin(s.rt * 9 + si * 2) * 0.12;
              drawSimFlame(ctx, wp, -Math.PI / 2 + sway, 18 * k.s, 6 * k.s, 0.5, s.rt, si * 3);
              drawSimFlame(ctx, wp, -Math.PI / 2 + sway * 0.6, 12 * k.s, 4 * k.s, 0.92, s.rt, si * 5);
              ctx.restore();
            } else if (st.bow === 'poison') {
              ctx.save();
              ctx.globalAlpha = inten * 0.9;
              const cycle = (s.rt * 1.6 + si * 0.37) % 1;
              const dropLen = (4 + cycle * 14) * k.s;
              ctx.strokeStyle = '#7bff00';
              ctx.lineWidth = 1.9 * (1 - cycle * 0.45);
              ctx.beginPath(); ctx.moveTo(wp.x, wp.y); ctx.lineTo(wp.x, wp.y + dropLen); ctx.stroke();
              ctx.fillStyle = '#eaff66';
              ctx.beginPath(); ctx.ellipse(wp.x, wp.y + dropLen, 1.6, 2.3, 0, 0, Math.PI * 2); ctx.fill();
              ctx.restore();
            }
          }
        };

        // Draw Target Dummy Stickman
        renderActor(
          s.dummy,
          { color: '#000000', rim: '#6bc5e8', eye: '#ffffff', helm: false, crown: false, band: '#5ad1ff', quiver: false },
          s.dummyStuck,
          false,
          s.dummyFlash
        );

        // Draw Selected Boss Stickman
        renderActor(
          s.boss,
          {
            color: '#000000',
            rim: selected.accent,
            eye: selected.eyeCol,
            helm: false,
            crown: false,
            horns: true,
            band: selected.bandCol,
            quiver: false,
            bossKind: selected.id,
          },
          s.bossStuck,
          true,
          s.bossFlash
        );

        // Non-head X-Ray on Boss when struck by test arrow (no black panel!)
        if (s.xrayT > 0) {
          ctx.save();
          ctx.globalAlpha = clamp(s.xrayT * 2.5, 0, 1);
          ctx.shadowColor = 'rgba(110, 235, 255, 0.98)';
          ctx.shadowBlur = 8;
          drawSkeleton(ctx, s.boss, s.xrayStick, s.xrayPt, 1 - s.xrayT / 0.55, true);
          ctx.restore();
        }

        // Draw flying Boss weapons
        for (const ax of s.axes) {
          if (ax.stuckPlat) continue;
          for (const [back, al] of [
            [0.45, 0.2],
            [0.22, 0.38],
            [0, 1],
          ]) {
            ctx.globalAlpha = al;
            if (ax.bossKind === 'thunder_lord') {
              const pos = add(ax.p, mul(ax.vel, -0.022 * back));
              drawAxe(ctx, add(pos, fromAngle(ax.ang, -14 * ax.s)), ax.ang, ax.s, false, ax.bossKind, s.rt);
            } else {
              const an = ax.ang - ax.vr * 0.04 * back * 2;
              drawAxe(ctx, add(ax.p, fromAngle(an, -12 * ax.s)), an, ax.s, false, ax.bossKind, s.rt);
            }
          }
          ctx.globalAlpha = 1;
        }

        // Draw test arrows
        for (const ar of s.arrows) {
          drawArrow(ctx, ar.p, ar.ang, 1, false, ar.bow, s.rt, true);
        }

        // Draw particles
        for (const p of s.parts) {
          const u = p.life / p.max;
          if (p.kind === 'ring') {
            ctx.globalAlpha = (1 - u) * 0.85;
            ctx.strokeStyle = p.col;
            ctx.lineWidth = 3 * (1 - u);
            ctx.beginPath(); ctx.arc(p.p.x, p.p.y, p.r * u, 0, Math.PI * 2); ctx.stroke();
          } else {
            ctx.globalAlpha = clamp(1 - u, 0, 1);
            ctx.fillStyle = p.col;
            ctx.beginPath(); ctx.arc(p.p.x, p.p.y, p.r, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [selected]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm select-none sm:p-5">
      <div className="g-pop flex h-full max-h-[680px] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border-4 border-[#041e2b] bg-[#0b2536] shadow-[0_24px_60px_rgba(0,0,0,0.75)] md:flex-row">
        {/* ============ LEFT / TOP: LIVE INTERACTIVE BOSS RAGDOLL & WEAPON-EMBED STAGE ============ */}
        <div className="relative flex flex-1 flex-col justify-between bg-[#071624]">
          {/* Header Bar */}
          <div className="z-10 flex items-center justify-between border-b border-white/10 bg-[#05121d]/90 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span
                className="font-game grid h-8 w-8 place-items-center rounded-lg text-sm text-[#041824]"
                style={{ backgroundColor: selected.accent }}
              >
                #{selected.num}
              </span>
              <div>
                <h2 className="font-game text-lg leading-none text-white sm:text-2xl">{tx(selected.name, selected.nameId)}</h2>
                <div className="mt-0.5 text-xs font-black tracking-wider uppercase" style={{ color: selected.accent }}>
                  {selected.title} · {tx(selected.elementTag, selected.elementTagId)}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                audioInit();
                snd.tap();
                onClose();
              }}
              className="grid h-10 w-10 place-items-center rounded-xl border-2 border-[#09090d] bg-gradient-to-br from-[#ff3b30] to-[#a80c07] text-white shadow-[0_3px_0_#09090d] transition hover:brightness-110 active:translate-y-0.5"
              aria-label={tx('Close Boss Codex', 'Tutup Kamus Bos')}
            >
              <span className="font-game text-xl">X</span>
            </button>
          </div>

          {/* Live Physics Canvas */}
          <div className="relative min-h-[230px] flex-1">
            <canvas
              ref={canvasRef}
              onClick={triggerBossThrow}
              className="absolute inset-0 h-full w-full cursor-pointer"
            />
            <div className="pointer-events-none absolute left-3 top-2.5 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-cyan-200 ring-1 ring-white/15">
              🎬 {tx(`Live 120Hz Physics Sim · ${selected.weaponShort} embeds in target!`, `Simulasi Fisika 120Hz Live · ${selected.weaponShortId} Nancep di Tubuh Target!`)}
            </div>
          </div>

          {/* Lore, Stats & Interactive Animation Test Buttons */}
          <div className="z-10 border-t border-white/10 bg-[#081d2c] p-3.5 sm:p-4">
            <div className="flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-amber-300">{tx(selected.hpText, selected.hpTextId)}</span>
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-cyan-300">{tx(selected.dmgText, selected.dmgTextId)}</span>
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-emerald-300">
                {tx(`SIGNATURE WEAPON: ${selected.weaponName}`, `SENJATA KHAS: ${selected.weaponNameId}`)}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/85">{tx(selected.desc, selected.descId)}</p>
            <p className="mt-1 text-xs font-bold" style={{ color: selected.accent }}>
              ★ {tx(`Special Ability: ${selected.abilityDesc}`, `Kemampuan Khusus: ${selected.abilityDescId}`)}
            </p>

            {/* Interactive Controls */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={triggerBossThrow}
                className="font-game rounded-xl border-2 border-[#031a24] bg-gradient-to-b from-[#ffb53a] to-[#f47a00] px-3.5 py-2 text-xs text-white shadow-[0_3px_0_#031a24] transition hover:brightness-110 active:translate-y-0.5 sm:text-sm"
              >
                🎯 {tx(`THROW ${selected.weaponShort}`, `LEMPAR ${selected.weaponShortId} (NANCEP!)`)}
              </button>
              <button
                onClick={triggerShootBoss}
                className="font-game rounded-xl border-2 border-[#031a24] bg-gradient-to-b from-[#2998ff] to-[#0f62c9] px-3.5 py-2 text-xs text-white shadow-[0_3px_0_#031a24] transition hover:brightness-110 active:translate-y-0.5 sm:text-sm"
              >
                🏹 {tx('TEST ARROW ON BOSS (X-RAY)', 'TES PANAH KE BOS (X-RAY)')}
              </button>
              <button
                onClick={clearDummyAxes}
                className="font-game rounded-xl border-2 border-[#031a24] bg-[#163c52] px-3 py-2 text-xs text-white/85 transition hover:bg-[#1f506b] active:translate-y-0.5"
              >
                🔄 {tx('CLEAR', 'BERSIHKAN')}
              </button>
              <button
                onClick={() => {
                  audioInit();
                  snd.boss();
                  onFightBoss(selected.id);
                }}
                className="font-game ml-auto rounded-xl border-2 border-[#031a24] bg-gradient-to-b from-[#ff5a4f] to-[#c91c14] px-4 py-2 text-xs text-white shadow-[0_3px_0_#031a24] transition hover:brightness-110 active:translate-y-0.5 sm:text-sm"
              >
                ⚔️ {tx('FIGHT THIS BOSS NOW!', 'LAWAN BOS INI SEKARANG!')}
              </button>
            </div>
          </div>
        </div>

        {/* ============ RIGHT: BOSS CODEX SELECTOR LIST ============ */}
        <div className="flex h-[38%] w-full flex-col border-t-4 border-[#041e2b] bg-[#0e2d42] md:h-full md:w-[355px] md:border-l-4 md:border-t-0">
          {onEnemies && (
            <div className="flex gap-1.5 border-b border-white/10 bg-[#061826] p-2">
              <button
                onClick={() => {
                  audioInit();
                  snd.tap();
                  onEnemies();
                }}
                className="font-game flex-1 rounded-xl border-2 border-[#051b29] bg-[#092030] px-2 py-1.5 text-xs text-white/75 transition hover:bg-[#11354d] active:translate-y-0.5"
              >
                👹 {tx('ALL ENEMIES', 'SEMUA MUSUH')}
              </button>
              <span className="font-game flex-1 rounded-xl border-2 border-[#ffd93b] bg-[#16425e] px-2 py-1.5 text-center text-xs text-[#ffd93b]">
                👑 {tx('5 BOSSES', '5 BOS')}
              </span>
            </div>
          )}
          <div className="border-b border-white/10 bg-[#092030] px-4 py-3">
            <div className="font-game text-lg tracking-wide text-[#ffd23f]">📖 {tx('5 BOSSES & WEAPONS CODEX', 'KAMUS 5 BOS & SENJATA')}</div>
            <div className="text-xs font-bold text-white/80">
              {tx(
                `BOSSES APPEAR ONLY ON LEVEL ${CFG.bigBoss.every}, ${CFG.bigBoss.every * 2}, ${CFG.bigBoss.every * 3}, ...`,
                `BOS HANYA PADA LEVEL ${CFG.bigBoss.every}, ${CFG.bigBoss.every * 2}, ${CFG.bigBoss.every * 3}, ...`,
              )}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {BOSS_CODEX.map((b) => {
              const isSel = selected.id === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    audioInit();
                    snd.tap();
                    setSelectedId(b.id);
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 p-2.5 text-left transition active:scale-[0.98] ${
                    isSel
                      ? 'border-[#ffd93b] bg-[#16425e] shadow-[0_0_16px_rgba(255,217,59,0.3)]'
                      : 'border-[#051b29] bg-[#092030]/80 hover:bg-[#11354d]'
                  }`}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-black/40 bg-[#071624] shadow">
                    <BossWeaponIcon id={b.id} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-game truncate text-sm text-white sm:text-base">
                      #{b.num} {tx(b.name, b.nameId)}
                    </div>
                    <div className="truncate text-xs font-black uppercase" style={{ color: b.accent }}>
                      {tx(b.elementTag, b.elementTagId)}
                    </div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-white/75">{tx(b.weaponName, b.weaponNameId)}</div>
                  </div>
                  {isSel && <span className="font-game text-xs text-[#ffd93b]">▶</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
