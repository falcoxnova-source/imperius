import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Map as MapIcon,
  ChevronLeft,
  ChevronRight,
  Globe,
  Moon,
  User,
  Search,
  Eye,
  Rocket,
  CheckCircle,
  Compass,
  Sparkles,
  Recycle,
  Target,
  X,
  Fuel,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Swords,
  AlertTriangle,
  Warehouse,
  Orbit,
  Radio,
  Mail,
  Flag,
  Package,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { SolarSystemView } from '../../components/game/SolarSystemView';
import { PeaceShieldAttackWarning } from '../../components/game/PeaceShieldWidget';
import { supabase } from '../../lib/supabase';
import { rpcWithRetry } from '../../lib/rpcWithRetry';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { formatCoordinates, formatTimeRemaining } from '../../lib/utils';
import { useI18n, translatePlanetName } from '../../lib/i18n';
import { BATTLESHIP_COORDS, CASINO_COORDS, SPORTS_COORDS } from '../../lib/casino';
import type { Planet, Profile } from '../../types/game';

interface DebrisField {
  metal: number;
  crystal: number;
}

interface ProtectionStatus {
  has_planet: boolean;
  is_own?: boolean;
  owner_username?: string;
  owner_points?: number;
  attacker_points?: number;
  protection_ratio?: number;
  noob_limit?: number;
  can_attack: boolean;
  can_spy: boolean;
  same_alliance?: boolean;
  protection_reason?: string;
  bashing_reason?: string;
}

interface GalaxySlot {
  position: number;
  planet?: Planet & { profile?: Profile };
  moon?: Planet;
  debris?: DebrisField;
  protection?: ProtectionStatus;
  fortress?: {
    owner_alliance_name: string | null;
    owner_alliance_tag: string | null;
    total_ships: number;
  };
  treasurePlanet?: {
    owner_alliance_name: string | null;
    owner_alliance_tag: string | null;
    total_ships: number;
  };
  occupation?: SystemOccupation;
}

// [OCUPA2] Ocupación visible en galaxia (get_system_occupations)
interface SystemOccupation {
  planet_id: string;
  position: number;
  occupier_name: string | null;
  is_mine: boolean;
  is_my_planet: boolean;
  occupation_id: string | null;
  started_at: string;
}

interface PhalanxFleet {
  id: string;
  mission: string;
  origin: string;
  destination: string;
  ships: { type: string; quantity: number }[];
  arrival_time: string;
  return_time: string | null;
  is_returning: boolean;
}

interface PhalanxResult {
  success: boolean;
  error?: string;
  reason?: string; // Legacy fallback for older function versions
  planet_name?: string;
  player?: string;
  coordinates?: string;
  fleets?: PhalanxFleet[];
  deuterium_used?: number;
  phalanx_level?: number;
  phalanx_range?: number;
}

interface UserMoonPhalanx {
  moon_id: string;
  moon_name: string;
  galaxy: number;
  solar_system: number;
  position: number;
  phalanx_level: number;
  phalanx_range: number;
  deuterium: number;
}

