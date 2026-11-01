import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';

/**
 * Hook to check if the current user has an active VIP Plus subscription.
 * Reusable across all game pages that need to display VIP bonuses.
 */
export function useIsUserPlus(): boolean {
  const { profile } = useAuthStore();
  const [isPlus, setIsPlus] = useState(false);

  useEffect(() => {
    if (!profile) {
      setIsPlus(false);
      return;
    }
    const check = async () => {
      try {
        const { data } = await supabase
          .from('plus_subscriptions')
          .select('id')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        setIsPlus(!!data);
      } catch {
        setIsPlus(false);
      }
    };
    check();
  }, [profile]);

  return isPlus;
}
