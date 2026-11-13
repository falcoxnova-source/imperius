import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Mail,
  Send,
  Trash2,
  User,
  X,
  AlertCircle,
  Eye,
  Swords,
  Compass,
  Reply,
  CheckCheck,
  Users,
  Inbox,
  SendHorizontal,
  Package,
  Shield,
  Rocket,
  Sparkles,
  Target,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Trophy,
  Skull,
  Moon,
  Zap,
  Flame,
  Coins,
  Hammer,
  Megaphone,
  Radar,
  Gift,
  Recycle,
  Ban,
  Crown,
  Percent,
  Globe,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PublicChat } from '../../components/game/PublicChat';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { formatRelativeDate, formatNumber } from '../../lib/utils';
import type { Message, Profile } from '../../types/game';
import { useI18n, translatePlanetName } from '../../lib/i18n';

type MessageFilter = 'all' | 'unread' | 'player' | 'system' | 'battle' | 'espionage' | 'expedition' | 'alliance';
type MessageView = 'inbox' | 'sent' | 'public';

const MESSAGES_PER_PAGE = 10;

interface EspionageReport {
  planet_name: string;
  target_type?: string;
  coordinates: string;
  resources: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
  buildings: Array<{ name: string; level: number }>;
  ships: Array<{ name: string; quantity: number }>;
  defenses: Array<{ name: string; quantity: number }>;
  technologies: Array<{ name: string; level: number }>;
  allied_fleets?: Array<{ owner: string; ships: Array<{ name: string; quantity: number }> }>;
  visibility_level?: number;
  tech_difference?: number;
  probe_count?: number;
}

interface BattleUnit {
  name: string;
  code?: string;
  initial: number;
  lost: number;
  remaining?: number;
}

interface BattleRound {
  round: number;
  attacker_remaining: number;
  defender_remaining: number;
}

interface BattleReport {
  version?: number;
  perspective?: 'attacker' | 'defender';
  battle_type?: string;
  attacker: string;
  defender: string;
  planet_name?: string;
  target_type?: string;
  attacker_origin?: string;
  coordinates: string;
  result: 'attacker_won' | 'defender_won' | 'draw';
  rounds: number;
  rounds_data?: BattleRound[];
  attacker_losses: { metal: number; crystal: number };
  defender_losses: { metal: number; crystal: number };
  debris: { metal: number; crystal: number };
  loot: { metal: number; crystal: number; deuterium: number };
  attacker_ships?: BattleUnit[];
  defender_ships?: BattleUnit[];
  defender_defenses?: BattleUnit[];
  moon?: {
    moon_created?: boolean;
    moon_chance?: number;
    moon_diameter?: number | null;
    total_debris?: number;
    reason?: string;
  };
  building_damage?: { damaged?: boolean; building_name?: string; new_level?: number } | null;
  heroes?: Array<{
    side: 'attacker' | 'defender';
    owner?: string;
    name?: string;
    level?: number;
    hp_before?: number;
    hp_after?: number;
    hp_max?: number;
    destroyed?: boolean;
    xp_gained?: number;
  }>;
}

interface ExpeditionReport {
  result_type: 'resources' | 'ships' | 'dark_matter' | 'pirates' | 'aliens' | 'nothing' | 'black_hole' | 'ancient_tech';
  resources?: { metal: number; crystal: number; deuterium: number };
  ships?: Array<{ name: string; quantity: number }>;
  dark_matter?: number;
  message: string;
}

