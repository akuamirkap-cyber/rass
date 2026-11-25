import { ReactNode, useEffect, useRef, useState } from 'react';
import { Game, LEVELS, Ui } from './game/engine';
import { Duel, DuelUi } from './game/duel';
import { STORY_CHAPTERS, Story, StoryMode, StoryUi, WAR_CHAPTERS_N } from './game/story';
import { setMuted } from './game/sfx';
import RagdollArcher from './RagdollArcher';
import { tx, useLang } from './i18n';
import LangToggle from './LangToggle';

type Mode = 'menu' | 'levels' | 'misi' | 'duel' | 'story' | 'perang' | 'ragdoll';

const HINTS: Record<Ui['stage'], [string, string]> = {
  idle: ['Click / tap anywhere to pick up the bow', 'Klik / tap di mana saja untuk mengambil busur'],
  busy: ['Nocking arrow…', 'Menyiapkan anak panah…'],
  ready: ['Press, drag back to aim, then release to shoot', 'Tekan, tarik ke belakang untuk membidik, lalu lepas untuk menembak'],
  aiming: ['Pull farther back for more power — release to fire!', 'Makin jauh ditarik makin kencang — lepas untuk menembak!'],
  flying: ['', ''],
  win: ['', ''],
  lose: ['', ''],
  out: ['', ''],
};

