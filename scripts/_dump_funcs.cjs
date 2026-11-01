const pg = require('pg');
const fs = require('fs');
const c = new pg.Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const names = process.argv.slice(2);
  for (const n of names) {
    const r = await c.query(
      "select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=$1",
      [n]
    );
    if (r.rows[0]) {
      fs.writeFileSync(`_tmp_${n}.sql`, r.rows[0].d);
      console.log(n, r.rows[0].d.length);
    } else {
      console.log(n, 'NOT FOUND');
    }
  }
  await c.end();
})();
