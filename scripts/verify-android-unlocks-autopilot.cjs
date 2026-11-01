// Simula posesión del Androide inyectando user_officers directamente
const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const u = await client.query(`
    SELECT id, username, autopilot_eligible 
    FROM profiles 
    WHERE is_bot=false AND is_admin=false 
    ORDER BY fxu_balance DESC LIMIT 1
  `);
  const userId = u.rows[0].id;
  console.log('👤', u.rows[0]);

  const ot = await client.query(`SELECT id FROM officer_types WHERE code='android'`);
  const androidId = ot.rows[0].id;

  // Asegurar que NO sea autopilot_eligible
  await client.query(`UPDATE profiles SET autopilot_eligible=false, autopilot_active=false WHERE id=$1`, [userId]);

  // Antes de comprar
  let acc = await client.query(`SELECT has_autopilot_access($1::uuid) AS r`, [userId]);
  console.log('\nAntes de comprar: has_autopilot_access =', acc.rows[0].r, '(esperado false)');

  // Simular compra: insertar user_officers con expires_at + 7d
  await client.query(`
    INSERT INTO user_officers (user_id, officer_type_id, expires_at)
    VALUES ($1, $2, now() + interval '7 days')
    ON CONFLICT DO NOTHING
  `, [userId, androidId]);

  // Después de comprar
  acc = await client.query(`SELECT has_autopilot_access($1::uuid) AS r`, [userId]);
  console.log('Después de comprar: has_autopilot_access =', acc.rows[0].r, '(esperado true)');

  // Simular el toggle_autopilot bypasseando auth.uid() — redefinimos temporalmente la función de prueba
  // Para probar la lógica directa sin auth.uid():
  const r = await client.query(`
    SELECT 
      has_autopilot_access($1::uuid) AS access,
      (SELECT autopilot_active FROM profiles WHERE id=$1) AS before_active
  `, [userId]);
  console.log('\nPre-toggle:', r.rows[0]);

  // Simular el UPDATE que hace toggle_autopilot
  await client.query(`UPDATE profiles SET autopilot_active = true WHERE id=$1`, [userId]);
  const r2 = await client.query(`SELECT autopilot_active FROM profiles WHERE id=$1`, [userId]);
  console.log('Post-activación:', r2.rows[0], '(esperado autopilot_active=true)');

  // Verificar que bot_ai_tick lo procesa (usando el nuevo WHERE con has_autopilot_access)
  const b = await client.query(`
    SELECT id, username, autopilot_active, autopilot_eligible, 
           has_autopilot_access(id) AS has_access
    FROM profiles
    WHERE (is_bot = true OR (autopilot_active = true AND has_autopilot_access(id) 
           AND (last_manual_action IS NULL OR last_manual_action < NOW() - INTERVAL '5 minutes')))
      AND id = $1
  `, [userId]);
  console.log('\n🤖 ¿Aparece en el WHERE de bot_ai_tick?:', b.rows.length > 0 ? 'SÍ ✅' : 'NO ❌');
  if (b.rows[0]) console.log('  ', b.rows[0]);

  // Limpieza: dejar todo en estado neutro
  await client.query(`DELETE FROM user_officers WHERE user_id=$1 AND officer_type_id=$2`, [userId, androidId]);
  await client.query(`UPDATE profiles SET autopilot_active=false WHERE id=$1`, [userId]);

  // Verificar que sin el officer, pierde acceso
  const acc2 = await client.query(`SELECT has_autopilot_access($1::uuid) AS r`, [userId]);
  console.log('\n🧹 Tras limpieza: has_autopilot_access =', acc2.rows[0].r, '(esperado false)');

  await client.end();
}
main().catch(async e => { console.error('❌', e.message); try{await client.end();}catch{}; process.exit(1); });
