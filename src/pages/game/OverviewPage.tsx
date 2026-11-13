import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Thermometer, Grid3x3 as Grid3X3, Clock, Building2, Microscope, Rocket, Shield, ShieldAlert, MapPin, CreditCard as Edit2, Check, X, Trash2, AlertTriangle, Coins, Ticket, Trophy, RotateCcw, Swords, Scroll, Landmark, Ship, Activity, Castle, Gem, ChevronRight } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { formatCoordinates, formatTimeRemaining, getPlanetImage } from '../../lib/utils';
import { useI18n, translateBuildingName, translateResearchName, translateShipName, translateDefenseName, translatePlanetName } from '../../lib/i18n';
import { RankBadge } from '../../components/ui/RankBadge';
import { DailyStreakBanner } from '../../components/game/DailyStreakBanner';
import { PeaceShieldWidget } from '../../components/game/PeaceShieldWidget';
import { ActiveBonusesPanel } from '../../components/game/ActiveBonusesPanel';
import { RaffleBanner } from '../../components/game/RaffleBanner';
import { WhatsAppFloatingButton } from '../../components/ui/WhatsAppCommunity';
import type { Planet } from '../../types/game';

// Efectos visuales de planeta (cosmeticos). El planeta "resplandece" segun el efecto equipado.
const PLANET_EFFECT_GLOW: Record<string, { glow: string; ring: string; emoji: string; label: string }> = {
  planet_fire:   { glow: 'bg-orange-500/50',                                              ring: 'ring-orange-400/80 shadow-orange-500/60', emoji: '🔥', label: 'Aureola de Fuego' },
  planet_ice:    { glow: 'bg-cyan-400/50',                                                ring: 'ring-cyan-300/80 shadow-cyan-400/60',     emoji: '❄️', label: 'Tormenta de Hielo' },
  planet_golden: { glow: 'bg-yellow-400/60',                                              ring: 'ring-yellow-300/90 shadow-yellow-400/70', emoji: '🟡', label: 'Anillos Dorados' },
  planet_dark:   { glow: 'bg-purple-500/50',                                              ring: 'ring-purple-400/80 shadow-purple-500/60', emoji: '🟣', label: 'Energía Oscura' },
  planet_nebula: { glow: 'bg-gradient-to-br from-pink-500/50 via-fuchsia-500/40 to-cyan-400/50', ring: 'ring-pink-300/80 shadow-pink-400/60', emoji: '🌈', label: 'Nebulosa Radiante' },
};

