import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, RefreshCw, CheckCircle2, XCircle, Clock3, Search, IdCard, Camera, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface KycRow {
  kyc_id: string;
  user_id: string;
  username: string | null;
  email: string | null;
  full_name: string;
  document_type: string;
  document_number: string;
  country_code: string | null;
  date_of_birth: string | null;
  document_photo_path: string;
  selfie_photo_path: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_id: string | null;
  admin_username: string | null;
  admin_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'all';

const DOC_LABEL: Record<string, string> = {
  national_id: 'DNI / Identidad',
  passport: 'Pasaporte',
  drivers_license: 'Licencia',
  other: 'Otro',
};

export function AdminKYC() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<KycRow[]>([]);
  const [status, setStatus] = useState<FilterStatus>('pending');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rejectRow, setRejectRow] = useState<KycRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('kyc_admin_list', { p_status: 'all' });
      if (error) throw error;
      setRows((data as KycRow[]) || []);
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Error cargando KYC' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (row: KycRow, approve: boolean, rejectNotes?: string) => {
    let notes: string | null = null;
    if (!approve) {
      notes = (rejectNotes || '').trim();
      if (notes.length < 3) {
        setMessage({ type: 'error', text: 'Debes indicar el motivo del rechazo.' });
        return;
      }
    } else {
      if (!window.confirm(`¿Aprobar la verificación de ${row.username || row.full_name}?`)) return;
      notes = window.prompt('Nota opcional para el usuario:', '') || null;
    }
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('kyc_admin_review', {
        p_kyc_id: row.kyc_id,
        p_approve: approve,
        p_notes: notes,
      });
      if (error) throw error;
      if (!approve) {
        setRejectRow(null);
        setRejectReason('');
      }
      setMessage({ type: 'success', text: `KYC ${approve ? 'aprobado' : 'rechazado'}: ${row.username || row.full_name}` });
      await load();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'No se pudo procesar' });
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    all: rows.length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!q) return true;
      return (
        (r.username || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.full_name || '').toLowerCase().includes(q) ||
        (r.document_number || '').toLowerCase().includes(q)
      );
    });
  }, [rows, status, search]);

  const pill = (s: string) => {
    if (s === 'pending') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    if (s === 'approved') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    if (s === 'rejected') return 'bg-red-500/20 text-red-300 border-red-500/40';
    return 'bg-gray-500/20 text-gray-300 border-gray-500/40';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Verificaciones KYC</h2>
        </div>
        <button
          onClick={load}
          disabled={loading || saving}
          className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50 flex items-center gap-2 self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {message && (
        <div className={`rounded-lg border p-3 text-sm ${message.type === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['pending', 'approved', 'rejected', 'all'] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${status === s ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200' : 'border-white/10 text-gray-300 hover:bg-white/5'}`}
          >
            {s === 'pending' ? 'Pendientes' : s === 'approved' ? 'Aprobados' : s === 'rejected' ? 'Rechazados' : 'Todos'}
            <span className="ml-1 opacity-70">({counts[s]})</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuario / documento…"
            className="pl-8 pr-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">No hay solicitudes en esta categoría.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => (
            <div key={r.kyc_id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-cyan-300" />
                    <span className="text-white font-semibold">{r.username || '—'}</span>
                    <span className={`px-2 py-0.5 rounded text-xs border ${pill(r.status)}`}>
                      {r.status === 'pending' ? 'Pendiente' : r.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{r.email}</p>
                </div>
                <div className="text-right text-xs text-gray-400">
                  <Clock3 className="w-3.5 h-3.5 inline mr-1" />
                  {new Date(r.submitted_at).toLocaleString()}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                <Field label="Nombre" value={r.full_name} />
                <Field label="Documento" value={DOC_LABEL[r.document_type] || r.document_type} />
                <Field label="Número" value={r.document_number} />
                <Field label="País" value={r.country_code || '—'} />
                {r.date_of_birth && <Field label="Nacimiento" value={r.date_of_birth} />}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <KycImage label="Documento" icon={<IdCard className="w-4 h-4" />} path={r.document_photo_path} />
                <KycImage label="Selfie con documento" icon={<Camera className="w-4 h-4" />} path={r.selfie_photo_path} />
              </div>

              {r.admin_notes && (
                <p className="text-xs text-gray-400 mt-3">
                  Nota admin{r.admin_username ? ` (${r.admin_username})` : ''}: {r.admin_notes}
                </p>
              )}

              {r.status === 'pending' && (
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => review(r, true)}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Aprobar
                  </button>
                  <button
                    onClick={() => { setRejectRow(r); setRejectReason(''); setMessage(null); }}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 disabled:opacity-50 flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" /> Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejectRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-[#0d1220] p-5 space-y-3">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400" />
              Rechazar KYC de {rejectRow.username || rejectRow.full_name}
            </h3>
            <label className="block text-sm text-gray-300">
              Motivo del rechazo (obligatorio, se enviará al usuario):
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              maxLength={500}
              autoFocus
              placeholder="Ej: La foto del documento está borrosa"
              className="w-full rounded-lg bg-black/40 border border-white/10 p-2 text-white text-sm outline-none focus:border-red-500"
            />
            {message?.type === 'error' && (
              <p className="text-sm text-red-300">{message.text}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setRejectRow(null); setRejectReason(''); }}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => review(rejectRow, false, rejectReason)}
                disabled={saving || rejectReason.trim().length < 3}
                className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 disabled:opacity-50 flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" /> {saving ? 'Rechazando…' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-white break-words">{value}</p>
    </div>
  );
}

function isHeic(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  const tag = String.fromCharCode(...bytes.slice(4, 8));
  const brand = String.fromCharCode(...bytes.slice(8, 12));
  return tag === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand);
}

function KycImage({ label, icon, path }: { label: string; icon: React.ReactNode; path: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'heic' | 'error'>('idle');
  const [attempt, setAttempt] = useState(0);

  // Only load when the card is near the viewport (avoids hundreds of multi-MB downloads at once)
  useEffect(() => {
    const el = boxRef.current;
    if (!el || visible) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); obs.disconnect(); }
    }, { rootMargin: '400px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  useEffect(() => {
    if (!visible || !path) return;
    let active = true;
    setState('loading');
    (async () => {
      const { data, error } = await supabase.storage.from('kyc-documents').createSignedUrl(path, 3600);
      if (!active) return;
      if (error || !data?.signedUrl) { setState('error'); return; }
      setUrl(data.signedUrl);
      setState('ok');
    })().catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [visible, path, attempt]);

  // <img> failed: download the file directly to detect HEIC or show it from a blob
  const handleImgError = async () => {
    try {
      const { data, error } = await supabase.storage.from('kyc-documents').download(path);
      if (error || !data) throw error || new Error('no data');
      const head = new Uint8Array(await data.slice(0, 16).arrayBuffer());
      const objUrl = URL.createObjectURL(data);
      setBlobUrl(objUrl);
      setState(isHeic(head) ? 'heic' : 'error');
    } catch {
      setState('error');
    }
  };

  const retry = () => { setUrl(''); setAttempt((a) => a + 1); };

  return (
    <div ref={boxRef} className="rounded-lg border border-white/10 bg-black/30 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 border-b border-white/10">
        <span className="text-cyan-300">{icon}</span> {label}
      </div>
      {state === 'heic' ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-amber-300 text-sm text-center px-3">
          <span>Foto en formato HEIC (iPhone): el navegador no la puede mostrar.</span>
          <a href={blobUrl} download={`${path.split('/').pop()?.replace(/\.\w+$/, '') || 'kyc'}.heic`} className="px-3 py-1 rounded border border-amber-500/50 hover:bg-amber-500/10">
            Descargar
          </a>
        </div>
      ) : state === 'error' ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-red-400 text-sm">
          <span>No disponible</span>
          <button onClick={retry} className="px-3 py-1 rounded border border-red-500/50 hover:bg-red-500/10 text-xs">Reintentar</button>
        </div>
      ) : state === 'ok' && url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={label} loading="lazy" decoding="async" onError={handleImgError} className="w-full h-64 object-contain bg-black/50 hover:opacity-90" />
        </a>
      ) : (
        <div className="h-48 flex items-center justify-center text-gray-500 text-sm">Cargando…</div>
      )}
    </div>
  );
}
