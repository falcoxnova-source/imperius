CREATE OR REPLACE FUNCTION public.batch_update_player_points()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_user_id UUID;
  v_buildings INTEGER;
  v_research INTEGER;
  v_fleet INTEGER;
  v_defense INTEGER;
BEGIN
  -- Process all queued users in one batch
  FOR v_user_id IN
    DELETE FROM points_update_queue
    RETURNING user_id
  LOOP
    -- Calculate all 4 categories once per user
    v_buildings := calculate_building_points(v_user_id);
    v_research := calculate_research_points(v_user_id);
    v_fleet := calculate_fleet_points(v_user_id);
    v_defense := calculate_defense_points(v_user_id);

    UPDATE profiles SET
      points_buildings = v_buildings,
      points_research = v_research,
      points_fleet = v_fleet,
      points_defense = v_defense,
      points_total = v_buildings + v_research + v_fleet + v_defense
    WHERE id = v_user_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$

