/**
 * Combat Simulator Engine
 *
 * Replica EXACTAMENTE el algoritmo de `public.simulate_xnova_combat(jsonb, jsonb)`
 * que corre en el servidor, pero 100% en el navegador: no toca la base de datos
 * ni consume recursos del servidor.
 *
 * Las estadisticas (ataque / escudo / casco / fuego rapido / costes) se leen tal cual
 * de `ship_types` y `defense_types`. Este motor NO las modifica.
 *
 * Modelo de datos: igual que el servidor, se agrupa POR TIPO de unidad usando
 * dos acumuladores (`shieldPool` y `hullDamagePool`) en lugar de instanciar cada
 * nave por separado. Asi el coste es proporcional al numero de TIPOS, no al numero
 * de naves, y soporta flotas enormes sin bloquear el navegador.
 *
 * Algoritmo (identico al servidor):
 *  1. Se aplican los bonos de tecnologia a las stats base (+10% por nivel).
 *  2. Hasta 6 rondas. Al inicio de cada ronda el escudo se regenera al 100%:
 *     shieldPool = escudoPorUnidad * cantidadViva
 *  3. Cada unidad viva dispara una vez:
 *     - Objetivo aleatorio, ponderado por la cantidad de cada tipo.
 *     - Si el dano es < 1% del escudo unitario, se ignora por completo.
 *     - El escudo absorbe como maximo el escudo de UNA unidad.
 *     - El resto va al acumulador de casco; cada vez que se completa el casco
 *       de una unidad, esa unidad muere. La fraccion sobrante mata una unidad
 *       extra con probabilidad igual a la fraccion, solo si supera 0.3.
 *     - Fuego rapido: se repite el disparo contra el MISMO tipo de objetivo con
 *       probabilidad (rf - 1) / rf. Maximo 100 disparos encadenados.
 *  4. Vence quien deje al rival sin unidades. Si tras 6 rondas quedan ambos, es empate.
 *  5. Escombros = perdidas de flota * fleet_debris_ratio + perdidas de defensa * defense_debris_ratio.
 */

import { COMBAT } from './constants';

// ============================================
// TIPOS
// ============================================

export interface SimulatorUnit {
  code: string;
  name: string;
  quantity: number;
  weapon: number;
  shield: number;
  hull: number;
  metalCost: number;
  crystalCost: number;
  deuteriumCost: number;
  rapidFire: Record<string, number>;
  isDefense?: boolean;
}

export interface SimFleetConfig {
  units: SimulatorUnit[];
  weaponsTech: number;
  shieldTech: number;
  armourTech: number;
}

export interface SimRoundResult {
  round: number;
  attackerShots: number;
  defenderShots: number;
  /** Unidades del defensor destruidas en esta ronda */
  attackerDamage: number;
  /** Unidades del atacante destruidas en esta ronda */
  defenderDamage: number;
  attackerUnitsLeft: number;
  defenderUnitsLeft: number;
}

export interface SimUnitResult {
  code: string;
  name: string;
  initial: number;
  remaining: number;
  lost: number;
  isDefense?: boolean;
}

export interface SimulationResult {
  result: 'attacker_won' | 'defender_won' | 'draw';
  rounds: SimRoundResult[];
  attackerUnits: SimUnitResult[];
  defenderUnits: SimUnitResult[];
  attackerLosses: { metal: number; crystal: number; deuterium: number };
  defenderLosses: { metal: number; crystal: number; deuterium: number };
  /** Perdidas del defensor separadas: solo naves */
  defenderFleetLosses: { metal: number; crystal: number };
  /** Perdidas del defensor separadas: solo defensas */
  defenderDefenseLosses: { metal: number; crystal: number };
  debrisMetal: number;
  debrisCrystal: number;
  loot: { metal: number; crystal: number; deuterium: number };
  totalAttackerCargo: number;
  /** true si se alcanzo el tope de seguridad de disparos */
  truncated: boolean;
  /** Numero total de disparos resueltos (indicador de coste) */
  totalShots: number;
}

/** Estado interno de un tipo de unidad durante el combate (equivale al jsonb del servidor) */
interface CombatGroup {
  code: string;
  name: string;
  weapon: number;
  shield: number;
  hull: number;
  metalCost: number;
  crystalCost: number;
  deuteriumCost: number;
  rapidFire: Record<string, number>;
  isDefense: boolean;
  initialQuantity: number;
  quantity: number;
  shieldPool: number;
  hullDamagePool: number;
}

