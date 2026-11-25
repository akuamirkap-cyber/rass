import { Ctx, V, v, clamp, fromAngle, sub, shape, stroke, circle } from './util';

export const BRACE = 20; // distance grip -> string at rest
export const MAX_DRAW = 52; // extra pull at full draw
export const ARROW_LEN = 88;

/** world position of the nocking point for a bow held at `grip` */
export const nockPoint = (grip: V, angle: number, pull: number): V =>
  sub(grip, fromAngle(angle, BRACE + pull));

/**
 * Olympic recurve. Local space: +x is the shooting direction, grip at origin.
 * `pull` is how far (px) the string sits behind brace height – slightly
 * negative values are allowed for the forward overshoot after release.
 */
export function drawBow(ctx: Ctx, grip: V, angle: number, pull: number, vib = 0) {
  const d = clamp(pull / MAX_DRAW, -0.2, 1);
  const tx = -BRACE - 13 * d;
  const ty = 74 - 7 * d;
  ctx.save();
  ctx.translate(grip.x, grip.y);
  ctx.rotate(angle);

  // stabiliser + sight sit behind the riser
  stroke(ctx, [v(4, 10), v(60, 11.5)], '#1b1d22', 2.8, 'butt');
  shape(ctx, (p) => p.roundRect(57, 7.6, 10, 7.8, 2.4), '#3b4049');
  ctx.fillStyle = '#c9ced6';
  ctx.fillRect(52, 8.6, 2.4, 5.8);
  stroke(ctx, [v(2, 12), v(-13, 21)], '#1b1d22', 2.2);
  circle(ctx, v(-13.5, 21.3), 2.6, '#3b4049');
  stroke(ctx, [v(3, -15), v(25, -17)], '#1b1d22', 2, 'butt');
  stroke(ctx, [v(24, -16), v(24, -26)], '#1b1d22', 1.6, 'butt');
  ctx.beginPath();
  ctx.arc(24, -22, 3.6, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#1b1d22';
  ctx.stroke();
  circle(ctx, v(24, -22), 1.1, '#f97316');

  // limbs: darker belly pass, then the pale face on top
  const limbPath = (s: 1 | -1) => {
    ctx.beginPath();
    ctx.moveTo(3, -21 * s);
    ctx.quadraticCurveTo(11 - 7 * d, -52 * s, tx, -ty * s);
    ctx.quadraticCurveTo(tx - 2, -(ty + 6) * s, tx + 6, -(ty + 9) * s);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of [1, -1] as const) {
    limbPath(s);
    ctx.lineWidth = 5.2;
    ctx.strokeStyle = '#9a8150';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, -22 * s);
    ctx.quadraticCurveTo(12 - 7 * d, -52 * s, tx + 1, -(ty - 1) * s);
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = '#ecd9a4';
    ctx.stroke();
  }

  // string (with motion ghosts while it is still ringing)
  const nx = -BRACE - pull;
  const drawString = (x: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    stroke(ctx, [{ x: tx, y: -ty }, { x, y: 0 }, { x: tx, y: ty }], '#2a2c33', 1.25);
    ctx.globalAlpha = 1;
  };
  if (Math.abs(vib) > 0.4) {
    drawString(nx + vib, 0.22);
    drawString(nx - vib, 0.22);
  }
  drawString(nx, 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(nx - 6, -9, 12, 18);
  ctx.clip();
  stroke(ctx, [{ x: tx, y: -ty }, { x: nx, y: 0 }, { x: tx, y: ty }], '#f97316', 2.1);
  ctx.restore();

  // riser
  const riser = shape(
    ctx,
    (p) => {
      p.moveTo(5.5, -26);
      p.quadraticCurveTo(10.5, -13, 3.5, -8);
      p.lineTo(3.5, 8);
      p.quadraticCurveTo(10.5, 13, 5.5, 26);
      p.lineTo(-0.5, 26);
      p.quadraticCurveTo(-6.5, 13, -4.5, 8);
      p.lineTo(-4.5, -8);
      p.quadraticCurveTo(-6.5, -13, -0.5, -26);
      p.closePath();
    },
    '#2f62c9',
  );
  ctx.save();
  ctx.clip(riser);
  ctx.fillStyle = 'rgba(8,20,70,0.3)';
  ctx.fillRect(-8, 6, 8, 22);
  ctx.fillRect(-8, -28, 5.5, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(4.6, -27, 3, 16);
  ctx.restore();
  shape(ctx, (p) => p.roundRect(-4.6, -7.2, 8.2, 14.4, 2.6), '#17181c');
  ctx.fillStyle = '#d9dde3';
  ctx.fillRect(3.6, -4.6, 3.6, 1.8);
  ctx.restore();
}

export interface ArrowOpts {
  flex?: number; // sideways bend of the shaft (archer's paradox wobble)
  embed?: number; // px of the tip hidden inside whatever it hit
  alpha?: number;
}

/** A plain arrow: straight shaft, small steel head, two flat vanes. Local space: nock at origin, tip at +x. */
export function drawArrow(ctx: Ctx, nock: V, angle: number, o: ArrowOpts = {}) {
  const L = ARROW_LEN;
  const flex = o.flex ?? 0;
  ctx.save();
  ctx.translate(nock.x, nock.y);
  ctx.rotate(angle);
  ctx.globalAlpha *= o.alpha ?? 1;
  if (o.embed) {
    ctx.beginPath();
    ctx.rect(-12, -24, L - o.embed + 12, 48);
    ctx.clip();
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(L * 0.5, flex, L - 8, 0);
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#2b2d33';
  ctx.stroke();
  shape(ctx, (p) => { p.moveTo(L, 0); p.lineTo(L - 10, -2.6); p.lineTo(L - 10, 2.6); p.closePath(); }, '#8d96a0');
  shape(ctx, (p) => { p.moveTo(3, 0); p.lineTo(7, -3.4); p.lineTo(18, -3.4); p.lineTo(19, 0); p.closePath(); }, '#4b5059');
  shape(ctx, (p) => { p.moveTo(3, 0); p.lineTo(7, 3.4); p.lineTo(18, 3.4); p.lineTo(19, 0); p.closePath(); }, '#3a3e46');
  ctx.restore();
}

export function drawApple(ctx: Ctx, c: V, r: number, rotation = 0) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(rotation);
  const body = shape(
    ctx,
    (p) => {
      p.moveTo(0, -0.72 * r);
      p.bezierCurveTo(0.5 * r, -1.15 * r, 1.25 * r, -0.6 * r, 1.02 * r, 0.15 * r);
      p.bezierCurveTo(0.9 * r, 0.8 * r, 0.4 * r, 1.08 * r, 0, 0.92 * r);
      p.bezierCurveTo(-0.4 * r, 1.08 * r, -0.9 * r, 0.8 * r, -1.02 * r, 0.15 * r);
      p.bezierCurveTo(-1.25 * r, -0.6 * r, -0.5 * r, -1.15 * r, 0, -0.72 * r);
      p.closePath();
    },
    '#b3141f',
  );
  ctx.save();
  ctx.clip(body);
  circle(ctx, v(-0.28 * r, -0.25 * r), 1.08 * r, '#e3262d');
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.beginPath();
  ctx.ellipse(-0.45 * r, -0.3 * r, 0.16 * r, 0.3 * r, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  stroke(ctx, [{ x: 0, y: -0.7 * r }, { x: 0.12 * r, y: -1.3 * r }], '#5a3a1c', 2.2);
  shape(
    ctx,
    (p) => {
      p.moveTo(0.1 * r, -1.02 * r);
      p.quadraticCurveTo(0.55 * r, -1.75 * r, 1.15 * r, -1.3 * r);
      p.quadraticCurveTo(0.65 * r, -0.85 * r, 0.1 * r, -1.02 * r);
      p.closePath();
    },
    '#4fae35',
  );
  ctx.restore();
}

/** little rack the bow leans on before the archer picks it up */
export function drawStand(ctx: Ctx, x: number, groundY: number) {
  ctx.save();
  ctx.translate(x, groundY);
  shape(ctx, (p) => p.roundRect(-20, -6, 40, 6, 2), '#8a5a2e');
  shape(ctx, (p) => p.roundRect(-3.5, -64, 7, 60, 2), '#b9824a');
  ctx.fillStyle = 'rgba(70,35,10,0.28)';
  ctx.fillRect(0.5, -62, 3, 56);
  shape(ctx, (p) => p.roundRect(-13, -68, 17, 6, 3), '#2b2e36');
  shape(ctx, (p) => p.roundRect(-14, -75, 4.5, 11, 2), '#2b2e36');
  ctx.restore();
}

/* ---- level 3: apple launcher -------------------------------------------- */
export const LAUNCH_ANGLE = -2.0; // barrel direction (up and towards the archer)
export const launcherMuzzle = (x: number, groundY: number): V => {
  const d = fromAngle(LAUNCH_ANGLE, 50);
  return v(x - 4 + d.x, groundY - 46 + d.y);
};

/** `charge` 0..1 fills up before a throw, `recoil` 1..0 right after it */
export function drawLauncher(ctx: Ctx, x: number, groundY: number, charge: number, recoil: number, plates = false) {
  ctx.save();
  ctx.translate(x, groundY);
  // barrel
  ctx.save();
  ctx.translate(-4, -46);
  ctx.rotate(LAUNCH_ANGLE);
  ctx.translate(-recoil * 9, 0);
  shape(ctx, (p) => p.roundRect(-6, -12.5, 58, 25, 5), '#3b4049');
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-6, 2, 58, 10.5);
  shape(ctx, (p) => p.roundRect(44, -14.5, 9, 29, 3), '#565c68');
  ctx.restore();
  // hopper with spare apples (or a stack of glass plates)
  if (plates) {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#d3ecfa' : '#5fb2e0';
      ctx.beginPath();
      ctx.ellipse(21, -64 - i * 3.2, 15, 3.4, 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    drawApple(ctx, v(15, -66), 8, 0.4);
    drawApple(ctx, v(27, -62), 8, -0.5);
  }
  shape(
    ctx,
    (p) => {
      p.moveTo(2, -68);
      p.lineTo(40, -62);
      p.lineTo(30, -44);
      p.lineTo(8, -44);
      p.closePath();
    },
    '#c9ced6',
  );
  ctx.fillStyle = 'rgba(30,40,60,0.18)';
  ctx.beginPath();
  ctx.moveTo(22, -65);
  ctx.lineTo(40, -62);
  ctx.lineTo(30, -44);
  ctx.lineTo(20, -44);
  ctx.fill();
  // body
  const body = shape(ctx, (p) => p.roundRect(-36, -47, 72, 35, 9), '#f2a23a');
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = '#d98619';
  ctx.fillRect(-36, -24, 72, 14);
  ctx.fillStyle = '#17181c';
  ctx.fillRect(-36, -30, 72, 4);
  ctx.restore();
  // charge lamp
  const c = clamp(charge, 0, 1);
  circle(ctx, v(20, -38), 6, '#2b2e36');
  circle(ctx, v(20, -38), 4.2, c > 0.92 ? '#4ade80' : c > 0.05 ? '#fbbf24' : '#6b7280');
  if (c > 0.05 && c < 1) {
    ctx.beginPath();
    ctx.arc(20, -38, 8.5, -Math.PI / 2, -Math.PI / 2 + c * Math.PI * 2);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#fbbf24';
    ctx.stroke();
  }
  // wheels
  for (const wx of [-22, 22]) {
    circle(ctx, v(wx, -10), 10, '#25272d');
    circle(ctx, v(wx, -10), 4, '#9aa3ad');
  }
  ctx.restore();
}

/** his glasses, once they have left his face */
export function drawGlasses(ctx: Ctx, c: V, rotation: number, flip = 1) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(rotation);
  ctx.scale(flip, 1);
  circle(ctx, v(0, 0), 5.6, 'rgba(225,240,255,0.75)');
  ctx.beginPath();
  ctx.arc(0, 0, 5.6, 0, Math.PI * 2);
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = '#22252c';
  ctx.stroke();
  stroke(ctx, [v(-5.4, -0.4), v(-14, 1)], '#22252c', 1.7);
  stroke(ctx, [v(5.4, -0.4), v(7.5, 0.2)], '#22252c', 1.7);
  ctx.restore();
}
