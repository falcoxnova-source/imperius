const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();
  await c.query('BEGIN');

  const bloodfoxId = '127ef5ad-19ac-491c-9247-d1e8387b2817';
  const criptobearId = 'cb5c1019-227a-454c-b43b-f098c6526a74';
  const commissionAmount = 0.50; // 5% of 10 USDT

  try {
    // 1. Credit 0.50 USDT to bloodfox
    const updateRes = await c.query(
      `UPDATE profiles SET usdt_balance = COALESCE(usdt_balance, 0) + $1 WHERE id = $2 RETURNING usdt_balance`,
      [commissionAmount, bloodfoxId]
    );
    console.log(`✅ Credited ${commissionAmount} USDT to bloodfox. New USDT balance: ${updateRes.rows[0].usdt_balance}`);

    // 2. Record in referral_commissions
    await c.query(`
      INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
      VALUES ($1, $2, NULL, 'plus_subscription', 'usdt', $3, $4)
    `, [bloodfoxId, criptobearId, Math.floor(commissionAmount), commissionAmount]);
    console.log('✅ Recorded in referral_commissions');

    // 3. Send notification message
    await c.query(`
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES ($1, $2, 'Comision de referido por compra Plus', 
              'Has recibido 0.50 USDT como comision porque tu referido compro Plus VIP Mensual. (Acreditacion manual retroactiva)', 
              'system')
    `, [bloodfoxId, criptobearId]);
    console.log('✅ Sent notification message');

    await c.query('COMMIT');
    console.log('\n✅ ALL DONE - Transaction committed');

    // Verify
    const verify = await c.query(
      `SELECT usdt_balance FROM profiles WHERE id = $1`, [bloodfoxId]
    );
    console.log(`\nBloodfox USDT balance now: ${verify.rows[0].usdt_balance}`);

    const commVerify = await c.query(
      `SELECT * FROM referral_commissions WHERE commission_type = 'plus_subscription' AND referrer_id = $1`,
      [bloodfoxId]
    );
    console.log(`Plus commissions for bloodfox: ${commVerify.rows.length}`);

  } catch (e) {
    await c.query('ROLLBACK');
    console.error('❌ ERROR - Rolled back:', e.message);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
