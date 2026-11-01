const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  try {
    const orderId = 'e7df0e50-9bd0-4507-ae57-516282df6c10';
    const pokId = 'c849d80a-dbd9-47de-b844-f5c34fe99801';

    console.log('\n=== AUDIT LOG de la orden ===');
    const audit = await c.query(`
      SELECT al.*, p.username AS actor
        FROM p2p_audit_log al
        LEFT JOIN profiles p ON p.id = al.user_id
       WHERE al.order_id = $1
       ORDER BY al.created_at
    `, [orderId]).catch(e => ({ err: e.message }));
    if (audit.err) {
      // ver columnas
      const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='p2p_audit_log'`);
      console.log('cols:', cols.rows.map(r => r.column_name).join(','));
    } else {
      console.log(JSON.stringify(audit.rows, null, 2));
    }

    console.log('\n=== MENSAJES P2P de la orden ===');
    const msgs = await c.query(`
      SELECT m.created_at, p.username AS sender, m.*
        FROM p2p_messages m
        LEFT JOIN profiles p ON p.id = m.sender_id
       WHERE m.order_id = $1
       ORDER BY m.created_at
    `, [orderId]).catch(async e => {
      const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='p2p_messages'`);
      console.log('cols:', cols.rows.map(r => r.column_name).join(','));
      return { err: e.message };
    });
    if (msgs.err) console.log(msgs.err);
    else console.log(JSON.stringify(msgs.rows, null, 2));

    console.log('\n=== REPUTATION de Pokoyo ===');
    const rep = await c.query(`SELECT * FROM p2p_reputation WHERE user_id=$1`, [pokId]);
    console.log(rep.rows);
  } finally { await c.end(); }
})();
