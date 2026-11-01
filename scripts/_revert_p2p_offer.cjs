const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const r = await c.query(`
    UPDATE p2p_offers
       SET status = 'active', updated_at = now()
     WHERE id = '8dae2636-b6a0-4eec-8f29-9cbb496fd732'
       AND status = 'completed'
       AND locked_amount > 0
     RETURNING id, status, available_amount, locked_amount`);
  console.log('Revertida:', r.rows);
  await c.query(
    `INSERT INTO p2p_audit_log(offer_id, action, meta)
     VALUES ($1, 'offer_reverted_to_active', jsonb_build_object('reason','locked_amount>0, legitimate transient state'))`,
    ['8dae2636-b6a0-4eec-8f29-9cbb496fd732']);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
