/**
 * gameStore.ts - Store principal del juego Falco-X Universo
 *
 * Optimizado para bajo consumo de datos moviles:
 * - Cache local de datos estaticos (tipos, requisitos)
 * - Consultas con campos especificos (no select *)
 * - Sincronizacion inteligente basada en visibilidad
 */

import { create } from 'zustand';
import { supabase, handleSupabaseError, isNetworkError, isRetryableDbError, isOnline } from '../lib/supabase';
import {
  calculateBuildingCost,
  calculateBuildingTime,
  calculateResearchCost,
  calculateResearchTime,
  calculateShipyardTime,
  calculateResearchTimeWithBonus,
  calculateBuildingQueueSlots,
} from '../lib/formulas';
import { fetchActiveOfficers, getOfficerBonuses, hasActiveOfficer } from '../lib/officers';
import { precacheImages } from '../lib/imageCache';
import { getFromCache, setToCache, CACHE_KEYS } from '../lib/dataCache';
import type {
  Planet,
  PlanetResources,
  PlanetBuilding,
  BuildingType,
  BuildingRequirement,
  BuildingQueueItem,
  TechnologyType,
  TechnologyRequirement,
  UserTechnology,
  ShipType,
  ShipRequirement,
  PlanetShip,
  DefenseType,
  DefenseRequirement,
  PlanetDefense,
  Fleet,
  ShipyardQueueItem,
  UserOfficer,
  ResearchQueueItem,
  TreasurePlanet,
} from '../types/game';

interface GameState {
  planets: Planet[];
  currentPlanet: Planet | null;
  resources: PlanetResources | null;
  buildings: PlanetBuilding[];
  buildingTypes: BuildingType[];
  buildingRequirements: BuildingRequirement[];
  buildingQueue: BuildingQueueItem[];
  technologies: UserTechnology[];
  technologyTypes: TechnologyType[];
  technologyRequirements: TechnologyRequirement[];
  ships: PlanetShip[];
  shipTypes: ShipType[];
  shipRequirements: ShipRequirement[];
  defenses: PlanetDefense[];
  defenseTypes: DefenseType[];
  defenseRequirements: DefenseRequirement[];
  fleets: Fleet[];
  shipyardQueue: ShipyardQueueItem[];
  activeOfficers: UserOfficer[];
  researchQueue: ResearchQueueItem[];
  isLoading: boolean;
  isSaving: boolean;
  isProcessingShipyard: boolean;
  lastResourceUpdate: Date;
  lastServerSync: Date;
  isLoadingBuildingRequirements: boolean;
  isLoadingTechRequirements: boolean;
  isLoadingShipRequirements: boolean;
  isLoadingDefenseRequirements: boolean;

  fetchPlanets: (userId: string) => Promise<void>;
  selectPlanet: (planetId: string) => Promise<void>;
  fetchResources: (planetId: string) => Promise<void>;
  fetchBuildings: (planetId: string) => Promise<void>;
  fetchBuildingTypes: () => Promise<void>;
  fetchBuildingRequirements: () => Promise<void>;
  fetchBuildingQueue: (planetId: string) => Promise<void>;
  fetchTechnologies: (userId: string) => Promise<void>;
  fetchTechnologyTypes: () => Promise<void>;
  fetchTechnologyRequirements: () => Promise<void>;
  fetchShips: (planetId: string) => Promise<void>;
  fetchShipTypes: () => Promise<void>;
  fetchShipRequirements: () => Promise<void>;
  fetchDefenses: (planetId: string) => Promise<void>;
  fetchDefenseTypes: () => Promise<void>;
  fetchDefenseRequirements: () => Promise<void>;
  fetchFleets: (userId: string) => Promise<void>;
  fetchShipyardQueue: (planetId: string) => Promise<void>;
  refreshOfficers: (userId: string) => Promise<void>;
  updateResources: () => void;
  saveResourcesToDatabase: (forceSync?: boolean) => Promise<void>;
  checkBuildingCompletion: () => Promise<void>;
  checkShipyardCompletion: () => Promise<void>;
  checkResearchCompletion: (userId: string) => Promise<void>;
  checkFleetArrivals: (userId: string, onProfileUpdate?: () => void) => Promise<void>;
  addToBuildingQueue: (buildingTypeId: number) => Promise<boolean>;
  cancelBuildingQueueItem: (queueItemId: string) => Promise<boolean>;
  addToShipyardQueue: (itemType: 'ship' | 'defense', typeId: number, quantity: number) => Promise<boolean>;
  cancelShipyardQueueItem: (queueItemId: string) => Promise<boolean>;
  startResearch: (technologyTypeId: number) => Promise<boolean>;
  cancelResearch: (technologyId: string) => Promise<{ success: boolean; error?: string }>;
  fetchResearchQueue: (userId: string) => Promise<void>;
  cancelQueuedResearch: (queueId: string) => Promise<{ success: boolean; error?: string }>;
  renamePlanet: (name: string) => Promise<{ success: boolean; error?: string; cost?: number }>;
  demolishBuilding: (buildingTypeId: number) => Promise<{ success: boolean; error?: string }>;
  abandonColony: (planetId: string) => Promise<{ success: boolean; error?: string }>;
  setPlanetAutopilotRole: (role: 'balanced' | 'miner' | 'military' | 'research' | 'colonizer' | 'custom') => Promise<{ success: boolean; error?: string }>;
  setPlanetAutopilotEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  instantCompleteBuilding: (queueId: string, onSuccess: () => void) => Promise<{ success: boolean; error?: string; fxuSpent?: number }>;
  instantCompleteResearch: (technologyId: string, onSuccess: () => void) => Promise<{ success: boolean; error?: string; fxuSpent?: number }>;
  instantCompleteShipyardItem: (queueId: string, onSuccess: () => void) => Promise<{ success: boolean; error?: string; fxuSpent?: number }>;
  calculateFxuCostBuilding: (queueId: string) => Promise<number>;
  calculateFxuCostResearch: (technologyId: string) => Promise<number>;
  calculateFxuCostShipyard: (queueId: string) => Promise<number>;
  fullReconnectSync: (planetId: string) => Promise<boolean>;

  // Fortalezas de Alianza
  fortresses: AllianceFortress[];
  selectedFortress: any | null;
  fetchAllFortresses: () => Promise<void>;
  fetchFortressInfo: (galaxy: number) => Promise<void>;
  deployToFortress: (galaxy: number, planetId: string, ships: { ship_type_id: number; quantity: number }[]) => Promise<any>;
  recallFromFortress: (galaxy: number, ships: { ship_type_id: number; quantity: number }[]) => Promise<any>;

  // Planeta del Tesoro (aislado del sistema de Fortalezas, mismo patron)
  treasurePlanets: TreasurePlanet[];
  selectedTreasurePlanet: any | null;
  fetchAllTreasurePlanets: () => Promise<void>;
  fetchTreasurePlanetInfo: (galaxy: number) => Promise<void>;
  recallFromTreasurePlanet: (galaxy: number, ships: { ship_type_id: number; quantity: number }[]) => Promise<any>;

  // Abandono voluntario de Fortaleza / Planeta del Tesoro (exclusion mutua)
  abandonStronghold: (kind: 'fortress' | 'treasure', galaxy: number) => Promise<any>;
}

const rpcCooldowns: Record<string, number> = {};
const RPC_COOLDOWN_MS = 60000;

const isRpcOnCooldown = (rpcName: string): boolean => {
  const until = rpcCooldowns[rpcName];
  if (!until) return false;
  if (Date.now() >= until) {
    delete rpcCooldowns[rpcName];
    return false;
  }
  return true;
};

