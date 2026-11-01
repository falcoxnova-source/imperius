const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const insp = await c.query(`
    SELECT id, user_id, side, asset, fiat_currency, available_amount, locked_amount, status, created_at, expires_at
    FROM p2p_offers WHERE status='active' AND available_amount<=0`);
  console.log('Ofertas problemáticas:', insp.rows);

  // Marcarlas como completed (toda la liquidez consumida) y registrar en audit
  const upd = await c.query(`
    UPDATE p2p_offers
       SET status = 'completed', updated_at = now()
     WHERE status='active' AND available_amount<=0
     RETURNING id`);
  console.log('Cerradas como completed:', upd.rowCount);

  for (const r of upd.rows) {
    await c.query(
      `INSERT INTO p2p_audit_log(offer_id, action, meta)
       VALUES ($1, 'offer_autoclosed_zero_available', jsonb_build_object('fixed_by','audit_script'))`,
      [r.id]);
  }

  // Verificar
  const verify = await c.query(`SELECT count(*) FROM p2p_offers WHERE status='active' AND available_amount<=0`);
  console.log('Invariante restante:', verify.rows[0].count);

  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
