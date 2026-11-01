const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function apply() {
  await client.connect();
  console.log('✅ Conectado\n');

  // 1. Add columns
  console.log('1. Agregando columnas a profiles...');
  await client.query(`
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS autopilot_eligible BOOLEAN DEFAULT false;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS autopilot_active BOOLEAN DEFAULT false;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_manual_action TIMESTAMPTZ DEFAULT NULL;
  `);
  console.log('   ✅ Columnas agregadas');

  // 2. Index
  console.log('2. Creando index...');
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_profiles_autopilot_active 
    ON profiles (autopilot_active) WHERE autopilot_active = true;
  `);
  console.log('   ✅ Index creado');

  // 3. Admin RPC
  console.log('3. Creando RPC admin_toggle_autopilot_eligible...');
  await client.query(`
    CREATE OR REPLACE FUNCTION admin_toggle_autopilot_eligible(p_user_id UUID, p_eligible BOOLEAN)
    RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_admin BOOLEAN;
    BEGIN
      SELECT is_admin INTO v_admin FROM profiles WHERE id = auth.uid();
      IF NOT COALESCE(v_admin, false) THEN
        RETURN json_build_object('success', false, 'error', 'No autorizado');
      END IF;
      UPDATE profiles 
      SET autopilot_eligible = p_eligible,
          autopilot_active = CASE WHEN p_eligible = false THEN false ELSE autopilot_active END
      WHERE id = p_user_id;
      RETURN json_build_object('success', true);
    END;
    $fn$;
  `);
  console.log('   ✅ RPC admin creada');

  // 4. Player toggle RPC
  console.log('4. Creando RPC toggle_autopilot...');
  await client.query(`
    CREATE OR REPLACE FUNCTION toggle_autopilot(p_enable BOOLEAN)
    RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_eligible BOOLEAN;
    BEGIN
      SELECT autopilot_eligible INTO v_eligible FROM profiles WHERE id = auth.uid();
      IF NOT COALESCE(v_eligible, false) THEN
        RETURN json_build_object('success', false, 'error', 'Piloto automatico no disponible');
      END IF;
      UPDATE profiles SET autopilot_active = p_enable WHERE id = auth.uid();
      RETURN json_build_object('success', true, 'active', p_enable);
    END;
    $fn$;
  `);
  console.log('   ✅ RPC player creada');

  // 5. Manual action tracker
  console.log('5. Creando RPC update_last_manual_action...');
  await client.query(`
    CREATE OR REPLACE FUNCTION update_last_manual_action()
    RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    BEGIN
      UPDATE profiles SET last_manual_action = NOW() WHERE id = auth.uid();
    END;
    $fn$;
  `);
  console.log('   ✅ RPC manual action creada');

  // 6. Patch bot_ai_tick
  console.log('6. Parcheando bot_ai_tick...');
  const funcResult = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'bot_ai_tick'");
  
  if (funcResult.rows.length === 0) {
    console.log('   ⚠️ bot_ai_tick no encontrada, saltando parche');
  } else {
    let src = funcResult.rows[0].prosrc;
    
    const oldWhere = 'WHERE is_bot = true';
    const newWhere = `WHERE (is_bot = true OR (autopilot_active = true AND autopilot_eligible = true AND (last_manual_action IS NULL OR last_manual_action < NOW() - INTERVAL '5 minutes')))`;
    
    // Only patch the FIRST occurrence (the cursor query), not the target filtering ones
    const firstIdx = src.indexOf(oldWhere);
    if (firstIdx === -1) {
      if (src.includes('autopilot_active')) {
        console.log('   ℹ️ Ya está parcheada');
      } else {
        console.log('   ⚠️ Pattern no encontrado');
      }
    } else {
      // Replace only the first occurrence
      src = src.substring(0, firstIdx) + newWhere + src.substring(firstIdx + oldWhere.length);
      
      // Recreate function
      await client.query(`
        CREATE OR REPLACE FUNCTION bot_ai_tick() 
        RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER 
        AS $func$${src}$func$;
      `);
      console.log('   ✅ bot_ai_tick parcheada');
    }
  }

  // 7. Grant permissions
  console.log('7. Configurando permisos...');
  await client.query(`
    GRANT EXECUTE ON FUNCTION admin_toggle_autopilot_eligible(UUID, BOOLEAN) TO authenticated;
    GRANT EXECUTE ON FUNCTION toggle_autopilot(BOOLEAN) TO authenticated;
    GRANT EXECUTE ON FUNCTION update_last_manual_action() TO authenticated;
  `);
  console.log('   ✅ Permisos configurados');

  // 8. Verify
  console.log('\n=== VERIFICACIÓN ===');
  const cols = await client.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name LIKE 'autopilot%' OR column_name = 'last_manual_action'
    ORDER BY column_name
  `);
  console.table(cols.rows);

  const funcs = await client.query(`
    SELECT proname FROM pg_proc 
    WHERE proname IN ('admin_toggle_autopilot_eligible', 'toggle_autopilot', 'update_last_manual_action')
  `);
  console.log('Funciones creadas:', funcs.rows.map(r => r.proname));

  // Verify bot_ai_tick patched
  const patched = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'bot_ai_tick'");
  const hasPatch = patched.rows[0]?.prosrc?.includes('autopilot_active');
  console.log('bot_ai_tick parcheada:', hasPatch ? '✅' : '❌');

  await client.end();
  console.log('\n✅ Migración autopilot completada');
}

apply().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
