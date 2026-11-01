// Lista funciones vivas en la BD cuyo cuerpo contiene la fórmula 1+(level*3)
const pg = require('pg');
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
  const r = await c.query(`
    select proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~ '1\\s*\\+\\s*\\(?[a-zA-Z_.]*level[a-zA-Z_.]*\\s*\\*\\s*3'
    order by proname
  `);
  console.log('Functions referencing 1 + (...level... * 3):');
  for (const row of r.rows) {
    console.log(' -', row.proname);
  }
  console.log('Total:', r.rows.length);
  await c.end();
})();