export function GalaxyPage() {
  const { t, language } = useI18n();
  const { currentPlanet, planets, ships, shipTypes, resources, defenses, defenseTypes, buildings, technologies, fetchResources, fetchShips, fetchFleets, fetchDefenses, selectPlanet } = useGameStore();
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const urlGalaxy = searchParams.get('galaxy');
  const urlSystem = searchParams.get('system');

  const [galaxy, setGalaxy] = useState(() => {
    if (urlGalaxy) {
      const parsed = parseInt(urlGalaxy);
      if (parsed >= 1 && parsed <= 5) return parsed;
    }
    return currentPlanet?.galaxy || 1;
  });
  const [system, setSystem] = useState(() => {
    if (urlSystem) {
      const parsed = parseInt(urlSystem);
      if (parsed >= 1 && parsed <= 499) return parsed;
    }
    return currentPlanet?.solar_system || 1;
  });
  const [slots, setSlots] = useState<GalaxySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [spyingPosition, setSpyingPosition] = useState<number | null>(null);
  const [spySuccess, setSpySuccess] = useState<number | null>(null);
  const [spyProbeCount, setSpyProbeCount] = useState<number>(() => {
    const saved = localStorage.getItem('spyProbeCount');
    return saved ? Math.max(1, Math.min(50, parseInt(saved) || 1)) : 1;
  });
  const [hoveredDebris, setHoveredDebris] = useState<number | null>(null);
  const [moonMenu, setMoonMenu] = useState<{ position: number; x: number; y: number; up: boolean } | null>(null);
  const [missileModal, setMissileModal] = useState<{ galaxy: number; system: number; position: number } | null>(null);
  const [missileCount, setMissileCount] = useState(1);
  const [launchingMissile, setLaunchingMissile] = useState(false);
  const [missileResult, setMissileResult] = useState<{
    missiles_launched: number;
    missiles_intercepted: number;
    missiles_effective: number;
    total_damage: number;
    destroyed_defenses: { name: string; code: string; quantity: number }[];
  } | null>(null);
  const [primaryTarget, setPrimaryTarget] = useState<string>('');
  const [deutCost, setDeutCost] = useState<{ cost: number; remaining: number } | null>(null);
  const [deutError, setDeutError] = useState<string | null>(null);
  const [allyDepotPlanets, setAllyDepotPlanets] = useState<Set<string>>(new Set());
  const [userAlliances, setUserAlliances] = useState<Record<string, { tag: string; name: string }>>({});
  const [showSolarView, setShowSolarView] = useState(false); // Default: vista lista/tabla. Usuario puede activar vista orbital.
  const deutCostTimer = useRef<ReturnType<typeof setTimeout>>();
  const isInitialLoad = useRef(true);

  // Phalanx state
  const [userMoonsPhalanx, setUserMoonsPhalanx] = useState<UserMoonPhalanx[]>([]);
  const [phalanxModal, setPhalanxModal] = useState<{ galaxy: number; system: number; position: number } | null>(null);
  const [phalanxResult, setPhalanxResult] = useState<PhalanxResult | null>(null);
  const [phalanxLoading, setPhalanxLoading] = useState(false);
  const [phalanxSelectedMoon, setPhalanxSelectedMoon] = useState<string>('');
  const [, setPhalanxTick] = useState(0);

  // Live countdown for Phalanx results
  useEffect(() => {
    if (!phalanxResult?.success || !phalanxResult?.fleets?.length) return;
    const interval = setInterval(() => setPhalanxTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [phalanxResult]);

  useEffect(() => {
    if (urlGalaxy) {
      const parsed = parseInt(urlGalaxy);
      if (parsed >= 1 && parsed <= 5 && parsed !== galaxy) {
        setGalaxy(parsed);
      }
    }
    if (urlSystem) {
      const parsed = parseInt(urlSystem);
      if (parsed >= 1 && parsed <= 499 && parsed !== system) {
        setSystem(parsed);
      }
    }
  }, [urlGalaxy, urlSystem]);

  // Fetch user's moons with Sensor Phalanx on mount
  useEffect(() => {
    const fetchUserMoons = async () => {
      if (!profile) return;
      try {
        // Get all user moons
        const { data: moons, error: moonError } = await supabase
          .from('planets')
          .select('id, name, galaxy, solar_system, position')
          .eq('user_id', profile.id)
          .eq('planet_type', 'moon');

        if (moonError || !moons || moons.length === 0) {
          setUserMoonsPhalanx([]);
          return;
        }

        // Get sensor_phalanx building type id
        const { data: btData } = await supabase
          .from('building_types')
          .select('id')
          .eq('code', 'sensor_phalanx')
          .single();

        if (!btData) {
          setUserMoonsPhalanx([]);
          return;
        }

        // Get phalanx levels for all user moons
        const { data: phalanxBuildings } = await supabase
          .from('planet_buildings')
          .select('planet_id, level')
          .eq('building_type_id', btData.id)
          .in('planet_id', moons.map(m => m.id))
          .gt('level', 0);

        const phalanxMap = new Map<string, number>();
        (phalanxBuildings || []).forEach(pb => {
          phalanxMap.set(pb.planet_id, pb.level);
        });

        // Fetch deuterium for phalanx moons
        const phalanxMoonIds = moons.filter(m => phalanxMap.has(m.id)).map(m => m.id);
        const deutMap = new Map<string, number>();
        if (phalanxMoonIds.length > 0) {
          const { data: resData } = await supabase
            .from('planet_resources')
            .select('planet_id, deuterium')
            .in('planet_id', phalanxMoonIds);
          (resData || []).forEach(r => deutMap.set(r.planet_id, r.deuterium || 0));
        }

        const result: UserMoonPhalanx[] = moons
          .filter(m => phalanxMap.has(m.id))
          .map(m => {
            const level = phalanxMap.get(m.id) || 0;
            return {
              moon_id: m.id,
              moon_name: m.name,
              galaxy: m.galaxy,
              solar_system: m.solar_system,
              position: m.position,
              phalanx_level: level,
              phalanx_range: (level * level) - 1,
              deuterium: Math.floor(deutMap.get(m.id) || 0),
            };
          });

        setUserMoonsPhalanx(result);
      } catch (err) {
        console.error('Error fetching user phalanx moons:', err);
      }
    };

    fetchUserMoons();
  }, [profile]);

  // Get available phalanx moons that can scan a given target
  const getPhalanxMoonsInRange = useCallback((targetGalaxy: number, targetSystem: number): UserMoonPhalanx[] => {
    return userMoonsPhalanx.filter(m => {
      if (m.galaxy !== targetGalaxy) return false; // Same galaxy only
      const distance = Math.abs(m.solar_system - targetSystem);
      return distance <= m.phalanx_range;
    });
  }, [userMoonsPhalanx]);

  const handlePhalanxClick = (targetGalaxy: number, targetSystem: number, targetPosition: number) => {
    if (userMoonsPhalanx.length === 0) return;

    const moonsInRange = getPhalanxMoonsInRange(targetGalaxy, targetSystem);
    if (moonsInRange.length === 0) {
      // Find closest phalanx moon in same galaxy for helpful message
      const sameGalaxyMoons = userMoonsPhalanx.filter(m => m.galaxy === targetGalaxy);
      if (sameGalaxyMoons.length === 0) {
        alert(`${t.galaxy.phalanxOutOfRange}: ${t.galaxy.phalanxNoMoon} en continente ${targetGalaxy}`);
      } else {
        const closest = sameGalaxyMoons.reduce((best, m) => {
          const dist = Math.abs(m.solar_system - targetSystem);
          const bestDist = Math.abs(best.solar_system - targetSystem);
          return dist < bestDist ? m : best;
        });
        const dist = Math.abs(closest.solar_system - targetSystem);
        alert(`${t.galaxy.phalanxOutOfRange}\n\n🌙 ${closest.moon_name} [${closest.galaxy}:${closest.solar_system}:${closest.position}]\n📡 ${t.galaxy.phalanxTitle} ${t.common.level} ${closest.phalanx_level} — ${t.galaxy.phalanxRange}: ${closest.phalanx_range} ${t.galaxy.phalanxSystems}\n📏 ${t.galaxy.phalanxDistance}: ${dist} ${t.galaxy.phalanxSystems}`);
      }
      return;
    }
    setPhalanxResult(null);
    setPhalanxSelectedMoon(moonsInRange[0].moon_id);
    setPhalanxModal({ galaxy: targetGalaxy, system: targetSystem, position: targetPosition });
  };

  const handlePhalanxScan = async () => {
    if (!phalanxModal || !phalanxSelectedMoon) return;

    setPhalanxLoading(true);
    try {
      const { data, error } = await supabase.rpc('phalanx_scan', {
        p_moon_id: phalanxSelectedMoon,
        p_target_galaxy: phalanxModal.galaxy,
        p_target_system: phalanxModal.system,
        p_target_position: phalanxModal.position,
      });

      if (error) throw error;
      setPhalanxResult(data as PhalanxResult);

      // Refresh resources on the moon after deut deduction
      if (data?.success) {
        await fetchResources(currentPlanet?.id || '');
      }
    } catch (error: any) {
      console.error('Error scanning phalanx:', error);
      setPhalanxResult({ success: false, error: error.message || 'Error scanning' });
    } finally {
      setPhalanxLoading(false);
    }
  };

  const formatPhalanxTime = (isoTime: string): string => {
    try {
      const end = new Date(isoTime).getTime();
      const now = Date.now();
      if (end <= now) return '00:00:00';
      return formatTimeRemaining(isoTime);
    } catch {
      return isoTime;
    }
  };

  const getMissionName = (mission: string): string => {
    const missionNames: Record<string, string> = {
      attack: '⚔️ Ataque',
      transport: '📦 Transporte',
      deploy: '🚀 Estacionar',
      espionage: '🔍 Espionaje',
      colonize: '🌍 Colonizar',
      expedition: '🧭 Expedición',
      recycle: '♻️ Reciclar',
      destroy: '💥 Destruir',
      acs_attack: '⚔️ ACS Ataque',
      missile: '🎯 Misil',
    };
    return missionNames[mission] || mission;
  };

  const handlePlanetClick = async (slot: GalaxySlot) => {
    if (!slot.planet || !profile) return;

    const isOwnPlanet = slot.planet.user_id === profile.id;
    if (!isOwnPlanet) return;
    // [OCUPA2] Colonia ocupada: el dueño no puede entrar hasta recuperarla
    if (slot.occupation?.is_my_planet) return;

    const ownPlanet = planets.find(
      (p) => p.galaxy === galaxy && p.solar_system === system && p.position === slot.position
    );

    if (ownPlanet) {
      await selectPlanet(ownPlanet.id);
      navigate('/game');
    }
  };

  useEffect(() => {
    loadGalaxyView();
  }, [galaxy, system]);

  const handleAttack = (targetGalaxy: number, targetSystem: number, targetPosition: number, isMoon = false) => {
    navigate(`/game/fleet?galaxy=${targetGalaxy}&system=${targetSystem}&position=${targetPosition}&mission=attack${isMoon ? '&target=moon' : ''}`);
  };

  const handleRecycle = (targetGalaxy: number, targetSystem: number, targetPosition: number) => {
    navigate(`/game/fleet?galaxy=${targetGalaxy}&system=${targetSystem}&position=${targetPosition}&mission=recycle`);
  };

  const handleExpedition = (targetGalaxy: number, targetSystem: number) => {
    navigate(`/game/fleet?galaxy=${targetGalaxy}&system=${targetSystem}&position=16&mission=expedition`);
  };

  const handleColonize = (targetGalaxy: number, targetSystem: number, targetPosition: number) => {
    navigate(`/game/fleet?galaxy=${targetGalaxy}&system=${targetSystem}&position=${targetPosition}&mission=colonize`);
  };

  const handleDeploy = (targetGalaxy: number, targetSystem: number, targetPosition: number, isMoon = false) => {
    navigate(`/game/fleet?galaxy=${targetGalaxy}&system=${targetSystem}&position=${targetPosition}&mission=deploy${isMoon ? '&target=moon' : ''}`);
  };

  const handleTransport = (targetGalaxy: number, targetSystem: number, targetPosition: number, isMoon = false) => {
    navigate(`/game/fleet?galaxy=${targetGalaxy}&system=${targetSystem}&position=${targetPosition}&mission=transport${isMoon ? '&target=moon' : ''}`);
  };

  const handleSpy = async (targetGalaxy: number, targetSystem: number, targetPosition: number, targetType: 'planet' | 'moon' = 'planet') => {
    if (!currentPlanet || !profile || !resources) return;

    const spyProbeType = shipTypes.find(st => st.code === 'espionage_probe');
    if (!spyProbeType) return;

    const spyProbe = ships.find(s => s.ship_type_id === spyProbeType.id);
    if (!spyProbe || spyProbe.quantity < 1) {
      alert(t.galaxy.noSpyProbes);
      return;
    }

    // Use configured probe count, capped by available probes
    const probesAvailable = spyProbe.quantity;
    const probesToSend = Math.min(spyProbeCount, probesAvailable);

    setSpyingPosition(targetPosition);

    try {
      const fleetShips = [{ ship_type_id: spyProbeType.id, quantity: probesToSend }];

      const { data, error } = await rpcWithRetry<{ success: boolean; error?: string }>(
        'secure_send_fleet',
        {
          p_origin_planet_id: currentPlanet.id,
          p_target_galaxy: targetGalaxy,
          p_target_system: targetSystem,
          p_target_position: targetPosition,
          p_mission_type: 'espionage',
          p_fleet_ships: fleetShips,
          p_speed_percent: 100,
          p_cargo_metal: 0,
          p_cargo_crystal: 0,
          p_cargo_deuterium: 0,
          p_target_type: targetType,
        }
      );

      if (error) throw error;

      if (data && !data.success) {
        alert(data.error || 'Error sending spy probe');
        setSpyingPosition(null);
        return;
      }

      await fetchResources(currentPlanet.id);
      await fetchShips(currentPlanet.id);
      await fetchFleets(profile.id);

      setSpySuccess(targetPosition);
      setTimeout(() => setSpySuccess(null), 2000);
    } catch (error) {
      console.error('Error sending spy probe:', error);
      alert('Error sending spy probe');
    } finally {
      setSpyingPosition(null);
    }
  };

  const getSiloLevel = (): number => {
    const silo = buildings.find(b => b.building_type?.code === 'missile_silo');
    return silo?.level || 0;
  };

  const getImpulseDriveLevel = (): number => {
    const tech = technologies.find(t => t.technology_type?.code === 'impulse_drive');
    return tech?.level || 0;
  };

  const getMissileMaxRange = (): number => {
    const impulseLevel = getImpulseDriveLevel();
    if (impulseLevel < 1) return 0;
    return (impulseLevel * 5) - 1;
  };

  const handleMissileClick = (targetGalaxy: number, targetSystem: number, targetPosition: number) => {
    if (!currentPlanet || !defenses) return;

    const missileDefense = defenses.find(d => d.defense_type?.code === 'interplanetary_missile');
    if (!missileDefense || missileDefense.quantity < 1) {
      alert(t.galaxy.noMissiles);
      return;
    }

    const siloLevel = getSiloLevel();
    if (siloLevel < 4) {
      alert(t.galaxy.noSilo);
      return;
    }

    const impulseLevel = getImpulseDriveLevel();
    if (impulseLevel < 1) {
      alert(t.galaxy.noImpulseDrive || 'Necesitas Motor de Impulso nivel 1 para lanzar misiles');
      return;
    }

    if (currentPlanet.galaxy !== targetGalaxy) {
      alert(t.galaxy.missileSameGalaxy);
      return;
    }

    const systemDistance = Math.abs(currentPlanet.solar_system - targetSystem);
    const maxRange = getMissileMaxRange();

    if (systemDistance > maxRange) {
      alert(`${t.galaxy.missileTooFar} (${t.galaxy.maxRange}: ${maxRange} ${t.galaxy.solarSystems})`);
      return;
    }

    setMissileCount(1);
    setMissileResult(null);
    setPrimaryTarget('');
    setMissileModal({ galaxy: targetGalaxy, system: targetSystem, position: targetPosition });
  };

  const handleLaunchMissile = async () => {
    if (!missileModal || !currentPlanet || !profile) return;

    setLaunchingMissile(true);
    try {
      const { data, error } = await supabase.rpc('launch_missiles', {
        p_origin_planet_id: currentPlanet.id,
        p_target_galaxy: missileModal.galaxy,
        p_target_system: missileModal.system,
        p_target_position: missileModal.position,
        p_missile_count: missileCount,
        p_primary_target: primaryTarget || null,
      });

      if (error) throw error;

      if (data && data.success) {
        setMissileResult({
          missiles_launched: data.missiles_launched,
          missiles_intercepted: data.missiles_intercepted,
          missiles_effective: data.missiles_effective,
          total_damage: data.total_damage,
          destroyed_defenses: data.destroyed_defenses || [],
        });
        await fetchDefenses(currentPlanet.id);
      } else {
        alert(data?.error || 'Error launching missiles');
      }
    } catch (error) {
      console.error('Error launching missiles:', error);
      alert('Error launching missiles');
    } finally {
      setLaunchingMissile(false);
    }
  };

  const chargeNavigation = useCallback(async (targetGalaxy: number, targetSystem: number): Promise<boolean> => {
    if (!currentPlanet) return true;
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return true;
    }

    try {
      const { data, error } = await supabase.rpc('galaxy_navigate', {
        p_planet_id: currentPlanet.id,
        p_target_galaxy: targetGalaxy,
        p_target_system: targetSystem,
      });

      if (error) throw error;

      if (data && !data.success) {
        const errorMsg = data.required
          ? `${data.error} (${Math.ceil(data.required).toLocaleString()} ${t.resources.deuterium})`
          : data.error;
        setDeutError(errorMsg);
        setTimeout(() => setDeutError(null), 4000);
        return false;
      }

      if (data && data.cost > 0) {
        if (deutCostTimer.current) clearTimeout(deutCostTimer.current);
        setDeutCost({ cost: data.cost, remaining: Math.floor(data.remaining_deuterium) });
        deutCostTimer.current = setTimeout(() => setDeutCost(null), 3500);
        await fetchResources(currentPlanet.id);
      }

      return true;
    } catch (err) {
      console.error('Error charging navigation:', err);
      return true;
    }
  }, [currentPlanet, fetchResources]);

  const loadGalaxyView = useCallback(async (targetGalaxy?: number, targetSystem?: number) => {
    const g = targetGalaxy ?? galaxy;
    const s = targetSystem ?? system;

    setLoading(true);
    try {
      const canNavigate = await chargeNavigation(g, s);
      if (!canNavigate) {
        setLoading(false);
        return;
      }

      const [planetsResult, debrisResult, fortressResult, treasurePlanetResult, occupationsResult] = await Promise.all([
        supabase
          .from('planets')
          .select('*, profile:profiles(*)')
          .eq('galaxy', g)
          .eq('solar_system', s)
          .order('position'),
        supabase
          .from('debris_fields')
          .select('position, metal, crystal')
          .eq('galaxy', g)
          .eq('solar_system', s),
        // Fetch fortress for this galaxy (always at system 250, position 8)
        supabase.rpc('get_fortress_info', { p_galaxy: g }),
        // Fetch treasure planet for this galaxy (always at system 250, position 9)
        supabase.rpc('get_treasure_planet_info', { p_galaxy: g }),
        supabase.rpc('get_system_occupations', { p_galaxy: g, p_system: s }),
      ]);

      if (planetsResult.error) {
        console.error('Error fetching planets:', planetsResult.error);
      }
      if (debrisResult.error) {
        console.error('Error fetching debris:', debrisResult.error);
      }

      const planetsData = planetsResult.data || [];
      const debrisFields = debrisResult.data || [];
      const systemOccupations: SystemOccupation[] =
        !occupationsResult.error && occupationsResult.data?.success
          ? (occupationsResult.data.occupations as SystemOccupation[]) || []
          : [];

      const newSlots: GalaxySlot[] = [];
      for (let pos = 1; pos <= 15; pos++) {
        const planet = planetsData.find(
          (p) => p.position === pos && p.planet_type === 'planet'
        );
        const moon = planetsData.find(
          (p) => p.position === pos && p.planet_type === 'moon'
        );
        const debris = debrisFields.find((d) => d.position === pos);
        const debrisMetal = debris ? Number(debris.metal) : 0;
        const debrisCrystal = debris ? Number(debris.crystal) : 0;

        newSlots.push({
          position: pos,
          planet: planet as (Planet & { profile?: Profile }) | undefined,
          moon: moon,
          debris: (debrisMetal > 0 || debrisCrystal > 0)
            ? { metal: debrisMetal, crystal: debrisCrystal }
            : undefined,
          occupation: planet
            ? systemOccupations.find((o) => o.planet_id === planet.id)
            : undefined,
        });
      }

      newSlots.push({ position: 16 });

      // Inject fortress data at system 250, position 8
      if (s === 250 && fortressResult?.data?.success) {
        const fortressData = fortressResult.data;
        const slotIndex = newSlots.findIndex(sl => sl.position === 8);
        if (slotIndex !== -1 && !newSlots[slotIndex].planet) {
          // Only show fortress if position 8 has no real planet
          newSlots[slotIndex] = {
            ...newSlots[slotIndex],
            fortress: {
              owner_alliance_name: fortressData.owner_alliance_name,
              owner_alliance_tag: fortressData.owner_alliance_tag,
              total_ships: fortressData.total_ships,
            },
          };
        }
      }

      // Inject treasure planet data at system 250, position 9 (aislado del sistema de Fortaleza)
      if (s === 250 && treasurePlanetResult?.data?.success) {
        const treasurePlanetData = treasurePlanetResult.data;
        const slotIndex = newSlots.findIndex(sl => sl.position === 9);
        if (slotIndex !== -1 && !newSlots[slotIndex].planet) {
          // Only show treasure planet if position 9 has no real planet
          newSlots[slotIndex] = {
            ...newSlots[slotIndex],
            treasurePlanet: {
              owner_alliance_name: treasurePlanetData.owner_alliance_name,
              owner_alliance_tag: treasurePlanetData.owner_alliance_tag,
              total_ships: treasurePlanetData.total_ships,
            },
          };
        }
      }

      const enemySlots = newSlots.filter(
        (slot) => slot.planet && slot.planet.user_id !== currentPlanet?.user_id
      );

      if (enemySlots.length > 0) {
        const protectionPromises = enemySlots.map((slot) =>
          supabase.rpc('check_protection_status', {
            p_target_galaxy: g,
            p_target_system: s,
            p_target_position: slot.position,
          })
        );

        const protectionResults = await Promise.all(protectionPromises);

        protectionResults.forEach((result, idx) => {
          if (result.data && !result.error) {
            const slotIndex = newSlots.findIndex(
              (sl) => sl.position === enemySlots[idx].position
            );
            if (slotIndex !== -1) {
              newSlots[slotIndex].protection = result.data as ProtectionStatus;
            }
          }
        });
      }

      setSlots(newSlots);

      // Fetch alliance info for all users in this system
      const userIds = [...new Set(planetsData.map((p) => p.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: allianceData } = await supabase
          .from('alliance_members')
          .select('user_id, alliance:alliances(tag, name)')
          .in('user_id', userIds);
        const allianceMap: Record<string, { tag: string; name: string }> = {};
        if (allianceData) {
          for (const am of allianceData as any[]) {
            if (am.alliance) {
              allianceMap[am.user_id] = { tag: am.alliance.tag, name: am.alliance.name };
            }
          }
        }
        setUserAlliances(allianceMap);
      } else {
        setUserAlliances({});
      }

      if (profile) {
        const otherPlanetIds = planetsData
          .filter((p) => p.user_id !== profile.id && p.planet_type === 'planet')
          .map((p) => p.id);

        if (otherPlanetIds.length > 0) {
          const { data: depotIds } = await supabase.rpc('get_ally_depot_planet_ids', {
            p_planet_ids: otherPlanetIds,
          });

          setAllyDepotPlanets(new Set(depotIds || []));
        } else {
          setAllyDepotPlanets(new Set());
        }
      }
    } catch (error) {
      console.error('Error loading galaxy:', error);
    } finally {
      setLoading(false);
    }
  }, [galaxy, system, chargeNavigation]);

  const navigateSystem = (delta: number) => {
    const newSystem = system + delta;
    if (newSystem >= 1 && newSystem <= 499) {
      setSystem(newSystem);
    }
  };

  const navigateGalaxy = (delta: number) => {
    const newGalaxy = galaxy + delta;
    if (newGalaxy >= 1 && newGalaxy <= 5) {
      setGalaxy(newGalaxy);
    }
  };

  // Prepare planet data for the solar system view
  const solarViewPlanets = useMemo(() => {
    return slots.map((slot) => ({
      position: slot.position,
      name: slot.planet?.name || (slot.fortress ? '🏰 Fortaleza' : slot.treasurePlanet ? '💎 Ciudad del Tesoro' : undefined),
      isOwn: slot.planet?.user_id === currentPlanet?.user_id,
      isCurrentPlanet: slot.planet?.id === currentPlanet?.id,
      isCurrentMoon: !!slot.moon && slot.moon.id === currentPlanet?.id,
      isDestroyed: slot.planet?.is_destroyed === true || slot.planet?.planet_status === 'abandoned' || slot.planet?.planet_status === 'regenerating',
      hasMoon: !!slot.moon,
      hasDebris: !!(slot.debris && (slot.debris.metal > 0 || slot.debris.crystal > 0)),
      debris: slot.debris,
      isEmpty: !slot.planet && !slot.fortress && !slot.treasurePlanet,
      isFortress: !!slot.fortress,
      fortressData: slot.fortress,
      isTreasurePlanet: !!slot.treasurePlanet,
      treasurePlanetData: slot.treasurePlanet,
      isExpedition: slot.position === 16,
      isCasino: galaxy === CASINO_COORDS.galaxy && system === CASINO_COORDS.system && slot.position === CASINO_COORDS.position && !slot.planet,
      isBattleship: galaxy === BATTLESHIP_COORDS.galaxy && system === BATTLESHIP_COORDS.system && slot.position === BATTLESHIP_COORDS.position && !slot.planet,
      isSports: galaxy === SPORTS_COORDS.galaxy && system === SPORTS_COORDS.system && slot.position === SPORTS_COORDS.position && !slot.planet,
      username: slot.planet?.profile?.username,
      occupiedBy: slot.occupation ? (slot.occupation.is_mine ? 'Tú' : slot.occupation.occupier_name || '?') : undefined,
      isMyOccupied: !!slot.occupation?.is_my_planet,
    }));
  }, [slots, currentPlanet?.user_id, currentPlanet?.id, galaxy, system]);

  const handleSolarPlanetClick = (position: number) => {
    const slot = slots.find(s => s.position === position);
    if (!slot) return;
    
    if (position === 16) {
      handleExpedition(galaxy, system);
    } else if (slot.planet && slot.planet.user_id === currentPlanet?.user_id) {
      handlePlanetClick(slot);
    }
  };

  const handleSolarDebrisClick = (position: number) => {
    handleRecycle(galaxy, system, position);
  };

  const handleSolarColonizeClick = (position: number) => {
    handleColonize(galaxy, system, position);
  };

  // Nuevos handlers para el menú de acciones
  const handleSolarAttackClick = (position: number, isMoon?: boolean) => {
    // Si es la fortaleza (sistema 250, pos 8), redirigir a la página de fortalezas
    if (system === 250 && position === 8) {
      navigate('/game/fortress');
      return;
    }
    // Si es el Planeta del Tesoro (sistema 250, pos 9), redirigir a su página
    if (system === 250 && position === 9) {
      navigate('/game/treasure-planet');
      return;
    }
    const missionPosition = isMoon ? position : position;
    navigate(`/game/fleet?galaxy=${galaxy}&system=${system}&position=${missionPosition}&mission=attack${isMoon ? '&target=moon' : ''}`);
  };

  const handleSolarSpyClick = (position: number, isMoon?: boolean) => {
    handleSpy(galaxy, system, position, isMoon ? 'moon' : 'planet');
  };

  const handleSolarTransportClick = (position: number, isMoon?: boolean) => {
    handleTransport(galaxy, system, position, !!isMoon);
  };

  const handleSolarDeployClick = (position: number, isMoon?: boolean) => {
    handleDeploy(galaxy, system, position, !!isMoon);
  };

  const handleSolarOverviewClick = (position: number) => {
    const slot = slots.find(s => s.position === position);
    if (slot?.planet) {
      handlePlanetClick(slot);
    }
  };

  useEffect(() => {
    if (!moonMenu) return;
    const close = () => setMoonMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [moonMenu]);

  useEffect(() => { setMoonMenu(null); }, [galaxy, system]);

  const renderMoonMenu = () => {
    if (!moonMenu) return null;
    const slot = slots.find(s => s.position === moonMenu.position);
    const moon = slot?.moon;
    if (!slot || !moon) return null;
    const es = language === 'es';
    const isOwnMoon = moon.user_id === currentPlanet?.user_id;
    const isCurrent = moon.id === currentPlanet?.id;
    const isVac = !isOwnMoon && slot.planet?.profile?.vacation_mode === true;
    const isProtected = !!slot.protection && !slot.protection.can_attack;
    const cannotSpy = slot.protection?.can_spy === false;
    const reason = slot.protection?.protection_reason || slot.protection?.bashing_reason || t.galaxy.protectedPlayer;
    const close = () => setMoonMenu(null);
    const item = 'w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-md transition-colors';
    const off = `${item} text-gray-600 cursor-not-allowed`;

    return createPortal(
      <>
        <div className="fixed inset-0 z-[90]" onClick={close} />
        <div
          className="fixed z-[91] w-60 -translate-x-1/2 bg-space-800 border border-gray-500/40 rounded-lg shadow-2xl p-1.5"
          style={moonMenu.up
            ? { left: moonMenu.x, bottom: window.innerHeight - moonMenu.y + 6 }
            : { left: moonMenu.x, top: moonMenu.y + 6 }}
        >
          <div className="px-3 py-1.5 border-b border-space-600 mb-1">
            <p className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5 text-gray-300" /> {moon.name}
            </p>
            <p className="text-[10px] text-gray-500">
              {formatCoordinates(galaxy, system, slot.position)} · {es ? 'Castra de Diana' : 'Moon'}
              {isOwnMoon ? (es ? ' · tuya' : ' · yours') : ''}
            </p>
          </div>
          {isOwnMoon ? (
            isCurrent ? (
              <p className="px-3 py-2 text-xs text-gray-400">
                {es ? 'Ya estás en esta Castra de Diana. Cambia de ciudad para enviarle ejércitos.' : 'You are on this moon. Switch planet to send fleets here.'}
              </p>
            ) : (
              <>
                <button className={`${item} text-cyber-green hover:bg-cyber-green/10`} onClick={() => { close(); handleTransport(galaxy, system, slot.position, true); }}>
                  <Package className="w-4 h-4" /> {es ? 'Transportar recursos a la Castra de Diana' : 'Transport resources to moon'}
                </button>
                <button className={`${item} text-teal-400 hover:bg-teal-500/10`} onClick={() => { close(); handleDeploy(galaxy, system, slot.position, true); }}>
                  <Warehouse className="w-4 h-4" /> {es ? 'Desplegar ejército en la Castra de Diana' : 'Deploy fleet to moon'}
                </button>
              </>
            )
          ) : isVac ? (
            <p className="px-3 py-2 text-xs text-yellow-400">{es ? 'Jugador en modo vacaciones' : 'Player on vacation mode'}</p>
          ) : (
            <>
              <button
                className={cannotSpy ? off : `${item} text-gray-200 hover:bg-space-600`}
                disabled={cannotSpy || spyingPosition === slot.position}
                title={cannotSpy ? reason : undefined}
                onClick={() => { close(); handleSpy(galaxy, system, slot.position, 'moon'); }}
              >
                <Eye className="w-4 h-4" /> {es ? 'Espiar Castra de Diana' : 'Spy moon'}
                {cannotSpy && <ShieldAlert className="w-3.5 h-3.5 ml-auto text-amber-400" />}
              </button>
              <button
                className={isProtected ? off : `${item} text-cyber-red hover:bg-cyber-red/10`}
                disabled={isProtected}
                title={isProtected ? reason : undefined}
                onClick={() => { close(); handleAttack(galaxy, system, slot.position, true); }}
              >
                <Rocket className="w-4 h-4" /> {es ? 'Atacar Castra de Diana' : 'Attack moon'}
                {isProtected && <ShieldAlert className="w-3.5 h-3.5 ml-auto text-amber-400" />}
              </button>
              {(isProtected || cannotSpy) && (
                <p className="px-3 pt-1 pb-1.5 text-[10px] text-amber-400/80">{reason}</p>
              )}
            </>
          )}
        </div>
      </>,
      document.body
    );
  };

  return (
    <div className="space-y-6">
      {renderMoonMenu()}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <MapIcon className="w-8 h-8 text-cyber-blue" />
          {t.galaxy.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {[
            {
              key: 'fortress',
              label: 'Fortalezas',
              sub: 'Conquista',
              icon: '🏰',
              title: 'Fortalezas Galácticas',
              onClick: () => navigate('/game/fortress'),
              grad: 'from-amber-400 via-amber-600 to-orange-800',
              edge: 'shadow-[0_5px_0_#7c2d12,0_10px_22px_-6px_rgba(245,158,11,0.65)] hover:shadow-[0_7px_0_#7c2d12,0_16px_30px_-6px_rgba(245,158,11,0.8)] active:shadow-[0_1px_0_#7c2d12,0_4px_10px_-4px_rgba(245,158,11,0.6)]',
              ring: 'ring-amber-200/40',
            },
            {
              key: 'treasure',
              label: 'Tesoro',
              sub: 'Botín',
              icon: '💎',
              title: 'Ciudades del Tesoro',
              onClick: () => navigate('/game/treasure-planet'),
              grad: 'from-emerald-300 via-emerald-600 to-teal-900',
              edge: 'shadow-[0_5px_0_#134e4a,0_10px_22px_-6px_rgba(16,185,129,0.65)] hover:shadow-[0_7px_0_#134e4a,0_16px_30px_-6px_rgba(16,185,129,0.8)] active:shadow-[0_1px_0_#134e4a,0_4px_10px_-4px_rgba(16,185,129,0.6)]',
              ring: 'ring-emerald-200/40',
            },
            {
              key: 'sports',
              label: 'Apuestas Deportivas',
              sub: 'Fútbol · TUNG',
              icon: '⚽',
              title: 'Coliseo Imperial: apuestas de fútbol',
              onClick: () => navigate('/game/sports'),
              grad: 'from-yellow-300 via-amber-500 to-yellow-800',
              edge: 'shadow-[0_5px_0_#78350f,0_10px_22px_-6px_rgba(245,158,11,0.7)] hover:shadow-[0_7px_0_#78350f,0_16px_30px_-6px_rgba(245,158,11,0.85)] active:shadow-[0_1px_0_#78350f,0_4px_10px_-4px_rgba(245,158,11,0.6)]',
              ring: 'ring-amber-200/40',
            },
          ].map((b) => (
            <button
              key={b.key}
              onClick={b.onClick}
              title={b.title}
              className={`group relative overflow-hidden flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-xl bg-gradient-to-b ${b.grad} ${b.edge} ring-1 ring-inset ${b.ring} text-white transition-all duration-150 hover:-translate-y-0.5 active:translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
            >
              <span className="pointer-events-none absolute inset-x-1 top-0.5 h-1/2 rounded-t-lg bg-gradient-to-b from-white/35 to-transparent" />
              <span className="pointer-events-none absolute -left-1/2 top-0 h-full w-1/3 -skew-x-12 bg-white/25 blur-sm opacity-0 group-hover:opacity-100 group-hover:left-[120%] transition-all duration-700 motion-reduce:hidden" />
              <span className="relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-black/30 text-lg sm:text-xl shadow-[inset_0_2px_4px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-200 group-hover:scale-110">
                {b.icon}
              </span>
              <span className="relative flex flex-col items-start leading-tight">
                <span className="font-orbitron text-xs sm:text-sm font-bold tracking-wide [text-shadow:0_2px_3px_rgba(0,0,0,0.6)] whitespace-nowrap">
                  {b.label}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-white/75 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">{b.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card-glass p-4">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateGalaxy(-1)}
              disabled={galaxy <= 1}
              className="p-2 bg-space-700 rounded-lg hover:bg-space-600 disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 px-4 py-2 bg-space-800 rounded-lg min-w-[120px] justify-center">
              <span className="text-gray-400">{t.galaxy.galaxyNumber}</span>
              <span className="font-orbitron text-cyber-blue">{galaxy}</span>
            </div>
            <button
              onClick={() => navigateGalaxy(1)}
              disabled={galaxy >= 5}
              className="p-2 bg-space-700 rounded-lg hover:bg-space-600 disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateSystem(-1)}
              disabled={system <= 1}
              className="p-2 bg-space-700 rounded-lg hover:bg-space-600 disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={system}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (val >= 1 && val <= 499) setSystem(val);
                }}
                className="w-20 px-3 py-2 bg-space-800 border border-cyber-blue/30 rounded-lg text-center text-white font-orbitron"
                min={1}
                max={499}
              />
              <span className="text-gray-400">/ 499</span>
            </div>
            <button
              onClick={() => navigateSystem(1)}
              disabled={system >= 499}
              className="p-2 bg-space-700 rounded-lg hover:bg-space-600 disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={() => loadGalaxyView()}
            className="flex items-center gap-2 px-4 py-2 bg-cyber-blue rounded-lg hover:bg-cyber-blue/80 transition-colors"
          >
            <Search className="w-4 h-4" />
            {t.galaxy.search}
          </button>

          {/* Toggle vista solar */}
          <button
            onClick={() => setShowSolarView(!showSolarView)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              showSolarView 
                ? 'bg-cyber-yellow/20 border border-cyber-yellow/50 text-cyber-yellow' 
                : 'bg-space-700 hover:bg-space-600 text-gray-400'
            }`}
            title={showSolarView ? 'Ocultar vista orbital' : 'Mostrar vista orbital'}
          >
            <Orbit className="w-4 h-4" />
            <span className="text-sm">Vista Orbital</span>
          </button>

          {/* Spy probe count selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <Eye className="w-3.5 h-3.5 text-cyber-green" />
            <span className="text-gray-400">Sondas:</span>
            <input
              type="number"
              value={spyProbeCount}
              onChange={(e) => {
                const val = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
                setSpyProbeCount(val);
                localStorage.setItem('spyProbeCount', val.toString());
              }}
              className="w-14 px-2 py-1 bg-space-800 border border-cyber-green/30 rounded text-center text-white text-xs font-orbitron"
              min={1}
              max={50}
              title="Cantidad de sondas a enviar por espionaje"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Fuel className="w-3.5 h-3.5" />
            <span>{t.galaxy.navCost}</span>
          </div>
        </div>
      </div>

      {/* Vista de Sistema Solar Animado */}
      {showSolarView && !loading && slots.length > 0 && (
        <SolarSystemView
          planets={solarViewPlanets}
          currentSystem={system}
          currentGalaxy={galaxy}
          onPlanetClick={handleSolarPlanetClick}
          onDebrisClick={handleSolarDebrisClick}
          onColonizeClick={handleSolarColonizeClick}
          onAttackClick={handleSolarAttackClick}
          onSpyClick={handleSolarSpyClick}
          onTransportClick={handleSolarTransportClick}
          onDeployClick={handleSolarDeployClick}
          onOverviewClick={handleSolarOverviewClick}
          onCasinoClick={galaxy === CASINO_COORDS.galaxy && system === CASINO_COORDS.system ? () => navigate('/game/casino') : undefined}
          onBattleshipClick={galaxy === BATTLESHIP_COORDS.galaxy && system === BATTLESHIP_COORDS.system ? () => navigate('/game/battleship', { state: { hyperspace: true } }) : undefined}
          onSportsClick={galaxy === SPORTS_COORDS.galaxy && system === SPORTS_COORDS.system ? () => navigate('/game/sports') : undefined}
        />
      )}

      {deutCost && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm animate-fade-in">
          <Fuel className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-cyan-300">
            -{deutCost.cost.toLocaleString()} {t.resources.deuterium}
          </span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400">
            {t.galaxy.deutRemaining}: {deutCost.remaining.toLocaleString()}
          </span>
        </div>
      )}

      {deutError && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm animate-fade-in">
          <Fuel className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-red-300">{deutError}</span>
        </div>
      )}

      {/* Phalanx info indicator */}
      {userMoonsPhalanx.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs flex-wrap">
          <Radio className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-purple-300 font-semibold">{t.galaxy.phalanxTitle}:</span>
          {userMoonsPhalanx.map((m, i) => {
            const inRange = m.galaxy === galaxy && Math.abs(m.solar_system - system) <= m.phalanx_range;
            return (
              <span key={m.moon_id} className={`px-2 py-0.5 rounded ${
                inRange ? 'bg-purple-500/20 text-purple-300' : 'bg-space-700 text-gray-500'
              }`}>
                🌙 {m.moon_name} [{m.galaxy}:{m.solar_system}:{m.position}] Lvl {m.phalanx_level}
                <span className="ml-1">({t.galaxy.phalanxRange}: {m.phalanx_range} sys)</span>
                <span className="ml-1">{m.deuterium >= 5000 ? '⚡' : '⛽'} {m.deuterium.toLocaleString()} deut</span>
                {inRange && <span className="ml-1 text-green-400">✓</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Tabla tradicional - solo mostrar si vista solar está desactivada */}
      {!showSolarView && (
      <div className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-space-700/50">
                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-400 w-12">{t.galaxy.position}</th>
                <th className="px-3 py-3 text-left text-sm font-semibold text-gray-400">{t.galaxy.planet}</th>
                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-400 w-12">{t.galaxy.moon}</th>
                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-400 w-16 hidden sm:table-cell">{t.galaxy.debris}</th>
                <th className="px-3 py-3 text-left text-sm font-semibold text-gray-400">{t.galaxy.player}</th>
                <th className="px-3 py-3 text-left text-sm font-semibold text-gray-400 hidden md:table-cell">{t.galaxy.alliance}</th>
                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-400">{t.galaxy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
                      <span className="text-gray-400">{t.galaxy.loadingSystem}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                slots.map((slot) => {
                  // [SPORTS1] Estadio Galactico (apuestas de futbol)
                  if (galaxy === SPORTS_COORDS.galaxy && system === SPORTS_COORDS.system && slot.position === SPORTS_COORDS.position && !slot.planet) {
                    return (
                      <tr key={slot.position} className="border-t border-amber-500/30 bg-gradient-to-r from-amber-900/25 via-space-800 to-yellow-900/25">
                        <td className="px-3 py-3 text-center">
                          <span className="font-serif font-bold text-amber-300">{slot.position}</span>
                        </td>
                        <td className="px-3 py-3" colSpan={5}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-300/40 via-amber-500/40 to-yellow-900/40 ring-2 ring-amber-400/60 flex items-center justify-center text-xl animate-pulse" style={{ animationDuration: '2.5s' }}>
                              🏟️
                            </div>
                            <div>
                              <p className="font-serif font-bold text-amber-200 tracking-wide">Coliseo Imperial</p>
                              <p className="text-xs text-gray-400">Apuestas de fútbol en TUNG: gana local, empate o visitante.</p>
                              <p className="text-xs text-gray-500">{formatCoordinates(galaxy, system, slot.position)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => navigate('/game/sports')}
                            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-600 to-yellow-700 text-white rounded-lg hover:opacity-90 transition-all font-serif font-semibold text-sm mx-auto"
                          >
                            ⚽ Apostar
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  // [BATTLESHIP1] Planeta de Batalla Naval
                  if (galaxy === BATTLESHIP_COORDS.galaxy && system === BATTLESHIP_COORDS.system && slot.position === BATTLESHIP_COORDS.position && !slot.planet) {
                    return (
                      <tr key={slot.position} className="border-t border-sky-500/30 bg-gradient-to-r from-sky-900/20 via-space-800 to-indigo-900/20">
                        <td className="px-3 py-3 text-center">
                          <span className="font-orbitron text-sky-300">{slot.position}</span>
                        </td>
                        <td className="px-3 py-3" colSpan={5}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-300/40 via-sky-500/40 to-indigo-800/40 ring-2 ring-sky-400/60 flex items-center justify-center text-xl animate-pulse" style={{ animationDuration: '2.5s' }}>
                              🚀
                            </div>
                            <div>
                              <p className="text-sky-200 font-semibold">Batalla de Tropas Galáctica</p>
                              <p className="text-xs text-gray-400">Duelos PvP 1 vs 1 apostando TUNG.</p>
                              <p className="text-xs text-gray-500">{formatCoordinates(galaxy, system, slot.position)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => navigate('/game/battleship', { state: { hyperspace: true } })}
                            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 text-white rounded-lg hover:opacity-90 transition-all font-semibold text-sm mx-auto"
                          >
                            🚀 Jugar
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  // [CASINO4] Casino Galactico como planeta normal en su posicion
                  if (galaxy === CASINO_COORDS.galaxy && system === CASINO_COORDS.system && slot.position === CASINO_COORDS.position && !slot.planet) {
                    return (
                      <tr key={slot.position} className="border-t border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-900/20 via-space-800 to-amber-900/20">
                        <td className="px-3 py-3 text-center">
                          <span className="font-orbitron text-fuchsia-300">{slot.position}</span>
                        </td>
                        <td className="px-3 py-3" colSpan={5}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300/40 via-fuchsia-500/40 to-purple-700/40 ring-2 ring-fuchsia-400/60 flex items-center justify-center text-xl animate-pulse" style={{ animationDuration: '2.5s' }}>
                              🎰
                            </div>
                            <div>
                              <p className="text-fuchsia-200 font-semibold">Casino Galáctico</p>
                              <p className="text-xs text-gray-400">Lotería, Rifa y mesas de juego abiertas para todos.</p>
                              <p className="text-xs text-gray-500">{formatCoordinates(galaxy, system, slot.position)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => navigate('/game/casino')}
                            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-fuchsia-600 to-amber-500 text-white rounded-lg hover:opacity-90 transition-all font-semibold text-sm mx-auto"
                          >
                            🎰 Casino
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  if (slot.position === 16) {
                    return (
                      <tr key={16} className="border-t border-space-700 bg-gradient-to-r from-space-800 to-cyber-blue/5">
                        <td className="px-3 py-3 text-center">
                          <span className="font-orbitron text-cyber-yellow">16</span>
                        </td>
                        <td className="px-3 py-3" colSpan={5}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyber-blue/30 to-cyber-yellow/30 flex items-center justify-center animate-pulse">
                              <Sparkles className="w-6 h-6 text-cyber-yellow" />
                            </div>
                            <div>
                              <p className="text-cyber-yellow font-semibold">{t.galaxy.deepSpace}</p>
                              <p className="text-xs text-gray-400">{t.galaxy.deepSpaceDesc}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => handleExpedition(galaxy, system)}
                            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-cyber-blue to-cyber-yellow/70 text-white rounded-lg hover:opacity-90 transition-all font-semibold text-sm mx-auto"
                          >
                            <Compass className="w-4 h-4" />
                            {t.galaxy.expedition}
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  const isOwn = slot.planet?.user_id === currentPlanet?.user_id;
                  const isVacation = !isOwn && slot.planet?.profile?.vacation_mode === true;
                  const isDestroyed = slot.planet?.is_destroyed === true;
                  const isRuins = isDestroyed || slot.planet?.planet_status === 'abandoned' || slot.planet?.planet_status === 'regenerating';
                  const coords = formatCoordinates(galaxy, system, slot.position);
                  const occ = slot.occupation;
                  const canEnter = isOwn && !occ?.is_my_planet;

                  const effectCode = slot.planet?.profile?.active_planet_effect;
                  const effectGlow = effectCode === 'planet_fire' ? 'border-l-2 border-l-orange-500/60 bg-gradient-to-r from-orange-500/5 to-transparent' :
                    effectCode === 'planet_ice' ? 'border-l-2 border-l-cyan-400/60 bg-gradient-to-r from-cyan-400/5 to-transparent' :
                    effectCode === 'planet_golden' ? 'border-l-2 border-l-yellow-400/60 bg-gradient-to-r from-yellow-400/5 to-transparent' :
                    effectCode === 'planet_dark' ? 'border-l-2 border-l-purple-500/60 bg-gradient-to-r from-purple-500/5 to-transparent' :
                    effectCode === 'planet_nebula' ? 'border-l-2 border-l-pink-400/60 bg-gradient-to-r from-pink-400/5 to-transparent' : '';

                  return (
                    <tr
                      key={slot.position}
                      className={`border-t border-space-700 hover:bg-space-700/30 transition-colors ${effectGlow} ${
                        occ ? 'bg-red-950/25 border-l-2 border-l-red-500/70' : isOwn ? 'bg-cyber-green/5' : ''
                      } ${
                        isRuins ? 'opacity-50 grayscale' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-center">
                        <span className="font-orbitron text-cyber-blue">{slot.position}</span>
                      </td>
                      <td className="px-3 py-2">
                        {slot.planet ? (
                          <div
                            className={`flex items-center gap-2 ${canEnter ? 'cursor-pointer hover:opacity-80' : ''}`}
                            onClick={canEnter ? () => handlePlanetClick(slot) : undefined}
                            title={canEnter ? t.galaxy.goToOverview : occ ? (language === 'es' ? `Ocupado por ${occ.occupier_name || '?'}` : `Occupied by ${occ.occupier_name || '?'}`) : undefined}
                          >
                            <div className={`relative ${occ?.is_my_planet ? 'opacity-50 grayscale' : ''}`}>
                              {/* Resplandor del efecto de planeta (aura tipo sol) */}
                              {slot.planet.profile?.active_planet_effect && !isRuins && (
                                <div className={`absolute -inset-1.5 rounded-full blur-md animate-pulse pointer-events-none ${
                                  slot.planet.profile.active_planet_effect === 'planet_fire' ? 'bg-orange-500/60' :
                                  slot.planet.profile.active_planet_effect === 'planet_ice' ? 'bg-cyan-400/60' :
                                  slot.planet.profile.active_planet_effect === 'planet_golden' ? 'bg-yellow-400/70' :
                                  slot.planet.profile.active_planet_effect === 'planet_dark' ? 'bg-purple-500/60' :
                                  slot.planet.profile.active_planet_effect === 'planet_nebula' ? 'bg-pink-500/60' :
                                  'bg-amber-400/50'
                                }`} style={{ animationDuration: '2.2s' }} />
                              )}
                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center relative z-10 ${
                                  isRuins ? 'bg-red-900/20 ring-1 ring-red-600/40' :
                                  isOwn ? 'bg-cyber-green/20' : 'bg-cyber-blue/20'
                                } ${
                                  slot.planet.profile?.active_planet_effect === 'planet_fire' ? 'ring-2 ring-orange-500/60 shadow-lg shadow-orange-500/30' :
                                  slot.planet.profile?.active_planet_effect === 'planet_ice' ? 'ring-2 ring-cyan-400/60 shadow-lg shadow-cyan-400/30' :
                                  slot.planet.profile?.active_planet_effect === 'planet_golden' ? 'ring-2 ring-yellow-400/60 shadow-lg shadow-yellow-400/30' :
                                  slot.planet.profile?.active_planet_effect === 'planet_dark' ? 'ring-2 ring-purple-500/60 shadow-lg shadow-purple-500/30 animate-pulse' :
                                  slot.planet.profile?.active_planet_effect === 'planet_nebula' ? 'ring-2 ring-pink-400/50 shadow-lg shadow-pink-400/30 animate-pulse' :
                                  ''
                                }`}
                              >
                                {isRuins ? (
                                  <span className="text-lg">💀</span>
                                ) : (
                                  <MapIcon className={`w-6 h-6 ${isOwn ? 'text-cyber-green' : 'text-cyber-blue'}`} />
                                )}
                              </div>
                              {/* Planet effect badge */}
                              {slot.planet.profile?.active_planet_effect && (
                                <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                                  slot.planet.profile.active_planet_effect === 'planet_fire' ? 'bg-orange-500/30 ring-1 ring-orange-400/50' :
                                  slot.planet.profile.active_planet_effect === 'planet_ice' ? 'bg-cyan-500/30 ring-1 ring-cyan-400/50' :
                                  slot.planet.profile.active_planet_effect === 'planet_golden' ? 'bg-yellow-500/30 ring-1 ring-yellow-400/50' :
                                  slot.planet.profile.active_planet_effect === 'planet_dark' ? 'bg-purple-500/30 ring-1 ring-purple-400/50' :
                                  slot.planet.profile.active_planet_effect === 'planet_nebula' ? 'bg-pink-500/30 ring-1 ring-pink-400/50' :
                                  'bg-amber-500/30 ring-1 ring-amber-400/50'
                                }`}>
                                  {slot.planet.profile.active_planet_effect === 'planet_fire' ? '🔥' :
                                   slot.planet.profile.active_planet_effect === 'planet_ice' ? '❄️' :
                                   slot.planet.profile.active_planet_effect === 'planet_golden' ? '🟡' :
                                   slot.planet.profile.active_planet_effect === 'planet_dark' ? '🟣' :
                                   slot.planet.profile.active_planet_effect === 'planet_nebula' ? '🌈' : '✨'}
                                </span>
                              )}
                              {occ && (
                                <span className="absolute -bottom-1 -right-1 z-20 w-5 h-5 rounded-full flex items-center justify-center bg-red-600 ring-2 ring-red-300/60 shadow-lg shadow-red-500/40">
                                  <Flag className="w-3 h-3 text-white" />
                                </span>
                              )}
                            </div>
                            <div>
                              <p className={`text-sm font-medium ${isRuins ? 'text-gray-500 italic' : occ?.is_my_planet ? 'text-gray-400' : canEnter ? 'text-cyber-green hover:underline' : 'text-white'}`}>
                                {isRuins ? `💀 ${translatePlanetName(slot.planet.name)} (Inhabitable)` : translatePlanetName(slot.planet.name)}
                                {occ && (
                                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600/25 text-red-300 border border-red-500/40">
                                    ⚑ {language === 'es' ? 'OCUPADO' : 'OCCUPIED'}
                                  </span>
                                )}
                                {slot.debris && (slot.debris.metal > 0 || slot.debris.crystal > 0) && (
                                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 animate-pulse" title={`Escombros: ${slot.debris.metal.toLocaleString()} M | ${slot.debris.crystal.toLocaleString()} C`}>
                                    💥 {((slot.debris.metal + slot.debris.crystal) / 1000).toFixed(0)}k
                                  </span>
                                )}
                                {slot.planet.profile?.active_planet_effect && (
                                  <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    slot.planet.profile.active_planet_effect === 'planet_fire' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                                    slot.planet.profile.active_planet_effect === 'planet_ice' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                                    slot.planet.profile.active_planet_effect === 'planet_golden' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                    slot.planet.profile.active_planet_effect === 'planet_dark' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                    slot.planet.profile.active_planet_effect === 'planet_nebula' ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' :
                                    'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                  }`}>
                                    {slot.planet.profile.active_planet_effect === 'planet_fire' ? '🔥 Aureola' :
                                     slot.planet.profile.active_planet_effect === 'planet_ice' ? '❄️ Hielo' :
                                     slot.planet.profile.active_planet_effect === 'planet_golden' ? '🟡 Anillos' :
                                     slot.planet.profile.active_planet_effect === 'planet_dark' ? '🟣 Oscuridad' :
                                     slot.planet.profile.active_planet_effect === 'planet_nebula' ? '🌈 Nebulosa' : '✨'}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500">{coords}</p>
                            </div>
                          </div>
                        ) : slot.fortress ? (
                          /* Fortress display */
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center ring-2 ring-amber-500/50">
                              <span className="text-base">🏰</span>
                            </div>
                            <div>
                              <span className="text-amber-400 text-sm font-semibold">Fortaleza</span>
                              {slot.fortress.owner_alliance_name ? (
                                <span className="ml-2 text-xs text-amber-300">
                                  [{slot.fortress.owner_alliance_tag}] {slot.fortress.owner_alliance_name}
                                </span>
                              ) : (
                                <span className="ml-2 text-xs text-slate-400">Sin dueño</span>
                              )}
                              {slot.fortress.total_ships > 0 && (
                                <span className="ml-2 text-xs text-slate-400">
                                  🛡️ {slot.fortress.total_ships.toLocaleString()} tropas
                                </span>
                              )}
                              <p className="text-xs text-gray-500">{coords}</p>
                            </div>
                          </div>
                        ) : slot.treasurePlanet ? (
                          /* Treasure Planet display (isolated from Fortress, own golden style) */
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-full bg-yellow-400/20 flex items-center justify-center ring-2 ring-yellow-400/70" style={{ boxShadow: '0 0 10px rgba(250,204,21,0.6)' }}>
                              <span className="text-base">💎</span>
                            </div>
                            <div>
                              <span className="text-yellow-300 text-sm font-semibold">Ciudad del Tesoro</span>
                              {slot.treasurePlanet.owner_alliance_name ? (
                                <span className="ml-2 text-xs text-yellow-200">
                                  [{slot.treasurePlanet.owner_alliance_tag}] {slot.treasurePlanet.owner_alliance_name}
                                </span>
                              ) : (
                                <span className="ml-2 text-xs text-slate-400">Sin dueño</span>
                              )}
                              {slot.treasurePlanet.total_ships > 0 && (
                                <span className="ml-2 text-xs text-slate-400">
                                  🛡️ {slot.treasurePlanet.total_ships.toLocaleString()} tropas
                                </span>
                              )}
                              <p className="text-xs text-gray-500">{coords}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-full bg-space-700/50 flex items-center justify-center">
                              <MapIcon className="w-5 h-5 text-gray-600" />
                            </div>
                            <div>
                              <span className="text-gray-500 text-sm">{t.galaxy.emptyPosition}</span>
                              {slot.debris && (slot.debris.metal > 0 || slot.debris.crystal > 0) && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 animate-pulse inline-block" title={`Escombros: ${slot.debris.metal.toLocaleString()} M | ${slot.debris.crystal.toLocaleString()} C`}>
                                  💥 {((slot.debris.metal + slot.debris.crystal) / 1000).toFixed(0)}k
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {slot.moon ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              const up = r.bottom + 230 > window.innerHeight;
                              setMoonMenu(prev => prev?.position === slot.position ? null : {
                                position: slot.position,
                                x: r.left + r.width / 2,
                                y: up ? r.top : r.bottom,
                                up,
                              });
                            }}
                            className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto cursor-pointer transition-colors ring-1 ${
                              moonMenu?.position === slot.position
                                ? 'bg-cyber-blue/25 ring-cyber-blue/70'
                                : 'bg-gray-500/20 ring-gray-400/30 hover:bg-gray-400/30 hover:ring-cyber-blue/60'
                            }`}
                            title={`${t.galaxy.moon}: ${slot.moon.name} — ${language === 'es' ? 'clic para espiar, atacar o transportar' : 'click to spy, attack or transport'}`}
                          >
                            <Moon className="w-5 h-5 text-gray-300" />
                          </button>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center relative">
                        {slot.debris ? (
                          <div
                            className="relative inline-block"
                            onMouseEnter={() => setHoveredDebris(slot.position)}
                            onMouseLeave={() => setHoveredDebris(null)}
                          >
                            <div
                              className="w-8 h-8 rounded-full bg-cyber-orange/20 flex items-center justify-center mx-auto cursor-pointer hover:bg-cyber-orange/30 transition-colors animate-pulse"
                              onClick={() => handleRecycle(galaxy, system, slot.position)}
                              title={t.galaxy.sendRecyclers}
                            >
                              <Recycle className="w-5 h-5 text-cyber-orange" />
                            </div>
                            {hoveredDebris === slot.position && (
                              <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-space-800 border border-cyber-orange/30 rounded-lg shadow-xl whitespace-nowrap">
                                <div className="text-xs font-semibold text-cyber-orange mb-1">{t.galaxy.debrisField}</div>
                                <div className="text-xs text-gray-300">{t.resources.metal}: {slot.debris.metal.toLocaleString()}</div>
                                <div className="text-xs text-cyan-400">{t.resources.crystal}: {slot.debris.crystal.toLocaleString()}</div>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-space-800"></div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isRuins ? (
                          <span className="text-xs text-red-400/70 italic">💀 Ruinas</span>
                        ) : slot.planet?.profile ? (
                          <div className={`flex items-center gap-2 ${occ ? 'flex-wrap gap-y-0.5' : ''}`}>
                            <User className="w-4 h-4 text-gray-400" />
                            <span className={`text-sm ${isOwn ? 'text-cyber-green' : 'text-white'}`}>
                              {slot.planet.profile.active_title && (
                                <span className="text-cyber-yellow">{slot.planet.profile.active_title}</span>
                              )}
                              {slot.planet.profile.active_title && <span className="text-gray-500 mx-1">·</span>}
                              {slot.planet.profile.username}
                              {slot.planet.profile.active_badge && (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-red-900/40 to-red-800/20 ring-2 ring-red-500/50 shadow-lg shadow-red-500/30 animate-pulse text-sm ml-1" style={{ animationDuration: '2s' }} title="Insignia equipada">{slot.planet.profile.active_badge}</span>
                              )}
                              {isVacation && <span className="ml-1 text-xs text-yellow-400">(V)</span>}
                            </span>
                            {!isOwn && slot.protection && !slot.protection.can_attack && (
                              <div className="relative group">
                                <ShieldAlert className="w-4 h-4 text-amber-400 cursor-help" />
                                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-space-800 border border-amber-500/30 rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                  <div className="text-xs font-semibold text-amber-400 mb-1">{slot.protection.same_alliance ? 'Miembro de tu alianza' : t.galaxy.protectedPlayer}</div>
                                  {slot.protection.protection_reason && (
                                    <div className="text-xs text-gray-300">{slot.protection.protection_reason}</div>
                                  )}
                                  {slot.protection.bashing_reason && (
                                    <div className="text-xs text-red-400 mt-0.5">{slot.protection.bashing_reason}</div>
                                  )}
                                  {slot.protection.owner_points !== undefined && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {slot.protection.owner_username}: {slot.protection.owner_points?.toLocaleString()} {t.galaxy.points}
                                    </div>
                                  )}
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-space-800"></div>
                                </div>
                              </div>
                            )}
                            {!isOwn && slot.protection && slot.protection.can_attack && !isVacation && (
                              <Swords className="w-3.5 h-3.5 text-red-400/60" title={t.galaxy.canAttack} />
                            )}
                            {occ && (
                              <span className="basis-full flex items-center gap-1 text-[11px] font-semibold text-red-300">
                                <Flag className="w-3 h-3" />
                                {language === 'es' ? 'Ocupado por' : 'Occupied by'}{' '}
                                <span className={occ.is_mine ? 'text-cyber-green' : 'text-red-200'}>
                                  {occ.is_mine ? (language === 'es' ? 'ti' : 'you') : occ.occupier_name || '?'}
                                </span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        {slot.planet?.user_id && userAlliances[slot.planet.user_id] ? (
                          <span
                            className="text-sm font-semibold text-cyber-purple cursor-help"
                            title={userAlliances[slot.planet.user_id].name}
                          >
                            [{userAlliances[slot.planet.user_id].tag}]
                          </span>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-3 py-2">
                        <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                          {/* [OCUPA2] Ocupante: gestionar la colonia ocupada */}
                          {slot.planet && occ?.is_mine && occ.occupation_id && (
                            <button
                              onClick={() => navigate(`/game/occupations?occ=${occ.occupation_id}`)}
                              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
                              title={language === 'es' ? 'Gestionar ocupación: producir y transportar recursos' : 'Manage occupation: build and transport resources'}
                            >
                              <Flag className="w-4 h-4" />
                              <span className="hidden sm:inline">{language === 'es' ? 'Gestionar' : 'Manage'}</span>
                            </button>
                          )}
                          {/* [OCUPA2] Dueño: recuperar atacando la guarnición del ocupante */}
                          {slot.planet && isOwn && occ?.is_my_planet && (
                            <>
                              <button
                                onClick={() => handleSpy(galaxy, system, slot.position)}
                                disabled={spyingPosition === slot.position}
                                className={`p-2 rounded-lg transition-colors ${
                                  spySuccess === slot.position
                                    ? 'bg-cyber-green/20 text-cyber-green'
                                    : 'bg-space-700 hover:bg-space-600 text-gray-400'
                                }`}
                                title={language === 'es' ? 'Espiar la guarnición del ocupante' : 'Spy the occupier garrison'}
                              >
                                {spyingPosition === slot.position ? (
                                  <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
                                ) : spySuccess === slot.position ? (
                                  <CheckCircle className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleAttack(galaxy, system, slot.position)}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold animate-pulse transition-colors"
                                title={language === 'es' ? 'Recuperar: destruye el ejército del ocupante' : 'Recover: destroy the occupier fleet'}
                              >
                                <Swords className="w-4 h-4" />
                                <span className="hidden sm:inline">{language === 'es' ? 'Recuperar' : 'Recover'}</span>
                              </button>
                            </>
                          )}
                          {slot.planet && !isOwn && !isVacation && !isRuins && !occ?.is_mine && (() => {
                            const isProtected = slot.protection && !slot.protection.can_attack;
                            const cannotSpy = slot.protection?.can_spy === false;
                            return (
                            <>
                              <button
                                onClick={() => { if (!cannotSpy) handleSpy(galaxy, system, slot.position); }}
                                disabled={spyingPosition === slot.position || cannotSpy}
                                className={`p-2 rounded-lg transition-colors ${
                                  cannotSpy
                                    ? 'bg-space-700/50 text-gray-600 cursor-not-allowed'
                                    : spySuccess === slot.position
                                    ? 'bg-cyber-green/20 text-cyber-green'
                                    : 'bg-space-700 hover:bg-space-600 text-gray-400'
                                }`}
                                title={cannotSpy ? (slot.protection?.protection_reason || t.galaxy.spy) : t.galaxy.spy}
                              >
                                {spyingPosition === slot.position ? (
                                  <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
                                ) : spySuccess === slot.position ? (
                                  <CheckCircle className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => !isProtected && handleMissileClick(galaxy, system, slot.position)}
                                disabled={!!isProtected}
                                className={`p-2 rounded-lg transition-colors ${
                                  isProtected
                                    ? 'bg-space-700/50 text-gray-600 cursor-not-allowed'
                                    : 'bg-space-700 hover:bg-cyber-orange/20 hover:text-cyber-orange'
                                }`}
                                title={isProtected ? (slot.protection?.protection_reason || slot.protection?.bashing_reason || t.galaxy.protectedPlayer) : t.galaxy.launchMissile}
                              >
                                <Target className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => !isProtected && handleAttack(galaxy, system, slot.position)}
                                disabled={!!isProtected}
                                className={`p-2 rounded-lg transition-colors ${
                                  isProtected
                                    ? 'bg-space-700/50 text-gray-600 cursor-not-allowed'
                                    : 'bg-space-700 hover:bg-cyber-red/20 hover:text-cyber-red'
                                }`}
                                title={isProtected ? (slot.protection?.protection_reason || slot.protection?.bashing_reason || t.galaxy.protectedPlayer) : t.galaxy.attack}
                              >
                                <Rocket className="w-4 h-4" />
                              </button>
                              {slot.planet && allyDepotPlanets.has(slot.planet.id) && (
                                <button
                                  onClick={() => handleDeploy(galaxy, system, slot.position)}
                                  className="p-2 rounded-lg transition-colors bg-space-700 hover:bg-teal-500/20 hover:text-teal-400 text-teal-400/70"
                                  title={t.galaxy.deployToAlly}
                                >
                                  <Warehouse className="w-4 h-4" />
                                </button>
                              )}
                              {/* Sensor Phalanx scan button */}
                              {userMoonsPhalanx.length > 0 && (() => {
                                const moonsInRange = getPhalanxMoonsInRange(galaxy, system);
                                const inRange = moonsInRange.length > 0;
                                return (
                                  <button
                                    onClick={() => handlePhalanxClick(galaxy, system, slot.position)}
                                    className={`p-2 rounded-lg transition-colors ${
                                      inRange
                                        ? 'bg-space-700 hover:bg-purple-500/20 hover:text-purple-400 text-purple-400'
                                        : 'bg-space-700/50 text-purple-400/30 hover:bg-purple-500/10 hover:text-purple-400/50'
                                    }`}
                                    title={inRange
                                      ? `📡 ${t.galaxy.phalanxScan} (${t.galaxy.phalanxCost})`
                                      : `📡 ${t.galaxy.phalanxOutOfRange}`
                                    }
                                  >
                                    <Radio className="w-4 h-4" />
                                  </button>
                                );
                              })()}
                            </>
                            );
                          })()}
                          {slot.planet && !isOwn && !isRuins && slot.planet.profile?.username && (
                            <button
                              onClick={() => navigate(`/game/messages?to=${encodeURIComponent(slot.planet!.profile!.username)}`)}
                              className="p-2 rounded-lg transition-colors bg-space-700 hover:bg-cyber-blue/20 hover:text-cyber-blue text-gray-400"
                              title={t.messages.sendMessage}
                            >
                              <Mail className="w-4 h-4" />
                            </button>
                          )}
                          {!slot.planet && !slot.fortress && !slot.treasurePlanet && (
                            <button
                              onClick={() => handleColonize(galaxy, system, slot.position)}
                              className="p-2 bg-space-700 rounded-lg hover:bg-cyber-green/20 hover:text-cyber-green transition-colors"
                              title={t.galaxy.colonize}
                            >
                              <Globe className="w-4 h-4" />
                            </button>
                          )}
                          {slot.fortress && (
                            <button
                              onClick={() => navigate('/game/fortress')}
                              className="p-2 bg-amber-600 rounded-lg hover:bg-amber-500 text-white transition-colors"
                              title="Atacar Fortaleza"
                            >
                              ⚔️
                            </button>
                          )}
                          {slot.treasurePlanet && (
                            <button
                              onClick={() => navigate('/game/treasure-planet')}
                              className="p-2 bg-yellow-500 rounded-lg hover:bg-yellow-400 text-black transition-colors"
                              title="Atacar Ciudad del Tesoro"
                            >
                              ⚔️
                            </button>
                          )}
                          {slot.debris && (
                            <button
                              onClick={() => handleRecycle(galaxy, system, slot.position)}
                              className="p-2 bg-space-700 rounded-lg hover:bg-cyber-orange/20 hover:text-cyber-orange transition-colors"
                              title={t.galaxy.recycleDebris}
                            >
                              <Recycle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Leyenda - solo mostrar si vista solar está desactivada */}
      {!showSolarView && (
      <div className="card-glass p-4">
        <h3 className="font-orbitron text-sm text-white mb-3">{t.galaxy.legend}</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-cyber-green" />
            <span className="text-gray-400">{t.galaxy.yourPlanet}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-cyber-blue" />
            <span className="text-gray-400">{t.galaxy.occupiedPlanet}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-space-600" />
            <span className="text-gray-400">{t.galaxy.emptyPosition}</span>
          </div>
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-gray-300" />
            <span className="text-gray-400">{t.galaxy.moon}</span>
          </div>
          <div className="flex items-center gap-2">
            <Recycle className="w-4 h-4 text-cyber-orange" />
            <span className="text-gray-400">{t.galaxy.debrisField}</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyber-yellow" />
            <span className="text-gray-400">{t.galaxy.deepSpace}</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span className="text-gray-400">{t.galaxy.protectedPlayer}</span>
          </div>
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-red-400/60" />
            <span className="text-gray-400">{t.galaxy.canAttack}</span>
          </div>
          <div className="flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-teal-400" />
            <span className="text-gray-400">{t.galaxy.allyHasDepot}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg">💀</span>
            <span className="text-gray-400">Ruinas (Inhabitable)</span>
          </div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-purple-400" />
            <span className="text-gray-400">{t.galaxy.phalanxTitle}</span>
          </div>
        </div>
      </div>
      )}

      {missileModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card-glass max-w-md w-full p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-orbitron text-xl text-white flex items-center gap-2">
                <Target className="w-6 h-6 text-cyber-orange" />
                {missileResult ? (t.galaxy.missileReport || 'Reporte de Impacto') : t.galaxy.missileTitle}
              </h2>
              <button
                onClick={() => { setMissileModal(null); setMissileResult(null); }}
                className="p-2 hover:bg-space-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {missileResult ? (
              <div className="space-y-4">
                <div className="bg-space-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.missileLaunched || 'Misiles lanzados'}:</span>
                    <span className="text-cyber-orange font-semibold">{missileResult.missiles_launched}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.missileIntercepted || 'Interceptados por ABM'}:</span>
                    <span className="text-cyber-red font-semibold">{missileResult.missiles_intercepted}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.missileEffective || 'Misiles efectivos'}:</span>
                    <span className="text-cyber-green font-semibold">{missileResult.missiles_effective}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.missileTotalDamage || 'Daño total'}:</span>
                    <span className="text-white font-semibold">{missileResult.total_damage.toLocaleString()}</span>
                  </div>
                </div>

                {missileResult.destroyed_defenses.length > 0 ? (
                  <div className="bg-space-800 rounded-lg p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-cyber-red mb-2">
                      {t.galaxy.missileDestroyed || 'Defensas destruidas'}:
                    </h3>
                    {missileResult.destroyed_defenses.map((def, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-300">{def.name}</span>
                        <span className="text-cyber-red font-semibold">-{def.quantity}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  missileResult.missiles_effective > 0 && (
                    <div className="bg-space-800 rounded-lg p-4">
                      <p className="text-sm text-gray-400 text-center">
                        {t.galaxy.missileNoDestruction || 'Los misiles impactaron pero no destruyeron ninguna defensa'}
                      </p>
                    </div>
                  )
                )}

                <button
                  onClick={() => { setMissileModal(null); setMissileResult(null); }}
                  className="w-full px-4 py-3 bg-space-700 hover:bg-space-600 rounded-lg text-white font-semibold transition-colors"
                >
                  {t.galaxy.missileClose || 'Cerrar'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-space-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.position}:</span>
                    <span className="text-white font-semibold">
                      {formatCoordinates(missileModal.galaxy, missileModal.system, missileModal.position)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.missileAvailable}:</span>
                    <span className="text-cyber-orange font-semibold">
                      {defenses.find(d => d.defense_type?.code === 'interplanetary_missile')?.quantity || 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.buildings?.missileSilo || 'Silo de Misiles'}:</span>
                    <span className="text-cyber-blue font-semibold">
                      {t.common.level} {getSiloLevel()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.research?.impulseDrive || 'Motor de Impulso'}:</span>
                    <span className="text-cyber-blue font-semibold">
                      {t.common.level} {getImpulseDriveLevel()}
                    </span>
                  </div>
                  {currentPlanet && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t.galaxy.missileMaxRange}:</span>
                      <span className="text-white">
                        {getMissileMaxRange()} {t.galaxy.solarSystems}
                      </span>
                    </div>
                  )}
                  {currentPlanet && missileModal && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t.galaxy.distance}:</span>
                      <span className={`font-semibold ${Math.abs(currentPlanet.solar_system - missileModal.system) <= getMissileMaxRange() ? 'text-cyber-green' : 'text-cyber-red'}`}>
                        {Math.abs(currentPlanet.solar_system - missileModal.system)} {t.galaxy.solarSystems}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm text-gray-400">{t.galaxy.missilePrimaryTarget || 'Objetivo prioritario'}</label>
                  <select
                    value={primaryTarget}
                    onChange={(e) => setPrimaryTarget(e.target.value)}
                    className="w-full px-4 py-2 bg-space-800 border border-cyber-orange/30 rounded-lg text-white font-orbitron text-sm appearance-none cursor-pointer"
                  >
                    <option value="">{t.galaxy.missileNoTarget || 'Ninguno (más débil primero)'}</option>
                    {defenseTypes
                      .filter(dt => !['anti_ballistic_missile', 'interplanetary_missile'].includes(dt.code))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(dt => (
                        <option key={dt.code} value={dt.code}>{dt.name}</option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm text-gray-400">{t.galaxy.missileCount}</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMissileCount(Math.max(1, missileCount - 1))}
                      className="px-3 py-2 bg-space-700 hover:bg-space-600 rounded-lg text-white font-semibold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={missileCount}
                      onChange={(e) => {
                        const max = defenses.find(d => d.defense_type?.code === 'interplanetary_missile')?.quantity || 0;
                        setMissileCount(Math.min(max, Math.max(1, parseInt(e.target.value) || 1)));
                      }}
                      className="flex-1 px-4 py-2 bg-space-800 border border-cyber-orange/30 rounded-lg text-center text-white font-orbitron"
                      min={1}
                      max={defenses.find(d => d.defense_type?.code === 'interplanetary_missile')?.quantity || 0}
                    />
                    <button
                      onClick={() => {
                        const max = defenses.find(d => d.defense_type?.code === 'interplanetary_missile')?.quantity || 0;
                        setMissileCount(Math.min(max, missileCount + 1));
                      }}
                      className="px-3 py-2 bg-space-700 hover:bg-space-600 rounded-lg text-white font-semibold"
                    >
                      +
                    </button>
                  </div>
                </div>

                <PeaceShieldAttackWarning action="lanzamiento de misiles" />

                <div className="flex gap-3">
                  <button
                    onClick={() => setMissileModal(null)}
                    className="flex-1 px-4 py-3 bg-space-700 hover:bg-space-600 rounded-lg text-white font-semibold transition-colors"
                  >
                    {t.galaxy.missileCancel}
                  </button>
                  <button
                    onClick={handleLaunchMissile}
                    disabled={launchingMissile}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-cyber-orange to-cyber-red hover:from-cyber-orange/80 hover:to-cyber-red/80 rounded-lg text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {launchingMissile ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Target className="w-5 h-5" />
                        {t.galaxy.missileLaunch}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phalanx Scan Modal */}
      {phalanxModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card-glass max-w-lg w-full p-6 space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-orbitron text-xl text-white flex items-center gap-2">
                <Radio className="w-6 h-6 text-purple-400" />
                {t.galaxy.phalanxTitle}
              </h2>
              <button
                onClick={() => { setPhalanxModal(null); setPhalanxResult(null); }}
                className="p-2 hover:bg-space-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {phalanxResult?.success ? (
              <div className="space-y-4">
                {/* Scan info */}
                <div className="bg-space-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.planet}:</span>
                    <span className="text-white font-semibold">{phalanxResult.planet_name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.player}:</span>
                    <span className="text-cyber-blue font-semibold">{phalanxResult.player}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.position}:</span>
                    <span className="text-white">{phalanxResult.coordinates}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.phalanxRange}:</span>
                    <span className="text-purple-400">{phalanxResult.phalanx_range} {t.galaxy.phalanxSystems}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.resources.deuterium}:</span>
                    <span className="text-cyan-400">-{phalanxResult.deuterium_used?.toLocaleString()}</span>
                  </div>
                </div>

                {/* Fleet movements */}
                {phalanxResult.fleets && phalanxResult.fleets.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-purple-400 flex items-center gap-2">
                      <Radio className="w-4 h-4" />
                      {t.galaxy.phalanxFleets} ({phalanxResult.fleets.length})
                    </h3>
                    {phalanxResult.fleets.map((fleet, idx) => (
                      <div key={idx} className="bg-space-800 rounded-lg p-4 space-y-2 border border-purple-500/20">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-white">
                            {getMissionName(fleet.mission)}
                          </span>
                          <span className="text-xs text-gray-500">#{idx + 1}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">{t.galaxy.phalanxOrigin}:</span>
                            <span className="text-gray-300 ml-1">{fleet.origin}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">{t.galaxy.phalanxDestination}:</span>
                            <span className="text-gray-300 ml-1">{fleet.destination}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">{t.galaxy.phalanxArrival}:</span>
                            <span className="text-cyber-yellow ml-1">{formatPhalanxTime(fleet.arrival_time)}</span>
                          </div>
                          {fleet.return_time && (
                            <div>
                              <span className="text-gray-500">{t.galaxy.phalanxReturn}:</span>
                              <span className="text-gray-400 ml-1">{formatPhalanxTime(fleet.return_time)}</span>
                            </div>
                          )}
                        </div>
                        {fleet.ships && fleet.ships.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-space-600">
                            <span className="text-xs text-gray-500 block mb-1">{t.galaxy.phalanxShips}:</span>
                            <div className="flex flex-wrap gap-2">
                              {fleet.ships.map((ship, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="text-xs px-2 py-0.5 bg-space-700 rounded text-gray-300"
                                >
                                  {ship.type}: {ship.quantity.toLocaleString()}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-space-800 rounded-lg p-6 text-center">
                    <Radio className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">{t.galaxy.phalanxNoFleets}</p>
                  </div>
                )}

                <button
                  onClick={() => { setPhalanxModal(null); setPhalanxResult(null); }}
                  className="w-full px-4 py-3 bg-space-700 hover:bg-space-600 rounded-lg text-white font-semibold transition-colors"
                >
                  {t.galaxy.missileClose || 'Cerrar'}
                </button>
              </div>
            ) : phalanxResult && !phalanxResult.success ? (
              <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-sm text-red-400">{phalanxResult.error || phalanxResult.reason || 'Error desconocido'}</p>
                </div>
                <button
                  onClick={() => { setPhalanxModal(null); setPhalanxResult(null); }}
                  className="w-full px-4 py-3 bg-space-700 hover:bg-space-600 rounded-lg text-white font-semibold transition-colors"
                >
                  {t.galaxy.missileClose || 'Cerrar'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Target info */}
                <div className="bg-space-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.position}:</span>
                    <span className="text-white font-semibold">
                      {formatCoordinates(phalanxModal.galaxy, phalanxModal.system, phalanxModal.position)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t.galaxy.phalanxCost}:</span>
                    <span className="text-cyan-400 font-semibold">5.000 {t.resources.deuterium}</span>
                  </div>
                  {(() => {
                    const selMoon = userMoonsPhalanx.find(m => m.moon_id === phalanxSelectedMoon);
                    if (!selMoon) return null;
                    const hasEnough = selMoon.deuterium >= 5000;
                    return (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">{t.resources.deuterium} {t.galaxy.phalanxAvailable}:</span>
                        <span className={`font-semibold ${hasEnough ? 'text-green-400' : 'text-red-400'}`}>
                          {selMoon.deuterium.toLocaleString()} {hasEnough ? '✅' : '⚠️'}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Deuterium warning */}
                {(() => {
                  const selMoon = userMoonsPhalanx.find(m => m.moon_id === phalanxSelectedMoon);
                  if (!selMoon || selMoon.deuterium >= 5000) return null;
                  return (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center gap-2">
                      <Fuel className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs text-amber-300">
                        {t.galaxy.phalanxInsufficientDeut}: {selMoon.deuterium.toLocaleString()} / 5.000 — {t.galaxy.phalanxNeedTransport}
                      </span>
                    </div>
                  );
                })()}

                {/* Moon selector */}
                {(() => {
                  const moonsInRange = getPhalanxMoonsInRange(phalanxModal.galaxy, phalanxModal.system);
                  return (
                    <div className="space-y-2">
                      <label className="block text-sm text-gray-400">{t.galaxy.phalanxSelectMoon}:</label>
                      {moonsInRange.length === 1 ? (
                        <div className="px-4 py-2 bg-space-800 border border-purple-500/30 rounded-lg text-white text-sm">
                          🌙 {moonsInRange[0].moon_name} [{moonsInRange[0].galaxy}:{moonsInRange[0].solar_system}:{moonsInRange[0].position}]
                          <span className="text-purple-400 ml-2">
                            ({t.galaxy.phalanxTitle} {t.common.level} {moonsInRange[0].phalanx_level} — {t.galaxy.phalanxRange}: {moonsInRange[0].phalanx_range} {t.galaxy.phalanxSystems})
                          </span>
                          <span className={`ml-2 ${moonsInRange[0].deuterium >= 5000 ? 'text-green-400' : 'text-red-400'}`}>
                            | ⛽ {moonsInRange[0].deuterium.toLocaleString()} deut
                          </span>
                        </div>
                      ) : (
                        <select
                          value={phalanxSelectedMoon}
                          onChange={(e) => setPhalanxSelectedMoon(e.target.value)}
                          className="w-full px-4 py-2 bg-space-800 border border-purple-500/30 rounded-lg text-white text-sm appearance-none cursor-pointer"
                        >
                          {moonsInRange.map(m => (
                            <option key={m.moon_id} value={m.moon_id}>
                              🌙 {m.moon_name} [{m.galaxy}:{m.solar_system}:{m.position}] — Lvl {m.phalanx_level} (Range: {m.phalanx_range}) | Deut: {m.deuterium.toLocaleString()}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })()}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setPhalanxModal(null); setPhalanxResult(null); }}
                    className="flex-1 px-4 py-3 bg-space-700 hover:bg-space-600 rounded-lg text-white font-semibold transition-colors"
                  >
                    {t.galaxy.missileCancel}
                  </button>
                  <button
                    onClick={handlePhalanxScan}
                    disabled={phalanxLoading}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 rounded-lg text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {phalanxLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Radio className="w-5 h-5" />
                        {t.galaxy.phalanxScan}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
