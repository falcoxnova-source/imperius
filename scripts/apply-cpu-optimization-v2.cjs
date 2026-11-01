const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  console.log('Connected to database\n');

  // Execute each statement individually to get proper error reporting
  const statements = [
    // 1. Create queue table
    {
      name: 'Create points_update_queue table',
      sql: `CREATE TABLE IF NOT EXISTS points_update_queue (
        user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
        queued_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    },
    {
      name: 'Enable RLS on queue table',
      sql: `ALTER TABLE points_update_queue ENABLE ROW LEVEL SECURITY`
    },
    {
      name: 'Grant access to postgres',
      sql: `GRANT ALL ON points_update_queue TO postgres`
    },
    {
      name: 'Grant access to service_role',
      sql: `GRANT ALL ON points_update_queue TO service_role`
    },

    // 2. Create lightweight trigger functions
    {
      name: 'Create queue_points_update_for_planet_table()',
      sql: `CREATE OR REPLACE FUNCTION queue_points_update_for_planet_table()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = OLD.planet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = NEW.planet_id;
  END IF;
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.points_update_queue (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`
    },
    {
      name: 'Create queue_points_update_for_user_table()',
      sql: `CREATE OR REPLACE FUNCTION queue_points_update_for_user_table()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.points_update_queue (user_id)
  VALUES (CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`
    },
    {
      name: 'Create queue_points_update_for_fleet_ships()',
      sql: `CREATE OR REPLACE FUNCTION queue_points_update_for_fleet_ships()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF current_setting('app.skip_point_triggers', true) = 'true' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM public.fleets WHERE id = OLD.fleet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM public.fleets WHERE id = NEW.fleet_id;
  END IF;
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.points_update_queue (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`
    },
    {
      name: 'Create queue_points_update_for_fleet()',
      sql: `CREATE OR REPLACE FUNCTION queue_points_update_for_fleet()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.skip_point_triggers', true) = 'true' THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.points_update_queue (user_id)
  VALUES (CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`
    },

    // 3. Drop old triggers and create new ones
    {
      name: 'Replace trigger: planet_buildings',
      sql: `DROP TRIGGER IF EXISTS trigger_building_points ON planet_buildings;
CREATE TRIGGER trigger_building_points
  AFTER INSERT OR UPDATE OR DELETE ON planet_buildings
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_planet_table()`
    },
    {
      name: 'Replace trigger: planet_defenses',
      sql: `DROP TRIGGER IF EXISTS trigger_defense_points ON planet_defenses;
CREATE TRIGGER trigger_defense_points
  AFTER INSERT OR UPDATE OR DELETE ON planet_defenses
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_planet_table()`
    },
    {
      name: 'Replace trigger: planet_ships',
      sql: `DROP TRIGGER IF EXISTS trigger_fleet_points ON planet_ships;
CREATE TRIGGER trigger_fleet_points
  AFTER INSERT OR UPDATE OR DELETE ON planet_ships
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_planet_table()`
    },
    {
      name: 'Replace trigger: user_technologies',
      sql: `DROP TRIGGER IF EXISTS trigger_research_points ON user_technologies;
CREATE TRIGGER trigger_research_points
  AFTER INSERT OR UPDATE OR DELETE ON user_technologies
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_user_table()`
    },
    {
      name: 'Replace trigger: fleets',
      sql: `DROP TRIGGER IF EXISTS trigger_fleet_change_points ON fleets;
CREATE TRIGGER trigger_fleet_change_points
  AFTER INSERT OR UPDATE OR DELETE ON fleets
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_fleet()`
    },
    {
      name: 'Replace trigger: fleet_ships',
      sql: `DROP TRIGGER IF EXISTS trigger_fleet_ships_change_points ON fleet_ships;
CREATE TRIGGER trigger_fleet_ships_change_points
  AFTER INSERT OR UPDATE OR DELETE ON fleet_ships
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_fleet_ships()`
    },

    // 4. Create batch processing function
    {
      name: 'Create batch_update_player_points()',
      sql: `CREATE OR REPLACE FUNCTION batch_update_player_points()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_user_id UUID;
  v_buildings INTEGER;
  v_research INTEGER;
  v_fleet INTEGER;
  v_defense INTEGER;
BEGIN
  FOR v_user_id IN
    DELETE FROM points_update_queue
    RETURNING user_id
  LOOP
    v_buildings := calculate_building_points(v_user_id);
    v_research := calculate_research_points(v_user_id);
    v_fleet := calculate_fleet_points(v_user_id);
    v_defense := calculate_defense_points(v_user_id);
    UPDATE profiles SET
      points_buildings = v_buildings,
      points_research = v_research,
      points_fleet = v_fleet,
      points_defense = v_defense,
      points_total = v_buildings + v_research + v_fleet + v_defense
    WHERE id = v_user_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`
    },

    // 5. Optimize alliance sync trigger
    {
      name: 'Optimize sync_alliance_points_on_profile_change()',
      sql: `CREATE OR REPLACE FUNCTION sync_alliance_points_on_profile_change()
RETURNS TRIGGER AS $$
DECLARE
  v_alliance_id uuid;
BEGIN
  IF OLD.points_total IS DISTINCT FROM NEW.points_total THEN
    SELECT alliance_id INTO v_alliance_id
    FROM alliance_members
    WHERE user_id = NEW.id;
    IF v_alliance_id IS NOT NULL THEN
      PERFORM update_alliance_points(v_alliance_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`
    },

    // 6. Schedule pg_cron: batch points every 2 min
    {
      name: 'Schedule pg_cron: batch-update-points (*/2 * * * *)',
      sql: `SELECT cron.schedule('batch-update-points', '*/2 * * * *', 'SELECT batch_update_player_points()')`
    },

    // 7. Schedule pg_cron: cleanup _http_response daily
    {
      name: 'Schedule pg_cron: cleanup-http-response (0 4 * * *)',
      sql: `SELECT cron.schedule('cleanup-http-response', '0 4 * * *', $$DELETE FROM net._http_response WHERE created < now() - interval '24 hours'$$)`
    },

    // 8. Schedule pg_cron: cleanup old completed fleets weekly
    {
      name: 'Schedule pg_cron: cleanup-old-completed-fleets (0 5 * * 0)',
      sql: `SELECT cron.schedule('cleanup-old-completed-fleets', '0 5 * * 0', $$DELETE FROM fleets WHERE is_completed = true AND arrival_time < now() - interval '30 days'$$)`
    },

    // 9. Immediate cleanup of _http_response (in batches to avoid timeout)
    {
      name: 'Cleanup _http_response (batch 1: older than 7 days)',
      sql: `DELETE FROM net._http_response WHERE created < now() - interval '7 days'`
    },
    {
      name: 'Cleanup _http_response (batch 2: older than 24 hours)',
      sql: `DELETE FROM net._http_response WHERE created < now() - interval '24 hours'`
    },

    // 10. Add index on fleet_ships.fleet_id
    {
      name: 'Create idx_fleet_ships_fleet_id index',
      sql: `CREATE INDEX IF NOT EXISTS idx_fleet_ships_fleet_id ON fleet_ships(fleet_id)`
    }
  ];

  let success = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const { name, sql } = statements[i];
    console.log(`[${i + 1}/${statements.length}] ${name}...`);
    try {
      const result = await c.query(sql);
      console.log(`  ✓ OK (rows: ${result.rowCount})`);
      success++;
    } catch (err) {
      console.error(`  ✗ ERROR: ${err.message}`);
      if (err.detail) console.error(`    Detail: ${err.detail}`);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Results: ${success} succeeded, ${failed} failed`);
  console.log(`========================================\n`);

  // VERIFICATION
  console.log('=== VERIFICATION ===\n');

  const trigs = await c.query(`
    SELECT t.tgname, c.relname, p.proname as function_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE t.tgname LIKE '%point%'
    ORDER BY c.relname, t.tgname
  `);
  console.log('Point triggers (should all point to queue_* functions):');
  trigs.rows.forEach(r => console.log(`  ${r.relname}.${r.tgname} -> ${r.function_name}`));

  const jobs = await c.query(`SELECT jobid, jobname, schedule FROM cron.job ORDER BY jobid`);
  console.log('\npg_cron jobs:');
  jobs.rows.forEach(r => console.log(`  [${r.jobid}] "${r.jobname}" schedule="${r.schedule}"`));

  const queueCheck = await c.query(`SELECT count(*) FROM points_update_queue`);
  console.log(`\npoints_update_queue rows: ${queueCheck.rows[0].count}`);

  const httpSize = await c.query(`
    SELECT pg_size_pretty(pg_total_relation_size('net._http_response')) as size,
           count(*) as rows FROM net._http_response
  `);
  console.log(`_http_response: ${httpSize.rows[0].size} (${httpSize.rows[0].rows} rows)`);

  const idxCheck = await c.query(`
    SELECT indexname FROM pg_indexes 
    WHERE tablename = 'fleet_ships' AND indexname = 'idx_fleet_ships_fleet_id'
  `);
  console.log(`idx_fleet_ships_fleet_id exists: ${idxCheck.rows.length > 0}`);

  await c.end();
  console.log('\n✅ All done!');
}

main().catch(console.error);
