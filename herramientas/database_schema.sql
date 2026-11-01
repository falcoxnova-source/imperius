-- ============================================================================
-- FALCO-X UNIVERSO - DATABASE SCHEMA
-- Generated: 2026-01-26
-- Description: Complete database structure for creating an empty replica
-- ============================================================================

-- ============================================================================
-- SEQUENCES
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS building_requirements_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS building_types_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS defense_requirements_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS defense_types_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS galaxy_positions_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS game_settings_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS plus_plans_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ship_requirements_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ship_types_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS supply_boxes_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS technology_requirements_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS technology_types_id_seq START 1;

-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Core Game Configuration Tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_smtp_settings (
    id integer NOT NULL DEFAULT 1,
    smtp_host text DEFAULT '',
    smtp_port integer DEFAULT 587,
    smtp_user text DEFAULT '',
    smtp_password text DEFAULT '',
    smtp_from_email text DEFAULT '',
    smtp_from_name text DEFAULT 'Falco-X Universo',
    is_enabled boolean DEFAULT false,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT admin_smtp_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS admin_speed_settings (
    id integer NOT NULL DEFAULT 1,
    game_speed numeric NOT NULL DEFAULT 10,
    fleet_speed numeric NOT NULL DEFAULT 10,
    resource_speed numeric NOT NULL DEFAULT 10,
    updated_at timestamptz DEFAULT now(),
    updated_by uuid,
    registration_enabled boolean DEFAULT true,
    CONSTRAINT admin_speed_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS admin_telegram_config (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_chat_id text,
    bot_token_reference text DEFAULT 'TELEGRAM_BOT_TOKEN',
    is_enabled boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT admin_telegram_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS admin_telegram_settings (
    id integer NOT NULL DEFAULT 1,
    chat_id text,
    bot_username text DEFAULT 'FXUniversebot',
    is_enabled boolean DEFAULT false,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT admin_telegram_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS game_settings (
    id integer NOT NULL DEFAULT nextval('game_settings_id_seq'),
    key text NOT NULL,
    value text NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT game_settings_pkey PRIMARY KEY (id),
    CONSTRAINT game_settings_key_key UNIQUE (key)
);

CREATE TABLE IF NOT EXISTS game_rounds (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    round_number integer NOT NULL,
    name text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    is_active boolean NOT NULL DEFAULT false,
    total_players integer DEFAULT 0,
    total_alliances integer DEFAULT 0,
    notes text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT game_rounds_pkey PRIMARY KEY (id),
    CONSTRAINT game_rounds_round_number_key UNIQUE (round_number)
);

-- ----------------------------------------------------------------------------
-- User & Profile Tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    email text,
    avatar_url text,
    referral_code text,
    referred_by uuid,
    fxu_balance numeric DEFAULT 0,
    usdt_balance numeric NOT NULL DEFAULT 0,
    dark_matter integer NOT NULL DEFAULT 0,
    is_admin boolean DEFAULT false,
    is_banned boolean DEFAULT false,
    is_hidden boolean DEFAULT false,
    vacation_mode boolean DEFAULT false,
    vacation_mode_enabled_at timestamptz,
    email_verified boolean DEFAULT false,
    points_total integer DEFAULT 0,
    points_buildings integer DEFAULT 0,
    points_research integer DEFAULT 0,
    points_fleet integer DEFAULT 0,
    points_defense integer DEFAULT 0,
    points_expedition integer DEFAULT 0,
    rank_position integer DEFAULT 0,
    rank_buildings integer DEFAULT 0,
    rank_research integer DEFAULT 0,
    rank_fleet integer DEFAULT 0,
    rank_defense integer DEFAULT 0,
    rank_expedition integer DEFAULT 0,
    battles_won integer DEFAULT 0,
    battles_draw integer DEFAULT 0,
    battles_lost integer DEFAULT 0,
    units_destroyed bigint DEFAULT 0,
    units_lost bigint DEFAULT 0,
    debris_metal_total bigint DEFAULT 0,
    debris_crystal_total bigint DEFAULT 0,
    notify_attacks boolean DEFAULT true,
    notify_buildings boolean DEFAULT true,
    notify_research boolean DEFAULT true,
    notify_messages boolean DEFAULT true,
    last_activity timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_username_key UNIQUE (username),
    CONSTRAINT profiles_referral_code_key UNIQUE (referral_code)
);

CREATE TABLE IF NOT EXISTS login_sessions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    ip_address text NOT NULL,
    user_agent text,
    fingerprint text,
    country_code text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT login_sessions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    email text NOT NULL,
    token text NOT NULL,
    type text NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT email_verification_tokens_token_key UNIQUE (token)
);

-- ----------------------------------------------------------------------------
-- Building Types & Requirements
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS building_types (
    id integer NOT NULL DEFAULT nextval('building_types_id_seq'),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    image_url text,
    base_metal integer DEFAULT 0,
    base_crystal integer DEFAULT 0,
    base_deuterium integer DEFAULT 0,
    base_energy integer DEFAULT 0,
    cost_factor numeric DEFAULT 1.5,
    base_time_seconds integer DEFAULT 60,
    max_level integer DEFAULT 50,
    CONSTRAINT building_types_pkey PRIMARY KEY (id),
    CONSTRAINT building_types_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS building_requirements (
    id integer NOT NULL DEFAULT nextval('building_requirements_id_seq'),
    building_type_id integer NOT NULL,
    required_building_id integer,
    required_building_level integer DEFAULT 0,
    required_tech_id integer,
    required_tech_level integer DEFAULT 0,
    CONSTRAINT building_requirements_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Technology Types & Requirements
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS technology_types (
    id integer NOT NULL DEFAULT nextval('technology_types_id_seq'),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    image_url text,
    base_metal integer DEFAULT 0,
    base_crystal integer DEFAULT 0,
    base_deuterium integer DEFAULT 0,
    energy_required integer DEFAULT 0,
    cost_factor numeric DEFAULT 2.0,
    base_time_seconds integer DEFAULT 120,
    max_level integer DEFAULT 20,
    CONSTRAINT technology_types_pkey PRIMARY KEY (id),
    CONSTRAINT technology_types_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS technology_requirements (
    id integer NOT NULL DEFAULT nextval('technology_requirements_id_seq'),
    technology_type_id integer NOT NULL,
    required_building_id integer,
    required_building_level integer DEFAULT 0,
    required_tech_id integer,
    required_tech_level integer DEFAULT 0,
    CONSTRAINT technology_requirements_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Ship Types & Requirements
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ship_types (
    id integer NOT NULL DEFAULT nextval('ship_types_id_seq'),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    image_url text,
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
    CONSTRAINT ship_types_pkey PRIMARY KEY (id),
    CONSTRAINT ship_types_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS ship_requirements (
    id integer NOT NULL DEFAULT nextval('ship_requirements_id_seq'),
    ship_type_id integer NOT NULL,
    required_building_id integer,
    required_building_level integer DEFAULT 0,
    required_tech_id integer,
    required_tech_level integer DEFAULT 0,
    CONSTRAINT ship_requirements_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Defense Types & Requirements
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS defense_types (
    id integer NOT NULL DEFAULT nextval('defense_types_id_seq'),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    image_url text,
    metal_cost integer DEFAULT 0,
    crystal_cost integer DEFAULT 0,
    deuterium_cost integer DEFAULT 0,
    build_time_seconds integer DEFAULT 60,
    structural_integrity integer DEFAULT 100,
    shield_power integer DEFAULT 0,
    weapon_power integer DEFAULT 0,
    max_per_planet integer,
    CONSTRAINT defense_types_pkey PRIMARY KEY (id),
    CONSTRAINT defense_types_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS defense_requirements (
    id integer NOT NULL DEFAULT nextval('defense_requirements_id_seq'),
    defense_type_id integer NOT NULL,
    required_building_id integer,
    required_building_level integer DEFAULT 0,
    required_tech_id integer,
    required_tech_level integer DEFAULT 0,
    CONSTRAINT defense_requirements_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Galaxy & Planets
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS galaxy_positions (
    id integer NOT NULL DEFAULT nextval('galaxy_positions_id_seq'),
    galaxy integer NOT NULL,
    solar_system integer NOT NULL,
    position integer NOT NULL,
    is_occupied boolean DEFAULT false,
    occupied_by uuid,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT galaxy_positions_pkey PRIMARY KEY (id),
    CONSTRAINT galaxy_positions_galaxy_solar_system_position_key UNIQUE (galaxy, solar_system, position)
);

CREATE TABLE IF NOT EXISTS planets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    name text NOT NULL DEFAULT 'Planeta',
    galaxy integer NOT NULL,
    solar_system integer NOT NULL,
    position integer NOT NULL,
    planet_type text DEFAULT 'planet',
    image_id integer DEFAULT 1,
    diameter integer DEFAULT 12800,
    fields_used integer DEFAULT 0,
    fields_max integer DEFAULT 163,
    temp_min integer DEFAULT -40,
    temp_max integer DEFAULT 30,
    is_main_planet boolean DEFAULT false,
    is_destroyed boolean DEFAULT false,
    jump_gate_cooldown timestamptz,
    created_at timestamptz DEFAULT now(),
    last_update timestamptz DEFAULT now(),
    CONSTRAINT planets_pkey PRIMARY KEY (id),
    CONSTRAINT planets_galaxy_solar_system_position_planet_type_key UNIQUE (galaxy, solar_system, position, planet_type)
);

CREATE TABLE IF NOT EXISTS planet_resources (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    planet_id uuid,
    metal numeric DEFAULT 500,
    crystal numeric DEFAULT 500,
    deuterium numeric DEFAULT 0,
    metal_per_hour numeric DEFAULT 30,
    crystal_per_hour numeric DEFAULT 15,
    deuterium_per_hour numeric DEFAULT 0,
    metal_storage numeric DEFAULT 10000,
    crystal_storage numeric DEFAULT 10000,
    deuterium_storage numeric DEFAULT 10000,
    energy_used integer DEFAULT 0,
    energy_max integer DEFAULT 0,
    last_update timestamptz DEFAULT now(),
    CONSTRAINT planet_resources_pkey PRIMARY KEY (id),
    CONSTRAINT planet_resources_planet_id_key UNIQUE (planet_id)
);

CREATE TABLE IF NOT EXISTS planet_buildings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    planet_id uuid,
    building_type_id integer,
    level integer DEFAULT 0,
    is_upgrading boolean DEFAULT false,
    upgrade_end_time timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT planet_buildings_pkey PRIMARY KEY (id),
    CONSTRAINT planet_buildings_planet_id_building_type_id_key UNIQUE (planet_id, building_type_id)
);

CREATE TABLE IF NOT EXISTS planet_ships (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    planet_id uuid,
    ship_type_id integer,
    quantity integer DEFAULT 0,
    in_construction integer DEFAULT 0,
    construction_end_time timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT planet_ships_pkey PRIMARY KEY (id),
    CONSTRAINT planet_ships_planet_id_ship_type_id_key UNIQUE (planet_id, ship_type_id)
);

CREATE TABLE IF NOT EXISTS planet_defenses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    planet_id uuid,
    defense_type_id integer,
    quantity integer DEFAULT 0,
    in_construction integer DEFAULT 0,
    construction_end_time timestamptz,
    anti_ballistic_missiles integer DEFAULT 0,
    interplanetary_missiles integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT planet_defenses_pkey PRIMARY KEY (id),
    CONSTRAINT planet_defenses_planet_id_defense_type_id_key UNIQUE (planet_id, defense_type_id)
);

CREATE TABLE IF NOT EXISTS debris_fields (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    galaxy integer NOT NULL,
    solar_system integer NOT NULL,
    position integer NOT NULL,
    metal numeric DEFAULT 0,
    crystal numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT debris_fields_pkey PRIMARY KEY (id),
    CONSTRAINT debris_fields_galaxy_solar_system_position_key UNIQUE (galaxy, solar_system, position)
);

-- ----------------------------------------------------------------------------
-- User Technologies & Officers
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_technologies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    technology_type_id integer,
    level integer DEFAULT 0,
    is_researching boolean DEFAULT false,
    research_start_time timestamptz,
    research_end_time timestamptz,
    research_planet_id uuid,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT user_technologies_pkey PRIMARY KEY (id),
    CONSTRAINT user_technologies_user_id_technology_type_id_key UNIQUE (user_id, technology_type_id)
);

CREATE TABLE IF NOT EXISTS officer_types (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    icon text NOT NULL DEFAULT 'user',
    bonus_type text NOT NULL,
    bonus_value numeric NOT NULL DEFAULT 0,
    bonus_secondary_type text,
    bonus_secondary_value numeric,
    dark_matter_cost_7d integer NOT NULL DEFAULT 5000,
    dark_matter_cost_30d integer NOT NULL DEFAULT 15000,
    dark_matter_cost_90d integer NOT NULL DEFAULT 40000,
    fxu_cost_7d integer DEFAULT 0,
    fxu_cost_30d integer DEFAULT 0,
    fxu_cost_90d integer DEFAULT 0,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT officer_types_pkey PRIMARY KEY (id),
    CONSTRAINT officer_types_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS user_officers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    officer_type_id uuid NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT user_officers_pkey PRIMARY KEY (id),
    CONSTRAINT user_officers_user_id_officer_type_id_key UNIQUE (user_id, officer_type_id)
);

-- ----------------------------------------------------------------------------
-- Queues (Building, Research, Shipyard)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS building_queue (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    planet_id uuid NOT NULL,
    building_type_id integer NOT NULL,
    target_level integer NOT NULL DEFAULT 1,
    queue_position integer NOT NULL DEFAULT 1,
    metal_cost bigint NOT NULL DEFAULT 0,
    crystal_cost bigint NOT NULL DEFAULT 0,
    deuterium_cost bigint NOT NULL DEFAULT 0,
    build_time integer NOT NULL DEFAULT 0,
    start_time timestamptz,
    end_time timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT building_queue_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS research_queue (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    planet_id uuid,
    technology_type_id integer NOT NULL,
    target_level integer NOT NULL DEFAULT 1,
    queue_position integer NOT NULL DEFAULT 1,
    metal_cost bigint NOT NULL DEFAULT 0,
    crystal_cost bigint NOT NULL DEFAULT 0,
    deuterium_cost bigint NOT NULL DEFAULT 0,
    research_time integer NOT NULL DEFAULT 0,
    start_time timestamptz,
    end_time timestamptz,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz DEFAULT now(),
    CONSTRAINT research_queue_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS shipyard_queue (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    planet_id uuid NOT NULL,
    item_type text NOT NULL,
    ship_type_id integer,
    defense_type_id integer,
    quantity integer NOT NULL,
    quantity_completed integer NOT NULL DEFAULT 0,
    queue_position integer NOT NULL DEFAULT 1,
    metal_cost bigint NOT NULL DEFAULT 0,
    crystal_cost bigint NOT NULL DEFAULT 0,
    deuterium_cost bigint NOT NULL DEFAULT 0,
    build_time_per_unit integer NOT NULL DEFAULT 0,
    start_time timestamptz,
    current_unit_end_time timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT shipyard_queue_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Fleet System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fleets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    origin_planet_id uuid,
    target_galaxy integer NOT NULL,
    target_system integer NOT NULL,
    target_position integer NOT NULL,
    target_type text DEFAULT 'planet',
    mission_type text NOT NULL,
    cargo_metal numeric DEFAULT 0,
    cargo_crystal numeric DEFAULT 0,
    cargo_deuterium numeric DEFAULT 0,
    departure_time timestamptz NOT NULL,
    arrival_time timestamptz NOT NULL,
    return_time timestamptz,
    is_returning boolean DEFAULT false,
    is_completed boolean DEFAULT false,
    is_acs boolean NOT NULL DEFAULT false,
    acs_id uuid,
    acs_fleet_id uuid,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT fleets_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS fleet_ships (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    fleet_id uuid,
    ship_type_id integer,
    quantity integer NOT NULL,
    CONSTRAINT fleet_ships_pkey PRIMARY KEY (id),
    CONSTRAINT fleet_ships_fleet_id_ship_type_id_key UNIQUE (fleet_id, ship_type_id)
);

CREATE TABLE IF NOT EXISTS acs_fleets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL DEFAULT 'ACS Attack',
    creator_id uuid,
    alliance_id uuid,
    main_fleet_id uuid,
    invite_code text DEFAULT encode(gen_random_bytes(6), 'hex'),
    invited_users uuid[] DEFAULT '{}',
    target_galaxy integer NOT NULL,
    target_system integer NOT NULL,
    target_position integer NOT NULL,
    arrival_time timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'waiting',
    is_active boolean NOT NULL DEFAULT true,
    max_fleets integer NOT NULL DEFAULT 5,
    current_participants integer DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT acs_fleets_pkey PRIMARY KEY (id),
    CONSTRAINT acs_fleets_invite_code_key UNIQUE (invite_code)
);

CREATE TABLE IF NOT EXISTS acs_participants (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    acs_id uuid,
    fleet_id uuid,
    user_id uuid,
    joined_at timestamptz DEFAULT now(),
    CONSTRAINT acs_participants_pkey PRIMARY KEY (id),
    CONSTRAINT acs_participants_acs_id_fleet_id_key UNIQUE (acs_id, fleet_id)
);

CREATE TABLE IF NOT EXISTS fleet_restoration_log (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    fleet_id uuid NOT NULL,
    user_id uuid NOT NULL,
    username text,
    planet_id uuid NOT NULL,
    ships_restored jsonb,
    resources_restored jsonb,
    restored_by uuid,
    restored_at timestamptz DEFAULT now(),
    CONSTRAINT fleet_restoration_log_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Combat & Battle Reports
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS attack_log (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    attacker_id uuid,
    defender_id uuid,
    target_planet_id uuid,
    attack_time timestamptz DEFAULT now(),
    CONSTRAINT attack_log_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS battle_reports (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    attacker_id uuid,
    defender_id uuid,
    planet_id uuid,
    coordinates text NOT NULL,
    result text NOT NULL,
    rounds integer NOT NULL,
    report_data jsonb NOT NULL,
    attacker_losses_metal numeric DEFAULT 0,
    attacker_losses_crystal numeric DEFAULT 0,
    defender_losses_metal numeric DEFAULT 0,
    defender_losses_crystal numeric DEFAULT 0,
    debris_metal numeric DEFAULT 0,
    debris_crystal numeric DEFAULT 0,
    loot_metal numeric DEFAULT 0,
    loot_crystal numeric DEFAULT 0,
    loot_deuterium numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT battle_reports_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Alliance System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alliances (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    tag text NOT NULL,
    description text,
    internal_text text,
    logo_url text,
    founder_id uuid,
    leader_id uuid,
    member_count integer DEFAULT 1,
    points_total integer DEFAULT 0,
    rank_position integer DEFAULT 0,
    is_open boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT alliances_pkey PRIMARY KEY (id),
    CONSTRAINT alliances_tag_key UNIQUE (tag)
);

CREATE TABLE IF NOT EXISTS alliance_members (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    alliance_id uuid,
    user_id uuid,
    rank_name text DEFAULT 'Miembro',
    rank_level integer DEFAULT 0,
    can_invite boolean DEFAULT false,
    can_kick boolean DEFAULT false,
    can_edit boolean DEFAULT false,
    joined_at timestamptz DEFAULT now(),
    CONSTRAINT alliance_members_pkey PRIMARY KEY (id),
    CONSTRAINT alliance_members_user_id_key UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS alliance_applications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    alliance_id uuid,
    user_id uuid,
    message text DEFAULT '',
    status text DEFAULT 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT alliance_applications_pkey PRIMARY KEY (id),
    CONSTRAINT alliance_applications_alliance_id_user_id_key UNIQUE (alliance_id, user_id)
);

CREATE TABLE IF NOT EXISTS alliance_diplomacy (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    alliance_id uuid,
    target_alliance_id uuid,
    diplomacy_type text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    message text,
    proposed_by uuid,
    proposed_at timestamptz DEFAULT now(),
    responded_by uuid,
    accepted_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT alliance_diplomacy_pkey PRIMARY KEY (id),
    CONSTRAINT alliance_diplomacy_alliance_id_target_alliance_id_diplomacy_key UNIQUE (alliance_id, target_alliance_id, diplomacy_type, status)
);

-- ----------------------------------------------------------------------------
-- Messages System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    sender_id uuid,
    recipient_id uuid,
    subject text NOT NULL,
    body text NOT NULL,
    message_type text DEFAULT 'player',
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT messages_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public_chat_messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    username text NOT NULL,
    avatar_url text,
    alliance_tag text,
    message text NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT public_chat_messages_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Market System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_listings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    seller_id uuid,
    planet_id uuid,
    listing_type text NOT NULL,
    item_code text NOT NULL,
    quantity bigint NOT NULL,
    price_per_unit numeric NOT NULL,
    total_price numeric NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT market_listings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS market_transactions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    listing_id uuid,
    buyer_id uuid,
    seller_id uuid,
    item_type text NOT NULL,
    item_code text NOT NULL,
    quantity bigint NOT NULL,
    total_price numeric NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT market_transactions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS market_notification_config (
    id integer NOT NULL DEFAULT 1,
    edge_function_url text NOT NULL,
    anon_key text,
    is_enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT market_notification_config_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Referral System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_commissions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    referrer_id uuid,
    seller_id uuid NOT NULL,
    transaction_id uuid,
    commission_type text NOT NULL,
    amount bigint NOT NULL DEFAULT 0,
    fxu_amount numeric DEFAULT 0,
    resource_type text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT referral_commissions_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Wallet & Financial System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wallet_config (
    id integer NOT NULL DEFAULT 1,
    deposit_wallet_address text NOT NULL DEFAULT '',
    contract_address text DEFAULT '',
    signer_address text DEFAULT '',
    chain_id integer DEFAULT 56,
    required_confirmations integer NOT NULL DEFAULT 3,
    min_deposit numeric NOT NULL DEFAULT 1,
    max_withdrawal_daily numeric NOT NULL DEFAULT 10000,
    withdrawal_fee_percent numeric NOT NULL DEFAULT 2,
    is_deposits_enabled boolean NOT NULL DEFAULT true,
    is_withdrawals_enabled boolean NOT NULL DEFAULT true,
    signature_expiry_seconds integer DEFAULT 900,
    usdt_contract_address text NOT NULL DEFAULT '0x55d398326f99059fF775485246999027B3197955',
    usdt_min_deposit numeric NOT NULL DEFAULT 1,
    usdt_max_withdrawal_daily numeric NOT NULL DEFAULT 10000,
    usdt_withdrawal_fee_percent numeric NOT NULL DEFAULT 2,
    is_usdt_deposits_enabled boolean NOT NULL DEFAULT true,
    is_usdt_withdrawals_enabled boolean NOT NULL DEFAULT true,
    is_swap_enabled boolean NOT NULL DEFAULT true,
    swap_rate_fxu_per_usdt numeric NOT NULL DEFAULT 10000,
    swap_min_fxu numeric NOT NULL DEFAULT 1000,
    swap_min_usdt numeric NOT NULL DEFAULT 0.1,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT wallet_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS user_wallets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    wallet_address text NOT NULL,
    is_verified boolean DEFAULT false,
    verification_signature text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT user_wallets_pkey PRIMARY KEY (id),
    CONSTRAINT user_wallets_user_id_key UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    wallet_address text NOT NULL,
    tx_type text NOT NULL,
    token_type text NOT NULL DEFAULT 'FXU',
    amount numeric NOT NULL,
    fxu_amount numeric NOT NULL,
    tx_hash text,
    contract_tx_hash text,
    status text NOT NULL DEFAULT 'pending',
    confirmations integer DEFAULT 0,
    block_number bigint,
    signature_data jsonb,
    signature_expiry timestamptz,
    error_message text,
    processed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id),
    CONSTRAINT wallet_transactions_tx_hash_key UNIQUE (tx_hash)
);

CREATE TABLE IF NOT EXISTS admin_withdrawals (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    amount numeric NOT NULL,
    wallet_address text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    tx_hash text,
    error_message text,
    processed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT admin_withdrawals_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS admin_revenue (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    revenue_type text NOT NULL,
    amount numeric NOT NULL DEFAULT 0,
    description text,
    related_user_id uuid,
    related_tx_id uuid,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT admin_revenue_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS admin_expenses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    expense_type text NOT NULL,
    amount numeric NOT NULL,
    description text,
    related_user_id uuid,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT admin_expenses_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Jackpot System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jackpot (
    id integer NOT NULL DEFAULT 1,
    balance numeric NOT NULL DEFAULT 0,
    total_contributed numeric NOT NULL DEFAULT 0,
    total_won numeric NOT NULL DEFAULT 0,
    last_winner_id uuid,
    last_won_at timestamptz,
    last_won_amount numeric DEFAULT 0,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT jackpot_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS jackpot_config (
    id integer NOT NULL DEFAULT 1,
    contribution_rate numeric NOT NULL DEFAULT 10,
    win_chance numeric NOT NULL DEFAULT 1,
    min_win_percent numeric NOT NULL DEFAULT 10,
    max_win_percent numeric NOT NULL DEFAULT 50,
    min_jackpot_for_win numeric NOT NULL DEFAULT 1000,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT jackpot_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS jackpot_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    type text NOT NULL,
    source text NOT NULL,
    amount numeric NOT NULL,
    jackpot_balance_after numeric NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT jackpot_history_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS jackpot_pools (
    id integer NOT NULL DEFAULT 1,
    expedition_percent integer NOT NULL DEFAULT 20,
    expedition_balance numeric NOT NULL DEFAULT 0,
    expedition_total numeric NOT NULL DEFAULT 0,
    monthly_percent integer NOT NULL DEFAULT 20,
    monthly_balance numeric NOT NULL DEFAULT 0,
    monthly_total numeric NOT NULL DEFAULT 0,
    plus_percent integer NOT NULL DEFAULT 50,
    plus_balance numeric NOT NULL DEFAULT 0,
    plus_total numeric NOT NULL DEFAULT 0,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT jackpot_pools_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Plus Subscription System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plus_plans (
    id integer NOT NULL DEFAULT nextval('plus_plans_id_seq'),
    code text NOT NULL,
    name text NOT NULL,
    duration_months integer NOT NULL,
    price_fxu numeric NOT NULL,
    price_usdt numeric NOT NULL,
    commission_share_percent numeric NOT NULL DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT plus_plans_pkey PRIMARY KEY (id),
    CONSTRAINT plus_plans_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS plus_subscriptions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    plan_id integer NOT NULL,
    payment_type text NOT NULL,
    amount_paid numeric NOT NULL,
    commission_share_percent numeric NOT NULL,
    is_active boolean DEFAULT true,
    started_at timestamptz DEFAULT now(),
    expires_at timestamptz NOT NULL,
    reward_calculated boolean DEFAULT false,
    pending_reward_amount numeric DEFAULT 0,
    total_commissions_received numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT plus_subscriptions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS plus_commission_distributions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    distribution_month date NOT NULL,
    total_pool_amount numeric NOT NULL,
    total_subscribers integer NOT NULL,
    distributed_by uuid,
    distributed_at timestamptz DEFAULT now(),
    CONSTRAINT plus_commission_distributions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS plus_commission_rewards (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    distribution_id uuid NOT NULL,
    user_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    share_percent numeric NOT NULL,
    reward_amount numeric NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT plus_commission_rewards_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS plus_pending_rewards (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    subscription_month date NOT NULL,
    reward_amount numeric NOT NULL DEFAULT 0,
    paid_out boolean NOT NULL DEFAULT false,
    paid_out_at timestamptz,
    distribution_id uuid,
    calculated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT plus_pending_rewards_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Monthly Ranking System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS monthly_ranking_distributions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    distribution_month date NOT NULL,
    total_pool_amount numeric NOT NULL,
    distributed_by uuid,
    distributed_at timestamptz DEFAULT now(),
    CONSTRAINT monthly_ranking_distributions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS monthly_ranking_rewards (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    distribution_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rank_position integer NOT NULL,
    points_at_distribution bigint NOT NULL,
    reward_percent numeric NOT NULL,
    reward_amount numeric NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT monthly_ranking_rewards_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Supply Boxes System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS supply_boxes (
    id integer NOT NULL DEFAULT nextval('supply_boxes_id_seq'),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    metal_amount bigint NOT NULL DEFAULT 0,
    crystal_amount bigint NOT NULL DEFAULT 0,
    deuterium_amount bigint NOT NULL DEFAULT 0,
    price_fxu numeric NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT supply_boxes_pkey PRIMARY KEY (id),
    CONSTRAINT supply_boxes_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS supply_box_purchases (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    planet_id uuid NOT NULL,
    box_id integer NOT NULL,
    box_name text NOT NULL,
    fxu_paid numeric NOT NULL,
    metal_received bigint NOT NULL,
    crystal_received bigint NOT NULL,
    deuterium_received bigint NOT NULL,
    purchased_at timestamptz DEFAULT now(),
    CONSTRAINT supply_box_purchases_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------------------------
-- Hall of Fame System
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hall_of_fame_players (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    round_id uuid NOT NULL,
    username text NOT NULL,
    alliance_tag text,
    category text NOT NULL,
    rank integer NOT NULL,
    points bigint NOT NULL DEFAULT 0,
    extra_stats jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    CONSTRAINT hall_of_fame_players_pkey PRIMARY KEY (id),
    CONSTRAINT hall_of_fame_players_round_id_category_rank_key UNIQUE (round_id, category, rank)
);

CREATE TABLE IF NOT EXISTS hall_of_fame_alliances (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    round_id uuid NOT NULL,
    alliance_name text NOT NULL,
    alliance_tag text NOT NULL,
    founder_username text,
    rank integer NOT NULL,
    member_count integer NOT NULL DEFAULT 0,
    total_points bigint NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT hall_of_fame_alliances_pkey PRIMARY KEY (id),
    CONSTRAINT hall_of_fame_alliances_round_id_rank_key UNIQUE (round_id, rank)
);

CREATE TABLE IF NOT EXISTS hall_of_fame_records (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    round_id uuid NOT NULL,
    record_type text NOT NULL,
    username text NOT NULL,
    value bigint NOT NULL DEFAULT 0,
    description text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT hall_of_fame_records_pkey PRIMARY KEY (id),
    CONSTRAINT hall_of_fame_records_round_id_record_type_key UNIQUE (round_id, record_type)
);

-- ----------------------------------------------------------------------------
-- Telegram Integration
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_config (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id text,
    group_title text,
    group_invite_link text,
    bot_added_at timestamptz,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT telegram_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS telegram_groups (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    chat_id text NOT NULL,
    title text,
    username text,
    is_enabled boolean DEFAULT true,
    added_at timestamptz DEFAULT now(),
    last_message_at timestamptz,
    CONSTRAINT telegram_groups_pkey PRIMARY KEY (id),
    CONSTRAINT telegram_groups_chat_id_key UNIQUE (chat_id)
);

CREATE TABLE IF NOT EXISTS telegram_links (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    telegram_id bigint,
    telegram_username text,
    link_code text,
    linked_at timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT telegram_links_pkey PRIMARY KEY (id),
    CONSTRAINT telegram_links_user_id_key UNIQUE (user_id),
    CONSTRAINT telegram_links_telegram_id_key UNIQUE (telegram_id),
    CONSTRAINT telegram_links_link_code_key UNIQUE (link_code)
);

CREATE TABLE IF NOT EXISTS telegram_task_rewards (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    telegram_id bigint NOT NULL,
    task_type text NOT NULL DEFAULT 'join_group',
    reward_amount integer NOT NULL DEFAULT 50,
    reward_claimed boolean NOT NULL DEFAULT false,
    reward_revoked boolean NOT NULL DEFAULT false,
    is_member boolean NOT NULL DEFAULT false,
    first_join_at timestamptz,
    last_leave_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT telegram_task_rewards_pkey PRIMARY KEY (id),
    CONSTRAINT telegram_task_rewards_user_id_task_type_key UNIQUE (user_id, task_type),
    CONSTRAINT telegram_task_rewards_telegram_id_task_type_key UNIQUE (telegram_id, task_type)
);

-- ----------------------------------------------------------------------------
-- Anti-Cheat & Security
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS account_interaction_log (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    interaction_type text NOT NULL,
    metal_amount numeric DEFAULT 0,
    crystal_amount numeric DEFAULT 0,
    deuterium_amount numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT account_interaction_log_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS suspicious_accounts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    linked_user_id uuid,
    suspicion_type text NOT NULL,
    severity text DEFAULT 'low',
    evidence jsonb DEFAULT '{}',
    is_reviewed boolean DEFAULT false,
    is_confirmed_multi boolean DEFAULT false,
    reviewed_by uuid,
    reviewed_at timestamptz,
    review_notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT suspicious_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT suspicious_accounts_user_id_linked_user_id_suspicion_type_key UNIQUE (user_id, linked_user_id, suspicion_type)
);

CREATE TABLE IF NOT EXISTS multiaccounting_reports (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    reporter_id uuid NOT NULL,
    reported_user_id uuid NOT NULL,
    suspected_linked_user_id uuid,
    reason text NOT NULL,
    evidence_description text,
    status text DEFAULT 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    review_notes text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT multiaccounting_reports_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS admin_account_deletions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    deleted_user_id uuid NOT NULL,
    deleted_username text NOT NULL,
    deleted_email text,
    deletion_category text NOT NULL,
    days_inactive integer NOT NULL,
    points_total integer DEFAULT 0,
    metadata jsonb DEFAULT '{}',
    deleted_by uuid,
    deleted_at timestamptz DEFAULT now(),
    CONSTRAINT admin_account_deletions_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Profiles
ALTER TABLE profiles ADD CONSTRAINT profiles_referred_by_fkey
    FOREIGN KEY (referred_by) REFERENCES profiles(id);

-- Admin Speed Settings
ALTER TABLE admin_speed_settings ADD CONSTRAINT admin_speed_settings_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id);

-- Login Sessions
ALTER TABLE login_sessions ADD CONSTRAINT login_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Email Verification Tokens
ALTER TABLE email_verification_tokens ADD CONSTRAINT email_verification_tokens_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Building Requirements
ALTER TABLE building_requirements ADD CONSTRAINT building_requirements_building_type_id_fkey
    FOREIGN KEY (building_type_id) REFERENCES building_types(id);
ALTER TABLE building_requirements ADD CONSTRAINT building_requirements_required_building_id_fkey
    FOREIGN KEY (required_building_id) REFERENCES building_types(id);
ALTER TABLE building_requirements ADD CONSTRAINT building_requirements_required_tech_id_fkey
    FOREIGN KEY (required_tech_id) REFERENCES technology_types(id);

-- Technology Requirements
ALTER TABLE technology_requirements ADD CONSTRAINT technology_requirements_technology_type_id_fkey
    FOREIGN KEY (technology_type_id) REFERENCES technology_types(id);
ALTER TABLE technology_requirements ADD CONSTRAINT technology_requirements_required_building_id_fkey
    FOREIGN KEY (required_building_id) REFERENCES building_types(id);
ALTER TABLE technology_requirements ADD CONSTRAINT technology_requirements_required_tech_id_fkey
    FOREIGN KEY (required_tech_id) REFERENCES technology_types(id);

-- Ship Requirements
ALTER TABLE ship_requirements ADD CONSTRAINT ship_requirements_ship_type_id_fkey
    FOREIGN KEY (ship_type_id) REFERENCES ship_types(id);
ALTER TABLE ship_requirements ADD CONSTRAINT ship_requirements_required_building_id_fkey
    FOREIGN KEY (required_building_id) REFERENCES building_types(id);
ALTER TABLE ship_requirements ADD CONSTRAINT ship_requirements_required_tech_id_fkey
    FOREIGN KEY (required_tech_id) REFERENCES technology_types(id);

-- Defense Requirements
ALTER TABLE defense_requirements ADD CONSTRAINT defense_requirements_defense_type_id_fkey
    FOREIGN KEY (defense_type_id) REFERENCES defense_types(id);
ALTER TABLE defense_requirements ADD CONSTRAINT defense_requirements_required_building_id_fkey
    FOREIGN KEY (required_building_id) REFERENCES building_types(id);
ALTER TABLE defense_requirements ADD CONSTRAINT defense_requirements_required_tech_id_fkey
    FOREIGN KEY (required_tech_id) REFERENCES technology_types(id);

-- Galaxy Positions
ALTER TABLE galaxy_positions ADD CONSTRAINT galaxy_positions_occupied_by_fkey
    FOREIGN KEY (occupied_by) REFERENCES planets(id);

-- Planets
ALTER TABLE planets ADD CONSTRAINT planets_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Planet Resources
ALTER TABLE planet_resources ADD CONSTRAINT planet_resources_planet_id_fkey
    FOREIGN KEY (planet_id) REFERENCES planets(id);

-- Planet Buildings
ALTER TABLE planet_buildings ADD CONSTRAINT planet_buildings_planet_id_fkey
    FOREIGN KEY (planet_id) REFERENCES planets(id);
ALTER TABLE planet_buildings ADD CONSTRAINT planet_buildings_building_type_id_fkey
    FOREIGN KEY (building_type_id) REFERENCES building_types(id);

-- Planet Ships
ALTER TABLE planet_ships ADD CONSTRAINT planet_ships_planet_id_fkey
    FOREIGN KEY (planet_id) REFERENCES planets(id);
ALTER TABLE planet_ships ADD CONSTRAINT planet_ships_ship_type_id_fkey
    FOREIGN KEY (ship_type_id) REFERENCES ship_types(id);

-- Planet Defenses
ALTER TABLE planet_defenses ADD CONSTRAINT planet_defenses_planet_id_fkey
    FOREIGN KEY (planet_id) REFERENCES planets(id);
ALTER TABLE planet_defenses ADD CONSTRAINT planet_defenses_defense_type_id_fkey
    FOREIGN KEY (defense_type_id) REFERENCES defense_types(id);

-- User Technologies
ALTER TABLE user_technologies ADD CONSTRAINT user_technologies_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
ALTER TABLE user_technologies ADD CONSTRAINT user_technologies_technology_type_id_fkey
    FOREIGN KEY (technology_type_id) REFERENCES technology_types(id);
ALTER TABLE user_technologies ADD CONSTRAINT user_technologies_research_planet_id_fkey
    FOREIGN KEY (research_planet_id) REFERENCES planets(id);

-- User Officers
ALTER TABLE user_officers ADD CONSTRAINT user_officers_officer_type_id_fkey
    FOREIGN KEY (officer_type_id) REFERENCES officer_types(id);

-- Building Queue
ALTER TABLE building_queue ADD CONSTRAINT building_queue_planet_id_fkey
    FOREIGN KEY (planet_id) REFERENCES planets(id);
ALTER TABLE building_queue ADD CONSTRAINT building_queue_building_type_id_fkey
    FOREIGN KEY (building_type_id) REFERENCES building_types(id);

-- Research Queue
ALTER TABLE research_queue ADD CONSTRAINT research_queue_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
ALTER TABLE research_queue ADD CONSTRAINT research_queue_planet_id_fkey
    FOREIGN KEY (planet_id) REFERENCES planets(id);
ALTER TABLE research_queue ADD CONSTRAINT research_queue_technology_type_id_fkey
    FOREIGN KEY (technology_type_id) REFERENCES technology_types(id);

-- Shipyard Queue
ALTER TABLE shipyard_queue ADD CONSTRAINT shipyard_queue_planet_id_fkey
    FOREIGN KEY (planet_id) REFERENCES planets(id);
ALTER TABLE shipyard_queue ADD CONSTRAINT shipyard_queue_ship_type_id_fkey
    FOREIGN KEY (ship_type_id) REFERENCES ship_types(id);
ALTER TABLE shipyard_queue ADD CONSTRAINT shipyard_queue_defense_type_id_fkey
    FOREIGN KEY (defense_type_id) REFERENCES defense_types(id);

-- Fleets
ALTER TABLE fleets ADD CONSTRAINT fleets_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
ALTER TABLE fleets ADD CONSTRAINT fleets_origin_planet_id_fkey
    FOREIGN KEY (origin_planet_id) REFERENCES planets(id);
ALTER TABLE fleets ADD CONSTRAINT fleets_acs_id_fkey
    FOREIGN KEY (acs_id) REFERENCES acs_fleets(id);
ALTER TABLE fleets ADD CONSTRAINT fleets_acs_fleet_id_fkey
    FOREIGN KEY (acs_fleet_id) REFERENCES acs_fleets(id);

-- Fleet Ships
ALTER TABLE fleet_ships ADD CONSTRAINT fleet_ships_fleet_id_fkey
    FOREIGN KEY (fleet_id) REFERENCES fleets(id);
ALTER TABLE fleet_ships ADD CONSTRAINT fleet_ships_ship_type_id_fkey
    FOREIGN KEY (ship_type_id) REFERENCES ship_types(id);

-- ACS Fleets
ALTER TABLE acs_fleets ADD CONSTRAINT acs_fleets_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES profiles(id);
ALTER TABLE acs_fleets ADD CONSTRAINT acs_fleets_alliance_id_fkey
    FOREIGN KEY (alliance_id) REFERENCES alliances(id);
ALTER TABLE acs_fleets ADD CONSTRAINT acs_fleets_main_fleet_id_fkey
    FOREIGN KEY (main_fleet_id) REFERENCES fleets(id);

-- ACS Participants
ALTER TABLE acs_participants ADD CONSTRAINT acs_participants_acs_id_fkey
    FOREIGN KEY (acs_id) REFERENCES acs_fleets(id);
ALTER TABLE acs_participants ADD CONSTRAINT acs_participants_fleet_id_fkey
    FOREIGN KEY (fleet_id) REFERENCES fleets(id);
ALTER TABLE acs_participants ADD CONSTRAINT acs_participants_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Attack Log
ALTER TABLE attack_log ADD CONSTRAINT attack_log_attacker_id_fkey
    FOREIGN KEY (attacker_id) REFERENCES profiles(id);
ALTER TABLE attack_log ADD CONSTRAINT attack_log_defender_id_fkey
    FOREIGN KEY (defender_id) REFERENCES profiles(id);
ALTER TABLE attack_log ADD CONSTRAINT attack_log_target_planet_id_fkey
    FOREIGN KEY (target_planet_id) REFERENCES planets(id);

-- Battle Reports
ALTER TABLE battle_reports ADD CONSTRAINT battle_reports_attacker_id_fkey
    FOREIGN KEY (attacker_id) REFERENCES profiles(id);
ALTER TABLE battle_reports ADD CONSTRAINT battle_reports_defender_id_fkey
    FOREIGN KEY (defender_id) REFERENCES profiles(id);
ALTER TABLE battle_reports ADD CONSTRAINT battle_reports_planet_id_fkey
    FOREIGN KEY (planet_id) REFERENCES planets(id);

-- Alliances
ALTER TABLE alliances ADD CONSTRAINT alliances_founder_id_fkey
    FOREIGN KEY (founder_id) REFERENCES profiles(id);
ALTER TABLE alliances ADD CONSTRAINT alliances_leader_id_fkey
    FOREIGN KEY (leader_id) REFERENCES profiles(id);

-- Alliance Members
ALTER TABLE alliance_members ADD CONSTRAINT alliance_members_alliance_id_fkey
    FOREIGN KEY (alliance_id) REFERENCES alliances(id);
ALTER TABLE alliance_members ADD CONSTRAINT alliance_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Alliance Applications
ALTER TABLE alliance_applications ADD CONSTRAINT alliance_applications_alliance_id_fkey
    FOREIGN KEY (alliance_id) REFERENCES alliances(id);
ALTER TABLE alliance_applications ADD CONSTRAINT alliance_applications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
ALTER TABLE alliance_applications ADD CONSTRAINT alliance_applications_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES profiles(id);

-- Alliance Diplomacy
ALTER TABLE alliance_diplomacy ADD CONSTRAINT alliance_diplomacy_alliance_id_fkey
    FOREIGN KEY (alliance_id) REFERENCES alliances(id);
ALTER TABLE alliance_diplomacy ADD CONSTRAINT alliance_diplomacy_target_alliance_id_fkey
    FOREIGN KEY (target_alliance_id) REFERENCES alliances(id);
ALTER TABLE alliance_diplomacy ADD CONSTRAINT alliance_diplomacy_proposed_by_fkey
    FOREIGN KEY (proposed_by) REFERENCES profiles(id);
ALTER TABLE alliance_diplomacy ADD CONSTRAINT alliance_diplomacy_responded_by_fkey
    FOREIGN KEY (responded_by) REFERENCES profiles(id);

-- Messages
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES profiles(id);
ALTER TABLE messages ADD CONSTRAINT messages_recipient_id_fkey
    FOREIGN KEY (recipient_id) REFERENCES profiles(id);

-- Market Listings
ALTER TABLE market_listings ADD CONSTRAINT market_listings_seller_id_fkey
    FOREIGN KEY (seller_id) REFERENCES profiles(id);
ALTER TABLE market_listings ADD CONSTRAINT market_listings_planet_id_fkey
    FOREIGN KEY (planet_id) REFERENCES planets(id);

-- Market Transactions
ALTER TABLE market_transactions ADD CONSTRAINT market_transactions_listing_id_fkey
    FOREIGN KEY (listing_id) REFERENCES market_listings(id);
ALTER TABLE market_transactions ADD CONSTRAINT market_transactions_buyer_id_fkey
    FOREIGN KEY (buyer_id) REFERENCES profiles(id);
ALTER TABLE market_transactions ADD CONSTRAINT market_transactions_seller_id_fkey
    FOREIGN KEY (seller_id) REFERENCES profiles(id);

-- Referral Commissions
ALTER TABLE referral_commissions ADD CONSTRAINT referral_commissions_referrer_id_fkey
    FOREIGN KEY (referrer_id) REFERENCES profiles(id);
ALTER TABLE referral_commissions ADD CONSTRAINT referral_commissions_seller_id_fkey
    FOREIGN KEY (seller_id) REFERENCES profiles(id);
ALTER TABLE referral_commissions ADD CONSTRAINT referral_commissions_transaction_id_fkey
    FOREIGN KEY (transaction_id) REFERENCES market_transactions(id);

-- User Wallets
ALTER TABLE user_wallets ADD CONSTRAINT user_wallets_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Wallet Transactions
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Admin Withdrawals
ALTER TABLE admin_withdrawals ADD CONSTRAINT admin_withdrawals_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES profiles(id);

-- Admin Revenue
ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_related_user_id_fkey
    FOREIGN KEY (related_user_id) REFERENCES profiles(id);

-- Admin Expenses
ALTER TABLE admin_expenses ADD CONSTRAINT admin_expenses_related_user_id_fkey
    FOREIGN KEY (related_user_id) REFERENCES profiles(id);

-- Jackpot
ALTER TABLE jackpot ADD CONSTRAINT jackpot_last_winner_id_fkey
    FOREIGN KEY (last_winner_id) REFERENCES profiles(id);

-- Jackpot History
ALTER TABLE jackpot_history ADD CONSTRAINT jackpot_history_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Plus Subscriptions
ALTER TABLE plus_subscriptions ADD CONSTRAINT plus_subscriptions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
ALTER TABLE plus_subscriptions ADD CONSTRAINT plus_subscriptions_plan_id_fkey
    FOREIGN KEY (plan_id) REFERENCES plus_plans(id);

-- Plus Commission Distributions
ALTER TABLE plus_commission_distributions ADD CONSTRAINT plus_commission_distributions_distributed_by_fkey
    FOREIGN KEY (distributed_by) REFERENCES profiles(id);

-- Plus Commission Rewards
ALTER TABLE plus_commission_rewards ADD CONSTRAINT plus_commission_rewards_distribution_id_fkey
    FOREIGN KEY (distribution_id) REFERENCES plus_commission_distributions(id);
ALTER TABLE plus_commission_rewards ADD CONSTRAINT plus_commission_rewards_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
ALTER TABLE plus_commission_rewards ADD CONSTRAINT plus_commission_rewards_subscription_id_fkey
    FOREIGN KEY (subscription_id) REFERENCES plus_subscriptions(id);

-- Plus Pending Rewards
ALTER TABLE plus_pending_rewards ADD CONSTRAINT plus_pending_rewards_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
ALTER TABLE plus_pending_rewards ADD CONSTRAINT plus_pending_rewards_subscription_id_fkey
    FOREIGN KEY (subscription_id) REFERENCES plus_subscriptions(id);
ALTER TABLE plus_pending_rewards ADD CONSTRAINT plus_pending_rewards_distribution_id_fkey
    FOREIGN KEY (distribution_id) REFERENCES plus_commission_distributions(id);

-- Monthly Ranking Distributions
ALTER TABLE monthly_ranking_distributions ADD CONSTRAINT monthly_ranking_distributions_distributed_by_fkey
    FOREIGN KEY (distributed_by) REFERENCES profiles(id);

-- Monthly Ranking Rewards
ALTER TABLE monthly_ranking_rewards ADD CONSTRAINT monthly_ranking_rewards_distribution_id_fkey
    FOREIGN KEY (distribution_id) REFERENCES monthly_ranking_distributions(id);
ALTER TABLE monthly_ranking_rewards ADD CONSTRAINT monthly_ranking_rewards_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Supply Box Purchases
ALTER TABLE supply_box_purchases ADD CONSTRAINT supply_box_purchases_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
ALTER TABLE supply_box_purchases ADD CONSTRAINT supply_box_purchases_planet_id_fkey
    FOREIGN KEY (planet_id) REFERENCES planets(id);
ALTER TABLE supply_box_purchases ADD CONSTRAINT supply_box_purchases_box_id_fkey
    FOREIGN KEY (box_id) REFERENCES supply_boxes(id);

-- Hall of Fame
ALTER TABLE hall_of_fame_players ADD CONSTRAINT hall_of_fame_players_round_id_fkey
    FOREIGN KEY (round_id) REFERENCES game_rounds(id);
ALTER TABLE hall_of_fame_alliances ADD CONSTRAINT hall_of_fame_alliances_round_id_fkey
    FOREIGN KEY (round_id) REFERENCES game_rounds(id);
ALTER TABLE hall_of_fame_records ADD CONSTRAINT hall_of_fame_records_round_id_fkey
    FOREIGN KEY (round_id) REFERENCES game_rounds(id);

-- Telegram Links
ALTER TABLE telegram_links ADD CONSTRAINT telegram_links_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Telegram Task Rewards
ALTER TABLE telegram_task_rewards ADD CONSTRAINT telegram_task_rewards_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Account Interaction Log
ALTER TABLE account_interaction_log ADD CONSTRAINT account_interaction_log_from_user_id_fkey
    FOREIGN KEY (from_user_id) REFERENCES profiles(id);
ALTER TABLE account_interaction_log ADD CONSTRAINT account_interaction_log_to_user_id_fkey
    FOREIGN KEY (to_user_id) REFERENCES profiles(id);

-- Suspicious Accounts
ALTER TABLE suspicious_accounts ADD CONSTRAINT suspicious_accounts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
ALTER TABLE suspicious_accounts ADD CONSTRAINT suspicious_accounts_linked_user_id_fkey
    FOREIGN KEY (linked_user_id) REFERENCES profiles(id);
ALTER TABLE suspicious_accounts ADD CONSTRAINT suspicious_accounts_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES profiles(id);

-- Multiaccounting Reports
ALTER TABLE multiaccounting_reports ADD CONSTRAINT multiaccounting_reports_reporter_id_fkey
    FOREIGN KEY (reporter_id) REFERENCES profiles(id);
ALTER TABLE multiaccounting_reports ADD CONSTRAINT multiaccounting_reports_reported_user_id_fkey
    FOREIGN KEY (reported_user_id) REFERENCES profiles(id);
ALTER TABLE multiaccounting_reports ADD CONSTRAINT multiaccounting_reports_suspected_linked_user_id_fkey
    FOREIGN KEY (suspected_linked_user_id) REFERENCES profiles(id);
ALTER TABLE multiaccounting_reports ADD CONSTRAINT multiaccounting_reports_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES profiles(id);

-- Admin Account Deletions
ALTER TABLE admin_account_deletions ADD CONSTRAINT admin_account_deletions_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES profiles(id);

-- ============================================================================
-- INDEXES (Performance Optimization)
-- ============================================================================

-- Account Interaction Log
CREATE INDEX IF NOT EXISTS idx_interaction_log_from_user ON account_interaction_log(from_user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_log_to_user ON account_interaction_log(to_user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_log_type ON account_interaction_log(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interaction_log_created_at ON account_interaction_log(created_at DESC);

-- ACS Fleets
CREATE INDEX IF NOT EXISTS idx_acs_fleets_status ON acs_fleets(status) WHERE status = 'pending';

-- Admin Revenue
CREATE INDEX IF NOT EXISTS idx_admin_revenue_type ON admin_revenue(revenue_type);
CREATE INDEX IF NOT EXISTS idx_admin_revenue_created ON admin_revenue(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_revenue_created_at ON admin_revenue(created_at);

-- Alliance Applications
CREATE INDEX IF NOT EXISTS idx_alliance_applications_alliance ON alliance_applications(alliance_id, status);
CREATE INDEX IF NOT EXISTS idx_alliance_applications_user ON alliance_applications(user_id);

-- Alliance Diplomacy
CREATE INDEX IF NOT EXISTS idx_alliance_diplomacy_alliances ON alliance_diplomacy(alliance_id, target_alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_diplomacy_status ON alliance_diplomacy(status) WHERE status IN ('pending', 'active');

-- Attack Log
CREATE INDEX IF NOT EXISTS idx_attack_log_attacker_defender ON attack_log(attacker_id, defender_id, attack_time);

-- Building Queue
CREATE INDEX IF NOT EXISTS idx_building_queue_planet ON building_queue(planet_id);
CREATE INDEX IF NOT EXISTS idx_building_queue_position ON building_queue(planet_id, queue_position);
CREATE INDEX IF NOT EXISTS idx_building_queue_end_time ON building_queue(end_time) WHERE end_time IS NOT NULL;

-- Debris Fields
CREATE INDEX IF NOT EXISTS idx_debris_coordinates ON debris_fields(galaxy, solar_system, position);

-- Email Verification Tokens
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_email ON email_verification_tokens(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);

-- Fleets
CREATE INDEX IF NOT EXISTS idx_fleets_user ON fleets(user_id);
CREATE INDEX IF NOT EXISTS idx_fleets_user_active ON fleets(user_id) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_fleets_arrival ON fleets(arrival_time) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_fleets_acs_id ON fleets(acs_id) WHERE acs_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fleets_acs_fleet_id ON fleets(acs_fleet_id) WHERE acs_fleet_id IS NOT NULL;

-- Game Rounds
CREATE INDEX IF NOT EXISTS idx_game_rounds_active ON game_rounds(is_active);

-- Hall of Fame
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_players_round ON hall_of_fame_players(round_id);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_players_category ON hall_of_fame_players(category);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_alliances_round ON hall_of_fame_alliances(round_id);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_records_round ON hall_of_fame_records(round_id);

-- Jackpot History
CREATE INDEX IF NOT EXISTS idx_jackpot_history_user ON jackpot_history(user_id);
CREATE INDEX IF NOT EXISTS idx_jackpot_history_type ON jackpot_history(type);
CREATE INDEX IF NOT EXISTS idx_jackpot_history_created ON jackpot_history(created_at DESC);

-- Login Sessions
CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_ip_address ON login_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_sessions_fingerprint ON login_sessions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_login_sessions_created_at ON login_sessions(created_at DESC);

-- Market Listings
CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON market_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status);
CREATE INDEX IF NOT EXISTS idx_market_listings_type ON market_listings(listing_type);

-- Market Transactions
CREATE INDEX IF NOT EXISTS idx_market_transactions_buyer ON market_transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_market_transactions_seller ON market_transactions(seller_id);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, is_read);

-- Monthly Ranking Rewards
CREATE INDEX IF NOT EXISTS idx_monthly_rewards_distribution ON monthly_ranking_rewards(distribution_id);
CREATE INDEX IF NOT EXISTS idx_monthly_rewards_user ON monthly_ranking_rewards(user_id);

-- Multiaccounting Reports
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON multiaccounting_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON multiaccounting_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON multiaccounting_reports(status);

-- Planets
CREATE INDEX IF NOT EXISTS idx_planets_user ON planets(user_id);
CREATE INDEX IF NOT EXISTS idx_planets_coordinates ON planets(galaxy, solar_system, position);

-- Plus Commission Rewards
CREATE INDEX IF NOT EXISTS idx_plus_rewards_distribution ON plus_commission_rewards(distribution_id);
CREATE INDEX IF NOT EXISTS idx_plus_rewards_user ON plus_commission_rewards(user_id);

-- Plus Pending Rewards
CREATE INDEX IF NOT EXISTS idx_plus_pending_rewards_user ON plus_pending_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_plus_pending_rewards_unpaid ON plus_pending_rewards(paid_out) WHERE paid_out = false;

-- Plus Subscriptions
CREATE INDEX IF NOT EXISTS idx_plus_subscriptions_user ON plus_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_plus_subscriptions_active ON plus_subscriptions(is_active, expires_at);

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_rank ON profiles(rank_position);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_points_buildings ON profiles(points_buildings);
CREATE INDEX IF NOT EXISTS idx_profiles_last_activity ON profiles(last_activity);
CREATE INDEX IF NOT EXISTS idx_profiles_admin_banned ON profiles(is_admin, is_banned);

-- Public Chat Messages
CREATE INDEX IF NOT EXISTS idx_public_chat_messages_created_at ON public_chat_messages(created_at DESC);

-- Referral Commissions
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer ON referral_commissions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_seller ON referral_commissions(seller_id);

-- Research Queue
CREATE INDEX IF NOT EXISTS idx_research_queue_user_id ON research_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_research_queue_status ON research_queue(status);
CREATE INDEX IF NOT EXISTS idx_research_queue_end_time ON research_queue(end_time);

-- Shipyard Queue
CREATE INDEX IF NOT EXISTS idx_shipyard_queue_planet ON shipyard_queue(planet_id, queue_position);
CREATE INDEX IF NOT EXISTS idx_shipyard_queue_planet_id ON shipyard_queue(planet_id);
CREATE INDEX IF NOT EXISTS idx_shipyard_queue_position ON shipyard_queue(planet_id, queue_position);
CREATE INDEX IF NOT EXISTS idx_shipyard_queue_end_time ON shipyard_queue(current_unit_end_time) WHERE current_unit_end_time IS NOT NULL;

-- Supply Box Purchases
CREATE INDEX IF NOT EXISTS idx_supply_box_purchases_user ON supply_box_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_supply_box_purchases_date ON supply_box_purchases(purchased_at);

-- Suspicious Accounts
CREATE INDEX IF NOT EXISTS idx_suspicious_accounts_user_id ON suspicious_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_accounts_linked_user_id ON suspicious_accounts(linked_user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_accounts_is_reviewed ON suspicious_accounts(is_reviewed);
CREATE INDEX IF NOT EXISTS idx_suspicious_accounts_severity ON suspicious_accounts(severity);

-- User Officers
CREATE INDEX IF NOT EXISTS idx_user_officers_user_id ON user_officers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_officers_expires_at ON user_officers(expires_at);

-- User Technologies
CREATE INDEX IF NOT EXISTS idx_user_technologies_researching ON user_technologies(is_researching, research_end_time) WHERE is_researching = true;

-- User Wallets
CREATE INDEX IF NOT EXISTS idx_user_wallets_address ON user_wallets(wallet_address);

-- Wallet Transactions
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tx_hash ON wallet_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type_status ON wallet_transactions(tx_type, status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_token_type ON wallet_transactions(token_type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_tx_hash_unique ON wallet_transactions(tx_hash) WHERE tx_hash IS NOT NULL;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
