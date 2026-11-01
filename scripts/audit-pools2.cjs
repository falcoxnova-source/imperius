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

  // 1. Verify the math: percentages sum
  console.log('=== PERCENTAGE CHECK ===');
  const pools = await c.query('SELECT expedition_percent, monthly_percent, plus_percent, destruction_percent FROM jackpot_pools WHERE id=1');
  const p = pools.rows[0];
  const total = p.expedition_percent + p.monthly_percent + p.plus_percent + p.destruction_percent;
  console.log(`Expedition: ${p.expedition_percent}%, Monthly TOP: ${p.monthly_percent}%, Social(plus): ${p.plus_percent}%, Destruction: ${p.destruction_percent}%`);
  console.log(`Total allocated: ${total}% (remaining ${100 - total}% stays as reserve in jackpot.balance)`);

  // 2. Verify last contribution splits correctly
  console.log('\n=== VERIFY LAST CONTRIBUTION SPLIT ===');
  const lastContrib = await c.query(`SELECT amount, source, created_at FROM jackpot_history WHERE type='contribution' ORDER BY created_at DESC LIMIT 1`);
  if (lastContrib.rows.length > 0) {
    const amount = Number(lastContrib.rows[0].amount);
    console.log(`Last contribution: ${amount} from ${lastContrib.rows[0].source}`);
    console.log(`Expected split:`);
    console.log(`  Expedition (${p.expedition_percent}%): ${Math.floor(amount * p.expedition_percent / 100)}`);
    console.log(`  Monthly TOP (${p.monthly_percent}%): ${Math.floor(amount * p.monthly_percent / 100)}`);
    console.log(`  Social (${p.plus_percent}%): ${Math.floor(amount * p.plus_percent / 100)}`);
    console.log(`  Destruction (${p.destruction_percent}%): ${Math.floor(amount * p.destruction_percent / 100)}`);
    const allocated = Math.floor(amount * p.expedition_percent / 100) + Math.floor(amount * p.monthly_percent / 100) + Math.floor(amount * p.plus_percent / 100) + Math.floor(amount * p.destruction_percent / 100);
    console.log(`  Reserve (${100 - total}%): ${amount - allocated} (stays in jackpot.balance only)`);
  }

  // 3. Check lottery buy_lottery_ticket for jackpot contribution
  console.log('\n=== BUY_LOTTERY_TICKET - JACKPOT PART ===');
  const lot = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'buy_lottery_ticket' LIMIT 1`);
  if (lot.rows[0]) {
    const lines = lot.rows[0].prosrc.split('\n');
    const relevant = lines.filter(l => 
      l.toLowerCase().includes('jackpot') || 
      l.toLowerCase().includes('contribute') ||
      l.toLowerCase().includes('fee') ||
      l.toLowerCase().includes('admin_revenue') ||
      l.toLowerCase().includes('v_ticket_price') ||
      l.toLowerCase().includes('v_jackpot')
    );
    console.log(relevant.join('\n'));
  }

  // 4. Check secure_rename functions
  console.log('\n=== SECURE_RENAME_PLANET - JACKPOT PART ===');
  const ren = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'secure_rename_planet' LIMIT 1`);
  if (ren.rows[0]) {
    const lines = ren.rows[0].prosrc.split('\n');
    const relevant = lines.filter(l => 
      l.toLowerCase().includes('jackpot') || 
      l.toLowerCase().includes('contribute') ||
      l.toLowerCase().includes('fee') ||
      l.toLowerCase().includes('admin_revenue') ||
      l.toLowerCase().includes('v_cost') ||
      l.toLowerCase().includes('v_jackpot')
    );
    console.log(relevant.join('\n'));
  }

  // 5. Check secure_create_alliance
  console.log('\n=== SECURE_CREATE_ALLIANCE - JACKPOT PART ===');
  const alc = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'secure_create_alliance' LIMIT 1`);
  if (alc.rows[0]) {
    const lines = alc.rows[0].prosrc.split('\n');
    const relevant = lines.filter(l => 
      l.toLowerCase().includes('jackpot') || 
      l.toLowerCase().includes('contribute') ||
      l.toLowerCase().includes('fee') ||
      l.toLowerCase().includes('admin_revenue') ||
      l.toLowerCase().includes('cost') ||
      l.toLowerCase().includes('v_jackpot')
    );
    console.log(relevant.join('\n'));
  }

  // 6. Summary: total contributed vs pool balances
  console.log('\n=== BALANCE INTEGRITY CHECK ===');
  const poolVals = await c.query('SELECT * FROM jackpot_pools WHERE id=1');
  const pv = poolVals.rows[0];
  const totalPoolBalance = Number(pv.expedition_balance) + Number(pv.monthly_balance) + Number(pv.plus_balance) + Number(pv.destruction_balance);
  const jackpotBalance = await c.query('SELECT balance FROM jackpot WHERE id=1');
  const jb = Number(jackpotBalance.rows[0].balance);
  console.log(`Pool Expediciones balance: ${pv.expedition_balance} (total contributed: ${pv.expedition_total})`);
  console.log(`Pool TOP 50 (monthly) balance: ${pv.monthly_balance} (total contributed: ${pv.monthly_total})`);
  console.log(`Pool Social/Twitter (plus) balance: ${pv.plus_balance} (total contributed: ${pv.plus_total})`);
  console.log(`Pool Destruccion balance: ${pv.destruction_balance} (total contributed: ${pv.destruction_total})`);
  console.log(`Sum of 4 pools balance: ${totalPoolBalance}`);
  console.log(`Jackpot main balance: ${jb}`);
  console.log(`Reserve (jackpot - pools): ${jb - totalPoolBalance}`);

  // 7. Check game_settings for fleet_acceleration_jackpot_percent
  console.log('\n=== GAME SETTINGS - JACKPOT RELATED ===');
  const gs = await c.query(`SELECT key, value FROM game_settings WHERE key ILIKE '%jackpot%' OR key ILIKE '%fee%' OR key ILIKE '%market_fee%'`);
  for (const row of gs.rows) {
    console.log(`  ${row.key} = ${row.value}`);
  }

  // 8. Check jackpot_config
  console.log('\n=== JACKPOT_CONFIG ===');
  const jc = await c.query('SELECT * FROM jackpot_config WHERE id=1');
  console.log(JSON.stringify(jc.rows[0], null, 2));

  // 9. Verify expedition pool win function
  console.log('\n=== ATTEMPT_EXPEDITION_POOL_WIN FUNCTION ===');
  const expWin = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'attempt_expedition_pool_win' LIMIT 1`);
  if (expWin.rows[0]) {
    const lines = expWin.rows[0].prosrc.split('\n');
    const relevant = lines.filter(l => 
      l.toLowerCase().includes('expedition_balance') || 
      l.toLowerCase().includes('pool') ||
      l.toLowerCase().includes('jackpot') ||
      l.toLowerCase().includes('win') ||
      l.toLowerCase().includes('percent')
    );
    console.log(relevant.join('\n'));
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
