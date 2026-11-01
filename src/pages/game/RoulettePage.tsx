import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Coins, History, Loader2, Lock, Minus, Plus, RotateCcw, Shield, Trash2, Trophy, Undo2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { casinoSfx } from '../../lib/casinoSfx';
import { unlockSfx } from '../../lib/sfx';
import { SoundToggle } from '../../components/game/SoundToggle';
import { CasinoLeaderboard } from '../../components/game/CasinoLeaderboard';

const ROULETTE_IMG_DIR = '/Imagenes/Casino%20Galaxtico/Rouleta';
const ROULETTE_BG_IMG = `${ROULETTE_IMG_DIR}/ROULETTE_BG_IMG.webp`;
const ROULETTE_CENTER_IMG = `${ROULETTE_IMG_DIR}/ROULETTE_CENTER_IMG.webp`;
const ROULETTE_MASCOT_IMG = `${ROULETTE_IMG_DIR}/ROULETTE_MASCOT_IMG.webp`;

const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const SEG = 360 / 37;
const SPIN_MS = 5600;
const CHIPS = [1, 5, 10, 50, 100];
const STAKE_RATE = 0.8; // 20% de comision se descuenta de cada apuesta

type BetType = 'straight' | 'dozen' | 'red' | 'black' | 'even' | 'odd';
type Tab = 'numero' | 'color' | 'paridad' | 'docena';

interface Bet { type: BetType; value?: number; amount: number }
interface SpinRow { result: number; color: string; total_bet: number; payout: number; created_at: string }
interface WinRow extends SpinRow { username: string | null }
interface AdminInfo {
  pool_pending: number; total_seeded: number; total_withdrawn: number; total_wagered: number;
  total_fees: number; total_paid: number; total_spins: number;
  difficulty_mid?: number; payout_factor?: number;
}
interface RouletteStatus {
  allowed: boolean;
  enabled?: boolean;
  docked?: boolean;
  balance?: number;
  bank_balance?: number;
  max_payout?: number;
  min_bet?: number;
  fee_pct?: number;
  max_bets?: number;
  last_numbers?: { n: number; color: string }[];
  history?: SpinRow[];
  recent_wins?: WinRow[];
  admin?: AdminInfo | null;
}
interface SpinResult {
  success: boolean; error?: string; result: number; color: string; total_bet: number; fee: number;
  stake: number; payout: number; net: number; winning_bets: number[]; balance: number; bank_balance: number; max_payout: number;
}

const colorOf = (n: number) => (n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black');
const betKey = (b: { type: BetType; value?: number }) => (b.value === undefined ? b.type : `${b.type}:${b.value}`);
const fmt = (v: number | undefined | null, d = 2) =>
  Number(v ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d });

function multFor(b: Bet, n: number): number {
  switch (b.type) {
    case 'straight': return b.value === n ? 36 : 0;
    case 'red': return n !== 0 && RED_NUMBERS.has(n) ? 2 : 0;
    case 'black': return n !== 0 && !RED_NUMBERS.has(n) ? 2 : 0;
    case 'even': return n !== 0 && n % 2 === 0 ? 2 : 0;
    case 'odd': return n % 2 === 1 ? 2 : 0;
    case 'dozen': return n >= 1 && b.value !== undefined && Math.ceil(n / 12) === b.value ? 3 : 0;
  }
}

function betLabel(b: Bet): string {
  switch (b.type) {
    case 'straight': return `Número ${b.value}`;
    case 'dozen': return `Docena ${b.value === 1 ? '1-12' : b.value === 2 ? '13-24' : '25-36'}`;
    case 'red': return 'Rojo';
    case 'black': return 'Negro';
    case 'even': return 'Par';
    case 'odd': return 'Impar';
  }
}

function NumberBadge({ n, size = 'md' }: { n: number; size?: 'sm' | 'md' | 'lg' }) {
  const c = colorOf(n);
  const bg = c === 'green' ? 'bg-emerald-600 ring-emerald-300/60' : c === 'red' ? 'bg-red-600 ring-red-300/50' : 'bg-zinc-900 ring-zinc-400/40';
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-14 h-14 text-2xl' : 'w-9 h-9 text-sm';
  return <span className={`${bg} ${sz} ring-1 rounded-full inline-flex items-center justify-center font-bold text-white shrink-0`}>{n}</span>;
}

// ─── Rueda ───────────────────────────────────────────
function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: 200 + r * Math.cos(a), y: 200 + r * Math.sin(a) };
}

