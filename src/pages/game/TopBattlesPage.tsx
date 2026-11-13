import { useState, useEffect, useCallback } from 'react';
import { Swords, Medal, Crown, Shield, X, Clock, Target, Rocket, Loader2, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatNumber } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';

interface TopBattle {
  id: string;
  attacker_name: string;
  defender_name: string;
  attacker_alliance: string | null;
  defender_alliance: string | null;
  coordinates: string;
  result: string;
  rounds: number;
  created_at: string;
  total_units: number;
}

interface ReportUnit {
  code?: string;
  name?: string;
  quantity?: number;
  initial_quantity?: number;
  is_defense?: boolean;
  metal_cost?: number;
  crystal_cost?: number;
}

interface ReportData {
  initial_attacker?: ReportUnit[];
  attacker_initial?: ReportUnit[];
  initial_defender?: ReportUnit[];
  defender_initial?: ReportUnit[];
  attacker_remaining?: ReportUnit[];
  defender_remaining?: ReportUnit[];
  [key: string]: unknown;
}

interface BattleReport {
  id: string;
  attacker_name: string;
  defender_name: string;
  coordinates: string;
  result: string;
  rounds: number;
  created_at: string;
  attacker_losses_metal: number;
  attacker_losses_crystal: number;
  defender_losses_metal: number;
  defender_losses_crystal: number;
  debris_metal: number;
  debris_crystal: number;
  loot_metal: number;
  loot_crystal: number;
  loot_deuterium: number;
  report_data: ReportData;
}

