import { Client } from 'pg';
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
await c.connect();

const sql = `
CREATE OR REPLACE FUNCTION public.get_destruction_ranking()
RETURNS TABLE(
  user_id uuid, username text, avatar_url text,
  alliance_tag text, alliance_name text, alliance_id uuid,
  destruction_points bigint, attacker_points bigint, defender_points bigint,
  battles_as_attacker integer, battles_as_defender integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  report_data jsonb;
  attacker_id_v uuid;
  defender_id_v uuid;
  defender_fleet_loss bigint;
  attacker_fleet_loss bigint;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS temp_destruction_points (
    uid uuid PRIMARY KEY,
    att_points bigint DEFAULT 0,
    def_points bigint DEFAULT 0,
    att_battles integer DEFAULT 0,
    def_battles integer DEFAULT 0
  ) ON COMMIT DROP;
  DELETE FROM temp_destruction_points;

  FOR r IN
    SELECT br.attacker_id, br.defender_id, br.report_data
    FROM battle_reports br
    WHERE br.report_data IS NOT NULL
      AND br.report_data ? 'initial_defender'
      AND br.report_data ? 'defender_remaining'
      AND br.report_data ? 'initial_attacker'
      AND br.report_data ? 'attacker_remaining'
  LOOP
    BEGIN
      report_data := r.report_data;
      attacker_id_v := r.attacker_id;
      defender_id_v := r.defender_id;

      -- Defender fleet loss (units destroyed by attacker)
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
      SELECT COALESCE(SUM(GREATEST(0, i.init_qty - COALESCE(rm.qty, 0)) * (i.metal_cost + i.crystal_cost)), 0)
        INTO defender_fleet_loss
      FROM initial i
      LEFT JOIN remain rm ON rm.type_id = i.type_id AND rm.is_defense = i.is_defense
      WHERE i.is_defense = false;

      -- Attacker fleet loss (units destroyed by defender)
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
      SELECT COALESCE(SUM(GREATEST(0, i.init_qty - COALESCE(rm.qty, 0)) * (i.metal_cost + i.crystal_cost)), 0)
        INTO attacker_fleet_loss
      FROM initial i
      LEFT JOIN remain rm ON rm.type_id = i.type_id;

      IF attacker_id_v IS NOT NULL AND defender_fleet_loss > 0 THEN
        INSERT INTO temp_destruction_points (uid, att_points, att_battles)
        VALUES (attacker_id_v, defender_fleet_loss / 1000, 1)
        ON CONFLICT (uid) DO UPDATE SET
          att_points  = temp_destruction_points.att_points  + EXCLUDED.att_points,
          att_battles = temp_destruction_points.att_battles + 1;
      END IF;

      IF defender_id_v IS NOT NULL AND attacker_fleet_loss > 0 THEN
        INSERT INTO temp_destruction_points (uid, def_points, def_battles)
        VALUES (defender_id_v, attacker_fleet_loss / 1000, 1)
        ON CONFLICT (uid) DO UPDATE SET
          def_points  = temp_destruction_points.def_points  + EXCLUDED.def_points,
          def_battles = temp_destruction_points.def_battles + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Skip mal-formed report, do not break the whole ranking
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_destruction_ranking() TO authenticated, anon;
NOTIFY pgrst, 'reload schema';
`;

console.log('Aplicando version robusta de get_destruction_ranking...');
await c.query(sql);
console.log('OK');

// Probar
const t0 = Date.now();
const r = await c.query('SELECT * FROM get_destruction_ranking()');
console.log(`Test: ${r.rows.length} rows en ${Date.now()-t0}ms`);
console.log('Sample:', r.rows[0]);

await c.end();
