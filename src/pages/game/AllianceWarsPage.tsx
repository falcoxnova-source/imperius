import { useState, useEffect, useCallback } from 'react';
import { Swords, Trophy, Clock, Coins, Users, ArrowUp, CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp, Medal, Crown, Target, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../lib/i18n';
import { formatNumber } from '../../lib/utils';

interface WarEntry {
  alliance_id: string;
  alliance_name: string;
  alliance_tag: string;
  paid_fee: number;
  leader_id: string;
}

interface WarScore {
  alliance_id: string;
  alliance_name: string;
  alliance_tag: string;
  total_score: number;
  battle_count: number;
}

interface War {
  id: string;
  title: string;
  war_type: string;
  entry_fee_fxu: number;
  total_pool_fxu: number;
  status: string;
  start_time: string | null;
  end_time: string | null;
  winner_alliance_id: string | null;
  entry_count: number;
  scores: WarScore[] | null;
  created_at: string;
  resolved_at: string | null;
}

interface HallOfFameEntry {
  rank: number;
  alliance_name: string;
  alliance_tag: string;
  total_wins: number;
  total_wars: number;
  total_fxu_won: number;
  last_win_at: string | null;
}

type TabKey = 'open' | 'active' | 'history' | 'hof';

export function AllianceWarsPage() {
  const { t } = useI18n();
  const { profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [wars, setWars] = useState<War[]>([]);
  const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userAlliance, setUserAlliance] = useState<{ id: string; tag: string; name: string; rank_level: number } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [reportModal, setReportModal] = useState<War | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportForm, setReportForm] = useState({ enemy_alliance_id: '', resources: '' });
  const [expandedWar, setExpandedWar] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [warsRes, hofRes] = await Promise.all([
        supabase.rpc('get_alliance_wars', { p_filter: 'all' }),
        supabase.rpc('get_war_hall_of_fame'),
      ]);
      if (warsRes.data) setWars(warsRes.data as War[]);
      if (hofRes.data) setHallOfFame(hofRes.data as HallOfFameEntry[]);
    } catch (e) {
      console.error('Error loading wars:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('alliance_members')
      .select('alliance_id, rank_level, alliance:alliances(id, tag, name)')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.alliance) {
          const a = data.alliance as any;
          setUserAlliance({ id: a.id, tag: a.tag, name: a.name, rank_level: data.rank_level });
        }
      });
  }, [profile]);

  const handleJoin = async (warId: string) => {
    setJoining(warId);
    setMessage(null);
    const { data, error } = await supabase.rpc('join_alliance_war', { p_war_id: warId });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data && !data.success) {
      setMessage({ type: 'error', text: data.error || 'Error' });
    } else {
      setMessage({ type: 'success', text: t.allianceWars.joinWarSuccess });
      loadData();
    }
    setJoining(null);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleReport = async () => {
    if (!reportModal) return;
    setReporting(true);
    setMessage(null);
    const resources = parseInt(reportForm.resources);
    if (!resources || resources < 1) {
      setMessage({ type: 'error', text: t.allianceWars.insufficientResources });
      setReporting(false);
      return;
    }
    const { data, error } = await supabase.rpc('report_war_battle', {
      p_war_id: reportModal.id,
      p_enemy_alliance_id: reportForm.enemy_alliance_id,
      p_resources_destroyed: resources,
    });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (data && !data.success) {
      setMessage({ type: 'error', text: data.error || 'Error' });
    } else {
      setMessage({ type: 'success', text: t.allianceWars.reportBattleSuccess.replace('{points}', data?.points || '0') });
      setReportModal(null);
      setReportForm({ enemy_alliance_id: '', resources: '' });
      loadData();
    }
    setReporting(false);
    setTimeout(() => setMessage(null), 5000);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return t.allianceWars.statusOpen;
      case 'active': return t.allianceWars.statusActive;
      case 'completed': return t.allianceWars.statusCompleted;
      case 'cancelled': return t.allianceWars.statusCancelled;
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'completed': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'cancelled': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getWarTypeLabel = (type: string) => {
    switch (type) {
      case 'weekly': return t.allianceWars.weekly;
      case 'monthly': return t.allianceWars.monthly;
      case 'special': return t.allianceWars.special;
      default: return type;
    }
  };

  const getUserAllianceEntry = (war: War) => {
    if (!userAlliance) return null;
    return war.scores?.find(s => s.alliance_id === userAlliance.id);
  };

  const filteredWars = wars.filter(w => {
    if (activeTab === 'open') return w.status === 'open';
    if (activeTab === 'active') return w.status === 'active';
    if (activeTab === 'history') return w.status === 'completed' || w.status === 'cancelled';
    return false;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-cyber-blue animate-spin" />
        <span className="ml-3 text-gray-400">{t.allianceWars.loading}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <Swords className="w-8 h-8 text-red-400" />
          {t.allianceWars.title}
        </h1>
        {userAlliance && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-space-700 rounded-lg border border-space-600">
            <Users className="w-4 h-4 text-cyber-blue" />
            <span className="text-sm text-white">[{userAlliance.tag}] {userAlliance.name}</span>
          </div>
        )}
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-space-700 pb-2">
        {([
          { key: 'open', label: t.allianceWars.openWars, icon: Plus },
          { key: 'active', label: t.allianceWars.activeWars, icon: Swords },
          { key: 'history', label: t.allianceWars.completedWars, icon: Clock },
          { key: 'hof', label: t.allianceWars.warHallOfFame, icon: Crown },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'bg-cyber-blue/20 text-cyber-blue border border-cyber-blue/30'
                : 'text-gray-400 hover:text-white hover:bg-space-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.key === 'open' && <span className="text-xs bg-blue-500/20 px-1.5 py-0.5 rounded">{(wars.filter(w => w.status === 'open')).length}</span>}
            {tab.key === 'active' && <span className="text-xs bg-green-500/20 px-1.5 py-0.5 rounded">{(wars.filter(w => w.status === 'active')).length}</span>}
          </button>
        ))}
      </div>

      {/* Hall of Fame Tab */}
      {activeTab === 'hof' && (
        <div className="card-glass p-6">
          {hallOfFame.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t.allianceWars.noHallOfFame}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-400 border-b border-space-700">
                    <th className="pb-3 w-16">{t.allianceWars.rank}</th>
                    <th className="pb-3">{t.galaxy.alliance}</th>
                    <th className="pb-3 text-center">{t.allianceWars.totalWins}</th>
                    <th className="pb-3 text-center">{t.allianceWars.totalWars}</th>
                    <th className="pb-3 text-right">{t.allianceWars.totalFxuWon}</th>
                    <th className="pb-3 text-right hidden sm:table-cell">{t.allianceWars.lastWin}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-space-700">
                  {hallOfFame.map(entry => (
                    <tr key={entry.alliance_tag} className="hover:bg-space-700/30">
                      <td className="py-3">
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
                      <td className="py-3 text-center font-orbitron text-white">{entry.total_wins}</td>
                      <td className="py-3 text-center text-gray-400">{entry.total_wars}</td>
                      <td className="py-3 text-right font-orbitron text-cyber-yellow">{formatNumber(entry.total_fxu_won)} TUNG</td>
                      <td className="py-3 text-right text-xs text-gray-500 hidden sm:table-cell">
                        {entry.last_win_at ? new Date(entry.last_win_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* War Lists */}
      {activeTab !== 'hof' && (
        <div className="space-y-4">
          {filteredWars.length === 0 ? (
            <div className="card-glass p-12 text-center text-gray-500">
              <Swords className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>
                {activeTab === 'open' ? t.allianceWars.noOpenWars :
                 activeTab === 'active' ? t.allianceWars.noActiveWars :
                 t.allianceWars.noCompletedWars}
              </p>
            </div>
          ) : (
            filteredWars.map(war => {
              const isExpanded = expandedWar === war.id;
              const myScore = getUserAllianceEntry(war);
              const myEntry = userAlliance && war.scores?.find(s => s.alliance_id === userAlliance.id);
              const canJoin = userAlliance && war.status === 'open' && !myEntry && userAlliance.rank_level >= 10;
              const canReport = userAlliance && war.status === 'active' && !!myEntry;

              return (
                <div key={war.id} className="card-glass p-4 border border-space-700/50 hover:border-space-600/50 transition-colors">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setExpandedWar(isExpanded ? null : war.id)}
                        className="text-gray-400 hover:text-white"
                      >
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                      <div>
                        <h3 className="font-semibold text-white">{war.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusColor(war.status)}`}>
                            {getStatusLabel(war.status)}
                          </span>
                          <span className="text-xs text-gray-500">{getWarTypeLabel(war.war_type)}</span>
                          {war.status === 'active' && war.end_time && (
                            <span className="text-xs text-amber-400">
                              <Clock className="w-3 h-3 inline mr-0.5" />
                              {new Date(war.end_time).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {canJoin && (
                        <button
                          onClick={() => handleJoin(war.id)}
                          disabled={joining === war.id}
                          className="px-4 py-2 bg-cyber-blue/20 hover:bg-cyber-blue/30 text-cyber-blue border border-cyber-blue/30 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                        >
                          {joining === war.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          {t.allianceWars.joinWar}
                        </button>
                      )}
                      {canReport && (
                        <button
                          onClick={() => {
                            setReportModal(war);
                            setReportForm({ enemy_alliance_id: '', resources: '' });
                          }}
                          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg text-sm font-semibold flex items-center gap-2"
                        >
                          <Target className="w-4 h-4" />
                          {t.allianceWars.reportBattle}
                        </button>
                      )}
                      {war.status === 'completed' && war.winner_alliance_id && (
                        <span className="text-sm text-cyber-yellow flex items-center gap-1">
                          <Crown className="w-4 h-4" />
                          {war.scores?.find(s => s.alliance_id === war.winner_alliance_id)?.alliance_tag || '?'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-sm mb-3">
                    <div className="bg-space-700/50 rounded-lg p-2 text-center">
                      <p className="text-xs text-gray-400">{t.allianceWars.entryFee}</p>
                      <p className="font-orbitron text-cyber-blue">{formatNumber(war.entry_fee_fxu)} TUNG</p>
                    </div>
                    <div className="bg-space-700/50 rounded-lg p-2 text-center">
                      <p className="text-xs text-gray-400">{t.allianceWars.totalPool}</p>
                      <p className="font-orbitron text-cyber-yellow">{formatNumber(war.total_pool_fxu)} TUNG</p>
                    </div>
                    <div className="bg-space-700/50 rounded-lg p-2 text-center">
                      <p className="text-xs text-gray-400">{t.allianceWars.enrolled}</p>
                      <p className="font-orbitron text-white">{war.entry_count}</p>
                    </div>
                    {myScore && (
                      <div className="bg-cyber-blue/10 rounded-lg p-2 text-center border border-cyber-blue/20">
                        <p className="text-xs text-gray-400">{t.allianceWars.points}</p>
                        <p className="font-orbitron text-cyber-blue">{formatNumber(myScore.total_score)}</p>
                      </div>
                    )}
                    {myScore && (
                      <div className="bg-cyber-blue/10 rounded-lg p-2 text-center border border-cyber-blue/20">
                        <p className="text-xs text-gray-400">{t.allianceWars.battles}</p>
                        <p className="font-orbitron text-white">{myScore.battle_count}</p>
                      </div>
                    )}
                  </div>

                  {/* Expanded: Scoreboard */}
                  {isExpanded && war.scores && war.scores.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-space-700">
                      <h4 className="text-sm font-semibold text-gray-400 mb-2">{t.allianceWars.scoreLive}</h4>
                      <div className="space-y-1.5">
                        {war.scores.map((s, i) => (
                          <div key={s.alliance_id} className={`flex items-center justify-between p-2 rounded ${
                            s.alliance_id === userAlliance?.id ? 'bg-cyber-blue/10 border border-cyber-blue/20' : 'bg-space-700/30'
                          }`}>
                            <div className="flex items-center gap-3">
                              <span className={`font-orbitron text-sm w-6 ${
                                i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-600'
                              }`}>#{i + 1}</span>
                              <span className="text-white text-sm">[{s.alliance_tag}] {s.alliance_name}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="font-orbitron text-cyber-blue">{formatNumber(s.total_score)} {t.allianceWars.points.toLowerCase()}</span>
                              <span className="text-gray-500 text-xs">{s.battle_count} {t.allianceWars.battles.toLowerCase()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Completed: Reward breakdown */}
                  {isExpanded && war.status === 'completed' && war.total_pool_fxu > 0 && (
                    <div className="mt-3 pt-3 border-t border-space-700">
                      <h4 className="text-sm font-semibold text-gray-400 mb-2">💰 {t.allianceWars.rewardBreakdown}</h4>
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2 text-center">
                            <p className="text-yellow-400 font-semibold">🥇 1° (40%)</p>
                            <p className="text-white font-orbitron">{formatNumber(Math.floor(war.total_pool_fxu * 0.40))} TUNG</p>
                          </div>
                          <div className="bg-gray-400/10 border border-gray-400/20 rounded p-2 text-center">
                            <p className="text-gray-300 font-semibold">🥈 2° (20%)</p>
                            <p className="text-white font-orbitron">{formatNumber(Math.floor(war.total_pool_fxu * 0.20))} TUNG</p>
                          </div>
                          <div className="bg-amber-600/10 border border-amber-600/20 rounded p-2 text-center">
                            <p className="text-amber-500 font-semibold">🥉 3° (10%)</p>
                            <p className="text-white font-orbitron">{formatNumber(Math.floor(war.total_pool_fxu * 0.10))} TUNG</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-purple-500/10 border border-purple-500/20 rounded p-2 text-center">
                            <p className="text-purple-400 font-semibold">{t.allianceWars.adminShare}</p>
                            <p className="text-white font-orbitron">{formatNumber(Math.floor(war.total_pool_fxu * 0.15))} TUNG</p>
                          </div>
                          <div className="bg-teal-500/10 border border-teal-500/20 rounded p-2 text-center">
                            <p className="text-teal-400 font-semibold">{t.allianceWars.reserveShare}</p>
                            <p className="text-white font-orbitron">{formatNumber(war.total_pool_fxu - Math.floor(war.total_pool_fxu * 0.70))} TUNG</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Report Battle Modal */}
      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setReportModal(null)}>
          <div className="bg-space-800 border border-space-600 rounded-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-orbitron text-lg text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-red-400" />
                {t.allianceWars.reportBattleTitle}
              </h3>
              <button onClick={() => setReportModal(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">{reportModal.title}</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">{t.allianceWars.selectEnemyAlliance}</label>
                <select
                  value={reportForm.enemy_alliance_id}
                  onChange={e => setReportForm(prev => ({ ...prev, enemy_alliance_id: e.target.value }))}
                  className="w-full bg-space-700 border border-space-600 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="">-- {t.allianceWars.selectEnemyAlliance} --</option>
                  {reportModal.scores?.filter(s => s.alliance_id !== userAlliance?.id).map(s => (
                    <option key={s.alliance_id} value={s.alliance_id}>[{s.alliance_tag}] {s.alliance_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">{t.allianceWars.resourcesDestroyed}</label>
                <input
                  type="number"
                  value={reportForm.resources}
                  onChange={e => setReportForm(prev => ({ ...prev, resources: e.target.value }))}
                  placeholder={t.allianceWars.resourcesDestroyedHint}
                  className="w-full bg-space-700 border border-space-600 rounded-lg px-3 py-2 text-sm text-white"
                  min="1"
                />
                <p className="text-xs text-gray-500 mt-1">{t.allianceWars.resourcesDestroyedHint}</p>
              </div>
              <button
                onClick={handleReport}
                disabled={reporting || !reportForm.enemy_alliance_id || !reportForm.resources}
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {reporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                {t.allianceWars.reportBattle}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
