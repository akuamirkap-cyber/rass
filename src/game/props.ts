import { Ctx, V, v, lerp, circle, shape, stroke } from './util';

/* ---- level 4: trampoline -------------------------------------------------- */
export const TRAMP = { bed: 62, half: 76, v0: 520, g: 900, tc: 0.28 };

/** `sag` = how far (px) the middle of the bed is pushed down right now */
export function drawTrampoline(ctx: Ctx, x: number, groundY: number, sag: number) {
  const top = groundY - TRAMP.bed;
  for (const s of [-1, 1]) {
    stroke(ctx, [v(x + s * 98, top), v(x + s * 110, groundY - 3)], '#7b8491', 5);
    stroke(ctx, [v(x + s * 98, top), v(x + s * 76, groundY - 3)], '#5f6873', 5);
    stroke(ctx, [v(x + s * 114, groundY - 2.5), v(x + s * 72, groundY - 2.5)], '#3b4049', 5);
    const pts: V[] = [];
    for (let i = 0; i <= 6; i++) {
      pts.push(v(lerp(x + s * 85, x + s * TRAMP.half, i / 6), top + (i === 0 || i === 6 ? 0 : i % 2 ? -2.6 : 2.6)));
    }
    stroke(ctx, pts, '#aab3bd', 1.6);
  }
  ctx.beginPath();
  ctx.moveTo(x - TRAMP.half, top);
  ctx.quadraticCurveTo(x, top + 2 * sag, x + TRAMP.half, top);
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#17181c';
  ctx.stroke();
  for (const s of [-1, 1]) {
    shape(ctx, (p) => p.roundRect(x + s * 98 - 15, top - 6, 30, 12, 6), '#2f62c9');
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x + s * 98 - 10, top - 4.5, 20, 2.2);
  }
}

/* ---- level 6: seesaw, crane, 100 ton weight, arrow-proof glass ------------- */
export const SAW = { pivotH: 40, half: 165, thick: 10, tilt: 0.215, manU: -150, weightU: 140 };
export const WEIGHT = { w: 120, top: 84, h: 92 };

/** point on the top face of the plank, `u` px along it from the pivot */
export const plankPoint = (fx: number, groundY: number, ang: number, u: number): V => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return v(fx + u * c + SAW.thick * s, groundY - SAW.pivotH + u * s - SAW.thick * c);
};

export function drawSeesaw(ctx: Ctx, fx: number, groundY: number, ang: number) {
  shape(
    ctx,
    (p) => {
      p.moveTo(fx - 32, groundY);
      p.lineTo(fx + 32, groundY);
      p.lineTo(fx + 5, groundY - 46);
      p.lineTo(fx - 5, groundY - 46);
      p.closePath();
    },
    '#565c68',
  );
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.moveTo(fx, groundY);
  ctx.lineTo(fx + 32, groundY);
  ctx.lineTo(fx + 5, groundY - 46);
  ctx.lineTo(fx, groundY - 46);
  ctx.fill();
  ctx.save();
  ctx.translate(fx, groundY - SAW.pivotH);
  ctx.rotate(ang);
  shape(ctx, (p) => p.roundRect(-SAW.half, -SAW.thick, SAW.half * 2, SAW.thick, 3), '#c58f52');
  ctx.fillStyle = 'rgba(80,40,10,0.28)';
  ctx.fillRect(-SAW.half + 2, -3.4, SAW.half * 2 - 4, 3.4);
  ctx.fillStyle = '#e2572b';
  ctx.fillRect(-SAW.half + 4, -SAW.thick, 22, SAW.thick - 3.4);
  ctx.fillRect(SAW.half - 26, -SAW.thick, 22, SAW.thick - 3.4);
  ctx.restore();
  circle(ctx, v(fx, groundY - SAW.pivotH - 1), 6, '#2b2e36');
  circle(ctx, v(fx, groundY - SAW.pivotH - 1), 2.4, '#aab3bd');
}

/** gallows style crane: post at `postX`, arm reaching left to a pulley above `armX` */
export function drawCrane(ctx: Ctx, postX: number, armX: number, groundY: number, h: number) {
  const top = groundY - h;
  shape(ctx, (p) => p.roundRect(postX - 34, groundY - 10, 68, 10, 3), '#3b4049');
  ctx.fillStyle = '#f2a23a';
  ctx.fillRect(postX - 8, top, 16, h - 8);
  ctx.fillStyle = 'rgba(120,60,0,0.25)';
  ctx.fillRect(postX + 2, top, 6, h - 8);
  ctx.fillStyle = '#17181c';
  for (let i = 0; i < 3; i++) ctx.fillRect(postX - 8, groundY - 42 - i * 22, 16, 9);
  stroke(ctx, [v(postX - 4, top + 84), v(postX - 82, top + 12)], '#d98619', 6);
  stroke(ctx, [v(postX + 8, top + 6), v(armX - 12, top + 6)], '#f2a23a', 12, 'butt');
  ctx.fillStyle = 'rgba(120,60,0,0.25)';
  ctx.fillRect(armX - 12, top + 7, postX + 8 - (armX - 12), 5);
  shape(ctx, (p) => p.roundRect(armX - 14, top - 2, 28, 16, 4), '#d98619');
  circle(ctx, v(armX, top + 16), 10, '#2b2e36');
  circle(ctx, v(armX, top + 16), 3.2, '#aab3bd');
}

