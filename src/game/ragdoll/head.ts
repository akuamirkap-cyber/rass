// Skins: what a fighter wears on his head instead of the ninja headband. Hats and helmets are drawn in the head's
// own frame, so they tilt, nod and mirror with it.
//
// Supple Hair Physics ("Luwes"):
// Every lock (back mane, shinobi wolf-tail, twin face-framing bangs, cheek sidelocks, and Robin's feather) is a live
// Verlet chain with:
//  1) Sleek root-follicle tangency near the scalp/cord-tie, giving natural volume while leaving the length & tips
//     free to drape under gravity and trail with silky follow-through.
//  2) Free-air fluidity paired with parent-child viscous shear damping, so head tilts, bow draws, and arrow releases
//     send a smooth travelling S-wave from root to tip without stiff glueiness or chaotic worm-wiggling.
//  3) Anti-buckling downward drape on face-framing bangs so even on violent recoil they sweep side-to-side cleanly
//     without ever folding upside-down into knots or horns.
import { Ctx, V, v, clamp } from '../util';
import { HEAD_R, Stick } from './stick';
import { CutMotion, drawRefinedHair, isRefinedHair, makeCutMotion, stepCutMotion } from './haircuts';
import type { SkinId } from './config';

export type HeadStyle = SkinId;
export const HEAD_STYLES: HeadStyle[] = ['band', 'sephiroth', 'guts', 'luffy', 'sanji', 'sekiro', 'racer', 'robin', 'cowboy', 'punk', 'saiyan', 'gojo', 'sasuke', 'levi', 'jinwoo', 'vergil', 'gojo_blue', 'rengoku'];

/**
 * - `back`: behind the entire body (long silver mane, arched shinobi wolf-tail)
 * - `farBang`: behind the head/face silhouette (far-side brow/cheek bang)
 * - `front`: over the head/body (near-side iconic bangs & cheek sidelocks)
 * - `feather`: stiff-spring hat plume
 */
type Layer = 'back' | 'farBang' | 'front' | 'feather';

interface Lock {
  p: V[];
  o: V[];
  seg: number;
  /** pin in head-local coords: +x toward face, +y toward neck */
  x: number;
  y: number;
  /** half-width at fullest body */
  w: number;
  layer: Layer;
  /** palette shade index (3 = silver-ash Dragonrot streak on Sekiro) */
  tone: number;
  /** true: softly clears skull & upper-back/shoulder contour */
  collide: boolean;
  /** root-follicle launch direction [fwX, downY] in head-local space */
  launch: [number, number];
  /** how strongly segments 1..2 hold their root arch out of the scalp/knot */
  rootLift: number;
  /** exponential decay of rootLift along segments */
  decay: number;
  /** downward gravity acceleration */
  grav: number;
  /** true if outer edge stroke fades in after the root so scalp parting is 100% seamless */
  seamlessRoot?: boolean;
  /** keeps a near-side bang clear of the eye (`lx <= eyeClearX` near `y = 0`) */
  eyeClearX?: number;
  /** true for upward-swept spiky locks (Guts / Luffy crown spikes) so they spring upward instead of clamping down */
  spikyUp?: boolean;
}

export interface Hair {
  style: HeadStyle;
  locks: Lock[];
  cut?: CutMotion;
  bx?: number;
  by?: number;
  hx?: number;
  hy?: number;
}

const H = 1 / 120;

/** the skull's own axes: `u` out of the crown, `fw` the way he faces */
const frame = (k: Stick) => {
  const dx = k.p[0].x - k.p[1].x;
  const dy = k.p[0].y - k.p[1].y;
  const l = Math.hypot(dx, dy) || 1;
  const u = v(dx / l, dy / l);
  return { u, fw: v(-u.y * k.face, u.x * k.face) };
};

/** a point of the head's frame, out in the world */
const pin = (k: Stick, x: number, y: number): V => {
  const { u, fw } = frame(k);
  return v(k.p[0].x + (fw.x * x - u.x * y) * k.s, k.p[0].y + (fw.y * x - u.y * y) * k.s);
};

/** converts a head-local direction `[lx, ly]` (+lx = forward, +ly = down toward neck) into a unit world vector */
const localDir = (u: V, fw: V, lx: number, ly: number): V => {
  const wx = fw.x * lx - u.x * ly;
  const wy = fw.y * lx - u.y * ly;
  const l = Math.hypot(wx, wy) || 1;
  return v(wx / l, wy / l);
};

