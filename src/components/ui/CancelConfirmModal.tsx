import { useState, useEffect } from 'react';
import { AlertTriangle, X, Clock, ArrowDown, Package } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface CancelConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  type: 'building' | 'shipyard';
  isInProgress: boolean;
  progressPercent?: number;
  totalQuantity?: number;
  completedQuantity?: number;
}

export function CancelConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  type,
  isInProgress,
  progressPercent = 0,
  totalQuantity,
  completedQuantity = 0,
}: CancelConfirmModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const refundPercent = isInProgress ? Math.max(0, 100 - Math.floor(progressPercent)) : 100;
  const lostPercent = 100 - refundPercent;
  const remainingUnits = totalQuantity ? totalQuantity - completedQuantity : 0;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200 ${
        isVisible ? 'bg-black/70 backdrop-blur-sm' : 'bg-transparent'
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md transform transition-all duration-300 ${
          isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-space-800 border border-amber-500/40 rounded-2xl overflow-hidden shadow-2xl shadow-amber-500/10">
          <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />

          <div className="relative p-5">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-space-700 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-orbitron text-white text-base">{type === 'building' ? t.cancelBuild.cancelBuilding : t.cancelBuild.cancelProduction}</h3>
                <p className="text-sm text-gray-400">{itemName}</p>
              </div>
            </div>

            {type === 'building' && isInProgress ? (
              <div className="space-y-3 mb-5">
                <div className="bg-space-900/80 rounded-xl p-4 border border-space-700">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-semibold text-white">{t.cancelBuild.currentProgress}</span>
                  </div>

                  <div className="relative h-3 bg-space-700 rounded-full overflow-hidden mb-2">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-red-500 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white drop-shadow-lg">
                        {Math.floor(progressPercent)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between text-xs">
                    <span className="text-red-400">{t.cancelBuild.consumed}: {Math.floor(progressPercent)}%</span>
                    <span className="text-emerald-400">{t.cancelBuild.refund}: {refundPercent}%</span>
                  </div>
                </div>

                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <div className="flex gap-2">
                    <ArrowDown className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-red-300 font-semibold mb-1">
                        {t.cancelBuild.willLoseResources.replace('{percent}', String(lostPercent))}
                      </p>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        {t.cancelBuild.resourcesConsumedProportionally}
                        {' '}{t.cancelBuild.onlyRefunded} <span className="text-emerald-400 font-semibold">{refundPercent}%</span> {t.cancelBuild.correspondingToRemainingTime}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : type === 'building' && !isInProgress ? (
              <div className="space-y-3 mb-5">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                  <p className="text-sm text-emerald-300">
                    {t.cancelBuild.notStartedFullRefund}
                  </p>
                </div>
              </div>
            ) : type === 'shipyard' ? (
              <div className="space-y-3 mb-5">
                <div className="bg-space-900/80 rounded-xl p-4 border border-space-700">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-semibold text-white">{t.cancelBuild.productionStatus}</span>
                  </div>

                  {totalQuantity && totalQuantity > 1 ? (
                    <>
                      <div className="relative h-3 bg-space-700 rounded-full overflow-hidden mb-2">
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${(completedQuantity / totalQuantity) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-400">{t.cancelBuild.completed}: {completedQuantity}/{totalQuantity}</span>
                        <span className="text-amber-400">{t.cancelBuild.pending}: {remainingUnits}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">{t.cancelBuild.oneUnitInProduction}</p>
                  )}
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                  <div className="flex gap-2">
                    <ArrowDown className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-amber-300 font-semibold mb-1">
                        {t.cancelBuild.refundUncompletedUnits}
                      </p>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        <span className="text-emerald-400 font-semibold">{completedQuantity} {t.cancelBuild.completedUnitsKept}</span>.
                        {' '}<span className="text-amber-400 font-semibold">{remainingUnits} {t.cancelBuild.uncompletedUnitsRefunded}</span>.
                        {' '}<span className="text-red-400 font-semibold">{t.cancelBuild.currentUnitLost}</span>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl bg-space-700 hover:bg-space-600 text-gray-300 font-semibold text-sm transition-all"
              >
                {t.cancelBuild.goBack}
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 hover:text-red-300 font-semibold text-sm transition-all"
              >
                {type === 'building' ? t.cancelBuild.cancelBuilding : t.cancelBuild.cancelProduction}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
