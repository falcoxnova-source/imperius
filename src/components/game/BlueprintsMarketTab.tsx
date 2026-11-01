import { useEffect, useState, useCallback } from 'react';
import { Coins, Loader2, Plus, ShoppingCart, X, Tag, Store, AlertCircle, Package, Lock, Crown, PackagePlus, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatNumber } from '../../lib/utils';
import { useIsUserPlus } from '../../hooks/useIsUserPlus';
import { GiftItemModal } from './GiftItemModal';

// Imagen por defecto para las cards de planos en el mercado.
const BLUEPRINT_FALLBACK_IMG = '/Imagenes/planos/Planos.webp';

/**
 * Tab "Planos" del mercado.
 * Sección autocontenida y extensible: a futuro se pueden agregar más tipos de
 * "items permanentes" (relics, decorations, etc.) sin tocar el resto del mercado.
 */

interface ShipBlueprint {
  id: number;
  code: string;
  ship_type_id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price_fxu: number;
  price_usd: number;
  is_active: boolean;
  is_for_sale?: boolean;
}

interface UserBlueprint {
  blueprint_id: number;
  quantity: number;
  last_acquired_at: string | null;
  last_source: string | null;
}

interface BlueprintListing {
  id: string;
  seller_id: string;
  item_code: string;
  total_price: number;
  status: string;
  created_at: string;
  seller?: { username: string } | null;
  blueprint?: ShipBlueprint | null;
}

/** Recursos de fabricacion que se entregan junto con el plano al comprarlo en la tienda */
interface IncludedResources {
  metal: number;
  crystal: number;
  deuterium: number;
}

interface Props {
  fxuBalance: number;
  onChange?: () => void;
}

type Section = 'shop' | 'p2p' | 'inventory' | 'sell';

