import { useEffect, useState, useCallback, useMemo } from 'react';
import { Coins, Loader2, ShoppingCart, Rocket, ShieldHalf, Zap, Factory, Gift } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatNumber } from '../../lib/utils';
import { useGameStore } from '../../store/gameStore';
import { GiftItemModal } from './GiftItemModal';

/**
 * Tab "Astillero" del mercado.
 *
 * La Corporacion mantiene astilleros orbitales que venden naves y defensas ya
 * ensambladas: sin cola de construccion y sin gastar recursos del planeta.
 * Se paga en TUNG al cambio vivo del precio en USD que fija el administrador.
 *
 * Todo el cobro, el reparto (pool / empresa / accionistas / referido) y la
 * entrega ocurren dentro de la RPC `purchase_instant_unit`.
 */

interface CatalogItem {
  code: string;
  item_type: 'ship' | 'defense';
  ship_type_id: number | null;
  defense_type_id: number | null;
  name: string;
  description: string | null;
  image_url: string | null;
  price_usd: number;
  max_per_order: number;
  sort_order: number;
  structural_integrity: number | null;
  shield_power: number | null;
  weapon_power: number | null;
  cargo_capacity: number | null;
  base_speed: number | null;
  max_per_planet: number | null;
}

interface Props {
  fxuBalance: number;
  onChange?: () => void;
}

type Section = 'ship' | 'defense';

