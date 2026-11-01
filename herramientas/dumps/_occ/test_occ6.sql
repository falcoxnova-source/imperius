BEGIN;
DO $t$
DECLARE
  v_p record; v_b uuid; v_borig uuid; v_c uuid; v_corig uuid;
  v_g uuid; v_f uuid; v_occ uuid; v_occship int; r record;
BEGIN
  SELECT id INTO v_occship FROM ship_types WHERE code = 'occupation_ship';
  SELECT p.* INTO v_p FROM planets p
  WHERE p.planet_type = 'planet' AND NOT COALESCE(p.is_main_planet, false) AND NOT COALESCE(p.is_destroyed, false)
    AND p.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM occupations o WHERE o.planet_id = p.id AND o.status = 'active')
    AND public._colony_listed_since(p.id) IS NULL
  ORDER BY p.created_at LIMIT 1;
  SELECT user_id, id INTO v_b, v_borig FROM planets
  WHERE is_main_planet AND planet_type = 'planet' AND user_id <> v_p.user_id ORDER BY created_at LIMIT 1;
  SELECT user_id, id INTO v_c, v_corig FROM planets
  WHERE is_main_planet AND planet_type = 'planet' AND user_id NOT IN (v_p.user_id, v_b) ORDER BY created_at LIMIT 1;
  RAISE NOTICE 'planet % owner % occupier % attacker %', v_p.id, v_p.user_id, v_b, v_c;

  -- Guarnicion de B
  INSERT INTO fleets (user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type,
    mission_type, departure_time, arrival_time, is_returning, is_completed)
  VALUES (v_b, v_borig, v_p.galaxy, v_p.solar_system, v_p.position, 'planet', 'deploy',
    now() - interval '2 hour', now() - interval '1 hour', false, false) RETURNING id INTO v_g;
  INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (v_g, v_occship, 1), (v_g, 13, 1);
  INSERT INTO occupations (planet_id, owner_id, occupier_id, garrison_fleet_id, origin_planet_id, status,
    prev_autopilot, frozen_building, frozen_shipyard, frozen_at)
  VALUES (v_p.id, v_p.user_id, v_b, v_g, v_borig, 'active', false, '[]', '[]', now()) RETURNING id INTO v_occ;

  UPDATE planet_ships SET quantity = 0 WHERE planet_id = v_p.id;
  UPDATE planet_defenses SET quantity = 0 WHERE planet_id = v_p.id;

  -- Atacante C (tercero) con Nave de Ocupacion
  INSERT INTO fleets (user_id, origin_planet_id, target_galaxy, target_system, target_position, target_type,
    mission_type, departure_time, arrival_time, is_returning, is_completed)
  VALUES (v_c, v_corig, v_p.galaxy, v_p.solar_system, v_p.position, 'planet', 'attack',
    now() - interval '1 hour', now() - interval '1 second', false, false) RETURNING id INTO v_f;
  INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (v_f, 14, 200), (v_f, v_occship, 1);

  PERFORM public.process_fleet_arrival(v_f);

  SELECT status, end_reason INTO r FROM occupations WHERE id = v_occ;
  RAISE NOTICE 'occ B: % / %', r.status, r.end_reason;
  RAISE NOTICE 'occ activas en planeta: %', (SELECT count(*) FROM occupations WHERE planet_id = v_p.id AND status = 'active');
  RAISE NOTICE 'occ de C: %', (SELECT count(*) FROM occupations WHERE planet_id = v_p.id AND occupier_id = v_c);
  SELECT mission_type, is_returning, is_completed INTO r FROM fleets WHERE id = v_f;
  RAISE NOTICE 'flota C: % ret=% comp=%', r.mission_type, r.is_returning, r.is_completed;
  SELECT is_completed INTO r FROM fleets WHERE id = v_g;
  RAISE NOTICE 'guarnicion B completed=%  naves=%', r.is_completed, (SELECT COALESCE(sum(quantity),0) FROM fleet_ships WHERE fleet_id = v_g);
  RAISE NOTICE 'planeta owner ahora: %', (SELECT user_id FROM planets WHERE id = v_p.id);
  FOR r IN SELECT recipient_id, subject, left(body, 160) AS b FROM messages
           WHERE created_at = now() AND recipient_id IN (v_p.user_id, v_b, v_c) AND message_type IN ('system') LOOP
    RAISE NOTICE 'msg % | % | %', CASE r.recipient_id WHEN v_p.user_id THEN 'A' WHEN v_b THEN 'B' ELSE 'C' END, r.subject, r.b;
  END LOOP;
END
$t$;
ROLLBACK;
