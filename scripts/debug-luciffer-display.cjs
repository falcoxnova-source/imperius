const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  // Get Luciffer's ID
  const { rows: [luc] } = await client.query(`
    SELECT id, username, points_total FROM profiles WHERE username ILIKE '%luciffer%'
  `);
  console.log('Luciffer:', luc.id, luc.username, 'pts:', luc.points_total);

  // 1. Check what get_my_monthly_market_sales would return
  // (Can't call it directly because it uses auth.uid(), so simulate it)
  
  // Check get_user_lifetime_fxu_spent
  const { rows: [spent] } = await client.query(
    `SELECT get_user_lifetime_fxu_spent($1) as val`, [luc.id]
  );
  console.log('\nget_user_lifetime_fxu_spent:', spent.val);

  // Check get_user_market_earnings
  const { rows: [earned] } = await client.query(
    `SELECT get_user_market_earnings($1) as val`, [luc.id]
  );
  console.log('get_user_market_earnings:', earned.val);

  // Check calculate_fxu_weekly_limit
  const { rows: [limit] } = await client.query(
    `SELECT calculate_fxu_weekly_limit($1) as val`, [luc.id]
  );
  console.log('calculate_fxu_weekly_limit:', limit.val);

  // 2. Check the ACTUAL function definition of get_my_monthly_market_sales
  const { rows: [funcDef] } = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'get_my_monthly_market_sales'
  `);
  console.log('\n=== FUNCTION get_my_monthly_market_sales ===');
  console.log(funcDef.prosrc);

  // 3. Check if the function returns fxu_spent, fxu_earned, fxu_credit in the result
  const hasFields = funcDef.prosrc;
  console.log('\n=== FIELD CHECKS ===');
  console.log('Has fxu_spent:', hasFields.includes('fxu_spent'));
  console.log('Has fxu_earned:', hasFields.includes('fxu_earned'));
  console.log('Has fxu_credit:', hasFields.includes('fxu_credit'));
  console.log('Has fxu_limit:', hasFields.includes('fxu_limit'));
  console.log('Has fxu_value_remaining:', hasFields.includes('fxu_value_remaining'));
  console.log('Has fxu_value_sold:', hasFields.includes('fxu_value_sold'));

  // 4. Check what Luciffer's market_monthly_sales looks like this week
  const yearWeek = new Date().toISOString(); // Just check all recent
  const { rows: sales } = await client.query(`
    SELECT * FROM market_monthly_sales 
    WHERE user_id = $1 
    ORDER BY year_month DESC 
    LIMIT 5
  `, [luc.id]);
  console.log('\n=== MARKET_MONTHLY_SALES for Luciffer ===');
  sales.forEach(s => console.log(s));

  // 5. Check fxu_value_sold tracking
  const { rows: weekSales } = await client.query(`
    SELECT year_month, fxu_value_sold 
    FROM market_monthly_sales 
    WHERE user_id = $1 
    ORDER BY year_month DESC LIMIT 5
  `, [luc.id]);
  console.log('\n=== FXU_VALUE_SOLD tracking ===');
  weekSales.forEach(s => console.log(`${s.year_month}: fxu_value_sold = ${s.fxu_value_sold}`));

  // 6. Check active listings FXU value
  const { rows: [activeVal] } = await client.query(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(quantity * price_per_unit), 0) as fxu_value
    FROM market_listings
    WHERE seller_id = $1 AND status = 'active'
      AND listing_type IN ('resource', 'ship')
      AND created_at >= date_trunc('week', now())
  `, [luc.id]);
  console.log('\n=== ACTIVE LISTINGS THIS WEEK ===');
  console.log(`Count: ${activeVal.cnt}, FXU value: ${activeVal.fxu_value}`);

  // ALL active listings (not just this week)
  const { rows: [allActive] } = await client.query(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(quantity * price_per_unit), 0) as fxu_value
    FROM market_listings
    WHERE seller_id = $1 AND status = 'active'
      AND listing_type IN ('resource', 'ship')
  `, [luc.id]);
  console.log(`ALL active: Count: ${allActive.cnt}, FXU value: ${allActive.fxu_value}`);

  // 7. Simulate what the function would calculate
  const fxuSpent = parseFloat(spent.val);
  const fxuEarned = parseFloat(earned.val);
  const fxuCredit = Math.max(0, fxuSpent - fxuEarned);
  const fxuLimit = parseFloat(limit.val);
  const fxuValueSold = weekSales.length > 0 ? parseFloat(weekSales[0].fxu_value_sold || 0) : 0;
  const activeFxuValue = parseFloat(activeVal.fxu_value);
  const totalFxuUsed = fxuValueSold + activeFxuValue;
  const fxuRemaining = Math.max(0, fxuLimit - totalFxuUsed);

  console.log('\n=== SIMULATED RETURN VALUES ===');
  console.log(`fxu_spent: ${fxuSpent}`);
  console.log(`fxu_earned: ${fxuEarned}`);
  console.log(`fxu_credit: ${Math.floor(fxuCredit)}`);
  console.log(`fxu_limit: ${fxuLimit}`);
  console.log(`fxu_value_sold: ${totalFxuUsed}`);
  console.log(`fxu_value_remaining: ${fxuRemaining}`);

  // 8. Check if the DEPLOYED build is the new one
  console.log('\n=== BUILD CHECK ===');
  const fs = require('fs');
  const distPath = 'D:\\Falco-Xnova Bolt\\dist\\assets';
  if (fs.existsSync(distPath)) {
    const files = fs.readdirSync(distPath).filter(f => f.startsWith('index-') && f.endsWith('.js'));
    files.forEach(f => {
      const content = fs.readFileSync(`${distPath}/${f}`, 'utf8');
      console.log(`File: ${f}`);
      console.log(`Contains fxu_credit: ${content.includes('fxu_credit')}`);
      console.log(`Contains fxu_limit: ${content.includes('fxu_limit')}`);
      console.log(`Contains fxu_value_remaining: ${content.includes('fxu_value_remaining')}`);
    });
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