export function drawWeight(ctx: Ctx, cx: number, bottomY: number) {
  const { w, top, h } = WEIGHT;
  ctx.beginPath();
  ctx.arc(cx, bottomY - h - 7, 8.5, 0, Math.PI * 2);
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = '#25272d';
  ctx.stroke();
  const body = shape(
    ctx,
    (p) => {
      p.moveTo(cx - w / 2, bottomY - 4);
      p.quadraticCurveTo(cx - w / 2, bottomY, cx - w / 2 + 5, bottomY);
      p.lineTo(cx + w / 2 - 5, bottomY);
      p.quadraticCurveTo(cx + w / 2, bottomY, cx + w / 2, bottomY - 4);
      p.lineTo(cx + top / 2, bottomY - h + 5);
      p.quadraticCurveTo(cx + top / 2 - 1, bottomY - h, cx + top / 2 - 7, bottomY - h);
      p.lineTo(cx - top / 2 + 7, bottomY - h);
      p.quadraticCurveTo(cx - top / 2 + 1, bottomY - h, cx - top / 2, bottomY - h + 5);
      p.closePath();
    },
    '#3b4049',
  );
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(cx + 14, bottomY - h, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(cx - w, bottomY - h, w * 2, 7);
  ctx.restore();
  ctx.fillStyle = '#f4f5f7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 34px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('100', cx, bottomY - 54);
  ctx.font = '900 17px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('TON', cx, bottomY - 24);
}

/** pane of glass seen edge-on. `flash` 1..0 right after an arrow glanced off at `flashY` */
export function drawGlass(ctx: Ctx, x: number, groundY: number, h: number, flash: number, flashY: number) {
  const top = groundY - h;
  shape(ctx, (p) => p.roundRect(x - 18, groundY - 9, 36, 9, 3), '#565c68');
  ctx.fillStyle = 'rgba(110,190,235,0.36)';
  ctx.fillRect(x - 6.5, top, 13, h - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(x - 6.5, top, 2.2, h - 8);
  ctx.fillStyle = 'rgba(50,140,200,0.5)';
  ctx.fillRect(x + 4.6, top, 1.9, h - 8);
  ctx.fillStyle = '#7b8491';
  ctx.fillRect(x - 8.5, top - 4, 17, 5);
  for (const k of [0.2, 0.47, 0.72]) {
    stroke(ctx, [v(x - 3.6, top + h * k), v(x + 3.6, top + h * k - 12)], 'rgba(255,255,255,0.8)', 1.5);
  }
  if (flash > 0.01) {
    ctx.save();
    ctx.globalAlpha = flash;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 7.5, top, 15, h - 8);
    ctx.beginPath();
    ctx.arc(x, flashY, 10 + (1 - flash) * 36, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#7dd3fc';
    ctx.stroke();
    ctx.restore();
  }
}

/* ---- level 7: glass plate ---------------------------------------------------- */
/** a glass disc tumbling through the air: its apparent height breathes with the spin */
export function drawPlate(ctx: Ctx, c: V, r: number, spin: number) {
  const ry = r * (0.36 + 0.64 * Math.abs(Math.cos(spin)));
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(Math.sin(spin * 0.37) * 0.5);
  const ring = (kx: number, ky: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * kx, ry * ky, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  ring(1, 1, '#2f93d3');
  ring(0.85, 0.8, '#c4e4f7');
  ring(0.54, 0.5, '#6fb9e6');
  ring(0.4, 0.36, '#dcf0fb');
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.5, -ry * 0.42, r * 0.2, ry * 0.09, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---- level 8: target face on an easel ----------------------------------------- */
export const BOARD = { r: 78, bull: 13 };
const FACE_K = 0.26; // the face is seen at an angle: rings become narrow ellipses
const RINGS: [number, string][] = [
  [1, '#f4f5f7'], [0.8, '#25272d'], [0.6, '#3b82c4'], [0.4, '#e3262d'], [BOARD.bull / BOARD.r, '#ffc933'],
];

/** `pulse` 0..1 animates a "once more" ring around the centre, negative = off */
export function drawBoard(ctx: Ctx, x: number, groundY: number, cy: number, pulse: number) {
  const R = BOARD.r;
  const oval = (cx: number, rx: number, ry: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  // easel
  stroke(ctx, [v(x + 18, cy - R * 0.5), v(x + 84, groundY - 2)], '#8a5a2e', 6);
  stroke(ctx, [v(x + 12, cy + R * 0.3), v(x - 24, groundY - 2)], '#b9824a', 6);
  stroke(ctx, [v(x + 16, cy + R * 0.3), v(x + 38, groundY - 2)], '#a06d38', 6);
  // straw boss: a short cylinder behind the face
  oval(x + 14, R * FACE_K + 3, R + 4, '#b8975a');
  ctx.fillRect(x, cy - R - 4, 14, 2 * R + 8);
  oval(x, R * FACE_K + 3, R + 4, '#dcc08a');
  for (const [f, c] of RINGS) oval(x, R * f * FACE_K, R * f, c);
  if (pulse >= 0) {
    const r = BOARD.bull + 6 + pulse * 28;
    ctx.globalAlpha = 0.85 * (1 - pulse);
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x, cy, r * FACE_K + 2, r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
