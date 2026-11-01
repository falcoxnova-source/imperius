const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1. Admin current balances
  const admin = await c.query(`
    SELECT id, fxu_balance, usdt_balance 
    FROM profiles WHERE is_admin = true ORDER BY created_at LIMIT 1
  `);
  const adm = admin.rows[0];
  console.log(`Admin ID: ${adm.id}`);
  console.log(`FXU balance: ${adm.fxu_balance}`);
  console.log(`USDT balance: ${adm.usdt_balance}`);

  // 2. Check: for each revenue function, is the fee going to ADMIN or to JACKPOT?
  const checkFuncs = [
    'swap_fxu_to_usdt', 'swap_usdt_to_fxu', 
    'create_market_listing', 'purchase_market_listing',
    'demolish_building', 'secure_abandon_colony'
  ];

  for (const fn of checkFuncs) {
    const res = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fn]);
    if (res.rows.length === 0) { console.log(`\n${fn}: NOT FOUND`); continue; }
    const src = res.rows[0].prosrc;
    
    // Check where fee goes
    const goesToAdmin = src.includes('v_admin_id') || src.includes('get_admin_account_id');
    const goesToJackpot = src.includes('jackpot') || src.includes('contribute_to_jackpot');
    const creditsFxu = src.match(/fxu_balance\s*=\s*fxu_balance\s*\+.*v_(fee|admin|revenue)/i) || 
                        src.includes('fxu_balance + v_fee') || src.includes('fxu_balance + v_admin');
    
    console.log(`\n${fn}:`);
    console.log(`  References admin: ${goesToAdmin}`);
    console.log(`  References jackpot: ${goesToJackpot}`);
    
    // Find what happens with the fee - extract relevant lines
    const lines = src.split('\n');
    for (const line of lines) {
      const l = line.trim().toLowerCase();
      if (l.includes('fee') && (l.includes('update') || l.includes('balance') || l.includes('jackpot') || l.includes('admin'))) {
        console.log(`  >> ${line.trim()}`);
      }
    }
  }

  // 3. Key question: does swap_fxu_to_usdt fee go to admin FXU or somewhere else?
  console.log('\n\n=== DETAILED: swap_fxu_to_usdt fee handling ===');
  const swapSrc = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'swap_fxu_to_usdt'`);
  const swapLines = swapSrc.rows[0].prosrc.split('\n');
  let inFeeSection = false;
  for (const line of swapLines) {
    if (line.includes('fee') || line.includes('admin') || line.includes('balance') || inFeeSection) {
      console.log(line);
      if (line.trim() === '') inFeeSection = false;
      else inFeeSection = true;
    }
  }

  // 4. Check market_fee handling
  console.log('\n\n=== DETAILED: create_market_listing fee handling ===');
  const mktSrc = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'create_market_listing'`);
  if (mktSrc.rows.length > 0) {
    const mktLines = mktSrc.rows[0].prosrc.split('\n');
    for (const line of mktLines) {
      if (line.toLowerCase().includes('fee') || line.toLowerCase().includes('admin') || 
          line.toLowerCase().includes('jackpot') || line.toLowerCase().includes('revenue')) {
        console.log(line.trim());
      }
    }
  }

  // 5. When was admin balance last reset? Check the latest 0-balance event
  console.log('\n\n=== Revenue since start of week by time ===');
  const revByTime = await c.query(`
    SELECT revenue_type, amount, created_at 
    FROM admin_revenue 
    WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)::timestamptz
    ORDER BY created_at DESC
    LIMIT 20
  `);
  revByTime.rows.forEach(r => console.log(`  ${r.created_at} | ${r.revenue_type} | ${r.amount}`));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
