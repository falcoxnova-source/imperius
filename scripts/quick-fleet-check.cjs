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

  // 30 second timeout safety net
  const timer = setTimeout(() => { console.log('TIMEOUT 30s'); process.exit(1); }, 30000);

  try {
    await c.connect();
    console.log('✅ Connected');

    // Quick test each query individually to find which one hangs
    console.log('\n--- Query 1: protection functions ---');
    const q1 = await c.query("SELECT proname FROM pg_proc WHERE proname LIKE '%protection%' LIMIT 5");
    console.log('Results:', q1.rows.map(r => r.proname));

    console.log('\n--- Query 2: bot profiles ---');
    const q2 = await c.query("SELECT username, points FROM profiles WHERE is_bot = true ORDER BY username LIMIT 5");
    q2.rows.forEach(r => console.log('  ' + r.username + ': ' + r.points + ' pts'));

    console.log('\n--- Query 3: bot planets ---');
    const q3 = await c.query("SELECT p.username, pl.galaxy, pl.solar_system, pl.position FROM profiles p JOIN planets pl ON pl.user_id = p.id WHERE p.is_bot = true ORDER BY pl.galaxy, pl.solar_system LIMIT 10");
    q3.rows.forEach(r => console.log('  ' + r.username + ': [' + r.galaxy + ':' + r.solar_system + ':' + r.position + ']'));

    console.log('\n--- Query 4: near players (potential slow) ---');
    const q4 = await c.query(`
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
    q4.rows.forEach(r => console.log('  Bot ' + r.bot_name + ' → ' + r.player_name + ' [' + r.galaxy + ':' + r.solar_system + ':' + r.position + '] (' + r.player_points + ' pts)'));

    console.log('\n--- Query 5: game_settings ---');
    const q5 = await c.query("SELECT key, value FROM game_settings WHERE key LIKE '%protect%' OR key LIKE '%noob%' OR key LIKE '%bash%'");
    if (q5.rows.length === 0) {
      console.log('  No game_settings matching protect/noob/bash');
      // Try admin_speed_settings or similar
      const q5b = await c.query("SELECT * FROM admin_speed_settings LIMIT 1");
      console.log('  admin_speed_settings:', q5b.rows[0]);
    } else {
      q5.rows.forEach(r => console.log('  ' + r.key + ': ' + r.value));
    }

    console.log('\n✅ All queries completed successfully');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    clearTimeout(timer);
    await c.end();
  }
}

main();
