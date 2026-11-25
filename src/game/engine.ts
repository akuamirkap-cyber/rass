import { Ctx, V, v, add, sub, mul, len, dist, clamp, lerp, lerpV, damp, fromAngle, rot, ease, segDist, groundShadow, stroke } from './util';
import {
  ARROW_LEN, MAX_DRAW, LAUNCH_ANGLE, drawApple, drawArrow, drawGlasses, drawLauncher, drawStand, launcherMuzzle,
} from './gear';
import {
  BOARD, SAW, TRAMP, WEIGHT, drawBoard, drawCrane, drawGlass, drawPlate, drawSeesaw, drawTrampoline, drawWeight,
  plankPoint,
} from './props';
import {
  AIM_MAX, AIM_MIN, ArcherPhase, ArcherPose, ArcherState, DUR, RELEASE_HOLD, STANCE, drawArcher, poseArcher,
} from './archer';
import {
  APPLE_R, Hit, TargetState, applePos, drawTarget, headPos, hitTest, joints, makeTarget, partLabel, strike,
  setRagGravity, toRagdoll, updateTarget,
} from './target';
import { initAudio, sfx } from './sfx';
import {
  drawBalloon, drawBeam, drawBoss, drawDuck, drawFerris, drawRamp, drawSkate, drawSteel, drawUfo, drawWoodWall,
} from './props2';
import {
  drawCrater, drawEarth, drawFlag, drawFunnel, drawHelmet, drawHole, drawMagnet, drawPortal, drawRail,
} from './props3';
import { LabCfg, MagCfg, PortCfg } from './lab';
import {
  LooseProp, ZombieState, drawHelmetProp, drawShieldProp, drawZombieFull, hitTestZombie,
  lodgeArrowInZombie, makeZombie, ragdollZombie, updateZombie, zombieHeadPos, zombieHeartPos,
} from './zombie';
import { Host, carry5, collide5, draw5, drawFront5, drawOver5, field5, focus5, hasField5, reset5, update5 } from './mini5';
import { collide6, draw6, drawOver6, reset6, update6 } from './mini6';
import { tx } from '../i18n';

export const GROUND = 606;
const GRAV = 950;
const APPLE_GRAV = 620;
const MAN_GRAV = 620;
const THROW_SPEED = 691;
const THROW_EVERY = 2.9;
const START_X = 215;
const ZONE_BACK = 200; // how far the archer may walk back / forward from the bow stand
const ZONE_FWD = 240;
const WALK_SPEED = 165;
const STEP_LEN = 30;
const STEP_TIME = 0.24;
const GLASS_H = 252;
const CRANE_H = 520;
const speedOf = (frac: number) => 720 + 1605 * frac;

const PLATE_R = 24;
const BOARD_H = 150; // centre of the target face above the floor
const FOE_WAIT = 1.0; // the rival stares for a moment before reaching for an arrow
const FOE_DRAW = 3.0; // seconds he needs to come to full draw

// levels 10-16
const BALLOON_OFF = [v(-30, -190), v(12, -222), v(52, -186)]; // balloon centres relative to the knot on his back
const BALLOON_COL = ['#ef4444', '#fbbf24', '#3b82f6'];
const BALLOON_R = 28;
const FLY_AWAY = 300; // feet this high above the floor = gone for good
const RAMP_R = 420;
const RAMP_MAX = 0.62;
const RAMP_W = 1.55;
const RAMP_LIP = 0.78;
const UFO_H = 520;
const UFO_TIME = 6.4; // seconds the beam needs to pull the apple in
const WALL = { x0: -64, x1: -46, h: 262 };
const STEEL = { x: 172, y: -292, half: 62 };
const WHEEL = { r: 185, h: 252, dx: 30, drop: 46, w: 0.4 };
const BOSS_HP = 6;
// levels 17-20
const MOON = { g: 950 / 6, v0: 250, tc: 0.55 };
const MAG = { dx: -400, h: 300, on: 2.4, off: 1.1, reach: 400, k: 5.6e7, max: 9000 };
const PORTAL = { ax: -430, bx: 190, h: 205, half: 58, bob: 70, w: 1.6 };
const RAIN_NEED = 12;
const RAIN_TIME = 40;
interface Rain { p: V; vel: V; rot: number; vr: number; state: 'air' | 'ground'; t: number; bonked: boolean; lin?: boolean }
interface Gate { c: V; n: V; ang: number }
interface Duck { x: number; base: number; dir: number; sp: number; ph: number; p: V; hit: boolean; vel: V; rot: number }
interface Ufo { state: 'idle' | 'come' | 'beam' | 'gone'; t: number; p: V; from: V; apple: V | null; flash: number; vel: V }
interface Boss {
  x: number; r: number; hp: number; ph: number; kb: number; hop: number; squash: number; hurt: number;
  dead: boolean; won: boolean; air: boolean; sticks: { d: V; ang: number }[];
}

type Kind =
  | 'basic' | 'thrower' | 'trampoline' | 'stack' | 'seesaw' | 'plates' | 'bull' | 'rival'
  | 'balloon' | 'ducks' | 'ramp' | 'ufo' | 'bank' | 'wheel' | 'boss'
  | 'moon' | 'magnet' | 'portal' | 'rain' | 'lab' | 'mini';
export interface LevelDef {
  id: number; name: string; brief: string; nameId?: string; briefId?: string; kind: Kind;
  dist: number; arrows: number; par: number; // par = arrows allowed for three stars
  top: number; pad: number; // world px the camera keeps visible above the floor / right of the target
  v?: Record<string, number>; // levels 41-50: tuning knobs for the ideas of levels 10-16
  mini?: string; // levels 41-50: which minigame
  lab?: LabCfg; // levels 21-30: the obstacles of levels 17-20, varied and combined
}
export const LEVELS: LevelDef[] = [
  { id: 1, name: 'Shoot the Apple', nameId: 'Panah apelnya', brief: "Right on top of Mr. Bejo's head — don't hit him!", briefId: 'Tepat di atas kepala Pak Bejo — jangan sampai kena orangnya!', kind: 'basic', dist: 835, arrows: 5, par: 1, top: 350, pad: 135 },
  { id: 2, name: 'Twice as Far', nameId: 'Dua kali lebih jauh', brief: 'Double the distance. Aim higher — arrows arc downward.', briefId: 'Jaraknya dua kali lipat. Bidik lebih tinggi, panahnya melengkung turun.', kind: 'basic', dist: 1670, arrows: 5, par: 1, top: 350, pad: 135 },
  { id: 3, name: 'Flying Apple', nameId: 'Apel terbang', brief: 'Hit BOTH the launched apple AND the apple on his head. One arrow can skewer both!', briefId: 'Kenai apel yang dilempar DAN apel di kepala. Satu panah bisa menusuk dua-duanya!', kind: 'thrower', dist: 835, arrows: 6, par: 2, top: 455, pad: 320 },
  { id: 4, name: 'Trampoline', nameId: 'Trampolin', brief: 'Mr. Bejo bounces while holding an apple on his head. Wait for the peak of his jump.', briefId: 'Pak Bejo melompat sambil memegangi apel di kepalanya. Tunggu puncak lompatannya.', kind: 'trampoline', dist: 835, arrows: 6, par: 1, top: 500, pad: 190 },
  { id: 5, name: 'Apple Tower', nameId: 'Menara apel', brief: "Mas Joko stands atop Mr. Bejo's apple. Two apples, two guys — don't hit anyone.", briefId: 'Mas Joko berdiri di atas apel Pak Bejo. Dua apel, dua orang — jangan kena siapa pun.', kind: 'stack', dist: 835, arrows: 6, par: 2, top: 495, pad: 135 },
  { id: 6, name: '100-Ton Seesaw', nameId: 'Jungkat-jungkit 100 ton', brief: 'Arrow-proof glass. Drop the weight to launch Mr. Bejo, then shoot his apple.', briefId: 'Kacanya anti-panah. Jatuhkan pemberat supaya Pak Bejo terlempar, lalu panah apelnya.', kind: 'seesaw', dist: 780, arrows: 7, par: 2, top: 600, pad: 481 },
  { id: 7, name: 'Flying Plates', nameId: 'Piring terbang', brief: 'Glass plates are hurled right at you. Shatter them before they hit you!', briefId: 'Piring kaca dilempar ke arahmu. Pecahkan sebelum mengenaimu!', kind: 'plates', dist: 835, arrows: 8, par: 3, top: 470, pad: 320 },
  { id: 8, name: 'Twice in the Same Spot', nameId: 'Dua kali di titik yang sama', brief: 'Like darts: land two arrows right in the yellow bullseye of the target board.', briefId: 'Seperti dart: tancapkan dua panah di titik tengah (kuning) papan sasaran.', kind: 'bull', dist: 835, arrows: 6, par: 2, top: 350, pad: 150 },
  { id: 9, name: 'Quick Draw', nameId: 'Siapa cepat', brief: 'He is about to shoot you. Take him down before he looses his arrow!', briefId: 'Dia mau memanahmu. Kenai dia sebelum dia sempat melepas panahnya!', kind: 'rival', dist: 835, arrows: 4, par: 1, top: 350, pad: 275 },
  { id: 10, name: 'Floating Balloons', nameId: 'Balon terbang', brief: 'Mr. Bejo floats away on balloons. Shoot his apple before he drifts off — pop balloons to bring him down.', briefId: 'Pak Bejo melayang dibawa balon. Panah apelnya sebelum dia terbang ke langit — letuskan balon supaya dia turun.', kind: 'balloon', dist: 835, arrows: 7, par: 1, top: 665, pad: 150 },
  { id: 11, name: 'Watch the Ducks', nameId: 'Awas bebek lewat', brief: "Ducks fly back and forth in front of the target. Find a gap — don't hit any ducks!", briefId: 'Bebek-bebek terbang mondar-mandir di depan sasaran. Cari celahnya — jangan sampai kena bebek!', kind: 'ducks', dist: 835, arrows: 5, par: 1, top: 380, pad: 135 },
  { id: 12, name: 'Skateboard', nameId: 'Skateboard', brief: 'Mr. Bejo rides a halfpipe while holding his apple. Easiest when he pauses at the top edge.', briefId: 'Pak Bejo meluncur bolak-balik di halfpipe sambil memegangi apelnya. Paling gampang saat dia berhenti di ujung.', kind: 'ramp', dist: 835, arrows: 6, par: 1, top: 400, pad: 370 },
  { id: 13, name: 'Alien Abduction', nameId: 'Diculik alien', brief: "A UFO tractor beam pulls the apple off Mr. Bejo's head. Shoot it before it reaches the saucer!", briefId: 'UFO menyedot apel dari kepala Pak Bejo. Panah apelnya sebelum masuk ke piring terbang!', kind: 'ufo', dist: 835, arrows: 5, par: 1, top: 610, pad: 150 },
  { id: 14, name: 'Bank Shot', nameId: 'Tembakan pantul', brief: 'Mr. Bejo hides behind a wooden wall. Ricochet an arrow off the steel plate to hit the apple from behind.', briefId: 'Pak Bejo berlindung di balik tembok. Pantulkan panah di pelat baja supaya kena apelnya dari belakang.', kind: 'bank', dist: 835, arrows: 6, par: 1, top: 400, pad: 290 },
  { id: 15, name: 'Ferris Wheel', nameId: 'Bianglala', brief: 'Mr. Bejo and Mas Joko ride a Ferris wheel. Two apples spinning — safest at the top or bottom.', briefId: 'Pak Bejo dan Mas Joko naik bianglala. Dua apel berputar — paling aman saat mereka di puncak atau di bawah.', kind: 'wheel', dist: 835, arrows: 7, par: 2, top: 655, pad: 330 },
  { id: 16, name: 'King Apple', nameId: 'Raja Apel', brief: 'Boss fight! A giant apple hops toward you. Land 6 arrows before he crushes you.', briefId: 'Bos terakhir! Apel raksasa melompat ke arahmu. Tancapkan 6 panah sebelum dia menyerudukmu.', kind: 'boss', dist: 835, arrows: 10, par: 6, top: 380, pad: 150 },
  { id: 17, name: 'On the Moon', nameId: 'Di bulan', brief: 'One-sixth gravity: arrows fly nearly flat and Mr. Bejo hops in slow motion. Aim straight at the apple.', briefId: 'Gravitasi cuma seperenam: panah terbang hampir lurus dan Pak Bejo melompat pelan-pelan. Bidik langsung ke apelnya.', kind: 'moon', dist: 1500, arrows: 6, par: 1, top: 470, pad: 150 },
  { id: 18, name: 'Blow Out Candles', nameId: 'Tiup lilin', brief: 'Snuff all five candles on the tiered cake: your arrows must pass right through the flames.', briefId: 'Padamkan lima lilin di kue bertingkat: panahmu harus lewat tepat di nyala apinya.', kind: 'mini', mini: 'candles', dist: 835, arrows: 6, par: 2, top: 400, pad: 170 },
  { id: 19, name: 'Portals', nameId: 'Portal', brief: 'What enters the blue portal exits the orange portal at the same height. Aim dead-center at blue.', briefId: 'Yang masuk portal biru keluar dari portal oranye di ketinggian yang sama. Tembak tepat di tengah portal biru.', kind: 'portal', dist: 835, arrows: 6, par: 1, top: 400, pad: 290 },
  { id: 20, name: 'Apple Kebab Party', nameId: 'Pesta sate apel', brief: "Apples rain from the sky. Skewer 12 before time runs out — one shot can make a kebab. Don't hit anyone!", briefId: 'Hujan apel dari langit. Tusuk 12 apel sebelum waktu habis — satu panah bisa jadi sate. Jangan kena orangnya!', kind: 'rain', dist: 835, arrows: 8, par: 99, top: 560, pad: 200 },
  // 21-30: the four obstacles above, varied and combined
  { id: 21, name: 'Zero Gravity', nameId: 'Tanpa gravitasi', brief: 'Zero gravity: arrows fly dead straight and Mr. Bejo floats slowly spinning. Wait until his apple faces you.', briefId: 'Nol gravitasi: panah terbang lurus sempurna dan Pak Bejo melayang sambil berputar pelan. Tunggu apelnya menghadap ke kamu.', kind: 'lab', dist: 900, arrows: 6, par: 1, top: 470, pad: 170, lab: { g: 0, man: 'float', helmet: true, space: true, tol: 5 } },
  { id: 22, name: 'Black Hole', nameId: 'Lubang hitam', brief: 'The black hole swallows close arrows and bends passing shots. Your aim line curves too — curve around it.', briefId: 'Lubang hitam menelan panah yang terlalu dekat dan membelokkan yang lewat. Garis bidikmu ikut bengkok — kitari lubangnya.', kind: 'lab', dist: 900, arrows: 6, par: 1, top: 400, pad: 150, lab: { g: 0, helmet: true, space: true, mags: [{ x: -440, h: 185, hole: true, k: 4.2e7, max: 15000, reach: 560 }] } },
  { id: 23, name: 'Ball Juggle', nameId: 'Juggling bola', brief: 'Shoot the ball to bounce it upward. Score 5 bounces without letting it touch the ground.', briefId: 'Panah bolanya supaya memantul ke atas. Lima pantulan tanpa menyentuh tanah.', kind: 'mini', mini: 'juggle', dist: 835, arrows: 8, par: 99, top: 520, pad: 135 },
  { id: 24, name: 'Fireworks', nameId: 'Kembang api', brief: 'Rockets launch from the ground. Hit 5 rockets mid-air within 40 seconds to set off fireworks.', briefId: 'Roket meluncur dari tanah. Panah 5 roket di udara dalam 40 detik supaya meledak jadi kembang api.', kind: 'mini', mini: 'rockets', dist: 835, arrows: 8, par: 99, top: 560, pad: 135 },
  { id: 25, name: 'Lighthouse Portal', nameId: 'Portal mercusuar', brief: 'The orange portal sweeps like a lighthouse beam. Shoot the blue portal right when the orange dots aim at the apple.', briefId: 'Portal oranye mengayun seperti lampu mercusuar. Tembak tengah portal biru tepat saat titik-titik oranyenya menunjuk ke apel.', kind: 'lab', dist: 835, arrows: 6, par: 1, top: 400, pad: 290, lab: { wall: true, back: true, far: 330, ports: [{ a: [-430, 205, Math.PI], b: [190, 205, Math.PI], swing: 1.2, swingW: 1.9 }] } },
  { id: 26, name: 'Apple on Your Own Head', nameId: 'Apel di kepalamu', brief: 'This time the apple is on YOUR head! Enter blue portal, exit orange, straight back at you. Too low = self-hit.', briefId: 'Kali ini apelnya di kepalamu sendiri! Masuk portal biru, keluar dari portal oranye, balik ke arahmu. Terlalu rendah = kena kepala sendiri.', kind: 'lab', dist: 835, arrows: 5, par: 1, top: 470, pad: 60, lab: { man: 'none', self: true, warp: true, guide: 1.7, far: 60, walls: [[-100, -82, 440]], ports: [{ a: [-102, 175, Math.PI], b: [-102, 340, Math.PI], half: 62 }] } },
  { id: 27, name: 'Moon Kebabs', nameId: 'Sate di bulan', brief: 'Apples drift down in neat rows. Wait until a row lines up with your bow, then skewer 5 in ONE shot.', briefId: 'Apel turun pelan dalam barisan. Tunggu sampai satu baris sejajar dengan busurmu, lalu tusuk 5 apel sekaligus dengan SATU panah.', kind: 'lab', dist: 835, arrows: 6, par: 1, top: 560, pad: 150, lab: { g: 1 / 6, helmet: true, space: true, rain: 'lines', need: 5, rapid: true } },
  { id: 28, name: 'Kebab Machine', nameId: 'Mesin sate', brief: 'Shoot the blue portal: your arrow drops from the funnel, pierces the apple column, loops through the floor. Careful — Mr. Bejo is behind it!', briefId: 'Tembak portal biru: panahmu jatuh dari corong, menembus kolom apel, masuk portal lantai, lalu berputar terus. Awas, Pak Bejo berdiri di belakang portal!', kind: 'lab', dist: 835, arrows: 5, par: 1, top: 560, pad: 150, lab: { rain: 'loop', need: 12, rapid: true, ports: [{ a: [-70, 150, Math.PI], b: [-330, 500, Math.PI / 2], nozzle: true, bob: 50, bobW: 1.7, half: 44 }, { a: [-330, 4, -Math.PI / 2], b: [-330, 500, Math.PI / 2], nozzle: true, half: 54, hideB: true }] } },
  { id: 29, name: 'Three Rings', nameId: 'Tiga gelang', brief: 'Arc one arrow through all three rings and hit the bell. Dial angle and power until the guide dots thread every ring.', briefId: 'Lambungkan satu panah menembus ketiga gelang, lalu kena loncengnya. Atur sudut dan tenaga sampai titik-titiknya lewat di tengah gelang.', kind: 'mini', mini: 'hoops', dist: 835, arrows: 6, par: 1, top: 500, pad: 450 },
  { id: 30, name: 'Space Kebab Party', nameId: 'Pesta sate antariksa', brief: 'Apple rain in moon gravity plus portals looping your arrow back for seconds. Skewer 22 apples before time runs out!', briefId: 'Hujan apel di gravitasi bulan, dan portal yang mengirim panahmu balik untuk sate kedua. Tusuk 22 apel sebelum waktu habis!', kind: 'lab', dist: 835, arrows: 8, par: 99, top: 560, pad: 200, lab: { g: 1 / 6, men2: true, helmet: true, space: true, rain: 'party', need: 22, time: 45, rapid: true, ports: [{ a: [-130, 330, Math.PI], b: [150, 470, Math.PI], half: 70 }] } },
  // 31-40: new ideas · 41-50: minigames · 51-60: the ideas of levels 10-16, pushed further
  { id: 31, name: 'Fire Arrows', nameId: 'Panah api', brief: 'Pass your arrow through the torch flame to ignite it, then light all three lanterns.', briefId: 'Lewatkan panahmu di api obor supaya menyala, lalu kenai lentera. Tiga lentera.', kind: 'mini', mini: 'torch', dist: 835, arrows: 8, par: 3, top: 450, pad: 135 },
  { id: 32, name: 'Sliding Doors', nameId: 'Pintu geser', brief: 'Two wooden doors slide up and down with narrow gaps. Wait until both gaps align, then release.', briefId: 'Dua pintu kayu naik-turun dengan celah sempit. Tunggu kedua celahnya sejajar, baru lepas.', kind: 'lab', dist: 835, arrows: 7, par: 1, top: 400, pad: 135, lab: { doors: [{ x: -430, gap: 92, amp: 70, w: 1.4, mid: 175 }, { x: -240, gap: 92, amp: 70, w: 1.9, ph: 1.5, mid: 175 }] } },
  { id: 33, name: 'Giant Fan', nameId: 'Kipas raksasa', brief: 'Spinning blades block the lane. Thread your shot between the blades.', briefId: 'Baling-baling berputar menghalangi jalur tembak. Selipkan panahmu di antara bilahnya.', kind: 'lab', dist: 835, arrows: 7, par: 1, top: 400, pad: 135, lab: { fan: { x: -300, h: 100, r: 125, n: 3, w: 2.2 } } },
  { id: 34, name: 'Pendulum Apple', nameId: 'Apel bandul', brief: "The apple hangs from a rope swinging above Mr. Bejo's head. Shoot the apple, not him.", briefId: 'Apelnya digantung di tali dan berayun di atas kepala Pak Bejo. Panah apelnya, bukan orangnya.', kind: 'lab', dist: 835, arrows: 6, par: 1, top: 520, pad: 200, lab: { pend: { x: 0, h: 470, len: 230, amp: 0.75, w: 1.6 } } },
  { id: 35, name: 'Toy Train', nameId: 'Kereta mainan', brief: 'Mr. Bejo rides a mini rail cart back and forth. Lead your shot slightly ahead of his movement.', briefId: 'Pak Bejo naik kereta kecil yang maju-mundur. Bidik sedikit di depan arah jalannya.', kind: 'lab', dist: 835, arrows: 6, par: 1, top: 400, pad: 330, lab: { cart: { amp: 170, w: 1.2 }, far: 340 } },
  { id: 36, name: 'Upside-Down World', nameId: 'Dunia terbalik', brief: 'Reversed gravity: your arrows fall UPWARD. Aim lower than usual.', briefId: 'Gravitasi terbalik: panahmu jatuh ke ATAS. Bidik lebih rendah dari biasanya.', kind: 'lab', dist: 835, arrows: 6, par: 1, top: 400, pad: 135, lab: { g: -1 } },
  { id: 37, name: 'Blackout', nameId: 'Mati lampu', brief: 'Pitch black! Only a sweeping spotlight reveals the stage. Remember the apple position as it passes.', briefId: 'Gelap gulita! Cuma lampu sorot yang berkeliling. Hafalkan posisi apelnya saat tersorot.', kind: 'lab', dist: 835, arrows: 6, par: 1, top: 400, pad: 135, lab: { dark: true } },
  { id: 38, name: 'Three Amigos', nameId: 'Tiga sekawan', brief: 'Three guys lined up, three apples in a row. One flat shot can skewer all three.', briefId: 'Tiga orang berbaris, tiga apel sejajar. Satu panah lurus bisa menusuk ketiganya.', kind: 'lab', dist: 835, arrows: 5, par: 1, top: 400, pad: 300, lab: { row: 3, far: 330 } },
  { id: 39, name: 'Apple & Bomb Wheel', nameId: 'Roda apel dan bom', brief: "A spinning wheel alternates apples and bombs. Shoot 3 apples — don't hit a bomb!", briefId: 'Roda berputar berisi apel dan bom berselang-seling. Panah 3 apel — jangan kena bom!', kind: 'mini', mini: 'wheelbomb', dist: 835, arrows: 7, par: 3, top: 470, pad: 150 },
  { id: 40, name: 'Perfectshot Exam', nameId: 'Ujian perfectshot', brief: 'Sliding door, then a giant fan. Both must open at the exact same moment.', briefId: 'Pintu geser, lalu kipas raksasa. Dua-duanya harus terbuka di saat yang sama.', kind: 'lab', dist: 835, arrows: 8, par: 2, top: 400, pad: 135, lab: { doors: [{ x: -480, gap: 100, amp: 60, w: 1.5, mid: 175 }], fan: { x: -230, h: 100, r: 120, n: 2, w: 2.0 } } },
  { id: 41, name: 'Numbered Balloons', nameId: 'Balon berurutan', brief: 'Pop balloons in numerical order, 1 through 6. Out of order = instant fail.', briefId: 'Letuskan balon sesuai urutan angka, 1 sampai 6. Salah urutan = gagal.', kind: 'mini', mini: 'order', dist: 835, arrows: 9, par: 6, top: 450, pad: 150 },
  { id: 42, name: 'Can Bowling', nameId: 'Boling kaleng', brief: 'Topple the pyramid of cans. Unsupported cans fall too, and fast arrows punch through two.', briefId: 'Robohkan piramida kaleng. Kaleng yang kehilangan penyangga ikut jatuh, dan panah kencang bisa menembus dua kaleng.', kind: 'mini', mini: 'cans', dist: 835, arrows: 4, par: 2, top: 380, pad: 200 },
  { id: 43, name: 'Cut the Rope', nameId: 'Potong tali', brief: "Snip the ropes so apples drop into the passing basket. 3 apples caught = win. Don't shoot the apples!", briefId: 'Potong talinya supaya apel jatuh ke keranjang yang lewat. Tiga apel masuk = menang. Jangan panah apelnya!', kind: 'mini', mini: 'rope', dist: 835, arrows: 9, par: 3, top: 470, pad: 135 },
  { id: 44, name: 'Exactly 20', nameId: 'Tepat 20', brief: 'Like darts: score EXACTLY 20. Center is 10, then 8, 6, 4, 2. Go over 20 = bust.', briefId: 'Seperti dart: kumpulkan skor TEPAT 20. Tengah 10, lalu 8, 6, 4, 2. Kelebihan = gagal.', kind: 'mini', mini: 'exact', dist: 835, arrows: 6, par: 2, top: 350, pad: 150 },
  // 45-60: sixteen fresh set pieces (mini5.ts)
  { id: 45, name: 'Time Zone & Vault', nameId: 'Zona waktu & brankas', brief: 'Slow-mo bubbles slow arrows mid-air. Hit the gold crystal to freeze the spinning vault door, then thread the gap.', briefId: 'Gelembung slow-motion memperlambat panah di udara. Tembak kristal emas untuk membekukan pintu brankas berputar, lalu selipkan panah lewat celahnya.', kind: 'mini', mini: 'timevault', dist: 835, arrows: 7, par: 2, top: 520, pad: 170 },
  { id: 46, name: 'Mini Planet Orbit', nameId: 'Orbit planet mini', brief: "Mini Saturn's gravity curves your shots. Slingshot around the planet to drop behind the titanium wall.", briefId: 'Gravitasi Planet Saturnus Mini melengkungkan panahmu. Lambungkan panah mengitari planet supaya turun di balik tembok titanium.', kind: 'mini', mini: 'saturn', dist: 835, arrows: 7, par: 1, top: 500, pad: 160 },
  { id: 47, name: "Mr. Bejo's Circus Cannon", nameId: 'Meriam sirkus Pak Bejo', brief: 'Helmeted Mr. Bejo launches from a cannon onto a bounce drum and back. Snipe his apple mid-flight!', briefId: 'Pak Bejo berhelm sirkus dilontarkan dari meriam ke drum pantul dan kembali lagi. Snipe apelnya saat dia melayang di udara!', kind: 'mini', mini: 'cannon', dist: 835, arrows: 7, par: 1, top: 520, pad: 200 },
  { id: 48, name: 'Rube Goldberg Domino', nameId: 'Efek domino Rube Goldberg', brief: 'Cut the bowling ball rope to trigger the dominoes and smash the bulletproof bunker hiding Mr. Bejo.', briefId: 'Putuskan tali bola boling supaya jatuh menimpa domino. Rantai domino akan menghantam bunker kaca anti-panah tempat Pak Bejo bersembunyi.', kind: 'mini', mini: 'domino', dist: 835, arrows: 7, par: 2, top: 540, pad: 170 },
  { id: 49, name: 'Fire Jump Rope', nameId: 'Lompat tali api', brief: 'Mas Joko spins a blazing rope while Mr. Bejo jumps. Time your shot when the rope clears — hit the rope and it burns!', briefId: 'Mas Joko memutar tali api sementara Pak Bejo melompat. Selipkan panah ke apel saat tali di bawah atau di atas — kena tali = gosong!', kind: 'mini', mini: 'firerope', dist: 835, arrows: 7, par: 1, top: 440, pad: 230 },
  { id: 50, name: 'Rainbow Prism', nameId: 'Prisma pelangi', brief: 'The obsidian shield deflects normal arrows. Shoot through the crystal prism to forge a rainbow beam that shatters it.', briefId: 'Perisai obsidian memantulkan panah biasa. Lewatkan panahmu di prisma kristal supaya jadi sinar pelangi yang memecahkan obsidian.', kind: 'mini', mini: 'prism', dist: 835, arrows: 7, par: 2, top: 500, pad: 160 },
  { id: 51, name: 'Death Coaster', nameId: 'Rollercoaster maut', brief: 'Mr. Bejo rides a wild rollercoaster track. He slows down most at the track ends — aim there.', briefId: 'Pak Bejo naik kereta rollercoaster yang melaju naik-turun. Paling pelan di ujung rel — bidik apelnya di sana.', kind: 'mini', mini: 'coaster', dist: 835, arrows: 7, par: 1, top: 440, pad: 230 },
  { id: 52, name: 'Giant Top Duel', nameId: 'Duel gasing raksasa', brief: 'Spiked red and blue tops clash in front of Mr. Bejo. Thread the gap or hit the blue top’s crown twice to knock it out.', briefId: 'Gasing merah berduri dan gasing biru beradu di depan Pak Bejo. Cari celah saat keduanya terpisah, atau tembak tombol gasing biru 2x untuk menumbangkannya.', kind: 'mini', mini: 'tops', dist: 835, arrows: 8, par: 1, top: 400, pad: 170 },
  { id: 53, name: 'Tarzan Vine Swing', nameId: 'Ayunan Tarzan', brief: 'Mr. Bejo swings from vine to vine over crocodiles. Shoot the apple at the apex of a swing when he pauses.', briefId: 'Pak Bejo bergelantungan berpindah dari akar ke akar di atas kolam buaya. Bidik apelnya di puncak ayunan saat dia paling lambat.', kind: 'mini', mini: 'tarzan', dist: 835, arrows: 7, par: 1, top: 560, pad: 190 },
  { id: 54, name: "Mr. Bejo's TNT Fort", nameId: 'Benteng TNT Pak Bejo', brief: 'Three apples locked in a crate stack. Blow the TNT barrel to scatter crates and cluster apples — one arrow can skewer all 3!', briefId: 'Tiga apel terkunci di menara peti. Ledakkan barel TNT supaya peti berhamburan dan apel melayang berdekatan — satu panah bisa menyate tiga!', kind: 'mini', mini: 'tnt', dist: 835, arrows: 7, par: 2, top: 520, pad: 260 },
  { id: 55, name: 'Arcade Claw Machine', nameId: 'Mesin capit arcade', brief: 'Mr. Bejo is trapped in a glass claw cabinet. Hit the red button above to lift him out — shoot fast before the claw drops him!', briefId: 'Pak Bejo terkurung dalam mesin capit kaca. Tembak tombol merah di atas supaya capit mengangkatnya keluar — tapi capitnya cepat lepas lagi!', kind: 'mini', mini: 'claw', dist: 835, arrows: 8, par: 2, top: 460, pad: 170 },
  { id: 56, name: 'Musical Bounce Pads', nameId: 'Lantai pegas musik', brief: 'A tall pillar shields three apples. Bounce shots off neon musical pads to arc over and sweep them all.', briefId: 'Pilar tinggi menutup tiga apel. Pantulkan panahmu di pegas neon musikal supaya melambung melewati pilar dan menyapu apel-apelnya.', kind: 'mini', mini: 'springs', dist: 835, arrows: 8, par: 2, top: 460, pad: 300 },
  { id: 57, name: 'Dragon Dance Parade', nameId: 'Parade naga barongsai', brief: "A giant lion-dragon weaves past. The apple sits on its tail — don't hit the dragon head or it gets angry!", briefId: 'Barongsai raksasa meliuk-liuk melintas. Apelnya ada di buntut naga — jangan kena kepalanya, nanti dia marah!', kind: 'mini', mini: 'barongsai', dist: 835, arrows: 7, par: 1, top: 400, pad: 230 },
  { id: 58, name: 'Paper Airplane', nameId: 'Pesawat kertas', brief: 'Mr. Bejo rides a giant paper plane looping in a figure-8. Arrows punch straight through the paper — aim as he turns.', briefId: 'Pak Bejo menunggangi pesawat kertas raksasa yang terbang angka delapan. Panah bisa menembus kertasnya — bidik apelnya saat pesawat berbalik arah.', kind: 'mini', mini: 'paperplane', dist: 835, arrows: 7, par: 1, top: 500, pad: 190 },
  { id: 59, name: 'Twin Hologram', nameId: 'Hologram kembar', brief: 'Two Mr. Bejos: one real, one flickering shadowless hologram. They swap spots every few seconds. Shoot the REAL apple!', briefId: 'Ada dua Pak Bejo: satu asli, satu hologram yang berkedip tanpa bayangan. Mereka bertukar tempat tiap beberapa detik. Panah apel yang ASLI!', kind: 'mini', mini: 'hologram', dist: 835, arrows: 6, par: 1, top: 400, pad: 150 },
  { id: 60, name: 'Boss: King Crab', nameId: 'Bos Raja Kepiting', brief: 'King Crab holds Mr. Bejo hostage and shields his apple! Pop his bubbles, hit both stalk eyes 5x, then shoot the apple.', briefId: 'Raja Kepiting menyandera Pak Bejo dan menutupi apelnya dengan capit! Pecahkan gelembung yang ditembakkan ke arahmu, tembak kedua matanya 5x, lalu panah apelnya.', kind: 'mini', mini: 'crab', dist: 835, arrows: 12, par: 7, top: 480, pad: 240 },
  { id: 61, name: 'Tiny Bow', nameId: 'Busur mini', brief: 'Your bow and arrows shrank to miniature size! Shots are weak and drop steeply — though hitting Mr. Bejo only tickles.', briefId: 'Busur dan panahmu menciut jadi mini! Panahnya lemah dan melengkung tajam — tapi kalau kena Pak Bejo cuma bikin geli.', kind: 'basic', dist: 835, arrows: 10, par: 2, top: 400, pad: 135, v: { gear: 0.42, power: 0.55 } },
  { id: 62, name: 'Spring Boots', nameId: 'Sepatu pegas', brief: "You're wearing spring boots and can't stop bouncing. Release at just the right height.", briefId: 'Kamu memakai sepatu pegas dan terus melompat-lompat. Lepas panah di ketinggian yang pas.', kind: 'basic', dist: 835, arrows: 6, par: 1, top: 420, pad: 135, v: { spring: 1 } },
  { id: 63, name: 'Zombie Showcase', nameId: 'Zombie pajangan', brief: 'Four zombies stand on display pedestals. Hit their glowing vitals (HEAD or HEART) to send them ragdolling off!', briefId: 'Empat zombie dipajang di podium. Panah titik vitalnya (KEPALA atau JANTUNG yang menyala) supaya ragdoll-nya terjungkal dari podium!', kind: 'mini', mini: 'zshow', dist: 835, arrows: 8, par: 4, top: 480, pad: 190 },
  { id: 64, name: 'Zombie Rush', nameId: 'Serbuan zombie', brief: 'A horde of zombies charges toward you! Shoot vitals (HEAD or HEART) to drop them, or shoot legs to cripple them.', briefId: 'Gerombolan zombie berlari ke arahmu! Tembak titik vital (KEPALA atau JANTUNG) untuk menjatuhkannya, atau panah kakinya supaya pincang.', kind: 'mini', mini: 'zrun', dist: 835, arrows: 8, par: 99, top: 400, pad: 150 },
  // 65-74: 10 new unique levels (archer transformations, special arrows, armored zombies & boss)
  { id: 65, name: 'Giant Ballista Bow', nameId: 'Busur raksasa', brief: 'Your bow and arrows turned GIANT! These ballista bolts smash straight through 3 wood walls to reach the apple.', briefId: 'Busur dan panahmu berubah jadi RAKSASA! Panah balista ini sanggup menjebol 3 tembok kayu sekaligus demi mengenai apel Pak Bejo.', kind: 'mini', mini: 'giant', dist: 835, arrows: 6, par: 1, top: 420, pad: 165, v: { gear: 1.65, power: 1.25 } },
  { id: 66, name: 'Jetpack', nameId: 'Jetpack', brief: "You've got a jetpack! HOLD your draw to fire rockets and soar above the high wall, then shoot from mid-air.", briefId: 'Kamu memakai jetpack! TAHAN tarikan busur untuk menyalakan roket dan terbang naik melewati tembok tinggi, lalu tembak dari udara.', kind: 'basic', dist: 835, arrows: 6, par: 1, top: 520, pad: 150, v: { jetpack: 1 } },
  { id: 67, name: 'Minecart Duel', nameId: 'Adu kereta', brief: 'You are rolling on a minecart too while Mr. Bejo rides his track across the lane! Factor in your cart velocity.', briefId: 'Kamu ikut naik kereta tambang yang melaju bolak-balik, sementara Pak Bejo juga naik kereta di seberang! Perhitungkan laju keretamu.', kind: 'lab', dist: 835, arrows: 7, par: 1, top: 400, pad: 330, v: { mycart: 1 }, lab: { cart: { amp: 170, w: 1.25 }, far: 340 } },
  { id: 68, name: 'Triple Split Arrow', nameId: 'Panah tiga cabang', brief: 'Every arrow splits into 3 mid-air! Line up the spread to skewer all 3 apples without hitting Mr. Bejo.', briefId: 'Setiap anak panah membelah jadi 3 cabang di udara! Cari sudut tembak agar ketiga apel tertusuk tanpa mengenai Pak Bejo.', kind: 'mini', mini: 'split', dist: 835, arrows: 6, par: 1, top: 450, pad: 160 },
  { id: 69, name: 'Boomerang Arrow', nameId: 'Panah bumerang', brief: 'A steel shield guards Mr. Bejo’s front. Arc the boomerang arrow high over him to strike from behind — watch your own head!', briefId: 'Tameng baja melindungi depan Pak Bejo. Lambungkan panah bumerang melewati atasnya supaya berbalik dari belakang — awas kena dirimu sendiri!', kind: 'mini', mini: 'boomerang', dist: 835, arrows: 7, par: 1, top: 520, pad: 260 },
  { id: 70, name: 'Tornado Gale', nameId: 'Badai topan', brief: 'Gale winds drag you backward while a tornado hurls arrows skyward! Push forward into the wind and aim low.', briefId: 'Angin topan menyeret tubuhmu mundur dan pusaran tornado di tengah melontarkan panah ke atas! Maju melawan angin dan bidik rendah.', kind: 'mini', mini: 'tornado', dist: 835, arrows: 7, par: 1, top: 480, pad: 160 },
  { id: 71, name: 'Gravity Boots', nameId: 'Sepatu gravitasi', brief: 'Magnetic boots stand you and Mr. Bejo UPSIDE DOWN on the ceiling! Gravity still pulls arrows down — aim closer to the roof.', briefId: 'Sepatu magnet membuatmu dan Pak Bejo berdiri TERBALIK di langit-langit! Gravitasi tetap menarik panah ke bawah — bidik lebih dekat ke atap.', kind: 'basic', dist: 835, arrows: 6, par: 1, top: 480, pad: 150, v: { ceiling: 1 } },
  { id: 72, name: 'Explosive Arrows', nameId: 'Panah ledak', brief: "Your arrow tips pack dynamite! Blast 3 apple crates around Mr. Bejo safely — don't blow him up!", briefId: 'Ujung panahmu dipasangi dinamit! Ledakkan 3 peti apel di sekitar Pak Bejo dari jarak aman — jangan sampai Pak Bejo ikut meledak!', kind: 'mini', mini: 'bombarrow', dist: 835, arrows: 6, par: 2, top: 460, pad: 185 },
  { id: 73, name: 'Armored Zombies', nameId: 'Zombie perisai baja', brief: 'Armored zombies march in with bucket helmets and wood shields! Knock off armor or shoot legs, then hit head or heart.', briefId: 'Pasukan zombie datang memakai helm ember dan perisai kayu! Rontokkan helm/perisainya atau tembak kakinya, lalu bidik kepala atau jantung.', kind: 'mini', mini: 'zarmor', dist: 835, arrows: 10, par: 99, top: 420, pad: 160 },
  { id: 74, name: 'Zombie King', nameId: 'Raja Zombie', brief: 'Final clash! The Zombie King summons minions and hurls curse orbs. Shoot orbs, clear undead, and strike his vitals 5x!', briefId: 'Final! Raja Zombie memanggil anak buah dan menembakkan bola kutukan. Panah bola kutukannya, tumbangkan zombienya, dan serang 5x titik vital Raja Zombie!', kind: 'mini', mini: 'zboss', dist: 835, arrows: 10, par: 99, top: 480, pad: 200 },
  // 75-84: ten absurd minigames (mini6.ts)
  { id: 75, name: 'Golden Egg Chicken', nameId: 'Ayam bertelur emas', brief: "A hen sprints on a tightrope laying eggs everywhere. Shoot 3 GOLD eggs mid-fall — white eggs just splat. Don't hit the hen!", briefId: 'Ayam berlari di tali dan bertelur sembarangan. Panah 3 telur EMAS saat jatuh — telur putih cuma bikin becek. Jangan kena ayamnya!', kind: 'mini', mini: 'chicken', dist: 835, arrows: 8, par: 99, top: 520, pad: 170 },
  { id: 76, name: 'Rocket Fart Mr. Bejo', nameId: 'Kentut roket Pak Bejo', brief: 'Mr. Bejo ate way too many beans: surprise farts rocket him skyward without warning. Wait for the peak, then snipe the apple.', briefId: 'Pak Bejo kebanyakan makan jengkol: kentutnya melontarkan dia ke udara tanpa aba-aba. Tunggu puncaknya, lalu panah apelnya.', kind: 'mini', mini: 'fart', dist: 835, arrows: 6, par: 1, top: 520, pad: 150 },
  { id: 77, name: 'Apple-Thief Ginger Cat', nameId: 'Kucing oren pencuri apel', brief: "An orange cat sneaks up to swipe Mr. Bejo's apple, freezing like a statue whenever you draw! Shoot the apple first — spare the cat.", briefId: 'Kucing oren mengendap mau mencuri apel Pak Bejo. Dia berhenti pura-pura patung tiap kamu membidik! Panah apelnya sebelum dicuri — jangan panah kucingnya.', kind: 'mini', mini: 'cat', dist: 835, arrows: 6, par: 1, top: 400, pad: 320 },
  { id: 78, name: 'Jack-in-the-Box Clown', nameId: 'Kotak kejutan badut', brief: 'BOO! A spring clown pops out with an apple on his head, then ducks back inside. Hit the apple 3x while he’s up.', briefId: 'BA! Badut kotak muncul tiba-tiba dengan apel di kepalanya, lalu masuk lagi. Panah apelnya 3x saat dia muncul.', kind: 'mini', mini: 'jackbox', dist: 835, arrows: 8, par: 99, top: 480, pad: 150 },
  { id: 79, name: 'Giant Watermelon', nameId: 'Semangka raksasa', brief: "Not an apple — a GIANT watermelon on Mr. Bejo's head! One shot splits it into bouncing halves — smash both.", briefId: 'Bukan apel, tapi SEMANGKA raksasa di kepala Pak Bejo. Satu panah membelahnya jadi dua belahan yang memantul-mantul — pecahkan keduanya.', kind: 'mini', mini: 'melon', dist: 835, arrows: 8, par: 3, top: 480, pad: 280 },
  { id: 80, name: 'Rubber Duck Tsunami', nameId: 'Tsunami bebek karet', brief: "A giant rubber duck surfs Mr. Bejo straight at you on a tidal wave! Shoot the apple before impact. Hit the duck = it speeds up.", briefId: 'Bebek karet raksasa membawa Pak Bejo di atas ombak ke arahmu! Panah apelnya sebelum bebek menabrakmu. Kena bebek = dia makin ngebut.', kind: 'mini', mini: 'duckwave', dist: 835, arrows: 8, par: 1, top: 480, pad: 260 },
  { id: 81, name: 'Selfie Flash', nameId: 'Selfie flash', brief: 'Mas Joko keeps snapping blinding selfies while Mr. Bejo changes poses every flash. Shoot the apple between flashes.', briefId: 'Mas Joko sibuk selfie dengan flash yang membutakan layar, dan Pak Bejo ganti gaya tiap jepretan. Panah apelnya di antara kilatan.', kind: 'mini', mini: 'selfie', dist: 835, arrows: 7, par: 1, top: 400, pad: 150 },
  { id: 82, name: 'Chased by Bees', nameId: 'Dikejar lebah', brief: 'Mr. Bejo sprints around chased by a swarm of bees. The swarm blocks arrows — wait until the bees lag behind.', briefId: 'Pak Bejo lari pontang-panting dikejar kawanan lebah. Kawanan lebah menahan panah — cari sudut saat kawanan tertinggal di belakang.', kind: 'mini', mini: 'bees', dist: 835, arrows: 8, par: 1, top: 400, pad: 220 },
  { id: 83, name: 'Donkey Piñata', nameId: 'Piñata keledai', brief: 'Strike the donkey piñata 3x. Every hit swings it wilder and showers candy — watch out for Mr. Bejo & Mas Joko waiting underneath!', briefId: 'Pukul piñata keledai 3x dengan panah. Tiap kena, ayunannya makin liar dan permen berhamburan — awas Pak Bejo & Mas Joko menunggu di bawahnya.', kind: 'mini', mini: 'pinata', dist: 835, arrows: 8, par: 3, top: 540, pad: 180 },
  { id: 84, name: 'Raining Mr. Bejos', nameId: 'Hujan Pak Bejo', brief: 'Dozens of mini Mr. Bejos parachute from the sky carrying apples. Shoot 5 apples without hitting a single mini Bejo. Absurd finale!', briefId: 'Puluhan Pak Bejo mini terjun payung dari langit, masing-masing bawa apel. Panah 5 apel tanpa mengenai satu pun Bejo mini. Finale absurd!', kind: 'mini', mini: 'bejorain', dist: 835, arrows: 8, par: 99, top: 600, pad: 260 },
];

