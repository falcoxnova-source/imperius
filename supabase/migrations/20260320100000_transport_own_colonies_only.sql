/*
  # Transport: only allow between own colonies

  CHANGE: Transport mission now only allows sending resources to your own
          planets/moons. Transporting to alliance members is no longer
          permitted.

  METHOD: pg_proc text replacement (surgical, idempotent).
          Replaces the transport-to-other-players alliance check block
          with a simple rejection.
*/

DO $$
DECLARE
  v_src  text;
  v_prev text;
  v_old_block text;
  v_new_block text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'validate_fleet_mission'
    AND pronargs = 7;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'validate_fleet_mission (7 args) not found!';
  END IF;

  -- Idempotency: if already patched, skip
  IF position('Solo puedes transportar recursos a tus propias colonias' IN v_src) > 0 THEN
    RAISE NOTICE 'validate_fleet_mission already patched for own-colonies-only transport, skipping';
    RETURN;
  END IF;

  v_prev := v_src;

  -- The old block: after checking own planet, it checks alliance membership.
  -- We replace that entire alliance-check section with a simple rejection.
  v_old_block := '-- Transport to other players: alliance restriction
      SELECT alliance_id INTO v_user_alliance_id FROM alliance_members WHERE user_id = p_user_id;
      SELECT alliance_id INTO v_target_alliance_id FROM alliance_members WHERE user_id = v_target_planet.user_id;

      IF v_user_alliance_id IS NULL THEN
        RETURN jsonb_build_object(
          ''valid'', false, 
          ''reason'', ''Debes pertenecer a una alianza para transportar recursos a otros jugadores''
        );
      END IF;

      IF v_target_alliance_id IS NULL THEN
        RETURN jsonb_build_object(
          ''valid'', false, 
          ''reason'', ''El jugador destino debe pertenecer a una alianza para recibir transportes''
        );
      END IF;

      IF v_user_alliance_id != v_target_alliance_id THEN
        RETURN jsonb_build_object(
          ''valid'', false, 
          ''reason'', ''Solo puedes transportar recursos a miembros de tu misma alianza''
        );
      END IF;

      RETURN jsonb_build_object(''valid'', true);';

  v_new_block := '-- Transport to other players: BLOCKED — only own colonies allowed
      RETURN jsonb_build_object(
        ''valid'', false,
        ''reason'', ''Solo puedes transportar recursos a tus propias colonias''
      );';

  v_src := replace(v_src, v_old_block, v_new_block);

  IF v_src = v_prev THEN
    RAISE EXCEPTION 'Alliance transport block pattern not found in validate_fleet_mission! The function may have been modified.';
  END IF;

  -- Drop + recreate to preserve DEFAULT on p_target_type
  DROP FUNCTION IF EXISTS validate_fleet_mission(uuid, uuid, integer, integer, integer, text, text);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION validate_fleet_mission('
    || 'p_user_id uuid, p_origin_planet_id uuid, '
    || 'p_target_galaxy integer, p_target_system integer, p_target_position integer, '
    || 'p_mission_type text, p_target_type text DEFAULT ''planet'') '
    || 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    || 'SET search_path = public AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'SUCCESS: transport now restricted to own colonies only';
END $$;
