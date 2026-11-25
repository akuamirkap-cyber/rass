import { useEffect, useRef, useState } from 'react';
import { Ctx, V, v, add, mul, damp, dist, fromAngle } from './game/util';
import { BowId, Slab2, Stick, StickLook, angLerp, drawArrow, drawBow, drawStick, fireAngle, impulse, makeStick, onString, stepStick } from './game/ragdoll/stick';
import { HEAD_STYLES, Hair, HeadStyle, drawHead, drawHeadBack, makeHair, stepHair } from './game/ragdoll/head';
import { audioInit, snd } from './game/ragdoll/audio';
import { HAIR_ART, REFINED_HAIR, SKIN_PERKS, SKIN_RULES, SkinId, skinPerkName } from './game/ragdoll/config';
import { isRefinedHair } from './game/ragdoll/haircuts';
import { SkinRuntime, SkinShot, newSkinRuntime, skinPerkLines, skinReloadMult, takeSkinShot } from './game/ragdoll/skinPerks';
import { drawSkinShot } from './game/ragdoll/skinFx';
import { tx, useLang } from './i18n';

export interface SkinMeta { id: HeadStyle; name: string; nameId: string; tag: string; tagId: string; desc: string; descId: string; accent: string }

/** Appearance metadata; gameplay bonuses and unlock requirements live in config.ts. */
export const SKIN_LIST: SkinMeta[] = [
  { id: 'band', name: 'NINJA HEADBAND', nameId: 'IKAT NINJA', tag: 'CLASSIC', tagId: 'KLASIK', accent: '#ff6b5e', desc: 'Red headband with two flowing cloth tails. The original look of the archer.', descId: 'Ikat kepala merah dengan dua ekor kain yang berkibar. Tampilan asli sang pemanah.' },
  { id: 'guts', name: 'GUTS HAIR', nameId: 'RAMBUT GUTS', tag: 'BERSERKER · BERSERK', tagId: 'BERSERKER · BERSERK', accent: '#dfe8f7', desc: 'Voluminous obsidian spiked crown with Berserker silver-white tufts and sharp flowing white & black bangs.', descId: 'Mahkota rambut duri berlapis hitam-obsidian bervolume dengan rumpun duri putih-perak Berserker serta untaian poni pita putih & hitam melengkung tajam yang menjuntai luwes.' },
  { id: 'luffy', name: 'LUFFY HAIR', nameId: 'RAMBUT LUFFY', tag: 'CAPTAIN · ONE PIECE', tagId: 'KAPTEN · ONE PIECE', accent: '#75b8ff', desc: 'Monkey D. Luffy’s signature messy black hair with lively swaying bangs and the two-stitch scar below his eye.', descId: 'Rambut hitam acak berlapis khas Monkey D. Luffy dengan poni melengkung yang berayun lincah di dahi serta bekas luka dua jahitan di bawah mata.' },
  { id: 'sanji', name: 'SANJI HAIR', nameId: 'RAMBUT SANJI', tag: 'BLACK LEG · ONE PIECE', tagId: 'BLACK LEG · ONE PIECE', accent: '#ffd93b', desc: 'Vinsmoke Sanji’s golden-blonde V-parted hair with sweeping side bangs and a sharp spiral eyebrow.', descId: 'Rambut kuning-emas berbelah V khas Vinsmoke Sanji dengan guratan untaian berlapis meruncing dari pelipis hingga tengkuk, tirai poni miring, dan alis spiral tajam.' },
  { id: 'sephiroth', name: 'SEPHIROTH HAIR', nameId: 'RAMBUT SEPHIROTH', tag: 'LONG SILVER · FLUID PHYSICS', tagId: 'PERAK PANJANG · FISIKA LUWES', accent: '#dfe6f2', desc: 'Long layered silver mane with twin face-framing bangs that cascade smoothly into silky waves under gravity.', descId: 'Surai perak panjang berlapis dengan poni kembar khas yang membingkai wajah. Jatuh rapi di bawah gravitasi dan mengalir luwes membentuk gelombang sutra.' },
  { id: 'sekiro', name: 'SEKIRO HAIR', nameId: 'RAMBUT SEKIRO', tag: 'SHINOBI WOLF · FLOWING', tagId: 'SHINOBI SERIGALA · LUWES', accent: '#c9a98f', desc: 'Wolf’s shinobi look: curved layered ponytail bound with white motoyui cord, silver streaks on the brow, and swaying cheek strands.', descId: 'Gaya rambut Wolf (Sekiro): kuncir serigala melengkung berlapis dengan ikat kain putih (motoyui), semburat uban perak di dahi, dan anak rambut pipi yang berayun luwes.' },
  { id: 'racer', name: 'RACER HELMET', nameId: 'HELM PEMBALAP', tag: 'FULL-FACE AERO', tagId: 'FULL-FACE AERODINAMIS', accent: '#ff7a6a', desc: 'Aerodynamic MotoGP/F1 full-face racing helmet with sculpted chin guard, hinged dark visor, and racing stripes.', descId: 'Helm balap full-face aerodinamis ala MotoGP/F1 dengan pelindung dagu maju, karet leher miring tegas, visor gelap berengsel samping, dan striping balap.' },
  { id: 'robin', name: 'ROBIN HOOD HAT', nameId: 'TOPI ROBIN HOOD', tag: 'FOREST ARCHER', tagId: 'PEMANAH HUTAN', accent: '#5fe07a', desc: 'Pointed forest-green cap adorned with a red feather that bobs whenever you move or loose an arrow.', descId: 'Topi hijau berujung lancip dengan bulu merah yang melambai tiap kamu bergerak atau melepas panah.' },
  { id: 'cowboy', name: 'COWBOY HAT', nameId: 'TOPI KOBOI', tag: 'WILD WEST', tagId: 'WILD WEST', accent: '#e3b77a', desc: 'Wide-brimmed brown cowboy hat with a ribbon band and gold buckle. Keen eyes peer from beneath the brim.', descId: 'Topi koboi cokelat bertepi lebar, lengkap dengan pita dan gesper emas. Matanya mengintip dari bawah tepi topi.' },
  { id: 'punk', name: 'PUNK MOHAWK', nameId: 'RAMBUT PUNK', tag: 'MOHAWK', tagId: 'MOHAWK', accent: '#ff6fb5', desc: 'Spiky neon-pink mohawk that tilts dynamically back and forth with every movement of your head.', descId: 'Mohawk merah muda runcing yang ikut condong ke belakang saat kepalamu bergerak.' },
  { id: 'saiyan', name: 'SUPER SAIYAN HAIR', nameId: 'RAMBUT SUPER SAIYAN', tag: 'GOLDEN AURA · DRAGON BALL', tagId: 'AURA EMAS · DRAGON BALL', accent: '#ffd93b', desc: 'Spiking golden locks with sharp bangs and amber shading. Its subtle aura intensifies while aiming.', descId: 'HELAI EMAS MENJULANG, PONI TAJAM, DAN BAYANGAN AMBER. AURA LEMBUT MENGUAT SAAT MEMBIDIK.' },
  { id: 'gojo', name: 'GOJO HAIR', nameId: 'RAMBUT GOJO', tag: 'SIX EYES · JUJUTSU KAISEN', tagId: 'SIX EYES · JUJUTSU KAISEN', accent: '#9fe8ff', desc: 'Layered white hair with a black cloth blindfold. The fabric sways smoothly while blue light glints on aim.', descId: 'RAMBUT PUTIH BERLAPIS DAN PENUTUP MATA KAIN HITAM. IKATAN BERGERAK HALUS, KILAU BIRU MUNCUL SAAT MEMBIDIK.' },
  { id: 'sasuke', name: 'SASUKE HAIR', nameId: 'RAMBUT SASUKE', tag: 'SHARINGAN · NARUTO', tagId: 'SHARINGAN · NARUTO', accent: '#ff4b4b', desc: 'Blue-black spiky hair with sharp back tips and face-framing bangs. Crimson Sharingan tracks your gaze.', descId: 'RAMBUT HITAM KEBIRUAN, UJUNG BELAKANG TAJAM, DAN PONI PEMBINGKAI WAJAH. SHARINGAN MERAH MENGIKUTI GERAK MATA.' },
  { id: 'levi', name: 'LEVI HAIR', nameId: 'RAMBUT LEVI', tag: 'UNDERCUT · ATTACK ON TITAN', tagId: 'UNDERCUT · ATTACK ON TITAN', accent: '#b8c7d9', desc: 'Clean undercut with center part and layered bangs. Crisp silhouette, matte texture, nimble motion.', descId: 'UNDERCUT HALUS DENGAN BELAHAN TENGAH DAN PONI BERLAPIS. SILUET RAPI, TEKSTUR MATTE, GERAK RINGAN.' },
  { id: 'jinwoo', name: 'JINWOO HAIR', nameId: 'RAMBUT JINWOO', tag: 'SHADOW MONARCH / SOLO LEVELING', tagId: 'RAJA BAYANGAN / SOLO LEVELING', accent: '#b1a1f3', desc: 'Layered tousled dark hair with sharp bangs, violet-blue sheen, and the Shadow Monarch’s piercing gaze.', descId: 'RAMBUT HITAM ACAK BERLAPIS, PONI TAJAM, DAN KILAU UNGU KEBIRUAN. TATAPAN RAJA BAYANGAN.' },
  { id: 'vergil', name: 'VERGIL HAIR', nameId: 'RAMBUT VERGIL', tag: 'SON OF SPARDA / DEVIL MAY CRY', tagId: 'PUTRA SPARDA / DEVIL MAY CRY', accent: '#c5e3f7', desc: 'Slicked-back silver hair with a bold hairline. Crisp strands, sharp silhouette, and a cold stare.', descId: 'RAMBUT PERAK DISISIR KE BELAKANG DENGAN GARIS RAMBUT TEGAS. HELAI RAPI, SILUET TAJAM, TATAPAN DINGIN.' },
  { id: 'gojo_blue', name: 'GOJO SIX EYES', nameId: 'RAMBUT GOJO SIX EYES', tag: 'UNMASKED / BLUE EYES', tagId: 'TANPA PENUTUP MATA / MATA BIRU', accent: '#75d9ff', desc: 'Soft white bangs without blindfold. Crystalline blue Six Eyes with luminous iris reflections tracking your aim.', descId: 'PONI PUTIH LEMBUT TANPA PENUTUP MATA. IRIS BIRU KRISTAL BERLAPIS, SERAT CAHAYA, DAN PANTULAN BENING YANG MENGIKUTI TATAPAN.' },
  { id: 'rengoku', name: 'RENGOKU HAIR', nameId: 'RAMBUT RENGOKU', tag: 'FLAME HASHIRA / DEMON SLAYER', tagId: 'PILAR API / DEMON SLAYER', accent: '#ffb94f', desc: 'Wavy golden mane with blazing crimson tips, flame bangs, amber eyes, and flowing long locks.', descId: 'SURAI EMAS BERGELOMBANG DENGAN UJUNG MERAH MENYALA. PONI API, MATA AMBER, DAN HELAI PANJANG YANG BERGERAK LEMBUT.' },
];

