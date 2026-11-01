const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const r = await c.query(`SELECT pg_get_functiondef(oid) AS src FROM pg_proc WHERE proname='process_fleet_arrival'`);
  let src = r.rows[0].src;

  const oldClause = `AND st.code = 'recycler'`;
  const newClause = `AND st.code IN ('recycler','mega_recycler')`;

  if (!src.includes(oldClause)) {
    console.error('ERROR: clause not found in process_fleet_arrival; manual review needed');
    process.exit(1);
  }

  const occurrences = src.split(oldClause).length - 1;
  console.log('Occurrences of old clause:', occurrences);

  src = src.split(oldClause).join(newClause);

  // Strip the leading "CREATE OR REPLACE FUNCTION ... AS $function$" wrapper is already in src; re-execute as-is.
  await c.query(src);
  console.log('process_fleet_arrival updated.');

  // Verify
  const v = await c.query(`SELECT pg_get_functiondef(oid) AS src FROM pg_proc WHERE proname='process_fleet_arrival'`);
  console.log('Now contains mega_recycler clause:', v.rows[0].src.includes(newClause));
  console.log('Old clause still present:', v.rows[0].src.includes(oldClause));

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
