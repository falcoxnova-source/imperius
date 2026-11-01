/**
 * JumpGateModal - Modal para usar el Portal de Salto (Jump Gate)
 *
 * Permite transferir naves instantáneamente entre dos lunas con Portal de Salto.
 * - Sin costo de deuterio
 * - No transfiere recursos
 * - Cooldown de 60 minutos (se reduce con nivel)
 */

import { useState, useEffect, useCallback } from 'react';
import { X, ArrowRight, Clock, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGameStore } from '../../store/gameStore';
import { useI18n, translateEntityName } from '../../lib/i18n';
import { formatTimeRemaining } from '../../lib/utils';
import type { Planet } from '../../types/game';

interface JumpGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  originMoon: Planet;
}

interface TargetMoonInfo {
  moon: Planet;
  gateLevel: number;
}

export function JumpGateModal({ isOpen, onClose, originMoon }: JumpGateModalProps) {
  const { t } = useI18n();
  const { planets, ships, fetchShips, fetchPlanets } = useGameStore();
  const user = useGameStore((s) => s.currentPlanet?.user_id);

  const [targetMoons, setTargetMoons] = useState<TargetMoonInfo[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [shipQuantities, setShipQuantities] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMoons, setIsLoadingMoons] = useState(true);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [cooldownEnd, setCooldownEnd] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTarget('');
      setShipQuantities({});
      setResult(null);
      setIsLoading(false);

      // Initialize cooldown from origin moon data
      if (originMoon.jump_gate_cooldown) {
        const end = new Date(originMoon.jump_gate_cooldown).getTime();
        setCooldownEnd(end > Date.now() ? originMoon.jump_gate_cooldown : null);
      } else {
        setCooldownEnd(null);
      }
    }
  }, [isOpen, originMoon.jump_gate_cooldown]);

  // Cooldown timer
  useEffect(() => {
    if (!cooldownEnd) return;
    const interval = setInterval(() => {
      if (new Date(cooldownEnd).getTime() <= Date.now()) {
        setCooldownEnd(null);
      }
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  // Fetch other moons with jump gates
  useEffect(() => {
    if (!isOpen) return;

    const fetchTargetMoons = async () => {
      setIsLoadingMoons(true);
      try {
        // Get all user moons (except origin) that have a jump gate
        const otherMoons = planets.filter(
          (p) => p.planet_type === 'moon' && p.id !== originMoon.id
        );

        if (otherMoons.length === 0) {
          setTargetMoons([]);
          setIsLoadingMoons(false);
          return;
        }

        // Get jump_gate building type id first (reliable approach)
        const { data: jumpGateType } = await supabase
          .from('building_types')
          .select('id')
          .eq('code', 'jump_gate')
          .single();

        if (!jumpGateType) {
          setTargetMoons([]);
          setIsLoadingMoons(false);
          return;
        }

        // Query planet_buildings directly by building_type_id
        const { data: gateBuildings } = await supabase
          .from('planet_buildings')
          .select('planet_id, level')
          .in('planet_id', otherMoons.map((m) => m.id))
          .eq('building_type_id', jumpGateType.id)
          .gt('level', 0);

        const moonsWithGates: TargetMoonInfo[] = [];
        for (const gate of gateBuildings || []) {
          const moon = otherMoons.find((m) => m.id === gate.planet_id);
          if (moon) {
            moonsWithGates.push({ moon, gateLevel: gate.level });
          }
        }

        setTargetMoons(moonsWithGates);
        if (moonsWithGates.length === 1) {
          setSelectedTarget(moonsWithGates[0].moon.id);
        }
      } catch (err) {
        console.error('Error fetching target moons:', err);
      } finally {
        setIsLoadingMoons(false);
      }
    };

    fetchTargetMoons();
  }, [isOpen, planets, originMoon.id]);

  // Ships available on origin moon
  const availableShips = ships.filter((s) => s.quantity > 0 && s.ship_type);

  const handleQuantityChange = useCallback((shipTypeId: number, value: string, max: number) => {
    const num = Math.min(Math.max(0, parseInt(value) || 0), max);
    setShipQuantities((prev) => ({ ...prev, [shipTypeId]: num }));
  }, []);

  const setAllShips = useCallback(() => {
    const all: Record<number, number> = {};
    for (const s of availableShips) {
      all[s.ship_type_id] = s.quantity;
    }
    setShipQuantities(all);
  }, [availableShips]);

  const clearAllShips = useCallback(() => {
    setShipQuantities({});
  }, []);

  const totalShipsSelected = Object.values(shipQuantities).reduce((a, b) => a + b, 0);

  const handleTransfer = async () => {
    if (!selectedTarget || totalShipsSelected === 0) return;

    setIsLoading(true);
    setResult(null);

    try {
      const shipsArray = Object.entries(shipQuantities)
        .filter(([, qty]) => qty > 0)
        .map(([shipTypeId, quantity]) => ({
          ship_type_id: parseInt(shipTypeId),
          quantity,
        }));

      const { data, error } = await supabase.rpc('use_jump_gate', {
        p_origin_moon_id: originMoon.id,
        p_target_moon_id: selectedTarget,
        p_ships: shipsArray,
      });

      if (error) throw error;

      const response = data as { success: boolean; message?: string; reason?: string; cooldown_ends?: string; cooldown_minutes?: number };

      if (response.success) {
        setResult({ success: true, message: t.galaxy.jumpGateSuccess });
        setShipQuantities({});
        // Refresh data
        await fetchShips(originMoon.id);
        if (user) await fetchPlanets(user);
        if (response.cooldown_minutes) {
          setCooldownEnd(new Date(Date.now() + response.cooldown_minutes * 60000).toISOString());
        }
      } else {
        if (response.cooldown_ends) {
          setCooldownEnd(response.cooldown_ends);
        }
        setResult({ success: false, message: response.reason || 'Error' });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Error' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="card-glass max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-orbitron text-lg text-white flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-purple-400" />
            {t.galaxy.jumpGateTitle}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-space-600 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Origin info */}
        <div className="text-sm text-gray-400">
          {t.galaxy.jumpGateShipsOn}{' '}
          <span className="text-white font-semibold">{originMoon.name}</span>{' '}
          <span className="text-gray-500">[{originMoon.galaxy}:{originMoon.solar_system}:{originMoon.position}]</span>
        </div>

        {/* Cooldown warning */}
        {cooldownEnd && new Date(cooldownEnd).getTime() > Date.now() && (
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-amber-400 text-sm font-semibold">{t.galaxy.jumpGateCooldown}</p>
              <p className="text-amber-300/70 text-xs">
                {t.galaxy.jumpGateCooldownEnds}: {formatTimeRemaining(cooldownEnd)}
              </p>
            </div>
          </div>
        )}

        {/* Success result */}
        {result?.success && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
            <p className="text-green-400 text-sm">{result.message}</p>
          </div>
        )}

        {/* Error result */}
        {result && !result.success && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">{result.message}</p>
          </div>
        )}

        {/* No cooldown - show form */}
        {(!cooldownEnd || new Date(cooldownEnd).getTime() <= Date.now()) && (
          <>
            {/* Target moon selector */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.galaxy.jumpGateSelectTarget}
              </label>
              {isLoadingMoons ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t.common.loading}
                </div>
              ) : targetMoons.length === 0 ? (
                <p className="text-amber-400 text-sm py-2">{t.galaxy.jumpGateNoTargetMoons}</p>
              ) : (
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full bg-space-700 border border-space-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="">{t.galaxy.jumpGateSelectTarget}</option>
                  {targetMoons.map((tm) => (
                    <option key={tm.moon.id} value={tm.moon.id}>
                      {tm.moon.name} [{tm.moon.galaxy}:{tm.moon.solar_system}:{tm.moon.position}]
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Ship selector */}
            {selectedTarget && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">{t.galaxy.jumpGateSelectShips}</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={setAllShips}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      {t.common.all || 'Todos'}
                    </button>
                    <span className="text-gray-600">|</span>
                    <button
                      onClick={clearAllShips}
                      className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
                    >
                      {t.common.none || 'Ninguno'}
                    </button>
                  </div>
                </div>

                {availableShips.length === 0 ? (
                  <p className="text-gray-500 text-sm py-2">{t.galaxy.jumpGateNoShips}</p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {availableShips.map((ship) => (
                      <div
                        key={ship.ship_type_id}
                        className="flex items-center justify-between p-2 bg-space-700/50 rounded-lg"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {ship.ship_type?.image_url && (
                            <img
                              src={ship.ship_type.image_url}
                              alt=""
                              className="w-8 h-8 rounded object-cover flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-white text-sm truncate">
                              {ship.ship_type ? translateEntityName(t, ship.ship_type.code, ship.ship_type.name) : ''}
                            </p>
                            <p className="text-gray-500 text-xs">
                              {t.galaxy.jumpGateAvailable}: {ship.quantity.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={ship.quantity}
                          value={shipQuantities[ship.ship_type_id] || 0}
                          onChange={(e) =>
                            handleQuantityChange(ship.ship_type_id, e.target.value, ship.quantity)
                          }
                          className="w-20 bg-space-800 border border-space-500 rounded px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Transfer button */}
            {selectedTarget && (
              <button
                onClick={handleTransfer}
                disabled={isLoading || totalShipsSelected === 0}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                  isLoading || totalShipsSelected === 0
                    ? 'bg-space-600 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t.galaxy.jumpGateTransferring}
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    {t.galaxy.jumpGateTransfer} ({totalShipsSelected.toLocaleString()} {t.fleet.ships})
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
