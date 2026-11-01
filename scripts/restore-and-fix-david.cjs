const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function restoreAndFix() {
  await client.connect();
  
  const planetId = '1473a75a-ef98-495b-a6c0-b9e9dc0889cd';
  
  // =============================================
  // STEP 1: Restore resources to ministroqt
  // =============================================
  console.log('=== STEP 1: RESTORE RESOURCES ===');
  
  // Read current resources BEFORE
  const before = await client.query(`
    SELECT metal, crystal, deuterium, metal_storage, crystal_storage, deuterium_storage
    FROM planet_resources WHERE planet_id = $1
  `, [planetId]);
  console.log('BEFORE:', JSON.stringify(before.rows[0], null, 2));
  
  // Add the lost cargo: 2,890,000 metal / 1,930,000 crystal / 1,270,000 deuterium
  const restoreResult = await client.query(`
    UPDATE planet_resources
    SET metal = metal + 2890000,
        crystal = crystal + 1930000,
        deuterium = deuterium + 1270000
    WHERE planet_id = $1
    RETURNING metal, crystal, deuterium, metal_storage, crystal_storage, deuterium_storage
  `, [planetId]);
  console.log('AFTER:', JSON.stringify(restoreResult.rows[0], null, 2));
  console.log('✅ Resources restored successfully!');

  // =============================================
  // STEP 2: Fix race condition - add FOR UPDATE lock
  // to calculate_and_sync_resources
  // =============================================
  console.log('\n=== STEP 2: FIX RACE CONDITION ===');
  
  // Get the current function source to patch it
  const funcSrc = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'calculate_and_sync_resources' 
    AND pronargs = 1
    LIMIT 1
  `);
  
  if (funcSrc.rows.length > 0) {
    const src = funcSrc.rows[0].prosrc;
    console.log('Current function found. Applying FOR UPDATE lock fix...');
    
    // Apply the fix: CREATE OR REPLACE with FOR UPDATE lock
    await client.query(`
      CREATE OR REPLACE FUNCTION calculate_and_sync_resources(p_planet_id uuid)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $func$
      DECLARE
        v_calculated jsonb;
        v_user_id uuid;
      BEGIN
        -- Verify ownership
        SELECT user_id INTO v_user_id FROM planets WHERE id = p_planet_id;
        IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
          RETURN jsonb_build_object('error', 'Unauthorized');
        END IF;
        
        -- FIX: Lock planet_resources row BEFORE reading to prevent race condition
        -- with fleet cargo deposits (process_fleet_arrival adds cargo with relative UPDATE)
        -- Without this lock, we could read stale values and overwrite fleet deposits
        PERFORM 1 FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;
        
        -- Calculate current resources (now safe - row is locked)
        v_calculated := calculate_planet_resources(p_planet_id);
        
        IF v_calculated ? 'error' THEN
          RETURN v_calculated;
        END IF;
        
        -- Update the database with calculated values AND new last_update
        UPDATE planet_resources
        SET 
          metal = (v_calculated->>'metal')::numeric,
          crystal = (v_calculated->>'crystal')::numeric,
          deuterium = (v_calculated->>'deuterium')::numeric,
          metal_per_hour = (v_calculated->>'metal_per_hour')::numeric,
          crystal_per_hour = (v_calculated->>'crystal_per_hour')::numeric,
          deuterium_per_hour = (v_calculated->>'deuterium_per_hour')::numeric,
          metal_storage = (v_calculated->>'metal_storage')::numeric,
          crystal_storage = (v_calculated->>'crystal_storage')::numeric,
          deuterium_storage = (v_calculated->>'deuterium_storage')::numeric,
          energy_used = (v_calculated->>'energy_used')::numeric,
          energy_max = (v_calculated->>'energy_max')::numeric,
          last_update = now()
        WHERE planet_id = p_planet_id;
        
        -- Return with current timestamp
        RETURN jsonb_build_object(
          'metal', (v_calculated->>'metal')::numeric,
          'crystal', (v_calculated->>'crystal')::numeric,
          'deuterium', (v_calculated->>'deuterium')::numeric,
          'metal_per_hour', (v_calculated->>'metal_per_hour')::numeric,
          'crystal_per_hour', (v_calculated->>'crystal_per_hour')::numeric,
          'deuterium_per_hour', (v_calculated->>'deuterium_per_hour')::numeric,
          'metal_storage', (v_calculated->>'metal_storage')::numeric,
          'crystal_storage', (v_calculated->>'crystal_storage')::numeric,
          'deuterium_storage', (v_calculated->>'deuterium_storage')::numeric,
          'energy_used', (v_calculated->>'energy_used')::numeric,
          'energy_max', (v_calculated->>'energy_max')::numeric,
          'last_update', now()
        );
      END;
      $func$;
    `);
    console.log('✅ calculate_and_sync_resources patched with FOR UPDATE lock!');
  }

  // =============================================
  // STEP 3: Fix calculate_and_sync_resources_internal too
  // =============================================
  console.log('\n=== STEP 3: FIX calculate_and_sync_resources_internal ===');
  
  await client.query(`
    CREATE OR REPLACE FUNCTION calculate_and_sync_resources_internal(p_planet_id uuid, p_user_id uuid)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_planet planets%ROWTYPE;
      v_calculated jsonb;
    BEGIN
      SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = p_user_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Planet not found or not owned');
      END IF;

      -- FIX: Lock planet_resources row BEFORE reading to prevent race condition
      PERFORM 1 FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;

      v_calculated := calculate_planet_resources(p_planet_id);

      IF v_calculated ? 'error' THEN
        RETURN v_calculated;
      END IF;

      UPDATE planet_resources
      SET 
        metal = (v_calculated->>'metal')::numeric,
        crystal = (v_calculated->>'crystal')::numeric,
        deuterium = (v_calculated->>'deuterium')::numeric,
        metal_per_hour = (v_calculated->>'metal_per_hour')::numeric,
        crystal_per_hour = (v_calculated->>'crystal_per_hour')::numeric,
        deuterium_per_hour = (v_calculated->>'deuterium_per_hour')::numeric,
        metal_storage = (v_calculated->>'metal_storage')::numeric,
        crystal_storage = (v_calculated->>'crystal_storage')::numeric,
        deuterium_storage = (v_calculated->>'deuterium_storage')::numeric,
        energy_used = (v_calculated->>'energy_used')::numeric,
        energy_max = (v_calculated->>'energy_max')::numeric,
        last_update = now()
      WHERE planet_id = p_planet_id;

      RETURN v_calculated;
    END;
    $func$;
  `);
  console.log('✅ calculate_and_sync_resources_internal patched with FOR UPDATE lock!');

  // =============================================
  // STEP 4: Verify the fix is applied
  // =============================================
  console.log('\n=== STEP 4: VERIFY FIX ===');
  
  const verifyFunc = await client.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'calculate_and_sync_resources' AND pronargs = 1
    LIMIT 1
  `);
  if (verifyFunc.rows.length > 0) {
    const hasLock = verifyFunc.rows[0].prosrc.includes('FOR UPDATE');
    console.log('calculate_and_sync_resources has FOR UPDATE lock:', hasLock ? '✅ YES' : '❌ NO');
  }
  
  const verifyFunc2 = await client.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'calculate_and_sync_resources_internal'
    LIMIT 1
  `);
  if (verifyFunc2.rows.length > 0) {
    const hasLock = verifyFunc2.rows[0].prosrc.includes('FOR UPDATE');
    console.log('calculate_and_sync_resources_internal has FOR UPDATE lock:', hasLock ? '✅ YES' : '❌ NO');
  }

  // Final resource check
  console.log('\n=== FINAL RESOURCE STATE ===');
  const final = await client.query(`
    SELECT metal, crystal, deuterium, metal_storage, crystal_storage, deuterium_storage
    FROM planet_resources WHERE planet_id = $1
  `, [planetId]);
  console.log(JSON.stringify(final.rows[0], null, 2));
  
  await client.end();
  console.log('\n🎉 ALL DONE! Resources restored + Race condition fixed.');
}

restoreAndFix().catch(err => {
  console.error('ERROR:', err.message);
  client.end();
});
