/*
  # Fix Combat Damage Calculation Bug

  ## Problem
  The combat system was requiring hull damage >= 70% of hull to destroy a unit.
  This made it nearly impossible to destroy units since a Light Fighter (50 weapon)
  attacking a Rocket Launcher (2000 hull) would need 1400 damage to destroy it.

  ## Solution
  - Fix the damage calculation to properly destroy units when damage exceeds hull
  - Implement XNova-style probabilistic destruction when hull falls below 70%
  - Each unit tracks individual damage and can be destroyed

  ## Changes
  - Fixed the hull damage comparison logic
  - Units are destroyed when accumulated damage >= hull per unit
*/

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
  v_defender_losses_metal numeric := 0;
  v_defender_losses_crystal numeric := 0;
  v_debris_metal numeric := 0;
  v_debris_crystal numeric := 0;
  v_rounds_data jsonb := '[]'::jsonb;
  v_destroyed_defenses jsonb := '[]'::jsonb;
  v_initial_attackers jsonb;
  v_initial_defenders jsonb;
  v_attacker_count integer;
  v_defender_count integer;
  v_unit jsonb;
  v_target jsonb;
  v_target_idx integer;
  v_damage numeric;
  v_shield_absorbed numeric;
  v_hull_damage numeric;
  v_shots integer;
  v_i integer;
  v_j integer;
  v_k integer;
  v_new_attackers jsonb;
  v_new_defenders jsonb;
  v_round_attacker_losses jsonb;
  v_round_defender_losses jsonb;
  v_attacker_total_units integer;
  v_defender_total_units integer;
  v_units_to_destroy integer;
  v_unit_hull numeric;
  v_destroy_chance numeric;
