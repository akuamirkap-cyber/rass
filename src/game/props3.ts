import { Ctx, V, v, circle, shape, stroke } from './util';

/* ---- level 17: the moon ------------------------------------------------------- */
/** glass bubble around a head */
export function drawHelmet(ctx: Ctx, c: V, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(186,230,253,0.3)';
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = 'rgba(96,165,214,0.75)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c.x, c.y, r - 5, -2.5, -1.5);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  shape(ctx, (p) => p.roundRect(c.x - r * 0.62, c.y + r * 0.8, r * 1.24, 7, 3.5), '#cbd5e1');
  ctx.restore();
}

export function drawEarth(ctx: Ctx, c: V, r: number) {
  const blob = (dx: number, dy: number, rx: number, ry: number, rot: number) => {
    ctx.beginPath();
    ctx.ellipse(c.x + dx * r, c.y + dy * r, rx * r, ry * r, rot, 0, Math.PI * 2);
    ctx.fill();
  };
  circle(ctx, c, r, '#3b82f6');
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#22c55e';
  blob(-0.3, -0.25, 0.42, 0.3, 0.4);
  blob(0.42, 0.3, 0.3, 0.4, -0.3);
  blob(-0.1, 0.72, 0.36, 0.18, 0);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  blob(0.15, -0.55, 0.5, 0.09, -0.2);
  blob(-0.38, 0.2, 0.4, 0.07, 0.2);
  // night side: everything outside a circle shifted towards the light
  ctx.fillStyle = 'rgba(10,16,36,0.2)';
  ctx.beginPath();
  ctx.rect(c.x - r, c.y - r, 2 * r, 2 * r);
  ctx.arc(c.x - r * 0.32, c.y - r * 0.32, r * 1.04, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.restore();
}

/** shallow dent in the floor */
export function drawCrater(ctx: Ctx, x: number, groundY: number, w: number) {
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.ellipse(x, groundY + 1, w, w * 0.2, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#d5d9e0';
  ctx.beginPath();
  ctx.ellipse(x, groundY + 1, w * 0.72, w * 0.1, 0, 0, Math.PI);
  ctx.fill();
}

/** red-and-white flag, held out by a rod because there is no wind up here */
export function drawFlag(ctx: Ctx, x: number, groundY: number) {
  stroke(ctx, [v(x, groundY), v(x, groundY - 96)], '#9aa3ad', 3, 'butt');
  ctx.fillStyle = '#e3262d';
  ctx.fillRect(x + 1.5, groundY - 96, 48, 15);
  ctx.fillStyle = '#eceef1';
  ctx.fillRect(x + 1.5, groundY - 81, 48, 15);
  circle(ctx, v(x, groundY - 97), 3, '#6b7280');
}

/* ---- level 18: giant magnet ----------------------------------------------------- */
/** horseshoe magnet hanging on a chain; `a` is the point between its two poles */
export function drawMagnet(ctx: Ctx, a: V, on: boolean, progress: number, time: number, blue = false, chain = 3000) {
  const R = 30;
  const cy = a.y - 60;
  const top = cy - R - 12;
  stroke(ctx, [v(a.x, top), v(a.x, top - chain)], '#7b8491', 4, 'butt');
  if (on) {
    // field lines: creeping inwards while it pulls, outwards while it pushes
    ctx.save();
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = time * (blue ? -46 : 46);
    ctx.lineWidth = 2;
    ctx.strokeStyle = blue ? 'rgba(37,99,235,0.28)' : 'rgba(220,38,38,0.26)';
    for (const r of [80, 150, 220, 290]) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x - R, a.y - 6);
  ctx.lineTo(a.x - R, cy);
  ctx.arc(a.x, cy, R, Math.PI, 0);
  ctx.lineTo(a.x + R, a.y - 6);
  ctx.lineWidth = 24;
  ctx.strokeStyle = blue ? '#2563eb' : '#dc2626';
  ctx.stroke();
  ctx.fillStyle = '#d1d5db';
  ctx.fillRect(a.x - R - 12, a.y - 26, 24, 20);
  ctx.fillRect(a.x + R - 12, a.y - 26, 24, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(a.x - R + 4, a.y - 26, 8, 20);
  ctx.fillRect(a.x + R + 4, a.y - 26, 8, 20);
  ctx.beginPath();
  ctx.arc(a.x, cy, R + 6, Math.PI * 1.1, Math.PI * 1.5);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.stroke();
  // lamp with a ring that counts down to the next switch
  circle(ctx, v(a.x, top), 10, '#2b2e36');
  circle(ctx, v(a.x, top), 6.5, on ? (blue ? '#60a5fa' : '#f87171') : '#6b7280');
  ctx.beginPath();
  ctx.arc(a.x, top, 14.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0, progress)));
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = on ? (blue ? '#3b82f6' : '#ef4444') : '#22c55e';
  ctx.stroke();
  if (on) {
    for (let i = 0; i < 3; i++) {
      const ph = time * 23 + i * 2.1;
      const x0 = a.x - 20 + i * 20;
      stroke(
        ctx,
        [
          v(x0, a.y - 2), v(x0 + 7 * Math.sin(ph), a.y + 11),
          v(x0 - 6 * Math.cos(ph * 1.3), a.y + 23), v(x0 + 5 * Math.sin(ph * 0.7), a.y + 36),
        ],
        blue ? '#93c5fd' : '#fbbf24',
        2.4,
      );
    }
  }
}

/* ---- level 19: portals ----------------------------------------------------------- */
/** a portal seen edge-on: a tall narrow ring. `flash` 1..0 right after something went through */
export function drawPortal(ctx: Ctx, c: V, half: number, col: string, light: string, time: number, flash: number) {
  const oval = (rx: number, ry: number) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  };
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = light;
  oval(19, half + 9);
  ctx.fill();
  ctx.globalAlpha = 1;
  oval(9, half - 4);
  ctx.fill();
  oval(11, half);
  ctx.lineWidth = 5.5;
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < 3; i++) {
    const a0 = time * 3 + i * 2.09;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5, (half - 12) * (0.4 + 0.27 * i), 0, a0, a0 + 1.6);
    ctx.stroke();
  }
  // centre mark: what goes in at this height comes out at the other one's mark
  shape(ctx, (p) => { p.moveTo(-6, 0); p.lineTo(0, -6); p.lineTo(6, 0); p.lineTo(0, 6); p.closePath(); }, col);
  if (flash > 0.02) {
    ctx.globalAlpha = flash;
    ctx.fillStyle = '#ffffff';
    oval(16 + (1 - flash) * 16, half + 6 + (1 - flash) * 20);
    ctx.fill();
  }
  ctx.restore();
}

