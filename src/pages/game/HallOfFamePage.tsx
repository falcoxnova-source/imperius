import { useState, useEffect } from 'react';
import { Trophy, Medal, Users, Crown, Swords, Rocket, Building2, Microscope, Compass, ChevronDown, Star, Award, Shield, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatNumber } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';

interface GameRound {
  id: string;
  round_number: number;
  name: string;
  started_at: string;
  ended_at: string;
  total_players: number;
  total_alliances: number;
  notes?: string;
}

interface HofPlayer {
  id: string;
  round_id: string;
  rank: number;
  category: string;
  username: string;
  alliance_tag?: string;
  points: number;
  extra_stats?: Record<string, number>;
}

interface HofAlliance {
  id: string;
  round_id: string;
  rank: number;
  alliance_name: string;
  alliance_tag: string;
  founder_username?: string;
  member_count: number;
  total_points: number;
}

interface HofRecord {
  id: string;
  round_id: string;
  record_type: string;
  username: string;
  value: number;
  description?: string;
}

type PlayerCategory = 'general' | 'fleet' | 'research' | 'buildings' | 'battles' | 'expeditions';

const categoryConfig: Record<PlayerCategory, {
  icon: React.ReactNode;
  color: string;
  bgGradient: string;
  titleKey: 'categoryEmperor' | 'categoryAdmiral' | 'categoryScientist' | 'categoryArchitect' | 'categoryWarlord' | 'categoryExplorer';
  rankKey: 'rankGeneral' | 'rankFleet' | 'rankResearch' | 'rankBuildings' | 'rankBattles' | 'rankExpeditions';
}> = {
  general: {
    icon: <Trophy className="w-10 h-10" />,
    color: 'text-yellow-400',
    bgGradient: 'from-yellow-500/20 via-yellow-600/10 to-transparent',
    titleKey: 'categoryEmperor',
    rankKey: 'rankGeneral',
  },
  fleet: {
    icon: <Rocket className="w-10 h-10" />,
    color: 'text-green-400',
    bgGradient: 'from-green-500/20 via-green-600/10 to-transparent',
    titleKey: 'categoryAdmiral',
    rankKey: 'rankFleet',
  },
  research: {
    icon: <Microscope className="w-10 h-10" />,
    color: 'text-cyan-400',
    bgGradient: 'from-cyan-500/20 via-cyan-600/10 to-transparent',
    titleKey: 'categoryScientist',
    rankKey: 'rankResearch',
  },
  buildings: {
    icon: <Building2 className="w-10 h-10" />,
    color: 'text-amber-400',
    bgGradient: 'from-amber-500/20 via-amber-600/10 to-transparent',
    titleKey: 'categoryArchitect',
    rankKey: 'rankBuildings',
  },
  battles: {
    icon: <Swords className="w-10 h-10" />,
    color: 'text-red-400',
    bgGradient: 'from-red-500/20 via-red-600/10 to-transparent',
    titleKey: 'categoryWarlord',
    rankKey: 'rankBattles',
  },
  expeditions: {
    icon: <Compass className="w-10 h-10" />,
    color: 'text-teal-400',
    bgGradient: 'from-teal-500/20 via-teal-600/10 to-transparent',
    titleKey: 'categoryExplorer',
    rankKey: 'rankExpeditions',
  },
};

const recordTypeLabels: Record<string, { key: 'recordMostVictories' | 'recordMostShipsDestroyed' | 'recordMostDebris' | 'recordLargestFleet' | 'recordMostExpeditions' | 'recordMostColonies'; icon: React.ReactNode }> = {
  most_battles_won: { key: 'recordMostVictories', icon: <Swords className="w-5 h-5 text-green-400" /> },
  most_ships_destroyed: { key: 'recordMostShipsDestroyed', icon: <Rocket className="w-5 h-5 text-red-400" /> },
  most_debris_collected: { key: 'recordMostDebris', icon: <Star className="w-5 h-5 text-cyan-400" /> },
  largest_fleet: { key: 'recordLargestFleet', icon: <Rocket className="w-5 h-5 text-yellow-400" /> },
  most_expeditions: { key: 'recordMostExpeditions', icon: <Compass className="w-5 h-5 text-teal-400" /> },
  most_colonies: { key: 'recordMostColonies', icon: <Building2 className="w-5 h-5 text-amber-400" /> },
};