export function MessagesPage() {
  const { t } = useI18n();
  const { profile } = useAuthStore();
  const { fetchPlanets } = useGameStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<(Message & { sender?: Profile; recipient?: Profile })[]>([]);
  const [filter, setFilter] = useState<MessageFilter>('all');
  const [view, setView] = useState<MessageView>('inbox');
  const [selectedMessage, setSelectedMessage] = useState<(Message & { sender?: Profile }) | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<{ username: string; subject: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const toParam = searchParams.get('to');
    if (toParam) {
      setReplyTo({ username: toParam, subject: '' });
      setShowCompose(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (profile) {
      loadMessages();
      setCurrentPage(1);
    }
  }, [profile, filter, view]);

  const loadMessages = async () => {
    if (!profile) return;
    if (view === 'public') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let query;

      if (view === 'inbox') {
        query = supabase
          .from('messages')
          .select('*, sender:profiles!sender_id(*)')
          .eq('recipient_id', profile.id)
          .order('created_at', { ascending: false });

        if (filter === 'unread') {
          query = query.eq('is_read', false);
        } else if (filter !== 'all') {
          query = query.eq('message_type', filter);
        }
      } else {
        query = supabase
          .from('messages')
          .select('*, recipient:profiles!recipient_id(*)')
          .eq('sender_id', profile.id)
          .eq('message_type', 'player')
          .order('created_at', { ascending: false });
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    if (!profile) return;
    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('recipient_id', profile.id)
        .eq('is_read', false);

      setMessages((prev) => prev.map((m) => ({ ...m, is_read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const deleteAllMessages = async () => {
    if (!profile) return;
    if (!confirm(t.messages.confirmDeleteAll)) return;

    try {
      const mode = view === 'inbox' ? 'inbox' : 'sent';
      const msgType = mode === 'sent'
        ? 'player'
        : (filter !== 'all' && filter !== 'unread' ? filter : null);
      await supabase.rpc('secure_delete_all_my_messages', {
        p_mode: mode,
        p_message_type: msgType,
      });

      setMessages([]);
      setSelectedMessage(null);
    } catch (error) {
      console.error('Error deleting messages:', error);
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      await supabase.rpc('secure_mark_message_read', { p_message_id: messageId });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_read: true } : m))
      );
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await supabase.rpc('secure_delete_message', { p_message_id: messageId });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null);
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const openMessage = async (message: Message & { sender?: Profile }) => {
    setSelectedMessage(message);
    if (!message.is_read && view === 'inbox') {
      markAsRead(message.id);
    }

    // Detectar creación de luna y refrescar planetas
    if (message.message_type === 'battle' && message.body) {
      const hasNewMoon = message.body.includes('han formado una luna') || 
                         message.body.includes('Una luna de') || 
                         message.body.includes('moon has formed');
      if (hasNewMoon && profile) {
        await fetchPlanets(profile.id);
        alert('🌙 ¡Nueva Castra de Diana detectada! Selecciónala desde el selector de ciudades para construir');
      }
    }
  };

  const handleReply = (message: Message & { sender?: Profile }) => {
    if (message.sender?.username) {
      const reSubject = message.subject.startsWith('Re: ') ? message.subject : `Re: ${message.subject}`;
      setReplyTo({ username: message.sender.username, subject: reSubject });
      setShowCompose(true);
    }
  };

  const unreadCount = messages.filter((m) => !m.is_read).length;

  const totalPages = Math.ceil(messages.length / MESSAGES_PER_PAGE);
  const paginatedMessages = messages.slice(
    (currentPage - 1) * MESSAGES_PER_PAGE,
    currentPage * MESSAGES_PER_PAGE
  );

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <Mail className="w-8 h-8 text-cyber-blue" />
          {t.messages.title}
          {view === 'inbox' && unreadCount > 0 && (
            <span className="px-2 py-1 bg-cyber-red text-white text-sm rounded-full">
              {unreadCount}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {view === 'inbox' && unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-3 py-2 bg-space-700 hover:bg-space-600 text-gray-300 rounded-lg text-sm flex items-center gap-2"
            >
              <CheckCheck className="w-4 h-4" />
              {t.messages.markAllRead}
            </button>
          )}
          {view !== 'public' && messages.length > 0 && (
            <button
              onClick={deleteAllMessages}
              className="px-3 py-2 bg-cyber-red/20 hover:bg-cyber-red/30 text-cyber-red rounded-lg text-sm flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {t.messages.deleteAll}
            </button>
          )}
          <button
            onClick={() => {
              setReplyTo(null);
              setShowCompose(true);
            }}
            className="btn-cyber flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {t.messages.newMessage}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 border-b border-space-700 pb-4 overflow-x-auto">
        <button
          onClick={() => { setView('inbox'); setFilter('all'); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
            view === 'inbox' ? 'bg-cyber-blue text-white' : 'bg-space-700 text-gray-400 hover:bg-space-600'
          }`}
        >
          <Inbox className="w-5 h-5" />
          {t.messages.inbox}
        </button>
        <button
          onClick={() => { setView('sent'); setFilter('all'); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
            view === 'sent' ? 'bg-cyber-blue text-white' : 'bg-space-700 text-gray-400 hover:bg-space-600'
          }`}
        >
          <SendHorizontal className="w-5 h-5" />
          {t.messages.sent}
        </button>
        <button
          onClick={() => { setView('public'); setFilter('all'); setSelectedMessage(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap ${
            view === 'public' ? 'bg-cyber-blue text-white' : 'bg-space-700 text-gray-400 hover:bg-space-600'
          }`}
        >
          <Globe className="w-5 h-5" />
          Público
        </button>
      </div>

      {view === 'inbox' && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[
            { key: 'all', label: t.common.all },
            { key: 'unread', label: t.messages.unread },
            { key: 'player', label: t.messages.player },
            { key: 'alliance', label: t.messages.allianceMessages },
            { key: 'system', label: t.messages.system },
            { key: 'battle', label: t.messages.battle },
            { key: 'espionage', label: t.messages.espionage },
            { key: 'expedition', label: t.messages.expedition },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as MessageFilter)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap ${
                filter === f.key
                  ? 'bg-cyber-blue text-white'
                  : 'bg-space-700 text-gray-400 hover:bg-space-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {view === 'public' ? (
        <PublicChat />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="card-glass overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
              </div>
            ) : messages.length > 0 ? (
              <div className="divide-y divide-space-700">
                {paginatedMessages.map((message) => (
                  <div
                    key={message.id}
                    onClick={() => openMessage(message)}
                    className={`p-4 cursor-pointer transition-all ${
                      selectedMessage?.id === message.id
                        ? 'bg-cyber-blue/20'
                        : 'hover:bg-space-700/50'
                    } ${view === 'inbox' && !message.is_read ? 'border-l-4 border-cyber-blue' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          message.message_type === 'system'
                            ? 'bg-cyber-orange/20 text-cyber-orange'
                            : message.message_type === 'battle'
                            ? 'bg-cyber-red/20 text-cyber-red'
                            : message.message_type === 'espionage'
                            ? 'bg-cyber-blue/20 text-cyber-blue'
                            : message.message_type === 'expedition'
                            ? 'bg-cyber-green/20 text-cyber-green'
                            : message.message_type === 'alliance'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : message.message_type === 'fleet_warning'
                            ? 'bg-red-500/20 text-red-400'
                            : message.message_type === 'broadcast'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-space-600 text-gray-400'
                        }`}
                      >
                        {message.message_type === 'system' ? (
                          <AlertCircle className="w-5 h-5" />
                        ) : message.message_type === 'battle' ? (
                          <Swords className="w-5 h-5" />
                        ) : message.message_type === 'espionage' ? (
                          <Eye className="w-5 h-5" />
                        ) : message.message_type === 'expedition' ? (
                          <Compass className="w-5 h-5" />
                        ) : message.message_type === 'alliance' ? (
                          <Users className="w-5 h-5" />
                        ) : message.message_type === 'fleet_warning' ? (
                          <Radar className="w-5 h-5 animate-pulse" />
                        ) : message.message_type === 'broadcast' ? (
                          <Megaphone className="w-5 h-5" />
                        ) : (
                          <User className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-400 truncate">
                            {view === 'inbox'
                              ? message.sender?.username || t.messages.system
                              : `${t.messages.to}: ${message.recipient?.username || t.common.unknown}`}
                          </span>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {formatRelativeDate(message.created_at)}
                          </span>
                        </div>
                        <p
                          className={`font-semibold truncate ${
                            view === 'inbox' && !message.is_read ? 'text-white' : 'text-gray-400'
                          }`}
                        >
                          {message.subject}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Mail className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t.messages.noMessages}</p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-space-700">
                <span className="text-sm text-gray-400">
                  {((currentPage - 1) * MESSAGES_PER_PAGE) + 1}-{Math.min(currentPage * MESSAGES_PER_PAGE, messages.length)} / {messages.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg bg-space-700 hover:bg-space-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
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
                        onClick={() => goToPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
                          currentPage === pageNum
                            ? 'bg-cyber-blue text-white'
                            : 'bg-space-700 text-gray-400 hover:bg-space-600'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg bg-space-700 hover:bg-space-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedMessage ? (
            <div className="card-glass p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="font-orbitron text-xl text-white mb-2">
                    {selectedMessage.subject}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span>
                      {view === 'inbox'
                        ? `${t.messages.from}: ${selectedMessage.sender?.username || t.messages.system}`
                        : `${t.messages.to}: ${(selectedMessage as Message & { recipient?: Profile }).recipient?.username || t.common.unknown}`}
                    </span>
                    <span>{formatRelativeDate(selectedMessage.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {view === 'inbox' && selectedMessage.message_type === 'player' && selectedMessage.sender?.username && (
                    <button
                      onClick={() => handleReply(selectedMessage)}
                      className="p-2 bg-cyber-blue/20 rounded-lg hover:bg-cyber-blue/30 transition-colors"
                      title={t.messages.reply}
                    >
                      <Reply className="w-5 h-5 text-cyber-blue" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteMessage(selectedMessage.id)}
                    className="p-2 bg-cyber-red/20 rounded-lg hover:bg-cyber-red/30 transition-colors"
                    title={t.common.delete}
                  >
                    <Trash2 className="w-5 h-5 text-cyber-red" />
                  </button>
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="p-2 bg-space-700 rounded-lg hover:bg-space-600 transition-colors"
                    title={t.common.close}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="prose prose-invert max-w-none">
                {selectedMessage.message_type === 'espionage' ? (
                  <EspionageReportView body={selectedMessage.body} />
                ) : selectedMessage.message_type === 'battle' ? (
                  <BattleReportView body={selectedMessage.body} />
                ) : selectedMessage.message_type === 'expedition' ? (
                  <ExpeditionReportView body={selectedMessage.body} />
                ) : selectedMessage.message_type === 'fleet_warning' ? (
                  <FleetWarningView body={selectedMessage.body} />
                ) : selectedMessage.message_type === 'broadcast' ? (
                  <BroadcastView body={selectedMessage.body} />
                ) : selectedMessage.message_type === 'alliance' ? (
                  <AllianceNoticeView subject={selectedMessage.subject} body={selectedMessage.body} />
                ) : selectedMessage.message_type === 'system' ? (
                  <SystemNoticeView subject={selectedMessage.subject} body={selectedMessage.body} />
                ) : (
                  <p className="text-gray-300 whitespace-pre-wrap">{selectedMessage.body}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="card-glass p-12 text-center">
              <Mail className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <p className="text-gray-400">{t.messages.selectMessage}</p>
            </div>
          )}
        </div>
      </div>
      )}

      {showCompose && (
        <ComposeModal
          onClose={() => {
            setShowCompose(false);
            setReplyTo(null);
          }}
          onSent={() => {
            setShowCompose(false);
            setReplyTo(null);
            loadMessages();
          }}
          initialRecipient={replyTo?.username}
          initialSubject={replyTo?.subject}
        />
      )}
    </div>
  );
}

function EspionageReportView({ body }: { body: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  let report: EspionageReport | null = null;

  try {
    report = JSON.parse(body);
  } catch {
    return <p className="text-gray-300 whitespace-pre-wrap">{body}</p>;
  }

  if (!report) {
    return <p className="text-gray-300 whitespace-pre-wrap">{body}</p>;
  }

  const goToGalaxy = () => {
    const m = report?.coordinates?.match(/(\d+):(\d+):(\d+)/);
    if (m) navigate(`/game/galaxy?galaxy=${m[1]}&system=${m[2]}`);
  };

  // Abre el simulador de combate con los datos de este informe ya cargados
  // en el lado del defensor (naves, defensas, tecnologias y recursos).
  // Si se entra al simulador directamente, los campos siguen vacios.
  const reportData = report;
  const goToSimulator = () => {
    navigate('/game/combat-simulator', { state: { espionage: reportData } });
  };

  // Nivel de visibilidad del informe (1..5). Depende de tu Tecnologia de Espionaje
  // frente a la del oponente: 1 = solo recursos, 2 = +flota, 3 = +defensas,
  // 4 = +edificios, 5 = +tecnologias.
  const visibility = report.visibility_level ?? 5;
  const shipsVisible = visibility >= 2;
  const defensesVisible = visibility >= 3;
  const buildingsVisible = visibility >= 4;
  const techsVisible = visibility >= 5;

  const missingSections = [
    !shipsVisible && 'el ejército',
    !defensesVisible && 'las defensas',
    !buildingsVisible && 'los edificios',
    !techsVisible && 'las tecnologias',
  ].filter(Boolean) as string[];

  const missingText =
    missingSections.length > 1
      ? `${missingSections.slice(0, -1).join(', ')} y ${missingSections[missingSections.length - 1]}`
      : missingSections[0];

  const HiddenSection = ({ label }: { label: string }) => (
    <div className="bg-space-800/60 border border-dashed border-red-500/30 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
        <EyeOff className="w-4 h-4 text-red-400" />
        {label}
      </h4>
      <p className="text-xs text-red-300/90">
        Datos cifrados. Tu Tecnologia de Espionaje no alcanza para descifrar esta seccion.
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-cyber-blue">
        <Eye className="w-5 h-5" />
        <span className="font-orbitron">
          {report.target_type === 'moon' && '🌙 '}{report.planet_name}{report.target_type === 'moon' && ' (Castra de Diana)'}{' '}
          <button
            type="button"
            onClick={goToGalaxy}
            title="Ver en continente"
            className="font-orbitron text-cyber-blue hover:text-white underline decoration-dotted underline-offset-2 transition-colors cursor-pointer"
          >
            {report.coordinates}
          </button>
        </span>
      </div>

      {shipsVisible && (
        <button
          type="button"
          onClick={goToSimulator}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-600/80 to-orange-600/80 hover:from-red-500 hover:to-orange-500 border border-red-500/40 text-white text-sm font-orbitron transition-colors"
        >
          <Swords className="w-4 h-4" />
          Simular batalla con estos datos
        </button>
      )}

      {missingSections.length > 0 && (
        <div
          className={`rounded-lg p-4 border ${
            shipsVisible
              ? 'bg-amber-900/25 border-amber-500/40'
              : 'bg-red-900/30 border-red-500/50'
          }`}
        >
          <h4
            className={`text-sm font-orbitron mb-2 flex items-center gap-2 ${
              shipsVisible ? 'text-amber-300' : 'text-red-300'
            }`}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Informe incompleto
          </h4>
          <p className="text-xs text-gray-200 leading-relaxed">
            No se pudo recopilar toda la informacion: tus sondas no lograron descifrar{' '}
            <span className="font-semibold text-white">{missingText}</span> porque el oponente tiene
            la <span className="font-semibold text-white">Tecnologia de Espionaje</span> a un nivel
            mas avanzado que el tuyo.
          </p>
          {!shipsVisible && (
            <p className="text-xs text-red-200 font-semibold mt-2 leading-relaxed">
              ⚠️ CUIDADO: no puedes ver su ejército. Que aparezca vacio NO significa que no tenga tropas.
              Si atacas a ciegas puedes perder todo tu ejército.
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-2">
            Sube tu Tecnologia de Espionaje o envia mas sondas (cada 5 sondas = +1 nivel efectivo)
            para obtener un informe completo.
          </p>
        </div>
      )}

      <div className="bg-space-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-400 mb-2">Recursos</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <span className="text-gray-500 text-xs">{t.resources.metal}</span>
            <p className="text-white font-orbitron">{formatNumber(report.resources?.metal || 0)}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs">{t.resources.crystal}</span>
            <p className="text-cyan-400 font-orbitron">{formatNumber(report.resources?.crystal || 0)}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs">{t.resources.deuterium}</span>
            <p className="text-green-400 font-orbitron">{formatNumber(report.resources?.deuterium || 0)}</p>
          </div>
        </div>
      </div>

      {!shipsVisible ? (
        <HiddenSection label={t.fleet.title} />
      ) : report.ships && report.ships.length > 0 ? (
        <div className="bg-space-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-400 mb-2">{t.fleet.title}</h4>
          <div className="grid grid-cols-2 gap-2">
            {report.ships.map((ship, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-400">{ship.name}</span>
                <span className="text-white">{formatNumber(ship.quantity)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {report.allied_fleets && report.allied_fleets.length > 0 && (
        <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/20 rounded-lg p-4 border border-blue-500/20">
          <h4 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            🛡️ Ejércitos Aliados Estacionados
          </h4>
          <div className="space-y-3">
            {report.allied_fleets.map((allyFleet, i) => (
              <div key={i} className="bg-space-900/50 rounded-lg p-3 border border-blue-800/20">
                <p className="text-xs text-blue-300 font-semibold mb-2 flex items-center gap-1">
                  <span className="text-blue-400">⚔️</span> {allyFleet.owner}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {(allyFleet.ships || []).map((ship, j) => (
                    <div key={j} className="flex justify-between text-sm">
                      <span className="text-gray-400">{ship.name}</span>
                      <span className="text-blue-300">{formatNumber(ship.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!defensesVisible ? (
        <HiddenSection label={t.defense.title} />
      ) : report.defenses && report.defenses.length > 0 ? (
        <div className="bg-space-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-400 mb-2">{t.defense.title}</h4>
          <div className="grid grid-cols-2 gap-2">
            {report.defenses.map((def, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-400">{def.name}</span>
                <span className="text-white">{formatNumber(def.quantity)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!buildingsVisible ? (
        <HiddenSection label={t.buildings.title} />
      ) : report.buildings && report.buildings.length > 0 ? (
        <div className="bg-space-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-400 mb-3">{t.buildings.title}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
            {report.buildings.map((building, i) => (
              <div key={i} className="flex items-center gap-2 text-sm py-1">
                <span className="text-gray-400">{building.name}</span>
                <span className="text-cyber-yellow font-mono font-semibold">({building.level})</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!techsVisible ? (
        <HiddenSection label={t.research.title} />
      ) : report.technologies && report.technologies.length > 0 ? (
        <div className="bg-space-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-400 mb-3">{t.research.title}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
            {report.technologies.map((tech, i) => (
              <div key={i} className="flex items-center gap-2 text-sm py-1">
                <span className="text-gray-400">{tech.name}</span>
                <span className="text-cyber-blue font-mono font-semibold">({tech.level})</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MissileReportView({ body }: { body: string }) {
  const isAttacker = body.startsWith('Has lanzado misiles');
  const isDefender = body.startsWith('Tu planeta');

  // Parse coordinates
  const coordMatch = isAttacker
    ? body.match(/a \[(\d+:\d+:\d+)\]/)
    : body.match(/en \[(\d+:\d+:\d+)\]/);
  const coords = coordMatch?.[1] || '?:?:?';

  // Parse planet name (defender only)
  const planetMatch = body.match(/Tu planeta (.+?) en \[/);
  const planetName = planetMatch?.[1] || '';

  // Parse missile stats
  const missilesLaunched = body.match(/Misiles (?:lanzados|recibidos):\s*(\d+)/)?.[1] || '0';
  const missilesIntercepted = body.match(/Misiles interceptados:\s*(\d+)/)?.[1] || '0';
  const missilesEffective = body.match(/Misiles (?:efectivos|impactados):\s*(\d+)/)?.[1] || '0';
  const totalDamage = body.match(/Daño total:\s*([\d,.]+)/)?.[1] || '0';

  // Parse destroyed defenses
  const defensesSection = body.match(/Defensas destruidas:\n([\s\S]*?)$/)?.[1]?.trim() || '';
  const destroyedDefenses: { name: string; quantity: string }[] = [];
  if (defensesSection && defensesSection !== 'Ninguna') {
    const lines = defensesSection.split('\n');
    for (const line of lines) {
      const match = line.match(/^-\s*(.+?)\s+x(\d+)/);
      if (match) {
        destroyedDefenses.push({ name: match[1], quantity: match[2] });
      }
    }
  }

  const hasDestruction = destroyedDefenses.length > 0;
  const bannerColor = isAttacker
    ? 'from-green-500/20 to-green-900/10 border-green-500/40'
    : 'from-red-500/20 to-red-900/10 border-red-500/40';
  const titleColor = isAttacker ? 'text-green-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className={`bg-gradient-to-r ${bannerColor} border rounded-xl p-4 text-center`}>
        <p className={`font-orbitron text-xl ${titleColor} mb-1`}>
          🚀 {isAttacker ? 'Ataque de Misiles Lanzado' : 'Ataque de Misiles Recibido'}
        </p>
        <p className="text-sm text-gray-400">
          {isAttacker ? `🎯 Objetivo: [${coords}]` : `📍 ${translatePlanetName(planetName)} [${coords}]`}
        </p>
      </div>

      {/* Missile Stats */}
      <div className="bg-space-800/80 rounded-lg p-4 border border-space-600">
        <h4 className="text-sm font-bold text-cyber-blue mb-3">📊 Estadísticas de Misiles</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">{isAttacker ? 'Lanzados' : 'Recibidos'}:</span>
            <span className="text-white font-semibold">{missilesLaunched}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Interceptados:</span>
            <span className="text-yellow-400 font-semibold">{missilesIntercepted}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{isAttacker ? 'Efectivos' : 'Impactados'}:</span>
            <span className="text-red-400 font-semibold">{missilesEffective}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Daño total:</span>
            <span className="text-red-400 font-semibold">{totalDamage}</span>
          </div>
        </div>
      </div>

      {/* Destroyed Defenses */}
      <div className="bg-space-800/80 rounded-lg p-4 border border-space-600">
        <h4 className="text-sm font-bold text-cyber-orange mb-3">
          💥 Defensas Destruidas
        </h4>
        {hasDestruction ? (
          <div className="space-y-1.5">
            {destroyedDefenses.map((def, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-300">{def.name}</span>
                <span className="text-red-400 font-semibold">x{def.quantity} 💀</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-green-400 text-sm">🛡️ Ninguna defensa fue destruida</p>
        )}
      </div>

      {/* Motivational */}
      <p className={`text-sm text-center italic ${titleColor}/80`}>
        {isAttacker
          ? (hasDestruction ? '🎯 ¡Impacto directo! Las defensas enemigas han sido debilitadas.' : '⚡ Los misiles fueron interceptados. Considera enviar más la próxima vez.')
          : (hasDestruction ? '🛡️ Refuerza tus defensas y construye más misiles antibalísticos.' : '✨ ¡Tus defensas resistieron el ataque! Los misiles antibalísticos hicieron su trabajo.')
        }
      </p>
    </div>
  );
}

function BattleReportView({ body }: { body: string }) {
  const { t } = useI18n();

  // Detect missile reports
  if (body.startsWith('Has lanzado misiles interplanetarios') || body.includes('ha sido atacado con misiles interplanetarios')) {
    return <MissileReportView body={body} />;
  }

  let report: BattleReport | null = null;

  try {
    report = JSON.parse(body);
  } catch {
    // Parse plain-text battle reports from backend
    return <PlainTextBattleReport body={body} />;
  }

  if (!report) {
    return <PlainTextBattleReport body={body} />;
  }

  // Perspectiva del lector: los reportes v2 la traen; los antiguos se asumen de atacante
  const isAttacker = report.perspective !== 'defender';
  const outcome: 'won' | 'lost' | 'draw' =
    report.result === 'draw'
      ? 'draw'
      : (report.result === 'attacker_won') === isAttacker
        ? 'won'
        : 'lost';

  const theme =
    outcome === 'won'
      ? {
          label: 'VICTORIA',
          text: 'text-cyber-green',
          border: 'border-cyber-green/40',
          grad: 'from-cyber-green/25 via-cyber-green/5 to-transparent',
          Icon: Trophy,
          tagline: isAttacker ? 'Tu ejército ha arrasado el objetivo' : 'Tus defensas han repelido el ataque',
        }
      : outcome === 'lost'
        ? {
            label: 'DERROTA',
            text: 'text-cyber-red',
            border: 'border-cyber-red/40',
            grad: 'from-cyber-red/25 via-cyber-red/5 to-transparent',
            Icon: Skull,
            tagline: isAttacker ? 'Tu ejército ha sido aniquilado' : 'El enemigo ha superado tus defensas',
          }
        : {
            label: 'EMPATE',
            text: 'text-cyber-yellow',
            border: 'border-cyber-yellow/40',
            grad: 'from-cyber-yellow/25 via-cyber-yellow/5 to-transparent',
            Icon: Swords,
            tagline: 'Ningún ejército logro imponerse',
          };

  const atkLoss = { metal: report.attacker_losses?.metal || 0, crystal: report.attacker_losses?.crystal || 0 };
  const defLoss = { metal: report.defender_losses?.metal || 0, crystal: report.defender_losses?.crystal || 0 };
  const atkLossTotal = atkLoss.metal + atkLoss.crystal;
  const defLossTotal = defLoss.metal + defLoss.crystal;
  const lootTotal = (report.loot?.metal || 0) + (report.loot?.crystal || 0) + (report.loot?.deuterium || 0);
  const debrisTotal = (report.debris?.metal || 0) + (report.debris?.crystal || 0);

  // Balance economico desde el punto de vista del lector
  const myLoss = isAttacker ? atkLossTotal : defLossTotal;
  const enemyLoss = isAttacker ? defLossTotal : atkLossTotal;
  const balance = enemyLoss - myLoss + (isAttacker ? lootTotal : -lootTotal);

  const roundsData = Array.isArray(report.rounds_data) ? report.rounds_data : [];
  const moonChance = typeof report.moon?.moon_chance === 'number' ? report.moon.moon_chance : null;
  const moonCreated = report.moon?.moon_created === true;
  const bdmg = report.building_damage && report.building_damage.damaged ? report.building_damage : null;

  return (
    <div className="space-y-4">
      {/* ===== Banner de resultado ===== */}
      <div className={`relative overflow-hidden rounded-xl border ${theme.border} bg-gradient-to-br ${theme.grad} p-4 sm:p-5`}>
        <div className="absolute -right-6 -top-6 opacity-10">
          <theme.Icon className="w-28 h-28" />
        </div>
        <div className="relative flex items-center gap-3">
          <div className={`p-2.5 rounded-lg bg-space-900/60 border ${theme.border} animate-pulse-slow`}>
            <theme.Icon className={`w-7 h-7 ${theme.text}`} />
          </div>
          <div className="min-w-0">
            <div className={`font-orbitron text-2xl sm:text-3xl font-bold tracking-wider ${theme.text}`}>
              {theme.label}
            </div>
            <p className="text-xs text-gray-400">{theme.tagline}</p>
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-space-900/50 rounded-lg px-2.5 py-2">
            <div className="text-gray-500">Objetivo</div>
            <div className="text-white font-orbitron truncate">
              {report.planet_name || 'Ciudad'}
            </div>
          </div>
          <div className="bg-space-900/50 rounded-lg px-2.5 py-2">
            <div className="text-gray-500">Coordenadas</div>
            <div className="text-cyber-blue font-orbitron">
              [{report.coordinates}]{report.target_type === 'moon' ? ' 🌙' : ''}
            </div>
          </div>
          <div className="bg-space-900/50 rounded-lg px-2.5 py-2">
            <div className="text-gray-500">Rondas</div>
            <div className="text-white font-orbitron">{report.rounds}</div>
          </div>
          <div className="bg-space-900/50 rounded-lg px-2.5 py-2">
            <div className="text-gray-500">Balance</div>
            <div className={`font-orbitron ${balance >= 0 ? 'text-cyber-green' : 'text-cyber-red'}`}>
              {balance >= 0 ? '+' : '-'}{formatNumber(Math.abs(balance))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Marcador: atacante vs defensor ===== */}
      <div className="flex items-stretch gap-2">
        <div className={`flex-1 rounded-lg p-3 border ${isAttacker ? 'border-cyber-blue/50 bg-cyber-blue/10' : 'border-space-700 bg-space-800'}`}>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyber-blue">
            <Target className="w-3.5 h-3.5" /> Atacante {isAttacker && <span className="text-gray-500">(tu)</span>}
          </div>
          <div className="font-orbitron text-white truncate">{report.attacker}</div>
          {report.attacker_origin && report.attacker_origin !== '?:?:?' && (
            <div className="text-[11px] text-gray-500">desde [{report.attacker_origin}]</div>
          )}
        </div>
        <div className="flex items-center px-1">
          <Swords className="w-5 h-5 text-cyber-red" />
        </div>
        <div className={`flex-1 rounded-lg p-3 border ${!isAttacker ? 'border-cyber-orange/50 bg-cyber-orange/10' : 'border-space-700 bg-space-800'}`}>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyber-orange">
            <Shield className="w-3.5 h-3.5" /> Defensor {!isAttacker && <span className="text-gray-500">(tu)</span>}
          </div>
          <div className="font-orbitron text-white truncate">{report.defender}</div>
          <div className="text-[11px] text-gray-500">en [{report.coordinates}]</div>
        </div>
      </div>

      {/* ===== Fuerzas ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BattleForcePanel
          title={`Ejército atacante - ${report.attacker}`}
          accent="blue"
          icon={<Target className="w-4 h-4" />}
          groups={[{ label: 'Tropas', units: report.attacker_ships }]}
          lossMetal={atkLoss.metal}
          lossCrystal={atkLoss.crystal}
        />
        <BattleForcePanel
          title={`Defensa - ${report.defender}`}
          accent="orange"
          icon={<Shield className="w-4 h-4" />}
          groups={[
            { label: 'Tropas', units: report.defender_ships },
            { label: 'Defensas', units: report.defender_defenses },
          ]}
          lossMetal={defLoss.metal}
          lossCrystal={defLoss.crystal}
        />
      </div>

      {/* ===== Heroes en batalla ===== */}
      {Array.isArray(report.heroes) && report.heroes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {report.heroes.map((h, i) => {
            const max = Math.max(1, h.hp_max || 0);
            const after = Math.max(0, h.hp_after || 0);
            const pct = Math.min(100, (after / max) * 100);
            const isAtk = h.side === 'attacker';
            return (
              <div key={i} className={`rounded-lg p-3 border ${isAtk ? 'border-cyber-blue/40 bg-cyber-blue/5' : 'border-cyber-orange/40 bg-cyber-orange/5'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className={`text-sm font-semibold ${isAtk ? 'text-cyber-blue' : 'text-cyber-orange'}`}>
                    {h.name || 'Héroe Imperial'} Nv {h.level ?? '?'}
                  </div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {isAtk ? 'Atacante' : 'Defensor'}{h.owner ? ` - ${h.owner}` : ''}
                  </div>
                </div>
                <div className="mt-2 h-2 rounded bg-space-900 overflow-hidden">
                  <div className={`h-2 ${pct > 50 ? 'bg-cyber-green' : pct > 20 ? 'bg-cyber-yellow' : 'bg-cyber-red'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-gray-300">
                    Salud: {formatNumber(h.hp_before || 0)} → <span className="text-white font-orbitron">{formatNumber(after)}</span> / {formatNumber(max)}
                    {h.destroyed && <span className="text-cyber-red"> (herido)</span>}
                  </span>
                  {(h.xp_gained || 0) > 0 && <span className="text-cyber-green">+{formatNumber(h.xp_gained || 0)} XP</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Desarrollo del combate ===== */}
      {roundsData.length > 0 && (
        <div className="bg-space-800 rounded-lg p-4 border border-space-700">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyber-yellow" />
            Desarrollo del combate
            <span className="text-xs font-normal text-gray-500">(unidades en pie al final de cada ronda)</span>
          </h4>
          <div className="space-y-2">
            {roundsData.map((r, i) => {
              const maxU = Math.max(1, r.attacker_remaining, r.defender_remaining);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-[11px] font-orbitron text-gray-500">R{r.round}</span>
                  <div className="flex-1 flex items-center gap-1">
                    <div className="flex-1 flex justify-end">
                      <div className="h-3 rounded-l bg-cyber-blue/70" style={{ width: `${(r.attacker_remaining / maxU) * 100}%` }} />
                    </div>
                    <div className="w-px h-4 bg-space-600" />
                    <div className="flex-1">
                      <div className="h-3 rounded-r bg-cyber-orange/70" style={{ width: `${(r.defender_remaining / maxU) * 100}%` }} />
                    </div>
                  </div>
                  <span className="w-24 shrink-0 text-right text-[11px] font-orbitron">
                    <span className="text-cyber-blue">{formatNumber(r.attacker_remaining)}</span>
                    <span className="text-gray-600"> / </span>
                    <span className="text-cyber-orange">{formatNumber(r.defender_remaining)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== Balance de perdidas ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-space-800 rounded-lg p-4 border border-space-700">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Flame className="w-4 h-4 text-cyber-red" />
            Perdidas totales
          </h4>
          <div className="space-y-2 text-sm">
            <LossBar label={report.attacker} metal={atkLoss.metal} crystal={atkLoss.crystal} total={atkLossTotal} max={Math.max(1, atkLossTotal, defLossTotal)} color="bg-cyber-blue" />
            <LossBar label={report.defender} metal={defLoss.metal} crystal={defLoss.crystal} total={defLossTotal} max={Math.max(1, atkLossTotal, defLossTotal)} color="bg-cyber-orange" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="bg-space-800 rounded-lg p-4 border border-space-700">
            <h4 className="text-sm font-semibold text-cyber-green mb-1 flex items-center gap-2">
              <Coins className="w-4 h-4" />
              {isAttacker ? 'Botin saqueado' : 'Recursos robados'}
            </h4>
            {lootTotal > 0 ? (
              <p className="text-sm">
                <span className="text-white">{formatNumber(report.loot?.metal || 0)}</span> {t.resources.metal},{' '}
                <span className="text-cyan-400">{formatNumber(report.loot?.crystal || 0)}</span> {t.resources.crystal},{' '}
                <span className="text-cyber-green">{formatNumber(report.loot?.deuterium || 0)}</span> {t.resources.deuterium}
              </p>
            ) : (
              <p className="text-sm text-gray-500">Sin saqueo</p>
            )}
          </div>

          <div className="bg-space-800 rounded-lg p-4 border border-space-700">
            <h4 className="text-sm font-semibold text-gray-300 mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gray-400" />
              Campo de escombros
            </h4>
            {debrisTotal > 0 ? (
              <p className="text-sm">
                <span className="text-white">{formatNumber(report.debris?.metal || 0)}</span> {t.resources.metal},{' '}
                <span className="text-cyan-400">{formatNumber(report.debris?.crystal || 0)}</span> {t.resources.crystal}
                <span className="block text-[11px] text-gray-500 mt-0.5">Envia recicladores a [{report.coordinates}] para recogerlo</span>
              </p>
            ) : (
              <p className="text-sm text-gray-500">Sin escombros</p>
            )}
          </div>
        </div>
      </div>

      {/* ===== Luna ===== */}
      {(moonCreated || moonChance !== null) && (
        <div className={`rounded-lg p-4 border ${moonCreated ? 'border-cyber-purple/50 bg-gradient-to-br from-cyber-purple/20 to-transparent' : 'border-space-700 bg-space-800'}`}>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Moon className={`w-4 h-4 ${moonCreated ? 'text-cyber-purple' : 'text-gray-400'}`} />
            <span className={moonCreated ? 'text-cyber-purple' : 'text-gray-300'}>
              {moonCreated ? '¡Se ha formado una Castra de Diana!' : 'Probabilidad de Castra de Diana'}
            </span>
          </h4>

          {moonCreated ? (
            <p className="text-sm text-gray-300">
              Los escombros de la batalla se fusionaron y formaron una Castra de Diana de{' '}
              <span className="text-white font-orbitron">{formatNumber(report.moon?.moon_diameter || 0)} km</span> en [{report.coordinates}].
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2.5 bg-space-900 rounded-full overflow-hidden border border-space-700">
                  <div
                    className="h-full bg-gradient-to-r from-cyber-purple to-cyber-blue"
                    style={{ width: `${Math.min(100, ((moonChance || 0) / 20) * 100)}%` }}
                  />
                </div>
                <span className="font-orbitron text-white text-sm w-16 text-right">
                  {(moonChance || 0).toFixed(2)}%
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">
                Cada 100.000 de escombros = +1% de probabilidad (maximo 20%). En esta batalla se generaron{' '}
                <span className="text-gray-300">{formatNumber(debrisTotal)}</span> de escombros.
                {report.moon?.reason === 'Ya existe una luna' && ' Ya existe una Castra de Diana en esta posicion.'}
              </p>
            </>
          )}
        </div>
      )}

      {/* ===== Dano estructural ===== */}
      {bdmg && (
        <div className="rounded-lg p-3 border border-cyber-orange/40 bg-cyber-orange/10 flex items-start gap-2">
          <Hammer className="w-4 h-4 text-cyber-orange mt-0.5 shrink-0" />
          <p className="text-sm text-gray-300">
            Dano estructural: <span className="text-white font-semibold">{bdmg.building_name}</span> bajo al nivel{' '}
            <span className="text-cyber-orange font-orbitron">{bdmg.new_level}</span>.
          </p>
        </div>
      )}

      <p className="text-xs text-gray-500 text-center">
        La batalla duro {report.rounds} {report.rounds !== 1 ? 'rondas' : 'ronda'}.
      </p>
    </div>
  );
}

function LossBar({ label, metal, crystal, total, max, color }: {
  label: string; metal: number; crystal: number; total: number; max: number; color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400 truncate mr-2">{label}</span>
        <span className="text-cyber-red font-orbitron">-{formatNumber(total)}</span>
      </div>
      <div className="h-2 bg-space-900 rounded-full overflow-hidden border border-space-700">
        <div className={`h-full ${color}`} style={{ width: `${(total / max) * 100}%` }} />
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5">
        {formatNumber(metal)} metal · {formatNumber(crystal)} cristal
      </div>
    </div>
  );
}

function BattleForcePanel({ title, accent, icon, groups, lossMetal, lossCrystal }: {
  title: string;
  accent: 'blue' | 'orange';
  icon: React.ReactNode;
  groups: Array<{ label: string; units?: BattleUnit[] }>;
  lossMetal: number;
  lossCrystal: number;
}) {
  const accentText = accent === 'blue' ? 'text-cyber-blue' : 'text-cyber-orange';
  const accentBar = accent === 'blue' ? 'bg-cyber-blue' : 'bg-cyber-orange';
  const visible = groups.filter((g) => g.units && g.units.length > 0);

  const totalInitial = visible.reduce((s, g) => s + (g.units || []).reduce((a, u) => a + u.initial, 0), 0);
  const totalLost = visible.reduce((s, g) => s + (g.units || []).reduce((a, u) => a + u.lost, 0), 0);
  const survivalPct = totalInitial > 0 ? ((totalInitial - totalLost) / totalInitial) * 100 : 0;

  return (
    <div className="bg-space-800 rounded-lg p-4 border border-space-700">
      <h4 className={`text-sm font-semibold ${accentText} mb-3 flex items-center gap-2`}>
        {icon}
        <span className="truncate">{title}</span>
      </h4>

      {visible.length === 0 ? (
        <p className="text-sm text-gray-500">Sin unidades</p>
      ) : (
        <div className="space-y-3">
          {visible.map((g, gi) => (
            <div key={gi}>
              <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">{g.label}</div>
              <div className="space-y-1.5">
                {(g.units || []).map((u, i) => {
                  const remaining = typeof u.remaining === 'number' ? u.remaining : u.initial - u.lost;
                  const pct = u.initial > 0 ? (remaining / u.initial) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-300 truncate mr-2">{u.name}</span>
                        <span className="font-orbitron whitespace-nowrap">
                          <span className={remaining === 0 ? 'text-cyber-red' : 'text-white'}>{formatNumber(remaining)}</span>
                          <span className="text-gray-600">/{formatNumber(u.initial)}</span>
                          {u.lost > 0 && <span className="text-cyber-red ml-1.5">-{formatNumber(u.lost)}</span>}
                        </span>
                      </div>
                      <div className="h-1.5 bg-space-900 rounded-full overflow-hidden mt-1">
                        <div className={`h-full ${pct === 0 ? 'bg-cyber-red' : accentBar}`} style={{ width: `${Math.max(pct, pct === 0 ? 100 : 0)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-space-700 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Unidades supervivientes</span>
          <span className="text-white font-orbitron">
            {formatNumber(totalInitial - totalLost)}/{formatNumber(totalInitial)} ({survivalPct.toFixed(0)}%)
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Recursos perdidos</span>
          <span className="text-cyber-red font-orbitron">
            {formatNumber(lossMetal)} M / {formatNumber(lossCrystal)} C
          </span>
        </div>
      </div>
    </div>
  );
}

function PlainTextBattleReport({ body }: { body: string }) {
  // Detectar el rol del usuario en este reporte
  const isAcsReport = body.startsWith('Combate ACS');
  const isSoloCombatReport = body.startsWith('Combate en ');
  // Reporte que reciben los miembros de la alianza duena del Planeta del Tesoro:
  // 'El Planeta del Tesoro [g:s:p] de tu alianza fue atacado por <jugador> (<alianza>).'
  const isTreasureDefenseReport = /^El Planeta del Tesoro\s*\[/i.test(body);
  // Reporte que reciben los miembros de la alianza duena de una Fortaleza atacada
  // ('Combate en [g:250:8]' + 'Atacado por: X' / 'Tu fortaleza ...').
  const isFortressDefenseReport = isSoloCombatReport
    && /^Atacado por:|tu fortaleza|naves defensoras fueron destruidas/im.test(body);
  const isUserAttacker = body.startsWith('Tu flota') || isAcsReport || (isSoloCombatReport && !isFortressDefenseReport);
  const isUserDefender = body.startsWith('Tu planeta') || isTreasureDefenseReport || isFortressDefenseReport;

  // Parse result - soporta formato normal (VICTORIA ATACANTE/DEFENSOR) y ACS/solo/defensa (VICTORIA/DERROTA/EMPATE)
  const resultMatch = body.match(/Resultado:\s*(VICTORIA ATACANTE|VICTORIA DEFENSOR|VICTORIA|DERROTA|EMPATE|ATTACKER|DEFENDER|DRAW)/i);
  const rawResult = (resultMatch?.[1] || '').toUpperCase();
  const isDraw = rawResult === 'DRAW' || rawResult === 'EMPATE';

  // El "Resultado" esta expresado desde la perspectiva del destinatario del mensaje:
  //  - Reporte de defensa ('Tu planeta fue atacado'): DERROTA = perdiste, VICTORIA = ganaste
  //  - Reporte de ataque/solo/ACS ('Tu flota'/'Combate en'): VICTORIA = ganaste, DERROTA = perdiste
  const userWon = rawResult === 'VICTORIA'
    || (isUserAttacker && (rawResult === 'VICTORIA ATACANTE' || rawResult === 'ATTACKER'))
    || (isUserDefender && (rawResult === 'VICTORIA DEFENSOR' || rawResult === 'DEFENDER'));
  const userLost = rawResult === 'DERROTA'
    || (isUserAttacker && (rawResult === 'VICTORIA DEFENSOR' || rawResult === 'DEFENDER'))
    || (isUserDefender && (rawResult === 'VICTORIA ATACANTE' || rawResult === 'ATTACKER'));

  // Parse coordinates - soporta formato normal, ACS, solo, defensa y Planeta del Tesoro
  const coordsMatch = isAcsReport
    ? body.match(/Combate ACS en \[([^\]]+)\]/)
    : isSoloCombatReport
      ? body.match(/Combate en [^[\n]*\[([^\]]+)\]/)
      : isTreasureDefenseReport
        ? body.match(/Planeta del Tesoro\s*\[([^\]]+)\]/i)
        : isUserAttacker
          ? body.match(/desde\s*\[([^\]]+)\]\s*ataco\s*\[([^\]]+)\]/)
          : (body.match(/planeta\s*\[([^\]]+)\]\s*fue atacado.*desde\s*\[([^\]]+)\]/)
              || body.match(/\ben\s*\[([^\]]+)\]\s*fue atacado/));
  const coord1 = coordsMatch?.[1] || '?';
  const coord2 = (isAcsReport || isSoloCombatReport) ? (coordsMatch?.[1] || '?') : (coordsMatch?.[2] || '?');

  // Parse enemy name (for defender view)
  // Normal: 'fue atacado por <jugador> desde [..]'
  // Planeta del Tesoro: 'fue atacado por <jugador> (<alianza>).'
  const enemyMatch = body.match(/fue atacado por\s+(.+?)\s+desde/)
    || body.match(/fue atacado por\s+(.+?)\s*\(/)
    || body.match(/^Atacado por:\s*(.+)$/m);
  const enemyName = enemyMatch?.[1]?.trim() || null;

  // Parse debris
  // Los reportes normales escriben 'Escombros:' y los de ACS/fortaleza 'Escombros generados:'.
  // Hay que aceptar ambos o el campo de escombros no se muestra nunca.
  const debrisMatch = body.match(/Escombros(?:\s+generados)?:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal/i);
  const debrisMetal = debrisMatch?.[1] || '0';
  const debrisCrystal = debrisMatch?.[2] || '0';

  // Parse loot/resources lost - support all formats
  const lootMatch = body.match(/Saqueo:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal[,\s]*([\d,.]+)\s*Deuterio/)
    || body.match(/Botin total:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal[,\s]*([\d,.]+)\s*Deuterio/)
    || body.match(/Botin:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal[,\s]*([\d,.]+)\s*Deuterio/);
  const resourcesLostMatch = body.match(/Recursos perdidos:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal[,\s]*([\d,.]+)\s*Deuterio/)
    || body.match(/Recursos saqueados:\s*([\d,.]+)\s*Metal[,\s]*([\d,.]+)\s*Cristal[,\s]*([\d,.]+)\s*Deuterio/);
  const lootMetal = lootMatch?.[1] || resourcesLostMatch?.[1] || '0';
  const lootCrystal = lootMatch?.[2] || resourcesLostMatch?.[2] || '0';
  const lootDeuterium = lootMatch?.[3] || resourcesLostMatch?.[3] || '0';

  // Parse units sections - soporta todos los formatos:
  // Normal: '--- Unidades Atacante/Defensor ---'
  // ACS: '=== FUERZAS ATACANTES/DEFENSORAS ==='
  // Solo: '=== TUS FUERZAS ===' / '=== FUERZAS ENEMIGAS ==='
  // Defensa: '=== TUS FUERZAS ===' (tus naves) + '=== FUERZAS ATACANTES ===' (enemigo)
  // Planeta del Tesoro: '=== TUS FUERZAS DEFENSORAS ===' y
  //                     '=== FUERZAS DEFENSORAS (<alianza>) ===' (sufijo entre parentesis)
  const extractUnits = (labels: string[]): { raw: string; found: boolean } => {
    for (const label of labels) {
      const re = new RegExp(
        `(?:===|---)\\s*${label}\\s*(?:\\([^)]*\\))?\\s*(?:===|---)\\s*\\n([\\s\\S]*?)(?=\\n(?:===|---)|\\nRecursos|\\nEscombros|\\nSaqueo|\\nBotin|\\n\\n|$)`,
        'i'
      );
      const m = body.match(re);
      if (m) return { raw: m[1].trim(), found: true };
    }
    return { raw: '', found: false };
  };

  const tusFuerzas = extractUnits(['TUS FUERZAS']);
  const tusFuerzasDefensoras = extractUnits(['TUS FUERZAS DEFENSORAS']);
  const seccionAtacante = extractUnits(['FUERZAS ATACANTES', 'Unidades Atacante']);
  const seccionDefensora = extractUnits(['FUERZAS DEFENSORAS', 'Unidades Defensor']);
  const fuerzasEnemigas = extractUnits(['FUERZAS ENEMIGAS']);

  // Asignar las secciones a las columnas Atacante/Defensor segun el rol del usuario
  const attackerSection = isUserDefender
    ? (seccionAtacante.found ? seccionAtacante : fuerzasEnemigas) // el enemigo que te ataco (fortaleza: FUERZAS ENEMIGAS)
    : (tusFuerzas.found ? tusFuerzas : seccionAtacante); // tus fuerzas (ataque/solo/ACS)
  const defenderSection = isUserDefender
    // tus propias fuerzas defensoras (Planeta del Tesoro usa 'TUS FUERZAS DEFENSORAS')
    ? (tusFuerzasDefensoras.found ? tusFuerzasDefensoras : (tusFuerzas.found ? tusFuerzas : seccionDefensora))
    : (fuerzasEnemigas.found ? fuerzasEnemigas : seccionDefensora);

  const attackerUnitsRaw = attackerSection.raw;
  const defenderUnitsRaw = defenderSection.raw;

  // Parse moon text
  const moonMatch = body.match(/Se ha creado una Luna en \[([^\]]+)\]/);

  // Parse structural building damage note (anti-farmeo):
  // "Daño estructural: <edificio> del planeta <planeta> bajó al nivel <N>."
  // Regex tolerante a acentos/codificacion usando \S para 'ñ'/'ó'.
  const bdmgMatch = body.match(/estructural:\s*(.+?)\s+del planeta\s+.+?\s+baj\S*\s+al nivel\s+(\d+)/i);
  const bdmgBuilding = bdmgMatch?.[1]?.trim() || null;
  const bdmgNewLevel = bdmgMatch?.[2] || null;

  const parseUnits = (text: string) => {
    if (!text) return [];
    return text.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      // Format: "Name: X -> Y (-Z)" or "Name: X (sin perdidas)" or "Name: X -> Y (-Z destruidas)"
      const matchChange = trimmed.match(/^(.+?):\s*(\d+)\s*->\s*(\d+)\s*\((-?\d+)(?:\s*destruidas?)?\)/);
      const matchNoLoss = trimmed.match(/^(.+?):\s*(\d+)\s*\(sin perdidas\)/);
      if (matchChange) {
        return { name: matchChange[1].trim(), initial: parseInt(matchChange[2]), final: parseInt(matchChange[3]), lost: Math.abs(parseInt(matchChange[4])) };
      }
      if (matchNoLoss) {
        return { name: matchNoLoss[1].trim(), initial: parseInt(matchNoLoss[2]), final: parseInt(matchNoLoss[2]), lost: 0 };
      }
      return null;
    }).filter(Boolean) as { name: string; initial: number; final: number; lost: number }[];
  };

  const attackerUnits = parseUnits(attackerUnitsRaw);
  const defenderUnits = parseUnits(defenderUnitsRaw);

  // Distinguir "planeta indefenso" (seccion existe pero sin unidades / 'Ninguna')
  // de un fallo de parseo real. Si la seccion se encontro o dice 'Ninguna',
  // el bando simplemente no tenia naves ni defensas.
  const attackerSectionFound = attackerSection.found;
  const defenderSectionFound = defenderSection.found;
  const attackerEmptyMsg = (attackerSectionFound || /ninguna/i.test(attackerUnitsRaw))
    ? '🛰️ Sin tropas ni defensas' : 'Sin datos';
  const defenderEmptyMsg = (defenderSectionFound || /ninguna/i.test(defenderUnitsRaw))
    ? '🛰️ Ciudad sin tropas ni defensas' : 'Sin datos';

  // Result banner
  const resultEmoji = userWon ? '🏆' : userLost ? '💥' : '⚔️';
  const resultLabel = userWon ? '¡VICTORIA!' : userLost ? 'DERROTA' : 'EMPATE';
  const resultBg = userWon ? 'from-green-500/20 to-green-900/10 border-green-500/40' :
    userLost ? 'from-red-500/20 to-red-900/10 border-red-500/40' :
    'from-yellow-500/20 to-yellow-900/10 border-yellow-500/40';
  const resultTextColor = userWon ? 'text-green-400' : userLost ? 'text-red-400' : 'text-yellow-400';

  // Motivational message
  const motivationalMsg = userWon
    ? '🚀 ¡Tu ejército ha dominado el campo de batalla! El continente tiembla ante tu poder.'
    : userLost
      ? '🛡️ Cada derrota forja un comandante más fuerte. Reconstruye, investiga y vuelve con más fuerza.'
      : '⚡ Un empate honroso. Ambos bandos han demostrado su valía. La próxima vez, la victoria será tuya.';

  return (
    <div className="space-y-4">
      {/* Result Banner */}
      <div className={`bg-gradient-to-r ${resultBg} border rounded-xl p-4 text-center`}>
        <p className={`font-orbitron text-2xl ${resultTextColor} mb-1`}>
          {resultEmoji} {resultLabel} {resultEmoji}
        </p>
        <p className="text-sm text-gray-400">
          {isTreasureDefenseReport
            ? `💎 Ciudad del Tesoro [${coord1}]${enemyName ? ` — atacada por ${enemyName}` : ''}`
            : isFortressDefenseReport
              ? `🏰 Tu fortaleza [${coord1}]${enemyName ? ` — atacada por ${enemyName}` : ''}`
            : isSoloCombatReport
              ? `🎯 Combate en [${coord1}]`
              : isUserAttacker
                ? `📍 ${coord1} ➜ ${coord2}`
                : (coord2 && coord2 !== '?')
                  ? `📍 ${coord1} ← ${coord2}${enemyName ? ` (${enemyName})` : ''}`
                  : `🛡️ Tu ciudad [${coord1}]${enemyName ? ` — atacada por ${enemyName}` : ''}`
          }
        </p>
      </div>

      {/* Motivational Message */}
      <p className={`text-sm text-center italic ${resultTextColor}/80`}>{motivationalMsg}</p>

      {/* Units Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Attacker Units */}
        <div className="bg-space-800/80 rounded-lg p-4 border border-space-600">
          <h4 className="text-sm font-bold text-cyber-blue mb-1 flex items-center gap-2">
            ⚔️ Atacante {isUserAttacker ? '(tú)' : enemyName ? `(${enemyName})` : ''}
          </h4>
          <p className="text-[10px] text-gray-500 mb-3">sobrevivieron / enviadas</p>
          {attackerUnits.length > 0 ? (
            <div className="space-y-1.5">
              {attackerUnits.map((unit, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-300">{unit.name}</span>
                  <span>
                    <span className="text-white">{unit.final}</span>
                    <span className="text-gray-500">/{unit.initial}</span>
                    {unit.lost > 0 && <span className="text-red-400 ml-1.5">-{unit.lost} 💀</span>}
                    {unit.lost === 0 && <span className="text-green-400 ml-1.5">✓</span>}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">{attackerEmptyMsg}</p>
          )}
        </div>

        {/* Defender Units */}
        <div className="bg-space-800/80 rounded-lg p-4 border border-space-600">
          <h4 className="text-sm font-bold text-cyber-orange mb-1 flex items-center gap-2">
            🛡️ Defensor {isUserDefender ? '(tú)' : ''}
          </h4>
          <p className="text-[10px] text-gray-500 mb-3">sobrevivieron / iniciales</p>
          {defenderUnits.length > 0 ? (
            <div className="space-y-1.5">
              {defenderUnits.map((unit, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-300">{unit.name}</span>
                  <span>
                    <span className="text-white">{unit.final}</span>
                    <span className="text-gray-500">/{unit.initial}</span>
                    {unit.lost > 0 && <span className="text-red-400 ml-1.5">-{unit.lost} 💀</span>}
                    {unit.lost === 0 && <span className="text-green-400 ml-1.5">✓</span>}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">{defenderEmptyMsg}</p>
          )}
        </div>
      </div>

      {/* Debris & Loot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(debrisMetal !== '0' || debrisCrystal !== '0') && (
          <div className="bg-space-800/80 rounded-lg p-3 border border-space-600">
            <h4 className="text-xs font-bold text-gray-400 mb-2">🌑 Escombros Generados</h4>
            <p className="text-sm">
              <span className="text-white">{debrisMetal}</span> Metal, <span className="text-cyan-400">{debrisCrystal}</span> Cristal
            </p>
            <p className="text-[11px] text-gray-500 mt-1.5">
              Flotan en el campo de escombros de [{coord1}]. Envía Recicladores para recuperarlos.
            </p>
          </div>
        )}

        {(lootMetal !== '0' || lootCrystal !== '0' || lootDeuterium !== '0') && (
          <div className="bg-space-800/80 rounded-lg p-3 border border-space-600">
            <h4 className="text-xs font-bold text-gray-400 mb-2">
              {isUserAttacker ? '💰 Botín Capturado' : '📦 Recursos Saqueados'}
            </h4>
            <p className="text-sm">
              <span className="text-white">{lootMetal}</span> M, <span className="text-cyan-400">{lootCrystal}</span> C, <span className="text-green-400">{lootDeuterium}</span> D
            </p>
            <p className="text-[11px] text-gray-500 mt-1.5">
              {isUserAttacker
                ? 'Se los quitaste al defensor y viajan de vuelta con tu ejército.'
                : 'El atacante solo puede robar lo que tenías almacenado en la ciudad. Los recursos ya gastados en edificios, investigaciones o tropas no se pueden saquear.'}
            </p>
          </div>
        )}
      </div>

      {/* Structural building damage (anti-farmeo) */}
      {bdmgBuilding && bdmgNewLevel !== null && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <h4 className="text-xs font-bold text-red-400 mb-1 flex items-center gap-1.5">🏚️ Daño Estructural</h4>
          <p className="text-sm text-gray-300">
            {isUserAttacker
              ? <>Dañaste <span className="text-white font-semibold">{bdmgBuilding}</span> enemigo, ahora al <span className="text-red-400 font-semibold">nivel {bdmgNewLevel}</span>.</>
              : <>Tu <span className="text-white font-semibold">{bdmgBuilding}</span> resultó dañado y bajó al <span className="text-red-400 font-semibold">nivel {bdmgNewLevel}</span>.</>
            }
          </p>
        </div>
      )}

      {/* Moon creation */}
      {moonMatch && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 text-center">
          <p className="text-purple-400 text-sm font-semibold">🌙 ¡Se ha creado una Castra de Diana en [{moonMatch[1]}]!</p>
        </div>
      )}
    </div>
  );
}

function ExpeditionReportView({ body }: { body: string }) {
  const { t } = useI18n();
  let report: ExpeditionReport | null = null;

  try {
    report = JSON.parse(body);
  } catch {
    return <PlainTextExpeditionReport body={body} />;
  }

  if (!report) {
    return <PlainTextExpeditionReport body={body} />;
  }

  const getResultIcon = () => {
    switch (report?.result_type) {
      case 'resources': return <Package className="w-5 h-5 text-cyber-blue" />;
      case 'ships': return <Rocket className="w-5 h-5 text-green-400" />;
      case 'dark_matter': return <Sparkles className="w-5 h-5 text-purple-400" />;
      case 'pirates': return <Swords className="w-5 h-5 text-cyber-red" />;
      case 'aliens': return <AlertCircle className="w-5 h-5 text-cyber-orange" />;
      case 'black_hole': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'ancient_tech': return <Sparkles className="w-5 h-5 text-cyber-yellow" />;
      default: return <Compass className="w-5 h-5 text-gray-400" />;
    }
  };

  const getResultColor = () => {
    switch (report?.result_type) {
      case 'resources': return 'border-cyber-blue/30 bg-cyber-blue/5';
      case 'ships': return 'border-green-500/30 bg-green-500/5';
      case 'dark_matter': return 'border-purple-500/30 bg-purple-500/5';
      case 'pirates':
      case 'aliens':
      case 'black_hole': return 'border-red-500/30 bg-red-500/5';
      case 'ancient_tech': return 'border-cyber-yellow/30 bg-cyber-yellow/5';
      default: return 'border-gray-500/30 bg-gray-500/5';
    }
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-lg p-4 border ${getResultColor()}`}>
        <div className="flex items-center gap-3 mb-3">
          {getResultIcon()}
          <span className="font-orbitron text-white">Resultado</span>
        </div>
        <p className="text-gray-300">{report.message}</p>
      </div>

      {report.resources && (report.resources.metal > 0 || report.resources.crystal > 0 || report.resources.deuterium > 0) && (
        <div className="bg-space-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-cyber-blue mb-2">Recursos Encontrados</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-gray-500 text-xs">{t.resources.metal}</span>
              <p className="text-white font-orbitron">{formatNumber(report.resources.metal)}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">{t.resources.crystal}</span>
              <p className="text-cyan-400 font-orbitron">{formatNumber(report.resources.crystal)}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">{t.resources.deuterium}</span>
              <p className="text-green-400 font-orbitron">{formatNumber(report.resources.deuterium)}</p>
            </div>
          </div>
        </div>
      )}

      {report.ships && report.ships.length > 0 && (
        <div className="bg-space-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-400 mb-2">Tropas Encontradas</h4>
          <div className="grid grid-cols-2 gap-2">
            {report.ships.map((ship, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-400">{ship.name}</span>
                <span className="text-white">+{formatNumber(ship.quantity)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.dark_matter && report.dark_matter > 0 && (
        <div className="bg-space-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-purple-400 mb-2">{t.resources.darkMatter}</h4>
          <p className="font-orbitron text-purple-400 text-xl">+{formatNumber(report.dark_matter)}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentacion de los informes que el servidor envia como texto narrativo.
// Estos componentes NO cambian el contenido del mensaje: solo lo maquetan y
// resaltan las cifras para que se lean igual de bien que un parte de combate.
// ---------------------------------------------------------------------------

// Colorea un token segun el recurso al que pertenece.
function richClass(token: string): string {
  const s = token.toLowerCase();
  if (s.startsWith('[')) return 'text-cyan-300 font-mono';
  if (s.endsWith('%')) return 'text-red-400 font-semibold';
  if (s.includes('fxu') || s.includes('tung')) return 'text-yellow-400 font-semibold';
  if (s.includes('materia oscura')) return 'text-purple-400 font-semibold';
  if (s.includes('cristal')) return 'text-cyan-400 font-semibold';
  if (s.includes('deuteri')) return 'text-green-400 font-semibold';
  if (s.includes('metal')) return 'text-gray-100 font-semibold';
  return '';
}

const RICH_PATTERN =
  /(\d[\d.,]*\s*(?:Tokens FXU|FXU|TUNG|unidades de Materia Oscura|Materia Oscura|Metal|Cristal|Deuterio|Deuterium)|\d+(?:[.,]\d+)?\s*%|\[\d+:\d+:\d+\])/gi;

// Resalta cifras, recursos y coordenadas dentro de un texto plano.
function RichText({ text }: { text: string }) {
  const parts = text.split(RICH_PATTERN);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        const cls = richClass(part);
        return cls ? (
          <span key={i} className={cls}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

// Extrae la primera cifra que casa con el patron indicado.
function extractAmount(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1].replace(/[.,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Como extractAmount pero respetando decimales ("20.54", "1,234.56", "20,54").
// El ultimo separador es decimal si le siguen 1-2 o mas de 3 digitos.
function extractTokenAmount(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const raw = m[1].replace(/[.,]+$/, '');
  const last = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  let n: number;
  if (last >= 0 && raw.length - last - 1 !== 3) {
    n = Number(raw.slice(0, last).replace(/[.,]/g, '') + '.' + raw.slice(last + 1));
  } else {
    n = Number(raw.replace(/[.,]/g, ''));
  }
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Tarjeta compacta para mostrar un hallazgo concreto.
function FindingCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-space-800/80 rounded-lg p-3 border border-space-600 flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-white/5 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 truncate">{label}</p>
        <p className={`font-orbitron text-lg ${color}`}>{value}</p>
      </div>
    </div>
  );
}

// Cabecera con degradado usada por todos los informes narrativos.
function ReportBanner({ emoji, title, subtitle, tone }: {
  emoji: string;
  title: string;
  subtitle?: string;
  tone: { bg: string; text: string };
}) {
  return (
    <div className={`bg-gradient-to-r ${tone.bg} border rounded-xl p-4 text-center`}>
      <p className={`font-orbitron text-xl sm:text-2xl ${tone.text} mb-1`}>
        {emoji} {title} {emoji}
      </p>
      {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
    </div>
  );
}

const TONE = {
  green: { bg: 'from-green-500/20 to-green-900/10 border-green-500/40', text: 'text-green-400' },
  red: { bg: 'from-red-500/20 to-red-900/10 border-red-500/40', text: 'text-red-400' },
  orange: { bg: 'from-orange-500/20 to-orange-900/10 border-orange-500/40', text: 'text-orange-400' },
  gold: { bg: 'from-yellow-500/25 to-amber-900/10 border-yellow-500/40', text: 'text-yellow-400' },
  gray: { bg: 'from-slate-500/15 to-slate-900/10 border-slate-500/30', text: 'text-slate-300' },
  blue: { bg: 'from-cyan-500/20 to-blue-900/10 border-cyan-500/40', text: 'text-cyan-400' },
  purple: { bg: 'from-purple-500/20 to-fuchsia-900/10 border-purple-500/40', text: 'text-purple-400' },
};

// Informe de expedicion enviado como texto (formato actual del servidor).
function PlainTextExpeditionReport({ body }: { body: string }) {
  const lower = body.toLowerCase();

  const isDisaster = /agujero negro|desastre|se perdieron para siempre/.test(lower);
  const isDamaged = /emboscad|tormenta de iones|anomalia gravitacional|perdiste aproximadamente|perdidas estimadas|fueron destruidas/.test(lower);
  const isJackpot = /tesoro legendario|jackpot|increible/.test(lower);
  const isEmpty = /no encontraron nada|vacio y desolado/.test(lower);

  const metal = extractAmount(body, /(\d[\d.,]*)\s*Metal/i);
  const crystal = extractAmount(body, /(\d[\d.,]*)\s*Cristal/i);
  const deuterium = extractAmount(body, /(\d[\d.,]*)\s*Deuteri/i);
  const darkMatter =
    extractAmount(body, /(\d[\d.,]*)\s*(?:unidades\s+de\s+)?Materia Oscura/i) ??
    extractAmount(body, /recolectar\s+(\d[\d.,]*)\s*unidades/i);
  const fxu = extractAmount(body, /(\d[\d.,]*)\s*(?:Tokens\s+)?FXU/i);
  const lossPct = extractAmount(body, /(\d[\d.,]*)\s*%/);

  const shipMatch = body.match(/encontro\s+(\d[\d.,]*)\s+(.+?)\s+a la deriva/i);
  const shipCount = shipMatch ? Number(shipMatch[1].replace(/[.,]/g, '')) : null;
  const shipName = shipMatch ? shipMatch[2].trim() : null;

  const tone = isDisaster ? TONE.red
    : isDamaged ? TONE.orange
    : isJackpot ? TONE.gold
    : isEmpty ? TONE.gray
    : TONE.green;

  const emoji = isDisaster ? '💀' : isDamaged ? '⚠️' : isJackpot ? '🏆' : isEmpty ? '🌌' : '🧭';
  const title = isDisaster ? 'EJÉRCITO PERDIDO'
    : isDamaged ? 'EXPEDICIÓN DAÑADA'
    : isJackpot ? '¡TESORO LEGENDARIO!'
    : isEmpty ? 'SIN HALLAZGOS'
    : '¡EXPEDICIÓN EXITOSA!';

  const note = isDisaster
    ? '🕯️ El ejército no volverá. Envía expediciones más pequeñas para arriesgar menos.'
    : isDamaged
      ? '🔧 Las tropas supervivientes ya están de regreso. Repón el ejército y vuelve a intentarlo.'
      : isJackpot
        ? '🎉 Un hallazgo entre un millón. ¡Tu ejército ha hecho historia en tierras desconocidas!'
        : isEmpty
          ? '🔭 Las tierras desconocidas no siempre recompensan. Insiste: el próximo viaje puede ser el bueno.'
          : '📦 El cargamento ya está en tu cuenta. ¡Sigue explorando tierras desconocidas!';

  const hasFindings =
    metal || crystal || deuterium || darkMatter || fxu || shipCount;

  return (
    <div className="space-y-4">
      <ReportBanner emoji={emoji} title={title} subtitle="🚀 Informe de Expedición" tone={tone} />

      {hasFindings && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {metal !== null && (
            <FindingCard icon={<Hammer className="w-5 h-5" />} label="Hierro"
              value={`+${formatNumber(metal)}`} color="text-gray-100" />
          )}
          {crystal !== null && (
            <FindingCard icon={<Sparkles className="w-5 h-5" />} label="Piedra"
              value={`+${formatNumber(crystal)}`} color="text-cyan-400" />
          )}
          {deuterium !== null && (
            <FindingCard icon={<Flame className="w-5 h-5" />} label="Comida"
              value={`+${formatNumber(deuterium)}`} color="text-green-400" />
          )}
          {darkMatter !== null && (
            <FindingCard icon={<Zap className="w-5 h-5" />} label="Materia Oscura"
              value={`+${formatNumber(darkMatter)}`} color="text-purple-400" />
          )}
          {fxu !== null && (
            <FindingCard icon={<Coins className="w-5 h-5" />} label="Tokens FXU"
              value={`+${formatNumber(fxu)}`} color="text-yellow-400" />
          )}
          {shipCount !== null && shipName && (
            <FindingCard icon={<Rocket className="w-5 h-5" />} label={shipName}
              value={`+${formatNumber(shipCount)}`} color="text-cyber-blue" />
          )}
        </div>
      )}

      {lossPct !== null && (isDisaster || isDamaged) && (
        <div className="bg-space-800/80 rounded-lg p-4 border border-red-500/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400 flex items-center gap-2">
              <Skull className="w-4 h-4 text-red-400" /> Ejército perdido
            </span>
            <span className="font-orbitron text-red-400">{lossPct}%</span>
          </div>
          <div className="h-2 bg-space-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-red-500 to-red-700"
              style={{ width: `${Math.min(100, lossPct)}%` }} />
          </div>
        </div>
      )}

      <div className="bg-space-800/60 rounded-lg p-4 border border-space-600">
        <h4 className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-2">
          <Compass className="w-4 h-4" /> Bitácora del ejército
        </h4>
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
          <RichText text={body} />
        </p>
      </div>

      <p className={`text-sm text-center italic ${tone.text}/80`}>{note}</p>
    </div>
  );
}

// Aviso de flota hostil entrante.
function FleetWarningView({ body }: { body: string }) {
  const navigate = useNavigate();

  const m = body.match(
    /El (?:jugador|señor de la guerra)\s+(.+?)\s*\[(\d+:\d+:\d+)\]\s*te esta\s+(\S+)\s+en\s+(.+?)\s*\[(\d+:\d+:\d+)\]\.?\s*(?:Tiempo estimado de (?:llegada|asalto):\s*(.+))?$/i
  );

  const attacker = m?.[1]?.trim() ?? null;
  const origin = m?.[2] ?? null;
  const action = m?.[3]?.toLowerCase() ?? '';
  const planet = m?.[4]?.trim() ?? null;
  const target = m?.[5] ?? null;
  const eta = m?.[6]?.trim() ?? null;

  const isSpy = action.startsWith('espi');
  const mission = isSpy ? '🔍 Espionaje' : action.startsWith('atac') ? '⚔️ Ataque' : `🛰️ ${action || 'Misión'}`;
  const tone = isSpy ? TONE.blue : TONE.red;

  const goToGalaxy = () => {
    const parts = origin?.split(':');
    if (parts?.length === 3) navigate(`/game/galaxy?galaxy=${parts[0]}&system=${parts[1]}`);
  };

  if (!m) {
    return (
      <div className="space-y-4">
        <ReportBanner emoji="🚨" title="EJÉRCITO ENEMIGO DETECTADO" tone={TONE.red} />
        <p className="text-gray-300 whitespace-pre-wrap"><RichText text={body} /></p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`bg-gradient-to-r ${tone.bg} border rounded-xl p-4 text-center`}>
        <p className={`font-orbitron text-xl sm:text-2xl ${tone.text} mb-1 flex items-center justify-center gap-2`}>
          <Radar className="w-6 h-6 animate-pulse" />
          {isSpy ? 'SPECULATOR ENEMIGO DETECTADO' : '¡EJÉRCITO ENEMIGO EN CAMINO!'}
        </p>
        <p className="text-sm text-gray-400">{mission}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-space-800/80 rounded-lg p-4 border border-space-600">
          <h4 className="text-xs font-bold text-red-400 mb-2 flex items-center gap-2">
            <Swords className="w-4 h-4" /> Agresor
          </h4>
          <p className="text-white font-semibold truncate">{attacker}</p>
          <button
            onClick={goToGalaxy}
            className="mt-1 text-cyan-300 font-mono text-sm hover:text-cyan-200 hover:underline"
            title="Ver en el continente"
          >
            [{origin}]
          </button>
        </div>

        <div className="bg-space-800/80 rounded-lg p-4 border border-space-600">
          <h4 className="text-xs font-bold text-cyber-orange mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Tu objetivo
          </h4>
          <p className="text-white font-semibold truncate">{planet}</p>
          <p className="text-cyan-300 font-mono text-sm mt-1">[{target}]</p>
        </div>
      </div>

      {eta && (
        <div className="bg-space-800/80 rounded-lg p-4 border border-red-500/30 text-center">
          <p className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-2">
            <Target className="w-4 h-4 text-red-400" /> Tiempo estimado de llegada
          </p>
          <p className="font-orbitron text-2xl text-red-400">{eta}</p>
        </div>
      )}

      <p className={`text-sm text-center italic ${tone.text}/80`}>
        {isSpy
          ? '� Te están explorando. Construye Pilum y mantén tu ejército fuera de la ciudad si no quieres revelarlo.'
          : '🛡️ ¡Prepara las defensas o pon tu ejército a salvo antes de que llegue!'}
      </p>
    </div>
  );
}

// Notificaciones del sistema (reciclaje, comisiones, recompensas, etc.).
function SystemNoticeView({ subject, body }: { subject: string; body: string }) {
  const s = `${subject} ${body}`.toLowerCase();

  const kind = /victoria en batalla de naves/.test(s) ? 'naval_win'
    : /derrota en batalla de naves/.test(s) ? 'naval_loss'
    : /apuesta ganada/.test(s) ? 'bet_win'
    : /apuesta perdida/.test(s) ? 'bet_loss'
    : /apuesta devuelta/.test(s) ? 'bet_refund'
    : /reciclaje|escombros/.test(s) ? 'recycle'
    : /cancelad/.test(s) ? 'cancel'
    : /comision|referido/.test(s) ? 'commission'
    : /loteria|lotería|jackpot/.test(s) ? 'lottery'
    : /luna/.test(s) ? 'moon'
    : /recompensa|top 50|fortaleza|tesoro/.test(s) ? 'reward'
    : /transfer|recibiste|received/.test(s) ? 'transfer'
    : 'info';

  const cfg = {
    naval_win: { icon: <Crown className="w-6 h-6" />, tone: TONE.gold, title: '¡Victoria Naval!' },
    naval_loss: { icon: <Skull className="w-6 h-6" />, tone: TONE.red, title: 'Derrota Naval' },
    bet_win: { icon: <Trophy className="w-6 h-6" />, tone: TONE.gold, title: '¡Apuesta Ganada!' },
    bet_loss: { icon: <Skull className="w-6 h-6" />, tone: TONE.red, title: 'Apuesta Perdida' },
    bet_refund: { icon: <Coins className="w-6 h-6" />, tone: TONE.blue, title: 'Apuesta Devuelta' },
    recycle: { icon: <Recycle className="w-6 h-6" />, tone: TONE.blue, title: 'Informe de Reciclaje' },
    cancel: { icon: <Ban className="w-6 h-6" />, tone: TONE.orange, title: 'Operación Cancelada' },
    commission: { icon: <Percent className="w-6 h-6" />, tone: TONE.green, title: 'Comisión de Referido' },
    lottery: { icon: <Sparkles className="w-6 h-6" />, tone: TONE.purple, title: '¡Premio de Lotería!' },
    moon: { icon: <Moon className="w-6 h-6" />, tone: TONE.blue, title: '¡Nueva Castra de Diana!' },
    reward: { icon: <Trophy className="w-6 h-6" />, tone: TONE.gold, title: '¡Recompensa Recibida!' },
    transfer: { icon: <Coins className="w-6 h-6" />, tone: TONE.gold, title: 'Transferencia Recibida' },
    info: { icon: <AlertCircle className="w-6 h-6" />, tone: TONE.gray, title: 'Aviso del Sistema' },
  }[kind];

  const metal = extractAmount(body, /(\d[\d.,]*)\s*Metal/i);
  const crystal = extractAmount(body, /(\d[\d.,]*)\s*Cristal/i);
  const fxu = extractTokenAmount(body, /(\d[\d.,]*(?:\.\d+)?)\s*(?:Tokens\s+)?(?:FXU|TUNG)/i);

  return (
    <div className="space-y-4">
      <div className={`bg-gradient-to-r ${cfg.tone.bg} border rounded-xl p-4 flex items-center gap-4`}>
        <div className={`p-3 rounded-xl bg-white/5 ${cfg.tone.text}`}>{cfg.icon}</div>
        <div className="min-w-0">
          <p className={`font-orbitron text-lg ${cfg.tone.text}`}>{cfg.title}</p>
          <p className="text-xs text-gray-400 truncate">{subject}</p>
        </div>
      </div>

      {(metal !== null || crystal !== null || fxu !== null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {metal !== null && (
            <FindingCard icon={<Hammer className="w-5 h-5" />} label="Hierro"
              value={formatNumber(metal)} color="text-gray-100" />
          )}
          {crystal !== null && (
            <FindingCard icon={<Sparkles className="w-5 h-5" />} label="Piedra"
              value={formatNumber(crystal)} color="text-cyan-400" />
          )}
          {fxu !== null && (
            <FindingCard icon={<Coins className="w-5 h-5" />} label="Tokens"
              value={formatNumber(fxu)} color="text-yellow-400" />
          )}
        </div>
      )}

      <div className="bg-space-800/60 rounded-lg p-4 border border-space-600">
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
          <RichText text={body} />
        </p>
      </div>
    </div>
  );
}

// Comunicados oficiales enviados a todos los jugadores.
function BroadcastView({ body }: { body: string }) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  // Las lineas que empiezan por un numero se muestran como lista destacada.
  const isItem = (l: string) => /^(?:\d+[\u{FE0F}\u{20E3}.)\-–]*|[•\-*])\s*/u.test(l);
  const items = lines.filter(isItem);
  const rest = lines.filter((l) => !isItem(l));

  return (
    <div className="space-y-4">
      <div className={`bg-gradient-to-r ${TONE.purple.bg} border rounded-xl p-4 flex items-center gap-4`}>
        <div className={`p-3 rounded-xl bg-white/5 ${TONE.purple.text}`}>
          <Megaphone className="w-6 h-6" />
        </div>
        <div>
          <p className={`font-orbitron text-lg ${TONE.purple.text}`}>Comunicado Oficial</p>
          <p className="text-xs text-gray-400">Equipo de Imperium</p>
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((line, i) => (
            <div key={i}
              className="bg-space-800/80 rounded-lg p-3 border border-space-600 flex items-start gap-3 hover:border-purple-500/30 transition-colors">
              <span className="font-orbitron text-purple-400 text-sm shrink-0 mt-0.5">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="text-sm text-gray-300 leading-relaxed">
                <RichText text={line.replace(/^(?:\d+[\u{FE0F}\u{20E3}.)\-–]*|[•\-*])\s*/u, '')} />
              </p>
            </div>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="bg-space-800/60 rounded-lg p-4 border border-space-600">
          {rest.map((line, i) => (
            <p key={i} className="text-sm text-gray-300 leading-relaxed">
              <RichText text={line} />
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// Notificaciones relacionadas con la alianza.
function AllianceNoticeView({ subject, body }: { subject: string; body: string }) {
  const s = `${subject} ${body}`.toLowerCase();
  // Corta el nombre antes de los verbos para no arrastrar el resto de la frase.
  const tagMatch = body.match(
    /\[([^\]]{1,10})\]\s+(.{1,30}?)(?=\s+(?:ha|han|fue|te|se|ya|es|y)\s|[.,]|$)/
  );
  const tag = tagMatch?.[1] ?? null;
  const name = tagMatch?.[2]?.trim() ?? null;

  const kind = /rechazad/.test(s) ? 'rejected'
    : /lider|líder/.test(s) ? 'leader'
    : /expulsad|abandonad|salido/.test(s) ? 'left'
    : /aceptad|unido|bienvenid|nuevo miembro|solicitud/.test(s) ? 'accepted'
    : 'info';

  const cfg = {
    rejected: { icon: <Ban className="w-6 h-6" />, tone: TONE.red, title: 'Solicitud Rechazada' },
    leader: { icon: <Crown className="w-6 h-6" />, tone: TONE.gold, title: '¡Nuevo Liderazgo!' },
    left: { icon: <Users className="w-6 h-6" />, tone: TONE.orange, title: 'Cambio en la Alianza' },
    accepted: { icon: <Gift className="w-6 h-6" />, tone: TONE.green, title: 'Novedad de Alianza' },
    info: { icon: <Users className="w-6 h-6" />, tone: TONE.blue, title: 'Aviso de Alianza' },
  }[kind];

  return (
    <div className="space-y-4">
      <div className={`bg-gradient-to-r ${cfg.tone.bg} border rounded-xl p-4 flex items-center gap-4`}>
        <div className={`p-3 rounded-xl bg-white/5 ${cfg.tone.text}`}>{cfg.icon}</div>
        <div className="min-w-0">
          <p className={`font-orbitron text-lg ${cfg.tone.text}`}>{cfg.title}</p>
          {tag && name ? (
            <p className="text-xs text-gray-400 truncate">
              <span className="font-mono text-cyan-300">[{tag}]</span> {name}
            </p>
          ) : (
            <p className="text-xs text-gray-400 truncate">{subject}</p>
          )}
        </div>
      </div>

      <div className="bg-space-800/60 rounded-lg p-4 border border-space-600">
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
          <RichText text={body} />
        </p>
      </div>
    </div>
  );
}

interface ComposeModalProps {
  onClose: () => void;
  onSent: () => void;
  initialRecipient?: string;
  initialSubject?: string;
}

function ComposeModal({ onClose, onSent, initialRecipient, initialSubject }: ComposeModalProps) {
  const { t } = useI18n();
  const { profile } = useAuthStore();
  const [recipient, setRecipient] = useState(initialRecipient || '');
  const [subject, setSubject] = useState(initialSubject || '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!profile || !recipient || !subject || !body) return;

    setSending(true);
    setError('');

    try {
      const { data: recipientProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', recipient)
        .maybeSingle();

      if (!recipientProfile) {
        setError(t.messages.userNotFound);
        setSending(false);
        return;
      }

      const { data: result, error: sendError } = await supabase.rpc('secure_send_message', {
        p_recipient_id: recipientProfile.id,
        p_subject: subject,
        p_body: body,
        p_message_type: 'player',
      });

      if (sendError) throw sendError;
      if (result && !result.success) throw new Error(result.error);
      onSent();
    } catch (err) {
      setError(t.messages.sendError);
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card-glass w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl text-white">{t.messages.newMessage}</h2>
          <button onClick={onClose} className="p-2 hover:bg-space-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-cyber-red/20 border border-cyber-red/50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-cyber-red" />
            <span className="text-cyber-red">{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.messages.recipient}</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="input-cyber"
              placeholder={t.messages.recipient}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.messages.subject}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input-cyber"
              placeholder={t.messages.subject}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.messages.body}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="input-cyber min-h-[150px] resize-none"
              placeholder={t.messages.body}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary">
            {t.common.cancel}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !recipient || !subject || !body}
            className="btn-cyber flex items-center gap-2"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.messages.sending}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {t.messages.send}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
