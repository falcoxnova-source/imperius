const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    await c.query('BEGIN');
    const before = await c.query(`SELECT username, fxu_balance, usdt_balance FROM profiles WHERE id='fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6'`);
    console.log('Antes:', before.rows[0]);
    await c.query(`UPDATE profiles SET usdt_balance=15.42 WHERE id='fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6'`);
    const after = await c.query(`SELECT username, fxu_balance, usdt_balance FROM profiles WHERE id='fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6'`);
    console.log('Después:', after.rows[0]);
    await c.query('COMMIT');
    console.log('✓ COMMIT');
  } catch(e) {
    await c.query('ROLLBACK');
    console.error('ROLLBACK:', e.message);
    process.exitCode=1;
  } finally { await c.end(); }
})();