interface NormalizedUnit {
  name: string;
  isDefense: boolean;
  initial: number;
  remaining: number;
  lost: number;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function resultInfo(result: string): { label: string; color: string; bg: string } {
  switch (result) {
    case 'attacker_won':
      return { label: 'Victoria Atacante', color: 'text-green-400', bg: 'from-green-500/20 to-green-900/10 border-green-500/40' };
    case 'defender_won':
      return { label: 'Victoria Defensor', color: 'text-red-400', bg: 'from-red-500/20 to-red-900/10 border-red-500/40' };
    default:
      return { label: 'Empate', color: 'text-yellow-400', bg: 'from-yellow-500/20 to-yellow-900/10 border-yellow-500/40' };
  }
}

function normalizeSide(initialRaw?: ReportUnit[], remainingRaw?: ReportUnit[]): NormalizedUnit[] {
  const initial = Array.isArray(initialRaw) ? initialRaw : [];
  const remaining = Array.isArray(remainingRaw) ? remainingRaw : [];
  const remainingByCode = new Map<string, number>();
  for (const u of remaining) {
    const key = u.code || u.name || '';
    remainingByCode.set(key, (remainingByCode.get(key) || 0) + (Number(u.quantity) || 0));
  }
  return initial.map((u) => {
    const key = u.code || u.name || '';
    const initialQty = Number(u.initial_quantity ?? u.quantity) || 0;
    const remainingQty = remaining.length > 0 ? (remainingByCode.get(key) ?? initialQty) : initialQty;
    const lost = Math.max(0, initialQty - remainingQty);
    return {
      name: u.name || u.code || '???',
      isDefense: !!u.is_defense,
      initial: initialQty,
      remaining: remainingQty,
      lost,
    };
  });
}

function UnitList({ units }: { units: NormalizedUnit[] }) {
  if (units.length === 0) {
    return <p className="text-gray-500 text-sm">🛰️ Sin tropas ni defensas</p>;
  }
  const ships = units.filter((u) => !u.isDefense);
  const defenses = units.filter((u) => u.isDefense);
  const renderGroup = (list: NormalizedUnit[], label: string) =>
    list.length > 0 && (
      <div className="mb-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
        <div className="space-y-1">
          {list.map((u, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-300">{u.name}</span>
              <span>
                <span className="text-white">{formatNumber(u.remaining)}</span>
                <span className="text-gray-500">/{formatNumber(u.initial)}</span>
                {u.lost > 0 && <span className="text-red-400 ml-1.5">-{formatNumber(u.lost)} 💀</span>}
                {u.lost === 0 && <span className="text-green-400 ml-1.5">✓</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  return (
    <div>
      {renderGroup(ships, 'Tropas')}
      {renderGroup(defenses, 'Defensas')}
    </div>
  );
}

function BattleReportModal({ report, onClose }: { report: BattleReport; onClose: () => void }) {
  const { t } = useI18n();
  const info = resultInfo(report.result);
  const rd = report.report_data || {};
  const attackerUnits = normalizeSide(rd.initial_attacker ?? rd.attacker_initial, rd.attacker_remaining);
  const defenderUnits = normalizeSide(rd.initial_defender ?? rd.defender_initial, rd.defender_remaining);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto p-4" onClick={onClose}>
      <div
        className="bg-space-900 border border-cyber-blue/30 rounded-2xl w-full max-w-3xl my-4 shadow-2xl shadow-cyber-blue/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-space-700 sticky top-0 bg-space-900 rounded-t-2xl z-10">
          <h3 className="font-orbitron text-lg text-cyber-red flex items-center gap-2">
            <Swords className="w-5 h-5" /> Reporte de Combate
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Result banner */}
          <div className={`bg-gradient-to-r ${info.bg} border rounded-xl p-4 text-center`}>
            <p className={`font-orbitron text-2xl ${info.color} mb-1`}>{info.label}</p>
            <p className="text-sm text-gray-400 flex items-center justify-center gap-3 flex-wrap">
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> [{report.coordinates}]</span>
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {report.rounds} rondas</span>
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {formatDate(report.created_at)}</span>
            </p>
          </div>

          {/* Units grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-space-800/80 rounded-lg p-4 border border-space-600">
              <h4 className="text-sm font-bold text-cyber-blue mb-3 flex items-center gap-2">
                <Target className="w-4 h-4" /> Atacante: {report.attacker_name}
              </h4>
              <UnitList units={attackerUnits} />
              <div className="mt-3 pt-3 border-t border-space-700">
                <p className="text-sm text-red-400">
                  Perdidas: {formatNumber(report.attacker_losses_metal || 0)} M / {formatNumber(report.attacker_losses_crystal || 0)} C
                </p>
              </div>
            </div>

            <div className="bg-space-800/80 rounded-lg p-4 border border-space-600">
              <h4 className="text-sm font-bold text-cyber-orange mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4" /> Defensor: {report.defender_name}
              </h4>
              <UnitList units={defenderUnits} />
              <div className="mt-3 pt-3 border-t border-space-700">
                <p className="text-sm text-red-400">
                  Perdidas: {formatNumber(report.defender_losses_metal || 0)} M / {formatNumber(report.defender_losses_crystal || 0)} C
                </p>
              </div>
            </div>
          </div>

          {/* Debris & loot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(report.debris_metal > 0 || report.debris_crystal > 0) && (
              <div className="bg-space-800/80 rounded-lg p-3 border border-space-600">
                <h4 className="text-xs font-bold text-gray-400 mb-2">🌑 Campo de Escombros</h4>
                <p className="text-sm">
                  <span className="text-white">{formatNumber(report.debris_metal)}</span> {t.resources.metal},{' '}
                  <span className="text-cyan-400">{formatNumber(report.debris_crystal)}</span> {t.resources.crystal}
                </p>
              </div>
            )}
            {(report.loot_metal > 0 || report.loot_crystal > 0 || report.loot_deuterium > 0) && (
              <div className="bg-space-800/80 rounded-lg p-3 border border-space-600">
                <h4 className="text-xs font-bold text-green-400 mb-2">💰 Saqueo</h4>
                <p className="text-sm">
                  <span className="text-white">{formatNumber(report.loot_metal)}</span> M,{' '}
                  <span className="text-cyan-400">{formatNumber(report.loot_crystal)}</span> C,{' '}
                  <span className="text-green-400">{formatNumber(report.loot_deuterium)}</span> D
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TopBattlesPage() {
  const { t } = useI18n();
  const [battles, setBattles] = useState<TopBattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BattleReport | null>(null);
  const [loadingReport, setLoadingReport] = useState<string | null>(null);

  const fetchBattles = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_top_battles', { p_limit: 100 });
    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setBattles((data as TopBattle[]) || []);
    }
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      await fetchBattles();
      if (active) setLoading(false);
    })();

    // Refresco en tiempo real: cuando se registra una batalla nueva, recargar el top.
    const channel = supabase
      .channel('top-battles-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'battle_reports' },
        () => { fetchBattles(); }
      )
      .subscribe();

    // Respaldo por si la suscripción realtime no está disponible: refrescar cada 30 s.
    const interval = setInterval(() => { fetchBattles(); }, 30000);

    return () => {
      active = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchBattles]);

  const openReport = useCallback(async (id: string) => {
    setLoadingReport(id);
    const { data, error } = await supabase.rpc('get_battle_report', { p_id: id });
    setLoadingReport(null);
    if (error) {
      setError(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) setSelected(row as BattleReport);
  }, []);

  const rankStyle = (rank: number) => {
    if (rank === 1) return { icon: <Crown className="w-5 h-5 text-yellow-400" />, ring: 'border-yellow-500/40 bg-yellow-500/5' };
    if (rank === 2) return { icon: <Medal className="w-5 h-5 text-gray-300" />, ring: 'border-gray-400/40 bg-gray-400/5' };
    if (rank === 3) return { icon: <Medal className="w-5 h-5 text-amber-600" />, ring: 'border-amber-600/40 bg-amber-600/5' };
    return { icon: <span className="text-gray-500 font-orbitron text-sm w-5 text-center">{rank}</span>, ring: 'border-space-700 bg-space-800/40' };
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-500/20 via-red-600/10 to-transparent border border-red-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <div className="text-red-400"><Swords className="w-10 h-10" /></div>
          <div>
            <h1 className="font-orbitron text-2xl text-white">{t.nav.topBattles}</h1>
            <p className="text-sm text-gray-400 mt-1">
              Las 100 batallas más épicas del universo, ordenadas por unidades involucradas. Haz clic para ver el reporte completo.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando batallas...
        </div>
      ) : battles.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Swords className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Aún no hay batallas registradas. ¡Sé el primero en dejar tu huella en el continente!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers (desktop) */}
          <div className="hidden sm:grid grid-cols-[3rem_1fr_10rem_8rem] gap-3 px-4 py-2 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
            <span>Lugar</span>
            <span>Participantes</span>
            <span className="text-right">Fecha</span>
            <span className="text-right">Unidades</span>
          </div>

          {battles.map((b, idx) => {
            const rank = idx + 1;
            const rs = rankStyle(rank);
            const res = resultInfo(b.result);
            const isLoading = loadingReport === b.id;
            return (
              <button
                key={b.id}
                onClick={() => openReport(b.id)}
                disabled={isLoading}
                className={`w-full text-left grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_10rem_8rem] gap-3 items-center px-4 py-3 rounded-xl border ${rs.ring} hover:border-cyber-blue/50 hover:bg-cyber-blue/5 transition-all`}
              >
                <span className="flex items-center justify-center">{rs.icon}</span>

                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 flex-wrap text-sm">
                    <span className="text-cyber-blue font-semibold truncate">
                      {b.attacker_name}
                      {b.attacker_alliance && <span className="text-gray-500 ml-1">[{b.attacker_alliance}]</span>}
                    </span>
                    <span className="text-gray-500 font-orbitron">VS</span>
                    <span className="text-cyber-orange font-semibold truncate">
                      {b.defender_name}
                      {b.defender_alliance && <span className="text-gray-500 ml-1">[{b.defender_alliance}]</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 mt-0.5 text-[11px]">
                    <span className={res.color}>{res.label}</span>
                    <span className="text-gray-600">•</span>
                    <span className="text-gray-500">[{b.coordinates}]</span>
                    <span className="text-gray-600 sm:hidden">•</span>
                    <span className="text-gray-500 sm:hidden">{formatDate(b.created_at)}</span>
                  </span>
                </span>

                <span className="hidden sm:block text-right text-xs text-gray-400">{formatDate(b.created_at)}</span>

                <span className="text-right">
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin inline text-cyber-blue" />
                  ) : (
                    <>
                      <span className="flex items-center justify-end gap-1 text-white font-orbitron text-sm">
                        <Rocket className="w-3.5 h-3.5 text-cyber-blue" />
                        {formatNumber(b.total_units)}
                      </span>
                      <span className="text-[10px] text-gray-500">unidades</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && <BattleReportModal report={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
