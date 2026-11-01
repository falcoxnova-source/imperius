// Implementa el Oficial Androide (autopiloto comprable) con precios editables desde Admin
const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log('🤖 Implementando Oficial Androide...\n');

  // 1) Insertar officer_type 'android' si no existe
  const existing = await client.query(`SELECT id FROM officer_types WHERE code='android'`);
  if (existing.rows.length === 0) {
    await client.query(`
      INSERT INTO officer_types (
        code, name, description,
        bonus_type, bonus_value,
        dark_matter_cost_7d, dark_matter_cost_30d, dark_matter_cost_90d,
        fxu_cost_7d, fxu_cost_30d, fxu_cost_90d,
        icon, sort_order
      ) VALUES (
        'android',
        'Androide IA',
        'Activa el Piloto Automatico: gestiona construccion, investigacion, flotas, ataques, defensas y fleet save 24/7 mientras no estas. Se pausa 5 minutos cuando juegas manualmente.',
        'autopilot',
        1,
        10000, 25000, 60000,
        15000, 40000, 100000,
        'bot',
        6
      )
    `);
    console.log('✅ officer_types: fila "android" creada (precios iniciales, editables desde Admin)');
  } else {
    console.log('ℹ️  officer_types: "android" ya existe → se mantienen precios actuales');
  }

  // 2) Helper: saber si un usuario tiene acceso al autopiloto
  await client.query(`
    CREATE OR REPLACE FUNCTION has_autopilot_access(p_user_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT
        COALESCE(
          (SELECT autopilot_eligible FROM profiles WHERE id = p_user_id),
          false
        )
        OR EXISTS (
          SELECT 1
          FROM user_officers uo
          JOIN officer_types ot ON ot.id = uo.officer_type_id
          WHERE uo.user_id = p_user_id
            AND ot.code = 'android'
            AND uo.expires_at > now()
        );
    $$;
  `);
  await client.query(`GRANT EXECUTE ON FUNCTION has_autopilot_access(uuid) TO authenticated, anon, service_role`);
  console.log('✅ has_autopilot_access(uuid) creada');

  // 3) Reescribir toggle_autopilot para usar el helper
  await client.query(`
    CREATE OR REPLACE FUNCTION toggle_autopilot(p_enable boolean)
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      IF NOT has_autopilot_access(auth.uid()) THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Necesitas el Oficial Androide activo o ser habilitado por el admin'
        );
      END IF;

      UPDATE profiles SET autopilot_active = p_enable WHERE id = auth.uid();

      RETURN json_build_object('success', true, 'active', p_enable);
    END;
    $$;
  `);
  console.log('✅ toggle_autopilot actualizado');

  // 4) Parchar bot_ai_tick: cambiar el WHERE para aceptar usuarios con Androide activo
  const fn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  let src = fn.rows[0].prosrc;

  const oldWhere = `WHERE (is_bot = true OR (autopilot_active = true AND autopilot_eligible = true AND (last_manual_action IS NULL OR last_manual_action < NOW() - INTERVAL '5 minutes')))`;
  const newWhere = `WHERE (is_bot = true OR (autopilot_active = true AND has_autopilot_access(id) AND (last_manual_action IS NULL OR last_manual_action < NOW() - INTERVAL '5 minutes')))`;

  if (!src.includes(oldWhere)) {
    console.log('⚠️  Patrón WHERE antiguo no encontrado en bot_ai_tick. Revisar manualmente.');
  } else {
    src = src.replace(oldWhere, newWhere);
    const sig = await client.query(`
      SELECT pg_get_function_identity_arguments(oid) AS args,
             pg_get_function_result(oid) AS result
      FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION bot_ai_tick(${sig.rows[0].args})
      RETURNS ${sig.rows[0].result}
      LANGUAGE plpgsql
      AS $FUNC$
${src}
$FUNC$
    `);
    console.log('✅ bot_ai_tick parchado (ahora acepta usuarios con Androide activo)');
  }

  // 5) Reutilizar purchase_officer_with_fxu y purchase_officer_with_dark_matter: ya funcionan sin cambios
  //    porque leen fxu_cost_* / dark_matter_cost_* del officer_types.
  //    El admin puede editar precios desde AdminPage (gestor de tabla officer_types).

  // 6) Test rápido
  const t = await client.query(`SELECT bot_ai_tick()`);
  console.log('\nTick de verificación:', JSON.stringify(t.rows[0].bot_ai_tick));

  const ot = await client.query(`
    SELECT code, name, fxu_cost_7d, fxu_cost_30d, fxu_cost_90d,
           dark_matter_cost_7d, dark_matter_cost_30d, dark_matter_cost_90d
    FROM officer_types WHERE code='android'
  `);
  console.log('\n🤖 Androide en DB:', ot.rows[0]);

  await client.end();
  console.log('\n🎉 Listo. Desde Admin → Tablas → officer_types puedes editar los 6 precios.');
}

main().catch(async e => { console.error('❌', e.message); try{await client.end();}catch{}; process.exit(1); });
