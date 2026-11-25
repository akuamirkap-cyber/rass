import { useEffect, useId, useRef } from 'react';
import { SKILL_TREE_ART, SkillNodeDef } from './game/ragdoll/config';
import { THEMES, paintScene } from './game/ragdoll/scenery';

/** The arena's own painted forest (sky, trees, hills) for any theme, cached until the element changes size. */
export function SceneArt({ themeIndex = SKILL_TREE_ART.themeIndex, seed = SKILL_TREE_ART.sceneSeed, veilTop = SKILL_TREE_ART.upperVeil, veilBottom = SKILL_TREE_ART.lowerVeil, className = 'tree-forest' }: {
  themeIndex?: number; seed?: number; veilTop?: string; veilBottom?: string; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let lastSize = '';
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, SKILL_TREE_ART.maxDpr);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      const size = `${w}:${h}`;
      if (size === lastSize || w < 4 || h < 4) return;
      lastSize = size;
      canvas.width = w; canvas.height = h;
      const scene = paintScene(w, h, THEMES[((themeIndex % THEMES.length) + THEMES.length) % THEMES.length], seed, (width, height) => {
        const layer = document.createElement('canvas'); layer.width = width; layer.height = height; return layer;
      });
      ctx.drawImage(scene.sky as HTMLCanvasElement, -scene.pad, 0);
      ctx.drawImage(scene.near as HTMLCanvasElement, -scene.pad, 0);
      ctx.drawImage(scene.hills as HTMLCanvasElement, -scene.pad, 0);
      const veil = ctx.createLinearGradient(0, 0, 0, h);
      veil.addColorStop(0, veilTop); veil.addColorStop(1, veilBottom);
      ctx.fillStyle = veil; ctx.fillRect(0, 0, w, h);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(canvas);
    window.addEventListener('resize', schedule);
    schedule();
    return () => { observer?.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame); };
  }, [themeIndex, seed, veilTop, veilBottom]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