const setRpcCooldown = (rpcName: string) => {
  rpcCooldowns[rpcName] = Date.now() + RPC_COOLDOWN_MS;
};

const isStatementTimeout = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  return err.code === '57014' || err.code === '55P03' || (err.message?.includes('statement timeout') ?? false) || (err.message?.includes('lock timeout') ?? false);
};

export const useGameStore = create<GameState>((set, get) => ({
  planets: [],
  currentPlanet: null,
  resources: null,
  buildings: [],
  buildingTypes: [],
  buildingRequirements: [],
  buildingQueue: [],
  technologies: [],
  technologyTypes: [],
  technologyRequirements: [],
  ships: [],
  shipTypes: [],
  shipRequirements: [],
  defenses: [],
  defenseTypes: [],
  defenseRequirements: [],
  fleets: [],
  shipyardQueue: [],
  activeOfficers: [],
  researchQueue: [],
  isLoading: false,
  isSaving: false,
  isProcessingShipyard: false,
  lastResourceUpdate: new Date(),
  lastServerSync: new Date(),
  isLoadingBuildingRequirements: true,
  isLoadingTechRequirements: true,
  isLoadingShipRequirements: true,
  isLoadingDefenseRequirements: true,

  fetchPlanets: async (userId: string) => {
    if (!isOnline()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('planets')
        .select('id, user_id, name, galaxy, solar_system, position, planet_type, autopilot_role, autopilot_enabled, diameter, fields_max, fields_used, temp_min, temp_max, is_main_planet, image_id, created_at, jump_gate_cooldown')
        .eq('user_id', userId)
        .order('is_main_planet', { ascending: false });

      if (error) {
        if (await handleSupabaseError(error)) return;
        throw error;
      }
      set({ planets: data || [] });

      // Keep currentPlanet in sync with refreshed planet data
      const currentPlanetId = get().currentPlanet?.id;
      if (currentPlanetId && data) {
        const updatedCurrentPlanet = data.find(p => p.id === currentPlanetId);
        if (updatedCurrentPlanet) {
          set({ currentPlanet: updatedCurrentPlanet });
        } else if (data.length > 0) {
          // El planeta actual ya no es del jugador (p.ej. colonia vendida): seleccionar otro
          set({ currentPlanet: null });
        }
      }

      if (data && data.length > 0 && !get().currentPlanet) {
        await get().selectPlanet(data[0].id);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching planets:', error);
      }
    }
  },

  selectPlanet: async (planetId: string) => {
    const planet = get().planets.find((p) => p.id === planetId);
    if (planet) {
      await get().saveResourcesToDatabase();
      set({ currentPlanet: planet, isLoading: true });
      // fullReconnectSync ya carga edificios/colas/naves/defensas; solo repetir si no lo hizo
      const synced = await get().fullReconnectSync(planetId);
      if (!synced) {
        await Promise.all([
          get().fetchBuildings(planetId),
          get().fetchBuildingQueue(planetId),
          get().fetchShips(planetId),
          get().fetchDefenses(planetId),
          get().fetchShipyardQueue(planetId),
        ]);
      }
      set({ isLoading: false });
      get().updateResources();
    }
  },

  fetchResources: async (planetId: string) => {
    if (!isOnline()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.rpc('calculate_and_sync_resources', {
        p_planet_id: planetId,
      });

      if (error) {
        if (await handleSupabaseError(error)) return;
        throw error;
      }

      if (data && !data.error) {
        const now = new Date();
        const parsedResources = {
          planet_id: planetId,
          metal: Number(data.metal) || 0,
          crystal: Number(data.crystal) || 0,
          deuterium: Number(data.deuterium) || 0,
          metal_per_hour: Number(data.metal_per_hour) || 0,
          crystal_per_hour: Number(data.crystal_per_hour) || 0,
          deuterium_per_hour: Number(data.deuterium_per_hour) || 0,
          metal_storage: Number(data.metal_storage) || 10000,
          crystal_storage: Number(data.crystal_storage) || 10000,
          deuterium_storage: Number(data.deuterium_storage) || 10000,
          energy_used: Number(data.energy_used) || 0,
          energy_max: Number(data.energy_max) || 0,
          last_update: data.last_update,
          metal_mine_percent: Number.isFinite(Number(data.metal_mine_percent)) ? Number(data.metal_mine_percent) : 100,
          crystal_mine_percent: Number.isFinite(Number(data.crystal_mine_percent)) ? Number(data.crystal_mine_percent) : 100,
          deuterium_synth_percent: Number.isFinite(Number(data.deuterium_synth_percent)) ? Number(data.deuterium_synth_percent) : 100,
          solar_plant_percent: Number.isFinite(Number(data.solar_plant_percent)) ? Number(data.solar_plant_percent) : 100,
          fusion_reactor_percent: Number.isFinite(Number(data.fusion_reactor_percent)) ? Number(data.fusion_reactor_percent) : 100,
          solar_satellite_percent: Number.isFinite(Number(data.solar_satellite_percent)) ? Number(data.solar_satellite_percent) : 100,
        };
        set({
          resources: parsedResources,
          lastResourceUpdate: now,
          lastServerSync: now,
        });
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching resources:', error);
      }
    }
  },

  fetchBuildings: async (planetId: string) => {
    if (!isOnline()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('planet_buildings')
        .select('*, building_type:building_types(*)')
        .eq('planet_id', planetId);

      if (error) {
        if (await handleSupabaseError(error)) return;
        throw error;
      }
      set({ buildings: data || [] });
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching buildings:', error);
      }
    }
  },

  fetchBuildingTypes: async () => {
    try {
      const cached = getFromCache<typeof get().buildingTypes>(CACHE_KEYS.BUILDING_TYPES);
      if (cached && cached.length > 0) {
        set({ buildingTypes: cached });
        const imageUrls = cached.map((bt) => bt.image_url).filter((url): url is string => !!url);
        if (imageUrls.length > 0) precacheImages(imageUrls);
        return;
      }

      if (!isOnline()) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('building_types')
        .select('id, code, name, description, category, base_metal, base_crystal, base_deuterium, base_energy, cost_factor, max_level, image_url')
        .order('id');

      if (error) {
        if (await handleSupabaseError(error)) return;
        throw error;
      }

      set({ buildingTypes: data || [] });
      if (data && data.length > 0) {
        setToCache(CACHE_KEYS.BUILDING_TYPES, data);
      }

      const imageUrls = (data || [])
        .map((bt) => bt.image_url)
        .filter((url): url is string => !!url);
      if (imageUrls.length > 0) {
        precacheImages(imageUrls);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching building types:', error);
      }
    }
  },

  fetchBuildingRequirements: async () => {
    const cached = getFromCache<typeof get().buildingRequirements>(CACHE_KEYS.BUILDING_REQUIREMENTS);
    if (cached && cached.length > 0) {
      set({ buildingRequirements: cached, isLoadingBuildingRequirements: false });
      return;
    }

    if (!isOnline()) return;

    set({ isLoadingBuildingRequirements: true });
    try {
      const { data, error } = await supabase
        .from('building_requirements')
        .select(`
          id,
          building_type_id,
          required_building_id,
          required_building_level,
          required_tech_id,
          required_tech_level,
          required_building:required_building_id(id, code, name),
          required_tech:required_tech_id(id, code, name)
        `);

      if (error) throw error;
      set({ buildingRequirements: data || [], isLoadingBuildingRequirements: false });
      if (data && data.length > 0) {
        setToCache(CACHE_KEYS.BUILDING_REQUIREMENTS, data);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching building requirements:', error);
      }
      set({ isLoadingBuildingRequirements: false });
    }
  },

  fetchBuildingQueue: async (planetId: string) => {
    if (!isOnline()) return;

    try {
      if (!isRpcOnCooldown('process_completed_building_queue')) {
        const { error: rpcError } = await supabase.rpc('process_completed_building_queue', { p_planet_id: planetId });
        if (rpcError && isStatementTimeout(rpcError)) {
          setRpcCooldown('process_completed_building_queue');
        }
      }

      const { data, error } = await supabase
        .from('building_queue')
        .select('*, building_type:building_types(*)')
        .eq('planet_id', planetId)
        .order('queue_position');

      if (error) throw error;
      set({ buildingQueue: data || [] });
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching building queue:', error);
      }
    }
  },

  fetchTechnologies: async (userId: string) => {
    if (!isOnline()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('user_technologies')
        .select('*, technology_type:technology_types(*)')
        .eq('user_id', userId);

      if (error) {
        if (await handleSupabaseError(error)) return;
        throw error;
      }
      set({ technologies: data || [] });
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching technologies:', error);
      }
    }
  },

  fetchTechnologyTypes: async () => {
    try {
      const cached = getFromCache<typeof get().technologyTypes>(CACHE_KEYS.TECHNOLOGY_TYPES);
      const cacheValid = cached && cached.length > 0 && cached.some(t => 'energy_required' in t);
      if (cacheValid) {
        set({ technologyTypes: cached });
        return;
      }

      if (!isOnline()) return;

      const { data, error } = await supabase
        .from('technology_types')
        .select('id, code, name, description, category, base_metal, base_crystal, base_deuterium, cost_factor, base_time_seconds, max_level, image_url, energy_required')
        .order('id');

      if (error) throw error;
      set({ technologyTypes: data || [] });
      if (data && data.length > 0) {
        setToCache(CACHE_KEYS.TECHNOLOGY_TYPES, data);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching technology types:', error);
      }
    }
  },

  fetchTechnologyRequirements: async () => {
    const cached = getFromCache<typeof get().technologyRequirements>(CACHE_KEYS.TECHNOLOGY_REQUIREMENTS);
    if (cached && cached.length > 0) {
      set({ technologyRequirements: cached, isLoadingTechRequirements: false });
      return;
    }

    if (!isOnline()) return;

    set({ isLoadingTechRequirements: true });
    try {
      const { data, error } = await supabase
        .from('technology_requirements')
        .select(`
          id,
          technology_type_id,
          required_building_id,
          required_building_level,
          required_tech_id,
          required_tech_level,
          required_building:required_building_id(id, code, name),
          required_tech:required_tech_id(id, code, name)
        `);

      if (error) throw error;
      set({ technologyRequirements: data || [], isLoadingTechRequirements: false });
      if (data && data.length > 0) {
        setToCache(CACHE_KEYS.TECHNOLOGY_REQUIREMENTS, data);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching technology requirements:', error);
      }
      set({ isLoadingTechRequirements: false });
    }
  },

  fetchShips: async (planetId: string) => {
    if (!isOnline()) return;

    try {
      const { data, error } = await supabase
        .from('planet_ships')
        .select('*, ship_type:ship_types(*)')
        .eq('planet_id', planetId);

      if (error) throw error;
      set({ ships: data || [] });
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching ships:', error);
      }
    }
  },

  fetchShipTypes: async () => {
    try {
      const cached = getFromCache<typeof get().shipTypes>(CACHE_KEYS.SHIP_TYPES);
      if (cached && cached.length > 0) {
        set({ shipTypes: cached });
        const imageUrls = cached.map((st) => st.image_url).filter((url): url is string => !!url);
        if (imageUrls.length > 0) precacheImages(imageUrls);
        return;
      }

      if (!isOnline()) return;

      const { data, error } = await supabase
        .from('ship_types')
        .select('id, code, name, description, category, metal_cost, crystal_cost, deuterium_cost, build_time_seconds, base_speed, cargo_capacity, fuel_consumption, weapon_power, shield_power, structural_integrity, rapid_fire, image_url')
        .order('id');

      if (error) throw error;
      set({ shipTypes: data || [] });
      if (data && data.length > 0) {
        setToCache(CACHE_KEYS.SHIP_TYPES, data);
      }

      const imageUrls = (data || [])
        .map((st) => st.image_url)
        .filter((url): url is string => !!url);
      if (imageUrls.length > 0) {
        precacheImages(imageUrls);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching ship types:', error);
      }
    }
  },

  fetchShipRequirements: async () => {
    const cached = getFromCache<typeof get().shipRequirements>(CACHE_KEYS.SHIP_REQUIREMENTS);
    if (cached && cached.length > 0) {
      set({ shipRequirements: cached, isLoadingShipRequirements: false });
      return;
    }

    if (!isOnline()) return;

    set({ isLoadingShipRequirements: true });
    try {
      const { data, error } = await supabase
        .from('ship_requirements')
        .select(`
          id,
          ship_type_id,
          required_building_id,
          required_building_level,
          required_tech_id,
          required_tech_level,
          required_building:required_building_id(id, code, name),
          required_tech:required_tech_id(id, code, name)
        `);

      if (error) throw error;
      set({ shipRequirements: data || [], isLoadingShipRequirements: false });
      if (data && data.length > 0) {
        setToCache(CACHE_KEYS.SHIP_REQUIREMENTS, data);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching ship requirements:', error);
      }
      set({ isLoadingShipRequirements: false });
    }
  },

  fetchDefenses: async (planetId: string) => {
    if (!isOnline()) return;

    try {
      const { data, error } = await supabase
        .from('planet_defenses')
        .select('*, defense_type:defense_types(*)')
        .eq('planet_id', planetId);

      if (error) throw error;
      set({ defenses: data || [] });
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching defenses:', error);
      }
    }
  },

  fetchDefenseTypes: async () => {
    try {
      const cached = getFromCache<typeof get().defenseTypes>(CACHE_KEYS.DEFENSE_TYPES);
      if (cached && cached.length > 0) {
        set({ defenseTypes: cached });
        const imageUrls = cached.map((dt) => dt.image_url).filter((url): url is string => !!url);
        if (imageUrls.length > 0) precacheImages(imageUrls);
        return;
      }

      if (!isOnline()) return;

      const { data, error } = await supabase
        .from('defense_types')
        .select('id, code, name, description, metal_cost, crystal_cost, deuterium_cost, build_time_seconds, weapon_power, shield_power, structural_integrity, image_url, max_per_planet')
        .order('id');

      if (error) throw error;
      set({ defenseTypes: data || [] });
      if (data && data.length > 0) {
        setToCache(CACHE_KEYS.DEFENSE_TYPES, data);
      }

      const imageUrls = (data || [])
        .map((dt) => dt.image_url)
        .filter((url): url is string => !!url);
      if (imageUrls.length > 0) {
        precacheImages(imageUrls);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching defense types:', error);
      }
    }
  },

  fetchDefenseRequirements: async () => {
    const cached = getFromCache<typeof get().defenseRequirements>(CACHE_KEYS.DEFENSE_REQUIREMENTS);
    if (cached && cached.length > 0) {
      set({ defenseRequirements: cached, isLoadingDefenseRequirements: false });
      return;
    }

    if (!isOnline()) return;

    set({ isLoadingDefenseRequirements: true });
    try {
      const { data, error } = await supabase
        .from('defense_requirements')
        .select(`
          id,
          defense_type_id,
          required_building_id,
          required_building_level,
          required_tech_id,
          required_tech_level,
          required_building:required_building_id(id, code, name),
          required_tech:required_tech_id(id, code, name)
        `);

      if (error) throw error;
      set({ defenseRequirements: data || [], isLoadingDefenseRequirements: false });
      if (data && data.length > 0) {
        setToCache(CACHE_KEYS.DEFENSE_REQUIREMENTS, data);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching defense requirements:', error);
      }
      set({ isLoadingDefenseRequirements: false });
    }
  },

  fetchFleets: async (userId: string) => {
    if (!isOnline()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('fleets')
        .select('*, fleet_ships(*, ship_type:ship_types(id, name, code))')
        .eq('user_id', userId)
        .eq('is_completed', false)
        .order('arrival_time');

      if (error) {
        if (await handleSupabaseError(error)) return;
        throw error;
      }
      set({ fleets: data || [] });
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching fleets:', error);
      }
    }
  },

  fetchShipyardQueue: async (planetId: string) => {
    if (!isOnline()) return;

    try {
      if (!isRpcOnCooldown('process_completed_shipyard_queue')) {
        const { error: rpcError } = await supabase.rpc('process_completed_shipyard_queue', { p_planet_id: planetId });
        if (rpcError && isStatementTimeout(rpcError)) {
          setRpcCooldown('process_completed_shipyard_queue');
        }
      }

      const { data, error } = await supabase
        .from('shipyard_queue')
        .select('*, ship_type:ship_types(*), defense_type:defense_types(*)')
        .eq('planet_id', planetId)
        .order('item_type', { ascending: true })
        .order('queue_position');

      if (error) throw error;
      set({ shipyardQueue: data || [] });
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching shipyard queue:', error);
      }
    }
  },

  refreshOfficers: async (userId: string) => {
    if (!isOnline()) return;

    try {
      const officers = await fetchActiveOfficers(userId);
      set({ activeOfficers: officers });
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error refreshing officers:', error);
      }
    }
  },

  updateResources: () => {
    const { resources, currentPlanet, lastResourceUpdate, isLoading } = get();
    if (!resources || !currentPlanet || isLoading) return;

    const now = new Date();
    const elapsedHours = (now.getTime() - lastResourceUpdate.getTime()) / 3600000;

    if (elapsedHours <= 0) return;

    const metalProduction = resources.metal_per_hour || 0;
    const crystalProduction = resources.crystal_per_hour || 0;
    const deuteriumProduction = resources.deuterium_per_hour || 0;

    const metalStorage = resources.metal_storage || 10000;
    const crystalStorage = resources.crystal_storage || 10000;
    const deuteriumStorage = resources.deuterium_storage || 10000;

    const newMetal = resources.metal > metalStorage
      ? resources.metal
      : Math.min(metalStorage, Math.max(0, resources.metal + metalProduction * elapsedHours));
    const newCrystal = resources.crystal > crystalStorage
      ? resources.crystal
      : Math.min(crystalStorage, Math.max(0, resources.crystal + crystalProduction * elapsedHours));
    const newDeuterium = resources.deuterium > deuteriumStorage
      ? resources.deuterium
      : Math.min(deuteriumStorage, Math.max(0, resources.deuterium + deuteriumProduction * elapsedHours));

    set({
      resources: {
        ...resources,
        metal: newMetal,
        crystal: newCrystal,
        deuterium: newDeuterium,
      },
      lastResourceUpdate: now,
    });
  },

  saveResourcesToDatabase: async (forceSync = false) => {
    const { resources, currentPlanet, isSaving, lastServerSync } = get();
    if (!resources || !currentPlanet || isSaving) return;
    if (!isOnline()) return;

    if (resources.planet_id && resources.planet_id !== currentPlanet.id) {
      return;
    }

    const timeSinceSync = Date.now() - lastServerSync.getTime();
    if (!forceSync && timeSinceSync < 10000) {
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    set({ isSaving: true });

    try {
      const { data, error } = await supabase.rpc('sync_planet_resources', {
        p_planet_id: currentPlanet.id,
      });

      if (error) throw error;

      if (data && !data.error) {
        const now = new Date();
        set({
          resources: {
            ...resources,
            metal: Number(data.metal) || 0,
            crystal: Number(data.crystal) || 0,
            deuterium: Number(data.deuterium) || 0,
            metal_per_hour: Number(data.metal_per_hour) || 0,
            crystal_per_hour: Number(data.crystal_per_hour) || 0,
            deuterium_per_hour: Number(data.deuterium_per_hour) || 0,
            metal_storage: Number(data.metal_storage) || 10000,
            crystal_storage: Number(data.crystal_storage) || 10000,
            deuterium_storage: Number(data.deuterium_storage) || 10000,
            energy_used: Number(data.energy_used) || 0,
            energy_max: Number(data.energy_max) || 0,
            metal_mine_percent: Number.isFinite(Number(data.metal_mine_percent)) ? Number(data.metal_mine_percent) : 100,
            crystal_mine_percent: Number.isFinite(Number(data.crystal_mine_percent)) ? Number(data.crystal_mine_percent) : 100,
            deuterium_synth_percent: Number.isFinite(Number(data.deuterium_synth_percent)) ? Number(data.deuterium_synth_percent) : 100,
            solar_plant_percent: Number.isFinite(Number(data.solar_plant_percent)) ? Number(data.solar_plant_percent) : 100,
            fusion_reactor_percent: Number.isFinite(Number(data.fusion_reactor_percent)) ? Number(data.fusion_reactor_percent) : 100,
            solar_satellite_percent: Number.isFinite(Number(data.solar_satellite_percent)) ? Number(data.solar_satellite_percent) : 100,
          },
          lastServerSync: now,
          lastResourceUpdate: now,
        });
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error saving resources to database:', error);
      }
    } finally {
      set({ isSaving: false });
    }
  },

  checkBuildingCompletion: async () => {
    const { buildingQueue, currentPlanet } = get();
    if (!currentPlanet || !isOnline()) return;
    if (buildingQueue.length === 0) return;

    const now = Date.now();
    const toleranceMs = 2000;

    const firstQueueItem = buildingQueue.find((q) => q.queue_position === 1);
    const needsActivation = firstQueueItem && !firstQueueItem.end_time;
    const hasCompletedItems = buildingQueue.some(
      (q) => q.end_time && (new Date(q.end_time).getTime() - now) <= toleranceMs
    );

    if (!needsActivation && !hasCompletedItems) return;

    try {
      await Promise.all([
        get().fetchBuildings(currentPlanet.id),
        get().fetchBuildingQueue(currentPlanet.id),
      ]);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await get().fetchPlanets(user.id);
        const updatedPlanet = get().planets.find((p) => p.id === currentPlanet.id);
        if (updatedPlanet) {
          set({ currentPlanet: updatedPlanet });
        }
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error processing building completions:', error);
      }
    }
  },

  addToBuildingQueue: async (buildingTypeId: number) => {
    const { currentPlanet, resources, buildings, buildingTypes, buildingRequirements, buildingQueue, activeOfficers, technologies, isLoadingBuildingRequirements } = get();
    if (!currentPlanet || !resources) return false;
    if (isLoadingBuildingRequirements) return false;

    const officerBonuses = getOfficerBonuses(activeOfficers);
    const maxQueueSlots = calculateBuildingQueueSlots(officerBonuses);

    if (buildingQueue.length >= maxQueueSlots) return false;

    const buildingType = buildingTypes.find((bt) => bt.id === buildingTypeId);
    if (!buildingType) return false;

    if (buildingType.code === 'research_lab' && technologies.some((t) => t.is_researching)) {
      return false;
    }

    const existingBuilding = buildings.find((b) => b.building_type_id === buildingTypeId);
    const queuedForSameType = buildingQueue.filter((q) => q.building_type_id === buildingTypeId).length;
    const currentLevel = (existingBuilding?.level || 0) + queuedForSameType;
    const targetLevel = currentLevel + 1;

    if (targetLevel > buildingType.max_level) return false;

    const requirements = buildingRequirements.filter((r) => r.building_type_id === buildingTypeId);
    for (const req of requirements) {
      if (req.required_building_id) {
        const building = buildings.find((b) => b.building_type_id === req.required_building_id);
        const queuedLevel = buildingQueue.filter((q) => q.building_type_id === req.required_building_id).length;
        const effectiveLevel = (building?.level || 0) + queuedLevel;
        if (effectiveLevel < req.required_building_level) {
          return false;
        }
      }
      if (req.required_tech_id) {
        const tech = technologies.find((t) => t.technology_type_id === req.required_tech_id);
        if (!tech || tech.level < req.required_tech_level) {
          return false;
        }
      }
    }

    const totalFieldsUsed = currentPlanet.fields_used + buildingQueue.length;
    if (totalFieldsUsed >= currentPlanet.fields_max) return false;

    const cost = calculateBuildingCost(
      buildingType.base_metal,
      buildingType.base_crystal,
      buildingType.base_deuterium,
      buildingType.cost_factor,
      currentLevel
    );

    if (
      resources.metal < cost.metal ||
      resources.crystal < cost.crystal ||
      resources.deuterium < cost.deuterium
    ) {
      return false;
    }

    await get().saveResourcesToDatabase(true);

    try {
      const { data, error } = await supabase.rpc('secure_add_to_building_queue', {
        p_planet_id: currentPlanet.id,
        p_building_type_id: buildingTypeId,
      });

      if (error) throw error;
      if (!data?.success) {
        await get().fetchResources(currentPlanet.id);
        return false;
      }

      await Promise.all([
        get().fetchBuildingQueue(currentPlanet.id),
        get().fetchResources(currentPlanet.id),
      ]);
      return true;
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error adding to building queue:', error);
      }
      await get().fetchResources(currentPlanet.id);
      return false;
    }
  },

  cancelBuildingQueueItem: async (queueItemId: string) => {
    const { currentPlanet } = get();
    if (!currentPlanet) return false;

    try {
      const { data, error } = await supabase.rpc('secure_cancel_building_queue_item', {
        p_queue_id: queueItemId,
      });

      if (error) throw error;

      if (data && !data.success) {
        console.error('Cancel failed:', data.error);
        return false;
      }

      await Promise.all([
        get().fetchBuildingQueue(currentPlanet.id),
        get().fetchResources(currentPlanet.id),
      ]);
      return true;
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error canceling queue item:', error);
      }
      return false;
    }
  },

  startResearch: async (technologyTypeId: number) => {
    const { currentPlanet, resources, technologies, technologyTypes, technologyRequirements, buildings, buildingQueue, buildingTypes, isLoadingTechRequirements, activeOfficers, researchQueue } = get();
    if (!currentPlanet || !resources) return false;
    if (isLoadingTechRequirements) return false;

    const techType = technologyTypes.find((t) => t.id === technologyTypeId);
    if (!techType) return false;

    const existingTech = technologies.find((t) => t.technology_type_id === technologyTypeId);
    // [RQSAME1] nivel base = ultimo nivel comprometido (en curso o en cola) de esta tecnologia
    const currentLevel = Math.max(
      (existingTech?.level || 0) + (existingTech?.is_researching ? 1 : 0),
      ...researchQueue
        .filter((q) => q.technology_type_id === technologyTypeId)
        .map((q) => q.target_level)
    );

    let hasCommander = hasActiveOfficer(activeOfficers, 'commander');
    const anyResearching = technologies.some((t) => t.is_researching);

    // [RQFIX1] Oficiales posiblemente desactualizados: reconsultar antes de bloquear
    if (anyResearching && !hasCommander && currentPlanet.user_id) {
      await get().refreshOfficers(currentPlanet.user_id);
      hasCommander = hasActiveOfficer(get().activeOfficers, 'commander');
    }
    if (anyResearching && !hasCommander) return false;
    if (anyResearching && hasCommander && researchQueue.length >= 2) return false;

    const labTypeId = buildingTypes.find((bt) => bt.code === 'research_lab')?.id;
    if (labTypeId && buildingQueue.some((q) => q.building_type_id === labTypeId)) return false;

    const requirements = technologyRequirements.filter((r) => r.technology_type_id === technologyTypeId);
    for (const req of requirements) {
      if (req.required_building_id) {
        const building = buildings.find((b) => b.building_type_id === req.required_building_id);
        if (!building || building.level < req.required_building_level) {
          return false;
        }
      }
      if (req.required_tech_id) {
        const tech = technologies.find((t) => t.technology_type_id === req.required_tech_id);
        if (!tech || tech.level < req.required_tech_level) {
          return false;
        }
      }
    }

    const cost = calculateResearchCost(
      techType.base_metal,
      techType.base_crystal,
      techType.base_deuterium,
      techType.cost_factor,
      currentLevel
    );

    if (
      resources.metal < cost.metal ||
      resources.crystal < cost.crystal ||
      resources.deuterium < cost.deuterium
    ) {
      return false;
    }

    await get().saveResourcesToDatabase(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('secure_start_research', {
        p_planet_id: currentPlanet.id,
        p_tech_type_id: technologyTypeId,
      });

      if (error) throw error;
      if (!data?.success) {
        await get().fetchResources(currentPlanet.id);
        return false;
      }

      await get().fetchTechnologies(user.id);
      await get().fetchResearchQueue(user.id);
      await get().fetchResources(currentPlanet.id);
      return true;
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error starting research:', error);
      }
      await get().fetchResources(currentPlanet.id);
      return false;
    }
  },

  cancelResearch: async (technologyId: string) => {
    const { currentPlanet } = get();
    if (!currentPlanet || !isOnline()) return { success: false, error: 'Not available' };

    try {
      const { data, error } = await supabase.rpc('secure_cancel_research', {
        p_technology_id: technologyId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (result.success) {
        const { data: { user } } = await supabase.auth.getUser();
        await Promise.all([
          user ? get().fetchTechnologies(user.id) : Promise.resolve(),
          user ? get().fetchResearchQueue(user.id) : Promise.resolve(),
          get().fetchResources(currentPlanet.id),
        ]);
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error cancelling research:', error);
      }
      return { success: false, error: 'Error processing request' };
    }
  },

  fetchResearchQueue: async (userId: string) => {
    if (!isOnline()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('research_queue')
        .select('*, technology_type:technology_types(*)')
        .eq('user_id', userId)
        .eq('status', 'queued')
        .order('queue_position');

      if (error) {
        if (await handleSupabaseError(error)) return;
        throw error;
      }
      set({ researchQueue: data || [] });
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error fetching research queue:', error);
      }
    }
  },

  cancelQueuedResearch: async (queueId: string) => {
    const { currentPlanet } = get();
    if (!isOnline()) return { success: false, error: 'Not available' };

    try {
      const { data, error } = await supabase.rpc('secure_cancel_queued_research', {
        p_queue_id: queueId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (result.success) {
        const { data: { user } } = await supabase.auth.getUser();
        await Promise.all([
          user ? get().fetchResearchQueue(user.id) : Promise.resolve(),
          currentPlanet ? get().fetchResources(currentPlanet.id) : Promise.resolve(),
        ]);
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error cancelling queued research:', error);
      }
      return { success: false, error: 'Error processing request' };
    }
  },

  checkShipyardCompletion: async () => {
    const { currentPlanet, shipyardQueue, isProcessingShipyard } = get();
    if (!currentPlanet || isProcessingShipyard || !isOnline()) return;
    if (shipyardQueue.length === 0) return;

    const now = Date.now();
    const toleranceMs = 2000;
    const hasCompletedItems = shipyardQueue.some(
      (q) => q.current_unit_end_time && (new Date(q.current_unit_end_time).getTime() - now) <= toleranceMs
    );
    const hasStuckItems = shipyardQueue.some(
      (q) => q.queue_position === 1 && !q.current_unit_end_time
    );

    if (!hasCompletedItems && !hasStuckItems) return;

    set({ isProcessingShipyard: true });

    try {
      await Promise.all([
        get().fetchShipyardQueue(currentPlanet.id),
        get().fetchShips(currentPlanet.id),
        get().fetchDefenses(currentPlanet.id),
      ]);
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error checking shipyard completion:', error);
      }
    } finally {
      set({ isProcessingShipyard: false });
    }
  },

  checkResearchCompletion: async (userId: string) => {
    if (!isOnline()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.rpc('complete_research', { p_user_id: userId });
      await Promise.all([
        get().fetchTechnologies(userId),
        get().fetchResearchQueue(userId),
      ]);
    } catch (error) {
      if (!isNetworkError(error) && !(await handleSupabaseError(error))) {
        console.error('Error checking research completion:', error);
      }
    }
  },

  // ===========================================================================
  // checkFleetArrivals - Procesar flotas pendientes del usuario
  // ===========================================================================
  // BUG CORREGIDO (26/01/2026): Duplicación de naves al acelerar flota
  // 
  // DESCRIPCIÓN DEL BUG:
  // Esta función era parte del bug de duplicación de naves. Se llamaba desde
  // FleetPage cada 5 segundos y también desde App.tsx. Después de acelerar
  // una flota, múltiples llamadas concurrentes a process_user_pending_fleets
  // encontraban la misma flota con tiempo expirado y la procesaban, causando
  // que las naves se agregaran múltiples veces al planeta.
  //
  // CORRECCIÓN APLICADA:
  // El backend process_user_pending_fleets() ahora usa FOR UPDATE SKIP LOCKED
  // para evitar que múltiples transacciones procesen la misma flota.
  // Además, accelerate_fleet() ahora procesa la flota directamente, así que
  // cuando esta función se ejecuta, la flota acelerada ya está completada.
  //
  // Ver migración: 20260126000001_293_fix_fleet_acceleration_double_processing_bug.sql
  // ===========================================================================
  checkFleetArrivals: async (userId: string, onProfileUpdate?: () => void) => {
    if (!isOnline()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // BUG FIX: process_user_pending_fleets ahora usa FOR UPDATE SKIP LOCKED
      // para evitar procesamiento concurrente de la misma flota.
      const { data: result } = await supabase.rpc('process_user_pending_fleets', { p_user_id: userId });

      if (result && result.processed_count > 0) {
        const { currentPlanet } = get();
        await Promise.all([
          get().fetchFleets(userId),
          get().fetchPlanets(userId),
          currentPlanet ? get().fetchShips(currentPlanet.id) : Promise.resolve(),
          currentPlanet ? get().fetchResources(currentPlanet.id) : Promise.resolve(),
        ]);
        if (onProfileUpdate) {
          onProfileUpdate();
        }
      } else {
        await get().fetchFleets(userId);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error checking fleet arrivals:', error);
      }
    }
  },

  addToShipyardQueue: async (itemType: 'ship' | 'defense', typeId: number, quantity: number) => {
    const { currentPlanet, resources, buildings, shipTypes, defenseTypes, shipRequirements, defenseRequirements, technologies, isLoadingShipRequirements, isLoadingDefenseRequirements } = get();
    if (!currentPlanet || !resources || quantity <= 0) return false;
    if (itemType === 'ship' && isLoadingShipRequirements) return false;
    if (itemType === 'defense' && isLoadingDefenseRequirements) return false;

    const shipyardLevel = buildings.find((b) => b.building_type?.code === 'shipyard')?.level || 0;

    let metalCost = 0;
    let crystalCost = 0;
    let deuteriumCost = 0;

    if (itemType === 'ship') {
      const shipType = shipTypes.find((st) => st.id === typeId);
      if (!shipType) return false;

      // Verificar si el usuario tiene planos suficientes para esta nave (bypass de requisitos)
      let hasEnoughBlueprints = false;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: bpRow } = await supabase
            .from('ship_blueprints')
            .select('id')
            .eq('ship_type_id', typeId)
            .eq('is_active', true)
            .maybeSingle();
          if (bpRow?.id) {
            const { count } = await supabase
              .from('user_ship_blueprints')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('blueprint_id', bpRow.id);
            hasEnoughBlueprints = (count ?? 0) >= 1;
          }
        }
      } catch {
        // si falla la consulta, caemos al flujo normal de requisitos
      }

      if (!hasEnoughBlueprints) {
        const requirements = shipRequirements.filter((r) => r.ship_type_id === typeId);
        for (const req of requirements) {
          if (req.required_building_id) {
            const building = buildings.find((b) => b.building_type_id === req.required_building_id);
            if (!building || building.level < req.required_building_level) {
              return false;
            }
          }
          if (req.required_tech_id) {
            const tech = technologies.find((t) => t.technology_type_id === req.required_tech_id);
            if (!tech || tech.level < req.required_tech_level) {
              return false;
            }
          }
        }
      } else {
        // Con planos suficientes solo se exige Hangar Nv 1
        if (shipyardLevel < 1) return false;
      }

      metalCost = shipType.metal_cost * quantity;
      crystalCost = shipType.crystal_cost * quantity;
      deuteriumCost = shipType.deuterium_cost * quantity;
    } else {
      const defenseType = defenseTypes.find((dt) => dt.id === typeId);
      if (!defenseType) return false;

      const requirements = defenseRequirements.filter((r) => r.defense_type_id === typeId);
      for (const req of requirements) {
        if (req.required_building_id) {
          const building = buildings.find((b) => b.building_type_id === req.required_building_id);
          if (!building || building.level < req.required_building_level) {
            return false;
          }
        }
        if (req.required_tech_id) {
          const tech = technologies.find((t) => t.technology_type_id === req.required_tech_id);
          if (!tech || tech.level < req.required_tech_level) {
            return false;
          }
        }
      }

      metalCost = defenseType.metal_cost * quantity;
      crystalCost = defenseType.crystal_cost * quantity;
      deuteriumCost = defenseType.deuterium_cost * quantity;
    }

    if (resources.metal < metalCost || resources.crystal < crystalCost || resources.deuterium < deuteriumCost) {
      return false;
    }

    await get().saveResourcesToDatabase(true);

    try {
      const { data, error } = await supabase.rpc('secure_add_to_shipyard_queue', {
        p_planet_id: currentPlanet.id,
        p_item_type: itemType,
        p_type_id: typeId,
        p_quantity: quantity,
      });

      if (error) throw error;
      if (!data?.success) {
        await get().fetchResources(currentPlanet.id);
        return false;
      }

      await get().fetchShipyardQueue(currentPlanet.id);
      await get().fetchResources(currentPlanet.id);
      return true;
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error adding to shipyard queue:', error);
      }
      await get().fetchResources(currentPlanet.id);
      return false;
    }
  },

  cancelShipyardQueueItem: async (queueItemId: string) => {
    const { currentPlanet } = get();
    if (!currentPlanet) return false;

    try {
      const { data, error } = await supabase.rpc('secure_cancel_shipyard_queue_item', {
        p_queue_id: queueItemId,
      });

      if (error) {
        console.error('Error canceling shipyard queue item:', error);
        return false;
      }

      if (!data?.success) {
        console.error('Cancel shipyard failed:', data?.error);
        return false;
      }

      await get().fetchShipyardQueue(currentPlanet.id);
      await get().fetchResources(currentPlanet.id);
      return true;
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error canceling shipyard queue item:', error);
      }
      return false;
    }
  },

  renamePlanet: async (name: string) => {
    const { currentPlanet } = get();
    if (!currentPlanet || !isOnline()) return { success: false, error: 'Not available' };

    try {
      const { data, error } = await supabase.rpc('secure_rename_planet', {
        p_planet_id: currentPlanet.id,
        p_new_name: name,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; cost?: number; new_name?: string };
      if (result.success) {
        const newName = result.new_name || name;
        set({
          currentPlanet: { ...currentPlanet, name: newName },
          planets: get().planets.map((p) =>
            p.id === currentPlanet.id ? { ...p, name: newName } : p
          ),
        });
        return { success: true, cost: result.cost || 0 };
      }
      return { success: false, error: result.error };
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error renaming planet:', error);
      }
      return { success: false, error: 'Error processing request' };
    }
  },

  demolishBuilding: async (buildingTypeId: number) => {
    const { currentPlanet } = get();
    if (!currentPlanet || !isOnline()) return { success: false, error: 'Not available' };

    try {
      const { data, error } = await supabase.rpc('secure_demolish_building', {
        p_planet_id: currentPlanet.id,
        p_building_type_id: buildingTypeId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (result.success) {
        const { data: { user } } = await supabase.auth.getUser();
        await Promise.all([
          get().fetchBuildings(currentPlanet.id),
          get().fetchResources(currentPlanet.id),
          user ? get().fetchPlanets(user.id) : Promise.resolve(),
        ]);
        const updatedPlanet = get().planets.find((p) => p.id === currentPlanet.id);
        if (updatedPlanet) {
          set({ currentPlanet: updatedPlanet });
        }
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error demolishing building:', error);
      }
      return { success: false, error: 'Error processing request' };
    }
  },

  abandonColony: async (planetId: string) => {
    if (!isOnline()) return { success: false, error: 'Not available' };

    try {
      const { data, error } = await supabase.rpc('secure_abandon_colony', {
        p_planet_id: planetId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (result.success) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await get().fetchPlanets(user.id);
          // Switch to homeworld (first planet, ordered by is_main_planet DESC)
          const homeworld = get().planets.find((p) => p.is_main_planet) || get().planets[0];
          if (homeworld) {
            await get().selectPlanet(homeworld.id);
          }
        }
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error abandoning colony:', error);
      }
      return { success: false, error: 'Error processing request' };
    }
  },

  setPlanetAutopilotRole: async (role: 'balanced' | 'miner' | 'military' | 'research' | 'colonizer' | 'custom') => {
    const { currentPlanet } = get();
    if (!currentPlanet || !isOnline()) return { success: false, error: 'Not available' };

    try {
      const { data, error } = await supabase.rpc('set_planet_autopilot_role', {
        p_planet_id: currentPlanet.id,
        p_role: role,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; role?: 'balanced' | 'miner' | 'military' | 'research' | 'colonizer' };
      if (result.success) {
        const nextRole = result.role || role;
        set({
          currentPlanet: { ...currentPlanet, autopilot_role: nextRole },
          planets: get().planets.map((planet) =>
            planet.id === currentPlanet.id ? { ...planet, autopilot_role: nextRole } : planet
          ),
        });
        return { success: true };
      }

      return { success: false, error: result.error };
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error updating autopilot role:', error);
      }
      return { success: false, error: 'Error processing request' };
    }
  },

  setPlanetAutopilotEnabled: async (enabled: boolean) => {
    const { currentPlanet } = get();
    if (!currentPlanet || !isOnline()) return { success: false, error: 'Not available' };

    try {
      const { data, error } = await supabase.rpc('set_planet_autopilot_enabled', {
        p_planet_id: currentPlanet.id,
        p_enabled: enabled,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; enabled?: boolean };
      if (result.success) {
        const nextEnabled = result.enabled ?? enabled;
        set({
          currentPlanet: { ...currentPlanet, autopilot_enabled: nextEnabled },
          planets: get().planets.map((planet) =>
            planet.id === currentPlanet.id ? { ...planet, autopilot_enabled: nextEnabled } : planet
          ),
        });
        return { success: true };
      }

      return { success: false, error: result.error };
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error updating autopilot enabled:', error);
      }
      return { success: false, error: 'Error processing request' };
    }
  },

  calculateFxuCostBuilding: async (queueId: string) => {
    try {
      const { data } = await supabase.rpc('calculate_fxu_cost_building', { p_queue_id: queueId });
      return Number(data) || 0;
    } catch {
      return 0;
    }
  },

  calculateFxuCostResearch: async (technologyId: string) => {
    try {
      const { data } = await supabase.rpc('calculate_fxu_cost_research', { p_technology_id: technologyId });
      return Number(data) || 0;
    } catch {
      return 0;
    }
  },

  calculateFxuCostShipyard: async (queueId: string) => {
    try {
      const { data } = await supabase.rpc('calculate_fxu_cost_shipyard', { p_queue_id: queueId });
      return Number(data) || 0;
    } catch {
      return 0;
    }
  },

  instantCompleteBuilding: async (queueId: string, onSuccess: () => void) => {
    if (!isOnline()) return { success: false, error: 'No network connection' };

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase.rpc('instant_complete_building', { p_queue_id: queueId });
        if (error) {
          if (attempt < maxRetries && isRetryableDbError(error)) {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          throw error;
        }

        const result = data as { success: boolean; error?: string; fxu_spent?: number };
        if (result.success) {
          const { currentPlanet } = get();
          if (currentPlanet) {
            await get().fetchBuildings(currentPlanet.id);
            await get().fetchBuildingQueue(currentPlanet.id);
          }
          onSuccess();
          return { success: true, fxuSpent: result.fxu_spent };
        }
        return { success: false, error: result.error };
      } catch (error) {
        if (attempt < maxRetries && isRetryableDbError(error)) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        if (!isNetworkError(error)) {
          console.error('Error instant completing building:', error);
        }
        return { success: false, error: 'Error processing request' };
      }
    }
    return { success: false, error: 'Error processing request' };
  },

  instantCompleteResearch: async (technologyId: string, onSuccess: () => void) => {
    if (!isOnline()) return { success: false, error: 'No network connection' };

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase.rpc('instant_complete_research', { p_research_id: technologyId });
        if (error) {
          if (attempt < maxRetries && isRetryableDbError(error)) {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          throw error;
        }

        const result = data as { success: boolean; error?: string; fxu_spent?: number };
        if (result.success) {
          const session = await supabase.auth.getSession();
          if (session.data.session?.user?.id) {
            // [RQFIX1] la cola tambien cambia (se promueve la siguiente)
            await Promise.all([
              get().fetchTechnologies(session.data.session.user.id),
              get().fetchResearchQueue(session.data.session.user.id),
            ]);
          }
          onSuccess();
          return { success: true, fxuSpent: result.fxu_spent };
        }
        return { success: false, error: result.error };
      } catch (error) {
        if (attempt < maxRetries && isRetryableDbError(error)) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        if (!isNetworkError(error)) {
          console.error('Error instant completing research:', error);
        }
        return { success: false, error: 'Error processing request' };
      }
    }
    return { success: false, error: 'Error processing request' };
  },

  instantCompleteShipyardItem: async (queueId: string, onSuccess: () => void) => {
    if (!isOnline()) return { success: false, error: 'No network connection' };

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase.rpc('instant_complete_shipyard_item', { p_queue_id: queueId });
        if (error) {
          if (attempt < maxRetries && isRetryableDbError(error)) {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          throw error;
        }

        const result = data as { success: boolean; error?: string; fxu_spent?: number; units_completed?: number };
        if (result.success) {
          const { currentPlanet } = get();
          if (currentPlanet) {
            await get().fetchShipyardQueue(currentPlanet.id);
            await get().fetchShips(currentPlanet.id);
            await get().fetchDefenses(currentPlanet.id);
          }
          onSuccess();
          return { success: true, fxuSpent: result.fxu_spent };
        }
        return { success: false, error: result.error };
      } catch (error) {
        if (attempt < maxRetries && isRetryableDbError(error)) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        if (!isNetworkError(error)) {
          console.error('Error instant completing shipyard item:', error);
        }
        return { success: false, error: 'Error processing request' };
      }
    }
    return { success: false, error: 'Error processing request' };
  },

  fullReconnectSync: async (planetId: string) => {
    if (!isOnline()) return false;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      if (isRpcOnCooldown('full_reconnect_sync')) {
        await Promise.all([
          get().fetchResources(planetId),
          get().fetchBuildingQueue(planetId),
          get().fetchShipyardQueue(planetId),
          get().fetchBuildings(planetId),
          get().fetchShips(planetId),
          get().fetchDefenses(planetId),
          get().fetchTechnologies(session.user.id),
          get().fetchResearchQueue(session.user.id),
          get().fetchFleets(session.user.id),
        ]);
        return true;
      }

      const { data, error } = await supabase.rpc('full_reconnect_sync', {
        p_planet_id: planetId,
      });

      if (error) {
        console.error('Reconnect sync error:', error);
        if (isStatementTimeout(error)) {
          setRpcCooldown('full_reconnect_sync');
        }
        await get().fetchResources(planetId);
        return false;
      }

      if (data && data.success) {
        const now = new Date();
        if (data.resources && !data.resources.error) {
          set({
            resources: {
              planet_id: planetId,
              metal: Number(data.resources.metal) || 0,
              crystal: Number(data.resources.crystal) || 0,
              deuterium: Number(data.resources.deuterium) || 0,
              metal_per_hour: Number(data.resources.metal_per_hour) || 0,
              crystal_per_hour: Number(data.resources.crystal_per_hour) || 0,
              deuterium_per_hour: Number(data.resources.deuterium_per_hour) || 0,
              metal_storage: Number(data.resources.metal_storage) || 10000,
              crystal_storage: Number(data.resources.crystal_storage) || 10000,
              deuterium_storage: Number(data.resources.deuterium_storage) || 10000,
              energy_used: Number(data.resources.energy_used) || 0,
              energy_max: Number(data.resources.energy_max) || 0,
              last_update: data.resources.last_update,
              metal_mine_percent: Number(data.resources.metal_mine_percent) ?? 100,
              crystal_mine_percent: Number(data.resources.crystal_mine_percent) ?? 100,
              deuterium_synth_percent: Number(data.resources.deuterium_synth_percent) ?? 100,
              solar_plant_percent: Number(data.resources.solar_plant_percent) ?? 100,
              fusion_reactor_percent: Number(data.resources.fusion_reactor_percent) ?? 100,
              solar_satellite_percent: Number(data.resources.solar_satellite_percent) ?? 100,
            },
            lastResourceUpdate: now,
            lastServerSync: now,
          });
        }

        await Promise.all([
          get().fetchBuildingQueue(planetId),
          get().fetchShipyardQueue(planetId),
          get().fetchBuildings(planetId),
          get().fetchShips(planetId),
          get().fetchDefenses(planetId),
          get().fetchTechnologies(session.user.id),
          get().fetchResearchQueue(session.user.id),
          get().fetchFleets(session.user.id),
        ]);
        return true;
      }
      await get().fetchResources(planetId);
      return false;
    } catch (error) {
      if (!isNetworkError(error)) {
        console.error('Error in full reconnect sync:', error);
      }
      await get().fetchResources(planetId);
      return false;
    }
  },

  // ============================================
  // FORTALEZAS DE ALIANZA
  // ============================================
  
  fortresses: [],
  selectedFortress: null,

  fetchAllFortresses: async () => {
    try {
      const { data, error } = await supabase.rpc('get_all_fortresses');
      if (error) throw error;
      if (data?.success) {
        set({ fortresses: data.fortresses || [] });
      }
    } catch (error) {
      console.error('Error fetching fortresses:', error);
    }
  },

  fetchFortressInfo: async (galaxy: number) => {
    try {
      const { data, error } = await supabase.rpc('get_fortress_info', { p_galaxy: galaxy });
      if (error) throw error;
      if (data?.success) {
        set({ selectedFortress: data as any });
      }
    } catch (error) {
      console.error('Error fetching fortress info:', error);
    }
  },

  deployToFortress: async (galaxy: number, planetId: string, ships: { ship_type_id: number; quantity: number }[]) => {
    try {
      const { data, error } = await supabase.rpc('deploy_to_fortress', {
        p_galaxy: galaxy,
        p_planet_id: planetId,
        p_ships: ships,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error deploying to fortress:', error);
      return { success: false, error: 'Error al enviar naves' };
    }
  },

  recallFromFortress: async (galaxy: number, ships: { ship_type_id: number; quantity: number }[]) => {
    try {
      const { data, error } = await supabase.rpc('recall_from_fortress', {
        p_galaxy: galaxy,
        p_ships: ships,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error recalling from fortress:', error);
      return { success: false, error: 'Error al retirar naves' };
    }
  },

  // ============================================
  // PLANETA DEL TESORO (aislado del sistema de Fortalezas)
  // ============================================

  treasurePlanets: [],
  selectedTreasurePlanet: null,

  fetchAllTreasurePlanets: async () => {
    try {
      const { data, error } = await supabase.rpc('get_all_treasure_planets');
      if (error) throw error;
      if (data?.success) {
        set({ treasurePlanets: data.treasure_planets || [] });
      }
    } catch (error) {
      console.error('Error fetching treasure planets:', error);
    }
  },

  fetchTreasurePlanetInfo: async (galaxy: number) => {
    try {
      const { data, error } = await supabase.rpc('get_treasure_planet_info', { p_galaxy: galaxy });
      if (error) throw error;
      if (data?.success) {
        set({ selectedTreasurePlanet: data as any });
      }
    } catch (error) {
      console.error('Error fetching treasure planet info:', error);
    }
  },

  recallFromTreasurePlanet: async (galaxy: number, ships: { ship_type_id: number; quantity: number }[]) => {
    try {
      const { data, error } = await supabase.rpc('recall_from_treasure_planet', {
        p_galaxy: galaxy,
        p_ships: ships,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error recalling from treasure planet:', error);
      return { success: false, error: 'Error al retirar naves' };
    }
  },

  // ============================================
  // ABANDONO VOLUNTARIO (Fortaleza <-> Planeta del Tesoro)
  // ============================================

  abandonStronghold: async (kind: 'fortress' | 'treasure', galaxy: number) => {
    try {
      const { data, error } = await supabase.rpc('abandon_stronghold', {
        p_kind: kind,
        p_galaxy: galaxy,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error abandoning stronghold:', error);
      return { success: false, error: 'Error al abandonar' };
    }
  },
}));
