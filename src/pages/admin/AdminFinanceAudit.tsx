// [FINAUDIT1] Panel de auditoria financiera: cuadre de la economia TUNG.
// Solo lectura. Consume admin_finance_overview / _users / _user_detail / _alerts / _flows.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Scale,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  Users,
  PiggyBank,
  Building2,
  Coins,
  Siren,
  ChevronDown,
} from 'lucide-react';

const PER_PAGE = 50;

type Overview = {
  generado_en: string;
  dentro_del_juego: {
    saldo_jugadores: number;
    jugadores: number;
    saldo_admin: number;
    pools_juego: number;
    tesoreria_empresa: number;
    total: number;
  };
  on_chain: {
    depositado_tung: number;
    depositos_n: number;
    retirado_tung: number;
    retiros_n: number;
    depositado_usdt: number;
    depositos_usdt_n: number;
    retirado_usdt: number;
    retiros_usdt_n: number;
    retiros_pendientes: number;
    retiros_pendientes_n: number;
    retiros_fallidos_n: number;
    neto_custodia: number;
  };
  cuadre: { emision_neta_juego: number; porcentaje_sobre_depositos: number };
  empresa: {
    ingresos_tung: number;
    ingresos_usdt: number;
    gastos: number;
    retiros_admin: number;
    disponible: number;
  };
  integridad: {
    ledger_movimientos: number;
    ledger_estimados: number;
    ledger_desde: string | null;
    ledger_hasta: string | null;
    rupturas_cadena: number;
    rupturas_usuarios: number;
    rupturas_monto: number;
    saldo_vs_ledger_n: number;
    saldo_vs_ledger_monto: number;
    saldo_sin_ledger_n: number;
    saldo_sin_ledger_monto: number;
    apertura_previa_n: number;
    apertura_previa_monto: number;
    saldos_negativos: number;
    estado: 'ok' | 'revisar' | 'critico';
  };
};

type UserRow = {
  id: string;
  username: string;
  saldo: number;
  saldo_usdt: number;
  is_admin: boolean;
  is_bot: boolean;
  depositado: number;
  retirado: number;
  depositado_usdt: number;
  retirado_usdt: number;
  n_dep: number;
  n_ret: number;
  ganado: number;
  gastado: number;
  n_mov: number;
  ultimo_mov: string | null;
  saldo_ledger: number | null;
  neto_onchain: number;
  estado: 'ok' | 'negativo' | 'descuadre' | 'sin_registro';
};

type Movement = {
  id: number;
  created_at: string;
  delta: number;
  balance_before: number | null;
  balance_after: number | null;
  category: string;
  description: string | null;
  is_estimated: boolean;
};

type WalletTx = {
  id: string;
  created_at: string;
  tx_type: string;
  token_type: string;
  status: string;
  amount: number;
  fxu_amount: number;
  tx_hash: string | null;
  wallet_address: string | null;
};

type Detail = {
  perfil: { id: string; username: string; saldo: number; saldo_usdt: number; creado: string };
  total_movimientos: number;
  movimientos: Movement[];
  transacciones: WalletTx[];
};

type Alerts = {
  rupturas_cadena: Array<{ username: string; ledger_id: number; created_at: string; desde: string; monto: number }>;
  saldo_vs_ledger: Array<{ username: string; saldo: number; saldo_ledger: number; monto: number; ultimo_mov: string }>;
  saldo_sin_registro: Array<{ username: string; saldo: number; created_at: string }>;
  saldos_negativos: Array<{ username: string; saldo: number }>;
  gano_mas_de_lo_que_deposito: Array<{ username: string; depositado: number; retirado: number; saldo: number; diferencia: number }>;
};

// [FINFRAUD1]
type FraudCase = {
  user_id: string | null;
  usuario: string;
  monto: number;
  cuando: string | null;
  nota: string;
};

type FraudSignal = {
  clave: string;
  gravedad: 'critica' | 'alta' | 'media' | 'info';
  titulo: string;
  que_significa: string;
  cobertura_desde?: string | null;
  casos: number;
  monto: number;
  detalle: FraudCase[];
};

