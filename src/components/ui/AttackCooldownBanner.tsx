import { useState, useEffect, useCallback } from 'react';
import { Shield, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';

export function AttackCooldownBanner() {
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [remaining, setRemaining] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  const fetchDeadline = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_attack_cooldown_end');
      if (error || !data) {
        setExpired(true);
        setLoading(false);
        return;
      }
      const d = new Date(data);
      if (d.getTime() < Date.now()) {
        setExpired(true);
      } else {
        setDeadline(d);
      }
    } catch {
      setExpired(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDeadline();
  }, [fetchDeadline]);

  useEffect(() => {
    if (!deadline || expired) return;

    const tick = () => {
      const now = Date.now();
      const diff = deadline.getTime() - now;

      if (diff <= 0) {
        setExpired(true);
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      setRemaining({
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
      });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline, expired]);

  if (loading || expired || !deadline) return null;

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <div className="mb-4 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-950/60 via-amber-900/40 to-amber-950/60 backdrop-blur-sm overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.08),transparent_70%)]" />
      <div className="relative px-4 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5">
          <div className="flex items-center gap-2 text-amber-400">
            <Shield className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-semibold uppercase tracking-wide">
              {t.peaceShield.active}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500/70" />
            <div className="flex items-center gap-1 font-mono">
              <TimeBlock value={pad(remaining.hours)} label="h" />
              <span className="text-amber-400 text-lg font-bold animate-pulse">:</span>
              <TimeBlock value={pad(remaining.minutes)} label="m" />
              <span className="text-amber-400 text-lg font-bold animate-pulse">:</span>
              <TimeBlock value={pad(remaining.seconds)} label="s" />
            </div>
          </div>

          <span className="text-xs text-amber-300/60 text-center sm:text-left">
            {t.peaceShield.attacksDisabled}
          </span>
        </div>
      </div>
    </div>
  );
}

function TimeBlock({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline">
      <span className="bg-amber-500/15 border border-amber-500/20 rounded px-1.5 py-0.5 text-amber-300 text-base sm:text-lg font-bold tabular-nums">
        {value}
      </span>
      <span className="text-amber-500/50 text-[10px] ml-0.5">{label}</span>
    </span>
  );
}
