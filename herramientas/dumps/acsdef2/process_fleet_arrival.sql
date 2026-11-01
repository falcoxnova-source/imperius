CREATE OR REPLACE FUNCTION public.process_fleet_arrival(p_fleet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  fleet_record RECORD;
  target_planet RECORD;
  ship_record RECORD;
  total_cargo_capacity INTEGER;
  loot_metal NUMERIC;
  loot_crystal NUMERIC;
  loot_deuterium NUMERIC;
  combat_result jsonb;
  v_building_damage jsonb;
  v_bdmg_note text := '';
  v_unit jsonb;
  v_debris_metal NUMERIC := 0;
  v_debris_crystal NUMERIC := 0;
  v_dark_matter_found INTEGER := 0;
  v_expedition_message TEXT;
  v_attacker_units_report TEXT;
  v_defender_units_report TEXT;
  v_moon_result jsonb := NULL;
  v_battle_report jsonb;
  v_atk_name text;
  v_def_name text;
  v_atk_origin text;
  v_all_acs_fleets_arrived BOOLEAN;
  v_expedition_result jsonb;
  v_colony_stats RECORD;
  v_colonization_success BOOLEAN := false;
  -- Fortress variables
  v_fortress_ships jsonb;
  v_fortress_alliance uuid;
  v_fortress_result jsonb;
  v_fortress_ship record;
  v_fortress_msg text;
  v_fortress_i integer;
  v_fortress_j integer;
  v_fortress_name text;
  v_fortress_init_qty integer;
  v_fortress_rem_qty integer;
  v_fortress_lost integer;
  v_fortress_combat jsonb;
  v_fortress_rounds integer;
  v_fortress_debris_m numeric;
  v_fortress_debris_c numeric;
  v_fortress_result_text text;
  v_fortress_att_init jsonb;
  v_fortress_def_init jsonb;
  v_fortress_att_rem jsonb;
  v_fortress_def_rem jsonb;
  v_fortress_u jsonb;
  v_fortress_ru jsonb;
  v_fortress_def_ally_id uuid;
  v_fortress_def_member record;
  v_fortress_def_msg text;
  v_fortress_def_result_text text;
  v_fortress_att_units text;
  v_fortress_def_units text;
  v_fortress_extra text;
  -- Treasure Planet variables (aislado del sistema de Fortaleza, mismo patron)
  v_treasure_ships jsonb;
  v_treasure_alliance uuid;
  v_treasure_result jsonb;
  v_treasure_ship record;
  v_treasure_def_ally_id uuid;
  v_treasure_def_member record;
  v_treasure_combat jsonb;
  v_treasure_rounds integer;
  v_treasure_debris_m numeric;
  v_treasure_debris_c numeric;
  v_treasure_msg text;
  v_treasure_ru jsonb;
BEGIN
  -- Load fleet record (FOR UPDATE: serializa el procesamiento concurrente y
  -- evita que dos llamadas simultaneas -acelerar + heartbeat- dupliquen naves/recursos)
  SELECT * INTO fleet_record FROM fleets WHERE id = p_fleet_id AND is_completed = false FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  -- [ACSFORT1] Ataque ACS contra Fortaleza / Planeta del Tesoro: combate CONJUNTO.
  -- Solo aplica a flotas ACS dirigidas a [x:250:8] o [x:250:9]. No afecta ataques normales.
  IF fleet_record.is_acs = true AND fleet_record.acs_id IS NOT NULL
     AND NOT fleet_record.is_returning AND fleet_record.arrival_time <= NOW()
     AND fleet_record.target_system = 250 AND fleet_record.target_position IN (8, 9)
     AND fleet_record.mission_type IN ('attack', 'destroy') THEN
    v_all_acs_fleets_arrived := public.process_acs_stronghold_arrival(fleet_record.acs_id);
    IF v_all_acs_fleets_arrived THEN RETURN; END IF;
  END IF;

  -- [ACSJOINT1] ACS contra planeta normal: combate CONJUNTO de todas las flotas
  -- del ACS (nunca una a una). Delegado en process_acs_fleet_arrival.
  IF fleet_record.is_acs = true AND fleet_record.acs_id IS NOT NULL
     AND NOT fleet_record.is_returning AND fleet_record.arrival_time <= NOW()
     AND fleet_record.mission_type = 'attack'
     AND NOT (fleet_record.target_system = 250 AND fleet_record.target_position IN (8, 9)) THEN
    PERFORM public.process_acs_fleet_arrival(fleet_record.acs_id);
    -- Resuelto por el ACS (esta flota ya regresa/termino) o lo esta resolviendo
    -- otra sesion / aun no es la hora del ACS -> no combatir individualmente.
    IF NOT EXISTS (SELECT 1 FROM fleets f WHERE f.id = p_fleet_id AND f.is_completed = false AND f.is_returning = false)
       OR EXISTS (SELECT 1 FROM acs_fleets af WHERE af.id = fleet_record.acs_id AND af.is_active = true AND af.status IN ('waiting', 'in_combat')) THEN
      RETURN;
    END IF;
    -- ACS inexistente/cerrado y la flota sigue en vuelo: flujo individual (legado).
  END IF;

  -- ========================================================================
  -- FORTRESS CHECK
  -- ========================================================================
  IF NOT fleet_record.is_returning AND fleet_record.arrival_time <= NOW() AND fleet_record.target_system = 250 AND fleet_record.target_position = 8 AND
     fleet_record.mission_type IN ('attack', 'destroy', 'deploy', 'transport') THEN
    
    -- Get attacker ships
    SELECT COALESCE(jsonb_agg(jsonb_build_object('ship_type_id', fs.ship_type_id, 'quantity', fs.quantity)), '[]'::jsonb)
    INTO v_fortress_ships FROM fleet_ships fs WHERE fs.fleet_id = p_fleet_id;
    
    -- Get attacker alliance
    SELECT alliance_id INTO v_fortress_alliance FROM alliance_members WHERE user_id = fleet_record.user_id LIMIT 1;
    
    -- Deploy/transport to own alliance fortress: add ships directly
    IF fleet_record.mission_type IN ('deploy', 'transport') THEN
      IF EXISTS (SELECT 1 FROM alliance_members am JOIN alliance_fortresses af ON af.owner_alliance_id = am.alliance_id WHERE am.user_id = fleet_record.user_id AND af.galaxy = fleet_record.target_galaxy) THEN
        FOR v_fortress_ship IN SELECT * FROM fleet_ships WHERE fleet_id = p_fleet_id LOOP
          -- [FTORIG1] Se guarda el planeta de origen de la flota.
          INSERT INTO fortress_ships (fortress_id, user_id, alliance_id, ship_type_id, quantity, origin_planet_id)
          SELECT af.id, fleet_record.user_id, af.owner_alliance_id, v_fortress_ship.ship_type_id, v_fortress_ship.quantity, fleet_record.origin_planet_id
          FROM alliance_fortresses af WHERE af.galaxy = fleet_record.target_galaxy;
        END LOOP;
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
        INSERT INTO messages (recipient_id, sender_id, subject, body, created_at)
        VALUES (fleet_record.user_id, NULL, 'Refuerzo Enviado', 'Tus naves se han sumado a la defensa de la fortaleza en Galaxia ' || fleet_record.target_galaxy, now());
        RETURN;
      END IF;
    END IF;
    
    -- Save defender alliance BEFORE combat (ownership may change on capture)
    SELECT owner_alliance_id INTO v_fortress_def_ally_id FROM alliance_fortresses WHERE galaxy = fleet_record.target_galaxy;
    
    -- Execute fortress combat
    v_fortress_result := resolve_fortress_attack(fleet_record.target_galaxy, fleet_record.user_id, v_fortress_alliance, v_fortress_ships);
    
    -- Check if fortress attack was rejected (e.g., no alliance)
    IF (v_fortress_result->>'success')::boolean = false THEN
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type, created_at)
      VALUES (fleet_record.user_id, NULL, 'Ataque a Fortaleza',
        'Tu flota llego a [' || fleet_record.target_galaxy || ':' || fleet_record.target_system || ':' || fleet_record.target_position || '] pero no pudo atacar la fortaleza. ' || COALESCE(v_fortress_result->>'error', 'Error desconocido.') || E'

La flota regresa a tu planeta.',
        'battle', now());
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      RETURN;
    END IF;

    -- Build detailed combat report
    v_fortress_combat := v_fortress_result->'combat';
    v_fortress_msg := '';
    
    IF v_fortress_combat IS NOT NULL THEN
      v_fortress_rounds := 0;
      IF v_fortress_combat->'rounds_data' IS NOT NULL THEN
        v_fortress_rounds := jsonb_array_length(v_fortress_combat->'rounds_data');
      END IF;
      
      v_fortress_debris_m := COALESCE((v_fortress_combat->>'debris_metal')::numeric, 0);
      v_fortress_debris_c := COALESCE((v_fortress_combat->>'debris_crystal')::numeric, 0);
      v_fortress_result_text := CASE
        WHEN (v_fortress_result->>'result') IN ('captured','won_no_claim') THEN 'VICTORIA ATACANTE'
        WHEN (v_fortress_result->>'result') = 'draw' THEN 'EMPATE'
        ELSE 'VICTORIA DEFENSOR'
      END;
      v_fortress_def_result_text := CASE
        WHEN (v_fortress_result->>'result') = 'captured' THEN 'DERROTA'
        WHEN (v_fortress_result->>'result') = 'won_no_claim' THEN 'DERROTA PARCIAL'
        WHEN (v_fortress_result->>'result') = 'draw' THEN 'EMPATE'
        ELSE 'VICTORIA'
      END;
      v_fortress_att_init := v_fortress_combat->'attacker_initial';
      v_fortress_def_init := v_fortress_combat->'defender_initial';
      v_fortress_att_rem := v_fortress_combat->'attacker_remaining';
      v_fortress_def_rem := v_fortress_combat->'defender_remaining';
      
      -- Build attacker units block (ship lines only, sin encabezado)
      v_fortress_att_units := '';
      IF v_fortress_att_init IS NOT NULL AND jsonb_array_length(v_fortress_att_init) > 0 THEN
        v_fortress_i := 0;
        WHILE v_fortress_i < jsonb_array_length(v_fortress_att_init) LOOP
          v_fortress_u := v_fortress_att_init->v_fortress_i;
          v_fortress_name := COALESCE(v_fortress_u->>'name', 'Nave');
          v_fortress_init_qty := COALESCE((v_fortress_u->>'quantity')::integer, 0);
          v_fortress_rem_qty := 0;
          
          IF v_fortress_att_rem IS NOT NULL THEN
            v_fortress_j := 0;
            WHILE v_fortress_j < jsonb_array_length(v_fortress_att_rem) LOOP
              v_fortress_ru := v_fortress_att_rem->v_fortress_j;
              IF (v_fortress_ru->>'type_id')::integer = (v_fortress_u->>'type_id')::integer THEN
                v_fortress_rem_qty := COALESCE((v_fortress_ru->>'quantity')::integer, 0);
                EXIT;
              END IF;
              v_fortress_j := v_fortress_j + 1;
            END LOOP;
          END IF;
          
          v_fortress_lost := v_fortress_init_qty - v_fortress_rem_qty;
          IF v_fortress_lost > 0 THEN
            v_fortress_att_units := v_fortress_att_units || v_fortress_name || ': ' || v_fortress_init_qty || ' -> ' || v_fortress_rem_qty || ' (-' || v_fortress_lost || ' destruidas)' || E'
