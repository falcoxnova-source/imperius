/**
 * ShipyardQueuePanel - Panel de cola de construccion del hangar
 *
 * El hangar tiene UNA sola cola secuencial compartida por naves y defensas:
 * - Solo el item en posicion 1 se construye; el resto espera su turno
 * - Se muestra la cola completa para que se vea que hay por delante
 * - Tiempo restante, progreso, cancelar y completar con TUNG
 *
 * Usado por ShipyardPage y DefensePage
 */

import { useEffect, useState, useCallback } from 'react';
import { Rocket, Shield, Clock, X, Loader2, Coins, AlertTriangle } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { formatTime } from '../../lib/utils';
import { useI18n, translateShipName, translateDefenseName } from '../../lib/i18n';
import { CancelConfirmModal } from '../ui/CancelConfirmModal';
import type { ShipyardQueueItem } from '../../types/game';

interface ShipyardQueuePanelProps {
  queue: ShipyardQueueItem[];
  onCancel: (id: string) => void;
  isProcessing?: boolean;
  accentColor?: 'orange' | 'pink';
}

export function ShipyardQueuePanel({
  queue,
  onCancel,
  isProcessing: parentIsProcessing = false,
  accentColor = 'orange',
}: ShipyardQueuePanelProps) {
  const { t } = useI18n();
  const { instantCompleteShipyardItem, calculateFxuCostShipyard } = useGameStore();
  const { profile, fetchProfile } = useAuthStore();
  const [, setTick] = useState(0);
  const [fxuCosts, setFxuCosts] = useState<Record<string, number>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ShipyardQueueItem | null>(null);

  const colorClasses = {
    orange: {
      border: 'border-cyber-orange/50',
      bg: 'bg-cyber-orange/20',
      text: 'text-cyber-orange',
      loader: 'text-cyber-orange',
    },
    pink: {
      border: 'border-cyber-pink/50',
      bg: 'bg-cyber-pink/20',
      text: 'text-cyber-pink',
      loader: 'text-cyber-pink',
    },
  };
  const colors = colorClasses[accentColor];

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateFxuCosts = async () => {
      const costs: Record<string, number> = {};
      for (const item of queue) {
        const cost = await calculateFxuCostShipyard(item.id);
        costs[item.id] = cost;
      }
      setFxuCosts(costs);
    };
    if (queue.length > 0) {
      updateFxuCosts();
      const interval = setInterval(updateFxuCosts, 10000);
      return () => clearInterval(interval);
    }
  }, [queue, calculateFxuCostShipyard]);

  const handleInstantComplete = useCallback(
    async (queueId: string) => {
      if (isProcessing || parentIsProcessing) return;
      setIsProcessing(true);
      try {
        const result = await instantCompleteShipyardItem(queueId, fetchProfile);
        if (!result.success && result.error) {
          console.error('Instant complete failed:', result.error);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, parentIsProcessing, instantCompleteShipyardItem, fetchProfile]
  );

  // La cola del hangar es unica y secuencial: solo el item en posicion 1
  // se esta construyendo realmente. El resto espera su turno.
  const firstShip = queue.find(q => q.item_type === 'ship' && q.queue_position === 1);
  const firstDefense = queue.find(q => q.item_type === 'defense' && q.queue_position === 1);

  const remainingTimeShip = firstShip?.current_unit_end_time
    ? Math.max(0, Math.floor((new Date(firstShip.current_unit_end_time).getTime() - Date.now()) / 1000))
    : 0;
  const remainingTimeDefense = firstDefense?.current_unit_end_time
    ? Math.max(0, Math.floor((new Date(firstDefense.current_unit_end_time).getTime() - Date.now()) / 1000))
    : 0;

  return (
    <>
      <div className="relative p-[3px] rounded-2xl bg-gradient-to-b from-amber-300 via-amber-700 to-amber-500 shadow-[0_14px_40px_rgba(0,0,0,0.65)]">
        <span className="pointer-events-none absolute left-2 top-2 w-3.5 h-3.5 border-l-[3px] border-t-[3px] border-amber-200 z-20 rounded-tl-sm" />
        <span className="pointer-events-none absolute right-2 top-2 w-3.5 h-3.5 border-r-[3px] border-t-[3px] border-amber-200 z-20 rounded-tr-sm" />
        <span className="pointer-events-none absolute left-2 bottom-2 w-3.5 h-3.5 border-l-[3px] border-b-[3px] border-amber-200 z-20 rounded-bl-sm" />
        <span className="pointer-events-none absolute right-2 bottom-2 w-3.5 h-3.5 border-r-[3px] border-b-[3px] border-amber-200 z-20 rounded-br-sm" />
        <div className="relative rounded-[13px] bg-[linear-gradient(180deg,#2f2b25_0%,#1e1b16_45%,#0f0d0a_100%)] p-3 sm:p-4 overflow-hidden">
        <h3 className="font-serif text-base sm:text-lg font-semibold text-amber-100 mb-3 sm:mb-4 flex items-center gap-2">
          <Loader2 className={`w-4 h-4 sm:w-5 sm:h-5 animate-spin ${colors.loader} flex-shrink-0`} />
          {t.shipyard.buildQueue}
        </h3>
        <div className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <p className="text-[11px] text-amber-300/90 leading-tight">
            Al cancelar, solo se devuelven recursos de las unidades no completadas. La unidad en construccion se pierde.
          </p>
        </div>
        <div className="space-y-2">
          {queue.map((item, index) => {
            const name = item.ship_type
              ? translateShipName(t, item.ship_type.code, item.ship_type.name)
              : item.defense_type
                ? translateDefenseName(t, item.defense_type.code, item.defense_type.name)
                : t.common.unknown;
            const remaining = item.quantity - item.quantity_completed;
            const isFirstOfType = item === firstShip || item === firstDefense;
            const isShip = item.item_type === 'ship';
            const fxuCost = fxuCosts[item.id] || 0;
            const canAffordFxu = profile && Number(profile.tung_balance) >= fxuCost && fxuCost > 0;
            const itemRemainingTime = isShip ? remainingTimeShip : remainingTimeDefense;

            return (
              <div
                key={item.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 sm:p-3 rounded-lg ${
                  isFirstOfType ? `${colors.bg} border ${colors.border}` : 'bg-black/25 border border-amber-800/30'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {item.item_type === 'ship' ? (
                    <Rocket className="w-4 h-4 sm:w-5 sm:h-5 text-cyber-orange flex-shrink-0" />
                  ) : (
                    <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-cyber-pink flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-amber-100 font-semibold text-sm sm:text-base truncate">{name}</p>
                    <p className="text-xs sm:text-sm text-amber-200/60">
                      {item.quantity_completed}/{item.quantity} ({remaining} {t.shipyard.remaining})
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
                  {isFirstOfType && itemRemainingTime > 0 && (
                    <div className={`flex items-center gap-1 sm:gap-2 ${isShip ? 'text-orange-400' : 'text-pink-400'}`}>
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="font-serif font-bold text-sm sm:text-base">
                        {formatTime(itemRemainingTime)}
                      </span>
                    </div>
                  )}
                  {!isFirstOfType && (
                    <div className="flex items-center gap-1 text-gray-500">
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="font-orbitron text-xs sm:text-sm">#{item.queue_position}</span>
                    </div>
                  )}
                  {fxuCost > 0 && (
                    <button
                      onClick={() => handleInstantComplete(item.id)}
                      disabled={!canAffordFxu || isProcessing || parentIsProcessing}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold transition-all ${
                        canAffordFxu && !isProcessing && !parentIsProcessing
                          ? 'bg-gradient-to-b from-amber-300 to-amber-600 text-stone-950 border border-amber-200 hover:from-amber-200 hover:to-amber-500'
                          : 'bg-black/30 text-amber-200/40 cursor-not-allowed border border-amber-800/40'
                      }`}
                      title={
                        canAffordFxu ? `Complete instantly for ${fxuCost} TUNG` : 'Insufficient TUNG'
                      }
                    >
                      <Coins className="w-3 h-3" />
                      {fxuCost}
                    </button>
                  )}
                  <button
                    onClick={() => setCancelTarget(item)}
                    className="p-1.5 sm:p-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 rounded-lg text-red-400 transition-colors"
                    title={t.common.cancel}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      <CancelConfirmModal
        isOpen={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) onCancel(cancelTarget.id);
        }}
        itemName={cancelTarget
          ? cancelTarget.ship_type
            ? translateShipName(t, cancelTarget.ship_type.code, cancelTarget.ship_type.name)
            : cancelTarget.defense_type
              ? translateDefenseName(t, cancelTarget.defense_type.code, cancelTarget.defense_type.name)
              : ''
          : ''}
        type="shipyard"
        isInProgress={cancelTarget?.queue_position === 1}
        totalQuantity={cancelTarget?.quantity}
        completedQuantity={cancelTarget?.quantity_completed}
      />
    </>
  );
}
