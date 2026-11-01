const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const ID = '50da268b-d729-4f06-b8af-e03aa0437c1f';

  const r1 = await c.query(`SELECT has_autopilot_access($1) AS access`, [ID]);
  console.log('has_autopilot_access(PIPI):', r1.rows[0].access);

  // ¿Entra al FOR v_bot?
  const r2 = await c.query(`
    SELECT id, username, is_bot, autopilot_active, autopilot_eligible,
           has_autopilot_access(id) AS access,
           last_manual_action,
           (is_bot = true OR (autopilot_active = true AND has_autopilot_access(id)
             AND ((autopilot_vip_boost = true AND (autopilot_vip_boost_expires_at IS NULL OR autopilot_vip_boost_expires_at > NOW()))
                  OR last_manual_action IS NULL
                  OR last_manual_action < NOW() - INTERVAL '5 minutes'))) AS eligible
    FROM profiles WHERE id = $1
  `, [ID]);
  console.log('Eligibility PIPI:', r2.rows[0]);

  // Recursos Planeta Principal (destino)
  const r3 = await c.query(`
    SELECT pl.name, pr.metal::bigint AS metal, pr.crystal::bigint AS crystal, pr.deuterium::bigint AS deut
    FROM planets pl JOIN planet_resources pr ON pr.planet_id=pl.id
    WHERE pl.id='bbdc3248-7707-4bfc-a576-47ecc3669cd1'
  `);
  console.log('Planeta Principal:', r3.rows[0]);

  // Intentar enviar un transport MANUAL desde Kepler vía secure_send_fleet para ver si falla por algún motivo
  // NO lo ejecutamos, sólo mostramos motivo potencial:
  // Revisar si hay trigger/constraint que bloquee

  // Ver si bot_ai_tick tiene manejo de excepciones que trague errores por planeta
  const r4 = await c.query(`
    SELECT
      position('EXCEPTION WHEN OTHERS' IN prosrc) AS ex_pos,
      substring(prosrc FROM position('EXCEPTION WHEN OTHERS' IN prosrc) FOR 300) AS snippet
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'
  `);
  console.log('Exception handlers en bot_ai_tick:');
  console.log(r4.rows[0]);

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
