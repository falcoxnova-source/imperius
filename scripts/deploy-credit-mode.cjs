const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function deploy() {
  await client.connect();
  console.log('Connected to database');

  // Read migration to extract the two big functions
  const sql = fs.readFileSync('supabase/migrations/20260329210000_dual_limit_fxu_resources.sql', 'utf8');

  // 1. Deploy create_market_listing
  console.log('\n1. Deploying create_market_listing (conditional mode)...');
  const createMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.create_market_listing\([\s\S]*?\$function\$;/);
  if (!createMatch) throw new Error('Could not find create_market_listing');
  await client.query(createMatch[0]);
  console.log('   ✅ Done');

  // 2. Deploy get_my_monthly_market_sales
  console.log('\n2. Deploying get_my_monthly_market_sales (has_credit flag)...');
  const getMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.get_my_monthly_market_sales\([\s\S]*?\$function\$;/);
  if (!getMatch) throw new Error('Could not find get_my_monthly_market_sales');
  await client.query(getMatch[0]);
  console.log('   ✅ Done');

  // 3. Verify
  console.log('\n========== VERIFICATION ==========');
  const players = await client.query(`
    SELECT p.username,
      COALESCE(p.points_total,0) as points,
      calculate_running_fxu_credit(p.id) as credit,
      CASE WHEN calculate_running_fxu_credit(p.id) > 0 THEN 'CREDIT MODE (no unit limit)' ELSE 'POINTS MODE (unit limit: ' || COALESCE(p.points_total,0) || ')' END as mode
    FROM profiles p
    WHERE LOWER(p.username) LIKE '%luciffer%' OR LOWER(p.username) LIKE '%maikol%' AND LENGTH(p.username) < 10
    ORDER BY p.username
  `);

  for (const r of players.rows) {
    console.log(`\n${r.username}:`);
    console.log(`  Puntos: ${Number(r.points).toLocaleString()}`);
    console.log(`  Credito: ${Number(r.credit).toLocaleString()} FXU`);
    console.log(`  Modo: ${r.mode}`);
  }

  // Test: a user with 0 credit
  const noCredit = await client.query(`
    SELECT p.username,
      COALESCE(p.points_total,0) as points,
      calculate_running_fxu_credit(p.id) as credit
    FROM profiles p
    WHERE get_user_lifetime_fxu_spent(p.id) = 0
      AND COALESCE(p.points_total,0) > 0
    ORDER BY p.points_total DESC LIMIT 1
  `);
  if (noCredit.rows.length > 0) {
    const u = noCredit.rows[0];
    console.log(`\nUsuario SIN inversion (${u.username}): credit=${Number(u.credit).toLocaleString()}, mode=POINTS (limit=${Number(u.points).toLocaleString()} units)`);
  }

  await client.end();
  console.log('\n✅ All deployed successfully');
}

deploy().catch(e => { console.error(e); process.exit(1); });
