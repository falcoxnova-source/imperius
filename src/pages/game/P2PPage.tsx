import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle, AlertTriangle, Info, Star, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../lib/i18n';
import { P2POrderChat } from '../../components/p2p/P2POrderChat';
import { P2PRateModal } from '../../components/p2p/P2PRateModal';
import { P2PSellerRating } from '../../components/p2p/P2PSellerRating';
import { P2POpenDisputeModal } from '../../components/p2p/P2POpenDisputeModal';

type P2PAsset = 'TUNG' | 'USDT';
type OfferSide = 'sell' | 'buy';
type FiatCurrency = string; // Cualquier ISO 4217 + TUNG/USDT/CUP/MLC

// El token del juego se muestra como "TUNG". Internamente el P2P lo almacena
// como 'FXU' (columna fxu_balance, espejada 1:1 con tung_balance por trigger).
// Estas ayudas traducen el código interno a la marca visible al leer datos.
const brandAsset = (a: string): P2PAsset =>
  (String(a || '').toUpperCase() === 'FXU' ? 'TUNG' : (String(a || '').toUpperCase() as P2PAsset));
const brandFiat = (f: string): string =>
  (String(f || '').toUpperCase() === 'FXU' ? 'TUNG' : f);

interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  currency_code: string;
  is_enabled: boolean;
}

interface P2POffer {
  id: string;
  user_id: string;
  side: 'sell' | 'buy';
  asset: P2PAsset;
  fiat_currency: string;
  price_per_unit: number;
  available_amount: number;
  min_trade_amount: number;
  max_trade_amount: number | null;
  payment_method_ids: number[];
  time_limit_minutes: number;
  status: string;
  expires_at?: string;
  created_at: string;
  seller_name?: string;
}

interface P2POrder {
  id: string;
  offer_id: string;
  seller_id: string;
  buyer_id: string;
  asset: P2PAsset;
  asset_amount: number;
  fiat_currency: string;
  fiat_amount: number;
  status: 'pending_payment' | 'paid' | 'released' | 'cancelled' | 'expired' | 'disputed' | 'resolved';
  payment_deadline: string;
  paid_at?: string | null;
  created_at: string;
}