export function SkillGlyph({ icon, className = '' }: { icon: SkillNodeDef['icon'] | 'coin' | 'lock' | 'crown'; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const gold = `url(#${uid}-gold)`;
  const silver = `url(#${uid}-silver)`;
  const green = `url(#${uid}-green)`;
  const red = `url(#${uid}-red)`;
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="#03202c" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-gold`} x2=".3" y2="1"><stop stopColor="#fff5a3" /><stop offset=".45" stopColor="#ffd349" /><stop offset="1" stopColor="#e68b16" /></linearGradient>
        <linearGradient id={`${uid}-silver`} x2=".3" y2="1"><stop stopColor="#ffffff" /><stop offset="1" stopColor="#96b8cb" /></linearGradient>
        <linearGradient id={`${uid}-green`} x2=".3" y2="1"><stop stopColor="#beff87" /><stop offset="1" stopColor="#3eb959" /></linearGradient>
        <linearGradient id={`${uid}-red`} x2=".3" y2="1"><stop stopColor="#ff9a7f" /><stop offset=".48" stopColor="#ff5b4d" /><stop offset="1" stopColor="#c82535" /></linearGradient>
      </defs>
      {icon === 'wind' && <>
        <path d="M7 20h23c11 0 11-13 2-13M5 43h18c10 0 10 13 2 13" stroke="#d4f8ff" strokeWidth="4.5" />
        <path d="m6 28 32-1-1-9 22 14-22 14 1-10-32-1z" fill={gold} />
        <path d="m12 29 24-1" stroke="#fff7c5" strokeWidth="2" />
      </>}
      {icon === 'quiver' && <>
        <path d="m17 34-6-23m19 23L30 7m12 28 10-23" stroke="#e5f1f5" strokeWidth="4" />
        <path d="m7 9 5-6 6 9-6 7zm18-4 5-4 6 6-6 7zm21 6 8-6 3 11-8 5z" fill={red} />
        <path d="m13 28 6 31h27l7-31z" fill="#995b30" /><path d="m19 31 4 23h17l6-23" fill="#c08443" />
        <path d="M12 27h42v9H12z" fill={gold} /><path d="M31 38h9v11h-9z" fill={gold} />
        <path d="m25 42 2 12" stroke="#e7ad66" strokeWidth="2" />
      </>}
      {icon === 'bow' && <>
        <path d="M17 6c37 8 37 44 0 52" stroke="#092333" strokeWidth="10" />
        <path d="M17 6c37 8 37 44 0 52" stroke="#d88931" strokeWidth="5.5" />
        <path d="m17 6 8 26-8 26" stroke="#ebf3f2" strokeWidth="2" />
        <path d="M9 32h39" stroke="#fbc15b" strokeWidth="4" /><path d="m55 32-13-6 3 6-3 6z" fill={silver} />
        <path d="m8 27 8 5-8 5 2-5z" fill={red} /><path d="m37 23 2 5m0 9-2 5" stroke="#fff2aa" strokeWidth="3" />
      </>}
      {icon === 'wing' && <>
        <path d="M29 38C17 36 8 23 4 10l14 5 10 10zm6 0c12-2 21-15 25-28l-14 5-10 10z" fill={silver} />
        <path d="m9 18 12 14m34-14L43 32M13 31l10 10m28-10L41 41" stroke="#7ccbe7" strokeWidth="3" />
        <path d="m32 8 10 18-7-2v29h-6V24l-7 2z" fill={gold} /><path d="m27 46 5 12 5-12" fill={red} />
      </>}
      {icon === 'target' && <>
        <path d="m22 49-7 11m23-12 9 12" stroke="#b67b3e" strokeWidth="5" />
        <circle cx="29" cy="31" r="23" fill="#be803f" /><circle cx="29" cy="31" r="19" fill="#f3f8f2" />
        <circle cx="29" cy="31" r="13" fill={red} /><circle cx="29" cy="31" r="6" fill={gold} />
        <path d="m29 31 25-25" stroke="#f3bd64" strokeWidth="4" /><path d="m47 9 8-6 1 7-6 8-1-6-5-1z" fill={silver} />
      </>}
      {icon === 'trajectory' && <>
        <path d="M5 47h16v10H5zm41-7h14v10H46z" fill="#3ca7ab" />
        <path d="M11 42C17 1 39 4 51 31" stroke="#04303e" strokeWidth="6" strokeDasharray="3 8" />
        <path d="M11 42C17 1 39 4 51 31" stroke="#e9fcff" strokeWidth="3" strokeDasharray="3 8" />
        <path d="m41 23 11 12 5-16-6 6z" fill={gold} /><circle cx="12" cy="46" r="4" fill={red} />
      </>}
      {icon === 'arrows' && <>
        {[16, 32, 48].map((x) => <g key={x}>
          <path d={`M${x} 49V15`} stroke="#e4a844" strokeWidth="5" />
          <path d={`m${x} 5-7 13 7-3 7 3z`} fill={silver} />
          <path d={`m${x - 5} 42 5 4 5-4v11l-5 7-5-7z`} fill={red} />
        </g>)}
      </>}
      {icon === 'eye' && <>
        <path d="M4 32c13-20 43-20 56 0-13 20-43 20-56 0z" fill={silver} />
        <circle cx="32" cy="32" r="14" fill="#4db8e5" /><circle cx="32" cy="32" r="7" fill="#103246" />
        <path d="M32 4v8m0 40v8M5 32h8m38 0h8" stroke="#ffcf54" strokeWidth="4" />
        <path d="m29 23 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" stroke="none" fill="#fff8ce" />
      </>}
      {icon === 'heart' && <>
        <path d="M32 56C-8 31 8-4 32 16 56-4 72 31 32 56z" fill={red} />
        <path d="M16 18q-7 2-5 10" stroke="#ffe5d8" strokeWidth="4" />
        <path d="M13 34h10l6-10 6 19 5-9h12" stroke="#fff5df" strokeWidth="3" />
      </>}
      {icon === 'leaf' && <>
        <path d="M13 47C-1 19 27 8 53 7c2 29-11 48-40 40z" fill={green} />
        <path d="m10 54 33-35M23 40V27m7 7h12" stroke="#176c42" strokeWidth="3" />
        <path d="M42 37h9v8h8v9h-8v8h-9v-8h-8v-9h8z" fill={gold} />
        <path d="M16 28q5-9 17-12" stroke="#e0ffb6" strokeWidth="2" />
      </>}
      {icon === 'reroll' && <>
        <path d="M10 29C10 11 30 3 44 13l6-6 4 20-21-3 6-5C29 12 18 18 18 29z" fill={gold} />
        <path d="M54 35c0 18-20 26-34 16l-6 6-4-20 21 3-6 5c10 7 21 1 21-10z" fill={green} />
        <path d="M15 21q7-12 20-9m14 31q-7 12-20 9" stroke="#f5ffd1" strokeWidth="2" />
      </>}
      {icon === 'shield' && <>
        <path d="M32 4 9 13v20c0 14 12 22 23 28 11-6 23-14 23-28V13z" fill={gold} />
        <path d="m32 12-16 7v14c0 10 8 17 16 22 8-5 16-12 16-22V19z" fill="#3299a5" />
        <path d="M32 12v43" stroke="#67d9cc" strokeWidth="2" />
        <path d="m21 32 7 7 15-16" stroke="#edfff1" strokeWidth="5" />
      </>}
      {icon === 'feather' && <>
        <path d="M52 5C31 9 15 25 13 46l-4 13 9-7c21-2 35-17 38-37 1-5-1-9-4-10z" fill={silver} />
        <path d="M11 57 47 13" stroke="#5fb4d6" strokeWidth="3.2" />
        <path d="M22 39l11 2m-6-10 12 2m-6-10 11 2" stroke="#8fd0e8" strokeWidth="2.4" />
        <path d="m44 40 10-4-4 10" fill={gold} strokeWidth="2.2" />
      </>}
      {icon === 'bolt' && <>
        <path d="M14 22h14M8 32h12M14 42h10" stroke="#d4f8ff" strokeWidth="4" />
        <path d="M40 3 20 35h14l-6 26 26-36H40l9-22z" fill={gold} />
        <path d="m39 9-11 20" stroke="#fff7c5" strokeWidth="2.4" />
      </>}
      {icon === 'crosshair' && <>
        <circle cx="32" cy="32" r="13" fill="#03131c" stroke="#205266" strokeWidth="2" />
        <path d="M19 27 45 29" stroke="#eb463c" strokeWidth="4" />
        <ellipse cx="36" cy="33" rx="3" ry="1.8" fill="#fff" stroke="none" />
        <circle cx="32" cy="32" r="23" stroke="#03202c" strokeWidth="8" />
        <circle cx="32" cy="32" r="23" stroke="#ff5b4d" strokeWidth="4" />
        <path d="M32 2v13M32 49v13M2 32h13M49 32h13" stroke="#03202c" strokeWidth="8" />
        <path d="M32 3v11M32 50v11M3 32h11M50 32h11" stroke="#ffd34e" strokeWidth="4" />
      </>}
      {icon === 'anchor' && <>
        <path d="M32 19v38M19 28h26M9 40c2 12 11 18 23 18s21-6 23-18" stroke="#03202c" strokeWidth="9" />
        <path d="M32 19v38M9 40c2 12 11 18 23 18s21-6 23-18" stroke="#cfe2ea" strokeWidth="5" />
        <path d="M19 28h26" stroke="#ffcf54" strokeWidth="5" />
        <circle cx="32" cy="12" r="7" fill={gold} />
        <path d="m4 45 5-10 7 7zm56 0-5-10-7 7z" fill={gold} />
      </>}
      {icon === 'bag' && <>
        <path d="M21 13h22l-5 9c12 4 19 14 19 25 0 10-9 14-25 14S7 57 7 47c0-11 7-21 19-25z" fill="#b8793b" />
        <path d="M18 9q14 7 28 0" stroke="#e7b06a" strokeWidth="3" />
        <path d="M24 22h16" stroke="#6e4019" strokeWidth="4" />
        <circle cx="32" cy="43" r="11" fill={gold} />
        <path d="M32 37v12" stroke="#b77711" strokeWidth="3.6" />
        <path d="m50 8 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff6b3" strokeWidth="1.5" />
      </>}
      {icon === 'armor' && <>
        <path d="M14 10l10-4c3 6 13 6 16 0l10 4 9 14-9 6v27H14V30l-9-6z" fill={silver} />
        <path d="M32 13v44" stroke="#7d9fb0" strokeWidth="2.6" />
        <path d="M19 33h26M19 44h26" stroke="#8fb3c4" strokeWidth="2.6" />
        <path d="M24 6c3 6 13 6 16 0" stroke="#ffcf54" strokeWidth="3.4" />
        <circle cx="32" cy="23" r="5" fill={red} />
      </>}
      {icon === 'arrowhead' && <>
        <path d="M2 32h20" stroke="#03202c" strokeWidth="9" /><path d="M2 32h20" stroke="#c9873c" strokeWidth="5" />
        <path d="M61 32 13 7l10 25-10 25z" fill={gold} />
        <path d="M23 32h34" stroke="#fff3b0" strokeWidth="2.6" />
        <path d="M13 7 23 32 13 57" stroke="#9a5d14" strokeWidth="2" />
        <path d="m50 6 2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fffbe0" strokeWidth="1.5" />
      </>}
      {icon === 'coin' && <>
        <ellipse cx="33" cy="35" rx="24" ry="25" fill="#ad6a0c" />
        <circle cx="30" cy="29" r="24" fill={gold} /><circle cx="30" cy="29" r="17" stroke="#bc7a13" strokeWidth="2.5" />
        <path d="M30 18v22" stroke="#b77711" strokeWidth="6" /><path d="M15 18q4-7 12-8" stroke="#fff8b8" strokeWidth="4" />
        <path d="m52 6 2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff6b3" strokeWidth="1.5" />
      </>}
      {icon === 'lock' && <>
        <path d="M19 29V18a13 13 0 0 1 26 0v11" stroke="#092432" strokeWidth="10" /><path d="M19 29V18a13 13 0 0 1 26 0v11" stroke="#c4d8df" strokeWidth="5" />
        <rect x="12" y="26" width="40" height="31" rx="7" fill={gold} /><path d="M17 31h30" stroke="#fff2b3" strokeWidth="2" />
        <path d="M32 35a5 5 0 0 1 2 10v5h-4v-5a5 5 0 0 1 2-10z" fill="#16313c" stroke="none" />
      </>}
      {icon === 'crown' && <>
        <path d="m8 15 12 9L32 8l12 16 12-9-5 32H13z" fill={gold} /><path d="M14 47h36v9H14z" fill="#f7c444" />
        <path d="m32 27 6 8-6 8-6-8z" fill={red} /><circle cx="8" cy="13" r="4" fill="#fff1a0" /><circle cx="32" cy="7" r="4" fill="#fff1a0" /><circle cx="56" cy="13" r="4" fill="#fff1a0" />
      </>}
    </svg>
  );
}

export function TreeArcher() {
  return <svg viewBox="0 0 120 125" className="tree-archer" aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="61" cy="109" rx="37" ry="10" fill="#74e6d421" />
    <path d="M32 98h60v13H32z" fill="#0a3744" stroke="#031f2b" strokeWidth="3" /><path d="M32 98h60v4H32z" fill="#318c98" />
    <path d="m39 54 10-4 8 29-11 4z" fill="#976036" stroke="#062532" strokeWidth="2" />
    <path d="m41 56-5-13m11 11-4-15" stroke="#e0a348" strokeWidth="2" /><path d="m32 38 9 4-5 6zm7-4 9 5-6 6z" fill="#e43d3a" />
    <g stroke="#03131c" strokeWidth="6.5"><path d="m58 72-11 17 2 8h-8m17-25 15 14 5 11h9M58 73l-3-29m1 4 19 7 13-14m-33 6-5 15 26-15" /></g>
    <circle cx="53" cy="32" r="11" fill="#03131c" stroke="#205266" strokeWidth="1.5" />
    <path d="m41 27 22 2m-21-1-11 9m10-7-7 12" stroke="#eb463c" strokeWidth="3.5" />
    <ellipse className="tree-archer-eye" cx="57" cy="33" rx="3.2" ry="1.8" fill="#fff" />
    <path d="M88 17q27 24 0 51" stroke="#062532" strokeWidth="7" /><path d="M88 17q27 24 0 51" stroke="#d8943b" strokeWidth="4" />
    <path d="m88 17-12 30 12 21" stroke="#d1e3e5" strokeWidth="1.4" />
    <path d="m74 47 35-9" stroke="#f5b447" strokeWidth="2.5" /><path d="m114 37-13-2 4 5-1 5z" fill="#cde3ec" stroke="#082936" strokeWidth="1.6" />
    <path d="m70 43 8 3-6 7-1-5z" fill="#ed4c35" />
  </svg>;
}