';
          ELSE
            v_fortress_att_units := v_fortress_att_units || v_fortress_name || ': ' || v_fortress_init_qty || ' (sin perdidas)' || E'
';
          END IF;
          v_fortress_i := v_fortress_i + 1;
        END LOOP;
      END IF;
      
      -- Build defender units block (ship lines only, sin encabezado)
      v_fortress_def_units := '';
      IF v_fortress_def_init IS NOT NULL AND jsonb_array_length(v_fortress_def_init) > 0 THEN
        v_fortress_i := 0;
        WHILE v_fortress_i < jsonb_array_length(v_fortress_def_init) LOOP
          v_fortress_u := v_fortress_def_init->v_fortress_i;
          v_fortress_name := COALESCE(v_fortress_u->>'name', 'Nave');
          v_fortress_init_qty := COALESCE((v_fortress_u->>'quantity')::integer, 0);
          v_fortress_rem_qty := 0;
          
          IF v_fortress_def_rem IS NOT NULL THEN
            v_fortress_j := 0;
            WHILE v_fortress_j < jsonb_array_length(v_fortress_def_rem) LOOP
              v_fortress_ru := v_fortress_def_rem->v_fortress_j;
              IF (v_fortress_ru->>'type_id')::integer = (v_fortress_u->>'type_id')::integer THEN
                v_fortress_rem_qty := COALESCE((v_fortress_ru->>'quantity')::integer, 0);
                EXIT;
              END IF;
              v_fortress_j := v_fortress_j + 1;
            END LOOP;
          END IF;
          
          v_fortress_lost := v_fortress_init_qty - v_fortress_rem_qty;
          IF v_fortress_lost > 0 THEN
            v_fortress_def_units := v_fortress_def_units || v_fortress_name || ': ' || v_fortress_init_qty || ' -> ' || v_fortress_rem_qty || ' (-' || v_fortress_lost || ' destruidas)' || E'
';
          ELSE
            v_fortress_def_units := v_fortress_def_units || v_fortress_name || ': ' || v_fortress_init_qty || ' (sin perdidas)' || E'
