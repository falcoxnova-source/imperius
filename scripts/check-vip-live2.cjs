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

  // 1. Get optimized_global_queue_processor source to find resource calculation
  const r1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='optimized_global_queue_processor' AND pronamespace='public'::regnamespace");
  const src = r1.rows[0]?.prosrc || '';
  
  // Find lines related to resource production
  const lines = src.split('\n');
  console.log('=== CRON: Resource calculation sections ===');
  let inResourceSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('metal_production') || line.includes('crystal_production') || 
        line.includes('deuterium_production') || line.includes('mine_bonus') ||
        line.includes('officer_bonus') || line.includes('geologist') ||
        line.includes('mine_level') || line.includes('resource_speed') ||
        line.includes('base_metal') || line.includes('base_crystal') ||
        line.includes('base_deut') || line.includes('energy_factor') ||
        line.includes('elapsed') || line.includes('production') ||
        line.includes('storage') || line.includes('v_planet') ||
        line.includes('FOR rec IN') || line.includes('CURSOR') ||
        line.includes('bonus') || line.includes('officer')) {
      console.log(`L${i+1}: ${line.trimEnd()}`);
    }
  }
  
  // 2. Get secure_add_to_shipyard_queue to find what overwrote the VIP bonus
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_shipyard_queue' AND pronamespace='public'::regnamespace");
  const src2 = r2.rows[0]?.prosrc || '';
  
  // Find the build_time calculation area
  const lines2 = src2.split('\n');
  console.log('\n=== secure_add_to_shipyard_queue: build time section ===');
  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i];
    if (line.includes('build_time') || line.includes('VIP') || line.includes('game_speed') ||
        line.includes('is_user_plus')) {
      console.log(`L${i+1}: ${line.trimEnd()}`);
    }
  }
  
  // 3. Count active VIP users  
  const r3 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='plus_subscriptions' ORDER BY ordinal_position");
  console.log('\n=== plus_subscriptions columns ===');
  r3.rows.forEach(r => console.log(' -', r.column_name));
  
  // 4. Check if the cron does inline resource calc or delegates
  console.log('\n=== CRON: Full resource-related code block ===');
  // Let's find the section that does UPDATE planet_resources
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('planet_resources') || line.includes('UPDATE') && line.includes('resource')) {
      console.log(`L${i+1}: ${line.trimEnd()}`);
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
