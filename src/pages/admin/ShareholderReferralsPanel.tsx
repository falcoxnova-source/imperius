// [SHREF1] Rendimiento de referidos por accionista. Solo lectura, solo admin.
// Consume admin_shareholder_referral_stats / admin_shareholder_referrals.
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, RefreshCw, ChevronDown, ChevronUp, Loader2, TrendingUp, Info } from 'lucide-react';

type ShareholderStats = {
  shareholder_id: string;
  username: string | null;
  email: string;
  percentage: number;
  is_active: boolean;
  referrals_total: number;
  referrals_active: number;
  referrals_inactive: number;
  referrals_new_30d: number;
  referrals_banned: number;
  investors: number;
  dep_tung: number;
  dep_usdt: number;
  wd_tung: number;
  wd_usdt: number;
  commissions_tung: number;
  last_referral_at: string | null;
};

type ReferralRow = {
  username: string | null;
  created_at: string;
  last_activity: string | null;
  banned: boolean;
  is_active: boolean;
  dep_tung: number;
  dep_usdt: number;
  wd_tung: number;
  wd_usdt: number;
  commissions_tung: number;
};

type SortKey = 'referrals_total' | 'referrals_active' | 'referrals_new_30d' | 'investors' | 'invested';
type RefFilter = 'all' | 'active' | 'inactive' | 'investors';

const n = (v: unknown) => Number(v) || 0;
const fmt = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : '—');

