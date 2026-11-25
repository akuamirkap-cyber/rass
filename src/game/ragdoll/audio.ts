// Sound for the ragdoll mode, all synthesised: one master bus through a compressor, a small generated
// reverb for space, stereo placement by where things happen, layered one-shots, a synthetic voice for the
// grunts, and a living forest bed (wind, leaves, crickets, birds, owls, frogs, sparse pentatonic plucks).

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let bus: GainNode | null = null;      // one-shot effects (can be ducked on the title screen)
let ambBus: GainNode | null = null;   // ambience + music
let send: GainNode | null = null;     // into the reverb
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let ambOn = false;
let duck = 1;
let beds: { wind: GainNode; windLp: BiquadFilterNode; leaves: GainNode; drone: GainNode; d1: OscillatorNode; d2: OscillatorNode } | null = null;

const rnd = Math.random;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function impulseBuf(ctx: AudioContext, secs: number, decay: number) {
  const n = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}

export function audioInit() {
  try {
    if (!ac) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new C();
      ac = ctx;
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -17; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      master.connect(comp); comp.connect(ctx.destination);
      bus = ctx.createGain(); bus.gain.value = duck; bus.connect(master);
      ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(master);
      const conv = ctx.createConvolver(); conv.buffer = impulseBuf(ctx, 2, 2.8);
      const wet = ctx.createGain(); wet.gain.value = 0.55;
      send = ctx.createGain(); send.connect(conv); conv.connect(wet); wet.connect(master);
      const n = ctx.sampleRate * 3;
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
      // ambience beds: wind, leaf rustle, a soft two-note drone
      const mk = (type: BiquadFilterType, f: number, q: number) => {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0;
        s.connect(fl); fl.connect(g); g.connect(ambBus as GainNode); s.start();
        return { fl, g };
      };
      const wind = mk('lowpass', 380, 0.6); const leaves = mk('bandpass', 5200, 0.5);
      const drone = ctx.createGain(); drone.gain.value = 0;
      const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 600;
      const d1 = ctx.createOscillator(); d1.type = 'sine'; d1.frequency.value = 110;
      const d2 = ctx.createOscillator(); d2.type = 'triangle'; d2.frequency.value = 164.8; d2.detune.value = 6;
      d1.connect(drone); d2.connect(dl); dl.connect(drone); drone.connect(ambBus); drone.connect(send);
      d1.start(); d2.start();
      beds = { wind: wind.g, windLp: wind.fl, leaves: leaves.g, drone, d1, d2 };
      if (ambOn) ambBus.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    }
    if (ac.state === 'suspended') void ac.resume();
  } catch {
    ac = null;
  }
}

export function audioMute(m: boolean) {
  muted = m;
  if (ac && master) master.gain.setTargetAtTime(m ? 0 : 0.9, ac.currentTime, 0.03);
}
/** effects level: quiet behind the title screen, full in play */
export function audioDuck(level: number) {
  duck = level;
  if (ac && bus) bus.gain.setTargetAtTime(level, ac.currentTime, 0.15);
}

function route(g: AudioNode, pan?: number, rev?: number) {
  if (!ac || !bus || !send) return;
  let n = g;
  if (pan && typeof ac.createStereoPanner === 'function') {
    const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    n.connect(p); n = p;
  }
  n.connect(bus);
  if (rev) { const r = ac.createGain(); r.gain.value = rev; n.connect(r); r.connect(send); }
}

interface T { type?: OscillatorType; f: number; to?: number; dur: number; vol: number; at?: number; atk?: number; pan?: number; rev?: number; lp?: number; vib?: number; vibHz?: number; det?: number; amb?: boolean }
function tone(o: T) {
  if (!ac || !bus || muted) return;
  const t = ac.currentTime + (o.at ?? 0);
  const osc = ac.createOscillator(); osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
  if (o.det) osc.detune.value = o.det;
  if (o.vib) {
    const l = ac.createOscillator(); l.frequency.value = o.vibHz ?? 6;
    const lg = ac.createGain(); lg.gain.value = o.vib;
    l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + o.dur + 0.05);
  }
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol, t + (o.atk ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let node: AudioNode = osc;
  if (o.lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; node.connect(fl); node = fl; }
  node.connect(g);
  if (o.amb && ambBus && send) { g.connect(ambBus); if (o.rev) { const r = ac.createGain(); r.gain.value = o.rev; g.connect(r); r.connect(send); } }
  else route(g, o.pan, o.rev);
  osc.start(t); osc.stop(t + o.dur + 0.06);
}

