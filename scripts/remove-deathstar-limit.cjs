const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Get current function source
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='create_market_listing' LIMIT 1");
  const oldSrc = r.rows[0].prosrc;

  // Remove the deathstar block
  const lines = oldSrc.split('\n');
  const newLines = [];
  let skip = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip the comment line + the IF block for deathstar minimum price
    if (line.includes('Ship-specific minimum prices')) {
      skip = true;
      continue;
    }
    if (skip && line.trim().startsWith('END IF;')) {
      skip = false;
      continue;
    }
    if (skip) continue;
    newLines.push(line);
  }

  const newSrc = newLines.join('\n');

  // Get full function args
  const argsR = await c.query("SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname='create_market_listing' LIMIT 1");
  const args = argsR.rows[0].pg_get_function_arguments;

  const sql = `CREATE OR REPLACE FUNCTION create_market_listing(${args}) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$${newSrc}$fn$`;

  await c.query(sql);
  console.log('SUCCESS: Deathstar price limit removed from create_market_listing');

  // Verify
  const verify = await c.query("SELECT prosrc FROM pg_proc WHERE proname='create_market_listing' LIMIT 1");
  const hasDeathstar = verify.rows[0].prosrc.includes('deathstar');
  console.log('Verification - still contains deathstar?', hasDeathstar);

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
