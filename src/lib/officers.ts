import { supabase } from './supabase';
import type { OfficerBonuses } from './formulas';
import type { UserOfficer } from '../types/game';

export async function fetchActiveOfficers(userId: string): Promise<UserOfficer[]> {
  const { data, error } = await supabase
    .from('user_officers')
    .select('*, officer_type:officer_types(*)')
    .eq('user_id', userId)
    .gte('expires_at', new Date().toISOString());

  // [RQFIX1] Lanzar en vez de devolver [] para no borrar los oficiales
  // cargados (un fallo puntual dejaba al Comandante "inactivo" en el cliente).
  if (error) throw error;

  return data || [];
}

export function getOfficerBonuses(activeOfficers: UserOfficer[]): OfficerBonuses {
  const now = new Date();

  const isActive = (code: string): boolean => {
    return activeOfficers.some(
      (uo) =>
        uo.officer_type?.code === code && new Date(uo.expires_at) > now
    );
  };

  return {
    hasCommander: isActive('commander'),
    hasAdmiral: isActive('admiral'),
    hasEngineer: isActive('engineer'),
    hasGeologist: isActive('geologist'),
    hasTechnocrat: isActive('technocrat'),
  };
}

export function hasActiveOfficer(activeOfficers: UserOfficer[], code: string): boolean {
  const now = new Date();
  return activeOfficers.some(
    (uo) =>
      uo.officer_type?.code === code && new Date(uo.expires_at) > now
  );
}
