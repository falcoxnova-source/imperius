import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  MessageCircle,
  Copy,
  Check,
  Gift,
  Link2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Coins,
  Twitter,
  Trophy,
  Send,
  Shield,
  Pencil,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatNumber } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';

// Seccion de tareas de Twitter/X oculta temporalmente (solo se muestra la de Telegram)
const SHOW_TWITTER_TASKS = false;

interface TelegramTaskStatus {
  telegram_linked: boolean;
  telegram_username?: string;
  task_completed: boolean;
  is_member: boolean;
  reward_amount: number;
  reward_revoked: boolean;
}

interface TelegramConfig {
  group_invite_link: string | null;
  group_title: string | null;
}

interface TwitterTaskStatus {
  twitter_linked: boolean;
  twitter_username?: string;
  link_reward_claimed: boolean;
  link_reward_fxu: number;
  total_points: number;
  total_actions: number;
  quote_tweet_points: number;
  comment_points: number;
}

interface TwitterMission {
  id: string;
  tweet_id: string;
  tweet_url: string;
  description: string;
  hashtag: string;
  created_at: string;
  user_quote_tweet: { validated: boolean; user_tweet_url: string; points: number } | null;
  user_comment: { validated: boolean; user_tweet_url: string; points: number } | null;
}

interface TwitterRankingEntry {
  user_id: string;
  twitter_username: string;
  username: string;
  total_points: number;
  total_actions: number;
  quote_tweets: number;
  comments: number;
}

