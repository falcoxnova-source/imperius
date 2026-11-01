import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// [OCUPA2] Estado compartido de ocupaciones (selector de planetas, bloqueo y galaxia)
export interface OccupierPlanet {
  occupation_id: string;
  planet_id: string;
  planet_name: string;
  galaxy: number;
  solar_system: number;
  position: number;
  image_id: number | null;
  temp_max: number | null;
  owner_name: string | null;
  started_at: string;
  garrison_ships: number;
  pending_builds: number;
}

export interface OwnerOccupiedPlanet {
  occupation_id: string;
  planet_id: string;
  planet_name: string;
  galaxy: number;
  solar_system: number;
  position: number;
  image_id: number | null;
  temp_max: number | null;
  occupier_name: string | null;
  started_at: string;
}

// [OCUPA3] Modo "planeta ocupado seleccionado" (el ocupante lo ve como si fuera suyo)
export interface OccGarrisonShip {
  ship_type_id: number; code: string; name: string; image_url: string | null;
  quantity: number; cargo_capacity: number; base_speed: number;
}

export interface OccQueueItem {
  id: number; item_type: 'ship' | 'defense'; type_id: number; name: string; image_url: string | null;
  quantity: number; quantity_done: number; unit_time: number; start_time: string; end_time: string;
}

export interface OccBuildOption {
  id: number; code: string; name: string; image_url: string | null;
  metal_cost: number; crystal_cost: number; deuterium_cost: number; unit_time: number; available: boolean;
}

export interface OccTransportTarget {
  id: string; name: string; galaxy: number; solar_system: number; position: number; planet_type: string;
}

export interface OccDetail {
  occupation: {
    id: string; started_at: string; owner_name: string | null; planet_id: string; planet_name: string;
    galaxy: number; solar_system: number; position: number; image_id: number;
  };
  resources: {
    metal: number; crystal: number; deuterium: number;
    metal_per_hour: number; crystal_per_hour: number; deuterium_per_hour: number;
  };
  shipyard_level: number;
  garrison: OccGarrisonShip[];
  queue: OccQueueItem[];
  build_ships: OccBuildOption[];
  build_defenses: OccBuildOption[];
  transport_targets: OccTransportTarget[];
}

export interface OccPlanetView {
  planet: {
    diameter: number; fields_used: number; fields_max: number;
    temp_min: number; temp_max: number; planet_type: string;
  };
  storage: {
    metal_storage: number; crystal_storage: number; deuterium_storage: number;
    energy_max: number; energy_used: number;
  };
  buildings: { id: number; code: string; name: string; image_url: string | null; max_level: number; level: number }[];
  defenses: { defense_type_id: number; quantity: number }[];
}

// Estimación visual de recursos (el servidor recalcula y valida siempre)
export function liveOccResources(detail: OccDetail, view: OccPlanetView | null, fetchedAt: number, now: number) {
  const hours = Math.max(0, (now - fetchedAt) / 3600000);
  const grow = (value: number, rate: number, cap: number | undefined) => {
    const v = Number(value) || 0;
    if (!cap || v >= cap) return v;
    return Math.min(cap, v + (Number(rate) || 0) * hours);
  };
  const r = detail.resources;
  return {
    metal: grow(r.metal, r.metal_per_hour, view ? Number(view.storage.metal_storage) : undefined),
    crystal: grow(r.crystal, r.crystal_per_hour, view ? Number(view.storage.crystal_storage) : undefined),
    deuterium: grow(r.deuterium, r.deuterium_per_hour, view ? Number(view.storage.deuterium_storage) : undefined),
  };
}

interface OccupationState {
  asOccupier: OccupierPlanet[];
  asOwner: OwnerOccupiedPlanet[];
  activeOccupationId: string | null;
  activeDetail: OccDetail | null;
  activeView: OccPlanetView | null;
  activeFetchedAt: number;
  load: () => Promise<void>;
  enter: (occupationId: string) => Promise<void>;
  exit: () => void;
  refreshActive: () => Promise<void>;
  reset: () => void;
}

const EMPTY_ACTIVE = { activeOccupationId: null, activeDetail: null, activeView: null, activeFetchedAt: 0 };

export const useOccupationStore = create<OccupationState>((set, get) => ({
  asOccupier: [],
  asOwner: [],
  ...EMPTY_ACTIVE,
  load: async () => {
    const { data, error } = await supabase.rpc('get_occupation_overview');
    if (!error && data?.success) {
      const asOccupier = (data.as_occupier as OccupierPlanet[]) || [];
      set({
        asOccupier,
        asOwner: (data.as_owner as OwnerOccupiedPlanet[]) || [],
      });
      // Si la ocupación activa terminó (recuperada/abandonada), salir del modo
      const activeId = get().activeOccupationId;
      if (activeId && !asOccupier.some((o) => o.occupation_id === activeId)) {
        set({ ...EMPTY_ACTIVE });
      }
    }
  },
  enter: async (occupationId: string) => {
    if (get().activeOccupationId !== occupationId) {
      set({ ...EMPTY_ACTIVE, activeOccupationId: occupationId });
    }
    await get().refreshActive();
  },
  exit: () => set({ ...EMPTY_ACTIVE }),
  refreshActive: async () => {
    const id = get().activeOccupationId;
    if (!id) return;
    const [d, v] = await Promise.all([
      supabase.rpc('get_occupation_detail', { p_occupation_id: id }),
      supabase.rpc('get_occupation_planet_view', { p_occupation_id: id }),
    ]);
    if (get().activeOccupationId !== id) return;
    if (d.error) return; // error de red/transitorio: conservar el estado
    if (!d.data?.success) {
      // Ya no es el ocupante (recuperada o abandonada)
      set({ ...EMPTY_ACTIVE });
      return;
    }
    set({
      activeDetail: d.data as OccDetail,
      activeView: !v.error && v.data ? (v.data as OccPlanetView) : get().activeView,
      activeFetchedAt: Date.now(),
    });
  },
  reset: () => set({ asOccupier: [], asOwner: [], ...EMPTY_ACTIVE }),
}));
