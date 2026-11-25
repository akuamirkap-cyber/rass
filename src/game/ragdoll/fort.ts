// The sturdy wooden fortress ("Istana Kayu Kokoh"): heavy iron-clad oak walls, stone-and-log rampart plinth,
// torchlit interior keep, crenellated battlements, and exposed structural weak joints ("Sisi Lemah") that bring
// the whole fortress crashing down when struck accurately.
import { tx } from '../../i18n';
import { Ctx, V, v, clamp } from '../util';
import { BowId, drawArrow } from './stick';
import type { SkinId } from './config';

export type FortBlockKind = 'armor' | 'weak' | 'post' | 'plank' | 'roof';

export interface FortBlock {
  kind: FortBlockKind;
  /** short Indonesian label for floating combat feedback */
  label: string;
  /** at rest: centre x from the middle of the fort's ground, bottom edge above that ground, width and height */
  x: number; y: number; w: number; h: number;
  hp: number; max: number;
  /** the timbers it rests on (none: the ground itself). It comes down as soon as one of them is gone */
  on: number[];
  state: 'up' | 'fall' | 'gone';
  /** while it falls: where it is, how it moves and turns, how long it has been falling, whether it has landed yet */
  p: V; vel: V; rot: number; vr: number; life: number; landed: boolean;
  /** flash of a hit; seconds of fire left in it; whether that fire has already crept on to its neighbours */
  flash: number; burn: number; spread: boolean;
  skinOwner?: SkinId;
  /** arrows standing in it, in its own frame */
  stuck: { x: number; y: number; ang: number; bow: BowId }[];
}

const block = (
  kind: FortBlockKind,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  hp: number,
  on: number[] = [],
): FortBlock => ({
  kind, label, x, y, w, h, hp, max: hp, on, state: 'up',
  p: v(0, 0), vel: v(0, 0), rot: 0, vr: 0, life: 0, landed: false, flash: 0, burn: 0, spread: false, stuck: [],
});

/**
 * Named structural indices & layout constants for RagWorld:
 * - W_LOW (0): Lower Structural Weak Joint ("PASAK PONDASI") at the foot of the front wall
 * - L1 (1): Heavy Iron-Clad Lower Shield Wall ("DINDING BESI") resting on W_LOW
 * - L2 (2): Rear Heavy Timber Bastion Column
 * - DECK (3): Reinforced 2nd-Floor Castle Rampart Deck resting on [L1, L2]
 * - U1 (4): Upper Iron-Clad Parapet Wall ("PERISAI MENARA") resting on [DECK]
 * - W_HIGH (5): Upper Roof Truss Weak Joint ("SENDI ATAP") resting on [U1]
 * - U2 (6): Upper Rear Bastion Column resting on [DECK]
 * - ROOF (7): Heavy Crenellated Watchtower Roof & Gables resting on [W_HIGH, U2]
 */
export const FORT = {
  W_LOW: 0,
  L1: 1,
  L2: 2,
  DECK: 3,
  U1: 4,
  W_HIGH: 5,
  U2: 6,
  ROOF: 7,
  W: 256,
  DECK_Y: 124,
  G1X: -32,
  G2X: -10,
};

/**
 * Builds the 2-story Ironbound Timber Fortress.
 * Direct hits on `'armor'` walls are heavily deflected by iron plates; aiming at `'weak'` joints
 * (`W_LOW` at the lower front foot, or `W_HIGH` under the high roof eaves) snaps the load-bearing structure!
 */
export function makeFort(level: number): FortBlock[] {
  const k = 1 + Math.min(Math.max(0, level - 2), 12) * 0.065;
  return [
    block('weak', tx('FOUNDATION PEG', 'PASAK PONDASI'), -100, 0, 28, 34, Math.round(128 * k)),
    block('armor', tx('IRONCLAD WALL', 'DINDING LAPIS BESI'), -100, 34, 30, 74, Math.round(285 * k), [0]),
    block('post', tx('REAR PILLAR', 'PILAR BELAKANG'), 100, 0, 24, 108, Math.round(160 * k)),
    block('plank', tx('FORTRESS DECK', 'LANTAI BENTENG'), 0, 108, 242, 16, Math.round(150 * k), [1, 2]),
    block('armor', tx('TOWER SHIELD', 'PERISAI MENARA'), -72, 124, 26, 58, Math.round(235 * k), [3]),
    block('weak', tx('ROOF JOINT', 'SENDI ATAP'), -72, 182, 26, 30, Math.round(88 * k), [4]),
    block('post', tx('TOWER POST', 'TIANG MENARA'), 72, 124, 22, 88, Math.round(130 * k), [3]),
    block('roof', tx('CASTLE ROOF', 'ATAP ISTANA'), 0, 212, 196, 22, Math.round(145 * k), [5, 6]),
  ];
}