function DepositInfo({ planetId }: { planetId: string }) {
  const { t } = useI18n();
  const { profile, refreshProfile } = useAuthStore();
  const { fetchResources } = useGameStore();
  const [deposits, setDeposits] = useState<Record<string, number> | null>(null);
  const [refill, setRefill] = useState<{
    refillable?: boolean; planet_status?: string; depletion_percent?: number;
    cost_usdt?: number; cost_tung?: number | null;
  } | null>(null);
  const [isRefilling, setIsRefilling] = useState(false);
  const [refillMsg, setRefillMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadInfo = useCallback(() => {
    supabase.rpc('get_planet_deposits', { p_planet_id: planetId }).then(({ data }) => {
      if (data?.success && !data.is_main_planet) {
        setDeposits({
          metal: data.metal_deposit,
          crystal: data.crystal_deposit,
          deuterium: data.deuterium_deposit,
          metalPct: data.metal_deposit_pct,
          crystalPct: data.crystal_deposit_pct,
          deuteriumPct: data.deuterium_deposit_pct,
        });
      }
    }).catch(() => {});
    supabase.rpc('get_colony_refill_info', { p_planet_id: planetId }).then(({ data }) => {
      if (data?.success && data.depletion_percent !== undefined) setRefill(data);
      else setRefill(null);
    }).catch(() => {});
  }, [planetId]);

  useEffect(() => {
    setRefillMsg(null);
    loadInfo();
    const interval = setInterval(loadInfo, 5 * 60 * 1000); // cada 5 minutos
    return () => clearInterval(interval);
  }, [loadInfo]);

  const handleRefill = useCallback(async () => {
    if (isRefilling) return;
    setIsRefilling(true);
    setRefillMsg(null);
    try {
      const { data, error } = await supabase.rpc('refill_colony_resources', { p_planet_id: planetId });
      if (error) throw error;
      if (data?.success) {
        setRefillMsg({ type: 'success', text: data.message || 'Recursos recargados' });
        await Promise.all([refreshProfile(), fetchResources(planetId), Promise.resolve(loadInfo())]);
      } else {
        setRefillMsg({ type: 'error', text: data?.error || 'No se pudo recargar' });
      }
    } catch (e) {
      setRefillMsg({ type: 'error', text: e instanceof Error ? e.message : 'Error al recargar' });
    } finally {
      setIsRefilling(false);
    }
  }, [isRefilling, planetId, refreshProfile, fetchResources, loadInfo]);

  if (!deposits) return null;

  const bar = (pct: number) => {
    const color = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500';
    return <div className="flex-1 bg-space-700 rounded-full h-2"><div className={`h-2 rounded-full transition-all ${color}`} style={{width:`${Math.min(100,pct||0)}%`}}/></div>;
  };

  const items = [
    { label: `🪨 ${t.resources.metal}`, amt: deposits.metal, pct: deposits.metalPct },
    { label: `💎 ${t.resources.crystal}`, amt: deposits.crystal, pct: deposits.crystalPct },
    { label: `⚗️ ${t.resources.deuterium}`, amt: deposits.deuterium, pct: deposits.deuteriumPct },
  ];

  const balance = Number(profile?.tung_balance ?? 0);
  const canPay = refill?.cost_tung != null && balance >= (refill.cost_tung ?? Infinity);

  return (
    <div className="card-glass p-3 border-l-4 border-amber-500/50 text-xs space-y-1.5">
      <p className="text-amber-400 font-semibold text-xs">⛏️ Recursos restantes de la ciudad</p>
      {items.map(i => (
        <div key={i.label} className="flex items-center gap-2">
          <span className="w-20 text-gray-400">{i.label}</span>
          {bar(i.pct)}
          <span className="text-gray-500 w-20 text-right">
            {(i.amt/1000000).toFixed(1)}M ({i.pct?.toFixed(0)}%)
          </span>
        </div>
      ))}

      {refill && (refill.depletion_percent ?? 0) > 0 && (
        <div className="pt-2 mt-1 border-t border-space-600/70 space-y-1.5">
          {refillMsg && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${refillMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {refillMsg.type === 'success' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              <span>{refillMsg.text}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-gray-400">
              Agotamiento <span className="text-white font-semibold">{refill.depletion_percent}%</span> · Recarga:{' '}
              {refill.cost_tung != null
                ? <span className="text-yellow-400 font-semibold">{Math.round(refill.cost_tung).toLocaleString()} TUNG</span>
                : <span className="text-gray-500">precio no disponible</span>}
              {refill.cost_usdt != null && <span className="text-gray-600"> (~{refill.cost_usdt} USDT)</span>}
            </div>
            <button
              onClick={handleRefill}
              disabled={isRefilling || !refill.refillable || !canPay}
              title={!canPay ? 'TUNG insuficiente' : 'Recargar recursos'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRefilling ? 'animate-spin' : ''}`} />
              Recargar
            </button>
          </div>
          <p className="text-[10px] text-gray-600">Tu saldo: {balance.toLocaleString()} TUNG · El costo es proporcional al % de agotamiento.</p>
        </div>
      )}
    </div>
  );
}

const TUNG_ABANDON_FEE = 0;

function CustomOrderSection({ title, subtitle, items, values, onChange, placeholder }: {
  title: string;
  subtitle: string;
  items: { code: string; name: string }[];
  values: Record<string, number>;
  onChange: (code: string, value: number | null) => void;
  placeholder: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = Object.keys(values).filter(k => items.some(i => i.code === k) && values[k] > 0).length;

  return (
    <div className="rounded-lg border border-space-600/50 bg-space-800/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-space-700/30 transition rounded-lg"
      >
        <span className="text-gray-200 font-semibold">{title}
          {activeCount > 0 && <span className="ml-2 px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-300 rounded-full">{activeCount} activos</span>}
        </span>
        <span className="text-gray-500 text-[10px]">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-[10px] text-gray-500 mb-2">{subtitle}</p>
          {items.map(item => (
            <div key={item.code} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={(values[item.code] || 0) > 0}
                onChange={(e) => onChange(item.code, e.target.checked ? (values[item.code] || 1) : null)}
                className="w-3.5 h-3.5 rounded border-gray-600 bg-space-800 text-amber-500 focus:ring-amber-500/30"
              />
              <span className="text-xs text-gray-300 flex-1 truncate">{item.name}</span>
              <input
                type="number"
                min={1}
                max={99999}
                value={values[item.code] || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  onChange(item.code, isNaN(v) || v <= 0 ? null : v);
                }}
                placeholder={placeholder}
                className="w-16 px-2 py-1 rounded border border-space-600 bg-space-900 text-xs text-white text-center outline-none focus:border-amber-500/50 placeholder-gray-600"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface IncomingAttack {
  fleet_id: string;
  mission_type: string;
  departure_time: string;
  arrival_time: string;
  is_returning: boolean;
  target_galaxy: number;
  target_system: number;
  target_position: number;
  target_planet_name: string;
  origin_galaxy: number;
  origin_system: number;
  origin_position: number;
  attacker_name: string;
  attacker_spy_level: number;
  can_see_fleet: boolean;
  ships: { ship_name: string; ship_code: string; quantity: number }[] | null;
}

type PlanetAutopilotRole = NonNullable<Planet['autopilot_role']>;

// Imagenes decorativas de la Vista General. Vacio ('') => fondo degradado.
// Subirlas a public/Imagenes/Vista General/ y poner aqui la ruta.
const OVERVIEW_BANNER_IMG = '/Imagenes/Defensas/Ciudadela romana sobre las nubes_11zon.webp';
const OVERVIEW_PLANET_DECOR_IMG = '';
const OVERVIEW_FLEET_IMG = '';
const OVERVIEW_CARD_IMG = {
  buildings: '/Imagenes/Edificios/Construcción del castillo bajo estandartes dorados.webp',
  research: '/Imagenes/Edificios/Biblioteca Imperial de Sabiduría Dorada.webp',
  shipyard: '/Imagenes/Edificios/Falcon Banner Barracks and Training Yard.webp',
  defense: '/Imagenes/Defensas/Centinela romano tras el muro dorado_11zon.webp',
};

const AUTOPILOT_ROLE_VALUES: PlanetAutopilotRole[] = ['balanced', 'miner', 'military', 'research', 'colonizer', 'custom'];

export const AUTOPILOT_ROLE_COLORS: Record<PlanetAutopilotRole, { dot: string; text: string; border: string; bg: string }> = {
  balanced: { dot: 'bg-gray-400', text: 'text-gray-300', border: 'border-gray-500/40', bg: 'bg-gray-500/10' },
  miner: { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
  military: { dot: 'bg-red-400', text: 'text-red-300', border: 'border-red-500/40', bg: 'bg-red-500/10' },
  research: { dot: 'bg-sky-400', text: 'text-sky-300', border: 'border-sky-500/40', bg: 'bg-sky-500/10' },
  colonizer: { dot: 'bg-fuchsia-400', text: 'text-fuchsia-300', border: 'border-fuchsia-500/40', bg: 'bg-fuchsia-500/10' },
  custom: { dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-500/40', bg: 'bg-amber-500/10' },
};

export function OverviewPage() {
  const { currentPlanet, resources, technologies, fleets, renamePlanet, abandonColony, setPlanetAutopilotRole, setPlanetAutopilotEnabled } = useGameStore();
  const { profile, fetchProfile } = useAuthStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [, setTick] = useState(0);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [abandonLoading, setAbandonLoading] = useState(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameCosts, setRenameCosts] = useState<{ planet_cost: number; planet_cost_vip: number; is_vip: boolean } | null>(null);
  const [lotteryData, setLotteryData] = useState<{ jackpot: number; tickets: number; drawNumber: number; closesAt: string; tungPriceUsd: number | null } | null>(null);
  const [incomingAttacks, setIncomingAttacks] = useState<IncomingAttack[]>([]);
  const [userFortresses, setUserFortresses] = useState<any[]>([]);
  const [treasurePlanet, setTreasurePlanet] = useState<any | null>(null);
  const [isUserPlus, setIsUserPlus] = useState(false);
  const [hasAutopilotAccess, setHasAutopilotAccess] = useState(false);
  const [androidOfficerExpiresAt, setAndroidOfficerExpiresAt] = useState<string | null>(null);
  const [autopilotActive, setAutopilotActive] = useState(false);
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [autopilotRole, setAutopilotRole] = useState<PlanetAutopilotRole>('balanced');
  const [autopilotRoleSaving, setAutopilotRoleSaving] = useState(false);
  const [autopilotEnabled, setAutopilotEnabled] = useState(true);
  const [autopilotEnabledSaving, setAutopilotEnabledSaving] = useState(false);
  const [autopilotVipBoost, setAutopilotVipBoost] = useState(false);
  const [autopilotVipExpiresAt, setAutopilotVipExpiresAt] = useState<string | null>(null);
  const [autopilotVipSaving, setAutopilotVipSaving] = useState(false);
  const [autopilotVipError, setAutopilotVipError] = useState<string | null>(null);
  const [customOrders, setCustomOrders] = useState<{ buildings: Record<string, number>; ships: Record<string, number>; defenses: Record<string, number>; research: Record<string, number> }>({ buildings: {}, ships: {}, defenses: {}, research: {} });
  const [customOrdersLoading, setCustomOrdersLoading] = useState(false);
  const [customOrdersSaving, setCustomOrdersSaving] = useState(false);
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const [autopilotEvents, setAutopilotEvents] = useState<Array<{ id: string; event_type: string; payload: Record<string, unknown> | null; created_at: string; planet_id: string | null }>>([]);
  const [autopilotStats, setAutopilotStats] = useState<Record<string, number>>({});
  const [showAutopilotEvents, setShowAutopilotEvents] = useState(false);
  const [autopilotEventsLoading, setAutopilotEventsLoading] = useState(false);

  // Cargar alianza del usuario y sus fortalezas
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      // Obtener alliance_id del usuario
      const { data: memberData } = await supabase
        .from('alliance_members')
        .select('alliance_id')
        .eq('user_id', profile.id)
        .maybeSingle();
      if (cancelled) return;
      const aid = memberData?.alliance_id || null;

      // Obtener fortalezas via RPC (SECURITY DEFINER, evita RLS) y filtrar por alianza
      if (aid) {
        const { data } = await supabase.rpc('get_all_fortresses');
        if (!cancelled && data?.success && Array.isArray(data.fortresses)) {
          setUserFortresses(
            data.fortresses.filter((f: any) => f.owner_alliance_id === aid)
          );
        }
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  // Cargar info del (unico) Planeta del Tesoro, para mostrar dueno actual + atajo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_all_treasure_planets');
      if (!cancelled && data?.success && Array.isArray(data.treasure_planets) && data.treasure_planets.length > 0) {
        setTreasurePlanet(data.treasure_planets[0]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch lottery info for the banner
  const fetchLotteryData = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('get_lottery_info');
      if (data?.active_draw) {
        setLotteryData({
          jackpot: Math.floor(data.active_draw.prize_pool || 0),
          tickets: data.active_draw.total_tickets || 0,
          drawNumber: data.active_draw.draw_number || 1,
          closesAt: data.active_draw.closes_at || '',
          tungPriceUsd: data.tung_price_usd != null ? Number(data.tung_price_usd) : null,
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchLotteryData();
    const lotteryInterval = setInterval(fetchLotteryData, 60000);
    return () => clearInterval(lotteryInterval);
  }, [fetchLotteryData]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch incoming attacks periodically
  useEffect(() => {
    if (!profile) return;
    const fetchIncoming = async () => {
      try {
        const { data, error } = await supabase.rpc('get_incoming_attacks', { p_user_id: profile.id });
        if (!error && data) {
          setIncomingAttacks(Array.isArray(data) ? data : []);
        }
      } catch {
        // Silent fail - non-critical feature
      }
    };
    fetchIncoming();
    const interval = setInterval(fetchIncoming, 10000);
    return () => clearInterval(interval);
  }, [profile]);

  // Load rename costs and check Plus status
  useEffect(() => {
    const loadCosts = async () => {
      try {
        const { data } = await supabase.rpc('get_rename_costs');
        if (data) setRenameCosts(data);
      } catch {}
    };
    loadCosts();
  }, []);

  useEffect(() => {
    if (!profile) return;
    const checkPlus = async () => {
      try {
        const { data } = await supabase
          .from('plus_subscriptions')
          .select('id')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        setIsUserPlus(!!data);
      } catch {
        setIsUserPlus(false);
      }
    };
    checkPlus();
  }, [profile]);

  // Check autopilot access: admin-granted (autopilot_eligible) OR active Android Officer OR already active
  // Initialize immediately from profile to avoid flicker
  useEffect(() => {
    if (!profile?.id) return;
    setAutopilotActive(profile.autopilot_active ?? false);
    // Start with profile flags as initial value: eligible (admin-granted) OR already active
    setHasAutopilotAccess((profile.autopilot_eligible || profile.autopilot_active) ?? false);
    let cancelled = false;
    (async () => {
      const { data: accessData, error: accessError } = await supabase.rpc('has_autopilot_access', {
        p_user_id: profile.id,
      });
      if (cancelled) return;
      const hasAccess = !accessError && accessData === true;
      setHasAutopilotAccess(hasAccess);

      // 2) Fetch android officer expiry separately for the trial countdown UI
      let androidExpiry: string | null = null;
      if (hasAccess && !profile.autopilot_eligible) {
        const { data: officerRows } = await supabase
          .from('user_officers')
          .select('expires_at, officer_type_id, officer_types!inner(code)')
          .eq('user_id', profile.id)
          .eq('officer_types.code', 'android')
          .gt('expires_at', new Date().toISOString())
          .order('expires_at', { ascending: false })
          .limit(1);
        if (cancelled) return;
        if (officerRows && officerRows.length > 0) {
          androidExpiry = officerRows[0].expires_at as string;
        }
      }
      setAndroidOfficerExpiresAt(androidExpiry);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.autopilot_eligible, profile?.autopilot_active]);

  useEffect(() => {
    setAutopilotRole(currentPlanet?.autopilot_role || 'balanced');
  }, [currentPlanet?.id, currentPlanet?.autopilot_role]);

  useEffect(() => {
    setAutopilotEnabled(currentPlanet?.autopilot_enabled ?? true);
  }, [currentPlanet?.id, currentPlanet?.autopilot_enabled]);

  // Load custom orders when planet changes
  useEffect(() => {
    if (!currentPlanet?.id) return;
    const role = currentPlanet.autopilot_role || 'balanced';
    if (role === 'custom') {
      setShowCustomPanel(true);
      setCustomOrdersLoading(true);
      supabase.rpc('get_ai_custom_orders', { p_planet_id: currentPlanet.id })
        .then(({ data }) => {
          if (data) setCustomOrders(data as typeof customOrders);
          setCustomOrdersLoading(false);
        }, () => setCustomOrdersLoading(false));
    } else {
      setShowCustomPanel(false);
    }
  }, [currentPlanet?.id, currentPlanet?.autopilot_role]);

  useEffect(() => {
    setAutopilotVipBoost(profile?.autopilot_vip_boost ?? false);
    setAutopilotVipExpiresAt(profile?.autopilot_vip_boost_expires_at ?? null);
  }, [profile?.autopilot_vip_boost, profile?.autopilot_vip_boost_expires_at]);

  const loadAutopilotEvents = useCallback(async () => {
    if (!currentPlanet?.id) return;
    setAutopilotEventsLoading(true);
    try {
      const [{ data: evData }, { data: statsData }] = await Promise.all([
        supabase.rpc('get_autopilot_events', { p_planet_id: currentPlanet.id, p_limit: 20 }),
        supabase.rpc('get_autopilot_stats', { p_hours: 24 }),
      ]);
      const evPayload = evData as { success: boolean; events?: unknown } | null;
      if (evPayload?.success && Array.isArray(evPayload.events)) {
        setAutopilotEvents(evPayload.events as typeof autopilotEvents);
      } else if (Array.isArray(evData)) {
        setAutopilotEvents(evData as typeof autopilotEvents);
      }
      const statsPayload = statsData as { success: boolean; stats?: Record<string, number> } | null;
      if (statsPayload?.success && statsPayload.stats) {
        setAutopilotStats(statsPayload.stats);
      }
    } catch {
      // silent
    } finally {
      setAutopilotEventsLoading(false);
    }
  }, [currentPlanet?.id]);

  // Realtime: suscribirse a nuevos eventos del piloto automático del jugador
  useEffect(() => {
    if (!showAutopilotEvents || !profile?.id) return;
    loadAutopilotEvents();
    const channel = supabase
      .channel(`autopilot_events_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'autopilot_events',
          filter: `user_id=eq.${profile.id}`,
        },
        () => { loadAutopilotEvents(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [showAutopilotEvents, profile?.id, loadAutopilotEvents]);

  const handleToggleVipBoost = async () => {
    setAutopilotVipSaving(true);
    setAutopilotVipError(null);
    const enable = !autopilotVipBoost;
    try {
      const { data, error } = await supabase.rpc('toggle_autopilot_vip_boost', { p_enable: enable });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (result?.success) {
        setAutopilotVipBoost(enable);
        await fetchProfile();
      } else {
        setAutopilotVipError(result?.error || 'error');
      }
    } catch (err) {
      setAutopilotVipError((err as Error).message || 'error');
    } finally {
      setAutopilotVipSaving(false);
    }
  };

  const handleToggleAutopilot = async (enable: boolean) => {
    setAutopilotLoading(true);
    try {
      const { data, error } = await supabase.rpc('toggle_autopilot', { p_enable: enable });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (result.success) {
        setAutopilotActive(enable);
        await fetchProfile();
      }
    } catch (err) {
      console.error('Error toggling autopilot:', err);
    } finally {
      setAutopilotLoading(false);
    }
  };

  const handleAutopilotRoleChange = async (role: PlanetAutopilotRole) => {
    if (!currentPlanet || role === (currentPlanet.autopilot_role || 'balanced')) {
      setAutopilotRole(role);
      return;
    }

    setAutopilotRole(role);
    setAutopilotRoleSaving(true);
    const result = await setPlanetAutopilotRole(role);
    if (!result.success) {
      setAutopilotRole(currentPlanet.autopilot_role || 'balanced');
    }
    setAutopilotRoleSaving(false);
  };

  const handleToggleAutopilotEnabled = async (enabled: boolean) => {
    if (!currentPlanet) return;
    const previous = currentPlanet.autopilot_enabled ?? true;
    setAutopilotEnabled(enabled);
    setAutopilotEnabledSaving(true);
    const result = await setPlanetAutopilotEnabled(enabled);
    if (!result.success) {
      setAutopilotEnabled(previous);
    }
    setAutopilotEnabledSaving(false);
  };

  const handleSaveCustomOrders = async () => {
    if (!currentPlanet) return;
    setCustomOrdersSaving(true);
    try {
      await supabase.rpc('save_ai_custom_orders', {
        p_planet_id: currentPlanet.id,
        p_buildings: customOrders.buildings,
        p_ships: customOrders.ships,
        p_defenses: customOrders.defenses,
        p_research: customOrders.research,
      });
    } catch (e) {
      console.error('Error saving custom orders:', e);
    }
    setCustomOrdersSaving(false);
  };

  const updateCustomOrder = (category: 'buildings' | 'ships' | 'defenses' | 'research', code: string, value: number | null) => {
    setCustomOrders(prev => {
      const updated = { ...prev, [category]: { ...prev[category] } };
      if (value === null || value <= 0) {
        delete updated[category][code];
      } else {
        updated[category][code] = value;
      }
      return updated;
    });
  };

  const handleRename = async () => {
    if (!newName.trim() || newName === currentPlanet?.name) {
      setIsEditing(false);
      return;
    }
    // If planet has name_changed (already used free rename), show confirmation with cost
    // We check by trying the RPC - if it costs 0, it was free
    setRenameLoading(true);
    setRenameError(null);
    const result = await renamePlanet(newName.trim());
    if (result.success) {
      setIsEditing(false);
      if (result.cost && result.cost > 0) {
        await fetchProfile();
      }
    } else {
      setRenameError(result.error || 'Error');
    }
    setRenameLoading(false);
  };

  const handleAbandonColony = async () => {
    if (!currentPlanet || currentPlanet.is_main_planet) return;
    setAbandonLoading(true);
    setAbandonError(null);
    try {
      const result = await abandonColony(currentPlanet.id);
      if (result.success) {
        setShowAbandonConfirm(false);
        await fetchProfile();
      } else {
        setAbandonError(result.error || 'Error abandoning colony');
      }
    } catch {
      setAbandonError('Error processing request');
    } finally {
      setAbandonLoading(false);
    }
  };

  const abandonFee = 0;
  const canAffordAbandonFxu = true;

  const { shipyardQueue, buildingQueue } = useGameStore();
  const buildingQueueItem = buildingQueue.find((q) => q.queue_position === 1);
  const researchInProgress = technologies.find((t) => t.is_researching);
  const activeFleets = fleets.filter((f) => !f.is_completed);
  const shipQueueItem = shipyardQueue.find((q) => q.item_type === 'ship' && q.queue_position === 1);
  const defenseQueueItem = shipyardQueue.find((q) => q.item_type === 'defense' && q.queue_position === 1);

  if (!currentPlanet || !resources) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
      </div>
    );
  }

  const planetGlow = profile?.active_planet_effect ? PLANET_EFFECT_GLOW[profile.active_planet_effect] : null;

  return (
    <div className="space-y-6">
      {/* Incoming Attacks Section - Full width, above everything */}
      {incomingAttacks.length > 0 && (
        <div className="card-glass p-4 sm:p-6 border border-cyber-red/40 bg-cyber-red/5 relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 pointer-events-none bg-gradient-to-r from-red-600/20 to-transparent" />
          <h3 className="font-orbitron text-base sm:text-lg text-cyber-red mb-3 sm:mb-4 flex items-center gap-2 relative z-10">
            <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 text-cyber-red animate-pulse flex-shrink-0" />
            {t.fleet.incomingAttacks} ({incomingAttacks.length})
          </h3>
          <div className="space-y-3 sm:space-y-4 relative z-10">
            {incomingAttacks.map((attack) => {
              const timeRemaining = formatTimeRemaining(attack.arrival_time);
              const isWithdrawing = attack.is_returning;
              // Calcular progreso del vuelo
              const now = Date.now();
              const departure = new Date(attack.departure_time).getTime();
              const arrival = new Date(attack.arrival_time).getTime();
              const totalFlightTime = arrival - departure;
              const elapsed = now - departure;
              const progress = totalFlightTime > 0 ? Math.min(100, Math.max(0, (elapsed / totalFlightTime) * 100)) : 0;
              // Total de naves
              const totalShips = attack.ships ? attack.ships.reduce((sum, s) => sum + s.quantity, 0) : 0;

              return (
                <div
                  key={attack.fleet_id}
                  className={`p-3 sm:p-4 rounded-xl border ${
                    isWithdrawing
                      ? 'bg-cyber-green/10 border-cyber-green/30'
                      : 'bg-cyber-red/10 border-cyber-red/30'
                  }`}
                >
                  {/* Header: Mission type + Countdown */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-1 sm:gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {isWithdrawing ? (
                        <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 text-cyber-green flex-shrink-0" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-cyber-red flex-shrink-0 animate-pulse" />
                      )}
                      <span className={`text-xs sm:text-sm font-bold uppercase tracking-wide truncate ${
                        isWithdrawing ? 'text-cyber-green' : 'text-cyber-red'
                      }`}>
                        {t.fleet.hostileFleet} — {t.fleet[attack.mission_type as keyof typeof t.fleet] || attack.mission_type}
                      </span>
                      {isWithdrawing && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-cyber-green/20 text-cyber-green rounded-full flex-shrink-0">
                          {t.fleet.attackerWithdrew}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`font-orbitron text-base sm:text-lg ${
                        isWithdrawing ? 'text-cyber-green' : 'text-cyber-red animate-pulse'
                      }`}>
                        {isWithdrawing ? t.fleet.attackerWithdrew : timeRemaining}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {!isWithdrawing && (
                    <div className="w-full h-1.5 bg-space-700 rounded-full mb-3 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyber-red/60 to-cyber-red rounded-full transition-all duration-1000"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}

                  {/* Attack route: Origin → Target */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs sm:text-sm mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">{t.fleet.attacker}:</span>
                      <span className="text-white font-semibold">{attack.attacker_name}</span>
                      <span className="text-gray-500 font-mono">[{attack.origin_galaxy}:{attack.origin_system}:{attack.origin_position}]</span>
                    </div>
                    <span className="text-cyber-red hidden sm:inline">→</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">{t.fleet.targetPlanet}:</span>
                      <span className="text-white font-semibold">{translatePlanetName(attack.target_planet_name)}</span>
                      <span className="text-gray-500 font-mono">[{attack.target_galaxy}:{attack.target_system}:{attack.target_position}]</span>
                    </div>
                  </div>

                  {/* Arrival time */}
                  {!isWithdrawing && (
                    <div className="text-[10px] sm:text-xs text-gray-500 mb-2">
                      {t.fleet.arrival}: {new Date(attack.arrival_time).toLocaleTimeString()}
                    </div>
                  )}

                  {/* Fleet composition - based on espionage level */}
                  {attack.can_see_fleet && attack.ships && attack.ships.length > 0 ? (
                    <div className="mt-2 p-2 sm:p-3 bg-space-800/60 rounded-lg border border-space-600/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs sm:text-sm text-gray-400 font-semibold">
                          {t.fleet.fleetComposition}
                        </span>
                        <span className="text-xs text-cyber-red font-orbitron">
                          {t.fleet.totalShips}: {totalShips.toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2">
                        {attack.ships.map((ship, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1.5 p-1.5 bg-space-700/50 rounded-md border border-space-600/20"
                          >
                            <Swords className="w-3 h-3 sm:w-4 sm:h-4 text-cyber-red/70 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] sm:text-xs text-gray-300 truncate">{translateShipName(t, ship.ship_code, ship.ship_name)}</p>
                              <p className="text-xs sm:text-sm text-cyber-red font-bold">x{ship.quantity.toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : !attack.can_see_fleet && !isWithdrawing ? (
                    <div className="mt-2 p-2 bg-space-800/40 rounded-lg border border-amber-500/20">
                      <p className="text-[10px] sm:text-xs text-amber-400/80 italic flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        {t.fleet.espionageInsufficient}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Command Center - oculto */}
      {false && (
      <div className="card-glass p-4 sm:p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-cyber-blue/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyber-purple/5 rounded-full blur-3xl pointer-events-none" />
        <h3 className="font-orbitron text-base sm:text-lg text-white mb-3 sm:mb-4 flex items-center gap-2 relative z-10">
          <Activity className="w-5 h-5 text-cyber-blue flex-shrink-0" />
          {t.overview.commandCenter}
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
          <ResourceMeter emoji="🔩" label={t.resources.metal} amount={resources.metal} capacity={resources.metal_storage} perHour={resources.metal_per_hour} color="from-slate-400 to-slate-300" />
          <ResourceMeter emoji="💎" label={t.resources.crystal} amount={resources.crystal} capacity={resources.crystal_storage} perHour={resources.crystal_per_hour} color="from-cyan-500 to-blue-400" />
          <ResourceMeter emoji="🛢️" label={t.resources.deuterium} amount={resources.deuterium} capacity={resources.deuterium_storage} perHour={resources.deuterium_per_hour} color="from-emerald-500 to-green-400" />
          <EnergyMeter label={t.resources.energy} used={resources.energy_used} max={resources.energy_max} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 relative z-10">
          <StatusChip icon={<Building2 className="w-3.5 h-3.5" />} label={t.nav.buildings} active={!!buildingQueueItem} info={buildingQueueItem ? formatTimeRemaining(buildingQueueItem.end_time) : undefined} />
          <StatusChip icon={<Microscope className="w-3.5 h-3.5" />} label={t.nav.research} active={!!researchInProgress} info={researchInProgress?.research_end_time ? formatTimeRemaining(researchInProgress.research_end_time) : undefined} />
          <StatusChip icon={<Rocket className="w-3.5 h-3.5" />} label={t.nav.shipyard} active={!!shipQueueItem} info={shipQueueItem?.current_unit_end_time ? formatTimeRemaining(shipQueueItem.current_unit_end_time) : undefined} />
          <StatusChip icon={<Shield className="w-3.5 h-3.5" />} label={t.nav.defense} active={!!defenseQueueItem} info={defenseQueueItem?.current_unit_end_time ? formatTimeRemaining(defenseQueueItem.current_unit_end_time) : undefined} />
          <StatusChip icon={<Rocket className="w-3.5 h-3.5" />} label={t.fleet.activeFleets} active={activeFleets.length > 0} info={activeFleets.length > 0 ? `×${activeFleets.length}` : undefined} />
          {incomingAttacks.length > 0 && (
            <StatusChip icon={<ShieldAlert className="w-3.5 h-3.5" />} label={t.fleet.incomingAttacks} danger info={`×${incomingAttacks.length}`} />
          )}
        </div>
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Banner principal: racha diaria + bonos activos */}
          <div className="card-glass overflow-hidden">
            <div className="xn-hero-banner h-32 sm:h-40 flex items-center justify-center overflow-hidden">
              {OVERVIEW_BANNER_IMG && (
                <img src={OVERVIEW_BANNER_IMG} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#1c1208] via-transparent to-transparent pointer-events-none" />
              <div className="relative flex flex-col items-center">
                <img src="/Imagenes/Visuales/main_city.webp" alt="Imperium" className="w-12 h-12 sm:w-16 sm:h-16 object-contain drop-shadow-[0_0_14px_rgba(245,158,11,0.7)]" draggable={false} />
                <div className="mt-1 px-5 sm:px-7 py-1 rounded-lg border border-amber-500/40 bg-[#1c1208]/75 shadow-[0_0_18px_rgba(245,158,11,0.25)] font-orbitron text-lg sm:text-2xl font-bold tracking-[0.15em] text-amber-100 drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]">
                  IMPERIUM
                </div>
              </div>
            </div>
            <div className="p-3 sm:p-4 space-y-3">
              <PeaceShieldWidget />
              <DailyStreakBanner />
              <ActiveBonusesPanel variant="bar" />
            </div>
          </div>

          <div className="card-glass overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-cyan-400/15">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="xn-icon-badge w-9 h-9">
                  <Globe className="w-5 h-5 text-cyan-300" />
                </div>
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="input-cyber py-2 px-3 sm:px-4 text-base sm:text-xl font-orbitron w-40 sm:w-auto"
                        autoFocus
                        maxLength={24}
                      />
                      <button
                        onClick={handleRename}
                        disabled={renameLoading}
                        className="p-2 bg-cyber-green/20 rounded-lg hover:bg-cyber-green/30 transition-colors disabled:opacity-50"
                      >
                        {renameLoading ? (
                          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-cyber-green/30 border-t-cyber-green rounded-full animate-spin" />
                        ) : (
                          <Check className="w-4 h-4 sm:w-5 sm:h-5 text-cyber-green" />
                        )}
                      </button>
                      <button
                        onClick={() => { setIsEditing(false); setRenameError(null); }}
                        className="p-2 bg-cyber-red/20 rounded-lg hover:bg-cyber-red/30 transition-colors"
                      >
                        <X className="w-4 h-4 sm:w-5 sm:h-5 text-cyber-red" />
                      </button>
                    </div>
                    {renameCosts && (
                      <p className="text-xs text-amber-400 flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        {t.overview.renameCost}: {renameCosts.is_vip ? renameCosts.planet_cost_vip : renameCosts.planet_cost} TUNG
                        {renameCosts.is_vip && <span className="text-green-400">(VIP -50%)</span>}
                      </p>
                    )}
                    {renameError && (
                      <p className="text-xs text-red-400">{renameError}</p>
                    )}
                  </div>
                ) : (
                  <>
                    <h1 className="font-serif text-lg sm:text-2xl text-amber-100 tracking-wide truncate">{translatePlanetName(currentPlanet.name)}</h1>
                    <button
                      onClick={() => {
                        setNewName(currentPlanet.name);
                        setIsEditing(true);
                      }}
                      className="p-2 hover:bg-space-600 rounded-lg transition-colors flex-shrink-0"
                    >
                      <Edit2 className="w-4 h-4 text-gray-400" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 text-amber-200 flex-shrink-0 self-start sm:self-auto px-3 py-1 rounded-lg border border-amber-600/40 bg-stone-900/60">
                <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="font-serif text-sm sm:text-base">
                  {formatCoordinates(currentPlanet.galaxy, currentPlanet.solar_system, currentPlanet.position)}
                </span>
              </div>
            </div>
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <div className="relative flex-shrink-0">
                {planetGlow && (
                  <>
                    {/* Resplandor tipo sol detras del planeta */}
                    <div className={`absolute -inset-4 rounded-full ${planetGlow.glow} blur-2xl animate-pulse pointer-events-none`} style={{ animationDuration: '2.5s' }} />
                    <div className={`absolute -inset-2 rounded-full ${planetGlow.glow} blur-xl opacity-70 animate-pulse pointer-events-none`} style={{ animationDuration: '3.5s' }} />
                  </>
                )}
                <div className={`relative z-10 w-32 h-32 sm:w-40 sm:h-40 rounded-xl overflow-hidden border-2 ${
                  planetGlow ? `ring-4 ${planetGlow.ring} shadow-2xl border-white/20` : 'border-amber-600/40'
                }`}>
                  <img
                    src={currentPlanet.planet_type === 'moon' ? '/Imagenes/castra de diana/Campamento romano bajo la luna llena_11zon.webp' : '/Imagenes/Visuales/overview_city.webp'}
                    alt={t.galaxy.planet}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
                {planetGlow && (
                  <div className="absolute -top-2 -left-2 z-20 w-7 h-7 rounded-full bg-space-900/90 border border-white/25 flex items-center justify-center text-sm animate-pulse shadow-lg" style={{ animationDuration: '2s' }} title={`Efecto: ${planetGlow.label}`}>
                    {planetGlow.emoji}
                  </div>
                )}
                <div className="absolute -bottom-2 -right-2 z-20 px-3 py-1 bg-stone-900/90 border border-amber-600/40 rounded-full">
                  <span className="text-xs text-amber-200 font-serif">
                    {currentPlanet.planet_type === 'moon' ? t.overview.moon : t.galaxy.planet}
                  </span>
                </div>
              </div>

              <div className="flex-1 w-full grid grid-cols-2 gap-3 sm:gap-4">
                <StatItem
                  icon={<Globe className="w-5 h-5" />}
                  label={t.overview.diameter}
                  value={`${currentPlanet.diameter.toLocaleString()} km`}
                />
                <StatItem
                  icon={<Grid3X3 className="w-5 h-5" />}
                  label={t.overview.fields}
                  value={`${currentPlanet.fields_used} / ${currentPlanet.fields_max}`}
                  highlight={currentPlanet.fields_used >= currentPlanet.fields_max}
                />
                <StatItem
                  icon={<Thermometer className="w-5 h-5" />}
                  label={t.overview.temperature}
                  value={`${currentPlanet.temp_min}°C - ${currentPlanet.temp_max}°C`}
                />
                <StatItem
                  icon={<Clock className="w-5 h-5" />}
                  label="Hora Imperial"
                  value={new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                />
              </div>
              {OVERVIEW_PLANET_DECOR_IMG && (
                <img
                  src={OVERVIEW_PLANET_DECOR_IMG}
                  alt=""
                  className="hidden xl:block w-44 2xl:w-56 max-h-44 object-contain flex-shrink-0 drop-shadow-[0_0_18px_rgba(0,170,255,0.35)] pointer-events-none"
                  draggable={false}
                />
              )}
            </div>
          </div>

          {/* Deposit info for colonies */}
          {!currentPlanet.is_main_planet && <DepositInfo planetId={currentPlanet.id} />}

          {/* Abandon Colony Button - only for non-homeworld colonies */}
          {!currentPlanet.is_main_planet && (
            <button
              onClick={() => { setAbandonError(null); setShowAbandonConfirm(true); }}
              className="w-full p-3 sm:p-4 rounded-xl border border-red-500/30 bg-red-900/10 hover:bg-red-900/20 transition-colors flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div className="text-left">
                  <p className="text-red-400 font-semibold text-sm sm:text-base">Abandonar Colonia</p>
                  <p className="text-gray-500 text-xs">Destruye esta colonia permanentemente</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                <span className="text-green-400 font-bold text-sm">Gratis</span>
              </div>
            </button>
          )}

          {/* Rifa: solo se renderiza si hay una rifa abierta. Va arriba del Piloto
              Automatico para que sea lo primero que se vea en el panel. */}
          <RaffleBanner />

          {/* Comunidad de WhatsApp: position fixed, no desplaza nada de la pagina */}
          <WhatsAppFloatingButton />

          {(() => {
            const ap = t.overview.autopilot;
            const roleLabels: Record<PlanetAutopilotRole, string> = {
              balanced: ap.roleBalanced,
              miner: ap.roleMiner,
              military: ap.roleMilitary,
              research: ap.roleResearch,
              colonizer: ap.roleColonizer,
              custom: '⚙️ Personalizado',
            };
            const roleDescs: Record<PlanetAutopilotRole, string> = {
              balanced: ap.roleBalancedDesc,
              miner: ap.roleMinerDesc,
              military: ap.roleMilitaryDesc,
              research: ap.roleResearchDesc,
              colonizer: ap.roleColonizerDesc,
              custom: 'Tú decides exactamente qué construir, investigar y fabricar.',
            };
            // Countdown VIP
            let vipRemaining = '';
            if (autopilotVipBoost && autopilotVipExpiresAt) {
              const diff = new Date(autopilotVipExpiresAt).getTime() - Date.now();
              if (diff > 0) {
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                vipRemaining = `${h}h ${m}m`;
              } else {
                vipRemaining = ap.vipBoostExpired;
              }
            }
            // Stats map: event_type (con sufijos) → etiqueta
            const statsDisplay: Array<{ label: string; count: number }> = [
              { label: ap.eventAttack, count: (autopilotStats['attack_sent'] || 0) },
              { label: ap.eventResearch, count: (autopilotStats['research_started'] || autopilotStats['research_completed'] || 0) },
              { label: ap.eventShips, count: (autopilotStats['ship_built'] || autopilotStats['ships_built'] || 0) },
              { label: ap.eventDefenses, count: (autopilotStats['defense_built'] || autopilotStats['defenses_built'] || 0) },
              { label: ap.eventTransport, count: (autopilotStats['transport_sent'] || 0) },
              { label: ap.eventColonization, count: (autopilotStats['colonization_sent'] || autopilotStats['colonization'] || 0) },
              { label: ap.eventRetaliation, count: (autopilotStats['retaliation_sent'] || 0) },
            ].filter((s) => s.count > 0);

            return (
            <div className="rounded-xl border border-cyber-purple/30 bg-gradient-to-r from-space-800/60 via-purple-950/30 to-space-800/60 p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-cyber-purple/20 flex-shrink-0">
                    <Landmark className="w-5 h-5 text-cyber-purple" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-orbitron text-sm sm:text-base text-white">{ap.title}</span>
                      {autopilotActive && (
                        <span className="px-2 py-0.5 text-[10px] bg-cyber-green/20 text-cyber-green rounded-full animate-pulse">{ap.active}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{ap.subtitle}</p>
                  </div>
                </div>
                {hasAutopilotAccess ? (
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={autopilotActive}
                      onChange={(e) => handleToggleAutopilot(e.target.checked)}
                      disabled={autopilotLoading}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 bg-space-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-purple ${autopilotLoading ? 'opacity-50' : ''}`}></div>
                  </label>
                ) : (
                  <span className="px-2 py-1 text-[10px] rounded-full bg-red-500/20 text-red-400 border border-red-500/30">🔒</span>
                )}
              </div>

              {/* Officer trial countdown */}
              {hasAutopilotAccess && androidOfficerExpiresAt && !profile?.autopilot_eligible && (() => {
                const diff = new Date(androidOfficerExpiresAt).getTime() - Date.now();
                if (diff <= 0) return null;
                const d = Math.floor(diff / 86400000);
                const h = Math.floor((diff % 86400000) / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const timeStr = d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
                return (
                  <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 flex items-center gap-2">
                    <span className="text-cyan-300 text-lg">⏱️</span>
                    <span className="text-xs text-cyan-200">{ap.officerTrialRemaining}: <span className="font-bold text-white">{timeStr}</span></span>
                  </div>
                );
              })()}

              {/* No access: show buy prompt */}
              {!hasAutopilotAccess && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-2">
                  <p className="text-xs text-red-300">{ap.officerRequired}</p>
                  <a href="/game/officers" className="inline-block px-3 py-1.5 rounded-lg bg-cyber-purple/20 border border-cyber-purple/40 text-cyber-purple text-xs font-semibold hover:bg-cyber-purple/30 transition">
                    {ap.officerBuyPrompt}
                  </a>
                </div>
              )}

              {hasAutopilotAccess && (<>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-cyber-purple/20 bg-space-900/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white flex items-center gap-2">
                    {ap.planetToggleLabel}
                    <span className={`px-2 py-0.5 text-[10px] rounded-full ${autopilotEnabled ? 'bg-cyber-green/20 text-cyber-green' : 'bg-gray-500/20 text-gray-400'}`}>
                      {autopilotEnabled ? ap.planetToggleActive : ap.planetTogglePaused}
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{ap.planetToggleDesc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={autopilotEnabled}
                    onChange={(e) => handleToggleAutopilotEnabled(e.target.checked)}
                    disabled={autopilotEnabledSaving}
                    className="sr-only peer"
                  />
                  <div className={`w-11 h-6 bg-space-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-purple ${autopilotEnabledSaving ? 'opacity-50' : ''}`}></div>
                </label>
              </div>
              {autopilotEnabledSaving && (
                <p className="text-[11px] text-cyber-blue">{ap.savingPlanetToggle}</p>
              )}
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),220px] sm:items-center">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-cyber-purple/70 mb-1 flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${AUTOPILOT_ROLE_COLORS[autopilotRole].dot}`} />
                    {ap.focusLabel}
                  </p>
                  <p className="text-xs text-gray-400">{roleDescs[autopilotRole]}</p>
                </div>
                <div className="relative">
                  <select
                    value={autopilotRole}
                    onChange={(e) => handleAutopilotRoleChange(e.target.value as PlanetAutopilotRole)}
                    disabled={autopilotRoleSaving}
                    className="w-full rounded-lg border border-cyber-purple/30 bg-space-800/90 px-3 py-2 text-sm text-white outline-none transition focus:border-cyber-purple disabled:opacity-60"
                  >
                    {AUTOPILOT_ROLE_VALUES.map((value) => (
                      <option key={value} value={value}>{roleLabels[value]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] text-gray-400">
                <span className="rounded-full border border-cyber-purple/20 bg-cyber-purple/10 px-2 py-1">{ap.chipMiner}</span>
                <span className="rounded-full border border-cyber-orange/20 bg-cyber-orange/10 px-2 py-1">{ap.chipMilitary}</span>
              </div>
              {autopilotRoleSaving && (
                <p className="text-[11px] text-cyber-blue">{ap.savingRole}</p>
              )}

              {/* Custom AI Config Panel */}
              {autopilotRole === 'custom' && showCustomPanel && (
                <div className="rounded-lg border border-amber-500/30 bg-space-900/60 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-amber-300 flex items-center gap-2">⚙️ Configuración Manual de la IA</h4>
                    <button
                      onClick={handleSaveCustomOrders}
                      disabled={customOrdersSaving}
                      className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-semibold hover:bg-amber-500/30 transition disabled:opacity-60"
                    >
                      {customOrdersSaving ? '...' : '💾 Guardar'}
                    </button>
                  </div>
                  {customOrdersLoading ? (
                    <p className="text-xs text-gray-500 text-center py-4">Cargando configuración...</p>
                  ) : (
                    <div className="space-y-3">
                      {/* Buildings */}
                      <CustomOrderSection
                        title="🏭 Edificios"
                        subtitle="Nivel deseado"
                        items={[
                          { code: 'metal_mine', name: t.buildings.metalMine },
                          { code: 'crystal_mine', name: t.buildings.crystalMine },
                          { code: 'deuterium_synthesizer', name: t.buildings.deuteriumSynthesizer },
                          { code: 'solar_plant', name: t.buildings.solarPlant },
                          { code: 'fusion_reactor', name: t.buildings.fusionReactor },
                          { code: 'metal_storage', name: t.buildings.metalStorage },
                          { code: 'crystal_storage', name: t.buildings.crystalStorage },
                          { code: 'deuterium_tank', name: t.buildings.deuteriumTank },
                          { code: 'robotics_factory', name: t.buildings.roboticsFactory },
                          { code: 'shipyard', name: t.buildings.shipyard },
                          { code: 'research_lab', name: t.buildings.researchLab },
                          { code: 'nanite_factory', name: t.buildings.naniteFactory },
                          { code: 'missile_silo', name: t.buildings.missileSilo },
                        ]}
                        values={customOrders.buildings}
                        onChange={(code, val) => updateCustomOrder('buildings', code, val)}
                        placeholder="Nv."
                      />
                      {/* Ships */}
                      <CustomOrderSection
                        title="⚔️ Tropas"
                        subtitle="Cantidad deseada"
                        items={[
                          { code: 'small_cargo', name: t.shipyard.smallCargo },
                          { code: 'large_cargo', name: t.shipyard.largeCargo },
                          { code: 'light_fighter', name: t.shipyard.lightFighter },
                          { code: 'heavy_fighter', name: t.shipyard.heavyFighter },
                          { code: 'cruiser', name: t.shipyard.cruiser },
                          { code: 'battleship', name: t.shipyard.battleship },
                          { code: 'bomber', name: t.shipyard.bomber },
                          { code: 'destroyer', name: t.shipyard.destroyer },
                          { code: 'battlecruiser', name: t.shipyard.battlecruiser },
                          { code: 'recycler', name: t.shipyard.recycler },
                          { code: 'espionage_probe', name: t.shipyard.espionageProbe },
                          { code: 'colony_ship', name: t.shipyard.colonyShip },
                          { code: 'solar_satellite', name: t.shipyard.solarSatellite },
                        ]}
                        values={customOrders.ships}
                        onChange={(code, val) => updateCustomOrder('ships', code, val)}
                        placeholder="Cant."
                      />
                      {/* Defenses */}
                      <CustomOrderSection
                        title="🛡️ Defensas"
                        subtitle="Cantidad deseada"
                        items={[
                          { code: 'rocket_launcher', name: t.defense.rocketLauncher },
                          { code: 'light_laser', name: t.defense.lightLaser },
                          { code: 'heavy_laser', name: t.defense.heavyLaser },
                          { code: 'gauss_cannon', name: t.defense.gaussCannon },
                          { code: 'ion_cannon', name: t.defense.ionCannon },
                          { code: 'plasma_turret', name: t.defense.plasmaTurret },
                          { code: 'small_shield_dome', name: t.defense.smallShieldDome },
                          { code: 'large_shield_dome', name: t.defense.largeShieldDome },
                          { code: 'anti_ballistic_missile', name: t.defense.antiBallisticMissiles },
                          { code: 'interplanetary_missile', name: t.defense.interplanetaryMissiles },
                        ]}
                        values={customOrders.defenses}
                        onChange={(code, val) => updateCustomOrder('defenses', code, val)}
                        placeholder="Cant."
                      />
                      {/* Research */}
                      <CustomOrderSection
                        title="� Investigación"
                        subtitle="Nivel deseado"
                        items={[
                          { code: 'espionage_tech', name: t.research.espionageTech },
                          { code: 'computer_tech', name: t.research.computerTech },
                          { code: 'weapons_tech', name: t.research.weaponsTech },
                          { code: 'shielding_tech', name: t.research.shieldingTech },
                          { code: 'armour_tech', name: t.research.armorTech },
                          { code: 'energy_tech', name: t.research.energyTech },
                          { code: 'hyperspace_tech', name: t.research.hyperspaceTech },
                          { code: 'combustion_drive', name: t.research.combustionDrive },
                          { code: 'impulse_drive', name: t.research.impulseDrive },
                          { code: 'hyperspace_drive', name: t.research.hyperspaceDrive },
                          { code: 'laser_tech', name: t.research.laserTech },
                          { code: 'ion_tech', name: t.research.ionTech },
                          { code: 'plasma_tech', name: t.research.plasmaTech },
                          { code: 'astrophysics', name: t.research.astrophysics },
                        ]}
                        values={customOrders.research}
                        onChange={(code, val) => updateCustomOrder('research', code, val)}
                        placeholder="Nv."
                      />
                    </div>
                  )}
                </div>
              )}

              {/* VIP Boost toggle */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-semibold text-amber-300">{ap.vipBoostTitle}</span>
                    {autopilotVipBoost && (
                      <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-300 rounded-full">{ap.vipBoostActiveBadge}</span>
                    )}
                    {autopilotVipBoost && vipRemaining && (
                      <span className="text-[10px] text-amber-200/80">{ap.vipBoostRemaining}: {vipRemaining}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{ap.vipBoostDesc}</p>
                  {autopilotVipError && (
                    <p className="text-[10px] text-red-400 mt-1">{autopilotVipError}</p>
                  )}
                </div>
                <button
                  onClick={handleToggleVipBoost}
                  disabled={autopilotVipSaving}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex-shrink-0 ${autopilotVipBoost ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 hover:bg-amber-500/30' : 'bg-space-800 border-amber-500/40 text-amber-300 hover:bg-amber-500/10'} ${autopilotVipSaving ? 'opacity-60 cursor-wait' : ''}`}
                >
                  {autopilotVipSaving ? '...' : autopilotVipBoost ? ap.vipBoostDeactivate : ap.vipBoostActivate}
                </button>
              </div>

              {/* Events panel */}
              <div className="rounded-lg border border-cyber-purple/20 bg-space-900/40">
                <button
                  onClick={() => setShowAutopilotEvents((v) => !v)}
                  className="w-full px-3 py-2 flex items-center justify-between text-xs text-gray-300 hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <Scroll className="w-3.5 h-3.5 text-cyber-purple" />
                    {ap.eventsTitle}
                  </span>
                  <span className="text-cyber-purple text-[10px]">{showAutopilotEvents ? ap.eventsHide : ap.eventsShow}</span>
                </button>
                {showAutopilotEvents && (
                  <div className="border-t border-cyber-purple/15 px-3 py-2 max-h-72 overflow-y-auto space-y-2">
                    {statsDisplay.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pb-2 border-b border-cyber-purple/10">
                        <span className="text-[10px] uppercase tracking-wider text-cyber-purple/70 mr-1 self-center">{ap.statsLast24h}:</span>
                        {statsDisplay.map((s) => (
                          <span key={s.label} className="text-[10px] px-2 py-0.5 rounded-full bg-cyber-purple/10 border border-cyber-purple/20 text-cyan-200">
                            {s.count} {s.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {autopilotEventsLoading && autopilotEvents.length === 0 && (
                      <p className="text-[11px] text-gray-500">{ap.eventsLoading}</p>
                    )}
                    {!autopilotEventsLoading && autopilotEvents.length === 0 && (
                      <p className="text-[11px] text-gray-500">{ap.eventsEmpty}</p>
                    )}
                    {autopilotEvents.map((ev) => {
                      const payload = ev.payload || {};
                      const summary = Object.entries(payload)
                        .slice(0, 3)
                        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                        .join(' · ');
                      const date = new Date(ev.created_at);
                      return (
                        <div key={ev.id} className="flex items-start gap-2 text-[11px]">
                          <span className="text-cyber-purple/80 flex-shrink-0 w-14 tabular-nums">
                            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-cyan-300 flex-shrink-0 font-semibold">{ev.event_type}</span>
                          <span className="text-gray-400 truncate">{summary}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </>)}
            </div>
            );
          })()}

          <button
            onClick={() => navigate('/game/lottery')}
            className="group block relative w-full overflow-visible rounded-xl border border-amber-600/40 hover:border-amber-500/60 transition-all duration-500 cursor-pointer"
          >
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#1c1208] via-[#2a1e13] to-[#1c1208]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,rgba(217,119,6,0.18),transparent_70%)]" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(ellipse_at_30%_50%,rgba(217,119,6,0.12),transparent_60%)]" />
            
            {/* Animated sparkles */}
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-amber-200 animate-pulse"
                style={{
                  width: `${Math.random() * 2 + 1}px`,
                  height: `${Math.random() * 2 + 1}px`,
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${Math.random() * 3 + 2}s`,
                  opacity: Math.random() * 0.6 + 0.2,
                }}
              />
            ))}

            {/* Top shine */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-40 group-hover:opacity-70 transition-opacity" />

            <div className="relative py-1 px-3 sm:px-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0 -my-4">
                  <img
                    src="https://photos.pinksale.finance/file/pinksale-logo-upload/1775067036507-327d40aa0444bcab4ac5ca7406f0eb5e.png"
                    alt="Lotería"
                    className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-[0_0_12px_rgba(217,119,6,0.7)] group-hover:drop-shadow-[0_0_20px_rgba(251,191,36,0.8)] transition-all duration-300"
                  />
                  <div className="absolute top-2 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center animate-bounce">
                    <span className="text-[8px] font-bold text-black">!</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-500">
                      Lotería Imperial
                    </span>
                  </div>
                  <p className="text-sm text-amber-200/70">¡Participa y gana el Jackpot!</p>
                </div>
              </div>

              <div className="flex items-center gap-3 sm:gap-5">
                {/* Tickets sold */}
                {lotteryData && (
                  <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg bg-stone-900/60 border border-amber-600/40">
                    <div className="flex items-center gap-1 text-amber-200">
                      <Ticket className="w-3 h-3 text-amber-300" />
                      <span className="text-xs font-bold">{lotteryData.tickets.toLocaleString()}</span>
                    </div>
                    <span className="text-[10px] text-amber-200/70">tickets comprados</span>
                  </div>
                )}
                {/* Jackpot display */}
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Trophy className="w-3.5 h-3.5 text-amber-400/70" />
                    <span className="text-[10px] text-amber-400/70 font-semibold uppercase tracking-wider">Jackpot</span>
                  </div>
                  <div className="font-serif text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300">
                    {lotteryData ? lotteryData.jackpot.toLocaleString() : '---'}
                  </div>
                  <span className="text-xs font-bold text-amber-400/50">TUNG</span>
                  {lotteryData && lotteryData.tungPriceUsd != null && lotteryData.tungPriceUsd > 0 && (
                    <div className="text-[11px] font-bold text-emerald-400">
                      ≈ ${(lotteryData.jackpot * lotteryData.tungPriceUsd).toFixed(2)} USD
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="relative px-3 sm:px-4 pb-1.5 flex items-center justify-between">
              <span className="text-[10px] text-amber-400/40 font-medium">
                {lotteryData ? `Sorteo #${lotteryData.drawNumber}` : ''}
              </span>
              <span className="text-xs text-amber-300 font-semibold group-hover:text-amber-200 transition-colors flex items-center gap-1">
                Jugar ahora
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </span>
            </div>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
            <ActivityCard
              icon={<Building2 className="w-5 h-5" />}
              title={t.nav.buildings}
              status={buildingQueueItem ? t.buildings.inProgress : t.officers.inactive}
              isActive={!!buildingQueueItem}
              detail={
                buildingQueueItem
                  ? `${buildingQueueItem.building_type ? translateBuildingName(t, buildingQueueItem.building_type.code, buildingQueueItem.building_type.name) : ''} ${t.common.level} ${buildingQueueItem.target_level}`
                  : t.overview.noQueueItems
              }
              time={buildingQueueItem?.end_time}
              color="cyber-blue"
              to="/game/buildings"
              image={OVERVIEW_CARD_IMG.buildings}
              actionLabel="Gestionar"
            />
            <ActivityCard
              icon={<Scroll className="w-5 h-5" />}
              title={t.nav.research}
              status={researchInProgress ? t.buildings.inProgress : t.officers.inactive}
              isActive={!!researchInProgress}
              detail={
                researchInProgress
                  ? `${researchInProgress.technology_type ? translateResearchName(t, researchInProgress.technology_type.code, researchInProgress.technology_type.name) : ''} ${t.common.level} ${(researchInProgress.level || 0) + 1}`
                  : t.overview.noQueueItems
              }
              time={researchInProgress?.research_end_time}
              color="cyber-green"
              to="/game/research"
              image={OVERVIEW_CARD_IMG.research}
              actionLabel="Investigar"
            />
            <ActivityCard
              icon={<Swords className="w-5 h-5" />}
              title={t.nav.shipyard}
              status={shipQueueItem ? t.buildings.inProgress : t.officers.inactive}
              isActive={!!shipQueueItem}
              detail={
                shipQueueItem
                  ? `${shipQueueItem.ship_type ? translateShipName(t, shipQueueItem.ship_type.code, shipQueueItem.ship_type.name) : ''} x${shipQueueItem.quantity - shipQueueItem.quantity_completed}`
                  : t.overview.noQueueItems
              }
              time={shipQueueItem?.current_unit_end_time}
              color="cyber-orange"
              to="/game/shipyard"
              image={OVERVIEW_CARD_IMG.shipyard}
              actionLabel="Gestionar"
            />
            <ActivityCard
              icon={<Shield className="w-5 h-5" />}
              title={t.nav.defense}
              status={defenseQueueItem ? t.buildings.inProgress : t.officers.inactive}
              isActive={!!defenseQueueItem}
              detail={
                defenseQueueItem
                  ? `${defenseQueueItem.defense_type ? translateDefenseName(t, defenseQueueItem.defense_type.code, defenseQueueItem.defense_type.name) : ''} x${defenseQueueItem.quantity - defenseQueueItem.quantity_completed}`
                  : t.overview.noQueueItems
              }
              time={defenseQueueItem?.current_unit_end_time}
              color="cyber-pink"
              to="/game/defense"
              image={OVERVIEW_CARD_IMG.defense}
              actionLabel="Gestionar"
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-glass p-4 sm:p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyber-blue/5 rounded-full blur-3xl pointer-events-none" />
            <h3 className="xn-panel-head text-base sm:text-lg mb-3 sm:mb-4 relative z-10">
              <span className="xn-icon-badge w-8 h-8">
                <Ship className="w-4 h-4 text-cyan-300" />
              </span>
              {t.fleet.activeFleets}
              {activeFleets.length > 0 && (
                <span className="ml-auto text-[11px] font-sans px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/25">{activeFleets.length}</span>
              )}
            </h3>
            {activeFleets.length > 0 ? (
              <div className="space-y-2 relative z-10">
                {activeFleets.map((fleet) => (
                  <button
                    key={fleet.id}
                    onClick={() => navigate('/game/fleet')}
                    className="w-full flex items-center gap-3 p-2 sm:p-2.5 rounded-lg border border-cyan-400/20 bg-space-900/40 hover:border-cyan-400/50 hover:bg-cyan-500/5 transition-colors text-left group"
                  >
                    <div className="xn-icon-badge w-12 h-10 sm:w-14 sm:h-11 overflow-hidden">
                      {OVERVIEW_FLEET_IMG ? (
                        <img src={OVERVIEW_FLEET_IMG} alt="" className="w-full h-full object-cover" draggable={false} />
                      ) : (
                        <Ship className={`w-5 h-5 ${fleet.is_returning ? 'text-cyber-green' : 'text-cyan-300'}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm text-white capitalize truncate">
                        {fleet.mission_type}
                        {fleet.is_returning && <span className="text-cyber-green ml-1">({t.fleet.returning})</span>}
                      </p>
                      <p className="text-[10px] sm:text-xs text-gray-400 truncate">
                        {t.fleet.destination}: [{fleet.target_galaxy}:{fleet.target_system}:{fleet.target_position}]
                      </p>
                    </div>
                    <span className={`font-orbitron text-[11px] sm:text-xs flex-shrink-0 ${fleet.is_returning ? 'text-cyber-green' : 'text-cyan-300'}`}>
                      {formatTimeRemaining((fleet.is_returning ? fleet.return_time : fleet.arrival_time) || fleet.arrival_time || fleet.departure_time || new Date())}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-cyan-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-6 sm:py-8 text-sm relative z-10">{t.fleet.noActiveFleets}</p>
            )}
          </div>

          {/* Atajo a Fortalezas de la alianza */}
          {userFortresses.length > 0 && (
            <div
              onClick={() => navigate('/game/fortress')}
              className="card-glass p-4 sm:p-5 relative overflow-hidden cursor-pointer hover:brightness-110 transition-all group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="flex items-center gap-3 mb-3 relative z-10">
                <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-purple-500/20 border border-amber-500/20">
                  <Castle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-orbitron text-sm sm:text-base text-white flex items-center gap-2">
                    Fortalezas
                    <span className="px-2 py-0.5 text-[10px] bg-amber-500/20 text-amber-300 rounded-full font-sans font-bold">
                      {userFortresses.length}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-500">Gestionar fortalezas →</p>
                </div>
              </div>
              <div className="space-y-1.5 relative z-10">
                {userFortresses.map((f: any) => (
                  <div
                    key={f.galaxy}
                    className="flex items-center justify-between bg-space-700/50 rounded-lg px-3 py-2 border border-amber-500/10"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-amber-400 font-bold">G{f.galaxy}</span>
                      <span className="text-[10px] text-slate-500">[{f.system}:{f.position}]</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3 text-slate-500" />
                      <span className="text-xs font-mono text-slate-300">{(f.total_ships || 0).toLocaleString()}</span>
                      {f.total_combat_power > 0 && (
                        <span className="text-[10px] text-amber-500/70">{(f.total_combat_power || 0).toLocaleString()}⚔</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-center text-amber-500/50 group-hover:text-amber-400/80 transition-colors relative z-10">
                Ver página de fortalezas →
              </div>
            </div>
          )}

          {/* Atajo al Planeta del Tesoro */}
          {treasurePlanet && (
            <div
              onClick={() => navigate('/game/treasure-planet')}
              className="card-glass p-4 sm:p-5 relative overflow-hidden cursor-pointer hover:brightness-110 transition-all group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="flex items-center gap-3 mb-3 relative z-10">
                <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border border-yellow-500/20">
                  <Gem className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h3 className="font-orbitron text-sm sm:text-base text-white flex items-center gap-2">
                    Ciudad del Tesoro
                  </h3>
                  <p className="text-[10px] text-slate-500">Ver detalles →</p>
                </div>
              </div>
              <div className="space-y-1.5 relative z-10">
                <div className="flex items-center justify-between bg-space-700/50 rounded-lg px-3 py-2 border border-yellow-500/10">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-yellow-400 font-bold">G{treasurePlanet.galaxy}</span>
                    <span className="text-[10px] text-slate-500">[{treasurePlanet.system}:{treasurePlanet.position}]</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {treasurePlanet.owner_alliance_id ? (
                      <span className="text-xs font-mono text-yellow-300">
                        [{treasurePlanet.owner_alliance_tag}] {treasurePlanet.owner_alliance_name}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Sin dueño</span>
                    )}
                  </div>
                </div>
                {treasurePlanet.owner_alliance_id && (
                  <div className="flex items-center justify-end gap-2 px-3">
                    <Shield className="w-3 h-3 text-slate-500" />
                    <span className="text-xs font-mono text-slate-300">{(treasurePlanet.total_ships || 0).toLocaleString()}</span>
                    {treasurePlanet.total_combat_power > 0 && (
                      <span className="text-[10px] text-yellow-500/70">{(treasurePlanet.total_combat_power || 0).toLocaleString()}⚔</span>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-2 text-[10px] text-center text-yellow-500/50 group-hover:text-yellow-400/80 transition-colors relative z-10">
                Ver página de la Ciudad del Tesoro →
              </div>
            </div>
          )}

          <div className="card-glass p-4 sm:p-6 relative overflow-hidden">
            {/* Background decoration */}
            <div 
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23f59e0b' fill-opacity='0.3' fill-rule='evenodd'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E")`,
              }}
            />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
            <h3 className="font-orbitron text-base sm:text-lg text-white mb-3 sm:mb-4 relative z-10">{t.ranking.playerCard}</h3>
            <div className="space-y-2 sm:space-y-3 relative z-10">
              {/* Rank Badge with progress */}
              <div className="mb-3 pb-3 border-b border-cyber-blue/10">
                <RankBadge pointsTotal={profile?.points_total || 0} variant="full" />
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-gray-400 text-xs sm:text-sm">{t.common.rank}</span>
                <span className="text-white font-bold text-sm sm:text-base">#{profile?.rank_position || '-'}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-gray-400 text-xs sm:text-sm">{t.common.points}</span>
                <span className="text-cyber-blue font-bold text-sm sm:text-base">
                  {profile?.points_total.toLocaleString() || 0}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-gray-400 text-xs sm:text-sm">{t.ranking.fleetRanking}</span>
                <span className="text-white text-sm sm:text-base">{profile?.points_fleet.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-gray-400 text-xs sm:text-sm">{t.ranking.defenseRanking}</span>
                <span className="text-white text-sm sm:text-base">{profile?.points_defense.toLocaleString() || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Abandon Colony Confirmation Modal */}
      {showAbandonConfirm && currentPlanet && !currentPlanet.is_main_planet && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-space-800 border border-red-500/30 rounded-xl p-5 sm:p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="font-orbitron text-lg text-red-400">Abandonar Colonia</h3>
            </div>

            <div className="space-y-3">
              <p className="text-gray-300 text-sm">
                ¿Estás seguro de que deseas abandonar <span className="text-white font-bold">{translatePlanetName(currentPlanet.name)}</span> [{formatCoordinates(currentPlanet.galaxy, currentPlanet.solar_system, currentPlanet.position)}]?
              </p>
              <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/20 space-y-1.5">
                <p className="text-red-400 text-xs font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Esta acción es IRREVERSIBLE
                </p>
                <ul className="text-gray-400 text-xs space-y-1 ml-5 list-disc">
                  <li>Todos los edificios serán destruidos</li>
                  <li>Todas las tropas y defensas serán eliminadas</li>
                  <li>Todos los recursos de la ciudad se perderán</li>
                  <li>La posición en el continente quedará libre</li>
                </ul>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-space-700/50 border border-gray-600/30">
                <span className="text-gray-400 text-sm">Costo:</span>
                <span className="font-bold text-sm text-green-400">Gratis</span>
              </div>

              {abandonError && (
                <p className="text-red-400 text-xs text-center bg-red-900/20 p-2 rounded-lg">
                  {abandonError}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowAbandonConfirm(false)}
                disabled={abandonLoading}
                className="flex-1 py-2.5 px-4 rounded-lg border border-gray-600 text-gray-400 hover:bg-space-700 transition-colors text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleAbandonColony}
                disabled={abandonLoading}
                className="flex-1 py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors text-sm font-semibold flex items-center justify-center gap-2"
              >
                {abandonLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Confirmar Abandono
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg min-w-0 border border-amber-700/40 bg-stone-900/50">
      <div className="xn-icon-badge w-9 h-9 sm:w-10 sm:h-10 text-amber-300">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-xs text-amber-200/50">{label}</p>
        <p className={`font-semibold text-xs sm:text-sm truncate ${highlight ? 'text-amber-400' : 'text-amber-50'}`}>{value}</p>
      </div>
    </div>
  );
}

function ResourceMeter({
  emoji,
  label,
  amount,
  capacity,
  perHour,
  color,
}: {
  emoji: string;
  label: string;
  amount: number;
  capacity: number;
  perHour: number;
  color: string;
}) {
  const pct = capacity > 0 ? Math.min(100, (amount / capacity) * 100) : 0;
  const isFull = capacity > 0 && amount >= capacity;
  const isNearFull = pct >= 90 && !isFull;
  const barColor = isFull
    ? 'from-red-500 to-red-400'
    : isNearFull
    ? 'from-amber-500 to-amber-400'
    : color;
  return (
    <div className="rounded-lg border border-space-600/40 bg-space-800/50 p-3">
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <span className="text-xs text-gray-300 flex items-center gap-1.5 min-w-0">
          <span className="text-base flex-shrink-0">{emoji}</span>
          <span className="truncate">{label}</span>
        </span>
        <span className={`text-[11px] font-orbitron flex-shrink-0 ${isFull ? 'text-red-400' : 'text-cyber-green'}`}>
          +{Math.round(perHour).toLocaleString()}/h
        </span>
      </div>
      <div className="text-sm font-bold text-white tabular-nums mb-1.5 truncate">
        {Math.floor(amount).toLocaleString()}
        <span className="text-[10px] text-gray-500 font-normal"> / {Math.floor(capacity).toLocaleString()}</span>
      </div>
      <div className="w-full h-1.5 bg-space-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isFull && <p className="text-[9px] text-red-400 mt-1">⚠️ Almacén lleno</p>}
    </div>
  );
}

function EnergyMeter({ label, used, max }: { label: string; used: number; max: number }) {
  const balance = max - used;
  const deficit = balance < 0;
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : used > 0 ? 100 : 0;
  return (
    <div className="rounded-lg border border-space-600/40 bg-space-800/50 p-3">
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <span className="text-xs text-gray-300 flex items-center gap-1.5 min-w-0">
          <span className="text-base flex-shrink-0">⚡</span>
          <span className="truncate">{label}</span>
        </span>
        <span className={`text-[11px] font-orbitron flex-shrink-0 ${deficit ? 'text-red-400' : 'text-cyber-green'}`}>
          {deficit ? '' : '+'}{Math.round(balance).toLocaleString()}
        </span>
      </div>
      <div className="text-sm font-bold text-white tabular-nums mb-1.5 truncate">
        {Math.floor(used).toLocaleString()}
        <span className="text-[10px] text-gray-500 font-normal"> / {Math.floor(max).toLocaleString()}</span>
      </div>
      <div className="w-full h-1.5 bg-space-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${deficit ? 'from-red-500 to-red-400' : 'from-yellow-500 to-amber-400'} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {deficit && <p className="text-[9px] text-red-400 mt-1">⚠️ Déficit de energía</p>}
    </div>
  );
}

function StatusChip({
  icon,
  label,
  active,
  info,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  info?: string;
  danger?: boolean;
}) {
  const cls = danger
    ? 'border-cyber-red/40 bg-cyber-red/10 text-cyber-red animate-pulse'
    : active
    ? 'border-cyber-green/30 bg-cyber-green/10 text-cyber-green'
    : 'border-space-600/40 bg-space-800/40 text-gray-500';
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] ${cls}`}>
      <span className="flex-shrink-0">{icon}</span>
      <span className="font-semibold">{label}</span>
      {info && <span className="opacity-80 font-orbitron tabular-nums">{info}</span>}
    </div>
  );
}

const ACTIVITY_ACCENTS: Record<string, { text: string; border: string; glow: string; chip: string; btn: string }> = {
  'cyber-blue': { text: 'text-cyan-300', border: 'hover:border-cyan-300/60', glow: 'from-cyan-500/30', chip: 'bg-cyan-500/20 text-cyan-200', btn: 'border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/15' },
  'cyber-green': { text: 'text-emerald-300', border: 'hover:border-emerald-300/60', glow: 'from-emerald-500/30', chip: 'bg-emerald-500/20 text-emerald-200', btn: 'border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/15' },
  'cyber-orange': { text: 'text-orange-300', border: 'hover:border-orange-300/60', glow: 'from-orange-500/30', chip: 'bg-orange-500/20 text-orange-200', btn: 'border-orange-400/40 text-orange-200 hover:bg-orange-500/15' },
  'cyber-pink': { text: 'text-pink-300', border: 'hover:border-pink-300/60', glow: 'from-pink-500/30', chip: 'bg-pink-500/20 text-pink-200', btn: 'border-pink-400/40 text-pink-200 hover:bg-pink-500/15' },
};

function ActivityCard({
  icon,
  title,
  status,
  isActive,
  detail,
  time,
  color,
  to,
  image,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  isActive: boolean;
  detail: string;
  time?: string;
  color: string;
  to: string;
  image?: string;
  actionLabel: string;
}) {
  const navigate = useNavigate();
  const a = ACTIVITY_ACCENTS[color] ?? ACTIVITY_ACCENTS['cyber-blue'];

  return (
    <div className={`card-glass overflow-hidden flex flex-col group transition-all duration-300 hover:-translate-y-0.5 ${a.border}`}>
      <div className="xn-hero-banner h-20 sm:h-24 overflow-hidden">
        {image ? (
          <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" draggable={false} />
        ) : (
          <>
            <div className={`absolute inset-0 bg-gradient-to-br ${a.glow} to-transparent`} />
            <div className={`absolute right-3 bottom-1 opacity-25 ${a.text} [&>svg]:w-14 [&>svg]:h-14`}>{icon}</div>
          </>
        )}
        <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm ${isActive ? a.chip : 'bg-gray-900/70 text-gray-400'}`}>
          {status}
        </span>
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`xn-icon-badge w-9 h-9 ${a.text}`}>{icon}</div>
          <h4 className="font-semibold text-white text-sm sm:text-base truncate">{title}</h4>
        </div>
        <p className="text-xs text-gray-400 mt-2 truncate">{detail}</p>
        {time && (
          <p className={`text-xs sm:text-sm ${a.text} font-orbitron mt-1`}>
            {formatTimeRemaining(time)}
          </p>
        )}
        <div className="mt-auto pt-3">
          <button
            onClick={() => navigate(to)}
            className={`w-full py-1.5 rounded-lg border text-xs font-semibold transition-colors ${a.btn}`}
          >
            {actionLabel} →
          </button>
        </div>
      </div>
    </div>
  );
}
