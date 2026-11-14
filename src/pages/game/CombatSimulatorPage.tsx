/**
 * CombatSimulatorPage - Calculadora de Combate
 *
 * Simulador de combate 100% frontend que lee datos existentes
 * de ship_types y defense_types. No modifica la base de datos.
 * Implementa el algoritmo de combate estilo OGame/XNova.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Swords,
  Shield,
  Crosshair,
  Zap,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Skull,
  Trophy,
  Scale,
  Flame,
  Sparkles,
  Target,
  Package,
  Info,
  Play,
  Minus,
  Plus,
  Eye,
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { useI18n, translateShipName, translateDefenseName } from '../../lib/i18n';
import { formatNumber } from '../../lib/utils';
import { getBattleEffectStyle } from '../../lib/battleEffects';
import {
  runSimulation,
  MAX_UNITS_PER_TYPE,
  type SimFleetConfig,
  type SimulatorUnit,
  type SimulationResult,
} from '../../lib/combatSimulator';

// ============================================
// COMPONENTES AUXILIARES
// ============================================

function TechInput({
  label,
  icon: Icon,
  value,
  onChange,
  color,
}: {
  label: string;
  icon: typeof Crosshair;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-2 bg-space-800/60 rounded-lg px-3 py-2 border border-${color}/20`}>
      <Icon className={`w-4 h-4 text-${color}`} />
      <span className="text-xs text-gray-400 flex-1">{label}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-5 h-5 flex items-center justify-center rounded bg-space-700 hover:bg-space-600 transition-colors"
        >
          <Minus className="w-3 h-3 text-gray-400" />
        </button>
        <input
          type="number"
          min="0"
          max="30"
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
          className="w-10 text-center text-xs font-mono bg-space-900/80 border border-white/10 rounded py-1 text-white focus:outline-none focus:border-cyber-blue/50"
        />
        <button
          onClick={() => onChange(Math.min(30, value + 1))}
          className="w-5 h-5 flex items-center justify-center rounded bg-space-700 hover:bg-space-600 transition-colors"
        >
          <Plus className="w-3 h-3 text-gray-400" />
        </button>
      </div>
    </div>
  );
}

function UnitQuantityInput({
  name,
  code,
  quantity,
  onChange,
  weapon,
  shield,
  hull,
}: {
  name: string;
  code: string;
  quantity: number;
  onChange: (code: string, qty: number) => void;
  weapon: number;
  shield: number;
  hull: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="group">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 ${
          quantity > 0
            ? 'bg-cyber-blue/10 border border-cyber-blue/30'
            : 'bg-space-800/40 border border-white/5 hover:border-white/15'
        }`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 hover:bg-white/10 rounded transition-colors"
        >
          {expanded ? (
            <ChevronUp className="w-3 h-3 text-gray-500" />
          ) : (
            <ChevronDown className="w-3 h-3 text-gray-500" />
          )}
        </button>
        <span className="text-xs text-gray-300 flex-1 truncate">{name}</span>
        <input
          type="number"
          min="0"
          max={MAX_UNITS_PER_TYPE}
          value={quantity || ''}
          placeholder="0"
          onChange={(e) =>
            onChange(
              code,
              Math.min(MAX_UNITS_PER_TYPE, Math.max(0, Math.floor(Number(e.target.value) || 0)))
            )
          }
          className="w-20 text-right text-xs font-mono bg-space-900/80 border border-white/10 rounded py-1 px-2 text-white focus:outline-none focus:border-cyber-blue/50 placeholder-gray-600"
        />
      </div>
      {expanded && (
        <div className="flex gap-3 px-8 py-1.5 text-[10px]">
          <span className="text-red-400">⚔ {formatNumber(weapon)}</span>
          <span className="text-cyan-400">🛡 {formatNumber(shield)}</span>
          <span className="text-amber-400">🔩 {formatNumber(hull)}</span>
        </div>
      )}
    </div>
  );
}

function ResultBadge({ result }: { result: 'attacker_won' | 'defender_won' | 'draw' }) {
  const config = {
    attacker_won: {
      icon: Trophy,
      text: 'Victoria del Atacante',
      color: 'from-green-600 to-emerald-800',
      border: 'border-green-500/50',
      glow: 'shadow-green-500/30',
      textColor: 'text-green-300',
    },
    defender_won: {
      icon: Shield,
      text: 'Victoria del Defensor',
      color: 'from-red-600 to-rose-800',
      border: 'border-red-500/50',
      glow: 'shadow-red-500/30',
      textColor: 'text-red-300',
    },
    draw: {
      icon: Scale,
      text: 'Empate',
      color: 'from-amber-600 to-yellow-800',
      border: 'border-amber-500/50',
      glow: 'shadow-amber-500/30',
      textColor: 'text-amber-300',
    },
  };

  const c = config[result];
  const Icon = c.icon;

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-gradient-to-r ${c.color} ${c.border} border p-5 shadow-lg ${c.glow} text-center`}
    >
      {/* Brillo superior */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.18),transparent_70%)]" />
      {/* Rejilla sutil */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      {/* Barrido de luz */}
      <div className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent blur-md animate-shimmer" />
      {/* Halo pulsante */}
      <div
        className={`absolute -inset-8 rounded-full bg-gradient-to-r ${c.color} opacity-25 blur-3xl animate-pulse`}
      />

      <div className="relative flex items-center justify-center gap-3">
        <Icon className={`w-8 h-8 ${c.textColor} drop-shadow-[0_0_10px_currentColor]`} />
        <span
          className={`font-orbitron text-xl font-bold tracking-wide ${c.textColor} drop-shadow-[0_0_14px_currentColor]`}
        >
          {c.text}
        </span>
      </div>
    </div>
  );
}

// ============================================
// PARAMETROS REALES DEL SERVIDOR
// admin_speed_settings: fleet_debris_ratio = 30, defense_debris_ratio = 0
// ============================================
const FLEET_DEBRIS_RATIO = 0.30;
const DEFENSE_DEBRIS_RATIO = 0;

/**
 * Panel de balance: compara el coste destruido de cada bando y muestra
 * quien sale ganando en recursos, con barras en degradado.
 */
function BattleBalance({ result }: { result: SimulationResult }) {
  const attLost =
    result.attackerLosses.metal + result.attackerLosses.crystal + result.attackerLosses.deuterium;
  const defLost =
    result.defenderLosses.metal + result.defenderLosses.crystal + result.defenderLosses.deuterium;
  const total = attLost + defLost;

  const attPct = total > 0 ? (attLost / total) * 100 : 50;
  const defPct = 100 - attPct;

  const debris = result.debrisMetal + result.debrisCrystal;
  const loot = result.loot.metal + result.loot.crystal + result.loot.deuterium;

  // Balance del atacante: gana botin + la mitad del campo de escombros (referencia)
  const attackerNet = loot + debris * 0.5 - attLost;
  const netPositive = attackerNet >= 0;

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-space-800/90 via-space-900/95 to-black border border-white/10 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.07),transparent_65%)]" />
      <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-red-600/10 blur-3xl" />
      <div className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full bg-cyan-600/10 blur-3xl" />

      <div className="relative">
        <h3 className="font-orbitron text-sm text-white mb-3 flex items-center gap-2">
          <Scale className="w-4 h-4 text-purple-400" />
          Balance de la batalla
        </h3>

        {/* Barra comparativa de destruccion */}
        <div className="mb-3">
          <div className="flex justify-between text-[10px] font-mono mb-1">
            <span className="text-red-400">Atacante destruido: {formatNumber(attLost)}</span>
            <span className="text-cyan-400">Defensor destruido: {formatNumber(defLost)}</span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-space-900 border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-red-700 via-red-500 to-orange-400 transition-all duration-700"
              style={{ width: `${attPct}%` }}
            />
            <div
              className="h-full bg-gradient-to-l from-cyan-600 via-cyan-400 to-blue-400 transition-all duration-700"
              style={{ width: `${defPct}%` }}
            />
          </div>
        </div>

        {/* Tarjetas de balance */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/20 px-2.5 py-2">
            <span className="text-[9px] uppercase tracking-wider text-amber-400/70 block">
              Escombros
            </span>
            <span className="font-mono text-sm text-amber-300">{formatNumber(debris)}</span>
          </div>
          <div className="rounded-lg bg-gradient-to-b from-green-500/10 to-transparent border border-green-500/20 px-2.5 py-2">
            <span className="text-[9px] uppercase tracking-wider text-green-400/70 block">
              Botín
            </span>
            <span className="font-mono text-sm text-green-300">{formatNumber(loot)}</span>
          </div>
          <div
            className={`rounded-lg bg-gradient-to-b border px-2.5 py-2 ${
              netPositive
                ? 'from-emerald-500/15 to-transparent border-emerald-500/30'
                : 'from-rose-500/15 to-transparent border-rose-500/30'
            }`}
          >
            <span
              className={`text-[9px] uppercase tracking-wider block ${
                netPositive ? 'text-emerald-400/70' : 'text-rose-400/70'
              }`}
            >
              Beneficio atacante
            </span>
            <span
              className={`font-mono text-sm ${netPositive ? 'text-emerald-300' : 'text-rose-300'}`}
            >
              {netPositive ? '+' : ''}
              {formatNumber(Math.round(attackerNet))}
            </span>
          </div>
        </div>

        <p className="text-[10px] text-gray-600 mt-2">
          El beneficio estima botín + el 50% del campo de escombros (lo que suele recoger el
          atacante) menos sus propias pérdidas.
        </p>
      </div>
    </div>
  );
}

// ============================================
// PÁGINA PRINCIPAL
// ============================================

// [SIMFIX1] El combate real (perform_combat) EXCLUYE explicitamente estas
// defensas: los misiles no participan en la batalla. Si el simulador las
// cuenta, el defensor sale inflado y el resultado no cuadra con la realidad.
const NON_COMBAT_DEFENSE_CODES = new Set(['interplanetary_missile', 'anti_ballistic_missile']);

// Datos que llegan desde el boton "Simular batalla" del informe de espionaje
interface EspionagePrefill {
  planet_name?: string;
  coordinates?: string;
  resources?: { metal?: number; crystal?: number; deuterium?: number };
  ships?: Array<{ name: string; quantity: number }>;
  defenses?: Array<{ name: string; quantity: number }>;
  technologies?: Array<{ name: string; level: number }>;
  allied_fleets?: Array<{ owner: string; ships: Array<{ name: string; quantity: number }> }>;
}

