// Tipos de datos para Falco-X Universo

// ============================================
// TIPOS DE USUARIO Y PERFIL
// ============================================

export interface Profile {
  id: string;
  username: string;
  email?: string;
  avatar_url?: string;
  dark_matter: number;
  points_total: number;
  points_buildings: number;
  points_research: number;
  points_fleet: number;
  points_defense: number;
  points_expedition: number;
  rank_position: number;
  rank_buildings: number;
  rank_research: number;
  rank_fleet: number;
  rank_defense: number;
  rank_expedition: number;
  battles_won: number;
  battles_draw: number;
  battles_lost: number;
  units_destroyed: number;
  units_lost: number;
  debris_metal_total: number;
  debris_crystal_total: number;
  tung_balance: number;
  usdt_balance: number;
  is_admin: boolean;
  is_banned: boolean;
  vacation_mode: boolean;
  vacation_mode_enabled_at?: string;
  notify_attacks: boolean;
  notify_buildings: boolean;
  notify_research: boolean;
  notify_messages: boolean;
  telegram_alerts_enabled?: boolean;
  hide_records: boolean;
  two_factor_login_enabled?: boolean;
  autopilot_eligible: boolean;
  autopilot_active: boolean;
  autopilot_vip_boost?: boolean;
  autopilot_vip_boost_expires_at?: string | null;
  last_manual_action?: string;
  last_activity: string;
  tutorial_step?: number;
  tutorial_completed?: boolean;
  created_at: string;
  updated_at: string;
  // Cosmetic slots
  active_title?: string | null;
  active_title_icon?: string | null;
  active_badge?: string | null;
  active_planet_effect?: string | null;
  active_hero_skin?: string | null;
  active_battle_effect?: string | null;
}

// ============================================
// TIPOS DE PLANETA
// ============================================

export interface Planet {
  id: string;
  user_id: string;
  name: string;
  galaxy: number;
  solar_system: number;
  position: number;
  planet_type: 'planet' | 'moon' | 'debris';
  autopilot_role?: 'balanced' | 'miner' | 'military' | 'research' | 'colonizer' | 'custom';
  autopilot_enabled?: boolean;
  image_id: number;
  diameter: number;
  fields_used: number;
  fields_max: number;
  temp_min: number;
  temp_max: number;
  is_main_planet: boolean;
  is_destroyed: boolean;
  last_update: string;
  created_at: string;
  jump_gate_cooldown?: string | null;
  // Resource depletion system
  metal_deposit?: number | null;
  crystal_deposit?: number | null;
  deuterium_deposit?: number | null;
  planet_status?: 'active' | 'depleted' | 'regenerating';
  depleted_at?: string | null;
  regenerates_at?: string | null;
}

export interface PlanetDeposits {
  success: boolean;
  is_main_planet: boolean;
  planet_status: 'active' | 'depleted' | 'regenerating';
  metal_deposit: number | null;
  crystal_deposit: number | null;
  deuterium_deposit: number | null;
  metal_deposit_pct: number | null;
  crystal_deposit_pct: number | null;
  deuterium_deposit_pct: number | null;
  metal_initial?: number;
  depleted_at?: string | null;
  regenerates_at?: string | null;
  position?: number;
}

export interface PlanetResources {
  id: string;
  planet_id: string;
  metal: number;
  crystal: number;
  deuterium: number;
  energy_used: number;
  energy_max: number;
  metal_per_hour: number;
  crystal_per_hour: number;
  deuterium_per_hour: number;
  metal_storage: number;
  crystal_storage: number;
  deuterium_storage: number;
  last_update: string;
  metal_mine_percent: number;
  crystal_mine_percent: number;
  deuterium_synth_percent: number;
  solar_plant_percent: number;
  fusion_reactor_percent: number;
  solar_satellite_percent: number;
}

// ============================================
// TIPOS DE EDIFICIOS
// ============================================

export interface BuildingType {
  id: number;
  code: string;
  name: string;
  description: string;
  category: 'resources' | 'facilities' | 'storage';
  base_metal: number;
  base_crystal: number;
  base_deuterium: number;
  base_energy: number;
  cost_factor: number;
  base_time_seconds: number;
  max_level: number;
  image_url?: string;
}

