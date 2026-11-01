import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Ticket,
  Trophy,
  Clock,
  Coins,
  Star,
  Loader2,
  History,
  Zap,
  Crown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Shuffle,
  Check,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../lib/i18n';

// ─── Types ───────────────────────────────────────────
interface LotteryDraw {
  id: string;
  draw_number: number;
  status: string;
  total_tickets: number;
  prize_pool: number;
  accumulated_jackpot: number;
  opens_at: string;
  closes_at: string;
}

interface LotteryTicket {
  id: string;
  numbers: number[];
  cost: number;
  created_at: string;
}

interface PastDraw {
  id: string;
  draw_number: number;
  winning_numbers: number[];
  total_tickets: number;
  jackpot_amount: number;
  jackpot_winner: string | null;
  drawn_at: string;
  total_pool: number;
}

interface PastWinner {
  username: string;
  matches: number;
  prize: number;
  numbers: number[];
  winning_numbers: number[];
  created_at: string;
}

interface LotteryInfo {
  enabled: boolean;
  active_draw: LotteryDraw | null;
  can_buy_tickets: boolean;
  ticket_cost: number;
  ticket_cost_vip: number;
  final_cost: number;
  is_vip: boolean;
  max_tickets: number;
  user_tickets: LotteryTicket[];
  user_ticket_count: number;
  past_draws: PastDraw[];
  past_winners: PastWinner[];
  prize_3match?: number;
  prize_2match?: number;
  /** true cuando el precio se ancla a USD y se cobra en TUNG al precio vivo */
  usd_mode?: boolean;
  ticket_cost_usd?: number | null;
  tung_price_usd?: number | null;
}

