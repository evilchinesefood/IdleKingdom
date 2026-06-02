// Synthesized sound effects + ambient pad via the Web Audio API — no asset files
// (keeps the build buildless and offline-safe). The AudioContext is created lazily
// on the first call after a user gesture (browsers block audio before interaction).

let ctx = null;
let master = null;
let ambient = null;
let enabled = true;

function ensureCtx() {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

// One short tone with an attack/decay envelope; optional linear pitch glide.
function tone({
  freq = 440,
  type = "sine",
  dur = 0.12,
  gain = 0.5,
  glide = 0,
  delay = 0,
}) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glide)
    osc.frequency.linearRampToValueAtTime(Math.max(20, freq + glide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// Each effect is a short sequence of tones with distinct character.
const SFX = {
  click: () => tone({ freq: 420, type: "square", dur: 0.045, gain: 0.16 }),
  place: () => {
    tone({ freq: 300, type: "triangle", dur: 0.1, gain: 0.4 });
    tone({ freq: 480, type: "triangle", dur: 0.1, gain: 0.32, delay: 0.05 });
  },
  upgrade: () => {
    tone({ freq: 500, type: "triangle", dur: 0.11, gain: 0.4 });
    tone({ freq: 760, type: "triangle", dur: 0.14, gain: 0.34, delay: 0.08 });
  },
  connect: () =>
    tone({ freq: 560, type: "sine", dur: 0.12, gain: 0.34, glide: 220 }),
  delete: () =>
    tone({ freq: 340, type: "sawtooth", dur: 0.14, gain: 0.3, glide: -200 }),
  copy: () => {
    tone({ freq: 520, type: "square", dur: 0.05, gain: 0.22 });
    tone({ freq: 520, type: "square", dur: 0.05, gain: 0.22, delay: 0.09 });
  },
  group: () =>
    tone({ freq: 360, type: "triangle", dur: 0.16, gain: 0.36, glide: 150 }),
  expedition: () => {
    tone({ freq: 392, type: "sawtooth", dur: 0.16, gain: 0.38 });
    tone({ freq: 587, type: "sawtooth", dur: 0.22, gain: 0.36, delay: 0.12 });
  },
  research: () => {
    tone({ freq: 523, type: "sine", dur: 0.13, gain: 0.38 });
    tone({ freq: 659, type: "sine", dur: 0.13, gain: 0.38, delay: 0.1 });
    tone({ freq: 784, type: "sine", dur: 0.2, gain: 0.38, delay: 0.2 });
  },
  error: () =>
    tone({ freq: 196, type: "square", dur: 0.18, gain: 0.38, glide: -50 }),
};

export function play(name) {
  if (!enabled || !ensureCtx()) return;
  if (ctx.state === "suspended") ctx.resume();
  const fn = SFX[name];
  if (fn) fn();
}

// Gentle low pad: two detuned oscillators under a slow tremolo. Loops until stopped.
export function startAmbient() {
  if (!enabled || ambient || !ensureCtx()) return;
  if (ctx.state === "suspended") ctx.resume();
  const g = ctx.createGain();
  g.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.08;
  lfoGain.gain.value = 0.025;
  lfo.connect(lfoGain).connect(g.gain);
  const o1 = ctx.createOscillator();
  o1.type = "triangle";
  o1.frequency.value = 110;
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = 165;
  o2.detune.value = 5;
  o1.connect(g);
  o2.connect(g);
  g.connect(master);
  o1.start();
  o2.start();
  lfo.start();
  ambient = { nodes: [o1, o2, lfo], gain: g };
}

export function stopAmbient() {
  if (!ambient) return;
  try {
    for (const n of ambient.nodes) n.stop();
  } catch {}
  try {
    ambient.gain.disconnect();
  } catch {}
  ambient = null;
}

export function setEnabled(on) {
  enabled = !!on;
  if (!enabled) stopAmbient();
  // Do NOT auto-start ambient here: the AudioContext is suspended until a user
  // gesture, and starting it now would consume the `ambient` guard so the real
  // first-gesture start no-ops. The first-gesture handler (and the Settings
  // re-enable, itself a gesture) call startAmbient() so it actually resumes.
}

export function isEnabled() {
  return enabled;
}
