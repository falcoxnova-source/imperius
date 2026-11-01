import { useState, useRef } from 'react';
import { AlertTriangle, Paperclip, Upload, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface EvidenceItem {
  path: string;
  sender_id: string;
  created_at: string;
}

interface Props {
  orderId: string;
  userId: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function P2POpenDisputeModal({ orderId, userId, open, onClose, onSubmitted }: Props) {
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const close = () => {
    if (submitting) return;
    setReason('');
    setFiles([]);
    setError(null);
    onClose();
  };

  const addFiles = (fl: FileList | null) => {
    if (!fl) return;
    const next: File[] = [...files];
    for (const f of Array.from(fl)) {
      if (next.length >= MAX_FILES) break;
      if (f.size > MAX_FILE_SIZE) {
        setError(`"${f.name}" supera 5 MB.`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeFile = (i: number) => {
    setFiles(files.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    if (reason.trim().length < 10) {
      setError('Describe el motivo (mínimo 10 caracteres).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // 1) Upload new evidence files to p2p-evidence bucket
      const evidence: EvidenceItem[] = [];
      const nowIso = new Date().toISOString();
      for (const f of files) {
        const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
        const key = `${orderId}/dispute_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await supabase.storage.from('p2p-evidence').upload(key, f, {
          cacheControl: '3600',
          upsert: false,
          contentType: f.type || 'application/octet-stream',
        });
        if (up.error) throw up.error;
        evidence.push({ path: key, sender_id: userId, created_at: nowIso });
      }

      // 2) Pull existing chat attachments as additional evidence
      try {
        const { data: msgs } = await supabase
          .from('p2p_messages')
          .select('sender_id, attachment_url, created_at')
          .eq('order_id', orderId)
          .not('attachment_url', 'is', null)
          .order('created_at', { ascending: true })
          .limit(50);
        if (msgs) {
          for (const m of msgs as Array<{ sender_id: string; attachment_url: string | null; created_at: string }>) {
            if (m.attachment_url) {
              evidence.push({ path: m.attachment_url, sender_id: m.sender_id, created_at: m.created_at });
            }
          }
        }
      } catch { /* evidencia del chat es opcional */ }

      // 3) Submit
      const { error: rpcErr } = await supabase.rpc('p2p_open_dispute', {
        p_order_id: orderId,
        p_reason: reason.trim(),
        p_evidence: evidence,
      });
      if (rpcErr) throw rpcErr;

      onSubmitted();
      setReason('');
      setFiles([]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la disputa');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="bg-space-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="text-lg font-bold text-white">Abrir disputa</h3>
          </div>
          <button onClick={close} disabled={submitting} className="text-gray-400 hover:text-white disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Un administrador revisará las pruebas y decidirá a quién liberar los fondos.
          Sube capturas de pantalla (comprobantes de pago, mensajes, etc). Se adjuntarán
          también los archivos que ya hayas compartido en el chat de la orden.
        </p>

        <div>
          <label className="block text-xs text-gray-300 mb-1">Motivo detallado *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
            placeholder="Ej: Marcó la orden como pagada pero no recibí ninguna transferencia en mi Banco XYZ. Adjunto captura del estado de mi cuenta a las 20:41."
            className="w-full rounded-lg px-3 py-2 text-sm border border-white/10 focus:border-cyber-blue/60 outline-none"
            style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
            disabled={submitting}
          />
          <p className="text-[10px] text-gray-500 mt-1">{reason.trim().length}/10 mínimo</p>
        </div>

        <div>
          <label className="block text-xs text-gray-300 mb-1">Pruebas (imágenes, hasta {MAX_FILES} de 5 MB)</label>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="cursor-pointer px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-xs flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" />
              Añadir archivos
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                disabled={submitting || files.length >= MAX_FILES}
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
            <span className="text-[10px] text-gray-500">{files.length}/{MAX_FILES}</span>
          </div>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs text-gray-300 bg-space-800/60 border border-white/10 rounded px-2 py-1">
                  <span className="flex items-center gap-1 truncate">
                    <Paperclip className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-gray-500 flex-shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                  </span>
                  <button
                    onClick={() => removeFile(i)}
                    disabled={submitting}
                    className="text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={close}
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:border-gray-400 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting || reason.trim().length < 10}
            className="px-4 py-1.5 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 hover:bg-red-500/30 disabled:opacity-50 text-sm flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            Abrir disputa
          </button>
        </div>
      </div>
    </div>
  );
}
