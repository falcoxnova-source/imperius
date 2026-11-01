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

  // Get ALL plus subscriptions with referrer info
  const r = await c.query(`
    SELECT ps.user_id, ps.payment_type, ps.amount_paid, ps.created_at,
           p.username, p.referred_by, ref.username as referrer_name, ref.id as referrer_id
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    LEFT JOIN profiles ref ON ref.id = p.referred_by
    ORDER BY ps.created_at DESC
  `);

  console.log('=== ALL PLUS SUBSCRIPTIONS ===\n');
  
  const needFix = [];
  
  for (const row of r.rows) {
    const hasRef = row.referred_by ? `→ ref: ${row.referrer_name}` : '(no referrer)';
    console.log(`${row.created_at} | ${row.username} | ${row.payment_type} ${row.amount_paid} | ${hasRef}`);
    
    if (row.referred_by) {
      // Check if commission was already paid
      const cc = await c.query(`
        SELECT id FROM referral_commissions 
        WHERE referrer_id = $1 AND seller_id = $2 AND commission_type = 'plus_subscription'
      `, [row.referred_by, row.user_id]);
      
      if (cc.rows.length === 0) {
        const amt = parseFloat(row.amount_paid);
        const commission = amt * 0.05;
        needFix.push({
          buyer: row.username,
          buyerId: row.user_id,
          referrer: row.referrer_name,
          referrerId: row.referrer_id,
          paymentType: row.payment_type,
          amountPaid: amt,
          commission: commission,
          date: row.created_at
        });
        console.log(`  ❌ UNPAID commission: ${commission} ${row.payment_type}`);
      } else {
        console.log(`  ✅ Commission already paid`);
      }
    }
  }

  console.log(`\n=== UNPAID COMMISSIONS: ${needFix.length} ===`);
  
  if (needFix.length > 0) {
    console.log('\nFixing all unpaid commissions...\n');
    await c.query('BEGIN');
    
    try {
      for (const fix of needFix) {
        // Credit commission
        const balCol = fix.paymentType === 'usdt' ? 'usdt_balance' : 'fxu_balance';
        const unit = fix.paymentType === 'usdt' ? 'USDT' : 'FXU';
        
        const upd = await c.query(
          `UPDATE profiles SET ${balCol} = COALESCE(${balCol}, 0) + $1 WHERE id = $2 RETURNING ${balCol}`,
          [fix.commission, fix.referrerId]
        );
        console.log(`✅ Credited ${fix.commission} ${unit} to ${fix.referrer} (new balance: ${upd.rows[0][balCol]})`);

        // Record commission
        const amountBigint = Math.floor(fix.commission);
        await c.query(`
          INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
          VALUES ($1, $2, NULL, 'plus_subscription', $3, $4, $5)
        `, [fix.referrerId, fix.buyerId, fix.paymentType, amountBigint, fix.commission]);
        console.log(`  📝 Recorded in referral_commissions`);

        // Send notification
        await c.query(`
          INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
          VALUES ($1, $2, 'Comision de referido por compra Plus', 
                  $3, 'system')
        `, [fix.referrerId, fix.buyerId, 
            `Has recibido ${fix.commission} ${unit} como comision (5%) porque tu referido ${fix.buyer} compro Plus. (Acreditacion retroactiva)`]);
        console.log(`  💬 Notification sent`);
      }
      
      await c.query('COMMIT');
      console.log('\n✅ ALL RETROACTIVE COMMISSIONS PAID');
    } catch (e) {
      await c.query('ROLLBACK');
      console.error('❌ ROLLBACK:', e.message);
    }
  }

  // Final verification
  const verify = await c.query(`
    SELECT rc.*, p.username as referrer_name 
    FROM referral_commissions rc
    JOIN profiles p ON p.id = rc.referrer_id
    WHERE rc.commission_type = 'plus_subscription'
    ORDER BY rc.created_at DESC
  `);
  console.log(`\n=== VERIFIED: ${verify.rows.length} plus_subscription commissions ===`);
  for (const row of verify.rows) {
    console.log(`  ${row.referrer_name} | ${row.resource_type} | amount:${row.amount} | fxu_amount:${row.fxu_amount} | ${row.created_at}`);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
