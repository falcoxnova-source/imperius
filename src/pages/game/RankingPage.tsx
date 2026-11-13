import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Medal, User, Building2, Microscope, Rocket, Shield, X, Globe, Users, Swords, Target, Skull, Calendar, ExternalLink, Compass, Mail, Search, Flame, DollarSign, Crown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatNumber, formatRelativeDate } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { resolveAvatarUrl } from '../../lib/avatar';
import { RankBadge } from '../../components/ui/RankBadge';
import type { Profile, Planet } from '../../types/game';

type RankingCategory = 'total' | 'buildings' | 'research' | 'fleet' | 'defense' | 'expedition' | 'destruction' | 'average';

interface AllianceWar {
  id: string;
  title: string;
  status: string;
  scores: { alliance_id: string; alliance_tag: string; alliance_name: string; total_score: number }[];
}

interface AlliancePact {
  alliance_id: string;
  alliance_tag: string;
  target_alliance_id: string;
  target_alliance_tag: string;
  diplomacy_type: string;
}

interface PlayerWithAlliance extends Profile {
  alliance_tag?: string;
  alliance_name?: string;
  alliance_id?: string;
}

interface PlayerCardData extends PlayerWithAlliance {
  main_planet?: Planet;
}

interface CategoryConfig {
  labelKey: string;
  icon: React.ReactNode;
  field: keyof Profile;
}

const categoryConfigBase: Record<RankingCategory, CategoryConfig> = {
  total: { labelKey: 'generalRanking', icon: <Trophy className="w-5 h-5" />, field: 'points_total' },
  buildings: { labelKey: 'buildingsRanking', icon: <Building2 className="w-5 h-5" />, field: 'points_buildings' },
  research: { labelKey: 'researchRanking', icon: <Microscope className="w-5 h-5" />, field: 'points_research' },
  fleet: { labelKey: 'fleetRanking', icon: <Rocket className="w-5 h-5" />, field: 'points_fleet' },
  defense: { labelKey: 'defenseRanking', icon: <Shield className="w-5 h-5" />, field: 'points_defense' },
  expedition: { labelKey: 'expeditionRanking', icon: <Compass className="w-5 h-5" />, field: 'points_expedition' as keyof Profile },
  destruction: { labelKey: 'destructionRanking', icon: <Flame className="w-5 h-5" />, field: 'units_destroyed' as keyof Profile },
  average: { labelKey: 'averageRanking', icon: <Swords className="w-5 h-5" />, field: 'battles_won' as keyof Profile },
};

interface AveragePlayerData extends PlayerWithAlliance {
  average: number;
  totalBattles: number;
  winRate: number;
  killRatio: number;
}

interface DestructionPlayerData extends PlayerWithAlliance {
  destructionPoints: number;
  attackerPoints: number;
  defenderPoints: number;
  battlesAsAttacker: number;
  battlesAsDefender: number;
}

