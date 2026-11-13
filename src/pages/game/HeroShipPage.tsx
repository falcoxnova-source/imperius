import { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, Zap, Sword, Gem, Loader2, AlertCircle, Check, Plus, Minus, RotateCcw, Coins, Star, Gauge, Heart, Wrench, Timer, Map, Package, Send, Crosshair, Box, Sparkles, Unplug, ShoppingCart, Swords, Crown, Trophy, Medal, Target, Flame } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import { rpcWithRetry } from '../../lib/rpcWithRetry';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { formatNumber } from '../../lib/utils';
import { useHeroAccess } from '../../lib/casino';
import { useI18n } from '../../lib/i18n';

interface SlotItem { id: string; name: string; rarity: string; item_level: number; attack_bonus: number; defense_bonus: number; shield_bonus: number; speed_bonus: number; loot_bonus: number; }

interface HeroShip {
  level: number; xp: number; xp_to_next: number;
  attack_points: number; defense_points: number; shield_points: number;
  speed_points: number;
  total_points: number; free_points: number; respec_cost: number;
  hp: number; hp_max: number;
  total_attack: number; total_defense: number; total_shield: number;
  total_speed: number;
  weapon_slot: SlotItem | null; shield_slot: SlotItem | null;
  module_slot: SlotItem | null; reactor_slot: SlotItem | null;
  hangar_tung_cost: number | null; hangar_usd_cost: number | null;
  hangar_repair_minutes: number;
  repair_until: string | null; repair_remaining_seconds: number;
  weapons_tech_level?: number; armour_tech_level?: number; shielding_tech_level?: number;
  research_attack?: number; research_defense?: number; research_shield?: number;
  regen_full_hours?: number;
}

interface Expedition {
  id: string; name: string; duration_minutes: number;
  xp_reward: number; hp_damage: number; min_level: number;
  prob_common?: number; prob_rare?: number; prob_epic?: number; prob_legendary?: number;
  drop_chance?: number;
}

interface ActiveExpedition {
  id: string; expedition_name: string; duration_minutes: number;
  xp_reward: number; hp_damage: number;
  started_at: string; returns_at: string;
  can_claim: boolean; remaining_seconds: number;
}

interface ClaimResult {
  success: boolean;
  xp_gained?: number;
  hp_damage?: number;
  items_found?: unknown[];
  [key: string]: unknown;
}

interface InventoryItem {
  inventory_id: string; item_id: string; name: string;
  rarity: string; description: string;
  is_repair_kit: boolean; repair_amount: number;
  slot_type: string; min_level: number; item_level: number;
  attack_bonus: number; defense_bonus: number; shield_bonus: number;
  speed_bonus: number; loot_bonus: number; quantity: number;
}

const attrs = [
  { key: 'total_attack' as const, baseKey: 'attack_points' as const, label: 'Ataque', icon: Swords, color: 'text-red-400', barColor: 'from-red-500 to-orange-400', desc: '+1% daño en batalla' },
  { key: 'total_defense' as const, baseKey: 'defense_points' as const, label: 'Defensa', icon: Shield, color: 'text-blue-400', barColor: 'from-blue-500 to-cyan-400', desc: '-0.5% bajas propias' },
  { key: 'total_shield' as const, baseKey: 'shield_points' as const, label: 'Escudo', icon: Gem, color: 'text-cyan-400', barColor: 'from-cyan-500 to-teal-400', desc: '+20.000 absorción por asalto' },
  { key: 'total_speed' as const, baseKey: 'speed_points' as const, label: 'Marcha', icon: Flame, color: 'text-yellow-400', barColor: 'from-yellow-500 to-amber-400', desc: '+1% velocidad de marcha' },
];

// [HEROREGEN1] Bonus de investigacion (armas/blindaje/escudos, +10%/nivel) calculado en el servidor
function researchBonus(ship: HeroShip, key: (typeof attrs)[number]['key']): { level: number; bonus: number } {
  if (key === 'total_attack') return { level: ship.weapons_tech_level ?? 0, bonus: ship.research_attack ?? 0 };
  if (key === 'total_defense') return { level: ship.armour_tech_level ?? 0, bonus: ship.research_defense ?? 0 };
  if (key === 'total_shield') return { level: ship.shielding_tech_level ?? 0, bonus: ship.research_shield ?? 0 };
  return { level: 0, bonus: 0 };
}

const slotConfig: Record<string, { label: string; icon: typeof Shield; color: string; border: string; pos: string }> = {
  weapon: { label: 'Gladius', icon: Crosshair, color: 'text-red-400', border: 'border-red-500/30', pos: 'left' },
  shield: { label: 'Scutum', icon: Shield, color: 'text-blue-400', border: 'border-blue-500/30', pos: 'right' },
  module: { label: 'Galea', icon: Zap, color: 'text-yellow-400', border: 'border-yellow-500/30', pos: 'top' },
  reactor: { label: 'Lorica', icon: Gem, color: 'text-green-400', border: 'border-green-500/30', pos: 'bottom' },
};

const rarityCfg: Record<string, { text: string; border: string; bg: string; badge: string; label: string }> = {
  common: { text: 'text-green-300', border: 'border-green-500', bg: 'bg-green-900/20', badge: 'bg-green-600 text-white', label: 'COMUN' },
  rare: { text: 'text-blue-300', border: 'border-blue-500', bg: 'bg-blue-900/30', badge: 'bg-blue-600 text-white', label: 'RARO' },
  epic: { text: 'text-purple-300', border: 'border-purple-500', bg: 'bg-purple-900/30', badge: 'bg-purple-600 text-white', label: 'EPICO' },
  legendary: { text: 'text-fuchsia-300', border: 'border-fuchsia-500', bg: 'bg-fuchsia-900/20', badge: 'bg-fuchsia-500 text-white', label: 'LEGENDARIO' },
};

const expCfg: Record<string, { label: string; border: string; from: string; to: string }> = {
  'Exploracion Cercana': { label: 'Facil', border: 'border-emerald-500/30', from: 'from-emerald-900/40', to: 'to-green-900/20' },
  'Incursion Media': { label: 'Media', border: 'border-amber-500/30', from: 'from-amber-900/40', to: 'to-yellow-900/20' },
  'Expedicion Profunda': { label: 'Dificil', border: 'border-red-500/30', from: 'from-red-900/40', to: 'to-rose-900/20' },
};