// ============================================
// CONSTANTES DE SEGURIDAD
// ============================================

/** Rondas maximas (igual que el servidor) */
const MAX_ROUNDS = COMBAT.MAX_ROUNDS || 6;
/** Tope de disparos encadenados por fuego rapido (igual que el servidor) */
const MAX_RAPIDFIRE_CHAIN = 100;
/**
 * Tope duro de disparos totales de la simulacion. Evita que una flota
 * desproporcionada congele la pestana del navegador. Al alcanzarlo la
 * simulacion se detiene y se marca `truncated`.
 */
const MAX_TOTAL_SHOTS = 4_000_000;

/** Tope de unidades admitidas por tipo y bando */
export const MAX_UNITS_PER_TYPE = 1_000_000;

// ============================================
// UTILIDADES INTERNAS
// ============================================

function buildGroups(config: SimFleetConfig): CombatGroup[] {
  const weaponMod = 1 + config.weaponsTech * 0.1;
  const shieldMod = 1 + config.shieldTech * 0.1;
  const armourMod = 1 + config.armourTech * 0.1;

  const groups: CombatGroup[] = [];

  for (const u of config.units) {
    const quantity = Math.min(
      MAX_UNITS_PER_TYPE,
      Math.max(0, Math.floor(u.quantity))
    );
    if (quantity <= 0) continue;

    groups.push({
      code: u.code,
      name: u.name,
      weapon: Math.floor(u.weapon * weaponMod),
      shield: Math.floor(u.shield * shieldMod),
      hull: Math.floor(u.hull * armourMod),
      metalCost: u.metalCost || 0,
      crystalCost: u.crystalCost || 0,
      deuteriumCost: u.deuteriumCost || 0,
      rapidFire: u.rapidFire || {},
      isDefense: u.isDefense || false,
      initialQuantity: quantity,
      quantity,
      shieldPool: 0,
      hullDamagePool: 0,
    });
  }

  return groups;
}

function totalUnits(groups: CombatGroup[]): number {
  let sum = 0;
  for (const g of groups) sum += g.quantity;
  return sum;
}

/**
 * Elige un objetivo al azar ponderado por la cantidad de unidades vivas.
 * Si `restrictCode` viene informado, solo considera ese tipo (disparos de fuego rapido).
 * Devuelve el indice del grupo o -1 si no queda nada vivo.
 */
function pickTarget(groups: CombatGroup[], restrictCode: string | null): number {
  let alive = 0;
  for (const g of groups) {
    if (restrictCode !== null && g.code !== restrictCode) continue;
    if (g.quantity > 0) alive += g.quantity;
  }
  if (alive <= 0) return -1;

  let pick = Math.floor(Math.random() * alive);
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (restrictCode !== null && g.code !== restrictCode) continue;
    if (g.quantity <= 0) continue;
    pick -= g.quantity;
    if (pick < 0) return i;
  }
  return -1;
}

/** Acumulador de bajas de una fase de disparo */
interface LossAccumulator {
  fleetMetal: number;
  fleetCrystal: number;
  fleetDeuterium: number;
  defenseMetal: number;
  defenseCrystal: number;
  defenseDeuterium: number;
  unitsKilled: number;
}

/**
 * Resuelve un disparo contra un grupo. Replica el bloque de dano del servidor.
 * Devuelve el numero de unidades destruidas por este disparo.
 */
