import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CalendarClock, Crown, Loader2, Plus, Swords, Trophy, Users, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Tipos (respuesta de battleship_tournaments / battleship_tournament_detail) ───
type TStatus = 'open' | 'running' | 'finished' | 'cancelled';
interface Rules { official_fee_pct: number; player_fee_pct: number; creator_pct: number; min_fee: number; max_fee: number; sizes: number[]; min_players: number }
interface Tour {
  id: string; name: string; description: string | null; is_official: boolean; creator: string | null; mine: boolean | null;
  entry_fee: number; seed_prize: number; fee_pct: number; company_pct: number; creator_pct: number; prize_split: number[];
  max_players: number; min_players: number; players: number; starts_at: string; status: TStatus;
  current_round: number; rounds: number | null; round_name: string | null;
  pool_full: number; prizes_full: number[]; pool: number; prizes: number[];
  registered: boolean; alive: boolean; can_cancel: boolean; podium: (string | null)[] | null;
  cancel_reason: string | null; started_at: string | null; finished_at: string | null;
}
interface TList {
  enabled: boolean; is_admin: boolean; balance: number; gate_error: string | null; rules: Rules;
  can_create: boolean; live_match: string | null; tournaments: Tour[];
}
interface TGame {
  round: number; slot: number; kind: 'main' | 'third'; status: 'live' | 'done' | 'bye';
  p1: string | null; p2: string | null; winner: 1 | 2 | null; p1_hits: number | null; p2_hits: number | null;
  phase: string | null; end_reason: string | null; me: boolean; match_id: string | null;
}
interface TDetail { tournament: Tour; entrants: { username: string | null; rank: number | null; prize: number; me: boolean }[]; games: TGame[] }
type Res<T> = T & { success?: boolean; error?: string };

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<Res<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { success: false, error: 'Error de conexión, inténtalo de nuevo' } as Res<T>;
  return (data ?? { success: false, error: 'Sin respuesta' }) as Res<T>;
}

const fmt = (v: number | null | undefined, d = 2) =>
  Number(v ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d });
const MEDAL = ['🥇', '🥈', '🥉'];
const SPLITS: number[][] = [[50, 30, 20], [60, 25, 15], [70, 20, 10]];
const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function countdown(ms: number) {
  if (ms <= 0) return 'empezando…';
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
function roundName(r: number, rounds: number, kind: 'main' | 'third' = 'main') {
  if (kind === 'third') return 'Duelo por el 3er puesto';
  if (r === rounds) return 'Gran Final';
  if (r === rounds - 1) return 'Semifinal';
  if (r === rounds - 2) return 'Cuartos de final';
  if (r === rounds - 3) return 'Octavos de final';
  return `Ronda ${r}`;
}
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Vista previa: misma fórmula que _bst_prizes en el servidor
function previewPrizes(fee: number, n: number, compPct: number, crePct: number, split: number[], seed = 0) {
  const comp = Math.round(fee * compPct) / 100, cre = Math.round(fee * crePct) / 100;
  const pool = Math.round(((fee - comp - cre) * n + seed) * 100) / 100;
  const p2 = Math.floor(pool * split[1]) / 100, p3 = Math.floor(pool * split[2]) / 100;
  return { total: fee * n, comp: comp * n, cre: cre * n, pool, prizes: [Math.round((pool - p2 - p3) * 100) / 100, p2, p3] };
}

const STATUS_UI: Record<TStatus, { label: string; cls: string }> = {
  running: { label: 'EN JUEGO', cls: 'bg-rose-500/20 border-rose-400/60 text-rose-200 animate-pulse' },
  open: { label: 'INSCRIPCIÓN ABIERTA', cls: 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200' },
  finished: { label: 'FINALIZADO', cls: 'bg-amber-500/15 border-amber-400/50 text-amber-200' },
  cancelled: { label: 'CANCELADO', cls: 'bg-slate-700/50 border-slate-500/50 text-slate-300' },
};

const STYLE = (
  <style>{`
    @keyframes bst-shine { 0% { transform: translateX(-120%) skewX(-20deg) } 60%, 100% { transform: translateX(260%) skewX(-20deg) } }
    .bst-shine::after { content: ''; position: absolute; top: 0; bottom: 0; width: 35%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent); animation: bst-shine 4.5s ease-in-out infinite; pointer-events: none; }
    @keyframes bst-glow { 0%, 100% { filter: drop-shadow(0 0 6px rgba(251,191,36,0.55)) } 50% { filter: drop-shadow(0 0 18px rgba(251,191,36,0.95)) } }
    .bst-glow { animation: bst-glow 2.4s ease-in-out infinite; }
    @keyframes bst-fall { 0% { transform: translateY(-10%) rotate(0deg); opacity: 0 } 10% { opacity: 1 } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0.2 } }
    @keyframes bst-pop { 0% { transform: scale(0.6); opacity: 0 } 70% { transform: scale(1.06); opacity: 1 } 100% { transform: scale(1) } }
    .bst-pop { animation: bst-pop 0.5s ease-out both; }
    @keyframes bst-rise { from { transform: scaleY(0) } to { transform: scaleY(1) } }
    @keyframes bst-live { 0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.55) } 50% { box-shadow: 0 0 0 6px rgba(244,63,94,0) } }
    .bst-live { animation: bst-live 1.6s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) { .bst-shine::after, .bst-glow, .bst-pop, .bst-live { animation: none !important; } }
  `}</style>
);

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    i, l: Math.random() * 100, d: 2.6 + Math.random() * 2.6, delay: Math.random() * 2.5,
    c: ['#fbbf24', '#f472b6', '#38bdf8', '#a78bfa', '#34d399', '#fde68a'][i % 6], w: 5 + Math.random() * 6,
  })), []);
  if (REDUCED) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b) => (
        <span key={b.i} className="absolute top-0 rounded-sm" style={{ left: `${b.l}%`, width: b.w, height: b.w * 0.45, background: b.c, animation: `bst-fall ${b.d}s linear ${b.delay}s infinite` }} />
      ))}
    </div>
  );
}

