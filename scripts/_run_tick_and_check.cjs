const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  console.log('🚀 Ejecutando bot_ai_tick()...');
  const t0 = Date.now();
  const r = await c.query(`SELECT bot_ai_tick() AS result`);
  console.log('⏱️  Duración:', Date.now()-t0, 'ms');
  console.log('Resultado:', JSON.stringify(r.rows[0].result, null, 2));

  // Eventos nuevos de PIPI tras el tick
  const ev = await c.query(`SELECT created_at, planet_id, event_type, payload FROM autopilot_events WHERE user_id='50da268b-d729-4f06-b8af-e03aa0437c1f' AND created_at > now() - interval '2 minutes' ORDER BY created_at DESC`);
  console.log('Eventos PIPI del tick recién ejecutado:');
  console.table(ev.rows);

  // Flotas en vuelo de PIPI
  const f = await c.query(`
    SELECT f.id, po.name AS origin, po.autopilot_role AS origin_role,
           f.target_galaxy||':'||f.target_system||':'||f.target_position AS target,
           f.mission_type, f.is_completed, f.departure_time, f.arrival_time
    FROM fleets f
    JOIN planets po ON po.id=f.origin_planet_id
    WHERE f.user_id='50da268b-d729-4f06-b8af-e03aa0437c1f' AND f.is_completed=false
    ORDER BY f.departure_time DESC
  `);
  console.log('Flotas activas PIPI:');
  console.table(f.rows);

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
