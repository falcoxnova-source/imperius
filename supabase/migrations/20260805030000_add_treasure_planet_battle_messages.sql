-- ============================================================================
-- FIX: Treasure Planet combat did not generate any inbox message/report
-- ============================================================================
-- Bug reported by user: attacking the Treasure Planet resolved combat and
-- logged a row to battle_reports (battle_type='treasure_planet', used only
-- for rankings/Top Battles), but NEVER inserted into the `messages` table.
-- Normal planet attacks (process_fleet_arrival WHEN 'attack') and this same
-- function already insert `messages` (message_type='battle') for both sides,
-- which is what actually triggers:
--   - the in-app toast notification (NotificationToast component)
--   - the entry the player sees in /game/messages (MessagesPage, "battle" tab)
--
-- This migration adds the missing messages inserts to
-- resolve_treasure_planet_attack, mirroring the exact same message format
-- used for normal planet attacks (format_unit_report for per-unit breakdown).
-- The attacker always gets a personal report; every member of the DEFENDING
-- alliance gets a report too (since the Treasure Planet is owned collectively
-- by an alliance, not a single player/planet like Fortress or normal planets).
--
-- Zero changes to: combat resolution logic, ownership/capture logic,
-- resource/debris handling, battle_reports inserts, or the Fortress function
-- (resolve_fortress_attack is untouched and still does not send messages,
-- intentionally out of scope for this fix).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_treasure_planet_attack(p_galaxy integer, p_attacker_id uuid, p_attacker_alliance_id uuid, p_attacker_ships jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_planet record; v_combat_result jsonb; v_winner text; v_ship record;
  v_attacker_units jsonb := '[]'::jsonb; v_defender_units jsonb := '[]'::jsonb;
  v_weapon_bonus numeric; v_shield_bonus numeric; v_hull_bonus numeric; v_st record;
  v_debris_metal numeric := 0; v_debris_crystal numeric := 0;
  v_defender_alliance_id uuid; v_attacker_alliance_name text; v_defender_alliance_name text;
  v_can_claim boolean;
  v_member_id uuid;
  v_attacker_name text;
BEGIN
  v_can_claim := p_attacker_alliance_id IS NOT NULL;

  SELECT * INTO v_planet FROM treasure_planets WHERE galaxy = p_galaxy;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Planeta del Tesoro no encontrado'); END IF;

  SELECT COALESCE(name,'Desconocida') INTO v_attacker_alliance_name FROM alliances WHERE id = p_attacker_alliance_id;
  SELECT COALESCE(name,'Sin Alianza') INTO v_defender_alliance_name FROM alliances WHERE id = v_planet.owner_alliance_id;
  SELECT COALESCE(username,'Desconocido') INTO v_attacker_name FROM profiles WHERE id = p_attacker_id;
  v_defender_alliance_id := v_planet.owner_alliance_id;

  SELECT COALESCE((SELECT ut.level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id=tt.id WHERE ut.user_id=p_attacker_id AND tt.code='weapons_tech'),0),
         COALESCE((SELECT ut.level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id=tt.id WHERE ut.user_id=p_attacker_id AND tt.code='shielding_tech'),0),
         COALESCE((SELECT ut.level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id=tt.id WHERE ut.user_id=p_attacker_id AND tt.code='armour_tech'),0)
  INTO v_weapon_bonus, v_shield_bonus, v_hull_bonus;

  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_attacker_ships) AS x(ship_type_id integer, quantity integer) LOOP
    SELECT * INTO v_st FROM ship_types WHERE id=v_ship.ship_type_id;
    IF v_st IS NOT NULL AND v_ship.quantity>0 THEN
      v_attacker_units := v_attacker_units || jsonb_build_object('type_id',v_ship.ship_type_id,'code',v_st.code,'name',v_st.name,'quantity',v_ship.quantity,'weapon',FLOOR(v_st.weapon_power*(1+v_weapon_bonus*0.10)),'shield',FLOOR(v_st.shield_power*(1+v_shield_bonus*0.10)),'hull',FLOOR(v_st.structural_integrity*(1+v_hull_bonus*0.10)),'metal_cost',v_st.metal_cost,'crystal_cost',v_st.crystal_cost,'rapid_fire',v_st.rapid_fire,'is_defense',false);
    END IF;
  END LOOP;

  IF v_planet.owner_alliance_id IS NULL THEN
    IF v_can_claim THEN
      UPDATE treasure_planets SET owner_alliance_id=p_attacker_alliance_id, captured_at=now() WHERE id=v_planet.id;
      FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_attacker_ships) AS x(ship_type_id integer, quantity integer) LOOP
        IF v_ship.quantity>0 THEN INSERT INTO treasure_planet_ships(treasure_planet_id,user_id,alliance_id,ship_type_id,quantity) VALUES(v_planet.id,p_attacker_id,p_attacker_alliance_id,v_ship.ship_type_id,v_ship.quantity); END IF;
      END LOOP;
    END IF;
    v_combat_result := jsonb_build_object('result','attacker_won','rounds',0,'rounds_data','[]'::jsonb,'attacker_initial',v_attacker_units,'defender_initial','[]'::jsonb,'attacker_remaining',v_attacker_units,'defender_remaining','[]'::jsonb,'attacker_losses_metal',0,'attacker_losses_crystal',0,'defender_losses_metal',0,'defender_losses_crystal',0,'debris_metal',0,'debris_crystal',0);
    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) VALUES (
      NULL, p_attacker_id,
      CASE WHEN v_can_claim THEN 'Reporte de Combate - Planeta del Tesoro Capturado' ELSE 'Reporte de Combate - Planeta del Tesoro' END,
      format(E'Planeta del Tesoro [%s:%s:%s]\n%s',
        v_planet.galaxy, v_planet.system, v_planet.position,
        CASE WHEN v_can_claim THEN 'El planeta no tenia dueno y fue capturado sin resistencia por tu alianza.' ELSE 'El planeta no tenia dueno y fue tomado, pero necesitas pertenecer a una alianza para reclamarlo.' END),
      'battle'
    );
    RETURN jsonb_build_object('success',true,'result',CASE WHEN v_can_claim THEN 'captured' ELSE 'won_no_claim' END,'combat',v_combat_result,'message',CASE WHEN v_can_claim THEN 'Planeta del Tesoro capturado sin resistencia.' ELSE 'Victoria! Pero necesitas una alianza para reclamar el planeta.' END);
  END IF;

  IF v_planet.owner_alliance_id = p_attacker_alliance_id THEN RETURN jsonb_build_object('success',false,'error','No puedes atacar tu propio Planeta del Tesoro'); END IF;

  FOR v_ship IN SELECT tps.ship_type_id, SUM(tps.quantity) as total_qty FROM treasure_planet_ships tps WHERE tps.treasure_planet_id=v_planet.id GROUP BY tps.ship_type_id LOOP
    SELECT * INTO v_st FROM ship_types WHERE id=v_ship.ship_type_id;
    IF v_st IS NOT NULL AND v_ship.total_qty>0 THEN v_defender_units:=v_defender_units||jsonb_build_object('type_id',v_ship.ship_type_id,'code',v_st.code,'name',v_st.name,'quantity',v_ship.total_qty,'weapon',v_st.weapon_power,'shield',v_st.shield_power,'hull',v_st.structural_integrity,'metal_cost',v_st.metal_cost,'crystal_cost',v_st.crystal_cost,'rapid_fire',v_st.rapid_fire,'is_defense',false); END IF;
  END LOOP;

  v_combat_result:=simulate_xnova_combat(v_attacker_units,v_defender_units); v_winner:=v_combat_result->>'result';
  v_combat_result:=v_combat_result||jsonb_build_object('attacker_initial',v_attacker_units)||jsonb_build_object('defender_initial',v_defender_units);

  v_debris_metal:=COALESCE((v_combat_result->>'debris_metal')::numeric,0); v_debris_crystal:=COALESCE((v_combat_result->>'debris_crystal')::numeric,0);
  IF v_debris_metal>0 OR v_debris_crystal>0 THEN INSERT INTO debris_fields(galaxy,solar_system,position,metal,crystal,created_at,updated_at) VALUES(v_planet.galaxy,v_planet.system,v_planet.position,v_debris_metal,v_debris_crystal,now(),now()) ON CONFLICT(galaxy,solar_system,position) DO UPDATE SET metal=debris_fields.metal+EXCLUDED.metal,crystal=debris_fields.crystal+EXCLUDED.crystal,updated_at=now(); END IF;

  IF v_winner='attacker_won' THEN
    DELETE FROM treasure_planet_ships WHERE treasure_planet_id=v_planet.id;
    IF v_can_claim AND v_combat_result->'attacker_remaining' IS NOT NULL THEN
      FOR v_ship IN SELECT * FROM jsonb_to_recordset(v_combat_result->'attacker_remaining') AS x(type_id integer, quantity integer) LOOP
        IF v_ship.quantity>0 THEN INSERT INTO treasure_planet_ships(treasure_planet_id,user_id,alliance_id,ship_type_id,quantity) VALUES(v_planet.id,p_attacker_id,p_attacker_alliance_id,v_ship.type_id,v_ship.quantity); END IF;
      END LOOP;
    END IF;
    IF v_can_claim THEN UPDATE treasure_planets SET owner_alliance_id=p_attacker_alliance_id,captured_at=now() WHERE id=v_planet.id; END IF;
    INSERT INTO battle_reports(attacker_id,defender_id,coordinates,battle_type,result,rounds,attacker_losses_metal,attacker_losses_crystal,defender_losses_metal,defender_losses_crystal,debris_metal,debris_crystal,galaxy,solar_system,position,report_data,created_at) VALUES(p_attacker_id,(SELECT leader_id FROM alliances WHERE id=v_defender_alliance_id),'[' || v_planet.galaxy || ':' || v_planet.system || ':' || v_planet.position || ']','treasure_planet','attacker_won',COALESCE(jsonb_array_length(v_combat_result->'rounds_data'), 0),COALESCE((v_combat_result->>'attacker_losses_metal')::numeric,0),COALESCE((v_combat_result->>'attacker_losses_crystal')::numeric,0),COALESCE((v_combat_result->>'defender_losses_metal')::numeric,0),COALESCE((v_combat_result->>'defender_losses_crystal')::numeric,0),v_debris_metal,v_debris_crystal,v_planet.galaxy,v_planet.system,v_planet.position,jsonb_build_object('battle_type','treasure_planet','attacker_alliance',v_attacker_alliance_name,'defender_alliance',v_defender_alliance_name,'rounds_data',v_combat_result->'rounds_data','attacker_initial',v_attacker_units,'defender_initial',v_defender_units,'attacker_remaining',v_combat_result->'attacker_remaining','defender_remaining','[]'::jsonb),now());
    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) VALUES (
      NULL, p_attacker_id,
      CASE WHEN v_can_claim THEN 'Reporte de Combate - Planeta del Tesoro Capturado!' ELSE 'Reporte de Combate - Victoria en Planeta del Tesoro' END,
      format(E'Combate en Planeta del Tesoro [%s:%s:%s]\nResultado: VICTORIA\nRondas: %s\n=== TUS FUERZAS ===\n%s\n=== FUERZAS DEFENSORAS (%s) ===\n%s\nEscombros generados: %s Metal, %s Cristal\n\n%s',
        v_planet.galaxy, v_planet.system, v_planet.position,
        COALESCE(jsonb_array_length(v_combat_result->'rounds_data'), 0),
        format_unit_report(v_attacker_units, v_combat_result->'attacker_remaining', 'attacker'),
        v_defender_alliance_name,
        format_unit_report(v_defender_units, '[]'::jsonb, 'defender'),
        floor(v_debris_metal), floor(v_debris_crystal),
        CASE WHEN v_can_claim THEN 'Tu alianza ahora controla el Planeta del Tesoro.' ELSE 'Necesitas pertenecer a una alianza para reclamar el planeta.' END),
      'battle'
    );
    IF v_defender_alliance_id IS NOT NULL THEN
      FOR v_member_id IN SELECT user_id FROM alliance_members WHERE alliance_id = v_defender_alliance_id LOOP
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) VALUES (
          NULL, v_member_id,
          'Tu Planeta del Tesoro fue atacado - Derrota',
          format(E'El Planeta del Tesoro [%s:%s:%s] de tu alianza fue atacado por %s (%s).\nResultado: DERROTA\nRondas: %s\n=== TUS FUERZAS DEFENSORAS ===\n%s\n=== FUERZAS ATACANTES ===\n%s\nEscombros generados: %s Metal, %s Cristal\n\nEl planeta ha sido capturado por la alianza enemiga.',
            v_planet.galaxy, v_planet.system, v_planet.position, v_attacker_name, v_attacker_alliance_name,
            COALESCE(jsonb_array_length(v_combat_result->'rounds_data'), 0),
            format_unit_report(v_defender_units, '[]'::jsonb, 'defender'),
            format_unit_report(v_attacker_units, v_combat_result->'attacker_remaining', 'attacker'),
            floor(v_debris_metal), floor(v_debris_crystal)),
          'battle'
        );
      END LOOP;
    END IF;
    RETURN jsonb_build_object('success',true,'result',CASE WHEN v_can_claim THEN 'captured' ELSE 'won_no_claim' END,'combat',v_combat_result,'message',CASE WHEN v_can_claim THEN 'Planeta del Tesoro capturado!' ELSE 'Victoria! Pero necesitas una alianza para reclamar el planeta.' END);
  END IF;

  INSERT INTO battle_reports(attacker_id,defender_id,coordinates,battle_type,result,rounds,attacker_losses_metal,attacker_losses_crystal,defender_losses_metal,defender_losses_crystal,debris_metal,debris_crystal,galaxy,solar_system,position,report_data,created_at) VALUES(p_attacker_id,(SELECT leader_id FROM alliances WHERE id=v_defender_alliance_id),'[' || v_planet.galaxy || ':' || v_planet.system || ':' || v_planet.position || ']','treasure_planet',v_winner,COALESCE(jsonb_array_length(v_combat_result->'rounds_data'), 0),COALESCE((v_combat_result->>'attacker_losses_metal')::numeric,0),COALESCE((v_combat_result->>'attacker_losses_crystal')::numeric,0),COALESCE((v_combat_result->>'defender_losses_metal')::numeric,0),COALESCE((v_combat_result->>'defender_losses_crystal')::numeric,0),v_debris_metal,v_debris_crystal,v_planet.galaxy,v_planet.system,v_planet.position,jsonb_build_object('battle_type','treasure_planet','attacker_alliance',v_attacker_alliance_name,'defender_alliance',v_defender_alliance_name,'rounds_data',v_combat_result->'rounds_data','attacker_initial',v_attacker_units,'defender_initial',v_defender_units,'attacker_remaining',v_combat_result->'attacker_remaining','defender_remaining',v_combat_result->'defender_remaining'),now());
  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) VALUES (
    NULL, p_attacker_id,
    format('Reporte de Combate - Planeta del Tesoro - %s', CASE WHEN v_winner='defender_won' THEN 'Derrota' ELSE 'Empate' END),
    format(E'Combate en Planeta del Tesoro [%s:%s:%s]\nResultado: %s\nRondas: %s\n=== TUS FUERZAS ===\n%s\n=== FUERZAS DEFENSORAS (%s) ===\n%s',
      v_planet.galaxy, v_planet.system, v_planet.position,
      CASE WHEN v_winner='defender_won' THEN 'DERROTA' ELSE 'EMPATE' END,
      COALESCE(jsonb_array_length(v_combat_result->'rounds_data'), 0),
      format_unit_report(v_attacker_units, v_combat_result->'attacker_remaining', 'attacker'),
      v_defender_alliance_name,
      format_unit_report(v_defender_units, v_combat_result->'defender_remaining', 'defender')),
    'battle'
  );
  IF v_defender_alliance_id IS NOT NULL THEN
    FOR v_member_id IN SELECT user_id FROM alliance_members WHERE alliance_id = v_defender_alliance_id LOOP
      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) VALUES (
        NULL, v_member_id,
        format('Tu Planeta del Tesoro fue atacado - %s', CASE WHEN v_winner='defender_won' THEN 'Victoria' ELSE 'Empate' END),
        format(E'El Planeta del Tesoro [%s:%s:%s] de tu alianza fue atacado por %s (%s).\nResultado: %s\nRondas: %s\n=== TUS FUERZAS DEFENSORAS ===\n%s\n=== FUERZAS ATACANTES ===\n%s',
          v_planet.galaxy, v_planet.system, v_planet.position, v_attacker_name, v_attacker_alliance_name,
          CASE WHEN v_winner='defender_won' THEN 'VICTORIA' ELSE 'EMPATE' END,
          COALESCE(jsonb_array_length(v_combat_result->'rounds_data'), 0),
          format_unit_report(v_defender_units, v_combat_result->'defender_remaining', 'defender'),
          format_unit_report(v_attacker_units, v_combat_result->'attacker_remaining', 'attacker')),
        'battle'
      );
    END LOOP;
  END IF;
  RETURN jsonb_build_object('success',true,'result',CASE WHEN v_winner='defender_won' THEN 'defender_won' ELSE 'draw' END,'combat',v_combat_result,'message',CASE WHEN v_winner='defender_won' THEN 'El Planeta del Tesoro resistio el ataque' ELSE 'Empate tactico' END);
END;
$function$;
