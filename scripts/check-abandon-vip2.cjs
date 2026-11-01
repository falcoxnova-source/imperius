const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Check Lucifrer's Plus status
  const lucifrer = await c.query(`SELECT id, username, fxu_balance FROM profiles WHERE username ILIKE '%lucif%'`);
  console.log('=== Lucifrer profile ===');
  console.log(lucifrer.rows);

  // Check is_user_plus function
  const plusFn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname='is_user_plus' AND pronamespace='public'::regnamespace`);
  console.log('\n=== is_user_plus SOURCE ===');
  console.log(plusFn.rows[0]?.prosrc || 'NOT FOUND');

  // Check game_settings for fxu_abandon_colony_fee
  const fee = await c.query(`SELECT * FROM game_settings WHERE key = 'fxu_abandon_colony_fee'`);
  console.log('\n=== fxu_abandon_colony_fee setting ===');
  console.log(fee.rows);

  // Check phalanx: does the result use 'origin' or 'origin_coords' as key name?
  // The frontend expects 'origin_coords' but the function builds 'origin'
  console.log('\n=== Phalanx fleet key names in function ===');
  console.log('The phalanx_scan builds keys: origin, destination (NOT origin_coords, destination_coords)');

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
