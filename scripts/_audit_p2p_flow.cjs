const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });

(async () => {
  await c.connect();

  const sep = (t) => console.log('\n===== ' + t + ' =====');

  sep('RPCs P2P requeridas por el cliente');
  const rpcs = [
    'p2p_expire_stale_offers',
    'p2p_create_offer',
    'p2p_accept_offer',
    'p2p_cancel_offer',
    'p2p_mark_paid',
    'p2p_release_order',
    'p2p_expire_order',
    'p2p_open_dispute',
    'p2p_send_message',
    'p2p_admin_resolve_dispute',
    'get_p2p_reputations_for_users',
  ];
  for (const fn of rpcs) {
    const r = await c.query(
      `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname=$1`, [fn]);
    if (r.rowCount === 0) console.log(`❌ FALTA: ${fn}`);
    else r.rows.forEach(row => console.log(`✅ ${row.proname}(${row.args})`));
  }

  sep('Triggers p2p_orders');
  const trig = await c.query(`
    SELECT tgname, pg_get_triggerdef(oid) AS def
    FROM pg_trigger
    WHERE tgrelid = 'p2p_orders'::regclass AND NOT tgisinternal
    ORDER BY tgname`);
  trig.rows.forEach(r => console.log(`- ${r.tgname}`));

  sep('Tablas clave: existencia');
  for (const t of ['p2p_offers','p2p_orders','p2p_messages','p2p_disputes','p2p_reputation','p2p_ratings','p2p_payment_methods','p2p_audit_log']) {
    const r = await c.query(`SELECT to_regclass($1) AS t`, ['public.' + t]);
    console.log((r.rows[0].t ? '✅ ' : '❌ ') + t);
  }

  sep('Columnas sensibles de p2p_offers');
  const cols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='p2p_offers' AND column_name IN ('expires_at','available_amount','locked_amount','status','side')
    ORDER BY column_name`);
  cols.rows.forEach(r => console.log(`- ${r.column_name} (${r.data_type})`));

  sep('Columnas sensibles de p2p_orders');
  const cols2 = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='p2p_orders' AND column_name IN ('paid_at','payment_deadline','fee_asset','fee_percent','status','cancellation_reason')
    ORDER BY column_name`);
  cols2.rows.forEach(r => console.log(`- ${r.column_name} (${r.data_type})`));

  sep('p2p_reputation columnas');
  const cols3 = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='p2p_reputation' ORDER BY column_name`);
  console.log(cols3.rows.map(r => r.column_name).join(', '));

  sep('game_settings P2P');
  const s = await c.query(`SELECT key, value FROM game_settings WHERE key LIKE 'p2p%' ORDER BY key`);
  s.rows.forEach(r => console.log(`- ${r.key} = ${r.value}`));

  sep('p2p_payment_methods habilitados');
  const pm = await c.query(`SELECT count(*) FILTER (WHERE is_enabled) AS enabled, count(*) AS total FROM p2p_payment_methods`);
  console.log(`enabled=${pm.rows[0].enabled} / total=${pm.rows[0].total}`);

  sep('Estado actual del mercado');
  const off = await c.query(`SELECT status, count(*) FROM p2p_offers GROUP BY status`);
  off.rows.forEach(r => console.log(`offers.${r.status}=${r.count}`));
  const ord = await c.query(`SELECT status, count(*) FROM p2p_orders GROUP BY status`);
  ord.rows.forEach(r => console.log(`orders.${r.status}=${r.count}`));

  sep('Chequeo de invariantes');
  // 1) Ninguna oferta activa con available_amount <= 0 Y locked_amount <= 0
  //    (available=0 con locked>0 es estado transitorio legítimo: toda la liquidez está en escrow)
  const bad1 = await c.query(`SELECT count(*) FROM p2p_offers WHERE status='active' AND available_amount<=0 AND locked_amount<=0`);
  console.log(`ofertas active sin liquidez ni escrow: ${bad1.rows[0].count} ${bad1.rows[0].count=='0'?'✅':'⚠️'}`);
  // 2) Orden paid sin paid_at
  const bad2 = await c.query(`SELECT count(*) FROM p2p_orders WHERE status='paid' AND paid_at IS NULL`);
  console.log(`orders paid sin paid_at: ${bad2.rows[0].count} ${bad2.rows[0].count=='0'?'✅':'⚠️'}`);
  // 3) Orden released sin released_at
  const bad3 = await c.query(`SELECT count(*) FROM p2p_orders WHERE status='released' AND released_at IS NULL`);
  console.log(`orders released sin released_at: ${bad3.rows[0].count} ${bad3.rows[0].count=='0'?'✅':'⚠️'}`);
  // 4) Orden con asset_amount <= 0
  const bad4 = await c.query(`SELECT count(*) FROM p2p_orders WHERE asset_amount<=0`);
  console.log(`orders con asset_amount<=0: ${bad4.rows[0].count} ${bad4.rows[0].count=='0'?'✅':'⚠️'}`);
  // 5) Orden con fee_asset > asset_amount
  const bad5 = await c.query(`SELECT count(*) FROM p2p_orders WHERE COALESCE(fee_asset,0) > asset_amount`);
  console.log(`orders con fee > amount: ${bad5.rows[0].count} ${bad5.rows[0].count=='0'?'✅':'⚠️'}`);

  sep('Test RPC público get_p2p_reputations_for_users');
  const rr = await c.query(`SELECT * FROM get_p2p_reputations_for_users(ARRAY[]::uuid[])`);
  console.log(`cols: ${rr.fields.map(f=>f.name).join(', ')}`);

  await c.end();
  console.log('\n✅ Audit OK');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