/** builds all simulated locks of a skin in a natural initial drape */
export function makeHair(style: HeadStyle, k: Stick): Hair | null {
  if (isRefinedHair(style)) return { style, locks: [], cut: makeCutMotion(k) };
  const { u, fw } = frame(k);

  const mk = (opts: {
    x: number;
    y: number;
    n: number;
    seg: number;
    w: number;
    layer: Layer;
    tone: number;
    collide?: boolean;
    launch: [number, number];
    rootLift: number;
    decay?: number;
    grav?: number;
    seamlessRoot?: boolean;
    eyeClearX?: number;
    spikyUp?: boolean;
  }): Lock => {
    const a = pin(k, opts.x, opts.y);
    const ld = localDir(u, fw, opts.launch[0], opts.launch[1]);
    const p: V[] = [a];
    for (let i = 1; i < opts.n; i++) {
      const t = i / (opts.n - 1);
      const blend = opts.layer === 'feather' || opts.spikyUp ? 0 : Math.min(1, t * 1.2);
      const dx = ld.x * (1 - blend) + -k.face * 0.1 * blend;
      const dy = ld.y * (1 - blend) + 1.0 * blend;
      const dl = Math.hypot(dx, dy) || 1;
      const prev = p[i - 1];
      p.push(v(prev.x + (dx / dl) * opts.seg * k.s, prev.y + (dy / dl) * opts.seg * k.s));
    }
    return {
      p,
      o: p.map((q) => ({ ...q })),
      seg: opts.seg,
      x: opts.x,
      y: opts.y,
      w: opts.w,
      layer: opts.layer,
      tone: opts.tone,
      collide: opts.collide ?? true,
      launch: opts.launch,
      rootLift: opts.rootLift,
      decay: opts.decay ?? 1.15,
      grav: opts.grav ?? 900,
      seamlessRoot: opts.seamlessRoot,
      eyeClearX: opts.eyeClearX,
      spikyUp: opts.spikyUp,
    };
  };

  if (style === 'sephiroth') {
    // Sleek, regal platinum-silver cascade at rest that billows into a lush S-wave on every bow draw & release,
    // paired with supple twin face-framing M-bangs!
    return {
      style,
      locks: [
        // --- Back cascading silver mane (6 sleek nested silk ribbons from inner nape to outer crown) ---
        mk({ x: -5.2, y: 5.4, n: 10, seg: 6.2, w: 4.4, layer: 'back', tone: 2, launch: [-0.26, 0.96], rootLift: 0.06, decay: 1.3, grav: 940 }),
        mk({ x: -6.8, y: 2.2, n: 11, seg: 6.6, w: 5.0, layer: 'back', tone: 1, launch: [-0.34, 0.94], rootLift: 0.07, decay: 1.25, grav: 920 }),
        mk({ x: -8.0, y: -1.2, n: 12, seg: 6.8, w: 5.3, layer: 'back', tone: 0, launch: [-0.42, 0.91], rootLift: 0.08, decay: 1.2, grav: 900 }),
        mk({ x: -8.6, y: -4.2, n: 11, seg: 6.6, w: 4.9, layer: 'back', tone: 1, launch: [-0.5, 0.86], rootLift: 0.085, decay: 1.15, grav: 900 }),
        mk({ x: -8.0, y: -6.8, n: 10, seg: 6.3, w: 4.3, layer: 'back', tone: 0, launch: [-0.58, 0.81], rootLift: 0.09, decay: 1.1, grav: 890 }),
        mk({ x: -6.4, y: -8.6, n: 9, seg: 5.9, w: 3.6, layer: 'back', tone: 1, launch: [-0.64, 0.77], rootLift: 0.095, decay: 1.1, grav: 880 }),

        // --- Far-side crescent bang hugging close around the far forehead & tapering past the chin ---
        mk({
          x: 7.4, y: -9.4, n: 8, seg: 3.5, w: 2.15, layer: 'farBang', tone: 1, collide: false,
          launch: [0.46, 0.89], rootLift: 0.16, decay: 1.1, grav: 920, seamlessRoot: true,
        }),

        // --- Near-side layered shoulder lock behind the ear ---
        mk({
          x: -2.2, y: -9.2, n: 8, seg: 4.2, w: 2.65, layer: 'front', tone: 1, collide: false,
          launch: [-0.42, 0.91], rootLift: 0.12, decay: 1.15, grav: 920, seamlessRoot: true, eyeClearX: -2.2,
        }),

        // --- Primary iconic Sephiroth face-framing silver curtain (sweeps beside eye down to mid-chest) ---
        mk({
          x: 4.0, y: -10.6, n: 9, seg: 4.75, w: 2.6, layer: 'front', tone: 0, collide: false,
          launch: [-0.24, 0.97], rootLift: 0.15, decay: 1.1, grav: 920, seamlessRoot: true, eyeClearX: 0.65,
        }),
      ],
    };
  }

  if (style === 'sekiro') {
    // Wolf (Sekiro: Shadows Die Twice):
    // High-tied shinobi wolf-tail that arches smoothly out of the white motoyui cord and curves downward into
    // feathered wolf-tail tips, plus supple cheek-framing shinobi sidelock & subtle silver-ash brow forelock!
    return {
      style,
      locks: [
        // --- High-tied Shinobi Wolf-Tail emerging cleanly from inside the motoyui cord at (-10.2, -7.2) ---
        // Deep umber under-tail
        mk({ x: -10.1, y: -6.5, n: 6, seg: 4.0, w: 2.75, layer: 'back', tone: 2, collide: false, launch: [-0.88, 0.47], rootLift: 0.2, decay: 0.9, grav: 980 }),
        // Lower-mid full wolf-tail
        mk({ x: -10.3, y: -7.0, n: 7, seg: 4.3, w: 3.55, layer: 'back', tone: 1, collide: false, launch: [-0.97, 0.22], rootLift: 0.23, decay: 0.85, grav: 960 }),
        // Main central arched wolf-tail plume (rises slightly from cord, curves gracefully downward!)
        mk({ x: -10.5, y: -7.4, n: 8, seg: 4.4, w: 3.85, layer: 'back', tone: 0, collide: false, launch: [-0.99, -0.12], rootLift: 0.26, decay: 0.8, grav: 950 }),
        // Upper feathered wolf-tail crest
        mk({ x: -10.3, y: -7.8, n: 7, seg: 4.0, w: 2.95, layer: 'back', tone: 1, collide: false, launch: [-0.95, -0.3], rootLift: 0.27, decay: 0.82, grav: 940 }),
        // Wolf's Dragonrot silver-ash highlight lock woven into the upper crest
        mk({ x: -10.2, y: -7.6, n: 6, seg: 3.8, w: 1.8, layer: 'back', tone: 3, collide: false, launch: [-0.97, -0.22], rootLift: 0.27, decay: 0.84, grav: 940 }),

        // --- Subtle silver-dusted front brow forelock hugging the far forehead contour ---
        mk({
          x: 8.2, y: -8.2, n: 5, seg: 2.9, w: 1.55, layer: 'farBang', tone: 3, collide: false,
          launch: [0.44, 0.9], rootLift: 0.16, decay: 1.1, grav: 920, seamlessRoot: true,
        }),

        // --- Shorter layered shinobi ear-side tuft ---
        mk({
          x: -2.4, y: -7.2, n: 5, seg: 3.2, w: 1.75, layer: 'front', tone: 1, collide: false,
          launch: [-0.36, 0.93], rootLift: 0.13, decay: 1.1, grav: 920, seamlessRoot: true, eyeClearX: -2.0,
        }),

        // --- Wolf's signature tapered cheek-framing shinobi sidelock (pinned at front-temple hairline!) ---
        mk({
          x: 3.5, y: -7.8, n: 6, seg: 3.85, w: 2.1, layer: 'front', tone: 0, collide: false,
          launch: [-0.2, 0.98], rootLift: 0.14, decay: 1.1, grav: 920, seamlessRoot: true, eyeClearX: 0.55,
        }),
      ],
    };
  }

  if (style === 'guts') {
    // Guts (Gambar 3 Reference — Voluminous Obsidian Lotus Spikes + 3 White Spikes + 3 White & 2 Black Arched Hanging Bangs!):
    return {
      style,
      locks: [
        // --- 2 Long Sleek Arched OBISIDIAN-BLACK Hanging Bangs on the front-brow side (right half of Gambar 3!) ---
        mk({
          x: 9.2, y: -6.4, n: 7, seg: 2.65, w: 1.75, layer: 'farBang', tone: 1, collide: false,
          launch: [0.24, 0.97], rootLift: 0.18, decay: 1.0, grav: 930, seamlessRoot: true,
        }),
        mk({
          x: 7.8, y: -6.8, n: 8, seg: 2.85, w: 2.05, layer: 'front', tone: 0, collide: false,
          launch: [0.16, 0.98], rootLift: 0.18, decay: 1.0, grav: 930, seamlessRoot: true,
        }),

        // --- 3 Iconic Staggered Arched STARK-WHITE Hanging Ribbon Bangs (left-front of Gambar 3: short -> mid -> long!) ---
        // 1) Outer shortest white arched claw-bang
        mk({
          x: -5.4, y: -5.2, n: 6, seg: 2.05, w: 1.25, layer: 'front', tone: 3, collide: false,
          launch: [-0.14, 0.99], rootLift: 0.16, decay: 1.05, grav: 930, seamlessRoot: true, eyeClearX: -4.2,
        }),
        // 2) Middle medium white arched claw-bang
        mk({
          x: -3.1, y: -5.8, n: 7, seg: 2.3, w: 1.45, layer: 'front', tone: 3, collide: false,
          launch: [-0.1, 0.99], rootLift: 0.16, decay: 1.05, grav: 930, seamlessRoot: true, eyeClearX: -2.0,
        }),
        // 3) Inner longest white arched claw-bang sweeping down past the cheek/jaw beside his fierce eye!
        mk({
          x: -0.6, y: -6.2, n: 8, seg: 2.55, w: 1.7, layer: 'front', tone: 3, collide: false,
          launch: [-0.05, 0.99], rootLift: 0.17, decay: 1.05, grav: 930, seamlessRoot: true, eyeClearX: 0.1,
        }),
      ],
    };
  }

  if (style === 'luffy') {
    // Monkey D. Luffy (One Piece):
    // Broad, splayed, tousled curved tufts fanning organically around the head (low-slung & wide, NOT vertical saw-teeth!)
    // + Luffy's iconic messy forehead bangs & fluffy temple!
    return {
      style,
      locks: [
        // Wide, tousled rear & nape tufts fanning out around the back of Luffy's head
        mk({ x: -8.0, y: 2.4, n: 4, seg: 2.6, w: 4.4, layer: 'back', tone: 2, collide: false, launch: [-0.88, 0.47], rootLift: 0.28, decay: 0.48, grav: 480, spikyUp: true }),
        mk({ x: -8.8, y: -1.8, n: 4, seg: 2.85, w: 5.0, layer: 'back', tone: 1, collide: false, launch: [-0.98, 0.02], rootLift: 0.3, decay: 0.45, grav: 420, spikyUp: true }),
        mk({ x: -7.4, y: -5.8, n: 4, seg: 2.95, w: 5.2, layer: 'back', tone: 0, collide: false, launch: [-0.84, -0.54], rootLift: 0.32, decay: 0.44, grav: 380, spikyUp: true }),
        // Broad, low-swept tousled Oda top tufts (splayed outward rather than poking straight up!)
        mk({
          x: -3.6, y: -8.2, n: 4, seg: 2.95, w: 5.4, layer: 'front', tone: 1, collide: false,
          launch: [-0.62, -0.78], rootLift: 0.34, decay: 0.4, grav: 260, seamlessRoot: true, spikyUp: true,
        }),
        mk({
          x: 0.6, y: -8.6, n: 4, seg: 2.9, w: 5.4, layer: 'front', tone: 0, collide: false,
          launch: [0.32, -0.95], rootLift: 0.34, decay: 0.4, grav: 280, seamlessRoot: true, spikyUp: true,
        }),
        mk({
          x: 4.2, y: -7.8, n: 4, seg: 2.7, w: 4.8, layer: 'front', tone: 1, collide: false,
          launch: [0.76, -0.65], rootLift: 0.34, decay: 0.42, grav: 320, seamlessRoot: true, spikyUp: true,
        }),
        // Far-side curved forehead bang
        mk({
          x: 5.8, y: -6.6, n: 5, seg: 2.35, w: 2.5, layer: 'farBang', tone: 1, collide: false,
          launch: [0.54, 0.84], rootLift: 0.2, decay: 1.0, grav: 880, seamlessRoot: true,
        }),
        // Fluffy shaggy sideburn/temple tuft beside the ear
        mk({
          x: -2.4, y: -6.4, n: 5, seg: 2.8, w: 3.1, layer: 'front', tone: 1, collide: false,
          launch: [-0.32, 0.95], rootLift: 0.16, decay: 1.0, grav: 880, seamlessRoot: true, eyeClearX: -1.6,
        }),
        // Luffy's signature curved forehead bangs dipping playfully above/beside his eye
        mk({
          x: 1.6, y: -7.6, n: 5, seg: 2.3, w: 2.5, layer: 'front', tone: 0, collide: false,
          launch: [-0.08, 0.99], rootLift: 0.18, decay: 1.05, grav: 880, seamlessRoot: true, eyeClearX: 0.1,
        }),
        mk({
          x: 4.8, y: -7.2, n: 5, seg: 2.3, w: 2.3, layer: 'front', tone: 0, collide: false,
          launch: [0.42, 0.91], rootLift: 0.18, decay: 1.05, grav: 880, seamlessRoot: true, eyeClearX: 1.5,
        }),
      ],
    };
  }

  if (style === 'sanji') {
    // Vinsmoke Sanji (Gambar 4 Reference — Sculpted Off-Center V-Parted Warm Golden Locks, Feathered Ear/Nape Cascade,
    // Multi-Strand Diagonal Front Curtain & Crisp Open Spiral Eyebrow — ZERO Bowl-Helmet Look!):
    return {
      style,
      locks: [
        // --- Diagonal multi-layered golden fringe sweeping over the far/front side of his face (left side of Gambar 4!) ---
        mk({
          x: 5.0, y: -9.6, n: 6, seg: 3.0, w: 2.7, layer: 'farBang', tone: 2, collide: false,
          launch: [0.64, 0.77], rootLift: 0.2, decay: 0.95, grav: 900, seamlessRoot: true,
        }),
        mk({
          x: 4.4, y: -10.2, n: 7, seg: 2.95, w: 2.85, layer: 'farBang', tone: 1, collide: false,
          launch: [0.54, 0.84], rootLift: 0.2, decay: 0.95, grav: 900, seamlessRoot: true,
        }),
        mk({
          x: 3.8, y: -10.6, n: 7, seg: 2.85, w: 2.5, layer: 'farBang', tone: 0, collide: false,
          launch: [0.44, 0.9], rootLift: 0.18, decay: 0.95, grav: 910, seamlessRoot: true,
        }),

        // --- Lush cascading feathered side, ear & nape locks (right side of Gambar 4 — continuous from crown to tips!) ---
        // Rear-nape feathered locks (NO stubby ponytail!)
        mk({
          x: -9.0, y: -5.8, n: 6, seg: 3.05, w: 2.9, layer: 'front', tone: 2, collide: false,
          launch: [-0.36, 0.93], rootLift: 0.16, decay: 1.0, grav: 910, seamlessRoot: true, eyeClearX: -7.5,
        }),
        mk({
          x: -6.4, y: -8.2, n: 7, seg: 3.05, w: 3.1, layer: 'front', tone: 1, collide: false,
          launch: [-0.28, 0.96], rootLift: 0.16, decay: 1.0, grav: 910, seamlessRoot: true, eyeClearX: -5.2,
        }),
        // Mid-ear layered golden locks
        mk({
          x: -3.6, y: -9.6, n: 7, seg: 3.1, w: 3.05, layer: 'front', tone: 0, collide: false,
          launch: [-0.2, 0.98], rootLift: 0.16, decay: 1.0, grav: 910, seamlessRoot: true, eyeClearX: -2.8,
        }),
        // Inner cheek-framing lock right behind the visible eye & spiral brow (forms left wall of the inverted-V parting!)
        mk({
          x: -0.6, y: -10.4, n: 7, seg: 3.05, w: 2.65, layer: 'front', tone: 1, collide: false,
          launch: [-0.14, 0.99], rootLift: 0.16, decay: 1.0, grav: 910, seamlessRoot: true, eyeClearX: -0.5,
        }),

        // --- Frontmost diagonal golden bang skimming down from the V-parting over the nose-side brow edge! ---
        mk({
          x: 5.4, y: -9.8, n: 6, seg: 2.85, w: 2.35, layer: 'front', tone: 0, collide: false,
          launch: [0.58, 0.81], rootLift: 0.22, decay: 0.92, grav: 900, seamlessRoot: true,
        }),
      ],
    };
  }

  if (style === 'robin') {
    return {
      style,
      locks: [
        mk({
          x: -5, y: -10.5, n: 5, seg: 5.8, w: 3.3, layer: 'feather', tone: 0, collide: false,
          launch: [-0.8, -0.6], rootLift: 0.14, decay: 0.18, grav: 65,
        }),
      ],
    };
  }

  return null;
}

