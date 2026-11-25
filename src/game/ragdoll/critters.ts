// Two things the archers have to deal with besides each other: a bat seen from the side, riding the air up and down
// between the grounds, and the full-size shield a shield bearer braces behind.
// Drawing only - RagWorld owns how they move and what they stop.
import { Ctx, V, clamp } from '../util';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/* ------------------------------------------------ the bat ------------------------------------------------ */

export interface BatLook {
  /** rim light of the current forest (null: none) */
  rim: string | null;
  /** 0..1 flash after a hit */
  flash: number;
  /** 0 calm .. 1 about to bite: red eyes, bared fangs */
  angry: number;
  /** nose up (negative) or down (positive), radians */
  tilt: number;
  /** which way it looks: negative = left, otherwise right */
  face: number;
  dead: boolean;
  /** the vampire kind: blood-red wings and a red ruff */
  big: boolean;
}

/**
 * One wing as a closed shape, for a stroke position t: 0 = thrown up over the back, 1 = swept down under the belly.
 * Half-way between the two it is nearly edge-on, exactly as a wing seen from the side is. Drawn looking right.
 */
function wingPath(ctx: Ctx, t: number): [number, number, number, number, number, number, number, number] {
  const sx = 2; const sy = -3.5;                        // shoulder
  const hx = -9; const hy = 2.5;                        // where the skin meets the body again, by the leg
  const wx = mix(-3, 5, t); const wy = mix(-22, 12, t); // wrist
  const tx = mix(-15, 5, t); const ty = mix(-39, 32, t); // tip of the leading finger
  const ax = mix(-26, -10, t); const ay = mix(-27, 28, t); // second finger
  const bx = mix(-29, -19, t); const by = mix(-11, 15, t); // third finger
  // the skin between two finger tips hangs in toward the wrist: that is the scalloped edge
  const scallop = (x0: number, y0: number, x1: number, y1: number, k: number, px: number, py: number) => {
    const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2;
    ctx.quadraticCurveTo(mx + (px - mx) * k, my + (py - my) * k, x1, y1);
  };
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(mix(sx, wx, 0.5) + 2.6, mix(sy, wy, 0.5), wx, wy);
  ctx.quadraticCurveTo(mix(wx, tx, 0.5) + 2.2, mix(wy, ty, 0.5), tx, ty);
  scallop(tx, ty, ax, ay, 0.42, wx, wy);
  scallop(ax, ay, bx, by, 0.42, wx, wy);
  scallop(bx, by, hx, hy, 0.36, sx, sy);
  ctx.closePath();
  return [wx, wy, tx, ty, ax, ay, bx, by];
}

