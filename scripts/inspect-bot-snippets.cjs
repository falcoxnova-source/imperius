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
  const result = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'bot_ai_tick'");
  const src = result.rows[0].prosrc;

  const idx1 = src.indexOf('v_game_speed integer;');
  console.log('DECL SNIPPET:');
  console.log(JSON.stringify(src.slice(idx1 - 20, idx1 + 120)));

  const idx2 = src.indexOf('-- Phase A: Buildings');
  console.log('\nPHASE SNIPPET:');
  console.log(JSON.stringify(src.slice(idx2, idx2 + 220)));

  const idx3 = src.indexOf('v_try_bt RECORD;');
  console.log('\nINNER DECL SNIPPET:');
  console.log(JSON.stringify(src.slice(idx3 - 40, idx3 + 180)));

  const idx4 = src.indexOf('FOR v_bw_idx IN');
  console.log('\nLOOP SNIPPET:');
  console.log(JSON.stringify(src.slice(idx4, idx4 + 220)));

  const idx5 = src.indexOf('INSERT INTO building_queue');
  console.log('\nINSERT SNIPPET:');
  console.log(JSON.stringify(src.slice(idx5, idx5 + 320)));

  await client.end();
}

run().catch(async (e) => { console.error(e); try { await client.end(); } catch {} process.exit(1); });
