/**
 * Estilos visuales para efectos de batalla (cosméticos).
 * Usado en CombatSimulatorPage, FleetPage, etc.
 */

export interface BattleEffectStyle {
  glow: string;
  particle: string;
  border: string;
  badge: string;
  label: string;
  emoji: string;
}

export const BATTLE_EFFECT_STYLES: Record<string, BattleEffectStyle> = {
  battle_crimson: {
    glow: 'shadow-red-600/40 shadow-[0_0_30px_rgba(239,68,68,0.3)]',
    particle: 'bg-gradient-to-r from-red-500 via-orange-500 to-red-600',
    border: 'border-red-500/40',
    badge: 'bg-red-500/20 text-red-300 border-red-500/30',
    label: 'Explosión Carmesí',
    emoji: '💥',
  },
  battle_lightning: {
    glow: 'shadow-yellow-400/40 shadow-[0_0_30px_rgba(250,204,21,0.3)]',
    particle: 'bg-gradient-to-r from-yellow-300 via-white to-yellow-400',
    border: 'border-yellow-400/40',
    badge: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
    label: 'Trail de Rayos',
    emoji: '⚡',
  },
  battle_stardust: {
    glow: 'shadow-purple-500/40 shadow-[0_0_30px_rgba(168,85,247,0.3)]',
    particle: 'bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-500',
    border: 'border-purple-400/40',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-400/30',
    label: 'Rastro Estelar',
    emoji: '🌌',
  },
};

export function getBattleEffectStyle(code: string | null | undefined): BattleEffectStyle | null {
  if (!code) return null;
  return BATTLE_EFFECT_STYLES[code] || null;
}
