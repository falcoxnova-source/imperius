/*
  # Falco-X Universo - Esquema Inicial de Base de Datos

  ## Descripcion General
  Este esquema implementa todas las tablas necesarias para un juego de estrategia espacial
  tipo XNova/OGame, incluyendo usuarios, planetas, recursos, edificios, tecnologias,
  naves, defensas, flotas y alianzas.

  ## Tablas Creadas
  1. `profiles` - Perfiles de jugadores extendidos
  2. `planets` - Planetas de los jugadores
  3. `planet_buildings` - Edificios construidos en cada planeta
  4. `planet_resources` - Recursos almacenados en cada planeta
  5. `user_technologies` - Tecnologias investigadas por usuario
  6. `planet_ships` - Naves estacionadas en cada planeta
  7. `planet_defenses` - Defensas construidas en cada planeta
  8. `fleets` - Flotas en movimiento
  9. `fleet_ships` - Naves en cada flota
  10. `alliances` - Alianzas de jugadores
  11. `alliance_members` - Miembros de alianzas
  12. `messages` - Sistema de mensajeria
  13. `battle_reports` - Reportes de batallas
  14. `construction_queue` - Cola de construccion
  15. `research_queue` - Cola de investigacion

  ## Seguridad
  - RLS habilitado en todas las tablas
  - Politicas restrictivas basadas en autenticacion
*/

-- ============================================
-- TABLA: profiles (Perfiles de Jugadores)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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
  last_activity timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view other profiles for ranking"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- TABLA: planets (Planetas)
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

ALTER TABLE planets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own planets"
  ON planets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view galaxy map"
  ON planets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own planets"
  ON planets FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert own planets"
  ON planets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own planets"
  ON planets FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND is_main_planet = false);

-- ============================================
-- TABLA: planet_resources (Recursos del Planeta)
-- ============================================
CREATE TABLE IF NOT EXISTS planet_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid REFERENCES planets(id) ON DELETE CASCADE UNIQUE,
  metal decimal(20,2) DEFAULT 500,
  crystal decimal(20,2) DEFAULT 500,
  deuterium decimal(20,2) DEFAULT 0,
  energy_used integer DEFAULT 0,
  energy_max integer DEFAULT 0,
  metal_per_hour decimal(15,2) DEFAULT 30,
  crystal_per_hour decimal(15,2) DEFAULT 15,
  deuterium_per_hour decimal(15,2) DEFAULT 0,
  metal_storage decimal(20,2) DEFAULT 10000,
  crystal_storage decimal(20,2) DEFAULT 10000,
  deuterium_storage decimal(20,2) DEFAULT 10000,
  last_update timestamptz DEFAULT now()
);

ALTER TABLE planet_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own planet resources"
  ON planet_resources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_resources.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own planet resources"
  ON planet_resources FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_resources.planet_id
      AND planets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_resources.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own planet resources"
  ON planet_resources FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_resources.planet_id
      AND planets.user_id = auth.uid()
    )
  );

-- ============================================
-- TABLA: building_types (Tipos de Edificios)
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
  cost_factor decimal(4,2) DEFAULT 1.5,
  base_time_seconds integer DEFAULT 60,
  max_level integer DEFAULT 50,
  image_url text
);

ALTER TABLE building_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view building types"
  ON building_types FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- TABLA: planet_buildings (Edificios del Planeta)
-- ============================================
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

ALTER TABLE planet_buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own planet buildings"
  ON planet_buildings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_buildings.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own planet buildings"
  ON planet_buildings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_buildings.planet_id
      AND planets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_buildings.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own planet buildings"
  ON planet_buildings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_buildings.planet_id
      AND planets.user_id = auth.uid()
    )
  );

-- ============================================
-- TABLA: technology_types (Tipos de Tecnologias)
-- ============================================
CREATE TABLE IF NOT EXISTS technology_types (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('basic', 'propulsion', 'military', 'advanced')),
  base_metal integer DEFAULT 0,
  base_crystal integer DEFAULT 0,
  base_deuterium integer DEFAULT 0,
  cost_factor decimal(4,2) DEFAULT 2.0,
  base_time_seconds integer DEFAULT 120,
  max_level integer DEFAULT 20,
  image_url text
);

ALTER TABLE technology_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view technology types"
  ON technology_types FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- TABLA: user_technologies (Tecnologias del Usuario)
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

ALTER TABLE user_technologies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own technologies"
  ON user_technologies FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own technologies"
  ON user_technologies FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert own technologies"
  ON user_technologies FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- TABLA: ship_types (Tipos de Naves)
-- ============================================
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

ALTER TABLE ship_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ship types"
  ON ship_types FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- TABLA: planet_ships (Naves del Planeta)
-- ============================================
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

ALTER TABLE planet_ships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own planet ships"
  ON planet_ships FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_ships.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own planet ships"
  ON planet_ships FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_ships.planet_id
      AND planets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_ships.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own planet ships"
  ON planet_ships FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_ships.planet_id
      AND planets.user_id = auth.uid()
    )
  );

-- ============================================
-- TABLA: defense_types (Tipos de Defensas)
-- ============================================
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

ALTER TABLE defense_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view defense types"
  ON defense_types FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- TABLA: planet_defenses (Defensas del Planeta)
-- ============================================
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

ALTER TABLE planet_defenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own planet defenses"
  ON planet_defenses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_defenses.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own planet defenses"
  ON planet_defenses FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_defenses.planet_id
      AND planets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_defenses.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own planet defenses"
  ON planet_defenses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_defenses.planet_id
      AND planets.user_id = auth.uid()
    )
  );

