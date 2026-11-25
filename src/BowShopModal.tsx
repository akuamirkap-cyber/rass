import { useEffect, useState } from 'react';
import { BowId } from './game/ragdoll/game';
import { audioInit, snd } from './game/ragdoll/audio';
import { tx, useLang } from './i18n';

export interface BowMeta {
  id: BowId;
  name: string;
  tag: string;
  tagId: string;
  desc: string;
  descId: string;
  dmgText: string;
  dmgTextId: string;
  effectText: string;
  effectTextId: string;
  accent: string;
}

export const BOW_LIST: BowMeta[] = [
  {
    id: 'legend',
    name: 'LEGEND ASTRA',
    tag: '✦ LEGENDARY STAR BOW & ARROWS',
    tagId: '✦ BUSUR & PANAH LEGENDA',
    desc: 'Aurora-winged star crystal bow. Fires white-violet star blades leaving a color-shifting comet trail that bursts into starlight on hit — staggering enemies and breaking their shot rhythm. Highest damage of all bows.',
    descId: 'Busur kristal bintang bersayap aurora. Panahnya berbilah bintang putih-ungu, meninggalkan ekor komet yang berganti warna, dan pecah menjadi sinar bintang saat mengenai sasaran — musuh yang kena kehilangan irama tembaknya. Damage tertinggi dari semua busur.',
    dmgText: '150% DAMAGE · STARBURST IMPACT',
    dmgTextId: 'DAMAGE 150% · LEDAKAN BINTANG',
    effectText: 'COMET TAIL & STARLIGHT BURST',
    effectTextId: 'EKOR KOMET & SINAR BINTANG',
    accent: '#b9a8ff',
  },
  {
    id: 'gold',
    name: 'GOLDEN MIDAS',
    tag: '👑 GOLDEN BOW & ARROWS',
    tagId: '👑 BUSUR & PANAH EMAS',
    desc: 'Pure ruby-inlaid gold bow firing gleaming golden arrows. Every arrow that strikes an enemy knocks loose bonus gold coins — the fastest way to build wealth.',
    descId: 'Busur emas murni bertatah rubi dengan panah emas yang berkilau. Setiap panah yang mengenai musuh merontokkan koin emas tambahan — cara tercepat untuk kaya.',
    dmgText: '130% DAMAGE · +2 COINS PER HIT',
    dmgTextId: 'DAMAGE 130% · +2 KOIN TIAP KENA',
    effectText: 'GOLDEN GLEAM & COIN SHOWER',
    effectTextId: 'KILAU EMAS & HUJAN KOIN',
    accent: '#ffd23f',
  },
  {
    id: 'thunder',
    name: 'THUNDER VOLT',
    tag: '⚡ LIGHTNING BOW & ARROWS',
    tagId: '⚡ BUSUR & PANAH LISTRIK',
    desc: 'Fires high-voltage plasma arrows. Striking an enemy or boss axe calls down fractal lightning from the sky, surging electricity along their X-Ray skeleton and triggering chain shock!',
    descId: 'Menembakkan panah plasma tegangan tinggi. Saat mengenai musuh atau kapak bos, menyambar dengan petir fraktal dari langit, mengalirkan listrik di sepanjang tulang kerangka X-Ray musuh, dan memicu petir berantai!',
    dmgText: '125% DAMAGE + X-RAY BONE SHOCK',
    dmgTextId: 'DAMAGE 125% + SETRUM TULANG X-RAY',
    effectText: 'FRACTAL LIGHTNING & CHAIN SHOCK',
    effectTextId: 'FRACTAL LIGHTNING & CHAIN SHOCK',
    accent: '#00f0ff',
  },
  {
    id: 'fire',
    name: 'INFERNO BLAZE',
    tag: '🔥 FLUID FLAME BOW & ARROWS',
    tagId: '🔥 BUSUR & PANAH API SIMULASI',
    desc: 'Magma dragon bow with simulated fluid flames. Detonates into volumetric flame tongues that wrap around and scorch every joint of the enemy!',
    descId: 'Busur naga magma dengan simulasi lidah api fluida (fluid flame simulation). Meledak menjadi semburan lidah api volumetrik yang membungkus dan membakar seluruh persendian tubuh musuh!',
    dmgText: '125% DAMAGE + FLUID FLAME BURN',
    dmgTextId: 'DAMAGE 125% + FLUID FLAME BURN',
    effectText: 'SIMULATION FLAME & THERMAL PLUME',
    effectTextId: 'SIMULATION FLAME & THERMAL PLUME',
    accent: '#ff7b14',
  },
  {
    id: 'wood',
    name: 'WOOD BOW',
    tag: '🪵 CLASSIC RECURVE BOW',
    tagId: '🪵 BUSUR KAYU KLASIK',
    desc: 'Classic white-wrapped wooden recurve bow — balanced, accurate, and dependable for picking off enemies or shooting boss weapons out of mid-air.',
    descId: 'Busur kayu recurve lilitan kain putih klasik yang seimbang, akurat, dan tangguh untuk memanah musuh maupun menangkis kapak bos di udara.',
    dmgText: '100% DAMAGE · HIGH ACCURACY',
    dmgTextId: 'DAMAGE 100% · AKURASI TINGGI',
    effectText: 'CLASSIC STEEL ARROW',
    effectTextId: 'PANAH BAJA KLASIK',
    accent: '#ffb52e',
  },
  {
    id: 'spike',
    name: 'SPIKE FUZE',
    tag: '🌿 EMERALD THORN BOW',
    tagId: '🌿 BUSUR DURI ZAMRUD',
    desc: 'Living thorned root bow firing barbed emerald arrows. Upon embedding, it blasts sharp thorns in every direction to shred enemy defenses!',
    descId: 'Busur akar berduri hidup yang menembakkan panah kait zamrud. Saat menancap, meledakkan duri-duri tajam ke segala arah yang mencabik pertahanan lawan!',
    dmgText: '118% DAMAGE + THORN BURST',
    dmgTextId: 'DAMAGE 118% + LEDAKAN DURI',
    effectText: 'RAZOR THORN SHARDS',
    effectTextId: 'SERPIHAN DURI TAJAM',
    accent: '#6bff2b',
  },
  {
    id: 'poison',
    name: 'POISONOUS WHISPER',
    tag: '🧪 XENOMORPH ACID SPITTER',
    tagId: '🧪 XENOMORPH ACID SPITTER',
    desc: 'Sprays high-pressure molecular acid! Splashes thick neon-green corrosive fluid that melts enemies down to glowing ribs and leaves bubbling acid pools.',
    descId: 'Menyemburkan asam molekuler bertekanan tinggi ala Xenomorph Acid Spitter! Mencipratkan cairan asam hijau-kuning kental yang melelehkan tubuh musuh hingga tulang rusuknya tampak menyala dan membentuk kubangan asam mendidih!',
    dmgText: '118% DAMAGE + XENOMORPH ACID MELT',
    dmgTextId: 'DAMAGE 118% + XENOMORPH ACID MELT',
    effectText: 'ACID SPLATTER, DRIP & CORROSIVE FUMES',
    effectTextId: 'ACID SPLATTER, DRIP & CORROSIVE FUMES',
    accent: '#cfff04',
  },
];