function segmentPath(i: number, rOut: number, rIn: number) {
  const a0 = (i - 0.5) * SEG;
  const a1 = (i + 0.5) * SEG;
  const p0 = polar(rOut, a0), p1 = polar(rOut, a1), p2 = polar(rIn, a1), p3 = polar(rIn, a0);
  return `M${p0.x},${p0.y} A${rOut},${rOut} 0 0 1 ${p1.x},${p1.y} L${p2.x},${p2.y} A${rIn},${rIn} 0 0 0 ${p3.x},${p3.y} Z`;
}

function Wheel({ wheelRot, ballRot, spinning, highlight }: { wheelRot: number; ballRot: number; spinning: boolean; highlight: number | null }) {
  const ease = `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.08, 1)`;
  const hiIdx = highlight === null ? -1 : WHEEL_ORDER.indexOf(highlight);
  return (
    <div className="relative w-full max-w-[460px] aspect-square mx-auto select-none">
      {/* halo neon */}
      <div className="absolute -inset-4 rounded-full bg-fuchsia-600/25 blur-3xl roulette-pulse" />
      <div className="absolute inset-0 rounded-full shadow-[0_0_60px_rgba(217,70,239,0.55),inset_0_0_30px_rgba(0,0,0,0.8)]" />

      {/* rueda giratoria */}
      <div className="absolute inset-0" style={{ transform: `rotate(${wheelRot}deg)`, transition: spinning ? ease : 'none' }}>
        <svg viewBox="0 0 400 400" className="w-full h-full">
          <defs>
            <radialGradient id="rl-rim" cx="50%" cy="50%" r="50%">
              <stop offset="86%" stopColor="#7c2d12" />
              <stop offset="91%" stopColor="#fbbf24" />
              <stop offset="95%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#92400e" />
            </radialGradient>
            <radialGradient id="rl-cone" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b0764" />
              <stop offset="70%" stopColor="#1e1b4b" />
              <stop offset="100%" stopColor="#0f0a1f" />
            </radialGradient>
            <linearGradient id="rl-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#92400e" />
            </linearGradient>
          </defs>
          <circle cx="200" cy="200" r="198" fill="url(#rl-rim)" />
          <circle cx="200" cy="200" r="181" fill="#1c1917" stroke="url(#rl-gold)" strokeWidth="2" />
          {WHEEL_ORDER.map((n, i) => {
            const c = colorOf(n);
            const fill = c === 'green' ? '#059669' : c === 'red' ? '#b91c1c' : '#18181b';
            const t = polar(162, i * SEG);
            return (
              <g key={n}>
                <path d={segmentPath(i, 179, 128)} fill={fill} stroke="#d4a017" strokeWidth="0.8"
                  className={i === hiIdx ? 'roulette-hi' : undefined} />
                <text x={t.x} y={t.y} fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle" dominantBaseline="central"
                  transform={`rotate(${i * SEG} ${t.x} ${t.y})`} style={{ fontFamily: 'Orbitron, sans-serif' }}>{n}</text>
              </g>
            );
          })}
          <circle cx="200" cy="200" r="128" fill="none" stroke="url(#rl-gold)" strokeWidth="3" />
          <circle cx="200" cy="200" r="126" fill="url(#rl-cone)" />
          {/* separadores dorados del cono */}
          {Array.from({ length: 8 }).map((_, k) => {
            const p = polar(118, k * 45), q = polar(48, k * 45);
            return <line key={k} x1={q.x} y1={q.y} x2={p.x} y2={p.y} stroke="url(#rl-gold)" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />;
          })}
          <circle cx="200" cy="200" r="50" fill="url(#rl-gold)" />
          <circle cx="200" cy="200" r="44" fill="#2e1065" stroke="#fde68a" strokeWidth="1.5" />
          {!ROULETTE_CENTER_IMG && <text x="200" y="200" textAnchor="middle" dominantBaseline="central" fontSize="34">🦅</text>}
        </svg>
        {ROULETTE_CENTER_IMG && (
          <img src={ROULETTE_CENTER_IMG} alt="" draggable={false} className="absolute left-1/2 top-1/2 w-[24%] h-[24%] -translate-x-1/2 -translate-y-1/2 rounded-full object-contain drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]" />
        )}
      </div>

      {/* bola (gira en sentido contrario) */}
      <div className="absolute inset-0 pointer-events-none" style={{ transform: `rotate(${ballRot}deg)`, transition: spinning ? `transform ${SPIN_MS - 300}ms cubic-bezier(0.1, 0.55, 0.1, 1)` : 'none' }}>
        <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-white to-slate-300 shadow-[0_0_10px_rgba(255,255,255,0.9)]"
          style={{ top: '13.2%', width: '4.2%', height: '4.2%' }} />
      </div>

      {/* puntero dorado */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-2 z-10 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]">
        <svg width="34" height="40" viewBox="0 0 34 40"><path d="M17 40 L2 6 Q17 -4 32 6 Z" fill="url(#rl-ptr)" stroke="#78350f" strokeWidth="1.5" />
          <defs><linearGradient id="rl-ptr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fef3c7" /><stop offset="100%" stopColor="#d97706" /></linearGradient></defs>
        </svg>
      </div>
    </div>
  );
}

