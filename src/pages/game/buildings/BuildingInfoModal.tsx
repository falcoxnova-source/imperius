/**
 * BuildingInfoModal - Modal con informacion detallada de un edificio
 * Muestra tabla de costos/produccion por nivel al estilo XNova
 */

import { useState } from 'react';
import { Building2, X, TrendingUp, ChevronUp, ChevronDown } from 'lucide-react';
import { MediaDisplay } from '../../../components/ui/MediaDisplay';
import {
  calculateBuildingCost,
  calculateBuildingTime,
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
import { formatNumber, formatTime } from '../../../lib/utils';
import { translateBuildingName, getBuildingImage } from '../../../lib/i18n';
import type { BuildingType } from '../../../types/game';

interface BuildingInfoModalProps {
  buildingType: BuildingType;
  currentLevel: number;
  tempMax: number;
  energyTechLevel: number;
  roboticsLevel: number;
  naniteLevel: number;
  position: number;
  isVip?: boolean;
  onClose: () => void;
  t: any;
}

function BuildingIcon({ code, imageUrl, className }: { code: string; imageUrl?: string; className?: string }) {
  if (imageUrl) {
    return (
      <MediaDisplay
        src={imageUrl}
        alt={code}
        className={`${className || 'w-8 h-8'} object-cover rounded-lg`}
      />
    );
  }
  return <Building2 className={className || 'w-8 h-8'} />;
}

export function BuildingInfoModal({
  buildingType,
  currentLevel,
  tempMax,
  energyTechLevel,
  roboticsLevel,
  naniteLevel,
  position,
  isVip = false,
  onClose,
  t,
}: BuildingInfoModalProps) {
  const [showAllLevels, setShowAllLevels] = useState(false);
  const hasImage = !!getBuildingImage(buildingType.code, buildingType.image_url);

  const isProductionBuilding = ['metal_mine', 'crystal_mine', 'deuterium_synthesizer'].includes(
    buildingType.code
  );
  const isEnergyBuilding = ['solar_plant', 'fusion_reactor'].includes(buildingType.code);
  const isStorageBuilding = ['metal_storage', 'crystal_storage', 'deuterium_tank'].includes(
    buildingType.code
  );
  const isFusionReactor = buildingType.code === 'fusion_reactor';

  const getProductionForLevel = (level: number): number => {
    switch (buildingType.code) {
      case 'metal_mine':
        return calculateMetalProduction(level);
      case 'crystal_mine':
        return calculateCrystalProduction(level);
      case 'deuterium_synthesizer':
        return calculateDeuteriumProduction(level, tempMax);
      default:
        return 0;
    }
  };

  const getEnergyForLevel = (level: number): number => {
    switch (buildingType.code) {
      case 'metal_mine':
        return -calculateMetalEnergyConsumption(level);
      case 'crystal_mine':
        return -calculateCrystalEnergyConsumption(level);
      case 'deuterium_synthesizer':
        return -calculateDeuteriumEnergyConsumption(level);
      case 'solar_plant':
        return calculateSolarPlantEnergy(level, position);
      case 'fusion_reactor':
        return calculateFusionReactorEnergy(level, energyTechLevel);
      default:
        return 0;
    }
  };

  const getStorageForLevel = (level: number): number => {
    if (isStorageBuilding) {
      return calculateStorageCapacity(level);
    }
    return 0;
  };

  const maxLevelsToShow = showAllLevels ? buildingType.max_level : 15;
  const levels = Array.from({ length: maxLevelsToShow }, (_, i) => i + 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-space-800 border border-space-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-cyber-blue/20 to-transparent p-6 border-b border-space-600">
          <div className="flex items-start gap-4">
            <div className={`${hasImage ? 'p-1' : 'p-3'} rounded-xl bg-cyber-blue/20 text-cyber-blue`}>
              <BuildingIcon
                code={buildingType.code}
                imageUrl={getBuildingImage(buildingType.code, buildingType.image_url) ?? undefined}
                className={hasImage ? 'w-16 h-16' : 'w-10 h-10'}
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h2 className="font-orbitron text-xl text-white">{translateBuildingName(t, buildingType.code, buildingType.name)}</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-space-700 transition-colors text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-gray-400 text-sm mt-1">{buildingType.description}</p>
              <div className="flex items-center gap-4 mt-3">
                <span className="text-cyber-blue font-orbitron">{t.buildings.currentLevel}: {currentLevel}</span>
                <span className="text-gray-500 text-sm">{t.buildings.maxLevel}: {buildingType.max_level}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Tabla de produccion/energia/almacenamiento */}
          {(isProductionBuilding || isEnergyBuilding || isStorageBuilding) && (
            <div className="mb-6">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyber-blue" />
                {isProductionBuilding
                  ? t.buildings.productionPerLevel
                  : isEnergyBuilding
                    ? t.buildings.energyPerLevel
                    : t.buildings.capacityPerLevel}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-space-600">
                      <th className="text-left py-2 px-3">{t.buildings.tableLevel}</th>
                      {isProductionBuilding && <th className="text-right py-2 px-3">{t.buildings.tableProduction}</th>}
                      {(isProductionBuilding || isEnergyBuilding) && (
                        <th className="text-right py-2 px-3">{t.buildings.tableEnergy}</th>
                      )}
                      {isFusionReactor && <th className="text-right py-2 px-3">{t.resources.deuterium}/h</th>}
                      {isStorageBuilding && <th className="text-right py-2 px-3">{t.buildings.tableCapacity}</th>}
                      <th className="text-right py-2 px-3">{t.buildings.tableMetal}</th>
                      <th className="text-right py-2 px-3">{t.buildings.tableCrystal}</th>
                      <th className="text-right py-2 px-3">{t.buildings.tableTime}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {levels.map((level) => {
                      const cost = calculateBuildingCost(
                        buildingType.base_metal,
                        buildingType.base_crystal,
                        buildingType.base_deuterium,
                        buildingType.cost_factor,
                        level - 1
                      );
                      const buildTime = calculateBuildingTime(
                        cost.metal,
                        cost.crystal,
                        roboticsLevel,
                        naniteLevel,
                        isVip
                      );
                      const production = getProductionForLevel(level);
                      const energy = getEnergyForLevel(level);
                      const storage = getStorageForLevel(level);
                      const isCurrentLevel = level === currentLevel;

                      return (
                        <tr
                          key={level}
                          className={`border-b border-space-700/50 ${
                            isCurrentLevel ? 'bg-cyber-blue/10 text-cyber-blue' : 'text-gray-300'
                          } ${level <= currentLevel ? 'opacity-60' : ''}`}
                        >
                          <td className="py-2 px-3 font-orbitron">
                            {level}
                            {isCurrentLevel && <span className="ml-1 text-xs">(current)</span>}
                          </td>
                          {isProductionBuilding && (
                            <td className="text-right py-2 px-3 text-cyber-green">
                              {formatNumber(production)}
                            </td>
                          )}
                          {(isProductionBuilding || isEnergyBuilding) && (
                            <td
                              className={`text-right py-2 px-3 ${
                                energy >= 0 ? 'text-cyber-green' : 'text-cyber-orange'
                              }`}
                            >
                              {energy >= 0 ? '+' : ''}
                              {formatNumber(energy)}
                            </td>
                          )}
                          {isFusionReactor && (
                            <td className="text-right py-2 px-3 text-cyber-red">
                              -{formatNumber(calculateFusionReactorConsumption(level))}
                            </td>
                          )}
                          {isStorageBuilding && (
                            <td className="text-right py-2 px-3 text-white">
                              {formatNumber(storage)}
                            </td>
                          )}
                          <td className="text-right py-2 px-3">{formatNumber(cost.metal)}</td>
                          <td className="text-right py-2 px-3">{formatNumber(cost.crystal)}</td>
                          <td className="text-right py-2 px-3 text-gray-400">
                            {formatTime(buildTime)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {buildingType.max_level > 15 && (
                <button
                  onClick={() => setShowAllLevels(!showAllLevels)}
                  className="mt-3 text-sm text-cyber-blue hover:text-cyber-blue/80 flex items-center gap-1"
                >
                  {showAllLevels ? (
                    <>
                      <ChevronUp className="w-4 h-4" /> {t.buildings.showFewerLevels}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" /> {t.buildings.showMoreLevels} (up to{' '}
                      {buildingType.max_level})
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Tabla de costos para edificios sin produccion */}
          {!isProductionBuilding && !isEnergyBuilding && !isStorageBuilding && (
            <div className="mb-6">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyber-blue" />
                {t.buildings.costsPerLevel}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-space-600">
                      <th className="text-left py-2 px-3">{t.buildings.tableLevel}</th>
                      <th className="text-right py-2 px-3">{t.buildings.tableMetal}</th>
                      <th className="text-right py-2 px-3">{t.buildings.tableCrystal}</th>
                      <th className="text-right py-2 px-3">{t.buildings.tableDeuterium}</th>
                      <th className="text-right py-2 px-3">{t.buildings.tableTime}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {levels.map((level) => {
                      const cost = calculateBuildingCost(
                        buildingType.base_metal,
                        buildingType.base_crystal,
                        buildingType.base_deuterium,
                        buildingType.cost_factor,
                        level - 1
                      );
                      const buildTime = calculateBuildingTime(
                        cost.metal,
                        cost.crystal,
                        roboticsLevel,
                        naniteLevel,
                        isVip
                      );
                      const isCurrentLevel = level === currentLevel;

                      return (
                        <tr
                          key={level}
                          className={`border-b border-space-700/50 ${
                            isCurrentLevel ? 'bg-cyber-blue/10 text-cyber-blue' : 'text-gray-300'
                          } ${level <= currentLevel ? 'opacity-60' : ''}`}
                        >
                          <td className="py-2 px-3 font-orbitron">
                            {level}
                            {isCurrentLevel && <span className="ml-1 text-xs">({t.buildings.current})</span>}
                          </td>
                          <td className="text-right py-2 px-3">{formatNumber(cost.metal)}</td>
                          <td className="text-right py-2 px-3">{formatNumber(cost.crystal)}</td>
                          <td className="text-right py-2 px-3">{formatNumber(cost.deuterium)}</td>
                          <td className="text-right py-2 px-3 text-gray-400">
                            {formatTime(buildTime)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {buildingType.max_level > 15 && (
                <button
                  onClick={() => setShowAllLevels(!showAllLevels)}
                  className="mt-3 text-sm text-cyber-blue hover:text-cyber-blue/80 flex items-center gap-1"
                >
                  {showAllLevels ? (
                    <>
                      <ChevronUp className="w-4 h-4" /> {t.buildings.showFewerLevels}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" /> {t.buildings.showMoreLevels} (up to{' '}
                      {buildingType.max_level})
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Info de costos base */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-space-700/50 p-3 rounded-lg">
              <p className="text-gray-400 mb-1">{t.buildings.baseCost}</p>
              <p className="text-white">
                {formatNumber(buildingType.base_metal)} {t.resources.metal} /{' '}
                {formatNumber(buildingType.base_crystal)} {t.resources.crystal}
                {buildingType.base_deuterium > 0 &&
                  ` / ${formatNumber(buildingType.base_deuterium)} ${t.resources.deuterium}`}
              </p>
            </div>
            <div className="bg-space-700/50 p-3 rounded-lg">
              <p className="text-gray-400 mb-1">{t.buildings.costFactor}</p>
              <p className="text-white">x{buildingType.cost_factor} {t.buildings.perLevel}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
