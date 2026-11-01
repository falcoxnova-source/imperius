const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres'
});

(async () => {
  try {
    const client = await pool.connect();
    
    // 1. Check if there are multiple versions of the function
    const { rows: funcs } = await client.query(`
      SELECT p.proname, p.pronargs, p.proargtypes, p.prosecdef, pg_get_functiondef(p.oid) as full_def
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'get_my_monthly_market_sales' AND n.nspname = 'public'
    `);
    console.log('=== Number of get_my_monthly_market_sales functions:', funcs.length, '===');
    funcs.forEach((f, i) => {
      console.log(`  Version ${i}: args=${f.pronargs}, security_definer=${f.prosecdef}`);
    });

    // 2. Simulate calling it as this user
    // Set the auth.uid() context and call the function
    const uid = '6516fcdc-95f9-47db-8479-eef6a7d09898';
    
    // First, check is_user_plus directly
    const { rows: plusCheck } = await client.query(`SELECT is_user_plus($1) as is_plus`, [uid]);
    console.log('\n=== is_user_plus for gravekeeper:', plusCheck[0].is_plus, '===');
    
    // Set auth context and call
    await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true)`);
    await client.query(`SELECT set_config('role', 'authenticated', true)`);
    
    try {
      const { rows: result } = await client.query(`SELECT get_my_monthly_market_sales() as result`);
      console.log('\n=== get_my_monthly_market_sales result (as gravekeeper) ===');
      console.log(JSON.stringify(result[0].result, null, 2));
    } catch (e) {
      console.log('Error calling function:', e.message);
    }
    
    // 3. Check get_my_market_fee too
    try {
      const { rows: feeResult } = await client.query(`SELECT get_my_market_fee() as result`);
      console.log('\n=== get_my_market_fee result (as gravekeeper) ===');
      console.log(JSON.stringify(feeResult[0].result, null, 2));
    } catch (e) {
      console.log('Error calling get_my_market_fee:', e.message);
    }

    // 4. Check the plus_subscriptions record details
    const { rows: subDetails } = await client.query(`
      SELECT ps.*, pp.name as plan_name, pp.duration_days
      FROM plus_subscriptions ps
      LEFT JOIN plus_plans pp ON pp.id = ps.plan_id
      WHERE ps.user_id = $1
    `, [uid]);
    console.log('\n=== Subscription full details ===');
    console.log(JSON.stringify(subDetails, null, 2));

    // 5. Check what is_user_plus actually looks at
    const { rows: funcDef } = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'is_user_plus'
    `);
    console.log('\n=== is_user_plus function source ===');
    console.log(funcDef[0]?.prosrc);

    client.release();
    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
    await pool.end();
  }
})();