// ─── Animated Stars Background ──────────────────────
function StarsBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white animate-pulse"
          style={{
            width: `${Math.random() * 3 + 1}px`,
            height: `${Math.random() * 3 + 1}px`,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${Math.random() * 3 + 2}s`,
            opacity: Math.random() * 0.7 + 0.3,
          }}
        />
      ))}
    </div>
  );
}

// ─── Countdown Timer ─────────────────────────────────
function CountdownTimer({ targetDate }: { targetDate: string }) {
  const { t } = useI18n();
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (isExpired) {
    return (
      <div className="text-amber-400 font-bold text-lg animate-pulse flex items-center gap-2">
        <Zap className="w-5 h-5" />
        {t.lottery.pendingDraw}
      </div>
    );
  }

  return (
    <div className="flex gap-2 sm:gap-3">
      {[
        { val: timeLeft.days, label: t.lottery.days },
        { val: timeLeft.hours, label: t.lottery.hours },
        { val: timeLeft.minutes, label: t.lottery.minutes },
        { val: timeLeft.seconds, label: t.lottery.seconds },
      ].map((unit, i) => (
        <div key={i} className="flex flex-col items-center">
          <div className="relative">
            <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-purple-500/30 rounded-xl w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center shadow-lg shadow-purple-500/10">
              <span className="text-lg sm:text-2xl font-bold text-white font-mono tabular-nums">
                {String(unit.val).padStart(2, '0')}
              </span>
            </div>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-purple-500/5 to-transparent pointer-events-none" />
          </div>
          <span className="text-[10px] text-purple-300/60 mt-1 font-semibold tracking-wider">{unit.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Number Ball ─────────────────────────────────────
function NumberBall({
  number,
  selected,
  disabled,
  isWinning,
  isMatch,
  size = 'md',
  onClick,
}: {
  number: number;
  selected?: boolean;
  disabled?: boolean;
  isWinning?: boolean;
  isMatch?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-lg',
  };

  const baseClasses = `
    ${sizeClasses[size]}
    rounded-full font-bold flex items-center justify-center
    transition-all duration-300 select-none
    ${onClick && !disabled ? 'cursor-pointer' : ''}
    ${disabled && !selected ? 'opacity-30 cursor-not-allowed' : ''}
  `;

  const stateClasses = isMatch
    ? 'bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-lg shadow-green-500/40 ring-2 ring-green-300 scale-110'
    : isWinning
    ? 'bg-gradient-to-br from-amber-400 to-yellow-600 text-black shadow-lg shadow-amber-500/40 ring-2 ring-amber-300'
    : selected
    ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/40 ring-2 ring-purple-300 scale-105'
    : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white hover:scale-105 border border-slate-600/50';

  return (
    <button
      type="button"
      className={`${baseClasses} ${stateClasses}`}
      onClick={disabled && !selected ? undefined : onClick}
      disabled={disabled && !selected}
    >
      {number}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────
export function LotteryPage() {
  const { t } = useI18n();
  const { profile, fetchProfile } = useAuthStore();
  const [info, setInfo] = useState<LotteryInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showMyTickets, setShowMyTickets] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [buyAnimation, setBuyAnimation] = useState(false);
  const messageTimeout = useRef<ReturnType<typeof setTimeout>>();

  const fetchInfo = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_lottery_info');
      if (error) throw error;
      setInfo(data as LotteryInfo);
    } catch (err) {
      console.error('Error fetching lottery info:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInfo();
    const interval = setInterval(fetchInfo, 30000);
    return () => clearInterval(interval);
  }, [fetchInfo]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    if (messageTimeout.current) clearTimeout(messageTimeout.current);
    setMessage({ type, text });
    messageTimeout.current = setTimeout(() => setMessage(null), 5000);
  };

  const toggleNumber = (num: number) => {
    setSelectedNumbers((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num);
      if (prev.length >= 4) return prev;
      return [...prev, num].sort((a, b) => a - b);
    });
  };

  const quickPick = () => {
    const nums = new Set<number>();
    while (nums.size < 4) {
      nums.add(Math.floor(Math.random() * 30) + 1);
    }
    setSelectedNumbers(Array.from(nums).sort((a, b) => a - b));
  };

  const buyTicket = async () => {
    if (selectedNumbers.length !== 4 || buying) return;

    // Check if user already has a ticket with the same numbers
    if (info?.user_tickets?.some(t => 
      JSON.stringify(t.numbers.sort((a: number, b: number) => a - b)) === JSON.stringify(selectedNumbers.sort((a, b) => a - b))
    )) {
      showMessage('error', 'Ya tienes un ticket con estos números. Elige una combinación diferente.');
      return;
    }

    setBuying(true);
    try {
      const { data, error } = await supabase.rpc('buy_lottery_ticket', {
        p_numbers: selectedNumbers,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; cost?: number; tickets_remaining?: number };

      if (!result.success) {
        showMessage('error', result.error || 'Error al comprar ticket');
        return;
      }

      setBuyAnimation(true);
      setTimeout(() => setBuyAnimation(false), 1500);

      showMessage('success', `🎫 ¡Ticket comprado! Números: ${selectedNumbers.join(', ')} (-${result.cost} TUNG)`);
      setSelectedNumbers([]);
      fetchProfile();
      fetchInfo();
    } catch (err: any) {
      showMessage('error', err.message || 'Error inesperado');
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
          <p className="text-purple-300 animate-pulse">{t.lottery.loading}</p>
        </div>
      </div>
    );
  }

  if (!info || !info.enabled) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center bg-slate-800/60 rounded-2xl p-8 border border-slate-700">
          <img
            src="https://photos.pinksale.finance/file/pinksale-logo-upload/1775067036507-327d40aa0444bcab4ac5ca7406f0eb5e.png"
            alt="Lotería"
            className="w-16 h-16 object-contain opacity-50 mx-auto mb-4"
          />
          <h2 className="text-xl font-bold text-slate-400 mb-2">{t.lottery.title}</h2>
          <p className="text-slate-500">{t.lottery.unavailable}</p>
        </div>
      </div>
    );
  }

  const activeDraw = info.active_draw;
  const canBuy = activeDraw && info.can_buy_tickets && selectedNumbers.length === 4 && info.user_ticket_count < info.max_tickets;

  return (
    <div className="space-y-6 relative">
      {/* ─── Header ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 border border-purple-500/20 p-6 md:p-8">
        <StarsBackground />

        {/* Floating orbs */}
        <div className="absolute top-10 right-10 w-32 h-32 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-5 left-10 w-24 h-24 bg-indigo-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <img
                  src="https://photos.pinksale.finance/file/pinksale-logo-upload/1775067036507-327d40aa0444bcab4ac5ca7406f0eb5e.png"
                  alt="Lotería"
                  className="w-14 h-14 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.7)]"
                />
                <div>
                  <h1 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-indigo-300 to-cyan-300">
                    {t.lottery.title}
                  </h1>
                  <p className="text-purple-400/70 text-sm font-medium">{t.lottery.subtitle}</p>
                </div>
              </div>
              {activeDraw && (
                <div className="mt-4">
                  <p className="text-purple-300/50 text-xs font-semibold uppercase tracking-wider mb-2">
                    {t.lottery.drawNumber}{activeDraw.draw_number} • {t.lottery.nextDrawIn}
                  </p>
                  <CountdownTimer targetDate={activeDraw.closes_at} />
                </div>
              )}
            </div>

            {/* Jackpot Display */}
            {activeDraw && (
              <div className="text-center md:text-right">
                <p className="text-purple-300/50 text-xs font-semibold uppercase tracking-wider mb-1">
                  {t.lottery.jackpot}
                </p>
                <div className="relative">
                  <div className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300 animate-pulse">
                    {Math.floor(activeDraw.prize_pool).toLocaleString()}
                  </div>
                  <p className="text-amber-400/60 text-sm font-bold">TUNG</p>
                </div>
                {info?.tung_price_usd != null && info.tung_price_usd > 0 && (
                  <p className="text-emerald-400 text-sm font-bold mt-1">
                    ≈ ${(activeDraw.prize_pool * info.tung_price_usd).toFixed(2)} USD
                  </p>
                )}
                <div className="flex items-center gap-4 mt-3 justify-center md:justify-end text-xs text-purple-300/40">
                  <span className="flex items-center gap-1">
                    <Ticket className="w-3 h-3" />
                    {activeDraw.total_tickets} {t.lottery.ticketsSold}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Message Toast ─── */}
      {message && (
        <div className={`
          fixed top-4 left-4 right-4 sm:left-auto sm:right-4 z-50 sm:max-w-md p-4 rounded-xl shadow-2xl border backdrop-blur-sm
          animate-[slideIn_0.3s_ease-out]
          ${message.type === 'success'
            ? 'bg-green-950/90 border-green-500/40 text-green-300'
            : 'bg-red-950/90 border-red-500/40 text-red-300'
          }
        `}>
          <div className="flex items-start gap-3">
            {message.type === 'success' ? <Check className="w-5 h-5 text-green-400 mt-0.5 shrink-0" /> : <X className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />}
            <p className="text-sm font-medium">{message.text}</p>
            <button onClick={() => setMessage(null)} className="ml-auto text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!activeDraw ? (
        /* ─── No Active Draw ─── */
        <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 p-8 text-center">
          <Clock className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-400 mb-2">{t.lottery.noActiveDraw}</h2>
          <p className="text-slate-500">{t.lottery.noActiveDrawDesc}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ─── Number Selection Panel ─── */}
          <div className="lg:col-span-2">
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-purple-500/10 overflow-hidden">
              {/* Title bar */}
              <div className="bg-gradient-to-r from-purple-900/50 to-indigo-900/50 px-6 py-4 border-b border-purple-500/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-500/20 p-1.5 rounded-lg">
                      <img
                        src="https://photos.pinksale.finance/file/pinksale-logo-upload/1775067036507-327d40aa0444bcab4ac5ca7406f0eb5e.png"
                        alt="Lotería"
                        className="w-6 h-6 object-contain drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]"
                      />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">{t.lottery.pickNumbers}</h2>
                      <p className="text-purple-300/50 text-xs">{t.lottery.pickNumbersDesc}</p>
                    </div>
                  </div>
                  <button
                    onClick={quickPick}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-sm font-medium transition-all hover:scale-105"
                  >
                    <Shuffle className="w-4 h-4" />
                    {t.lottery.autoPick}
                  </button>
                </div>
              </div>

              {/* Selected numbers display */}
              <div className="px-6 py-4 border-b border-slate-700/30">
                <div className="flex items-center gap-3 justify-center">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="relative">
                      {selectedNumbers[i] ? (
                        <div className={`
                          w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600
                          flex items-center justify-center text-xl font-black text-white
                          shadow-lg shadow-purple-500/30 transition-all duration-300
                          ${buyAnimation ? 'animate-bounce' : 'animate-[fadeIn_0.3s_ease-out]'}
                        `}>
                          {selectedNumbers[i]}
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl border-2 border-dashed border-purple-500/20 flex items-center justify-center">
                          <span className="text-purple-500/30 text-lg">?</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {selectedNumbers.length > 0 && selectedNumbers.length < 4 && (
                  <p className="text-center text-purple-300/40 text-xs mt-2">
                    {t.lottery.missingNumbers} {4 - selectedNumbers.length} número{4 - selectedNumbers.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Tickets closed banner */}
              {activeDraw && !info.can_buy_tickets && (
                <div className="mx-6 mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                  <p className="text-amber-300 text-sm font-medium flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4" />
                    {t.lottery.ticketsClosed}
                  </p>
                </div>
              )}

              {/* Number grid */}
              <div className="p-6">
                <div className="grid grid-cols-6 sm:grid-cols-10 gap-2 max-w-lg mx-auto">
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => (
                    <NumberBall
                      key={num}
                      number={num}
                      selected={selectedNumbers.includes(num)}
                      disabled={selectedNumbers.length >= 4 && !selectedNumbers.includes(num)}
                      onClick={() => toggleNumber(num)}
                    />
                  ))}
                </div>

                {/* Action buttons */}
                <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 justify-center">
                  <button
                    onClick={buyTicket}
                    disabled={!canBuy || buying}
                    className={`
                      relative w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-base
                      transition-all duration-300 flex items-center justify-center gap-2
                      ${canBuy && !buying
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105'
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }
                    `}
                  >
                    {buying ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Ticket className="w-5 h-5" />
                    )}
                    {buying ? t.lottery.buying : `${t.lottery.buyTicket} • ${info.final_cost} TUNG`}
                  </button>

                  {selectedNumbers.length > 0 && (
                    <button
                      onClick={() => setSelectedNumbers([])}
                      className="px-4 py-3 rounded-xl bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white text-sm font-medium transition-all"
                    >
                      {t.lottery.clear}
                    </button>
                  )}
                </div>

                {/* Ticket info */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Ticket className="w-3 h-3" />
                    {info.user_ticket_count}/{info.max_tickets} {t.lottery.tickets}
                  </span>
                  <span className="flex items-center gap-1">
                    <Coins className="w-3 h-3" />
                    {t.lottery.cost}: {info.ticket_cost} TUNG
                  </span>
                  {info.is_vip && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Crown className="w-3 h-3" />
                      {t.lottery.vipLabel}: {info.final_cost} TUNG (-50%)
                    </span>
                  )}
                  {info.usd_mode && info.ticket_cost_usd != null && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      ≈ ${info.ticket_cost_usd} USD
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Coins className="w-3 h-3 text-purple-400" />
                    {t.lottery.yourBalance}: {Math.floor(profile?.tung_balance || 0).toLocaleString()} TUNG
                  </span>
                </div>
              </div>
            </div>

            {/* ─── My Tickets ─── */}
            {info.user_tickets.length > 0 && (
              <div className="mt-4 bg-slate-800/40 rounded-2xl border border-slate-700/30 overflow-hidden">
                <button
                  onClick={() => setShowMyTickets(!showMyTickets)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Ticket className="w-5 h-5 text-purple-400" />
                    <span className="font-bold text-white">{t.lottery.myTickets} ({info.user_tickets.length})</span>
                  </div>
                  {showMyTickets ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>
                {showMyTickets && (
                  <div className="px-6 pb-4 space-y-2">
                    {info.user_tickets.map((ticket, idx) => (
                      <div key={ticket.id} className="flex items-center gap-3 bg-slate-900/50 rounded-xl px-4 py-3 border border-slate-700/30">
                        <span className="text-purple-300/50 text-xs font-mono w-6">#{idx + 1}</span>
                        <div className="flex gap-2">
                          {ticket.numbers.map((n) => (
                            <NumberBall key={n} number={n} selected size="sm" />
                          ))}
                        </div>
                        <span className="ml-auto text-slate-500 text-xs">-{ticket.cost} TUNG</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── Right Panel ─── */}
          <div className="space-y-4">
            {/* Prize Table */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-amber-500/10 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-900/30 to-yellow-900/30 px-5 py-3 border-b border-amber-500/10">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-white">{t.lottery.prizeTable}</h3>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3 bg-gradient-to-r from-amber-500/10 to-transparent rounded-xl px-4 py-3 border border-amber-500/10">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center text-[8px] font-bold text-black">✓</div>
                    ))}
                  </div>
                  <div className="flex-1">
                    <p className="text-amber-300 font-bold text-sm">{t.lottery.fourMatch}</p>
                    <p className="text-amber-400/50 text-xs">{t.lottery.fourMatchOdds}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-400 font-black text-lg">{t.lottery.jackpotPrize}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/30">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-[8px] font-bold text-white">✓</div>
                    ))}
                    <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-[8px] font-bold text-slate-400">✗</div>
                  </div>
                  <div className="flex-1">
                    <p className="text-green-300 font-bold text-sm">{t.lottery.threeMatch}</p>
                    <p className="text-green-400/50 text-xs">{t.lottery.threeMatchOdds}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-bold">{(info?.prize_3match ?? 500).toLocaleString()} TUNG</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/30">
                  <div className="flex gap-1">
                    {[1, 2].map((n) => (
                      <div key={n} className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center text-[8px] font-bold text-white">✓</div>
                    ))}
                    {[3, 4].map((n) => (
                      <div key={n} className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-[8px] font-bold text-slate-400">✗</div>
                    ))}
                  </div>
                  <div className="flex-1">
                    <p className="text-blue-300 font-bold text-sm">{t.lottery.twoMatch}</p>
                    <p className="text-blue-400/50 text-xs">{t.lottery.twoMatchOdds}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-400 font-bold">{(info?.prize_2match ?? 50).toLocaleString()} TUNG</p>
                  </div>
                </div>
              </div>
            </div>

            {/* How to play */}
            <div className="bg-slate-800/40 rounded-2xl border border-slate-700/30 p-5">
              <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-purple-400" />
                {t.lottery.howToPlay}
              </h3>
              <ol className="space-y-2 text-sm text-slate-400">
                <li className="flex gap-2">
                  <span className="bg-purple-500/20 text-purple-300 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  {t.lottery.step1}
                </li>
                <li className="flex gap-2">
                  <span className="bg-purple-500/20 text-purple-300 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  {t.lottery.step2}
                </li>
                <li className="flex gap-2">
                  <span className="bg-purple-500/20 text-purple-300 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  {t.lottery.step3}
                </li>
                <li className="flex gap-2">
                  <span className="bg-purple-500/20 text-purple-300 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0">4</span>
                  {t.lottery.step4}
                </li>
              </ol>
              <div className="mt-3 p-3 bg-amber-500/5 rounded-lg border border-amber-500/10">
                <p className="text-amber-300/70 text-xs flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  {t.lottery.vipDiscount}
                </p>
              </div>
            </div>

            {/* Refresh */}
            <button
              onClick={() => { setLoading(true); fetchInfo(); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/30 text-slate-400 hover:text-white text-sm font-medium transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              {t.lottery.refresh}
            </button>
          </div>
        </div>
      )}

      {/* ─── History Section ─── */}
      <div className="bg-slate-800/40 rounded-2xl border border-slate-700/30 overflow-hidden">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-800/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-purple-400" />
            <span className="font-bold text-white">{t.lottery.drawHistory}</span>
          </div>
          {showHistory ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </button>

        {showHistory && (
          <div className="px-6 pb-6">
            {info.past_draws.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">{t.lottery.noCompletedDraws}</p>
            ) : (
              <div className="space-y-3">
                {info.past_draws.map((draw) => (
                  <div key={draw.id} className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-purple-300/50 text-xs font-semibold">Sorteo #{draw.draw_number}</span>
                          <span className="text-slate-500 text-xs">•</span>
                          <span className="text-slate-500 text-xs">
                            {new Date(draw.drawn_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {draw.winning_numbers?.map((n) => (
                            <NumberBall key={n} number={n} isWinning size="sm" />
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Ticket className="w-3 h-3 text-slate-500" />
                          <span className="text-slate-400 text-xs">{draw.total_tickets} tickets</span>
                        </div>
                        {draw.jackpot_winner ? (
                          <div className="flex items-center gap-1 text-amber-400 text-sm font-bold mt-1">
                            <Trophy className="w-4 h-4" />
                            {draw.jackpot_winner} ganó {Math.floor(draw.jackpot_amount).toLocaleString()} TUNG
                          </div>
                        ) : (
                          <p className="text-slate-500 text-xs mt-1">Sin ganador del jackpot</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Winners */}
            {info.past_winners.length > 0 && (
              <div className="mt-6">
                <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Ganadores Recientes
                </h4>
                <div className="space-y-2">
                  {info.past_winners.map((winner, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 sm:gap-3 bg-slate-900/30 rounded-lg px-3 sm:px-4 py-2.5 border border-slate-700/20">
                      <span className={`text-sm font-bold ${winner.matches === 4 ? 'text-amber-400' : winner.matches === 3 ? 'text-green-400' : 'text-blue-400'}`}>
                        {winner.matches}/4
                      </span>
                      <span className="text-white text-sm font-medium truncate max-w-[80px] sm:max-w-none">{winner.username}</span>
                      <div className="flex gap-1 ml-auto">
                        {winner.numbers.map((n) => (
                          <NumberBall
                            key={n}
                            number={n}
                            isMatch={winner.winning_numbers.includes(n)}
                            size="sm"
                          />
                        ))}
                      </div>
                      <span className={`font-bold text-sm ${winner.matches === 4 ? 'text-amber-400' : winner.matches === 3 ? 'text-green-400' : 'text-blue-400'}`}>
                        +{Math.floor(winner.prize).toLocaleString()} TUNG
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