/** a standing timber's box in the world, given where the middle of the fort's ground is */
export const blockBox = (b: FortBlock, gx: number, gy: number) => ({
  x0: gx + b.x - b.w / 2,
  x1: gx + b.x + b.w / 2,
  y0: gy - b.y - b.h,
  y1: gy - b.y,
});
export const blockCentre = (b: FortBlock, gx: number, gy: number): V => v(gx + b.x, gy - b.y - b.h / 2);

/**
 * Drawn behind the guards and standing timbers:
 * 1) Stone-and-log fortified foundation plinth & side buttresses on the island
 * 2) Dark timber castle interior hall, diagonal cross-beams & warm flickering torches while the keep stands
 */
export function drawFortBackdrop(ctx: Ctx, blocks: FortBlock[], gx: number, gy: number, fallen: boolean, t: number) {
  const baseAlpha = ctx.globalAlpha;
  ctx.save();

  // --- 1. Fortified Stone & Timber Foundation Rampart along the island top ---
  const pw = 236;
  const ph = 14;
  ctx.fillStyle = '#181310';
  ctx.fillRect(gx - pw / 2 - 2, gy - ph + 3, pw + 4, ph + 2);
  const sg = ctx.createLinearGradient(0, gy - ph + 3, 0, gy + 4);
  sg.addColorStop(0, '#6a737b');
  sg.addColorStop(0.45, '#49525a');
  sg.addColorStop(1, '#2a3036');
  ctx.fillStyle = sg;
  ctx.fillRect(gx - pw / 2, gy - ph + 4, pw, ph - 1);

  // Masonry joints on the stone foundation
  ctx.strokeStyle = 'rgba(15, 20, 24, 0.65)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let sx = -pw / 2 + 28; sx < pw / 2 - 12; sx += 34) {
    ctx.moveTo(gx + sx, gy - ph + 4);
    ctx.lineTo(gx + sx, gy + 3);
  }
  ctx.moveTo(gx - pw / 2, gy - 3);
  ctx.lineTo(gx + pw / 2, gy - 3);
  ctx.stroke();

  // Rear diagonal log buttress anchoring the keep
  if (blocks[FORT.L2]?.state === 'up') {
    ctx.save();
    ctx.strokeStyle = '#24130a';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx + 104, gy - 68);
    ctx.lineTo(gx + 123, gy - 3);
    ctx.stroke();
    ctx.strokeStyle = '#7a4a24';
    ctx.lineWidth = 7.5;
    ctx.stroke();
    ctx.restore();
  }

  // --- 2. Interior Castle Hall Backdrop & Warm Flickering Torches (disappears as floors collapse) ---
  const deckUp = blocks[FORT.DECK]?.state === 'up' && !fallen;
  const roofUp = blocks[FORT.ROOF]?.state === 'up' && !fallen;

  if (deckUp) {
    const x0 = gx - 88;
    const w0 = 178;
    const yTop = gy - 108;
    const h0 = 100;

    // Deep dark-wood interior wall planks
    const bg = ctx.createLinearGradient(0, yTop, 0, gy - 8);
    bg.addColorStop(0, '#23130b');
    bg.addColorStop(0.5, '#2f1a0f');
    bg.addColorStop(1, '#1a0d07');
    ctx.fillStyle = bg;
    ctx.globalAlpha = baseAlpha * 0.88;
    ctx.fillRect(x0, yTop, w0, h0);

    // Horizontal log seams & diagonal X-bracing inside the keep
    ctx.strokeStyle = 'rgba(12, 5, 2, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let ly = yTop + 16; ly < gy - 10; ly += 16) {
      ctx.moveTo(x0 + 2, ly);
      ctx.lineTo(x0 + w0 - 2, ly);
    }
    ctx.stroke();

    // Heavy interior X-timber brace
    ctx.strokeStyle = 'rgba(92, 54, 26, 0.55)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0 + 12, yTop + 8);
    ctx.lineTo(x0 + w0 - 12, gy - 12);
    ctx.moveTo(x0 + w0 - 12, yTop + 8);
    ctx.lineTo(x0 + 12, gy - 12);
    ctx.stroke();

    // Dark arched castle gate silhouette in the rear centre
    ctx.fillStyle = 'rgba(10, 5, 3, 0.72)';
    ctx.beginPath();
    ctx.moveTo(gx + 16, gy - 8);
    ctx.lineTo(gx + 16, gy - 54);
    ctx.arc(gx + 38, gy - 54, 22, Math.PI, 0, false);
    ctx.lineTo(gx + 60, gy - 8);
    ctx.closePath();
    ctx.fill();

    // Flickering warm castle wall torch on 1st floor
    drawWallTorch(ctx, gx + 8, gy - 68, t, baseAlpha);
  }

  if (roofUp) {
    const x1 = gx - 62;
    const w1 = 126;
    const yTop1 = gy - 212;
    const h1 = 88;

    const ug = ctx.createLinearGradient(0, yTop1, 0, yTop1 + h1);
    ug.addColorStop(0, '#1f1109');
    ug.addColorStop(1, '#2b180d');
    ctx.fillStyle = ug;
    ctx.globalAlpha = baseAlpha * 0.84;
    ctx.fillRect(x1, yTop1, w1, h1);

    ctx.strokeStyle = 'rgba(88, 52, 25, 0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x1 + 8, yTop1 + 6);
    ctx.lineTo(x1 + w1 - 8, yTop1 + h1 - 6);
    ctx.moveTo(x1 + w1 - 8, yTop1 + 6);
    ctx.lineTo(x1 + 8, yTop1 + h1 - 6);
    ctx.stroke();

    drawWallTorch(ctx, gx + 24, gy - 178, t + 1.7, baseAlpha);
  }

  ctx.restore();
}

