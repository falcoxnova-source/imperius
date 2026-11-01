import { useState, useEffect, useCallback } from 'react';
import { Crown, TrendingUp, Zap, Loader2, AlertCircle, Check, Coins, Gift, Flame, Star, Gem, CircleDot } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatNumber } from '../../lib/utils';
import { ActiveBonusesPanel } from '../../components/game/ActiveBonusesPanel';

interface PremiumMission {
  id: number;
  code: string;
  title: string;
  description: string;
  reward_type: string;
  reward_value: number;
  reward_duration_hours: number;
  icon: string;
  cost_fxu: number;
  cost_usd: number | null;
}

function getRewardLabel(type: string, value: number, hours: number): string {
  if (type === 'production_bonus') return `+${value}% produccion ${hours}h`;
  if (type === 'speed_bonus') return `+${value}% velocidad ${hours}h`;
  return `+${value}% ${hours}h`;
}

function getRewardIcon(type: string) {
  return type === 'production_bonus' ? TrendingUp : Zap;
}

const iconMap: Record<string, typeof Crown> = {
  Crown, TrendingUp, Zap, Flame, Star, Gem,
};

function MissionIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name as keyof typeof iconMap];
  return Icon ? <Icon className={className} /> : <CircleDot className={className} />;
}

export function PremiumMissionsPage() {
  const { profile } = useAuthStore();
  const [missions, setMissions] = useState<PremiumMission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<number | null>(null);
  const [activeBonusIds, setActiveBonusIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [fxuBalance, setFxuBalance] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    setError(null);
    const [premiumRes, profileRes, bonusesRes] = await Promise.all([
      supabase.rpc('get_premium_missions'),
      supabase.from('profiles').select('tung_balance').eq('id', profile.id).single(),
      supabase.rpc('get_user_active_bonuses', { p_user_id: profile.id }),
    ]);
    if (premiumRes.error) { setError(premiumRes.error.message); }
    else if (premiumRes.data) { setMissions(premiumRes.data as PremiumMission[]); }
    if (profileRes.data) { setFxuBalance(profileRes.data.tung_balance); }
    if (bonusesRes.data) {
      setActiveBonusIds(new Set(bonusesRes.data.map((b: { mission_id: number }) => b.mission_id)));
    }
    setIsLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const purchase = async (missionId: number, cost: number) => {
    if (!profile) return;
    if (fxuBalance < cost) { setError('TUNG insuficientes'); return; }
    setPurchasingId(missionId);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('purchase_daily_mission_bonus', {
      p_user_id: profile.id,
      p_mission_id: missionId,
    });
    if (rpcError) { setError(rpcError.message); }
    else if (data?.success) {
      setActiveBonusIds(prev => new Set(prev).add(missionId));
      setFxuBalance(prev => prev - cost);
    } else { setError(data?.error || 'Error al comprar'); }
    setPurchasingId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-yellow-900/30 via-slate-800/90 to-slate-900 border border-yellow-500/20 p-6">
        <div className="absolute top-0 right-0 w-48 h-48 bg-yellow-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/20">
              <Crown className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-yellow-300">Misiones Premium</h2>
              <p className="text-xs text-slate-400">Compra bonos potentes con TUNG</p>
            </div>
          </div>
          <div className="flex items-center justify-end mt-4 pt-4 border-t border-yellow-500/10">
            <div className="flex items-center gap-1.5 text-sm text-yellow-400">
              <Coins className="w-4 h-4" />
              <span className="font-bold">{formatNumber(fxuBalance)}</span>
            </div>
          </div>
        </div>
      </div>

      {profile && <ActiveBonusesPanel compact />}

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {missions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Gift className="w-12 h-12 mb-3 text-yellow-500/30" />
          <p className="text-lg font-medium text-slate-400">No hay misiones premium disponibles</p>
        </div>
      ) : (
        <div className="space-y-3">
          {missions.map((pm) => {
            const isActive = activeBonusIds.has(pm.id);
            const RewardIcon = getRewardIcon(pm.reward_type);

            return (
              <div key={pm.id} className="relative overflow-hidden rounded-xl border border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 via-slate-800/80 to-slate-800/80 hover:border-yellow-500/30 transition-all duration-300">
                <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full blur-2xl" />
                <div className="p-4 relative">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-yellow-500/20 text-yellow-400 shrink-0">
                      <MissionIcon name={pm.icon} className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-sm text-yellow-300 truncate">{pm.title}</h3>
                          {pm.cost_usd != null && pm.cost_usd > 0 && (
                            <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-emerald-400">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                ${pm.cost_usd.toFixed(2)} USD en TUNG
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isActive ? (
                            <span className="flex items-center gap-1 text-xs text-green-400"><Check className="w-3.5 h-3.5" /> Activo</span>
                          ) : (
                            <button
                              onClick={() => purchase(pm.id, pm.cost_fxu)}
                              disabled={purchasingId === pm.id || fxuBalance < pm.cost_fxu}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 ${
                                fxuBalance >= pm.cost_fxu
                                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white shadow-lg shadow-yellow-500/20'
                                  : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              {purchasingId === pm.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <><Coins className="w-3.5 h-3.5" />{pm.cost_fxu}</>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{pm.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1.5 text-yellow-400">
                          <RewardIcon className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">{getRewardLabel(pm.reward_type, pm.reward_value, pm.reward_duration_hours)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
