/**
 * ReferralPage - Pagina del sistema de referidos
 *
 * Sistema de comisiones por referidos:
 * - Cada usuario tiene un codigo de referido unico
 * - Cuando un referido vende en el mercado, el referidor gana comision (configurable por admin)
 * - La comision viene de la tarifa del mercado (no del vendedor)
 * - El enlace de referido es permanente y sin limite
 */

import { useState, useEffect, useCallback } from 'react';
import { Users, Copy, Check, Gift, TrendingUp, Link2, Coins, Gem, Rocket, Droplets, UserPlus, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useAdminStore } from '../../store/adminStore';
import { formatNumber } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';

interface ReferralStats {
  referral_code: string;
  total_referrals: number;
  total_fxu: number;
  total_usdt: number;
  total_metal: number;
  total_crystal: number;
  total_deuterium: number;
}

interface ReferralCommission {
  id: string;
  amount: number;
  commission_type: string;
  resource_type: string;
  created_at: string;
  seller_username: string;
}

interface CommissionByType {
  commission_type: string;
  currency: string;
  resource_type: string | null;
  count: number;
  total: number;
}

interface ReferredUser {
  id: string;
  username: string;
  created_at: string;
}

export function ReferralPage() {
  const { t } = useI18n();
  const { profile } = useAuthStore();
  const { feeSettings, fetchFeeSettings } = useAdminStore();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [commissions, setCommissions] = useState<ReferralCommission[]>([]);
  const [byType, setByType] = useState<CommissionByType[]>([]);
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Aplicar codigo de referido despues del registro (solo una vez)
  const [myReferrer, setMyReferrer] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);

  /**
   * Cargar datos de referidos desde la base de datos
   */
  const loadReferralData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    try {
      const { data: statsData } = await supabase.rpc('get_referral_stats');

      if (statsData?.success) {
        setStats({
          referral_code: statsData.referral_code || '',
          total_referrals: statsData.total_referrals || 0,
          total_fxu: statsData.total_fxu || 0,
          total_usdt: statsData.total_usdt || 0,
          total_metal: statsData.total_metal || 0,
          total_crystal: statsData.total_crystal || 0,
          total_deuterium: statsData.total_deuterium || 0,
        });
        setCommissions(statsData.recent_commissions || []);
        setByType(statsData.by_type || []);
      }

      const { data: referredData } = await supabase
        .from('profiles')
        .select('id, username, created_at')
        .eq('referred_by', profile.id)
        .order('created_at', { ascending: false });

      setReferredUsers(referredData || []);

      // Saber si el jugador ya tiene un referidor asignado
      const { data: meData } = await supabase
        .from('profiles')
        .select('referred_by')
        .eq('id', profile.id)
        .maybeSingle();

      if (meData?.referred_by) {
        const { data: refData } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', meData.referred_by)
          .maybeSingle();
        setMyReferrer(refData?.username || '---');
      } else {
        setMyReferrer(null);
      }
    } catch (err) {
      console.error('Error loading referral data:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (profile) {
      loadReferralData();
      fetchFeeSettings();
    }
  }, [profile, loadReferralData, fetchFeeSettings]);

  /**
   * Copiar enlace de invitacion al portapapeles
   */
  const copyReferralLink = async () => {
    if (!stats?.referral_code) return;
    const link = `${window.location.origin}/register?ref=${stats.referral_code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  /**
   * Copiar codigo de referido al portapapeles
   */
  const copyReferralCode = async () => {
    if (!stats?.referral_code) return;
    try {
      await navigator.clipboard.writeText(stats.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  /**
   * Aplicar un codigo de referido despues del registro.
   * La validacion real (una sola vez, no auto-referirse, no ciclos)
   * la hace la RPC set_user_referral en el servidor.
   */
  const applyReferralCode = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code || applying) return;

    setApplying(true);
    setApplyError(null);

    try {
      const { data, error } = await supabase.rpc('set_user_referral', { p_referral_code: code });

      if (error) {
        setApplyError(t.referral.errorApplying);
        return;
      }

      if (data?.success) {
        setApplySuccess(true);
        setCodeInput('');
        setMyReferrer(data.referrer_username || code);
        await loadReferralData();
      } else {
        setApplyError(data?.error || t.referral.invalidCode);
      }
    } catch (err) {
      console.error('Error applying referral code:', err);
      setApplyError(t.referral.errorApplying);
    } finally {
      setApplying(false);
    }
  };

  const sourceLabel = (type: string) => {
    const map = t.referral.sources as Record<string, string>;
    return map[type] || map.other || type;
  };

  const currencyLabel = (c: CommissionByType) => {
    if (c.currency === 'usdt') return 'USDT';
    if (c.currency === 'resource') {
      return c.resource_type === 'metal' ? t.resources.metal
        : c.resource_type === 'crystal' ? t.resources.crystal
        : c.resource_type === 'deuterium' ? t.resources.deuterium
        : '';
    }
    return 'TUNG';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const hasReferralCode = stats?.referral_code && stats.referral_code.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <Users className="w-8 h-8 text-amber-400" />
          {t.referral.title}
        </h1>
      </div>

      {/* Explicacion del sistema */}
      <div className="card-glass p-6 border-l-4 border-l-amber-500">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-500/20 rounded-xl">
            <Gift className="w-8 h-8 text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-orbitron text-lg text-amber-400 mb-2">{t.referral.howItWorks}</h2>
            <p className="text-gray-400 text-sm mb-3">{t.referral.description}</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="text-gray-300">{t.referral.commissionRate}</span>
              </div>
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-cyber-blue" />
                <span className="text-gray-300">{t.referral.permanent}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">* {t.referral.descriptionNote}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Codigo de referido */}
        <div className="card-glass p-6">
          <h3 className="font-orbitron text-lg text-white mb-4 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-amber-400" />
            {t.referral.yourCode}
          </h3>

          <div className="bg-space-700 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase mb-1">{t.referral.referralCode}</p>
                <p className="font-orbitron text-2xl text-amber-400">
                  {hasReferralCode ? stats.referral_code : '---'}
                </p>
              </div>
              <button
                onClick={copyReferralCode}
                disabled={!hasReferralCode}
                className={`p-3 rounded-lg transition-colors ${
                  hasReferralCode
                    ? 'bg-amber-500/20 hover:bg-amber-500/30'
                    : 'bg-space-600 cursor-not-allowed'
                }`}
                title={t.referral.copyCode}
              >
                {copied ? (
                  <Check className="w-5 h-5 text-cyber-green" />
                ) : (
                  <Copy className={`w-5 h-5 ${hasReferralCode ? 'text-amber-400' : 'text-gray-500'}`} />
                )}
              </button>
            </div>
          </div>

          <button
            onClick={copyReferralLink}
            disabled={!hasReferralCode}
            className={`w-full py-3 border rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
              hasReferralCode
                ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-400'
                : 'bg-space-700 border-space-600 text-gray-500 cursor-not-allowed'
            }`}
          >
            {copiedLink ? (
              <>
                <Check className="w-5 h-5" />
                {t.referral.copied}
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                {t.referral.copyLink}
              </>
            )}
          </button>
        </div>

        {/* Estadisticas */}
        <div className="card-glass p-6">
          <h3 className="font-orbitron text-lg text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyber-green" />
            {t.referral.statistics}
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-space-700 rounded-lg p-4 text-center">
              <p className="text-3xl font-orbitron text-cyber-blue">{stats?.total_referrals || 0}</p>
              <p className="text-xs text-gray-500 mt-1">{t.referral.totalReferred}</p>
            </div>
            <div className="bg-space-700 rounded-lg p-4 text-center">
              <p className="text-3xl font-orbitron text-cyber-green">{feeSettings.referral_commission_percent}%</p>
              <p className="text-xs text-gray-500 mt-1">{t.referral.commission}</p>
            </div>
          </div>

          <div className="bg-space-700 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase mb-3">{t.referral.totalEarned}</p>
            <div className="space-y-2">
              {(stats?.total_fxu || 0) > 0 && (
                <div className="flex items-center gap-3">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-orbitron text-amber-400">
                    {formatNumber(stats.total_fxu)} TUNG
                  </span>
                </div>
              )}
              {(stats?.total_usdt || 0) > 0 && (
                <div className="flex items-center gap-3">
                  <Coins className="w-4 h-4 text-cyber-green" />
                  <span className="text-sm font-orbitron text-cyber-green">
                    {formatNumber(stats.total_usdt)} USDT
                  </span>
                </div>
              )}
              {(stats?.total_metal || 0) > 0 && (
                <div className="flex items-center gap-3">
                  <Gem className="w-4 h-4 text-gray-300" />
                  <span className="text-sm font-orbitron text-gray-300">
                    {formatNumber(stats.total_metal)} {t.resources.metal}
                  </span>
                </div>
              )}
              {(stats?.total_crystal || 0) > 0 && (
                <div className="flex items-center gap-3">
                  <Gem className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-orbitron text-cyan-400">
                    {formatNumber(stats.total_crystal)} {t.resources.crystal}
                  </span>
                </div>
              )}
              {(stats?.total_deuterium || 0) > 0 && (
                <div className="flex items-center gap-3">
                  <Droplets className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-orbitron text-emerald-400">
                    {formatNumber(stats.total_deuterium)} {t.resources.deuterium}
                  </span>
                </div>
              )}
              {!(stats?.total_fxu || 0) && !(stats?.total_usdt || 0) && !(stats?.total_metal || 0) && !(stats?.total_crystal || 0) && !(stats?.total_deuterium || 0) && (
                <div className="flex items-center gap-3">
                  <Coins className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-orbitron text-gray-500">0</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {byType.length > 0 && (
        <div className="card-glass p-6">
          <h3 className="font-orbitron text-lg text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            {t.referral.earningsBySource}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {byType.map((c) => (
              <div
                key={c.commission_type + '_' + c.currency + '_' + (c.resource_type || '')}
                className="flex items-center justify-between p-3 bg-space-700 rounded-lg"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{sourceLabel(c.commission_type)}</p>
                  <p className="text-xs text-gray-500">{c.count}x</p>
                </div>
                <span className={`font-orbitron text-sm whitespace-nowrap ml-2 ${
                  c.currency === 'usdt' ? 'text-cyber-green' : 'text-amber-400'
                }`}>
                  +{formatNumber(c.total)} {currencyLabel(c)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aplicar codigo de referido (solo si aun no tiene referidor) */}
      <div className="card-glass p-6">
        <h3 className="font-orbitron text-lg text-white mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-cyber-blue" />
          {t.referral.haveCode}
        </h3>

        {myReferrer ? (
          <div className="flex items-center gap-3 p-4 bg-space-700 rounded-lg">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-white">
              {t.referral.alreadyReferredBy.replace('{username}', myReferrer)}
            </span>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-4">{t.referral.applyDesc}</p>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value.toUpperCase());
                  setApplyError(null);
                }}
                placeholder={t.referral.enterCode}
                maxLength={32}
                disabled={applying}
                className="flex-1 px-4 py-3 bg-space-700 border border-space-600 rounded-lg text-white font-orbitron tracking-widest uppercase placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-500 focus:outline-none focus:border-cyber-blue disabled:opacity-50"
              />
              <button
                onClick={() => setShowApplyConfirm(true)}
                disabled={applying || codeInput.trim().length === 0}
                className="px-6 py-3 bg-cyber-blue/20 hover:bg-cyber-blue/30 border border-cyber-blue/50 rounded-lg text-cyber-blue font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {t.referral.apply}
              </button>
            </div>

            {applyError && (
              <p className="mt-3 text-sm text-red-400">{applyError}</p>
            )}
          </>
        )}

        {applySuccess && (
          <p className="mt-3 text-sm text-green-400">{t.referral.referralApplied}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jugadores referidos */}
        <div className="card-glass p-6">
          <h3 className="font-orbitron text-lg text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-cyber-blue" />
            {t.referral.referredPlayers}
          </h3>

          {referredUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t.referral.noReferrals}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {referredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 bg-space-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyber-blue/20 flex items-center justify-center">
                      <span className="text-cyber-blue font-semibold text-sm">
                        {user.username?.charAt(0).toUpperCase() || '?'}
                      </span>
                    </div>
                    <span className="text-white">{user.username}</span>
                  </div>
                  <span className="text-xs text-gray-500">{formatDate(user.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comisiones recientes */}
        <div className="card-glass p-6">
          <h3 className="font-orbitron text-lg text-white mb-4 flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-400" />
            {t.referral.recentCommissions}
          </h3>

          {commissions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Gift className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t.referral.noCommissions}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {commissions.map((comm) => {
                const rt = comm.resource_type;
                const isResource = rt === 'metal' || rt === 'crystal' || rt === 'deuterium';
                const isUsdt = rt === 'usdt';
                const resourceLabel = rt === 'metal' ? t.resources.metal
                  : rt === 'crystal' ? t.resources.crystal
                  : rt === 'deuterium' ? t.resources.deuterium
                  : isUsdt ? 'USDT'
                  : 'TUNG';
                const iconColor = rt === 'metal' ? 'text-gray-300'
                  : rt === 'crystal' ? 'text-cyan-400'
                  : rt === 'deuterium' ? 'text-emerald-400'
                  : isUsdt ? 'text-cyber-green'
                  : 'text-amber-400';
                const bgColor = rt === 'metal' ? 'bg-gray-500/20'
                  : rt === 'crystal' ? 'bg-cyan-500/20'
                  : rt === 'deuterium' ? 'bg-emerald-500/20'
                  : isUsdt ? 'bg-cyber-green/20'
                  : 'bg-amber-500/20';
                const CommIcon = rt === 'crystal' ? Gem
                  : rt === 'deuterium' ? Droplets
                  : isResource ? Gem
                  : Coins;
                return (
                  <div
                    key={comm.id}
                    className="flex items-center justify-between p-3 bg-space-700 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${bgColor}`}>
                        <CommIcon className={`w-4 h-4 ${iconColor}`} />
                      </div>
                      <div>
                        <p className="text-white text-sm">{comm.seller_username}</p>
                        <p className="text-xs text-gray-500">{formatDate(comm.created_at)}</p>
                      </div>
                    </div>
                    <span className={`font-orbitron text-sm ${iconColor}`}>
                      +{formatNumber(comm.amount)} {resourceLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirmacion antes de aplicar el codigo (accion irreversible) */}
      {showApplyConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md card-glass p-6 border border-amber-500/40">
            <h3 className="font-orbitron text-lg text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              {t.referral.applyConfirmTitle}
            </h3>

            <p className="text-sm text-gray-300 mb-3">
              {t.referral.applyConfirmBody.replace('{username}', codeInput.trim().toUpperCase())}
            </p>

            <p className="text-sm text-red-400 mb-6">{t.referral.applyConfirmWarn}</p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowApplyConfirm(false)}
                className="flex-1 px-4 py-3 bg-space-700 hover:bg-space-600 border border-space-600 rounded-lg text-gray-300 font-semibold transition-colors"
              >
                {t.referral.applyConfirmCancel}
              </button>
              <button
                onClick={() => {
                  setShowApplyConfirm(false);
                  applyReferralCode();
                }}
                disabled={applying}
                className="flex-1 px-4 py-3 bg-cyber-blue/20 hover:bg-cyber-blue/30 border border-cyber-blue/50 rounded-lg text-cyber-blue font-semibold transition-colors disabled:opacity-40"
              >
                {t.referral.applyConfirmOk}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
