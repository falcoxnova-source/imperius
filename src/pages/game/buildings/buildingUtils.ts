/**
 * Building Utilities - Funciones helper para la pagina de edificios
 * Basado en la logica de XNova/OGame
 */

import {
  calculateMetalProduction,
  calculateCrystalProduction,
  calculateDeuteriumProduction,
  calculateMetalEnergyConsumption,
  calculateCrystalEnergyConsumption,
  calculateDeuteriumEnergyConsumption,
  calculateSolarPlantEnergy,
  calculateFusionReactorEnergy,
  calculateFusionReactorConsumption,
  calculateStorageCapacity,
} from '../../../lib/formulas';

/**
 * Informacion de produccion/energia/almacenamiento de un edificio
 */
export interface BuildingProductionInfo {
  currentProduction?: number;
  nextProduction?: number;
  currentEnergy?: number;
  nextEnergy?: number;
  isEnergyProducer?: boolean;
  currentStorage?: number;
  nextStorage?: number;
  currentDeutConsumption?: number;
  nextDeutConsumption?: number;
}

/**
 * Obtiene la informacion de produccion/energia para un edificio dado su nivel
 *
 * @param code - Codigo interno del edificio (ej: 'metal_mine', 'solar_plant')
 * @param level - Nivel actual del edificio
 * @param tempMax - Temperatura maxima del planeta (afecta deuterio)
 * @param energyTechLevel - Nivel de tecnologia de energia (afecta reactor fusion)
 * @returns Informacion de produccion actual y del siguiente nivel
 */
export function getBuildingProductionInfo(
  code: string,
  level: number,
  tempMax: number,
  energyTechLevel: number,
  position: number = 8
): BuildingProductionInfo {
  switch (code) {
    case 'metal_mine':
      return {
        currentProduction: calculateMetalProduction(level),
        nextProduction: calculateMetalProduction(level + 1),
        currentEnergy: -calculateMetalEnergyConsumption(level),
        nextEnergy: -calculateMetalEnergyConsumption(level + 1),
        isEnergyProducer: false,
      };

    case 'crystal_mine':
      return {
        currentProduction: calculateCrystalProduction(level),
        nextProduction: calculateCrystalProduction(level + 1),
        currentEnergy: -calculateCrystalEnergyConsumption(level),
        nextEnergy: -calculateCrystalEnergyConsumption(level + 1),
        isEnergyProducer: false,
      };

    case 'deuterium_synthesizer':
      return {
        currentProduction: calculateDeuteriumProduction(level, tempMax),
        nextProduction: calculateDeuteriumProduction(level + 1, tempMax),
        currentEnergy: -calculateDeuteriumEnergyConsumption(level),
        nextEnergy: -calculateDeuteriumEnergyConsumption(level + 1),
        isEnergyProducer: false,
      };

    case 'solar_plant':
      return {
        currentEnergy: calculateSolarPlantEnergy(level, position),
        nextEnergy: calculateSolarPlantEnergy(level + 1, position),
        isEnergyProducer: true,
      };

    case 'fusion_reactor':
      return {
        currentEnergy: calculateFusionReactorEnergy(level, energyTechLevel),
        nextEnergy: calculateFusionReactorEnergy(level + 1, energyTechLevel),
        isEnergyProducer: true,
        currentDeutConsumption: calculateFusionReactorConsumption(level),
        nextDeutConsumption: calculateFusionReactorConsumption(level + 1),
      };

    case 'metal_storage':
    case 'crystal_storage':
    case 'deuterium_tank':
      return {
        currentStorage: calculateStorageCapacity(level),
        nextStorage: calculateStorageCapacity(level + 1),
      };

    default:
      return {};
  }
}

/**
 * Edificios que solo pueden construirse en lunas
 */
export const MOON_ONLY_BUILDINGS = ['lunar_base', 'sensor_phalanx', 'jump_gate'];

/**
 * Edificios que solo pueden construirse en planetas (no en lunas)
 */
export const PLANET_ONLY_BUILDINGS = ['terraformer', 'metal_mine', 'crystal_mine', 'deuterium_synthesizer', 'solar_plant', 'fusion_reactor', 'research_lab', 'missile_silo', 'university'];

/**
 * Iconos para cada categoria de edificios
 */
export const CATEGORY_KEYS = {
  resources: 'resources',
  storage: 'storage',
  facilities: 'facilities',
} as const;

export type BuildingCategory = keyof typeof CATEGORY_KEYS;
