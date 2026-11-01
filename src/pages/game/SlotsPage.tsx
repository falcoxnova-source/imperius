import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Coins, History, Loader2, Minus, Plus, Shield, Trophy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { casinoSfx } from '../../lib/casinoSfx';
import { unlockSfx } from '../../lib/sfx';
import { SoundToggle } from '../../components/game/SoundToggle';
import { CasinoLeaderboard } from '../../components/game/CasinoLeaderboard';

// Imagenes opcionales ('' = usa el emoji)
const SLOTS_IMG_DIR = '/Imagenes/Casino%20Galaxtico/tragaperra';
const SLOTS_BG_IMG: string = `${SLOTS_IMG_DIR}/SLOTS_BG_IMG.webp`;
const SLOTS_MASCOT_IMG: string = `${SLOTS_IMG_DIR}/SLOTS_MASCOT_IMG.webp`;
// Simbolos en orden del servidor: 0 cohete, 1 planeta, 2 estrella, 3 gema, 4 luna, 5 hueco (sin imagen)
const SYMBOL_IMGS: string[] = [
  `${SLOTS_IMG_DIR}/SLOTS_SYM_COHETE.webp`,
  `${SLOTS_IMG_DIR}/SLOTS_SYM_PLANETA.webp`,
  `${SLOTS_IMG_DIR}/SLOTS_SYM_ESTRELLA.webp`,
  '', // gema: pendiente (SLOTS_SYM_GEMA.webp)
  `${SLOTS_IMG_DIR}/SLOTS_SYM_LUNA.webp`,
  '',
];

const SYMBOLS = ['🚀', '🪐', '⭐', '💎', '🌑', ''];
const SYMBOL_NAMES = ['Cohete', 'Planeta', 'Estrella', 'Gema', 'Luna', 'Hueco'];
const BLANK = 5;
const WEIGHTS = [9, 10, 12, 14, 36, 19]; // mismos pesos que el servidor (solo para el relleno visual)
const CHIPS = [1, 5, 10, 50, 100];
const STAKE_RATE = 0.8; // 20% de comision se descuenta de cada apuesta
const TOP_MULT = 50;
const ROW = 80; // alto de cada fila del rodillo (px)
const REEL_MS = [1300, 1800, 2300];
// Mismas reglas que el servidor; se paga solo la mejor combinacion. 'any' = cualquier simbolo
const PAYTABLE: { icons: (number | 'any')[]; mult: number; label: string }[] = [
  { icons: [0, 0, 0], mult: 50, label: '3 Cohetes · JACKPOT' },
  { icons: [1, 1, 1], mult: 20, label: '3 Planetas' },
  { icons: [2, 2, 2], mult: 10, label: '3 Estrellas' },
  { icons: [3, 3, 3], mult: 8, label: '3 Gemas' },
  { icons: [0, 0, 'any'], mult: 5, label: '2 Cohetes (cualquier posición)' },
  { icons: [1, 2, 3], mult: 4, label: 'Cualquier mezcla de Planeta, Estrella y Gema' },
  { icons: [4, 4, 4], mult: 3, label: '3 Lunas' },
  { icons: [0, 'any', 'any'], mult: 2, label: '1 Cohete (cualquier posición)' },
];

interface SpinRow { reels: number[]; bet: number; mult: number; payout: number; created_at: string }
interface WinRow { username: string | null; reels: number[]; mult: number; payout: number; created_at: string }
interface AdminInfo {
  pool_pending: number; total_seeded: number; total_withdrawn: number; total_wagered: number;
  total_fees: number; total_paid: number; total_spins: number; day_loss: number; day_limit: number;
  difficulty_mid?: number; payout_factor?: number;
}
interface SlotsStatus {
  allowed: boolean;
  enabled?: boolean;
  balance?: number;
  bank_balance?: number;
  max_payout?: number;
  max_bet?: number;
  min_bet?: number;
  fee_pct?: number;
  history?: SpinRow[];
  recent_wins?: WinRow[];
  admin?: AdminInfo | null;
}
interface SpinResult {
  success: boolean; error?: string; reels: number[]; mult: number; bet: number; fee: number;
  stake: number; payout: number; net: number; balance: number; bank_balance: number;
}

const fmt = (v: number | undefined | null, d = 2) =>
  Number(v ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d });