function drawWallTorch(ctx: Ctx, x: number, y: number, t: number, baseAlpha: number) {
  const flk = 0.86 + 0.14 * Math.sin(t * 17) * Math.cos(t * 9.3);
  ctx.save();
  // Ambient warm glow
  const rg = ctx.createRadialGradient(x, y - 6, 2, x, y - 6, 36 * flk);
  rg.addColorStop(0, 'rgba(255, 190, 70, 0.42)');
  rg.addColorStop(0.5, 'rgba(255, 110, 20, 0.16)');
  rg.addColorStop(1, 'rgba(255, 80, 0, 0)');
  ctx.globalAlpha = baseAlpha;
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(x, y - 6, 36 * flk, 0, Math.PI * 2);
  ctx.fill();

  // Iron sconce & wooden torch handle
  ctx.strokeStyle = '#3a2b22';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y + 10);
  ctx.lineTo(x, y - 2);
  ctx.stroke();
  ctx.fillStyle = '#573d28';
  ctx.fillRect(x - 3, y - 4, 6, 3);

  // Tear-drop flame
  const sway = Math.sin(t * 14) * 1.8;
  ctx.fillStyle = '#ff7b14';
  ctx.beginPath();
  ctx.moveTo(x - 4.2, y - 4);
  ctx.quadraticCurveTo(x - 4.5, y - 13, x + sway, y - 16 * flk);
  ctx.quadraticCurveTo(x + 4.5, y - 13, x + 4.2, y - 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffe566';
  ctx.beginPath();
  ctx.arc(x + sway * 0.4, y - 7.5, 2.4 * flk, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawFortBlock(ctx: Ctx, b: FortBlock, gx: number, gy: number, t: number) {
  if (b.state === 'gone') return;
  const falling = b.state === 'fall';
  const c = falling ? b.p : blockCentre(b, gx, gy);
  const w = b.w;
  const h = b.h;
  const tall = h > w;
  const base = ctx.globalAlpha;
  const hurt = clamp(1 - b.hp / b.max, 0, 1);

  ctx.save();
  ctx.translate(c.x, c.y);
  if (falling) {
    ctx.rotate(b.rot);
    ctx.globalAlpha = base * clamp(2.4 - b.life, 0, 1);
  }

  if (b.kind === 'armor') {
    // ============ HEAVY IRON-CLAD OAK PALISADE WALL ============
    ctx.fillStyle = '#170d07';
    ctx.fillRect(-w / 2 - 1.8, -h / 2 - 1.8, w + 3.6, h + 3.6);

    // Dense dark-oak stacked log core
    const wg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    wg.addColorStop(0, '#9c6334');
    wg.addColorStop(0.35, '#784820');
    wg.addColorStop(1, '#43250f');
    ctx.fillStyle = wg;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Horizontal stacked heavy log rounds
    ctx.strokeStyle = 'rgba(24, 10, 4, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let ly = -h / 2 + 12; ly < h / 2 - 6; ly += 12) {
      ctx.moveTo(-w / 2, ly);
      ctx.lineTo(w / 2, ly);
    }
    ctx.stroke();

    // Heavy front dark-steel armor plating on the outer (left/player-facing) face
    const plateW = w * 0.46;
    const ig = ctx.createLinearGradient(-w / 2, 0, -w / 2 + plateW, 0);
    ig.addColorStop(0, '#8899a6');
    ig.addColorStop(0.35, '#52626e');
    ig.addColorStop(1, '#2b353d');
    ctx.fillStyle = ig;
    ctx.fillRect(-w / 2, -h / 2 + 2, plateW, h - 4);

    // Horizontal forged-iron binding straps wrapping the entire wall
    ctx.fillStyle = '#2d3740';
    for (const sy of [-h / 2 + 7, 0, h / 2 - 7]) {
      ctx.fillRect(-w / 2 - 1, sy - 3.2, w + 2, 6.4);
      ctx.fillStyle = '#aebdca';
      for (const rx of [-w * 0.3, 0, w * 0.3]) {
        ctx.beginPath();
        ctx.arc(rx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#2d3740';
    }

    // Round Viking/medieval steel shield boss mounted on the outer wall
    if (!falling) {
      ctx.fillStyle = '#232c33';
      ctx.beginPath();
      ctx.arc(-w / 2 + 1, 8, 9, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.fillStyle = '#9fb0bd';
      ctx.beginPath();
      ctx.arc(-w / 2 + 1, 8, 5.5, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
    }

    // Narrow armored murder-slit for the guard's arrows
    if (!falling) {
      ctx.fillStyle = '#0e0704';
      ctx.fillRect(-w / 2 + 3, -h * 0.24, w - 6, 13);
      ctx.strokeStyle = '#6c7c88';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-w / 2 + 3, -h * 0.24, w - 6, 13);
    }
  } else if (b.kind === 'weak') {
    // ============ EXPOSED CRACKED TIMBER KEYSTONE / WEAK JOINT ("SISI LEMAH") ============
    const pulse = 0.5 + 0.5 * Math.sin(t * 6.5);
    ctx.fillStyle = '#241106';
    ctx.fillRect(-w / 2 - 1.6, -h / 2 - 1.6, w + 3.2, h + 3.2);

    // Warm golden-amber dry pine heartwood (visually softer & brighter than the dark iron oak!)
    const wg = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    wg.addColorStop(0, '#ffd478');
    wg.addColorStop(0.45, '#e0943a');
    wg.addColorStop(1, '#9c5618');
    ctx.fillStyle = wg;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Recessed notched waist / wedge mortise look on left & right edges
    ctx.fillStyle = '#1b0d05';
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 0.5, -5);
    ctx.lineTo(-w / 2 + 5.5, 0);
    ctx.lineTo(-w / 2 - 0.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w / 2 + 0.5, -5);
    ctx.lineTo(w / 2 - 5.5, 0);
    ctx.lineTo(w / 2 + 0.5, 5);
    ctx.closePath();
    ctx.fill();

    // Rope X-lashing holding the strained timber wedge together
    ctx.strokeStyle = '#6e431c';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, -h / 2 + 4);
    ctx.lineTo(w / 2 - 3, h / 2 - 4);
    ctx.moveTo(w / 2 - 3, -h / 2 + 4);
    ctx.lineTo(-w / 2 + 3, h / 2 - 4);
    ctx.stroke();

    ctx.strokeStyle = '#f2cc85';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Glowing amber weakness fissure in the joint
    if (!falling) {
      ctx.strokeStyle = `rgba(255, 238, 120, ${0.55 + 0.4 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.32, -2);
      ctx.lineTo(-2, 3);
      ctx.lineTo(w * 0.28, -3);
      ctx.stroke();
    }
  } else if (b.kind === 'roof') {
    // ============ HEAVY CRENELLATED CASTLE WATCHTOWER ROOF & GABLE ============
    // Pitched shingled gable roof above the main roof beam
    if (!falling || b.life < 2.4) {
      ctx.fillStyle = '#211108';
      ctx.beginPath();
      ctx.moveTo(-w * 0.44, -h / 2);
      ctx.lineTo(0, -h / 2 - 28);
      ctx.lineTo(w * 0.44, -h / 2);
      ctx.closePath();
      ctx.fill();

      const rg = ctx.createLinearGradient(0, -h / 2 - 26, 0, -h / 2);
      rg.addColorStop(0, '#9e3428');
      rg.addColorStop(0.6, '#6e2119');
      rg.addColorStop(1, '#47130e');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(-w * 0.41, -h / 2);
      ctx.lineTo(0, -h / 2 - 25);
      ctx.lineTo(w * 0.41, -h / 2);
      ctx.closePath();
      ctx.fill();

      // Timber rafters on the gable
      ctx.strokeStyle = '#d49a56';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-w * 0.42, -h / 2);
      ctx.lineTo(0, -h / 2 - 26);
      ctx.lineTo(w * 0.42, -h / 2);
      ctx.stroke();

      // Wooden battlements (merlons) along the roof crown
      for (let mx = -w / 2 + 4; mx <= w / 2 - 20; mx += 26) {
        ctx.fillStyle = '#24130a';
        ctx.fillRect(mx - 1.2, -h / 2 - 12.2, 16.4, 13.4);
        ctx.fillStyle = '#b5763a';
        ctx.fillRect(mx, -h / 2 - 11, 14, 12);
        ctx.fillStyle = '#3b2a1e';
        ctx.fillRect(mx, -h / 2 - 11, 14, 3);
      }
    }

    // Main heavy roof cornice beam
    ctx.fillStyle = '#24130a';
    ctx.fillRect(-w / 2 - 1.6, -h / 2 - 1.6, w + 3.2, h + 3.2);
    const bg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    bg.addColorStop(0, '#d8a05c');
    bg.addColorStop(0.4, '#9e622b');
    bg.addColorStop(1, '#593415');
    ctx.fillStyle = bg;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Golden castle crest shield in the centre of the cornice
    ctx.fillStyle = '#2b1b10';
    ctx.beginPath();
    ctx.moveTo(-9, -7);
    ctx.lineTo(9, -7);
    ctx.lineTo(9, 2);
    ctx.lineTo(0, 9);
    ctx.lineTo(-9, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(-6.5, -4.8);
    ctx.lineTo(6.5, -4.8);
    ctx.lineTo(6.5, 1);
    ctx.lineTo(0, 6.5);
    ctx.lineTo(-6.5, 1);
    ctx.closePath();
    ctx.fill();
  } else if (b.kind === 'plank') {
    // ============ REINFORCED 2ND-FLOOR CASTLE RAMPART DECK ============
    // Front wooden parapet merlons rising along the balcony edge
    if (!falling) {
      for (let mx = -w / 2 + 6; mx < -w * 0.08; mx += 24) {
        ctx.fillStyle = '#24130a';
        ctx.fillRect(mx - 1, -h / 2 - 9, 15, 10);
        ctx.fillStyle = '#9c622d';
        ctx.fillRect(mx, -h / 2 - 8, 13, 9);
      }
      // Diagonal knee-braces under the deck ends
      ctx.strokeStyle = '#5e3819';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 22, h / 2);
      ctx.lineTo(-w / 2 + 6, h / 2 + 16);
      ctx.moveTo(w / 2 - 22, h / 2);
      ctx.lineTo(w / 2 - 6, h / 2 + 16);
      ctx.stroke();
    }

    ctx.fillStyle = '#24130a';
    ctx.fillRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#dfa763');
    g.addColorStop(0.35, '#a86b32');
    g.addColorStop(1, '#5e3818');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Iron bolt studs along the deck beam
    ctx.fillStyle = '#2d3740';
    ctx.fillRect(-w / 2 + 10, -h / 2, 5, h);
    ctx.fillRect(w / 2 - 15, -h / 2, 5, h);
    ctx.fillStyle = '#cbd6df';
    for (let bx = -w / 2 + 32; bx <= w / 2 - 32; bx += 32) {
      ctx.beginPath();
      ctx.arc(bx, 0, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // ============ REAR HEAVY TIMBER BASTION COLUMN ('post') ============
    ctx.fillStyle = '#24130a';
    ctx.fillRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3);
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, '#d29955');
    g.addColorStop(0.35, '#9d622c');
    g.addColorStop(1, '#593416');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Wood grain & iron end-straps
    ctx.strokeStyle = 'rgba(48, 22, 6, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.18, -h / 2 + 12);
    ctx.lineTo(-w * 0.15, h / 2 - 12);
    ctx.moveTo(w * 0.2, -h / 2 + 16);
    ctx.lineTo(w * 0.18, h / 2 - 16);
    ctx.stroke();

    for (const e of [-1, 1]) {
      ctx.fillStyle = '#33251b';
      ctx.fillRect(-w / 2 - 0.5, e * (h / 2 - 8) - 2.5, w + 1, 5);
      ctx.fillStyle = '#e5d2b0';
      ctx.beginPath();
      ctx.arc(0, e * (h / 2 - 8), 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ============ PROGRESSIVE SPLINTER CRACKS ============
  if (hurt > 0.22) {
    const crack = (q: number) => {
      if (tall) {
        const y = -h / 2 + h * q;
        ctx.moveTo(-w / 2, y);
        ctx.lineTo(-w * 0.14, y + 4.5);
        ctx.lineTo(w * 0.14, y - 3.5);
        ctx.lineTo(w / 2, y + 2.5);
      } else {
        const x = -w / 2 + w * q;
        ctx.moveTo(x, -h / 2);
        ctx.lineTo(x + 4.5, -h * 0.15);
        ctx.lineTo(x - 3.5, h * 0.15);
        ctx.lineTo(x + 2, h / 2);
      }
    };
    ctx.strokeStyle = b.kind === 'weak' ? '#2b0d00' : '#170b05';
    ctx.lineWidth = b.kind === 'weak' ? 2.4 : 1.9;
    ctx.beginPath();
    crack(0.36);
    if (hurt > 0.55) crack(0.68);
    ctx.stroke();
  }

  // Charred fire overlay & white impact flash
  if (b.burn > 0) {
    ctx.fillStyle = `rgba(20,8,2,${clamp(0.25 + (4 - b.burn) * 0.1, 0, 0.62)})`;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  if (b.flash > 0.02) {
    ctx.fillStyle = `rgba(255,255,255,${clamp(b.flash, 0, 1) * 0.72})`;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }

  for (const st of b.stuck) drawArrow(ctx, v(st.x, st.y), st.ang, 1, true, st.bow, t, false);
  ctx.restore();
}

/** Twin royal crimson-and-gold war banners fluttering atop the watchtower roof */
export function drawFortFlag(ctx: Ctx, roof: FortBlock, gx: number, gy: number, t: number) {
  if (!roof || roof.state !== 'up') return;
  const topY = gy - roof.y - roof.h;

  for (const [ox, height, scale] of [[0, 56, 1.12], [68, 38, 0.85]] as [number, number, number][]) {
    const x = gx + roof.x + ox;
    const y = ox === 0 ? topY - 24 : topY - 10;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#24130a';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x, y - height);
    ctx.stroke();

    ctx.strokeStyle = '#b8783c';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x, y - height);
    ctx.stroke();

    const wv = (q: number) => Math.sin(t * 5.2 - q * 3.3 + ox * 0.05) * 3.1 * q;
    const len = 32 * scale;
    const fh = 15 * scale;
    ctx.fillStyle = '#e5352f';
    ctx.beginPath();
    ctx.moveTo(x, y - height + 2);
    ctx.quadraticCurveTo(x - len * 0.45, y - height - 2 + wv(0.5), x - len, y - height + fh * 0.42 + wv(1));
    ctx.lineTo(x - len * 0.78, y - height + fh * 0.55 + wv(0.8));
    ctx.lineTo(x - len, y - height + fh * 0.85 + wv(1));
    ctx.quadraticCurveTo(x - len * 0.45, y - height + fh + wv(0.5), x, y - height + fh);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(x, y - height - 2, 2.6 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