function ChampionCard({
  category,
  champion,
  t,
}: {
  category: PlayerCategory;
  champion: HofPlayer | null;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const config = categoryConfig[category];

  return (
    <div className={`relative overflow-hidden rounded-xl border border-space-600 bg-gradient-to-br ${config.bgGradient} bg-space-800/80`}>
      <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
        <div className={`${config.color} scale-[3] translate-x-8 -translate-y-4`}>
          {config.icon}
        </div>
      </div>

      <div className="relative p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-3 rounded-lg bg-space-900/50 ${config.color}`}>
            {config.icon}
          </div>
          <div>
            <h3 className="font-orbitron text-lg text-white">
              {t.hallOfFame[config.titleKey]}
            </h3>
            <p className="text-sm text-gray-400">
              {t.hallOfFame[config.rankKey]}
            </p>
          </div>
        </div>

        {champion ? (
          <div className="mt-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/20">
                  <Crown className="w-8 h-8 text-space-900" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-space-900 font-bold text-sm border-2 border-space-800">
                  1
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-orbitron text-xl text-white truncate">
                    {champion.username}
                  </span>
                </div>
                {champion.alliance_tag && (
                  <span className="text-cyan-400 text-sm">[{champion.alliance_tag}]</span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-space-600/50">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">{t.hallOfFame.points}</span>
                <span className="font-orbitron text-2xl text-yellow-400">
                  {formatNumber(champion.points)}
                </span>
              </div>
            </div>

            {champion.extra_stats && category === 'battles' && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-space-900/50 rounded px-2 py-1">
                  <span className="text-gray-500">{t.hallOfFame.total}</span>
                  <span className="ml-1 text-gray-300">{formatNumber(champion.extra_stats.battles_total || 0)}</span>
                </div>
                <div className="bg-space-900/50 rounded px-2 py-1">
                  <span className="text-gray-500">{t.hallOfFame.destroyed}:</span>
                  <span className="ml-1 text-red-400">{formatNumber(champion.extra_stats.units_destroyed || 0)}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 text-center py-6">
            <Medal className="w-12 h-12 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">
              {t.hallOfFame.noChampion}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function HallOfFamePage() {
  const { t, language } = useI18n();
  const [rounds, setRounds] = useState<GameRound[]>([]);
  const [selectedRound, setSelectedRound] = useState<GameRound | null>(null);
  const [players, setPlayers] = useState<HofPlayer[]>([]);
  const [alliances, setAlliances] = useState<HofAlliance[]>([]);
  const [records, setRecords] = useState<HofRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRoundSelector, setShowRoundSelector] = useState(false);

  useEffect(() => {
    loadRounds();
  }, []);

  useEffect(() => {
    if (selectedRound) {
      loadHallOfFameData(selectedRound.id);
    }
  }, [selectedRound]);

  const loadRounds = async () => {
    try {
      const { data, error } = await supabase
        .from('game_rounds')
        .select('*')
        .order('round_number', { ascending: false });

      if (error) throw error;

      setRounds(data || []);
      if (data && data.length > 0) {
        setSelectedRound(data[0]);
      }
    } catch (error) {
      console.error('Error loading rounds:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHallOfFameData = async (roundId: string) => {
    setLoading(true);
    try {
      const [playersResult, alliancesResult, recordsResult] = await Promise.all([
        supabase.from('hall_of_fame_players').select('*').eq('round_id', roundId).eq('rank', 1),
        supabase.from('hall_of_fame_alliances').select('*').eq('round_id', roundId).eq('rank', 1),
        supabase.from('hall_of_fame_records').select('*').eq('round_id', roundId),
      ]);

      setPlayers(playersResult.data || []);
      setAlliances(alliancesResult.data || []);
      setRecords(recordsResult.data || []);
    } catch (error) {
      console.error('Error loading hall of fame data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChampionForCategory = (category: PlayerCategory): HofPlayer | null => {
    return players.find(p => p.category === category && p.rank === 1) || null;
  };

  const topAlliance = alliances.find(a => a.rank === 1);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading && rounds.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Award className="w-8 h-8 text-yellow-400" />
          <h1 className="font-orbitron text-2xl text-white">
            {t.hallOfFame.title}
          </h1>
        </div>
        <div className="card-glass p-12 text-center">
          <Trophy className="w-20 h-20 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl text-gray-400 mb-2">
            {t.hallOfFame.noRoundsYet}
          </h2>
          <p className="text-gray-500 max-w-md mx-auto">
            {t.hallOfFame.firstRoundMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-500/20">
            <Award className="w-8 h-8 text-yellow-400" />
          </div>
          <div>
            <h1 className="font-orbitron text-2xl text-white">
              {t.hallOfFame.title}
            </h1>
            <p className="text-sm text-gray-400">
              {t.hallOfFame.legendsOfUniverse}
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowRoundSelector(!showRoundSelector)}
            className="flex items-center gap-2 px-4 py-2 bg-space-700 rounded-lg border border-space-600 hover:border-yellow-500/50 transition-colors"
          >
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="text-white font-semibold">{selectedRound?.name}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showRoundSelector ? 'rotate-180' : ''}`} />
          </button>

          {showRoundSelector && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-space-800 border border-space-600 rounded-lg shadow-xl z-50 overflow-hidden">
              {rounds.map((round) => (
                <button
                  key={round.id}
                  onClick={() => {
                    setSelectedRound(round);
                    setShowRoundSelector(false);
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-space-700 transition-colors ${
                    selectedRound?.id === round.id ? 'bg-yellow-500/10 border-l-2 border-yellow-500' : ''
                  }`}
                >
                  <p className="text-white font-semibold">{round.name}</p>
                  <p className="text-xs text-gray-400">{formatDate(round.ended_at)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedRound && (
        <div className="card-glass p-4 border-l-4 border-yellow-500">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-gray-400">{t.hallOfFame.roundEnded}:</span>
              <span className="ml-2 text-white font-semibold">{formatDate(selectedRound.ended_at)}</span>
            </div>
            <div>
              <span className="text-gray-400">{t.hallOfFame.totalPlayers}:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{selectedRound.total_players}</span>
            </div>
            <div>
              <span className="text-gray-400">{t.hallOfFame.totalAlliances}:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{selectedRound.total_alliances}</span>
            </div>
          </div>
          {selectedRound.notes && (
            <p className="mt-2 text-gray-400 text-sm italic">{selectedRound.notes}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="text-center mb-6">
            <h2 className="font-orbitron text-xl text-yellow-400 flex items-center justify-center gap-2">
              <Crown className="w-6 h-6" />
              {t.hallOfFame.roundChampions}
              <Crown className="w-6 h-6" />
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Object.keys(categoryConfig) as PlayerCategory[]).map((cat) => (
              <ChampionCard
                key={cat}
                category={cat}
                champion={getChampionForCategory(cat)}
                t={t}
              />
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mt-8">
            <div className="card-glass overflow-hidden">
              <div className="p-4 border-b border-space-600 bg-gradient-to-r from-cyan-500/10 to-transparent">
                <h2 className="font-orbitron text-lg text-white flex items-center gap-2">
                  <Shield className="w-6 h-6 text-cyan-400" />
                  {t.hallOfFame.dominantAlliance}
                </h2>
              </div>

              {topAlliance ? (
                <div className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                      <Users className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-400 font-bold text-lg">[{topAlliance.alliance_tag}]</span>
                        <span className="text-white font-orbitron text-xl">{topAlliance.alliance_name}</span>
                      </div>
                      {topAlliance.founder_username && (
                        <p className="text-sm text-gray-400">
                          {t.hallOfFame.founder}: <span className="text-gray-300">{topAlliance.founder_username}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="bg-space-900/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-orbitron text-cyan-400">{topAlliance.member_count}</p>
                      <p className="text-xs text-gray-500">{t.hallOfFame.members}</p>
                    </div>
                    <div className="bg-space-900/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-orbitron text-yellow-400">{formatNumber(topAlliance.total_points)}</p>
                      <p className="text-xs text-gray-500">{t.hallOfFame.totalPoints}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Users className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500">
                    {t.hallOfFame.noAlliances}
                  </p>
                </div>
              )}
            </div>

            <div className="card-glass overflow-hidden">
              <div className="p-4 border-b border-space-600 bg-gradient-to-r from-yellow-500/10 to-transparent">
                <h2 className="font-orbitron text-lg text-white flex items-center gap-2">
                  <Star className="w-6 h-6 text-yellow-400" />
                  {t.hallOfFame.specialRecords}
                </h2>
              </div>

              <div className="divide-y divide-space-700">
                {records.map((record) => {
                  const config = recordTypeLabels[record.record_type];
                  return (
                    <div key={record.id} className="p-4 hover:bg-space-700/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-space-900/50">
                            {config?.icon || <Star className="w-5 h-5 text-gray-400" />}
                          </div>
                          <div>
                            <p className="text-sm text-gray-400">
                              {config ? t.hallOfFame[config.key] : record.record_type}
                            </p>
                            <p className="text-white font-semibold">{record.username}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-orbitron text-xl text-yellow-400">{formatNumber(record.value)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {records.length === 0 && (
                  <div className="p-8 text-center">
                    <Star className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500">
                      {t.hallOfFame.noRecords}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <WarHallOfFameSection />
        </>
      )}
    </div>
  );
}

function WarHallOfFameSection() {
  const { t, lang } = useI18n();
  const [hof, setHof] = useState<Array<{
    rank: number;
    alliance_name: string;
    alliance_tag: string;
    total_wins: number;
    total_wars: number;
    total_fxu_won: number;
    last_win_at: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc('get_war_hall_of_fame').then(({ data }) => {
      if (data) setHof(data as any[]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card-glass p-6 mt-6">
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (hof.length === 0) return null;

  return (
    <div className="card-glass overflow-hidden mt-6">
      <div className="p-4 border-b border-space-600 bg-gradient-to-r from-red-500/10 to-transparent">
        <h2 className="font-orbitron text-lg text-white flex items-center gap-2">
          <Swords className="w-6 h-6 text-red-400" />
          {lang === 'es' ? 'Salón de la Fama — Guerras de Alianzas' : 'Hall of Fame — Alliance Wars'}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-400 border-b border-space-700">
              <th className="pb-3 pl-4 w-16">#</th>
              <th className="pb-3">{lang === 'es' ? 'Alianza' : 'Alliance'}</th>
              <th className="pb-3 text-center">{lang === 'es' ? 'Victorias' : 'Wins'}</th>
              <th className="pb-3 text-center">{lang === 'es' ? 'Guerras' : 'Wars'}</th>
              <th className="pb-3 text-right">{lang === 'es' ? 'TUNG Ganado' : 'TUNG Won'}</th>
              <th className="pb-3 text-right pr-4 hidden sm:table-cell">{lang === 'es' ? 'Última Victoria' : 'Last Win'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-space-700">
            {hof.slice(0, 10).map(entry => (
              <tr key={entry.alliance_tag} className="hover:bg-space-700/30 transition-colors">
                <td className="py-3 pl-4">
                  <span className={`font-orbitron text-lg ${
                    entry.rank === 1 ? 'text-yellow-400' :
                    entry.rank === 2 ? 'text-gray-300' :
                    entry.rank === 3 ? 'text-amber-600' : 'text-gray-500'
                  }`}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                  </span>
                </td>
                <td className="py-3">
                  <span className="font-semibold text-cyber-blue">[{entry.alliance_tag}]</span>
                  <span className="text-white ml-2">{entry.alliance_name}</span>
                </td>
                <td className="py-3 text-center font-orbitron text-green-400">{entry.total_wins}</td>
                <td className="py-3 text-center text-gray-400">{entry.total_wars}</td>
                <td className="py-3 text-right font-orbitron text-yellow-400">{formatNumber(entry.total_fxu_won)} TUNG</td>
                <td className="py-3 text-right text-xs text-gray-500 pr-4 hidden sm:table-cell">
                  {entry.last_win_at ? new Date(entry.last_win_at).toLocaleDateString() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