/* ---- levels 21-30: variations ------------------------------------------------------ */
/** rail with a trolley that carries the travelling magnet */
export function drawRail(ctx: Ctx, x0: number, x1: number, y: number, cartX: number) {
  ctx.fillStyle = '#7b8491';
  ctx.fillRect(x0 - 5, y - 3000, 10, 3000);
  ctx.fillRect(x1 - 5, y - 3000, 10, 3000);
  shape(ctx, (p) => p.roundRect(x0 - 12, y - 6, x1 - x0 + 24, 12, 4), '#565c68');
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x0 - 8, y - 5, x1 - x0 + 16, 3);
  shape(ctx, (p) => p.roundRect(cartX - 22, y - 13, 44, 26, 6), '#f2a23a');
  circle(ctx, v(cartX - 12, y), 5, '#2b2e36');
  circle(ctx, v(cartX + 12, y), 5, '#2b2e36');
}

export function drawHole(ctx: Ctx, c: V, r: number, time: number) {
  ctx.save();
  ctx.translate(c.x, c.y);
  const fills = ['#7c3aed', '#a78bfa', '#ddd6fe', '#f3e8ff'];
  for (let i = 3; i >= 0; i--) {
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (1.5 + i * 0.6), r * (0.6 + i * 0.22), -0.35, 0, Math.PI * 2);
    ctx.fillStyle = fills[i];
    ctx.globalAlpha = [0.95, 0.7, 0.55, 0.45][i];
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // matter spiralling in
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#fbbf24';
  for (let i = 0; i < 4; i++) {
    const a0 = time * 2.6 + i * 1.57;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (1.3 + 0.38 * i), r * (0.52 + 0.14 * i), -0.35, a0, a0 + 0.9);
    ctx.stroke();
  }
  circle(ctx, v(0, 0), r, '#0b0f1a');
  ctx.beginPath();
  ctx.arc(0, 0, r + 1.5, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f59e0b';
  ctx.stroke();
  ctx.restore();
}

/** funnel and pipe above a portal in the sky: whatever comes out falls straight down */
export function drawFunnel(ctx: Ctx, c: V, half: number) {
  ctx.fillStyle = '#7b8491';
  ctx.fillRect(c.x - 19, c.y - 3000, 38, 2940);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(c.x + 5, c.y - 3000, 14, 2940);
  shape(
    ctx,
    (p) => {
      p.moveTo(c.x - half - 14, c.y - 3);
      p.lineTo(c.x + half + 14, c.y - 3);
      p.lineTo(c.x + 19, c.y - 62);
      p.lineTo(c.x - 19, c.y - 62);
      p.closePath();
    },
    '#9aa3ad',
  );
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.beginPath();
  ctx.moveTo(c.x + 4, c.y - 3);
  ctx.lineTo(c.x + half + 14, c.y - 3);
  ctx.lineTo(c.x + 19, c.y - 62);
  ctx.lineTo(c.x + 4, c.y - 62);
  ctx.closePath();
  ctx.fill();
}
