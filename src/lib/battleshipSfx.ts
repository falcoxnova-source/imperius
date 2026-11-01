// Efectos de sonido de la Batalla de Naves, sintetizados con Web Audio (sin archivos).
import { noise, sfxReady as ready, tone, type Ctx } from './sfx';

function laser(c: Ctx, t: number, incoming: boolean) {
  if (incoming) {
    tone(c, 'sawtooth', 700, 70, t, 0.32, 0.14);
    tone(c, 'square', 350, 60, t, 0.3, 0.06);
  } else {
    tone(c, 'square', 1800, 220, t, 0.22, 0.14);
    tone(c, 'sawtooth', 900, 110, t, 0.22, 0.07);
  }
}

function miss(c: Ctx, t: number) {
  noise(c, 'bandpass', 2600, 500, t, 0.28, 0.14, 1.4);
  tone(c, 'sine', 520, 240, t, 0.16, 0.05);
}

function hit(c: Ctx, t: number) {
  tone(c, 'sine', 150, 40, t, 0.45, 0.55);
  noise(c, 'lowpass', 3200, 180, t, 0.55, 0.5);
  tone(c, 'square', 95, 45, t, 0.2, 0.08);
}

function explosion(c: Ctx, t: number) {
  hit(c, t);
  noise(c, 'lowpass', 1800, 70, t + 0.08, 1.5, 0.6);
  tone(c, 'sine', 75, 26, t + 0.05, 1.3, 0.65);
  tone(c, 'triangle', 660, 320, t + 0.15, 0.9, 0.05);
  tone(c, 'triangle', 990, 480, t + 0.18, 0.9, 0.04);
}

export const bsSfx = {
  /** Disparo + impacto sincronizado con la animación (~0.4 s). */
  shot(incoming: boolean, result: 'miss' | 'hit' | 'sunk') {
    const c = ready(); if (!c) return;
    const t = c.currentTime + 0.01;
    laser(c, t, incoming);
    const ti = t + 0.4;
    if (result === 'miss') miss(c, ti);
    else if (result === 'hit') hit(c, ti);
    else {
      explosion(c, ti);
      if (incoming) {
        // alarma: nave propia perdida
        for (let i = 0; i < 4; i++) tone(c, 'square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, ti + 0.35 + i * 0.16, 0.14, 0.06, 0.01);
      } else {
        tone(c, 'triangle', 880, 880, ti + 0.6, 0.18, 0.08);
        tone(c, 'triangle', 1320, 1320, ti + 0.75, 0.35, 0.08);
      }
    }
  },
  battleStart() {
    const c = ready(); if (!c) return;
    const t = c.currentTime + 0.01;
    tone(c, 'sawtooth', 220, 440, t, 0.45, 0.1, 0.05);
    tone(c, 'sawtooth', 220, 440, t + 0.5, 0.45, 0.1, 0.05);
    [440, 554, 659].forEach((f) => tone(c, 'triangle', f, f, t + 1.0, 0.7, 0.07, 0.02));
  },
  tick(last: boolean) {
    const c = ready(); if (!c) return;
    tone(c, 'sine', last ? 1500 : 1000, last ? 1500 : 1000, c.currentTime + 0.01, 0.08, 0.12, 0.003);
  },
  place() {
    const c = ready(); if (!c) return;
    const t = c.currentTime + 0.01;
    tone(c, 'sine', 600, 950, t, 0.09, 0.1);
    noise(c, 'highpass', 4000, 3000, t, 0.04, 0.05);
  },
  deploy() {
    const c = ready(); if (!c) return;
    const t = c.currentTime + 0.01;
    tone(c, 'sawtooth', 250, 1200, t, 0.4, 0.07, 0.02);
    tone(c, 'sine', 500, 2400, t, 0.4, 0.05, 0.02);
  },
  opponentJoined() {
    const c = ready(); if (!c) return;
    const t = c.currentTime + 0.01;
    tone(c, 'triangle', 660, 660, t, 0.18, 0.1);
    tone(c, 'triangle', 990, 990, t + 0.16, 0.35, 0.1);
  },
  end(won: boolean, delay = 0) {
    const c = ready(); if (!c) return;
    const t = c.currentTime + 0.01 + delay;
    if (won) {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, 'triangle', f, f, t + i * 0.13, i === 3 ? 0.9 : 0.16, 0.1));
      [262, 330, 392].forEach((f) => tone(c, 'sine', f, f, t + 0.39, 0.9, 0.06, 0.02));
    } else {
      [392, 330, 277, 196].forEach((f, i) => tone(c, 'triangle', f, f * (i === 3 ? 0.94 : 1), t + i * 0.28, i === 3 ? 1.1 : 0.3, 0.1));
    }
  },
};
