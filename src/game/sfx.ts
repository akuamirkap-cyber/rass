let ac: AudioContext | null = null;
let muted = false;

export function initAudio() {
  try {
    if (!ac) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new Ctor();
    }
    if (ac.state === 'suspended') void ac.resume();
  } catch {
    ac = null;
  }
}
export const setMuted = (m: boolean) => (muted = m);

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
  if (!ac || muted) return;
  const t = ac.currentTime;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t);
}

export const sfx = {
  grab: () => { noise(0.09, 0.18, 900, 1.2); tone('triangle', 160, 110, 0.1, 0.12, 0.03); },
  pick: () => { noise(0.16, 0.12, 2600, 2, 'bandpass', 5200); },
  nock: () => { tone('square', 1300, 900, 0.035, 0.06); noise(0.03, 0.12, 3000, 2); },
  /** the release: the string snaps forward, the limbs thump, the arrow whistles away */
  twang: (p: number) => {
    noise(0.04, 0.22 + p * 0.2, 3800, 1.2, 'bandpass', 1400); // string slap
    tone('triangle', 200 + p * 110, 80, 0.26, 0.26 + p * 0.1); // limbs
    tone('sine', 110 + p * 30, 48, 0.22, 0.28, 0.01); // riser thump
    tone('sawtooth', 420 + p * 200, 160, 0.1, 0.05);
    noise(0.34 + p * 0.1, 0.1 + p * 0.16, 1800 + p * 1200, 0.7, 'bandpass', 260); // whoosh fading into the distance
  },
  /** the arrow lands in something soft: a deep thud with a wet crack */
  thunk: () => { tone('sine', 140, 48, 0.2, 0.55); noise(0.05, 0.42, 1100, 0.9, 'bandpass', 300); noise(0.12, 0.25, 420, 1.2, 'lowpass'); },
  /** a vital hit: the thud plus a sharp crack and a short ring */
  smack: () => { tone('sine', 120, 40, 0.24, 0.65); noise(0.035, 0.5, 2600, 0.8, 'bandpass', 900); noise(0.14, 0.3, 380, 1.1, 'lowpass'); tone('triangle', 640, 300, 0.12, 0.08, 0.02); },
  /** arrow stuck in wood or stone */
  tok: () => { tone('square', 520, 190, 0.05, 0.12); tone('sine', 190, 90, 0.12, 0.3); noise(0.05, 0.3, 1600, 1.4, 'bandpass', 500); },
  crunch: () => {
    noise(0.2, 0.5, 1500, 0.9, 'bandpass', 500);
    [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.16, 0.18 + i * 0.09));
  },
  ouch: () => { tone('sine', 170, 50, 0.22, 0.5); tone('square', 420, 140, 0.4, 0.09, 0.05); noise(0.1, 0.3, 500, 1); },
  miss: () => tone('triangle', 300, 180, 0.18, 0.1),
  /** limbs loading up while the string comes back */
  creak: (p: number) => { tone('triangle', 95 + p * 70, 75 + p * 45, 0.07, 0.06 + p * 0.04); noise(0.06, 0.07 + p * 0.05, 500 + p * 1100, 3); tone('sine', 60 + p * 20, 55 + p * 20, 0.08, 0.06); },
  /** the clicker: you are at full draw */
  click: () => { tone('square', 2300, 1800, 0.03, 0.07); noise(0.02, 0.1, 4200, 3); },
  launch: () => { tone('sine', 230, 70, 0.2, 0.4); noise(0.14, 0.25, 600, 0.8, 'bandpass', 200); },
  step: () => noise(0.05, 0.08, 260, 1.1, 'lowpass'),
  /** arrow glancing off the glass */
  ting: () => { tone('sine', 2600, 2400, 0.28, 0.12); tone('sine', 3900, 3700, 0.2, 0.06); noise(0.03, 0.12, 5000, 2); },
  /** the rope lets go */
  snap: () => { noise(0.09, 0.35, 1800, 1.5, 'bandpass', 600); tone('square', 520, 160, 0.09, 0.1); },
  /** one hundred tons meet the seesaw */
  slam: () => { tone('sine', 95, 28, 0.6, 0.9); tone('triangle', 60, 30, 0.8, 0.5, 0.02); noise(0.35, 0.6, 180, 0.7, 'lowpass'); },
  boing: () => tone('sine', 150, 300, 0.2, 0.07),
  /** a balloon bursts */
  pop: () => { noise(0.07, 0.5, 2500, 0.6, 'highpass'); tone('square', 900, 200, 0.06, 0.12); },
  quack: () => { tone('sawtooth', 620, 420, 0.12, 0.2); tone('sawtooth', 560, 380, 0.14, 0.2, 0.16); },
  /** through a portal */
  warp: () => { tone('sine', 1400, 300, 0.18, 0.14); tone('triangle', 500, 1500, 0.16, 0.08, 0.04); },
  /** the magnet switches on */
  zap: () => { tone('sawtooth', 110, 90, 0.25, 0.12); noise(0.12, 0.12, 3000, 2); },
  /** an apple lands on a head */
  tuk: () => tone('sine', 420, 220, 0.07, 0.18),
  /** one of the four memory lamps */
  note: (i: number) => { const f = [392, 494, 587, 784][i] ?? 440; tone('sine', f, f, 0.32, 0.22); },
  boom: () => { tone('sine', 120, 30, 0.5, 0.8); noise(0.4, 0.6, 300, 0.7, 'lowpass'); },
  /** tractor beam */
  beam: () => { tone('sine', 300, 900, 0.9, 0.12); tone('triangle', 450, 1350, 0.9, 0.06); },
  /** a glass plate bursts */
  shatter: () => {
    noise(0.3, 0.5, 5200, 0.7, 'highpass');
    tone('sine', 3100, 2100, 0.2, 0.1);
    tone('sine', 4300, 2900, 0.16, 0.07, 0.03);
  },
  /** somebody lands on his feet */
  hup: () => { tone('sine', 130, 60, 0.14, 0.35); noise(0.06, 0.15, 400, 1); },
};
