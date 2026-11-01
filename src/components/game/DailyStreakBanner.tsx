import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Flame, Trophy, Coins, Timer, Zap } from 'lucide-react';

interface StreakData {
  success: boolean;
  streak?: number;
  best_streak?: number;
  expires_at?: string;
  cost?: number;
  balance?: number;
  error?: string;
}

export function DailyStreakBanner() {
  const { profile, fetchProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [progress, setProgress] = useState(0);

  const loadStreak = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase.rpc('get_daily_streak_status');
    if (data) setStreakData(data as StreakData);
  }, [profile?.id]);

  useEffect(() => {
    loadStreak();
    const interval = setInterval(loadStreak, 300000); // 5 min
    return () => clearInterval(interval);
  }, [loadStreak]);

  // Update countdown timer
  useEffect(() => {
    if (!streakData?.expires_at) return;
    
    const updateTimer = () => {
      const now = Date.now();
      const expires = new Date(streakData.expires_at!).getTime();
      const diff = expires - now;
      
      if (diff <= 0) {
        setTimeLeft('Expirado');
        setProgress(0);
        loadStreak();
        return;
      }
      
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(`${hours}h ${minutes}m`);
      setProgress(Math.min(100, ((24 * 3600000 - diff) / (24 * 3600000)) * 100));
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 30000); // 30s
    return () => clearInterval(interval);
  }, [streakData?.expires_at, loadStreak]);

  const activate = async () => {
    setActivating(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('activate_daily_streak');
    setActivating(false);
    
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    
    if (data?.success) {
      setStreakData(data as StreakData);
      setMessage({ type: 'success', text: `¡Racha activada! Día ${data.streak}` });
      await fetchProfile();
    } else {
      setMessage({ type: 'error', text: data?.error || 'Error al activar' });
    }
  };

  const isActive = streakData?.expires_at && new Date(streakData.expires_at) > new Date();
  const currentStreak = profile?.daily_streak_count || 0;
  const bestStreak = streakData?.best_streak || 0;
  const cost = streakData?.cost || 10;
  const canAfford = (profile?.tung_balance || 0) >= cost;

  return (
    <div className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-500 ${
      isActive 
        ? 'bg-gradient-to-br from-amber-900/20 via-orange-900/10 to-stone-900 border-amber-500/40 shadow-lg shadow-amber-500/10' 
        : 'bg-stone-900/60 border-amber-700/30'
    }`}>
      {/* Background glow */}
      {isActive && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.08),transparent_70%)]" />
      )}
      
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Icon & Status */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className={`p-2 rounded-lg ${isActive ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-stone-800/60'}`}>
            <Flame className={`w-6 h-6 ${isActive ? 'text-amber-400 animate-pulse' : 'text-stone-500'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-serif font-bold ${isActive ? 'text-amber-400' : 'text-stone-400'}`}>
                {isActive ? 'ACTIVO' : 'Racha Diaria'}
              </span>
              {isActive && (
                <span className="flex items-center gap-1 text-xs text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  <Timer className="w-3 h-3" />
                  {timeLeft}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-stone-400 flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-400" /> Racha: {currentStreak} días
              </span>
              {bestStreak > 0 && (
                <span className="text-xs text-stone-400 flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-yellow-400" /> Mejor: {bestStreak}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar (when active) */}
        {isActive && (
          <div className="flex-1 w-full sm:w-auto">
            <div className="w-full h-2 bg-stone-800/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-1000"
                style={{ width: `${100 - progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Bonus info + Button */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-xs text-stone-400 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            +5% producción · {cost} TUNG/día
          </div>
          <button
            onClick={activate}
            disabled={isActive || !canAfford || activating}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              isActive
                ? 'bg-amber-500/10 text-amber-400/50 cursor-not-allowed'
                : !canAfford
                  ? 'bg-stone-800/60 text-stone-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-stone-900 shadow-lg shadow-amber-500/20'
            } disabled:opacity-50`}
          >
            {activating ? (
              <span className="animate-pulse">...</span>
            ) : isActive ? (
              'Activo'
            ) : (
              <>
                <Coins className="w-3.5 h-3.5" />
                Activar · {cost}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mt-3 text-xs px-3 py-1.5 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
