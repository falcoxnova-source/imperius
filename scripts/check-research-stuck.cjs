const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  console.log('✅ Conectado\n');

  // 1. ¿Hay bots con is_researching = true atascados?
  console.log('========== 1. BOTS CON INVESTIGACIÓN EN CURSO ==========');
  const stuck = await c.query(`
    SELECT pr.username, tt.code as tech, ut.level, ut.is_researching,
           ut.research_start_time, ut.research_end_time,
           CASE WHEN ut.research_end_time < now() THEN '⚠️ VENCIDA' ELSE '✅ En progreso' END as status,
           ROUND(EXTRACT(EPOCH FROM (ut.research_end_time - now()))/60) as mins_left
    FROM user_technologies ut
    JOIN profiles pr ON pr.id = ut.user_id
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE pr.is_bot = true AND ut.is_researching = true
    ORDER BY ut.research_end_time
  `);
  if (stuck.rows.length === 0) {
    console.log('  Ningún bot tiene investigación en curso');
  } else {
    console.table(stuck.rows.map(r => ({
      npc: r.username, tech: r.tech, level: r.level,
      status: r.status, mins_left: r.mins_left,
      end: r.research_end_time?.toISOString?.()?.slice(0,19)
    })));
  }

  // 2. ¿Existe bot_process_queues? ¿Qué hace?
  console.log('\n========== 2. FUNCIONES QUE PROCESAN COLAS ==========');
  const funcs = await c.query(`
    SELECT proname, LEFT(prosrc, 500) as src_preview
    FROM pg_proc
    WHERE proname IN ('bot_process_queues','process_bot_queues','process_building_queue','process_research_queue','process_shipyard_queue','complete_research','finish_research')
    AND pronamespace = 'public'::regnamespace
  `);
  if (funcs.rows.length === 0) {
    console.log('  ⚠️ No se encontraron funciones de procesamiento de colas');
  } else {
    for (const f of funcs.rows) {
      console.log(`\n  --- ${f.proname} ---`);
      console.log(`  ${f.src_preview}`);
    }
  }

  // 3. ¿Hay algún cron que procese research_queue o user_technologies?
  console.log('\n========== 3. CRON JOBS RELEVANTES ==========');
  const crons = await c.query(`
    SELECT jobid, schedule, command 
    FROM cron.job
    WHERE command ILIKE '%research%' OR command ILIKE '%queue%' OR command ILIKE '%bot%' OR command ILIKE '%building%' OR command ILIKE '%shipyard%'
    ORDER BY jobid
  `);
  console.table(crons.rows);

  // 4. ¿Cómo completa el bot sus investigaciones? Buscar en bot_ai_tick
  console.log('\n========== 4. ¿BOT_AI_TICK COMPLETA INVESTIGACIONES? ==========');
  const botTick = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'bot_ai_tick' AND pronamespace = 'public'::regnamespace
  `);
  if (botTick.rows.length > 0) {
    const src = botTick.rows[0].prosrc;
    // Buscar si completa investigaciones
    const hasResearchComplete = src.includes('is_researching') && (src.includes('research_end_time') || src.includes('SET level'));
    const setsResearchFalse = src.includes("is_researching = false") || src.includes("is_researching=false");
    const updatesLevel = /SET\s+level\s*=\s*level\s*\+\s*1/i.test(src) || /SET\s+level\s*=.*target/i.test(src);
    
    console.log(`  ¿Verifica is_researching? ${src.includes('is_researching') ? '✅' : '❌'}`);
    console.log(`  ¿Pone is_researching = false? ${setsResearchFalse ? '✅' : '❌'}`);
    console.log(`  ¿Sube level al completar? ${updatesLevel ? '✅' : '❌'}`);
    
    // Buscar la sección de research completion
    const researchLines = src.split('\n').filter(l => 
      l.includes('research_end_time') || l.includes('is_researching') || 
      l.includes('level + 1') || l.includes('level := level')
    );
    console.log('\n  Líneas relevantes de research en bot_ai_tick:');
    researchLines.forEach(l => console.log(`    ${l.trim()}`));
  }

  // 5. ¿Existe process_queues_tick o similar que complete las colas?
  console.log('\n========== 5. TODAS LAS FUNCIONES CON "queue" O "research" ==========');
  const allFuncs = await c.query(`
    SELECT proname FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    AND (proname ILIKE '%queue%' OR proname ILIKE '%research%' OR proname ILIKE '%complete%' OR proname ILIKE '%process%' OR proname ILIKE '%finish%')
    ORDER BY proname
  `);
  console.table(allFuncs.rows);

  // 6. research_queue - ¿tiene algo de bots?
  console.log('\n========== 6. RESEARCH_QUEUE DE BOTS ==========');
  const rq = await c.query(`
    SELECT pr.username, rq.*
    FROM research_queue rq
    JOIN profiles pr ON pr.id = rq.user_id
    WHERE pr.is_bot = true
    LIMIT 10
  `);
  if (rq.rows.length === 0) {
    console.log('  research_queue está VACÍA para bots (confirma que el bot NO usa esta tabla)');
  } else {
    console.table(rq.rows);
  }

  await c.end();
  console.log('\n✅ Diagnóstico completo');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
