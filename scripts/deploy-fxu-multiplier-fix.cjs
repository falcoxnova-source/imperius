const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function deploy() {
  await client.connect();
  console.log('Connected to DB\n');

  // Deploy updated calculate_fxu_weekly_limit with points × 1
  const sql = `
CREATE OR REPLACE FUNCTION public.calculate_fxu_weekly_limit(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_points integer;
  v_fxu_credit numeric;
  v_points_as_fxu numeric;
BEGIN
  SELECT COALESCE(points_total, 0) INTO v_user_points FROM profiles WHERE id = p_user_id;

  -- Running balance: past earnings don't absorb future investments
  v_fxu_credit := calculate_running_fxu_credit(p_user_id);

  -- points × 1 (each point = 1 FXU of limit)
  v_points_as_fxu := v_user_points * 1;

  RETURN v_points_as_fxu + v_fxu_credit;
END;
$function$;
  `;

  await client.query(sql);
  console.log('✅ calculate_fxu_weekly_limit updated (points × 1)\n');

  // Verify with some users
  const { rows } = await client.query(`
    SELECT 
      p.username,
      p.points_total,
      calculate_running_fxu_credit(p.id) as fxu_credit,
      calculate_fxu_weekly_limit(p.id) as fxu_limit,
      (p.points_total * 1) as points_x1,
      (p.points_total * 0.001) as old_points_x_minprice
    FROM profiles p
    WHERE p.points_total > 0
    ORDER BY p.points_total DESC
    LIMIT 10
  `);

  console.log('=== VERIFICATION (top 10 by points) ===');
  console.log('Formula: fxu_limit = (points × 1) + fxu_credit\n');
  for (const r of rows) {
    console.log(`${r.username}:`);
    console.log(`  Points: ${Number(r.points_total).toLocaleString()}`);
    console.log(`  OLD (×0.001): ${Number(r.old_points_x_minprice).toLocaleString()} FXU base`);
    console.log(`  NEW (×1):     ${Number(r.points_x1).toLocaleString()} FXU base`);
    console.log(`  FXU Credit:   ${Number(r.fxu_credit).toLocaleString()}`);
    console.log(`  FXU Limit:    ${Number(r.fxu_limit).toLocaleString()} FXU`);
    console.log('');
  }

  await client.end();
  console.log('Done!');
}

deploy().catch(e => { console.error(e); process.exit(1); });
