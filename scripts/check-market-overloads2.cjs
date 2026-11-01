const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();

  // Check ALL overloads of purchase_market_listing
  const q = await c.query(`
    SELECT p.oid, p.proname, 
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_identity_arguments(p.oid) as identity_args
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'purchase_market_listing'
    ORDER BY p.oid
  `);
  console.log('=== ALL OVERLOADS OF purchase_market_listing ===');
  q.rows.forEach(r => {
    console.log(`  OID ${r.oid}: (${r.args})`);
    console.log(`    Identity: (${r.identity_args})`);
  });

  if (q.rows.length > 1) {
    console.log('\n⚠️  MULTIPLE OVERLOADS DETECTED!');
    const oldOne = q.rows.find(r => !r.args.includes('p_buyer_planet_id'));
    const newOne = q.rows.find(r => r.args.includes('p_buyer_planet_id'));
    if (oldOne) console.log(`OLD (to drop): OID ${oldOne.oid} - (${oldOne.identity_args})`);
    if (newOne) console.log(`NEW (to keep): OID ${newOne.oid} - (${newOne.identity_args})`);

    // Drop old overload
    if (oldOne) {
      console.log(`\nDropping old overload: DROP FUNCTION purchase_market_listing(${oldOne.identity_args})`);
      await c.query(`DROP FUNCTION purchase_market_listing(${oldOne.identity_args})`);
      console.log('✅ Old overload dropped!');
    }

    // Verify only new one remains
    const q2 = await c.query(`
      SELECT pg_get_function_arguments(p.oid) as args
      FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'purchase_market_listing'
    `);
    console.log(`\nRemaining overloads: ${q2.rows.length}`);
    q2.rows.forEach(r => console.log(`  (${r.args})`));
  }

  await c.end();
}
main().catch(console.error);