function resolveShot(weapon: number, target: CombatGroup, losses: LossAccumulator): number {
  const shieldPerUnit = target.shield;

  // Dano insignificante frente al escudo: se absorbe por completo
  if (shieldPerUnit > 0 && weapon < shieldPerUnit * 0.01) {
    return 0;
  }

  const shieldAvailable = Math.min(shieldPerUnit, Math.max(0, target.shieldPool));
  const shieldAbsorbed = Math.min(weapon, shieldAvailable);
  const hullDamage = weapon - shieldAbsorbed;

  if (shieldAbsorbed > 0) {
    target.shieldPool = Math.max(0, target.shieldPool - shieldAbsorbed);
  }

  if (hullDamage <= 0 || target.hull <= 0) return 0;

  const targetQty = target.quantity;
  const hullPool = target.hullDamagePool + hullDamage;
  target.hullDamagePool = hullPool;

  let unitsKilled = Math.floor(hullPool / target.hull);

  // La fraccion restante mata una unidad extra con probabilidad = fraccion (solo si > 0.3)
  if (unitsKilled < targetQty) {
    const destroyFraction = (hullPool - unitsKilled * target.hull) / target.hull;
    if (destroyFraction > 0.3 && Math.random() < destroyFraction) {
      unitsKilled += 1;
    }
  }

  unitsKilled = Math.min(unitsKilled, targetQty);
  if (unitsKilled <= 0) return 0;

  target.quantity = targetQty - unitsKilled;
  target.hullDamagePool = Math.max(0, hullPool - unitsKilled * target.hull);
  if (target.quantity <= 0) {
    target.shieldPool = 0;
  }

  if (target.isDefense) {
    losses.defenseMetal += target.metalCost * unitsKilled;
    losses.defenseCrystal += target.crystalCost * unitsKilled;
    losses.defenseDeuterium += target.deuteriumCost * unitsKilled;
  } else {
    losses.fleetMetal += target.metalCost * unitsKilled;
    losses.fleetCrystal += target.crystalCost * unitsKilled;
    losses.fleetDeuterium += target.deuteriumCost * unitsKilled;
  }
  losses.unitsKilled += unitsKilled;

  return unitsKilled;
}

/**
 * Una tanda de disparos completa de `shooters` contra `targets`.
 * Devuelve el numero de disparos resueltos.
 */
function fireVolley(
  shooters: CombatGroup[],
  targets: CombatGroup[],
  losses: LossAccumulator,
  budget: { remaining: number }
): number {
  let shots = 0;

  for (const shooter of shooters) {
    if (shooter.quantity <= 0) continue;
    const weapon = shooter.weapon;

    // Cada unidad del grupo dispara una vez (mas su cadena de fuego rapido)
    for (let k = 0; k < shooter.quantity; k++) {
      if (budget.remaining <= 0) return shots;

      let rfTargetCode: string | null = null;
      let chain = 0;
      let keepShooting = true;

      while (keepShooting) {
        chain++;
        if (chain > MAX_RAPIDFIRE_CHAIN) break;
        if (budget.remaining <= 0) return shots;

        const idx = pickTarget(targets, rfTargetCode);
        if (idx === -1) {
          // No quedan objetivos (del tipo requerido). Fin de la cadena.
          keepShooting = false;
          break;
        }

        const target = targets[idx];
        if (rfTargetCode === null) rfTargetCode = target.code;

        resolveShot(weapon, target, losses);
        shots++;
        budget.remaining--;

        // Fuego rapido contra el tipo de objetivo alcanzado
        const rf = shooter.rapidFire[target.code] || 0;
        keepShooting = rf > 1 && Math.random() < (rf - 1) / rf;
      }
    }
  }

  return shots;
}

function emptyLosses(): LossAccumulator {
  return {
    fleetMetal: 0,
    fleetCrystal: 0,
    fleetDeuterium: 0,
    defenseMetal: 0,
    defenseCrystal: 0,
    defenseDeuterium: 0,
    unitsKilled: 0,
  };
}

// ============================================
// API PUBLICA
// ============================================

/**
 * Calcula el botin replicando `public.calculate_loot`:
 * como maximo el 50% de cada recurso del planeta, repartido en tercios de la
 * capacidad de carga y redistribuyendo el sobrante entre los recursos que queden.
 */
