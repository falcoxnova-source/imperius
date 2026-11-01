const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });

async function tryRpc(label, fn, expectOk = true) {
  await c.query('SAVEPOINT sp');
  try {
    const r = await fn();
    await c.query('ROLLBACK TO SAVEPOINT sp');
    console.log(`${expectOk?'✅':'⚠️ '} ${label}: ejecutó → ${JSON.stringify(r).slice(0,140)}`);
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT sp');
    console.log(`${expectOk?'❌':'✅'} ${label}: ERROR → ${e.message.split('\n')[0]}`);
  }
}

(async () => {
  await c.connect();

  // Usuario con recursos y planeta
  const u = await c.query(`
    SELECT pr.planet_id, p.user_id, prof.username, pr.metal, pr.crystal, pr.deuterium
    FROM planet_resources pr
    JOIN planets p ON p.id=pr.planet_id
    JOIN profiles prof ON prof.id=p.user_id
    WHERE prof.is_admin=false AND prof.is_bot=false
      AND pr.metal > 1000 AND pr.crystal > 500
    ORDER BY pr.metal DESC LIMIT 1`);
  const { planet_id: pid, user_id: uid, username, metal, crystal, deuterium } = u.rows[0];
  console.log(`\nSujeto: ${username} planeta=${pid}`);
  console.log(`Recursos: M=${metal} C=${crystal} D=${deuterium}\n`);

  await c.query('BEGIN');
  await c.query(`SET LOCAL ROLE authenticated`);
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);

  console.log('── RPCs legítimas del juego (deben funcionar) ──');

  // 1) calculate_and_sync_resources (recolección periódica)
  await tryRpc('calculate_and_sync_resources',
    () => c.query(`SELECT calculate_and_sync_resources($1) AS r`, [pid]).then(r => r.rows[0].r));

  // 2) sync_planet_resources
  await tryRpc('sync_planet_resources',
    () => c.query(`SELECT sync_planet_resources($1) AS r`, [pid]).then(r => r.rows[0].r));

  // 3) process_completed_building_queue (tick cola edificios)
  await tryRpc('process_completed_building_queue',
    () => c.query(`SELECT process_completed_building_queue($1) AS r`, [pid]).then(r => r.rows[0].r));

  // 4) process_completed_shipyard_queue
  await tryRpc('process_completed_shipyard_queue',
    () => c.query(`SELECT process_completed_shipyard_queue($1) AS r`, [pid]).then(r => r.rows[0].r));

  // 5) complete_research
  await tryRpc('complete_research',
    () => c.query(`SELECT complete_research($1) AS r`, [uid]).then(r => r.rows[0].r));

  // 6) process_user_pending_fleets
  await tryRpc('process_user_pending_fleets',
    () => c.query(`SELECT process_user_pending_fleets($1) AS r`, [uid]).then(r => r.rows[0].r));

  // 7) update_production_percentages (ResourcesPage.tsx)
  await tryRpc('update_production_percentages',
    () => c.query(`SELECT update_production_percentages($1,100,100,100,100,100,100) AS r`, [pid]).then(r => r.rows[0].r));

  // 8) Intentar construir edificio (si hay metal suficiente)
  // building_type_id = 1 suele ser metal_mine
  await tryRpc('secure_add_to_building_queue (metal_mine)',
    () => c.query(`SELECT secure_add_to_building_queue($1, $2) AS r`, [pid, 1]).then(r => r.rows[0].r));

  // 9) Verificar que un UPDATE directo a planet_resources sigue bloqueado
  console.log('\n── Ataque directo (debe BLOQUEAR o NO-OP) ──');
  await tryRpc('UPDATE planet_resources.metal (ataque)',
    () => c.query(`UPDATE planet_resources SET metal=metal+9999 WHERE planet_id=$1 RETURNING metal`, [pid]).then(r => ({rows: r.rowCount})),
    false);

  await c.query('ROLLBACK');
  console.log('\n(transacción revertida — nada persistido)');
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
