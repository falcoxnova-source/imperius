/**
 * ShipyardPage - Pagina del Hangar (construccion de naves)
 *
 * Implementa el sistema de construccion de naves al estilo XNova/OGame:
 * - Requiere nivel de Hangar para desbloquear
 * - Las naves se construyen una por una en la cola
 * - La cola de naves es independiente de la de defensas
 * - El tiempo se reduce con Hangar y Nanite Factory
 * - La cola de naves es independiente de la de defensas
 * - Completar instantaneamente con TUNG
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket,
  Package,
  Swords,
  Star,
  Clock,
  AlertCircle,
  Lock,
  X,
  Shield,
  Target,
  Truck,
  Gauge,
  Crosshair,
  Coins,
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { useIsUserPlus } from '../../hooks/useIsUserPlus';
import { ShipIcon } from '../../components/ui/ShipIcon';
import { MediaDisplay } from '../../components/ui/MediaDisplay';
import { ShipyardQueuePanel, CostItem } from '../../components/game';
import { BlueprintPurchaseConfirm } from '../../components/game/BlueprintPurchaseConfirm';
import { GiftItemModal } from '../../components/game/GiftItemModal';
import { calculateShipyardTime, calculateShipSpeedWithBonus } from '../../lib/formulas';
import { formatNumber, formatTime } from '../../lib/utils';
import { useI18n, translateEntityName, translateShipName, getShipImage, translatePlanetName } from '../../lib/i18n';
import type { ShipType } from '../../types/game';

/**
 * Iconos para cada categoria de naves
 */
const categoryIcons: Record<string, React.ReactNode> = {
  civil: <Package className="w-5 h-5" />,
  combat: <Swords className="w-5 h-5" />,
  special: <Star className="w-5 h-5" />,
};

