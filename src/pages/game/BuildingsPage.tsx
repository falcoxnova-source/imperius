/**
 * BuildingsPage - Pagina principal de edificios
 *
 * Implementa el sistema de construccion al estilo XNova/OGame:
 * - Cola de construccion con slots limitados (ampliables con Commander)
 * - Validacion de requisitos (edificios y tecnologias)
 * - Calculo de costos con factor exponencial
 * - Verificacion de campos disponibles en el planeta
 * - Edificios exclusivos de luna/planeta
 * - Completar instantaneamente con TUNG
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Building2,
  Cog,
  Warehouse,
  Factory,
  Clock,
  X,
  ListOrdered,
  Battery,
  BatteryWarning,
  Coins,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { useI18n, translateBuildingName, translateEntityName } from '../../lib/i18n';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { useIsUserPlus } from '../../hooks/useIsUserPlus';
import { useAdminStore } from '../../store/adminStore';
import {
  calculateBuildingCost,
  calculateBuildingTime,
  calculateBuildingQueueSlots,
} from '../../lib/formulas';
import { getOfficerBonuses } from '../../lib/officers';
import { formatTime, formatTimeRemaining } from '../../lib/utils';
import type { BuildingType, PlanetBuilding, BuildingQueueItem } from '../../types/game';

import {
  BuildingCard,
  BuildingInfoModal,
  getBuildingProductionInfo,
  MOON_ONLY_BUILDINGS,
  PLANET_ONLY_BUILDINGS,
} from './buildings';
import { CancelConfirmModal } from '../../components/ui/CancelConfirmModal';
import { JumpGateModal } from '../../components/game/JumpGateModal';
import { supabase } from '../../lib/supabase';

/**
 * Barra de depósitos - muestra recursos restantes en colonias
 */
