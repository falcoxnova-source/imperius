/**
 * ResourcesPage - Pagina de Recursos y Logistica
 * Muestra produccion por hora/dia/semana, porcentajes de minas,
 * balance energetico, bonus de oficiales y capacidad de almacenes.
 * Permite modificar el % de produccion de cada mina/fuente de energia.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Zap,
  Sun,
  Flame,
  Satellite,
  Factory,
  Gem,
  Droplets,
  Save,
  RotateCcw,
  Power,
  PowerOff,
  Crown,
  Warehouse,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Anchor,
  Microscope,
  CheckCircle,
  XCircle,
  Star,
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { formatNumber } from '../../lib/utils';
import { RESOURCE_IMAGES } from '../../lib/resourceImages';
import { supabase } from '../../lib/supabase';
import { getOfficerBonuses } from '../../lib/officers';
import { useI18n, translatePlanetName } from '../../lib/i18n';
import { ActiveBonusesPanel } from '../../components/game/ActiveBonusesPanel';
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
  calculateSolarSatelliteEnergy,
} from '../../lib/formulas';

type PercentKey = 'metal_mine_percent' | 'crystal_mine_percent' | 'deuterium_synth_percent' | 'solar_plant_percent' | 'fusion_reactor_percent' | 'solar_satellite_percent';

const PERCENT_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

interface ProductionRow {
  key: PercentKey;
  label: string;
  icon: typeof Factory;
  iconColor: string;
  img?: string;
  type: 'consumer' | 'producer';
  level: number;
  baseProduction: number; // per hour at 100%
  baseEnergy: number; // energy value: negative=consumption, positive=production
}

export function ResourcesPage() {
  const { t } = useI18n();
  const { resources, currentPlanet, buildings, ships, technologies, activeOfficers, fetchResources } = useGameStore();
  const { profile, refreshProfile } = useAuthStore();

  const [localPercents, setLocalPercents] = useState<Record<PercentKey, number>>({
    metal_mine_percent: resources?.metal_mine_percent ?? 100,
    crystal_mine_percent: resources?.crystal_mine_percent ?? 100,
    deuterium_synth_percent: resources?.deuterium_synth_percent ?? 100,
    solar_plant_percent: resources?.solar_plant_percent ?? 100,
    fusion_reactor_percent: resources?.fusion_reactor_percent ?? 100,
    solar_satellite_percent: resources?.solar_satellite_percent ?? 100,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isUserPlus, setIsUserPlus] = useState(false);

  // Colony deposits / refill state
  interface RefillInfo {
    refillable?: boolean;
    reason?: string;
    planet_status?: string;
    depletion_percent?: number;
    full_price_usdt?: number;
    cost_usdt?: number;
    cost_tung?: number | null;
    live_price_available?: boolean;
  }
  const [refillInfo, setRefillInfo] = useState<RefillInfo | null>(null);
  const [isRefilling, setIsRefilling] = useState(false);
  const [refillMsg, setRefillMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadRefillInfo = useCallback(async () => {
    if (!currentPlanet) { setRefillInfo(null); return; }
    try {
      const { data, error } = await supabase.rpc('get_colony_refill_info', { p_planet_id: currentPlanet.id });
      if (error) throw error;
      if (data?.success) setRefillInfo(data as RefillInfo);
      else setRefillInfo(null);
    } catch {
      setRefillInfo(null);
    }
  }, [currentPlanet]);

  useEffect(() => {
    setRefillMsg(null);
    loadRefillInfo();
  }, [loadRefillInfo]);

  const handleRefill = useCallback(async () => {
    if (!currentPlanet || isRefilling) return;
    setIsRefilling(true);
    setRefillMsg(null);
    try {
      const { data, error } = await supabase.rpc('refill_colony_resources', { p_planet_id: currentPlanet.id });
      if (error) throw error;
      if (data?.success) {
        setRefillMsg({ type: 'success', text: data.message || 'Recursos recargados' });
        await Promise.all([refreshProfile(), fetchResources(currentPlanet.id), loadRefillInfo()]);
      } else {
        setRefillMsg({ type: 'error', text: data?.error || 'No se pudo recargar' });
      }
    } catch (e) {
      setRefillMsg({ type: 'error', text: e instanceof Error ? e.message : 'Error al recargar' });
    } finally {
      setIsRefilling(false);
    }
  }, [currentPlanet, isRefilling, refreshProfile, fetchResources, loadRefillInfo]);

  // Check VIP/Plus status
  useEffect(() => {
    if (!profile) return;
    const checkPlus = async () => {
      try {
        const { data } = await supabase
          .from('plus_subscriptions')
          .select('id')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        setIsUserPlus(!!data);
      } catch {
        setIsUserPlus(false);
      }
    };
    checkPlus();
  }, [profile]);

  // Sync local state when resources change (e.g., planet switch)
  const syncFromResources = useCallback(() => {
    if (!resources) return;
    setLocalPercents({
      metal_mine_percent: resources.metal_mine_percent ?? 100,
      crystal_mine_percent: resources.crystal_mine_percent ?? 100,
      deuterium_synth_percent: resources.deuterium_synth_percent ?? 100,
      solar_plant_percent: resources.solar_plant_percent ?? 100,
      fusion_reactor_percent: resources.fusion_reactor_percent ?? 100,
      solar_satellite_percent: resources.solar_satellite_percent ?? 100,
    });
  }, [resources]);

  // Get building level by code
  const getBuildingLevel = useCallback((code: string): number => {
    if (!buildings) return 0;
    const b = buildings.find(b => b.building_type?.code === code);
    return b?.level || 0;
  }, [buildings]);

  // Get technology level by code
  const getTechLevel = useCallback((code: string): number => {
    if (!technologies) return 0;
    const t = technologies.find(t => t.technology_type?.code === code);
    return t?.level || 0;
  }, [technologies]);

  // Get solar satellite count
  const solarSatelliteCount = useMemo(() => {
    if (!ships) return 0;
    const sat = ships.find(s => s.ship_type?.code === 'solar_satellite');
    return sat?.quantity || 0;
  }, [ships]);

  // Officer bonuses
  const officerBonuses = useMemo(() => getOfficerBonuses(activeOfficers), [activeOfficers]);

  // Determine if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (!resources) return false;
    return (
      localPercents.metal_mine_percent !== (resources.metal_mine_percent ?? 100) ||
      localPercents.crystal_mine_percent !== (resources.crystal_mine_percent ?? 100) ||
      localPercents.deuterium_synth_percent !== (resources.deuterium_synth_percent ?? 100) ||
      localPercents.solar_plant_percent !== (resources.solar_plant_percent ?? 100) ||
      localPercents.fusion_reactor_percent !== (resources.fusion_reactor_percent ?? 100) ||
      localPercents.solar_satellite_percent !== (resources.solar_satellite_percent ?? 100)
    );
  }, [localPercents, resources]);

  // Save percentages to server
  const handleSave = useCallback(async () => {
    if (!currentPlanet || !resources) return;
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const { data, error } = await supabase.rpc('update_production_percentages', {
        p_planet_id: currentPlanet.id,
        p_metal_mine_percent: localPercents.metal_mine_percent,
        p_crystal_mine_percent: localPercents.crystal_mine_percent,
        p_deuterium_synth_percent: localPercents.deuterium_synth_percent,
        p_solar_plant_percent: localPercents.solar_plant_percent,
        p_fusion_reactor_percent: localPercents.fusion_reactor_percent,
        p_solar_satellite_percent: localPercents.solar_satellite_percent,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      // Refresh resources from server
      await fetchResources(currentPlanet.id);
      setStatusMsg(t.resources.productionUpdated);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      console.error('Error updating percentages:', err);
      setStatusMsg('❌ Error: ' + (err.message || t.resources.errorUnknown));
    } finally {
      setIsSaving(false);
    }
  }, [currentPlanet, resources, localPercents, fetchResources, t.resources.productionUpdated, t.resources.errorUnknown]);

  // Quick presets
  const setAllPercents = useCallback((value: number) => {
    setLocalPercents({
      metal_mine_percent: value,
      crystal_mine_percent: value,
      deuterium_synth_percent: value,
      solar_plant_percent: value,
      fusion_reactor_percent: value,
      solar_satellite_percent: value,
    });
  }, []);

  if (!resources || !currentPlanet) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        {t.resources.loadingResources}
      </div>
    );
  }

  const metalLevel = getBuildingLevel('metal_mine');
  const crystalLevel = getBuildingLevel('crystal_mine');
  const deutLevel = getBuildingLevel('deuterium_synthesizer');
  const solarLevel = getBuildingLevel('solar_plant');
  const fusionLevel = getBuildingLevel('fusion_reactor');
  const energyTechLevel = getTechLevel('energy_tech');

  // Compute production estimates based on local percentages
  // Using simplified OGame formulas for display only
  const energyBalance = resources.energy_max - resources.energy_used;
  const position = currentPlanet.position;
  const maxTemp = currentPlanet.temp_max;

  // Compute base production & energy values using game formulas (at 100%, no energy_factor)
  const metalBaseProduction = calculateMetalProduction(metalLevel);
  const crystalBaseProduction = calculateCrystalProduction(crystalLevel);
  const deutBaseProduction = calculateDeuteriumProduction(deutLevel, maxTemp);

  const metalEnergyConsumption = calculateMetalEnergyConsumption(metalLevel);
  const crystalEnergyConsumption = calculateCrystalEnergyConsumption(crystalLevel);
  const deutEnergyConsumption = calculateDeuteriumEnergyConsumption(deutLevel);

  const solarPlantEnergy = calculateSolarPlantEnergy(solarLevel, position);
  const fusionReactorEnergy = calculateFusionReactorEnergy(fusionLevel, energyTechLevel);
  const fusionDeutConsumption = calculateFusionReactorConsumption(fusionLevel);
  const solarSatEnergy = calculateSolarSatelliteEnergy(energyTechLevel);

  // Engineer bonus multiplier for display
  const energyBonusMult = officerBonuses.hasEngineer ? 1.1 : 1.0;
  // Mine bonus: Geologist +10% and VIP +10% (additive, matching backend logic)
  const mineBonusMult = 1.0 + (officerBonuses.hasGeologist ? 0.1 : 0) + (isUserPlus ? 0.1 : 0);

  const rows: ProductionRow[] = [
    {
      key: 'metal_mine_percent',
      label: t.buildings.metalMine,
      icon: Factory,
      iconColor: 'text-gray-400',
      img: RESOURCE_IMAGES.metal,
      type: 'consumer',
      level: metalLevel,
      baseProduction: Math.floor(metalBaseProduction * mineBonusMult),
      baseEnergy: -metalEnergyConsumption,
    },
    {
      key: 'crystal_mine_percent',
      label: t.buildings.crystalMine,
      icon: Gem,
      iconColor: 'text-cyan-400',
      img: RESOURCE_IMAGES.crystal,
      type: 'consumer',
      level: crystalLevel,
      baseProduction: Math.floor(crystalBaseProduction * mineBonusMult),
      baseEnergy: -crystalEnergyConsumption,
    },
    {
      key: 'deuterium_synth_percent',
      label: t.buildings.deuteriumSynthesizer,
      icon: Droplets,
      iconColor: 'text-green-400',
      img: RESOURCE_IMAGES.deuterium,
      type: 'consumer',
      level: deutLevel,
      baseProduction: Math.floor(deutBaseProduction * mineBonusMult),
      baseEnergy: -deutEnergyConsumption,
    },
    {
      key: 'solar_plant_percent',
      label: t.buildings.solarPlant,
      icon: Sun,
      iconColor: 'text-yellow-400',
      type: 'producer',
      level: solarLevel,
      baseProduction: 0,
      baseEnergy: Math.floor(solarPlantEnergy * energyBonusMult),
    },
    {
      key: 'fusion_reactor_percent',
      label: t.buildings.fusionReactor,
      icon: Flame,
      iconColor: 'text-orange-400',
      type: 'producer',
      level: fusionLevel,
      baseProduction: -fusionDeutConsumption, // negative = deut consumption
      baseEnergy: Math.floor(fusionReactorEnergy * energyBonusMult),
    },
    {
      key: 'solar_satellite_percent',
      label: t.shipyard.solarSatellite,
      icon: Satellite,
      iconColor: 'text-yellow-300',
      type: 'producer',
      level: solarSatelliteCount,
      baseProduction: 0,
      baseEnergy: Math.floor(solarSatEnergy * solarSatelliteCount * energyBonusMult),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
      {/* Header */}
      <div className="card-glass p-4 rounded-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyber-blue" />
            <h1 className="text-lg font-orbitron text-white">{t.resources.managementTitle}</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">{t.resources.planet}:</span>
            <span className="text-white font-semibold">{translatePlanetName(currentPlanet.name)}</span>
            <span className="text-gray-500">({currentPlanet.galaxy}:{currentPlanet.solar_system}:{currentPlanet.position})</span>
          </div>
        </div>
      </div>

      {/* Yacimiento / Recarga de recursos */}
      {refillInfo && refillInfo.depletion_percent !== undefined && (
        <div className="card-glass p-4 rounded-lg">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Factory className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Yacimiento de la Colonia</h2>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${refillInfo.planet_status === 'depleted' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
              {refillInfo.planet_status === 'depleted' ? 'Agotado' : 'Activo'}
            </span>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-400">Agotamiento</span>
              <span className="text-white font-orbitron">{refillInfo.depletion_percent}%</span>
            </div>
            <div className="h-2.5 w-full bg-space-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${(refillInfo.depletion_percent ?? 0) >= 75 ? 'bg-red-500' : (refillInfo.depletion_percent ?? 0) >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, Math.max(0, refillInfo.depletion_percent ?? 0))}%` }}
              />
            </div>
          </div>

          {refillMsg && (
            <div className={`mb-3 text-xs flex items-center gap-1.5 px-3 py-1.5 rounded ${refillMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {refillMsg.type === 'success' ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              <span>{refillMsg.text}</span>
            </div>
          )}

          {refillInfo.refillable ? (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs text-gray-400">
                Costo de recarga:{' '}
                {refillInfo.cost_tung != null ? (
                  <span className="text-yellow-400 font-orbitron">{formatNumber(refillInfo.cost_tung)} TUNG</span>
                ) : (
                  <span className="text-gray-500">precio no disponible</span>
                )}
                {refillInfo.cost_usdt != null && (
                  <span className="text-gray-600"> (~{refillInfo.cost_usdt} USDT)</span>
                )}
                <span className="block text-[10px] text-gray-600 mt-0.5">
                  Tu saldo: {formatNumber(Number(profile?.tung_balance ?? 0))} TUNG
                </span>
              </div>
              <button
                onClick={handleRefill}
                disabled={isRefilling || refillInfo.cost_tung == null || Number(profile?.tung_balance ?? 0) < (refillInfo.cost_tung ?? Infinity)}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRefilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Recargar Recursos
              </button>
            </div>
          ) : (
            <div className="text-xs text-gray-500">Los yacimientos están llenos, no requiere recarga.</div>
          )}
        </div>
      )}

      {/* Energy Summary */}
      <div className="card-glass p-4 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Zap className={`w-5 h-5 ${energyBalance < 0 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`} />
          <h2 className="text-sm font-semibold text-white">{t.resources.energyBalanceTitle}</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-space-700/50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase">{t.resources.produced}</div>
            <div className="text-lg font-orbitron text-green-400">{formatNumber(resources.energy_max)}</div>
          </div>
          <div className="bg-space-700/50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase">{t.resources.consumed}</div>
            <div className="text-lg font-orbitron text-orange-400">{formatNumber(resources.energy_used)}</div>
          </div>
          <div className={`rounded-lg p-3 text-center ${energyBalance < 0 ? 'bg-red-500/10 border border-red-500/30' : 'bg-green-500/10 border border-green-500/20'}`}>
            <div className="text-[10px] text-gray-500 uppercase">{energyBalance < 0 ? t.resources.deficit : t.resources.available}</div>
            <div className={`text-lg font-orbitron ${energyBalance < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatNumber(energyBalance)}</div>
          </div>
        </div>
        {energyBalance < 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{t.resources.energyDeficitWarningPrefix} {resources.energy_used > 0 ? Math.round((resources.energy_max / resources.energy_used) * 100) : 0}%</span>
          </div>
        )}
      </div>

      {/* Production Table */}
      <div className="card-glass p-4 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">{t.resources.productionByInstallation}</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAllPercents(100)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/20 transition-all"
              title={t.resources.setAll100Title}
            >
              <Power className="w-3 h-3" />
              100%
            </button>
            <button
              onClick={() => setAllPercents(0)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20 transition-all"
              title={t.resources.blackoutTitle}
            >
              <PowerOff className="w-3 h-3" />
              0%
            </button>
            <button
              onClick={syncFromResources}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-space-600 hover:bg-space-500 text-gray-300 border border-space-500 transition-all"
              title={t.resources.restoreSavedTitle}
            >
              <RotateCcw className="w-3 h-3" />
              {t.resources.reset}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 uppercase text-[10px] border-b border-space-600">
                <th className="text-left py-2 px-1">{t.resources.installation}</th>
                <th className="text-center py-2 px-1">{t.resources.levelShort}</th>
                <th className="text-center py-2 px-1">%</th>
                <th className="text-right py-2 px-1">{t.resources.energyColumn}</th>
                <th className="text-right py-2 px-1">{t.resources.perHourLabel}</th>
                <th className="text-right py-2 px-1 hidden sm:table-cell">{t.resources.perDayLabel}</th>
                <th className="text-right py-2 px-1 hidden md:table-cell">{t.resources.perWeekLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const pct = localPercents[row.key];
                const isModified = resources && pct !== (resources[row.key] ?? 100);
                const isConsumer = row.type === 'consumer';
                // Scale energy and production by local percentage
                const scaledEnergy = Math.floor(row.baseEnergy * (pct / 100));
                const scaledProduction = Math.floor(row.baseProduction * (pct / 100));
                // For consumers: per_hour scales by % (before energy_factor)
                const perHour = isConsumer ? scaledProduction : scaledProduction;
                
                return (
                  <tr 
                    key={row.key} 
                    className={`border-b border-space-700/50 hover:bg-space-700/30 transition-colors ${isModified ? 'bg-cyber-blue/5' : ''}`}
                  >
                    <td className="py-2 px-1">
                      <div className="flex items-center gap-1.5">
                        {row.img ? (
                          <img src={row.img} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0 ring-1 ring-white/10" />
                        ) : (
                          <row.icon className={`w-3.5 h-3.5 ${row.iconColor}`} />
                        )}
                        <span className="text-white truncate">{row.label}</span>
                        {row.type === 'producer' && (
                          <span className="text-[9px] text-yellow-400 bg-yellow-500/10 px-1 rounded">⚡</span>
                        )}
                      </div>
                    </td>
                    <td className="text-center py-2 px-1 text-gray-400 font-orbitron">
                      {row.key === 'solar_satellite_percent' ? `×${row.level}` : row.level}
                    </td>
                    <td className="text-center py-2 px-1">
                      <select
                        value={pct}
                        onChange={(e) => setLocalPercents(prev => ({ ...prev, [row.key]: Number(e.target.value) }))}
                        className={`bg-space-700 border rounded px-1.5 py-0.5 text-xs font-semibold cursor-pointer transition-all ${
                          pct === 0 ? 'border-red-500/40 text-red-400' :
                          pct < 100 ? 'border-orange-500/40 text-orange-400' :
                          'border-space-500 text-white'
                        } ${isModified ? 'ring-1 ring-cyber-blue/50' : ''}`}
                      >
                        {PERCENT_OPTIONS.map(v => (
                          <option key={v} value={v}>{v}%</option>
                        ))}
                      </select>
                    </td>
                    {/* Energy column */}
                    <td className="text-right py-2 px-1">
                      {scaledEnergy !== 0 ? (
                        <span className={`font-orbitron text-[11px] ${scaledEnergy > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {scaledEnergy > 0 ? '+' : ''}{formatNumber(scaledEnergy)}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    {/* Production column */}
                    <td className="text-right py-2 px-1">
                      {perHour !== 0 ? (
                        <span className={`font-orbitron ${perHour > 0 ? 'text-white' : 'text-orange-400'}`}>
                          {perHour < 0 ? '' : ''}{formatNumber(perHour)}
                        </span>
                      ) : isConsumer ? (
                        <span className="text-gray-500">0</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-1 hidden sm:table-cell">
                      {perHour !== 0 ? (
                        <span className={`font-orbitron ${perHour > 0 ? 'text-gray-300' : 'text-orange-300/70'}`}>
                          {formatNumber(perHour * 24)}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-1 hidden md:table-cell">
                      {perHour !== 0 ? (
                        <span className={`font-orbitron ${perHour > 0 ? 'text-gray-300' : 'text-orange-300/70'}`}>
                          {formatNumber(perHour * 168)}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-3 pt-3 border-t border-space-600">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="relative overflow-hidden bg-space-700/40 rounded p-2 flex items-center gap-2">
              <img src={RESOURCE_IMAGES.metal} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0 ring-1 ring-white/10" />
              <div className="min-w-0">
                <div className="text-[10px] text-gray-500 truncate">{t.resources.metalPerHour}</div>
                <div className="font-orbitron text-gray-300">{formatNumber(resources.metal_per_hour)}</div>
              </div>
            </div>
            <div className="relative overflow-hidden bg-space-700/40 rounded p-2 flex items-center gap-2">
              <img src={RESOURCE_IMAGES.crystal} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0 ring-1 ring-white/10" />
              <div className="min-w-0">
                <div className="text-[10px] text-gray-500 truncate">{t.resources.crystalPerHour}</div>
                <div className="font-orbitron text-cyan-300">{formatNumber(resources.crystal_per_hour)}</div>
              </div>
            </div>
            <div className="relative overflow-hidden bg-space-700/40 rounded p-2 flex items-center gap-2">
              <img src={RESOURCE_IMAGES.deuterium} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0 ring-1 ring-white/10" />
              <div className="min-w-0">
                <div className="text-[10px] text-gray-500 truncate">{t.resources.deuteriumPerHour}</div>
                <div className="font-orbitron text-green-300">{formatNumber(resources.deuterium_per_hour)}</div>
              </div>
            </div>
            <div className="relative overflow-hidden bg-space-700/40 rounded p-2 flex items-center gap-2">
              <img src={RESOURCE_IMAGES.energy} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0 ring-1 ring-white/10" />
              <div className="min-w-0">
                <div className="text-[10px] text-gray-500 truncate">Energía</div>
                <div className={`font-orbitron ${energyBalance < 0 ? 'text-red-400' : 'text-yellow-300'}`}>{formatNumber(energyBalance)}</div>
              </div>
            </div>
          </div>
          {/* Energy Factor */}
          {energyBalance < 0 && resources.energy_used > 0 && (
            <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded p-2 flex items-center justify-between text-xs">
              <span className="text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t.resources.energyFactorApplied}
              </span>
              <span className="font-orbitron text-red-400">
                {Math.round((resources.energy_max / resources.energy_used) * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Storage Capacity */}
      <div className="card-glass p-4 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Warehouse className="w-5 h-5 text-cyber-blue" />
          <h2 className="text-sm font-semibold text-white">{t.resources.storageCapacityTitle}</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t.resources.metal, current: resources.metal, max: resources.metal_storage, color: 'gray' },
            { label: t.resources.crystal, current: resources.crystal, max: resources.crystal_storage, color: 'cyan' },
            { label: t.resources.deuterium, current: resources.deuterium, max: resources.deuterium_storage, color: 'green' },
          ].map(s => {
            const pct = s.max > 0 ? Math.min(100, (s.current / s.max) * 100) : 0;
            const isFull = pct >= 100;
            return (
              <div key={s.label} className="bg-space-700/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs text-${s.color}-400`}>{s.label}</span>
                  <span className={`text-[10px] ${isFull ? 'text-red-400' : 'text-gray-500'}`}>{Math.round(pct)}%</span>
                </div>
                <div className="w-full h-1.5 bg-space-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isFull ? 'bg-red-500' : `bg-${s.color}-400`}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-gray-500">
                  {formatNumber(s.current)} / {formatNumber(s.max)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Officer Bonuses */}
      <div className="card-glass p-4 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-5 h-5 text-fuchsia-400" />
          <h2 className="text-sm font-semibold text-white">{t.resources.officerBonusesTitle}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
          {/* VIP/Plus - Mine bonus */}
          <div className={`rounded-lg p-2.5 flex items-center gap-2.5 border transition-all ${
            isUserPlus 
              ? 'bg-fuchsia-500/10 border-fuchsia-500/30' 
              : 'bg-space-700/40 border-space-600'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isUserPlus ? 'bg-fuchsia-500/20' : 'bg-space-600'
            }`}>
              <Star className={`w-4 h-4 ${isUserPlus ? 'text-fuchsia-400' : 'text-gray-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={isUserPlus ? 'text-white font-semibold' : 'text-gray-400'}>VIP Plus</span>
                {isUserPlus ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-gray-600" />
                )}
              </div>
              <div className={`text-[10px] ${isUserPlus ? 'text-fuchsia-300' : 'text-gray-500'}`}>
                {t.resources.vipMineBonus}
              </div>
            </div>
          </div>

          {/* Geologist - Mine bonus */}
          <div className={`rounded-lg p-2.5 flex items-center gap-2.5 border transition-all ${
            officerBonuses.hasGeologist 
              ? 'bg-amber-500/10 border-amber-500/30' 
              : 'bg-space-700/40 border-space-600'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              officerBonuses.hasGeologist ? 'bg-amber-500/20' : 'bg-space-600'
            }`}>
              <Factory className={`w-4 h-4 ${officerBonuses.hasGeologist ? 'text-amber-400' : 'text-gray-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={officerBonuses.hasGeologist ? 'text-white font-semibold' : 'text-gray-400'}>{t.officers.geologist}</span>
                {officerBonuses.hasGeologist ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-gray-600" />
                )}
              </div>
              <div className={`text-[10px] ${officerBonuses.hasGeologist ? 'text-amber-300' : 'text-gray-500'}`}>
                {t.resources.geologistMineBonus}
              </div>
            </div>
          </div>

          {/* Engineer - Energy bonus */}
          <div className={`rounded-lg p-2.5 flex items-center gap-2.5 border transition-all ${
            officerBonuses.hasEngineer 
              ? 'bg-yellow-500/10 border-yellow-500/30' 
              : 'bg-space-700/40 border-space-600'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              officerBonuses.hasEngineer ? 'bg-yellow-500/20' : 'bg-space-600'
            }`}>
              <Zap className={`w-4 h-4 ${officerBonuses.hasEngineer ? 'text-yellow-400' : 'text-gray-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={officerBonuses.hasEngineer ? 'text-white font-semibold' : 'text-gray-400'}>{t.officers.engineer}</span>
                {officerBonuses.hasEngineer ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-gray-600" />
                )}
              </div>
              <div className={`text-[10px] ${officerBonuses.hasEngineer ? 'text-yellow-300' : 'text-gray-500'}`}>
                {t.resources.engineerBonus}
              </div>
            </div>
          </div>

          {/* Commander - Queue bonus */}
          <div className={`rounded-lg p-2.5 flex items-center gap-2.5 border transition-all ${
            officerBonuses.hasCommander 
              ? 'bg-blue-500/10 border-blue-500/30' 
              : 'bg-space-700/40 border-space-600'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              officerBonuses.hasCommander ? 'bg-blue-500/20' : 'bg-space-600'
            }`}>
              <Crown className={`w-4 h-4 ${officerBonuses.hasCommander ? 'text-blue-400' : 'text-gray-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={officerBonuses.hasCommander ? 'text-white font-semibold' : 'text-gray-400'}>{t.officers.commander}</span>
                {officerBonuses.hasCommander ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-gray-600" />
                )}
              </div>
              <div className={`text-[10px] ${officerBonuses.hasCommander ? 'text-blue-300' : 'text-gray-500'}`}>
                {t.resources.commanderBonus}
              </div>
            </div>
          </div>

          {/* Admiral - Fleet bonus */}
          <div className={`rounded-lg p-2.5 flex items-center gap-2.5 border transition-all ${
            officerBonuses.hasAdmiral 
              ? 'bg-purple-500/10 border-purple-500/30' 
              : 'bg-space-700/40 border-space-600'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              officerBonuses.hasAdmiral ? 'bg-purple-500/20' : 'bg-space-600'
            }`}>
              <Anchor className={`w-4 h-4 ${officerBonuses.hasAdmiral ? 'text-purple-400' : 'text-gray-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={officerBonuses.hasAdmiral ? 'text-white font-semibold' : 'text-gray-400'}>{t.officers.admiral}</span>
                {officerBonuses.hasAdmiral ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-gray-600" />
                )}
              </div>
              <div className={`text-[10px] ${officerBonuses.hasAdmiral ? 'text-purple-300' : 'text-gray-500'}`}>
                {t.resources.admiralBonus}
              </div>
            </div>
          </div>

          {/* Technocrat - Research bonus */}
          <div className={`rounded-lg p-2.5 flex items-center gap-2.5 border transition-all ${
            officerBonuses.hasTechnocrat 
              ? 'bg-cyan-500/10 border-cyan-500/30' 
              : 'bg-space-700/40 border-space-600'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              officerBonuses.hasTechnocrat ? 'bg-cyan-500/20' : 'bg-space-600'
            }`}>
              <Microscope className={`w-4 h-4 ${officerBonuses.hasTechnocrat ? 'text-cyan-400' : 'text-gray-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={officerBonuses.hasTechnocrat ? 'text-white font-semibold' : 'text-gray-400'}>{t.officers.technocrat}</span>
                {officerBonuses.hasTechnocrat ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-gray-600" />
                )}
              </div>
              <div className={`text-[10px] ${officerBonuses.hasTechnocrat ? 'text-cyan-300' : 'text-gray-500'}`}>
                {t.resources.technocratBonus}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Daily Mission Bonuses */}
      {profile && <ActiveBonusesPanel />}

      {/* Save Bar */}
      <div className={`card-glass p-3 rounded-lg flex items-center justify-between transition-all ${hasChanges ? 'ring-1 ring-cyber-blue/50 bg-cyber-blue/5' : ''}`}>
        <div className="text-xs text-gray-400">
          {statusMsg ? (
            <span className={statusMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>{statusMsg}</span>
          ) : hasChanges ? (
            <span className="text-cyber-blue animate-pulse">{t.resources.unsavedChanges}</span>
          ) : (
            <span>{t.resources.allValuesSynced}</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`flex items-center gap-1.5 px-4 py-2 rounded font-semibold text-sm transition-all ${
            hasChanges && !isSaving
              ? 'bg-cyber-blue hover:bg-cyber-blue/80 text-white cursor-pointer hover:shadow-[0_0_12px_rgba(0,200,255,0.4)]'
              : 'bg-space-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? t.resources.saving : t.resources.saveChanges}
        </button>
      </div>
    </div>
  );
}
