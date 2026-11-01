import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Loader2, ShoppingCart, AlertCircle, Package, Plus, X, Rocket, Crown, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatNumber } from '../../lib/utils';

/** Tab "Items Héroe" del mercado: compra/venta P2P de items de la Nave Héroe. */

interface HeroListing {
  listing_id: string;
  seller_id: string;
  seller_name: string | null;
  item_id: string;
  item_name: string;
  description: string | null;
  rarity: string;
  slot_type: string;
  item_level: number;
  quantity: number;
  price_fxu: number;
}

interface HeroInvItem {
  inventory_id: string;
  item_id: string;
  name: string;
  rarity: string;
  slot_type: string;
  item_level: number;
  quantity: number;
}

interface Props {
  fxuBalance: number;
  onChange?: () => void;
}

type Section = 'browse' | 'mine' | 'sell';

const RARITY: Record<string, { text: string; border: string; label: string }> = {
  common: { text: 'text-green-400', border: 'border-green-500/30', label: 'Común' },
  rare: { text: 'text-blue-400', border: 'border-blue-500/30', label: 'Raro' },
  epic: { text: 'text-purple-400', border: 'border-purple-500/30', label: 'Épico' },
  legendary: { text: 'text-fuchsia-400', border: 'border-fuchsia-500/30', label: 'Legendario' },
};

const PER_PAGE = 12;