export type Stage = 'idle' | 'busy' | 'ready' | 'aiming' | 'flying' | 'win' | 'lose' | 'out';
export interface Ui {
  stage: Stage; level: number; arrows: number; total: number; shots: number; stars: number; canMove: boolean;
  why: string; // what ended a lost round: 'man' | 'plate' | 'shot'
  goals: { label: string; done: boolean }[];
}

export interface Shot {
  tip: V; vel: V; ang: number; t: number; state: 'fly' | 'stuck' | 'bounce' | 'dead';
  embed: number; apples: number; stuckT: number; spin: number;
  grace: number; // px it may still travel without hurting anyone (it just went through an apple)
  ride: V | null; // offset from the 100 ton weight when lodged in it
  mag?: boolean; // hanging on the magnet
  clip?: number; // still emerging from a portal at this x: only what is left of it is drawn
  clipC?: V; // the same for a portal that can face any way: its centre and the direction it faces
  clipN?: V;
  magI?: number; // which lab magnet it hangs on, and where
  magOff?: V;
  odo?: number; // distance flown, for arrows that could circle a black hole forever
}
interface Thrown { p: V; vel: V; rot: number; state: 'air' | 'ground'; t: number }
interface Plate { p: V; from: V; t: number; T: number; spin: number }
/** level 9: the man who is about to shoot us (an archer drawn mirrored at x = T) */
interface Foe {
  a: ArcherState; pose: ArcherPose; t: number; state: 'wait' | 'shot' | 'down';
  fall: number; fallV: number; danger: number; tick: number; warned: boolean;
  stick: { p: V; ang: number } | null; // our arrow, in his own (un-mirrored) frame
}
interface Body { kind: 'apple' | 'glasses'; p: V; vel: V; rot: number; vr: number }
interface Particle {
  p: V; vel: V; life: number; max: number; size: number; color: string;
  kind: 'drop' | 'star' | 'text'; rot: number; vr: number; text?: string;
}
interface Foot {
  home: number; p: V; from: V; k: number; moving: boolean; rest: number;
  dir: number; lift: number; dur: number; rot: number;
}