export function calculateLoot(
  planetMetal: number,
  planetCrystal: number,
  planetDeuterium: number,
  totalCargo: number
): { metal: number; crystal: number; deuterium: number } {
  const availMetal = Math.max(0, Math.floor((planetMetal || 0) * 0.5));
  const availCrystal = Math.max(0, Math.floor((planetCrystal || 0) * 0.5));
  const availDeuterium = Math.max(0, Math.floor((planetDeuterium || 0) * 0.5));

  const cargo = Math.max(0, Math.floor(totalCargo || 0));
  if (cargo <= 0) return { metal: 0, crystal: 0, deuterium: 0 };

  let third = Math.floor(cargo / 3);

  let lootMetal = Math.min(availMetal, third);
  let lootCrystal = Math.min(availCrystal, third);
  let lootDeuterium = Math.min(availDeuterium, third);

  let remaining = cargo - lootMetal - lootCrystal - lootDeuterium;

  // Segunda pasada: reparto equitativo del sobrante
  if (remaining > 0) {
    let count = 0;
    if (availMetal - lootMetal > 0) count++;
    if (availCrystal - lootCrystal > 0) count++;
    if (availDeuterium - lootDeuterium > 0) count++;

    if (count > 0) {
      third = Math.floor(remaining / count);

      if (availMetal - lootMetal > 0) {
        const take = Math.min(availMetal - lootMetal, third);
        lootMetal += take;
        remaining -= take;
      }
      if (availCrystal - lootCrystal > 0) {
        const take = Math.min(availCrystal - lootCrystal, third);
        lootCrystal += take;
        remaining -= take;
      }
      if (availDeuterium - lootDeuterium > 0) {
        const take = Math.min(availDeuterium - lootDeuterium, third);
        lootDeuterium += take;
        remaining -= take;
      }
    }
  }

  // Tercera pasada: se llena lo que quede en orden metal -> cristal -> deuterio
  if (remaining > 0 && availMetal - lootMetal > 0) {
    const take = Math.min(availMetal - lootMetal, remaining);
    lootMetal += take;
    remaining -= take;
  }
  if (remaining > 0 && availCrystal - lootCrystal > 0) {
    const take = Math.min(availCrystal - lootCrystal, remaining);
    lootCrystal += take;
    remaining -= take;
  }
  if (remaining > 0 && availDeuterium - lootDeuterium > 0) {
    const take = Math.min(availDeuterium - lootDeuterium, remaining);
    lootDeuterium += take;
    remaining -= take;
  }

  return { metal: lootMetal, crystal: lootCrystal, deuterium: lootDeuterium };
}

export interface SimulationOptions {
  /** Recursos del planeta defensor, para calcular el botin */
  defenderResources?: { metal: number; crystal: number; deuterium: number };
  /** Capacidad de carga total de la flota atacante */
  attackerCargo?: number;
  /** Porcentaje de escombros generado por naves destruidas (0-1). Servidor: 0.30 */
  fleetDebrisRatio?: number;
  /** Porcentaje de escombros generado por defensas destruidas (0-1). Servidor: 0.00 */
  defenseDebrisRatio?: number;
}

export function runSimulation(
  attackerConfig: SimFleetConfig,
  defenderConfig: SimFleetConfig,
  options: SimulationOptions = {}
): SimulationResult {
  const fleetDebrisRatio =
    options.fleetDebrisRatio ?? (COMBAT.DEBRIS_FACTOR || 0.3);
  const defenseDebrisRatio = options.defenseDebrisRatio ?? 0;

  const attackers = buildGroups(attackerConfig);
  const defenders = buildGroups(defenderConfig);

  const attackerLossAcc = emptyLosses(); // bajas sufridas por el atacante
  const defenderLossAcc = emptyLosses(); // bajas sufridas por el defensor

  const budget = { remaining: MAX_TOTAL_SHOTS };
  const rounds: SimRoundResult[] = [];
  let totalShots = 0;
  let round = 0;

  // Si el defensor no tiene nada, victoria directa sin combate (igual que el servidor)
  if (totalUnits(defenders) === 0) {
    return finalize(
      attackers,
      defenders,
      attackerLossAcc,
      defenderLossAcc,
      rounds,
      fleetDebrisRatio,
      defenseDebrisRatio,
      options,
      false,
      0
    );
  }

  while (round < MAX_ROUNDS) {
    round++;

    // Regeneracion de escudos al 100% al inicio de cada ronda
    for (const g of attackers) g.shieldPool = g.shield * g.quantity;
    for (const g of defenders) g.shieldPool = g.shield * g.quantity;

    if (totalUnits(attackers) === 0 || totalUnits(defenders) === 0) break;

    const attackerKilledBefore = defenderLossAcc.unitsKilled;
    const defenderKilledBefore = attackerLossAcc.unitsKilled;

    // 1) El atacante dispara al defensor
    const attackerShots = fireVolley(attackers, defenders, defenderLossAcc, budget);
    // 2) El defensor responde
    const defenderShots = fireVolley(defenders, attackers, attackerLossAcc, budget);

    totalShots += attackerShots + defenderShots;

    rounds.push({
      round,
      attackerShots,
      defenderShots,
      attackerDamage: defenderLossAcc.unitsKilled - attackerKilledBefore,
      defenderDamage: attackerLossAcc.unitsKilled - defenderKilledBefore,
      attackerUnitsLeft: totalUnits(attackers),
      defenderUnitsLeft: totalUnits(defenders),
    });

    if (totalUnits(attackers) === 0 || totalUnits(defenders) === 0) break;
    if (budget.remaining <= 0) break;
  }

  return finalize(
    attackers,
    defenders,
    attackerLossAcc,
    defenderLossAcc,
    rounds,
    fleetDebrisRatio,
    defenseDebrisRatio,
    options,
    budget.remaining <= 0,
    totalShots
  );
}