export function CombatSimulatorPage() {
  const {
    shipTypes,
    defenseTypes,
    technologies,
    technologyTypes,
    fetchShipTypes,
    fetchDefenseTypes,
    fetchTechnologyTypes,
  } = useGameStore();
  const { profile } = useAuthStore();
  const { t } = useI18n();
  const location = useLocation();

  const activeBattleEffect = profile?.active_battle_effect || null;
  const effectStyle = getBattleEffectStyle(activeBattleEffect);

  // Tecnologías del atacante
  const [attWeapons, setAttWeapons] = useState(0);
  const [attShield, setAttShield] = useState(0);
  const [attArmour, setAttArmour] = useState(0);

  // Tecnologías del defensor
  const [defWeapons, setDefWeapons] = useState(0);
  const [defShield, setDefShield] = useState(0);
  const [defArmour, setDefArmour] = useState(0);

  // Cantidades del atacante (solo naves)
  const [attackerQuantities, setAttackerQuantities] = useState<Record<string, number>>({});
  // Cantidades del defensor (naves + defensas)
  const [defenderShipQuantities, setDefenderShipQuantities] = useState<Record<string, number>>({});
  const [defenderDefenseQuantities, setDefenderDefenseQuantities] = useState<Record<string, number>>({});

  // Recursos del defensor (para calcular botín)
  const [defResources, setDefResources] = useState({ metal: 0, crystal: 0, deuterium: 0 });

  // Resultado
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showAttackerSection, setShowAttackerSection] = useState(true);
  const [showDefenderSection, setShowDefenderSection] = useState(true);

  // Origen de los datos del defensor cuando se llega desde un informe de espionaje
  const [spySource, setSpySource] = useState<{ planet_name: string; coordinates: string } | null>(null);
  const spyApplied = useRef(false);

  // Cargar datos si no están
  useEffect(() => {
    fetchShipTypes();
    fetchDefenseTypes();
    fetchTechnologyTypes();
  }, [fetchShipTypes, fetchDefenseTypes, fetchTechnologyTypes]);

  // Precarga del defensor con los datos de un informe de espionaje.
  // Solo ocurre si se entra pulsando "Simular batalla" desde el informe;
  // entrando al simulador de forma normal los campos quedan vacios.
  // El informe guarda los NOMBRES de las unidades, el simulador trabaja con
  // los CODIGOS, por eso se traduce de nombre a codigo con las tablas del juego.
  useEffect(() => {
    const spy = (location.state as { espionage?: EspionagePrefill } | null)?.espionage;
    if (!spy || spyApplied.current) return;
    if (shipTypes.length === 0 || defenseTypes.length === 0 || technologyTypes.length === 0) return;

    const norm = (s: string) => (s || '').trim().toLowerCase();
    const shipByName = new Map(shipTypes.map(s => [norm(s.name), s.code]));
    const defenseByName = new Map(
      defenseTypes
        .filter(d => !NON_COMBAT_DEFENSE_CODES.has(d.code))
        .map(d => [norm(d.name), d.code])
    );
    const techByName = new Map(technologyTypes.map(tt => [norm(tt.name), tt.code]));

    const ships: Record<string, number> = {};
    const addShip = (name: string, qty: number) => {
      const code = shipByName.get(norm(name));
      if (code && qty > 0) ships[code] = (ships[code] || 0) + qty;
    };
    for (const s of spy.ships || []) addShip(s.name, s.quantity);
    // Las flotas aliadas estacionadas tambien defienden el planeta
    for (const ally of spy.allied_fleets || []) {
      for (const s of ally.ships || []) addShip(s.name, s.quantity);
    }

    const defenses: Record<string, number> = {};
    for (const d of spy.defenses || []) {
      const code = defenseByName.get(norm(d.name));
      if (code && d.quantity > 0) defenses[code] = (defenses[code] || 0) + d.quantity;
    }

    let weapons = 0;
    let shield = 0;
    let armour = 0;
    for (const tech of spy.technologies || []) {
      const code = techByName.get(norm(tech.name));
      if (code === 'weapons_tech') weapons = tech.level || 0;
      else if (code === 'shielding_tech') shield = tech.level || 0;
      else if (code === 'armour_tech') armour = tech.level || 0;
    }

    setDefenderShipQuantities(ships);
    setDefenderDefenseQuantities(defenses);
    setDefWeapons(weapons);
    setDefShield(shield);
    setDefArmour(armour);
    setDefResources({
      metal: Math.floor(spy.resources?.metal || 0),
      crystal: Math.floor(spy.resources?.crystal || 0),
      deuterium: Math.floor(spy.resources?.deuterium || 0),
    });
    setSpySource({ planet_name: spy.planet_name || '', coordinates: spy.coordinates || '' });
    spyApplied.current = true;
  }, [location.state, shipTypes, defenseTypes, technologyTypes]);

  // Pre-cargar tecnologías del jugador actual
  useEffect(() => {
    const weaponsTech = technologies.find(t => t.technology_type?.code === 'weapons_tech')?.level || 0;
    const shieldTech = technologies.find(t => t.technology_type?.code === 'shielding_tech')?.level || 0;
    const armourTech = technologies.find(t => t.technology_type?.code === 'armour_tech')?.level || 0;
    setAttWeapons(weaponsTech);
    setAttShield(shieldTech);
    setAttArmour(armourTech);
  }, [technologies]);

  // Naves de combate y civiles separadas
  const combatShips = useMemo(() => shipTypes.filter(s => s.category === 'combat'), [shipTypes]);
  const civilShips = useMemo(() => shipTypes.filter(s => s.category === 'civil'), [shipTypes]);
  const specialShips = useMemo(() => shipTypes.filter(s => s.category === 'special' && s.code !== 'falco_x_clasica'), [shipTypes]);
  const allShips = useMemo(() => [...combatShips, ...civilShips, ...specialShips], [combatShips, civilShips, specialShips]);
  // [SIMFIX1] Misiles fuera: no entran al combate real.
  const combatDefenseTypes = useMemo(
    () => defenseTypes.filter(d => !NON_COMBAT_DEFENSE_CODES.has(d.code)),
    [defenseTypes]
  );

  const handleAttackerChange = useCallback((code: string, qty: number) => {
    setAttackerQuantities(prev => ({ ...prev, [code]: qty }));
  }, []);

  const handleDefenderShipChange = useCallback((code: string, qty: number) => {
    setDefenderShipQuantities(prev => ({ ...prev, [code]: qty }));
  }, []);

  const handleDefenderDefenseChange = useCallback((code: string, qty: number) => {
    setDefenderDefenseQuantities(prev => ({ ...prev, [code]: qty }));
  }, []);

  const resetAll = () => {
    setAttackerQuantities({});
    setDefenderShipQuantities({});
    setDefenderDefenseQuantities({});
    setAttWeapons(0);
    setAttShield(0);
    setAttArmour(0);
    setDefWeapons(0);
    setDefShield(0);
    setDefArmour(0);
    setDefResources({ metal: 0, crystal: 0, deuterium: 0 });
    setSpySource(null);
    setSimResult(null);
  };

  const buildFleetConfig = (
    quantities: Record<string, number>,
    types: Array<{ code: string; name: string; weapon_power: number; shield_power: number; structural_integrity: number; rapid_fire?: Record<string, number>; cargo_capacity?: number; metal_cost?: number; crystal_cost?: number; deuterium_cost?: number }>,
    weaponsTech: number,
    shieldTech: number,
    armourTech: number,
    isDefense: boolean = false
  ): SimFleetConfig => {
    const units: SimulatorUnit[] = [];

    for (const type of types) {
      const qty = quantities[type.code] || 0;
      if (qty > 0) {
        units.push({
          code: type.code,
          name: type.name,
          quantity: qty,
          weapon: type.weapon_power,
          shield: type.shield_power,
          hull: type.structural_integrity,
          rapidFire: type.rapid_fire || {},
          isDefense,
          metalCost: type.metal_cost || 0,
          crystalCost: type.crystal_cost || 0,
          deuteriumCost: type.deuterium_cost || 0,
        });
      }
    }

    return { units, weaponsTech, shieldTech, armourTech };
  };

  const runSim = () => {
    setIsRunning(true);
    setSimResult(null);

    // Pequeño delay para animación
    setTimeout(() => {
      const attackerConfig = buildFleetConfig(
        attackerQuantities,
        allShips,
        attWeapons,
        attShield,
        attArmour
      );

      // Calcular cargo total del atacante
      let totalCargo = 0;
      for (const s of allShips) {
        const qty = attackerQuantities[s.code] || 0;
        if (qty > 0 && s.cargo_capacity) {
          totalCargo += qty * s.cargo_capacity;
        }
      }

      // Combinar naves y defensas del defensor
      const defenderShipsConfig = buildFleetConfig(
        defenderShipQuantities,
        allShips,
        defWeapons,
        defShield,
        defArmour
      );

      const defenderDefenseConfig = buildFleetConfig(
        defenderDefenseQuantities,
        combatDefenseTypes,
        defWeapons,
        defShield,
        defArmour,
        true
      );

      const defenderConfig: SimFleetConfig = {
        units: [...defenderShipsConfig.units, ...defenderDefenseConfig.units],
        weaponsTech: defWeapons,
        shieldTech: defShield,
        armourTech: defArmour,
      };

      const result = runSimulation(attackerConfig, defenderConfig, {
        defenderResources: defResources,
        attackerCargo: totalCargo,
        fleetDebrisRatio: FLEET_DEBRIS_RATIO,
        defenseDebrisRatio: DEFENSE_DEBRIS_RATIO,
      });

      setSimResult(result);
      setIsRunning(false);
    }, 400);
  };

  const hasAttackerUnits = Object.values(attackerQuantities).some(q => q > 0);
  const hasDefenderUnits =
    Object.values(defenderShipQuantities).some(q => q > 0) ||
    Object.values(defenderDefenseQuantities).some(q => q > 0);
  const canSimulate = hasAttackerUnits && hasDefenderUnits;

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-space-800/90 via-space-900/95 to-black border p-5 transition-all duration-500 ${effectStyle ? effectStyle.border + ' ' + effectStyle.glow : 'border-cyber-blue/20'}`}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.08),transparent_60%)]" />
        <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl transition-all duration-500 ${effectStyle ? effectStyle.particle.replace('bg-gradient-to-r', 'bg-gradient-to-bl') + ' opacity-20' : 'bg-gradient-to-bl from-purple-600/5 to-transparent'}`} />
        <div className="relative flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/30 to-orange-600/30 border border-red-500/30 flex items-center justify-center shadow-lg ${effectStyle ? effectStyle.glow : 'shadow-red-500/10'}`}>
            <Swords className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1">
            <h1 className="font-orbitron text-xl font-bold text-white tracking-wide">
              Simulador de Combate
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Simula batallas y analiza resultados antes de atacar
            </p>
          </div>
          {effectStyle && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${effectStyle.badge}`}>
              <span className="animate-pulse">{effectStyle.emoji}</span>
              <span>{effectStyle.label}</span>
            </div>
          )}
        </div>
      </div>

      {spySource && (
        <div className="flex items-start gap-3 rounded-xl bg-cyber-blue/10 border border-cyber-blue/30 p-3">
          <Eye className="w-4 h-4 text-cyber-blue flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-200 leading-relaxed">
            Datos del defensor cargados desde el informe de espionaje de{' '}
            <span className="font-semibold text-white">{spySource.planet_name}</span>{' '}
            <span className="font-mono text-cyber-blue">{spySource.coordinates}</span>. Revisa que
            la informacion siga siendo valida: el informe es una foto del momento en que llegaron
            tus sondas y el oponente puede haber cambiado su ejército o sus defensas.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ============================================ */}
        {/* ATACANTE */}
        {/* ============================================ */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-space-800/80 to-space-900/90 border border-red-500/20 shadow-lg shadow-red-500/5">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(239,68,68,0.06),transparent_60%)]" />
          <div className="relative">
            {/* Atacante Header */}
            <button
              onClick={() => setShowAttackerSection(!showAttackerSection)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                  <Crosshair className="w-4 h-4 text-red-400" />
                </div>
                <span className="font-orbitron text-sm font-bold text-red-400 tracking-wider">
                  ATACANTE
                </span>
                {hasAttackerUnits && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-[10px] text-red-300 font-mono">
                    {Object.values(attackerQuantities).reduce((a, b) => a + b, 0)} unidades
                  </span>
                )}
              </div>
              {showAttackerSection ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {showAttackerSection && (
              <div className="px-4 pb-4 space-y-3">
                {/* Tecnologías del atacante */}
                <div className="space-y-1.5">
                  <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-1">
                    Tecnologías de combate
                  </h3>
                  <TechInput label="Armas" icon={Crosshair} value={attWeapons} onChange={setAttWeapons} color="red-400" />
                  <TechInput label="Escudo" icon={Shield} value={attShield} onChange={setAttShield} color="cyan-400" />
                  <TechInput label="Blindaje" icon={Target} value={attArmour} onChange={setAttArmour} color="amber-400" />
                </div>

                {/* Naves de combate */}
                <div className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-1 flex items-center gap-1.5">
                    <Flame className="w-3 h-3 text-red-400" />
                    Tropas de combate
                  </h3>
                  <div className="space-y-0.5">
                    {combatShips.map((s) => (
                      <UnitQuantityInput
                        key={s.code}
                        name={translateShipName(t, s.code, s.name)}
                        code={s.code}
                        quantity={attackerQuantities[s.code] || 0}
                        onChange={handleAttackerChange}
                        weapon={s.weapon_power}
                        shield={s.shield_power}
                        hull={s.structural_integrity}
                      />
                    ))}
                  </div>
                </div>

                {/* Naves civiles */}
                <div className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-1 flex items-center gap-1.5">
                    <Package className="w-3 h-3 text-blue-400" />
                    Tropas civiles
                  </h3>
                  <div className="space-y-0.5">
                    {civilShips.map((s) => (
                      <UnitQuantityInput
                        key={s.code}
                        name={translateShipName(t, s.code, s.name)}
                        code={s.code}
                        quantity={attackerQuantities[s.code] || 0}
                        onChange={handleAttackerChange}
                        weapon={s.weapon_power}
                        shield={s.shield_power}
                        hull={s.structural_integrity}
                      />
                    ))}
                  </div>
                </div>

                {/* Naves especiales */}
                {specialShips.length > 0 && (
                  <div className="space-y-1">
                    <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-1 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      Tropas especiales
                    </h3>
                    <div className="space-y-0.5">
                      {specialShips.map((s) => (
                        <UnitQuantityInput
                          key={s.code}
                          name={translateShipName(t, s.code, s.name)}
                          code={s.code}
                          quantity={attackerQuantities[s.code] || 0}
                          onChange={handleAttackerChange}
                          weapon={s.weapon_power}
                          shield={s.shield_power}
                          hull={s.structural_integrity}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================================ */}
        {/* DEFENSOR */}
        {/* ============================================ */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-space-800/80 to-space-900/90 border border-cyan-500/20 shadow-lg shadow-cyan-500/5">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.06),transparent_60%)]" />
          <div className="relative">
            {/* Defensor Header */}
            <button
              onClick={() => setShowDefenderSection(!showDefenderSection)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-cyan-400" />
                </div>
                <span className="font-orbitron text-sm font-bold text-cyan-400 tracking-wider">
                  DEFENSOR
                </span>
                {hasDefenderUnits && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-[10px] text-cyan-300 font-mono">
                    {Object.values(defenderShipQuantities).reduce((a, b) => a + b, 0) +
                      Object.values(defenderDefenseQuantities).reduce((a, b) => a + b, 0)}{' '}
                    unidades
                  </span>
                )}
              </div>
              {showDefenderSection ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {showDefenderSection && (
              <div className="px-4 pb-4 space-y-3">
                {/* Tecnologías del defensor */}
                <div className="space-y-1.5">
                  <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-1">
                    Tecnologías de combate
                  </h3>
                  <TechInput label="Armas" icon={Crosshair} value={defWeapons} onChange={setDefWeapons} color="red-400" />
                  <TechInput label="Escudo" icon={Shield} value={defShield} onChange={setDefShield} color="cyan-400" />
                  <TechInput label="Blindaje" icon={Target} value={defArmour} onChange={setDefArmour} color="amber-400" />
                </div>

                {/* Naves del defensor */}
                <div className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-1 flex items-center gap-1.5">
                    <Flame className="w-3 h-3 text-red-400" />
                    Tropas de combate
                  </h3>
                  <div className="space-y-0.5">
                    {combatShips.map((s) => (
                      <UnitQuantityInput
                        key={s.code}
                        name={translateShipName(t, s.code, s.name)}
                        code={s.code}
                        quantity={defenderShipQuantities[s.code] || 0}
                        onChange={handleDefenderShipChange}
                        weapon={s.weapon_power}
                        shield={s.shield_power}
                        hull={s.structural_integrity}
                      />
                    ))}
                  </div>
                </div>

                {/* Naves civiles del defensor */}
                <div className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-1 flex items-center gap-1.5">
                    <Package className="w-3 h-3 text-blue-400" />
                    Tropas civiles
                  </h3>
                  <div className="space-y-0.5">
                    {civilShips.map((s) => (
                      <UnitQuantityInput
                        key={s.code}
                        name={translateShipName(t, s.code, s.name)}
                        code={s.code}
                        quantity={defenderShipQuantities[s.code] || 0}
                        onChange={handleDefenderShipChange}
                        weapon={s.weapon_power}
                        shield={s.shield_power}
                        hull={s.structural_integrity}
                      />
                    ))}
                  </div>
                </div>

                {/* Naves especiales del defensor */}
                {specialShips.length > 0 && (
                  <div className="space-y-1">
                    <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-1 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      Tropas especiales
                    </h3>
                    <div className="space-y-0.5">
                      {specialShips.map((s) => (
                        <UnitQuantityInput
                          key={s.code}
                          name={translateShipName(t, s.code, s.name)}
                          code={s.code}
                          quantity={defenderShipQuantities[s.code] || 0}
                          onChange={handleDefenderShipChange}
                          weapon={s.weapon_power}
                          shield={s.shield_power}
                          hull={s.structural_integrity}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Defensas */}
                <div className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-1 flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-green-400" />
                    Defensas planetarias
                  </h3>
                  <div className="space-y-0.5">
                    {combatDefenseTypes.map((d) => (
                      <UnitQuantityInput
                        key={d.code}
                        name={translateDefenseName(t, d.code, d.name)}
                        code={d.code}
                        quantity={defenderDefenseQuantities[d.code] || 0}
                        onChange={handleDefenderDefenseChange}
                        weapon={d.weapon_power}
                        shield={d.shield_power}
                        hull={d.structural_integrity}
                      />
                    ))}
                  </div>
                </div>

                {/* Recursos del defensor */}
                <div className="space-y-1.5">
                  <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold px-1 flex items-center gap-1.5">
                    <Info className="w-3 h-3 text-gray-400" />
                    Recursos del defensor (para calcular botín)
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-space-800/60 rounded-lg px-2 py-1.5 border border-white/5">
                      <span className="text-[10px] text-gray-500 block">Hierro</span>
                      <input
                        type="number"
                        min="0"
                        value={defResources.metal || ''}
                        placeholder="0"
                        onChange={(e) => setDefResources(p => ({ ...p, metal: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-full text-xs font-mono bg-transparent text-white focus:outline-none placeholder-gray-600"
                      />
                    </div>
                    <div className="bg-space-800/60 rounded-lg px-2 py-1.5 border border-white/5">
                      <span className="text-[10px] text-gray-500 block">Piedra</span>
                      <input
                        type="number"
                        min="0"
                        value={defResources.crystal || ''}
                        placeholder="0"
                        onChange={(e) => setDefResources(p => ({ ...p, crystal: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-full text-xs font-mono bg-transparent text-white focus:outline-none placeholder-gray-600"
                      />
                    </div>
                    <div className="bg-space-800/60 rounded-lg px-2 py-1.5 border border-white/5">
                      <span className="text-[10px] text-gray-500 block">Comida</span>
                      <input
                        type="number"
                        min="0"
                        value={defResources.deuterium || ''}
                        placeholder="0"
                        onChange={(e) => setDefResources(p => ({ ...p, deuterium: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-full text-xs font-mono bg-transparent text-white focus:outline-none placeholder-gray-600"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* BOTONES DE ACCIÓN */}
      {/* ============================================ */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={resetAll}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-space-800/80 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all duration-200 text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Reiniciar
        </button>
        <button
          onClick={runSim}
          disabled={!canSimulate || isRunning}
          className={`relative flex items-center gap-2 px-8 py-3 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all duration-300 ${
            canSimulate && !isRunning
              ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:scale-105 active:scale-95'
              : 'bg-space-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isRunning ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Simulando...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              SIMULAR COMBATE
            </>
          )}
          {canSimulate && !isRunning && (
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-600/0 via-white/10 to-orange-600/0 animate-pulse" />
          )}
        </button>
      </div>

      {/* ============================================ */}
      {/* RESULTADOS */}
      {/* ============================================ */}
      {simResult && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Resultado principal con efecto de batalla */}
          <div className={effectStyle ? `relative rounded-xl ${effectStyle.glow} transition-all duration-500` : 'relative'}>
            {effectStyle && (
              <>
                <div className={`absolute -inset-1 rounded-xl opacity-30 blur-md ${effectStyle.particle} animate-pulse`} />
                <div className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]" />
              </>
            )}
            <ResultBadge result={simResult.result} />
          </div>

          {/* Aviso de simulación truncada */}
          {simResult.truncated && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-950/60 to-space-900/60 border border-amber-500/30">
              <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Los ejércitos son tan grandes que la simulación alcanzó el límite de cálculo del
                navegador y se detuvo antes de terminar. El resultado mostrado es orientativo:
                reduce las cantidades para obtener una simulación completa.
              </p>
            </div>
          )}

          {/* Balance de la batalla */}
          <BattleBalance result={simResult} />

          {/* Resumen de rondas */}
          <div className={`relative overflow-hidden rounded-xl bg-gradient-to-b from-space-800/80 to-space-900/90 border p-4 transition-all duration-500 ${effectStyle ? effectStyle.border + ' ' + effectStyle.glow : 'border-white/10'}`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.03),transparent_50%)]" />
            {effectStyle && (
              <div className={`absolute -inset-px rounded-xl opacity-20 blur-xl ${effectStyle.particle} animate-pulse`} />
            )}
            <div className="relative">
              <h3 className="font-orbitron text-sm text-white mb-3 flex items-center gap-2">
                {effectStyle ? (
                  <span className="animate-pulse">{effectStyle.emoji}</span>
                ) : (
                  <Zap className="w-4 h-4 text-yellow-400" />
                )}
                Desarrollo del combate ({simResult.rounds.length} rondas)
              </h3>
              <div className="space-y-2">
                {simResult.rounds.map((round) => (
                  <div
                    key={round.round}
                    className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-3 items-center bg-space-800/50 rounded-lg px-3 py-2 border border-white/5"
                  >
                    <span className="text-[10px] font-mono text-gray-500 w-6">R{round.round}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-red-400">{formatNumber(round.attackerShots)} disparos</span>
                      <div className="flex-1 h-1 bg-space-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, (round.attackerDamage / (round.attackerDamage + round.defenderDamage + 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <Swords className="w-3 h-3 text-gray-600" />
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-space-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, (round.defenderDamage / (round.attackerDamage + round.defenderDamage + 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-cyan-400">{formatNumber(round.defenderShots)} disparos</span>
                    </div>
                    <div className="flex gap-2 text-[10px] font-mono">
                      <span className="text-red-300">{round.attackerUnitsLeft}</span>
                      <span className="text-gray-600">vs</span>
                      <span className="text-cyan-300">{round.defenderUnitsLeft}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Unidades supervivientes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Atacante supervivientes */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-space-800/80 to-space-900/90 border border-red-500/15 p-4">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.04),transparent_60%)]" />
              <div className="relative">
                <h3 className="font-orbitron text-xs text-red-400 mb-2 flex items-center gap-2">
                  <Crosshair className="w-3.5 h-3.5" />
                  Ejército atacante
                </h3>
                <div className="space-y-1">
                  {simResult.attackerUnits.map((u) => (
                    <div
                      key={u.code}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded bg-space-800/30"
                    >
                      <span className="text-gray-400">{u.name}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-gray-500">{formatNumber(u.initial)}</span>
                        <span className="text-gray-600">→</span>
                        <span className={u.remaining > 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatNumber(u.remaining)}
                        </span>
                        {u.lost > 0 && (
                          <span className="text-red-500/70 text-[10px]">(-{formatNumber(u.lost)})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Defensor supervivientes */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-space-800/80 to-space-900/90 border border-cyan-500/15 p-4">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.04),transparent_60%)]" />
              <div className="relative">
                <h3 className="font-orbitron text-xs text-cyan-400 mb-2 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5" />
                  Ejército/Defensas del defensor
                </h3>
                <div className="space-y-1">
                  {simResult.defenderUnits.map((u) => (
                    <div
                      key={u.code}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded bg-space-800/30"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">{u.name}</span>
                        {u.isDefense && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                            DEF
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-gray-500">{formatNumber(u.initial)}</span>
                        <span className="text-gray-600">→</span>
                        <span className={u.remaining > 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatNumber(u.remaining)}
                        </span>
                        {u.lost > 0 && (
                          <span className="text-red-500/70 text-[10px]">(-{formatNumber(u.lost)})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Pérdidas y escombros */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pérdidas atacante */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-space-800/80 to-space-900/90 border border-red-500/15 p-4">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(239,68,68,0.05),transparent_60%)]" />
              <div className="relative">
                <h3 className="text-xs text-red-400 font-semibold mb-2 flex items-center gap-1.5">
                  <Skull className="w-3.5 h-3.5" />
                  Pérdidas atacante
                </h3>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Hierro:</span>
                    <span className="text-red-300">{formatNumber(simResult.attackerLosses.metal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Piedra:</span>
                    <span className="text-red-300">{formatNumber(simResult.attackerLosses.crystal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Comida:</span>
                    <span className="text-red-300">{formatNumber(simResult.attackerLosses.deuterium)}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1 mt-1">
                    <span className="text-gray-400 font-semibold">Total:</span>
                    <span className="text-red-200 font-semibold">
                      {formatNumber(
                        simResult.attackerLosses.metal +
                          simResult.attackerLosses.crystal +
                          simResult.attackerLosses.deuterium
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pérdidas defensor */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-space-800/80 to-space-900/90 border border-cyan-500/15 p-4">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(6,182,212,0.05),transparent_60%)]" />
              <div className="relative">
                <h3 className="text-xs text-cyan-400 font-semibold mb-2 flex items-center gap-1.5">
                  <Skull className="w-3.5 h-3.5" />
                  Pérdidas defensor
                </h3>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Hierro:</span>
                    <span className="text-cyan-300">{formatNumber(simResult.defenderLosses.metal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Piedra:</span>
                    <span className="text-cyan-300">{formatNumber(simResult.defenderLosses.crystal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Comida:</span>
                    <span className="text-cyan-300">{formatNumber(simResult.defenderLosses.deuterium)}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1 mt-1">
                    <span className="text-gray-400 font-semibold">Total:</span>
                    <span className="text-cyan-200 font-semibold">
                      {formatNumber(
                        simResult.defenderLosses.metal +
                          simResult.defenderLosses.crystal +
                          simResult.defenderLosses.deuterium
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] pt-1">
                    <span className="text-gray-600">· Tropas:</span>
                    <span className="text-cyan-400/60">
                      {formatNumber(
                        simResult.defenderFleetLosses.metal +
                          simResult.defenderFleetLosses.crystal +
                          simResult.defenderFleetLosses.deuterium
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-600">· Defensas:</span>
                    <span className="text-green-400/60">
                      {formatNumber(
                        simResult.defenderDefenseLosses.metal +
                          simResult.defenderDefenseLosses.crystal +
                          simResult.defenderDefenseLosses.deuterium
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Escombros y botín */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-space-800/80 to-space-900/90 border border-amber-500/15 p-4">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(245,158,11,0.05),transparent_60%)]" />
              <div className="relative space-y-3">
                <div>
                  <h3 className="text-xs text-amber-400 font-semibold mb-2 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5" />
                    Campo de escombros
                  </h3>
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Hierro:</span>
                      <span className="text-amber-300">{formatNumber(simResult.debrisMetal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Piedra:</span>
                      <span className="text-amber-300">{formatNumber(simResult.debrisCrystal)}</span>
                    </div>
                  </div>
                </div>

                {simResult.result === 'attacker_won' && (
                  <div>
                    <h3 className="text-xs text-green-400 font-semibold mb-2 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      Botín capturado
                    </h3>
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Hierro:</span>
                        <span className="text-green-300">{formatNumber(simResult.loot.metal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Piedra:</span>
                        <span className="text-green-300">{formatNumber(simResult.loot.crystal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Comida:</span>
                        <span className="text-green-300">{formatNumber(simResult.loot.deuterium)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Nota informativa */}
          <div className="relative overflow-hidden flex items-start gap-2 px-4 py-3 rounded-xl bg-gradient-to-br from-space-800/60 to-space-900/60 border border-white/5">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,rgba(59,130,246,0.05),transparent_60%)]" />
            <Info className="relative w-4 h-4 text-cyan-500/70 mt-0.5 flex-shrink-0" />
            <p className="relative text-[11px] text-gray-500 leading-relaxed">
              Réplica exacta del motor de combate del servidor: máximo{' '}
              <span className="text-gray-400">6 rondas</span>, escudos que se regeneran cada ronda,
              fuego rápido encadenado sobre el mismo tipo de unidad, daño inferior al 1% del escudo
              absorbido por completo, y bajas calculadas sobre el casco acumulado del grupo. Los
              escombros son el{' '}
              <span className="text-amber-400/80">{Math.round(FLEET_DEBRIS_RATIO * 100)}%</span> del
              metal y cristal de las tropas destruidas
              {DEFENSE_DEBRIS_RATIO > 0
                ? ` y el ${Math.round(DEFENSE_DEBRIS_RATIO * 100)}% de las defensas`
                : ' (las defensas no generan escombros)'}
              . Como el combate real incluye aleatoriedad, cada simulación puede variar ligeramente.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