export function ShipyardPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    ships,
    shipTypes,
    shipRequirements,
    buildings,
    technologies,
    resources,
    currentPlanet,
    shipyardQueue,
    isLoadingShipRequirements,
    fetchShipTypes,
    fetchShipRequirements,
    fetchResources,
    addToShipyardQueue,
    cancelShipyardQueueItem,
  } = useGameStore();
  const { profile } = useAuthStore();
  const isPlus = useIsUserPlus();
  const isVacation = profile?.vacation_mode === true;

  const [selectedCategory, setSelectedCategory] = useState<string>('civil');
  const [buildQuantities, setBuildQuantities] = useState<Record<number, number>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedShipInfo, setSelectedShipInfo] = useState<ShipType | null>(null);

  // Mapa: ship_type_id -> { code, quantity, priceUsd }
  // Solo contiene entradas para naves que tienen plano definido.
  const [blueprintMap, setBlueprintMap] = useState<Record<number, { code: string; quantity: number; priceUsd: number; forSale: boolean }>>({});
  // Precio en vivo de TUNG (USD) para mostrar el coste del plano
  const [tungPrice, setTungPrice] = useState<number | null>(null);
  // ship_type_id que se esta comprando ahora mismo (para deshabilitar el boton)
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
        .select('code, ship_type_id, is_active, price_usd, is_for_sale')
        .eq('is_active', true);
      const { data: { user } } = await supabase.auth.getUser();
      const counts = new Map<number, number>();
      if (user && bps) {
        const { data: mine } = await supabase
          .from('user_ship_blueprints')
          .select('blueprint_id, ship_blueprints!inner(ship_type_id)')
          .eq('user_id', user.id);
        if (mine) {
          for (const row of mine as any[]) {
            const stid = row.ship_blueprints?.ship_type_id;
            if (typeof stid === 'number') {
              counts.set(stid, (counts.get(stid) || 0) + 1);
            }
          }
        }
      }
      const map: Record<number, { code: string; quantity: number; priceUsd: number; forSale: boolean }> = {};
      for (const bp of (bps as any[]) || []) {
        map[bp.ship_type_id] = { code: bp.code, quantity: counts.get(bp.ship_type_id) || 0, priceUsd: Number(bp.price_usd) || 0, forSale: bp.is_for_sale !== false };
      }
      setBlueprintMap(map);
    } catch (e) {
      console.error('Error loading blueprints:', e);
    }
  }, []);

  useEffect(() => {
    reloadBlueprints();
  }, [reloadBlueprints, profile?.id]);

  // Cargar el precio en vivo de TUNG para estimar el coste del plano
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
  const getBlueprintCostTung = useCallback((shipTypeId: number): number | null => {
    const bp = blueprintMap[shipTypeId];
    if (!bp) return null;
    if (bp.priceUsd > 0) {
      if (!tungPrice || tungPrice <= 0) return null;
      return Math.ceil(bp.priceUsd / tungPrice);
    }
    return null;
  }, [blueprintMap, tungPrice]);

  // Comprar un plano (consumible): se apila en el inventario y se gasta al construir
  const doBuyBlueprint = useCallback(async (shipTypeId: number) => {
    const bp = blueprintMap[shipTypeId];
    if (!bp || buyingBlueprint !== null) return;
    setBuyingBlueprint(shipTypeId);
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
  }, [blueprintMap, buyingBlueprint, reloadBlueprints, currentPlanet, fetchResources]);

  // Abre la ventana de confirmacion para evitar compras accidentales del plano
  const handleBuyBlueprint = useCallback((shipTypeId: number) => {
    const bp = blueprintMap[shipTypeId];
    if (!bp || buyingBlueprint !== null) return;
    const shipType = shipTypes.find((st) => st.id === shipTypeId);
    setConfirmBlueprint({
      id: shipTypeId,
      name: shipType ? translateShipName(t, shipType.code, shipType.name) : '',
      costTung: getBlueprintCostTung(shipTypeId),
      imageUrl: shipType?.image_url ?? null,
      owned: bp.quantity,
      resources: {
        metal: Number(shipType?.metal_cost || 0),
        crystal: Number(shipType?.crystal_cost || 0),
        deuterium: Number(shipType?.deuterium_cost || 0),
      },
    });
  }, [blueprintMap, buyingBlueprint, shipTypes, t, getBlueprintCostTung]);

  const categoryNames: Record<string, string> = {
    civil: t.shipyard.civilShips,
    combat: t.shipyard.combatShips,
    special: t.shipyard.specialShips,
  };

  useEffect(() => {
    fetchShipTypes();
    fetchShipRequirements();
  }, [fetchShipTypes, fetchShipRequirements]);

  const categories = [...new Set(shipTypes.map((st) => st.category))];
  const filteredShips = shipTypes.filter(
    (st) => st.category === selectedCategory && st.code !== 'dark_matter_collector' && st.code !== 'falco_x_clasica' && st.code !== 'occupation_ship'
  );

  /**
   * Obtener cantidad actual de naves de un tipo
   */
  const getShipQuantity = (shipTypeId: number): number => {
    const ship = ships.find((s) => s.ship_type_id === shipTypeId);
    return ship?.quantity || 0;
  };

  /**
   * Obtener nivel del hangar (afecta tiempo de construccion)
   */
  const getShipyardLevel = () =>
    buildings.find((b) => b.building_type?.code === 'shipyard')?.level || 0;

  const techLevels = {
    combustionLevel: technologies.find(t => t.technology_type?.code === 'combustion_drive')?.level || 0,
    impulseLevel: technologies.find(t => t.technology_type?.code === 'impulse_drive')?.level || 0,
    hyperspaceLevel: technologies.find(t => t.technology_type?.code === 'hyperspace_drive')?.level || 0,
  };

  const getShipSpeedWithBonus = (shipType: ShipType): number => {
    return calculateShipSpeedWithBonus(shipType.code, shipType.base_speed, techLevels);
  };

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
   * Obtener nivel de Nanite Factory (reduce tiempo drasticamente)
   */
  const getNaniteLevel = () =>
    buildings.find((b) => b.building_type?.code === 'nanite_factory')?.level || 0;

  /**
   * Verificar requisitos de edificios y tecnologias para una nave
   */
  const checkRequirements = (shipTypeId: number): { met: boolean; missing: string[] } => {
    const requirements = shipRequirements.filter((r) => r.ship_type_id === shipTypeId);
    const missing: string[] = [];

    for (const req of requirements) {
      if (req.required_building_id && req.required_building) {
        const building = buildings.find((b) => b.building_type_id === req.required_building_id);
        const currentLevel = building?.level || 0;
        if (currentLevel < req.required_building_level) {
          missing.push(
            `${translateEntityName(t, req.required_building.code, req.required_building.name)} ${t.common.level}.${req.required_building_level}`
          );
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
   * Obtener lista completa de requisitos con estado (cumplido/pendiente)
   */
  const getAllRequirements = (
    shipTypeId: number
  ): { name: string; level: number; met: boolean }[] => {
    const requirements = shipRequirements.filter((r) => r.ship_type_id === shipTypeId);
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
   * Verificar si se puede construir una cantidad de naves
   */
  const canBuildShip = (
    shipType: ShipType,
    quantity: number
  ): { allowed: boolean; reason?: string; missingReqs?: string[] } => {
    if (isVacation) return { allowed: false, reason: t.settings.vacationModeBlocked };
    if (!resources || !currentPlanet) return { allowed: false, reason: t.common.noResources };
    if (isLoadingShipRequirements) return { allowed: false, reason: t.common.loading };

    // Reglas consumibles:
    // - Si hay planos suficientes para la cantidad, se puede construir (bypass requisitos).
    // - Si no hay planos suficientes, deben cumplirse requisitos completos.
    const bp = blueprintMap[shipType.id];
    const hasEnoughBlueprints = !!bp && bp.quantity >= quantity;

    if (!hasEnoughBlueprints) {
      const reqCheck = checkRequirements(shipType.id);
      if (!reqCheck.met) {
        return { allowed: false, reason: t.common.requirementsNotMet, missingReqs: reqCheck.missing };
      }
    }

    const totalCost = {
      metal: shipType.metal_cost * quantity,
      crystal: shipType.crystal_cost * quantity,
      deuterium: shipType.deuterium_cost * quantity,
    };

    if (resources.metal < totalCost.metal) {
      return { allowed: false, reason: t.resources.insufficientMetal };
    }
    if (resources.crystal < totalCost.crystal) {
      return { allowed: false, reason: t.resources.insufficientCrystal };
    }
    if (resources.deuterium < totalCost.deuterium) {
      return { allowed: false, reason: t.resources.insufficientDeuterium };
    }

    return { allowed: true };
  };

  /**
   * Agregar naves a la cola de construccion
   */
  const handleBuildShip = useCallback(
    async (shipTypeId: number) => {
      if (isProcessing || !currentPlanet) return;
      setIsProcessing(true);
      try {
        const quantity = buildQuantities[shipTypeId] || 1;
        const success = await addToShipyardQueue('ship', shipTypeId, quantity);
        if (success) {
          setBuildQuantities((prev) => ({ ...prev, [shipTypeId]: 1 }));
          await fetchResources(currentPlanet.id);
          await reloadBlueprints();
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, currentPlanet, buildQuantities, addToShipyardQueue, fetchResources, reloadBlueprints]
  );

  /**
   * Actualizar cantidad a construir
   */
  const updateQuantity = (shipTypeId: number, delta: number) => {
    setBuildQuantities((prev) => ({
      ...prev,
      [shipTypeId]: Math.max(1, (prev[shipTypeId] || 1) + delta),
    }));
  };

  /**
   * Establecer cantidad maxima que se puede pagar
   */
  const setMaxQuantity = (shipType: ShipType) => {
    if (!resources) return;

    const bpInfo = blueprintMap[shipType.id];
    const reqCheck = checkRequirements(shipType.id);
    const canByReqs = reqCheck.met;
    const maxByBlueprint = bpInfo?.quantity || 0;

    if (!canByReqs && maxByBlueprint <= 0) return;

    const maxByMetal =
      shipType.metal_cost > 0 ? Math.floor(resources.metal / shipType.metal_cost) : Infinity;
    const maxByCrystal =
      shipType.crystal_cost > 0 ? Math.floor(resources.crystal / shipType.crystal_cost) : Infinity;
    const maxByDeuterium =
      shipType.deuterium_cost > 0
        ? Math.floor(resources.deuterium / shipType.deuterium_cost)
        : Infinity;

    const maxByResources = Math.max(1, Math.min(maxByMetal, maxByCrystal, maxByDeuterium));
    const maxQuantity = canByReqs
      ? maxByResources
      : Math.max(1, Math.min(maxByResources, maxByBlueprint));

    setBuildQuantities((prev) => ({ ...prev, [shipType.id]: maxQuantity }));
  };

  const shipQueue = shipyardQueue.filter((q) => q.item_type === 'ship');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="font-orbitron text-xl sm:text-2xl text-white flex items-center gap-2 sm:gap-3">
          <Rocket className="w-6 h-6 sm:w-8 sm:h-8 text-cyber-orange flex-shrink-0" />
          {t.shipyard.title}
        </h1>
        <div className="text-sm text-gray-400">
          {t.shipyard.shipyardLevel} {getShipyardLevel()}
        </div>
      </div>

      {/* Mensaje si no hay hangar */}
      {getShipyardLevel() === 0 && (
        <div className="card-glass p-4 border-l-4 border-cyber-orange">
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6 text-cyber-orange" />
            <div>
              <p className="text-white font-semibold">{t.shipyard.shipyardRequired}</p>
              <p className="text-sm text-gray-400">{t.shipyard.buildShipyardMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Cola de construccion: solo naves. Las defensas se ven en DefensePage. */}
      {shipQueue.length > 0 && (
        <ShipyardQueuePanel
          queue={shipQueue}
          onCancel={cancelShipyardQueueItem}
          isProcessing={isProcessing}
          accentColor="orange"
        />
      )}

      {/* Tabs de categorias */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap border ${
              selectedCategory === category
                ? 'bg-[linear-gradient(90deg,rgba(252,211,77,0.95),rgba(217,119,6,0.85))] text-stone-950 font-serif font-bold uppercase tracking-wider border-amber-200/80 shadow-[0_3px_10px_rgba(0,0,0,0.45)]'
                : 'bg-stone-900/70 text-amber-100/55 hover:bg-stone-800/80 hover:text-amber-100 border-amber-800/40 font-semibold'
            }`}
          >
            {categoryIcons[category]}
            {categoryNames[category]}
          </button>
        ))}
        <button
          onClick={() => navigate('/game/lottery')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30 text-purple-300 hover:border-purple-400/50 hover:text-purple-200 transition-all group"
        >
          <img
            src="https://photos.pinksale.finance/file/pinksale-logo-upload/1775067036507-327d40aa0444bcab4ac5ca7406f0eb5e.png"
            alt="Lotería"
            className="w-4 h-4 rounded object-cover"
          />
          <span>Lotería</span>
          <span className="text-amber-400 font-bold">🏆</span>
        </button>
        <button
          onClick={() => navigate('/game/occupations')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-red-600/20 to-amber-600/20 border border-red-500/30 text-red-300 hover:border-red-400/50 hover:text-red-200 transition-all"
        >
          <Crosshair className="w-4 h-4" />
          <span>{t.shipyard.occupationShip}</span>
        </button>
      </div>

      {/* Grid de naves */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        {filteredShips.map((shipType) => {
          const currentQuantity = getShipQuantity(shipType.id);
          const buildQuantity = buildQuantities[shipType.id] || 1;
          const buildCheck = canBuildShip(shipType, buildQuantity);

          const totalCost = {
            metal: shipType.metal_cost * buildQuantity,
            crystal: shipType.crystal_cost * buildQuantity,
            deuterium: shipType.deuterium_cost * buildQuantity,
          };

          const buildTimePerUnit = calculateShipyardTime(
            shipType.metal_cost,
            shipType.crystal_cost,
            getShipyardLevel(),
            getNaniteLevel(),
            isPlus
          );
          const totalBuildTime = buildTimePerUnit * buildQuantity;

          const inQueue = shipQueue
            .filter((q) => q.ship_type_id === shipType.id)
            .reduce((acc, q) => acc + (q.quantity - q.quantity_completed), 0);

          const bpInfo = blueprintMap[shipType.id];
          const hasEnoughBlueprints = !!bpInfo && bpInfo.quantity >= buildQuantity;
          // Si tiene planos suficientes -> requisito unico es Hangar Nv 1.
          // Si no -> mostrar la lista normal de requisitos.
          const shipyardLvl = getShipyardLevel();
          const allReqs = hasEnoughBlueprints
            ? [{ name: translateEntityName(t, 'shipyard', t.shipyard.title), level: 1, met: shipyardLvl >= 1 }]
            : getAllRequirements(shipType.id);

          return (
            <ShipCard
              key={shipType.id}
              shipType={shipType}
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
              combatBonuses={getCombatBonuses()}
              shipSpeedWithBonus={getShipSpeedWithBonus(shipType)}
              requiresBlueprint={!!bpInfo}
              blueprintQuantity={bpInfo?.quantity ?? 0}
              bypassRequirements={hasEnoughBlueprints}
              blueprintCostTung={getBlueprintCostTung(shipType.id)}
              isBuyingBlueprint={buyingBlueprint === shipType.id}
              onBuyBlueprint={bpInfo && !bpInfo.forSale ? undefined : () => handleBuyBlueprint(shipType.id)}
              onUpdateQuantity={(delta) => updateQuantity(shipType.id, delta)}
              onSetMax={() => setMaxQuantity(shipType)}
              onBuild={() => handleBuildShip(shipType.id)}
              onShowInfo={() => setSelectedShipInfo(shipType)}
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
          accent="orange"
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

      {/* Modal de informacion */}
      {selectedShipInfo && (
        <ShipInfoModal
          shipType={selectedShipInfo}
          currentQuantity={getShipQuantity(selectedShipInfo.id)}
          shipyardLevel={getShipyardLevel()}
          naniteLevel={getNaniteLevel()}
          combatBonuses={getCombatBonuses()}
          shipSpeedWithBonus={getShipSpeedWithBonus(selectedShipInfo)}
          isVip={isPlus}
          onClose={() => setSelectedShipInfo(null)}
        />
      )}
    </div>
  );
}

interface ShipCardProps {
  shipType: ShipType;
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
  combatBonuses: { weapon: number; shield: number; armor: number };
  shipSpeedWithBonus: number;
  requiresBlueprint: boolean;
  blueprintQuantity: number;
  bypassRequirements?: boolean;
  blueprintCostTung?: number | null;
  isBuyingBlueprint?: boolean;
  onBuyBlueprint?: () => void;
  onUpdateQuantity: (delta: number) => void;
  onSetMax: () => void;
  onBuild: () => void;
  onShowInfo: () => void;
}

// Fecha de habilitación del mercado de planos: lunes 27 de abril de 2026, 12:00 hora local
const BLUEPRINT_MARKET_UNLOCK_AT = new Date(2026, 3, 27, 12, 0, 0).getTime();

function BlueprintMarketCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, BLUEPRINT_MARKET_UNLOCK_AT - now);
  if (remaining <= 0) {
    return (
      <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
        <Coins className="w-4 h-4" />
        Mercado de planos disponible — recarga la página
      </div>
    );
  }
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="w-full rounded-lg border border-cyber-yellow/40 bg-space-900/60 p-3 text-center">
      <div className="flex items-center justify-center gap-2 text-cyber-yellow font-orbitron text-xs mb-2">
        <Clock className="w-4 h-4" />
        <span>Mercado de planos en mantenimiento</span>
      </div>
      <div className="flex items-center justify-center gap-2 font-orbitron">
        {days > 0 && (
          <div className="flex flex-col items-center min-w-[44px] bg-space-800/80 rounded-md px-2 py-1">
            <span className="text-cyber-yellow text-lg font-bold leading-none">{pad(days)}</span>
            <span className="text-gray-400 text-[9px] mt-1">días</span>
          </div>
        )}
        <div className="flex flex-col items-center min-w-[44px] bg-space-800/80 rounded-md px-2 py-1">
          <span className="text-cyber-yellow text-lg font-bold leading-none">{pad(hours)}</span>
          <span className="text-gray-400 text-[9px] mt-1">hs</span>
        </div>
        <div className="flex flex-col items-center min-w-[44px] bg-space-800/80 rounded-md px-2 py-1">
          <span className="text-cyber-yellow text-lg font-bold leading-none">{pad(minutes)}</span>
          <span className="text-gray-400 text-[9px] mt-1">min</span>
        </div>
        <div className="flex flex-col items-center min-w-[44px] bg-space-800/80 rounded-md px-2 py-1">
          <span className="text-cyber-yellow text-lg font-bold leading-none">{pad(seconds)}</span>
          <span className="text-gray-400 text-[9px] mt-1">seg</span>
        </div>
      </div>
      <p className="text-gray-400 text-[11px] mt-2">
        Se habilita el lunes 27/04 a las 12:00 hs
      </p>
    </div>
  );
}

function ShipCard({
  shipType,
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
  combatBonuses,
  shipSpeedWithBonus,
  requiresBlueprint,
  blueprintQuantity,
  bypassRequirements = false,
  blueprintCostTung = null,
  isBuyingBlueprint = false,
  onBuyBlueprint,
  onUpdateQuantity,
  onSetMax,
  onBuild,
  onShowInfo,
}: ShipCardProps) {
  const { t } = useI18n();
  const hasBlueprintForQuantity = blueprintQuantity >= buildQuantity;
  const isLocked = !!(missingReqs && missingReqs.length > 0) && !hasBlueprintForQuantity;
  // Cuando tiene planos suficientes -> requisitos quedan anulados (solo Hangar Nv1).
  const reqsBypassed = bypassRequirements;
  const imageUrl = getShipImage(shipType.code, shipType.image_url);
  const isThemedImage = imageUrl?.startsWith('/Imagenes/Barraca/');

  return (
    <div className={`relative p-[3px] rounded-2xl bg-gradient-to-b from-amber-300 via-amber-700 to-amber-500 shadow-[0_14px_40px_rgba(0,0,0,0.65)] transition-all hover:shadow-[0_0_0_2px_rgba(251,191,36,0.35),0_18px_48px_rgba(0,0,0,0.8)] ${isLocked ? 'opacity-60 saturate-[.65]' : ''}`}>
      {/* Esquinas de piedra labrada */}
      <span className="pointer-events-none absolute left-2 top-2 w-3.5 h-3.5 border-l-[3px] border-t-[3px] border-amber-200 z-20 rounded-tl-sm" />
      <span className="pointer-events-none absolute right-2 top-2 w-3.5 h-3.5 border-r-[3px] border-t-[3px] border-amber-200 z-20 rounded-tr-sm" />
      <span className="pointer-events-none absolute left-2 bottom-2 w-3.5 h-3.5 border-l-[3px] border-b-[3px] border-amber-200 z-20 rounded-bl-sm" />
      <span className="pointer-events-none absolute right-2 bottom-2 w-3.5 h-3.5 border-r-[3px] border-b-[3px] border-amber-200 z-20 rounded-br-sm" />

      <div className="relative rounded-[13px] bg-[linear-gradient(180deg,#2a1e13_0%,#1b1109_45%,#100a05_100%)] overflow-hidden">
        {/* Medallón con la cantidad */}
        <div className="absolute top-2.5 right-2.5 z-20 flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fde68a,#d97706)] text-stone-950 font-serif font-bold border border-amber-200 shadow-[0_3px_10px_rgba(0,0,0,0.6)]">
          {currentQuantity}
          {inQueue > 0 && <span className="ml-1 text-[10px] text-stone-700">+{inQueue}</span>}
        </div>
        {requiresBlueprint && blueprintQuantity > 0 && (
          <div className="absolute top-2.5 left-2.5 z-20 px-2.5 py-1 rounded-full bg-stone-950/70 border border-emerald-500/50 text-emerald-300 text-[10px] font-semibold backdrop-blur-sm">
            ⚜ Planos: {blueprintQuantity}
          </div>
        )}

        {/* Arco romano con la imagen */}
        <button
          onClick={onShowInfo}
          className="relative block w-full mt-2 px-3 group cursor-pointer"
        >
          <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] rounded-t-full rounded-b-xl overflow-hidden border-[3px] border-amber-600/70 bg-[radial-gradient(circle_at_50%_25%,#4a3319_0%,#241609_60%,#120b05_100%)] shadow-inner">
            {imageUrl ? (
              <MediaDisplay
                src={imageUrl}
                alt={translateShipName(t, shipType.code, shipType.name)}
                className={`w-full h-full object-cover transition-transform duration-300 ${isThemedImage ? 'group-hover:scale-105' : 'group-hover:scale-110'}`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Rocket className="w-16 h-16 text-amber-200/25 group-hover:text-amber-400/60 transition-colors" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f0804]/80 via-transparent to-transparent" />
          </div>
        </button>

        {/* Cinta dorada con el nombre */}
        <div className="relative z-10 mx-9 -mt-4">
          <div className="relative bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 text-stone-950 text-center font-serif font-bold uppercase tracking-[0.15em] text-[11px] sm:text-sm px-3 py-1.5 rounded-sm shadow-[0_4px_14px_rgba(0,0,0,0.7)]">
            <span className="block truncate">{translateShipName(t, shipType.code, shipType.name)}</span>
            <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full border-y-[8px] border-y-transparent border-r-[9px] border-r-amber-700" />
            <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full border-y-[8px] border-y-transparent border-l-[9px] border-l-amber-700" />
          </div>
        </div>

      <div className="px-3 sm:px-4 pb-4 pt-3 space-y-2.5">
        {/* Stats grabadas con iconos */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-black/25 border-l-[3px] border-red-500/70">
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-amber-200/60"><Swords className="w-3.5 h-3.5 text-red-400" />{t.shipyard.attack}</span>
            <span className="font-serif font-bold text-amber-50 text-sm">
              {combatBonuses.weapon > 0 ? (
                <>
                  <span className="text-amber-200/40 line-through text-xs mr-1">{shipType.weapon_power}</span>
                  <span className="text-red-400">{Math.floor(shipType.weapon_power * (1 + combatBonuses.weapon))}</span>
                </>
              ) : (
                shipType.weapon_power
              )}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-black/25 border-l-[3px] border-sky-500/70">
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-amber-200/60"><Shield className="w-3.5 h-3.5 text-sky-400" />{t.shipyard.shield}</span>
            <span className="font-serif font-bold text-amber-50 text-sm">
              {combatBonuses.shield > 0 ? (
                <>
                  <span className="text-amber-200/40 line-through text-xs mr-1">{shipType.shield_power}</span>
                  <span className="text-sky-400">{Math.floor(shipType.shield_power * (1 + combatBonuses.shield))}</span>
                </>
              ) : (
                shipType.shield_power
              )}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-black/25 border-l-[3px] border-amber-500/70">
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-amber-200/60"><Package className="w-3.5 h-3.5 text-amber-400" />{t.shipyard.cargo}</span>
            <span className="font-serif font-bold text-amber-50 text-sm truncate">
              {formatNumber(shipType.cargo_capacity)}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-black/25 border-l-[3px] border-emerald-500/70">
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-amber-200/60"><Gauge className="w-3.5 h-3.5 text-emerald-400" />{t.shipyard.speed}</span>
            <span className="font-serif font-bold text-amber-50 text-sm truncate">
              {shipSpeedWithBonus > shipType.base_speed ? (
                <>
                  <span className="text-amber-200/40 line-through text-xs mr-1">{formatNumber(shipType.base_speed)}</span>
                  <span className="text-emerald-400">{formatNumber(shipSpeedWithBonus)}</span>
                </>
              ) : (
                formatNumber(shipType.base_speed)
              )}
            </span>
          </div>
        </div>

        {/* Requisitos */}
        {allRequirements.length > 0 && (
          <div className={`text-xs space-y-1 mb-3 p-2 rounded-lg border ${reqsBypassed ? 'bg-emerald-500/10 border-emerald-600/30' : 'bg-black/20 border-amber-800/30'}`}>
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

        {/* Estado del plano / requisitos: claro e intuitivo */}
        {requiresBlueprint && (
          <div className="space-y-2">
            {reqsBypassed ? (
              <div className="text-[11px] rounded-lg px-2 py-2 border border-emerald-600/40 bg-emerald-500/10 text-emerald-300">
                <span className="font-semibold">✓ Plano activo.</span> Se construye solo con Barraca Nv 1 · se gasta 1 plano por tropa.
              </div>
            ) : isLocked ? (
              <div className="text-[11px] rounded-lg px-2 py-2 border border-amber-600/40 bg-amber-500/10 text-amber-300">
                <span className="font-semibold">Te faltan requisitos.</span> Complétalos para construirla, o compra su plano y créala ya (solo pide Barraca Nv 1).
              </div>
            ) : (
              <div className="text-[11px] rounded-lg px-2 py-2 border border-emerald-600/40 bg-emerald-500/10 text-emerald-300">
                <span className="font-semibold">✓ Cumples los requisitos.</span> Puedes construirla sin plano. El plano es un atajo opcional.
              </div>
            )}

            <div className="text-[11px] text-amber-200/80 px-1">
              Planos en inventario: <span className="font-semibold">{blueprintQuantity}</span>
            </div>

            {onBuyBlueprint && (
              <button
                onClick={onBuyBlueprint}
                disabled={isBuyingBlueprint}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs transition-all ${
                  isBuyingBlueprint
                    ? 'bg-black/30 text-amber-200/40 cursor-not-allowed border border-amber-800/40'
                    : 'bg-gradient-to-b from-amber-500/20 to-amber-700/20 text-amber-300 border border-amber-600/50 hover:from-amber-500/30 hover:to-amber-700/30'
                }`}
              >
                <Coins className="w-4 h-4" />
                {isBuyingBlueprint
                  ? 'Comprando...'
                  : blueprintCostTung != null
                    ? `Comprar plano · ${formatNumber(blueprintCostTung)} TUNG`
                    : 'Comprar plano'}
              </button>
            )}
          </div>
        )}

        {isLocked ? (
          <div className="text-xs sm:text-sm text-amber-400">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 flex-shrink-0" />
              {t.common.locked}
            </div>
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

            {/* Selector de cantidad (monedas) */}
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
            <div className="flex items-center justify-between pt-2.5 border-t-2 border-amber-700/30">
              <div className="flex items-center gap-1 text-sm text-amber-200/70">
                <Clock className="w-4 h-4" />
                {formatTime(buildTime)}
              </div>
              <button
                onClick={onBuild}
                disabled={!canBuild}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-md font-serif font-bold uppercase tracking-[0.2em] text-sm transition-all ${
                  canBuild
                    ? 'bg-gradient-to-b from-amber-300 via-amber-500 to-amber-800 text-stone-950 shadow-[0_5px_16px_rgba(217,119,6,0.45)] hover:from-amber-200 hover:via-amber-400 hover:to-amber-700'
                    : 'bg-[#2a1c0c] text-amber-200/30 cursor-not-allowed border border-amber-800/40'
                }`}
              >
                {t.common.build}
              </button>
            </div>

            {!canBuild && disabledReason && !isLocked && (
              <div className="flex items-start gap-2 text-xs text-amber-400">
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

interface ShipInfoModalProps {
  shipType: ShipType;
  currentQuantity: number;
  shipyardLevel: number;
  naniteLevel: number;
  combatBonuses: { weapon: number; shield: number; armor: number };
  shipSpeedWithBonus: number;
  isVip: boolean;
  onClose: () => void;
}

function ShipInfoModal({
  shipType,
  currentQuantity,
  shipyardLevel,
  naniteLevel,
  combatBonuses,
  shipSpeedWithBonus,
  isVip,
  onClose,
}: ShipInfoModalProps) {
  const { t } = useI18n();
  const buildTimePerUnit = calculateShipyardTime(
    shipType.metal_cost,
    shipType.crystal_cost,
    shipyardLevel,
    naniteLevel,
    isVip
  );

  const rapidFireData = shipType.rapid_fire as Record<string, number> | null;
  const rapidFireEntries = rapidFireData ? Object.entries(rapidFireData) : [];

  const shipCodeNames: Record<string, string> = {
    small_cargo: t.shipyard.smallCargo,
    large_cargo: t.shipyard.largeCargo,
    colony_ship: t.shipyard.colonyShip,
    recycler: t.shipyard.recycler,
    espionage_probe: t.shipyard.espionageProbe,
    solar_satellite: t.shipyard.solarSatellite,
    light_fighter: t.shipyard.lightFighter,
    heavy_fighter: t.shipyard.heavyFighter,
    cruiser: t.shipyard.cruiser,
    battleship: t.shipyard.battleship,
    battlecruiser: t.shipyard.battlecruiser,
    bomber: t.shipyard.bomber,
    destroyer: t.shipyard.destroyer,
    deathstar: t.shipyard.deathstar,
    star_destroyer: t.shipyard.starDestroyer,
    black_moon: t.shipyard.blackMoon,
    falco_x_clasica: t.shipyard.falcoXClasica,
    nova: t.shipyard.nova,
    large_frigate: t.shipyard.largeFrigate,
    destruccion_masiva: t.shipyard.destruccionMasiva,
    rocket_launcher: t.defense.rocketLauncher,
    light_laser: t.defense.lightLaser,
    heavy_laser: t.defense.heavyLaser,
    gauss_cannon: t.defense.gaussCannon,
    ion_cannon: t.defense.ionCannon,
    plasma_turret: t.defense.plasmaTurret,
  };

  const categoryName =
    shipType.category === 'civil'
      ? t.shipyard.civilShips
      : shipType.category === 'combat'
        ? t.shipyard.combatShips
        : t.shipyard.specialShips;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-space-800 border border-space-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-cyber-orange/20 to-transparent p-4 sm:p-6 border-b border-space-600">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="p-3 rounded-xl bg-cyber-orange/20 text-cyber-orange">
              <ShipIcon
                imageUrl={getShipImage(shipType.code, shipType.image_url)}
                name={translateShipName(t, shipType.code, shipType.name)}
                className="w-10 h-10"
                iconClassName="w-10 h-10"
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h2 className="font-orbitron text-xl text-white">{translateShipName(t, shipType.code, shipType.name)}</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-space-700 transition-colors text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-gray-400 text-sm mt-1">{shipType.description}</p>
              <div className="flex items-center gap-4 mt-3">
                <span className="text-cyber-orange font-orbitron">
                  {t.common.quantity}: {formatNumber(currentQuantity)}
                </span>
                <span className="text-gray-500 text-sm">
                  {t.common.type}: {categoryName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh]">
          {/* Stats de combate */}
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">{t.shipyard.combatStats}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
              <div className="bg-space-700/50 p-3 rounded-lg text-center">
                <Target className="w-6 h-6 mx-auto mb-2 text-cyber-red" />
                <p className="text-xs text-gray-400">{t.shipyard.attack}</p>
                <p className="text-lg font-orbitron text-white">
                  {combatBonuses.weapon > 0 ? (
                    <>
                      <span className="text-gray-400 line-through text-sm">{formatNumber(shipType.weapon_power)}</span>{' '}
                      <span className="text-cyber-red">{formatNumber(Math.floor(shipType.weapon_power * (1 + combatBonuses.weapon)))}</span>
                    </>
                  ) : (
                    formatNumber(shipType.weapon_power)
                  )}
                </p>
              </div>
              <div className="bg-space-700/50 p-3 rounded-lg text-center">
                <Shield className="w-6 h-6 mx-auto mb-2 text-cyber-blue" />
                <p className="text-xs text-gray-400">{t.shipyard.shield}</p>
                <p className="text-lg font-orbitron text-white">
                  {combatBonuses.shield > 0 ? (
                    <>
                      <span className="text-gray-400 line-through text-sm">{formatNumber(shipType.shield_power)}</span>{' '}
                      <span className="text-cyber-blue">{formatNumber(Math.floor(shipType.shield_power * (1 + combatBonuses.shield)))}</span>
                    </>
                  ) : (
                    formatNumber(shipType.shield_power)
                  )}
                </p>
              </div>
              <div className="bg-space-700/50 p-3 rounded-lg text-center">
                <Crosshair className="w-6 h-6 mx-auto mb-2 text-cyber-pink" />
                <p className="text-xs text-gray-400">{t.shipyard.hull}</p>
                <p className="text-lg font-orbitron text-white">
                  {combatBonuses.armor > 0 ? (
                    <>
                      <span className="text-gray-400 line-through text-sm">{formatNumber(shipType.structural_integrity)}</span>{' '}
                      <span className="text-cyber-pink">{formatNumber(Math.floor(shipType.structural_integrity * (1 + combatBonuses.armor)))}</span>
                    </>
                  ) : (
                    formatNumber(shipType.structural_integrity)
                  )}
                </p>
              </div>
              <div className="bg-space-700/50 p-3 rounded-lg text-center">
                <Truck className="w-6 h-6 mx-auto mb-2 text-cyber-green" />
                <p className="text-xs text-gray-400">{t.shipyard.cargo}</p>
                <p className="text-lg font-orbitron text-white">
                  {formatNumber(shipType.cargo_capacity)}
                </p>
              </div>
            </div>
          </div>

          {/* Velocidad y consumo */}
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">{t.shipyard.speedAndConsumption}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
              <div className="bg-space-700/50 p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-cyber-orange" />
                  <div>
                    <p className="text-xs text-gray-400">{t.shipyard.baseSpeed}</p>
                    <p className="text-white font-semibold">
                      {shipSpeedWithBonus > shipType.base_speed ? (
                        <>
                          <span className="text-gray-400 line-through text-sm">{formatNumber(shipType.base_speed)}</span>{' '}
                          <span className="text-cyber-green">{formatNumber(shipSpeedWithBonus)}</span>
                        </>
                      ) : (
                        formatNumber(shipType.base_speed)
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-space-700/50 p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-cyber-blue" />
                  <div>
                    <p className="text-xs text-gray-400">{t.shipyard.timePerUnit}</p>
                    <p className="text-white font-semibold">{formatTime(buildTimePerUnit)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Costos */}
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">{t.shipyard.buildCosts}</h3>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="bg-space-700/50 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-400 mb-1">{t.resources.metal}</p>
                <p className="text-white font-semibold">{formatNumber(shipType.metal_cost)}</p>
              </div>
              <div className="bg-space-700/50 p-3 rounded-lg text-center">
                <p className="text-xs text-cyan-400 mb-1">{t.resources.crystal}</p>
                <p className="text-white font-semibold">{formatNumber(shipType.crystal_cost)}</p>
              </div>
              <div className="bg-space-700/50 p-3 rounded-lg text-center">
                <p className="text-xs text-green-400 mb-1">{t.resources.deuterium}</p>
                <p className="text-white font-semibold">{formatNumber(shipType.deuterium_cost)}</p>
              </div>
            </div>
          </div>

          {/* Rapid Fire */}
          {rapidFireEntries.length > 0 && (
            <div className="mb-6">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-cyber-red" />
                {t.shipyard.rapidFire}
              </h3>
              <p className="text-xs text-gray-400 mb-3">{t.shipyard.rapidFireDescription}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {rapidFireEntries.map(([target, value]) => (
                  <div
                    key={target}
                    className="bg-space-700/50 p-2 rounded-lg flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-300">{shipCodeNames[target] || target}</span>
                    <span className="text-cyber-red font-orbitron">x{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla de produccion */}
          <div className="bg-space-700/30 p-4 rounded-lg">
            <h3 className="text-white font-semibold mb-2">{t.shipyard.productionTable}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-space-600">
                    <th className="text-left py-2 px-2">{t.common.quantity}</th>
                    <th className="text-right py-2 px-2">{t.resources.metal}</th>
                    <th className="text-right py-2 px-2">{t.resources.crystal}</th>
                    <th className="text-right py-2 px-2">{t.resources.deuterium}</th>
                    <th className="text-right py-2 px-2">{t.common.time}</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 5, 10, 50, 100, 500, 1000].map((qty) => (
                    <tr key={qty} className="border-b border-space-700/50 text-gray-300">
                      <td className="py-2 px-2 font-orbitron">{qty}</td>
                      <td className="text-right py-2 px-2">
                        {formatNumber(shipType.metal_cost * qty)}
                      </td>
                      <td className="text-right py-2 px-2">
                        {formatNumber(shipType.crystal_cost * qty)}
                      </td>
                      <td className="text-right py-2 px-2">
                        {formatNumber(shipType.deuterium_cost * qty)}
                      </td>
                      <td className="text-right py-2 px-2 text-gray-400">
                        {formatTime(buildTimePerUnit * qty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
