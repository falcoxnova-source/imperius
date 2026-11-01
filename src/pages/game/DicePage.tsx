import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Coins, History, Loader2, Lock, Minus, Plus, RotateCcw, Shield, Trash2, Trophy, Undo2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { casinoSfx } from '../../lib/casinoSfx';
import { unlockSfx } from '../../lib/sfx';
import { SoundToggle } from '../../components/game/SoundToggle';
import { CasinoLeaderboard } from '../../components/game/CasinoLeaderboard';

// Imagenes opcionales: `/Imagenes/Casino%20Galaxtico/Dados/<archivo>.webp` ('' = usa el fondo generado)
const DICE_BG_IMG: string = '';
const DICE_MASCOT_IMG: string = '';

const CHIPS = [1, 5, 10, 50, 100];
const STAKE_RATE = 0.8; // 20% de comision se descuenta de cada apuesta
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ROLL_MS = REDUCED_MOTION ? 400 : 2600;

type BetType = 'small' | 'big' | 'odd' | 'even' | 'single' | 'double' | 'triple' | 'any_triple' | 'total' | 'combo';

interface Bet { type: BetType; value?: number; amount: number }
interface RollRow { dice: number[]; total: number; total_bet: number; payout: number; created_at: string }
interface WinRow extends RollRow { username: string | null }
interface AdminInfo {
  pool_pending: number; total_seeded: number; total_withdrawn: number; total_wagered: number;
  total_fees: number; total_paid: number; total_rolls: number; day_loss: number; day_limit: number;
  difficulty_mid?: number; payout_factor?: number;
}
interface DiceStatus {
  allowed: boolean;
  enabled?: boolean;
  balance?: number;
  bank_balance?: number;
  max_payout?: number;
  day_room?: number;
  min_bet?: number;
  fee_pct?: number;
  max_bets?: number;
  last_rolls?: { dice: number[]; total: number }[];
  history?: RollRow[];
  recent_wins?: WinRow[];
  admin?: AdminInfo | null;
}
interface RollResult {
  success: boolean; error?: string; dice: number[]; total: number; total_bet: number; fee: number;
  stake: number; payout: number; net: number; winning_bets: number[]; balance: number; bank_balance: number; max_payout: number;
}

const TOTAL_MULT: Record<number, number> = { 4: 61, 17: 61, 5: 31, 16: 31, 6: 18, 15: 18, 7: 13, 14: 13, 8: 9, 13: 9, 9: 7, 12: 7, 10: 7, 11: 7 };
const COMBOS: number[] = [];
for (let a = 1; a <= 5; a++) for (let b = a + 1; b <= 6; b++) COMBOS.push(a * 10 + b);

const betKey = (b: { type: BetType; value?: number }) => (b.value === undefined ? b.type : `${b.type}:${b.value}`);
const fmt = (v: number | undefined | null, d = 2) =>
  Number(v ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d });
const eff = (m: number) => `x${fmt(m * STAKE_RATE, 1)}`;

// Multiplicador total (incluye lo jugado). Mismo calculo que _dice_payout_mult en el servidor.
function multFor(b: { type: BetType; value?: number }, d: number[]): number {
  const [a, c, e] = d;
  const sum = a + c + e;
  const triple = a === c && c === e;
  const cnt = b.value === undefined ? 0 : d.filter((x) => x === b.value).length;
  switch (b.type) {
    case 'small': return !triple && sum >= 4 && sum <= 10 ? 2 : 0;
    case 'big': return !triple && sum >= 11 && sum <= 17 ? 2 : 0;
    case 'odd': return !triple && sum % 2 === 1 ? 2 : 0;
    case 'even': return !triple && sum % 2 === 0 ? 2 : 0;
    case 'single': return cnt > 0 ? 1 + cnt : 0;
    case 'double': return cnt >= 2 ? 11 : 0;
    case 'triple': return triple && a === b.value ? 181 : 0;
    case 'any_triple': return triple ? 31 : 0;
    case 'total': return b.value === sum ? TOTAL_MULT[sum] ?? 0 : 0;
    case 'combo': return b.value !== undefined && d.includes(Math.floor(b.value / 10)) && d.includes(b.value % 10) ? 6 : 0;
  }
}

function betLabel(b: Bet): string {
  switch (b.type) {
    case 'small': return 'Chico (4-10)';
    case 'big': return 'Grande (11-17)';
    case 'odd': return 'Impar';
    case 'even': return 'Par';
    case 'single': return `Número ${b.value}`;
    case 'double': return `Doble ${b.value}-${b.value}`;
    case 'triple': return `Triple ${b.value}-${b.value}-${b.value}`;
    case 'any_triple': return 'Cualquier triple';
    case 'total': return `Total ${b.value}`;
    case 'combo': return `Pareja ${Math.floor((b.value ?? 0) / 10)}-${(b.value ?? 0) % 10}`;
  }
}

// ─── Dados ───────────────────────────────────────────
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Pips({ n, pip }: { n: number; pip: string }) {
  const red = n === 1 || n === 4;
  return (
    <div className="grid grid-cols-3 grid-rows-3 w-full h-full p-[16%] gap-[6%]">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIPS[n].includes(i) && (
            <span className={`${pip} rounded-full ${red ? 'bg-gradient-to-br from-rose-400 to-red-700' : 'bg-gradient-to-br from-slate-600 to-slate-950'} shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]`} />
          )}
        </span>
      ))}
    </div>
  );
}

function MiniDie({ n, size = 'sm' }: { n: number; size?: 'xs' | 'sm' | 'md' }) {
  const sz = size === 'xs' ? 'w-4 h-4' : size === 'md' ? 'w-8 h-8' : 'w-6 h-6';
  const pip = size === 'xs' ? 'w-[3px] h-[3px]' : size === 'md' ? 'w-1.5 h-1.5' : 'w-1 h-1';
  return (
    <span className={`${sz} inline-block shrink-0 rounded-[22%] bg-gradient-to-br from-white to-slate-200 ring-1 ring-black/20 shadow`}>
      <Pips n={n} pip={pip} />
    </span>
  );
}

