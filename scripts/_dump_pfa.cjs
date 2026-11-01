const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
async function main() {
  await c.connect();
  const r = await c.query(`SELECT pg_get_functiondef(p.oid) AS src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='process_fleet_arrival' LIMIT 1`);
  const src = r.rows[0].src;
  require('fs').writeFileSync('_tmp_pfa.sql', src);
  console.log('written, len=', src.length);
  // Hunt damage block
  const idx = src.indexOf('v_bld_record');
  if (idx >= 0) {
    console.log('--- DAMAGE BLOCK (around v_bld_record FOR loop) ---');
    const start = src.lastIndexOf('FOR v_bld_record', idx + 5000);
    const end   = src.indexOf('END LOOP', start);
    console.log(src.substring(start === -1 ? Math.max(0, idx-500) : start, (end === -1 ? idx + 3000 : end + 9)));
    console.log('--- END BLOCK ---');
  } else {
    console.log('NO v_bld_record found in function');
  }
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
