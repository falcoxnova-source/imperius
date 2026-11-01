const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const fn = await c.query("SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick'");
  const src = fn.rows[0].prosrc;

  const checks = {
    espionageMissionBranch: /mission_type\s*=\s*'espionage'/i.test(src),
    attackMissionBranch: /mission_type\s*=\s*'attack'/i.test(src),
    recycleMissionBranch: /mission_type\s*=\s*'recycle'/i.test(src),
    transportMissionBranch: /mission_type\s*=\s*'transport'/i.test(src),
    colonizeMissionBranch: /mission_type\s*=\s*'colonize'/i.test(src),
    spyDataParsing: /jsonb_array_elements\(COALESCE\(v_spy_body->'ships'|jsonb_array_elements\(COALESCE\(v_spy_body->'defenses'/i.test(src),
    combatPowerEstimation: /estimate_profile_combat_power\(|estimate_defense_power\(/i.test(src),
    antiSpamRecentAttacksGuard: /interval '24 hours'/i.test(src),
    distanceAwareTargeting: /ABS\(tp\.solar_system - v_planet\.solar_system\)/i.test(src),
    randomnessForHumanLikeBehavior: /random\(\)/i.test(src),
    retaliationLogic: /v_attacker_planet|retaliat/i.test(src),
    fleetSaveLogic: /v_save_target|fleet save/i.test(src),
    requirementChecksShipsDefenses: /ship_requirements/i.test(src) && /defense_requirements/i.test(src)
  };

  console.log(JSON.stringify(checks, null, 2));
  await c.end();
})();
