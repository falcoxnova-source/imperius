import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export type BonusKind =
  | 'production'
  | 'build'
  | 'research'
  | 'shipyard'
  | 'fleet'
  | 'energy'
  | 'queue';

export interface BonusEntry {
  code: string;
  kind: BonusKind;
  percent: number;
  expires_at: string | null;
  stack: 'add' | 'mult' | 'slots';
  title?: string | null;
  icon?: string | null;
  meta?: { streak?: number; slots?: number } | null;
}

export interface BonusSummary {
  is_plus: boolean;
  vip_expires_at: string | null;
  server_time: string;
  totals: {
    production: number;
    build: number;
    research: number;
    shipyard: number;
    fleet: number;
  };
  entries: BonusEntry[];
}

/**
 * Lee el resumen de bonos directamente del backend (`get_my_bonus_summary`).
 * El servidor es la unica fuente de verdad: la UI nunca calcula multiplicadores.
 */
export function useBonusSummary(pollMs = 60000) {
  const [summary, setSummary] = useState<BonusSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_bonus_summary');
    if (!error && data && !(data as { error?: string }).error) {
      setSummary(data as BonusSummary);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (pollMs <= 0) return;
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { summary, loading, reload: load };
}
