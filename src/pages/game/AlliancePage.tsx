import { useState, useEffect } from 'react';
import {
  Users,
  Crown,
  Plus,
  Search,
  LogOut,
  X,
  Settings,
  UserPlus,
  UserMinus,
  Mail,
  ChevronUp,
  ChevronDown,
  Check,
  XCircle,
  Clock,
  Shield,
  Edit3,
  Send,
  AlertCircle,
  Handshake,
  Swords,
  Lock,
  Unlock,
  FileText,
  Coins,
  Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { AllianceRewardShares } from '../../components/game/AllianceRewardShares';
import { formatNumber, formatRelativeDate } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import type { Alliance, AllianceMember, Profile } from '../../types/game';

interface AllianceApplication {
  id: string;
  alliance_id: string;
  user_id: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  profile?: Profile;
}

interface AllianceDiplomacy {
  id: string;
  alliance_id: string;
  alliance_name: string;
  alliance_tag: string;
  target_alliance_id: string;
  target_alliance_name: string;
  target_alliance_tag: string;
  diplomacy_type: 'nap' | 'trade' | 'war';
  status: 'pending' | 'active' | 'rejected' | 'cancelled';
  proposed_at: string;
  accepted_at: string | null;
  expires_at: string | null;
  message: string | null;
  is_incoming: boolean;
}

export function AlliancePage() {
  const { t } = useI18n();
  const { profile, refreshProfile } = useAuthStore();
  const [userAlliance, setUserAlliance] = useState<Alliance | null>(null);
  const [userMembership, setUserMembership] = useState<AllianceMember | null>(null);
  const [members, setMembers] = useState<(AllianceMember & { profile?: Profile })[]>([]);
  const [applications, setApplications] = useState<AllianceApplication[]>([]);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showCircular, setShowCircular] = useState(false);
  const [showDiplomacy, setShowDiplomacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'diplomacy'>('info');
  const [diplomacy, setDiplomacy] = useState<AllianceDiplomacy[]>([]);

  useEffect(() => {
    if (profile) {
      loadUserAlliance();
      loadAlliances();
    }
  }, [profile]);

  const loadUserAlliance = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data: membership } = await supabase
        .from('alliance_members')
        .select('*, alliance:alliances(*)')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (membership?.alliance) {
        // max_members es una columna calculada en el servidor (tiene en cuenta el VIP Plus
        // del lider) y no viene incluida en el embed alliances(*), hay que pedirla aparte.
        const { data: allianceCap } = await supabase
          .from('alliances')
          .select('*, max_members')
          .eq('id', membership.alliance.id)
          .maybeSingle();

        setUserAlliance((allianceCap || membership.alliance) as Alliance);
        setUserMembership(membership);
        loadMembers(membership.alliance.id);
        loadDiplomacy(membership.alliance.id);
        if (membership.can_invite) {
          loadApplications(membership.alliance.id);
        }
      } else {
        setUserAlliance(null);
        setUserMembership(null);
      }
    } catch (error) {
      console.error('Error loading alliance:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (allianceId: string) => {
    try {
      const { data } = await supabase
        .from('alliance_members')
        .select('*, profile:profiles(*)')
        .eq('alliance_id', allianceId)
        .order('rank_level', { ascending: false });

      setMembers(data || []);
    } catch (error) {
      console.error('Error loading members:', error);
    }
  };

  const loadApplications = async (allianceId: string) => {
    try {
      const { data } = await supabase
        .from('alliance_applications')
        .select('*, profile:profiles!user_id(*)')
        .eq('alliance_id', allianceId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      setApplications(data || []);
    } catch (error) {
      console.error('Error loading applications:', error);
    }
  };

  const loadDiplomacy = async (allianceId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_alliance_diplomacy', {
        p_alliance_id: allianceId
      });

      if (error) throw error;
      setDiplomacy(data || []);
    } catch (error) {
      console.error('Error loading diplomacy:', error);
    }
  };

  const loadAlliances = async () => {
    try {
      const { data } = await supabase
        .from('alliances')
        .select('*, max_members')
        .order('points_total', { ascending: false })
        .limit(20);

      setAlliances(data || []);
    } catch (error) {
      console.error('Error loading alliances:', error);
    }
  };

  const handleLeaveAlliance = async () => {
    if (!profile || !userAlliance) return;
    if (!confirm(t.alliance.confirmLeave)) return;

    try {
      const { data, error } = await supabase.rpc('leave_alliance');

      if (error) {
        console.error('Error leaving alliance:', error);
        alert(error.message);
        return;
      }

      const result = data as { success: boolean; error?: string; message?: string };
      if (!result.success) {
        alert(result.error || t.common.error);
        return;
      }

      setUserAlliance(null);
      setUserMembership(null);
      setMembers([]);
      loadAlliances();
    } catch (error) {
      console.error('Error leaving alliance:', error);
    }
  };

  const handleKickMember = async (memberId: string, memberUserId: string) => {
    if (!userAlliance || memberUserId === profile?.id) return;
    if (!confirm(t.alliance.confirmKick)) return;

    try {
      const { data, error } = await supabase.rpc('kick_alliance_member', {
        p_member_id: memberId
      });

      if (error) {
        console.error('Error kicking member:', error);
        alert(error.message);
        return;
      }

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        alert(result.error || t.common.error);
        return;
      }

      setMembers(prev => prev.filter(m => m.id !== memberId));
      setUserAlliance(prev => prev ? { ...prev, member_count: prev.member_count - 1 } : null);
    } catch (error) {
      console.error('Error kicking member:', error);
    }
  };

  const handlePromoteMember = async (member: AllianceMember & { profile?: Profile }) => {
    if (!userAlliance || !userMembership) return;
    if (member.rank_level >= userMembership.rank_level) return;

    const newLevel = Math.min(member.rank_level + 1, userMembership.rank_level - 1);
    const rankNames = [t.alliance.rankNovice, t.alliance.rankMember, t.alliance.rankVeteran, t.alliance.rankOfficer, t.alliance.rankCommander, t.alliance.rankGeneral, t.alliance.rankAdmiral, t.alliance.rankVicePresident, t.alliance.rankPresident, t.alliance.rankLeader, t.alliance.rankFounder];

    try {
      await supabase
        .from('alliance_members')
        .update({
          rank_level: newLevel,
          rank_name: rankNames[newLevel] || t.alliance.rankOfficer,
          can_invite: newLevel >= 5,
          can_kick: newLevel >= 7,
          can_edit: newLevel >= 8
        })
        .eq('id', member.id);

      setMembers(prev => prev.map(m =>
        m.id === member.id
          ? { ...m, rank_level: newLevel, rank_name: rankNames[newLevel] || t.alliance.rankOfficer }
          : m
      ));
    } catch (error) {
      console.error('Error promoting member:', error);
    }
  };

  const handleDemoteMember = async (member: AllianceMember & { profile?: Profile }) => {
    if (!userAlliance || !userMembership) return;
    if (member.rank_level >= userMembership.rank_level) return;

    const newLevel = Math.max(member.rank_level - 1, 0);
    const rankNames = [t.alliance.rankNovice, t.alliance.rankMember, t.alliance.rankVeteran, t.alliance.rankOfficer, t.alliance.rankCommander, t.alliance.rankGeneral, t.alliance.rankAdmiral, t.alliance.rankVicePresident, t.alliance.rankPresident, t.alliance.rankLeader, t.alliance.rankFounder];

    try {
      await supabase
        .from('alliance_members')
        .update({
          rank_level: newLevel,
          rank_name: rankNames[newLevel] || t.alliance.rankMember,
          can_invite: newLevel >= 5,
          can_kick: newLevel >= 7,
          can_edit: newLevel >= 8
        })
        .eq('id', member.id);

      setMembers(prev => prev.map(m =>
        m.id === member.id
          ? { ...m, rank_level: newLevel, rank_name: rankNames[newLevel] || t.alliance.rankMember }
          : m
      ));
    } catch (error) {
      console.error('Error demoting member:', error);
    }
  };

  const handleAcceptApplication = async (application: AllianceApplication) => {
    if (!userAlliance) return;

    try {
      const { data, error: rpcError } = await supabase.rpc('accept_alliance_application', {
        p_application_id: application.id
      });

      if (rpcError) {
        console.error('Error accepting application:', rpcError);
        alert(rpcError.message || t.alliance.errorAcceptingApplication);
        return;
      }

      const result = data as { success: boolean; error?: string; message?: string };
      if (!result.success) {
        alert(result.error || t.alliance.errorAcceptingApplication);
        return;
      }

      await supabase.rpc('secure_send_message', {
        p_recipient_id: application.user_id,
        p_subject: `${t.alliance.applicationAccepted} - ${userAlliance.name}`,
        p_body: `${t.alliance.applicationAcceptedMessage} ${userAlliance.name} [${userAlliance.tag}]. ${t.alliance.welcome}`,
        p_message_type: 'alliance',
      });

      setApplications(prev => prev.filter(a => a.id !== application.id));
      setUserAlliance(prev => prev ? { ...prev, member_count: prev.member_count + 1 } : null);
      loadMembers(userAlliance.id);
    } catch (error) {
      console.error('Error accepting application:', error);
    }
  };

  const handleRejectApplication = async (application: AllianceApplication) => {
    if (!userAlliance) return;

    try {
      const { data, error } = await supabase.rpc('reject_alliance_application', {
        p_application_id: application.id
      });

      if (error) {
        console.error('Error rejecting application:', error);
        alert(error.message);
        return;
      }

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        alert(result.error || t.common.error);
        return;
      }

      setApplications(prev => prev.filter(a => a.id !== application.id));
    } catch (error) {
      console.error('Error rejecting application:', error);
    }
  };

  const handleTransferLeadership = async (newLeaderId: string) => {
    if (!userAlliance || !profile) return;
    if (userAlliance.leader_id !== profile.id) return;
    if (!confirm(t.alliance.confirmTransferLeadership)) return;

    try {
      const { data, error } = await supabase.rpc('transfer_alliance_leadership', {
        p_new_leader_id: newLeaderId
      });

      if (error) {
        console.error('Error transferring leadership:', error);
        alert(error.message);
        return;
      }

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        alert(result.error || t.common.error);
        return;
      }

      loadUserAlliance();
    } catch (error) {
      console.error('Error transferring leadership:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (userAlliance) {
    const isLeader = userAlliance.leader_id === profile?.id;
    const canManage = userMembership?.can_edit || userMembership?.can_kick || userMembership?.can_invite;
    // Limite real calculado por el servidor: 3 normal, 5 si el lider tiene VIP Plus activo.
    const maxMembers = userAlliance.max_members ?? 3;
    const isAllianceFull = members.length >= maxMembers;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
            <Users className="w-8 h-8 text-cyber-blue" />
            {userAlliance.name}
            <span className="text-cyber-blue">[{userAlliance.tag}]</span>
          </h1>
          <div className="flex items-center gap-2">
            {canManage && (
              <button
                onClick={() => setShowManage(true)}
                className="btn-secondary flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                {t.alliance.manageAlliance}
              </button>
            )}
            {userMembership?.can_invite && (
              <button
                onClick={() => setShowCircular(true)}
                className="btn-secondary flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                {t.alliance.circular}
              </button>
            )}
            <button
              onClick={handleLeaveAlliance}
              className="btn-secondary flex items-center gap-2 text-cyber-red border-cyber-red hover:bg-cyber-red/10"
            >
              <LogOut className="w-4 h-4" />
              {t.alliance.leaveAlliance}
            </button>
          </div>
        </div>

        {applications.length > 0 && userMembership?.can_invite && (
          <div className="card-glass p-4 border border-cyber-yellow/30 bg-cyber-yellow/5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-cyber-yellow" />
              <span className="font-semibold text-cyber-yellow">{applications.length} {t.alliance.pendingApplicationsCount}</span>
              {isAllianceFull && (
                <span className="text-cyber-red text-sm ml-2">({t.alliance.allianceFull} ({members.length}/{maxMembers}))</span>
              )}
            </div>
            <div className="space-y-3">
              {applications.map(app => (
                <div key={app.id} className="bg-space-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{app.profile?.username}</span>
                      <span className="text-gray-400 text-sm">
                        {formatNumber(app.profile?.points_total || 0)} {t.common.points}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAcceptApplication(app)}
                        disabled={isAllianceFull}
                        className={`p-2 rounded-lg ${
                          isAllianceFull
                            ? 'bg-gray-600/20 cursor-not-allowed'
                            : 'bg-cyber-green/20 hover:bg-cyber-green/30'
                        }`}
                        title={isAllianceFull ? t.alliance.allianceFull : t.alliance.acceptApplication}
                      >
                        <Check className={`w-4 h-4 ${isAllianceFull ? 'text-gray-500' : 'text-cyber-green'}`} />
                      </button>
                      <button
                        onClick={() => handleRejectApplication(app)}
                        className="p-2 bg-cyber-red/20 hover:bg-cyber-red/30 rounded-lg"
                        title={t.alliance.rejectApplication}
                      >
                        <XCircle className="w-4 h-4 text-cyber-red" />
                      </button>
                    </div>
                  </div>
                  {app.message && (
                    <div className="text-sm text-gray-400 italic border-l-2 border-cyber-blue/30 pl-2 mt-2">
                      "{app.message}"
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    {formatRelativeDate(app.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 border-b border-space-700 mb-6">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'info'
                ? 'text-cyber-blue border-b-2 border-cyber-blue'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            {t.alliance.information}
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'members'
                ? 'text-cyber-blue border-b-2 border-cyber-blue'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            {t.alliance.members} ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('diplomacy')}
            className={`px-4 py-2 font-medium transition-colors relative ${
              activeTab === 'diplomacy'
                ? 'text-cyber-blue border-b-2 border-cyber-blue'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Handshake className="w-4 h-4 inline mr-2" />
            {t.alliance.diplomacy}
            {diplomacy.filter(d => d.is_incoming && d.status === 'pending').length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyber-yellow text-black text-xs rounded-full flex items-center justify-center">
                {diplomacy.filter(d => d.is_incoming && d.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card-glass p-6">
              <h3 className="font-orbitron text-lg text-white mb-4">{t.alliance.information}</h3>
              <p className="text-gray-400">{userAlliance.description || t.alliance.noDescription}</p>
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="text-center">
                  <p className="text-sm text-gray-400">{t.alliance.members}</p>
                  <p className="font-orbitron text-2xl text-white">{members.length}<span className="text-gray-500">/{maxMembers}</span></p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-400">{t.common.points}</p>
                  <p className="font-orbitron text-2xl text-cyber-blue">
                    {formatNumber(userAlliance.points_total)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-400">{t.alliance.rank}</p>
                  <p className="font-orbitron text-2xl text-cyber-yellow">
                    #{userAlliance.rank_position || '-'}
                  </p>
                </div>
              </div>
            </div>

            <div className="card-glass p-6">
              <h3 className="font-orbitron text-lg text-white mb-4">{t.alliance.members} ({members.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-gray-400">
                      <th className="pb-3">{t.common.player}</th>
                      <th className="pb-3">{t.alliance.rank}</th>
                      <th className="pb-3 text-right">{t.common.points}</th>
                      {(userMembership?.can_kick || isLeader) && <th className="pb-3 text-center">{t.common.actions}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-space-700">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-space-700/30">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            {member.user_id === userAlliance.leader_id && (
                              <Crown className="w-4 h-4 text-cyber-yellow" />
                            )}
                            <span className="text-white">{member.profile?.username}</span>
                            {member.user_id === profile?.id && (
                              <span className="text-xs text-cyber-blue">({t.common.you})</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3">
                          <span className="text-gray-400">{member.rank_name}</span>
                          <span className="text-xs text-gray-500 ml-1">({t.common.level} {member.rank_level})</span>
                        </td>
                        <td className="py-3 text-right font-orbitron text-cyber-blue">
                          {formatNumber(member.profile?.points_total || 0)}
                        </td>
                        {(userMembership?.can_kick || isLeader) && (
                          <td className="py-3">
                            <div className="flex items-center justify-center gap-1">
                              {member.user_id !== profile?.id && userMembership && (isLeader || member.rank_level < userMembership.rank_level) && member.user_id !== userAlliance.leader_id && (
                                <>
                                  {member.rank_level < userMembership.rank_level && (
                                    <>
                                      <button
                                        onClick={() => handlePromoteMember(member)}
                                        className="p-1 hover:bg-space-600 rounded"
                                        title={t.alliance.promote}
                                      >
                                        <ChevronUp className="w-4 h-4 text-cyber-green" />
                                      </button>
                                      <button
                                        onClick={() => handleDemoteMember(member)}
                                        className="p-1 hover:bg-space-600 rounded"
                                        title={t.alliance.demote}
                                      >
                                        <ChevronDown className="w-4 h-4 text-cyber-orange" />
                                      </button>
                                    </>
                                  )}
                                  {(isLeader || (userMembership?.can_kick && member.rank_level < userMembership.rank_level)) && (
                                    <button
                                      onClick={() => handleKickMember(member.id, member.user_id)}
                                      className="p-1 hover:bg-space-600 rounded"
                                      title={t.alliance.kick}
                                    >
                                      <UserMinus className="w-4 h-4 text-cyber-red" />
                                    </button>
                                  )}
                                  {isLeader && (
                                    <button
                                      onClick={() => handleTransferLeadership(member.user_id)}
                                      className="p-1 hover:bg-space-600 rounded"
                                      title={t.alliance.transferLeadership}
                                    >
                                      <Crown className="w-4 h-4 text-cyber-yellow" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card-glass p-6">
              <h3 className="font-orbitron text-lg text-white mb-4">{t.alliance.yourRank}</h3>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-cyber-blue/20 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-cyber-blue" />
                </div>
                <div>
                  <p className="text-white font-semibold">{userMembership?.rank_name}</p>
                  <p className="text-sm text-gray-400">{t.common.level} {userMembership?.rank_level}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  {userMembership?.can_invite ? (
                    <Check className="w-4 h-4 text-cyber-green" />
                  ) : (
                    <X className="w-4 h-4 text-gray-500" />
                  )}
                  <span className={userMembership?.can_invite ? 'text-gray-300' : 'text-gray-500'}>
                    {t.alliance.canInvite}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {userMembership?.can_kick ? (
                    <Check className="w-4 h-4 text-cyber-green" />
                  ) : (
                    <X className="w-4 h-4 text-gray-500" />
                  )}
                  <span className={userMembership?.can_kick ? 'text-gray-300' : 'text-gray-500'}>
                    {t.alliance.canKick}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {userMembership?.can_edit ? (
                    <Check className="w-4 h-4 text-cyber-green" />
                  ) : (
                    <X className="w-4 h-4 text-gray-500" />
                  )}
                  <span className={userMembership?.can_edit ? 'text-gray-300' : 'text-gray-500'}>
                    {t.alliance.canEdit}
                  </span>
                </div>
              </div>
            </div>

            <div className="card-glass p-6">
              <h3 className="font-orbitron text-lg text-white mb-4">{t.alliance.internalText}</h3>
              <p className="text-gray-400 text-sm whitespace-pre-wrap">
                {userAlliance.internal_text || t.alliance.noInternalText}
              </p>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-6">
          <div className="card-glass p-6">
            <h3 className="font-orbitron text-lg text-white mb-4">{t.alliance.members} ({members.length}/{maxMembers})</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-400">
                    <th className="pb-3">{t.common.player}</th>
                    <th className="pb-3">{t.alliance.rank}</th>
                    <th className="pb-3 text-right">{t.common.points}</th>
                    {(userMembership?.can_kick || isLeader) && <th className="pb-3 text-center">{t.common.actions}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-space-700">
                  {members.map((member) => (
                    <tr key={member.id} className="hover:bg-space-700/30">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {member.user_id === userAlliance.leader_id && (
                            <Crown className="w-4 h-4 text-cyber-yellow" />
                          )}
                          <span className="text-white">{member.profile?.username}</span>
                          {member.user_id === profile?.id && (
                            <span className="text-xs text-cyber-blue">({t.common.you})</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="text-gray-400">{member.rank_name}</span>
                        <span className="text-xs text-gray-500 ml-1">({t.common.level} {member.rank_level})</span>
                      </td>
                      <td className="py-3 text-right font-orbitron text-cyber-blue">
                        {formatNumber(member.profile?.points_total || 0)}
                      </td>
                      {(userMembership?.can_kick || isLeader) && (
                        <td className="py-3">
                          <div className="flex items-center justify-center gap-1">
                            {member.user_id !== profile?.id && userMembership && (isLeader || member.rank_level < userMembership.rank_level) && member.user_id !== userAlliance.leader_id && (
                              <>
                                {member.rank_level < userMembership.rank_level && (
                                  <>
                                    <button
                                      onClick={() => handlePromoteMember(member)}
                                      className="p-1 hover:bg-space-600 rounded"
                                      title={t.alliance.promote}
                                    >
                                      <ChevronUp className="w-4 h-4 text-cyber-green" />
                                    </button>
                                    <button
                                      onClick={() => handleDemoteMember(member)}
                                      className="p-1 hover:bg-space-600 rounded"
                                      title={t.alliance.demote}
                                    >
                                      <ChevronDown className="w-4 h-4 text-cyber-orange" />
                                    </button>
                                  </>
                                )}
                                {(isLeader || (userMembership?.can_kick && member.rank_level < userMembership.rank_level)) && (
                                  <button
                                    onClick={() => handleKickMember(member.id, member.user_id)}
                                    className="p-1 hover:bg-space-600 rounded"
                                    title={t.alliance.kick}
                                  >
                                    <UserMinus className="w-4 h-4 text-cyber-red" />
                                  </button>
                                )}
                                {isLeader && (
                                  <button
                                    onClick={() => handleTransferLeadership(member.user_id)}
                                    className="p-1 hover:bg-space-600 rounded"
                                    title={t.alliance.transferLeadership}
                                  >
                                    <Crown className="w-4 h-4 text-cyber-yellow" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <AllianceRewardShares />
          </div>
        )}

        {activeTab === 'diplomacy' && (
          <DiplomacySection
            alliance={userAlliance}
            diplomacy={diplomacy}
            canManage={userMembership?.can_edit || false}
            onRefresh={() => loadDiplomacy(userAlliance.id)}
          />
        )}

        {showManage && userMembership?.can_edit && (
          <ManageAllianceModal
            alliance={userAlliance}
            onClose={() => setShowManage(false)}
            onUpdated={() => {
              setShowManage(false);
              loadUserAlliance();
            }}
          />
        )}

        {showCircular && (
          <CircularMessageModal
            alliance={userAlliance}
            members={members}
            onClose={() => setShowCircular(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <Users className="w-8 h-8 text-cyber-blue" />
          {t.alliance.title}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {t.common.search}
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-cyber flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {t.alliance.createAlliance}
          </button>
        </div>
      </div>

      <div className="card-glass p-6 text-center">
        <Users className="w-16 h-16 mx-auto mb-4 text-gray-600" />
        <h2 className="font-orbitron text-xl text-white mb-2">{t.alliance.noAlliance}</h2>
        <p className="text-gray-400 mb-6">
          {t.alliance.noAllianceDescription}
        </p>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => setShowSearch(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {t.alliance.searchAlliance}
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-cyber flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {t.alliance.createAlliance}
          </button>
        </div>
      </div>

      <div className="card-glass overflow-hidden">
        <div className="p-4 border-b border-space-700">
          <h3 className="font-orbitron text-lg text-white">{t.alliance.topAlliances}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-space-700/50 text-left text-sm text-gray-400">
                <th className="px-4 py-3">{t.alliance.rank}</th>
                <th className="px-4 py-3">{t.alliance.allianceTag}</th>
                <th className="px-4 py-3">{t.common.name}</th>
                <th className="px-4 py-3 text-center">{t.alliance.members} (max 3)</th>
                <th className="px-4 py-3 text-right">{t.common.points}</th>
                <th className="px-4 py-3 text-center">{t.common.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-space-700">
              {alliances.map((alliance, index) => (
                <AllianceRow
                  key={alliance.id}
                  alliance={alliance}
                  rank={index + 1}
                  onJoined={loadUserAlliance}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateAllianceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadUserAlliance();
            refreshProfile();
          }}
        />
      )}

      {showSearch && (
        <SearchAllianceModal
          onClose={() => setShowSearch(false)}
          onJoined={() => {
            setShowSearch(false);
            loadUserAlliance();
          }}
        />
      )}
    </div>
  );
}

function AllianceRow({
  alliance,
  rank,
  onJoined
}: {
  alliance: Alliance & { is_open?: boolean };
  rank: number;
  onJoined: () => void;
}) {
  const { t } = useI18n();
  const { profile } = useAuthStore();
  const [joining, setJoining] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');

  const maxMembers = alliance.max_members ?? 3;
  const isFull = alliance.member_count >= maxMembers;

  const handleJoin = async () => {
    if (!profile || isFull) return;
    setJoining(true);
    setError('');

    try {
      if (alliance.is_open !== false) {
        const { data, error: rpcError } = await supabase.rpc('join_open_alliance', {
          p_alliance_id: alliance.id
        });

        if (rpcError) {
          setError(t.alliance.errorJoiningAlliance);
          return;
        }

        const result = data as { success: boolean; error?: string };
        if (!result.success) {
          setError(result.error || t.alliance.errorJoiningAlliance);
          return;
        }

        onJoined();
      } else {
        const { data: applyResult, error: applyError } = await supabase.rpc('secure_apply_to_alliance', {
          p_alliance_id: alliance.id,
          p_message: '',
        });
        if (applyError) {
          setError(applyError.message);
          return;
        }
        if (applyResult && !applyResult.success) {
          setError(applyResult.error || t.alliance.errorJoiningAlliance);
          return;
        }
        setApplied(true);
      }
    } catch (err) {
      console.error('Error joining alliance:', err);
      setError(t.alliance.errorJoiningAlliance);
    } finally {
      setJoining(false);
    }
  };

  return (
    <tr className="hover:bg-space-700/30">
      <td className="px-4 py-3">
        <span className="font-orbitron text-cyber-yellow">{rank}</span>
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold text-cyber-blue">[{alliance.tag}]</span>
      </td>
      <td className="px-4 py-3 text-white">{alliance.name}</td>
      <td className="px-4 py-3 text-center">
        <span className={isFull ? 'text-cyber-red' : 'text-gray-400'}>
          {alliance.member_count}/{maxMembers}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-orbitron text-white">
        {formatNumber(alliance.points_total)}
      </td>
      <td className="px-4 py-3 text-center">
        {error && <span className="text-cyber-red text-xs block mb-1">{error}</span>}
        {applied ? (
          <span className="text-cyber-yellow text-sm">{t.alliance.applicationSent}</span>
        ) : isFull ? (
          <span className="text-gray-500 text-sm">{t.alliance.allianceFull}</span>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="px-3 py-1 bg-cyber-blue/20 hover:bg-cyber-blue/30 text-cyber-blue rounded text-sm flex items-center gap-1 mx-auto"
          >
            <UserPlus className="w-3 h-3" />
            {joining ? '...' : (alliance.is_open !== false ? t.alliance.joinAlliance : t.alliance.applyToJoin)}
          </button>
        )}
      </td>
    </tr>
  );
}

function SearchAllianceModal({ onClose, onJoined }: { onClose: () => void; onJoined: () => void }) {
  const { t } = useI18n();
  const { profile } = useAuthStore();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<(Alliance & { is_open?: boolean })[]>([]);
  const [searching, setSearching] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showApplyModal, setShowApplyModal] = useState<Alliance | null>(null);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);

    try {
      const { data } = await supabase
        .from('alliances')
        .select('*, max_members')
        .or(`tag.ilike.%${search}%,name.ilike.%${search}%`)
        .order('points_total', { ascending: false })
        .limit(20);

      setResults(data || []);
    } catch (err) {
      console.error('Error searching alliances:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleJoin = async (alliance: Alliance & { is_open?: boolean }) => {
    if (!profile) return;

    const isFull = alliance.member_count >= (alliance.max_members ?? 3);
    if (isFull) {
      setError(t.alliance.allianceFull);
      return;
    }

    setJoining(alliance.id);
    setError(null);

    try {
      if (alliance.is_open !== false) {
        const { data, error: rpcError } = await supabase.rpc('join_open_alliance', {
          p_alliance_id: alliance.id
        });

        if (rpcError) {
          setError(t.alliance.errorJoiningAlliance);
          return;
        }

        const result = data as { success: boolean; error?: string };
        if (!result.success) {
          setError(result.error || t.alliance.errorJoiningAlliance);
          return;
        }

        onJoined();
      } else {
        setShowApplyModal(alliance);
      }
    } catch (err) {
      console.error('Error joining alliance:', err);
      setError(t.alliance.errorJoiningAlliance);
    } finally {
      setJoining(null);
    }
  };

  const handleApply = async (alliance: Alliance, message: string) => {
    if (!profile) return;

    try {
      const { data: applyResult, error: applyError } = await supabase.rpc('secure_apply_to_alliance', {
        p_alliance_id: alliance.id,
        p_message: message,
      });
      if (applyError) {
        setError(applyError.message);
        return;
      }
      if (applyResult && !applyResult.success) {
        setError(applyResult.error || t.alliance.errorJoiningAlliance);
        return;
      }
      setApplied(prev => new Set([...prev, alliance.id]));
      setShowApplyModal(null);
    } catch (err) {
      console.error('Error applying to alliance:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card-glass w-full max-w-2xl p-6 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl text-white">{t.alliance.searchAlliance}</h2>
          <button onClick={onClose} className="p-2 hover:bg-space-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-cyber-red/20 border border-cyber-red/50 rounded-lg text-cyber-red">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="input-cyber flex-1"
            placeholder={t.alliance.searchByNameOrTag}
          />
          <button onClick={handleSearch} disabled={searching} className="btn-cyber">
            {searching ? '...' : t.common.search}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {results.length > 0 ? (
            <div className="space-y-2">
              {results.map((alliance) => {
                const maxMembers = alliance.max_members ?? 3;
                const isFull = alliance.member_count >= maxMembers;
                return (
                  <div
                    key={alliance.id}
                    className="flex items-center justify-between p-3 bg-space-800 rounded-lg"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-cyber-blue">[{alliance.tag}]</span>
                        <span className="text-white">{alliance.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm mt-1">
                        <span className={isFull ? 'text-cyber-red' : 'text-gray-400'}>
                          {alliance.member_count}/{maxMembers} {t.alliance.members}
                        </span>
                        <span className="text-gray-400">{formatNumber(alliance.points_total)} {t.common.points}</span>
                      </div>
                    </div>
                    {applied.has(alliance.id) ? (
                      <span className="text-cyber-yellow text-sm">{t.alliance.applicationSent}</span>
                    ) : isFull ? (
                      <span className="text-gray-500 text-sm">{t.alliance.allianceFull}</span>
                    ) : (
                      <button
                        onClick={() => handleJoin(alliance)}
                        disabled={joining === alliance.id}
                        className="btn-cyber text-sm"
                      >
                        {joining === alliance.id ? '...' : (alliance.is_open !== false ? t.alliance.joinAlliance : t.alliance.applyToJoin)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{t.alliance.searchAlliancesByNameOrTag}</p>
            </div>
          )}
        </div>
      </div>

      {showApplyModal && (
        <ApplyModal
          alliance={showApplyModal}
          onClose={() => setShowApplyModal(null)}
          onApply={handleApply}
        />
      )}
    </div>
  );
}

function ApplyModal({
  alliance,
  onClose,
  onApply
}: {
  alliance: Alliance;
  onClose: () => void;
  onApply: (alliance: Alliance, message: string) => void;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    setSending(true);
    await onApply(alliance, message);
    setSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="card-glass w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl text-white">{t.alliance.applyToJoin}</h2>
          <button onClick={onClose} className="p-2 hover:bg-space-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-gray-400 mb-2">
            {t.alliance.applyingTo}: <span className="text-cyber-blue font-semibold">[{alliance.tag}] {alliance.name}</span>
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">{t.alliance.applicationMessage}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="input-cyber min-h-[100px] resize-none"
            placeholder={t.alliance.applicationMessagePlaceholder}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            {t.common.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={sending}
            className="btn-cyber"
          >
            {sending ? '...' : t.alliance.sendApplication}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateAllianceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const { profile, refreshProfile } = useAuthStore();
  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [costs, setCosts] = useState<{ create_alliance_cost: number; create_alliance_cost_vip: number; is_vip: boolean } | null>(null);

  useEffect(() => {
    const loadCosts = async () => {
      try {
        const { data } = await supabase.rpc('get_rename_costs');
        if (data) setCosts(data);
      } catch {}
    };
    loadCosts();
  }, []);

  const handleCreate = async () => {
    if (!profile || !tag || !name) return;

    setCreating(true);
    setError('');

    try {
      const { data, error: rpcError } = await supabase.rpc('secure_create_alliance', {
        p_tag: tag.toUpperCase(),
        p_name: name,
        p_description: description || '',
      });

      if (rpcError) throw rpcError;

      if (data && !data.success) {
        setError(data.error || t.alliance.errorCreatingAlliance);
        setCreating(false);
        return;
      }

      // Refresh profile to update TUNG balance
      if (data?.cost > 0) {
        refreshProfile();
      }

      onCreated();
    } catch (err) {
      setError(t.alliance.errorCreatingAlliance);
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const displayCost = costs ? (costs.is_vip ? costs.create_alliance_cost_vip : costs.create_alliance_cost) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card-glass w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl text-white">{t.alliance.createAlliance}</h2>
          <button onClick={onClose} className="p-2 hover:bg-space-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-cyber-red/20 border border-cyber-red/50 rounded-lg text-cyber-red">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {costs && displayCost !== null && displayCost > 0 && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
            <Coins className="w-5 h-5 flex-shrink-0" />
            <span>
              Costo: <strong>{displayCost} TUNG</strong>
              {costs.is_vip && <span className="text-purple-400 ml-1">(VIP -50%)</span>}
            </span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.alliance.tagLabel}</label>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase().slice(0, 8))}
              className="input-cyber"
              placeholder="ABC"
              maxLength={8}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.alliance.allianceName}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-cyber"
              placeholder={t.alliance.allianceNamePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.alliance.descriptionOptional}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-cyber min-h-[100px] resize-none"
              placeholder={t.alliance.descriptionPlaceholder}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary">
            {t.common.cancel}
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !tag || !name || tag.length < 2}
            className="btn-cyber"
          >
            {creating ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t.alliance.creating}</span>
            ) : (
              t.alliance.createAlliance
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManageAllianceModal({
  alliance,
  onClose,
  onUpdated,
}: {
  alliance: Alliance;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(alliance.name);
  const [description, setDescription] = useState(alliance.description || '');
  const [internalText, setInternalText] = useState(alliance.internal_text || '');
  const [isOpen, setIsOpen] = useState((alliance as Alliance & { is_open?: boolean }).is_open !== false);
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameCosts, setRenameCosts] = useState<{ alliance_cost: number; alliance_cost_vip: number; is_vip: boolean } | null>(null);

  useEffect(() => {
    const loadCosts = async () => {
      try {
        const { data } = await supabase.rpc('get_rename_costs');
        if (data) setRenameCosts(data);
      } catch {}
    };
    loadCosts();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setRenameError(null);
    try {
      const nameChanged = name !== alliance.name;

      // If name changed, use the secure RPC that charges TUNG
      if (nameChanged) {
        const { data, error } = await supabase.rpc('secure_rename_alliance', {
          p_alliance_id: alliance.id,
          p_new_name: name,
        });

        if (error) throw error;
        const result = data as { success: boolean; error?: string };
        if (!result.success) {
          setRenameError(result.error || 'Error renaming alliance');
          setSaving(false);
          return;
        }
      }

      // Update other fields (description, internal text, is_open) - always free
      await supabase
        .from('alliances')
        .update({
          description,
          internal_text: internalText,
          is_open: isOpen,
        })
        .eq('id', alliance.id);

      onUpdated();
    } catch (error) {
      console.error('Error updating alliance:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card-glass w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl text-white flex items-center gap-2">
            <Edit3 className="w-5 h-5" />
            {t.alliance.manageAlliance}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-space-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.common.name}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setRenameError(null); }}
              className="input-cyber"
            />
            {name !== alliance.name && renameCosts && (
              <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                💰 {t.overview.renameCost}: {renameCosts.is_vip ? renameCosts.alliance_cost_vip : renameCosts.alliance_cost} TUNG
                {renameCosts.is_vip && <span className="text-green-400">(VIP -50%)</span>}
              </p>
            )}
            {renameError && (
              <p className="text-xs text-red-400 mt-1">{renameError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.alliance.publicDescription}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-cyber min-h-[80px] resize-none"
              placeholder={t.alliance.visibleToAll}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.alliance.internalTextMembersOnly}</label>
            <textarea
              value={internalText}
              onChange={(e) => setInternalText(e.target.value)}
              className="input-cyber min-h-[80px] resize-none"
              placeholder={t.alliance.visibleToMembersOnly}
            />
          </div>

          <div className="flex items-center gap-3 p-3 bg-space-800 rounded-lg">
            <input
              type="checkbox"
              id="isOpen"
              checked={isOpen}
              onChange={(e) => setIsOpen(e.target.checked)}
              className="w-4 h-4 accent-cyber-blue"
            />
            <label htmlFor="isOpen" className="text-gray-300">
              {t.alliance.openAlliance}
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary">
            {t.common.cancel}
          </button>
          <button onClick={handleSave} disabled={saving || !name} className="btn-cyber">
            {saving ? t.common.saving : t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function CircularMessageModal({
  alliance,
  members,
  onClose,
}: {
  alliance: Alliance;
  members: (AllianceMember & { profile?: Profile })[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { profile } = useAuthStore();
  const [subject, setSubject] = useState(`[${alliance.tag}] `);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!profile || !subject || !body) return;
    setSending(true);

    try {
      const messages = members
        .filter(m => m.user_id !== profile.id)
        .map(m => ({
          sender_id: profile.id,
          recipient_id: m.user_id,
          subject,
          body,
          message_type: 'alliance',
        }));

      if (messages.length > 0) {
        for (const msg of messages) {
          await supabase.rpc('secure_send_message', {
            p_recipient_id: msg.recipient_id,
            p_subject: msg.subject,
            p_body: msg.body,
            p_message_type: 'alliance',
          });
        }
      }

      setSent(true);
    } catch (error) {
      console.error('Error sending circular:', error);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="card-glass w-full max-w-md p-6 text-center">
          <Check className="w-16 h-16 mx-auto mb-4 text-cyber-green" />
          <h2 className="font-orbitron text-xl text-white mb-2">{t.alliance.messageSent}</h2>
          <p className="text-gray-400 mb-6">
            {t.alliance.circularSentToMembers.replace('{count}', (members.length - 1).toString())}
          </p>
          <button onClick={onClose} className="btn-cyber">
            {t.common.close}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card-glass w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl text-white flex items-center gap-2">
            <Send className="w-5 h-5" />
            {t.alliance.circularMessage}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-space-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-gray-400 text-sm mb-4">
          {t.alliance.circularDescription.replace('{count}', (members.length - 1).toString())}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.alliance.subject}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input-cyber"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.alliance.message}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="input-cyber min-h-[150px] resize-none"
              placeholder={t.alliance.messagePlaceholder}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary">
            {t.common.cancel}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !subject || !body}
            className="btn-cyber flex items-center gap-2"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.common.sending}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {t.alliance.sendToAll}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DiplomacySection({
  alliance,
  diplomacy,
  canManage,
  onRefresh
}: {
  alliance: Alliance;
  diplomacy: AllianceDiplomacy[];
  canManage: boolean;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [showPropose, setShowPropose] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const activePacts = diplomacy.filter(d => d.status === 'active');
  const pendingIncoming = diplomacy.filter(d => d.status === 'pending' && d.is_incoming);
  const pendingOutgoing = diplomacy.filter(d => d.status === 'pending' && !d.is_incoming);

  const handleRespond = async (diplomacyId: string, accept: boolean) => {
    setProcessing(diplomacyId);
    try {
      const { error } = await supabase.rpc('respond_diplomacy', {
        p_diplomacy_id: diplomacyId,
        p_accept: accept
      });
      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error('Error responding to diplomacy:', error);
    } finally {
      setProcessing(null);
    }
  };

  const handleCancel = async (diplomacyId: string) => {
    if (!confirm(t.alliance.confirmCancelPact)) return;
    setProcessing(diplomacyId);
    try {
      const { data, error } = await supabase.rpc('cancel_diplomacy', {
        p_diplomacy_id: diplomacyId
      });
      if (error) throw error;
      if (data && !data.success) {
        alert(data.error || 'Error al cancelar la relación diplomática');
        return;
      }
      onRefresh();
    } catch (error) {
      console.error('Error cancelling diplomacy:', error);
      alert('Error al cancelar la relación diplomática. Intenta de nuevo.');
    } finally {
      setProcessing(null);
    }
  };

  const getDiplomacyIcon = (type: string) => {
    switch (type) {
      case 'nap': return <Shield className="w-5 h-5 text-cyber-green" />;
      case 'trade': return <Handshake className="w-5 h-5 text-cyber-blue" />;
      case 'war': return <Swords className="w-5 h-5 text-cyber-red" />;
      default: return null;
    }
  };

  const getDiplomacyLabel = (type: string) => {
    switch (type) {
      case 'nap': return t.alliance.napActive;
      case 'trade': return t.alliance.tradePact;
      case 'war': return t.alliance.warActive;
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowPropose(true)}
            className="btn-cyber flex items-center gap-2"
          >
            <Handshake className="w-4 h-4" />
            {t.alliance.diplomacy}
          </button>
        </div>
      )}

      {pendingIncoming.length > 0 && (
        <div className="card-glass p-4 border border-cyber-yellow/30 bg-cyber-yellow/5">
          <h3 className="font-semibold text-cyber-yellow mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {t.alliance.pendingProposals} ({pendingIncoming.length})
          </h3>
          <div className="space-y-3">
            {pendingIncoming.map(d => (
              <div key={d.id} className="bg-space-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {getDiplomacyIcon(d.diplomacy_type)}
                    <div>
                      <span className="text-white font-medium">{getDiplomacyLabel(d.diplomacy_type)}</span>
                      <span className="text-gray-400 ml-2">de [{d.alliance_tag}] {d.alliance_name}</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRespond(d.id, true)}
                        disabled={processing === d.id}
                        className="px-3 py-1 bg-cyber-green/20 hover:bg-cyber-green/30 text-cyber-green rounded flex items-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        {t.alliance.acceptProposal}
                      </button>
                      <button
                        onClick={() => handleRespond(d.id, false)}
                        disabled={processing === d.id}
                        className="px-3 py-1 bg-cyber-red/20 hover:bg-cyber-red/30 text-cyber-red rounded flex items-center gap-1"
                      >
                        <XCircle className="w-4 h-4" />
                        {t.alliance.rejectProposal}
                      </button>
                    </div>
                  )}
                </div>
                {d.message && (
                  <p className="text-sm text-gray-400 italic border-l-2 border-cyber-blue/30 pl-2 mt-2">
                    "{d.message}"
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-2">{formatRelativeDate(d.proposed_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingOutgoing.length > 0 && (
        <div className="card-glass p-4">
          <h3 className="font-semibold text-gray-300 mb-4">{t.alliance.outgoingProposal} ({pendingOutgoing.length})</h3>
          <div className="space-y-3">
            {pendingOutgoing.map(d => (
              <div key={d.id} className="bg-space-800 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getDiplomacyIcon(d.diplomacy_type)}
                  <div>
                    <span className="text-white">{getDiplomacyLabel(d.diplomacy_type)}</span>
                    <span className="text-gray-400 ml-2">a [{d.target_alliance_tag}] {d.target_alliance_name}</span>
                  </div>
                </div>
                <span className="text-cyber-yellow text-sm">{t.alliance.pendingProposals}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-glass p-6">
        <h3 className="font-orbitron text-lg text-white mb-4">{t.alliance.activePacts}</h3>
        {activePacts.length === 0 ? (
          <p className="text-gray-400 text-center py-4">{t.alliance.noPacts}</p>
        ) : (
          <div className="space-y-3">
            {activePacts.map(d => {
              const otherAlliance = d.is_incoming
                ? { tag: d.alliance_tag, name: d.alliance_name }
                : { tag: d.target_alliance_tag, name: d.target_alliance_name };

              return (
                <div key={d.id} className="bg-space-800 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getDiplomacyIcon(d.diplomacy_type)}
                    <div>
                      <span className={`font-medium ${
                        d.diplomacy_type === 'war' ? 'text-cyber-red' : 'text-white'
                      }`}>
                        {getDiplomacyLabel(d.diplomacy_type)}
                      </span>
                      <span className="text-gray-400 ml-2">[{otherAlliance.tag}] {otherAlliance.name}</span>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => handleCancel(d.id)}
                      disabled={processing === d.id}
                      className="px-3 py-1 bg-space-700 hover:bg-space-600 text-gray-300 rounded text-sm"
                    >
                      {t.alliance.cancelPact}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card-glass p-6">
        <h3 className="font-orbitron text-lg text-white mb-4">{t.alliance.allianceBenefits}</h3>
        <ul className="space-y-2 text-gray-400">
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-cyber-green" />
            {t.alliance.benefitACS}
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-cyber-green" />
            {t.alliance.benefitTransport}
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-cyber-green" />
            {t.alliance.benefitDiplomacy}
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-cyber-green" />
            {t.alliance.benefitRanking}
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-cyber-green" />
            {t.alliance.benefitCommunication}
          </li>
        </ul>
      </div>

      {showPropose && (
        <ProposeDiplomacyModal
          alliance={alliance}
          onClose={() => setShowPropose(false)}
          onProposed={() => {
            setShowPropose(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function ProposeDiplomacyModal({
  alliance,
  onClose,
  onProposed
}: {
  alliance: Alliance;
  onClose: () => void;
  onProposed: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Alliance[]>([]);
  const [selectedAlliance, setSelectedAlliance] = useState<Alliance | null>(null);
  const [diplomacyType, setDiplomacyType] = useState<'nap' | 'war'>('nap');
  const [message, setMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const { data } = await supabase
        .from('alliances')
        .select('*')
        .neq('id', alliance.id)
        .or(`tag.ilike.%${search}%,name.ilike.%${search}%`)
        .limit(10);
      setResults(data || []);
    } catch (err) {
      console.error('Error searching alliances:', err);
    } finally {
      setSearching(false);
    }
  };

  const handlePropose = async () => {
    if (!selectedAlliance) return;

    if (diplomacyType === 'war' && !confirm(t.alliance.confirmDeclareWar)) return;

    setSending(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('propose_diplomacy', {
        p_target_alliance_id: selectedAlliance.id,
        p_diplomacy_type: diplomacyType,
        p_message: message || null
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        setError(result.error || t.common.error);
        return;
      }

      onProposed();
    } catch (err) {
      console.error('Error proposing diplomacy:', err);
      setError(t.alliance.errorSendingProposal);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card-glass w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl text-white">{t.alliance.diplomacy}</h2>
          <button onClick={onClose} className="p-2 hover:bg-space-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-cyber-red/20 border border-cyber-red/50 rounded-lg text-cyber-red">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {!selectedAlliance ? (
          <>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="input-cyber flex-1"
                placeholder={t.alliance.searchByNameOrTag}
              />
              <button onClick={handleSearch} disabled={searching} className="btn-cyber">
                {searching ? '...' : t.common.search}
              </button>
            </div>

            {results.length > 0 ? (
              <div className="space-y-2">
                {results.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAlliance(a)}
                    className="w-full p-3 bg-space-800 hover:bg-space-700 rounded-lg text-left flex items-center justify-between"
                  >
                    <div>
                      <span className="text-cyber-blue font-semibold">[{a.tag}]</span>
                      <span className="text-white ml-2">{a.name}</span>
                    </div>
                    <span className="text-gray-400 text-sm">{a.member_count} {t.alliance.members}</span>
                  </button>
                ))}
              </div>
            ) : hasSearched && !searching ? (
              <div className="text-center py-6">
                <Search className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                <p className="text-gray-400">{t.alliance.noAlliancesFound}</p>
                <p className="text-gray-500 text-xs mt-1">{t.alliance.searchByAllianceNameHint}</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="bg-space-800 rounded-lg p-4 mb-4">
              <p className="text-gray-400 text-sm">{t.alliance.selectAlliance}:</p>
              <p className="text-white font-medium">
                <span className="text-cyber-blue">[{selectedAlliance.tag}]</span> {selectedAlliance.name}
              </p>
              <button
                onClick={() => setSelectedAlliance(null)}
                className="text-sm text-cyber-blue hover:underline mt-2"
              >
                {t.alliance.changeSelection}
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t.alliance.diplomacyType}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDiplomacyType('nap')}
                    className={`p-3 rounded-lg border ${
                      diplomacyType === 'nap'
                        ? 'border-cyber-green bg-cyber-green/20'
                        : 'border-space-600 hover:border-cyber-green/50'
                    }`}
                  >
                    <Shield className="w-6 h-6 mx-auto mb-1 text-cyber-green" />
                    <span className="text-sm text-gray-300">{t.alliance.nap}</span>
                  </button>
                  <button
                    onClick={() => setDiplomacyType('war')}
                    className={`p-3 rounded-lg border ${
                      diplomacyType === 'war'
                        ? 'border-cyber-red bg-cyber-red/20'
                        : 'border-space-600 hover:border-cyber-red/50'
                    }`}
                  >
                    <Swords className="w-6 h-6 mx-auto mb-1 text-cyber-red" />
                    <span className="text-sm text-gray-300">{t.alliance.war}</span>
                  </button>
                </div>
              </div>

              <div className="text-sm text-gray-400 bg-space-800 p-3 rounded-lg">
                {diplomacyType === 'nap' && t.alliance.napDescription}
                {diplomacyType === 'war' && t.alliance.warDescription}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">{t.alliance.message} (opcional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="input-cyber min-h-[80px] resize-none"
                  placeholder={t.alliance.messagePlaceholder}
                />
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={onClose} className="btn-secondary">
                  {t.common.cancel}
                </button>
                <button
                  onClick={handlePropose}
                  disabled={sending}
                  className={`btn-cyber ${diplomacyType === 'war' ? 'bg-cyber-red/20 border-cyber-red text-cyber-red hover:bg-cyber-red/30' : ''}`}
                >
                  {sending ? '...' : diplomacyType === 'war' ? t.alliance.declareWar : t.alliance.sendProposal}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