/**
 * One 120 Hz physics step:
 * Produces fluid, natural follow-through & overlapping S-waves ("luwes") without stiff glueiness,
 * jittery wiggle, or upside-down bang buckling.
 */
export function stepHair(k: Stick, hair: Hair) {
  if (hair.cut) { stepCutMotion(k, hair.cut); return; }
  const s = k.s;
  const head = k.p[0];
  const neck = k.p[1];
  const hip = k.p[2];
  const rSkull = (HEAD_R + 1.05) * s;
  const { u, fw } = frame(k);

  const bdx = hair.bx === undefined ? 0 : k.base.x - hair.bx;
  const bdy = hair.by === undefined ? 0 : k.base.y - hair.by;
  hair.bx = k.base.x;
  hair.by = k.base.y;

  const hdx = hair.hx === undefined ? 0 : head.x - hair.hx;
  const hdy = hair.hy === undefined ? 0 : head.y - hair.hy;
  hair.hx = head.x;
  hair.hy = head.y;

  // Coherent, whisper-gentle night air drift (shared phase so locks breathe together as one silky mane)
  const airWave = Math.sin(k.t * 1.2 + k.seed * 3.1);

  for (const L of hair.locks) {
    const P = L.p;
    const O = L.o;
    const n = P.length;
    const feather = L.layer === 'feather';
    const isBack = L.layer === 'back';
    const isFaceLock = L.layer === 'front' || L.layer === 'farBang';

    // Back mane & ponytail feel full head-lean/recoil inertia (only 55% island-foot bob carried);
    // Face-framing bangs stay anchored near the root & trail with supple grace at their tips!
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      const cx = isFaceLock ? hdx * (0.8 - 0.28 * t) : bdx * 0.55;
      const cy = isFaceLock ? hdy * (0.8 - 0.28 * t) : bdy * 0.55;
      P[i] = v(P[i].x + cx, P[i].y + cy);
      O[i] = v(O[i].x + cx, O[i].y + cy);
    }

    const rootPt = pin(k, L.x, L.y);
    const launchWorld = localDir(u, fw, L.launch[0], L.launch[1]);

    // Step 1: Free Verlet velocity with silky air retention
    const vxArr = new Float64Array(n);
    const vyArr = new Float64Array(n);
    const keep = feather ? 0.91 : isFaceLock ? 0.935 : 0.962;
    const maxStep = (isFaceLock ? 4.5 : 6.6) * s;

    for (let i = 1; i < n; i++) {
      let vx = (P[i].x - O[i].x) * keep;
      let vy = (P[i].y - O[i].y) * keep;
      const sp = Math.hypot(vx, vy);
      if (sp > maxStep) {
        vx *= maxStep / sp;
        vy *= maxStep / sp;
      }
      vxArr[i] = vx;
      vyArr[i] = vy;
    }

    // Step 2: Internal parent-child shear damping (smooths jitter into a single graceful whip-wave)
    vxArr[0] = rootPt.x - P[0].x;
    vyArr[0] = rootPt.y - P[0].y;
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      const shear = feather ? 0.16 : (isFaceLock ? 0.18 : 0.14) * (1 - 0.55 * t);
      vxArr[i] += (vxArr[i - 1] - vxArr[i]) * shear;
      vyArr[i] += (vyArr[i - 1] - vyArr[i]) * shear;
    }

    // Step 3: Integrate gravity, subtle coherent air drift, and root-only follicle arch lift
    P[0] = rootPt;
    O[0] = rootPt;

    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      O[i] = { ...P[i] };

      const breeze = feather
        ? (-k.face * 45 + airWave * 18) * H * H
        : (-k.face * (isBack ? 26 : 10) + Math.sin(k.t * 1.2 - t * 1.05 + k.seed * 3.1) * (isBack ? 14 : 7) * t) * H * H;

      let nx = P[i].x + vxArr[i] + breeze;
      let ny = P[i].y + vyArr[i] + L.grav * H * H;

      const lift = L.rootLift * Math.exp(-(i - 1) * L.decay);
      if (lift > 0.003) {
        const idealX = P[i - 1].x + launchWorld.x * L.seg * s;
        const idealY = P[i - 1].y + launchWorld.y * L.seg * s;
        nx += (idealX - nx) * lift;
        ny += (idealY - ny) * lift;
      }

      P[i] = v(nx, ny);
    }

    // Step 4: Soft elastic curve continuity
    if (!feather) {
      for (let i = 2; i < n; i++) {
        const t = i / (n - 1);
        const bend = 0.04 * (1 - 0.45 * t);
        const ex = 2 * P[i - 1].x - P[i - 2].x;
        const ey = 2 * P[i - 1].y - P[i - 2].y;
        P[i] = v(P[i].x + (ex - P[i].x) * bend, P[i].y + (ey - P[i].y) * bend);
      }
    }

    // Step 5: Distance constraints + skull/shoulder drape + anti-buckling downward bang flow
    const shX = neck.x - k.face * 2.4 * s;
    const shY = neck.y + 3.2 * s;
    const rShoulder = 5.5 * s;
    const midBack = v((neck.x + hip.x) * 0.5 - k.face * 2.0 * s, (neck.y + hip.y) * 0.5);
    const rBack = 4.9 * s;

    for (let it = 0; it < 4; it++) {
      P[0] = rootPt;
      for (let i = 1; i < n; i++) {
        const dx = P[i].x - P[i - 1].x;
        const dy = P[i].y - P[i - 1].y;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - L.seg * s) / d;
        if (i === 1) {
          P[i] = v(P[i].x - dx * diff, P[i].y - dy * diff);
        } else {
          P[i - 1] = v(P[i - 1].x + dx * diff * 0.2, P[i - 1].y + dy * diff * 0.2);
          P[i] = v(P[i].x - dx * diff * 0.8, P[i].y - dy * diff * 0.8);
        }

        let q = P[i];

        // Prevent downward-draping face bangs & sidelocks from flying sideways or buckling upside-down on violent recoil:
        // they sway smoothly (~25–35°) while maintaining their iconic anime silhouette!
        const inFlip = !!(k.victory && k.victory > 0.24 && k.victory < 1.02 && (k.victoryStyle ?? 0) % 3 === 0);
        if (isFaceLock && !L.spikyUp && !inFlip && k.alive) {
          const minDrop = L.seg * s * (i === 1 ? 0.58 : 0.76);
          if (q.y < P[i - 1].y + minDrop) {
            const targetY = P[i - 1].y + minDrop;
            const rem = Math.sqrt(Math.max(0, (L.seg * s) ** 2 - minDrop * minDrop));
            const dirX = q.x >= P[i - 1].x ? 1 : -1;
            const clampedDx = Math.min(Math.abs(q.x - P[i - 1].x), rem);
            q = v(P[i - 1].x + dirX * clampedDx, targetY);
          }
        }

        // Skull & slender shoulder/back drape clearance for long back locks
        if (L.collide && i >= 2) {
          const hx = q.x - head.x;
          const hy = q.y - head.y;
          const hd = Math.hypot(hx, hy) || 1;
          if (hd < rSkull) q = v(head.x + (hx / hd) * rSkull, head.y + (hy / hd) * rSkull);

          if (isBack && k.alive) {
            const sx = q.x - shX;
            const sy = q.y - shY;
            const sd = Math.hypot(sx, sy) || 1;
            if (sd < rShoulder) q = v(shX + (sx / sd) * rShoulder, shY + (sy / sd) * rShoulder);

            const bx = q.x - midBack.x;
            const by = q.y - midBack.y;
            const bd = Math.hypot(bx, by) || 1;
            if (bd < rBack) q = v(midBack.x + (bx / bd) * rBack, midBack.y + (by / bd) * rBack);
          }
        }

        // Keep back locks behind the face/throat line
        if (isBack) {
          const lx = ((q.x - head.x) * fw.x + (q.y - head.y) * fw.y) / s;
          const ly = -((q.x - head.x) * u.x + (q.y - head.y) * u.y) / s;
          if (lx > -3.6 && ly < 17) {
            const push = (-3.6 - lx) * s * 0.65;
            q = v(q.x + fw.x * push, q.y + fw.y * push);
          }
        }

        // Keep near-side bangs framing the cheek cleanly without covering the glowing white eye!
        if (L.eyeClearX !== undefined && i >= 1) {
          const lx = ((q.x - head.x) * fw.x + (q.y - head.y) * fw.y) / s;
          const ly = -((q.x - head.x) * u.x + (q.y - head.y) * u.y) / s;
          if (ly > -6.0 && ly < 5.5 && lx > L.eyeClearX) {
            const push = (L.eyeClearX - lx) * s * 0.72;
            q = v(q.x + fw.x * push, q.y + fw.y * push);
          }
        }

        // Keep far-side bang hugging close along the front forehead/cheek contour (`lx` between 9.8 and 13.4)
        if (L.layer === 'farBang' && i >= 1 && i <= 4) {
          const lx = ((q.x - head.x) * fw.x + (q.y - head.y) * fw.y) / s;
          const ly = -((q.x - head.x) * u.x + (q.y - head.y) * u.y) / s;
          if (ly > -9.0 && ly < 5.0) {
            if (lx < 9.8) {
              const push = (9.8 - lx) * s * 0.6;
              q = v(q.x + fw.x * push, q.y + fw.y * push);
            } else if (lx > 13.2) {
              const push = (13.2 - lx) * s * 0.65;
              q = v(q.x + fw.x * push, q.y + fw.y * push);
            }
          }
        }

        P[i] = q;
      }
    }
  }

  // Step 6: Cohesive silk coupling between neighbouring `back` locks so they wave & fan together in harmony!
  const backLocks = hair.locks.filter((l) => l.layer === 'back');
  for (let kIdx = 0; kIdx < backLocks.length - 1; kIdx++) {
    const A = backLocks[kIdx].p;
    const B = backLocks[kIdx + 1].p;
    const len = Math.min(A.length, B.length);
    for (let i = 3; i < len; i++) {
      const vaX = A[i].x - backLocks[kIdx].o[i].x;
      const vaY = A[i].y - backLocks[kIdx].o[i].y;
      const vbX = B[i].x - backLocks[kIdx + 1].o[i].x;
      const vbY = B[i].y - backLocks[kIdx + 1].o[i].y;
      const avgVx = (vaX + vbX) * 0.5;
      const avgVy = (vaY + vbY) * 0.5;
      backLocks[kIdx].o[i].x = A[i].x - (vaX + (avgVx - vaX) * 0.1);
      backLocks[kIdx].o[i].y = A[i].y - (vaY + (avgVy - vaY) * 0.1);
      backLocks[kIdx + 1].o[i].x = B[i].x - (vbX + (avgVx - vbX) * 0.1);
      backLocks[kIdx + 1].o[i].y = B[i].y - (vbY + (avgVy - vbY) * 0.1);
    }
  }
}

