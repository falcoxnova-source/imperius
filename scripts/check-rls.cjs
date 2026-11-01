const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();
  
  // 1. Check current discount in calculate_fxu_cost_building
  const { rows: buildFn } = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'calculate_fxu_cost_building'
  `);
  console.log('=== calculate_fxu_cost_building VIP discount ===');
  if (buildFn.length > 0) {
    const match = buildFn[0].prosrc.match(/v_cost\s*:=\s*v_cost\s*\*\s*[\d.]+/);
    console.log(match ? match[0] : 'No VIP discount line found');
    const has050 = buildFn[0].prosrc.includes('* 0.50');
    const has025 = buildFn[0].prosrc.includes('* 0.25');
    console.log(`  Has *0.50: ${has050}, Has *0.25: ${has025}`);
  }
  
  // 2. Check current discount in secure_abandon_colony 
  const { rows: abandonFn } = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'secure_abandon_colony'
  `);
  console.log('\n=== secure_abandon_colony VIP discount ===');
  if (abandonFn.length > 0) {
    const match = abandonFn[0].prosrc.match(/v_fxu_fee\s*:=\s*v_fxu_fee\s*\*\s*[\d.]+/);
    console.log(match ? match[0] : 'No VIP discount line found');
  }

  // 3. Check plus_plans durations
  const { rows: plans } = await c.query(`
    SELECT code, name, duration_months, price_fxu, price_usdt 
    FROM plus_plans ORDER BY duration_months
  `);
  console.log('\n=== Plus Plans ===');
  for (const p of plans) {
    console.log(`  ${p.code}: ${p.name} - ${p.duration_months}mo - ${p.price_fxu} FXU / $${p.price_usdt}`);
  }

  // 4. Check instant_complete_research for VIP
  const { rows: researchFn } = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'instant_complete_research'
  `);
  console.log('\n=== instant_complete_research VIP check ===');
  if (researchFn.length > 0) {
    const hasPlus = researchFn[0].prosrc.includes('is_user_plus');
    const has050 = researchFn[0].prosrc.includes('* 0.50');
    console.log(`  Has is_user_plus check: ${hasPlus}`);
    console.log(`  Has *0.50 discount: ${has050}`);
  }

  await c.end();
}


main().catch(e => { console.error(e.message); c.end(); });
