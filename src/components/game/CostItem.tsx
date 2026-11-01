/**
 * CostItem - Muestra el costo de un recurso con indicador de disponibilidad
 *
 * Indica visualmente si el jugador puede permitirse el costo:
 * - Texto blanco: puede pagar
 * - Texto rojo: recursos insuficientes
 */

import { formatNumber } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';

interface CostItemProps {
  label: string;
  value: number;
  available: number;
  variant?: 'default' | 'compact';
}

export function CostItem({ label, value, available, variant = 'default' }: CostItemProps) {
  const { t } = useI18n();
  const canAfford = available >= value;

  const resourceColors: Record<string, string> = {
    M: 'text-gray-400',
    C: 'text-cyan-400',
    D: 'text-green-400',
    [t.resources.metal]: 'text-gray-400',
    [t.resources.crystal]: 'text-cyan-400',
    [t.resources.deuterium]: 'text-green-400',
    Metal: 'text-gray-400',
    Crystal: 'text-cyan-400',
    Deuterium: 'text-green-400',
  };

  if (variant === 'compact') {
    return (
      <div className="bg-space-700/30 rounded px-2 py-1 flex-1 min-w-0">
        <span className={`text-xs ${resourceColors[label] || 'text-gray-500'}`}>{label}:</span>
        <span
          className={`font-semibold text-xs ml-1 ${canAfford ? 'text-white' : 'text-cyber-red'}`}
        >
          {formatNumber(value)}
        </span>
      </div>
    );
  }

  return (
    <div className="text-center min-w-0">
      <p className={`text-xs sm:text-sm ${resourceColors[label] || 'text-gray-500'}`}>{label}</p>
      <p className={`font-semibold text-sm truncate ${canAfford ? 'text-white' : 'text-cyber-red'}`}>
        {formatNumber(value)}
      </p>
    </div>
  );
}
