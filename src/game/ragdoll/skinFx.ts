import { Ctx, V } from '../util';
import { SKIN_PERKS, SKIN_RULES } from './config';
import type { SkinShot } from './skinPerks';

/** Extra equipment effects never replace the bow or its elemental rendering. */
export function drawSkinShot(ctx: Ctx, p: V, vel: V, shot: SkinShot, time: number) {
  const def = SKIN_PERKS[shot.id]; const f = SKIN_RULES.fx;
  const active = shot.proc || shot.burnDps > 0;
  const dx = -vel.x * f.trailSeconds; const dy = -vel.y * f.trailSeconds;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length; const ny = dx / length;
  ctx.save();
  ctx.globalAlpha *= active ? f.chargedAlpha : f.trailAlpha;
  const gradient = ctx.createLinearGradient(p.x, p.y, p.x + dx, p.y + dy);
  gradient.addColorStop(0, active ? SKIN_RULES.neutral : def.color);
  gradient.addColorStop(1, `${def.color}00`);
  ctx.strokeStyle = gradient; ctx.lineWidth = active ? f.chargedWidth : f.trailWidth;
  ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y);
  for (let i = 1; i <= f.lightningSteps; i++) {
    const u = i / f.lightningSteps;
    const wave = active && (def.trail === 'lightning' || shot.burnDps > 0) ? Math.sin(time * f.waveSpeed + i * Math.PI) * f.waveSize * Math.sin(u * Math.PI) : 0;
    ctx.lineTo(p.x + dx * u + nx * wave, p.y + dy * u + ny * wave);
  }
  ctx.stroke();
  if (active && (def.trail === 'slash' || def.trail === 'shadow')) {
    ctx.strokeStyle = def.color; ctx.lineWidth = f.trailWidth;
    ctx.beginPath(); ctx.moveTo(p.x + nx * f.waveSize, p.y + ny * f.waveSize);
    ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
  }
  ctx.restore();
}