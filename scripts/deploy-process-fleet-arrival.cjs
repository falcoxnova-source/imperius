const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to DB');

  // Read the function body from the SQL file
  const bodyPath = path.join(__dirname, '..', 'process_fleet_arrival_CURRENT.sql');
  const body = fs.readFileSync(bodyPath, 'utf8').trim();

  // Wrap it in the CREATE OR REPLACE FUNCTION
  const fullSQL = `
CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
${body}
$fn$;
  `.trim();

  console.log('Deploying process_fleet_arrival...');
  console.log('Body length:', body.length, 'chars');
  console.log('Full SQL length:', fullSQL.length, 'chars');

  try {
    await client.query(fullSQL);
    console.log('✅ process_fleet_arrival deployed successfully!');
  } catch (err) {
    console.error('❌ Deploy failed:', err.message);
    // Show the problematic area if possible
    if (err.position) {
      const pos = parseInt(err.position);
      const snippet = fullSQL.substring(Math.max(0, pos - 100), pos + 100);
      console.error('Near position', pos, ':', snippet);
    }
  }

  // Verify
  const verify = await client.query(`
    SELECT LENGTH(prosrc) as src_length
    FROM pg_proc
    WHERE proname = 'process_fleet_arrival'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (verify.rows.length > 0) {
    console.log('Verified: function exists, source length:', verify.rows[0].src_length);
  }

  await client.end();
}

main().catch(console.error);
