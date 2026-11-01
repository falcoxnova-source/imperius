// Auditoría del autopiloto para dark@gmail.com

const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // 1. Usuario + flags de autopilot/bot
  const u = await client.query(`
    SELECT id, username, email, is_bot, autopilot_eligible, autopilot_active
    FROM profiles WHERE email='dark@gmail.com'
  `);
  const user = u.rows[0];
  console.log('=== USUARIO ===');
  console.log(JSON.stringify(user, null, 2));

  const userId = user.id;

  // 2. Planetas
  const p = await client.query(`
    SELECT id, name, is_main_planet, fields_used, fields_max, galaxy, solar_system, position
    FROM planets WHERE user_id=$1 AND is_destroyed=false
    ORDER BY is_main_planet DESC, created_at ASC
  `, [userId]);
  console.log(`\n=== PLANETAS (${p.rows.length}) ===`);
  for (const pl of p.rows) {
    const r = await client.query(`SELECT metal,crystal,deuterium,energy_max,energy_used FROM planet_resources WHERE planet_id=$1`, [pl.id]);
    const res = r.rows[0] || {};
    console.log(`\n${pl.is_main_planet?'🌍':'🛰️ '} ${pl.name} @ G${pl.galaxy}:${pl.solar_system}:${pl.position}`);
    console.log(`   Fields: ${pl.fields_used}/${pl.fields_max} (libres: ${pl.fields_max-pl.fields_used})`);
    console.log(`   Recursos: M=${Math.floor(res.metal)} C=${Math.floor(res.crystal)} D=${Math.floor(res.deuterium)} | Energía ${res.energy_used}/${res.energy_max}`);

    // Edificios del planeta
    const b = await client.query(`
      SELECT bt.code, pb.level, pb.is_upgrading, pb.upgrade_end_time
      FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id
      WHERE pb.planet_id=$1 ORDER BY pb.level DESC
    `, [pl.id]);
    console.log(`   Edificios (${b.rows.length}): ${b.rows.map(x=>`${x.code}=${x.level}${x.is_upgrading?'⬆':''}`).join(', ') || 'ninguno'}`);

    // Cola de construcción
    const q = await client.query(`
      SELECT bt.code, bq.target_level, bq.end_time, bq.queue_position
      FROM building_queue bq JOIN building_types bt ON bt.id=bq.building_type_id
      WHERE bq.planet_id=$1 ORDER BY bq.queue_position
    `, [pl.id]);
    if (q.rows.length) {
      console.log(`   🔨 Cola (${q.rows.length}):`);
      q.rows.forEach(x => console.log(`      #${x.queue_position} ${x.code} → L${x.target_level} (termina ${x.end_time})`));
    } else {
      console.log(`   🔨 Cola: VACÍA`);
    }
  }

  // 3. Cron job del bot_ai_tick
  console.log(`\n=== CRON JOB bot_ai_tick ===`);
  const cron = await client.query(`
    SELECT jobid, schedule, command, active FROM cron.job 
    WHERE command ILIKE '%bot_ai_tick%' OR command ILIKE '%autopilot%'
    ORDER BY jobid
  `);
  cron.rows.forEach(j => console.log(` jobid=${j.jobid} schedule="${j.schedule}" active=${j.active} cmd=${j.command.slice(0,100)}`));

  // 4. Últimas ejecuciones del cron
  console.log(`\n=== ÚLTIMAS EJECUCIONES (bot_ai_tick) ===`);
  const runs = await client.query(`
    SELECT jobid, start_time, end_time, status, return_message
    FROM cron.job_run_details
    WHERE jobid IN (SELECT jobid FROM cron.job WHERE command ILIKE '%bot_ai_tick%' OR command ILIKE '%autopilot%')
    ORDER BY start_time DESC LIMIT 5
  `);
  runs.rows.forEach(r => console.log(` [${r.status}] ${r.start_time} (${r.end_time?'ok':'running'}) msg=${(r.return_message||'').slice(0,80)}`));

  // 5. ¿El bot_ai_tick procesa a dark? Buscar función y ver si filtra por is_bot o autopilot
  console.log(`\n=== FILTRO DE USUARIOS EN bot_ai_tick ===`);
  const fn = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1
  `);
  if (fn.rows.length) {
    const src = fn.rows[0].prosrc;
    // Extraer líneas que mencionen is_bot o autopilot_enabled o FROM profiles
    const lines = src.split('\n');
    lines.forEach((l, i) => {
      if (/is_bot|autopilot|FROM profiles|FOR .*IN/i.test(l)) {
        console.log(`  L${i+1}: ${l.trim()}`);
      }
    });
  }

  await client.end();
}

main().catch(async e => { console.error('❌', e.message); try{await client.end();}catch{}; process.exit(1); });