export interface PlanetBuilding {
  id: string;
  planet_id: string;
  building_type_id: number;
  level: number;
  is_upgrading: boolean;
  upgrade_end_time?: string;
  created_at: string;
  building_type?: BuildingType;
}

export interface BuildingRequirement {
  id: number;
  building_type_id: number;
  required_building_id?: number;
  required_building_level: number;
  required_tech_id?: number;
  required_tech_level: number;
  required_building?: BuildingType;
  required_tech?: TechnologyType;
}

export interface BuildingQueueItem {
  id: string;
  planet_id: string;
  building_type_id: number;
  target_level: number;
  metal_cost: number;
  crystal_cost: number;
  deuterium_cost: number;
  build_time: number;
  queue_position: number;
  start_time?: string;
  end_time?: string;
  created_at: string;
  building_type?: BuildingType;
}

export interface ShipyardQueueItem {
  id: string;
  planet_id: string;
  item_type: 'ship' | 'defense';
  ship_type_id?: number;
  defense_type_id?: number;
  quantity: number;
  quantity_completed: number;
  metal_cost: number;
  crystal_cost: number;
  deuterium_cost: number;
  build_time_per_unit: number;
  queue_position: number;
  start_time?: string;
  current_unit_end_time?: string;
  created_at: string;
  ship_type?: ShipType;
  defense_type?: DefenseType;
}

// ============================================
// TIPOS DE TECNOLOGIAS
// ============================================

export interface TechnologyType {
  id: number;
  code: string;
  name: string;
  description: string;
  category: 'basic' | 'propulsion' | 'military' | 'advanced';
  base_metal: number;
  base_crystal: number;
  base_deuterium: number;
  cost_factor: number;
  base_time_seconds: number;
  max_level: number;
  image_url?: string;
  energy_required?: number;
}

export interface UserTechnology {
  id: string;
  user_id: string;
  technology_type_id: number;
  level: number;
  is_researching: boolean;
  research_end_time?: string;
  research_planet_id?: string;
  created_at: string;
  technology_type?: TechnologyType;
}

export interface ResearchQueueItem {
  id: string;
  user_id: string;
  technology_type_id: number;
  target_level: number;
  metal_cost: number;
  crystal_cost: number;
  deuterium_cost: number;
  research_time: number;
  queue_position: number;
  status: string;
  planet_id: string;
  created_at: string;
  technology_type?: TechnologyType;
}

export interface TechnologyRequirement {
  id: number;
  technology_type_id: number;
  required_building_id?: number;
  required_building_level: number;
  required_tech_id?: number;
  required_tech_level: number;
  required_building?: BuildingType;
  required_tech?: TechnologyType;
}

// ============================================
// TIPOS DE NAVES
// ============================================

export interface ShipType {
  id: number;
  code: string;
  name: string;
  description: string;
  category: 'civil' | 'combat' | 'special';
  metal_cost: number;
  crystal_cost: number;
  deuterium_cost: number;
  build_time_seconds: number;
  structural_integrity: number;
  shield_power: number;
  weapon_power: number;
  cargo_capacity: number;
  base_speed: number;
  fuel_consumption: number;
  rapid_fire: Record<string, number>;
  image_url?: string;
}

export interface PlanetShip {
  id: string;
  planet_id: string;
  ship_type_id: number;
  quantity: number;
  in_construction: number;
  construction_end_time?: string;
  created_at: string;
  ship_type?: ShipType;
}

export interface ShipRequirement {
  id: number;
  ship_type_id: number;
  required_building_id?: number;
  required_building_level: number;
  required_tech_id?: number;
  required_tech_level: number;
  required_building?: BuildingType;
  required_tech?: TechnologyType;
}

// ============================================
// TIPOS DE DEFENSAS
// ============================================

export interface DefenseType {
  id: number;
  code: string;
  name: string;
  description: string;
  metal_cost: number;
  crystal_cost: number;
  deuterium_cost: number;
  build_time_seconds: number;
  structural_integrity: number;
  shield_power: number;
  weapon_power: number;
  image_url?: string;
  max_per_planet?: number | null;
}

export interface PlanetDefense {
  id: string;
  planet_id: string;
  defense_type_id: number;
  quantity: number;
  in_construction: number;
  construction_end_time?: string;
  created_at: string;
  defense_type?: DefenseType;
}

