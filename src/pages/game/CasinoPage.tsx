import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Clock, Gift, MapPin, Sparkles, Ticket, Trophy, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CASINO_COORDS } from '../../lib/casino';
import { ActiveRaffleResponse, fetchActiveRaffle, formatCountdown } from '../../components/game/RaffleBanner';

const LOTTERY_IMG = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1775067036507-327d40aa0444bcab4ac5ca7406f0eb5e.png';

interface LotterySummary {
  enabled: boolean;
  active_draw: { draw_number: number; total_tickets: number; prize_pool: number; closes_at: string } | null;
  final_cost: number;
  user_ticket_count: number;
  past_draws?: { winning_numbers: number[] }[];
  prize_3match?: number;
  ticket_cost_usd?: number | null;
  tung_price_usd?: number | null;
}

// Mesas de Loteria y Rifa: solo lectura (mismas RPCs que sus paginas) y enlace a su UI normal.
// [CASINOGATE3] Abiertas a todos: no requieren Nave Insignia.
function CasinoSideGames() {
  const [lottery, setLottery] = useState<LotterySummary | null>(null);
  const [raffle, setRaffle] = useState<ActiveRaffleResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [l, r] = await Promise.all([
        supabase.rpc('get_lottery_info').then(({ data, error }) => (error ? null : (data as LotterySummary))),
        fetchActiveRaffle(),
      ]);
      if (!alive) return;
      setLottery(l);
      setRaffle(r);
      setLoaded(true);
    })();
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { alive = false; clearInterval(i); };
  }, []);

  const draw = lottery?.enabled ? lottery.active_draw : null;
  const lastNumbers = lottery?.past_draws?.[0]?.winning_numbers ?? [];
  const r = raffle?.active ? raffle.raffle : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Loteria */}
      <Link
        to="/game/lottery"
        className="group relative overflow-hidden rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-950/80 via-indigo-950/70 to-slate-950 p-5 hover:border-purple-400/80 transition-all shadow-lg shadow-purple-900/30 hover:shadow-purple-600/30"
      >
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <img src={LOTTERY_IMG} alt="Lotería" className="w-16 h-16 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.6)] group-hover:scale-110 transition-transform" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-orbitron text-lg font-bold text-white">LOTERÍA</h3>
              {draw ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-bold text-emerald-300 uppercase animate-pulse">Sorteo #{draw.draw_number} abierto</span>
              ) : loaded ? (
                <span className="px-2 py-0.5 rounded-full bg-slate-700/60 text-[10px] font-bold text-slate-300 uppercase">Sin sorteo activo</span>
              ) : null}
            </div>
            <p className="text-xs text-purple-200/70 mt-0.5">Elige 4 números del 1 al 30 y acierta para ganar el bote.</p>
          </div>
        </div>

        {draw && (
          <div className="relative mt-4 rounded-xl bg-black/30 border border-purple-500/30 p-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-purple-300 flex items-center justify-center gap-1"><Trophy className="w-3 h-3 text-amber-300" /> Bote acumulado</p>
            <p className="font-orbitron text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400">
              {Math.floor(draw.prize_pool).toLocaleString()} TUNG
            </p>
            {lottery?.tung_price_usd ? (
              <p className="text-[11px] text-emerald-300">≈ ${(draw.prize_pool * lottery.tung_price_usd).toFixed(2)} USD</p>
            ) : null}
          </div>
        )}

        <div className="relative mt-3 grid grid-cols-2 gap-2 text-[11px]">
          {draw && (
            <span className="flex items-center gap-1 text-purple-100/90"><Clock className="w-3.5 h-3.5 text-purple-300" /> {formatCountdown(draw.closes_at)}</span>
          )}
          {draw && (
            <span className="flex items-center gap-1 text-purple-100/90"><Users className="w-3.5 h-3.5 text-purple-300" /> {draw.total_tickets} tickets</span>
          )}
          {lottery?.enabled && (
            <span className="flex items-center gap-1 text-amber-300 font-semibold"><Ticket className="w-3.5 h-3.5" /> {lottery.final_cost} TUNG{lottery.ticket_cost_usd != null ? ` (~$${lottery.ticket_cost_usd})` : ''}</span>
          )}
          {!!lottery?.user_ticket_count && (
            <span className="text-emerald-300 font-semibold">Tienes {lottery.user_ticket_count} ticket(s)</span>
          )}
        </div>

        {lastNumbers.length > 0 && (
          <div className="relative mt-3 flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 mr-1">Último sorteo:</span>
            {lastNumbers.map((n) => (
              <span key={n} className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-black text-[11px] font-bold flex items-center justify-center shadow">{n}</span>
            ))}
          </div>
        )}

        <div className="relative mt-4 flex justify-end">
          <span className="flex items-center gap-1 text-sm font-bold text-purple-200 group-hover:text-white">Jugar Lotería <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span>
        </div>
      </Link>

      {/* Rifa */}
      <Link
        to="/game/raffle"
        className="group relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-950/70 via-orange-950/60 to-rose-950/70 p-5 hover:border-amber-400/80 transition-all shadow-lg shadow-amber-900/30 hover:shadow-amber-600/30"
      >
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
        <div className="relative flex items-start gap-4">
          {r?.image_url ? (
            <img src={r.image_url} alt={r.title} className="w-16 h-16 rounded-xl object-cover border border-amber-400/40 group-hover:scale-110 transition-transform" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center border border-amber-300/40 group-hover:scale-110 transition-transform">
              <Gift className="w-8 h-8 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-orbitron text-lg font-bold text-white">RIFA</h3>
              {r ? (
                <span className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-400/40 text-[10px] font-bold text-red-300 uppercase animate-pulse">Rifa abierta</span>
              ) : loaded ? (
                <span className="px-2 py-0.5 rounded-full bg-slate-700/60 text-[10px] font-bold text-slate-300 uppercase">Próxima rifa pronto</span>
              ) : null}
            </div>
            <p className="text-sm text-amber-100 font-semibold truncate mt-0.5">{r ? r.title : 'Compra tickets y gana premios exclusivos'}</p>
          </div>
        </div>

        {r && (
          <>
            <div className="relative mt-4 flex flex-wrap gap-1.5">
              {r.prizes.slice(0, 3).map((p) => (
                <span key={p.position} className="px-2 py-1 rounded-lg bg-black/30 border border-amber-500/30 text-[11px] text-amber-100 truncate max-w-[180px]">
                  {p.position === 1 ? '🥇' : p.position === 2 ? '🥈' : p.position === 3 ? '🥉' : `#${p.position}`} {p.label}
                </span>
              ))}
              {r.prizes.length > 3 && <span className="text-[11px] text-amber-400/80 self-center">+{r.prizes.length - 3} más</span>}
            </div>
            <div className="relative mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <span className="flex items-center gap-1 text-amber-100/90"><Clock className="w-3.5 h-3.5 text-amber-300" /> {formatCountdown(r.closes_at)}</span>
              <span className="flex items-center gap-1 text-amber-100/90"><Users className="w-3.5 h-3.5 text-amber-300" /> {r.participants} jugadores</span>
              <span className="flex items-center gap-1 text-amber-300 font-semibold"><Ticket className="w-3.5 h-3.5" /> {Number(r.ticket_price).toLocaleString()} TUNG</span>
              <span className="text-amber-100/90">{r.max_tickets_total > 0 ? `${r.total_tickets}/${r.max_tickets_total} tickets` : `${r.total_tickets} tickets`}</span>
              {r.my_tickets.length > 0 && <span className="text-emerald-300 font-semibold">Tienes {r.my_tickets.length} ticket(s)</span>}
            </div>
            {r.max_tickets_total > 0 && (
              <div className="relative mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${Math.min(100, (r.total_tickets / r.max_tickets_total) * 100)}%` }} />
              </div>
            )}
          </>
        )}

        {!r && raffle?.last_raffle && raffle.last_raffle.winners.length > 0 && (
          <div className="relative mt-4 text-[11px] text-amber-100/80">
            <p className="text-[10px] uppercase tracking-widest text-amber-400 mb-1">Ganadores de “{raffle.last_raffle.title}”</p>
            {raffle.last_raffle.winners.slice(0, 3).map((w) => (
              <p key={w.position} className="truncate">#{w.position} {w.username} — {w.label}</p>
            ))}
          </div>
        )}

        <div className="relative mt-4 flex justify-end">
          <span className="flex items-center gap-1 text-sm font-bold text-amber-200 group-hover:text-white">{r ? 'Comprar ticket' : 'Ver Rifa'} <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span>
        </div>
      </Link>
    </div>
  );
}

