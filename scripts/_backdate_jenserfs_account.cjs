const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

const EMAIL = 'jenserfs@gmail.com';
// Fecha objetivo: hace ~2 meses y 10 dias (para que muestre claramente >2 meses)
const NEW_CREATED = '2026-02-15 10:00:00+00';

(async () => {
  await c.connect();

  // 1) Encontrar usuario
  const u = await c.query(`SELECT id, username, email FROM profiles WHERE email = $1`, [EMAIL]);
  if (u.rows.length === 0) {
    console.log('❌ Usuario no encontrado:', EMAIL);
    await c.end();
    return;
  }
  const user = u.rows[0];
  console.log('Usuario:', user);

  // 2) Estado actual
  const before = await c.query(`SELECT id, username, email, created_at FROM profiles WHERE id = $1`, [user.id]);
  console.log('Antes:', before.rows[0]);

  // 3) Actualizar created_at en profiles
  await c.query(`UPDATE profiles SET created_at = $1 WHERE id = $2`, [NEW_CREATED, user.id]);

  // 4) Actualizar tambien auth.users.created_at (por si se lee de ahi)
  try {
    await c.query(`UPDATE auth.users SET created_at = $1 WHERE id = $2`, [NEW_CREATED, user.id]);
    console.log('✅ auth.users.created_at actualizado');
  } catch (e) {
    console.log('⚠️ No se pudo actualizar auth.users.created_at:', e.message);
  }

  // 5) Verificar
  const after = await c.query(`SELECT id, username, email, created_at FROM profiles WHERE id = $1`, [user.id]);
  console.log('Despues:', after.rows[0]);

  const ageDays = await c.query(`SELECT EXTRACT(DAY FROM (now() - created_at)) AS dias FROM profiles WHERE id = $1`, [user.id]);
  console.log('Antiguedad (dias):', ageDays.rows[0]?.dias);

  await c.end();
})().catch(e => { console.error('❌', e); process.exit(1); });