/* ------------------------------------------------ painting ------------------------------------------------ */

interface Palette {
  tone: string[];
  deep: string;
  edge: string;
  shine: string;
}

const SILVER: Palette = {
  tone: ['#fcfdff', '#eef3fb', '#dde5f2'],
  deep: '#a6b6ce',
  edge: '#647590',
  shine: '#ffffff',
};

const SEKIRO_PAL: Palette = {
  tone: ['#6e5849', '#5a463a', '#46362c', '#e6ebf2'],
  deep: '#2b1f18',
  edge: '#19110c',
  shine: '#a68d7b',
};

const GUTS_PAL: Palette = {
  // Deep obsidian-charcoal 3D shading + stark pure-white/silver Berserker locks (exact Gambar 3 palette!)
  tone: ['#232730', '#181b22', '#101217', '#ffffff'],
  deep: '#07080b',
  edge: '#2e3440',
  shine: '#3d4554',
};

const LUFFY_PAL: Palette = {
  tone: ['#26303f', '#1a222e', '#111720'],
  deep: '#090c12',
  edge: '#04060a',
  shine: '#5c7596',
};

const SANJI_PAL: Palette = {
  // Rich warm matte-sunflower gold (exact Gambar 4 3D bust palette — NO pale neon helmet glare!)
  tone: ['#fad328', '#ebb610', '#d49a08'],
  deep: '#a36f02',
  edge: '#6e4700',
  shine: '#ffe975',
};

/** Computes left (`A`) and right (`B`) offset rails for a tapered hair ribbon ending in a sharp tip `P[n - 1]` */
function ribbonRails(P: V[], wide: (t: number) => number) {
  const n = P.length;
  const A: V[] = [];
  const B: V[] = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const t = i / (n - 1);
    const hw = i === n - 1 ? 0 : wide(t);
    A.push(v(P[i].x - (dy / l) * hw, P[i].y + (dx / l) * hw));
    B.push(v(P[i].x + (dy / l) * hw, P[i].y - (dx / l) * hw));
  }
  return { A, B };
}

/** Traces a sleek tapered hair lock along points `P` with rounded hidden root cap & razor-sharp pointed tip */
function ribbon(ctx: Ctx, P: V[], wide: (t: number) => number) {
  const n = P.length;
  if (n < 2) return;
  const { A, B } = ribbonRails(P, wide);
  const d0x = P[1].x - P[0].x;
  const d0y = P[1].y - P[0].y;
  const d0l = Math.hypot(d0x, d0y) || 1;
  const w0 = wide(0);
  const capPt = v(P[0].x - (d0x / d0l) * w0 * 0.75, P[0].y - (d0y / d0l) * w0 * 0.75);

  ctx.beginPath();
  ctx.moveTo(A[0].x, A[0].y);
  for (let i = 1; i < n - 1; i++) {
    ctx.quadraticCurveTo(A[i].x, A[i].y, (A[i].x + A[i + 1].x) / 2, (A[i].y + A[i + 1].y) / 2);
  }
  ctx.lineTo(P[n - 1].x, P[n - 1].y);
  for (let i = n - 2; i >= 1; i--) {
    ctx.quadraticCurveTo(B[i].x, B[i].y, (B[i].x + B[i - 1].x) / 2, (B[i].y + B[i - 1].y) / 2);
  }
  ctx.lineTo(B[0].x, B[0].y);
  ctx.quadraticCurveTo(capPt.x, capPt.y, A[0].x, A[0].y);
  ctx.closePath();
}

/** smooth centerline down a chain for specular hair sheen */
function strand(ctx: Ctx, P: V[], fromIdx: number, lastIdx: number) {
  if (lastIdx <= fromIdx) return;
  ctx.beginPath();
  ctx.moveTo(P[fromIdx].x, P[fromIdx].y);
  for (let i = fromIdx + 1; i < lastIdx; i++) {
    ctx.quadraticCurveTo(P[i].x, P[i].y, (P[i].x + P[i + 1].x) / 2, (P[i].y + P[i + 1].y) / 2);
  }
  ctx.lineTo(P[lastIdx].x, P[lastIdx].y);
}

/** Paints a layer of simulated Verlet locks — supports both lush back curtains and seamless root-blended front bangs */
function drawLocks(ctx: Ctx, hair: Hair, layer: Layer, pal: Palette, s: number) {
  const base = ctx.globalAlpha;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const widthOf = (L: Lock, t: number, grow: number) => {
    const w = L.w * s + grow;
    if (L.seamlessRoot) {
      const body = 0.64 + 0.36 * Math.sin(Math.min(1, t * 1.5) * (Math.PI / 2));
      return w * body * (1 - Math.pow(t, 1.72));
    }
    const rootEase = 0.76 + 0.24 * Math.min(1, t * 3.8);
    const tipTaper = 1 - Math.pow(t, 2.15);
    return w * rootEase * tipTaper;
  };

  // Pass 1: Unified outer silhouette keyline for `back` locks
  ctx.fillStyle = pal.edge;
  for (const L of hair.locks) {
    if (L.layer !== layer || L.seamlessRoot) continue;
    ribbon(ctx, L.p, (t) => widthOf(L, t, 0.85 * s));
    ctx.fill();
  }

  // Pass 2: Individual shaded silk locks + specular highlights
  for (const L of hair.locks) {
    if (L.layer !== layer) continue;
    const P = L.p;
    const n = P.length;
    const isStreak = L.tone === 3;

    ribbon(ctx, P, (t) => widthOf(L, t, 0));
    const g = ctx.createLinearGradient(P[0].x, P[0].y, P[n - 1].x, P[n - 1].y);
    if (isStreak) {
      g.addColorStop(0, '#f4f7fc');
      g.addColorStop(0.55, '#c4ccd9');
      g.addColorStop(1, '#8892a1');
    } else {
      g.addColorStop(0, pal.tone[L.tone % 3]);
      g.addColorStop(0.62, pal.tone[(L.tone + 1) % 3]);
      g.addColorStop(1, pal.deep);
    }
    ctx.fillStyle = g;
    ctx.fill();

    if (L.seamlessRoot) {
      // Stroke ONLY from segment 2 to tip with soft strand-valley alpha so overlapping locks never form harsh X-lines!
      const { A, B } = ribbonRails(P, (t) => widthOf(L, t, 0));
      const start = Math.min(2, n - 2);
      ctx.globalAlpha = base * (hair.style === 'sanji' ? 0.45 : 0.78);
      ctx.strokeStyle = isStreak ? '#525c6b' : pal.edge;
      ctx.lineWidth = (hair.style === 'sanji' ? 0.58 : 0.68) * s;
      ctx.beginPath();
      ctx.moveTo(A[start].x, A[start].y);
      for (let i = start + 1; i < n - 1; i++) {
        ctx.quadraticCurveTo(A[i].x, A[i].y, (A[i].x + A[i + 1].x) / 2, (A[i].y + A[i + 1].y) / 2);
      }
      ctx.lineTo(P[n - 1].x, P[n - 1].y);
      for (let i = n - 2; i >= start + 1; i--) {
        ctx.quadraticCurveTo(B[i].x, B[i].y, (B[i].x + B[i - 1].x) / 2, (B[i].y + B[i - 1].y) / 2);
      }
      ctx.stroke();
    } else {
      ctx.globalAlpha = base * 0.22;
      ctx.strokeStyle = pal.edge;
      ctx.lineWidth = 0.5 * s;
      ctx.stroke();
    }

    // Silky centerline highlight
    strand(ctx, P, 1, Math.max(2, n - 2));
    ctx.globalAlpha = base * (isStreak ? 0.92 : hair.style === 'sanji' ? 0.32 : 0.76);
    ctx.strokeStyle = isStreak ? '#ffffff' : pal.shine;
    ctx.lineWidth = Math.max(0.45, L.w * s * (hair.style === 'sanji' ? 0.13 : 0.17));
    ctx.stroke();
    ctx.globalAlpha = base;
  }
}