/** what the "lost" card says, depending on what ended the round */
const FAIL: Record<string, [enTitle: string, enBody: string, idTitle: string, idBody: string]> = {
  man: [
    'Oops, you hit the man!',
    'Aim for the apple, not him. Watch the trajectory arc while aiming.',
    'Waduh, kena orangnya!',
    'Sasarannya apel, bukan orangnya. Perhatikan garis lintasan saat membidik.',
  ],
  plate: [
    'Hit by a plate!',
    'Smash the plates before they reach you. Closer plates are easier to hit, but riskier.',
    'Kena piring!',
    'Pecahkan piringnya sebelum sampai ke kamu. Makin dekat makin mudah dibidik, tapi makin berbahaya.',
  ],
  shot: [
    'He was faster!',
    'Hit him before the red bar above his head fills up.',
    'Dia lebih cepat!',
    'Kenai dia sebelum garis merah di atas kepalanya penuh.',
  ],
  duck: [
    'Hit a duck!',
    'The duck is fine, just startled. Wait for a gap between them, or lob your arrow over.',
    'Kena bebek!',
    'Bebeknya tidak apa-apa, cuma kaget. Tunggu celah di antara mereka, atau lambungkan panah di atasnya.',
  ],
  fly: [
    'Mr. Bejo floated into the sky!',
    'Pop his balloon to bring him down — or shoot the apple fast.',
    'Pak Bejo terbang ke langit!',
    'Letuskan balonnya supaya dia turun — atau panah apelnya lebih cepat.',
  ],
  ufo: [
    'The apple was abducted!',
    'Shoot the apple while it is hovering inside the tractor beam.',
    'Apelnya diculik alien!',
    'Panah apelnya selagi masih melayang di dalam sinar.',
  ],
  boss: [
    'Charged by King Apple!',
    'Shoot as fast as possible: every arrow knocks him back. You can step back too.',
    'Diseruduk Raja Apel!',
    'Tembak secepat mungkin: setiap panah mendorongnya mundur. Kamu juga boleh mundur.',
  ],
  time: [
    'Time is up!',
    'Be quicker! Line up your next shot while the next target is appearing.',
    'Waktu habis!',
    'Lebih cepat lagi! Siapkan bidikan selagi sasaran berikutnya muncul.',
  ],
  self: [
    'Hit by your own arrow!',
    'Arrows entering the orange portal exit from the blue portal straight toward you.',
    'Kena panah sendiri!',
    'Panah yang masuk portal oranye keluar lagi dari portal biru, ke arahmu.',
  ],
  drop: [
    'The ball dropped!',
    'Shoot the ball again before it hits the ground. Aim slightly beneath it as it falls.',
    'Bolanya jatuh!',
    'Panah bolanya lagi sebelum menyentuh tanah. Bidik sedikit di bawah bola yang sedang turun.',
  ],
  clash: [
    'Collision!',
    'Your arrow hit an arrow already stuck in the wheel. Wait for an empty gap to pass in front.',
    'Tabrakan!',
    'Panahmu mengenai panah yang sudah menancap. Tunggu celah kosong di roda lewat di depanmu.',
  ],
  mob: [
    'Swarmed by mini apples!',
    'Prioritize the closest ones, and aim low — they are tiny and bouncy.',
    'Diserbu apel mini!',
    'Dahulukan yang paling dekat, dan bidik rendah — mereka kecil dan melompat-lompat.',
  ],
  bite: [
    'Bitten by a zombie!',
    'Aim for vital spots (HEAD or glowing HEART in the chest). Shoot their legs to cripple and slow them down!',
    'Digigit zombie!',
    'Bidik titik vital (KEPALA atau JANTUNG yang menyala di dada). Panah kaki untuk membuatnya pincang dan melambat!',
  ],
  curse: [
    'Hit by a curse orb!',
    'Shoot the Zombie King’s curse orbs mid-air to shatter them, or move forward/back to dodge!',
    'Kena bola kutukan!',
    'Panah bola kutukan Raja Zombie di udara supaya pecah, atau maju/mundur untuk menghindar!',
  ],
  wrong: [
    'Wrong target!',
    'Wrong order or choice. Look closely before releasing your arrow.',
    'Salah!',
    'Urutan atau pilihannya keliru. Perhatikan baik-baik sebelum melepas panah.',
  ],
  bust: [
    'Overshot!',
    'The score must equal exactly 20. Check which ring you still need first.',
    'Kelebihan!',
    'Skornya harus tepat 20. Hitung dulu ring mana yang masih kamu butuhkan.',
  ],
  bomb: [
    'Fatal blast!',
    'Watch out for cannons, rockets, or bomb explosions! You can shoot cannonballs and rockets out of the air.',
    'Ledakan fatal!',
    'Hati-hati dengan meriam/roket atau ledakan bom! Kamu bisa memanah peluru meriam/roket di udara.',
  ],
  red: [
    'Spotted by the doll laser!',
    'Do not release an arrow or move while the red light is on!',
    'Terdeteksi laser boneka!',
    'Jangan melepas panah atau bergerak saat lampu merah menyala!',
  ],
  burn: [
    'Arrow burned up!',
    'Your arrow touched the flaming rope. Shoot while the rope is below Mr. Bejo’s feet or high above his head.',
    'Panahnya gosong!',
    'Panahmu menyentuh tali api. Lepas panah saat tali sedang di bawah kaki Pak Bejo atau jauh di atas kepalanya.',
  ],
  dragon: [
    'The dragon is furious!',
    'Do not hit the lion-dragon head. The apple is on the TAIL — aim at the tip of the tail as it sweeps past.',
    'Naganya marah!',
    'Jangan kena kepala barongsai. Apelnya ada di BUNTUT — bidik ujung ekor saat naga melintas.',
  ],
  bubble: [
    'Hit by a crab bubble!',
    'Pop the bubbles drifting toward you with an arrow, then shoot back at its eyes.',
    'Kena gelembung kepiting!',
    'Pecahkan gelembung yang meluncur ke arahmu dengan panah, lalu balas tembak matanya.',
  ],
  chicken: [
    'Hit the chicken!',
    'Bawk! The chicken is just startled. Aim for the falling egg, not the chicken.',
    'Kena ayamnya!',
    'Petok! Ayamnya cuma kaget. Bidik telurnya yang sedang jatuh, bukan si ayam.',
  ],
  cat: [
    'Apple stolen by the cat!',
    'The orange cat freezes whenever you aim. Draw quickly and shoot the apple before he reaches it.',
    'Apelnya dicuri kucing!',
    'Kucing oren berhenti tiap kamu membidik. Tarik busur cepat dan tembak apelnya sebelum dia sampai.',
  ],
  catHit: [
    'Poor kitty!',
    'Do not shoot the cat — he is just hungry. Only shoot Mr. Bejo’s apple.',
    'Kasihan kucingnya!',
    'Jangan panah kucingnya — dia cuma lapar. Panah apel Pak Bejo saja.',
  ],
  duck2: [
    'Rammed by the giant duck!',
    'Shoot the apple before the duck reaches you. Hitting the duck only makes it charge faster.',
    'Ditabrak bebek raksasa!',
    'Tembak apelnya sebelum bebeknya sampai. Mengenai bebek malah membuatnya makin ngebut.',
  ],
};

