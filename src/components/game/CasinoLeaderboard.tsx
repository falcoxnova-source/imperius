import { useCallback, useEffect, useState } from 'react';
import { Crown, Flame, Loader2, Medal, Trophy } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Game = 'roulette' | 'slots' | 'dice' | 'battleship';
type Period = 'day' | 'week' | 'all';
type Accent = 'fuchsia' | 'amber' | 'cyan' | 'emerald';

interface TopRow { rank: number; username: string; plays: number; wins: number; net: number; best: number; is_me: boolean }
interface BigRow { username: string; bet: number; payout: number; at: string; is_me: boolean }
interface MeRow { rank: number | null; plays: number; wins: number; net: number; best: number }
interface Board { success: boolean; error?: string; top: TopRow[]; big: BigRow[]; me: MeRow | null }

const PERIODS: [Period, string][] = [['day', 'Hoy'], ['week', 'Semana'], ['all', 'Total']];

const ACCENTS: Record<Accent, { border: string; title: string; tab: string; glow: string }> = {
  fuchsia: { border: 'border-fuchsia-500/30', title: 'text-fuchsia-200', tab: 'from-fuchsia-500 to-purple-700', glow: 'shadow-[0_0_30px_-10px_rgba(217,70,239,0.7)]' },
  amber: { border: 'border-amber-500/30', title: 'text-amber-200', tab: 'from-amber-400 to-orange-600', glow: 'shadow-[0_0_30px_-10px_rgba(251,191,36,0.7)]' },
  cyan: { border: 'border-cyan-500/30', title: 'text-cyan-200', tab: 'from-cyan-500 to-blue-700', glow: 'shadow-[0_0_30px_-10px_rgba(34,211,238,0.7)]' },
  emerald: { border: 'border-emerald-500/30', title: 'text-emerald-200', tab: 'from-emerald-500 to-emerald-700', glow: 'shadow-[0_0_30px_-10px_rgba(16,185,129,0.7)]' },
};

// Podio: orden visual 2 - 1 - 3
const PODIUM = [
  { idx: 1, h: 'h-20', ring: 'ring-slate-300/70', bg: 'from-slate-300/30 to-slate-600/10', text: 'text-slate-200', medal: '🥈', delay: '0.15s' },
  { idx: 0, h: 'h-28', ring: 'ring-amber-300', bg: 'from-amber-300/40 to-amber-700/10', text: 'text-amber-200', medal: '🥇', delay: '0s' },
  { idx: 2, h: 'h-14', ring: 'ring-orange-400/70', bg: 'from-orange-400/30 to-orange-800/10', text: 'text-orange-200', medal: '🥉', delay: '0.3s' },
];

const fmt = (v: number | null | undefined, d = 2) =>
  Number(v ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d });
const signed = (v: number) => `${v > 0 ? '+' : ''}${fmt(v)}`;

