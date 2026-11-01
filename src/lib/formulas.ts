// Formulas del juego Falco-X Universo
// Basadas en las formulas clasicas de OGame/XNova

import { getSpeed, BASE_PRODUCTION, PRODUCTION_FORMULA, BASE_STORAGE } from './constants';

// ============================================
// FORMULAS DE PRODUCCION DE RECURSOS
// ============================================

// Produccion de metal por hora
export function calculateMetalProduction(mineLevel: number): number {
  const speed = getSpeed();
  if (mineLevel === 0) return BASE_PRODUCTION.METAL * speed.RESOURCE;
  return Math.floor(
    30 * mineLevel * Math.pow(PRODUCTION_FORMULA.METAL_FACTOR, mineLevel) * speed.RESOURCE
  );
}

// Produccion de cristal por hora
export function calculateCrystalProduction(mineLevel: number): number {
  const speed = getSpeed();
  if (mineLevel === 0) return BASE_PRODUCTION.CRYSTAL * speed.RESOURCE;
  return Math.floor(
    20 * mineLevel * Math.pow(PRODUCTION_FORMULA.CRYSTAL_FACTOR, mineLevel) * speed.RESOURCE
  );
}

// Produccion de deuterio por hora (afectada por temperatura)
export function calculateDeuteriumProduction(synthLevel: number, maxTemp: number): number {
  const speed = getSpeed();
  if (synthLevel === 0) return 0;
  const tempFactor = 1.36 - 0.004 * maxTemp;
  return Math.floor(
    10 * synthLevel * Math.pow(PRODUCTION_FORMULA.DEUTERIUM_FACTOR, synthLevel) * tempFactor * speed.RESOURCE
  );
}

// ============================================
// FORMULAS DE ENERGIA
// ============================================

// Consumo de energia de mina de metal
export function calculateMetalEnergyConsumption(level: number): number {
  if (level === 0) return 0;
  return Math.ceil(10 * level * Math.pow(PRODUCTION_FORMULA.ENERGY_FACTOR, level));
}

// Consumo de energia de mina de cristal
export function calculateCrystalEnergyConsumption(level: number): number {
  if (level === 0) return 0;
  return Math.ceil(10 * level * Math.pow(PRODUCTION_FORMULA.ENERGY_FACTOR, level));
}

// Consumo de energia de sintetizador de deuterio
export function calculateDeuteriumEnergyConsumption(level: number): number {
  if (level === 0) return 0;
  return Math.ceil(10 * level * Math.pow(PRODUCTION_FORMULA.ENERGY_FACTOR, level));
}

export function calculateSolarPositionFactor(position: number): number {
  return Math.max(0.75, 1 + (8 - position) * 0.025);
}

// El servidor no aplica factor de posicion: 20 * nivel * 1.1^nivel
export function calculateSolarPlantEnergy(level: number, _position: number = 8): number {
  if (level === 0) return 0;
  return Math.floor(20 * level * Math.pow(PRODUCTION_FORMULA.ENERGY_FACTOR, level));
}

// Produccion de energia de reactor de fusion (servidor: 30 * nivel * 1.1^nivel)
export function calculateFusionReactorEnergy(level: number, _energyTechLevel: number = 0): number {
  if (level === 0) return 0;
  return Math.floor(30 * level * Math.pow(PRODUCTION_FORMULA.ENERGY_FACTOR, level));
}

// Consumo de deuterio del reactor de fusion por hora
export function calculateFusionReactorConsumption(level: number): number {
  if (level === 0) return 0;
  return Math.ceil(10 * level * Math.pow(1.1, level));
}

// Energia por satelite solar (servidor: 20 * (1 + energy_tech * 0.05))
export function calculateSolarSatelliteEnergy(energyTechLevel: number): number {
  return Math.floor(20 * (1 + energyTechLevel * 0.05));
}

// ============================================
// FORMULAS DE ALMACENAMIENTO
// ============================================

export function calculateStorageCapacity(level: number): number {
  return Math.floor(5000 * Math.floor(2.5 * Math.exp((20 * level) / 33)));
}

// ============================================
// FORMULAS DE COSTOS
// ============================================

