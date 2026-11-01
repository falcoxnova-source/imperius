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
  console.log('Connected\n');

  await client.query(`
CREATE OR REPLACE FUNCTION public.calculate_fxu_weekly_limit(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fxu_credit numeric;
BEGIN
  -- Only investment recovery credit, points are separate
  v_fxu_credit := calculate_running_fxu_credit(p_user_id);

  RETURN v_fxu_credit;
END;
$function$;
  `);

  console.log('✅ calculate_fxu_weekly_limit = fxu_credit only\n');

  const { rows } = await client.query(`
    SELECT 
      p.username,
      p.points_total,
      calculate_running_fxu_credit(p.id) as fxu_credit,
      calculate_fxu_weekly_limit(p.id) as fxu_limit
    FROM profiles p
    WHERE p.points_total > 0
    ORDER BY p.points_total DESC
    LIMIT 10
  `);

  console.log('=== VERIFICATION ===');
  for (const r of rows) {
    console.log(`${r.username}: points=${Number(r.points_total).toLocaleString()} | fxu_credit=${Number(r.fxu_credit).toLocaleString()} | fxu_limit=${Number(r.fxu_limit).toLocaleString()}`);
  }

  await client.end();
}

deploy().catch(e => { console.error(e); process.exit(1); });
