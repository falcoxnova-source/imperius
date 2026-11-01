import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import {
  X,
  Swords,
  Eye,
  Package,
  Shield,
  Compass,
  AlertCircle,
  Bell
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface Notification {
  id: string;
  type: 'battle' | 'espionage' | 'transport' | 'expedition' | 'alliance' | 'system';
  title: string;
  message: string;
  timestamp: Date;
}

function getTypeConfig(t: any) {
  return {
    battle: {
      icon: Swords,
      color: 'bg-cyber-red/20 border-cyber-red/50 text-cyber-red',
      label: t.notificationToast.battle
    },
    espionage: {
      icon: Eye,
      color: 'bg-cyber-blue/20 border-cyber-blue/50 text-cyber-blue',
      label: t.notificationToast.espionage
    },
    transport: {
      icon: Package,
      color: 'bg-cyber-green/20 border-cyber-green/50 text-cyber-green',
      label: t.notificationToast.transport
    },
    expedition: {
      icon: Compass,
      color: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
      label: t.notificationToast.expedition
    },
    alliance: {
      icon: Shield,
      color: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
      label: t.notificationToast.alliance
    },
    system: {
      icon: AlertCircle,
      color: 'bg-cyber-orange/20 border-cyber-orange/50 text-cyber-orange',
      label: t.notificationToast.system
    },
  };
}

export function NotificationSystem() {
  const { profile } = useAuthStore();
  const { t } = useI18n();
  const typeConfig = getTypeConfig(t);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const newNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };

    setNotifications(prev => [newNotification, ...prev].slice(0, 5));
    setUnreadCount(prev => prev + 1);

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
    }, 8000);
  }, []);

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`messages-toast-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload) => {
          const message = payload.new as {
            message_type: string;
            subject: string;
            body: string;
          };

          let notifType: Notification['type'] = 'system';
          let title = message.subject;
          let notifMessage = '';

          switch (message.message_type) {
            case 'battle':
              notifType = 'battle';
              notifMessage = t.notificationToast.battleReceived;
              break;
            case 'espionage':
              notifType = 'espionage';
              notifMessage = t.notificationToast.espionageReceived;
              break;
            case 'expedition':
              notifType = 'expedition';
              notifMessage = t.notificationToast.expeditionReturned;
              break;
            case 'alliance':
              notifType = 'alliance';
              notifMessage = t.notificationToast.allianceMessage;
              break;
            case 'transport':
              notifType = 'transport';
              notifMessage = t.notificationToast.resourcesReceived;
              break;
            default:
              notifType = 'system';
              notifMessage = t.notificationToast.newMessageReceived;
          }

          addNotification({
            type: notifType,
            title,
            message: notifMessage,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, addNotification]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((notification) => {
        const config = typeConfig[notification.type];
        const Icon = config.icon;

        return (
          <div
            key={notification.id}
            className={`animate-slide-in-right ${config.color} border rounded-lg p-4 shadow-lg backdrop-blur-sm`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-space-800/50">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase opacity-70">
                    {config.label}
                  </span>
                </div>
                <p className="font-semibold text-white text-sm truncate">
                  {notification.title}
                </p>
                <p className="text-xs opacity-80 mt-0.5">
                  {notification.message}
                </p>
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="p-1 hover:bg-space-700 rounded transition-colors"
              >
                <X className="w-4 h-4 opacity-60" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NotificationBell() {
  const { profile } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile?.id) return;

    const loadUnreadCount = async () => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', profile.id)
        .eq('is_read', false);

      setUnreadCount(count || 0);
    };

    // Load initial count
    loadUnreadCount();

    // Realtime: refresh count on new message (replaces 30s polling)
    const channel = supabase
      .channel(`bell-unread-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          loadUnreadCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  return (
    <div className="relative">
      <Bell className="w-5 h-5 text-gray-400" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyber-red text-white text-xs rounded-full flex items-center justify-center font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  );
}
