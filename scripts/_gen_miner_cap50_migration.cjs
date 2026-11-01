// Genera supabase/migrations/20260422_miner_cargo_cap50.sql
// envolviendo el body de bot_ai_tick en un CREATE OR REPLACE FUNCTION completo.
const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();
  const r = await client.query(`
    SELECT pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS result,
           p.prosrc
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'
    LIMIT 1
  `);
  await client.end();

  const { args, result, prosrc } = r.rows[0];

  const header = `-- =====================================================================
-- Miner cargo cap 50: planetas mineros construyen exactamente 50 small_cargo
-- y 50 large_cargo, luego no construyen nada más. Phase H sigue transportando
-- al militar con esos cargueros.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.bot_ai_tick(${args})
RETURNS ${result}
LANGUAGE plpgsql
AS $FUNC_FXU$
`;
  const footer = `\n$FUNC_FXU$;\n`;

  const out = header + prosrc + footer;
  const path = 'supabase/migrations/20260422_miner_cargo_cap50.sql';
  fs.writeFileSync(path, out);
  console.log('✅ Migración escrita en', path, '(', out.length, 'chars )');
})().catch(e => { console.error(e); process.exit(1); });