// Costo de edificio para siguiente nivel
export function calculateBuildingCost(
  baseMetal: number,
  baseCrystal: number,
  baseDeuterium: number,
  costFactor: number,
  currentLevel: number
): { metal: number; crystal: number; deuterium: number } {
  return {
    metal: Math.floor(baseMetal * Math.pow(costFactor, currentLevel)),
    crystal: Math.floor(baseCrystal * Math.pow(costFactor, currentLevel)),
    deuterium: Math.floor(baseDeuterium * Math.pow(costFactor, currentLevel)),
  };
}

// Costo de investigacion para siguiente nivel
export function calculateResearchCost(
  baseMetal: number,
  baseCrystal: number,
  baseDeuterium: number,
  costFactor: number,
  currentLevel: number
): { metal: number; crystal: number; deuterium: number } {
  return {
    metal: Math.floor(baseMetal * Math.pow(costFactor, currentLevel)),
    crystal: Math.floor(baseCrystal * Math.pow(costFactor, currentLevel)),
    deuterium: Math.floor(baseDeuterium * Math.pow(costFactor, currentLevel)),
  };
}

// ============================================
// FORMULAS DE TIEMPO
// ============================================

// VIP Plus: los tiempos de construccion/investigacion/astillero se dividen
// por este factor. DEBE coincidir con game_settings.vip_time_speed_multiplier
// (backend: public.apply_vip_time_bonus).
export const VIP_TIME_SPEED_MULTIPLIER = 2;

// Tiempo de construccion de edificio en segundos
export function calculateBuildingTime(
  metalCost: number,
  crystalCost: number,
  roboticsLevel: number,
  naniteLevel: number,
  isVip: boolean = false
): number {
  const speed = getSpeed();
  const baseTime = (metalCost + crystalCost) / (2500 * (1 + roboticsLevel));
  const naniteReduction = Math.pow(2, naniteLevel);
  let time = Math.max(1, Math.floor((baseTime * 3600) / naniteReduction / speed.GAME));
  if (isVip) time = Math.max(1, Math.floor(time / VIP_TIME_SPEED_MULTIPLIER));
  return time;
}

// Tiempo de investigacion en segundos
export function calculateResearchTime(
  metalCost: number,
  crystalCost: number,
  labLevel: number,
  networkLevel: number = 0
): number {
  const speed = getSpeed();
  const effectiveLabLevel = labLevel + networkLevel;
  const baseTime = (metalCost + crystalCost) / (1000 * (1 + effectiveLabLevel));
  return Math.max(1, Math.floor((baseTime * 3600) / speed.GAME));
}

// Tiempo de construccion de naves/defensas en segundos
export function calculateShipyardTime(
  metalCost: number,
  crystalCost: number,
  shipyardLevel: number,
  naniteLevel: number,
  isVip: boolean = false
): number {
  const speed = getSpeed();
  const baseTime = (metalCost + crystalCost) / (2500 * (1 + shipyardLevel));
  const naniteReduction = Math.pow(2, naniteLevel);
  let time = Math.max(1, Math.floor((baseTime * 3600) / naniteReduction / speed.GAME));
  if (isVip) time = Math.max(1, Math.floor(time / VIP_TIME_SPEED_MULTIPLIER));
  return time;
}

// ============================================
// FORMULAS DE FLOTAS
// ============================================

export interface ShipSpeedTechLevels {
  combustionLevel: number;
  impulseLevel: number;
  hyperspaceLevel: number;
}

const COMBUSTION_SHIPS = ['small_cargo', 'large_cargo', 'light_fighter', 'espionage_probe', 'recycler', 'mega_recycler', 'large_frigate'];
const IMPULSE_SHIPS = ['heavy_fighter', 'cruiser', 'battleship', 'battlecruiser', 'bomber', 'colony_ship'];
const HYPERSPACE_SHIPS = ['destroyer', 'deathstar', 'pathfinder', 'star_destroyer', 'black_moon', 'falco_x_clasica', 'nova', 'destruccion_masiva'];

