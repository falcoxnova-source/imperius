const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  const srcResult = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'bot_ai_tick'");
  const src = srcResult.rows[0].prosrc;

  console.log('=== VALIDACIÓN DEL PARCHE ===');
  console.log('Usa commander:', src.includes("ot.code = 'commander'") ? '✅' : '❌');
  console.log('Slots 5/3:', src.includes('v_max_build_queue := CASE WHEN v_has_commander THEN 5 ELSE 3 END;') ? '✅' : '❌');
  console.log('Cola múltiple:', src.includes('EXIT WHEN v_build_slots_left <= 0;') ? '✅' : '❌');
  console.log('Queue position incremental:', src.includes('v_next_queue_position := v_next_queue_position + 1;') ? '✅' : '❌');

  console.log('\n=== EJECUTANDO bot_ai_tick() ===');
  const execResult = await client.query('SELECT bot_ai_tick() AS result');
  console.log(JSON.stringify(execResult.rows[0].result, null, 2));

  await client.end();
}

run().catch(async (e) => {
  console.error('❌ Error:', e);
  try { await client.end(); } catch {}
  process.exit(1);
});