';
          END IF;
          v_fortress_i := v_fortress_i + 1;
        END LOOP;
      END IF;
      
      -- Debris (comun a ambos reportes)
      v_fortress_extra := '';
      IF v_fortress_debris_m > 0 OR v_fortress_debris_c > 0 THEN
        v_fortress_extra := 'Escombros generados: ' || floor(v_fortress_debris_m) || ' Metal, ' || floor(v_fortress_debris_c) || ' Cristal' || E'

';
      END IF;
      
      -- ATACANTE: TUS FUERZAS = naves atacantes, FUERZAS ENEMIGAS = naves defensoras
      v_fortress_msg := 'Combate en [' || fleet_record.target_galaxy || ':' || fleet_record.target_system || ':' || fleet_record.target_position || ']' || E'

';
      v_fortress_msg := v_fortress_msg || 'Resultado: ' || v_fortress_result_text || E'
';
      v_fortress_msg := v_fortress_msg || 'Rondas: ' || v_fortress_rounds || E'

';
      IF v_fortress_att_units <> '' THEN
        v_fortress_msg := v_fortress_msg || '=== TUS FUERZAS ===' || E'
' || v_fortress_att_units || E'
';
      END IF;
      IF v_fortress_def_units <> '' THEN
        v_fortress_msg := v_fortress_msg || '=== FUERZAS ENEMIGAS ===' || E'
' || v_fortress_def_units || E'
';
      END IF;
      v_fortress_msg := v_fortress_msg || v_fortress_extra;
      
      -- DEFENSOR: TUS FUERZAS = naves defensoras, FUERZAS ENEMIGAS = naves atacantes
      v_fortress_def_msg := 'Combate en [' || fleet_record.target_galaxy || ':' || fleet_record.target_system || ':' || fleet_record.target_position || ']' || E'

';
      /* [FORTREP1] nombre del atacante para la alianza defensora */
      v_fortress_def_msg := v_fortress_def_msg || 'Atacado por: ' || COALESCE((
        SELECT pr.username || COALESCE(' [' || al.tag || ']', '')
        FROM public.profiles pr
        LEFT JOIN public.alliance_members am ON am.user_id = pr.id
        LEFT JOIN public.alliances al ON al.id = am.alliance_id
        WHERE pr.id = fleet_record.user_id LIMIT 1), 'Desconocido') || E'\n';
      v_fortress_def_msg := v_fortress_def_msg || 'Resultado: ' || v_fortress_def_result_text || E'
';
      v_fortress_def_msg := v_fortress_def_msg || 'Rondas: ' || v_fortress_rounds || E'

';
      IF v_fortress_def_units <> '' THEN
        v_fortress_def_msg := v_fortress_def_msg || '=== TUS FUERZAS ===' || E'
' || v_fortress_def_units || E'
';
      END IF;
      IF v_fortress_att_units <> '' THEN
        v_fortress_def_msg := v_fortress_def_msg || '=== FUERZAS ENEMIGAS ===' || E'
