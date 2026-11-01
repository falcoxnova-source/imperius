// Constantes del juego Falco-X Universo
import { useAdminStore } from '../store/adminStore';

// Configuracion del universo
export const UNIVERSE = {
  MAX_GALAXIES: 5,
  MAX_SYSTEMS: 499,
  MAX_POSITIONS: 15,
  EXPEDITION_POSITION: 16,
};

// Multiplicadores de velocidad dinamicos (se cargan del servidor)
export const getSpeed = () => {
  const speeds = useAdminStore.getState().speeds;
  return {
    GAME: speeds.game_speed,
    FLEET: speeds.fleet_speed,
    RESOURCE: speeds.resource_speed,
  };
};

// Valores por defecto (usados antes de cargar del servidor)
export const SPEED = {
  GAME: 10,
  FLEET: 10,
  RESOURCE: 10,
};

// Produccion base por hora
export const BASE_PRODUCTION = {
  METAL: 30,
  CRYSTAL: 15,
  DEUTERIUM: 0,
};

// Formulas de produccion
export const PRODUCTION_FORMULA = {
  METAL_FACTOR: 1.1,
  CRYSTAL_FACTOR: 1.1,
  DEUTERIUM_FACTOR: 1.1,
  ENERGY_FACTOR: 1.1,
};

// Formulas de costos
export const COST_FORMULA = {
  BUILDING_FACTOR: 1.5,
  RESEARCH_FACTOR: 2.0,
};

// Almacenamiento base
export const BASE_STORAGE = {
  INITIAL: 10000,
  FACTOR: 2.5,
};

// Combate
export const COMBAT = {
  MAX_ROUNDS: 6,
  DEBRIS_FACTOR: 0.3,
  DEFENSE_REPAIR_CHANCE: 0.7,
};

// Tiempos de proteccion
export const PROTECTION = {
  NEWBIE_POINTS: 5000,
  VACATION_MIN_DAYS: 3,
};

// Categorias de edificios
export const BUILDING_CATEGORIES = {
  RESOURCES: 'resources',
  STORAGE: 'storage',
  FACILITIES: 'facilities',
} as const;

// Categorias de tecnologias
export const TECH_CATEGORIES = {
  BASIC: 'basic',
  PROPULSION: 'propulsion',
  MILITARY: 'military',
  ADVANCED: 'advanced',
} as const;

// Categorias de naves
export const SHIP_CATEGORIES = {
  CIVIL: 'civil',
  COMBAT: 'combat',
  SPECIAL: 'special',
} as const;

// Tipos de misiones
export const MISSION_TYPES = {
  ATTACK: 'attack',
  TRANSPORT: 'transport',
  DEPLOY: 'deploy',
  COLONIZE: 'colonize',
  ESPIONAGE: 'espionage',
  RECYCLE: 'recycle',
  DESTROY: 'destroy',
  EXPEDITION: 'expedition',
  HOLD: 'hold',
} as const;

// Iconos de recursos (usando emojis)
export const RESOURCE_ICONS = {
  METAL: '⚙️',
  CRYSTAL: '💎',
  DEUTERIUM: '⚡',
  ENERGY: '☀️',
  DARK_MATTER: '🌑',
};

// Nombres de recursos en español
export const RESOURCE_NAMES = {
  METAL: 'Metal',
  CRYSTAL: 'Cristal',
  DEUTERIUM: 'Deuterio',
  ENERGY: 'Energía',
  DARK_MATTER: 'Materia Oscura',
};
