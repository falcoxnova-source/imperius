const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const r = await c.query(`SELECT pg_get_functiondef(oid) AS src FROM pg_proc WHERE proname='bot_ai_tick'`);
  let src = r.rows[0].src;
  let changes = 0;

  // Defenses: empty for colonizer (only colonization).
  const oldDef = `          ELSIF v_planet_role = 'colonizer' THEN
            -- [VETERANO] Colonizador: defensa ligera
            v_defense_priority := ARRAY['rocket_launcher', 'light_laser', 'small_shield_dome'];`;
  const newDef = `          ELSIF v_planet_role = 'colonizer' THEN
            -- [COLONIZADOR PURO] No construye defensas. Foco total en astrofisica + nave colonia.
            v_defense_priority := ARRAY[]::text[];`;
  if (src.includes(oldDef)) {
    src = src.replace(oldDef, newDef);
    changes++;
    console.log('[1] Defenses disabled for colonizer.');
  } else if (src.includes(newDef)) {
    console.log('[1] Defenses already disabled.');
  } else {
    console.error('Defense block not found');
    process.exit(1);
  }

  console.log('Total replacements:', changes);
  if (changes > 0) {
    await c.query(src);
    console.log('bot_ai_tick updated.');
  }

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