export function BlueprintsMarketTab({ fxuBalance, onChange }: Props) {
  const navigate = useNavigate();
  const isPlus = useIsUserPlus();
  const [section, setSection] = useState<Section>('shop');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<ShipBlueprint[]>([]);
  const [included, setIncluded] = useState<Record<number, IncludedResources>>({});
  const [inventory, setInventory] = useState<UserBlueprint[]>([]);
  const [listings, setListings] = useState<BlueprintListing[]>([]);
  const [tungPrice, setTungPrice] = useState<number | null>(null);

  const [sellPrice, setSellPrice] = useState<Record<number, string>>({});
  const [giftBp, setGiftBp] = useState<ShipBlueprint | null>(null);

  // Coste en TUNG de un plano: precio USD al precio de mercado, o price_fxu de reserva
  const tungCostOf = useCallback(
    (bp: ShipBlueprint): number | null => {
      if ((bp.price_usd ?? 0) > 0) {
        if (!tungPrice || tungPrice <= 0) return null;
        return Math.ceil(bp.price_usd / tungPrice);
      }
      return bp.price_fxu;
    },
    [tungPrice]
  );

  const blueprintByCode = useCallback(
    (code: string) => catalog.find((b) => b.code === code) || null,
    [catalog]
  );

  const loadCatalog = useCallback(async () => {
    const { data } = await supabase
      .from('ship_blueprints')
      .select('id,code,ship_type_id,name,description,image_url,price_fxu,price_usd,is_active,is_for_sale')
      .eq('is_active', true)
      .order('price_usd', { ascending: true });
    setCatalog((data || []) as ShipBlueprint[]);
  }, []);

  // Recursos de fabricacion que vienen incluidos con cada plano
  const loadIncludedResources = useCallback(async () => {
    const { data } = await supabase
      .from('blueprint_included_resources')
      .select('blueprint_id,metal,crystal,deuterium');
    const map: Record<number, IncludedResources> = {};
    for (const row of (data || []) as Array<{
      blueprint_id: number;
      metal: number;
      crystal: number;
      deuterium: number;
    }>) {
      map[row.blueprint_id] = {
        metal: Number(row.metal || 0),
        crystal: Number(row.crystal || 0),
        deuterium: Number(row.deuterium || 0),
      };
    }
    setIncluded(map);
  }, []);

  const loadTungPrice = useCallback(async () => {
    const { data } = await supabase.rpc('get_live_tung_price_usd');
    setTungPrice(data != null ? Number(data) : null);
  }, []);

  const loadInventory = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setInventory([]);
      return;
    }
    const { data } = await supabase
      .from('user_ship_blueprints')
      .select('blueprint_id, acquired_at, source')
      .eq('user_id', user.id);

    const grouped = new Map<number, UserBlueprint>();
    for (const row of (data || []) as Array<{ blueprint_id: number; acquired_at: string; source: string }>) {
      const current = grouped.get(row.blueprint_id);
      if (!current) {
        grouped.set(row.blueprint_id, {
          blueprint_id: row.blueprint_id,
          quantity: 1,
          last_acquired_at: row.acquired_at,
          last_source: row.source,
        });
      } else {
        const nextDate = new Date(row.acquired_at);
        const prevDate = current.last_acquired_at ? new Date(current.last_acquired_at) : null;
        current.quantity += 1;
        if (!prevDate || nextDate > prevDate) {
          current.last_acquired_at = row.acquired_at;
          current.last_source = row.source;
        }
      }
    }

    setInventory(Array.from(grouped.values()).sort((a, b) => b.quantity - a.quantity));
  }, []);

  const loadListings = useCallback(async () => {
    // [MKTANON1] Mercado anonimo: sin seller_id ni nombre del vendedor
    const [{ data }, { data: auth }] = await Promise.all([
      supabase.rpc('get_market_listings_public', { p_listing_type: 'blueprint' }),
      supabase.auth.getUser(),
    ]);
    const myId = auth.user?.id || '';
    const rows = (Array.isArray(data) ? data : []) as Array<Omit<BlueprintListing, 'seller_id'> & { is_mine: boolean }>;
    setListings(rows.map((l) => ({
      ...l,
      seller_id: l.is_mine ? myId : '',
      seller: { username: l.is_mine ? 'Tú' : 'Anónimo' },
    })));
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadCatalog(),
        loadIncludedResources(),
        loadInventory(),
        loadListings(),
        loadTungPrice(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [loadCatalog, loadIncludedResources, loadInventory, loadListings, loadTungPrice]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (success || error) {
      const t = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 4500);
      return () => clearTimeout(t);
    }
  }, [success, error]);

  const inventoryCount = new Map<number, number>(inventory.map((i) => [i.blueprint_id, i.quantity]));

  // ---------------- ACTIONS ----------------

  const buyFromShop = async (bp: ShipBlueprint) => {
    setProcessing(bp.code);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('purchase_ship_blueprint', {
        p_blueprint_code: bp.code,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'Error al comprar plano');
      setSuccess(
        data.resources_granted
          ? `Plano "${bp.name}" añadido. Recursos de fabricacion depositados en ${data.planet_name || 'tu planeta'}: ` +
            `${formatNumber(Number(data.metal || 0))} metal, ` +
            `${formatNumber(Number(data.crystal || 0))} cristal, ` +
            `${formatNumber(Number(data.deuterium || 0))} deuterio`
          : `Plano "${bp.name}" añadido a tu inventario`
      );
      await refreshAll();
      onChange?.();
    } catch (e: any) {
      setError(e.message || 'Error al comprar plano');
    } finally {
      setProcessing(null);
    }
  };

  const createListing = async (bp: ShipBlueprint) => {
    if (!isPlus) {
      setError('Solo cuentas con VIP Plus pueden vender planos en el mercado P2P');
      return;
    }
    const raw = sellPrice[bp.id];
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Indica un precio válido');
      return;
    }
    setProcessing(`sell-${bp.code}`);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('create_blueprint_market_listing', {
        p_blueprint_code: bp.code,
        p_price_total: price,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'Error al publicar plano');
      setSuccess('Plano publicado en el mercado');
      setSellPrice((prev) => ({ ...prev, [bp.id]: '' }));
      setSection('p2p');
      await refreshAll();
      onChange?.();
    } catch (e: any) {
      setError(e.message || 'Error al publicar plano');
    } finally {
      setProcessing(null);
    }
  };

  const buyListing = async (listing: BlueprintListing) => {
    setProcessing(`buy-${listing.id}`);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('purchase_blueprint_market_listing', {
        p_listing_id: listing.id,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'Error al comprar plano');
      setSuccess('Plano comprado en P2P');
      await refreshAll();
      onChange?.();
    } catch (e: any) {
      setError(e.message || 'Error al comprar plano');
    } finally {
      setProcessing(null);
    }
  };

  const cancelListing = async (listing: BlueprintListing) => {
    setProcessing(`cancel-${listing.id}`);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('cancel_blueprint_market_listing', {
        p_listing_id: listing.id,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'Error al cancelar');
      setSuccess('Listing cancelado y plano devuelto');
      await refreshAll();
      onChange?.();
    } catch (e: any) {
      setError(e.message || 'Error al cancelar');
    } finally {
      setProcessing(null);
    }
  };

  // ---------------- RENDER ----------------

  const renderShop = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
      {catalog.filter((bp) => bp.is_for_sale !== false).map((bp) => {
        const ownedQty = inventoryCount.get(bp.id) || 0;
        const owned = ownedQty > 0;
        const res = included[bp.id];
        const cost = tungCostOf(bp);
        const priceUnavailable = cost === null;
        const canAfford = cost !== null && fxuBalance >= cost;
        const isProc = processing === bp.code;
        return (
          <div
            key={bp.id}
            className={`bg-gradient-to-br from-space-700/80 to-space-800/80 border rounded-xl overflow-hidden transition-all ${owned ? 'border-emerald-500/50' : 'border-space-600 hover:border-cyber-yellow/50'}`}
          >
            <div className="w-full aspect-video bg-space-900 overflow-hidden border-b border-space-600">
              <img
                src={bp.image_url || BLUEPRINT_FALLBACK_IMG}
                alt={bp.name}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
            <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 sm:p-3 flex-shrink-0 bg-gradient-to-br from-cyber-yellow/20 to-amber-500/20 rounded-lg">
                <Tag className="w-6 h-6 sm:w-7 sm:h-7 text-cyber-yellow" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-orbitron text-base text-white break-words">{bp.name}</h3>
                <p className="text-xs text-gray-400 line-clamp-2">{bp.description}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mb-3 bg-space-800/50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400">Precio</span>
              <div className="text-right">
                <div className="text-cyber-yellow font-orbitron font-semibold flex items-center justify-end gap-1">
                  <Coins className="w-4 h-4" />
                  {cost !== null ? `${formatNumber(cost)} TUNG` : '—'}
                </div>
                {(bp.price_usd ?? 0) > 0 && (
                  <div className="text-[11px] text-gray-400">${bp.price_usd} USDT</div>
                )}
              </div>
            </div>

            {/* Recursos de fabricacion incluidos con el plano */}
            {res && res.metal + res.crystal + res.deuterium > 0 && (
              <div className="mb-4 rounded-lg bg-cyber-green/5 border border-cyber-green/30 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <PackagePlus className="w-3.5 h-3.5 text-cyber-green flex-shrink-0" />
                  <span className="text-[10px] font-orbitron text-cyber-green uppercase tracking-wider">
                    Recursos incluidos
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 leading-snug mb-2">
                  Al comprarlo se depositan en tu planeta los recursos exactos para fabricar la unidad.
                </p>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded bg-space-900/70 px-1 py-1">
                    <p className="text-[9px] text-gray-500 uppercase">Metal</p>
                    <p className="text-[11px] font-orbitron text-gray-100">{formatNumber(res.metal)}</p>
                  </div>
                  <div className="rounded bg-space-900/70 px-1 py-1">
                    <p className="text-[9px] text-gray-500 uppercase">Cristal</p>
                    <p className="text-[11px] font-orbitron text-cyan-200">{formatNumber(res.crystal)}</p>
                  </div>
                  <div className="rounded bg-space-900/70 px-1 py-1">
                    <p className="text-[9px] text-gray-500 uppercase">Deuterio</p>
                    <p className="text-[11px] font-orbitron text-emerald-200">{formatNumber(res.deuterium)}</p>
                  </div>
                </div>
                <p className="text-[9px] text-gray-500 leading-snug mt-1.5">
                  Solo al comprar en esta tienda. Los planos del mercado P2P y los de expedicion no traen recursos.
                </p>
              </div>
            )}
            {owned ? (
              <div className="w-full py-2.5 px-4 bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded-lg font-semibold flex items-center justify-center gap-2">
                <Tag className="w-4 h-4" /> Tienes {ownedQty} {ownedQty === 1 ? 'plano' : 'planos'}
              </div>
            ) : (
              <button
                disabled={!canAfford || isProc || priceUnavailable}
                onClick={() => buyFromShop(bp)}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-cyber-yellow/20 to-amber-500/20 hover:from-cyber-yellow/30 hover:to-amber-500/30 text-cyber-yellow border border-cyber-yellow/50 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProc ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Comprando...</>
                ) : priceUnavailable ? (
                  <>Precio no disponible</>
                ) : !canAfford ? (
                  <>TUNG insuficiente</>
                ) : (
                  <><ShoppingCart className="w-4 h-4" /> Comprar plano</>
                )}
              </button>
            )}
            <button
              disabled={priceUnavailable}
              onClick={() => setGiftBp(bp)}
              className="w-full mt-2 py-2 px-4 bg-pink-500/10 hover:bg-pink-500/20 text-pink-200 border border-pink-500/40 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Gift className="w-4 h-4" /> Regalar a un amigo
            </button>
            <p className="text-xs text-gray-400 mt-2 text-center">
              {owned
                ? `Se gasta 1 plano por nave — te alcanza para ${ownedQty} ${ownedQty === 1 ? 'nave' : 'naves'}`
                : 'Consumible — se gasta 1 plano por cada nave construida'}
            </p>
            </div>
          </div>
        );
      })}
      {catalog.length === 0 && (
        <div className="col-span-full text-center py-12 text-gray-400">
          No hay planos disponibles
        </div>
      )}
    </div>
  );

  const renderInventory = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {inventory.length === 0 ? (
        <div className="col-span-full text-center py-12 text-gray-400">
          No tienes planos. Cómpralos en la tienda o encuéntralos en expediciones (probabilidad baja).
        </div>
      ) : (
        inventory.map((row) => {
          const bp = catalog.find((c) => c.id === row.blueprint_id);
          if (!bp) return null;
          return (
            <div
              key={row.blueprint_id}
              className="bg-gradient-to-br from-space-700/80 to-space-800/80 border border-cyber-yellow/30 rounded-xl overflow-hidden"
            >
              <div className="w-full aspect-video bg-space-900 overflow-hidden border-b border-cyber-yellow/20">
                <img
                  src={bp.image_url || BLUEPRINT_FALLBACK_IMG}
                  alt={bp.name}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>
              <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-gradient-to-br from-cyber-yellow/20 to-amber-500/20 rounded-lg">
                  <Tag className="w-7 h-7 text-cyber-yellow" />
                </div>
                <div>
                  <h3 className="font-orbitron text-base text-white">{bp.name}</h3>
                  <p className="text-xs text-gray-400">
                    Último origen: <span className="text-cyan-300">{row.last_source || '—'}</span>
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-3">{bp.description}</p>
              <div className="text-sm text-emerald-300 font-semibold">Cantidad: {row.quantity}</div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const renderSell = () => {
    if (!isPlus) {
      return (
        <div className="max-w-2xl mx-auto bg-gradient-to-br from-amber-500/10 to-cyber-yellow/10 border border-cyber-yellow/40 rounded-xl p-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-cyber-yellow/20 rounded-full">
              <Crown className="w-10 h-10 text-cyber-yellow" />
            </div>
          </div>
          <div>
            <h3 className="font-orbitron text-xl text-white mb-2">Vender planos requiere VIP Plus</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              Solo las cuentas con <span className="text-cyber-yellow font-semibold">VIP Plus</span> activo pueden
              publicar planos en el mercado P2P. Los jugadores sin VIP igualmente pueden
              <span className="text-emerald-300 font-semibold"> consumir sus planos </span>
              para construir naves o conseguir más en
              <span className="text-cyan-300 font-semibold"> expediciones</span>.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 bg-space-900/50 rounded-lg px-4 py-2 border border-space-700">
            <Lock className="w-4 h-4 text-cyber-yellow" />
            <span>Función bloqueada — actívala con VIP Plus</span>
          </div>
          <button
            onClick={() => navigate('/game/vip')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyber-yellow to-amber-500 hover:from-amber-400 hover:to-cyber-yellow text-space-900 rounded-lg font-orbitron font-bold transition-all shadow-lg shadow-cyber-yellow/30"
          >
            <Crown className="w-5 h-5" />
            Obtener VIP Plus
          </button>
        </div>
      );
    }
    return (
    <div className="space-y-4">
      {/* Resumen rapido de cantidades por tipo */}
      {inventory.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {inventory.map((row) => {
            const bp = catalog.find((c) => c.id === row.blueprint_id);
            if (!bp) return null;
            return (
              <div
                key={`sum-${row.blueprint_id}`}
                className="flex items-center gap-2 bg-space-800/70 border border-cyber-yellow/30 rounded-lg px-3 py-1.5"
              >
                <Tag className="w-4 h-4 text-cyber-yellow" />
                <span className="text-sm text-white font-orbitron">{bp.name}</span>
                <span className="text-xs text-cyan-300 font-semibold">x{row.quantity}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {inventory.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">
            No tienes planos para vender
          </div>
        ) : (
          inventory.map((row) => {
            const bp = catalog.find((c) => c.id === row.blueprint_id);
            if (!bp) return null;
            const isProc = processing === `sell-${bp.code}`;
            return (
              <div key={row.blueprint_id} className="bg-space-700/60 border border-space-600 rounded-xl overflow-hidden">
                <div className="w-full aspect-video bg-space-900 overflow-hidden">
                  <img
                    src={bp.image_url || BLUEPRINT_FALLBACK_IMG}
                    alt={bp.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Tag className="w-6 h-6 text-cyber-yellow" />
                    <h3 className="font-orbitron text-base text-white flex-1">{bp.name}</h3>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-gray-400">Disponibles</span>
                    <span className="text-sm text-cyan-300 font-orbitron font-semibold">{row.quantity}</span>
                  </div>
                  <label className="block text-xs text-gray-400 mb-1">Precio total en TUNG (vendes 1 plano)</label>
                  <input
                    type="number"
                    min={1}
                    value={sellPrice[bp.id] ?? ''}
                    onChange={(e) => setSellPrice((prev) => ({ ...prev, [bp.id]: e.target.value }))}
                    placeholder={String(bp.price_fxu)}
                    className="w-full px-3 py-2 bg-space-800 border border-space-600 rounded-lg text-white mb-3 focus:border-cyber-yellow outline-none"
                  />
                  <button
                    disabled={isProc || row.quantity <= 0}
                    onClick={() => createListing(bp)}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Publicar 1 en P2P
                  </button>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Al publicar, 1 plano queda en escrow hasta que se venda o canceles. Te quedaran {Math.max(0, row.quantity - 1)} disponibles.
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
  };

  const renderP2P = () => (
    <div className="space-y-3">
      {listings.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No hay planos en venta ahora mismo</div>
      ) : (
        listings.map((l) => {
          const bp = blueprintByCode(l.item_code);
          const ownedQty = bp ? (inventoryCount.get(bp.id) || 0) : 0;
          const isProc = processing === `buy-${l.id}` || processing === `cancel-${l.id}`;
          return (
            <div
              key={l.id}
              className="flex items-center justify-between gap-4 bg-space-700/60 border border-space-600 rounded-xl p-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Tag className="w-6 h-6 text-cyber-yellow shrink-0" />
                <div className="min-w-0">
                  <div className="font-orbitron text-white truncate">
                    {bp?.name || l.item_code}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    Vendedor: {l.seller?.username || '—'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-cyber-yellow font-orbitron font-semibold flex items-center gap-1 whitespace-nowrap">
                  <Coins className="w-4 h-4" />
                  {formatNumber(l.total_price)} TUNG
                </div>
                <button
                  disabled={isProc || fxuBalance < l.total_price}
                  onClick={() => buyListing(l)}
                  className="px-4 py-2 bg-gradient-to-r from-cyber-yellow/20 to-amber-500/20 hover:from-cyber-yellow/30 hover:to-amber-500/30 text-cyber-yellow border border-cyber-yellow/50 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  {processing === `buy-${l.id}` ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="w-4 h-4" />
                  )}
                  Comprar
                </button>
                {bp && <span className="text-xs text-cyan-300">Tienes: {ownedQty}</span>}
                <CancelButton listing={l} processing={isProc} onCancel={cancelListing} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  // ---------------- LAYOUT ----------------

  const sectionTabs: { key: Section; label: string; icon: JSX.Element; locked?: boolean }[] = [
    { key: 'shop', label: 'Tienda oficial', icon: <Store className="w-4 h-4" /> },
    { key: 'p2p', label: 'Mercado P2P', icon: <ShoppingCart className="w-4 h-4" /> },
    { key: 'inventory', label: 'Mis planos', icon: <Package className="w-4 h-4" /> },
    { key: 'sell', label: 'Vender', icon: isPlus ? <Tag className="w-4 h-4" /> : <Lock className="w-4 h-4" />, locked: !isPlus },
  ];

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="font-orbitron text-xl text-white flex items-center gap-2 mb-1">
          <Tag className="w-6 h-6 text-cyber-yellow" />
          Planos de Naves
        </h2>
        <p className="text-sm text-gray-400">
          Los planos son <span className="text-emerald-300 font-semibold">consumibles</span>:{' '}
          <span className="text-emerald-300 font-semibold">1 plano = 1 nave</span>. Al construir se gasta un plano por
          cada unidad en cola y te saltas los requisitos de tecnologías y edificios (solo necesitas{' '}
          <span className="text-cyber-yellow">Barraca Nv 1</span> y los recursos). Si no te alcanzan los planos, deberás
          cumplir todos los requisitos normales. Acumula los que quieras: cómpralos a la empresa, encuéntralos en
          expediciones o adquiérelos a otros jugadores.
          <span className="block mt-1 text-cyber-yellow/80">
            <Crown className="w-3 h-3 inline mb-0.5 mr-1" />
            Para <strong>vender</strong> planos en el mercado P2P se requiere <strong>VIP Plus</strong> activo.
          </span>
        </p>
      </div>

      {error && (
        <div className="bg-red-500/15 border border-red-500/40 text-red-300 px-4 py-2 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-lg">
          {success}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {sectionTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSection(tab.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
              section === tab.key
                ? 'bg-cyber-yellow text-space-900'
                : tab.locked
                  ? 'bg-space-800 text-cyber-yellow/60 hover:bg-space-700 border border-cyber-yellow/30'
                  : 'bg-space-700 text-gray-400 hover:bg-space-600'
            }`}
            title={tab.locked ? 'Requiere VIP Plus' : undefined}
          >
            {tab.icon}
            {tab.label}
            {tab.locked && <span className="text-[10px] uppercase tracking-wider opacity-80">VIP</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-cyber-yellow animate-spin" />
        </div>
      ) : (
        <>
          {section === 'shop' && renderShop()}
          {section === 'p2p' && renderP2P()}
          {section === 'inventory' && renderInventory()}
          {section === 'sell' && renderSell()}
        </>
      )}

      {giftBp && (
        <GiftItemModal
          open
          onClose={() => setGiftBp(null)}
          kind="blueprint"
          code={giftBp.code}
          itemName={giftBp.name}
          imageUrl={giftBp.image_url || BLUEPRINT_FALLBACK_IMG}
          maxQty={20}
          estimateCost={(q) => {
            const unit = tungCostOf(giftBp);
            return unit !== null ? unit * q : null;
          }}
          onSuccess={() => onChange?.()}
        />
      )}
    </div>
  );
}

function CancelButton({
  listing,
  processing,
  onCancel,
}: {
  listing: BlueprintListing;
  processing: boolean;
  onCancel: (l: BlueprintListing) => void;
}) {
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setMe(data.user?.id || null);
    });
    return () => {
      mounted = false;
    };
  }, []);
  if (!me || me !== listing.seller_id) return null;
  return (
    <button
      disabled={processing}
      onClick={() => onCancel(listing)}
      className="px-3 py-2 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1"
      title="Cancelar y recuperar plano"
    >
      <X className="w-4 h-4" />
    </button>
  );
}