type FraudScan = {
  generado_en: string;
  resumen: {
    nivel: 'critico' | 'revisar' | 'ok';
    senales_criticas: number;
    senales_altas: number;
    monto_sospechoso: number;
    auditoria_desde: string | null;
  };
  senales: FraudSignal[];
};

const n = (v: number | null | undefined, d = 2) =>
  (Number(v) || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

export function AdminFinanceAudit() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [fraud, setFraud] = useState<FraudScan | null>(null);
  const [openSignal, setOpenSignal] = useState<string | null>(null);

  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState('saldo');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailPage, setDetailPage] = useState(0);
  const [detailUser, setDetailUser] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, al, fr] = await Promise.all([
        supabase.rpc('admin_finance_overview'),
        supabase.rpc('admin_finance_alerts', { p_limit: 100 }),
        supabase.rpc('admin_finance_fraud_scan', { p_limit: 25 }),
      ]);
      if (ov.error) throw ov.error;
      if (al.error) throw al.error;
      if (fr.error) throw fr.error;
      setOverview(ov.data as Overview);
      setAlerts(al.data as Alerts);
      setFraud(fr.data as FraudScan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando la auditoria');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    try {
      const { data, error: err } = await supabase.rpc('admin_finance_users', {
        p_search: search || null,
        p_sort: sort,
        p_only_issues: onlyIssues,
        p_limit: PER_PAGE,
        p_offset: page * PER_PAGE,
      });
      if (err) throw err;
      const res = data as { total: number; rows: UserRow[] };
      setRows(res?.rows || []);
      setTotal(res?.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando usuarios');
    } finally {
      setLoadingRows(false);
    }
  }, [search, sort, onlyIssues, page]);

  const loadDetail = useCallback(async (userId: string, p: number) => {
    setLoadingDetail(true);
    try {
      const { data, error: err } = await supabase.rpc('admin_finance_user_detail', {
        p_user_id: userId,
        p_limit: PER_PAGE,
        p_offset: p * PER_PAGE,
      });
      if (err) throw err;
      setDetail(data as Detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el detalle');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (detailUser) loadDetail(detailUser, detailPage);
  }, [detailUser, detailPage, loadDetail]);

  const openDetail = (userId: string) => {
    setDetailUser(userId);
    setDetailPage(0);
  };

  const closeDetail = () => {
    setDetailUser(null);
    setDetail(null);
  };

  const integ = overview?.integridad;
  const estadoColor =
    integ?.estado === 'ok'
      ? 'from-green-900/30 to-green-800/20 border-green-700/40 text-green-300'
      : integ?.estado === 'revisar'
      ? 'from-amber-900/30 to-amber-800/20 border-amber-700/40 text-amber-300'
      : 'from-red-900/30 to-red-800/20 border-red-700/40 text-red-300';

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Scale className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-semibold text-white">Auditoria Financiera</h2>
          </div>
          <button
            onClick={loadOverview}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white rounded-lg transition-colors text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Recalcular
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/40 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading && !overview && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Calculando el cuadre...
          </div>
        )}

        {overview && (
          <>
            {/* Semaforo de integridad */}
            <div className={`p-4 mb-6 bg-gradient-to-br ${estadoColor} border rounded-lg`}>
              <div className="flex items-center gap-3">
                {integ?.estado === 'ok' ? (
                  <ShieldCheck className="w-8 h-8" />
                ) : integ?.estado === 'revisar' ? (
                  <AlertTriangle className="w-8 h-8" />
                ) : (
                  <ShieldAlert className="w-8 h-8" />
                )}
                <div>
                  <p className="text-lg font-bold">
                    {integ?.estado === 'ok'
                      ? 'Economia integra: no hay dinero sin registrar'
                      : integ?.estado === 'revisar'
                      ? 'Economia integra, con detalles historicos a revisar'
                      : 'ALERTA: hay saldo que no coincide con el registro'}
                  </p>
                  <p className="text-xs opacity-80">
                    {integ?.ledger_movimientos.toLocaleString('es-ES')} movimientos auditados ·{' '}
                    {integ?.rupturas_cadena} rupturas de cadena · {integ?.saldos_negativos} saldos negativos
                  </p>
                </div>
              </div>
            </div>

            {/* Bloque 1: cuadre global */}
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Balance general del token</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Card
                icon={<Users className="w-4 h-4 text-cyan-400" />}
                color="cyan"
                label="En saldos de jugadores"
                value={n(overview.dentro_del_juego.saldo_jugadores)}
                sub={`${overview.dentro_del_juego.jugadores.toLocaleString('es-ES')} cuentas`}
              />
              <Card
                icon={<Coins className="w-4 h-4 text-purple-400" />}
                color="purple"
                label="En pools del juego"
                value={n(overview.dentro_del_juego.pools_juego)}
                sub="Jackpot, mensual, VIP, destruccion"
              />
              <Card
                icon={<Building2 className="w-4 h-4 text-amber-400" />}
                color="amber"
                label="Tesoreria de la empresa"
                value={n(overview.dentro_del_juego.tesoreria_empresa)}
                sub="Ingresos no retirados ni gastados"
              />
              <Card
                icon={<PiggyBank className="w-4 h-4 text-emerald-400" />}
                color="emerald"
                label="Total dentro del juego"
                value={n(overview.dentro_del_juego.total)}
                sub={`Incluye ${n(overview.dentro_del_juego.saldo_admin)} del admin`}
              />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Card
                icon={<ArrowDownRight className="w-4 h-4 text-green-400" />}
                color="green"
                label="Depositado TUNG (confirmado)"
                value={n(overview.on_chain.depositado_tung)}
                sub={`${overview.on_chain.depositos_n} depositos`}
              />
              <Card
                icon={<ArrowUpRight className="w-4 h-4 text-red-400" />}
                color="red"
                label="Retirado TUNG (confirmado)"
                value={n(overview.on_chain.retirado_tung)}
                sub={`${overview.on_chain.retiros_n} retiros · ${overview.on_chain.retiros_fallidos_n} fallidos`}
              />
              <Card
                icon={<Wallet className="w-4 h-4 text-blue-400" />}
                color="blue"
                label="Neto en custodia"
                value={n(overview.on_chain.neto_custodia)}
                sub="Depositado menos retirado"
              />
              <Card
                icon={<Scale className="w-4 h-4 text-slate-300" />}
                color={overview.cuadre.emision_neta_juego >= 0 ? 'slate' : 'red'}
                label="Emision neta del juego"
                value={n(overview.cuadre.emision_neta_juego)}
                sub={`${n(overview.cuadre.porcentaje_sobre_depositos, 2)}% de lo depositado`}
              />
            </div>

            <div className="p-4 mb-6 bg-slate-900/40 border border-slate-700/40 rounded-lg text-xs text-slate-400 leading-relaxed">
              <p className="mb-1">
                <span className="text-slate-200 font-semibold">Como leer el cuadre:</span> todo el TUNG que existe
                dentro del juego ({n(overview.dentro_del_juego.total)}) se compara contra lo que realmente entro de
                la blockchain ({n(overview.on_chain.neto_custodia)}). La diferencia de{' '}
                <span className="text-cyan-300 font-semibold">{n(overview.cuadre.emision_neta_juego)}</span> es lo que
                el juego creo por recompensas (expediciones, misiones, rachas, premios) menos lo quemado.
              </p>
              <p>
                Si alguien se pusiera saldo directo en la base de datos sin depositar, esa cifra subiria de golpe y
                ademas apareceria en <span className="text-red-300 font-semibold">rupturas de cadena</span>. Hoy hay{' '}
                <span className="text-slate-200 font-semibold">{integ?.rupturas_cadena}</span> rupturas.
              </p>
            </div>

            {/* Bloque 2: USDT y empresa */}
            <h3 className="text-sm font-semibold text-slate-300 mb-3">USDT y empresa</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card
                icon={<ArrowDownRight className="w-4 h-4 text-green-400" />}
                color="green"
                label="Depositado USDT"
                value={n(overview.on_chain.depositado_usdt, 4)}
                sub={`${overview.on_chain.depositos_usdt_n} depositos`}
              />
              <Card
                icon={<ArrowUpRight className="w-4 h-4 text-red-400" />}
                color="red"
                label="Retirado USDT"
                value={n(overview.on_chain.retirado_usdt, 4)}
                sub={`${overview.on_chain.retiros_usdt_n} retiros`}
              />
              <Card
                icon={<Building2 className="w-4 h-4 text-amber-400" />}
                color="amber"
                label="Ingresos historicos"
                value={n(overview.empresa.ingresos_tung)}
                sub={`+ ${n(overview.empresa.ingresos_usdt, 4)} USDT`}
              />
              <Card
                icon={<Wallet className="w-4 h-4 text-emerald-400" />}
                color="emerald"
                label="Disponible para retirar"
                value={n(overview.empresa.disponible)}
                sub={`Gastos: ${n(overview.empresa.gastos)} · Retirado: ${n(overview.empresa.retiros_admin)}`}
              />
            </div>

            {/* Bloque 3: integridad detallada */}
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Control de integridad</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card
                icon={<ShieldAlert className="w-4 h-4 text-red-400" />}
                color={(integ?.rupturas_cadena || 0) > 0 ? 'red' : 'green'}
                label="Dinero sin registrar"
                value={String(integ?.rupturas_cadena ?? 0)}
                sub={`${n(integ?.rupturas_monto)} TUNG · ${integ?.rupturas_usuarios ?? 0} cuentas`}
              />
              <Card
                icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
                color={(integ?.saldo_vs_ledger_n || 0) > 0 ? 'amber' : 'green'}
                label="Saldo distinto al registro"
                value={String(integ?.saldo_vs_ledger_n ?? 0)}
                sub={`${n(integ?.saldo_vs_ledger_monto)} TUNG`}
              />
              <Card
                icon={<AlertTriangle className="w-4 h-4 text-slate-300" />}
                color="slate"
                label="Saldo sin movimientos"
                value={String(integ?.saldo_sin_ledger_n ?? 0)}
                sub={`${n(integ?.saldo_sin_ledger_monto)} TUNG (cuentas previas al registro)`}
              />
              <Card
                icon={<Coins className="w-4 h-4 text-slate-300" />}
                color="slate"
                label="Saldo de apertura"
                value={n(integ?.apertura_previa_monto)}
                sub={`${integ?.apertura_previa_n ?? 0} cuentas anteriores al registro`}
              />
            </div>

            {alerts && (
              <div className="space-y-4 mb-2">
                <AlertBlock
                  title="Dinero que aparecio o desaparecio sin quedar registrado"
                  danger
                  empty="Ninguno. La cadena de movimientos esta intacta."
                  rows={alerts.rupturas_cadena.map((r) => ({
                    key: `${r.ledger_id}`,
                    label: r.username,
                    value: `${r.monto > 0 ? '+' : ''}${n(r.monto)} TUNG`,
                    extra: new Date(r.created_at).toLocaleString('es-ES'),
                  }))}
                />
                <AlertBlock
                  title="Saldo actual que no coincide con el ultimo movimiento"
                  danger
                  empty="Ninguno. Todos los saldos coinciden con su registro."
                  rows={alerts.saldo_vs_ledger.map((r) => ({
                    key: r.username,
                    label: r.username,
                    value: `${n(r.monto)} TUNG de diferencia`,
                    extra: `Saldo ${n(r.saldo)} vs registro ${n(r.saldo_ledger)}`,
                  }))}
                />
                <AlertBlock
                  title="Cuentas con saldo y sin ningun movimiento registrado"
                  empty="Ninguna."
                  rows={alerts.saldo_sin_registro.map((r) => ({
                    key: r.username,
                    label: r.username,
                    value: `${n(r.saldo)} TUNG`,
                    extra: `Creada ${new Date(r.created_at).toLocaleDateString('es-ES')}`,
                  }))}
                />
                <AlertBlock
                  title="Saldos negativos"
                  danger
                  empty="Ninguno."
                  rows={alerts.saldos_negativos.map((r) => ({
                    key: r.username,
                    label: r.username,
                    value: `${n(r.saldo)} TUNG`,
                    extra: '',
                  }))}
                />
                <AlertBlock
                  title="Cuentas que retiraron mas de lo que depositaron"
                  empty="Ninguna."
                  note="Normal si ganaron jugando o vendiendo en el mercado. Sirve para revisar casos extremos."
                  rows={alerts.gano_mas_de_lo_que_deposito.map((r) => ({
                    key: r.username,
                    label: r.username,
                    value: `+${n(r.diferencia)} TUNG`,
                    extra: `Deposito ${n(r.depositado)} · Retiro ${n(r.retirado)} · Saldo ${n(r.saldo)}`,
                  }))}
                />
              </div>
            )}

            <p className="text-xs text-slate-500">
              Calculado el {new Date(overview.generado_en).toLocaleString('es-ES')}
            </p>
          </>
        )}
      </div>

      {/* [FINFRAUD1] Deteccion de trampas */}
      {fraud && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Siren className="w-6 h-6 text-rose-400" />
            <h3 className="text-lg font-semibold text-white">Deteccion de trampas</h3>
          </div>

          <div
            className={`p-4 mb-5 border rounded-lg bg-gradient-to-br ${
              fraud.resumen.nivel === 'ok'
                ? 'from-green-900/30 to-green-800/20 border-green-700/40 text-green-300'
                : fraud.resumen.nivel === 'revisar'
                ? 'from-amber-900/30 to-amber-800/20 border-amber-700/40 text-amber-300'
                : 'from-red-900/30 to-red-800/20 border-red-700/40 text-red-300'
            }`}
          >
            <div className="flex items-center gap-3">
              {fraud.resumen.nivel === 'ok' ? (
                <ShieldCheck className="w-8 h-8" />
              ) : fraud.resumen.nivel === 'revisar' ? (
                <AlertTriangle className="w-8 h-8" />
              ) : (
                <ShieldAlert className="w-8 h-8" />
              )}
              <div>
                <p className="text-lg font-bold">
                  {fraud.resumen.nivel === 'ok'
                    ? 'Sin indicios de manipulacion'
                    : fraud.resumen.nivel === 'revisar'
                    ? 'Hay cosas raras que conviene mirar'
                    : 'ALERTA: indicios claros de manipulacion'}
                </p>
                <p className="text-xs opacity-80">
                  {fraud.resumen.senales_criticas} señales graves · {fraud.resumen.senales_altas} señales
                  a revisar · {n(fraud.resumen.monto_sospechoso)} TUNG implicados
                </p>
              </div>
            </div>
          </div>

          <div className="mb-5 p-3 bg-slate-900/50 border border-slate-700/40 rounded-lg text-xs text-slate-400 leading-relaxed">
            Cada señal mira una forma distinta de meter dinero falso. Pulsa en una para ver a quien
            afecta. Verde quiere decir que esa via esta limpia. Si alguien se pone tokens directo en
            la base de datos, aparecera en <span className="text-slate-200">Saldo alterado sin movimiento</span> o
            en <span className="text-slate-200">Dinero añadido fuera del juego</span>.
          </div>

          <div className="space-y-2">
            {fraud.senales.map((s) => {
              const limpio = s.casos === 0;
              const tono = limpio
                ? 'border-green-700/30 bg-green-900/10'
                : s.gravedad === 'critica'
                ? 'border-red-700/40 bg-red-900/20'
                : s.gravedad === 'alta'
                ? 'border-amber-700/40 bg-amber-900/20'
                : s.gravedad === 'media'
                ? 'border-slate-600/40 bg-slate-900/40'
                : 'border-slate-700/30 bg-slate-900/20';
              const abierto = openSignal === s.clave;
              return (
                <div key={s.clave} className={`border rounded-lg ${tono}`}>
                  <button
                    onClick={() => setOpenSignal(abierto ? null : s.clave)}
                    className="w-full flex items-center justify-between gap-3 p-3 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {limpio ? (
                        <ShieldCheck className="w-5 h-5 text-green-400 shrink-0" />
                      ) : (
                        <AlertTriangle
                          className={`w-5 h-5 shrink-0 ${
                            s.gravedad === 'critica'
                              ? 'text-red-400'
                              : s.gravedad === 'alta'
                              ? 'text-amber-400'
                              : 'text-slate-400'
                          }`}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{s.titulo}</p>
                        <p className="text-xs text-slate-400">
                          {limpio
                            ? 'Limpio, ningun caso'
                            : `${s.casos} caso${s.casos === 1 ? '' : 's'} · ${n(s.monto)} TUNG`}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                        abierto ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {abierto && (
                    <div className="px-3 pb-3 space-y-3">
                      <p className="text-xs text-slate-400 leading-relaxed border-l-2 border-slate-600 pl-3">
                        {s.que_significa}
                        {s.cobertura_desde && (
                          <span className="block mt-1 text-slate-500">
                            Esta señal solo cubre desde el{' '}
                            {new Date(s.cobertura_desde).toLocaleDateString('es-ES')}, que es cuando
                            se activo este registro.
                          </span>
                        )}
                      </p>
                      {s.detalle.length === 0 ? (
                        <p className="text-xs text-green-400">Nada que mostrar.</p>
                      ) : (
                        <div className="space-y-1">
                          {s.detalle.map((c, i) => (
                            <div
                              key={`${s.clave}-${i}`}
                              onClick={() => c.user_id && openDetail(c.user_id)}
                              className="flex items-start justify-between gap-3 p-2 bg-slate-900/60 rounded hover:bg-slate-900 cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className="text-sm text-white truncate">{c.usuario}</p>
                                <p className="text-xs text-slate-500">{c.nota}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold text-amber-300">
                                  {n(c.monto)} TUNG
                                </p>
                                {c.cuando && (
                                  <p className="text-xs text-slate-500">
                                    {new Date(c.cuando).toLocaleString('es-ES')}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                          {s.casos > s.detalle.length && (
                            <p className="text-xs text-slate-500 pt-1">
                              Mostrando los {s.detalle.length} mayores de {s.casos}.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabla por usuario */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-lg font-semibold text-white">Movimiento por jugador</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(0);
                    setSearch(searchInput.trim());
                  }
                }}
                placeholder="Buscar usuario y Enter"
                className="pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 w-56"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => {
                setPage(0);
                setSort(e.target.value);
              }}
              className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
            >
              <option value="saldo">Mayor saldo</option>
              <option value="depositado">Mas depositado</option>
              <option value="retirado">Mas retirado</option>
              <option value="neto">Mayor neto</option>
              <option value="ganado">Mas ganado</option>
              <option value="gastado">Mas gastado</option>
            </select>
            <label className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyIssues}
                onChange={(e) => {
                  setPage(0);
                  setOnlyIssues(e.target.checked);
                }}
                className="accent-cyan-500"
              />
              Solo con problemas
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-slate-300 border-b border-slate-700/50">Usuario</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-300 border-b border-slate-700/50">Saldo</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-300 border-b border-slate-700/50">Depositado</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-300 border-b border-slate-700/50">Retirado</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-300 border-b border-slate-700/50">Neto</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-300 border-b border-slate-700/50">Ganado</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-300 border-b border-slate-700/50">Gastado</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-300 border-b border-slate-700/50">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loadingRows && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Cargando...
                  </td>
                </tr>
              )}
              {!loadingRows && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    Sin resultados
                  </td>
                </tr>
              )}
              {!loadingRows &&
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openDetail(r.id)}
                    className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer"
                  >
                    <td className="py-3 px-4 text-slate-200">
                      {r.username}
                      {r.is_admin && <span className="ml-2 text-xs text-red-400">admin</span>}
                      {r.is_bot && <span className="ml-2 text-xs text-slate-500">bot</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-cyan-300 font-medium">{n(r.saldo)}</td>
                    <td className="py-3 px-4 text-right text-green-400">{n(r.depositado)}</td>
                    <td className="py-3 px-4 text-right text-red-400">{n(r.retirado)}</td>
                    <td className={`py-3 px-4 text-right ${r.neto_onchain >= 0 ? 'text-slate-200' : 'text-amber-300'}`}>
                      {n(r.neto_onchain)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">{n(r.ganado)}</td>
                    <td className="py-3 px-4 text-right text-slate-300">{n(r.gastado)}</td>
                    <td className="py-3 px-4 text-center">
                      <EstadoBadge estado={r.estado} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-700">
          <div className="text-sm text-slate-400">
            {total > 0
              ? `Mostrando ${page * PER_PAGE + 1} - ${Math.min((page + 1) * PER_PAGE, total)} de ${total.toLocaleString('es-ES')}`
              : 'Sin registros'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors text-sm"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="px-3 py-2 text-slate-400 text-sm">
              Pagina {page + 1} de {Math.ceil(total / PER_PAGE) || 1}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PER_PAGE >= total}
              className="flex items-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors text-sm"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal de detalle */}
      {detailUser && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-5xl my-8">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div>
                <h4 className="text-lg font-semibold text-white">
                  {detail?.perfil.username || 'Cargando...'}
                </h4>
                {detail && (
                  <p className="text-xs text-slate-400">
                    Saldo {n(detail.perfil.saldo)} TUNG · {n(detail.perfil.saldo_usdt, 4)} USDT ·{' '}
                    {detail.total_movimientos.toLocaleString('es-ES')} movimientos
                  </p>
                )}
              </div>
              <button onClick={closeDetail} className="p-2 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-6">
              {loadingDetail && (
                <div className="text-slate-400 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                </div>
              )}

              {detail && (
                <>
                  <div>
                    <h5 className="text-sm font-semibold text-slate-300 mb-2">Depositos y retiros on-chain</h5>
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-900">
                          <tr>
                            <th className="text-left py-2 px-3 text-slate-400 border-b border-slate-700/50">Fecha</th>
                            <th className="text-left py-2 px-3 text-slate-400 border-b border-slate-700/50">Tipo</th>
                            <th className="text-right py-2 px-3 text-slate-400 border-b border-slate-700/50">Monto</th>
                            <th className="text-left py-2 px-3 text-slate-400 border-b border-slate-700/50">Estado</th>
                            <th className="text-left py-2 px-3 text-slate-400 border-b border-slate-700/50">Hash</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.transacciones.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-3 px-3 text-slate-500">
                                Nunca deposito ni retiro
                              </td>
                            </tr>
                          )}
                          {detail.transacciones.map((t) => (
                            <tr key={t.id} className="border-b border-slate-800">
                              <td className="py-2 px-3 text-slate-400">
                                {new Date(t.created_at).toLocaleString('es-ES')}
                              </td>
                              <td className="py-2 px-3">
                                <span className={t.tx_type === 'deposit' ? 'text-green-400' : 'text-red-400'}>
                                  {t.tx_type === 'deposit' ? 'Deposito' : 'Retiro'} {t.token_type}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right text-slate-200">{n(t.amount, 4)}</td>
                              <td className="py-2 px-3 text-slate-400">{t.status}</td>
                              <td className="py-2 px-3 text-slate-500 font-mono">
                                {t.tx_hash ? `${t.tx_hash.slice(0, 10)}...` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-semibold text-slate-300 mb-2">Movimientos de saldo</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="text-left py-2 px-3 text-slate-400 border-b border-slate-700/50">Fecha</th>
                            <th className="text-left py-2 px-3 text-slate-400 border-b border-slate-700/50">Concepto</th>
                            <th className="text-right py-2 px-3 text-slate-400 border-b border-slate-700/50">Cambio</th>
                            <th className="text-right py-2 px-3 text-slate-400 border-b border-slate-700/50">Antes</th>
                            <th className="text-right py-2 px-3 text-slate-400 border-b border-slate-700/50">Despues</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.movimientos.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-3 px-3 text-slate-500">
                                Sin movimientos registrados
                              </td>
                            </tr>
                          )}
                          {detail.movimientos.map((m) => (
                            <tr key={m.id} className="border-b border-slate-800">
                              <td className="py-2 px-3 text-slate-400">
                                {new Date(m.created_at).toLocaleString('es-ES')}
                              </td>
                              <td className="py-2 px-3 text-slate-300">
                                {m.description || m.category}
                                {m.is_estimated && (
                                  <span className="ml-2 text-[10px] text-slate-500">(informativo)</span>
                                )}
                              </td>
                              <td
                                className={`py-2 px-3 text-right font-medium ${
                                  m.delta >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}
                              >
                                {m.delta >= 0 ? '+' : ''}
                                {n(m.delta)}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-500">
                                {m.balance_before === null ? '-' : n(m.balance_before)}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-300">
                                {m.balance_after === null ? '-' : n(m.balance_after)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700">
                      <div className="text-xs text-slate-400">
                        {detail.total_movimientos > 0
                          ? `Mostrando ${detailPage * PER_PAGE + 1} - ${Math.min(
                              (detailPage + 1) * PER_PAGE,
                              detail.total_movimientos
                            )} de ${detail.total_movimientos.toLocaleString('es-ES')}`
                          : 'Sin movimientos'}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setDetailPage((p) => Math.max(0, p - 1))}
                          disabled={detailPage === 0}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors text-xs"
                        >
                          <ChevronLeft className="w-3 h-3" />
                          Anterior
                        </button>
                        <button
                          onClick={() => setDetailPage((p) => p + 1)}
                          disabled={(detailPage + 1) * PER_PAGE >= detail.total_movimientos}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors text-xs"
                        >
                          Siguiente
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: UserRow['estado'] }) {
  const map: Record<UserRow['estado'], { text: string; cls: string }> = {
    ok: { text: 'OK', cls: 'bg-green-900/30 text-green-300 border-green-700/40' },
    negativo: { text: 'Negativo', cls: 'bg-red-900/30 text-red-300 border-red-700/40' },
    descuadre: { text: 'Descuadre', cls: 'bg-red-900/30 text-red-300 border-red-700/40' },
    sin_registro: { text: 'Sin registro', cls: 'bg-amber-900/30 text-amber-300 border-amber-700/40' },
  };
  const v = map[estado] || map.ok;
  return <span className={`px-2 py-1 rounded-md border text-xs font-medium ${v.cls}`}>{v.text}</span>;
}

function Card({
  icon,
  color,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
  sub?: string;
}) {
  const grad: Record<string, string> = {
    cyan: 'from-cyan-900/30 to-cyan-800/20 border-cyan-700/30 text-cyan-400',
    green: 'from-green-900/30 to-green-800/20 border-green-700/30 text-green-400',
    red: 'from-red-900/30 to-red-800/20 border-red-700/30 text-red-400',
    amber: 'from-amber-900/30 to-amber-800/20 border-amber-700/30 text-amber-400',
    emerald: 'from-emerald-900/30 to-emerald-800/20 border-emerald-700/30 text-emerald-400',
    purple: 'from-purple-900/30 to-purple-800/20 border-purple-700/30 text-purple-400',
    blue: 'from-blue-900/30 to-blue-800/20 border-blue-700/30 text-blue-400',
    slate: 'from-slate-800/60 to-slate-800/30 border-slate-700/40 text-slate-200',
  };
  const cls = grad[color] || grad.slate;
  return (
    <div className={`p-4 bg-gradient-to-br ${cls} border rounded-lg`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium opacity-90">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function AlertBlock({
  title,
  rows,
  empty,
  danger,
  note,
}: {
  title: string;
  rows: Array<{ key: string; label: string; value: string; extra: string }>;
  empty: string;
  danger?: boolean;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const has = rows.length > 0;
  return (
    <div
      className={`border rounded-lg ${
        has && danger ? 'border-red-700/40 bg-red-900/10' : 'border-slate-700/40 bg-slate-900/30'
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-slate-200">{title}</span>
        <span className={`text-sm font-semibold ${has && danger ? 'text-red-300' : 'text-slate-400'}`}>
          {has ? `${rows.length}` : '0'}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {note && <p className="text-xs text-slate-500 mb-2">{note}</p>}
          {!has && <p className="text-xs text-slate-500">{empty}</p>}
          {has && (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {rows.map((r) => (
                <div
                  key={r.key}
                  className="flex items-center justify-between gap-3 py-2 px-3 bg-slate-800/40 rounded text-xs"
                >
                  <span className="text-slate-200 font-medium">{r.label}</span>
                  <span className="text-slate-400 flex-1 text-right truncate">{r.extra}</span>
                  <span className={danger ? 'text-red-300 font-semibold' : 'text-cyan-300 font-semibold'}>
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
