import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Bot, Clock, Coins, Copy, Crosshair, Flag, GraduationCap, History, KeyRound, Loader2, Lock, RotateCw, Shield, Shuffle, Swords, Trash2, Trophy, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { BATTLESHIP_COORDS } from '../../lib/casino';
import { bsSfx } from '../../lib/battleshipSfx';
import { SoundToggle } from '../../components/game/SoundToggle';
import { CasinoLeaderboard } from '../../components/game/CasinoLeaderboard';
import { BattleshipTournaments } from '../../components/game/BattleshipTournaments';

// ─── Tipos ───────────────────────────────────────────
type Dir = 'h' | 'v';
type ShipCode = 'deathstar' | 'battlecruiser' | 'cruiser' | 'destroyer' | 'light_fighter' | 'espionage_probe';
type Status = 'waiting' | 'placing' | 'battle' | 'finished' | 'cancelled';

interface Ship { code: ShipCode; size: number; x: number; y: number; dir: Dir; cells: number[] }
interface Shot { id: number; cell: number; hit: boolean; sunk: ShipCode | null; auto: boolean }
interface Room { id: string; username: string | null; stake: number; stake_usd: number | null; created_at: string; mine: boolean }
interface HistoryRow { id: string; opponent: string | null; stake: number; stake_usd: number | null; pot: number; status: Status; result: 'win' | 'loss' | 'refunded'; end_reason: string | null; finished_at: string | null }
interface WinRow { winner: string | null; loser: string | null; pot: number; end_reason: string | null; finished_at: string }
interface AdminInfo { pool_pending: number; total_matches: number; total_wagered: number; total_fees: number; total_paid: number; waiting: number }
interface Lobby {
  enabled: boolean; min_stake: number; max_stake: number; tung_price: number | null; fee_pct: number; payout_mult: number;
  gate_error: string | null; balance: number; active_match: string | null; live_matches: number;
  rooms: Room[]; history: HistoryRow[]; recent_wins: WinRow[]; admin: AdminInfo | null;
  daily_pool?: number; daily_pool_split?: number[]; daily_pool_next?: string | null; daily_pool_last_day?: string | null;
  daily_pool_last?: { rank: number; username: string | null; wins: number; amount: number }[] | null;
}
interface Practice {
  token: number; status: 'placing' | 'battle' | 'finished'; myTurn: boolean; version: number; nextId: number;
  botShips: Ship[]; myShips: Ship[] | null; myShots: Shot[]; botShots: Shot[];
  winner: 'me' | 'opp' | null; endReason: string | null;
}
interface MatchState {
  success: boolean; error?: string; id: string; status: Status; is_private: boolean; code: string | null;
  stake: number; stake_usd: number | null; pot: number; me: 1 | 2; my_name: string | null; opp_name: string | null;
  my_ready: boolean; opp_ready: boolean; my_turn: boolean; deadline: string | null; server_time: string;
  my_timeouts: number; opp_timeouts: number; my_hits: number; opp_hits: number;
  my_fleet: Ship[] | null; my_shots: Shot[]; opp_shots: Shot[]; opp_sunk: Ship[]; opp_fleet: Ship[] | null;
  winner: 'me' | 'opp' | null; end_reason: string | null; payout: number; version: number;
  tournament_id?: string | null; tournament_name?: string | null; round_name?: string | null;
}
interface Fx { key: string; cell: number; hit: boolean; sunk: boolean; incoming: boolean }
interface Banner { key: number; title: string; sub: string; img: string; tone: 'good' | 'bad' | 'info' }
type Layout = Partial<Record<ShipCode, { x: number; y: number; dir: Dir }>>;

// ─── Constantes ──────────────────────────────────────
const FLEET: { code: ShipCode; size: number; name: string; img: string }[] = [
  { code: 'deathstar', size: 5, name: 'Estrella de la Muerte', img: '/Imagenes/Naves/Estrellas de la muerte.png' },
  { code: 'battlecruiser', size: 4, name: 'Acorazado', img: '/Imagenes/Naves/Acorazados.webp' },
  { code: 'cruiser', size: 3, name: 'Crucero', img: '/Imagenes/Naves/Crucerors Ligeros.webp' },
  { code: 'destroyer', size: 3, name: 'Destructor', img: '/Imagenes/Naves/Destructores.webp' },
  { code: 'light_fighter', size: 2, name: 'Cazador Ligero', img: '/Imagenes/Naves/Cazadores ligeros.webp' },
  { code: 'espionage_probe', size: 1, name: 'Sonda de Espionaje', img: '/Imagenes/Naves/Sondas de espionaje.webp' },
];
const SHIP = Object.fromEntries(FLEET.map((f) => [f.code, f])) as Record<ShipCode, (typeof FLEET)[number]>;
const TOTAL_CELLS = FLEET.reduce((s, f) => s + f.size, 0);
const COLS = 'ABCDEFGHIJ';
const TURN_SECONDS = 30;
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const CHIPS = [0.1, 0.5, 1, 5, 10, 50];
const REASONS: Record<string, string> = {
  fleet_destroyed: 'Flota enemiga destruida',
  timeout: 'Inactividad (3 turnos sin disparar)',
  surrender: 'Rendición',
  cancelled: 'Sala cancelada',
  expired: 'Sala expirada',
};

const fmt = (v: number | undefined | null, d = 2) =>
  Number(v ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d });
