import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { X, SkipForward, Swords } from 'lucide-react';

type BattleResult = 'victory' | 'defeat';

const VIDEO_URLS: Record<BattleResult, string> = {
  victory: 'https://falcox.net/xnova/Victoria.webm',
  defeat: 'https://falcox.net/xnova/Derrota.webm',
};

/**
 * Determine whether the user won or lost from the battle message.
 * Uses the EXACT same parsing logic as PlainTextBattleReport in MessagesPage.tsx
 * Returns null for draws/empate or if the result cannot be determined.
 */
function determineBattleResult(subject: string, body: string): BattleResult | null {
  // Detect ACS report
  const isAcsReport = body.startsWith('Combate ACS');

  // EXACT same regex as MessagesPage PlainTextBattleReport
  const resultMatch = body.match(/Resultado:\s*(VICTORIA ATACANTE|VICTORIA DEFENSOR|VICTORIA|DERROTA|EMPATE|ATTACKER|DEFENDER|DRAW)/i);
  const rawResult = (resultMatch?.[1] || '').toUpperCase();

  const isAttackerWin = rawResult === 'VICTORIA ATACANTE' || rawResult === 'VICTORIA' || rawResult === 'ATTACKER';
  const isDefenderWin = rawResult === 'VICTORIA DEFENSOR' || rawResult === 'DERROTA' || rawResult === 'DEFENDER';
  const isDraw = rawResult === 'DRAW' || rawResult === 'EMPATE';

  if (isDraw) return null;

  // EXACT same perspective logic as MessagesPage
  const isUserAttacker = body.startsWith('Tu flota') || isAcsReport;
  const isUserDefender = body.startsWith('Tu planeta');

  const userWon = (isUserAttacker && isAttackerWin) || (isUserDefender && isDefenderWin);
  const userLost = (isUserAttacker && isDefenderWin) || (isUserDefender && isAttackerWin);

  if (userWon) return 'victory';
  if (userLost) return 'defeat';

  // Fallback: check ACS subject
  const subjectLower = subject.toLowerCase();
  if (subjectLower.includes('- victoria')) return 'victory';
  if (subjectLower.includes('- derrota')) return 'defeat';

  return null;
}

export function BattleVideoPopup() {
  const { profile } = useAuthStore();
  const [currentBattle, setCurrentBattle] = useState<{ id: string; result: BattleResult } | null>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const processedIds = useRef(new Set<string>());
  const mountTime = useRef<string>(new Date().toISOString());

  const handleClose = useCallback(() => {
    setCurrentBattle(null);
    setVideoEnded(false);
  }, []);

  // Process a battle message and trigger video if appropriate
  const processBattleMessage = useCallback((msg: { id: string; subject: string; body: string | null }) => {
    if (processedIds.current.has(msg.id)) return;
    processedIds.current.add(msg.id);
    const result = determineBattleResult(msg.subject, msg.body || '');
    if (result) {
      setCurrentBattle(prev => prev || { id: msg.id, result });
      setVideoEnded(false);
    }
  }, []);

  useEffect(() => {
    if (!profile?.id) return;

    // On mount: mark existing messages as "seen" so they don't trigger videos
    // Only NEW messages arriving AFTER mount should trigger the video
    const initAndPoll = async () => {
      // First call: mark existing messages so they don't trigger
      const { data: existing } = await supabase
        .from('messages')
        .select('id')
        .eq('recipient_id', profile.id)
        .eq('message_type', 'battle')
        .gte('created_at', mountTime.current)
        .order('created_at', { ascending: false })
        .limit(10);

      // Mark any existing messages at mount time so they don't play
      // (user has already seen them or will see them in messages)
      if (existing) {
        existing.forEach(m => processedIds.current.add(m.id));
      }
    };

    initAndPoll();

    // Realtime subscription: catch new battle messages instantly
    const channel = supabase
      .channel('battle-video-popup')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload) => {
          const msg = payload.new as { id: string; subject: string; body: string; message_type: string };
          if (msg.message_type === 'battle') {
            processBattleMessage(msg);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, processBattleMessage]);

  if (!currentBattle) return null;

  const isVictory = currentBattle.result === 'victory';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in">
      {/* Card container */}
      <div className={`
        relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl
        border-2 ${isVictory ? 'border-cyber-green/60 shadow-cyber-green/20' : 'border-red-500/60 shadow-red-500/20'}
        bg-space-800
        animate-slide-in-up
      `}>
        {/* Header */}
        <div className={`
          flex items-center justify-between px-5 py-3
          ${isVictory
            ? 'bg-gradient-to-r from-cyber-green/20 to-emerald-500/10 border-b border-cyber-green/30'
            : 'bg-gradient-to-r from-red-500/20 to-red-900/10 border-b border-red-500/30'
          }
        `}>
          <div className="flex items-center gap-3">
            <Swords className={`w-5 h-5 ${isVictory ? 'text-cyber-green' : 'text-red-400'}`} />
            <span className={`font-orbitron text-sm font-bold tracking-wider ${isVictory ? 'text-cyber-green' : 'text-red-400'}`}>
              {isVictory ? '⚔️ VICTORIA ⚔️' : '💥 DERROTA 💥'}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Cerrar"
          >
            <X className="w-5 h-5 text-gray-400 hover:text-white" />
          </button>
        </div>

        {/* Video area */}
        <div className="relative bg-black">
          <video
            ref={videoRef}
            src={VIDEO_URLS[currentBattle.result]}
            autoPlay
            playsInline
            onEnded={() => setVideoEnded(true)}
            className="w-full aspect-video object-contain"
          />
        </div>

        {/* Footer */}
        <div className={`
          flex items-center justify-between px-5 py-3
          ${isVictory
            ? 'bg-gradient-to-r from-cyber-green/10 to-transparent border-t border-cyber-green/20'
            : 'bg-gradient-to-r from-red-500/10 to-transparent border-t border-red-500/20'
          }
        `}>
          <span className="text-xs text-gray-500">Reporte de Batalla</span>
          <button
            onClick={handleClose}
            className="flex items-center gap-2 px-4 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg transition-all text-sm border border-white/10"
          >
            <SkipForward className="w-3.5 h-3.5" />
            {videoEnded ? 'Cerrar' : 'Omitir'}
          </button>
        </div>
      </div>
    </div>
  );
}