interface Section { title: string; titleId: string; from: number; to: number; color: string; note: string; noteId: string }
const SECTIONS: Section[] = [
  { title: 'BASICS', titleId: 'DASAR', from: 1, to: 16, color: 'text-neutral-500', note: 'learn draw, aim, release', noteId: 'belajar tarik, bidik, lepas' },
  { title: 'LABORATORY', titleId: 'LABORATORIUM', from: 17, to: 30, color: 'text-violet-600', note: 'gravity, portals, magnets', noteId: 'gravitasi, portal, magnet' },
  { title: 'MINIGAMES', titleId: 'MINIGAME', from: 31, to: 44, color: 'text-amber-600', note: 'special-rule challenges', noteId: 'permainan kecil beraturan khusus' },
  { title: 'NEW & FRESH', titleId: 'BARU & SEGAR', from: 45, to: 60, color: 'text-blue-600', note: 'time vault, circus cannon, dragon dance…', noteId: 'brankas waktu, meriam sirkus, naga barongsai…' },
  { title: 'SPECIAL & ZOMBIES', titleId: 'SPESIAL & ZOMBIE', from: 61, to: 74, color: 'text-red-500', note: 'shapeshifting archers, ragdoll zombies', noteId: 'pemanah berubah wujud, zombie ragdoll' },
  { title: 'ABSURD', titleId: 'ABSURD', from: 75, to: 84, color: 'text-pink-600', note: 'golden hen, rocket fart, raining Mr. Bejo', noteId: 'ayam emas, kentut roket, hujan Pak Bejo' },
];

const STORE = 'perfectshot.cleared';
const blankUi = (level: number): Ui => ({
  stage: 'idle', level, arrows: LEVELS[level].arrows, total: LEVELS[level].arrows, shots: 0, stars: 3, canMove: false,
  why: '', goals: [],
});
const blankDuel: DuelUi = { stage: 'intro', you: 0, bot: 0, time: 60, result: null };
const blankStory = (mode: StoryMode): StoryUi => ({ stage: 'intro', chapter: 1, chapters: mode === 'war' ? WAR_CHAPTERS_N : STORY_CHAPTERS, hp: 100, maxHp: 100, kills: 0, left: 1, score: 0, best: 0, title: '', mode });

function loadCleared(): number[] {
  try {
    const arr: unknown = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(arr) ? arr.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < LEVELS.length) : [];
  } catch {
    return [];
  }
}