const usd = (v: number | undefined | null) =>
  `$${Number(v ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toTung = (u: number, price: number | null | undefined) => (price && price > 0 ? Math.ceil((u / price) * 100) / 100 : null);
const imgUrl = (p: string) => encodeURI(p);
const cellName = (c: number) => `${COLS[c % 10]}${Math.floor(c / 10) + 1}`;

function shipCells(x: number, y: number, dir: Dir, size: number): number[] | null {
  if (x < 0 || y < 0 || x > 9 || y > 9) return null;
  if (dir === 'h' && x + size > 10) return null;
  if (dir === 'v' && y + size > 10) return null;
  return Array.from({ length: size }, (_, i) => (dir === 'h' ? y * 10 + x + i : (y + i) * 10 + x));
}

function layoutShips(layout: Layout): Ship[] {
  const out: Ship[] = [];
  for (const f of FLEET) {
    const p = layout[f.code];
    if (!p) continue;
    const cells = shipCells(p.x, p.y, p.dir, f.size);
    if (cells) out.push({ code: f.code, size: f.size, x: p.x, y: p.y, dir: p.dir, cells });
  }
  return out;
}

function randomLayout(): Layout {
  for (let attempt = 0; attempt < 50; attempt++) {
    const used = new Set<number>();
    const out: Layout = {};
    let ok = true;
    for (const f of FLEET) {
      let placed = false;
      for (let t = 0; t < 500 && !placed; t++) {
        const dir: Dir = Math.random() < 0.5 ? 'h' : 'v';
        const x = Math.floor(Math.random() * 10);
        const y = Math.floor(Math.random() * 10);
        const cells = shipCells(x, y, dir, f.size);
        if (cells && cells.every((c) => !used.has(c))) {
          cells.forEach((c) => used.add(c));
          out[f.code] = { x, y, dir };
          placed = true;
        }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return out;
  }
  return {};
}

// ─── Modo práctica (100% local, sin apuesta) ─────────
const PRACTICE_ID = 'practice';
const MEDALS = ['🥇', '🥈', '🥉', '4º', '5º'];
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function sunkShips(fleet: Ship[], shots: Shot[]): Ship[] {
  const hits = new Set(shots.filter((s) => s.hit).map((s) => s.cell));
  return fleet.filter((sh) => sh.cells.every((c) => hits.has(c)));
}

function resolveShot(fleet: Ship[], shots: Shot[], cell: number, id: number): Shot {
  const ship = fleet.find((sh) => sh.cells.includes(cell));
  if (!ship) return { id, cell, hit: false, sunk: null, auto: false };
  const hits = new Set(shots.filter((s) => s.hit).map((s) => s.cell));
  hits.add(cell);
  return { id, cell, hit: true, sunk: ship.cells.every((c) => hits.has(c)) ? ship.code : null, auto: false };
}

// IA: caza en damero y, tras un impacto, remata la nave siguiendo la línea
function botPick(shots: Shot[], fleet: Ship[]): number {
  const shot = new Set(shots.map((s) => s.cell));
  const sunkCells = new Set(sunkShips(fleet, shots).flatMap((s) => s.cells));
  const open = new Set(shots.filter((s) => s.hit && !sunkCells.has(s.cell)).map((s) => s.cell));
  const free = (c: number) => c >= 0 && c < 100 && !shot.has(c);
  if (open.size) {
    const line: number[] = [];
    for (const c of open) {
      const x = c % 10;
      if ((x > 0 && open.has(c - 1)) || (x < 9 && open.has(c + 1))) {
        let l = c; while (l % 10 > 0 && open.has(l - 1)) l--;
        let r = c; while (r % 10 < 9 && open.has(r + 1)) r++;
        if (l % 10 > 0 && free(l - 1)) line.push(l - 1);
        if (r % 10 < 9 && free(r + 1)) line.push(r + 1);
      }
      if (open.has(c - 10) || open.has(c + 10)) {
        let u = c; while (open.has(u - 10)) u -= 10;
        let d = c; while (open.has(d + 10)) d += 10;
        if (free(u - 10)) line.push(u - 10);
        if (free(d + 10)) line.push(d + 10);
      }
    }
    if (line.length) return pick(line);
    const adj = [...open].flatMap((c) => [c % 10 > 0 ? c - 1 : -1, c % 10 < 9 ? c + 1 : -1, c - 10, c + 10]).filter(free);
    if (adj.length) return pick(adj);
  }
  const all = Array.from({ length: 100 }, (_, i) => i).filter(free);
  const parity = all.filter((c) => ((c % 10) + Math.floor(c / 10)) % 2 === 0);
  return pick(parity.length && Math.random() > 0.15 ? parity : all);
}

function practiceView(p: Practice): MatchState {
  return {
    success: true, id: PRACTICE_ID, status: p.status, is_private: false, code: null,
    stake: 0, stake_usd: null, pot: 0, me: 1, my_name: null, opp_name: 'IA de Entrenamiento',
    my_ready: !!p.myShips, opp_ready: true, my_turn: p.status === 'battle' && p.myTurn, deadline: null,
    server_time: new Date().toISOString(), my_timeouts: 0, opp_timeouts: 0,
    my_hits: p.myShots.filter((s) => s.hit).length, opp_hits: p.botShots.filter((s) => s.hit).length,
    my_fleet: p.myShips, my_shots: [...p.myShots], opp_shots: [...p.botShots], opp_sunk: sunkShips(p.botShips, p.myShots),
    opp_fleet: p.status === 'finished' ? p.botShips : null, winner: p.winner, end_reason: p.endReason, payout: 0, version: p.version,
  };
}

async function rpc<T = Record<string, unknown>>(fn: string, args?: Record<string, unknown>): Promise<T & { success?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { success: false, error: 'Error de conexión, inténtalo de nuevo' } as T & { success: boolean; error: string };
  return (data ?? { success: false, error: 'Sin respuesta' }) as T & { success?: boolean; error?: string };
}

// ─── Fondo espacial (estrellas fijas) ────────────────
function useStars(n: number, seed: number) {
  return useMemo(() => {
    let s = seed;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    return Array.from({ length: n }, (_, i) => ({ i, x: r() * 100, y: r() * 100, size: r() * 1.6 + 0.4, o: r() * 0.6 + 0.2, d: r() * 4 }));
  }, [n, seed]);
}

// ─── Sprite de nave sobre el tablero ─────────────────
function ShipSprite({ ship, variant }: { ship: Pick<Ship, 'code' | 'size' | 'x' | 'y' | 'dir'>; variant: 'own' | 'wreck' | 'reveal' | 'ghost' | 'ghost-bad' }) {
  const info = SHIP[ship.code];
  const box: CSSProperties = {
    left: `${ship.x * 10}%`,
    top: `${ship.y * 10}%`,
    width: `${(ship.dir === 'h' ? ship.size : 1) * 10}%`,
    height: `${(ship.dir === 'v' ? ship.size : 1) * 10}%`,
  };
  const filter =
    variant === 'wreck' ? 'grayscale(0.7) sepia(0.6) hue-rotate(-35deg) brightness(0.55) drop-shadow(0 0 6px rgba(239,68,68,0.6))'
      : variant === 'reveal' ? 'grayscale(0.3) brightness(0.8) drop-shadow(0 0 6px rgba(244,114,182,0.55))'
        : variant === 'ghost-bad' ? 'grayscale(1) brightness(0.7) drop-shadow(0 0 6px rgba(239,68,68,0.9))'
          : 'drop-shadow(0 0 6px rgba(56,189,248,0.7))';
  const frame =
    variant === 'own' ? 'border-sky-400/40 bg-sky-500/10'
      : variant === 'wreck' ? 'border-red-500/50 bg-red-900/25'
        : variant === 'reveal' ? 'border-pink-400/40 bg-pink-500/10 border-dashed'
          : variant === 'ghost-bad' ? 'border-red-500/70 bg-red-500/20'
            : 'border-emerald-400/70 bg-emerald-400/15';
  const imgStyle: CSSProperties =
    ship.dir === 'h'
      ? { position: 'absolute', inset: '6%', width: '88%', height: '88%', objectFit: 'contain', filter }
      : {
        position: 'absolute', left: '50%', top: '50%', width: `${ship.size * 88}%`, height: `${88 / ship.size}%`,
        transform: 'translate(-50%, -50%) rotate(90deg)', objectFit: 'contain', filter,
      };
  return (
    <div className={`absolute pointer-events-none rounded-md border ${frame} ${variant.startsWith('ghost') ? 'opacity-80' : ''}`} style={box}>
      <img src={imgUrl(info.img)} alt={info.name} draggable={false} style={imgStyle} />
    </div>
  );
}

// ─── Tablero 10x10 estilo galaxia ────────────────────
interface BoardProps {
  title: string;
  subtitle?: string;
  tone: 'ally' | 'enemy';
  ships: { ship: Ship; variant: 'own' | 'wreck' | 'reveal' | 'ghost' | 'ghost-bad' }[];
  shots: Shot[];
  fx: Fx[];
  active?: boolean;
  shake?: boolean;
  canClick?: (cell: number) => boolean;
  onCell?: (cell: number) => void;
  onHover?: (cell: number | null) => void;
  seed: number;
}

function Board({ title, subtitle, tone, ships, shots, fx, active, shake, canClick, onCell, onHover, seed }: BoardProps) {
  const stars = useStars(45, seed);
  return (
    <div className={`w-full min-w-0 max-w-[460px] mx-auto ${shake && !REDUCED_MOTION ? 'bs-shake' : ''}`}>
      <div className="flex items-end justify-between gap-2 mb-2 px-1">
        <div className="min-w-0">
          <h3 className={`font-orbitron text-xs sm:text-sm tracking-wider truncate ${tone === 'ally' ? 'text-sky-300' : 'text-rose-300'}`}>{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 break-words">{subtitle}</p>}
        </div>
        {active && (
          <span className={`shrink-0 text-[10px] font-orbitron px-2 py-0.5 rounded-full border animate-pulse ${tone === 'ally' ? 'border-sky-400/50 text-sky-200 bg-sky-500/10' : 'border-rose-400/50 text-rose-200 bg-rose-500/10'}`}>
            {tone === 'ally' ? 'EN ALERTA' : 'OBJETIVO'}
          </span>
        )}
      </div>
      <div className="flex">
        <div className="grid w-4 sm:w-5 mr-0.5 sm:mr-1 mt-5 text-[9px] text-slate-500 font-mono shrink-0" style={{ gridTemplateRows: 'repeat(10, minmax(0, 1fr))' }}>
          {Array.from({ length: 10 }, (_, i) => <span key={i} className="flex items-center justify-end pr-0.5">{i + 1}</span>)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-10 h-5 text-[9px] text-slate-500 font-mono">
            {COLS.split('').map((c) => <span key={c} className="flex items-center justify-center">{c}</span>)}
          </div>
          <div
            className={`relative aspect-square w-full rounded-lg overflow-hidden border ${active ? (tone === 'ally' ? 'border-sky-400/70 shadow-[0_0_25px_rgba(56,189,248,0.35)]' : 'border-rose-400/70 shadow-[0_0_25px_rgba(244,63,94,0.35)]') : 'border-slate-700/70'} transition-shadow`}
            style={{
              background:
                'radial-gradient(ellipse at 18% 28%, rgba(99,102,241,0.28), transparent 55%), radial-gradient(ellipse at 82% 72%, rgba(14,165,233,0.22), transparent 55%), radial-gradient(ellipse at 62% 8%, rgba(217,70,239,0.14), transparent 50%), #050914',
            }}
            onMouseLeave={() => onHover?.(null)}
          >
            {/* estrellas */}
            {stars.map((s) => (
              <span key={s.i} className="absolute rounded-full bg-white bs-anim" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, opacity: s.o, animation: `bs-twinkle ${3 + s.d}s ease-in-out ${s.d}s infinite` }} />
            ))}
            {/* rejilla */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: tone === 'ally'
                ? 'linear-gradient(rgba(56,189,248,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.16) 1px, transparent 1px)'
                : 'linear-gradient(rgba(244,63,94,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(244,63,94,0.16) 1px, transparent 1px)',
              backgroundSize: '10% 10%',
            }} />
            {active && !REDUCED_MOTION && <div className={`absolute inset-x-0 h-1/3 pointer-events-none bs-scan ${tone === 'ally' ? 'bg-gradient-to-b from-transparent via-sky-400/10 to-transparent' : 'bg-gradient-to-b from-transparent via-rose-400/10 to-transparent'}`} />}

            {/* naves */}
            {ships.map(({ ship, variant }) => <ShipSprite key={`${ship.code}-${variant}`} ship={ship} variant={variant} />)}

            {/* marcas de disparos */}
            {shots.map((s) => {
              const x = s.cell % 10, y = Math.floor(s.cell / 10);
              return (
                <div key={s.id} className="absolute flex items-center justify-center pointer-events-none" style={{ left: `${x * 10}%`, top: `${y * 10}%`, width: '10%', height: '10%' }}>
                  {s.hit ? (
                    <span className="relative w-[62%] h-[62%]">
                      <span className="absolute inset-0 rounded-full bs-anim" style={{ background: 'radial-gradient(circle, #fde68a 0%, #f97316 40%, rgba(220,38,38,0.85) 65%, transparent 72%)', animation: 'bs-fire 0.9s ease-in-out infinite', boxShadow: '0 0 10px rgba(249,115,22,0.9)' }} />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-red-950">✕</span>
                    </span>
                  ) : (
                    <span className="w-[26%] h-[26%] rounded-full border border-cyan-200/50 bg-cyan-200/25" />
                  )}
                  {s.auto && <span className="absolute top-0 right-0.5 text-[7px] text-amber-300/80 font-mono">A</span>}
                </div>
              );
            })}

            {/* efectos */}
            {!REDUCED_MOTION && fx.map((f) => {
              const x = f.cell % 10, y = Math.floor(f.cell / 10);
              const beamColor = f.incoming ? 'rgba(244,63,94,' : 'rgba(56,189,248,';
              return (
                <div key={f.key} className="absolute inset-0 pointer-events-none">
                  <div className="absolute" style={{
                    left: `calc(${x * 10 + 5}% - 2px)`, top: 0, width: 4, height: `${y * 10 + 5}%`, transformOrigin: 'top',
                    background: `linear-gradient(180deg, ${beamColor}0), ${beamColor}0.9) 70%, #fff)`, boxShadow: `0 0 10px ${beamColor}0.9)`,
                    animation: 'bs-beam 0.55s ease-out forwards',
                  }} />
                  {f.hit ? (
                    <>
                      <div className="absolute rounded-full" style={{ left: `${x * 10 + 5}%`, top: `${y * 10 + 5}%`, width: f.sunk ? '30%' : '16%', aspectRatio: '1', background: 'radial-gradient(circle, #fff 0%, #fde047 25%, #f97316 50%, rgba(220,38,38,0.6) 70%, transparent 75%)', animation: 'bs-boom 0.95s ease-out forwards' }} />
                      {Array.from({ length: f.sunk ? 14 : 8 }, (_, i) => (
                        <span key={i} className="absolute" style={{
                          left: `${x * 10 + 5}%`, top: `${y * 10 + 5}%`, width: 6, height: 2, borderRadius: 2, background: i % 2 ? '#fde047' : '#fb923c',
                          transformOrigin: '0 50%', ['--a' as string]: `${(360 / (f.sunk ? 14 : 8)) * i}deg`, ['--d' as string]: f.sunk ? '70px' : '38px',
                          animation: 'bs-spark 0.9s ease-out forwards',
                        } as CSSProperties} />
                      ))}
                    </>
                  ) : (
                    <div className="absolute rounded-full border-2 border-cyan-300" style={{ left: `${x * 10 + 5}%`, top: `${y * 10 + 5}%`, width: '14%', aspectRatio: '1', animation: 'bs-ring 0.9s ease-out forwards' }} />
                  )}
                </div>
              );
            })}

            {/* capa de clic */}
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gridTemplateRows: 'repeat(10, minmax(0, 1fr))' }}>
              {Array.from({ length: 100 }, (_, c) => {
                const clickable = !!onCell && (canClick ? canClick(c) : true);
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={!clickable}
                    aria-label={`Casilla ${cellName(c)}`}
                    onMouseEnter={() => onHover?.(c)}
                    onClick={() => clickable && onCell?.(c)}
                    className={`focus:outline-none ${clickable ? (tone === 'enemy' ? 'cursor-crosshair hover:bg-rose-400/20 hover:shadow-[inset_0_0_0_1px_rgba(251,113,133,0.8)]' : 'cursor-pointer hover:bg-sky-400/15') : 'cursor-default'}`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Temporizador circular ───────────────────────────
function TurnRing({ remaining, total, mine }: { remaining: number; total: number; mine: boolean }) {
  const pct = Math.max(0, Math.min(1, remaining / total));
  const r = 22, c = 2 * Math.PI * r;
  const danger = remaining <= 10;
  const color = danger ? '#f43f5e' : mine ? '#38bdf8' : '#a78bfa';
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
        <circle cx="28" cy="28" r={r} stroke="rgba(148,163,184,0.2)" strokeWidth="4" fill="none" />
        <circle cx="28" cy="28" r={r} stroke={color} strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.25s linear', filter: `drop-shadow(0 0 4px ${color})` }} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-orbitron text-sm ${danger ? 'text-rose-300 animate-pulse' : 'text-white'}`}>{Math.ceil(remaining)}</span>
    </div>
  );
}

// ─── Salto hiperespacial ─────────────────────────────
function Hyperspace({ onDone }: { onDone: () => void }) {
  const streaks = useMemo(() => Array.from({ length: 110 }, (_, i) => ({ i, a: Math.random() * 360, delay: Math.random() * 0.9, w: 8 + Math.random() * 22 })), []);
  useEffect(() => {
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-[200] bg-black overflow-hidden cursor-pointer" style={{ animation: 'bs-warpout 1.9s ease-in forwards' }} onClick={onDone}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(56,189,248,0.25), rgba(30,27,75,0.4) 35%, #000 70%)' }} />
      {streaks.map((s) => (
        <span key={s.i} className="bs-streak" style={{ ['--a' as string]: `${s.a}deg`, width: `${s.w}vmax`, animationDelay: `${s.delay}s` } as CSSProperties} />
      ))}
      <div className="absolute inset-0 bg-white pointer-events-none" style={{ animation: 'bs-warpflash 1.9s ease-in forwards' }} />
      <div className="absolute inset-x-0 bottom-[18%] px-4 text-center pointer-events-none">
        <p className="font-orbitron text-sky-200 tracking-[0.25em] sm:tracking-[0.4em] text-xs sm:text-base drop-shadow-[0_0_8px_rgba(56,189,248,0.9)]">SALTO HIPERESPACIAL</p>
        <p className="text-slate-400 text-xs mt-1">Destino [{BATTLESHIP_COORDS.galaxy}:{BATTLESHIP_COORDS.system}:{BATTLESHIP_COORDS.position}] · Batalla de Naves</p>
      </div>
    </div>
  );
}

// ─── Pagina ──────────────────────────────────────────
export function BattleshipPage() {
  const { fetchProfile } = useAuthStore();
  const location = useLocation();
  const [warp, setWarp] = useState<boolean>(() => !REDUCED_MOTION && !!(location.state as { hyperspace?: boolean } | null)?.hyperspace);
  const endWarp = useCallback(() => setWarp(false), []);

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [practice, setPractice] = useState(false);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [stake, setStake] = useState('0.10');
  const [joinCode, setJoinCode] = useState('');
  const [adminValue, setAdminValue] = useState('');
  const [tab, setTab] = useState<'duelos' | 'torneos'>(() => (new URLSearchParams(location.search).get('tab') === 'torneos' ? 'torneos' : 'duelos'));

  // despliegue
  const [layout, setLayout] = useState<Layout>({});
  const [selected, setSelected] = useState<ShipCode | null>('deathstar');
  const [dir, setDir] = useState<Dir>('h');
  const [hover, setHover] = useState<number | null>(null);

  // efectos
  const [fx, setFx] = useState<Fx[]>([]);
  const [shakeMine, setShakeMine] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [firing, setFiring] = useState(false);
  const [aimCell, setAimCell] = useState<number | null>(null);
  const [hideResult, setHideResult] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const matchRef = useRef<MatchState | null>(null);
  const seenShots = useRef<Set<number>>(new Set());
  const offsetRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dismissedRef = useRef<string | null>(null);
  const practiceRef = useRef<Practice | null>(null);
  const practiceToken = useRef(0);

  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  const flash = useCallback((type: 'ok' | 'error', text: string) => {
    setMessage({ type, text });
    timers.current.push(setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 5000));
  }, []);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // ── Lobby ──
  const loadLobby = useCallback(async () => {
    const d = await rpc<Lobby>('battleship_lobby');
    if (d.success === false) {
      setMessage({ type: 'error', text: d.error || 'No se pudo cargar la Batalla de Naves' });
    } else {
      setLobby(d);
      if (d.active_match && dismissedRef.current !== d.active_match && !practiceRef.current) setMatchId((cur) => cur ?? d.active_match);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (matchId || practice) return;
    loadLobby();
    const i = setInterval(() => { if (document.visibilityState === 'visible') loadLobby(); }, 6000);
    return () => clearInterval(i);
  }, [matchId, practice, loadLobby]);

  // ── Partida ──
  const applyState = useCallback((s: MatchState, receivedAt: number) => {
    const prev = matchRef.current;
    if (prev && prev.id === s.id && s.version < prev.version) return;
    offsetRef.current = Date.parse(s.server_time) - receivedAt;

    const isNewMatch = !prev || prev.id !== s.id;
    if (isNewMatch) {
      seenShots.current = new Set([...s.my_shots, ...s.opp_shots].map((x) => x.id));
    } else {
      const newFx: Fx[] = [];
      let incomingHit = false;
      let bannerNext: Banner | null = null;
      const rank = { none: 0, miss: 1, hit: 2, sunk: 3 } as const;
      let mySfx: keyof typeof rank = 'none';
      let oppSfx: keyof typeof rank = 'none';
      const shotRes = (sh: Shot) => (sh.sunk ? 'sunk' : sh.hit ? 'hit' : 'miss') as 'sunk' | 'hit' | 'miss';
      for (const sh of s.my_shots) {
        if (seenShots.current.has(sh.id)) continue;
        seenShots.current.add(sh.id);
        newFx.push({ key: `m${sh.id}`, cell: sh.cell, hit: sh.hit, sunk: !!sh.sunk, incoming: false });
        if (rank[shotRes(sh)] > rank[mySfx]) mySfx = shotRes(sh);
        if (sh.sunk) bannerNext = { key: sh.id, title: '¡NAVE ENEMIGA HUNDIDA!', sub: SHIP[sh.sunk].name, img: SHIP[sh.sunk].img, tone: 'good' };
      }
      for (const sh of s.opp_shots) {
        if (seenShots.current.has(sh.id)) continue;
        seenShots.current.add(sh.id);
        newFx.push({ key: `o${sh.id}`, cell: sh.cell, hit: sh.hit, sunk: !!sh.sunk, incoming: true });
        if (rank[shotRes(sh)] > rank[oppSfx]) oppSfx = shotRes(sh);
        if (sh.hit) incomingHit = true;
        if (sh.sunk) bannerNext = { key: sh.id, title: '¡HAN HUNDIDO TU NAVE!', sub: SHIP[sh.sunk].name, img: SHIP[sh.sunk].img, tone: 'bad' };
      }
      if (mySfx !== 'none') bsSfx.shot(false, mySfx);
      if (oppSfx !== 'none') bsSfx.shot(true, oppSfx);
      if (newFx.length) {
        setFx((f) => [...f, ...newFx]);
        later(() => setFx((f) => f.filter((x) => !newFx.some((n) => n.key === x.key))), 1100);
      }
      if (incomingHit) {
        setShakeMine(true);
        later(() => setShakeMine(false), 550);
      }
      if (bannerNext) {
        const b = bannerNext;
        setBanner(b);
        later(() => setBanner((cur) => (cur?.key === b.key ? null : cur)), 2400);
      }
      if (s.my_timeouts > prev.my_timeouts && s.status === 'battle') {
        flash('error', `Se agotó tu tiempo: disparo automático (${s.my_timeouts}/3). A los 3 pierdes la partida.`);
      }
      if (prev.status === 'placing' && s.status === 'battle') {
        const b: Banner = { key: -1, title: '¡COMIENZA LA BATALLA!', sub: s.my_turn ? 'Disparas primero' : 'El rival dispara primero', img: SHIP.deathstar.img, tone: 'info' };
        setBanner(b);
        later(() => setBanner((cur) => (cur?.key === -1 ? null : cur)), 2000);
        bsSfx.battleStart();
      }
      if (prev.status !== s.status && (s.status === 'finished' || s.status === 'cancelled') && s.id !== PRACTICE_ID) fetchProfile();
      if (prev.status !== 'finished' && s.status === 'finished' && s.winner) bsSfx.end(s.winner === 'me', newFx.length ? 1.5 : 0);
      if (prev.status === 'waiting' && s.status === 'placing') { fetchProfile(); bsSfx.opponentJoined(); }
    }
    if (isNewMatch || (prev && prev.status !== 'placing' && s.status === 'placing')) {
      setLayout({});
      setSelected('deathstar');
      setDir('h');
    }
    matchRef.current = s;
    setMatch(s);
  }, [fetchProfile, flash]);

  const loadState = useCallback(async (id: string): Promise<MatchState | null> => {
    const d = await rpc<MatchState>('battleship_state', { p_match_id: id });
    if (!d.success) {
      if (d.error === 'Partida no encontrada') {
        setMatchId(null);
        matchRef.current = null;
        setMatch(null);
      }
      return null;
    }
    applyState(d, Date.now());
    return d;
  }, [applyState]);

  useEffect(() => {
    if (!matchId) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stop) return;
      const s = await loadState(matchId);
      if (stop) return;
      const done = s && (s.status === 'finished' || s.status === 'cancelled');
      if (!done) t = setTimeout(tick, !s ? 3000 : s.status === 'battle' ? 1200 : s.status === 'waiting' ? 2000 : 1500);
    };
    tick();
    return () => { stop = true; if (t) clearTimeout(t); };
  }, [matchId, loadState]);

  const live = !!match && (match.status === 'waiting' || match.status === 'placing' || match.status === 'battle');
  const inLobby = !matchId && !practice;
  useEffect(() => {
    if (!live && !inLobby) return;
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), live ? 250 : 15000);
    return () => clearInterval(i);
  }, [live, inLobby]);

  const remaining = match?.deadline ? Math.max(0, (Date.parse(match.deadline) - (now + offsetRef.current)) / 1000) : 0;

  // ── Sonido ──
  const secLeft = Math.ceil(remaining);
  const tickArmed = match?.status === 'battle' && match.my_turn && !firing && secLeft > 0 && secLeft <= 5;
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (!tickArmed) { lastTick.current = null; return; }
    if (lastTick.current === secLeft) return;
    lastTick.current = secLeft;
    bsSfx.tick(secLeft === 1);
  }, [tickArmed, secLeft]);

  // ── Acciones ──
  const stakeNum = Number(stake.replace(',', '.'));
  const stakeValid = /^\d+([.,]\d{1,2})?$/.test(stake.trim()) && lobby !== null && stakeNum >= lobby.min_stake && stakeNum <= lobby.max_stake;
  const stakeTung = stakeValid ? toTung(stakeNum, lobby?.tung_price) : null;
  const noFunds = stakeTung !== null && lobby !== null && stakeTung > lobby.balance;

  const create = async (isPrivate: boolean) => {
    if (!stakeValid || stakeTung === null || busy) return;
    setBusy(true);
    const d = await rpc<{ match_id: string; code: string | null }>('battleship_create', { p_stake: stakeNum, p_private: isPrivate });
    setBusy(false);
    if (!d.success) { flash('error', d.error || 'No se pudo crear la sala'); return; }
    dismissedRef.current = null;
    fetchProfile();
    setMatchId(d.match_id);
  };

  const join = async (opts: { id?: string; code?: string; stake?: number; stakeUsd?: number | null }) => {
    if (busy) return;
    if (opts.stake !== undefined) {
      const label = opts.stakeUsd ? `${usd(opts.stakeUsd)} (${fmt(opts.stake)} TUNG)` : `${fmt(opts.stake)} TUNG`;
      if (!window.confirm(`¿Unirte apostando ${label}? El ganador se lleva ${fmt(opts.stake * (lobby?.payout_mult ?? 1.8))} TUNG.`)) return;
    }
    setBusy(true);
    const d = await rpc<{ match_id: string }>('battleship_join', { p_match_id: opts.id ?? null, p_code: opts.code ?? null });
    setBusy(false);
    if (!d.success) { flash('error', d.error || 'No se pudo entrar a la sala'); loadLobby(); return; }
    dismissedRef.current = null;
    setJoinCode('');
    fetchProfile();
    setMatchId(d.match_id);
  };

  const cancel = async () => {
    if (!match || busy) return;
    setBusy(true);
    const d = await rpc('battleship_cancel', { p_match_id: match.id });
    setBusy(false);
    if (!d.success) { flash('error', d.error || 'No se pudo cancelar'); return; }
    flash('ok', 'Sala cancelada. Apuesta reembolsada.');
    fetchProfile();
    leaveMatch();
  };

  // ── Práctica ──
  const pushPractice = () => {
    const p = practiceRef.current;
    if (!p) return;
    p.version += 1;
    applyState(practiceView(p), Date.now());
  };

  const botTurn = (token: number) => {
    later(() => {
      const p = practiceRef.current;
      if (!p || p.token !== token || p.status !== 'battle' || p.myTurn || !p.myShips) return;
      const cell = botPick(p.botShots, p.myShips);
      const shot = resolveShot(p.myShips, p.botShots, cell, p.nextId++);
      p.botShots.push(shot);
      if (shot.hit && sunkShips(p.myShips, p.botShots).length === p.myShips.length) {
        p.status = 'finished'; p.winner = 'opp'; p.endReason = 'fleet_destroyed';
      } else if (shot.hit) {
        botTurn(token);
      } else {
        p.myTurn = true;
      }
      pushPractice();
    }, 750 + Math.random() * 650);
  };

  const startPractice = () => {
    const token = ++practiceToken.current;
    practiceRef.current = {
      token, status: 'placing', myTurn: true, version: 0, nextId: 1,
      botShips: layoutShips(randomLayout()), myShips: null, myShots: [], botShots: [], winner: null, endReason: null,
    };
    matchRef.current = null;
    seenShots.current = new Set();
    setFx([]);
    setBanner(null);
    setHideResult(false);
    setPractice(true);
    pushPractice();
  };

  const surrender = async () => {
    if (!match || busy) return;
    if (practice) {
      const p = practiceRef.current;
      if (!p || p.status === 'finished' || !window.confirm('¿Abandonar la práctica?')) return;
      p.status = 'finished'; p.winner = 'opp'; p.endReason = 'surrender';
      pushPractice();
      return;
    }
    if (!window.confirm(match.tournament_id ? '¿Rendirte? Perderás este duelo del torneo.' : '¿Rendirte? El rival se llevará el bote.')) return;
    setBusy(true);
    const d = await rpc('battleship_surrender', { p_match_id: match.id });
    setBusy(false);
    if (!d.success) { flash('error', d.error || 'No se pudo completar'); return; }
    loadState(match.id);
  };

  const leaveMatch = () => {
    if (practice) {
      practiceToken.current += 1;
      practiceRef.current = null;
      setPractice(false);
    } else {
      dismissedRef.current = matchId;
      if (match?.tournament_id) setTab('torneos');
    }
    matchRef.current = null;
    seenShots.current = new Set();
    setMatch(null);
    setMatchId(null);
    setFx([]);
    setBanner(null);
    setHideResult(false);
    setLoading(true);
  };

  const placedShips = useMemo(() => layoutShips(layout), [layout]);
  const allPlaced = placedShips.length === FLEET.length;

  const occupiedExcept = useCallback((except: ShipCode | null) => {
    const set = new Set<number>();
    placedShips.forEach((s) => { if (s.code !== except) s.cells.forEach((c) => set.add(c)); });
    return set;
  }, [placedShips]);

  const preview = useMemo(() => {
    if (!selected || hover === null) return null;
    const size = SHIP[selected].size;
    const x = hover % 10, y = Math.floor(hover / 10);
    const cells = shipCells(x, y, dir, size);
    const occ = occupiedExcept(selected);
    const ok = !!cells && cells.every((c) => !occ.has(c));
    const cx = dir === 'h' ? Math.min(x, 10 - size) : x;
    const cy = dir === 'v' ? Math.min(y, 10 - size) : y;
    return { ok, ship: { code: selected, size, x: cx, y: cy, dir, cells: cells ?? [] } as Ship };
  }, [selected, hover, dir, occupiedExcept]);

  const onPlaceCell = (cell: number) => {
    const x = cell % 10, y = Math.floor(cell / 10);
    if (selected) {
      const size = SHIP[selected].size;
      const cells = shipCells(x, y, dir, size);
      const occ = occupiedExcept(selected);
      if (!cells || cells.some((c) => occ.has(c))) return;
      const next = { ...layout, [selected]: { x, y, dir } };
      setLayout(next);
      setSelected(FLEET.find((f) => !next[f.code])?.code ?? null);
      bsSfx.place();
      return;
    }
    const hit = placedShips.find((s) => s.cells.includes(cell));
    if (hit) {
      const next = { ...layout };
      delete next[hit.code];
      setLayout(next);
      setSelected(hit.code);
      setDir(hit.dir);
    }
  };

  const rotate = useCallback(() => setDir((d) => (d === 'h' ? 'v' : 'h')), []);
  useEffect(() => {
    if (match?.status !== 'placing' || match.my_ready) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && !(e.target instanceof HTMLInputElement)) rotate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [match?.status, match?.my_ready, rotate]);

  const submitFleet = async () => {
    if (!match || !allPlaced || busy) return;
    if (practice) {
      const p = practiceRef.current;
      if (!p || p.status !== 'placing') return;
      p.myShips = placedShips;
      p.status = 'battle';
      p.myTurn = Math.random() < 0.5;
      bsSfx.deploy();
      pushPractice();
      if (!p.myTurn) botTurn(p.token);
      return;
    }
    setBusy(true);
    const ships = FLEET.map((f) => ({ code: f.code, x: layout[f.code]!.x, y: layout[f.code]!.y, dir: layout[f.code]!.dir }));
    const d = await rpc('battleship_place', { p_match_id: match.id, p_ships: ships });
    setBusy(false);
    if (!d.success) { flash('error', d.error || 'No se pudo desplegar'); return; }
    bsSfx.deploy();
    loadState(match.id);
  };

  const myShotCells = useMemo(() => new Set((match?.my_shots ?? []).map((s) => s.cell)), [match?.my_shots]);

  const fire = async (cell: number) => {
    if (!match || !match.my_turn || firing || myShotCells.has(cell)) return;
    if (practice) {
      const p = practiceRef.current;
      if (!p || p.status !== 'battle' || !p.myTurn) return;
      const shot = resolveShot(p.botShips, p.myShots, cell, p.nextId++);
      p.myShots.push(shot);
      if (shot.hit && sunkShips(p.botShips, p.myShots).length === p.botShips.length) {
        p.status = 'finished'; p.winner = 'me'; p.endReason = 'fleet_destroyed';
      } else if (!shot.hit) {
        p.myTurn = false;
        botTurn(p.token);
      }
      pushPractice();
      return;
    }
    setFiring(true);
    setAimCell(cell);
    const d = await rpc<{ hit: boolean; game_over: boolean }>('battleship_fire', { p_match_id: match.id, p_cell: cell });
    if (!d.success) flash('error', d.error || 'No se pudo disparar');
    await loadState(match.id);
    setAimCell(null);
    setFiring(false);
  };

  const admin = async (action: string, value?: number) => {
    setBusy(true);
    const d = await rpc('battleship_admin', { p_action: action, p_value: value ?? null });
    setBusy(false);
    if (!d.success) { flash('error', d.error || 'Acción no permitida'); return; }
    flash('ok', 'Configuración actualizada');
    setAdminValue('');
    loadLobby();
  };

  // ── Render helpers ──
  const mySunkCodes = useMemo(() => {
    const hits = new Set((match?.opp_shots ?? []).filter((s) => s.hit).map((s) => s.cell));
    return new Set((match?.my_fleet ?? []).filter((sh) => sh.cells.every((c) => hits.has(c))).map((sh) => sh.code));
  }, [match?.opp_shots, match?.my_fleet]);

  const oppShipsView = useMemo(() => {
    if (!match) return [];
    const sunk = new Set(match.opp_sunk.map((s) => s.code));
    const list: BoardProps['ships'] = match.opp_sunk.map((s) => ({ ship: s, variant: 'wreck' as const }));
    if (match.opp_fleet) match.opp_fleet.filter((s) => !sunk.has(s.code)).forEach((s) => list.push({ ship: s, variant: 'reveal' }));
    return list;
  }, [match]);

  const myShipsView = useMemo(() => (match?.my_fleet ?? []).map((s) => ({ ship: s, variant: mySunkCodes.has(s.code) ? 'wreck' as const : 'own' as const })), [match?.my_fleet, mySunkCodes]);

  const style = (
    <style>{`
      @keyframes bs-streak { 0% { transform: rotate(var(--a)) translateX(1vmax) scaleX(0.05); opacity: 0 } 20% { opacity: 1 } 100% { transform: rotate(var(--a)) translateX(80vmax) scaleX(1); opacity: 0 } }
      .bs-streak { position: absolute; left: 50%; top: 50%; height: 2px; transform-origin: 0 50%; border-radius: 2px; opacity: 0;
        background: linear-gradient(90deg, rgba(224,242,254,0), #e0f2fe 60%, #7dd3fc); box-shadow: 0 0 6px rgba(125,211,252,0.8);
        animation: bs-streak 0.8s cubic-bezier(0.55, 0, 1, 0.45) infinite; }
      @keyframes bs-warpflash { 0%, 72% { opacity: 0 } 84% { opacity: 0.95 } 100% { opacity: 0 } }
      @keyframes bs-warpout { 0%, 82% { opacity: 1 } 100% { opacity: 0 } }
      @keyframes bs-beam { 0% { transform: scaleY(0); opacity: 1 } 45% { transform: scaleY(1); opacity: 1 } 100% { transform: scaleY(1); opacity: 0 } }
      @keyframes bs-boom { 0%, 38% { transform: translate(-50%, -50%) scale(0); opacity: 0 } 48% { opacity: 1 } 100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0 } }
      @keyframes bs-ring { 0%, 38% { transform: translate(-50%, -50%) scale(0.2); opacity: 0 } 48% { opacity: 0.9 } 100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0 } }
      @keyframes bs-spark { 0%, 42% { transform: rotate(var(--a)) translateX(0); opacity: 0 } 52% { opacity: 1 } 100% { transform: rotate(var(--a)) translateX(var(--d)); opacity: 0 } }
      @keyframes bs-shake-k { 0%, 100% { transform: translate(0, 0) } 20% { transform: translate(-6px, 3px) } 40% { transform: translate(6px, -3px) } 60% { transform: translate(-4px, -2px) } 80% { transform: translate(3px, 2px) } }
      .bs-shake { animation: bs-shake-k 0.5s ease-in-out; }
      @keyframes bs-fire { 0%, 100% { transform: scale(1); opacity: 0.85 } 50% { transform: scale(1.22); opacity: 1 } }
      @keyframes bs-twinkle { 0%, 100% { opacity: 0.15 } 50% { opacity: 0.9 } }
      @keyframes bs-scan-k { from { transform: translateY(-100%) } to { transform: translateY(300%) } }
      .bs-scan { top: 0; animation: bs-scan-k 3.2s linear infinite; }
      @keyframes bs-banner { 0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0 } 12% { transform: translate(-50%, -50%) scale(1.08); opacity: 1 } 22% { transform: translate(-50%, -50%) scale(1) } 85% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.04) } }
      @keyframes bs-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
      @keyframes bs-rise { 0% { transform: translateY(0) scale(1); opacity: 0 } 15% { opacity: 1 } 100% { transform: translateY(-120px) scale(0.6); opacity: 0 } }
      @media (prefers-reduced-motion: reduce) { .bs-anim, .bs-streak, .bs-scan, .bs-shake { animation: none !important; } }
    `}</style>
  );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Link to={`/game/galaxy?galaxy=${BATTLESHIP_COORDS.galaxy}&system=${BATTLESHIP_COORDS.system}`} className="shrink-0 p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300" title="Volver a la galaxia">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-orbitron text-base sm:text-2xl text-white break-words">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-cyan-200 to-indigo-300">BATALLA DE NAVES GALÁCTICA</span>
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-400">Sector [{BATTLESHIP_COORDS.galaxy}:{BATTLESHIP_COORDS.system}:{BATTLESHIP_COORDS.position}] · Duelos 1 vs 1 · apuesta en USD pagada en TUNG</p>
        </div>
      </div>
      <div className="flex items-center gap-2 max-w-full">
        <SoundToggle />
        {lobby && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/70 border border-amber-400/30 min-w-0 max-w-full">
            <Coins className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="font-orbitron text-amber-200 text-sm truncate">{fmt(lobby.balance)} TUNG</span>
            {lobby.tung_price ? <span className="text-[11px] text-slate-400 shrink-0">≈ {usd(lobby.balance * lobby.tung_price)}</span> : null}
          </div>
        )}
      </div>
    </div>
  );

  const messageBar = message && (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border ${message.type === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span className="min-w-0 break-words">{message.text}</span>
    </div>
  );

  const bannerEl = banner && (
    <div className="fixed left-1/2 top-1/2 z-[120] pointer-events-none w-max max-w-[92vw]" style={{ animation: REDUCED_MOTION ? undefined : 'bs-banner 2.4s ease-out forwards', transform: 'translate(-50%, -50%)' }}>
      <div className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border-2 backdrop-blur-md shadow-2xl ${banner.tone === 'good' ? 'bg-emerald-950/80 border-emerald-400/70 shadow-emerald-500/30' : banner.tone === 'bad' ? 'bg-red-950/80 border-red-500/70 shadow-red-500/30' : 'bg-sky-950/80 border-sky-400/70 shadow-sky-500/30'}`}>
        <img src={imgUrl(banner.img)} alt="" className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]" />
        <div className="min-w-0">
          <p className={`font-orbitron text-sm sm:text-2xl font-bold tracking-wider break-words ${banner.tone === 'good' ? 'text-emerald-300' : banner.tone === 'bad' ? 'text-red-300' : 'text-sky-200'}`}>{banner.title}</p>
          <p className="text-slate-200 text-sm">{banner.sub}</p>
        </div>
      </div>
    </div>
  );

  // ─────────────── VISTA PARTIDA ───────────────
  if (matchId || practice) {
    if (!match) {
      return (
        <div className="space-y-4">
          {style}{warp && <Hyperspace onDone={endWarp} />}
          {header}
          <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-sky-400" /></div>
        </div>
      );
    }

    const opp = match.opp_name || 'Rival';
    const mult = match.stake > 0 ? match.pot / match.stake : 0;
    const tour = !practice && !!match.tournament_id;
    const potLine = practice ? (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-400/40 text-emerald-200 flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" />Práctica · sin apuesta</span>
      </div>
    ) : tour ? (
      <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
        <span className="px-2 py-1 rounded bg-amber-500/15 border border-amber-400/50 text-amber-200 flex items-center gap-1 min-w-0"><Trophy className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{match.tournament_name ?? 'Torneo'}</span></span>
        {match.round_name && <span className="px-2 py-1 rounded bg-rose-500/10 border border-rose-400/40 text-rose-200 font-orbitron">{match.round_name}</span>}
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded bg-slate-800/80 text-slate-300">Apuesta {match.stake_usd ? <><b className="text-white">{usd(match.stake_usd)}</b> · {fmt(match.stake)} TUNG</> : <><b className="text-white">{fmt(match.stake)}</b> TUNG</>}</span>
        <span className="px-2 py-1 rounded bg-amber-500/10 border border-amber-400/30 text-amber-200">Bote <b>{fmt(match.pot)}</b> TUNG{match.stake_usd ? ` ≈ ${usd(match.stake_usd * mult)}` : ''}</span>
        {match.is_private && <span className="px-2 py-1 rounded bg-violet-500/10 border border-violet-400/30 text-violet-200 flex items-center gap-1"><Lock className="w-3 h-3" />Privada</span>}
      </div>
    );
    const practiceBar = practice && (
      <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-emerald-100 text-xs sm:text-sm">
        <GraduationCap className="w-4 h-4 shrink-0 mt-0.5 text-emerald-300" />
        <span className="min-w-0 break-words"><b className="font-orbitron tracking-wide text-emerald-300">MODO PRÁCTICA</b> · Entrenamiento gratis contra la IA. No hay apuesta, no suma al ranking ni da premios: sirve solo para aprender. Cuando estés listo, vuelve al lobby y juega con apuesta.</span>
      </div>
    );

    // Sala de espera
    if (match.status === 'waiting') {
      return (
        <div className="space-y-4">
          {style}{warp && <Hyperspace onDone={endWarp} />}
          {header}
          {messageBar}
          <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-br from-slate-950 via-indigo-950/60 to-slate-950 p-6 sm:p-10 text-center">
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(56,189,248,0.18), transparent 60%)' }} />
            <div className="relative space-y-5">
              <div className="mx-auto w-28 h-28 relative">
                <div className="absolute inset-0 rounded-full border-2 border-sky-400/40 animate-ping" style={{ animationDuration: '2.2s' }} />
                <div className="absolute inset-3 rounded-full border border-sky-300/30" />
                <img src={imgUrl(SHIP.battlecruiser.img)} alt="" className="absolute inset-4 w-20 h-20 object-contain bs-anim" style={{ animation: 'bs-float 3s ease-in-out infinite' }} />
              </div>
              <div>
                <p className="font-orbitron text-sky-200 text-lg">Buscando rival…</p>
                <p className="text-slate-400 text-sm">Mantén esta pantalla abierta. Si la cierras, la sala caduca y se te reembolsa.</p>
              </div>
              <div className="flex justify-center">{potLine}</div>
              {match.code && (
                <div className="inline-flex flex-col items-center gap-2 px-4 sm:px-6 py-4 rounded-xl bg-violet-950/50 border border-violet-400/40 max-w-full">
                  <span className="text-xs text-violet-300 flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" />Código de sala privada</span>
                  <div className="flex items-center gap-3">
                    <span className="font-orbitron text-2xl sm:text-3xl tracking-[0.25em] sm:tracking-[0.35em] text-white">{match.code}</span>
                    <button type="button" className="p-2 rounded-lg bg-violet-600/40 hover:bg-violet-600/60 text-violet-100" title="Copiar"
                      onClick={() => { navigator.clipboard?.writeText(match.code ?? ''); flash('ok', 'Código copiado'); }}>
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400">Compártelo con tu rival para que se una</span>
                </div>
              )}
              <div>
                <button type="button" onClick={cancel} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Cancelar y reembolsar
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (match.status === 'cancelled') {
      return (
        <div className="space-y-4">
          {style}
          {header}
          <div className="rounded-2xl border border-slate-600/50 bg-slate-900/70 p-8 text-center space-y-3">
            <p className="font-orbitron text-slate-200 text-lg">{REASONS[match.end_reason ?? ''] ?? 'Sala cerrada'}</p>
            <p className="text-slate-400 text-sm">Tu apuesta de {fmt(match.stake)} TUNG{match.stake_usd ? ` (${usd(match.stake_usd)})` : ''} fue reembolsada.</p>
            <button type="button" onClick={leaveMatch} className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm">Volver al lobby</button>
          </div>
        </div>
      );
    }

    // Despliegue
    if (match.status === 'placing') {
      const myView: BoardProps['ships'] = match.my_ready
        ? myShipsView
        : [
          ...placedShips.map((s) => ({ ship: s, variant: 'own' as const })),
          ...(preview ? [{ ship: preview.ship, variant: preview.ok ? 'ghost' as const : 'ghost-bad' as const }] : []),
        ];
      return (
        <div className="space-y-4">
          {style}{warp && <Hyperspace onDone={endWarp} />}{bannerEl}
          {header}
          {messageBar}
          {practiceBar}
          <div className="rounded-xl border border-sky-500/25 bg-slate-950/70 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {practice
                ? <div className="w-14 h-14 shrink-0 rounded-full border-2 border-emerald-400/50 flex items-center justify-center bg-emerald-500/10"><Bot className="w-6 h-6 text-emerald-300" /></div>
                : <TurnRing remaining={remaining} total={tour ? 180 : 90} mine />}
              <div className="min-w-0">
                <p className="font-orbitron text-sky-200">Despliega tu flota</p>
                <p className="text-xs text-slate-400 break-words">vs <b className="text-rose-300">{opp}</b> · {match.opp_ready ? <span className="text-emerald-300">rival listo</span> : 'el rival está desplegando…'}</p>
                <p className="text-[11px] text-slate-500">{practice ? 'Sin límite de tiempo: practica la colocación con calma.' : 'Si se acaba el tiempo, tu flota se despliega al azar.'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {potLine}
              <button type="button" onClick={surrender} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 text-red-200 text-xs border border-red-500/30"><Flag className="w-3.5 h-3.5" />{practice ? 'Abandonar' : 'Rendirse'}</button>
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
            <Board
              title="TU SECTOR"
              subtitle={match.my_ready ? 'Flota desplegada' : selected ? `Colocando: ${SHIP[selected].name} (${SHIP[selected].size}) · ${dir === 'h' ? 'horizontal' : 'vertical'}` : 'Toca una nave colocada para moverla'}
              tone="ally"
              ships={myView}
              shots={[]}
              fx={[]}
              active={!match.my_ready}
              seed={7}
              onCell={match.my_ready ? undefined : onPlaceCell}
              onHover={match.my_ready ? undefined : setHover}
            />
            <div className="space-y-3 min-w-0">
              {match.my_ready ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-center space-y-2">
                  <Shield className="w-8 h-8 text-emerald-300 mx-auto" />
                  <p className="font-orbitron text-emerald-200">Flota en posición</p>
                  <p className="text-xs text-slate-400">{match.opp_ready ? 'Iniciando batalla…' : 'Esperando a que el rival despliegue su flota.'}</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-3 space-y-2">
                    <p className="text-xs text-slate-400 mb-1">Hangar · elige una nave y colócala en el tablero</p>
                    {FLEET.map((f) => {
                      const isPlaced = !!layout[f.code];
                      const isSel = selected === f.code;
                      return (
                        <button key={f.code} type="button" onClick={() => setSelected(isSel ? null : f.code)}
                          className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-all ${isSel ? 'border-sky-400 bg-sky-500/15 shadow-[0_0_12px_rgba(56,189,248,0.35)]' : isPlaced ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                          <img src={imgUrl(f.img)} alt="" className="w-12 h-10 shrink-0 object-contain" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{f.name}</p>
                            <div className="flex gap-0.5 mt-1">{Array.from({ length: f.size }, (_, i) => <span key={i} className={`w-3 h-1.5 rounded-sm ${isPlaced ? 'bg-emerald-400' : 'bg-sky-400/60'}`} />)}</div>
                          </div>
                          {isPlaced && <span className="text-[10px] text-emerald-300">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={rotate} className="flex flex-col items-center gap-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"><RotateCw className="w-4 h-4" />Girar (R)</button>
                    <button type="button" onClick={() => { setLayout(randomLayout()); setSelected(null); bsSfx.place(); }} className="flex flex-col items-center gap-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"><Shuffle className="w-4 h-4" />Aleatorio</button>
                    <button type="button" onClick={() => { setLayout({}); setSelected('deathstar'); }} className="flex flex-col items-center gap-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"><Trash2 className="w-4 h-4" />Limpiar</button>
                  </div>
                  <button type="button" onClick={submitFleet} disabled={!allPlaced || busy}
                    className="w-full py-3 rounded-xl font-orbitron tracking-wider text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-sky-900/40 flex items-center justify-center gap-2">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} CONFIRMAR FLOTA
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Combate / final
    const finished = match.status === 'finished';
    const won = match.winner === 'me';
    return (
      <div className="space-y-4">
        {style}{warp && <Hyperspace onDone={endWarp} />}{bannerEl}
        {header}
        {messageBar}
        {practiceBar}
        <div className={`rounded-xl border p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 transition-colors ${finished ? 'border-slate-600/50 bg-slate-950/70' : match.my_turn ? 'border-sky-400/50 bg-sky-950/40' : 'border-violet-400/30 bg-violet-950/30'}`}>
          <div className="flex items-center gap-3 min-w-0">
            {!finished && !practice && <TurnRing remaining={remaining} total={TURN_SECONDS} mine={match.my_turn} />}
            <div className="min-w-0">
              <p className={`font-orbitron text-base sm:text-lg break-words ${finished ? 'text-slate-200' : match.my_turn ? 'text-sky-200' : 'text-violet-200'}`}>
                {finished ? 'Batalla terminada' : match.my_turn ? '¡TU TURNO! Elige un objetivo' : `Turno de ${opp}…`}
              </p>
              <p className="text-xs text-slate-400 break-words">
                <span className="text-sky-300">{match.my_name ?? 'Tú'}</span> {match.my_hits}/{TOTAL_CELLS} impactos
                <span className="mx-2 text-slate-600">|</span>
                <span className="text-rose-300">{opp}</span> {match.opp_hits}/{TOTAL_CELLS}
                {!finished && (match.my_timeouts > 0 || match.opp_timeouts > 0) && (
                  <span className="ml-2 text-amber-300">⏱ {match.my_timeouts}/3 · rival {match.opp_timeouts}/3</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {potLine}
            {!finished && <button type="button" onClick={surrender} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 text-red-200 text-xs border border-red-500/30"><Flag className="w-3.5 h-3.5" />{practice ? 'Abandonar' : 'Rendirse'}</button>}
            {finished && practice && <button type="button" onClick={startPractice} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs">Otra práctica</button>}
            {finished && <button type="button" onClick={leaveMatch} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs">Volver al lobby</button>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Board
            title={`FLOTA ENEMIGA · ${opp}`}
            subtitle={`Naves hundidas: ${match.opp_sunk.length}/${FLEET.length}`}
            tone="enemy"
            ships={oppShipsView}
            shots={match.my_shots}
            fx={fx.filter((f) => !f.incoming)}
            active={!finished && match.my_turn}
            seed={23}
            canClick={(c) => !finished && match.my_turn && !firing && !myShotCells.has(c)}
            onCell={finished ? undefined : fire}
          />
          <Board
            title="TU FLOTA"
            subtitle={`Naves perdidas: ${mySunkCodes.size}/${FLEET.length}`}
            tone="ally"
            ships={myShipsView}
            shots={match.opp_shots}
            fx={fx.filter((f) => f.incoming)}
            active={!finished && !match.my_turn}
            shake={shakeMine}
            seed={11}
          />
        </div>
        {aimCell !== null && <p className="text-center text-xs text-sky-300 font-mono">Disparando a {cellName(aimCell)}…</p>}

        {/* Estado de flotas */}
        <div className="grid sm:grid-cols-2 gap-3">
          {[{ label: 'Flota enemiga', sunk: new Set(match.opp_sunk.map((s) => s.code)), tone: 'rose' }, { label: 'Tu flota', sunk: mySunkCodes, tone: 'sky' }].map((g) => (
            <div key={g.label} className="min-w-0 rounded-xl border border-slate-700/60 bg-slate-900/60 p-3">
              <p className="text-xs text-slate-400 mb-2">{g.label}</p>
              <div className="flex flex-wrap gap-2">
                {FLEET.map((f) => (
                  <div key={f.code} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] ${g.sunk.has(f.code) ? 'border-red-500/40 bg-red-950/40 text-red-300 line-through' : 'border-slate-600/60 bg-slate-800/60 text-slate-200'}`}>
                    <img src={imgUrl(f.img)} alt="" className={`w-6 h-5 object-contain ${g.sunk.has(f.code) ? 'grayscale opacity-50' : ''}`} />
                    {f.name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {finished && !hideResult && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
            <div className={`relative w-full max-w-md max-h-full overflow-y-auto rounded-2xl border-2 p-5 sm:p-6 text-center overflow-x-hidden ${won ? 'border-amber-400/70 bg-gradient-to-b from-amber-950/90 via-slate-950 to-slate-950' : 'border-red-500/60 bg-gradient-to-b from-red-950/90 via-slate-950 to-slate-950'}`}>
              {won && !REDUCED_MOTION && Array.from({ length: 18 }, (_, i) => (
                <span key={i} className="absolute bottom-0 text-amber-300 bs-anim" style={{ left: `${5 + i * 5.2}%`, animation: `bs-rise ${1.6 + (i % 5) * 0.3}s ease-out ${(i % 6) * 0.25}s infinite` }}>✦</span>
              ))}
              <div className="relative space-y-3">
                {won ? <Trophy className="w-14 h-14 text-amber-300 mx-auto drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]" /> : <Swords className="w-14 h-14 text-red-400 mx-auto" />}
                <p className={`font-orbitron text-2xl sm:text-3xl font-bold tracking-wider ${won ? 'text-amber-200' : 'text-red-300'}`}>{won ? '¡VICTORIA!' : 'DERROTA'}</p>
                <p className="text-slate-300 text-sm">{REASONS[match.end_reason ?? ''] ?? ''}</p>
                {practice ? (
                  <p className="text-sm text-emerald-200/90 break-words">{won ? '¡Buen entrenamiento, comandante!' : 'Sigue practicando: cada partida mejora tu táctica.'} Esta partida no suma ranking ni premios. Cuando quieras, juega con apuesta.</p>
                ) : tour ? (
                  <div className="space-y-1">
                    <p className={`text-lg sm:text-xl font-orbitron break-words ${won ? 'text-amber-200' : 'text-slate-300'}`}>
                      {won
                        ? match.round_name === 'Gran Final' ? '👑 ¡CAMPEÓN DEL TORNEO!' : match.round_name === 'Duelo por el 3er puesto' ? '🥉 ¡3er puesto!' : '⚔️ ¡Avanzas de ronda!'
                        : match.round_name === 'Gran Final' ? '🥈 ¡Subcampeón!' : match.round_name === 'Semifinal' ? 'Pasas al duelo por el 3er puesto' : match.round_name === 'Duelo por el 3er puesto' ? 'Terminas 4º' : 'Eliminado del torneo'}
                    </p>
                    <p className="text-xs text-slate-400 break-words">
                      {match.tournament_name ?? 'Torneo'} · {match.round_name ?? ''}. {(won && match.round_name !== 'Gran Final' && match.round_name !== 'Duelo por el 3er puesto') || (!won && match.round_name === 'Semifinal')
                        ? 'Tu próximo duelo empezará cuando terminen los demás; te avisaremos.'
                        : (won || match.round_name === 'Gran Final') ? 'Los premios se acreditan al terminar el torneo.' : 'Gracias por competir, comandante.'}
                    </p>
                  </div>
                ) : won ? (
                  <div>
                    <p className="text-xl sm:text-2xl font-orbitron text-emerald-300 break-words">+{fmt(match.payout)} TUNG</p>
                    {match.stake_usd ? <p className="text-xs text-slate-400">≈ {usd(match.stake_usd * mult)}</p> : null}
                  </div>
                ) : (
                  <p className="text-base sm:text-lg text-slate-400 break-words">Perdiste {fmt(match.stake)} TUNG{match.stake_usd ? ` (${usd(match.stake_usd)})` : ''}</p>
                )}
                <p className="text-xs text-slate-500 break-words">Impactos: tú {match.my_hits} · {opp} {match.opp_hits}</p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <button type="button" onClick={() => setHideResult(true)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm">
                    Ver tableros
                  </button>
                  {practice && (
                    <button type="button" onClick={startPractice}
                      className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm">
                      Otra práctica
                    </button>
                  )}
                  <button type="button" onClick={leaveMatch}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-orbitron text-sm">
                    {tour ? 'Ver torneo' : 'Volver al lobby'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────── LOBBY ───────────────
  const poolTung = Number(lobby?.daily_pool ?? 0);
  const poolSplit = lobby?.daily_pool_split?.length ? lobby.daily_pool_split : [40, 25, 15, 12, 8];
  const poolNextMs = lobby?.daily_pool_next ? Date.parse(lobby.daily_pool_next) - now : 0;
  const poolCountdown = poolNextMs > 0 ? `${Math.floor(poolNextMs / 3600000)}h ${Math.floor((poolNextMs % 3600000) / 60000)}m` : 'repartiendo…';
  const poolLocalTime = lobby?.daily_pool_next ? new Date(lobby.daily_pool_next).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className="space-y-5">
      {style}{warp && <Hyperspace onDone={endWarp} />}
      {header}
      {messageBar}

      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-900/70 border border-slate-700/60 max-w-md">
        <button type="button" onClick={() => setTab('duelos')}
          className={`py-2 rounded-lg font-orbitron text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all ${tab === 'duelos' ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-900/40' : 'text-slate-400 hover:text-slate-200'}`}>
          <Swords className="w-4 h-4" />Duelos
        </button>
        <button type="button" onClick={() => setTab('torneos')}
          className={`py-2 rounded-lg font-orbitron text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all ${tab === 'torneos' ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-amber-950 shadow-lg shadow-amber-900/40' : 'text-amber-200/80 hover:text-amber-100'}`}>
          <Trophy className="w-4 h-4" />Torneos
        </button>
      </div>

      {tab === 'torneos' ? (
        <BattleshipTournaments
          onEnterMatch={(id) => { dismissedRef.current = null; setMatchId(id); }}
          onBalanceChange={() => { fetchProfile(); loadLobby(); }}
        />
      ) : loading && !lobby ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-sky-400" /></div>
      ) : lobby && (
        <>
          {/* Hero */}
          <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 p-5 sm:p-7" style={{ background: 'radial-gradient(ellipse at 15% 20%, rgba(99,102,241,0.35), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(14,165,233,0.3), transparent 55%), #050914' }}>
            <div className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(56,189,248,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.15) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
            <div className="absolute -right-6 top-1/2 -translate-y-1/2 hidden md:flex gap-3 opacity-90">
              <img src={imgUrl(SHIP.deathstar.img)} alt="" className="w-36 h-36 object-contain bs-anim drop-shadow-[0_0_18px_rgba(56,189,248,0.5)]" style={{ animation: 'bs-float 5s ease-in-out infinite' }} />
              <img src={imgUrl(SHIP.battlecruiser.img)} alt="" className="w-28 h-28 object-contain self-end bs-anim" style={{ animation: 'bs-float 4s ease-in-out 0.8s infinite' }} />
            </div>
            <div className="relative max-w-xl space-y-3">
              <p className="font-orbitron text-2xl sm:text-3xl text-white">Hunde la flota enemiga</p>
              <p className="text-sm text-slate-300">Reta a otro comandante, despliega tus 6 naves en secreto y dispara por turnos. Si aciertas, vuelves a disparar. El primero en destruir la flota rival se lleva el bote.</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded bg-slate-900/70 border border-slate-600/50 text-slate-200">🏆 Ganador: x{fmt(lobby.payout_mult, 1)} de su apuesta</span>
                <span className="px-2 py-1 rounded bg-amber-500/10 border border-amber-400/40 text-amber-200">🎁 Pool diario para el TOP 5</span>
                <span className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-400/40 text-emerald-200">🎓 Práctica gratis vs IA</span>
                <span className="px-2 py-1 rounded bg-slate-900/70 border border-slate-600/50 text-slate-200">💵 Apuesta en USD, se paga en TUNG</span>
                <span className="px-2 py-1 rounded bg-slate-900/70 border border-slate-600/50 text-slate-200">⏱ {TURN_SECONDS}s por turno</span>
                <span className="px-2 py-1 rounded bg-slate-900/70 border border-slate-600/50 text-slate-200"><Users className="inline w-3 h-3 mr-1" />{lobby.live_matches} batallas en curso</span>
              </div>
            </div>
          </div>

          {lobby.gate_error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
              <Lock className="w-4 h-4 shrink-0" />{lobby.gate_error}
            </div>
          )}
          {!lobby.enabled && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />La Batalla de Naves está cerrada temporalmente.
            </div>
          )}

          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5">
            {/* Práctica */}
            <div className="relative overflow-hidden min-w-0 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/50 via-slate-900/80 to-slate-950 p-4 flex flex-col gap-3">
              <img src={imgUrl(SHIP.light_fighter.img)} alt="" className="absolute -right-2 -top-2 w-20 h-20 object-contain opacity-30 pointer-events-none" />
              <p className="relative font-orbitron text-emerald-200 text-sm flex items-center gap-2"><GraduationCap className="w-4 h-4" />Modo práctica · gratis</p>
              <p className="relative text-xs text-slate-300">Entrena contra la IA sin apostar nada. Aprende a desplegar tu flota y a cazar naves enemigas antes de jugar por TUNG.</p>
              <p className="relative text-[11px] text-amber-200/80 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />Solo para aprender: no suma al ranking, no da premios ni cuenta para el pool diario.</p>
              <button type="button" onClick={startPractice} disabled={busy}
                className="relative mt-auto w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5">
                <Bot className="w-4 h-4" />Entrenar contra la IA
              </button>
            </div>

            {/* Pool diario */}
            <div className="relative overflow-hidden min-w-0 rounded-xl border border-amber-400/35 p-4 space-y-3" style={{ background: 'radial-gradient(ellipse at 85% 0%, rgba(251,191,36,0.18), transparent 60%), radial-gradient(ellipse at 0% 100%, rgba(14,165,233,0.14), transparent 55%), #0b1020' }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-orbitron text-amber-200 text-sm flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-300" />Pool diario · TOP 5</p>
                  <p className="font-orbitron text-2xl sm:text-3xl text-white mt-1 break-words">{fmt(poolTung)} <span className="text-base text-amber-200">TUNG</span></p>
                  {lobby.tung_price ? <p className="text-xs text-emerald-300">≈ {usd(poolTung * lobby.tung_price)}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-slate-400 flex items-center justify-end gap-1"><Clock className="w-3 h-3" />Reparto en</p>
                  <p className="font-orbitron text-cyan-200 text-lg">{poolCountdown}</p>
                  <p className="text-[10px] text-slate-500">00:00 UTC{poolLocalTime ? ` · tu hora ${poolLocalTime}` : ''}</p>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {poolSplit.slice(0, 5).map((pct, i) => (
                  <div key={i} className={`rounded-lg border px-1 py-1.5 text-center ${i === 0 ? 'border-amber-400/50 bg-amber-500/10' : 'border-slate-700/70 bg-slate-900/60'}`}>
                    <p className="text-sm leading-none">{MEDALS[i]}</p>
                    <p className="font-orbitron text-[11px] text-white mt-1">{pct}%</p>
                    <p className="text-[10px] text-slate-400 truncate">{fmt((poolTung * pct) / 100)}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">Se alimenta con el 5% de cada apuesta perdida y se reparte cada día entre los 5 mejores del ranking <b className="text-slate-200">Hoy</b> (más victorias; a igualdad, más beneficio). Los ganadores se anuncian en Telegram.</p>
              {lobby.daily_pool_last?.length ? (
                <div className="border-t border-slate-700/60 pt-2">
                  <p className="text-[11px] text-slate-500 mb-1">Último reparto{lobby.daily_pool_last_day ? ` (${lobby.daily_pool_last_day})` : ''}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {lobby.daily_pool_last.map((w) => (
                      <span key={w.rank} className="text-xs text-slate-300 min-w-0 truncate">{MEDALS[w.rank - 1] ?? `${w.rank}º`} <b className="text-amber-200">{w.username ?? '—'}</b> <span className="text-emerald-300">+{fmt(w.amount)}</span></span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5">
            {/* Crear / unirse */}
            <div className="space-y-4 min-w-0">
              <div className="rounded-xl border border-sky-500/25 bg-slate-900/70 p-4 space-y-3">
                <p className="font-orbitron text-sky-200 text-sm flex items-center gap-2"><Swords className="w-4 h-4" />Crear sala</p>
                <div>
                  <label className="text-xs text-slate-400">Apuesta (USD) · mín {usd(lobby.min_stake)} · máx {usd(lobby.max_stake)}</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-orbitron">$</span>
                    <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal"
                      className={`w-full min-w-0 pl-7 pr-3 py-2 rounded-lg bg-slate-950 border text-white font-orbitron ${stake && !stakeValid ? 'border-red-500/60' : 'border-slate-700 focus:border-sky-400'} outline-none`} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {CHIPS.filter((c) => c >= lobby.min_stake && c <= lobby.max_stake).map((c) => (
                      <button key={c} type="button" onClick={() => setStake(c.toFixed(2))} className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-amber-200 border border-amber-400/20">{usd(c)}</button>
                    ))}
                  </div>
                  {stakeValid && (stakeTung !== null ? (
                    <p className="text-xs text-slate-400 mt-2 break-words">
                      Pagas <b className="text-amber-200">≈ {fmt(stakeTung)} TUNG</b> · si ganas cobras <b className="text-emerald-300">{usd(stakeNum * lobby.payout_mult)} ≈ {fmt(stakeTung * lobby.payout_mult)} TUNG</b>
                    </p>
                  ) : (
                    <p className="text-xs text-red-300 mt-2">Precio de TUNG no disponible. Inténtalo en un minuto.</p>
                  ))}
                  {lobby.tung_price ? <p className="text-[11px] text-slate-500 mt-1">1 TUNG ≈ {Number(lobby.tung_price).toFixed(6)} USD · precio en vivo</p> : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={!stakeValid || stakeTung === null || busy || !lobby.enabled || !!lobby.gate_error || noFunds} onClick={() => create(false)}
                    className="py-2.5 rounded-lg bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}Pública
                  </button>
                  <button type="button" disabled={!stakeValid || stakeTung === null || busy || !lobby.enabled || !!lobby.gate_error || noFunds} onClick={() => create(true)}
                    className="py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}Privada
                  </button>
                </div>
                {noFunds && <p className="text-xs text-red-300">Saldo insuficiente</p>}
              </div>

              <div className="rounded-xl border border-violet-500/25 bg-slate-900/70 p-4 space-y-2">
                <p className="font-orbitron text-violet-200 text-sm flex items-center gap-2"><KeyRound className="w-4 h-4" />Unirse con código</p>
                <div className="flex gap-2">
                  <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="ABC123"
                    className="flex-1 min-w-0 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-violet-400 outline-none text-white font-orbitron tracking-[0.2em] sm:tracking-[0.3em]" />
                  <button type="button" disabled={joinCode.length !== 6 || busy || !lobby.enabled || !!lobby.gate_error} onClick={() => join({ code: joinCode })}
                    className="shrink-0 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm disabled:opacity-40">Entrar</button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 text-xs text-slate-400 space-y-1.5">
                <p className="text-slate-200 font-semibold flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-sky-300" />Reglas</p>
                <p>• Eliges la apuesta en USD y se cobra en TUNG al precio en vivo; el rival paga exactamente los mismos TUNG.</p>
                <p>• Cada jugador apuesta lo mismo. Solo paga comisión quien pierde: el {lobby.fee_pct}% de su apuesta. El ganador cobra {fmt(lobby.payout_mult, 1)}x su apuesta.</p>
                <p>• De esa comisión: 5% a los pools del juego, 5% al pool diario de Batalla de Naves y 10% a la plataforma.</p>
                <p>• Ranking diario (00:00–24:00 UTC): el TOP 5 se reparte el pool diario (40/25/15/12/8%).</p>
                <p>• Flota: {FLEET.map((f) => `${f.name} (${f.size})`).join(', ')}.</p>
                <p>• 90s para desplegar (si no, despliegue aleatorio). {TURN_SECONDS}s por disparo: si se agota, disparo automático; 3 seguidos = derrota.</p>
                <p>• Acierto = vuelves a disparar. Rendirse entrega el bote al rival.</p>
              </div>
            </div>

            {/* Salas + historial */}
            <div className="space-y-4 min-w-0">
              <div className="rounded-xl border border-cyan-500/25 bg-slate-900/70 p-4">
                <p className="font-orbitron text-cyan-200 text-sm flex items-center gap-2 mb-3"><Crosshair className="w-4 h-4" />Salas públicas abiertas</p>
                {lobby.rooms.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No hay salas abiertas. ¡Crea una!</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {lobby.rooms.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 sm:gap-3 px-2.5 sm:px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/60">
                        <div className="flex items-center gap-2 min-w-0">
                          <img src={imgUrl(SHIP.destroyer.img)} alt="" className="w-8 h-7 shrink-0 object-contain hidden min-[380px]:block" />
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{r.username ?? 'Comandante'}</p>
                            <p className="text-[11px] text-slate-400 truncate">Bote {fmt(r.stake * lobby.payout_mult)} TUNG</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right leading-tight">
                            <p className="font-orbitron text-amber-200 text-sm">{r.stake_usd ? usd(r.stake_usd) : fmt(r.stake)}</p>
                            <p className="text-[10px] text-slate-400">{fmt(r.stake)} TUNG</p>
                          </div>
                          <button type="button" disabled={r.mine || busy || !lobby.enabled || !!lobby.gate_error || r.stake > lobby.balance} onClick={() => join({ id: r.id, stake: r.stake, stakeUsd: r.stake_usd })}
                            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-40">{r.mine ? 'Tuya' : 'Retar'}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="min-w-0 rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
                  <p className="font-orbitron text-slate-200 text-sm flex items-center gap-2 mb-2"><History className="w-4 h-4" />Tus batallas</p>
                  {lobby.history.length === 0 ? <p className="text-xs text-slate-500">Sin partidas aún.</p> : (
                    <div className="space-y-1.5">
                      {lobby.history.map((h) => (
                        <div key={h.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-300 truncate min-w-0">vs {h.opponent ?? '—'}{h.stake_usd ? <span className="text-slate-500"> · {usd(h.stake_usd)}</span> : null}</span>
                          <span className={`shrink-0 ${h.result === 'win' ? 'text-emerald-300' : h.result === 'loss' ? 'text-red-300' : 'text-slate-400'}`}>
                            {h.result === 'win' ? `+${fmt(h.pot)}` : h.result === 'loss' ? `-${fmt(h.stake)}` : 'Reembolso'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="min-w-0 rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
                  <p className="font-orbitron text-slate-200 text-sm flex items-center gap-2 mb-2"><Trophy className="w-4 h-4 text-amber-300" />Últimas victorias</p>
                  {lobby.recent_wins.length === 0 ? <p className="text-xs text-slate-500">Aún no hay ganadores.</p> : (
                    <div className="space-y-1.5">
                      {lobby.recent_wins.map((w, i) => (
                        <div key={i} className="flex items-center justify-between text-xs gap-2">
                          <span className="text-slate-300 truncate min-w-0"><b className="text-amber-200">{w.winner ?? '—'}</b> vs {w.loser ?? '—'}</span>
                          <span className="text-emerald-300 shrink-0">+{fmt(w.pot)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <CasinoLeaderboard game="battleship" accent="cyan" refreshKey={lobby.recent_wins[0]?.pot} />

              {lobby.admin && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-3">
                  <p className="font-orbitron text-amber-200 text-sm">Panel admin</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div className="p-2 rounded bg-slate-900/70"><p className="text-slate-500">Partidas</p><p className="text-white">{lobby.admin.total_matches}</p></div>
                    <div className="p-2 rounded bg-slate-900/70"><p className="text-slate-500">Apostado</p><p className="text-white">{fmt(lobby.admin.total_wagered)}</p></div>
                    <div className="p-2 rounded bg-slate-900/70"><p className="text-slate-500">Comisiones</p><p className="text-white">{fmt(lobby.admin.total_fees)}</p></div>
                    <div className="p-2 rounded bg-slate-900/70"><p className="text-slate-500">Pagado</p><p className="text-white">{fmt(lobby.admin.total_paid)}</p></div>
                    <div className="p-2 rounded bg-slate-900/70"><p className="text-slate-500">Pools pendiente</p><p className="text-white">{fmt(lobby.admin.pool_pending)}</p></div>
                    <div className="p-2 rounded bg-slate-900/70"><p className="text-slate-500">Salas esperando</p><p className="text-white">{lobby.admin.waiting}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => admin(lobby.enabled ? 'disable' : 'enable')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${lobby.enabled ? 'bg-red-700 hover:bg-red-600' : 'bg-emerald-700 hover:bg-emerald-600'} text-white`}>{lobby.enabled ? 'Cerrar juego' : 'Abrir juego'}</button>
                    <input value={adminValue} onChange={(e) => setAdminValue(e.target.value)} placeholder="USD" inputMode="decimal" className="w-24 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs" />
                    <button type="button" disabled={busy || !adminValue} onClick={() => admin('set_min', Number(adminValue.replace(',', '.')))} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs">Fijar mínimo (USD)</button>
                    <button type="button" disabled={busy || !adminValue} onClick={() => admin('set_max', Number(adminValue.replace(',', '.')))} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs">Fijar máximo (USD)</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
