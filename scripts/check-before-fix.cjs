const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Check min prices
  const limits = await client.query(`SELECT * FROM market_resource_limits WHERE id = 1`);
  console.log('Min prices:', {
    metal: limits.rows[0].min_price_metal,
    crystal: limits.rows[0].min_price_crystal,
    deuterium: limits.rows[0].min_price_deuterium
  });

  // Check current function signatures
  const funcs = await client.query(`
    SELECT proname, pg_get_function_arguments(oid) as args, pg_get_function_result(oid) as ret
    FROM pg_proc
    WHERE proname IN ('calculate_monthly_market_limit', 'create_market_listing', 'get_my_monthly_market_sales')
  `);
  funcs.rows.forEach(r => console.log(`${r.proname}(${r.args}) -> ${r.ret}`));

  // Luciffer Walker current data
  const user = await client.query(`SELECT id, username, points_total FROM profiles WHERE username LIKE '%Luciffer%' LIMIT 1`);
  const uid = user.rows[0].id;
  const pts = parseInt(user.rows[0].points_total);

  const spent = await client.query(`SELECT get_user_lifetime_fxu_spent($1) as v`, [uid]);
  const earned = await client.query(`SELECT get_user_market_earnings($1) as v`, [uid]);
  const fxuCredit = Math.max(0, parseFloat(spent.rows[0].v) - parseFloat(earned.rows[0].v));

  console.log(`\nLuciffer: pts=${pts} fxu_credit=${fxuCredit.toFixed(2)}`);
  console.log(`Current limit: ${pts + Math.floor(fxuCredit)}`);
  console.log(`With fix (÷0.001): ${pts} + ${Math.floor(fxuCredit / 0.001)} = ${pts + Math.floor(fxuCredit / 0.001)}`);

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
