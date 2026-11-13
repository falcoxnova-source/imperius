/**
 * DefensePage - Pagina de Defensa
 *
 * Implementa el sistema de defensas al estilo XNova/OGame:
 * - Requiere nivel de Hangar para desbloquear
 * - Las defensas se construyen en su propia cola, independiente de las naves
 * - Shield Domes tienen limite de 1 por planeta
 * - El tiempo se reduce con Hangar y Nanite Factory
 * - Las defensas no se pueden mover entre planetas
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Clock, AlertCircle, Lock, Coins, Swords } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { useIsUserPlus } from '../../hooks/useIsUserPlus';
import { GameMedia } from '../../components/ui/GameMedia';
import { ShipyardQueuePanel, CostItem } from '../../components/game';
import { BlueprintPurchaseConfirm } from '../../components/game/BlueprintPurchaseConfirm';
import { GiftItemModal } from '../../components/game/GiftItemModal';
import { calculateShipyardTime } from '../../lib/formulas';
import { formatNumber, formatTime } from '../../lib/utils';
import { useI18n, translateEntityName, translateDefenseName, translatePlanetName, getDefenseImage } from '../../lib/i18n';
import type { DefenseType } from '../../types/game';

export function DefensePage() {
  const navigate = useNavigate();
  const {
    defenses,
    defenseTypes,
    defenseRequirements,
    buildings,
    technologies,
    resources,
    currentPlanet,
    shipyardQueue,
    isLoadingDefenseRequirements,
    fetchDefenseTypes,
    fetchDefenseRequirements,
    fetchResources,
    addToShipyardQueue,
    cancelShipyardQueueItem,
  } = useGameStore();
  const { profile, refreshProfile } = useAuthStore();
  const isPlus = useIsUserPlus();
  const { t } = useI18n();
  const isVacation = profile?.vacation_mode === true;
  const [buildQuantities, setBuildQuantities] = useState<Record<number, number>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Mapa: defense_type_id -> { code, quantity, priceUsd }. Solo defensas con plano.
  const [blueprintMap, setBlueprintMap] = useState<Record<number, { code: string; quantity: number; priceUsd: number }>>({});
  // Precio en vivo de TUNG (USD) para mostrar el coste del plano
  const [tungPrice, setTungPrice] = useState<number | null>(null);
  // defense_type_id que se esta comprando ahora mismo
  const [buyingBlueprint, setBuyingBlueprint] = useState<number | null>(null);
  // Plano pendiente de confirmar antes de comprarlo
  const [confirmBlueprint, setConfirmBlueprint] = useState<
    {
      id: number;
      name: string;
      costTung: number | null;
      imageUrl: string | null;
      owned: number;
      resources: { metal: number; crystal: number; deuterium: number };
    } | null
  >(null);
  // [GIFTITEMS1] Plano que se va a regalar a un amigo
  const [giftBlueprint, setGiftBlueprint] = useState<{ id: number; code: string; name: string; imageUrl: string | null } | null>(null);

  const reloadBlueprints = useCallback(async () => {
    try {
      const { data: bps } = await supabase
        .from('ship_blueprints')
        .select('code, defense_type_id, is_active, price_usd')
        .eq('is_active', true)
        .not('defense_type_id', 'is', null);
      const { data: { user } } = await supabase.auth.getUser();
      const counts = new Map<number, number>();
      if (user && bps) {
        const { data: mine } = await supabase
          .from('user_ship_blueprints')
          .select('blueprint_id, ship_blueprints!inner(defense_type_id)')
          .eq('user_id', user.id);
        if (mine) {
          for (const row of mine as any[]) {
            const dtid = row.ship_blueprints?.defense_type_id;
            if (typeof dtid === 'number') {
              counts.set(dtid, (counts.get(dtid) || 0) + 1);
            }
          }
        }
      }
      const map: Record<number, { code: string; quantity: number; priceUsd: number }> = {};
      for (const bp of (bps as any[]) || []) {
        map[bp.defense_type_id] = { code: bp.code, quantity: counts.get(bp.defense_type_id) || 0, priceUsd: Number(bp.price_usd) || 0 };
      }
      setBlueprintMap(map);
    } catch (e) {
      console.error('Error loading defense blueprints:', e);
    }
  }, []);

  useEffect(() => {
    reloadBlueprints();
  }, [reloadBlueprints, profile?.id]);

  // Precio en vivo de TUNG para estimar el coste del plano
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('get_live_tung_price_usd');
        if (typeof data === 'number' && data > 0) setTungPrice(data);
      } catch {
        /* precio no disponible: el boton mostrara solo "Comprar plano" */
      }
    })();
  }, []);

  // Coste estimado del plano en TUNG (o null si no se puede calcular todavia)
  const getBlueprintCostTung = useCallback((defenseTypeId: number): number | null => {
    const bp = blueprintMap[defenseTypeId];
    if (!bp) return null;
    if (bp.priceUsd > 0) {
      if (!tungPrice || tungPrice <= 0) return null;
      return Math.ceil(bp.priceUsd / tungPrice);
    }
    return null;
  }, [blueprintMap, tungPrice]);

  // Comprar un plano (consumible): se apila en el inventario y se gasta al construir
  const doBuyBlueprint = useCallback(async (defenseTypeId: number) => {
    const bp = blueprintMap[defenseTypeId];
    if (!bp || buyingBlueprint !== null) return;
    setBuyingBlueprint(defenseTypeId);
    try {
      const { data, error } = await supabase.rpc('purchase_ship_blueprint', {
        p_blueprint_code: bp.code,
        p_planet_id: currentPlanet?.id ?? null,
      });
      if (error) {
        window.alert('No se pudo comprar el plano: ' + error.message);
        return;
      }
      if (data && data.success === false) {
        window.alert(data.error || 'No se pudo comprar el plano');
        return;
      }
      await reloadBlueprints();
      if (currentPlanet) await fetchResources(currentPlanet.id);
      await refreshProfile();
      const cost = data?.cost ? formatNumber(Number(data.cost)) : '';
      const gotResources = data?.resources_granted === true;
      const resourcesMsg = gotResources
        ? `\n\nRecursos depositados en ${data.planet_name || 'tu ciudad'}:` +
          `\n- Hierro: ${formatNumber(Number(data.metal || 0))}` +
          `\n- Piedra: ${formatNumber(Number(data.crystal || 0))}` +
          `\n- Comida: ${formatNumber(Number(data.deuterium || 0))}`
        : '';
      window.alert((cost ? `Plano comprado por ${cost} TUNG` : 'Plano comprado') + resourcesMsg);
    } finally {
      setBuyingBlueprint(null);
    }
  }, [blueprintMap, buyingBlueprint, reloadBlueprints, currentPlanet, fetchResources, refreshProfile]);

  // Abre la ventana de confirmacion para evitar compras accidentales del plano
  const handleBuyBlueprint = useCallback((defenseTypeId: number) => {
    const bp = blueprintMap[defenseTypeId];
    if (!bp || buyingBlueprint !== null) return;
    const defenseType = defenseTypes.find((dt) => dt.id === defenseTypeId);
    setConfirmBlueprint({
      id: defenseTypeId,
      name: defenseType ? translateDefenseName(t, defenseType.code, defenseType.name) : '',
      costTung: getBlueprintCostTung(defenseTypeId),
      imageUrl: defenseType?.image_url ?? null,
      owned: bp.quantity,
      resources: {
        metal: Number(defenseType?.metal_cost || 0),
        crystal: Number(defenseType?.crystal_cost || 0),
        deuterium: Number(defenseType?.deuterium_cost || 0),
      },
    });
  }, [blueprintMap, buyingBlueprint, defenseTypes, t, getBlueprintCostTung]);

  useEffect(() => {
    fetchDefenseTypes();
    fetchDefenseRequirements();
  }, [fetchDefenseTypes, fetchDefenseRequirements]);

  /**
   * Obtener cantidad actual de un tipo de defensa
   */
  const getDefenseQuantity = (defenseTypeId: number): number => {
    const defense = defenses.find((d) => d.defense_type_id === defenseTypeId);
    return defense?.quantity || 0;
  };

  /**
   * Obtener nivel del hangar
   */
  const getShipyardLevel = () =>
    buildings.find((b) => b.building_type?.code === 'shipyard')?.level || 0;

  /**
   * Obtener nivel de Nanite Factory
   */
  const getNaniteLevel = () =>
    buildings.find((b) => b.building_type?.code === 'nanite_factory')?.level || 0;

  /**
   * Calcular bonos de combate (arma, escudo, blindaje)
   */
  const getCombatBonuses = () => {
    const weaponLevel = technologies.find(t => t.technology_type?.code === 'weapons_tech')?.level || 0;
    const shieldLevel = technologies.find(t => t.technology_type?.code === 'shielding_tech')?.level || 0;
    const armorLevel = technologies.find(t => t.technology_type?.code === 'armour_tech')?.level || 0;

    return {
      weapon: weaponLevel * 0.10,
      shield: shieldLevel * 0.10,
      armor: armorLevel * 0.10,
    };
  };

  /**
   * Verificar requisitos de edificios y tecnologias
   */
  const checkRequirements = (defenseTypeId: number): { met: boolean; missing: string[] } => {
    const requirements = defenseRequirements.filter((r) => r.defense_type_id === defenseTypeId);
    const missing: string[] = [];

    for (const req of requirements) {
      if (req.required_building_id && req.required_building) {
        const building = buildings.find((b) => b.building_type_id === req.required_building_id);
        const currentLevel = building?.level || 0;
        if (currentLevel < req.required_building_level) {
          missing.push(`${translateEntityName(t, req.required_building.code, req.required_building.name)} ${t.common.level}.${req.required_building_level}`);
        }
      }
      if (req.required_tech_id && req.required_tech) {
        const tech = technologies.find((t) => t.technology_type_id === req.required_tech_id);
        const currentLevel = tech?.level || 0;
        if (currentLevel < req.required_tech_level) {
          missing.push(`${translateEntityName(t, req.required_tech.code, req.required_tech.name)} ${t.common.level}.${req.required_tech_level}`);
        }
      }
    }

    return { met: missing.length === 0, missing };
  };

  /**
   * Obtener lista completa de requisitos con estado
   */
  const getAllRequirements = (
    defenseTypeId: number
  ): { name: string; level: number; met: boolean }[] => {
    const requirements = defenseRequirements.filter((r) => r.defense_type_id === defenseTypeId);
    const result: { name: string; level: number; met: boolean }[] = [];

    for (const req of requirements) {
      if (req.required_building_id && req.required_building) {
        const building = buildings.find((b) => b.building_type_id === req.required_building_id);
        const currentLevel = building?.level || 0;
        result.push({
          name: translateEntityName(t, req.required_building.code, req.required_building.name),
          level: req.required_building_level,
          met: currentLevel >= req.required_building_level,
        });
      }
      if (req.required_tech_id && req.required_tech) {
        const tech = technologies.find((t) => t.technology_type_id === req.required_tech_id);
        const currentLevel = tech?.level || 0;
        result.push({
          name: translateEntityName(t, req.required_tech.code, req.required_tech.name),
          level: req.required_tech_level,
          met: currentLevel >= req.required_tech_level,
        });
      }
    }

    return result;
  };

  /**
   * Obtener cantidad en cola para un tipo de defensa
   */
  const getInQueueQuantity = (defenseTypeId: number): number => {
    return defenseQueue
      .filter((q) => q.defense_type_id === defenseTypeId)
      .reduce((acc, q) => acc + (q.quantity - q.quantity_completed), 0);
  };

  /**
   * Obtener cantidad maxima que se puede construir (para Shield Domes)
   */
  const getMaxBuildable = (defenseType: DefenseType): number | null => {
    if (!defenseType.max_per_planet) return null;
    const currentQuantity = getDefenseQuantity(defenseType.id);
    const inQueue = getInQueueQuantity(defenseType.id);
    return Math.max(0, defenseType.max_per_planet - currentQuantity - inQueue);
  };

  /**
   * Verificar si se puede construir una cantidad de defensas
   */
  const canBuildDefense = (
    defenseType: DefenseType,
    quantity: number
  ): { allowed: boolean; reason?: string; missingReqs?: string[] } => {
    if (isVacation) return { allowed: false, reason: t.settings.vacationModeBlocked };
    if (!resources || !currentPlanet) return { allowed: false, reason: t.common.noResources };
    if (isLoadingDefenseRequirements) return { allowed: false, reason: t.common.loading };

    // Reglas consumibles: si hay planos suficientes se anulan los requisitos
    // (solo Hangar Nv1). Si no, deben cumplirse los requisitos completos.
    const bp = blueprintMap[defenseType.id];
    const hasEnoughBlueprints = !!bp && bp.quantity >= quantity;

    if (!hasEnoughBlueprints) {
      const reqCheck = checkRequirements(defenseType.id);
      if (!reqCheck.met) {
        return {
          allowed: false,
          reason: t.common.requirementsNotMet,
          missingReqs: reqCheck.missing,
        };
      }
    }

    const maxBuildable = getMaxBuildable(defenseType);
    if (maxBuildable !== null && maxBuildable <= 0) {
      return { allowed: false, reason: t.defense.maxReached };
    }

    const totalCost = {
      metal: defenseType.metal_cost * quantity,
      crystal: defenseType.crystal_cost * quantity,
      deuterium: defenseType.deuterium_cost * quantity,
    };

    if (resources.metal < totalCost.metal) {
      return { allowed: false, reason: t.common.insufficientMetal };
    }
    if (resources.crystal < totalCost.crystal) {
      return { allowed: false, reason: t.common.insufficientCrystal };
    }
    if (resources.deuterium < totalCost.deuterium) {
      return { allowed: false, reason: t.common.insufficientDeuterium };
    }

    return { allowed: true };
  };

  /**
   * Agregar defensas a la cola de construccion
   */
  const handleBuildDefense = async (defenseTypeId: number) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const quantity = buildQuantities[defenseTypeId] || 1;
      const success = await addToShipyardQueue('defense', defenseTypeId, quantity);
      if (success) {
        setBuildQuantities((prev) => ({ ...prev, [defenseTypeId]: 1 }));
        if (currentPlanet) await fetchResources(currentPlanet.id);
        await reloadBlueprints();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Actualizar cantidad a construir
   */
  const updateQuantity = (defenseTypeId: number, delta: number) => {
    setBuildQuantities((prev) => ({
      ...prev,
      [defenseTypeId]: Math.max(1, (prev[defenseTypeId] || 1) + delta),
    }));
  };

  /**
   * Establecer cantidad maxima que se puede pagar
   */
  const setMaxQuantity = (defenseType: DefenseType) => {
    if (!resources) return;

    const reqCheck = checkRequirements(defenseType.id);
    if (!reqCheck.met) return;

    const maxByMetal =
      defenseType.metal_cost > 0 ? Math.floor(resources.metal / defenseType.metal_cost) : Infinity;
    const maxByCrystal =
      defenseType.crystal_cost > 0
        ? Math.floor(resources.crystal / defenseType.crystal_cost)
        : Infinity;
    const maxByDeuterium =
      defenseType.deuterium_cost > 0
        ? Math.floor(resources.deuterium / defenseType.deuterium_cost)
        : Infinity;

    let maxQuantity = Math.max(1, Math.min(maxByMetal, maxByCrystal, maxByDeuterium));

    const maxBuildable = getMaxBuildable(defenseType);
    if (maxBuildable !== null) {
      maxQuantity = Math.min(maxQuantity, maxBuildable);
    }

    setBuildQuantities((prev) => ({ ...prev, [defenseType.id]: Math.max(1, maxQuantity) }));
  };

  const defenseQueue = shipyardQueue.filter((q) => q.item_type === 'defense');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="font-serif text-xl sm:text-2xl text-amber-100 tracking-wide flex items-center gap-2 sm:gap-3">
          <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400 flex-shrink-0" />
          {t.defense.title}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/game/lottery')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30 text-purple-300 hover:border-purple-400/50 hover:text-purple-200 transition-all text-sm group"
          >
            <img
              src="https://photos.pinksale.finance/file/pinksale-logo-upload/1775067036507-327d40aa0444bcab4ac5ca7406f0eb5e.png"
              alt="Lotería"
              className="w-4 h-4 rounded object-cover"
            />
            <span>Lotería</span>
            <span className="text-amber-400 font-bold">🏆</span>
          </button>
          <div className="text-sm text-gray-400">
            {t.defense.shipyard} {t.common.level}.{getShipyardLevel()}
          </div>
        </div>
      </div>

      {/* Mensaje si no hay hangar */}
      {getShipyardLevel() === 0 && (
        <div className="bg-[#241a0e]/85 border border-amber-700/50 border-l-4 border-l-amber-500 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6 text-amber-400" />
            <div>
              <p className="text-white font-semibold">{t.defense.shipyardRequired}</p>
              <p className="text-sm text-gray-400">{t.defense.buildShipyardMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Cola de construccion: solo defensas. Las naves se ven en ShipyardPage. */}
      {defenseQueue.length > 0 && (
        <ShipyardQueuePanel
          queue={defenseQueue}
          onCancel={cancelShipyardQueueItem}
          isProcessing={isProcessing}
          accentColor="pink"
        />
      )}

      {/* Grid de defensas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        {defenseTypes.map((defenseType) => {
          const currentQuantity = getDefenseQuantity(defenseType.id);
          const buildQuantity = buildQuantities[defenseType.id] || 1;
          const buildCheck = canBuildDefense(defenseType, buildQuantity);

          const totalCost = {
            metal: defenseType.metal_cost * buildQuantity,
            crystal: defenseType.crystal_cost * buildQuantity,
            deuterium: defenseType.deuterium_cost * buildQuantity,
          };

          const buildTimePerUnit = calculateShipyardTime(
            defenseType.metal_cost,
            defenseType.crystal_cost,
            getShipyardLevel(),
            getNaniteLevel(),
            isPlus
          );
          const totalBuildTime = buildTimePerUnit * buildQuantity;

          const inQueue = defenseQueue
            .filter((q) => q.defense_type_id === defenseType.id)
            .reduce((acc, q) => acc + (q.quantity - q.quantity_completed), 0);

          const allReqs = getAllRequirements(defenseType.id);
          const maxBuildable = getMaxBuildable(defenseType);
          const bpInfo = blueprintMap[defenseType.id];
          const hasEnoughBlueprints = !!bpInfo && bpInfo.quantity >= buildQuantity;

          return (
            <DefenseCard
              key={defenseType.id}
              defenseType={defenseType}
              currentQuantity={currentQuantity}
              inQueue={inQueue}
              buildQuantity={buildQuantity}
              totalCost={totalCost}
              buildTime={totalBuildTime}
              canBuild={buildCheck.allowed && !isProcessing}
              disabledReason={isProcessing ? t.common.processing : buildCheck.reason}
              missingReqs={buildCheck.missingReqs}
              allRequirements={allReqs}
              resources={resources}
              maxBuildable={maxBuildable}
              combatBonuses={getCombatBonuses()}
              requiresBlueprint={!!bpInfo}
              blueprintQuantity={bpInfo?.quantity ?? 0}
              bypassRequirements={hasEnoughBlueprints}
              blueprintCostTung={getBlueprintCostTung(defenseType.id)}
              isBuyingBlueprint={buyingBlueprint === defenseType.id}
              tungBalance={Number(profile?.tung_balance) || 0}
              onBuyBlueprint={() => handleBuyBlueprint(defenseType.id)}
              onUpdateQuantity={(delta) => updateQuantity(defenseType.id, delta)}
              onSetMax={() => setMaxQuantity(defenseType)}
              onBuild={() => handleBuildDefense(defenseType.id)}
            />
          );
        })}
      </div>

      {/* Confirmacion antes de comprar un plano */}
      {confirmBlueprint && (
        <BlueprintPurchaseConfirm
          name={confirmBlueprint.name}
          costTung={confirmBlueprint.costTung}
          imageUrl={confirmBlueprint.imageUrl}
          currentQuantity={confirmBlueprint.owned}
          includedResources={confirmBlueprint.resources}
          targetPlanetName={currentPlanet ? translatePlanetName(currentPlanet.name) : null}
          accent="pink"
          onCancel={() => setConfirmBlueprint(null)}
          onGift={
            blueprintMap[confirmBlueprint.id]
              ? () => {
                  const c = confirmBlueprint;
                  setConfirmBlueprint(null);
                  setGiftBlueprint({ id: c.id, code: blueprintMap[c.id].code, name: c.name, imageUrl: c.imageUrl });
                }
              : undefined
          }
          onConfirm={() => {
            const id = confirmBlueprint.id;
            setConfirmBlueprint(null);
            void doBuyBlueprint(id);
          }}
        />
      )}

      {giftBlueprint && (
        <GiftItemModal
          open
          onClose={() => setGiftBlueprint(null)}
          kind="blueprint"
          code={giftBlueprint.code}
          itemName={`Plano ${giftBlueprint.name}`}
          imageUrl={giftBlueprint.imageUrl}
          maxQty={20}
          estimateCost={(q) => {
            const unit = getBlueprintCostTung(giftBlueprint.id);
            return unit !== null ? unit * q : null;
          }}
        />
      )}
    </div>
  );
}

interface DefenseCardProps {
  defenseType: DefenseType;
  currentQuantity: number;
  inQueue: number;
  buildQuantity: number;
  totalCost: { metal: number; crystal: number; deuterium: number };
  buildTime: number;
  canBuild: boolean;
  disabledReason?: string;
  missingReqs?: string[];
  allRequirements: { name: string; level: number; met: boolean }[];
  resources: { metal: number; crystal: number; deuterium: number } | null;
  maxBuildable: number | null;
  combatBonuses: { weapon: number; shield: number; armor: number };
  requiresBlueprint?: boolean;
  blueprintQuantity?: number;
  bypassRequirements?: boolean;
  blueprintCostTung?: number | null;
  isBuyingBlueprint?: boolean;
  tungBalance?: number;
  onBuyBlueprint?: () => void;
  onUpdateQuantity: (delta: number) => void;
  onSetMax: () => void;
  onBuild: () => void;
}

function DefenseCard({
  defenseType,
  currentQuantity,
  inQueue,
  buildQuantity,
  totalCost,
  buildTime,
  canBuild,
  disabledReason,
  missingReqs,
  allRequirements,
  resources,
  maxBuildable,
  combatBonuses,
  requiresBlueprint = false,
  blueprintQuantity = 0,
  bypassRequirements = false,
  blueprintCostTung = null,
  isBuyingBlueprint = false,
  tungBalance = 0,
  onBuyBlueprint,
  onUpdateQuantity,
  onSetMax,
  onBuild,
}: DefenseCardProps) {
  const { t } = useI18n();
  const hasBlueprintForQuantity = blueprintQuantity >= buildQuantity;
  const isLocked = !!(missingReqs && missingReqs.length > 0) && !hasBlueprintForQuantity;
  const isMaxReached = maxBuildable !== null && maxBuildable <= 0;
  const reqsBypassed = bypassRequirements;

  return (
    <div
      className={`relative p-[3px] rounded-2xl bg-gradient-to-b from-amber-300 via-amber-700 to-amber-500 shadow-[0_14px_40px_rgba(0,0,0,0.65)] transition-all hover:shadow-[0_0_0_2px_rgba(251,191,36,0.35),0_18px_48px_rgba(0,0,0,0.8)] ${isLocked || isMaxReached ? 'opacity-60 saturate-[.65]' : ''}`}
    >
      <span className="pointer-events-none absolute left-2 top-2 w-3.5 h-3.5 border-l-[3px] border-t-[3px] border-amber-200 z-20 rounded-tl-sm" />
      <span className="pointer-events-none absolute right-2 top-2 w-3.5 h-3.5 border-r-[3px] border-t-[3px] border-amber-200 z-20 rounded-tr-sm" />
      <span className="pointer-events-none absolute left-2 bottom-2 w-3.5 h-3.5 border-l-[3px] border-b-[3px] border-amber-200 z-20 rounded-bl-sm" />
      <span className="pointer-events-none absolute right-2 bottom-2 w-3.5 h-3.5 border-r-[3px] border-b-[3px] border-amber-200 z-20 rounded-br-sm" />

      <div className="relative rounded-[13px] bg-[linear-gradient(180deg,#2a1e13_0%,#1b1109_45%,#100a05_100%)] overflow-hidden">
      {/* Imagen de la defensa */}
      <div className="relative w-full aspect-[4/3] sm:aspect-square bg-[radial-gradient(circle_at_50%_30%,#4a3319_0%,#241609_65%,#140c05_100%)] overflow-hidden group">
        {defenseType.image_url ? (
          <GameMedia
            src={getDefenseImage(defenseType.code, defenseType.image_url)}
            alt={translateDefenseName(t, defenseType.code, defenseType.name)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Shield className="w-24 h-24 text-amber-200/25 group-hover:text-pink-400/70 transition-colors" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#140c05]/95 via-transparent to-transparent" />
        <div className="absolute top-1.5 right-1.5 sm:top-3 sm:right-3 flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fde68a,#d97706)] text-stone-950 font-serif font-bold border border-amber-200 shadow-[0_3px_10px_rgba(0,0,0,0.6)]">
          <span className="text-[10px] sm:text-sm">{currentQuantity}</span>
          {inQueue > 0 && <span className="text-[9px] sm:text-xs text-stone-700 ml-1">(+{inQueue})</span>}
        </div>
        {requiresBlueprint && blueprintQuantity > 0 && (
          <div className="absolute top-1.5 left-1.5 sm:top-3 sm:left-3 bg-emerald-500/20 backdrop-blur-sm px-2 py-1 sm:px-3 sm:py-1.5 rounded-full border border-emerald-500/50">
            <span className="font-serif text-emerald-300 text-[10px] sm:text-xs">Planos: {blueprintQuantity}</span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-1.5 sm:p-4">
          <div className="bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 text-stone-950 text-center font-serif font-bold uppercase tracking-[0.15em] text-[11px] sm:text-sm px-2 py-1 rounded-sm shadow-[0_4px_14px_rgba(0,0,0,0.7)] truncate">
            {translateDefenseName(t, defenseType.code, defenseType.name)}
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
        {/* Stats de combate */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-black/25 border-l-[3px] border-red-500/70">
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-amber-200/60"><Swords className="w-3.5 h-3.5 text-red-400" />{t.defense.attack}</span>
            <span className="font-serif font-bold text-amber-50 text-sm">
              {combatBonuses.weapon > 0 ? (
                <>
                  <span className="text-amber-200/40 line-through text-xs mr-1">{defenseType.weapon_power}</span>
                  <span className="text-red-400">{Math.floor(defenseType.weapon_power * (1 + combatBonuses.weapon))}</span>
                </>
              ) : (
                defenseType.weapon_power
              )}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-black/25 border-l-[3px] border-sky-500/70">
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-amber-200/60"><Shield className="w-3.5 h-3.5 text-sky-400" />{t.defense.shield}</span>
            <span className="font-serif font-bold text-amber-50 text-sm">
              {combatBonuses.shield > 0 ? (
                <>
                  <span className="text-amber-200/40 line-through text-xs mr-1">{defenseType.shield_power}</span>
                  <span className="text-sky-400">{Math.floor(defenseType.shield_power * (1 + combatBonuses.shield))}</span>
                </>
              ) : (
                defenseType.shield_power
              )}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-black/25 border-l-[3px] border-pink-500/70">
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-amber-200/60"><Shield className="w-3.5 h-3.5 text-pink-400" />{t.defense.armor}</span>
            <span className="font-serif font-bold text-amber-50 text-sm truncate">
              {combatBonuses.armor > 0 ? (
                <>
                  <span className="text-amber-200/40 line-through text-xs mr-1">{formatNumber(defenseType.structural_integrity)}</span>
                  <span className="text-pink-400">{formatNumber(Math.floor(defenseType.structural_integrity * (1 + combatBonuses.armor)))}</span>
                </>
              ) : (
                formatNumber(defenseType.structural_integrity)
              )}
            </span>
          </div>
        </div>

        {/* Requisitos */}
        {allRequirements.length > 0 && (
          <div className={`text-xs space-y-1 p-2 rounded-lg border ${reqsBypassed ? 'bg-emerald-500/10 border-emerald-600/30' : 'bg-black/20 border-amber-800/30'}`}>
            <span className="text-amber-200/70 font-medium">
              {t.common.requirements}:
              {reqsBypassed && (
                <span className="ml-2 text-[10px] text-emerald-300">(plano activo · solo Barraca Nv 1)</span>
              )}
            </span>
            {allRequirements.map((req, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-1 ${req.met ? 'text-emerald-400' : 'text-amber-500'}`}
              >
                <span className="font-bold">{req.met ? '✓' : '✗'}</span>
                <span>
                  {req.name} {t.common.level}.{req.level}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Estado del plano de la defensa */}
        {requiresBlueprint && (
          <div className="space-y-2">
            {reqsBypassed ? (
              <div className="text-[11px] rounded-lg px-2 py-2 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                <span className="font-semibold">✓ Plano activo.</span> Se construye solo con Barraca Nv 1 · se gasta 1 plano por unidad.
              </div>
            ) : isLocked ? (
              <div className="text-[11px] rounded-lg px-2 py-2 border border-amber-600/40 bg-amber-500/10 text-amber-300">
                <span className="font-semibold">Te faltan requisitos.</span> Complétalos, o compra su plano y constrûyela ya (solo pide Barraca Nv 1).
              </div>
            ) : (
              <div className="text-[11px] rounded-lg px-2 py-2 border border-emerald-600/40 bg-emerald-500/10 text-emerald-300">
                <span className="font-semibold">✓ Cumples los requisitos.</span> Puedes construirla sin plano. El plano es un atajo opcional.
              </div>
            )}

            <div className="text-[11px] text-amber-200/80 px-1">
              Planos en inventario: <span className="font-semibold">{blueprintQuantity}</span>
            </div>

            {onBuyBlueprint && (() => {
              const canAfford = blueprintCostTung == null || tungBalance >= blueprintCostTung;
              const buyDisabled = isBuyingBlueprint || !canAfford;
              return (
                <button
                  onClick={onBuyBlueprint}
                  disabled={buyDisabled}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs transition-all ${
                    isBuyingBlueprint
                      ? 'bg-black/30 text-amber-200/40 cursor-not-allowed border border-amber-800/40'
                      : !canAfford
                        ? 'bg-black/30 text-amber-200/40 border border-amber-800/40 cursor-not-allowed'
                        : 'bg-gradient-to-b from-amber-500/20 to-amber-700/20 text-amber-300 border border-amber-600/50 hover:from-amber-500/30 hover:to-amber-700/30'
                  }`}
                >
                  <Coins className="w-4 h-4" />
                  {isBuyingBlueprint
                    ? 'Comprando...'
                    : !canAfford
                      ? `TUNG insuficiente · necesitas ${formatNumber(blueprintCostTung as number)}`
                      : blueprintCostTung != null
                        ? `Comprar plano · ${formatNumber(blueprintCostTung)} TUNG`
                        : 'Comprar plano'}
                </button>
              );
            })()}

            {onBuyBlueprint && (
              <div className="text-[10px] text-gray-500 px-1">
                Tu saldo: <span className="text-gray-300 font-semibold">{formatNumber(Math.floor(tungBalance))} TUNG</span>
              </div>
            )}
          </div>
        )}

        {isLocked ? (
          <div className="text-xs sm:text-sm text-amber-400">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 flex-shrink-0" />
              {t.common.lockedRequirements}
            </div>
          </div>
        ) : isMaxReached ? (
          <div className="space-y-2">
            <div className="text-xs sm:text-sm text-pink-300 bg-pink-500/10 border border-pink-500/30 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="font-semibold">{t.defense.maxReached} — {t.defense.maxOnePerPlanet || 'Solo 1 por ciudad'}</span>
              </div>
            </div>
            <button
              disabled
              className="w-full py-3 rounded-lg font-serif font-bold bg-[#2a2014]/60 text-amber-200/30 cursor-not-allowed border border-amber-800/40 text-sm"
            >
              {t.defense.maxReached}
            </button>
          </div>
        ) : (
          <>
            {/* Costos */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              <CostItem
                label={t.resources.metal}
                value={totalCost.metal}
                available={resources?.metal || 0}
              />
              <CostItem
                label={t.resources.crystal}
                value={totalCost.crystal}
                available={resources?.crystal || 0}
              />
              <CostItem
                label={t.resources.deuterium}
                value={totalCost.deuterium}
                available={resources?.deuterium || 0}
              />
            </div>

            {/* Selector de cantidad */}
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              <button
                onClick={() => onUpdateQuantity(-10)}
                className="w-9 h-9 rounded-full bg-gradient-to-b from-[#4a3418] to-[#2a1c0c] border border-amber-600/60 text-amber-200 hover:from-[#5a4020] hover:to-[#33230f] text-xs font-bold shadow"
              >
                -10
              </button>
              <button
                onClick={() => onUpdateQuantity(-1)}
                className="w-9 h-9 rounded-full bg-gradient-to-b from-[#4a3418] to-[#2a1c0c] border border-amber-600/60 text-amber-200 hover:from-[#5a4020] hover:to-[#33230f] text-xs font-bold shadow"
              >
                -1
              </button>
              <input
                type="number"
                value={buildQuantity}
                onChange={(e) =>
                  onUpdateQuantity(Math.max(1, parseInt(e.target.value) || 1) - buildQuantity)
                }
                className="w-16 h-9 text-center bg-black/40 border border-amber-600/50 rounded-full py-1.5 text-amber-100 font-serif text-sm font-bold"
                min={1}
              />
              <button
                onClick={() => onUpdateQuantity(1)}
                className="w-9 h-9 rounded-full bg-gradient-to-b from-[#4a3418] to-[#2a1c0c] border border-amber-600/60 text-amber-200 hover:from-[#5a4020] hover:to-[#33230f] text-xs font-bold shadow"
              >
                +1
              </button>
              <button
                onClick={() => onUpdateQuantity(10)}
                className="w-9 h-9 rounded-full bg-gradient-to-b from-[#4a3418] to-[#2a1c0c] border border-amber-600/60 text-amber-200 hover:from-[#5a4020] hover:to-[#33230f] text-xs font-bold shadow"
              >
                +10
              </button>
              <button
                onClick={onSetMax}
                className="w-9 h-9 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fde68a,#d97706)] text-stone-950 border border-amber-200 text-[10px] font-bold shadow"
              >
                MAX
              </button>
            </div>

            {/* Tiempo y boton construir */}
            <div className="flex items-center justify-between gap-2 pt-2.5 border-t-2 border-amber-700/30">
              <div className="flex items-center gap-1 text-sm text-amber-200/70">
                <Clock className="w-4 h-4 flex-shrink-0" />
                {formatTime(buildTime)}
              </div>
              <button
                onClick={onBuild}
                disabled={!canBuild}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-md font-serif font-bold uppercase tracking-[0.2em] text-sm transition-all ${
                  canBuild
                    ? 'bg-gradient-to-b from-pink-300 via-pink-500 to-pink-800 text-stone-950 shadow-[0_5px_16px_rgba(219,39,119,0.45)] hover:from-pink-200 hover:via-pink-400 hover:to-pink-700'
                    : 'bg-[#2a2014] text-amber-200/30 cursor-not-allowed border border-amber-800/40'
                }`}
              >
                {t.common.build}
              </button>
            </div>

            {!canBuild && disabledReason && !isLocked && (
              <div className="flex items-start gap-2 text-xs sm:text-sm text-amber-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="break-words">{disabledReason}</span>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