function randSym(): number {
  let k = Math.random() * 100;
  for (let i = 0; i < WEIGHTS.length; i++) {
    if (k < WEIGHTS[i]) return i;
    k -= WEIGHTS[i];
  }
  return WEIGHTS.length - 1;
}

function comboLabel(reels: number[], mult: number): string {
  if (mult === TOP_MULT) return '¡JACKPOT GALÁCTICO!';
  if (mult > 0 && reels[0] === reels[1] && reels[1] === reels[2]) return `¡3 ${SYMBOL_NAMES[reels[0]]}s!`;
  if (mult === 5) return '¡2 Cohetes!';
  if (mult === 4) return '¡Mezcla galáctica!';
  if (mult === 2) return '¡Cohete!';
  return '';
}

// Que rodillos forman la combinacion ganadora (para iluminarlos)
function winMask(reels: number[], mult: number): boolean[] {
  if (mult <= 0) return [false, false, false];
  const three = reels[0] === reels[1] && reels[1] === reels[2];
  if (!three && (mult === 5 || mult === 2)) return reels.map((r) => r === 0);
  return [true, true, true];
}

function Sym({ i, size = 'lg' }: { i: number; size?: 'sm' | 'lg' }) {
  if (i === BLANK) {
    return size === 'lg'
      ? <span aria-label="Hueco" className="block w-12 h-1 rounded-full bg-slate-400/40" />
      : <span aria-label="Hueco" className="inline-block w-4 text-center text-sm leading-none text-slate-500">–</span>;
  }
  const img = SYMBOL_IMGS[i];
  if (img) {
    return <img src={img} alt={SYMBOL_NAMES[i]} draggable={false} className={size === 'lg' ? 'w-14 h-14 object-contain drop-shadow-[0_5px_4px_rgba(0,0,0,0.45)]' : 'w-5 h-5 object-contain inline-block'} />;
  }
  return <span className={size === 'lg' ? 'text-5xl leading-none drop-shadow-[0_5px_4px_rgba(0,0,0,0.45)]' : 'text-sm leading-none'}>{SYMBOLS[i]}</span>;
}

// Contador animado del premio
function CountUp({ value, ms = 1000 }: { value: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
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

// ─── Rodillo ─────────────────────────────────────────
function Reel({ strip, pos, dur, win }: { strip: number[]; pos: number; dur: number; win: boolean }) {
  return (
    <div className="relative flex-1 min-w-0 overflow-hidden rounded-xl ring-2 ring-amber-700/80 bg-[linear-gradient(to_bottom,#475569_0%,#cbd5e1_20%,#ffffff_50%,#cbd5e1_80%,#475569_100%)] shadow-[inset_0_14px_20px_rgba(0,0,0,0.55),inset_0_-14px_20px_rgba(0,0,0,0.55),0_0_0_3px_rgba(0,0,0,0.6)]"
      style={{ height: ROW * 3 }}>
      <div className={dur ? 'slots-strip-spin' : ''}
        style={{ transform: `translateY(${-pos * ROW}px)`, transition: dur ? `transform ${dur}ms cubic-bezier(0.15, 0.7, 0.25, 1.04)` : 'none', animationDuration: dur ? `${dur}ms` : undefined }}>
        {strip.map((s, k) => (
          <div key={k} className="flex items-center justify-center" style={{ height: ROW }}>
            <div className={win && k === pos + 1 ? 'slots-win' : ''}><Sym i={s} /></div>
          </div>
        ))}
      </div>
      {/* curvatura del cilindro */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[38%] bg-gradient-to-b from-black/70 via-black/25 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/45 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-black/45 to-transparent" />
      {/* reflejo del cristal */}
      <div className="pointer-events-none absolute inset-y-0 left-[14%] w-[16%] -skew-x-6 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
    </div>
  );
}

// ─── Palanca ─────────────────────────────────────────
function Lever({ pulling, disabled, onPull }: { pulling: boolean; disabled: boolean; onPull: () => void }) {
  return (
    <button type="button" onClick={onPull} disabled={disabled} aria-label="Tirar de la palanca" title="Tirar de la palanca"
      className="group relative w-10 sm:w-12 shrink-0 self-stretch disabled:cursor-not-allowed">
      {/* soporte */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-24 rounded-r-xl bg-gradient-to-r from-amber-800 via-amber-300 to-amber-800 ring-1 ring-amber-950 shadow-[4px_6px_10px_rgba(0,0,0,0.6)]" />
      {/* brazo */}
      <div className={`absolute left-3 sm:left-4 bottom-1/2 w-2.5 origin-bottom ${pulling ? 'slots-lever-pull' : ''}`} style={{ height: '46%' }}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-slate-500 via-white to-slate-600 ring-1 ring-slate-700 shadow-[3px_0_6px_rgba(0,0,0,0.5)]" />
        <div className={`absolute -top-5 left-1/2 -translate-x-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[radial-gradient(circle_at_32%_28%,#fee2e2_0%,#f87171_22%,#dc2626_48%,#7f1d1d_85%,#450a0a_100%)] shadow-[0_8px_12px_rgba(0,0,0,0.65),0_0_18px_rgba(239,68,68,0.55)] ${disabled ? 'opacity-60' : 'group-hover:brightness-125'}`} />
      </div>
      <div className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f8fafc,#64748b_60%,#0f172a)] ring-1 ring-slate-900 shadow-[0_3px_5px_rgba(0,0,0,0.6)]" />
    </button>
  );
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
        <span key={i} className="absolute slots-coin" style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, fontSize: c.size }}>🪙</span>
      ))}
    </div>
  );
}

