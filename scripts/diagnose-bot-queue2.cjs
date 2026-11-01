const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected.\n');

  // Check bot count
  const { rows: [botCount] } = await client.query("SELECT COUNT(*) as cnt FROM profiles WHERE is_bot = true");
  console.log('Total bots:', botCount.cnt);

  // Check bot buildings per bot
  const { rows: botSummary } = await client.query(`
    SELECT p.username,
           COUNT(pb.*) FILTER (WHERE pb.level > 0) as buildings_count,
           STRING_AGG(bt.code || ':' || pb.level, ', ' ORDER BY bt.code) as buildings
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id AND pl.planet_type = 'planet'
    LEFT JOIN planet_buildings pb ON pb.planet_id = pl.id AND pb.level > 0
    LEFT JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE p.is_bot = true
    GROUP BY p.username
    ORDER BY p.username
  `);
  console.log('\n=== Bot Building Summary ===');
  botSummary.forEach(r => {
    console.log('  ' + r.username + ': ' + r.buildings_count + ' buildings | ' + (r.buildings || 'none'));
  });

  // Check bot resources
  const { rows: botRes } = await client.query(`
    SELECT p.username, 
           FLOOR(pr.metal) as metal, FLOOR(pr.crystal) as crystal, FLOOR(pr.deuterium) as deut,
           pr.last_update
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id AND pl.planet_type = 'planet'
    JOIN planet_resources pr ON pr.planet_id = pl.id
    WHERE p.is_bot = true
    ORDER BY p.username
  `);
  console.log('\n=== Bot Resources ===');
  botRes.forEach(r => {
    console.log('  ' + r.username + ': M=' + r.metal + ' C=' + r.crystal + ' D=' + r.deut + ' | last_update=' + r.last_update);
  });

  // Check current bot queue
  const { rows: botQ } = await client.query(`
    SELECT p.username, bt.code, bq.target_level, bq.build_time, bq.start_time, bq.end_time,
           bq.metal_cost, bq.crystal_cost, bq.deuterium_cost
    FROM building_queue bq
    JOIN planets pl ON pl.id = bq.planet_id
    JOIN profiles p ON p.id = pl.user_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE p.is_bot = true
    ORDER BY p.username
  `);
  console.log('\n=== Current Bot Queue (' + botQ.length + ' items) ===');
  botQ.forEach(r => {
    console.log('  ' + r.username + ' | ' + r.code + ' -> lvl' + r.target_level + 
      ' | cost: ' + r.metal_cost + 'm ' + r.crystal_cost + 'c ' + r.deuterium_cost + 'd' +
      ' | time: ' + r.build_time + 's | end: ' + (r.end_time ? new Date(r.end_time).toISOString() : 'null'));
  });

  // Now run bot_ai_tick manually and check result
  console.log('\n=== Running bot_ai_tick() manually ===');
  const { rows: [tick] } = await client.query('SELECT bot_ai_tick() as result');
  console.log('Result:', JSON.stringify(tick.result, null, 2));

  // Check queue again
  const { rows: afterQ } = await client.query(`
    SELECT p.username, bt.code, bq.target_level, bq.build_time, bq.start_time, bq.end_time,
           bq.metal_cost, bq.crystal_cost, bq.deuterium_cost
    FROM building_queue bq
    JOIN planets pl ON pl.id = bq.planet_id
    JOIN profiles p ON p.id = pl.user_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE p.is_bot = true
    ORDER BY p.username
  `);
  console.log('\n=== Bot Queue AFTER tick (' + afterQ.length + ' items) ===');
  afterQ.forEach(r => {
    console.log('  ' + r.username + ' | ' + r.code + ' -> lvl' + r.target_level + 
      ' | cost: ' + r.metal_cost + 'm ' + r.crystal_cost + 'c ' + r.deuterium_cost + 'd' +
      ' | time: ' + r.build_time + 's | end: ' + (r.end_time ? new Date(r.end_time).toISOString() : 'null'));
  });

  // Check cost of next building for a bot (e.g., solar_plant level 2)
  const { rows: costs } = await client.query(`
    SELECT code, 
           FLOOR(base_metal * POWER(cost_factor, 1)) as metal_l2,
           FLOOR(base_crystal * POWER(cost_factor, 1)) as crystal_l2,
           FLOOR(base_deuterium * POWER(cost_factor, 1)) as deut_l2
    FROM building_types
    WHERE code IN ('metal_mine', 'crystal_mine', 'solar_plant', 'deuterium_synthesizer')
    ORDER BY code
  `);
  console.log('\n=== Level 2 Building Costs ===');
  costs.forEach(r => {
    console.log('  ' + r.code + ' lvl2: M=' + r.metal_l2 + ' C=' + r.crystal_l2 + ' D=' + r.deut_l2);
  });

  await client.end();
  console.log('\nDone.');
}

main().catch(e => {
  console.error('Fatal:', e.message);
  client.end();
  process.exit(1);
});
