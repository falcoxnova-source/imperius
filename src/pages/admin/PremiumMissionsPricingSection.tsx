import { useState, useEffect } from 'react';
import { useAdminStore } from '../../store/adminStore';
import {
  Crown,
  Save,
  AlertCircle,
  CheckCircle,
  DollarSign,
  Coins,
  Loader2,
  RefreshCw,
} from 'lucide-react';

export function PremiumMissionsPricingSection() {
  const {
    premiumMissionsPricing,
    premiumTungPriceUsd,
    isLoading,
    fetchPremiumMissionsPricing,
    updatePremiumMissionPrice,
  } = useAdminStore();

  const [edits, setEdits] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchPremiumMissionsPricing();
  }, [fetchPremiumMissionsPricing]);

  const handleSave = async (missionId: number) => {
    setMessage(null);
    const raw = edits[missionId];
    const value = parseFloat(raw);
    if (isNaN(value) || value < 0) {
      setMessage({ type: 'error', text: 'Ingresa un valor en USD valido (0 o mayor)' });
      setTimeout(() => setMessage(null), 4000);
      return;
    }
    setSavingId(missionId);
    const result = await updatePremiumMissionPrice(missionId, value);
    setSavingId(null);
    if (result.success) {
      setMessage({ type: 'success', text: 'Precio actualizado correctamente' });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[missionId];
        return next;
      });
    } else {
      setMessage({ type: 'error', text: result.error || 'Error al guardar' });
    }
    setTimeout(() => setMessage(null), 5000);
  };

  const rewardLabel = (type: string, value: number, hours: number) => {
    if (type === 'production_bonus') return `+${value}% produccion ${hours}h`;
    if (type === 'speed_bonus') return `+${value}% velocidad ${hours}h`;
    return `+${value}% ${hours}h`;
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Crown className="w-6 h-6 text-yellow-400" />
          <div>
            <h2 className="text-xl font-bold text-white">Precios Misiones Premium</h2>
            <p className="text-sm text-slate-400">
              Define el precio en USD de cada mision premium. El jugador paga ese valor en TUNG segun el precio de mercado.
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchPremiumMissionsPricing()}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Recargar
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Coins className="w-4 h-4 text-yellow-400" />
          <span>Precio TUNG actual:</span>
          <span className="font-mono text-yellow-300">
            {premiumTungPriceUsd != null ? `$${premiumTungPriceUsd.toFixed(7)} USD` : 'No disponible'}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Costo en TUNG = precio USD ÷ precio TUNG. Se calcula automaticamente en cada compra.
        </p>
      </div>

      {message && (
        <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg ${
          message.type === 'success'
            ? 'bg-emerald-500/20 border border-emerald-500/50'
            : 'bg-red-500/20 border border-red-500/50'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          )}
          <p className={`text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
            {message.text}
          </p>
        </div>
      )}

      {isLoading && premiumMissionsPricing.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {premiumMissionsPricing.map((m) => {
            const editing = edits[m.id] !== undefined;
            const currentValue = editing ? edits[m.id] : (m.cost_usd != null ? String(m.cost_usd) : '');
            return (
              <div
                key={m.id}
                className="flex flex-col md:flex-row md:items-center gap-3 bg-slate-900/40 border border-slate-700/40 rounded-lg p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-yellow-300 truncate">{m.title_es}</h3>
                    {!m.is_active && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700 text-slate-400">Inactiva</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {rewardLabel(m.reward_type, m.reward_value, m.reward_duration_hours)}
                    <span className="text-slate-600"> · id {m.id} · {m.code}</span>
                  </p>
                  {m.computed_tung != null && (
                    <p className="text-xs text-emerald-400/80 mt-1 flex items-center gap-1">
                      <Coins className="w-3 h-3" /> Actualmente cuesta ~{m.computed_tung.toLocaleString()} TUNG
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={currentValue}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="0.00"
                      className="w-28 bg-slate-900/60 border border-slate-600 rounded-lg pl-8 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-colors font-mono text-sm"
                    />
                  </div>
                  <span className="text-xs text-slate-500">USD</span>
                  <button
                    onClick={() => handleSave(m.id)}
                    disabled={savingId === m.id}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white disabled:opacity-50 transition-all"
                  >
                    {savingId === m.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Guardar
                  </button>
                </div>
              </div>
            );
          })}

          {premiumMissionsPricing.length === 0 && (
            <p className="text-center text-slate-500 py-8">No hay misiones premium configuradas.</p>
          )}
        </div>
      )}
    </div>
  );
}