/** Detailed horizontal Bow + Arrow artwork for the CHOOSE A BOW list */
export function BowArt({ id, className = 'w-56 h-20', animated = false }: { id: BowId; className?: string; animated?: boolean }) {
  if (id === 'gold' || id === 'legend') {
    // the two prize bows share one drawing in different metals: gold set with a ruby, star-crystal set with a sapphire
    const c = id === 'gold'
      ? { a: '#fff6c8', b: '#ffc933', c: '#b8860b', line: '#5a3a00', str: '#fff3c4', gem: '#e5352f', vane: '#fff3c4', vane2: '#e0a91e', head: '#ffd23f' }
      : { a: '#ffffff', b: '#b9a8ff', c: '#5a45d6', line: '#1d1260', str: '#d8ccff', gem: '#5cf4ff', vane: '#8e7bff', vane2: '#ff7be5', head: '#f4f0ff' };
    return (
      <svg viewBox="0 0 240 86" className={className} aria-hidden>
        <defs>
          <linearGradient id={`${id}-limb`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.a} />
            <stop offset="45%" stopColor={c.b} />
            <stop offset="100%" stopColor={c.c} />
          </linearGradient>
        </defs>
        <line x1="18" y1="54" x2="222" y2="54" stroke={c.str} strokeWidth="2.2" opacity="0.9" />
        <path d="M14 55 C28 52, 42 18, 78 20 C94 21, 102 32, 110 34 L108 44 C98 42, 88 33, 74 33 C48 33, 34 58, 18 59 Z" fill={`url(#${id}-limb)`} stroke={c.line} strokeWidth="2" />
        <path d="M226 55 C212 52, 198 18, 162 20 C146 21, 138 32, 130 34 L132 44 C142 42, 152 33, 166 33 C192 33, 206 58, 222 59 Z" fill={`url(#${id}-limb)`} stroke={c.line} strokeWidth="2" />
        <path d="M30 50 C40 44, 50 28, 76 26" fill="none" stroke={c.a} strokeWidth="1.4" opacity="0.8" />
        <path d="M210 50 C200 44, 190 28, 164 26" fill="none" stroke={c.a} strokeWidth="1.4" opacity="0.8" />
        <rect x="105" y="29" width="30" height="18" rx="6" fill={c.c} stroke={c.line} strokeWidth="2" />
        <path d="M120 32 l6 6 -6 6 -6 -6z" fill={c.gem} stroke={c.line} strokeWidth="1" />
        <line x1="40" y1="70.6" x2="196" y2="70.6" stroke={c.c} strokeWidth="4" />
        <line x1="40" y1="69.6" x2="196" y2="69.6" stroke={c.b} strokeWidth="2.6" />
        <line x1="46" y1="68.6" x2="190" y2="68.6" stroke={c.a} strokeWidth="0.9" />
        <path d="M218 70 L192 60.5 L198 70 L192 79.5 Z" fill={c.head} stroke={c.line} strokeWidth="1.5" strokeLinejoin="miter" />
        <path d="M218 70 L192 60.5 L198 70 Z" fill="#ffffff" opacity="0.7" />
        <path d="M215 70 L198 70" stroke={c.line} strokeWidth="0.9" />
        <path d="M60 70 C52 59, 41 59, 29 61 L36 70 Z" fill={c.vane} stroke={c.line} strokeWidth="1" strokeLinejoin="round" />
        <path d="M60 70 C52 81, 41 81, 29 79 L36 70 Z" fill={c.vane2} stroke={c.line} strokeWidth="1" strokeLinejoin="round" />
        <rect x="63" y="67.6" width="2.4" height="5" fill={c.gem} />
        <rect x="67.4" y="67.6" width="1.6" height="5" fill={c.gem} />
      </svg>
    );
  }
  if (id === 'wood') {
    return (
      <svg viewBox="0 0 240 86" className={className} aria-hidden>
        <defs>
          <linearGradient id="wb-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d46b38" />
            <stop offset="50%" stopColor="#9c3f1b" />
            <stop offset="100%" stopColor="#5e210b" />
          </linearGradient>
        </defs>
        <line x1="18" y1="54" x2="222" y2="54" stroke="#ffffff" strokeWidth="2.2" opacity="0.9" />
        <path d="M14 55 C28 52, 42 18, 78 20 C94 21, 102 32, 110 34 L108 44 C98 42, 88 33, 74 33 C48 33, 34 58, 18 59 Z" fill="url(#wb-wood)" stroke="#3d1405" strokeWidth="2" />
        <path d="M226 55 C212 52, 198 18, 162 20 C146 21, 138 32, 130 34 L132 44 C142 42, 152 33, 166 33 C192 33, 206 58, 222 59 Z" fill="url(#wb-wood)" stroke="#3d1405" strokeWidth="2" />
        <path d="M52 24 C62 20, 74 19, 84 22 L81 35 C72 33, 62 34, 55 38 Z" fill="#eef4f8" stroke="#9fb0bc" strokeWidth="1.5" />
        <path d="M64 21 L62 34 M73 20 L71 34" stroke="#b6c6d1" strokeWidth="1.5" />
        <path d="M188 24 C178 20, 166 19, 156 22 L159 35 C168 33, 178 34, 185 38 Z" fill="#eef4f8" stroke="#9fb0bc" strokeWidth="1.5" />
        <path d="M176 21 L178 34 M167 20 L169 34" stroke="#b6c6d1" strokeWidth="1.5" />
        <rect x="107" y="31" width="26" height="14" rx="4" fill="#2b2d38" stroke="#14151c" strokeWidth="2" />
        <line x1="114" y1="31" x2="114" y2="45" stroke="#505466" strokeWidth="2" />
        <line x1="120" y1="31" x2="120" y2="45" stroke="#505466" strokeWidth="2" />
        <line x1="126" y1="31" x2="126" y2="45" stroke="#505466" strokeWidth="2" />
        <polygon points="44,58 34,50 56,50 64,58 56,66 34,66" fill="#ff2a1f" stroke="#7a0904" strokeWidth="1.5" />
        <rect x="48" y="55" width="136" height="6" rx="2" fill="#f7a828" stroke="#8a4e06" strokeWidth="1.5" />
        <polygon points="212,58 180,47 186,58 180,69" fill="#7c8f9c" stroke="#1d2830" strokeWidth="1.8" />
        <polygon points="212,58 186,58 180,47" fill="#f4faff" />
        <line x1="186" y1="58" x2="210" y2="58" stroke="#ffffff" strokeWidth="1.1" />
      </svg>
    );
  }

  if (id === 'thunder') {
    return (
      <svg viewBox="0 0 240 86" className={className} aria-hidden>
        <defs>
          <linearGradient id="tb-limb" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9efbff" />
            <stop offset="45%" stopColor="#1282eb" />
            <stop offset="100%" stopColor="#081e42" />
          </linearGradient>
          <filter id="tb-glow">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <line x1="18" y1="54" x2="222" y2="54" stroke="#00f0ff" strokeWidth="4" opacity="0.45" />
        <line x1="18" y1="54" x2="222" y2="54" stroke="#ffffff" strokeWidth="1.6" />
        <path d="M12 56 L32 32 L54 18 L86 20 L108 33 L105 44 L82 32 L56 31 L36 44 L20 60 Z" fill="url(#tb-limb)" stroke="#041229" strokeWidth="2" />
        <path d="M228 56 L208 32 L186 18 L154 20 L132 33 L135 44 L158 32 L184 31 L204 44 L220 60 Z" fill="url(#tb-limb)" stroke="#041229" strokeWidth="2" />
        <circle cx="56" cy="24" r="6" fill="#ffd23f" stroke="#061b3a" strokeWidth="1.8" />
        <circle cx="56" cy="24" r="3" fill="#ffffff" />
        <circle cx="184" cy="24" r="6" fill="#ffd23f" stroke="#061b3a" strokeWidth="1.8" />
        <circle cx="184" cy="24" r="3" fill="#ffffff" />
        <rect x="104" y="29" width="32" height="17" rx="5" fill="#102a4c" stroke="#041229" strokeWidth="2" />
        <circle cx="120" cy="37.5" r="6.5" fill="#00f0ff" stroke="#ffffff" strokeWidth="1.8" />
        <g filter="url(#tb-glow)" className={animated ? 'animate-pulse' : ''}>
          <polyline points="20,54 42,40 58,52 78,35 102,49 120,34 142,50 165,36 188,51 206,40 220,54" fill="none" stroke="#0077ff" strokeWidth="5.2" opacity="0.5" />
          <polyline points="20,54 42,40 58,52 78,35 102,49 120,34 142,50 165,36 188,51 206,40 220,54" fill="none" stroke="#00f0ff" strokeWidth="2.6" />
          <polyline points="20,54 42,40 58,52 78,35 102,49 120,34 142,50 165,36 188,51 206,40 220,54" fill="none" stroke="#ffffff" strokeWidth="1.2" />
          <polyline points="56,24 72,8 95,21 120,7 146,21 168,8 184,24" fill="none" stroke="#75f8ff" strokeWidth="2.2" />
          <polyline points="56,24 72,8 95,21 120,7 146,21 168,8 184,24" fill="none" stroke="#ffffff" strokeWidth="1.0" />
        </g>
        <polygon points="42,60 30,51 54,51 62,60 54,69 30,69" fill="#00d0ff" stroke="#052647" strokeWidth="1.5" />
        <rect x="46" y="57" width="140" height="6" rx="2" fill="#82f7ff" stroke="#084c82" strokeWidth="1.5" />
        <line x1="50" y1="60" x2="184" y2="60" stroke="#ffffff" strokeWidth="2" />
        <polygon points="214,60 180,47 187,60 180,73" fill="#0d8bd1" stroke="#041e38" strokeWidth="1.8" />
        <polygon points="214,60 187,60 180,47" fill="#ffffff" />
        <line x1="187" y1="60" x2="212" y2="60" stroke="#9efbff" strokeWidth="1.2" />
      </svg>
    );
  }

  if (id === 'fire') {
    return (
      <svg viewBox="0 0 240 86" className={className} aria-hidden>
        <defs>
          <linearGradient id="fb-limb" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff078" />
            <stop offset="45%" stopColor="#ff6210" />
            <stop offset="100%" stopColor="#7a1002" />
          </linearGradient>
          <linearGradient id="fb-flame" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="28%" stopColor="#ffe252" />
            <stop offset="68%" stopColor="#ff5e0e" />
            <stop offset="100%" stopColor="#b81400" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="18" y1="54" x2="222" y2="54" stroke="#ffbe3b" strokeWidth="2.4" />
        {/* Fluid Flame Wisp Plumes along Bow Limbs */}
        <path d="M26 42 C18 22, 38 6, 62 12 C52 2, 78 2, 98 16 C88 8, 108 12, 114 26 Z" fill="url(#fb-flame)" opacity="0.92" />
        <path d="M214 42 C222 22, 202 6, 178 12 C188 2, 162 2, 142 16 C152 8, 132 12, 126 26 Z" fill="url(#fb-flame)" opacity="0.92" />
        <path d="M12 56 C24 38, 46 14, 82 18 C96 20, 104 30, 110 33 L107 44 C96 40, 86 32, 72 32 C46 32, 32 48, 20 60 Z" fill="url(#fb-limb)" stroke="#2b0600" strokeWidth="2" />
        <path d="M228 56 C216 38, 194 14, 158 18 C144 20, 136 30, 130 33 L133 44 C144 40, 154 32, 168 32 C194 32, 208 48, 220 60 Z" fill="url(#fb-limb)" stroke="#2b0600" strokeWidth="2" />
        <rect x="105" y="29" width="30" height="16" rx="5" fill="#3b0c04" stroke="#1c0400" strokeWidth="2" />
        <circle cx="120" cy="37" r="6" fill="#ff5500" />
        <circle cx="120" cy="37" r="3.2" fill="#fff8b0" />
        <polygon points="42,60 30,51 54,51 62,60 54,69 30,69" fill="#ff3b14" stroke="#590900" strokeWidth="1.5" />
        <rect x="46" y="57" width="136" height="6" rx="2" fill="#ff881c" stroke="#591500" strokeWidth="1.5" />
        <path d="M204 60 C192 44, 172 46, 156 52 C168 56, 168 64, 156 68 C172 74, 192 76, 204 60 Z" fill="url(#fb-flame)" />
        <polygon points="216,60 182,48 188,60 182,72" fill="#8f290d" stroke="#240702" strokeWidth="1.8" />
        <polygon points="216,60 188,60 182,48" fill="#ffe29e" />
      </svg>
    );
  }

  if (id === 'spike') {
    return (
      <svg viewBox="0 0 240 86" className={className} aria-hidden>
        <defs>
          <linearGradient id="sb-limb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9eff2e" />
            <stop offset="55%" stopColor="#2eb82e" />
            <stop offset="100%" stopColor="#114a14" />
          </linearGradient>
        </defs>
        <line x1="18" y1="54" x2="222" y2="54" stroke="#baff75" strokeWidth="2" opacity="0.85" />
        <path d="M10 52 C28 50, 38 18, 76 22 C92 24, 102 34, 112 36 L110 46 C96 44, 86 35, 70 35 C42 35, 32 58, 14 58 Z" fill="url(#sb-limb)" stroke="#0a2e0c" strokeWidth="2" />
        <path d="M230 52 C212 50, 202 18, 164 22 C148 24, 138 34, 128 36 L130 46 C144 44, 154 35, 170 35 C198 35, 208 58, 226 58 Z" fill="url(#sb-limb)" stroke="#0a2e0c" strokeWidth="2" />
        <path d="M36 33 L24 18 L46 25 Z M66 22 L60 8 L78 21 Z M92 27 L96 13 L105 31 Z" fill="#8eff2b" stroke="#0d3810" strokeWidth="1.4" />
        <path d="M204 33 L216 18 L194 25 Z M174 22 L180 8 L162 21 Z M148 27 L144 13 L135 31 Z" fill="#8eff2b" stroke="#0d3810" strokeWidth="1.4" />
        <circle cx="120" cy="39" r="9" fill="#2eb82e" stroke="#0a2e0c" strokeWidth="2" />
        <circle cx="120" cy="39" r="4" fill="#9eff2e" />
        <polygon points="44,60 32,52 54,52 62,60 54,68 32,68" fill="#3fd42b" stroke="#0d3810" strokeWidth="1.5" />
        <rect x="46" y="57" width="138" height="6" rx="2" fill="#4f2d1d" stroke="#26130a" strokeWidth="1.5" />
        <polygon points="214,60 180,47 187,60 177,74" fill="#2ea81f" stroke="#0a2e0c" strokeWidth="1.8" />
        <polygon points="214,60 187,60 180,47" fill="#e8ffd1" />
      </svg>
    );
  }

  // Poisonous Whisper — Xenomorph Acid Spitter Bow
  return (
    <svg viewBox="0 0 240 86" className={className} aria-hidden>
      <defs>
        <linearGradient id="pb-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe552" />
          <stop offset="55%" stopColor="#f09c14" />
          <stop offset="100%" stopColor="#8a4e00" />
        </linearGradient>
      </defs>
      <line x1="20" y1="54" x2="220" y2="54" stroke="#d4ff00" strokeWidth="2.2" opacity="0.9" />
      <path d="M14 54 C30 34, 52 18, 86 22 C100 24, 106 32, 112 36 L109 46 C96 42, 86 34, 70 34 C46 34, 34 48, 20 58 Z" fill="url(#pb-gold)" stroke="#3d2400" strokeWidth="2" />
      <path d="M226 54 C210 34, 188 18, 154 22 C140 24, 134 32, 128 36 L131 46 C144 42, 154 34, 170 34 C194 34, 206 48, 220 58 Z" fill="url(#pb-gold)" stroke="#3d2400" strokeWidth="2" />
      <path d="M46 26 C58 20, 74 20, 86 25 L82 34 C72 30, 58 31, 50 36 Z" fill="#6eff00" stroke="#184d00" strokeWidth="1.5" />
      <path d="M194 26 C182 20, 166 20, 154 25 L158 34 C168 30, 182 31, 190 36 Z" fill="#6eff00" stroke="#184d00" strokeWidth="1.5" />
      <rect x="108" y="31" width="24" height="15" rx="4" fill="#1e2908" stroke="#0c1202" strokeWidth="2" />
      <circle cx="120" cy="38.5" r="5.5" fill="#cfff04" />
      {/* Dripping Xenomorph Acid Strands */}
      <path d="M64 34 L64 49 M176 34 L176 50 M198 63 L198 79" stroke="#a6ff00" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="64" cy="50" r="2.8" fill="#f0ff80" />
      <circle cx="176" cy="51" r="2.8" fill="#f0ff80" />
      <circle cx="198" cy="80" r="3.2" fill="#eaff66" />
      {/* Xenomorph Acid Arrow */}
      <polygon points="44,60 32,52 54,52 62,60 54,68 32,68" fill="#cfff04" stroke="#284d00" strokeWidth="1.5" />
      <rect x="46" y="57" width="138" height="6" rx="2" fill="#375914" stroke="#182906" strokeWidth="1.5" />
      <polygon points="214,60 180,47 187,60 180,73" fill="#469c00" stroke="#183800" strokeWidth="1.8" />
      <polygon points="214,60 187,60 180,47" fill="#f5ffbd" />
    </svg>
  );
}