function Levels({ cleared, onLevel, onBack }: { cleared: number[]; onLevel: (i: number) => void; onBack: () => void }) {
  useLang();
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-white text-neutral-900">
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
        <div className="menu-in">
          <div className="flex items-center justify-between gap-3">
            <button onClick={onBack} className="rounded-lg bg-neutral-100 px-3 py-1.5 text-[11px] font-black tracking-[0.14em] text-neutral-600 hover:bg-neutral-200">← MENU</button>
            <div className="flex items-center gap-3">
              <div className="text-sm font-bold text-neutral-400">{cleared.length}/{LEVELS.length} {tx('cleared', 'selesai')}</div>
              <LangToggle compact />
            </div>
          </div>
          <h2 className="mt-5 text-4xl font-black lowercase tracking-tight">{tx('select level', 'pilih level')}<span className="text-red-500">.</span></h2>
          <p className="mt-1 text-sm font-medium text-neutral-400">{tx(`All ${LEVELS.length} levels can be played anytime.`, `Semua ${LEVELS.length} level bisa dimainkan kapan saja.`)}</p>
          {SECTIONS.map((s) => (
            <section key={s.title} className="mt-8">
              <div className="flex items-baseline justify-between">
                <div className={`text-[11px] font-black tracking-[0.22em] ${s.color}`}>{tx(s.title, s.titleId)} · {s.from}–{s.to}</div>
                <div className="text-xs font-medium text-neutral-400">{tx(s.note, s.noteId)}</div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3">
                {LEVELS.slice(s.from - 1, s.to).map((l) => {
                  const i = l.id - 1;
                  const done = cleared.includes(i);
                  return (
                    <button
                      key={l.id}
                      onClick={() => onLevel(i)}
                      title={tx(l.brief, l.briefId ?? l.brief)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition active:scale-95 ${
                        done ? 'bg-neutral-900 text-white hover:bg-red-500' : 'bg-neutral-100 text-neutral-900 ring-1 ring-inset ring-neutral-200 hover:bg-red-50 hover:text-red-600'
                      }`}
                    >
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${done ? 'bg-white/20 text-white' : 'bg-neutral-900 text-white'}`}>{l.id}</span>
                      <span className="truncate">{tx(l.name, l.nameId ?? l.name)}</span>
                      {done && <span className="ml-auto text-green-400">✓</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArrowIcon({ used }: { used: boolean }) {
  return (
    <svg viewBox="0 0 12 40" className={`h-8 w-2.5 transition-all duration-300 sm:h-9 sm:w-3 ${used ? 'opacity-15' : ''}`}>
      <path d="M6 1 L9 10 L3 10 Z" fill="#9aa3ad" />
      <rect x="5" y="9" width="2" height="26" fill="#25272d" />
      <path d="M6 24 Q1 27 1.5 33 L6 37 Z" fill="#fb923c" />
      <path d="M6 24 Q11 27 10.5 33 L6 37 Z" fill="#ea6a12" />
    </svg>
  );
}

function Star({ on, delay }: { on: boolean; delay: number }) {
  return (
    <svg viewBox="0 0 48 48" className="star-pop h-14 w-14 sm:h-16 sm:w-16" style={{ animationDelay: `${delay}ms` }}>
      <path d="M24 3.5l6.2 13.1 14.3 1.9-10.5 10 2.7 14.2L24 35.8 11.3 42.7 14 28.5 3.5 18.5l14.3-1.9z" fill={on ? '#ffc933' : '#eceef1'} />
    </svg>
  );
}

/** press-and-hold control (walk, crouch) or a tap (flip) */
function Pad({ title, on, off, children }: { title: string; on: () => void; off?: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={title}
      title={title}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); on(); }}
      onPointerUp={off}
      onPointerCancel={off}
      onLostPointerCapture={off}
      onContextMenu={(e) => e.preventDefault()}
      className="grid h-12 min-w-12 touch-none place-items-center rounded-2xl bg-neutral-900 px-3 text-[11px] font-black tracking-wider text-white transition active:scale-90 active:bg-red-500"
    >
      {children}
    </button>
  );
}

const btn = 'grid h-10 w-10 place-items-center rounded-xl bg-neutral-100 text-neutral-900 transition hover:bg-neutral-200 active:scale-95';
const chip = (on: boolean) =>
  `flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-black tracking-[0.14em] transition active:scale-95 ${
    on ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
  }`;
const big = (primary: boolean) =>
  `w-full rounded-2xl px-5 py-3 text-base font-black tracking-wide transition active:scale-[0.98] ${
    primary ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200'
  }`;

export default function App() {
  useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const duelRef = useRef<Duel | null>(null);
  const storyRef = useRef<Story | null>(null);
  const startRef = useRef(0);
  const [mode, setMode] = useState<Mode>('menu');
  const [ui, setUi] = useState<Ui>(() => blankUi(0));
  const [du, setDu] = useState<DuelUi>(blankDuel);
  const [st, setSt] = useState<StoryUi>(() => blankStory('sky'));
  const [mute, setMute] = useState(false);
  const [cine, setCine] = useState(true);
  const cineRef = useRef(cine);
  const [cleared, setCleared] = useState<number[]>(loadCleared);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || mode === 'menu' || mode === 'levels' || mode === 'ragdoll') return;
    if (mode === 'misi') {
      const g = new Game(c, setUi);
      g.setCine(cineRef.current);
      g.setLevel(startRef.current);
      gameRef.current = g;
      return () => { g.destroy(); gameRef.current = null; };
    }
    if (mode === 'story' || mode === 'perang') {
      const s = new Story(c, setSt, mode === 'perang' ? 'war' : 'sky');
      s.setCine(cineRef.current);
      storyRef.current = s;
      return () => { s.destroy(); storyRef.current = null; };
    }
    const d = new Duel(c, setDu);
    d.setCine(cineRef.current);
    duelRef.current = d;
    return () => { d.destroy(); duelRef.current = null; };
  }, [mode]);

  useEffect(() => { setMuted(mute); }, [mute]);
  useEffect(() => {
    cineRef.current = cine;
    gameRef.current?.setCine(cine);
    duelRef.current?.setCine(cine);
    storyRef.current?.setCine(cine);
  }, [cine]);
  useEffect(() => {
    if (ui.stage !== 'win') return;
    setCleared((c) => {
      if (c.includes(ui.level)) return c;
      const next = [...c, ui.level];
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        /* storage unavailable: progress simply is not kept */
      }
      return next;
    });
  }, [ui.stage, ui.level]);

  const duel = mode === 'duel';
  const story = mode === 'story' || mode === 'perang';
  const war = mode === 'perang';
  const misi = mode === 'misi';
  const playLevel = (i: number) => { startRef.current = i; setUi(blankUi(i)); setMode('misi'); };
  const playDuel = () => { setDu(blankDuel); setMode('duel'); };
  const playStory = () => { setSt(blankStory('sky')); setMode('story'); };
  const playWar = () => { setSt(blankStory('war')); setMode('perang'); };
  const toMenu = () => setMode('menu');
  const restart = () => (duel ? duelRef.current?.reset() : story ? storyRef.current?.reset() : gameRef.current?.reset());
  const goLevel = (i: number) => gameRef.current?.setLevel(i);
  const move = (dir: number) => (duel ? duelRef.current?.setMove(dir) : story ? storyRef.current?.setMove(dir) : gameRef.current?.setMove(dir));
  const def = LEVELS[ui.level];
  const done =
    misi ? ui.stage === 'win' || ui.stage === 'lose' || ui.stage === 'out'
    : duel ? du.stage === 'over'
    : story ? st.stage === 'over' || st.stage === 'won'
    : false;
  const hasNext = ui.level < LEVELS.length - 1;
  const canMove = duel ? du.stage === 'play' : story ? st.stage === 'play' || st.stage === 'clear' : ui.canMove;
  const failRaw = FAIL[ui.why] ?? FAIL.man;
  const fail: [string, string] = [tx(failRaw[0], failRaw[2]), tx(failRaw[1], failRaw[3])];
  const hintPair = HINTS[ui.stage];
  const hint = duel
    ? du.stage === 'intro'
      ? tx('Click / tap to start — 60 seconds, most arrows in opponent HEAD & CHEST wins', 'Klik / tap untuk mulai — 60 detik, panah terbanyak di KEPALA & DADA lawan menang')
      : ''
    : story
      ? st.stage === 'intro'
        ? tx(
            `${war ? 'Wave' : 'Chapter'} ${st.chapter}: ${st.title} — click / tap to start. ${war ? 'Survive — flip onto floating rocks!' : 'Take down every archer on the sky platforms!'}`,
            `${war ? 'Gelombang' : 'Bab'} ${st.chapter}: ${st.title} — klik / tap untuk mulai. ${war ? 'Bertahanlah — naik ke batu melayang dengan salto!' : 'Tumbangkan semua pemanah di pijakan langit!'}`,
          )
        : st.stage === 'clear'
          ? tx(`${war ? 'Wave' : 'Chapter'} cleared! Get ready for the next one…`, `${war ? 'Gelombang' : 'Bab'} selesai! Bersiap ke berikutnya…`)
          : ''
      : tx(hintPair[0], hintPair[1]);
  const hpPct = Math.round((st.hp / st.maxHp) * 100);

  return (
    <div className="relative h-full w-full overflow-hidden bg-white font-sans text-neutral-900 select-none">
      <canvas
        ref={canvasRef}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={tx('Archery arena', 'Arena memanah')}
        className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
      />

      {/* navigation + mission */}
      <div className="pointer-events-none absolute left-3 top-3 max-w-[58%] sm:left-6 sm:top-5 sm:max-w-md">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          <button onClick={toMenu} className={chip(false)} title={tx('Back to menu', 'Kembali ke menu')}>← MENU</button>
          {misi && (
            <>
              <button onClick={() => setMode('levels')} className={chip(false)} title={tx('Select level', 'Pilih level')}>{tx('LEVELS', 'LEVEL')}</button>
              <button onClick={() => goLevel(ui.level - 1)} disabled={ui.level === 0} aria-label={tx('Previous level', 'Level sebelumnya')} title={tx('Previous level', 'Level sebelumnya')} className={`${chip(false)} disabled:opacity-30`}>‹</button>
              <span className={chip(true)}>
                {def.id}
                {cleared.includes(ui.level) && <span className="text-green-400">✓</span>}
              </span>
              <button onClick={() => goLevel(ui.level + 1)} disabled={!hasNext} aria-label={tx('Next level', 'Level berikutnya')} title={tx('Next level', 'Level berikutnya')} className={`${chip(false)} disabled:opacity-30`}>›</button>
            </>
          )}
          {story && <span className={chip(true)}>{war ? tx('WAVE', 'GEL.') : tx('CH.', 'BAB')} {st.chapter}/{st.chapters}</span>}
          <LangToggle compact />
        </div>
        <h1 className="mt-2 text-xl font-black leading-tight tracking-tight sm:text-3xl">
          {duel ? tx('Duel vs Bot', 'Duel lawan bot') : story ? st.title || (war ? tx('War', 'Perang') : 'Story') : tx(def.name, def.nameId ?? def.name)}
          <span className="text-red-500">.</span>
        </h1>
        <p className="text-xs font-semibold text-neutral-500 sm:text-sm">
          {duel
            ? tx(
                'Whoever sticks the most arrows into vital spots (head & chest) in 60 seconds wins. Use the wooden barricade for cover.',
                'Siapa paling banyak menancapkan panah di titik vital (kepala & dada) dalam 60 detik, dia menang. Pakai barikade kayu untuk berlindung.',
              )
            : story
              ? war
                ? tx(
                    'Survive! Enemy archers march from the right and spawn on floating rocks while swordsmen charge. Flip (W/Space) onto rocks, crouch (S) on a rock to drop down.',
                    'Bertahan hidup! Tentara pemanah berbaris dari kanan dan muncul di batu melayang, prajurit pedang berlari menyerbu. Salto (W/spasi) untuk naik ke batu, nunduk (S) di atas batu untuk turun.',
                  )
                : tx(
                    'You stand on a sky platform. Enemy archers appear on neighboring platforms and fire back — crouch or flip to dodge.',
                    'Kamu berdiri di pijakan langit. Pemanah musuh muncul di pijakan lain dan membalas tembakanmu — nunduk atau salto untuk menghindar.',
                  )
              : tx(def.brief, def.briefId ?? def.brief)}
        </p>
        {misi && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ui.goals.map((g) => (
              <li key={g.label} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${g.done ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                <span className={`grid h-3.5 w-3.5 place-items-center rounded-full text-[9px] text-white ${g.done ? 'bg-green-500' : 'bg-red-400'}`}>{g.done ? '✓' : ''}</span>
                {g.label}
              </li>
            ))}
          </ul>
        )}
        {story && (
          <div className="mt-2 w-56 max-w-full">
            <div className="flex items-center justify-between text-[10px] font-black tracking-[0.18em] text-neutral-400">
              <span>{tx('HP', 'NYAWA')}</span><span className={hpPct <= 30 ? 'text-red-500' : ''}>{st.hp}/{st.maxHp}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-neutral-200">
              <div className={`h-full rounded-full transition-all duration-300 ${hpPct <= 30 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${hpPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* duel scoreboard */}
      {duel && (
        <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-neutral-900 px-4 py-2 text-white sm:top-5">
          <div className="text-center">
            <div className="text-[10px] font-black tracking-[0.18em] text-red-400">{tx('YOU', 'KAMU')}</div>
            <div className="text-2xl font-black leading-none tabular-nums">{du.you}</div>
          </div>
          <div className={`rounded-lg px-2 py-1 text-lg font-black tabular-nums ${du.time <= 10 ? 'bg-red-500' : 'bg-white/10'}`}>
            {Math.floor(du.time / 60)}:{String(du.time % 60).padStart(2, '0')}
          </div>
          <div className="text-center">
            <div className="text-[10px] font-black tracking-[0.18em] text-violet-400">BOT</div>
            <div className="text-2xl font-black leading-none tabular-nums">{du.bot}</div>
          </div>
        </div>
      )}

      {/* story scoreboard */}
      {story && (
        <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-neutral-900 px-4 py-2 text-white sm:top-5">
          <div className="text-center">
            <div className="text-[10px] font-black tracking-[0.18em] text-red-400">{tx('ENEMIES', 'MUSUH')}</div>
            <div className="text-2xl font-black leading-none tabular-nums">{st.left}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-black tracking-[0.18em] text-amber-300">{tx('SCORE', 'SKOR')}</div>
            <div className="text-2xl font-black leading-none tabular-nums">{st.score}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-black tracking-[0.18em] text-neutral-400">{tx('KILLS', 'TUMBANG')}</div>
            <div className="text-2xl font-black leading-none tabular-nums">{st.kills}</div>
          </div>
        </div>
      )}

      {/* quiver + controls */}
      <div className="absolute right-3 top-3 flex items-start gap-2 sm:right-6 sm:top-5">
        {misi && (
          <div className="pointer-events-none rounded-2xl bg-neutral-100 px-3 py-2">
            <div className="text-[10px] font-black tracking-[0.18em] text-neutral-400">{tx('ARROWS', 'ANAK PANAH')}</div>
            <div className="mt-1 flex items-end gap-1.5">
              {Array.from({ length: ui.total }, (_, i) => <ArrowIcon key={i} used={i >= ui.arrows} />)}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button onClick={restart} aria-label={tx('Restart', 'Ulangi')} title={tx('Restart', 'Ulangi')} className={btn}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
            </svg>
          </button>
          <button onClick={() => setMute((m) => !m)} aria-label={mute ? tx('Unmute', 'Nyalakan suara') : tx('Mute', 'Matikan suara')} title={mute ? tx('Unmute', 'Nyalakan suara') : tx('Mute', 'Matikan suara')} className={btn}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
              {mute ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />}
            </svg>
          </button>
          <button
            onClick={() => setCine((c) => !c)}
            aria-pressed={cine}
            aria-label={tx('Zoom and slow motion', 'Zoom dan slow motion')}
            title={cine ? tx('Zoom & slow-mo: ON (click to disable)', 'Zoom & slow-mo: NYALA (klik untuk mematikan)') : tx('Zoom & slow-mo: OFF (click to enable)', 'Zoom & slow-mo: MATI (klik untuk menyalakan)')}
            className={`${btn} text-[9px] font-black leading-none ${cine ? '' : 'text-neutral-400'}`}
          >
            SLOW
            <br />
            {cine ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* movement */}
      <div className={`absolute bottom-3 left-3 flex items-center gap-2 transition-opacity duration-300 sm:bottom-6 sm:left-6 ${canMove ? 'opacity-100' : 'pointer-events-none opacity-25'}`}>
        <Pad title={tx('Back / left (A)', 'Mundur / kiri (A)')} on={() => move(-1)} off={() => move(0)}>◀</Pad>
        <Pad title={tx('Forward / right (D)', 'Maju / kanan (D)')} on={() => move(1)} off={() => move(0)}>▶</Pad>
        {(duel || story) && <Pad title={tx('Crouch (S) — hold', 'Nunduk (S) — tahan')} on={() => (duel ? duelRef.current : storyRef.current)?.setCrouch(true)} off={() => (duel ? duelRef.current : storyRef.current)?.setCrouch(false)}>{tx('CROUCH', 'NUNDUK')}</Pad>}
        {(duel || story) && <Pad title={tx('Flip (W / Space)', 'Salto (W / spasi)')} on={() => (duel ? duelRef.current : storyRef.current)?.flip()}>{tx('FLIP', 'SALTO')}</Pad>}
        <span className="hidden text-[11px] font-bold text-neutral-400 lg:block">
          {war
            ? tx('A·D run  ·  S crouch / drop from rock  ·  W / Space flip (onto rock)', 'A·D lari  ·  S nunduk / turun dari batu  ·  W / spasi salto (naik batu)')
            : duel || story
              ? tx('A·D run  ·  S crouch  ·  W / Space flip', 'A·D lari  ·  S nunduk  ·  W / spasi salto')
              : tx('A·D back / forward', 'A·D mundur / maju')}
        </span>
      </div>

      {/* contextual hint */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[4.75rem] flex justify-center px-4 sm:bottom-7 sm:px-40 lg:px-[26rem]">
        <div key={hint} className={`hint-in rounded-full bg-neutral-900 px-4 py-2 text-center text-xs font-bold text-white sm:text-sm ${hint ? '' : 'hidden'}`}>
          {hint}
        </div>
      </div>

      {/* result */}
      {done && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/70 p-4 backdrop-blur-[2px]">
          <div className="card-in w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-[0_24px_70px_-20px_rgba(15,23,42,0.45)] ring-1 ring-neutral-200 sm:p-8">
            {duel ? (
              <>
                <div className={`text-[11px] font-black tracking-[0.22em] ${du.result === 'win' ? 'text-green-600' : du.result === 'lose' ? 'text-red-500' : 'text-amber-500'}`}>
                  {tx('TIME UP', 'WAKTU HABIS')}
                </div>
                <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                  {du.result === 'win' ? tx('You win!', 'Kamu menang!') : du.result === 'lose' ? tx('Bot wins', 'Bot menang') : tx('Draw!', 'Seri!')}
                </h2>
                <p className="mt-3 text-5xl font-black tabular-nums">
                  <span className="text-red-500">{du.you}</span>
                  <span className="mx-2 text-neutral-300">–</span>
                  <span className="text-violet-600">{du.bot}</span>
                </p>
                <p className="mt-2 text-sm font-semibold text-neutral-500">{tx('Total arrows stuck in head & chest.', 'Jumlah panah yang menancap di kepala & dada.')}</p>
              </>
            ) : story ? (
              <>
                <div className={`text-[11px] font-black tracking-[0.22em] ${st.stage === 'won' ? 'text-green-600' : 'text-red-500'}`}>
                  {st.stage === 'won'
                    ? (war ? tx('ALL WAVES HELD', 'SEMUA GELOMBANG DITAHAN') : tx('ALL CHAPTERS CLEARED', 'SEMUA BAB TAMAT'))
                    : tx(`FELL AT ${war ? 'WAVE' : 'CHAPTER'} ${st.chapter}`, `GUGUR DI ${war ? 'GELOMBANG' : 'BAB'} ${st.chapter}`)}
                </div>
                <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                  {st.stage === 'won' ? (war ? tx('Battlefield hero!', 'Pahlawan lapangan!') : tx('Master of the skies!', 'Penguasa langit!')) : tx('You were shot', 'Kamu tertembak')}
                </h2>
                <p className="mt-3 text-5xl font-black tabular-nums text-amber-500">{st.score}</p>
                <p className="mt-2 text-sm font-semibold text-neutral-500">
                  {tx(`${st.kills} archers defeated · best score ${Math.max(st.best, st.score)}`, `${st.kills} pemanah tumbang · skor terbaik ${Math.max(st.best, st.score)}`)}
                </p>
              </>
            ) : ui.stage === 'win' ? (
              <>
                <div className="text-[11px] font-black tracking-[0.22em] text-green-600">{tx(`LEVEL ${def.id} CLEARED`, `LEVEL ${def.id} SELESAI`)}</div>
                <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{tx('Bullseye!', 'Tepat sasaran!')}</h2>
                <div className="mt-4 flex justify-center gap-1">
                  {[0, 1, 2].map((i) => <Star key={i} on={i < ui.stars} delay={150 + i * 160} />)}
                </div>
                <p className="mt-3 text-sm font-semibold text-neutral-500">
                  {tx(`Cleared in ${ui.shots} arrows.`, `Selesai dengan ${ui.shots} anak panah.`)}
                  {!hasNext && tx(' All levels complete — you are officially a perfectshot!', ' Semua level tamat — kamu resmi perfectshot!')}
                </p>
              </>
            ) : ui.stage === 'lose' ? (
              <>
                <div className="text-[11px] font-black tracking-[0.22em] text-red-500">{tx('FAILED', 'GAGAL')}</div>
                <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{fail[0]}</h2>
                <p className="mt-3 text-sm font-semibold text-neutral-500">{fail[1]}</p>
              </>
            ) : (
              <>
                <div className="text-[11px] font-black tracking-[0.22em] text-amber-500">{tx('OUT OF ARROWS', 'PANAH HABIS')}</div>
                <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{tx('Not finished yet', 'Belum selesai')}</h2>
                <p className="mt-3 text-sm font-semibold text-neutral-500">{tx('Try stepping forward or back for a better shooting angle.', 'Coba maju atau mundur untuk mencari sudut tembak yang lebih enak.')}</p>
              </>
            )}
            <div className="mt-6 flex flex-col gap-2">
              {misi && ui.stage === 'win' && hasNext && (
                <button onClick={() => goLevel(ui.level + 1)} className={big(true)}>LEVEL {def.id + 1} →</button>
              )}
              {story && st.stage === 'over' && (
                <button onClick={() => storyRef.current?.retry()} className={big(true)}>
                  {tx(`RETRY ${war ? 'WAVE' : 'CHAPTER'} ${st.chapter}`, `ULANGI ${war ? 'GELOMBANG' : 'BAB'} ${st.chapter}`)}
                </button>
              )}
              <button onClick={restart} className={big(duel || (story && st.stage === 'won') || !(misi && ui.stage === 'win' && hasNext))}>
                {duel
                  ? tx('DUEL AGAIN', 'DUEL LAGI')
                  : story
                    ? (war ? tx('START FROM WAVE 1', 'MULAI DARI GELOMBANG 1') : tx('START FROM CHAPTER 1', 'MULAI DARI BAB 1'))
                    : ui.stage === 'win'
                      ? tx('PLAY AGAIN', 'MAIN LAGI')
                      : tx('TRY AGAIN', 'COBA LAGI')}
              </button>
              <button onClick={toMenu} className="mt-1 py-1 text-sm font-bold text-neutral-400 transition hover:text-neutral-900">
                menu
              </button>
            </div>
          </div>
        </div>
      )}

      {(mode === 'menu' || mode === 'ragdoll') && (
        <RagdollArcher
          title={mode === 'menu'}
          onStart={() => setMode('ragdoll')}
          onExit={toMenu}
          mute={mute}
          onMute={() => setMute((m) => !m)}
          cleared={cleared.length}
          levels={LEVELS.length}
          onPlay={() => { const next = LEVELS.findIndex((_, i) => !cleared.includes(i)); playLevel(next < 0 ? 0 : next); }}
          onLevels={() => setMode('levels')}
          onStory={playStory}
          onWar={playWar}
          onDuel={playDuel}
        />
      )}
      {mode === 'levels' && <Levels cleared={cleared} onLevel={playLevel} onBack={toMenu} />}
    </div>
  );
}
