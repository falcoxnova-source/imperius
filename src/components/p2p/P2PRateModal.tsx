import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface P2PRateModalProps {
  orderId: string;
  counterpartName: string;
  onClose: () => void;
  onDone?: () => void;
}

export function P2PRateModal({ orderId, counterpartName, onClose, onDone }: P2PRateModalProps) {
  const [stars, setStars] = useState<number>(5);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.rpc('p2p_rate_order', {
        p_order_id: orderId,
        p_stars: stars,
        p_comment: comment.trim() || null,
      });
      if (error) throw error;
      onDone?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la calificación');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-space-900 border border-cyber-blue/30 rounded-xl w-full max-w-md p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">Califica a {counterpartName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">Tu calificación es pública y ayuda a otros traders a confiar en usuarios serios.</p>

        <div className="flex items-center justify-center gap-1 my-4">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (hover || stars) >= n;
            return (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setStars(n)}
                className="p-1"
              >
                <Star className={`w-8 h-8 ${active ? 'text-amber-400 fill-amber-400' : 'text-gray-600'}`} />
              </button>
            );
          })}
        </div>
        <p className="text-center text-sm text-gray-300 mb-3">{stars}/5 estrellas</p>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comentario opcional (máx 500 caracteres)…"
          maxLength={500}
          rows={3}
          style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
          className="w-full px-3 py-2 rounded-lg border border-white/10 text-sm placeholder-gray-500 focus:outline-none focus:border-cyber-blue/50"
        />

        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 text-xs hover:border-gray-400">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-xs disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Enviar calificación'}
          </button>
        </div>
      </div>
    </div>
  );
}
