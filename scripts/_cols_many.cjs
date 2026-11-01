const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });

(async () => {
  await c.connect();
  for (const t of ['planets','planet_resources','user_wallets','alliances','user_officers','user_technologies','planet_ships','planet_buildings','planet_defenses','building_queue','research_queue','shipyard_queue']) {
    const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t]);
    console.log(`\n=== ${t} ===\n  `, r.rows.map(x=>x.column_name).join(', '));
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
