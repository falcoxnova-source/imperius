/*
  # Remove Excess Colonies Based on Astrophysics Level

  This migration removes colonies from 16 specific users who have more planets
  than their Astrophysics technology level allows.

  Formula: max_planets = floor(astrophysics_level / 2) + 2

  1. Affected Users and Actions
    - Moscow: 9 planets -> 2 (remove 7)
    - LimpBizkit: 9 planets -> 4 (remove 5)
    - VanHelsing: 7 planets -> 4 (remove 3)
    - Avenge_Sevenfold: 6 planets -> 4 (remove 2)
    - FearDk: 6 planets -> 5 (remove 1)
    - JDaniel: 6 planets -> 4 (remove 2)
    - Xmen: 6 planets -> 5 (remove 1)
    - KILLFAR: 6 planets -> 5 (remove 1)
    - MAIKOL: 6 planets -> 4 (remove 2)
    - Layonnel: 6 planets -> 5 (remove 1)
    - Max: 5 planets -> 4 (remove 1)
    - PAPITA 10 PECHO: 5 planets -> 4 (remove 1)
    - Yeploe: 5 planets -> 4 (remove 1)
    - ADICTO: 4 planets -> 3 (remove 1)
    - Stein_81b8: 4 planets -> 2 (remove 2)
    - eduxnova: 3 planets -> 2 (remove 1)

  2. Removal Criteria (least developed colonies removed first)
    - Homeworld (is_main_planet = true) is NEVER removed
    - Colonies ranked by total building levels (ascending = least developed first to remove)
    - Ties broken by fields_used, then by creation date

  3. Cascade Behavior (handled by existing FK constraints)
    - CASCADE delete: planet_buildings, planet_ships, planet_defenses,
      planet_resources, building_queue, shipyard_queue, supply_box_purchases, attack_log
    - SET NULL: fleets.origin_planet_id, galaxy_positions.occupied_by,
      market_listings.planet_id, battle_reports.planet_id,
      user_technologies.research_planet_id
    - Manual cleanup: research_queue (NO ACTION FK)

  4. Safety
    - Only affects the 16 listed users, no one else
    - Homeworlds are protected
    - Points recalculated after removal
    - No other accounts are touched

  5. Important Notes
    - VanHelsing has 1 active deploy fleet from Hellplanet (to be removed).
      Fleet continues to exist; origin_planet_id set to NULL.
    - Total colonies removed: 31 across 16 users
*/

DO $$
DECLARE
  v_removed_count integer := 0;
  v_user_record record;
  v_planet_record record;
BEGIN
  FOR v_user_record IN
    WITH target_users AS (
      SELECT pr.id as user_id, pr.username,
        COALESCE(ut.level, 0) as astro_level,
        (FLOOR(COALESCE(ut.level, 0)::numeric / 2) + 2)::integer as max_allowed
      FROM profiles pr
      LEFT JOIN user_technologies ut ON ut.user_id = pr.id AND ut.technology_type_id = 14
      WHERE pr.username IN (
        'Moscow', 'LimpBizkit', 'VanHelsing', 'Avenge_Sevenfold', 'FearDk', 'JDaniel',
        'Xmen', 'KILLFAR', 'MAIKOL', 'Layonnel', 'Max', 'PAPITA 10 PECHO ',
        'Yeploe', 'ADICTO', 'Stein_81b8', 'eduxnova'
      )
    )
    SELECT * FROM target_users
  LOOP
    FOR v_planet_record IN
      SELECT p.id as planet_id, p.name, p.galaxy, p.solar_system, p.position,
        ROW_NUMBER() OVER (
          ORDER BY p.is_main_planet DESC,
            COALESCE((SELECT SUM(pb.level) FROM planet_buildings pb WHERE pb.planet_id = p.id), 0) DESC,
            p.fields_used DESC,
            p.created_at ASC
        ) as rank_pos
      FROM planets p
      WHERE p.user_id = v_user_record.user_id
        AND p.planet_type = 'planet'
        AND p.is_destroyed = false
    LOOP
      IF v_planet_record.rank_pos > v_user_record.max_allowed THEN
        UPDATE research_queue
        SET planet_id = NULL
        WHERE planet_id = v_planet_record.planet_id
          AND status IN ('pending', 'in_progress');

        DELETE FROM planets WHERE id = v_planet_record.planet_id;

        v_removed_count := v_removed_count + 1;

        RAISE NOTICE 'Removed planet "%" (%) from user "%" [rank % > max %]',
          v_planet_record.name,
          v_planet_record.galaxy || ':' || v_planet_record.solar_system || ':' || v_planet_record.position,
          v_user_record.username,
          v_planet_record.rank_pos,
          v_user_record.max_allowed;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Total colonies removed: %', v_removed_count;
END $$;

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  FOR v_user_id IN
    SELECT pr.id
    FROM profiles pr
    WHERE pr.username IN (
      'Moscow', 'LimpBizkit', 'VanHelsing', 'Avenge_Sevenfold', 'FearDk', 'JDaniel',
      'Xmen', 'KILLFAR', 'MAIKOL', 'Layonnel', 'Max', 'PAPITA 10 PECHO ',
      'Yeploe', 'ADICTO', 'Stein_81b8', 'eduxnova'
    )
  LOOP
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_user_points') THEN
      PERFORM update_user_points(v_user_id);
    END IF;
  END LOOP;
END $$;
