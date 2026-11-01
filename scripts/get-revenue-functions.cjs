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

  const funcs = ['get_daily_revenue', 'get_weekly_revenue', 'get_monthly_revenue', 
                 'get_platform_financial_stats', 'get_revenue_summary', 'get_revenue_by_type', 'get_recent_revenue'];
  for (const fn of funcs) {
    const res = await c.query(`SELECT prosrc, proargtypes, pronargs, proargnames, 
      pg_get_function_arguments(oid) as args,
      pg_get_function_result(oid) as result_type
      FROM pg_proc WHERE proname = $1`, [fn]);
    if (res.rows.length > 0) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`=== ${fn}(${res.rows[0].args}) RETURNS ${res.rows[0].result_type} ===`);
      console.log(`${'='.repeat(60)}`);
      console.log(res.rows[0].prosrc);
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