export interface DefenseRequirement {
  id: number;
  defense_type_id: number;
  required_building_id?: number;
  required_building_level: number;
  required_tech_id?: number;
  required_tech_level: number;
  required_building?: BuildingType;
  required_tech?: TechnologyType;
}

// ============================================
// TIPOS DE FLOTAS
// ============================================

export type MissionType =
  | 'attack'
  | 'transport'
  | 'deploy'
  | 'colonize'
  | 'espionage'
  | 'recycle'
  | 'destroy'
  | 'expedition'
  | 'hold'
  | 'harvest';

export interface Fleet {
  id: string;
  user_id: string;
  origin_planet_id: string;
  target_galaxy: number;
  target_system: number;
  target_position: number;
  target_type: string;
  mission_type: MissionType;
  cargo_metal: number;
  cargo_crystal: number;
  cargo_deuterium: number;
  departure_time: string;
  arrival_time: string;
  return_time?: string;
  is_returning: boolean;
  is_completed: boolean;
  created_at: string;
  fleet_ships?: FleetShip[];
}

export interface FleetShip {
  id: string;
  fleet_id: string;
  ship_type_id: number;
  quantity: number;
  ship_type?: ShipType;
}

// ============================================
// TIPOS DE ALIANZAS
// ============================================

export interface Alliance {
  id: string;
  tag: string;
  name: string;
  founder_id?: string;
  leader_id?: string;
  description?: string;
  internal_text?: string;
  logo_url?: string;
  member_count: number;
  points_total: number;
  rank_position: number;
  created_at: string;
  /** Columna calculada (PostgREST): 3 normal, 5 si el lider tiene VIP Plus activo. */
  max_members?: number;
}

export interface AllianceMember {
  id: string;
  alliance_id: string;
  user_id: string;
  rank_name: string;
  rank_level: number;
  can_invite: boolean;
  can_kick: boolean;
  can_edit: boolean;
  joined_at: string;
  profile?: Profile;
}

// ============================================
// TIPOS DE MENSAJES
// ============================================

export type MessageType =
  | 'player'
  | 'system'
  | 'battle'
  | 'espionage'
  | 'expedition'
  | 'alliance';

export interface Message {
  id: string;
  sender_id?: string;
  recipient_id: string;
  subject: string;
  body: string;
  message_type: MessageType;
  is_read: boolean;
  created_at: string;
  sender?: Profile;
}

// ============================================
// TIPOS DE BATALLA
// ============================================

export interface BattleReport {
  id: string;
  attacker_id?: string;
  defender_id?: string;
  planet_id?: string;
  coordinates: string;
  result: 'attacker_won' | 'defender_won' | 'draw';
  rounds: number;
  attacker_losses_metal: number;
  attacker_losses_crystal: number;
  defender_losses_metal: number;
  defender_losses_crystal: number;
  debris_metal: number;
  debris_crystal: number;
  loot_metal: number;
  loot_crystal: number;
  loot_deuterium: number;
  report_data: BattleReportData;
  created_at: string;
}

export interface BattleReportData {
  rounds: BattleRound[];
  attacker_initial: BattleUnit[];
  defender_initial: BattleUnit[];
  attacker_final: BattleUnit[];
  defender_final: BattleUnit[];
}

export interface BattleRound {
  round_number: number;
  attacker_shots: number;
  defender_shots: number;
  attacker_damage: number;
  defender_damage: number;
}

export interface BattleUnit {
  type: string;
  quantity: number;
  weapons: number;
  shields: number;
  hull: number;
}

// ============================================
// TIPOS DE COORDENADAS
// ============================================

export interface Coordinates {
  galaxy: number;
  system: number;
  position: number;
}

// ============================================
// TIPOS DE CONFIGURACION
// ============================================

