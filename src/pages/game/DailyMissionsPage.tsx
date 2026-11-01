import { useState, useEffect, useCallback } from 'react';
import { Sword, Eye, Compass, Building2, Microscope, Pickaxe, Gem, CheckCircle2, Clock, Gift, Loader2, AlertCircle, TrendingUp, Zap, Flame, Star, Check, CircleDot, Crown, Coins, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatNumber } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { ActiveBonusesPanel } from '../../components/game/ActiveBonusesPanel';

interface DailyMission {
  id: string;
  mission_id: number;
  code: string;
  title: string;
  description: string;
  mission_type: string;
  target_count: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  reward_type: string;
  reward_value: number;
  reward_duration_hours: number;
  icon: string;
  expires_at: string;
  is_premium: boolean;
  cost_fxu: number;
}

const iconMap: Record<string, typeof Sword> = {
  Sword, Eye, Compass, Building2, Microscope, Pickaxe, Gem, TrendingUp, Zap, Crown, Flame, Star,
};

function MissionIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name as keyof typeof iconMap];
  return Icon ? <Icon className={className} /> : <CircleDot className={className} />;
}

function getProgressColor(pct: number): string {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 66) return 'bg-cyan-400';
  if (pct >= 33) return 'bg-yellow-400';
  return 'bg-slate-500';
}

function getRewardLabel(type: string, value: number, hours: number, prodLabel: string, speedLabel: string): string {
  const duration = hours >= 24
    ? hours % 24 === 0 ? `${hours / 24}d` : `${(hours / 24).toFixed(1)}d`
    : `${hours}h`;
  if (type === 'production_bonus') return `+${value}% ${prodLabel} ${duration}`;
  if (type === 'speed_bonus') return `+${value}% ${speedLabel} ${duration}`;
  return `+${value}% ${duration}`;
}

function getRewardIcon(type: string): typeof Flame {
  return type === 'production_bonus' ? TrendingUp : Zap;
}

function getActionLabel(t: any, missionType: string): string {
  const map: Record<string, string> = {
    attack: t.missions.actionAttack,
    spy: t.missions.actionSpy,
    expedition: t.missions.actionExpedition,
    build: t.missions.actionBuild,
    research: t.missions.actionResearch,
    collect_metal: t.missions.actionCollectMetal,
    collect_crystal: t.missions.actionCollectCrystal,
    collect_deuterium: t.missions.actionCollectDeuterium,
  };
  return map[missionType] || missionType;
}

function getTargetLabel(t: any, missionType: string): string {
  const map: Record<string, string> = {
    attack: t.missions.targetAttack,
    spy: t.missions.targetSpy,
    expedition: t.missions.targetExpedition,
    build: t.missions.targetBuild,
    research: t.missions.targetResearch,
    collect_metal: t.missions.targetCollectMetal,
    collect_crystal: t.missions.targetCollectCrystal,
    collect_deuterium: t.missions.targetCollectDeuterium,
  };
  return map[missionType] || '';
}

const missionActionColors: Record<string, string> = {
  attack: 'text-red-400 bg-red-500/10',
  spy: 'text-purple-400 bg-purple-500/10',
  expedition: 'text-cyan-400 bg-cyan-500/10',
  build: 'text-orange-400 bg-orange-500/10',
  research: 'text-emerald-400 bg-emerald-500/10',
  collect_metal: 'text-gray-400 bg-gray-500/10',
  collect_crystal: 'text-cyan-300 bg-cyan-300/10',
  collect_deuterium: 'text-green-400 bg-green-500/10',
};

const missionTargetLabels: Record<string, string> = {
  attack: 'flotas enemigas',
  spy: 'planetas',
  expedition: 'expediciones',
  build: 'niveles',
  research: 'tecnologias',
  collect_metal: 'de metal',
  collect_crystal: 'de cristal',
  collect_deuterium: 'de deuterio',
};

