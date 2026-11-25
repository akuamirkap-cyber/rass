import { useEffect, useRef, useState } from 'react';
import { FoeShow, RagWorld } from './game/ragdoll/game';
import { audioInit, snd } from './game/ragdoll/audio';
import { CFG } from './game/ragdoll/config';
import { enemyHp, firstDragonLevel } from './game/ragdoll/formulas';
import { tx, useLang } from './i18n';

/** one page of the enemy codex. The numbers quoted here are the ones RagWorld really uses. */
export interface FoeEntry {
  id: FoeShow;
  num: number;
  icon: string;
  name: string;
  nameId: string;
  title: string;
  titleId: string;
  tag: string;
  tagId: string;
  hp: string;
  hpId: string;
  dmg: string;
  dmgId: string;
  coin: string;
  coinId: string;
  from: string;
  fromId: string;
  desc: string;
  descId: string;
  weak: string;
  weakId: string;
  tip: string;
  tipId: string;
  accent: string;
  /** false for the prisoner: he is on the list so nobody shoots him by mistake */
  enemy: boolean;
}

export const FOE_CODEX: FoeEntry[] = [
  {
    id: 'archer', num: 1, icon: '🏹',
    name: 'ARCHER', nameId: 'PEMANAH',
    title: 'BOW SOLDIER', titleId: 'PRAJURIT PANAH',
    tag: 'BASIC ENEMY · LV 1–3', tagId: 'MUSUH DASAR · LV 1–3',
    hp: 'HP 43+ (LV2 ×1.5 · LV3 ×2.1)', hpId: 'HP 43+ (LV2 ×1.5 · LV3 ×2.1)',
    dmg: 'ARROW 9+', dmgId: 'PANAH 9+',
    coin: '+5 COINS', coinId: '+5 KOIN',
    from: 'ALL LEVELS', fromId: 'SEMUA LEVEL',
    desc: 'LEVEL 1 ALWAYS HAS LV1 ENEMIES. ENEMY LEVEL NEVER EXCEEDS THE ARENA LEVEL. THE BADGE NUMBER SHOWS THEIR RANK; HIGHER RANKS HAVE MORE HP AND BETTER AIM.',
    descId: 'LEVEL 1 SELALU BERISI MUSUH LV1. LEVEL MUSUH TIDAK MELEBIHI LEVEL ARENA. ANGKA DI LENCANA MENUNJUKKAN LEVELNYA; LEVEL LEBIH TINGGI MEMILIKI HP DAN BIDIKAN LEBIH KUAT.',
    weak: 'HEAD ×2.6 · HEART (upper chest) ×1.4 · torso ×1 · arms & legs ×0.55',
    weakId: 'KEPALA ×2.6 · JANTUNG (dada atas) ×1.4 · badan ×1 · tangan & kaki ×0.55',
    tip: 'A headshot is almost always a one-hit kill. Hitting the legs makes them kneel; hitting body or head mid-draw cancels their shot.',
    tipId: 'Headshot hampir selalu sekali mati. Kena kaki membuatnya berlutut; kena badan atau kepala saat dia menarik busur membatalkan tembakannya.',
    accent: '#7fe9f2', enemy: true,
  },
  {
    id: 'helm', num: 2, icon: '⛑️',
    name: 'HELMETED ARCHER', nameId: 'PEMANAH BERHELM',
    title: 'IRON HELM SOLDIER', titleId: 'PRAJURIT HELM BESI',
    tag: 'HEAD ARMOR · LV 1–3', tagId: 'PELINDUNG KEPALA / LV 1-3',
    hp: `HP ${enemyHp(CFG.encounters.firstLevel, CFG.enemy.ranks.normal, false)}+`,
    hpId: `HP ${enemyHp(CFG.encounters.firstLevel, CFG.enemy.ranks.normal, false)}+`,
    dmg: 'ARROW 9+', dmgId: 'PANAH 9+',
    coin: '+7 COINS', coinId: '+7 KOIN',
    from: 'ALL LEVELS', fromId: 'SEMUA LEVEL',
    desc: 'Veteran archer wearing an iron helm. The first headshot only deals 30% damage and knocks the helmet off — after that, his head is just as fragile as a regular archer.',
    descId: 'Pemanah veteran berhelm besi. Headshot pertama hanya memberi 30% damage dan melemparkan helmnya — setelah itu kepalanya sama rapuhnya dengan pemanah biasa.',
    weak: 'HEART ×1.4 while helmeted · HEAD ×2.6 once helmet falls off',
    weakId: 'JANTUNG ×1.4 selagi berhelm · KEPALA ×2.6 setelah helm lepas',
    tip: 'Two options: shoot his head twice (pop the helm, then headshot), or ignore the helm and aim for the upper chest. MAX POWER arrows pierce straight through the helmet.',
    tipId: 'Dua pilihan: tembak kepalanya dua kali (helm lepas, lalu headshot), atau abaikan helmnya dan incar dada atas. Panah MAX POWER menembus helm.',
    accent: '#cfe3ea', enemy: true,
  },
  {
    id: 'heavy', num: 3, icon: '👹',
    name: 'GIANT ARCHER', nameId: 'PEMANAH RAKSASA',
    title: 'RED-EYED ELITE', titleId: 'ELIT MATA MERAH',
    tag: 'ELITE · LV 3+', tagId: 'ELIT · LV 3+',
    hp: 'HP 111+ (VERY TANKY)', hpId: 'HP 111+ (SANGAT TEBAL)',
    dmg: 'ARROW 13+ · RAPID SHOT', dmgId: 'PANAH 13+ · TEMBAK CEPAT',
    coin: '+12 COINS', coinId: '+12 KOIN',
    from: 'FROM LEVEL 3', fromId: 'MULAI LEVEL 3',
    desc: 'Larger than standard troops, glowing red eyes, and the thickest HP pool among non-boss foes. Draws his bow fastest, fires with short cooldowns, and rarely misses. At higher levels he can loose two arrows at once.',
    descId: 'Lebih besar dari prajurit biasa, bermata merah, nyawanya paling tebal di antara musuh non-bos. Menarik busur paling cepat, jeda antar tembakannya pendek, bidikannya nyaris tidak meleset. Di level tinggi kadang melepas dua panah sekaligus.',
    weak: 'HEAD ×2.6 (often helmeted) · HEART ×1.4',
    weakId: 'KEPALA ×2.6 (sering berhelm) · JANTUNG ×1.4',
    tip: 'Make him top priority. Any hit to his body or head while drawing cancels his shot — keep interrupting him. Fire and poison arrows chew through his huge HP.',
    tipId: 'Jadikan prioritas. Setiap panah ke badan atau kepalanya saat dia menarik busur membatalkan tembakan — terus ganggu dia. Panah api dan racun menggerogoti nyawa tebalnya.',
    accent: '#ff6b5e', enemy: true,
  },
  {
    id: 'shield', num: 4, icon: '🛡️',
    name: 'SHIELD KNIGHT', nameId: 'KSATRIA TAMENG',
    title: 'TOWER SHIELD GUARD', titleId: 'PENJAGA PERISAI',
    tag: 'FULL SHIELD · LV 1–3', tagId: 'PERISAI PENUH / LV 1-3',
    hp: `HP ${enemyHp(CFG.encounters.firstLevel, CFG.enemy.ranks.normal, false)}+ / SHIELD BLOCKS 3–5 ARROWS`,
    hpId: `HP ${enemyHp(CFG.encounters.firstLevel, CFG.enemy.ranks.normal, false)}+ / PERISAI TAHAN 3-5 PANAH`,
    dmg: 'ARROW 9+', dmgId: 'PANAH 9+',
    coin: '+10 COINS (+3 SHIELD BREAK)', coinId: '+10 KOIN (+3 PERISAI HANCUR)',
    from: 'ALL LEVELS', fromId: 'SEMUA LEVEL',
    desc: 'Holds a massive shield covering him from thighs to eyes; blocked arrows stick into the shield. He has to sling the shield onto his back whenever he shoots, kneels, or gets shocked.',
    descId: 'Memasang kuda-kuda di balik perisai besar yang menutup badannya dari paha sampai mata; panah yang kena perisai menancap di situ. Dia harus menyandang perisai ke punggung setiap kali memanah, berlutut, atau tersetrum.',
    weak: 'LEGS below the shield → kneels & stays open ~2.4s · TOP OF HEAD peeking above',
    weakId: 'KAKI di bawah perisai → berlutut & terbuka ±2,4 detik · PUNCAK KEPALA yang mengintip',
    tip: 'Shoot his legs, then blast his chest or head. Or wait until he draws his bow, lob a high arc over the shield, or shatter it (Fire deals 2× shield damage; MAX POWER breaks it outright).',
    tipId: 'Panah kakinya, lalu hajar dada atau kepala. Bisa juga: tunggu dia memanah, lambungkan panah dari atas, atau hancurkan perisainya (panah api merusak 2×, MAX POWER langsung memecahkannya).',
    accent: '#9fd8ff', enemy: true,
  },
  {
    id: 'bat', num: 5, icon: '🦇',
    name: 'BAT', nameId: 'KELELAWAR',
    title: 'AERIAL NUISANCE', titleId: 'PENGGANGGU UDARA',
    tag: 'BOBBING FLIGHT', tagId: 'TERBANG NAIK-TURUN',
    hp: 'HP 19+ (ONE STRONG ARROW)', hpId: 'HP 19+ (SATU PANAH KUAT)',
    dmg: 'BITE 5+', dmgId: 'GIGITAN 5+',
    coin: '+5 COINS', coinId: '+5 KOIN',
    from: '1–4 BATS PER LEVEL', fromId: '1–4 EKOR TIAP LEVEL',
    desc: 'Flutters up and down in the lane between you and the enemies — blocking your shots. Every so often it pauses, shudders with red eyes ("WATCH OUT, BITE!"), dives at your head, bites, and flies back. Counts toward level clear.',
    descId: 'Terbang naik-turun di jalur antara kamu dan musuh — ikut menghalangi tembakanmu. Sesekali berhenti, bergetar dengan mata merah (“AWAS GIGITAN!”), lalu menukik ke kepalamu, menggigit, dan kembali ke jalurnya. Dihitung sebagai musuh level.',
    weak: 'ENTIRE BODY — easiest when it pauses to shudder or dives straight toward you',
    weakId: 'SELURUH BADAN — paling mudah saat dia berhenti bergetar atau menukik lurus ke arahmu',
    tip: 'Lead your aim slightly ahead of its path. When it dives, just shoot straight ahead. MAX POWER arrows pierce straight through and keep flying.',
    tipId: 'Bidik sedikit di depan arah geraknya. Saat dia menukik, cukup tembak lurus ke depan. Panah MAX POWER menembusnya dan terus melaju.',
    accent: '#c99bff', enemy: true,
  },
  {
    id: 'vampire', num: 6, icon: '🧛',
    name: 'VAMPIRE BAT', nameId: 'KELELAWAR VAMPIR',
    title: 'BLOOD-RED WINGS', titleId: 'SAYAP MERAH DARAH',
    tag: 'GIANT BAT', tagId: 'KELELAWAR BESAR',
    hp: 'HP 67+ (2–3 ARROWS)', hpId: 'HP 67+ (2–3 PANAH)',
    dmg: 'BITE 10+', dmgId: 'GIGITAN 10+',
    coin: '+9 COINS', coinId: '+9 KOIN',
    from: 'FROM LEVEL 4', fromId: 'MULAI LEVEL 4',
    desc: 'Huge bat with blood-red wings and crimson eyes. Has 2.4× the HP and 1.5× the bite damage of a normal bat. If hit without dying, it recoils, screeches, and returns to its patrol.',
    descId: 'Kelelawar besar bersayap merah darah dan bermata merah. Nyawanya 2,4× dan gigitannya 1,5× kelelawar biasa. Kalau kena panah tapi belum mati dia terpental, menjerit, lalu kembali ke jalurnya.',
    weak: 'ENTIRE BODY — larger hitbox makes it easier to tag',
    weakId: 'SELURUH BADAN — badannya lebih besar, lebih mudah dikenai',
    tip: 'Hit it twice in quick succession before it can dive again. Draw your bow fully for maximum damage.',
    tipId: 'Tembak dua kali berturut-turut sebelum dia sempat menukik lagi. Tarik busur penuh supaya damage maksimal.',
    accent: '#ff5a6e', enemy: true,
  },
  {
    id: 'hostage', num: 7, icon: '⛓️',
    name: 'HOSTAGE', nameId: 'TAWANAN',
    title: 'NOT AN ENEMY — RESCUE HIM', titleId: 'BUKAN MUSUH — SELAMATKAN',
    tag: 'DO NOT SHOOT', tagId: 'JANGAN DITEMBAK',
    hp: 'DOES NOT ATTACK', hpId: 'TIDAK MENYERANG',
    dmg: 'HIT HIM: −10 COINS', dmgId: 'KENA ORANGNYA: −10 KOIN',
    coin: 'RESCUED: +15 COINS & +20 HP', coinId: 'BEBAS: +15 KOIN & +20 NYAWA',
    from: 'LEVEL 3, 7, 11, …', fromId: 'LEVEL 3, 7, 11, …',
    desc: 'Blue-headband stickman tied by rope to an overhead peg. The level cannot finish until he is freed. Cut the rope with an arrow — never hit the prisoner himself.',
    descId: 'Stickman berikat kepala biru yang diikat tali ke pasak di atasnya. Level belum selesai sebelum dia bebas. Putuskan talinya dengan panah — jangan sampai kena orangnya.',
    weak: 'ROPE above his head (pulsing yellow ring)',
    weakId: 'TALI di atas kepalanya (lingkaran kuning yang berdenyut)',
    tip: 'Free him first for +20 HP before the fight heats up. Hitting his body breaks your combo.',
    tipId: 'Bebaskan lebih dulu supaya dapat +20 nyawa sebelum pertarungan memanas. Kena badannya memutus combo.',
    accent: '#7dffa0', enemy: false,
  },
  {
    id: 'fort', num: 8, icon: '🏰',
    name: 'IRONCLAD OAK FORT', nameId: 'ISTANA KAYU KOKOH',
    title: 'IRON-PLATED OAK CITADEL', titleId: 'BENTENG KAYU EK LAPIS BESI',
    tag: 'AIM FOR WEAK JOINTS · LV 2, 5, 8', tagId: 'INCAR TITIK LEMAH · LV 2, 5, 8',
    hp: 'IRON WALL 285+ · WEAK PEGS 88–128+', hpId: 'DINDING BESI 285+ · PASAK LEMAH 88–128+',
    dmg: 'WALLS BLOCK 80% NORMAL ARROWS', dmgId: 'DINDING KEBAL 80% PANAH BIASA',
    coin: 'COLLAPSE: +20 COINS', coinId: 'ROBOH: +20 KOIN',
    from: 'LEVEL 2, 5, 8, …', fromId: 'LEVEL 2, 5, 8, …',
    desc: 'Two-story oak fortress reinforced with wrought-iron plates, stone foundations, torchlit halls, and battlement merlons. Straight shots into iron plates only throw sparks — target its exposed wooden joints!',
    descId: 'Istana benteng kayu ek dua lantai berlapis pelat besi tempa dengan fondasi batu, aula berobor, dan menara merlon. Tembakan lurus ke dinding besi hanya memercikkan bunga api — incar sambungan kayu terbukanya!',
    weak: 'BOTTOM FOUNDATION PEG (collapses the whole fort) · UPPER ROOF JOINT (drops the roof onto the top guard)',
    weakId: 'PASAK PONDASI BAWAH (meruntuhkan seluruh istana) · SENDI ATAP ATAS (menjatuhkan atap ke penjaga atas)',
    tip: 'Aim slightly low at the golden wood peg at the front wall base to bring down both stories at once, or lob an arrow into the roof joint! Fire arrows burn wooden joints fast.',
    tipId: 'Bidik agak rendah ke pasak kayu keemasan di kaki dinding depan untuk merobohkan dua lantai sekaligus, atau lambungkan panah ke sendi atap! Panah api sangat efektif membakar sendi kayu.',
    accent: '#ffd23f', enemy: true,
  },
  {
    id: 'fort', num: 9, icon: '💂',
    name: 'FORT GUARD', nameId: 'PENJAGA ISTANA',
    title: 'TIMBER FORT GARRISON', titleId: 'GARNISUN BENTENG KAYU',
    tag: 'SHELTERED BEHIND IRON · LV 2–3', tagId: 'BERLINDUNG DI BALIK BESI · LV 2–3',
    hp: 'HP 52+', hpId: 'HP 52+',
    dmg: 'ARROW 9+ (VIA IRON SLITS)', dmgId: 'PANAH 9+ (LEWAT CELAH BESI)',
    coin: '+8 COINS', coinId: '+8 KOIN',
    from: 'TWO PER FORTRESS', fromId: 'DUA ORANG TIAP ISTANA',
    desc: 'Garrison archers stationed behind steel wall shields on each floor of the fort. They shoot through narrow armored slits, so straight shots toward their chest or head bounce off the wall.',
    descId: 'Pemanah garnisun yang berjaga di balik perisai dinding besi tiap lantai istana. Mereka memanah lewat celah sempit berlapis baja sehingga panah lurus ke dada atau kepala mereka ditahan dinding kokoh.',
    weak: 'BREAK THE FOUNDATION PEG or ROOF JOINT to collapse the floors and crush them',
    weakId: 'PATAHKAN PASAK PONDASI atau SENDI ATAP untuk menjatuhkan lantai & menimpa mereka',
    tip: 'Stop wasting arrows on the iron plates in front of their chests! Smash the lower foundation peg so the upper guard falls and the lower guard gets crushed by the roof.',
    tipId: 'Jangan buang panah ke pelat besi di depan dada mereka! Hancurkan pasak pondasi bawah agar penjaga atas jatuh dan penjaga bawah tertimpa reruntuhan atap istana.',
    accent: '#ffb02e', enemy: true,
  },
  {
    id: 'dragon', num: 10, icon: '🐉',
    name: 'RED DRAGON', nameId: 'NAGA MERAH',
    title: 'DRAGON BOSS & RIDER', titleId: 'BOS NAGA & PENUNGGANGNYA',
    tag: 'FLYING BOSS · FIREBALL BREATH', tagId: 'BOS TERBANG · SEMBURAN BOLA API',
    hp: 'HP SCALES WITH BOSS LEVEL', hpId: 'HP MENGIKUTI LEVEL BOS',
    dmg: 'FIREBALLS & RIDER ARROWS', dmgId: 'BOLA API DAN PANAH PENUNGGANG',
    coin: `+${CFG.rewards.bigBoss} COINS (+${CFG.rewards.dragonKill} DRAGON SLAIN)`,
    coinId: `+${CFG.rewards.bigBoss} KOIN (+${CFG.rewards.dragonKill} NAGA TUMBANG)`,
    from: `LEVEL ${firstDragonLevel()}, ${firstDragonLevel() * 2}, ${firstDragonLevel() * 3}, ...`,
    fromId: `LEVEL ${firstDragonLevel()}, ${firstDragonLevel() * 2}, ${firstDragonLevel() * 3}, ...`,
    desc: 'Crimson dragon ridden by a silver-haired archer. The rider snipes you from dragonback while the wyrm breathes fireballs. Win by knocking off the rider (the dragon flees) or slaying the dragon (the rider falls too).',
    descId: 'Naga merah yang ditunggangi pemanah berambut perak. Penunggangnya memanahmu dari punggung naga; naganya menyembur bola api. Menang dengan menjatuhkan penunggangnya (naga kabur) atau menumbangkan naganya (penunggang ikut jatuh).',
    weak: 'MOUTH while inhaling (glowing throat) → detonates fire inside its mouth for ~⅓ dragon HP & stagger · HEAD ×1.6',
    weakId: 'MULUT saat menghirup napas (tenggorokan menyala) → api meledak di mulutnya: ±⅓ nyawa naga & terhuyung · KEPALA ×1.6',
    tip: 'Fireballs can be shot mid-air (+5 coins). Wing hits cancel its breath and drop altitude. The dragon body shields the rider from below — lob high-arc shots from above.',
    tipId: 'Bola api bisa dipanah di udara (+5 koin). Kena sayap membatalkan semburan dan membuatnya turun. Badan naga melindungi penunggang dari bawah — lambungkan panah dari atas.',
    accent: '#ff5a4f', enemy: true,
  },
];

