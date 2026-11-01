// [MILITARY NO CARGO] Remove small_cargo/large_cargo from military ship priority
// and force qty=0 for military so it focuses on combat ships only.
// The miners already transport resources to military (Phase H).
const { Client } = require('pg');
const fs = require('fs');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const r = await c.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  let src = r.rows[0].prosrc;

  // Source uses CRLF line endings. Normalize our match strings to CRLF.
  const CR = '\r\n';

  // 1. Remove large_cargo / small_cargo from military priority array.
  const oldMilArr = [
    "'destroyer',",
    "              'bomber',",
    "              'battlecruiser',",
    "              'battleship',",
    "              'cruiser',",
    "              'heavy_fighter',",
    "              'light_fighter',",
    "              'large_cargo',",
    "              'small_cargo',",
    "              'recycler',",
    "              'espionage_probe',",
    "              'colony_ship'",
    "            ];",
  ].join(CR);

  const newMilArr = [
    "'destroyer',",
    "              'bomber',",
    "              'battlecruiser',",
    "              'battleship',",
    "              'cruiser',",
    "              'heavy_fighter',",
    "              'light_fighter',",
    "              'recycler',",
    "              'espionage_probe',",
    "              'colony_ship'",
    "            ];",
  ].join(CR);

  if (!src.includes(oldMilArr)) {
    console.error('❌ military priority array block not found');
    process.exit(1);
  }
  src = src.replace(oldMilArr, newMilArr);
  console.log('✅ military priority updated (removed large_cargo + small_cargo)');

  // 2. Safety net: force qty=0 for military on small_cargo / large_cargo.
  const oldSmallMil = [
    "ELSIF v_planet_role = 'military' THEN",
    "                  IF v_existing_ship_count >= 80 THEN",
    "                    v_ship_qty := 0;",
    "                  ELSE",
    "                    v_ship_qty := LEAST(20, 80 - v_existing_ship_count);",
    "                  END IF;",
  ].join(CR);
  const newSmallMil = [
    "ELSIF v_planet_role = 'military' THEN",
    "                  -- [WAR MACHINE v3] Militar NO construye small_cargo. Los mineros traen recursos.",
    "                  v_ship_qty := 0;",
  ].join(CR);
  if (!src.includes(oldSmallMil)) { console.error('❌ small_cargo military block not found'); process.exit(1); }
  src = src.replace(oldSmallMil, newSmallMil);
  console.log('✅ small_cargo military forced to qty=0');

  const oldLargeMil = [
    "ELSIF v_planet_role = 'military' THEN",
    "                  IF v_existing_ship_count >= 60 THEN",
    "                    v_ship_qty := 0;",
    "                  ELSE",
    "                    v_ship_qty := LEAST(15, 60 - v_existing_ship_count);",
    "                  END IF;",
  ].join(CR);
  const newLargeMil = [
    "ELSIF v_planet_role = 'military' THEN",
    "                  -- [WAR MACHINE v3] Militar NO construye large_cargo. Los mineros traen recursos.",
    "                  v_ship_qty := 0;",
  ].join(CR);
  if (!src.includes(oldLargeMil)) { console.error('❌ large_cargo military block not found'); process.exit(1); }
  src = src.replace(oldLargeMil, newLargeMil);
  console.log('✅ large_cargo military forced to qty=0');

  // Build CREATE OR REPLACE
  const sigRes = await c.query(`SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret, l.lanname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  const { args, ret, lanname } = sigRes.rows[0];

  const sql = `CREATE OR REPLACE FUNCTION public.bot_ai_tick(${args}) RETURNS ${ret} LANGUAGE ${lanname} AS $BOTAITICK$\n${src}\n$BOTAITICK$;`;
  fs.writeFileSync('supabase/migrations/20260422_military_no_cargo.sql', sql);
  console.log('Wrote migration, size:', sql.length);

  try {
    await c.query(sql);
    console.log('✅ bot_ai_tick updated: military no longer builds cargo ships');
  } catch (e) {
    console.error('❌ Error:', e.message);
  }

  await c.end();
})();
