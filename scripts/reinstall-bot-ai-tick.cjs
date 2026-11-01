/**
 * Re-instala bot_ai_tick() completo desde _bot_ai_tick_current.sql
 * Lee la firma actual de la BD y envuelve el body con CREATE OR REPLACE FUNCTION.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
};

(async () => {
  const client = new Client(DB);
  await client.connect();
  console.log('Connected.');

  // 1) Read the body from the SQL dump file
  const bodyPath = path.join(__dirname, '_bot_ai_tick_current.sql');
  let body = fs.readFileSync(bodyPath, 'utf8').trim();

  // Remove trailing blank lines
  body = body.replace(/\n{3,}/g, '\n\n');

  // 2) Get the current function signature
  const sigRow = await client.query(`
    SELECT pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS ret
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick' AND n.nspname = 'public'
    LIMIT 1
  `);

  if (sigRow.rows.length === 0) {
    console.error('ERROR: bot_ai_tick not found in DB. Cannot determine signature.');
    await client.end();
    process.exit(1);
  }

  const { args, ret } = sigRow.rows[0];
  console.log(`Signature: bot_ai_tick(${args}) RETURNS ${ret}`);

  // 3) Build the full CREATE OR REPLACE
  const sql = `CREATE OR REPLACE FUNCTION public.bot_ai_tick(${args})
 RETURNS ${ret}
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
${body}
$function$;`;

  console.log(`SQL length: ${sql.length} chars`);
  console.log('First 200 chars:', sql.substring(0, 200));

  // 4) Execute
  await client.query(sql);
  console.log('✅ bot_ai_tick() reinstalled successfully!');

  await client.end();
})().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
