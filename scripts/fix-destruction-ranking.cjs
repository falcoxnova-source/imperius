const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  console.log('Fixing get_destruction_ranking function...');
  
  // Get current function to preserve its logic, just fix the temp table issue
  const { rows } = await c.query(`
    SELECT prosrc, prorettype::regtype as return_type
    FROM pg_proc 
    WHERE proname = 'get_destruction_ranking'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);

  if (rows.length === 0) {
    console.log('Function not found!');
    await c.end();
    return;
  }

  // Replace the function - remove IF NOT EXISTS and DELETE FROM
  await c.query(`
    CREATE OR REPLACE FUNCTION get_destruction_ranking()
    RETURNS TABLE (
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
    AS $$
    DECLARE
      r record;
      report_data jsonb;
      attacker_id uuid;
      defender_id uuid;
      initial_defender jsonb;
      defender_remaining jsonb;
      initial_attacker jsonb;
      attacker_remaining jsonb;
      unit jsonb;
      remaining_unit jsonb;
      destroyed integer;
      defender_fleet_loss bigint;
      attacker_fleet_loss bigint;
      v_civil_ship_ids integer[];
    BEGIN
      -- Create temp table (ON COMMIT DROP cleans it automatically)
      CREATE TEMP TABLE temp_destruction_points (
        uid uuid PRIMARY KEY,
        att_points bigint DEFAULT 0,
        def_points bigint DEFAULT 0,
        att_battles integer DEFAULT 0,
        def_battles integer DEFAULT 0
      ) ON COMMIT DROP;

      -- Get civil ship IDs to exclude from destruction points
      SELECT array_agg(id) INTO v_civil_ship_ids
      FROM ship_types WHERE category = 'civil';

      -- Process all battle reports
      FOR r IN SELECT br.attacker_id, br.defender_id, br.report_data FROM battle_reports br WHERE br.report_data IS NOT NULL
      LOOP
        report_data := r.report_data;
        attacker_id := r.attacker_id;
        defender_id := r.defender_id;

        IF report_data ? 'initial_defender' AND report_data ? 'defender_remaining'
           AND report_data ? 'initial_attacker' AND report_data ? 'attacker_remaining' THEN

          initial_defender := report_data->'initial_defender';
          defender_remaining := report_data->'defender_remaining';
          initial_attacker := report_data->'initial_attacker';
          attacker_remaining := report_data->'attacker_remaining';

          -- Calculate defender fleet loss (attacker destroyed these)
          defender_fleet_loss := 0;
          FOR unit IN SELECT * FROM jsonb_array_elements(initial_defender)
          LOOP
            IF (unit->>'is_defense')::boolean = false THEN
              IF NOT ((unit->>'type_id')::integer = ANY(v_civil_ship_ids)) THEN
                SELECT INTO remaining_unit * FROM jsonb_array_elements(defender_remaining) ru
                WHERE (ru->>'type_id')::integer = (unit->>'type_id')::integer
                AND (ru->>'is_defense')::boolean = false
                LIMIT 1;

                destroyed := COALESCE((unit->>'initial_quantity')::integer, (unit->>'quantity')::integer)
                           - COALESCE((remaining_unit->>'quantity')::integer, 0);

                IF destroyed > 0 THEN
                  defender_fleet_loss := defender_fleet_loss +
                    (destroyed * ((unit->>'metal_cost')::bigint + (unit->>'crystal_cost')::bigint));
                END IF;
              END IF;
            END IF;
          END LOOP;

          -- Calculate attacker fleet loss (defender destroyed these)
          attacker_fleet_loss := 0;
          FOR unit IN SELECT * FROM jsonb_array_elements(initial_attacker)
          LOOP
            IF NOT ((unit->>'type_id')::integer = ANY(v_civil_ship_ids)) THEN
              SELECT INTO remaining_unit * FROM jsonb_array_elements(attacker_remaining) ru
              WHERE (ru->>'type_id')::integer = (unit->>'type_id')::integer
              LIMIT 1;

              destroyed := COALESCE((unit->>'initial_quantity')::integer, (unit->>'quantity')::integer)
                         - COALESCE((remaining_unit->>'quantity')::integer, 0);

              IF destroyed > 0 THEN
                attacker_fleet_loss := attacker_fleet_loss +
                  (destroyed * ((unit->>'metal_cost')::bigint + (unit->>'crystal_cost')::bigint));
              END IF;
            END IF;
          END LOOP;

          -- Credit attacker for defender fleet destruction
          IF attacker_id IS NOT NULL AND defender_fleet_loss > 0 THEN
            INSERT INTO temp_destruction_points (uid, att_points, att_battles)
            VALUES (attacker_id, defender_fleet_loss / 1000, 1)
            ON CONFLICT (uid) DO UPDATE SET
              att_points = temp_destruction_points.att_points + EXCLUDED.att_points,
              att_battles = temp_destruction_points.att_battles + 1;
          END IF;

          -- Credit defender for attacker fleet destruction
          IF defender_id IS NOT NULL AND attacker_fleet_loss > 0 THEN
            INSERT INTO temp_destruction_points (uid, def_points, def_battles)
            VALUES (defender_id, attacker_fleet_loss / 1000, 1)
            ON CONFLICT (uid) DO UPDATE SET
              def_points = temp_destruction_points.def_points + EXCLUDED.def_points,
              def_battles = temp_destruction_points.def_battles + 1;
          END IF;

        END IF;
      END LOOP;

      -- Return the ranking
      RETURN QUERY
      SELECT
        p.id as user_id,
        p.username,
        p.avatar_url,
        a.tag as alliance_tag,
        a.name as alliance_name,
        am.alliance_id,
        (COALESCE(tdp.att_points, 0) + COALESCE(tdp.def_points, 0))::bigint as destruction_points,
        COALESCE(tdp.att_points, 0)::bigint as attacker_points,
        COALESCE(tdp.def_points, 0)::bigint as defender_points,
        COALESCE(tdp.att_battles, 0)::integer as battles_as_attacker,
        COALESCE(tdp.def_battles, 0)::integer as battles_as_defender
      FROM temp_destruction_points tdp
      JOIN profiles p ON p.id = tdp.uid
      LEFT JOIN alliance_members am ON am.user_id = p.id
      LEFT JOIN alliances a ON a.id = am.alliance_id
      WHERE p.is_hidden IS NOT TRUE AND p.is_admin IS NOT TRUE
        AND (COALESCE(tdp.att_points, 0) + COALESCE(tdp.def_points, 0)) > 0
      ORDER BY destruction_points DESC;
    END;
    $$;
  `);

  console.log('Function updated!');

  // Test the function
  console.log('\nTesting get_destruction_ranking():');
  const { rows: test } = await c.query(`SELECT * FROM get_destruction_ranking() LIMIT 5`);
  console.log(`Found ${test.length} players`);
  for (const r of test) {
    console.log(`  ${r.username}: ${r.destruction_points} pts (atk: ${r.attacker_points}, def: ${r.defender_points})`);
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
