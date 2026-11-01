const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*'
});

c.connect().then(async () => {
  // 1. Find user
  const r = await c.query(`SELECT id, username, email FROM profiles WHERE LOWER(email) = LOWER('Abreu.figeroa.gustavo91@gmail.com')`);
  console.log('=== USER ===');
  console.log(JSON.stringify(r.rows, null, 2));
  
  if (r.rows.length > 0) {
    const userId = r.rows[0].id;
    
    // 2. Get columns
    const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='battle_reports' ORDER BY ordinal_position`);
    console.log('\n=== COLUMNS ===');
    console.log(cols.rows.map(x => x.column_name).join(', '));

    // 3. Recent battle reports as attacker
    const battles = await c.query(`
      SELECT *
      FROM battle_reports 
      WHERE attacker_id = $1
      ORDER BY created_at DESC 
      LIMIT 10
    `, [userId]);
    console.log('\n=== RECENT BATTLES (attacker) === count:', battles.rows.length);
    for (const b of battles.rows) {
      console.log(`\n  ID: ${b.id} | ${b.created_at} | Result: ${b.result}`);
      // Print all non-null fields
      for (const [k, v] of Object.entries(b)) {
        if (v !== null && k !== 'id' && k !== 'created_at' && k !== 'result') {
          if (k === 'report_data') {
            const rd = typeof v === 'string' ? JSON.parse(v) : v;
            console.log(`    report_data keys: ${Object.keys(rd).join(', ')}`);
            if (rd.attacker_fleet) console.log('    attacker_fleet:', JSON.stringify(rd.attacker_fleet));
            if (rd.loot) console.log('    loot:', JSON.stringify(rd.loot));
            if (rd.defender_resources) console.log('    defender_resources:', JSON.stringify(rd.defender_resources));
            if (rd.total_cargo_capacity) console.log('    total_cargo_capacity:', rd.total_cargo_capacity);
            if (rd.cargo_capacity) console.log('    cargo_capacity:', rd.cargo_capacity);
            if (rd.max_loot) console.log('    max_loot:', JSON.stringify(rd.max_loot));
          } else {
            console.log(`    ${k}: ${JSON.stringify(v)}`);
          }
        }
      }
    }
  }
  
  c.end();
}).catch(e => { console.error(e.message); c.end(); });
