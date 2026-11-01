// [USERECON1] Economia completa de un usuario. Solo lectura, solo admin.
// Consume admin_user_economy (RPC protegida: anon sin permiso, no-admin => 'No autorizado').
// Las wallets de origen de depositos se resuelven bajo demanda desde la blockchain (BSC publica).
import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import {
  X, Wallet, ArrowDownCircle, ArrowUpCircle, Scale, Coins, Loader2, RefreshCw, Copy, Check,
  ExternalLink, AlertTriangle, Search, Users, Repeat, History, PieChart, ShieldAlert,
} from 'lucide-react';

type Totals = {
  dep_tung: number; dep_tung_count: number; dep_tung_offchain: number;
  dep_usdt: number; dep_usdt_count: number;
  wd_tung_net: number; wd_tung_gross: number; wd_tung_count: number;
  wd_usdt_net: number; wd_usdt_gross: number; wd_usdt_count: number;
  failed_count: number; failed_amount: number;
  first_tx_at: string | null; last_tx_at: string | null;
};
type Profile = {
  id: string; username: string; email: string | null;
  tung_balance: number; usdt_balance: number;
  created_at: string; last_activity: string | null;
  is_banned: boolean; is_admin: boolean; kyc_status: string | null; referred_by: string | null;
};
type DepWallet = { address: string; is_assigned: boolean; count: number; total_tung: number; total_usdt: number; first_at: string; last_at: string };
type WdWallet = { address: string; count: number; total_tung: number; total_usdt: number; fees_tung: number; failed: number; first_at: string; last_at: string; shared_with: string[] };
type Tx = {
  id: string; tx_type: 'deposit' | 'withdrawal'; token: string; amount: number; gross: number; status: string;
  wallet: string; tx_hash: string; contract_tx_hash: string | null; error: string | null; created_at: string;
};
type LedgerCat = { category: string; income: number; spent: number; count: number; last_at: string };
type LedgerRow = { id: number; delta: number; balance_after: number; category: string | null; description: string | null; created_at: string };
type P2PRow = { role: 'buyer' | 'seller'; asset: string; status: string; count: number; asset_amount: number; fiat_amount: number; fiat_currency: string };
type Economy = {
  success: boolean; error?: string; generated_at: string;
  profile: Profile; totals: Totals;
  assigned_addresses: { address: string; created_at: string }[];
  deposit_wallets: DepWallet[]; withdraw_wallets: WdWallet[];
  transactions: Tx[]; ledger_by_category: LedgerCat[]; ledger_recent: LedgerRow[];
  p2p: P2PRow[];
  referrals: { count: number; referrals: number; earned_tung: number; earned_usdt: number };
};
type Origin = { address: string; count: number; tung: number; usdt: number; last_at: string };

const BSC_RPCS = ['https://bsc-dataseed.binance.org/', 'https://bsc-dataseed1.defibit.io/', 'https://bsc-rpc.publicnode.com'];
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MAX_RESOLVE = 120;
const isAddr = (a: string | null | undefined) => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);
const isHash = (h: string | null | undefined) => !!h && /^0x[0-9a-fA-F]{64}$/.test(h);

const CATEGORY_LABELS: Record<string, string> = {
  sin_categoria: 'Juego (sin categoría)',
  deposit: 'Depósitos',
  withdrawal: 'Retiros',
  withdrawal_fee: 'Comisión de retiro',
  supply_box: 'Cajas de suministro',
  transfer_fee: 'Comisión de transferencia',
  instant_ship: 'Naves instantáneas',
  instant_build: 'Construcción instantánea',
  fleet_acceleration: 'Aceleración de flota',
  daily_streak: 'Racha diaria',
  blueprint_sale: 'Venta de planos',
  lottery_fee: 'Lotería',
  casino_roulette: 'Ruleta Casino',
  casino_slots: 'Tragamonedas Casino',
  casino_dice: 'Dados Casino',
  casino_battleship: 'Batalla de Naves',
  sports_football: 'Apuestas Fútbol',
  hero_kit_sale: 'Kits de héroe',
  instant_unit_sale: 'Venta de unidades',
  alliance_rename: 'Renombrar alianza',
  other: 'Otros',
};
const P2P_STATUS: Record<string, string> = {
  released: 'Completada', pending_payment: 'Pendiente', disputed: 'En disputa', resolved: 'Resuelta', expired: 'Expirada',
};

