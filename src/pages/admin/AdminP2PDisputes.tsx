import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, XCircle, Clock3, TrendingUp, Ban, Users, Paperclip, MessageSquare, Search, Download, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface HealthMetrics {
  total_orders: number;
  disputed_orders: number;
  resolved_disputes: number;
  open_disputes: number;
  sla_breached_disputes: number;
  banned_users: number;
  avg_resolution_hours: number;
  dispute_rate_pct: number;
  top_sellers_30d: Array<{ seller_id: string; username: string | null; orders_count: number; volume_fxu_eq: number }>;
}

interface EvidenceItem {
  path: string;
  sender_id?: string;
  created_at?: string;
}

interface DisputeRow {
  dispute_id: string;
  order_id: string;
  offer_id: string;
  dispute_status: string;
  reason: string;
  admin_notes: string | null;
  evidence: EvidenceItem[] | null;
  opened_by: string;
  opened_at: string;
  resolved_at: string | null;
  asset: string;
  asset_amount: number;
  fiat_currency: string;
  fiat_amount: number;
  seller_id: string;
  seller_name: string | null;
  buyer_id: string;
  buyer_name: string | null;
  order_status: string;
  order_created_at: string;
}

type FilterStatus = 'open' | 'investigating' | 'resolved_buyer' | 'resolved_seller' | 'cancelled' | 'all';
type Tab = 'active' | 'history';