export function P2PPage() {
  const { t } = useI18n();
  const { profile, refreshProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [offers, setOffers] = useState<P2POffer[]>([]);
  const [myOffers, setMyOffers] = useState<P2POffer[]>([]);
  const [orders, setOrders] = useState<P2POrder[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [createSide, setCreateSide] = useState<OfferSide>('sell');
  const [bookSide, setBookSide] = useState<OfferSide>('sell');
  const [asset, setAsset] = useState<P2PAsset>('TUNG');
  const [fiatCurrency, setFiatCurrency] = useState<FiatCurrency>('USDT');
  const [price, setPrice] = useState<string>('1');
  const [amount, setAmount] = useState<string>('100');
  const [minAmount, setMinAmount] = useState<string>('10');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [selectedMethodIds, setSelectedMethodIds] = useState<number[]>([]);
  const [currencySearch, setCurrencySearch] = useState<string>('');
  const [currencyOpen, setCurrencyOpen] = useState<boolean>(false);

  // Fee P2P (configurable en game_settings: p2p_fee_percent)
  const [feePercent, setFeePercent] = useState<number>(1);
  // Cooldown de disputa tras marcar pagada (configurable: p2p_dispute_cooldown_minutes)
  const [disputeCooldownMin, setDisputeCooldownMin] = useState<number>(2);

  // Pestañas para compactar la vista (Ofertas activas / Mis ofertas / Mis órdenes)
  const [activeTab, setActiveTab] = useState<'book' | 'mine' | 'orders'>('book');

  // Ordenación del libro de ofertas
  const [bookSort, setBookSort] = useState<'default' | 'rating' | 'price_asc' | 'price_desc' | 'orders'>('default');
  const [minStars, setMinStars] = useState<number>(0);

  // Paginación de Mis órdenes
  const ORDERS_PAGE_SIZE = 5;
  const [ordersPage, setOrdersPage] = useState<number>(1);

  // Reputación P2P de vendedores (Fase 5)
  interface ReputationEntry {
    total_orders: number;
    completed_orders: number;
    success_rate: number;
    rating_avg: number;
    rating_count: number;
    is_banned: boolean;
  }
  const [reputations, setReputations] = useState<Record<string, ReputationEntry>>({});
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [openChats, setOpenChats] = useState<Record<string, boolean>>({});
  const [ratedOrders, setRatedOrders] = useState<Set<string>>(new Set());
  const [rateOrder, setRateOrder] = useState<{ id: string; name: string } | null>(null);
  // Confirmación previa a liberar el escrow (acción irreversible)
  const [confirmRelease, setConfirmRelease] = useState<P2POrder | null>(null);
  const [disputeOrder, setDisputeOrder] = useState<P2POrder | null>(null);

  // Estado KYC del usuario. Para PARTICIPAR en el P2P (crear ofertas de venta
  // o compra, y tambien comprar/vender tomando ofertas) se exige KYC aprobado.
  // Ver el libro de ofertas es libre para todos.
  const [kycStatus, setKycStatus] = useState<string>('none');
  const isKycApproved = kycStatus === 'approved';

  const isInternalFiat = useMemo(() => ['TUNG', 'USDT'].includes((fiatCurrency || '').toUpperCase()), [fiatCurrency]);

  // IDs de ofertas mías con órdenes activas (pending_payment / paid / disputed).
  // Si un comprador ya interactuó con la oferta, no se puede cancelar.
  const offersWithOpenOrders = useMemo(() => {
    const openStatuses = new Set(['pending_payment', 'paid', 'disputed']);
    const set = new Set<string>();
    orders.forEach((o) => {
      if (openStatuses.has(o.status)) set.add(o.offer_id);
    });
    return set;
  }, [orders]);

  const balance = useMemo(() => {
    if (!profile) return 0;
    const lockCurrency = createSide === 'sell'
      ? asset
      : (isInternalFiat ? fiatCurrency : '');
    if (lockCurrency === 'TUNG') return Number(profile.tung_balance || 0);
    if (lockCurrency === 'USDT') return Number(profile.usdt_balance || 0);
    return 0;
  }, [profile, asset, fiatCurrency, createSide, isInternalFiat]);

  // Cada opción del selector es, o bien un activo interno (TUNG/USDT),
  // o bien un método de pago concreto (Saldo Móvil, Tarjeta Clásica, MLC,
  // Transferencia CUP, Pago / Transferencia EUR…) con su moneda asociada.
  type CurrencyOption = {
    key: string;           // id único de la opción (ej: 'TUNG', 'USDT', 'm:cu_saldomovil')
    label: string;         // texto visible (ej: 'Saldo Móvil (CUP)')
    currency: string;      // moneda ISO que acaba en fiat_currency (ej: 'CUP')
    methodId?: number;     // si aplica, el id del p2p_payment_method a auto-seleccionar
    isInternal: boolean;
  };

  const currencyOptions = useMemo<CurrencyOption[]>(() => {
    const opts: CurrencyOption[] = [];
    paymentMethods.forEach((m) => {
      const cur = (m.currency_code || '').toUpperCase();
      // Excluir activos internos (TUNG/USDT/FXU) del listado de fiat externa.
      if (!cur || cur === 'TUNG' || cur === 'USDT' || cur === 'FXU') return;
      opts.push({
        key: `m:${m.code}`,
        label: `${m.name} (${cur})`,
        currency: cur,
        methodId: m.id,
        isInternal: false,
      });
    });
    return opts;
  }, [paymentMethods]);

  // Opciones internas (TUNG/USDT) tomadas de p2p_payment_methods
  const internalOptions = useMemo<CurrencyOption[]>(() => {
    const opts: CurrencyOption[] = [];
    paymentMethods.forEach((m) => {
      const cur = (m.currency_code || '').toUpperCase();
      if (cur !== 'TUNG' && cur !== 'USDT' && cur !== 'FXU') return;
      // El saldo interno FXU se muestra como TUNG (misma moneda del juego).
      const displayCur = cur === 'FXU' ? 'TUNG' : cur;
      opts.push({
        key: `m:${m.code}`,
        label: `${m.name.replace(/FXU/gi, 'TUNG')} (${displayCur})`,
        currency: cur,
        methodId: m.id,
        isInternal: true,
      });
    });
    return opts;
  }, [paymentMethods]);

  // SELL y BUY: mostrar todas las monedas/métodos habilitados.
  // En BUY evitamos moneda igual al asset (ej: comprar TUNG pagando TUNG).
  const selectableOptions = useMemo<CurrencyOption[]>(() => {
    if (createSide === 'buy') {
      // Evitar pagar el mismo activo (p.ej. comprar TUNG pagando TUNG/FXU) y
      // pagar con la otra cripto interna: p2p_create_offer rechaza TUNG<->USDT
      // (son monedas separadas).
      return [...internalOptions, ...currencyOptions].filter((o) => {
        const cur = brandFiat(o.currency).toUpperCase();
        if (cur === asset) return false;
        return !(o.isInternal && (cur === 'TUNG' || cur === 'USDT'));
      });
    }
    return currencyOptions;
  }, [createSide, asset, internalOptions, currencyOptions]);

  const filteredOptions = useMemo(() => {
    const q = currencySearch.trim().toUpperCase();
    if (!q) return selectableOptions;
    return selectableOptions.filter(
      (o) => o.label.toUpperCase().includes(q) || o.currency.includes(q) || o.key.toUpperCase().includes(q)
    );
  }, [selectableOptions, currencySearch]);

  // Libro de ofertas ordenado/filtrado por reputación + precio
  const sortedOffers = useMemo(() => {
    const list = offers.filter((o) => {
      if (minStars <= 0) return true;
      const rep = reputations[o.user_id];
      const avg = rep?.rating_avg ?? 0;
      return avg >= minStars;
    });
    const arr = [...list];
    switch (bookSort) {
      case 'rating':
        arr.sort((a, b) => {
          const ra = reputations[a.user_id];
          const rb = reputations[b.user_id];
          const avgA = ra?.rating_avg ?? 0;
          const avgB = rb?.rating_avg ?? 0;
          if (avgB !== avgA) return avgB - avgA;
          // desempate: cantidad de valoraciones
          const cntA = ra?.rating_count ?? 0;
          const cntB = rb?.rating_count ?? 0;
          if (cntB !== cntA) return cntB - cntA;
          // 2º desempate: total_orders completadas
          return (rb?.total_orders ?? 0) - (ra?.total_orders ?? 0);
        });
        break;
      case 'orders':
        arr.sort((a, b) => (reputations[b.user_id]?.total_orders ?? 0) - (reputations[a.user_id]?.total_orders ?? 0));
        break;
      case 'price_asc':
        arr.sort((a, b) => Number(a.price_per_unit) - Number(b.price_per_unit));
        break;
      case 'price_desc':
        arr.sort((a, b) => Number(b.price_per_unit) - Number(a.price_per_unit));
        break;
      default:
        // por defecto: orden del servidor (created_at desc)
        break;
    }
    return arr;
  }, [offers, reputations, bookSort, minStars]);

  const [selectedOptionKey, setSelectedOptionKey] = useState<string>('');
  const selectedOption = useMemo(
    () => selectableOptions.find((o) => o.key === selectedOptionKey) || selectableOptions[0],
    [selectableOptions, selectedOptionKey]
  );

  // Si la opción actual no existe en la lista vigente (ej. al cambiar SELL↔BUY
  // o al cambiar el activo), resetea a la primera disponible.
  useEffect(() => {
    if (!selectableOptions.length) return;
    if (!selectableOptions.find((o) => o.key === selectedOptionKey)) {
      setSelectedOptionKey(selectableOptions[0].key);
    }
  }, [selectableOptions, selectedOptionKey]);

  // Sincroniza fiat_currency y método seleccionado con la opción elegida (SELL y BUY)
  useEffect(() => {
    if (!selectedOption) return;
    setFiatCurrency(selectedOption.currency);
    if (selectedOption.methodId !== undefined) {
      setSelectedMethodIds([selectedOption.methodId]);
    }
  }, [selectedOption]);

  const visiblePaymentMethods = useMemo(
    () => paymentMethods.filter((m) => m.currency_code?.toUpperCase() === fiatCurrency),
    [paymentMethods, fiatCurrency]
  );

  const showError = (text: string) => setMessage({ type: 'error', text });
  const showSuccess = (text: string) => setMessage({ type: 'success', text });

  // El aviso se renderiza encima del formulario: en móvil queda fuera de
  // pantalla al pulsar "Publicar". Lo traemos a la vista para que el usuario
  // vea siempre por qué no se pudo crear la oferta.
  const messageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (message) messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [message]);
  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return fallback;
  };

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setMessage(null);

    try {
      await supabase.rpc('p2p_expire_stale_offers');

      const [pmRes, offersRes, myOffersRes, ordersRes, feeRes, cooldownRes, kycRes] = await Promise.all([
        supabase
          .from('p2p_payment_methods')
          .select('id, code, name, currency_code, is_enabled')
          .eq('is_enabled', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('p2p_offers')
          .select('id, user_id, side, asset, fiat_currency, price_per_unit, available_amount, min_trade_amount, max_trade_amount, payment_method_ids, time_limit_minutes, status, expires_at, created_at')
          .eq('status', 'active')
          .eq('side', bookSide)
          .gt('available_amount', 0)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('p2p_offers')
          .select('id, user_id, side, asset, fiat_currency, price_per_unit, available_amount, min_trade_amount, max_trade_amount, payment_method_ids, time_limit_minutes, status, expires_at, created_at')
          .eq('user_id', profile.id)
          .in('status', ['active', 'paused', 'cancelled', 'completed', 'expired'])
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('p2p_orders')
          .select('id, offer_id, seller_id, buyer_id, asset, asset_amount, fiat_currency, fiat_amount, status, payment_deadline, paid_at, created_at')
          .or(`buyer_id.eq.${profile.id},seller_id.eq.${profile.id}`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('game_settings')
          .select('value')
          .eq('key', 'p2p_fee_percent')
          .maybeSingle(),
        supabase
          .from('game_settings')
          .select('value')
          .eq('key', 'p2p_dispute_cooldown_minutes')
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('kyc_status')
          .eq('id', profile.id)
          .maybeSingle(),
      ]);

      if (kycRes && !kycRes.error) {
        setKycStatus(((kycRes.data as { kyc_status?: string } | null)?.kyc_status) || 'none');
      }

      if (feeRes && !feeRes.error && feeRes.data?.value != null) {
        const v = Number(feeRes.data.value);
        if (Number.isFinite(v) && v >= 0) setFeePercent(v);
      }
      if (cooldownRes && !cooldownRes.error && cooldownRes.data?.value != null) {
        const v = Number(cooldownRes.data.value);
        if (Number.isFinite(v) && v >= 0) setDisputeCooldownMin(v);
      }

      if (pmRes.error) throw pmRes.error;
      if (offersRes.error) throw offersRes.error;
      if (myOffersRes.error) throw myOffersRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const methods = (pmRes.data || []) as PaymentMethod[];
      setPaymentMethods(methods);
      if (!selectedMethodIds.length && methods.length) {
        const firstForFiat = methods.find((m) => (m.currency_code || '').toUpperCase() === fiatCurrency);
        setSelectedMethodIds(firstForFiat ? [firstForFiat.id] : []);
      }

      const rawOffers = (offersRes.data || []) as P2POffer[];
      const sellerIds = [...new Set(rawOffers.map((o) => o.user_id))];
      let nameMap: Record<string, string> = {};

      if (sellerIds.length) {
        const profRes = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', sellerIds);
        if (!profRes.error) {
          nameMap = Object.fromEntries((profRes.data || []).map((p) => [p.id as string, p.username as string]));
        }
      }

      setOffers(rawOffers.map((o) => ({ ...o, asset: brandAsset(o.asset), fiat_currency: brandFiat(o.fiat_currency), seller_name: nameMap[o.user_id] || t.p2p.unknownSeller })));
      setMyOffers(((myOffersRes.data || []) as P2POffer[]).map((o) => ({ ...o, asset: brandAsset(o.asset), fiat_currency: brandFiat(o.fiat_currency), seller_name: profile.username || t.p2p.youSeller })));
      setOrders(((ordersRes.data || []) as P2POrder[]).map((o) => ({ ...o, asset: brandAsset(o.asset), fiat_currency: brandFiat(o.fiat_currency) })));

      // Órdenes ya calificadas por mí (Fase 9)
      try {
        const rRes = await supabase
          .from('p2p_ratings')
          .select('order_id')
          .eq('rater_id', profile.id);
        if (!rRes.error && Array.isArray(rRes.data)) {
          setRatedOrders(new Set((rRes.data as Array<{ order_id: string }>).map((r) => r.order_id)));
        }
      } catch { /* no crítico */ }

      // Cargar reputación de los vendedores visibles (Fase 5)
      if (sellerIds.length) {
        try {
          const repRes = await supabase.rpc('get_p2p_reputations_for_users', { p_user_ids: sellerIds });
          if (!repRes.error && Array.isArray(repRes.data)) {
            const map: Record<string, ReputationEntry> = {};
            (repRes.data as Array<{ user_id: string; total_orders: number; completed_orders: number; success_rate: number; rating_avg?: number; rating_count?: number; is_banned: boolean }>).forEach((r) => {
              map[r.user_id] = {
                total_orders: Number(r.total_orders || 0),
                completed_orders: Number(r.completed_orders || 0),
                success_rate: Number(r.success_rate || 0),
                rating_avg: Number(r.rating_avg || 0),
                rating_count: Number(r.rating_count || 0),
                is_banned: !!r.is_banned,
              };
            });
            setReputations(map);
          }
        } catch { /* reputación opcional, no romper la carga */ }
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : t.p2p.errLoadData);
    } finally {
      setLoading(false);
    }
  }, [profile, selectedMethodIds.length, bookSide, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setSelectedMethodIds((prev) => {
      const allowed = new Set(visiblePaymentMethods.map((m) => m.id));
      return prev.filter((id) => allowed.has(id));
    });
  }, [visiblePaymentMethods]);

  const handleCreateOffer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    if (!isKycApproved) {
      return showError(t.p2p.errKycRequired);
    }

    const p = Number(price);
    const a = Number(amount);
    const min = Number(minAmount || 0);
    const max = maxAmount ? Number(maxAmount) : null;

    if (!Number.isFinite(p) || p <= 0) return showError(t.p2p.errInvalidPrice);
    if (!Number.isFinite(a) || a <= 0) return showError(t.p2p.errInvalidAmount);
    if (!selectedMethodIds.length) return showError(t.p2p.errSelectMethod);
    const requiredLock = createSide === 'sell'
      ? a
      : (isInternalFiat ? (a * p) : 0);
    if (requiredLock > balance) {
      // Detallamos el motivo: sin cifras el usuario no entiende por qué el
      // botón "Publicar" no hace nada (sobre todo al vender).
      const cur = createSide === 'sell' ? asset : fiatCurrency;
      const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 8 });
      return showError(`${t.p2p.errInsufficientBalance} (${fmt(requiredLock)} ${cur} > ${fmt(balance)} ${cur})`);
    }

    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('p2p_create_offer', {
        p_side: createSide.toUpperCase(),
        p_asset: asset,
        p_fiat_currency: fiatCurrency,
        p_price_per_unit: p,
        p_total_amount: a,
        p_min_trade_amount: min,
        p_max_trade_amount: max,
        p_payment_method_ids: selectedMethodIds,
        p_terms: 'Pago interno del juego',
        p_country_code: null,
        p_time_limit_minutes: 1440,
      });

      if (error) throw error;

      showSuccess(t.p2p.okOfferCreated);
      // El libro se filtra por lado: si publicas una venta y estabas mirando
      // el libro de compras, la oferta "desaparece". Saltamos al lado correcto.
      setBookSide(createSide);
      setActiveTab('book');
      await refreshProfile();
      await loadData();
    } catch (error) {
      showError(getErrorMessage(error, t.p2p.errCreateOffer));
    } finally {
      setSaving(false);
    }
  };

  const handleTakeOffer = async (offer: P2POffer) => {
    if (!profile) return;

    // Participar (comprar/vender tomando una oferta) exige KYC aprobado.
    if (!isKycApproved) {
      return showError(t.p2p.errKycRequiredTrade);
    }

    // --- Validaciones previas (UX) ---
    const available = Number(offer.available_amount || 0);
    const min = Number(offer.min_trade_amount || 0);
    const max = offer.max_trade_amount != null ? Number(offer.max_trade_amount) : null;
    if (available <= 0) return showError(t.p2p.errNoLiquidity);

    const suggested = Math.max(min, Math.min(available, max ?? available));
    const qtyRaw = window.prompt(
      (offer.side === 'sell' ? t.p2p.promptBuyAmount : t.p2p.promptSellAmount)
        .replace('{asset}', offer.asset)
        .replace('{min}', String(min))
        .replace('{max}', String(max ?? available)),
      String(suggested || min || 1)
    );
    if (!qtyRaw) return;
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) return showError(t.p2p.errInvalidAmountDot);
    if (qty > available) return showError(t.p2p.errExceedsLiquidity.replace('{avail}', String(available)).replace('{asset}', offer.asset));
    if (min > 0 && qty < min) return showError(t.p2p.errBelowMin.replace('{min}', String(min)).replace('{asset}', offer.asset));
    if (max != null && qty > max) return showError(t.p2p.errAboveMax.replace('{max}', String(max)).replace('{asset}', offer.asset));

    // --- Selección de método de pago por el taker ---
    const methodIds = offer.payment_method_ids || [];
    if (methodIds.length === 0) return showError(t.p2p.errNoMethodValid);

    let methodId = methodIds[0];
    if (methodIds.length > 1) {
      const methodsForOffer = paymentMethods.filter((m) => methodIds.includes(m.id));
      const list = methodsForOffer
        .map((m, i) => `${i + 1}. ${m.name} (${m.currency_code})`)
        .join('\n');
      const pickRaw = window.prompt(
        t.p2p.promptSelectMethod.replace('{list}', list).replace('{n}', String(methodsForOffer.length)),
        '1'
      );
      if (!pickRaw) return;
      const pickIdx = Number(pickRaw);
      if (!Number.isInteger(pickIdx) || pickIdx < 1 || pickIdx > methodsForOffer.length) {
        return showError(t.p2p.errInvalidMethodSel);
      }
      methodId = methodsForOffer[pickIdx - 1].id;
    }

    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('p2p_accept_offer', {
        p_offer_id: offer.id,
        p_asset_amount: qty,
        p_payment_method_id: methodId,
        p_buyer_payment_details: {},
      });
      if (error) throw error;

      showSuccess(t.p2p.okOrderCreated);
      await loadData();
    } catch (error) {
      showError(error instanceof Error ? error.message : t.p2p.errTakeOffer);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelOffer = async (offer: P2POffer) => {
    if (!profile) return;
    if (offer.status !== 'active') return;
    const isInternalBuy = ['TUNG', 'USDT'].includes((offer.fiat_currency || '').toUpperCase());
    const confirmMsg = offer.side === 'sell'
      ? t.p2p.confirmCancelSell
          .replace('{amt}', Number(offer.available_amount).toLocaleString(undefined, { maximumFractionDigits: 4 }))
          .replace('{asset}', offer.asset)
      : isInternalBuy
        ? t.p2p.confirmCancelBuyInternal
            .replace('{amt}', Number(offer.available_amount * offer.price_per_unit).toLocaleString(undefined, { maximumFractionDigits: 4 }))
            .replace('{fiat}', offer.fiat_currency)
        : t.p2p.confirmCancelBuyExternal;
    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('p2p_cancel_offer', { p_offer_id: offer.id });
      if (error) throw error;
      showSuccess(t.p2p.okOfferCancelled);
      await refreshProfile();
      await loadData();
    } catch (error) {
      showError(error instanceof Error ? error.message : t.p2p.errCancelOffer);
    } finally {
      setSaving(false);
    }
  };

  const handleOrderAction = async (order: P2POrder, action: 'paid' | 'release' | 'expire') => {
    setSaving(true);
    setMessage(null);
    try {
      if (action === 'paid') {
        const { error } = await supabase.rpc('p2p_mark_paid', { p_order_id: order.id });
        if (error) throw error;
      }
      if (action === 'release') {
        const { error } = await supabase.rpc('p2p_release_order', { p_order_id: order.id });
        if (error) throw error;
        await refreshProfile();
      }
      if (action === 'expire') {
        const { error } = await supabase.rpc('p2p_expire_order', { p_order_id: order.id });
        if (error) throw error;
      }
      showSuccess(t.p2p.okActionApplied);
      await loadData();
    } catch (error) {
      showError(getErrorMessage(error, t.p2p.errActionFailed));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDispute = (order: P2POrder) => {
    setDisputeOrder(order);
  };

  const onDisputeSubmitted = async () => {
    showSuccess(t.p2p.okDisputeOpened);
    await loadData();
  };

  const statusPill = (status: P2POrder['status']) => {
    if (status === 'released') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    if (status === 'paid') return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    if (status === 'pending_payment') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    if (status === 'disputed') return 'bg-red-500/20 text-red-300 border-red-500/40';
    return 'bg-gray-500/20 text-gray-300 border-gray-500/40';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-orbitron text-white flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-cyber-blue" />
            {t.p2p.title}
          </h1>
          <p className="text-sm text-gray-400 mt-1">{t.p2p.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 flex items-center gap-2"
          >
            <Info className="w-4 h-4" />
            {showHelp ? t.p2p.hideHelp : t.p2p.howItWorks}
          </button>
          <button
            onClick={loadData}
            disabled={loading || saving}
            className="px-4 py-2 rounded-lg border border-cyber-blue/40 text-cyber-blue hover:bg-cyber-blue/10 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t.p2p.refresh}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-space-800/70 border border-cyber-blue/20 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">{t.p2p.yourBalance}</p>
          <div className="mt-2 flex items-center gap-6">
            <p className="text-sm text-amber-300">TUNG: <span className="font-semibold text-white">{Number(profile?.tung_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></p>
            <p className="text-sm text-emerald-300">USDT: <span className="font-semibold text-white">{Number(profile?.usdt_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></p>
          </div>
        </div>

        <div className="bg-space-800/70 border border-cyber-blue/20 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">{t.p2p.statusLabel}</p>
          <p className="mt-2 text-sm text-gray-200">{t.p2p.escrowActive}</p>
        </div>
      </div>

      {showHelp && (
        <div className="bg-space-800/70 border border-cyan-500/30 rounded-xl p-4 text-sm text-gray-200 space-y-2">
          <p className="text-cyan-300 font-semibold flex items-center gap-2"><Info className="w-4 h-4" /> {t.p2p.howItWorksTitle}</p>
          <ol className="list-decimal pl-5 space-y-1 text-gray-300">
            <li><span className="text-white">{t.p2p.help1a}</span>{t.p2p.help1b}</li>
            <li>{t.p2p.help2a}<span className="text-white">{t.p2p.help2b}</span>{t.p2p.help2c}</li>
            <li>{t.p2p.help3a}<span className="text-emerald-300">{t.p2p.help3b}</span>{t.p2p.help3c}<span className="text-cyan-300">{t.p2p.help3d}</span>{t.p2p.help3e}</li>
            <li>{t.p2p.help4a}<span className="text-amber-300">{t.p2p.help4b}</span>{t.p2p.help4c}<span className="text-white">{feePercent}%</span>{t.p2p.help4d}</li>
            <li>{t.p2p.help5a}<span className="text-red-300">{t.p2p.help5b}</span>{t.p2p.help5c}</li>
          </ol>
          <p className="text-xs text-gray-400">{t.p2p.helpAntifraud}</p>
        </div>
      )}

      {message && (
        <div ref={messageRef} className={`rounded-lg border px-4 py-3 text-sm ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-space-800/70 border border-cyber-blue/20 rounded-xl p-4">
        <h2 className="text-lg text-white font-semibold mb-1">{t.p2p.createOffer}</h2>
        <p className="text-xs text-gray-400 mb-3">
          {t.p2p.steps1}<span className="text-emerald-300">{t.p2p.stepsSell}</span>{t.p2p.steps2}<span className="text-cyan-300">{t.p2p.stepsBuy}</span>{t.p2p.steps3}
        </p>

        {/* Aviso KYC: crear ofertas exige verificación aprobada. Comprar NO. */}
        {isKycApproved ? (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {t.p2p.kycApproved1}<b>{t.p2p.kycApprovedBold}</b>{t.p2p.kycApproved2}<b>{t.p2p.kyc72h}</b>{t.p2p.kycApproved3}
            </span>
          </div>
        ) : (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {t.p2p.kycNeed1}<b>{t.p2p.kycNeedBold1}</b>{t.p2p.kycNeed2}<b>{t.p2p.kycNeedBold2}</b>{t.p2p.kycNeed3}
              {kycStatus === 'pending'
                ? t.p2p.kycPending
                : kycStatus === 'rejected'
                ? t.p2p.kycRejected
                : t.p2p.kycNone}{' '}
              <Link to="/game/kyc" className="underline font-semibold text-cyber-blue hover:opacity-90">
                {t.p2p.kycGoLink}
              </Link>
              <br />
              <span className="text-amber-300/80">
                {t.p2p.kycBuyNote}
              </span>
            </span>
          </div>
        )}

        <form onSubmit={handleCreateOffer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            <span>{t.p2p.operation}</span>
            <select
              value={createSide}
              onChange={(e) => setCreateSide(e.target.value as OfferSide)}
              className="bg-space-900 border border-cyber-blue/30 rounded-lg px-3 py-2 text-white"
            >
              <option value="sell">{t.p2p.sellOpt}</option>
              <option value="buy">{t.p2p.buyOpt}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            <span>{createSide === 'sell' ? t.p2p.assetToSell : t.p2p.assetToBuy}</span>
            <select value={asset} onChange={(e) => setAsset(e.target.value as P2PAsset)} className="bg-space-900 border border-cyber-blue/30 rounded-lg px-3 py-2 text-white">
              <option value="TUNG">TUNG</option>
              <option value="USDT">USDT</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400 relative">
            <span>
              {createSide === 'sell'
                ? t.p2p.currencyMethodLabel.replace('{n}', String(selectableOptions.length))
                : t.p2p.payWithLabel.replace('{n}', String(selectableOptions.length))}
            </span>
            <>
                <button
                  type="button"
                  onClick={() => setCurrencyOpen((v) => !v)}
                  className="bg-space-900 border border-cyber-blue/30 rounded-lg px-3 py-2 text-white text-left flex items-center justify-between"
                >
                  <span className="font-semibold truncate">{selectedOption?.label ?? t.p2p.selectMethodPlaceholder}</span>
                  <span className="text-cyber-blue text-xs ml-2">{currencyOpen ? '▲' : '▼'}</span>
                </button>
                {currencyOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-space-900 border border-cyber-blue/40 rounded-lg shadow-2xl max-h-72 overflow-hidden flex flex-col">
                    <input
                      autoFocus
                      value={currencySearch}
                      onChange={(e) => setCurrencySearch(e.target.value)}
                      placeholder={t.p2p.searchPlaceholder}
                      className="bg-space-950 border-b border-white/10 px-3 py-2 text-white text-sm outline-none"
                    />
                    <div className="overflow-y-auto flex-1">
                      {filteredOptions.length === 0 && (
                        <p className="px-3 py-2 text-xs text-gray-400">{t.p2p.noResults}</p>
                      )}
                      {filteredOptions.map((opt) => {
                        const active = opt.key === selectedOptionKey;
                        return (
                          <button
                            type="button"
                            key={opt.key}
                            onClick={() => {
                              setSelectedOptionKey(opt.key);
                              setCurrencyOpen(false);
                              setCurrencySearch('');
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-cyber-blue/10 flex items-center justify-between gap-2 ${active ? 'bg-cyber-blue/20 text-cyber-blue' : 'text-gray-200'}`}
                          >
                            <span className="truncate">{opt.label}</span>
                            <span className={`text-[10px] whitespace-nowrap ${opt.isInternal ? 'text-emerald-300' : 'text-amber-300'}`}>
                              {opt.isInternal ? t.p2p.internalTag : t.p2p.externalTag}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            <span>{t.p2p.pricePerUnit.replace('{asset}', asset).replace('{fiat}', fiatCurrency)}</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.00000001" min="0" placeholder={t.p2p.pricePlaceholder.replace('{fiat}', fiatCurrency).replace('{asset}', asset)} className="bg-space-900 border border-cyber-blue/30 rounded-lg px-3 py-2 text-white" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            <span>{(createSide === 'sell' ? t.p2p.totalAmountSell : t.p2p.totalAmountBuy).replace('{asset}', asset)}</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.00000001" min="0" placeholder={t.p2p.totalAmountPlaceholder.replace('{asset}', asset)} className="bg-space-900 border border-cyber-blue/30 rounded-lg px-3 py-2 text-white" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            <span>{t.p2p.minPerOrder.replace('{asset}', asset)}</span>
            <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} type="number" step="0.00000001" min="0" placeholder={t.p2p.minPlaceholder.replace('{asset}', asset)} className="bg-space-900 border border-cyber-blue/30 rounded-lg px-3 py-2 text-white" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            <span>{t.p2p.maxPerOrder.replace('{asset}', asset)}</span>
            <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} type="number" step="0.00000001" min="0" placeholder={t.p2p.maxPlaceholder} className="bg-space-900 border border-cyber-blue/30 rounded-lg px-3 py-2 text-white" />
          </label>
          <div className="md:col-span-2 lg:col-span-4">
            <p className="text-xs text-gray-400 mb-2">{t.p2p.acceptedMethods.replace('{fiat}', fiatCurrency)}</p>
            <div className="flex flex-wrap gap-2 items-center">
              {visiblePaymentMethods.map((method) => {
                const selected = selectedMethodIds.includes(method.id);
                return (
                  <button
                    type="button"
                    key={method.id}
                    onClick={() => {
                      setSelectedMethodIds((prev) =>
                        prev.includes(method.id) ? prev.filter((id) => id !== method.id) : [...prev, method.id]
                      );
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs border ${selected ? 'border-cyber-blue bg-cyber-blue/20 text-cyber-blue' : 'border-gray-600 text-gray-300'}`}
                  >
                    {method.name}
                  </button>
                );
              })}
              {visiblePaymentMethods.length === 0 && (
                <p className="text-xs text-amber-300">{t.p2p.noMethodsForFiat.replace('{fiat}', fiatCurrency)}</p>
              )}
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-t border-white/5 pt-3">
            <div className="text-xs text-gray-400 space-y-0.5">
              <p>
                {createSide === 'sell'
                  ? t.p2p.balanceToSell.replace('{bal}', balance.toLocaleString(undefined, { maximumFractionDigits: 4 })).replace('{asset}', asset)
                  : t.p2p.balanceToLock.replace('{bal}', balance.toLocaleString(undefined, { maximumFractionDigits: 4 })).replace('{fiat}', fiatCurrency)}
              </p>
              {Number(price) > 0 && Number(amount) > 0 && (
                <p className="text-cyber-blue">
                  {createSide === 'sell'
                    ? t.p2p.willSell.replace('{amt}', Number(amount).toLocaleString(undefined, { maximumFractionDigits: 4 })).replace('{asset}', asset).replace('{total}', (Number(amount) * Number(price)).toLocaleString(undefined, { maximumFractionDigits: 4 })).replace('{fiat}', fiatCurrency)
                    : t.p2p.willBuy.replace('{amt}', Number(amount).toLocaleString(undefined, { maximumFractionDigits: 4 })).replace('{asset}', asset).replace('{total}', (Number(amount) * Number(price)).toLocaleString(undefined, { maximumFractionDigits: 4 })).replace('{fiat}', fiatCurrency)}
                </p>
              )}
            </div>
            <button type="submit" disabled={saving || !isKycApproved} title={!isKycApproved ? t.p2p.publishTitleKyc : undefined} className="px-4 py-2 rounded-lg bg-cyber-blue text-space-950 font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? t.p2p.processing : (!isKycApproved ? t.p2p.verifyKycToPublish : t.p2p.publishOffer)}
            </button>
          </div>
        </form>
      </div>

      {/* ================== Pestañas: Ofertas activas / Mis ofertas / Mis órdenes ================== */}
      <div className="bg-space-800/70 border border-cyber-blue/20 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-white/10 pb-3">
          <button
            onClick={() => setActiveTab('book')}
            className={`px-3 py-1.5 rounded-lg text-xs border ${activeTab === 'book' ? 'border-cyber-blue text-cyber-blue bg-cyber-blue/10' : 'border-gray-600 text-gray-300 hover:border-gray-500'}`}
          >
            {t.p2p.tabBook.replace('{n}', String(offers.length))}
          </button>
          <button
            onClick={() => setActiveTab('mine')}
            className={`px-3 py-1.5 rounded-lg text-xs border ${activeTab === 'mine' ? 'border-cyber-blue text-cyber-blue bg-cyber-blue/10' : 'border-gray-600 text-gray-300 hover:border-gray-500'}`}
          >
            {t.p2p.tabMine.replace('{n}', String(myOffers.length))}
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-3 py-1.5 rounded-lg text-xs border ${activeTab === 'orders' ? 'border-cyber-blue text-cyber-blue bg-cyber-blue/10' : 'border-gray-600 text-gray-300 hover:border-gray-500'}`}
          >
            {t.p2p.tabOrders.replace('{n}', String(orders.length))}
          </button>
          <span className="ml-auto text-[11px] text-amber-300/90 border border-amber-500/30 bg-amber-500/5 rounded-md px-2 py-1" title={t.p2p.feeBadgeTitle.replace('{x}', (100*(1-feePercent/100)).toFixed(2)).replace('{y}', (100*feePercent/100).toFixed(2))}>
            {t.p2p.feeBadgePre}<b>{feePercent}%</b>{t.p2p.feeBadgePost}
          </span>
        </div>

        {/* ---------- Ofertas activas ---------- */}
        {activeTab === 'book' && (
          <div>
            <div className="flex gap-2 mb-3 flex-wrap items-center">
              <button
                onClick={() => setBookSide('sell')}
                className={`px-3 py-1.5 rounded-lg text-xs border ${bookSide === 'sell' ? 'border-emerald-400 text-emerald-300 bg-emerald-500/10' : 'border-gray-600 text-gray-300'}`}
              >
                {t.p2p.viewSellOffers}
              </button>
              <button
                onClick={() => setBookSide('buy')}
                className={`px-3 py-1.5 rounded-lg text-xs border ${bookSide === 'buy' ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10' : 'border-gray-600 text-gray-300'}`}
              >
                {t.p2p.viewBuyOffers}
              </button>

              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <label className="text-[11px] text-gray-400">{t.p2p.sortLabel}</label>
                <select
                  value={bookSort}
                  onChange={(e) => setBookSort(e.target.value as typeof bookSort)}
                  className="bg-space-900 border border-white/10 rounded-lg text-xs px-2 py-1.5 text-gray-200"
                >
                  <option value="default">{t.p2p.sortRecent}</option>
                  <option value="rating">{t.p2p.sortRating}</option>
                  <option value="orders">{t.p2p.sortOrders}</option>
                  <option value="price_asc">{t.p2p.sortPriceAsc}</option>
                  <option value="price_desc">{t.p2p.sortPriceDesc}</option>
                </select>

                <label className="text-[11px] text-gray-400 ml-2">{t.p2p.minStarsLabel}</label>
                <select
                  value={minStars}
                  onChange={(e) => setMinStars(Number(e.target.value))}
                  className="bg-space-900 border border-white/10 rounded-lg text-xs px-2 py-1.5 text-gray-200"
                >
                  <option value={0}>{t.p2p.starsAll}</option>
                  <option value={3}>{t.p2p.stars3}</option>
                  <option value={4}>{t.p2p.stars4}</option>
                  <option value={4.5}>{t.p2p.stars45}</option>
                  <option value={5}>{t.p2p.stars5}</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-white/10">
                    <th className="py-2 pr-3">{t.p2p.colSeller}</th>
                    <th className="py-2 pr-3">{t.p2p.colPair}</th>
                    <th className="py-2 pr-3">{t.p2p.colPrice}</th>
                    <th className="py-2 pr-3">{t.p2p.colAvailable}</th>
                    <th className="py-2 pr-3">{t.p2p.colLimits}</th>
                    <th className="py-2 pr-3">{t.p2p.colAction}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOffers.map((offer) => {
                    const rep = reputations[offer.user_id];
                    return (
                    <tr key={offer.id} className="border-b border-white/5 text-gray-200">
                      <td className="py-2 pr-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{offer.seller_name}</span>
                          {rep ? (
                            <P2PSellerRating
                              userId={offer.user_id}
                              ratingAvg={rep.rating_avg}
                              ratingCount={rep.rating_count}
                              totalOrders={rep.total_orders}
                              successRate={rep.success_rate}
                              isBanned={rep.is_banned}
                            />
                          ) : (
                            <span className="text-[10px] text-gray-500">{t.p2p.newSeller}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3">{offer.asset}/{offer.fiat_currency}</td>
                      <td className="py-2 pr-3">{Number(offer.price_per_unit).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                      <td className="py-2 pr-3">{Number(offer.available_amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {offer.asset}</td>
                      <td className="py-2 pr-3">
                        {Number(offer.min_trade_amount).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        {offer.max_trade_amount ? ` - ${Number(offer.max_trade_amount).toLocaleString(undefined, { maximumFractionDigits: 4 })}` : ''}
                      </td>
                      <td className="py-2 pr-3">
                        {offer.user_id === profile?.id ? (
                          offersWithOpenOrders.has(offer.id) ? (
                            <span
                              title={t.p2p.inProgressTitle}
                              className="text-[11px] text-amber-300/90"
                            >
                              {t.p2p.inProgress}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleCancelOffer(offer)}
                              disabled={saving}
                              className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-xs disabled:opacity-40"
                            >
                              <XCircle className="w-3.5 h-3.5 inline mr-1" /> {t.p2p.cancel}
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => handleTakeOffer(offer)}
                            disabled={saving || !isKycApproved}
                            title={!isKycApproved ? t.p2p.tradeTitleKyc : undefined}
                            className={`px-3 py-1.5 rounded-lg border disabled:opacity-40 ${offer.side === 'sell' ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10' : 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10'}`}
                          >
                            {offer.side === 'sell' ? t.p2p.buy : t.p2p.sell}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                  {sortedOffers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-400">{offers.length === 0 ? t.p2p.noActiveOffers : t.p2p.noOffersFilter}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------- Mis ofertas ---------- */}
        {activeTab === 'mine' && (
          <div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-white/10">
                    <th className="py-2 pr-3">{t.p2p.colType}</th>
                    <th className="py-2 pr-3">{t.p2p.colPair}</th>
                    <th className="py-2 pr-3">{t.p2p.colPrice}</th>
                    <th className="py-2 pr-3">{t.p2p.colAvailable}</th>
                    <th className="py-2 pr-3">{t.p2p.colStatus}</th>
                    <th className="py-2 pr-3">{t.p2p.colAction}</th>
                  </tr>
                </thead>
                <tbody>
                  {myOffers.map((offer) => {
                    const isExternal = !['TUNG', 'USDT'].includes((offer.fiat_currency || '').toUpperCase());
                    return (
                      <tr key={offer.id} className="border-b border-white/5 text-gray-200">
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded text-xs border ${offer.side === 'sell' ? 'border-emerald-500/40 text-emerald-300' : 'border-cyan-500/40 text-cyan-300'}`}>
                            {offer.side === 'sell' ? t.p2p.saleTag : t.p2p.buyTag}
                          </span>
                          {isExternal && (
                            <span className="ml-2 px-2 py-0.5 rounded text-[10px] border border-amber-500/40 text-amber-300">{t.p2p.externalPayTag}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{offer.asset}/{offer.fiat_currency}</td>
                        <td className="py-2 pr-3">{Number(offer.price_per_unit).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                        <td className="py-2 pr-3">{Number(offer.available_amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {offer.asset}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full border text-xs ${offer.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : offer.status === 'cancelled' ? 'bg-gray-500/10 border-gray-500/40 text-gray-300' : offer.status === 'expired' ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'}`}>
                            {offer.status}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {offer.status === 'active' ? (
                            offersWithOpenOrders.has(offer.id) ? (
                              <span
                                title={t.p2p.inProgressTitle}
                                className="text-[11px] text-amber-300/90"
                              >
                                {t.p2p.inProgress}
                              </span>
                            ) : (
                              <button
                                onClick={() => handleCancelOffer(offer)}
                                disabled={saving}
                                className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-xs disabled:opacity-40"
                              >
                                <XCircle className="w-3.5 h-3.5 inline mr-1" /> {t.p2p.cancel}
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {myOffers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-400">{t.p2p.noMyOffers}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">{t.p2p.myOffersNote1}</p>
            <p className="text-xs text-gray-500 mt-1">
              <span className="text-amber-300/90">{t.p2p.feeNoteLabel}</span> {t.p2p.myOffersFeeNote.replace('{fee}', feePercent + '%').replace('{x}', (100 * (1 - feePercent / 100)).toFixed(2)).replace('{y}', (100 * feePercent / 100).toFixed(2))}
            </p>
          </div>
        )}

        {/* ---------- Mis órdenes (paginado) ---------- */}
        {activeTab === 'orders' && (
          <div className="space-y-2">
            {(() => {
              const totalPages = Math.max(1, Math.ceil(orders.length / ORDERS_PAGE_SIZE));
              const page = Math.min(ordersPage, totalPages);
              const start = (page - 1) * ORDERS_PAGE_SIZE;
              const pageOrders = orders.slice(start, start + ORDERS_PAGE_SIZE);
              return (
                <>
                  {pageOrders.map((order) => {
            const isBuyer = order.buyer_id === profile?.id;
            const canMarkPaid = isBuyer && order.status === 'pending_payment';
            // El vendedor puede liberar tanto si el comprador marcó "pagada" como si
            // no lo hizo pero el vendedor ya recibió el dinero fuera de la plataforma.
            const canRelease = !isBuyer && (order.status === 'paid' || order.status === 'pending_payment');
            // Solo el COMPRADOR puede cancelar su orden, y SOLO mientras no haya
            // marcado "pagada". Una vez status='paid', cualquier conflicto debe
            // resolverse por disputa (evita robo si el buyer ya pagó off-platform).
            const canExpire = isBuyer && order.status === 'pending_payment';
            // Cooldown anti-spam de disputa: tras marcar pagada, respetar los
            // p2p_dispute_cooldown_minutes configurados antes de permitir abrir
            // disputa desde la UI (el backend lo valida igualmente).
            const cooldownMs = disputeCooldownMin * 60 * 1000;
            const paidAtMs = order.paid_at ? new Date(order.paid_at).getTime() : 0;
            const cooldownRemainingMs = order.status === 'paid' && paidAtMs > 0
              ? Math.max(0, (paidAtMs + cooldownMs) - Date.now())
              : 0;
            const canDispute = (order.status === 'pending_payment' || order.status === 'paid')
              && cooldownRemainingMs === 0;

            return (
              <div key={order.id} className="rounded-lg border border-white/10 p-3 bg-space-900/40">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                  <div>
                    <p className="text-sm text-white">
                      {order.asset_amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {order.asset} → {order.fiat_amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {order.fiat_currency}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{t.p2p.role}{isBuyer ? t.p2p.roleBuyer : t.p2p.roleSeller} {t.p2p.paymentLimit}{new Date(order.payment_deadline).toLocaleString()}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-full border text-xs ${statusPill(order.status)}`}>{order.status}</span>

                    {canMarkPaid && (
                      <button onClick={() => handleOrderAction(order, 'paid')} disabled={saving} className="px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-xs">
                        <Clock3 className="w-3.5 h-3.5 inline mr-1" /> {t.p2p.markPaid}
                      </button>
                    )}
                    {canRelease && (
                      <button onClick={() => setConfirmRelease(order)} disabled={saving} className="px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-xs">
                        <ShieldCheck className="w-3.5 h-3.5 inline mr-1" /> {t.p2p.releaseEscrow}
                      </button>
                    )}
                    {canExpire && (
                      <button onClick={() => handleOrderAction(order, 'expire')} disabled={saving} className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-xs">
                        <XCircle className="w-3.5 h-3.5 inline mr-1" /> {t.p2p.cancel}
                      </button>
                    )}
                    {/* Seller con deadline vencido y buyer que no marcó pagada: debe abrir disputa */}
                    {!isBuyer && order.status === 'pending_payment' && new Date(order.payment_deadline).getTime() < Date.now() && (
                      <span className="text-[11px] text-amber-400 italic">
                        {t.p2p.deadlineExpired}
                      </span>
                    )}
                    {canDispute && (
                      <button onClick={() => handleOpenDispute(order)} disabled={saving} className="px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 inline mr-1" /> {t.p2p.openDispute}
                      </button>
                    )}
                    {!canDispute && order.status === 'paid' && cooldownRemainingMs > 0 && (
                      <span className="text-[11px] text-gray-400 italic">
                        {t.p2p.disputeAvailableIn.replace('{s}', String(Math.ceil(cooldownRemainingMs / 1000)))}
                      </span>
                    )}
                    <button
                      onClick={() => setOpenChats((prev) => ({ ...prev, [order.id]: !prev[order.id] }))}
                      className="px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-xs"
                    >
                      <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                      {openChats[order.id] ? t.p2p.closeChat : t.p2p.chat}
                    </button>
                    {order.status === 'released' && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
                    {order.status === 'released' && !ratedOrders.has(order.id) && (
                      <button
                        onClick={() => setRateOrder({ id: order.id, name: isBuyer ? t.p2p.toSeller : t.p2p.toBuyer })}
                        className="px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs"
                      >
                        <Star className="w-3.5 h-3.5 inline mr-1" /> {t.p2p.rate}
                      </button>
                    )}
                  </div>
                </div>
                {openChats[order.id] && profile && (
                  <P2POrderChat
                    orderId={order.id}
                    currentUserId={profile.id}
                    counterpartName={isBuyer ? t.p2p.counterpartSeller : t.p2p.counterpartBuyer}
                  />
                )}
              </div>
            );
          })}

          {orders.length === 0 && (
                    <p className="text-sm text-gray-400">{t.p2p.noOrders}</p>
                  )}

                  {orders.length > ORDERS_PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-3 border-t border-white/10">
                      <span className="text-xs text-gray-400">
                        {t.p2p.showing.replace('{a}', String(start + 1)).replace('{b}', String(Math.min(start + ORDERS_PAGE_SIZE, orders.length))).replace('{n}', String(orders.length))}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                          className="px-2 py-1 rounded-lg border border-gray-600 text-xs text-gray-300 disabled:opacity-40 hover:border-gray-400"
                        >
                          ←
                        </button>
                        <span className="text-xs text-gray-300">
                          {t.p2p.pageLabel} <b className="text-white">{page}</b> / {totalPages}
                        </span>
                        <button
                          onClick={() => setOrdersPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page >= totalPages}
                          className="px-2 py-1 rounded-lg border border-gray-600 text-xs text-gray-300 disabled:opacity-40 hover:border-gray-400"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
      {rateOrder && (
        <P2PRateModal
          orderId={rateOrder.id}
          counterpartName={rateOrder.name}
          onClose={() => setRateOrder(null)}
          onDone={() => { setRatedOrders((prev) => new Set(prev).add(rateOrder.id)); loadData(); }}
        />
      )}
      {confirmRelease && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirmRelease(null)}>
          <div className="w-full max-w-md rounded-xl border border-emerald-500/30 bg-space-900 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> {t.p2p.releaseConfirmTitle}
            </h3>
            <p className="mt-3 text-sm text-gray-300">
              {t.p2p.releaseConfirmBody
                .replace('{amount}', confirmRelease.asset_amount.toLocaleString(undefined, { maximumFractionDigits: 4 }))
                .replace('{asset}', confirmRelease.asset)
                .replace('{fiat}', `${confirmRelease.fiat_amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${confirmRelease.fiat_currency}`)}
            </p>
            <p className="mt-3 text-sm font-semibold text-red-400">{t.p2p.releaseConfirmWarn}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmRelease(null)}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-white/20 text-gray-300 hover:bg-white/5 text-sm"
              >
                {t.p2p.releaseConfirmCancel}
              </button>
              <button
                onClick={() => { const o = confirmRelease; setConfirmRelease(null); handleOrderAction(o, 'release'); }}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-sm"
              >
                <ShieldCheck className="w-4 h-4 inline mr-1" /> {t.p2p.releaseConfirmOk}
              </button>
            </div>
          </div>
        </div>
      )}
      {disputeOrder && profile && (
        <P2POpenDisputeModal
          orderId={disputeOrder.id}
          userId={profile.id}
          open={!!disputeOrder}
          onClose={() => setDisputeOrder(null)}
          onSubmitted={onDisputeSubmitted}
        />
      )}
    </div>
  );
}
