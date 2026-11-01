import { useCallback, useEffect, useState } from 'react';
import {
  Gift,
  Plus,
  Trash2,
  Play,
  Lock,
  Unlock,
  Trophy,
  Loader2,
  AlertCircle,
  RefreshCw,
  Ban,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type PrizeType = 'ship' | 'supply_box' | 'blueprint' | 'officer' | 'vip' | 'tung' | 'dark_matter';

interface CatalogItem {
  code: string;
  name: string;
}

interface Catalog {
  ships: CatalogItem[];
  boxes: CatalogItem[];
  blueprints: CatalogItem[];
  officers: CatalogItem[];
  vip_plans: CatalogItem[];
}

interface PrizeRow {
  prize_type: PrizeType;
  ref_code: string;
  quantity: number;
}

interface AdminRaffle {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  status: string;
  ticket_price: number;
  max_tickets_per_user: number;
  max_tickets_total: number;
  opens_at: string;
  closes_at: string;
  drawn_at: string | null;
  total_tickets: number;
  total_collected: number;
  participants: number;
  draw_note: string | null;
  prizes: { position: number; prize_type: string; ref_code: string | null; quantity: number; label: string }[];
  winners: { position: number; username: string; ticket_number: number; label: string; delivered: boolean; delivery_note: string | null }[];
}

const PRIZE_TYPES: { value: PrizeType; label: string; catalogKey: keyof Catalog | null; qtyLabel: string }[] = [
  { value: 'ship', label: 'Naves', catalogKey: 'ships', qtyLabel: 'Cantidad de naves' },
  { value: 'supply_box', label: 'Caja de recursos', catalogKey: 'boxes', qtyLabel: 'Cantidad de cajas' },
  { value: 'blueprint', label: 'Plano de nave', catalogKey: 'blueprints', qtyLabel: 'Cantidad de planos' },
  { value: 'officer', label: 'Oficial', catalogKey: 'officers', qtyLabel: 'Días de oficial' },
  { value: 'vip', label: 'VIP', catalogKey: 'vip_plans', qtyLabel: '—' },
  { value: 'tung', label: 'TUNG', catalogKey: null, qtyLabel: 'Cantidad de TUNG' },
  { value: 'dark_matter', label: 'Materia Oscura', catalogKey: null, qtyLabel: 'Cantidad de MO' },
];

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-500/20 border-slate-400/30 text-slate-300',
  open: 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300',
  closed: 'bg-amber-500/20 border-amber-400/30 text-amber-300',
  drawn: 'bg-purple-500/20 border-purple-400/30 text-purple-300',
  cancelled: 'bg-red-500/20 border-red-400/30 text-red-300',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  open: 'Abierta',
  closed: 'Cerrada',
  drawn: 'Sorteada',
  cancelled: 'Cancelada',
};