export class Game {
  private ctx: Ctx;
  private raf = 0;
  private last = 0;
  private level = 0;
  private a!: ArcherState;
  private men: TargetState[] = [];
  private pose!: ArcherPose;
  private shots: Shot[] = [];
  private thrown: Thrown[] = [];
  private parts: Particle[] = [];
  private loose: Body[] = [];
  private goals: { label: string; done: boolean }[] = [];
  private appleGoal: number[] = []; // goal index of each man's apple
  private feet: Foot[] = [];
  private keys = { l: false, r: false };
  private moveBtn = 0;
  private vx = 0;
  private launch = { timer: 1.4, recoil: 0 };
  private tr = { ph: 0.35, sag: 0, vy: 0 };
  private st = { mode: 'apple' as 'apple' | 'fall' | 'head', vy: 0 };
  private sw = Game.newSaw();
  private plates: Plate[] = [];
  private pt = { timer: 3.3, sent: 0, broken: 0, recoil: 0 };
  private bullHits: number[] = [];
  private foe: Foe | null = null;
  private eArrow: { from: V; p: V; ang: number; t: number; T: number } | null = null;
  private meStick: { u: number; w: number; rel: number } | null = null; // his arrow, lodged in our torso
  private why = '';
  private bl = { alive: [true, true, true], h: 40, vh: 0, gone: false, free: null as V | null, landed: false };
  private ducks: Duck[] = [];
  private rampT = 0;
  private ufo: Ufo = { state: 'idle', t: 0, p: v(0, 0), from: v(0, 0), apple: null, flash: 0, vel: v(0, 0) };
  private steelAng = 2.9;
  private steelFlash = 0;
  private wheelA = 0.6;
  private boss: Boss | null = null;
  private gk = 1; // gravity factor for arrows and loose things (the moon)
  private lt = 0; // level clock that slows down with slow motion
  private hopT = 0;
  private hopV = 0;
  private magWas = true;
  private portFlash = [0, 0];
  private rain: Rain[] = [];
  private rainN = 0;
  private rainT = RAIN_TIME;
  private rainSpawn = 0;
  private starOv = 0;
  private pfx: number[] = []; // portal flashes
  private magPrev: number[] = [];
  private colA: { ph: number; alive: boolean }[] = [];
  private best = 0; // most apples on one arrow
  private selfApple = false;
  private pendOn = false;
  private hov = 0; // 0..1: how far the archer has left the floor
  private jetH = 0;
  private jetV = 0;
  private cam = { x: 600, y: 400, z: 1 };
  private viewX = START_X;
  private scale = 1;
  private vw = 0;
  private vh = 0;
  private timeScale = 1;
  private slowT = 0;
  private shake = 0;
  private drag: { id: number; ax: number; ay: number; cx: number; cy: number } | null = null;
  private aimT = -0.1;
  private pullT = 0;
  private pullVel = 0;
  private crossed = true;
  private kickV = 0;
  private recoilV = 0;
  private strain = 0;
  private creak = 0;
  private clicked = false;
  private result: 'win' | 'lose' | 'out' | null = null;
  private resultT = 0;
  private fired = 0;
  private uiKey = '';
  private cine = true;
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private onUi: (u: Ui) => void) {
    this.ctx = canvas.getContext('2d')!;
    this.reset();
    this.resize();
    this.snapCamera();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
  }

  private static newSaw() {
    return {
      hung: true, landed: false, wy: GROUND - 330, wv: 0, ang: -SAW.tilt, snapT: 0,
      man: 'plank' as 'plank' | 'air' | 'ground', mv: v(0, 0), airT: 0, flash: 0, flashY: 0,
    };
  }

  private static newFoe(): Foe {
    const gy = GROUND - STANCE.ankle;
    const a: ArcherState = {
      x: 0, ground: GROUND, phase: 'nock', t: 0, time: 1.7, aim: -0.07, pull: 0, vib: 0, relAim: -0.07, relPull: 0,
      kick: 0, recoil: 0, quiver: 3, vx: 0, e0: 0, duck: 0, team: 1,
      footB: v(STANCE.back, gy), footF: v(STANCE.front, gy), rotB: 0, rotF: 0,
    };
    return {
      a, pose: poseArcher(a), t: 0, state: 'wait', fall: 0, fallV: 0, danger: 0, tick: 0, warned: false, stick: null,
    };
  }

  // ---- layout ---------------------------------------------------------------
  private get def() {
    return LEVELS[this.level];
  }
  private get T() {
    return START_X + this.def.dist;
  }
  private get launcherX() {
    return this.T + 190;
  }
  private get fx() {
    return this.T + 148.7; // seesaw pivot: puts the left end of the plank under the man's feet
  }
  private get wx() {
    return this.fx + 137;
  }
  private get glassX() {
    return this.T - 90;
  }
  /** an arrow that has flown past this can no longer change anything */
  private get farX() {
    const k = this.def.kind;
    if (k === 'boss' || k === 'rain') return -1e9; // rapid fire: never wait for an arrow
    if (k === 'mini') return -1e9;
    if (this.lab) return this.lab.rapid ? -1e9 : this.T + (this.lab.far ?? 160);
    const far: Partial<Record<Kind, number>> = { balloon: 160, ramp: 345, ufo: 160, bank: 330, wheel: 330, moon: 160, magnet: 160, portal: 330 };
    const f = far[k];
    if (f !== undefined) return this.T + f;
    return k === 'thrower' || k === 'plates' ? this.launcherX + 40 : k === 'trampoline' ? this.T + 120 : k === 'seesaw' ? this.wx + 70 : this.T + 60;
  }

  setLevel(i: number) {
    this.level = clamp(i, 0, LEVELS.length - 1);
    this.reset();
    this.resize();
    this.snapCamera();
  }

  /** cinematic zoom + slow motion on / off */
  setCine(on: boolean) {
    this.cine = on;
  }

  /** hold-to-walk from the on-screen buttons: -1 back, 1 forward, 0 stop */
  setMove(dir: number) {
    this.moveBtn = clamp(dir, -1, 1);
  }

  reset() {
    const d = this.def;
    const T = this.T;
    const gy = GROUND - STANCE.ankle;
    this.a = {
      x: START_X, ground: GROUND, phase: 'idle', t: 0, time: 0, aim: -0.1, pull: 0, vib: 0,
      relAim: -0.1, relPull: 0, kick: 0, recoil: 0, quiver: d.arrows, vx: 0, e0: 0, duck: 0, team: 0, gear: d.v?.gear ?? 1,
      footB: v(START_X + STANCE.back, gy), footF: v(START_X + STANCE.front, gy), rotB: 0, rotF: 0,
    };
    this.feet = [STANCE.back, STANCE.front].map((home) => ({
      home, p: v(START_X + home, gy), from: v(START_X + home, gy), k: 1, moving: false, rest: 1,
      dir: 0, lift: 0, dur: STEP_TIME, rot: 0,
    }));
    this.vx = 0;
    this.viewX = START_X;

    this.men = [makeTarget(0, T, GROUND, d.kind === 'trampoline' || d.kind === 'seesaw' ? 'hold' : 'cross')];
    this.goals = [{ label: tx('Apple on head', 'Apel di kepala'), done: false }];
    this.appleGoal = [0];
    this.launch = { timer: 1.4, recoil: 0 };
    this.tr = { ph: 0.35, sag: 0, vy: 0 };
    this.st = { mode: 'apple', vy: 0 };
    this.sw = Game.newSaw();
    if (d.kind === 'thrower') {
      this.goals = [{ label: tx('Thrown apple', 'Apel yang dilempar'), done: false }, { label: tx('Apple on head', 'Apel di kepala'), done: false }];
      this.appleGoal = [1];
    } else if (d.kind === 'trampoline') {
      this.goals = [{ label: tx('Apple on trampoline', 'Apel di trampolin'), done: false }];
      this.men[0].boxes = [{ l: T - 86, r: T + 86, top: GROUND - TRAMP.bed, bounce: 0.6 }];
    } else if (d.kind === 'stack') {
      const joko = makeTarget(1, T, GROUND, 'hips');
      joko.stance = 3.5;
      this.men.push(joko);
      this.goals = [{ label: tx("Mr. Bejo's Apple", 'Apel Pak Bejo'), done: false }, { label: tx("Mas Joko's Apple", 'Apel Mas Joko'), done: false }];
      this.appleGoal = [0, 1];
    } else if (d.kind === 'seesaw') {
      this.goals = [{ label: tx('Drop the 100-ton weight', 'Jatuhkan pemberat 100 ton'), done: false }, { label: tx("Mr. Bejo's Apple", 'Apel Pak Bejo'), done: false }];
      this.appleGoal = [1];
      this.men[0].boxes = [{ l: this.glassX - 6.5, r: this.glassX + 6.5, top: GROUND - GLASS_H, bounce: 0.2 }];
    } else if (d.kind === 'plates') {
      this.men = [];
      this.goals = [1, 2, 3].map((n) => ({ label: tx(`Plate ${n}`, `Piring ${n}`), done: false }));
    } else if (d.kind === 'bull') {
      this.men = [];
      this.goals = [{ label: tx('First arrow in bullseye', 'Panah pertama di tengah'), done: false }, { label: tx('Second arrow in bullseye', 'Panah kedua di tengah'), done: false }];
    } else if (d.kind === 'rival') {
      this.men = [];
      this.goals = [{ label: tx('Hit him first', 'Kenai dia lebih dulu'), done: false }];
    }
    this.bl = { alive: [true, true, true], h: 40, vh: 0, gone: false, free: null, landed: false };
    this.ducks = [];
    this.rampT = 0;
    this.ufo = { state: 'idle', t: 0, p: v(T, GROUND - 1200), from: v(0, 0), apple: null, flash: 0, vel: v(0, 0) };
    this.steelFlash = 0;
    this.wheelA = 0.6;
    this.boss = null;
    this.reset3();
    if (d.kind === 'ducks') {
      this.ducks = [0, 1, 2].map((i) => ({
        x: T - 480 + i * 130, base: GROUND - [205, 170, 235][i], dir: i === 1 ? -1 : 1, sp: [120, 150, 100][i], ph: i * 0.75,
        p: v(0, 0), hit: false, vel: v(0, 0), rot: 0,
      }));
    } else if (d.kind === 'ramp') {
      const rider = this.men[0];
      rider.pose = 'hold';
      rider.hold = 1;
      rider.stance = 12;
      // the curved surface, approximated by steps, is what a ragdoll lands on
      rider.boxes = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((i) => ({
        l: T + i * 66 - 33, r: T + i * 66 + 33, top: this.rampY(T + i * 66), bounce: 0.2,
      }));
    } else if (d.kind === 'ufo') {
      this.goals = [{ label: tx('Apple before abduction', 'Apel sebelum diculik'), done: false }];
    } else if (d.kind === 'bank') {
      this.men[0].boxes = [{ l: T + WALL.x0, r: T + WALL.x1, top: GROUND - WALL.h, bounce: 0.2 }];
    } else if (d.kind === 'wheel') {
      const joko = makeTarget(1, T, GROUND, 'hips');
      joko.stance = 6;
      this.men.push(joko);
      this.goals = [{ label: tx("Mr. Bejo's Apple", 'Apel Pak Bejo'), done: false }, { label: tx("Mas Joko's Apple", 'Apel Mas Joko'), done: false }];
      this.appleGoal = [0, 1];
    } else if (d.kind === 'boss') {
      this.men = [];
      this.goals = [{ label: tx('Defeat King Apple', 'Kalahkan Raja Apel'), done: false }];
      this.boss = {
        x: T, r: 80, hp: BOSS_HP, ph: 0, kb: 0, hop: 0, squash: 0, hurt: 0, dead: false, won: false, air: false, sticks: [],
      };
    }
    if (d.v?.jetpack && this.men[0]) {
      this.men[0].y = GROUND - 165;
      this.men[0].boxes = [
        { l: T - 52, r: T + 52, top: GROUND - 165, bounce: 0.2 },
        { l: T - 210, r: T - 190, top: GROUND - 260, bounce: 0.2 },
      ];
    }
    if (d.v?.ducks) this.ducks = this.makeDucks(d.v.ducks, d.v.dspeed ?? 1);
    this.jetH = 0;
    this.jetV = 0;
    this.plates = [];
    this.pt = { timer: 3.3, sent: 0, broken: 0, recoil: 0 };
    this.bullHits = [];
    this.foe = d.kind === 'rival' ? Game.newFoe() : null;
    this.eArrow = null;
    this.meStick = null;
    this.why = '';

    this.shots = [];
    this.thrown = [];
    this.parts = [];
    this.loose = [];
    this.drag = null;
    this.aimT = -0.1;
    this.pullT = 0;
    this.pullVel = 0;
    this.crossed = true;
    this.kickV = 0;
    this.recoilV = 0;
    this.strain = 0;
    this.result = null;
    this.resultT = 0;
    this.fired = 0;
    this.slowT = 0;
    this.shake = 0;
    this.timeScale = 1;
    this.pose = this.poseCurrent();
    this.updateLevel(0); // puts everybody where the level wants them
    this.pose = this.poseCurrent();
  }

  private poseCurrent(): ArcherPose {
    if (this.def.v?.ceiling) {
      return poseArcher({ ...this.a, aim: -this.a.aim, relAim: -this.a.relAim, kick: -this.a.kick });
    }
    return poseArcher(this.a);
  }

  private arrowOrigin(): { nock: V; angle: number } | null {
    const ar = this.pose.arrow;
    if (!ar) return null;
    if (this.def.v?.ceiling) {
      return { nock: v(ar.nock.x, 2 * GROUND - 380 - ar.nock.y), angle: -ar.angle };
    }
    return ar;
  }

  /** framing that shows the archer and everything the level needs */
  private home() {
    const d = this.def;
    const left = this.viewX - 135;
    const right = this.T + d.pad;
    // keep clear of the HUD: panels along the top, walk buttons and hint along the bottom
    const below = clamp(this.vh * 0.2, 100, 125);
    const above = clamp(this.vh * 0.09, 36, 56);
    const scale = Math.max(0.2, Math.min(this.vw / (right - left), (this.vh - below - above) / d.top));
    const free = Math.max(0, this.vh - below - above - d.top * scale);
    const floorPx = below + free * 0.45; // distance from the bottom edge up to the floor line
    return { x: (left + right) / 2, y: GROUND + (floorPx - this.vh / 2) / scale, scale };
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = Math.max(1, r.width);
    this.vh = Math.max(1, r.height);
    this.canvas.width = Math.round(this.vw * dpr);
    this.canvas.height = Math.round(this.vh * dpr);
    this.scale = this.home().scale;
  }

  private snapCamera() {
    const h = this.home();
    this.cam = { x: h.x, y: h.y, z: 1 };
  }

  // ---- input --------------------------------------------------------------
  private onDown = (e: PointerEvent) => {
    initAudio();
    const ph = this.a.phase;
    if (ph === 'idle') return this.setPhase('grab');
    if (this.result) return;
    if (ph === 'ready' || ph === 'nock' || ph === 'recover') {
      this.drag = { id: e.pointerId, ax: e.clientX, ay: e.clientY, cx: e.clientX, cy: e.clientY };
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nice-to-have */
      }
      e.preventDefault();
    }
  };
  // a second finger (holding a walk button) must never steer the aim
  private onMove = (e: PointerEvent) => {
    if (this.drag && e.pointerId === this.drag.id) {
      this.drag.cx = e.clientX;
      this.drag.cy = e.clientY;
    }
  };
  private onUp = (e?: PointerEvent) => {
    if (!this.drag || (e && e.pointerId !== this.drag.id)) return;
    this.drag = null;
    if (this.a.phase === 'ready' && this.a.pull > MAX_DRAW * 0.18) this.release();
    this.pullT = 0;
  };
  /** gesture cancelled: let the string down without shooting */
  private onCancel = (e?: PointerEvent) => {
    if (e && this.drag && e.pointerId !== this.drag.id) return;
    this.drag = null;
    this.pullT = 0;
  };
  private onBlur = () => {
    this.onCancel();
    this.keys.l = this.keys.r = false;
    this.moveBtn = 0;
  };
  private onKey = (e: KeyboardEvent) => {
    const down = e.type === 'keydown';
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') this.keys.l = down;
    else if (k === 'arrowright' || k === 'd') this.keys.r = down;
    else return;
    e.preventDefault();
  };

  private setPhase(p: ArcherPhase) {
    this.a.phase = p;
    this.a.t = 0;
  }

  /** the round is decided: celebrate / despair starting from wherever the bow is right now */
  private endRound(e0: number) {
    this.a.e0 = e0;
    this.setPhase(this.result === 'win' ? 'win' : 'lose');
  }

  private canMove() {
    const ph = this.a.phase;
    return !this.result && (ph === 'nock' || ph === 'ready' || ph === 'recover' || ph === 'release');
  }

  private release() {
    const a = this.a;
    this.pose = this.poseCurrent();
    const ar = this.arrowOrigin();
    if (!ar) return;
    const frac = clamp(a.pull / MAX_DRAW, 0, 1);
    const dir = fromAngle(ar.angle);
    this.shots.push({
      tip: add(ar.nock, mul(dir, ARROW_LEN * (a.gear ?? 1))), vel: add(mul(dir, speedOf(frac) * this.vv('power', 1)), v(this.vx, 0)), ang: ar.angle,
      t: 0, state: 'fly', embed: 0, apples: 0, stuckT: 0, spin: 0, grace: 0, ride: null,
    });
    a.relAim = a.aim;
    a.relPull = a.pull;
    a.quiver -= 1;
    this.fired++;
    this.pullVel = 0;
    this.crossed = false;
    this.kickV += 2.4 + 2.4 * frac; // the bow rolls forward in the relaxed hand
    this.recoilV -= 0.55 * frac;
    this.strain = 0;
    this.creak = 0;
    this.clicked = false;
    this.setPhase('release');
    if (this.def.kind === 'mini') this.miniOnRelease();
    this.burst(ar.nock, 5, ['#cdd2d9', '#e3e6ea'], 'drop', 70 + frac * 90);
    this.shake = Math.max(this.shake, 1.5 + frac * 2);
    sfx.twang(frac);
  }

  // ---- effects ------------------------------------------------------------
  private burst(p: V, n: number, colors: string[], kind: Particle['kind'], speed: number) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.parts.push({
        p: { ...p }, vel: v(Math.cos(ang) * sp, Math.sin(ang) * sp - speed * 0.35), life: 0,
        max: 0.5 + Math.random() * 0.5, size: kind === 'star' ? 6 + Math.random() * 4 : 2 + Math.random() * 3.5,
        color: colors[i % colors.length], kind, rot: ang, vr: (Math.random() - 0.5) * 12,
      });
    }
  }
  private dust(x: number, n = 7, speed = 130) {
    this.burst(v(x, GROUND - 2), n, ['#c9ced6', '#e3e6ea', '#d5d9e0'], 'drop', speed);
  }
  private popText(p: V, text: string, color: string, size = 34) {
    this.parts.push({ p: { ...p }, vel: v(0, -46), life: 0, max: 1.5, size, color, kind: 'text', rot: 0, vr: 0, text });
  }
  private finish(r: 'win' | 'lose' | 'out') {
    if (this.result) return;
    this.result = r;
    this.resultT = 0;
  }
  private mark(i: number) {
    if (this.goals[i]) this.goals[i].done = true;
    if (this.goals.every((g) => g.done)) {
      for (const m of this.men) if (!m.rag) m.mood = 'approve';
      this.finish('win');
    }
  }

  /**
   * An arrow keeps flying after it skewers an apple, so one shot can collect several.
   * Only the apple that completes the level takes the speed out of it, so the loaded
   * arrow drops close by where you can admire it.
   */
  private appleFx(s: Shot, at: V, label = true) {
    s.apples++;
    s.grace = 46; // the whole apple counts: grazing its edge must not also clip the head under it
    const final = this.result === 'win';
    s.vel = final ? add(mul(s.vel, 0.45), v(0, -70)) : mul(s.vel, 0.92);
    this.slowT = final ? 0.42 : 0.22;
    this.shake = 7;
    this.burst(at, 16, ['#fff3c4', '#ffd76a', '#e3262d', '#fff'], 'drop', 300);
    this.burst(at, 5, ['#ffd23f', '#ff9f1c'], 'star', 240);
    if (label) this.popText(add(at, v(0, -48)), [tx('HIT!', 'KENA!'), tx('DOUBLE!', 'DOBEL!'), tx('TRIPLE!', 'TRIPEL!')][Math.min(2, s.apples - 1)], '#16a34a');
    sfx.crunch();
  }

  /** velocity a man currently has (so a ragdoll keeps it) */
  private bodyVel(i: number): V {
    const k = this.def.kind;
    const extra = this.bodyVel2(i);
    if (extra) return extra;
    if (k === 'trampoline') return v(0, this.tr.vy);
    if (k === 'seesaw' && this.sw.man === 'air') return { ...this.sw.mv };
    if (k === 'stack' && i === 1 && this.st.mode === 'fall') return v(0, this.st.vy);
    return v(0, 0);
  }

  private dropApple(m: TargetState, vel: V) {
    if (!m.hasApple) return;
    this.loose.push({ kind: 'apple', p: applePos(m), vel, rot: 0, vr: 6 });
    m.hasApple = false;
  }

  private hitMan(i: number, hit: Hit, s: Shot) {
    const m = this.men[i];
    const tip = s.tip;
    const bv = this.bodyVel(i);
    this.dropApple(m, v(s.vel.x * 0.08 + 40 + bv.x, -260 + bv.y * 0.5));
    const hadGlasses = m.glasses;
    strike(m, hit, add(tip, fromAngle(s.ang, 10)), s.ang, s.vel, bv);
    if (hit.part === 'head' && hadGlasses) {
      const h = headPos(m);
      this.loose.push({ kind: 'glasses', p: v(h.x - 10, h.y - 3), vel: v(s.vel.x * 0.16 - 60, -300 + bv.y * 0.5), rot: 0, vr: -14 });
    }
    for (const o of this.men) if (o !== m) o.brow = 1;
    this.slowT = 0.38;
    this.shake = 12;
    this.burst(tip, 9, ['#ffd23f', '#ff9f1c', '#fff'], 'star', 300);
    this.popText(add(headPos(m), v(0, -74)), tx('OUCH!', 'ADUH!'), '#dc2626');
    this.popText(add(tip, v(-10, -30)), partLabel(hit.part), '#f97316', 22);
    sfx.ouch();
    this.why = 'man';
    this.finish('lose');
    this.shots.splice(this.shots.indexOf(s), 1);
  }

  private dropWeight(at: V) {
    const sw = this.sw;
    sw.hung = false;
    sw.snapT = 0;
    this.slowT = 0.22;
    this.shake = Math.max(this.shake, 5);
    this.burst(at, 8, ['#8a6a3c', '#c9a86a', '#fff'], 'drop', 160);
    this.popText(v(this.wx, sw.wy - WEIGHT.h - 70), tx('SNAPPED!', 'PUTUS!'), '#f97316', 28);
    sfx.snap();
    this.mark(0);
  }

  /** the point on the archer that plates and the rival's arrow home in on */
  private chest(): V {
    return lerpV(this.pose.hip, this.pose.neck, 0.7);
  }

  private glassBurst(at: V, n: number, speed: number) {
    this.burst(at, n, ['#38bdf8', '#7dd3fc', '#bae6fd', '#0ea5e9'], 'drop', speed);
    this.burst(at, Math.ceil(n / 4), ['#bae6fd', '#ffffff'], 'star', speed * 0.8);
  }

  /** something reached the archer: he staggers and the round is lost */
  private hurtMe(why: string, at: V) {
    this.why = why;
    this.recoilV -= 3.2;
    this.shake = 13;
    this.slowT = 0.3;
    this.burst(at, 8, ['#ffd23f', '#ff9f1c', '#fff'], 'star', 280);
    this.popText(add(this.pose.headC, v(0, -70)), tx('OUCH!', 'ADUH!'), '#dc2626');
    sfx.ouch();
    this.finish('lose');
  }

  private breakPlate(pl: Plate) {
    const pt = this.pt;
    this.plates.splice(this.plates.indexOf(pl), 1);
    pt.broken++;
    pt.timer = 1.0;
    this.mark(pt.broken - 1);
    this.slowT = this.result === 'win' ? 0.42 : 0.24;
    this.shake = 8;
    this.glassBurst(pl.p, 26, 330);
    this.popText(add(pl.p, v(0, -50)), tx('CRASH!', 'PRANG!'), '#0ea5e9');
    sfx.shatter();
  }

  /** level 8: the arrow lodges in the target face; only the gold centre counts */
  private hitBoard(s: Shot) {
    const at = { ...s.tip };
    const off = Math.abs(at.y - (GROUND - BOARD_H));
    s.tip = add(s.tip, fromAngle(s.ang, 9));
    s.state = 'stuck';
    s.embed = 12;
    this.shake = Math.max(this.shake, 4);
    sfx.thunk();
    if (this.result) return;
    if (off < BOARD.bull) {
      const first = this.bullHits.length === 0;
      const robin = !first && Math.abs(at.y - this.bullHits[0]) < 3.5;
      this.bullHits.push(at.y);
      this.mark(this.bullHits.length - 1);
      this.slowT = first ? 0.24 : 0.42;
      this.shake = 8;
      this.burst(at, 10, ['#ffd23f', '#ff9f1c', '#fff'], 'star', 260);
      this.popText(add(at, v(-30, -62)), first ? tx('BULLSEYE!', 'TENGAH!') : robin ? 'ROBIN HOOD!' : tx('DOUBLE!', 'DUA KALI!'), '#16a34a');
      sfx.crunch();
    } else {
      const score = off < BOARD.r * 0.4 ? 8 : off < BOARD.r * 0.6 ? 6 : off < BOARD.r * 0.8 ? 4 : 2;
      this.popText(add(at, v(-34, -40)), tx(`${score} · off center`, `${score} · kurang tengah`), '#6b7280', 22);
    }
  }

  /** the rival's body parts in world space: [from, to, radius] */
  private foeSegs(): [V, V, number][] {
    const P = this.foe!.pose;
    const T = this.T;
    const w = (p: V) => v(T - p.x, p.y);
    const raw: [V, V, number][] = [
      [P.neck, P.headC, 17], [P.hip, P.neck, 13], [P.hip, P.legB.mid, 10], [P.legB.mid, P.ankB, 8],
      [P.hip, P.legF.mid, 10], [P.legF.mid, P.ankF, 8], [P.Sf, P.fa.mid, 6.5], [P.fa.mid, P.fa.end, 6],
      [P.Sr, P.ra.mid, 6.5], [P.ra.mid, P.ra.end, 6],
    ];
    return raw.map(([p0, p1, r]) => [w(p0), w(p1), r]);
  }

  private hitFoe(s: Shot, seg: number) {
    const f = this.foe!;
    const a2 = f.a;
    const deep = add(s.tip, fromAngle(s.ang, 10));
    f.stick = { p: v(this.T - deep.x, deep.y), ang: Math.PI - s.ang };
    const blank = { t: 0, embed: 0, apples: 0, stuckT: 0, grace: 0, ride: null };
    if (f.pose.arrow) {
      // the arrow he was about to send tumbles out of his hand
      const ar = f.pose.arrow;
      const mid = add(ar.nock, fromAngle(ar.angle, ARROW_LEN / 2));
      this.shots.push({ ...blank, tip: v(this.T - mid.x, mid.y), vel: v(70, -210), ang: Math.PI - ar.angle, state: 'bounce', spin: 8 });
    }
    if (this.eArrow) {
      // he had only just let go: with the round decided, his arrow sails wide
      const e = this.eArrow;
      this.shots.push({ ...blank, tip: { ...e.p }, vel: add(fromAngle(e.ang, 1500), v(0, -330)), ang: e.ang, state: 'fly', spin: 0 });
      this.eArrow = null;
    }
    a2.relAim = a2.aim;
    a2.relPull = a2.pull;
    a2.pull = 0;
    a2.vib = 0;
    a2.phase = 'lose';
    a2.t = 0;
    a2.e0 = 0;
    f.state = 'down';
    f.fallV = 1.7;
    f.danger = 0;
    this.slowT = 0.42;
    this.shake = 12;
    this.burst(s.tip, 9, ['#ffd23f', '#ff9f1c', '#fff'], 'star', 300);
    this.popText(add(s.tip, v(0, -84)), tx('GOT HIM!', 'KENA!'), '#16a34a');
    this.popText(add(s.tip, v(-10, -38)), seg === 0 ? tx('HEAD!', 'KEPALA!') : seg === 1 ? tx('BODY!', 'BADAN!') : seg < 6 ? tx('LEG!', 'KAKI!') : tx('ARM!', 'TANGAN!'), '#f97316', 22);
    sfx.ouch();
    this.mark(0);
    this.shots.splice(this.shots.indexOf(s), 1);
  }

  // ---- levels 10-16 ---------------------------------------------------------
  private rampTheta() {
    return RAMP_MAX * Math.sin(RAMP_W * this.rampT);
  }
  private rampC(): V {
    return v(this.T, GROUND - RAMP_R - 12);
  }
  /** y of the halfpipe surface under x */
  private rampY(x: number) {
    const dx = x - this.T;
    return GROUND - RAMP_R - 12 + Math.sqrt(Math.max(0, RAMP_R * RAMP_R - dx * dx));
  }
  private steel() {
    const c = v(this.T + STEEL.x, GROUND + STEEL.y);
    const n = fromAngle(this.steelAng + this.vv('swing', 0) * Math.sin(this.a.time * 1.6));
    const t = v(-n.y, n.x);
    return { c, n, a: sub(c, mul(t, STEEL.half)), b: add(c, mul(t, STEEL.half)) };
  }
  private wheelC(): V {
    return v(this.T + WHEEL.dx, GROUND - WHEEL.h);
  }
  private pivot(slot: number): V {
    return add(this.wheelC(), fromAngle(this.wheelA + (slot * Math.PI) / 3, WHEEL.r));
  }
  private balloonKnot(): V {
    const m = this.men[0];
    return this.bl.free ?? v(m.x + 10, m.y - 138);
  }
  private balloonAt(i: number): V {
    const k = this.balloonKnot();
    return v(k.x + BALLOON_OFF[i].x + Math.sin(this.a.time * 1.3 + i * 2.1) * 5, k.y + BALLOON_OFF[i].y);
  }
  private bossC(): V {
    const b = this.boss!;
    return v(b.x, GROUND - b.r * (1 - 0.18 * b.squash) - b.hop);
  }

  private bodyVel2(i: number): V | null {
    const k = this.def.kind;
    if (k === 'moon') return v(0, this.hopV);
    if (k === 'balloon') return v(0, -this.bl.vh);
    if (k === 'ramp') {
      const th = this.rampTheta();
      const w = RAMP_MAX * RAMP_W * Math.cos(RAMP_W * this.rampT) * RAMP_R;
      return v(Math.cos(th) * w, -Math.sin(th) * w);
    }
    if (k === 'wheel') {
      const a = this.wheelA + i * Math.PI;
      return mul(v(-Math.sin(a), Math.cos(a)), WHEEL.w * WHEEL.r);
    }
    return null;
  }

  private updateLevel2(dt: number): boolean {
    if (this.updateLevel3(dt)) return true;
    const k = this.def.kind;
    const m = this.men[0];
    const started = this.a.phase !== 'idle';
    if (k === 'balloon') {
      const b = this.bl;
      const n = b.alive.filter(Boolean).length;
      if (b.free) b.free = v(b.free.x + 14 * dt, b.free.y - 80 * dt);
      if (m.rag) {
        if (!b.free) b.free = v(m.x + 10, m.y - 138); // the balloons drift off on their own
        return true;
      }
      if (b.gone) b.vh += 420 * dt;
      else if (n === 0) b.vh -= 900 * dt;
      else {
        // three balloons lift him, two barely, one lets him sink
        const hurry = this.a.quiver === 0 && this.a.phase !== 'ready' ? 4 : 1; // nothing left to shoot: do not make them wait
        b.vh = damp(b.vh, started && !this.result ? (n - 1.5) * 16 * hurry : 0, 2.5, dt);
      }
      b.h += b.vh * dt;
      if (b.h <= 0 && b.vh <= 0) {
        if (!b.landed && b.vh < -80) {
          m.dipV += Math.min(950, -b.vh * 2);
          this.dust(m.x, 8, 140);
          this.shake = Math.max(this.shake, 4);
          sfx.hup();
        }
        b.landed = true;
        b.h = 0;
        b.vh = 0;
      } else if (b.h > 4) b.landed = false;
      const float = clamp(b.h / 12, 0, 1);
      m.x = this.T + float * Math.sin(this.a.time * 0.9) * this.vv('drift', 5);
      m.y = GROUND - b.h - float * (3 + 3 * Math.sin(this.a.time * 1.7));
      m.air = damp(m.air, float, 12, dt);
      if (!b.gone && !this.result && b.h > FLY_AWAY) {
        b.gone = true;
        this.why = 'fly';
        this.popText(v(m.x - 80, m.y - 240), tx('BYE-BYE!', 'DADAH!'), '#f97316', 30);
        sfx.boing();
        this.finish('lose');
      }
      return true;
    }
    if (k === 'ducks') {
      for (const dk of this.ducks) {
        if (dk.hit) {
          // startled, not hurt: it flaps away in a huff
          dk.vel.y -= 300 * dt;
          dk.p = add(dk.p, mul(dk.vel, dt));
          dk.rot += 9 * dt;
          continue;
        }
        dk.ph += dt;
        dk.x += dk.dir * dk.sp * dt;
        if (dk.x > this.T - 150) {
          dk.x = this.T - 150;
          dk.dir = -1;
        } else if (dk.x < this.T - 520) {
          dk.x = this.T - 520;
          dk.dir = 1;
        }
        dk.p = v(dk.x, dk.base + 68 * Math.sin(dk.ph * 2.9));
      }
      return true;
    }
    if (k === 'ramp') {
      this.rampT += dt * this.vv('speed', 1);
      if (!m.rag) {
        // a pendulum on the inside of a circle: he always stands square to the surface
        const th = this.rampTheta();
        const c = this.rampC();
        m.tilt = -th;
        m.x = c.x + Math.sin(th) * (RAMP_R - 11.5);
        m.y = c.y + Math.cos(th) * (RAMP_R - 11.5);
      }
      return true;
    }
    if (k === 'ufo') {
      const u = this.ufo;
      u.flash = damp(u.flash, 0, 7, dt);
      const home = v(this.T + Math.sin(this.a.time * 1.1) * 10, GROUND - UFO_H + Math.sin(this.a.time * 1.9) * 5);
      if (u.state === 'idle') {
        if (started) {
          u.state = 'come';
          u.t = 0;
        }
      } else if (u.state === 'come') {
        u.t += dt;
        u.p = v(home.x, lerp(GROUND - 1200, home.y, ease.out(clamp(u.t / 1.3, 0, 1))));
        if (u.t >= 1.5) {
          if (!m.rag && m.hasApple && !this.result) {
            u.state = 'beam';
            u.t = 0;
            u.from = applePos(m);
            u.apple = { ...u.from };
            m.hasApple = false;
            sfx.beam();
          } else {
            u.state = 'gone';
            u.vel = v(140, -220);
          }
        }
      } else if (u.state === 'beam') {
        u.t += dt * this.vv('speed', 1);
        u.p = home;
        m.brow = Math.max(m.brow, 0.8);
        const e = Math.pow(clamp(u.t / UFO_TIME, 0, 1), 1.5); // slow at first, then faster and faster
        if (u.apple) {
          u.apple = v(u.from.x + Math.sin(u.t * 3.3) * 8 * Math.min(1, e * 4), lerp(u.from.y, u.p.y + 34, e));
          if (e >= 1) {
            u.apple = null;
            u.state = 'gone';
            u.vel = v(240, -460);
            if (!this.result) {
              this.why = 'ufo';
              this.popText(add(u.p, v(-20, -80)), tx('ABDUCTED!', 'DICULIK!'), '#16a34a', 30);
              sfx.beam();
              this.finish('lose');
            }
          }
        }
      } else {
        u.vel = mul(u.vel, 1 + 1.5 * dt);
        u.p = add(u.p, mul(u.vel, dt));
      }
      return true;
    }
    if (k === 'bank') {
      this.steelFlash = damp(this.steelFlash, 0, 6, dt);
      return true;
    }
    if (k === 'wheel') {
      this.wheelA += WHEEL.w * dt * this.vv('speed', 1);
      this.men.forEach((man, i) => {
        if (man.rag) return;
        const p = this.pivot(i * 3); // opposite seats
        man.x = p.x;
        man.y = p.y + WHEEL.drop;
      });
      return true;
    }
    if (k === 'boss' && this.boss) {
      const b = this.boss;
      b.hurt = Math.max(0, b.hurt - dt);
      if (b.dead) return true;
      const moving = started && !this.result && this.a.phase !== 'grab';
      const period = (0.95 - 0.04 * (BOSS_HP - b.hp)) / this.vv('bspeed', 1); // angrier = faster
      const airFrac = 0.62;
      b.ph = (b.ph + dt / period) % 1;
      const inAir = b.ph < airFrac;
      b.hop = inAir ? Math.sin((Math.PI * b.ph) / airFrac) * (moving || b.won ? 58 : 22) : 0;
      b.squash = inAir ? 0 : Math.sin((Math.PI * (b.ph - airFrac)) / (1 - airFrac));
      if (moving && inAir) b.x -= (66 / (airFrac * period)) * dt;
      if (b.air && !inAir && dt > 0 && (moving || b.won)) {
        this.shake = Math.max(this.shake, 2.5);
        this.dust(b.x, 5, 110);
        sfx.step();
      }
      b.air = inAir;
      b.x += b.kb * dt;
      b.kb = damp(b.kb, 0, 6, dt);
      if (moving && b.x - b.r * 0.9 < this.a.x + 36) {
        b.won = true;
        this.hurtMe('boss', this.chest());
      }
      return true;
    }
    return false;
  }

  /** collisions of levels 10-16. null = nothing special, carry on with the usual checks */
  private collide2(s: Shot): boolean | null {
    if (this.def.kind !== 'ducks' && this.ducks.length && this.ducksHit(s)) return true;
    const r3 = this.collide3(s);
    if (r3 !== null) return r3;
    const k = this.def.kind;
    const tip = s.tip;
    const dir = fromAngle(s.ang);
    const stick = () => {
      s.tip = add(tip, mul(dir, 8));
      s.state = 'stuck';
      s.embed = 11;
      this.shake = Math.max(this.shake, 3);
      sfx.thunk();
      return true;
    };
    const glance = () => {
      // the arrow loses its way and tumbles to the floor (here `tip` becomes the middle of the shaft)
      s.state = 'bounce';
      s.tip = sub(tip, mul(dir, ARROW_LEN / 2));
      s.vel = v(-s.vel.x * 0.16, s.vel.y * 0.25 - 90);
      s.spin = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5);
      return true;
    };
    if (k === 'balloon') {
      const b = this.bl;
      for (let i = 0; i < 3; i++) {
        if (!b.alive[i]) continue;
        const c = this.balloonAt(i);
        if (Math.hypot(tip.x - c.x, (tip.y - c.y) / 1.18) < BALLOON_R + 2) {
          b.alive[i] = false;
          b.vh -= 26;
          this.burst(c, 12, [BALLOON_COL[i], '#ffffff'], 'drop', 260);
          this.popText(add(c, v(0, -44)), tx('POP!', 'DOR!'), BALLOON_COL[i], 28);
          this.shake = Math.max(this.shake, 4);
          sfx.pop();
        }
      }
      return null; // the arrow flies on
    }
    if (k === 'ducks') {
      if (this.result) return null;
      for (const dk of this.ducks) {
        if (!dk.hit && dist(tip, dk.p) < 17) {
          dk.hit = true;
          dk.vel = v(170 * (Math.random() < 0.5 ? -1 : 1), -140);
          this.burst(dk.p, 16, ['#fcd34d', '#fde68a', '#f5b921'], 'drop', 240);
          this.popText(add(dk.p, v(0, -44)), tx('QUACK!', 'KWEK!'), '#f59e0b', 32);
          this.why = 'duck';
          this.shake = 9;
          this.slowT = 0.3;
          sfx.quack();
          for (const man of this.men) man.brow = 1;
          this.finish('lose');
          return glance();
        }
      }
      return null;
    }
    if (k === 'ramp') {
      const dx = Math.abs(tip.x - this.T);
      const lipX = RAMP_R * Math.sin(RAMP_LIP);
      if (tip.y < GROUND && ((dx < lipX && tip.y > this.rampY(tip.x)) || (dx >= lipX && dx < lipX + 26 && tip.y > this.rampY(this.T + lipX)))) {
        return stick();
      }
      return null;
    }
    if (k === 'ufo') {
      const u = this.ufo;
      if (u.apple && !this.result && dist(tip, u.apple) < APPLE_R + 5) {
        const at = { ...u.apple };
        u.apple = null;
        u.state = 'gone';
        u.vel = v(150, -210);
        u.flash = 1;
        this.mark(0);
        this.appleFx(s, at);
        return false;
      }
      if (Math.hypot((tip.x - u.p.x) / 98, (tip.y - u.p.y) / 24) < 1 || dist(tip, v(u.p.x, u.p.y - 10)) < 36) {
        u.flash = 1;
        this.burst(tip, 6, ['#bae6fd', '#cbd5e1', '#86efac'], 'drop', 170);
        if (!this.result) this.popText(add(tip, v(-30, -34)), tx('CLANG!', 'TING!'), '#0ea5e9', 26);
        sfx.ting();
        return glance();
      }
      return null;
    }
    if (k === 'bank') {
      const T = this.T;
      if (tip.x > T + WALL.x0 && tip.x < T + WALL.x1 && tip.y > GROUND - WALL.h && tip.y < GROUND) {
        if (!this.result && !s.apples) this.popText(add(tip, v(-36, -30)), tx('THUNK!', 'TOK!'), '#8a5a2e', 24);
        return stick();
      }
      const st = this.steel();
      if (segDist(tip, st.a, st.b).d < 4.5) {
        // mirror the velocity in the plate, losing a little speed
        let n = st.n;
        let vn = s.vel.x * n.x + s.vel.y * n.y;
        if (vn > 0) {
          n = mul(n, -1);
          vn = -vn;
        }
        s.vel = mul(sub(s.vel, mul(n, 2 * vn)), 0.72);
        s.tip = add(tip, mul(n, 6));
        s.ang = Math.atan2(s.vel.y, s.vel.x);
        s.t = 0; // the shaft wobbles afresh
        this.steelFlash = 1;
        this.burst(tip, 7, ['#fde68a', '#cbd5e1', '#f59e0b'], 'star', 200);
        if (!this.result) this.popText(add(tip, v(26, -44)), tx('CLANG!', 'TING!'), '#6b7280', 26);
        this.shake = Math.max(this.shake, 4);
        sfx.ting();
        return false;
      }
      return null;
    }
    if (k === 'boss' && this.boss && !this.boss.dead && !this.result) {
      const b = this.boss;
      const c = this.bossC();
      if (dist(tip, c) < b.r * 0.97) {
        b.hp--;
        b.kb = this.vv('kb', 560); // every arrow shoves him back
        b.hurt = 0.3;
        b.sticks.push({ d: sub(add(tip, mul(dir, 14)), c), ang: s.ang });
        b.r -= 4;
        this.burst(tip, 12, ['#e3262d', '#fff3c4', '#ffd76a'], 'drop', 280);
        this.shake = Math.max(this.shake, 7);
        this.slowT = Math.max(this.slowT, 0.05);
        this.shots.splice(this.shots.indexOf(s), 1);
        if (b.hp <= 0) {
          b.dead = true;
          for (let i = 0; i < 16; i++) {
            this.loose.push({
              kind: 'apple', p: add(c, v((Math.random() - 0.5) * b.r, (Math.random() - 0.5) * b.r)),
              vel: v((Math.random() - 0.5) * 760, -180 - Math.random() * 560), rot: 0, vr: (Math.random() - 0.5) * 16,
            });
          }
          this.burst(c, 30, ['#e3262d', '#fff3c4', '#ffd76a', '#4fae35'], 'drop', 460);
          this.burst(c, 10, ['#ffd23f', '#ff9f1c'], 'star', 380);
          this.popText(add(c, v(0, -b.r - 40)), tx('KO!', 'TUMBANG!'), '#16a34a', 40);
          this.shake = 16;
          this.slowT = 0.45;
          sfx.crunch();
          this.mark(0);
        } else {
          this.popText(add(c, v(0, -b.r - 62)), [tx('OW!', 'AW!'), tx('HEY!', 'HEI!'), tx('OUCH!', 'ADUH!'), tx('HURTS!', 'SAKIT!'), tx('MERCY!', 'AMPUN!')][BOSS_HP - b.hp - 1] ?? tx('OW!', 'AW!'), '#b3141f', 26);
          sfx.thunk();
        }
        return true;
      }
    }
    return null;
  }

  /** props of levels 10-16 that sit behind the people */
  private drawBack2() {
    this.drawBack3();
    const ctx = this.ctx;
    const k = this.def.kind;
    const T = this.T;
    if (k === 'balloon') {
      const knot = this.balloonKnot();
      for (let i = 0; i < 3; i++) {
        if (!this.bl.alive[i]) continue;
        const c = this.balloonAt(i);
        stroke(ctx, [knot, v(c.x, c.y + BALLOON_R * 1.18 + 4)], '#9aa3ad', 1.4);
        drawBalloon(ctx, c, BALLOON_R, BALLOON_COL[i]);
      }
    } else if (k === 'ramp') {
      groundShadow(ctx, T, GROUND, 330, 0.08);
      drawRamp(ctx, T, GROUND, RAMP_R, RAMP_LIP);
    } else if (k === 'ufo') {
      const u = this.ufo;
      if (u.state === 'beam') drawBeam(ctx, v(u.p.x, u.p.y + 16), GROUND, 0.2 + 0.05 * Math.sin(this.a.time * 9));
    } else if (k === 'wheel') {
      groundShadow(ctx, T + WHEEL.dx, GROUND, 150, 0.1);
      drawFerris(ctx, this.wheelC(), WHEEL.r, this.wheelA, GROUND, WHEEL.drop);
    } else if (k === 'bank') {
      const st = this.steel();
      const m = this.men[0];
      groundShadow(ctx, T + 214, GROUND, 40, 0.1);
      drawSteel(ctx, st.a, st.b, st.n, v(T + 214, GROUND), this.steelFlash);
      if (m.hasApple && !m.rag && !this.result) {
        // hint: where a bounce is supposed to go
        const ap = applePos(m);
        ctx.fillStyle = 'rgba(107,114,128,0.4)';
        for (let i = 1; i < 7; i++) {
          const q = lerpV(st.c, ap, i / 7.6);
          ctx.beginPath();
          ctx.arc(q.x, q.y, 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (this.def.v?.jetpack) {
      drawWoodWall(ctx, T - 52, T + 52, GROUND, 165);
      drawWoodWall(ctx, T - 210, T - 190, GROUND, 260);
    }
    if (this.def.v?.ceiling) {
      const cy = GROUND - 380;
      ctx.fillStyle = '#334155';
      ctx.fillRect(-400, cy - 18, T + 900, 18);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-400, cy - 3, T + 900, 3);
      for (let x = -200; x < T + 400; x += 110) {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(x, cy - 16, 42, 10);
      }
    }
  }

  /** props of levels 10-16 that sit in front of the people */
  private drawFront2() {
    this.drawFront3();
    if (this.def.kind !== 'ducks') for (const dk of this.ducks) drawDuck(this.ctx, dk.p, dk.dir, 0.2 + 0.8 * Math.sin(this.a.time * 19 + dk.ph), dk.hit ? dk.rot : 0);
    const ctx = this.ctx;
    const k = this.def.kind;
    const T = this.T;
    const time = this.a.time;
    if (k === 'ramp') {
      // the board keeps rolling even after its rider has left it
      const th = this.rampTheta();
      const c = this.rampC();
      drawSkate(ctx, v(c.x + Math.sin(th) * RAMP_R, c.y + Math.cos(th) * RAMP_R), -th);
    } else if (k === 'ducks') {
      for (const dk of this.ducks) drawDuck(ctx, dk.p, dk.dir, 0.2 + 0.8 * Math.sin(time * 19 + dk.ph), dk.hit ? dk.rot : 0);
    } else if (k === 'ufo') {
      const u = this.ufo;
      if (u.apple) drawApple(ctx, u.apple, APPLE_R, u.t * 1.4);
      if (u.state !== 'idle') drawUfo(ctx, u.p, Math.sin(time * 2.3) * 0.05 + (u.state === 'gone' ? 0.25 : 0), u.flash, time, u.state === 'beam');
    } else if (k === 'bank') {
      drawWoodWall(ctx, T + WALL.x0, T + WALL.x1, GROUND, WALL.h);
    } else if (k === 'boss' && this.boss && !this.boss.dead) {
      const b = this.boss;
      const c = this.bossC();
      groundShadow(ctx, b.x, GROUND, b.r * 1.3 * (1 - b.hop / 220), 0.16);
      drawBoss(ctx, c, b.r, 1 + 0.13 * b.squash, 1 - 0.18 * b.squash, b.hurt > 0, b.hop > 10);
      for (const st of b.sticks) drawArrow(ctx, sub(add(c, st.d), fromAngle(st.ang, ARROW_LEN)), st.ang, { embed: 16 });
      for (let i = 0; i < BOSS_HP; i++) {
        ctx.fillStyle = i < b.hp ? '#e3262d' : '#e5e7eb';
        ctx.beginPath();
        ctx.roundRect(b.x - BOSS_HP * 8.5 + i * 17, c.y - b.r * 1.62 - 22, 13, 7, 3.5);
        ctx.fill();
      }
    }
  }

  // ---- levels 17-20 ---------------------------------------------------------
  /** levels where the apple is reached from behind a wall */
  private backShot() {
    const k = this.def.kind;
    return k === 'bank' || k === 'portal' || !!this.lab?.back || this.mini === 'boomerang';
  }
  private magOn() {
    return this.lt % (MAG.on + MAG.off) < MAG.on;
  }
  /** the point between the magnet's poles */
  private magA(): V {
    return v(this.T + MAG.dx, GROUND - MAG.h);
  }
  /** acceleration acting on a flying arrow at p */
  private field(p: V): V {
    let ax = 0;
    let ay = GRAV * this.gk;
    if (this.def.kind === 'magnet' && this.magOn()) {
      const a = this.magA();
      const dx = a.x - p.x;
      const dy = a.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 1 && d < MAG.reach) {
        const f = Math.min(MAG.max, MAG.k / (d * d)) * clamp((MAG.reach - d) / 60, 0, 1);
        ax += (f * dx) / d;
        ay += (f * dy) / d;
      }
    }
    if (this.mini === 'boomerang') {
      ax -= 1480;
    } else if (this.mini === 'tornado' && this.mg.tx !== undefined) {
      ax -= 240;
      const dx = p.x - this.mg.tx;
      if (Math.abs(dx) < 96) {
        const k = 1 - Math.abs(dx) / 96;
        ay -= 1780 * k;
        ax -= 220 * k;
      }
    } else if (this.def.kind === 'mini') {
      const f = field5(this.host, p);
      if (f) { ax += f.x; ay += f.y; }
    }
    if (this.lab) {
      const f = this.labField(p);
      ax += f.x;
      ay += f.y;
    }
    return v(ax, ay);
  }
  /** where an arrow released at `tip` with `vel` is after t seconds – drives the dotted aim guide */
  private guideAt(tip: V, vel: V, t: number): V {
    const L = this.lab;
    if (
      this.def.kind !== 'magnet' &&
      this.mini !== 'boomerang' &&
      this.mini !== 'tornado' &&
      !hasField5(this.mini) &&
      !(L && (L.mags || L.warp || L.wind))
    ) {
      return v(tip.x + vel.x * t, tip.y + vel.y * t + 0.5 * GRAV * this.gk * t * t);
    }
    let p = { ...tip };
    let w = { ...vel };
    const n = Math.max(1, Math.ceil(t / 0.006));
    const h = t / n;
    for (let i = 0; i < n; i++) {
      const f = this.field(p);
      w = v(w.x + f.x * h, w.y + f.y * h);
      const q = v(p.x + w.x * h, p.y + w.y * h);
      const tp = L?.warp ? this.warp(p, q, w) : null;
      if (tp) {
        p = tp.p;
        w = tp.v;
      } else p = q;
      // the guide ends where a black hole would swallow the arrow
      for (const mg of L?.mags ?? []) if (mg.hole && dist(p, this.magAt(mg)) < 27) return this.magAt(mg);
    }
    return p;
  }
  /** [blue, orange] portal centres – the blue one bobs up and down */
  private portals(): [V, V] {
    return [
      v(this.T + PORTAL.ax, GROUND - PORTAL.h + PORTAL.bob * Math.sin(this.lt * PORTAL.w)),
      v(this.T + PORTAL.bx, GROUND - PORTAL.h),
    ];
  }

  private reset3() {
    const d = this.def;
    const T = this.T;
    this.gk = d.kind === 'moon' ? 1 / 6 : d.lab?.g ?? 1;
    setRagGravity(1500 * Math.abs(this.gk));
    this.lt = 0;
    this.hov = 0;
    this.hopT = 0.9;
    this.hopV = 0;
    this.magWas = true;
    this.portFlash = [0, 0];
    this.rain = [];
    this.rainN = 0;
    this.rainT = RAIN_TIME;
    this.rainSpawn = 0.2;
    this.starOv = 0;
    if (d.kind === 'moon') {
      this.men[0].pose = 'hold';
      this.men[0].hold = 1;
    } else if (d.kind === 'portal') {
      this.men[0].boxes = [{ l: T + WALL.x0, r: T + WALL.x1, top: GROUND - WALL.h, bounce: 0.2 }];
    } else if (d.kind === 'rain') {
      this.men.push(makeTarget(1, T + 96, GROUND, 'hips'));
      for (const m of this.men) m.hasApple = false;
      this.goals = [{ label: tx(`Apple kebabs 0/${RAIN_NEED}`, `Sate apel 0/${RAIN_NEED}`), done: false }];
      this.appleGoal = [0, 0];
    }
    if (d.lab) this.resetLab();
    if (d.kind === 'mini') this.resetMini();
  }

  private updateLevel3(dt: number): boolean {
    if (this.def.kind === 'mini') {
      this.lt += dt;
      this.updateMini(dt);
      return true;
    }
    if (this.lab) {
      this.lt += dt;
      this.updateLab(dt);
      return true;
    }
    const k = this.def.kind;
    if (k !== 'moon' && k !== 'magnet' && k !== 'portal' && k !== 'rain') return false;
    const m = this.men[0];
    const started = this.a.phase !== 'idle';
    this.lt += dt;
    if (k === 'moon') {
      if (!m.rag) {
        // long, slow hops: ballistic flight in one sixth of the gravity, then a soft squat
        const ta = (2 * MOON.v0) / MOON.g;
        const before = this.hopT;
        this.hopT = (this.hopT + dt) % (ta + MOON.tc);
        const t = this.hopT;
        if (t < ta) {
          m.y = GROUND - (MOON.v0 * t - 0.5 * MOON.g * t * t);
          this.hopV = MOON.g * t - MOON.v0;
          m.dipT = 5;
        } else {
          m.y = GROUND;
          this.hopV = 0;
          m.dipT = 26 * Math.sin((Math.PI * (t - ta)) / MOON.tc);
          if (before < ta && dt > 0) {
            this.dust(m.x, 6, 70);
            sfx.step();
          }
        }
        m.air = damp(m.air, t < ta ? 1 : 0, 10, dt);
      }
      return true;
    }
    if (k === 'magnet') {
      const on = this.magOn();
      if (on !== this.magWas) {
        this.magWas = on;
        if (on) sfx.zap();
        else {
          // power off: whatever it caught clatters to the floor
          for (const s of this.shots) {
            if (!s.mag || s.state !== 'stuck') continue;
            s.mag = false;
            s.state = 'bounce';
            s.tip = sub(s.tip, fromAngle(s.ang, ARROW_LEN / 2));
            s.vel = v((Math.random() - 0.5) * 70, 0);
            s.spin = (Math.random() - 0.5) * 7;
          }
          sfx.click();
        }
      }
      return true;
    }
    if (k === 'portal') {
      this.portFlash = this.portFlash.map((f) => damp(f, 0, 6, dt));
      return true;
    }
    // ---- rain of apples ----
    if (started && !this.result) {
      this.rainT -= dt;
      if (this.a.quiver < 2) this.a.quiver = this.def.arrows; // bottomless quiver: only the clock matters
      if (this.rainT <= 0) {
        this.rainT = 0;
        this.why = 'time';
        this.finish('lose');
      }
    }
    if (!this.result && dt > 0) {
      this.rainSpawn -= dt;
      if (this.rainSpawn <= 0) {
        this.rainSpawn = (started ? 0.27 : 0.7) + Math.random() * 0.18;
        const n = Math.random() < 0.3 ? 3 : 1; // now and then a neat row of three
        const x0 = this.T - 560 + Math.random() * (700 - (n - 1) * 36);
        const vy = 60 + Math.random() * 100;
        for (let i = 0; i < n; i++) {
          this.rain.push({
            p: v(x0 + i * 36, GROUND - 740), vel: v((Math.random() - 0.5) * 30, vy), rot: Math.random() * 6,
            vr: (Math.random() - 0.5) * 8, state: 'air', t: 0, bonked: false,
          });
        }
      }
    }
    if (this.goals[0]) this.goals[0].label = tx(`Apple kebabs ${this.rainN}/${RAIN_NEED} · ${Math.ceil(this.rainT)}s`, `Sate apel ${this.rainN}/${RAIN_NEED} · ${Math.ceil(this.rainT)} dtk`);
    this.rainStep(dt, 330);
    return true;
  }

  /** falling apples: gravity, bonking heads, rolling out on the floor */
  private rainStep(dt: number, acc: number) {
    for (const ap of [...this.rain]) {
      if (ap.state === 'air') {
        if (ap.lin) {
          if (ap.p.y > GROUND - 120) ap.lin = false; // a row breaks up near the floor
        } else ap.vel.y += acc * dt;
        ap.p = add(ap.p, mul(ap.vel, dt));
        ap.rot += ap.vr * dt;
        if (!ap.bonked && ap.vel.y > 0) {
          // the men do not even flinch when one lands on their head
          for (const man of this.men) {
            if (man.rag) continue;
            const h = headPos(man);
            if (dist(ap.p, v(h.x, h.y - 6)) < APPLE_R + 15) {
              ap.bonked = true;
              ap.lin = false;
              ap.vel = v((ap.p.x < h.x ? -1 : 1) * (80 + Math.random() * 90), -ap.vel.y * 0.35 - 70);
              man.dipV += 240;
              man.brow = 1;
              if (!this.result) this.popText(v(h.x + 30, h.y - 50), tx('BONK!', 'TUK!'), '#6b7280', 20);
              sfx.tuk();
              break;
            }
          }
        }
        if (ap.p.y > GROUND - APPLE_R) {
          ap.p.y = GROUND - APPLE_R;
          ap.state = 'ground';
          ap.vel = v(ap.vel.x * 0.5, ap.vel.y > 120 ? -ap.vel.y * 0.3 : 0);
        }
      } else {
        ap.t += dt;
        ap.vel.y += 900 * dt;
        ap.p = add(ap.p, mul(ap.vel, dt));
        ap.rot += (ap.vel.x / APPLE_R) * dt;
        if (ap.p.y > GROUND - APPLE_R) {
          ap.p.y = GROUND - APPLE_R;
          ap.vel = v(ap.vel.x * 0.8, Math.abs(ap.vel.y) > 90 ? -ap.vel.y * 0.3 : 0);
        }
        if (ap.t > 1.2) this.rain.splice(this.rain.indexOf(ap), 1);
      }
    }
  }

  /** collisions of levels 17-20. null = nothing special */
  private collide3(s: Shot): boolean | null {
    if (this.def.kind === 'mini') return this.collideMini(s);
    if (this.lab) return this.collideLab(s);
    const k = this.def.kind;
    const tip = s.tip;
    if (k === 'magnet') {
      const a = this.magA();
      if (this.magOn() && dist(tip, a) < 30) {
        // caught: it hangs from a pole by its steel point
        s.tip = v(a.x + clamp(tip.x - a.x, -30, 30), a.y - 5);
        s.state = 'stuck';
        s.embed = 0;
        s.stuckT = 0;
        s.mag = true;
        this.burst(a, 6, ['#fde68a', '#f59e0b', '#ffffff'], 'star', 180);
        if (!this.result) this.popText(add(a, v(0, 52)), tx('CLANG!', 'KLANG!'), '#dc2626', 28);
        this.shake = Math.max(this.shake, 5);
        for (const man of this.men) man.brow = 1;
        sfx.ting();
        return true;
      }
      return null;
    }
    if (k === 'portal') {
      const T = this.T;
      if (tip.x > T + WALL.x0 && tip.x < T + WALL.x1 && tip.y > GROUND - WALL.h && tip.y < GROUND) {
        if (!this.result && !s.apples) this.popText(add(tip, v(s.vel.x > 0 ? -36 : 36, -30)), tx('THUNK!', 'TOK!'), '#8a5a2e', 24);
        s.tip = add(tip, fromAngle(s.ang, 8));
        s.state = 'stuck';
        s.embed = 11;
        this.shake = Math.max(this.shake, 3);
        sfx.thunk();
        return true;
      }
      if (s.vel.x < 0 && !this.result) {
        // an arrow that came back out of the blue portal can find its own archer
        const P = this.pose;
        if (segDist(tip, P.hip, P.neck).d < 13 || dist(tip, P.headC) < 16) {
          const d0 = sub(P.neck, P.hip);
          const L = len(d0) || 1;
          const rel = sub(add(tip, fromAngle(s.ang, 8)), P.hip);
          this.meStick = {
            u: (rel.x * d0.x + rel.y * d0.y) / (L * L), w: (d0.x * rel.y - d0.y * rel.x) / L,
            rel: s.ang - Math.atan2(d0.y, d0.x),
          };
          this.shots.splice(this.shots.indexOf(s), 1);
          this.hurtMe('self', tip);
          return true;
        }
      }
      if (s.vel.x > 0) {
        // both portals face left: in on one, out of the other at the same height, flying back
        const ps = this.portals();
        for (let i = 0; i < 2; i++) {
          const from = ps[i];
          const to = ps[1 - i];
          if (Math.abs(tip.x - from.x) < 2.5 && Math.abs(tip.y - from.y) < PORTAL.half - 3) {
            const blue = ['#3b82f6', '#93c5fd', '#ffffff'];
            const orange = ['#f97316', '#fdba74', '#ffffff'];
            this.burst({ ...tip }, 6, i === 0 ? blue : orange, 'drop', 150);
            s.tip = v(to.x - 5, to.y + (tip.y - from.y));
            s.vel = v(-s.vel.x, s.vel.y);
            s.ang = Math.atan2(s.vel.y, s.vel.x);
            s.clip = to.x;
            this.portFlash = [1, 1];
            this.burst({ ...s.tip }, 6, i === 0 ? orange : blue, 'drop', 150);
            if (!this.result) this.popText(add(s.tip, v(i === 0 ? 44 : -44, -76)), tx('ZAP!', 'ZWIP!'), i === 0 ? '#f97316' : '#3b82f6', 26);
            sfx.warp();
            return false;
          }
        }
      }
      return null;
    }
    if (k === 'rain' && !this.result) {
      for (const ap of this.rain) {
        if (ap.state === 'air' && dist(tip, ap.p) < APPLE_R + 7) {
          const at = { ...ap.p };
          this.rain.splice(this.rain.indexOf(ap), 1);
          this.rainN++;
          if (this.rainN >= RAIN_NEED) {
            this.starOv = this.rainT > 15 ? 3 : this.rainT > 6 ? 2 : 1;
            this.mark(0);
            for (let i = 0; i < 6; i++) {
              this.burst(v(this.T - 330 + i * 110, GROUND - 250 - (i % 2) * 70), 9, ['#ef4444', '#fbbf24', '#22c55e', '#3b82f6', '#a855f7'], 'star', 340);
            }
            this.popText(v(this.T - 20, GROUND - 318), tx('PARTY!', 'PESTA!'), '#f59e0b', 46);
          }
          this.appleFx(s, at);
          if (!this.result) this.slowT = Math.min(this.slowT, 0.05); // keep the party moving
          if (s.apples >= 4) this.popText(add(at, v(0, -94)), tx('KEBAB!', 'SATE!'), '#f59e0b', 38);
          return false;
        }
      }
    }
    return null;
  }

  private drawBack3() {
    if (this.def.kind === 'mini') return this.drawMini();
    if (this.lab) return this.drawLabBack();
    const ctx = this.ctx;
    const k = this.def.kind;
    const T = this.T;
    if (k === 'moon') {
      drawEarth(ctx, v(T - 520, GROUND - 392), 46);
      for (const [x, w] of [[T - 900, 60], [T - 430, 92], [T - 190, 52], [T - 650, 40]]) drawCrater(ctx, x, GROUND, w);
      drawFlag(ctx, T + 62, GROUND);
    } else if (k === 'magnet') {
      const cyc = this.lt % (MAG.on + MAG.off);
      const on = cyc < MAG.on;
      drawMagnet(ctx, this.magA(), on, on ? cyc / MAG.on : (cyc - MAG.on) / MAG.off, this.lt);
    } else if (k === 'portal') {
      const [blue, orange] = this.portals();
      const m = this.men[0];
      if (m.hasApple && !m.rag && !this.result) {
        // hint: the way out leads straight to the apple
        const ap = applePos(m);
        ctx.fillStyle = 'rgba(249,115,22,0.45)';
        for (let i = 1; i < 7; i++) {
          const q = lerpV(orange, ap, i / 7.6);
          ctx.beginPath();
          ctx.arc(q.x, q.y, 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      drawPortal(ctx, orange, PORTAL.half, '#f97316', '#fed7aa', this.lt, this.portFlash[1]);
      drawPortal(ctx, blue, PORTAL.half, '#3b82f6', '#bfdbfe', this.lt, this.portFlash[0]);
    }
  }

  private drawFront3() {
    if (this.def.kind === 'mini') return drawFront5(this.host);
    if (this.lab) return this.drawLabFront();
    const ctx = this.ctx;
    const k = this.def.kind;
    const T = this.T;
    if (k === 'moon') {
      const h = headPos(this.men[0]);
      drawHelmet(ctx, v(h.x - 1, h.y + 2), 24);
    } else if (k === 'portal') {
      drawWoodWall(ctx, T + WALL.x0, T + WALL.x1, GROUND, WALL.h);
    } else if (k === 'rain') {
      for (const ap of this.rain) {
        ctx.globalAlpha = ap.state === 'ground' ? clamp((1.2 - ap.t) / 0.4, 0, 1) : 1;
        drawApple(ctx, ap.p, APPLE_R, ap.rot);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** things drawn over the archer */
  private drawOver3() {
    const ctx = this.ctx;
    if (this.def.v?.spring) this.drawSprings();
    if (this.def.v?.jetpack) {
      const p = this.pose;
      ctx.save();
      ctx.translate(p.neck.x, p.neck.y);
      ctx.rotate(p.lean);
      // Jetpack tank & nozzle on the archer's back
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.roundRect(-24, 2, 13, 40, 5);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.roundRect(-22, 8, 9, 14, 2);
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-21, 41, 7, 6);
      if ((this.drag && this.a.phase === 'ready') || this.jetH > 4) {
        const fl = 14 + 7 * Math.sin(this.a.time * 42);
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.ellipse(-17.5, 48 + fl * 0.45, 5.5, fl, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.ellipse(-17.5, 46 + fl * 0.25, 3, fl * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (this.def.v?.mycart) {
      const ax = this.a.x;
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.roundRect(ax - 38, GROUND - 24, 76, 13, 4);
      ctx.fill();
      ctx.fillStyle = '#25272d';
      for (const dx of [-24, 24]) {
        ctx.beginPath();
        ctx.arc(ax + dx, GROUND - 8, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (this.def.kind === 'mini') {
      drawOver5(this.host);
      drawOver6(this.host);
    }
    if (this.pose.arrow && (this.mini === 'bombarrow' || this.mini === 'boomerang')) {
      const ar = this.arrowOrigin()!;
      const tip = add(ar.nock, fromAngle(ar.angle, ARROW_LEN));
      this.drawSpecialTip(tip, ar.angle);
    }
    if (this.def.kind === 'moon' || this.lab?.helmet) drawHelmet(ctx, v(this.pose.headC.x + 1, this.pose.headC.y + 1), 25);
    if (this.lab?.dark) {
      // lights out: one wandering spotlight, and a lamp over the archer
      const sp = this.spot();
      ctx.fillStyle = 'rgba(10,14,28,0.95)';
      ctx.beginPath();
      ctx.rect(-6000, -6000, 16000, 12000);
      ctx.moveTo(sp.x + 92, sp.y);
      ctx.arc(sp.x, sp.y, 92, 0, Math.PI * 2);
      ctx.moveTo(this.a.x + 170, GROUND - 110);
      ctx.arc(this.a.x + 20, GROUND - 110, 150, 0, Math.PI * 2);
      ctx.fill('evenodd');
    }
    if (this.selfApple) drawApple(ctx, this.selfApplePos(), APPLE_R, this.pose.headRot);
  }

  private drawSpecialTip(tip: V, ang: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(ang);
    if (this.mini === 'bombarrow') {
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.roundRect(-22, -5.5, 16, 11, 3);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-17, -5.5, 3, 11);
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(-4, 0, 3.5 + 1.5 * Math.sin(this.lt * 35), 0, Math.PI * 2);
      ctx.fill();
    } else if (this.mini === 'boomerang') {
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-22, -12);
      ctx.lineTo(-16, 0);
      ctx.lineTo(-22, 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- levels 21-30: the lab -------------------------------------------------
  // The four obstacles of levels 17-20 (low gravity, magnets, portals, apple rain),
  // varied and combined. Everything here is driven by the level's `lab` config.
  // ---- levels 41-50: knobs + ducks that can join any level -------------------
  private vv(k: string, d: number) {
    return this.def.v?.[k] ?? d;
  }
  private makeDucks(n: number, sp: number): Duck[] {
    return Array.from({ length: n }, (_, i) => ({
      x: this.T - 500 + ((i * 97) % 340), base: GROUND - [205, 170, 235, 190, 220][i % 5] - this.vv('dalt', 0), dir: i % 2 ? -1 : 1,
      sp: [120, 150, 100, 135, 110][i % 5] * sp, ph: i * 0.75, p: v(0, 0), hit: false, vel: v(0, 0), rot: 0,
    }));
  }
  private ducksStep(dt: number) {
    for (const dk of this.ducks) {
      if (dk.hit) {
        dk.vel.y -= 300 * dt;
        dk.p = add(dk.p, mul(dk.vel, dt));
        dk.rot += 9 * dt;
        continue;
      }
      dk.ph += dt;
      dk.x += dk.dir * dk.sp * dt;
      if (dk.x > this.T - 150 || dk.x < this.T - 520) {
        dk.x = clamp(dk.x, this.T - 520, this.T - 150);
        dk.dir = -dk.dir;
      }
      dk.p = v(dk.x, dk.base + 68 * Math.sin(dk.ph * 2.9));
    }
  }
  private ducksHit(s: Shot): boolean {
    if (this.result) return false;
    for (const dk of this.ducks) {
      if (dk.hit || dist(s.tip, dk.p) >= 17) continue;
      dk.hit = true;
      dk.vel = v(170 * (Math.random() < 0.5 ? -1 : 1), -140);
      this.burst(dk.p, 16, ['#fcd34d', '#fde68a', '#f5b921'], 'drop', 240);
      this.popText(add(dk.p, v(0, -44)), tx('QUACK!', 'KWEK!'), '#f59e0b', 32);
      this.why = 'duck';
      this.shake = 9;
      this.slowT = 0.3;
      sfx.quack();
      this.finish('lose');
      this.tumble(s);
      return true;
    }
    return false;
  }
  /** the arrow loses its way and drops to the floor (`tip` becomes the middle of the shaft) */
  private tumble(s: Shot) {
    s.state = 'bounce';
    s.tip = sub(s.tip, fromAngle(s.ang, ARROW_LEN / 2));
    s.vel = v(-s.vel.x * 0.16, s.vel.y * 0.25 - 90);
    s.spin = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5);
  }

  // ---- levels 31-40 helpers ---------------------------------------------------
  private windNow() {
    const W = this.lab?.wind;
    return W ? W.a * Math.sin(W.w * this.lt) : 0;
  }
  private doorMid(d: { amp: number; w: number; mid: number; ph?: number }) {
    return GROUND - d.mid - d.amp * Math.sin(d.w * this.lt + (d.ph ?? 0));
  }
  private pendAt(): V {
    const P = this.lab!.pend!;
    const th = P.amp * Math.sin(P.w * this.lt);
    return v(this.T + P.x + P.len * Math.sin(th), GROUND - P.h + P.len * Math.cos(th));
  }
  private spot(): V {
    return v(this.T - 70 + 240 * Math.sin(this.lt * 0.9), GROUND - 150 + 60 * Math.sin(this.lt * 1.7));
  }

  // ---- levels 41-50: minigames ---------------------------------------------------
  // Ten small games with their own rules. `mg` holds whatever state the current one needs.
  private mg: any = {};
  private get mini(): string | undefined {
    return this.def.kind === 'mini' ? this.def.mini : undefined;
  }
  /** something is still in motion that could decide the round */
  private miniBusy() {
    return !!this.mg.busy || this.shots.some((s) => s.state === 'fly');
  }
  private miniLabel(text: string) {
    if (this.goals[0]) this.goals[0].label = text;
  }
  private miniLose(why: string, at: V, text: string) {
    if (this.result) return;
    this.why = why;
    this.shake = Math.max(this.shake, 10);
    this.popText(add(at, v(0, -50)), text, '#dc2626', 30);
    sfx.miss();
    this.finish('lose');
  }
  private miniWin(at: V, text: string) {
    if (this.result) return;
    this.mark(0);
    this.slowT = 0.35;
    this.shake = Math.max(this.shake, 9);
    this.burst(at, 14, ['#ffd23f', '#ff9f1c', '#22c55e', '#3b82f6'], 'star', 340);
    this.popText(add(at, v(0, -72)), text, '#16a34a', 40);
    sfx.crunch();
  }
  /** how far (0..1) something has popped out of the cabinet */
  private popOut(t: number) {
    return clamp(t / 0.15, 0, 1) * clamp((1.9 - t) / 0.15, 0, 1);
  }
  private miniOnRelease() {
    if (this.mini === 'giant') {
      this.vx -= 220;
      this.recoilV -= 1.3;
      this.shake = Math.max(this.shake, 8);
      this.dust(this.a.x, 9, 170);
      return;
    }
  }

  private resetMini() {
    const T = this.T;
    const k = this.mini;
    this.men = [];
    this.appleGoal = [];
    this.goals = [{ label: '', done: false }];
    const mg: any = (this.mg = { busy: false, n: 0 });
    if (k === 'order') {
      const xs = [-60, -330, 30, -240, -150, -420];
      const hs = [200, 290, 330, 150, 260, 220];
      mg.bal = xs.map((x, i) => ({ n: i + 1, x: T + x, h: hs[i], w: 1.1 + 0.17 * i, alive: true, p: v(T + x, GROUND - hs[i]) }));
      mg.next = 1;
    } else if (k === 'cans') {
      mg.cans = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3 - r; c++) {
          mg.cans.push({ r, c, p: v(T - 38 + 19 * r + 38 * c, GROUND - 172 - 44 * r), up: true, wob: 0, vel: v(0, 0), rot: 0, vr: 0 });
        }
      }
    } else if (k === 'rope') {
      mg.ropes = [[-300, 400], [-170, 300], [-40, 200]].map(([x, h]) => ({
        x: T + x, h, state: 'hang', grow: 1, p: v(T + x, GROUND - h + 84), vy: 0, t: 0,
      }));
      mg.bx = T - 170;
    } else if (k === 'exact') mg.sum = 0;
    else if (k === 'window') {
      mg.slots = [100, 185, 270, 355].map((h) => ({ h, kind: '', t: 0 }));
      mg.spawn = 0.6;
      mg.time = 40;
    } else if (k === 'simon') Object.assign(mg, { phase: 'wait', t: 0, round: 0, seq: [], pos: 0, lit: -1, litT: 0, i: -1 });
    else if (k === 'bucket') {
      Object.assign(mg, { bx: T - 200, to: T - 200 });
      this.gk = 4; // weighted arrows: they drop fast, so a lob lands close by
    }
    else if (k === 'power') Object.assign(mg, { h: 0, target: 0, pt: -1, round: 0 });
    else if (k === 'cups') {
      Object.assign(mg, { apple: 1, phase: 'wait', t: 0, round: 0, swaps: 0, pair: null, showAll: false });
      mg.cups = [0, 1, 2].map((i) => ({ slot: i, base: v(0, 0), p: v(0, 0), gone: false, vel: v(0, 0), rot: 0 }));
    }
    this.resetMini2();
    this.resetMini3();
    this.resetMini4();
  }

  private updateMini(dt: number) {
    const k = this.mini;
    const mg = this.mg;
    const T = this.T;
    const a = this.a;
    const live = a.phase !== 'idle' && !this.result;
    if (k === 'window' || k === 'simon' || k === 'cups') {
      if (a.quiver < 2) a.quiver = this.def.arrows; // these games are not about saving arrows
      this.shots = this.shots.filter((s) => !(s.state === 'stuck' && s.stuckT > 2.5));
    }
    if (mg.time !== undefined && live) {
      mg.time -= dt;
      if (mg.time <= 0) {
        mg.time = 0;
        this.why = 'time';
        this.finish('lose');
      }
    }
    const secs = Math.ceil(mg.time ?? 0);
    if (k === 'order') {
      for (const b of mg.bal) b.p = v(b.x, GROUND - b.h - 45 * Math.sin(this.lt * b.w + b.n));
      this.miniLabel(mg.next > 6 ? tx('All balloons popped', 'Semua balon pecah') : tx(`Pop balloon #${mg.next}`, `Letuskan balon nomor ${mg.next}`));
    } else if (k === 'cans') {
      const up = (r: number, c: number) => mg.cans.some((q: any) => q.up && q.r === r && q.c === c);
      mg.busy = false;
      for (const c of mg.cans) {
        if (c.up) {
          // a can needs both cans under it
          if (c.r > 0 && !(up(c.r - 1, c.c) && up(c.r - 1, c.c + 1))) {
            mg.busy = true;
            if ((c.wob += dt) > 0.16) {
              const side = c.p.x < T - 1 ? -1 : c.p.x > T + 1 ? 1 : Math.random() < 0.5 ? -1 : 1;
              c.up = false;
              c.vel = v(side * (190 + Math.random() * 60), -60);
              c.vr = side * 7;
              sfx.ting();
            }
          }
          continue;
        }
        c.vel.y += GRAV * dt;
        c.p = add(c.p, mul(c.vel, dt));
        c.rot += c.vr * dt;
        if (c.p.y > GROUND - 17) {
          c.p.y = GROUND - 17;
          c.vel = v(c.vel.x * 0.6, Math.abs(c.vel.y) > 140 ? -c.vel.y * 0.3 : 0);
          c.vr = c.vel.x / 20;
          // comes to rest lying on its side
          c.rot = damp(c.rot, Math.round((c.rot - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2, 10, dt);
        }
      }
      const down = mg.cans.filter((c: any) => !c.up).length;
      this.miniLabel(tx(`Cans down ${down}/6`, `Kaleng jatuh ${down}/6`));
      if (down === 6) this.miniWin(v(T, GROUND - 250), this.fired <= 1 ? 'STRIKE!' : tx('CLEAN SWEEP!', 'BERSIH!'));
    } else if (k === 'rope') {
      const bx = (mg.bx = T - 170 + 175 * Math.sin(0.9 * this.lt));
      mg.busy = false;
      for (const r of mg.ropes) {
        if (r.state === 'hang') {
          r.grow = Math.min(1, r.grow + dt * 3);
          r.p = v(r.x, GROUND - r.h + 14 + 70 * r.grow);
        } else if (r.state === 'fall') {
          mg.busy = true;
          const y0 = r.p.y;
          const rim = GROUND - 58;
          r.vy += GRAV * dt;
          r.p = v(r.x, y0 + r.vy * dt);
          if (y0 < rim && r.p.y >= rim && Math.abs(r.x - bx) < 30) {
            r.state = 'wait';
            r.t = 1.1;
            mg.n++;
            this.burst(r.p, 8, ['#ffd76a', '#e3262d', '#ffffff'], 'drop', 200);
            sfx.tuk();
            if (mg.n >= 3) this.miniWin(v(bx, GROUND - 70), tx('THREE APPLES!', 'TIGA APEL!'));
            else this.popText(v(bx, GROUND - 112), tx('SCORED!', 'MASUK!'), '#16a34a', 28);
          } else if (r.p.y > GROUND - APPLE_R) {
            r.state = 'wait';
            r.t = 1.1;
            this.loose.push({ kind: 'apple', p: v(r.x, GROUND - APPLE_R), vel: v(r.x < bx ? -110 : 110, -170), rot: 0, vr: 5 });
            if (!this.result) this.popText(v(r.x, GROUND - 60), tx('MISSED', 'LUPUT'), '#6b7280', 22);
            sfx.thunk();
          }
        } else if ((r.t -= dt) <= 0 && !this.result) {
          r.state = 'hang';
          r.grow = 0;
        }
      }
      this.miniLabel(tx(`Apples in basket ${mg.n}/3`, `Apel masuk keranjang ${mg.n}/3`));
    } else if (k === 'exact') this.miniLabel(tx(`Score ${mg.sum} of 20`, `Skor ${mg.sum} dari 20`));
    else if (k === 'window') {
      if (live && (mg.spawn -= dt) <= 0) {
        mg.spawn = 0.75 + Math.random() * 0.4;
        const free = mg.slots.filter((q: any) => !q.kind);
        if (free.length > 1) {
          const sl = free[Math.floor(Math.random() * free.length)];
          sl.kind = Math.random() < 0.27 ? 'bomb' : 'apple';
          sl.t = 0;
        }
      }
      for (const sl of mg.slots) if (sl.kind && (sl.t += dt) > 1.9) sl.kind = '';
      this.miniLabel(tx(`Apples ${mg.n}/6 · ${secs}s`, `Apel ${mg.n}/6 · ${secs} dtk`));
    } else if (k === 'simon') {
      mg.t += dt;
      if (mg.phase === 'wait') {
        if (!live) mg.t = 0;
        else if (mg.t > 1.1) {
          mg.seq = [];
          for (let i = 0; i < 3 + mg.round; i++) {
            let n = Math.floor(Math.random() * 4);
            if (n === mg.seq[i - 1]) n = (n + 1) % 4; // no lamp twice in a row: easier to read
            mg.seq.push(n);
          }
          Object.assign(mg, { phase: 'show', t: 0, i: -1 });
        }
      } else if (mg.phase === 'show') {
        const i = Math.floor(mg.t / 0.62);
        if (i >= mg.seq.length) Object.assign(mg, { phase: 'input', pos: 0, lit: -1 });
        else {
          mg.lit = mg.t - i * 0.62 < 0.45 ? mg.seq[i] : -1;
          if (i !== mg.i) {
            mg.i = i;
            sfx.note(mg.seq[i]);
          }
        }
      }
      if (mg.phase !== 'show' && (mg.litT -= dt) <= 0) mg.lit = -1;
      this.miniLabel(
        mg.phase === 'show'
          ? tx('Watch the sequence…', 'Perhatikan urutannya…')
          : mg.phase === 'input'
            ? tx(`Repeat the sequence ${mg.pos}/${mg.seq.length}`, `Ulangi urutannya ${mg.pos}/${mg.seq.length}`)
            : tx('Get ready…', 'Siap-siap…'),
      );
    } else if (k === 'bucket') {
      mg.bx = damp(mg.bx, mg.to, 8, dt);
      this.miniLabel(tx(`In barrel ${mg.n}/3`, `Masuk tong ${mg.n}/3`));
    } else if (k === 'power') {
      const z = [[370, 400], [270, 330], [120, 180]][Math.min(2, mg.round)];
      mg.busy = mg.pt >= 0;
      if (mg.pt >= 0) {
        const t0 = mg.pt;
        mg.pt += dt;
        mg.h = mg.pt < 0.5 ? mg.target * ease.out(mg.pt / 0.5) : Math.max(0, mg.target - 1100 * Math.max(0, mg.pt - 0.85) ** 2);
        if (t0 < 0.5 && mg.pt >= 0.5 && !this.result) {
          const top = v(T, GROUND - 20 - mg.target);
          if (mg.target >= z[0] && mg.target <= z[1]) {
            mg.round++;
            sfx.ting();
            if (mg.round >= 3) this.miniWin(top, tx('POWER MASTER!', 'JAGO TENAGA!'));
            else this.popText(add(top, v(-80, -10)), tx('SPOT ON!', 'PAS!'), '#16a34a', 30);
          } else {
            this.popText(add(top, v(-100, -10)), mg.target < z[0] ? tx('TOO SHORT!', 'KURANG!') : tx('TOO STRONG!', 'KELEBIHAN!'), '#f97316', 24);
            sfx.miss();
          }
        }
        if (mg.pt > 0.85 && mg.h <= 0) mg.pt = -1;
      }
      this.miniLabel(tx(`Green zone ${Math.min(3, mg.round)}/3`, `Zona hijau ${Math.min(3, mg.round)}/3`));
    } else if (k === 'cups') {
      const H = [110, 215, 320];
      const slotP = (i: number) => v(T - 20, GROUND - H[i] - 29);
      const [swaps, dur] = [[3, 0.6], [5, 0.45], [7, 0.34]][Math.min(2, mg.round)];
      mg.t += dt;
      if (mg.phase === 'wait') {
        if (!live) mg.t = 0;
        else if (mg.t > 0.8) Object.assign(mg, { phase: 'reveal', t: 0 });
      } else if (mg.phase === 'reveal') {
        if (mg.t > 1.4) Object.assign(mg, { phase: 'shuffle', t: 0, swaps: 0, pair: null });
      } else if (mg.phase === 'shuffle') {
        if (!mg.pair) {
          const a0 = Math.floor(Math.random() * 3);
          mg.pair = { a: a0, b: (a0 + 1 + Math.floor(Math.random() * 2)) % 3, k: 0 };
          sfx.step();
        }
        mg.pair.k += dt / dur;
        if (mg.pair.k >= 1) {
          const ca = mg.cups[mg.pair.a];
          const cb = mg.cups[mg.pair.b];
          const sa = ca.slot;
          ca.slot = cb.slot;
          cb.slot = sa;
          mg.pair = null;
          if (++mg.swaps >= swaps) Object.assign(mg, { phase: 'pick', t: 0 });
        }
      } else if (mg.phase === 'result' && mg.t > 1.2) {
        mg.round++;
        for (const c of mg.cups) Object.assign(c, { gone: false, rot: 0 });
        Object.assign(mg, { apple: Math.floor(Math.random() * 3), phase: 'reveal', t: 0 });
      }
      mg.cups.forEach((c: any, i: number) => {
        let base = slotP(c.slot);
        if (mg.pair && (mg.pair.a === i || mg.pair.b === i)) {
          // the two cups trade shelves along opposite arcs
          const other = mg.cups[mg.pair.a === i ? mg.pair.b : mg.pair.a];
          const e = ease.sine(Math.min(1, mg.pair.k));
          base = v(base.x + (mg.pair.a === i ? -1 : 1) * 46 * Math.sin(Math.PI * e), lerp(base.y, slotP(other.slot).y, e));
        }
        c.base = base;
        if (c.gone) {
          c.vel.y += GRAV * dt;
          c.p = add(c.p, mul(c.vel, dt));
          if (c.p.y > GROUND - 27) {
            c.p.y = GROUND - 27;
            c.vel = v(c.vel.x * 0.5, 0);
          } else c.rot += 8 * dt;
        } else {
          const lift = mg.showAll ? 44 : mg.phase === 'reveal' && i === mg.apple ? 44 * Math.sin(Math.PI * clamp(mg.t / 1.4, 0, 1)) : 0;
          c.p = v(base.x, base.y - lift);
        }
      });
      const says: Record<string, string> = {
        reveal: tx('Watch the apple…', 'Lihat apelnya…'),
        shuffle: tx('Keep your eyes on it…', 'Jangan lepas pandangan…'),
        pick: tx(`Which cup? (round ${mg.round + 1}/3)`, `Gelas mana? (ronde ${mg.round + 1}/3)`),
        result: tx('Correct!', 'Benar!'),
      };
      this.miniLabel(says[mg.phase] ?? tx('Get ready…', 'Siap-siap…'));
    }
    this.updateMini2(dt, live, secs);
    this.updateMini3(dt, live, secs);
    this.updateMini4(dt, live);
  }

  /** collisions of the minigames. null = nothing special, carry on with the usual checks */
  private collideMini(s: Shot): boolean | null {
    const k = this.mini;
    const mg = this.mg;
    const T = this.T;
    const tip = s.tip;
    if (this.result) return null;
    const r2 = this.collideMini2(s);
    if (r2 !== null) return r2;
    const r3 = this.collideMini3(s);
    if (r3 !== null) return r3;
    const r4 = this.collideMini4(s);
    if (r4 !== null) return r4;
    const stick = () => {
      s.tip = add(tip, fromAngle(s.ang, 8));
      s.state = 'stuck';
      s.embed = 11;
      sfx.thunk();
      return true;
    };
    const notYet = (at: V) => {
      this.popText(add(at, v(-40, -40)), tx('WAIT!', 'TUNGGU!'), '#6b7280', 20);
      this.tumble(s);
      return true;
    };
    if (k === 'order') {
      for (const b of mg.bal) {
        if (!b.alive || Math.hypot(tip.x - b.p.x, (tip.y - b.p.y) / 1.18) > 28) continue;
        b.alive = false;
        this.burst(b.p, 12, [BALLOON_COL[b.n % 3], '#ffffff'], 'drop', 260);
        sfx.pop();
        this.tumble(s);
        if (b.n !== mg.next) this.miniLose('wrong', b.p, tx(`WRONG! NEEDED ${mg.next}`, `SALAH! HARUSNYA ${mg.next}`));
        else {
          mg.next++;
          if (mg.next > 6) this.miniWin(b.p, tx('IN ORDER!', 'URUT!'));
          else this.popText(add(b.p, v(0, -44)), tx('POP!', 'DOR!'), '#16a34a', 28);
        }
        return true;
      }
    } else if (k === 'cans') {
      for (const c of mg.cans) {
        if (!c.up || Math.abs(tip.x - c.p.x) > 17 || Math.abs(tip.y - c.p.y) > 22) continue;
        const sp = len(s.vel);
        sfx.ting();
        if (sp < 520) {
          this.tumble(s); // too slow to shift it
          return true;
        }
        c.up = false;
        c.vel = v(sp * 0.16 + 60, -230 - Math.random() * 60);
        c.vr = 9;
        this.burst(tip, 5, ['#e5e7eb', '#ef4444'], 'drop', 180);
        this.shake = Math.max(this.shake, 4);
        s.vel = mul(s.vel, 0.4);
        return false;
      }
      if (Math.abs(tip.x - T) < 62 && tip.y > GROUND - 150 && tip.y < GROUND - 138) return stick();
      if (Math.abs(tip.x - T) < 7 && tip.y >= GROUND - 138 && tip.y < GROUND) return stick();
    } else if (k === 'rope') {
      for (const r of mg.ropes) {
        if (r.state !== 'hang' || r.grow < 1) continue;
        if (dist(tip, r.p) < APPLE_R + 4) {
          // skewered instead of dropped: that one is lost
          r.state = 'wait';
          r.t = 1.1;
          s.apples++;
          this.popText(add(r.p, v(0, -44)), tx('CUT THE ROPE!', 'POTONG TALINYA!'), '#f97316', 22);
          sfx.crunch();
          return false;
        }
        if (Math.abs(tip.x - r.x) < 4 && tip.y > GROUND - r.h && tip.y < r.p.y - APPLE_R) {
          r.state = 'fall';
          r.vy = 0;
          this.burst(tip, 5, ['#8a6a3c', '#c9a86a'], 'drop', 120);
          sfx.snap();
          return false;
        }
      }
    } else if (k === 'exact') {
      const cy = GROUND - BOARD_H;
      const off = Math.abs(tip.y - cy);
      if (s.vel.x > 0 && Math.abs(tip.x - T) < 2.5 && off < BOARD.r) {
        const pts = off < BOARD.bull ? 10 : off < BOARD.r * 0.4 ? 8 : off < BOARD.r * 0.6 ? 6 : off < BOARD.r * 0.8 ? 4 : 2;
        mg.sum += pts;
        this.shake = Math.max(this.shake, 4);
        if (mg.sum === 20) this.miniWin(tip, tx('EXACTLY 20!', 'TEPAT 20!'));
        else if (mg.sum > 20) this.miniLose('bust', tip, tx(`BUST! ${mg.sum}`, `KELEBIHAN! ${mg.sum}`));
        else this.popText(add(tip, v(-44, -42)), `+${pts}`, '#16a34a', 30);
        return stick();
      }
    } else if (k === 'window') {
      for (const sl of mg.slots) {
        const o = this.popOut(sl.t);
        const c = v(T + 34 - 56 * o, GROUND - sl.h);
        if (!sl.kind || o < 0.6 || dist(tip, c) > APPLE_R + 5) continue;
        const bomb = sl.kind === 'bomb';
        sl.kind = '';
        if (bomb) {
          this.burst(c, 22, ['#f59e0b', '#ef4444', '#1f2937', '#fde68a'], 'drop', 420);
          this.shake = 16;
          sfx.boom();
          this.miniLose('bomb', c, tx('BOOM!', 'DUAR!'));
          this.tumble(s);
          return true;
        }
        mg.n++;
        if (mg.n >= 6) {
          this.starOv = mg.time > 20 ? 3 : mg.time > 10 ? 2 : 1;
          this.miniWin(c, tx('SHARP!', 'SIGAP!'));
        }
        this.appleFx(s, c, mg.n < 6);
        this.slowT = Math.min(this.slowT, 0.06);
        return false;
      }
      if (tip.x > T + 10 && tip.x < T + 90 && tip.y > GROUND - 400) return stick();
    } else if (k === 'simon') {
      for (let i = 0; i < 4; i++) {
        const c = v(T, GROUND - 110 - 75 * i);
        if (dist(tip, c) > 29) continue;
        if (mg.phase !== 'input') return notYet(c);
        this.tumble(s);
        mg.lit = i;
        mg.litT = 0.3;
        sfx.note(i);
        if (i !== mg.seq[mg.pos]) this.miniLose('wrong', c, tx('WRONG ORDER!', 'SALAH URUTAN!'));
        else if (++mg.pos >= mg.seq.length) {
          mg.round++;
          if (mg.round >= 2) this.miniWin(c, tx('MEMORIZED!', 'HAFAL!'));
          else {
            Object.assign(mg, { phase: 'wait', t: 0 });
            this.popText(add(c, v(-70, -50)), tx('NICE!', 'BAGUS!'), '#16a34a', 28);
          }
        }
        return true;
      }
    } else if (k === 'bucket') {
      const dx = tip.x - mg.bx;
      const rim = GROUND - 90;
      if (tip.y >= rim && Math.abs(dx) < 32) {
        if (s.vel.y > 0 && tip.y - Math.sin(s.ang) * 4.5 < rim + 1 && Math.abs(dx) < 26) {
          // came down through the opening
          mg.n++;
          this.shots.splice(this.shots.indexOf(s), 1);
          this.burst(v(mg.bx, rim), 8, ['#cbd5e1', '#ffffff', '#fbbf24'], 'star', 200);
          sfx.tuk();
          if (mg.n >= 3) this.miniWin(v(mg.bx, rim), tx('THREE BARRELS!', 'TIGA TONG!'));
          else {
            this.popText(v(mg.bx, rim - 60), tx('IN!', 'MASUK!'), '#16a34a', 30);
            mg.to = T + [60, -300][mg.n - 1];
          }
          return true;
        }
        this.popText(add(tip, v(-30, -36)), tx('CLANG!', 'TENG!'), '#6b7280', 22);
        this.tumble(s);
        sfx.ting();
        return true;
      }
    } else if (k === 'power') {
      if (s.vel.x > 0 && dist(tip, v(T - 84, GROUND - 150)) < 38) {
        // the faster the arrow, the higher the puck
        mg.target = clamp(((len(s.vel) - 700) / 1630) * 400, 0, 400);
        mg.pt = 0;
        this.burst(tip, 5, ['#fca5a5', '#ffffff'], 'drop', 150);
        this.shake = Math.max(this.shake, 3);
        this.tumble(s);
        sfx.thunk();
        return true;
      }
      if (Math.abs(tip.x - T) < 9 && tip.y > GROUND - 450) return stick();
    } else if (k === 'cups') {
      for (let i = 0; i < 3; i++) {
        const c = mg.cups[i];
        if (c.gone || Math.abs(tip.x - c.p.x) > 27 || Math.abs(tip.y - c.p.y) > 29) continue;
        if (mg.phase !== 'pick') return notYet(c.p);
        c.gone = true;
        c.vel = v(s.vel.x * 0.12 + 150, -280);
        this.tumble(s);
        sfx.ting();
        if (i !== mg.apple) {
          Object.assign(mg, { phase: 'done', showAll: true });
          this.miniLose('wrong', c.p, tx('WRONG CUP!', 'SALAH GELAS!'));
        } else if (mg.round >= 2) {
          mg.phase = 'done';
          this.miniWin(c.p, tx('EAGLE EYE!', 'MATA ELANG!'));
        } else {
          Object.assign(mg, { phase: 'result', t: 0 });
          this.popText(add(c.p, v(-60, -50)), tx('CORRECT!', 'BENAR!'), '#16a34a', 28);
          sfx.tuk();
        }
        return true;
      }
    }
    return null;
  }

  private drawMini() {
    this.drawMini2();
    this.drawMini3();
    this.drawMini4();
    const ctx = this.ctx;
    const k = this.mini;
    const mg = this.mg;
    const T = this.T;
    const G = GROUND;
    const box = (x: number, y: number, w: number, h: number, c: string, r = 0) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    };
    const disc = (p: V, r: number, c: string) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const poly = (pts: number[][], c: string) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    };
    const text = (t: string, p: V, size: number, c: string) => {
      ctx.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c;
      ctx.fillText(t, p.x, p.y);
    };
    if (k === 'order') {
      for (const b of mg.bal) {
        if (!b.alive) continue;
        stroke(ctx, [v(b.x, G), v(b.p.x, b.p.y + 34)], '#9aa3ad', 1.3);
        drawBalloon(ctx, b.p, 26, BALLOON_COL[b.n % 3]);
        disc(b.p, 12.5, '#ffffff');
        text(String(b.n), v(b.p.x, b.p.y + 1), 17, '#111827');
      }
    } else if (k === 'cans') {
      groundShadow(ctx, T, G, 70, 0.1);
      box(T - 7, G - 140, 14, 140, '#7b8491');
      box(T - 62, G - 150, 124, 12, '#c58f52', 3);
      for (const c of mg.cans) {
        ctx.save();
        ctx.translate(c.p.x, c.p.y);
        ctx.rotate(c.rot);
        box(-17, -22, 34, 44, '#dc2626', 5);
        box(-17, -7, 34, 14, '#f4f5f7');
        box(-17, -22, 34, 5, '#9aa3ad', 2);
        ctx.restore();
      }
    } else if (k === 'rope') {
      const bx = mg.bx;
      for (const r of mg.ropes) {
        const hook = v(r.x, G - r.h);
        stroke(ctx, [hook, v(r.x, hook.y - 3000)], '#c5cad2', 3, 'butt');
        box(r.x - 9, hook.y - 5, 18, 7, '#565c68', 2);
        stroke(ctx, [hook, r.state === 'hang' ? v(r.x, r.p.y - 12) : v(r.x + 3, hook.y + 14)], '#8a6a3c', 2.6);
        if (r.state !== 'wait') drawApple(ctx, r.p, APPLE_R, 0);
      }
      groundShadow(ctx, bx, G, 50, 0.12);
      for (let i = 0; i < mg.n; i++) drawApple(ctx, v(bx - 16 + i * 16, G - 58), 10, 0.3 * i);
      poly([[bx - 34, G - 58], [bx + 34, G - 58], [bx + 26, G - 14], [bx - 26, G - 14]], '#c58f52');
      ctx.fillStyle = 'rgba(90,45,10,0.25)';
      for (let i = 0; i < 3; i++) ctx.fillRect(bx - 27, G - 48 + i * 12, 54, 3);
      box(bx - 36, G - 61, 72, 6, '#8a5a2e', 3);
      disc(v(bx - 18, G - 8), 8, '#25272d');
      disc(v(bx + 18, G - 8), 8, '#25272d');
    } else if (k === 'exact') {
      const cy = G - BOARD_H;
      groundShadow(ctx, T + 30, G, 72, 0.11);
      drawBoard(ctx, T, G, cy, -1);
      for (const [n, off] of [[10, 0], [8, 22], [6, 39], [4, 55], [2, 70]]) text(String(n), v(T - 112, cy - off), 12, '#6b7280');
      text(`${mg.sum} / 20`, v(T, cy - 114), 26, mg.sum > 20 ? '#dc2626' : '#111827');
    } else if (k === 'window') {
      for (const sl of mg.slots) {
        if (!sl.kind) continue;
        const c = v(T + 34 - 56 * this.popOut(sl.t), G - sl.h);
        if (sl.kind === 'apple') drawApple(ctx, c, APPLE_R, 0);
        else {
          stroke(ctx, [v(c.x - 6, c.y - 11), v(c.x - 13, c.y - 20)], '#8a6a3c', 2.6);
          disc(v(c.x - 14, c.y - 21), 3.5 + 1.5 * Math.sin(this.lt * 30), '#f59e0b');
          disc(c, 14, '#1f2937');
          disc(v(c.x - 5, c.y - 5), 3.4, 'rgba(255,255,255,0.5)');
        }
      }
      groundShadow(ctx, T + 50, G, 70, 0.1);
      drawWoodWall(ctx, T + 10, T + 90, G, 400);
      for (const sl of mg.slots) box(T + 10, G - sl.h - 21, 13, 42, '#3b2a1a', 5);
    } else if (k === 'simon') {
      const cols = ['#ef4444', '#fbbf24', '#22c55e', '#3b82f6'];
      box(T - 6, G - 385, 12, 385, '#7b8491');
      for (let i = 0; i < 4; i++) {
        const c = v(T, G - 110 - 75 * i);
        const on = mg.lit === i;
        if (on) {
          ctx.globalAlpha = 0.3;
          disc(c, 41, cols[i]);
          ctx.globalAlpha = 1;
        }
        disc(c, 28, '#2b2e36');
        ctx.globalAlpha = on ? 1 : 0.4;
        disc(c, 23, cols[i]);
        ctx.globalAlpha = 1;
        if (on) disc(v(c.x - 7, c.y - 8), 5, 'rgba(255,255,255,0.8)');
      }
    } else if (k === 'bucket') {
      const bx = mg.bx;
      groundShadow(ctx, bx, G, 48, 0.12);
      for (let i = 0; i < mg.n; i++) {
        const e = v(bx - 20 + i * 16, G - 134);
        stroke(ctx, [v(bx - 10 + i * 9, G - 84), e], '#25272d', 2.6);
        disc(e, 3.6, '#f97316');
      }
      poly([[bx - 32, G - 90], [bx + 32, G - 90], [bx + 27, G], [bx - 27, G]], '#c58f52');
      poly([[bx + 6, G - 90], [bx + 32, G - 90], [bx + 27, G], [bx + 5, G]], 'rgba(90,45,10,0.2)');
      box(bx - 31, G - 70, 62, 6, '#565c68');
      box(bx - 28, G - 24, 56, 6, '#565c68');
      ctx.fillStyle = '#3b2a1a';
      ctx.beginPath();
      ctx.ellipse(bx, G - 90, 32, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (k === 'power') {
      const base = G - 20;
      const z = [[370, 400], [270, 330], [120, 180]][Math.min(2, mg.round)];
      const pad = v(T - 84, G - 150);
      groundShadow(ctx, T, G, 60, 0.1);
      box(T - 26, G - 20, 52, 20, '#3b4049', 4);
      box(T - 9, base - 430, 18, 430, '#565c68', 4);
      ctx.fillStyle = '#9aa3ad';
      for (let h = 50; h <= 400; h += 50) ctx.fillRect(T - 9, base - h, 18, 2);
      box(T - 15, base - z[1], 30, z[1] - z[0], '#22c55e', 4);
      disc(v(T, base - 424), 15, '#fbbf24');
      box(T - 18, base - mg.h - 7, 36, 14, '#ef4444', 4);
      stroke(ctx, [pad, v(T - 12, G - 30)], '#7b8491', 6);
      disc(pad, 38, '#ef4444');
      disc(pad, 26, '#f4f5f7');
      disc(pad, 13, '#ef4444');
    } else if (k === 'cups') {
      const ac = mg.cups[mg.apple];
      box(T + 12, G - 400, 9, 400, '#7b8491');
      for (const h of [110, 215, 320]) box(T - 58, G - h, 80, 8, '#c58f52', 2);
      drawApple(ctx, v(ac.base.x, ac.base.y + 15), APPLE_R, 0);
      for (const c of mg.cups) {
        ctx.save();
        ctx.translate(c.p.x, c.p.y);
        ctx.rotate(c.rot);
        poly([[-20, -29], [20, -29], [27, 29], [-27, 29]], '#f97316');
        poly([[4, -29], [20, -29], [27, 29], [6, 29]], 'rgba(0,0,0,0.15)');
        box(-27, 22, 54, 7, '#fdba74', 2);
        ctx.restore();
      }
    }
  }

  // ---- levels 18, 23, 24, 29, 31, 39 -------------------------------------------
  private wheelItem(i: number): V {
    return add(v(this.T - 40, GROUND - 230), fromAngle(0.9 * this.lt + (i * Math.PI) / 4, 120));
  }
  private resetMini2() {
    const T = this.T; const G = GROUND; const k = this.mini; const mg = this.mg;
    if (k === 'candles') mg.fl = [0, 1, 2, 3, 4].map((i) => ({ x: T - 150 + i * 60, h: 110 + i * 26, on: true }));
    else if (k === 'juggle') Object.assign(mg, { p: v(T - 250, G - 210), vel: v(0, 0), live: false });
    else if (k === 'rockets') Object.assign(mg, { rk: [], spawn: 0.5, time: 40 });
    else if (k === 'hoops') Object.assign(mg, { rings: [[-441, 301], [-142, 376], [156, 390]].map(([x, h]) => v(T + x, G - h)), bell: v(T + 395, G - 360) });
    else if (k === 'torch') Object.assign(mg, { flame: v(T - 420, G - 230), lan: [170, 235, 300].map((h) => ({ p: v(T - 40, G - h), lit: false })) });
    else if (k === 'wheelbomb') mg.gone = Array(8).fill(false);
  }
  private updateMini2(dt: number, live: boolean, secs: number) {
    const T = this.T; const G = GROUND; const k = this.mini; const mg = this.mg; const a = this.a;
    if (k === 'juggle' || k === 'rockets') {
      if (a.quiver < 2) a.quiver = this.def.arrows;
      this.shots = this.shots.filter((s) => !(s.state === 'stuck' && s.stuckT > 2.5));
    }
    if (k === 'candles') this.miniLabel(tx(`Candles out ${mg.fl.filter((f: any) => !f.on).length}/5`, `Lilin padam ${mg.fl.filter((f: any) => !f.on).length}/5`));
    else if (k === 'juggle') {
      if (mg.live && !this.result) {
        mg.vel.y += 300 * dt;
        mg.p = add(mg.p, mul(mg.vel, dt));
        if (mg.p.x < T - 430 || mg.p.x > T - 90) { mg.p.x = clamp(mg.p.x, T - 430, T - 90); mg.vel.x *= -1; }
        if (mg.p.y > G - 34) { mg.p.y = G - 34; mg.live = false; this.miniLose('drop', mg.p, tx('DROPPED!', 'JATUH!')); }
      }
      this.miniLabel(tx(`Bounces ${mg.n}/5`, `Pantulan ${mg.n}/5`));
    } else if (k === 'rockets') {
      if (live && (mg.spawn -= dt) <= 0) { mg.spawn = 1.5; mg.rk.push({ p: v(T - 420 + Math.random() * 360, G - 12), vy: -(540 + Math.random() * 80) }); sfx.launch(); }
      for (const r of mg.rk) { r.vy += 380 * dt; r.p.y += r.vy * dt; }
      mg.rk = mg.rk.filter((r: any) => r.p.y < G);
      this.miniLabel(tx(`Fireworks ${mg.n}/5 · ${secs}s`, `Kembang api ${mg.n}/5 · ${secs} dtk`));
    } else if (k === 'hoops') this.miniLabel(tx('Three rings, then the bell', 'Tiga gelang, lalu lonceng'));
    else if (k === 'torch') this.miniLabel(tx(`Lanterns lit ${mg.n}/3`, `Lentera menyala ${mg.n}/3`));
    else if (k === 'wheelbomb') this.miniLabel(tx(`Apples ${mg.n}/3`, `Apel ${mg.n}/3`));
  }
  private collideMini2(s: Shot): boolean | null {
    const T = this.T; const G = GROUND; const k = this.mini; const mg = this.mg; const tip = s.tip; const x = s as any;
    const drop = () => { this.tumble(s); return true; };
    const stick = () => { s.tip = add(tip, fromAngle(s.ang, 8)); s.state = 'stuck'; s.embed = 11; sfx.thunk(); return true; };
    const RAINBOW = ['#ef4444', '#fbbf24', '#22c55e', '#3b82f6', '#a855f7'];
    if (k === 'candles') {
      for (const f of mg.fl) {
        if (f.on && dist(tip, v(f.x, G - f.h)) < 11) {
          f.on = false;
          this.burst(v(f.x, G - f.h), 5, ['#cbd5e1', '#e5e7eb'], 'drop', 90); sfx.tuk();
          if (mg.fl.every((q: any) => !q.on)) this.miniWin(v(T - 30, G - 300), tx('ALL OUT!', 'PADAM SEMUA!'));
        } else if ((Math.abs(tip.x - f.x) <= 30 && tip.y > G - f.h + 34) || (Math.abs(tip.x - f.x) < 4 && tip.y > G - f.h + 9)) {
          this.popText(add(tip, v(-30, -34)), tx('THE CAKE!', 'KUENYA!'), '#f97316', 22);
          return stick();
        }
      }
    } else if (k === 'juggle') {
      if (dist(tip, mg.p) < 36) {
        mg.live = true; mg.n++;
        mg.vel = v(clamp((T - 260 - mg.p.x) * 0.5, -90, 90) + (Math.random() - 0.5) * 40, -330);
        this.burst(tip, 6, ['#fde68a', '#ffffff'], 'star', 180); sfx.boing();
        if (mg.n >= 5) { mg.live = false; this.miniWin(mg.p, tx('PRO!', 'JAGO!')); } else this.popText(add(mg.p, v(0, -60)), String(mg.n), '#16a34a', 30);
        return drop();
      }
    } else if (k === 'rockets') {
      for (const r of mg.rk) if (dist(tip, r.p) < 18) {
        mg.rk.splice(mg.rk.indexOf(r), 1); mg.n++;
        this.burst(r.p, 22, RAINBOW, 'star', 430); sfx.pop();
        if (mg.n >= 5) { this.starOv = mg.time > 22 ? 3 : mg.time > 10 ? 2 : 1; this.miniWin(r.p, tx('FESTIVE!', 'MERIAH!')); } else this.popText(add(r.p, v(0, -50)), tx('BANG!', 'DOR!'), '#f59e0b', 28);
        return false;
      }
    } else if (k === 'hoops') {
      for (let i = 0; i < 3; i++) {
        const r = mg.rings[i]; const d = Math.abs(tip.y - r.y);
        if (Math.abs(tip.x - r.x) < 2.5 && d < 47) {
          if (d >= 33) { this.popText(add(tip, v(-30, -34)), tx('CLANG!', 'TENG!'), '#6b7280', 22); sfx.ting(); return drop(); }
          if (!((x.rg ?? 0) & (1 << i))) sfx.note(i);
          x.rg = (x.rg ?? 0) | (1 << i);
        }
      }
      if (dist(tip, mg.bell) < 26) {
        if (x.rg === 7) { this.miniWin(mg.bell, tx('THREE RINGS!', 'TIGA GELANG!')); return stick(); }
        this.popText(add(tip, v(-90, -40)), tx('PASS 3 RINGS FIRST', 'LEWATI 3 GELANG DULU'), '#6b7280', 20); sfx.ting(); return drop();
      }
    } else if (k === 'torch') {
      if (!x.fire && dist(tip, mg.flame) < 24) { x.fire = true; this.burst(tip, 5, ['#f97316', '#fbbf24'], 'drop', 120); sfx.pop(); }
      for (const l of mg.lan) if (!l.lit && dist(tip, l.p) < 22) {
        if (!x.fire) { this.popText(add(tip, v(-50, -36)), tx('NEED FIRE!', 'BUTUH API!'), '#6b7280', 22); return drop(); }
        l.lit = true; mg.n++; this.shots.splice(this.shots.indexOf(s), 1); sfx.note(mg.n);
        this.burst(l.p, 8, ['#fbbf24', '#fde68a'], 'star', 200);
        if (mg.n >= 3) this.miniWin(l.p, tx('BRIGHT!', 'TERANG!')); else this.popText(add(l.p, v(-50, -44)), tx('LIT!', 'NYALA!'), '#f59e0b', 28);
        return true;
      }
    } else if (k === 'wheelbomb') {
      for (let i = 0; i < 8; i++) {
        const p = this.wheelItem(i);
        if (mg.gone[i] || dist(tip, p) > 16) continue;
        if (i % 2) { this.burst(p, 20, ['#f59e0b', '#ef4444', '#1f2937'], 'drop', 400); sfx.boom(); this.miniLose('bomb', p, tx('BOOM!', 'DUAR!')); return drop(); }
        mg.gone[i] = true; mg.n++;
        if (mg.n >= 3) this.miniWin(p, tx('SAFE!', 'AMAN!'));
        this.appleFx(s, p, mg.n < 3);
        return drop();
      }
    }
    return null;
  }
  private drawMini2() {
    const ctx = this.ctx; const T = this.T; const G = GROUND; const k = this.mini; const mg = this.mg;
    const box = (x: number, y: number, w: number, h: number, c: string, r = 0) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
    const oval = (p: V, rx: number, ry: number, c: string) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
    const disc = (p: V, r: number, c: string) => oval(p, r, r, c);
    const tri = (p: V, r: number, c: string) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y + r * 0.8); ctx.lineTo(p.x - r, p.y + r * 0.8); ctx.closePath(); ctx.fill(); };
    const flame = (p: V, r: number) => { const f = 1 + 0.15 * Math.sin(this.lt * 30 + p.x); oval(v(p.x, p.y - r * 0.2), r * 0.6, r * f, '#f97316'); oval(v(p.x, p.y + r * 0.1), r * 0.32, r * 0.6 * f, '#fde047'); };
    const COL = ['#ef4444', '#3b82f6', '#22c55e'];
    if (k === 'candles') {
      mg.fl.forEach((f: any, i: number) => {
        box(f.x - 30, G - f.h + 34, 60, f.h - 34, i % 2 ? '#fbcfe8' : '#f9a8d4');
        box(f.x - 30, G - f.h + 34, 60, 7, '#ffffff');
        box(f.x - 4, G - f.h + 9, 8, 25, COL[i % 3], 2);
        if (f.on) flame(v(f.x, G - f.h), 10);
      });
    } else if (k === 'juggle') {
      const p = mg.p;
      groundShadow(ctx, p.x, G, 40, 0.1);
      if (!mg.live && !mg.n) box(p.x - 4, p.y + 30, 8, G - p.y - 30, '#9aa3ad');
      disc(p, 34, '#f4f5f7');
      for (let j = 0; j < 3; j++) { ctx.fillStyle = COL[j]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, 34, p.x * 0.03 + j * 2.094, p.x * 0.03 + j * 2.094 + 1.05); ctx.closePath(); ctx.fill(); }
      disc(p, 7, '#ffffff');
    } else if (k === 'rockets') {
      for (const r of mg.rk) { flame(v(r.p.x, r.p.y + 22), 9); box(r.p.x - 6, r.p.y - 14, 12, 30, '#ef4444', 3); tri(v(r.p.x, r.p.y - 20), 8, '#9aa3ad'); }
    } else if (k === 'hoops') {
      for (const r of mg.rings) { stroke(ctx, [v(r.x, r.y + 44), v(r.x, G)], '#c5cad2', 3, 'butt'); ctx.beginPath(); ctx.ellipse(r.x, r.y, 10, 40, 0, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = '#f59e0b'; ctx.stroke(); }
      stroke(ctx, [mg.bell, v(mg.bell.x, G)], '#c5cad2', 3, 'butt');
      disc(mg.bell, 24, '#fbbf24'); disc(v(mg.bell.x, mg.bell.y + 22), 6, '#b7791f');
    } else if (k === 'torch') {
      box(mg.flame.x - 5, mg.flame.y + 8, 10, G - mg.flame.y - 8, '#8a5a2e');
      flame(mg.flame, 22);
      box(T - 28, G - 340, 8, 340, '#7b8491');
      for (const l of mg.lan) {
        if (l.lit) { ctx.globalAlpha = 0.3; disc(l.p, 36, '#fbbf24'); ctx.globalAlpha = 1; }
        box(l.p.x - 17, l.p.y - 22, 34, 44, l.lit ? '#fbbf24' : '#9aa3ad', 9); box(l.p.x - 12, l.p.y - 26, 24, 6, '#3b4049', 2);
      }
      for (const s of this.shots) if ((s as any).fire && s.state === 'fly') flame(s.tip, 9);
    } else if (k === 'wheelbomb') {
      const c = v(T - 40, G - 230);
      stroke(ctx, [c, v(c.x, G)], '#7b8491', 8, 'butt');
      ctx.beginPath(); ctx.arc(c.x, c.y, 120, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = '#c58f52'; ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const p = this.wheelItem(i);
        stroke(ctx, [c, p], '#d5d9e0', 3);
        if (mg.gone[i]) continue;
        if (i % 2) { stroke(ctx, [v(p.x - 4, p.y - 12), v(p.x - 10, p.y - 20)], '#8a6a3c', 2.4); disc(v(p.x - 11, p.y - 21), 3 + Math.sin(this.lt * 30), '#f59e0b'); disc(p, 14, '#1f2937'); }
        else drawApple(ctx, p, 14, 0);
      }
      disc(c, 12, '#2b2e36');
    }
  }

  // ---- levels 45-60: 16 redesigned & action-packed levels ------------------------
  // ---- levels 45-60 and 75-84 live in mini5.ts / mini6.ts ----------------------------------
  private get host(): Host {
    return this as unknown as Host;
  }
  private resetMini3() {
    reset5(this.host);
    reset6(this.host);
  }
  private updateMini3(dt: number, live: boolean, _secs: number) {
    update5(this.host, dt, live);
    update6(this.host, dt, live);
  }
  private collideMini3(s: Shot): boolean | null {
    const r5 = collide5(this.host, s);
    if (r5 !== null) return r5;
    return collide6(this.host, s);
  }
  private drawMini3() {
    draw5(this.host);
    draw6(this.host);
  }

  // ---- levels where the archer is part of the gimmick --------------------------------
  /** floating in space, bouncing on spring shoes, or flying with a jetpack */
  private applyLift(dt: number) {
    const a = this.a;
    const d = this.def;
    const armed = a.phase !== 'idle' && a.phase !== 'grab'; // the bow stand is on the floor
    const space = d.kind === 'moon' || !!d.lab?.space;
    let lift = 0;
    let toe = 0;
    a.duck = 0;
    if (space) {
      this.hov = damp(this.hov, armed ? 1 : 0, 2.5, dt);
      const zeroG = d.lab?.g === 0;
      lift = this.hov * ((zeroG ? 86 : 30) + (zeroG ? 14 : 6) * Math.sin(a.time * 1.35));
      if (zeroG) a.recoil = 0.08 * Math.sin(a.time * 1.1) * this.hov;
      toe = 0.32 * this.hov;
    } else if (d.v?.spring) {
      this.hov = damp(this.hov, armed && !this.result ? 1 : 0, 4, dt);
      this.hopT += dt;
      const ph = (this.hopT % 1.05) / 1.05;
      const air = 0.76;
      const sq = ph < air ? 0 : Math.sin((Math.PI * (ph - air)) / (1 - air)); // squash on landing
      lift = this.hov * (16 - 7 * sq + (ph < air ? 4 * (ph / air) * (1 - ph / air) * 92 : 0));
      a.duck = this.hov * 12 * sq;
      toe = ph < air ? 0.25 * this.hov : 0;
    } else if (d.v?.jetpack) {
      const thrust = armed && !this.result && !!this.drag;
      this.jetV = clamp(this.jetV + (thrust ? 720 : -520) * dt, -260, 270);
      this.jetH = clamp(this.jetH + this.jetV * dt, 0, 255);
      if ((this.jetH <= 0 && this.jetV < 0) || (this.jetH >= 255 && this.jetV > 0)) this.jetV = 0;
      this.hov = clamp(this.jetH / 38, 0, 1);
      lift = this.jetH;
      toe = 0.28 * this.hov;
      if (thrust && Math.random() < 0.65) {
        this.parts.push({
          p: v(a.x - 18, GROUND - lift - 102),
          vel: v(-45 + (Math.random() - 0.5) * 40, 170 + Math.random() * 90),
          life: 0, max: 0.28, size: 3.5 + Math.random() * 2.5,
          color: Math.random() < 0.5 ? '#f97316' : '#fde047',
          kind: 'drop', rot: 0, vr: 0,
        });
      }
    }
    a.ground = GROUND - lift;
    if (lift < 0.01) return;
    const gy = a.ground - STANCE.ankle;
    const k = clamp(this.hov, 0, 1);
    const dangle = space || d.v?.jetpack ? 9 * k : 0;
    a.footB = v(lerp(a.footB.x, a.x + STANCE.back * 0.8, k), gy - dangle + (space ? 3 * Math.sin(a.time * 2.1) : 0));
    a.footF = v(lerp(a.footF.x, a.x + STANCE.front * 0.75, k), gy - dangle + (space ? 3 * Math.sin(a.time * 2.1 + 1.7) : 0));
    a.rotB = toe;
    a.rotF = toe;
  }
  private drawSprings() {
    if (this.hov < 0.05) return;
    for (const f of [this.a.footB, this.a.footF]) {
      const top = f.y + 10;
      const bot = Math.min(GROUND, top + 18);
      const pts: V[] = [v(f.x + 4, top)];
      for (let i = 1; i < 4; i++) pts.push(v(f.x + 4 + (i % 2 ? 7 : -7), top + ((bot - top) * i) / 4));
      pts.push(v(f.x + 4, bot));
      stroke(this.ctx, pts, '#6b7280', 2.6);
    }
  }

  // ---- levels 63-74: zombies with 11-joint Verlet ragdoll & 10 unique levels -----------
  private isZLevel(k?: string) {
    return k === 'zshow' || k === 'zrun' || k === 'zarmor' || k === 'zboss';
  }

  private resetMini4() {
    const k = this.mini;
    const mg = this.mg;
    const T = this.T;
    mg.props = [] as LooseProp[];
    if (k === 'zshow') {
      const boxes = [1, 2, 3].map((i) => ({
        l: T - 296 + i * 110, r: T - 224 + i * 110, top: GROUND - i * 55, bounce: 0.25,
      }));
      mg.zs = [0, 1, 2, 3].map((i) =>
        makeZombie(T - 260 + i * 110, GROUND - i * 55, GROUND, 0.22, 0, { boxes, variant: i % 3 }),
      );
    } else if (k === 'zrun') {
      Object.assign(mg, { zs: [] as ZombieState[], spawn: 0.8, sent: 0, total: 9 });
    } else if (k === 'zarmor') {
      Object.assign(mg, { zs: [] as ZombieState[], spawn: 0.7, sent: 0, total: 6 });
    } else if (k === 'zboss') {
      const altar = { l: T - 10, r: T + 96, top: GROUND - 92, bounce: 0.25 };
      const boss = makeZombie(T + 42, GROUND - 92, GROUND, 0.28, 0, {
        isBoss: true, hp: 5, scale: 1.24, boxes: [altar], variant: 0,
      });
      Object.assign(mg, { zs: [boss] as ZombieState[], boss, altar, summonT: 2.2, orbT: 3.4, orbs: [] as { p: V; vel: V }[] });
    } else if (k === 'giant') {
      this.men = [makeTarget(0, T + 55, GROUND, 'cross')];
      this.goals = [{ label: tx('Smash 3 walls & shoot apple', 'Jebol 3 tembok & panah apel'), done: false }];
      this.appleGoal = [0];
      mg.walls = [-330, -200, -70].map((dx) => ({ x: T + dx, intact: true }));
      mg.planks = [] as { p: V; vel: V; rot: number; vr: number }[];
    } else if (k === 'split') {
      this.men = [makeTarget(0, T, GROUND, 'cross')];
      this.goals = [{ label: tx('Apples pierced 0/3', 'Apel tertusuk 0/3'), done: false }];
      this.appleGoal = [-1];
      mg.extra = [
        { p: v(T, GROUND - 315), alive: true },
        { p: v(T - 6, GROUND - 78), alive: true },
      ];
    } else if (k === 'boomerang') {
      this.men = [makeTarget(0, T - 35, GROUND, 'cross')];
      this.goals = [{ label: tx('Apple from behind', 'Apel dari belakang'), done: false }];
      this.appleGoal = [0];
    } else if (k === 'tornado') {
      this.men = [makeTarget(0, T, GROUND, 'hold')];
      this.goals = [{ label: tx('Apple behind the storm', 'Apel di balik badai'), done: false }];
      this.appleGoal = [0];
      mg.tx = T - 340;
    } else if (k === 'bombarrow') {
      const m = makeTarget(0, T, GROUND, 'cross');
      m.hasApple = false;
      this.men = [m];
      this.goals = [{ label: tx('Apple crates blown 0/3', 'Peti apel meledak 0/3'), done: false }];
      mg.crates = [
        { p: v(T - 205, GROUND - 36), alive: true },
        { p: v(T + 145, GROUND - 36), alive: true },
        { p: v(T - 25, GROUND - 318), alive: true, hang: true },
      ];
      mg.waves = [] as { p: V; r: number; alpha: number }[];
    }
  }

  private updateMini4(dt: number, live: boolean) {
    const k = this.mini;
    const mg = this.mg;
    const a = this.a;
    const T = this.T;

    // Step loose zombie helmets/shields/crowns
    for (const pr of mg.props ?? []) {
      pr.vel.y += GRAV * dt;
      pr.p = add(pr.p, mul(pr.vel, dt));
      pr.rot += pr.vr * dt;
      if (pr.p.y > GROUND - 10) {
        pr.p.y = GROUND - 10;
        pr.vel = v(pr.vel.x * 0.65, Math.abs(pr.vel.y) > 90 ? -pr.vel.y * 0.32 : 0);
        pr.vr = pr.vel.x / 18;
      }
    }

    if (k === 'giant') {
      for (const pl of mg.planks) {
        pl.vel.y += GRAV * dt;
        pl.p = add(pl.p, mul(pl.vel, dt));
        pl.rot += pl.vr * dt;
        if (pl.p.y > GROUND - 8) {
          pl.p.y = GROUND - 8;
          pl.vel = v(pl.vel.x * 0.6, 0);
          pl.vr = 0;
        }
      }
      const down = mg.walls.filter((w: any) => !w.intact).length;
      this.miniLabel(tx(`Walls smashed ${down}/3 · Hit the apple`, `Tembok jebol ${down}/3 · Panah apelnya`));
      return;
    }

    if (k === 'split') {
      for (const s of [...this.shots]) {
        if (s.state === 'fly' && !(s as any).splitDone && s.t >= 0.14) {
          (s as any).splitDone = true;
          const sp = len(s.vel);
          for (const da of [-0.095, 0.095]) {
            const ang = s.ang + da;
            const clone: Shot = {
              ...s,
              tip: { ...s.tip },
              vel: fromAngle(ang, sp),
              ang,
              ride: null,
            };
            (clone as any).splitDone = true;
            this.shots.push(clone);
          }
          this.burst(s.tip, 8, ['#fbbf24', '#fde68a', '#ffffff'], 'star', 190);
          this.popText(add(s.tip, v(0, -42)), tx('TRIPLE SPLIT!', 'BELAH 3!'), '#f59e0b', 24);
          sfx.click();
        }
      }
      const got = (this.men[0] && !this.men[0].hasApple ? 1 : 0) + mg.extra.filter((e: any) => !e.alive).length;
      this.miniLabel(tx(`Apples pierced ${got}/3`, `Apel tertusuk ${got}/3`));
      if (got >= 3 && !this.result) {
        if (this.men[0] && !this.men[0].rag) this.men[0].mood = 'approve';
        this.miniWin(v(T, GROUND - 210), tx('THREE BRANCHES!', 'TIGA CABANG!'));
      }
      return;
    }

    if (k === 'boomerang') {
      this.miniLabel(tx('Arc the boomerang arrow past the shield', 'Lambungkan panah bumerang melewati tameng'));
      return;
    }

    if (k === 'tornado') {
      mg.tx = T - 350 + 75 * Math.sin(this.lt * 1.35);
      if (live && a.phase !== 'grab') {
        // Gale wind pushes the archer backward along the lane
        a.x = clamp(a.x - 56 * dt, START_X - ZONE_BACK, START_X + ZONE_FWD);
        a.recoil = -0.09;
      }
      if (Math.random() < 0.45) {
        this.parts.push({
          p: v(mg.tx + (Math.random() - 0.5) * 90, GROUND - 20 - Math.random() * 340),
          vel: v(-220 - Math.random() * 120, -260 - Math.random() * 140),
          life: 0, max: 0.45, size: 3 + Math.random() * 2,
          color: Math.random() < 0.5 ? '#94a3b8' : '#cbd5e1',
          kind: 'drop', rot: 0, vr: 8,
        });
      }
      this.miniLabel(tx('Fight the gale & aim low through the tornado', 'Lawan angin topan & bidik rendah melewati tornado'));
      return;
    }

    if (k === 'bombarrow') {
      for (const w of mg.waves) {
        w.r += 480 * dt;
        w.alpha = Math.max(0, w.alpha - 2.6 * dt);
      }
      mg.waves = mg.waves.filter((w: any) => w.alpha > 0.02);
      this.miniLabel(tx(`Apple crates blown ${mg.n}/3`, `Peti apel meledak ${mg.n}/3`));
      return;
    }

    if (!this.isZLevel(k)) return;

    if (k === 'zrun' || k === 'zarmor' || k === 'zboss') {
      if (a.quiver < 2) a.quiver = this.def.arrows;
      this.shots = this.shots.filter((s) => !(s.state === 'stuck' && s.stuckT > 2.5));
    }

    if (k === 'zrun' && live && mg.sent < mg.total && (mg.spawn -= dt) <= 0) {
      mg.spawn = Math.max(0.95, 1.9 - mg.sent * 0.11);
      mg.zs.push(makeZombie(T + 70, GROUND, GROUND, 1, 76 + Math.random() * 38 + mg.sent * 3.5, { variant: mg.sent % 3 }));
      mg.sent++;
    } else if (k === 'zarmor' && live && mg.sent < mg.total && (mg.spawn -= dt) <= 0) {
      const i = mg.sent;
      mg.spawn = 2.05;
      const cfg = [
        { helmet: true, shield: false },
        { helmet: false, shield: true },
        { helmet: true, shield: true },
        { helmet: false, shield: true },
        { helmet: true, shield: true },
        { helmet: true, shield: true, scale: 1.12 },
      ][i];
      mg.zs.push(makeZombie(T + 75, GROUND, GROUND, 1, 68 + i * 4, { ...cfg, variant: i % 3 }));
      mg.sent++;
    } else if (k === 'zboss' && live && mg.boss?.alive) {
      const aliveMinions = mg.zs.filter((z: ZombieState) => !z.isBoss && z.alive).length;
      if ((mg.summonT -= dt) <= 0 && aliveMinions < 3) {
        mg.summonT = 4.2;
        const zx = T - 70 - Math.random() * 70;
        mg.zs.push(makeZombie(zx, GROUND, GROUND, 1, 80 + Math.random() * 20, { helmet: Math.random() < 0.45 }));
        this.burst(v(zx, GROUND - 90), 14, ['#a855f7', '#c084fc', '#22c55e'], 'star', 240);
        this.popText(v(zx, GROUND - 170), tx('ARISE!', 'BANGKIT!'), '#a855f7', 26);
        sfx.warp();
      }
      if ((mg.orbT -= dt) <= 0) {
        mg.orbT = 3.3;
        const from = v(mg.boss.x - 36, mg.boss.gy - 135);
        const to = this.chest();
        const flightT = 1.65;
        const vx = (to.x - from.x) / flightT;
        const vy = (to.y - from.y - 0.5 * 340 * flightT * flightT) / flightT;
        mg.orbs.push({ p: from, vel: v(vx, vy) });
        this.burst(from, 8, ['#a855f7', '#4ade80'], 'star', 160);
        sfx.beam();
      }
    }

    if (k === 'zboss') {
      const chest = this.chest();
      for (const orb of [...mg.orbs]) {
        orb.vel.y += 340 * dt;
        orb.p = add(orb.p, mul(orb.vel, dt));
        if (!this.result && dist(orb.p, chest) < 28) {
          mg.orbs.splice(mg.orbs.indexOf(orb), 1);
          this.burst(orb.p, 18, ['#a855f7', '#4ade80', '#ffffff'], 'star', 280);
          this.hurtMe('curse', orb.p);
          return;
        }
        if (orb.p.y > GROUND - 10 || orb.p.x < -300) {
          mg.orbs.splice(mg.orbs.indexOf(orb), 1);
        }
      }
    }

    for (const z of mg.zs as ZombieState[]) {
      updateZombie(z, dt, !this.result && k !== 'zshow');
      if (z.alive && !z.isBoss && k !== 'zshow' && !this.result && z.x < a.x + 54) {
        this.recoilV -= 3;
        this.miniLose('bite', v(a.x + 40, GROUND - 130), tx('BITTEN!', 'DIGIGIT!'));
      }
    }

    if (k !== 'zshow') {
      mg.zs = (mg.zs as ZombieState[]).filter((z) => z.alive || z.isBoss || z.deadT < 5.5);
    }

    if (k === 'zboss') {
      this.miniLabel(tx(`Zombie King HP ${Math.max(0, mg.boss.hp)}/${mg.boss.maxHp}`, `HP Raja Zombie ${Math.max(0, mg.boss.hp)}/${mg.boss.maxHp}`));
    } else {
      const targetN = k === 'zrun' ? 9 : k === 'zarmor' ? 6 : 4;
      this.miniLabel(tx(`Zombies down ${mg.n}/${targetN}`, `Zombie tumbang ${mg.n}/${targetN}`));
    }
  }

  private detonateBombArrow(at: V) {
    const mg = this.mg;
    mg.waves.push({ p: { ...at }, r: 12, alpha: 0.9 });
    this.burst(at, 26, ['#ef4444', '#f97316', '#fde047', '#1f2937'], 'drop', 440);
    this.burst(at, 10, ['#fde047', '#f97316'], 'star', 340);
    this.shake = Math.max(this.shake, 15);
    sfx.boom();

    const m = this.men[0];
    if (m && !m.rag) {
      const bodyC = v(m.x, m.y - 105);
      if (dist(at, bodyC) < 98) {
        const push = mul(sub(bodyC, at), 5.5);
        toRagdoll(m, v(push.x, -420));
        this.miniLose('bomb', at, tx('MR. BEJO BLEW UP!', 'PAK BEJO IKUT MELEDAK!'));
        return;
      }
    }

    for (const cr of mg.crates) {
      if (!cr.alive || dist(at, cr.p) > 142) continue;
      cr.alive = false;
      mg.n++;
      this.loose.push({
        kind: 'apple',
        p: v(cr.p.x, cr.p.y - 26),
        vel: v((cr.p.x - at.x) * 2.2, -320),
        rot: 0, vr: 8,
      });
      this.burst(cr.p, 14, ['#c58f52', '#8a5a2e', '#fde047'], 'drop', 280);
      this.popText(add(cr.p, v(0, -56)), tx('HIT!', 'KENA!'), '#16a34a', 30);
      sfx.crunch();
    }

    if (!this.result && mg.n >= 3) {
      if (m && !m.rag) m.mood = 'approve';
      this.miniWin(at, tx('PERFECT BLAST!', 'LEDAKAN TEPAT!'));
    }
  }

  private collideMini4(s: Shot): boolean | null {
    const k = this.mini;
    const mg = this.mg;
    const tip = s.tip;
    const T = this.T;

    if (k === 'giant') {
      for (const w of mg.walls) {
        if (w.intact && tip.x > w.x - 10 && tip.x < w.x + 14 && tip.y > GROUND - 255 && tip.y < GROUND) {
          w.intact = false;
          for (let i = 0; i < 6; i++) {
            mg.planks.push({
              p: v(w.x, GROUND - 40 - i * 38),
              vel: v(180 + Math.random() * 240, -140 - Math.random() * 220),
              rot: Math.random(), vr: (Math.random() - 0.5) * 14,
            });
          }
          this.burst(tip, 14, ['#c58f52', '#8a5a2e', '#fde68a'], 'drop', 300);
          this.popText(add(tip, v(0, -50)), tx('SMASHED!', 'JEBOL!'), '#f97316', 28);
          this.shake = Math.max(this.shake, 9);
          sfx.slam();
          s.vel = mul(s.vel, 0.88);
          return false;
        }
      }
      return null;
    }

    if (k === 'split') {
      for (const ex of mg.extra) {
        if (ex.alive && dist(tip, ex.p) < APPLE_R + 7) {
          ex.alive = false;
          this.appleFx(s, { ...ex.p });
          return false;
        }
      }
      return null;
    }

    if (k === 'boomerang') {
      // Front steel shield protecting Pak Bejo
      if (Math.abs(tip.x - (T - 92)) < 8 && tip.y > GROUND - 250 && tip.y < GROUND - 105) {
        this.burst(tip, 7, ['#bae6fd', '#38bdf8', '#ffffff'], 'star', 190);
        this.popText(add(tip, v(-36, -34)), tx('CLANG!', 'TENG!'), '#0ea5e9', 26);
        sfx.ting();
        this.tumble(s);
        return true;
      }
      // Returning boomerang can hit the archer!
      if (s.vel.x < 0 && !this.result) {
        const P = this.pose;
        if (segDist(tip, P.hip, P.neck).d < 13 || dist(tip, P.headC) < 16) {
          const d0 = sub(P.neck, P.hip);
          const Ln = len(d0) || 1;
          const rel = sub(add(tip, fromAngle(s.ang, 8)), P.hip);
          this.meStick = {
            u: (rel.x * d0.x + rel.y * d0.y) / (Ln * Ln),
            w: (d0.x * rel.y - d0.y * rel.x) / Ln,
            rel: s.ang - Math.atan2(d0.y, d0.x),
          };
          this.shots.splice(this.shots.indexOf(s), 1);
          this.hurtMe('self', tip);
          return true;
        }
      }
      return null;
    }

    if (k === 'bombarrow') {
      for (const cr of mg.crates) {
        if (cr.alive && Math.abs(tip.x - cr.p.x) < 32 && Math.abs(tip.y - cr.p.y) < 32) {
          this.shots.splice(this.shots.indexOf(s), 1);
          this.detonateBombArrow(tip);
          return true;
        }
      }
      if (tip.y >= GROUND - 4) {
        this.shots.splice(this.shots.indexOf(s), 1);
        this.detonateBombArrow(v(tip.x, GROUND - 4));
        return true;
      }
      return null;
    }

    if (!this.isZLevel(k)) return null;

    // Intercepting Necromancer's curse orbs in mid-air
    if (k === 'zboss') {
      for (const orb of mg.orbs) {
        if (dist(tip, orb.p) < 25) {
          mg.orbs.splice(mg.orbs.indexOf(orb), 1);
          this.burst(orb.p, 16, ['#a855f7', '#4ade80', '#ffffff'], 'star', 260);
          this.popText(add(orb.p, v(0, -40)), tx('SHATTERED!', 'PECAH!'), '#a855f7', 26);
          sfx.shatter();
          return false;
        }
      }
    }

    for (const z of mg.zs as ZombieState[]) {
      if (!z.alive) continue;
      const hit = hitTestZombie(z, tip);
      if (!hit) continue;

      // 1. Hit on Iron Bucket Helmet
      if (hit.part === 'helmet') {
        z.hasHelmet = false;
        z.kb = 220;
        z.hurtV = -5.2;
        z.dipV += 280;
        const hp = zombieHeadPos(z);
        mg.props.push({ kind: 'helmet', p: v(hp.x, hp.y - 12), vel: v(s.vel.x * 0.16 + 95, -280), rot: 0, vr: 11 });
        this.burst(tip, 8, ['#cbd5e1', '#94a3b8', '#ffffff'], 'star', 210);
        this.popText(add(hp, v(0, -48)), tx('HELMET OFF!', 'HELM LEPAS!'), '#0ea5e9', 24);
        this.shake = Math.max(this.shake, 5);
        sfx.ting();
        this.tumble(s);
        return true;
      }

      // 2. Hit on Wooden Buckler Shield
      if (hit.part === 'shield') {
        z.shieldHp--;
        z.kb = 230;
        z.hurtV = -3.8;
        this.shake = Math.max(this.shake, 5);
        if (z.shieldHp <= 0) {
          z.hasShield = false;
          mg.props.push({ kind: 'shield', p: v(tip.x, tip.y), vel: v(90, -230), rot: 0, vr: 9 });
          this.burst(tip, 12, ['#c58f52', '#8a5a2e', '#cbd5e1'], 'drop', 240);
          this.popText(add(tip, v(-10, -44)), tx('SHIELD BROKEN!', 'PERISAI HANCUR!'), '#f97316', 24);
          sfx.slam();
        } else {
          this.burst(tip, 6, ['#c58f52', '#8a5a2e'], 'drop', 160);
          this.popText(add(tip, v(-10, -40)), tx('SHIELD CRACKED!', 'PERISAI RETAK!'), '#d97706', 22);
          sfx.thunk();
        }
        this.tumble(s);
        return true;
      }

      this.shots.splice(this.shots.indexOf(s), 1);

      // 3. Vital Point Hit: Head or Pulsing Undead Heart Core!
      if (hit.part === 'head' || hit.part === 'heart') {
        z.hp--;
        const vitalAt = hit.part === 'head' ? zombieHeadPos(z) : zombieHeartPos(z);
        if (z.hp <= 0) {
          ragdollZombie(z, hit, tip, s.ang, s.vel);
          mg.n++;
          this.burst(vitalAt, 16, ['#8fb573', '#dc2626', '#fde68a', '#ffffff'], 'drop', 320);
          this.burst(vitalAt, 6, ['#ffd23f', '#22c55e'], 'star', 260);
          this.shake = Math.max(this.shake, 8);
          this.slowT = Math.max(this.slowT, 0.22);
          sfx.crunch();

          if (z.isBoss) {
            mg.props.push({ kind: 'crown', p: v(vitalAt.x, vitalAt.y - 18), vel: v(110, -310), rot: 0, vr: 10 });
            for (const m of mg.zs as ZombieState[]) {
              if (m.alive && !m.isBoss) ragdollZombie(m, { part: 'head', a: 1, b: 0 }, zombieHeadPos(m), 0, v(250, -180));
            }
            this.miniWin(vitalAt, tx('ZOMBIE KING DEFEATED!', 'RAJA ZOMBIE TUMBANG!'));
            return true;
          }

          const targetN = k === 'zrun' ? 9 : k === 'zarmor' ? 6 : 4;
          if (k !== 'zboss' && mg.n >= targetN) {
            if (k === 'zrun' || k === 'zarmor') this.starOv = this.fired <= targetN + 3 ? 3 : this.fired <= targetN + 7 ? 2 : 1;
            this.miniWin(vitalAt, k === 'zshow' ? tx('CLEARED!', 'BERSIH!') : tx('SURVIVED!', 'SELAMAT!'));
          } else {
            this.popText(add(vitalAt, v(0, -48)), hit.part === 'head' ? 'HEADSHOT!' : tx('VITAL HIT!', 'TITIK VITAL!'), '#16a34a', 27);
          }
        } else {
          // Boss took a vital hit but still has HP left
          lodgeArrowInZombie(z, hit.a, hit.b, add(tip, fromAngle(s.ang, 10)), s.ang);
          z.hurtV = -6.5;
          z.dipV += 420;
          this.burst(vitalAt, 12, ['#a855f7', '#fde047', '#dc2626'], 'star', 260);
          this.popText(add(vitalAt, v(0, -54)), tx(`CRITICAL! ${z.hp} LEFT`, `KRITIS! SISA ${z.hp}`), '#a855f7', 26);
          this.shake = Math.max(this.shake, 7);
          sfx.ouch();
        }
        return true;
      }

      // 4. Non-vital Limb or Belly Hit: arrow lodges into that exact bone!
      lodgeArrowInZombie(z, hit.a, hit.b, add(tip, fromAngle(s.ang, 10)), s.ang);
      z.kb = 250;
      z.hurtV = -4.5;
      z.dipV += 340;
      this.burst(tip, 7, ['#8fb573', '#6f9457'], 'drop', 180);
      if (hit.part === 'thigh' || hit.part === 'shin') {
        z.crippled = true;
        if (z.hasShield && --z.shieldHp <= 0) {
          z.hasShield = false;
          mg.props.push({ kind: 'shield', p: v(z.x - 20, z.gy - 100), vel: v(70, -180), rot: 0, vr: 7 });
        }
        this.popText(add(tip, v(-20, -36)), tx('LEG! CRIPPLED!', 'KAKI! PINCANG!'), '#f59e0b', 22);
      } else {
        this.popText(add(tip, v(-20, -36)), tx('AIM FOR HEAD / HEART!', 'BIDIK KEPALA / JANTUNG!'), '#6b7280', 20);
      }
      sfx.tuk();
      return true;
    }

    if (k === 'zshow') {
      for (let i = 1; i < 4; i++) {
        if (Math.abs(tip.x - (T - 260 + i * 110)) < 36 && tip.y > GROUND - i * 55 && tip.y < GROUND) {
          s.tip = add(tip, fromAngle(s.ang, 8));
          s.state = 'stuck';
          s.embed = 11;
          sfx.thunk();
          return true;
        }
      }
    }
    if (k === 'zboss' && tip.x > T - 10 && tip.x < T + 96 && tip.y > GROUND - 92 && tip.y < GROUND) {
      s.tip = add(tip, fromAngle(s.ang, 8));
      s.state = 'stuck';
      s.embed = 11;
      sfx.thunk();
      return true;
    }
    return null;
  }

  private drawMini4() {
    const k = this.mini;
    const mg = this.mg;
    const ctx = this.ctx;
    const T = this.T;

    if (k === 'giant') {
      for (const w of mg.walls) {
        if (w.intact) drawWoodWall(ctx, w.x - 10, w.x + 12, GROUND, 255);
      }
      for (const pl of mg.planks) {
        ctx.save();
        ctx.translate(pl.p.x, pl.p.y);
        ctx.rotate(pl.rot);
        ctx.fillStyle = '#c58f52';
        ctx.fillRect(-16, -6, 32, 12);
        ctx.restore();
      }
      return;
    }

    if (k === 'split') {
      // Top apple hanging from rod + bottom apple on crate
      const [topA, botA] = mg.extra;
      stroke(ctx, [v(topA.p.x, GROUND - 520), v(topA.p.x, topA.p.y - 12)], '#9aa3ad', 3, 'butt');
      if (topA.alive) drawApple(ctx, topA.p, APPLE_R, 0);
      drawWoodWall(ctx, botA.p.x - 22, botA.p.x + 22, GROUND, 64);
      if (botA.alive) drawApple(ctx, botA.p, APPLE_R, 0);
      return;
    }

    if (k === 'boomerang') {
      // Steel shield protecting the front of Pak Bejo's apple & head
      stroke(ctx, [v(T - 92, GROUND), v(T - 92, GROUND - 110)], '#7b8491', 5, 'butt');
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(T - 97, GROUND - 250, 10, 145, 5);
      ctx.fill();
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(T - 95, GROUND - 244, 4, 133);
      return;
    }

    if (k === 'tornado') {
      const tx = mg.tx ?? T - 350;
      ctx.save();
      for (let i = 0; i < 18; i++) {
        const u = i / 17;
        const y = GROUND - 12 - u * 370;
        const rx = 18 + u * 64 + 6 * Math.sin(this.lt * 12 + i);
        const sx = tx + 14 * Math.sin(this.lt * 6 + u * 4);
        ctx.strokeStyle = i % 2 ? 'rgba(100,116,139,0.34)' : 'rgba(148,163,184,0.45)';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.ellipse(sx, y, rx, 9 + u * 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (k === 'bombarrow') {
      for (const cr of mg.crates) {
        if (cr.hang) {
          stroke(ctx, [v(cr.p.x, GROUND - 540), v(cr.p.x, cr.p.y + 18)], '#9aa3ad', 3, 'butt');
          ctx.fillStyle = '#7b8491';
          ctx.fillRect(cr.p.x - 32, cr.p.y + 14, 64, 8);
        }
        if (!cr.alive) continue;
        drawWoodWall(ctx, cr.p.x - 26, cr.p.x + 26, cr.p.y + 22, 44);
        // Red blast bullseye painted on the crate
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cr.p.x, cr.p.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cr.p.x, cr.p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        drawApple(ctx, v(cr.p.x, cr.p.y - 34), APPLE_R, 0);
      }
      for (const w of mg.waves) {
        ctx.save();
        ctx.globalAlpha = w.alpha;
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(w.p.x, w.p.y, w.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    if (!this.isZLevel(k)) return;

    if (k === 'zshow') {
      for (let i = 1; i < 4; i++) {
        drawWoodWall(ctx, T - 296 + i * 110, T - 224 + i * 110, GROUND, i * 55);
      }
    } else if (k === 'zboss') {
      // Dark Necromancer stone altar
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.roundRect(T - 10, GROUND - 92, 106, 92, 6);
      ctx.fill();
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(T - 10, GROUND - 92, 106, 6);
      for (const orb of mg.orbs) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(orb.p.x, orb.p.y, 22 + 3 * Math.sin(this.lt * 20), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(orb.p.x, orb.p.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e1b4b';
        ctx.beginPath();
        ctx.arc(orb.p.x - 4, orb.p.y - 2, 2.5, 0, Math.PI * 2);
        ctx.arc(orb.p.x + 3, orb.p.y - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    for (const z of mg.zs as ZombieState[]) {
      ctx.save();
      if (!z.alive && k !== 'zshow') {
        ctx.globalAlpha = clamp((5.5 - z.deadT) / 1.0, 0, 1);
      }
      drawZombieFull(ctx, z, this.lt);
      ctx.restore();
    }

    for (const pr of mg.props as LooseProp[]) {
      if (pr.kind === 'helmet') drawHelmetProp(ctx, pr.p, pr.rot, 1);
      else if (pr.kind === 'shield') drawShieldProp(ctx, pr.p, pr.rot, 1, true);
      else {
        ctx.save();
        ctx.translate(pr.p.x, pr.p.y);
        ctx.rotate(pr.rot);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-12, -6, 24, 12);
        ctx.restore();
      }
    }
  }

  private get lab(): LabCfg | undefined {
    return this.def.lab;
  }
  /** apple-rain style levels: no close-up slow motion on the bystanders */
  private party() {
    return this.def.kind === 'rain' || !!this.lab?.rain;
  }
  private labWalls(): [number, number, number][] {
    const L = this.lab!;
    const std: [number, number, number] = [WALL.x0, WALL.x1, WALL.h];
    return L.wall ? [...(L.walls ?? []), std] : L.walls ?? [];
  }
  private magAt(m: MagCfg): V {
    return v(this.T + m.x + (m.rail ? m.rail * Math.sin((m.railW ?? 1) * this.lt) : 0), GROUND - m.h);
  }
  /** 0 = off, 1 = pulling, -1 = pushing */
  private magPol(m: MagCfg): number {
    const on = m.on ?? 2;
    if (!m.hole && m.off && (this.lt + (m.ph ?? 0)) % (on + m.off) >= on) return 0;
    return (m.pol ?? 1) * (m.swap && Math.floor(this.lt / m.swap) % 2 ? -1 : 1);
  }
  private labField(p: V): V {
    const wind = this.windNow();
    let ax = -0.3 * wind;
    let ay = wind;
    for (const m of this.lab!.mags ?? []) {
      const pol = this.magPol(m);
      if (!pol) continue;
      const c = this.magAt(m);
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = Math.hypot(dx, dy);
      const reach = m.reach ?? MAG.reach;
      if (d < 1 || d > reach) continue;
      const f = pol * Math.min(m.max ?? MAG.max, (m.k ?? MAG.k) / (d * d)) * clamp((reach - d) / 60, 0, 1);
      ax += (f * dx) / d;
      ay += (f * dy) / d;
    }
    return v(ax, ay);
  }
  /** where one end of a portal pair is right now, and which way it faces */
  private gate(P: PortCfg, end: 0 | 1): Gate {
    const q = end ? P.b : P.a;
    let y = GROUND - q[1];
    let ang = q[2];
    if (!end && P.bob) y -= P.bob * Math.sin((P.bobW ?? 1.5) * this.lt);
    if (end && P.swing) ang += (P.swing * (1 - Math.cos((P.swingW ?? 1.5) * this.lt))) / 2;
    return { c: v(this.T + q[0], y), n: fromAngle(ang), ang };
  }
  /** if the step p0 -> p1 goes into the front of a portal: where and how it comes out of the other one */
  private warp(p0: V, p1: V, w: V): { p: V; v: V; pair: number; from: 0 | 1; out: Gate } | null {
    const ports = this.lab?.ports;
    if (!ports) return null;
    for (let i = 0; i < ports.length; i++) {
      const P = ports[i];
      const half = P.half ?? PORTAL.half;
      for (const from of [0, 1] as const) {
        if (from && P.nozzle) continue; // a funnel only lets things out
        const A = this.gate(P, from);
        const d0 = (p0.x - A.c.x) * A.n.x + (p0.y - A.c.y) * A.n.y;
        const d1 = (p1.x - A.c.x) * A.n.x + (p1.y - A.c.y) * A.n.y;
        if (d0 <= 0 || d1 > 0) continue;
        const k = d0 / (d0 - d1);
        const tA = v(-A.n.y, A.n.x);
        const off = (lerp(p0.x, p1.x, k) - A.c.x) * tA.x + (lerp(p0.y, p1.y, k) - A.c.y) * tA.y;
        if (Math.abs(off) > half - 3) continue;
        const B = this.gate(P, from ? 0 : 1);
        const tB = v(-B.n.y, B.n.x);
        const f = P.flip ?? 1;
        // speed into the entry becomes speed out of the exit; the sideways part is carried over
        const a = -(w.x * A.n.x + w.y * A.n.y);
        const b = w.x * tA.x + w.y * tA.y;
        const vel = P.nozzle ? mul(B.n, Math.min(2600, Math.hypot(w.x, w.y))) : add(mul(B.n, a), mul(tB, f * b));
        const o = P.nozzle ? off * 0.15 : f * off;
        return { p: add(add(B.c, mul(tB, o)), mul(B.n, 5)), v: vel, pair: i, from, out: B };
      }
    }
    return null;
  }
  /** level 28: the conveyor of apples between the funnel and the floor portal */
  private column() {
    const P = this.lab!.ports![1];
    return { x: this.T + P.a[0], top: GROUND - P.b[1] + 18, bot: GROUND - 20 };
  }
  private selfApplePos(): V {
    return add(this.pose.headC, rot(v(-1, -30), this.pose.headRot));
  }
  private labLabel() {
    const L = this.lab!;
    if (!L.rain || !this.goals[0]) return;
    const need = L.need ?? 12;
    this.goals[0].label =
      L.rain === 'party'
        ? tx(`Apple kebabs ${Math.min(this.rainN, need)}/${need} · ${Math.ceil(this.rainT)}s`, `Sate apel ${Math.min(this.rainN, need)}/${need} · ${Math.ceil(this.rainT)} dtk`)
        : tx(`Longest kebab ${Math.min(this.best, need)}/${need} on one arrow`, `Sate terpanjang ${Math.min(this.best, need)}/${need} di satu panah`);
  }

  private resetLab() {
    const L = this.lab!;
    const T = this.T;
    this.pfx = [];
    this.magPrev = (L.mags ?? []).map(() => 9);
    this.colA = L.rain === 'loop' ? Array.from({ length: 7 }, (_, i) => ({ ph: i / 7, alive: true })) : [];
    this.best = 0;
    this.selfApple = !!L.self;
    if (L.man === 'none') this.men = [];
    if (L.man === 'float') {
      this.men[0].pose = 'hold';
      this.men[0].hold = 1;
    }
    if (L.men2) this.men.push(makeTarget(1, T + 96, GROUND, 'hips'));
    const boxes = this.labWalls().map(([x0, x1, h]) => ({ l: T + x0, r: T + x1, top: GROUND - h, bounce: 0.2 }));
    for (const man of this.men) man.boxes = boxes;
    if (L.rain) {
      for (const man of this.men) man.hasApple = false;
      this.goals = [{ label: '', done: false }];
      this.appleGoal = this.men.map(() => 0);
      this.rainT = L.time ?? 0;
    }
    if (L.self) this.goals = [{ label: tx('Apple on your own head', 'Apel di kepalamu sendiri'), done: false }];
    this.pendOn = !!L.pend;
    if (L.pend) {
      this.men[0].hasApple = false;
      this.goals = [{ label: tx('The swinging apple', 'Apel yang berayun'), done: false }];
    }
    if (L.row) {
      for (let i = 1; i < L.row; i++) this.men.push(makeTarget((i % 2) as 0 | 1, T + i * 82, GROUND, i % 2 ? 'hips' : 'cross'));
      this.goals = this.men.map((_, i) => ({ label: tx(`Apple ${i + 1}`, `Apel ${i + 1}`), done: false }));
      this.appleGoal = this.men.map((_, i) => i);
    }
    this.labLabel();
  }

  private updateLab(dt: number) {
    const L = this.lab!;
    const m = this.men[0];
    const started = this.a.phase !== 'idle';
    this.pfx = this.pfx.map((f) => damp(f, 0, 6, dt));
    // magnets: switching sounds, and whatever hangs on them
    (L.mags ?? []).forEach((mg, i) => {
      const pol = this.magPol(mg);
      if (pol !== this.magPrev[i]) {
        if (this.magPrev[i] !== 9 && dt > 0) (pol ? sfx.zap : sfx.click)();
        this.magPrev[i] = pol;
      }
      const c = this.magAt(mg);
      for (const s of this.shots) {
        if (s.magI !== i || s.state !== 'stuck' || !s.magOff) continue;
        s.tip = add(c, s.magOff);
        if (pol <= 0) {
          // it lets go (or even pushes): the arrow clatters down
          s.magI = undefined;
          s.mag = false;
          s.state = 'bounce';
          s.tip = sub(s.tip, fromAngle(s.ang, ARROW_LEN / 2));
          s.vel = v((Math.random() - 0.5) * 90, pol < 0 ? 260 : 0);
          s.spin = (Math.random() - 0.5) * 8;
        }
      }
    });
    if (L.cart && m && !m.rag) {
      m.x = this.T + L.cart.amp * Math.sin(L.cart.w * this.lt);
      m.y = GROUND - 24;
    }
    if (L.man === 'float' && m && !m.rag) {
      // weightless: he drifts and slowly tumbles around his own middle
      const th = 0.8 * this.lt + 0.5;
      const c = v(this.T, GROUND - 250 + 16 * Math.sin(this.lt * 0.7));
      m.tilt = th;
      m.x = c.x - 92 * Math.sin(th);
      m.y = c.y + 92 * Math.cos(th);
      m.air = 1;
      m.dipT = 5;
    }
    if (!L.rain) return;
    if (L.rain === 'party') {
      if (started && !this.result) {
        this.rainT -= dt;
        if (this.a.quiver < 2) this.a.quiver = this.def.arrows; // bottomless quiver: only the clock matters
        if (this.rainT <= 0) {
          this.rainT = 0;
          this.why = 'time';
          this.finish('lose');
        }
      }
      if (!this.result && dt > 0 && (this.rainSpawn -= dt) <= 0) {
        this.rainSpawn = (started ? 0.3 : 0.7) + Math.random() * 0.18;
        const n = Math.random() < 0.3 ? 3 : 1;
        const x0 = this.T - 600 + Math.random() * (740 - (n - 1) * 36);
        const vy = 26 + Math.random() * 40;
        for (let i = 0; i < n; i++) {
          this.rain.push({
            p: v(x0 + i * 36, GROUND - 720), vel: v((Math.random() - 0.5) * 16, vy), rot: Math.random() * 6,
            vr: (Math.random() - 0.5) * 4, state: 'air', t: 0, bonked: false,
          });
        }
      }
    } else if (L.rain === 'lines') {
      if (!this.result && dt > 0 && (this.rainSpawn -= dt) <= 0) {
        this.rainSpawn = 3.3;
        // a row of apples that will point exactly at the bow a few seconds from now
        const B = v(this.a.x, GROUND - 173 - 30 * this.hov);
        const al = 0.22 + Math.random() * 0.28;
        const R = 420 + Math.random() * 260;
        const n = Math.random() < 0.3 ? 6 : 5;
        const wait = 2.6 + Math.random() * 0.9;
        for (let i = 0; i < n; i++) {
          const r = R + (i - (n - 1) / 2) * 46;
          this.rain.push({
            p: v(B.x + Math.cos(al) * r, B.y - Math.sin(al) * r - 42 * wait), vel: v(0, 42), rot: Math.random() * 6,
            vr: (Math.random() - 0.5) * 3, state: 'air', t: 0, bonked: false, lin: true,
          });
        }
      }
    } else {
      const col = this.column();
      for (const c of this.colA) {
        c.ph += (dt * 200) / (col.bot - col.top);
        if (c.ph >= 1) {
          c.ph -= 1;
          c.alive = true; // a fresh apple drops out of the funnel
        }
      }
    }
    this.labLabel();
    this.rainStep(dt, 330 * Math.max(0.18, L.g ?? 1));
  }

  /** collisions of levels 21-30. null = nothing special, carry on with the usual checks */
  private collideLab(s: Shot): boolean | null {
    const L = this.lab!;
    const T = this.T;
    const tip = s.tip;
    const dir = fromAngle(s.ang);
    const gone = () => {
      this.shots.splice(this.shots.indexOf(s), 1);
      return true;
    };
    if (L.g === 0) {
      // with no gravity an arrow could circle a black hole forever
      s.odo = (s.odo ?? 0) + 4;
      if (s.odo > 14000) return gone();
    }
    for (const d of L.doors ?? []) {
      if (tip.x > T + d.x && tip.x < T + d.x + 18 && tip.y < GROUND && tip.y > GROUND - 330 && Math.abs(tip.y - this.doorMid(d)) > d.gap / 2) {
        if (!this.result) this.popText(add(tip, v(-36, -30)), tx('THUNK!', 'TOK!'), '#8a5a2e', 24);
        this.tumble(s);
        sfx.thunk();
        return true;
      }
    }
    if (L.fan) {
      const c = v(T + L.fan.x, GROUND - L.fan.h);
      for (let i = 0; i < L.fan.n; i++) {
        const end = add(c, fromAngle(L.fan.w * this.lt + (i * 2 * Math.PI) / L.fan.n, L.fan.r));
        if (segDist(tip, c, end).d < 7) {
          if (!this.result) this.popText(add(tip, v(-30, -34)), tx('THWACK!', 'TAK!'), '#6b7280', 24);
          this.burst(tip, 5, ['#cbd5e1', '#ffffff'], 'drop', 150);
          this.tumble(s);
          sfx.ting();
          return true;
        }
      }
    }
    if (this.pendOn && !this.result && dist(tip, this.pendAt()) < APPLE_R + 5) {
      const at = this.pendAt();
      this.pendOn = false;
      this.mark(0);
      this.appleFx(s, at);
      return false;
    }
    // portals first: one can be mounted right on a wall
    const tp = this.warp(sub(tip, mul(dir, 4.5)), tip, s.vel);
    if (tp) {
      const cols = tp.pair % 2 ? ['#22c55e', '#a855f7'] : ['#3b82f6', '#f97316'];
      const quiet = L.rain === 'loop' && tp.pair > 0; // the endless loop would be deafening
      this.burst({ ...tip }, quiet ? 3 : 6, [cols[tp.from], '#ffffff'], 'drop', 150);
      s.tip = tp.p;
      s.vel = tp.v;
      s.ang = Math.atan2(tp.v.y, tp.v.x);
      s.clip = undefined;
      s.clipC = tp.out.c;
      s.clipN = tp.out.n;
      this.pfx[tp.pair * 2] = 1;
      this.pfx[tp.pair * 2 + 1] = 1;
      if (!quiet) {
        this.burst({ ...s.tip }, 6, [cols[1 - tp.from], '#ffffff'], 'drop', 150);
        if (!this.result) this.popText(add(s.tip, v(tp.out.n.x * 46, tp.out.n.y * 46 - 64)), tx('ZAP!', 'ZWIP!'), cols[1 - tp.from], 26);
        sfx.warp();
      }
      return false;
    }
    for (const [x0, x1, h] of this.labWalls()) {
      if (tip.x > T + x0 && tip.x < T + x1 && tip.y > GROUND - h && tip.y < GROUND) {
        if (!this.result && !s.apples) this.popText(add(tip, v(s.vel.x > 0 ? -36 : 36, -30)), tx('THUNK!', 'TOK!'), '#8a5a2e', 24);
        s.tip = add(tip, mul(dir, 8));
        s.state = 'stuck';
        s.embed = 11;
        this.shake = Math.max(this.shake, 3);
        sfx.thunk();
        return true;
      }
    }
    const mags = L.mags ?? [];
    for (let i = 0; i < mags.length; i++) {
      const mg = mags[i];
      if (this.magPol(mg) <= 0) continue;
      const c = this.magAt(mg);
      if (dist(tip, c) >= (mg.hole ? 27 : 30)) continue;
      for (const man of this.men) man.brow = 1;
      if (mg.hole) {
        this.burst(c, 10, ['#7c3aed', '#c4b5fd', '#1f2937'], 'drop', 120);
        if (!this.result) this.popText(add(c, v(0, -62)), tx('SLURP!', 'SLURP!'), '#7c3aed', 28);
        this.shake = Math.max(this.shake, 4);
        sfx.warp();
        return gone();
      }
      // caught: it hangs from a pole by its steel point
      s.tip = v(c.x + clamp(tip.x - c.x, -30, 30), c.y - 5);
      s.state = 'stuck';
      s.embed = 0;
      s.stuckT = 0;
      s.mag = true;
      s.magI = i;
      s.magOff = sub(s.tip, c);
      this.burst(c, 6, ['#fde68a', '#f59e0b', '#ffffff'], 'star', 180);
      if (!this.result) this.popText(add(c, v(0, 52)), tx('CLANG!', 'KLANG!'), '#dc2626', 28);
      this.shake = Math.max(this.shake, 5);
      sfx.ting();
      return true;
    }
    if (L.ports && s.vel.x < 0 && !this.result) {
      // an arrow on its way back: first the apple on our own head, then our own head
      const P = this.pose;
      if (this.selfApple && dist(tip, this.selfApplePos()) < APPLE_R + 6) {
        const at = this.selfApplePos();
        this.selfApple = false;
        this.mark(0);
        this.appleFx(s, at);
        return false;
      }
      if (segDist(tip, P.hip, P.neck).d < 13 || dist(tip, P.headC) < 16) {
        const d0 = sub(P.neck, P.hip);
        const Ln = len(d0) || 1;
        const rel = sub(add(tip, mul(dir, 8)), P.hip);
        this.meStick = {
          u: (rel.x * d0.x + rel.y * d0.y) / (Ln * Ln), w: (d0.x * rel.y - d0.y * rel.x) / Ln,
          rel: s.ang - Math.atan2(d0.y, d0.x),
        };
        this.hurtMe('self', tip);
        return gone();
      }
    }
    if (!L.rain || this.result) return null;
    const need = L.need ?? 12;
    if (L.rain === 'loop') {
      const col = this.column();
      for (const c of this.colA) {
        if (!c.alive) continue;
        const at = v(col.x, lerp(col.top, col.bot, c.ph));
        if (dist(tip, at) >= APPLE_R + 9) continue;
        c.alive = false;
        s.apples++;
        this.rainN++;
        this.best = Math.max(this.best, s.apples);
        this.burst(at, 7, ['#fff3c4', '#ffd76a', '#e3262d'], 'drop', 220);
        if (s.apples >= need) {
          this.mark(0);
          s.vel = mul(s.vel, 0.5);
          this.slowT = 0.45;
          this.shake = 12;
          this.burst(at, 12, ['#ffd23f', '#ff9f1c', '#ef4444', '#22c55e'], 'star', 380);
          this.popText(v(col.x + 150, col.top + 130), tx('MEGA KEBAB!', 'MEGA SATE!'), '#f59e0b', 44);
          sfx.crunch();
        } else {
          s.vel = mul(s.vel, 0.985);
          this.shake = Math.max(this.shake, 3);
          const words: Record<number, string> = {
            1: tx('HIT!', 'KENA!'),
            3: tx('TRIPLE!', 'TRIPEL!'),
            6: tx('KEBAB!', 'SATE!'),
            9: tx('JUMBO KEBAB!', 'SATE JUMBO!'),
          };
          if (words[s.apples]) this.popText(add(at, v(96, -10)), words[s.apples], '#16a34a', 28);
          sfx.tuk();
        }
        return false;
      }
      return null;
    }
    for (const ap of this.rain) {
      if (ap.state !== 'air' || dist(tip, ap.p) >= APPLE_R + 7) continue;
      const at = { ...ap.p };
      this.rain.splice(this.rain.indexOf(ap), 1);
      this.rainN++;
      this.best = Math.max(this.best, s.apples + 1);
      const done = L.rain === 'party' ? this.rainN >= need : s.apples + 1 >= need;
      if (done) {
        const total = L.time ?? 40;
        if (L.rain === 'party') this.starOv = this.rainT > total * 0.4 ? 3 : this.rainT > total * 0.15 ? 2 : 1;
        this.mark(0);
        for (let i = 0; i < 6; i++) {
          this.burst(v(T - 330 + i * 110, GROUND - 250 - (i % 2) * 70), 9, ['#ef4444', '#fbbf24', '#22c55e', '#3b82f6', '#a855f7'], 'star', 340);
        }
        if (L.rain === 'party') this.popText(v(T - 20, GROUND - 318), tx('FESTIVE!', 'MERIAH!'), '#f59e0b', 46);
        else this.popText(add(at, v(-30, -96)), tx('PERFECT KEBAB!', 'SATE SEMPURNA!'), '#f59e0b', 38);
      }
      this.appleFx(s, at, L.rain === 'party');
      if (!this.result) this.slowT = Math.min(this.slowT, L.rain === 'lines' ? 0.1 : 0.05); // keep things moving
      // a row is counted out loud, apple by apple
      if (L.rain === 'lines') this.popText(add(at, v(0, -44)), String(s.apples), '#16a34a', 30);
      else if (s.apples >= 4 && !done) this.popText(add(at, v(0, -94)), tx('KEBAB!', 'SATE!'), '#f59e0b', 38);
      return false;
    }
    return null;
  }

  private drawGate(g: Gate, half: number, col: string, light: string, flash: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(g.c.x, g.c.y);
    ctx.rotate(g.ang);
    drawPortal(ctx, v(0, 0), half, col, light, this.lt, flash);
    ctx.restore();
  }

  private drawLabBack() {
    const ctx = this.ctx;
    const L = this.lab!;
    const T = this.T;
    const m = this.men[0];
    if ((L.g ?? 1) < 0) {
      // upside-down world: little chevrons keep rising, so it is clear which way things fall
      ctx.strokeStyle = 'rgba(124,58,237,0.28)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const x = T - 700 + i * 62;
        const y = GROUND - 20 - ((i * 83 + this.lt * 90) % 340);
        stroke(ctx, [v(x - 7, y + 7), v(x, y), v(x + 7, y + 7)], 'rgba(124,58,237,0.28)', 2.5);
      }
    }
    if (L.wind) {
      // streaks that drift the way the wind blows, and a windsock
      const w = this.windNow() / L.wind.a;
      ctx.strokeStyle = 'rgba(100,116,139,0.3)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        const x = T - 640 + ((i * 131) % 620);
        const y = GROUND - 60 - ((((i * 67 + this.lt * 150 * -w) % 300) + 300) % 300);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 9 * w, y + 30 * w);
        ctx.stroke();
      }
      const top = v(T - 330, GROUND - 330);
      stroke(ctx, [v(top.x, GROUND), top], '#9aa3ad', 3, 'butt');
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(top.x, top.y - 9);
      ctx.lineTo(top.x, top.y + 9);
      ctx.lineTo(top.x - 14 * w - 6, top.y + 46 * w);
      ctx.closePath();
      ctx.fill();
    }
    if (L.cart && m && !m.rag) {
      ctx.fillStyle = '#2f62c9';
      ctx.beginPath();
      ctx.roundRect(m.x - 38, GROUND - 24, 76, 13, 4);
      ctx.fill();
      ctx.fillStyle = '#25272d';
      for (const dx of [-24, 24]) {
        ctx.beginPath();
        ctx.arc(m.x + dx, GROUND - 8, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (L.pend) {
      const piv = v(T + L.pend.x, GROUND - L.pend.h);
      const at = this.pendAt();
      ctx.fillStyle = '#7b8491';
      ctx.fillRect(piv.x - 40, piv.y - 8, 80, 8);
      stroke(ctx, [piv, this.pendOn ? at : lerpV(piv, at, 0.9)], '#8a6a3c', 2.5);
      if (this.pendOn) drawApple(ctx, at, APPLE_R, -L.pend.amp * Math.sin(L.pend.w * this.lt));
    }
    if (L.fan) {
      const c = v(T + L.fan.x, GROUND - L.fan.h);
      stroke(ctx, [v(c.x, GROUND), c], '#7b8491', 8, 'butt');
      for (let i = 0; i < L.fan.n; i++) {
        stroke(ctx, [c, add(c, fromAngle(L.fan.w * this.lt + (i * 2 * Math.PI) / L.fan.n, L.fan.r))], '#c58f52', 13);
      }
      ctx.fillStyle = '#2b2e36';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const d of L.doors ?? []) {
      const mid = this.doorMid(d);
      ctx.fillStyle = '#c58f52';
      ctx.fillRect(T + d.x, GROUND - 330, 18, mid - d.gap / 2 - (GROUND - 330));
      ctx.fillRect(T + d.x, mid + d.gap / 2, 18, GROUND - mid - d.gap / 2);
      ctx.fillStyle = '#e2572b';
      ctx.fillRect(T + d.x, mid - d.gap / 2 - 6, 18, 6);
      ctx.fillRect(T + d.x, mid + d.gap / 2, 18, 6);
    }
    if (L.space) {
      drawEarth(ctx, v(T - 560, GROUND - this.def.top + 96), 44);
      if (L.g) {
        for (const [x, w] of [[T - 900, 60], [T - 430, 92], [T - 190, 52], [T - 650, 40]]) drawCrater(ctx, x, GROUND, w);
      } else {
        // nothing weighs anything: a few rocks drift about
        ctx.fillStyle = '#dfe3e8';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(T - 800 + i * 215, GROUND - 330 - (i % 2) * 70 + Math.sin(this.lt * 0.6 + i * 2) * 10, 14 - i * 2, 9 - i, i + this.lt * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    for (const mg of L.mags ?? []) {
      const c = this.magAt(mg);
      if (mg.hole) {
        drawHole(ctx, c, 26, this.lt);
        continue;
      }
      const pol = this.magPol(mg);
      let prog = 1;
      if (mg.off) {
        const on = mg.on ?? 2;
        const cyc = (this.lt + (mg.ph ?? 0)) % (on + mg.off);
        prog = cyc < on ? cyc / on : (cyc - on) / mg.off;
      } else if (mg.swap) prog = (this.lt % mg.swap) / mg.swap;
      drawMagnet(ctx, c, pol !== 0, prog, this.lt, pol < 0, mg.rail ? 44 : 3000);
      if (mg.rail) drawRail(ctx, T + mg.x - mg.rail - 50, T + mg.x + mg.rail + 50, c.y - 146, c.x);
    }
    (L.ports ?? []).forEach((P, i) => {
      const half = P.half ?? PORTAL.half;
      const A = this.gate(P, 0);
      const B = this.gate(P, 1);
      const col = i % 2 ? ['#22c55e', '#bbf7d0', '#a855f7', '#e9d5ff'] : ['#3b82f6', '#bfdbfe', '#f97316', '#fed7aa'];
      if (!P.hideB) {
        if (P.nozzle) drawFunnel(ctx, B.c, half);
        if (L.back && m && m.hasApple && !m.rag && !this.result) {
          // hint: where the way out is pointing
          const to = P.swing ? add(B.c, mul(B.n, 200)) : applePos(m);
          ctx.fillStyle = 'rgba(249,115,22,0.45)';
          for (let k = 1; k < 7; k++) {
            const q = lerpV(B.c, to, k / 7.6);
            ctx.beginPath();
            ctx.arc(q.x, q.y, 2.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        this.drawGate(B, half, col[2], col[3], this.pfx[i * 2 + 1] ?? 0);
      }
      this.drawGate(A, half, col[0], col[1], this.pfx[i * 2] ?? 0);
    });
    if (L.rain === 'loop') {
      const col = this.column();
      for (const c of this.colA) {
        if (!c.alive) continue;
        ctx.globalAlpha = clamp(c.ph * 10, 0, 1) * clamp((1 - c.ph) * 10, 0, 1);
        drawApple(ctx, v(col.x, lerp(col.top, col.bot, c.ph)), APPLE_R, c.ph * 9);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawLabFront() {
    const ctx = this.ctx;
    const L = this.lab!;
    const T = this.T;
    for (const [x0, x1, h] of this.labWalls()) drawWoodWall(ctx, T + x0, T + x1, GROUND, h);
    if (L.helmet) {
      for (const man of this.men) {
        const h = headPos(man);
        drawHelmet(ctx, v(h.x - 1, h.y + 2), 24);
      }
    }
    for (const ap of this.rain) {
      ctx.globalAlpha = ap.state === 'ground' ? clamp((1.2 - ap.t) / 0.4, 0, 1) : 1;
      drawApple(ctx, ap.p, APPLE_R, ap.rot);
    }
    ctx.globalAlpha = 1;
  }

  /** returns true when the shot stopped flying */
  private collide(s: Shot): boolean {
    const d = this.def;
    const tip = s.tip;
    const dir = fromAngle(s.ang);
    // a little more forgiving for far away and for moving apples
    const tol = d.lab ? d.lab.tol ?? 4 : d.kind === 'moon' ? 7 : d.kind === 'trampoline' || d.kind === 'seesaw' ? 5 : 2 * (d.dist / 835);
    if (!this.result) {
      for (const ap of this.thrown) {
        if (ap.state === 'air' && dist(tip, ap.p) < APPLE_R + 6) {
          this.thrown.splice(this.thrown.indexOf(ap), 1);
          this.mark(0);
          this.appleFx(s, { ...ap.p });
          return false;
        }
      }
      for (let i = 0; i < this.men.length; i++) {
        const m = this.men[i];
        const testPt = d.v?.ceiling ? v(tip.x, 2 * GROUND - 380 - tip.y) : tip;
        if (m.hasApple && !m.rag && dist(testPt, applePos(m)) < APPLE_R + tol) {
          m.hasApple = false;
          this.mark(this.appleGoal[i]);
          this.appleFx(s, { ...tip });
          if (this.mini === 'giant') this.miniWin(tip, tx('THROUGH 3 WALLS!', 'TEMBUS 3 TEMBOK!'));
          return false;
        }
      }
      // an arrow that already carries an apple is still an arrow
      for (let i = 0; i < this.men.length && s.grace <= 0; i++) {
        const m = this.men[i];
        if (m.rag) continue;
        const testPt = d.v?.ceiling ? v(tip.x, 2 * GROUND - 380 - tip.y) : tip;
        const hit = hitTest(m, testPt);
        if (hit) {
          if (this.mini === 'bombarrow') {
            this.shots.splice(this.shots.indexOf(s), 1);
            this.detonateBombArrow(tip);
            return true;
          }
          if ((this.a.gear ?? 1) < 1) {
            // a toothpick of an arrow: it only tickles
            m.brow = 1;
            this.popText(add(tip, v(-30, -40)), tx('TICKLES!', 'GELI!'), '#6b7280', 24);
            sfx.tuk();
            this.tumble(s);
            return true;
          }
          if (this.mini === 'giant') s.vel = mul(s.vel, 1.85);
          this.hitMan(i, hit, s);
          const rg = (m as TargetState).rag;
          if (d.v?.ceiling && rg) {
            rg.p = rg.p.map((q: V) => v(q.x, 2 * GROUND - 380 - q.y));
            rg.o = rg.o.map((q: V) => v(q.x, 2 * GROUND - 380 - q.y));
          }
          return true;
        }
      }
      for (const pl of this.plates) {
        if (dist(tip, pl.p) < PLATE_R + 3) {
          this.breakPlate(pl);
          return false; // the arrow flies on
        }
      }
      if (this.foe && this.foe.state !== 'down') {
        const segs = this.foeSegs();
        for (let j = 0; j < segs.length; j++) {
          const [p0, p1, r] = segs[j];
          if (j === 0 ? dist(tip, p1) < r : segDist(tip, p0, p1).d < r) {
            this.hitFoe(s, j);
            return true;
          }
        }
      }
    }
    const extra = this.collide2(s);
    if (extra !== null) return extra;
    if (d.v?.jetpack) {
      const inWall = tip.x > this.T - 210 && tip.x < this.T - 190 && tip.y > GROUND - 260 && tip.y < GROUND;
      const inTower = tip.x > this.T - 52 && tip.x < this.T + 52 && tip.y > GROUND - 165 && tip.y < GROUND;
      if (inWall || inTower) {
        if (!this.result && !s.apples) this.popText(add(tip, v(-36, -30)), tx('THUNK!', 'TOK!'), '#8a5a2e', 24);
        s.tip = add(tip, mul(dir, 8));
        s.state = 'stuck';
        s.embed = 11;
        this.shake = Math.max(this.shake, 3);
        sfx.thunk();
        return true;
      }
    }
    if (d.v?.ceiling && tip.y <= GROUND - 380) {
      this.burst(tip, 6, ['#38bdf8', '#cbd5e1', '#ffffff'], 'star', 160);
      if (!this.result && !s.apples) this.popText(add(tip, v(0, 36)), tx('CLANG!', 'TENG!'), '#0ea5e9', 24);
      sfx.ting();
      this.tumble(s);
      return true;
    }
    if (d.kind === 'bull' && s.vel.x > 0 && Math.abs(tip.x - this.T) < 2.5 && Math.abs(tip.y - (GROUND - BOARD_H)) < BOARD.r) {
      this.hitBoard(s);
      return true;
    }
    if (d.kind === 'seesaw') {
      const sw = this.sw;
      if (Math.abs(tip.x - this.glassX) < 6.5 && tip.y > GROUND - GLASS_H && tip.y < GROUND) {
        // arrow-proof glass: it glances off and tumbles to the floor
        s.state = 'bounce';
        s.tip = sub(tip, mul(dir, ARROW_LEN / 2));
        s.vel = v(-Math.abs(s.vel.x) * 0.16, s.vel.y * 0.25 - 90);
        s.spin = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5);
        sw.flash = 1;
        sw.flashY = tip.y;
        this.burst(tip, 7, ['#ffffff', '#bae6fd', '#7dd3fc'], 'drop', 170);
        if (!this.result) this.popText(add(tip, v(-34, -34)), tx('TING!', 'TING!'), '#0ea5e9', 26);
        for (const m of this.men) m.brow = 1;
        this.shake = Math.max(this.shake, 3);
        sfx.ting();
        return true;
      }
      const up = (sw.wy - tip.y) / WEIGHT.h; // 0 at the bottom of the weight, 1 at its top
      if (up > 0 && up < 1 && Math.abs(tip.x - this.wx) < lerp(WEIGHT.w, WEIGHT.top, up) / 2) {
        s.tip = add(tip, mul(dir, 9));
        s.state = 'stuck';
        s.embed = 12;
        s.ride = sub(s.tip, v(this.wx, sw.wy));
        this.shake = Math.max(this.shake, 3.5);
        sfx.thunk();
        if (sw.hung) this.dropWeight(tip);
        return true;
      }
      const pulley = v(this.wx, GROUND - CRANE_H + 24);
      if (sw.hung && segDist(tip, pulley, v(this.wx, sw.wy - WEIGHT.h - 14)).d < 5.5) {
        this.dropWeight(tip); // straight through the rope
        return false;
      }
      if (Math.abs(tip.x - (this.fx + 262)) < 8 && tip.y > GROUND - CRANE_H && tip.y < GROUND) {
        s.tip = add(tip, mul(dir, 7));
        s.state = 'stuck';
        s.embed = 10;
        this.shake = Math.max(this.shake, 3);
        sfx.thunk();
        return true;
      }
    }
    const inMachine = (d.kind === 'thrower' || d.kind === 'plates') && Math.abs(tip.x - this.launcherX) < 34 && tip.y > GROUND - 50;
    if (tip.y >= GROUND || inMachine) {
      s.tip = add(tip, mul(dir, 9));
      s.state = 'stuck';
      s.embed = 12;
      this.burst(v(tip.x, Math.min(tip.y, GROUND)), 6, ['#c9ced6', '#e3e6ea'], 'drop', 120);
      this.shake = Math.max(this.shake, 3.5);
      sfx.thunk();
      if (!this.result && !s.apples) {
        for (const m of this.men) if (Math.abs(tip.x - m.x) < 170) m.brow = 1;
        this.popText(v(tip.x, GROUND - 46), tx('MISS', 'MELESET'), '#6b7280', 26);
      }
      return true;
    }
    if (tip.x > this.T + d.pad + 500 || tip.x < -700 || tip.y < -3000) {
      this.shots.splice(this.shots.indexOf(s), 1);
      if (!this.result && !s.apples) sfx.miss();
      return true;
    }
    return false;
  }

  private stepBody(b: Body, dt: number) {
    const r = b.kind === 'apple' ? APPLE_R : 5;
    b.vel.y += GRAV * this.gk * dt;
    b.p = add(b.p, mul(b.vel, dt));
    b.rot += b.vr * dt;
    if (b.p.y > GROUND - r) {
      b.p.y = GROUND - r;
      b.vel.y = Math.abs(b.vel.y) > 70 ? -b.vel.y * 0.42 : 0;
      b.vel.x *= 0.8;
      b.vr = b.vel.x / Math.max(r, 6);
    }
  }

  // ---- archer ---------------------------------------------------------------
  /**
   * Procedural walk. Feet are planted in world space and only move by stepping, so
   * nothing ever slides; the hips then ride as high as both legs allow.
   */
  private updateWalk(dt: number) {
    const a = this.a;
    if (this.def.v?.mycart && a.phase !== 'idle') {
      const w = 1.45;
      const amp = 155;
      a.x = START_X + amp * Math.sin(this.lt * w);
      this.vx = amp * w * Math.cos(this.lt * w);
      a.vx = this.vx * 0.35;
      a.ground = GROUND - 22;
      const gy = a.ground - STANCE.ankle;
      a.footB = v(a.x + STANCE.back * 0.85, gy);
      a.footF = v(a.x + STANCE.front * 0.85, gy);
      a.rotB = 0;
      a.rotF = 0;
      return;
    }
    const input = this.canMove() ? clamp((this.keys.r ? 1 : 0) - (this.keys.l ? 1 : 0) + this.moveBtn, -1, 1) : 0;
    const lo = START_X - ZONE_BACK;
    const hi = START_X + ZONE_FWD;
    const room = input > 0 ? hi - a.x : input < 0 ? a.x - lo : 1e9;
    const drawn = a.phase === 'ready' ? clamp(a.pull / MAX_DRAW, 0, 1) : 0;
    // slower with a drawn bow, and easing to a stop at the ends of the lane
    const want = input * WALK_SPEED * (1 - 0.4 * drawn) * clamp(room / 36, 0, 1);
    this.vx = damp(this.vx, want, 14, dt);
    if (want === 0 && Math.abs(this.vx) < 3) this.vx = 0;
    a.x = clamp(a.x + this.vx * dt, lo, hi);
    a.vx = this.vx;

    const speedK = clamp(Math.abs(this.vx) / WALK_SPEED, 0, 1);
    const moving = Math.abs(this.vx) > 14;
    const dir = Math.sign(this.vx) || 1;
    const gy = GROUND - STANCE.ankle;
    const [fb, ff] = this.feet;
    if (!fb.moving && !ff.moving) {
      // The foot that trails furthest behind steps next – either because it is a full step
      // behind, or because the other foot would trail too far by the time this one lands.
      // Standing still, the feet shuffle back into the shooting stance.
      const lagOf = (f: Foot) => -(f.p.x - (a.x + f.home * 0.15)) * dir;
      const offOf = (f: Foot) => Math.abs(f.p.x - (a.x + f.home));
      const first = moving ? (lagOf(fb) >= lagOf(ff) ? fb : ff) : offOf(fb) >= offOf(ff) ? fb : ff;
      const second = first === fb ? ff : fb;
      const need = moving
        ? Math.max(lagOf(first) - STEP_LEN, lagOf(second) + Math.abs(this.vx) * (STEP_TIME + 0.03) - 38)
        : offOf(first) - 2.5;
      const pick = need > 0 && second.rest > 0.03 ? first : null;
      if (pick) {
        pick.moving = true;
        pick.k = 0;
        pick.from = { ...pick.p };
        pick.dir = moving ? dir : 0;
        pick.lift = moving ? 12 : 7;
        pick.dur = moving ? STEP_TIME : 0.2;
      }
    }
    for (const f of this.feet) {
      if (!f.moving) {
        f.rest += dt;
        continue;
      }
      if (moving && f.dir === 0) f.dir = dir; // a settling shuffle turns into a real step
      // if the planted foot is already trailing a long way, this step hurries up
      const other = f === fb ? ff : fb;
      const lag = other.moving ? 0 : -(other.p.x - (a.x + other.home * 0.15)) * dir;
      const hurry = moving ? 1 + 0.9 * clamp((lag - STEP_LEN - 6) / 20, 0, 1) : 1;
      f.k = Math.min(1, f.k + (dt / f.dur) * hurry);
      // landing spot keeps tracking where the body will be when the foot comes down
      const to = a.x + this.vx * (1 - f.k) * f.dur + f.home * lerp(1, 0.15, speedK) + f.dir * STEP_LEN * speedK;
      f.p = v(lerp(f.from.x, to, ease.sine(f.k)), gy - f.lift * Math.sin(Math.PI * f.k));
      f.rot = 0.3 * Math.sin(2 * Math.PI * f.k) * f.dir * speedK; // heel-toe roll
      if (f.k >= 1) {
        f.moving = false;
        f.rest = 0;
        f.p = v(to, gy);
        f.rot = 0;
        if (f.dir) sfx.step();
      }
    }
    a.footB = fb.p;
    a.footF = ff.p;
    a.rotB = fb.rot;
    a.rotF = ff.rot;
    this.applyLift(dt);
  }

  private updateArcher(real: number, dt: number) {
    const a = this.a;
    const prev = a.t;
    a.time += real;
    // every reload after the first shot runs at double speed
    const fast = this.fired > 0 && (a.phase === 'nock' || a.phase === 'recover') ? 4 : 1;
    a.t += dt * fast;
    const passed = (f: number, dur: number) => prev < f * dur && a.t >= f * dur;
    if (this.drag) {
      const dx = this.drag.ax - this.drag.cx;
      const dy = this.drag.ay - this.drag.cy;
      const l = Math.hypot(dx, dy);
      const full = clamp(Math.min(this.vw, this.vh) * 0.3, 110, 220);
      if (l > 12) this.aimT = dx <= 4 ? (dy < 0 ? AIM_MIN : AIM_MAX) : clamp(Math.atan2(dy, dx), AIM_MIN, AIM_MAX);
      const x = clamp((l - 10) / full, 0, 1);
      this.pullT = (1 - Math.pow(1 - x, 1.35)) * MAX_DRAW; // the last centimetres are the heaviest
    }
    const frac = clamp(a.pull / MAX_DRAW, 0, 1);
    // holding at full draw for long makes the sight picture float a little
    this.strain = a.phase === 'ready' && frac > 0.95 ? Math.min(1, this.strain + real / 2.4) : Math.max(0, this.strain - real * 3);
    const wobble = this.strain * (0.0045 * Math.sin(a.time * 23) + 0.003 * Math.sin(a.time * 37.7));
    if (a.phase === 'nock' || a.phase === 'ready') a.aim = damp(a.aim, this.aimT + wobble, 14, real);
    switch (a.phase) {
      case 'grab':
        if (passed(0.47, DUR.grab)) { sfx.grab(); this.kickV -= 1.5; }
        if (a.t >= DUR.grab) this.setPhase('nock');
        break;
      case 'nock':
        if (passed(0.22, DUR.nock)) sfx.pick();
        if (passed(0.79, DUR.nock)) { sfx.nock(); this.kickV += 0.45; }
        if (a.t >= DUR.nock) {
          this.setPhase('ready');
          a.pull = 0;
          a.vib = 0;
          this.pullVel = 0;
        }
        break;
      case 'ready': {
        if (this.result) {
          const n = this.fired;
          this.release(); // the round ended under him: startled, he lets the arrow go
          this.fired = n; // ...which is not a shot of his
          break;
        }
        a.pull = damp(a.pull, this.pullT, 13, real);
        const step = Math.floor(frac * 7);
        if (step > this.creak) sfx.creak(frac);
        this.creak = step;
        if (!this.clicked && frac > 0.985) {
          this.clicked = true;
          sfx.click();
          if (this.pose.arrow) this.burst(add(this.pose.arrow.nock, fromAngle(this.pose.arrow.angle, ARROW_LEN - 14)), 4, ['#fde68a', '#fff'], 'star', 60);
        } else if (frac < 0.9) this.clicked = false;
        break;
      }
      case 'release':
        // short follow-through, then the bow comes down while the arrow is still in the air
        if (a.t > RELEASE_HOLD) {
          if (this.result) this.endRound(0);
          else this.setPhase('recover');
        }
        break;
      case 'recover': {
        const u = clamp(a.t / DUR.recover, 0, 1);
        if (this.result) this.endRound(ease.inOut(u));
        else if (u >= 1 && !this.shots.some((s) => s.state === 'fly' && s.tip.x < this.farX)) {
          // the last arrow has done all it can: fetch the next one straight away
          if (a.quiver > 0) this.setPhase('nock');
          else if (!this.sequenceRunning()) { this.finish('out'); this.endRound(1); }
        }
        break;
      }
    }
    // the string keeps ringing after a shot no matter what the archer does next
    if (a.phase !== 'ready') {
      const n = Math.max(1, Math.ceil(dt / 0.002));
      for (let i = 0; i < n; i++) {
        this.pullVel += (-5200 * a.pull - 26 * this.pullVel) * (dt / n);
        a.pull += this.pullVel * (dt / n);
        if (!this.crossed && a.pull <= 0) { this.crossed = true; this.pullVel *= 0.2; }
      }
      a.vib = clamp(Math.abs(this.pullVel) * 0.012, 0, 7) * (this.crossed ? 1 : 0);
    }
    // secondary motion springs live across every phase, so nothing can pop.
    // The bow rolls loosely after a shot, but once an arrow is on the string the grip
    // firms up – a leftover wobble must never steer the next shot.
    const firm = a.phase === 'ready' || (a.phase === 'nock' && a.t > DUR.nock * 0.7);
    this.kickV += (firm ? -400 * a.kick - 30 * this.kickV : -46 * a.kick - 5.4 * this.kickV) * dt;
    a.kick += this.kickV * dt;
    this.recoilV += (-160 * a.recoil - 16 * this.recoilV) * dt;
    a.recoil += this.recoilV * dt;
    this.updateWalk(dt);
    this.pose = this.poseCurrent();
  }

  /** the level itself will still decide the round, so running out of arrows is not the end yet */
  private sequenceRunning() {
    const k = this.def.kind;
    if (k === 'mini') return this.miniBusy();
    if (this.lab) return this.lab.rain === 'party' || this.shots.some((s) => s.state === 'fly'); // wait for what is still in the air
    if (k === 'rain') return true; // the clock settles it
    if (k === 'boss') return !!this.boss && !this.boss.dead; // he reaches us or he falls
    if (k === 'ufo') return this.ufo.state !== 'gone'; // the abduction settles it
    if (k === 'balloon') return this.bl.alive.filter(Boolean).length >= 2 && !this.men[0].rag && !this.bl.gone;
    if (k === 'plates') return true; // the next plate settles it
    if (k === 'rival') return !!this.foe && this.foe.state !== 'down';
    const sw = this.sw;
    return k === 'seesaw' && !sw.hung && sw.man !== 'ground' && !this.men[0].rag;
  }

  // ---- level mechanics ------------------------------------------------------
  private updateLevel(dt: number) {
    const d = this.def;
    const m = this.men[0];
    if (d.kind !== 'ducks' && this.ducks.length) this.ducksStep(dt);
    if (this.updateLevel2(dt)) return;
    if (d.kind === 'thrower') {
      this.launch.recoil = damp(this.launch.recoil, 0, 7, dt);
      if (this.a.phase !== 'idle' && !this.result) {
        this.launch.timer -= dt;
        if (this.launch.timer <= 0) {
          this.launch.timer = THROW_EVERY;
          this.launch.recoil = 1;
          const muzzle = launcherMuzzle(this.launcherX, GROUND);
          this.thrown.push({ p: muzzle, vel: fromAngle(LAUNCH_ANGLE, THROW_SPEED), rot: 0, state: 'air', t: 0 });
          this.burst(muzzle, 6, ['#d5d9e0', '#eceef1'], 'drop', 110);
          sfx.launch();
        }
      }
      for (const ap of [...this.thrown]) {
        ap.vel.y += APPLE_GRAV * dt;
        ap.p = add(ap.p, mul(ap.vel, dt));
        ap.rot -= 5 * dt;
        if (ap.p.y > GROUND - APPLE_R) {
          ap.p.y = GROUND - APPLE_R;
          if (ap.state === 'air') sfx.thunk();
          ap.state = 'ground';
          ap.vel = v(ap.vel.x * 0.55, Math.abs(ap.vel.y) > 90 ? -ap.vel.y * 0.3 : 0);
        }
        if (ap.state === 'ground' && (ap.t += dt) > 1.3) this.thrown.splice(this.thrown.indexOf(ap), 1);
      }
    } else if (d.kind === 'trampoline') {
      // ballistic flight + half a sine of bed contact: speeds match at both hand-overs
      const tr = this.tr;
      const ta = (2 * TRAMP.v0) / TRAMP.g;
      const D = (TRAMP.v0 * TRAMP.tc) / Math.PI;
      if (!m.rag) {
        const before = tr.ph;
        tr.ph = (tr.ph + dt) % (ta + TRAMP.tc);
        const flying = tr.ph < ta;
        if (flying) {
          m.y = GROUND - TRAMP.bed - (TRAMP.v0 * tr.ph - 0.5 * TRAMP.g * tr.ph * tr.ph);
          tr.vy = TRAMP.g * tr.ph - TRAMP.v0;
          tr.sag = 0;
          m.dipT = 6 * Math.sin((Math.PI * tr.ph) / ta); // small tuck at the top
        } else {
          const k = (tr.ph - ta) / TRAMP.tc;
          tr.sag = D * Math.sin(Math.PI * k);
          m.y = GROUND - TRAMP.bed + tr.sag;
          tr.vy = ((D * Math.PI) / TRAMP.tc) * Math.cos(Math.PI * k);
          m.dipT = 24 * Math.sin(Math.PI * k); // knees soak up the landing and push off again
          if (before < ta && dt > 0) sfx.boing();
        }
        m.air = damp(m.air, flying ? 1 : 0, 16, dt);
      } else tr.sag = damp(tr.sag, 0, 10, dt);
    } else if (d.kind === 'stack') {
      const joko = this.men[1];
      const st = this.st;
      if (m.rag && !joko.rag) {
        // his footing just left
        this.dropApple(joko, v(60, -120));
        toRagdoll(joko, v(35, st.vy));
      } else if (!joko.rag) {
        const support = m.hasApple ? applePos(m).y - APPLE_R + 1.5 : headPos(m).y - 16;
        if (st.mode === 'apple' && !m.hasApple) st.mode = 'fall';
        if (st.mode === 'fall') {
          st.vy += 1400 * dt;
          joko.y += st.vy * dt;
          if (joko.y >= support) {
            st.mode = 'head';
            st.vy = 0;
            m.dipV += 420;
            joko.dipV += 520;
            m.brow = 1;
            this.shake = Math.max(this.shake, 4);
            this.popText(v(m.x + 64, joko.y - 30), tx('OOF!', 'HUP!'), '#6b7280', 24);
            sfx.hup();
          }
        }
        if (st.mode !== 'fall') joko.y = support;
        const sway = Math.sin(joko.time * 1.3);
        joko.x = m.x + (st.mode === 'apple' ? 1.6 * sway : 0);
        joko.tilt = 0.02 * sway * (st.mode === 'apple' ? 1 : 0.4);
      }
    } else if (d.kind === 'seesaw') {
      const sw = this.sw;
      const fx = this.fx;
      sw.flash = damp(sw.flash, 0, 7, dt);
      if (!sw.hung) {
        sw.snapT += dt;
        if (!sw.landed) {
          sw.wv += GRAV * dt;
          sw.wy += sw.wv * dt;
          const contact = plankPoint(fx, GROUND, sw.ang, SAW.weightU).y;
          if (sw.wy >= contact) {
            // 100 tons arrive on the high end of the plank
            sw.wy = contact;
            sw.landed = true;
            this.slowT = 0.12;
            this.shake = 18;
            this.dust(this.wx - 40, 10, 240);
            this.dust(this.wx + 40, 10, 240);
            this.popText(v(this.wx - 30, GROUND - 210), tx('CRASH!', 'BRAKK!'), '#111827', 40);
            sfx.slam();
            if (sw.man === 'plank' && !m.rag) {
              sw.man = 'air';
              sw.mv = v(-100, -600);
              sw.airT = 0;
            }
          }
        } else {
          sw.ang = damp(sw.ang, SAW.tilt, 40, dt);
          sw.wy = plankPoint(fx, GROUND, sw.ang, SAW.weightU).y;
        }
      }
      if (!m.rag) {
        if (sw.man === 'plank') {
          const p = plankPoint(fx, GROUND, sw.ang, SAW.manU);
          m.x = p.x;
          m.y = p.y;
        } else if (sw.man === 'air') {
          sw.airT += dt;
          sw.mv.y += MAN_GRAV * dt;
          m.x += sw.mv.x * dt;
          m.y += sw.mv.y * dt;
          // for the first instants the whipping plank is still under his feet
          if (sw.airT < 0.3) m.y = Math.min(m.y, plankPoint(fx, GROUND, sw.ang, SAW.manU).y);
          m.dipT = 9;
          m.air = damp(m.air, 1, 12, dt);
          if (m.y >= GROUND && sw.mv.y > 0) {
            m.y = GROUND;
            sw.man = 'ground';
            m.dipT = 0;
            m.dipV += 950; // deep knee bend on landing
            this.shake = Math.max(this.shake, 5);
            this.dust(m.x, 9, 150);
            sfx.hup();
          }
        } else m.air = damp(m.air, 0, 14, dt);
      }
    } else if (d.kind === 'plates') {
      const pt = this.pt;
      pt.recoil = damp(pt.recoil, 0, 7, dt);
      if (this.a.phase !== 'idle' && !this.result && pt.sent < 3 && !this.plates.length) {
        pt.timer -= dt;
        if (pt.timer <= 0) {
          const from = launcherMuzzle(this.launcherX, GROUND);
          this.plates.push({ p: { ...from }, from, t: 0, T: 2.7 - 0.35 * pt.sent, spin: 0 }); // each one is faster
          pt.sent++;
          pt.recoil = 1;
          this.burst(from, 6, ['#d5d9e0', '#eceef1'], 'drop', 110);
          sfx.launch();
        }
      }
      // every plate is thrown AT the archer: its arc always ends on his chest, wherever he walks
      const chest = this.chest();
      for (const pl of [...this.plates]) {
        pl.t += dt;
        pl.spin += dt * 8;
        const k = Math.min(1, pl.t / pl.T);
        pl.p = v(lerp(pl.from.x, chest.x, k), lerp(pl.from.y, chest.y, k) - 1120 * k * (1 - k));
        if (k >= 1) {
          this.plates.splice(this.plates.indexOf(pl), 1);
          if (!this.result) {
            this.glassBurst(pl.p, 26, 300);
            this.popText(add(pl.p, v(112, -66)), tx('SMASH!', 'PRANG!'), '#0ea5e9', 26);
            sfx.shatter();
            this.hurtMe('plate', pl.p);
          }
        }
      }
    } else if (d.kind === 'rival' && this.foe) {
      const f = this.foe;
      const a2 = f.a;
      a2.time += dt;
      a2.vib = damp(a2.vib, 0, 9, dt);
      if (f.state === 'down') {
        // topples over backwards, with one small bounce
        a2.t += dt;
        f.fallV += 8.5 * Math.sin(clamp(f.fall, 0, 1.5) * 0.9 + 0.25) * dt;
        f.fall += f.fallV * dt;
        if (f.fall > 1.5) {
          f.fall = 1.5;
          if (f.fallV > 0.7) {
            this.dust(this.T + 95, 9, 150);
            this.shake = Math.max(this.shake, 5);
            sfx.hup();
            f.fallV *= -0.25;
          } else f.fallV = 0;
        }
      } else if (f.state === 'shot') a2.t += dt;
      else if (this.a.phase !== 'idle' && !this.result) {
        f.t += dt;
        // he keeps his bow on our chest the whole time
        const to = this.chest();
        const from = v(this.T - 72, GROUND - 152);
        const dx = Math.max(80, from.x - to.x);
        const up = from.y - to.y;
        const sp = speedOf(1);
        const disc = sp ** 4 - GRAV * (GRAV * dx * dx + 2 * up * sp * sp);
        const th = disc > 0 ? Math.atan((sp * sp - Math.sqrt(disc)) / (GRAV * dx)) : 0.3;
        a2.aim = damp(a2.aim, clamp(-th, AIM_MIN, AIM_MAX), 8, dt);
        const tn = f.t - FOE_WAIT;
        if (tn < DUR.nock) {
          a2.phase = 'nock';
          a2.t = Math.max(0, tn);
        } else if (tn < DUR.nock + FOE_DRAW + 0.15) {
          const k = clamp((tn - DUR.nock) / FOE_DRAW, 0, 1);
          a2.phase = 'ready';
          a2.t = tn - DUR.nock;
          a2.pull = MAX_DRAW * ease.sine(k);
          f.danger = k;
          const step = Math.floor(k * 6);
          if (step > f.tick) {
            f.tick = step;
            sfx.creak(k);
          }
          if (k > 0.72 && !f.warned) {
            f.warned = true;
            this.popText(v(this.T, GROUND - 290), tx('WATCH OUT!', 'AWAS!'), '#dc2626', 26);
          }
        } else {
          // too late: he looses
          const ar = f.pose.arrow;
          if (ar) {
            const ang = Math.PI - ar.angle;
            const tipW = add(v(this.T - ar.nock.x, ar.nock.y), fromAngle(ang, ARROW_LEN));
            this.eArrow = { from: tipW, p: { ...tipW }, ang, t: 0, T: Math.max(0.2, dist(tipW, to) / sp) };
          }
          a2.relAim = a2.aim;
          a2.relPull = a2.pull;
          a2.pull = 0;
          a2.vib = 6;
          a2.phase = 'release';
          a2.t = 0;
          f.state = 'shot';
          f.danger = 1;
          sfx.twang(1);
        }
      }
      f.pose = poseArcher(a2);
      const e = this.eArrow;
      if (e) {
        // a flat ballistic arc whose far end stays on our chest – once he has let go there is no dodging
        e.t += dt;
        const k = Math.min(1, e.t / e.T);
        const to = this.chest();
        const sag = (GRAV * e.T * e.T) / 8;
        const np = v(lerp(e.from.x, to.x, k), lerp(e.from.y, to.y, k) - 4 * sag * k * (1 - k));
        if (dist(np, e.p) > 0.01) e.ang = Math.atan2(np.y - e.p.y, np.x - e.p.x);
        e.p = np;
        if (k >= 1) {
          const P = this.pose;
          const d0 = sub(P.neck, P.hip);
          const L = len(d0) || 1;
          const rel = sub(add(np, fromAngle(e.ang, 8)), P.hip);
          this.meStick = {
            u: (rel.x * d0.x + rel.y * d0.y) / (L * L), w: (d0.x * rel.y - d0.y * rel.x) / L,
            rel: e.ang - Math.atan2(d0.y, d0.x),
          };
          this.eArrow = null;
          this.hurtMe('shot', np);
          a2.phase = 'win';
          a2.t = 0;
          a2.e0 = 0;
        }
      }
    }
  }

  private updateShots(dt: number) {
    carry5(this.host);
    for (const s of [...this.shots]) {
      if (s.state === 'stuck') {
        s.stuckT += dt;
        if (s.ride) s.tip = add(v(this.wx, this.sw.wy), s.ride);
        continue;
      }
      if (s.state === 'dead') {
        if ((s.stuckT += dt) > 1.6) this.shots.splice(this.shots.indexOf(s), 1);
        continue;
      }
      if (s.state === 'bounce') {
        // tumbling after glancing off the glass (here `tip` is the middle of the shaft)
        s.vel.y += GRAV * this.gk * dt;
        s.tip = add(s.tip, mul(s.vel, dt));
        s.ang += s.spin * dt;
        if (s.tip.y > GROUND - 3) {
          s.tip.y = GROUND - 3;
          s.state = 'dead';
          s.stuckT = 0;
          s.ang = Math.cos(s.ang) > 0 ? 0 : Math.PI;
          sfx.step();
        }
        continue;
      }
      s.t += dt;
      const fld = this.field(s.tip);
      s.vel = v(s.vel.x + fld.x * dt, s.vel.y + fld.y * dt);
      const n = Math.max(1, Math.ceil((len(s.vel) * dt) / 4));
      s.ang = Math.atan2(s.vel.y, s.vel.x);
      const stride = (len(s.vel) * dt) / n;
      for (let i = 0; i < n; i++) {
        s.tip = add(s.tip, mul(s.vel, dt / n));
        s.grace -= stride;
        if (this.collide(s)) break;
      }
      // a close call earns one raised eyebrow, nothing more
      if (s.state === 'fly' && !this.result) {
        for (const m of this.men) {
          if (!m.rag && Math.abs(s.tip.x - m.x) < 40 && Math.abs(s.tip.y - headPos(m).y) < 110) m.brow = 1;
        }
      }
    }
  }

  /** what the camera frames when it closes in on the target */
  private menFocus(who?: TargetState): { c: V; h: number } | null {
    const k = this.def.kind;
    if (this.lab?.self) return { c: v(this.a.x + 60, GROUND - 160), h: 430 };
    if (this.lab?.rain === 'lines' || this.lab?.rain === 'loop') return null; // stay wide: the kebab is the show
    if (k === 'bull') return { c: v(this.T - 70, GROUND - BOARD_H), h: 430 };
    if (k === 'rival') return { c: v(this.T - 20 + (this.foe ? this.foe.fall * 45 : 0), GROUND - 135), h: 430 };
    if (k === 'boss' && this.boss) return { c: v(this.boss.x - 40, GROUND - 170), h: 520 };
    const m = who ?? this.men[0];
    if (!m) return null;
    const f5 = focus5(this.host, m);
    if (f5) return f5;
    if (k === 'ufo') return { c: v(m.x - 40, GROUND - 300), h: 640 };
    if (k === 'balloon' || k === 'ramp' || k === 'wheel' || k === 'moon' || this.lab?.man === 'float') {
      const hip = joints(m)[2];
      return { c: v(hip.x - 50, Math.min(GROUND - 150, hip.y - 45)), h: 480 };
    }
    if (k === 'stack') return { c: v(m.x - 40, GROUND - 235), h: 610 };
    if (k === 'trampoline') return { c: v(m.x - 40, GROUND - 245), h: 590 };
    if (k === 'seesaw') {
      const hip = joints(m)[2];
      return { c: v(hip.x - 50, Math.min(GROUND - 150, hip.y - 45)), h: 480 };
    }
    return { c: v(m.x - 60, GROUND - 150), h: 430 };
  }

  private update(real: number) {
    const a = this.a;
    // ---- bullet time + camera ------------------------------------------------
    let focus: { c: V; h: number } | null = null;
    let near = false;
    if (!this.result) {
      for (const s of this.shots) {
        if (s.state !== 'fly') continue;
        for (const m of this.men) {
          if (m.rag) continue;
          const hp = joints(m)[2];
          if (!this.party() && s.tip.x > hp.x - 430 && s.tip.x < hp.x + (this.backShot() ? 270 : 110) && s.tip.y > hp.y - 400 && s.tip.y < hp.y + 220 && (!this.backShot() || s.vel.x < 0 || s.tip.x > hp.x - 70)) {
            near = true;
            focus = this.menFocus(m);
          }
        }
        for (const ap of this.thrown) {
          const to = sub(ap.p, s.tip);
          if (ap.state === 'air' && len(to) < 260 && to.x * s.vel.x + to.y * s.vel.y > 0) {
            near = true;
            focus = { c: v((ap.p.x + s.tip.x) / 2, (ap.p.y + s.tip.y) / 2 + 40), h: 430 };
          }
        }
        if (this.def.kind === 'seesaw' && this.sw.hung) {
          const c = v(this.wx, this.sw.wy - WEIGHT.h / 2);
          const to = sub(c, s.tip);
          if (len(to) < 300 && to.x > -40) {
            near = true;
            focus = { c: v(c.x - 90, c.y + 40), h: 520 };
          }
        }
        for (const pl of this.plates) {
          const to = sub(pl.p, s.tip);
          if (len(to) < 240 && to.x * s.vel.x + to.y * s.vel.y > 0) {
            near = true;
            focus = { c: v((pl.p.x + s.tip.x) / 2, (pl.p.y + s.tip.y) / 2 + 40), h: 430 };
          }
        }
        if (this.selfApple && s.vel.x < 0 && s.tip.x < a.x + 330 && s.tip.x > a.x - 40) {
          // our own arrow is coming back at the apple on our head
          near = true;
          focus = { c: v(a.x + 60, GROUND - 160), h: 430 };
        }
        const kind = this.def.kind;
        const standing = kind === 'bull' || (kind === 'rival' && !!this.foe && this.foe.state !== 'down');
        if (standing && s.vel.x > 0 && s.tip.x > this.T - 430 && s.tip.x < this.T + 60 && s.tip.y > GROUND - 430) {
          near = true;
          focus = this.menFocus();
        }
      }
      // his arrow is on its way: we get to watch it come
      if (this.eArrow) {
        near = true;
        focus = { c: v(a.x + 60, GROUND - 135), h: 430 };
      }
    } else if (this.result === 'win' && this.resultT < 1.25) focus = this.menFocus();
    else if (this.result === 'lose' && this.resultT < 2.6) {
      const r = this.men.find((m) => m.rag);
      if (r) {
        const hp = joints(r)[2];
        // stay with him while he is still up in the air, settle on the usual framing once he is down
        focus = { c: v(hp.x - 20, Math.min(GROUND - 125, hp.y + 25)), h: 470 };
      } else if ((this.why === 'plate' || this.why === 'shot' || this.why === 'boss' || this.why === 'self') && this.resultT < 1.7) focus = { c: v(a.x + 30, GROUND - 135), h: 450 };
    }
    this.slowT = Math.max(0, this.slowT - real);
    if (!this.cine) {
      focus = null;
      near = false;
      this.slowT = 0;
    }
    const ragSlow = this.cine && this.result === 'lose' && this.resultT < 1.2;
    this.timeScale = damp(this.timeScale, this.slowT > 0 ? 0.07 : near ? 0.28 : ragSlow ? 0.45 : 1, 30, real);
    this.viewX = damp(this.viewX, a.x, 4, real);
    const h = this.home();
    const zoom = focus ? Math.max(1, clamp(this.vh / focus.h, 0.5, 2.2) / h.scale) : 1;
    this.cam.x = damp(this.cam.x, focus ? focus.c.x : h.x, 6, real);
    this.cam.y = damp(this.cam.y, focus ? focus.c.y : h.y, 6, real);
    this.cam.z = damp(this.cam.z, zoom, 6, real);
    this.shake = damp(this.shake, 0, 9, real);
    const dt = real * this.timeScale;
    if (this.result) this.resultT += real;

    this.updateArcher(real, dt);
    this.updateLevel(dt);
    this.updateShots(dt);

    const watch = this.shots.find((s) => s.state === 'fly');
    const lookAt = watch ? watch.tip : this.pose.bow.pos;
    for (const m of this.men) {
      m.look = v(damp(m.look.x, lookAt.x, 18, real), damp(m.look.y, lookAt.y, 18, real));
      updateTarget(m, dt);
    }
    for (const b of this.loose) this.stepBody(b, dt);
    for (const p of this.parts) {
      p.life += dt;
      if (p.kind !== 'text') p.vel.y += GRAV * 0.7 * dt;
      p.p = add(p.p, mul(p.vel, dt));
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    this.emitUi();
  }

  private emitUi() {
    const a = this.a;
    const d = this.def;
    let stage: Stage = 'busy';
    const wait = this.result === 'win' ? 2.7 : this.result === 'lose' ? 3.6 : 2.2;
    if (this.result && this.resultT > wait) stage = this.result;
    else if (this.result) stage = 'flying';
    else if (a.phase === 'idle') stage = 'idle';
    else if (a.phase === 'ready') stage = this.drag ? 'aiming' : 'ready';
    else if (a.phase === 'release') stage = 'flying';
    const ui: Ui = {
      stage, level: this.level, arrows: a.quiver, total: d.arrows, shots: this.fired, canMove: this.canMove(),
      stars: this.starOv || (this.fired <= d.par ? 3 : this.fired <= d.par + 2 ? 2 : 1),
      why: this.why,
      goals: this.goals.map((g) => ({ ...g })),
    };
    const key = JSON.stringify(ui);
    if (key !== this.uiKey) {
      this.uiKey = key;
      this.onUi(ui);
    }
  }

  // ---- rendering ----------------------------------------------------------
  private frame = (now: number) => {
    const real = clamp((now - this.last) / 1000, 0, 1 / 30);
    this.last = now;
    this.update(real);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawShot(s: Shot) {
    const ctx = this.ctx;
    const gsc = (this.a.gear ?? 1) * ((s as any).growScale ?? 1);
    if (gsc !== 1) {
      ctx.save();
      ctx.translate(s.tip.x, s.tip.y);
      ctx.scale(gsc, gsc);
      ctx.translate(-s.tip.x, -s.tip.y);
    }
    // how far the tip is out of the portal it came from (any orientation)
    const out = s.clipC && s.clipN ? (s.tip.x - s.clipC.x) * s.clipN.x + (s.tip.y - s.clipC.y) * s.clipN.y : 1e9;
    const clip = s.state === 'fly' && ((s.clip !== undefined && s.tip.x > s.clip - ARROW_LEN - 30) || out < ARROW_LEN + 30);
    if (clip) {
      ctx.save();
      ctx.beginPath();
      if (s.clipC && s.clipN && out < 1e8) {
        const ang = Math.atan2(s.clipN.y, s.clipN.x);
        ctx.translate(s.clipC.x, s.clipC.y);
        ctx.rotate(ang);
        ctx.rect(0, -6000, 6000, 12000);
        ctx.rotate(-ang);
        ctx.translate(-s.clipC.x, -s.clipC.y);
      } else ctx.rect(s.clip! - 4000, -6000, 4000, 12000);
      ctx.clip();
    }
    let ang = s.ang;
    if (s.state === 'stuck') ang += 0.1 * Math.exp(-7 * s.stuckT) * Math.sin(s.stuckT * 36);
    const dir = fromAngle(ang);
    const loose = s.state === 'bounce' || s.state === 'dead';
    const tip = loose ? add(s.tip, mul(dir, ARROW_LEN / 2)) : s.tip;
    const nock = sub(tip, mul(dir, ARROW_LEN));
    const flex = s.state === 'fly' ? 6 * Math.exp(-4.5 * s.t) * Math.sin(s.t * 42) : 0;
    if (s.state === 'fly' && ((s as any).plasma || ((s as any).bp ?? 0) >= 2)) {
      stroke(ctx, [nock, tip], '#38bdf8', 9);
      stroke(ctx, [nock, tip], '#fde047', 4);
    } else if (s.state === 'fly' && !s.apples) {
      const sp = clamp(len(s.vel) / 2300, 0, 1);
      for (let i = 1; i <= 4; i++) {
        ctx.globalAlpha = 0.09 * sp * (5 - i);
        stroke(ctx, [sub(nock, mul(dir, i * 20 * sp)), sub(nock, mul(dir, (i - 1) * 20 * sp))], '#1f2937', 2.2);
      }
      ctx.globalAlpha = 1;
    }
    const alpha = s.state === 'dead' ? clamp((1.6 - s.stuckT) / 0.6, 0, 1) : 1;
    ctx.globalAlpha = alpha;
    drawArrow(ctx, nock, ang, { flex, embed: s.embed });
    if (s.state === 'fly' && (this.mini === 'bombarrow' || this.mini === 'boomerang')) {
      this.drawSpecialTip(tip, ang);
    }
    const gap = Math.min(24, 56 / Math.max(1, s.apples - 1)); // a long kebab still fits on the shaft
    for (let i = 0; i < s.apples; i++) drawApple(ctx, sub(tip, mul(dir, 34 + i * gap)), APPLE_R, ang);
    ctx.globalAlpha = 1;
    if (clip) ctx.restore();
    if (gsc !== 1) ctx.restore();
  }

  private drawFoe() {
    const ctx = this.ctx;
    const f = this.foe!;
    const T = this.T;
    const k = f.fall / 1.5;
    groundShadow(ctx, T + 70 * k, GROUND, 66 + 40 * k);
    ctx.save();
    ctx.beginPath();
    ctx.rect(T - 600, GROUND - 4000, 1400, 4001.5); // nothing shows through the floor once he is down
    ctx.clip();
    ctx.translate(T, GROUND - 13 * k);
    ctx.rotate(f.fall);
    ctx.scale(-1, 1);
    ctx.translate(0, -GROUND);
    drawArcher(ctx, f.pose);
    if (f.stick) drawArrow(ctx, sub(f.stick.p, fromAngle(f.stick.ang, ARROW_LEN)), f.stick.ang, { embed: 12 });
    ctx.restore();
    // how close he is to letting go
    if (f.state === 'wait' && f.danger > 0) {
      const w = 80;
      const x = T - w / 2;
      const y = GROUND - 252;
      ctx.fillStyle = '#f1f3f5';
      ctx.beginPath();
      ctx.roundRect(x, y, w, 11, 5.5);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = `hsl(${lerp(45, 0, f.danger)} 92% 52%)`;
      ctx.fillRect(x, y, w * f.danger, 11);
      ctx.restore();
      if (f.danger > 0.72) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(this.a.time * 22);
        ctx.fillStyle = '#dc2626';
        ctx.font = '900 20px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', x - 12, y + 6);
        ctx.globalAlpha = 1;
      }
    }
  }

  private render() {
    const ctx = this.ctx;
    const a = this.a;
    const p = this.pose;
    const d = this.def;
    const T = this.T;
    const dpr = this.canvas.width / this.vw;
    this.scale = this.home().scale;
    const sc = this.scale * this.cam.z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.translate(this.vw / 2, this.vh / 2);
    ctx.scale(sc, sc);
    ctx.translate(-this.cam.x + Math.sin(a.time * 97) * this.shake, -this.cam.y + Math.cos(a.time * 83) * this.shake);

    // floor: one quiet line and distance ticks – the stage stays white
    stroke(ctx, [v(-4000, GROUND), v(8000, GROUND)], '#d5d9e0', 2, 'butt');
    for (let x = -1200; x < 4400; x += 83.5) stroke(ctx, [v(x, GROUND + 5), v(x, GROUND + 11)], '#e2e5ea', 2, 'butt');
    // the lane the archer may walk in, closed by the red foul line
    const z0 = START_X - ZONE_BACK - 32;
    const z1 = START_X + ZONE_FWD + 52;
    ctx.fillStyle = '#e9ecf0';
    ctx.fillRect(z0, GROUND + 1, z1 - z0, 5);
    stroke(ctx, [v(z0, GROUND + 1), v(z0, GROUND + 13)], '#b9bfc8', 3, 'butt');
    stroke(ctx, [v(z1, GROUND + 1), v(z1, GROUND + 16)], '#ef4444', 3, 'butt');

    groundShadow(ctx, a.x, GROUND, 66);
    for (const m of this.men) {
      const hip = joints(m)[2];
      const lift = clamp((GROUND - 82 - hip.y) / 420, 0, 0.75); // higher up = smaller, fainter shadow
      groundShadow(ctx, hip.x, GROUND, 62 * (1 - lift * 0.6), 0.13 * (1 - lift));
    }
    groundShadow(ctx, START_X + 92, GROUND, 30, 0.1);
    for (const s of this.shots) if (s.state === 'stuck' && !s.ride) groundShadow(ctx, s.tip.x - 20, GROUND, 26, 0.08);

    if (d.v?.ceiling) {
      ctx.save();
      ctx.translate(0, 2 * GROUND - 380);
      ctx.scale(1, -1);
      drawStand(ctx, START_X + 92, GROUND);
      ctx.restore();
    } else {
      drawStand(ctx, START_X + 92, GROUND);
    }
    if (d.kind === 'thrower') {
      // faint guide: the path every thrown apple follows
      const m0 = launcherMuzzle(this.launcherX, GROUND);
      const v0 = fromAngle(LAUNCH_ANGLE, THROW_SPEED);
      ctx.fillStyle = 'rgba(227,38,45,0.22)';
      for (let k = 0.08; k < 2.1; k += 0.085) {
        ctx.beginPath();
        ctx.arc(m0.x + v0.x * k, m0.y + v0.y * k + 0.5 * APPLE_GRAV * k * k, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      groundShadow(ctx, this.launcherX, GROUND, 58);
      const charge = a.phase === 'idle' || this.result ? 0 : 1 - clamp(this.launch.timer / 0.9, 0, 1);
      drawLauncher(ctx, this.launcherX, GROUND, charge, this.launch.recoil);
    } else if (d.kind === 'trampoline') {
      groundShadow(ctx, T, GROUND, 120, 0.1);
      drawTrampoline(ctx, T, GROUND, this.tr.sag);
    } else if (d.kind === 'seesaw') {
      const sw = this.sw;
      const postX = this.fx + 262;
      const fall = clamp((sw.wy - (GROUND - 330)) / 250, 0, 1);
      groundShadow(ctx, this.wx, GROUND, 70, 0.07 + 0.13 * fall);
      groundShadow(ctx, postX, GROUND, 44, 0.1);
      drawCrane(ctx, postX, this.wx, GROUND, CRANE_H);
      const pulley = v(this.wx, GROUND - CRANE_H + 24);
      const ring = v(this.wx, sw.wy - WEIGHT.h - 14);
      if (sw.hung) stroke(ctx, [pulley, ring], '#8a6a3c', 3);
      else {
        // what is left of the rope whips about, the cut end droops on the weight
        const sway = 0.8 * Math.exp(-2.2 * sw.snapT) * Math.sin(12 * sw.snapT);
        stroke(ctx, [pulley, add(pulley, v(Math.sin(sway) * 26, Math.cos(sway) * 26))], '#8a6a3c', 3);
        stroke(ctx, [ring, add(ring, v(9, -7)), add(ring, v(15, 2))], '#8a6a3c', 3);
      }
      drawSeesaw(ctx, this.fx, GROUND, sw.ang);
      drawWeight(ctx, this.wx, sw.wy);
      if (sw.hung && a.phase !== 'idle' && !this.result) {
        // "shoot this first"
        const pulse = (a.time * 0.8) % 1;
        ctx.globalAlpha = 0.6 * (1 - pulse);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3 / Math.max(0.75, this.scale);
        ctx.beginPath();
        ctx.arc(this.wx, sw.wy - WEIGHT.h / 2, 66 + pulse * 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (d.kind === 'plates') {
      const pt = this.pt;
      const c = this.chest();
      // faint guide: the rest of the arc the plate in the air will follow
      ctx.fillStyle = 'rgba(14,165,233,0.3)';
      for (const pl of this.plates) {
        groundShadow(ctx, pl.p.x, GROUND, 24, 0.07);
        for (let k = Math.ceil((pl.t / pl.T) * 26 + 0.6) / 26; k < 0.95; k += 1 / 26) {
          ctx.beginPath();
          ctx.arc(lerp(pl.from.x, c.x, k), lerp(pl.from.y, c.y, k) - 1120 * k * (1 - k), 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      groundShadow(ctx, this.launcherX, GROUND, 58);
      const idle = a.phase === 'idle' || !!this.result || pt.sent >= 3 || this.plates.length > 0;
      drawLauncher(ctx, this.launcherX, GROUND, idle ? 0 : 1 - clamp(pt.timer / 0.9, 0, 1), pt.recoil, true);
    } else if (d.kind === 'bull') {
      groundShadow(ctx, T + 30, GROUND, 72, 0.11);
      drawBoard(ctx, T, GROUND, GROUND - BOARD_H, this.bullHits.length === 1 && !this.result ? (a.time * 0.9) % 1 : -1);
    }
    this.drawBack2();
    for (const m of this.men) {
      if (d.v?.ceiling && !m.rag) {
        ctx.save();
        ctx.translate(0, 2 * GROUND - 380);
        ctx.scale(1, -1);
        drawTarget(ctx, m);
        ctx.restore();
      } else {
        drawTarget(ctx, m);
      }
    }
    if (this.foe) this.drawFoe();
    this.drawFront2();
    if (d.kind === 'seesaw') drawGlass(ctx, this.glassX, GROUND, GLASS_H, this.sw.flash, this.sw.flashY);
    for (const s of this.shots) if (s.state !== 'fly') this.drawShot(s);
    for (const b of this.loose) {
      if (b.kind === 'apple') drawApple(ctx, b.p, APPLE_R, b.rot);
      else drawGlasses(ctx, b.p, b.rot, -1);
    }
    for (const ap of this.thrown) {
      ctx.globalAlpha = ap.state === 'ground' ? clamp((1.3 - ap.t) / 0.4, 0, 1) : 1;
      drawApple(ctx, ap.p, APPLE_R, ap.rot);
      ctx.globalAlpha = 1;
    }
    if (d.v?.ceiling) {
      ctx.save();
      ctx.translate(0, 2 * GROUND - 380);
      ctx.scale(1, -1);
      drawArcher(ctx, p);
      ctx.restore();
    } else {
      drawArcher(ctx, p);
    }
    this.drawOver3();
    if (this.meStick) {
      // the rival's arrow rides along with our torso
      const st = this.meStick;
      const d0 = sub(p.neck, p.hip);
      const L = len(d0) || 1;
      const at = add(add(p.hip, mul(d0, st.u)), mul(v(-d0.y / L, d0.x / L), st.w));
      const ang = Math.atan2(d0.y, d0.x) + st.rel;
      drawArrow(ctx, sub(at, fromAngle(ang, ARROW_LEN)), ang, { embed: 11 });
    }
    for (const pl of this.plates) drawPlate(ctx, pl.p, PLATE_R, pl.spin);
    if (this.eArrow) drawArrow(ctx, sub(this.eArrow.p, fromAngle(this.eArrow.ang, ARROW_LEN)), this.eArrow.ang);
    for (const s of this.shots) if (s.state === 'fly') this.drawShot(s);

    // aim guide + power meter
    const frac = clamp(a.pull / MAX_DRAW, 0, 1);
    const arOrig = this.arrowOrigin();
    if (a.phase === 'ready' && arOrig && frac > 0.06) {
      const dir = fromAngle(arOrig.angle);
      const tip = add(arOrig.nock, mul(dir, ARROW_LEN * (a.gear ?? 1)));
      const vel = add(mul(dir, speedOf(frac) * this.vv('power', 1)), v(this.vx, 0));
      const dot = 3.6 / Math.max(0.75, this.scale);
      const gMult =
        this.lab?.guide ??
        (this.def.mini === 'bucket' || this.def.mini === 'hoops' ? 3.2 : this.def.mini === 'boomerang' ? 2.8 : 1);
      const gN = Math.round(11 * gMult);
      for (let i = 1; i <= gN; i++) {
        const k = i * 0.026;
        ctx.globalAlpha = 0.55 * (1 - i / (gN + 1)) * clamp(frac * 3, 0, 1);
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        const gq = this.guideAt(tip, vel, k);
        ctx.arc(gq.x, gq.y, dot * Math.max(0.4, 1 - (i * 0.495) / gN), 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.def.mini === 'split') {
        const splitT = 0.14;
        const splitPos = this.guideAt(tip, vel, splitT);
        const vAtSplit = v(vel.x, vel.y + GRAV * this.gk * splitT);
        const sp = len(vAtSplit);
        const baseAng = Math.atan2(vAtSplit.y, vAtSplit.x);
        for (const da of [-0.095, 0.095]) {
          const bVel = fromAngle(baseAng + da, sp);
          for (let j = 1; j <= 6; j++) {
            const tk = j * 0.026;
            const bq = this.guideAt(splitPos, bVel, tk);
            ctx.globalAlpha = 0.38 * (1 - j / 7) * clamp(frac * 3, 0, 1);
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(bq.x, bq.y, dot * 0.72, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      const bx = a.x - 42;
      const by = GROUND + 24;
      ctx.fillStyle = '#f1f3f5';
      ctx.beginPath(); ctx.roundRect(bx, by, 84, 12, 6); ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = `hsl(${lerp(52, 2, frac)} 92% 54%)`;
      ctx.fillRect(bx, by, 84 * frac, 12);
      ctx.restore();
      ctx.fillStyle = '#111827';
      ctx.font = '800 12px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(frac * 100)}%`, bx + 92, by + 6.5);
    }

    // "pick up the bow" marker
    if (a.phase === 'idle') {
      const g = d.v?.ceiling ? v(p.bow.pos.x, 2 * GROUND - 380 - p.bow.pos.y) : p.bow.pos;
      const bob = Math.sin(a.time * 4.2) * 5;
      const pulse = (a.time * 0.9) % 1;
      const k = 1 / Math.max(0.7, this.scale);
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.scale(k, k);
      ctx.globalAlpha = 1 - pulse;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 14 + pulse * 26, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#111827';
      ctx.beginPath(); ctx.roundRect(-62, -150 + bob, 124, 30, 15); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-9, -121 + bob); ctx.lineTo(9, -121 + bob); ctx.lineTo(0, -109 + bob); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 14px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tx('GRAB BOW', 'AMBIL BUSUR'), 0, -134.5 + bob);
      ctx.restore();
    }

    // particles
    for (const q of this.parts) {
      const k = q.life / q.max;
      ctx.globalAlpha = clamp(1 - k * k, 0, 1);
      if (q.kind === 'text') {
        const pop = 1 + 0.5 * Math.exp(-q.life * 9) * Math.cos(q.life * 22);
        ctx.save();
        ctx.translate(q.p.x, q.p.y);
        ctx.scale(pop, pop);
        ctx.rotate(-0.06);
        ctx.font = `900 ${q.size}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#fff';
        ctx.strokeText(q.text!, 0, 0);
        ctx.fillStyle = q.color;
        ctx.fillText(q.text!, 0, 0);
        ctx.restore();
      } else if (q.kind === 'star') {
        ctx.save();
        ctx.translate(q.p.x, q.p.y);
        ctx.rotate(q.rot);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? q.size * 0.45 : q.size;
          ctx.lineTo(Math.cos((i * Math.PI) / 5) * r, Math.sin((i * Math.PI) / 5) * r);
        }
        ctx.closePath();
        ctx.fillStyle = q.color;
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(q.p.x, q.p.y, q.size * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // drag handle (screen space)
    if (this.drag && (a.phase === 'ready' || a.phase === 'nock' || a.phase === 'recover')) {
      const r = this.canvas.getBoundingClientRect();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const A = v(this.drag.ax - r.left, this.drag.ay - r.top);
      const B = v(this.drag.cx - r.left, this.drag.cy - r.top);
      ctx.setLineDash([6, 7]);
      stroke(ctx, [A, B], 'rgba(17,24,39,0.35)', 2);
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(17,24,39,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(A.x, A.y, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(239,68,68,0.9)';
      ctx.beginPath(); ctx.arc(B.x, B.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }
}
