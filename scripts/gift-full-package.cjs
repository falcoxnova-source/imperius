const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

const EMAIL = 'hernandezrojasreinel@gmail.com';

async function main() {
  await c.connect();

  // 1. Find user + main planet + storage capacities
  const { rows: users } = await c.query(`
    SELECT p.id, p.username, pl.id as planet_id, pl.name as planet_name,
           pr.metal, pr.crystal, pr.deuterium,
           pr.metal_storage, pr.crystal_storage, pr.deuterium_storage
    FROM profiles p
    JOIN auth.users au ON au.id = p.id
    JOIN planets pl ON pl.user_id = p.id AND pl.is_main_planet = true
    JOIN planet_resources pr ON pr.planet_id = pl.id
    WHERE LOWER(au.email) = LOWER($1)
  `, [EMAIL]);

  if (!users.length) { console.log('Usuario no encontrado'); await c.end(); return; }
  const u = users[0];
  console.log(`Usuario: ${u.username} (${u.id})`);
  console.log(`Planeta: ${u.planet_name} (${u.planet_id})`);
  console.log(`Almacenes: Metal=${Number(u.metal_storage).toLocaleString()} | Crystal=${Number(u.crystal_storage).toLocaleString()} | Deut=${Number(u.deuterium_storage).toLocaleString()}`);
  console.log(`Actual:    Metal=${Number(u.metal).toLocaleString()} | Crystal=${Number(u.crystal).toLocaleString()} | Deut=${Number(u.deuterium).toLocaleString()}`);

  // 2. Graviton level 1
  const { rows: grav } = await c.query(`SELECT id FROM technology_types WHERE code = 'graviton_tech'`);
  await c.query(`
    INSERT INTO user_technologies (user_id, technology_type_id, level)
    VALUES ($1, $2, 1)
    ON CONFLICT (user_id, technology_type_id)
    DO UPDATE SET level = GREATEST(user_technologies.level, 1)
    RETURNING level
  `, [u.id, grav[0].id]);
  console.log('✅ Gravitón nivel 1');

  // 3. VIP Semanal
  const { rows: plans } = await c.query(`SELECT id, name FROM plus_plans WHERE duration_days = 7`);
  const { rows: existing } = await c.query(`
    SELECT id FROM plus_subscriptions WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
  `, [u.id]);

  if (existing.length) {
    console.log('⚠️ Ya tiene VIP activo');
  } else {
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { rows: sub } = await c.query(`
      INSERT INTO plus_subscriptions (user_id, plan_id, created_at, expires_at, is_active, payment_type, amount_paid, commission_share_percent)
      VALUES ($1, $2, NOW(), $3, true, 'usdt', 0, 0)
      RETURNING id, expires_at
    `, [u.id, plans[0].id, endDate.toISOString()]);
    console.log(`✅ VIP Semanal hasta: ${sub[0].expires_at}`);
  }

  // 4. Fill storages to max
  await c.query(`
    UPDATE planet_resources
    SET metal = metal_storage, crystal = crystal_storage, deuterium = deuterium_storage
    WHERE planet_id = $1
    RETURNING metal, crystal, deuterium
  `, [u.planet_id]).then(r => {
    const res = r.rows[0];
    console.log(`✅ Almacenes llenos: Metal=${Number(res.metal).toLocaleString()} | Crystal=${Number(res.crystal).toLocaleString()} | Deut=${Number(res.deuterium).toLocaleString()}`);
  });

  // 5. Message
  await c.query(`
    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (NULL, $1, '🎁 ¡Regalo del Equipo Falco-X!',
      '¡Felicidades! El equipo de Falco-Xnova te ha otorgado:\n\n' ||
      '🔬 Tecnología Gravitón Nivel 1\n' ||
      '⭐ Suscripción VIP Semanal (7 días)\n' ||
      '📦 Almacenes de recursos llenos al máximo\n\n' ||
      '¡Disfruta de los beneficios!',
      'system')
  `, [u.id]);
  console.log('✅ Mensaje enviado');

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
