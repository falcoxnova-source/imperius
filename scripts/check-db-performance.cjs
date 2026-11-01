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

  // 1. All indexes on fleets table
  console.log('=== INDEXES ON fleets ===');
  const res1 = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'fleets'
    ORDER BY indexname
  `);
  for (const row of res1.rows) {
    console.log(`  ${row.indexname}`);
    console.log(`    ${row.indexdef}`);
  }

  // 2. All indexes on fleet_ships
  console.log('\n=== INDEXES ON fleet_ships ===');
  const res2 = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'fleet_ships'
    ORDER BY indexname
  `);
  for (const row of res2.rows) {
    console.log(`  ${row.indexname}`);
    console.log(`    ${row.indexdef}`);
  }

  // 3. All indexes on planet_ships
  console.log('\n=== INDEXES ON planet_ships ===');
  const res3 = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'planet_ships'
    ORDER BY indexname
  `);
  for (const row of res3.rows) {
    console.log(`  ${row.indexname}`);
    console.log(`    ${row.indexdef}`);
  }

  // 4. All indexes on planet_resources
  console.log('\n=== INDEXES ON planet_resources ===');
  const res4 = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'planet_resources'
    ORDER BY indexname
  `);
  for (const row of res4.rows) {
    console.log(`  ${row.indexname}`);
    console.log(`    ${row.indexdef}`);
  }

  // 5. All indexes on market_listings
  console.log('\n=== INDEXES ON market_listings ===');
  const res5 = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'market_listings'
    ORDER BY indexname
  `);
  for (const row of res5.rows) {
    console.log(`  ${row.indexname}`);
    console.log(`    ${row.indexdef}`);
  }

  // 6. Current trigger list on fleets, planet_ships, planet_defenses, planet_buildings
  console.log('\n=== POINT TRIGGERS ===');
  const res6 = await client.query(`
    SELECT c.relname as table_name, t.tgname as trigger_name, p.proname as function_name,
           CASE t.tgenabled WHEN 'O' THEN 'enabled' WHEN 'D' THEN 'disabled' ELSE t.tgenabled::text END as status
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE p.proname LIKE '%point%'
    ORDER BY c.relname, t.tgname
  `);
  for (const row of res6.rows) {
    console.log(`  ${row.table_name}.${row.trigger_name} → ${row.function_name} [${row.status}]`);
  }

  // 7. Count of active fleets and total fleets
  console.log('\n=== FLEET COUNTS ===');
  const res7 = await client.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN NOT is_completed THEN 1 END) as active,
      COUNT(CASE WHEN is_completed THEN 1 END) as completed
    FROM fleets
  `);
  console.log(JSON.stringify(res7.rows[0]));

  // 8. Table sizes
  console.log('\n=== TABLE SIZES (top 15) ===');
  const res8 = await client.query(`
    SELECT relname, 
           pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
           pg_size_pretty(pg_relation_size(c.oid)) as table_size,
           n_live_tup as row_count
    FROM pg_class c
    JOIN pg_stat_user_tables s ON c.relname = s.relname
    WHERE c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 15
  `);
  for (const row of res8.rows) {
    console.log(`  ${row.relname}: ${row.total_size} (data: ${row.table_size}, ~${row.row_count} rows)`);
  }

  await client.end();
}

main().catch(console.error);