/** runs `draw` in the head's own frame: origin at the skull's centre, x toward the face, y toward the neck */
function local(ctx: Ctx, k: Stick, draw: () => void) {
  const { u, fw } = frame(k);
  const s = k.s;
  ctx.save();
  ctx.transform(fw.x * s, fw.y * s, -u.x * s, -u.y * s, k.p[0].x, k.p[0].y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw();
  ctx.restore();
}

const curves = (ctx: Ctx, list: number[][]) => {
  for (const [x0, y0, cx, cy, x1, y1] of list) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();
  }
};

/** the part of a skin that hangs behind the body: call this before the stickman himself is drawn */
export function drawHeadBack(ctx: Ctx, k: Stick, style: HeadStyle, hair: Hair | null | undefined) {
  if (isRefinedHair(style)) { drawRefinedHair(ctx, k, style, hair?.cut, k.t, 'back'); return; }
  if (!hair) return;
  const pal =
    style === 'sephiroth' ? SILVER
    : style === 'sekiro' ? SEKIRO_PAL
    : style === 'guts' ? GUTS_PAL
    : style === 'luffy' ? LUFFY_PAL
    : style === 'sanji' ? SANJI_PAL
    : null;
  if (!pal) return;
  drawLocks(ctx, hair, 'back', pal, k.s);
  drawLocks(ctx, hair, 'farBang', pal, k.s);
}

