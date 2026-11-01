const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

async function main() {
  await c.connect();

  // Check record_admin_revenue signature
  const sig = await c.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) as args
    FROM pg_proc p
    WHERE p.proname = 'record_admin_revenue'
  `);
  console.log('record_admin_revenue signatures:');
  sig.rows.forEach(r => console.log('  ', r.proname + '(' + r.args + ')'));

  // Check _internal_set_fxu_context
  const ctx = await c.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) as args, prosrc
    FROM pg_proc p
    WHERE p.proname = '_internal_set_fxu_context'
  `);
  console.log('\n_internal_set_fxu_context:');
  ctx.rows.forEach(r => console.log('  ', r.prosrc.trim().substring(0, 200)));

  // Check protect_fxu_balance trigger
  const trig = await c.query(`
    SELECT tgname, tgtype, pg_get_functiondef(tgfoid) as funcdef
    FROM pg_trigger
    WHERE tgrelid = 'profiles'::regclass AND tgname LIKE '%fxu%'
  `);
  console.log('\nFXU triggers on profiles:', trig.rows.length);
  trig.rows.forEach(r => {
    console.log('  Trigger:', r.tgname);
    // Show first 500 chars of function def
    console.log('  Function:', r.funcdef.substring(0, 500));
  });

  // Try to call purchase directly as postgres (bypass auth)
  // First wrap in a DO block with proper exception handling
  const listingId = 'b3934627-c8e6-4fcb-83a9-64b3a689fbec';
  
  console.log('\n--- Testing purchase function directly ---');
  try {
    await c.query('BEGIN');
    
    // Check what happens step by step
    // Get listing
    const l = await c.query(`SELECT * FROM market_listings WHERE id = $1`, [listingId]);
    console.log('Listing status:', l.rows[0]?.status, 'qty:', l.rows[0]?.quantity);

    // Get a buyer
    const buyer = await c.query(`
      SELECT id, username, fxu_balance FROM profiles 
      WHERE username != 'admin' AND fxu_balance >= 700 
      ORDER BY fxu_balance DESC LIMIT 1
    `);
    console.log('Test buyer:', buyer.rows[0]?.username, 'FXU:', buyer.rows[0]?.fxu_balance);

    if (buyer.rows[0]) {
      // Simulate the auth.uid() by setting the role
      const buyerId = buyer.rows[0].id;
      
      // Try to call the function - but we can't set auth.uid() easily
      // Instead let's test with DO block
      const testResult = await c.query(`
        DO $$
        DECLARE
          v_result jsonb;
          v_error text;
        BEGIN
          -- Simulate by calling directly
          -- We can't really call purchase_market_listing without auth context
          -- But let's test the individual parts that might fail
          
          -- Test _internal_set_fxu_context
          PERFORM _internal_set_fxu_context();
          RAISE NOTICE 'fxu_context set OK';
          
          -- Test contribute_to_jackpot
          PERFORM contribute_to_jackpot(26, 'market_fee', '${l.rows[0].seller_id}'::uuid);
          RAISE NOTICE 'contribute_to_jackpot OK';
          
          -- Will rollback anyway
          RAISE EXCEPTION 'ROLLBACK_TEST';
        EXCEPTION
          WHEN OTHERS THEN
            RAISE NOTICE 'Error: %', SQLERRM;
        END;
        $$;
      `);
    }

    await c.query('ROLLBACK');
  } catch (e) {
    console.error('Error:', e.message);
    await c.query('ROLLBACK').catch(() => {});
  }

  // Most important: check the full function source for any obvious issues
  const funcSrc = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'purchase_market_listing'`);
  const src = funcSrc.rows[0]?.prosrc || '';
  
  // Check for potential issues
  console.log('\n--- Function analysis ---');
  console.log('Has _internal_set_fxu_context:', src.includes('_internal_set_fxu_context'));
  console.log('Has contribute_to_jackpot:', src.includes('contribute_to_jackpot'));
  console.log('Has record_admin_revenue:', src.includes('record_admin_revenue'));
  console.log('Has EXCEPTION block:', src.includes('EXCEPTION'));
  
  // Check if it tracks fxu_value_sold for ships
  console.log('Has ship fxu_value_sold tracking:', src.includes('ships_value_sold'));
  
  // Check the exact ship handling section
  const shipSection = src.substring(src.indexOf("v_listing.listing_type = 'ship' THEN"), src.indexOf("v_listing.listing_type = 'ship' THEN") + 800);
  console.log('\nShip handling section (first occurrence):', shipSection.substring(0, 400));

  await c.end();
}
main().catch(e => { console.error(e); c.end(); });
