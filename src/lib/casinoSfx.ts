// Efectos de sonido del casino (ruleta, tragamonedas, dados), sintetizados con Web Audio.
import { noise, sfxReady as ready, tone, type Ctx } from './sfx';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Bolita golpeando los separadores de la ruleta. */
function tick(c: Ctx, t: number, vol: number) {
  tone(c, 'triangle', rnd(2300, 3100), rnd(1900, 2400), t, 0.03, vol * 0.7, 0.001);
  noise(c, 'highpass', 4000, 4000, t, 0.018, vol, 0.7, 0.001);
}

/** Choque seco de algo duro (ficha, dado, bola). */
function clack(c: Ctx, t: number, vol: number, f = 2600) {
  noise(c, 'bandpass', f, f * 0.8, t, 0.035, vol, 1.6, 0.001);
  tone(c, 'triangle', f * 0.5 + rnd(-120, 120), f * 0.42, t, 0.045, vol * 0.35, 0.001);
}

/** Golpe grave de madera/metal. */
function thud(c: Ctx, t: number, vol: number, f = 170) {
  tone(c, 'sine', f, f * 0.45, t, 0.16, vol, 0.002);
  noise(c, 'lowpass', 900, 200, t, 0.09, vol * 0.6, 0.7, 0.001);
}

function coins(c: Ctx, t: number, count: number, span: number, vol: number) {
  for (let i = 0; i < count; i++) {
    const at = t + Math.pow(i / count, 1.3) * span + rnd(0, 0.03);
    const f = rnd(2400, 4600);
    tone(c, 'triangle', f, f * 0.98, at, 0.14, vol, 0.001);
    tone(c, 'sine', f * 1.51, f * 1.5, at, 0.1, vol * 0.45, 0.001);
  }
}

function arp(c: Ctx, t: number, notes: number[], step: number, dur: number, vol: number) {
  notes.forEach((f, i) => {
    tone(c, 'triangle', f, f, t + i * step, dur, vol, 0.004);
    tone(c, 'square', f * 2, f * 2, t + i * step, dur * 0.6, vol * 0.12, 0.004);
  });
}