function DepositBar({ planetId }: { planetId: string }) {
  const { t } = useI18n();
  const [deposits, setDeposits] = useState<{
    metal_deposit: number | null;
    crystal_deposit: number | null;
    deuterium_deposit: number | null;
    metal_pct: number | null;
    crystal_pct: number | null;
    deuterium_pct: number | null;
    metal_initial: number | null;
  } | null>(null);

  useEffect(() => {
    const fetch = () => {
      supabase.rpc('get_planet_deposits', { p_planet_id: planetId }).then(({ data }) => {
        if (data?.success && !data.is_main_planet) {
          setDeposits({
            metal_deposit: data.metal_deposit,
            crystal_deposit: data.crystal_deposit,
            deuterium_deposit: data.deuterium_deposit,
            metal_pct: data.metal_deposit_pct,
            crystal_pct: data.crystal_deposit_pct,
            deuterium_pct: data.deuterium_deposit_pct,
            metal_initial: data.metal_initial,
          });
        }
      }).catch(err => { void err; });
    };
    fetch();
    const interval = setInterval(fetch, 5 * 60 * 1000); // cada 5 minutos
    return () => clearInterval(interval);
  }, [planetId]);

  if (!deposits || deposits.metal_deposit === null) return null;

  const pctColor = (pct: number | null) => {
    if (pct === null) return 'bg-gray-500';
    if (pct > 50) return 'bg-emerald-500';
    if (pct > 20) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="card-glass p-3 border-l-4 border-amber-500/50 text-xs space-y-1.5">
      <p className="text-amber-400 font-semibold text-xs flex items-center gap-1">
        ⛏️ Recursos restantes del planeta
      </p>
      {(['metal', 'crystal', 'deuterium'] as const).map(res => {
        const amt = deposits[`${res}_deposit` as keyof typeof deposits] as number | null;
        const pct = deposits[`${res}_pct` as keyof typeof deposits] as number | null;
        const label = res === 'metal' ? `🪨 ${t.resources.metal}` : res === 'crystal' ? `💎 ${t.resources.crystal}` : `⚗️ ${t.resources.deuterium}`;
        if (amt === null) return null;
        return (
          <div key={res} className="flex items-center gap-2">
            <span className="w-16 text-gray-400">{label}</span>
            <div className="flex-1 bg-space-700 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${pctColor(pct)}`} style={{ width: `${Math.min(100, pct || 0)}%` }} />
            </div>
            <span className="text-gray-500 w-20 text-right">
              {(amt / 1000000).toFixed(1)}M {pct !== null && <span className={pct < 20 ? 'text-red-400' : 'text-gray-400'}>({pct.toFixed(0)}%)</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Iconos para las categorias de edificios
 */
const categoryIcons: Record<string, React.ReactNode> = {
  resources: <Cog className="w-5 h-5" />,
  storage: <Warehouse className="w-5 h-5" />,
  facilities: <Factory className="w-5 h-5" />,
};

export function BuildingsPage() {
  const { t } = useI18n();
  const {
    buildings,
    buildingTypes,
    buildingRequirements,
    buildingQueue,
    resources,
    currentPlanet,
    planets,
    technologies,
    activeOfficers,
    ships,
    isLoadingBuildingRequirements,
    fetchBuildingTypes,
    fetchBuildingRequirements,
    fetchResources,
    fetchShips,
    addToBuildingQueue,
    cancelBuildingQueueItem,
    demolishBuilding,
    instantCompleteBuilding,
    calculateFxuCostBuilding,
    refreshOfficers,
  } = useGameStore();

  const { profile, fetchProfile } = useAuthStore();
  const isPlus = useIsUserPlus();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { speeds } = useAdminStore(); // Necesario para re-render cuando cambian las velocidades

  const [fxuCosts, setFxuCosts] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('resources');
  const [, setTick] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDemolishing, setIsDemolishing] = useState(false);
  const [demolishError, setDemolishError] = useState<string | null>(null);
  const TUNG_DEMOLISH_FEE = 0;
  const [selectedBuildingInfo, setSelectedBuildingInfo] = useState<BuildingType | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BuildingQueueItem | null>(null);
  const [showJumpGateModal, setShowJumpGateModal] = useState(false);

  // Calcular slots de cola segun oficiales activos
  const officerBonuses = getOfficerBonuses(activeOfficers);
  const maxQueueSlots = calculateBuildingQueueSlots(officerBonuses);

  // Nombres traducidos de categorias
  const categoryNames: Record<string, string> = {
    resources: t.buildings.resourceBuildings,
    storage: t.resources.storage,
    facilities: t.buildings.facilityBuildings,
  };

  // Cargar tipos de edificios y requisitos al montar
  useEffect(() => {
    fetchBuildingTypes();
    fetchBuildingRequirements();
  }, [fetchBuildingTypes, fetchBuildingRequirements]);

  // Refrescar oficiales activos al montar y al cambiar de planeta
  // (asi el cap del Comandante 5 se aplica sin necesidad de F5)
  useEffect(() => {
    if (profile?.id) {
      refreshOfficers(profile.id);
    }
  }, [profile?.id, currentPlanet?.id, refreshOfficers]);

  // Timer para actualizar countdown de construccion
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Actualizar costos TUNG para items en cola
  useEffect(() => {
    const updateFxuCosts = async () => {
      const costs: Record<string, number> = {};
      for (const item of buildingQueue) {
        const cost = await calculateFxuCostBuilding(item.id);
        costs[item.id] = cost;
      }
      setFxuCosts(costs);
    };
    if (buildingQueue.length > 0) {
      updateFxuCosts();
      const interval = setInterval(updateFxuCosts, 10000);
      return () => clearInterval(interval);
    }
  }, [buildingQueue, calculateFxuCostBuilding]);

  /**
   * Completar construccion instantaneamente usando TUNG
   */
  const handleInstantComplete = useCallback(
    async (queueId: string) => {
      if (isProcessing) return;
      setIsProcessing(true);
      try {
        const result = await instantCompleteBuilding(queueId, fetchProfile);
        if (!result.success && result.error) {
          console.error('Instant complete failed:', result.error);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, instantCompleteBuilding, fetchProfile]
  );

  // Filtrar edificios por categoria seleccionada
  // Ademas: ocultar los que no se pueden construir aqui segun el tipo de cuerpo (planeta vs luna)
  const isMoonBody = currentPlanet?.planet_type === 'moon';
  const buildingTypesForBody = buildingTypes.filter((bt) => {
    if (isMoonBody && PLANET_ONLY_BUILDINGS.includes(bt.code)) return false;
    if (!isMoonBody && MOON_ONLY_BUILDINGS.includes(bt.code)) return false;
    return true;
  });
  const categories = [...new Set(buildingTypesForBody.map((bt) => bt.category))];
  const filteredBuildings = buildingTypesForBody.filter((bt) => bt.category === selectedCategory);

  /**
   * Obtener nivel actual de un edificio en el planeta
   */
  const getBuildingLevel = (buildingTypeId: number): number => {
    const building = buildings.find((b) => b.building_type_id === buildingTypeId);
    return building?.level || 0;
  };

  /**
   * Obtener nivel efectivo (actual + en cola)
   * En XNova, esto se usa para calcular el costo del siguiente nivel
   */
  const getEffectiveLevel = (buildingTypeId: number): number => {
    const baseLevel = getBuildingLevel(buildingTypeId);
    const queuedForType = buildingQueue.filter((q) => q.building_type_id === buildingTypeId).length;
    return baseLevel + queuedForType;
  };

  /**
   * Obtener datos del edificio en el planeta
   */
  const getBuildingData = (buildingTypeId: number): PlanetBuilding | undefined => {
    return buildings.find((b) => b.building_type_id === buildingTypeId);
  };

  /**
   * Obtener items en cola para un tipo de edificio
   */
  const getQueuedItems = (buildingTypeId: number): BuildingQueueItem[] => {
    return buildingQueue.filter((q) => q.building_type_id === buildingTypeId);
  };

  // Niveles de edificios que afectan tiempos de construccion
  const getRoboticsLevel = () =>
    buildings.find((b) => b.building_type?.code === 'robotics_factory')?.level || 0;
  const getNaniteLevel = () =>
    buildings.find((b) => b.building_type?.code === 'nanite_factory')?.level || 0;
  const getEnergyTechLevel = () =>
    technologies.find((t) => t.technology_type?.code === 'energy_tech')?.level || 0;

  /**
   * Verificar si se cumplen los requisitos para un edificio
   * Compara con el nivel ACTUAL (no efectivo) para consistencia con el servidor
   */
  const checkRequirements = (buildingTypeId: number): { met: boolean; missing: string[] } => {
    const requirements = buildingRequirements.filter((r) => r.building_type_id === buildingTypeId);
    const missing: string[] = [];

    for (const req of requirements) {
      if (req.required_building_id && req.required_building) {
        const building = buildings.find((b) => b.building_type_id === req.required_building_id);
        const currentLevel = building?.level || 0;
        if (currentLevel < req.required_building_level) {
          missing.push(`${translateEntityName(t, req.required_building.code, req.required_building.name)} ${t.buildings.tableLevel}${req.required_building_level}`);
        }
      }
      if (req.required_tech_id && req.required_tech) {
        const tech = technologies.find((t) => t.technology_type_id === req.required_tech_id);
        const currentLevel = tech?.level || 0;
        if (currentLevel < req.required_tech_level) {
          missing.push(`${translateEntityName(t, req.required_tech.code, req.required_tech.name)} ${t.buildings.tableLevel}${req.required_tech_level}`);
        }
      }
    }

    return { met: missing.length === 0, missing };
  };

  /**
   * Obtener todos los requisitos de un edificio con estado (cumplido/no cumplido)
   */
  const getAllRequirements = (
    buildingTypeId: number
  ): { name: string; level: number; met: boolean }[] => {
    const requirements = buildingRequirements.filter((r) => r.building_type_id === buildingTypeId);
    const result: { name: string; level: number; met: boolean }[] = [];

    for (const req of requirements) {
      if (req.required_building_id && req.required_building) {
        const building = buildings.find((b) => b.building_type_id === req.required_building_id);
        const currentLevel = building?.level || 0;
        result.push({
          name: translateEntityName(t, req.required_building.code, req.required_building.name),
          level: req.required_building_level,
          met: currentLevel >= req.required_building_level,
        });
      }
      if (req.required_tech_id && req.required_tech) {
        const tech = technologies.find((t) => t.technology_type_id === req.required_tech_id);
        const currentLevel = tech?.level || 0;
        result.push({
          name: translateEntityName(t, req.required_tech.code, req.required_tech.name),
          level: req.required_tech_level,
          met: currentLevel >= req.required_tech_level,
        });
      }
    }

    return result;
  };

  // Verificar si hay investigacion en progreso (bloquea mejora de laboratorio)
  const isResearching = technologies.some((t) => t.is_researching);

  /**
   * Verificar si se puede construir/mejorar un edificio
   * Valida: recursos, requisitos, campos, cola, restricciones de planeta/luna
   */
  const isVacation = profile?.vacation_mode === true;

  const canBuild = (
    buildingType: BuildingType
  ): { allowed: boolean; reason?: string; missingReqs?: string[] } => {
    if (isVacation)
      return { allowed: false, reason: t.settings.vacationModeBlocked };
    if (!resources || !currentPlanet)
      return { allowed: false, reason: t.buildings.insufficientResources };
    if (isLoadingBuildingRequirements) return { allowed: false, reason: t.common.loading };

    const isMoon = currentPlanet.planet_type === 'moon';

    // Verificar restricciones de luna/planeta
    if (MOON_ONLY_BUILDINGS.includes(buildingType.code) && !isMoon) {
      return { allowed: false, reason: t.buildings.moonOnly };
    }
    if (PLANET_ONLY_BUILDINGS.includes(buildingType.code) && isMoon) {
      return { allowed: false, reason: 'Can only be built on a Planet' };
    }

    const effectiveLevel = getEffectiveLevel(buildingType.id);

    // Verificar nivel maximo
    if (effectiveLevel >= buildingType.max_level) {
      return { allowed: false, reason: 'Maximum level reached' };
    }

    // En XNova, no se puede mejorar el laboratorio mientras hay investigacion
    if (buildingType.code === 'research_lab' && isResearching) {
      return { allowed: false, reason: 'Cannot upgrade while research is in progress' };
    }

    // Verificar requisitos
    const reqCheck = checkRequirements(buildingType.id);
    if (!reqCheck.met) {
      return { allowed: false, reason: t.buildings.requirementsNotMet, missingReqs: reqCheck.missing };
    }

    // Verificar slots de cola disponibles
    if (buildingQueue.length >= maxQueueSlots) {
      return { allowed: false, reason: t.buildings.queueFull + ` (max ${maxQueueSlots})` };
    }

    // Verificar campos disponibles (incluyendo cola)
    const totalFieldsUsed = currentPlanet.fields_used + buildingQueue.length;
    if (totalFieldsUsed >= currentPlanet.fields_max) {
      return { allowed: false, reason: 'No fields available' };
    }

    // Calcular costo para el siguiente nivel
    const cost = calculateBuildingCost(
      buildingType.base_metal,
      buildingType.base_crystal,
      buildingType.base_deuterium,
      buildingType.cost_factor,
      effectiveLevel
    );

    // Verificar recursos
    if (resources.metal < cost.metal) {
      return { allowed: false, reason: t.buildings.insufficientResources };
    }
    if (resources.crystal < cost.crystal) {
      return { allowed: false, reason: t.buildings.insufficientResources };
    }
    if (resources.deuterium < cost.deuterium) {
      return { allowed: false, reason: t.buildings.insufficientResources };
    }

    return { allowed: true };
  };

  /**
   * Agregar edificio a la cola de construccion
   */
  const handleBuild = useCallback(
    async (buildingTypeId: number) => {
      if (isProcessing || !currentPlanet) return;
      setIsProcessing(true);
      try {
        const success = await addToBuildingQueue(buildingTypeId);
        if (success) {
          await fetchResources(currentPlanet.id);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, currentPlanet, addToBuildingQueue, fetchResources]
  );

  const handleDemolish = useCallback(
    async (buildingTypeId: number) => {
      if (isDemolishing || !currentPlanet) return;
      setIsDemolishing(true);
      setDemolishError(null);
      try {
        const result = await demolishBuilding(buildingTypeId);
        if (result.success) {
          await fetchProfile();
        } else {
          setDemolishError(result.error || 'Error demolishing building');
          setTimeout(() => setDemolishError(null), 5000);
        }
      } catch {
        setDemolishError('Error processing request');
        setTimeout(() => setDemolishError(null), 5000);
      } finally {
        setIsDemolishing(false);
      }
    },
    [isDemolishing, currentPlanet, demolishBuilding, fetchProfile]
  );

  const getDemolishRefund = (buildingType: BuildingType, level: number) => {
    if (level <= 0) return { metal: 0, crystal: 0, deuterium: 0 };
    const cost = calculateBuildingCost(
      buildingType.base_metal,
      buildingType.base_crystal,
      buildingType.base_deuterium,
      buildingType.cost_factor,
      level - 1
    );
    return {
      metal: Math.floor(cost.metal * 0.5),
      crystal: Math.floor(cost.crystal * 0.5),
      deuterium: Math.floor(cost.deuterium * 0.5),
    };
  };

  const handleCancelQueue = useCallback(
    async (queueItemId: string) => {
      if (isProcessing) return;
      setIsProcessing(true);
      try {
        await cancelBuildingQueueItem(queueItemId);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, cancelBuildingQueueItem]
  );

  const getCancelProgress = (item: BuildingQueueItem): number => {
    if (!item.start_time || !item.end_time) return 0;
    const start = new Date(item.start_time).getTime();
    const end = new Date(item.end_time).getTime();
    const now = Date.now();
    if (now >= end) return 100;
    const total = end - start;
    const elapsed = now - start;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  // Buscar edificio en progreso (sistema antiguo - compatibilidad)
  const buildingInProgress = buildings.find((b) => b.is_upgrading);

  return (
    <div className="space-y-6">
      {/* Header con titulo y stats del planeta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="font-orbitron text-xl sm:text-2xl text-white flex items-center gap-2 sm:gap-3">
          <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-cyber-blue flex-shrink-0" />
          {t.buildings.title}
        </h1>
        {currentPlanet && (
          <div className="flex items-center gap-3 sm:gap-4 text-sm">
            {/* Campos usados/disponibles */}
            <div className="text-gray-400">
              {t.overview.fields}:{' '}
              <span
                className={
                  currentPlanet.fields_used >= currentPlanet.fields_max
                    ? 'text-cyber-red'
                    : 'text-white'
                }
              >
                {currentPlanet.fields_used} / {currentPlanet.fields_max}
              </span>
            </div>
            {/* Balance de energia */}
            {resources && (
              <div
                className={`flex items-center gap-1 ${
                  resources.energy_max - resources.energy_used >= 0
                    ? 'text-cyber-green'
                    : 'text-cyber-red'
                }`}
              >
                {resources.energy_max - resources.energy_used >= 0 ? (
                  <Battery className="w-4 h-4" />
                ) : (
                  <BatteryWarning className="w-4 h-4" />
                )}
                {Math.round((resources.energy_max - resources.energy_used) * 100) / 100}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra de depósitos (solo colonias) */}
      {currentPlanet && !currentPlanet.is_main_planet && <DepositBar planetId={currentPlanet.id} />}

      {/* Cola de construccion */}
      {(buildingQueue.length > 0 || buildingInProgress) && (
        <div className="relative p-[3px] rounded-2xl bg-gradient-to-b from-amber-300 via-amber-700 to-amber-500 shadow-[0_14px_40px_rgba(0,0,0,0.65)]">
          <span className="pointer-events-none absolute left-2 top-2 w-3.5 h-3.5 border-l-[3px] border-t-[3px] border-amber-200 z-20 rounded-tl-sm" />
          <span className="pointer-events-none absolute right-2 top-2 w-3.5 h-3.5 border-r-[3px] border-t-[3px] border-amber-200 z-20 rounded-tr-sm" />
          <span className="pointer-events-none absolute left-2 bottom-2 w-3.5 h-3.5 border-l-[3px] border-b-[3px] border-amber-200 z-20 rounded-bl-sm" />
          <span className="pointer-events-none absolute right-2 bottom-2 w-3.5 h-3.5 border-r-[3px] border-b-[3px] border-amber-200 z-20 rounded-br-sm" />
          <div className="relative rounded-[13px] bg-[linear-gradient(180deg,#2f2b25_0%,#1e1b16_45%,#0f0d0a_100%)] p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-5 h-5 text-amber-300" />
              <h3 className="font-serif font-semibold text-amber-100">{t.overview.buildingQueue}</h3>
              <span className="text-xs text-amber-200/60">
                ({buildingQueue.length}/{maxQueueSlots})
              </span>
            </div>
          </div>

          {/* Edificio en progreso (sistema antiguo - compatibilidad) */}
          {buildingInProgress && (
            <div className="flex items-center justify-between p-2 bg-emerald-500/10 border border-emerald-600/30 rounded-lg mb-2">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-emerald-400 animate-pulse" />
                <div>
                  <p className="text-amber-100 text-sm font-semibold">
                    {buildingInProgress.building_type ? translateBuildingName(t, buildingInProgress.building_type.code, buildingInProgress.building_type.name) : ''} {t.buildings.tableLevel}
                    {(buildingInProgress.level || 0) + 1}
                  </p>
                  <p className="text-xs text-amber-200/60">{t.buildings.upgrading} (sistema antiguo)</p>
                </div>
              </div>
              <div className="font-serif font-bold text-emerald-300">
                {buildingInProgress.upgrade_end_time
                  ? formatTimeRemaining(buildingInProgress.upgrade_end_time)
                  : '--:--:--'}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <p className="text-[11px] text-amber-300/90 leading-tight">
              Cancelar un edificio en progreso solo devuelve recursos proporcionales al tiempo restante.
            </p>
          </div>

          {buildingQueue.map((item) => {
            const fxuCost = fxuCosts[item.id] || 0;
            const canAffordFxu = profile && Number(profile.tung_balance) >= fxuCost && fxuCost > 0;

            return (
              <div
                key={item.id}
                className={`flex items-center justify-between p-2 rounded-lg mb-1 ${
                  item.queue_position === 1 ? 'bg-emerald-500/10 border border-emerald-600/30' : 'bg-black/25 border border-amber-800/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-black/40 border border-amber-700/40 flex items-center justify-center text-xs font-serif font-bold text-amber-300">
                    {item.queue_position}
                  </span>
                  <div>
                    <p className="text-amber-100 text-sm font-semibold">
                      {item.building_type ? translateBuildingName(t, item.building_type.code, item.building_type.name) : ''} {t.buildings.tableLevel}{item.target_level}
                    </p>
                    {item.queue_position === 1 && item.end_time ? (
                      <p className="text-xs text-emerald-300 font-serif">{formatTimeRemaining(item.end_time)}</p>
                    ) : (
                      <p className="text-xs text-amber-200/50">Queued - {formatTime(item.build_time)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {fxuCost > 0 && item.queue_position === 1 && !!item.start_time && (
                    <button
                      onClick={() => handleInstantComplete(item.id)}
                      disabled={!canAffordFxu || isProcessing}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold transition-all ${
                        canAffordFxu && !isProcessing
                          ? 'bg-gradient-to-b from-amber-300 to-amber-600 text-stone-950 border border-amber-200 hover:from-amber-200 hover:to-amber-500'
                          : 'bg-black/30 text-amber-200/40 cursor-not-allowed border border-amber-800/40'
                      }`}
                      title={canAffordFxu ? `Complete instantly for ${fxuCost} TUNG` : 'Insufficient TUNG'}
                    >
                      <Coins className="w-3 h-3" />
                      {fxuCost}
                    </button>
                  )}
                  <button
                    onClick={() => setCancelTarget(item)}
                    className="p-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 rounded-lg transition-colors"
                    title={t.common.cancel}
                  >
                    <X className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Tabs de categorias */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap border ${
              selectedCategory === category
                ? 'bg-[linear-gradient(90deg,rgba(252,211,77,0.95),rgba(217,119,6,0.85))] text-stone-950 font-serif font-bold uppercase tracking-wider border-amber-200/80 shadow-[0_3px_10px_rgba(0,0,0,0.45)]'
                : 'bg-stone-900/70 text-amber-100/55 hover:bg-stone-800/80 hover:text-amber-100 border-amber-800/40 font-semibold'
            }`}
          >
            {categoryIcons[category]}
            {categoryNames[category]}
          </button>
        ))}
        <a
          href="https://falcoxswap.com/?inputCurrency=BNB&outputCurrency=0x09514EcF8270C12101D077B5e8B034B164F71C5f"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap bg-gradient-to-r from-cyan-600 to-cyan-500 text-white hover:from-cyan-500 hover:to-cyan-400"
        >
          <img
            src="https://photos.pinksale.finance/file/pinksale-logo-upload/1768281226806-7d493aae390e834e9654df6d97b11a99.jpg"
            alt="TUNG"
            className="w-5 h-5 rounded-full object-cover"
          />
          Compra TUNG
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Demolish error banner */}
      {demolishError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{demolishError}</span>
          <button onClick={() => setDemolishError(null)} className="ml-auto p-1 hover:bg-red-500/20 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Jump Gate action button - only on moons with jump gate built */}
      {currentPlanet?.planet_type === 'moon' &&
        buildings.some((b) => b.building_type?.code === 'jump_gate' && b.level > 0) && (
          <button
            onClick={async () => {
              // Ensure ships are loaded for this moon before opening modal
              await fetchShips(currentPlanet.id);
              setShowJumpGateModal(true);
            }}
            className="w-full flex items-center justify-center gap-3 p-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 hover:border-purple-500/50 transition-all group"
          >
            <ArrowRight className="w-5 h-5 text-purple-400 group-hover:translate-x-1 transition-transform" />
            <span className="font-orbitron text-sm text-purple-300 group-hover:text-purple-200">
              {t.galaxy.jumpGateUse}
            </span>
            <span className="text-xs text-gray-500">
              ({t.buildings.tableLevel}{buildings.find((b) => b.building_type?.code === 'jump_gate')?.level || 0})
            </span>
          </button>
        )}

      {/* Grid de edificios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        {filteredBuildings.map((buildingType) => {
          const currentLevel = getBuildingLevel(buildingType.id);
          const effectiveLevel = getEffectiveLevel(buildingType.id);
          const buildingData = getBuildingData(buildingType.id);
          const queuedItems = getQueuedItems(buildingType.id);
          const isUpgrading = buildingData?.is_upgrading;
          const isQueued = queuedItems.length > 0;
          const buildCheck = canBuild(buildingType);

          const cost = calculateBuildingCost(
            buildingType.base_metal,
            buildingType.base_crystal,
            buildingType.base_deuterium,
            buildingType.cost_factor,
            effectiveLevel
          );

          const buildTime = calculateBuildingTime(
            cost.metal,
            cost.crystal,
            getRoboticsLevel(),
            getNaniteLevel(),
            isPlus
          );

          const productionInfo = getBuildingProductionInfo(
            buildingType.code,
            currentLevel,
            currentPlanet?.temp_max || 50,
            getEnergyTechLevel(),
            currentPlanet?.position || 8
          );

          const allReqs = getAllRequirements(buildingType.id);

          const canDemolishBuilding = currentLevel > 0 && !isUpgrading && !isQueued && buildingQueue.length === 0 && !isVacation && !isDemolishing;
          const canAffordDemolishFxu = true;

          return (
            <BuildingCard
              key={buildingType.id}
              buildingType={buildingType}
              currentLevel={currentLevel}
              effectiveLevel={effectiveLevel}
              cost={cost}
              buildTime={buildTime}
              isUpgrading={isUpgrading}
              isQueued={isQueued}
              queueCount={queuedItems.length}
              canBuild={buildCheck.allowed && !isProcessing}
              disabledReason={isProcessing ? t.common.loading : buildCheck.reason}
              missingReqs={buildCheck.missingReqs}
              allRequirements={allReqs}
              resources={resources}
              endTime={buildingData?.upgrade_end_time}
              productionInfo={productionInfo}
              energyBalance={resources ? resources.energy_max - resources.energy_used : undefined}
              onBuild={() => handleBuild(buildingType.id)}
              onShowInfo={() => setSelectedBuildingInfo(buildingType)}
              canDemolish={canDemolishBuilding}
              canAffordDemolishFxu={!!canAffordDemolishFxu}
              demolishRefund={getDemolishRefund(buildingType, currentLevel)}
              onDemolish={() => handleDemolish(buildingType.id)}
              isDemolishing={isDemolishing}
              fxuDemolishFee={TUNG_DEMOLISH_FEE}
              t={t}
            />
          );
        })}
      </div>

      {selectedBuildingInfo && (
        <BuildingInfoModal
          buildingType={selectedBuildingInfo}
          currentLevel={getBuildingLevel(selectedBuildingInfo.id)}
          tempMax={currentPlanet?.temp_max || 50}
          energyTechLevel={getEnergyTechLevel()}
          roboticsLevel={getRoboticsLevel()}
          naniteLevel={getNaniteLevel()}
          position={currentPlanet?.position || 8}
          isVip={isPlus}
          onClose={() => setSelectedBuildingInfo(null)}
          t={t}
        />
      )}

      <CancelConfirmModal
        isOpen={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) handleCancelQueue(cancelTarget.id);
        }}
        itemName={cancelTarget ? `${cancelTarget.building_type ? translateBuildingName(t, cancelTarget.building_type.code, cancelTarget.building_type.name) : ''} ${t.buildings.tableLevel}${cancelTarget.target_level}` : ''}
        type="building"
        isInProgress={cancelTarget?.queue_position === 1 && cancelTarget?.start_time !== null}
        progressPercent={cancelTarget ? getCancelProgress(cancelTarget) : 0}
      />

      {/* Jump Gate Modal */}
      {currentPlanet && (
        <JumpGateModal
          isOpen={showJumpGateModal}
          onClose={() => setShowJumpGateModal(false)}
          originMoon={currentPlanet}
        />
      )}
    </div>
  );
}
