CREATE OR REPLACE FUNCTION public.simulate_xnova_combat(p_attackers jsonb, p_defenders jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_round integer := 0;
  v_max_rounds integer := 6;
  v_attacker_units jsonb;
  v_defender_units jsonb;
  v_result text := 'draw';
  v_attacker_losses_metal numeric := 0;
  v_attacker_losses_crystal numeric := 0;
  v_defender_fleet_losses_metal numeric := 0;
  v_defender_fleet_losses_crystal numeric := 0;
  v_defender_defense_losses_metal numeric := 0;
  v_defender_defense_losses_crystal numeric := 0;
  v_defender_losses_metal numeric := 0;
  v_defender_losses_crystal numeric := 0;
  v_debris_metal numeric := 0;
  v_debris_crystal numeric := 0;
  v_rounds_data jsonb := '[]'::jsonb;
  v_destroyed_defenses jsonb := '[]'::jsonb;
  v_initial_attackers jsonb;
  v_initial_defenders jsonb;
  v_attacker_total_units integer;
  v_defender_total_units integer;
  v_unit jsonb;
  v_target jsonb;
  v_target_idx integer;
  v_damage numeric;
  v_shield_absorbed numeric;
  v_hull_damage numeric;
  v_i integer;
  v_j integer;
  v_k integer;
  v_unit_hull numeric;
  v_shield_per_unit numeric;
  v_shield_available numeric;
  v_rf_value integer;
  v_rf_continue boolean;
  v_rf_shots integer;
  v_target_qty integer;
  v_units_killed integer;
  v_hull_pool numeric;
  v_random_pick integer;
  v_cumulative integer;
  v_destroy_fraction numeric;
  v_alive_count integer;
  v_fleet_cdr numeric;
  v_defense_cdr numeric;
  v_rf_target_code text;
  v_attacker_power numeric := 0;
  v_defender_power numeric := 0;
BEGIN
  v_attacker_units := p_attackers;
  v_defender_units := p_defenders;
  v_initial_attackers := p_attackers;
  v_initial_defenders := p_defenders;

  FOR v_i IN 0..(jsonb_array_length(v_attacker_units) - 1) LOOP
    v_attacker_units := jsonb_set(v_attacker_units, ARRAY[v_i::text, 'hull_damage_pool'], to_jsonb(0::numeric));
  END LOOP;
  FOR v_i IN 0..(jsonb_array_length(v_defender_units) - 1) LOOP
    v_defender_units := jsonb_set(v_defender_units, ARRAY[v_i::text, 'hull_damage_pool'], to_jsonb(0::numeric));
  END LOOP;

  SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_defender_total_units
  FROM jsonb_array_elements(v_defender_units) u;

  IF v_defender_total_units = 0 THEN
    RETURN jsonb_build_object(
      'result', 'attacker_won',
      'rounds', 0,
      'rounds_data', '[]'::jsonb,
      'attacker_remaining', v_attacker_units,
      'defender_remaining', '[]'::jsonb,
      'debris_metal', 0,
      'debris_crystal', 0,
      'attacker_losses_metal', 0,
      'attacker_losses_crystal', 0,
      'defender_losses_metal', 0,
      'defender_losses_crystal', 0,
      'destroyed_defenses', '[]'::jsonb,
      'initial_attacker', v_initial_attackers,
      'initial_defender', v_initial_defenders
    );
  END IF;

  WHILE v_round < v_max_rounds LOOP
    v_round := v_round + 1;

    FOR v_i IN 0..(jsonb_array_length(v_attacker_units) - 1) LOOP
      v_attacker_units := jsonb_set(
        v_attacker_units,
        ARRAY[v_i::text, 'shield_pool'],
        to_jsonb(((v_attacker_units->v_i->>'shield')::numeric * (v_attacker_units->v_i->>'quantity')::integer)::numeric)
      );
    END LOOP;

    FOR v_i IN 0..(jsonb_array_length(v_defender_units) - 1) LOOP
      v_defender_units := jsonb_set(
        v_defender_units,
        ARRAY[v_i::text, 'shield_pool'],
        to_jsonb(((v_defender_units->v_i->>'shield')::numeric * (v_defender_units->v_i->>'quantity')::integer)::numeric)
      );
    END LOOP;

    SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_attacker_total_units
    FROM jsonb_array_elements(v_attacker_units) u;

    SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_defender_total_units
    FROM jsonb_array_elements(v_defender_units) u;

    IF v_attacker_total_units = 0 OR v_defender_total_units = 0 THEN
      EXIT;
    END IF;

    -- Attackers fire at defenders
    FOR v_i IN 0..(jsonb_array_length(v_attacker_units) - 1) LOOP
      v_unit := v_attacker_units->v_i;
      IF (v_unit->>'quantity')::integer <= 0 THEN CONTINUE; END IF;

      FOR v_k IN 1..(v_unit->>'quantity')::integer LOOP
        v_rf_continue := true;
        v_rf_shots := 0;
        v_rf_target_code := NULL;

        WHILE v_rf_continue LOOP
          v_rf_shots := v_rf_shots + 1;
          IF v_rf_shots > 100 THEN EXIT; END IF;

          IF v_rf_target_code IS NULL THEN
            -- Primer disparo: objetivo aleatorio entre todos los defensores vivos
            v_alive_count := 0;
            FOR v_j IN 0..(jsonb_array_length(v_defender_units) - 1) LOOP
              v_alive_count := v_alive_count + GREATEST(0, (v_defender_units->v_j->>'quantity')::integer);
            END LOOP;
            IF v_alive_count = 0 THEN EXIT; END IF;

            v_random_pick := FLOOR(random() * v_alive_count)::integer;
            v_cumulative := 0;
            v_target_idx := 0;
            FOR v_j IN 0..(jsonb_array_length(v_defender_units) - 1) LOOP
              v_target_qty := (v_defender_units->v_j->>'quantity')::integer;
              IF v_target_qty > 0 THEN
                v_cumulative := v_cumulative + v_target_qty;
                IF v_random_pick < v_cumulative THEN
                  v_target_idx := v_j;
                  EXIT;
                END IF;
              END IF;
            END LOOP;
            v_target := v_defender_units->v_target_idx;
            v_target_qty := (v_target->>'quantity')::integer;
            IF v_target_qty <= 0 THEN v_rf_continue := false; CONTINUE; END IF;
            v_rf_target_code := v_target->>'code';
          ELSE
            -- Disparos de fuego r??pido: solo a unidades del mismo tipo
            v_alive_count := 0;
            FOR v_j IN 0..(jsonb_array_length(v_defender_units) - 1) LOOP
              IF (v_defender_units->v_j->>'code') = v_rf_target_code THEN
                v_alive_count := v_alive_count + GREATEST(0, (v_defender_units->v_j->>'quantity')::integer);
              END IF;
            END LOOP;
            IF v_alive_count = 0 THEN EXIT; END IF;

            v_random_pick := FLOOR(random() * v_alive_count)::integer;
            v_cumulative := 0;
            v_target_idx := -1;
            FOR v_j IN 0..(jsonb_array_length(v_defender_units) - 1) LOOP
              IF (v_defender_units->v_j->>'code') = v_rf_target_code THEN
                v_target_qty := (v_defender_units->v_j->>'quantity')::integer;
                IF v_target_qty > 0 THEN
                  v_cumulative := v_cumulative + v_target_qty;
                  IF v_random_pick < v_cumulative THEN
                    v_target_idx := v_j;
                    EXIT;
                  END IF;
                END IF;
              END IF;
            END LOOP;
            IF v_target_idx = -1 THEN EXIT; END IF;
            v_target := v_defender_units->v_target_idx;
            v_target_qty := (v_target->>'quantity')::integer;
            IF v_target_qty <= 0 THEN v_rf_continue := false; CONTINUE; END IF;
          END IF;

          v_damage := (v_unit->>'weapon')::numeric;
          v_shield_per_unit := (v_target->>'shield')::numeric;

          IF v_shield_per_unit > 0 AND v_damage < v_shield_per_unit * 0.01 THEN
            NULL;
          ELSE
            v_shield_available := LEAST(v_shield_per_unit, GREATEST(0, (v_defender_units->v_target_idx->>'shield_pool')::numeric));
            v_shield_absorbed := LEAST(v_damage, v_shield_available);
            v_hull_damage := v_damage - v_shield_absorbed;

            IF v_shield_absorbed > 0 THEN
              v_defender_units := jsonb_set(v_defender_units, ARRAY[v_target_idx::text, 'shield_pool'],
                to_jsonb(GREATEST(0, (v_defender_units->v_target_idx->>'shield_pool')::numeric - v_shield_absorbed)));
            END IF;

            IF v_hull_damage > 0 THEN
              v_unit_hull := (v_target->>'hull')::numeric;
              v_hull_pool := (v_defender_units->v_target_idx->>'hull_damage_pool')::numeric + v_hull_damage;
              v_defender_units := jsonb_set(v_defender_units, ARRAY[v_target_idx::text, 'hull_damage_pool'], to_jsonb(v_hull_pool));

              IF v_unit_hull > 0 THEN
                v_units_killed := FLOOR(v_hull_pool / v_unit_hull)::integer;
                IF v_units_killed < v_target_qty THEN
                  v_destroy_fraction := (v_hull_pool - (v_units_killed::numeric * v_unit_hull)) / v_unit_hull;
                  IF v_destroy_fraction > 0.3 THEN
                    IF random() < v_destroy_fraction THEN v_units_killed := v_units_killed + 1; END IF;
                  END IF;
                END IF;
                v_units_killed := LEAST(v_units_killed, v_target_qty);

                IF v_units_killed > 0 THEN
                  v_defender_units := jsonb_set(v_defender_units, ARRAY[v_target_idx::text, 'quantity'], to_jsonb(v_target_qty - v_units_killed));
                  v_defender_units := jsonb_set(v_defender_units, ARRAY[v_target_idx::text, 'hull_damage_pool'],
                    to_jsonb(GREATEST(0, v_hull_pool - (v_units_killed::numeric * v_unit_hull))));
                  IF v_target_qty <= v_units_killed THEN
                    v_defender_units := jsonb_set(v_defender_units, ARRAY[v_target_idx::text, 'shield_pool'], to_jsonb(0::numeric));
                  END IF;

                  IF (v_target->>'is_defense')::boolean THEN
                    v_defender_defense_losses_metal := v_defender_defense_losses_metal + ((v_target->>'metal_cost')::numeric * v_units_killed);
                    v_defender_defense_losses_crystal := v_defender_defense_losses_crystal + ((v_target->>'crystal_cost')::numeric * v_units_killed);
                    v_destroyed_defenses := v_destroyed_defenses || jsonb_build_object(
                      'defense_type_id', (v_target->>'type_id')::integer,
                      'quantity', v_units_killed
                    );
                  ELSE
                    v_defender_fleet_losses_metal := v_defender_fleet_losses_metal + ((v_target->>'metal_cost')::numeric * v_units_killed);
                    v_defender_fleet_losses_crystal := v_defender_fleet_losses_crystal + ((v_target->>'crystal_cost')::numeric * v_units_killed);
                  END IF;
                END IF;
              END IF;
            END IF;
          END IF;

          v_rf_value := COALESCE((v_unit->'rapid_fire'->>((v_defender_units->v_target_idx->>'code')::text))::integer, 0);
          IF v_rf_value > 1 THEN
            IF random() < ((v_rf_value - 1.0) / v_rf_value) THEN v_rf_continue := true; ELSE v_rf_continue := false; END IF;
          ELSE
            v_rf_continue := false;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;

    -- Defenders fire at attackers
    FOR v_i IN 0..(jsonb_array_length(v_defender_units) - 1) LOOP
      v_unit := v_defender_units->v_i;
      IF (v_unit->>'quantity')::integer <= 0 THEN CONTINUE; END IF;

      FOR v_k IN 1..(v_unit->>'quantity')::integer LOOP
        v_rf_continue := true;
        v_rf_shots := 0;
        v_rf_target_code := NULL;

        WHILE v_rf_continue LOOP
          v_rf_shots := v_rf_shots + 1;
          IF v_rf_shots > 100 THEN EXIT; END IF;

          IF v_rf_target_code IS NULL THEN
            -- Primer disparo: objetivo aleatorio entre todos los atacantes vivos
            v_alive_count := 0;
            FOR v_j IN 0..(jsonb_array_length(v_attacker_units) - 1) LOOP
              v_alive_count := v_alive_count + GREATEST(0, (v_attacker_units->v_j->>'quantity')::integer);
            END LOOP;
            IF v_alive_count = 0 THEN EXIT; END IF;

            v_random_pick := FLOOR(random() * v_alive_count)::integer;
            v_cumulative := 0;
            v_target_idx := 0;
            FOR v_j IN 0..(jsonb_array_length(v_attacker_units) - 1) LOOP
              v_target_qty := (v_attacker_units->v_j->>'quantity')::integer;
              IF v_target_qty > 0 THEN
                v_cumulative := v_cumulative + v_target_qty;
                IF v_random_pick < v_cumulative THEN
                  v_target_idx := v_j;
                  EXIT;
                END IF;
              END IF;
            END LOOP;
            v_target := v_attacker_units->v_target_idx;
            v_target_qty := (v_target->>'quantity')::integer;
            IF v_target_qty <= 0 THEN v_rf_continue := false; CONTINUE; END IF;
            v_rf_target_code := v_target->>'code';
          ELSE
            -- Disparos de fuego r??pido: solo a unidades del mismo tipo
            v_alive_count := 0;
            FOR v_j IN 0..(jsonb_array_length(v_attacker_units) - 1) LOOP
              IF (v_attacker_units->v_j->>'code') = v_rf_target_code THEN
                v_alive_count := v_alive_count + GREATEST(0, (v_attacker_units->v_j->>'quantity')::integer);
              END IF;
            END LOOP;
            IF v_alive_count = 0 THEN EXIT; END IF;

            v_random_pick := FLOOR(random() * v_alive_count)::integer;
            v_cumulative := 0;
            v_target_idx := -1;
            FOR v_j IN 0..(jsonb_array_length(v_attacker_units) - 1) LOOP
              IF (v_attacker_units->v_j->>'code') = v_rf_target_code THEN
                v_target_qty := (v_attacker_units->v_j->>'quantity')::integer;
                IF v_target_qty > 0 THEN
                  v_cumulative := v_cumulative + v_target_qty;
                  IF v_random_pick < v_cumulative THEN
                    v_target_idx := v_j;
                    EXIT;
                  END IF;
                END IF;
              END IF;
            END LOOP;
            IF v_target_idx = -1 THEN EXIT; END IF;
            v_target := v_attacker_units->v_target_idx;
            v_target_qty := (v_target->>'quantity')::integer;
            IF v_target_qty <= 0 THEN v_rf_continue := false; CONTINUE; END IF;
          END IF;

          v_damage := (v_unit->>'weapon')::numeric;
          v_shield_per_unit := (v_target->>'shield')::numeric;

          IF v_shield_per_unit > 0 AND v_damage < v_shield_per_unit * 0.01 THEN
            NULL;
          ELSE
            v_shield_available := LEAST(v_shield_per_unit, GREATEST(0, (v_attacker_units->v_target_idx->>'shield_pool')::numeric));
            v_shield_absorbed := LEAST(v_damage, v_shield_available);
            v_hull_damage := v_damage - v_shield_absorbed;

            IF v_shield_absorbed > 0 THEN
              v_attacker_units := jsonb_set(v_attacker_units, ARRAY[v_target_idx::text, 'shield_pool'],
                to_jsonb(GREATEST(0, (v_attacker_units->v_target_idx->>'shield_pool')::numeric - v_shield_absorbed)));
            END IF;

            IF v_hull_damage > 0 THEN
              v_unit_hull := (v_target->>'hull')::numeric;
              v_hull_pool := (v_attacker_units->v_target_idx->>'hull_damage_pool')::numeric + v_hull_damage;
              v_attacker_units := jsonb_set(v_attacker_units, ARRAY[v_target_idx::text, 'hull_damage_pool'], to_jsonb(v_hull_pool));

              IF v_unit_hull > 0 THEN
                v_units_killed := FLOOR(v_hull_pool / v_unit_hull)::integer;
                IF v_units_killed < v_target_qty THEN
                  v_destroy_fraction := (v_hull_pool - (v_units_killed::numeric * v_unit_hull)) / v_unit_hull;
                  IF v_destroy_fraction > 0.3 THEN
                    IF random() < v_destroy_fraction THEN v_units_killed := v_units_killed + 1; END IF;
                  END IF;
                END IF;
                v_units_killed := LEAST(v_units_killed, v_target_qty);

                IF v_units_killed > 0 THEN
                  v_attacker_units := jsonb_set(v_attacker_units, ARRAY[v_target_idx::text, 'quantity'], to_jsonb(v_target_qty - v_units_killed));
                  v_attacker_units := jsonb_set(v_attacker_units, ARRAY[v_target_idx::text, 'hull_damage_pool'],
                    to_jsonb(GREATEST(0, v_hull_pool - (v_units_killed::numeric * v_unit_hull))));
                  IF v_target_qty <= v_units_killed THEN
                    v_attacker_units := jsonb_set(v_attacker_units, ARRAY[v_target_idx::text, 'shield_pool'], to_jsonb(0::numeric));
                  END IF;

                  v_attacker_losses_metal := v_attacker_losses_metal + ((v_target->>'metal_cost')::numeric * v_units_killed);
                  v_attacker_losses_crystal := v_attacker_losses_crystal + ((v_target->>'crystal_cost')::numeric * v_units_killed);
                END IF;
              END IF;
            END IF;
          END IF;

          v_rf_value := COALESCE((v_unit->'rapid_fire'->>((v_attacker_units->v_target_idx->>'code')::text))::integer, 0);
          IF v_rf_value > 1 THEN
            IF random() < ((v_rf_value - 1.0) / v_rf_value) THEN v_rf_continue := true; ELSE v_rf_continue := false; END IF;
          ELSE
            v_rf_continue := false;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;

    v_rounds_data := v_rounds_data || jsonb_build_object(
      'round', v_round,
      'attacker_remaining', (SELECT COALESCE(SUM((u->>'quantity')::integer), 0) FROM jsonb_array_elements(v_attacker_units) u),
      'defender_remaining', (SELECT COALESCE(SUM((u->>'quantity')::integer), 0) FROM jsonb_array_elements(v_defender_units) u)
    );

    SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_attacker_total_units FROM jsonb_array_elements(v_attacker_units) u;
    SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_defender_total_units FROM jsonb_array_elements(v_defender_units) u;

    IF v_attacker_total_units = 0 OR v_defender_total_units = 0 THEN EXIT; END IF;
  END LOOP;

  SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_attacker_total_units FROM jsonb_array_elements(v_attacker_units) u;
  SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_defender_total_units FROM jsonb_array_elements(v_defender_units) u;

  IF v_attacker_total_units > 0 AND v_defender_total_units = 0 THEN
    v_result := 'attacker_won';
  ELSIF v_attacker_total_units = 0 AND v_defender_total_units > 0 THEN
    v_result := 'defender_won';
  ELSIF v_attacker_total_units = 0 AND v_defender_total_units = 0 THEN
    v_result := 'draw';
  ELSE
    -- Ambos bandos conservan unidades tras 6 rondas: EMPATE (no hay saqueo).
    v_result := 'draw';
  END IF;

  -- Load configurable debris ratios
  SELECT
    COALESCE(fleet_debris_ratio, 30) / 100.0,
    COALESCE(defense_debris_ratio, 0) / 100.0
  INTO v_fleet_cdr, v_defense_cdr
  FROM admin_speed_settings
  WHERE id = 1;

  IF NOT FOUND THEN
    v_fleet_cdr := 0.3;
    v_defense_cdr := 0.0;
  END IF;

  -- Total defender losses = fleet + defense (for reporting)
  v_defender_losses_metal := v_defender_fleet_losses_metal + v_defender_defense_losses_metal;
  v_defender_losses_crystal := v_defender_fleet_losses_crystal + v_defender_defense_losses_crystal;

  -- Debris = attacker fleet losses * fleet_cdr + defender fleet losses * fleet_cdr + defender defense losses * defense_cdr
  v_debris_metal := FLOOR(
    (v_attacker_losses_metal + v_defender_fleet_losses_metal) * v_fleet_cdr
    + v_defender_defense_losses_metal * v_defense_cdr
  );
  v_debris_crystal := FLOOR(
    (v_attacker_losses_crystal + v_defender_fleet_losses_crystal) * v_fleet_cdr
    + v_defender_defense_losses_crystal * v_defense_cdr
  );

  RETURN jsonb_build_object(
    'result', v_result,
    'rounds', v_round,
    'rounds_data', v_rounds_data,
    'attacker_remaining', v_attacker_units,
    'defender_remaining', v_defender_units,
    'debris_metal', v_debris_metal,
    'debris_crystal', v_debris_crystal,
    'attacker_losses_metal', v_attacker_losses_metal,
    'attacker_losses_crystal', v_attacker_losses_crystal,
    'defender_losses_metal', v_defender_losses_metal,
    'defender_losses_crystal', v_defender_losses_crystal,
    'destroyed_defenses', v_destroyed_defenses,
    'initial_attacker', v_initial_attackers,
    'initial_defender', v_initial_defenders
  );
END;
$function$

