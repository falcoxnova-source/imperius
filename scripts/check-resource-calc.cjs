const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});

async function run() {
  await c.connect();

  // 1. Get the officer bonus function
  console.log('=== get_user_officer_bonuses ===');
  const { rows: [fn1] } = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'get_user_officer_bonuses'
  `);
  if (fn1) console.log(fn1.prosrc);
  else console.log('NOT FOUND');

  // 2. Get calculate_planet_resources full source
  console.log('\n=== calculate_planet_resources (FULL) ===');
  const { rows: [fn2] } = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'calculate_planet_resources'
  `);
  if (fn2) console.log(fn2.prosrc);
  else console.log('NOT FOUND');

  // 3. Check sample VIP players
  console.log('\n=== Sample VIP players ===');
  const { rows: vips } = await c.query(`
    SELECT p.id, p.username, p.is_vip, p.vip_until,
           p.has_commander, p.has_admiral, p.has_engineer, 
           p.has_geologist, p.has_technocrat
    FROM profiles p WHERE p.is_vip = true LIMIT 3
  `);
  vips.forEach(v => {
    console.log(`  ${v.username}: VIP=${v.is_vip} until=${v.vip_until}`);
    console.log(`    cmd=${v.has_commander} adm=${v.has_admiral} eng=${v.has_engineer} geo=${v.has_geologist} tech=${v.has_technocrat}`);
  });

  // 4. Search all functions for VIP/geologist bonus logic
  console.log('\n=== Functions mentioning VIP or geologist ===');
  const { rows: fns } = await c.query(`
    SELECT proname, prosrc FROM pg_proc 
    WHERE prosrc ILIKE '%is_vip%' OR prosrc ILIKE '%geologist%' OR prosrc ILIKE '%geologo%'
    ORDER BY proname
  `);
  fns.forEach(f => {
    const lines = f.prosrc.split('\n').filter(l => 
      /vip|geologist|geologo|officer.*bonus|bonus.*officer|production_mult/i.test(l)
    );
    if (lines.length > 0) {
      console.log(`\n  >> ${f.proname}:`);
      lines.forEach(l => console.log(`    ${l.trim()}`));
    }
  });

  await c.end();
}
run().catch(console.error);