export const casinoSfx = {
  /** Poner una ficha en el tapete. */
  chip() {
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    clack(c, t, 0.16, 3400);
    clack(c, t + 0.045, 0.08, 3000);
  },

  /** Giro de ruleta: lanzamiento + bola rodando que frena + rebotes al caer en la casilla. */
  rouletteSpin(ms: number) {
    const c = ready(); if (!c) return;
    const t0 = c.currentTime;
    const T = ms / 1000;
    const ballEnd = T - 0.3;
    // Lanzamiento
    noise(c, 'bandpass', 700, 2800, t0, 0.4, 0.12, 1.2, 0.02);
    tone(c, 'triangle', 900, 500, t0, 0.12, 0.05);
    // Rodadura continua (va perdiendo fuerza)
    noise(c, 'lowpass', 650, 160, t0 + 0.05, ballEnd, 0.09, 0.9, 0.15);
    tone(c, 'sine', 95, 55, t0 + 0.05, ballEnd, 0.04, 0.2);
    // Golpecitos contra los separadores, cada vez más espaciados
    const stopTicks = ballEnd - 0.55;
    for (let t = 0.12; t < stopTicks;) {
      const p = t / stopTicks;
      tick(c, t0 + t, 0.05 * (1 - p * 0.4));
      t += (0.035 + 0.36 * Math.pow(p, 2.4)) * rnd(0.85, 1.15);
    }
    // Rebotes dentro de la casilla
    [[-0.5, 0.13], [-0.32, 0.1], [-0.19, 0.07], [-0.09, 0.045], [0, 0.03]].forEach(([d, v]) => clack(c, t0 + ballEnd + d, v, rnd(2600, 3200)));
  },

  /** Palanca de la tragamonedas: carraca + golpe + muelle de vuelta. */
  slotsLever() {
    const c = ready(); if (!c) return;
    const t0 = c.currentTime;
    for (let i = 0; i < 7; i++) {
      const t = t0 + 0.04 + i * 0.035;
      noise(c, 'highpass', 2600, 2600, t, 0.014, 0.07, 0.7, 0.001);
      tone(c, 'square', 850, 700, t, 0.012, 0.02, 0.001);
    }
    thud(c, t0 + 0.32, 0.28, 140);
    clack(c, t0 + 0.32, 0.08, 1600);
    tone(c, 'triangle', 170, 280, t0 + 0.42, 0.28, 0.05, 0.01);
    noise(c, 'bandpass', 1200, 500, t0 + 0.42, 0.25, 0.04, 2, 0.01);
  },

  /** Rodillos girando: zumbido + tic-tic de símbolos + golpe al parar cada rodillo. */
  slotsReels(reelMs: number[]) {
    const c = ready(); if (!c) return;
    const t0 = c.currentTime;
    const stops = reelMs.map((m) => m / 1000);
    const last = stops[stops.length - 1];
    tone(c, 'sawtooth', 62, 48, t0, last, 0.025, 0.08);
    noise(c, 'lowpass', 500, 220, t0, last, 0.05, 0.8, 0.08);
    for (let t = 0.03; t < last - 0.05;) {
      const active = stops.filter((s) => s > t + 0.04).length;
      if (active === 0) break;
      tone(c, 'triangle', rnd(1300, 1700), 1200, t0 + t, 0.018, 0.018 + 0.01 * active, 0.001);
      t += (0.028 + 0.03 * (stops.length - active)) * rnd(0.9, 1.1);
    }
    stops.forEach((s, i) => {
      const big = i === stops.length - 1;
      thud(c, t0 + s, big ? 0.3 : 0.22, big ? 150 : 185);
      clack(c, t0 + s, big ? 0.12 : 0.09, 1500);
      tone(c, 'triangle', 880 + i * 220, 880 + i * 220, t0 + s + 0.01, 0.12, 0.035, 0.002);
    });
  },

  /** Tirada de dados: lanzamiento, rebotes sincronizados con la animación y traqueteo. */
  diceRoll(ms: number, count: number, stagger = 0.12) {
    const c = ready(); if (!c) return;
    const t0 = c.currentTime;
    const T = ms / 1000;
    noise(c, 'bandpass', 500, 1800, t0, 0.3, 0.07, 1, 0.02);
    for (let i = 0; i < 6; i++) clack(c, t0 + 0.02 + i * 0.04 + rnd(0, 0.02), 0.06, rnd(2200, 3400));
    if (T < 1) {
      for (let i = 0; i < count; i++) clack(c, t0 + T * 0.8 + i * 0.03, 0.14, rnd(2000, 2800));
      return;
    }
    const bounces: [number, number][] = [[0.36, 0.2], [0.64, 0.12], [0.84, 0.07]];
    for (let i = 0; i < count; i++) {
      const d = i * stagger;
      bounces.forEach(([p, v], b) => {
        const t = t0 + d + p * T + rnd(-0.01, 0.01);
        thud(c, t, v * 0.9, rnd(150, 200));
        clack(c, t, v, rnd(2000, 3000));
        for (let k = 1; k <= 3 - b; k++) clack(c, t + k * rnd(0.05, 0.08), v * 0.35 / k, rnd(2400, 3600));
      });
    }
  },

  /** Premio: 'small' normal, 'big' grande, 'jackpot' máximo. */
  win(level: 'small' | 'big' | 'jackpot' = 'small') {
    const c = ready(); if (!c) return;
    const t = c.currentTime + 0.02;
    const C6 = [1047, 1319, 1568, 2093];
    arp(c, t, C6, 0.08, 0.22, 0.08);
    coins(c, t + 0.1, level === 'small' ? 10 : 24, level === 'small' ? 0.6 : 1.4, 0.035);
    if (level === 'small') return;
    arp(c, t + 0.4, [1175, 1480, 1760, 2349], 0.08, 0.22, 0.08);
    [1047, 1319, 1568].forEach((f) => tone(c, 'triangle', f, f, t + 0.8, 0.9, 0.06, 0.01));
    if (level === 'jackpot') {
      for (let i = 0; i < 6; i++) {
        const at = t + 1.2 + i * 0.22;
        tone(c, 'square', 1568, 1568, at, 0.1, 0.03, 0.002);
        tone(c, 'square', 2093, 2093, at + 0.11, 0.1, 0.03, 0.002);
      }
      coins(c, t + 1.2, 30, 1.6, 0.03);
      arp(c, t + 2.6, [1047, 1319, 1568, 2093, 2637], 0.07, 0.5, 0.07);
    }
  },

  /** Silbato de árbitro (trino). */
  whistle(long = false) {
    const c = ready(); if (!c) return;
    const t = c.currentTime + 0.01;
    const blasts = long ? [[0, 0.7]] : [[0, 0.16], [0.22, 0.42]];
    blasts.forEach(([at, dur]) => {
      const steps = Math.floor(dur / 0.028);
      for (let i = 0; i < steps; i++) {
        const f = i % 2 ? 2950 : 2700;
        tone(c, 'sine', f, f, t + at + i * 0.028, 0.034, 0.05, 0.003);
      }
      noise(c, 'bandpass', 2800, 2800, t + at, dur, 0.035, 3, 0.01);
    });
  },

  /** Grito de la grada (gol / premio). */
  crowd(level: 'small' | 'big' = 'small') {
    const c = ready(); if (!c) return;
    const t = c.currentTime + 0.02;
    const len = level === 'big' ? 2.6 : 1.5;
    noise(c, 'bandpass', 500, 1300, t, len, 0.12, 0.6, 0.25);
    noise(c, 'bandpass', 1100, 2200, t + 0.1, len * 0.9, 0.06, 0.8, 0.3);
    noise(c, 'lowpass', 400, 250, t, len, 0.06, 0.7, 0.2);
  },

  /** Sin premio: dos notas suaves descendentes. */
  lose() {
    const c = ready(); if (!c) return;
    const t = c.currentTime + 0.02;
    tone(c, 'triangle', 392, 370, t, 0.2, 0.07, 0.01);
    tone(c, 'triangle', 311, 262, t + 0.18, 0.4, 0.07, 0.01);
  },
};