const GAMES = [
  { icon: '🎰', name: 'Tragamonedas', color: 'from-fuchsia-600/30 to-purple-900/40', ring: 'ring-fuchsia-500/40' },
  { icon: '🎲', name: 'Dados', color: 'from-amber-500/30 to-orange-900/40', ring: 'ring-amber-400/40' },
  { icon: '🃏', name: 'Cartas', color: 'from-emerald-500/30 to-emerald-900/40', ring: 'ring-emerald-400/40' },
  { icon: '🎡', name: 'Ruleta', color: 'from-rose-500/30 to-red-900/40', ring: 'ring-rose-400/40' },
];

const coordsLabel = `[${CASINO_COORDS.galaxy}:${CASINO_COORDS.system}:${CASINO_COORDS.position}]`;

// [CASINOGATE4] El Casino ya no requiere Nave Insignia: se entra desde el menu y se juega directamente.
export function CasinoPage() {
  const [rouletteAllowed, setRouletteAllowed] = useState(false);

  useEffect(() => {
    supabase.rpc('casino_roulette_status').then(({ data }) => {
      setRouletteAllowed(!!(data as { allowed?: boolean } | null)?.allowed);
    });
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Cabecera */}
      <div className="relative overflow-hidden rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-[#1a0526] via-[#0b0a1f] to-[#241002] shadow-lg shadow-fuchsia-900/30">
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="relative p-6 flex flex-col sm:flex-row items-center gap-5">
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-300 via-fuchsia-500 to-purple-700 p-[3px] shadow-xl shadow-fuchsia-500/40 animate-pulse" style={{ animationDuration: '3s' }}>
              <div className="w-full h-full rounded-full bg-[#120320] flex items-center justify-center text-5xl">🎰</div>
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-black shadow">{coordsLabel}</span>
          </div>
          <div className="text-center sm:text-left flex-1">
            <h1 className="font-orbitron text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-fuchsia-300 to-purple-300 tracking-wider">
              CASINO GALÁCTICO
            </h1>
            <p className="text-sm text-fuchsia-200/80 mt-1">El planeta en el corazón del universo. Apuesta tus TUNG en las mesas más brillantes de la galaxia.</p>
            <p className="text-xs text-slate-400 mt-2 flex items-center justify-center sm:justify-start gap-1">
              <MapPin className="w-3.5 h-3.5 text-amber-300" /> Galaxia {CASINO_COORDS.galaxy} · Sistema {CASINO_COORDS.system} · Posición {CASINO_COORDS.position}
            </p>
          </div>
        </div>
      </div>

      {/* Mesas de juego */}
      <div className="rounded-2xl border border-fuchsia-500/30 bg-slate-900/80 p-5">
        <h2 className="font-orbitron text-sm font-bold text-fuchsia-300 tracking-widest mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> MESAS DE JUEGO
        </h2>
        <div className="mb-4">
          <CasinoSideGames />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {GAMES.map((g) => ((g.name === 'Ruleta' && rouletteAllowed) || g.name === 'Tragamonedas' || g.name === 'Dados') ? (
            <Link key={g.name} to={g.name === 'Ruleta' ? '/game/roulette' : g.name === 'Dados' ? '/game/dice' : '/game/slots'} className={`relative rounded-xl p-4 bg-gradient-to-br ${g.color} ring-1 ${g.ring} text-center overflow-hidden hover:scale-[1.03] hover:ring-2 transition-transform`}>
              <div className="text-4xl mb-2">{g.icon}</div>
              <p className="text-sm font-bold text-white">{g.name}</p>
              <p className="text-[10px] uppercase tracking-widest text-emerald-300 mt-1">Jugar</p>
            </Link>
          ) : (
            <div key={g.name} className={`relative rounded-xl p-4 bg-gradient-to-br ${g.color} ring-1 ${g.ring} text-center overflow-hidden`}>
              <div className="text-4xl mb-2">{g.icon}</div>
              <p className="text-sm font-bold text-white">{g.name}</p>
              <p className="text-[10px] uppercase tracking-widest text-amber-300 mt-1">Próximamente</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