interface N { dur: number; vol: number; f: number; to?: number; q?: number; type?: BiquadFilterType; at?: number; atk?: number; pan?: number; rev?: number }
function noise(o: N) {
  if (!ac || !bus || !noiseBuf || muted) return;
  const t = ac.currentTime + (o.at ?? 0);
  const src = ac.createBufferSource(); src.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = o.type ?? 'bandpass';
  fl.frequency.setValueAtTime(o.f, t);
  if (o.to) fl.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + o.dur);
  fl.Q.value = o.q ?? 1;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol, t + (o.atk ?? 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(fl); fl.connect(g); route(g, o.pan, o.rev);
  src.start(t, rnd() * 2, o.dur + 0.08);
}

/** a throat: a buzzing source through vowel formants, falling in pitch */
function voice(f0: number, f1: number, dur: number, vol: number, pan: number, formants: [number, number][], vib = 0, at = 0) {
  if (!ac || !bus || muted) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  if (vib) { const l = ac.createOscillator(); l.frequency.value = 7; const lg = ac.createGain(); lg.gain.value = vib; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05); }
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(vol, t + 0.018); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
  for (const [f, a] of formants) {
    const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = 6;
    const g = ac.createGain(); g.gain.value = a * 2.2;
    osc.connect(b); b.connect(g); g.connect(env);
  }
  env.connect(lp); route(lp, pan, 0.18);
  osc.start(t); osc.stop(t + dur + 0.06);
  noise({ dur: dur * 0.7, vol: vol * 0.1, f: 1700, q: 0.7, at, pan });
}

const drum = (at = 0, vol = 0.6) => {
  tone({ f: 112, to: 42, dur: 0.42, vol, at });
  noise({ dur: 0.09, vol: vol * 0.4, f: 320, type: 'lowpass', at });
};

