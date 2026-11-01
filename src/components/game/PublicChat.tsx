import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Smile, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

const MAX_LEN = 300;
const HISTORY = 50;
const COOLDOWN_MS = 3000;

const EMOJIS = [
  '😀', '😂', '😍', '😎', '😭', '😡', '🤔', '😱',
  '👍', '👎', '👏', '🙏', '💪', '🔥', '💀', '👀',
  '🚀', '🛸', '🪐', '⭐', '💥', '⚔️', '🛡️', '🏆',
  '💰', '💎', '🎁', '❤️', '🤝', '🎉', '⚡', '☠️',
];

interface ChatMessage {
  id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  alliance_tag: string | null;
  message: string;
  created_at: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Chat publico global. Carga los ultimos mensajes una sola vez y despues se
 * alimenta por realtime (INSERT), sin polling, para no cargar el servidor.
 */
export function PublicChat() {
  const { profile } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSentRef = useRef<number>(0);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastTsRef = useRef<string | null>(null);
  const idleTicksRef = useRef<number>(0);
  const pollNowRef = useRef<(() => void) | null>(null);
  const firstScrollRef = useRef<boolean>(true);

  const pushMessages = useCallback((rows: ChatMessage[]) => {
    const fresh = rows.filter((r) => !seenIdsRef.current.has(r.id));
    if (fresh.length === 0) return false;
    fresh.forEach((r) => seenIdsRef.current.add(r.id));
    setMessages((prev) => {
      const next = [...prev, ...fresh].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      return next.length > HISTORY * 3 ? next.slice(-HISTORY * 3) : next;
    });
    return true;
  }, []);

  // Carga inicial + refresco incremental.
  // El servidor no tiene el servicio de realtime (websocket) activo, asi que se
  // consultan solo los mensajes NUEVOS: la query usa el indice de created_at y
  // casi siempre devuelve 0 filas, por lo que el coste es practicamente nulo.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchMessages = async (initial: boolean) => {
      const cols = 'id, user_id, username, avatar_url, alliance_tag, message, created_at';
      const useHistory = initial || !lastTsRef.current;

      const query = useHistory
        ? supabase.from('public_chat_messages').select(cols)
            .order('created_at', { ascending: false }).limit(HISTORY)
        : supabase.from('public_chat_messages').select(cols)
            .gte('created_at', lastTsRef.current as string)
            .order('created_at', { ascending: true }).limit(HISTORY);

      const { data, error: err } = await query;
      if (!active) return;

      if (err) {
        if (initial) setError('No se pudo cargar el chat');
        return;
      }

      let rows = (data || []) as ChatMessage[];
      if (useHistory) rows = rows.slice().reverse();

      for (const r of rows) {
        if (!lastTsRef.current || new Date(r.created_at) > new Date(lastTsRef.current)) {
          lastTsRef.current = r.created_at;
        }
      }

      const added = pushMessages(rows);
      idleTicksRef.current = added ? 0 : idleTicksRef.current + 1;
    };

    const schedule = () => {
      if (!active) return;
      // 4s con actividad, 12s si lleva un rato sin mensajes nuevos
      const delay = idleTicksRef.current > 45 ? 12000 : 4000;
      timer = setTimeout(async () => {
        if (!document.hidden) await fetchMessages(false);
        schedule();
      }, delay);
    };

    const onVisible = () => {
      if (!document.hidden) {
        idleTicksRef.current = 0;
        void fetchMessages(false);
      }
    };

    pollNowRef.current = () => {
      idleTicksRef.current = 0;
      void fetchMessages(false);
    };

    (async () => {
      await fetchMessages(true);
      if (active) setLoading(false);
      schedule();
    })();

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      pollNowRef.current = null;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pushMessages]);

  useEffect(() => {
    if (loading) return;
    const el = listRef.current;
    if (!el) return;
    if (firstScrollRef.current) {
      el.scrollTop = el.scrollHeight;
      firstScrollRef.current = false;
      return;
    }
    // Solo baja solo si el usuario ya estaba abajo (no interrumpe si esta leyendo arriba)
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 250) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;

    if (Date.now() - lastSentRef.current < COOLDOWN_MS) {
      setError('Espera unos segundos antes de volver a escribir');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('send_public_chat_message', {
        p_message: body,
      });
      if (err) {
        setError('No se pudo enviar el mensaje');
        return;
      }
      const res = data as { success: boolean; error?: string } | null;
      if (!res?.success) {
        setError(res?.error || 'No se pudo enviar el mensaje');
        return;
      }
      lastSentRef.current = Date.now();
      setText('');
      setShowEmojis(false);
      // Refresco inmediato para ver el mensaje propio al instante
      pollNowRef.current?.();
    } finally {
      setSending(false);
    }
  };

  const addEmoji = (emoji: string) => {
    setText((prev) => (prev + emoji).slice(0, MAX_LEN));
    inputRef.current?.focus();
  };

  return (
    <div className="card-glass p-4 sm:p-6 flex flex-col" style={{ height: '70vh', minHeight: 420 }}>
      <div className="flex items-center justify-between border-b border-space-700 pb-3 mb-3">
        <h2 className="font-orbitron text-lg text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-cyber-blue" />
          Chat público
        </h2>
        <span className="text-xs text-gray-500">Últimos {HISTORY} mensajes</span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm text-center px-4">
            Todavía no hay mensajes. ¡Sé el primero en saludar!
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === profile?.id;
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {m.avatar_url ? (
                  <img
                    src={m.avatar_url}
                    alt=""
                    loading="lazy"
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-space-600"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-space-700 flex-shrink-0 flex items-center justify-center text-xs text-gray-400 font-bold">
                    {(m.username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={`max-w-[75%] ${mine ? 'text-right' : ''}`}>
                  <div className="flex items-center gap-2 text-xs mb-0.5 flex-wrap">
                    <span className={mine ? 'text-cyber-blue font-semibold' : 'text-gray-300 font-semibold'}>
                      {m.username || 'Desconocido'}
                    </span>
                    {m.alliance_tag && (
                      <span className="text-cyber-green">[{m.alliance_tag}]</span>
                    )}
                    <span className="text-gray-600">{formatTime(m.created_at)}</span>
                  </div>
                  <div
                    className={`inline-block px-3 py-2 rounded-lg text-sm break-words whitespace-pre-wrap text-left ${
                      mine ? 'bg-cyber-blue/20 text-white' : 'bg-space-700 text-gray-200'
                    }`}
                  >
                    {m.message}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="mt-3 text-xs text-cyber-red bg-cyber-red/10 border border-cyber-red/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {showEmojis && (
        <div className="mt-3 grid grid-cols-8 gap-1 bg-space-800 border border-space-700 rounded-lg p-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => addEmoji(e)}
              className="text-xl hover:bg-space-700 rounded p-1 transition-colors"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowEmojis((v) => !v)}
          className={`p-2 rounded-lg transition-colors ${
            showEmojis ? 'bg-cyber-blue text-white' : 'bg-space-700 text-gray-400 hover:bg-space-600'
          }`}
          aria-label="Emojis"
        >
          <Smile className="w-5 h-5" />
        </button>
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={text}
            maxLength={MAX_LEN}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Escribe un mensaje..."
            className="w-full bg-space-800 border border-space-600 rounded-lg px-3 py-2 pr-14 text-white text-sm focus:outline-none focus:border-cyber-blue"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-600">
            {text.length}/{MAX_LEN}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !text.trim()}
          className="btn-cyber px-4 py-2 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
