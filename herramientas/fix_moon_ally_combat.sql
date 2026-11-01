-- ============================================================================
-- FIX: Combate luna/planeta + persistencia de bajas de flotas aliadas estacionadas
-- ----------------------------------------------------------------------------
-- Problemas corregidos:
--   #1 perform_combat: las flotas aliadas (deploy) entraban a defender por
--      coordenadas sin distinguir planeta/luna. Ahora solo defienden el cuerpo
--      donde estan estacionadas (COALESCE(f.target_type,'planet') = planet_type).
--   #2 process_fleet_arrival (WHEN 'attack'): la resolucion del objetivo ignoraba
--      target_type y elegia una fila arbitraria si habia planeta+luna en las
--      mismas coordenadas. Ahora filtra por p.planet_type = target_type.
--   #3 process_fleet_arrival: la escritura de resultados solo tocaba planet_ships
--      del cuerpo atacado, ignorando el 'source' -> las bajas de las flotas
--      aliadas NO se persistian (aparecian intactas) y corrompian el conteo del
--      planeta. Ahora se despacha por 'source': planet->planet_ships,
--      defense->planet_defenses, <uuid>->fleet_ships, y se limpian las flotas
--      estacionadas que quedan sin naves.
-- Patron: pg_get_functiondef + strip CRLF + replace anclado + EXECUTE (idempotente).
-- ============================================================================
SET client_encoding TO 'UTF8';

BEGIN;

-- ----------------------------------------------------------------------------
-- PATCH A: perform_combat -> flotas aliadas solo defienden su propio cuerpo
-- ----------------------------------------------------------------------------
DO $patchA$
DECLARE
  v_src text;
  v_old text;
  v_new text;
BEGIN
  v_src := pg_get_functiondef('public.perform_combat(uuid,uuid)'::regprocedure)::text;
  v_src := replace(v_src, E'\r', '');

  IF position('AND COALESCE(f.target_type' IN v_src) > 0 THEN
    RAISE NOTICE 'PATCH A: perform_combat ya estaba parcheada, se omite.';
    RETURN;
  END IF;

  v_old := $a$      AND f.mission_type = 'deploy'
      AND f.is_completed = false$a$;
  v_new := $a$      AND f.mission_type = 'deploy'
      AND COALESCE(f.target_type, 'planet') = (SELECT planet_type FROM planets WHERE id = p_target_planet_id)
      AND f.is_completed = false$a$;

  IF position(v_old IN v_src) = 0 THEN
    RAISE EXCEPTION 'PATCH A: anclaje (mission_type deploy) no encontrado en perform_combat';
  END IF;

  v_src := replace(v_src, v_old, v_new);
  EXECUTE v_src;
  RAISE NOTICE 'PATCH A: perform_combat parcheada (flotas aliadas defienden solo su cuerpo).';
END
$patchA$;

-- ----------------------------------------------------------------------------
-- PATCH B: process_fleet_arrival -> objetivo por cuerpo + persistencia de bajas
-- ----------------------------------------------------------------------------
DO $patchB$
DECLARE
  v_src text;
  v_old text;
  v_new text;
BEGIN
  v_src := pg_get_functiondef('public.process_fleet_arrival(uuid)'::regprocedure)::text;
  v_src := replace(v_src, E'\r', '');

  IF position('ELSIF (v_unit->>''source'') NOT IN (''planet'',''defense'')' IN v_src) > 0 THEN
    RAISE NOTICE 'PATCH B: process_fleet_arrival ya estaba parcheada, se omite.';
    RETURN;
  END IF;

  -- #2: resolucion del objetivo del ataque por planet_type (usa el WHEN 'attack' como ancla unica)
  v_old := $b1$  WHEN 'attack' THEN
    SELECT p.* INTO target_planet FROM planets p WHERE p.galaxy = fleet_record.target_galaxy AND p.solar_system = fleet_record.target_system AND p.position = fleet_record.target_position;$b1$;
  v_new := $b1$  WHEN 'attack' THEN
    SELECT p.* INTO target_planet FROM planets p WHERE p.galaxy = fleet_record.target_galaxy AND p.solar_system = fleet_record.target_system AND p.position = fleet_record.target_position AND p.planet_type = COALESCE(fleet_record.target_type, 'planet');$b1$;
  IF position(v_old IN v_src) = 0 THEN
    RAISE EXCEPTION 'PATCH B: anclaje (WHEN attack target select) no encontrado';
  END IF;
  v_src := replace(v_src, v_old, v_new);

  -- #3a: bucle attacker_won (solo planet_ships) -> despacho por source
  v_old := $b2$FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP IF NOT (v_unit->>'is_defense')::boolean THEN UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; END IF; END LOOP;$b2$;
  v_new := $b2$FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP IF NOT (v_unit->>'is_defense')::boolean THEN IF COALESCE(v_unit->>'source','planet') = 'planet' THEN UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; ELSIF (v_unit->>'source') NOT IN ('planet','defense') THEN UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer; END IF; END IF; END LOOP;$b2$;
  IF position(v_old IN v_src) = 0 THEN
    RAISE EXCEPTION 'PATCH B: anclaje (bucle attacker_won) no encontrado';
  END IF;
  v_src := replace(v_src, v_old, v_new);

  -- #3b: bucles defender_won + draw (planet_defenses/planet_ships) -> despacho por source (replace all, 2 ocurrencias)
  v_old := $b3$FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP IF (v_unit->>'is_defense')::boolean THEN UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer; ELSE UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; END IF; END LOOP;$b3$;
  v_new := $b3$FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP IF (v_unit->>'is_defense')::boolean THEN UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer; ELSIF COALESCE(v_unit->>'source','planet') = 'planet' THEN UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; ELSIF (v_unit->>'source') NOT IN ('planet','defense') THEN UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer; END IF; END LOOP;$b3$;
  IF position(v_old IN v_src) = 0 THEN
    RAISE EXCEPTION 'PATCH B: anclaje (bucles defender_won/draw) no encontrado';
  END IF;
  v_src := replace(v_src, v_old, v_new);

  -- #3c: limpieza de flotas estacionadas destruidas tras la escritura de resultados
  v_old := $b4$      v_debris_metal := COALESCE((combat_result->>'debris_metal')::numeric, 0);$b4$;
  v_new := $b4$      DELETE FROM fleet_ships WHERE quantity <= 0 AND fleet_id IN (SELECT (u->>'source')::uuid FROM jsonb_array_elements(combat_result->'defender_remaining') u WHERE (u->>'source') NOT IN ('planet','defense'));
      UPDATE fleets SET is_completed = true WHERE mission_type = 'deploy' AND is_completed = false AND id IN (SELECT (u->>'source')::uuid FROM jsonb_array_elements(combat_result->'defender_remaining') u WHERE (u->>'source') NOT IN ('planet','defense')) AND NOT EXISTS (SELECT 1 FROM fleet_ships fs WHERE fs.fleet_id = fleets.id AND fs.quantity > 0);
      v_debris_metal := COALESCE((combat_result->>'debris_metal')::numeric, 0);$b4$;
  IF position(v_old IN v_src) = 0 THEN
    RAISE EXCEPTION 'PATCH B: anclaje (limpieza v_debris_metal) no encontrado';
  END IF;
  v_src := replace(v_src, v_old, v_new);

  EXECUTE v_src;
  RAISE NOTICE 'PATCH B: process_fleet_arrival parcheada (objetivo por cuerpo + persistencia de bajas de flotas aliadas).';
END
$patchB$;

COMMIT;
