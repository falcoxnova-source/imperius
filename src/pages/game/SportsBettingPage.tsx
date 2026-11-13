// [SPORTS1] Estadio Galactico: apuestas deportivas de futbol (1X2, sistema de bote, en TUNG).
// Toda la logica de dinero vive en el servidor (sports_place_bet / _sports_settle). Aqui solo se muestra.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, Ban, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, CircleX, Coins, Gavel, History, Info, KeyRound, ListChecks,
  Loader2, Lock, Power, Radio, RefreshCw, Settings, Timer, Trophy, Users, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { casinoSfx } from '../../lib/casinoSfx';
import { unlockSfx } from '../../lib/sfx';
import { SoundToggle } from '../../components/game/SoundToggle';
import { SPORTS_COORDS } from '../../lib/casino';

// ─── Tipos ───────────────────────────────────────────
type Pick = 'H' | 'D' | 'A';

interface Teams {
  home_name: string; home_short: string | null; home_tla: string | null; home_crest: string | null;
  away_name: string; away_short: string | null; away_tla: string | null; away_crest: string | null;
}
interface Pools { pool_home: number; pool_draw: number; pool_away: number }
interface Match extends Teams, Pools {
  id: number; competition_code: string; competition_name: string | null; competition_emblem: string | null;
  matchday: number | null; stage: string | null; kickoff: string; api_status: string;
  state: 'open' | 'closed' | 'settled' | 'void'; live_home: number | null; live_away: number | null;
  bettors: number; my_home: number; my_draw: number; my_away: number;
}
interface ResultRow extends Teams, Pools {
  id: number; competition_code: string; competition_name: string | null; competition_emblem: string | null;
  kickoff: string; api_status: string; state: 'settled' | 'void'; result: Pick | null; void_reason: string | null;
  live_home: number | null; live_away: number | null; score_home: number | null; score_away: number | null;
  bettors: number; my_staked: number; my_paid: number;
}
interface MyBet extends Teams, Pools {
  id: string; match_id: number; pick: Pick; amount: number; status: 'open' | 'won' | 'lost' | 'refunded';
  payout: number; fee: number; created_at: string; settled_at: string | null;
  competition_code: string; competition_name: string | null; competition_emblem: string | null;
  kickoff: string; api_status: string; state: string; result: Pick | null; void_reason: string | null;
  live_home: number | null; live_away: number | null; score_home: number | null; score_away: number | null;
}
interface BigWin { username: string | null; payout: number; amount: number; pick: Pick; home_name: string; away_name: string }
interface Config {
  enabled: boolean; ready: boolean; min_bet: number; max_bet: number; max_per_match: number;
  close_minutes: number; fee_rate: number; competitions: string[]; last_sync_at: string | null;
}
interface AdminInfo {
  token_set: boolean; token_hint: string | null; sync_interval_minutes: number;
  last_request_at: string | null; last_sync_at: string | null; last_sync_status: number | null;
  last_sync_error: string | null; last_sync_count: number | null; pending: boolean; pool_pending: number;
  escrow: number; total_bets: number; total_wagered: number; total_fees: number; total_company: number;
  total_paid: number; matches_known: number; errors: { id: number; match: string; error: string }[];
}
interface Lobby {
  success: boolean; error?: string; server_time: string; balance: number; config: Config;
  matches: Match[]; results: ResultRow[]; big_wins: BigWin[]; my_open: { count: number; amount: number };
  admin: AdminInfo | null;
}
type Tab = 'matches' | 'mybets' | 'results' | 'rules';

// ─── Utilidades ──────────────────────────────────────
const LEAGUES: Record<string, { name: string; icon: string; tint: string }> = {
  PL: { name: 'Premier League', icon: '🦁', tint: 'from-purple-500/30 to-fuchsia-600/20' },
  PD: { name: 'LaLiga', icon: '🇪🇸', tint: 'from-orange-500/30 to-red-600/20' },
  SA: { name: 'Serie A', icon: '🇮🇹', tint: 'from-sky-500/30 to-blue-700/20' },
  BL1: { name: 'Bundesliga', icon: '🇩🇪', tint: 'from-red-500/30 to-rose-700/20' },
  FL1: { name: 'Ligue 1', icon: '🇫🇷', tint: 'from-indigo-500/30 to-blue-700/20' },
  CL: { name: 'Champions League', icon: '⭐', tint: 'from-blue-500/30 to-cyan-600/20' },
};
const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT', 'LIVE']);
const OPEN_STATUS = new Set(['SCHEDULED', 'TIMED']);
const CHIPS = [10, 50, 100, 500, 1000, 5000];
const PAGE_SIZE = 12;
// Escudos servidos por nuestro nginx (/crests/ -> crests.football-data.org, con cache).
const CREST_RE = /^https:\/\/crests\.football-data\.org\/([A-Za-z0-9_-]+\.(?:png|svg))$/;
const imgUrl = (u: string | null) => {
  const m = u ? CREST_RE.exec(u) : null;
  return m ? `/crests/${m[1]}` : u;
};
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const num = (v: unknown) => Number(v ?? 0) || 0;
const fmt = (v: unknown, d = 2) => num(v).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d });
const teamShort = (t: Teams, side: 'home' | 'away') =>
  (side === 'home' ? t.home_short || t.home_name : t.away_short || t.away_name);
const pickLabel = (t: Teams, p: Pick) => (p === 'H' ? teamShort(t, 'home') : p === 'A' ? teamShort(t, 'away') : 'Empate');
const pickCode = (p: Pick) => (p === 'H' ? '1' : p === 'D' ? 'X' : '2');
const poolOf = (m: Pools, p: Pick) => num(p === 'H' ? m.pool_home : p === 'D' ? m.pool_draw : m.pool_away);
const totalPool = (m: Pools) => num(m.pool_home) + num(m.pool_draw) + num(m.pool_away);
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const shortDate = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Multiplicador estimado (incluye lo apostado) si se apuesta `a` ahora. Mismo calculo que _sports_settle. */
function estMult(m: Pools, p: Pick, a: number, feeRate: number): number | null {
  const T = totalPool(m) + a;
  const W = poolOf(m, p) + a;
  const L = T - W;
  if (W <= 0 || L <= 0) return null;
  const fee = Math.min(feeRate * T, L);
  return 1 + (L - fee) / W;
}

function countdown(ms: number) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