// ─── Efecto de monedas ───────────────────────────────
function CoinShower({ seed }: { seed: number }) {
  const coins = useMemo(() => Array.from({ length: 28 }).map((_, i) => ({
    left: ((i * 37 + seed * 13) % 100),
    delay: ((i * 53) % 900) / 1000,
    dur: 1.6 + ((i * 29) % 10) / 10,
    size: 18 + ((i * 7) % 14),
  })), [seed]);
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {coins.map((c, i) => (
        <span key={i} className="absolute roulette-coin" style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, fontSize: c.size }}>🪙</span>
      ))}
    </div>
  );
}

// ─── Pagina ──────────────────────────────────────────
export function RoulettePage() {
  const { profile, fetchProfile } = useAuthStore();
  const [status, setStatus] = useState<RouletteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [bets, setBets] = useState<Bet[]>([]);
  const [undoStack, setUndoStack] = useState<Bet[][]>([]);
  const [lastBets, setLastBets] = useState<Bet[]>([]);
  const [chip, setChip] = useState(1);
  const [tab, setTab] = useState<Tab>('numero');
  const [spinning, setSpinning] = useState(false);
  const [wheelRot, setWheelRot] = useState(0);
  const [ballRot, setBallRot] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [coinSeed, setCoinSeed] = useState(0);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [adminAmount, setAdminAmount] = useState('');
  const [midInput, setMidInput] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const spinningRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('casino_roulette_status');
    if (error) {
      setMessage({ type: 'error', text: 'No se pudo cargar la ruleta' });
    } else {
      setStatus(data as RouletteStatus);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(() => {
      if (!spinningRef.current && document.visibilityState === 'visible') load();
    }, 30000);
    const pending = timers.current;
    return () => { clearInterval(i); pending.forEach(clearTimeout); };
  }, [load]);

  const flash = (type: 'ok' | 'error', text: string) => {
    setMessage({ type, text });
    timers.current.push(setTimeout(() => setMessage(null), 5000));
  };

  const totalBet = bets.reduce((s, b) => s + b.amount, 0);
  const maxWin = useMemo(() => {
    let best = 0;
    for (let n = 0; n <= 36; n++) {
      const p = bets.reduce((s, b) => s + b.amount * STAKE_RATE * multFor(b, n), 0);
      if (p > best) best = p;
    }
    return best;
  }, [bets]);
  const betMap = useMemo(() => {
    const m = new Map<string, number>();
    bets.forEach((b) => m.set(betKey(b), (m.get(betKey(b)) ?? 0) + b.amount));
    return m;
  }, [bets]);

  const balance = Number(profile?.tung_balance ?? status?.balance ?? 0);
  const tableLimit = Number(status?.max_payout ?? 0);
  const maxBets = status?.max_bets ?? 40;
  const overLimit = bets.length > 0 && maxWin > tableLimit;
  const noFunds = totalBet > balance;

  const addBet = (type: BetType, value?: number) => {
    if (spinning) return;
    setShowResult(false);
    const key = betKey({ type, value });
    const idx = bets.findIndex((b) => betKey(b) === key);
    if (idx < 0 && bets.length >= maxBets) {
      flash('error', `Máximo ${maxBets} apuestas por tirada`);
      return;
    }
    setUndoStack((u) => [...u.slice(-30), bets]);
    if (idx >= 0) {
      const next = [...bets];
      next[idx] = { ...next[idx], amount: next[idx].amount + chip };
      setBets(next);
    } else {
      setBets([...bets, value === undefined ? { type, amount: chip } : { type, value, amount: chip }]);
    }
    unlockSfx();
    casinoSfx.chip();
  };

  const undo = () => {
    if (spinning || undoStack.length === 0) return;
    setBets(undoStack[undoStack.length - 1]);
    setUndoStack((u) => u.slice(0, -1));
  };
  const clearBets = () => { if (!spinning) { setUndoStack((u) => [...u.slice(-30), bets]); setBets([]); } };
  const repeatBets = () => { if (!spinning && lastBets.length) { setUndoStack((u) => [...u.slice(-30), bets]); setBets(lastBets); } };

  const stepChip = (dir: 1 | -1) => {
    const i = CHIPS.indexOf(chip);
    const next = CHIPS[Math.min(CHIPS.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
    setChip(next);
  };

  const spin = async () => {
    if (spinningRef.current || bets.length === 0) return;
    if (overLimit) { flash('error', `La ganancia máxima (${fmt(maxWin)}) supera el límite de la mesa (${fmt(tableLimit)} TUNG)`); return; }
    if (noFunds) { flash('error', 'Saldo TUNG insuficiente'); return; }

    unlockSfx();
    spinningRef.current = true;
    setSpinning(true);
    setShowResult(false);
    setMessage(null);
    const sent = bets.map((b) => (b.value === undefined ? { type: b.type, amount: b.amount } : { type: b.type, value: b.value, amount: b.amount }));

    let res: SpinResult | null = null;
    try {
      const { data, error } = await supabase.rpc('casino_roulette_spin', { p_bets: sent });
      if (error) throw error;
      res = data as SpinResult;
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Error de conexión');
    }
    if (!res || !res.success) {
      if (res?.error) flash('error', res.error);
      spinningRef.current = false;
      setSpinning(false);
      load();
      return;
    }

    const spun = res;
    const idx = WHEEL_ORDER.indexOf(spun.result);
    const jitter = (Math.random() - 0.5) * SEG * 0.5; // solo visual, dentro de la casilla ganadora
    setWheelRot((prev) => {
      const target = (((-idx * SEG + jitter) % 360) + 360) % 360;
      const cur = ((prev % 360) + 360) % 360;
      return prev + 360 * 5 + ((target - cur + 360) % 360);
    });
    setBallRot((prev) => prev - 360 * 7 - (((prev % 360) + 360) % 360));
    casinoSfx.rouletteSpin(SPIN_MS);
    setResult(spun);
    setLastBets(bets);

    timers.current.push(setTimeout(() => {
      spinningRef.current = false;
      setSpinning(false);
      setShowResult(true);
      // Fin de la partida: la mesa queda limpia (usar "Repetir" para volver a poner lo mismo)
      setBets([]);
      setUndoStack([]);
      if (spun.payout > 0) setCoinSeed((s) => s + 1);
      if (spun.payout > 0) casinoSfx.win(spun.payout >= spun.total_bet * 10 ? 'big' : 'small');
      else casinoSfx.lose();
      fetchProfile();
      load();
    }, SPIN_MS + 150));
  };

  const saveMid = async () => {
    const mid = Number(midInput);
    if (midInput.trim() === '' || !Number.isInteger(mid) || mid < 0 || mid > 100000000) {
      flash('error', 'Punto medio inválido');
      return;
    }
    setAdminBusy(true);
    try {
      const { data, error } = await supabase.rpc('casino_roulette_admin', { p_action: 'set_mid', p_amount: mid });
      if (error) throw error;
      const r = data as { success: boolean; error?: string };
      if (!r.success) flash('error', r.error || 'Error');
      else { flash('ok', 'Punto medio guardado'); setMidInput(''); }
      load();
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Error');
    } finally {
      setAdminBusy(false);
    }
  };

  const adminAction = async (action: 'deposit' | 'withdraw' | 'enable' | 'disable') => {
    const amount = Math.floor(Number(adminAmount));
    if ((action === 'deposit' || action === 'withdraw') && (!Number.isFinite(amount) || amount <= 0)) {
      flash('error', 'Cantidad inválida');
      return;
    }
    setAdminBusy(true);
    try {
      const { data, error } = await supabase.rpc('casino_roulette_admin', { p_action: action, p_amount: action === 'deposit' || action === 'withdraw' ? amount : null });
      if (error) throw error;
      const r = data as { success: boolean; error?: string };
      if (!r.success) flash('error', r.error || 'Error');
      else { flash('ok', 'Operación realizada'); setAdminAmount(''); }
      fetchProfile();
      load();
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Error');
    } finally {
      setAdminBusy(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-10 h-10 text-fuchsia-400 animate-spin" /></div>;
  }

  if (!status?.allowed) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-2xl border border-slate-700 bg-slate-900/80 p-6 text-center">
        <Lock className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <p className="text-white font-semibold">La Ruleta estará disponible próximamente</p>
        <Link to="/game/casino" className="inline-flex items-center gap-1 mt-4 text-sm text-fuchsia-300 hover:text-fuchsia-200"><ArrowLeft className="w-4 h-4" /> Volver al Casino</Link>
      </div>
    );
  }

  const won = showResult && result && result.payout > 0;
  const winIdx = new Set(showResult && result ? result.winning_bets : []);

  const cell = (type: BetType, value: number | undefined, label: ReactNode, cls: string) => {
    const amt = betMap.get(betKey({ type, value }));
    const isWin = showResult && result && multFor({ type, value, amount: 1 }, result.result) > 0;
    return (
      <button type="button" onClick={() => addBet(type, value)} disabled={spinning}
        className={`relative rounded-md font-bold text-white transition-all hover:brightness-125 hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed ${cls} ${isWin ? 'ring-2 ring-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.9)]' : 'ring-1 ring-white/10'}`}>
        {label}
        {amt !== undefined && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-[10px] leading-[22px] text-black font-extrabold shadow ring-1 ring-amber-900/50">
            {amt >= 1000 ? `${fmt(amt / 1000, 1)}K` : amt}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="relative isolate max-w-7xl mx-auto space-y-4 pb-8">
      <style>{`
        @keyframes roulettePulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        .roulette-pulse { animation: roulettePulse 3s ease-in-out infinite; }
        @keyframes rouletteHi { 0%,100% { filter: brightness(1.2) } 50% { filter: brightness(2.2) drop-shadow(0 0 6px #fde68a) } }
        .roulette-hi { animation: rouletteHi .9s ease-in-out infinite; stroke: #fde68a; stroke-width: 2.5; }
        @keyframes rouletteCoin { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 0 } 10% { opacity: 1 } 100% { transform: translateY(110vh) rotate(720deg); opacity: .9 } }
        .roulette-coin { top: 0; animation-name: rouletteCoin; animation-timing-function: cubic-bezier(.35,.1,.6,1); animation-fill-mode: both; }
        @keyframes rouletteGlow { 0%,100% { box-shadow: 0 0 18px rgba(251,191,36,.55) } 50% { box-shadow: 0 0 34px rgba(251,191,36,.95) } }
        .roulette-btn-glow { animation: rouletteGlow 2s ease-in-out infinite; }
      `}</style>

      {won && <CoinShower key={coinSeed} seed={coinSeed} />}

      {/* fondo */}
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        {ROULETTE_BG_IMG
          ? <>
              <img src={ROULETTE_BG_IMG} alt="" className="w-full h-full object-cover opacity-70" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/60" />
            </>
          : <div className="w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.35),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(219,39,119,0.25),transparent_60%)]" />}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link to="/game/casino" className="inline-flex items-center gap-1 text-sm text-fuchsia-300 hover:text-fuchsia-200"><ArrowLeft className="w-4 h-4" /> Casino</Link>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <div className="flex items-center gap-2 rounded-full bg-slate-900/80 ring-1 ring-amber-400/40 px-3 py-1.5">
            <Coins className="w-4 h-4 text-amber-300" />
            <span className="text-amber-200 font-bold text-sm">{fmt(balance)} TUNG</span>
          </div>
        </div>
      </div>

      {status.enabled === false && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> La ruleta está cerrada temporalmente.
        </div>
      )}
      {message && (
        <div className={`rounded-xl p-3 text-sm border ${message.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-200'}`}>{message.text}</div>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        {/* Rueda */}
        <div className="relative rounded-3xl border border-fuchsia-500/30 bg-slate-950/70 p-4 sm:p-6 overflow-hidden">
          {ROULETTE_MASCOT_IMG && (
            <img src={ROULETTE_MASCOT_IMG} alt="" draggable={false} className="hidden md:block xl:hidden 2xl:block absolute left-0 bottom-0 w-24 lg:w-28 2xl:w-40 pointer-events-none drop-shadow-[0_0_20px_rgba(217,70,239,0.6)]" />
          )}
          <Wheel wheelRot={wheelRot} ballRot={ballRot} spinning={spinning} highlight={showResult && result ? result.result : null} />

          {/* resultado */}
          <div className="mt-4 min-h-[72px] flex items-center justify-center">
            {spinning && <p className="font-orbitron text-fuchsia-200 tracking-widest animate-pulse">GIRANDO…</p>}
            {showResult && result && (
              <div className={`flex items-center gap-3 sm:gap-4 max-w-full rounded-2xl px-3 sm:px-5 py-3 ${won ? 'bg-amber-500/15 ring-2 ring-amber-400/70 roulette-btn-glow' : 'bg-slate-800/70 ring-1 ring-slate-600'}`}>
                <NumberBadge n={result.result} size="lg" />
                <div className="min-w-0">
                  {won ? (
                    <>
                      <p className="font-orbitron text-amber-300 font-bold text-base sm:text-lg break-words">¡GANASTE {fmt(result.payout)} TUNG!</p>
                      <p className="text-xs text-amber-100/80">Neto {result.net >= 0 ? '+' : ''}{fmt(result.net)} TUNG</p>
                    </>
                  ) : (
                    <>
                      <p className="font-orbitron text-slate-200 font-bold">Sin premio esta vez</p>
                      <p className="text-xs text-slate-400">−{fmt(result.total_bet)} TUNG</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Panel derecho */}
        <div className="rounded-3xl border border-fuchsia-500/30 bg-slate-950/80 p-4 space-y-4">
          <div>
            <h1 className="font-orbitron text-2xl font-extrabold tracking-widest bg-gradient-to-r from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-transparent">RULETA</h1>
            <p className="text-sm text-fuchsia-200/80">Gira la suerte, gana TUNG</p>
          </div>

          {/* fichas */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Ficha</p>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button key={c} type="button" onClick={() => setChip(c)}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full text-xs font-extrabold border-4 border-dashed transition-transform ${chip === c ? 'scale-110 border-amber-200 bg-gradient-to-br from-amber-300 to-amber-600 text-black shadow-[0_0_14px_rgba(251,191,36,0.8)]' : 'border-white/30 bg-gradient-to-br from-purple-700 to-fuchsia-900 text-white hover:scale-105'}`}>
                  {c >= 1000 ? `${c / 1000}K` : c}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => stepChip(-1)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"><Minus className="w-4 h-4" /></button>
              <div className="flex-1 text-center rounded-lg bg-slate-900 ring-1 ring-amber-400/30 py-2">
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Apuesta total</p>
                <p className="text-lg font-bold text-amber-200">{fmt(totalBet)} TUNG</p>
              </div>
              <button type="button" onClick={() => stepChip(1)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"><Plus className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className={`rounded-lg p-2 ring-1 ${overLimit ? 'bg-red-500/10 ring-red-500/50' : 'bg-slate-900 ring-slate-700'}`}>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Ganancia máxima</p>
              <p className={`font-bold ${overLimit ? 'text-red-300' : 'text-emerald-300'}`}>{fmt(maxWin)} TUNG</p>
            </div>
            <div className="rounded-lg p-2 ring-1 bg-slate-900 ring-slate-700">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Límite de mesa</p>
              <p className="font-bold text-fuchsia-200">{fmt(tableLimit, 0)} TUNG</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Comisión {status.fee_pct ?? 20}% por apuesta. Pagos sobre el 80% restante: número x{fmt(36 * STAKE_RATE, 1)}, docena x{fmt(3 * STAKE_RATE, 1)}, color / par-impar x{fmt(2 * STAKE_RATE, 1)}. Mínimo {status.min_bet ?? 1} TUNG por apuesta.
          </p>

          {bets.length > 0 && (
            <div className="max-h-28 overflow-y-auto rounded-lg bg-slate-900/70 ring-1 ring-slate-800 divide-y divide-slate-800 text-xs">
              {bets.map((b, i) => (
                <div key={betKey(b)} className={`flex justify-between px-2 py-1 ${winIdx.has(i) ? 'text-amber-300 font-bold' : 'text-slate-300'}`}>
                  <span>{betLabel(b)}</span><span>{fmt(b.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={undo} disabled={spinning || undoStack.length === 0} className="flex items-center justify-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs text-white py-2"><Undo2 className="w-3.5 h-3.5" /> Deshacer</button>
            <button type="button" onClick={clearBets} disabled={spinning || bets.length === 0} className="flex items-center justify-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs text-white py-2"><Trash2 className="w-3.5 h-3.5" /> Limpiar</button>
            <button type="button" onClick={repeatBets} disabled={spinning || lastBets.length === 0} className="flex items-center justify-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs text-white py-2"><RotateCcw className="w-3.5 h-3.5" /> Repetir</button>
          </div>

          <button type="button" onClick={spin}
            disabled={spinning || bets.length === 0 || status.enabled === false || overLimit || noFunds}
            className="w-full rounded-2xl py-4 font-orbitron text-xl font-extrabold tracking-[0.3em] text-black bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed roulette-btn-glow">
            {spinning ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'GIRAR'}
          </button>
          {!spinning && (() => {
            const reason = status.enabled === false
                ? 'La ruleta está cerrada temporalmente'
                : bets.length === 0
                  ? 'Coloca al menos una ficha en la mesa'
                  : overLimit
                    ? `La ganancia máxima (${fmt(maxWin)}) supera el límite de mesa (${fmt(tableLimit, 0)} TUNG). Reduce la apuesta.`
                    : noFunds
                      ? 'Saldo TUNG insuficiente'
                      : null;
            return reason && <p className="text-xs text-amber-300 text-center">{reason}</p>;
          })()}

          {/* historial */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1"><History className="w-3.5 h-3.5" /> Historial</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(status.history ?? []).length === 0 && <p className="text-xs text-slate-500">Aún no has jugado</p>}
              {(status.history ?? []).map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs rounded-md bg-slate-900/60 px-2 py-1">
                  <NumberBadge n={h.result} size="sm" />
                  <span className="text-slate-400">Apostado {fmt(h.total_bet)}</span>
                  <span className={`ml-auto font-bold ${h.payout > 0 ? 'text-emerald-300' : 'text-slate-500'}`}>{h.payout > 0 ? `+${fmt(h.payout)}` : '0'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ultimas ganancias */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-amber-300" /> Últimas ganancias</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(status.recent_wins ?? []).length === 0 && <p className="text-xs text-slate-500">Sin ganadores todavía</p>}
              {(status.recent_wins ?? []).map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-xs rounded-md bg-slate-900/60 px-2 py-1">
                  <NumberBadge n={w.result} size="sm" />
                  <span className="text-slate-300 truncate min-w-0">{w.username ?? 'Jugador'}</span>
                  <span className="ml-auto font-bold text-amber-300">+{fmt(w.payout)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ultimos numeros + tablero */}
      <div className="rounded-3xl border border-fuchsia-500/30 bg-slate-950/80 p-4 space-y-4">
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          <span className="text-[11px] uppercase tracking-widest text-slate-400 whitespace-nowrap">Últimos números</span>
          {(status.last_numbers ?? []).length === 0 && <span className="text-xs text-slate-500">—</span>}
          {(status.last_numbers ?? []).map((l, i) => <NumberBadge key={i} n={l.n} size={i === 0 ? 'md' : 'sm'} />)}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl bg-slate-900 p-1">
          {([['numero', 'NÚMERO'], ['color', 'COLOR'], ['paridad', 'PAR / IMPAR'], ['docena', 'DOCENA']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`min-w-0 truncate rounded-lg px-1 py-2 text-xs sm:text-sm font-orbitron font-bold tracking-wider transition ${tab === k ? 'bg-gradient-to-b from-fuchsia-500 to-purple-700 text-white shadow-[0_0_12px_rgba(217,70,239,0.6)]' : 'text-slate-400 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === 'numero' && (
          <div>
            {/* movil: tablero vertical 3 columnas */}
            <div className="sm:hidden grid grid-cols-3 gap-1">
              <div className="col-span-3 grid h-10">{cell('straight', 0, '0', 'bg-emerald-600 text-lg')}</div>
              {Array.from({ length: 36 }).map((_, i) => {
                const n = i + 1;
                return <div key={n} className="grid h-10">{cell('straight', n, n, colorOf(n) === 'red' ? 'bg-red-700' : 'bg-zinc-900')}</div>;
              })}
            </div>
            {/* tablet / escritorio: tablero horizontal */}
            <div className="hidden sm:block overflow-x-auto pt-2 pr-2">
            <div className="min-w-[540px] grid grid-cols-[44px_repeat(12,minmax(0,1fr))] grid-rows-3 gap-1">
              <div className="row-span-3 grid">{cell('straight', 0, '0', 'bg-emerald-600 text-lg')}</div>
              {[3, 2, 1].map((row) => Array.from({ length: 12 }).map((_, col) => {
                const n = col * 3 + row;
                return <div key={n} className="grid h-11">{cell('straight', n, n, colorOf(n) === 'red' ? 'bg-red-700' : 'bg-zinc-900')}</div>;
              }))}
            </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Pleno: paga x{fmt(36 * STAKE_RATE, 1)} sobre la apuesta.</p>
          </div>
        )}
        {tab === 'color' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid h-20">{cell('red', undefined, <span className="text-lg">ROJO <span className="text-xs opacity-80">x{fmt(2 * STAKE_RATE, 1)}</span></span>, 'bg-gradient-to-b from-red-600 to-red-800')}</div>
            <div className="grid h-20">{cell('black', undefined, <span className="text-lg">NEGRO <span className="text-xs opacity-80">x{fmt(2 * STAKE_RATE, 1)}</span></span>, 'bg-gradient-to-b from-zinc-700 to-zinc-950')}</div>
          </div>
        )}
        {tab === 'paridad' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid h-20">{cell('even', undefined, <span className="text-lg">PAR <span className="text-xs opacity-80">x{fmt(2 * STAKE_RATE, 1)}</span></span>, 'bg-gradient-to-b from-purple-600 to-purple-900')}</div>
            <div className="grid h-20">{cell('odd', undefined, <span className="text-lg">IMPAR <span className="text-xs opacity-80">x{fmt(2 * STAKE_RATE, 1)}</span></span>, 'bg-gradient-to-b from-fuchsia-600 to-fuchsia-900')}</div>
          </div>
        )}
        {tab === 'docena' && (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((d) => (
              <div key={d} className="grid h-20">{cell('dozen', d, <span className="text-base">{d === 1 ? '1 - 12' : d === 2 ? '13 - 24' : '25 - 36'}<span className="block text-xs opacity-80">x{fmt(3 * STAKE_RATE, 1)}</span></span>, 'bg-gradient-to-b from-indigo-600 to-indigo-900')}</div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-500">El 0 no paga color, par/impar ni docena. Resultado generado en el servidor de forma aleatoria segura.</p>
      </div>

      <CasinoLeaderboard game="roulette" accent="fuchsia" refreshKey={status.history?.[0]?.created_at} />

      {/* Admin */}
      {status.admin && (
        <div className="rounded-3xl border border-amber-500/30 bg-slate-950/80 p-4 space-y-3">
          <h2 className="font-orbitron text-sm font-bold text-amber-300 tracking-widest flex items-center gap-2"><Shield className="w-4 h-4" /> BANCO DE LA RULETA (ADMIN)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {([
              ['Banco', status.bank_balance], ['Apostado', status.admin.total_wagered], ['Comisiones', status.admin.total_fees],
              ['Pagado', status.admin.total_paid], ['Tiradas', status.admin.total_spins], ['Aportado', status.admin.total_seeded],
              ['Retirado', status.admin.total_withdrawn], ['Pool pendiente', status.admin.pool_pending],
            ] as [string, number | undefined][]).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-900 ring-1 ring-slate-800 p-2">
                <p className="text-slate-400">{k}</p>
                <p className="text-white font-bold">{fmt(v)}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" min={1} step={1} value={adminAmount} onChange={(e) => setAdminAmount(e.target.value)} placeholder="Cantidad TUNG"
              className="w-40 rounded-lg bg-slate-900 ring-1 ring-slate-700 px-3 py-2 text-sm text-white" />
            <button type="button" disabled={adminBusy} onClick={() => adminAction('deposit')} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-3 py-2 text-xs font-bold text-white">Depositar</button>
            <button type="button" disabled={adminBusy} onClick={() => adminAction('withdraw')} className="rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 px-3 py-2 text-xs font-bold text-white">Retirar</button>
            <button type="button" disabled={adminBusy} onClick={() => adminAction(status.enabled ? 'disable' : 'enable')} className={`rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40 ${status.enabled ? 'bg-red-700 hover:bg-red-600' : 'bg-fuchsia-700 hover:bg-fuchsia-600'}`}>
              {status.enabled ? 'Cerrar ruleta' : 'Abrir ruleta'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900/60 ring-1 ring-slate-800 p-2">
            <span className="text-xs text-slate-300">Punto medio de dificultad: <b className="text-white">{fmt(status.admin.difficulty_mid)}</b> · Premio actual: <b className="text-white">{Math.round((status.admin.payout_factor ?? 0) * 1000) / 10}%</b></span>
            <input type="number" min={0} step={1} value={midInput} onChange={(e) => setMidInput(e.target.value)} placeholder="Nuevo punto medio"
              className="w-40 rounded-lg bg-slate-900 ring-1 ring-slate-700 px-3 py-2 text-sm text-white" />
            <button type="button" disabled={adminBusy} onClick={saveMid} className="rounded-lg bg-sky-700 hover:bg-sky-600 disabled:opacity-40 px-3 py-2 text-xs font-bold text-white">Guardar</button>
          </div>
          <p className="text-[11px] text-slate-500">En el punto medio: premios al 90%. Por cada 1.000 TUNG por encima, el recorte se reduce un 30% (93%, 95,1%, 96,6%…). Por cada 1.000 por debajo, el recorte crece un 43% (85,7%, 79,6%, 70,9%, 58,4%… mínimo 50%).</p>
          <p className="text-[11px] text-slate-500">Depósitos y retiros usan la billetera de la empresa. El límite de premio por tirada es el 10% del banco (plenos requieren banco ≥ 2.880 TUNG con apuesta mínima).</p>
        </div>
      )}
    </div>
  );
}