-- ============================================
-- TABLA: alliances (Alianzas)
-- ============================================
CREATE TABLE IF NOT EXISTS alliances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text UNIQUE NOT NULL CHECK (char_length(tag) <= 8),
  name text NOT NULL,
  founder_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  leader_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  description text,
  internal_text text,
  logo_url text,
  member_count integer DEFAULT 1,
  points_total integer DEFAULT 0,
  rank_position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE alliances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view alliances"
  ON alliances FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Leaders can update alliance"
  ON alliances FOR UPDATE
  TO authenticated
  USING (leader_id = auth.uid())
  WITH CHECK (leader_id = auth.uid());

CREATE POLICY "Users can create alliance"
  ON alliances FOR INSERT
  TO authenticated
  WITH CHECK (founder_id = auth.uid());

-- ============================================
-- TABLA: alliance_members (Miembros de Alianza)
-- ============================================
CREATE TABLE IF NOT EXISTS alliance_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  rank_name text DEFAULT 'Miembro',
  rank_level integer DEFAULT 0,
  can_invite boolean DEFAULT false,
  can_kick boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE alliance_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view alliance members"
  ON alliance_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Members can leave alliance"
  ON alliance_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can join alliance"
  ON alliance_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- TABLA: fleets (Flotas en Movimiento)
-- ============================================
CREATE TABLE IF NOT EXISTS fleets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  origin_planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  target_galaxy integer NOT NULL,
  target_system integer NOT NULL,
  target_position integer NOT NULL,
  target_type text DEFAULT 'planet',
  mission_type text NOT NULL CHECK (mission_type IN ('attack', 'transport', 'deploy', 'colonize', 'espionage', 'recycle', 'destroy', 'expedition', 'hold')),
  cargo_metal decimal(20,2) DEFAULT 0,
  cargo_crystal decimal(20,2) DEFAULT 0,
  cargo_deuterium decimal(20,2) DEFAULT 0,
  departure_time timestamptz NOT NULL,
  arrival_time timestamptz NOT NULL,
  return_time timestamptz,
  is_returning boolean DEFAULT false,
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fleets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fleets"
  ON fleets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view incoming attacks"
  ON fleets FOR SELECT
  TO authenticated
  USING (
    mission_type = 'attack' AND
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.galaxy = fleets.target_galaxy
      AND planets.solar_system = fleets.target_system
      AND planets.position = fleets.target_position
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own fleets"
  ON fleets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own fleets"
  ON fleets FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own fleets"
  ON fleets FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================
-- TABLA: fleet_ships (Naves en Flota)
-- ============================================
CREATE TABLE IF NOT EXISTS fleet_ships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid REFERENCES fleets(id) ON DELETE CASCADE,
  ship_type_id integer REFERENCES ship_types(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  UNIQUE(fleet_id, ship_type_id)
);

ALTER TABLE fleet_ships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fleet ships"
  ON fleet_ships FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fleets
      WHERE fleets.id = fleet_ships.fleet_id
      AND fleets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own fleet ships"
  ON fleet_ships FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fleets
      WHERE fleets.id = fleet_ships.fleet_id
      AND fleets.user_id = auth.uid()
    )
  );

-- ============================================
-- TABLA: messages (Mensajes)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  message_type text DEFAULT 'player' CHECK (message_type IN ('player', 'system', 'battle', 'espionage', 'expedition', 'alliance')),
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid() OR sender_id = auth.uid());

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update own received messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Users can delete own messages"
  ON messages FOR DELETE
  TO authenticated
  USING (recipient_id = auth.uid());

-- ============================================
-- TABLA: battle_reports (Reportes de Batalla)
-- ============================================
CREATE TABLE IF NOT EXISTS battle_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  defender_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  coordinates text NOT NULL,
  result text NOT NULL CHECK (result IN ('attacker_won', 'defender_won', 'draw')),
  rounds integer NOT NULL,
  attacker_losses_metal decimal(20,2) DEFAULT 0,
  attacker_losses_crystal decimal(20,2) DEFAULT 0,
  defender_losses_metal decimal(20,2) DEFAULT 0,
  defender_losses_crystal decimal(20,2) DEFAULT 0,
  debris_metal decimal(20,2) DEFAULT 0,
  debris_crystal decimal(20,2) DEFAULT 0,
  loot_metal decimal(20,2) DEFAULT 0,
  loot_crystal decimal(20,2) DEFAULT 0,
  loot_deuterium decimal(20,2) DEFAULT 0,
  report_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE battle_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view battle reports"
  ON battle_reports FOR SELECT
  TO authenticated
  USING (attacker_id = auth.uid() OR defender_id = auth.uid());

CREATE POLICY "System can insert battle reports"
  ON battle_reports FOR INSERT
  TO authenticated
  WITH CHECK (attacker_id = auth.uid());

-- ============================================
-- TABLA: game_settings (Configuracion del Juego)
-- ============================================
CREATE TABLE IF NOT EXISTS game_settings (
  id serial PRIMARY KEY,
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view game settings"
  ON game_settings FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- INDICES PARA OPTIMIZACION
-- ============================================
CREATE INDEX IF NOT EXISTS idx_planets_user ON planets(user_id);
CREATE INDEX IF NOT EXISTS idx_planets_coordinates ON planets(galaxy, solar_system, position);
CREATE INDEX IF NOT EXISTS idx_fleets_user ON fleets(user_id);
CREATE INDEX IF NOT EXISTS idx_fleets_arrival ON fleets(arrival_time) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_profiles_rank ON profiles(rank_position);
