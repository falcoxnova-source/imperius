import pg from 'pg';
import fs from 'fs';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const funcs = ['secure_add_to_building_queue', 'secure_start_research', 'secure_add_to_shipyard_queue'];
for (const f of funcs) {
  // Get the full function definition (SQL text)
  const r = await c.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = $1", [f]);
  let def = r.rows[0].def;

  // Add v_speed_bonus declaration - find the last DECLARE variable before BEGIN
  if (!def.includes('v_speed_bonus numeric')) {
    // Add after last declare variable (before BEGIN)
    def = def.replace(/(v_\w+ \w+;[\s\S]*?)(?=^BEGIN)/m, (match) => {
      // Find the last variable declaration in this match
      const lines = match.split('\n');
      // Add v_speed_bonus after the last line of the declare section
      const lastLine = lines[lines.length - 1];
      if (!lastLine.trim().startsWith('v_speed_bonus')) {
        // Insert before the line that has BEGIN or after the last variable
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].trim().match(/^v_\w+ \w+;$/)) {
            lines.splice(i + 1, 0, 'v_speed_bonus numeric;');
            break;
          }
        }
      }
      return lines.join('\n');
    });
  }

  const speedInsert = `-- Daily missions speed bonus\nv_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());\nIF v_speed_bonus > 0 THEN\n  v_build_time := GREATEST(1, FLOOR(v_build_time * (1 - v_speed_bonus)));\nEND IF;`;

  // For research, use v_research_time
  const speedInsertResearch = `-- Daily missions speed bonus\nv_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());\nIF v_speed_bonus > 0 THEN\n  v_research_time := GREATEST(1, FLOOR(v_research_time * (1 - v_speed_bonus)));\nEND IF;`;

  // For shipyard, use v_build_time_per_unit
  const speedInsertShipyard = `-- Daily missions speed bonus\nv_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());\nIF v_speed_bonus > 0 THEN\n  v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * (1 - v_speed_bonus)));\nEND IF;`;

  if (f === 'secure_add_to_building_queue') {
    // Insert after END IF; (VIP bonus) and before next line
    def = def.replace(
      /(END IF;\n)\n(v_is_first)/,
      `$1\n${speedInsert}\n\n$2`
    );
  } else if (f === 'secure_start_research') {
    // Has 2 time blocks - insert after each VIP bonus END IF
    // First occurrence
    def = def.replace(
      /(IF is_user_plus\(auth\.uid\(\)\) THEN\n\s+v_research_time := GREATEST\(1, FLOOR\(v_research_time \* 0\.90\)\);\n\s+END IF;\n)\n\s+UPDATE planet_resources/,
      `$1    ${speedInsertResearch}\n\n    UPDATE planet_resources`
    );
    // Second occurrence
    def = def.replace(
      /(IF is_user_plus\(auth\.uid\(\)\) THEN\n\s+v_research_time := GREATEST\(1, FLOOR\(v_research_time \* 0\.90\)\);\n\s+END IF;\n)\n\s+v_start_time/,
      `$1  ${speedInsertResearch}\n\n  v_start_time`
    );
  } else if (f === 'secure_add_to_shipyard_queue') {
    def = def.replace(
      /(END IF;\n)\n(UPDATE planet_resources)/,
      `$1\n${speedInsertShipyard}\n\n$2`
    );
  }

  // Write to temp file and execute
  const tmpFile = `D:\\Falco-Xnova Bolt Supabase\\tmp_${f}.sql`;
  fs.writeFileSync(tmpFile, def, 'utf8');
  const sql = fs.readFileSync(tmpFile, 'utf8');
  await c.query(sql);
  console.log(`${f} OK`);
}

// Create the helper function
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
console.log('get_user_daily_mission_speed_bonus OK');

await c.end();