/** the rest of the skin, over the stickman that has just been drawn */
export function drawHead(ctx: Ctx, k: Stick, style: HeadStyle, hair: Hair | null | undefined, t: number) {
  if (style === 'band') return;
  if (isRefinedHair(style)) { drawRefinedHair(ctx, k, style, hair?.cut, t, 'front'); return; }
  ctx.save();

  if (style === 'sephiroth') {
    // ============ SEPHIROTH: FLOWING PLATINUM MANE & SUPPLE PHYSICS TWIN BANGS ============
    local(ctx, k, () => {
      // Sculpted crown & nape silver hair cap with graceful M-parting peak
      ctx.beginPath();
      ctx.moveTo(9.4, -7.8);
      ctx.bezierCurveTo(7.4, -13.9, -1.2, -14.5, -8.4, -11.6);
      ctx.bezierCurveTo(-13.8, -8.8, -14.4, -0.4, -11.6, 6.8);
      ctx.quadraticCurveTo(-9.0, 11.0, -4.2, 11.0);
      ctx.bezierCurveTo(-2.4, 5.2, -2.2, -2.2, 2.8, -6.4);
      ctx.quadraticCurveTo(6.2, -8.6, 9.4, -7.8);
      ctx.closePath();

      const cg = ctx.createLinearGradient(0, -14, -4, 11);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.45, '#edf2fb');
      cg.addColorStop(1, '#b8c5da');
      ctx.fillStyle = cg;
      ctx.fill();

      ctx.strokeStyle = SILVER.edge;
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(9.4, -7.8);
      ctx.bezierCurveTo(7.4, -13.9, -1.2, -14.5, -8.4, -11.6);
      ctx.bezierCurveTo(-13.8, -8.8, -14.4, -0.4, -11.6, 6.8);
      ctx.stroke();
    });

    // Live physics-driven near-side shoulder lock & iconic long face-framing bang!
    if (hair) drawLocks(ctx, hair, 'front', SILVER, k.s);

    // Crown parting strand lines & luminous angel-halo sheen drawn over the root junction so it's 100% seamless
    local(ctx, k, () => {
      ctx.strokeStyle = 'rgba(106, 122, 148, 0.5)';
      ctx.lineWidth = 0.72;
      curves(ctx, [
        [4.8, -11.8, -4.5, -12.2, -11.5, -1.4],
        [1.4, -10.2, -5.4, -7.8, -10.2, 5.2],
      ]);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.lineWidth = 1.65;
      ctx.beginPath();
      ctx.moveTo(-8.8, -6.8);
      ctx.quadraticCurveTo(-2.2, -11.9, 5.0, -10.4);
      ctx.stroke();
    });
  } else if (style === 'sekiro') {
    // ============ SEKIRO (ONE-ARMED WOLF): RUGGED SHINOBI TOPKNOT, DRAGONROT MARK & SUPPLE LOCKS ============
    local(ctx, k, () => {
      // 1. Tousled, swept-back Shinobi skull hair with feathered crown ridges & cropped nape undercut tufts
      ctx.beginPath();
      ctx.moveTo(9.4, -7.4); // Front hairline above brow
      ctx.bezierCurveTo(6.6, -13.1, -0.8, -13.9, -6.2, -12.2);
      // Subtle feathered shinobi crown ridge leading into the knot
      ctx.lineTo(-5.2, -13.2);
      ctx.quadraticCurveTo(-8.8, -12.0, -11.0, -8.6);
      // Gathered nape sweep & rugged cropped undercut tufts below the knot
      ctx.quadraticCurveTo(-13.2, -4.8, -12.6, 0.2);
      ctx.lineTo(-14.0, 2.0); // Upper nape shinobi tuft
      ctx.lineTo(-11.8, 3.4);
      ctx.lineTo(-12.8, 6.2); // Lower nape shinobi tuft
      ctx.quadraticCurveTo(-9.4, 8.9, -5.2, 9.0);
      // Clean inner temple/ear hairline so the face & cheek sidelock stand out crisply
      ctx.bezierCurveTo(-4.0, 4.2, -3.2, -2.0, 2.2, -5.8);
      ctx.quadraticCurveTo(6.0, -8.2, 9.4, -7.4);
      ctx.closePath();

      const sg = ctx.createLinearGradient(2, -13.5, -7, 9);
      sg.addColorStop(0, '#786050');
      sg.addColorStop(0.5, '#544236');
      sg.addColorStop(1, '#2f231b');
      ctx.fillStyle = sg;
      ctx.fill();
      ctx.strokeStyle = '#19110c';
      ctx.lineWidth = 0.95;
      ctx.stroke();

      // 2. Wolf's organic feathered Silver-Ash Dragonrot hair patch on the right brow & temple
      ctx.fillStyle = '#dfe5ee';
      ctx.beginPath();
      ctx.moveTo(8.9, -7.6);
      ctx.quadraticCurveTo(4.0, -11.5, -4.2, -10.6);
      ctx.quadraticCurveTo(2.0, -8.9, 6.0, -6.8);
      ctx.closePath();
      ctx.fill();

      const wg = ctx.createLinearGradient(8.5, -8.0, -7.0, -9.0);
      wg.addColorStop(0, '#f7f9fc');
      wg.addColorStop(0.55, '#c5cdd9');
      wg.addColorStop(1, 'rgba(140, 148, 160, 0)');
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.moveTo(9.1, -7.4);
      ctx.quadraticCurveTo(3.2, -12.2, -7.2, -9.4);
      ctx.quadraticCurveTo(0.6, -8.4, 5.2, -6.5);
      ctx.closePath();
      ctx.fill();

      // Crisp spiky asymmetric shinobi brow wisps dipping slightly above the eye (never blocking the eye!)
      ctx.fillStyle = '#5c483b';
      ctx.strokeStyle = '#19110c';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(4.6, -7.2);
      ctx.quadraticCurveTo(5.8, -5.2, 5.2, -3.5);
      ctx.quadraticCurveTo(6.6, -5.2, 6.8, -6.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // 3. Live physics-driven near-side shinobi cheek sidelock & ear-side tuft!
    if (hair) drawLocks(ctx, hair, 'front', SEKIRO_PAL, k.s);

    // 4. Taut combed shinobi strand lines & wrapped white hemp cloth band (`motoyui`) cinching the wolf-tail!
    local(ctx, k, () => {
      ctx.strokeStyle = 'rgba(25, 17, 12, 0.62)';
      ctx.lineWidth = 0.78;
      curves(ctx, [
        [5.6, -10.5, -2.4, -12.4, -9.8, -8.0],
        [1.8, -7.0, -4.6, -7.8, -10.0, -6.8],
        [-4.5, 5.6, -8.8, 1.0, -10.2, -5.8],
      ]);

      // Subtle warm highlight sheen on crown
      ctx.strokeStyle = 'rgba(198, 174, 156, 0.45)';
      ctx.lineWidth = 1.05;
      curves(ctx, [[3.2, -11.0, -2.8, -11.8, -8.2, -8.8]]);

      // Sleek wrapped off-white shinobi cloth band (`motoyui`) at (-10.2, -7.2)
      ctx.save();
      ctx.translate(-10.2, -7.2);
      ctx.rotate(0.22);

      // Loose cloth knot end tucked underneath
      ctx.fillStyle = '#d8ceba';
      ctx.strokeStyle = '#19110c';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(-0.7, 2.6);
      ctx.lineTo(-2.2, 5.5);
      ctx.lineTo(0.5, 4.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Main taut cloth wrap sleeve
      const bg = ctx.createLinearGradient(0, -3.0, 0, 3.0);
      bg.addColorStop(0, '#faf6ec');
      bg.addColorStop(0.55, '#ebe2d1');
      bg.addColorStop(1, '#d4cab6');
      ctx.fillStyle = bg;
      ctx.strokeStyle = '#19110c';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-1.85, -2.5);
      ctx.quadraticCurveTo(0, -3.1, 1.85, -2.5);
      ctx.lineTo(1.75, 2.5);
      ctx.quadraticCurveTo(0, 3.1, -1.75, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Diagonal cloth wrap crease lines
      ctx.strokeStyle = 'rgba(55, 42, 30, 0.55)';
      ctx.lineWidth = 0.68;
      ctx.beginPath();
      ctx.moveTo(-1.7, -0.7);
      ctx.lineTo(1.7, -1.1);
      ctx.moveTo(-1.65, 1.0);
      ctx.lineTo(1.65, 0.6);
      ctx.stroke();
      ctx.restore();
    });
  } else if (style === 'guts') {
    // ============ GUTS (GAMBAR 3 REFERENCE): VOLUMINOUS OBSIDIAN LOTUS SPIKES, 3 WHITE SPIKES & ARCHED HANGING BANGS ============
    const lag = clamp((k.p[0].x - k.o[0].x) * k.face * 0.25, -1.6, 1.6);
    local(ctx, k, () => {
      const spike = (
        x0: number, y0: number,
        cx1: number, cy1: number,
        tx: number, ty: number,
        cx2: number, cy2: number,
        x1: number, y1: number,
        topCol: string, botCol: string, edgeCol: string,
      ) => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx1, cy1, tx, ty);
        ctx.quadraticCurveTo(cx2, cy2, x1, y1);
        ctx.closePath();
        const g = ctx.createLinearGradient(tx, ty, (x0 + x1) * 0.5, (y0 + y1) * 0.5);
        g.addColorStop(0, topCol);
        g.addColorStop(1, botCol);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = edgeCol;
        ctx.lineWidth = 0.65;
        ctx.stroke();
      };

      // 1. Voluminous Multi-Tiered Obsidian-Black Outer Crown & Flared Jagged Skirt (exact silhouette of Gambar 3!)
      ctx.beginPath();
      ctx.moveTo(10.0, -7.2);
      ctx.lineTo(13.0 - lag * 0.3, -10.4);
      ctx.lineTo(9.4, -11.6);
      ctx.lineTo(10.8 - lag * 0.4, -15.0);
      ctx.lineTo(5.8, -14.0);
      ctx.lineTo(4.4 - lag * 0.45, -17.4);
      ctx.lineTo(-0.2, -15.2);
      ctx.lineTo(-3.4 - lag * 0.5, -18.0);
      ctx.lineTo(-7.0, -15.0);
      ctx.lineTo(-11.2 - lag * 0.45, -16.6);
      ctx.lineTo(-11.4, -12.2);
      ctx.lineTo(-15.2 - lag * 0.35, -12.4);
      ctx.lineTo(-13.2, -8.0);
      ctx.lineTo(-16.2 - lag * 0.25, -6.6);
      ctx.lineTo(-13.4, -3.0);
      ctx.lineTo(-15.4, -0.2);
      ctx.lineTo(-12.8, 2.8);
      ctx.lineTo(-14.2, 6.4); // Flared lower-back jagged skirt corner like Gambar 3!
      ctx.lineTo(-9.8, 7.6);
      ctx.lineTo(-8.4, 10.4);
      ctx.lineTo(-5.0, 7.8);
      ctx.bezierCurveTo(-3.6, 2.4, -2.0, -3.6, 3.0, -6.4);
      ctx.quadraticCurveTo(6.6, -8.0, 10.0, -7.2);
      ctx.closePath();

      const bg = ctx.createLinearGradient(0, -18, -4, 10);
      bg.addColorStop(0, '#242933');
      bg.addColorStop(0.55, '#12151c');
      bg.addColorStop(1, '#07080b');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = '#030406';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      // 2. Sculpted 3D Inner Obsidian Lotus Petals/Spikes fanning across the crown (gives rich 3D depth like Gambar 3!)
      spike(-12.6, -1.2, -13.6, -6.6, -14.6 - lag * 0.3, -10.2, -9.6, -8.0, -6.4, -3.2, '#2d3340', '#0b0d12', '#050608');
      spike(-10.0, -5.0, -11.2, -10.6, -10.2 - lag * 0.4, -15.2, -5.6, -11.4, -3.4, -5.6, '#323947', '#0c0f15', '#050608');
      spike(-5.6, -6.2, -6.0, -12.4, -3.0 - lag * 0.45, -17.0, 0.4, -12.2, 1.0, -6.0, '#363e4d', '#0d1016', '#050608');
      spike(0.4, -6.4, 2.0, -12.2, 5.0 - lag * 0.4, -16.4, 7.0, -11.6, 6.0, -6.0, '#333b4a', '#0c0f15', '#050608');
      spike(4.6, -6.0, 7.8, -10.6, 11.2 - lag * 0.3, -13.4, 10.4, -9.0, 7.6, -5.6, '#2d3342', '#0b0d12', '#050608');

      // 3. DRAMATIC 3-SPIKE STARK-WHITE / SILVER CLUSTER (exact match to the swept-up white fan on the left of Gambar 3!)
      spike(-9.8, -1.6, -12.4, -5.6, -13.8 - lag * 0.25, -8.4, -8.8, -6.8, -4.6, -3.2, '#f0f4fa', '#99a4b4', '#414955');
      spike(-7.8, -3.0, -10.4, -8.4, -11.4 - lag * 0.35, -12.6, -5.8, -9.4, -2.2, -4.2, '#f8fbff', '#aeb8c7', '#47505e');
      spike(-5.4, -4.4, -7.6, -11.0, -7.8 - lag * 0.45, -15.8, -2.0, -11.4, 0.8, -5.2, '#ffffff', '#c4cedb', '#4e5866');

      // 4. Overlapping Front-Center Obsidian Spikes interlocking over the inner base of the white cluster (exact Gambar 3 layering!)
      spike(-2.0, -5.0, -2.6, -10.2, -4.2 - lag * 0.35, -13.4, 1.4, -10.0, 3.8, -5.6, '#292f3c', '#090b0f', '#040507');
      spike(2.0, -5.6, 4.0, -9.8, 7.0 - lag * 0.3, -12.4, 7.8, -8.6, 6.0, -5.4, '#2e3543', '#0a0c10', '#040507');
    });

    // 5. Shaded silver-grey under-wedge beneath the white spikes so the 3 bright white arched bangs pop in 3D (like Gambar 3!)
    local(ctx, k, () => {
      ctx.fillStyle = '#9aa5b5';
      ctx.beginPath();
      ctx.moveTo(-7.2, -4.2);
      ctx.lineTo(-0.2, -6.8);
      ctx.lineTo(0.8, -3.6);
      ctx.lineTo(-6.2, -1.8);
      ctx.closePath();
      ctx.fill();
    });

    // 6. Live Supple Physics Arched White & Black Hanging Ribbon Bangs!
    if (hair) drawLocks(ctx, hair, 'front', GUTS_PAL, k.s);

    // 7. Seamless 3D Ribbon Root Arches (pure shaded fill, NO dark cap lines!) so the white & dark bangs curve smoothly like Gambar 3!
    local(ctx, k, () => {
      for (const [rx, ry, rw, rh] of [[-5.4, -5.2, 1.05, 1.9], [-3.1, -5.8, 1.2, 2.2], [-0.6, -6.2, 1.38, 2.5]] as [number, number, number, number][]) {
        const wg = ctx.createLinearGradient(rx, ry - rh, rx, ry + 1.4);
        wg.addColorStop(0, '#dbe2ee');
        wg.addColorStop(0.45, '#ffffff');
        wg.addColorStop(1, '#f4f7fc');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.moveTo(rx - rw, ry + 1.2);
        ctx.bezierCurveTo(rx - rw - 0.35, ry - rh, rx + rw * 0.85, ry - rh, rx + rw, ry + 1.2);
        ctx.closePath();
        ctx.fill();
      }

      for (const [rx, ry, rw, rh] of [[7.8, -6.8, 1.5, 2.4], [9.2, -6.4, 1.2, 1.9]] as [number, number, number, number][]) {
        const dg = ctx.createLinearGradient(rx, ry - rh, rx, ry + 1.6);
        dg.addColorStop(0, '#363e4d');
        dg.addColorStop(1, '#232730');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.moveTo(rx - rw, ry + 1.4);
        ctx.bezierCurveTo(rx - rw, ry - rh, rx + rw + 0.3, ry - rh, rx + rw, ry + 1.4);
        ctx.closePath();
        ctx.fill();
      }
    });
  } else if (style === 'luffy') {
    // ============ MONKEY D. LUFFY (ONE PIECE): FULL ROUNDED FLUFFY MOP-TOP & ICONIC UNDER-EYE SCAR ============
    local(ctx, k, () => {
      // 1. Lush, rounded, Oda-style messy black hair silhouette with broad curved tufts all round
      ctx.beginPath();
      ctx.moveTo(9.4, -7.8);
      ctx.bezierCurveTo(7.2, -13.2, 2.2, -14.8, -2.8, -14.2);
      ctx.lineTo(-4.8, -15.8); // Broad top-back Oda tuft
      ctx.quadraticCurveTo(-7.6, -14.2, -9.0, -12.4);
      ctx.lineTo(-12.2, -13.2); // Upper-back wide curved tuft
      ctx.quadraticCurveTo(-12.0, -9.8, -11.6, -8.0);
      ctx.lineTo(-14.2, -7.2); // Mid-back fluffy curved tuft
      ctx.quadraticCurveTo(-13.0, -3.8, -12.2, -2.0);
      ctx.lineTo(-14.0, 0.8); // Lower-back shaggy tuft
      ctx.quadraticCurveTo(-12.2, 3.8, -11.0, 5.2);
      ctx.lineTo(-12.2, 7.8); // Nape shaggy curl
      ctx.quadraticCurveTo(-8.8, 9.2, -5.0, 8.8);
      // Clean shaggy hairline around ear & forehead
      ctx.bezierCurveTo(-3.6, 4.4, -3.0, -2.0, 2.2, -5.8);
      ctx.quadraticCurveTo(5.8, -8.2, 9.4, -7.8);
      ctx.closePath();

      const lg = ctx.createLinearGradient(1, -14.5, -5, 9);
      lg.addColorStop(0, '#2a3546');
      lg.addColorStop(0.5, '#171f2b');
      lg.addColorStop(1, '#0a0e14');
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.strokeStyle = '#04060a';
      ctx.lineWidth = 0.95;
      ctx.stroke();

      // Luffy's iconic curved 2-stitch scar right beneath his eye!
      ctx.strokeStyle = '#eb9e8f';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(2.2, 3.1);
      ctx.quadraticCurveTo(4.6, 4.2, 7.0, 3.1);
      ctx.stroke();
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(3.5, 2.4);
      ctx.lineTo(3.3, 4.4);
      ctx.moveTo(5.6, 2.5);
      ctx.lineTo(5.8, 4.4);
      ctx.stroke();
    });

    // 2. Live bouncy Verlet forehead M-bangs, fluffy sideburn tuft, and wide crown cowlicks!
    if (hair) drawLocks(ctx, hair, 'front', LUFFY_PAL, k.s);

    // 3. Crisp anime highlight sheen tying the bouncy tufts into one cohesive messy mop-top!
    local(ctx, k, () => {
      ctx.strokeStyle = 'rgba(128, 156, 194, 0.5)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(-8.6, -6.8);
      ctx.quadraticCurveTo(-2.4, -11.6, 4.8, -9.8);
      ctx.stroke();
    });
  } else if (style === 'sanji') {
    // ============ VINSMOKE SANJI (GAMBAR 4 REFERENCE): V-PARTED SCULPTED GOLDEN STRANDS & CRISP OPEN SPIRAL BROW ============
    local(ctx, k, () => {
      // 1. Sculpted, Parted Warm-Gold Crown & Feathered Side-Back Cascade (NO round helmet dome, NO rear tail lump!)
      // Notice the natural V-parting notch at (3.6, -13.4) dividing the front fringe lobe and the lush side/back lobe,
      // plus outward-flicked feathered tips along the back/nape just like the 3D bust in Gambar 4!
      ctx.beginPath();
      // Start at the inverted-V forehead parting apex above the eye!
      ctx.moveTo(3.6, -8.8);
      // Right/Front lobe sweeping forward over the far brow
      ctx.quadraticCurveTo(7.4, -7.6, 10.6, -5.8);
      ctx.bezierCurveTo(10.4, -11.4, 7.6, -14.2, 3.8, -13.6); // Front crown lobe into V-parting dip!
      // Left/Side-Back voluminous crown lobe with feathered outer tips (exact right silhouette of Gambar 4!)
      ctx.bezierCurveTo(0.2, -15.2, -6.8, -15.0, -11.4, -11.2);
      ctx.lineTo(-13.2, -11.0); // Small upper-back feathered tip (like top-right of Gambar 4!)
      ctx.quadraticCurveTo(-12.6, -9.4, -12.8, -7.8);
      ctx.quadraticCurveTo(-14.4, -4.4, -14.8, -1.4);
      ctx.lineTo(-15.8, -0.4); // Mid-back outward-flicked feather tip!
      ctx.quadraticCurveTo(-14.2, 1.8, -13.8, 4.4);
      ctx.lineTo(-14.2, 7.4); // Lower-back feathered lock tip
      ctx.lineTo(-12.0, 6.2);
      ctx.lineTo(-11.4, 9.8); // Nape feathered lock tip
      ctx.lineTo(-9.2, 7.8);
      ctx.lineTo(-7.8, 10.6); // Ear-back feathered lock tip
      ctx.lineTo(-5.6, 7.6);
      // Sweeps up cleanly behind the eye to the high V-parting apex `(3.6, -8.8)`, creating the exact `/\` forehead window!
      ctx.bezierCurveTo(-3.4, 2.2, -1.2, -5.4, 3.6, -8.8);
      ctx.closePath();

      const sag = ctx.createLinearGradient(2, -15, -6, 10);
      sag.addColorStop(0, '#fcd82e');
      sag.addColorStop(0.5, '#ebb20e');
      sag.addColorStop(1, '#b87c04');
      ctx.fillStyle = sag;
      ctx.fill();
      ctx.strokeStyle = '#6b4400';
      ctx.lineWidth = 0.85;
      ctx.stroke();
    });

    // 2. Live Supple Verlet Cascading Side Locks & Front Curtain Bangs!
    if (hair) drawLocks(ctx, hair, 'front', SANJI_PAL, k.s);

    // 3. Sculpted Top-Parting Crown Cap & Longitudinal 3D Hair Strand Grooves (like Gambar 4's carved strands — NO white helmet bar!)
    local(ctx, k, () => {
      // Seamless warm-gold parting bridge tying the physics locks cleanly into the two parted crown lobes
      const pg = ctx.createLinearGradient(3, -14.8, 3, -8.2);
      pg.addColorStop(0, '#fde047');
      pg.addColorStop(1, '#efb812');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(3.6, -8.6);
      ctx.quadraticCurveTo(7.0, -7.8, 9.6, -6.6);
      ctx.bezierCurveTo(9.0, -11.4, 6.8, -13.8, 3.8, -13.4);
      ctx.bezierCurveTo(0.2, -14.8, -6.2, -14.4, -10.4, -10.4);
      ctx.quadraticCurveTo(-5.2, -8.8, -0.4, -8.2);
      ctx.quadraticCurveTo(1.8, -8.4, 3.6, -8.6);
      ctx.closePath();
      ctx.fill();

      // Crisp sculpted 3D strand grooves radiating from the V-parting `(3.7, -13.2)` down both sides (exact Gambar 4 texture!)
      ctx.strokeStyle = 'rgba(122, 74, 0, 0.58)';
      ctx.lineWidth = 0.72;
      curves(ctx, [
        // Parting groove & side-back strand lines
        [3.7, -13.2, 1.2, -11.2, -1.0, -4.5],
        [2.2, -13.8, -2.0, -11.4, -4.2, -2.5],
        [-0.5, -14.4, -5.6, -11.2, -7.8, 0.5],
        [-3.8, -14.2, -9.2, -10.2, -11.2, 2.5],
        [-7.2, -13.0, -11.8, -8.4, -13.2, 0.8],
        // Front-swept fringe strand lines
        [3.9, -13.1, 6.4, -11.0, 8.2, -6.2],
        [5.4, -13.2, 8.2, -10.8, 9.8, -6.0],
      ]);

      // Warm sunlit golden strand highlights following the hair flow (vertical/curved along strands, NEVER a flat helmet glare!)
      ctx.strokeStyle = 'rgba(255, 244, 156, 0.68)';
      ctx.lineWidth = 0.95;
      curves(ctx, [
        [2.8, -13.2, -0.4, -10.8, -2.2, -5.2],
        [-0.2, -13.8, -4.2, -10.8, -6.0, -3.8],
        [4.5, -12.8, 7.0, -10.6, 8.6, -6.8],
      ]);

      // 4. SANJI'S ICONIC OPEN SPIRAL EYEBROW (`🌀`) — Exact Gambar 4 Geometry!
      // Sits cleanly inside the inverted-V forehead window above his eye:
      // Outer brow slants in from `(0.9, -3.2)` to `(4.8, -3.9)`, then curls UPWARD into a crisp open 1.5-turn spiral!
      const traceSpiralBrow = () => {
        ctx.beginPath();
        ctx.moveTo(0.9, -3.1);
        ctx.quadraticCurveTo(3.0, -3.4, 4.9, -3.9);
        // Outer upward loop of the spiral
        ctx.bezierCurveTo(6.8, -4.4, 6.9, -6.9, 4.9, -6.9);
        // Inner coiling turn with clear open dark space inside!
        ctx.bezierCurveTo(3.2, -6.9, 3.3, -4.8, 4.8, -4.9);
        ctx.quadraticCurveTo(5.6, -5.0, 5.3, -5.8);
      };

      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#050505';
      ctx.lineWidth = 1.9;
      traceSpiralBrow();
      ctx.stroke();

      ctx.strokeStyle = '#ffe878';
      ctx.lineWidth = 0.88;
      traceSpiralBrow();
      ctx.stroke();
      ctx.restore();
    });
  } else if (style === 'punk') {
    local(ctx, k, () => {
      const lag = clamp((k.p[0].x - k.o[0].x) * k.face * 0.5, -0.45, 0.45) + Math.sin(t * 5.2 + k.seed * 9) * 0.05;
      ctx.strokeStyle = '#b0126a';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, 11.2, -3.15, -0.85);
      ctx.stroke();
      const n = 7;
      for (let i = n - 1; i >= 0; i--) {
        const tt = i / (n - 1);
        const a = 0.72 - tt * 2.3;
        const la = a - 0.28 - lag;
        const bx = Math.sin(a) * 10.4;
        const by = -Math.cos(a) * 10.4;
        const px = Math.cos(a) * 3.3;
        const py = Math.sin(a) * 3.3;
        const len = 9 + 10 * Math.sin(Math.PI * (0.14 + 0.78 * tt));
        ctx.beginPath();
        ctx.moveTo(bx - px, by - py);
        ctx.lineTo(bx + Math.sin(la) * len, by - Math.cos(la) * len);
        ctx.lineTo(bx + px, by + py);
        ctx.closePath();
        ctx.strokeStyle = '#6d0d3f';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = i % 2 ? '#ff6fb5' : '#ff2e93';
        ctx.fill();
      }
    });
  } else if (style === 'racer') {
    // ============ AERODYNAMIC FULL-FACE MOTOGP / F1 RACING HELMET (NO REAR SPIKE!) ============
    local(ctx, k, () => {
      const shell = () => {
        ctx.beginPath();
        ctx.moveTo(12.2, -7.0);
        ctx.bezierCurveTo(8.8, -13.8, 0.2, -14.9, -7.4, -13.8);
        ctx.bezierCurveTo(-13.6, -12.7, -15.8, -7.6, -15.5, -1.4);
        ctx.bezierCurveTo(-15.2, 3.6, -14.0, 7.2, -12.4, 9.2);
        ctx.bezierCurveTo(-5.4, 11.4, 4.6, 13.0, 12.8, 13.1);
        ctx.quadraticCurveTo(15.8, 12.8, 16.2, 9.4);
        ctx.lineTo(15.9, 3.6);
        ctx.lineTo(14.3, 2.7);
        ctx.quadraticCurveTo(15.2, -2.1, 12.2, -7.0);
        ctx.closePath();
      };

      const visor = () => {
        ctx.beginPath();
        ctx.moveTo(-1.2, -4.6);
        ctx.quadraticCurveTo(6.0, -6.6, 12.5, -6.3);
        ctx.quadraticCurveTo(15.4, -2.0, 14.5, 2.7);
        ctx.quadraticCurveTo(6.5, 3.3, -1.0, 1.3);
        ctx.quadraticCurveTo(-3.0, -1.5, -1.2, -4.6);
        ctx.closePath();
      };

      ctx.save();
      shell();
      ctx.lineWidth = 2.3;
      ctx.strokeStyle = '#081016';
      ctx.stroke();
      ctx.restore();

      const sg = ctx.createRadialGradient(-2.2, -8.2, 1.4, -0.8, 0, 18.5);
      sg.addColorStop(0, '#ff7868');
      sg.addColorStop(0.38, '#ea2d26');
      sg.addColorStop(0.78, '#b51814');
      sg.addColorStop(1, '#750c0a');
      shell();
      ctx.fillStyle = sg;
      ctx.fill();

      ctx.save();
      shell();
      ctx.clip();

      ctx.fillStyle = 'rgba(90, 6, 8, 0.5)';
      ctx.beginPath();
      ctx.moveTo(-14.0, 5.6);
      ctx.quadraticCurveTo(-1.2, 4.0, 16.4, 3.4);
      ctx.lineTo(17.0, 14.0);
      ctx.lineTo(-15.0, 14.0);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(12.4, -7.8);
      ctx.bezierCurveTo(7.0, -12.7, -3.4, -13.1, -15.8, -6.0);
      ctx.lineTo(-15.8, -3.1);
      ctx.bezierCurveTo(-3.6, -10.0, 6.5, -9.8, 12.8, -6.0);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(11.8, -6.1);
      ctx.bezierCurveTo(6.2, -9.6, -3.6, -9.7, -15.6, -2.9);
      ctx.stroke();

      ctx.fillStyle = '#141e27';
      ctx.beginPath();
      ctx.moveTo(-14.6, -1.6);
      ctx.lineTo(-11.8, -0.9);
      ctx.lineTo(-12.1, 0.9);
      ctx.lineTo(-14.8, 0.3);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-9.0, 6.3);
      ctx.quadraticCurveTo(1.5, 8.3, 9.8, 8.5);
      ctx.lineTo(8.7, 10.0);
      ctx.quadraticCurveTo(0.5, 9.7, -10.2, 7.5);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-13.4, 7.9);
      ctx.bezierCurveTo(-5.2, 10.3, 4.8, 11.8, 15.2, 11.7);
      ctx.lineTo(15.5, 14.2);
      ctx.lineTo(-13.8, 11.6);
      ctx.closePath();
      ctx.fillStyle = '#111921';
      ctx.fill();
      ctx.strokeStyle = '#3f505e';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(-12.6, 8.2);
      ctx.bezierCurveTo(-5.0, 10.4, 4.8, 11.8, 14.8, 11.7);
      ctx.stroke();

      ctx.fillStyle = '#111921';
      ctx.beginPath();
      ctx.moveTo(11.9, 6.0);
      ctx.lineTo(15.8, 5.6);
      ctx.lineTo(16.0, 9.0);
      ctx.lineTo(11.5, 8.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#6d8294';
      ctx.lineWidth = 0.72;
      ctx.beginPath();
      ctx.moveTo(12.3, 7.0);
      ctx.lineTo(15.3, 6.8);
      ctx.moveTo(12.1, 8.0);
      ctx.lineTo(15.4, 7.9);
      ctx.stroke();

      ctx.fillStyle = '#151f28';
      ctx.beginPath();
      ctx.moveTo(7.0, -8.6);
      ctx.lineTo(10.8, -7.9);
      ctx.lineTo(10.2, -6.9);
      ctx.lineTo(6.5, -7.6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      ctx.save();
      visor();
      ctx.lineWidth = 1.95;
      ctx.strokeStyle = '#0b131a';
      ctx.stroke();
      const vg = ctx.createLinearGradient(0, -6.6, 13.5, 3.0);
      vg.addColorStop(0, '#09141d');
      vg.addColorStop(0.55, '#193e52');
      vg.addColorStop(1, '#0c202b');
      ctx.fillStyle = vg;
      ctx.fill();

      ctx.clip();
      ctx.fillStyle = 'rgba(138, 238, 255, 0.65)';
      ctx.beginPath();
      ctx.moveTo(2.2, -5.0);
      ctx.quadraticCurveTo(8.2, -5.6, 12.2, -5.0);
      ctx.lineTo(10.4, -1.7);
      ctx.quadraticCurveTo(6.0, -2.1, 1.3, -1.9);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
      ctx.beginPath();
      ctx.moveTo(11.2, -5.0);
      ctx.lineTo(13.1, -4.6);
      ctx.lineTo(11.8, -1.5);
      ctx.lineTo(10.1, -1.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#151f28';
      ctx.beginPath();
      ctx.arc(-1.2, -1.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8fa3b3';
      ctx.beginPath();
      ctx.arc(-1.2, -1.5, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#151f28';
      ctx.beginPath();
      ctx.arc(-1.2, -1.5, 0.52, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(-8.8, -8.8);
      ctx.quadraticCurveTo(-3.0, -11.8, 3.0, -10.6);
      ctx.stroke();
    });
  } else if (style === 'robin') {
    local(ctx, k, () => {
      ctx.beginPath();
      ctx.moveTo(-12.5, -5.5);
      ctx.bezierCurveTo(-14, -14, -9.5, -22, -2, -23);
      ctx.bezierCurveTo(5, -22.5, 10, -15.5, 24.5, -7.2);
      ctx.quadraticCurveTo(8, -4, -12.5, -5.5);
      ctx.closePath();
      const g = ctx.createLinearGradient(-12, -23, 16, -5);
      g.addColorStop(0, '#4fd062');
      g.addColorStop(0.5, '#2fae3c');
      g.addColorStop(1, '#1f8a34');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#0b2a12';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(11,42,18,0.45)';
      ctx.lineWidth = 0.8;
      curves(ctx, [[-3, -22, 3, -15, 12, -10.5]]);
    });
    if (hair) {
      const base = ctx.globalAlpha;
      for (const L of hair.locks) {
        const w = L.w * k.s;
        ribbon(ctx, L.p, (q) => w * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * q)), 0.7));
        ctx.fillStyle = '#e5352f';
        ctx.fill();
        ctx.strokeStyle = '#7a0f12';
        ctx.lineWidth = 0.8 * k.s;
        ctx.stroke();
        strand(ctx, L.p, 0, L.p.length - 1);
        ctx.globalAlpha = base * 0.85;
        ctx.strokeStyle = '#ffd0c8';
        ctx.lineWidth = 0.9 * k.s;
        ctx.stroke();
        ctx.globalAlpha = base;
      }
    }
    local(ctx, k, () => {
      ctx.beginPath();
      ctx.moveTo(24.5, -7.2);
      ctx.quadraticCurveTo(8, -3.8, -13, -4.8);
      ctx.quadraticCurveTo(-17, -8.5, -14.5, -14);
      ctx.quadraticCurveTo(-4, -9.4, 24.5, -7.2);
      ctx.closePath();
      ctx.fillStyle = '#1b7a30';
      ctx.fill();
      ctx.strokeStyle = '#0b2a12';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(140,235,150,0.75)';
      ctx.lineWidth = 0.9;
      curves(ctx, [[-13.6, -12.6, -3.5, -8.6, 21, -7.4]]);
    });
  } else if (style === 'cowboy') {
    local(ctx, k, () => {
      ctx.beginPath();
      ctx.moveTo(-11, -10);
      ctx.bezierCurveTo(-11.6, -17, -10.6, -23, -7.2, -25.4);
      ctx.quadraticCurveTo(-4.6, -27, -2, -25.2);
      ctx.quadraticCurveTo(0.2, -23.6, 2.6, -25.3);
      ctx.quadraticCurveTo(6, -27, 8.6, -24.4);
      ctx.bezierCurveTo(10.8, -21, 11.6, -16, 11.6, -10);
      ctx.closePath();
      const g = ctx.createLinearGradient(-11, 0, 12, 0);
      g.addColorStop(0, '#7a4f25');
      g.addColorStop(0.55, '#9a6a35');
      g.addColorStop(1, '#b98447');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#2a1708';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(42,23,8,0.5)';
      ctx.lineWidth = 0.8;
      curves(ctx, [[0.2, -23.6, -0.5, -19.5, 1, -17.6]]);
      ctx.fillStyle = '#2e1a0c';
      ctx.fillRect(-11.4, -17.4, 23, 3.4);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(3.2, -18, 3.8, 4.6);
      ctx.fillStyle = '#2e1a0c';
      ctx.fillRect(4.3, -16.9, 1.6, 2.4);
      ctx.beginPath();
      ctx.moveTo(-25.5, -8);
      ctx.bezierCurveTo(-17, -4.6, 17, -4.6, 25.5, -8.4);
      ctx.bezierCurveTo(18, -13, 10, -13.6, 0, -13.6);
      ctx.bezierCurveTo(-10, -13.6, -18, -13, -25.5, -8);
      ctx.closePath();
      const bg = ctx.createLinearGradient(0, -13.6, 0, -5);
      bg.addColorStop(0, '#c08a4c');
      bg.addColorStop(1, '#6d4520');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = '#2a1708';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(232,190,130,0.85)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-21, -10.6);
      ctx.bezierCurveTo(-14, -12.9, -7, -13, 0, -13);
      ctx.bezierCurveTo(7, -13, 14, -12.9, 21, -10.8);
      ctx.stroke();
    });
  }
  ctx.restore();
}