export function calculateShipSpeedWithBonus(
  shipCode: string,
  baseSpeed: number,
  techLevels: ShipSpeedTechLevels
): number {
  if (!baseSpeed) return 0;

  let bonus = 0;

  if (COMBUSTION_SHIPS.includes(shipCode)) {
    bonus = techLevels.combustionLevel * 0.10;
  } else if (IMPULSE_SHIPS.includes(shipCode)) {
    bonus = techLevels.impulseLevel * 0.20;
  } else if (HYPERSPACE_SHIPS.includes(shipCode)) {
    bonus = techLevels.hyperspaceLevel * 0.30;
  }

  return Math.floor(baseSpeed * (1 + bonus));
}

// Tiempo de vuelo en segundos
export function calculateFlightTime(
  distance: number,
  slowestSpeed: number,
  speedPercent: number = 100,
  admiralSpeedBonus: number = 0,
  isVip: boolean = false
): number {
  const speed = getSpeed();
  const effectiveSpeed = slowestSpeed * (speedPercent / 100);
  let flightTime = Math.max(
    10,
    Math.round((35000 / (speedPercent / 100) * Math.sqrt(distance * 10 / effectiveSpeed) + 10) / speed.FLEET)
  );
  // Admiral bonus: 20% faster fleets (divide by 1.2)
  if (admiralSpeedBonus > 0) {
    flightTime = Math.max(10, Math.round(flightTime / (1 + admiralSpeedBonus)));
  }
  // VIP Plus: -10% flight time (stacks with Admiral)
  if (isVip) {
    flightTime = Math.max(10, Math.floor(flightTime * 0.90));
  }
  return flightTime;
}

// Distancia entre coordenadas
export function calculateDistance(
  originGalaxy: number,
  originSystem: number,
  originPosition: number,
  targetGalaxy: number,
  targetSystem: number,
  targetPosition: number
): number {
  if (originGalaxy !== targetGalaxy) {
    return Math.abs(originGalaxy - targetGalaxy) * 20000;
  }
  if (originSystem !== targetSystem) {
    return Math.abs(originSystem - targetSystem) * 95 + 2700;
  }
  if (originPosition !== targetPosition) {
    return Math.abs(originPosition - targetPosition) * 5 + 1000;
  }
  return 5;
}

// Consumo de combustible
export function calculateFuelConsumption(
  distance: number,
  shipConsumption: number,
  quantity: number,
  speedPercent: number = 100
): number {
  const consumption = shipConsumption * quantity;
  const distanceFactor = distance / 35000;
  const speedFactor = (speedPercent / 100) + 1;
  return Math.ceil(consumption * distanceFactor * speedFactor);
}

// ============================================
// FORMULAS DE COMBATE
// ============================================

// Poder de ataque con tecnologia
export function calculateAttackPower(baseAttack: number, weaponsTechLevel: number): number {
  return Math.floor(baseAttack * (1 + weaponsTechLevel * 0.1));
}

// Poder de escudo con tecnologia
export function calculateShieldPower(baseShield: number, shieldTechLevel: number): number {
  return Math.floor(baseShield * (1 + shieldTechLevel * 0.1));
}

// Integridad estructural con tecnologia
export function calculateHullPoints(baseHull: number, armourTechLevel: number): number {
  return Math.floor(baseHull * (1 + armourTechLevel * 0.1));
}

// ============================================
// FORMULAS DE PUNTOS
// ============================================

// Puntos por recursos gastados
export function calculatePoints(metal: number, crystal: number, deuterium: number): number {
  return Math.floor((metal + crystal + deuterium) / 1000);
}

// ============================================
// FORMULAS DE PLANETAS
// ============================================

// Campos maximos basado en posicion
export function calculateMaxFields(position: number, diameter: number): number {
  const baseFields = Math.floor(Math.pow(diameter / 1000, 2));

  const positionBonus: Record<number, number> = {
    1: -30, 2: -20, 3: -10,
    4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0,
    10: 5, 11: 10, 12: 15, 13: 20, 14: 15, 15: 10,
  };

  return Math.max(40, baseFields + (positionBonus[position] || 0));
}

