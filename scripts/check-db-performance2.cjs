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

  // 1. All point-related trigger functions
  const funcs = [
    'trigger_update_fleet_points_on_fleet_ships_change',
    'trigger_update_fleet_points_on_fleet_change',
    'trigger_update_building_points',
    'trigger_update_defense_points',
    'trigger_update_fleet_points',
    'trigger_update_research_points',
    'update_user_points',
    'update_player_points'
  ];
  
  for (const fname of funcs) {
    console.log(`\n=== ${fname} ===`);
    const res = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fname]);
    if (res.rows.length > 0) {
      console.log(res.rows[0].prosrc.substring(0, 800));
      if (res.rows[0].prosrc.length > 800) console.log(`... (${res.rows[0].prosrc.length} chars total)`);
    } else {
      console.log('NOT FOUND');
    }
  }

  // 2. Table sizes (fixed query)
  console.log('\n=== TABLE SIZES (top 15) ===');
  const res8 = await client.query(`
    SELECT s.relname, 
           pg_size_pretty(pg_total_relation_size(s.relid)) as total_size,
           n_live_tup as row_count
    FROM pg_stat_user_tables s
    ORDER BY pg_total_relation_size(s.relid) DESC
    LIMIT 15
  `);
  for (const row of res8.rows) {
    console.log(`  ${row.relname}: ${row.total_size} (~${row.row_count} rows)`);
  }

  // 3. Check if pg_cron is available
  console.log('\n=== pg_cron AVAILABLE? ===');
  try {
    const res9 = await client.query(`SELECT extname FROM pg_extension WHERE extname = 'pg_cron'`);
    console.log(res9.rows.length > 0 ? 'YES - pg_cron is installed' : 'NO - pg_cron not installed');
  } catch (e) {
    console.log('Cannot check: ' + e.message);
  }

  await client.end();
}

main().catch(console.error);