export function HeroItemsMarketTab({ fxuBalance, onChange }: Props) {
  const { profile } = useAuthStore();
  const [section, setSection] = useState<Section>('browse');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [listings, setListings] = useState<HeroListing[]>([]);
  const [inventory, setInventory] = useState<HeroInvItem[]>([]);
  const [rarityFilter, setRarityFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'all' | 'cheapest' | 'expensive'>('all');
  const [page, setPage] = useState(1);
  const [sellQty, setSellQty] = useState<Record<string, number>>({});
  const [sellPrice, setSellPrice] = useState<Record<string, string>>({});
  const [isVip, setIsVip] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const [l, inv, st] = await Promise.all([
      supabase.rpc('get_hero_market_listings'),
      supabase.rpc('get_hero_inventory', { p_user_id: profile.id }),
      supabase.rpc('get_plus_status'),
    ]);
    setListings(Array.isArray(l.data) ? (l.data as HeroListing[]) : []);
    setInventory(Array.isArray(inv.data) ? (inv.data as HeroInvItem[]) : []);
    setIsVip(!!(st.data as { is_plus?: boolean } | null)?.is_plus);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  // [HEROAUDIT3] Mismo calculo que el servidor: fee = FLOOR(10% del total), lo paga el vendedor
  const marketFee = (total: number) => Math.floor(total * 0.1);

  const flash = (ok: boolean, msg: string) => {
    if (ok) { setSuccess(msg); setError(null); } else { setError(msg); setSuccess(null); }
    setTimeout(() => { setSuccess(null); setError(null); }, 3500);
  };

  const run = async (key: string, rpc: string, args: Record<string, unknown>, okMsg: string) => {
    setProcessing(key);
    const { data, error: err } = await supabase.rpc(rpc, args);
    if (err) flash(false, err.message);
    else if (data && data.success === false) flash(false, data.error || 'Error');
    else { flash(true, data?.message || okMsg); await load(); onChange?.(); }
    setProcessing(null);
  };

  const buy = (l: HeroListing) => {
    const total = l.price_fxu * l.quantity;
    if (total > fxuBalance) { flash(false, 'TUNG insuficiente'); return; }
    if (!confirm(`¿Comprar ${l.item_name} x${l.quantity} por ${formatNumber(total)} TUNG?`)) return;
    run(l.listing_id, 'buy_hero_item_listing', { p_listing_id: l.listing_id }, 'Item comprado');
  };

  const cancel = (l: HeroListing) =>
    run(l.listing_id, 'cancel_hero_item_listing', { p_listing_id: l.listing_id }, 'Listado cancelado');

  const list = (it: HeroInvItem) => {
    const qty = Math.min(it.quantity, Math.max(1, sellQty[it.inventory_id] || 1));
    const price = parseInt(sellPrice[it.inventory_id] || '0') || 0;
    if (price < 1) { flash(false, 'Indica un precio válido'); return; }
    run(it.inventory_id, 'create_hero_item_listing', {
      p_item_id: it.item_id, p_item_level: it.item_level, p_quantity: qty, p_price_fxu: price,
    }, 'Item listado en el mercado');
  };

  const others = listings.filter(l => l.seller_id !== profile?.id);
  const mine = listings.filter(l => l.seller_id === profile?.id);
  const filtered = rarityFilter === 'all' ? others : others.filter(l => l.rarity === rarityFilter);
  const sorted = [...filtered].sort((a, b) => {
    const pa = a.price_fxu * a.quantity, pb = b.price_fxu * b.quantity;
    return sortOrder === 'expensive' ? pb - pa : sortOrder === 'cheapest' ? pa - pb : 0;
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-cyber-yellow" /></div>;
  }

  const sectionBtn = (key: Section, label: string, icon: React.ReactNode) => (
    <button key={key} onClick={() => setSection(key)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${section === key ? 'bg-cyber-yellow/20 text-cyber-yellow border border-cyber-yellow/40' : 'bg-space-700 text-gray-400 border border-space-600 hover:text-white'}`}>
      {icon}{label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {sectionBtn('browse', 'En venta', <ShoppingCart className="w-4 h-4" />)}
          {sectionBtn('mine', `Mis listados (${mine.length})`, <Package className="w-4 h-4" />)}
          {sectionBtn('sell', 'Vender', <Plus className="w-4 h-4" />)}
        </div>
        <div className="bg-space-700 px-3 py-1.5 rounded-lg text-[11px] text-gray-400">
          Comisión <span className="text-cyber-yellow font-semibold">10%</span> (la paga el vendedor) · 50% pool jackpot / 50% empresa
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"><AlertCircle className="w-4 h-4" />{error}</div>}
      {success && <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">{success}</div>}

      {/* [VIPITEM1] Reglas de venta por rareza */}
      <div className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border ${isVip ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-fuchsia-500/10 border-fuchsia-500/30'}`}>
        <div className="flex items-center gap-2 text-xs">
          <Crown className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          {isVip ? (
            <span className="text-yellow-300">Eres <b>VIP</b>: puedes vender objetos <span className="text-green-400">Comunes</span>, <span className="text-blue-400">Raros</span>, <span className="text-purple-400">Épicos</span> y <span className="text-fuchsia-400">Legendarios</span>.</span>
          ) : (
            <span className="text-gray-300"><b>Free</b>: solo puedes vender objetos <span className="text-green-400">Comunes</span>. Para vender <span className="text-blue-400">Raros</span>, <span className="text-purple-400">Épicos</span> y <span className="text-fuchsia-400">Legendarios</span> necesitas <b className="text-yellow-400">VIP</b>. Comprar está permitido para todos.</span>
          )}
        </div>
        {!isVip && (
          <Link to="/game/vip" className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/30">
            <Crown className="w-3 h-3" />Hazte VIP
          </Link>
        )}
      </div>

      {section === 'browse' && (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {(['all', 'common', 'rare', 'epic', 'legendary'] as const).map(r => (
              <button key={r} onClick={() => { setRarityFilter(r); setPage(1); }}
                className={`px-2 py-1 text-xs rounded border ${rarityFilter === r ? 'bg-cyber-yellow/20 border-cyber-yellow/40 text-cyber-yellow' : 'bg-space-700 border-space-600 text-gray-400'}`}>
                {r === 'all' ? 'Todas' : RARITY[r].label}
              </button>
            ))}
            <span className="mx-2 text-space-600">|</span>
            {(['all', 'cheapest', 'expensive'] as const).map(s => (
              <button key={s} onClick={() => setSortOrder(s)}
                className={`px-2 py-1 text-xs rounded border ${sortOrder === s ? 'bg-cyber-yellow/20 border-cyber-yellow/40 text-cyber-yellow' : 'bg-space-700 border-space-600 text-gray-400'}`}>
                {s === 'all' ? 'Recientes' : s === 'cheapest' ? 'Más barato' : 'Más caro'}
              </button>
            ))}
          </div>
          {paged.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No hay items de héroe en venta</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {paged.map(l => {
                const rc = RARITY[l.rarity] || RARITY.common;
                const total = l.price_fxu * l.quantity;
                return (
                  <div key={l.listing_id} className={`bg-space-700 border ${rc.border} rounded-lg p-3 space-y-2`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className={`font-semibold text-sm ${rc.text}`}>{l.item_name}</div>
                        <div className="text-[11px] text-gray-500">{rc.label} · Nv.{l.item_level} · x{l.quantity}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-cyber-yellow font-orbitron text-sm">{formatNumber(total)}</div>
                        <div className="text-[10px] text-gray-500">{formatNumber(l.price_fxu)} c/u</div>
                        <div className="text-[10px] text-gray-500">Pagas {formatNumber(total)} · sin recargo</div>
                      </div>
                    </div>
                    {l.description && <p className="text-[11px] text-gray-400">{l.description}</p>}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">Vendedor: {l.seller_name || 'Anónimo'}</span>
                      <button onClick={() => buy(l)} disabled={processing !== null}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-cyber-yellow/20 text-cyber-yellow border border-cyber-yellow/40 hover:bg-cyber-yellow/30 disabled:opacity-50">
                        {processing === l.listing_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShoppingCart className="w-3 h-3" />}Comprar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-xs text-gray-400">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-2 py-1 rounded bg-space-700 disabled:opacity-40">Anterior</button>
              <span>Pág {safePage} de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-2 py-1 rounded bg-space-700 disabled:opacity-40">Siguiente</button>
            </div>
          )}
          <p className="text-[11px] text-gray-500">El comprador paga el precio indicado. El vendedor recibe el total menos 10% de comisión (50% pool jackpot / 50% empresa).</p>
        </>
      )}

      {section === 'mine' && (
        mine.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No tienes items de héroe en venta</p>
        ) : (
          <div className="space-y-2">
            {mine.map(l => {
              const rc = RARITY[l.rarity] || RARITY.common;
              return (
                <div key={l.listing_id} className={`flex items-center justify-between bg-space-700 border ${rc.border} rounded-lg p-3`}>
                  <div>
                    <div className={`font-semibold text-sm ${rc.text}`}>{l.item_name} <span className="text-[11px] text-gray-500">Nv.{l.item_level} · x{l.quantity}</span></div>
                    <div className="text-[11px] text-gray-500">{formatNumber(l.price_fxu)} TUNG c/u · Recibirás {formatNumber(l.price_fxu * l.quantity - marketFee(l.price_fxu * l.quantity))} TUNG al venderse (−10%)</div>
                  </div>
                  <button onClick={() => cancel(l)} disabled={processing !== null}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50">
                    {processing === l.listing_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}Cancelar
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}

      {section === 'sell' && (
        inventory.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">
            <Rocket className="w-8 h-8 mx-auto mb-2 text-gray-600" />
            No tienes items de héroe en el inventario. Los items equipados deben desequiparse antes de venderlos.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inventory.map(it => {
              const rc = RARITY[it.rarity] || RARITY.common;
              const sQty = Math.min(it.quantity, Math.max(1, sellQty[it.inventory_id] || 1));
              const sPrice = parseInt(sellPrice[it.inventory_id] || '0') || 0;
              const sTotal = sQty * sPrice;
              const sFee = marketFee(sTotal);
              const locked = !isVip && (it.rarity || 'common') !== 'common';
              if (locked) {
                return (
                  <div key={it.inventory_id} className={`bg-space-700/60 border ${rc.border} rounded-lg p-3 space-y-2`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className={`font-semibold text-sm ${rc.text}`}>{it.name} <span className="text-[11px] text-gray-500">{rc.label} · Nv.{it.item_level} · x{it.quantity}</span></div>
                      <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/30"><Lock className="w-3 h-3" />Solo VIP</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-gray-400">Los objetos {rc.label}s solo pueden venderlos jugadores VIP.</span>
                      <Link to="/game/vip" className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/30 whitespace-nowrap">
                        <Crown className="w-3 h-3" />Hazte VIP
                      </Link>
                    </div>
                  </div>
                );
              }
              return (
                <div key={it.inventory_id} className={`bg-space-700 border ${rc.border} rounded-lg p-3 space-y-2`}>
                  <div className={`font-semibold text-sm ${rc.text}`}>{it.name} <span className="text-[11px] text-gray-500">{rc.label} · Nv.{it.item_level} · x{it.quantity}</span></div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={it.quantity} value={sellQty[it.inventory_id] || 1}
                      onChange={e => setSellQty(s => ({ ...s, [it.inventory_id]: Math.min(it.quantity, Math.max(1, parseInt(e.target.value) || 1)) }))}
                      className="w-16 bg-space-800 border border-space-600 rounded px-2 py-1 text-white text-xs" title="Cantidad" />
                    <input type="number" min={1} value={sellPrice[it.inventory_id] || ''} placeholder="Precio c/u (TUNG)"
                      onChange={e => setSellPrice(s => ({ ...s, [it.inventory_id]: e.target.value }))}
                      className="flex-1 bg-space-800 border border-space-600 rounded px-2 py-1 text-white text-xs" />
                    <button onClick={() => list(it)} disabled={processing !== null}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-cyber-yellow/20 text-cyber-yellow border border-cyber-yellow/40 hover:bg-cyber-yellow/30 disabled:opacity-50">
                      {processing === it.inventory_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Coins className="w-3 h-3" />}Publicar
                    </button>
                  </div>
                  {sTotal > 0 ? (
                    <div className="text-[11px] text-gray-400">
                      Total {formatNumber(sTotal)} − comisión 10% ({formatNumber(sFee)}) = <span className="text-green-400 font-semibold">recibes {formatNumber(sTotal - sFee)} TUNG</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-500">Cantidad y precio por unidad. Al venderse recibes el total menos 10% de comisión.</div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
