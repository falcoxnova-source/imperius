const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

async function main() {
  await c.connect();

  // Get the star_destroyer listing
  const listing = await c.query(`
    SELECT ml.*, p.username as seller_name
    FROM market_listings ml
    JOIN profiles p ON p.id = ml.seller_id
    WHERE ml.item_code = 'star_destroyer' AND ml.seller_id = (SELECT id FROM profiles WHERE username = 'admin')
    AND ml.status = 'active'
    ORDER BY ml.created_at DESC LIMIT 1
  `);
  
  if (listing.rows.length === 0) {
    console.log('No active star_destroyer listing found');
    await c.end();
    return;
  }

  const l = listing.rows[0];
  console.log('Listing:', l.id, l.item_code, 'x' + l.quantity, '@', l.price_per_unit, '=', l.total_price, 'FXU');
  console.log('Seller:', l.seller_name, '| Planet:', l.planet_id);

  // Check seller has the ship on that planet
  const shipCheck = await c.query(`
    SELECT ps.quantity, st.code, st.name
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE ps.planet_id = $1 AND st.code = 'star_destroyer'
  `, [l.planet_id]);
  console.log('\nSeller ship on planet:', shipCheck.rows);

  // Check buyer planet
  const buyer = await c.query(`
    SELECT id, username FROM profiles WHERE username != 'admin' AND fxu_balance >= 700 LIMIT 3
  `);
  console.log('\nPotential buyers with 700+ FXU:', buyer.rows.map(r => r.username));

  // Check get_market_fee_for_user for the seller (admin)
  const fee = await c.query(`SELECT get_market_fee_for_user($1) as fee`, [l.seller_id]);
  console.log('\nAdmin market fee:', fee.rows[0]?.fee, '%');

  // Check if admin has referred_by
  const adminProfile = await c.query(`SELECT id, referred_by, is_admin FROM profiles WHERE username = 'admin'`);
  console.log('Admin referred_by:', adminProfile.rows[0]?.referred_by);

  // Check contribute_to_jackpot function exists
  const jackpotFn = await c.query(`SELECT proname FROM pg_proc WHERE proname = 'contribute_to_jackpot'`);
  console.log('contribute_to_jackpot exists:', jackpotFn.rows.length > 0);

  // Check record_admin_revenue function
  const recordFn = await c.query(`SELECT proname, pronargs FROM pg_proc WHERE proname = 'record_admin_revenue'`);
  console.log('record_admin_revenue signatures:', recordFn.rows.map(r => `${r.proname}(${r.pronargs} args)`));

  // Now let's try simulating in a transaction that we rollback
  console.log('\n--- SIMULATING PURCHASE (will rollback) ---');
  try {
    await c.query('BEGIN');
    
    // Set a test auth context - actually we can't easily simulate auth.uid()
    // Instead, let's check what the fee calculation would be
    const feePercent = parseFloat(fee.rows[0]?.fee || '7.5');
    const totalPrice = l.total_price;
    const feeAmount = totalPrice * (feePercent / 100);
    const sellerAmount = totalPrice - feeAmount;
    const jackpotAmount = Math.floor(feeAmount * 50 / 100);
    const referredBy = adminProfile.rows[0]?.referred_by;
    let referralFee = 0;
    let adminFee = 0;
    if (referredBy) {
      referralFee = Math.floor(feeAmount * 20 / 100);
      adminFee = feeAmount - jackpotAmount - referralFee;
    } else {
      adminFee = feeAmount - jackpotAmount;
    }
    
    console.log('total_price:', totalPrice);
    console.log('fee_percent:', feePercent);
    console.log('fee_amount:', feeAmount);
    console.log('seller_amount:', sellerAmount);
    console.log('jackpot_amount:', jackpotAmount);
    console.log('admin_fee:', adminFee);
    console.log('referral_fee:', referralFee);
    console.log('admin_fee / fee_amount:', adminFee / feeAmount, '(division by zero?)', feeAmount === 0 ? 'YES!' : 'no');

    // Check the round() call that could fail
    if (feeAmount > 0) {
      console.log('round(admin_fee/fee*100):', Math.round(adminFee / feeAmount * 100));
    }

    await c.query('ROLLBACK');
  } catch (e) {
    console.error('SIMULATION ERROR:', e.message);
    await c.query('ROLLBACK');
  }

  // Also check if there's a purchasable_at issue
  console.log('\nListing purchasable_at:', l.purchasable_at);
  console.log('Now:', new Date());
  console.log('Can purchase:', new Date(l.purchasable_at) <= new Date());

  // Check ship_types.id for star_destroyer 
  const stId = await c.query(`SELECT id, code FROM ship_types WHERE code = 'star_destroyer'`);
  console.log('\nship_types id for star_destroyer:', stId.rows);

  // Check planet_ships for seller planet 
  const ps = await c.query(`
    SELECT ps.*, st.code, st.name 
    FROM planet_ships ps 
    JOIN ship_types st ON st.id = ps.ship_type_id 
    WHERE ps.planet_id = $1
    ORDER BY ps.quantity DESC
  `, [l.planet_id]);
  console.log('\nAll ships on seller planet:');
  ps.rows.forEach(r => console.log(`  ${r.code} (${r.name}): ${r.quantity}`));

  await c.end();
}
main().catch(e => { console.error(e); c.end(); });
