import { useState, useEffect, useRef } from 'react';
import { Trophy, ChevronDown, ChevronUp, Rocket, Medal, Flame, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';

interface JackpotStats {
  balance: number;
  last_winner: string | null;
  last_won_amount: number;
  win_chance: number;
}

interface JackpotPools {
  expedition_balance: number;
  expedition_percent: number;
  monthly_balance: number;
  monthly_percent: number;
  plus_balance: number;
  plus_percent: number;
  destruction_balance: number;
  destruction_percent: number;
}

// Tasa de respaldo (peg legacy `fxu_usd_rate`) usada solo si el precio real de
// TUNG no esta disponible. El valor real viene de `get_live_tung_price_usd()`,
// la misma fuente que usan la wallet y el panel admin.
const FALLBACK_TUNG_TO_USDT_RATE = 0.0001;

function formatUsdtAmount(fxuAmount: number, rate: number): string {
  const usdt = fxuAmount * rate;
  if (usdt < 0.01) return `$${usdt.toFixed(4)}`;
  if (usdt < 1) return `$${usdt.toFixed(3)}`;
  return `$${usdt.toFixed(2)}`;
}

function getCountdownToMidnightUTC(): string {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const diff = midnight.getTime() - now.getTime();
  if (diff <= 0) return 'Distribuyendo...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

// El reparto del Pool Planeta del Tesoro corre via cron a las 00:05 UTC (5 min despues de medianoche)
function getCountdownToTreasurePoolDistribution(): string {
  const now = new Date();
  let target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 5, 0));
  if (target.getTime() <= now.getTime()) {
    target = new Date(target.getTime() + 24 * 3600000);
  }
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return 'Distribuyendo...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

// El reparto del Pool TOP 50 corre via cron a las 00:15 UTC (15 min despues de medianoche)
function getCountdownToTop50PoolDistribution(): string {
  const now = new Date();
  let target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 15, 0));
  if (target.getTime() <= now.getTime()) {
    target = new Date(target.getTime() + 24 * 3600000);
  }
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return 'Distribuyendo...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