function VisualSlot({ slotKey, slotData, onUnequip, expeditionActive }: { slotKey: string; slotData: SlotItem | null; onUnequip: (s: string) => void; expeditionActive?: boolean }) {
  const cfg = slotConfig[slotKey];
  const Icon = cfg.icon;
  const rc = slotData ? (rarityCfg[slotData.rarity] || rarityCfg.common) : null;
  const borderColor = rc ? rc.border : 'border-slate-700/50';
  const bgColor = rc ? rc.bg : 'bg-slate-800/30';
  const textColor = rc ? rc.text : 'text-slate-600';

  return (
    <div className={`relative rounded-xl border-2 ${borderColor} ${bgColor} p-2 min-h-[80px] flex flex-col items-center justify-center transition-all duration-300 hover:border-opacity-60 group`}>
      <Icon className={`w-4 h-4 ${cfg.color} mb-1`} />
      {slotData ? (
        <>
          <div className={`text-[9px] font-bold text-center leading-tight ${textColor}`}>{slotData.name} <span className="text-[7px] opacity-60">Nv.{slotData.item_level}</span></div>
          <div className={`px-1.5 py-[1px] rounded text-[7px] font-bold uppercase tracking-wider ${rc.badge}`}>{rc.label}</div>
          <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
            {slotData.attack_bonus > 0 && <span className="text-[7px] text-red-400">+{slotData.attack_bonus}</span>}
            {slotData.defense_bonus > 0 && <span className="text-[7px] text-blue-400">+{slotData.defense_bonus}</span>}
            {slotData.shield_bonus > 0 && <span className="text-[7px] text-cyan-400">+{slotData.shield_bonus}</span>}
            {slotData.speed_bonus > 0 && <span className="text-[7px] text-yellow-400">+{slotData.speed_bonus}</span>}
            {slotData.loot_bonus > 0 && <span className="text-[7px] text-green-400">+{slotData.loot_bonus}</span>}
          </div>
          <button onClick={() => onUnequip(slotKey)} disabled={expeditionActive}
            className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity ${
              expeditionActive
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-red-500/80 hover:bg-red-500 text-white'
            }`} title={expeditionActive ? '🚀 Equipo bloqueado — la tropa esta en expedicion' : 'Desequipar'}>{"\n"}
            ×{"\n"}
          </button>
        </>
      ) : (
        <span className={`text-[8px] ${textColor} italic text-center`}>Vacio</span>
      )}
    </div>
  );
}

// [CASINO1] La Nave Heroe solo se muestra a cuentas con acceso (decidido en el servidor)
export function HeroShipPage() {
  const { profile } = useAuthStore();
  const access = useHeroAccess(profile?.id);
  const { language } = useI18n();
  if (access === null) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>;
  if (!access) return <div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-2 bg-slate-800/60 border border-slate-600/40 rounded-lg px-4 py-3 text-sm text-slate-300"><AlertCircle className="w-4 h-4" /><span>{language === 'en' ? 'The Imperial Hero will be available soon.' : 'El Héroe Imperial estará disponible próximamente.'}</span></div></div>;
  return <HeroShipPageInner />;
}

function HeroShipPageInner() {
  const { profile } = useAuthStore();
  const { currentPlanet, fetchResources } = useGameStore();
  const { t, language } = useI18n();
  const [ship, setShip] = useState<HeroShip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [respecing, setRespecing] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [tab, setTab] = useState<'stats' | 'expeditions' | 'inventory' | 'equip' | 'duel' | 'ranking'>('stats');
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [active, setActive] = useState<ActiveExpedition | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expeditionLoading, setExpeditionLoading] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<any>(null);
  const [displayedHp, setDisplayedHp] = useState(0);
  const claimingRef = useRef(false);
  const claimedIds = useRef(new Set<string>());
  const [heroSkin, setHeroSkin] = useState<string | null>(null);

  // Load hero skin from profile or RPC
  useEffect(() => {
    if (profile?.active_hero_skin) {
      setHeroSkin(profile.active_hero_skin);
    } else if (profile?.id) {
      supabase.rpc('get_user_cosmetics').then(({ data }) => {
        if (data && Array.isArray(data)) {
          const skin = data.find((c: any) => c.type === 'hero_skin' && c.equipped);
          if (skin) setHeroSkin(skin.code);
        }
      }).catch(() => {});
    }
  }, [profile?.id, profile?.active_hero_skin]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data, error: err } = await supabase.rpc('get_hero_ship', { p_user_id: profile.id });
    if (err) setError(err.message);
    else if (data) {
      const s = data as HeroShip;
      setShip(s);
      setDisplayedHp(s.hp);
    }
    setLoading(false);
  }, [profile]);

  const loadExpeditions = useCallback(async () => {
    if (!profile) return;
    const [r1, r2] = await Promise.all([
      supabase.rpc('get_hero_expeditions'),
      supabase.rpc('get_hero_active_expedition', { p_user_id: profile.id }),
    ]);
    if (r1.data) setExpeditions(r1.data as Expedition[]);
    if (r2.data) setActive(r2.data as ActiveExpedition);
  }, [profile]);

  const loadInventory = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.rpc('get_hero_inventory', { p_user_id: profile.id });
    if (data) setInventory(data as InventoryItem[]);
  }, [profile]);

  const loadAll = useCallback(async () => {
    await Promise.all([load(), loadExpeditions(), loadInventory()]);
  }, [load, loadExpeditions, loadInventory]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-reward when timer runs out
  useEffect(() => {
    if (!active || !active.can_claim) return;
    if (claimedIds.current.has(active.id)) return;
    claimedIds.current.add(active.id);
    (async () => {
      try {
        // rpcWithRetry reintenta ante 404 de recarga de esquema (PGRST202) y
        // errores de red, con backoff. Así una expedición nunca queda en blanco
        // por una ventana transitoria de PostgREST.
        const { data, error: err } = await rpcWithRetry<ClaimResult>(
          'claim_hero_expedition',
          { p_user_id: profile!.id },
          { maxAttempts: 5, delayMs: 700 }
        );
        if (err || !data?.success) {
          // Claim failed (transient error / server rejected): allow retry and
          // refresh state from the server so the section is never left blank.
          claimedIds.current.delete(active.id);
          await loadExpeditions();
          return;
        }
        await Promise.all([load(), loadInventory()]);
        setRewardMessage(data);
        setActive(null);
      } catch {
        claimedIds.current.delete(active.id);
        await loadExpeditions();
      }
    })();
  }, [active?.can_claim]);

  // HP: auto-reparacion lenta (servidor) o reparacion en hangar pagando TUNG

  // Server refetch every 10 minutes
  useEffect(() => {
    const i = setInterval(() => { load(); }, 600000);
    return () => clearInterval(i);
  }, [load]);

  // Countdown
  useEffect(() => {
    if (!active || active.can_claim) return;
    const i = setInterval(() => {
      setActive(prev => {
        if (!prev) return prev;
        const rem = Math.max(0, Math.floor((new Date(prev.returns_at).getTime() - Date.now()) / 1000));
        if (rem <= 0) return { ...prev, can_claim: true, remaining_seconds: 0 };
        return { ...prev, remaining_seconds: rem };
      });
    }, 1000);
    return () => clearInterval(i);
  }, [active?.can_claim]);

  // Repair countdown
  const [repairRemaining, setRepairRemaining] = useState(0);
  useEffect(() => {
    if (!ship?.repair_until) return;
    const update = () => {
      const rem = Math.max(0, Math.floor((new Date(ship.repair_until!).getTime() - Date.now()) / 1000));
      setRepairRemaining(rem);
      if (rem <= 0) load();
    };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, [ship?.repair_until]);

  const freePoints = ship ? ship.free_points - Object.values(pending).reduce((a, b) => a + b, 0) : 0;

  const adjust = (key: string, delta: number) => setPending(p => ({ ...p, [key]: Math.max(0, (p[key] || 0) + delta) }));

  const assign = async () => {
    if (!profile || !ship) return;
    const total = Object.values(pending).reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    setSaving(true); setMessage(null);
    const { data, error: err } = await supabase.rpc('assign_hero_points', {
      p_user_id: profile.id, p_attack: pending.attack_points || 0, p_defense: pending.defense_points || 0,
      p_shield: pending.shield_points || 0, p_speed: pending.speed_points || 0,
    });
    if (err) setMessage(err.message);
    else if (data?.success) { setMessage('Puntos asignados'); setPending({}); await load(); }
    else setMessage(data?.error || 'Error');
    setSaving(false);
  };

  const respec = async () => {
    if (!profile || !ship) return;
    if (!confirm(`Reiniciar todos los puntos por ${formatNumber(ship.respec_cost)} TUNG?`)) return;
    setRespecing(true); setMessage(null);
    const { data, error: err } = await supabase.rpc('respec_hero_ship', { p_user_id: profile.id });
    if (err) setMessage(err.message);
    else if (data?.success) { setMessage(data.message || `Puntos reiniciados (${formatNumber(ship.respec_cost)} TUNG)`); setPending({}); await load(); }
    else setMessage(data?.error || 'Error');
    setRespecing(false);
  };

  const startExpedition = async (expId: string) => {
    if (!profile) return;
    setRewardMessage(null);
    setExpeditionLoading(true); setMessage(null);
    const { data, error: err } = await supabase.rpc('start_hero_expedition', { p_user_id: profile.id, p_expedition_id: expId });
    if (err) setMessage(err.message);
    else if (data?.success) { await loadExpeditions(); await load(); if (currentPlanet) fetchResources(currentPlanet.id); }
    else setMessage(data?.error || 'Error');
    setExpeditionLoading(false);
  };

  const equipItem = async (invId: string) => {
    if (!profile) return;
    setMessage(null);
    const { data, error: err } = await supabase.rpc('equip_hero_item', { p_user_id: profile.id, p_inventory_id: invId });
    if (err) setMessage(err.message);
    else if (data?.success) { await Promise.all([load(), loadInventory()]); }
    else setMessage(data?.error || 'Error');
  };

  const repairInHangar = async () => {
    if (!profile) return;
    setMessage(null); setRepairLoading(true);
    const { data, error: err } = await supabase.rpc('repair_hero_ship_in_hangar', { p_user_id: profile.id });
    if (err) setMessage(err.message);
    else if (data?.success) { setMessage(`Reparacion iniciada (-${formatNumber(data.tung_cost)} TUNG)`); await load(); }
    else setMessage(data?.error || 'Error');
    setRepairLoading(false);
  };

  const unequipSlot = async (slot: string) => {
    if (!profile) return;
    setMessage(null);
    const { data, error: err } = await supabase.rpc('unequip_hero_item', { p_user_id: profile.id, p_slot: slot });
    if (err) setMessage(err.message);
    else if (data?.success) { await Promise.all([load(), loadInventory()]); }
    else setMessage(data?.error || 'Error');
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>;
  if (error) return <div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400"><AlertCircle className="w-4 h-4" /><span>{error}</span></div></div>;
  if (!ship) return null;

  const xpPct = Math.min(100, Math.round((ship.xp / ship.xp_to_next) * 100));
  const hpPct = ship ? Math.min(100, Math.round((displayedHp / ship.hp_max) * 100)) : 0;

  const skinBorder = heroSkin === 'skin_obsidian' ? 'border-red-500/50 shadow-red-500/20' :
    profile?.active_hero_skin === 'skin_golden' ? 'border-yellow-400/60 shadow-yellow-400/30' :
    profile?.active_hero_skin === 'skin_spectral' ? 'border-cyan-300/50 shadow-cyan-300/20' :
    profile?.active_hero_skin === 'skin_phoenix' ? 'border-orange-500/60 shadow-orange-500/30 animate-pulse' :
    'border-cyan-500/40 shadow-cyan-500/20';

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {/* Header */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border shadow-lg ${skinBorder}`}>
        <div className="absolute inset-0">
          <img src="/Imagenes/Heroe%20imerial/heroe%20imperial.webp"
            alt="" className="w-full h-full object-cover object-top opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-800/50 to-slate-900/80" />
        </div>
        <div className="relative p-5">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className={`w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden border-2 shadow-lg bg-white ${skinBorder}`}>
                <img src="/Imagenes/Heroe%20imerial/heroe%20imperial.webp"
                  alt="Héroe Imperial" className="w-full h-full object-cover object-top" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 shadow-lg shadow-green-500/50" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                {t.nav.heroShip}
                {heroSkin && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    heroSkin === 'skin_obsidian' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    heroSkin === 'skin_golden' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                    heroSkin === 'skin_spectral' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                    heroSkin === 'skin_phoenix' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : ''
                  }`}>
                    {heroSkin === 'skin_obsidian' ? '⚫ Obsidiana' :
                     heroSkin === 'skin_golden' ? '🟡 Dorada' :
                     heroSkin === 'skin_spectral' ? '💀 Espectral' :
                     heroSkin === 'skin_phoenix' ? '🔥 Fénix' : ''}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">{language === 'en' ? 'Your personal hero — level up and choose your attributes' : 'Tu héroe personal — sube de nivel y elige tus atributos'}</p>
            </div>
            <div className="text-right">
              <div className="relative">
                <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-amber-200 to-amber-500 font-serif">{ship.level}</div>
                <div className="text-[9px] text-slate-600 uppercase tracking-[0.2em] font-semibold">Nivel</div>
              </div>
            </div>
          </div>
          </div>
        </div>

      {/* Tabs */}
       <div className="relative flex gap-1 p-1 bg-slate-900/80 border border-slate-700/50 rounded-2xl shadow-inner shadow-black/30 overflow-x-auto scrollbar-thin">
        {([{ id: 'stats', label: 'Estadisticas', icon: Gauge },
           { id: 'equip', label: 'Equipamiento', icon: Crosshair },
           { id: 'expeditions', label: 'Expediciones', icon: Map },
           { id: 'inventory', label: 'Inventario', icon: Package },
              { id: 'duel', label: 'Duelo', icon: Swords },
              { id: 'ranking', label: 'Ranking', icon: Trophy }] as const).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[10px] sm:text-xs font-bold tracking-wide transition-all flex-shrink-0 ${
                tab === t.id
                  ? 'bg-gradient-to-b from-cyan-600 to-cyan-700 text-white shadow-lg shadow-cyan-600/30 border border-cyan-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border border-transparent'
              }`}>
              {tab === t.id && <div className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-8 h-0.5 bg-cyan-400 rounded-full shadow-lg shadow-cyan-400" />}
              <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />{t.label}
            </button>
          );
        })}
      </div>

      {/* Messages */}
      {message && (
        <div className={`flex items-center gap-2 text-xs px-4 py-3 rounded-xl border ${
          message.includes('Error')
            ? 'bg-red-900/30 border-red-500/30 text-red-300 shadow-lg shadow-red-500/5'
            : 'bg-emerald-900/30 border-emerald-500/30 text-emerald-300 shadow-lg shadow-emerald-500/5'
        }`}>
          {message.includes('Error') ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <Check className="w-3.5 h-3.5 shrink-0" />}
          <span>{message}</span>
        </div>
      )}

      {/* Rewards */}
      {rewardMessage && (
        <div className="rounded-2xl bg-gradient-to-br from-cyan-900/30 via-slate-900 to-purple-900/20 border border-cyan-500/30 shadow-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-cyan-400 tracking-wide flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />Expedicion Completada
            </h3>
            <button onClick={() => setRewardMessage(null)} className="text-xs text-slate-500 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-700/50 transition-all">Cerrar</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-3 text-center">
              <Star className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
              <div className="text-lg font-bold font-orbitron text-yellow-400">+{rewardMessage.xp_gained}</div>
              <div className="text-[10px] text-slate-500 uppercase">XP</div>
            </div>
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-3 text-center">
              <Heart className="w-4 h-4 text-red-400 mx-auto mb-1" />
              <div className="text-lg font-bold font-orbitron text-red-400">-{rewardMessage.hp_damage}</div>
              <div className="text-[10px] text-slate-500 uppercase">HP</div>
            </div>
          </div>
          {!(rewardMessage.items_found?.length > 0) && (
            <p className="text-[11px] text-slate-400 text-center">Sin botin esta vez. Cada expedicion tiene su propia probabilidad de botin.</p>
          )}
          {rewardMessage.items_found?.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Item encontrado</p>
              {rewardMessage.items_found.map((item: any, i: number) => (
                <div key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border ${(rarityCfg[item.rarity]||rarityCfg.common).border} ${(rarityCfg[item.rarity]||rarityCfg.common).bg} ${(rarityCfg[item.rarity]||rarityCfg.common).text}`}>
                  {item.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: STATS */}
      {tab === 'stats' && (
        <>
          {/* HP + XP Bars */}
          <div className="rounded-2xl bg-gradient-to-b from-slate-800/80 to-slate-900/80 border border-slate-700/50 shadow-lg p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
                  <Heart className={`w-3.5 h-3.5 ${hpPct > 50 ? 'text-green-400' : hpPct > 20 ? 'text-yellow-400' : 'text-red-400 animate-pulse'}`} />
                  <span className={hpPct > 50 ? 'text-green-400' : hpPct > 20 ? 'text-yellow-400' : 'text-red-400'}>HP</span>
                </span>
                <span className="text-xs font-bold font-mono text-slate-300">{Math.round(displayedHp)} / {ship.hp_max}</span>
              </div>
              <div className="relative h-3 bg-slate-900/80 rounded-full overflow-hidden border border-slate-700/50">
                <div className={`h-full rounded-full transition-all duration-700 ease-out ${
                  hpPct > 50 ? 'bg-gradient-to-r from-green-500 to-green-400 shadow-lg shadow-green-500/30'
                  : hpPct > 20 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400 shadow-lg shadow-yellow-500/30'
                  : 'bg-gradient-to-r from-red-600 to-red-500 shadow-lg shadow-red-500/30 animate-pulse'
                }`} style={{ width: `${hpPct}%` }} />
              </div>
              {displayedHp < ship.hp_max && (
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1.5">
                  <span className="flex items-center gap-1">
                    <Wrench className="w-3 h-3 text-cyan-400" />
                    Auto-reparacion lenta: 100% en ~{Math.round((ship.regen_full_hours ?? 336) / 24)} dias (Hangar, Robots, Nanobots). O repara en hangar pagando TUNG
                  </span>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-purple-400">
                  <Star className="w-3.5 h-3.5 text-yellow-400" />EXP
                </span>
                <span className="text-xs font-bold font-mono text-slate-300">{formatNumber(ship.xp)} / {formatNumber(ship.xp_to_next)}</span>
              </div>
              <div className="relative h-3 bg-slate-900/80 rounded-full overflow-hidden border border-slate-700/50">
                <div className="h-full rounded-full bg-gradient-to-r from-purple-600 via-cyan-500 to-purple-400 shadow-lg shadow-purple-500/30 transition-all duration-700 ease-out" style={{ width: `${xpPct}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-700/30">
              <div className="flex items-center gap-1.5">
                <Star className="w-3 h-3 text-yellow-400" />
                <span className="text-xs text-slate-400"><span className="text-yellow-400 font-bold">{ship.total_points}</span> totales</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Gauge className="w-3 h-3 text-emerald-400" />
                <span className="text-xs text-slate-400"><span className="text-emerald-400 font-bold">{freePoints}</span> libres</span>
              </div>
            </div>
          </div>

          {/* Reparacion en hangar */}
          {displayedHp < ship.hp_max && (
            <div className="rounded-2xl bg-gradient-to-b from-slate-800/80 to-slate-900/80 border border-slate-700/50 shadow-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Reparacion</h3>
              </div>

              {ship.repair_until && repairRemaining > 0 ? (
                /* Reparando en hangar — countdown */
                <div className="rounded-xl bg-gradient-to-br from-cyan-900/40 via-slate-900 to-cyan-900/20 border border-cyan-500/30 p-4 text-center">
                  <div className="text-3xl font-bold font-orbitron text-cyan-400 mb-1 tracking-wider">
                    {Math.floor(repairRemaining / 60)}:{(repairRemaining % 60).toString().padStart(2, '0')}
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Reparando en hangar...</div>
                </div>
              ) : (
                /* Opciones de reparacion */
                <div className="grid grid-cols-1 gap-3">
                  {/* [HEROTUNG1] Reparacion en hangar pagando TUNG */}
                  {(
                    <div className="rounded-xl bg-slate-900/60 border border-slate-700/30 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <Timer className="w-3 h-3 text-cyan-400" />
                        <span>Hangar: <span className="text-cyan-300 font-semibold">{ship.hangar_repair_minutes}min</span></span>
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        {ship.hangar_tung_cost != null ? (
                          <span className="text-amber-400 font-bold">{formatNumber(ship.hangar_tung_cost)} TUNG{ship.hangar_usd_cost != null && <span className="text-slate-500 font-normal"> (~${Number(ship.hangar_usd_cost).toFixed(2)} USD)</span>}</span>
                        ) : (
                          <span className="text-yellow-400">Precio de TUNG no disponible</span>
                        )}
                      </div>
                      <button onClick={repairInHangar} disabled={repairLoading || active !== null || ship.hangar_tung_cost == null}
                        className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold rounded-xl bg-gradient-to-r from-cyan-700/50 to-blue-700/50 hover:from-cyan-600/60 hover:to-blue-600/60 text-cyan-300 border border-cyan-500/30 disabled:opacity-50 transition-all">
                        {repairLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                        Reparar en hangar
                      </button>
                      {active !== null && <p className="text-[9px] text-yellow-400 text-center">Espera a que la expedicion termine</p>}
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

          {/* Atributos */}
          <div className="rounded-2xl bg-gradient-to-b from-slate-800/80 to-slate-900/80 border border-slate-700/50 shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Atributos</h3>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-slate-500"><span className="text-yellow-400 font-bold">{ship.total_points}</span> totales</span>
                <span className="text-slate-500"><span className="text-emerald-400 font-bold">{freePoints}</span> libres</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attrs.map(a => {
                const base = ship[a.baseKey];
                const total = ship[a.key];
                const pend = pending[a.baseKey] || 0;
                const equipped = total - base;
                const research = researchBonus(ship, a.key);
                const Icon = a.icon;
                const spentPct = ship.total_points > 0 ? Math.round((total / ship.total_points) * 100) : 0;
                return (
                  <div key={a.key} className={`relative rounded-xl border ${a.color.replace('text', 'border')}/20 bg-slate-900/60 p-3`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${a.color}`} />
                        <span className={`text-[11px] font-bold uppercase tracking-wide ${a.color}`}>{a.label}</span>
                      </div>
                      <span className={`text-lg font-bold font-orbitron ${a.color}`}>{total + research.bonus}</span>
                    </div>
                    {equipped > 0 && <p className="text-[9px] text-cyan-500 mb-1.5">+{equipped} de equipo</p>}
                    {research.level > 0 && <p className="text-[9px] text-purple-400 mb-1.5">+{research.level * 10}% investigacion (+{research.bonus})</p>}
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => adjust(a.baseKey, -1)} disabled={pend <= 0 || saving}
                        className="p-1 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        <Minus className="w-3 h-3" />
                      </button>
                      <div className="flex-1">
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                          <div className={`h-full rounded-full bg-gradient-to-r ${a.barColor} transition-all duration-500`} style={{ width: `${spentPct}%` }} />
                        </div>
                      </div>
                      <button onClick={() => adjust(a.baseKey, 1)} disabled={freePoints <= 0 || saving}
                        className="p-1 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {pend > 0 && <div className="mt-1 text-[10px] font-bold text-cyan-400 text-right animate-pulse">+{pend} pendiente</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-2xl bg-gradient-to-b from-slate-800/80 to-slate-900/80 border border-slate-700/50 shadow-lg p-4">
            <div className="flex gap-3">
              <button onClick={assign} disabled={Object.values(pending).reduce((a, b) => a + b, 0) <= 0 || saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 text-white disabled:text-slate-500 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 transition-all border border-white/10">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Asignar Puntos
              </button>
              <button onClick={respec} disabled={respecing || (profile?.tung_balance ?? 0) < ship.respec_cost}
                className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-xl bg-gradient-to-b from-orange-600/30 to-orange-700/30 hover:from-orange-500/40 hover:to-orange-600/40 text-orange-400 border border-orange-500/30 shadow-lg shadow-orange-500/10 disabled:opacity-50 transition-all">
                {respecing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                <span className="hidden sm:inline">Reiniciar</span>
                <span className="flex items-center gap-1 text-[10px] font-mono"><Coins className="w-3 h-3" />{formatNumber(ship.respec_cost)}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* TAB: EQUIPAMIENTO VISUAL */}
      {tab === 'equip' && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 border border-slate-700/50 shadow-lg p-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.05),transparent_70%)]" />
          <div className="relative">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 text-center">Equipamiento del Héroe</h3>

            {/* Grid layout: izquierda = galea + gladius, centro = heroe, derecha = scutum + lorica */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 max-w-lg mx-auto items-stretch">
              {/* LEFT: Module + Weapon */}
              <div className="col-start-1 row-start-1 flex flex-col justify-center">
                <VisualSlot slotKey="module" slotData={ship.module_slot} onUnequip={unequipSlot} expeditionActive={active !== null} />
              </div>
              <div className="col-start-1 row-start-2 flex flex-col justify-center">
                <VisualSlot slotKey="weapon" slotData={ship.weapon_slot} onUnequip={unequipSlot} expeditionActive={active !== null} />
              </div>
              {/* CENTER: Hero card */}
              <div className="col-start-2 row-start-1 row-span-2 flex items-center justify-center">
                <div className="relative w-32 h-48 sm:w-44 sm:h-64 rounded-2xl overflow-hidden border-2 border-amber-500/50 shadow-xl shadow-amber-500/20 bg-white">
                  <img src="/Imagenes/Heroe%20imerial/heroe%20imperial.webp" alt="Héroe Imperial" className="w-full h-full object-cover object-top" />
                  <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-10 h-10 bg-gradient-to-b from-amber-400 to-amber-600 rounded-full flex items-center justify-center shadow-xl shadow-amber-500/30 border-2 border-amber-300/50">
                    <span className="text-base font-bold text-stone-900 font-serif">{ship.level}</span>
                  </div>
                </div>
              </div>
              {/* RIGHT: Shield + Reactor */}
              <div className="col-start-3 row-start-1 flex flex-col justify-center">
                <VisualSlot slotKey="shield" slotData={ship.shield_slot} onUnequip={unequipSlot} expeditionActive={active !== null} />
              </div>
              <div className="col-start-3 row-start-2 flex flex-col justify-center">
                <VisualSlot slotKey="reactor" slotData={ship.reactor_slot} onUnequip={unequipSlot} expeditionActive={active !== null} />
              </div>
            </div>

            {/* Stats summary */}
            <div className="mt-4 flex justify-center gap-1.5 max-w-md mx-auto">
              {attrs.map(a => {
                const total = ship[a.key] + researchBonus(ship, a.key).bonus;
                const Icon = a.icon;
                return (
                  <div key={a.key} className="flex-1 rounded-lg bg-slate-800/60 border border-slate-700/30 p-1.5 text-center">
                    <Icon className={`w-3 h-3 ${a.color} mx-auto mb-0.5`} />
                    <div className={`text-xs font-bold font-orbitron ${a.color}`}>{total}</div>
                    <div className="text-[7px] text-slate-600 uppercase truncate">{a.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB: EXPEDITIONS */}
      {tab === 'expeditions' && (
        <div className="space-y-3">
          {active && !active.can_claim && (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900/40 via-slate-900 to-blue-900/20 border border-blue-500/30 shadow-lg shadow-blue-500/10 p-5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />
              <div className="relative text-center">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="relative">
                    <Map className="w-6 h-6 text-blue-400" />
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{active.expedition_name}</h3>
                </div>
                <div className="text-4xl font-bold font-orbitron text-blue-400 mb-1 tracking-wider">
                  {Math.floor(active.remaining_seconds / 60)}:{(active.remaining_seconds % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Expedicion en curso</div>
              </div>
            </div>
          )}

          {!active && (
            <div className="grid gap-3">
              {expeditions.map(e => {
                const cfg = expCfg[e.name] || expCfg['Exploracion Cercana'];
                const locked = ship.level < e.min_level;
                const noHp = ship.hp <= e.hp_damage;
                const puntos = (ship.attack_points || 0) + (ship.defense_points || 0) + (ship.shield_points || 0) + (ship.speed_points || 0);
                const deuterio = Math.max(1, Math.ceil((e.duration_minutes * (Math.pow(ship.level, 2) * 10 + puntos * 3) + 100) * 0.25));
                return (
                  <div key={e.id} className={`relative overflow-hidden rounded-2xl border ${cfg.border} bg-gradient-to-br ${cfg.from} ${cfg.to} shadow-lg ${locked || noHp ? 'opacity-60' : ''}`}>
                    <div className="relative p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${cfg.border}`}>{cfg.label}</div>
                          <h3 className="text-sm font-bold text-white">{e.name}</h3>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${cfg.border}`}>Nv. {e.min_level}+</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="rounded-xl bg-black/30 border border-white/5 p-2 text-center">
                          <Timer className="w-3.5 h-3.5 text-blue-400 mx-auto mb-0.5" />
                          <div className="text-xs font-bold font-mono text-blue-300">{e.duration_minutes}min</div>
                        </div>
                        <div className="rounded-xl bg-black/30 border border-white/5 p-2 text-center">
                          <Star className="w-3.5 h-3.5 text-yellow-400 mx-auto mb-0.5" />
                          <div className="text-xs font-bold font-mono text-yellow-300">+{e.xp_reward}</div>
                        </div>
                        <div className="rounded-xl bg-black/30 border border-white/5 p-2 text-center">
                          <Heart className="w-3.5 h-3.5 text-red-400 mx-auto mb-0.5" />
                          <div className="text-xs font-bold font-mono text-red-300">-{e.hp_damage}</div>
                        </div>
                        <div className="rounded-xl bg-black/30 border border-white/5 p-2 text-center">
                          <Zap className="w-3.5 h-3.5 text-purple-400 mx-auto mb-0.5" />
                          <div className="text-xs font-bold font-mono text-purple-300">{deuterio.toLocaleString()}</div>
                          <div className="text-[8px] text-slate-600">Comida</div>
                        </div>
                      </div>
                      {(() => {
                        // [HEROAUDIT3] Probabilidades de botin visibles
                        const w = { c: Number(e.prob_common ?? 50), r: Number(e.prob_rare ?? 25), e: Number(e.prob_epic ?? 15), l: Number(e.prob_legendary ?? 5) };
                        const sum = w.c + w.r + w.e + w.l;
                        const drop = Number(e.drop_chance ?? 100);
                        const f = (v: number) => { const p = sum > 0 ? (v / sum) * 100 : 0; return `${p.toFixed(p > 0 && p < 1 ? 2 : p % 1 === 0 ? 0 : 1)}%`; };
                        return (
                          <div className="rounded-xl bg-black/30 border border-white/5 p-2 mb-3">
                            <div className="flex items-center justify-between text-[10px] mb-1.5">
                              <span className="flex items-center gap-1 text-slate-400"><Package className="w-3 h-3" />Probabilidad de botin</span>
                              <span className="font-bold font-mono text-cyan-300">{drop % 1 === 0 ? drop : drop.toFixed(1)}%</span>
                            </div>
                            {drop > 0 && sum > 0 ? (
                              <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                                <div className={`rounded-lg py-1 ${rarityCfg.common.bg} ${rarityCfg.common.text}`}>{rarityCfg.common.label}<div className="font-mono font-bold">{f(w.c)}</div></div>
                                <div className={`rounded-lg py-1 ${rarityCfg.rare.bg} ${rarityCfg.rare.text}`}>{rarityCfg.rare.label}<div className="font-mono font-bold">{f(w.r)}</div></div>
                                <div className={`rounded-lg py-1 ${rarityCfg.epic.bg} ${rarityCfg.epic.text}`}>{rarityCfg.epic.label}<div className="font-mono font-bold">{f(w.e)}</div></div>
                                <div className={`rounded-lg py-1 ${rarityCfg.legendary.bg} ${rarityCfg.legendary.text}`}>{rarityCfg.legendary.label}<div className="font-mono font-bold">{f(w.l)}</div></div>
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-500 text-center">Esta expedicion no entrega items</p>
                            )}
                            {drop > 0 && sum > 0 && <p className="text-[9px] text-slate-600 mt-1 text-center">Si sale botin, la rareza se elige con estos %</p>}
                          </div>
                        );
                      })()}
                      <button onClick={() => startExpedition(e.id)} disabled={locked || noHp || expeditionLoading}
                        className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all shadow-sm bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white border border-white/10 shadow-cyan-500/10">
                        {expeditionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {noHp ? 'Vida insuficiente — repara primero' : locked ? `Requiere nivel ${e.min_level}` : 'Enviar a Expedicion'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: INVENTORY */}
      {tab === 'inventory' && (
        <div className="space-y-2.5">
          <Link to="/game/market?tab=hero_items"
            className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-xl border border-amber-500/30 bg-amber-700/30 hover:bg-amber-600/40 text-amber-300 shadow-sm transition-all">
            <ShoppingCart className="w-3.5 h-3.5" />Comprar / vender items en Mercado → Items Héroe
          </Link>
          {inventory.length === 0 ? (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 shadow-lg p-10 text-center">
              <Package className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500 font-medium">No tienes items</p>
              <p className="text-[11px] text-slate-600 mt-1">Realiza expediciones para conseguir items</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {inventory.map(item => {
                const rc = rarityCfg[item.rarity] || rarityCfg.common;
                const sc = slotConfig[item.slot_type];
                const canEquip = !item.is_repair_kit && item.slot_type !== 'consumable';
                const locked = ship.level < item.item_level;
                return (
                  <div key={item.inventory_id} className={`relative overflow-hidden rounded-2xl border ${rc.border} ${rc.bg} shadow-lg p-3.5`}>
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg border ${rc.border} bg-black/30`}>
                            {item.is_repair_kit ? <Wrench className="w-3.5 h-3.5 text-green-400" /> : <Box className="w-3.5 h-3.5 text-slate-400" />}
                          </div>
                          <div>
                            <span className={`text-xs font-bold ${rc.text}`}>{item.name}</span>
                            {sc && <span className={`text-[9px] ml-1.5 ${sc.color}`}>({sc.label})</span>}
                            <div className={`inline-block px-1.5 py-[1px] rounded text-[8px] font-bold uppercase tracking-wider ${rc.badge}`}>{rc.label}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${rc.border} ${rc.text}`}>Nv.{item.item_level}</span>
                          <div className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${rc.border} ${rc.text} ${rc.bg}`}>x{item.quantity}</div>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-1.5 leading-relaxed">{item.description}</p>
                      {canEquip && (
                        <button onClick={() => equipItem(item.inventory_id)} disabled={locked || active !== null}
                          className={`w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold rounded-xl border shadow-sm transition-all ${
                            locked || active !== null
                              ? 'bg-slate-800/50 border-slate-600/30 text-slate-600 cursor-not-allowed'
                              : 'bg-cyan-700/40 hover:bg-cyan-600/50 text-cyan-300 border-cyan-500/30'
                          }`} title={active !== null ? '🚀 La tropa esta en expedicion — espera a que regrese' : ''}>
                          {locked ? `Requiere Nv. ${item.item_level}` : active !== null ? 'En expedicion' : 'Equipar'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'duel' && <HeroDuelSection />}
      {tab === 'ranking' && <HeroRankingSection />}
    </div>
  );
}

function HeroMarketSection({ inventory, ship, refreshKey, rarityFilter, setRarityFilter, onRefresh }: { inventory: InventoryItem[]; ship: HeroShip; refreshKey: number; rarityFilter: string; setRarityFilter: (r: string) => void; onRefresh: () => void }) {
  const [listings, setListings] = useState<any[]>([]);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [poolBalance, setPoolBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState<'all' | 'cheapest' | 'expensive'>('all');
  const [page, setPage] = useState(1);
  const PER_PAGE = 12;

  const rarityCfg: Record<string, { text: string; border: string; bg: string; badge: string; label: string }> = {
    common: { text: 'text-green-400', border: 'border-green-500/30', bg: 'bg-green-900/10', badge: 'bg-green-500/20 text-green-400', label: 'Comun' },
    rare: { text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-900/10', badge: 'bg-blue-500/20 text-blue-400', label: 'Raro' },
    epic: { text: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-900/10', badge: 'bg-purple-500/20 text-purple-400', label: 'Epico' },
    legendary: { text: 'text-fuchsia-400', border: 'border-fuchsia-500/30', bg: 'bg-fuchsia-900/10', badge: 'bg-fuchsia-500/20 text-fuchsia-400', label: 'Legendario' },
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: me } = await supabase.auth.getUser();
      setUser(me.user);
      const { data: all } = await supabase.rpc('get_hero_market_listings');
      const arr = Array.isArray(all) ? all : [];
      if (me?.user) {
        setMyListings(arr.filter((l: any) => l.seller_id === me.user.id));
        setListings(arr.filter((l: any) => l.seller_id !== me.user.id));
      } else {
        setMyListings([]);
        setListings(arr);
      }
      const { data: pool } = await supabase.rpc('get_hero_market_pool');
      setPoolBalance(pool?.balance || 0);
      setLoading(false);
    };
    load();
  }, [refreshKey]);

  const refresh = async () => {
    const { data: all } = await supabase.rpc('get_hero_market_listings');
    const arr = Array.isArray(all) ? all : [];
    if (user) {
      setMyListings(arr.filter((l: any) => l.seller_id === user.id));
      setListings(arr.filter((l: any) => l.seller_id !== user.id));
    } else {
      setMyListings([]);
      setListings(arr);
    }
  };

  const handleList = async () => {
    if (!sellItem || sellPrice < 1 || sellQty < 1) return;
    setSelling(true);
    const { error } = await supabase.rpc('create_hero_item_listing', {
      p_item_id: sellItem.item_id,
      p_item_level: sellItem.item_level,
      p_quantity: sellQty,
      p_price_fxu: sellPrice,
    });
    if (error) setMessage('Error: ' + error.message);
    else {
      setMessage('Item listado en el mercado');
      setSellItem(null);
      setSellQty(1);
      setSellPrice(0);
      await refresh();
    }
    setSelling(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCancel = async (listingId: string) => {
    const { error } = await supabase.rpc('cancel_hero_item_listing', { p_listing_id: listingId });
    if (error) setMessage('Error: ' + error.message);
    else { setMessage('Listado cancelado'); await refresh(); }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleBuy = async (listingId: string) => {
    const { error } = await supabase.rpc('buy_hero_item_listing', { p_listing_id: listingId });
    if (error) setMessage('Error: ' + error.message);
    else { setMessage('Item comprado!'); await refresh(); }
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading) return <div className="flex items-center gap-2 text-slate-400 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Cargando mercado...</div>;

  return (
    <div className="space-y-4">
      {message && (
        <div className={`flex items-center gap-2 text-xs px-4 py-3 rounded-xl border ${
          message.startsWith('Error') ? 'bg-red-900/30 border-red-500/30 text-red-300' : 'bg-emerald-900/30 border-emerald-500/30 text-emerald-300'
        }`}>
          {message.startsWith('Error') ? <AlertCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
          {message}
        </div>
      )}

      {/* Pool balance */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-3 flex items-center justify-between">
        <span className="text-[10px] text-slate-400 flex items-center gap-1.5"><Coins className="w-3 h-3 text-amber-400" />Pool del mercado</span>
        <span className="text-xs font-bold text-amber-400">{poolBalance.toLocaleString()} <span className="text-[9px] text-slate-500">TUNG</span></span>
      </div>

      {/* En venta */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-cyan-400" />En venta
          </h3>
          <div className="flex items-center gap-1">
            {(['all', 'cheapest', 'expensive'] as const).map(s => (
              <button key={s} onClick={() => setSortOrder(s)}
                className={`px-2 py-1 text-[9px] font-bold rounded-lg border transition-all ${sortOrder === s ? 'bg-cyan-700/40 border-cyan-500/30 text-cyan-300' : 'bg-slate-800 border-slate-600/30 text-slate-500 hover:text-slate-300'}`}>
                {s === 'all' ? 'Todos' : s === 'cheapest' ? 'Mas barato' : 'Mas caro'}
              </button>
            ))}
          </div>
        </div>
        {listings.length === 0 ? (
          <p className="text-xs text-slate-500">No hay items en venta</p>
        ) : (() => {
          const filtered = rarityFilter === 'all' ? listings : listings.filter(l => l.rarity === rarityFilter);
          const sorted = [...filtered].sort((a, b) => {
            const pa = a.price_fxu * a.quantity;
            const pb = b.price_fxu * b.quantity;
            return sortOrder === 'expensive' ? pb - pa : sortOrder === 'cheapest' ? pa - pb : 0;
          });
          const totalPages = Math.ceil(sorted.length / PER_PAGE);
          const safePage = Math.min(page, totalPages);
          const start = (safePage - 1) * PER_PAGE;
          const paged = sorted.slice(start, start + PER_PAGE);
          return (<>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {paged.map((l: any) => {
              const rc = rarityCfg[l.rarity] || rarityCfg.common;
              const totalPrice = l.price_fxu * l.quantity;
              const fee = Math.floor(totalPrice * 0.1);
              return (
                <div key={l.listing_id} className={`relative overflow-hidden rounded-2xl border ${rc.border} ${rc.bg} shadow-lg p-3.5`}>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div>
                          <span className={`text-xs font-bold ${rc.text}`}>{l.item_name}</span>
                          <span className={`text-[9px] ml-1.5 px-1.5 py-[1px] rounded ${rc.badge}`}>{rc.label}</span>
                          <span className="text-[9px] text-slate-500 ml-1.5">Nv.{l.item_level}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-amber-400">{totalPrice.toLocaleString()} <span className="text-[9px] text-slate-500">TUNG</span></div>
                        <div className="text-[8px] text-slate-600">{l.price_fxu.toLocaleString()} TUNG c/u x{l.quantity}</div>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-500 mb-1">{l.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-600">Vendedor: {l.seller_name || 'Anonimo'} | Fee 10% ({fee.toLocaleString()} TUNG)</span>
                      <button onClick={() => handleBuy(l.listing_id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-cyan-700/40 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/30 transition-all">
                        <ShoppingCart className="w-3 h-3" />Comprar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-700/40 border border-slate-600/30 text-slate-300 disabled:opacity-40 transition-all">Anterior</button>
              <span className="text-[10px] text-slate-500">Pag {safePage} de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-700/40 border border-slate-600/30 text-slate-300 disabled:opacity-40 transition-all">Siguiente</button>
            </div>
          )}
          </>);
        })()}
      </div>
    </div>
  );
}

function HeroMyListings({ refreshKey, onRefresh }: { refreshKey: number; onRefresh: () => void }) {
  const [myListings, setMyListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const rarityCfg: Record<string, { text: string; border: string; bg: string; badge: string; label: string }> = {
    common: { text: 'text-green-400', border: 'border-green-500/30', bg: 'bg-green-900/10', badge: 'bg-green-500/20 text-green-400', label: 'Comun' },
    rare: { text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-900/10', badge: 'bg-blue-500/20 text-blue-400', label: 'Raro' },
    epic: { text: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-900/10', badge: 'bg-purple-500/20 text-purple-400', label: 'Epico' },
    legendary: { text: 'text-fuchsia-400', border: 'border-fuchsia-500/30', bg: 'bg-fuchsia-900/10', badge: 'bg-fuchsia-500/20 text-fuchsia-400', label: 'Legendario' },
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: me } = await supabase.auth.getUser();
      if (me?.user) {
        const { data: all } = await supabase.rpc('get_hero_market_listings');
        const arr = Array.isArray(all) ? all : [];
        setMyListings(arr.filter((l: any) => l.seller_id === me.user.id));
      }
      setLoading(false);
    };
    load();
  }, [refreshKey]);

  const handleCancel = async (listingId: string) => {
    const { error } = await supabase.rpc('cancel_hero_item_listing', { p_listing_id: listingId });
    if (error) setMessage('Error: ' + error.message);
    else { setMessage('Listado cancelado'); onRefresh(); }
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading) return <div className="flex items-center gap-2 text-slate-400 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Cargando tus listados...</div>;

  return (
    <div className="space-y-3">
      {message && (
        <div className={`flex items-center gap-2 text-xs px-4 py-3 rounded-xl border ${
          message.startsWith('Error') ? 'bg-red-900/30 border-red-500/30 text-red-300' : 'bg-emerald-900/30 border-emerald-500/30 text-emerald-300'
        }`}>
          {message.startsWith('Error') ? <AlertCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
          {message}
        </div>
      )}
      {myListings.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 text-center">
          <ShoppingCart className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">No tienes items en venta</p>
          <p className="text-[11px] text-slate-600 mt-1">Ve a tu inventario y vende un item para listarlo en el mercado</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3"><ShoppingCart className="w-4 h-4 text-cyan-400" />Tus listados <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">{myListings.length}</span></h3>
          {myListings.map((l: any) => {
            const rc = rarityCfg[l.rarity] || rarityCfg.common;
            return (
              <div key={l.listing_id} className={`flex items-center justify-between p-3 rounded-xl border ${rc.border} ${rc.bg}`}>
                <div className="flex items-center gap-3">
                  <div>
                    <span className={`text-xs font-bold ${rc.text}`}>{l.item_name}</span>
                    <span className={`text-[9px] ml-1.5 px-1.5 py-[1px] rounded ${rc.badge}`}>{rc.label}</span>
                    <span className="text-[9px] text-slate-500 ml-1.5">Nv.{l.item_level}</span>
                    <div className="text-[9px] text-slate-500">x{l.quantity} | {l.price_fxu.toLocaleString()} TUNG c/u</div>
                  </div>
                </div>
                <button onClick={() => handleCancel(l.listing_id)}
                  className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-red-700/30 hover:bg-red-600/40 text-red-300 border border-red-500/30 transition-all">
                  Cancelar
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ============================================================
// DUELO GALACTICO
// ============================================================
function HeroDuelSection() {
  const { profile } = useAuthStore();
  const [activeDuel, setActiveDuel] = useState<any>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createStake, setCreateStake] = useState(100);
  const [creating, setCreating] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [duelResult, setDuelResult] = useState<any>(null);
  const [resolving, setResolving] = useState(false);
  const [duelMsg, setDuelMsg] = useState<string | null>(null);
  // [HEROAUDIT3] Mismo calculo que el servidor: fee = CEIL(20% de una apuesta), ganador = 2X - fee
  const duelFee = (stake: number) => Math.ceil(stake * 0.2);
  const duelPrize = (stake: number) => stake * 2 - duelFee(stake);

  const resolveViaInsert = async (duelId: string) => {
    const { data, error } = await supabase.rpc('resolve_my_hero_duel', { p_duel_id: duelId });
    return !error && !!data?.success;
  };

  const checkCompletedDuel = useCallback(async () => {
    if (!profile) return null;
    const { data } = await supabase.from('hero_duel_active_view').select('*').or('creator_id.eq.' + profile.id + ',opponent_id.eq.' + profile.id).eq('status', 'completed').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    return data;
  }, [profile]);

  const loadActiveDuel = useCallback(async () => {
    if (!profile) return null;
    const { data } = await supabase.from('hero_duel_active_view').select('*').or('creator_id.eq.' + profile.id + ',opponent_id.eq.' + profile.id).in('status', ['waiting', 'accepted']).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data && data.status === 'accepted' && data.resolves_at && new Date(data.resolves_at) <= new Date()) {
      if (!resolving) {
        setResolving(true);
        const ok = await resolveViaInsert(data.id);
        if (ok) {
          await new Promise(r => setTimeout(r, 500));
          const completed = await checkCompletedDuel();
          if (completed) return completed;
        }
        setResolving(false);
      }
    }
    return data;
  }, [profile, resolving, checkCompletedDuel]);

  const loadAll = useCallback(async () => {
    if (!profile) return;
    const [activeRaw, r2, r3] = await Promise.all([
      loadActiveDuel(),
      supabase.from('hero_duel_offers_view').select('*').neq('creator_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('hero_duel_history_view').select('*').or('creator_id.eq.' + profile.id + ',opponent_id.eq.' + profile.id).order('resolved_at', { ascending: false }).limit(20),
    ]);
    if (activeRaw && activeRaw.status === 'completed') { setDuelResult(activeRaw); setActiveDuel(null); }
    else if (activeRaw) { setActiveDuel(activeRaw); setDuelResult(null); }
    else { setActiveDuel(null); setDuelResult(null); }
    if (r2.data) setOffers(r2.data as any[]);
    if (r3.data) setHistory(r3.data as any[]);
    setLoading(false);
    setResolving(false);
  }, [profile, loadActiveDuel]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (!activeDuel || activeDuel.status !== 'accepted' || !activeDuel.resolves_at) return;
    const update = () => { setCountdown(Math.max(0, Math.floor((new Date(activeDuel.resolves_at).getTime() - Date.now()) / 1000))); };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, [activeDuel?.resolves_at, activeDuel?.status]);

  useEffect(() => {
    if (!activeDuel || activeDuel.status !== 'accepted') return;
    const i = setInterval(async () => {
      const duel = await loadActiveDuel();
      if (duel && duel.status === 'completed') { setDuelResult(duel); setActiveDuel(null); }
      else if (duel) setActiveDuel(duel);
      else { const c = await checkCompletedDuel(); if (c) { setDuelResult(c); setActiveDuel(null); } }
    }, 5000);
    return () => clearInterval(i);
  }, [activeDuel?.id, activeDuel?.status, loadActiveDuel, checkCompletedDuel]);

  if (!profile) return null;
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /></div>;

  if (duelResult) {
    const isWinner = duelResult.winner_id === profile.id;
    const winAmount = duelResult.winner_amount || 0;
    return (
      <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50 shadow-lg p-6 text-center space-y-4">
        <div className={'text-3xl font-bold ' + (isWinner ? 'text-yellow-400' : 'text-red-400')}>{isWinner ? 'VICTORIA' : 'DERROTA'}</div>
        <div className={'text-5xl ' + (isWinner ? 'text-yellow-300' : 'text-red-300')}>{isWinner ? String.fromCodePoint(127942) : String.fromCodePoint(128128)}</div>
        {isWinner && <div className="text-lg font-bold text-green-400">+{winAmount.toLocaleString()} TUNG</div>}
        <button onClick={() => { setDuelResult(null); loadAll(); }} className="px-6 py-2 rounded-xl bg-gradient-to-b from-cyan-600 to-cyan-700 text-white text-sm font-bold hover:from-cyan-500 transition-all">Volver</button>
      </div>
    );
  }

  if (activeDuel && activeDuel.status === 'accepted') {
    const isCreator = activeDuel.creator_id === profile.id;
    const opponentName = isCreator ? activeDuel.opponent_username : activeDuel.creator_username;
    const opponentLevel = isCreator ? activeDuel.opponent_level : activeDuel.creator_level;
    const myLevel = isCreator ? activeDuel.creator_level : activeDuel.opponent_level;
    const mins = Math.floor(countdown / 60), secs = countdown % 60;
    return (
      <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50 shadow-lg p-6 space-y-4 text-center">
        <h3 className="text-sm font-bold text-cyan-400 tracking-wide uppercase">Duelo en curso</h3>
        <div className="flex items-center justify-center gap-4 text-sm">
          <div className="text-right"><div className="font-bold text-white">{profile.username}</div><div className="text-xs text-slate-500">Nv.{myLevel}</div></div>
          <Swords className="w-6 h-6 text-red-400" />
          <div className="text-left"><div className="font-bold text-white">{opponentName || 'Esperando...'}</div><div className="text-xs text-slate-500">Nv.{opponentLevel}</div></div>
        </div>
        <div className="flex items-center justify-center gap-2 text-yellow-400"><Coins className="w-4 h-4" /><span className="font-bold">{activeDuel.stake.toLocaleString()} TUNG</span></div>
        <div className="text-[11px] text-slate-400">Si ganas recibes <span className="font-bold text-green-400">{duelPrize(activeDuel.stake).toLocaleString()} TUNG</span></div>
        {countdown > 0 ? (
          <><div className="text-4xl font-bold font-mono text-white tracking-widest">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</div><div className="text-xs text-slate-500">Llegando al punto de batalla...</div></>
        ) : (
          <div className="flex items-center justify-center gap-2 text-cyan-400"><Loader2 className="w-4 h-4 animate-spin" /> Resolviendo duelo...</div>
        )}
      </div>
    );
  }

  if (activeDuel && activeDuel.status === 'waiting') {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50 shadow-lg p-6 space-y-4 text-center">
        <h3 className="text-sm font-bold text-yellow-400 tracking-wide uppercase">Duelo creado</h3>
        <div className="text-lg font-bold text-white">{activeDuel.stake.toLocaleString()} TUNG</div>
        <div className="text-[11px] text-slate-400">Si ganas recibes <span className="font-bold text-green-400">{duelPrize(activeDuel.stake).toLocaleString()} TUNG</span>. Si cancelas antes de que alguien acepte, recuperas tu apuesta.</div>
        <div className="text-xs text-slate-500">Esperando oponente...</div>
        <button onClick={async () => { setDuelMsg(null); const { data, error } = await supabase.rpc('cancel_hero_duel', { p_duel_id: activeDuel.id }); if (error || (data && data.success === false)) setDuelMsg(data?.error || error?.message || 'Error al cancelar'); loadAll(); }} className="px-4 py-2 rounded-xl bg-red-600/30 border border-red-500/30 text-red-300 text-xs font-bold hover:bg-red-600/50 transition-all">Cancelar duelo</button>
        {duelMsg && <div className="text-xs text-red-400">{duelMsg}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50 shadow-lg p-4">
        <h3 className="text-xs font-bold text-cyan-400 tracking-wide uppercase mb-2">Crear duelo</h3>
        <div className="text-[11px] text-slate-400 space-y-0.5 mb-3">
          <p>Cada jugador apuesta lo mismo (minimo 10 TUNG). Al aceptar, las tropas tardan 10 minutos en llegar al punto de batalla y alli se resuelve el combate.</p>
          <p>Comision: 20% de una apuesta (50% pool jackpot / 50% empresa). El ganador se lleva el resto del bote.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-yellow-400" />
            <input type="number" min={10} value={createStake} onChange={e => setCreateStake(Math.max(10, parseInt(e.target.value) || 10))} className="w-full bg-slate-900/80 border border-slate-600/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-cyan-500/50" />
          </div>
          <button disabled={creating} onClick={async () => { setCreating(true); setDuelMsg(null); const { data, error } = await supabase.rpc('create_hero_duel', { p_stake: createStake }); if (error || !data?.success) setDuelMsg(data?.error || error?.message || 'Error al crear duelo'); setCreating(false); loadAll(); }} className="px-4 py-2 rounded-xl bg-gradient-to-b from-cyan-600 to-cyan-700 text-white text-xs font-bold hover:from-cyan-500 transition-all disabled:opacity-50">{creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Crear'}</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 text-center text-[10px]">
          <div className="rounded-lg bg-black/30 py-1.5"><div className="text-slate-500">Bote</div><div className="font-mono font-bold text-white">{(createStake * 2).toLocaleString()}</div></div>
          <div className="rounded-lg bg-black/30 py-1.5"><div className="text-slate-500">Comision</div><div className="font-mono font-bold text-red-300">-{duelFee(createStake).toLocaleString()}</div></div>
          <div className="rounded-lg bg-black/30 py-1.5"><div className="text-slate-500">Si ganas</div><div className="font-mono font-bold text-green-400">+{duelPrize(createStake).toLocaleString()}</div></div>
        </div>
        {duelMsg && <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400"><AlertCircle className="w-3.5 h-3.5" />{duelMsg}</div>}
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50 shadow-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-cyan-400 tracking-wide uppercase">Duelos disponibles</h3>
          <button onClick={() => setShowHistory(!showHistory)} className="text-[10px] text-slate-500 hover:text-white transition-colors">{showHistory ? 'Ver disponibles' : 'Historial'}</button>
        </div>

        {showHistory ? (
          history.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">Sin historial</p> : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {history.map((h: any) => {
                const isWinner = h.winner_id === profile.id;
                const oppName = h.creator_id === profile.id ? h.opponent_username : h.creator_username;
                const oppLevel = h.creator_id === profile.id ? h.opponent_level : h.creator_level;
                return (
                  <div key={h.id} className={'flex items-center justify-between p-2 rounded-xl border ' + (isWinner ? 'bg-green-900/10 border-green-500/20' : 'bg-red-900/10 border-red-500/20')}>
                    <div className="text-xs"><span className="text-slate-300">vs </span><span className="font-bold text-white">{oppName}</span><span className="text-slate-500"> Nv.{oppLevel}</span></div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono">{h.stake.toLocaleString()} TUNG</span>
                      <span className={'text-[10px] font-mono font-bold ' + (isWinner ? 'text-green-400' : 'text-red-400')}>{isWinner ? `+${(h.winner_amount || duelPrize(h.stake)).toLocaleString()}` : `-${h.stake.toLocaleString()}`}</span>
                      <span className={'text-[10px] font-bold ' + (isWinner ? 'text-green-400' : 'text-red-400')}>{isWinner ? 'GANASTE' : 'PERDISTE'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          offers.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">No hay duelos disponibles. Crea uno!</p> : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {offers.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/40 border border-slate-700/30">
                  <div className="text-xs"><span className="font-bold text-white">{o.creator_username}</span><span className="text-slate-500"> Nv.{o.creator_level}</span></div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs font-bold font-mono text-yellow-400">{o.stake.toLocaleString()} TUNG</div>
                      <div className="text-[9px] text-green-400">Si ganas +{duelPrize(o.stake).toLocaleString()}</div>
                    </div>
                    <button disabled={acceptingId === o.id} onClick={async () => { setAcceptingId(o.id); setDuelMsg(null); const { data, error } = await supabase.rpc('accept_hero_duel', { p_duel_id: o.id }); if (error || !data?.success) setDuelMsg(data?.error || error?.message || 'Error al aceptar'); setAcceptingId(null); loadAll(); }} className="px-3 py-1.5 rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-700 text-white text-[10px] font-bold hover:from-emerald-500 transition-all disabled:opacity-50">{acceptingId === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Aceptar'}</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ============================================================
// RANKING DE NAVES HEROE
// ============================================================
interface RankEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  losses: number;
  total_battles: number;
  win_rate: number;
  level: number;
  xp: number;
  hp: number;
  hp_max: number;
  attack_points: number;
  defense_points: number;
  shield_points: number;
  speed_points: number;
  weapon_name: string | null;
  weapon_rarity: string | null;
  shield_name: string | null;
  shield_rarity: string | null;
  module_name: string | null;
  module_rarity: string | null;
  reactor_name: string | null;
  reactor_rarity: string | null;
}

const rankIcons = [
  { icon: Crown, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Rey' },
  { icon: Trophy, color: 'text-slate-300', bg: 'bg-slate-400/20', label: 'Glorioso' },
  { icon: Medal, color: 'text-amber-600', bg: 'bg-amber-700/20', label: 'Bronce' },
  { icon: Target, color: 'text-cyan-400', bg: 'bg-cyan-500/20', label: 'Francotirador' },
  { icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Fuego' },
  { icon: Zap, color: 'text-yellow-300', bg: 'bg-yellow-400/20', label: 'Rayo' },
  { icon: Gem, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/20', label: 'Joyita' },
  { icon: Shield, color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Escudado' },
  { icon: Sword, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Espadachin' },
  { icon: Star, color: 'text-cyan-300', bg: 'bg-cyan-400/20', label: 'Estrella' },
];

function HeroRankingSection() {
  const { profile } = useAuthStore();
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    supabase.from('hero_ship_ranking_view').select('*').limit(50)
      .then(({ data, error: err }) => {
        if (err) setError('Error al cargar ranking');
        else setRanking((data || []) as RankEntry[]);
        setLoading(false);
      });
  }, []);

  const userEntry = ranking.find(r => r.user_id === profile?.id);

  const rarityBadge = (rarity: string | null) => {
    const c = rarityCfg[rarity || ''];
    if (!c) return null;
    return <span className={'text-[7px] px-1 py-[1px] rounded ' + c.badge}>{c.label}</span>;
  };

  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-800/80 to-slate-900/80 border border-slate-700/50 shadow-lg p-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="w-4 h-4 text-yellow-400" />
        <h3 className="text-sm font-bold text-white tracking-wide">Ranking de Tropas Heroe</h3>
        <span className="text-[10px] text-slate-500 ml-auto">{ranking.length} capitanes</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-xs">Cargando ranking...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {!loading && !error && ranking.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-xs">No hay datos de ranking disponibles</div>
      )}

      {!loading && !error && ranking.length > 0 && (
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
          {ranking.map(e => {
            const isMe = e.user_id === profile?.id;
            const ri = e.rank - 1;
            const hasIcon = ri < rankIcons.length;
            const RankIcon = hasIcon ? rankIcons[ri].icon : null;
            const rankColor = hasIcon ? rankIcons[ri].color : 'text-slate-500';
            const rankBg = hasIcon ? rankIcons[ri].bg : 'bg-slate-800/40';
            const rankLabel = hasIcon ? rankIcons[ri].label : '';

            return (
              <div key={e.user_id}
                className={'flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ' + (
                  isMe
                    ? 'bg-cyan-900/30 border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                    : (hasIcon ? rankBg + ' border-white/5' : 'bg-slate-800/30 border-white/5')
                )}>
                <div className={'relative flex items-center justify-center w-7 h-7 rounded-lg text-xs font-extrabold shrink-0 ' + rankColor + (hasIcon ? '' : ' bg-slate-800/60 border border-slate-700/50')}>
                  {RankIcon ? <RankIcon className="w-4 h-4" /> : <span className="text-[10px]">{e.rank}</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={'text-xs font-bold truncate ' + (isMe ? 'text-cyan-300' : 'text-white')}>
                      {e.username}
                      {hasIcon && <span className="ml-1 text-[7px] opacity-50 font-normal">{' '}{rankLabel}</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-slate-500">
                    <span>{(e.wins ?? 0)}G/{(e.losses ?? 0)}P</span>
                    <span className={(e.win_rate ?? 0) >= 50 ? 'text-green-400' : 'text-red-400'}>{(e.win_rate ?? 0)}%</span>
                    <span>Nv.{e.level ?? '-'}</span>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-1">
                  {e.weapon_name && (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/40">
                      <Crosshair className="w-2.5 h-2.5 text-red-400" />
                      <span className="text-[8px] text-slate-400 max-w-[50px] truncate">{e.weapon_name}</span>
                      {rarityBadge(e.weapon_rarity)}
                    </div>
                  )}
                  {e.shield_name && (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/40">
                      <Shield className="w-2.5 h-2.5 text-blue-400" />
                      <span className="text-[8px] text-slate-400 max-w-[50px] truncate">{e.shield_name}</span>
                      {rarityBadge(e.shield_rarity)}
                    </div>
                  )}
                  {e.module_name && (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/40">
                      <Zap className="w-2.5 h-2.5 text-yellow-400" />
                      <span className="text-[8px] text-slate-400 max-w-[50px] truncate">{e.module_name}</span>
                      {rarityBadge(e.module_rarity)}
                    </div>
                  )}
                  {e.reactor_name && (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/40">
                      <Gem className="w-2.5 h-2.5 text-green-400" />
                      <span className="text-[8px] text-slate-400 max-w-[50px] truncate">{e.reactor_name}</span>
                      {rarityBadge(e.reactor_rarity)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {userEntry && ranking.length > 10 && (
        <div className="text-center pt-2 border-t border-slate-700/30">
          <span className="text-[10px] text-slate-500">
            Tu posicion: <span className="text-cyan-400 font-bold">#{userEntry.rank}</span> — {(userEntry.wins ?? 0)}G/{(userEntry.losses ?? 0)}P — <span className="text-cyan-400 font-bold"> {(userEntry.win_rate ?? 0)}%</span> victorias
          </span>
        </div>
      )}
    </div>
  );
}
