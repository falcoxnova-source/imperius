const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

c.connect().then(async () => {
  // 1. Find user by email
  const userRes = await c.query(`
    SELECT p.id, p.username, p.fxu_balance, au.email
    FROM profiles p
    JOIN auth.users au ON au.id = p.id
    WHERE LOWER(au.email) = LOWER('Ronaldolara466@gmail.com')
  `);

  if (userRes.rows.length === 0) {
    console.log('ERROR: No se encontro usuario con ese email');
    c.end();
    return;
  }

  const user = userRes.rows[0];
  console.log(`Usuario encontrado: ${user.username} (${user.email})`);

  // 2. Check if already has active VIP
  const subCheck = await c.query(`
    SELECT id, expires_at FROM plus_subscriptions
    WHERE user_id = $1 AND is_active = true AND expires_at > now()
  `, [user.id]);

  if (subCheck.rows.length > 0) {
    console.log(`AVISO: Ya tiene VIP activo hasta ${subCheck.rows[0].expires_at}`);
    console.log('Abortando para no duplicar. Si quieres forzar, modifica el script.');
    c.end();
    return;
  }

  // 3. Get weekly plan ID
  const planRes = await c.query(`
    SELECT id, name, price_usdt, price_fxu, duration_days
    FROM plus_plans WHERE code = 'plus_weekly' AND is_active = true
  `);

  if (planRes.rows.length === 0) {
    console.log('ERROR: Plan semanal no encontrado');
    c.end();
    return;
  }

  const plan = planRes.rows[0];
  console.log(`Plan: ${plan.name} - $${plan.price_usdt} USDT / ${plan.duration_days} dias`);

  // 4. Insert subscription (gift - no charge)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  const subRes = await c.query(`
    INSERT INTO plus_subscriptions (user_id, plan_id, payment_type, amount_paid, expires_at, is_active, commission_share_percent)
    VALUES ($1, $2, 'usdt', 0, $3, true, 0)
    RETURNING id, expires_at
  `, [user.id, plan.id, expiresAt.toISOString()]);

  console.log(`VIP activado! ID: ${subRes.rows[0].id}`);
  console.log(`Expira: ${subRes.rows[0].expires_at}`);

  // 5. Send in-game message
  const adminRes = await c.query(`SELECT id FROM profiles WHERE is_admin = true LIMIT 1`);
  const adminId = adminRes.rows[0]?.id || user.id;

  await c.query(`
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES ($1, $2, 
      '🎁 ¡Regalo VIP del Equipo Falco-X!',
      '¡Hola Comandante!\n\nEl equipo de Falco-X Universo quiere agradecerte por tu apoyo constante a la comunidad.\n\nComo muestra de nuestro agradecimiento, te hemos activado una suscripción VIP Semanal (7 días) totalmente GRATIS.\n\nDurante estos 7 días disfrutarás de todos los beneficios VIP:\n• Comisión de mercado reducida al 7.5%\n• 50% descuento en completar edificios e investigaciones al instante\n• 25% descuento en completar astillero al instante\n• +10% producción de recursos\n• -10% tiempo de construcción, investigación y vuelo\n• Mercado sin límites semanales\n• 50% descuento en lotería\n• Notificaciones por Telegram\n• ¡Y mucho más!\n\nGracias por ser parte de esta galaxia. ¡Que las estrellas te sean favorables!\n\n— El Equipo Falco-X 🚀',
      'system')
  `, [user.id, adminId]);

  console.log('Mensaje enviado!');
  console.log('\n=== RESUMEN ===');
  console.log(`Usuario: ${user.username} (${user.email})`);
  console.log(`VIP Semanal activado GRATIS (regalo)`);
  console.log(`Expira: ${expiresAt.toLocaleDateString('es-ES')}`);
  console.log('Mensaje de regalo enviado correctamente');

  c.end();
}).catch(e => { console.error(e.message); c.end(); });
