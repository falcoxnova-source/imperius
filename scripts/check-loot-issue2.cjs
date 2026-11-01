const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*'
});

c.connect().then(async () => {
  // The two attacks on the moon [2:81:7] (planet d89b8446)
  const ids = [
    'f09b68a4-9fb3-470f-999c-24bc3ba01bc9', // 21:31 - first attack (7 Death Stars)
    '1cabfb3a-68c2-4c36-9746-9f0cb8e22e75', // 21:38 - second attack (345 Large Cargo)
  ];
  
  for (const id of ids) {
    const r = await c.query(`SELECT * FROM battle_reports WHERE id = $1`, [id]);
    const b = r.rows[0];
    const rd = typeof b.report_data === 'string' ? JSON.parse(b.report_data) : b.report_data;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Battle: ${b.created_at} | Result: ${b.result}`);
    console.log(`Loot: M=${b.loot_metal} C=${b.loot_crystal} D=${b.loot_deuterium}`);
    console.log(`\nFull report_data:`);
    console.log(JSON.stringify(rd, null, 2));
  }

  // Also check the target moon resources
  const moon = await c.query(`
    SELECT id, name, planet_type, metal, crystal, deuterium, owner_id
    FROM planets 
    WHERE id = 'd89b8446-9d73-47d5-ae7f-2d19caa2ad9c'
  `);
  console.log('\n=== TARGET MOON CURRENT STATE ===');
  console.log(JSON.stringify(moon.rows[0], null, 2));

  c.end();
}).catch(e => { console.error(e.message); c.end(); });
