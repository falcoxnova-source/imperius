/*
  # Hall of Fame System
  
  This migration creates the Hall of Fame system to preserve the legacy of top players
  and alliances when server rounds/seasons end.
  
  1. New Tables
    - `game_rounds` - Stores information about each game round/season
      - `id` (uuid, primary key)
      - `round_number` (integer) - Sequential round number
      - `name` (text) - Display name for the round
      - `started_at` (timestamptz) - When the round started
      - `ended_at` (timestamptz) - When the round ended (null if active)
      - `is_active` (boolean) - Whether this is the current active round
      - `total_players` (integer) - Number of players at round end
      - `total_alliances` (integer) - Number of alliances at round end
      - `created_at` (timestamptz)
    
    - `hall_of_fame_players` - Top players from each round
      - `id` (uuid, primary key)
      - `round_id` (uuid, FK to game_rounds)
      - `rank` (integer) - Final rank position (1-10)
      - `category` (text) - 'general', 'fleet', 'research', 'buildings', 'battles'
      - `username` (text) - Player username at time of round end
      - `alliance_tag` (text) - Alliance tag at time of round end
      - `points` (bigint) - Points in this category
      - `extra_stats` (jsonb) - Additional statistics
      - `created_at` (timestamptz)
    
    - `hall_of_fame_alliances` - Top alliances from each round
      - `id` (uuid, primary key)
      - `round_id` (uuid, FK to game_rounds)
      - `rank` (integer) - Final rank position (1-10)
      - `alliance_name` (text)
      - `alliance_tag` (text)
      - `founder_username` (text)
      - `member_count` (integer)
      - `total_points` (bigint)
      - `created_at` (timestamptz)
    
    - `hall_of_fame_records` - Special records/achievements
      - `id` (uuid, primary key)
      - `round_id` (uuid, FK to game_rounds)
      - `record_type` (text) - Type of record
      - `username` (text)
      - `value` (bigint)
      - `description` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - All users can read hall of fame data (public historical records)
    - Only admins can write data (through functions)

  3. Functions
    - `admin_close_round` - Closes the current round and saves all hall of fame data
    - `admin_start_new_round` - Starts a new round
*/

-- Game Rounds table
CREATE TABLE IF NOT EXISTS game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number integer NOT NULL UNIQUE,
  name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  total_players integer DEFAULT 0,
  total_alliances integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view game rounds"
  ON game_rounds
  FOR SELECT
  TO authenticated
  USING (true);

-- Hall of Fame Players table
CREATE TABLE IF NOT EXISTS hall_of_fame_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank >= 1 AND rank <= 10),
  category text NOT NULL CHECK (category IN ('general', 'fleet', 'research', 'buildings', 'battles', 'expeditions')),
  username text NOT NULL,
  alliance_tag text,
  points bigint NOT NULL DEFAULT 0,
  extra_stats jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(round_id, category, rank)
);

ALTER TABLE hall_of_fame_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view hall of fame players"
  ON hall_of_fame_players
  FOR SELECT
  TO authenticated
  USING (true);

-- Hall of Fame Alliances table
CREATE TABLE IF NOT EXISTS hall_of_fame_alliances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank >= 1 AND rank <= 10),
  alliance_name text NOT NULL,
  alliance_tag text NOT NULL,
  founder_username text,
  member_count integer NOT NULL DEFAULT 0,
  total_points bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(round_id, rank)
);

ALTER TABLE hall_of_fame_alliances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view hall of fame alliances"
  ON hall_of_fame_alliances
  FOR SELECT
  TO authenticated
  USING (true);

-- Hall of Fame Records table (special achievements)
CREATE TABLE IF NOT EXISTS hall_of_fame_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN (
    'most_battles_won',
    'most_ships_destroyed',
    'most_debris_collected',
    'largest_fleet',
    'most_expeditions',
    'most_colonies',
    'highest_building_level',
    'first_deathstar'
  )),
  username text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(round_id, record_type)
);