function PlayerCardModal({ player, onClose, onNavigateToGalaxy }: { player: PlayerCardData; onClose: () => void; onNavigateToGalaxy: (galaxy: number, system: number) => void }) {
  const { t } = useI18n();
  const totalBattles = (player.battles_won || 0) + (player.battles_draw || 0) + (player.battles_lost || 0);
  const winRate = totalBattles > 0 ? ((player.battles_won || 0) / totalBattles * 100).toFixed(2) : '0.00';
  const drawRate = totalBattles > 0 ? ((player.battles_draw || 0) / totalBattles * 100).toFixed(2) : '0.00';
  const lossRate = totalBattles > 0 ? ((player.battles_lost || 0) / totalBattles * 100).toFixed(2) : '0.00';

  const mainPlanetCoords = player.main_planet
    ? `[${player.main_planet.galaxy}:${player.main_planet.solar_system}:${player.main_planet.position}]`
    : '-';

  const handleCoordsClick = () => {
    if (player.main_planet) {
      onClose();
      onNavigateToGalaxy(player.main_planet.galaxy, player.main_planet.solar_system);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-space-800 border border-space-600 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header with Avatar */}
        <div className="flex items-center justify-between p-4 border-b border-space-600 bg-space-700">
          <div className="flex items-center gap-3">
            {/* Player Avatar */}
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-cyber-blue/30 bg-space-600 flex items-center justify-center flex-shrink-0">
              {resolveAvatarUrl(player.avatar_url) ? (
                <img
                  src={resolveAvatarUrl(player.avatar_url)!}
                  alt={player.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-gray-400" />
              )}
            </div>
            <h2 className="font-orbitron text-xl text-white">{player.username}</h2>
            <RankBadge pointsTotal={player.points_total || 0} variant="compact" />
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-space-600 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Player Info Section */}
          <div className="bg-space-700/50 rounded-lg p-4">
            <h3 className="font-orbitron text-cyber-blue mb-3 text-sm">{t.ranking.playerCard}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-400">{t.ranking.user}:</span>
                <span className="text-white font-semibold">
                  {player.active_title && <span className="text-cyber-yellow">{player.active_title} · </span>}{player.username}
                </span>
                {player.active_badge && (
                  <span className="text-lg" title="Insignia equipada">{player.active_badge}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-400">{t.ranking.planet}:</span>
                {player.main_planet ? (
                  <button
                    onClick={handleCoordsClick}
                    className="text-cyber-blue hover:text-cyber-blue/80 hover:underline flex items-center gap-1 transition-colors"
                  >
                    {mainPlanetCoords}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-400">{t.galaxy.alliance}:</span>
                <span className="text-cyber-blue">
                  {player.alliance_tag ? `[${player.alliance_tag}] ${player.alliance_name}` : '-'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-400">{t.ranking.registeredOn}:</span>
                <span className="text-gray-300">{player.created_at ? formatRelativeDate(player.created_at) : '-'}</span>
              </div>
            </div>
          </div>

          <div className="bg-space-700/50 rounded-lg p-4">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="font-semibold text-gray-400"></div>
              <div className="font-semibold text-gray-400 text-center">{t.common.points}</div>
              <div className="font-semibold text-gray-400 text-center">{t.common.rank}</div>

              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyber-yellow" />
                <span className="text-gray-300">{t.ranking.buildings}</span>
              </div>
              <div className="text-center text-white font-mono">{formatNumber(player.points_buildings || 0)}</div>
              <div className="text-center text-cyber-yellow font-mono">{player.rank_buildings || '-'}</div>

              <div className="flex items-center gap-2">
                <Microscope className="w-4 h-4 text-cyber-blue" />
                <span className="text-gray-300">{t.ranking.technology}</span>
              </div>
              <div className="text-center text-white font-mono">{formatNumber(player.points_research || 0)}</div>
              <div className="text-center text-cyber-yellow font-mono">{player.rank_research || '-'}</div>

              <div className="flex items-center gap-2">
                <Rocket className="w-4 h-4 text-green-400" />
                <span className="text-gray-300">{t.ranking.fleets}</span>
              </div>
              <div className="text-center text-white font-mono">{formatNumber(player.points_fleet || 0)}</div>
              <div className="text-center text-cyber-yellow font-mono">{player.rank_fleet || '-'}</div>

              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-400" />
                <span className="text-gray-300">{t.ranking.defenses}</span>
              </div>
              <div className="text-center text-white font-mono">{formatNumber(player.points_defense || 0)}</div>
              <div className="text-center text-cyber-yellow font-mono">{player.rank_defense || '-'}</div>

              <div className="flex items-center gap-2 border-t border-space-600 pt-2 mt-2">
                <Trophy className="w-4 h-4 text-cyber-yellow" />
                <span className="text-white font-semibold">{t.common.total}</span>
              </div>
              <div className="text-center text-cyber-yellow font-mono font-bold border-t border-space-600 pt-2 mt-2">
                {formatNumber(player.points_total || 0)}
              </div>
              <div className="text-center text-cyber-yellow font-mono font-bold border-t border-space-600 pt-2 mt-2">
                {player.rank_position || '-'}
              </div>
            </div>
          </div>

          <div className="bg-space-700/50 rounded-lg p-4">
            <h3 className="font-orbitron text-cyber-blue mb-3 text-sm flex items-center gap-2">
              <Swords className="w-4 h-4" />
              {t.ranking.battleStats}
            </h3>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="font-semibold text-gray-400"></div>
              <div className="font-semibold text-gray-400 text-center">{t.ranking.battles}</div>
              <div className="font-semibold text-gray-400 text-center">{t.ranking.percentage}</div>

              <div className="text-green-400">{t.ranking.battlesWon}</div>
              <div className="text-center text-white font-mono">{formatNumber(player.battles_won || 0)}</div>
              <div className="text-center text-green-400 font-mono">{winRate} %</div>

              <div className="text-yellow-400">{t.ranking.battlesDraw}</div>
              <div className="text-center text-white font-mono">{formatNumber(player.battles_draw || 0)}</div>
              <div className="text-center text-yellow-400 font-mono">{drawRate} %</div>

              <div className="text-red-400">{t.ranking.battlesLost}</div>
              <div className="text-center text-white font-mono">{formatNumber(player.battles_lost || 0)}</div>
              <div className="text-center text-red-400 font-mono">{lossRate} %</div>

              <div className="text-white font-semibold border-t border-space-600 pt-2 mt-2">{t.ranking.totalBattles}</div>
              <div className="text-center text-white font-mono font-bold border-t border-space-600 pt-2 mt-2">
                {formatNumber(totalBattles)}
              </div>
              <div className="text-center text-white font-mono border-t border-space-600 pt-2 mt-2">100%</div>
            </div>
          </div>

          <div className="bg-space-700/50 rounded-lg p-4">
            <h3 className="font-orbitron text-cyber-blue mb-3 text-sm flex items-center gap-2">
              <Skull className="w-4 h-4" />
              {player.username} {t.ranking.destructions}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400 flex items-center gap-2">
                  <Target className="w-4 h-4 text-green-400" />
                  {t.ranking.unitsDestroyed}
                </span>
                <span className="text-green-400 font-mono">{formatNumber(player.units_destroyed || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 flex items-center gap-2">
                  <Skull className="w-4 h-4 text-red-400" />
                  {t.ranking.unitsLost}
                </span>
                <span className="text-red-400 font-mono">{formatNumber(player.units_lost || 0)}</span>
              </div>
              <div className="flex justify-between border-t border-space-600 pt-2 mt-2">
                <span className="text-gray-400">{t.ranking.totalMetalDebris}</span>
                <span className="text-gray-300 font-mono">{formatNumber(player.debris_metal_total || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t.ranking.totalCrystalDebris}</span>
                <span className="text-cyan-400 font-mono">{formatNumber(player.debris_crystal_total || 0)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-space-600 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyber-blue hover:bg-cyber-blue/80 text-white rounded-lg font-semibold transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

const PLAYERS_PER_PAGE = 100;

const rankFieldForCategory: Record<RankingCategory, keyof Profile> = {
  total: 'rank_position',
  buildings: 'rank_buildings',
  research: 'rank_research',
  fleet: 'rank_fleet',
  defense: 'rank_defense',
  expedition: 'rank_expedition',
  destruction: 'rank_position',
  average: 'rank_position',
};

function getPageForRank(rank: number): number {
  if (!rank || rank <= 0) return 1;
  return Math.ceil(rank / PLAYERS_PER_PAGE);
}

export function RankingPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { profile: currentProfile } = useAuthStore();
  const [category, setCategory] = useState<RankingCategory>('total');
  const [players, setPlayers] = useState<PlayerWithAlliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [myTitle, setMyTitle] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerCardData | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [allianceWars, setAllianceWars] = useState<AllianceWar[]>([]);
  const [alliancePacts, setAlliancePacts] = useState<AlliancePact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<string | null>(null);
  const [averageData, setAverageData] = useState<AveragePlayerData[]>([]);
  const [destructionData, setDestructionData] = useState<DestructionPlayerData[]>([]);
  const [vipUserIds, setVipUserIds] = useState<Set<string>>(new Set());
  const loadIdRef = useRef(0);
  // Guarda para que el salto automatico a la pagina del jugador solo ocurra
  // una vez por categoria y no se reinicie cada vez que se refresca el perfil
  const autoJumpedCategoryRef = useRef<RankingCategory | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const handleNavigateToGalaxy = (galaxy: number, system: number) => {
    navigate(`/game/galaxy?galaxy=${galaxy}&system=${system}`);
  };

  // Load active VIP Plus subscribers
  useEffect(() => {
    const loadVipUsers = async () => {
      try {
        const { data } = await supabase
          .from('plus_subscriptions')
          .select('user_id')
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString());
        if (data) {
          setVipUserIds(new Set(data.map(d => d.user_id)));
        }
      } catch (e) {
        console.error('Error loading VIP users:', e);
      }
    };
    loadVipUsers();
  }, []);

  useEffect(() => {
    const alreadyJumped = autoJumpedCategoryRef.current === category;

    if (category === 'average' || category === 'destruction') {
      if (!alreadyJumped) {
        autoJumpedCategoryRef.current = category;
        setCurrentPage(1);
      }
      return;
    }

    if (!alreadyJumped) {
      setAverageData([]);
      setDestructionData([]);
    }

    // Ya saltamos para esta categoria (o aun no hay perfil): no tocar la pagina,
    // asi el buscador y la paginacion manual no se pierden al refrescarse el perfil
    if (alreadyJumped || !currentProfile) return;

    autoJumpedCategoryRef.current = category;
    const rankField = rankFieldForCategory[category];
    const userRank = (currentProfile[rankField] as number) || 0;
    setCurrentPage(getPageForRank(userRank));
  }, [category, currentProfile]);

  useEffect(() => {
    loadRanking();
  }, [category, currentPage]);

  useEffect(() => {
    loadAllianceWars();
    loadAlliancePacts();
  }, []);

  // Centrar en pantalla la fila del jugador buscado (o la del propio jugador)
  useEffect(() => {
    if (loading) return;
    const targetId = highlightedPlayerId || currentProfile?.id;
    if (!targetId) return;
    const timer = setTimeout(() => {
      const el = rowRefs.current[targetId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => clearTimeout(timer);
  }, [loading, players, averageData, destructionData, currentPage, highlightedPlayerId, currentProfile?.id]);

  // Load my equipped title
  useEffect(() => {
    if (currentProfile?.active_title) {
      setMyTitle(currentProfile.active_title);
    } else if (currentProfile?.id) {
      // Fallback: query directly in case PostgREST cache is stale
      supabase.from('profiles').select('active_title').eq('id', currentProfile.id).maybeSingle().then(({ data }) => {
        if (data?.active_title) setMyTitle(data.active_title);
      }).catch(() => {});
    }
  }, [currentProfile?.id, currentProfile?.active_title]);

  const loadAllianceWars = async () => {
    try {
      const { data, error } = await supabase.rpc('get_alliance_wars', { p_filter: 'active' });
      if (error) throw error;
      setAllianceWars(data || []);
    } catch (error) {
      console.error('Error loading alliance wars:', error);
    }
  };

  const loadAlliancePacts = async () => {
    try {
      const { data, error } = await supabase.rpc('get_active_alliance_pacts');
      if (error) throw error;
      setAlliancePacts(data || []);
    } catch (error) {
      console.error('Error loading alliance pacts:', error);
    }
  };

  // Pactos activos (nap/trade) de una alianza, en ambos sentidos, sin duplicar tag.
  const getAlliancePacts = (allianceId: string): { tag: string; type: string }[] => {
    const seen = new Map<string, string>();
    for (const p of alliancePacts) {
      if (p.alliance_id === allianceId && !seen.has(p.target_alliance_tag)) {
        seen.set(p.target_alliance_tag, p.diplomacy_type);
      } else if (p.target_alliance_id === allianceId && !seen.has(p.alliance_tag)) {
        seen.set(p.alliance_tag, p.diplomacy_type);
      }
    }
    return Array.from(seen.entries()).map(([tag, type]) => ({ tag, type }));
  };

  const getWarEnemies = (allianceId: string): string[] => {
    const enemies: string[] = [];
    for (const war of allianceWars) {
      const myAlliance = war.scores?.find(s => s.alliance_id === allianceId);
      if (myAlliance) {
        for (const s of war.scores || []) {
          if (s.alliance_id !== allianceId) enemies.push(s.alliance_tag);
        }
      }
    }
    return enemies;
  };

  const loadAverageRanking = async () => {
    if (averageData.length > 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: profilesData, error } = await supabase
        .from('profiles')
        .select('*')
        .not('is_hidden', 'is', true)
        .not('is_admin', 'is', true)
        .or('battles_won.gt.0,battles_draw.gt.0,battles_lost.gt.0')
        .order('battles_won', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const { data: membersData } = await supabase
        .from('alliance_members')
        .select('user_id, alliance_id, alliance:alliances(tag, name)');

      const allianceMap = new Map<string, { tag: string; name: string; id: string }>();
      if (membersData) {
        for (const member of membersData) {
          if (member.alliance) {
            const alliance = member.alliance as { tag: string; name: string };
            allianceMap.set(member.user_id, { tag: alliance.tag, name: alliance.name, id: member.alliance_id });
          }
        }
      }

      const playersWithAverage: AveragePlayerData[] = (profilesData || []).map((profile) => {
        const totalBattles = (profile.battles_won || 0) + (profile.battles_draw || 0) + (profile.battles_lost || 0);
        const winRate = totalBattles > 0
          ? ((profile.battles_won || 0) + 0.5 * (profile.battles_draw || 0)) / totalBattles * 100
          : 0;
        const destroyed = Number(profile.units_destroyed || 0);
        const lost = Number(profile.units_lost || 0);
        const totalUnits = destroyed + lost;
        const killRatio = totalUnits > 0 ? (destroyed / totalUnits) * 100 : 0;
        const average = totalBattles > 0 ? (winRate * 0.5) + (killRatio * 0.5) : 0;
        const alliance = allianceMap.get(profile.id);
        return {
          ...profile,
          alliance_tag: alliance?.tag,
          alliance_name: alliance?.name,
          alliance_id: alliance?.id,
          average,
          totalBattles,
          winRate,
          killRatio,
        };
      });

      playersWithAverage.sort((a, b) => {
        if (b.average !== a.average) return b.average - a.average;
        return b.totalBattles - a.totalBattles;
      });

      setAverageData(playersWithAverage);
      setTotalPlayers(playersWithAverage.length);
    } catch (error) {
      console.error('Error loading average ranking:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDestructionRanking = async () => {
    if (destructionData.length > 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_destruction_ranking');
      if (error) throw error;

      // Transform the data to match our interface
      const playersWithDestruction: DestructionPlayerData[] = (data || []).map((row: {
        user_id: string;
        username: string;
        avatar_url: string | null;
        alliance_tag: string | null;
        alliance_name: string | null;
        alliance_id: string | null;
        destruction_points: number;
        attacker_points: number;
        defender_points: number;
        battles_as_attacker: number;
        battles_as_defender: number;
      }) => ({
        id: row.user_id,
        username: row.username,
        avatar_url: row.avatar_url,
        alliance_tag: row.alliance_tag,
        alliance_name: row.alliance_name,
        alliance_id: row.alliance_id,
        destructionPoints: Number(row.destruction_points) || 0,
        attackerPoints: Number(row.attacker_points) || 0,
        defenderPoints: Number(row.defender_points) || 0,
        battlesAsAttacker: row.battles_as_attacker || 0,
        battlesAsDefender: row.battles_as_defender || 0,
      } as DestructionPlayerData));

      setDestructionData(playersWithDestruction);
      setTotalPlayers(playersWithDestruction.length);
    } catch (error) {
      console.error('Error loading destruction ranking:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRanking = async () => {
    if (category === 'average') {
      await loadAverageRanking();
      return;
    }
    if (category === 'destruction') {
      await loadDestructionRanking();
      return;
    }
    const thisLoadId = ++loadIdRef.current;
    setLoading(true);
    try {
      const field = categoryConfigBase[category].field;

      const { count, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .not('is_hidden', 'is', true)
        .not('is_admin', 'is', true);

      if (countError) throw countError;
      if (thisLoadId !== loadIdRef.current) return; // stale request
      setTotalPlayers(count || 0);

      const from = (currentPage - 1) * PLAYERS_PER_PAGE;
      const to = from + PLAYERS_PER_PAGE - 1;

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*, active_title, active_title_icon, active_badge, active_planet_effect, active_hero_skin')
        .not('is_hidden', 'is', true)
        .not('is_admin', 'is', true)
        .order(field, { ascending: false, nullsFirst: false })
        // [RANKCRON1] mismo desempate que update_all_rankings(), asi la posicion
        // de la lista coincide exactamente con el rango guardado en el perfil.
        .order('created_at', { ascending: true })
        .range(from, to);

      if (profilesError) throw profilesError;
      if (thisLoadId !== loadIdRef.current) return; // stale request

      const { data: membersData } = await supabase
        .from('alliance_members')
        .select('user_id, alliance_id, alliance:alliances(tag, name)');

      if (thisLoadId !== loadIdRef.current) return; // stale request

      const allianceMap = new Map<string, { tag: string; name: string; id: string }>();
      if (membersData) {
        for (const member of membersData) {
          if (member.alliance) {
            const alliance = member.alliance as { tag: string; name: string };
            allianceMap.set(member.user_id, { tag: alliance.tag, name: alliance.name, id: member.alliance_id });
          }
        }
      }

      const playersWithAlliance: PlayerWithAlliance[] = (profilesData || []).map((profile) => {
        const alliance = allianceMap.get(profile.id);
        return {
          ...profile,
          alliance_tag: alliance?.tag,
          alliance_name: alliance?.name,
          alliance_id: alliance?.id,
        };
      });

      setPlayers(playersWithAlliance);
    } catch (error) {
      console.error('Error loading ranking:', error);
    } finally {
      if (thisLoadId === loadIdRef.current) {
        setLoading(false);
      }
    }
  };

  const totalPages = Math.ceil(totalPlayers / PLAYERS_PER_PAGE);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearchError('');
    setSearching(true);
    setHighlightedPlayerId(null);
    try {
      const rankField = rankFieldForCategory[category] as string;
      const pointsField = categoryConfigBase[category].field as string;

      const baseQuery = () =>
        supabase
          .from('profiles')
          .select('*')
          .not('is_hidden', 'is', true)
          .not('is_admin', 'is', true);

      // 1) Nombre exacto
      let { data: rows, error } = await baseQuery().ilike('username', query).limit(1);
      if (error) throw error;

      // 2) Coincidencia parcial (el mejor puntuado de los que coinciden)
      if (!rows || rows.length === 0) {
        const partial = await baseQuery()
          .ilike('username', `%${query}%`)
          .order(pointsField, { ascending: false, nullsFirst: false })
          .limit(1);
        if (partial.error) throw partial.error;
        rows = partial.data;
      }

      const found = rows && rows[0];
      if (!found) {
        setSearchError(t.ranking.playerNotFound);
        return;
      }

      setHighlightedPlayerId(found.id);

      // Estos dos rankings se calculan en el cliente sobre la lista ya cargada
      if (category === 'average' || category === 'destruction') {
        const list: { id: string }[] = category === 'average' ? averageData : destructionData;
        const idx = list.findIndex(p => p.id === found.id);
        if (idx < 0) {
          setSearchError(t.ranking.playerNotFound);
          return;
        }
        setCurrentPage(Math.floor(idx / PLAYERS_PER_PAGE) + 1);
        return;
      }

      // Posicion: usa la columna de ranking y si no esta disponible la calcula
      // contando cuantos jugadores tienen mas puntos en esa categoria
      let position = Number((found as Record<string, unknown>)[rankField]) || 0;
      if (!position) {
        const points = Number((found as Record<string, unknown>)[pointsField]) || 0;
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .not('is_hidden', 'is', true)
          .not('is_admin', 'is', true)
          .gt(pointsField, points);
        position = (count || 0) + 1;
      }

      setCurrentPage(getPageForRank(position));
    } catch (err) {
      console.error('Search error:', err);
      setSearchError(t.ranking.playerNotFound);
    } finally {
      setSearching(false);
    }
  };

  const handlePlayerClick = async (player: PlayerWithAlliance) => {
    setLoadingPlayer(true);
    try {
      const [profileResult, planetResult, allianceResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', player.id)
          .maybeSingle(),
        supabase
          .from('planets')
          .select('*')
          .eq('user_id', player.id)
          .eq('is_main_planet', true)
          .maybeSingle(),
        supabase
          .from('alliance_members')
          .select('alliance:alliances(tag, name)')
          .eq('user_id', player.id)
          .maybeSingle()
      ]);

      const freshProfile = profileResult.data || player;
      const alliance = allianceResult.data?.alliance as { tag: string; name: string } | null;

      setSelectedPlayer({
        ...freshProfile,
        alliance_tag: alliance?.tag || player.alliance_tag,
        alliance_name: alliance?.name || player.alliance_name,
        main_planet: planetResult.data || undefined,
      });
    } catch (error) {
      console.error('Error loading player data:', error);
      setSelectedPlayer(player);
    } finally {
      setLoadingPlayer(false);
    }
  };

  const getPointsForCategory = (player: Profile): number => {
    const field = categoryConfigBase[category].field;
    return (player[field] as number) || 0;
  };

  const getCategoryLabel = (cat: RankingCategory): string => {
    if (cat === 'average') return 'Promedio';
    return t.ranking[categoryConfigBase[cat].labelKey as keyof typeof t.ranking] as string;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <Trophy className="w-8 h-8 text-cyber-yellow" />
          {t.ranking.title}
        </h1>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {(Object.keys(categoryConfigBase) as RankingCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300 whitespace-nowrap ${
              cat === 'average'
                ? category === cat
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/40 scale-105'
                  : 'bg-gradient-to-r from-purple-900/50 to-pink-900/50 text-purple-300 hover:from-purple-700/50 hover:to-pink-700/50 border border-purple-500/30 hover:shadow-md hover:shadow-purple-500/20'
                : cat === 'destruction'
                  ? category === cat
                    ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-lg shadow-orange-500/40 scale-105'
                    : 'bg-gradient-to-r from-orange-900/50 to-red-900/50 text-orange-300 hover:from-orange-700/50 hover:to-red-700/50 border border-orange-500/30 hover:shadow-md hover:shadow-orange-500/20'
                  : category === cat
                    ? 'bg-cyber-yellow text-space-900'
                    : 'bg-space-700 text-gray-400 hover:bg-space-600'
            }`}
          >
            {cat === 'average' ? <span className="text-lg">⚔️</span> : cat === 'destruction' ? <span className="text-lg">🔥</span> : categoryConfigBase[cat].icon}
            {getCategoryLabel(cat)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder={t.ranking.searchPlaceholder}
            className="w-full pl-10 pr-4 py-2 bg-space-700 border border-space-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyber-blue/50 text-sm"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-4 py-2 bg-cyber-blue hover:bg-cyber-blue/80 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors text-sm flex items-center gap-2"
        >
          {searching ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </button>
        {searchError && (
          <span className="text-red-400 text-sm">{searchError}</span>
        )}
      </div>

      <div className="card-glass overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-cyber-yellow/30 border-t-cyber-yellow rounded-full animate-spin" />
          </div>
        ) : category === 'average' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-purple-900/60 via-space-700/50 to-pink-900/60">
                  <th className="px-4 py-3 text-left text-sm font-bold text-purple-300 w-16">#</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-purple-300">Jugador</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-green-400">✅ V</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-yellow-400">🤝 E</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-red-400">💀 D</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-cyan-400" title="Unidades destruidas">💥 Dest.</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-orange-400" title="Unidades perdidas">🩸 Perd.</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-blue-400" title="Win Rate">🏆 WR</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-pink-400" title="Kill Ratio">🎯 KR</th>
                  <th className="px-4 py-3 text-right text-sm font-bold text-purple-300 w-52">⚔️ Promedio</th>
                </tr>
              </thead>
              <tbody>
                {averageData.slice((currentPage - 1) * PLAYERS_PER_PAGE, currentPage * PLAYERS_PER_PAGE).map((player, index) => {
                  const rank = (currentPage - 1) * PLAYERS_PER_PAGE + index + 1;
                  const isCurrentUser = player.id === currentProfile?.id;
                  const isHighlighted = player.id === highlightedPlayerId;
                  const avgColor = player.average >= 70 ? 'from-green-500 to-emerald-400' : player.average >= 40 ? 'from-yellow-500 to-amber-400' : 'from-red-500 to-rose-400';
                  const avgTextColor = player.average >= 70 ? 'text-green-400' : player.average >= 40 ? 'text-yellow-400' : 'text-red-400';
                  const rankEmoji = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank <= 10 ? '🔥' : '';
                  const glowClass = rank === 1 ? 'shadow-yellow-500/30' : rank === 2 ? 'shadow-gray-300/20' : rank === 3 ? 'shadow-amber-500/20' : '';

                  return (
                    <tr
                      key={player.id}
                      ref={(el) => { rowRefs.current[player.id] = el; }}
                      onClick={() => handlePlayerClick(player)}
                      className={`group border-t border-purple-900/30 cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:-translate-y-[1px] relative ${
                        rank <= 3 ? `hover:shadow-lg ${glowClass}` : 'hover:shadow-md hover:shadow-purple-500/10'
                      } ${
                        isHighlighted
                          ? 'bg-purple-500/20 hover:bg-purple-500/30'
                          : isCurrentUser
                            ? 'bg-cyber-blue/10 hover:bg-cyber-blue/20'
                            : rank === 1 ? 'bg-gradient-to-r from-yellow-900/20 via-transparent to-yellow-900/10 hover:from-yellow-900/30'
                            : rank === 2 ? 'bg-gradient-to-r from-gray-500/10 via-transparent to-gray-500/5 hover:from-gray-500/20'
                            : rank === 3 ? 'bg-gradient-to-r from-amber-900/15 via-transparent to-amber-900/10 hover:from-amber-900/25'
                            : 'hover:bg-purple-900/20'
                      }`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          {rankEmoji && <span className={`text-base ${rank <= 3 ? 'animate-bounce' : ''}`} style={rank <= 3 ? { animationDuration: '2s' } : {}}>{rankEmoji}</span>}
                          <span className={`font-orbitron text-sm ${rank <= 3 ? 'text-purple-200 font-bold' : 'text-gray-500'}`}>{rank}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:ring-2 group-hover:ring-purple-400/50 group-hover:shadow-lg group-hover:shadow-purple-500/20 ${
                            isCurrentUser ? 'border-2 border-cyber-blue bg-cyber-blue/20' : rank <= 3 ? 'border-2 border-purple-400/50 bg-purple-900/30' : 'border border-space-500 bg-space-600'
                          }`}>
                            {resolveAvatarUrl(player.avatar_url) ? (
                              <img src={resolveAvatarUrl(player.avatar_url)!} alt={player.username} className="w-full h-full object-cover" />
                            ) : (
                              <User className={`w-5 h-5 ${isCurrentUser ? 'text-cyber-blue' : rank <= 3 ? 'text-purple-300' : 'text-gray-400'}`} />
                            )}
                          </div>
                          <div>
                            <p className={`font-semibold transition-colors duration-300 group-hover:text-purple-300 ${isCurrentUser ? 'text-cyber-blue' : rank <= 3 ? 'text-white' : 'text-gray-200'} flex items-center gap-1.5`}>
                              {isCurrentUser ? (
                                <>{currentProfile?.active_title && <span className="text-cyber-yellow">{currentProfile.active_title}</span>}{currentProfile?.active_title && <span className="text-gray-500 mx-1">·</span>}{player.username}{currentProfile?.active_badge && <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-red-900/40 to-red-800/20 ring-2 ring-red-500/50 shadow-lg shadow-red-500/30 animate-pulse text-sm ml-1" style={{ animationDuration: '2s' }} title="Insignia equipada">{currentProfile.active_badge}</span>}</>
                              ) : (
                                <>{(player as any).active_title && <span className="text-cyber-yellow">{(player as any).active_title}</span>}{(player as any).active_title && <span className="text-gray-500 mx-1">·</span>}{player.username}</>
                              )}
                              {vipUserIds.has(player.id) && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/40 shadow-sm shadow-amber-500/20" title="VIP Plus">
                                  <Crown className="w-3 h-3 text-amber-400" />
                                  <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider">VIP</span>
                                </span>
                              )}
                              {isCurrentUser && <span className="ml-1 text-xs text-cyber-blue">({t.common.you})</span>}
                            </p>
                            {player.alliance_tag && (
                              <p className="text-xs text-purple-400/50">[{player.alliance_tag}]</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono text-green-400 font-bold text-sm">{player.battles_won || 0}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono text-yellow-400 font-bold text-sm">{player.battles_draw || 0}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono text-red-400 font-bold text-sm">{player.battles_lost || 0}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono text-cyan-400 text-sm" title={formatNumber(Number(player.units_destroyed || 0))}>{formatNumber(Number(player.units_destroyed || 0))}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono text-orange-400 text-sm" title={formatNumber(Number(player.units_lost || 0))}>{formatNumber(Number(player.units_lost || 0))}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-mono text-sm font-semibold ${player.winRate >= 60 ? 'text-blue-400' : player.winRate >= 40 ? 'text-blue-300/60' : 'text-blue-300/40'}`}>{player.winRate.toFixed(1)}%</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-mono text-sm font-semibold ${player.killRatio >= 60 ? 'text-pink-400' : player.killRatio >= 40 ? 'text-pink-300/60' : 'text-pink-300/40'}`}>{player.killRatio.toFixed(1)}%</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3 justify-end">
                          <div className="w-24 h-3 bg-space-900/80 rounded-full overflow-hidden border border-purple-900/30">
                            <div
                              className={`h-full bg-gradient-to-r ${avgColor} rounded-full transition-all duration-1000 ease-out relative overflow-hidden`}
                              style={{ width: `${Math.max(player.average, 2)}%` }}
                            >
                              <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                            </div>
                          </div>
                          <span className={`font-orbitron text-sm font-bold min-w-[52px] text-right transition-all duration-300 group-hover:scale-110 ${avgTextColor}`}>
                            {player.average.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {averageData.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-gray-500">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">🏟️</span>
                        <p className="font-orbitron text-sm">Aún no hay batallas registradas</p>
                        <p className="text-xs text-gray-600">¡Lanza tu primer ejército para entrar en el ranking!</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : category === 'destruction' ? (
          <div className="overflow-x-auto">
            {/* Header con descripción */}
            <div className="bg-gradient-to-r from-orange-900/30 via-red-900/20 to-orange-900/30 px-4 py-3 border-b border-orange-500/20">
              <p className="text-orange-300/80 text-sm flex items-center gap-2">
                <Flame className="w-4 h-4" />
                {t.ranking.destructionDesc}
              </p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-orange-900/60 via-space-700/50 to-red-900/60">
                  <th className="px-4 py-3 text-left text-sm font-bold text-orange-300 w-16">#</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-orange-300">{t.galaxy.player}</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-orange-300">{t.galaxy.alliance}</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-red-400" title={t.ranking.asAttacker}>⚔️ {t.ranking.asAttacker}</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-blue-400" title={t.ranking.asDefender}>🛡️ {t.ranking.asDefender}</th>
                  <th className="px-4 py-3 text-right text-sm font-bold text-orange-300 w-44">🔥 {t.ranking.totalDestructionPoints}</th>
                </tr>
              </thead>
              <tbody>
                {destructionData.slice((currentPage - 1) * PLAYERS_PER_PAGE, currentPage * PLAYERS_PER_PAGE).map((player, index) => {
                  const rank = (currentPage - 1) * PLAYERS_PER_PAGE + index + 1;
                  const isCurrentUser = player.id === currentProfile?.id;
                  const isHighlighted = player.id === highlightedPlayerId;
                  const rankEmoji = rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank <= 10 ? '🔥' : '';
                  const glowClass = rank === 1 ? 'shadow-orange-500/40' : rank === 2 ? 'shadow-gray-300/20' : rank === 3 ? 'shadow-amber-500/20' : '';

                  return (
                    <tr
                      key={player.id}
                      ref={(el) => { rowRefs.current[player.id] = el; }}
                      onClick={() => handlePlayerClick(player)}
                      className={`group border-t border-orange-900/30 cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:-translate-y-[1px] relative ${
                        rank <= 3 ? `hover:shadow-lg ${glowClass}` : 'hover:shadow-md hover:shadow-orange-500/10'
                      } ${
                        isHighlighted
                          ? 'bg-orange-500/20 hover:bg-orange-500/30'
                          : isCurrentUser
                            ? 'bg-cyber-blue/10 hover:bg-cyber-blue/20'
                            : rank === 1 ? 'bg-gradient-to-r from-orange-900/30 via-transparent to-red-900/20 hover:from-orange-900/40'
                            : rank === 2 ? 'bg-gradient-to-r from-gray-500/10 via-transparent to-gray-500/5 hover:from-gray-500/20'
                            : rank === 3 ? 'bg-gradient-to-r from-amber-900/15 via-transparent to-amber-900/10 hover:from-amber-900/25'
                            : 'hover:bg-orange-900/20'
                      }`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          {rankEmoji && <span className={`text-base ${rank <= 3 ? 'animate-pulse' : ''}`}>{rankEmoji}</span>}
                          <span className={`font-orbitron text-sm ${rank <= 3 ? 'text-orange-200 font-bold' : 'text-gray-500'}`}>{rank}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:ring-2 group-hover:ring-orange-400/50 group-hover:shadow-lg group-hover:shadow-orange-500/20 ${
                            isCurrentUser ? 'border-2 border-cyber-blue bg-cyber-blue/20' : rank <= 3 ? 'border-2 border-orange-400/50 bg-orange-900/30' : 'border border-space-500 bg-space-600'
                          }`}>
                            {resolveAvatarUrl(player.avatar_url) ? (
                              <img src={resolveAvatarUrl(player.avatar_url)!} alt={player.username} className="w-full h-full object-cover" />
                            ) : (
                              <User className={`w-5 h-5 ${isCurrentUser ? 'text-cyber-blue' : rank <= 3 ? 'text-orange-300' : 'text-gray-400'}`} />
                            )}
                          </div>
                          <div>
                            <p className={`font-semibold transition-colors duration-300 group-hover:text-orange-300 ${isCurrentUser ? 'text-cyber-blue' : rank <= 3 ? 'text-white' : 'text-gray-200'} flex items-center gap-1.5`}>
                              {isCurrentUser && currentProfile?.active_title && (
                                <span className="text-cyber-yellow">{currentProfile.active_title} · </span>
                              )}
                              {player.username}
                              {isCurrentUser && currentProfile?.active_badge && (
                                <span className="text-lg ml-1">{currentProfile.active_badge}</span>
                              )}
                              {vipUserIds.has(player.id) && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/40 shadow-sm shadow-amber-500/20" title="VIP Plus">
                                  <Crown className="w-3 h-3 text-amber-400" />
                                  <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider">VIP</span>
                                </span>
                              )}
                              {isCurrentUser && <span className="ml-1 text-xs text-cyber-blue">({t.common.you})</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {player.alliance_tag && player.alliance_id ? (
                          <span className="text-orange-400 font-semibold">[{player.alliance_tag}]</span>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-red-400 font-mono font-semibold">{formatNumber(player.attackerPoints)}</span>
                          <span className="text-xs text-gray-500">({player.battlesAsAttacker} {t.ranking.battles.toLowerCase()})</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-blue-400 font-mono font-semibold">{formatNumber(player.defenderPoints)}</span>
                          <span className="text-xs text-gray-500">({player.battlesAsDefender} {t.ranking.battles.toLowerCase()})</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className={`h-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500`} style={{ width: `${Math.min(100, (player.destructionPoints / (destructionData[0]?.destructionPoints || 1)) * 100)}%`, minWidth: '4px' }} />
                          <span className="font-orbitron text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400 min-w-[80px] text-right">
                            {formatNumber(player.destructionPoints)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {destructionData.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-gray-500">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">🔥</span>
                        <p className="font-orbitron text-sm">{t.ranking.noPlayersInRanking}</p>
                        <p className="text-xs text-gray-600">¡Destruye ejércitos enemigos para entrar en el ranking!</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-space-700/50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400 w-16">
                    {t.ranking.position}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">
                    {t.galaxy.player}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">
                    {t.galaxy.alliance}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-400">
                    {t.common.points}
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-400 w-16">
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map((player, index) => {
                  const rank = (currentPage - 1) * PLAYERS_PER_PAGE + index + 1;
                  const isCurrentUser = player.id === currentProfile?.id;
                  const isHighlighted = player.id === highlightedPlayerId;
                  const points = getPointsForCategory(player);

                  return (
                    <tr
                      key={player.id}
                      ref={(el) => { rowRefs.current[player.id] = el; }}
                      onClick={() => handlePlayerClick(player)}
                      className={`border-t border-space-700 transition-colors cursor-pointer ${
                        isHighlighted
                          ? 'bg-cyber-yellow/15 hover:bg-cyber-yellow/25 ring-1 ring-inset ring-cyber-yellow/50'
                          : isCurrentUser
                            ? 'bg-cyber-blue/15 hover:bg-cyber-blue/25 ring-1 ring-inset ring-cyber-blue/50'
                            : 'hover:bg-space-700/50'
                      }`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {rank === 1 && <Medal className="w-5 h-5 text-yellow-400" />}
                          {rank === 2 && <Medal className="w-5 h-5 text-gray-400" />}
                          {rank === 3 && <Medal className="w-5 h-5 text-amber-600" />}
                          <span
                            className={`font-orbitron ${
                              rank <= 3 ? 'text-cyber-yellow' : 'text-gray-400'
                            }`}
                          >
                            {rank}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {/* Player Avatar */}
                          <div
                            className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${
                              isCurrentUser
                                ? 'border-2 border-cyber-blue bg-cyber-blue/20'
                                : 'border border-space-500 bg-space-600'
                            }`}
                          >
                            {resolveAvatarUrl(player.avatar_url) ? (
                              <img
                                src={resolveAvatarUrl(player.avatar_url)!}
                                alt={player.username}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className={`w-5 h-5 ${isCurrentUser ? 'text-cyber-blue' : 'text-gray-400'}`} />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p
                                className={`font-semibold flex items-center gap-1.5 ${
                                  isCurrentUser ? 'text-cyber-blue' : 'text-white'
                                }`}
                              >
                                {isCurrentUser && currentProfile?.active_title && (
                                  <span className="text-cyber-yellow">{currentProfile.active_title} · </span>
                                )}
                                {player.username}
                                {isCurrentUser && currentProfile?.active_badge && (
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-red-900/40 to-red-800/20 ring-2 ring-red-500/50 shadow-lg shadow-red-500/30 animate-pulse text-sm ml-1" style={{ animationDuration: '2s' }} title="Insignia equipada">{currentProfile.active_badge}</span>
                                )}
                                {vipUserIds.has(player.id) && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/40 shadow-sm shadow-amber-500/20" title="VIP Plus">
                                    <Crown className="w-3 h-3 text-amber-400" />
                                    <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider">VIP</span>
                                  </span>
                                )}
                                {isCurrentUser && (
                                  <span className="ml-1 text-xs text-cyber-blue">({t.common.you})</span>
                                )}
                              </p>
                              <RankBadge pointsTotal={player.points_total || 0} variant="compact" />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {player.alliance_tag && player.alliance_id ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-cyber-blue font-semibold">[{player.alliance_tag}]</span>
                            {getWarEnemies(player.alliance_id).length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                {getWarEnemies(player.alliance_id).map(tag => (
                                  <span
                                    key={`war-${tag}`}
                                    title={`En guerra con [${tag}]`}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-red-600/30 to-orange-500/20 border border-red-500/50 text-red-300 shadow-sm shadow-red-500/40 animate-pulse"
                                    style={{ animationDuration: '1.8s' }}
                                  >
                                    <span>⚔️</span>[{tag}]
                                  </span>
                                ))}
                              </div>
                            )}
                            {getAlliancePacts(player.alliance_id).length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                {getAlliancePacts(player.alliance_id).map(p => (
                                  <span
                                    key={`pact-${p.tag}`}
                                    title={p.type === 'trade' ? `Pacto comercial con [${p.tag}]` : `Pacto de no agresion con [${p.tag}]`}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border shadow-sm ${
                                      p.type === 'trade'
                                        ? 'bg-gradient-to-r from-cyan-500/25 to-blue-500/15 border-cyan-400/50 text-cyan-300 shadow-cyan-500/30'
                                        : 'bg-gradient-to-r from-emerald-500/25 to-green-500/15 border-emerald-400/50 text-emerald-300 shadow-emerald-500/30'
                                    }`}
                                  >
                                    <span>{p.type === 'trade' ? '💰' : '🤝'}</span>[{p.tag}]
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="font-orbitron text-cyber-yellow">
                          {formatNumber(points)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {!isCurrentUser && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/game/messages?to=${encodeURIComponent(player.username)}`);
                            }}
                            className="p-2 rounded-lg bg-space-600 hover:bg-cyber-blue/30 text-gray-400 hover:text-cyber-blue transition-colors"
                            title={t.messages.sendMessage}
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {players.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400">
                      {t.ranking.noPlayersInRanking}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-space-700">
            <div className="text-sm text-gray-400">
              {t.ranking.showingPlayers || 'Mostrando'} {(currentPage - 1) * PLAYERS_PER_PAGE + 1} - {Math.min(currentPage * PLAYERS_PER_PAGE, totalPlayers)} {t.ranking.of || 'de'} {totalPlayers}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded bg-space-700 text-gray-400 hover:bg-space-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {'<<'}
              </button>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded bg-space-700 text-gray-400 hover:bg-space-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {'<'}
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-3 py-1.5 rounded transition-colors ${
                        currentPage === pageNum
                          ? 'bg-cyber-yellow text-space-900 font-semibold'
                          : 'bg-space-700 text-gray-400 hover:bg-space-600'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded bg-space-700 text-gray-400 hover:bg-space-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {'>'}
              </button>
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded bg-space-700 text-gray-400 hover:bg-space-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {'>>'}
              </button>
            </div>
          </div>
        )}
      </div>

      {currentProfile && (
        <div className="card-glass p-4">
          <h3 className="font-orbitron text-lg text-white mb-4">{t.ranking.yourPosition}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {(Object.keys(categoryConfigBase) as RankingCategory[]).map((cat) => {
              let displayValue: string;
              if (cat === 'average') {
                const total = (currentProfile.battles_won || 0) + (currentProfile.battles_draw || 0) + (currentProfile.battles_lost || 0);
                const wr = total > 0 ? (((currentProfile.battles_won || 0) + 0.5 * (currentProfile.battles_draw || 0)) / total * 100) : 0;
                const dest = Number(currentProfile.units_destroyed || 0);
                const lost = Number(currentProfile.units_lost || 0);
                const kr = (dest + lost) > 0 ? (dest / (dest + lost)) * 100 : 0;
                const avg = total > 0 ? (wr * 0.5) + (kr * 0.5) : 0;
                displayValue = avg.toFixed(1) + '%';
              } else if (cat === 'destruction') {
                // Find user's destruction points
                const userDestruction = destructionData.find(d => d.id === currentProfile.id);
                displayValue = userDestruction ? formatNumber(userDestruction.destructionPoints) : '0';
              } else {
                displayValue = formatNumber((currentProfile[categoryConfigBase[cat].field] as number) || 0);
              }
              return (
                <div
                  key={cat}
                  className={`p-4 rounded-lg text-center transition-all duration-300 hover:scale-105 cursor-pointer ${
                    cat === 'average'
                      ? category === cat
                        ? 'bg-gradient-to-br from-purple-600/30 to-pink-600/30 border border-purple-500/30 shadow-lg shadow-purple-500/10'
                        : 'bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-500/10 hover:border-purple-500/30'
                      : cat === 'destruction'
                        ? category === cat
                          ? 'bg-gradient-to-br from-orange-600/30 to-red-600/30 border border-orange-500/30 shadow-lg shadow-orange-500/10'
                          : 'bg-gradient-to-br from-orange-900/20 to-red-900/20 border border-orange-500/10 hover:border-orange-500/30'
                        : category === cat ? 'bg-cyber-yellow/20' : 'bg-space-700/50'
                  }`}
                  onClick={() => setCategory(cat)}
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {cat === 'average' ? <span className="text-base">⚔️</span> : cat === 'destruction' ? <span className="text-base">🔥</span> : categoryConfigBase[cat].icon}
                    <span className={`text-sm ${cat === 'average' ? 'text-purple-300' : cat === 'destruction' ? 'text-orange-300' : 'text-gray-400'}`}>{getCategoryLabel(cat)}</span>
                  </div>
                  <p className={`font-orbitron text-xl ${cat === 'average' ? 'text-purple-300' : cat === 'destruction' ? 'text-orange-300' : 'text-white'}`}>{displayValue}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loadingPlayer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-12 h-12 border-4 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
        </div>
      )}

      {selectedPlayer && (
        <PlayerCardModal
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          onNavigateToGalaxy={handleNavigateToGalaxy}
        />
      )}
    </div>
  );
}
