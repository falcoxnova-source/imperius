const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const ut = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='user_technologies' ORDER BY ordinal_position`);
  console.log('user_technologies:', ut.rows.map(x=>x.column_name).join(', '));
  const fns = ['recalculate_all_player_points','update_player_points','update_user_points','update_player_points_no_rank'];
  for (const fn of fns) {
    const r = await c.query(`SELECT pg_get_function_identity_arguments(oid) AS args FROM pg_proc WHERE proname=$1`, [fn]);
    console.log(fn, '->', r.rows.map(x=>x.args).join(' | '));
  }
  await c.end();
})();
