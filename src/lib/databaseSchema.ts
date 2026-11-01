/**
 * FALCO-X UNIVERSO - Database Schema DDL
 * 
 * Este archivo contiene todas las definiciones CREATE TABLE necesarias para
 * recrear la base de datos completa desde cero en PostgreSQL 16+.
 * 
 * El schema se genera basándose en las migraciones de Supabase y es
 * compatible con una instalación standalone de PostgreSQL.
 */

export const DATABASE_SCHEMA_DDL = `
-- ================================================================
-- FALCO-X UNIVERSO - COMPLETE DATABASE SCHEMA
-- ================================================================
-- Compatible con PostgreSQL 16+
-- Para uso en VPS standalone (sin Supabase)
-- ================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- CONFIGURACIÓN DEL SISTEMA
-- ============================================

CREATE TABLE IF NOT EXISTS game_settings (
  id serial PRIMARY KEY,
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_speed_settings (
  id serial PRIMARY KEY,
  game_speed numeric(10,2) DEFAULT 1.0,
  fleet_speed numeric(10,2) DEFAULT 1.0,
  resource_speed numeric(10,2) DEFAULT 1.0,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid,
  registration_enabled boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS admin_smtp_settings (
  id serial PRIMARY KEY,
  smtp_host text,
  smtp_port integer DEFAULT 587,
  smtp_user text,
  smtp_password text,
  smtp_from_email text,
  smtp_from_name text DEFAULT 'Falco-X Universo',
  is_enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_telegram_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token_reference text,
  group_chat_id text,
  is_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_telegram_settings (
  id serial PRIMARY KEY,
  chat_id text,
  is_enabled boolean DEFAULT false,
  bot_username text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text,
  group_title text,
  group_invite_link text,
  bot_added_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_config (
  id serial PRIMARY KEY,
  deposit_wallet_address text,
  hot_wallet_private_key text,
  usdt_contract_address text DEFAULT '0x55d398326f99059fF775485246999027B3197955',
  bsc_rpc_url text DEFAULT 'https://bsc-dataseed.binance.org/',
  fxu_to_usdt_rate numeric(18,8) DEFAULT 0.001,
  min_withdrawal_usdt numeric(18,8) DEFAULT 1.0,
  max_withdrawal_usdt numeric(18,8) DEFAULT 1000.0,
  withdrawal_fee_percent numeric(5,2) DEFAULT 2.0,
  withdrawal_enabled boolean DEFAULT true,
  deposit_enabled boolean DEFAULT true,
  swap_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jackpot_config (
  id serial PRIMARY KEY,
  contribution_rate integer DEFAULT 5,
  win_chance integer DEFAULT 1,
  max_win_percent integer DEFAULT 50,
  is_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_notification_config (
  id serial PRIMARY KEY,
  edge_function_url text,
  is_enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TIPOS DE ELEMENTOS DEL JUEGO
-- ============================================

CREATE TABLE IF NOT EXISTS building_types (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('resources', 'facilities', 'storage')),
  base_metal integer DEFAULT 0,
  base_crystal integer DEFAULT 0,
  base_deuterium integer DEFAULT 0,
  base_energy integer DEFAULT 0,
  cost_factor numeric(4,2) DEFAULT 1.5,
  base_time_seconds integer DEFAULT 60,
  max_level integer DEFAULT 50,
  image_url text
);

CREATE TABLE IF NOT EXISTS technology_types (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('basic', 'propulsion', 'military', 'advanced')),
  base_metal integer DEFAULT 0,
  base_crystal integer DEFAULT 0,
  base_deuterium integer DEFAULT 0,
  energy_required integer DEFAULT 0,
  cost_factor numeric(4,2) DEFAULT 2.0,
  base_time_seconds integer DEFAULT 120,
  max_level integer DEFAULT 20,
  image_url text
);

CREATE TABLE IF NOT EXISTS ship_types (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('civil', 'combat', 'special')),
  metal_cost integer DEFAULT 0,
  crystal_cost integer DEFAULT 0,
  deuterium_cost integer DEFAULT 0,
  build_time_seconds integer DEFAULT 60,
  structural_integrity integer DEFAULT 100,
  shield_power integer DEFAULT 0,
  weapon_power integer DEFAULT 0,
  cargo_capacity integer DEFAULT 0,
  base_speed integer DEFAULT 0,
  fuel_consumption integer DEFAULT 0,
  rapid_fire jsonb DEFAULT '{}',
  image_url text
);

CREATE TABLE IF NOT EXISTS defense_types (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  metal_cost integer DEFAULT 0,
  crystal_cost integer DEFAULT 0,
  deuterium_cost integer DEFAULT 0,
  build_time_seconds integer DEFAULT 60,
  structural_integrity integer DEFAULT 100,
  shield_power integer DEFAULT 0,
  weapon_power integer DEFAULT 0,
  image_url text
);

CREATE TABLE IF NOT EXISTS officer_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  bonus_type text,
  bonus_value numeric(10,4),
  duration_days integer DEFAULT 7,
  dark_matter_cost integer DEFAULT 0,
  fxu_cost numeric(18,8) DEFAULT 0,
  image_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supply_boxes (
  id serial PRIMARY KEY,
  name text NOT NULL,
  metal_amount bigint DEFAULT 0,
  crystal_amount bigint DEFAULT 0,
  deuterium_amount bigint DEFAULT 0,
  dark_matter_amount integer DEFAULT 0,
  price_fxu numeric(18,8) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plus_plans (
  id serial PRIMARY KEY,
  name text NOT NULL,
  duration_days integer NOT NULL,
  price_fxu numeric(18,8) NOT NULL,
  commission_rate numeric(5,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- REQUERIMIENTOS
-- ============================================

CREATE TABLE IF NOT EXISTS building_requirements (
  id serial PRIMARY KEY,
  building_type_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  required_building_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  required_level integer DEFAULT 1,
  UNIQUE(building_type_id, required_building_id)
);

CREATE TABLE IF NOT EXISTS technology_requirements (
  id serial PRIMARY KEY,
  technology_type_id integer REFERENCES technology_types(id) ON DELETE CASCADE,
  required_building_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  required_technology_id integer REFERENCES technology_types(id) ON DELETE CASCADE,
  required_level integer DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ship_requirements (
  id serial PRIMARY KEY,
  ship_type_id integer REFERENCES ship_types(id) ON DELETE CASCADE,
  required_building_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  required_technology_id integer REFERENCES technology_types(id) ON DELETE CASCADE,
  required_level integer DEFAULT 1
);

CREATE TABLE IF NOT EXISTS defense_requirements (
  id serial PRIMARY KEY,
  defense_type_id integer REFERENCES defense_types(id) ON DELETE CASCADE,
  required_building_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  required_technology_id integer REFERENCES technology_types(id) ON DELETE CASCADE,
  required_level integer DEFAULT 1
);

-- ============================================
-- PERFILES Y USUARIOS
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  username text UNIQUE NOT NULL,
  email text,
  avatar_url text,
  dark_matter integer DEFAULT 0,
  points_total integer DEFAULT 0,
  points_buildings integer DEFAULT 0,
  points_research integer DEFAULT 0,
  points_fleet integer DEFAULT 0,
  points_defense integer DEFAULT 0,
  rank_position integer DEFAULT 0,
  is_admin boolean DEFAULT false,
  is_banned boolean DEFAULT false,
  vacation_mode boolean DEFAULT false,
  vacation_mode_until timestamptz,
  last_activity timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  tung_balance numeric(18,8) DEFAULT 0,
  usdt_balance numeric(18,8) DEFAULT 0,
  referral_code text UNIQUE,
  referred_by uuid,
  battles_won integer DEFAULT 0,
  battles_lost integer DEFAULT 0,
  units_destroyed bigint DEFAULT 0,
  units_lost bigint DEFAULT 0,
  expeditions_total integer DEFAULT 0,
  expeditions_success integer DEFAULT 0,
  last_online_at timestamptz DEFAULT now(),
  total_online_seconds bigint DEFAULT 0,
  notification_sound boolean DEFAULT true,
  notification_fleet boolean DEFAULT true,
  notification_messages boolean DEFAULT true,
  registration_ip text,
  last_login_ip text
);

CREATE TABLE IF NOT EXISTS user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  deposit_address text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  telegram_user_id text UNIQUE,
  telegram_username text,
  is_verified boolean DEFAULT false,
  link_code text,
  link_code_expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS telegram_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text UNIQUE NOT NULL,
  title text,
  invite_link text,
  is_required boolean DEFAULT false,
  reward_fxu numeric(18,8) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_task_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  group_id uuid REFERENCES telegram_groups(id) ON DELETE CASCADE,
  reward_amount numeric(18,8) DEFAULT 0,
  claimed_at timestamptz DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(user_id, group_id)
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text UNIQUE NOT NULL,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  session_token text UNIQUE NOT NULL,
  ip_address text,
  user_agent text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- RONDAS Y ALIANZAS
-- ============================================

CREATE TABLE IF NOT EXISTS game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number integer NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  is_active boolean DEFAULT true,
  winner_alliance_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alliances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text UNIQUE NOT NULL CHECK (char_length(tag) <= 8),
  name text NOT NULL,
  founder_id uuid,
  leader_id uuid,
  description text,
  internal_text text,
  logo_url text,
  member_count integer DEFAULT 1,
  max_members integer DEFAULT 50,
  points_total integer DEFAULT 0,
  rank_position integer DEFAULT 0,
  is_recruiting boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alliance_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  rank_name text DEFAULT 'Miembro',
  rank_level integer DEFAULT 0,
  can_invite boolean DEFAULT false,
  can_kick boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_manage_diplomacy boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS alliance_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  message text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid,
  UNIQUE(alliance_id, user_id)
);

CREATE TABLE IF NOT EXISTS alliance_diplomacy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE,
  target_alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE,
  relation_type text CHECK (relation_type IN ('war', 'peace', 'nap', 'alliance')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'ended')),
  proposed_by uuid,
  accepted_by uuid,
  created_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  UNIQUE(alliance_id, target_alliance_id)
);

-- ============================================
-- PLANETAS Y RECURSOS
-- ============================================

CREATE TABLE IF NOT EXISTS planets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Planeta',
  galaxy integer NOT NULL CHECK (galaxy >= 1 AND galaxy <= 9),
  solar_system integer NOT NULL CHECK (solar_system >= 1 AND solar_system <= 499),
  position integer NOT NULL CHECK (position >= 1 AND position <= 15),
  planet_type text DEFAULT 'planet' CHECK (planet_type IN ('planet', 'moon', 'debris')),
  image_id integer DEFAULT 1,
  diameter integer DEFAULT 12800,
  fields_used integer DEFAULT 0,
  fields_max integer DEFAULT 163,
  temp_min integer DEFAULT -40,
  temp_max integer DEFAULT 30,
  is_main_planet boolean DEFAULT false,
  is_destroyed boolean DEFAULT false,
  last_update timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(galaxy, solar_system, position, planet_type)
);

CREATE TABLE IF NOT EXISTS planet_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid REFERENCES planets(id) ON DELETE CASCADE UNIQUE,
  metal numeric(20,2) DEFAULT 500,
  crystal numeric(20,2) DEFAULT 500,
  deuterium numeric(20,2) DEFAULT 0,
  energy_used integer DEFAULT 0,
  energy_max integer DEFAULT 0,
  metal_per_hour numeric(15,2) DEFAULT 30,
  crystal_per_hour numeric(15,2) DEFAULT 15,
  deuterium_per_hour numeric(15,2) DEFAULT 0,
  metal_storage numeric(20,2) DEFAULT 10000,
  crystal_storage numeric(20,2) DEFAULT 10000,
  deuterium_storage numeric(20,2) DEFAULT 10000,
  last_update timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planet_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid REFERENCES planets(id) ON DELETE CASCADE,
  building_type_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  level integer DEFAULT 0,
  is_upgrading boolean DEFAULT false,
  upgrade_end_time timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(planet_id, building_type_id)
);

CREATE TABLE IF NOT EXISTS planet_ships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid REFERENCES planets(id) ON DELETE CASCADE,
  ship_type_id integer REFERENCES ship_types(id) ON DELETE CASCADE,
  quantity integer DEFAULT 0,
  in_construction integer DEFAULT 0,
  construction_end_time timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(planet_id, ship_type_id)
);

CREATE TABLE IF NOT EXISTS planet_defenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid REFERENCES planets(id) ON DELETE CASCADE,
  defense_type_id integer REFERENCES defense_types(id) ON DELETE CASCADE,
  quantity integer DEFAULT 0,
  in_construction integer DEFAULT 0,
  construction_end_time timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(planet_id, defense_type_id)
);

CREATE TABLE IF NOT EXISTS galaxy_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  galaxy integer NOT NULL,
  solar_system integer NOT NULL,
  position integer NOT NULL,
  planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  debris_metal numeric(20,2) DEFAULT 0,
  debris_crystal numeric(20,2) DEFAULT 0,
  UNIQUE(galaxy, solar_system, position)
);

-- ============================================
-- TECNOLOGÍAS Y OFICIALES
-- ============================================

CREATE TABLE IF NOT EXISTS user_technologies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  technology_type_id integer REFERENCES technology_types(id) ON DELETE CASCADE,
  level integer DEFAULT 0,
  is_researching boolean DEFAULT false,
  research_end_time timestamptz,
  research_planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, technology_type_id)
);

CREATE TABLE IF NOT EXISTS user_officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  officer_type_id uuid REFERENCES officer_types(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, officer_type_id)
);

-- ============================================
-- COLAS DE CONSTRUCCIÓN
-- ============================================

CREATE TABLE IF NOT EXISTS building_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid REFERENCES planets(id) ON DELETE CASCADE,
  building_type_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  target_level integer NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_processing boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipyard_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid REFERENCES planets(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('ship', 'defense')),
  item_id integer NOT NULL,
  quantity integer NOT NULL,
  single_build_time integer NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_processing boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  planet_id uuid REFERENCES planets(id) ON DELETE CASCADE,
  technology_type_id integer REFERENCES technology_types(id) ON DELETE CASCADE,
  target_level integer NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_processing boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- FLOTAS
-- ============================================

CREATE TABLE IF NOT EXISTS fleets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  origin_planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  target_galaxy integer NOT NULL,
  target_system integer NOT NULL,
  target_position integer NOT NULL,
  target_type text DEFAULT 'planet',
  target_planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  mission_type text NOT NULL CHECK (mission_type IN ('attack', 'transport', 'deploy', 'colonize', 'espionage', 'recycle', 'destroy', 'expedition', 'hold', 'acs_attack', 'acs_defend', 'missile_attack')),
  cargo_metal numeric(20,2) DEFAULT 0,
  cargo_crystal numeric(20,2) DEFAULT 0,
  cargo_deuterium numeric(20,2) DEFAULT 0,
  departure_time timestamptz NOT NULL,
  arrival_time timestamptz NOT NULL,
  return_time timestamptz,
  is_returning boolean DEFAULT false,
  is_completed boolean DEFAULT false,
  hold_duration integer DEFAULT 0,
  acs_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_ships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid REFERENCES fleets(id) ON DELETE CASCADE,
  ship_type_id integer REFERENCES ship_types(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  UNIQUE(fleet_id, ship_type_id)
);

CREATE TABLE IF NOT EXISTS acs_fleets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  organizer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  target_galaxy integer NOT NULL,
  target_system integer NOT NULL,
  target_position integer NOT NULL,
  arrival_time timestamptz NOT NULL,
  status text DEFAULT 'forming' CHECK (status IN ('forming', 'launched', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acs_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acs_id uuid REFERENCES acs_fleets(id) ON DELETE CASCADE,
  fleet_id uuid REFERENCES fleets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(acs_id, user_id)
);

CREATE TABLE IF NOT EXISTS debris_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  galaxy integer NOT NULL,
  solar_system integer NOT NULL,
  position integer NOT NULL,
  metal numeric(20,2) DEFAULT 0,
  crystal numeric(20,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(galaxy, solar_system, position)
);

-- ============================================
-- MENSAJERÍA
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  message_type text DEFAULT 'player' CHECK (message_type IN ('player', 'system', 'battle', 'espionage', 'expedition', 'alliance', 'broadcast')),
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  username text NOT NULL,
  message text NOT NULL,
  is_deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- BATALLAS
-- ============================================

CREATE TABLE IF NOT EXISTS battle_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  defender_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  coordinates text NOT NULL,
  result text NOT NULL CHECK (result IN ('attacker_won', 'defender_won', 'draw')),
  rounds integer NOT NULL,
  attacker_losses_metal numeric(20,2) DEFAULT 0,
  attacker_losses_crystal numeric(20,2) DEFAULT 0,
  defender_losses_metal numeric(20,2) DEFAULT 0,
  defender_losses_crystal numeric(20,2) DEFAULT 0,
  debris_metal numeric(20,2) DEFAULT 0,
  debris_crystal numeric(20,2) DEFAULT 0,
  loot_metal numeric(20,2) DEFAULT 0,
  loot_crystal numeric(20,2) DEFAULT 0,
  loot_deuterium numeric(20,2) DEFAULT 0,
  attacker_ships_initial jsonb,
  attacker_ships_final jsonb,
  defender_ships_initial jsonb,
  defender_ships_final jsonb,
  defender_defenses_initial jsonb,
  defender_defenses_final jsonb,
  report_data jsonb NOT NULL,
  attacker_username text,
  defender_username text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- MERCADO
-- ============================================

CREATE TABLE IF NOT EXISTS market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  seller_planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('metal', 'crystal', 'deuterium', 'dark_matter', 'ship')),
  ship_type_id integer REFERENCES ship_types(id) ON DELETE CASCADE,
  quantity bigint NOT NULL CHECK (quantity > 0),
  price_per_unit numeric(18,8) NOT NULL CHECK (price_per_unit > 0),
  total_price numeric(18,8) NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled', 'expired')),
  buyer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  purchased_at timestamptz,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS market_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES market_listings(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  buyer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  quantity bigint NOT NULL,
  price_per_unit numeric(18,8) NOT NULL,
  total_price numeric(18,8) NOT NULL,
  fee_amount numeric(18,8) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- WALLET Y TRANSACCIONES
-- ============================================

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'swap', 'purchase', 'referral', 'reward', 'fee', 'transfer')),
  currency text NOT NULL CHECK (currency IN ('TUNG', 'USDT')),
  amount numeric(18,8) NOT NULL,
  fee_amount numeric(18,8) DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  tx_hash text,
  wallet_address text,
  notes text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  source_amount numeric(18,8) NOT NULL,
  commission_amount numeric(18,8) NOT NULL,
  commission_rate numeric(5,2) NOT NULL,
  currency text DEFAULT 'resources',
  metal_amount numeric(20,2) DEFAULT 0,
  crystal_amount numeric(20,2) DEFAULT 0,
  deuterium_amount numeric(20,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- ADMINISTRACIÓN
-- ============================================

CREATE TABLE IF NOT EXISTS admin_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_type text NOT NULL CHECK (revenue_type IN ('market_fee', 'officer_fxu', 'instant_building', 'instant_research', 'instant_shipyard', 'expedition_fee', 'fleet_acceleration', 'supply_box', 'plus_subscription', 'withdrawal_fee', 'swap_fee', 'other')),
  amount numeric(18,8) NOT NULL,
  currency text DEFAULT 'TUNG',
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_type text NOT NULL,
  amount numeric(18,8) NOT NULL,
  currency text DEFAULT 'TUNG',
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  amount_usdt numeric(18,8) NOT NULL,
  wallet_address text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  tx_hash text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- ============================================
-- JACKPOT Y POOLS
-- ============================================

CREATE TABLE IF NOT EXISTS jackpot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_pool numeric(18,8) DEFAULT 0,
  last_winner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  last_win_amount numeric(18,8) DEFAULT 0,
  last_win_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jackpot_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_type text NOT NULL CHECK (pool_type IN ('main', 'expedition', 'monthly')),
  total_amount numeric(18,8) DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(pool_type)
);

CREATE TABLE IF NOT EXISTS jackpot_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  pool_type text NOT NULL,
  amount_won numeric(18,8) NOT NULL,
  trigger_type text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- PLUS Y SUSCRIPCIONES
-- ============================================

CREATE TABLE IF NOT EXISTS plus_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id integer REFERENCES plus_plans(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plus_pending_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES plus_subscriptions(id) ON DELETE CASCADE,
  month_year text NOT NULL,
  amount numeric(18,8) DEFAULT 0,
  is_claimed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  claimed_at timestamptz,
  UNIQUE(user_id, subscription_id, month_year)
);

CREATE TABLE IF NOT EXISTS plus_commission_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  commission_rate numeric(5,2) NOT NULL,
  total_earned numeric(18,8) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plus_commission_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year text NOT NULL,
  total_distributed numeric(18,8) NOT NULL,
  participants_count integer NOT NULL,
  distributed_at timestamptz DEFAULT now()
);

-- ============================================
-- COMPRAS Y RECOMPENSAS
-- ============================================

CREATE TABLE IF NOT EXISTS supply_box_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  box_id integer REFERENCES supply_boxes(id) ON DELETE SET NULL,
  planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  price_paid numeric(18,8) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monthly_ranking_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year text NOT NULL,
  rank_position integer NOT NULL,
  reward_fxu numeric(18,8) NOT NULL,
  UNIQUE(month_year, rank_position)
);

CREATE TABLE IF NOT EXISTS monthly_ranking_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year text NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  rank_position integer NOT NULL,
  reward_amount numeric(18,8) NOT NULL,
  distributed_at timestamptz DEFAULT now()
);

-- ============================================
-- HALL OF FAME
-- ============================================

CREATE TABLE IF NOT EXISTS hall_of_fame_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid REFERENCES game_rounds(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN ('top_players', 'top_alliances', 'battles', 'expeditions')),
  snapshot_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hall_of_fame_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid REFERENCES game_rounds(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  category text NOT NULL CHECK (category IN ('general', 'fleet', 'research', 'buildings', 'battles')),
  username text NOT NULL,
  alliance_tag text,
  points integer NOT NULL,
  extra_stats jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hall_of_fame_alliances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid REFERENCES game_rounds(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  alliance_name text NOT NULL,
  alliance_tag text NOT NULL,
  founder_username text,
  member_count integer,
  total_points integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- LOGS Y REPORTES
-- ============================================

CREATE TABLE IF NOT EXISTS account_interaction_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  interaction_type text NOT NULL,
  metal_amount numeric(20,2) DEFAULT 0,
  crystal_amount numeric(20,2) DEFAULT 0,
  deuterium_amount numeric(20,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attack_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  defender_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  attack_count integer DEFAULT 1,
  first_attack_at timestamptz DEFAULT now(),
  last_attack_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS multiaccounting_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  suspected_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  report_reason text,
  evidence_data jsonb,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'confirmed', 'dismissed')),
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS suspicious_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  suspicion_type text NOT NULL,
  confidence_score numeric(5,2),
  evidence jsonb,
  is_reviewed boolean DEFAULT false,
  admin_decision text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

-- ============================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- ============================================

CREATE INDEX IF NOT EXISTS idx_planets_user ON planets(user_id);
CREATE INDEX IF NOT EXISTS idx_planets_coordinates ON planets(galaxy, solar_system, position);
CREATE INDEX IF NOT EXISTS idx_fleets_user ON fleets(user_id);
CREATE INDEX IF NOT EXISTS idx_fleets_arrival ON fleets(arrival_time) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_profiles_rank ON profiles(rank_position);
CREATE INDEX IF NOT EXISTS idx_profiles_points ON profiles(points_total DESC);
CREATE INDEX IF NOT EXISTS idx_alliances_rank ON alliances(rank_position);
CREATE INDEX IF NOT EXISTS idx_market_listings_active ON market_listings(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_building_queue_end ON building_queue(end_time);
CREATE INDEX IF NOT EXISTS idx_shipyard_queue_end ON shipyard_queue(end_time);
CREATE INDEX IF NOT EXISTS idx_research_queue_end ON research_queue(end_time);

-- ============================================
-- FIN DEL SCHEMA
-- ============================================
`;

export default DATABASE_SCHEMA_DDL;
