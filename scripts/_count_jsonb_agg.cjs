// REVERT the bad fix + apply the correct fix to BOTH buggy blocks
// (fleet_save in Phase I was corrupted; and Phase H miner transport has same bug).
// Actually it turns out BOTH blocks used "SELECT jsonb_agg(x) FROM (...) x" pattern
// which produces {jsonb_build_object: {...}} wrapping. So both are buggy.
//
// Strategy:
// 1. Restore fleet_save block from git (supabase/migrations).
// 2. Apply the jsonb alias fix to ALL occurrences of "jsonb_agg(x) FROM (" inside bot_ai_tick.
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

  // Count how many jsonb_agg(x) we now have
  const cur = (src.match(/jsonb_agg\(x\)/g) || []).length;
  const curObj = (src.match(/jsonb_agg\(obj\)/g) || []).length;
  console.log('current jsonb_agg(x):', cur, 'jsonb_agg(obj):', curObj);

  await c.end();
})();
