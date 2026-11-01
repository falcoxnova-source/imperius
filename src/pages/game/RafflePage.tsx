import { useCallback, useEffect, useState } from 'react';
import { Gift, Ticket, Clock, Users, Trophy, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import {
  fetchActiveRaffle,
  formatCountdown,
  type ActiveRaffleResponse,
} from '../../components/game/RaffleBanner';

const PRIZE_ICON: Record<string, string> = {
  ship: '🚀',
  supply_box: '📦',
  blueprint: '📐',
  officer: '🎖️',
  vip: '👑',
  tung: '🪙',
  dark_matter: '🌑',
};

export function RafflePage() {
  const { fetchProfile } = useAuthStore();
  const [data, setData] = useState<ActiveRaffleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const res = await fetchActiveRaffle();
    setData(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const raffle = data?.active ? data.raffle : null;

  const handleBuy = async () => {
    if (!raffle || buying) return;
    setBuying(true);
    setMsg(null);
    const { data: res, error } = await supabase.rpc('buy_raffle_ticket', {
      p_raffle_id: raffle.id,
      p_quantity: qty,
    });
    setBuying(false);

    if (error) {
      setMsg({ type: 'err', text: error.message });
      return;
    }
    const r = res as { success: boolean; error?: string; tickets?: number[]; cost?: number; raffle_full?: boolean };
    if (!r?.success) {
      setMsg({ type: 'err', text: r?.error || 'No se pudo comprar el ticket' });
      return;
    }
    setMsg({
      type: 'ok',
      text: r.raffle_full
        ? `¡Listo! Tickets: ${(r.tickets || []).join(', ')} · Con tu compra se lleno el cupo: la rifa ya se sorteo.`
        : `¡Listo! Tickets: ${(r.tickets || []).join(', ')} · Coste ${Number(r.cost).toLocaleString()} TUNG`,
    });
    await Promise.all([load(), fetchProfile()]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  // Lo que queda del cupo global de la rifa (0 = sin cupo, no limita).
  const ticketsLeft = raffle && raffle.max_tickets_total > 0
    ? Math.max(0, raffle.max_tickets_total - raffle.total_tickets)
    : null;

  const maxAllowed = raffle
    ? Math.min(
        raffle.max_tickets_per_user > 0
          ? Math.max(0, raffle.max_tickets_per_user - raffle.my_tickets.length)
          : 100,
        ticketsLeft ?? 100,
      )
    : 0;
  const totalCost = raffle ? Number(raffle.ticket_price) * qty : 0;
  const balance = Number(data?.balance || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <Gift className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-orbitron text-xl sm:text-2xl text-white">Rifa Galáctica</h1>
          <p className="text-sm text-slate-400">Compra tickets y gana premios reales del juego</p>
        </div>
      </div>

      {!raffle && (
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-8 text-center">
          <Gift className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No hay ninguna rifa abierta en este momento.</p>
          <p className="text-slate-500 text-sm mt-1">Vuelve pronto, se anunciará en Visión General.</p>
        </div>
      )}

      {raffle && (
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-950/50 via-orange-950/40 to-rose-950/50 overflow-hidden">
          <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
          <div className="p-4 sm:p-6 space-y-5">
            <div className="flex items-start gap-4">
              {raffle.image_url ? (
                <img
                  src={raffle.image_url}
                  alt={raffle.title}
                  className="w-20 h-20 rounded-xl object-cover border border-amber-400/40 shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-9 h-9 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="font-orbitron text-lg sm:text-xl text-white">{raffle.title}</h2>
                {raffle.description && (
                  <p className="text-sm text-slate-300 mt-1 whitespace-pre-line">{raffle.description}</p>
                )}
                <div className="flex items-center gap-4 flex-wrap mt-2 text-xs">
                  <span className="flex items-center gap-1 text-amber-300 font-semibold">
                    <Clock className="w-3.5 h-3.5" /> Cierra en {formatCountdown(raffle.closes_at)}
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <Users className="w-3.5 h-3.5" /> {raffle.participants} participantes
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <Ticket className="w-3.5 h-3.5" />{' '}
                    {raffle.max_tickets_total > 0
                      ? `${raffle.total_tickets} / ${raffle.max_tickets_total} tickets vendidos`
                      : `${raffle.total_tickets} tickets vendidos`}
                  </span>
                </div>
                {raffle.max_tickets_total > 0 && (
                  <p className="text-[11px] text-amber-400/80 mt-1.5">
                    Esta rifa se sortea sola en cuanto se vendan los {raffle.max_tickets_total} tickets,
                    aunque todavía no haya llegado la fecha de cierre.
                  </p>
                )}
              </div>
            </div>

            {/* Premios */}
            <div>
              <h3 className="text-sm font-semibold text-amber-200 mb-2">Premios</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {raffle.prizes.map((p) => (
                  <div
                    key={p.position}
                    className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-black/20 px-3 py-2"
                  >
                    <span className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-base shrink-0">
                      {PRIZE_ICON[p.prize_type] || '🎁'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-amber-400/70">
                        Premio #{p.position}
                      </p>
                      <p className="text-sm text-white truncate">{p.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Compra */}
            <div className="rounded-lg border border-white/10 bg-black/30 p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Precio por ticket</span>
                <span className="text-amber-300 font-semibold">
                  {Number(raffle.ticket_price).toLocaleString()} TUNG
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Tu saldo</span>
                <span className="text-white font-semibold">{balance.toLocaleString()} TUNG</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQty((v) => Math.max(1, v - 1))}
                  className="w-9 h-9 rounded-lg border border-white/10 text-white hover:bg-white/5"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, maxAllowed)}
                  value={qty}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setQty(Number.isFinite(v) ? Math.min(Math.max(1, v), Math.max(1, maxAllowed)) : 1);
                  }}
                  className="flex-1 h-9 rounded-lg bg-slate-900 border border-white/10 text-center text-white"
                />
                <button
                  onClick={() => setQty((v) => Math.min(Math.max(1, maxAllowed), v + 1))}
                  className="w-9 h-9 rounded-lg border border-white/10 text-white hover:bg-white/5"
                >
                  +
                </button>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Total</span>
                <span className={`font-bold ${totalCost > balance ? 'text-red-400' : 'text-amber-300'}`}>
                  {totalCost.toLocaleString()} TUNG
                </span>
              </div>

              <button
                onClick={handleBuy}
                disabled={buying || maxAllowed <= 0 || totalCost > balance}
                className="w-full py-3 rounded-lg font-bold bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />}
                {maxAllowed <= 0
                  ? ticketsLeft === 0
                    ? 'Rifa completa'
                    : 'Has alcanzado el límite de tickets'
                  : `Comprar ${qty} ticket(s)`}
              </button>

              {raffle.max_tickets_per_user > 0 && (
                <p className="text-[11px] text-slate-500 text-center">
                  Máximo {raffle.max_tickets_per_user} tickets por jugador (no es el tope de la rifa).
                  Tienes {raffle.my_tickets.length}.
                </p>
              )}

              {ticketsLeft !== null && (
                <p className="text-[11px] text-slate-500 text-center">
                  Quedan {ticketsLeft} ticket(s) para completar la rifa.
                </p>
              )}

              {msg && (
                <div
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                    msg.type === 'ok'
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border border-red-500/30 text-red-300'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{msg.text}</span>
                </div>
              )}
            </div>

            {/* Mis tickets */}
            {raffle.my_tickets.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-emerald-300 mb-2">
                  Mis números ({raffle.my_tickets.length})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {raffle.my_tickets.map((n) => (
                    <span
                      key={n}
                      className="px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-xs font-mono text-emerald-200"
                    >
                      #{n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ultima rifa sorteada */}
      {data?.last_raffle && data.last_raffle.winners.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-yellow-300 mb-3">
            <Trophy className="w-4 h-4" /> Ganadores de: {data.last_raffle.title}
          </h3>
          <div className="space-y-2">
            {data.last_raffle.winners.map((w) => (
              <div
                key={w.position}
                className="flex items-center justify-between gap-3 rounded-lg bg-black/30 border border-white/5 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-400/30 text-[11px] font-bold text-yellow-300 flex items-center justify-center shrink-0">
                    {w.position}
                  </span>
                  <span className="text-white text-sm truncate">{w.username}</span>
                  <span className="text-[11px] text-slate-500 font-mono">#{w.ticket_number}</span>
                </div>
                <span className="text-xs text-amber-300 truncate">{w.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
