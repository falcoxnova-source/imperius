const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

async function main() {
  await c.connect();

  // Find recent ship listings (destructor)
  const r1 = await c.query(`
    SELECT ml.id, ml.seller_id, ml.listing_type, ml.item_code, ml.quantity, 
           ml.price_per_unit, ml.total_price, ml.status, ml.planet_id,
           p.username as seller_name, ml.created_at
    FROM market_listings ml
    JOIN profiles p ON p.id = ml.seller_id
    WHERE ml.listing_type = 'ship'
    ORDER BY ml.created_at DESC LIMIT 10
  `);
  console.log('Recent ship listings:');
  r1.rows.forEach(r => console.log(`  ${r.seller_name} | ${r.item_code} x${r.quantity} @ ${r.price_per_unit} = ${r.total_price} FXU | status: ${r.status} | ${r.created_at}`));

  // Check ship_types for destructor
  const r2 = await c.query(`SELECT code, name, metal_cost, crystal_cost, deuterium_cost FROM ship_types WHERE code ILIKE '%destr%' OR name ILIKE '%destr%'`);
  console.log('\nDestructor ship type:', JSON.stringify(r2.rows));

  // Check if purchase_market_listing has exception handler
  const r3 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'purchase_market_listing' LIMIT 1`);
  const src = r3.rows[0]?.prosrc || '';
  console.log('\npurchase_market_listing has EXCEPTION block:', src.includes('EXCEPTION'));
  console.log('Last 15 lines:', src.split('\n').slice(-15).join('\n'));

  // Check recent failed transactions or errors
  const r4 = await c.query(`
    SELECT ml.id, ml.item_code, ml.listing_type, ml.quantity, ml.price_per_unit, ml.status, ml.seller_id,
           p.username as seller_name
    FROM market_listings ml
    JOIN profiles p ON p.id = ml.seller_id
    WHERE ml.total_price >= 600 AND ml.created_at > now() - interval '2 hours'
    ORDER BY ml.created_at DESC LIMIT 5
  `);
  console.log('\nRecent high-value listings:');
  r4.rows.forEach(r => console.log(`  ${r.seller_name} | ${r.listing_type}:${r.item_code} x${r.quantity} @ ${r.price_per_unit} | status: ${r.status}`));

  await c.end();
}
main().catch(e => { console.error(e); c.end(); });
