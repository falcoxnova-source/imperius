const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const email = 'jenserfs@gmail.com';
  const users = await c.query(
    `SELECT u.id, u.email, p.username FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE u.email = $1`,
    [email]
  );

  if (users.rows.length === 0) {
    console.log('Usuario no encontrado con email:', email);
    await c.end();
    return;
  }

  const u = users.rows[0];
  console.log(`Usuario encontrado: ${u.username} (${u.email})`);

  const PLAN_ID = 3;
  const COMMISSION = 1.5;

  await c.query(
    `UPDATE plus_subscriptions SET is_active = false WHERE user_id = $1 AND is_active = true`,
    [u.id]
  );

  const r = await c.query(
    `INSERT INTO plus_subscriptions
       (user_id, plan_id, payment_type, amount_paid,
        started_at, expires_at, is_active, commission_share_percent)
     VALUES
       ($1, $2, 'usdt', 0,
        now(), now() + interval '1 year', true, $3)
     RETURNING id, started_at, expires_at`,
    [u.id, PLAN_ID, COMMISSION]
  );
  console.log(`VIP Anual activado hasta ${r.rows[0].expires_at.toISOString()}`);

  const verify = await c.query(`
    SELECT p.username, pp.name AS plan, ps.started_at, ps.expires_at, ps.is_active
    FROM plus_subscriptions ps
    LEFT JOIN profiles p ON p.id = ps.user_id
    JOIN plus_plans pp ON pp.id = ps.plan_id
    WHERE ps.user_id = $1 AND ps.is_active = true
  `, [u.id]);
  console.log('Verificacion:');
  console.table(verify.rows);

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
