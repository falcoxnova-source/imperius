/**
 * dataCache.ts - Sistema de cache para datos estaticos
 *
 * Reduce el consumo de datos al cachear informacion que no cambia frecuentemente:
 * - Tipos de edificios, tecnologias, naves, defensas
 * - Requisitos de construccion/investigacion
 *
 * Los datos se guardan en localStorage con versionado para invalidacion
 */

const CACHE_VERSION = 'v15';
const CACHE_PREFIX = 'falcox_cache_';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas en ms

interface CacheEntry<T> {
  version: string;
  timestamp: number;
  data: T;
}

function getCacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

export function getFromCache<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(getCacheKey(key));
    if (!stored) return null;

    const entry: CacheEntry<T> = JSON.parse(stored);

    if (entry.version !== CACHE_VERSION) {
      localStorage.removeItem(getCacheKey(key));
      return null;
    }

    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      localStorage.removeItem(getCacheKey(key));
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

export function setToCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      data,
    };
    localStorage.setItem(getCacheKey(key), JSON.stringify(entry));
  } catch {
    // localStorage puede estar lleno, ignoramos el error
  }
}

export function clearCache(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // Ignoramos errores
  }
}

export function isCacheValid(key: string): boolean {
  return getFromCache(key) !== null;
}

export const CACHE_KEYS = {
  BUILDING_TYPES: 'building_types',
  TECHNOLOGY_TYPES: 'technology_types',
  SHIP_TYPES: 'ship_types',
  DEFENSE_TYPES: 'defense_types',
  BUILDING_REQUIREMENTS: 'building_requirements',
  TECHNOLOGY_REQUIREMENTS: 'technology_requirements',
  SHIP_REQUIREMENTS: 'ship_requirements',
  DEFENSE_REQUIREMENTS: 'defense_requirements',
} as const;
