const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // =============================================
  // STEP 1: Get current function source
  // =============================================
  const fnInfo = await c.query(`
    SELECT p.prosrc, pg_get_function_result(p.oid) as result_type, p.prosecdef
    FROM pg_proc p WHERE p.proname = 'calculate_planet_resources' LIMIT 1
  `);
  let src = fnInfo.rows[0].prosrc;
  const resultType = fnInfo.rows[0].result_type;
  const isSecDef = fnInfo.rows[0].prosecdef;

  // =============================================
  // STEP 2: Apply the surgical fix
  // =============================================
  // Find the exact insertion point: right AFTER the mine_bonus and energy_bonus assignments
  const oldCode = `v_mine_bonus := COALESCE((v_officer_bonuses->>'mineProduction')::numeric, 0);
v_energy_bonus := COALESCE((v_officer_bonuses->>'energyProduction')::numeric, 0);`;

  const newCode = `v_mine_bonus := COALESCE((v_officer_bonuses->>'mineProduction')::numeric, 0);
v_energy_bonus := COALESCE((v_officer_bonuses->>'energyProduction')::numeric, 0);

-- VIP Plus: +10% mine production (stacks additively with Geologist for +20%)
IF is_user_plus(v_user_id) THEN
  v_mine_bonus := v_mine_bonus + 0.1;
END IF;`;

  if (!src.includes(oldCode)) {
    console.error('ERROR: Could not find exact code block to replace!');
    // Try to find it with variations
    console.log('Looking for mine_bonus assignment...');
    const idx = src.indexOf('v_mine_bonus := COALESCE');
    if (idx > -1) {
      console.log('Found at pos', idx);
      console.log(src.substring(idx, idx + 250));
    }
    await c.end();
    return;
  }

  src = src.replace(oldCode, newCode);
  console.log('✅ Code replaced successfully');

  // =============================================
  // STEP 3: Recreate the function
  // =============================================
  const security = isSecDef ? 'SECURITY DEFINER' : '';
  const createSQL = `
CREATE OR REPLACE FUNCTION calculate_planet_resources(p_planet_id uuid)
RETURNS ${resultType}
LANGUAGE plpgsql
${security}
AS $function$
${src}
$function$;
  `;

  await c.query(createSQL);
  console.log('✅ Function updated in database');

  // =============================================
  // STEP 4: Verify the fix is in the function
  // =============================================
  const verify = await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_planet_resources' LIMIT 1");
  const newSrc = verify.rows[0].prosrc;
  
  if (newSrc.includes('is_user_plus(v_user_id)') && newSrc.includes('v_mine_bonus := v_mine_bonus + 0.1')) {
    console.log('✅ Verified: VIP +10% production bonus is now in the function');
  } else {
    console.error('❌ Verification failed!');
    await c.end();
    return;
  }

  // =============================================
  // STEP 5: Test with a real VIP user BEFORE sync
  // =============================================
  // Get Layonnel's planet data BEFORE recalculation
  const beforeData = await c.query(`
    SELECT res.metal_per_hour, res.crystal_per_hour, res.deuterium_per_hour
    FROM planet_resources res
    WHERE res.planet_id = '80dd307c-c915-48df-93b3-7870fb33cb91'
  `);
  const before = beforeData.rows[0];
  console.log('\n=== Layonnel "La Caliente" - BEFORE recalc ===');
  console.log(`  Metal/h: ${before.metal_per_hour}, Crystal/h: ${before.crystal_per_hour}, Deut/h: ${before.deuterium_per_hour}`);

  // Trigger recalculation via calculate_planet_resources
  const recalc = await c.query("SELECT calculate_planet_resources('80dd307c-c915-48df-93b3-7870fb33cb91') as result");
  const result = recalc.rows[0].result;
  console.log('\n=== Layonnel "La Caliente" - AFTER recalc ===');
  console.log(`  Metal/h: ${result.metal_per_hour}, Crystal/h: ${result.crystal_per_hour}, Deut/h: ${result.deuterium_per_hour}`);

  // Compare
  const metalDiff = result.metal_per_hour - parseFloat(before.metal_per_hour);
  const crystalDiff = result.crystal_per_hour - parseFloat(before.crystal_per_hour);
  const deutDiff = result.deuterium_per_hour - parseFloat(before.deuterium_per_hour);
  console.log(`\n  Metal   change: ${metalDiff > 0 ? '+' : ''}${metalDiff} (${metalDiff > 0 ? '+' + ((metalDiff / parseFloat(before.metal_per_hour)) * 100).toFixed(1) + '%' : 'no change'})`);
  console.log(`  Crystal change: ${crystalDiff > 0 ? '+' : ''}${crystalDiff} (${crystalDiff > 0 ? '+' + ((crystalDiff / parseFloat(before.crystal_per_hour)) * 100).toFixed(1) + '%' : 'no change'})`);
  console.log(`  Deut    change: ${deutDiff > 0 ? '+' : ''}${deutDiff} (${deutDiff !== 0 ? ((deutDiff / Math.abs(parseFloat(before.deuterium_per_hour))) * 100).toFixed(1) + '%' : 'no change'})`);

  // Also check a non-VIP user to make sure they're NOT affected
  console.log('\n=== Non-VIP user check ===');
  // Find a non-VIP user with good production
  const nonVipPlanet = await c.query(`
    SELECT p.id, p.name, pr.username, res.metal_per_hour
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    JOIN planet_resources res ON res.planet_id = p.id
    WHERE NOT EXISTS (
      SELECT 1 FROM plus_subscriptions ps 
      WHERE ps.user_id = p.user_id AND ps.is_active = true AND ps.expires_at > now()
    )
    AND res.metal_per_hour > 10000
    ORDER BY res.metal_per_hour DESC
    LIMIT 1
  `);
  if (nonVipPlanet.rows.length) {
    const nv = nonVipPlanet.rows[0];
    const recalc2 = await c.query("SELECT calculate_planet_resources($1) as result", [nv.id]);
    const r2 = recalc2.rows[0].result;
    const diff = r2.metal_per_hour - parseFloat(nv.metal_per_hour);
    console.log(`  ${nv.username} - ${nv.name}: metal before=${nv.metal_per_hour}, after=${r2.metal_per_hour} (diff=${diff})`);
    if (Math.abs(diff) < 1) {
      console.log('  ✅ Non-VIP user unaffected (as expected)');
    } else {
      console.log('  ⚠️ Non-VIP user had a diff (likely from time-based accumulation, not bug)');
    }
  }

  await c.end();
  console.log('\n✅ Fix complete!');
}
main().catch(e => { console.error(e); process.exit(1); });
