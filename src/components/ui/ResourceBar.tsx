import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { useOccupationStore, liveOccResources } from '../../store/occupationStore';
import { occViewSegment } from '../game/OccupiedPlanetView';
import { formatNumber, formatResourceRate } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';

export function ResourceBar() {
  const { resources: ownResources, currentPlanet } = useGameStore();
  const { profile } = useAuthStore();
  const { t } = useI18n();
  const location = useLocation();
  const { activeOccupationId, activeDetail, activeView, activeFetchedAt } = useOccupationStore();
  const occMode = !!(activeOccupationId && activeDetail && activeView && occViewSegment(location.pathname) !== null);
  const [occNow, setOccNow] = useState(Date.now());

  useEffect(() => {
    if (!occMode) return;
    const i = setInterval(() => setOccNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [occMode]);

  // [OCUPA3] Con un planeta ocupado seleccionado se muestran sus recursos
  let resources = ownResources;
  if (occMode && ownResources && activeDetail && activeView) {
    const live = liveOccResources(activeDetail, activeView, activeFetchedAt, occNow);
    resources = {
      ...ownResources,
      metal: live.metal,
      crystal: live.crystal,
      deuterium: live.deuterium,
      metal_per_hour: Number(activeDetail.resources.metal_per_hour) || 0,
      crystal_per_hour: Number(activeDetail.resources.crystal_per_hour) || 0,
      deuterium_per_hour: Number(activeDetail.resources.deuterium_per_hour) || 0,
      metal_storage: Number(activeView.storage.metal_storage) || 0,
      crystal_storage: Number(activeView.storage.crystal_storage) || 0,
      deuterium_storage: Number(activeView.storage.deuterium_storage) || 0,
      energy_max: Number(activeView.storage.energy_max) || 0,
      energy_used: Number(activeView.storage.energy_used) || 0,
    };
  }
  const displayPlanetId = occMode && activeDetail ? `occ:${activeDetail.occupation.planet_id}` : currentPlanet?.id ?? null;
  const [displayMetal, setDisplayMetal] = useState<number | null>(null);
  const [displayCrystal, setDisplayCrystal] = useState<number | null>(null);
  const [displayDeuterium, setDisplayDeuterium] = useState<number | null>(null);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const animationFrameRef = useRef<number>();
  const prevPlanetIdRef = useRef<string | null>(null);

  const fetchMarketPrices = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_market_resource_prices');
      if (!error && data) {
        const prices: Record<string, number> = {};
        for (const row of data as { resource_code: string; avg_price: number }[]) {
          prices[row.resource_code] = Number(row.avg_price);
        }
        setMarketPrices(prices);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchMarketPrices();
    const interval = setInterval(fetchMarketPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMarketPrices]);

  useEffect(() => {
    if (resources && displayPlanetId) {
      if (prevPlanetIdRef.current !== displayPlanetId) {
        setDisplayMetal(resources.metal);
        setDisplayCrystal(resources.crystal);
        setDisplayDeuterium(resources.deuterium);
        prevPlanetIdRef.current = displayPlanetId;
      }
    }
  }, [resources, displayPlanetId]);

  useEffect(() => {
    if (!resources || displayMetal === null) return;

    const animate = () => {
      setDisplayMetal((prev) => {
        if (prev === null) return resources.metal;
        const diff = resources.metal - prev;
        if (Math.abs(diff) < 0.1) return resources.metal;
        return prev + diff * 0.15;
      });
      setDisplayCrystal((prev) => {
        if (prev === null) return resources.crystal;
        const diff = resources.crystal - prev;
        if (Math.abs(diff) < 0.1) return resources.crystal;
        return prev + diff * 0.15;
      });
      setDisplayDeuterium((prev) => {
        if (prev === null) return resources.deuterium;
        const diff = resources.deuterium - prev;
        if (Math.abs(diff) < 0.1) return resources.deuterium;
        return prev + diff * 0.15;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [resources, displayMetal]);

  if (!resources || !currentPlanet || displayMetal === null) return null;

  const energyBalance = resources.energy_max - resources.energy_used;
  const energyEfficiency = resources.energy_used > 0
    ? Math.min(100, Math.round((resources.energy_max / resources.energy_used) * 100))
    : 100;
  const hasEnergyDeficit = energyBalance < 0;
  const energyPercent = resources.energy_max > 0
    ? (resources.energy_used / resources.energy_max) * 100
    : 0;

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 xl:flex xl:flex-nowrap xl:justify-start gap-1.5 xl:gap-0">
      <ResourceItem
        icon={
          <img
            src="/Imagenes/Recursos/Emblema%20de%20forja%20y%20miner%C3%ADa.webp"
            alt="Metal"
            className="w-6 h-6 sm:w-8 sm:h-8 object-cover rounded-full"
          />
        }
        name={t.resources.metal}
        value={displayMetal ?? 0}
        rate={resources.metal_per_hour}
        storage={resources.metal_storage}
        color="text-gray-400"
        isReduced={hasEnergyDeficit}
        marketPrice={marketPrices['metal']}
      />
      <ResourceItem
        icon={
          <img
            src="/Imagenes/Recursos/Emblema%20de%20cristales%20y%20laurel_11zon.webp"
            alt="Crystal"
            className="w-6 h-6 sm:w-8 sm:h-8 object-cover rounded-full"
          />
        }
        name={t.resources.crystal}
        value={displayCrystal ?? 0}
        rate={resources.crystal_per_hour}
        storage={resources.crystal_storage}
        color="text-cyan-400"
        isReduced={hasEnergyDeficit}
        marketPrice={marketPrices['crystal']}
      />
      <ResourceItem
        icon={
          <img
            src="/Imagenes/Recursos/Golden%20Harvest%20Laurel%20Medallion_11zon.webp"
            alt="Deuterium"
            className="w-6 h-6 sm:w-8 sm:h-8 object-cover rounded-full"
          />
        }
        name={t.resources.deuterium}
        value={displayDeuterium ?? 0}
        rate={resources.deuterium_per_hour}
        storage={resources.deuterium_storage}
        color="text-green-400"
        isReduced={hasEnergyDeficit}
        marketPrice={marketPrices['deuterium']}
      />
      <div
        className={`xn-res-card cursor-help xl:min-w-[150px] ${hasEnergyDeficit ? '!border-red-500/50' : ''}`}
        title={`⚡ Energía Planetaria\n━━━━━━━━━━━━━━━━━━\n☀ Producida: ${formatNumber(resources.energy_max)}\n⚙ Consumida: ${formatNumber(resources.energy_used)}\n${hasEnergyDeficit ? '⚠ Déficit' : '✓ Disponible'}: ${formatNumber(energyBalance)}${hasEnergyDeficit ? '\n\n⚠ ¡Producción de minas reducida al ' + energyEfficiency + '%!' : ''}`}
      >
        <div className="xn-res-icon !border-yellow-500/40">
          <img
            src="/Imagenes/Recursos/Golden%20Heartfire%20Brazier%20Emblem_11zon.webp"
            alt="Fervor"
            className={`w-5 h-5 sm:w-6 sm:h-6 object-cover rounded-full ${hasEnergyDeficit ? 'opacity-60' : ''}`}
          />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="hidden sm:block text-[10px] uppercase tracking-wider text-amber-200/60 leading-none mb-0.5">{t.resources.energy}</span>
          <span className={`font-serif font-bold text-xs sm:text-sm leading-tight truncate ${hasEnergyDeficit ? 'text-red-400' : 'text-amber-50'}`}>
            {formatNumber(energyBalance)}
            {hasEnergyDeficit && <span className="text-[10px] text-amber-400 ml-1">({energyEfficiency}%)</span>}
          </span>
          <span className="text-[8px] sm:text-[9px] text-amber-200/50 leading-none truncate">
            {formatNumber(resources.energy_max)}/{formatNumber(resources.energy_used)}
          </span>
          <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden mt-1">
            <div
              className={`h-full rounded-full transition-all duration-300 ${hasEnergyDeficit ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-yellow-400 to-orange-500'}`}
              style={{ width: `${Math.min(100, energyPercent)}%` }}
            />
          </div>
        </div>
      </div>
      <div
        className="xn-res-card xl:min-w-[130px] !border-orange-500/40"
        title="TUNG"
      >
        <div className="xn-res-icon !border-orange-500/40">
          <img
            src="/Imagenes/Logo%20de%20moneda/Logo%20de%20tung.webp"
            alt="TUNG"
            className="w-6 h-6 sm:w-8 sm:h-8 object-contain rounded-full"
          />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="hidden sm:block text-[10px] uppercase tracking-wider text-amber-200/60 leading-none mb-0.5">TUNG</span>
          <span className="font-serif font-bold text-xs sm:text-sm text-amber-400 truncate">
            {formatNumber(Number(profile?.tung_balance) || 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface ResourceItemProps {
  icon: React.ReactNode;
  name: string;
  value: number;
  rate: number;
  storage: number;
  color: string;
  isReduced?: boolean;
  marketPrice?: number;
}

function formatFxuPrice(price: number): string {
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(3);
  return price.toFixed(4);
}

function ResourceItem({ icon, name, value, rate, storage, color, isReduced, marketPrice }: ResourceItemProps) {
  const isOverCapacity = value > storage;
  const storagePercent = Math.min(100, (value / storage) * 100);

  const fxuValue = marketPrice != null && marketPrice > 0 ? Math.floor(value) * marketPrice : null;

  const getTooltip = () => {
    const priceInfo = marketPrice != null ? ` | Precio mercado: ${formatFxuPrice(marketPrice)} TUNG/u` : '';
    const valueInfo = fxuValue != null ? ` | Valor total: ~${formatNumber(Math.floor(fxuValue))} TUNG` : '';
    if (isOverCapacity) {
      return `${name}: ${formatNumber(Math.floor(value))} / ${formatNumber(storage)} - Almacen lleno!${priceInfo}${valueInfo}`;
    }
    if (isReduced) {
      return `${name} - Produccion reducida por falta de energia${priceInfo}${valueInfo}`;
    }
    return `${name}: ${formatNumber(Math.floor(value))} / ${formatNumber(storage)}${priceInfo}${valueInfo}`;
  };

  return (
    <div
      className={`xn-res-card xl:min-w-[150px] ${isOverCapacity ? '!border-red-500/60' : ''}`}
      title={getTooltip()}
    >
      <div className={`xn-res-icon ${isOverCapacity ? 'text-red-400 animate-pulse' : color}`}>{icon}</div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="hidden sm:block text-[10px] uppercase tracking-wider text-amber-200/60 leading-none mb-0.5 truncate">{name}</span>
        <span className={`font-serif font-bold text-xs sm:text-sm leading-tight truncate ${isOverCapacity ? 'text-red-400' : 'text-amber-50'}`}>
          {formatNumber(Math.floor(value))}
        </span>
        <div className="flex items-center gap-1 min-w-0">
          <span className={`text-[9px] sm:text-[10px] leading-none whitespace-nowrap ${isReduced ? 'text-amber-400' : isOverCapacity ? 'text-red-400' : 'text-emerald-400'}`}>
            {isOverCapacity ? '(LLENO)' : `+${formatResourceRate(rate)}`}
          </span>
          {marketPrice != null && marketPrice > 0 && (
            <span className="hidden 2xl:inline text-[9px] text-amber-300/70 font-mono whitespace-nowrap">
              {formatFxuPrice(marketPrice)} TUNG
            </span>
          )}
        </div>
        <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden mt-1">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isOverCapacity ? 'bg-red-500' : 'bg-gradient-to-r from-emerald-500 to-emerald-300'}`}
            style={{ width: `${storagePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
