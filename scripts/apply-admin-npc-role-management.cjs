const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260618120000_admin_npc_role_management.sql'), 'utf8');
  try {
    await client.query(sql);
    console.log('✅ Migration applied');
    const r = await client.query(`SELECT proname FROM pg_proc WHERE proname IN ('admin_set_npc_planet_role','admin_set_all_npc_planets_role','admin_distribute_npc_roles')`);
    console.log('Functions installed:', r.rows.map(x => x.proname));
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