export function TasksPage() {
  const { t } = useI18n();
  const { profile, refreshProfile } = useAuthStore();
  const [taskStatus, setTaskStatus] = useState<TelegramTaskStatus | null>(null);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState('');

  // Twitter/X state
  const [twitterStatus, setTwitterStatus] = useState<TwitterTaskStatus | null>(null);
  const [twitterMissions, setTwitterMissions] = useState<TwitterMission[]>([]);
  const [twitterRanking, setTwitterRanking] = useState<TwitterRankingEntry[]>([]);
  const [twitterUsername, setTwitterUsername] = useState('');
  const [linkingTwitter, setLinkingTwitter] = useState(false);
  const [twitterError, setTwitterError] = useState('');
  const [twitterSuccess, setTwitterSuccess] = useState('');
  const [editingTwitter, setEditingTwitter] = useState(false);
  const [editTwitterUsername, setEditTwitterUsername] = useState('');
  const [actionUrls, setActionUrls] = useState<Record<string, string>>({});
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'missions' | 'ranking'>('missions');
  const [rankingPage, setRankingPage] = useState(1);
  const RANKING_PER_PAGE = 30;
  const [syncingMissions, setSyncingMissions] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Admin batch validation state
  const [batchValidating, setBatchValidating] = useState(false);
  const [batchResult, setBatchResult] = useState<{ validated: number; failed: number; skipped: number; total: number; message: string } | null>(null);

  const isAdmin = profile?.is_admin === true;

  const loadTaskStatus = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    try {
      const [statusResult, configResult] = await Promise.all([
        supabase.rpc('get_telegram_task_status'),
        supabase.from('telegram_config').select('group_invite_link, group_title').limit(1).single()
      ]);

      if (statusResult.data?.success) {
        setTaskStatus({
          telegram_linked: statusResult.data.telegram_linked,
          telegram_username: statusResult.data.telegram_username,
          task_completed: statusResult.data.task_completed,
          is_member: statusResult.data.is_member,
          reward_amount: statusResult.data.reward_amount ?? 0,
          reward_revoked: statusResult.data.reward_revoked,
        });
      }

      if (configResult.data) {
        setTelegramConfig({
          group_invite_link: configResult.data.group_invite_link,
          group_title: configResult.data.group_title,
        });
      }
    } catch (err) {
      console.error('Error loading task status:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    loadTaskStatus();
  }, [loadTaskStatus]);

  // ============ Twitter/X Functions ============

  const loadTwitterStatus = useCallback(async () => {
    if (!profile) return;
    try {
      const { data } = await supabase.rpc('get_twitter_task_status');
      if (data?.success) {
        setTwitterStatus({
          twitter_linked: data.twitter_linked,
          twitter_username: data.twitter_username,
          link_reward_claimed: data.link_reward_claimed || false,
          link_reward_fxu: data.link_reward_fxu || 20,
          total_points: data.total_points || 0,
          total_actions: data.total_actions || 0,
          quote_tweet_points: data.quote_tweet_points || 10,
          comment_points: data.comment_points || 5,
        });
      }
    } catch (err) {
      console.error('Error loading twitter status:', err);
    }
  }, [profile]);

  const loadTwitterMissions = useCallback(async () => {
    if (!profile) return;
    try {
      const { data } = await supabase.rpc('get_active_twitter_missions');
      if (data?.success) {
        setTwitterMissions(data.missions || []);
      }
    } catch (err) {
      console.error('Error loading twitter missions:', err);
    }
  }, [profile]);

  const loadTwitterRanking = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('get_twitter_social_ranking', { p_limit: 500 });
      if (data?.success) {
        setTwitterRanking(data.ranking || []);
      }
    } catch (err) {
      console.error('Error loading twitter ranking:', err);
    }
  }, []);

  useEffect(() => {
    loadTwitterStatus();
    loadTwitterMissions();
    loadTwitterRanking();
  }, [loadTwitterStatus, loadTwitterMissions, loadTwitterRanking]);

  const syncTwitterMissions = useCallback(async () => {
    setSyncingMissions(true);
    setTwitterError('');
    setTwitterSuccess('');
    try {
      await loadTwitterMissions();
      setLastSynced(new Date());
    } catch (err: unknown) {
      console.error('Error loading missions:', err);
    } finally {
      setSyncingMissions(false);
    }
  }, [loadTwitterMissions]);

  // Auto-sync on page load to pick up new tweets immediately
  useEffect(() => {
    syncTwitterMissions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLinkTwitter = async () => {
    if (!twitterUsername.trim()) return;
    setLinkingTwitter(true);
    setTwitterError('');
    setTwitterSuccess('');

    try {
      const { data, error: rpcError } = await supabase.rpc('link_twitter_account', {
        p_twitter_username: twitterUsername.trim(),
      });
      if (rpcError) throw rpcError;

      if (data?.success) {
        if (data.already_linked) {
          setTwitterError(t.tasks.twitterAlreadyLinked);
        } else {
          setTwitterSuccess(data.message || `+${data.reward_amount} TUNG!`);
          await loadTwitterStatus();
          await refreshProfile();
        }
      } else {
        setTwitterError(data?.error || t.tasks.twitterLinkError);
      }
    } catch (err) {
      console.error('Error linking twitter:', err);
      setTwitterError(t.tasks.twitterLinkError);
    } finally {
      setLinkingTwitter(false);
    }
  };

  const handleEditTwitterUsername = async () => {
    const newUsername = editTwitterUsername.trim().replace('@', '');
    if (!newUsername) return;
    setLinkingTwitter(true);
    setTwitterError('');
    setTwitterSuccess('');
    try {
      const { error } = await supabase
        .from('twitter_links')
        .update({ twitter_username: newUsername })
        .eq('user_id', profile?.id);
      if (error) throw error;
      setTwitterSuccess('Twitter actualizado a @' + newUsername);
      setEditingTwitter(false);
      setEditTwitterUsername('');
      await loadTwitterStatus();
    } catch (err) {
      console.error('Error updating twitter:', err);
      setTwitterError('Error al actualizar el nombre de Twitter');
    } finally {
      setLinkingTwitter(false);
    }
  };

  // Traduce errores técnicos de validación de tweets a mensajes claros para el usuario
  const translateTweetError = (error: string | undefined): string => {
    if (!error) return '';
    const e = error.toLowerCase();
    if (e.includes('does not match linked account'))
      return '❌ Enviaste el link del tweet oficial, no el tuyo. Debes enviar el link de TU propio tweet (Quote Tweet).';
    if (e.includes('does not quote') || e.includes('not quote the mission'))
      return '❌ Tu tweet no cita (Quote Tweet) el tweet de la misión. Debes hacer "Citar Tweet" del tweet original, no un retweet normal ni un tweet suelto.';
    if (e.includes('missing hashtag'))
      return '❌ A tu tweet le faltan hashtags obligatorios (#FalcoX #Xnova #ogames). Edítalo o crea uno nuevo con todos los hashtags.';
    if (e.includes('already submitted') || e.includes('already exists'))
      return '⚠️ Ya enviaste una acción para esta misión. No puedes enviarla dos veces.';
    if (e.includes('invalid tweet url') || e.includes('invalid url'))
      return '❌ La URL no es válida. Asegúrate de pegar el link completo de tu tweet (ej: https://x.com/tu_usuario/status/123...).';
    if (e.includes('tweet not found'))
      return '❌ No se encontró el tweet. Verifica que el link sea correcto y que el tweet no haya sido eliminado.';
    if (e.includes('protected') || e.includes('private'))
      return '❌ Tu cuenta de Twitter/X es privada. Debes tener el perfil público para que podamos verificar tu tweet.';
    return error; // Si no coincide con ningún patrón conocido, mostrar el original
  };

  const handleSubmitAction = async (missionId: string, actionType: 'quote_tweet' | 'comment') => {
    const key = `${missionId}_${actionType}`;
    const url = actionUrls[key];
    if (!url?.trim()) return;

    setSubmittingAction(key);
    setTwitterError('');
    setTwitterSuccess('');

    try {
      const { data, error: rpcError } = await supabase.rpc('submit_twitter_action', {
        p_mission_id: missionId,
        p_user_tweet_url: url.trim(),
        p_action_type: actionType,
      });
      if (rpcError) throw rpcError;

      if (data?.success) {
        setTwitterSuccess(t.tasks.actionSubmitted);
        setActionUrls((prev) => ({ ...prev, [key]: '' }));
        await loadTwitterMissions();
      } else {
        setTwitterError(translateTweetError(data?.error) || t.tasks.twitterErrorSubmit);
      }
    } catch (err) {
      console.error('Error submitting action:', err);
      setTwitterError(t.tasks.twitterErrorSubmit);
    } finally {
      setSubmittingAction(null);
    }
  };

  // ============ Admin Batch Validation ============
  const handleBatchValidateAll = async () => {
    setBatchValidating(true);
    setBatchResult(null);
    setTwitterError('');
    setTwitterSuccess('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setTwitterError('No session found');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-all-twitter-actions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      if (data.success) {
        setBatchResult({
          validated: data.validated,
          failed: data.failed,
          skipped: data.skipped || 0,
          total: data.total,
          message: data.message,
        });
        setTwitterSuccess(data.message);
        // Refresh data
        await loadTwitterMissions();
        await loadTwitterStatus();
        await loadTwitterRanking();
      } else {
        setTwitterError(data.error || 'Error en validación batch');
      }
    } catch (err) {
      console.error('Error batch validating:', err);
      setTwitterError('Error de conexión al validar');
    } finally {
      setBatchValidating(false);
    }
  };

  // ============ End Twitter/X Functions ============

  const generateLinkCode = async () => {
    setGeneratingCode(true);
    setError('');

    try {
      const { data, error: rpcError } = await supabase.rpc('generate_telegram_link_code');

      if (rpcError) throw rpcError;

      if (data?.success) {
        if (data.already_linked) {
          setTaskStatus((prev) =>
            prev ? { ...prev, telegram_linked: true, telegram_username: data.telegram_username } : null
          );
        } else {
          setLinkCode(data.code);
        }
      } else {
        setError(data?.error || t.tasks.errorGeneratingCode);
      }
    } catch (err) {
      console.error('Error generating code:', err);
      setError(t.tasks.errorGeneratingCode);
    } finally {
      setGeneratingCode(false);
    }
  };

  const copyCode = async () => {
    if (!linkCode) return;
    try {
      await navigator.clipboard.writeText(linkCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = linkCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const verifyMembership = async () => {
    setVerifying(true);
    setError('');
    setVerifyMessage('');

    try {
      // Buscar telegram_id del usuario
      const { data: linkData } = await supabase
        .from('telegram_links')
        .select('telegram_id')
        .eq('user_id', profile?.id)
        .maybeSingle();

      if (!linkData?.telegram_id) {
        setError(t.tasks.notInGroup);
        setVerifying(false);
        return;
      }

      // Llamar RPC directo (sin edge function)
      const { data, error: rpcError } = await supabase.rpc('process_telegram_join', {
        p_telegram_id: linkData.telegram_id,
      });

      if (rpcError) {
        setError(rpcError.message);
      } else if (data?.success) {
        if (data.reward_given && data.amount > 0) {
          setVerifyMessage(`${t.tasks.verifiedSuccess} +${data.amount} TUNG!`);
        } else {
          setVerifyMessage(data.message || t.tasks.verifiedAlready);
        }
        await loadTaskStatus();
        await refreshProfile();
      } else {
        setError(data?.error || t.tasks.errorVerifying);
      }
    } catch (err) {
      console.error('Error verifying:', err);
      setError(t.tasks.errorVerifying);
    } finally {
      setVerifying(false);
    }
  };

  const getTaskStatusBadge = () => {
    if (!taskStatus) return null;

    if (taskStatus.task_completed && taskStatus.is_member && !taskStatus.reward_revoked) {
      return (
        <span className="flex items-center gap-1 px-3 py-1 bg-cyber-green/20 text-cyber-green rounded-full text-sm">
          <CheckCircle2 className="w-4 h-4" />
          {t.tasks.completed}
        </span>
      );
    }

    if (taskStatus.reward_revoked) {
      return (
        <span className="flex items-center gap-1 px-3 py-1 bg-cyber-red/20 text-cyber-red rounded-full text-sm">
          <XCircle className="w-4 h-4" />
          {t.tasks.rewardRevoked}
        </span>
      );
    }

    if (taskStatus.task_completed && !taskStatus.is_member) {
      return (
        <span className="flex items-center gap-1 px-3 py-1 bg-cyber-orange/20 text-cyber-orange rounded-full text-sm">
          <AlertCircle className="w-4 h-4" />
          {t.tasks.leftGroup}
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1 px-3 py-1 bg-space-600 text-gray-400 rounded-full text-sm">
        {t.tasks.pending}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-cyber-yellow/30 border-t-cyber-yellow rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <ClipboardList className="w-8 h-8 text-cyber-yellow" />
          {t.tasks.title}
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-space-700/50 rounded-lg">
            <Coins className="w-5 h-5 text-cyber-orange" />
            <span className="text-gray-400">TUNG:</span>
            <span className="font-orbitron text-cyber-orange">
              {formatNumber(Number(profile?.tung_balance) || 0)}
            </span>
          </div>
          <button
            onClick={() => {
              loadTaskStatus();
              refreshProfile();
            }}
            className="p-2 bg-space-700/50 rounded-lg hover:bg-space-600 transition-colors"
            title={t.tasks.refresh}
          >
            <RefreshCw className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-cyber-red/20 border border-cyber-red/50 rounded-lg">
          <AlertCircle className="w-5 h-5 text-cyber-red" />
          <span className="text-cyber-red">{error}</span>
        </div>
      )}

      <div className="card-glass p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-500/20 rounded-xl">
            <MessageCircle className="w-8 h-8 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <h3 className="font-orbitron text-lg text-white">{t.tasks.joinTelegram}</h3>
              {getTaskStatusBadge()}
            </div>
            <p className="text-gray-400 mb-4">{t.tasks.joinTelegramDesc}</p>

            {(taskStatus?.reward_amount ?? 0) > 0 && (
              <div className="flex items-center gap-2 mb-6 p-3 bg-cyber-yellow/10 border border-cyber-yellow/30 rounded-lg">
                <Gift className="w-5 h-5 text-cyber-yellow" />
                <span className="text-cyber-yellow font-semibold">
                  {t.tasks.reward}: {taskStatus?.reward_amount} TUNG
                </span>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    taskStatus?.telegram_linked
                      ? 'bg-cyber-green/20 text-cyber-green'
                      : 'bg-space-600 text-gray-500'
                  }`}
                >
                  {taskStatus?.telegram_linked ? <Check className="w-4 h-4" /> : '1'}
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">{t.tasks.step1Title}</p>
                  <p className="text-sm text-gray-400">{t.tasks.step1Desc}</p>
                </div>
              </div>

              {!taskStatus?.telegram_linked && (
                <div className="ml-11 space-y-3">
                  {!linkCode ? (
                    <button
                      onClick={generateLinkCode}
                      disabled={generatingCode}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                    >
                      {generatingCode ? (
                        <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                      {t.tasks.generateCode}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-4 py-2 bg-space-700 rounded-lg font-mono text-lg text-cyber-yellow tracking-wider">
                          {linkCode}
                        </div>
                        <button
                          onClick={copyCode}
                          className="p-2 bg-space-600 rounded-lg hover:bg-space-500 transition-colors"
                        >
                          {copied ? (
                            <Check className="w-5 h-5 text-cyber-green" />
                          ) : (
                            <Copy className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </div>
                      <p className="text-sm text-gray-500">{t.tasks.codeExpires}</p>
                    </div>
                  )}

                  <a
                    href="https://t.me/TUNGuniverseBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {t.tasks.openBot}
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <p className="text-sm text-gray-500">
                    {t.tasks.sendCodeToBot}: <code className="text-blue-400">/link {linkCode || 'CODE'}</code>
                  </p>
                </div>
              )}

              {taskStatus?.telegram_linked && (
                <div className="ml-11 p-3 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
                  <p className="text-cyber-green text-sm">
                    {t.tasks.linkedAs}: @{taskStatus.telegram_username}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    taskStatus?.task_completed && taskStatus?.is_member
                      ? 'bg-cyber-green/20 text-cyber-green'
                      : 'bg-space-600 text-gray-500'
                  }`}
                >
                  {taskStatus?.task_completed && taskStatus?.is_member ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    '2'
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">{t.tasks.step2Title}</p>
                  <p className="text-sm text-gray-400">{t.tasks.step2Desc}</p>
                </div>
              </div>

              {taskStatus?.telegram_linked && !taskStatus?.is_member && telegramConfig?.group_invite_link && (
                <div className="ml-11 space-y-3">
                  <a
                    href={telegramConfig.group_invite_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-cyber-yellow text-space-900 rounded-lg hover:bg-cyber-yellow/90 transition-colors font-semibold"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {t.tasks.joinGroup}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={verifyMembership}
                    disabled={verifying}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                  >
                    {verifying ? (
                      <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {t.tasks.verifyMembership}
                  </button>
                </div>
              )}

              {taskStatus?.telegram_linked && taskStatus?.is_member && !taskStatus?.task_completed && (
                <div className="ml-11">
                  <button
                    onClick={verifyMembership}
                    disabled={verifying}
                    className="flex items-center gap-2 px-4 py-2 bg-cyber-green/20 text-cyber-green rounded-lg hover:bg-cyber-green/30 transition-colors disabled:opacity-50"
                  >
                    {verifying ? (
                      <div className="w-4 h-4 border-2 border-cyber-green/30 border-t-cyber-green rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    {t.tasks.claimReward}
                  </button>
                </div>
              )}

              {verifyMessage && (
                <div className="ml-11 p-3 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
                  <p className="text-cyber-green text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {verifyMessage}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card-glass p-6">
        <h3 className="font-orbitron text-lg text-white mb-4">{t.tasks.importantNotes}</h3>
        <ul className="space-y-2 text-sm text-gray-400">
          <li className="flex items-start gap-2">
            <span className="text-cyber-yellow mt-1">*</span>
            {t.tasks.note1}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyber-yellow mt-1">*</span>
            {t.tasks.note2}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyber-yellow mt-1">*</span>
            {t.tasks.note3}
          </li>
        </ul>
      </div>

      {/* ============ Twitter/X Social Tasks Section ============ */}
      {SHOW_TWITTER_TASKS && (
      <div className="card-glass p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-sky-500/20 rounded-xl">
            <Twitter className="w-8 h-8 text-sky-400" />
          </div>
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <h3 className="font-orbitron text-lg text-white">{t.tasks.twitterTitle}</h3>
              {twitterStatus?.twitter_linked && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 px-3 py-1 bg-sky-500/20 text-sky-400 rounded-full text-sm">
                    <Trophy className="w-4 h-4" />
                    {twitterStatus.total_points} {t.tasks.pointsLabel}
                  </span>
                </div>
              )}
            </div>
            <p className="text-gray-400 mb-4">{t.tasks.twitterDesc}</p>

            <div className="flex items-center gap-2 mb-6 p-3 bg-cyber-yellow/10 border border-cyber-yellow/30 rounded-lg">
              <Gift className="w-5 h-5 text-cyber-yellow" />
              <span className="text-cyber-yellow font-semibold">
                {t.tasks.twitterLinkReward}: {twitterStatus?.link_reward_fxu || 20} TUNG
              </span>
            </div>

            {/* Twitter Error/Success Messages */}
            {twitterError && (
              <div className="flex items-center gap-2 p-3 mb-4 bg-cyber-red/20 border border-cyber-red/50 rounded-lg">
                <AlertCircle className="w-4 h-4 text-cyber-red" />
                <span className="text-cyber-red text-sm">{twitterError}</span>
              </div>
            )}
            {twitterSuccess && (
              <div className="flex items-center gap-2 p-3 mb-4 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-cyber-green" />
                <span className="text-cyber-green text-sm">{twitterSuccess}</span>
              </div>
            )}

            {/* Step 1: Link Twitter Account */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  twitterStatus?.twitter_linked ? 'bg-cyber-green/20 text-cyber-green' : 'bg-space-600 text-gray-500'
                }`}>
                  {twitterStatus?.twitter_linked ? <Check className="w-4 h-4" /> : '1'}
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">{t.tasks.linkTwitter}</p>
                  <p className="text-sm text-gray-400">{t.tasks.linkTwitterDesc}</p>
                </div>
              </div>

              {!twitterStatus?.twitter_linked && (
                <div className="ml-11 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={twitterUsername}
                      onChange={(e) => setTwitterUsername(e.target.value)}
                      placeholder={t.tasks.twitterUsername}
                      className="flex-1 px-4 py-2 bg-space-700 border border-space-500 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-sky-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleLinkTwitter()}
                    />
                    <button
                      onClick={handleLinkTwitter}
                      disabled={linkingTwitter || !twitterUsername.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-sky-500/20 text-sky-400 rounded-lg hover:bg-sky-500/30 transition-colors disabled:opacity-50"
                    >
                      {linkingTwitter ? (
                        <div className="w-4 h-4 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                      {t.tasks.linkAccount}
                    </button>
                  </div>
                </div>
              )}

              {twitterStatus?.twitter_linked && (
                <div className="ml-11 p-3 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
                  {!editingTwitter ? (
                    <div className="flex items-center justify-between">
                      <p className="text-cyber-green text-sm">
                        {t.tasks.twitterLinkedAs}: @{twitterStatus.twitter_username}
                      </p>
                      <button
                        onClick={() => {
                          setEditingTwitter(true);
                          setEditTwitterUsername(twitterStatus.twitter_username || '');
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-sky-400 bg-space-700/50 rounded transition-colors"
                        title="Corregir nombre de Twitter"
                      >
                        <Pencil className="w-3 h-3" />
                        Corregir
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400">Corregir tu nombre de Twitter/X:</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editTwitterUsername}
                          onChange={(e) => setEditTwitterUsername(e.target.value)}
                          placeholder="@tu_usuario"
                          className="flex-1 px-3 py-1.5 bg-space-700 border border-space-500 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-sky-500"
                          onKeyDown={(e) => e.key === 'Enter' && handleEditTwitterUsername()}
                        />
                        <button
                          onClick={handleEditTwitterUsername}
                          disabled={linkingTwitter || !editTwitterUsername.trim()}
                          className="px-3 py-1.5 bg-sky-500/20 text-sky-400 rounded-lg hover:bg-sky-500/30 transition-colors text-sm disabled:opacity-50"
                        >
                          {linkingTwitter ? (
                            <div className="w-4 h-4 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
                          ) : (
                            'Guardar'
                          )}
                        </button>
                        <button
                          onClick={() => setEditingTwitter(false)}
                          className="px-3 py-1.5 bg-space-700 text-gray-400 rounded-lg hover:bg-space-600 transition-colors text-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Missions & Ranking Tabs */}
              <div className="flex items-center gap-3 mt-6">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  twitterStatus?.total_actions && twitterStatus.total_actions > 0
                    ? 'bg-cyber-green/20 text-cyber-green' : 'bg-space-600 text-gray-500'
                }`}>
                  {twitterStatus?.total_actions && twitterStatus.total_actions > 0 ? <Check className="w-4 h-4" /> : '2'}
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">{t.tasks.twitterMissions}</p>
                  <p className="text-sm text-gray-400">{t.tasks.twitterMissionsDesc}</p>
                </div>
              </div>
            </div>

            {/* Tabs: Missions / Ranking */}
            <div className="mt-6 border-t border-space-600 pt-4">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setActiveTab('missions')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                    activeTab === 'missions'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/50'
                      : 'bg-space-700/50 text-gray-400 hover:bg-space-600'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {t.tasks.twitterMissions}
                </button>
                <button
                  onClick={() => setActiveTab('ranking')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                    activeTab === 'ranking'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/50'
                      : 'bg-space-700/50 text-gray-400 hover:bg-space-600'
                  }`}
                >
                  <Trophy className="w-4 h-4" />
                  {t.tasks.socialRanking}
                </button>
              </div>

              {/* Missions Tab */}
              {activeTab === 'missions' && (
                <div className="space-y-4">
                  {/* Required hashtags - PROMINENT WARNING */}
                  <div className="flex items-start gap-3">
                  <div className="flex-1 p-4 bg-cyber-yellow/10 border-2 border-cyber-yellow/50 rounded-xl">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-cyber-yellow/20 rounded-lg">
                        <AlertCircle className="w-6 h-6 text-cyber-yellow" />
                      </div>
                      <div>
                        <p className="text-cyber-yellow font-orbitron text-sm">{t.tasks.requiredHashtags}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{t.tasks.requiredHashtagsNote}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 ml-12">
                      <span className="px-3 py-1.5 bg-cyber-yellow/20 border border-cyber-yellow/40 rounded-lg text-cyber-yellow font-mono font-bold text-sm">#FalcoX</span>
                      <span className="px-3 py-1.5 bg-cyber-yellow/20 border border-cyber-yellow/40 rounded-lg text-cyber-yellow font-mono font-bold text-sm">#Xnova</span>
                      <span className="px-3 py-1.5 bg-cyber-yellow/20 border border-cyber-yellow/40 rounded-lg text-cyber-yellow font-mono font-bold text-sm">#ogames</span>
                    </div>
                    <p className="text-gray-500 text-xs mt-3 ml-12">{t.tasks.autoMissionsNote}</p>
                  </div>
                  <button
                    onClick={syncTwitterMissions}
                    disabled={syncingMissions}
                    className="flex flex-col items-center gap-1 px-4 py-3 bg-space-700/50 border border-space-600 rounded-xl hover:bg-space-600 transition-colors disabled:opacity-50 shrink-0 min-w-[80px]"
                    title="Buscar misiones nuevas"
                  >
                    {syncingMissions ? (
                      <div className="w-5 h-5 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
                    ) : (
                      <RefreshCw className="w-5 h-5 text-sky-400" />
                    )}
                    <span className="text-xs text-gray-400">
                      {syncingMissions ? 'Buscando...' : 'Sincronizar'}
                    </span>
                    {lastSynced && !syncingMissions && (
                      <span className="text-xs text-gray-600">
                        {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </button>
                  </div>

                  {/* Admin Batch Validation Panel */}
                  {isAdmin && (
                    <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl mb-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-purple-400 font-orbitron text-sm flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Validación Batch (Admin)
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            Valida todas las acciones pendientes contra la API de Twitter en un solo lote.
                          </p>
                        </div>
                        <button
                          onClick={handleBatchValidateAll}
                          disabled={batchValidating}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors disabled:opacity-50 shrink-0"
                        >
                          {batchValidating ? (
                            <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          {batchValidating ? 'Validando...' : 'Validar Todo'}
                        </button>
                      </div>
                      {batchResult && (
                        <div className="mt-3 p-3 bg-space-700/50 rounded-lg">
                          <div className="grid grid-cols-4 gap-3 text-center text-xs">
                            <div>
                              <p className="text-gray-400">Total</p>
                              <p className="font-orbitron text-white">{batchResult.total}</p>
                            </div>
                            <div>
                              <p className="text-gray-400">Validadas</p>
                              <p className="font-orbitron text-cyber-green">{batchResult.validated}</p>
                            </div>
                            <div>
                              <p className="text-gray-400">Fallidas</p>
                              <p className="font-orbitron text-cyber-red">{batchResult.failed}</p>
                            </div>
                            <div>
                              <p className="text-gray-400">Omitidas</p>
                              <p className="font-orbitron text-cyber-orange">{batchResult.skipped}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {twitterMissions.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-6">{t.tasks.twitterNoMissions}</p>
                  ) : (
                    twitterMissions.map((mission) => (
                      <div key={mission.id} className="bg-space-700/50 border border-space-600 rounded-lg p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1">
                            <p className="text-white text-sm font-medium">{mission.description || 'Official Tweet'}</p>
                            <a
                              href={mission.tweet_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400 text-xs hover:underline flex items-center gap-1 mt-1"
                            >
                              {mission.tweet_url}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <span className="text-xs text-gray-500 bg-space-600 px-2 py-1 rounded">
                            {mission.hashtag}
                          </span>
                        </div>

                        {/* Quote Tweet Action */}
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300 flex items-center gap-2">
                              <Shield className="w-3 h-3 text-sky-400" />
                              {t.tasks.quoteTweet} — {twitterStatus?.quote_tweet_points || 10} {t.tasks.pointsLabel}
                            </span>
                            {mission.user_quote_tweet && (
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                mission.user_quote_tweet.validated
                                  ? 'bg-cyber-green/20 text-cyber-green'
                                  : 'bg-cyber-orange/20 text-cyber-orange'
                              }`}>
                                {mission.user_quote_tweet.validated ? t.tasks.actionValidated : t.tasks.actionPending}
                              </span>
                            )}
                          </div>
                          {!mission.user_quote_tweet && twitterStatus?.twitter_linked && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={actionUrls[`${mission.id}_quote_tweet`] || ''}
                                  onChange={(e) => setActionUrls((prev) => ({ ...prev, [`${mission.id}_quote_tweet`]: e.target.value }))}
                                  placeholder={t.tasks.pasteTweetUrl}
                                  className="flex-1 px-3 py-1.5 bg-space-800 border border-space-500 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500"
                                />
                                <button
                                  onClick={() => handleSubmitAction(mission.id, 'quote_tweet')}
                                  disabled={submittingAction === `${mission.id}_quote_tweet` || !actionUrls[`${mission.id}_quote_tweet`]?.trim()}
                                  className="px-3 py-1.5 bg-sky-500/20 text-sky-400 rounded text-sm hover:bg-sky-500/30 transition-colors disabled:opacity-50"
                                >
                                  {submittingAction === `${mission.id}_quote_tweet` ? (
                                    <div className="w-4 h-4 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
                                  ) : t.tasks.submitAction}
                                </button>
                              </div>
                              <p className="text-xs text-cyber-yellow/70">⚠️ #FalcoX #Xnova #ogames</p>
                            </div>
                          )}
                          {mission.user_quote_tweet && !mission.user_quote_tweet.validated && (
                            <span className="text-xs text-cyber-orange/80 italic px-2 py-1">
                              ⏳ Pendiente de revisión diaria
                            </span>
                          )}
                        </div>

                        {/* Comment Action */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300 flex items-center gap-2">
                              <MessageCircle className="w-3 h-3 text-sky-400" />
                              {t.tasks.comment} — {twitterStatus?.comment_points || 5} {t.tasks.pointsLabel}
                            </span>
                            {mission.user_comment && (
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                mission.user_comment.validated
                                  ? 'bg-cyber-green/20 text-cyber-green'
                                  : 'bg-cyber-orange/20 text-cyber-orange'
                              }`}>
                                {mission.user_comment.validated ? t.tasks.actionValidated : t.tasks.actionPending}
                              </span>
                            )}
                          </div>
                          {!mission.user_comment && twitterStatus?.twitter_linked && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={actionUrls[`${mission.id}_comment`] || ''}
                                  onChange={(e) => setActionUrls((prev) => ({ ...prev, [`${mission.id}_comment`]: e.target.value }))}
                                  placeholder={t.tasks.pasteTweetUrl}
                                  className="flex-1 px-3 py-1.5 bg-space-800 border border-space-500 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500"
                                />
                                <button
                                  onClick={() => handleSubmitAction(mission.id, 'comment')}
                                  disabled={submittingAction === `${mission.id}_comment` || !actionUrls[`${mission.id}_comment`]?.trim()}
                                  className="px-3 py-1.5 bg-sky-500/20 text-sky-400 rounded text-sm hover:bg-sky-500/30 transition-colors disabled:opacity-50"
                                >
                                  {submittingAction === `${mission.id}_comment` ? (
                                    <div className="w-4 h-4 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
                                  ) : t.tasks.submitAction}
                                </button>
                              </div>
                              <p className="text-xs text-cyber-yellow/70">⚠️ #FalcoX #Xnova #ogames</p>
                            </div>
                          )}
                          {mission.user_comment && !mission.user_comment.validated && (
                            <span className="text-xs text-cyber-orange/80 italic px-2 py-1">
                              ⏳ Pendiente de revisión diaria
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Ranking Tab */}
              {activeTab === 'ranking' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-400 text-sm">{t.tasks.socialRankingDesc}</p>
                    <span className="text-xs text-gray-500">{twitterRanking.length} participantes</span>
                  </div>
                  {twitterRanking.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-6">{t.tasks.noRankingYet}</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-gray-400 border-b border-space-600">
                              <th className="text-left py-2 px-2">{t.tasks.rankingPosition}</th>
                              <th className="text-left py-2 px-2">{t.tasks.rankingPlayer}</th>
                              <th className="text-left py-2 px-2">{t.tasks.rankingTwitter}</th>
                              <th className="text-right py-2 px-2">{t.tasks.rankingQuoteTweets}</th>
                              <th className="text-right py-2 px-2">{t.tasks.rankingComments}</th>
                              <th className="text-right py-2 px-2">{t.tasks.rankingPoints}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {twitterRanking
                              .slice((rankingPage - 1) * RANKING_PER_PAGE, rankingPage * RANKING_PER_PAGE)
                              .map((entry, idx) => {
                                const globalIdx = (rankingPage - 1) * RANKING_PER_PAGE + idx;
                                return (
                                  <tr
                                    key={entry.user_id}
                                    className={`border-b border-space-700/50 ${
                                      entry.user_id === profile?.id ? 'bg-sky-500/10' : ''
                                    }`}
                                  >
                                    <td className="py-2 px-2">
                                      <span className={`font-orbitron text-sm ${
                                        globalIdx === 0 ? 'text-cyber-yellow' : globalIdx === 1 ? 'text-gray-300' : globalIdx === 2 ? 'text-amber-600' : 'text-gray-500'
                                      }`}>
                                        {globalIdx === 0 ? '🏆' : globalIdx === 1 ? '🥈' : globalIdx === 2 ? '🥉' : `#${globalIdx + 1}`}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2 text-white font-medium">{entry.username}</td>
                                    <td className="py-2 px-2 text-sky-400">@{entry.twitter_username}</td>
                                    <td className="py-2 px-2 text-right text-gray-300">{entry.quote_tweets}</td>
                                    <td className="py-2 px-2 text-right text-gray-300">{entry.comments}</td>
                                    <td className="py-2 px-2 text-right font-orbitron text-sky-400 font-bold">{entry.total_points}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {twitterRanking.length > RANKING_PER_PAGE && (
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-space-700">
                          <span className="text-xs text-gray-500">
                            {(rankingPage - 1) * RANKING_PER_PAGE + 1}-{Math.min(rankingPage * RANKING_PER_PAGE, twitterRanking.length)} de {twitterRanking.length}
                          </span>
                          <div className="flex gap-1">
                            {Array.from({ length: Math.ceil(twitterRanking.length / RANKING_PER_PAGE) }, (_, i) => (
                              <button
                                key={i + 1}
                                onClick={() => setRankingPage(i + 1)}
                                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                  rankingPage === i + 1
                                    ? 'bg-sky-500 text-white'
                                    : 'bg-space-700 text-gray-400 hover:bg-space-600 hover:text-white'
                                }`}
                              >
                                {i + 1}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
