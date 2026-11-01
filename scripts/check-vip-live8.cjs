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

  // 1. Get VIP user's main planet (not moon)
  const r1 = await c.query(`
    SELECT ps.user_id, p.username, pl.id as planet_id, pl.name as planet_name, pl.planet_type
    FROM plus_subscriptions ps 
    JOIN profiles p ON p.id = ps.user_id 
    JOIN planets pl ON pl.user_id = ps.user_id
    WHERE ps.is_active = true AND ps.expires_at > now() 
    AND p.username != 'admin'
    AND pl.planet_type = 'planet'
    ORDER BY p.username
    LIMIT 3
  `);
  
  for (const row of r1.rows) {
    const { user_id, username, planet_id, planet_name } = row;
    console.log(`\n=== VIP user: ${username}, planet: ${planet_name} ===`);

    // Mine levels
    const r2 = await c.query(`
      SELECT bt.code, pb.level FROM planet_buildings pb 
      JOIN building_types bt ON bt.id = pb.building_type_id 
      WHERE pb.planet_id = $1 
      AND bt.code IN ('metal_mine', 'crystal_mine', 'deuterium_synthesizer')
      ORDER BY bt.code
    `, [planet_id]);
    
    // Calculate resource production
    const r3 = await c.query("SELECT calculate_planet_resources($1) as result", [planet_id]);
    const result = r3.rows[0]?.result;
    
    // Get officer bonuses
    const r4 = await c.query("SELECT get_user_officer_bonuses($1) as bonuses", [user_id]);
    const geo = r4.rows[0]?.bonuses?.mineProduction || 0;
    
    console.log(`  Geologist bonus: ${geo}`);
    console.log(`  is_user_plus: true`);
    console.log(`  metal_per_hour: ${result?.metal_per_hour}`);
    
    for (const mine of r2.rows) {
      let base;
      if (mine.code === 'metal_mine') base = 30;
      else if (mine.code === 'crystal_mine') base = 20;
      else base = 10;
      
      const baseProduction = Math.floor(base * mine.level * Math.pow(1.1, mine.level));
      // Without VIP: only geologist
      const noVIP = Math.floor(baseProduction * (1 + geo)) * 10;
      // With VIP: geologist + 0.1
      const withVIP = Math.floor(baseProduction * (1 + geo + 0.1)) * 10;
      console.log(`  ${mine.code} L${mine.level}: base=${baseProduction}, noVIP=${noVIP}/h, withVIP=${withVIP}/h`);
    }
    console.log(`  Actual result from calculate_planet_resources: metal=${result?.metal_per_hour}, crystal=${result?.crystal_per_hour}, deut=${result?.deuterium_per_hour}`);
    break; // Just test one
  }

  // 2. Find migrations that touch secure_add_to_shipyard_queue
  console.log('\n=== Searching for migrations that modified secure_add_to_shipyard_queue ===');
  // We can't query filesystem from DB, but let's check the actual function for clues
  const r5 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_shipyard_queue' AND pronamespace='public'::regnamespace");
  const src = r5.rows[0]?.prosrc || '';
  
  // Show the anchor text that the VIP patch was looking for
  const targetText = '      / v_game_speed\n    ));\n  END IF;';
  console.log('VIP patch anchor text exists:', src.includes(targetText));
  
  // Try variations
  const variations = [
    '/ v_game_speed\n));\nEND IF;',
    '/ v_game_speed\n    ));\n  END IF;',
    '      / v_game_speed\n    ));\n  END IF;',
    '/ v_game_speed\r\n));\r\nEND IF;',
  ];
  for (const v of variations) {
    if (src.includes(v)) {
      console.log(`  Found variation: "${v.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`);
    }
  }
  
  // Show lines around END IF
  const lines = src.split('\n');
  console.log('\nLines around END IF blocks:');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'END IF;') {
      for (let j = Math.max(0, i-3); j <= Math.min(lines.length-1, i+3); j++) {
        console.log(`  ${j+1}: [${lines[j]}]`);
      }
      console.log('  ---');
    }
  }

  // 3. Check frontend resource hook/store
  // Let's see what Supabase RPCs the frontend calls
  
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