// Campos adicionales por Terraformer (exponencial)
export function calculateTerraformerFields(terraformerLevel: number): number {
  if (terraformerLevel <= 0) return 0;
  return Math.floor(5 * Math.pow(terraformerLevel, 1.3));
}

// Campos totales del planeta incluyendo terraformer
export function calculateTotalFields(position: number, diameter: number, terraformerLevel: number): number {
  return calculateMaxFields(position, diameter) + calculateTerraformerFields(terraformerLevel);
}

// Temperatura basada en posicion
export function calculateTemperature(position: number): { min: number; max: number } {
  const baseTemp: Record<number, { min: number; max: number }> = {
    1: { min: 220, max: 260 },
    2: { min: 170, max: 210 },
    3: { min: 120, max: 160 },
    4: { min: 70, max: 110 },
    5: { min: 60, max: 100 },
    6: { min: 50, max: 90 },
    7: { min: 40, max: 80 },
    8: { min: 30, max: 70 },
    9: { min: 20, max: 60 },
    10: { min: 10, max: 50 },
    11: { min: 0, max: 40 },
    12: { min: -10, max: 30 },
    13: { min: -50, max: -10 },
    14: { min: -90, max: -50 },
    15: { min: -130, max: -90 },
  };

  const base = baseTemp[position] || { min: 0, max: 50 };
  const variance = Math.floor(Math.random() * 40) - 20;

  return {
    min: base.min + variance,
    max: base.max + variance,
  };
}

// Diametro aleatorio basado en posicion
export function calculateDiameter(position: number): number {
  const baseDiameter: Record<number, number> = {
    1: 8000, 2: 9000, 3: 10000,
    4: 12000, 5: 13000, 6: 14000, 7: 15000, 8: 16000, 9: 15000,
    10: 14000, 11: 13000, 12: 12000, 13: 10000, 14: 9000, 15: 8000,
  };

  const base = baseDiameter[position] || 12000;
  const variance = Math.floor(Math.random() * 4000) - 2000;

  return Math.max(5000, base + variance);
}

// ============================================
// FORMULAS DE OFICIALES (BONIFICACIONES)
// ============================================

export interface OfficerBonuses {
  hasCommander: boolean;
  hasAdmiral: boolean;
  hasEngineer: boolean;
  hasGeologist: boolean;
  hasTechnocrat: boolean;
}

export function calculateMineProductionWithBonus(
  baseProduction: number,
  bonuses: OfficerBonuses
): number {
  if (bonuses.hasGeologist) {
    return Math.floor(baseProduction * 1.1);
  }
  return baseProduction;
}

export function calculateEnergyProductionWithBonus(
  baseEnergy: number,
  bonuses: OfficerBonuses
): number {
  if (bonuses.hasEngineer) {
    return Math.floor(baseEnergy * 1.1);
  }
  return baseEnergy;
}

export function calculateResearchTimeWithBonus(
  baseTime: number,
  bonuses: OfficerBonuses,
  isVip: boolean = false
): number {
  let time = baseTime;
  if (bonuses.hasTechnocrat) {
    time = Math.floor(time * 0.75);
  }
  // VIP Plus: investigacion x2 mas rapida (se acumula con Tecnocrata)
  if (isVip) {
    time = Math.max(1, Math.floor(time / VIP_TIME_SPEED_MULTIPLIER));
  }
  return time;
}

export function calculateBuildingQueueSlots(bonuses: OfficerBonuses): number {
  const baseSlots = 3;
  if (bonuses.hasCommander) {
    return 5;
  }
  return baseSlots;
}

export function calculateFleetSlots(computerTechLevel: number, bonuses: OfficerBonuses): number {
  const baseSlots = 1 + computerTechLevel;
  if (bonuses.hasAdmiral) {
    return baseSlots + 2;
  }
  return baseSlots;
}

export function calculateEffectiveSpyLevel(
  espionageTechLevel: number,
  bonuses: OfficerBonuses
): number {
  if (bonuses.hasTechnocrat) {
    return espionageTechLevel + 2;
  }
  return espionageTechLevel;
}

export function calculateDefenseLossReduction(bonuses: OfficerBonuses): number {
  if (bonuses.hasEngineer) {
    return 0.5;
  }
  return 1.0;
}