export function JackpotDisplay() {
  const [stats, setStats] = useState<JackpotStats | null>(null);
  const [pools, setPools] = useState<JackpotPools | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [countdown, setCountdown] = useState(getCountdownToMidnightUTC());
  const [treasureCountdown, setTreasureCountdown] = useState(getCountdownToTreasurePoolDistribution());
  const [top50Countdown, setTop50Countdown] = useState(getCountdownToTop50PoolDistribution());
  const [capturedFortresses, setCapturedFortresses] = useState(0);
  const [tungRate, setTungRate] = useState<number>(FALLBACK_TUNG_TO_USDT_RATE);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  const formatUSDT = (fxuAmount: number) => formatUsdtAmount(fxuAmount, tungRate);

  // Suma de los 4 pools que se muestran en el panel.
  const totalPoolsTung = pools
    ? (pools.expedition_balance || 0) + (pools.monthly_balance || 0)
      + (pools.plus_balance || 0) + (pools.destruction_balance || 0)
    : 0;

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(getCountdownToMidnightUTC());
      setTreasureCountdown(getCountdownToTreasurePoolDistribution());
      setTop50Countdown(getCountdownToTop50PoolDistribution());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setExpanded(false);
      }
    };

    if (expanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expanded]);

  useEffect(() => {
    const fetchData = async () => {
      const [statsRes, poolsRes, fortRes, priceRes] = await Promise.all([
        supabase.rpc('get_jackpot_stats'),
        supabase.from('jackpot_pools').select('*').eq('id', 1).single(),
        supabase.from('alliance_fortresses').select('id', { count: 'exact' }).not('owner_alliance_id', 'is', null),
        supabase.rpc('get_live_tung_price_usd')
      ]);

      if (statsRes.data) setStats(statsRes.data as JackpotStats);
      if (poolsRes.data) setPools(poolsRes.data as JackpotPools);
      if (fortRes.count !== null) setCapturedFortresses(fortRes.count);
      const price = Number(priceRes.data);
      if (Number.isFinite(price) && price > 0) setTungRate(price);
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    
    // Escuchar evento de actualización de pools
    const handlePoolsUpdate = () => fetchData();
    window.addEventListener('jackpot-pools-updated', handlePoolsUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('jackpot-pools-updated', handlePoolsUpdate);
    };
  }, []);

  if (!stats || stats.balance < 100) return null;

  return (
    <div ref={containerRef} className="mx-2 mb-1 shrink-0 bg-gradient-to-br from-yellow-900/30 via-yellow-800/20 to-transparent border border-yellow-700/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-2 flex items-center justify-between hover:bg-yellow-900/20 transition-colors"
      >
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
            <span className="text-[10px] font-medium text-yellow-400 uppercase">{t.jackpot.title}</span>
          </div>
          <p className="text-base font-bold text-yellow-300 font-orbitron leading-tight text-left">
            JACKPOT
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-yellow-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-yellow-500" />
        )}
      </button>

      {expanded && pools && (
        <div className="px-2 pb-2 space-y-1.5 border-t border-yellow-700/30 pt-2 max-h-[55vh] overflow-y-auto overscroll-contain">
          {/* Total acumulado (suma de los 4 pools) */}
          <div className="flex items-center gap-2 p-1.5 bg-yellow-900/30 rounded border border-yellow-600/40">
            <Trophy className="w-3.5 h-3.5 text-yellow-300" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-yellow-300 truncate uppercase tracking-wide">Total acumulado</p>
              <p className="text-sm font-bold text-yellow-200 font-orbitron">
                {Math.floor(totalPoolsTung).toLocaleString()} <span className="text-[8px] text-yellow-400">TUNG</span>
              </p>
              <p className="text-[8px] text-yellow-500">{formatUSDT(totalPoolsTung)} USDT</p>
            </div>
          </div>

          {/* Expedición Pool */}
          <div className="flex items-center gap-2 p-1.5 bg-cyan-900/20 rounded border border-cyan-700/30">
            <Rocket className="w-3.5 h-3.5 text-cyan-400" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-cyan-400 truncate">{t.jackpot.expeditionPool} ({pools.expedition_percent}%)</p>
              <p className="text-xs font-bold text-cyan-300 font-orbitron">
                {Math.floor(pools.expedition_balance).toLocaleString()} <span className="text-[8px] text-cyan-500">TUNG</span>
              </p>
              <p className="text-[8px] text-cyan-600">{formatUSDT(pools.expedition_balance)} USDT</p>
            </div>
          </div>

          {/* Top mensual Pool */}
          <div className="flex items-center gap-2 p-1.5 bg-amber-900/20 rounded border border-amber-700/30">
            <Medal className="w-3.5 h-3.5 text-amber-400" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-amber-400 truncate">{t.jackpot.top50Pool} ({pools.monthly_percent}%)</p>
              <p className="text-xs font-bold text-amber-300 font-orbitron">
                {Math.floor(pools.monthly_balance).toLocaleString()} <span className="text-[8px] text-amber-500">TUNG</span>
              </p>
              <p className="text-[8px] text-amber-600">{formatUSDT(pools.monthly_balance)} USDT</p>
            </div>
          </div>
          {/* Top 100 Pool Countdown (reparto diario 00:15 UTC entre los 100 mejores del ranking) */}
          <div className="flex items-center gap-2 px-1.5 text-[9px]">
            <Clock className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="text-amber-300/80">Próximo reparto: <span className="text-amber-200 font-mono">{top50Countdown}</span></span>
          </div>

          {/* Fortress Pool */}
          <div className="flex items-center gap-2 p-1.5 bg-purple-900/20 rounded border border-purple-700/30">
            <Trophy className="w-3.5 h-3.5 text-purple-400" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-purple-400 truncate">{t.jackpot.fortressPool || 'Pool Fortaleza'} ({pools.plus_percent}%)</p>
              <p className="text-xs font-bold text-purple-300 font-orbitron">
                {Math.floor(pools.plus_balance).toLocaleString()} <span className="text-[8px] text-purple-500">TUNG</span>
              </p>
              <p className="text-[8px] text-purple-600">{formatUSDT(pools.plus_balance)} USDT</p>
            </div>
          </div>
          {/* Fortress Pool Countdown + Estimated Reward */}
          <div className="flex items-center gap-2 px-1.5 text-[9px]">
            <Clock className="w-3 h-3 text-purple-400 shrink-0" />
            <span className="text-purple-300/80">Próximo reparto: <span className="text-purple-200 font-mono">{countdown}</span></span>
          </div>
          <p className="text-[8px] text-purple-600/70 px-1.5">
            {capturedFortresses > 0
              ? `~${Math.floor(pools.plus_balance / capturedFortresses).toLocaleString()} TUNG (${formatUSDT(pools.plus_balance / capturedFortresses)}) por fortaleza (${capturedFortresses} capturada${capturedFortresses !== 1 ? 's' : ''})`
              : `No hay fortalezas capturadas aún`}
          </p>

          {/* Treasure Planet Pool (repurposed from former destruction pool, same DB column) */}
          <div className="flex items-center gap-2 p-1.5 bg-red-900/20 rounded border border-red-700/30">
            <Flame className="w-3.5 h-3.5 text-red-400" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-red-400 truncate">{t.jackpot.treasurePlanetPool} ({pools.destruction_percent || 0}%)</p>
              <p className="text-xs font-bold text-red-300 font-orbitron">
                {Math.floor(pools.destruction_balance || 0).toLocaleString()} <span className="text-[8px] text-red-500">TUNG</span>
              </p>
              <p className="text-[8px] text-red-600">{formatUSDT(pools.destruction_balance || 0)} USDT</p>
            </div>
          </div>
          {/* Treasure Planet Pool Countdown (reparto diario 00:05 UTC entre los miembros de la alianza duena) */}
          <div className="flex items-center gap-2 px-1.5 text-[9px]">
            <Clock className="w-3 h-3 text-red-400 shrink-0" />
            <span className="text-red-300/80">Próximo reparto: <span className="text-red-200 font-mono">{treasureCountdown}</span></span>
          </div>

          <p className="text-[8px] text-yellow-700 text-center pt-1">
            {stats.win_chance}% {t.jackpot.chanceInExpeditions}
          </p>
        </div>
      )}
    </div>
  );
}
