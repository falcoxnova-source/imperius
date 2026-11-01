const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. calculate_planet_max_fields - full source
  console.log('=== calculate_planet_max_fields ===');
  const { rows: fn1 } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'calculate_planet_max_fields'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (fn1.length > 0) console.log(fn1[0].prosrc);

  // 2. update_planet_fields_on_terraformer
  console.log('\n=== update_planet_fields_on_terraformer ===');
  const { rows: fn2 } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'update_planet_fields_on_terraformer'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (fn2.length > 0) console.log(fn2[0].prosrc);

  // 3. validate_building_fields
  console.log('\n=== validate_building_fields ===');
  const { rows: fn3 } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'validate_building_fields'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (fn3.length > 0) console.log(fn3[0].prosrc);

  // 4. secure_add_to_building_queue - fields check section
  console.log('\n=== secure_add_to_building_queue (fields check) ===');
  const { rows: fn4 } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'secure_add_to_building_queue'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (fn4.length > 0) {
    const src = fn4[0].prosrc;
    const idx = src.indexOf('fields');
    if (idx >= 0) {
      console.log(src.substring(Math.max(0, idx - 300), Math.min(src.length, idx + 500)));
    }
  }

  // 5. Check if fields_max was EVER updated on Kul Tiras (via building queue logs etc)
  // Check building queue for Kul Tiras
  console.log('\n=== Building queue history for Kul Tiras ===');
  const { rows: bq } = await c.query(`
    SELECT bq.*, bt.name as building_name
    FROM building_queue bq
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE bq.planet_id = '42d213d4-6932-4f0d-998b-ad237d670bb3'
    ORDER BY bq.created_at DESC
    LIMIT 10
  `);
  for (const q of bq) {
    console.log(`  ${q.building_name} -> status: ${q.status}, created: ${q.created_at}`);
  }

  // 6. Kul Tiras: What should fields_max be?
  // The user has terraformer level 1
  // Let's call calculate_planet_max_fields on it
  console.log('\n=== Calling calculate_planet_max_fields for Kul Tiras ===');
  try {
    const { rows: calc } = await c.query(`
      SELECT calculate_planet_max_fields('42d213d4-6932-4f0d-998b-ad237d670bb3') as result
    `);
    console.log('Result:', calc[0]?.result);
  } catch(e) {
    console.log('Error:', e.message);
  }

  // 7. Check complete_building_queue_item for fields_max update
  console.log('\n=== complete_building_queue_item (fields section) ===');
  const { rows: fn5 } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'complete_building_queue_item'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (fn5.length > 0) {
    const src = fn5[0].prosrc;
    // Find fields_max section
    let idx = 0;
    while (true) {
      idx = src.indexOf('fields_max', idx);
      if (idx === -1) break;
      console.log(`\n  [fields_max at pos ${idx}]:`, src.substring(Math.max(0, idx - 200), Math.min(src.length, idx + 200)));
      idx += 10;
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
