const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  // Get all trigger function bodies
  const triggers = await client.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) as definition
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname LIKE 'trigger_%point%'
    ORDER BY p.proname
  `);

  console.log('=== TRIGGER FUNCTION DEFINITIONS ===');
  for (const row of triggers.rows) {
    console.log(`\n--- ${row.proname} ---`);
    console.log(row.definition);
  }

  // Get update_player_points function
  const upd = await client.query(`
    SELECT pg_get_functiondef(p.oid) as definition
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_player_points'
  `);
  console.log('\n=== update_player_points ===');
  for (const row of upd.rows) {
    console.log(row.definition);
  }

  // Get calculate functions signatures
  const calc = await client.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) as definition
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname LIKE 'calculate_%_points'
    ORDER BY p.proname
  `);
  console.log('\n=== CALCULATE FUNCTIONS ===');
  for (const row of calc.rows) {
    console.log(`\n--- ${row.proname} ---`);
    console.log(row.definition);
  }

  // Check table columns for planet_buildings, planet_ships, planet_defenses, fleet_ships
  for (const tbl of ['planet_buildings', 'planet_ships', 'planet_defenses', 'fleet_ships', 'user_technologies']) {
    const cols = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tbl]);
    console.log(`\n=== ${tbl} columns ===`);
    cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
  }

  // Check trigger details (FOR EACH ROW vs STATEMENT)
  const trigDefs = await client.query(`
    SELECT tgname, tgtype, 
      CASE WHEN tgtype & 1 = 1 THEN 'ROW' ELSE 'STATEMENT' END as level,
      CASE WHEN tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END as timing,
      relname as table_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE tgname LIKE '%point%'
    ORDER BY relname, tgname
  `);
  console.log('\n=== TRIGGER DEFINITIONS ===');
  trigDefs.rows.forEach(r => console.log(`  ${r.table_name}.${r.tgname}: ${r.timing} ${r.level}`));

  // Check sync_alliance_points function
  const alliance = await client.query(`
    SELECT pg_get_functiondef(p.oid) as definition
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'sync_alliance_points_on_profile_change'
  `);
  console.log('\n=== sync_alliance_points_on_profile_change ===');
  for (const row of alliance.rows) {
    console.log(row.definition);
  }

  await client.end();
}

main().catch(console.error);
