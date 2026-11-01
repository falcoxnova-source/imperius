const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1. calculate_and_sync_resources
  const r1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_and_sync_resources' AND pronamespace='public'::regnamespace");
  console.log('=== calculate_and_sync_resources ===');
  if (r1.rows.length > 0) {
    const src = r1.rows[0].prosrc;
    console.log('Lines:', src.split('\n').length);
    console.log('Calls calculate_planet_resources:', src.includes('calculate_planet_resources'));
    console.log('Has VIP/is_user_plus:', src.includes('is_user_plus') || src.includes('VIP'));
    console.log('Has inline resource calc:', src.includes('mine_bonus') || src.includes('metal_mine'));
    // Print full source if short
    if (src.split('\n').length < 100) {
      console.log('\nFull source:');
      console.log(src);
    } else {
      console.log('\nFirst 50 lines:');
      src.split('\n').slice(0, 50).forEach((l, i) => console.log(`${i+1}: ${l}`));
    }
  }

  // 2. calculate_and_sync_resources_internal
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_and_sync_resources_internal' AND pronamespace='public'::regnamespace");
  console.log('\n=== calculate_and_sync_resources_internal ===');
  if (r2.rows.length > 0) {
    const src = r2.rows[0].prosrc;
    console.log('Lines:', src.split('\n').length);
    console.log('Calls calculate_planet_resources:', src.includes('calculate_planet_resources'));
    console.log('Has VIP/is_user_plus:', src.includes('is_user_plus') || src.includes('VIP'));
    console.log('Has inline resource calc:', src.includes('mine_bonus') || src.includes('metal_mine'));
    if (src.split('\n').length < 100) {
      console.log('\nFull source:');
      console.log(src);
    } else {
      console.log('\nFirst 80 lines:');
      src.split('\n').slice(0, 80).forEach((l, i) => console.log(`${i+1}: ${l}`));
    }
  }

  // 3. sync_planet_resources
  const r3 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='sync_planet_resources' AND pronamespace='public'::regnamespace");
  console.log('\n=== sync_planet_resources ===');
  if (r3.rows.length > 0) {
    const src = r3.rows[0].prosrc;
    console.log('Lines:', src.split('\n').length);
    console.log('Calls calculate_planet_resources:', src.includes('calculate_planet_resources'));
    console.log('Has VIP/is_user_plus:', src.includes('is_user_plus') || src.includes('VIP'));
    if (src.split('\n').length < 100) {
      console.log('\nFull source:');
      console.log(src);
    }
  }

  // 4. update_planet_resources
  const r4 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='update_planet_resources' AND pronamespace='public'::regnamespace");
  console.log('\n=== update_planet_resources ===');
  if (r4.rows.length > 0) {
    const src = r4.rows[0].prosrc;
    console.log('Lines:', src.split('\n').length);
    console.log('Calls calculate_planet_resources:', src.includes('calculate_planet_resources'));
    console.log('Has VIP/is_user_plus:', src.includes('is_user_plus') || src.includes('VIP'));
    if (src.split('\n').length < 100) {
      console.log('\nFull source:');
      console.log(src);
    }
  }

  // 5. full_reconnect_sync
  const r5 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='full_reconnect_sync' AND pronamespace='public'::regnamespace");
  console.log('\n=== full_reconnect_sync ===');
  if (r5.rows.length > 0) {
    const src = r5.rows[0].prosrc;
    console.log('Lines:', src.split('\n').length);
    console.log('Calls calculate_planet_resources:', src.includes('calculate_planet_resources'));
    console.log('Calls calculate_and_sync:', src.includes('calculate_and_sync'));
    console.log('Has VIP/is_user_plus:', src.includes('is_user_plus') || src.includes('VIP'));
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
