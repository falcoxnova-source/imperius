const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const trg = await c.query(`SELECT t.tgname, pg_get_triggerdef(t.oid) def FROM pg_trigger t WHERE t.tgrelid='public.ship_requirements'::regclass AND NOT t.tgisinternal`);
  console.log('triggers:', trg.rows);

  // check current row
  const sid = (await c.query("SELECT id FROM ship_types WHERE code='falco_x_clasica'")).rows[0].id;
  const before = await c.query(`SELECT id, required_tech_id, required_tech_level FROM ship_requirements WHERE ship_type_id=$1 AND required_tech_id IS NOT NULL`, [sid]);
  console.log('before:', before.rows);

  // try update one row directly
  const upd = await c.query(`UPDATE ship_requirements SET required_tech_level=99 WHERE id=$1 RETURNING *`, [before.rows[0].id]);
  console.log('upd result:', upd.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
