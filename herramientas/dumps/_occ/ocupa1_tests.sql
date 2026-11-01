-- Pruebas [OCUPA1] (se ejecutan dentro de BEGIN ... ROLLBACK)
DO $t$
DECLARE
  vA uuid; vM uuid; vB uuid; vC uuid; vBM uuid;
  v_occ_ship integer; v_big integer; v_lf integer;
  v_res jsonb; v_fleet uuid; v_fleet2 uuid; v_occ record; v_n bigint; v_txt text;
  r record;
BEGIN
  -- Marcadores aplicados
  FOR r IN SELECT p.oid::regprocedure AS sig,
                  (SELECT count(*) FROM regexp_matches(pg_get_functiondef(p.oid), '\[OCUPA1-[a-z0-9]+\]', 'g')) AS n
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
             AND pg_get_functiondef(p.oid) LIKE '%[OCUPA1-%' AND p.proname NOT LIKE '\_occ%'
           ORDER BY 1 LOOP
    RAISE NOTICE 'PATCH % markers=%', r.sig, r.n;
  END LOOP;

  SELECT id INTO v_occ_ship FROM ship_types WHERE code = 'occupation_ship';
  SELECT id INTO v_big FROM ship_types WHERE category = 'combat' AND base_speed > 0 ORDER BY weapon_power DESC LIMIT 1;
  SELECT id INTO v_lf FROM ship_types WHERE code = 'light_fighter';
  RAISE NOTICE 'ship occ=% big=% lf=%', v_occ_ship, v_big, v_lf;

  SELECT p.user_id, p.id INTO vB, vC FROM planets p
  WHERE p.planet_type = 'planet' AND NOT COALESCE(p.is_main_planet, false) AND NOT COALESCE(p.is_destroyed, false)
    AND public._colony_listed_since(p.id) IS NULL
    AND EXISTS (SELECT 1 FROM planets m WHERE m.user_id = p.user_id AND m.is_main_planet AND m.planet_type = 'planet' AND NOT m.is_destroyed)
    AND EXISTS (SELECT 1 FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = p.id AND bt.code = 'shipyard' AND pb.level >= 2)
  ORDER BY p.created_at DESC LIMIT 1;
  SELECT id INTO vBM FROM planets WHERE user_id = vB AND is_main_planet AND planet_type = 'planet' AND NOT is_destroyed LIMIT 1;
  SELECT p.user_id, p.id INTO vA, vM FROM planets p
  WHERE p.is_main_planet AND p.planet_type = 'planet' AND NOT p.is_destroyed AND p.user_id <> vB
  ORDER BY p.created_at LIMIT 1;
  RAISE NOTICE 'A=% M=% | B=% C=% BM=%', vA, vM, vB, vC, vBM;

  -- Estado determinista de C
  DELETE FROM planet_ships WHERE planet_id = vC;
  DELETE FROM planet_defenses WHERE planet_id = vC;
  UPDATE fleets SET is_completed = true WHERE NOT is_completed AND (user_id IN (vA, vB));
  UPDATE planets SET autopilot_enabled = true WHERE id = vC;
  UPDATE planet_resources SET metal = 500000, crystal = 500000, deuterium = 500000 WHERE planet_id IN (vC, vM, vBM);
  DELETE FROM building_queue WHERE planet_id = vC;
  DELETE FROM shipyard_queue WHERE planet_id = vC;
  INSERT INTO building_queue (planet_id, building_type_id, target_level, metal_cost, crystal_cost, deuterium_cost, build_time, queue_position, start_time, end_time, status)
  VALUES (vC, 1, 99, 10, 10, 0, 3600, 1, now(), now() + interval '1 hour', 'building');
  BEGIN
    INSERT INTO shipyard_queue (planet_id, item_type, ship_type_id, quantity, metal_cost, crystal_cost, deuterium_cost, build_time_per_unit, queue_position, start_time, current_unit_end_time)
    VALUES (vC, 'ship', v_lf, 3, 9000, 3000, 0, 100, 1, now(), now() + interval '100 seconds');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'shipyard seed failed: %', SQLERRM; END;

  -- 1) Compra
  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = COALESCE(fxu_balance, 0) + 100000 WHERE id = vA;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', vA::text, 'role', 'authenticated')::text, true);
  RAISE NOTICE 'INFO %', get_occupation_ship_info();
  RAISE NOTICE 'BUY %', purchase_occupation_ship(vM, 2);
  RAISE NOTICE 'BUY qty0 %', purchase_occupation_ship(vM, 0);
  SELECT quantity INTO v_n FROM planet_ships WHERE planet_id = vM AND ship_type_id = v_occ_ship;
  RAISE NOTICE 'planet M occ ships=%', v_n;
  BEGIN
    RAISE NOTICE 'SELL %', create_market_listing('ship', 'occupation_ship', 1, 1000, vM);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SELL blocked OK: %', SQLERRM; END;
  BEGIN
    INSERT INTO shipyard_queue (planet_id, item_type, ship_type_id, quantity, metal_cost, crystal_cost, deuterium_cost, build_time_per_unit, queue_position)
    VALUES (vM, 'ship', v_occ_ship, 1, 0, 0, 0, 10, 9);
    RAISE NOTICE 'SHIPYARD occ NOT blocked (BAD)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SHIPYARD occ blocked OK: %', SQLERRM; END;
  RAISE NOTICE 'user_can_build_ship occ=%', user_can_build_ship(vA, v_occ_ship);

  -- 2) Ataque con Nave de Ocupacion -> ocupacion
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO fleets (user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type, mission_type,
    departure_time, arrival_time, return_time)
  SELECT vA, vM, galaxy, solar_system, position, 'planet', 'attack', now() - interval '1 hour', now() - interval '1 second', now() + interval '1 hour'
  FROM planets WHERE id = vC RETURNING id INTO v_fleet;
  INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (v_fleet, v_occ_ship, 1), (v_fleet, v_big, 50);
  PERFORM process_fleet_arrival(v_fleet);
  SELECT * INTO v_occ FROM occupations WHERE planet_id = vC AND status = 'active';
  RAISE NOTICE 'OCC found=% garrison=% fb=% fs=% prev_ap=%', FOUND, v_occ.garrison_fleet_id = v_fleet,
    jsonb_array_length(v_occ.frozen_building), jsonb_array_length(v_occ.frozen_shipyard), v_occ.prev_autopilot;
  SELECT mission_type || '/' || is_returning || '/' || is_completed INTO v_txt FROM fleets WHERE id = v_fleet;
  RAISE NOTICE 'fleet state=% occ ships left=%', v_txt, (SELECT quantity FROM fleet_ships WHERE fleet_id = v_fleet AND ship_type_id = v_occ_ship);
  RAISE NOTICE 'queues C: bq=% sq=% autopilot=%', (SELECT count(*) FROM building_queue WHERE planet_id = vC),
    (SELECT count(*) FROM shipyard_queue WHERE planet_id = vC), (SELECT autopilot_enabled FROM planets WHERE id = vC);
  RAISE NOTICE 'msgs A=% B=%', (SELECT string_agg(subject, ' | ') FROM messages WHERE recipient_id = vA AND created_at = now()),
    (SELECT string_agg(subject, ' | ') FROM messages WHERE recipient_id = vB AND created_at = now());

  -- 3) Dueno bloqueado
  PERFORM set_config('request.jwt.claims', json_build_object('sub', vB::text, 'role', 'authenticated')::text, true);
  BEGIN
    RAISE NOTICE 'B build -> %', secure_add_to_building_queue(vC, 1);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B build blocked OK: %', SQLERRM; END;
  BEGIN
    RAISE NOTICE 'B send -> %', secure_send_fleet(vC, 1, 1, 1, 'transport', '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B send blocked OK: %', SQLERRM; END;
  RAISE NOTICE 'B transport to C -> %', (SELECT validate_fleet_mission(vB, vBM, galaxy, solar_system, position, 'transport', 'planet') FROM planets WHERE id = vC);
  RAISE NOTICE 'B attack to C -> %', (SELECT validate_fleet_mission(vB, vBM, galaxy, solar_system, position, 'attack', 'planet') FROM planets WHERE id = vC);
  RAISE NOTICE 'A attack to C -> %', (SELECT validate_fleet_mission(vA, vM, galaxy, solar_system, position, 'attack', 'planet') FROM planets WHERE id = vC);
  RAISE NOTICE 'B overview %', get_occupation_overview();

  -- 4) Ocupante: detalle, produccion, transporte
  PERFORM set_config('request.jwt.claims', json_build_object('sub', vA::text, 'role', 'authenticated')::text, true);
  RAISE NOTICE 'A overview %', get_occupation_overview();
  v_res := get_occupation_detail(v_occ.id);
  RAISE NOTICE 'A detail ok=% res=% garrison=% ships_avail=% defs_avail=% targets=%', v_res->>'success', v_res->'resources', v_res->'garrison',
    (SELECT count(*) FROM jsonb_array_elements(v_res->'build_ships') e WHERE (e->>'available')::boolean),
    (SELECT count(*) FROM jsonb_array_elements(v_res->'build_defenses') e WHERE (e->>'available')::boolean),
    jsonb_array_length(v_res->'transport_targets');
  RAISE NOTICE 'BUILD lf %', occupation_build(v_occ.id, 'ship', v_lf, 3);
  RAISE NOTICE 'BUILD def %', occupation_build(v_occ.id, 'defense', 1, 5);
  RAISE NOTICE 'BUILD occ %', occupation_build(v_occ.id, 'ship', v_occ_ship, 1);
  RAISE NOTICE 'BUILD dome %', occupation_build(v_occ.id, 'defense', 7, 1);
  UPDATE occupation_build_queue SET start_time = start_time - interval '30 days' WHERE occupation_id = v_occ.id AND item_type = 'ship';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'CRON %', _occ_cron_tick();
  RAISE NOTICE 'garrison lf=% queue=%', (SELECT quantity FROM fleet_ships WHERE fleet_id = v_fleet AND ship_type_id = v_lf),
    (SELECT string_agg(item_type || ':' || status || ':' || quantity_done, ',') FROM occupation_build_queue WHERE occupation_id = v_occ.id);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', vA::text, 'role', 'authenticated')::text, true);
  RAISE NOTICE 'CANCEL def %', occupation_cancel_build((SELECT id FROM occupation_build_queue WHERE occupation_id = v_occ.id AND item_type = 'defense' AND status = 'pending' LIMIT 1));
  RAISE NOTICE 'TRANSPORT all -> %', occupation_transport(v_occ.id, jsonb_build_array(jsonb_build_object('ship_type_id', v_big, 'quantity', (SELECT quantity FROM fleet_ships WHERE fleet_id = v_fleet AND ship_type_id = v_big)), jsonb_build_object('ship_type_id', v_lf, 'quantity', 3)), 0, 0, 0, vM, 100);
  RAISE NOTICE 'TRANSPORT 1 -> %', occupation_transport(v_occ.id, jsonb_build_array(jsonb_build_object('ship_type_id', v_lf, 'quantity', 1)), 10, 0, 0, vM, 100);
  RAISE NOTICE 'RANKING %', get_occupation_ranking(10);

  -- 5) Recuperacion del dueno
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO fleets (user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type, mission_type,
    departure_time, arrival_time, return_time)
  SELECT vB, vBM, galaxy, solar_system, position, 'planet', 'attack', now() - interval '1 hour', now() - interval '1 second', now() + interval '1 hour'
  FROM planets WHERE id = vC RETURNING id INTO v_fleet2;
  INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (v_fleet2, v_big, 500);
  PERFORM process_fleet_arrival(v_fleet2);
  SELECT status || '/' || COALESCE(end_reason, '-') INTO v_txt FROM occupations WHERE id = v_occ.id;
  RAISE NOTICE 'RECOVERY occ=% garrison=% owner fleet=%', v_txt,
    (SELECT mission_type || '/' || is_returning || '/' || is_completed FROM fleets WHERE id = v_fleet),
    (SELECT mission_type || '/' || is_returning || '/' || is_completed FROM fleets WHERE id = v_fleet2);
  RAISE NOTICE 'restored: bq=% sq=% autopilot=% defs=%', (SELECT count(*) FROM building_queue WHERE planet_id = vC),
    (SELECT count(*) FROM shipyard_queue WHERE planet_id = vC), (SELECT autopilot_enabled FROM planets WHERE id = vC),
    (SELECT string_agg(defense_type_id || ':' || quantity, ',') FROM planet_defenses WHERE planet_id = vC);
  RAISE NOTICE 'msgs B=%', (SELECT string_agg(subject, ' | ') FROM messages WHERE recipient_id = vB AND created_at = now());
  RAISE NOTICE 'battle_report rows=%', (SELECT count(*) FROM battle_reports WHERE attacker_id = vB AND created_at = now());

  -- 6) Nueva ocupacion y abandono
  DELETE FROM planet_defenses WHERE planet_id = vC;
  INSERT INTO fleets (user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type, mission_type,
    departure_time, arrival_time, return_time)
  SELECT vA, vM, galaxy, solar_system, position, 'planet', 'attack', now() - interval '1 hour', now() - interval '1 second', now() + interval '1 hour'
  FROM planets WHERE id = vC RETURNING id INTO v_fleet;
  INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (v_fleet, v_occ_ship, 1), (v_fleet, v_big, 50);
  UPDATE fleets SET is_completed = true WHERE id = v_fleet2;
  PERFORM process_fleet_arrival(v_fleet);
  SELECT * INTO v_occ FROM occupations WHERE planet_id = vC AND status = 'active';
  RAISE NOTICE 'OCC2 found=% fb=% fs=%', FOUND, jsonb_array_length(v_occ.frozen_building), jsonb_array_length(v_occ.frozen_shipyard);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', vA::text, 'role', 'authenticated')::text, true);
  RAISE NOTICE 'ABANDON %', occupation_abandon(v_occ.id);
  SELECT status || '/' || COALESCE(end_reason, '-') INTO v_txt FROM occupations WHERE id = v_occ.id;
  RAISE NOTICE 'after abandon occ=% fleet=%', v_txt, (SELECT mission_type || '/' || is_returning || '/' || is_completed FROM fleets WHERE id = v_fleet);

  -- 7) Fallo: planeta principal no ocupable
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO fleets (user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type, mission_type,
    departure_time, arrival_time, return_time)
  SELECT vA, vM, galaxy, solar_system, position, 'planet', 'attack', now() - interval '1 hour', now() - interval '1 second', now() + interval '1 hour'
  FROM planets WHERE id = vBM RETURNING id INTO v_fleet;
  INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (v_fleet, v_occ_ship, 1), (v_fleet, v_big, 50);
  UPDATE fleets SET is_completed = true WHERE id IN (SELECT id FROM fleets WHERE user_id = vB AND NOT is_completed);
  RAISE NOTICE 'try_start main -> %', _occ_try_start(v_fleet, vBM, 0, 0, 0);
  RAISE NOTICE 'fail msg=%', (SELECT body FROM messages WHERE recipient_id = vA AND subject = 'Ocupación fallida' ORDER BY created_at DESC LIMIT 1);

  -- 8) Liberacion por destruccion de la guarnicion
  DELETE FROM fleets WHERE id = v_fleet;
  INSERT INTO fleets (user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type, mission_type,
    departure_time, arrival_time, return_time)
  SELECT vA, vM, galaxy, solar_system, position, 'planet', 'attack', now() - interval '1 hour', now() - interval '1 second', now() + interval '1 hour'
  FROM planets WHERE id = vC RETURNING id INTO v_fleet;
  INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (v_fleet, v_occ_ship, 1), (v_fleet, v_big, 50);
  DELETE FROM planet_defenses WHERE planet_id = vC;
  DELETE FROM planet_ships WHERE planet_id = vC;
  PERFORM process_fleet_arrival(v_fleet);
  SELECT * INTO v_occ FROM occupations WHERE planet_id = vC AND status = 'active';
  RAISE NOTICE 'OCC3 found=%', FOUND;
  DELETE FROM fleet_ships WHERE fleet_id = v_fleet;
  UPDATE fleets SET is_completed = true WHERE id = v_fleet;
  SELECT status || '/' || COALESCE(end_reason, '-') INTO v_txt FROM occupations WHERE id = v_occ.id;
  RAISE NOTICE 'after garrison destroyed occ=%', v_txt;

  -- 9) ACS de recuperacion (creador = dueno)
  INSERT INTO fleets (user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type, mission_type,
    departure_time, arrival_time, return_time)
  SELECT vA, vM, galaxy, solar_system, position, 'planet', 'attack', now() - interval '1 hour', now() - interval '1 second', now() + interval '1 hour'
  FROM planets WHERE id = vC RETURNING id INTO v_fleet;
  INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (v_fleet, v_occ_ship, 1), (v_fleet, v_big, 50);
  DELETE FROM planet_defenses WHERE planet_id = vC;
  PERFORM process_fleet_arrival(v_fleet);
  SELECT * INTO v_occ FROM occupations WHERE planet_id = vC AND status = 'active';
  RAISE NOTICE 'OCC4 found=%', FOUND;
  DECLARE v_acs uuid;
  BEGIN
    INSERT INTO fleets (user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type, mission_type,
      departure_time, arrival_time, return_time)
    SELECT vB, vBM, galaxy, solar_system, position, 'planet', 'attack', now() - interval '1 hour', now() - interval '1 second', now() + interval '1 hour'
    FROM planets WHERE id = vC RETURNING id INTO v_fleet2;
    INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (v_fleet2, v_big, 500);
    INSERT INTO acs_fleets (main_fleet_id, alliance_id, name, creator_id, target_galaxy, target_system, target_position,
      arrival_time, max_fleets, is_active, status, current_participants, invited_users)
    SELECT v_fleet2, (SELECT id FROM alliances LIMIT 1), 'TEST', vB, galaxy, solar_system, position, now() - interval '1 second', 5, true, 'waiting', 1, ARRAY[]::uuid[]
    FROM planets WHERE id = vC
    RETURNING id INTO v_acs;
    UPDATE fleets SET acs_id = v_acs, is_acs = true WHERE id = v_fleet2;
    INSERT INTO acs_participants (acs_id, fleet_id, user_id) VALUES (v_acs, v_fleet2, vB);
    RAISE NOTICE 'is_recovery_acs=%', _occ_is_recovery_acs(v_acs, vC);
    PERFORM process_acs_fleet_arrival(v_acs);
    SELECT status || '/' || COALESCE(end_reason, '-') INTO v_txt FROM occupations WHERE id = v_occ.id;
    RAISE NOTICE 'ACS RECOVERY occ=% garrison=% acs fleet=%', v_txt,
      (SELECT mission_type || '/' || is_returning || '/' || is_completed FROM fleets WHERE id = v_fleet),
      (SELECT mission_type || '/' || is_returning || '/' || is_completed FROM fleets WHERE id = v_fleet2);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ACS test failed: %', SQLERRM; END;

  RAISE NOTICE 'ALL TESTS FINISHED';
END
$t$;