interface Props {
  onClose: () => void;
  /** switch to the other half of the codex: the five bosses */
  onBosses: () => void;
  /** leave the codex and face the fort or the dragon in a level right away */
  onFight?: (kind: 'fort' | 'dragon') => void;
}

/**
 * The enemy codex. Its stage is a real RagWorld in "showcase" mode: the same archer who fights on the title screen
 * takes on one kind of enemy at a time, so what is shown here is exactly how each of them behaves in a level.
 */
export default function EnemyCodexModal({ onClose, onBosses, onFight }: Props) {
  useLang();
  const [selectedNum, setSelectedNum] = useState<number>(FOE_CODEX[0].num);
  const selected = FOE_CODEX.find((f) => f.num === selectedNum) ?? FOE_CODEX[0];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<RagWorld | null>(null);
  const kindRef = useRef<FoeShow>(FOE_CODEX[0].id);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const world = new RagWorld(() => {}, (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    }, true);
    worldRef.current = world;
    let lw = 0; let lh = 0;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(160, Math.round(r.width)); const h = Math.max(120, Math.round(r.height));
      if (w === lw && h === lh) return;
      lw = w; lh = h;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      world.resize(w, h, dpr);
      world.showcase(kindRef.current); // the stage is laid out for this size: set it again
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(canvas);
    window.addEventListener('resize', fit);
    let raf = 0; let prev = 0;
    const loop = (now: number) => {
      const dt = prev ? (now - prev) / 1000 : 0.016;
      prev = now;
      world.update(dt);
      world.render(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', fit);
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (f: FoeEntry) => {
    audioInit(); snd.tap();
    kindRef.current = f.id;
    setSelectedNum(f.num);
    worldRef.current?.showcase(f.id);
  };
  const shoot = () => { audioInit(); worldRef.current?.previewShot(); };
  const again = () => { audioInit(); snd.tap(); worldRef.current?.showcase(selected.id); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm select-none sm:p-5">
      <div className="g-pop flex h-full max-h-[700px] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border-4 border-[#041e2b] bg-[#0b2536] shadow-[0_24px_60px_rgba(0,0,0,0.75)] md:flex-row">
        {/* ============ left / top: the live stage and what it shows ============ */}
        <div className="relative flex min-h-0 flex-1 flex-col bg-[#071624]">
          <div className="z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-[#05121d]/90 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="font-game grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm text-[#041824]" style={{ backgroundColor: selected.accent }}>
                #{selected.num}
              </span>
              <div className="min-w-0">
                <h2 className="font-game truncate text-lg leading-none text-white sm:text-2xl">{selected.icon} {tx(selected.name, selected.nameId)}</h2>
                <div className="mt-0.5 truncate text-xs font-black tracking-wider uppercase" style={{ color: selected.accent }}>
                  {tx(selected.title, selected.titleId)} · {tx(selected.tag, selected.tagId)}
                </div>
              </div>
            </div>
            <button
              onClick={() => { audioInit(); snd.tap(); onClose(); }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-[#09090d] bg-gradient-to-br from-[#ff3b30] to-[#a80c07] text-white shadow-[0_3px_0_#09090d] transition hover:brightness-110 active:translate-y-0.5"
              aria-label={tx('Close Enemy Codex', 'Tutup Kamus Musuh')}
            >
              <span className="font-game text-xl">X</span>
            </button>
          </div>

          <div className="relative min-h-[170px] flex-1">
            <canvas ref={canvasRef} onClick={shoot} className="absolute inset-0 h-full w-full cursor-pointer" />
            <div className="pointer-events-none absolute left-3 top-2.5 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-cyan-200 ring-1 ring-white/15">
              🎬 {tx('Live simulation · click stage to shoot', 'Simulasi langsung · klik panggung untuk menembak')}
            </div>
            {!selected.enemy && (
              <div className="pointer-events-none absolute right-3 top-2.5 rounded-full bg-[#1f8a3a]/90 px-3 py-1 text-xs font-black text-white ring-1 ring-white/25">
                {tx('NOT AN ENEMY', 'BUKAN MUSUH')}
              </div>
            )}
          </div>

          <div className="z-10 max-h-[46%] overflow-y-auto border-t border-white/10 bg-[#081d2c] p-3.5 sm:p-4 md:max-h-none">
            <div className="flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-amber-300">{tx(selected.hp, selected.hpId)}</span>
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-cyan-300">{tx(selected.dmg, selected.dmgId)}</span>
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[#ffd23f]">{tx(selected.coin, selected.coinId)}</span>
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-emerald-300">{tx(`APPEARS: ${selected.from}`, `MUNCUL: ${selected.fromId}`)}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/85">{tx(selected.desc, selected.descId)}</p>
            <p className="mt-1.5 text-xs font-bold" style={{ color: selected.accent }}>
              🎯 {selected.enemy ? tx('Weak point', 'Titik lemah') : tx('Target', 'Sasaran')}: {tx(selected.weak, selected.weakId)}
            </p>
            <p className="mt-1 text-xs font-bold text-[#ffe27a]">★ {tx('Tips', 'Tips')}: {tx(selected.tip, selected.tipId)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={shoot}
                className="font-game rounded-xl border-2 border-[#031a24] bg-gradient-to-b from-[#2998ff] to-[#0f62c9] px-3.5 py-2 text-xs text-white shadow-[0_3px_0_#031a24] transition hover:brightness-110 active:translate-y-0.5 sm:text-sm"
              >
                🏹 {tx('SHOOT NOW', 'TEMBAK SEKARANG')}
              </button>
              <button
                onClick={again}
                className="font-game rounded-xl border-2 border-[#031a24] bg-[#163c52] px-3 py-2 text-xs text-white/85 transition hover:bg-[#1f506b] active:translate-y-0.5"
              >
                🔄 {tx('REPLAY', 'ULANGI')}
              </button>
              {onFight && (selected.id === 'fort' || selected.id === 'dragon') && (
                <button
                  onClick={() => { audioInit(); snd.boss(); onFight(selected.id === 'fort' ? 'fort' : 'dragon'); }}
                  className="font-game ml-auto rounded-xl border-2 border-[#031a24] bg-gradient-to-b from-[#ff5a4f] to-[#c91c14] px-4 py-2 text-xs text-white shadow-[0_3px_0_#031a24] transition hover:brightness-110 active:translate-y-0.5 sm:text-sm"
                >
                  ⚔️ {tx('FIGHT NOW!', 'LAWAN SEKARANG!')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ============ right / bottom: every kind of enemy ============ */}
        <div className="flex h-[36%] w-full flex-col border-t-4 border-[#041e2b] bg-[#0e2d42] md:h-full md:w-[355px] md:border-l-4 md:border-t-0">
          <div className="flex gap-1.5 border-b border-white/10 bg-[#061826] p-2">
            <span className="font-game flex-1 rounded-xl border-2 border-[#ffd93b] bg-[#16425e] px-2 py-1.5 text-center text-xs text-[#ffd93b]">
              👹 {tx('ALL ENEMIES', 'SEMUA MUSUH')}
            </span>
            <button
              onClick={() => { audioInit(); snd.tap(); onBosses(); }}
              className="font-game flex-1 rounded-xl border-2 border-[#051b29] bg-[#092030] px-2 py-1.5 text-xs text-white/75 transition hover:bg-[#11354d] active:translate-y-0.5"
            >
              👑 {tx('5 BOSSES', '5 BOS')}
            </button>
          </div>
          <div className="border-b border-white/10 bg-[#092030] px-4 py-2.5">
            <div className="font-game text-lg tracking-wide text-[#ffd23f]">📖 {tx('ALL ENEMIES CODEX', 'KAMUS SEMUA MUSUH')}</div>
            <div className="text-xs font-bold text-white/80">{tx('Learn every enemy weak point before battle!', 'Kenali titik lemah tiap musuh sebelum bertarung!')}</div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {FOE_CODEX.map((f) => {
              const isSel = selected.num === f.num;
              return (
                <button
                  key={f.num}
                  onClick={() => pick(f)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 p-2.5 text-left transition active:scale-[0.98] ${
                    isSel ? 'border-[#ffd93b] bg-[#16425e] shadow-[0_0_16px_rgba(255,217,59,0.3)]' : 'border-[#051b29] bg-[#092030]/80 hover:bg-[#11354d]'
                  }`}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-black/40 bg-[#071624] text-2xl shadow">{f.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-game truncate text-sm text-white sm:text-base">#{f.num} {tx(f.name, f.nameId)}</div>
                    <div className="truncate text-xs font-black uppercase" style={{ color: f.accent }}>{tx(f.tag, f.tagId)}</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-white/75">{tx(f.hp, f.hpId)} · {tx(f.from, f.fromId)}</div>
                  </div>
                  {isSel && <span className="font-game text-xs text-[#ffd93b]">▶</span>}
                </button>
              );
            })}
            <button
              onClick={() => { audioInit(); snd.tap(); onBosses(); }}
              className="flex w-full items-center gap-3 rounded-2xl border-2 border-[#5a1a16] bg-[#3a1210]/80 p-2.5 text-left transition hover:bg-[#51201c] active:scale-[0.98]"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-black/40 bg-[#071624] text-2xl shadow">👑</div>
              <div className="min-w-0 flex-1">
                <div className="font-game truncate text-sm text-white sm:text-base">#11–15 {tx('FIVE BOSSES', 'LIMA BOS')}</div>
                <div className="truncate text-xs font-black uppercase text-[#ff8a80]">{tx('AXE · TRIDENT · SWORD · SCYTHE · MACE', 'KAPAK · TRISULA · PEDANG · SABIT · GADA')}</div>
                <div className="mt-0.5 truncate text-xs font-semibold text-white/75">{tx('Open the boss & signature weapon codex →', 'Buka kamus bos & senjata khasnya →')}</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
