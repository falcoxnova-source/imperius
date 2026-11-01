const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

async function main() {
  await c.connect();

  const listingId = 'b3934627-c8e6-4fcb-83a9-64b3a689fbec';

  // Get a buyer
  const buyers = await c.query(`
    SELECT p.id, p.username, p.fxu_balance
    FROM profiles p
    WHERE p.username != 'admin' AND p.fxu_balance >= 700 
    ORDER BY p.fxu_balance DESC LIMIT 1
  `);
  const buyer = buyers.rows[0];
  console.log('Test buyer:', buyer?.username, 'FXU:', buyer?.fxu_balance);

  // Simulate purchase in rollback transaction
  console.log('\n--- Simulating purchase (WILL ROLLBACK) ---');
  await c.query('BEGIN');
  try {
    await c.query(`SELECT set_config('request.jwt.claims', '{"sub":"${buyer.id}","role":"authenticated"}', true)`);
    await c.query(`SELECT set_config('role', 'authenticated', true)`);
    
    const result = await c.query(`SELECT purchase_market_listing($1, $2) as result`, [listingId, 1]);
    console.log('Result:', JSON.stringify(result.rows[0]?.result, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  await c.query('ROLLBACK').catch(() => {});

  await c.end();
}
main().catch(e => { console.error(e); c.end(); });
