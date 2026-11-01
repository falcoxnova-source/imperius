const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

async function main() {
  await c.connect();

  // Check contribute_to_jackpot function source
  const jp = await c.query(`
    SELECT pg_get_function_arguments(oid) as args, prosrc 
    FROM pg_proc WHERE proname = 'contribute_to_jackpot'
  `);
  console.log('contribute_to_jackpot args:', jp.rows[0]?.args);
  console.log('contribute_to_jackpot src (first 500 chars):', jp.rows[0]?.prosrc?.substring(0, 500));

  // Check if there's an active jackpot
  const jk = await c.query(`SELECT * FROM jackpot_pools LIMIT 1`);
  console.log('\nActive jackpot:', jk.rows[0] ? JSON.stringify(jk.rows[0]) : 'NONE');

  // Check the full purchase function - look for any potential issue with ships specifically
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'purchase_market_listing'`);
  const src = fn.rows[0]?.prosrc || '';
  
  // Find the ship delivery section
  const deliverIdx = src.indexOf('Deliver to buyer');
  if (deliverIdx > -1) {
    console.log('\nShip delivery section:');
    console.log(src.substring(deliverIdx, deliverIdx + 400));
  }

  // Find the ship tracking section
  const trackIdx = src.indexOf("v_listing.listing_type = 'ship' THEN\n    SELECT");
  if (trackIdx > -1) {
    console.log('\nShip tracking section:');
    console.log(src.substring(trackIdx, trackIdx + 600));
  }

  // Let's try actually calling the purchase in a DO block that catches errors
  const listingId = 'b3934627-c8e6-4fcb-83a9-64b3a689fbec';
  
  // Get a real buyer 
  const buyers = await c.query(`
    SELECT p.id, p.username, p.fxu_balance, 
           (SELECT pl.id FROM planets pl WHERE pl.user_id = p.id AND pl.is_main_planet = true LIMIT 1) as main_planet
    FROM profiles p
    WHERE p.username != 'admin' AND p.fxu_balance >= 700 
    ORDER BY p.fxu_balance DESC LIMIT 1
  `);
  const buyer = buyers.rows[0];
  console.log('\nTest buyer:', buyer?.username, 'FXU:', buyer?.fxu_balance, 'Main planet:', buyer?.main_planet);

  // Simulate purchase in a transaction that we rollback
  if (buyer) {
    console.log('\n--- Simulating purchase step by step (WILL ROLLBACK) ---');
    await c.query('BEGIN');
    try {
      // Set auth context
      await c.query(`SELECT set_config('request.jwt.claims', '{"sub":"${buyer.id}","role":"authenticated"}', true)`);
      await c.query(`SELECT set_config('role', 'authenticated', true)`);
      
      // Now try calling the function  
      const result = await c.query(`SELECT purchase_market_listing($1, $2) as result`, [listingId, 1]);
      console.log('Result:', JSON.stringify(result.rows[0]?.result));
    } catch (e) {
      console.error('PURCHASE ERROR:', e.message);
      console.error('Error detail:', e.detail);
      console.error('Error hint:', e.hint);
      console.error('Error code:', e.code);
    }
    await c.query('ROLLBACK').catch(() => {});
  }

  await c.end();
}
main().catch(e => { console.error(e); c.end(); });
