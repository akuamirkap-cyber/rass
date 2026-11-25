import { Ctx, V, v, circle, shape, stroke } from './util';
import { drawApple } from './gear';

/* ---- level 10: balloons ------------------------------------------------------ */
export function drawBalloon(ctx: Ctx, c: V, r: number, color: string) {
  const ry = r * 1.18;
  const body = new Path2D();
  body.ellipse(c.x, c.y, r, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill(body);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + ry - 2);
  ctx.lineTo(c.x - 4.5, c.y + ry + 5);
  ctx.lineTo(c.x + 4.5, c.y + ry + 5);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = 'rgba(10,16,36,0.16)';
  ctx.beginPath();
  ctx.ellipse(c.x + r * 0.55, c.y + r * 0.5, r, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(c.x - r * 0.4, c.y - ry * 0.42, r * 0.16, ry * 0.26, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---- level 11: ducks ---------------------------------------------------------- */
/** `dir` 1 = flying right. `flap` rotates the wing, `rot` tumbles the whole bird */
export function drawDuck(ctx: Ctx, c: V, dir: number, flap: number, rot: number) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(rot);
  ctx.scale(dir, 1);
  shape(ctx, (p) => { p.moveTo(-15, -3); p.lineTo(-30, -12); p.lineTo(-23, 4); p.closePath(); }, '#f5b921');
  ctx.fillStyle = '#fcd34d';
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, v(17, -10), 9.5, '#fcd34d');
  shape(ctx, (p) => { p.moveTo(24, -12.5); p.lineTo(38, -8.5); p.lineTo(24, -5); p.closePath(); }, '#f97316');
  circle(ctx, v(19.5, -12.5), 1.9, '#1f2937');
  ctx.save();
  ctx.translate(-1, -5);
  ctx.rotate(flap);
  ctx.fillStyle = '#eaa514';
  ctx.beginPath();
  ctx.ellipse(-9, -1, 14.5, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/* ---- level 12: halfpipe + skateboard ------------------------------------------- */
/** wooden halfpipe: a circular arc of radius R whose lowest point sits 12 px above the floor */
export function drawRamp(ctx: Ctx, cx: number, groundY: number, R: number, lip: number) {
  const cy = groundY - R - 12;
  const lx = R * Math.sin(lip);
  const ly = cy + R * Math.cos(lip);
  const deck = 26;
  const body = new Path2D();
  body.moveTo(cx - lx - deck, ly);
  body.lineTo(cx - lx, ly);
  body.arc(cx, cy, R, Math.PI / 2 + lip, Math.PI / 2 - lip, true);
  body.lineTo(cx + lx + deck, ly);
  body.lineTo(cx + lx + deck, groundY);
  body.lineTo(cx - lx - deck, groundY);
  body.closePath();
  ctx.fillStyle = '#c58f52';
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = 'rgba(90,45,10,0.2)';
  for (let x = cx - lx - deck + 44; x < cx + lx + deck; x += 44) ctx.fillRect(x, ly, 2.5, groundY - ly);
  ctx.fillRect(cx - lx - deck, groundY - 7, 2 * (lx + deck), 7);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI / 2 + lip, Math.PI / 2 - lip, true);
  ctx.lineWidth = 5;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#e7cfa3';
  ctx.stroke();
  for (const s of [-1, 1]) circle(ctx, v(cx + s * lx, ly), 5.5, '#9aa3ad');
}

/** skateboard whose wheels touch the surface at `p` */
export function drawSkate(ctx: Ctx, p: V, ang: number) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  circle(ctx, v(-20, -4), 4, '#f59e0b');
  circle(ctx, v(20, -4), 4, '#f59e0b');
  shape(ctx, (q) => q.roundRect(-33, -11.5, 66, 4.5, 2.2), '#25272d');
  ctx.restore();
}

/* ---- level 13: flying saucer --------------------------------------------------- */
export function drawUfo(ctx: Ctx, c: V, tilt: number, flash: number, time: number, beam: boolean) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(tilt);
  // the pilot under his glass dome
  circle(ctx, v(0, -20), 13, '#86efac');
  ctx.fillStyle = '#14532d';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 5.2, -21, 3.2, 4.8, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(125,211,252,0.5)';
  ctx.beginPath();
  ctx.arc(0, -6, 37, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(-17, -27, 4, 9, 0.7, 0, Math.PI * 2);
  ctx.fill();
  // hull
  ctx.fillStyle = '#6b7280';
  ctx.beginPath();
  ctx.ellipse(0, 6, 96, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c3c9d1';
  ctx.beginPath();
  ctx.ellipse(0, -1, 96, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = beam ? '#4ade80' : '#374151';
  ctx.beginPath();
  ctx.ellipse(0, 19, 28, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = -2; i <= 2; i++) {
    circle(ctx, v(i * 34, 7 + (2 - Math.abs(i)) * 1.5), 4, (Math.floor(time * 5) + i + 10) % 2 ? '#fbbf24' : '#ef4444');
  }
  if (flash > 0.02) {
    ctx.globalAlpha *= flash;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 2, 98, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawBeam(ctx: Ctx, top: V, groundY: number, alpha: number) {
  ctx.fillStyle = `rgba(74,222,128,${alpha})`;
  ctx.beginPath();
  ctx.moveTo(top.x - 26, top.y);
  ctx.lineTo(top.x + 26, top.y);
  ctx.lineTo(top.x + 74, groundY);
  ctx.lineTo(top.x - 74, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(top.x, groundY, 74, 9, 0, 0, Math.PI * 2);
  ctx.fill();
}

/* ---- level 14: wall + steel plate ---------------------------------------------- */
export function drawWoodWall(ctx: Ctx, x0: number, x1: number, groundY: number, h: number) {
  const y = groundY - h;
  ctx.fillStyle = '#c58f52';
  ctx.fillRect(x0, y, x1 - x0, h);
  ctx.fillStyle = 'rgba(90,45,10,0.24)';
  for (let yy = y + 24; yy < groundY - 5; yy += 24) ctx.fillRect(x0, yy, x1 - x0, 2.5);
  ctx.fillRect(x1 - 4, y, 4, h);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(x0, y, x1 - x0, 3);
}

/** steel plate from a to b on a post; `n` is the unit normal of its shiny face */
export function drawSteel(ctx: Ctx, a: V, b: V, n: V, base: V, flash: number) {
  const mid = v((a.x + b.x) / 2, (a.y + b.y) / 2);
  stroke(ctx, [base, v(base.x, mid.y + 12), mid], '#565c68', 6);
  shape(ctx, (p) => p.roundRect(base.x - 22, base.y - 8, 44, 8, 3), '#3b4049');
  stroke(ctx, [a, b], '#7b8491', 11, 'butt');
  stroke(ctx, [v(a.x + n.x * 3.5, a.y + n.y * 3.5), v(b.x + n.x * 3.5, b.y + n.y * 3.5)], '#e5e7eb', 4, 'butt');
  circle(ctx, a, 3, '#3b4049');
  circle(ctx, b, 3, '#3b4049');
  if (flash > 0.02) {
    ctx.save();
    ctx.globalAlpha = flash;
    stroke(ctx, [a, b], '#ffffff', 15, 'butt');
    ctx.restore();
  }
}

/* ---- level 15: ferris wheel ----------------------------------------------------- */
/** six hanging seats; the floor of each one is `drop` px below its pivot on the rim */
export function drawFerris(ctx: Ctx, c: V, R: number, ang: number, groundY: number, drop: number) {
  stroke(ctx, [c, v(c.x - 96, groundY - 4)], '#7b8491', 9);
  stroke(ctx, [c, v(c.x + 96, groundY - 4)], '#5f6873', 9);
  shape(ctx, (p) => p.roundRect(c.x - 122, groundY - 9, 244, 9, 3), '#3b4049');
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#e2572b';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c.x, c.y, R * 0.62, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f2a23a';
  ctx.stroke();
  const pivots: V[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ang + (i * Math.PI) / 3;
    pivots.push(v(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R));
    stroke(ctx, [c, pivots[i]], '#aab3bd', 3);
  }
  circle(ctx, c, 14, '#2b2e36');
  circle(ctx, c, 5.5, '#f2a23a');
  const cols = ['#3b82f6', '#fbbf24', '#22c55e', '#ef4444', '#a855f7', '#14b8a6'];
  pivots.forEach((p, i) => {
    const fy = p.y + drop;
    stroke(ctx, [v(p.x - 31, fy), p, v(p.x + 31, fy)], '#565c68', 2.6);
    shape(ctx, (q) => q.roundRect(p.x - 37, fy, 74, 9, 3.5), cols[i]);
    circle(ctx, p, 5, '#2b2e36');
  });
}

/* ---- level 16: the Apple King ---------------------------------------------------- */
export function drawBoss(ctx: Ctx, c: V, r: number, sx: number, sy: number, hurt: boolean, roar: boolean) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(sx, sy);
  drawApple(ctx, v(0, 0), r, 0);
  // crown
  shape(ctx, (p) => {
    p.moveTo(-0.46 * r, -0.86 * r);
    p.lineTo(-0.52 * r, -1.4 * r);
    p.lineTo(-0.24 * r, -1.1 * r);
    p.lineTo(0, -1.5 * r);
    p.lineTo(0.24 * r, -1.1 * r);
    p.lineTo(0.52 * r, -1.4 * r);
    p.lineTo(0.46 * r, -0.86 * r);
    p.closePath();
  }, '#fbbf24');
  ctx.fillStyle = '#d97706';
  ctx.fillRect(-0.46 * r, -0.97 * r, 0.92 * r, 0.11 * r);
  for (const x of [-0.26, 0, 0.26]) circle(ctx, v(x * r, -0.915 * r), 0.04 * r, '#ef4444');
  // face – he glares at the archer on the left
  const fx = -0.14 * r;
  const ink = '#3b0a0d';
  for (const s of [-1, 1]) {
    const ex = fx + s * 0.3 * r;
    const ey = -0.14 * r;
    if (hurt) {
      stroke(ctx, [v(ex - s * 0.12 * r, ey - 0.1 * r), v(ex + s * 0.1 * r, ey), v(ex - s * 0.12 * r, ey + 0.1 * r)], ink, 0.05 * r);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 0.16 * r, 0.19 * r, 0, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, v(ex - 0.06 * r, ey + 0.02 * r), 0.075 * r, '#1f2937');
    }
    stroke(ctx, [v(ex + s * 0.24 * r, ey - 0.36 * r), v(ex - s * 0.14 * r, ey - 0.2 * r)], ink, 0.075 * r);
  }
  if (roar || hurt) {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(fx, 0.38 * r, 0.26 * r, 0.19 * r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(fx - 0.115 * r, 0.215 * r, 0.23 * r, 0.065 * r);
  } else {
    ctx.beginPath();
    ctx.arc(fx, 0.62 * r, 0.26 * r, Math.PI * 1.2, Math.PI * 1.8);
    ctx.lineWidth = 0.06 * r;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  ctx.restore();
}
