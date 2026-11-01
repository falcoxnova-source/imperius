/**
 * ResearchPage - Pagina de Investigacion
 *
 * Implementa el sistema de investigacion al estilo XNova/OGame:
 * - Requiere Laboratorio de Investigacion para desbloquear
 * - Solo una investigacion a la vez en todo el imperio
 * - Red de Investigacion Intergalactica (IRN) suma niveles de laboratorios
 * - El tiempo se reduce con nivel de laboratorio efectivo
 * - Los bonus de Tecnicos reducen el tiempo
 * - Completar instantaneamente con TUNG
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Microscope,
  Zap,
  Rocket,
  Swords,
  Cpu,
  Clock,
  ChevronUp,
  AlertCircle,
  Lock,
  Coins,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { useIsUserPlus } from '../../hooks/useIsUserPlus';
import { MediaDisplay } from '../../components/ui/MediaDisplay';
import { CostItem } from '../../components/game';
import {
  calculateResearchCost,
  calculateResearchTime,
  calculateResearchTimeWithBonus,
} from '../../lib/formulas';
import { getOfficerBonuses, hasActiveOfficer } from '../../lib/officers';
import { formatNumber, formatTime, formatTimeRemaining } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useI18n, translateEntityName, translateResearchName, translateTechDescription } from '../../lib/i18n';
import type { TechnologyType } from '../../types/game';

/**
 * Iconos para cada categoria de tecnologia
 */
const categoryIcons: Record<string, React.ReactNode> = {
  basic: <Zap className="w-5 h-5" />,
  propulsion: <Rocket className="w-5 h-5" />,
  military: <Swords className="w-5 h-5" />,
  advanced: <Cpu className="w-5 h-5" />,
};

