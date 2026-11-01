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

    // Orden completa
    const ord = await c.query(`
      SELECT * FROM p2p_orders WHERE id = $1
    `, [orderId]);
    console.log('\n=== ORDEN COMPLETA ===');
    console.log(JSON.stringify(ord.rows[0], null, 2));

    // Mensajes/chat de la orden
    console.log('\n=== MENSAJES DE LA ORDEN ===');
    const msgs = await c.query(`
      SELECT m.created_at, p.username AS sender, m.message
        FROM p2p_order_messages m
        LEFT JOIN profiles p ON p.id = m.sender_id
       WHERE m.order_id = $1
       ORDER BY m.created_at
    `, [orderId]).catch(e => ({ rows: [], err: e.message }));
    if (msgs.err) console.log('(tabla de chat no disponible:', msgs.err, ')');
    else console.table(msgs.rows);

    // Disputas
    console.log('\n=== DISPUTAS ===');
    const disp = await c.query(`
      SELECT * FROM p2p_disputes WHERE order_id = $1
    `, [orderId]).catch(e => ({ rows: [], err: e.message }));
    if (disp.err) console.log('(sin tabla disputes:', disp.err, ')');
    else console.log(disp.rows);

    // Balance actual de Pokoyo y movimientos recientes
    const pok = await c.query(`SELECT id, username, fxu_balance FROM profiles WHERE username='Pokoyo'`);
    console.log('\n=== PERFIL POKOYO ===', pok.rows[0]);

    // Transacciones FXU recientes de Pokoyo
    const txs = await c.query(`
      SELECT created_at, transaction_type, amount, description
        FROM fxu_transactions
       WHERE user_id = $1
         AND created_at > now() - interval '48 hours'
       ORDER BY created_at DESC
       LIMIT 20
    `, [pok.rows[0].id]).catch(e => ({ rows: [], err: e.message }));
    console.log('\n=== TX FXU POKOYO (48h) ===');
    if (txs.err) console.log(txs.err);
    else console.table(txs.rows);

  } finally { await c.end(); }
})();
