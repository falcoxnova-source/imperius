import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Crown, Loader2, Save, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const MIN_PCT = 5;
const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface SplitMember {
  user_id: string;
  username: string | null;
  rank_level: number;
  rank_name: string | null;
  weight: number;
  pct: number;
}

interface RewardConfig {
  success: boolean;
  error?: string;
  alliance_id?: string;
  is_leader?: boolean;
  min_pct?: number;
  shares?: Record<string, number>;
  members?: SplitMember[];
}

/**
 * Reparto de las recompensas de alianza (Fortaleza y Planeta del Tesoro).
 * El lider asigna un peso a cada rango; el porcentaje de cada miembro sale de
 * su rango. Todos los miembros tienen garantizado un minimo del 5%.
 * Formula (identica a la del servidor):
 *   pct_i = 5% + (100% - n*5%) * peso_i / suma_pesos
 * Con todos los pesos iguales el resultado es el reparto equitativo de siempre.
 */
export function AllianceRewardShares() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<RewardConfig | null>(null);
  const [weights, setWeights] = useState<Record<number, number>>({});
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_alliance_reward_config');
      if (error) throw error;
      const cfg = data as RewardConfig;
      setConfig(cfg);

      const next: Record<number, number> = {};
      for (const lvl of LEVELS) {
        const raw = cfg?.shares?.[String(lvl)];
        next[lvl] = typeof raw === 'number' ? raw : 1;
      }
      setWeights(next);
    } catch (err) {
      console.error('Error loading reward config:', err);
      setConfig({ success: false, error: 'No se pudo cargar la configuracion' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const members = config?.members || [];
  const isLeader = config?.is_leader === true;

  // Niveles que realmente tiene algun miembro (los unicos que afectan al reparto hoy)
  const usedLevels = useMemo(() => {
    const set = new Set<number>(members.map((m) => m.rank_level));
    return Array.from(set).sort((a, b) => b - a);
  }, [members]);

  // Previsualizacion local con la misma formula del servidor
  const preview = useMemo(() => {
    const n = members.length;
    if (n === 0) return [] as Array<SplitMember & { previewPct: number }>;

    const sum = members.reduce((acc, m) => acc + Math.max(weights[m.rank_level] ?? 1, 0), 0);
    const minTotal = n * MIN_PCT;

    return members.map((m) => {
      const w = Math.max(weights[m.rank_level] ?? 1, 0);
      let pct: number;
      if (sum <= 0 || minTotal >= 100) {
        pct = 100 / n;
      } else {
        pct = MIN_PCT + ((100 - minTotal) * w) / sum;
      }
      return { ...m, previewPct: pct };
    });
  }, [members, weights]);

  const dirty = useMemo(() => {
    if (!config?.shares) return LEVELS.some((lvl) => (weights[lvl] ?? 1) !== 1);
    return LEVELS.some((lvl) => {
      const saved = config.shares?.[String(lvl)];
      return (weights[lvl] ?? 1) !== (typeof saved === 'number' ? saved : 1);
    });
  }, [weights, config]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = LEVELS.map((lvl) => ({ rank_level: lvl, weight: weights[lvl] ?? 1 }));
      const { data, error } = await supabase.rpc('set_alliance_rank_shares', { p_shares: payload });
      if (error) throw error;
      const res = data as { success: boolean; error?: string };
      if (!res?.success) {
        setMessage({ type: 'err', text: res?.error || 'No se pudo guardar' });
        return;
      }
      setMessage({ type: 'ok', text: 'Reparto guardado' });
      await load();
    } catch (err) {
      console.error('Error saving reward shares:', err);
      setMessage({ type: 'err', text: 'No se pudo guardar' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleReset = () => {
    const next: Record<number, number> = {};
    for (const lvl of LEVELS) next[lvl] = 1;
    setWeights(next);
  };

  if (loading) {
    return (
      <div className="card-glass p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-cyber-blue animate-spin" />
      </div>
    );
  }

  if (!config?.success) return null;

  return (
    <div className="card-glass p-6">
      <div className="flex items-center gap-2 mb-1">
        <Coins className="w-5 h-5 text-cyber-yellow" />
        <h3 className="font-orbitron text-lg text-white">Reparto de recompensas</h3>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Fortalezas y Planeta del Tesoro. El porcentaje de cada miembro depende de su rango.
        Todos tienen garantizado un minimo del {config.min_pct ?? MIN_PCT}%.
      </p>

      {isLeader && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Peso por rango</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {usedLevels.map((lvl) => {
              const sample = members.find((m) => m.rank_level === lvl);
              return (
                <div key={lvl} className="bg-space-700/40 rounded-lg p-3">
                  <p className="text-sm text-white truncate">{sample?.rank_name || `Nivel ${lvl}`}</p>
                  <p className="text-xs text-gray-500 mb-2">Nivel {lvl}</p>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={weights[lvl] ?? 1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setWeights((prev) => ({
                        ...prev,
                        [lvl]: Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), 0), 1000) : 0,
                      }));
                    }}
                    className="w-full bg-space-800 border border-space-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-cyber-blue"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
            <button
              onClick={handleReset}
              disabled={saving}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white px-3 py-2 rounded hover:bg-space-700 disabled:opacity-40"
              title="Volver al reparto equitativo"
            >
              <RotateCcw className="w-4 h-4" />
              Reparto equitativo
            </button>
            {message && (
              <span className={`text-sm ${message.type === 'ok' ? 'text-cyber-green' : 'text-cyber-red'}`}>
                {message.text}
              </span>
            )}
          </div>
        </div>
      )}

      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
        {isLeader ? 'Resultado' : 'Tu alianza reparte asi'}
      </p>
      <div className="space-y-2">
        {preview.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3">
            <div className="w-40 sm:w-56 shrink-0 flex items-center gap-1 min-w-0">
              {m.rank_level >= 10 && <Crown className="w-3 h-3 text-cyber-yellow shrink-0" />}
              <span className="text-sm text-white truncate">{m.username || '???'}</span>
              <span className="text-xs text-gray-500 truncate">({m.rank_name || `N${m.rank_level}`})</span>
            </div>
            <div className="flex-1 h-2 bg-space-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyber-yellow rounded-full transition-all"
                style={{ width: `${Math.min(m.previewPct, 100)}%` }}
              />
            </div>
            <span className="w-16 text-right font-orbitron text-sm text-cyber-yellow">
              {m.previewPct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
