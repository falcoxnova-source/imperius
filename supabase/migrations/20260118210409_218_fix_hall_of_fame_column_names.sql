/*
  # Fix Hall of Fame Function - Column Names

  This migration fixes critical bugs in the admin_close_round function:

  1. Fixes
    - Corrects column names to match actual database schema:
      - total_points -> points_total
      - building_points -> points_buildings
      - research_points -> points_research
      - fleet_points -> points_fleet
      - defense_points -> points_defense
      - expedition_points -> points_expedition
    - Removes references to non-existent battle_statistics table
    - Uses battle statistics columns directly from profiles table:
      - battles_won, battles_lost, units_destroyed, units_lost
      - debris_metal_total, debris_crystal_total

  2. Security
    - Maintains SECURITY DEFINER to run as admin
    - Only admins can execute this function
*/

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
  -- General ranking (by points_total)
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points, extra_stats)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.points_total DESC),
    'general',
    p.username,
    a.tag,
    p.points_total,
    jsonb_build_object(
      'building_points', p.points_buildings,
      'research_points', p.points_research,
      'fleet_points', p.points_fleet,
      'defense_points', p.points_defense
    )
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE p.points_total > 0
  ORDER BY p.points_total DESC
  LIMIT 10;
  
  -- Fleet ranking (by points_fleet)
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.points_fleet DESC),
    'fleet',
    p.username,
    a.tag,
    p.points_fleet
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE p.points_fleet > 0
  ORDER BY p.points_fleet DESC
  LIMIT 10;
  
  -- Research ranking (by points_research)
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.points_research DESC),
    'research',
    p.username,
    a.tag,
    p.points_research
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE p.points_research > 0
  ORDER BY p.points_research DESC
  LIMIT 10;
  
  -- Buildings ranking (by points_buildings)
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.points_buildings DESC),
    'buildings',
    p.username,
    a.tag,
    p.points_buildings
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE p.points_buildings > 0
  ORDER BY p.points_buildings DESC
  LIMIT 10;
  
  -- Battles ranking (by battles_won from profiles)
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points, extra_stats)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.battles_won DESC),
    'battles',
    p.username,
    a.tag,
    p.battles_won,
    jsonb_build_object(
      'battles_total', COALESCE(p.battles_won, 0) + COALESCE(p.battles_lost, 0) + COALESCE(p.battles_draw, 0),
      'battles_lost', p.battles_lost,
      'units_destroyed', p.units_destroyed,
      'units_lost', p.units_lost
    )
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE p.battles_won > 0
  ORDER BY p.battles_won DESC
  LIMIT 10;
  
  -- Expeditions ranking (by points_expedition)
  INSERT INTO hall_of_fame_players (round_id, rank, category, username, alliance_tag, points)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY p.points_expedition DESC),
    'expeditions',
    p.username,
    a.tag,
    p.points_expedition
  FROM profiles p
  LEFT JOIN alliances a ON p.alliance_id = a.id
  WHERE p.points_expedition > 0
  ORDER BY p.points_expedition DESC
  LIMIT 10;
  
  -- Save top 10 alliances
  INSERT INTO hall_of_fame_alliances (round_id, rank, alliance_name, alliance_tag, founder_username, member_count, total_points)
  SELECT 
    v_round_id,
    ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.points_total), 0) DESC),
    a.name,
    a.tag,
    founder.username,
    COUNT(p.id),
    COALESCE(SUM(p.points_total), 0)
  FROM alliances a
  LEFT JOIN profiles p ON p.alliance_id = a.id
  LEFT JOIN profiles founder ON a.founder_id = founder.id
  GROUP BY a.id, a.name, a.tag, founder.username
  HAVING COUNT(p.id) > 0
  ORDER BY COALESCE(SUM(p.points_total), 0) DESC
  LIMIT 10;
  
  -- Save special records
  -- Most battles won
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'most_battles_won',
    p.username,
    p.battles_won,
    'Victorias en combate'
  FROM profiles p
  WHERE p.battles_won > 0
  ORDER BY p.battles_won DESC
  LIMIT 1;
  
  -- Most ships destroyed
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'most_ships_destroyed',
    p.username,
    p.units_destroyed,
    'Naves destruidas'
  FROM profiles p
  WHERE p.units_destroyed > 0
  ORDER BY p.units_destroyed DESC
  LIMIT 1;
  
  -- Most debris collected
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'most_debris_collected',
    p.username,
    COALESCE(p.debris_metal_total, 0) + COALESCE(p.debris_crystal_total, 0),
    'Escombros recolectados (metal + cristal)'
  FROM profiles p
  WHERE COALESCE(p.debris_metal_total, 0) + COALESCE(p.debris_crystal_total, 0) > 0
  ORDER BY COALESCE(p.debris_metal_total, 0) + COALESCE(p.debris_crystal_total, 0) DESC
  LIMIT 1;
  
  -- Largest fleet (by fleet points)
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'largest_fleet',
    username,
    points_fleet,
    'Puntos de flota'
  FROM profiles
  WHERE points_fleet > 0
  ORDER BY points_fleet DESC
  LIMIT 1;
  
  -- Most expeditions
  INSERT INTO hall_of_fame_records (round_id, record_type, username, value, description)
  SELECT 
    v_round_id,
    'most_expeditions',
    username,
    points_expedition,
    'Puntos de expedicion'
  FROM profiles
  WHERE points_expedition > 0
  ORDER BY points_expedition DESC
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