// ============================================
// FORMULAS DE IRN (RED DE INVESTIGACION INTERGALACTICA)
// ============================================

// Calcula el nivel efectivo de laboratorio sumando labs de colonias
export function calculateEffectiveLabLevel(
  mainLabLevel: number,
  otherLabLevels: number[],
  irnLevel: number
): number {
  if (irnLevel === 0 || otherLabLevels.length === 0) {
    return mainLabLevel;
  }

  const sortedLabs = [...otherLabLevels].sort((a, b) => b - a);
  const labsToInclude = Math.min(irnLevel, sortedLabs.length);
  const bonusLevels = sortedLabs.slice(0, labsToInclude).reduce((sum, level) => sum + level, 0);

  return mainLabLevel + bonusLevels;
}

// ============================================
// FORMULAS DE LUNAS
// ============================================

// Probabilidad de creacion de luna basada en escombros
export function calculateMoonChance(debrisMetal: number, debrisCrystal: number): number {
  const totalDebris = debrisMetal + debrisCrystal;
  const chance = Math.floor(totalDebris / 100000);
  return Math.min(20, Math.max(0, chance));
}

// Diametro de luna basado en probabilidad
export function calculateMoonDiameter(moonChance: number): number {
  const baseSize = 8000;
  const variance = Math.floor(Math.random() * 1000);
  return Math.floor(baseSize + (moonChance * 100) + variance);
}

// Campos de luna: siempre 1 campo base (igual que OGame)
// Lunar Base agrega +3 campos por nivel
export function calculateMoonFields(diameter: number): number {
  return 1;
}

// ============================================
// FORMULAS DE PROTECCION DE NOVATOS
// ============================================

// Verifica si un jugador puede atacar a otro basado en puntos
export function canAttackPlayer(
  attackerPoints: number,
  defenderPoints: number,
  noobProtectionLimit: number
): { canAttack: boolean; reason: string | null } {
  // Big player cannot attack noob
  if (defenderPoints <= noobProtectionLimit && attackerPoints > noobProtectionLimit) {
    return { canAttack: false, reason: 'El jugador esta bajo proteccion de novatos' };
  }

  // Noob cannot attack big player (mirror rule)
  if (attackerPoints <= noobProtectionLimit && defenderPoints > noobProtectionLimit) {
    return { canAttack: false, reason: 'El jugador es demasiado fuerte' };
  }

  const pointsRatio = attackerPoints / Math.max(1, defenderPoints);
  const reverseRatio = defenderPoints / Math.max(1, attackerPoints);

  if (pointsRatio > 5) {
    return { canAttack: false, reason: 'El jugador es demasiado debil (ratio 5:1)' };
  }

  if (reverseRatio > 5 && defenderPoints > noobProtectionLimit) {
    return { canAttack: false, reason: 'El jugador es demasiado fuerte (ratio 1:5)' };
  }

  return { canAttack: true, reason: null };
}

// ============================================
// FORMULAS DE ACS (SISTEMA DE COMBATE DE ALIANZA)
// ============================================

// Maximo de flotas en un ACS basado en nivel de alianza
export function calculateMaxACSFleets(allianceLevel: number): number {
  return Math.min(5, 1 + Math.floor(allianceLevel / 2));
}

// Tiempo de espera maximo para un ACS
export function calculateACSHoldTime(slowestFlightTime: number): number {
  return Math.floor(slowestFlightTime * 0.3);
}

// ============================================
// FORMULAS DE EXPEDICIONES
// ============================================

// Slots de expedicion basados en astrofisica
export function calculateExpeditionSlots(astrophysicsLevel: number): number {
  return Math.floor(Math.sqrt(astrophysicsLevel));
}

// Duracion maxima de expedicion
export function calculateExpeditionDuration(astrophysicsLevel: number): number {
  return Math.min(20, 1 + Math.floor(astrophysicsLevel / 3));
}

// Maximas colonias basadas en astrofisica
export function calculateMaxColonies(astrophysicsLevel: number): number {
  return Math.floor((astrophysicsLevel + 1) / 2);
}