// Semaforo de trabajo: referidos nuevos captados en los ultimos 30 dias.
const workBadge = (newRefs: number) => {
  if (newRefs >= 5) return { label: 'Trabajando', cls: 'bg-green-500/20 text-green-300 border-green-500/40' };
  if (newRefs >= 1) return { label: 'Poco activo', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
  return { label: 'Sin captar', cls: 'bg-red-500/20 text-red-300 border-red-500/40' };
};

export function ShareholderReferralsPanel({ tungPriceUsd }: { tungPriceUsd: number | null }) {
  const [rows, setRows] = useState<ShareholderStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('referrals_total');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, ReferralRow[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [refFilter, setRefFilter] = useState<RefFilter>('all');

  const toUsd = useCallback(
    (tung: number, usdt: number) => (tungPriceUsd != null ? tung * tungPriceUsd + usdt : null),
    [tungPriceUsd]
  );
  const usdLabel = (tung: number, usdt: number) => {
    const v = toUsd(tung, usdt);
    return v == null ? '—' : `≈ $${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_shareholder_referral_stats');
    if (err || !data?.success) {
      setError(err?.message || data?.error || 'No se pudieron cargar las estadisticas');
    } else {
      setRows((data.shareholders || []) as ShareholderStats[]);
      setDetail({});
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleDetail = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setRefFilter('all');
    if (detail[id]) return;
    setDetailLoading(true);
    const { data, error: err } = await supabase.rpc('admin_shareholder_referrals', { p_shareholder_id: id });
    if (!err && data?.success) {
      setDetail((prev) => ({ ...prev, [id]: (data.referrals || []) as ReferralRow[] }));
    } else {
      setError(err?.message || data?.error || 'No se pudo cargar la lista de referidos');
    }
    setDetailLoading(false);
  };

  const sorted = useMemo(() => {
    const val = (r: ShareholderStats) =>
      sortKey === 'invested' ? (toUsd(n(r.dep_tung), n(r.dep_usdt)) ?? n(r.dep_tung)) : n(r[sortKey]);
    return [...rows].sort((a, b) => val(b) - val(a));
  }, [rows, sortKey, toUsd]);

  const totals = useMemo(() => rows.reduce(
    (t, r) => ({
      refs: t.refs + n(r.referrals_total),
      active: t.active + n(r.referrals_active),
      new30: t.new30 + n(r.referrals_new_30d),
      investors: t.investors + n(r.investors),
      depT: t.depT + n(r.dep_tung), depU: t.depU + n(r.dep_usdt),
      wdT: t.wdT + n(r.wd_tung), wdU: t.wdU + n(r.wd_usdt),
      com: t.com + n(r.commissions_tung),
    }),
    { refs: 0, active: 0, new30: 0, investors: 0, depT: 0, depU: 0, wdT: 0, wdU: 0, com: 0 }
  ), [rows]);

  const filteredDetail = (id: string) => (detail[id] || []).filter((r) => {
    if (refFilter === 'active') return r.is_active;
    if (refFilter === 'inactive') return !r.is_active;
    if (refFilter === 'investors') return n(r.dep_tung) > 0 || n(r.dep_usdt) > 0;
    return true;
  });

  const card = (title: string, main: string, sub?: string, color = 'text-white') => (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
      <div className="text-xs text-slate-400">{title}</div>
      <div className={`text-xl font-bold ${color}`}>{main}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" /> Rendimiento de referidos por accionista
        </h4>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="px-2 py-1.5 bg-slate-900/60 border border-slate-700 rounded-lg text-white text-xs"
          >
            <option value="referrals_total">Ordenar: más referidos</option>
            <option value="referrals_active">Ordenar: más activos</option>
            <option value="referrals_new_30d">Ordenar: más nuevos (30 días)</option>
            <option value="investors">Ordenar: más inversores</option>
            <option value="invested">Ordenar: más depositado</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs rounded-lg flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-900/40 border border-slate-700/50 rounded-lg p-3 flex gap-2">
        <Info className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div><b className="text-slate-200">Activo</b> = el referido entró al juego en los últimos 7 días. <b className="text-slate-200">Invirtió</b> = hizo al menos un depósito confirmado.</div>
          <div><b className="text-slate-200">Neto</b> = depositado − retirado (positivo: entró más dinero del que salió). <b className="text-slate-200">Comisiones</b> = TUNG que el accionista ya cobró por lo que gastaron sus referidos.</div>
          <div>
            Semáforo (referidos nuevos en 30 días):{' '}
            <span className="text-green-300">Trabajando ≥5</span> · <span className="text-amber-300">Poco activo 1–4</span> · <span className="text-red-300">Sin captar 0</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/30">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {card('Referidos totales', fmt(totals.refs), `+${fmt(totals.new30)} en 30 días`)}
        {card('Activos / Inactivos', `${fmt(totals.active)} / ${fmt(totals.refs - totals.active)}`, totals.refs ? `${((totals.active / totals.refs) * 100).toFixed(1)}% activos` : undefined, 'text-green-300')}
        {card('Invirtieron', fmt(totals.investors), totals.refs ? `${((totals.investors / totals.refs) * 100).toFixed(1)}% de los referidos` : undefined, 'text-blue-300')}
        {card('Depositado', `${fmt(totals.depT)} TUNG`, `+ ${fmt(totals.depU, 2)} USDT · ${usdLabel(totals.depT, totals.depU)}`, 'text-emerald-400')}
        {card('Retirado', `${fmt(totals.wdT)} TUNG`, `+ ${fmt(totals.wdU, 2)} USDT · ${usdLabel(totals.wdT, totals.wdU)}`, 'text-orange-300')}
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-3">Accionista</th>
                <th className="text-left px-3 py-3">Referidos</th>
                <th className="text-left px-3 py-3">Activos / Inactivos</th>
                <th className="text-left px-3 py-3">Invirtieron</th>
                <th className="text-left px-3 py-3">Depositado</th>
                <th className="text-left px-3 py-3">Retirado</th>
                <th className="text-left px-3 py-3">Neto</th>
                <th className="text-left px-3 py-3">Comisiones</th>
                <th className="text-right px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-500">Aún no hay accionistas</td></tr>
              )}
              {sorted.map((r) => {
                const badge = workBadge(n(r.referrals_new_30d));
                const total = n(r.referrals_total);
                const activePct = total ? (n(r.referrals_active) / total) * 100 : 0;
                const netT = n(r.dep_tung) - n(r.wd_tung);
                const netU = n(r.dep_usdt) - n(r.wd_usdt);
                const netUsd = toUsd(netT, netU);
                const open = openId === r.shareholder_id;
                return (
                  <Fragment key={r.shareholder_id}>
                    <tr className="border-t border-slate-700/50 align-top">
                      <td className="px-3 py-3">
                        <div className="text-white font-medium">{r.username || '(sin nombre)'}</div>
                        <div className="text-[11px] text-slate-500">{r.email} · {n(r.percentage).toFixed(2)}%{!r.is_active && ' · pausado'}</div>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-white font-semibold">{fmt(total)}</div>
                        <div className="text-[11px] text-slate-400">+{fmt(n(r.referrals_new_30d))} en 30 días</div>
                        <div className="text-[10px] text-slate-500">Último: {fmtDate(r.last_referral_at)}</div>
                      </td>
                      <td className="px-3 py-3 min-w-[140px]">
                        <div className="text-xs"><span className="text-green-300 font-semibold">{fmt(n(r.referrals_active))}</span> <span className="text-slate-500">/</span> <span className="text-slate-400">{fmt(n(r.referrals_inactive))}</span></div>
                        <div className="h-1.5 bg-slate-700 rounded mt-1 overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${activePct}%` }} />
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{activePct.toFixed(0)}% activos{n(r.referrals_banned) > 0 && ` · ${n(r.referrals_banned)} baneados`}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-blue-300 font-semibold">{fmt(n(r.investors))}</div>
                        <div className="text-[11px] text-slate-400">{total ? ((n(r.investors) / total) * 100).toFixed(1) : '0'}%</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-emerald-400 font-medium">{fmt(n(r.dep_tung))} <span className="text-[10px] text-slate-500">TUNG</span></div>
                        {n(r.dep_usdt) > 0 && <div className="text-xs text-slate-300">+ {fmt(n(r.dep_usdt), 2)} USDT</div>}
                        <div className="text-[10px] text-green-400/70">{usdLabel(n(r.dep_tung), n(r.dep_usdt))}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-orange-300 font-medium">{fmt(n(r.wd_tung))} <span className="text-[10px] text-slate-500">TUNG</span></div>
                        {n(r.wd_usdt) > 0 && <div className="text-xs text-slate-300">+ {fmt(n(r.wd_usdt), 2)} USDT</div>}
                        <div className="text-[10px] text-green-400/70">{usdLabel(n(r.wd_tung), n(r.wd_usdt))}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className={`font-semibold ${netT >= 0 ? 'text-green-300' : 'text-red-300'}`}>{netT >= 0 ? '+' : ''}{fmt(netT)} <span className="text-[10px] text-slate-500">TUNG</span></div>
                        {netU !== 0 && <div className={`text-xs ${netU >= 0 ? 'text-green-300/80' : 'text-red-300/80'}`}>{netU >= 0 ? '+' : ''}{fmt(netU, 2)} USDT</div>}
                        {netUsd != null && <div className={`text-[10px] ${netUsd >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>≈ ${netUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-yellow-300 font-medium">{fmt(n(r.commissions_tung))} <span className="text-[10px] text-slate-500">TUNG</span></div>
                        <div className="text-[10px] text-green-400/70">{usdLabel(n(r.commissions_tung), 0)}</div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => toggleDetail(r.shareholder_id)}
                          disabled={total === 0}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-xs rounded inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <Users className="w-3.5 h-3.5" /> Ver {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-900/40">
                        <td colSpan={9} className="px-3 py-3">
                          <div className="flex flex-wrap gap-2 mb-2">
                            {([
                              ['all', 'Todos'],
                              ['active', 'Activos'],
                              ['inactive', 'Inactivos'],
                              ['investors', 'Invirtieron'],
                            ] as [RefFilter, string][]).map(([k, label]) => (
                              <button
                                key={k}
                                onClick={() => setRefFilter(k)}
                                className={`px-2 py-1 rounded text-xs ${refFilter === k ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {detailLoading && !detail[r.shareholder_id] ? (
                            <div className="py-4 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></div>
                          ) : (
                            <div className="max-h-96 overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="text-slate-500 uppercase sticky top-0 bg-slate-900">
                                  <tr>
                                    <th className="text-left px-2 py-2">Referido</th>
                                    <th className="text-left px-2 py-2">Registro</th>
                                    <th className="text-left px-2 py-2">Última conexión</th>
                                    <th className="text-left px-2 py-2">Estado</th>
                                    <th className="text-left px-2 py-2">Depositado</th>
                                    <th className="text-left px-2 py-2">Retirado</th>
                                    <th className="text-left px-2 py-2">Comisión generada</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredDetail(r.shareholder_id).length === 0 && (
                                    <tr><td colSpan={7} className="px-2 py-4 text-center text-slate-500">Sin resultados</td></tr>
                                  )}
                                  {filteredDetail(r.shareholder_id).map((x, i) => (
                                    <tr key={i} className="border-t border-slate-800">
                                      <td className="px-2 py-1.5 text-white">{x.username || '—'}</td>
                                      <td className="px-2 py-1.5 text-slate-400">{fmtDate(x.created_at)}</td>
                                      <td className="px-2 py-1.5 text-slate-400">{fmtDate(x.last_activity)}</td>
                                      <td className="px-2 py-1.5">
                                        {x.banned
                                          ? <span className="text-red-400">Baneado</span>
                                          : x.is_active
                                            ? <span className="text-green-300">Activo</span>
                                            : <span className="text-slate-500">Inactivo</span>}
                                      </td>
                                      <td className="px-2 py-1.5 text-emerald-400">
                                        {fmt(n(x.dep_tung))} TUNG{n(x.dep_usdt) > 0 && <span className="text-slate-300"> + {fmt(n(x.dep_usdt), 2)} USDT</span>}
                                      </td>
                                      <td className="px-2 py-1.5 text-orange-300">
                                        {fmt(n(x.wd_tung))} TUNG{n(x.wd_usdt) > 0 && <span className="text-slate-300"> + {fmt(n(x.wd_usdt), 2)} USDT</span>}
                                      </td>
                                      <td className="px-2 py-1.5 text-yellow-300">{fmt(n(x.commissions_tung))} TUNG</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