// Cara al frente: 1 frente, 6 atras, 2 derecha, 5 izquierda, 3 arriba, 4 abajo
const FACE_TF: Record<number, string> = {
  1: 'rotateY(0deg)', 6: 'rotateY(180deg)', 2: 'rotateY(90deg)', 5: 'rotateY(-90deg)', 3: 'rotateX(90deg)', 4: 'rotateX(-90deg)',
};
const SHOW: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 }, 6: { x: 0, y: 180 }, 2: { x: 0, y: -90 }, 5: { x: 0, y: 90 }, 3: { x: -90, y: 0 }, 4: { x: 90, y: 0 },
};
interface Rot { x: number; y: number; z: number }
const mod360 = (v: number) => ((v % 360) + 360) % 360;
const nextAngle = (prev: number, target: number, turns: number) => prev - mod360(prev) + 360 * turns + target;
const restRot = (n: number): Rot => ({ x: SHOW[n].x, y: SHOW[n].y, z: 0 });

function Die3D({ rot, rolling, delay, win }: { rot: Rot; rolling: boolean; delay: number; win: boolean }) {
  const anim = rolling ? { animationDelay: `${delay}ms` } : undefined;
  return (
    <div className={`dice-wrap ${rolling ? 'dice-rolling' : ''}`}>
      {/* la sombra se encoge y aclara cuando el dado esta en el aire */}
      <div className={`dice-shadow ${rolling ? 'dice-shadow-toss' : ''}`} style={anim} />
      <div className={`dice-lift ${rolling ? 'dice-toss' : ''} ${win ? 'dice-win-bob' : ''}`} style={anim}>
        <div className="dice-cube"
          style={{
            transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg) rotateZ(${rot.z}deg)`,
            transition: rolling ? `transform ${ROLL_MS - delay}ms cubic-bezier(0.15, 0.7, 0.2, 1) ${delay}ms` : 'none',
          }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className={`dice-face ${win ? 'dice-face-win' : ''}`} style={{ transform: `${FACE_TF[n]} translateZ(calc(var(--die) / 2))`, ...anim }}>
              <Pips n={n} pip="w-[70%] h-[70%]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Bombillas sobre el arco frontal de la base dorada
const BULBS = Array.from({ length: 15 }).map((_, k) => {
  const t = Math.PI * (k / 14);
  return { left: 50 - 46 * Math.cos(t), top: 50 + 34 * Math.sin(t) };
});

function Dome({ rots, rolling, win, big }: { rots: Rot[]; rolling: boolean; win: boolean; big: boolean }) {
  const tiltRef = useRef<HTMLDivElement>(null);
  // Inclinacion 3D de la cupula siguiendo el raton
  const onTilt = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el || REDUCED_MOTION) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(3 - y * 8).toFixed(2)}deg)`;
  };
  const resetTilt = () => { if (tiltRef.current) tiltRef.current.style.transform = ''; };
  return (
    <div className="relative w-full max-w-[460px] mx-auto" style={{ perspective: '1100px' }} onMouseMove={onTilt} onMouseLeave={resetTilt}>
    <div ref={tiltRef} className="dice-dome">
    <div className={`relative w-full aspect-square select-none ${rolling ? 'dice-shake' : big ? 'dice-shake-big' : ''}`}>
      <div className={`absolute -inset-4 rounded-full blur-3xl dice-pulse ${win ? 'bg-amber-400/40' : 'bg-amber-500/20'}`} />
      {/* base dorada */}
      <div className="absolute inset-x-[6%] bottom-[4%] h-[18%] rounded-[50%] bg-gradient-to-b from-amber-300 via-amber-600 to-amber-900 shadow-[0_10px_40px_rgba(0,0,0,0.7)]">
        {BULBS.map((b, k) => (
          <span key={k} className={`absolute w-[3.2%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-100 shadow-[0_0_8px_3px_rgba(253,230,138,0.9)] dice-bulb ${rolling || win ? 'dice-bulb-fast' : ''}`}
            style={{ left: `${b.left}%`, top: `${b.top}%`, animationDelay: `${(k % 3) * 0.2}s` }} />
        ))}
      </div>
      {/* cupula de cristal */}
      <div className="absolute inset-[4%] bottom-[12%] rounded-full overflow-hidden ring-2 ring-amber-200/40 bg-[radial-gradient(circle_at_50%_70%,rgba(124,58,237,0.55),rgba(30,27,75,0.85)_60%,rgba(8,6,25,0.95))] shadow-[inset_0_0_60px_rgba(255,255,255,0.12),0_0_50px_rgba(251,191,36,0.35)]">
        {/* fieltro */}
        <div className="absolute inset-x-[10%] bottom-[8%] h-[30%] rounded-[50%] bg-gradient-to-b from-emerald-700/70 to-emerald-950/90 ring-1 ring-amber-300/40" />
        {/* dados: el del centro mas al fondo y algo mas pequeno (profundidad) */}
        <div className="absolute inset-0 flex items-end justify-center pb-[18%] gap-[6%]">
          {rots.map((r, i) => (
            <div key={i} style={{ transform: i === 1 ? 'translateY(-22%) scale(0.9)' : undefined, zIndex: i === 1 ? 0 : 1 }}>
              <Die3D rot={r} rolling={rolling} delay={i * 120} win={win} />
            </div>
          ))}
        </div>
        {/* curvatura y brillos del cristal (por encima de los dados) */}
        <div className="absolute inset-0 rounded-full shadow-[inset_0_-30px_60px_rgba(0,0,0,0.45),inset_0_20px_40px_rgba(255,255,255,0.08)] pointer-events-none" />
        <div className="absolute left-[14%] top-[10%] w-[30%] h-[18%] rounded-[50%] bg-white/15 blur-md rotate-[-25deg] pointer-events-none" />
        <div className="absolute right-[18%] top-[22%] w-[8%] h-[8%] rounded-full bg-white/20 blur-sm pointer-events-none" />
        <div className="absolute inset-y-0 left-[22%] w-[14%] -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none dice-glass-sweep" />
      </div>
    </div>
    </div>
    </div>
  );
}

// Contador animado del premio
function CountUp({ value, ms = 1000 }: { value: number; ms?: number }) {
  const [v, setV] = useState(REDUCED_MOTION ? value : 0);
  useEffect(() => {
    if (REDUCED_MOTION) { setV(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{fmt(v)}</>;
}

// ─── Efecto de monedas ───────────────────────────────
function CoinShower({ seed, big }: { seed: number; big: boolean }) {
  const coins = useMemo(() => Array.from({ length: big ? 44 : 24 }).map((_, i) => ({
    left: ((i * 37 + seed * 13) % 100),
    delay: ((i * 53) % 900) / 1000,
    dur: 1.6 + ((i * 29) % 10) / 10,
    size: 18 + ((i * 7) % 14),
  })), [seed, big]);
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {coins.map((c, i) => (
        <span key={i} className="absolute dice-coin" style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, fontSize: c.size }}>🪙</span>
      ))}
    </div>
  );
}

// ─── Pagina ──────────────────────────────────────────
export function DicePage() {
  const { profile, fetchProfile } = useAuthStore();
  const [status, setStatus] = useState<DiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [bets, setBets] = useState<Bet[]>([]);
  const [undoStack, setUndoStack] = useState<Bet[][]>([]);
  const [lastBets, setLastBets] = useState<Bet[]>([]);
  const [chip, setChip] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [rots, setRots] = useState<Rot[]>([restRot(5), restRot(3), restRot(6)]);
  const [result, setResult] = useState<RollResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [coinSeed, setCoinSeed] = useState(0);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [adminAmount, setAdminAmount] = useState('');
  const [midInput, setMidInput] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const rollingRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const domeRef = useRef<HTMLDivElement>(null);
  const [rollBtn, setRollBtn] = useState<HTMLButtonElement | null>(null);
  const [rollBtnVisible, setRollBtnVisible] = useState(true);

  // Barra fija con LANZAR cuando el boton principal no esta en pantalla (movil / tablero abajo)
  useEffect(() => {
    if (!rollBtn || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setRollBtnVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(rollBtn);
    return () => io.disconnect();
  }, [rollBtn]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('casino_dice_status');
    if (error) {
      setMessage({ type: 'error', text: 'No se pudo cargar la mesa de dados' });
    } else {
      setStatus(data as DiceStatus);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(() => {
      if (!rollingRef.current && document.visibilityState === 'visible') load();
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
    for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) for (let c = b; c <= 6; c++) {
      const p = bets.reduce((s, x) => s + x.amount * STAKE_RATE * multFor(x, [a, b, c]), 0);
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
  const dayRoom = Number(status?.day_room ?? 0);
  const maxBets = status?.max_bets ?? 40;
  const overLimit = bets.length > 0 && maxWin > tableLimit;
  const overDay = bets.length > 0 && !overLimit && maxWin - totalBet * STAKE_RATE > dayRoom;
  const noFunds = totalBet > balance;

  const addBet = (type: BetType, value?: number) => {
    if (rolling) return;
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
    if (rolling || undoStack.length === 0) return;
    setBets(undoStack[undoStack.length - 1]);
    setUndoStack((u) => u.slice(0, -1));
  };
  const clearBets = () => { if (!rolling) { setUndoStack((u) => [...u.slice(-30), bets]); setBets([]); } };
  const repeatBets = () => { if (!rolling && lastBets.length) { setUndoStack((u) => [...u.slice(-30), bets]); setBets(lastBets); } };

  const stepChip = (dir: 1 | -1) => {
    const i = CHIPS.indexOf(chip);
    setChip(CHIPS[Math.min(CHIPS.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))]);
  };

  const roll = async () => {
    if (rollingRef.current || bets.length === 0) return;
    if (overLimit) { flash('error', `La ganancia máxima (${fmt(maxWin)}) supera el límite de la mesa (${fmt(tableLimit, 0)} TUNG)`); return; }
    if (overDay) { flash('error', 'La apuesta supera el límite diario de la mesa. Prueba con una apuesta menor.'); return; }
    if (noFunds) { flash('error', 'Saldo TUNG insuficiente'); return; }

    unlockSfx();
    rollingRef.current = true;
    setRolling(true);
    setShowResult(false);
    setMessage(null);
    // Si se lanza desde el tablero (movil), llevar la cupula a la vista
    const dr = domeRef.current?.getBoundingClientRect();
    if (dr && (dr.top < 0 || dr.bottom > window.innerHeight)) {
      domeRef.current?.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' });
    }
    const sent = bets.map((b) => (b.value === undefined ? { type: b.type, amount: b.amount } : { type: b.type, value: b.value, amount: b.amount }));

    let res: RollResult | null = null;
    try {
      const { data, error } = await supabase.rpc('casino_dice_roll', { p_bets: sent });
      if (error) throw error;
      res = data as RollResult;
    } catch (e) {
      flash('error', e instanceof Error ? e.message : 'Error de conexión');
    }
    if (!res || !res.success) {
      if (res?.error) flash('error', res.error);
      rollingRef.current = false;
      setRolling(false);
      load();
      return;
    }

    const rolled = res;
    setRots((prev) => prev.map((p, i) => {
      const t = SHOW[rolled.dice[i]];
      return { x: nextAngle(p.x, t.x, 3 + i), y: nextAngle(p.y, t.y, 2 + i), z: nextAngle(p.z, 0, 1 + (i % 2)) };
    }));
    casinoSfx.diceRoll(ROLL_MS, rolled.dice.length);
    setResult(rolled);
    setLastBets(bets);

    timers.current.push(setTimeout(() => {
      rollingRef.current = false;
      setRolling(false);
      setShowResult(true);
      setBets([]);
      setUndoStack([]);
      if (rolled.payout > 0) setCoinSeed((s) => s + 1);
      if (rolled.payout > 0) {
        const triple = rolled.dice.length > 1 && rolled.dice.every((d) => d === rolled.dice[0]);
        casinoSfx.win(rolled.payout >= rolled.total_bet * 10 || triple ? 'big' : 'small');
      } else casinoSfx.lose();
      fetchProfile();
      load();
    }, ROLL_MS + 150));
  };

  const saveMid = async () => {
    const mid = Number(midInput);
    if (midInput.trim() === '' || !Number.isInteger(mid) || mid < 0 || mid > 100000000) {
      flash('error', 'Punto medio inválido');
      return;
    }
    setAdminBusy(true);
    try {
      const { data, error } = await supabase.rpc('casino_dice_admin', { p_action: 'set_mid', p_amount: mid });
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
      const { data, error } = await supabase.rpc('casino_dice_admin', { p_action: action, p_amount: action === 'deposit' || action === 'withdraw' ? amount : null });
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
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-10 h-10 text-amber-400 animate-spin" /></div>;
  }

  if (!status?.allowed) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-2xl border border-slate-700 bg-slate-900/80 p-6 text-center">
        <Lock className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <p className="text-white font-semibold">La mesa de dados estará disponible próximamente</p>
        <Link to="/game/casino" className="inline-flex items-center gap-1 mt-4 text-sm text-amber-300 hover:text-amber-200"><ArrowLeft className="w-4 h-4" /> Volver al Casino</Link>
      </div>
    );
  }

  const won = !!(showResult && result && result.payout > 0);
  const winIdx = new Set(showResult && result ? result.winning_bets : []);
  const resDice = showResult && result ? result.dice : null;
  const resTriple = resDice ? resDice[0] === resDice[1] && resDice[1] === resDice[2] : false;
  const bigWin = won && !!result && (result.payout >= result.total_bet * 10 || resTriple);
  // Tras la tirada se muestran las apuestas jugadas con sus premios
  const showingLast = showResult && bets.length === 0 && lastBets.length > 0;
  const shownBets = showingLast ? lastBets : bets;

  const cell = (type: BetType, value: number | undefined, label: ReactNode, cls: string) => {
    const amt = betMap.get(betKey({ type, value }));
    const isWin = !!resDice && multFor({ type, value }, resDice) > 0;
    return (
      <button type="button" onClick={() => addBet(type, value)} disabled={rolling}
        className={`dice-cell relative w-full h-full rounded-lg font-bold text-white hover:brightness-125 disabled:cursor-not-allowed ${cls} ${isWin ? 'ring-2 ring-amber-300 dice-cell-win' : 'ring-1 ring-white/10'}`}>
        {label}
        {amt !== undefined && (
          <span key={amt} className="dice-chip absolute -top-1.5 -right-1.5 z-10 min-w-[22px] h-[22px] px-1 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 text-[10px] leading-[22px] text-black font-extrabold ring-1 ring-amber-900/50">
            {amt >= 1000 ? `${fmt(amt / 1000, 1)}K` : amt}
          </span>
        )}
      </button>
    );
  };
  const odds = (t: string) => <span className="block text-[10px] font-semibold text-amber-200/90">{t}</span>;

  return (
    <div className="relative isolate max-w-7xl mx-auto space-y-4 pb-24">
      <style>{`
        .dice-wrap { --die: clamp(52px, 15vw, 92px); position: relative; width: var(--die); height: var(--die); }
        .dice-lift { position: absolute; inset: 0; transform-style: preserve-3d; perspective: 600px; }
        .dice-cube { position: absolute; inset: 0; transform-style: preserve-3d; }
        .dice-face { position: absolute; inset: 0; border-radius: 18%; background: radial-gradient(circle at 30% 25%, #ffffff, #e2e8f0 60%, #cbd5e1); box-shadow: inset 0 0 0 2px rgba(0,0,0,.08), inset 0 -6px 12px rgba(0,0,0,.18), inset 0 4px 6px rgba(255,255,255,.9); backface-visibility: hidden; }
        .dice-face-win { box-shadow: inset 0 0 0 2px rgba(251,191,36,.9), inset 0 -6px 12px rgba(0,0,0,.15), 0 0 18px rgba(251,191,36,.8); }
        .dice-shadow { position: absolute; left: 8%; right: 8%; bottom: -16%; height: 16%; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(0,0,0,.6), rgba(0,0,0,0) 70%); }
        @keyframes diceToss { 0% { transform: translateY(0) } 18% { transform: translateY(-85%) } 36% { transform: translateY(0) } 50% { transform: translateY(-38%) } 64% { transform: translateY(0) } 74% { transform: translateY(-12%) } 84%,100% { transform: translateY(0) } }
        .dice-toss { animation: diceToss ${ROLL_MS}ms cubic-bezier(.3,.6,.4,1) both; }
        @keyframes diceShadowToss { 0% { transform: scale(1); opacity: 1 } 18% { transform: scale(.45); opacity: .35 } 36% { transform: scale(1.1); opacity: 1 } 50% { transform: scale(.7); opacity: .6 } 64% { transform: scale(1.05); opacity: 1 } 74% { transform: scale(.88); opacity: .85 } 84%,100% { transform: scale(1); opacity: 1 } }
        .dice-shadow-toss { animation: diceShadowToss ${ROLL_MS}ms cubic-bezier(.3,.6,.4,1) both; }
        @keyframes diceBlur { 0% { filter: blur(0) } 12% { filter: blur(1.8px) } 60% { filter: blur(1.2px) } 85%,100% { filter: blur(0) } }
        .dice-rolling .dice-face { animation: diceBlur ${ROLL_MS}ms linear both; }
        @keyframes diceBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8%) } }
        .dice-win-bob { animation: diceBob 1.4s ease-in-out infinite; }
        .dice-dome { transform: rotateX(3deg); transform-style: preserve-3d; transition: transform .25s ease-out; will-change: transform; }
        @keyframes diceShake { 0%,100% { transform: translate(0,0) } 10% { transform: translate(-4px,1px) rotate(-1deg) } 20% { transform: translate(4px,-1px) rotate(1deg) } 30% { transform: translate(-3px,0) } 40% { transform: translate(3px,1px) } 50% { transform: translate(0,0) } }
        .dice-shake { animation: diceShake 700ms ease-in-out 1; }
        @keyframes diceShakeBig { 0%,100% { transform: translate(0,0) } 10%,50%,90% { transform: translate(-6px,2px) } 30%,70% { transform: translate(6px,-2px) } }
        .dice-shake-big { animation: diceShakeBig .5s ease-in-out 3; }
        @keyframes dicePulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        .dice-pulse { animation: dicePulse 3s ease-in-out infinite; }
        @keyframes diceBulb { 0%,100% { opacity: .3 } 50% { opacity: 1 } }
        .dice-bulb { animation: diceBulb 1.2s ease-in-out infinite; }
        .dice-bulb-fast { animation-duration: .3s !important; }
        @keyframes diceSweep { 0%,70% { transform: translateX(-180%) skewX(-12deg) } 100% { transform: translateX(520%) skewX(-12deg) } }
        .dice-glass-sweep { animation: diceSweep 7s ease-in-out infinite; }
        @keyframes diceCoin { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 0 } 10% { opacity: 1 } 100% { transform: translateY(110vh) rotate(720deg); opacity: .9 } }
        .dice-coin { top: 0; animation-name: diceCoin; animation-timing-function: cubic-bezier(.35,.1,.6,1); animation-fill-mode: both; }
        @keyframes diceGlow { 0%,100% { box-shadow: 0 0 18px rgba(251,191,36,.55) } 50% { box-shadow: 0 0 34px rgba(251,191,36,.95) } }
        .dice-btn-glow { animation: diceGlow 2s ease-in-out infinite; }
        @keyframes diceFlash { 0% { opacity: 0 } 15% { opacity: .6 } 100% { opacity: 0 } }
        .dice-flash { background: radial-gradient(circle at center, rgba(253,230,138,.9), rgba(245,158,11,.35) 45%, transparent 75%); animation: diceFlash 1.2s ease-out both; }
        .dice-btn3d { box-shadow: 0 6px 0 #92400e, 0 12px 22px rgba(0,0,0,.55), inset 0 2px 0 rgba(255,255,255,.6); transition: transform .08s, box-shadow .08s, filter .15s; }
        .dice-btn3d:active:not(:disabled) { transform: translateY(4px); box-shadow: 0 2px 0 #92400e, 0 4px 10px rgba(0,0,0,.5), inset 0 2px 0 rgba(255,255,255,.6); }
        .dice-cell { box-shadow: 0 4px 0 rgba(0,0,0,.55), 0 6px 12px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.25); transition: transform .08s, box-shadow .08s, filter .15s; }
        .dice-cell:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 0 rgba(0,0,0,.55), 0 10px 18px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.25); }
        .dice-cell:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 rgba(0,0,0,.55), 0 2px 4px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.2); }
        @keyframes diceCellWin { 0%,100% { box-shadow: 0 4px 0 rgba(0,0,0,.55), 0 0 8px rgba(251,191,36,.6) } 50% { box-shadow: 0 4px 0 rgba(0,0,0,.55), 0 0 22px rgba(251,191,36,1) } }
        .dice-cell-win { animation: diceCellWin .9s ease-in-out infinite; }
        @keyframes diceChip { 0% { transform: translateY(-14px) scale(1.3); opacity: 0 } 60% { transform: translateY(1px) scale(.95); opacity: 1 } 100% { transform: translateY(0) scale(1) } }
        .dice-chip { box-shadow: 0 2px 0 #78350f, 0 3px 6px rgba(0,0,0,.6); animation: diceChip .22s ease-out; }
        @keyframes diceStars { from { background-position: 0 0 } to { background-position: 0 600px } }
        @keyframes diceStars2 { from { background-position: 0 0 } to { background-position: 0 920px } }
        .dice-stars { background-image: radial-gradient(1px 1px at 20px 30px, #fff, transparent), radial-gradient(1px 1px at 120px 80px, #fde68a, transparent), radial-gradient(1.5px 1.5px at 200px 150px, #fff, transparent), radial-gradient(1px 1px at 300px 40px, #fcd34d, transparent), radial-gradient(1px 1px at 80px 220px, #fff, transparent), radial-gradient(1px 1px at 260px 260px, #c4b5fd, transparent); background-size: 340px 300px; animation: diceStars 70s linear infinite; }
        .dice-stars2 { background-image: radial-gradient(2px 2px at 60px 90px, #fff, transparent), radial-gradient(1.5px 1.5px at 380px 200px, #fcd34d, transparent), radial-gradient(2px 2px at 220px 380px, #fde68a, transparent), radial-gradient(1.5px 1.5px at 460px 40px, #fff, transparent); background-size: 520px 460px; animation: diceStars2 45s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .dice-toss, .dice-shadow-toss, .dice-rolling .dice-face, .dice-win-bob, .dice-shake, .dice-shake-big, .dice-pulse, .dice-bulb, .dice-glass-sweep, .dice-btn-glow, .dice-cell-win, .dice-chip, .dice-stars, .dice-stars2 { animation: none !important; }
          .dice-flash { display: none; }
          .dice-dome { transform: none !important; }
        }
      `}</style>

      {won && !REDUCED_MOTION && <CoinShower key={coinSeed} seed={coinSeed} big={bigWin} />}
      {bigWin && !REDUCED_MOTION && <div key={`f${coinSeed}`} className="pointer-events-none fixed inset-0 z-40 dice-flash" />}

      {/* fondo con estrellas en dos capas (paralaje) */}
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        {DICE_BG_IMG
          ? <>
              <img src={DICE_BG_IMG} alt="" className="w-full h-full object-cover opacity-70" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/60" />
            </>
          : <div className="w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.25),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(147,51,234,0.3),transparent_60%)]" />}
        <div className="absolute inset-0 dice-stars opacity-60" />
        <div className="absolute inset-0 dice-stars2 opacity-70" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link to="/game/casino" className="inline-flex items-center gap-1 text-sm text-amber-300 hover:text-amber-200"><ArrowLeft className="w-4 h-4" /> Casino</Link>
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
          <AlertCircle className="w-4 h-4" /> La mesa de dados está cerrada temporalmente.
        </div>
      )}
      {message && (
        <div className={`rounded-xl p-3 text-sm border ${message.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-200'}`}>{message.text}</div>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        {/* Cupula */}
        <div ref={domeRef} className="relative rounded-3xl border border-amber-500/30 bg-slate-950/70 p-3 sm:p-6 overflow-hidden">
          {DICE_MASCOT_IMG && (
            <img src={DICE_MASCOT_IMG} alt="" draggable={false} className="hidden md:block xl:hidden 2xl:block absolute left-0 bottom-0 w-24 lg:w-28 2xl:w-40 pointer-events-none drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]" />
          )}
          <Dome rots={rots} rolling={rolling} win={won} big={bigWin} />

          {/* resultado */}
          <div className="mt-4 min-h-[72px] flex items-center justify-center">
            {rolling && <p className="font-orbitron text-amber-200 tracking-widest animate-pulse">LANZANDO…</p>}
            {showResult && result && (
              <div className={`flex items-center gap-3 sm:gap-4 max-w-full rounded-2xl px-3 sm:px-5 py-3 ${won ? 'bg-amber-500/15 ring-2 ring-amber-400/70 dice-btn-glow' : 'bg-slate-800/70 ring-1 ring-slate-600'}`}>
                <div className="flex flex-col items-center shrink-0">
                  <span className="font-orbitron text-3xl font-extrabold text-white leading-none">{result.total}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${resTriple ? 'text-fuchsia-300' : result.total <= 10 ? 'text-sky-300' : 'text-rose-300'}`}>
                    {resTriple ? 'Triple' : result.total <= 10 ? 'Chico' : 'Grande'}
                  </span>
                </div>
                <div className="min-w-0">
                  {won ? (
                    <>
                      {bigWin && <p className="text-[10px] font-extrabold tracking-[0.3em] text-fuchsia-300">GRAN PREMIO</p>}
                      <p className="font-orbitron text-amber-300 font-bold text-base sm:text-lg break-words">¡GANASTE <CountUp value={result.payout} ms={bigWin ? 1800 : 1000} /> TUNG!</p>
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
        <div className="rounded-3xl border border-amber-500/30 bg-slate-950/80 p-4 space-y-4">
          <div>
            <h1 className="font-orbitron text-2xl font-extrabold tracking-widest bg-gradient-to-r from-amber-200 via-amber-400 to-orange-500 bg-clip-text text-transparent">DADOS</h1>
            <p className="text-sm text-amber-100/80">Sic Bo galáctico · 3 dados, gana TUNG</p>
          </div>

          {/* fichas */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Ficha</p>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button key={c} type="button" onClick={() => setChip(c)}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full text-xs font-extrabold border-4 border-dashed transition-transform ${chip === c ? 'scale-110 border-amber-200 bg-gradient-to-br from-amber-300 to-amber-600 text-black shadow-[0_0_14px_rgba(251,191,36,0.8)]' : 'border-white/30 bg-gradient-to-br from-orange-700 to-purple-900 text-white hover:scale-105'}`}>
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
            <div className={`rounded-lg p-2 ring-1 ${overLimit || overDay ? 'bg-red-500/10 ring-red-500/50' : 'bg-slate-900 ring-slate-700'}`}>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Ganancia máxima</p>
              <p className={`font-bold ${overLimit || overDay ? 'text-red-300' : 'text-emerald-300'}`}>{fmt(maxWin)} TUNG</p>
            </div>
            <div className="rounded-lg p-2 ring-1 bg-slate-900 ring-slate-700">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Límite de mesa</p>
              <p className="font-bold text-amber-200">{fmt(tableLimit, 0)} TUNG</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Comisión {status.fee_pct ?? 20}% por apuesta. Los multiplicadores del tablero ya incluyen la comisión (lo que recibes por cada TUNG apostado si aciertas). Mínimo {status.min_bet ?? 1} TUNG por apuesta.
          </p>

          {shownBets.length > 0 && (
            <div>
              {showingLast && <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Última tirada</p>}
              <div className="max-h-28 overflow-y-auto rounded-lg bg-slate-900/70 ring-1 ring-slate-800 divide-y divide-slate-800 text-xs">
                {shownBets.map((b, i) => {
                  const w = showingLast && winIdx.has(i);
                  return (
                    <div key={betKey(b)} className={`flex justify-between gap-2 px-2 py-1 ${w ? 'text-amber-300 font-bold' : showingLast ? 'text-slate-500' : 'text-slate-300'}`}>
                      <span className="truncate">{betLabel(b)}</span>
                      <span className="shrink-0">{fmt(b.amount)}{w && resDice ? ` → +${fmt(b.amount * STAKE_RATE * multFor(b, resDice))}` : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={undo} disabled={rolling || undoStack.length === 0} className="flex items-center justify-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs text-white py-2"><Undo2 className="w-3.5 h-3.5" /> Deshacer</button>
            <button type="button" onClick={clearBets} disabled={rolling || bets.length === 0} className="flex items-center justify-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs text-white py-2"><Trash2 className="w-3.5 h-3.5" /> Limpiar</button>
            <button type="button" onClick={repeatBets} disabled={rolling || lastBets.length === 0} className="flex items-center justify-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs text-white py-2"><RotateCcw className="w-3.5 h-3.5" /> Repetir</button>
          </div>

          <button type="button" onClick={roll} ref={setRollBtn}
            disabled={rolling || bets.length === 0 || status.enabled === false || overLimit || overDay || noFunds}
            className="w-full rounded-2xl py-4 font-orbitron text-xl font-extrabold tracking-[0.3em] text-black bg-gradient-to-b from-amber-200 via-amber-400 to-orange-600 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed dice-btn3d">
            {rolling ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'LANZAR'}
          </button>
          {!rolling && (() => {
            const reason = status.enabled === false
              ? 'La mesa de dados está cerrada temporalmente'
              : bets.length === 0
                ? 'Coloca al menos una ficha en la mesa'
                : overLimit
                  ? `La ganancia máxima (${fmt(maxWin)}) supera el límite de mesa (${fmt(tableLimit, 0)} TUNG). Reduce la apuesta.`
                  : overDay
                    ? 'La apuesta supera el límite diario de premios de la mesa. Reduce la apuesta.'
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
                <div key={i} className="flex items-center gap-1.5 text-xs rounded-md bg-slate-900/60 px-2 py-1">
                  {h.dice.map((d, k) => <MiniDie key={k} n={d} size="xs" />)}
                  <span className="text-white font-bold w-5 text-center">{h.total}</span>
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
                <div key={i} className="flex items-center gap-1.5 text-xs rounded-md bg-slate-900/60 px-2 py-1">
                  {w.dice.map((d, k) => <MiniDie key={k} n={d} size="xs" />)}
                  <span className="text-slate-300 truncate min-w-0">{w.username ?? 'Jugador'}</span>
                  <span className="ml-auto font-bold text-amber-300">+{fmt(w.payout)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ultimas tiradas + tablero */}
      <div className="rounded-3xl border border-amber-500/30 bg-slate-950/80 p-4 space-y-4">
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          <span className="text-[11px] uppercase tracking-widest text-slate-400 whitespace-nowrap">Últimas tiradas</span>
          {(status.last_rolls ?? []).length === 0 && <span className="text-xs text-slate-500">—</span>}
          {(status.last_rolls ?? []).map((l, i) => (
            <span key={i} className={`flex items-center gap-0.5 rounded-md px-1.5 py-1 shrink-0 ${i === 0 ? 'bg-amber-500/15 ring-1 ring-amber-400/50' : 'bg-slate-900'}`}>
              {l.dice.map((d, k) => <MiniDie key={k} n={d} size="xs" />)}
              <span className="ml-1 text-[11px] font-bold text-white">{l.total}</span>
            </span>
          ))}
        </div>

        {/* Simples */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="h-20">{cell('small', undefined, <span className="text-lg">CHICO<span className="block text-xs opacity-80">4 - 10</span>{odds(eff(2))}</span>, 'bg-gradient-to-b from-sky-600 to-sky-900')}</div>
          <div className="h-20">{cell('odd', undefined, <span className="text-lg">IMPAR{odds(eff(2))}</span>, 'bg-gradient-to-b from-fuchsia-600 to-fuchsia-900')}</div>
          <div className="h-20">{cell('even', undefined, <span className="text-lg">PAR{odds(eff(2))}</span>, 'bg-gradient-to-b from-purple-600 to-purple-900')}</div>
          <div className="h-20">{cell('big', undefined, <span className="text-lg">GRANDE<span className="block text-xs opacity-80">11 - 17</span>{odds(eff(2))}</span>, 'bg-gradient-to-b from-rose-600 to-rose-900')}</div>
        </div>

        {/* Triples y dobles */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Doble específico <span className="text-amber-300">{eff(11)}</span></p>
            <div className="grid grid-cols-6 gap-1">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-16">{cell('double', n, <span className="flex flex-col items-center gap-0.5"><MiniDie n={n} /><MiniDie n={n} /></span>, 'bg-gradient-to-b from-indigo-700 to-indigo-950')}</div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-1 truncate">Cualquier triple</p>
            <div className="h-16">{cell('any_triple', undefined, <span className="text-xs leading-tight">TRIPLE<br />ANY{odds(eff(31))}</span>, 'bg-gradient-to-b from-amber-600 to-orange-900')}</div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Triple específico <span className="text-amber-300">{eff(181)}</span></p>
            <div className="grid grid-cols-6 gap-1">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-16">{cell('triple', n, <span className="flex flex-col items-center gap-0.5"><MiniDie n={n} size="xs" /><MiniDie n={n} size="xs" /><MiniDie n={n} size="xs" /></span>, 'bg-gradient-to-b from-amber-700 to-amber-950')}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Totales */}
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Total de los 3 dados</p>
          <div className="grid grid-cols-7 lg:grid-cols-[repeat(14,minmax(0,1fr))] gap-1">
            {Array.from({ length: 14 }).map((_, i) => {
              const t = i + 4;
              return <div key={t} className="h-14">{cell('total', t, <span className="text-base font-orbitron">{t}{odds(eff(TOTAL_MULT[t]))}</span>, 'bg-gradient-to-b from-emerald-700 to-emerald-950')}</div>;
            })}
          </div>
        </div>

        {/* Parejas */}
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Pareja de números <span className="text-amber-300">{eff(6)}</span></p>
          <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
            {COMBOS.map((c) => (
              <div key={c} className="h-16">{cell('combo', c, <span className="flex flex-col items-center gap-0.5"><MiniDie n={Math.floor(c / 10)} /><MiniDie n={c % 10} /></span>, 'bg-gradient-to-b from-violet-700 to-violet-950')}</div>
            ))}
          </div>
        </div>

        {/* Numero */}
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Número <span className="text-amber-300">{eff(2)} · {eff(3)} · {eff(4)}</span> <span className="normal-case tracking-normal text-slate-500">(según salga en 1, 2 o 3 dados)</span></p>
          <div className="grid grid-cols-6 gap-1">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="h-16">{cell('single', n, <MiniDie n={n} size="md" />, 'bg-gradient-to-b from-slate-600 to-slate-900 flex items-center justify-center')}</div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-500">Chico, Grande, Par e Impar pierden si sale un triple. Resultado generado en el servidor de forma aleatoria segura.</p>
      </div>

      <CasinoLeaderboard game="dice" accent="amber" refreshKey={status.history?.[0]?.created_at} />

      {/* Admin */}
      {status.admin && (
        <div className="rounded-3xl border border-amber-500/30 bg-slate-950/80 p-4 space-y-3">
          <h2 className="font-orbitron text-sm font-bold text-amber-300 tracking-widest flex items-center gap-2"><Shield className="w-4 h-4" /> BANCO DE DADOS (ADMIN)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            {([
              ['Banco', status.bank_balance], ['Apostado', status.admin.total_wagered], ['Comisiones', status.admin.total_fees],
              ['Pagado', status.admin.total_paid], ['Tiradas', status.admin.total_rolls], ['Aportado', status.admin.total_seeded],
              ['Retirado', status.admin.total_withdrawn], ['Pool pendiente', status.admin.pool_pending],
              ['Pérdida hoy', status.admin.day_loss], ['Límite diario', status.admin.day_limit],
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
              {status.enabled ? 'Cerrar mesa' : 'Abrir mesa'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900/60 ring-1 ring-slate-800 p-2">
            <span className="text-xs text-slate-300">Punto medio de dificultad: <b className="text-white">{fmt(status.admin.difficulty_mid)}</b> · Premio actual: <b className="text-white">{Math.round((status.admin.payout_factor ?? 0) * 1000) / 10}%</b></span>
            <input type="number" min={0} step={1} value={midInput} onChange={(e) => setMidInput(e.target.value)} placeholder="Nuevo punto medio"
              className="w-40 rounded-lg bg-slate-900 ring-1 ring-slate-700 px-3 py-2 text-sm text-white" />
            <button type="button" disabled={adminBusy} onClick={saveMid} className="rounded-lg bg-sky-700 hover:bg-sky-600 disabled:opacity-40 px-3 py-2 text-xs font-bold text-white">Guardar</button>
          </div>
          <p className="text-[11px] text-slate-500">En el punto medio: premios al 90%. Por cada 1.000 TUNG por encima, el recorte se reduce un 30% (93%, 95,1%, 96,6%…). Por cada 1.000 por debajo, el recorte crece un 43% (85,7%, 79,6%, 70,9%, 58,4%… mínimo 50%).</p>
          <p className="text-[11px] text-slate-500">Depósitos y retiros usan la billetera de la empresa. El premio máximo por tirada es el 10% del banco (triple específico con 1 TUNG requiere banco ≥ 1.448 TUNG) y la pérdida neta diaria del banco no supera el 20%.</p>
        </div>
      )}

      {/* Barra fija: apostar en el tablero y lanzar sin volver arriba */}
      {!rollBtnVisible && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-black via-black/90 to-black/0 pointer-events-none">
          <div className="pointer-events-auto max-w-3xl mx-auto flex items-center gap-2 rounded-2xl bg-slate-950/95 ring-1 ring-amber-500/40 p-2 shadow-[0_-6px_24px_rgba(0,0,0,0.6)]">
            <div className="flex gap-1 overflow-x-auto shrink min-w-0">
              {CHIPS.map((c) => (
                <button key={c} type="button" onClick={() => setChip(c)} aria-label={`Ficha ${c}`}
                  className={`w-9 h-9 shrink-0 rounded-full text-[10px] font-extrabold border-[3px] border-dashed ${chip === c ? 'border-amber-200 bg-gradient-to-br from-amber-300 to-amber-600 text-black' : 'border-white/30 bg-gradient-to-br from-orange-700 to-purple-900 text-white'}`}>
                  {c}
                </button>
              ))}
            </div>
            <button type="button" onClick={undo} disabled={rolling || undoStack.length === 0} aria-label="Deshacer" className="shrink-0 p-2 rounded-lg bg-slate-800 disabled:opacity-40 text-white"><Undo2 className="w-4 h-4" /></button>
            <div className="shrink-0 text-right leading-tight">
              <p className="text-[9px] uppercase tracking-widest text-slate-400">Total</p>
              <p className={`text-sm font-bold ${overLimit || overDay || noFunds ? 'text-red-300' : 'text-amber-200'}`}>{fmt(totalBet)}</p>
            </div>
            <button type="button" onClick={roll}
              disabled={rolling || bets.length === 0 || status.enabled === false || overLimit || overDay || noFunds}
              className="shrink-0 rounded-xl px-4 sm:px-6 py-2.5 font-orbitron text-sm font-extrabold tracking-widest text-black bg-gradient-to-b from-amber-200 via-amber-400 to-orange-600 disabled:opacity-40 dice-btn3d">
              {rolling ? <Loader2 className="w-5 h-5 animate-spin" /> : 'LANZAR'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
