import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../lib/i18n';
import { ShoppingBag, Loader2, Clock, CheckCircle, Circle } from 'lucide-react';
import { getBattleEffectStyle } from '../../lib/battleEffects';

interface CosmeticItem {
  id: string;
  code: string;
  type: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  usd_cost?: number;
  duration_days: number;
  rarity: string;
  owned?: boolean;
  equipped?: boolean;
  expires_at?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  title: '🏷️ Títulos',
  badge: '🎖️ Insignias',
  planet_effect: '🪐 Efectos de Ciudad',
  hero_skin: '🚀 Skins de Tropa Héroe',
  battle_effect: '⚡ Efectos de Batalla',
};

const RARITY_COLORS: Record<string, string> = {
  common: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  rare: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  epic: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  legendary: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  mythic: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const RARITY_ICONS: Record<string, string> = {
  common: '⭐',
  rare: '⭐⭐',
  epic: '🌟🌟🌟',
  legendary: '👑',
  mythic: '💎',
};

export function CosmeticsPage() {
  const { t } = useI18n();
  const { profile } = useAuthStore();
  const [catalog, setCatalog] = useState<CosmeticItem[]>([]);
  const [fxuBalance, setFxuBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [equippingId, setEquippingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState<string>('');

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError('');
    try {
      const [catRes, balRes] = await Promise.all([
        supabase.rpc('get_cosmetic_catalog'),
        supabase.from('profiles').select('tung_balance').eq('id', profile.id).single(),
      ]);
      if (catRes.data) {
        // RPC returns { get_cosmetic_catalog: [...] }
        const raw = catRes.data as any;
        const list = raw?.get_cosmetic_catalog || raw;
        setCatalog(Array.isArray(list) ? list : []);
      } else {
        setCatalog([]);
      }

      if (balRes.data) setFxuBalance(balRes.data.tung_balance || 0);
    } catch (err) {
      console.error('Error loading cosmetics:', err);
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePurchase = async (item: CosmeticItem) => {
    if (!profile) return;
    if (fxuBalance < item.cost) {
      setError('TUNG insuficiente');
      return;
    }
    setBuyingId(item.id);
    setError('');
    setSuccessMsg('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('purchase_cosmetic', { p_cosmetic_id: item.id });
      if (rpcErr) throw new Error(rpcErr.message);
      if (data && !data.success) throw new Error(data.error || 'Error al comprar');
      setSuccessMsg(`¡${item.name} comprado!`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al comprar');
    } finally {
      setBuyingId(null);
    }
  };

  const handleEquip = async (item: CosmeticItem) => {
    setEquippingId(item.id);
    setError('');
    setSuccessMsg('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('equip_cosmetic', { p_cosmetic_id: item.id });
      if (rpcErr) throw new Error(rpcErr.message);
      if (data && !data.success) throw new Error(data.error || 'Error al equipar');
      setSuccessMsg('¡Equipado!');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al equipar');
    } finally {
      setEquippingId(null);
    }
  };

  const handleUnequip = async (item: CosmeticItem) => {
    setEquippingId(item.id);
    setError('');
    setSuccessMsg('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('unequip_cosmetic', { p_cosmetic_type: item.type });
      if (rpcErr) throw new Error(rpcErr.message);
      if (data && !data.success) throw new Error(data.error || 'Error al desequipar');
      setSuccessMsg('Desequipado');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al desequipar');
    } finally {
      setEquippingId(null);
    }
  };


  const itemsByType = catalog.reduce((acc, item) => {
    const t = item.type || 'other';
    if (!acc[t]) acc[t] = [];
    acc[t].push(item);
    return acc;
  }, {} as Record<string, CosmeticItem[]>);

  // Set default tab to first available type when catalog loads
  useEffect(() => {
    const types = Object.keys(itemsByType);
    if (types.length > 0 && !activeTab) {
      setActiveTab(types[0]);
    }
  }, [itemsByType, activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShoppingBag className="w-7 h-7 text-cyber-blue" />
        <h1 className="font-orbitron text-2xl text-white">{t.nav.cosmetics}</h1>
        <span className="ml-auto font-orbitron text-sm text-cyber-yellow bg-cyber-yellow/10 px-3 py-1 rounded-full border border-cyber-yellow/20">
          💰 {fxuBalance.toLocaleString()} TUNG
        </span>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">{error}</div>
      )}
      {successMsg && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-green-400 text-sm">{successMsg}</div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-white/10">
        {Object.entries(itemsByType).map(([type, items]) => {
          if (!items || items.length === 0) return null;
          const isActive = activeTab === type;
          return (
            <button
              key={type}
              onClick={() => setActiveTab(isActive ? '' : type)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-cyber-blue/10 border border-b-0 border-cyber-blue/30 text-cyber-blue'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {TYPE_LABELS[type] || type} ({items.length})
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      {activeTab && itemsByType[activeTab] && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {itemsByType[activeTab].filter(Boolean).map(item => {
              if (!item) return null;
              const owned = item.owned ?? false;
              const equipped = item.equipped ?? false;
              const isProcessing = buyingId === item.id || equippingId === item.id;
              const battleStyle = item.type === 'battle_effect' ? getBattleEffectStyle(item.code) : null;

              return (
                <div
                  key={item.id}
                  className={`relative card-glass p-4 border transition-all overflow-hidden ${
                    equipped
                      ? battleStyle
                        ? `${battleStyle.border} ${battleStyle.glow} bg-cyber-yellow/5`
                        : 'border-cyber-yellow/50 bg-cyber-yellow/5'
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  {equipped && battleStyle && (
                    <div className={`absolute -inset-px opacity-10 blur-xl pointer-events-none ${battleStyle.particle} animate-pulse`} />
                  )}
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-3xl">{item.icon}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${RARITY_COLORS[item.rarity] || 'text-gray-400'}`}>
                      {RARITY_ICONS[item.rarity]} {item.rarity}
                    </span>
                  </div>
                  <h3 className="font-semibold text-white text-sm mb-1">{item.name}</h3>
                  <p className="text-gray-500 text-xs mb-3 line-clamp-2">{item.description}</p>
                  {equipped && battleStyle && (
                    <div className={`relative mb-3 rounded-lg border ${battleStyle.border} bg-black/30 px-2 py-1.5 flex items-center gap-2 overflow-hidden`}>
                      <span className="text-base animate-pulse">{battleStyle.emoji}</span>
                      <span className="text-[10px] text-gray-300">Se muestra en <b>Ejército</b> y <b>Combate</b></span>
                      <div className={`absolute bottom-0 left-0 h-0.5 w-full ${battleStyle.particle} animate-pulse`} />
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <Clock className="w-3 h-3" />
                    <span>{item.duration_days} días</span>
                    <span className="ml-auto text-right">
                      <span className="font-orbitron text-cyber-yellow block">{(item.cost ?? 0).toLocaleString()} TUNG</span>
                      {item.usd_cost != null && item.usd_cost > 0 && (
                        <span className="text-emerald-400 text-[10px]">≈ ${item.usd_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
                      )}
                    </span>
                  </div>

                  {equipped ? (
                    <button
                      onClick={() => handleUnequip(item)}
                      disabled={isProcessing}
                      className="w-full px-3 py-2 bg-cyber-yellow/10 border border-cyber-yellow/30 text-cyber-yellow rounded-lg text-sm hover:bg-cyber-yellow/20 flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Equipado
                    </button>
                  ) : owned ? (
                    <button
                      onClick={() => handleEquip(item)}
                      disabled={isProcessing}
                      className="w-full px-3 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-sm hover:bg-cyan-500/20 flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Circle className="w-4 h-4" />}
                      Equipar
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePurchase(item)}
                      disabled={isProcessing || fxuBalance < item.cost}
                      className="w-full px-3 py-2 bg-cyber-blue/10 border border-cyber-blue/30 text-cyber-blue rounded-lg text-sm hover:bg-cyber-blue/20 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
                      {fxuBalance < item.cost ? 'TUNG Insuficiente' : 'Comprar'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

