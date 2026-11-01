/*
  # Pass probe count to espionage report

  ## Changes
  - Update process_fleet_arrival to pass probe count when generating espionage reports
  - This enables the visibility system to consider probe quantity
*/

CREATE OR REPLACE FUNCTION process_espionage_mission(
  p_fleet_id uuid,
  p_fleet_record record,
  p_target_planet record
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_probe_type_id integer;
  v_probe_count integer := 1;
BEGIN
  SELECT id INTO v_probe_type_id FROM ship_types WHERE code = 'espionage_probe';
  
  SELECT COALESCE(quantity, 1) INTO v_probe_count
  FROM fleet_ships
  WHERE fleet_id = p_fleet_id AND ship_type_id = v_probe_type_id;
  
  v_probe_count := GREATEST(1, COALESCE(v_probe_count, 1));

  PERFORM generate_espionage_report(
    p_fleet_record.user_id, 
    p_target_planet.id, 
    p_target_planet.user_id,
    v_probe_count
  );

  UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
END;
$$;

GRANT EXECUTE ON FUNCTION process_espionage_mission(uuid, record, record) TO authenticated;