/** a bat in profile, in the black-with-rim-light style of the stickmen; `flap` is the wingbeat phase */
export function drawBat(ctx: Ctx, p: V, s: number, flap: number, o: BatLook) {
  const fl = Math.round(clamp(o.flash, 0, 1) * 215);
  const hot = fl > 4;
  const black = hot ? `rgb(${fl},${Math.round(fl * 0.1)},${Math.round(fl * 0.1)})` : '#000000';
  const skin = hot ? `rgb(${Math.min(255, fl + 34)},${Math.round(fl * 0.24)},${Math.round(fl * 0.22)})` : o.big ? '#571126' : '#2f1946';
  const skinFar = hot ? black : o.big ? '#330a16' : '#1a0e29';
  const t1 = o.dead ? 0.14 : 0.5 - 0.5 * Math.sin(flap);         // the near wing
  const t2 = o.dead ? 0.3 : 0.5 - 0.5 * Math.sin(flap - 0.6);    // the far one beats a moment behind
  const bob = o.dead ? 0 : -Math.cos(flap) * 2;                  // the body rides against the wingbeat
  const fx = o.face < 0 ? -1 : 1; // looking left or right: mirrored whole, never squeezed
  const rim = !hot && o.rim ? o.rim : null;

  ctx.save();
  ctx.translate(p.x, p.y + bob * s);
  ctx.scale(s * fx, s);
  ctx.rotate(o.tilt);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // every solid piece of him, back to front
  const farEar = () => { ctx.beginPath(); ctx.moveTo(9.6, -8.4); ctx.quadraticCurveTo(11.2, -15, 13.4, -18.8); ctx.quadraticCurveTo(15.4, -13, 14.8, -7.6); ctx.closePath(); };
  const tail = () => { ctx.beginPath(); ctx.moveTo(-9, -1.6); ctx.lineTo(-17.5, 3.2); ctx.lineTo(-8.4, 4.6); ctx.closePath(); };
  const torso = () => { ctx.beginPath(); ctx.ellipse(-1, 1, 10.6, 6.6, -0.18, 0, Math.PI * 2); };
  const chest = () => { ctx.beginPath(); ctx.ellipse(4.2, 1.6, 6.4, 6, 0, 0, Math.PI * 2); };
  const head = () => { ctx.beginPath(); ctx.arc(9.6, -3.6, 6.4, 0, Math.PI * 2); };
  const snout = () => { ctx.beginPath(); ctx.ellipse(15, -1.9, 3.3, 2.6, 0.1, 0, Math.PI * 2); };
  const leaf = () => { ctx.beginPath(); ctx.moveTo(16.2, -3.6); ctx.lineTo(19.2, -6.4); ctx.lineTo(18.3, -2.5); ctx.closePath(); };
  const nearEar = () => { ctx.beginPath(); ctx.moveTo(5.8, -8); ctx.quadraticCurveTo(5.4, -16, 7.6, -21.4); ctx.quadraticCurveTo(11.8, -15.5, 12.5, -8.8); ctx.closePath(); };
  const body = [farEar, tail, torso, chest, head, snout, leaf, nearEar];

  // 1) rim light round everything first, so none of it ever shows inside the silhouette
  if (rim) {
    ctx.strokeStyle = rim; ctx.lineWidth = 2.4;
    ctx.save(); ctx.translate(3.5, -1.2); wingPath(ctx, t2); ctx.stroke(); ctx.restore();
    for (const b of body) { b(); ctx.stroke(); }
    wingPath(ctx, t1); ctx.stroke();
  }
  // 2) the far wing, in shadow
  ctx.save(); ctx.translate(3.5, -1.2); wingPath(ctx, t2); ctx.fillStyle = skinFar; ctx.fill(); ctx.restore();
  // 3) the body
  ctx.fillStyle = black;
  for (const b of body) { b(); ctx.fill(); }
  // little hooked feet trailing behind
  ctx.strokeStyle = black; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-8.6, 5); ctx.lineTo(-12.4, 8.8); ctx.lineTo(-14, 7.8);
  ctx.moveTo(-6.4, 6.2); ctx.lineTo(-9.4, 10.6); ctx.lineTo(-11.2, 9.8);
  ctx.stroke();
  // the inside of the near ear
  if (!hot) {
    ctx.fillStyle = o.big ? '#8a2338' : '#6d3d63';
    ctx.beginPath(); ctx.moveTo(7.3, -9.8); ctx.quadraticCurveTo(7, -15.4, 8.1, -18.2); ctx.quadraticCurveTo(10.5, -14.4, 10.9, -10.2); ctx.closePath(); ctx.fill();
  }
  if (o.big) {
    // a red ruff under the chin
    ctx.fillStyle = '#c4161c';
    ctx.beginPath(); ctx.moveTo(1.6, 5); ctx.lineTo(3.4, 9.2); ctx.lineTo(5.2, 5.8); ctx.lineTo(7, 8.8); ctx.lineTo(8.6, 4.6); ctx.closePath(); ctx.fill();
  }
  // 4) the near wing: skin stretched over an arm and three long fingers
  const [wx, wy, tx, ty, ax, ay, bx, by] = wingPath(ctx, t1);
  ctx.fillStyle = skin; ctx.fill();
  ctx.strokeStyle = black; ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(wx, wy); ctx.lineTo(tx, ty);
  ctx.moveTo(wx, wy); ctx.lineTo(ax, ay);
  ctx.moveTo(wx, wy); ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.lineWidth = 2.7;
  ctx.beginPath(); ctx.moveTo(2, -3.5); ctx.quadraticCurveTo(mix(2, wx, 0.5) + 2.6, mix(-3.5, wy, 0.5), wx, wy); ctx.stroke();
  ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 3, wy - 2.4); ctx.stroke(); // the thumb claw

  // 5) the face
  if (o.dead) {
    ctx.strokeStyle = '#dfeef3'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10.7, -6.2); ctx.lineTo(13.7, -3.4); ctx.moveTo(13.7, -6.2); ctx.lineTo(10.7, -3.4);
    ctx.stroke();
  } else {
    ctx.save();
    if (o.angry > 0.05) { ctx.shadowColor = '#ff2a1f'; ctx.shadowBlur = 9 * o.angry; }
    ctx.fillStyle = o.angry > 0.5 || o.big ? '#ff4a3d' : '#fff1bd';
    ctx.beginPath(); ctx.ellipse(12.2, -4.8, 2.05, 1.75, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (o.angry > 0.5) {
      // a scowl: the brow comes down over the eye toward the nose
      ctx.fillStyle = black;
      ctx.beginPath(); ctx.moveTo(9.4, -7.6); ctx.lineTo(14.9, -4.9); ctx.lineTo(14.6, -7.8); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#12060c';
      ctx.beginPath(); ctx.arc(12.9, -4.7, 0.8, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = '#ffffff';
  if (o.angry > 0.5 && !o.dead) {
    // jaws open: a red mouth and both fangs
    ctx.fillStyle = '#b01224';
    ctx.beginPath(); ctx.moveTo(12.4, -0.5); ctx.lineTo(18.1, -1); ctx.lineTo(15.4, 2.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(16.1, -0.9); ctx.lineTo(17.4, -1); ctx.lineTo(16.8, 1.7); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14, -0.7); ctx.lineTo(15.2, -0.8); ctx.lineTo(14.7, 1.2); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(15.5, 0.3); ctx.lineTo(16.9, 0.2); ctx.lineTo(16.2, 2.7); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------ the shield ------------------------------------------------ */

/** half the shield's width and height at scale 1: a full heater shield, most of the man who carries it */
export const SHIELD_HW = 21;
export const SHIELD_HH = 31;

/**
 * Half the shield's width at height `y` in its own frame (scale 1; negative y is toward its top edge), 0 above
 * and below it. Flat-topped and straight-sided, then drawn in to a point - the same outline that is painted,
 * so what you see is exactly what stops an arrow.
 */
export function shieldHalf(y: number): number {
  if (y < -SHIELD_HH || y > SHIELD_HH) return 0;
  const y0 = SHIELD_HH * 0.1;
  if (y <= y0) return SHIELD_HW;
  const u = (y - y0) / (SHIELD_HH - y0);
  return SHIELD_HW * Math.sqrt(Math.max(0, 1 - u * u)) * 0.95;
}

function shieldPath(ctx: Ctx, inset: number) {
  const hw = SHIELD_HW - inset; const hh = SHIELD_HH - inset * 1.25; const top = -SHIELD_HH + inset;
  const r = Math.max(1.5, 5 - inset); const y0 = SHIELD_HH * 0.1;
  ctx.beginPath();
  ctx.moveTo(-hw + r, top);
  ctx.lineTo(hw - r, top);
  ctx.quadraticCurveTo(hw, top, hw, top + r);
  ctx.lineTo(hw, y0);
  ctx.bezierCurveTo(hw, hh * 0.55, hw * 0.55, hh * 0.86, 0, hh);
  ctx.bezierCurveTo(-hw * 0.55, hh * 0.86, -hw, hh * 0.55, -hw, y0);
  ctx.lineTo(-hw, top + r);
  ctx.quadraticCurveTo(-hw, top, -hw + r, top);
  ctx.closePath();
}

export interface ShieldLook {
  /** blows it can still take, out of `max`: every one lost shows as a crack and a dent in the rim */
  hp: number; max: number;
  /** 0..1 flash after stopping an arrow */
  flash: number;
  rim: string | null;
  /** 0 = held out in the light, 1 = slung on his back, in his shadow */
  shade: number;
}

/** cracks, as [across -1..1, down -1..1] points: one more of them shows for every blow the shield has taken */
const CRACKS: [number, number][][] = [
  [[-0.34, -1], [-0.14, -0.72], [-0.38, -0.5], [-0.12, -0.3]],
  [[1, -0.22], [0.6, -0.08], [0.74, 0.14], [0.34, 0.22]],
  [[-0.8, 0.5], [-0.42, 0.36], [-0.52, 0.1], [-0.16, 0.06]],
  [[0.52, -1], [0.4, -0.62], [0.64, -0.4], [0.3, -0.12], [0.44, 0.1]],
];

/**
 * A full-size heater shield in the enemy's own colours: a face as black as the men who carry it, a bright iron
 * band, their red chevron, an iron boss. `c` is its centre, `rot` how far its long axis is turned off upright.
 * It is always drawn at its full size - it moves and turns, it never shrinks.
 */
export function drawShield(ctx: Ctx, c: V, rot: number, s: number, o: ShieldLook) {
  const base = ctx.globalAlpha;
  const W = SHIELD_HW; const Hh = SHIELD_HH;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // rim light, then a dark keyline: it reads against any forest
  if (o.rim) { shieldPath(ctx, 0); ctx.strokeStyle = o.rim; ctx.lineWidth = 4.8; ctx.stroke(); }
  shieldPath(ctx, 0); ctx.strokeStyle = '#04080a'; ctx.lineWidth = 2.6; ctx.stroke();

  // the iron band round the edge, lit from the upper left
  const band = ctx.createLinearGradient(-W, -Hh, W, Hh);
  band.addColorStop(0, '#e6f2f6'); band.addColorStop(0.42, '#93a8b1'); band.addColorStop(1, '#46575f');
  shieldPath(ctx, 0); ctx.fillStyle = band; ctx.fill();

  // the face
  ctx.save();
  shieldPath(ctx, 3.6); ctx.clip();
  const face = ctx.createLinearGradient(0, -Hh, 0, Hh);
  face.addColorStop(0, '#2a3a43'); face.addColorStop(0.55, '#162027'); face.addColorStop(1, '#0a1014');
  ctx.fillStyle = face; ctx.fillRect(-W, -Hh, W * 2, Hh * 2);
  // their colours: a broad red chevron, darker along its lower edge
  ctx.fillStyle = '#e5352f';
  ctx.beginPath(); ctx.moveTo(-W, -17); ctx.lineTo(0, -1); ctx.lineTo(W, -17); ctx.lineTo(W, -6); ctx.lineTo(0, 10); ctx.lineTo(-W, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a51c18';
  ctx.beginPath(); ctx.moveTo(-W, -9.5); ctx.lineTo(0, 6.5); ctx.lineTo(W, -9.5); ctx.lineTo(W, -6); ctx.lineTo(0, 10); ctx.lineTo(-W, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath(); ctx.moveTo(-W, -17); ctx.lineTo(0, -1); ctx.lineTo(W, -17); ctx.lineTo(W, -15.6); ctx.lineTo(0, 0.4); ctx.lineTo(-W, -15.6); ctx.closePath(); ctx.fill();
  // a second, thin chevron below it
  ctx.strokeStyle = '#7d8f97'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-W, 1.5); ctx.lineTo(0, 17.5); ctx.lineTo(W, 1.5); ctx.stroke();
  // light across the upper left, shadow down the right
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.moveTo(-W, -Hh); ctx.lineTo(-1, -Hh); ctx.lineTo(-W + 7, Hh * 0.55); ctx.lineTo(-W, Hh * 0.55); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fillRect(W * 0.4, -Hh, W, Hh * 2);
  // every blow it has taken: a crack running in from the rim
  const lost = Math.min(CRACKS.length, Math.max(0, o.max - o.hp));
  for (let i = 0; i < lost; i++) {
    const cr = CRACKS[i];
    for (const [col, lw, off] of [['#010203', 1.9, 0], ['rgba(225,240,246,0.55)', 0.65, 0.85]] as [string, number, number][]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath();
      cr.forEach(([x, y], j) => { if (j) ctx.lineTo(x * W + off, y * Hh + off); else ctx.moveTo(x * W + off, y * Hh + off); });
      ctx.stroke();
    }
  }
  ctx.restore();

  // the line where band meets face, and a dent in the band where each crack starts
  shieldPath(ctx, 3.6); ctx.strokeStyle = '#04080a'; ctx.lineWidth = 1.1; ctx.stroke();
  ctx.fillStyle = '#04080a';
  for (let i = 0; i < lost; i++) {
    const [x, y] = CRACKS[i][0];
    ctx.beginPath(); ctx.arc(x * W * 0.98, y * Hh * 0.98, 2.3, 0, Math.PI * 2); ctx.fill();
  }
  // rivets in the band
  for (const [x, y] of [[-W + 1.8, -Hh + 9], [W - 1.8, -Hh + 9], [-W + 1.8, -8], [W - 1.8, -8], [0, -Hh + 1.8], [-10, -Hh + 1.8], [10, -Hh + 1.8], [-14.6, 15], [14.6, 15], [0, Hh - 2.6]]) {
    ctx.fillStyle = '#1a252b'; ctx.beginPath(); ctx.arc(x + 0.35, y + 0.4, 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4fbfd'; ctx.beginPath(); ctx.arc(x, y, 0.85, 0, Math.PI * 2); ctx.fill();
  }
  // the iron boss in the middle of the chevron
  ctx.fillStyle = '#04080a'; ctx.beginPath(); ctx.arc(0, -3, 6.6, 0, Math.PI * 2); ctx.fill();
  const boss = ctx.createRadialGradient(-1.8, -4.8, 0.5, 0, -3, 5.6);
  boss.addColorStop(0, '#ffffff'); boss.addColorStop(0.35, '#c3d4db'); boss.addColorStop(1, '#52656e');
  ctx.fillStyle = boss; ctx.beginPath(); ctx.arc(0, -3, 5.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b3940'; ctx.beginPath(); ctx.arc(0, -3, 1.5, 0, Math.PI * 2); ctx.fill();

  // on his back it sits in his shadow; just struck, it flashes
  if (o.shade > 0.02) { shieldPath(ctx, 0); ctx.globalAlpha = base * clamp(o.shade, 0, 1) * 0.42; ctx.fillStyle = '#000000'; ctx.fill(); ctx.globalAlpha = base; }
  if (o.flash > 0.02) { shieldPath(ctx, 0); ctx.globalAlpha = base * clamp(o.flash, 0, 1) * 0.75; ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.globalAlpha = base; }
  ctx.restore();
}