const initialStrip = () => [randSym(), randSym(), randSym()];

// ─── Pagina ──────────────────────────────────────────
export function SlotsPage() {
  const { profile, fetchProfile } = useAuthStore();
  const [status, setStatus] = useState<SlotsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [bet, setBet] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [strips, setStrips] = useState<number[][]>(() => [initialStrip(), initialStrip(), initialStrip()]);
  const [pos, setPos] = useState<number[]>([0, 0, 0]);
  const [dur, setDur] = useState<number[]>([0, 0, 0]);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [coinSeed, setCoinSeed] = useState(0);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [adminAmount, setAdminAmount] = useState('');
  const [midInput, setMidInput] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const spinningRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tiltRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  // Inclinacion 3D de la maquina siguiendo el raton
  const onTilt = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el || reduceMotion) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateY(${(x * 8).toFixed(2)}deg) rotateX(${(4 - y * 6).toFixed(2)}deg)`;
  };
  const resetTilt = () => { if (tiltRef.current) tiltRef.current.style.transform = ''; };

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('casino_slots_status');
    if (error) {
      setMessage({ type: 'error', text: 'No se pudo cargar la tragamonedas' });
    } else {
      setStatus(data as SlotsStatus);
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

  const balance = Number(profile?.tung_balance ?? status?.balance ?? 0);
  const maxBet = Number(status?.max_bet ?? 0);
  const bankBal = Number(status?.bank_balance ?? 0);
  const maxWin = bet * STAKE_RATE * TOP_MULT;
  const overLimit = bet > maxBet;
  const noFunds = bet > balance;
  const canSpin = !spinning && status?.enabled !== false && !overLimit && !noFunds && bet >= 1;

  const changeBet = (v: number) => { if (!spinning) setBet(Math.max(1, Math.floor(v))); };

  const spin = async () => {
    if (spinningRef.current) return;
    if (status?.enabled === false) { flash('error', 'La tragamonedas está cerrada temporalmente'); return; }
    if (overLimit) { flash('error', maxBet < 1 ? 'La máquina no puede aceptar apuestas ahora mismo' : `Apuesta máxima ahora: ${fmt(maxBet, 0)} TUNG`); return; }
    if (noFunds) { flash('error', 'Saldo TUNG insuficiente'); return; }

    unlockSfx();
    casinoSfx.slotsLever();
    spinningRef.current = true;
    setSpinning(true);
    setPulling(true);
    setShowResult(false);
    setMessage(null);
    timers.current.push(setTimeout(() => setPulling(false), 700));

    let res: SpinResult | null = null;
    try {
      const { data, error } = await supabase.rpc('casino_slots_spin', { p_bet: bet });
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
    // Construye cada tira: lo que se ve ahora + relleno + [arriba, resultado, abajo]
    const next = strips.map((s, i) => {
      const visible = s.slice(pos[i], pos[i] + 3);
      const filler = Array.from({ length: 16 + i * 6 }, randSym);
      return [...visible, ...filler, randSym(), spun.reels[i], randSym()];
    });
    setDur([0, 0, 0]);
    setPos([0, 0, 0]);
    setStrips(next);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setDur(REEL_MS);
      setPos(next.map((s) => s.length - 3));
      casinoSfx.slotsReels(REEL_MS);
    }));
    setResult(spun);

    timers.current.push(setTimeout(() => {
      spinningRef.current = false;
      setSpinning(false);
      setShowResult(true);
      if (spun.payout > 0) setCoinSeed((s) => s + 1);
      if (spun.payout > 0) casinoSfx.win(spun.mult === TOP_MULT ? 'jackpot' : spun.mult >= 10 ? 'big' : 'small');
      else casinoSfx.lose();
      fetchProfile();
      load();
    }, REEL_MS[2] + 200));
  };

  const adminAction = async (action: 'deposit' | 'withdraw' | 'enable' | 'disable') => {
    const amount = Math.floor(Number(adminAmount));
    if ((action === 'deposit' || action === 'withdraw') && (!Number.isFinite(amount) || amount <= 0)) {
      flash('error', 'Cantidad inválida');
      return;
    }
    setAdminBusy(true);
    try {
      const { data, error } = await supabase.rpc('casino_slots_admin', { p_action: action, p_amount: action === 'deposit' || action === 'withdraw' ? amount : null });
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

  const saveMid = async () => {
    const mid = Number(midInput);
    if (midInput.trim() === '' || !Number.isInteger(mid) || mid < 0 || mid > 100000000) {
      flash('error', 'Punto medio inválido');
      return;
    }
    setAdminBusy(true);
    try {
      const { data, error } = await supabase.rpc('casino_slots_admin', { p_action: 'set_mid', p_amount: mid });
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

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-10 h-10 text-fuchsia-400 animate-spin" /></div>;
  }

  if (!status) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-2xl border border-slate-700 bg-slate-900/80 p-6 text-center">
        <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <p className="text-white font-semibold">No se pudo cargar la tragamonedas</p>
        <Link to="/game/casino" className="inline-flex items-center gap-1 mt-4 text-sm text-fuchsia-300 hover:text-fuchsia-200"><ArrowLeft className="w-4 h-4" /> Volver al Casino</Link>
      </div>
    );
  }

  const won = showResult && result !== null && result.payout > 0;
  const jackpot = won && result?.mult === TOP_MULT;
  const bigWin = won && (result?.mult ?? 0) >= 10;
  const mask = won && result ? winMask(result.reels, result.mult) : [false, false, false];
  const noBankRoom = Math.floor(Math.floor(bankBal * 0.1) / (STAKE_RATE * TOP_MULT)) < 1;

  const reason = spinning ? null
    : status.enabled === false ? 'La tragamonedas está cerrada temporalmente'
    : maxBet < 1 ? (noBankRoom ? 'La máquina está esperando fondos en el banco. Vuelve pronto.' : 'La máquina alcanzó su límite de premios de hoy. Vuelve mañana.')
    : overLimit ? `Apuesta máxima ahora: ${fmt(maxBet, 0)} TUNG`
    : noFunds ? 'Saldo TUNG insuficiente'
    : null;

  return (
    <div className="relative isolate max-w-6xl mx-auto space-y-4 pb-8">
      <style>{`
        @keyframes slotsCoin { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 0 } 10% { opacity: 1 } 100% { transform: translateY(110vh) rotate(720deg); opacity: .9 } }
        .slots-coin { top: 0; animation-name: slotsCoin; animation-timing-function: cubic-bezier(.35,.1,.6,1); animation-fill-mode: both; }
        @keyframes slotsGlow { 0%,100% { box-shadow: 0 0 18px rgba(251,191,36,.55) } 50% { box-shadow: 0 0 34px rgba(251,191,36,.95) } }
        .slots-glow { animation: slotsGlow 2s ease-in-out infinite; }
        @keyframes slotsWin { 0%,100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(251,191,36,0)) } 50% { transform: scale(1.15); filter: drop-shadow(0 0 10px rgba(251,191,36,1)) } }
        .slots-win { animation: slotsWin .8s ease-in-out infinite; }
        @keyframes slotsLever { 0% { transform: scaleY(1) } 40% { transform: scaleY(-1) } 100% { transform: scaleY(1) } }
        .slots-lever-pull { animation: slotsLever .7s cubic-bezier(.4,0,.2,1); }
        @keyframes slotsBulb { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        .slots-bulb { animation: slotsBulb 1.2s ease-in-out infinite; }
        .slots-bulb-fast { animation-duration: .3s !important; }
        @keyframes slotsBlur { 0% { filter: blur(0) } 10% { filter: blur(2.5px) } 75% { filter: blur(1.6px) } 100% { filter: blur(0) } }
        .slots-strip-spin { animation-name: slotsBlur; animation-timing-function: linear; animation-fill-mode: both; will-change: transform, filter; }
        .slots-cabinet { transform: rotateX(4deg); transform-style: preserve-3d; transition: transform .25s ease-out; }
        @keyframes slotsShake { 0%,100% { transform: translate(0,0) } 10%,50%,90% { transform: translate(-5px,2px) } 30%,70% { transform: translate(5px,-2px) } }
        .slots-shake { animation: slotsShake .5s ease-in-out 3; }
        @keyframes slotsFlash { 0% { opacity: 0 } 15% { opacity: .6 } 100% { opacity: 0 } }
        .slots-flash { background: radial-gradient(circle at center, rgba(253,230,138,.9), rgba(217,70,239,.35) 45%, transparent 75%); animation: slotsFlash 1.2s ease-out both; }
        @keyframes slotsLine { 0%,100% { box-shadow: 0 0 6px #fbbf24 } 50% { box-shadow: 0 0 18px #fbbf24, 0 0 30px #f59e0b } }
        .slots-line-win { animation: slotsLine .7s ease-in-out infinite; }
        @keyframes slotsStars { from { background-position: 0 0 } to { background-position: 0 600px } }
        @keyframes slotsStars2 { from { background-position: 0 0 } to { background-position: 0 920px } }
        .slots-stars { background-image: radial-gradient(1px 1px at 20px 30px, #fff, transparent), radial-gradient(1px 1px at 120px 80px, #fde68a, transparent), radial-gradient(1.5px 1.5px at 200px 150px, #fff, transparent), radial-gradient(1px 1px at 300px 40px, #f0abfc, transparent), radial-gradient(1px 1px at 80px 220px, #fff, transparent), radial-gradient(1px 1px at 260px 260px, #c4b5fd, transparent); background-size: 340px 300px; animation: slotsStars 70s linear infinite; }
        .slots-stars2 { background-image: radial-gradient(2px 2px at 60px 90px, #fff, transparent), radial-gradient(1.5px 1.5px at 380px 200px, #f0abfc, transparent), radial-gradient(2px 2px at 220px 380px, #fde68a, transparent), radial-gradient(1.5px 1.5px at 460px 40px, #fff, transparent); background-size: 520px 460px; animation: slotsStars2 45s linear infinite; }
        .slots-btn3d { box-shadow: 0 6px 0 #92400e, 0 12px 22px rgba(0,0,0,.55), inset 0 2px 0 rgba(255,255,255,.6); }
        .slots-btn3d:active:not(:disabled) { transform: translateY(4px); box-shadow: 0 2px 0 #92400e, 0 4px 10px rgba(0,0,0,.5), inset 0 2px 0 rgba(255,255,255,.6); }
        @media (prefers-reduced-motion: reduce) {
          .slots-strip-spin, .slots-shake, .slots-flash, .slots-bulb, .slots-stars, .slots-stars2, .slots-win, .slots-glow, .slots-line-win, .slots-lever-pull { animation: none !important; }
          .slots-coin, .slots-flash { display: none; }
          .slots-cabinet { transform: none !important; }
        }
      `}</style>

      {won && <CoinShower key={coinSeed} seed={coinSeed} big={!!jackpot} />}
      {bigWin && <div key={`f${coinSeed}`} className="pointer-events-none fixed inset-0 z-40 slots-flash" />}

      {/* fondo */}
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        {SLOTS_BG_IMG
          ? <>
              <img src={SLOTS_BG_IMG} alt="" className="w-full h-full object-cover opacity-70" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/60" />
            </>
          : <div className="w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(192,38,211,0.35),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(126,34,206,0.25),transparent_60%)]" />}
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

      {message && (
        <div className={`rounded-xl p-3 text-sm border ${message.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-200'}`}>{message.text}</div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        {/* Maquina */}
        <div className="relative rounded-3xl border border-fuchsia-500/30 bg-slate-950/70 p-3 sm:p-6 overflow-hidden" onMouseMove={onTilt} onMouseLeave={resetTilt}>
          {/* campo de estrellas */}
          <div className="pointer-events-none absolute inset-0 slots-stars opacity-60" />
          <div className="pointer-events-none absolute inset-0 slots-stars2 opacity-50" />
          {SLOTS_MASCOT_IMG && (
            <img src={SLOTS_MASCOT_IMG} alt="" draggable={false} className="hidden xl:block absolute left-0 bottom-0 w-32 pointer-events-none drop-shadow-[0_0_20px_rgba(217,70,239,0.6)]" />
          )}
          <div className="relative mx-auto max-w-[500px]" style={{ perspective: '1400px' }}>
           <div className={jackpot ? 'slots-shake' : ''}>
            <div ref={tiltRef} className="slots-cabinet relative">
            {/* marquesina */}
            <div className="relative rounded-t-[2.2rem] bg-gradient-to-b from-fuchsia-500 via-purple-800 to-purple-950 ring-4 ring-amber-500/90 px-4 pt-6 pb-4 text-center shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-10px_18px_rgba(0,0,0,0.55),0_-6px_24px_rgba(217,70,239,0.35)]">
              <div className="absolute inset-x-5 top-2 flex justify-between">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span key={i} className={`slots-bulb ${won ? 'slots-bulb-fast' : ''} w-2 h-2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#fde68a_45%,#f59e0b)] shadow-[0_0_8px_#fde68a]`} style={{ animationDelay: `${i * 0.09}s` }} />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-x-6 top-4 h-5 rounded-full bg-gradient-to-b from-white/25 to-transparent" />
              <h1 className="relative font-orbitron text-xl sm:text-3xl font-extrabold tracking-[0.2em] bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text text-transparent [filter:drop-shadow(0_2px_0_#78350f)_drop-shadow(0_5px_8px_rgba(0,0,0,0.6))]">TRAGAMONEDAS</h1>
              <p className="relative text-[11px] sm:text-xs text-fuchsia-100/90 tracking-widest">🚀 🚀 🚀 PAGA x{fmt(TOP_MULT * STAKE_RATE, 1)} · 1 🚀 YA PAGA</p>
            </div>

            {/* cuerpo */}
            <div className="relative rounded-b-[2rem] bg-gradient-to-b from-zinc-700 via-zinc-900 to-black ring-4 ring-amber-500/90 p-3 sm:p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.15),inset_6px_0_10px_rgba(255,255,255,0.06),inset_-6px_0_10px_rgba(0,0,0,0.5)]">
              <div className="flex items-stretch gap-1">
                <div className="relative flex-1 min-w-0 rounded-2xl bg-black p-2 sm:p-3 ring-2 ring-amber-600/70 shadow-[inset_0_8px_18px_rgba(0,0,0,0.95),0_2px_0_rgba(255,255,255,0.12)]">
                  <div className="flex gap-2">
                    {strips.map((s, i) => <Reel key={i} strip={s} pos={pos[i]} dur={dur[i]} win={mask[i]} />)}
                  </div>
                  {/* linea de pago */}
                  <div className={`pointer-events-none absolute left-1 right-1 top-1/2 -translate-y-1/2 h-0.5 ${won ? 'bg-amber-300 slots-line-win' : 'bg-red-500/70 shadow-[0_0_6px_rgba(239,68,68,0.7)]'}`} />
                  <div className="pointer-events-none absolute -left-1 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[8px] border-y-transparent border-l-[10px] border-l-red-500 [filter:drop-shadow(0_0_4px_rgba(239,68,68,0.9))]" />
                  <div className="pointer-events-none absolute -right-1 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[8px] border-y-transparent border-r-[10px] border-r-red-500 [filter:drop-shadow(0_0_4px_rgba(239,68,68,0.9))]" />
                  {/* cristal frontal */}
                  <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/15 via-transparent to-transparent" />
                </div>
                <Lever pulling={pulling} disabled={!canSpin} onPull={spin} />
              </div>
              {/* luces inferiores */}
              <div className="mt-3 mx-4 flex justify-between">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className={`slots-bulb ${won ? 'slots-bulb-fast' : ''} w-1.5 h-1.5 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#f0abfc_45%,#c026d3)] shadow-[0_0_7px_#f0abfc]`} style={{ animationDelay: `${(11 - i) * 0.09}s` }} />
                ))}
              </div>
              {/* bandeja de monedas */}
              <div className="mt-3 mx-8 h-6 rounded-b-2xl rounded-t-md bg-gradient-to-b from-black via-zinc-800 to-zinc-500 ring-2 ring-amber-600/60 shadow-[inset_0_7px_9px_rgba(0,0,0,0.95)]" />
            </div>
            </div>
           </div>
            {/* sombra en el suelo */}
            <div className="mx-auto mt-2 h-5 w-4/5 rounded-[50%] bg-black/70 blur-md" />
          </div>

          {/* resultado */}
          <div className="relative mt-4 min-h-[72px] flex items-center justify-center">
            {spinning && <p className="font-orbitron text-fuchsia-200 tracking-widest animate-pulse">GIRANDO…</p>}
            {showResult && result && (
              <div className={`flex items-center gap-3 sm:gap-4 max-w-full rounded-2xl px-3 sm:px-5 py-3 ${won ? 'bg-amber-500/15 ring-2 ring-amber-400/70 slots-glow' : 'bg-slate-800/70 ring-1 ring-slate-600'}`}>
                <div className="flex gap-1 text-2xl">{result.reels.map((r, i) => <Sym key={i} i={r} size="sm" />)}</div>
                <div className="min-w-0">
                  {won ? (
                    <>
                      <p className="font-orbitron text-amber-300 font-bold text-base sm:text-lg break-words">{comboLabel(result.reels, result.mult)} GANASTE <CountUp key={coinSeed} value={result.payout} /> TUNG</p>
                      <p className="text-xs text-amber-100/80">Neto {result.net >= 0 ? '+' : ''}{fmt(result.net)} TUNG</p>
                    </>
                  ) : (
                    <>
                      <p className="font-orbitron text-slate-200 font-bold">Sin premio esta vez</p>
                      <p className="text-xs text-slate-400">−{fmt(result.bet)} TUNG</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Panel derecho */}
        <div className="rounded-3xl border border-fuchsia-500/30 bg-slate-950/80 p-4 space-y-4">
          {/* apuesta */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Apuesta</p>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button key={c} type="button" onClick={() => changeBet(c)} disabled={spinning}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full text-xs font-extrabold border-4 border-dashed transition-transform disabled:cursor-not-allowed ${bet === c ? 'scale-110 border-amber-200 bg-gradient-to-br from-amber-300 to-amber-600 text-black shadow-[0_0_14px_rgba(251,191,36,0.8)]' : 'border-white/30 bg-gradient-to-br from-purple-700 to-fuchsia-900 text-white hover:scale-105'}`}>
                  {c}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => changeBet(bet - 1)} disabled={spinning || bet <= 1} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white"><Minus className="w-4 h-4" /></button>
              <div className="flex-1 text-center rounded-lg bg-slate-900 ring-1 ring-amber-400/30 py-2">
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Apuesta por tirada</p>
                <p className="text-lg font-bold text-amber-200">{fmt(bet, 0)} TUNG</p>
              </div>
              <button type="button" onClick={() => changeBet(bet + 1)} disabled={spinning} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white"><Plus className="w-4 h-4" /></button>
            </div>
            <button type="button" onClick={() => changeBet(Math.min(maxBet, Math.floor(balance)))} disabled={spinning || maxBet < 1 || balance < 1}
              className="mt-2 w-full rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-white py-2">APUESTA MÁXIMA</button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className={`rounded-lg p-2 ring-1 ${overLimit ? 'bg-red-500/10 ring-red-500/50' : 'bg-slate-900 ring-slate-700'}`}>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Premio máximo</p>
              <p className={`font-bold ${overLimit ? 'text-red-300' : 'text-emerald-300'}`}>{fmt(maxWin)} TUNG</p>
            </div>
            <div className="rounded-lg p-2 ring-1 bg-slate-900 ring-slate-700">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Apuesta máx. ahora</p>
              <p className="font-bold text-fuchsia-200">{fmt(maxBet, 0)} TUNG</p>
            </div>
          </div>

          <button type="button" onClick={spin} disabled={!canSpin}
            className="w-full rounded-2xl py-4 font-orbitron text-xl font-extrabold tracking-[0.3em] text-black bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed slots-btn3d">
            {spinning ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'TIRAR'}
          </button>
          {reason && <p className="text-xs text-amber-300 text-center">{reason}</p>}

          {/* tabla de pagos */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Tabla de pagos (sobre tu apuesta)</p>
            <div className="rounded-lg bg-slate-900/70 ring-1 ring-slate-800 divide-y divide-slate-800">
              {PAYTABLE.map((p) => (
                <div key={p.label} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                  <span className="flex gap-0.5 w-20 shrink-0">
                    {p.icons.map((r, k) => r === 'any' ? <span key={k} className="text-slate-500 text-sm leading-none">✱</span> : <Sym key={k} i={r} size="sm" />)}
                  </span>
                  <span className="text-slate-400 truncate" title={p.label}>{p.label}</span>
                  <span className="ml-auto font-bold text-amber-300">x{fmt(p.mult * STAKE_RATE, 1)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500 leading-snug">
              Comisión {status.fee_pct ?? 20}% incluida en los pagos. Una sola línea (la central); solo se paga la mejor combinación. Los huecos vacíos no pagan. Resultado generado en el servidor de forma aleatoria segura.
            </p>
          </div>

          {/* historial */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1"><History className="w-3.5 h-3.5" /> Historial</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(status.history ?? []).length === 0 && <p className="text-xs text-slate-500">Aún no has jugado</p>}
              {(status.history ?? []).map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs rounded-md bg-slate-900/60 px-2 py-1">
                  <span className="flex gap-0.5">{h.reels.map((r, k) => <Sym key={k} i={r} size="sm" />)}</span>
                  <span className="text-slate-400">Apostado {fmt(h.bet)}</span>
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
                  <span className="flex gap-0.5 shrink-0">{w.reels.map((r, k) => <Sym key={k} i={r} size="sm" />)}</span>
                  <span className="text-slate-300 truncate min-w-0">{w.username ?? 'Jugador'}</span>
                  <span className="ml-auto font-bold text-amber-300">+{fmt(w.payout)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <CasinoLeaderboard game="slots" accent="fuchsia" refreshKey={status.history?.[0]?.created_at} />

      {/* Admin */}
      {status.admin && (
        <div className="rounded-3xl border border-amber-500/30 bg-slate-950/80 p-4 space-y-3">
          <h2 className="font-orbitron text-sm font-bold text-amber-300 tracking-widest flex items-center gap-2"><Shield className="w-4 h-4" /> BANCO DE LA TRAGAMONEDAS (ADMIN)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            {([
              ['Banco', status.bank_balance], ['Apostado', status.admin.total_wagered], ['Comisiones', status.admin.total_fees],
              ['Pagado', status.admin.total_paid], ['Tiradas', status.admin.total_spins], ['Aportado', status.admin.total_seeded],
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
              {status.enabled ? 'Cerrar tragamonedas' : 'Abrir tragamonedas'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900/60 ring-1 ring-slate-800 p-2">
            <span className="text-xs text-slate-300">Punto medio de dificultad: <b className="text-white">{fmt(status.admin.difficulty_mid)}</b> · Premio actual: <b className="text-white">{Math.round((status.admin.payout_factor ?? 0) * 1000) / 10}%</b></span>
            <input type="number" min={0} step={1} value={midInput} onChange={(e) => setMidInput(e.target.value)} placeholder="Nuevo punto medio"
              className="w-40 rounded-lg bg-slate-900 ring-1 ring-slate-700 px-3 py-2 text-sm text-white" />
            <button type="button" disabled={adminBusy} onClick={saveMid} className="rounded-lg bg-sky-700 hover:bg-sky-600 disabled:opacity-40 px-3 py-2 text-xs font-bold text-white">Guardar</button>
          </div>
          <p className="text-[11px] text-slate-500">En el punto medio: premios al 90%. Por cada 1.000 TUNG por encima, el recorte se reduce un 30% (93%, 95,1%, 96,6%…). Por cada 1.000 por debajo, el recorte crece un 43% (85,7%, 79,6%, 70,9%, 58,4%… mínimo 50%).</p>
          <p className="text-[11px] text-slate-500">Depósitos y retiros usan la billetera de la empresa. Premio máximo por tirada = 10% del banco (apuesta mínima de 1 requiere banco ≥ 400 TUNG). Pérdida neta máxima por día (UTC) = 20% del banco al inicio del día.</p>
        </div>
      )}
    </div>
  );
}