const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0)); return isNaN(n) ? 0 : n; };
const fmt = (v: unknown, d = 2) => num(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—');
const short = (a: string) => (a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '—');

function specialLabel(addr: string): string | null {
  if (!addr) return 'Sin dirección';
  if (addr === 'ADMIN_CREDIT') return 'Crédito admin';
  if (addr === 'ADMIN_DEBIT') return 'Débito admin';
  if (!isAddr(addr)) return addr;
  return null;
}

async function fetchReceipt(hash: string): Promise<{ logs: { topics: string[] }[] } | null> {
  for (const url of BSC_RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
      });
      if (!res.ok) continue;
      const j = await res.json();
      if (j?.result) return j.result;
    } catch {
      /* siguiente RPC */
    }
  }
  return null;
}

function AddressCell({ address, txHash }: { address: string; txHash?: string }) {
  const [copied, setCopied] = useState(false);
  const special = specialLabel(address);
  if (special) return <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">{special}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-200">
      <span title={address}>{short(address)}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        className="text-slate-500 hover:text-cyan-400" title="Copiar"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <a href={`https://bscscan.com/${txHash ? `tx/${txHash}` : `address/${address}`}`} target="_blank" rel="noopener noreferrer"
        className="text-slate-500 hover:text-cyan-400" title="Ver en BscScan">
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </span>
  );
}

