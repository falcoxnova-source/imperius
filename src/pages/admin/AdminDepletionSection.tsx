import { useState, useEffect } from 'react';
import { Globe, Save, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';

export function AdminDepletionSection() {
  const { depletionSettings, depletedPlanets, fetchDepletionSettings, updateDepletionSettings, fetchDepletedPlanets, forceRegeneratePlanets, isLoading } = useAdminStore();

  const [enabled, setEnabled] = useState(true);
  const [regenerationDays, setRegenerationDays] = useState(30);
  const [baseMetal, setBaseMetal] = useState(40000);
  const [depletedPercent, setDepletedPercent] = useState(5);
  const [refillPriceUsdt, setRefillPriceUsdt] = useState(10);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    fetchDepletionSettings();
    fetchDepletedPlanets();
  }, []);

  useEffect(() => {
    if (depletionSettings) {
      setEnabled(depletionSettings.enabled);
      setRegenerationDays(depletionSettings.regeneration_days);
      setBaseMetal(depletionSettings.base_metal_per_field);
      setDepletedPercent(depletionSettings.depleted_production_percent);
      setRefillPriceUsdt(depletionSettings.refill_price_usdt);
    }
  }, [depletionSettings]);

  const handleSave = async () => {
    setMessage(null);
    const result = await updateDepletionSettings({
      enabled,
      regeneration_days: regenerationDays,
      base_metal_per_field: baseMetal,
      depleted_production_percent: depletedPercent,
      refill_price_usdt: refillPriceUsdt,
    });
    setMessage(result.success
      ? { type: 'success', text: 'Configuración guardada correctamente' }
      : { type: 'error', text: result.error || 'Error al guardar' }
    );
  };

  const handleForceRegenerate = async () => {
    setMessage(null);
    const result = await forceRegeneratePlanets();
    setMessage(result.success
      ? { type: 'success', text: `Se regeneraron ${result.count || 0} planetas` }
      : { type: 'error', text: result.error || 'Error al regenerar' }
    );
    fetchDepletedPlanets(statusFilter || undefined);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Globe className="w-6 h-6 text-emerald-400" />
        <h2 className="text-xl font-semibold text-white">Sistema de Agotamiento</h2>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Config */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Configuración General</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between bg-slate-700/50 rounded-lg p-4">
            <div>
              <span className="text-white font-medium">Sistema Habilitado</span>
              <p className="text-xs text-slate-400">Activar/desactivar agotamiento de recursos</p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div className="bg-slate-700/50 rounded-lg p-4">
            <label className="text-white font-medium block mb-1">Días de Regeneración</label>
            <p className="text-xs text-slate-400 mb-2">Días hasta que un planeta agotado abandonado se regenera</p>
            <input
              type="number"
              value={regenerationDays}
              onChange={e => setRegenerationDays(Number(e.target.value))}
              className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-sm"
              min={7} max={90}
            />
          </div>

          <div className="bg-slate-700/50 rounded-lg p-4">
            <label className="text-white font-medium block mb-1">Metal Base por Campo</label>
            <p className="text-xs text-slate-400 mb-2">Metal inicial por cada campo del planeta (× factor posición)</p>
            <input
              type="number"
              value={baseMetal}
              onChange={e => setBaseMetal(Number(e.target.value))}
              className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-sm"
              min={5000} step={1000}
            />
          </div>

          <div className="bg-slate-700/50 rounded-lg p-4">
            <label className="text-white font-medium block mb-1">% Producción al Agotarse</label>
            <p className="text-xs text-slate-400 mb-2">Porcentaje de producción cuando el planeta está agotado</p>
            <input
              type="number"
              value={depletedPercent}
              onChange={e => setDepletedPercent(Number(e.target.value))}
              className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-sm"
              min={0} max={100}
            />
          </div>

          <div className="bg-slate-700/50 rounded-lg p-4">
            <label className="text-white font-medium block mb-1">Precio Recarga Completa (USDT)</label>
            <p className="text-xs text-slate-400 mb-2">Costo en USDT para recargar una colonia al 100%. El jugador paga en TUNG al precio de mercado y el costo es proporcional al agotamiento (a mitad de agotamiento, mitad del precio).</p>
            <input
              type="number"
              value={refillPriceUsdt}
              onChange={e => setRefillPriceUsdt(Number(e.target.value))}
              className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white text-sm"
              min={0} step={0.5}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isLoading}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> Guardar Configuración
        </button>
      </div>

      {/* Stats */}
      {depletionSettings && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{depletionSettings.depleted_count}</p>
            <p className="text-xs text-slate-400">Planetas Agotados</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{depletionSettings.regenerating_count}</p>
            <p className="text-xs text-slate-400">En Regeneración</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{regenerationDays}d</p>
            <p className="text-xs text-slate-400">Tiempo Regeneración</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-cyan-400">{depletedPercent}%</p>
            <p className="text-xs text-slate-400">Prod. al Agotarse</p>
          </div>
        </div>
      )}

      {/* Planet list */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Planetas Agotados / En Regeneración</h3>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); fetchDepletedPlanets(e.target.value || undefined); }}
              className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white"
            >
              <option value="">Todos</option>
              <option value="depleted">Agotados</option>
              <option value="regenerating">Regenerando</option>
            </select>
            <button
              onClick={() => fetchDepletedPlanets(statusFilter || undefined)}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleForceRegenerate}
              disabled={isLoading}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              Forzar Regeneración
            </button>
          </div>
        </div>

        {depletedPlanets.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">No hay planetas agotados ni en regeneración</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-left">
                  <th className="py-2 px-2">Coords</th>
                  <th className="py-2 px-2">Estado</th>
                  <th className="py-2 px-2">Campos</th>
                  <th className="py-2 px-2">Metal</th>
                  <th className="py-2 px-2">Cristal</th>
                  <th className="py-2 px-2">Deuterio</th>
                  <th className="py-2 px-2">Dueño</th>
                  <th className="py-2 px-2">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {depletedPlanets.map(p => (
                  <tr key={p.id} className="border-b border-slate-700/50 text-slate-300">
                    <td className="py-2 px-2 font-mono">[{p.galaxy}:{p.solar_system}:{p.position}]</td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.planet_status === 'depleted' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {p.planet_status === 'depleted' ? 'Agotado' : 'Regenerando'}
                      </span>
                    </td>
                    <td className="py-2 px-2">{p.fields_max}</td>
                    <td className="py-2 px-2 font-mono text-xs">{p.metal_deposit ? (p.metal_deposit / 1000000).toFixed(1) + 'M' : '∞'}</td>
                    <td className="py-2 px-2 font-mono text-xs">{p.crystal_deposit ? (p.crystal_deposit / 1000000).toFixed(1) + 'M' : '∞'}</td>
                    <td className="py-2 px-2 font-mono text-xs">{p.deuterium_deposit ? (p.deuterium_deposit / 1000000).toFixed(1) + 'M' : '∞'}</td>
                    <td className="py-2 px-2">{p.owner_name || '-'}</td>
                    <td className="py-2 px-2 text-xs text-slate-500">
                      {p.regenerates_at ? new Date(p.regenerates_at).toLocaleDateString() : p.depleted_at ? new Date(p.depleted_at).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-2">¿Cómo funciona?</h3>
        <ul className="text-xs text-slate-400 space-y-1">
          <li>• <b className="text-white">Planeta principal:</b> Depósitos infinitos, nunca se agota</li>
          <li>• <b className="text-white">Colonias:</b> Recursos finitos según campos × posición solar</li>
          <li>• <b className="text-white">Agotado:</b> Producción cae al {depletedPercent}%, el planeta sigue funcionando</li>
          <li>• <b className="text-white">Abandonar agotado:</b> Entra en regeneración por {regenerationDays} días, luego vuelve con nuevos recursos</li>
          <li>• <b className="text-white">Posiciones 1-3:</b> Rico en metal, pobre en deuterio · <b>Posiciones 13-15:</b> Pobre en metal, rico en deuterio</li>
        </ul>
      </div>
    </div>
  );
}
