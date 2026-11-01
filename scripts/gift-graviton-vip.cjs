const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

const EMAIL = 'luisernestochacon2406@gmail.com';

async function main() {
  await c.connect();

  // 1. Find user
  const { rows: users } = await c.query(`
    SELECT p.id, p.username
    FROM profiles p
    JOIN auth.users au ON au.id = p.id
    WHERE LOWER(au.email) = LOWER($1)
  `, [EMAIL]);

  if (!users.length) { console.log('Usuario no encontrado'); await c.end(); return; }
  const user = users[0];
  console.log(`Usuario: ${user.username} (${user.id})`);

  // 2. Graviton level 1
  const { rows: grav } = await c.query(`
    SELECT tt.id as tech_id FROM technology_types tt WHERE tt.code = 'graviton_tech'
  `);
  if (!grav.length) { console.log('Graviton tech not found'); await c.end(); return; }
  const techId = grav[0].tech_id;

  const upd = await c.query(`
    INSERT INTO user_technologies (user_id, technology_type_id, level)
    VALUES ($1, $2, 1)
    ON CONFLICT (user_id, technology_type_id)
    DO UPDATE SET level = GREATEST(user_technologies.level, 1)
    RETURNING level
  `, [user.id, techId]);
  console.log(`✅ Graviton nivel: ${upd.rows[0].level}`);

  // 3. VIP Semanal
  const { rows: plans } = await c.query(`
    SELECT id, name, duration_days FROM plus_plans WHERE duration_days = 7
  `);
  if (!plans.length) { console.log('Plan semanal no encontrado'); await c.end(); return; }
  const plan = plans[0];
  console.log(`Plan: ${plan.name} (${plan.duration_days} días)`);

  // Check existing active VIP
  const { rows: existing } = await c.query(`
    SELECT id, expires_at FROM plus_subscriptions
    WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
  `, [user.id]);
  if (existing.length) {
    console.log(`⚠️ Ya tiene VIP activo hasta ${existing[0].expires_at}`);
    await c.end();
    return;
  }

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { rows: sub } = await c.query(`
    INSERT INTO plus_subscriptions (user_id, plan_id, created_at, expires_at, is_active, payment_type, amount_paid, commission_share_percent)
    VALUES ($1, $2, NOW(), $3, true, 'usdt', 0, 0)
    RETURNING id, expires_at
  `, [user.id, plan.id, endDate.toISOString()]);
  console.log(`✅ VIP activado hasta: ${sub[0].expires_at}`);

  // 4. Send message
  await c.query(`
    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (NULL, $1, '🎁 ¡Regalo del Equipo Falco-X!',
      '¡Felicidades! El equipo de Falco-Xnova te ha otorgado los siguientes regalos:\n\n' ||
      '🔬 Tecnología Gravitón Nivel 1\n' ||
      '⭐ Suscripción VIP Semanal (7 días)\n\n' ||
      '¡Disfruta de los beneficios!',
      'system')
  `, [user.id]);
  console.log('✅ Mensaje enviado');

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