' || v_fortress_att_units || E'
';
      END IF;
      v_fortress_def_msg := v_fortress_def_msg || v_fortress_extra;
      
      -- Footer por perspectiva
      IF (v_fortress_result->>'result') = 'captured' THEN
        v_fortress_msg := v_fortress_msg || 'La fortaleza ha sido capturada!';
        v_fortress_def_msg := v_fortress_def_msg || 'Tu fortaleza ha sido conquistada!';
      ELSIF (v_fortress_result->>'result') = 'won_no_claim' THEN
        v_fortress_msg := v_fortress_msg || 'Ganaste el combate pero necesitas una alianza para reclamar la fortaleza.';
        v_fortress_def_msg := v_fortress_def_msg || 'El atacante no tenia alianza: la fortaleza no cambia de duenio, pero todas las naves defensoras fueron destruidas.';
      ELSIF (v_fortress_result->>'result') = 'draw' THEN
        v_fortress_msg := v_fortress_msg || 'Empate tactico. La fortaleza mantiene su dueño.';
        v_fortress_def_msg := v_fortress_def_msg || 'Empate tactico: tu fortaleza mantiene el control.';
      ELSE
        v_fortress_msg := v_fortress_msg || 'La fortaleza resistio el ataque.';
        v_fortress_def_msg := v_fortress_def_msg || 'Tu fortaleza resistio el ataque.';
      END IF;
    ELSE
      v_fortress_msg := COALESCE(v_fortress_result->>'message', 'Combate finalizado.');
      v_fortress_def_msg := v_fortress_msg;
    END IF;
    
    -- Send to ATTACKER
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type, created_at)
    VALUES (fleet_record.user_id, NULL,
      CASE WHEN (v_fortress_result->>'result') = 'captured' THEN 'Fortaleza Capturada!' WHEN (v_fortress_result->>'result') = 'won_no_claim' THEN 'Victoria en Fortaleza (Sin Alianza)' WHEN (v_fortress_result->>'result') = 'draw' THEN 'Ataque a Fortaleza (Empate)' ELSE 'Ataque a Fortaleza' END,
      v_fortress_msg, 'battle', now());
    
    -- Send to DEFENDER alliance (v_fortress_def_ally_id capturado antes del combate)
    -- v_fortress_def_msg ya se construyo arriba desde la perspectiva del defensor
    -- (TUS FUERZAS = naves defensoras, FUERZAS ENEMIGAS = naves atacantes).
    -- Notify defender alliance whenever there WAS a defender and the attacker is not in the same alliance
    IF v_fortress_def_ally_id IS NOT NULL
       AND (v_fortress_alliance IS NULL OR v_fortress_def_ally_id <> v_fortress_alliance) THEN
      FOR v_fortress_def_member IN SELECT user_id FROM alliance_members WHERE alliance_id = v_fortress_def_ally_id LOOP
        INSERT INTO messages (recipient_id, sender_id, subject, body, message_type, created_at)
        VALUES (v_fortress_def_member.user_id, NULL,
          CASE
            WHEN (v_fortress_result->>'result') = 'captured' THEN 'Fortaleza Perdida!'
            WHEN (v_fortress_result->>'result') = 'won_no_claim' THEN 'Naves de Fortaleza Destruidas'
            WHEN (v_fortress_result->>'result') = 'draw' THEN 'Fortaleza Defendida (Empate)'
            ELSE 'Fortaleza Defendida'
          END,
          v_fortress_def_msg, 'battle', now());
      END LOOP;
    END IF;
    
    -- NOTE: resolve_fortress_attack already handles fortress_ships insertion
    -- (clear + insert for capture, adjust for draw/defeat, add for reinforce)
    -- Do NOT duplicate here or ships get counted twice
    
    -- Captura: las naves sobrevivientes quedan como guarnicion (ya insertadas por resolve_fortress_attack).
    -- Empate / victoria sin alianza / derrota: las naves sobrevivientes del atacante DEBEN regresar a casa, no desaparecer.
    -- [FTORIG3] Al capturar, grabar el planeta de origen de la flota en la guarnicion.
    IF (v_fortress_result->>'result') = 'captured' AND fleet_record.origin_planet_id IS NOT NULL THEN
      UPDATE fortress_ships fsx SET origin_planet_id = fleet_record.origin_planet_id
      FROM alliance_fortresses af
      WHERE af.id = fsx.fortress_id AND af.galaxy = fleet_record.target_galaxy
        AND fsx.user_id = fleet_record.user_id AND fsx.origin_planet_id IS NULL;
    END IF;
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    IF (v_fortress_result->>'result') <> 'captured' AND v_fortress_att_rem IS NOT NULL THEN
      FOR v_fortress_ru IN SELECT value FROM jsonb_array_elements(v_fortress_att_rem) LOOP
        IF COALESCE((v_fortress_ru->>'quantity')::integer, 0) > 0 THEN
          INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
          VALUES (p_fleet_id, (v_fortress_ru->>'type_id')::integer, (v_fortress_ru->>'quantity')::integer);
        END IF;
      END LOOP;
    END IF;
    IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    ELSE
      UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    END IF;
    RETURN;
  END IF;
  -- END FORTRESS CHECK

  -- ========================================================================
  -- TREASURE PLANET CHECK (aislado del sistema de Fortaleza; mismo patron,
  -- distinta posicion (250:9) y distintas tablas/funciones, no comparte
  -- ningun objeto con FORTRESS CHECK)
  -- ========================================================================
  IF NOT fleet_record.is_returning AND fleet_record.arrival_time <= NOW() AND fleet_record.target_system = 250 AND fleet_record.target_position = 9 AND
     fleet_record.mission_type IN ('attack', 'destroy', 'deploy', 'transport') THEN

    SELECT COALESCE(jsonb_agg(jsonb_build_object('ship_type_id', fs.ship_type_id, 'quantity', fs.quantity)), '[]'::jsonb)
    INTO v_treasure_ships FROM fleet_ships fs WHERE fs.fleet_id = p_fleet_id;

    SELECT alliance_id INTO v_treasure_alliance FROM alliance_members WHERE user_id = fleet_record.user_id LIMIT 1;

    IF fleet_record.mission_type IN ('deploy', 'transport') THEN
      IF EXISTS (SELECT 1 FROM alliance_members am JOIN treasure_planets tp ON tp.owner_alliance_id = am.alliance_id WHERE am.user_id = fleet_record.user_id AND tp.galaxy = fleet_record.target_galaxy) THEN
        FOR v_treasure_ship IN SELECT * FROM fleet_ships WHERE fleet_id = p_fleet_id LOOP
          INSERT INTO treasure_planet_ships (treasure_planet_id, user_id, alliance_id, ship_type_id, quantity, origin_planet_id)
          SELECT tp.id, fleet_record.user_id, tp.owner_alliance_id, v_treasure_ship.ship_type_id, v_treasure_ship.quantity, fleet_record.origin_planet_id
          FROM treasure_planets tp WHERE tp.galaxy = fleet_record.target_galaxy;
        END LOOP;
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
        INSERT INTO messages (recipient_id, sender_id, subject, body, created_at)
        VALUES (fleet_record.user_id, NULL, 'Refuerzo Enviado', 'Tus naves se han sumado a la defensa del Planeta del Tesoro en Galaxia ' || fleet_record.target_galaxy, now());
        RETURN;
      END IF;
    END IF;

    SELECT owner_alliance_id INTO v_treasure_def_ally_id FROM treasure_planets WHERE galaxy = fleet_record.target_galaxy;

    v_treasure_result := resolve_treasure_planet_attack(fleet_record.target_galaxy, fleet_record.user_id, v_treasure_alliance, v_treasure_ships);

    IF (v_treasure_result->>'success')::boolean = false THEN
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type, created_at)
      VALUES (fleet_record.user_id, NULL, 'Ataque al Planeta del Tesoro',
        'Tu flota llego a [' || fleet_record.target_galaxy || ':' || fleet_record.target_system || ':' || fleet_record.target_position || '] pero no pudo atacar el Planeta del Tesoro. ' || COALESCE(v_treasure_result->>'error', 'Error desconocido.') || E'

La flota regresa a tu planeta.',
        'battle', now());
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      RETURN;
    END IF;

    v_treasure_combat := v_treasure_result->'combat';
    v_treasure_rounds := 0;
    IF v_treasure_combat IS NOT NULL AND v_treasure_combat->'rounds_data' IS NOT NULL THEN
      v_treasure_rounds := jsonb_array_length(v_treasure_combat->'rounds_data');
    END IF;
    v_treasure_debris_m := COALESCE((v_treasure_combat->>'debris_metal')::numeric, 0);
    v_treasure_debris_c := COALESCE((v_treasure_combat->>'debris_crystal')::numeric, 0);

    -- Los reportes de combate del Planeta del Tesoro los emite en exclusiva
    -- resolve_treasure_planet_attack(), que ya inserta el reporte completo
    -- (detalle nave por nave) tanto al atacante como a cada miembro de la
    -- alianza defensora. Aqui NO se insertan mensajes para no duplicarlos
    -- con una version resumida sin datos de unidades.

    -- NOTE: resolve_treasure_planet_attack ya maneja la insercion en
    -- treasure_planet_ships (clear+insert en captura, ajuste en empate/derrota,
    -- suma en refuerzo). No duplicar aqui.
    -- [FTORIG3T] Igual que la fortaleza: grabar el planeta de origen.
    IF (v_treasure_result->>'result') IN ('captured','reinforced') AND fleet_record.origin_planet_id IS NOT NULL THEN
      UPDATE treasure_planet_ships tsx SET origin_planet_id = fleet_record.origin_planet_id
      FROM treasure_planets tp
      WHERE tp.id = tsx.treasure_planet_id AND tp.galaxy = fleet_record.target_galaxy
        AND tsx.user_id = fleet_record.user_id AND tsx.origin_planet_id IS NULL;
    END IF;
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    IF (v_treasure_result->>'result') NOT IN ('captured','reinforced') AND (v_treasure_combat->'attacker_remaining') IS NOT NULL THEN
      FOR v_treasure_ru IN SELECT value FROM jsonb_array_elements(v_treasure_combat->'attacker_remaining') LOOP
        IF COALESCE((v_treasure_ru->>'quantity')::integer, 0) > 0 THEN
          INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
          VALUES (p_fleet_id, (v_treasure_ru->>'type_id')::integer, (v_treasure_ru->>'quantity')::integer);
        END IF;
      END LOOP;
    END IF;
    IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    ELSE
      UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    END IF;
    RETURN;
  END IF;
  -- END TREASURE PLANET CHECK

  -- Continue with normal fleet processing (for non-fortress targets)
  IF fleet_record.arrival_time > NOW() AND NOT fleet_record.is_returning THEN RETURN; END IF;
  IF fleet_record.is_returning AND fleet_record.return_time > NOW() THEN RETURN; END IF;

  IF fleet_record.is_returning THEN
    FOR ship_record IN SELECT fs.ship_type_id, fs.quantity FROM fleet_ships fs WHERE fs.fleet_id = p_fleet_id LOOP
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (fleet_record.origin_planet_id, ship_record.ship_type_id, ship_record.quantity)
      ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
    END LOOP;
    UPDATE planet_resources SET metal = metal + fleet_record.cargo_metal, crystal = crystal + fleet_record.cargo_crystal, deuterium = deuterium + fleet_record.cargo_deuterium WHERE planet_id = fleet_record.origin_planet_id; IF COALESCE(fleet_record.pending_dark_matter,0) > 0 THEN UPDATE profiles SET dark_matter = COALESCE(dark_matter,0) + fleet_record.pending_dark_matter WHERE id = fleet_record.user_id; END IF; IF COALESCE(fleet_record.pending_fxu,0) > 0 THEN PERFORM _internal_set_fxu_context(); UPDATE profiles SET fxu_balance = fxu_balance + fleet_record.pending_fxu WHERE id = fleet_record.user_id; END IF;
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    RETURN;
  END IF;

  -- Handle other mission types (espionage, transport, deploy, recycle, expedition, colonize, attack, harvest)
  CASE fleet_record.mission_type
  WHEN 'harvest' THEN
    DECLARE
      v_moon RECORD;
      v_dm_rate numeric := 500;
      v_dm_cap numeric := 6000000;
      v_hours numeric;
      v_generated numeric;
      v_stock numeric;
      v_collector_capacity numeric;
      v_harvested numeric;
    BEGIN
      SELECT * INTO v_moon FROM planets
      WHERE galaxy = fleet_record.target_galaxy AND solar_system = fleet_record.target_system
        AND position = fleet_record.target_position AND planet_type = 'moon'
        AND user_id = fleet_record.user_id AND NOT is_destroyed
      FOR UPDATE;

      IF FOUND THEN
        v_hours := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(v_moon.dark_matter_last_gen, NOW()))) / 3600.0);
        v_generated := v_hours * v_dm_rate;
        v_stock := LEAST(v_dm_cap, COALESCE(v_moon.dark_matter_stock, 0) + v_generated);

        SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0) INTO v_collector_capacity
        FROM fleet_ships fs JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = p_fleet_id AND st.code = 'dark_matter_collector';

        v_harvested := FLOOR(GREATEST(0, LEAST(v_stock, v_collector_capacity)));

        UPDATE planets SET dark_matter_stock = GREATEST(0, v_stock - v_harvested), dark_matter_last_gen = NOW()
        WHERE id = v_moon.id;

        UPDATE fleets SET pending_dark_matter = COALESCE(pending_dark_matter, 0) + v_harvested, is_returning = true
        WHERE id = p_fleet_id;

        INSERT INTO messages (recipient_id, sender_id, subject, body, created_at)
        VALUES (fleet_record.user_id, NULL, 'Recoleccion de Materia Oscura',
          'Tus Recolectores llegaron a tu luna en [' || fleet_record.target_galaxy || ':' || fleet_record.target_system || ':' || fleet_record.target_position || '] y recolectaron ' || v_harvested || ' de Materia Oscura. La flota regresa con el cargamento.', now());
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;
    END;
  WHEN 'espionage' THEN
    SELECT p.* INTO target_planet FROM planets p WHERE p.galaxy = fleet_record.target_galaxy AND p.solar_system = fleet_record.target_system AND p.position = fleet_record.target_position AND p.planet_type = COALESCE(fleet_record.target_type, 'planet') AND NOT COALESCE(p.is_destroyed, false) /* [MOONSPY1] */;
    IF FOUND AND target_planet.user_id IS NOT NULL THEN
      PERFORM generate_espionage_report(fleet_record.user_id, target_planet.id, target_planet.user_id);
    END IF;
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  WHEN 'transport' THEN
    SELECT p.* INTO target_planet FROM planets p WHERE p.galaxy = fleet_record.target_galaxy AND p.solar_system = fleet_record.target_system AND p.position = fleet_record.target_position ORDER BY (p.planet_type = COALESCE(fleet_record.target_type, 'planet')) DESC, COALESCE(p.is_destroyed, false) ASC LIMIT 1 /* [MOONSPY1] */;
    IF FOUND THEN
      UPDATE planet_resources SET metal = metal + fleet_record.cargo_metal, crystal = crystal + fleet_record.cargo_crystal, deuterium = deuterium + fleet_record.cargo_deuterium WHERE planet_id = target_planet.id;
      UPDATE fleets SET cargo_metal = 0, cargo_crystal = 0, cargo_deuterium = 0, is_returning = true WHERE id = p_fleet_id;
    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    END IF;
  WHEN 'deploy' THEN
    -- [DEPLOY3] Destino propio (planeta o luna): las naves se quedan aunque
    -- fleets.target_type no coincida con planets.planet_type.
    SELECT p.* INTO target_planet FROM planets p WHERE p.galaxy = fleet_record.target_galaxy AND p.solar_system = fleet_record.target_system AND p.position = fleet_record.target_position AND p.user_id = fleet_record.user_id ORDER BY (p.planet_type = COALESCE(fleet_record.target_type, 'planet')) DESC LIMIT 1;
    IF FOUND THEN
      FOR ship_record IN SELECT fs.ship_type_id, fs.quantity FROM fleet_ships fs WHERE fs.fleet_id = p_fleet_id LOOP
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity) VALUES (target_planet.id, ship_record.ship_type_id, ship_record.quantity) ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
      END LOOP;
      UPDATE planet_resources SET metal = metal + fleet_record.cargo_metal, crystal = crystal + fleet_record.cargo_crystal, deuterium = deuterium + fleet_record.cargo_deuterium WHERE planet_id = target_planet.id;
      DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
      UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    ELSE
      -- [DEPOSITO ALIANZA] Planeta o luna de OTRO jugador: la flota queda
      -- ESTACIONADA defendiendo (is_completed = false, is_returning = false).
      -- Sus naves siguen en fleet_ships, que es lo que lee perform_combat para
      -- sumarlas a la defensa y aplicarles las bajas del reporte de batalla.
      -- Los recursos NO se descargan en el planeta aliado: viajan con la flota
      -- y regresan al origen cuando su duenno la retira.
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
        AND p.solar_system = fleet_record.target_system
        AND p.position = fleet_record.target_position
        AND p.planet_type = COALESCE(fleet_record.target_type, 'planet')
        AND p.user_id IS NOT NULL
        AND p.user_id <> fleet_record.user_id;

      IF NOT FOUND THEN
        -- Destino inexistente o abandonado: la flota vuelve a casa.
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;
    END IF;
  WHEN 'recycle' THEN
    DECLARE
      debris RECORD;
      recycler_capacity NUMERIC;
      collected_metal NUMERIC;
      collected_crystal NUMERIC;
    BEGIN
      SELECT * INTO debris FROM debris_fields WHERE galaxy = fleet_record.target_galaxy AND solar_system = fleet_record.target_system AND position = fleet_record.target_position;
      IF FOUND AND (debris.metal > 0 OR debris.crystal > 0) THEN
        SELECT COALESCE(SUM(fs.quantity::numeric * st.cargo_capacity), 0) INTO recycler_capacity FROM fleet_ships fs JOIN ship_types st ON fs.ship_type_id = st.id WHERE fs.fleet_id = p_fleet_id AND st.code IN ('recycler', 'mega_recycler');
        collected_metal := LEAST(debris.metal, floor(recycler_capacity / 2));
        collected_crystal := LEAST(debris.crystal, floor(recycler_capacity / 2));
        UPDATE debris_fields SET metal = metal - collected_metal, crystal = crystal - collected_crystal, updated_at = NOW() WHERE id = debris.id;
        DELETE FROM debris_fields WHERE id = debris.id AND metal <= 0 AND crystal <= 0;
        UPDATE fleets SET cargo_metal = cargo_metal + collected_metal, cargo_crystal = cargo_crystal + collected_crystal, is_returning = true WHERE id = p_fleet_id;
        INSERT INTO messages (recipient_id, sender_id, subject, body, message_type, created_at)
        VALUES (fleet_record.user_id, NULL, 'Informe de Reciclaje',
          'Tus Recicladores llegaron al campo de escombros en [' || fleet_record.target_galaxy || ':' || fleet_record.target_system || ':' || fleet_record.target_position || '] y recolectaron ' || floor(collected_metal) || ' Metal y ' || floor(collected_crystal) || ' Cristal. La flota regresa con el cargamento.', 'system', now());
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
        INSERT INTO messages (recipient_id, sender_id, subject, body, message_type, created_at)
        VALUES (fleet_record.user_id, NULL, 'Informe de Reciclaje',
          'Tus Recicladores llegaron al campo de escombros en [' || fleet_record.target_galaxy || ':' || fleet_record.target_system || ':' || fleet_record.target_position || '] pero no habia escombros que recolectar. La flota regresa vacia.', 'system', now());
      END IF;
    END;
  WHEN 'expedition' THEN
    PERFORM process_expedition(p_fleet_id);
  WHEN 'colonize' THEN
    SELECT p.* INTO target_planet FROM planets p WHERE p.galaxy = fleet_record.target_galaxy AND p.solar_system = fleet_record.target_system AND p.position = fleet_record.target_position;
    IF NOT FOUND THEN
    DECLARE
    colony_ship_type_id INTEGER;
    has_colony_ship BOOLEAN;
    new_planet_id uuid;
    v_colony_ship_quantity INTEGER;
    v_cargo_metal NUMERIC;
    v_cargo_crystal NUMERIC;
    v_cargo_deuterium NUMERIC;
    v_remaining_ships INTEGER;
    v_current_colonies INTEGER;
    v_astrophysics_level INTEGER;
    v_max_colonies INTEGER;
    BEGIN
    SELECT COUNT(*) INTO v_current_colonies FROM planets WHERE user_id = fleet_record.user_id AND NOT is_destroyed AND planet_type = 'planet';
    SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = fleet_record.user_id AND tt.code = 'astrophysics';
    v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);
    IF v_current_colonies >= v_max_colonies THEN
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      RETURN;
    END IF;
    SELECT id INTO colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';
    SELECT quantity INTO v_colony_ship_quantity FROM fleet_ships WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
    has_colony_ship := COALESCE(v_colony_ship_quantity, 0) > 0; IF public._sports_is_location(fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position) THEN has_colony_ship := false; END IF; /* [SPORTS1] */ IF public._battleship_is_location(fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position) THEN has_colony_ship := false; END IF; /* [BATTLESHIP1] */ IF fleet_record.target_system = 250 AND ((fleet_record.target_position = 8 AND EXISTS (SELECT 1 FROM alliance_fortresses af WHERE af.galaxy = fleet_record.target_galaxy)) OR (fleet_record.target_position = 9 AND EXISTS (SELECT 1 FROM treasure_planets tp WHERE tp.galaxy = fleet_record.target_galaxy))) THEN has_colony_ship := false; END IF; /* [FORTCOL1] */ IF public._is_reserved_location(fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position) THEN has_colony_ship := false; END IF; /* [FORTCOL2] */
    IF has_colony_ship THEN
    v_cargo_metal := COALESCE(fleet_record.cargo_metal, 0);
    v_cargo_crystal := COALESCE(fleet_record.cargo_crystal, 0);
    v_cargo_deuterium := COALESCE(fleet_record.cargo_deuterium, 0);
    INSERT INTO planets (user_id, name, galaxy, solar_system, position, planet_type, is_main_planet, diameter, fields_max, temp_min, temp_max)
    VALUES (fleet_record.user_id, 'Colonia', fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
    'planet', false, 12800 + floor(random() * 5000)::integer, 163 + floor(random() * 50)::integer,
    -20 + floor(random() * 40)::integer, 20 + floor(random() * 60)::integer)
    RETURNING id INTO new_planet_id;
    INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, metal_per_hour, crystal_per_hour, deuterium_per_hour)
    VALUES (new_planet_id, 500 + v_cargo_metal, 500 + v_cargo_crystal, v_cargo_deuterium, 30, 15, 0);
    IF v_colony_ship_quantity = 1 THEN
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
    ELSE
    UPDATE fleet_ships SET quantity = quantity - 1 WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
    END IF;
    UPDATE fleets SET cargo_metal = 0, cargo_crystal = 0, cargo_deuterium = 0 WHERE id = p_fleet_id;
    v_colonization_success := true;
    SELECT COALESCE(SUM(quantity), 0) INTO v_remaining_ships FROM fleet_ships WHERE fleet_id = p_fleet_id;
    IF v_remaining_ships > 0 THEN /* [COLOSTAY1] naves restantes se quedan en la nueva colonia */
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity) SELECT new_planet_id, fs.ship_type_id, fs.quantity FROM fleet_ships fs WHERE fs.fleet_id = p_fleet_id AND fs.quantity > 0 ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
    END IF;
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    END IF;
    END;
    END IF;
    IF NOT v_colonization_success THEN
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    END IF;
  WHEN 'attack' THEN
    IF public._occ_recovery_arrival(p_fleet_id) THEN RETURN; END IF; /* [OCUPA1-pfa1] */
    SELECT p.* INTO target_planet FROM planets p WHERE p.galaxy = fleet_record.target_galaxy AND p.solar_system = fleet_record.target_system AND p.position = fleet_record.target_position AND p.planet_type = COALESCE(fleet_record.target_type, 'planet');
    IF FOUND AND target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
      combat_result := perform_combat(p_fleet_id, target_planet.id);
      v_attacker_units_report := format_unit_report(combat_result->'initial_attacker', combat_result->'attacker_remaining', 'attacker');
      v_defender_units_report := format_unit_report(combat_result->'initial_defender', combat_result->'defender_remaining', 'defender');
      IF (combat_result->>'result') = 'attacker_won' THEN
        SELECT COALESCE(SUM((unit->>'quantity')::integer * (SELECT cargo_capacity FROM ship_types WHERE id = (unit->>'type_id')::integer)), 0) INTO total_cargo_capacity FROM jsonb_array_elements(combat_result->'attacker_remaining') AS unit WHERE (unit->>'quantity')::integer > 0;
        DECLARE v_avail_m NUMERIC; v_avail_c NUMERIC; v_avail_d NUMERIC; v_rem NUMERIC; BEGIN SELECT GREATEST(0, COALESCE(metal, 0)), GREATEST(0, COALESCE(crystal, 0)), GREATEST(0, COALESCE(deuterium, 0)) INTO v_avail_m, v_avail_c, v_avail_d FROM planet_resources WHERE planet_id = target_planet.id; loot_metal := LEAST(v_avail_m, FLOOR(total_cargo_capacity::numeric / 3)); loot_crystal := LEAST(v_avail_c, FLOOR(total_cargo_capacity::numeric / 3)); loot_deuterium := LEAST(v_avail_d, FLOOR(total_cargo_capacity::numeric / 3)); v_rem := total_cargo_capacity - (loot_metal + loot_crystal + loot_deuterium); IF v_rem > 0 THEN loot_metal := loot_metal + LEAST(v_avail_m - loot_metal, v_rem); v_rem := total_cargo_capacity - (loot_metal + loot_crystal + loot_deuterium); END IF; IF v_rem > 0 THEN loot_crystal := loot_crystal + LEAST(v_avail_c - loot_crystal, v_rem); v_rem := total_cargo_capacity - (loot_metal + loot_crystal + loot_deuterium); END IF; IF v_rem > 0 THEN loot_deuterium := loot_deuterium + LEAST(v_avail_d - loot_deuterium, v_rem); END IF; END;
        UPDATE planet_resources SET metal = GREATEST(0, metal - loot_metal), crystal = GREATEST(0, crystal - loot_crystal), deuterium = GREATEST(0, deuterium - loot_deuterium) WHERE planet_id = target_planet.id;
        UPDATE fleets SET cargo_metal = cargo_metal + loot_metal, cargo_crystal = cargo_crystal + loot_crystal, cargo_deuterium = cargo_deuterium + loot_deuterium WHERE id = p_fleet_id;
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'attacker_remaining') LOOP IF (v_unit->>'quantity')::integer > 0 THEN INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer); END IF; END LOOP;
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP IF NOT (v_unit->>'is_defense')::boolean THEN IF COALESCE(v_unit->>'source','planet') = 'planet' THEN UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; ELSIF (v_unit->>'source') NOT IN ('planet','defense') THEN /* [FLOTAS v17] quantity=0 viola fleet_ships_quantity_check y dejaba la flota atascada: si la pila queda vacia se borra la fila */ IF (v_unit->>'quantity')::integer > 0 THEN UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer; ELSE DELETE FROM fleet_ships WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer; END IF; END IF; END IF; END LOOP;
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP DECLARE v_dq INTEGER := (v_unit->>'quantity')::integer; v_rq INTEGER := 0; v_i INTEGER; BEGIN FOR v_i IN 1..v_dq LOOP IF random() < 0.7 THEN v_rq := v_rq + 1; END IF; END LOOP; UPDATE planet_defenses SET quantity = GREATEST(0, quantity - v_dq + v_rq) WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer; END; END LOOP;
        UPDATE profiles SET battles_won = battles_won + 1, units_destroyed = units_destroyed + COALESCE((combat_result->>'defender_losses_metal')::bigint / 1000, 0) WHERE id = fleet_record.user_id;
        UPDATE profiles SET battles_lost = battles_lost + 1, units_lost = units_lost + COALESCE((combat_result->>'defender_losses_metal')::bigint / 1000, 0) WHERE id = target_planet.user_id;
        -- Anti-farmeo: cuando el atacante GANA (destruye toda la flota y defensa,
        -- o el planeta estaba sin defensa), SIEMPRE se dana un edificio para forzar
        -- a los jugadores a defender sus planetas.
        v_building_damage := apply_attack_building_damage(target_planet.id);
        IF v_building_damage IS NOT NULL AND (v_building_damage->>'damaged')::boolean THEN
          v_bdmg_note := chr(10) || chr(10) || 'Daño estructural: ' || (v_building_damage->>'building_name') || ' del planeta ' || target_planet.name || ' bajó al nivel ' || (v_building_damage->>'new_level') || '.';
        END IF;
      ELSIF (combat_result->>'result') = 'defender_won' THEN
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP IF (v_unit->>'is_defense')::boolean THEN UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer; ELSIF COALESCE(v_unit->>'source','planet') = 'planet' THEN UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; ELSIF (v_unit->>'source') NOT IN ('planet','defense') THEN /* [FLOTAS v17] quantity=0 viola fleet_ships_quantity_check y dejaba la flota atascada: si la pila queda vacia se borra la fila */ IF (v_unit->>'quantity')::integer > 0 THEN UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer; ELSE DELETE FROM fleet_ships WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer; END IF; END IF; END LOOP;
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP DECLARE v_dq INTEGER := (v_unit->>'quantity')::integer; v_rq INTEGER := 0; v_i INTEGER; BEGIN FOR v_i IN 1..v_dq LOOP IF random() < 0.7 THEN v_rq := v_rq + 1; END IF; END LOOP; UPDATE planet_defenses SET quantity = quantity + v_rq WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer; END; END LOOP;
        UPDATE profiles SET battles_lost = battles_lost + 1 WHERE id = fleet_record.user_id;
        UPDATE profiles SET battles_won = battles_won + 1 WHERE id = target_planet.user_id;
        loot_metal := 0; loot_crystal := 0; loot_deuterium := 0;
      ELSE
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'attacker_remaining') LOOP IF (v_unit->>'quantity')::integer > 0 THEN INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer); END IF; END LOOP;
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP IF (v_unit->>'is_defense')::boolean THEN UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer; ELSIF COALESCE(v_unit->>'source','planet') = 'planet' THEN UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; ELSIF (v_unit->>'source') NOT IN ('planet','defense') THEN /* [FLOTAS v17] quantity=0 viola fleet_ships_quantity_check y dejaba la flota atascada: si la pila queda vacia se borra la fila */ IF (v_unit->>'quantity')::integer > 0 THEN UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer; ELSE DELETE FROM fleet_ships WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer; END IF; END IF; END LOOP;
        UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = fleet_record.user_id;
        UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = target_planet.user_id;
        loot_metal := 0; loot_crystal := 0; loot_deuterium := 0;
      END IF;
      DELETE FROM fleet_ships WHERE quantity <= 0 AND fleet_id IN (SELECT (u->>'source')::uuid FROM jsonb_array_elements(combat_result->'defender_remaining') u WHERE (u->>'source') NOT IN ('planet','defense'));
      UPDATE fleets SET is_completed = true WHERE mission_type = 'deploy' AND is_completed = false AND id IN (SELECT (u->>'source')::uuid FROM jsonb_array_elements(combat_result->'defender_remaining') u WHERE (u->>'source') NOT IN ('planet','defense')) AND NOT EXISTS (SELECT 1 FROM fleet_ships fs WHERE fs.fleet_id = fleets.id AND fs.quantity > 0);
      v_debris_metal := COALESCE((combat_result->>'debris_metal')::numeric, 0);
      v_debris_crystal := COALESCE((combat_result->>'debris_crystal')::numeric, 0);
      IF v_debris_metal > 0 OR v_debris_crystal > 0 THEN
        INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal) VALUES (fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, v_debris_metal, v_debris_crystal) ON CONFLICT (galaxy, solar_system, position) DO UPDATE SET metal = debris_fields.metal + EXCLUDED.metal, crystal = debris_fields.crystal + EXCLUDED.crystal, updated_at = NOW();
        UPDATE profiles SET debris_metal_total = debris_metal_total + v_debris_metal, debris_crystal_total = debris_crystal_total + v_debris_crystal WHERE id = fleet_record.user_id;
      END IF;
      -- Formacion de luna a partir del campo de escombros (ya existia en la BD, ahora si se invoca)
      BEGIN
        v_moon_result := check_moon_creation(fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, COALESCE(v_debris_metal, 0), COALESCE(v_debris_crystal, 0));
      EXCEPTION WHEN OTHERS THEN
        v_moon_result := NULL;
      END;
      -- Log battle report so the destruction ranking (get_destruction_ranking) can compute points
      INSERT INTO battle_reports (attacker_id, defender_id, planet_id, coordinates, result, rounds, debris_metal, debris_crystal, loot_metal, loot_crystal, loot_deuterium, report_data, battle_type, galaxy, solar_system, position, created_at)
      VALUES (fleet_record.user_id, target_planet.user_id, target_planet.id, fleet_record.target_galaxy || ':' || fleet_record.target_system || ':' || fleet_record.target_position, combat_result->>'result', COALESCE((combat_result->>'rounds')::integer, 0), v_debris_metal, v_debris_crystal, COALESCE(loot_metal, 0), COALESCE(loot_crystal, 0), COALESCE(loot_deuterium, 0), combat_result, 'attack', fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, now());
      v_atk_name := COALESCE((SELECT pr.username FROM profiles pr WHERE pr.id = fleet_record.user_id), 'Desconocido');
      v_def_name := COALESCE((SELECT pr.username FROM profiles pr WHERE pr.id = target_planet.user_id), 'Desconocido');
      v_atk_origin := COALESCE((SELECT op.galaxy || ':' || op.solar_system || ':' || op.position FROM planets op WHERE op.id = fleet_record.origin_planet_id), '?:?:?');
      v_battle_report := jsonb_build_object(
        'version', 2,
        'battle_type', 'attack',
        'attacker', v_atk_name,
        'defender', v_def_name,
        'planet_name', target_planet.name,
        'target_type', COALESCE(fleet_record.target_type, 'planet'),
        'attacker_origin', v_atk_origin,
        'coordinates', fleet_record.target_galaxy || ':' || fleet_record.target_system || ':' || fleet_record.target_position,
        'result', combat_result->>'result',
        'rounds', COALESCE((combat_result->>'rounds')::integer, 0),
        'rounds_data', COALESCE(combat_result->'rounds_data', '[]'::jsonb),
        'attacker_ships', battle_units_diff(combat_result->'initial_attacker', combat_result->'attacker_remaining', 'ships'),
        'defender_ships', battle_units_diff(combat_result->'initial_defender', combat_result->'defender_remaining', 'ships'),
        'defender_defenses', battle_units_diff(combat_result->'initial_defender', combat_result->'defender_remaining', 'defenses'),
        'attacker_losses', jsonb_build_object('metal', FLOOR(COALESCE((combat_result->>'attacker_losses_metal')::numeric, 0)), 'crystal', FLOOR(COALESCE((combat_result->>'attacker_losses_crystal')::numeric, 0))),
        'defender_losses', jsonb_build_object('metal', FLOOR(COALESCE((combat_result->>'defender_losses_metal')::numeric, 0)), 'crystal', FLOOR(COALESCE((combat_result->>'defender_losses_crystal')::numeric, 0))),
        'debris', jsonb_build_object('metal', FLOOR(COALESCE(v_debris_metal, 0)), 'crystal', FLOOR(COALESCE(v_debris_crystal, 0))),
        'loot', jsonb_build_object('metal', FLOOR(COALESCE(loot_metal, 0)), 'crystal', FLOOR(COALESCE(loot_crystal, 0)), 'deuterium', FLOOR(COALESCE(loot_deuterium, 0))),
        'moon', COALESCE(v_moon_result, jsonb_build_object('moon_created', false, 'moon_chance', 0)),
        'building_damage', v_building_damage
      );
      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) VALUES (NULL, fleet_record.user_id, format('Reporte de Combate - %s', CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'Victoria' WHEN 'defender_won' THEN 'Derrota' ELSE 'Empate' END), (v_battle_report || jsonb_build_object('perspective', 'attacker'))::text, 'battle');
      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) VALUES (NULL, target_planet.user_id, format('Tu planeta %s fue atacado - %s', target_planet.name, CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'Derrota' WHEN 'defender_won' THEN 'Victoria' ELSE 'Empate' END), (v_battle_report || jsonb_build_object('perspective', 'defender'))::text, 'battle');
      -- [DEPOSITO ALIANZA] Copia del reporte para los aliados cuyas flotas
      -- estacionadas participaron en la defensa del planeta.
      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
      SELECT NULL,
             f.user_id,
             format('Tu flota defendio %s - %s', target_planet.name,
               CASE (combat_result->>'result')
                 WHEN 'attacker_won' THEN 'Derrota'
                 WHEN 'defender_won' THEN 'Victoria'
                 ELSE 'Empate' END),
             (v_battle_report || jsonb_build_object('perspective', 'defender'))::text,
             'battle'
      FROM fleets f
      WHERE f.id IN (
              SELECT DISTINCT (u->>'source')::uuid
              FROM jsonb_array_elements(combat_result->'defender_remaining') u
              WHERE (u->>'source') NOT IN ('planet', 'defense')
            )
        AND f.user_id <> target_planet.user_id
        AND f.user_id <> fleet_record.user_id
      GROUP BY f.user_id;
      IF (combat_result->>'result') = 'attacker_won' AND public._occ_try_start(p_fleet_id, target_planet.id, loot_metal, loot_crystal, loot_deuterium) THEN RETURN; END IF; /* [OCUPA1-pfa2] */
      IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      ELSE
        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
      END IF;
    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    END IF;
  ELSE
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END CASE;
END;
$function$