/** Golden L-shaped selection corner bracket from Image 1 */
function GoldCorner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const rot = pos === 'tl' ? '' : pos === 'tr' ? 'scale-x-[-1]' : pos === 'bl' ? 'scale-y-[-1]' : 'scale-[-1]';
  return (
    <svg viewBox="0 0 36 36" className={`pointer-events-none h-7 w-7 sm:h-8 sm:w-8 ${rot}`} aria-hidden>
      <path
        d="M3 32 V12 Q3 3 12 3 H32 L27 11 H14 Q11 11 11 14 V27 Z"
        fill="#ffd93b"
        stroke="#8a5200"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M5 27 V12 Q5 5 12 5 H27" fill="none" stroke="#fff7b8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface ShopProps {
  selected: BowId;
  onSelect: (b: BowId) => void;
  /** unlock-by-achievement: the requirement text for a locked bow, or null when it is free to use */
  lockOf?: (b: BowId) => string | null;
  onClose: () => void;
  onSpawnAxeBoss: () => void;
  mute: boolean;
  onMute: () => void;
}

export default function BowShopModal({
  selected,
  onSelect,
  lockOf,
  onClose,
  onSpawnAxeBoss,
  mute,
  onMute,
}: ShopProps) {
  useLang();
  const [infoBow, setInfoBow] = useState<BowMeta | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const curMeta = BOW_LIST.find((b) => b.id === selected) ?? BOW_LIST[0];

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col overflow-hidden select-none md:flex-row">
      {/* ============ LEFT HALF: LIVE GAMEPLAY VIEWPORT (TRANSPARENT OVER REAL GAMEPLAY CANVAS) ============ */}
      {/* No profile icon, no ad button! You see & can shoot the real ragdoll stickman in the live gameplay background! */}
      <div className="pointer-events-none relative flex min-h-[38%] flex-1 flex-col justify-end p-3 sm:p-5">
        {/* Bottom-Center Live Gameplay Preview Badge */}
          <div className="mb-3 flex flex-col items-center">
          <div className="pointer-events-auto rounded-2xl border border-white/20 bg-[#071824]/80 px-4 py-2 text-center shadow-xl backdrop-blur-md">
            <div className="font-game text-sm tracking-wide sm:text-base" style={{ color: curMeta.accent }}>
              {curMeta.name} — {tx(curMeta.tag, curMeta.tagId)}
            </div>
            <div className="mt-0.5 text-[11px] font-bold text-white/85">
              {tx('Live gameplay preview · Drag & release on the left to shoot right away!', 'Tampilan live di gameplay · Tarik & lepas di kiri untuk menembak langsung!')}
            </div>
          </div>
        </div>

        {/* Bottom Controls on Left Gameplay Viewport */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => {
              audioInit();
              snd.tap();
              onMute();
            }}
            title={mute ? tx('Unmute Sound', 'Nyalakan Suara') : tx('Mute Sound', 'Matikan Suara')}
            className="grid h-12 w-12 place-items-center rounded-full border-2 border-[#2b333c] bg-gradient-to-b from-[#c5d1db] to-[#7d8b96] text-[#1f262e] shadow-lg transition hover:brightness-110 active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                audioInit();
                snd.boss();
                onSpawnAxeBoss();
              }}
              className="font-game rounded-2xl border-2 border-[#04202c] bg-gradient-to-b from-[#ff6b5e] to-[#d42a2a] px-4 py-2.5 text-sm text-white shadow-[0_5px_0_#04202c] transition hover:brightness-110 active:translate-y-1 sm:text-base"
            >
              📖 {tx('5 BOSSES CODEX', 'KAMUS 5 BOS')}
            </button>
            <button
              onClick={() => {
                audioInit();
                snd.tap();
                onClose();
              }}
              className="font-game rounded-2xl border-2 border-[#04202c] bg-gradient-to-b from-[#86e85f] to-[#2fae3c] px-5 py-2.5 text-sm text-white shadow-[0_5px_0_#04202c] transition hover:brightness-110 active:translate-y-1 sm:text-base"
            >
              {tx('EQUIP & PLAY ▶', 'PAKAI & MAIN ▶')}
            </button>
          </div>
        </div>
      </div>

      {/* ============ RIGHT HALF: "CHOOSE A BOW" DARK BLUEPRINT GRID PANEL (IMAGE 1) ============ */}
      <div
        className="pointer-events-auto relative flex h-[62%] w-full flex-col border-t-4 border-[#15182b] bg-[#252947]/95 shadow-[-16px_0_40px_rgba(0,0,0,0.5)] backdrop-blur-sm md:h-full md:w-[45%] md:max-w-[520px] md:border-l-4 md:border-t-0"
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(16, 18, 36, 0.85) 2px, transparent 2.5px),
            linear-gradient(to right, rgba(18, 21, 40, 0.55) 2px, transparent 2px),
            linear-gradient(to bottom, rgba(18, 21, 40, 0.55) 2px, transparent 2px)
          `,
          backgroundSize: '28px 28px',
        }}
      >
        {/* Top Header: Red Square [X] Button + "CHOOSE A BOW" */}
        <div className="flex items-center gap-4 border-b border-white/15 px-4 py-3.5 sm:px-6">
          <button
            onClick={() => {
              audioInit();
              snd.tap();
              onClose();
            }}
            aria-label={tx('Close bow shop', 'Tutup toko busur')}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border-[3px] border-[#09090d] bg-gradient-to-br from-[#ff3b30] via-[#e52019] to-[#990a06] shadow-[0_5px_0_#09090d] transition hover:brightness-110 active:translate-y-1"
          >
            <span className="font-game text-3xl leading-none text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">X</span>
          </button>

          <h2 className="font-game flex-1 text-center text-2xl tracking-wider text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.65)] sm:text-3xl">
            CHOOSE A BOW
          </h2>
        </div>

        {/* Info Modal Banner if user clicked (!) on a bow */}
        {infoBow && (
          <div className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-2xl border-2 border-cyan-400/50 bg-[#14182e]/95 p-3.5 text-white shadow-xl">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-game text-lg" style={{ color: infoBow.accent }}>
                  {infoBow.name}
                </span>
                <span className="rounded bg-emerald-500/25 px-2 py-0.5 text-xs font-black text-emerald-300">
                  {lockOf?.(infoBow.id) ? tx('LOCKED', 'TERKUNCI') : tx('UNLOCKED', 'TERBUKA')}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-white/85">{tx(infoBow.desc, infoBow.descId)}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-black">
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-amber-300">{tx(infoBow.dmgText, infoBow.dmgTextId)}</span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-cyan-300">{tx(infoBow.effectText, infoBow.effectTextId)}</span>
              </div>
            </div>
            <button
              onClick={() => setInfoBow(null)}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-black text-white hover:bg-white/20"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable Bow List */}
        <div className="flex-1 divide-y divide-white/15 overflow-y-auto px-4 py-2 sm:px-7">
          {BOW_LIST.map((b) => {
            const isSel = selected === b.id;
            return (
              <div
                key={b.id}
                onClick={() => {
                  audioInit();
                  onSelect(b.id);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(b.id);
                }}
                className="group relative flex cursor-pointer items-center justify-between py-4 transition hover:bg-white/[0.04]"
              >
                {/* Center Selection Box with 4 Golden Corner Brackets & Left Yellow Arrow (matching Image 1) */}
                <div className="relative mx-auto flex w-full max-w-[300px] flex-col items-center px-5 py-2">
                  {isSel && (
                    <>
                      <div className="absolute left-0 top-0"><GoldCorner pos="tl" /></div>
                      <div className="absolute right-0 top-0"><GoldCorner pos="tr" /></div>
                      <div className="absolute bottom-0 left-0"><GoldCorner pos="bl" /></div>
                      <div className="absolute bottom-0 right-0"><GoldCorner pos="br" /></div>
                      {/* Left Golden Play Triangle */}
                      <svg
                        viewBox="0 0 24 28"
                        className="
                          absolute top-1/2 left-1 h-7 w-6 -translate-y-1/2
                          drop-shadow-[0_2px_0_#7a4600]
                        "
                        aria-hidden
                      >
                        <polygon points="2,2 22,14 2,26" fill="#ffd93b" stroke="#8a5200" strokeWidth="2" strokeLinejoin="round" />
                        <polygon points="4,6 18,14 4,14" fill="#fff7b8" />
                      </svg>
                    </>
                  )}

                  {/* Bow Name */}
                  <div className="font-game text-center text-xl tracking-wide text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.8)] sm:text-2xl">
                    {b.name}
                  </div>

                  {/* Subtitle Tag */}
                  <div className="mt-0.5 text-xs font-black tracking-wider uppercase" style={{ color: b.accent }}>
                    {lockOf?.(b.id) ? `🔒 ${lockOf(b.id)}` : `${tx(b.tag, b.tagId)} · ${tx('UNLOCKED', 'TERBUKA')}`}
                  </div>

                  {/* Bow + Arrow Illustration */}
                  <div className="mt-1 transition-transform duration-200 group-hover:scale-105">
                    <BowArt id={b.id} className="h-20 w-56 sm:h-22 sm:w-64" animated={isSel} />
                  </div>
                </div>

                {/* Right Blue (!) Info Button (matching Image 1) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    audioInit();
                    snd.tap();
                    setInfoBow(infoBow?.id === b.id ? null : b);
                  }}
                  aria-label={`Info ${b.name}`}
                  title={tx(`${b.name} effect details`, `Detail efek ${b.name}`)}
                  className="ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full border-[3px] border-white bg-gradient-to-b from-[#2998ff] to-[#0f62c9] shadow-[0_3px_0_rgba(0,0,0,0.45)] transition hover:scale-110 active:scale-95 sm:h-11 sm:w-11"
                >
                  <span className="font-game text-xl leading-none text-white">!</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
