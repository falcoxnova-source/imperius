// ============================================================
// Player Rank System — Visual Only
// Ranks computed from points_total (no DB changes needed)
// ============================================================

export interface RankInfo {
  level: number;        // 1-10
  key: string;          // i18n key: 'cadet', 'pilot', etc.
  minPoints: number;    // Minimum points_total for this rank
  maxPoints: number;    // Points needed for next rank (Infinity for max)
  color: string;        // Tailwind text color class
  bgColor: string;      // Tailwind bg color class
  borderColor: string;  // Tailwind border color class
  glowColor: string;    // CSS glow color for effects
}

// Rank thresholds based on points_total
const RANK_THRESHOLDS: Omit<RankInfo, 'maxPoints'>[] = [
  { level: 1,  key: 'cadet',       minPoints: 0,         color: 'text-gray-400',    bgColor: 'bg-gray-500/20',    borderColor: 'border-gray-500/30',    glowColor: '#9ca3af' },
  { level: 2,  key: 'pilot',       minPoints: 500,       color: 'text-green-400',   bgColor: 'bg-green-500/20',   borderColor: 'border-green-500/30',   glowColor: '#4ade80' },
  { level: 3,  key: 'lieutenant',  minPoints: 2000,      color: 'text-cyan-400',    bgColor: 'bg-cyan-500/20',    borderColor: 'border-cyan-500/30',    glowColor: '#22d3ee' },
  { level: 4,  key: 'captain',     minPoints: 8000,      color: 'text-blue-400',    bgColor: 'bg-blue-500/20',    borderColor: 'border-blue-500/30',    glowColor: '#60a5fa' },
  { level: 5,  key: 'commander',   minPoints: 25000,     color: 'text-violet-400',  bgColor: 'bg-violet-500/20',  borderColor: 'border-violet-500/30',  glowColor: '#a78bfa' },
  { level: 6,  key: 'colonel',     minPoints: 75000,     color: 'text-purple-400',  bgColor: 'bg-purple-500/20',  borderColor: 'border-purple-500/30',  glowColor: '#c084fc' },
  { level: 7,  key: 'general',     minPoints: 200000,    color: 'text-orange-400',  bgColor: 'bg-orange-500/20',  borderColor: 'border-orange-500/30',  glowColor: '#fb923c' },
  { level: 8,  key: 'admiral',     minPoints: 500000,    color: 'text-amber-400',   bgColor: 'bg-amber-500/20',   borderColor: 'border-amber-500/30',   glowColor: '#fbbf24' },
  { level: 9,  key: 'marshal',     minPoints: 1200000,   color: 'text-red-400',     bgColor: 'bg-red-500/20',     borderColor: 'border-red-500/30',     glowColor: '#f87171' },
  { level: 10, key: 'warlord',     minPoints: 3000000,   color: 'text-yellow-300',  bgColor: 'bg-yellow-500/20',  borderColor: 'border-yellow-400/40',  glowColor: '#fde047' },
];

/**
 * Get rank info for a given points_total value
 */
export function getUserRank(pointsTotal: number): RankInfo {
  let rank = RANK_THRESHOLDS[0];
  
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (pointsTotal >= RANK_THRESHOLDS[i].minPoints) {
      rank = RANK_THRESHOLDS[i];
      break;
    }
  }

  const nextRank = RANK_THRESHOLDS.find(r => r.level === rank.level + 1);
  
  return {
    ...rank,
    maxPoints: nextRank ? nextRank.minPoints : Infinity,
  };
}

/**
 * Get progress percentage towards next rank (0-100)
 */
export function getRankProgress(pointsTotal: number): number {
  const rank = getUserRank(pointsTotal);
  
  if (rank.maxPoints === Infinity) return 100; // Max rank
  
  const pointsInRank = pointsTotal - rank.minPoints;
  const pointsNeeded = rank.maxPoints - rank.minPoints;
  
  return Math.min(100, Math.floor((pointsInRank / pointsNeeded) * 100));
}

/**
 * Get all rank definitions (for displaying rank ladder)
 */
export function getAllRanks(): RankInfo[] {
  return RANK_THRESHOLDS.map((rank, i) => ({
    ...rank,
    maxPoints: RANK_THRESHOLDS[i + 1]?.minPoints ?? Infinity,
  }));
}

/**
 * Format points with K/M suffix
 */
export function formatRankPoints(points: number): string {
  if (points >= 1_000_000) return (points / 1_000_000).toFixed(1) + 'M';
  if (points >= 1_000) return (points / 1_000).toFixed(0) + 'K';
  return points.toString();
}
