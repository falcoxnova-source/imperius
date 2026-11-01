/*
  # Fix Fleet Restoration Function - Messages Columns

  Corrects the admin_restore_fleet function to use the correct 
  column names for the messages table (recipient_id instead of user_id).
*/

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

  UPDATE planet_resources SET
    metal = metal + COALESCE(v_fleet.cargo_metal, 0),
    crystal = crystal + COALESCE(v_fleet.cargo_crystal, 0),
    deuterium = deuterium + COALESCE(v_fleet.cargo_deuterium, 0)
  WHERE planet_id = v_fleet.origin_planet_id;

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

  INSERT INTO messages (recipient_id, subject, body, message_type)
  VALUES (
    v_fleet.user_id,
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

GRANT EXECUTE ON FUNCTION admin_restore_fleet(uuid) TO authenticated;
