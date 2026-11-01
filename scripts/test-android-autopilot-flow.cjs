// Prueba end-to-end: compra Androide + toggle autopilot para dark@gmail.com
const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // 1) Tomar un usuario con FXU suficiente, no admin, no bot
  const u = await client.query(`
    SELECT id, username, email, fxu_balance, autopilot_eligible, autopilot_active
    FROM profiles
    WHERE is_bot=false AND is_admin=false AND fxu_balance >= 20000
    ORDER BY fxu_balance DESC
    LIMIT 1
  `);
  if (u.rows.length === 0) {
    console.log('❌ No encontré usuario con saldo');
    return;
  }
  const user = u.rows[0];
  console.log('👤 Usuario:', user);

  // 2) Asegurarnos de que NO tenga autopilot_eligible (simulamos comprador real)
  await client.query(`UPDATE profiles SET autopilot_eligible=false, autopilot_active=false WHERE id=$1`, [user.id]);

  // 4) Obtener androide officer_type
  const ot = await client.query(`SELECT id FROM officer_types WHERE code='android'`);
  const androidId = ot.rows[0].id;

  // 5) Limpiar user_officer previo del androide si hay
  await client.query(`DELETE FROM user_officers WHERE user_id=$1 AND officer_type_id=$2`, [user.id, androidId]);

  // 6) Simular compra con FXU llamando purchase_officer_with_fxu como el user
  //    Necesitamos setear auth.uid() via set_config
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [user.id]);
  const buy = await client.query(`SELECT purchase_officer_with_fxu($1, '7d') AS r`, [androidId]);
  console.log('\n🛒 Compra con FXU:', JSON.stringify(buy.rows[0].r));

  // 7) Ver user_officer creado
  const uo = await client.query(`
    SELECT uo.expires_at, ot.code FROM user_officers uo
    JOIN officer_types ot ON ot.id = uo.officer_type_id
    WHERE uo.user_id=$1 AND ot.code='android'
  `, [user.id]);
  console.log('\n📋 user_officers:', uo.rows);

  // 8) Llamar has_autopilot_access
  const acc = await client.query(`SELECT has_autopilot_access($1::uuid) AS r`, [user.id]);
  console.log('\n🔑 has_autopilot_access:', acc.rows[0].r);

  // 9) Llamar toggle_autopilot (como el user)
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [user.id]);
  const tog = await client.query(`SELECT toggle_autopilot(true) AS r`);
  console.log('\n🔄 toggle_autopilot(true):', JSON.stringify(tog.rows[0].r));

  // 10) Estado final
  const fin = await client.query(`SELECT autopilot_active, fxu_balance FROM profiles WHERE id=$1`, [user.id]);
  console.log('\n✅ Estado final:', fin.rows[0]);

  // 11) Verificar que un usuario SIN androide recibe rechazo
  const other = await client.query(`
    SELECT id FROM profiles 
    WHERE email != 'dark@gmail.com' AND is_bot=false AND is_admin=false 
    LIMIT 1
  `);
  if (other.rows.length > 0) {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [other.rows[0].id]);
    const rej = await client.query(`SELECT toggle_autopilot(true) AS r`);
    console.log('\n🚫 Usuario sin androide:', JSON.stringify(rej.rows[0].r));
  }

  // 12) Verificar que compra con dark_matter se rechaza
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [user.id]);
  await client.query(`UPDATE profiles SET dark_matter = GREATEST(dark_matter, 100000) WHERE id=$1`, [user.id]);
  const buyDM = await client.query(`SELECT purchase_officer_with_dark_matter($1, '7d') AS r`, [androidId]);
  console.log('\n🚫 Compra con Materia Oscura:', JSON.stringify(buyDM.rows[0].r));

  await client.end();
}

main().catch(async e => { console.error('❌', e.message); try{await client.end();}catch{}; process.exit(1); });
