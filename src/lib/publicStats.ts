/**
 * Estadisticas publicas del juego (banner de login/registro y homepage).
 *
 * Fuente unica de verdad: RPC `get_game_stats` -> `get_public_game_stats`.
 * El backend ya devuelve los importes en USDT convertidos con el precio real
 * de TUNG (`tung_price_usd`, el mismo que usan la wallet y el panel admin),
 * por lo que aqui NO se debe hardcodear ninguna tasa de cambio.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface PublicGameStats {
  total_players: number;
  ranked_players: number;
  /** USDT (TUNG convertido al precio real + depositos nativos USDT) */
  total_deposited: number;
  /** USDT */
  total_withdrawn: number;
  /** TUNG bruto depositado (confirmado) */
  total_deposited_tung: number;
  /** TUNG bruto retirado (confirmado) */
  total_withdrawn_tung: number;
  market_transactions: number;
  /** USDT */
  market_volume_usdt: number;
  /** TUNG */
  market_volume_fxu: number;
  expedition_pool_fxu: number;
  monthly_pool_fxu: number;
  fortress_pool_fxu: number;
  treasure_pool_fxu: number;
  /** Suma de los 4 pools, en TUNG */
  total_jackpot_fxu: number;
  /** Suma de los 4 pools, en USDT */
  total_jackpot_usdt: number;
  /** Precio real de 1 TUNG en USD */
  tung_price_usd: number;
}

export function usePublicGameStats(): PublicGameStats | null {
  const [stats, setStats] = useState<PublicGameStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('get_game_stats').then(({ data }) => {
      if (!cancelled && data) setStats(data as PublicGameStats);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}

/** Formatea un importe USDT de forma legible ($1.234,56). */
export function formatUsdt(usdt: number, decimals = 2): string {
  return `$${usdt.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
