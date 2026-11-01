const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://hhrgcnvydmjqcevgmlhj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocmdjbnZ5ZG1qcWNldmdtbGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczOTE2MDEsImV4cCI6MjA4Mjk2NzYwMX0.YYoUqIuz9GS-pgkqkSz33W6K7TCYSyayc1yHtUCryUU'
);

async function main() {
  // 1. secure_send_fleet full body
  console.log('=== 1. secure_send_fleet FULL BODY ===');
  const { data: d1, error: e1 } = await supabase.rpc('admin_run_sql', { sql_query: `
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'secure_send_fleet' AND n.nspname = 'public'
  `});
  if (e1) console.log('ERR1:', e1.message);
  else if (d1 && d1.length > 0) console.log(d1[0].def);
  else console.log('No result');

  // 2. Check if fleets or fleet_movements table
  console.log('\n=== 2. fleets table columns ===');
  const { data: d2, error: e2 } = await supabase.rpc('admin_run_sql', { sql_query: `
    SELECT column_name, data_type, column_default
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'fleets'
    ORDER BY ordinal_position
  `});
  if (e2) console.log('ERR2:', e2.message);
  else if (d2) d2.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

  // 3. fleet_ships columns
  console.log('\n=== 3. fleet_ships columns ===');
  const { data: d3, error: e3 } = await supabase.rpc('admin_run_sql', { sql_query: `
    SELECT column_name, data_type
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'fleet_ships'
    ORDER BY ordinal_position
  `});
  if (e3) console.log('ERR3:', e3.message);
  else if (d3) d3.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

  // 4. validate_fleet_mission body
  console.log('\n=== 4. validate_fleet_mission BODY ===');
  const { data: d4, error: e4 } = await supabase.rpc('admin_run_sql', { sql_query: `
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'validate_fleet_mission' AND n.nspname = 'public'
  `});
  if (e4) console.log('ERR4:', e4.message);
  else if (d4 && d4.length > 0) console.log(d4[0].def);

  // 5. Bot ships status
  console.log('\n=== 5. Bot planet ships ===');
  const { data: d5, error: e5 } = await supabase.rpc('admin_run_sql', { sql_query: `
    SELECT pr.username, p.galaxy, p.system, p.position, st.code, ps.quantity
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE pr.is_bot = true AND ps.quantity > 0
    ORDER BY pr.username, st.code
    LIMIT 40
  `});
  if (e5) console.log('ERR5:', e5.message);
  else if (d5) d5.forEach(r => console.log(`  ${r.username} [${r.galaxy}:${r.system}:${r.position}] ${r.code} x${r.quantity}`));

  // 6. Bot active fleets
  console.log('\n=== 6. Bot active fleets ===');
  const { data: d6, error: e6 } = await supabase.rpc('admin_run_sql', { sql_query: `
    SELECT COUNT(*) as cnt FROM fleets f JOIN profiles pr ON pr.id = f.user_id
    WHERE pr.is_bot = true AND f.is_completed = false
  `});
  if (e6) console.log('ERR6:', e6.message);
  else console.log('Active bot fleets:', d6);

  // 7. Non-bot players near bots (potential targets)
  console.log('\n=== 7. Non-bot planets near bots ===');
  const { data: d7, error: e7 } = await supabase.rpc('admin_run_sql', { sql_query: `
    SELECT DISTINCT bp.galaxy, bp.system, 
      tp.position as target_pos, tpr.username as target_user, tpr.points_total,
      bp_pr.username as bot_name
    FROM planets bp
    JOIN profiles bp_pr ON bp_pr.id = bp.user_id AND bp_pr.is_bot = true
    JOIN planets tp ON tp.galaxy = bp.galaxy 
      AND tp.system BETWEEN bp.system - 50 AND bp.system + 50
      AND tp.planet_type = 'planet'
    JOIN profiles tpr ON tpr.id = tp.user_id AND tpr.is_bot = false
    ORDER BY bp_pr.username
    LIMIT 30
  `});
  if (e7) console.log('ERR7:', e7.message);
  else if (d7) d7.forEach(r => console.log(`  Bot ${r.bot_name} -> ${r.target_user} [${r.galaxy}:${r.system}:${r.target_pos}] pts=${r.points_total}`));

  // 8. profiles.is_admin column exists?
  console.log('\n=== 8. profiles columns (admin related) ===');
  const { data: d8 } = await supabase.rpc('admin_run_sql', { sql_query: `
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name LIKE '%admin%'
  `});
  console.log('Admin columns:', d8);
}

main().catch(console.error);