function finalize(
  attackers: CombatGroup[],
  defenders: CombatGroup[],
  attackerLossAcc: LossAccumulator,
  defenderLossAcc: LossAccumulator,
  rounds: SimRoundResult[],
  fleetDebrisRatio: number,
  defenseDebrisRatio: number,
  options: SimulationOptions,
  truncated: boolean,
  totalShots: number
): SimulationResult {
  const attackerAlive = totalUnits(attackers);
  const defenderAlive = totalUnits(defenders);

  let result: 'attacker_won' | 'defender_won' | 'draw';
  if (attackerAlive > 0 && defenderAlive === 0) {
    result = 'attacker_won';
  } else if (attackerAlive === 0 && defenderAlive > 0) {
    result = 'defender_won';
  } else {
    // Ambos sin unidades, o ambos con unidades tras 6 rondas: empate (sin saqueo)
    result = 'draw';
  }

  const attackerUnits: SimUnitResult[] = attackers.map(g => ({
    code: g.code,
    name: g.name,
    initial: g.initialQuantity,
    remaining: g.quantity,
    lost: g.initialQuantity - g.quantity,
    isDefense: g.isDefense,
  }));

  const defenderUnits: SimUnitResult[] = defenders.map(g => ({
    code: g.code,
    name: g.name,
    initial: g.initialQuantity,
    remaining: g.quantity,
    lost: g.initialQuantity - g.quantity,
    isDefense: g.isDefense,
  }));

  const attackerLosses = {
    metal: attackerLossAcc.fleetMetal + attackerLossAcc.defenseMetal,
    crystal: attackerLossAcc.fleetCrystal + attackerLossAcc.defenseCrystal,
    deuterium: attackerLossAcc.fleetDeuterium + attackerLossAcc.defenseDeuterium,
  };

  const defenderLosses = {
    metal: defenderLossAcc.fleetMetal + defenderLossAcc.defenseMetal,
    crystal: defenderLossAcc.fleetCrystal + defenderLossAcc.defenseCrystal,
    deuterium: defenderLossAcc.fleetDeuterium + defenderLossAcc.defenseDeuterium,
  };

  // Escombros: naves segun fleetDebrisRatio, defensas segun defenseDebrisRatio
  const debrisMetal = Math.floor(
    (attackerLossAcc.fleetMetal + defenderLossAcc.fleetMetal) * fleetDebrisRatio +
      defenderLossAcc.defenseMetal * defenseDebrisRatio
  );
  const debrisCrystal = Math.floor(
    (attackerLossAcc.fleetCrystal + defenderLossAcc.fleetCrystal) * fleetDebrisRatio +
      defenderLossAcc.defenseCrystal * defenseDebrisRatio
  );

  // Capacidad de carga superviviente (solo cuenta la flota que vuelve)
  const totalAttackerCargo = options.attackerCargo || 0;

  let loot = { metal: 0, crystal: 0, deuterium: 0 };
  if (result === 'attacker_won' && options.defenderResources) {
    loot = calculateLoot(
      options.defenderResources.metal,
      options.defenderResources.crystal,
      options.defenderResources.deuterium,
      totalAttackerCargo
    );
  }

  return {
    result,
    rounds,
    attackerUnits,
    defenderUnits,
    attackerLosses,
    defenderLosses,
    defenderFleetLosses: {
      metal: defenderLossAcc.fleetMetal,
      crystal: defenderLossAcc.fleetCrystal,
    },
    defenderDefenseLosses: {
      metal: defenderLossAcc.defenseMetal,
      crystal: defenderLossAcc.defenseCrystal,
    },
    debrisMetal,
    debrisCrystal,
    loot,
    totalAttackerCargo,
    truncated,
    totalShots,
  };
}
