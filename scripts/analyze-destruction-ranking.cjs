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

  // 1. Check get_destruction_ranking function
  console.log('=== get_destruction_ranking function ===');
  const { rows: fn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'get_destruction_ranking'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (fn.length > 0) {
    console.log(fn[0].prosrc);
  } else {
    console.log('Function NOT FOUND!');
  }

  // 2. Check profiles table for units_destroyed field
  console.log('\n=== profiles table - units_destroyed column ===');
  const { rows: cols } = await c.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name LIKE '%destroy%'
  `);
  console.log(cols);

  // 3. Sample data - top 10 by units_destroyed
  console.log('\n=== TOP 10 by units_destroyed ===');
  const { rows: top } = await c.query(`
    SELECT username, units_destroyed, rank_position
    FROM profiles
    WHERE units_destroyed > 0
    ORDER BY units_destroyed DESC
    LIMIT 10
  `);
  for (const r of top) {
    console.log(`  ${r.username}: ${r.units_destroyed} (rank: ${r.rank_position})`);
  }
  if (top.length === 0) {
    console.log('  No players with units_destroyed > 0');
  }

  // 4. Call the RPC
  console.log('\n=== RPC: get_destruction_ranking() result ===');
  try {
    const { rows: rpc } = await c.query(`SELECT * FROM get_destruction_ranking() LIMIT 10`);
    console.log('Columns:', rpc.length > 0 ? Object.keys(rpc[0]) : 'No data');
    for (const r of rpc) {
      console.log(`  ${r.username}: ${r.destruction_points || r.units_destroyed}`);
    }
  } catch (e) {
    console.log('RPC Error:', e.message);
  }

  // 5. Check how units_destroyed gets updated
  console.log('\n=== Functions that UPDATE units_destroyed ===');
  const { rows: updateFns } = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE prosrc LIKE '%units_destroyed%'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  for (const f of updateFns) {
    console.log(`  ${f.proname}`);
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