const H = 1 / 120;
const SLABS: Slab2[] = [{ x0: -60, x1: 60, top: 0, bot: 30 }];
const lookOf = (style: HeadStyle): StickLook => ({
  color: '#000000', rim: '#1c5566', eye: '#ffffff', helm: false, crown: false, band: style === 'band' ? '#e5352f' : null, quiver: true,
});

/** subtle crescent motion-blur trail when spinning the bow during a freestyle victory flourish */
export function drawVictoryBowBlur(ctx: Ctx, k: Stick) {
  if (!k.victory || k.victory <= 0) return;
  const vt = k.victory;
  const style = (k.victoryStyle ?? 0) % 3;
  const spinning =
    (style === 0 && vt > 0.35 && vt < 1.52) ||
    (style === 1 && vt > 0.05 && vt < 1.08) ||
    (style === 2 && vt > 0.05 && vt < 0.85);
  if (!spinning) return;
  const grip = k.p[4];
  const s = k.s;
  ctx.save();
  ctx.translate(grip.x, grip.y);
  ctx.rotate(k.bowAng);
  ctx.scale(s, s);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255, 224, 115, 0.42)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(0, 0, 32, -1.25, 1.25);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(130, 244, 255, 0.36)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.arc(0, 0, 32, Math.PI - 1.15, Math.PI + 1.15);
  ctx.stroke();
  ctx.restore();
}

