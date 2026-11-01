const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  // Check owner of all SECURITY DEFINER functions in public
  const r = await c.query(`
    SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef = true
    ORDER BY owner, p.proname`);
  const byOwner = {};
  r.rows.forEach(x => { byOwner[x.owner] = (byOwner[x.owner]||0)+1; });
  console.log('SECURITY DEFINER function owners:');
  Object.entries(byOwner).forEach(([o,n]) => console.log(`  ${o}: ${n}`));
  // Show any not owned by postgres
  const nonPg = r.rows.filter(x => x.owner !== 'postgres');
  if (nonPg.length) {
    console.log('\nFunctions NOT owned by postgres (would be blocked by trigger):');
    nonPg.slice(0,20).forEach(x => console.log(`  - ${x.proname} (owner=${x.owner})`));
    if (nonPg.length > 20) console.log(`  ...and ${nonPg.length-20} more`);
  } else {
    console.log('\n✅ All SECURITY DEFINER functions owned by postgres');
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
