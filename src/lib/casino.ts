import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// [CASINO1] Ubicacion fija del Casino Galactico (debe coincidir con _casino_is_location en la BD)
export const CASINO_COORDS = { galaxy: 3, system: 250, position: 10 } as const;
// [BATTLESHIP1] Planeta de Batalla Naval (debe coincidir con _battleship_is_location en la BD)
export const BATTLESHIP_COORDS = { galaxy: 3, system: 250, position: 6 } as const;
// [SPORTS1] Planeta de Apuestas Deportivas (debe coincidir con _sports_is_location en la BD)
export const SPORTS_COORDS = { galaxy: 3, system: 250, position: 4 } as const;

export type CasinoState = 'unavailable' | 'hangar' | 'traveling' | 'docked' | 'returning';

export interface CasinoStatus {
  hero_access: boolean;
  state: CasinoState;
  can_enter: boolean;
  /** [CASINOGATE1] si es true, Loteria y Rifa exigen la Nave Insignia estacionada */
  games_require_dock?: boolean;
  server_time: string;
  location: { galaxy: number; system: number; position: number; name: string };
  has_hero_ship?: boolean;
  hero?: { level: number; hp: number; hp_max: number; speed_points: number; in_repair: boolean } | null;
  on_expedition?: boolean;
  origin?: { galaxy: number; system: number; position: number } | null;
  estimated_flight_seconds?: number | null;
  estimated_deuterium_cost?: number | null;
  trip?: { departed_at: string; arrives_at: string; returns_at: string | null; flight_seconds: number } | null;
}

export async function fetchCasinoStatus(): Promise<CasinoStatus | null> {
  const { data, error } = await supabase.rpc('get_casino_status');
  if (error || !data) return null;
  return data as CasinoStatus;
}

// Acceso a la Nave Heroe (decidido en el servidor). Se consulta una vez por usuario.
const accessCache = new Map<string, Promise<boolean>>();

export function useHeroAccess(userId?: string | null): boolean | null {
  const [access, setAccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) {
      setAccess(null);
      return;
    }
    let cancelled = false;
    let p = accessCache.get(userId);
    if (!p) {
      p = fetchCasinoStatus().then((s) => !!s?.hero_access);
      p.then((ok) => { if (!ok) accessCache.delete(userId); });
      accessCache.set(userId, p);
    }
    p.then((ok) => { if (!cancelled) setAccess(ok); });
    return () => { cancelled = true; };
  }, [userId]);

  return access;
}
