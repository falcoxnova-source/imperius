// =============================================================================
// Página de Flotas - FleetPage.tsx
// =============================================================================
// 
// BUG CORREGIDO (26/01/2026): Duplicación de naves al acelerar flota
// -----------------------------------------------------------------------------
// DESCRIPCIÓN DEL BUG:
// Cuando un jugador pagaba TUNG para acelerar la llegada de una flota (especialmente
// flotas en retorno), las naves se duplicaban. El jugador obtenía el doble de 
// las naves que estaban volando.
//
// CAUSA RAÍZ:
// Era una condición de carrera (race condition). La función accelerate_fleet()
// en el backend solo cambiaba el tiempo de llegada a "now() - 1 second" pero
// NO procesaba la flota directamente. Luego, el setInterval de 5 segundos
// (líneas ~63-70) llamaba a checkFleetArrivals() que procesaba flotas con
// tiempo expirado. Si había múltiples llamadas concurrentes (refresh, otra tab,
// cron), la misma flota se procesaba múltiples veces antes de marcarse como
// is_completed = true, duplicando las naves.
//
// CORRECCIÓN:
// 1. Backend: accelerate_fleet() ahora llama directamente a process_fleet_arrival()
// 2. Backend: process_fleet_arrival() ahora usa FOR UPDATE para bloquear la fila
// 3. Backend: process_user_pending_fleets() usa FOR UPDATE SKIP LOCKED
//
// Ver migración: 20260126000001_293_fix_fleet_acceleration_double_processing_bug.sql
// =============================================================================

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Send,
  Rocket,
  ChevronRight,
  Package,
  AlertCircle,
  RotateCcw,
  ArrowRight,
  Users,
  Shield,
  UserPlus,
  Swords,
  XCircle,
  Zap,
  X,
  Coins,
  ShieldAlert,
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { ShipIcon } from '../../components/ui/ShipIcon';
import { GameMedia } from '../../components/ui/GameMedia';
import { PeaceShieldAttackWarning } from '../../components/game/PeaceShieldWidget';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { rpcWithRetry } from '../../lib/rpcWithRetry';
import {
  calculateDistance,
  calculateFlightTime,
  calculateFuelConsumption,
  calculateFleetSlots,
  calculateShipSpeedWithBonus,
} from '../../lib/formulas';
import { getOfficerBonuses } from '../../lib/officers';
import { useIsUserPlus } from '../../hooks/useIsUserPlus';
import { formatNumber, formatTime, formatTimeRemaining, formatCoordinates } from '../../lib/utils';
import type { MissionType } from '../../types/game';
import { useI18n, translateShipName, translatePlanetName, getShipImage } from '../../lib/i18n';
import { getBattleEffectStyle } from '../../lib/battleEffects';
import { useHeroAccess } from '../../lib/casino';

interface IncomingAttack {
  fleet_id: string;
  mission_type: string;
  departure_time: string;
  arrival_time: string;
  is_returning: boolean;
  target_galaxy: number;
  target_system: number;
  target_position: number;
  target_planet_name: string;
  origin_galaxy: number;
  origin_system: number;
  origin_position: number;
  attacker_name: string;
  attacker_spy_level: number;
  can_see_fleet: boolean;
  ships: { ship_name: string; ship_code: string; quantity: number }[] | null;
}

