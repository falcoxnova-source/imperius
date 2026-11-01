import { useState, useEffect, useCallback } from 'react';
import { Star, CheckCircle, AlertTriangle, Loader2, Crown, Zap, Shield, Percent, TrendingUp, Clock, Rocket, ShoppingCart, Users, Globe, Gift, User, Mail } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';

interface PlusPlan {
  id: number;
  name: string;
  code: string;
  duration_months: number;
  duration_days: number | null;
  price_fxu: number;
  price_usdt: number;
  commission_share_percent: number;
}

interface PlusStatus {
  is_plus: boolean;
  plan_name?: string;
  expires_at?: string;
  commission_share?: number;
  total_earned?: number;
}

export function VipPage() {
  const [plans, setPlans] = useState<PlusPlan[]>([]);
  const [plusStatus, setPlusStatus] = useState<PlusStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // [VIPGIFT1] Regalar VIP a un amigo
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftUsername, setGiftUsername] = useState('');
  const [giftPlan, setGiftPlan] = useState<string>('');
  const [giftConfirm, setGiftConfirm] = useState(false);
  const [gifting, setGifting] = useState(false);
  const [giftMessage, setGiftMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { profile, refreshProfile } = useAuthStore();
  const { t, language } = useI18n();

  const fxuBalance = profile?.tung_balance || 0;

  // Precio de mercado en vivo de TUNG (DexScreener), obtenido del servidor via RPC
  const [tungPriceUsd, setTungPriceUsd] = useState<number | null>(null);
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
  // TUNG a cobrar = precio en USDT / precio en vivo (redondeado hacia arriba)
  const tungCostFor = (plan: PlusPlan): number | null =>
    tungPriceUsd && tungPriceUsd > 0 ? Math.ceil(plan.price_usdt / tungPriceUsd) : null;

  const loadData = useCallback(async () => {
    try {
      const [plansRes, statusRes] = await Promise.all([
        supabase.from('plus_plans').select('*').eq('is_active', true).order('duration_months'),
        supabase.rpc('get_plus_status')
      ]);

      // [VIPITEM1] plan semanal retirado (tambien desactivado en BD)
      if (plansRes.data) setPlans((plansRes.data as PlusPlan[]).filter(p => p.code !== 'plus_weekly'));
      if (statusRes.data) setPlusStatus(statusRes.data as PlusStatus);
    } catch {
      console.error('Error loading Plus data');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    fetchTungPrice();
  }, [loadData, fetchTungPrice]);

  const handlePurchase = async (planCode: string) => {
    setPurchasing(`${planCode}-fxu`);
    setMessage(null);

    // Refrescar el precio en vivo justo antes de cobrar (el servidor valida el precio)
    await fetchTungPrice();

    const { data, error } = await supabase.rpc('purchase_plus_subscription', {
      p_plan_code: planCode,
      p_payment_type: 'fxu'
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data?.success) {
      setMessage({ type: 'success', text: data.message });
      loadData();
      refreshProfile();
    } else {
      setMessage({ type: 'error', text: data?.error || t.wallet.unknownError });
    }

    setPurchasing(null);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleGift = async () => {
    if (gifting) return;
    setGifting(true);
    setGiftMessage(null);
    await fetchTungPrice();

    const { data, error } = await supabase.rpc('gift_plus_subscription', {
      p_recipient_username: giftUsername.trim(),
      p_plan_code: giftPlan
    });

    if (error) {
      setGiftMessage({ type: 'error', text: error.message });
    } else if (data?.success) {
      setGiftMessage({ type: 'success', text: data.message });
      setGiftUsername('');
      refreshProfile();
    } else {
      setGiftMessage({ type: 'error', text: data?.error || t.wallet.unknownError });
    }
    setGiftConfirm(false);
    setGifting(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center px-1">
        <div className="inline-flex items-center gap-2 sm:gap-3 mb-2">
          <Star className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-400 flex-shrink-0" />
          <h1 className="font-orbitron text-2xl sm:text-3xl text-white">VIP Plus</h1>
          <Star className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-400 flex-shrink-0" />
        </div>
        <p className="text-sm sm:text-base text-gray-400">{t.wallet.plusSubscriptionDesc}</p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-3 sm:p-4 rounded-lg ${message.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700/50' : 'bg-red-900/30 border border-red-700/50'}`}>
          <div className="flex items-start gap-2">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            )}
            <span className={`min-w-0 break-words ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
              {message.text}
            </span>
          </div>
        </div>
      )}

      {/* Active subscription banner */}
      {plusStatus?.is_plus && (
        <div className="card-glass p-4 sm:p-6 border-yellow-500/30 bg-gradient-to-r from-yellow-900/20 via-space-800 to-yellow-900/20">
          <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="p-3 sm:p-4 flex-shrink-0 bg-gradient-to-br from-yellow-500/20 to-amber-600/20 rounded-xl border border-yellow-500/30 animate-pulse">
              <Crown className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-400" />
            </div>
            <div className="min-w-0">
              <h2 className="font-orbitron text-lg sm:text-xl text-yellow-400 break-words">{t.wallet.plusSubscriptionActive}</h2>
              <p className="text-sm sm:text-base text-gray-400 break-words">{t.wallet.plan} {plusStatus.plan_name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-space-700/50 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">{t.wallet.expires}</p>
              <p className="font-orbitron text-lg text-white">
                {plusStatus.expires_at ? formatDate(plusStatus.expires_at) : 'N/A'}
              </p>
            </div>
            <div className="bg-space-700/50 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">{t.wallet.totalEarned}</p>
              <p className="font-orbitron text-lg text-emerald-400">
                {plusStatus.total_earned?.toLocaleString() || 0} TUNG
              </p>
            </div>
          </div>
        </div>
      )}

      {/* [VIPGIFT1] Regalar VIP */}
      {(() => {
        const es = language === 'es';
        const selPlan = plans.find(p => p.code === giftPlan) || null;
        const selCost = selPlan ? tungCostFor(selPlan) : null;
        const insufficient = selCost != null && fxuBalance < selCost;
        const canSubmit = !!selPlan && giftUsername.trim().length > 0 && selCost != null && !insufficient && !gifting;
        const hintBox = 'flex items-center gap-1.5 rounded-md border border-pink-500/30 bg-space-900/50 px-2 py-1.5 text-xs leading-tight text-gray-300';
        return (
          <div className="relative overflow-hidden rounded-xl border border-pink-500/40 bg-gradient-to-r from-pink-900/30 via-fuchsia-900/20 to-yellow-900/30 p-4 sm:p-5 shadow-lg shadow-pink-500/10">
            <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-pink-500/20 blur-2xl" />
            <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:contents">
                <div className="p-2.5 sm:p-3 flex-shrink-0 rounded-xl bg-gradient-to-br from-pink-500/30 to-yellow-500/20 border border-pink-400/40 sm:self-start motion-safe:animate-bounce">
                  <Gift className="w-7 h-7 sm:w-8 sm:h-8 text-pink-300" />
                </div>
                <h2 className="font-orbitron text-base text-white sm:hidden">
                  {es ? '🎁 ¡Regala VIP a un amigo!' : '🎁 Gift VIP to a friend!'}
                </h2>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="hidden sm:block font-orbitron text-lg text-white">
                  {es ? '🎁 ¡Regala VIP a un amigo!' : '🎁 Gift VIP to a friend!'}
                </h2>
                <p className="text-sm text-gray-300">
                  {es
                    ? 'Tú pagas y tu amigo recibe el VIP al instante. Puedes regalar todos los que quieras.'
                    : 'You pay and your friend gets VIP instantly. Gift as many as you like.'}
                </p>
              </div>
              {!giftOpen && (
                <button
                  onClick={() => { setGiftOpen(true); setGiftMessage(null); if (!giftPlan && plans[0]) setGiftPlan(plans[0].code); }}
                  className="w-full sm:w-auto shrink-0 px-5 py-2.5 rounded-lg font-semibold text-black bg-gradient-to-r from-pink-400 to-yellow-400 hover:from-pink-300 hover:to-yellow-300 transition-colors"
                >
                  {es ? 'Regalar VIP' : 'Gift VIP'}
                </button>
              )}
            </div>

            {giftOpen && (
              <div className="relative mt-4 sm:mt-5 space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    {es ? '¿A quién se lo regalas?' : 'Who is it for?'}
                  </label>
                  <div className="mb-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <div className={hintBox}>
                      <User className="w-3.5 h-3.5 shrink-0 text-pink-300" />
                      <span>{es ? <>Su <b className="text-white">nombre de usuario</b> del juego</> : <>Their in-game <b className="text-white">username</b></>}</span>
                    </div>
                    <div className={hintBox}>
                      <Mail className="w-3.5 h-3.5 shrink-0 text-pink-300" />
                      <span>{es ? <>o el <b className="text-white">correo (Gmail)</b> con el que se registró</> : <>or the <b className="text-white">email (Gmail)</b> they signed up with</>}</span>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={giftUsername}
                    maxLength={254}
                    onChange={(e) => { setGiftUsername(e.target.value); setGiftConfirm(false); }}
                    placeholder={es ? 'Ej: Comandante123 o amigo@gmail.com' : 'e.g. Commander123 or friend@gmail.com'}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full px-3 py-2.5 sm:py-2 rounded-lg bg-space-800 border border-space-600 text-base sm:text-sm text-white focus:border-pink-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {plans.map((plan) => {
                    const cost = tungCostFor(plan);
                    const active = plan.code === giftPlan;
                    return (
                      <button
                        key={plan.id}
                        onClick={() => { setGiftPlan(plan.code); setGiftConfirm(false); }}
                        className={`p-3 rounded-lg border text-left transition-colors flex items-center justify-between gap-2 sm:block ${active ? 'border-pink-400 bg-pink-500/15' : 'border-space-600 bg-space-800/60 hover:border-pink-400/50'}`}
                      >
                        <div className="text-white font-medium text-sm min-w-0 break-words">{plan.name}</div>
                        <div className="text-right sm:text-left flex-shrink-0">
                          <div className="text-xs text-cyber-blue">{cost != null ? `${cost.toLocaleString()} TUNG` : '…'}</div>
                          <div className="text-xs text-emerald-400">= ${plan.price_usdt} USDT</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-gray-400">
                  <span>{es ? 'Tu saldo' : 'Your balance'}: {Number(fxuBalance).toLocaleString()} TUNG</span>
                  {insufficient && <span className="text-red-400">{t.wallet.insufficient}</span>}
                </div>

                {giftMessage && (
                  <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${giftMessage.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300' : 'bg-red-900/30 border border-red-700/50 text-red-300'}`}>
                    {giftMessage.type === 'success' ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span className="min-w-0 break-words">{giftMessage.text}</span>
                  </div>
                )}

                {!giftConfirm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setGiftMessage(null); setGiftConfirm(true); }}
                      disabled={!canSubmit}
                      className="flex-1 py-2.5 rounded-lg font-semibold text-black bg-gradient-to-r from-pink-400 to-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {es ? 'Continuar' : 'Continue'}
                    </button>
                    <button
                      onClick={() => { setGiftOpen(false); setGiftConfirm(false); }}
                      className="px-4 py-2.5 rounded-lg border border-space-600 text-gray-300 hover:bg-space-700"
                    >
                      {es ? 'Cerrar' : 'Close'}
                    </button>
                  </div>
                ) : (
                  <div className="p-3 sm:p-4 rounded-lg border border-yellow-500/40 bg-yellow-900/20 space-y-3">
                    <p className="text-sm text-yellow-100 break-words">
                      {es
                        ? <>¿Regalar <b>{selPlan?.name}</b> a <b>{giftUsername.trim()}</b> por <b>{selCost?.toLocaleString()} TUNG</b>? Este pago no se puede deshacer.</>
                        : <>Gift <b>{selPlan?.name}</b> to <b>{giftUsername.trim()}</b> for <b>{selCost?.toLocaleString()} TUNG</b>? This payment cannot be undone.</>}
                    </p>
                    <div className="flex flex-col-reverse min-[360px]:flex-row gap-2">
                      <button
                        onClick={handleGift}
                        disabled={gifting}
                        className="flex-1 py-2.5 rounded-lg font-semibold text-black bg-gradient-to-r from-pink-400 to-yellow-400 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {gifting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                        {es ? 'Sí, regalar' : 'Yes, gift it'}
                      </button>
                      <button
                        onClick={() => setGiftConfirm(false)}
                        disabled={gifting}
                        className="px-4 py-2.5 rounded-lg border border-space-600 text-gray-300 hover:bg-space-700"
                      >
                        {es ? 'Cancelar' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Benefits grid */}
      <div className="card-glass p-4 sm:p-6">
        <h2 className="font-orbitron text-base sm:text-lg text-white mb-3 sm:mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          {t.wallet.plusBenefitsTitle}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
          {[
            { icon: Percent, text: t.wallet.plusBenefit1, color: 'text-cyber-blue' },
            { icon: Zap, text: t.wallet.plusBenefit2, color: 'text-emerald-400' },
            { icon: Shield, text: t.wallet.plusBenefit3, color: 'text-purple-400' },
            { icon: Star, text: t.wallet.plusBenefit4, color: 'text-orange-400' },
            { icon: Zap, text: t.wallet.plusBenefit7, color: 'text-blue-400' },
            { icon: TrendingUp, text: t.wallet.plusBenefit8, color: 'text-green-400' },
            { icon: Clock, text: t.wallet.plusBenefit9, color: 'text-yellow-400' },
            { icon: Clock, text: t.wallet.plusBenefit10, color: 'text-violet-400' },
            { icon: Rocket, text: t.wallet.plusBenefit11, color: 'text-sky-400' },
            { icon: ShoppingCart, text: t.wallet.plusBenefit12, color: 'text-amber-400' },
            { icon: Zap, text: t.wallet.plusBenefit13, color: 'text-red-400' },
            { icon: Users, text: t.wallet.plusBenefit14, color: 'text-teal-400' },
            { icon: Globe, text: t.wallet.plusBenefit15, color: 'text-indigo-400' },
            { icon: Crown, text: t.wallet.plusBenefit16, color: 'text-fuchsia-400' },
          ].map((benefit, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-space-700/30 rounded-lg border border-space-600/50">
              <benefit.icon className={`w-5 h-5 ${benefit.color} flex-shrink-0 mt-0.5`} />
              <span className="text-sm text-gray-300">{benefit.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Plans */}
      {!plusStatus?.is_plus && (
        <div>
          <h2 className="font-orbitron text-lg text-white mb-4 text-center">
            {language === 'es' ? 'Elige tu plan' : 'Choose your plan'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-4 pt-2">
            {plans.map((plan) => {
              const isPopular = plan.code === 'plus_6months';
              return (
                <div
                  key={plan.id}
                  className={`relative bg-gradient-to-br from-space-700/80 to-space-800/80 border rounded-xl p-4 sm:p-5 transition-all md:hover:scale-[1.02] ${
                    isPopular
                      ? 'border-yellow-500/50 shadow-lg shadow-yellow-500/10'
                      : 'border-space-600 hover:border-yellow-500/30'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                      {language === 'es' ? '⭐ POPULAR' : '⭐ POPULAR'}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-4 mt-1">
                    <Star className={`w-5 h-5 flex-shrink-0 ${isPopular ? 'text-yellow-400' : 'text-gray-400'}`} />
                    <h3 className="font-orbitron text-base lg:text-lg text-white min-w-0 break-words">{plan.name}</h3>
                  </div>

                  <div className="space-y-2 mb-5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t.wallet.duration}</span>
                      <span className="text-white font-medium">
                        {plan.duration_days && plan.duration_days > 0
                          ? `${plan.duration_days} ${t.wallet.days}`
                          : `${plan.duration_months} ${plan.duration_months === 1 ? t.wallet.month : t.wallet.months}`
                        }
                      </span>
                    </div>
                    {plan.duration_months > 1 && !plan.duration_days && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">{language === 'es' ? 'Precio/mes' : 'Price/mo'}</span>
                        <span className="text-emerald-400 font-medium">
                          ${(plan.price_usdt / plan.duration_months).toFixed(2)} USDT
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-space-600 pt-4 space-y-2">
                    {(() => {
                      const tungCost = tungCostFor(plan);
                      const insufficient = tungCost != null && fxuBalance < tungCost;
                      return (
                        <button
                          onClick={() => handlePurchase(plan.code)}
                          disabled={purchasing !== null || tungCost == null || insufficient}
                          className="w-full py-2.5 px-4 bg-cyber-blue/20 hover:bg-cyber-blue/30 text-cyber-blue border border-cyber-blue/50 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-0.5"
                        >
                          {purchasing === `${plan.code}-fxu` ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <span>{tungCost != null ? `${tungCost.toLocaleString()} TUNG` : (language === 'es' ? 'Cargando precio…' : 'Loading price…')}</span>
                              <span className="text-xs text-emerald-400">= ${plan.price_usdt} USDT</span>
                              {insufficient && <span className="text-xs text-red-400">({t.wallet.insufficient})</span>}
                            </>
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pool info */}
      <div className="card-glass p-4">
        <p className="text-sm text-yellow-300/80">
          💡 {t.wallet.plusPoolInfo}
        </p>
      </div>
    </div>
  );
}
