import { useEffect, useMemo, useState } from 'react';
import { Globe, Moon, AlertCircle, Crown, Loader2, Pickaxe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { COLONY_LISTING_CHANGED_EVENT } from '../ui/ColonySaleLock';
import { useGameStore } from '../../store/gameStore';
import { formatNumber, getPlanetImage } from '../../lib/utils';

// [COLMKT2] Recursos que le quedan a la colonia (los yacimientos se agotan)
export interface ColonyDeposits {
  metal: number | null;
  crystal: number | null;
  deuterium: number | null;
  metalPct: number | null;
  crystalPct: number | null;
  deuteriumPct: number | null;
}

export const COLONY_DEPOSIT_COLUMNS =
  'metal_deposit, crystal_deposit, deuterium_deposit, metal_initial_deposit, crystal_initial_deposit, deuterium_initial_deposit';

type DepositRow = {
  metal_deposit: number | null;
  crystal_deposit: number | null;
  deuterium_deposit: number | null;
  metal_initial_deposit: number | null;
  crystal_initial_deposit: number | null;
  deuterium_initial_deposit: number | null;
};

const depositPct = (current: number | null, initial: number | null): number | null =>
  current !== null && initial !== null && initial > 0 ? Math.max(0, Math.min(100, (current / initial) * 100)) : null;

export function toColonyDeposits(row: DepositRow): ColonyDeposits {
  return {
    metal: row.metal_deposit,
    crystal: row.crystal_deposit,
    deuterium: row.deuterium_deposit,
    metalPct: depositPct(row.metal_deposit, row.metal_initial_deposit),
    crystalPct: depositPct(row.crystal_deposit, row.crystal_initial_deposit),
    deuteriumPct: depositPct(row.deuterium_deposit, row.deuterium_initial_deposit),
  };
}

export function ColonyDepositsInfo({ deposits, compact }: { deposits: ColonyDeposits; compact?: boolean }) {
  const rows = [
    { label: 'Hierro', amount: deposits.metal, pct: deposits.metalPct },
    { label: 'Piedra', amount: deposits.crystal, pct: deposits.crystalPct },
    { label: 'Comida', amount: deposits.deuterium, pct: deposits.deuteriumPct },
  ];
  if (rows.every((r) => r.amount === null)) return null;
  const barColor = (pct: number | null) =>
    pct === null ? 'bg-gray-500' : pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500';

  if (compact) {
    return (
      <p className="text-[11px] text-amber-300/90 flex items-center gap-1 flex-wrap">
        <Pickaxe className="w-3 h-3 flex-shrink-0" />
        <span className="text-gray-400">Le quedan:</span>
        {rows.map((r) => (
          <span key={r.label} className="font-mono">
            {r.label[0]} {r.amount === null ? '∞' : formatNumber(r.amount)}
          </span>
        ))}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1.5">
      <p className="text-amber-300 font-semibold flex items-center gap-1">
        <Pickaxe className="w-3.5 h-3.5" /> Recursos que le quedan a la colonia
      </p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-16 text-gray-400">{r.label}</span>
          <div className="flex-1 bg-space-700 rounded-full h-2">
            <div className={`h-2 rounded-full ${barColor(r.pct)}`} style={{ width: `${r.amount === null ? 100 : r.pct ?? 0}%` }} />
          </div>
          <span className="text-gray-300 w-24 text-right font-mono">
            {r.amount === null ? '∞' : formatNumber(r.amount)}
            {r.pct !== null && <span className={r.pct < 20 ? 'text-red-400' : 'text-gray-500'}> ({r.pct.toFixed(0)}%)</span>}
          </span>
        </div>
      ))}
      <p className="text-gray-500">Cuando un yacimiento llega a 0 la mina deja de producir ese recurso.</p>
    </div>
  );
}

interface ColonySellSectionProps {
  isPlus: boolean;
  feePercent: number;
  disabled?: boolean;
  onCreated: (message: string) => void;
  onError: (message: string) => void;
}