export function ResearchPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    technologies,
    technologyTypes,
    technologyRequirements,
    buildings,
    buildingQueue,
    buildingTypes,
    resources,
    currentPlanet,
    activeOfficers,
    researchQueue,
    isLoadingTechRequirements,
    fetchTechnologyTypes,
    fetchTechnologyRequirements,
    fetchTechnologies,
    fetchResearchQueue,
    startResearch,
    cancelResearch,
    cancelQueuedResearch,
    instantCompleteResearch,
    calculateFxuCostResearch,
    refreshOfficers,
  } = useGameStore();
  const { profile, fetchProfile } = useAuthStore();
  const isPlus = useIsUserPlus();

  const [selectedCategory, setSelectedCategory] = useState<string>('basic');
  const [, setTick] = useState(0);
  const [effectiveLabLevel, setEffectiveLabLevel] = useState<number | null>(null);
  const [fxuCost, setFxuCost] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const categoryNames: Record<string, string> = {
    basic: t.research.basicResearch,
    propulsion: t.research.driveResearch,
    military: t.research.combatResearch,
    advanced: t.research.advancedResearch,
  };

  useEffect(() => {
    fetchTechnologyTypes();
    fetchTechnologyRequirements();
    if (profile) {
      fetchTechnologies(profile.id);
      fetchResearchQueue(profile.id);
    }
  }, [fetchTechnologyTypes, fetchTechnologyRequirements, fetchTechnologies, fetchResearchQueue, profile]);

  // [RQFIX1] Refrescar oficiales al entrar (el Comandante habilita la cola)
  useEffect(() => {
    if (profile?.id) {
      refreshOfficers(profile.id);
    }
  }, [profile?.id, currentPlanet?.id, refreshOfficers]);

  /**
   * Calcular nivel efectivo de laboratorio con IRN
   * Suma los niveles de todos los laboratorios del jugador segun la tecnologia IRN
   */
  useEffect(() => {
    const fetchEffectiveLabLevel = async () => {
      if (!profile || !currentPlanet) return;
      const { data } = await supabase.rpc('calculate_irn_lab_level', {
        p_user_id: profile.id,
        p_current_planet_id: currentPlanet.id,
      });
      setEffectiveLabLevel(data);
    };
    fetchEffectiveLabLevel();
  }, [profile, currentPlanet, buildings]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const researchInProgress = technologies.find((t) => t.is_researching);
  const hasCommander = hasActiveOfficer(activeOfficers, 'commander');
  const queueFull = researchQueue.length >= 2;

  const labTypeId = buildingTypes.find((bt) => bt.code === 'research_lab')?.id;
  const isLabUpgrading = labTypeId
    ? buildingQueue.some((q) => q.building_type_id === labTypeId)
    : false;

  /**
   * Actualizar costo TUNG para investigacion en progreso
   */
  useEffect(() => {
    const updateFxuCost = async () => {
      if (researchInProgress) {
        const cost = await calculateFxuCostResearch(researchInProgress.id);
        setFxuCost(cost);
      } else {
        setFxuCost(0);
      }
    };
    updateFxuCost();
    if (researchInProgress) {
      const interval = setInterval(updateFxuCost, 30000);
      return () => clearInterval(interval);
    }
  }, [researchInProgress, calculateFxuCostResearch]);

  /**
   * Completar investigacion instantaneamente con TUNG
   */
  const handleInstantComplete = useCallback(async () => {
    if (isProcessing || !researchInProgress) return;
    setIsProcessing(true);
    try {
      const result = await instantCompleteResearch(researchInProgress.id, fetchProfile);
      if (!result.success && result.error) {
        console.error('Instant complete failed:', result.error);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, researchInProgress, instantCompleteResearch, fetchProfile]);

  const handleCancelResearch = useCallback(async () => {
    if (isProcessing || !researchInProgress) return;
    setIsProcessing(true);
    try {
      await cancelResearch(researchInProgress.id);
    } finally {
      setIsProcessing(false);
      setShowCancelConfirm(false);
    }
  }, [isProcessing, researchInProgress, cancelResearch]);

  const getCancelRefundPercent = (): number => {
    if (!researchInProgress?.research_start_time || !researchInProgress?.research_end_time) return 100;
    const start = new Date(researchInProgress.research_start_time).getTime();
    const end = new Date(researchInProgress.research_end_time).getTime();
    const now = Date.now();
    if (now >= end) return 0;
    const total = end - start;
    const elapsed = now - start;
    return Math.max(0, Math.round(((total - elapsed) / total) * 100));
  };

  const categories = [...new Set(technologyTypes.map((tt) => tt.category))];
  const filteredTechnologies = technologyTypes.filter((tt) => tt.category === selectedCategory);

  /**
   * Obtener nivel actual de una tecnologia
   */
  const getTechLevel = (techTypeId: number): number => {
    const tech = technologies.find((t) => t.technology_type_id === techTypeId);
    return tech?.level || 0;
  };

  /**
   * [RQSAME1] Nivel base para el siguiente pedido: ultimo nivel ya comprometido
   * (en curso o en cola) de esta tecnologia
   */
  const getCommittedLevel = (techTypeId: number): number => {
    const tech = technologies.find((t) => t.technology_type_id === techTypeId);
    return Math.max(
      (tech?.level || 0) + (tech?.is_researching ? 1 : 0),
      ...researchQueue
        .filter((q) => q.technology_type_id === techTypeId)
        .map((q) => q.target_level)
    );
  };

  /**
   * Obtener datos de una tecnologia del jugador
   */
  const getTechData = (techTypeId: number) => {
    return technologies.find((t) => t.technology_type_id === techTypeId);
  };

  /**
   * Obtener nivel del laboratorio en el planeta actual
   */
  const getLabLevel = () =>
    buildings.find((b) => b.building_type?.code === 'research_lab')?.level || 0;

  /**
   * Verificar requisitos de edificios y tecnologias
   */
  const checkRequirements = (techType: TechnologyType): { met: boolean; missing: string[] } => {
    const requirements = technologyRequirements.filter((r) => r.technology_type_id === techType.id);
    const missing: string[] = [];

    for (const req of requirements) {
      if (req.required_building_id && req.required_building) {
        const building = buildings.find((b) => b.building_type_id === req.required_building_id);
        const currentLevel = building?.level || 0;
        if (currentLevel < req.required_building_level) {
          missing.push(
            `${translateEntityName(t, req.required_building.code, req.required_building.name)} ${t.common.level}.${req.required_building_level}`
          );
        }
      }
      if (req.required_tech_id && req.required_tech) {
        const tech = technologies.find((t) => t.technology_type_id === req.required_tech_id);
        const currentLevel = tech?.level || 0;
        if (currentLevel < req.required_tech_level) {
          missing.push(`${translateEntityName(t, req.required_tech.code, req.required_tech.name)} ${t.common.level}.${req.required_tech_level}`);
        }
      }
    }

    if (techType.energy_required && techType.energy_required > 0) {
      const scaledEnergy = Math.ceil(techType.energy_required * Math.pow(Number(techType.cost_factor), getCommittedLevel(techType.id)));
      const availableEnergy = resources?.energy_max || 0;
      if (availableEnergy < scaledEnergy) {
        missing.push(`${t.resources.energy}: ${formatNumber(scaledEnergy)}`);
      }
    }

    return { met: missing.length === 0, missing };
  };

  /**
   * Obtener lista completa de requisitos con estado
   */
  const getAllRequirements = (
    techType: TechnologyType
  ): { name: string; level: number; met: boolean; isEnergy?: boolean }[] => {
    const requirements = technologyRequirements.filter((r) => r.technology_type_id === techType.id);
    const result: { name: string; level: number; met: boolean; isEnergy?: boolean }[] = [];

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

    if (techType.energy_required && techType.energy_required > 0) {
      const scaledEnergy = Math.ceil(techType.energy_required * Math.pow(Number(techType.cost_factor), getCommittedLevel(techType.id)));
      const availableEnergy = resources?.energy_max || 0;
      result.push({
        name: t.resources.energy,
        level: scaledEnergy,
        met: availableEnergy >= scaledEnergy,
        isEnergy: true,
      });
    }

    return result;
  };

  /**
   * Verificar si se puede investigar una tecnologia
   */
  const isVacation = profile?.vacation_mode === true;

  const canResearch = (
    techType: TechnologyType
  ): { allowed: boolean; reason?: string; missingReqs?: string[] } => {
    if (isVacation)
      return { allowed: false, reason: t.settings.vacationModeBlocked };
    if (!resources || !currentPlanet)
      return { allowed: false, reason: t.research.noResources };
    if (isLoadingTechRequirements) return { allowed: false, reason: t.research.loadingData };

    const currentLevel = getCommittedLevel(techType.id);

    if (currentLevel >= techType.max_level) {
      return { allowed: false, reason: t.research.maxLevelReached };
    }

    const reqCheck = checkRequirements(techType);
    if (!reqCheck.met) {
      return {
        allowed: false,
        reason: t.research.requirementsNotMet,
        missingReqs: reqCheck.missing,
      };
    }

    if (researchInProgress && !hasCommander) {
      return { allowed: false, reason: t.research.anotherResearchInProgress };
    }
    if (researchInProgress && hasCommander && queueFull) {
      return { allowed: false, reason: t.research.anotherResearchInProgress };
    }

    if (isLabUpgrading) {
      return { allowed: false, reason: t.research.labUpgradingBlocked };
    }

    const cost = calculateResearchCost(
      techType.base_metal,
      techType.base_crystal,
      techType.base_deuterium,
      techType.cost_factor,
      currentLevel
    );

    if (resources.metal < cost.metal) {
      return { allowed: false, reason: t.research.insufficientMetal };
    }
    if (resources.crystal < cost.crystal) {
      return { allowed: false, reason: t.research.insufficientCrystal };
    }
    if (resources.deuterium < cost.deuterium) {
      return { allowed: false, reason: t.research.insufficientDeuterium };
    }

    return { allowed: true };
  };

  /**
   * Iniciar investigacion
   */
  const handleResearch = async (techTypeId: number) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await startResearch(techTypeId);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="font-orbitron text-xl sm:text-2xl text-white flex items-center gap-2 sm:gap-3">
          <Microscope className="w-6 h-6 sm:w-8 sm:h-8 text-cyber-green flex-shrink-0" />
          {t.research.title}
        </h1>
        <div className="text-sm text-gray-400">
          {t.research.laboratory} {t.common.level}.{getLabLevel()}
        </div>
      </div>

      {/* Mensaje si no hay laboratorio */}
      {getLabLevel() === 0 && (
        <div className="card-glass p-4 border-l-4 border-cyber-orange">
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6 text-cyber-orange" />
            <div>
              <p className="text-white font-semibold">{t.research.laboratoryRequired}</p>
              <p className="text-sm text-gray-400">{t.research.buildLaboratoryToUnlock}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mensaje si laboratorio esta en cola de construccion */}
      {isLabUpgrading && !researchInProgress && (
        <div className="card-glass p-4 border-l-4 border-cyber-orange">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-cyber-orange" />
            <div>
              <p className="text-white font-semibold">{t.research.laboratory} - {t.common.upgrading}</p>
              <p className="text-sm text-gray-400">{t.research.labUpgradingBlocked}</p>
            </div>
          </div>
        </div>
      )}

      {/* Investigacion en progreso */}
      {researchInProgress && (
        <div className="relative p-[3px] rounded-2xl bg-gradient-to-b from-amber-300 via-amber-700 to-amber-500 shadow-[0_14px_40px_rgba(0,0,0,0.65)]">
          <span className="pointer-events-none absolute left-2 top-2 w-3.5 h-3.5 border-l-[3px] border-t-[3px] border-amber-200 z-20 rounded-tl-sm" />
          <span className="pointer-events-none absolute right-2 top-2 w-3.5 h-3.5 border-r-[3px] border-t-[3px] border-amber-200 z-20 rounded-tr-sm" />
          <span className="pointer-events-none absolute left-2 bottom-2 w-3.5 h-3.5 border-l-[3px] border-b-[3px] border-amber-200 z-20 rounded-bl-sm" />
          <span className="pointer-events-none absolute right-2 bottom-2 w-3.5 h-3.5 border-r-[3px] border-b-[3px] border-amber-200 z-20 rounded-br-sm" />
          <div className="relative rounded-[13px] bg-[linear-gradient(180deg,#32291f_0%,#201a12_45%,#110d07_100%)] p-3 sm:p-4 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 animate-pulse flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-amber-100 font-serif font-semibold text-sm sm:text-base truncate">
                  {researchInProgress.technology_type ? translateResearchName(t, researchInProgress.technology_type.code, researchInProgress.technology_type.name) : ''} {t.common.level}{' '}
                  {(researchInProgress.level || 0) + 1}
                </p>
                <p className="text-xs sm:text-sm text-amber-200/60">{t.research.researching}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Boton completar con TUNG */}
              {fxuCost > 0 && (
                <button
                  onClick={handleInstantComplete}
                  disabled={!profile || Number(profile.tung_balance) < fxuCost || isProcessing}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${
                    profile && Number(profile.tung_balance) >= fxuCost && !isProcessing
                      ? 'bg-gradient-to-b from-amber-300 to-amber-600 text-stone-950 border border-amber-200 hover:from-amber-200 hover:to-amber-500'
                      : 'bg-black/30 text-amber-200/40 cursor-not-allowed border border-amber-800/40'
                  }`}
                  title={
                    profile && Number(profile.tung_balance) >= fxuCost
                      ? `Complete instantly for ${fxuCost} TUNG`
                      : 'Insufficient TUNG'
                  }
                >
                  <Coins className="w-4 h-4" />
                  {fxuCost} TUNG
                </button>
              )}
              <div className="font-serif text-emerald-300 text-lg sm:text-xl flex-shrink-0">
                {researchInProgress.research_end_time
                  ? formatTimeRemaining(researchInProgress.research_end_time)
                  : '--:--:--'}
              </div>
              <button
                onClick={() => setShowCancelConfirm(true)}
                disabled={isProcessing}
                className="p-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 rounded-lg transition-colors"
                title={t.common.cancel}
              >
                <X className="w-4 h-4 text-red-400" />
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Cola de investigaciones (Comandante) */}
      {researchQueue.length > 0 && (
        <div className="relative p-[3px] rounded-2xl bg-gradient-to-b from-amber-300 via-amber-700 to-amber-500 shadow-[0_14px_40px_rgba(0,0,0,0.65)]">
          <span className="pointer-events-none absolute left-2 top-2 w-3.5 h-3.5 border-l-[3px] border-t-[3px] border-amber-200 z-20 rounded-tl-sm" />
          <span className="pointer-events-none absolute right-2 top-2 w-3.5 h-3.5 border-r-[3px] border-t-[3px] border-amber-200 z-20 rounded-tr-sm" />
          <span className="pointer-events-none absolute left-2 bottom-2 w-3.5 h-3.5 border-l-[3px] border-b-[3px] border-amber-200 z-20 rounded-bl-sm" />
          <span className="pointer-events-none absolute right-2 bottom-2 w-3.5 h-3.5 border-r-[3px] border-b-[3px] border-amber-200 z-20 rounded-br-sm" />
          <div className="relative rounded-[13px] bg-[linear-gradient(180deg,#32291f_0%,#201a12_45%,#110d07_100%)] p-3 sm:p-4 overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-sky-400" />
            <p className="text-sm text-amber-200/80 font-semibold">
              {t.common.queue || 'En cola'} ({researchQueue.length}/2)
            </p>
          </div>
          <div className="space-y-2">
            {researchQueue.map((qi) => (
              <div
                key={qi.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/25 border border-amber-800/30"
              >
                <div className="min-w-0">
                  <p className="text-amber-100 text-sm font-semibold truncate">
                    {qi.technology_type
                      ? translateResearchName(t, qi.technology_type.code, qi.technology_type.name)
                      : ''}{' '}
                    {t.common.level} {qi.target_level}
                  </p>
                  <p className="text-xs text-amber-200/50">#{qi.queue_position}</p>
                </div>
                <button
                  onClick={async () => {
                    if (isProcessing) return;
                    setIsProcessing(true);
                    try {
                      await cancelQueuedResearch(qi.id);
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  disabled={isProcessing}
                  className="p-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 rounded-lg transition-colors flex-shrink-0"
                  title={t.common.cancel}
                >
                  <X className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* Modal confirmar cancelar investigacion */}
      {showCancelConfirm && researchInProgress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-space-800 border border-amber-500/40 rounded-2xl overflow-hidden shadow-2xl shadow-amber-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative p-5">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-space-700 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-orbitron text-white text-base">{t.common.cancel} {t.research.title}</h3>
                  <p className="text-sm text-gray-400">
                    {researchInProgress.technology_type ? translateResearchName(t, researchInProgress.technology_type.code, researchInProgress.technology_type.name) : ''} {t.common.level} {(researchInProgress.level || 0) + 1}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-amber-300/90 leading-tight">
                    Cancelar devuelve recursos proporcionales al tiempo restante (~{getCancelRefundPercent()}%).
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-space-700 hover:bg-space-600 text-gray-300 font-semibold text-sm transition-all"
                >
                  {t.common.cancel}
                </button>
                <button
                  onClick={handleCancelResearch}
                  disabled={isProcessing}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 hover:text-red-300 font-semibold text-sm transition-all disabled:opacity-50"
                >
                  {isProcessing ? t.common.loading : t.common.confirm}
                </button>
              </div>
            </div>
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
        <button
          onClick={() => navigate('/game/lottery')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30 text-purple-300 hover:border-purple-400/50 hover:text-purple-200 transition-all group"
        >
          <img
            src="https://photos.pinksale.finance/file/pinksale-logo-upload/1775067036507-327d40aa0444bcab4ac5ca7406f0eb5e.png"
            alt="Lotería"
            className="w-4 h-4 rounded object-cover"
          />
          <span>Lotería</span>
          <span className="text-amber-400 font-bold">🏆</span>
        </button>
      </div>

      {/* Grid de tecnologias */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        {filteredTechnologies.map((techType) => {
          const currentLevel = getTechLevel(techType.id);
          const techData = getTechData(techType.id);
          const isResearching = techData?.is_researching;
          const researchCheck = canResearch(techType);
          const committedLevel = getCommittedLevel(techType.id);

          const cost = calculateResearchCost(
            techType.base_metal,
            techType.base_crystal,
            techType.base_deuterium,
            techType.cost_factor,
            committedLevel
          );

          const finalLabLevel = effectiveLabLevel ?? getLabLevel();
          let researchTime = calculateResearchTime(cost.metal, cost.crystal, finalLabLevel);
          const officerBonuses = getOfficerBonuses(activeOfficers);
          researchTime = calculateResearchTimeWithBonus(researchTime, officerBonuses, isPlus);
          const allReqs = getAllRequirements(techType);

          return (
            <TechCard
              key={techType.id}
              techType={techType}
              currentLevel={currentLevel}
              nextLevel={committedLevel + 1}
              allowQueueWhileResearching={hasCommander}
              cost={cost}
              researchTime={researchTime}
              isResearching={isResearching}
              canResearch={researchCheck.allowed && !isProcessing}
              disabledReason={isProcessing ? t.common.processing : researchCheck.reason}
              missingReqs={researchCheck.missingReqs}
              allRequirements={allReqs}
              resources={resources}
              endTime={techData?.research_end_time}
              onResearch={() => handleResearch(techType.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface TechCardProps {
  techType: TechnologyType;
  currentLevel: number;
  nextLevel: number;
  allowQueueWhileResearching: boolean;
  cost: { metal: number; crystal: number; deuterium: number };
  researchTime: number;
  isResearching?: boolean;
  canResearch: boolean;
  disabledReason?: string;
  missingReqs?: string[];
  allRequirements: { name: string; level: number; met: boolean; isEnergy?: boolean }[];
  resources: { metal: number; crystal: number; deuterium: number; energy_max?: number } | null;
  endTime?: string;
  onResearch: () => void;
}

function TechCard({
  techType,
  currentLevel,
  nextLevel,
  allowQueueWhileResearching,
  cost,
  researchTime,
  isResearching,
  canResearch,
  disabledReason,
  missingReqs,
  allRequirements,
  resources,
  endTime,
  onResearch,
}: TechCardProps) {
  const { t } = useI18n();
  const planets = useGameStore((s) => s.planets);
  const fallbackIcon = categoryIcons[techType.category] || <Cpu className="w-24 h-24" />;
  const isMaxLevel = currentLevel >= techType.max_level;
  const isNextOverMax = nextLevel > techType.max_level;
  const showResearchingBox = !!(isResearching && endTime);
  const isLocked = missingReqs && missingReqs.length > 0;
  // Regla del servidor (validate_fleet_mission / process_fleet_arrival):
  // max_planetas = 1 + FLOOR((astrofisica + 1) / 2), contando el planeta principal.
  const maxPlanetsNow = 1 + Math.floor((currentLevel + 1) / 2);
  const maxPlanetsNext = 1 + Math.floor((currentLevel + 2) / 2);
  const ownedPlanets = planets.filter((p) => !p.is_destroyed).length;
  const scaledEnergyForCard = (techType.energy_required && techType.energy_required > 0)
    ? Math.ceil(techType.energy_required * Math.pow(Number(techType.cost_factor), nextLevel - 1))
    : 0;

  return (
    <div
      className={`relative p-[3px] rounded-2xl bg-gradient-to-b from-amber-300 via-amber-700 to-amber-500 shadow-[0_14px_40px_rgba(0,0,0,0.65)] transition-all hover:shadow-[0_0_0_2px_rgba(251,191,36,0.35),0_18px_48px_rgba(0,0,0,0.8)] ${isResearching ? 'ring-2 ring-emerald-400' : ''} ${isMaxLevel ? 'opacity-75' : ''} ${isLocked ? 'opacity-60' : ''}`}
    >
      <span className="pointer-events-none absolute left-2 top-2 w-3.5 h-3.5 border-l-[3px] border-t-[3px] border-amber-200 z-20 rounded-tl-sm" />
      <span className="pointer-events-none absolute right-2 top-2 w-3.5 h-3.5 border-r-[3px] border-t-[3px] border-amber-200 z-20 rounded-tr-sm" />
      <span className="pointer-events-none absolute left-2 bottom-2 w-3.5 h-3.5 border-l-[3px] border-b-[3px] border-amber-200 z-20 rounded-bl-sm" />
      <span className="pointer-events-none absolute right-2 bottom-2 w-3.5 h-3.5 border-r-[3px] border-b-[3px] border-amber-200 z-20 rounded-br-sm" />

      <div className="relative rounded-[13px] bg-[linear-gradient(180deg,#32291f_0%,#201a12_45%,#110d07_100%)] overflow-hidden">
      {/* Imagen de la tecnologia */}
      <div className="relative w-full aspect-[4/3] sm:aspect-square bg-[radial-gradient(circle_at_50%_30%,#4a3d2a_0%,#241c10_60%,#120d06_100%)] overflow-hidden group">
        {techType.image_url ? (
          <div className="absolute inset-0 m-3 sm:m-4 rounded-full overflow-hidden border-[3px] border-amber-600/70 shadow-[0_6px_20px_rgba(0,0,0,0.5)]">
            <MediaDisplay
              src={techType.image_url}
              alt={translateResearchName(t, techType.code, techType.name)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-amber-200/25 group-hover:text-amber-400/60 transition-colors">
              {fallbackIcon}
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0804]/90 via-transparent to-transparent" />
        <div className="absolute top-2.5 left-2.5 z-10 w-8 h-8 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fca5a5,#b91c1c)] border border-red-300/60 shadow-[0_3px_10px_rgba(0,0,0,0.6)] flex items-center justify-center text-red-100 text-sm">⚜</div>
        <div className="absolute top-1.5 right-1.5 sm:top-3 sm:right-3 z-10 flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fde68a,#d97706)] text-stone-950 font-serif font-bold border border-amber-200 shadow-[0_3px_10px_rgba(0,0,0,0.6)]">
          <span className="text-[10px] sm:text-sm">
            {t.common.level} {currentLevel}
          </span>
          {isMaxLevel && <span className="text-[10px] text-stone-700 ml-1">(MAX)</span>}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-1.5 sm:p-4">
          <h3 className="font-serif text-[11px] sm:text-lg font-semibold text-amber-100 group-hover:text-amber-300 transition-colors truncate">
            {translateResearchName(t, techType.code, techType.name)}
          </h3>
          <p className="text-xs text-amber-200/60 line-clamp-2 mt-1">{translateTechDescription(techType.code, techType.description)}</p>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
        {/* Aviso clave: el espionaje se compara con el del oponente */}
        {techType.code === 'espionage_tech' && (
          <div className="text-xs p-2.5 bg-amber-500/10 border border-amber-500/40 rounded-lg space-y-1">
            <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>MUY IMPORTANTE</span>
            </div>
            <p className="text-gray-300 leading-relaxed">
              Tu informe de espionaje depende de tu nivel <span className="text-white font-semibold">comparado con el del oponente</span>.
              Si el enemigo tiene esta tecnologia a un nivel mas alto que el tuyo,{' '}
              <span className="text-white font-semibold">no veras su flota, defensas ni edificios</span>.
            </p>
            <p className="text-amber-200/90 leading-relaxed">
              ⚠️ Que el informe salga vacio NO significa que no tenga naves: si atacas a ciegas puedes perder toda tu flota.
            </p>
          </div>
        )}

        {/* Aviso clave: cuantos planetas permite la Astrofisica */}
        {techType.code === 'astrophysics' && (
          <div className="text-xs p-2.5 bg-cyan-500/10 border border-cyan-500/40 rounded-lg space-y-1">
            <div className="flex items-center gap-1.5 text-cyan-300 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>LIMITE DE PLANETAS</span>
            </div>
            <p className="text-gray-300 leading-relaxed">
              Con <span className="text-white font-semibold">nivel {currentLevel}</span> puedes tener hasta{' '}
              <span className="text-white font-semibold">{maxPlanetsNow} planeta{maxPlanetsNow === 1 ? '' : 's'}</span>{' '}
              en total (incluyendo tu planeta principal). Ahora tienes{' '}
              <span className={ownedPlanets >= maxPlanetsNow ? 'text-cyber-orange font-semibold' : 'text-cyber-green font-semibold'}>
                {ownedPlanets}
              </span>.
            </p>
            {!isMaxLevel && (
              <p className="text-cyan-200/90 leading-relaxed">
                {maxPlanetsNext > maxPlanetsNow
                  ? <>Al subir al nivel {currentLevel + 1} podras tener {maxPlanetsNext} planetas.</>
                  : <>El nivel {currentLevel + 1} no da plaza nueva; la siguiente llega en el nivel {currentLevel + 2} ({maxPlanetsNow + 1} planetas).</>
                }
              </p>
            )}
            <p className="text-gray-400 leading-relaxed">
              Formula: 1 + (nivel + 1) / 2 redondeado hacia abajo. Cada nivel impar desbloquea una plaza mas.
            </p>
            <details className="text-gray-400">
              <summary className="cursor-pointer select-none text-cyan-300/80 hover:text-cyan-200">Ver tabla de ejemplo</summary>
              <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px]">
                {[
                  ['0', 1], ['1-2', 2], ['3-4', 3], ['5-6', 4], ['7-8', 5],
                  ['9-10', 6], ['11-12', 7], ['13-14', 8], ['15-16', 9],
                ].map(([lv, pl]) => (
                  <div key={lv as string} className="flex justify-between px-1.5 py-0.5 rounded bg-space-700/40">
                    <span>Nv {lv}</span>
                    <span className="text-white">{pl}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Requisitos */}
        {allRequirements.length > 0 && (
          <div className="text-xs space-y-1 p-2 bg-black/20 border border-amber-800/30 rounded-lg">
            <span className="text-amber-200/70 font-medium">{t.common.requirements}:</span>
            {allRequirements.map((req, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-1 ${req.met ? 'text-emerald-400' : 'text-amber-500'}`}
              >
                <span className="font-bold">{req.met ? '✓' : '✗'}</span>
                <span>
                  {req.isEnergy
                    ? `${req.name}: ${formatNumber(req.level)}`
                    : `${req.name} ${t.common.level}.${req.level}`
                  }
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Estado: Investigando */}
        {showResearchingBox && endTime && (
          <div className="bg-emerald-500/10 border border-emerald-600/30 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-amber-200/70">
                {t.research.researching} {t.common.level} {currentLevel + 1}
              </span>
              <span className="font-serif text-emerald-300">
                {formatTimeRemaining(endTime)}
              </span>
            </div>
          </div>
        )}
        {/* [RQSAME1] con Comandante se puede encolar el siguiente nivel de la misma tecnologia */}
        {showResearchingBox && (!allowQueueWhileResearching || isNextOverMax) ? null : isLocked ? (
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <Lock className="w-4 h-4 flex-shrink-0" />
            {t.common.locked}
          </div>
        ) : !isNextOverMax ? (
          <>
            {/* Costos */}
            {scaledEnergyForCard > 0 ? (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-400 mb-2">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm font-semibold">{t.research.energyRequired}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-orbitron text-yellow-400">
                    {formatNumber(scaledEnergyForCard)}
                  </span>
                  <span className={`text-sm ${(resources?.energy_max || 0) >= scaledEnergyForCard ? 'text-cyber-green' : 'text-red-400'}`}>
                    ({t.common.available}: {formatNumber(resources?.energy_max || 0)})
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:gap-1.5 sm:gap-2">
                <CostItem
                  label={t.resources.metal}
                  value={cost.metal}
                  available={resources?.metal || 0}
                />
                <CostItem
                  label={t.resources.crystal}
                  value={cost.crystal}
                  available={resources?.crystal || 0}
                />
                <CostItem
                  label={t.resources.deuterium}
                  value={cost.deuterium}
                  available={resources?.deuterium || 0}
                />
              </div>
            )}

            {/* Tiempo y boton investigar */}
            <div className="flex items-center justify-between pt-2 border-t border-amber-800/40">
              <div className="flex items-center gap-1 text-sm text-amber-200/70">
                <Clock className="w-4 h-4" />
                {formatTime(researchTime)}
              </div>
              <button
                onClick={onResearch}
                disabled={!canResearch}
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-serif font-bold uppercase tracking-[0.15em] text-sm transition-all ${
                  canResearch
                    ? 'bg-gradient-to-b from-emerald-300 via-emerald-500 to-emerald-800 text-stone-950 shadow-[0_5px_16px_rgba(5,150,105,0.45)] hover:from-emerald-200 hover:via-emerald-400 hover:to-emerald-700'
                    : 'bg-[#2a2014] text-amber-200/30 cursor-not-allowed border border-amber-800/40'
                }`}
              >
                <ChevronUp className="w-4 h-4" />
                {t.research.startResearch}
                {nextLevel > currentLevel + 1 && ` (${t.common.level} ${nextLevel})`}
              </button>
            </div>

            {/* Mensaje de error */}
            {!canResearch && disabledReason && !isLocked && (
              <div className="flex items-start gap-2 text-xs text-amber-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="break-words">{disabledReason}</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-2 text-amber-200/50 text-sm">
            {t.research.reachedMaxLevel}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
