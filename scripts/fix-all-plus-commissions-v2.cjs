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

  // Get all Plus subscriptions with referrers that haven't been paid
  const r = await c.query(`
    SELECT ps.user_id, ps.payment_type, ps.amount_paid, ps.created_at,
           p.username, p.referred_by, ref.username as referrer_name, ref.id as referrer_id
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    JOIN profiles ref ON ref.id = p.referred_by
    WHERE p.referred_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM referral_commissions rc
        WHERE rc.referrer_id = p.referred_by 
          AND rc.seller_id = ps.user_id 
          AND rc.commission_type = 'plus_subscription'
      )
    ORDER BY ps.created_at DESC
  `);

  console.log(`Found ${r.rows.length} unpaid Plus referral commissions:\n`);
  for (const row of r.rows) {
    const amt = parseFloat(row.amount_paid);
    const comm = amt * 0.05;
    const unit = row.payment_type === 'usdt' ? 'USDT' : 'FXU';
    console.log(`  ${row.username} → ${row.referrer_name} | ${row.payment_type} ${amt} | commission: ${comm} ${unit}`);
  }

  if (r.rows.length === 0) {
    console.log('Nothing to fix!');
    await c.end();
    return;
  }

  console.log('\nApplying fixes...\n');
  await c.query('BEGIN');

  // Enable FXU balance bypass for this transaction
  await c.query("SET LOCAL fxu.allow_update_9x7k2m = 'true'");

  try {
    for (const row of r.rows) {
      const amt = parseFloat(row.amount_paid);
      const commission = amt * 0.05;
      const balCol = row.payment_type === 'usdt' ? 'usdt_balance' : 'fxu_balance';
      const unit = row.payment_type === 'usdt' ? 'USDT' : 'FXU';

      // 1. Credit commission to referrer
      const upd = await c.query(
        `UPDATE profiles SET ${balCol} = COALESCE(${balCol}, 0) + $1 WHERE id = $2 RETURNING username, ${balCol}`,
        [commission, row.referrer_id]
      );
      console.log(`✅ +${commission} ${unit} → ${upd.rows[0].username} (balance: ${upd.rows[0][balCol]})`);

      // 2. Record in referral_commissions
      await c.query(`
        INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
        VALUES ($1, $2, NULL, 'plus_subscription', $3, $4, $5)
      `, [row.referrer_id, row.user_id, row.payment_type, Math.floor(commission), commission]);
      console.log(`   📝 Recorded commission`);

      // 3. Send notification
      await c.query(`
        INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
        VALUES ($1, $2, 'Comision de referido por compra Plus',
                $3, 'system')
      `, [row.referrer_id, row.user_id,
          `Has recibido ${commission} ${unit} como comision (5%) porque tu referido ${row.username} compro Plus. (Acreditacion retroactiva)`]);
      console.log(`   💬 Notification sent\n`);
    }

    await c.query('COMMIT');
    console.log('✅ ALL COMMITTED SUCCESSFULLY\n');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('❌ ROLLBACK:', e.message);
    await c.end();
    return;
  }

  // Final verification
  const verify = await c.query(`
    SELECT rc.referrer_id, rc.seller_id, rc.resource_type, rc.amount, rc.fxu_amount, rc.created_at,
           p.username as referrer_name, s.username as buyer_name
    FROM referral_commissions rc
    JOIN profiles p ON p.id = rc.referrer_id
    JOIN profiles s ON s.id = rc.seller_id
    WHERE rc.commission_type = 'plus_subscription'
    ORDER BY rc.created_at DESC
  `);
  console.log(`=== ALL plus_subscription commissions (${verify.rows.length} total) ===`);
  for (const row of verify.rows) {
    console.log(`  ${row.buyer_name} → ${row.referrer_name} | ${row.resource_type} | amt:${row.amount} fxu_amt:${row.fxu_amount} | ${row.created_at}`);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