export const snd = {
  /** wood and string loading up as the draw passes another notch */
  creak: (p: number) => {
    for (let i = 0; i < 3; i++) noise({ dur: 0.022, vol: 0.045 + p * 0.05, f: 620 + p * 900 + i * 170, q: 7, at: i * 0.024 + rnd() * 0.006 });
    tone({ type: 'triangle', f: 88 + p * 70, to: 118 + p * 92, dur: 0.09, vol: 0.035 });
  },
  /** the release: string slap, the twang ringing down, the limbs' thump, the arrow leaving */
  release: (p: number, pan = 0) => {
    noise({ dur: 0.035, vol: 0.24 + p * 0.2, f: 4200, to: 1500, q: 0.9, pan });
    tone({ type: 'triangle', f: 232 + p * 110, to: 96, dur: 0.34, vol: 0.2 + p * 0.1, vib: 14, vibHz: 38, pan, rev: 0.15 });
    tone({ type: 'sawtooth', f: 234 + p * 110, to: 97, dur: 0.2, vol: 0.05, lp: 1400, det: 9, pan });
    tone({ f: 112 + p * 30, to: 46, dur: 0.2, vol: 0.28, pan });
    noise({ dur: 0.3 + p * 0.12, vol: 0.07 + p * 0.14, f: 2400 + p * 1400, to: 320, q: 0.8, at: 0.01, pan, rev: 0.2 });
  },
  /** an arrow that just missed your head */
  whoosh: (pan = 0) => {
    noise({ dur: 0.26, vol: 0.2, f: 3400, to: 600, q: 1.4, atk: 0.05, pan });
    tone({ f: 1500, to: 680, dur: 0.22, vol: 0.022, atk: 0.05, pan });
  },
  /** arrow into a body; a headshot adds the crack and a bright reward ring */
  hit: (pan = 0, head = false) => {
    tone({ f: 152, to: 44, dur: 0.2, vol: 0.55, pan });
    noise({ dur: 0.06, vol: 0.4, f: 900, to: 260, type: 'lowpass', pan });
    noise({ dur: 0.1, vol: 0.18, f: 2200, q: 1.2, at: 0.005, pan });
    if (head) {
      noise({ dur: 0.03, vol: 0.45, f: 3400, type: 'highpass', pan });
      tone({ type: 'triangle', f: 760, to: 300, dur: 0.12, vol: 0.2, pan });
      tone({ f: 1760, dur: 0.26, vol: 0.07, at: 0.03, rev: 0.5, pan });
      tone({ f: 2637, dur: 0.32, vol: 0.05, at: 0.07, rev: 0.5, pan });
    }
  },
  grunt: (pan = 0, pitch = 1) => voice(158 * pitch, 96 * pitch, 0.2, 0.3, pan, [[620, 1], [1050, 0.6], [2300, 0.2]]),
  cry: (pan = 0, pitch = 1) => voice(196 * pitch, 72 * pitch, 0.62, 0.32, pan, [[760, 1], [1250, 0.7], [2500, 0.25]], 7),
  /** a body going over the edge */
  fall: (pan = 0) => {
    tone({ f: 780, to: 230, dur: 0.9, vol: 0.03, atk: 0.12, pan, rev: 0.3, at: 0.25 });
    noise({ dur: 0.8, vol: 0.05, f: 900, to: 300, q: 0.8, atk: 0.2, pan, at: 0.25 });
  },
  /** arrow into a platform: knock, splinter, the shaft still humming */
  wood: (pan = 0) => {
    tone({ f: 330, to: 170, dur: 0.07, vol: 0.3, pan });
    noise({ dur: 0.045, vol: 0.3, f: 1900, to: 600, q: 1.5, pan });
    tone({ type: 'triangle', f: 95, dur: 0.2, vol: 0.1, vib: 30, vibHz: 31, pan });
  },
  clang: (pan = 0) => {
    [820, 1370, 2210, 3125, 4410].forEach((f, i) => tone({ f, dur: 0.5 - i * 0.06, vol: 0.09 - i * 0.012, pan, rev: 0.4 }));
    noise({ dur: 0.03, vol: 0.3, f: 5000, type: 'highpass', pan });
  },
  nock: () => { noise({ dur: 0.025, vol: 0.12, f: 3200, q: 2 }); tone({ type: 'square', f: 1200, to: 800, dur: 0.03, vol: 0.035 }); },
  quiver: () => noise({ dur: 0.11, vol: 0.06, f: 2600, to: 5200, q: 1.6, atk: 0.03 }),
  rise: (pan = 0) => {
    tone({ f: 98, to: 165, dur: 0.7, vol: 0.07, atk: 0.2, pan, rev: 0.4 });
    noise({ dur: 0.7, vol: 0.035, f: 500, to: 1400, q: 0.8, atk: 0.25, pan });
  },
  /** coins bursting out of a fallen enemy: a handful of bright clinks */
  coinPop: () => {
    for (let i = 0; i < 5; i++) tone({ f: 2300 + rnd() * 2000, dur: 0.06, vol: 0.04, at: i * 0.028 + rnd() * 0.02, rev: 0.2 });
    noise({ dur: 0.05, vol: 0.07, f: 6500, type: 'highpass' });
  },
  /** one coin landing in the purse: each one a step higher up the scale than the last */
  coin: (i = 0) => {
    const semis = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    // a hair of random detune keeps a run of them from sounding like a machine
    const f = 1046.5 * Math.pow(2, semis[Math.min(Math.floor(i), semis.length - 1)] / 12) * (0.985 + rnd() * 0.03);
    tone({ type: 'triangle', f, dur: 0.1, vol: 0.1 });
    tone({ f: f * 2, dur: 0.3, vol: 0.07, at: 0.012, rev: 0.35 });
    tone({ f: f * 3.01, dur: 0.12, vol: 0.02 });
    noise({ dur: 0.02, vol: 0.06, f: 7000, type: 'highpass' });
  },
  /** the last coin of a haul: a little shimmer on top */
  coinEnd: (i = 0) => {
    const semis = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const f = 1046.5 * Math.pow(2, semis[Math.min(Math.floor(i), semis.length - 1)] / 12);
    [0, 4, 7, 12].forEach((st, j) => tone({ type: 'triangle', f: f * Math.pow(2, st / 12), dur: 0.32, vol: 0.06, at: 0.06 + j * 0.045, rev: 0.5 }));
    noise({ dur: 0.35, vol: 0.03, f: 8000, type: 'highpass', at: 0.06, atk: 0.02 });
  },
  /** a coin popping into its place in the fan: a tiny rising blip */
  coinTick: (i = 0) => tone({ type: 'triangle', f: (1568 + Math.min(i, 10) * 120) * (0.98 + rnd() * 0.04), dur: 0.05, vol: 0.035 }),
  /** a bone cracking under a limb or chest hit: one dry snap */
  snap: (pan = 0) => {
    noise({ dur: 0.018, vol: 0.4, f: 2600, type: 'highpass', pan });
    tone({ type: 'square', f: 760, to: 220, dur: 0.035, vol: 0.1, pan, lp: 2800 });
    noise({ dur: 0.02, vol: 0.22, f: 3200, type: 'highpass', at: 0.035, pan });
    tone({ f: 110, to: 46, dur: 0.14, vol: 0.3, pan });
  },
  /** the boss heaves an axe: a grunt and the first heavy swish */
  throwAxe: (pan = 0, pitch = 1) => {
    voice(110 * pitch, 190 * pitch, 0.26, 0.26, pan, [[640, 1], [1100, 0.6]]);
    noise({ dur: 0.3, vol: 0.2, f: 500, to: 1900, q: 1.1, atk: 0.1, pan });
  },
  /** each turn of a spinning axe in the air */
  whup: (pan = 0) => noise({ dur: 0.13, vol: 0.11, f: 420, to: 900, q: 1.6, atk: 0.05, pan }),
  /** an arrow knocks the axe out of the air */
  parry: (pan = 0) => {
    [900, 1480, 2330, 3410].forEach((f, i) => tone({ f, dur: 0.42 - i * 0.07, vol: 0.11 - i * 0.02, pan, rev: 0.4 }));
    noise({ dur: 0.035, vol: 0.4, f: 4800, type: 'highpass', pan });
    tone({ f: 300, to: 150, dur: 0.08, vol: 0.25, pan });
    noise({ dur: 0.06, vol: 0.22, f: 1700, to: 600, q: 1.4, at: 0.01, pan });
  },
  /** the prisoner's rope parting */
  ropeSnap: (pan = 0) => {
    noise({ dur: 0.03, vol: 0.35, f: 3000, type: 'highpass', pan });
    tone({ type: 'triangle', f: 520, to: 140, dur: 0.22, vol: 0.2, vib: 20, vibHz: 46, pan, rev: 0.2 });
    noise({ dur: 0.18, vol: 0.1, f: 1200, to: 400, q: 0.9, at: 0.02, pan });
  },
  /** a happy shout: two rising notes */
  yay: (pan = 0) => {
    voice(230, 330, 0.2, 0.24, pan, [[700, 1], [1700, 0.6], [2700, 0.2]], 0, 0.15);
    voice(300, 440, 0.34, 0.26, pan, [[750, 1], [1250, 0.7], [2600, 0.2]], 8, 0.38);
  },
  /** bone giving way: three dry snaps over a deep thump */
  crack: (pan = 0) => {
    [0, 0.03, 0.075].forEach((at, i) => {
      noise({ dur: 0.016, vol: 0.5 - i * 0.1, f: 2800, type: 'highpass', at, pan });
      tone({ type: 'square', f: 900 - i * 170, to: 240, dur: 0.03, vol: 0.12, at, pan, lp: 3000 });
    });
    tone({ f: 120, to: 38, dur: 0.3, vol: 0.6, pan });
    noise({ dur: 0.16, vol: 0.3, f: 500, to: 160, type: 'lowpass', at: 0.02, pan });
  },
  /** the X-ray moment: the world drops away into a low hum */
  xray: () => {
    tone({ f: 52, to: 36, dur: 0.75, vol: 0.4, atk: 0.03 });
    tone({ type: 'sawtooth', f: 104, dur: 0.5, vol: 0.06, lp: 420, atk: 0.02 });
    noise({ dur: 0.45, vol: 0.08, f: 300, to: 3200, q: 1.2, atk: 0.3 });
    tone({ f: 1244, dur: 0.6, vol: 0.022, vib: 18, vibHz: 9, rev: 0.6, atk: 0.05 });
  },
  /** losing his balance */
  whoa: (pan = 0, pitch = 1) => voice(150 * pitch, 240 * pitch, 0.42, 0.26, pan, [[560, 1], [900, 0.7], [2400, 0.2]], 10),
  /** a body landing on the ground */
  thud: (pan = 0, at = 0) => { tone({ f: 96, to: 40, dur: 0.22, vol: 0.5, pan, at }); noise({ dur: 0.09, vol: 0.25, f: 380, type: 'lowpass', pan, at }); },
  /** heaving himself back up */
  hup: (pan = 0, pitch = 1, at = 0) => voice(118 * pitch, 172 * pitch, 0.24, 0.2, pan, [[640, 1], [1100, 0.6]], 0, at),
  pop: (pan = 0) => { noise({ dur: 0.06, vol: 0.45, f: 2600, type: 'highpass', pan }); tone({ type: 'square', f: 900, to: 180, dur: 0.09, vol: 0.1, pan }); },
  heal: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.24, vol: 0.09, at: i * 0.06, rev: 0.3 })),
  combo: (n: number) => tone({ type: 'triangle', f: 660 * Math.pow(1.122, Math.min(n, 10)), dur: 0.16, vol: 0.1, rev: 0.3 }),
  /** level start: one war drum and a rush of air */
  banner: () => { drum(0, 0.55); noise({ dur: 0.5, vol: 0.08, f: 500, to: 2600, q: 0.8, atk: 0.3 }); },
  win: () => {
    drum(0, 0.5);
    [523, 659, 784, 1047].forEach((f, i) => { tone({ type: 'triangle', f, dur: 0.22, vol: 0.14, at: i * 0.1, rev: 0.35 }); tone({ type: 'square', f, dur: 0.16, vol: 0.03, at: i * 0.1, lp: 2400 }); });
    [523, 784, 1047, 1319].forEach((f) => tone({ type: 'triangle', f, dur: 1.1, vol: 0.1, at: 0.44, rev: 0.5 }));
    drum(0.44, 0.45);
  },
  star: (i: number) => { tone({ type: 'triangle', f: [784, 988, 1319][i] ?? 1319, dur: 0.4, vol: 0.13, rev: 0.45 }); noise({ dur: 0.12, vol: 0.05, f: 6000, type: 'highpass' }); },
  boss: () => {
    tone({ type: 'sawtooth', f: 55, dur: 1.5, vol: 0.22, lp: 500, atk: 0.15, rev: 0.4 });
    tone({ type: 'sawtooth', f: 82.4, dur: 1.5, vol: 0.13, lp: 600, atk: 0.25, det: -8 });
    tone({ type: 'sawtooth', f: 65.4, dur: 1.1, vol: 0.14, lp: 520, at: 0.5 });
    drum(0); drum(0.5);
  },
  lose: () => {
    [392, 349, 311, 262].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.55, vol: 0.13, at: i * 0.22, rev: 0.45 }));
    drum(0.9, 0.5);
    tone({ f: 65, dur: 1.6, vol: 0.22, at: 0.9, lp: 300 });
  },
  heart: () => { tone({ f: 62, to: 40, dur: 0.16, vol: 0.5 }); tone({ f: 58, to: 38, dur: 0.18, vol: 0.38, at: 0.2 }); },
  tap: () => tone({ type: 'triangle', f: 660, to: 900, dur: 0.07, vol: 0.09 }),
  open: () => { noise({ dur: 0.2, vol: 0.07, f: 700, to: 2600, q: 0.9, atk: 0.08 }); tone({ type: 'triangle', f: 440, to: 660, dur: 0.14, vol: 0.06 }); },
  buy: () => { tone({ type: 'triangle', f: 880, dur: 0.1, vol: 0.1 }); tone({ type: 'triangle', f: 1175, dur: 0.12, vol: 0.1, at: 0.07 }); tone({ f: 1760, dur: 0.35, vol: 0.08, at: 0.14, rev: 0.4 }); },
  deny: () => tone({ type: 'square', f: 200, to: 140, dur: 0.14, vol: 0.07, lp: 900 }),
  /** short woody "thunk" of an arrow driving into a body */
  thunk: (pan = 0) => { tone({ f: 210, to: 70, dur: 0.09, vol: 0.42, pan }); noise({ dur: 0.05, vol: 0.28, f: 1200, type: 'lowpass', pan }); },
  /** electric bow release: plasma discharge + high-voltage snap */
  thunderRelease: (p: number, pan = 0) => {
    noise({ dur: 0.06, vol: 0.32 + p * 0.18, f: 5600, to: 1800, q: 2.2, pan });
    tone({ type: 'sawtooth', f: 680 + p * 320, to: 140, dur: 0.22, vol: 0.18, vib: 45, vibHz: 55, pan, rev: 0.25 });
    tone({ type: 'square', f: 1420, to: 320, dur: 0.11, vol: 0.1, pan });
    for (let i = 0; i < 4; i++) {
      noise({ dur: 0.02, vol: 0.2, f: 3800 + rnd() * 3200, type: 'bandpass', q: 4, at: 0.03 + i * 0.035, pan });
    }
  },
  /** electric arrow impact: thunderclap + crackling high-voltage arcs */
  zap: (pan = 0, chain = false) => {
    tone({ f: 135, to: 34, dur: 0.38, vol: chain ? 0.35 : 0.6, pan, rev: 0.3 });
    noise({ dur: 0.09, vol: 0.48, f: 4800, type: 'highpass', pan });
    for (let i = 0; i < (chain ? 4 : 8); i++) {
      const at = i * 0.038 + rnd() * 0.02;
      noise({ dur: 0.024, vol: 0.32 - i * 0.025, f: 2800 + rnd() * 4200, q: 3.5, at, pan });
      tone({ type: 'sawtooth', f: 900 + rnd() * 1600, to: 220 + rnd() * 400, dur: 0.035, vol: 0.11, at, pan });
    }
  },
  /** ongoing electrocution buzz/crackle */
  sparkTick: (pan = 0) => {
    noise({ dur: 0.018, vol: 0.16, f: 4200 + rnd() * 3000, q: 4.5, pan });
    tone({ type: 'sawtooth', f: 520 + rnd() * 980, to: 180, dur: 0.025, vol: 0.06, pan });
  },
  /** fire bow release: roaring flame whoosh */
  fireRelease: (p: number, pan = 0) => {
    noise({ dur: 0.38, vol: 0.28 + p * 0.2, f: 950, to: 280, q: 0.7, atk: 0.02, pan, rev: 0.25 });
    noise({ dur: 0.22, vol: 0.18, f: 2400, to: 620, q: 1.1, pan });
    tone({ type: 'triangle', f: 165 + p * 60, to: 58, dur: 0.32, vol: 0.26, pan });
  },
  /** fireball impact detonation */
  fireball: (pan = 0) => {
    tone({ f: 98, to: 28, dur: 0.48, vol: 0.65, pan, rev: 0.35 });
    noise({ dur: 0.42, vol: 0.45, f: 680, to: 140, type: 'lowpass', atk: 0.01, pan, rev: 0.3 });
    noise({ dur: 0.28, vol: 0.25, f: 2200, to: 420, q: 0.9, at: 0.02, pan });
    for (let i = 0; i < 5; i++) {
      noise({ dur: 0.04, vol: 0.14, f: 3600 + rnd() * 2000, type: 'bandpass', q: 3, at: 0.06 + i * 0.045, pan });
    }
  },
  /** fire sizzle / burn tick */
  sizzle: (pan = 0) => {
    noise({ dur: 0.12, vol: 0.12, f: 5200, to: 2600, q: 1.8, atk: 0.02, pan });
    tone({ f: 140, to: 75, dur: 0.09, vol: 0.08, pan });
  },
  /** Xenomorph pressurized acid spit splatter + corrosive hiss */
  acidSpit: (pan = 0) => {
    noise({ dur: 0.28, vol: 0.38, f: 3800, to: 1100, q: 2.4, atk: 0.005, pan, rev: 0.2 });
    noise({ dur: 0.45, vol: 0.24, f: 6400, to: 2800, q: 1.5, at: 0.04, pan });
    tone({ type: 'sawtooth', f: 620, to: 160, dur: 0.19, vol: 0.16, vib: 35, vibHz: 48, pan });
    for (let i = 0; i < 5; i++) {
      tone({ type: 'sine', f: 900 + rnd() * 1400, to: 380, dur: 0.05, vol: 0.09, at: 0.03 + i * 0.05, pan });
    }
  },
    /** timber: a creak as it splits, a crash as it gives way, and the long rumble of a fort coming down */
  woodCrack: (pan = 0) => {
    noise({ dur: 0.09, vol: 0.3, f: 1200, to: 500, q: 2.2, pan });
    tone({ type: 'square', f: 190, to: 110, dur: 0.12, vol: 0.09, pan, lp: 1200 });
  },
  woodBreak: (pan = 0) => {
    noise({ dur: 0.22, vol: 0.5, f: 1500, to: 380, q: 0.9, pan });
    tone({ f: 170, to: 60, dur: 0.24, vol: 0.45, pan });
    noise({ dur: 0.07, vol: 0.3, f: 3600, type: 'highpass', pan });
  },
  collapse: (pan = 0) => {
    [0, 0.12, 0.27, 0.45].forEach((at, i) => {
      tone({ f: 120 - i * 14, to: 42, dur: 0.34, vol: 0.5 - i * 0.07, at, pan });
      noise({ dur: 0.2, vol: 0.34 - i * 0.05, f: 900, to: 260, q: 0.8, at, pan });
    });
    noise({ dur: 0.9, vol: 0.16, f: 400, to: 120, type: 'lowpass', pan, rev: 0.3 });
  },
  /** the dragon: its roar, the breath it draws before fire, and the fire leaving it */
  dragonRoar: (pan = 0) => {
    voice(118, 52, 0.95, 0.5, pan, [[420, 1], [780, 0.8], [1500, 0.35]], 16);
    noise({ dur: 0.8, vol: 0.2, f: 600, to: 180, q: 0.7, pan, rev: 0.35 });
    tone({ f: 70, to: 38, dur: 0.9, vol: 0.4, pan });
  },
  dragonInhale: (pan = 0) => {
    noise({ dur: 1.0, vol: 0.2, f: 300, to: 2600, q: 1.1, atk: 0.7, pan });
    tone({ type: 'sawtooth', f: 60, to: 150, dur: 1.0, vol: 0.09, atk: 0.6, pan, lp: 700 });
  },
  fireSpit: (pan = 0) => {
    noise({ dur: 0.5, vol: 0.5, f: 1800, to: 260, q: 0.7, pan, rev: 0.25 });
    tone({ f: 190, to: 50, dur: 0.4, vol: 0.45, pan });
  },
  /** the legendary arrow landing: a bright rising shimmer */
  legend: (pan = 0) => {
    [784, 1175, 1568, 2349].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.3 - i * 0.03, vol: 0.09, at: i * 0.035, pan, rev: 0.45 }));
    noise({ dur: 0.16, vol: 0.07, f: 7000, type: 'highpass', pan });
  },
  /** a bat: thin, quick chirps right at the top of hearing */
  batScreech: (pan = 0) => {
    [0, 0.07, 0.14].forEach((at, i) => tone({ type: 'square', f: 3300 + i * 450, to: 5000 + i * 350, dur: 0.06, vol: 0.04, at, pan, lp: 7500 }));
    noise({ dur: 0.2, vol: 0.05, f: 6500, type: 'highpass', pan });
  },
  /** a bat shot out of the air: the squeak falls away with it */
  batDie: (pan = 0) => {
    tone({ type: 'square', f: 4200, to: 800, dur: 0.3, vol: 0.055, pan, lp: 6000, vib: 300, vibHz: 28 });
    noise({ dur: 0.13, vol: 0.16, f: 900, to: 300, q: 1.2, pan });
  },
  /** teeth: a wet snap and the thump of being knocked */
  bite: (pan = 0) => {
    noise({ dur: 0.05, vol: 0.36, f: 2400, q: 2, pan });
    tone({ f: 180, to: 70, dur: 0.13, vol: 0.32, pan });
    tone({ type: 'square', f: 3800, to: 2600, dur: 0.09, vol: 0.04, at: 0.03, pan, lp: 7000 });
  },
  /** an arrow thumping into a shield: wood under an iron rim */
  shieldBlock: (pan = 0) => {
    tone({ f: 240, to: 120, dur: 0.1, vol: 0.42, pan });
    noise({ dur: 0.05, vol: 0.34, f: 1500, to: 500, q: 1.4, pan });
    [1180, 1930, 2870].forEach((f, i) => tone({ f, dur: 0.24 - i * 0.05, vol: 0.06 - i * 0.012, pan, rev: 0.3 }));
  },
  /** the shield splitting apart */
  shieldBreak: (pan = 0) => {
    noise({ dur: 0.32, vol: 0.5, f: 1400, to: 300, q: 0.8, pan });
    noise({ dur: 0.08, vol: 0.4, f: 4200, type: 'highpass', pan });
    tone({ f: 150, to: 50, dur: 0.3, vol: 0.5, pan });
    [760, 1210, 1890, 2740].forEach((f, i) => tone({ f, dur: 0.44 - i * 0.08, vol: 0.08 - i * 0.014, pan, rev: 0.4 }));
  },
};

