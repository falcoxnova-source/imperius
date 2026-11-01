const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  const tables = ['planets','fleets','planet_resources','login_sessions','battle_reports'];
  for (const t of tables) {
    const r = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${t}' ORDER BY ordinal_position`
    );
    console.log(`\n${t}: ${r.rows.map(x => x.column_name).join(', ')}`);
  }
  await c.end();
})();