ALTER TABLE hall_of_fame_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view hall of fame records"
  ON hall_of_fame_records
  FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_players_round ON hall_of_fame_players(round_id);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_players_category ON hall_of_fame_players(category);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_alliances_round ON hall_of_fame_alliances(round_id);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_records_round ON hall_of_fame_records(round_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_active ON game_rounds(is_active);

-- Function to close round and save hall of fame data
CREATE OR REPLACE FUNCTION admin_close_round(
  p_round_name text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_players integer;
  v_total_alliances integer;
  v_result jsonb;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores pueden cerrar rondas');
  END IF;
  
  SELECT COALESCE(MAX(round_number), 0) + 1 INTO v_round_number FROM game_rounds;
  
  SELECT COUNT(*) INTO v_total_players FROM profiles;
  SELECT COUNT(*) INTO v_total_alliances FROM alliances;
  
  INSERT INTO game_rounds (round_number, name, ended_at, is_active, total_players, total_alliances, notes)
  VALUES (
    v_round_number,
    COALESCE(p_round_name, 'Ronda ' || v_round_number),
    now(),
    false,
    v_total_players,
    v_total_alliances,
    p_notes
  )
  RETURNING id INTO v_round_id;
  
  -- Save top 10 players for each category
  -- General ranking
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points, extra_stats)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.total_points DESC),
    'general',
    p.username,
    a.tag,
    p.total_points,
    jsonb_build_object(
      'building_points', p.building_points,
      'research_points', p.research_points,
      'fleet_points', p.fleet_points,
      'defense_points', p.defense_points
    )
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  ORDER BY p.total_points DESC
  LIMIT 10;
  
  -- Fleet ranking
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.fleet_points DESC),
    'fleet',
    p.username,
    a.tag,
    p.fleet_points
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE p.fleet_points > 0
  ORDER BY p.fleet_points DESC
  LIMIT 10;
  
  -- Research ranking
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.research_points DESC),
    'research',
    p.username,
    a.tag,
    p.research_points
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE p.research_points > 0
  ORDER BY p.research_points DESC
  LIMIT 10;
  
  -- Buildings ranking
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.building_points DESC),
    'buildings',
    p.username,
    a.tag,
    p.building_points
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE p.building_points > 0
  ORDER BY p.building_points DESC
  LIMIT 10;
  
  -- Battles ranking (by wins)
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points, extra_stats)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY bs.battles_won DESC),
    'battles',
    p.username,
    a.tag,
    bs.battles_won,
    jsonb_build_object(
      'battles_total', bs.battles_total,
      'battles_lost', bs.battles_lost,
      'units_destroyed', bs.units_destroyed,
      'units_lost', bs.units_lost
    )
  FROM battle_statistics bs
  JOIN profiles p ON bs.user_id = p.id
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE bs.battles_won > 0
  ORDER BY bs.battles_won DESC
  LIMIT 10;
  
  -- Expeditions ranking
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.expedition_points DESC),
    'expeditions',
    p.username,
    a.tag,
    p.expedition_points
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE p.expedition_points > 0
  ORDER BY p.expedition_points DESC
  LIMIT 10;
  
  -- Save top 10 alliances
  INSERT INTO hall_of_fame_alliances (round_id, rank, alliance_name, alliance_tag, founder_username, member_count, total_points)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.total_points), 0) DESC),
    a.name,
    a.tag,
    founder.username,
    COUNT(p.id),
    COALESCE(SUM(p.total_points), 0)
  FROM alliances a
  LEFT JOIN profiles p ON p.alliance_id = a.id
  LEFT JOIN profiles founder ON a.founder_id = founder.id
  GROUP BY a.id, a.name, a.tag, founder.username
  HAVING COUNT(p.id) > 0
  ORDER BY COALESCE(SUM(p.total_points), 0) DESC
  LIMIT 10;
  
  -- Save special records
  -- Most battles won
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'most_battles_won',
    p.username,
    bs.battles_won,
    'Victorias en combate'
  FROM battle_statistics bs
  JOIN profiles p ON bs.user_id = p.id
  WHERE bs.battles_won > 0
  ORDER BY bs.battles_won DESC
  LIMIT 1;
  
  -- Most ships destroyed
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'most_ships_destroyed',
    p.username,
    bs.units_destroyed,
    'Naves destruidas'
  FROM battle_statistics bs
  JOIN profiles p ON bs.user_id = p.id
  WHERE bs.units_destroyed > 0
  ORDER BY bs.units_destroyed DESC
  LIMIT 1;
  
  -- Most debris collected
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'most_debris_collected',
    p.username,
    bs.metal_collected + bs.crystal_collected,
    'Escombros recolectados (metal + cristal)'
  FROM battle_statistics bs
  JOIN profiles p ON bs.user_id = p.id
  WHERE bs.metal_collected + bs.crystal_collected > 0
  ORDER BY bs.metal_collected + bs.crystal_collected DESC
  LIMIT 1;
  
  -- Largest fleet (by fleet points)
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'largest_fleet',
    username,
    fleet_points,
    'Puntos de flota'
  FROM profiles
  WHERE fleet_points > 0
  ORDER BY fleet_points DESC
  LIMIT 1;
  
  -- Most expeditions
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'most_expeditions',
    username,
    expedition_points,
    'Puntos de expedicion'
  FROM profiles
  WHERE expedition_points > 0
  ORDER BY expedition_points DESC
  LIMIT 1;
  
  -- Most colonies
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'most_colonies',
    p.username,
    COUNT(pl.id),
    'Colonias establecidas'
  FROM profiles p
  JOIN planets pl ON pl.owner_id = p.id
  GROUP BY p.id, p.username
  HAVING COUNT(pl.id) > 1
  ORDER BY COUNT(pl.id) DESC
  LIMIT 1;
  
  v_result := jsonb_build_object(
    'success', true,
    'round_id', v_round_id,
    'round_number', v_round_number,
    'round_name', COALESCE(p_round_name, 'Ronda ' || v_round_number),
    'total_players', v_total_players,
    'total_alliances', v_total_alliances
  );
  
  RETURN v_result;
END;
$$;

-- Function to get hall of fame data for a specific round
CREATE OR REPLACE FUNCTION get_hall_of_fame(p_round_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round_id uuid;
  v_result jsonb;
BEGIN
  IF p_round_id IS NULL THEN
    SELECT id INTO v_round_id FROM game_rounds ORDER BY round_number DESC LIMIT 1;
  ELSE
    v_round_id := p_round_id;
  END IF;
  
  IF v_round_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay rondas registradas');
  END IF;
  
  SELECT jsonb_build_object(
    'success', true,
    'round', (SELECT row_to_json(r) FROM game_rounds r WHERE r.id = v_round_id),
    'players', (
      SELECT jsonb_agg(row_to_json(p) ORDER BY p.category, p.rank)
      FROM hall_of_fame_players p
      WHERE p.round_id = v_round_id
    ),
    'alliances', (
      SELECT jsonb_agg(row_to_json(a) ORDER BY a.rank)
      FROM hall_of_fame_alliances a
      WHERE a.round_id = v_round_id
    ),
    'records', (
      SELECT jsonb_agg(row_to_json(rec))
      FROM hall_of_fame_records rec
      WHERE rec.round_id = v_round_id
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Function to list all rounds
CREATE OR REPLACE FUNCTION get_all_rounds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'success', true,
    'rounds', (
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.round_number DESC)
      FROM game_rounds r
    )
  );
END;
$$;
