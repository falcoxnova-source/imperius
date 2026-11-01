import { Shield, Star, Swords, Crown, Award, Medal, Rocket, Crosshair, Zap, Flame } from 'lucide-react';
import { getUserRank, getRankProgress, formatRankPoints, type RankInfo } from '../../lib/ranks';
import { useI18n } from '../../lib/i18n';

// Map rank keys to icons
const RANK_ICONS: Record<string, typeof Shield> = {
  cadet: Shield,
  pilot: Rocket,
  lieutenant: Crosshair,
  captain: Star,
  commander: Swords,
  colonel: Medal,
  general: Award,
  admiral: Zap,
  marshal: Crown,
  warlord: Flame,
};

interface RankBadgeProps {
  pointsTotal: number;
  /** 'compact' = just icon+name, 'full' = with progress bar */
  variant?: 'compact' | 'full' | 'mini';
  className?: string;
}

export function RankBadge({ pointsTotal, variant = 'compact', className = '' }: RankBadgeProps) {
  const rank = getUserRank(pointsTotal);
  const progress = getRankProgress(pointsTotal);
  const { t } = useI18n();
  const Icon = RANK_ICONS[rank.key] || Shield;
  const rankName = t.ranks[rank.key as keyof typeof t.ranks] || rank.key;

  if (variant === 'mini') {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`} title={`${rankName} (Nv.${rank.level})`}>
        <Icon className={`w-3 h-3 ${rank.color}`} />
        <span className={`text-[10px] font-bold ${rank.color}`}>{rank.level}</span>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${rank.bgColor} ${rank.borderColor} border ${className}`}>
        <Icon className={`w-3 h-3 ${rank.color}`} />
        <span className={`text-[10px] font-orbitron font-bold ${rank.color}`}>{rankName}</span>
      </div>
    );
  }

  // Full variant with progress bar
  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div 
            className={`p-1.5 rounded-lg ${rank.bgColor} ${rank.borderColor} border`}
            style={{ boxShadow: `0 0 8px ${rank.glowColor}33` }}
          >
            <Icon className={`w-4 h-4 ${rank.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`font-orbitron text-xs font-bold ${rank.color}`}>
                {rankName}
              </span>
              <span className="text-[10px] text-gray-500">Nv.{rank.level}</span>
            </div>
          </div>
        </div>
        {rank.maxPoints !== Infinity && (
          <span className="text-[10px] text-gray-500">
            {formatRankPoints(pointsTotal)} / {formatRankPoints(rank.maxPoints)}
          </span>
        )}
        {rank.maxPoints === Infinity && (
          <span className={`text-[10px] font-bold ${rank.color}`}>MAX</span>
        )}
      </div>
      
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-space-700 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ 
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${rank.glowColor}88, ${rank.glowColor})`,
            boxShadow: `0 0 6px ${rank.glowColor}66`,
          }}
        />
      </div>

      {rank.maxPoints !== Infinity && (
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-gray-600">
            {t.ranks.nextRank}: {t.ranks[getNextRankKey(rank) as keyof typeof t.ranks]}
          </span>
          <span className="text-[9px] text-gray-500">{progress}%</span>
        </div>
      )}
    </div>
  );
}

function getNextRankKey(rank: RankInfo): string {
  const keys = ['cadet', 'pilot', 'lieutenant', 'captain', 'commander', 'colonel', 'general', 'admiral', 'marshal', 'warlord'];
  const idx = keys.indexOf(rank.key);
  return idx < keys.length - 1 ? keys[idx + 1] : rank.key;
}
