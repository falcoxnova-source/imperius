import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, LogOut, Settings, ChevronDown, Bell, Menu, Mail, Swords, Eye, AlertCircle, Compass, Wallet, Coins } from 'lucide-react';

const TUNG_LOGO = '/Imagenes/Logo%20de%20moneda/Logo%20de%20tung.webp';
import { useAuthStore } from '../../store/authStore';
import { ResourceBar } from '../ui/ResourceBar';
import { LanguageSelector } from '../ui/LanguageSelector';
import { RankBadge } from '../ui/RankBadge';
import { supabase, handleSupabaseError } from '../../lib/supabase';
import { formatRelativeDate } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { resolveAvatarUrl } from '../../lib/avatar';

interface Notification {
  id: string;
  subject: string;
  message_type: string;
  is_read: boolean;
  created_at: string;
}

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { profile, signOut } = useAuthStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!profile) return;

    try {
      const [recentResult, countResult] = await Promise.all([
        supabase
          .from('messages')
          .select('id, subject, message_type, is_read, created_at')
          .eq('recipient_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_id', profile.id)
          .eq('is_read', false)
      ]);

      if (recentResult.error) throw recentResult.error;

      setNotifications(recentResult.data || []);
      setUnreadCount(countResult.count || 0);
    } catch (error) {
      const handled = await handleSupabaseError(error);
      if (!handled) {
        console.error('Error loading notifications:', error);
      }
    }
  }, [profile]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`header-notifications-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, loadNotifications]);

  // Online players count (poll every 60s)
  useEffect(() => {
    const fetchOnline = () => supabase.rpc('get_online_players_count').then(({ data, error }) => {
      if (error) console.error('online count error:', error);
      else if (data) {
        const count = typeof data === 'number' ? data : (typeof data?.online === 'number' ? data.online : 0);
        setOnlineCount(count);
      }
    }).catch(err => console.error('online count fetch error:', err));
    fetchOnline();
    const interval = setInterval(fetchOnline, 60000);
    return () => clearInterval(interval);
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'battle':
        return <Swords className="w-4 h-4" />;
      case 'espionage':
        return <Eye className="w-4 h-4" />;
      case 'system':
        return <AlertCircle className="w-4 h-4" />;
      case 'expedition':
        return <Compass className="w-4 h-4" />;
      default:
        return <Mail className="w-4 h-4" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'battle':
        return 'text-cyber-red bg-cyber-red/20';
      case 'espionage':
        return 'text-cyber-blue bg-cyber-blue/20';
      case 'system':
        return 'text-cyber-orange bg-cyber-orange/20';
      case 'expedition':
        return 'text-cyber-green bg-cyber-green/20';
      default:
        return 'text-gray-400 bg-space-600';
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#8a6a32] shadow-[inset_0_-3px_0_#0a0705,inset_0_-4px_0_rgba(214,170,85,0.3),0_8px_24px_rgba(0,0,0,0.6)] bg-[linear-gradient(180deg,#120d08_0%,#070504_100%)]">
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 lg:py-0 lg:h-[76px]">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 hover:bg-amber-500/10 rounded-lg lg:hidden"
          >
            <Menu className="w-6 h-6 text-amber-200/70" />
          </button>
          <Link to="/game" className="flex items-center gap-2 lg:hidden">
                <img src="/Imagenes/Visuales/main_city.webp" alt="Imperium" className="w-9 h-9 sm:w-11 sm:h-11 object-contain drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" draggable={false} />
                <span className="font-serif text-lg sm:text-xl font-bold text-amber-100 hidden sm:block">IMPERIUM</span>
          </Link>
        </div>

        <div className="flex-1 mx-4 hidden xl:block min-w-0">
          <ResourceBar />
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <a
            href="https://t.me/TrungTungMeme"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-amber-500/10 transition-colors group hidden min-[400px]:block"
            title="Telegram"
          >
            <svg className="w-5 h-5 text-amber-200/70 group-hover:text-[#26A5E4] transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </a>
          <a
            href="https://x.com/FalcoX_universe"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-amber-500/10 transition-colors group hidden min-[400px]:block"
            title="X (Twitter)"
          >
            <svg className="w-5 h-5 text-amber-200/70 group-hover:text-amber-100 transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>

          {/* Online players */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-black/40 border border-[#d6aa55]/30">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${onlineCount !== null && onlineCount > 0 ? 'bg-green-400' : 'bg-gray-600'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${onlineCount !== null && onlineCount > 0 ? 'bg-green-400' : 'bg-gray-600'}`} />
            </span>
            <span className={`text-[10px] font-semibold ${onlineCount !== null && onlineCount > 0 ? 'text-green-400' : 'text-amber-200/40'}`}>{onlineCount ?? '0'}</span>
            <span className="text-[9px] text-amber-200/50 hidden sm:inline">Online</span>
          </div>

          <div className="w-px h-6 bg-[#d6aa55]/30 hidden sm:block" />
          <Link
            to="/game/messages"
            className="p-2 rounded-sm hover:bg-[#d6aa55]/10 transition-colors hidden sm:block"
            title={t.nav.messages}
          >
            <Mail className="w-5 h-5 text-[#d6aa55] hover:text-[#f3dfae]" strokeWidth={1.6} />
          </Link>
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-sm hover:bg-[#d6aa55]/10 transition-colors relative"
            >
              <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-[#f3dfae]' : 'text-[#d6aa55]'}`} strokeWidth={1.6} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-[#b91c1c] border border-[#f3dfae]/60 text-white text-[10px] font-bold rounded-full px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <>
                {/* Mobile backdrop */}
                <div 
                  className="fixed inset-0 bg-black/60 z-40 sm:hidden"
                  onClick={() => setShowNotifications(false)}
                />
                <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 w-auto sm:w-80 bg-[#0f0b07] border border-[#8a6a32] rounded-sm shadow-2xl shadow-black/70 overflow-hidden z-50">
                <div className="p-3 border-b border-space-600 flex items-center justify-between">
                  <h3 className="font-orbitron text-sm text-white">{t.notifications.title}</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs text-cyber-yellow">{unreadCount} {t.notifications.unread}</span>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        onClick={() => {
                          setShowNotifications(false);
                          navigate('/game/messages');
                        }}
                        className={`p-3 border-b border-space-700/50 cursor-pointer hover:bg-space-700/50 transition-colors ${
                          !notification.is_read ? 'bg-space-700/30' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${getNotificationColor(notification.message_type)}`}>
                            {getNotificationIcon(notification.message_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${notification.is_read ? 'text-gray-400' : 'text-white font-medium'}`}>
                              {notification.subject}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatRelativeDate(notification.created_at)}
                            </p>
                          </div>
                          {!notification.is_read && (
                            <span className="w-2 h-2 bg-cyber-blue rounded-full flex-shrink-0 mt-2" />
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-gray-500">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t.notifications.noNotifications}</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    navigate('/game/messages');
                  }}
                  className="w-full p-3 text-center text-sm text-cyber-blue hover:bg-space-700/50 transition-colors"
                >
                  {t.notifications.viewAll}
                </button>
              </div>
              </>
            )}
          </div>

          <Link
            to="/game/settings"
            className="p-2 rounded-sm hover:bg-[#d6aa55]/10 transition-colors hidden sm:block"
            title={t.nav.settings}
          >
            <Settings className="w-5 h-5 text-[#d6aa55] hover:text-[#f3dfae]" strokeWidth={1.6} />
          </Link>
          <button
            onClick={() => signOut()}
            className="p-2 rounded-sm hover:bg-red-900/30 transition-colors hidden sm:block"
            title={t.auth.logout}
          >
            <LogOut className="w-5 h-5 text-[#d6aa55] hover:text-red-300" strokeWidth={1.6} />
          </button>
          <div className="w-px h-6 bg-[#d6aa55]/30 hidden sm:block" />

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 p-1 sm:pr-2 rounded-sm hover:bg-[#d6aa55]/10 transition-colors"
            >
              {resolveAvatarUrl(profile?.avatar_url) ? (
                <img
                  src={resolveAvatarUrl(profile?.avatar_url)!}
                  alt={profile?.username}
                  className="w-9 h-9 rounded-full object-cover border-2 border-amber-400/60 shadow-[0_0_10px_rgba(251,191,36,0.35)]"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyber-blue to-cyber-green flex items-center justify-center border-2 border-amber-400/60">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
              <span className="hidden sm:flex flex-col items-start leading-tight max-w-[160px]">
                <span className="text-white text-sm font-semibold truncate max-w-full">{profile?.username}</span>
                {profile?.active_title && (
                  <span className="text-[10px] text-amber-300 truncate max-w-full">{profile.active_title}</span>
                )}
              </span>
              {profile?.active_badge && (
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-red-900/40 to-red-800/20 ring-2 ring-red-500/50 shadow-lg shadow-red-500/30 animate-pulse text-base" style={{ animationDuration: '2s' }} title="Insignia equipada">{profile.active_badge}</span>
              )}
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {showDropdown && (
              <>
                <div 
                  className="fixed inset-0 bg-black/60 z-40 sm:hidden"
                  onClick={() => setShowDropdown(false)}
                />
                <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 w-auto sm:w-56 bg-[#0f0b07] border border-[#8a6a32] rounded-sm p-2 shadow-2xl shadow-black/70 z-50">
                <div className="px-3 py-2 border-b border-cyber-blue/20 mb-2">
                  <p className="font-orbitron text-sm text-white">{profile?.active_title ? <>{profile.active_title} <span className="text-gray-500">·</span> </> : ''}{profile?.username}</p>
                  <p className="text-xs text-gray-400">{profile?.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-cyber-yellow">{t.common.points}:</span>
                    <span className="text-xs text-white font-bold">
                      {profile?.points_total.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2">
                    <RankBadge pointsTotal={profile?.points_total || 0} variant="compact" />
                  </div>
                </div>

                <Link
                  to="/game/wallet"
                  className="flex flex-col gap-2 px-3 py-2 mx-1 mb-1 rounded-lg bg-gradient-to-r from-cyber-yellow/10 to-cyber-yellow/5 border border-cyber-yellow/20 hover:border-cyber-yellow/40 transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-cyber-yellow" />
                      <span className="text-gray-300 text-sm">{t.market.wallet}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <img src={TUNG_LOGO} alt="TUNG" className="w-4 h-4 rounded-full" />
                      <span className="text-cyber-yellow font-orbitron text-sm">
                        {(profile?.tung_balance || 0).toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-500">TUNG</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-cyber-green font-orbitron text-sm">
                        {(profile?.usdt_balance || 0).toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-500">USDT</span>
                    </div>
                  </div>
                </Link>

                <div className="px-3 py-2">
                  <LanguageSelector showLabel={true} />
                </div>

                <Link
                  to="/game/settings"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-space-600 transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  <Settings className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300 text-sm">{t.nav.settings}</span>
                </Link>

                <button
                  onClick={() => signOut()}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-cyber-red/20 transition-colors text-cyber-red"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">{t.auth.logout}</span>
                </button>
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="xl:hidden px-3 sm:px-4 pb-3 pt-1 lg:pt-0">
        <ResourceBar />
      </div>
    </header>
  );
}