/** the archer wearing a skin, layered exactly as the game draws him: long hair behind him, then him, then the rest */
export function drawSkinFigure(ctx: Ctx, k: Stick, style: HeadStyle, hair: Hair | null, t: number, bow: BowId | null) {
  drawHeadBack(ctx, k, style, hair);
  drawStick(ctx, k, lookOf(style), bow ? () => {
    drawVictoryBowBlur(ctx, k);
    drawBow(ctx, k.p[4], k.bowAng, k.s, onString(k) ? dist(k.p[4], k.p[6]) : null, 0, !(k.victory && k.victory > 0) && k.nock >= 1, bow, t);
  } : undefined);
  drawHead(ctx, k, style, hair, t);
}

/** a stickman who has stood a moment in the breeze, so his hair hangs the way it will in the game */
export function settledFigure(style: HeadStyle): { k: Stick; hair: Hair | null } {
  const k = makeStick(v(0, 0), 1, 1, false, true);
  if (isRefinedHair(style)) k.seed = HAIR_ART.thumbnail.seed;
  const hair = makeHair(style, k);
  for (let i = 0; i < 300; i++) {
    k.base = v(0, 0); k.vigor = 1; k.muscle = 1; k.nock = 1;
    stepStick(k, SLABS);
    if (hair) stepHair(k, hair);
  }
  return { k, hair };
}