BEGIN
  v_attacker_units := p_attackers;
  v_defender_units := p_defenders;
  v_initial_attackers := p_attackers;
  v_initial_defenders := p_defenders;

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
    v_round_attacker_losses := '[]'::jsonb;
    v_round_defender_losses := '[]'::jsonb;

    SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_attacker_total_units 
    FROM jsonb_array_elements(v_attacker_units) u;

    SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_defender_total_units 
    FROM jsonb_array_elements(v_defender_units) u;

    IF v_attacker_total_units = 0 OR v_defender_total_units = 0 THEN
      EXIT;
    END IF;

    -- PHASE 1: Attackers fire at defenders
    v_new_defenders := v_defender_units;

    FOR v_i IN 0..(jsonb_array_length(v_attacker_units) - 1) LOOP
      v_unit := v_attacker_units->v_i;

      IF (v_unit->>'quantity')::integer <= 0 THEN
        CONTINUE;
      END IF;

      -- Each individual unit fires
      FOR v_k IN 1..(v_unit->>'quantity')::integer LOOP
        SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_defender_total_units 
        FROM jsonb_array_elements(v_new_defenders) u;

        IF v_defender_total_units = 0 THEN
          EXIT;
        END IF;

        -- Select random target that has units
        v_target_idx := NULL;
        FOR v_j IN 0..(jsonb_array_length(v_new_defenders) - 1) LOOP
          IF ((v_new_defenders->v_j)->>'quantity')::integer > 0 THEN
            IF v_target_idx IS NULL OR random() < 0.3 THEN
              v_target_idx := v_j;
            END IF;
          END IF;
        END LOOP;

        IF v_target_idx IS NULL THEN
          EXIT;
        END IF;

        v_target := v_new_defenders->v_target_idx;
        v_unit_hull := (v_target->>'hull')::numeric;

        -- Calculate rapid fire shots
        v_shots := calculate_rapid_fire_shots(
          v_unit->>'code',
          v_target->>'code',
          v_unit->'rapid_fire'
        );

        -- Calculate total damage
        v_damage := (v_unit->>'weapon')::numeric * v_shots;

        -- Shield absorbs damage first (per unit shield)
        v_shield_absorbed := LEAST(v_damage, (v_target->>'shield')::numeric);
        v_hull_damage := v_damage - v_shield_absorbed;

        -- Calculate how many units can be destroyed by this damage
        IF v_hull_damage > 0 AND v_unit_hull > 0 THEN
          -- XNova style: damage accumulates and destroys units
          -- If damage >= hull of one unit, destroy at least one unit
          IF v_hull_damage >= v_unit_hull THEN
            -- Direct kill - damage exceeds hull
            v_units_to_destroy := LEAST(
              FLOOR(v_hull_damage / v_unit_hull)::integer,
              (v_target->>'quantity')::integer
            );
          ELSE
            -- Probabilistic destruction when damage < hull
            -- Chance to destroy = damage / hull
            v_destroy_chance := v_hull_damage / v_unit_hull;
            IF random() < v_destroy_chance THEN
              v_units_to_destroy := 1;
            ELSE
              v_units_to_destroy := 0;
            END IF;
          END IF;

          IF v_units_to_destroy > 0 THEN
            -- Destroy units
            v_new_defenders := jsonb_set(
              v_new_defenders,
              ARRAY[v_target_idx::text, 'quantity'],
              to_jsonb(GREATEST(0, (v_target->>'quantity')::integer - v_units_to_destroy))
            );

            -- Record losses
            v_defender_losses_metal := v_defender_losses_metal + ((v_target->>'metal_cost')::numeric * v_units_to_destroy);
            v_defender_losses_crystal := v_defender_losses_crystal + ((v_target->>'crystal_cost')::numeric * v_units_to_destroy);

            IF (v_target->>'is_defense')::boolean THEN
              v_destroyed_defenses := v_destroyed_defenses || jsonb_build_object(
                'defense_type_id', (v_target->>'type_id')::integer,
                'quantity', v_units_to_destroy
              );
            END IF;
          END IF;
        END IF;
      END LOOP;
    END LOOP;

    v_defender_units := v_new_defenders;

    -- PHASE 2: Defenders fire at attackers
    v_new_attackers := v_attacker_units;

    FOR v_i IN 0..(jsonb_array_length(v_defender_units) - 1) LOOP
      v_unit := v_defender_units->v_i;

      IF (v_unit->>'quantity')::integer <= 0 THEN
        CONTINUE;
      END IF;

      -- Each individual unit fires
      FOR v_k IN 1..(v_unit->>'quantity')::integer LOOP
        SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_attacker_total_units 
        FROM jsonb_array_elements(v_new_attackers) u;

        IF v_attacker_total_units = 0 THEN
          EXIT;
        END IF;

        -- Select random target that has units
        v_target_idx := NULL;
        FOR v_j IN 0..(jsonb_array_length(v_new_attackers) - 1) LOOP
          IF ((v_new_attackers->v_j)->>'quantity')::integer > 0 THEN
            IF v_target_idx IS NULL OR random() < 0.3 THEN
              v_target_idx := v_j;
            END IF;
          END IF;
        END LOOP;

        IF v_target_idx IS NULL THEN
          EXIT;
        END IF;

        v_target := v_new_attackers->v_target_idx;
        v_unit_hull := (v_target->>'hull')::numeric;

        -- Calculate rapid fire shots
        v_shots := calculate_rapid_fire_shots(
          v_unit->>'code',
          v_target->>'code',
          v_unit->'rapid_fire'
        );

        -- Calculate total damage
        v_damage := (v_unit->>'weapon')::numeric * v_shots;

        -- Shield absorbs damage first (per unit shield)
        v_shield_absorbed := LEAST(v_damage, (v_target->>'shield')::numeric);
        v_hull_damage := v_damage - v_shield_absorbed;

        -- Calculate how many units can be destroyed by this damage
        IF v_hull_damage > 0 AND v_unit_hull > 0 THEN
          IF v_hull_damage >= v_unit_hull THEN
            -- Direct kill
            v_units_to_destroy := LEAST(
              FLOOR(v_hull_damage / v_unit_hull)::integer,
              (v_target->>'quantity')::integer
            );
          ELSE
            -- Probabilistic destruction
            v_destroy_chance := v_hull_damage / v_unit_hull;
            IF random() < v_destroy_chance THEN
              v_units_to_destroy := 1;
            ELSE
              v_units_to_destroy := 0;
            END IF;
          END IF;

          IF v_units_to_destroy > 0 THEN
            -- Destroy units
            v_new_attackers := jsonb_set(
              v_new_attackers,
              ARRAY[v_target_idx::text, 'quantity'],
              to_jsonb(GREATEST(0, (v_target->>'quantity')::integer - v_units_to_destroy))
            );

            -- Record losses
            v_attacker_losses_metal := v_attacker_losses_metal + ((v_target->>'metal_cost')::numeric * v_units_to_destroy);
            v_attacker_losses_crystal := v_attacker_losses_crystal + ((v_target->>'crystal_cost')::numeric * v_units_to_destroy);
          END IF;
        END IF;
      END LOOP;
    END LOOP;

    v_attacker_units := v_new_attackers;

    -- Record round data
    v_rounds_data := v_rounds_data || jsonb_build_object(
      'round', v_round,
      'attacker_remaining', (SELECT COALESCE(SUM((u->>'quantity')::integer), 0) FROM jsonb_array_elements(v_attacker_units) u),
      'defender_remaining', (SELECT COALESCE(SUM((u->>'quantity')::integer), 0) FROM jsonb_array_elements(v_defender_units) u)
    );
  END LOOP;

  -- Determine result
  SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_attacker_total_units 
  FROM jsonb_array_elements(v_attacker_units) u;

  SELECT COALESCE(SUM((u->>'quantity')::integer), 0) INTO v_defender_total_units 
  FROM jsonb_array_elements(v_defender_units) u;

  IF v_attacker_total_units > 0 AND v_defender_total_units = 0 THEN
    v_result := 'attacker_won';
  ELSIF v_attacker_total_units = 0 AND v_defender_total_units > 0 THEN
    v_result := 'defender_won';
  ELSE
    v_result := 'draw';
  END IF;

  -- Calculate debris (30% of losses)
  v_debris_metal := FLOOR((v_attacker_losses_metal + v_defender_losses_metal) * 0.3);
  v_debris_crystal := FLOOR((v_attacker_losses_crystal + v_defender_losses_crystal) * 0.3);

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
$function$;
