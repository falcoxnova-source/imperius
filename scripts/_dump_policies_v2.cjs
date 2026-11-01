const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT tablename, policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('planet_resources','planet_buildings','planet_ships','planet_defenses','user_technologies')
    ORDER BY tablename, policyname`);
  r.rows.forEach(p => {
    console.log(`\n📋 ${p.tablename} · ${p.policyname}`);
    console.log(`   cmd=${p.cmd}  roles=${p.roles}`);
    console.log(`   qual=${p.qual}`);
    console.log(`   with_check=${p.with_check}`);
  });
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
