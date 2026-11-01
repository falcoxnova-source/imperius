const { Client } = require('pg');

const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};

(async () => {
  const c = new Client(cfg);
  await c.connect();
  try {
    const authFn = await c.query(`
      SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='auth' AND p.proname='uid'
    `);
    console.log('--- auth.uid() ---');
    console.log(authFn.rows[0]?.def || '(no existe)');

    const admin = await c.query(`
      SELECT id, username, fxu_balance, usdt_balance
      FROM profiles WHERE is_admin=true ORDER BY created_at ASC LIMIT 1
    `);
    console.log('\n--- admin principal ---');
    console.log(admin.rows[0]);

    const candWithRef = await c.query(`
      SELECT id, username, referred_by, fxu_balance, usdt_balance
      FROM profiles
      WHERE is_admin=false
        AND referred_by IS NOT NULL
        AND fxu_balance >= 500
        AND usdt_balance >= 500
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log('\n--- candidatos CON referrer (FXU>=500, USDT>=500) ---');
    console.table(candWithRef.rows);

    const candNoRef = await c.query(`
      SELECT id, username, referred_by, fxu_balance, usdt_balance
      FROM profiles
      WHERE is_admin=false
        AND referred_by IS NULL
        AND fxu_balance >= 500
        AND usdt_balance >= 500
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log('\n--- candidatos SIN referrer ---');
    console.table(candNoRef.rows);

    const jp = await c.query(`SELECT * FROM jackpot LIMIT 1`);
    console.log('\n--- jackpot ---');
    console.log(jp.rows[0]);
  } finally {
    await c.end();
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });
