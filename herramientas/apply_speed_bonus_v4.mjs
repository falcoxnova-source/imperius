import pg from 'pg';
import fs from 'fs';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Get current shipyard function
const r = await c.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'secure_add_to_shipyard_queue'");
let def = r.rows[0].def;

// Add v_speed_bonus declaration if not present
if (!def.includes('v_speed_bonus numeric')) {
  def = def.replace(/(v_\w+ \w+;)\s*\n/i, (match) => {
    return match + '\nv_speed_bonus numeric;';
  });
}

// Insert speed bonus after VIP bonus END IF, before UPDATE
// The regex needs to handle \r\n (Windows) line endings
def = def.replace(
  /(END IF;\r?\n)\r?\n(UPDATE planet_resources)/,
  (match, endIf, update) => {
    const nl = endIf.includes('\r\n') ? '\r\n' : '\n';
    return endIf + nl +
      '-- Daily missions speed bonus' + nl +
      'v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());' + nl +
      'IF v_speed_bonus > 0 THEN' + nl +
      '  v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * (1 - v_speed_bonus)));' + nl +
      'END IF;' + nl + nl +
      update;
  }
);

const tmpFile = 'D:\\Falco-Xnova Bolt Supabase\\tmp_secure_add_to_shipyard_queue.sql';
fs.writeFileSync(tmpFile, def, 'utf8');
await c.query(def);
console.log('secure_add_to_shipyard_queue OK');

// Fix building queue too (same \r\n issue)
const r2 = await c.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'secure_add_to_building_queue'");
let def2 = r2.rows[0].def;
if (!def2.includes('get_user_daily_mission_speed_bonus')) {
  def2 = def2.replace(
    /(END IF;\r?\n)\r?\n(v_is_first)/,
    (match, endIf, next) => {
      const nl = endIf.includes('\r\n') ? '\r\n' : '\n';
      return endIf + nl +
        '-- Daily missions speed bonus' + nl +
        'v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());' + nl +
        'IF v_speed_bonus > 0 THEN' + nl +
        '  v_build_time := GREATEST(1, FLOOR(v_build_time * (1 - v_speed_bonus)));' + nl +
        'END IF;' + nl + nl +
        next;
    }
  );
  await c.query(def2);
  console.log('secure_add_to_building_queue re-patched');
}

// Fix research too (check both locations)
const r3 = await c.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'secure_start_research'");
let def3 = r3.rows[0].def;
if (!def3.includes('get_user_daily_mission_speed_bonus')) {
  // Fix first occurrence
  def3 = def3.replace(
    /(IF is_user_plus\(auth\.uid\(\)\) THEN\r?\n\s+v_research_time := GREATEST\(1, FLOOR\(v_research_time \* 0\.90\)\);\r?\n\s+END IF;\r?\n)\r?\n\s+UPDATE planet_resources/,
    (match, bonusBlock) => {
      const nl = bonusBlock.includes('\r\n') ? '\r\n' : '\n';
      return bonusBlock + nl + '    -- Daily missions speed bonus' + nl +
        '    v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());' + nl +
        '    IF v_speed_bonus > 0 THEN' + nl +
        '      v_research_time := GREATEST(1, FLOOR(v_research_time * (1 - v_speed_bonus)));' + nl +
        '    END IF;' + nl + nl +
        '    UPDATE planet_resources';
    }
  );
  // Fix second occurrence
  def3 = def3.replace(
    /(IF is_user_plus\(auth\.uid\(\)\) THEN\r?\n\s+v_research_time := GREATEST\(1, FLOOR\(v_research_time \* 0\.90\)\);\r?\n\s+END IF;\r?\n)\r?\n\s+v_start_time/,
    (match, bonusBlock) => {
      const nl = bonusBlock.includes('\r\n') ? '\r\n' : '\n';
      return bonusBlock + nl + '  -- Daily missions speed bonus' + nl +
        '  v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());' + nl +
        '  IF v_speed_bonus > 0 THEN' + nl +
        '    v_research_time := GREATEST(1, FLOOR(v_research_time * (1 - v_speed_bonus)));' + nl +
        '  END IF;' + nl + nl +
        '  v_start_time';
    }
  );
  await c.query(def3);
  console.log('secure_start_research re-patched');
}

console.log('\nFinished');
await c.end();