// Etiquetas específicas para cada misión premium (evita el genérico "Aplica a velocidad")
const premiumBonusLabel: Record<string, string> = {
  premium_build_10:     '🏭 Producción de metal, cristal y deuterio',
  premium_expedition_8: '🚀 Velocidad de naves y edificios',
  premium_research_5:   '🔬 Velocidad de investigación tecnológica',
  premium_destroy_10:   '🏭 Producción de todos los recursos',
  premium_collect_5m:   '🏗️ Velocidad de construcción de edificios',
};

const ITEMS_PER_PAGE = 8;

export function DailyMissionsPage() {
  const { profile } = useAuthStore();
  const { t } = useI18n();
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [purchasingId, setPurchasingId] = useState<number | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [fxuBalance, setFxuBalance] = useState(0);
  const [page, setPage] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'free' | 'premium'>('all');

  const totalPages = Math.max(1, Math.ceil(missions.length / ITEMS_PER_PAGE));
  const paginated = missions.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const loadMissions = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    setError(null);

    const [freeRes, premRes, profileRes] = await Promise.all([
      supabase.rpc('get_user_daily_missions', { p_user_id: profile.id }),
      supabase.rpc('get_premium_missions'),
      supabase.from('profiles').select('tung_balance').eq('id', profile.id).single(),
    ]);

    const all: DailyMission[] = [];

    if (freeRes.data) {
      for (const m of freeRes.data as any[]) {
        all.push({ ...m, is_premium: false, cost_fxu: 0 });
      }
    }
    if (freeRes.error) setError(freeRes.error.message);

    if (premRes.data) {
      for (const m of premRes.data as any[]) {
        all.push({
          id: `premium_${m.id}`,
          mission_id: m.id,
          code: m.code,
          title: m.title,
          description: m.description,
          mission_type: m.mission_type,
          target_count: 0,
          progress: 0,
          completed: false,
          claimed: false,
          reward_type: m.reward_type,
          reward_value: m.reward_value,
          reward_duration_hours: m.reward_duration_hours,
          icon: m.icon,
          expires_at: '',
          is_premium: true,
          cost_fxu: m.cost_fxu,
        });
      }
    }

    setMissions(all);
    if (profileRes.data) setFxuBalance(profileRes.data.tung_balance);
    setIsLoading(false);
  }, [profile]);

  useEffect(() => { loadMissions(); }, [loadMissions]);

  useEffect(() => {
    if (missions.length === 0) return;
    const freeMissions = missions.filter(m => !m.is_premium && m.expires_at);
    if (freeMissions.length === 0) return;
    const earliest = freeMissions.reduce((min, m) => new Date(m.expires_at) < new Date(min.expires_at) ? m : min, freeMissions[0]);
    const update = () => {
      const diff = new Date(earliest.expires_at).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft(t.missions.expired); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [missions]);

  useEffect(() => {
    setPage(0);
  }, [activeTab]);

  const filtered = missions.filter(m => {
    if (activeTab === 'free') return !m.is_premium;
    if (activeTab === 'premium') return m.is_premium;
    return true;
  });
  const fp = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedFiltered = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const claim = async (missionId: string) => {
    if (!profile) return;
    setClaimingId(missionId);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('claim_daily_mission_reward', {
      p_user_id: profile.id,
      p_mission_id: missionId,
    });
    if (rpcError) { setError(rpcError.message); }
    else if (data?.success) { setClaimedIds(prev => new Set(prev).add(missionId)); }
    else { setError(data?.error || t.common.error); }
    setClaimingId(null);
  };

  const purchase = async (missionId: number, cost: number) => {
    if (!profile) return;
    if (fxuBalance < cost) { setError(t.common.noResources); return; }
    setPurchasingId(missionId);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('purchase_daily_mission_bonus', {
      p_user_id: profile.id,
      p_mission_id: missionId,
    });
    if (rpcError) { setError(rpcError.message); }
    else if (data?.success) {
      setPurchasedIds(prev => new Set(prev).add(missionId));
      setFxuBalance(prev => prev - cost);
    } else { setError(data?.error || t.common.error); }
    setPurchasingId(null);
  };

  const freeCount = missions.filter(m => !m.is_premium).length;
  const premCount = missions.filter(m => m.is_premium).length;
  const completedCount = missions.filter(m => !m.is_premium && m.claimed).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 via-slate-800/90 to-slate-900 border border-slate-700/50 p-5">
        <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/20">
              <Star className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{t.missions.title}</h2>
              <p className="text-xs text-slate-400">{t.missions.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-300">{completedCount}/{freeCount} {t.missions.completed}</span>
              <span className="text-yellow-400 flex items-center gap-1"><Coins className="w-3.5 h-3.5" />{formatNumber(fxuBalance)}</span>
            </div>
            {timeLeft && (
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                <Clock className="w-3.5 h-3.5" /><span>{timeLeft}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {profile && <ActiveBonusesPanel compact />}

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 w-fit">
        {[
          { key: 'all' as const, label: `${t.missions.tabAll} (${missions.length})` },
          { key: 'free' as const, label: `${t.missions.tabFree} (${freeCount})` },
          { key: 'premium' as const, label: `${t.missions.tabPremium} (${premCount})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setPage(0); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === tab.key ? 'bg-cyan-500/20 text-cyan-300 shadow-sm' : 'text-slate-400 hover:text-white'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {paginatedFiltered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <CheckCircle2 className="w-12 h-12 mb-3 text-green-500/50" />
          <p className="text-lg font-medium text-slate-400">{t.missions.emptyTitle}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {paginatedFiltered.map((mission) => {
              const isPrem = mission.is_premium;
              const pct = isPrem ? 0 : Math.min(100, Math.round((mission.progress / mission.target_count) * 100));
              const isCompleted = !isPrem && mission.completed;
              const isClaimed = !isPrem && (mission.claimed || claimedIds.has(mission.id));
              const isPurchased = isPrem && purchasedIds.has(mission.mission_id);
              const RewardIcon = getRewardIcon(mission.reward_type);
              // Premium card colors based on bonus type (production=green, speed=blue)
              const premIsProd = isPrem && mission.reward_type === 'production_bonus';
              const premIsSpeed = isPrem && mission.reward_type === 'speed_bonus';
              const premBorderColor = premIsProd ? 'border-emerald-500/30' : premIsSpeed ? 'border-cyan-500/30' : 'border-yellow-500/20';
              const premBgGlow = premIsProd ? 'from-emerald-500/10' : premIsSpeed ? 'from-cyan-500/10' : 'from-yellow-500/5';
              const premHoverBorder = premIsProd ? 'hover:border-emerald-500/50' : premIsSpeed ? 'hover:border-cyan-500/50' : 'hover:border-yellow-500/30';
              const premAccentBar = premIsProd ? 'bg-emerald-500' : premIsSpeed ? 'bg-cyan-500' : 'bg-yellow-500';
              const premBadgeBg = premIsProd ? 'bg-emerald-500/15 text-emerald-300' : premIsSpeed ? 'bg-cyan-500/15 text-cyan-300' : 'bg-yellow-500/10 text-yellow-400';

              return (
                <div key={mission.id} className={`relative overflow-hidden rounded-xl border transition-all duration-200 flex flex-col ${
                  isPrem
                    ? `${premBorderColor} bg-gradient-to-b ${premBgGlow} via-slate-800/90 to-slate-800/90 ${premHoverBorder}`
                    : isCompleted
                      ? 'border-green-500/30 bg-gradient-to-b from-green-500/5 via-slate-800/90 to-slate-800/90'
                      : 'border-slate-700/50 bg-slate-800/60 hover:border-slate-600/50'
                }`}>
                  {/* Colored accent bar at top for premium cards */}
                  {isPrem && <div className={`absolute top-0 left-0 right-0 h-0.5 ${premAccentBar} opacity-80 rounded-t-xl`} />}
                  <div className="absolute top-0 right-0 w-20 h-20 bg-current opacity-[0.03] rounded-full blur-2xl pointer-events-none" />
                  <div className="p-3 flex flex-col flex-1">
                    {/* Icon + Title row */}
                    <div className="flex items-start gap-2.5 mb-2">
                      <div className={`p-1.5 rounded-lg shrink-0 ${
                        isPrem ? 'bg-yellow-500/20 text-yellow-400' : isCompleted ? 'bg-green-500/20 text-green-400' : 'bg-slate-700/50 text-slate-400'
                      }`}>
                        <MissionIcon name={mission.icon} className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-xs text-white truncate leading-tight">{mission.title}</h3>
                        {isPrem && <span className="text-[9px] text-yellow-500/70 font-semibold uppercase tracking-wider">{t.missions.premiumTag}</span>}
                      </div>
                    </div>

                    {/* Action objective */}
                    {!isPrem && (
                      <div className={`px-1.5 py-0.5 rounded text-[10px] font-semibold mb-1.5 w-fit ${missionActionColors[mission.mission_type] || 'text-slate-400 bg-slate-700/50'}`}>
                        {getActionLabel(t, mission.mission_type)} {mission.target_count} {getTargetLabel(t, mission.mission_type)}
                      </div>
                    )}
                    {/* Description - more visible for premium */}
                    <p className={`leading-relaxed line-clamp-2 mb-2 ${isPrem ? 'text-[11px] text-slate-300' : 'text-[10px] text-slate-400'}`}>{mission.description}</p>

                    {/* Reward badge - prominent for premium, compact for free */}
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md font-semibold mb-2 w-fit ${
                      isPrem
                        ? `text-xs ${premBadgeBg} border ${premBorderColor.replace('/30','/20')}`
                        : mission.reward_type === 'production_bonus' ? 'text-[10px] text-emerald-400 bg-emerald-500/10' : 'text-[10px] text-cyan-400 bg-cyan-500/10'
                    }`}>
                      <RewardIcon className={`${isPrem ? 'w-4 h-4' : 'w-3 h-3'}`} />
                      <span className={isPrem ? 'font-bold' : ''}>{getRewardLabel(mission.reward_type, mission.reward_value, mission.reward_duration_hours, t.missions.rewardProd, t.missions.rewardSpeed)}</span>
                    </div>

                    {/* Premium: qué afecta este bonus específicamente */}
                    {isPrem && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-2">
                        <span>{premiumBonusLabel[mission.code] || (mission.reward_type === 'production_bonus' ? '🌾 Producción' : '⚡ Velocidad')}</span>
                      </div>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Free mission: progress bar */}
                    {!isPrem && !isClaimed && (
                      <div className="mb-2">
                        <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${getProgressColor(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[9px] text-slate-500">{pct}%</span>
                          <span className="text-[9px] text-slate-500 font-mono">{mission.progress}/{mission.target_count}</span>
                        </div>
                      </div>
                    )}

                    {/* Action button */}
                    {isPrem ? (
                      isPurchased ? (
                        <span className="flex items-center justify-center gap-1 text-[11px] text-green-400 bg-green-500/10 rounded-lg py-1.5"><Check className="w-3 h-3" /> {t.missions.acquired}</span>
                      ) : (
                        <button onClick={() => purchase(mission.mission_id, mission.cost_fxu)}
                          disabled={purchasingId === mission.mission_id || fxuBalance < mission.cost_fxu}
                          className={`flex items-center justify-center gap-1.5 w-full py-1.5 text-[11px] font-semibold rounded-lg transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 ${
                            fxuBalance >= mission.cost_fxu
                              ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white shadow-sm shadow-yellow-500/20'
                              : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                          }`}>
                          {purchasingId === mission.mission_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Coins className="w-3 h-3" />{mission.cost_fxu}</>}
                        </button>
                      )
                    ) : isClaimed ? (
                      <span className="flex items-center justify-center gap-1 text-[11px] text-green-400 bg-green-500/10 rounded-lg py-1.5"><Check className="w-3 h-3" /> {t.missions.claimed}</span>
                    ) : isCompleted ? (
                      <button onClick={() => claim(mission.id)} disabled={claimingId === mission.id}
                        className="flex items-center justify-center gap-1.5 w-full py-1.5 text-[11px] font-semibold rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white shadow-sm shadow-purple-500/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50">
                        {claimingId === mission.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
                        {t.missions.claim}
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-500 text-center py-1.5 block">{t.missions.inProgress}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {fp > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: fp }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all ${page === i ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white'}`}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(fp - 1, p + 1))} disabled={page >= fp - 1}
                className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
