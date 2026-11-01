/*
  # Lower FXU Ratio Minimum to 1
  
  ## Change
  The minimum FXU cost ratio was 100, now changed to 1 to allow more flexibility.
*/

DROP FUNCTION IF EXISTS update_fxu_cost_ratios(numeric, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION update_fxu_cost_ratios(
  p_building_ratio numeric,
  p_research_ratio numeric,
  p_ships_ratio numeric,
  p_defense_ratio numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  IF p_building_ratio < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building ratio must be at least 1');
  END IF;
  
  IF p_research_ratio < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research ratio must be at least 1');
  END IF;
  
  IF p_ships_ratio < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ships ratio must be at least 1');
  END IF;
  
  IF p_defense_ratio < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Defense ratio must be at least 1');
  END IF;
  
  INSERT INTO game_settings (key, value, description)
  VALUES ('fxu_cost_ratio_building', p_building_ratio::text, 'Resource value per 1 FXU for buildings')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  
  INSERT INTO game_settings (key, value, description)
  VALUES ('fxu_cost_ratio_research', p_research_ratio::text, 'Resource value per 1 FXU for research')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  
  INSERT INTO game_settings (key, value, description)
  VALUES ('fxu_cost_ratio_ships', p_ships_ratio::text, 'Resource value per 1 FXU for ships')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  
  INSERT INTO game_settings (key, value, description)
  VALUES ('fxu_cost_ratio_defense', p_defense_ratio::text, 'Resource value per 1 FXU for defense')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  
  RETURN jsonb_build_object('success', true);
END;
$$;
