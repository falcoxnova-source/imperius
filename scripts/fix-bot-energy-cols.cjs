const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick'");
  let src = r.rows[0].prosrc;

  const wrong = `SELECT COALESCE(energy_production, 0) - COALESCE(energy_consumption, 0)`;
  const right = `SELECT COALESCE(energy_max, 0) - COALESCE(energy_used, 0)`;
  if (!src.includes(wrong)) throw new Error('no encuentro SELECT energético previo');
  src = src.replace(wrong, right);

  const funcDef = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'bot_ai_tick'`);
  const fullDef = funcDef.rows[0].def;
  const original = r.rows[0].prosrc;
  if (!fullDef.includes(original)) throw new Error('no encontrado original');
  const newDef = fullDef.replace(original, src);

  await c.query(newDef);
  console.log('✅ Columnas corregidas: energy_max / energy_used');
  await c.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
