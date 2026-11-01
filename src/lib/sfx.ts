// Motor de sonido compartido (Web Audio sintetizado, sin archivos).
export type Ctx = AudioContext;

const KEY = 'xnova_sfx_muted';
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let resumeAt = 0;
let muted = (() => {
  try { return localStorage.getItem(KEY) === '1' || localStorage.getItem('bs_sound_muted') === '1'; } catch { return false; }
})();
const listeners = new Set<(m: boolean) => void>();

export const isSfxMuted = () => muted;

export function onSfxMuteChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function setSfxMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); localStorage.removeItem('bs_sound_muted'); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(v));
  if (!v) unlockSfx();
}

/** Crear/reanudar el AudioContext; llamar desde un gesto del usuario. */
export function unlockSfx() {
  if (muted) return;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') { resumeAt = performance.now(); void ctx.resume(); }
}

/** Contexto listo para sonar (o reanudándose justo ahora por un gesto). */
export function sfxReady(): Ctx | null {
  if (muted || !ctx || !master) return null;
  if (ctx.state === 'running') return ctx;
  if (ctx.state === 'suspended' && performance.now() - resumeAt < 800) return ctx;
  return null;
}

function env(c: Ctx, t0: number, dur: number, vol: number, attack = 0.005) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(master!);
  return g;
}

export function tone(c: Ctx, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number, attack?: number) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  o.connect(env(c, t0, dur, vol, attack));
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function noise(c: Ctx, type: BiquadFilterType, f0: number, f1: number, t0: number, dur: number, vol: number, q = 0.8, attack = 0.004) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  src.connect(f);
  f.connect(env(c, t0, dur, vol, attack));
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.05);
}