/* ---------------- the forest bed ---------------- */

const ROOT = [110, 98, 123.5, 87.3, 103.8];
const PENTA = [1, 1.189, 1.335, 1.498, 1.782, 2, 2.378, 2.67, 2.997];
let gustT = 0; let chirpT = 3; let callT = 5; let pluckT = 2; let note = 3; let lastTheme = -1;

export function ambStart() {
  ambOn = true;
  if (ac && ambBus) ambBus.gain.setTargetAtTime(1, ac.currentTime, 0.8);
}
export function ambStop() {
  ambOn = false;
  if (ac && ambBus) ambBus.gain.setTargetAtTime(0, ac.currentTime, 0.25);
}

/** call every frame: moves the wind around and lets the creatures of this theme speak up now and then */
export function ambTick(dt: number, theme: number) {
  if (!ac || !beds || !ambOn) return;
  const now = ac.currentTime;
  const root = ROOT[theme % ROOT.length];
  if (theme !== lastTheme) {
    lastTheme = theme;
    beds.d1.frequency.setTargetAtTime(root, now, 1.5); beds.d2.frequency.setTargetAtTime(root * 1.498, now, 1.5);
    beds.drone.gain.setTargetAtTime(0.016, now, 2);
  }
  gustT -= dt;
  if (gustT <= 0) {
    gustT = 1.8 + rnd() * 3;
    beds.wind.gain.setTargetAtTime(0.02 + rnd() * 0.04, now, 1.4);
    beds.windLp.frequency.setTargetAtTime(260 + rnd() * 480, now, 1.8);
    beds.leaves.gain.setTargetAtTime(rnd() < 0.6 ? rnd() * 0.012 : 0.001, now, 1.1);
  }
  if (muted) return;
  const night = theme === 1 || theme === 3;
  chirpT -= dt;
  if (chirpT <= 0) {
    // crickets: short trains of very high pulses
    chirpT = (night ? 0.7 : theme === 4 ? 1.2 : 2.6) + rnd() * (night ? 1.6 : 4);
    const pan = rnd() * 1.6 - 0.8; const f = 4200 + rnd() * 600; const vol = 0.006 + rnd() * 0.008;
    for (let c = 0; c < 2 + Math.floor(rnd() * 3); c++) for (let i = 0; i < 3; i++) tone({ f, dur: 0.022, vol, at: c * 0.16 + i * 0.034, pan, amb: true });
  }
  callT -= dt;
  if (callT <= 0) {
    callT = 4 + rnd() * 9;
    const pan = rnd() * 1.6 - 0.8;
    if (theme === 4) {
      // frogs
      for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) tone({ type: 'sawtooth', f: 100 + rnd() * 20, dur: 0.15, vol: 0.03, lp: 700, vib: 24, vibHz: 42, at: i * 0.26, pan, rev: 0.3, amb: true });
    } else if (night) {
      // an owl, two notes
      tone({ f: 392, to: 372, dur: 0.32, vol: 0.028, atk: 0.06, rev: 0.7, pan, amb: true });
      tone({ f: 352, to: 340, dur: 0.55, vol: 0.03, atk: 0.08, at: 0.5, rev: 0.7, pan, amb: true });
    } else {
      // a bird, a few rising chirps
      const base = 2100 + rnd() * 900;
      for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) tone({ f: base * (1 + i * 0.06), to: base * (1.2 + rnd() * 0.25), dur: 0.09, vol: 0.02, at: i * 0.13, rev: 0.6, pan, amb: true });
    }
  }
  pluckT -= dt;
  if (pluckT <= 0) {
    // music: a wandering pentatonic line, far away and wet
    pluckT = 1.6 + rnd() * 3.4;
    note = clamp(note + Math.round(rnd() * 4 - 2), 0, PENTA.length - 1);
    const f = root * 2 * PENTA[note];
    tone({ f, dur: 1.5, vol: 0.034, rev: 0.8, amb: true });
    tone({ f: f * 2, dur: 0.5, vol: 0.011, rev: 0.8, amb: true });
    if (rnd() < 0.4) tone({ f: root * 2 * PENTA[clamp(note + 2, 0, PENTA.length - 1)], dur: 1.3, vol: 0.026, at: 0.32, rev: 0.8, amb: true });
  }
}
