/*
  # Restore Lost Expedition Fleets

  This migration restores ships and resources that were lost due to a bug
  in the admin_process_stuck_fleets function that incorrectly processed
  returning expedition fleets.

  ## Bug Description:
  The maintenance function filtered fleets with `arrival_time <= NOW()` but
  for returning expeditions, arrival_time is when they arrived at the destination,
  not when they return home. This caused expeditions still in transit to be
  incorrectly marked as completed without returning ships/resources.

  ## Restoration Process:
  1. Identifies affected fleets (expeditions completed while is_returning=true 
     and return_time was still in the future)
  2. Returns ships from fleet_ships to planet_ships
  3. Returns cargo resources to the origin planet
  4. Logs the restoration for audit purposes

  ## Security:
  - Admin only function
  - Uses SECURITY DEFINER for RLS bypass
*/

-- Create restoration log table
CREATE TABLE IF NOT EXISTS fleet_restoration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  username text,
  planet_id uuid NOT NULL,
  ships_restored jsonb,
  resources_restored jsonb,
  restored_at timestamptz DEFAULT now(),
  restored_by uuid
);

ALTER TABLE fleet_restoration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view restoration logs"
  ON fleet_restoration_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Function to restore a single fleet
CREATE OR REPLACE FUNCTION admin_restore_fleet(p_fleet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_fleet RECORD;
  v_ship RECORD;
  v_ships_restored jsonb := '[]'::jsonb;
  v_resources_restored jsonb;
  v_username text;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NOT NULL THEN
    SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
    IF NOT COALESCE(v_is_admin, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

  SELECT f.*, p.username INTO v_fleet
  FROM fleets f
  JOIN profiles p ON p.id = f.user_id
  WHERE f.id = p_fleet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fleet not found');
  END IF;

  v_username := v_fleet.username;

  FOR v_ship IN
    SELECT fs.ship_type_id, fs.quantity, st.name as ship_name
    FROM fleet_ships fs
    JOIN ship_types st ON st.id = fs.ship_type_id
    WHERE fs.fleet_id = p_fleet_id
  LOOP
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_fleet.origin_planet_id, v_ship.ship_type_id, v_ship.quantity)
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + v_ship.quantity;

    v_ships_restored := v_ships_restored || jsonb_build_object(
      'ship_name', v_ship.ship_name,
      'quantity', v_ship.quantity
    );
  END LOOP;

  UPDATE planets SET
    metal = metal + COALESCE(v_fleet.cargo_metal, 0),
    crystal = crystal + COALESCE(v_fleet.cargo_crystal, 0),
    deuterium = deuterium + COALESCE(v_fleet.cargo_deuterium, 0)
  WHERE id = v_fleet.origin_planet_id;

  v_resources_restored := jsonb_build_object(
    'metal', COALESCE(v_fleet.cargo_metal, 0),
    'crystal', COALESCE(v_fleet.cargo_crystal, 0),
    'deuterium', COALESCE(v_fleet.cargo_deuterium, 0)
  );

  INSERT INTO fleet_restoration_log (
    fleet_id, user_id, username, planet_id, 
    ships_restored, resources_restored, restored_by
  ) VALUES (
    p_fleet_id, v_fleet.user_id, v_username, v_fleet.origin_planet_id,
    v_ships_restored, v_resources_restored, v_user_id
  );

  INSERT INTO messages (user_id, sender_name, subject, body, message_type)
  VALUES (
    v_fleet.user_id,
    'Sistema',
    'Flota de Expedicion Restaurada',
    'Debido a un error tecnico, tu flota de expedicion fue procesada incorrectamente. ' ||
    'Tus naves y recursos han sido restaurados a tu planeta de origen. ' ||
    'Disculpa las molestias causadas.',
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'username', v_username,
    'ships_restored', v_ships_restored,
    'resources_restored', v_resources_restored
  );
END;
$$;

-- Function to restore all affected fleets from the bug
CREATE OR REPLACE FUNCTION admin_restore_all_affected_expedition_fleets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_fleet RECORD;
  v_result jsonb;
  v_restored_count integer := 0;
  v_error_count integer := 0;
  v_restorations jsonb := '[]'::jsonb;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NOT NULL THEN
    SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
    IF NOT COALESCE(v_is_admin, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

  FOR v_fleet IN
    SELECT f.id, p.username
    FROM fleets f
    JOIN profiles p ON p.id = f.user_id
    WHERE f.mission_type = 'expedition'
      AND f.is_completed = true
      AND f.is_returning = true
      AND f.return_time > NOW() - INTERVAL '12 hours'
      AND NOT EXISTS (
        SELECT 1 FROM fleet_restoration_log frl WHERE frl.fleet_id = f.id
      )
    ORDER BY f.return_time DESC
  LOOP
    BEGIN
      v_result := admin_restore_fleet(v_fleet.id);
      
      IF (v_result->>'success')::boolean THEN
        v_restored_count := v_restored_count + 1;
        v_restorations := v_restorations || jsonb_build_object(
          'fleet_id', v_fleet.id,
          'username', v_fleet.username,
          'status', 'restored'
        );
      ELSE
        v_error_count := v_error_count + 1;
        v_restorations := v_restorations || jsonb_build_object(
          'fleet_id', v_fleet.id,
          'username', v_fleet.username,
          'status', 'error',
          'error', v_result->>'error'
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_restorations := v_restorations || jsonb_build_object(
        'fleet_id', v_fleet.id,
        'username', v_fleet.username,
        'status', 'exception',
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'restored_count', v_restored_count,
    'error_count', v_error_count,
    'restorations', v_restorations
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_restore_fleet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_restore_all_affected_expedition_fleets() TO authenticated;
