/**
 * Estado del tutorial guiado de inicio.
 *
 * El progreso se guarda en `profiles.tutorial_step` / `profiles.tutorial_completed`
 * para que el tutorial aparezca una sola vez por cuenta, en cualquier dispositivo.
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { TUTORIAL_STEPS } from '../components/tutorial/tutorialSteps';

type TutorialStatus = 'idle' | 'running' | 'done';

interface TutorialProfile {
  id: string;
  tutorial_step?: number;
  tutorial_completed?: boolean;
}

interface TutorialState {
  status: TutorialStatus;
  step: number;
  loadedFor: string | null;
  load: (profile: TutorialProfile) => void;
  next: () => void;
  finish: () => void;
  reset: () => void;
}

const lsKey = (userId: string) => `falcox-tutorial-${userId}`;

function readLocal(userId: string): { step: number; completed: boolean } | null {
  try {
    const raw = localStorage.getItem(lsKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.step !== 'number' || typeof parsed?.completed !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(userId: string, step: number, completed: boolean) {
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify({ step, completed }));
  } catch {
    // almacenamiento no disponible, seguimos con la base de datos
  }
  supabase
    .rpc('set_tutorial_progress', { p_step: step, p_completed: completed })
    .then(({ error }) => {
      if (error) console.error('set_tutorial_progress error:', error.message);
    });
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  status: 'idle',
  step: 0,
  loadedFor: null,

  load: (profile) => {
    if (get().loadedFor === profile.id) return;

    // Si la columna no existe todavia no arrancamos el tutorial para nadie
    if (typeof profile.tutorial_completed !== 'boolean') {
      set({ loadedFor: profile.id, status: 'done' });
      return;
    }

    const local = readLocal(profile.id);
    const completed = profile.tutorial_completed || local?.completed === true;
    const step = Math.min(
      Math.max(profile.tutorial_step ?? 0, local?.step ?? 0),
      TUTORIAL_STEPS.length - 1
    );

    set({
      loadedFor: profile.id,
      status: completed ? 'done' : 'running',
      step: completed ? 0 : step,
    });
  },

  next: () => {
    const { step, loadedFor } = get();
    const nextStep = step + 1;
    if (nextStep >= TUTORIAL_STEPS.length) {
      get().finish();
      return;
    }
    set({ step: nextStep });
    if (loadedFor) persist(loadedFor, nextStep, false);
  },

  finish: () => {
    const { loadedFor } = get();
    set({ status: 'done' });
    if (loadedFor) persist(loadedFor, TUTORIAL_STEPS.length, true);
  },

  reset: () => set({ status: 'idle', step: 0, loadedFor: null }),
}));
