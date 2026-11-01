-- Fix destruction ranking: divide raw cost by 1000 per original spec
-- Puntos = (metal_cost + crystal_cost) / 1000 por nave destruida

CREATE OR REPLACE FUNCTION get_destruction_ranking()
RETURNS TABLE(
  user_id uuid,
  username text,
  avatar_url text,
  alliance_tag text,
  alliance_name text,
  alliance_id uuid,
  destruction_points bigint,
  attacker_points bigint,
  defender_points bigint,
  battles_as_attacker integer,
  battles_as_defender integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  report_data jsonb;
  attacker_id_v uuid;
  defender_id_v uuid;
  defender_fleet_loss bigint;
  attacker_fleet_loss bigint;
  v_reset_at timestamptz;
BEGIN
  SELECT destruction_ranking_reset_at INTO v_reset_at FROM jackpot_pools WHERE id = 1;
  IF v_reset_at IS NULL THEN
    v_reset_at := 'epoch'::timestamptz;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS temp_destruction_points (
    uid uuid PRIMARY KEY,
    att_points bigint DEFAULT 0,
    def_points bigint DEFAULT 0,
    att_battles integer DEFAULT 0,
    def_battles integer DEFAULT 0
  ) ON COMMIT DROP;
  TRUNCATE TABLE temp_destruction_points;

  FOR r IN
    SELECT br.attacker_id, br.defender_id, br.report_data
    FROM battle_reports br
    WHERE br.report_data IS NOT NULL
      AND br.created_at >= v_reset_at
      AND br.report_data ? 'initial_defender'
      AND br.report_data ? 'defender_remaining'
      AND br.report_data ? 'initial_attacker'
      AND br.report_data ? 'attacker_remaining'
  LOOP
    BEGIN
      report_data := r.report_data;
      attacker_id_v := r.attacker_id;
      defender_id_v := r.defender_id;

      -- Defender losses: only combat/special ships (exclude defenses AND civil ships)
      WITH initial AS (
        SELECT
          NULLIF(u->>'type_id','')::integer AS type_id,
          COALESCE(NULLIF(u->>'is_defense','')::boolean, false) AS is_defense,
          COALESCE(NULLIF(u->>'initial_quantity','')::integer, NULLIF(u->>'quantity','')::integer, 0) AS init_qty,
          COALESCE(NULLIF(u->>'metal_cost','')::bigint, 0) AS metal_cost,
          COALESCE(NULLIF(u->>'crystal_cost','')::bigint, 0) AS crystal_cost
        FROM jsonb_array_elements(report_data->'initial_defender') u
      ),
      remain AS (
        SELECT
          NULLIF(u->>'type_id','')::integer AS type_id,
          COALESCE(NULLIF(u->>'is_defense','')::boolean, false) AS is_defense,
          COALESCE(NULLIF(u->>'quantity','')::integer, 0) AS qty
        FROM jsonb_array_elements(report_data->'defender_remaining') u
      )
      SELECT COALESCE(SUM(GREATEST(0, i.init_qty - COALESCE(rm.qty, 0)) * (i.metal_cost + i.crystal_cost) / 1000), 0)
        INTO defender_fleet_loss
      FROM initial i
      LEFT JOIN remain rm ON rm.type_id = i.type_id AND rm.is_defense = i.is_defense
      JOIN ship_types st ON st.id = i.type_id
      WHERE i.is_defense = false
        AND st.category IN ('combat','special');

      -- Attacker losses: attacker fleet has no defenses; just exclude civil ships
      WITH initial AS (
        SELECT
          NULLIF(u->>'type_id','')::integer AS type_id,
          COALESCE(NULLIF(u->>'initial_quantity','')::integer, NULLIF(u->>'quantity','')::integer, 0) AS init_qty,
          COALESCE(NULLIF(u->>'metal_cost','')::bigint, 0) AS metal_cost,
          COALESCE(NULLIF(u->>'crystal_cost','')::bigint, 0) AS crystal_cost
        FROM jsonb_array_elements(report_data->'initial_attacker') u
      ),
      remain AS (
        SELECT
          NULLIF(u->>'type_id','')::integer AS type_id,
          COALESCE(NULLIF(u->>'quantity','')::integer, 0) AS qty
        FROM jsonb_array_elements(report_data->'attacker_remaining') u
      )
      SELECT COALESCE(SUM(GREATEST(0, i.init_qty - COALESCE(rm.qty, 0)) * (i.metal_cost + i.crystal_cost) / 1000), 0)
        INTO attacker_fleet_loss
      FROM initial i
      LEFT JOIN remain rm ON rm.type_id = i.type_id
      JOIN ship_types st ON st.id = i.type_id
      WHERE st.category IN ('combat','special');

      IF attacker_id_v IS NOT NULL AND defender_fleet_loss > 0 THEN
        INSERT INTO temp_destruction_points(uid, att_points, att_battles)
        VALUES (attacker_id_v, defender_fleet_loss, 1)
        ON CONFLICT (uid) DO UPDATE SET
          att_points  = temp_destruction_points.att_points  + EXCLUDED.att_points,
          att_battles = temp_destruction_points.att_battles + 1;
      END IF;

      IF defender_id_v IS NOT NULL AND attacker_fleet_loss > 0 THEN
        INSERT INTO temp_destruction_points(uid, def_points, def_battles)
        VALUES (defender_id_v, attacker_fleet_loss, 1)
        ON CONFLICT (uid) DO UPDATE SET
          def_points  = temp_destruction_points.def_points  + EXCLUDED.def_points,
          def_battles = temp_destruction_points.def_battles + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.username,
    p.avatar_url,
    a.tag  AS alliance_tag,
    a.name AS alliance_name,
    am.alliance_id,
    (COALESCE(tdp.att_points, 0) + COALESCE(tdp.def_points, 0))::bigint AS destruction_points,
    COALESCE(tdp.att_points, 0)::bigint  AS attacker_points,
    COALESCE(tdp.def_points, 0)::bigint  AS defender_points,
    COALESCE(tdp.att_battles, 0)::integer AS battles_as_attacker,
    COALESCE(tdp.def_battles, 0)::integer AS battles_as_defender
  FROM temp_destruction_points tdp
  JOIN profiles p ON p.id = tdp.uid
  LEFT JOIN alliance_members am ON am.user_id = p.id
  LEFT JOIN alliances a ON a.id = am.alliance_id
  WHERE p.is_hidden IS NOT TRUE
    AND p.is_admin IS NOT TRUE
    AND (COALESCE(tdp.att_points, 0) + COALESCE(tdp.def_points, 0)) > 0
  ORDER BY destruction_points DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_destruction_ranking() TO authenticated;
