import pg from 'pg';
import fs from 'fs';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// 1. Create speed bonus helper
await c.query(`
  CREATE OR REPLACE FUNCTION get_user_daily_mission_speed_bonus(p_user_id uuid)
  RETURNS numeric
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_bonus numeric := 0;
  BEGIN
    SELECT COALESCE(SUM(bonus_value), 0) INTO v_bonus
    FROM user_active_bonuses
    WHERE user_id = p_user_id
      AND bonus_type = 'speed_bonus'
      AND expires_at > now();
    RETURN v_bonus / 100.0;
  END;
  $$;
  GRANT EXECUTE ON FUNCTION get_user_daily_mission_speed_bonus(uuid) TO authenticated;
`);
console.log('1. get_user_daily_mission_speed_bonus creada');

// 2. Patch building queue function
const bqSql = fs.readFileSync('D:\\Falco-Xnova Bolt Supabase\\func_secure_add_to_building_queue.sql', 'utf8');
// Add v_speed_bonus declaration after v_game_speed
const bqPatched = bqSql
  .replace('v_game_speed integer;', 'v_game_speed integer;\nv_speed_bonus numeric;')
  .replace(
    '-- VIP Plus: -10% construction time\nIF is_user_plus(auth.uid()) THEN\n  v_build_time := GREATEST(1, FLOOR(v_build_time * 0.90));\nEND IF;',
    '-- VIP Plus: -10% construction time\nIF is_user_plus(auth.uid()) THEN\n  v_build_time := GREATEST(1, FLOOR(v_build_time * 0.90));\nEND IF;\n\n-- Daily missions speed bonus\nv_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());\nIF v_speed_bonus > 0 THEN\n  v_build_time := GREATEST(1, FLOOR(v_build_time * (1 - v_speed_bonus)));\nEND IF;'
  );
await c.query(bqPatched);
console.log('2. secure_add_to_building_queue actualizada');

// 3. Patch research function (has 2 time calculation blocks)
const rsSql = fs.readFileSync('D:\\Falco-Xnova Bolt Supabase\\func_secure_start_research.sql', 'utf8');
// Add v_speed_bonus declaration after v_has_technocrat
const rsPatched1 = rsSql.replace(
  'v_has_technocrat boolean;',
  'v_has_technocrat boolean;\nv_speed_bonus numeric;'
);
// Patch first time block (line 153 area)
const rsPatched2 = rsPatched1.replace(
  '    IF is_user_plus(auth.uid()) THEN\n      v_research_time := GREATEST(1, FLOOR(v_research_time * 0.90));\n    END IF;\n\n    UPDATE planet_resources',
  '    IF is_user_plus(auth.uid()) THEN\n      v_research_time := GREATEST(1, FLOOR(v_research_time * 0.90));\n    END IF;\n\n    v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());\n    IF v_speed_bonus > 0 THEN\n      v_research_time := GREATEST(1, FLOOR(v_research_time * (1 - v_speed_bonus)));\n    END IF;\n\n    UPDATE planet_resources'
);
// Patch second time block (line 221 area)
const rsPatched3 = rsPatched2.replace(
    '  IF is_user_plus(auth.uid()) THEN\n      v_research_time := GREATEST(1, FLOOR(v_research_time * 0.90));\n    END IF;\n\n  v_start_time',
    '  IF is_user_plus(auth.uid()) THEN\n      v_research_time := GREATEST(1, FLOOR(v_research_time * 0.90));\n    END IF;\n\n  v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());\n  IF v_speed_bonus > 0 THEN\n    v_research_time := GREATEST(1, FLOOR(v_research_time * (1 - v_speed_bonus)));\n  END IF;\n\n  v_start_time'
);
await c.query(rsPatched3);
console.log('3. secure_start_research actualizada');

// 4. Patch shipyard queue function
const sySql = fs.readFileSync('D:\\Falco-Xnova Bolt Supabase\\func_secure_add_to_shipyard_queue.sql', 'utf8');
// Add v_speed_bonus declaration - find a good spot (after nanite declaration)
const syPatched = sySql
  .replace('v_nanite_level integer;', 'v_nanite_level integer;\nv_speed_bonus numeric;')
  .replace(
    '-- VIP Plus: -10% shipyard construction time\nIF is_user_plus(auth.uid()) THEN\n  v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * 0.90));\nEND IF;\n\nUPDATE planet_resources',
    '-- VIP Plus: -10% shipyard construction time\nIF is_user_plus(auth.uid()) THEN\n  v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * 0.90));\nEND IF;\n\n-- Daily missions speed bonus\nv_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());\nIF v_speed_bonus > 0 THEN\n  v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * (1 - v_speed_bonus)));\nEND IF;\n\nUPDATE planet_resources'
  );
await c.query(syPatched);
console.log('4. secure_add_to_shipyard_queue actualizada');

console.log('\nTodo listo.');
await c.end();