function StatCard({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: string; sub?: ReactNode; tone: string }) {
  return (
    <div className={`rounded-xl border p-4 bg-gradient-to-br ${tone}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-300/80">{icon}{label}</div>
      <div className="mt-1.5 text-2xl font-bold text-white font-mono">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-300/80 space-y-0.5">{sub}</div>}
    </div>
  );
}

type Tab = 'resumen' | 'wallets' | 'movimientos' | 'economia';

export function AdminUserEconomyModal({ userId, username, tungPriceUsd, onClose }: {
  userId: string; username: string; tungPriceUsd: number | null; onClose: () => void;
}) {
  const [data, setData] = useState<Economy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('resumen');
  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'withdrawal' | 'failed'>('all');
  const [origins, setOrigins] = useState<Origin[] | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState({ done: 0, total: 0, failed: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.rpc('admin_user_economy', { p_user_id: userId });
    if (err) setError(err.message);
    else if (!res?.success) setError(res?.error || 'Error desconocido');
    else setData(res as Economy);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const usd = (tung: number) => (tungPriceUsd != null ? `≈ $${fmt(tung * tungPriceUsd)}` : '');

  const assignedSet = useMemo(
    () => new Set((data?.assigned_addresses || []).map((a) => a.address.toLowerCase())),
    [data],
  );
  const withdrawSet = useMemo(
    () => new Set((data?.withdraw_wallets || []).filter((w) => isAddr(w.address)).map((w) => w.address.toLowerCase())),
    [data],
  );

  const resolveOrigins = useCallback(async () => {
    if (!data) return;
    const deps = data.transactions.filter((t) => t.tx_type === 'deposit' && t.status === 'confirmed' && isAddr(t.wallet));
    const toResolve = deps.filter((t) => assignedSet.has(t.wallet.toLowerCase()) && isHash(t.tx_hash)).slice(0, MAX_RESOLVE);
    const direct = deps.filter((t) => !assignedSet.has(t.wallet.toLowerCase()));
    const map = new Map<string, Origin>();
    const add = (addr: string, t: Tx) => {
      const k = addr.toLowerCase();
      const o = map.get(k) || { address: addr, count: 0, tung: 0, usdt: 0, last_at: t.created_at };
      o.count += 1;
      if (t.token === 'USDT') o.usdt += num(t.amount); else o.tung += num(t.amount);
      if (t.created_at > o.last_at) o.last_at = t.created_at;
      map.set(k, o);
    };
    direct.forEach((t) => add(t.wallet, t));

    setResolving(true);
    setResolveProgress({ done: 0, total: toResolve.length, failed: 0 });
    let idx = 0;
    let failed = 0;
    const worker = async () => {
      while (idx < toResolve.length) {
        const t = toResolve[idx++];
        const rc = await fetchReceipt(t.tx_hash);
        const target = t.wallet.toLowerCase().slice(2);
        const log = rc?.logs?.find((l) => l.topics?.[0] === TRANSFER_TOPIC && l.topics?.[2]?.toLowerCase().endsWith(target));
        if (log?.topics?.[1]) add(`0x${log.topics[1].slice(26)}`, t);
        else failed += 1;
        setResolveProgress((p) => ({ ...p, done: p.done + 1, failed }));
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setOrigins([...map.values()].sort((a, b) => b.tung + b.usdt - (a.tung + a.usdt)));
    setResolving(false);
  }, [data, assignedSet]);

  const filteredTxs = useMemo(() => {
    const list = data?.transactions || [];
    if (txFilter === 'all') return list;
    if (txFilter === 'failed') return list.filter((t) => t.status !== 'confirmed');
    return list.filter((t) => t.tx_type === txFilter);
  }, [data, txFilter]);

  const t = data?.totals;
  const p = data?.profile;
  const netTung = t ? num(t.dep_tung) - num(t.wd_tung_gross) : 0;
  const feesTung = t ? num(t.wd_tung_gross) - num(t.wd_tung_net) : 0;
  const flowMax = t ? Math.max(num(t.dep_tung), num(t.wd_tung_gross), 1) : 1;
  const ledgerMax = Math.max(1, ...(data?.ledger_by_category || []).map((c) => Math.max(num(c.income), num(c.spent))));
  const sharedCount = (data?.withdraw_wallets || []).filter((w) => w.shared_with?.length).length;

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'resumen', label: 'Resumen', icon: <PieChart className="w-4 h-4" /> },
    { id: 'wallets', label: 'Wallets', icon: <Wallet className="w-4 h-4" /> },
    { id: 'movimientos', label: 'Movimientos', icon: <History className="w-4 h-4" /> },
    { id: 'economia', label: 'Economía interna', icon: <Coins className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-6xl max-h-[94vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-700 bg-gradient-to-r from-cyan-900/30 via-slate-900 to-violet-900/30 rounded-t-2xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Wallet className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-white truncate">Economía de {p?.username || username}</h2>
              {p?.is_admin && <span className="px-1.5 py-0.5 text-xs bg-red-600/30 text-red-400 rounded">Admin</span>}
              {p?.is_banned && <span className="px-1.5 py-0.5 text-xs bg-red-600/40 text-red-300 rounded">Baneado</span>}
              {p?.kyc_status && <span className="px-1.5 py-0.5 text-xs bg-slate-700 text-slate-300 rounded">KYC: {p.kyc_status}</span>}
              {sharedCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-amber-600/30 text-amber-300 rounded inline-flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />{sharedCount} wallet(s) compartida(s)
                </span>
              )}
            </div>
            {p && (
              <div className="mt-1 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-0.5">
                <span>{p.email || '—'}</span>
                <span>Registro: {fmtDate(p.created_at)}</span>
                <span>Última actividad: {fmtDate(p.last_activity)}</span>
                {p.referred_by && <span>Referido por: <span className="text-slate-200">{p.referred_by}</span></span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={load} disabled={loading} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="Recargar">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg bg-slate-800 hover:bg-red-600/60 text-slate-300" title="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 border-b border-slate-800 overflow-x-auto">
          {tabs.map((tb) => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg whitespace-nowrap ${tab === tb.id ? 'bg-slate-800 text-cyan-300 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}>
              {tb.icon}{tb.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && !data && (
            <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" />Cargando economía…</div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-300"><AlertTriangle className="w-5 h-5" />{error}</div>
          )}

          {data && t && p && tab === 'resumen' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={<ArrowDownCircle className="w-4 h-4 text-emerald-400" />} label="Entró (depósitos)" tone="from-emerald-900/40 to-slate-900 border-emerald-700/40"
                  value={`${fmt(t.dep_tung)} TUNG`}
                  sub={<>
                    <div>{t.dep_tung_count} depósitos {usd(num(t.dep_tung))}</div>
                    {num(t.dep_tung_offchain) > 0 && <div className="text-amber-300/80">incl. {fmt(t.dep_tung_offchain)} por crédito admin</div>}
                    {num(t.dep_usdt) > 0 && <div>+ {fmt(t.dep_usdt)} USDT ({t.dep_usdt_count})</div>}
                  </>} />
                <StatCard icon={<ArrowUpCircle className="w-4 h-4 text-rose-400" />} label="Salió (retiros)" tone="from-rose-900/40 to-slate-900 border-rose-700/40"
                  value={`${fmt(t.wd_tung_gross)} TUNG`}
                  sub={<>
                    <div>{t.wd_tung_count} retiros · enviado {fmt(t.wd_tung_net)} {usd(num(t.wd_tung_net))}</div>
                    <div>Comisiones: {fmt(feesTung)} TUNG</div>
                    {num(t.wd_usdt_gross) > 0 && <div>+ {fmt(t.wd_usdt_gross)} USDT ({t.wd_usdt_count})</div>}
                    {t.failed_count > 0 && <div className="text-amber-300/80">{t.failed_count} fallidos ({fmt(t.failed_amount)})</div>}
                  </>} />
                <StatCard icon={<Scale className="w-4 h-4 text-violet-300" />} label="Neto (entró − salió)"
                  tone={netTung >= 0 ? 'from-violet-900/40 to-slate-900 border-violet-700/40' : 'from-red-900/50 to-slate-900 border-red-600/50'}
                  value={`${netTung >= 0 ? '+' : ''}${fmt(netTung)} TUNG`}
                  sub={<>
                    <div>{usd(Math.abs(netTung))}</div>
                    <div className={netTung >= 0 ? 'text-emerald-300/80' : 'text-red-300'}>
                      {netTung >= 0 ? 'Ha metido más de lo que ha sacado' : 'Ha sacado más de lo que ha metido'}
                    </div>
                  </>} />
                <StatCard icon={<Coins className="w-4 h-4 text-cyan-300" />} label="Saldo actual" tone="from-cyan-900/40 to-slate-900 border-cyan-700/40"
                  value={`${fmt(p.tung_balance)} TUNG`}
                  sub={<>
                    <div>{usd(num(p.tung_balance))}</div>
                    <div>{fmt(p.usdt_balance)} USDT</div>
                  </>} />
              </div>

              {/* Flujo visual */}
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <div className="text-sm font-semibold text-slate-200 mb-3">Flujo de TUNG on-chain</div>
                {[
                  { label: 'Depositado', v: num(t.dep_tung), c: 'bg-emerald-500' },
                  { label: 'Retirado (bruto)', v: num(t.wd_tung_gross), c: 'bg-rose-500' },
                  { label: 'Comisiones cobradas', v: feesTung, c: 'bg-amber-500' },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-3 mb-2">
                    <div className="w-40 text-xs text-slate-400">{r.label}</div>
                    <div className="flex-1 h-3 rounded-full bg-slate-700/60 overflow-hidden">
                      <div className={`h-full ${r.c}`} style={{ width: `${Math.min(100, (r.v / flowMax) * 100)}%` }} />
                    </div>
                    <div className="w-36 text-right text-xs font-mono text-slate-200">{fmt(r.v)}</div>
                  </div>
                ))}
                <div className="mt-2 text-xs text-slate-500">Primer movimiento: {fmtDate(t.first_tx_at)} · Último: {fmtDate(t.last_tx_at)}</div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                  <div className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2"><Wallet className="w-4 h-4 text-cyan-400" />Dirección de depósito asignada</div>
                  {data.assigned_addresses.length === 0 ? <div className="text-xs text-slate-500">Sin dirección asignada</div> :
                    data.assigned_addresses.map((a) => <div key={a.address}><AddressCell address={a.address} /></div>)}
                  <div className="mt-3 text-xs text-slate-400">{data.deposit_wallets.length} direcciones en depósitos · {data.withdraw_wallets.length} wallets de retiro</div>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                  <div className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2"><Repeat className="w-4 h-4 text-violet-400" />P2P</div>
                  {data.p2p.length === 0 ? <div className="text-xs text-slate-500">Sin órdenes P2P</div> : (
                    <div className="space-y-1">
                      {data.p2p.map((o, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-300">{o.role === 'seller' ? 'Vendió' : 'Compró'} {o.asset === 'FXU' ? 'TUNG' : o.asset} · <span className="text-slate-500">{P2P_STATUS[o.status] || o.status} ({o.count})</span></span>
                          <span className="font-mono text-slate-200">{fmt(o.asset_amount)} / {fmt(o.fiat_amount)} {o.fiat_currency}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                  <div className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-emerald-400" />Referidos</div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <div className="flex justify-between"><span>Referidos</span><span className="font-mono">{data.referrals.referrals}</span></div>
                    <div className="flex justify-between"><span>Comisiones recibidas</span><span className="font-mono">{data.referrals.count}</span></div>
                    <div className="flex justify-between"><span>Ganado TUNG</span><span className="font-mono text-emerald-300">{fmt(data.referrals.earned_tung)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {data && tab === 'wallets' && (
            <div className="space-y-6">
              {/* Origen depositos */}
              <div className="rounded-xl border border-emerald-700/40 bg-slate-800/40">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-700">
                  <div>
                    <div className="text-sm font-semibold text-emerald-300 flex items-center gap-2"><ArrowDownCircle className="w-4 h-4" />Wallets desde las que deposita (origen)</div>
                    <div className="text-xs text-slate-500">Se consulta la blockchain (BSC) para ver quién envió cada depósito. Últimos {MAX_RESOLVE} depósitos.</div>
                  </div>
                  <button onClick={resolveOrigins} disabled={resolving}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm">
                    {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    {resolving ? `Consultando ${resolveProgress.done}/${resolveProgress.total}` : origins ? 'Volver a detectar' : 'Detectar wallets de origen'}
                  </button>
                </div>
                {origins ? (
                  origins.length === 0 ? <div className="p-4 text-xs text-slate-500">No se encontraron depósitos on-chain.</div> : (
                    <table className="w-full text-sm">
                      <thead><tr className="text-xs text-slate-400 border-b border-slate-700">
                        <th className="text-left py-2 px-4">Wallet origen</th><th className="text-right py-2 px-4">Depósitos</th>
                        <th className="text-right py-2 px-4">TUNG</th><th className="text-right py-2 px-4">USDT</th><th className="text-left py-2 px-4">Último</th>
                      </tr></thead>
                      <tbody>
                        {origins.map((o) => (
                          <tr key={o.address} className="border-b border-slate-700/40 hover:bg-slate-700/20">
                            <td className="py-2 px-4">
                              <AddressCell address={o.address} />
                              {withdrawSet.has(o.address.toLowerCase()) && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-violet-600/30 text-violet-300">también retira aquí</span>}
                            </td>
                            <td className="py-2 px-4 text-right text-slate-300">{o.count}</td>
                            <td className="py-2 px-4 text-right font-mono text-emerald-300">{fmt(o.tung)}</td>
                            <td className="py-2 px-4 text-right font-mono text-slate-300">{o.usdt ? fmt(o.usdt) : '—'}</td>
                            <td className="py-2 px-4 text-xs text-slate-400">{fmtDate(o.last_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : (
                  <div className="p-4 text-xs text-slate-500">Pulsa “Detectar wallets de origen” para identificar las wallets que envían los TUNG.</div>
                )}
                {origins && resolveProgress.failed > 0 && (
                  <div className="px-4 py-2 text-xs text-amber-300/80">{resolveProgress.failed} transacción(es) no se pudieron resolver (RPC sin respuesta o formato distinto).</div>
                )}
              </div>

              {/* Direcciones registradas en depositos */}
              <div className="rounded-xl border border-slate-700 bg-slate-800/40">
                <div className="px-4 py-3 border-b border-slate-700 text-sm font-semibold text-slate-200">Direcciones registradas en depósitos</div>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-400 border-b border-slate-700">
                    <th className="text-left py-2 px-4">Dirección</th><th className="text-left py-2 px-4">Tipo</th><th className="text-right py-2 px-4">Depósitos</th>
                    <th className="text-right py-2 px-4">TUNG</th><th className="text-right py-2 px-4">USDT</th><th className="text-left py-2 px-4">Último</th>
                  </tr></thead>
                  <tbody>
                    {data.deposit_wallets.map((w) => (
                      <tr key={w.address || '-'} className="border-b border-slate-700/40 hover:bg-slate-700/20">
                        <td className="py-2 px-4"><AddressCell address={w.address} /></td>
                        <td className="py-2 px-4 text-xs">
                          {w.is_assigned ? <span className="text-cyan-300">Dirección asignada</span>
                            : isAddr(w.address) ? <span className="text-emerald-300">Wallet origen</span> : <span className="text-slate-400">Interno</span>}
                        </td>
                        <td className="py-2 px-4 text-right text-slate-300">{w.count}</td>
                        <td className="py-2 px-4 text-right font-mono text-emerald-300">{fmt(w.total_tung)}</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-300">{num(w.total_usdt) ? fmt(w.total_usdt) : '—'}</td>
                        <td className="py-2 px-4 text-xs text-slate-400">{fmtDate(w.last_at)}</td>
                      </tr>
                    ))}
                    {data.deposit_wallets.length === 0 && <tr><td colSpan={6} className="p-4 text-xs text-slate-500">Sin depósitos</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* Destino retiros */}
              <div className="rounded-xl border border-rose-700/40 bg-slate-800/40">
                <div className="px-4 py-3 border-b border-slate-700 text-sm font-semibold text-rose-300 flex items-center gap-2"><ArrowUpCircle className="w-4 h-4" />Wallets a las que retira (destino)</div>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-400 border-b border-slate-700">
                    <th className="text-left py-2 px-4">Wallet destino</th><th className="text-right py-2 px-4">Retiros</th>
                    <th className="text-right py-2 px-4">TUNG enviado</th><th className="text-right py-2 px-4">Comisión</th>
                    <th className="text-right py-2 px-4">USDT</th><th className="text-left py-2 px-4">Último</th><th className="text-left py-2 px-4">Otros usuarios</th>
                  </tr></thead>
                  <tbody>
                    {data.withdraw_wallets.map((w) => (
                      <tr key={w.address || '-'} className={`border-b border-slate-700/40 hover:bg-slate-700/20 ${w.shared_with?.length ? 'bg-amber-900/10' : ''}`}>
                        <td className="py-2 px-4"><AddressCell address={w.address} /></td>
                        <td className="py-2 px-4 text-right text-slate-300">{w.count}{w.failed > 0 && <span className="text-amber-400 text-xs"> (+{w.failed} fallidos)</span>}</td>
                        <td className="py-2 px-4 text-right font-mono text-rose-300">{fmt(w.total_tung)}</td>
                        <td className="py-2 px-4 text-right font-mono text-amber-300">{fmt(w.fees_tung)}</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-300">{num(w.total_usdt) ? fmt(w.total_usdt) : '—'}</td>
                        <td className="py-2 px-4 text-xs text-slate-400">{fmtDate(w.last_at)}</td>
                        <td className="py-2 px-4 text-xs">
                          {w.shared_with?.length ? (
                            <span className="inline-flex items-center gap-1 text-amber-300" title="Otros usuarios con movimientos en esta wallet">
                              <ShieldAlert className="w-3.5 h-3.5" />{w.shared_with.slice(0, 5).join(', ')}{w.shared_with.length > 5 ? ` +${w.shared_with.length - 5}` : ''}
                            </span>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                      </tr>
                    ))}
                    {data.withdraw_wallets.length === 0 && <tr><td colSpan={7} className="p-4 text-xs text-slate-500">Sin retiros</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data && tab === 'movimientos' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {([['all', 'Todos'], ['deposit', 'Depósitos'], ['withdrawal', 'Retiros'], ['failed', 'Fallidos']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTxFilter(k)}
                    className={`px-3 py-1 rounded-full text-xs ${txFilter === k ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>{l}</button>
                ))}
                <span className="ml-auto text-xs text-slate-500 self-center">{filteredTxs.length} movimientos (máx. 300)</span>
              </div>
              <div className="rounded-xl border border-slate-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-400 border-b border-slate-700 bg-slate-800/60">
                    <th className="text-left py-2 px-3">Fecha</th><th className="text-left py-2 px-3">Tipo</th><th className="text-right py-2 px-3">Cantidad</th>
                    <th className="text-right py-2 px-3">Bruto</th><th className="text-left py-2 px-3">Wallet</th><th className="text-left py-2 px-3">Tx</th><th className="text-left py-2 px-3">Estado</th>
                  </tr></thead>
                  <tbody>
                    {filteredTxs.map((x) => {
                      const hash = isHash(x.contract_tx_hash) ? x.contract_tx_hash! : x.tx_hash;
                      return (
                        <tr key={x.id} className="border-b border-slate-700/40 hover:bg-slate-700/20">
                          <td className="py-2 px-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(x.created_at)}</td>
                          <td className="py-2 px-3 text-xs">
                            {x.tx_type === 'deposit'
                              ? <span className="inline-flex items-center gap-1 text-emerald-300"><ArrowDownCircle className="w-3.5 h-3.5" />Depósito</span>
                              : <span className="inline-flex items-center gap-1 text-rose-300"><ArrowUpCircle className="w-3.5 h-3.5" />Retiro</span>}
                          </td>
                          <td className={`py-2 px-3 text-right font-mono ${x.tx_type === 'deposit' ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {x.tx_type === 'deposit' ? '+' : '−'}{fmt(x.amount)} <span className="text-slate-500 text-xs">{x.token}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-slate-400">{num(x.gross) !== num(x.amount) ? fmt(x.gross) : ''}</td>
                          <td className="py-2 px-3"><AddressCell address={x.wallet} /></td>
                          <td className="py-2 px-3">
                            {isHash(hash) ? (
                              <a href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-cyan-400 hover:underline">
                                {short(hash)}<ExternalLink className="w-3 h-3" />
                              </a>
                            ) : <span className="text-xs text-slate-600">—</span>}
                          </td>
                          <td className="py-2 px-3 text-xs">
                            {x.status === 'confirmed' ? <span className="text-emerald-400">Confirmado</span>
                              : <span className="text-amber-400" title={x.error || ''}>{x.status === 'failed' ? 'Fallido' : x.status}</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredTxs.length === 0 && <tr><td colSpan={7} className="p-4 text-xs text-slate-500">Sin movimientos</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data && tab === 'economia' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <div className="text-sm font-semibold text-slate-200 mb-3">TUNG por categoría (ganado / gastado)</div>
                <div className="space-y-2.5">
                  {data.ledger_by_category.map((c) => (
                    <div key={c.category}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300">{CATEGORY_LABELS[c.category] || c.category} <span className="text-slate-500">({c.count})</span></span>
                        <span className="font-mono"><span className="text-emerald-300">+{fmt(c.income)}</span> / <span className="text-rose-300">−{fmt(c.spent)}</span></span>
                      </div>
                      <div className="flex gap-1 h-2">
                        <div className="flex-1 bg-slate-700/50 rounded-full overflow-hidden flex justify-end">
                          <div className="h-full bg-emerald-500" style={{ width: `${(num(c.income) / ledgerMax) * 100}%` }} />
                        </div>
                        <div className="flex-1 bg-slate-700/50 rounded-full overflow-hidden">
                          <div className="h-full bg-rose-500" style={{ width: `${(num(c.spent) / ledgerMax) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {data.ledger_by_category.length === 0 && <div className="text-xs text-slate-500">Sin registros</div>}
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800/40">
                <div className="px-4 py-3 border-b border-slate-700 text-sm font-semibold text-slate-200">Últimos 100 movimientos de saldo</div>
                <div className="max-h-[55vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-800"><tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-2 px-3">Fecha</th><th className="text-left py-2 px-3">Concepto</th>
                      <th className="text-right py-2 px-3">Cambio</th><th className="text-right py-2 px-3">Saldo</th>
                    </tr></thead>
                    <tbody>
                      {data.ledger_recent.map((l) => (
                        <tr key={l.id} className="border-b border-slate-700/30">
                          <td className="py-1.5 px-3 text-slate-500 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                          <td className="py-1.5 px-3 text-slate-300">{l.description || CATEGORY_LABELS[l.category || 'sin_categoria'] || l.category}</td>
                          <td className={`py-1.5 px-3 text-right font-mono ${num(l.delta) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{num(l.delta) >= 0 ? '+' : ''}{fmt(l.delta)}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-slate-300">{fmt(l.balance_after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
