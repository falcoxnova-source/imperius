const { Client } = require('pg');
const fs = require('fs');

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
  console.log('Connected\n');

  // Read the full SQL file as one statement (it's a single CREATE OR REPLACE FUNCTION)
  const sql = fs.readFileSync('supabase/migrations/20260405180000_fix_purchase_market_buyer_planet.sql', 'utf8');
  
  console.log('Applying market purchase bug fix...');
  try {
    await c.query(sql);
    console.log('✅ Migration applied successfully!\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    await c.end();
    return;
  }

  // Verify
  const q = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'purchase_market_listing'
  `);
  const hasFix = q.rows.length > 0 && q.rows[0].def.includes('p_buyer_planet_id');
  console.log(`Verification: p_buyer_planet_id parameter present: ${hasFix ? '✅ YES' : '❌ NO'}`);

  await c.end();
}
main().catch(console.error);