// [COLMKT1] Venta de colonias en el mercado (solo VIP). Toda la validacion real
// (propiedad, VIP, colas, flotas, precio) se hace en el RPC create_colony_listing.
export function ColonySellSection({ isPlus, feePercent, disabled, onCreated, onError }: ColonySellSectionProps) {
  const navigate = useNavigate();
  const planets = useGameStore((s) => s.planets);
  const [planetId, setPlanetId] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deposits, setDeposits] = useState<ColonyDeposits | null>(null);
  // [COLMKT4] Precio minimo (USD convertido a TUNG en vivo). El RPC lo valida igualmente.
  const [minPrice, setMinPrice] = useState<{ min_usd: number; min_tung: number | null } | null>(null);

  useEffect(() => {
    if (!isPlus) return;
    let cancelled = false;
    const load = () => {
      supabase.rpc('get_colony_min_price').then(({ data, error }) => {
        if (!cancelled && !error && data) setMinPrice(data as { min_usd: number; min_tung: number | null });
      });
    };
    load();
    const interval = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isPlus]);

  const colonies = useMemo(
    () => planets.filter((p) => p.planet_type === 'planet' && !p.is_main_planet),
    [planets]
  );
  const selected = colonies.find((p) => p.id === planetId) || null;
  const moon = selected
    ? planets.find(
        (p) =>
          p.planet_type === 'moon' &&
          p.galaxy === selected.galaxy &&
          p.solar_system === selected.solar_system &&
          p.position === selected.position
      ) || null
    : null;

  useEffect(() => {
    setDeposits(null);
    if (!planetId) return;
    let cancelled = false;
    supabase
      .from('planets')
      .select(COLONY_DEPOSIT_COLUMNS)
      .eq('id', planetId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setDeposits(toColonyDeposits(data as DepositRow));
      });
    return () => {
      cancelled = true;
    };
  }, [planetId]);

  const price = Math.round((parseFloat(priceStr.replace(',', '.')) || 0) * 100) / 100;
  const minTung = minPrice?.min_tung ?? null;
  const belowMin = minTung !== null && price > 0 && price < minTung;
  const priceValid = price > 0 && price <= 1e12 && minTung !== null && price >= minTung;
  const fee = (price * feePercent) / 100;
  const receive = price - fee;

  const handleCreate = async () => {
    if (!selected || !priceValid || !confirmed) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('create_colony_listing', {
        p_planet_id: selected.id,
        p_price: price,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; message?: string };
      if (!result?.success) {
        onError(result?.error || 'No se pudo publicar la colonia');
        return;
      }
      setPlanetId('');
      setPriceStr('');
      setConfirmed(false);
      window.dispatchEvent(new Event(COLONY_LISTING_CHANGED_EVENT));
      onCreated(result.message || 'Colonia publicada en el mercado');
    } catch (err) {
      console.error('Error creating colony listing:', err);
      onError('No se pudo publicar la colonia');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-indigo-500/40 bg-gradient-to-br from-space-800/90 via-space-800/60 to-space-900/90 p-4 space-y-4">
      <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="relative flex items-center gap-2">
        <Globe className="w-5 h-5 text-indigo-300" />
        <h3 className="font-orbitron text-indigo-300">Vender colonia</h3>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-amber-400/50 bg-amber-500/15 text-amber-300 flex items-center gap-1">
          <Crown className="w-3 h-3" /> VIP
        </span>
      </div>

      {!isPlus ? (
        <div className="relative rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300 flex items-start gap-2">
          <Crown className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p>Solo los jugadores VIP pueden vender colonias en el mercado.</p>
            <button
              onClick={() => navigate('/game/vip')}
              className="mt-2 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold"
            >
              Ver VIP
            </button>
          </div>
        </div>
      ) : colonies.length === 0 ? (
        <p className="relative text-sm text-gray-400">No tienes colonias para vender (la ciudad principal no se puede vender).</p>
      ) : (
        <div className="relative space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Colonia</label>
            <select
              value={planetId}
              onChange={(e) => { setPlanetId(e.target.value); setConfirmed(false); }}
              className="w-full bg-space-700 border border-space-600 rounded-lg px-3 py-2 text-white focus:border-indigo-400 focus:outline-none"
            >
              <option value="" className="bg-space-800">Selecciona una colonia...</option>
              {colonies.map((p) => {
                const hasMoon = planets.some(
                  (m) => m.planet_type === 'moon' && m.galaxy === p.galaxy && m.solar_system === p.solar_system && m.position === p.position
                );
                return (
                  <option key={p.id} value={p.id} className="bg-space-800">
                    {p.name} [{p.galaxy}:{p.solar_system}:{p.position}]{hasMoon ? ' + Castra de Diana' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {selected && (
            <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-space-900/50 p-3">
              <img
                src={getPlanetImage(selected.temp_max, selected.image_id)}
                alt={selected.name}
                className="w-14 h-14 rounded-full object-cover"
              />
              <div className="min-w-0 text-sm">
                <p className="text-white font-orbitron truncate">{selected.name}</p>
                <p className="text-gray-400 text-xs">
                  [{selected.galaxy}:{selected.solar_system}:{selected.position}] · Campos {selected.fields_used}/{selected.fields_max}
                </p>
                {moon && (
                  <p className="text-indigo-300 text-xs flex items-center gap-1 mt-0.5">
                    <Moon className="w-3 h-3" /> Incluye Castra de Diana: {moon.name}
                  </p>
                )}
              </div>
            </div>
          )}

          {selected && deposits && <ColonyDepositsInfo deposits={deposits} />}

          <div>
            <label className="block text-sm text-gray-400 mb-2">Precio (TUNG)</label>
            <input
              type="text"
              inputMode="decimal"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder={minTung !== null ? `Minimo ${minTung}` : 'Ej: 5000'}
              className="w-full bg-space-700 border border-space-600 rounded-lg px-3 py-2 text-white font-orbitron focus:border-indigo-400 focus:outline-none"
            />
            {minPrice && (
              minTung !== null ? (
                <p className={`mt-1 text-xs ${belowMin ? 'text-red-400' : 'text-amber-300'}`}>
                  Precio minimo: {formatNumber(minTung)} TUNG (~{minPrice.min_usd} USD)
                  {belowMin && (
                    <button
                      type="button"
                      onClick={() => setPriceStr(String(minTung))}
                      className="ml-2 underline text-indigo-300 hover:text-indigo-200"
                    >
                      Usar minimo
                    </button>
                  )}
                </p>
              ) : (
                <p className="mt-1 text-xs text-red-400">Precio de TUNG no disponible en este momento. Intentalo mas tarde.</p>
              )
            )}
            {priceValid && (
              <div className="mt-2 text-xs space-y-1">
                <div className="flex justify-between text-gray-400">
                  <span>Fee ({feePercent}%)</span>
                  <span className="text-red-400">-{formatNumber(fee)} TUNG</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Recibiras</span>
                  <span className="text-green-400 font-semibold">{formatNumber(receive)} TUNG</span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300 space-y-1">
            <p className="flex items-center gap-1 font-semibold"><AlertCircle className="w-4 h-4" /> Importante</p>
            <p>Al venderse, el comprador recibe la colonia con sus edificios{moon ? ' y tambien su Castra de Diana' : ''}.</p>
            <p>Las tropas NO se incluyen en la venta: las tropas de la colonia{moon ? ' y de su Castra de Diana' : ''} se enviaran a tu ciudad principal.</p>
            <p>Los recursos almacenados tambien se envian a tu ciudad principal. El comprador la recibe con los recursos en 0 y empezara a recaudar segun el nivel de sus minas.</p>
            <p>Las defensas se destruyen al venderse la colonia.</p>
            <p>No puede tener construcciones, investigaciones ni barraca en curso, ni ejércitos tuyos en camino hacia la colonia, para publicarla o venderse.</p>
            <p>Los ejércitos que salieron de la colonia{moon ? ' o de su Castra de Diana' : ''} y sigan en marcha regresaran a tu ciudad principal cuando se venda.</p>
            <p>La oferta caduca a las 24h (72h si eres VIP) como el resto del mercado y puedes cancelarla en "Mis listados".</p>
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            Entiendo que perdere esta colonia{moon ? ' y su Castra de Diana' : ''} y sus defensas cuando se venda; mis tropas y recursos iran a mi ciudad principal.
          </label>

          <button
            onClick={handleCreate}
            disabled={disabled || submitting || !selected || !priceValid || !confirmed}
            className="w-full py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:brightness-110 disabled:bg-none disabled:bg-space-600 disabled:text-gray-500 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
            Publicar colonia
          </button>
        </div>
      )}
    </div>
  );
}
