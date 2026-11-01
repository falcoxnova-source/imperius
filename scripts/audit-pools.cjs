const { Client } = require('pg');

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

  // 1. Columns of jackpot_pools
  console.log('=== JACKPOT_POOLS COLUMNS ===');
  const cols = await c.query(`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='jackpot_pools' ORDER BY ordinal_position`);
  console.log(JSON.stringify(cols.rows, null, 2));

  // 2. Current values in jackpot_pools
  console.log('\n=== JACKPOT_POOLS VALUES ===');
  const vals = await c.query('SELECT * FROM jackpot_pools WHERE id = 1');
  console.log(JSON.stringify(vals.rows[0], null, 2));

  // 3. Main jackpot table
  console.log('\n=== JACKPOT TABLE ===');
  const jp = await c.query('SELECT * FROM jackpot WHERE id = 1');
  console.log(JSON.stringify(jp.rows[0], null, 2));

  // 4. Current contribute_to_jackpot function source
  console.log('\n=== CONTRIBUTE_TO_JACKPOT FUNCTION ===');
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'contribute_to_jackpot' LIMIT 1`);
  console.log(fn.rows[0] ? fn.rows[0].prosrc : 'FUNCTION NOT FOUND');

  // 5. Check recent jackpot_history (last 10 contributions)
  console.log('\n=== LAST 15 JACKPOT_HISTORY ENTRIES ===');
  const hist = await c.query(`SELECT id, type, amount, source, jackpot_balance_after, created_at FROM jackpot_history ORDER BY created_at DESC LIMIT 15`);
  for (const row of hist.rows) {
    console.log(`  ${row.created_at} | ${row.type} | ${row.amount} | ${row.source} | after=${row.jackpot_balance_after}`);
  }

  // 6. Check market fee functions
  console.log('\n=== MARKET PURCHASE FUNCTION (fee portion) ===');
  const mkt = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'purchase_market_listing' LIMIT 1`);
  if (mkt.rows[0]) {
    const src = mkt.rows[0].prosrc;
    // Find the fee/jackpot related lines
    const lines = src.split('\n');
    const relevantLines = lines.filter(l => 
      l.toLowerCase().includes('fee') || 
      l.toLowerCase().includes('jackpot') || 
      l.toLowerCase().includes('contribute') ||
      l.toLowerCase().includes('admin_revenue') ||
      l.toLowerCase().includes('v_jackpot')
    );
    console.log(relevantLines.join('\n'));
  }

  // 7. Check fleet acceleration function (fee portion)
  console.log('\n=== ACCELERATE_FLEET FUNCTION (fee portion) ===');
  const accel = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'accelerate_fleet' LIMIT 1`);
  if (accel.rows[0]) {
    const src = accel.rows[0].prosrc;
    const lines = src.split('\n');
    const relevantLines = lines.filter(l => 
      l.toLowerCase().includes('fee') || 
      l.toLowerCase().includes('jackpot') || 
      l.toLowerCase().includes('contribute') ||
      l.toLowerCase().includes('admin_revenue') ||
      l.toLowerCase().includes('v_jackpot')
    );
    console.log(relevantLines.join('\n'));
  }

  // 8. Check all functions that call contribute_to_jackpot
  console.log('\n=== ALL FUNCTIONS CALLING contribute_to_jackpot ===');
  const callers = await c.query(`SELECT proname FROM pg_proc WHERE prosrc ILIKE '%contribute_to_jackpot%' AND proname != 'contribute_to_jackpot'`);
  for (const row of callers.rows) {
    console.log('  ->', row.proname);
  }

  // 9. Check expedition extra fee function
  console.log('\n=== CHECK_AND_CHARGE_EXPEDITION_FEE FUNCTION ===');
  const expFee = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'check_and_charge_expedition_fee' LIMIT 1`);
  if (expFee.rows[0]) {
    const src = expFee.rows[0].prosrc;
    const lines = src.split('\n');
    const relevantLines = lines.filter(l => 
      l.toLowerCase().includes('fee') || 
      l.toLowerCase().includes('jackpot') || 
      l.toLowerCase().includes('contribute') ||
      l.toLowerCase().includes('admin_revenue')
    );
    console.log(relevantLines.join('\n'));
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