export function AdminP2PDisputes() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  const [status, setStatus] = useState<FilterStatus>('all');
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [dRes, mRes] = await Promise.all([
        // Cargamos todas y filtramos en cliente por pestaña / estado / búsqueda
        supabase.rpc('p2p_admin_list_disputes', { p_status: 'all' }),
        supabase.rpc('get_p2p_health_metrics'),
      ]);
      if (dRes.error) throw dRes.error;
      // El token del juego se muestra como "TUNG" (internamente 'FXU').
      const branded = ((dRes.data as DisputeRow[]) || []).map((r) => ({
        ...r,
        asset: String(r.asset || '').toUpperCase() === 'FXU' ? 'TUNG' : r.asset,
        fiat_currency: String(r.fiat_currency || '').toUpperCase() === 'FXU' ? 'TUNG' : r.fiat_currency,
      }));
      setRows(branded);
      if (!mRes.error && mRes.data) setMetrics(mRes.data as HealthMetrics);
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Error cargando disputas' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (row: DisputeRow, releaseToBuyer: boolean) => {
    const targetLabel = releaseToBuyer
      ? `LIBERAR al comprador (${row.buyer_name || row.buyer_id.slice(0, 8)})`
      : `DEVOLVER al vendedor (${row.seller_name || row.seller_id.slice(0, 8)})`;

    const confirmed = window.confirm(
      `¿Confirmas ${targetLabel}?\n\n` +
      `Orden: ${row.asset_amount} ${row.asset} ↔ ${row.fiat_amount} ${row.fiat_currency}\n` +
      `Motivo disputa: ${row.reason.slice(0, 200)}\n\n` +
      `Esta acción es IRREVERSIBLE.`
    );
    if (!confirmed) return;

    const notes = window.prompt('Notas internas (motivo de tu decisión, opcional):', '') || null;

    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('p2p_admin_resolve_dispute', {
        p_order_id: row.order_id,
        p_release_to_buyer: releaseToBuyer,
        p_admin_notes: notes,
      });
      if (error) throw error;
      setMessage({ type: 'success', text: `Disputa resuelta: ${targetLabel}` });
      await load();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'No se pudo resolver' });
    } finally {
      setSaving(false);
    }
  };

  const statusPill = (s: string) => {
    if (s === 'open') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    if (s === 'investigating') return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    if (s === 'resolved_buyer') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    if (s === 'resolved_seller') return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    if (s === 'cancelled') return 'bg-gray-500/20 text-gray-300 border-gray-500/40';
    return 'bg-gray-500/20 text-gray-300 border-gray-500/40';
  };

  const filteredRows = (() => {
    const q = search.trim().toLowerCase();
    const ACTIVE_STATUSES = new Set(['open', 'investigating']);
    const HISTORY_STATUSES = new Set(['resolved_buyer', 'resolved_seller', 'cancelled']);
    const byTab = rows.filter((r) => (
      tab === 'active'
        ? ACTIVE_STATUSES.has(r.dispute_status)
        : HISTORY_STATUSES.has(r.dispute_status)
    ));
    const byStatus = status === 'all' ? byTab : byTab.filter((r) => r.dispute_status === status);
    if (!q) return byStatus;
    return byStatus.filter((r) => {
      const hay = [
        r.seller_name,
        r.buyer_name,
        r.seller_id,
        r.buyer_id,
        r.order_id,
        r.dispute_id,
        r.reason,
        r.admin_notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  })();

  const activeCount = rows.filter((r) => r.dispute_status === 'open' || r.dispute_status === 'investigating').length;
  const historyCount = rows.filter((r) => r.dispute_status === 'resolved_buyer' || r.dispute_status === 'resolved_seller' || r.dispute_status === 'cancelled').length;

  const exportCsv = (data: DisputeRow[]) => {
    if (data.length === 0) return;
    const headers = [
      'dispute_id','order_id','status','opened_at','resolved_at',
      'seller_id','seller_name','buyer_id','buyer_name',
      'asset','asset_amount','fiat_currency','fiat_amount',
      'opened_by_role','reason','admin_notes','order_status','evidence_count',
    ];
    const escape = (v: unknown): string => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const lines = [headers.join(',')];
    data.forEach((r) => {
      const role = r.opened_by === r.seller_id ? 'seller' : 'buyer';
      lines.push([
        r.dispute_id, r.order_id, r.dispute_status, r.opened_at, r.resolved_at || '',
        r.seller_id, r.seller_name || '', r.buyer_id, r.buyer_name || '',
        r.asset, r.asset_amount, r.fiat_currency, r.fiat_amount,
        role, r.reason, r.admin_notes || '', r.order_status,
        Array.isArray(r.evidence) ? r.evidence.length : 0,
      ].map(escape).join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `p2p_disputes_${status}_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const purgeOldEvidence = async () => {
    if (!window.confirm('Esto borrará los archivos físicos de evidencia de disputas resueltas hace más de 90 días. Las filas y los motivos se conservan. ¿Continuar?')) return;
    setPurging(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('p2p_cleanup_old_dispute_evidence', { p_days: null });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const deleted = row?.deleted_count ?? 0;
      const scanned = row?.scanned_disputes ?? 0;
      setMessage({ type: 'success', text: `Purga completada: ${deleted} archivos borrados de ${scanned} disputas antiguas.` });
      await load();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Error en la purga' });
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-white">Disputas P2P</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por usuario / order id / motivo…"
              className="bg-slate-800 border border-slate-600 rounded-lg pl-7 pr-3 py-1.5 text-white text-sm w-64"
              style={{ color: '#ffffff' }}
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as FilterStatus)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
          >
            {tab === 'active' ? (
              <>
                <option value="all">Activas (todas)</option>
                <option value="open">Abiertas{metrics ? ` (${metrics.open_disputes ?? 0})` : ''}</option>
                <option value="investigating">En investigación</option>
              </>
            ) : (
              <>
                <option value="all">Historial (todas)</option>
                <option value="resolved_buyer">A favor del comprador</option>
                <option value="resolved_seller">A favor del vendedor</option>
                <option value="cancelled">Canceladas</option>
              </>
            )}
          </select>
          <button
            onClick={load}
            disabled={loading || saving}
            className="px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-sm flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={() => exportCsv(filteredRows)}
            disabled={loading || filteredRows.length === 0}
            className="px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-sm flex items-center gap-2"
            title="Descargar CSV de las disputas filtradas"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={purgeOldEvidence}
            disabled={purging}
            className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-sm flex items-center gap-2"
            title="Borra archivos de evidencia de disputas resueltas hace > 90 días (los registros se conservan)"
          >
            <Trash2 className={`w-4 h-4 ${purging ? 'animate-pulse' : ''}`} /> Purgar antiguas
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg border px-4 py-2 text-sm ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* Pestañas: Activas / Historial */}
      <div className="flex items-center gap-1 border-b border-slate-700/60">
        <button
          onClick={() => { setTab('active'); setStatus('all'); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-2 ${tab === 'active' ? 'border-amber-400 text-amber-300' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
        >
          <AlertTriangle className="w-4 h-4" />
          Activas
          <span className={`px-1.5 py-0.5 rounded text-[10px] ${tab === 'active' ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-800 text-gray-400'}`}>{activeCount}</span>
        </button>
        <button
          onClick={() => { setTab('history'); setStatus('all'); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-2 ${tab === 'history' ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Historial
          <span className={`px-1.5 py-0.5 rounded text-[10px] ${tab === 'history' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-800 text-gray-400'}`}>{historyCount}</span>
        </button>
      </div>

      {/* Health metrics (Fase 6) */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="p-2 bg-slate-800/40 border border-slate-700/30 rounded">
            <p className="text-[10px] text-slate-400 uppercase flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-400"/>Abiertas</p>
            <p className="text-lg font-bold text-red-300">{metrics.open_disputes}</p>
            {metrics.sla_breached_disputes > 0 && <p className="text-[10px] text-red-400">{metrics.sla_breached_disputes} &gt; 24h SLA</p>}
          </div>
          <div className="p-2 bg-slate-800/40 border border-slate-700/30 rounded">
            <p className="text-[10px] text-slate-400 uppercase flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400"/>Resueltas</p>
            <p className="text-lg font-bold text-emerald-300">{metrics.resolved_disputes}</p>
            <p className="text-[10px] text-emerald-400">{metrics.avg_resolution_hours}h avg</p>
          </div>
          <div className="p-2 bg-slate-800/40 border border-slate-700/30 rounded">
            <p className="text-[10px] text-slate-400 uppercase flex items-center gap-1"><TrendingUp className="w-3 h-3 text-amber-400"/>Tasa disputa</p>
            <p className="text-lg font-bold text-amber-300">{metrics.dispute_rate_pct}%</p>
            <p className="text-[10px] text-amber-400">{metrics.disputed_orders}/{metrics.total_orders} órd.</p>
          </div>
          <div className="p-2 bg-slate-800/40 border border-slate-700/30 rounded">
            <p className="text-[10px] text-slate-400 uppercase flex items-center gap-1"><Ban className="w-3 h-3 text-red-400"/>Baneados</p>
            <p className="text-lg font-bold text-red-300">{metrics.banned_users}</p>
            <p className="text-[10px] text-slate-500">auto-ban 7d</p>
          </div>
        </div>
      )}

      {metrics && metrics.top_sellers_30d && metrics.top_sellers_30d.length > 0 && (
        <div className="p-2 bg-slate-800/30 rounded border border-slate-700/30">
          <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1"><Users className="w-3 h-3"/>Top 5 vendedores (30d, TUNG-eq)</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-1 text-[11px]">
            {metrics.top_sellers_30d.map((s, i) => (
              <div key={s.seller_id} className="p-1.5 bg-slate-900/60 rounded">
                <p className="text-slate-300 truncate" title={s.username || s.seller_id}>{i+1}. {s.username || s.seller_id.slice(0,6)}</p>
                <p className="text-emerald-300 font-medium">{Number(s.volume_fxu_eq).toLocaleString(undefined,{maximumFractionDigits:0})} TUNG</p>
                <p className="text-slate-500">{s.orders_count} órdenes</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {search.trim().length > 0 && (
          <p className="text-[11px] text-gray-400">{filteredRows.length} de {rows.length} disputas coinciden con “{search.trim()}”</p>
        )}
        {filteredRows.map((row) => {
          const isOpen = row.dispute_status === 'open' || row.dispute_status === 'investigating';
          const ageHours = (Date.now() - new Date(row.opened_at).getTime()) / 3600000;
          const slaBreached = isOpen && ageHours > 24;
          return (
            <div key={row.dispute_id} className={`border rounded-lg p-4 space-y-2 ${slaBreached ? 'bg-red-900/10 border-red-500/40' : 'bg-slate-900/50 border-slate-700/50'}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full border text-xs ${statusPill(row.dispute_status)}`}>
                    {row.dispute_status}
                  </span>
                  {slaBreached && (
                    <span className="px-2 py-0.5 rounded border border-red-500/50 text-red-300 text-[10px] flex items-center gap-1">
                      <Clock3 className="w-3 h-3"/>SLA {ageHours.toFixed(1)}h
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  Abierta: {new Date(row.opened_at).toLocaleString()}
                  {row.resolved_at && ` • Resuelta: ${new Date(row.resolved_at).toLocaleString()}`}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Vendedor</p>
                  <p className="text-white font-semibold">{row.seller_name || row.seller_id.slice(0, 8)}</p>
                  <p className="text-[10px] text-gray-500 font-mono">{row.seller_id}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Comprador</p>
                  <p className="text-white font-semibold">{row.buyer_name || row.buyer_id.slice(0, 8)}</p>
                  <p className="text-[10px] text-gray-500 font-mono">{row.buyer_id}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Orden</p>
                  <p className="text-white">
                    {Number(row.asset_amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {row.asset} ↔{' '}
                    {Number(row.fiat_amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {row.fiat_currency}
                  </p>
                  <p className="text-[10px] text-gray-500">Estado orden: {row.order_status}</p>
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Motivo (denunciante: {row.opened_by === row.seller_id ? 'Vendedor' : 'Comprador'}):</p>
                <p className="text-sm text-gray-200 whitespace-pre-wrap">{row.reason}</p>
                {row.admin_notes && (
                  <>
                    <p className="text-xs text-gray-400 mt-2 mb-1">Notas admin:</p>
                    <p className="text-sm text-cyan-300 whitespace-pre-wrap">{row.admin_notes}</p>
                  </>
                )}
              </div>

              <EvidenceGallery orderId={row.order_id} evidence={row.evidence || []} />

              {isOpen && (
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-700/50">
                  <button
                    onClick={() => resolve(row, true)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-xs flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Liberar al comprador
                  </button>
                  <button
                    onClick={() => resolve(row, false)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 text-xs flex items-center gap-1"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" /> Devolver al vendedor
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!loading && filteredRows.length === 0 && (
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-8 text-center">
            <XCircle className="w-10 h-10 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400">{search.trim() ? 'Ninguna disputa coincide con la búsqueda.' : 'No hay disputas con ese filtro.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Evidence gallery sub-component ---------------------------------------
function EvidenceGallery({ orderId, evidence }: { orderId: string; evidence: Array<{ path: string; sender_id?: string; created_at?: string }> }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; sender_id: string; body: string; attachment_url: string | null; is_system: boolean; created_at: string }>>([]);
  const [showChat, setShowChat] = useState(false);

  const uniquePaths = Array.from(new Set((evidence || []).map((e) => e.path).filter(Boolean)));

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const next: Record<string, string> = {};
      for (const p of uniquePaths) {
        const { data } = await supabase.storage.from('p2p-evidence').createSignedUrl(p, 3600);
        if (data?.signedUrl) next[p] = data.signedUrl;
      }
      setUrls(next);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (uniquePaths.length > 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadChat = async () => {
    if (showChat) {
      setShowChat(false);
      return;
    }
    setShowChat(true);
    if (chatMessages.length > 0) return;
    const { data } = await supabase
      .from('p2p_messages')
      .select('id, sender_id, body, attachment_url, is_system, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (data) {
      // Sign attachment urls if any
      const msgs = data as Array<{ id: string; sender_id: string; body: string; attachment_url: string | null; is_system: boolean; created_at: string }>;
      setChatMessages(msgs);
      const paths = msgs.map((m) => m.attachment_url).filter(Boolean) as string[];
      const next: Record<string, string> = { ...urls };
      for (const p of paths) {
        if (!next[p]) {
          const { data: s } = await supabase.storage.from('p2p-evidence').createSignedUrl(p, 3600);
          if (s?.signedUrl) next[p] = s.signedUrl;
        }
      }
      setUrls(next);
    }
  };

  const isImage = (url: string | undefined, path: string) => {
    const lower = (url || path).toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|avif)(\?|$)/.test(lower);
  };

  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Paperclip className="w-3.5 h-3.5" />
          Pruebas adjuntas: <span className="text-gray-200 font-medium">{uniquePaths.length}</span>
        </p>
        <button
          onClick={loadChat}
          className="px-2 py-1 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-[11px] flex items-center gap-1"
        >
          <MessageSquare className="w-3 h-3" /> {showChat ? 'Ocultar' : 'Ver'} chat completo
        </button>
      </div>

      {uniquePaths.length === 0 && (
        <p className="text-[11px] text-gray-500 italic">Sin pruebas subidas. Revisa el chat completo para contexto.</p>
      )}

      {loading && <p className="text-[11px] text-gray-500">Cargando pruebas…</p>}

      {uniquePaths.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {uniquePaths.map((p) => {
            const url = urls[p];
            const filename = p.split('/').pop() || p;
            return (
              <a
                key={p}
                href={url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-space-950/60 border border-white/10 rounded hover:border-cyan-500/50 transition overflow-hidden"
                title={p}
              >
                {url && isImage(url, p) ? (
                  <img src={url} alt={filename} className="w-full h-24 object-cover" />
                ) : (
                  <div className="w-full h-24 flex items-center justify-center text-gray-500">
                    <Paperclip className="w-6 h-6" />
                  </div>
                )}
                <p className="text-[10px] text-gray-400 truncate px-1 py-0.5">{filename}</p>
              </a>
            );
          })}
        </div>
      )}

      {showChat && (
        <div className="mt-2 max-h-80 overflow-y-auto bg-space-950/60 border border-white/10 rounded p-2 space-y-1 text-[11px]">
          {chatMessages.length === 0 && <p className="text-gray-500 italic">Sin mensajes en el chat.</p>}
          {chatMessages.map((m) => (
            <div key={m.id} className={`${m.is_system ? 'text-amber-300' : 'text-gray-200'}`}>
              <span className="text-gray-500">[{new Date(m.created_at).toLocaleString()}]</span>{' '}
              <span className="text-cyan-300 font-mono">{m.sender_id.slice(0, 8)}:</span>{' '}
              <span className="whitespace-pre-wrap">{m.body}</span>
              {m.attachment_url && urls[m.attachment_url] && (
                <a
                  href={urls[m.attachment_url]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 underline text-cyan-400"
                >
                  📎 adjunto
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
