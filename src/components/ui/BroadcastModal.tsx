import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { X, Megaphone, ExternalLink } from 'lucide-react';
import { formatRelativeDate } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';

interface BroadcastMessage {
  id: string;
  subject: string;
  body: string;
  created_at: string;
  sender?: {
    username: string;
  };
}

function renderTextWithLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-cyber-blue hover:text-cyber-blue/80 underline underline-offset-2 transition-colors"
        >
          {part}
          <ExternalLink className="w-3 h-3 inline-block" />
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function BroadcastModal() {
  const { profile } = useAuthStore();
  const { t } = useI18n();
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!profile?.id) return;

    const knownIds = new Set<string>();

    const loadUnreadBroadcasts = async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, subject, body, created_at, sender:profiles!sender_id(username)')
        .eq('recipient_id', profile.id)
        .eq('message_type', 'broadcast')
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        const newMessages = data.filter(m => !knownIds.has(m.id));
        newMessages.forEach(m => knownIds.add(m.id));
        if (newMessages.length > 0) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const toAdd = newMessages.filter(m => !existingIds.has(m.id));
            return [...toAdd, ...prev] as BroadcastMessage[];
          });
        }
      }
    };

    loadUnreadBroadcasts();

    // Realtime: catch new broadcasts instantly (replaces 30s polling)
    const channel = supabase
      .channel(`broadcasts-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload) => {
          const msg = payload.new as { message_type?: string };
          if (msg.message_type === 'broadcast') {
            loadUnreadBroadcasts();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const handleClose = async () => {
    const currentMessage = messages[currentIndex];
    if (currentMessage) {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('id', currentMessage.id);
    }

    if (currentIndex < messages.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setMessages([]);
      setCurrentIndex(0);
    }
  };

  const currentMessage = messages[currentIndex];
  if (!currentMessage) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="card-glass w-full max-w-lg overflow-hidden animate-slide-in-up">
        <div className="bg-gradient-to-r from-cyber-orange/20 to-cyber-yellow/20 border-b border-cyber-orange/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyber-orange/20 rounded-lg">
                <Megaphone className="w-6 h-6 text-cyber-orange" />
              </div>
              <div>
                <h2 className="font-orbitron text-lg text-white">
                  {t.broadcast.adminAnnouncement}
                </h2>
                <p className="text-xs text-gray-400">
                  {formatRelativeDate(currentMessage.created_at)}
                  {messages.length > 1 && (
                    <span className="ml-2 text-cyber-orange">
                      ({currentIndex + 1} {t.broadcast.of} {messages.length})
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-space-600 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <h3 className="font-semibold text-white text-lg mb-4">
            {currentMessage.subject}
          </h3>
          <div className="text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">
            {renderTextWithLinks(currentMessage.body)}
          </div>
        </div>

        <div className="border-t border-space-700 p-4 flex justify-end">
          <button
            onClick={handleClose}
            className="btn-cyber"
          >
            {currentIndex < messages.length - 1 ? t.broadcast.next : t.broadcast.understood}
          </button>
        </div>
      </div>
    </div>
  );
}
