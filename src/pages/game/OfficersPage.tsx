import { useState, useEffect, useCallback } from 'react';
import {
  Crown,
  Anchor,
  Wrench,
  Mountain,
  Brain,
  Atom,
  Bot,
  Clock,
  Check,
  AlertCircle,
  Coins,
  Gift,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { formatNumber } from '../../lib/utils';
import { useI18n, translateOfficerName, translateOfficerDescription } from '../../lib/i18n';
import { MediaDisplay } from '../../components/ui/MediaDisplay';
import { GiftItemModal } from '../../components/game/GiftItemModal';
import type { OfficerType, UserOfficer } from '../../types/game';

type Duration = '7d' | '30d' | '90d';

const iconMap: Record<string, React.ReactNode> = {
  crown: <Crown className="w-5 h-5" />,
  anchor: <Anchor className="w-5 h-5" />,
  wrench: <Wrench className="w-5 h-5" />,
  mountain: <Mountain className="w-5 h-5" />,
  brain: <Brain className="w-5 h-5" />,
  bot: <Bot className="w-5 h-5" />,
};

const officerColors: Record<string, { bg: string; border: string; text: string; gradient: string }> = {
  commander: { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-400', gradient: 'from-amber-500/30' },
  admiral: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', gradient: 'from-blue-500/30' },
  engineer: { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', gradient: 'from-orange-500/30' },
  geologist: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', gradient: 'from-emerald-500/30' },
  technocrat: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-400', gradient: 'from-cyan-500/30' },
  android: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', gradient: 'from-purple-500/30' },
};

export function OfficersPage() {
  const { t } = useI18n();
  const { profile, refreshProfile } = useAuthStore();
  const refreshOfficers = useGameStore((s) => s.refreshOfficers);
  const [officerTypes, setOfficerTypes] = useState<OfficerType[]>([]);
  const [userOfficers, setUserOfficers] = useState<UserOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<Record<string, Duration>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Precio de mercado en vivo de TUNG (DexScreener), obtenido del servidor via RPC
  const [tungPriceUsd, setTungPriceUsd] = useState<number | null>(null);
  // [GIFTOFFICER1] Oficial que se esta regalando (RPC gift_officer)
  const [giftTarget, setGiftTarget] = useState<{ officer: OfficerType; duration: Duration } | null>(null);

  const fetchTungPrice = useCallback(async (): Promise<number | null> => {
    try {
      const { data, error } = await supabase.rpc('get_live_tung_price_usd');
      if (!error && data != null) {
        const price = typeof data === 'number' ? data : parseFloat(data as string);
        if (!isNaN(price) && price > 0) {
          setTungPriceUsd(price);
          return price;
        }
      }
    } catch (e) {
      console.error('Error fetching TUNG price:', e);
    }
    return null;
  }, []);

  const durationLabels: Record<Duration, string> = {
    '7d': `7 ${t.common.days}`,
    '30d': `30 ${t.common.days}`,
    '90d': `90 ${t.common.days}`,
  };

  useEffect(() => {
    loadOfficers();
  }, [profile]);

  useEffect(() => {
    fetchTungPrice();
  }, [fetchTungPrice]);

  const loadOfficers = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data: types, error: typesError } = await supabase
        .from('officer_types')
        .select('*')
        .order('sort_order');

      if (typesError) throw typesError;

      const { data: userOffs, error: userError } = await supabase
        .from('user_officers')
        .select('*, officer_type:officer_types(*)')
        .eq('user_id', profile.id);

      if (userError) throw userError;

      setOfficerTypes(types || []);
      setUserOfficers(userOffs || []);

      const defaultDurations: Record<string, Duration> = {};
      (types || []).forEach((t) => {
        defaultDurations[t.id] = '30d';
      });
      setSelectedDuration(defaultDurations);
    } catch (err) {
      console.error('Error loading officers:', err);
    } finally {
      setLoading(false);
    }
  };

  const getUsdtCost = (officer: OfficerType, duration: Duration): number => {
    switch (duration) {
      case '7d':
        return Number(officer.usdt_cost_7d) || 0;
      case '30d':
        return Number(officer.usdt_cost_30d) || 0;
      case '90d':
        return Number(officer.usdt_cost_90d) || 0;
      default:
        return Number(officer.usdt_cost_30d) || 0;
    }
  };

  const getActiveOfficer = (officerTypeId: string): UserOfficer | undefined => {
    return userOfficers.find(
      (uo) => uo.officer_type_id === officerTypeId && new Date(uo.expires_at) > new Date()
    );
  };

  const formatTimeRemaining = (expiresAt: string): string => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return t.officers.expired;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      return `${days}d ${hours}h ${t.officers.remaining}`;
    }
    return `${hours}h ${t.officers.remaining}`;
  };

  const handlePurchase = async (officer: OfficerType) => {
    if (!profile) return;

    const duration = selectedDuration[officer.id] || '30d';

    setPurchasing(officer.id);
    setError('');
    setSuccess('');

    try {
      // Refrescar el precio en vivo justo antes de cobrar (el servidor valida el precio)
      await fetchTungPrice();

      const { data, error: rpcError } = await supabase.rpc('purchase_officer_with_fxu', {
        p_officer_type_id: officer.id,
        p_duration: duration,
      });

      if (rpcError) throw rpcError;
      if (data && !data.success) {
        throw new Error(data.error);
      }

      setSuccess(`${translateOfficerName(t, officer.code, officer.name)} ${t.officers.activatedFor} ${durationLabels[duration]}`);
      setTimeout(() => setSuccess(''), 3000);
      await refreshProfile();
      await loadOfficers();
      // Sin esto el store del juego sigue sin el oficial y los bonos (slots de cola,
      // velocidad de flota, etc.) no se aplican hasta recargar la app entera.
      if (profile) {
        await refreshOfficers(profile.id);
      }
    } catch (err) {
      console.error('Error purchasing officer:', err);
      const errorMessage = err instanceof Error ? err.message : t.officers.errorHiring;
      setError(errorMessage);
      setTimeout(() => setError(''), 3000);
    } finally {
      setPurchasing(null);
    }
  };

  const getBonusDescription = (officer: OfficerType): string[] => {
    const bonuses: string[] = [];

    switch (officer.bonus_type) {
      case 'building_queue':
        bonuses.push(`+${officer.bonus_value} ${t.officers.buildingQueueSlots}`);
        if (officer.code === 'commander') {
          bonuses.push(`+2 ${t.officers.researchQueueSlots}`);
        }
        break;
      case 'fleet_slots':
        bonuses.push(`+${officer.bonus_value} ${t.officers.fleetSlots}`);
        break;
      case 'defense_loss_reduction':
        bonuses.push(`-${officer.bonus_value}% ${t.officers.defenseLosses}`);
        break;
      case 'mine_bonus':
        bonuses.push(`+${officer.bonus_value}% ${t.officers.mineProduction}`);
        break;
      case 'spy_bonus':
        bonuses.push(`+${officer.bonus_value} ${t.officers.spyLevels}`);
        break;
    }

    if (officer.bonus_secondary_type && officer.bonus_secondary_value) {
      switch (officer.bonus_secondary_type) {
        case 'energy_bonus':
          bonuses.push(`+${officer.bonus_secondary_value}% ${t.officers.energyProduction}`);
          break;
        case 'research_time_reduction':
          bonuses.push(`-${officer.bonus_secondary_value}% ${t.officers.researchTime}`);
          break;
        case 'fleet_speed_bonus':
          bonuses.push(`+${officer.bonus_secondary_value}% ${t.officers.fleetSpeedBonus}`);
          break;
      }
    }

    return bonuses;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-cyber-yellow/30 border-t-cyber-yellow rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <Crown className="w-8 h-8 text-amber-400" />
          {t.officers.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-space-700/50 rounded-lg">
            <Atom className="w-5 h-5 text-fuchsia-400" />
            <span className="text-gray-400">{t.resources.darkMatter}:</span>
            <span className="font-orbitron text-fuchsia-400">{formatNumber(profile?.dark_matter || 0)}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-space-700/50 rounded-lg">
            <Coins className="w-5 h-5 text-cyber-orange" />
            <span className="text-gray-400">TUNG:</span>
            <span className="font-orbitron text-cyber-orange">{formatNumber(Number(profile?.tung_balance) || 0)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-cyber-red/20 border border-cyber-red/50 rounded-lg">
          <AlertCircle className="w-5 h-5 text-cyber-red" />
          <span className="text-cyber-red">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 bg-cyber-green/20 border border-cyber-green/50 rounded-lg">
          <Check className="w-5 h-5 text-cyber-green" />
          <span className="text-cyber-green">{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {officerTypes.map((officer) => {
          const colors = officerColors[officer.code] || officerColors.commander;
          const activeOfficer = getActiveOfficer(officer.id);
          const isActive = !!activeOfficer;
          const duration = selectedDuration[officer.id] || '30d';
          const usdtCost = getUsdtCost(officer, duration);
          const tungCost = tungPriceUsd && tungPriceUsd > 0 ? Math.ceil(usdtCost / tungPriceUsd) : null;
          const canAfford = tungCost != null && (Number(profile?.tung_balance) || 0) >= tungCost;

          return (
            <div
              key={officer.id}
              className={`card-glass overflow-hidden rounded-2xl transition-all ${
                isActive ? `ring-2 ${colors.border.replace('border-', 'ring-')}` : ''
              }`}
            >
              <div className="relative w-full aspect-square bg-gradient-to-br from-space-700 via-space-800 to-space-900 overflow-hidden group">
                {officer.image_url ? (
                  <MediaDisplay
                    src={officer.image_url}
                    alt={translateOfficerName(t, officer.code, officer.name)}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className={colors.text}>
                      {iconMap[officer.icon] ? (
                        <div className="scale-[4] opacity-30">
                          {iconMap[officer.icon]}
                        </div>
                      ) : (
                        <Crown className="w-24 h-24 opacity-30" />
                      )}
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-space-900/90 via-transparent to-transparent" />

                {isActive && (
                  <div className="absolute top-3 right-3 bg-cyber-green/20 backdrop-blur-sm px-3 py-1.5 rounded-full border border-cyber-green/40 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-cyber-green" />
                    <span className="text-cyber-green text-xs font-semibold">{t.officers.contractActive}</span>
                  </div>
                )}

                {isActive && activeOfficer && (
                  <div className="absolute top-3 left-3 bg-space-900/80 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyber-green" />
                    <span className="text-cyber-green text-xs font-medium">
                      {formatTimeRemaining(activeOfficer.expires_at)}
                    </span>
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${colors.bg} ${colors.text}`}>
                      {iconMap[officer.icon] || <Crown className="w-5 h-5" />}
                    </div>
                    <h3 className={`font-orbitron text-lg ${colors.text}`}>{translateOfficerName(t, officer.code, officer.name)}</h3>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <p className="text-sm text-gray-400 line-clamp-2">{translateOfficerDescription(t, officer.code, officer.description)}</p>

                <div className="space-y-1.5">
                  <h4 className="text-xs uppercase text-gray-500 font-semibold">{t.officers.bonuses}</h4>
                  <ul className="space-y-1">
                    {getBonusDescription(officer).map((bonus, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.text.replace('text-', 'bg-')}`} />
                        <span className="text-white">{bonus}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-3 border-t border-space-600 space-y-3">
                  <div className="flex gap-2">
                    {(['7d', '30d', '90d'] as Duration[]).map((d) => (
                      <button
                        key={d}
                        onClick={() =>
                          setSelectedDuration((prev) => ({ ...prev, [officer.id]: d }))
                        }
                        className={`flex-1 py-2 text-sm rounded-lg transition-all ${
                          duration === d
                            ? `${colors.bg} ${colors.text} ${colors.border} border`
                            : 'bg-space-700 text-gray-400 hover:bg-space-600'
                        }`}
                      >
                        {durationLabels[d]}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-lg bg-cyber-orange/10 border border-cyber-orange/40 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-cyber-orange">
                        <Coins className="w-4 h-4" />
                        <span className={`font-orbitron text-sm ${tungCost != null && !canAfford ? 'text-red-400' : ''}`}>
                          {tungCost != null ? `${formatNumber(tungCost)} TUNG` : '—'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">≈ ${usdtCost.toFixed(2)} USDT</span>
                    </div>
                    {tungPriceUsd == null && (
                      <p className="text-[11px] text-gray-500 mt-1">Cargando precio de TUNG…</p>
                    )}
                  </div>

                  <button
                    onClick={() => handlePurchase(officer)}
                    disabled={!canAfford || purchasing === officer.id || isActive}
                    title={isActive ? t.officers.waitForExpiry : undefined}
                    className={`w-full py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                      isActive
                        ? 'bg-space-700/50 text-gray-500 cursor-not-allowed border border-space-600'
                        : canAfford
                        ? `${colors.bg} ${colors.text} hover:opacity-80 ${colors.border} border`
                        : 'bg-space-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {purchasing === officer.id ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                        {t.officers.processing}
                      </>
                    ) : isActive ? (
                      <>
                        <Clock className="w-4 h-4" />
                        {t.officers.contractActive}
                      </>
                    ) : (
                      <>
                        <Crown className="w-4 h-4" />
                        {t.officers.hire}
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setGiftTarget({ officer, duration })}
                    disabled={tungCost == null}
                    className="w-full py-2.5 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 border border-pink-500/50 bg-gradient-to-r from-pink-500/15 to-amber-500/15 text-pink-200 hover:from-pink-500/25 hover:to-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Gift className="w-4 h-4" />
                    Regalar a un amigo
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card-glass p-6">
        <h3 className="font-orbitron text-lg text-white mb-4">{t.officers.aboutOfficers}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-400">
          <div>
            <p className="mb-2">
              {t.officers.aboutDesc1}
            </p>
            <p>
              {t.officers.aboutDesc2}
            </p>
          </div>
          <div>
            <p className="mb-2">
              {t.officers.aboutDesc3}
            </p>
            <p>
              {t.officers.aboutDesc4}
            </p>
          </div>
        </div>
      </div>

      {giftTarget && (
        <GiftItemModal
          open
          onClose={() => setGiftTarget(null)}
          kind="officer"
          code={giftTarget.officer.id}
          itemName={`${translateOfficerName(t, giftTarget.officer.code, giftTarget.officer.name)} · ${durationLabels[giftTarget.duration]}`}
          imageUrl={giftTarget.officer.image_url}
          maxQty={1}
          duration={giftTarget.duration}
          estimateCost={() => {
            const usdt = getUsdtCost(giftTarget.officer, giftTarget.duration);
            return tungPriceUsd && tungPriceUsd > 0 && usdt > 0 ? Math.ceil(usdt / tungPriceUsd) : null;
          }}
          onSuccess={() => {
            fetchTungPrice();
          }}
        />
      )}
    </div>
  );
}
