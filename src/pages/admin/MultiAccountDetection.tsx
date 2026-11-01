import { useState, useEffect, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  UserX,
  RefreshCw,
  Network,
  AlertTriangle,
  ArrowLeftRight,
  FileWarning,
  BarChart3,
  Eye,
  XCircle,
  CheckCircle2,
  Search,
  Shield,
  Fingerprint,
  Truck,
  Loader2,
  ChevronDown,
  ChevronUp,
  Link2,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import type { RiskCluster } from '../../store/adminStore';

type SubTab = 'clusters' | 'suspicious' | 'reports' | 'ips' | 'interactions';

export function MultiAccountDetection() {
  const {
    antiMultiStats,
    suspiciousAccounts,
    multiaccountReports,
    sharedIPs,
    suspiciousInteractions,
    riskClusterStats,
    fetchAntiMultiStats,
    fetchSuspiciousAccounts,
    fetchMultiaccountReports,
    fetchSharedIPs,
    fetchSuspiciousInteractions,
    fetchRiskClusters,
    reviewSuspiciousAccount,
    reviewMultiaccountReport,
  } = useAdminStore();

  const [subTab, setSubTab] = useState<SubTab>('clusters');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

  useEffect(() => {
    fetchAntiMultiStats();
    fetchRiskClusters();
    fetchSuspiciousAccounts();
    fetchMultiaccountReports();
    fetchSharedIPs();
    fetchSuspiciousInteractions();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchAntiMultiStats(),
      fetchRiskClusters(),
      fetchSuspiciousAccounts(),
      fetchMultiaccountReports(),
      fetchSharedIPs(),
      fetchSuspiciousInteractions(),
    ]);
    setIsRefreshing(false);
  };

  const filteredClusters = useMemo(() => {
    if (!riskClusterStats?.clusters) return [];
    let items = riskClusterStats.clusters;
    if (severityFilter !== 'all') {
      items = items.filter(c => c.risk_level === severityFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(c =>
        c.user1_name.toLowerCase().includes(q) ||
        c.user2_name.toLowerCase().includes(q)
      );
    }
    return items;
  }, [riskClusterStats, severityFilter, searchQuery]);

  const filteredSuspicious = useMemo(() => {
    if (!searchQuery.trim()) return suspiciousAccounts;
    const q = searchQuery.toLowerCase();
    return suspiciousAccounts.filter(s =>
      s.username.toLowerCase().includes(q) ||
      s.linked_username.toLowerCase().includes(q)
    );
  }, [suspiciousAccounts, searchQuery]);

  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return multiaccountReports;
    const q = searchQuery.toLowerCase();
    return multiaccountReports.filter(r =>
      r.reported_username.toLowerCase().includes(q) ||
      r.reporter_username.toLowerCase().includes(q) ||
      (r.suspected_linked_username || '').toLowerCase().includes(q)
    );
  }, [multiaccountReports, searchQuery]);

  const filteredIPs = useMemo(() => {
    if (!searchQuery.trim()) return sharedIPs;
    const q = searchQuery.toLowerCase();
    return sharedIPs.filter(g =>
      g.ip_address.includes(q) ||
      g.users.some(u => u.username.toLowerCase().includes(q))
    );
  }, [sharedIPs, searchQuery]);

  const filteredInteractions = useMemo(() => {
    if (!searchQuery.trim()) return suspiciousInteractions;
    const q = searchQuery.toLowerCase();
    return suspiciousInteractions.filter(i =>
      i.from_username.toLowerCase().includes(q) ||
      i.to_username.toLowerCase().includes(q)
    );
  }, [suspiciousInteractions, searchQuery]);

  const tabs: { id: SubTab; label: string; icon: typeof BarChart3; count?: number }[] = [
    { id: 'clusters', label: 'Grupos de Riesgo', icon: Link2, count: riskClusterStats?.total_pairs ?? 0 },
    { id: 'suspicious', label: 'Sospechosos', icon: AlertTriangle, count: suspiciousAccounts.filter(a => !a.is_reviewed).length },
    { id: 'reports', label: 'Reportes', icon: FileWarning, count: multiaccountReports.filter(r => r.status === 'pending').length },
    { id: 'ips', label: 'IPs Compartidas', icon: Network, count: sharedIPs.length },
    { id: 'interactions', label: 'Transferencias', icon: ArrowLeftRight, count: suspiciousInteractions.length },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <UserX className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Detector de Multicuentas</h2>
              <p className="text-sm text-slate-400">Analisis cruzado de IPs, fingerprints y transferencias</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 rounded-lg transition-colors text-sm text-slate-300 disabled:opacity-50"
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Actualizar
          </button>
        </div>

        <StatsCards stats={antiMultiStats} clusterStats={riskClusterStats} />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre de usuario..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
            />
          </div>
          {subTab === 'clusters' && (
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-slate-500"
            >
              <option value="all">Todos los niveles</option>
              <option value="critical">Critico</option>
              <option value="high">Alto</option>
              <option value="medium">Medio</option>
            </select>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-6 border-b border-slate-700/50 pb-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  subTab === tab.id
                    ? 'bg-red-600/90 text-white shadow-lg shadow-red-900/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {(tab.count ?? 0) > 0 && (
                  <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                    subTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {subTab === 'clusters' && (
          <ClustersTab
            clusters={filteredClusters}
            expandedCluster={expandedCluster}
            setExpandedCluster={setExpandedCluster}
          />
        )}

        {subTab === 'suspicious' && (
          <SuspiciousTab
            accounts={filteredSuspicious}
            onReview={reviewSuspiciousAccount}
          />
        )}

        {subTab === 'reports' && (
          <ReportsTab
            reports={filteredReports}
            onReview={reviewMultiaccountReport}
          />
        )}

        {subTab === 'ips' && (
          <SharedIPsTab groups={filteredIPs} />
        )}

        {subTab === 'interactions' && (
          <InteractionsTab interactions={filteredInteractions} />
        )}
      </div>
    </div>
  );
}

function StatsCards({
  stats,
  clusterStats,
}: {
  stats: ReturnType<typeof useAdminStore.getState>['antiMultiStats'];
  clusterStats: ReturnType<typeof useAdminStore.getState>['riskClusterStats'];
}) {
  if (!stats) return null;

  const cards = [
    {
      label: 'Criticos',
      value: clusterStats?.critical_count ?? 0,
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/20',
      icon: XCircle,
    },
    {
      label: 'Alto Riesgo',
      value: clusterStats?.high_count ?? 0,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10 border-orange-500/20',
      icon: AlertTriangle,
    },
    {
      label: 'IPs Compartidas',
      value: stats.shared_ips_count,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      icon: Network,
    },
    {
      label: 'Reportes Pendientes',
      value: stats.pending_reports,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10 border-yellow-500/20',
      icon: FileWarning,
    },
    {
      label: 'Sin Revisar',
      value: stats.unreviewed_suspicious,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10 border-cyan-500/20',
      icon: Eye,
    },
    {
      label: 'Confirmados Multi',
      value: stats.confirmed_multis,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10 border-rose-500/20',
      icon: Shield,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className={`rounded-lg p-3 border ${card.bg}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className={`w-3.5 h-3.5 ${card.color}`} />
              <span className="text-[11px] text-slate-400 leading-tight">{card.label}</span>
            </div>
            <span className={`text-2xl font-bold ${card.color}`}>{card.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function getIndicatorIcon(type: string) {
  switch (type) {
    case 'shared_ip': return Network;
    case 'shared_fingerprint': return Fingerprint;
    case 'transfers': return Truck;
    default: return AlertTriangle;
  }
}

function getIndicatorLabel(type: string) {
  switch (type) {
    case 'shared_ip': return 'IP Compartida';
    case 'shared_fingerprint': return 'Mismo Dispositivo';
    case 'transfers': return 'Transferencias';
    default: return type;
  }
}

function getIndicatorColor(type: string) {
  switch (type) {
    case 'shared_ip': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'shared_fingerprint': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'transfers': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

function getRiskColor(level: string) {
  switch (level) {
    case 'critical': return { bg: 'bg-red-900/20 border-red-700/40', text: 'text-red-400', badge: 'bg-red-600/30 text-red-300', bar: 'bg-red-500' };
    case 'high': return { bg: 'bg-orange-900/15 border-orange-700/30', text: 'text-orange-400', badge: 'bg-orange-600/30 text-orange-300', bar: 'bg-orange-500' };
    default: return { bg: 'bg-yellow-900/10 border-yellow-700/25', text: 'text-yellow-400', badge: 'bg-yellow-600/30 text-yellow-300', bar: 'bg-yellow-500' };
  }
}

function ClustersTab({
  clusters,
  expandedCluster,
  setExpandedCluster,
}: {
  clusters: RiskCluster[];
  expandedCluster: string | null;
  setExpandedCluster: (id: string | null) => void;
}) {
  if (clusters.length === 0) {
    return (
      <div className="text-center py-12">
        <Shield className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-lg">No se detectaron grupos de riesgo</p>
        <p className="text-slate-500 text-sm mt-1">
          El sistema analiza IPs, fingerprints y transferencias cruzadas de los ultimos 60 dias
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 mb-2">
        Grupos ordenados por puntuacion de riesgo. Cada grupo muestra las conexiones entre dos cuentas.
      </p>
      {clusters.map((cluster) => {
        const key = `${cluster.user1_id}-${cluster.user2_id}`;
        const isExpanded = expandedCluster === key;
        const risk = getRiskColor(cluster.risk_level);

        return (
          <div
            key={key}
            className={`rounded-lg border transition-all ${risk.bg} ${
              isExpanded ? 'ring-1 ring-slate-500/30' : ''
            }`}
          >
            <button
              onClick={() => setExpandedCluster(isExpanded ? null : key)}
              className="w-full p-4 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm truncate max-w-[120px]">
                      {cluster.user1_name}
                    </span>
                    <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="font-semibold text-white text-sm truncate max-w-[120px]">
                      {cluster.user2_name}
                    </span>
                  </div>
                  {cluster.already_confirmed && (
                    <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded bg-red-600/40 text-red-300 flex-shrink-0">
                      Confirmado
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <div className="hidden sm:flex items-center gap-1.5">
                    {cluster.indicators.map((ind, i) => {
                      const Icon = getIndicatorIcon(ind.type);
                      const color = getIndicatorColor(ind.type);
                      return (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border ${color}`}
                          title={`${getIndicatorLabel(ind.type)} (${ind.count})`}
                        >
                          <Icon className="w-3 h-3" />
                          {ind.count}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${risk.bar}`}
                        style={{ width: `${Math.min(cluster.risk_score, 100)}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${risk.text}`}>
                      {cluster.risk_score}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-slate-700/30 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {cluster.indicators.map((ind, i) => {
                    const Icon = getIndicatorIcon(ind.type);
                    const color = getIndicatorColor(ind.type);
                    return (
                      <div key={i} className={`rounded-lg p-3 border ${color} bg-opacity-50`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-4 h-4" />
                          <span className="text-sm font-medium">{getIndicatorLabel(ind.type)}</span>
                        </div>
                        <p className="text-xs opacity-80">
                          {ind.type === 'shared_ip' && `${ind.count} IP${ind.count > 1 ? 's' : ''} en comun en los ultimos 60 dias`}
                          {ind.type === 'shared_fingerprint' && `${ind.count} fingerprint${ind.count > 1 ? 's' : ''} de navegador coincidentes`}
                          {ind.type === 'transfers' && `${ind.count} transferencias de recursos entre estas cuentas`}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg font-medium uppercase tracking-wider ${risk.badge}`}>
                    {cluster.risk_level === 'critical' && 'Riesgo Critico'}
                    {cluster.risk_level === 'high' && 'Riesgo Alto'}
                    {cluster.risk_level === 'medium' && 'Riesgo Medio'}
                    {' - '}
                    {cluster.indicator_count} indicadores
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Puntuacion basada en coincidencias de fingerprint (40pts), IP (25pts) y transferencias (15+pts)
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SuspiciousTab({
  accounts,
  onReview,
}: {
  accounts: ReturnType<typeof useAdminStore.getState>['suspiciousAccounts'];
  onReview: (id: string, confirmed: boolean, notes: string) => Promise<{ success: boolean; error?: string }>;
}) {
  if (accounts.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">No hay cuentas sospechosas detectadas</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
      {accounts.map((account) => (
        <div
          key={account.id}
          className={`p-4 rounded-lg border transition-colors ${
            account.is_confirmed_multi
              ? 'bg-red-900/15 border-red-700/40'
              : account.is_reviewed
              ? 'bg-slate-900/30 border-slate-700/30 opacity-60'
              : 'bg-orange-900/15 border-orange-700/30'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="font-semibold text-white text-sm">{account.username}</span>
                <ArrowLeftRight className="w-3 h-3 text-slate-500" />
                <span className="font-semibold text-white text-sm">{account.linked_username}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-2 py-0.5 text-[11px] rounded border ${getIndicatorColor(account.suspicion_type)}`}>
                  {getIndicatorLabel(account.suspicion_type)}
                </span>
                <span className={`px-2 py-0.5 text-[11px] rounded ${
                  account.severity === 'critical' ? 'bg-red-600/30 text-red-400' :
                  account.severity === 'high' ? 'bg-orange-600/30 text-orange-400' :
                  account.severity === 'medium' ? 'bg-yellow-600/30 text-yellow-400' :
                  'bg-slate-600/30 text-slate-400'
                }`}>
                  {account.severity}
                </span>
                {account.is_confirmed_multi && (
                  <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded bg-red-600/40 text-red-300">
                    Confirmado Multi
                  </span>
                )}
                {account.is_reviewed && !account.is_confirmed_multi && (
                  <span className="px-2 py-0.5 text-[10px] rounded bg-green-600/30 text-green-400">
                    Revisado - OK
                  </span>
                )}
              </div>
              {account.review_notes && (
                <p className="text-xs text-slate-400 mt-1.5">Nota: {account.review_notes}</p>
              )}
              <p className="text-[11px] text-slate-500 mt-1">
                Detectado {formatDistanceToNow(new Date(account.created_at), { addSuffix: true })}
              </p>
            </div>
            {!account.is_reviewed && (
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={async () => {
                    const notes = prompt('Notas de revision (opcional):');
                    if (notes !== null) {
                      await onReview(account.id, true, notes || 'Confirmado multicuenta');
                    }
                  }}
                  className="p-2 bg-red-600/20 hover:bg-red-600/40 border border-red-600/40 rounded-lg transition-colors"
                  title="Confirmar multicuenta"
                >
                  <XCircle className="w-4 h-4 text-red-400" />
                </button>
                <button
                  onClick={async () => {
                    const notes = prompt('Notas de revision (opcional):');
                    if (notes !== null) {
                      await onReview(account.id, false, notes || 'Revisado - no es multicuenta');
                    }
                  }}
                  className="p-2 bg-green-600/20 hover:bg-green-600/40 border border-green-600/40 rounded-lg transition-colors"
                  title="Marcar como OK"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsTab({
  reports,
  onReview,
}: {
  reports: ReturnType<typeof useAdminStore.getState>['multiaccountReports'];
  onReview: (id: string, status: string, notes: string) => Promise<{ success: boolean; error?: string }>;
}) {
  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <FileWarning className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">No hay reportes de multicuentas</p>
      </div>
    );
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-orange-600/30 text-orange-400';
      case 'investigating': return 'bg-yellow-600/30 text-yellow-400';
      case 'confirmed': return 'bg-red-600/30 text-red-400';
      case 'dismissed': return 'bg-slate-600/30 text-slate-400';
      default: return 'bg-slate-600/30 text-slate-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente';
      case 'investigating': return 'Investigando';
      case 'confirmed': return 'Confirmado';
      case 'dismissed': return 'Descartado';
      default: return status;
    }
  };

  return (
    <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
      {reports.map((report) => (
        <div
          key={report.id}
          className={`p-4 rounded-lg border ${
            report.status === 'confirmed'
              ? 'bg-red-900/15 border-red-700/40'
              : report.status === 'dismissed'
              ? 'bg-slate-900/30 border-slate-700/30 opacity-60'
              : report.status === 'investigating'
              ? 'bg-yellow-900/15 border-yellow-700/30'
              : 'bg-orange-900/15 border-orange-700/30'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-slate-400 text-xs">Reportado:</span>
                <span className="font-semibold text-white text-sm">{report.reported_username}</span>
                {report.suspected_linked_username && (
                  <>
                    <ArrowLeftRight className="w-3 h-3 text-slate-500" />
                    <span className="font-semibold text-white text-sm">{report.suspected_linked_username}</span>
                  </>
                )}
              </div>
              <p className="text-sm text-slate-300">{report.reason}</p>
              {report.evidence_description && (
                <p className="text-xs text-slate-400 mt-1">{report.evidence_description}</p>
              )}
              <p className="text-[11px] text-slate-500 mt-1.5">
                Por: {report.reporter_username} - {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
              </p>
              {report.review_notes && (
                <p className="text-xs text-cyan-400 mt-1.5">Admin: {report.review_notes}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <span className={`px-2 py-0.5 text-[11px] rounded ${getStatusStyle(report.status)}`}>
                {getStatusLabel(report.status)}
              </span>
              {report.status === 'pending' && (
                <div className="flex gap-1">
                  <button
                    onClick={() => onReview(report.id, 'investigating', 'En investigacion')}
                    className="p-1.5 bg-yellow-600/20 hover:bg-yellow-600/40 border border-yellow-600/40 rounded transition-colors"
                    title="Marcar en investigacion"
                  >
                    <Eye className="w-3.5 h-3.5 text-yellow-400" />
                  </button>
                  <button
                    onClick={async () => {
                      const notes = prompt('Notas:');
                      if (notes !== null) {
                        await onReview(report.id, 'confirmed', notes || 'Confirmado');
                      }
                    }}
                    className="p-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-600/40 rounded transition-colors"
                    title="Confirmar multicuenta"
                  >
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  </button>
                  <button
                    onClick={async () => {
                      const notes = prompt('Razon del descarte:');
                      if (notes !== null) {
                        await onReview(report.id, 'dismissed', notes || 'No es multicuenta');
                      }
                    }}
                    className="p-1.5 bg-green-600/20 hover:bg-green-600/40 border border-green-600/40 rounded transition-colors"
                    title="Descartar reporte"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SharedIPsTab({ groups }: { groups: ReturnType<typeof useAdminStore.getState>['sharedIPs'] }) {
  if (groups.length === 0) {
    return (
      <div className="text-center py-12">
        <Network className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">No se detectaron IPs compartidas entre cuentas</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
      {groups.map((group, idx) => (
        <div
          key={idx}
          className="p-4 bg-slate-900/40 rounded-lg border border-orange-700/25"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-orange-400" />
              <code className="text-sm text-orange-400 font-mono">{group.ip_address}</code>
            </div>
            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
              group.user_count >= 3 ? 'bg-red-600/30 text-red-400' : 'bg-orange-600/30 text-orange-400'
            }`}>
              {group.user_count} cuentas
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {group.users.map((user, uidx) => (
              <span
                key={uidx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-800/80 rounded-lg text-white border border-slate-700/50"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                {user.username}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function InteractionsTab({ interactions }: { interactions: ReturnType<typeof useAdminStore.getState>['suspiciousInteractions'] }) {
  if (interactions.length === 0) {
    return (
      <div className="text-center py-12">
        <ArrowLeftRight className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">No se detectaron interacciones sospechosas</p>
        <p className="text-slate-500 text-sm mt-1">
          Se requieren al menos 3 transferencias entre dos cuentas en 30 dias
        </p>
      </div>
    );
  }

  const formatRes = (n: number) => Math.floor(n).toLocaleString();

  return (
    <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
      {interactions.map((interaction, idx) => {
        const scoreColor = interaction.suspicion_score >= 100
          ? 'text-red-400'
          : interaction.suspicion_score >= 50
          ? 'text-orange-400'
          : 'text-yellow-400';
        const borderColor = interaction.suspicion_score >= 100
          ? 'border-red-700/40 bg-red-900/15'
          : interaction.suspicion_score >= 50
          ? 'border-orange-700/30 bg-orange-900/15'
          : 'border-yellow-700/25 bg-yellow-900/10';

        return (
          <div key={idx} className={`p-4 rounded-lg border ${borderColor}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-sm">{interaction.from_username}</span>
                <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-semibold text-white text-sm">{interaction.to_username}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      interaction.suspicion_score >= 100 ? 'bg-red-500' :
                      interaction.suspicion_score >= 50 ? 'bg-orange-500' : 'bg-yellow-500'
                    }`}
                    style={{ width: `${Math.min(interaction.suspicion_score, 100)}%` }}
                  />
                </div>
                <span className={`text-sm font-bold tabular-nums ${scoreColor}`}>
                  {interaction.suspicion_score}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 uppercase tracking-wider text-[10px]">Enviado</span>
                <div className="text-emerald-400 mt-0.5 font-mono">
                  {formatRes(interaction.total_sent_metal)} M / {formatRes(interaction.total_sent_crystal)} C / {formatRes(interaction.total_sent_deuterium)} D
                </div>
              </div>
              <div>
                <span className="text-slate-500 uppercase tracking-wider text-[10px]">Recibido de vuelta</span>
                <div className="text-cyan-400 mt-0.5 font-mono">
                  {formatRes(interaction.total_received_metal)} M / {formatRes(interaction.total_received_crystal)} C / {formatRes(interaction.total_received_deuterium)} D
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {interaction.transfer_count} transferencias en los ultimos 30 dias
              {interaction.suspicion_score >= 100 && ' - 100% unidireccional (pushing/multicuenta)'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