/** a head-and-shoulders portrait of a skin, painted into a square of `S` px */
export function paintSkinThumb(ctx: Ctx, S: number, style: HeadStyle) {
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#0c5c78'); g.addColorStop(1, '#2fd0d8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const { k, hair } = settledFigure(style);
  const refined = isRefinedHair(style);
  const art = refined ? { ...HAIR_ART.thumbnail, ...REFINED_HAIR[style].portrait } : HAIR_ART.thumbnail;
  const Z = S / (refined ? art.worldSize : 60);
  ctx.save();
  ctx.translate((refined ? S * art.centerX : S / 2 + 3) - k.p[0].x * Z, S * (refined ? art.centerY : 0.57) - k.p[0].y * Z); ctx.scale(Z, Z);
  drawSkinFigure(ctx, k, style, hair, 1.2, null);
  ctx.restore();
}
function skinThumb(style: HeadStyle): string {
  if (typeof document === 'undefined') return '';
  const S = 112; const c = document.createElement('canvas');
  c.width = S * 2; c.height = S * 2;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.scale(2, 2);
  paintSkinThumb(ctx, S, style);
  return c.toDataURL('image/png');
}

interface Shot { p: V; vel: V; life: number; skin?: SkinShot }

/** the preview stage: a strip of the forest, his ground, and him - close up */
export function paintSkinStage(ctx: Ctx, w: number, h: number, dpr: number, k: Stick, style: HeadStyle, hair: Hair | null, t: number, bow: BowId, arrows: Shot[]) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a4767'); g.addColorStop(0.62, '#0f8097'); g.addColorStop(1, '#37ebf1');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(w * 0.77, h * 0.26, m * 0.21, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w * 0.77, h * 0.26, m * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(7,95,116,0.5)';
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h * 0.8); ctx.quadraticCurveTo(w * 0.3, h * 0.64, w * 0.56, h * 0.8); ctx.quadraticCurveTo(w * 0.8, h * 0.92, w, h * 0.72); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  const Z = Math.min(w / 180, h / 178);
  ctx.translate(w * 0.5 + 4 * Z, h * 0.86); ctx.scale(Z, Z);
  const glow = ctx.createLinearGradient(0, 30, 0, 68);
  glow.addColorStop(0, 'rgba(150,255,250,0.28)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow; ctx.fillRect(-31, 30, 62, 38);
  ctx.fillStyle = '#0a3b48'; ctx.fillRect(-36, 0, 72, 30);
  ctx.fillStyle = '#11596a'; ctx.fillRect(-36, 0, 72, 3.5);
  drawSkinFigure(ctx, k, style, hair, t, bow);
  if (SKIN_PERKS[style].signature.kind === 'barrier') {
    const f = SKIN_RULES.fx;
    ctx.save(); ctx.globalAlpha = f.barrierAlpha; ctx.lineWidth = f.trailWidth; ctx.strokeStyle = SKIN_PERKS[style].color;
    ctx.beginPath(); ctx.arc(k.p[1].x, k.p[1].y, f.barrierRadius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  for (const a of arrows) {
    if (a.skin) drawSkinShot(ctx, a.p, a.vel, a.skin, t);
    drawArrow(ctx, a.p, Math.atan2(a.vel.y, a.vel.x), 1, false, bow, t);
  }
}

/** one 120 Hz step of the preview: he stands, draws and looses, or performs his charismatic victory freestyle! */
export function stepSkinStage(sim: { k: Stick; hair: Hair | null; cyc: number; arrows: Shot[]; skin?: SkinId; perks?: SkinRuntime }) {
  const k = sim.k;
  const style = sim.skin ?? sim.hair?.style ?? 'band';
  const perks = sim.perks ??= newSkinRuntime();
  sim.cyc += H;
  k.base = v(0, 0); k.vigor = 1; k.muscle = Math.min(1, k.muscle + H * 1.1);

  if (k.victory && k.victory > 0) {
    k.victory += H;
    k.aiming = 0; k.pull = 0;
    if (k.victory > 3.2) {
      k.victory = 0;
      sim.cyc = 0.2;
    }
  } else {
    const c = sim.cyc % 4.4;
    if (k.nock < 1) k.nock = Math.min(1, k.nock + H * skinReloadMult(style) / SKIN_RULES.reloadSeconds);
    if (c > 1.5 && c < 3.2) {
      k.aim = angLerp(k.aim, -0.34, 1 - Math.exp(-10 * H));
      k.aiming = damp(k.aiming, 1, 9, H);
      if (k.aiming > 0.6 && onString(k)) k.pull = Math.min(0.92, k.pull + H * 1.3);
    } else {
      if (k.pull > 0.5 && onString(k)) {
        const dir = fromAngle(fireAngle(k)); const pull = k.pull;
        const skin = takeSkinShot(style, perks, pull, 1);
        sim.arrows.push({ p: add(k.p[4], mul(dir, 14)), vel: mul(dir, SKIN_RULES.previewSpeed * skin.speed), life: 0, skin });
        impulse(k, 4, mul(dir, 100 * pull)); impulse(k, 3, mul(dir, 45 * pull));
        impulse(k, 6, mul(dir, -250 * pull)); impulse(k, 5, mul(dir, -170 * pull));
        impulse(k, 1, mul(dir, -115 * pull)); impulse(k, 0, mul(dir, -160 * pull)); impulse(k, 2, mul(dir, -45 * pull));
        k.muscle = Math.min(k.muscle, 0.58); k.pull = 0; k.nock = 0;
      }
      k.aiming = damp(k.aiming, 0, 5, H); k.pull = damp(k.pull, 0, 12, H);
    }
  }

  k.lookAt = null;
  stepStick(k, SLABS);
  if (sim.hair) stepHair(k, sim.hair);
  for (const a of sim.arrows) { a.life += H; a.vel.y += SKIN_RULES.previewGravity * (a.skin?.gravity ?? 1) * H; a.p = add(a.p, mul(a.vel, H)); }
  sim.arrows = sim.arrows.filter((a) => a.life < 0.7);
}

interface Props {
  selected: HeadStyle;
  /** the bow he carries, so the preview shows him exactly as he will be in the game */
  bow: BowId;
  onSelect: (h: HeadStyle) => void;
  onClose: () => void;
  lockOf?: (h: HeadStyle) => string | null;
}

/** The skin shop: every head skin as a portrait, and a live close-up of the archer wearing the one that is on. */
export default function SkinModal({ selected, bow, onSelect, onClose, lockOf }: Props) {
  useLang();
  const [preview, setPreview] = useState<HeadStyle>(selected);
  const [showAppearance, setShowAppearance] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const styleRef = useRef<HeadStyle>(selected);
  const bowRef = useRef<BowId>(bow);
  bowRef.current = bow;
  const simRef = useRef<{ k: Stick; hair: Hair | null; cyc: number; arrows: Shot[]; acc: number; skin: SkinId; perks: SkinRuntime } | null>(null);
  const vicStyleRef = useRef(0);
  const [thumbs, setThumbs] = useState<Partial<Record<HeadStyle, string>>>({});
  const meta = SKIN_LIST.find((m) => m.id === preview) ?? SKIN_LIST[0];
  const perk = SKIN_PERKS[preview];
  const perkLines = skinPerkLines(preview);
  const locked = lockOf?.(preview);

  useEffect(() => { setPreview(selected); }, [selected]);

  useEffect(() => {
    const out: Partial<Record<HeadStyle, string>> = {};
    for (const s of HEAD_STYLES) out[s] = skinThumb(s);
    setThumbs(out);
  }, []);

  // Locked styles can still be inspected without equipping or granting their perks.
  useEffect(() => {
    styleRef.current = preview;
    const s = simRef.current;
    if (s) { s.hair = makeHair(preview, s.k); s.skin = preview; s.perks = newSkinRuntime(); s.arrows = []; }
  }, [preview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const k = makeStick(v(0, 0), 1, 1, false, true);
    const sim = { k, hair: makeHair(styleRef.current, k), cyc: 0.9, arrows: [] as Shot[], acc: 0, skin: styleRef.current, perks: newSkinRuntime() };
    simRef.current = sim;
    let raf = 0; let prev = 0; let rt = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 0.016);
      prev = now; rt += dt;
      sim.acc += dt;
      let guard = 0;
      while (sim.acc >= H && guard++ < 10) { stepSkinStage(sim); sim.acc -= H; }
      if (guard >= 10) sim.acc = 0;
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(120, r.width); const h = Math.max(120, r.height);
      const cw = Math.round(w * dpr); const ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      paintSkinStage(ctx, w, h, dpr, sim.k, styleRef.current, sim.hair, rt, bowRef.current, sim.arrows);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); simRef.current = null; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** a shove, to see how the skin moves */
  const nudge = () => {
    audioInit(); snd.tap();
    const s = simRef.current;
    if (!s) return;
    impulse(s.k, 0, v(-280, -50)); impulse(s.k, 1, v(-160, 0));
    s.k.muscle = Math.min(s.k.muscle, 0.5);
  };

  /** triggers the proud charismatic victory freestyle showcase (cycles all 3 signature styles!) */
  const triggerFreestyle = () => {
    audioInit(); snd.yay(0);
    const s = simRef.current;
    if (!s) return;
    s.k.victoryStyle = vicStyleRef.current % 3;
    vicStyleRef.current++;
    s.k.victory = 0.01;
    s.k.pull = 0;
    s.k.aiming = 0;
    s.k.muscle = 1;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm select-none sm:p-5">
      <div className="g-pop flex h-full max-h-[680px] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border-4 border-[#041e2b] bg-[#0b2536] shadow-[0_24px_60px_rgba(0,0,0,0.75)] md:flex-row">
        {/* ============ the archer, close up, wearing the skin ============ */}
        <div className="relative flex min-h-0 flex-1 flex-col bg-[#071624]">
          <div className="z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-[#05121d]/90 px-4 py-3">
            <div className="min-w-0">
              <h2 className="font-game truncate text-lg leading-none text-white sm:text-2xl">🎭 {tx('HEAD SKINS', 'SKIN KEPALA')}</h2>
              <div className="mt-0.5 truncate text-[10px] font-black tracking-wider uppercase" style={{ color: meta.accent }}>
                {preview === selected ? tx('EQUIPPED', 'DIPAKAI') : tx('PREVIEW', 'PRATINJAU')}: {tx(meta.name, meta.nameId)}
              </div>
            </div>
            <button
              onClick={() => { audioInit(); snd.tap(); onClose(); }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-[#09090d] bg-gradient-to-br from-[#ff3b30] to-[#a80c07] text-white shadow-[0_3px_0_#09090d] transition hover:brightness-110 active:translate-y-0.5"
              aria-label={tx('Close Skins', 'Tutup Skin')}
            >
              <span className="font-game text-xl">X</span>
            </button>
          </div>
          <div className="relative min-h-[150px] flex-1 sm:min-h-[190px]">
            <canvas ref={canvasRef} onClick={nudge} className="absolute inset-0 h-full w-full cursor-pointer" />
            <div className="pointer-events-none absolute left-3 top-2.5 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold text-cyan-200 ring-1 ring-white/15 sm:text-[11px]">
              <span className="sm:hidden">{tx('PREVIEW', 'PRATINJAU')}</span><span className="hidden sm:inline">{tx('CLICK STAGE TO SHAKE HAIR', 'KLIK PANGGUNG UNTUK GOYANG RAMBUT')}</span>
            </div>
            <button
              onClick={triggerFreestyle}
              className="font-game absolute right-3 top-2.5 rounded-xl border-2 border-[#031a24] bg-gradient-to-b from-[#ffbe42] to-[#f07600] px-3 py-1.5 text-[11px] text-white shadow-[0_3px_0_#031a24] transition hover:brightness-110 active:translate-y-0.5 sm:text-xs"
            >
              🏆 {tx('TEST VICTORY FREESTYLE', 'TES FREESTYLE MENANG')}
            </button>
          </div>
          <div className="z-10 border-t border-white/10 bg-[#081d2c] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-game text-sm sm:text-base" style={{ color: perk.color }}>{showAppearance ? tx(meta.name, meta.nameId) : skinPerkName(preview)}</div>
              <button onClick={() => setShowAppearance((v) => !v)} className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-xs font-black text-cyan-100 hover:bg-white/10">{showAppearance ? tx('ABILITIES', 'KEMAMPUAN') : tx('APPEARANCE', 'TAMPILAN')}</button>
            </div>
            {showAppearance ? <p className="mt-1 text-xs leading-relaxed text-white/85">{tx(meta.desc, meta.descId)}</p> : (
              <ul aria-label={tx(`${meta.name} bonuses`, `Bonus ${meta.nameId}`)} className="mt-1.5 space-y-1 text-xs font-bold leading-snug text-white/90">
                {perkLines.map((line) => <li key={line} className="flex gap-2"><span aria-hidden style={{ color: perk.color }}>+</span><span>{line}</span></li>)}
              </ul>
            )}
            <div className="mt-2 text-xs font-bold leading-snug text-cyan-100/75">{locked ? `${tx('LOCKED', 'TERKUNCI')}: ${locked}` : tx('ONE SKIN ACTIVE. STACKS WITH CARDS AND BOWS.', 'SATU SKIN AKTIF. BISA DIGABUNG DENGAN KARTU DAN BUSUR.')}</div>
          </div>
        </div>

        {/* ============ every skin ============ */}
        <div className="flex h-[46%] w-full flex-col border-t-4 border-[#041e2b] bg-[#0e2d42] md:h-full md:w-[370px] md:border-l-4 md:border-t-0">
          <div className="border-b border-white/10 bg-[#092030] px-4 py-2.5">
            <div className="font-game text-lg tracking-wide text-[#ffd23f]">{tx('CHOOSE SKIN', 'PILIH SKIN')} ({SKIN_LIST.length})</div>
            <div className="text-xs font-bold text-white/80">{tx('EACH SKIN HAS A UNIQUE ABILITY', 'SETIAP SKIN PUNYA KEMAMPUAN BERBEDA')}</div>
          </div>
          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3">
            {SKIN_LIST.map((m) => {
              const isSel = m.id === selected;
              const sPerkName = skinPerkName(m.id);
              const sName = tx(m.name, m.nameId);
              const requirement = lockOf?.(m.id);
              return (
                <button
                  key={m.id}
                  aria-pressed={isSel}
                  onClick={() => { audioInit(); setPreview(m.id); setShowAppearance(false); if (!requirement) onSelect(m.id); }}
                  title={[sPerkName, ...skinPerkLines(m.id), ...(requirement ? [requirement] : [])].join('\n')}
                  className={`relative flex flex-col items-center gap-1 rounded-2xl border-2 p-2 text-center transition active:scale-[0.97] ${
                    isSel ? 'border-[#ffd93b] bg-[#16425e] shadow-[0_0_16px_rgba(255,217,59,0.3)]' : 'border-[#051b29] bg-[#092030]/80 hover:bg-[#11354d]'
                  }`}
                >
                  {thumbs[m.id]
                    ? <img src={thumbs[m.id]} alt="" className="h-20 w-20 rounded-xl border-2 border-black/40 shadow sm:h-22 sm:w-22" />
                    : <span className="h-20 w-20 rounded-xl border-2 border-black/40 bg-[#0c5c78] sm:h-22 sm:w-22" />}
                  <span className="font-game text-xs leading-tight text-white sm:text-sm">{sName}</span>
                  <span className="text-[11px] font-black uppercase leading-tight" style={{ color: SKIN_PERKS[m.id].color }}>{sPerkName}</span>
                  <span className="line-clamp-2 text-[11px] font-bold leading-snug text-white/75">{skinPerkLines(m.id)[0]}</span>
                  {isSel && <span className="font-game absolute right-1.5 top-1.5 rounded bg-[#ffd93b] px-1.5 py-0.5 text-[10px] leading-none text-[#06202e]">{tx('EQUIPPED', 'DIPAKAI')}</span>}
                  {requirement && <span className="font-game absolute right-1.5 top-1.5 rounded bg-[#071624]/90 px-1.5 py-0.5 text-[10px] leading-none text-white/80">{tx('LOCKED', 'TERKUNCI')}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
