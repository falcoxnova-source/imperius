// Reintento: reemplazar research_priority con regex tolerante a whitespace
const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  const fn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  let src = fn.rows[0].prosrc;

  // Regex: capturar todo desde "v_research_priority := ARRAY[" hasta "];"
  const regex = /v_research_priority\s*:=\s*ARRAY\s*\[([\s\S]*?)\];/;
  const match = src.match(regex);
  if (!match) { console.log('❌ No match'); await client.end(); return; }
  console.log('Encontrado:', match[0].slice(0, 150) + '...');

  const newBlock = `v_research_priority := ARRAY[
            'energy_tech',
            'combustion_drive',
            'armour_tech',
            'shielding_tech',
            'impulse_drive',
            'espionage_tech',
            'ion_tech',
            'laser_tech',
            'weapons_tech',
            'hyperspace_drive',
            'computer_tech',
            'astrophysics',
            'hyperspace_tech',
            'plasma_tech'
          ];`;

  src = src.replace(regex, newBlock);

  const sig = await client.query(`
    SELECT pg_get_function_identity_arguments(oid) AS args,
           pg_get_function_result(oid) AS result
    FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1
  `);
  await client.query(`
    CREATE OR REPLACE FUNCTION bot_ai_tick(${sig.rows[0].args})
    RETURNS ${sig.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC$
${src}
$FUNC$
  `);
  console.log('✅ Research priority actualizada');
  const t = await client.query(`SELECT bot_ai_tick()`);
  console.log('Tick:', JSON.stringify(t.rows[0].bot_ai_tick));
  await client.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
