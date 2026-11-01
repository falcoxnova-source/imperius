import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Send, X, MessageSquare, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface P2POrderChatProps {
  orderId: string;
  currentUserId: string;
  counterpartName?: string;
}

interface ChatMessage {
  id: string;
  order_id: string;
  sender_id: string;
  body: string;
  attachment_url: string | null;
  is_system: boolean;
  created_at: string;
}

/**
 * Chat + adjuntos para una orden P2P.
 * - Usa RPC `p2p_send_message` (valida estado de orden y participación).
 * - Sube archivos al bucket privado `p2p-evidence` bajo `{order_id}/...`.
 * - Polling cada 6s (simple, sin realtime) suficiente para ventanas de orden.
 */
export function P2POrderChat({ orderId, currentUserId, counterpartName }: P2POrderChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('p2p_messages')
      .select('id, order_id, sender_id, body, attachment_url, is_system, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .limit(200);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setMessages((data || []) as ChatMessage[]);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Polling ligero
  useEffect(() => {
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getSignedUrl = async (path: string): Promise<string | null> => {
    const { data } = await supabase.storage.from('p2p-evidence').createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  };

  const handleSend = async () => {
    const text = body.trim();
    if (!text && !file) return;
    setSending(true);
    setError(null);
    try {
      let attachmentPath: string | null = null;
      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error('El archivo supera 5 MB');
        const ext = file.name.split('.').pop() || 'bin';
        const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
        const key = `${orderId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
        const up = await supabase.storage.from('p2p-evidence').upload(key, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        });
        if (up.error) throw up.error;
        attachmentPath = key;
      }

      const { error: rpcErr } = await supabase.rpc('p2p_send_message', {
        p_order_id: orderId,
        p_body: text || (attachmentPath ? '(adjunto)' : ''),
        p_attachment_url: attachmentPath,
      });
      if (rpcErr) throw rpcErr;

      setBody('');
      setFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-cyan-300 flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5" />
          Chat con {counterpartName || 'contraparte'}
        </p>
        <p className="text-[10px] text-gray-500 flex items-center gap-1">
          <Shield className="w-3 h-3" /> Cifrado por RLS · solo tú, la contraparte y admin
        </p>
      </div>

      <div
        ref={scrollRef}
        className="max-h-60 overflow-y-auto bg-space-950/60 border border-white/10 rounded-lg p-2 space-y-2 text-sm"
      >
        {loading && messages.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-2">Cargando…</p>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-2">Sin mensajes todavía. Escribe el primero.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-1.5 ${m.is_system ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200' : mine ? 'bg-cyber-blue/15 border border-cyber-blue/30 text-white' : 'bg-space-800 border border-white/10 text-gray-200'}`}>
                <p className="whitespace-pre-wrap break-words text-xs">{m.body}</p>
                {m.attachment_url && (
                  <button
                    onClick={async () => {
                      const url = await getSignedUrl(m.attachment_url!);
                      if (url) window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                    className="mt-1 text-[10px] underline text-cyan-300 hover:text-cyan-200 flex items-center gap-1"
                  >
                    <Paperclip className="w-3 h-3" /> Ver adjunto
                  </button>
                )}
                <p className="text-[9px] text-gray-500 mt-0.5">{new Date(m.created_at).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <label className="cursor-pointer px-2 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:border-cyber-blue/50 hover:text-cyber-blue flex items-center gap-1 text-xs">
          <Paperclip className="w-3.5 h-3.5" />
          <input
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file ? file.name.slice(0, 18) : 'Adjuntar'}
        </label>
        {file && (
          <button onClick={() => setFile(null)} className="text-[10px] text-gray-400 hover:text-red-400 flex items-center gap-0.5">
            <X className="w-3 h-3" /> quitar
          </button>
        )}
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Escribe un mensaje (ej: referencia de transferencia, captura, etc.)"
          maxLength={2000}
          style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
          className="flex-1 px-3 py-1.5 rounded-lg border border-white/10 text-sm placeholder-gray-500 focus:outline-none focus:border-cyber-blue/50"
        />
        <button
          onClick={handleSend}
          disabled={sending || (!body.trim() && !file)}
          className="px-3 py-1.5 rounded-lg border border-cyber-blue/40 text-cyber-blue hover:bg-cyber-blue/10 disabled:opacity-40 flex items-center gap-1 text-xs"
        >
          <Send className="w-3.5 h-3.5" />
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      <p className="text-[10px] text-gray-500 mt-1">Máx 5 MB por adjunto. Imágenes y PDF. Los adjuntos también sirven como evidencia si se abre una disputa.</p>
    </div>
  );
}