export interface GameSetting {
  id: number;
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

// ============================================
// TIPOS DE VISTA DE GALAXIA
// ============================================

export interface GalaxySlot {
  position: number;
  planet?: Planet;
  moon?: Planet;
  debris?: boolean;
  player?: Profile;
  alliance?: Alliance;
}

// ============================================
// TIPOS DE OFICIALES
// ============================================

export interface OfficerType {
  id: string;
  code: string;
  name: string;
  description: string;
  bonus_type: string;
  bonus_value: number;
  bonus_secondary_type?: string;
  bonus_secondary_value?: number;
  dark_matter_cost_7d: number;
  dark_matter_cost_30d: number;
  dark_matter_cost_90d: number;
  tung_cost_7d: number;
  tung_cost_30d: number;
  tung_cost_90d: number;
  fxu_cost_7d?: number;
  fxu_cost_30d?: number;
  fxu_cost_90d?: number;
  usdt_cost_7d?: number;
  usdt_cost_30d?: number;
  usdt_cost_90d?: number;
  icon: string;
  image_url?: string;
  sort_order: number;
  created_at: string;
}

export interface UserOfficer {
  id: string;
  user_id: string;
  officer_type_id: string;
  expires_at: string;
  created_at: string;
  officer_type?: OfficerType;
}

// ============================================
// TIPOS DE ACS (SISTEMA DE COMBATE DE ALIANZA)
// ============================================

export interface ACSFleet {
  id: string;
  main_fleet_id: string;
  alliance_id?: string;
  name: string;
  target_galaxy: number;
  target_system: number;
  target_position: number;
  arrival_time: string;
  max_fleets: number;
  is_active: boolean;
  created_at: string;
}

export interface ACSParticipant {
  id: string;
  acs_id: string;
  fleet_id: string;
  user_id: string;
  joined_at: string;
}

// ============================================
// TIPOS DE REGISTRO DE ATAQUES
// ============================================

export interface AttackLog {
  id: string;
  attacker_id: string;
  defender_id: string;
  target_planet_id: string;
  attack_time: string;
}

// ============================================
// TIPOS DE MISILES
// ============================================

export interface MissileData {
  anti_ballistic_missiles: number;
  interplanetary_missiles: number;
}

// ============================================
// TIPOS DE ESCOMBROS
// ============================================

export interface DebrisField {
  id: string;
  galaxy: number;
  solar_system: number;
  position: number;
  metal: number;
  crystal: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// TIPOS DE MODO VACACIONES
// ============================================

export interface VacationStatus {
  is_active: boolean;
  enabled_at?: string;
  hours_elapsed?: number;
  hours_remaining?: number;
  can_disable?: boolean;
  can_disable_at?: string;
  can_enable?: boolean;
  incoming_attacks: number;
  error?: string;
}

export interface VacationToggleResult {
  success: boolean;
  error?: string;
  message?: string;
  minimum_duration_hours?: number;
  can_disable_at?: string;
  hours_elapsed?: number;
  hours_remaining?: number;
  incoming_attacks?: number;
}
// ============================================
// FORTALEZAS DE ALIANZA
// ============================================

export interface AllianceFortress {
  galaxy: number;
  system: number;
  position: number;
  owner_alliance_id: string | null;
  owner_alliance_name: string | null;
  owner_alliance_tag: string | null;
  captured_at: string | null;
  total_ships: number;
  total_combat_power: number;
}

export interface FortressDetail extends AllianceFortress {
  fortress_id: string;
  ships: FortressShipType[];
  contributors: FortressContributor[];
}

export interface FortressShipType {
  ship_type_id: number;
  ship_name: string;
  total_quantity: number;
  weapon_power?: number;
  combat_power?: number;
}

export interface FortressContributor {
  user_id: string;
  username: string;
  total_ships: number;
  combat_power?: number;
  ships_detail?: FortressShipType[];
}

// ============================================
// PLANETA DEL TESORO (aislado del sistema de Fortalezas)
// ============================================

export interface TreasurePlanet {
  galaxy: number;
  system: number;
  position: number;
  owner_alliance_id: string | null;
  owner_alliance_name: string | null;
  owner_alliance_tag: string | null;
  captured_at: string | null;
  total_ships: number;
  total_combat_power: number;
}

export interface TreasurePlanetDetail extends TreasurePlanet {
  treasure_planet_id: string;
  ships: TreasurePlanetShipType[];
  contributors: TreasurePlanetContributor[];
}

export interface TreasurePlanetShipType {
  ship_type_id: number;
  ship_name: string;
  total_quantity: number;
}

export interface TreasurePlanetContributor {
  user_id: string;
  username: string;
  total_ships: number;
  ships_detail?: TreasurePlanetShipType[];
}