export function CasinoLeaderboard({ game, accent = 'fuchsia', refreshKey }: { game: Game; accent?: Accent; refreshKey?: unknown }) {
  const [period, setPeriod] = useState<Period>('week');
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [anim, setAnim] = useState(0);
  const a = ACCENTS[accent];
  const pvp = game === 'battleship';

  const load = useCallback(async (animate: boolean) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('casino_leaderboard', { p_game: game, p_period: period });
    setLoading(false);
    const r = data as Board | null;
    if (error || !r?.success) { setErr(r?.error || 'No se pudo cargar el ranking'); return; }
    setErr(null);
    setBoard(r);
    if (animate) setAnim((n) => n + 1);
  }, [game, period]);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    if (refreshKey === undefined) return;
    const t = setTimeout(() => load(false), 1500);
    return () => clearTimeout(t);
  }, [refreshKey, load]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(false); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const top = board?.top ?? [];
  const rest = top.slice(3);
  const me = board?.me;
  const score = (r: { wins: number; net: number }) => (pvp ? `${r.wins} ${r.wins === 1 ? 'victoria' : 'victorias'}` : `${signed(r.net)} TUNG`);

  return (
    <section className={`relative overflow-hidden rounded-3xl border ${a.border} bg-slate-950/85 p-4 ${a.glow}`}>
      <style>{`
        @keyframes lbRise { from { transform: translateY(40px) scale(.9); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes lbFloat { 0%,100% { transform: translateY(0) rotate(-6deg) } 50% { transform: translateY(-5px) rotate(6deg) } }
        @keyframes lbIn { from { transform: translateX(-14px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes lbShine { 0% { transform: translateX(-120%) } 60%,100% { transform: translateX(220%) } }
        @keyframes lbPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(251,191,36,.0) } 50% { box-shadow: 0 0 22px 2px rgba(251,191,36,.45) } }
        .lb-rise { animation: lbRise .6s cubic-bezier(.2,.9,.3,1.2) both }
        .lb-float { animation: lbFloat 2.6s ease-in-out infinite }
        .lb-in { animation: lbIn .4s ease-out both }
        .lb-shine { animation: lbShine 3.2s ease-in-out infinite }
        .lb-pulse { animation: lbPulse 2.4s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .lb-rise,.lb-float,.lb-in,.lb-shine,.lb-pulse { animation: none } }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`font-orbitron text-sm sm:text-base font-extrabold tracking-widest flex items-center gap-2 ${a.title}`}>
          <Trophy className="w-5 h-5 text-amber-300" /> {pvp ? 'RANKING DE CAPITANES' : 'RANKING DE GANADORES'}
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </h2>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-900 p-1">
          {PERIODS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPeriod(k)}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition ${period === k ? `bg-gradient-to-b ${a.tab} text-white` : 'text-slate-400 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {pvp ? 'Clasificación por victorias en Batalla de Naves (desempate: TUNG ganados).' : 'Clasificación por ganancia neta (premios − apostado). Solo entran jugadores en positivo.'}
      </p>

      {err && !board ? (
        <p className="mt-4 text-sm text-red-300">{err}</p>
      ) : !board ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <div key={anim} className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            {top.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 py-10 text-center">
                <div className="text-4xl">🏆</div>
                <p className="mt-2 text-sm font-bold text-white">¡El podio está libre!</p>
                <p className="text-xs text-slate-400">{pvp ? 'Gana una batalla y sé el primero del ranking.' : 'Consigue ganancias y ocupa el primer puesto.'}</p>
              </div>
            ) : (
              <>
                {/* Podio */}
                <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
                  {PODIUM.map((p) => {
                    const r = top[p.idx];
                    return (
                      <div key={p.idx} className="lb-rise flex min-w-0 flex-col items-center" style={{ animationDelay: p.delay }}>
                        {r ? (
                          <>
                            <div className="relative">
                              {p.idx === 0 && <Crown className="lb-float absolute -top-6 left-1/2 -ml-3 w-6 h-6 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" />}
                              <div className={`flex items-center justify-center rounded-full bg-gradient-to-br ${p.bg} ring-2 ${p.ring} ${p.idx === 0 ? 'w-16 h-16 text-3xl lb-pulse' : 'w-12 h-12 text-2xl'}`}>{p.medal}</div>
                            </div>
                            <p className={`mt-1 w-full truncate text-center text-xs sm:text-sm font-bold ${r.is_me ? 'text-emerald-300' : 'text-white'}`} title={r.username}>{r.username}</p>
                            <p className={`text-[11px] sm:text-xs font-bold ${p.text}`}>{score(r)}</p>
                            {pvp && <p className="text-[10px] text-slate-400">{signed(r.net)} TUNG</p>}
                          </>
                        ) : <div className="h-16" />}
                        <div className={`relative mt-2 w-full overflow-hidden rounded-t-xl bg-gradient-to-b ${p.bg} ring-1 ${p.ring} ${p.h} flex items-start justify-center pt-1`}>
                          <span className={`font-orbitron text-xl font-black ${p.text}`}>{p.idx + 1}</span>
                          <span className="lb-shine absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Resto */}
                {rest.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {rest.map((r, i) => (
                      <div key={r.rank} className={`lb-in flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${r.is_me ? 'bg-emerald-500/15 ring-1 ring-emerald-400/50' : 'bg-slate-900/70'}`}
                        style={{ animationDelay: `${0.35 + i * 0.07}s` }}>
                        <span className="w-6 font-orbitron font-bold text-slate-400">#{r.rank}</span>
                        <span className={`min-w-0 flex-1 truncate font-semibold ${r.is_me ? 'text-emerald-200' : 'text-slate-200'}`}>{r.username}</span>
                        <span className="hidden sm:inline text-slate-500">{r.plays} {pvp ? 'partidas' : 'jugadas'}</span>
                        <span className={`font-bold ${pvp ? 'text-cyan-200' : 'text-emerald-300'}`}>{score(r)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Mi posicion */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-slate-900 ring-1 ring-slate-700 px-3 py-2 text-xs">
              <Medal className="w-4 h-4 text-amber-300" />
              {me ? (
                <>
                  <span className="font-bold text-white">{me.rank ? `Tu puesto: #${me.rank}` : 'Aún sin puesto'}</span>
                  <span className="text-slate-400">{me.plays} {pvp ? 'partidas' : 'jugadas'} · {me.wins} {pvp ? 'victorias' : 'premios'}</span>
                  <span className={`ml-auto font-bold ${me.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{signed(me.net)} TUNG</span>
                </>
              ) : (
                <span className="text-slate-400">Aún no has jugado en este periodo. ¡Entra al ranking!</span>
              )}
            </div>
          </div>

          {/* Mayores premios */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-400" /> {pvp ? 'Mayores botes ganados' : 'Mayores premios'}</p>
            <div className="space-y-1">
              {(board.big ?? []).length === 0 && <p className="text-xs text-slate-500">Sin premios en este periodo</p>}
              {(board.big ?? []).map((b, i) => (
                <div key={`${b.at}-${i}`} className={`lb-in flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${b.is_me ? 'bg-emerald-500/15 ring-1 ring-emerald-400/50' : 'bg-slate-900/70'}`}
                  style={{ animationDelay: `${0.2 + i * 0.08}s` }}>
                  <span className="w-5 text-center">{i === 0 ? '🔥' : i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-200">{b.username}</span>
                  {b.bet > 0 && <span className="text-slate-500">x{fmt(b.payout / b.bet, 1)}</span>}
                  <span className="font-bold text-amber-300">+{fmt(b.payout)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