export function InstantShipyardTab({ fxuBalance, onChange }: Props) {
  const { planets, currentPlanet, fetchShips, fetchDefenses } = useGameStore();

  const [section, setSection] = useState<Section>('ship');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [tungPrice, setTungPrice] = useState<number | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [targetPlanet, setTargetPlanet] = useState<string>('');
  const [giftItem, setGiftItem] = useState<CatalogItem | null>(null);

  useEffect(() => {
    if (!targetPlanet && currentPlanet?.id) setTargetPlanet(currentPlanet.id);
  }, [currentPlanet, targetPlanet]);

  const loadCatalog = useCallback(async () => {
    const { data } = await supabase
      .from('instant_unit_catalog')
      .select('*')
      .order('sort_order', { ascending: true });
    setCatalog((data || []) as CatalogItem[]);
  }, []);

  const loadTungPrice = useCallback(async () => {
    const { data } = await supabase.rpc('get_live_tung_price_usd');
    setTungPrice(data != null ? Number(data) : null);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadCatalog(), loadTungPrice()]);
    } finally {
      setLoading(false);
    }
  }, [loadCatalog, loadTungPrice]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const items = useMemo(
    () => catalog.filter((c) => c.item_type === section),
    [catalog, section]
  );

  const quantityOf = useCallback(
    (item: CatalogItem) => {
      const raw = qty[item.code];
      const n = raw === undefined || raw === '' ? 1 : Math.floor(Number(raw));
      if (!Number.isFinite(n) || n < 1) return 1;
      return Math.min(n, item.max_per_order);
    },
    [qty]
  );

  const tungCostOf = useCallback(
    (item: CatalogItem, quantity: number): number | null => {
      if (!tungPrice || tungPrice <= 0) return null;
      return Math.ceil((item.price_usd * quantity) / tungPrice);
    },
    [tungPrice]
  );

  const buy = async (item: CatalogItem) => {
    if (!targetPlanet) {
      setError('Elige una ciudad de destino');
      return;
    }
    const quantity = quantityOf(item);
    setProcessing(item.code);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('purchase_instant_unit', {
        p_code: item.code,
        p_planet_id: targetPlanet,
        p_quantity: quantity,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'Error al comprar');
      setSuccess(data.message || 'Unidades entregadas');
      setQty((prev) => ({ ...prev, [item.code]: '' }));
      onChange?.();
      // Solo tiene sentido refrescar el planeta que se esta viendo
      if (currentPlanet?.id === targetPlanet) {
        if (item.item_type === 'ship') await fetchShips(targetPlanet);
        else await fetchDefenses(targetPlanet);
      }
    } catch (e: any) {
      setError(e.message || 'Error al comprar');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-cyber-yellow" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-4 sm:space-y-5">
      {/* Cabecera narrativa */}
      <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-space-800/60 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 sm:p-3 bg-cyan-500/15 rounded-lg flex-shrink-0">
            <Factory className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <h3 className="font-orbitron text-base sm:text-lg text-white mb-1">Astillero Corporativo</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Las líneas de montaje de la Corporación trabajan sin descanso. Compra tropas y
              defensas <span className="text-cyan-300">ya ensambladas</span>: se entregan al
              instante en la ciudad que elijas, sin cola de construcción y sin gastar un solo
              gramo de tus recursos. Se paga en TUNG al cambio del momento.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg text-sm break-words">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/20 border border-green-500 text-green-300 px-4 py-3 rounded-lg text-sm break-words">
          {success}
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="grid grid-cols-2 sm:flex gap-2">
          <button
            onClick={() => setSection('ship')}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              section === 'ship'
                ? 'bg-cyber-yellow text-space-900'
                : 'bg-space-700 text-gray-400 hover:bg-space-600'
            }`}
          >
            <Rocket className="w-4 h-4" /> Tropas
          </button>
          <button
            onClick={() => setSection('defense')}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              section === 'defense'
                ? 'bg-cyber-yellow text-space-900'
                : 'bg-space-700 text-gray-400 hover:bg-space-600'
            }`}
          >
            <ShieldHalf className="w-4 h-4" /> Defensas
          </button>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 whitespace-nowrap">Entregar en</span>
          <select
            value={targetPlanet}
            onChange={(e) => setTargetPlanet(e.target.value)}
            className="min-w-0 flex-1 sm:flex-none sm:max-w-[16rem] truncate bg-space-700 border border-space-600 text-white rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:border-cyber-yellow"
          >
            {planets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Catalogo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {items.map((item) => {
          const quantity = quantityOf(item);
          const cost = tungCostOf(item, quantity);
          const priceUnavailable = cost === null;
          const canAfford = cost !== null && fxuBalance >= cost;
          const isProc = processing === item.code;
          const limited = item.item_type === 'defense' && !!item.max_per_planet;

          return (
            <div
              key={item.code}
              className="bg-gradient-to-br from-space-700/80 to-space-800/80 border border-space-600 hover:border-cyan-400/50 rounded-xl overflow-hidden transition-all flex flex-col"
            >
              <div className="w-full aspect-video bg-space-900 overflow-hidden border-b border-space-600">
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                )}
              </div>

              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start gap-2 mb-3">
                  <h3 className="font-orbitron text-base text-white flex-1 min-w-0 break-words">{item.name}</h3>
                  {limited && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                      máx {item.max_per_planet}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center mb-3">
                  <div className="rounded bg-space-900/70 px-1 py-1">
                    <p className="text-[9px] text-gray-500 uppercase">Casco</p>
                    <p className="text-[11px] font-orbitron text-gray-100">
                      {formatNumber(item.structural_integrity || 0)}
                    </p>
                  </div>
                  <div className="rounded bg-space-900/70 px-1 py-1">
                    <p className="text-[9px] text-gray-500 uppercase">Escudo</p>
                    <p className="text-[11px] font-orbitron text-cyan-200">
                      {formatNumber(item.shield_power || 0)}
                    </p>
                  </div>
                  <div className="rounded bg-space-900/70 px-1 py-1">
                    <p className="text-[9px] text-gray-500 uppercase">Ataque</p>
                    <p className="text-[11px] font-orbitron text-red-300">
                      {formatNumber(item.weapon_power || 0)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-3 bg-space-800/50 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-400">
                    {quantity > 1 ? `Total (${quantity})` : 'Precio'}
                  </span>
                  <div className="text-right">
                    <div className="text-cyber-yellow font-orbitron font-semibold flex items-center justify-end gap-1">
                      <Coins className="w-4 h-4" />
                      {cost !== null ? `${formatNumber(cost)} TUNG` : '—'}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      ${item.price_usd} USDT c/u
                    </div>
                  </div>
                </div>

                <div className="mt-auto space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Cantidad</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={item.max_per_order}
                      value={qty[item.code] ?? ''}
                      placeholder="1"
                      onChange={(e) => setQty((prev) => ({ ...prev, [item.code]: e.target.value }))}
                      className="min-w-0 flex-1 bg-space-900 border border-space-600 text-white rounded-lg px-3 py-1.5 text-base sm:text-sm focus:outline-none focus:border-cyber-yellow"
                    />
                  </div>

                  <button
                    disabled={!canAfford || isProc || priceUnavailable || !targetPlanet}
                    onClick={() => buy(item)}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500/20 to-cyan-600/20 hover:from-cyan-500/30 hover:to-cyan-600/30 text-cyan-200 border border-cyan-500/50 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProc ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Ensamblando...</>
                    ) : priceUnavailable ? (
                      <>Precio no disponible</>
                    ) : !canAfford ? (
                      <>TUNG insuficiente</>
                    ) : (
                      <><ShoppingCart className="w-4 h-4" /> Comprar</>
                    )}
                  </button>
                  <button
                    disabled={priceUnavailable}
                    onClick={() => setGiftItem(item)}
                    className="w-full py-2 px-4 bg-pink-500/10 hover:bg-pink-500/20 text-pink-200 border border-pink-500/40 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Gift className="w-4 h-4" /> Regalar a un amigo
                  </button>
                  <p className="text-[11px] text-gray-500 text-center flex items-center justify-center gap-1">
                    <Zap className="w-3 h-3" /> Entrega inmediata
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400">
            El astillero no tiene {section === 'ship' ? 'tropas' : 'defensas'} a la venta
          </div>
        )}
      </div>

      {giftItem && (
        <GiftItemModal
          open
          onClose={() => setGiftItem(null)}
          kind="instant_unit"
          code={giftItem.code}
          itemName={giftItem.name}
          imageUrl={giftItem.image_url}
          maxQty={giftItem.max_per_order}
          estimateCost={(q) => tungCostOf(giftItem, q)}
          onSuccess={() => onChange?.()}
        />
      )}
    </div>
  );
}