function Podium({ names, prizes }: { names: (string | null)[]; prizes: number[] }) {
  const order = [1, 0, 2];
  const h = ['h-24', 'h-16', 'h-12'];
  const tone = [
    'from-amber-300 via-yellow-400 to-amber-600 text-amber-950',
    'from-slate-200 via-slate-300 to-slate-500 text-slate-900',
    'from-orange-300 via-amber-600 to-orange-800 text-orange-950',
  ];
  return (
    <div className="flex items-end justify-center gap-2 sm:gap-3 pt-2">
      {order.map((i) => (
        <div key={i} className="flex flex-col items-center w-24 sm:w-28 min-w-0 bst-pop" style={{ animationDelay: `${0.15 * (2 - i)}s` }}>
          <span className={`text-2xl sm:text-3xl ${i === 0 ? 'bst-glow' : ''}`}>{i === 0 ? '👑' : MEDAL[i]}</span>
          <p className={`text-xs sm:text-sm font-semibold truncate max-w-full ${i === 0 ? 'text-amber-200' : 'text-slate-200'}`}>{names[i] ?? '—'}</p>
          <p className="text-[11px] text-emerald-300">+{fmt(prizes[i])} TUNG</p>
          <div className={`w-full ${h[i]} mt-1 rounded-t-lg bg-gradient-to-b ${tone[i]} flex items-start justify-center pt-1 font-orbitron font-bold text-lg shadow-lg origin-bottom`}
            style={{ animation: REDUCED ? undefined : `bst-rise 0.7s ease-out ${0.15 * (2 - i)}s both` }}>
            {i + 1}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrizeRow({ prizes, dim }: { prizes: number[]; dim?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {prizes.slice(0, 3).map((p, i) => (
        <div key={i} className={`rounded-lg border px-1.5 py-1.5 text-center ${i === 0 ? 'border-amber-400/50 bg-amber-500/10' : i === 1 ? 'border-slate-400/40 bg-slate-500/10' : 'border-orange-500/40 bg-orange-500/10'} ${dim ? 'opacity-70' : ''}`}>
          <p className="text-base leading-none">{MEDAL[i]}</p>
          <p className="font-orbitron text-[12px] text-white mt-1 truncate">{fmt(p)}</p>
          <p className="text-[9px] text-slate-400">TUNG</p>
        </div>
      ))}
    </div>
  );
}

// ─── Cuadro (bracket) ────────────────────────────────
function GameCard({ g, onPlay }: { g: TGame | null; onPlay: (id: string) => void }) {
  if (!g) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700/70 bg-slate-900/40 px-2 py-2 text-[11px] text-slate-500 space-y-1">
        <p>Por definir</p><p>Por definir</p>
      </div>
    );
  }
  const live = g.status === 'live';
  const row = (name: string | null, side: 1 | 2, hits: number | null) => {
    const win = g.winner === side, lose = g.winner !== null && g.winner !== side;
    return (
      <div className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${win ? 'bg-amber-500/15 text-amber-100' : lose ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
        <span className="truncate text-xs">{win && '👑 '}{name ?? (g.status === 'bye' ? 'pase directo' : '—')}</span>
        {hits !== null && g.status !== 'bye' && <span className="shrink-0 text-[10px] font-mono text-slate-400">{hits}</span>}
      </div>
    );
  };
  return (
    <div className={`rounded-lg border bg-slate-950/80 p-1 space-y-0.5 ${live ? 'border-rose-400/60 bst-live' : g.me ? 'border-sky-400/50' : 'border-slate-700/70'}`}>
      {row(g.p1, 1, g.p1_hits)}
      {row(g.p2, 2, g.p2_hits)}
      {live && (
        <div className="flex items-center justify-between gap-1 px-1 pt-0.5">
          <span className="text-[9px] font-orbitron text-rose-300">● EN VIVO{g.phase === 'placing' ? ' · desplegando' : ''}</span>
          {g.me && g.match_id && (
            <button type="button" onClick={() => onPlay(g.match_id!)} className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold">Jugar</button>
          )}
        </div>
      )}
    </div>
  );
}

function DetailModal({ id, onClose, onPlay }: { id: string; onClose: () => void; onPlay: (id: string) => void }) {
  const [d, setD] = useState<TDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await rpc<TDetail>('battleship_tournament_detail', { p_id: id });
    if (r.success === false) setErr(r.error || 'No se pudo cargar el torneo'); else { setD(r); setErr(null); }
  }, [id]);
  useEffect(() => {
    load();
    const i = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 6000);
    return () => clearInterval(i);
  }, [load]);

  const t = d?.tournament;
  const rounds = t?.rounds ?? 0;
  const size = rounds ? 2 ** rounds : 0;
  const third = d?.games.find((g) => g.kind === 'third') ?? null;
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4" onClick={onClose}>
      <div className="relative w-full max-w-5xl max-h-full overflow-y-auto rounded-2xl border-2 border-amber-400/40 bg-gradient-to-b from-slate-950 via-indigo-950/70 to-slate-950 p-4 sm:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        {t?.status === 'finished' && <Confetti />}
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300" title="Cerrar"><X className="w-4 h-4" /></button>
        {!d ? (
          <div className="py-16 text-center">{err ? <p className="text-red-300 text-sm">{err}</p> : <Loader2 className="w-8 h-8 animate-spin text-amber-300 mx-auto" />}</div>
        ) : t && (
          <div className="relative space-y-5">
            <div className="text-center space-y-1 pr-8">
              <p className="font-orbitron text-xl sm:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 break-words">🏆 {t.name}</p>
              <p className="text-xs text-slate-400">
                {t.is_official ? 'Torneo oficial' : `Organiza ${t.creator ?? '—'}`} · Inscripción {fmt(t.entry_fee)} TUNG · {t.players} jugadores · Bolsa <b className="text-amber-200">{fmt(t.pool)} TUNG</b>
              </p>
              {t.status === 'running' && t.round_name && <p className="text-sm text-rose-300 font-orbitron">● {t.round_name} en juego</p>}
              {t.status === 'cancelled' && <p className="text-sm text-slate-300">Cancelado: {t.cancel_reason ?? '—'} · todas las inscripciones fueron reembolsadas</p>}
            </div>

            {t.status === 'finished' && t.podium && <Podium names={t.podium} prizes={t.prizes} />}

            {rounds > 0 && (
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-3 min-w-max">
                  {Array.from({ length: rounds }, (_, k) => k + 1).map((r) => {
                    const slots = size >> r;
                    const games = d.games.filter((g) => g.round === r && g.kind === 'main');
                    return (
                      <div key={r} className="w-44 sm:w-48 flex flex-col">
                        <p className={`text-center text-[11px] font-orbitron mb-2 ${r === rounds ? 'text-amber-300' : 'text-sky-300'}`}>{roundName(r, rounds)}</p>
                        <div className="flex-1 flex flex-col justify-around gap-2">
                          {Array.from({ length: slots }, (_, s) => (
                            <GameCard key={s} g={games.find((g) => g.slot === s) ?? null} onPlay={onPlay} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {rounds >= 2 && (
                    <div className="w-44 sm:w-48 flex flex-col justify-center">
                      <p className="text-center text-[11px] font-orbitron mb-2 text-orange-300">🥉 3er puesto</p>
                      <GameCard g={third} onPlay={onPlay} />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3">
              <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" />Inscritos ({d.entrants.length})</p>
              {d.entrants.length === 0 ? <p className="text-xs text-slate-500">Aún nadie. ¡Sé el primero!</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {d.entrants.map((e, i) => (
                    <span key={i} className={`px-2 py-1 rounded-lg border text-xs ${e.me ? 'border-sky-400/60 bg-sky-500/10 text-sky-100' : 'border-slate-700 bg-slate-800/60 text-slate-200'}`}>
                      {e.rank && e.rank <= 3 ? `${MEDAL[e.rank - 1]} ` : ''}{e.username ?? '—'}{e.prize > 0 ? <span className="text-emerald-300"> +{fmt(e.prize)}</span> : null}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Crear torneo ────────────────────────────────────
function CreateModal({ data, onClose, onCreated }: { data: TList; onClose: () => void; onCreated: (msg: string) => void }) {
  const admin = data.is_admin;
  const compPct = data.rules.official_fee_pct;
  const crePct = admin ? 0 : data.rules.creator_pct;
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [fee, setFee] = useState('10');
  const [seed, setSeed] = useState('0');
  const [size, setSize] = useState(8);
  const [split, setSplit] = useState<number[]>(SPLITS[0]);
  const [start, setStart] = useState(() => toLocalInput(new Date(Date.now() + 30 * 60000)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const feeNum = Number(fee.replace(',', '.'));
  const feeOk = /^\d+([.,]\d{1,2})?$/.test(fee.trim()) && feeNum >= data.rules.min_fee && feeNum <= data.rules.max_fee;
  const startDate = new Date(start);
  const startOk = !Number.isNaN(startDate.getTime()) && startDate.getTime() >= Date.now() + 5 * 60000 && startDate.getTime() <= Date.now() + 30 * 86400000;
  const nameOk = name.trim().length >= 3 && name.trim().length <= 40;
  const seedNum = seed.trim() === '' ? 0 : Number(seed.replace(',', '.'));
  const seedFmtOk = seed.trim() === '' || /^\d+([.,]\d{1,2})?$/.test(seed.trim());
  const seedOk = seedFmtOk && seedNum >= 0 && seedNum <= data.balance;
  const pv = feeOk && seedOk ? previewPrizes(feeNum, size, compPct, crePct, split, seedNum) : null;
  const pvMin = feeOk && seedOk ? previewPrizes(feeNum, data.rules.min_players, compPct, crePct, split, seedNum) : null;
  const seedPresets = [0, 100, 500, 1000];
  const presets: [string, number][] = [['+15 min', 15], ['+1 h', 60], ['+3 h', 180], ['+24 h', 1440]];

  const submit = async () => {
    if (!feeOk || !startOk || !nameOk || !seedOk || busy) return;
    const seedTxt = seedNum > 0 ? `\n🎁 Premio inicial: ${fmt(seedNum)} TUNG (se descuenta ahora de tu saldo; si el torneo se cancela, se te devuelve).` : '';
    if (!window.confirm(`¿Crear el torneo «${name.trim()}»?\nInscripción ${fmt(feeNum)} TUNG · ${size} plazas · empieza ${startDate.toLocaleString('es-ES')}.${seedTxt}\nSe anunciará a todos los jugadores y en Telegram.`)) return;
    setBusy(true);
    const r = await rpc<{ id: string }>('battleship_tournament_create', {
      p_name: name.trim(), p_entry_fee: feeNum, p_max_players: size, p_starts_at: startDate.toISOString(),
      p_prize_split: split, p_description: desc.trim() || null, p_seed_prize: seedNum,
    });
    setBusy(false);
    if (!r.success) { setErr(r.error || 'No se pudo crear el torneo'); return; }
    onCreated('¡Torneo creado y anunciado!');
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-full overflow-y-auto rounded-2xl border-2 border-amber-400/40 bg-gradient-to-b from-slate-950 via-indigo-950/60 to-slate-950 p-4 sm:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300" title="Cerrar"><X className="w-4 h-4" /></button>
        <div className="pr-8">
          <p className="font-orbitron text-lg text-amber-200 flex items-center gap-2"><Trophy className="w-5 h-5 bst-glow text-amber-300" />{admin ? 'Nuevo torneo oficial' : 'Organiza tu torneo'}</p>
          <p className="text-xs text-slate-400">{admin ? `Comisión ${compPct}% para la plataforma.` : `Comisión ${compPct + crePct}%: ${compPct}% plataforma + ${crePct}% para ti como organizador.`}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400">Nombre del torneo</label>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Copa de la Galaxia"
              className={`mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border outline-none text-white ${name && !nameOk ? 'border-red-500/60' : 'border-slate-700 focus:border-amber-400'}`} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Descripción (opcional)</label>
            <input value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} placeholder="Solo para los mejores comandantes"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-amber-400 outline-none text-white text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400">Inscripción (TUNG)</label>
              <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal"
                className={`mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border outline-none text-white font-orbitron ${fee && !feeOk ? 'border-red-500/60' : 'border-slate-700 focus:border-amber-400'}`} />
              <p className="text-[10px] text-slate-500 mt-0.5">mín {fmt(data.rules.min_fee)} · máx {fmt(data.rules.max_fee, 0)}</p>
            </div>
            <div>
              <label className="text-xs text-slate-400">Inicio</label>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                className={`mt-1 w-full px-2 py-2 rounded-lg bg-slate-950 border outline-none text-white text-sm ${!startOk ? 'border-red-500/60' : 'border-slate-700 focus:border-amber-400'}`} />
              <div className="flex flex-wrap gap-1 mt-1">
                {presets.map(([l, m]) => (
                  <button key={l} type="button" onClick={() => setStart(toLocalInput(new Date(Date.now() + m * 60000)))} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300">{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400">Plazas</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {data.rules.sizes.map((s) => (
                <button key={s} type="button" onClick={() => setSize(s)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-orbitron ${size === s ? 'border-amber-400 bg-amber-500/20 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.35)]' : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500'}`}>{s}</button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Mínimo {data.rules.min_players} inscritos para arrancar; si no se llega, se devuelve todo.</p>
          </div>
          <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-950/15 p-3">
            <label className="text-xs text-fuchsia-200 flex items-center gap-1.5">🎁 Premio inicial (opcional)</label>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <input value={seed} onChange={(e) => setSeed(e.target.value)} inputMode="decimal"
                className={`w-28 px-3 py-1.5 rounded-lg bg-slate-950 border outline-none text-white font-orbitron text-sm ${!seedOk ? 'border-red-500/60' : 'border-slate-700 focus:border-fuchsia-400'}`} />
              {seedPresets.map((s) => (
                <button key={s} type="button" disabled={s > data.balance} onClick={() => setSeed(String(s))}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-orbitron disabled:opacity-30 ${seedNum === s && seedFmtOk ? 'border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-100' : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500'}`}>
                  {s === 0 ? 'Sin premio' : `+${fmt(s, 0)}`}
                </button>
              ))}
            </div>
            <p className={`text-[10px] mt-1 ${seedOk ? 'text-slate-500' : 'text-red-300'}`}>
              {!seedFmtOk ? 'Cantidad inválida (máximo 2 decimales).' : seedNum > data.balance ? `Saldo insuficiente (tienes ${fmt(data.balance)} TUNG).`
                : 'Sale de tu saldo y va íntegro a la bolsa, sin comisión. La bolsa crece con cada inscrito. Si se cancela, se te devuelve.'}
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-400">Reparto de premios</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {SPLITS.map((s) => (
                <button key={s.join('-')} type="button" onClick={() => setSplit(s)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs ${split.join() === s.join() ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500'}`}>
                  🥇{s[0]}% · 🥈{s[1]}% · 🥉{s[2]}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {pv && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3 space-y-2">
            <p className="text-xs text-slate-300">Si se llenan las {size} plazas:</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="text-slate-400">Recaudado</span><span className="text-right text-white">{fmt(pv.total)} TUNG</span>
              <span className="text-slate-400">Plataforma ({compPct}%)</span><span className="text-right text-slate-300">{fmt(pv.comp)} TUNG</span>
              {crePct > 0 && <><span className="text-slate-400">Para ti ({crePct}%)</span><span className="text-right text-emerald-300">+{fmt(pv.cre)} TUNG</span></>}
              {seedNum > 0 && <><span className="text-fuchsia-200">🎁 Premio inicial</span><span className="text-right text-fuchsia-200">+{fmt(seedNum)} TUNG</span></>}
              <span className="text-amber-200">Bolsa de premios</span><span className="text-right font-orbitron text-amber-200">{fmt(pv.pool)} TUNG</span>
            </div>
            <PrizeRow prizes={pv.prizes} />
            {seedNum > 0 && pvMin && (
              <p className="text-[10px] text-slate-400">Con solo {data.rules.min_players} inscritos: 🥇{fmt(pvMin.prizes[0])} · 🥈{fmt(pvMin.prizes[1])} · 🥉{fmt(pvMin.prizes[2])} TUNG</p>
            )}
          </div>
        )}

        {err && <p className="text-sm text-red-300">{err}</p>}
        <button type="button" onClick={submit} disabled={!feeOk || !startOk || !nameOk || !seedOk || busy}
          className="w-full py-3 rounded-xl font-orbitron tracking-wider text-amber-950 bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-500 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-900/40 flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} CREAR Y ANUNCIAR
        </button>
      </div>
    </div>
  );
}

// ─── Tarjeta ─────────────────────────────────────────
function TourCard({ t, now, busy, canJoin, balance, onRegister, onUnregister, onCancel, onOpen }: {
  t: Tour; now: number; busy: boolean; canJoin: boolean; balance: number;
  onRegister: (t: Tour) => void; onUnregister: (t: Tour) => void; onCancel: (t: Tour) => void; onOpen: (id: string) => void;
}) {
  const st = STATUS_UI[t.status];
  const msLeft = Date.parse(t.starts_at) - now;
  const fillPct = Math.min(100, (t.players / t.max_players) * 100);
  const minPct = (t.min_players / t.max_players) * 100;
  const official = t.is_official;
  return (
    <div className={`relative overflow-hidden min-w-0 rounded-2xl border p-4 space-y-3 bst-shine ${official ? 'border-amber-400/50' : 'border-violet-400/35'} ${t.status === 'cancelled' ? 'opacity-70' : ''}`}
      style={{ background: official
        ? 'radial-gradient(ellipse at 100% 0%, rgba(251,191,36,0.22), transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(99,102,241,0.2), transparent 55%), #0a0f1f'
        : 'radial-gradient(ellipse at 100% 0%, rgba(167,139,250,0.22), transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(14,165,233,0.16), transparent 55%), #0a0f1f' } as CSSProperties}>
      {t.status === 'finished' && t.podium && !REDUCED && <span className="absolute right-3 top-2 text-3xl bst-glow">🏆</span>}
      <div className="flex flex-wrap items-start justify-between gap-2 pr-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-orbitron ${st.cls}`}>{st.label}</span>
            {official
              ? <span className="px-2 py-0.5 rounded-full border border-amber-400/60 bg-amber-500/15 text-[10px] font-orbitron text-amber-200 flex items-center gap-1"><Crown className="w-3 h-3" />OFICIAL</span>
              : <span className="px-2 py-0.5 rounded-full border border-violet-400/40 bg-violet-500/10 text-[10px] text-violet-200">Organiza {t.creator ?? '—'}</span>}
            {t.registered && <span className="px-2 py-0.5 rounded-full border border-sky-400/50 bg-sky-500/15 text-[10px] text-sky-200">{t.status === 'running' ? (t.alive ? 'Sigues en juego' : 'Eliminado') : 'Inscrito ✓'}</span>}
          </div>
          <p className="font-orbitron text-white text-base sm:text-lg break-words">{t.name}</p>
          {t.description && <p className="text-xs text-slate-400 break-words">{t.description}</p>}
          {Number(t.seed_prize) > 0 && t.status !== 'cancelled' && (
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full border border-fuchsia-400/50 bg-fuchsia-500/15 text-[10px] font-orbitron text-fuchsia-100 shadow-[0_0_10px_rgba(217,70,239,0.35)]">
              🎁 PREMIO INICIAL {fmt(t.seed_prize)} TUNG
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-900/70 border border-slate-700/60 py-1.5">
          <p className="text-[10px] text-slate-400">Inscripción</p>
          <p className="font-orbitron text-sm text-amber-200">{fmt(t.entry_fee)}</p>
        </div>
        <div className="rounded-lg bg-slate-900/70 border border-slate-700/60 py-1.5">
          <p className="text-[10px] text-slate-400">Bolsa</p>
          <p className="font-orbitron text-sm text-emerald-300">{fmt(t.status === 'open' ? t.pool_full : t.pool)}</p>
        </div>
        <div className="rounded-lg bg-slate-900/70 border border-slate-700/60 py-1.5">
          <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1"><CalendarClock className="w-3 h-3" />{t.status === 'open' ? 'Empieza en' : t.status === 'running' ? 'Ronda' : 'Fecha'}</p>
          <p className="font-orbitron text-[12px] text-cyan-200 truncate px-1">
            {t.status === 'open' ? countdown(msLeft) : t.status === 'running' ? (t.round_name ?? '—') : new Date(t.finished_at ?? t.starts_at).toLocaleDateString('es-ES')}
          </p>
        </div>
      </div>

      {t.status === 'open' && (
        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span><Users className="inline w-3 h-3 mr-1" />{t.players}/{t.max_players} inscritos</span>
            <span>{t.players >= t.min_players ? <span className="text-emerald-300">¡Mínimo alcanzado!</span> : `mínimo ${t.min_players}`}</span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-amber-300 transition-all duration-700" style={{ width: `${fillPct}%` }} />
            <span className="absolute top-0 bottom-0 w-px bg-white/60" style={{ left: `${minPct}%` }} />
          </div>
        </div>
      )}

      {t.status === 'finished' && t.podium ? (
        <div className="grid grid-cols-3 gap-1.5">
          {t.podium.slice(0, 3).map((n, i) => (
            <div key={i} className={`rounded-lg border px-1.5 py-1.5 text-center min-w-0 ${i === 0 ? 'border-amber-400/60 bg-amber-500/15' : 'border-slate-600/50 bg-slate-800/50'}`}>
              <p className="text-base leading-none">{MEDAL[i]}</p>
              <p className="text-[11px] text-white truncate mt-1">{n ?? '—'}</p>
              <p className="text-[10px] text-emerald-300">+{fmt(t.prizes[i])}</p>
            </div>
          ))}
        </div>
      ) : t.status !== 'cancelled' && (
        <div>
          <p className="text-[10px] text-slate-500 mb-1">{t.status === 'open' ? `Premios con las ${t.max_players} plazas llenas` : 'Premios'}</p>
          <PrizeRow prizes={t.status === 'open' ? t.prizes_full : t.prizes} />
          {t.status === 'open' && t.players > 0 && t.players < t.max_players && (
            <p className="text-[10px] text-slate-500 mt-1">Con {t.players} inscritos hoy: 🥇{fmt(t.prizes[0])} · 🥈{fmt(t.prizes[1])} · 🥉{fmt(t.prizes[2])}</p>
          )}
        </div>
      )}
      {t.status === 'cancelled' && <p className="text-xs text-slate-400">{t.cancel_reason ?? 'Cancelado'} · inscripciones reembolsadas</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        {t.status === 'open' && !t.registered && (
          <button type="button" disabled={busy || !canJoin || t.players >= t.max_players || balance < t.entry_fee || msLeft <= 0} onClick={() => onRegister(t)}
            className="flex-1 min-w-[140px] py-2 rounded-lg font-semibold text-sm text-amber-950 bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-500 hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-1.5">
            <Swords className="w-4 h-4" />{t.players >= t.max_players ? 'Completo' : balance < t.entry_fee ? 'Saldo insuficiente' : `Inscribirme · ${fmt(t.entry_fee)} TUNG`}
          </button>
        )}
        {t.status === 'open' && t.registered && (
          <button type="button" disabled={busy || msLeft <= 0} onClick={() => onUnregister(t)}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs disabled:opacity-40">Retirarme (reembolso)</button>
        )}
        <button type="button" onClick={() => onOpen(t.id)}
          className="px-3 py-2 rounded-lg bg-indigo-600/70 hover:bg-indigo-500 text-white text-xs flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />{t.status === 'open' ? 'Inscritos' : 'Ver cuadro'}</button>
        {t.can_cancel && (
          <button type="button" disabled={busy} onClick={() => onCancel(t)}
            className="px-3 py-2 rounded-lg bg-red-900/50 hover:bg-red-800/70 text-red-200 text-xs border border-red-500/30 disabled:opacity-40">Cancelar torneo</button>
        )}
      </div>
    </div>
  );
}

// ─── Pestaña principal ───────────────────────────────
export function BattleshipTournaments({ onEnterMatch, onBalanceChange }: { onEnterMatch: (id: string) => void; onBalanceChange: () => void }) {
  const [data, setData] = useState<TList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const r = await rpc<TList>('battleship_tournaments');
    if (r.success === false) setMsg({ ok: false, text: r.error || 'No se pudieron cargar los torneos' });
    else setData(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 8000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(i); clearInterval(c); };
  }, [load]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  const act = async (fn: string, id: string, okText: string) => {
    setBusy(true);
    const r = await rpc(fn, { p_id: id });
    setBusy(false);
    setMsg(r.success ? { ok: true, text: okText } : { ok: false, text: r.error || 'No se pudo completar' });
    onBalanceChange();
    load();
  };
  const register = (t: Tour) => {
    if (!window.confirm(`¿Inscribirte en «${t.name}» por ${fmt(t.entry_fee)} TUNG?\nSi no se llega al mínimo o te retiras antes del inicio, se te devuelve todo.`)) return;
    act('battleship_tournament_register', t.id, '¡Inscrito! Te avisaremos cuando empiece.');
  };
  const unregister = (t: Tour) => {
    if (!window.confirm(`¿Retirarte de «${t.name}»? Se te devolverán ${fmt(t.entry_fee)} TUNG.`)) return;
    act('battleship_tournament_unregister', t.id, 'Te has retirado. Inscripción reembolsada.');
  };
  const cancel = (t: Tour) => {
    if (!window.confirm(`¿Cancelar «${t.name}»? Se reembolsará a todos los inscritos.`)) return;
    act('battleship_tournament_cancel', t.id, 'Torneo cancelado y reembolsado.');
  };

  const groups = useMemo(() => {
    const list = data?.tournaments ?? [];
    return [
      { key: 'running', title: '⚔️ En juego', items: list.filter((t) => t.status === 'running') },
      { key: 'open', title: '📝 Inscripción abierta', items: list.filter((t) => t.status === 'open') },
      { key: 'done', title: '🏆 Resultados recientes', items: list.filter((t) => t.status === 'finished' || t.status === 'cancelled') },
    ].filter((g) => g.items.length > 0);
  }, [data]);

  const canJoin = !!data && data.enabled && !data.gate_error;

  return (
    <div className="space-y-5">
      {STYLE}
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/40 p-5 sm:p-7 bst-shine" style={{ background: 'radial-gradient(ellipse at 85% 10%, rgba(251,191,36,0.3), transparent 55%), radial-gradient(ellipse at 10% 90%, rgba(167,139,250,0.28), transparent 55%), #070b18' }}>
        <div className="absolute -right-4 top-1/2 -translate-y-1/2 text-[110px] sm:text-[150px] leading-none opacity-25 sm:opacity-40 bst-glow select-none pointer-events-none">🏆</div>
        <div className="relative max-w-xl space-y-2">
          <p className="font-orbitron text-2xl sm:text-3xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-500">TORNEOS GALÁCTICOS</p>
          <p className="text-sm text-slate-300">Eliminación directa: gana y avanzas, pierde y quedas fuera. Los 3 primeros se reparten la bolsa de inscripciones.</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-amber-500/10 border border-amber-400/40 text-amber-200">🥇🥈🥉 Premios para el podio</span>
            <span className="px-2 py-1 rounded bg-slate-900/70 border border-slate-600/50 text-slate-200">↩️ Reembolso si no se llena el mínimo</span>
            <span className="px-2 py-1 rounded bg-violet-500/10 border border-violet-400/40 text-violet-200">👑 Organiza el tuyo y gana el {data?.rules.creator_pct ?? 10}%</span>
          </div>
        </div>
        {data?.can_create && data.enabled && !data.gate_error && (
          <button type="button" onClick={() => setCreating(true)}
            className="relative mt-4 px-5 py-2.5 rounded-xl font-orbitron text-sm text-amber-950 bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-500 hover:brightness-110 shadow-lg shadow-amber-900/40 flex items-center gap-2">
            <Plus className="w-4 h-4" />{data.is_admin ? 'Crear torneo oficial' : 'Organizar torneo'}
          </button>
        )}
      </div>

      {data?.live_match && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-rose-400/60 bg-rose-950/40 bst-live">
          <p className="text-rose-100 text-sm font-semibold">⚔️ ¡Tu duelo de torneo está listo! Despliega tu flota antes de que acabe el tiempo.</p>
          <button type="button" onClick={() => onEnterMatch(data.live_match!)} className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-orbitron">ENTRAR</button>
        </div>
      )}
      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm border ${msg.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>{msg.text}</div>
      )}
      {data?.gate_error && <div className="px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">{data.gate_error}</div>}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-amber-300" /></div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 py-14 text-center space-y-2">
          <Trophy className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-300">No hay torneos ahora mismo.</p>
          <p className="text-xs text-slate-500">{data?.can_create ? '¡Organiza el primero y llévate el 10% de las inscripciones!' : 'Vuelve pronto: se anuncian en Telegram y en tus mensajes.'}</p>
        </div>
      ) : groups.map((g) => (
        <div key={g.key} className="space-y-3">
          <p className="font-orbitron text-sm text-slate-200">{g.title}</p>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {g.items.map((t) => (
              <TourCard key={t.id} t={t} now={now} busy={busy} canJoin={canJoin} balance={data?.balance ?? 0}
                onRegister={register} onUnregister={unregister} onCancel={cancel} onOpen={setOpenId} />
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 text-xs text-slate-400 space-y-1.5">
        <p className="text-slate-200 font-semibold">Cómo funcionan los torneos</p>
        <p>• Pagas la inscripción al apuntarte. Puedes retirarte con reembolso completo hasta que empiece.</p>
        <p>• Al inicio se sortea el cuadro. Si faltan rivales, algunos pasan de ronda directamente.</p>
        <p>• Cada duelo: 3 minutos para desplegar y 30s por disparo. Los semifinalistas que pierden juegan por el 3er puesto.</p>
        <p>• Comisión: {data?.rules.official_fee_pct ?? 20}% en torneos oficiales; {data?.rules.player_fee_pct ?? 30}% en torneos de jugadores ({data?.rules.creator_pct ?? 10}% para el organizador). El resto es la bolsa de premios.</p>
        <p>• Si no se llega a {data?.rules.min_players ?? 4} inscritos a la hora de inicio, el torneo se cancela y se devuelve todo.</p>
        <p>• Mientras estés en un torneo (o vaya a empezar en menos de 10 min) no puedes abrir duelos con apuesta.</p>
      </div>

      {openId && <DetailModal id={openId} onClose={() => setOpenId(null)} onPlay={(id) => { setOpenId(null); onEnterMatch(id); }} />}
      {creating && data && (
        <CreateModal data={data} onClose={() => setCreating(false)}
          onCreated={(text) => { setCreating(false); setMsg({ ok: true, text }); onBalanceChange(); load(); }} />
      )}
    </div>
  );
}
