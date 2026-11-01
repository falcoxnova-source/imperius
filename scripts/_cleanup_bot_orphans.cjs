const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Lista completa de tablas con FK a profiles (con DELETE CASCADE en declaración).
  // Como rompimos la cadena, barremos user_id / *_id huérfanos en cada una.
  // OJO: las SET NULL hay que *ponerlas a NULL*, no borrarlas (battle_reports, messages.sender_id, market_transactions, admin_*, referral_commissions, alliances).
  const tablesCascade = [
    ['account_interaction_log','from_user_id'],
    ['account_interaction_log','to_user_id'],
    ['acs_participants','user_id'],
    ['ai_planet_custom_orders','user_id'],
    ['alliance_applications','user_id'],
    ['alliance_members','user_id'],
    ['attack_log','defender_id'],
    ['attack_log','attacker_id'],
    ['fleets','user_id'],
    ['login_sessions','user_id'],
    ['market_buy_offers','buyer_id'],
    ['market_listings','seller_id'],
    ['messages','recipient_id'], // CASCADE
    ['multiaccounting_reports','suspected_linked_user_id'],
    ['multiaccounting_reports','reporter_id'],
    ['multiaccounting_reports','reported_user_id'],
    ['p2p_offers','user_id'],
    ['p2p_ratings','rater_id'],
    ['p2p_ratings','ratee_id'],
    ['p2p_reputation','user_id'],
    ['p2p_user_payment_methods','user_id'],
    ['planets','user_id'],
    ['plus_pending_rewards','user_id'],
    ['plus_subscriptions','user_id'],
    ['points_update_queue','user_id'],
    ['research_queue','user_id'],
    ['supply_box_purchases','user_id'],
    ['suspicious_accounts','linked_user_id'],
    ['suspicious_accounts','user_id'],
    ['telegram_links','user_id'],
    ['telegram_task_rewards','user_id'],
    ['twitter_actions','user_id'],
    ['twitter_links','user_id'],
    ['user_technologies','user_id'],
    ['user_wallets','user_id'],
    ['wallet_transactions','user_id'],
  ];

  const tablesSetNull = [
    ['admin_expenses','related_user_id'],
    ['admin_revenue','related_user_id'],
    ['admin_speed_settings','updated_by'],
    ['admin_account_deletions','deleted_by'],
    ['alliance_applications','reviewed_by'],
    ['alliances','founder_id'],
    ['alliances','leader_id'],
    ['battle_reports','defender_id'],
    ['battle_reports','attacker_id'],
    ['market_transactions','buyer_id'],
    ['market_transactions','seller_id'],
    ['messages','sender_id'],
    ['profiles','referred_by'],
    ['referral_commissions','referrer_id'],
    ['referral_commissions','seller_id'],
  ];

  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL session_replication_role = 'replica'`); // skip triggers+FK
    console.log('>>> BEGIN limpieza de huérfanos (triggers OFF)');

    let total = 0;
    for (const [t, col] of tablesCascade) {
      await c.query('SAVEPOINT sp');
      try {
        const r = await c.query(`DELETE FROM ${t} WHERE ${col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = ${t}.${col})`);
        if (r.rowCount>0) { console.log(`  - ${t}.${col}: ${r.rowCount} borrados`); total += r.rowCount; }
        await c.query('RELEASE SAVEPOINT sp');
      } catch(e) { await c.query('ROLLBACK TO SAVEPOINT sp'); console.log(`  (${t} saltado: ${e.message.split('\n')[0]})`); }
    }

    for (const [t, col] of tablesSetNull) {
      await c.query('SAVEPOINT sp');
      try {
        const r = await c.query(`UPDATE ${t} SET ${col}=NULL WHERE ${col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = ${t}.${col})`);
        if (r.rowCount>0) { console.log(`  ~ ${t}.${col}: ${r.rowCount} puestos a NULL`); total += r.rowCount; }
        await c.query('RELEASE SAVEPOINT sp');
      } catch(e) { await c.query('ROLLBACK TO SAVEPOINT sp'); console.log(`  (${t} saltado: ${e.message.split('\n')[0]})`); }
    }

    // NO ACTION: si hay huérfanos aquí, borramos (no deberían, por la auditoría previa)
    const noActionTables = [
      ['acs_fleets','creator_id'],
      ['alliance_diplomacy','proposed_by'],
      ['alliance_diplomacy','responded_by'],
      ['destruction_ranking_rewards','user_id'],
      ['internal_transfers','sender_id'],
      ['internal_transfers','receiver_id'],
      ['jackpot_history','user_id'],
      ['lottery_tickets','user_id'],
      ['lottery_winners','user_id'],
      ['monthly_ranking_rewards','user_id'],
      ['p2p_audit_log','actor_id'],
      ['p2p_disputes','opened_by'],
      ['p2p_messages','sender_id'],
      ['p2p_orders','seller_id'],
      ['p2p_orders','buyer_id'],
      ['plus_commission_rewards','user_id'],
      ['social_ranking_rewards','user_id'],
    ];
    for (const [t, col] of noActionTables) {
      try {
        const r = await c.query(`SELECT COUNT(*)::int n FROM ${t} WHERE ${col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = ${t}.${col})`);
        if (r.rows[0].n>0) console.log(`  ⚠ ${t}.${col}: ${r.rows[0].n} huérfanos (NO ACTION — revisar manualmente)`);
      } catch(e) {}
    }

    // Final verification
    const check = await c.query(`
      SELECT
        (SELECT COUNT(*)::int FROM planets WHERE user_id NOT IN (SELECT id FROM profiles)) pl_huerfanos,
        (SELECT COUNT(*)::int FROM fleets WHERE user_id NOT IN (SELECT id FROM profiles)) fl_huerfanas,
        (SELECT COUNT(*)::int FROM profiles WHERE is_bot=true) bots,
        (SELECT COUNT(*)::int FROM profiles WHERE is_bot=false) humanos
    `);
    console.log('\nPost-limpieza:', check.rows[0]);
    console.log(`Total filas afectadas: ${total}`);

    if (check.rows[0].humanos !== 1365) throw new Error('Humanos cambió de 1365. Rollback.');
    if (check.rows[0].pl_huerfanos !== 0 || check.rows[0].fl_huerfanas !== 0) {
      console.log('⚠ Aún quedan huérfanos. Rollback por seguridad.');
      throw new Error('Quedan huérfanos, investigando.');
    }

    await c.query('COMMIT');
    console.log('>>> COMMIT. Todo limpio.');
  } catch(e) {
    await c.query('ROLLBACK');
    console.error('ROLLBACK:', e.message);
    process.exitCode=1;
  } finally {
    await c.end();
  }
})();
