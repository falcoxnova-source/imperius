const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  await c.connect();

  // 1. check_protection_status function
  console.log('=== check_protection_status ===');
  const { rows: cps } = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'check_protection_status' AND pronamespace = 'public'::regnamespace LIMIT 1`);
  console.log(cps[0]?.prosrc?.substring(0, 2000));

  // 2. Bot points/scores
  console.log('\n\n=== Bot scores (points) ===');
  const { rows: bp } = await c.query(`
    SELECT p.username, p.points, p.is_bot
    FROM profiles p
    WHERE p.is_bot = true
    ORDER BY p.username
    LIMIT 5
  `);
  bp.forEach(r => console.log(`  ${r.username}: ${r.points} pts`));

  // 3. Bot planet coordinates (for fleet targeting)
  console.log('\n\n=== Bot planet coordinates ===');
  const { rows: bc } = await c.query(`
    SELECT p.username, pl.galaxy, pl.solar_system, pl.position, pl.name
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id
    WHERE p.is_bot = true
    ORDER BY pl.galaxy, pl.solar_system, pl.position
    LIMIT 25
  `);
  bc.forEach(r => console.log(`  ${r.username}: [${r.galaxy}:${r.solar_system}:${r.position}] ${r.name}`));

  // 4. Real player planets near bots (to see potential targets)
  console.log('\n\n=== Real players near bots (same systems) ===');
  const { rows: near } = await c.query(`
    SELECT DISTINCT bp.username as bot_name, rp.username as player_name,
      rpl.galaxy, rpl.solar_system, rpl.position, rp.points as player_points
    FROM profiles bp
    JOIN planets bpl ON bpl.user_id = bp.id
    JOIN planets rpl ON rpl.galaxy = bpl.galaxy AND rpl.solar_system = bpl.solar_system AND NOT rpl.is_destroyed
    JOIN profiles rp ON rp.id = rpl.user_id AND rp.is_bot = false AND rp.is_admin = false
    WHERE bp.is_bot = true
    ORDER BY rpl.galaxy, rpl.solar_system
    LIMIT 20
  `);
  near.forEach(r => console.log(`  Bot ${r.bot_name} → Player ${r.player_name} [${r.galaxy}:${r.solar_system}:${r.position}] (${r.player_points} pts)`));

  // 5. Get noob protection settings
  console.log('\n\n=== Noob protection settings ===');
  const { rows: gs } = await c.query(`SELECT key, value FROM game_settings WHERE key LIKE '%protect%' OR key LIKE '%noob%' OR key LIKE '%bash%'`);
  gs.forEach(r => console.log(`  ${r.key}: ${r.value}`));

  await c.end();
}

main().catch(e => console.error(e));
