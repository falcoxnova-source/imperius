const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. Check ALL triggers on messages table
  const r1 = await c.query(`
    SELECT trigger_name, event_manipulation, action_statement, action_timing
    FROM information_schema.triggers
    WHERE event_object_table = 'messages'
    ORDER BY trigger_name
  `);
  console.log('=== TRIGGERS ON messages TABLE ===');
  r1.rows.forEach(r => console.log(`  ${r.trigger_name} | ${r.event_manipulation} | ${r.action_timing} | ${r.action_statement}`));

  // 2. Check if edge function URL is called from any other trigger
  const r2 = await c.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE prosrc LIKE '%telegram%' OR prosrc LIKE '%send_telegram%'
    ORDER BY proname
  `);
  console.log('\n=== FUNCTIONS MENTIONING TELEGRAM ===');
  r2.rows.forEach(r => console.log(`  ${r.proname}`));

  // 3. Check recent HTTP requests (net._http_response) to see if telegram calls are going out
  const r3 = await c.query(`
    SELECT id, status_code, created::text, url 
    FROM net._http_response 
    WHERE url LIKE '%telegram%' OR url LIKE '%send-telegram%'
    ORDER BY created DESC
    LIMIT 10
  `).catch(e => ({ rows: [], error: e.message }));
  
  if (r3.error) {
    console.log('\n=== HTTP RESPONSES (error) ===', r3.error);
  } else {
    console.log('\n=== RECENT TELEGRAM HTTP CALLS ===');
    r3.rows.forEach(r => console.log(`  ${r.id} | status=${r.status_code} | ${r.created} | ${r.url}`));
  }

  // 4. Check telegram_dm_config
  const r4 = await c.query(`SELECT * FROM telegram_dm_config`);
  console.log('\n=== TELEGRAM DM CONFIG ===');
  r4.rows.forEach(r => console.log(`  id=${r.id} enabled=${r.is_enabled} url=${r.edge_function_url}`));

  // 5. Check net._http_response for recent posts to the edge function URL
  if (r4.rows[0]?.edge_function_url) {
    const url = r4.rows[0].edge_function_url;
    const r5 = await c.query(`
      SELECT COUNT(*) as total, 
             COUNT(*) FILTER (WHERE created > now() - interval '24 hours') as last_24h,
             COUNT(*) FILTER (WHERE created > now() - interval '1 hour') as last_1h
      FROM net._http_response 
    `).catch(e => ({ rows: [{ error: e.message }] }));
    console.log('\n=== HTTP RESPONSE COUNTS ===');
    console.log(r5.rows[0]);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