export function RaffleAdminPanel() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [raffles, setRaffles] = useState<AdminRaffle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Formulario
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [ticketPrice, setTicketPrice] = useState(1000);
  const [maxPerUser, setMaxPerUser] = useState(0);
  const [maxTotal, setMaxTotal] = useState(0);
  const [durationValue, setDurationValue] = useState(24);
  const [durationUnit, setDurationUnit] = useState<'hours' | 'days'>('hours');
  const [openNow, setOpenNow] = useState(true);
  const [prizes, setPrizes] = useState<PrizeRow[]>([{ prize_type: 'ship', ref_code: '', quantity: 1 }]);

  const loadAll = useCallback(async () => {
    const [cat, list] = await Promise.all([
      supabase.rpc('admin_raffle_catalog'),
      supabase.rpc('admin_list_raffles'),
    ]);
    if (cat.data && !(cat.data as { error?: string }).error) setCatalog(cat.data as Catalog);
    if (list.data && (list.data as { raffles?: AdminRaffle[] }).raffles) {
      setRaffles((list.data as { raffles: AdminRaffle[] }).raffles);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const catalogFor = (t: PrizeType): CatalogItem[] => {
    const def = PRIZE_TYPES.find((p) => p.value === t);
    if (!catalog || !def?.catalogKey) return [];
    return catalog[def.catalogKey];
  };

  const updatePrize = (idx: number, patch: Partial<PrizeRow>) => {
    setPrizes((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const handleCreate = async () => {
    setMsg(null);
    if (!title.trim() || title.trim().length < 3) {
      setMsg({ type: 'err', text: 'El título debe tener al menos 3 caracteres' });
      return;
    }
    if (ticketPrice <= 0) {
      setMsg({ type: 'err', text: 'El precio del ticket debe ser mayor que 0' });
      return;
    }
    for (const p of prizes) {
      const needsCode = PRIZE_TYPES.find((t) => t.value === p.prize_type)?.catalogKey !== null;
      if (needsCode && !p.ref_code) {
        setMsg({ type: 'err', text: 'Selecciona el artículo de todos los premios' });
        return;
      }
      if (p.quantity <= 0) {
        setMsg({ type: 'err', text: 'Las cantidades deben ser mayores que 0' });
        return;
      }
    }

    if (maxTotal > 0 && maxPerUser > 0 && maxPerUser > maxTotal) {
      setMsg({ type: 'err', text: 'El máximo por jugador no puede superar el cupo total de tickets' });
      return;
    }

    const ms = durationUnit === 'hours' ? durationValue * 3600000 : durationValue * 86400000;
    const closesAt = new Date(Date.now() + ms).toISOString();

    setBusy(true);
    const { data, error } = await supabase.rpc('admin_create_raffle', {
      p_title: title.trim(),
      p_ticket_price: ticketPrice,
      p_closes_at: closesAt,
      p_prizes: prizes.map((p) => ({
        prize_type: p.prize_type,
        ref_code: p.ref_code || null,
        quantity: p.quantity,
      })),
      p_description: description.trim() || null,
      p_image_url: imageUrl.trim() || null,
      p_max_tickets_per_user: maxPerUser,
      p_max_tickets_total: maxTotal,
      p_open_now: openNow,
    });
    setBusy(false);

    if (error) {
      setMsg({ type: 'err', text: error.message });
      return;
    }
    const r = data as { success: boolean; error?: string };
    if (!r?.success) {
      setMsg({ type: 'err', text: r?.error || 'No se pudo crear la rifa' });
      return;
    }
    setMsg({ type: 'ok', text: 'Rifa creada correctamente' });
    setTitle('');
    setDescription('');
    setImageUrl('');
    setPrizes([{ prize_type: 'ship', ref_code: '', quantity: 1 }]);
    await loadAll();
  };

  const runAction = async (rpc: string, params: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc(rpc, params);
    setBusy(false);
    if (error) {
      setMsg({ type: 'err', text: error.message });
      return;
    }
    const r = data as { success: boolean; error?: string; winners?: number; unassigned?: number };
    if (!r?.success) {
      setMsg({ type: 'err', text: r?.error || 'Operación fallida' });
      return;
    }
    setMsg({
      type: 'ok',
      text:
        r.winners !== undefined
          ? `Sorteo realizado: ${r.winners} ganador(es)${r.unassigned ? `, ${r.unassigned} premio(s) sin asignar` : ''}`
          : 'Hecho',
    });
    await loadAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-400" />
          <h2 className="font-orbitron text-lg text-white">Rifas</h2>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-white/5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refrescar
        </button>
      </div>

      {msg && (
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.type === 'ok'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{msg.text}</span>
        </div>
      )}

      {/* ---------- Crear rifa ---------- */}
      <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-amber-300">Crear nueva rifa</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Título</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Rifa de la Estrella de la Muerte"
              className="mt-1 w-full h-9 px-3 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Imagen (URL, opcional)</span>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full h-9 px-3 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-slate-400">Descripción (opcional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
          />
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Precio ticket (TUNG)</span>
            <input
              type="number"
              min={1}
              value={ticketPrice}
              onChange={(e) => setTicketPrice(Number(e.target.value))}
              className="mt-1 w-full h-9 px-3 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Máx. por jugador (0 = sin límite)</span>
            <input
              type="number"
              min={0}
              value={maxPerUser}
              onChange={(e) => setMaxPerUser(Number(e.target.value))}
              className="mt-1 w-full h-9 px-3 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Cupo total de tickets (0 = sin cupo)</span>
            <input
              type="number"
              min={0}
              value={maxTotal}
              onChange={(e) => setMaxTotal(Number(e.target.value))}
              className="mt-1 w-full h-9 px-3 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Duración</span>
            <input
              type="number"
              min={1}
              value={durationValue}
              onChange={(e) => setDurationValue(Number(e.target.value))}
              className="mt-1 w-full h-9 px-3 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Unidad</span>
            <select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as 'hours' | 'days')}
              className="mt-1 w-full h-9 px-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
            >
              <option value="hours">Horas</option>
              <option value="days">Días</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={openNow} onChange={(e) => setOpenNow(e.target.checked)} />
          Abrir la rifa inmediatamente (si no, queda como borrador)
        </label>

        <p className="text-xs text-slate-500">
          “Máx. por jugador” limita cuántos tickets puede comprar cada jugador; no limita el total de la
          rifa. Para eso usa “Cupo total de tickets”: en cuanto se venda el último ticket la rifa se
          sortea automáticamente, sin esperar a la fecha de cierre.
        </p>

        {/* Premios */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Premios (orden = posición del ganador; máx. 20)
            </span>
            <button
              onClick={() =>
                setPrizes((p) => (p.length >= 20 ? p : [...p, { prize_type: 'tung', ref_code: '', quantity: 1000 }]))
              }
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/25"
            >
              <Plus className="w-3 h-3" /> Añadir premio
            </button>
          </div>

          {prizes.map((p, idx) => {
            const def = PRIZE_TYPES.find((t) => t.value === p.prize_type)!;
            const items = catalogFor(p.prize_type);
            return (
              <div key={idx} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end rounded-lg border border-white/10 bg-black/20 p-2">
                <span className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-400/30 text-xs font-bold text-amber-300 flex items-center justify-center shrink-0 self-center">
                  {idx + 1}
                </span>
                <label className="flex-1 min-w-0">
                  <span className="text-[10px] text-slate-500">Tipo</span>
                  <select
                    value={p.prize_type}
                    onChange={(e) =>
                      updatePrize(idx, { prize_type: e.target.value as PrizeType, ref_code: '' })
                    }
                    className="mt-0.5 w-full h-8 px-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                  >
                    {PRIZE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                {def.catalogKey && (
                  <label className="flex-[2] min-w-0">
                    <span className="text-[10px] text-slate-500">Artículo</span>
                    <select
                      value={p.ref_code}
                      onChange={(e) => updatePrize(idx, { ref_code: e.target.value })}
                      className="mt-0.5 w-full h-8 px-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                    >
                      <option value="">— Selecciona —</option>
                      {items.map((it) => (
                        <option key={it.code} value={it.code}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {p.prize_type !== 'vip' && (
                  <label className="w-full sm:w-40">
                    <span className="text-[10px] text-slate-500">{def.qtyLabel}</span>
                    <input
                      type="number"
                      min={1}
                      value={p.quantity}
                      onChange={(e) => updatePrize(idx, { quantity: Number(e.target.value) })}
                      className="mt-0.5 w-full h-8 px-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                    />
                  </label>
                )}

                <button
                  onClick={() => setPrizes((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={prizes.length === 1}
                  className="h-8 px-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-30 self-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleCreate}
          disabled={busy}
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg font-semibold bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
          Crear rifa
        </button>
      </div>

      {/* ---------- Lista ---------- */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Rifas ({raffles.length})</h3>
        {raffles.length === 0 && (
          <p className="text-sm text-slate-500">Todavía no has creado ninguna rifa.</p>
        )}

        {raffles.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/10 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${STATUS_STYLE[r.status] || ''}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                  <h4 className="text-white font-semibold truncate">{r.title}</h4>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {Number(r.ticket_price).toLocaleString()} TUNG/ticket ·{' '}
                  {r.max_tickets_total > 0
                    ? `${r.total_tickets}/${r.max_tickets_total} tickets`
                    : `${r.total_tickets} tickets`}{' '}
                  · {r.participants} participantes · recaudado{' '}
                  {Number(r.total_collected).toLocaleString()} TUNG
                </p>
                <p className="text-xs text-slate-500">
                  Cierra: {new Date(r.closes_at).toLocaleString()}
                  {r.drawn_at && ` · Sorteada: ${new Date(r.drawn_at).toLocaleString()}`}
                </p>
                {r.draw_note && <p className="text-xs text-amber-400/80 mt-1">{r.draw_note}</p>}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {r.status === 'draft' && (
                  <button
                    onClick={() => runAction('admin_set_raffle_status', { p_raffle_id: r.id, p_status: 'open' })}
                    disabled={busy}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs hover:bg-emerald-500/25"
                  >
                    <Unlock className="w-3 h-3" /> Abrir
                  </button>
                )}
                {r.status === 'open' && (
                  <button
                    onClick={() => runAction('admin_set_raffle_status', { p_raffle_id: r.id, p_status: 'closed' })}
                    disabled={busy}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/25"
                  >
                    <Lock className="w-3 h-3" /> Cerrar ventas
                  </button>
                )}
                {(r.status === 'open' || r.status === 'closed') && r.total_tickets > 0 && (
                  <button
                    onClick={() =>
                      runAction(
                        'admin_draw_raffle_now',
                        { p_raffle_id: r.id },
                        `¿Sortear "${r.title}" AHORA, antes de tiempo? Se cierra la rifa, se entregan los premios y no se puede deshacer. Si solo quieres publicarla, no uses este botón: la rifa se sortea sola al llegar la fecha de cierre.`
                      )
                    }
                    disabled={busy}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs hover:bg-purple-500/25"
                  >
                    <Play className="w-3 h-3" /> Sortear ahora
                  </button>
                )}
                {(r.status === 'draft' || r.status === 'open' || r.status === 'closed') && r.total_tickets === 0 && (
                  <button
                    onClick={() =>
                      runAction(
                        'admin_set_raffle_status',
                        { p_raffle_id: r.id, p_status: 'cancelled' },
                        `¿Cancelar "${r.title}"?`
                      )
                    }
                    disabled={busy}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-500/15 border border-slate-500/30 text-slate-300 text-xs hover:bg-slate-500/25"
                  >
                    <Ban className="w-3 h-3" /> Cancelar
                  </button>
                )}
                {r.total_tickets === 0 && (
                  <button
                    onClick={() =>
                      runAction('admin_delete_raffle', { p_raffle_id: r.id }, `¿Eliminar "${r.title}" definitivamente?`)
                    }
                    disabled={busy}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs hover:bg-red-500/25"
                  >
                    <Trash2 className="w-3 h-3" /> Eliminar
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {r.prizes.map((p) => (
                <span
                  key={p.position}
                  className="px-2 py-0.5 rounded-md bg-white/5 border border-amber-500/20 text-[11px] text-amber-100/90"
                >
                  #{p.position} {p.label}
                </span>
              ))}
            </div>

            {r.winners.length > 0 && (
              <div className="rounded-lg bg-black/30 border border-white/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-yellow-300 mb-2">
                  <Trophy className="w-3.5 h-3.5" /> Ganadores
                </p>
                <div className="space-y-1">
                  {r.winners.map((w) => (
                    <div key={w.position} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-white truncate">
                        #{w.position} · {w.username}{' '}
                        <span className="text-slate-500 font-mono">(ticket {w.ticket_number})</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-amber-300">{w.label}</span>
                        {w.delivered ? (
                          <span className="text-emerald-400">entregado</span>
                        ) : (
                          <span className="text-red-400" title={w.delivery_note || ''}>
                            fallo
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
