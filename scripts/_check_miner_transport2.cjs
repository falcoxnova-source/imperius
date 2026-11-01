const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const r1=await c.query(`select event_type, count(*) from autopilot_events where created_at > now() - interval '6 hours' group by 1 order by 2 desc`);
  console.log('Event types últimas 6h:');
  console.table(r1.rows);

  const r2=await c.query(`select id, user_id, event_type, payload, created_at from autopilot_events where event_type ilike '%transport%' order by created_at desc limit 5`);
  console.log('Últimos eventos tipo transport:');
  console.table(r2.rows);

  const r3=await c.query(`
    select count(*) as active_bot_transports
    from fleets f
    join profiles p on p.id = f.user_id
    where p.is_bot = true and f.mission_type='transport' and f.is_completed=false
  `);
  console.log('Transportes en vuelo de bots ahora mismo:', r3.rows[0].active_bot_transports);

  // Historial reciente de transportes de bots desde mineros
  const r4=await c.query(`
    select f.id, pr.username, po.autopilot_role as origin_role, f.target_galaxy, f.target_system, f.target_position, f.departure_time, f.is_completed
    from fleets f
    join profiles pr on pr.id = f.user_id
    join planets po on po.id = f.origin_planet_id
    where pr.is_bot=true and f.mission_type='transport' and f.departure_time > now() - interval '12 hours'
      and po.autopilot_role='miner'
    order by f.departure_time desc
    limit 10
  `);
  console.log('Transportes recientes de bots con planeta origen=miner (12h):');
  console.table(r4.rows);

  // Tick: última ejecución bot_ai_tick
  const r5=await c.query(`select max(created_at) as last_event from autopilot_events`);
  console.log('Último autopilot_event:', r5.rows[0].last_event);

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