function dayLabel(iso: string, nowMs: number) {
  const d = new Date(iso);
  const n = new Date(nowMs);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(n)) / 86400000);
  const base = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  if (diff === 0) return `Hoy · ${base}`;
  if (diff === 1) return `Mañana · ${base}`;
  if (diff === -1) return `Ayer · ${base}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function dayChip(key: string, nowMs: number) {
  const [y, mo, d] = key.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  const n = new Date(nowMs);
  const diff = Math.round((dt.getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) / 86400000);
  const wd = dt.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
  const dm = dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  return { top: diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer' : wd, bottom: dm };
}

type Phase = 'open' | 'closing' | 'closed' | 'live' | 'finished' | 'postponed';
function phaseOf(m: Match, nowSrv: number, closeMin: number): Phase {
  if (LIVE.has(m.api_status)) return 'live';
  if (m.api_status === 'FINISHED' || m.api_status === 'AWARDED') return 'finished';
  if (['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(m.api_status)) return 'postponed';
  const closeAt = new Date(m.kickoff).getTime() - closeMin * 60000;
  if (m.state === 'open' && OPEN_STATUS.has(m.api_status) && nowSrv < closeAt) {
    return closeAt - nowSrv < 30 * 60000 ? 'closing' : 'open';
  }
  return 'closed';
}

// ─── Piezas visuales ─────────────────────────────────
function Crest({ src, tla, name, size = 44 }: { src: string | null; tla: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const label = (tla || name.replace(/[^A-Za-zÀ-ÿ ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 3)).toUpperCase();
  if (!src || failed) {
    return (
      <span
        style={{ width: size, height: size, fontSize: size * 0.28 }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 font-black text-white ring-2 ring-white/20 shadow-lg"
        aria-label={name}
      >
        {label}
      </span>
    );
  }
  return (
    <img
      src={imgUrl(src) ?? undefined}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
    />
  );
}

function LeagueBadge({ code, emblem, name }: { code: string; emblem: string | null; name: string | null }) {
  const meta = LEAGUES[code];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200/80">
      {emblem ? (
        <img src={imgUrl(emblem) ?? undefined} alt="" referrerPolicy="no-referrer" className="h-4 w-4 object-contain" loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <span>{meta?.icon ?? '⚽'}</span>
      )}
      {meta?.name ?? name ?? code}
    </span>
  );
}

function StadiumBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#3a2b0c_0%,#171006_45%,#080602_100%)]" />
      {/* Antorchas */}
      <div className="sp-anim absolute -top-24 left-[8%] h-[70vh] w-40 origin-top bg-gradient-to-b from-amber-200/30 via-orange-300/5 to-transparent blur-2xl [animation:spBeam_9s_ease-in-out_infinite]" />
      <div className="sp-anim absolute -top-24 right-[8%] h-[70vh] w-40 origin-top bg-gradient-to-b from-orange-200/25 via-amber-200/5 to-transparent blur-2xl [animation:spBeam_11s_ease-in-out_infinite_reverse]" />
      <div className="absolute left-1/2 top-0 h-56 w-[60%] -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl" />
      {/* Arena */}
      <div className="absolute inset-x-0 bottom-0 h-[45%] opacity-40 [background:repeating-linear-gradient(90deg,#4a3a1a_0_80px,#54421f_80px_160px)] [mask-image:linear-gradient(to_top,black,transparent)]" />
      <div className="absolute bottom-[-180px] left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full border-2 border-white/10" />
      <div className="absolute inset-x-0 bottom-[0px] h-px bg-white/10" />
      {/* Estrellas / flashes de la grada */}
      {Array.from({ length: 24 }).map((_, i) => (
        <span
          key={i}
          className="sp-anim absolute h-1 w-1 rounded-full bg-white/70 [animation:spFlash_4s_ease-in-out_infinite]"
          style={{ left: `${(i * 37) % 100}%`, top: `${8 + ((i * 53) % 30)}%`, animationDelay: `${(i * 0.37) % 4}s` }}
        />
      ))}
    </div>
  );
}

function Confetti({ seed }: { seed: number }) {
  const pieces = useMemo(() => {
    if (!seed || REDUCED_MOTION) return [];
    const colors = ['#fbbf24', '#f59e0b', '#b91c1c', '#fde68a', '#ffffff', '#d4af37'];
    return Array.from({ length: 90 }).map((_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      dur: 2.2 + Math.random() * 1.8,
      color: colors[i % colors.length],
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      round: Math.random() < 0.25,
    }));
  }, [seed]);
  if (!pieces.length) return null;
  return (
    <div key={seed} className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 [animation:spConfetti_linear_forwards]"
          style={{
            left: `${p.left}%`, width: p.w, height: p.round ? p.w : p.h, background: p.color,
            borderRadius: p.round ? '9999px' : '2px', animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function PoolBar({ m }: { m: Pools }) {
  const T = totalPool(m);
  const pct = (p: Pick) => (T > 0 ? (poolOf(m, p) / T) * 100 : 0);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className="bg-amber-500 transition-all duration-700" style={{ width: `${pct('H')}%` }} />
      <div className="bg-stone-300 transition-all duration-700" style={{ width: `${pct('D')}%` }} />
      <div className="bg-red-400 transition-all duration-700" style={{ width: `${pct('A')}%` }} />
    </div>
  );
}

const PICK_STYLE: Record<Pick, { ring: string; text: string; bg: string }> = {
  H: { ring: 'ring-amber-400/60', text: 'text-amber-300', bg: 'from-amber-500/25 to-amber-700/10' },
  D: { ring: 'ring-stone-300/60', text: 'text-stone-200', bg: 'from-stone-400/25 to-stone-700/10' },
  A: { ring: 'ring-red-400/60', text: 'text-red-300', bg: 'from-red-500/25 to-red-700/10' },
};

// ─── Tarjeta de partido ──────────────────────────────
function MatchCard({
  m, cfg, nowSrv, canBet, isAdmin, onPick, onAdmin,
}: {
  m: Match; cfg: Config; nowSrv: number; canBet: boolean; isAdmin: boolean;
  onPick: (m: Match, p: Pick) => void; onAdmin: (action: string, matchId: number, value?: string) => void;
}) {
  const phase = phaseOf(m, nowSrv, cfg.close_minutes);
  const kickoffMs = new Date(m.kickoff).getTime();
  const closeAt = kickoffMs - cfg.close_minutes * 60000;
  const T = totalPool(m);
  const mine: Record<Pick, number> = { H: num(m.my_home), D: num(m.my_draw), A: num(m.my_away) };
  const myTotal = mine.H + mine.D + mine.A;
  const bettable = canBet && (phase === 'open' || phase === 'closing');
  const live = phase === 'live';
  const canSettle = isAdmin && nowSrv > kickoffMs + 110 * 60000;

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${LEAGUES[m.competition_code]?.tint ?? 'from-amber-500/20 to-amber-800/10'} p-[1px] transition-transform duration-300 hover:-translate-y-0.5 ${
        live ? 'border-red-500/50 shadow-[0_0_30px_-8px_rgba(239,68,68,0.6)]' : myTotal > 0 ? 'border-amber-400/40' : 'border-white/10'
      }`}
    >
      <div className="relative rounded-2xl bg-[#17110a]/90 p-3 sm:p-4 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <LeagueBadge code={m.competition_code} emblem={m.competition_emblem} name={m.competition_name} />
          <span className="text-[10px] text-white/40">
            {m.matchday ? `Jornada ${m.matchday}` : m.stage ? m.stage.replace(/_/g, ' ').toLowerCase() : ''}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <Crest src={m.home_crest} tla={m.home_tla} name={m.home_name} />
            <span className="w-full truncate text-sm font-bold text-white" title={m.home_name}>{teamShort(m, 'home')}</span>
          </div>
          <div className="flex min-w-[92px] flex-col items-center">
            {live ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white sp-anim [animation:spLive_1.4s_ease-in-out_infinite]">
                  <Radio className="h-3 w-3" /> {m.api_status === 'PAUSED' ? 'Descanso' : 'En vivo'}
                </span>
                <span className="mt-1 font-mono text-3xl font-black tabular-nums text-white drop-shadow">
                  {m.live_home ?? 0}<span className="mx-1 text-white/40">-</span>{m.live_away ?? 0}
                </span>
              </>
            ) : (
              <>
                <span className="font-mono text-2xl font-black text-white">{hhmm(m.kickoff)}</span>
                {phase === 'open' || phase === 'closing' ? (
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${phase === 'closing' ? 'bg-amber-500/20 text-amber-200' : 'bg-stone-500/15 text-stone-200'}`}>
                    <Timer className="h-3 w-3" /> Cierra en {countdown(closeAt - nowSrv)}
                  </span>
                ) : phase === 'finished' ? (
                  <span className="mt-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">Final · liquidando</span>
                ) : phase === 'postponed' ? (
                  <span className="mt-1 rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] text-orange-200">Aplazado</span>
                ) : (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
                    <Lock className="h-3 w-3" /> Cerrado
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <Crest src={m.away_crest} tla={m.away_tla} name={m.away_name} />
            <span className="w-full truncate text-sm font-bold text-white" title={m.away_name}>{teamShort(m, 'away')}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['H', 'D', 'A'] as Pick[]).map((p) => {
            const mult = estMult(m, p, cfg.min_bet, cfg.fee_rate);
            const st = PICK_STYLE[p];
            const pct = T > 0 ? Math.round((poolOf(m, p) / T) * 100) : 0;
            return (
              <button
                key={p}
                type="button"
                disabled={!bettable}
                onClick={() => onPick(m, p)}
                aria-label={`Apostar por ${pickLabel(m, p)}`}
                className={`relative flex flex-col items-center rounded-xl bg-gradient-to-b ${st.bg} px-1 py-2 ring-1 transition-all ${
                  mine[p] > 0 ? st.ring + ' ring-2' : 'ring-white/10'
                } ${bettable ? 'hover:scale-[1.04] hover:brightness-125 active:scale-95 cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
              >
                <span className={`text-lg font-black leading-none ${st.text}`}>{pickCode(p)}</span>
                <span className="mt-0.5 w-full truncate text-[10px] text-white/60">{pickLabel(m, p)}</span>
                <span className="mt-1 font-mono text-sm font-bold text-white">{mult ? `x${fmt(mult, 2)}` : '—'}</span>
                <span className="text-[9px] text-white/40">{pct}% del bote</span>
                {mine[p] > 0 && (
                  <span className="absolute -right-1 -top-1.5 rounded-full bg-amber-400 px-1.5 text-[9px] font-black text-amber-950 shadow">
                    {fmt(mine[p], 0)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 space-y-1.5">
          <PoolBar m={m} />
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3 text-amber-300" /> Bote {fmt(T, 0)} TUNG</span>
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {m.bettors}</span>
          </div>
          {myTotal > 0 && (
            <div className="rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
              Tus apuestas: {(['H', 'D', 'A'] as Pick[]).filter((p) => mine[p] > 0).map((p) => `${pickCode(p)} ${fmt(mine[p], 0)}`).join(' · ')} TUNG
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2 text-[10px]">
            <span className="text-white/40">#{m.id} · {m.api_status} · {m.state}</span>
            <button
              type="button"
              onClick={() => {
                const reason = window.prompt('Motivo de la anulación (se devolverá el 100% a todos):', 'Anulado por administración');
                if (reason !== null) onAdmin('void_match', m.id, reason);
              }}
              className="ml-auto inline-flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-red-200 hover:bg-red-500/30"
            >
              <Ban className="h-3 w-3" /> Anular
            </button>
            {canSettle && (['H', 'D', 'A'] as Pick[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  if (window.confirm(`¿Liquidar ${m.home_name} vs ${m.away_name} con resultado "${pickLabel(m, p)}" (90 min)?`)) onAdmin('settle_match', m.id, p);
                }}
                className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-amber-100 hover:bg-amber-500/30"
              >
                <Gavel className="h-3 w-3" /> {pickCode(p)}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Boleto de apuesta ───────────────────────────────
function BetSlip({
  m, pick, cfg, balance, onPickChange, onClose, onPlaced,
}: {
  m: Match; pick: Pick; cfg: Config; balance: number;
  onPickChange: (p: Pick) => void; onClose: () => void;
  onPlaced: (res: { balance: number; match: Pools & { id: number; bettors: number } }, pick: Pick, amount: number) => void;
}) {
  const [amount, setAmount] = useState(String(Math.max(cfg.min_bet, 10)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const myTotal = num(m.my_home) + num(m.my_draw) + num(m.my_away);
  const room = Math.max(0, num(cfg.max_per_match) - myTotal);
  const maxAllowed = Math.max(0, Math.floor(Math.min(balance, num(cfg.max_bet), room)));
  const a = Number(amount);
  const valid = Number.isInteger(a) && a >= cfg.min_bet && a <= cfg.max_bet;
  const mult = valid ? estMult(m, pick, a, cfg.fee_rate) : null;
  const ret = mult ? a * mult : valid ? a : 0;

  let problem: string | null = null;
  if (amount !== '' && !valid) problem = `Introduce un número entero entre ${fmt(cfg.min_bet, 0)} y ${fmt(cfg.max_bet, 0)}`;
  else if (valid && a > balance) problem = 'Saldo TUNG insuficiente';
  else if (valid && a > room) problem = `Límite por partido: te quedan ${fmt(room, 0)} TUNG`;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (busy || !valid || problem) return;
    unlockSfx();
    setBusy(true);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc('sports_place_bet', { p_match_id: m.id, p_pick: pick, p_amount: a });
      if (error) throw new Error(error.message);
      const r = data as { success: boolean; error?: string; balance: number; match: Pools & { id: number; bettors: number } };
      if (!r?.success) { setErr(r?.error || 'No se pudo registrar la apuesta'); casinoSfx.lose(); return; }
      onPlaced(r, pick, a);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Boleto de apuesta">
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-amber-400/30 bg-gradient-to-b from-[#241a07] to-[#0d0903] shadow-[0_0_60px_-10px_rgba(245,158,11,0.6)] sm:rounded-3xl [animation:spPop_.25s_ease-out]"
      >
        <div className="relative border-b border-white/10 bg-[repeating-linear-gradient(90deg,rgba(245,158,11,0.12)_0_24px,rgba(245,158,11,0.04)_24px_48px)] px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Boleto de apuesta</span>
            <button type="button" onClick={onClose} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Cerrar"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-2 flex items-center justify-center gap-3">
            <Crest src={m.home_crest} tla={m.home_tla} name={m.home_name} size={34} />
            <div className="min-w-0 text-center">
              <div className="truncate text-sm font-bold text-white">{teamShort(m, 'home')} <span className="text-white/40">vs</span> {teamShort(m, 'away')}</div>
              <div className="text-[11px] text-white/50">{dayLabel(m.kickoff, Date.now())} · {hhmm(m.kickoff)}</div>
            </div>
            <Crest src={m.away_crest} tla={m.away_tla} name={m.away_name} size={34} />
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-3 gap-2">
            {(['H', 'D', 'A'] as Pick[]).map((p) => {
              const st = PICK_STYLE[p];
              const on = p === pick;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { casinoSfx.chip(); onPickChange(p); }}
                  className={`flex flex-col items-center rounded-xl bg-gradient-to-b ${st.bg} py-2 ring-1 transition-all ${on ? `${st.ring} ring-2 scale-[1.03]` : 'ring-white/10 opacity-70 hover:opacity-100'}`}
                >
                  <span className={`text-xl font-black ${st.text}`}>{pickCode(p)}</span>
                  <span className="w-full truncate px-1 text-[10px] text-white/70">{pickLabel(m, p)}</span>
                </button>
              );
            })}
          </div>

          <div>
            <label htmlFor="sp-amount" className="mb-1 flex items-center justify-between text-xs text-white/60">
              <span>Cantidad (TUNG)</span>
              <span>Saldo: <b className="text-amber-200">{fmt(balance, 2)}</b></span>
            </label>
            <input
              id="sp-amount"
              ref={inputRef}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-center font-mono text-2xl font-black text-white outline-none focus:border-amber-400"
            />
            <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {CHIPS.map((c) => (
                <button key={c} type="button" onClick={() => { casinoSfx.chip(); setAmount(String(c)); }}
                  className="rounded-lg bg-white/5 py-1.5 text-xs font-bold text-white/80 ring-1 ring-white/10 hover:bg-amber-500/20 hover:text-white">
                  {c >= 1000 ? `${c / 1000}k` : c}
                </button>
              ))}
              <button type="button" onClick={() => { casinoSfx.chip(); setAmount(String(maxAllowed)); }}
                className="rounded-lg bg-amber-500/20 py-1.5 text-xs font-black text-amber-200 ring-1 ring-amber-400/30 hover:bg-amber-500/30">
                MÁX
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
            <div className="flex justify-between text-white/60"><span>Cuota estimada</span><b className="font-mono text-white">{mult ? `x${fmt(mult, 2)}` : '—'}</b></div>
            <div className="mt-1 flex justify-between text-white/60">
              <span>Si gana {pickLabel(m, pick)}</span>
              <b className="font-mono text-amber-300">{valid ? `${fmt(ret, 2)} TUNG` : '—'}</b>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-white/40">
              {mult
                ? 'Sistema de bote: la cuota final depende de todas las apuestas hasta el cierre. Si aciertas, nunca recibes menos de lo apostado.'
                : 'Aún no hay apuestas rivales: si nadie apuesta en contra recuperas tu apuesta íntegra al acertar.'}
            </p>
          </div>

          {(problem || err) && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {err || problem}
            </div>
          )}

          <button
            type="button"
            disabled={busy || !valid || !!problem}
            onClick={submit}
            className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 py-3.5 text-base font-black uppercase tracking-wider text-amber-950 shadow-[0_8px_30px_-6px_rgba(245,158,11,0.8)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="sp-anim absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent [animation:spShine_2.5s_ease-in-out_infinite]" />
            <span className="relative inline-flex items-center justify-center gap-2">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : '⚽'} Apostar {valid ? fmt(a, 0) : ''} TUNG
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Listas ──────────────────────────────────────────
function ScoreLine({ t, h, a, result }: { t: Teams & { home_crest: string | null }; h: number | null; a: number | null; result?: Pick | null }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className={`flex min-w-0 items-center justify-end gap-2 ${result === 'H' ? 'text-amber-300' : 'text-white'}`}>
        <span className="truncate text-sm font-bold">{teamShort(t, 'home')}</span>
        <Crest src={t.home_crest} tla={t.home_tla} name={t.home_name} size={26} />
      </div>
      <span className={`min-w-[64px] rounded-lg px-2 py-0.5 text-center font-mono text-lg font-black ${result === 'D' ? 'bg-amber-400/20 text-amber-100' : 'bg-white/10 text-white'}`}>
        {h ?? '-'} : {a ?? '-'}
      </span>
      <div className={`flex min-w-0 items-center gap-2 ${result === 'A' ? 'text-amber-300' : 'text-white'}`}>
        <Crest src={t.away_crest} tla={t.away_tla} name={t.away_name} size={26} />
        <span className="truncate text-sm font-bold">{teamShort(t, 'away')}</span>
      </div>
    </div>
  );
}

const BET_STATUS: Record<MyBet['status'], { label: string; cls: string }> = {
  open: { label: 'En juego', cls: 'bg-amber-500/20 text-amber-200' },
  won: { label: 'Ganada', cls: 'bg-amber-500/20 text-amber-200' },
  lost: { label: 'Perdida', cls: 'bg-red-500/20 text-red-200' },
  refunded: { label: 'Devuelta', cls: 'bg-slate-500/20 text-slate-200' },
};

function MyBetsList({ bets, loading, error, onRetry }: { bets: MyBet[] | null; loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading && !bets) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-300" /></div>;
  if (error && !bets) {
    return (
      <div className="rounded-2xl bg-red-500/15 p-6 text-center text-red-200">
        <AlertCircle className="mx-auto h-8 w-8" />
        <p className="mt-2">{error}</p>
        <button type="button" onClick={onRetry} className="mt-3 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">Reintentar</button>
      </div>
    );
  }
  if (!bets?.length) return <Empty icon="🎟️" title="Aún no tienes apuestas" text="Elige un partido y apuesta por el ganador o el empate." />;
  return (
    <div className="space-y-2">
      {bets.map((b) => {
        const st = BET_STATUS[b.status];
        const live = LIVE.has(b.api_status);
        const net = num(b.payout) - num(b.amount);
        return (
          <div key={b.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <LeagueBadge code={b.competition_code} emblem={b.competition_emblem} name={b.competition_name} />
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${st.cls}`}>{live && b.status === 'open' ? '🔴 En vivo' : st.label}</span>
            </div>
            <ScoreLine
              t={b}
              h={b.state === 'settled' ? b.score_home : b.live_home}
              a={b.state === 'settled' ? b.score_away : b.live_away}
              result={b.state === 'settled' ? b.result : null}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-white/70">
                <b className={PICK_STYLE[b.pick].text}>{pickCode(b.pick)}</b> {pickLabel(b, b.pick)} · {fmt(b.amount, 0)} TUNG
              </span>
              <span className="text-white/40">{shortDate(b.kickoff)}</span>
            </div>
            {b.status !== 'open' && (
              <div className="mt-1 text-right text-xs">
                {b.status === 'won' && <b className="text-amber-300">Cobrado {fmt(b.payout)} TUNG (+{fmt(net)})</b>}
                {b.status === 'lost' && <span className="text-red-300">-{fmt(b.amount, 0)} TUNG</span>}
                {b.status === 'refunded' && (
                  <span className="text-slate-300">Devuelto {fmt(b.payout)} TUNG{b.void_reason ? ` · ${b.void_reason}` : num(b.fee) > 0 ? ' · nadie acertó' : ''}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResultsList({ results }: { results: ResultRow[] }) {
  if (!results.length) return <Empty icon="📋" title="Sin resultados recientes" text="Aquí aparecerán los partidos liquidados de los últimos 3 días." />;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {results.map((r) => {
        const net = num(r.my_paid) - num(r.my_staked);
        return (
          <div key={r.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <LeagueBadge code={r.competition_code} emblem={r.competition_emblem} name={r.competition_name} />
              <span className="text-[10px] text-white/40">{shortDate(r.kickoff)}</span>
            </div>
            <ScoreLine t={r} h={r.score_home ?? r.live_home} a={r.score_away ?? r.live_away} result={r.state === 'settled' ? r.result : null} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px]">
              {r.state === 'void' ? (
                <span className="text-orange-200">Anulado · {r.void_reason || 'reembolso 100%'}</span>
              ) : (
                <span className="text-white/50">Ganó: <b className="text-white">{r.result ? `${pickCode(r.result)} · ${pickLabel(r, r.result)}` : '—'}</b> · Bote {fmt(totalPool(r), 0)}</span>
              )}
              {num(r.my_staked) > 0 && (
                <b className={net > 0 ? 'text-amber-300' : net < 0 ? 'text-red-300' : 'text-slate-300'}>
                  {net > 0 ? '+' : ''}{fmt(net)} TUNG
                </b>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-black/30 px-6 py-14 text-center">
      <div className="text-5xl">{icon}</div>
      <div className="mt-3 font-bold text-white">{title}</div>
      <p className="mx-auto mt-1 max-w-sm text-sm text-white/50">{text}</p>
    </div>
  );
}

function Rules({ cfg }: { cfg: Config }) {
  const fee = Math.round(cfg.fee_rate * 100);
  // Ejemplo numerico con la misma formula que la liquidacion
  const ex = { H: 600, D: 100, A: 300, mine: 60 };
  const exT = ex.H + ex.D + ex.A;
  const exL = exT - ex.H;
  const exFee = Math.min(cfg.fee_rate * exT, exL);
  const exGain = ((exL - exFee) * ex.mine) / ex.H;
  const exRet = ex.mine + exGain;
  const steps: [string, string, string][] = [
    ['1', 'Elige un partido', 'En la pestaña Partidos verás los próximos encuentros de las grandes ligas con la hora de inicio y la cuenta atrás del cierre.'],
    ['2', 'Elige 1, X o 2', '1 = gana el local · X = empate · 2 = gana el visitante. Debajo de cada opción ves la cuota estimada y qué parte del bote lleva.'],
    ['3', 'Indica cuánto apuestas', 'Escribe la cantidad de TUNG o usa las fichas rápidas. El boleto te enseña cuánto cobrarías si aciertas con las apuestas actuales.'],
    ['4', 'Espera el resultado', 'Al terminar el partido se liquida solo: los premios se ingresan en tu saldo TUNG y recibes un aviso. Revisa todo en Mis apuestas y Resultados.'],
  ];
  const items: [string, string][] = [
    ['¿Qué se apuesta?', `Eliges el resultado de un partido: 1 (gana el local), X (empate) o 2 (gana el visitante). Cuenta el resultado a los 90 minutos más el descuento; la prórroga y los penaltis no cuentan.`],
    ['Sistema de bote', 'Todo lo apostado en un partido forma un bote. Al terminar, quienes acertaron se reparten el dinero de quienes fallaron, en proporción a lo que apostó cada uno. Cuanta menos gente apueste por tu opción, mayor es la cuota.'],
    ['Comisión', `Igual que en la ruleta: ${fee}% del bote, que nunca supera el dinero de los que fallaron. Así, si aciertas, nunca recibes menos de lo que apostaste. La mitad va a los botes del casino y la otra mitad a la casa (accionistas y referidos).`],
    ['Si nadie acierta', `Se devuelve a todos lo apostado menos el ${fee}% de comisión.`],
    ['Partidos anulados', 'Si un partido se cancela, se aplaza más de 48 horas o se suspende, se devuelve el 100% de las apuestas.'],
    ['Cierre', `Las apuestas se cierran ${cfg.close_minutes} minutos antes del inicio. La cuota mostrada es estimada y puede cambiar hasta el cierre.`],
    ['Límites', `Apuesta mínima ${fmt(cfg.min_bet, 0)} TUNG, máxima ${fmt(cfg.max_bet, 0)} TUNG por apuesta y ${fmt(cfg.max_per_match, 0)} TUNG por partido. Puedes apostar a varias opciones del mismo partido.`],
    ['Pagos y avisos', 'Los premios se pagan automáticamente en tu saldo TUNG en cuanto el resultado oficial está disponible. Recibes un mensaje en el juego y, si tienes Telegram vinculado, también allí.'],
    ['Resultados oficiales', 'Los partidos y marcadores se obtienen automáticamente de un proveedor de datos deportivos. Nadie puede elegir el resultado: se usa el marcador oficial final.'],
    ['Juega con cabeza', 'Las apuestas son entretenimiento. Apuesta solo lo que estés dispuesto a perder: el resultado de un partido nunca está garantizado.'],
  ];
  return (
    <div className="space-y-5">
      {/* Paso a paso */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 font-bold text-amber-200"><ListChecks className="h-4 w-4" /> Cómo apostar paso a paso</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([n, t, d]) => (
            <div key={n} className="relative rounded-xl border border-amber-400/20 bg-gradient-to-b from-amber-500/10 to-black/40 p-4">
              <span className="absolute right-3 top-2 font-mono text-3xl font-black text-amber-400/20">{n}</span>
              <div className="font-bold text-white">{t}</div>
              <p className="mt-1 text-sm leading-relaxed text-white/70">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ejemplo */}
      <section className="rounded-xl border border-amber-400/25 bg-amber-500/5 p-4">
        <h3 className="flex items-center gap-2 font-bold text-amber-200"><Coins className="h-4 w-4" /> Ejemplo de cómo se calcula el premio</h3>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          {([['1', ex.H, 'text-amber-300'], ['X', ex.D, 'text-stone-200'], ['2', ex.A, 'text-red-300']] as [string, number, string][]).map(([k, v, c]) => (
            <div key={k} className="rounded-lg bg-black/40 py-2">
              <div className={`text-lg font-black ${c}`}>{k}</div>
              <div className="font-mono text-white">{fmt(v, 0)} TUNG</div>
            </div>
          ))}
        </div>
        <ul className="mt-3 space-y-1 text-sm leading-relaxed text-white/70">
          <li>• Bote total: <b className="text-white">{fmt(exT, 0)} TUNG</b>. Tú apostaste <b className="text-white">{fmt(ex.mine, 0)} TUNG</b> al 1, y gana el local.</li>
          <li>• Dinero de los que fallaron (X + 2): <b className="text-white">{fmt(exL, 0)} TUNG</b>. Comisión: {fee}% del bote = <b className="text-white">{fmt(exFee, 2)} TUNG</b>.</li>
          <li>• Quedan <b className="text-white">{fmt(exL - exFee, 2)} TUNG</b> para los acertantes. Tú pusiste el {fmt((ex.mine / ex.H) * 100, 0)}% de lo apostado al 1, así que te llevas <b className="text-white">{fmt(exGain, 2)} TUNG</b> de ganancia.</li>
          <li>• Cobras <b className="text-amber-300">{fmt(exRet, 2)} TUNG</b> (tu apuesta + ganancia) → cuota <b className="text-amber-300">x{fmt(exRet / ex.mine, 2)}</b>.</li>
        </ul>
      </section>

      {/* Reglas */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 font-bold text-amber-200"><Info className="h-4 w-4" /> Reglas</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {items.map(([t, d]) => (
            <div key={t} className="rounded-xl border border-white/10 bg-black/40 p-4">
              <div className="flex items-center gap-2 font-bold text-amber-200"><Info className="h-4 w-4" /> {t}</div>
              <p className="mt-1 text-sm leading-relaxed text-white/70">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Panel de administracion ─────────────────────────
function AdminPanel({ info, cfg, busy, onAction }: {
  info: AdminInfo; cfg: Config; busy: boolean; onAction: (action: string, matchId?: number, value?: string) => void;
}) {
  const [open, setOpen] = useState(!info.token_set);
  const [token, setToken] = useState('');
  const [lim, setLim] = useState({
    min_bet: String(cfg.min_bet), max_bet: String(cfg.max_bet), max_per_match: String(cfg.max_per_match),
    close_minutes: String(cfg.close_minutes), sync_interval_minutes: String(info.sync_interval_minutes),
  });
  const stat = (label: string, value: string, cls = 'text-white') => (
    <div className="rounded-lg bg-black/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`font-mono text-sm font-bold ${cls}`}>{value}</div>
    </div>
  );
  return (
    <section className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-black/60 p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-left">
        <span className="inline-flex items-center gap-2 font-bold text-amber-200"><Settings className="h-4 w-4" /> Panel de administración</span>
        <span className="min-w-0 break-all text-xs text-white/50">
          {info.token_set ? `API ${info.token_hint}` : 'Sin token'} · {cfg.enabled ? 'Abiertas' : 'Pausadas'} · {open ? 'Ocultar' : 'Mostrar'}
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stat('Última sync', info.last_sync_at ? shortDate(info.last_sync_at) : 'nunca')}
            {stat('Estado HTTP', info.pending ? 'pendiente…' : String(info.last_sync_status ?? '—'), info.last_sync_status === 200 ? 'text-emerald-300' : 'text-amber-200')}
            {stat('Partidos recibidos', `${info.last_sync_count ?? 0} / ${info.matches_known}`)}
            {stat('En juego (custodia)', `${fmt(info.escrow)} TUNG`, 'text-amber-200')}
            {stat('Total apostado', `${fmt(info.total_wagered)} TUNG`)}
            {stat('Comisiones', `${fmt(info.total_fees)} TUNG`)}
            {stat('Para la casa', `${fmt(info.total_company)} TUNG`, 'text-amber-300')}
            {stat('Pagado', `${fmt(info.total_paid)} TUNG`)}
          </div>
          {info.last_sync_error && (
            <div className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200"><AlertCircle className="mr-1 inline h-3.5 w-3.5" /> {info.last_sync_error}</div>
          )}
          {info.errors.length > 0 && (
            <div className="space-y-1 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {info.errors.map((e) => <div key={e.id}>#{e.id} {e.match}: {e.error}</div>)}
            </div>
          )}

          <div className="rounded-xl bg-black/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white"><KeyRound className="h-4 w-4 text-amber-300" /> Token de football-data.org</div>
            <p className="mb-2 text-xs text-white/50">
              Regístrate gratis en{' '}
              <a href="https://www.football-data.org/client/register" target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">football-data.org</a>
              {' '}y pega aquí el token que te llega por correo. Se guarda solo en el servidor.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value.trim())}
                placeholder={info.token_set ? `Actual: ${info.token_hint}` : 'Pega el token'}
                className="flex-1 rounded-lg border border-white/15 bg-black/50 px-3 py-2 font-mono text-sm text-white outline-none focus:border-amber-400"
              />
              <button type="button" disabled={busy || token.length < 16} onClick={() => { onAction('set_token', undefined, token); setToken(''); }}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-40">Guardar</button>
              {info.token_set && (
                <button type="button" disabled={busy} onClick={() => { if (window.confirm('¿Eliminar el token? Se dejarán de sincronizar partidos.')) onAction('clear_token'); }}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20 disabled:opacity-40">Borrar</button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => onAction(cfg.enabled ? 'disable' : 'enable')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-40 ${cfg.enabled ? 'bg-red-500/80 text-white hover:bg-red-500' : 'bg-amber-500 text-amber-950 hover:bg-amber-400'}`}>
              <Power className="h-4 w-4" /> {cfg.enabled ? 'Pausar apuestas' : 'Abrir apuestas'}
            </button>
            <button type="button" disabled={busy || !info.token_set} onClick={() => onAction('sync_now')}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500/80 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-40">
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Sincronizar ahora
            </button>
            <span className="self-center text-xs text-white/40">Bote pendiente de enviar al jackpot: {fmt(info.pool_pending, 4)} TUNG</span>
          </div>

          <div className="rounded-xl bg-black/40 p-3">
            <div className="mb-2 text-sm font-bold text-white">Límites</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {([
                ['min_bet', 'Mínima'], ['max_bet', 'Máxima'], ['max_per_match', 'Máx. por partido'],
                ['close_minutes', 'Cierre (min antes)'], ['sync_interval_minutes', 'Sync cada (min)'],
              ] as [keyof typeof lim, string][]).map(([k, label]) => (
                <label key={k} className="text-[11px] text-white/50">
                  {label}
                  <input inputMode="numeric" value={lim[k]} onChange={(e) => setLim((s) => ({ ...s, [k]: e.target.value.replace(/[^\d]/g, '') }))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-2 py-1.5 font-mono text-sm text-white outline-none focus:border-amber-400" />
                </label>
              ))}
            </div>
            <button type="button" disabled={busy}
              onClick={() => onAction('set_limits', undefined, JSON.stringify(Object.fromEntries(Object.entries(lim).map(([k, v]) => [k, Number(v)]))))}
              className="mt-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-40">
              Guardar límites
            </button>
          </div>
          <p className="text-[11px] text-white/40">
            Cada partido tiene botones de administración (Anular · liquidar 1/X/2 a mano, solo 110 min después del inicio). Normalmente todo se liquida solo.
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Pagina ──────────────────────────────────────────
export function SportsBettingPage() {
  const { user, fetchProfile } = useAuthStore();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('matches');
  const [league, setLeague] = useState<string>('ALL');
  const [day, setDay] = useState<string>('ALL');
  const [page, setPage] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [slip, setSlip] = useState<{ matchId: number; pick: Pick } | null>(null);
  const [myBets, setMyBets] = useState<MyBet[] | null>(null);
  const [myBetsLoading, setMyBetsLoading] = useState(false);
  const [myBetsError, setMyBetsError] = useState<string | null>(null);
  const myBetsReq = useRef(0);
  const tabRef = useRef<Tab>('matches');
  tabRef.current = tab;
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<ResultRow[] | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const offsetRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const flash = useCallback((type: 'ok' | 'error', text: string) => {
    setMessage({ type, text });
    timers.current.push(setTimeout(() => setMessage(null), 5000));
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('sports_lobby');
    if (error || !data?.success) {
      setLoadError(error?.message || data?.error || 'No se pudo cargar el Coliseo');
    } else {
      const l = data as Lobby;
      offsetRef.current = new Date(l.server_time).getTime() - Date.now();
      setLobby(l);
      setLoadError(null);
    }
    setLoading(false);
  }, []);

  const loadMyBets = useCallback(async () => {
    const req = ++myBetsReq.current;
    setMyBetsLoading(true);
    const { data, error } = await supabase.rpc('sports_my_bets', { p_limit: 100 });
    if (req !== myBetsReq.current) return;
    if (!error && data?.success) {
      setMyBets((data.bets ?? []) as MyBet[]);
      setMyBetsError(null);
    } else {
      setMyBetsError(error?.message || data?.error || 'No se pudieron cargar tus apuestas');
    }
    setMyBetsLoading(false);
  }, []);

  useEffect(() => {
    load();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      load();
      if (tabRef.current === 'mybets') loadMyBets();
    };
    const poll = setInterval(refresh, 30000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const onVis = refresh;
    document.addEventListener('visibilitychange', onVis);
    const pending = timers.current;
    return () => {
      clearInterval(poll); clearInterval(clock);
      document.removeEventListener('visibilitychange', onVis);
      pending.forEach(clearTimeout);
    };
  }, [load, loadMyBets]);

  useEffect(() => { if (tab === 'mybets') loadMyBets(); }, [tab, loadMyBets]);

  // Premios nuevos -> celebracion (una vez por partido y usuario)
  useEffect(() => {
    if (!lobby || !user?.id) return;
    const key = `xnova_sports_seen_${user.id}`;
    let seen: number[] = [];
    try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch { seen = []; }
    const wins = lobby.results.filter((r) => r.state === 'settled' && num(r.my_paid) > num(r.my_staked) && !seen.includes(r.id));
    if (!wins.length) return;
    localStorage.setItem(key, JSON.stringify([...wins.map((w) => w.id), ...seen].slice(0, 300)));
    setCelebrate(wins);
    setConfetti(Date.now());
    casinoSfx.crowd('big');
    casinoSfx.win(wins.reduce((s, w) => s + num(w.my_paid), 0) >= 1000 ? 'big' : 'small');
  }, [lobby, user?.id]);

  const nowSrv = now + offsetRef.current;
  const cfg = lobby?.config;
  const isAdmin = !!lobby?.admin;
  const canBet = !!cfg?.enabled && !!cfg?.ready;

  const leagues = useMemo(() => {
    const list = cfg?.competitions ?? Object.keys(LEAGUES);
    return list.map((code) => {
      const ms = lobby?.matches.filter((m) => m.competition_code === code) ?? [];
      return { code, count: ms.length, emblem: ms.find((m) => m.competition_emblem)?.competition_emblem ?? null };
    });
  }, [cfg?.competitions, lobby?.matches]);

  const visible = useMemo(
    () => (lobby?.matches ?? []).filter((m) => league === 'ALL' || m.competition_code === league),
    [lobby?.matches, league],
  );
  const liveMatches = visible.filter((m) => LIVE.has(m.api_status));
  const upcoming = useMemo(() => visible.filter((m) => !LIVE.has(m.api_status)), [visible]);
  const days = useMemo(() => {
    const out: { key: string; count: number }[] = [];
    upcoming.forEach((m) => {
      const k = dayKey(m.kickoff);
      const d = out.find((x) => x.key === k);
      if (d) d.count += 1; else out.push({ key: k, count: 1 });
    });
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }, [upcoming]);
  const activeDay = day !== 'ALL' && days.some((d) => d.key === day) ? day : 'ALL';
  const dayFiltered = useMemo(
    () => (activeDay === 'ALL' ? upcoming : upcoming.filter((m) => dayKey(m.kickoff) === activeDay)),
    [upcoming, activeDay],
  );
  const pages = Math.max(1, Math.ceil(dayFiltered.length / PAGE_SIZE));
  const curPage = Math.min(page, pages - 1);
  const groups = useMemo(() => {
    const out: { label: string; items: Match[] }[] = [];
    dayFiltered.slice(curPage * PAGE_SIZE, (curPage + 1) * PAGE_SIZE).forEach((m) => {
      const label = dayLabel(m.kickoff, Date.now());
      const g = out[out.length - 1];
      if (g && g.label === label) g.items.push(m); else out.push({ label, items: [m] });
    });
    return out;
  }, [dayFiltered, curPage]);

  const pickLeague = (code: string) => { setLeague(code); setPage(0); };
  const pickDay = (key: string) => { setDay(key); setPage(0); };
  const goPage = (p: number) => {
    setPage(p);
    listRef.current?.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' });
  };

  const slipMatch = slip ? lobby?.matches.find((m) => m.id === slip.matchId) ?? null : null;

  const openSlip = (m: Match, p: Pick) => {
    unlockSfx();
    casinoSfx.chip();
    setSlip({ matchId: m.id, pick: p });
  };

  const onPlaced = (r: { balance: number; match: Pools & { id: number; bettors: number } }, pick: Pick, amount: number) => {
    setLobby((l) => l && ({
      ...l,
      balance: r.balance,
      my_open: { count: num(l.my_open.count) + 1, amount: num(l.my_open.amount) + amount },
      matches: l.matches.map((m) => (m.id !== r.match.id ? m : {
        ...m, ...r.match,
        my_home: num(m.my_home) + (pick === 'H' ? amount : 0),
        my_draw: num(m.my_draw) + (pick === 'D' ? amount : 0),
        my_away: num(m.my_away) + (pick === 'A' ? amount : 0),
      })),
    }));
    const m = lobby?.matches.find((x) => x.id === r.match.id);
    setSlip(null);
    casinoSfx.whistle();
    casinoSfx.crowd('small');
    setConfetti(Date.now());
    flash('ok', `Apuesta registrada: ${fmt(amount, 0)} TUNG a ${m ? pickLabel(m, pick) : pickCode(pick)}`);
    fetchProfile();
    loadMyBets();
  };

  const adminAction = async (action: string, matchId?: number, value?: string) => {
    setAdminBusy(true);
    try {
      const { data, error } = await supabase.rpc('sports_admin', { p_action: action, p_match_id: matchId ?? null, p_value: value ?? null });
      if (error) throw new Error(error.message);
      if (!data?.success) flash('error', data?.error || 'Error');
      else flash('ok', data.message || (action === 'void_match' ? `Partido anulado: ${fmt(data.refunded)} TUNG devueltos` : action === 'settle_match' ? 'Partido liquidado' : 'Hecho'));
      await load();
      if (tabRef.current === 'mybets') loadMyBets();
      fetchProfile();
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Error');
    } finally {
      setAdminBusy(false);
    }
  };

  const balance = num(lobby?.balance);

  return (
    <div className="relative min-h-[80vh] overflow-hidden rounded-3xl p-3 pb-24 text-white sm:p-6">
      <style>{`
        @keyframes spBeam { 0%,100% { transform: rotate(-10deg) } 50% { transform: rotate(10deg) } }
        @keyframes spFlash { 0%,90%,100% { opacity: 0; transform: scale(.5) } 93% { opacity: 1; transform: scale(2.2) } }
        @keyframes spMarquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes spConfetti { 0% { transform: translateY(-5vh) rotate(0deg); opacity: 1 } 100% { transform: translateY(105vh) rotate(760deg); opacity: .8 } }
        @keyframes spLive { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.7) } 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0) } }
        @keyframes spPop { from { transform: translateY(30px) scale(.96); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes spShine { 0% { transform: translateX(-100%) } 60%,100% { transform: translateX(100%) } }
        @keyframes spBall { 0%,100% { transform: translateY(0) rotate(0) } 50% { transform: translateY(-18px) rotate(180deg) } }
        @keyframes spGlow { 0%,100% { text-shadow: 0 0 18px rgba(245,158,11,.55) } 50% { text-shadow: 0 0 36px rgba(245,158,11,.95) } }
        @media (prefers-reduced-motion: reduce) { .sp-anim { animation: none !important } }
      `}</style>
      <StadiumBackdrop />
      <Confetti seed={confetti} />

      <div className="relative mx-auto max-w-6xl space-y-4">
        {/* Cabecera */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/game/galaxy" className="inline-flex items-center gap-1 text-sm text-amber-300 hover:text-amber-200">
            <ArrowLeft className="h-4 w-4" /> Continente
          </Link>
          <div className="flex items-center gap-2">
            <SoundToggle />
            <div className="rounded-xl border border-amber-400/30 bg-black/50 px-3 py-1.5 text-right">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Saldo</div>
              <div className="font-mono text-sm font-black text-amber-200">{fmt(balance)} TUNG</div>
            </div>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-amber-400/25 bg-gradient-to-br from-amber-900/50 via-black/40 to-yellow-950/60 p-5 sm:p-7">
          <div className="absolute -right-6 -top-6 text-[140px] leading-none opacity-10 sp-anim [animation:spBall_4s_ease-in-out_infinite]" aria-hidden>⚽</div>
          <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300/80">
            Ciudad [{SPORTS_COORDS.galaxy}:{SPORTS_COORDS.system}:{SPORTS_COORDS.position}]
          </div>
          <h1 className="mt-1 bg-gradient-to-r from-amber-50 via-amber-200 to-amber-500 bg-clip-text font-serif text-3xl font-black uppercase tracking-wide text-transparent sm:text-5xl sp-anim [animation:spGlow_3s_ease-in-out_infinite]">
            Coliseo Imperial
          </h1>
          <p className="mt-1 text-sm text-white/60">Apuestas deportivas de fútbol en TUNG · Premier, LaLiga, Serie A, Bundesliga, Ligue 1 y Champions</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-black/40 px-3 py-1 text-white/70"><b className="text-amber-300">1</b> Local · <b className="text-stone-200">X</b> Empate · <b className="text-red-300">2</b> Visitante</span>
            <span className="rounded-full bg-black/40 px-3 py-1 text-white/70">Comisión {Math.round((cfg?.fee_rate ?? 0.2) * 100)}% · nunca pierdes si aciertas</span>
            {lobby && num(lobby.my_open.count) > 0 && (
              <button type="button" onClick={() => setTab('mybets')} className="rounded-full bg-amber-500/20 px-3 py-1 font-semibold text-amber-200 hover:bg-amber-500/30">
                🎟️ {lobby.my_open.count} apuestas en juego · {fmt(lobby.my_open.amount, 0)} TUNG
              </button>
            )}
          </div>
        </section>

        {/* Ticker de grandes premios */}
        {lobby && lobby.big_wins.length > 0 && (
          <div className="relative overflow-hidden rounded-xl border border-amber-400/20 bg-black/50 py-2">
            <div className="flex w-max gap-8 whitespace-nowrap px-4 text-xs sp-anim [animation:spMarquee_40s_linear_infinite]">
              {[...lobby.big_wins, ...lobby.big_wins].map((w, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-white/70">
                  <Trophy className="h-3.5 w-3.5 text-amber-300" />
                  <b className="text-white">{w.username || 'Jugador'}</b> ganó <b className="text-amber-300">{fmt(w.payout)} TUNG</b>
                  con {w.pick === 'H' ? w.home_name : w.pick === 'A' ? w.away_name : 'el empate'} ({w.home_name} vs {w.away_name})
                </span>
              ))}
            </div>
          </div>
        )}

        {message && (
          <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm ${message.type === 'ok' ? 'bg-emerald-500/20 text-emerald-100' : 'bg-red-500/20 text-red-100'}`}>
            {message.type === 'ok' ? <CircleCheck className="h-4 w-4" /> : <CircleX className="h-4 w-4" />} {message.text}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center py-24">
            <span className="text-6xl sp-anim [animation:spBall_1s_ease-in-out_infinite]">⚽</span>
            <span className="mt-4 text-sm text-white/50">Entrando al Coliseo…</span>
          </div>
        ) : !lobby || !cfg ? (
          <div className="rounded-2xl bg-red-500/15 p-6 text-center text-red-200">
            <AlertCircle className="mx-auto h-8 w-8" />
            <p className="mt-2">{loadError || 'No se pudo cargar'}</p>
            <button type="button" onClick={() => { setLoading(true); load(); }} className="mt-3 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">Reintentar</button>
          </div>
        ) : (
          <>
            {lobby.admin && <AdminPanel info={lobby.admin} cfg={cfg} busy={adminBusy} onAction={adminAction} />}

            {!cfg.ready && !isAdmin && (
              <div className="rounded-2xl border border-amber-400/20 bg-black/50 p-6 text-center">
                <div className="text-5xl">🏟️</div>
                <div className="mt-2 font-bold">El Coliseo está preparando la temporada</div>
                <p className="text-sm text-white/50">Muy pronto podrás apostar por tus equipos favoritos.</p>
              </div>
            )}
            {cfg.ready && !cfg.enabled && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm text-amber-100">
                <Lock className="h-4 w-4" /> Las apuestas están pausadas temporalmente. Las apuestas ya hechas siguen activas.
              </div>
            )}

            {/* Pestañas */}
            <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-black/50 p-1">
              {([
                ['matches', 'Partidos', <ListChecks key="i" className="h-4 w-4" />],
                ['mybets', 'Mis apuestas', <History key="i" className="h-4 w-4" />],
                ['results', 'Resultados', <Trophy key="i" className="h-4 w-4" />],
                ['rules', 'Cómo funciona', <Info key="i" className="h-4 w-4" />],
              ] as [Tab, string, JSX.Element][]).map(([k, label, icon]) => (
                <button key={k} type="button" onClick={() => setTab(k)}
                  className={`relative inline-flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center text-[11px] font-semibold leading-tight transition-all sm:flex-row sm:gap-1.5 sm:whitespace-nowrap sm:px-3 sm:py-2 sm:text-sm ${
                    tab === k ? 'bg-gradient-to-b from-amber-500 to-amber-700 text-white shadow-lg' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}>
                  {icon} {label}
                  {k === 'mybets' && num(lobby.my_open.count) > 0 && (
                    <span className={`absolute right-1 top-1 rounded-full px-1.5 text-[10px] font-black leading-4 sm:static ${tab === k ? 'bg-white text-amber-800' : 'bg-amber-500 text-white'}`}>{lobby.my_open.count}</span>
                  )}
                </button>
              ))}
            </nav>

            {tab === 'matches' && (
              <div ref={listRef} className="scroll-mt-4 space-y-4">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button type="button" onClick={() => pickLeague('ALL')}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition-all ${league === 'ALL' ? 'bg-white text-amber-950 ring-white' : 'bg-black/40 text-white/70 ring-white/10 hover:text-white'}`}>
                    Todas <span className="opacity-60">({lobby.matches.length})</span>
                  </button>
                  {leagues.map((l) => (
                    <button key={l.code} type="button" onClick={() => pickLeague(l.code)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition-all ${league === l.code ? 'bg-white text-amber-950 ring-white' : 'bg-black/40 text-white/70 ring-white/10 hover:text-white'}`}>
                      {l.emblem ? <img src={imgUrl(l.emblem) ?? undefined} alt="" referrerPolicy="no-referrer" className="h-4 w-4 object-contain" /> : <span>{LEAGUES[l.code]?.icon ?? '⚽'}</span>}
                      {LEAGUES[l.code]?.name ?? l.code} <span className="opacity-60">({l.count})</span>
                    </button>
                  ))}
                </div>

                {days.length > 0 && (
                  <div className="-mt-1 flex items-stretch gap-2 overflow-x-auto pb-1 pr-1 pt-2">
                    <button type="button" onClick={() => pickDay('ALL')}
                      className={`flex shrink-0 flex-col items-center justify-center rounded-xl px-3 py-1.5 ring-1 transition-all ${activeDay === 'ALL' ? 'bg-amber-500 text-white ring-amber-300 shadow-lg' : 'bg-black/40 text-white/70 ring-white/10 hover:text-white'}`}>
                      <CalendarDays className="h-4 w-4" />
                      <span className="text-[11px] font-bold">Todos</span>
                    </button>
                    {days.map((d) => {
                      const c = dayChip(d.key, nowSrv);
                      const on = activeDay === d.key;
                      return (
                        <button key={d.key} type="button" onClick={() => pickDay(d.key)}
                          className={`relative flex min-w-[64px] shrink-0 flex-col items-center justify-center rounded-xl px-3 py-1.5 ring-1 transition-all ${on ? 'bg-amber-500 text-white ring-amber-300 shadow-lg' : 'bg-black/40 text-white/70 ring-white/10 hover:text-white'}`}>
                          <span className="text-[11px] font-black uppercase tracking-wider">{c.top}</span>
                          <span className="text-xs font-semibold opacity-80">{c.bottom}</span>
                          <span className={`absolute -right-1 -top-1 rounded-full px-1.5 text-[10px] font-bold ${on ? 'bg-white text-amber-800' : 'bg-amber-600 text-white'}`}>{d.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {liveMatches.length > 0 && (
                  <div>
                    <h2 className="mb-2 inline-flex items-center gap-2 text-sm font-black uppercase tracking-wider text-red-300">
                      <span className="h-2 w-2 rounded-full bg-red-500 sp-anim [animation:spLive_1.4s_ease-in-out_infinite]" /> En vivo
                    </h2>
                    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]">
                      {liveMatches.map((m) => (
                        <MatchCard key={m.id} m={m} cfg={cfg} nowSrv={nowSrv} canBet={canBet} isAdmin={isAdmin} onPick={openSlip} onAdmin={adminAction} />
                      ))}
                    </div>
                  </div>
                )}

                {groups.map((g) => (
                  <div key={g.label}>
                    <h2 className="sticky top-0 z-10 mb-2 inline-block rounded-full bg-black/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200 backdrop-blur">
                      {g.label}
                    </h2>
                    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]">
                      {g.items.map((m) => (
                        <MatchCard key={m.id} m={m} cfg={cfg} nowSrv={nowSrv} canBet={canBet} isAdmin={isAdmin} onPick={openSlip} onAdmin={adminAction} />
                      ))}
                    </div>
                  </div>
                ))}

                {pages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button type="button" disabled={curPage === 0} onClick={() => goPage(curPage - 1)}
                      className="inline-flex items-center gap-1 rounded-xl bg-black/40 px-3 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/10 transition-all hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </button>
                    {Array.from({ length: pages }).map((_, i) => (
                      <button key={i} type="button" onClick={() => goPage(i)} aria-current={i === curPage ? 'page' : undefined}
                        className={`h-9 min-w-[36px] rounded-xl px-2 text-sm font-bold ring-1 transition-all ${i === curPage ? 'bg-white text-amber-950 ring-white' : 'bg-black/40 text-white/70 ring-white/10 hover:text-white'}`}>
                        {i + 1}
                      </button>
                    ))}
                    <button type="button" disabled={curPage >= pages - 1} onClick={() => goPage(curPage + 1)}
                      className="inline-flex items-center gap-1 rounded-xl bg-black/40 px-3 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/10 transition-all hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                      Siguiente <ChevronRight className="h-4 w-4" />
                    </button>
                    <span className="w-full text-center text-xs text-white/40">
                      Mostrando {curPage * PAGE_SIZE + 1}–{Math.min((curPage + 1) * PAGE_SIZE, dayFiltered.length)} de {dayFiltered.length} partidos
                    </span>
                  </div>
                )}

                {visible.length === 0 && (cfg.ready || isAdmin) && (
                  <Empty icon="🗓️" title="No hay partidos disponibles" text={cfg.ready ? 'Los próximos partidos de las grandes ligas aparecerán aquí automáticamente.' : 'Configura el token de la API en el panel de administración.'} />
                )}
              </div>
            )}

            {tab === 'mybets' && <MyBetsList bets={myBets} loading={myBetsLoading} error={myBetsError} onRetry={loadMyBets} />}
            {tab === 'results' && <ResultsList results={lobby.results} />}
            {tab === 'rules' && <Rules cfg={cfg} />}
          </>
        )}
      </div>

      {slip && slipMatch && cfg && (
        <BetSlip
          m={slipMatch}
          pick={slip.pick}
          cfg={cfg}
          balance={balance}
          onPickChange={(p) => setSlip((s) => (s ? { ...s, pick: p } : s))}
          onClose={() => setSlip(null)}
          onPlaced={onPlaced}
        />
      )}

      {celebrate && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setCelebrate(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-amber-400/40 bg-gradient-to-b from-amber-800/80 to-[#0d0903] p-6 text-center shadow-[0_0_80px_-10px_rgba(245,158,11,0.9)] [animation:spPop_.35s_ease-out]">
            <div className="text-6xl sp-anim [animation:spBall_1.2s_ease-in-out_infinite]">⚽</div>
            <div className="mt-2 text-4xl font-black uppercase text-amber-200 sp-anim [animation:spGlow_1.5s_ease-in-out_infinite]">¡Golazo!</div>
            <p className="mt-1 text-sm text-white/70">Has ganado tus apuestas</p>
            <div className="mt-4 max-h-[40vh] space-y-2 overflow-y-auto">
              {celebrate.map((w) => (
                <div key={w.id} className="rounded-xl bg-black/40 px-3 py-2 text-sm">
                  <div className="truncate text-white/80">{teamShort(w, 'home')} {w.score_home}-{w.score_away} {teamShort(w, 'away')}</div>
                  <div className="font-mono text-lg font-black text-amber-300">+{fmt(num(w.my_paid) - num(w.my_staked))} TUNG</div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setCelebrate(null)}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 py-3 font-black uppercase text-amber-950 hover:brightness-110">
              ¡Cobrar!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
