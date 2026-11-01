const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();
  try {
    let user = null;
    try {
      const p1 = await c.query(
        `SELECT p.id, p.username, p.email FROM profiles p WHERE lower(p.email) = 'dark@gmail.com' LIMIT 1`
      );
      if (p1.rows.length) user = p1.rows[0];
    } catch {}

    if (!user) {
      const p2 = await c.query(
        `SELECT p.id, p.username, au.email
           FROM auth.users au
           JOIN profiles p ON p.id = au.id
          WHERE lower(au.email) = 'dark@gmail.com' LIMIT 1`
      );
      if (p2.rows.length) user = p2.rows[0];
    }

    if (!user) {
      console.log('No se encontró cuenta con email dark@gmail.com');
      return;
    }
    console.log('Usuario:', user);

    const plan = await c.query(`SELECT * FROM plus_plans WHERE id = 3`);
    if (!plan.rows.length) throw new Error('Plan id=3 no existe');
    console.log('Plan:', plan.rows[0].name, plan.rows[0].commission_share_percent + '% commission');

    await c.query(
      `UPDATE plus_subscriptions SET is_active = false WHERE user_id = $1 AND is_active = true`,
      [user.id]
    );

    const ins = await c.query(
      `INSERT INTO plus_subscriptions (
         user_id, plan_id, payment_type, amount_paid,
         started_at, expires_at, is_active, commission_share_percent
       ) VALUES (
         $1, 3, 'fxu', 0,
         now(), now() + interval '12 months', true, $2
       )
       RETURNING id, started_at, expires_at, is_active, commission_share_percent`,
      [user.id, plan.rows[0].commission_share_percent]
    );
    console.log('VIP Anual (12 meses) concedido:', ins.rows[0]);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await c.end();
  }
})();
