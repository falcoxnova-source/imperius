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

  const emails = ['dark@gmail.com', 'hernandezrojasreinel@gmail.com', 'samaileal01@gmail.com'];
  const users = await c.query(
    `SELECT u.id, u.email, p.username FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE u.email = ANY($1)`,
    [emails]
  );

  const PLAN_ID = 3; // VIP Anual (12 meses)
  const COMMISSION = 1.5;

  for (const u of users.rows) {
    // Desactivar cualquier suscripción activa previa
    await c.query(
      `UPDATE plus_subscriptions SET is_active = false WHERE user_id = $1 AND is_active = true`,
      [u.id]
    );

    // Insertar nueva suscripción VIP Anual (1 año exacto)
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
    console.log(`✅ ${u.username.padEnd(12)} (${u.email}) → VIP Anual hasta ${r.rows[0].expires_at.toISOString()}`);
  }

  console.log('\n=== Verificación ===');
  const verify = await c.query(`
    SELECT p.username, u.email, pp.name AS plan, ps.started_at, ps.expires_at, ps.is_active
    FROM plus_subscriptions ps
    JOIN auth.users u ON u.id = ps.user_id
    LEFT JOIN profiles p ON p.id = ps.user_id
    JOIN plus_plans pp ON pp.id = ps.plan_id
    WHERE u.email = ANY($1) AND ps.is_active = true
    ORDER BY p.username
  `, [emails]);
  console.table(verify.rows);

  await c.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
