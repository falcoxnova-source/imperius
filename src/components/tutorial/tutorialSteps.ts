/**
 * Definicion de los pasos del tutorial guiado para jugadores nuevos.
 *
 * Cada paso resalta un elemento real de la interfaz (via `data-tour`) y avanza
 * solo cuando el jugador realiza la accion indicada.
 */

import type { Language } from '../../lib/i18n';

export type TutorialAdvance =
  /** Avanza cuando el jugador pulsa "Siguiente" */
  | { type: 'manual' }
  /** Avanza cuando el jugador llega a esa ruta */
  | { type: 'route'; path: string }
  /** Avanza cuando el edificio alcanza (o tiene en cola) ese nivel */
  | { type: 'building'; code: string; level: number };

export interface TutorialStep {
  id: string;
  /** Selector CSS del elemento a resaltar. Sin target = tarjeta centrada. */
  target?: string;
  /** Abre el menu lateral en movil antes de resaltar */
  requiresSidebar?: boolean;
  title: Record<Language, string>;
  /** Admite el marcador {level}, que se sustituye por el nivel exigido */
  text: Record<Language, string>;
  advance: TutorialAdvance;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: {
      es: 'Bienvenido, Comandante',
      en: 'Welcome, Commander',
    },
    text: {
      es: 'Acabas de recibir tu primer planeta. Te voy a guiar paso a paso para que empieces con buen pie. Solo tomara un minuto y no volvera a aparecer.',
      en: 'You just received your first planet. I will guide you step by step so you get a strong start. It only takes a minute and will not show again.',
    },
    advance: { type: 'manual' },
  },
  {
    id: 'planet',
    target: '[data-tour="planet-selector"]',
    requiresSidebar: true,
    title: {
      es: 'Tu planeta',
      en: 'Your planet',
    },
    text: {
      es: 'Aqui ves el planeta en el que estas trabajando y sus coordenadas. Cuando tengas mas colonias podras cambiar entre ellas desde aqui.',
      en: 'This is the planet you are working on and its coordinates. Once you have more colonies you can switch between them here.',
    },
    advance: { type: 'manual' },
  },
  {
    id: 'go-buildings',
    target: '[data-tour="nav-buildings"]',
    requiresSidebar: true,
    title: {
      es: 'Paso 1: Entra a Edificios',
      en: 'Step 1: Open Buildings',
    },
    text: {
      es: 'Todo empieza por la economia. Haz clic en "Edificios" para construir y mejorar tus instalaciones.',
      en: 'Everything starts with your economy. Click "Buildings" to construct and upgrade your facilities.',
    },
    advance: { type: 'route', path: '/game/buildings' },
  },
  {
    id: 'metal-mine',
    target: '[data-tour="building-metal_mine"]',
    title: {
      es: 'Paso 2: Sube la Mina de Metal',
      en: 'Step 2: Upgrade the Metal Mine',
    },
    text: {
      es: 'El metal es el recurso mas usado del juego. Pulsa "Mejorar" en la Mina de Metal para subirla al nivel {level}.',
      en: 'Metal is the most used resource in the game. Press "Upgrade" on the Metal Mine to take it to level {level}.',
    },
    advance: { type: 'building', code: 'metal_mine', level: 3 },
  },
  {
    id: 'crystal-mine',
    target: '[data-tour="building-crystal_mine"]',
    title: {
      es: 'Paso 3: Sube la Mina de Cristal',
      en: 'Step 3: Upgrade the Crystal Mine',
    },
    text: {
      es: 'El cristal hace falta para naves, defensas e investigacion. Sube la Mina de Cristal al nivel {level}.',
      en: 'Crystal is needed for ships, defenses and research. Take the Crystal Mine to level {level}.',
    },
    advance: { type: 'building', code: 'crystal_mine', level: 2 },
  },
  {
    id: 'solar-plant',
    target: '[data-tour="building-solar_plant"]',
    title: {
      es: 'Paso 4: Sube la Planta de Energia',
      en: 'Step 4: Upgrade the Solar Plant',
    },
    text: {
      es: 'Sin energia tus minas producen menos. Cada vez que subas minas, sube tambien la Planta de Energia. Llevala al nivel {level}.',
      en: 'Without energy your mines produce less. Every time you upgrade mines, upgrade the Solar Plant too. Take it to level {level}.',
    },
    advance: { type: 'building', code: 'solar_plant', level: 2 },
  },
  {
    id: 'metal-mine-2',
    target: '[data-tour="building-metal_mine"]',
    title: {
      es: 'Paso 5: Repite el ciclo',
      en: 'Step 5: Repeat the cycle',
    },
    text: {
      es: 'Este es el ritmo del juego: minas, energia, minas. Sube la Mina de Metal al nivel {level} y ya tendras una base solida.',
      en: 'This is the rhythm of the game: mines, energy, mines. Take the Metal Mine to level {level} and you will have a solid base.',
    },
    advance: { type: 'building', code: 'metal_mine', level: 4 },
  },
  {
    id: 'go-research',
    target: '[data-tour="nav-research"]',
    requiresSidebar: true,
    title: {
      es: 'Paso 6: Investigacion',
      en: 'Step 6: Research',
    },
    text: {
      es: 'Las tecnologias desbloquean naves, defensas y mejoras. Necesitaras una Academia Imperial. Entra para verlas.',
      en: 'Technologies unlock ships, defenses and upgrades. You will need a Research Lab. Open it to take a look.',
    },
    advance: { type: 'route', path: '/game/research' },
  },
  {
    id: 'go-galaxy',
    target: '[data-tour="nav-galaxy"]',
    requiresSidebar: true,
    title: {
      es: 'Paso 7: Explora la Galaxia',
      en: 'Step 7: Explore the Galaxy',
    },
    text: {
      es: 'Desde la Galaxia ves a tus vecinos, planetas libres para colonizar y objetivos. Echale un vistazo.',
      en: 'From the Galaxy you can see your neighbours, free planets to colonize and targets. Take a look.',
    },
    advance: { type: 'route', path: '/game/galaxy' },
  },
  {
    id: 'go-missions',
    target: '[data-tour="nav-dailyMissions"]',
    requiresSidebar: true,
    title: {
      es: 'Paso 8: Misiones Diarias',
      en: 'Step 8: Daily Missions',
    },
    text: {
      es: 'Cada dia tienes misiones que dan recursos y premios gratis. Pasate por aqui todos los dias.',
      en: 'Every day you get missions that award free resources and prizes. Come back here daily.',
    },
    advance: { type: 'route', path: '/game/daily-missions' },
  },
  {
    id: 'done',
    title: {
      es: 'Tutorial completado',
      en: 'Tutorial completed',
    },
    text: {
      es: 'Ya sabes lo basico: sube minas, mantén la energia, investiga y explora. A partir de aqui el universo es tuyo. Buena suerte, Comandante.',
      en: 'You know the basics now: upgrade mines, keep your energy up, research and explore. From here the universe is yours. Good luck, Commander.',
    },
    advance: { type: 'manual' },
  },
];
