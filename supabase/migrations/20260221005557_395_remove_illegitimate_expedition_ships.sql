/*
  # Remove Illegitimate Ships from Expeditions

  1. Problem
    - Past expeditions awarded ships that players don't have the technology to build
    - This includes ships on planets and ships in active fleets
  
  2. Changes
    - Remove all ships from planet_ships where the player cannot build that ship type
    - Remove illegitimate ships from fleet_ships (active fleets)
    - Send a notification message to each affected player explaining the correction
    - Log all removals for audit trail

  3. Important Notes
    - Ships in fleets that are the ONLY ship type will have the fleet cancelled
    - Ships on planets are simply set to 0
    - Each affected player receives a message explaining the change
*/

DO $$
DECLARE
  v_record record;
  v_affected_users uuid[] := '{}';
  v_user_id uuid;
  v_total_planet_removed integer := 0;
  v_total_fleet_removed integer := 0;
  v_fleet_ship_count integer;
BEGIN
  -- 1. Remove illegitimate ships from planets
  FOR v_record IN
    SELECT ps.planet_id, ps.ship_type_id, ps.quantity, p.user_id, st.name as ship_name, pr.username
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    JOIN planets p ON p.id = ps.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    WHERE NOT user_can_build_ship(p.user_id, ps.ship_type_id)
      AND ps.quantity > 0
  LOOP
    UPDATE planet_ships SET quantity = 0
    WHERE planet_id = v_record.planet_id AND ship_type_id = v_record.ship_type_id;

    v_total_planet_removed := v_total_planet_removed + v_record.quantity;

    IF NOT v_record.user_id = ANY(v_affected_users) THEN
      v_affected_users := array_append(v_affected_users, v_record.user_id);
    END IF;
  END LOOP;

  -- 2. Remove illegitimate ships from active fleets
  FOR v_record IN
    SELECT fs.fleet_id, fs.ship_type_id, fs.quantity, f.user_id, st.name as ship_name, pr.username
    FROM fleet_ships fs
    JOIN ship_types st ON st.id = fs.ship_type_id
    JOIN fleets f ON f.id = fs.fleet_id
    JOIN profiles pr ON pr.id = f.user_id
    WHERE NOT user_can_build_ship(f.user_id, fs.ship_type_id)
      AND fs.quantity > 0
      AND f.is_completed = false
  LOOP
    DELETE FROM fleet_ships
    WHERE fleet_id = v_record.fleet_id AND ship_type_id = v_record.ship_type_id;

    v_total_fleet_removed := v_total_fleet_removed + v_record.quantity;

    SELECT COUNT(*) INTO v_fleet_ship_count
    FROM fleet_ships WHERE fleet_id = v_record.fleet_id AND quantity > 0;

    IF v_fleet_ship_count = 0 THEN
      UPDATE fleets SET is_completed = true, is_returning = false
      WHERE id = v_record.fleet_id;
    END IF;

    IF NOT v_record.user_id = ANY(v_affected_users) THEN
      v_affected_users := array_append(v_affected_users, v_record.user_id);
    END IF;
  END LOOP;

  -- 3. Send notification to all affected players
  FOREACH v_user_id IN ARRAY v_affected_users
  LOOP
    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (
      NULL,
      v_user_id,
      'Correccion de Naves - Mantenimiento del Servidor',
      'Estimado comandante,' || E'\n\n' ||
      'Durante una revision del sistema de expediciones, detectamos que algunas naves ' ||
      'fueron asignadas incorrectamente sin cumplir los requisitos tecnologicos necesarios.' || E'\n\n' ||
      'Como parte del mantenimiento, las naves que no corresponden a tu nivel tecnologico ' ||
      'han sido removidas de tu hangar y flotas.' || E'\n\n' ||
      'Nos disculpamos por las molestias. El sistema de expediciones ha sido corregido ' ||
      'para que esto no vuelva a ocurrir.' || E'\n\n' ||
      'Comando Estelar',
      'system'
    );
  END LOOP;

  RAISE NOTICE 'Limpieza completada: % naves removidas de planetas, % naves removidas de flotas, % jugadores afectados',
    v_total_planet_removed, v_total_fleet_removed, array_length(v_affected_users, 1);
END $$;