export function FleetPage() {
  const { t } = useI18n();
  const { ships, shipTypes, fleets, resources, currentPlanet, planets, fetchFleets, fetchResources, fetchShips, checkFleetArrivals, technologies, activeOfficers } = useGameStore();
  const { profile, refreshProfile } = useAuthStore();
  const isPlus = useIsUserPlus();
  const effectStyle = getBattleEffectStyle(profile?.active_battle_effect);
  const [searchParams] = useSearchParams();

  const initialGalaxy = parseInt(searchParams.get('galaxy') || '1') || 1;
  const initialSystem = parseInt(searchParams.get('system') || '1') || 1;
  const initialPosition = parseInt(searchParams.get('position') || '1') || 1;
  const initialMission = (searchParams.get('mission') as MissionType) || 'attack';

  const [step, setStep] = useState(1);
  const [selectedShips, setSelectedShips] = useState<Record<number, number>>({});
  const [target, setTarget] = useState({ galaxy: initialGalaxy, system: initialSystem, position: initialPosition });
  const [targetType, setTargetType] = useState<'planet' | 'moon'>(searchParams.get('target') === 'moon' ? 'moon' : 'planet');
  const [mission, setMission] = useState<MissionType>(initialMission);
  const [cargo, setCargo] = useState({ metal: 0, crystal: 0, deuterium: 0 });
  const [speedPercent, setSpeedPercent] = useState(100);
  const [, setTick] = useState(0);
  const [protectionWarning, setProtectionWarning] = useState<string | null>(null);
  // [ACSDEF1] "Si no puedes atacarlo, no puedes defenderlo"
  const [defendBlock, setDefendBlock] = useState<{ reason: string; host?: string; myPts?: number; hostPts?: number } | null>(null);
  const [checkingProtection, setCheckingProtection] = useState(false);
  const [incomingAttacks, setIncomingAttacks] = useState<IncomingAttack[]>([]);
  // Héroe Imperial acompañando un ataque (validado en el servidor)
  const heroAccess = useHeroAccess(profile?.id);
  const [withHero, setWithHero] = useState(false);
  const [heroInfo, setHeroInfo] = useState<{ level: number; hp: number; hp_max: number; in_army?: boolean; repair_until?: string | null } | null>(null);
  const heroTargetAllowed = mission === 'attack' && !(target.system === 250 && (target.position === 8 || target.position === 9));
  const heroBlockReason = !heroInfo
    ? null
    : heroInfo.in_army
    ? 'Ya está con otro ejército'
    : heroInfo.hp <= 0
    ? 'Está herido (0 HP). Cúralo primero'
    : heroInfo.repair_until && new Date(heroInfo.repair_until).getTime() > Date.now()
    ? 'Está en reparación'
    : null;
  const sendWithHero = withHero && heroTargetAllowed && !!heroInfo && !heroBlockReason;

  useEffect(() => {
    if (!heroAccess || !profile || step !== 3 || mission !== 'attack') return;
    supabase.rpc('get_hero_ship', { p_user_id: profile.id }).then(({ data }) => {
      if (data) setHeroInfo(data as { level: number; hp: number; hp_max: number; in_army?: boolean; repair_until?: string | null });
    });
  }, [heroAccess, profile, step, mission]);

  // Fetch incoming attacks periodically
  useEffect(() => {
    if (!profile) return;
    const fetchIncoming = async () => {
      try {
        const { data, error } = await supabase.rpc('get_incoming_attacks', { p_user_id: profile.id });
        if (!error && data) {
          setIncomingAttacks(Array.isArray(data) ? data : []);
        }
      } catch {
        // Silent fail - non-critical feature
      }
    };
    fetchIncoming();
    const interval = setInterval(fetchIncoming, 10000);
    return () => clearInterval(interval);
  }, [profile]);

  useEffect(() => {
    if (profile) {
      checkFleetArrivals(profile.id, refreshProfile);
    }
  }, [profile, checkFleetArrivals, refreshProfile]);

  // ===========================================================================
  // BUG FIX: Este useEffect cada 5 segundos era parte del bug de duplicación
  // ===========================================================================
  // ANTES DEL FIX: checkFleetArrivals() encontraba flotas con tiempo expirado
  // (después de acelerar) y las procesaba. Si se ejecutaba mientras otra
  // transacción también procesaba, las naves se duplicaban.
  //
  // DESPUÉS DEL FIX: Aunque este intervalo sigue ejecutándose, el backend
  // ahora usa FOR UPDATE SKIP LOCKED para evitar procesamiento concurrente.
  // Además, accelerate_fleet() procesa directamente, así que cuando este
  // intervalo se ejecuta, la flota ya está marcada como is_completed = true.
  // ===========================================================================
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const getShipQuantity = (shipTypeId: number): number => {
    const ship = ships.find((s) => s.ship_type_id === shipTypeId);
    return ship?.quantity || 0;
  };

  const hasSelectedShips = Object.values(selectedShips).some((qty) => qty > 0);

  const totalCargoCapacity = Object.entries(selectedShips).reduce((total, [shipTypeId, qty]) => {
    const shipType = shipTypes.find((st) => st.id === parseInt(shipTypeId));
    return total + (shipType?.cargo_capacity || 0) * qty;
  }, 0);

  const techLevels = {
    combustionLevel: technologies.find(t => t.technology_type?.code === 'combustion_drive')?.level || 0,
    impulseLevel: technologies.find(t => t.technology_type?.code === 'impulse_drive')?.level || 0,
    hyperspaceLevel: technologies.find(t => t.technology_type?.code === 'hyperspace_drive')?.level || 0,
  };

  const slowestSpeed = Object.entries(selectedShips).reduce((slowest, [shipTypeId, qty]) => {
    if (qty <= 0) return slowest;
    const shipType = shipTypes.find((st) => st.id === parseInt(shipTypeId));
    if (!shipType) return slowest;
    const speedWithBonus = calculateShipSpeedWithBonus(shipType.code, shipType.base_speed, techLevels);
    return Math.min(slowest, speedWithBonus);
  }, Infinity);

  const distance = currentPlanet
    ? calculateDistance(
        currentPlanet.galaxy,
        currentPlanet.solar_system,
        currentPlanet.position,
        target.galaxy,
        target.system,
        target.position
      )
    : 0;

  const officerBonuses = getOfficerBonuses(activeOfficers);
  const admiralSpeedBonus = officerBonuses.hasAdmiral ? 0.2 : 0;

  const flightTime =
    slowestSpeed !== Infinity ? calculateFlightTime(distance, slowestSpeed, speedPercent, admiralSpeedBonus, isPlus) : 0;

  const fuelConsumption = Object.entries(selectedShips).reduce((total, [shipTypeId, qty]) => {
    if (qty <= 0) return total;
    const shipType = shipTypes.find((st) => st.id === parseInt(shipTypeId));
    if (!shipType) return total;
    return total + calculateFuelConsumption(distance, shipType.fuel_consumption, qty, speedPercent);
  }, 0);

  const totalCargoUsed = cargo.metal + cargo.crystal + cargo.deuterium;
  const totalDeuteriumNeeded = fuelConsumption + cargo.deuterium;
  const hasEnoughFuel = resources ? resources.deuterium >= totalDeuteriumNeeded : false;
  const hasEnoughResources = resources
    ? resources.metal >= cargo.metal &&
      resources.crystal >= cargo.crystal &&
      resources.deuterium >= totalDeuteriumNeeded
    : false;
  const cargoWithinLimit = totalCargoUsed <= totalCargoCapacity;

  const hasRequiredShips = (() => {
    const colonyShipType = shipTypes.find((st) => st.code === 'colony_ship');
    const recyclerType = shipTypes.find((st) => st.code === 'recycler');
    const megaRecyclerType = shipTypes.find((st) => st.code === 'mega_recycler');
    const spyProbeType = shipTypes.find((st) => st.code === 'espionage_probe');
    const darkMatterCollectorType = shipTypes.find((st) => st.code === 'dark_matter_collector');

    if (mission === 'colonize' && colonyShipType) {
      return (selectedShips[colonyShipType.id] || 0) >= 1;
    }
    if (mission === 'recycle') {
      const recyclerCount = recyclerType ? (selectedShips[recyclerType.id] || 0) : 0;
      const megaRecyclerCount = megaRecyclerType ? (selectedShips[megaRecyclerType.id] || 0) : 0;
      return (recyclerCount + megaRecyclerCount) >= 1;
    }
    if (mission === 'espionage' && spyProbeType) {
      return (selectedShips[spyProbeType.id] || 0) >= 1;
    }
    if (mission === 'harvest' && darkMatterCollectorType) {
      return (selectedShips[darkMatterCollectorType.id] || 0) >= 1;
    }
    return true;
  })();

  const getMissingShipMessage = (): string | null => {
    if (mission === 'colonize' && !hasRequiredShips) {
      return t.fleet.needColonyShip;
    }
    if (mission === 'recycle' && !hasRequiredShips) {
      return t.fleet.needRecycler;
    }
    if (mission === 'espionage' && !hasRequiredShips) {
      return t.fleet.needEspionageProbe;
    }
    if (mission === 'harvest' && !hasRequiredShips) {
      return t.fleet.needDarkMatterCollector;
    }
    return null;
  };

  const isValidTargetPosition = (() => {
    if (target.position === 16 && mission !== 'expedition') {
      return false;
    }
    if (mission === 'expedition' && target.position !== 16) {
      return false;
    }
    return true;
  })();

  const computerTechLevel = technologies.find((t) => t.technology_type?.code === 'computer_tech')?.level || 0;
  const maxFleetSlots = calculateFleetSlots(computerTechLevel, officerBonuses);
  const activeFleetCount = fleets.filter((f) => !f.is_completed).length;
  const hasAvailableFleetSlot = activeFleetCount < maxFleetSlots;

  const escortCheck = (() => {
    const novaType = shipTypes.find((st) => st.code === 'nova');
    const dmType = shipTypes.find((st) => st.code === 'destruccion_masiva');
    const cruiserType = shipTypes.find((st) => st.code === 'cruiser');
    const bcType = shipTypes.find((st) => st.code === 'battlecruiser');

    const hasNova = novaType && (selectedShips[novaType.id] || 0) > 0;
    const hasDM = dmType && (selectedShips[dmType.id] || 0) > 0;

    if (!hasNova && !hasDM) return { valid: true, message: null };

    const cruiserCount = cruiserType ? (selectedShips[cruiserType.id] || 0) : 0;
    const bcCount = bcType ? (selectedShips[bcType.id] || 0) : 0;

    if (cruiserCount < 10) return { valid: false, message: t.shipyard.escortDescription };
    if (bcCount < 5) return { valid: false, message: t.shipyard.escortDescription };
    return { valid: true, message: null };
  })();

  // Prevent sending fleet to the exact same location (same coords + same type)
  // Exception: recycle missions are allowed at same origin (to collect debris)
  const isSameOrigin = currentPlanet
    ? target.galaxy === currentPlanet.galaxy
      && target.system === currentPlanet.solar_system
      && target.position === currentPlanet.position
      && targetType === currentPlanet.planet_type
      && mission !== 'recycle'
    : false;

  const canSendFleet = hasSelectedShips && hasEnoughFuel && hasEnoughResources && cargoWithinLimit && hasRequiredShips && isValidTargetPosition && hasAvailableFleetSlot && escortCheck.valid && !isSameOrigin;

  const [fleetError, setFleetError] = useState<string | null>(null);
  const [sendingFleet, setSendingFleet] = useState(false);
  const [cancellingFleet, setCancellingFleet] = useState<string | null>(null);
  const [recallingFleet, setRecallingFleet] = useState<string | null>(null);

  const [availableAcs, setAvailableAcs] = useState<Array<{
    acs_id: string;
    name: string;
    target_coords: string;
    target_galaxy: number;
    target_system: number;
    target_position: number;
    arrival_time: string;
    current_participants: number;
    max_participants: number;
    creator_username: string;
    creator_id: string;
    is_creator: boolean;
    already_joined: boolean;
    participant_names: string[];
    target_owner_username?: string | null;
    target_owner_points?: number | null;
    can_attack?: boolean | null;
    can_attack_reason?: string | null;
    already_accelerated?: boolean | null;
  }>>([]);
  const [showAcsPanel, setShowAcsPanel] = useState(true);
  const [acsDetailModal, setAcsDetailModal] = useState<{ acs_id: string; name: string } | null>(null);
  const [acsDetailData, setAcsDetailData] = useState<Array<{
    username: string;
    user_id: string;
    is_creator: boolean;
    ships: Array<{ name: string; code: string; quantity: number; image_url: string | null }>;
  }>>([]);
  const [loadingAcsDetails, setLoadingAcsDetails] = useState(false);
  const [creatingAcs, setCreatingAcs] = useState<string | null>(null);
  const [joiningAcs, setJoiningAcs] = useState(false);
  const [acsName, setAcsName] = useState('');
  const [acsJoinModal, setAcsJoinModal] = useState<{
    acs_id: string;
    name: string;
    target_coords: string;
    target_galaxy: number;
    target_system: number;
    target_position: number;
  } | null>(null);
  const [acsJoinShips, setAcsJoinShips] = useState<Record<number, number>>({});
  const [acsJoinSpeed, setAcsJoinSpeed] = useState(100);
  const [acsJoinMessage, setAcsJoinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeExpeditions, setActiveExpeditions] = useState(0);
  const astrophysicsLevel = technologies.find(t => t.technology_type?.code === 'astrophysics')?.level || 0;
  const maxExpeditions = astrophysicsLevel >= 1 ? Math.max(1, Math.floor(Math.sqrt(astrophysicsLevel))) : 0;

  const [accelerateModalFleet, setAccelerateModalFleet] = useState<string | null>(null);
  // [ACSACC1] Aceleracion de ataque ACS completo (solo el creador paga)
  const [accelerateAcsId, setAccelerateAcsId] = useState<string | null>(null);
  const [accelerateCost, setAccelerateCost] = useState(0);
  // [FREEACCEL1] Aceleracion gratis solo para esta cuenta (el backend lo aplica igual)
  const freeAccel = profile?.id === '7a209fdf-6067-45d6-97b6-020b76a06793';
  const [isLoadingCost, setIsLoadingCost] = useState(false);
  const [isAccelerating, setIsAccelerating] = useState(false);
  const [accelerateMessage, setAccelerateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchAvailableAcs = async () => {
    const { data } = await supabase.rpc('get_available_acs_attacks');
    if (data) {
      setAvailableAcs(data);
    }
  };

  const fetchAcsDetails = async (acsId: string, acsName: string) => {
    setAcsDetailModal({ acs_id: acsId, name: acsName });
    setAcsDetailData([]);
    setLoadingAcsDetails(true);
    const { data } = await supabase.rpc('get_acs_participant_details', { p_acs_id: acsId });
    if (data?.success) {
      setAcsDetailData(data.participants || []);
    }
    setLoadingAcsDetails(false);
  };

  useEffect(() => {
    if (profile) {
      fetchAvailableAcs();
    }
  }, [profile]);

  useEffect(() => {
    const fetchExpeditionData = async () => {
      if (!profile) return;
      const { data } = await supabase.rpc('get_active_expedition_count', { p_user_id: profile.id });
      if (data !== null) setActiveExpeditions(data);
    };
    fetchExpeditionData();
  }, [profile, fleets]);

  const handleCreateAcs = async (fleetId: string) => {
    if (creatingAcs) return;
    setCreatingAcs(fleetId);

    try {
      const { data, error } = await supabase.rpc('create_acs_from_fleet', {
        p_fleet_id: fleetId,
        p_acs_name: acsName || null
      });

      if (error) throw error;

      if (data?.success) {
        fetchFleets(profile!.id);
        fetchAvailableAcs();
        setAcsName('');
      } else {
        setFleetError(data?.error || t.fleet.errorCreatingAcs);
      }
    } catch (error) {
      console.error('Error creating ACS:', error);
      setFleetError(t.fleet.errorCreatingAcsAttack);
    } finally {
      setCreatingAcs(null);
    }
  };

  const handleJoinAcsWithFleet = async () => {
    if (joiningAcs || !acsJoinModal || !currentPlanet || !profile) return;

    const hasShips = Object.values(acsJoinShips).some(qty => qty > 0);
    if (!hasShips) {
      setAcsJoinMessage({ type: 'error', text: t.fleet.selectAtLeastOneShip });
      return;
    }

    setJoiningAcs(true);
    setAcsJoinMessage(null);

    try {
      const fleetShipsArray = Object.entries(acsJoinShips)
        .filter(([, qty]) => qty > 0)
        .map(([shipTypeId, qty]) => ({
          ship_type_id: parseInt(shipTypeId),
          quantity: qty,
        }));

      const { data, error } = await supabase.rpc('join_acs_with_fleet', {
        p_acs_id: acsJoinModal.acs_id,
        p_origin_planet_id: currentPlanet.id,
        p_fleet_ships: fleetShipsArray,
        p_speed_percent: acsJoinSpeed,
      });

      if (error) throw error;

      if (data?.success) {
        setAcsJoinMessage({ type: 'success', text: data.message || t.fleet.joinedAcs });
        fetchFleets(profile.id);
        fetchResources(currentPlanet.id);
        fetchShips(currentPlanet.id);
        fetchAvailableAcs();
        setTimeout(() => {
          setAcsJoinModal(null);
          setAcsJoinShips({});
          setAcsJoinMessage(null);
        }, 1500);
      } else {
        setAcsJoinMessage({ type: 'error', text: data?.error || t.fleet.errorJoiningAcs });
      }
    } catch (error) {
      console.error('Error joining ACS:', error);
      setAcsJoinMessage({ type: 'error', text: t.fleet.errorJoiningAcsAttack });
    } finally {
      setJoiningAcs(false);
    }
  };

  const handleCancelFleet = async (fleetId: string) => {
    if (cancellingFleet) return;
    setCancellingFleet(fleetId);
    setFleetError(null);

    try {
      const { data, error } = await supabase.rpc('cancel_fleet', {
        p_fleet_id: fleetId
      });

      if (error) throw error;

      if (data?.success) {
        fetchFleets(profile!.id);
      } else {
        setFleetError(data?.error || t.fleet.errorCancellingFleet);
      }
    } catch (error) {
      console.error('Error cancelling fleet:', error);
      setFleetError(t.fleet.errorCancellingFleetMsg);
    } finally {
      setCancellingFleet(null);
    }
  };

  const handleRecallFleet = async (fleetId: string) => {
    if (recallingFleet) return;
    setRecallingFleet(fleetId);
    setFleetError(null);

    try {
      const { data, error } = await supabase.rpc('recall_deployed_fleet', {
        p_fleet_id: fleetId
      });

      if (error) throw error;

      if (data?.success) {
        fetchFleets(profile!.id);
      } else {
        setFleetError(data?.error || t.fleet.errorCancellingFleet);
      }
    } catch (error) {
      console.error('Error recalling fleet:', error);
      setFleetError(t.fleet.errorCancellingFleetMsg);
    } finally {
      setRecallingFleet(null);
    }
  };

  const handleOpenAccelerateModal = async (fleetId: string) => {
    setAccelerateAcsId(null);
    setAccelerateModalFleet(fleetId);
    setAccelerateCost(0);
    setIsLoadingCost(true);
    setAccelerateMessage(null);

    try {
      const { data, error } = await supabase.rpc('calculate_fxu_cost_fleet', {
        p_fleet_id: fleetId
      });

      if (error) throw error;
      setAccelerateCost(data || 0);
    } catch (error) {
      console.error('Error calculating fleet acceleration cost:', error);
      setAccelerateCost(0);
    } finally {
      setIsLoadingCost(false);
    }
  };

  // [ACSACC1] Abrir el modal de aceleracion para TODO un ataque ACS.
  // El costo es la suma del costo de cada flota que participa.
  const handleOpenAccelerateAcsModal = async (acsId: string) => {
    setAccelerateModalFleet(null);
    setAccelerateAcsId(acsId);
    setAccelerateCost(0);
    setIsLoadingCost(true);
    setAccelerateMessage(null);

    try {
      const { data, error } = await supabase.rpc('calculate_fxu_cost_acs', {
        p_acs_id: acsId
      });

      if (error) throw error;
      setAccelerateCost(data || 0);
    } catch (error) {
      console.error('Error calculating ACS acceleration cost:', error);
      setAccelerateCost(0);
    } finally {
      setIsLoadingCost(false);
    }
  };

  // [ACSACC1] Acelerar todas las flotas del ACS. Solo el creador puede y solo una vez.
  const handleAccelerateAcs = async () => {
    if (!accelerateAcsId || isAccelerating) return;

    setIsAccelerating(true);
    setAccelerateMessage(null);

    try {
      const { data, error } = await supabase.rpc('accelerate_acs', {
        p_acs_id: accelerateAcsId
      });

      if (error) throw error;

      if (data?.success) {
        setAccelerateMessage({ type: 'success', text: data.message || t.fleet.fleetAccelerated });
        fetchFleets(profile!.id);
        if (currentPlanet) {
          fetchShips(currentPlanet.id);
          fetchResources(currentPlanet.id);
        }
        refreshProfile();
        fetchAvailableAcs();
        setTimeout(() => {
          setAccelerateAcsId(null);
          setAccelerateMessage(null);
        }, 1500);
      } else {
        setAccelerateMessage({ type: 'error', text: data?.error || t.fleet.errorAcceleratingFleet });
      }
    } catch (error) {
      console.error('Error accelerating ACS:', error);
      setAccelerateMessage({ type: 'error', text: t.fleet.connectionError });
    } finally {
      setIsAccelerating(false);
    }
  };

  // ===========================================================================
  // handleAccelerateFleet - Acelerar llegada de flota pagando TUNG
  // ===========================================================================
  // BUG CORREGIDO (26/01/2026): Duplicación de naves
  // 
  // CÓDIGO ANTERIOR (BUGGY):
  // El backend accelerate_fleet() solo cambiaba el tiempo de llegada pero NO
  // procesaba la flota. Después de llamar fetchFleets() aquí, el setInterval
  // de checkFleetArrivals() encontraba la flota con tiempo expirado y la
  // procesaba. Si había múltiples llamadas, se procesaba múltiples veces.
  //
  // CÓDIGO NUEVO (CORREGIDO):
  // El backend ahora procesa la flota directamente en accelerate_fleet().
  // Cuando esta función retorna, la flota ya está completamente procesada
  // (is_completed = true) y las naves ya están en el planeta.
  // fetchFleets() aquí solo actualiza la UI para mostrar el estado actual.
  // ===========================================================================
  const handleAccelerateFleet = async () => {
    if (!accelerateModalFleet || isAccelerating) return;

    setIsAccelerating(true);
    setAccelerateMessage(null);

    try {
      // BUG FIX: accelerate_fleet() ahora procesa la flota directamente
      // en la misma transacción. Cuando retorna success, la flota ya está
      // completada y las naves están en el planeta de origen.
      const { data, error } = await supabase.rpc('accelerate_fleet', {
        p_fleet_id: accelerateModalFleet
      });

      if (error) throw error;

      if (data?.success) {
        setAccelerateMessage({ type: 'success', text: data.message || t.fleet.fleetAccelerated });
        // BUG FIX: Estas llamadas ahora solo actualizan la UI.
        // La flota ya fue procesada en el backend durante accelerate_fleet().
        // No hay riesgo de doble procesamiento porque is_completed ya es true.
        fetchFleets(profile!.id);
        if (currentPlanet) {
          fetchShips(currentPlanet.id);
          fetchResources(currentPlanet.id);
        }
        refreshProfile();
        setTimeout(() => {
          setAccelerateModalFleet(null);
          setAccelerateMessage(null);
        }, 1500);
      } else {
        setAccelerateMessage({ type: 'error', text: data?.error || t.fleet.errorAcceleratingFleet });
      }
    } catch (error) {
      console.error('Error accelerating fleet:', error);
      setAccelerateMessage({ type: 'error', text: t.fleet.connectionError });
    } finally {
      setIsAccelerating(false);
    }
  };

  const checkTargetProtection = async () => {
    // [ACSDEF1] estacionar en planeta ajeno: misma proteccion que para atacar
    if (mission === 'deploy' && target.position !== 16) {
      setProtectionWarning(null);
      setCheckingProtection(true);
      try {
        const { data } = await supabase.rpc('check_protection_status', {
          p_target_galaxy: target.galaxy,
          p_target_system: target.system,
          p_target_position: target.position,
        });
        if (data?.has_planet && !data.is_own && data.defend_reason) {
          setDefendBlock({
            reason: data.defend_reason,
            host: data.owner_username,
            myPts: data.attacker_points,
            hostPts: data.owner_points,
          });
          return false;
        }
      } catch {
        // el servidor vuelve a validar al enviar
      } finally {
        setCheckingProtection(false);
      }
      return true;
    }

    if (!['attack', 'destroy'].includes(mission) || target.position === 16) {
      setProtectionWarning(null);
      return true;
    }

    setCheckingProtection(true);
    try {
      const { data, error } = await supabase.rpc('check_protection_status', {
        p_target_galaxy: target.galaxy,
        p_target_system: target.system,
        p_target_position: target.position,
      });

      if (error || !data) {
        setProtectionWarning(null);
        return true;
      }

      if (!data.can_attack) {
        const reason = data.protection_reason || data.bashing_reason || t.galaxy.protectedPlayer;
        setProtectionWarning(reason);
        return false;
      }

      setProtectionWarning(null);
      return true;
    } catch {
      setProtectionWarning(null);
      return true;
    } finally {
      setCheckingProtection(false);
    }
  };

  const handleGoToStep3 = async () => {
    const canProceed = await checkTargetProtection();
    if (canProceed) {
      setStep(3);
    }
  };

  const handleSendFleet = async () => {
    if (!currentPlanet || !profile || !resources || !canSendFleet || sendingFleet) return;

    setFleetError(null);
    setSendingFleet(true);

    try {
      const fleetShipsArray = Object.entries(selectedShips)
        .filter(([, qty]) => qty > 0)
        .map(([shipTypeId, qty]) => ({
          ship_type_id: parseInt(shipTypeId),
          quantity: qty,
        }));

      const { data, error } = await rpcWithRetry<{ success: boolean; error?: string }>(
        sendWithHero ? 'send_fleet_with_hero' : 'secure_send_fleet',
        {
          p_origin_planet_id: currentPlanet.id,
          p_target_galaxy: target.galaxy,
          p_target_system: target.system,
          p_target_position: target.position,
          p_mission_type: mission,
          p_fleet_ships: fleetShipsArray,
          p_cargo_metal: cargo.metal,
          p_cargo_crystal: cargo.crystal,
          p_cargo_deuterium: cargo.deuterium,
          p_speed_percent: speedPercent,
          p_target_type: targetType,
        }
      );

      if (error) throw error;

      if (data && !data.success) {
        if (typeof data.error === 'string' && data.error.includes('no puedes defenderlo')) {
          setDefendBlock({ reason: data.error.split('no puedes defenderlo.').pop()?.trim() || data.error });
        } else {
          setFleetError(data.error || t.fleet.cannotSendMission);
        }
        setSendingFleet(false);
        return;
      }

      fetchResources(currentPlanet.id);
      fetchShips(currentPlanet.id);
      fetchFleets(profile.id);
      refreshProfile();
      setStep(1);
      setSelectedShips({});
      setCargo({ metal: 0, crystal: 0, deuterium: 0 });
      setTargetType('planet');
      setWithHero(false);
      setHeroInfo(null);
    } catch (error) {
      console.error('Error sending fleet:', error);
      setFleetError(t.fleet.cannotSendFleet);
    } finally {
      setSendingFleet(false);
    }
  };

  const activeFleets = fleets.filter((f) => !f.is_completed);

  return (
    <div className="space-y-6">
      {defendBlock && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setDefendBlock(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-400/50 bg-gradient-to-b from-space-800 via-space-900 to-black shadow-[0_0_40px_rgba(251,191,36,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
            <button
              onClick={() => setDefendBlock(null)}
              className="absolute right-3 top-3 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="px-6 pt-7 pb-6 text-center">
              <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-400/70 bg-amber-500/10">
                  <ShieldAlert className="h-10 w-10 text-amber-300" />
                </div>
              </div>
              <p className="text-xs uppercase tracking-[0.25em] text-amber-400/80">Pacto de Honor</p>
              <h3 className="mt-1 font-orbitron text-xl text-white">Defensa no permitida</h3>
              <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                <p className="font-orbitron text-sm text-amber-300 flex items-center justify-center gap-2">
                  <Swords className="h-4 w-4" />
                  Si no puedes atacarlo, no puedes defenderlo
                </p>
              </div>
              {defendBlock.host && (
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-space-700/60 p-3">
                    <p className="text-gray-400 text-xs">Tú</p>
                    <p className="font-orbitron text-cyber-blue">{formatNumber(defendBlock.myPts ?? 0)}</p>
                    <p className="text-gray-500 text-xs">puntos</p>
                  </div>
                  <div className="rounded-lg bg-space-700/60 p-3">
                    <p className="text-gray-400 text-xs truncate">{defendBlock.host}</p>
                    <p className="font-orbitron text-amber-300">{formatNumber(defendBlock.hostPts ?? 0)}</p>
                    <p className="text-gray-500 text-xs">puntos</p>
                  </div>
                </div>
              )}
              <p className="mt-4 text-sm text-gray-300">{defendBlock.reason}</p>
              <p className="mt-3 text-xs text-gray-500">
                Un ejército estacionado en una ciudad protegida sería intocable para los jugadores de tu rango.
                Para mantener el universo justo, solo puedes defender a aliados que también podrías atacar.
              </p>
              <button onClick={() => setDefendBlock(null)} className="btn-cyber mt-5 w-full flex items-center justify-center gap-2">
                <Shield className="h-4 w-4" />
                Entendido, comandante
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <Send className="w-8 h-8 text-cyber-blue" />
          {t.fleet.title}
          {effectStyle && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${effectStyle.badge}`}>
              <span className="animate-pulse">{effectStyle.emoji}</span>
              <span className="hidden sm:inline">{effectStyle.label}</span>
            </span>
          )}
        </h1>
        <div className={`text-sm px-3 py-1 rounded-lg ${hasAvailableFleetSlot ? 'bg-cyber-blue/20 text-cyber-blue' : 'bg-cyber-red/20 text-cyber-red'}`}>
          {t.fleet.activeFleets}: {activeFleetCount}/{maxFleetSlots}
        </div>
      </div>

      {activeFleets.length > 0 && (
        <div className="card-glass p-4">
          <h3 className="font-orbitron text-lg text-white mb-4">{t.fleet.fleetsInMotion}</h3>
          {fleetError && (
            <div className="mb-4 p-3 bg-cyber-red/20 border border-cyber-red/30 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-cyber-red flex-shrink-0" />
              <span className="text-cyber-red text-sm">{fleetError}</span>
              <button
                onClick={() => setFleetError(null)}
                className="ml-auto text-cyber-red hover:text-cyber-red/80"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="space-y-3">
            {activeFleets.map((fleet) => {
              const isReturning = fleet.is_returning;
              const timeRemaining = formatTimeRemaining(isReturning ? fleet.return_time! : fleet.arrival_time);
              const isOverdue = timeRemaining === '00:00';
              const isOwnPlanet = planets.some(p => p.galaxy === fleet.target_galaxy && p.solar_system === fleet.target_system && p.position === fleet.target_position);
              const isStationed = fleet.mission_type === 'deploy' && !isReturning && isOverdue && !isOwnPlanet;
              const isAcs = (fleet as { is_acs?: boolean }).is_acs;
              const canCreateAcs = fleet.mission_type === 'attack' && !isReturning && !isAcs;
              // [ACSACC1] Datos del ACS al que pertenece esta flota (para el boton de acelerar)
              const acsInfo = isAcs
                ? availableAcs.find(a => a.acs_id === (fleet as { acs_id?: string }).acs_id)
                : undefined;
              const canAccelerateAcs = !!acsInfo && !!acsInfo.is_creator && !acsInfo.already_accelerated;

              return (
                <div
                  key={fleet.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border ${
                    isStationed
                      ? 'bg-cyan-500/10 border-cyan-500/30'
                      : isAcs
                        ? 'bg-cyber-purple/10 border-cyber-purple/30'
                        : isReturning
                          ? 'bg-cyber-green/10 border-cyber-green/30'
                          : 'bg-space-700/50 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${
                      isStationed ? 'bg-cyan-500/20' : isAcs ? 'bg-cyber-purple/20' : isReturning ? 'bg-cyber-green/20' : 'bg-cyber-blue/20'
                    }`}>
                      {isStationed ? (
                        <Shield className="w-5 h-5 text-cyan-400" />
                      ) : isAcs ? (
                        <Users className="w-5 h-5 text-cyber-purple" />
                      ) : isReturning ? (
                        <RotateCcw className="w-5 h-5 text-cyber-green" />
                      ) : (
                        <ArrowRight className="w-5 h-5 text-cyber-blue" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-semibold capitalize truncate">
                          {t.fleet[fleet.mission_type as keyof typeof t.fleet]}
                        </p>
                        {isStationed && (
                          <span className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">
                            {t.fleet.stationed}
                          </span>
                        )}
                        {isAcs && (
                          <span className="text-xs px-2 py-0.5 bg-cyber-purple/20 text-cyber-purple rounded-full">
                            ACS
                          </span>
                        )}
                        {isReturning && (
                          <span className="text-xs px-2 py-0.5 bg-cyber-green/20 text-cyber-green rounded-full">
                            {t.fleet.returning}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 truncate">
                        {isReturning ? t.fleet.returningToOrigin : `${t.fleet.destination}: ${formatCoordinates(fleet.target_galaxy, fleet.target_system, fleet.target_position)}`}
                      </p>
                      {fleet.fleet_ships && fleet.fleet_ships.length > 0 && (
                        <p className="text-xs text-gray-500 break-words mt-0.5">
                          {fleet.fleet_ships
                            .filter(fs => fs.quantity > 0)
                            .map(fs => `${fs.ship_type?.name || `#${fs.ship_type_id}`} x${fs.quantity}`)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isReturning && fleet.mission_type === 'deploy' && isOverdue && (
                      <button
                        onClick={() => handleRecallFleet(fleet.id)}
                        disabled={recallingFleet === fleet.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-cyber-yellow/20 hover:bg-cyber-yellow/30 text-cyber-yellow text-xs font-semibold rounded-lg transition-colors border border-cyber-yellow/30"
                        title={t.fleet.recall}
                      >
                        {recallingFleet === fleet.id ? (
                          <div className="w-4 h-4 border-2 border-cyber-yellow/30 border-t-cyber-yellow rounded-full animate-spin" />
                        ) : (
                          <>
                            <RotateCcw className="w-4 h-4" />
                            <span className="hidden sm:inline">{t.fleet.recall}</span>
                          </>
                        )}
                      </button>
                    )}
                    {!isReturning && !(fleet.mission_type === 'deploy' && isOverdue) && (
                      <button
                        onClick={() => handleCancelFleet(fleet.id)}
                        disabled={cancellingFleet === fleet.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-cyber-red/20 hover:bg-cyber-red/30 text-cyber-red text-xs font-semibold rounded-lg transition-colors border border-cyber-red/30"
                        title={t.common.cancel}
                      >
                        {cancellingFleet === fleet.id ? (
                          <div className="w-4 h-4 border-2 border-cyber-red/30 border-t-cyber-red rounded-full animate-spin" />
                        ) : (
                          <>
                            <XCircle className="w-4 h-4" />
                            <span className="hidden sm:inline">{t.common.cancel}</span>
                          </>
                        )}
                      </button>
                    )}
                    {canCreateAcs && (
                      <button
                        onClick={() => handleCreateAcs(fleet.id)}
                        disabled={creatingAcs === fleet.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-cyber-purple/20 hover:bg-cyber-purple/30 text-cyber-purple text-xs font-semibold rounded-lg transition-colors border border-cyber-purple/30"
                        title={t.fleet.createAcsAttack}
                      >
                        {creatingAcs === fleet.id ? (
                          <div className="w-4 h-4 border-2 border-cyber-purple/30 border-t-cyber-purple rounded-full animate-spin" />
                        ) : (
                          <>
                            <Swords className="w-4 h-4" />
                            <span className="hidden sm:inline">{t.fleet.createAcs}</span>
                          </>
                        )}
                      </button>
                    )}
                    {!isOverdue && (!isAcs || isReturning) && (
                      <button
                        onClick={() => handleOpenAccelerateModal(fleet.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-semibold rounded-lg transition-colors border border-amber-500/30"
                        title={t.fleet.accelerateWithFxu}
                      >
                        <Zap className="w-4 h-4" />
                        <span className="hidden sm:inline">{t.fleet.accelerate}</span>
                      </button>
                    )}
                    {/* [ACSACC1] El creador del ACS acelera TODAS las flotas del ataque pagando el total */}
                    {!isOverdue && isAcs && !isReturning && canAccelerateAcs && (
                      <button
                        onClick={() => handleOpenAccelerateAcsModal(acsInfo!.acs_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-cyber-purple/20 hover:bg-cyber-purple/30 text-cyber-purple text-xs font-semibold rounded-lg transition-colors border border-cyber-purple/30"
                        title={t.fleet.accelerateWithFxu}
                      >
                        <Zap className="w-4 h-4" />
                        <span className="hidden sm:inline">{t.fleet.accelerate} ACS</span>
                      </button>
                    )}
                    {!isOverdue && isAcs && !isReturning && !canAccelerateAcs && (
                      <span className="text-xs text-gray-500 italic px-2">
                        {acsInfo?.already_accelerated ? 'ACS ya acelerado' : t.fleet.cannotAccelerateAcs}
                      </span>
                    )}
                    <div className="text-left sm:text-right flex-shrink-0">
                      <p className={`font-orbitron ${
                        isStationed
                          ? 'text-cyan-400'
                          : isOverdue
                            ? 'text-cyber-yellow animate-pulse'
                            : isAcs
                              ? 'text-cyber-purple'
                              : isReturning
                                ? 'text-cyber-green'
                                : 'text-cyber-blue'
                      }`}>
                        {isStationed ? t.fleet.stationedDefending : isOverdue ? t.fleet.processing : timeRemaining}
                      </p>
                      <p className="text-xs text-gray-500">
                        {isStationed ? `${t.fleet.destination}: ${formatCoordinates(fleet.target_galaxy, fleet.target_system, fleet.target_position)}` : isReturning ? t.fleet.timeToHome : t.fleet.timeToArrival}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Incoming Attacks Section */}
      {incomingAttacks.length > 0 && (
        <div className={`relative card-glass p-4 border bg-cyber-red/5 transition-all duration-500 ${effectStyle ? effectStyle.border + ' ' + effectStyle.glow : 'border-cyber-red/40'}`}>
          {effectStyle && (
            <div className={`absolute -inset-px rounded-xl opacity-10 blur-xl pointer-events-none ${effectStyle.particle} animate-pulse`} />
          )}
          <h3 className="font-orbitron text-lg text-cyber-red mb-4 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-cyber-red animate-pulse" />
            {t.fleet.incomingAttacks} ({incomingAttacks.length})
            {effectStyle && (
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${effectStyle.badge}`}>
                {effectStyle.emoji} {effectStyle.label}
              </span>
            )}
          </h3>
          <div className="space-y-3">
            {incomingAttacks.map((attack) => {
              const timeRemaining = formatTimeRemaining(attack.arrival_time);
              const isWithdrawing = attack.is_returning;
              // Calcular progreso del vuelo
              const now = Date.now();
              const departure = new Date(attack.departure_time).getTime();
              const arrival = new Date(attack.arrival_time).getTime();
              const totalFlightTime = arrival - departure;
              const elapsed = now - departure;
              const progress = totalFlightTime > 0 ? Math.min(100, Math.max(0, (elapsed / totalFlightTime) * 100)) : 0;
              const totalShips = attack.ships ? attack.ships.reduce((sum, s) => sum + s.quantity, 0) : 0;

              return (
                <div
                  key={attack.fleet_id}
                  className={`p-3 sm:p-4 rounded-xl border ${
                    isWithdrawing
                      ? 'bg-cyber-green/10 border-cyber-green/30'
                      : 'bg-cyber-red/10 border-cyber-red/30'
                  }`}
                >
                  {/* Header: Mission type + Countdown */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-1 sm:gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded-lg flex-shrink-0 ${isWithdrawing ? 'bg-cyber-green/20' : 'bg-cyber-red/20'}`}>
                        {isWithdrawing ? (
                          <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 text-cyber-green" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-cyber-red" />
                        )}
                      </div>
                      <span className={`text-xs sm:text-sm font-bold uppercase tracking-wide truncate ${
                        isWithdrawing ? 'text-cyber-green' : 'text-cyber-red'
                      }`}>
                        {t.fleet.hostileFleet} — {t.fleet[attack.mission_type as keyof typeof t.fleet] || attack.mission_type}
                      </span>
                      {isWithdrawing && (
                        <span className="text-xs px-2 py-0.5 bg-cyber-green/20 text-cyber-green rounded-full flex-shrink-0">
                          {t.fleet.attackerWithdrew}
                        </span>
                      )}
                    </div>
                    <div className="text-left sm:text-right flex-shrink-0">
                      <p className={`font-orbitron text-base sm:text-lg ${isWithdrawing ? 'text-cyber-green' : 'text-cyber-red animate-pulse'}`}>
                        {isWithdrawing ? t.fleet.attackerWithdrew : timeRemaining}
                      </p>
                      {!isWithdrawing && (
                        <p className="text-[10px] text-gray-500">{t.fleet.timeToImpact}</p>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {!isWithdrawing && (
                    <div className="w-full h-1.5 bg-space-700 rounded-full mb-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyber-red/60 to-cyber-red rounded-full transition-all duration-1000"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}

                  {/* Attack route: Origin → Target */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs sm:text-sm mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">{t.fleet.attacker}:</span>
                      <span className="text-white font-semibold">{attack.attacker_name}</span>
                      <span className="text-gray-500 font-mono">[{attack.origin_galaxy}:{attack.origin_system}:{attack.origin_position}]</span>
                    </div>
                    <span className="text-cyber-red hidden sm:inline">→</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">{t.fleet.targetPlanet}:</span>
                      <span className="text-white font-semibold">{attack.target_planet_name}</span>
                      <span className="text-gray-500 font-mono">[{attack.target_galaxy}:{attack.target_system}:{attack.target_position}]</span>
                    </div>
                  </div>

                  {/* Fleet composition - based on espionage level */}
                  {attack.can_see_fleet && attack.ships && attack.ships.length > 0 ? (
                    <div className="mt-2 p-2 sm:p-3 bg-space-800/60 rounded-lg border border-space-600/30">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs sm:text-sm text-gray-400 font-semibold">
                          {t.fleet.fleetComposition}
                        </span>
                        <span className="text-xs text-cyber-red font-orbitron">
                          {t.fleet.totalShips}: {totalShips.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {attack.ships.map((ship, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1 px-2 py-1 bg-space-700/50 rounded-md border border-space-600/20 text-xs"
                          >
                            <span className="text-gray-300">{ship.ship_name}</span>
                            <span className="text-cyber-red font-bold">x{ship.quantity.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : !attack.can_see_fleet && !isWithdrawing ? (
                    <div className="mt-2 p-2 bg-space-800/40 rounded-lg border border-amber-500/20">
                      <p className="text-xs text-amber-400/80 italic">
                        {t.fleet.espionageInsufficient}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {availableAcs.length > 0 && (
        <div className="card-glass p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-orbitron text-lg text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyber-blue" />
              {t.fleet.allianceAcsAttacks}
            </h3>
            <button
              onClick={() => setShowAcsPanel(!showAcsPanel)}
              className="text-sm text-cyber-blue hover:text-cyber-blue/80 transition-colors"
            >
              {showAcsPanel ? t.fleet.hide : `${t.fleet.show} (${availableAcs.length})`}
            </button>
          </div>

          {showAcsPanel && (
            <div className="space-y-3">
              {availableAcs.map((acs) => {
                const protectionBlocked = acs.can_attack === false;
                const canJoin = !acs.is_creator && !acs.already_joined && acs.current_participants < acs.max_participants && !protectionBlocked;

                return (
                  <div
                    key={acs.acs_id}
                    className={`p-3 rounded-lg border ${
                      acs.is_creator
                        ? 'bg-cyber-blue/10 border-cyber-blue/30'
                        : acs.already_joined
                          ? 'bg-cyber-green/10 border-cyber-green/30'
                          : 'bg-space-700/50 border-space-600'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg flex-shrink-0 ${
                          acs.is_creator ? 'bg-cyber-blue/20' : acs.already_joined ? 'bg-cyber-green/20' : 'bg-space-600'
                        }`}>
                          <Swords className={`w-5 h-5 ${
                            acs.is_creator ? 'text-cyber-blue' : acs.already_joined ? 'text-cyber-green' : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-semibold">{acs.name}</p>
                            {acs.is_creator && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-cyber-blue/20 text-cyber-blue rounded-full">
                                {t.fleet.yourAcs}
                              </span>
                            )}
                            {acs.already_joined && !acs.is_creator && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-cyber-green/20 text-cyber-green rounded-full">
                                {t.fleet.joined}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-gray-400 mt-0.5">
                            <span>{t.fleet.by} {acs.creator_username}</span>
                            <span className="text-cyber-blue">{acs.target_coords}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {acs.current_participants}/{acs.max_participants}
                            </span>
                            <span className="font-orbitron text-cyber-yellow">
                              {formatTimeRemaining(acs.arrival_time)}
                            </span>
                          </div>
                          {acs.participant_names && acs.participant_names.length > 0 && (
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-1 flex-wrap">
                              <span className="text-gray-500">{t.fleet.allies}</span>
                              {acs.participant_names.map((name, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-space-600/60 rounded text-cyber-blue/80">
                                  {name}
                                </span>
                              ))}
                              <button
                                onClick={(e) => { e.stopPropagation(); fetchAcsDetails(acs.acs_id, acs.name); }}
                                className="px-1.5 py-0.5 bg-cyber-blue/10 hover:bg-cyber-blue/20 text-cyber-blue rounded transition-colors cursor-pointer"
                              >
                                {t.fleet.viewFleets}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {canJoin && (
                          <button
                            onClick={() => {
                              setAcsJoinModal({
                                acs_id: acs.acs_id,
                                name: acs.name,
                                target_coords: acs.target_coords,
                                target_galaxy: acs.target_galaxy,
                                target_system: acs.target_system,
                                target_position: acs.target_position,
                              });
                              setAcsJoinShips({});
                              setAcsJoinSpeed(100);
                              setAcsJoinMessage(null);
                            }}
                            className="flex items-center gap-1.5 px-4 py-2 bg-cyber-blue hover:bg-cyber-blue/80 text-white text-sm font-semibold rounded-lg transition-colors"
                          >
                            <UserPlus className="w-4 h-4" />
                            {t.fleet.join}
                          </button>
                        )}
                        {protectionBlocked && !acs.is_creator && !acs.already_joined && (
                          <button
                            disabled
                            title={acs.can_attack_reason || ''}
                            className="flex items-center gap-1.5 px-4 py-2 bg-red-900/40 border border-red-500/40 text-red-300 text-sm font-semibold rounded-lg cursor-not-allowed"
                          >
                            <Shield className="w-4 h-4" />
                            {acs.can_attack_reason || 'Bloqueado'}
                          </button>
                        )}
                        {acs.already_joined && !acs.is_creator && (
                          <span className="text-xs text-cyber-green">{t.fleet.fleetSent}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="card-glass p-4 sm:p-6">
        <div className="flex items-center justify-center gap-2 sm:gap-4 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-orbitron text-sm sm:text-base ${
                  step >= s ? 'bg-cyber-blue text-white' : 'bg-space-700 text-gray-500'
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={`w-6 sm:w-12 h-1 ${step > s ? 'bg-cyber-blue' : 'bg-space-700'}`}
                />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div>
            <h3 className="font-orbitron text-lg text-white mb-4">{t.fleet.selectShips}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {shipTypes
                .filter((st) => getShipQuantity(st.id) > 0 && st.base_speed > 0)
                .map((shipType) => {
                  const available = getShipQuantity(shipType.id);
                  const selected = selectedShips[shipType.id] || 0;
                  const shipImage = getShipImage(shipType.code, shipType.image_url);

                  return (
                    <div
                      key={shipType.id}
                      className={`relative p-[3px] rounded-2xl bg-gradient-to-b from-amber-300 via-amber-700 to-amber-500 shadow-[0_14px_40px_rgba(0,0,0,0.65)] transition-all ${
                        selected > 0
                          ? 'hover:shadow-[0_0_0_2px_rgba(56,189,248,0.5),0_18px_48px_rgba(0,0,0,0.8)]'
                          : 'hover:shadow-[0_0_0_2px_rgba(251,191,36,0.35),0_18px_48px_rgba(0,0,0,0.8)]'
                      }`}
                    >
                      {selected > 0 && (
                        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-sky-400 z-20" />
                      )}
                      <span className="pointer-events-none absolute left-2 top-2 w-3.5 h-3.5 border-l-[3px] border-t-[3px] border-amber-200 z-20 rounded-tl-sm" />
                      <span className="pointer-events-none absolute right-2 top-2 w-3.5 h-3.5 border-r-[3px] border-t-[3px] border-amber-200 z-20 rounded-tr-sm" />
                      <span className="pointer-events-none absolute left-2 bottom-2 w-3.5 h-3.5 border-l-[3px] border-b-[3px] border-amber-200 z-20 rounded-bl-sm" />
                      <span className="pointer-events-none absolute right-2 bottom-2 w-3.5 h-3.5 border-r-[3px] border-b-[3px] border-amber-200 z-20 rounded-br-sm" />

                      <div className="relative rounded-[13px] bg-[linear-gradient(180deg,#2a1e13_0%,#1b1109_45%,#100a05_100%)] overflow-hidden">
                        <div className="absolute top-2.5 right-2.5 z-20 flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fde68a,#d97706)] text-stone-950 font-serif font-bold border border-amber-200 shadow-[0_3px_10px_rgba(0,0,0,0.6)]">
                          {available}
                        </div>
                        {selected > 0 && (
                          <div className="absolute top-2.5 left-2.5 z-20 px-2.5 py-1 rounded-full bg-sky-500 text-white text-[10px] font-bold shadow">
                            {t.fleet.selected}
                          </div>
                        )}

                        <div
                          className="relative block w-full mt-2 px-3 group cursor-pointer"
                          onClick={() =>
                            setSelectedShips((prev) => ({
                              ...prev,
                              [shipType.id]: selected > 0 ? 0 : available,
                            }))
                          }
                        >
                          <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] rounded-t-full rounded-b-xl overflow-hidden border-[3px] border-amber-600/70 bg-[radial-gradient(circle_at_50%_25%,#4a3319_0%,#241609_60%,#120b05_100%)] shadow-inner">
                            {shipImage ? (
                              <GameMedia
                                src={shipImage}
                                alt={translateShipName(t, shipType.code, shipType.name)}
                                className={`w-full h-full transition-transform duration-300 ${shipImage.startsWith('/Imagenes/Barraca/') ? 'object-contain p-3 group-hover:scale-105 [-webkit-mask-image:radial-gradient(ellipse_62%_58%_at_50%_50%,black_52%,transparent_98%)] [mask-image:radial-gradient(ellipse_62%_58%_at_50%_50%,black_52%,transparent_98%)]' : 'object-cover group-hover:scale-110'}`}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Rocket className="w-16 h-16 text-amber-200/25 group-hover:text-amber-400/60 transition-colors" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0f0804]/80 via-transparent to-transparent" />
                          </div>
                        </div>

                        <div className="relative z-10 mx-9 -mt-4">
                          <div className="relative bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 text-stone-950 text-center font-serif font-bold uppercase tracking-[0.15em] text-[11px] sm:text-sm px-3 py-1.5 rounded-sm shadow-[0_4px_14px_rgba(0,0,0,0.7)]">
                            <span className="block truncate">{translateShipName(t, shipType.code, shipType.name)}</span>
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full border-y-[8px] border-y-transparent border-r-[9px] border-r-amber-700" />
                            <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full border-y-[8px] border-y-transparent border-l-[9px] border-l-amber-700" />
                          </div>
                        </div>

                        <div className="px-3 sm:px-4 pb-4 pt-3">
                          <input
                            type="number"
                            value={selected}
                            onChange={(e) => {
                              e.stopPropagation();
                              const val = Math.min(available, Math.max(0, parseInt(e.target.value) || 0));
                              setSelectedShips((prev) => ({ ...prev, [shipType.id]: val }));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full px-3 py-2 bg-black/40 border border-amber-600/50 rounded-md text-center text-amber-100 font-serif font-bold"
                            min={0}
                            max={available}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {shipTypes.filter((st) => getShipQuantity(st.id) > 0 && st.base_speed > 0).length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t.fleet.noShips}</p>
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setStep(2)}
                disabled={!hasSelectedShips}
                className="btn-cyber flex items-center gap-2"
              >
                {t.common.continue} <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 className="font-orbitron text-lg text-white mb-4">{t.fleet.targetAndMission}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t.fleet.targetCoordinates}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={target.galaxy}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      const num = parseInt(val) || 0;
                      setTarget((prev) => ({ ...prev, galaxy: num }));
                    }}
                    onBlur={(e) => {
                      const num = parseInt(e.target.value) || 1;
                      setTarget((prev) => ({ ...prev, galaxy: Math.min(5, Math.max(1, num)) }));
                    }}
                    className="input-cyber w-20 text-center"
                  />
                  <span className="text-gray-500">:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={target.system}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      const num = parseInt(val) || 0;
                      setTarget((prev) => ({ ...prev, system: num }));
                    }}
                    onBlur={(e) => {
                      const num = parseInt(e.target.value) || 1;
                      setTarget((prev) => ({ ...prev, system: Math.min(499, Math.max(1, num)) }));
                    }}
                    className="input-cyber w-24 text-center"
                  />
                  <span className="text-gray-500">:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={target.position}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      const num = parseInt(val) || 0;
                      setTarget((prev) => ({ ...prev, position: num }));
                    }}
                    onBlur={(e) => {
                      const maxPos = mission === 'expedition' ? 16 : 15;
                      const num = parseInt(e.target.value) || 1;
                      setTarget((prev) => ({ ...prev, position: Math.min(maxPos, Math.max(1, num)) }));
                    }}
                    className="input-cyber w-20 text-center"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => setTargetType('planet')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                      targetType === 'planet'
                        ? 'bg-cyber-blue text-white'
                        : 'bg-space-700 text-gray-400 hover:bg-space-600'
                    }`}
                  >
                    🌍 Ciudad
                  </button>
                  <button
                    onClick={() => setTargetType('moon')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                      targetType === 'moon'
                        ? 'bg-cyber-purple text-white'
                        : 'bg-space-700 text-gray-400 hover:bg-space-600'
                    }`}
                  >
                    🌙 Castra de Diana
                  </button>
                </div>

                {/* Selector rápido de planetas y lunas propios */}
                {planets.length > 1 && (
                  <div className="mt-4">
                    <label className="block text-sm text-gray-400 mb-2">📍 {t.fleet.quickSelect || 'Selección rápida - Mis colonias y Castras de Diana'}</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
                      {planets
                        .filter(p => p.id !== currentPlanet?.id && !p.is_destroyed)
                        .sort((a, b) => {
                          // Sort by coords, then planet before moon
                          const coordA = a.galaxy * 100000 + a.solar_system * 100 + a.position;
                          const coordB = b.galaxy * 100000 + b.solar_system * 100 + b.position;
                          if (coordA !== coordB) return coordA - coordB;
                          return a.planet_type === 'planet' ? -1 : 1;
                        })
                        .map(p => {
                          const isMoon = p.planet_type === 'moon';
                          const pTargetType = isMoon ? 'moon' : 'planet';
                          const isSelected = target.galaxy === p.galaxy && 
                                           target.system === p.solar_system && 
                                           target.position === p.position &&
                                           targetType === pTargetType;
                          return (
                            <button
                              key={p.id}
                              onClick={() => {
                                setTarget({ galaxy: p.galaxy, system: p.solar_system, position: p.position });
                                setTargetType(pTargetType);
                                setMission('transport');
                              }}
                              className={`flex items-center gap-2 p-2 rounded-lg text-left transition-all ${
                                isSelected
                                  ? isMoon 
                                    ? 'bg-cyber-purple/20 border border-cyber-purple/50'
                                    : 'bg-cyber-green/20 border border-cyber-green/50'
                                  : 'bg-space-700/50 hover:bg-space-600 border border-transparent'
                              }`}
                            >
                              <span className="text-lg">{isMoon ? '🌙' : '🌍'}</span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-medium truncate ${
                                  isSelected 
                                    ? isMoon ? 'text-cyber-purple' : 'text-cyber-green' 
                                    : 'text-white'
                                }`}>
                                  {translatePlanetName(p.name)} {isMoon ? '(Castra de Diana)' : ''}
                                </p>
                                <p className="text-[10px] text-gray-500">
                                  [{p.galaxy}:{p.solar_system}:{p.position}] {isMoon ? '🌙' : '🌍'}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">{t.fleet.speed}</label>
                <input
                  type="range"
                  value={speedPercent}
                  onChange={(e) => setSpeedPercent(parseInt(e.target.value))}
                  className="w-full"
                  min={10}
                  max={100}
                  step={10}
                />
                <div className="flex justify-between text-sm text-gray-500">
                  <span>10%</span>
                  <span className="text-cyber-blue font-semibold">{speedPercent}%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm text-gray-400 mb-2">{t.fleet.missionType}</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
                {(['attack', 'transport', 'deploy', 'colonize', 'espionage', 'recycle', 'expedition', 'harvest'] as MissionType[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMission(m);
                      setProtectionWarning(null);
                      if (m === 'expedition') {
                        setTarget(prev => ({ ...prev, position: 16 }));
                      } else if (target.position === 16) {
                        setTarget(prev => ({ ...prev, position: 1 }));
                      }
                      if (m === 'harvest') {
                        setTargetType('moon');
                      }
                    }}
                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition-all ${
                      mission === m
                        ? 'bg-cyber-blue text-white'
                        : 'bg-space-700 text-gray-400 hover:bg-space-600'
                    }`}
                  >
                    {t.fleet[m as keyof typeof t.fleet]}
                  </button>
                ))}
              </div>
              {mission === 'harvest' && (
                <div className="mt-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <p className="text-sm text-purple-300">
                    {t.fleet.harvestInfo}
                  </p>
                </div>
              )}
              {mission === 'expedition' && (
                <div className="mt-3 space-y-2">
                  <div className="p-3 bg-cyber-yellow/10 border border-cyber-yellow/30 rounded-lg">
                    <p className="text-sm text-cyber-yellow">
                      {t.fleet.expeditionInfo}
                    </p>
                  </div>
                  <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Rocket className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-cyan-400">
                        {t.fleet.expeditionSlots}
                      </span>
                    </div>
                    <p className="text-sm text-cyan-300">
                      {activeExpeditions} / {maxExpeditions} {t.fleet.activeExpeditionPlural}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {t.fleet.astrophysicsLevel}: {astrophysicsLevel} — max {maxExpeditions} {t.fleet.simultaneousExpeditions}
                    </p>
                    {activeExpeditions >= maxExpeditions && (
                      <p className="text-xs text-cyber-yellow mt-1">
                        ⚠️ {t.fleet.maxExpeditionsReached}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {mission === 'colonize' && (
                <div className="mt-3 p-3 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
                  <p className="text-sm text-cyber-green">
                    {t.fleet.colonizeInfo}
                  </p>
                </div>
              )}
              {mission === 'recycle' && (
                <div className="mt-3 p-3 bg-cyber-orange/10 border border-cyber-orange/30 rounded-lg">
                  <p className="text-sm text-cyber-orange">
                    {t.fleet.recycleInfo}
                  </p>
                </div>
              )}
              {mission === 'transport' && (
                <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-sm text-amber-400">
                    {t.fleet.transportInfo}
                  </p>
                </div>
              )}
              {mission === 'deploy' && (
                <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <p className="text-sm text-indigo-400">
                      {t.fleet.deployInfo}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Warning: same origin */}
            {isSameOrigin && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/40 rounded-lg flex items-start gap-3 animate-pulse">
                <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-400">⚠️ {t.fleet.cannotSendToSameLocation}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mt-6 p-4 bg-space-700/50 rounded-lg">
              <div className="text-center">
                <p className="text-sm text-gray-400">{t.fleet.distance}</p>
                <p className="font-orbitron text-white">{formatNumber(distance)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-400">{t.fleet.flightTime}</p>
                <p className="font-orbitron text-cyber-blue">{formatTime(flightTime)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-400">{t.fleet.consumption}</p>
                <p className="font-orbitron text-cyber-green">{formatNumber(fuelConsumption)} D</p>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(1)} className="btn-secondary">
                {t.common.back}
              </button>
              <button
                onClick={handleGoToStep3}
                disabled={checkingProtection || isSameOrigin}
                className="btn-cyber flex items-center gap-2 disabled:opacity-50"
              >
                {checkingProtection ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
                {t.common.continue}
              </button>
            </div>

            {protectionWarning && ['attack', 'destroy'].includes(mission) && (
              <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-400">{t.galaxy.protectedPlayer}</p>
                  <p className="text-sm text-amber-300/80 mt-1">{protectionWarning}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 className="font-orbitron text-lg text-white mb-4">{t.fleet.cargoAndConfirmation}</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t.resources.metal}</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={cargo.metal}
                    onChange={(e) =>
                      setCargo((prev) => ({ ...prev, metal: parseInt(e.target.value) || 0 }))
                    }
                    className="input-cyber flex-1"
                    min={0}
                  />
                  <button
                    onClick={() => {
                      const reserve = 500;
                      const remaining = totalCargoCapacity - cargo.crystal - cargo.deuterium;
                      const available = Math.max(0, (resources?.metal || 0) - reserve);
                      const maxMetal = Math.floor(Math.min(available, Math.max(0, remaining)));
                      setCargo((prev) => ({ ...prev, metal: maxMetal }));
                    }}
                    className="px-3 py-2 bg-space-600 hover:bg-space-500 text-cyber-blue font-semibold rounded-lg transition-colors text-sm"
                  >
                    {t.fleet.max}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t.resources.crystal}</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={cargo.crystal}
                    onChange={(e) =>
                      setCargo((prev) => ({ ...prev, crystal: parseInt(e.target.value) || 0 }))
                    }
                    className="input-cyber flex-1"
                    min={0}
                  />
                  <button
                    onClick={() => {
                      const reserve = 500;
                      const remaining = totalCargoCapacity - cargo.metal - cargo.deuterium;
                      const available = Math.max(0, (resources?.crystal || 0) - reserve);
                      const maxCrystal = Math.floor(Math.min(available, Math.max(0, remaining)));
                      setCargo((prev) => ({ ...prev, crystal: maxCrystal }));
                    }}
                    className="px-3 py-2 bg-space-600 hover:bg-space-500 text-cyber-blue font-semibold rounded-lg transition-colors text-sm"
                  >
                    {t.fleet.max}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">{t.resources.deuterium}</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={cargo.deuterium}
                    onChange={(e) =>
                      setCargo((prev) => ({ ...prev, deuterium: parseInt(e.target.value) || 0 }))
                    }
                    className="input-cyber flex-1"
                    min={0}
                  />
                  <button
                    onClick={() => {
                      const reserve = 500;
                      const remaining = totalCargoCapacity - cargo.metal - cargo.crystal;
                      const availableDeut = Math.max(0, (resources?.deuterium || 0) - fuelConsumption - reserve);
                      const maxDeut = Math.floor(Math.min(availableDeut, Math.max(0, remaining)));
                      setCargo((prev) => ({ ...prev, deuterium: Math.max(0, maxDeut) }));
                    }}
                    className="px-3 py-2 bg-space-600 hover:bg-space-500 text-cyber-blue font-semibold rounded-lg transition-colors text-sm"
                  >
                    {t.fleet.max}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  const reserve = 500;
                  const metalAvail = Math.max(0, (resources?.metal || 0) - reserve);
                  const crystalAvail = Math.max(0, (resources?.crystal || 0) - reserve);
                  const deutAvail = Math.max(0, (resources?.deuterium || 0) - fuelConsumption - reserve);
                  const totalAvailable = metalAvail + crystalAvail + deutAvail;
                  const capacity = totalCargoCapacity;

                  if (totalAvailable <= capacity) {
                    setCargo({
                      metal: Math.floor(metalAvail),
                      crystal: Math.floor(crystalAvail),
                      deuterium: Math.floor(deutAvail),
                    });
                  } else {
                    const ratio = capacity / totalAvailable;
                    setCargo({
                      metal: Math.floor(metalAvail * ratio),
                      crystal: Math.floor(crystalAvail * ratio),
                      deuterium: Math.floor(deutAvail * ratio),
                    });
                  }
                }}
                className="px-4 py-2 bg-cyber-blue/20 hover:bg-cyber-blue/30 text-cyber-blue font-semibold rounded-lg transition-colors border border-cyber-blue/30"
              >
                {t.fleet.maxShips} {t.fleet.resources}
              </button>
              <button
                onClick={() => setCargo({ metal: 0, crystal: 0, deuterium: 0 })}
                className="px-4 py-2 bg-space-600 hover:bg-space-500 text-gray-300 font-semibold rounded-lg transition-colors"
              >
                {t.common.none}
              </button>
            </div>

            <div className="p-4 bg-space-700/50 rounded-lg mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-5 h-5 text-cyber-blue" />
                <span className="text-gray-400">{t.fleet.cargoCapacity}:</span>
                <span className="font-orbitron text-white">
                  {formatNumber(cargo.metal + cargo.crystal + cargo.deuterium)} /{' '}
                  {formatNumber(totalCargoCapacity)}
                </span>
              </div>
            </div>

            <div className="card-glass p-4 mb-6">
              <h4 className="font-semibold text-white mb-3">{t.fleet.missionSummary}</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">{t.fleet.destination}:</span>
                  <span className="text-white ml-2">
                    {formatCoordinates(target.galaxy, target.system, target.position)}
                    {targetType === 'moon' && <span className="ml-1.5 text-gray-300">🌙 Castra de Diana</span>}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">{t.fleet.mission}:</span>
                  <span className="text-white ml-2 capitalize">{t.fleet[mission as keyof typeof t.fleet]}</span>
                </div>
                <div>
                  <span className="text-gray-400">{t.fleet.time}:</span>
                  <span className="text-cyber-blue ml-2">{formatTime(flightTime)}</span>
                </div>
                <div>
                  <span className="text-gray-400">{t.fleet.fuel}:</span>
                  <span className={`ml-2 ${hasEnoughFuel ? 'text-cyber-green' : 'text-cyber-red'}`}>
                    {formatNumber(fuelConsumption)} D
                  </span>
                </div>
              </div>
              {resources && (
                <div className="mt-4 pt-4 border-t border-space-600">
                  <div className="text-xs text-gray-400">
                    {t.fleet.deuteriumAvailable}: {formatNumber(resources.deuterium)} | {t.fleet.deuteriumNeeded}: {formatNumber(totalDeuteriumNeeded)}
                  </div>
                  {!canSendFleet && hasSelectedShips && (
                    <div className="mt-2 text-xs text-cyber-yellow space-y-1">
                      <div>Debug: Slots:{hasAvailableFleetSlot?'OK':'NO'}({activeFleetCount}/{maxFleetSlots}) Pos:{isValidTargetPosition?'OK':'NO'} Ships:{hasRequiredShips?'OK':'NO'} Cargo:{cargoWithinLimit?'OK':'NO'} Fuel:{hasEnoughFuel?'OK':'NO'} Res:{hasEnoughResources?'OK':'NO'}</div>
                      <div>Raw: fuel={fuelConsumption} deut={resources.deuterium} needed={totalDeuteriumNeeded} speed={slowestSpeed}</div>
                    </div>
                  )}
                </div>
              )}
              {mission === 'expedition' && (
                <div className="mt-4 pt-4 border-t border-cyan-500/30">
                  <div className="flex items-center justify-between">
                    <span className="text-cyan-400 text-sm font-semibold">
                      {t.fleet.expeditionSlots}
                    </span>
                    <span className={`font-bold ${activeExpeditions >= maxExpeditions ? 'text-cyber-red' : 'text-cyan-300'}`}>
                      {activeExpeditions} / {maxExpeditions}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {fleetError && (
              <div className="flex items-center gap-2 p-3 mb-6 bg-cyber-red/20 border border-cyber-red/50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-cyber-red" />
                <span className="text-cyber-red text-sm">{fleetError}</span>
              </div>
            )}

            {!canSendFleet && hasSelectedShips && !fleetError && (
              <div className="flex items-center gap-2 p-3 mb-6 bg-cyber-red/20 border border-cyber-red/50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-cyber-red" />
                <span className="text-cyber-red text-sm">
                  {!hasAvailableFleetSlot
                    ? `${t.fleet.noFleetSlots} (${activeFleetCount}/${maxFleetSlots})`
                    : !isValidTargetPosition
                    ? mission === 'expedition'
                      ? t.fleet.expeditionsMustGoToPosition16
                      : t.fleet.position16OnlyForExpeditions
                    : !hasRequiredShips
                    ? getMissingShipMessage()
                    : !escortCheck.valid
                    ? escortCheck.message
                    : !cargoWithinLimit
                    ? t.fleet.cargoExceedsCapacity
                    : !hasEnoughFuel
                    ? `${t.fleet.insufficientDeuterium} (${formatNumber(resources?.deuterium || 0)} < ${formatNumber(totalDeuteriumNeeded)})`
                    : !hasEnoughResources
                    ? `${t.fleet.insufficientResources} (M:${formatNumber(resources?.metal || 0)}/${formatNumber(cargo.metal)}, C:${formatNumber(resources?.crystal || 0)}/${formatNumber(cargo.crystal)})`
                    : !resources
                    ? t.fleet.errorResourcesNotLoaded
                    : t.fleet.cannotSendFleet}
                </span>
              </div>
            )}

            {['attack', 'destroy'].includes(mission) && <PeaceShieldAttackWarning />}

            {heroAccess && heroTargetAllowed && heroInfo && (
              <label
                className={`flex items-center gap-3 p-3 mb-6 rounded-lg border ${
                  heroBlockReason ? 'border-slate-600/40 bg-slate-800/40 cursor-not-allowed' : 'border-amber-400/40 bg-amber-500/10 cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-amber-400"
                  checked={sendWithHero}
                  disabled={!!heroBlockReason || sendingFleet}
                  onChange={(e) => setWithHero(e.target.checked)}
                />
                <Swords className="w-5 h-5 text-amber-300" />
                <span className="text-sm">
                  <span className="text-amber-200 font-semibold">
                    Llevar al Héroe (Nv {heroInfo.level}, HP {Math.round(heroInfo.hp)}/{heroInfo.hp_max})
                  </span>
                  <span className="block text-xs text-gray-400">
                    {heroBlockReason ?? 'Lucha como una unidad más. Si cae a 0 HP queda herido, no muere. Gana XP con las bajas enemigas.'}
                  </span>
                </span>
              </label>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="btn-secondary" disabled={sendingFleet}>
                {t.common.back}
              </button>
              <button
                onClick={handleSendFleet}
                disabled={!canSendFleet || sendingFleet}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                  canSendFleet && !sendingFleet
                    ? 'bg-cyber-blue hover:bg-cyber-blue/80 text-white'
                    : 'bg-space-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {sendingFleet ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t.fleet.sending}
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    {t.fleet.sendFleet}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {acsJoinModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-space-800 border border-cyber-blue/30 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-orbitron text-lg text-cyber-blue flex items-center gap-2">
                  <Swords className="w-5 h-5" />
                  {t.fleet.joinAcs} {acsJoinModal.name}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {t.fleet.target} <span className="text-cyber-blue">{acsJoinModal.target_coords}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setAcsJoinModal(null);
                  setAcsJoinShips({});
                  setAcsJoinMessage(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">{t.fleet.selectShipsForAttack}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto pr-1">
                {shipTypes
                  .filter((st) => getShipQuantity(st.id) > 0 && st.base_speed > 0)
                  .map((shipType) => {
                    const available = getShipQuantity(shipType.id);
                    const selected = acsJoinShips[shipType.id] || 0;
                    const shipImage = getShipImage(shipType.code, shipType.image_url);

                    return (
                      <div
                        key={shipType.id}
                        className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${
                          selected > 0
                            ? 'border-cyber-blue/50 bg-cyber-blue/10'
                            : 'border-space-600 bg-space-700/50 hover:border-space-500'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-space-800 flex-shrink-0">
                          {shipImage ? (
                            <GameMedia src={shipImage} alt={translateShipName(t, shipType.code, shipType.name)} className={`w-full h-full ${shipImage.startsWith('/Imagenes/Barraca/') ? 'object-contain p-1' : 'object-cover'}`} />
                          ) : (
                            <ShipIcon shipCode={shipType.code} className="w-full h-full p-1" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{translateShipName(t, shipType.code, shipType.name)}</p>
                          <p className="text-xs text-gray-500">{t.fleet.available} {formatNumber(available)}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <input
                            type="number"
                            value={selected}
                            onChange={(e) => {
                              const val = Math.min(available, Math.max(0, parseInt(e.target.value) || 0));
                              setAcsJoinShips(prev => ({ ...prev, [shipType.id]: val }));
                            }}
                            className="w-16 px-2 py-1 bg-space-800 border border-space-600 rounded text-center text-white text-sm font-orbitron"
                            min={0}
                            max={available}
                          />
                          <button
                            onClick={() => setAcsJoinShips(prev => ({ ...prev, [shipType.id]: selected > 0 ? 0 : available }))}
                            className={`px-2 py-1 text-xs rounded font-semibold transition-colors ${
                              selected > 0
                                ? 'bg-cyber-red/20 text-cyber-red hover:bg-cyber-red/30'
                                : 'bg-cyber-blue/20 text-cyber-blue hover:bg-cyber-blue/30'
                            }`}
                          >
                            {selected > 0 ? 'X' : t.fleet.max}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
              {shipTypes.filter(st => getShipQuantity(st.id) > 0 && st.base_speed > 0).length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  <Rocket className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t.fleet.noShipsAvailable}</p>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">{t.fleet.speed}: {acsJoinSpeed}%</label>
              <input
                type="range"
                value={acsJoinSpeed}
                onChange={(e) => setAcsJoinSpeed(parseInt(e.target.value))}
                className="w-full"
                min={10}
                max={100}
                step={10}
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>10%</span>
                <span>100%</span>
              </div>
            </div>

            {(() => {
              const acsShipEntries = Object.entries(acsJoinShips).filter(([, qty]) => qty > 0);
              if (acsShipEntries.length === 0) return null;

              const acsDistance = currentPlanet
                ? calculateDistance(
                    currentPlanet.galaxy, currentPlanet.solar_system, currentPlanet.position,
                    acsJoinModal.target_galaxy, acsJoinModal.target_system, acsJoinModal.target_position
                  )
                : 0;

              const acsSlowest = acsShipEntries.reduce((slowest, [shipTypeId, qty]) => {
                if (qty <= 0) return slowest;
                const st = shipTypes.find(s => s.id === parseInt(shipTypeId));
                if (!st) return slowest;
                return Math.min(slowest, calculateShipSpeedWithBonus(st.code, st.base_speed, techLevels));
              }, Infinity);

              const acsFlightTime = acsSlowest !== Infinity ? calculateFlightTime(acsDistance, acsSlowest, acsJoinSpeed, admiralSpeedBonus, isPlus) : 0;

              const acsFuel = acsShipEntries.reduce((total, [shipTypeId, qty]) => {
                if (qty <= 0) return total;
                const st = shipTypes.find(s => s.id === parseInt(shipTypeId));
                if (!st) return total;
                return total + calculateFuelConsumption(acsDistance, st.fuel_consumption, qty, acsJoinSpeed);
              }, 0);

              const hasEnough = resources ? resources.deuterium >= acsFuel : false;

              return (
                <div className="grid grid-cols-3 gap-3 p-3 bg-space-700/50 rounded-lg mb-4 text-center">
                  <div>
                    <p className="text-xs text-gray-400">{t.fleet.distance}</p>
                    <p className="font-orbitron text-sm text-white">{formatNumber(acsDistance)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{t.fleet.flightTime}</p>
                    <p className="font-orbitron text-sm text-cyber-blue">{formatTime(acsFlightTime)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{t.fleet.fuel}</p>
                    <p className={`font-orbitron text-sm ${hasEnough ? 'text-cyber-green' : 'text-cyber-red'}`}>
                      {formatNumber(acsFuel)} D
                    </p>
                  </div>
                </div>
              );
            })()}

            {acsJoinMessage && (
              <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
                acsJoinMessage.type === 'success'
                  ? 'bg-cyber-green/20 border border-cyber-green/30 text-cyber-green'
                  : 'bg-cyber-red/20 border border-cyber-red/30 text-cyber-red'
              }`}>
                {acsJoinMessage.type === 'success' ? (
                  <UserPlus className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{acsJoinMessage.text}</span>
              </div>
            )}

            <div className="mb-4"><PeaceShieldAttackWarning /></div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setAcsJoinModal(null);
                  setAcsJoinShips({});
                  setAcsJoinMessage(null);
                }}
                className="flex-1 px-4 py-2 bg-space-700 hover:bg-space-600 text-gray-300 font-semibold rounded-lg transition-colors"
              >
                {t.fleet.cancelBtn}
              </button>
              <button
                onClick={handleJoinAcsWithFleet}
                disabled={joiningAcs || !Object.values(acsJoinShips).some(qty => qty > 0)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
                  joiningAcs || !Object.values(acsJoinShips).some(qty => qty > 0)
                    ? 'bg-space-700 text-gray-500 cursor-not-allowed'
                    : 'bg-cyber-blue hover:bg-cyber-blue/80 text-white'
                }`}
              >
                {joiningAcs ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t.fleet.sendingJoin}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {t.fleet.sendAndJoin}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {(accelerateModalFleet || accelerateAcsId) && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-space-800 border border-amber-500/30 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-orbitron text-lg text-amber-400 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                {accelerateAcsId ? `${t.fleet.accelerateFleet} (ACS)` : t.fleet.accelerateFleet}
              </h3>
              <button
                onClick={() => {
                  setAccelerateModalFleet(null);
                  setAccelerateAcsId(null);
                  setAccelerateMessage(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-300 text-sm mb-4">
              {accelerateAcsId
                ? 'Aceleras TODOS los ejércitos del ataque ACS. El costo es la suma de todos y lo pagas tu como creador. Solo se puede hacer una vez y despues nadie mas podra unirse.'
                : t.fleet.accelerateDesc}
            </p>

            <div className={`flex items-start gap-2 border rounded-lg p-3 mb-4 ${isPlus ? 'bg-cyber-green/10 border-cyber-green/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
              <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isPlus ? 'text-cyber-green' : 'text-amber-400'}`} />
              <p className={`text-xs ${isPlus ? 'text-cyber-green' : 'text-amber-300'}`}>
                {isPlus ? t.fleet.accelerateWarn100 : t.fleet.accelerateWarn90}
              </p>
            </div>

            <div className="bg-space-900/50 border border-amber-500/20 rounded-lg p-4 mb-4">
              {isLoadingCost ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                  <span className="text-gray-400">{t.fleet.calculatingCost}</span>
                </div>
              ) : accelerateCost > 0 && freeAccel ? (
                <p className="text-center font-orbitron text-2xl text-cyber-green">GRATIS</p>
              ) : accelerateCost > 0 ? (
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-1">{t.fleet.accelerationCost}</p>
                  <p className="font-orbitron text-2xl text-amber-400 flex items-center justify-center gap-2">
                    <Coins className="w-6 h-6" />
                    {formatNumber(accelerateCost)} TUNG
                  </p>
                  {profile && (
                    <p className={`text-xs mt-2 ${(profile.tung_balance || 0) >= accelerateCost ? 'text-gray-500' : 'text-cyber-red'}`}>
                      {t.fleet.yourBalance} {formatNumber(profile.tung_balance || 0)} TUNG
                      {(profile.tung_balance || 0) < accelerateCost && ` (${t.fleet.insufficient})`}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-center text-gray-500">
                  {t.fleet.fleetAboutToArrive}
                </p>
              )}
            </div>

            {accelerateMessage && (
              <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
                accelerateMessage.type === 'success'
                  ? 'bg-cyber-green/20 border border-cyber-green/30 text-cyber-green'
                  : 'bg-cyber-red/20 border border-cyber-red/30 text-cyber-red'
              }`}>
                {accelerateMessage.type === 'success' ? (
                  <Zap className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{accelerateMessage.text}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setAccelerateModalFleet(null);
                  setAccelerateAcsId(null);
                  setAccelerateMessage(null);
                }}
                className="flex-1 px-4 py-2 bg-space-700 hover:bg-space-600 text-gray-300 font-semibold rounded-lg transition-colors"
              >
                {t.fleet.cancelBtn}
              </button>
              <button
                onClick={accelerateAcsId ? handleAccelerateAcs : handleAccelerateFleet}
                disabled={isAccelerating || isLoadingCost || accelerateCost <= 0 || (!freeAccel && profile && (profile.tung_balance || 0) < accelerateCost)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
                  isAccelerating || isLoadingCost || accelerateCost <= 0 || (!freeAccel && profile && (profile.tung_balance || 0) < accelerateCost)
                    ? 'bg-space-700 text-gray-500 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                }`}
              >
                {isAccelerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t.fleet.accelerating}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    {t.fleet.accelerate}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {acsDetailModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setAcsDetailModal(null)}>
          <div className="bg-space-800 border border-space-600 rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-space-600">
              <div>
                <h3 className="text-white font-bold">{acsDetailModal.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{t.fleet.alliedFleetComposition}</p>
              </div>
              <button onClick={() => setAcsDetailModal(null)} className="p-1 hover:bg-space-700 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {loadingAcsDetails ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
                </div>
              ) : acsDetailData.length === 0 ? (
                <p className="text-center text-gray-500 py-6 text-sm">{t.fleet.noParticipantsYet}</p>
              ) : (
                acsDetailData.map((participant) => (
                  <div key={participant.user_id} className="bg-space-700/50 border border-space-600 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-cyber-blue" />
                      <span className="text-white font-semibold text-sm">{participant.username}</span>
                      {participant.is_creator && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-cyber-blue/20 text-cyber-blue rounded-full">{t.fleet.creator}</span>
                      )}
                    </div>
                    {participant.ships.length === 0 ? (
                      <p className="text-xs text-gray-500 ml-6">{t.fleet.noShipsInFleet}</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5 ml-6">
                        {participant.ships.map((ship) => (
                          <div key={ship.code} className="flex items-center gap-2 bg-space-800/60 rounded px-2 py-1.5">
                            <ShipIcon imageUrl={ship.image_url} name={ship.name} className="w-6 h-6" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-gray-300 truncate">{ship.name}</p>
                              <p className="text-xs text-cyber-blue font-semibold">{formatNumber(ship.quantity)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
