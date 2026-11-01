const { Client } = require('pg');
const fs = require('fs');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async()=>{
  await c.connect();
  const sql = fs.readFileSync('d:\\Falco-Xnova Bolt\\supabase\\migrations\\20260506_fix_lunar_base_all_queue_paths.sql','utf8');
  try {
    await c.query(sql);
    console.log('Migration applied OK');
  } catch(e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
  await c.end();
})();
