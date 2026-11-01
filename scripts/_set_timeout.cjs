const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

async function main() {
  await c.connect();
  
  // Set statement_timeout for the function at the role level
  // This ensures PostgREST respects it
  await c.query(`ALTER FUNCTION public.bot_ai_tick() SET statement_timeout = '120s'`);
  console.log('✅ Function timeout set to 120s');
  
  // Also increase the default for authenticated role (used by PostgREST)
  try {
    await c.query(`ALTER ROLE authenticated SET statement_timeout = '120s'`);
    console.log('✅ authenticated role timeout set to 120s');
  } catch(e) {
    console.log('⚠️ Could not set role timeout:', e.message);
  }
  
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
