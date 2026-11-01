import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, Ticket, Clock, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export interface RafflePrize {
  position: number;
  prize_type: string;
  quantity: number;
  label: string;
}

export interface ActiveRaffle {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  ticket_price: number;
  max_tickets_per_user: number;
  max_tickets_total: number;
  closes_at: string;
  total_tickets: number;
  participants: number;
  prizes: RafflePrize[];
  my_tickets: number[];
}

export interface RaffleWinnerRow {
  position: number;
  username: string;
  ticket_number: number;
  label: string;
}

export interface ActiveRaffleResponse {
  active: boolean;
  balance: number;
  raffle: ActiveRaffle | null;
  last_raffle: { title: string; drawn_at: string; winners: RaffleWinnerRow[] } | null;
}

export async function fetchActiveRaffle(): Promise<ActiveRaffleResponse | null> {
  const { data, error } = await supabase.rpc('get_active_raffle');
  if (error) return null;
  return data as ActiveRaffleResponse;
}

/** Cuenta atras formateada (Xd Xh Xm Xs). */
export function formatCountdown(target: string): string {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return 'Cerrando...';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

const STAR_COUNT = 18;

/**
 * Banner de la rifa activa para Vision General.
 * Se auto-oculta por completo si no hay ninguna rifa abierta,
 * asi que no ocupa espacio ni desplaza el resto de la pagina.
 */
export function RaffleBanner() {
  const navigate = useNavigate();
  const [raffle, setRaffle] = useState<ActiveRaffle | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetchActiveRaffle();
      if (!alive) return;
      setRaffle(res?.active && res.raffle ? res.raffle : null);
    };
    load();
    const interval = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!raffle) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [raffle]);

  const stars = useMemo(
    () =>
      Array.from({ length: STAR_COUNT }, (_, i) => ({
        id: i,
        left: `${(i * 37) % 100}%`,
        top: `${(i * 53) % 100}%`,
        delay: `${(i % 7) * 0.35}s`,
        size: i % 3 === 0 ? 2 : 1,
      })),
    []
  );

  if (!raffle) return null;

  const countdown = formatCountdown(raffle.closes_at);
  void now; // fuerza re-render del contador cada segundo

  return (
    <button
      onClick={() => navigate('/game/raffle')}
      className="group block relative w-full overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-950/60 via-orange-950/50 to-rose-950/60 hover:border-amber-400/70 transition-all duration-300 text-left shadow-lg shadow-amber-900/20 hover:shadow-amber-600/30"
    >
      {/* Estrellas animadas */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {stars.map((s) => (
          <span
            key={s.id}
            className="absolute rounded-full bg-amber-200/70 animate-pulse"
            style={{
              left: s.left,
              top: s.top,
              width: `${s.size}px`,
              height: `${s.size}px`,
              animationDelay: s.delay,
              animationDuration: '2.4s',
            }}
          />
        ))}
      </div>

      {/* Brillo superior */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
      {/* Barrido de luz al pasar el raton */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

      <div className="relative flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
        {/* Icono / imagen */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-xl bg-amber-400/30 blur-lg animate-pulse" style={{ animationDuration: '2s' }} />
          {raffle.image_url ? (
            <img
              src={raffle.image_url}
              alt={raffle.title}
              className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-amber-400/40"
            />
          ) : (
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center border border-amber-300/40">
              <Gift className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-400/40 text-[10px] font-bold text-red-300 uppercase tracking-wider animate-pulse">
              Rifa abierta
            </span>
            <span className="flex items-center gap-1 text-[11px] text-amber-200/80">
              <Clock className="w-3 h-3" />
              {countdown}
            </span>
          </div>

          <h3 className="font-orbitron text-base sm:text-lg text-white truncate mt-1 group-hover:text-amber-200 transition-colors">
            {raffle.title}
          </h3>

          <div className="flex items-center gap-3 flex-wrap mt-1">
            <span className="flex items-center gap-1 text-xs text-amber-300 font-semibold">
              <Ticket className="w-3.5 h-3.5" />
              {Number(raffle.ticket_price).toLocaleString()} TUNG / ticket
            </span>
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Users className="w-3 h-3" />
              {raffle.participants} participantes ·{' '}
              {raffle.max_tickets_total > 0
                ? `${raffle.total_tickets}/${raffle.max_tickets_total} tickets`
                : `${raffle.total_tickets} tickets`}
            </span>
            {raffle.my_tickets.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] text-emerald-300 font-semibold">
                Tienes {raffle.my_tickets.length}
              </span>
            )}
          </div>

          {/* Premios */}
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {raffle.prizes.slice(0, 3).map((p) => (
              <span
                key={p.position}
                className="px-2 py-0.5 rounded-md bg-white/5 border border-amber-500/20 text-[10px] text-amber-100/90 truncate max-w-[160px]"
              >
                #{p.position} {p.label}
              </span>
            ))}
            {raffle.prizes.length > 3 && (
              <span className="text-[10px] text-amber-400/70">+{raffle.prizes.length - 3} más</span>
            )}
          </div>
        </div>
      </div>

      <div className="relative px-3 sm:px-4 pb-1.5 flex items-center justify-between">
        <span className="text-[10px] text-amber-400/40 font-medium">
          {raffle.max_tickets_total > 0
            ? `Se sortea al vender ${raffle.max_tickets_total} tickets`
            : raffle.max_tickets_per_user > 0
              ? `Máx. ${raffle.max_tickets_per_user} tickets/jugador`
              : 'Tickets ilimitados'}
        </span>
        <span className="text-xs text-amber-300 font-semibold group-hover:text-amber-200 transition-colors flex items-center gap-1">
          Comprar ticket
          <span className="group-hover:translate-x-1 transition-transform">→</span>
        </span>
      </div>
    </button>
  );
}
