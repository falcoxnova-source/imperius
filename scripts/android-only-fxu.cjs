const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // 1) Poner costos de dark_matter a 0 para android (señal visual)
  await client.query(`
    UPDATE officer_types
    SET dark_matter_cost_7d = 0,
        dark_matter_cost_30d = 0,
        dark_matter_cost_90d = 0
    WHERE code = 'android'
  `);
  console.log('✅ dark_matter_cost_* = 0 para android');

  // 2) Parchar purchase_officer_with_dark_matter para rechazar android
  const fn = await client.query(`
    SELECT prosrc, pg_get_function_identity_arguments(oid) AS args, pg_get_function_result(oid) AS result
    FROM pg_proc WHERE proname='purchase_officer_with_dark_matter'
  `);
  if (fn.rows.length === 0) {
    console.log('⚠️  purchase_officer_with_dark_matter no existe');
  } else {
    let src = fn.rows[0].prosrc;
    const sentinel = 'android_blocked_dm';
    if (src.includes(sentinel)) {
      console.log('ℹ️  Ya estaba parchado');
    } else {
      // Insertar chequeo después del SELECT INTO v_officer
      const anchor = `SELECT * INTO v_officer FROM officer_types WHERE id = p_officer_type_id;`;
      if (!src.includes(anchor)) {
        console.log('⚠️  Ancla no encontrada en purchase_officer_with_dark_matter');
      } else {
        const injection = `${anchor}

  -- ${sentinel}: el Oficial Androide solo se puede pagar con FXU
  IF v_officer.code = 'android' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El Oficial Androide solo se puede pagar con FXU');
  END IF;`;
        src = src.replace(anchor, injection);

        await client.query(`
          CREATE OR REPLACE FUNCTION purchase_officer_with_dark_matter(${fn.rows[0].args})
          RETURNS ${fn.rows[0].result}
          LANGUAGE plpgsql
          SECURITY DEFINER
          SET search_path = public
          AS $FUNC$
${src}
$FUNC$
        `);
        console.log('✅ purchase_officer_with_dark_matter bloquea android');
      }
    }
  }

  // Verificación
  const r = await client.query(`SELECT code, name, fxu_cost_7d, fxu_cost_30d, fxu_cost_90d, dark_matter_cost_7d FROM officer_types WHERE code='android'`);
  console.log('\n🤖 Estado final:', r.rows[0]);

  await client.end();
}

main().catch(async e => { console.error('❌', e.message); try{await client.end();}catch{}; process.exit(1); });
