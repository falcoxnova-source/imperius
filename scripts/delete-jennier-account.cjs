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

  // 1. Find user
  const user = await c.query("SELECT id, username, email FROM profiles WHERE email = 'jennierfs@gmail.com'");
  if (user.rows.length === 0) {
    console.log('Usuario no encontrado');
    await c.end();
    return;
  }
  const userId = user.rows[0].id;
  console.log(`Eliminando usuario: ${user.rows[0].username} (${user.rows[0].email}) - ID: ${userId}`);

  // 2. Get all planet IDs
  const planets = await c.query('SELECT id, name, galaxy, solar_system, position FROM planets WHERE user_id = $1', [userId]);
  const planetIds = planets.rows.map(p => p.id);
  console.log(`Planetas encontrados: ${planetIds.length}`);
  planets.rows.forEach(p => console.log(`  - ${p.name} [${p.galaxy}:${p.solar_system}:${p.position}]`));

  // 3. Get all fleet IDs
  const fleets = await c.query('SELECT id FROM fleets WHERE user_id = $1', [userId]);
  const fleetIds = fleets.rows.map(f => f.id);
  console.log(`Flotas encontradas: ${fleetIds.length}`);

  // BEGIN TRANSACTION
  await c.query('BEGIN');

  try {
    // ===== FLEET RELATED =====
    if (fleetIds.length > 0) {
      // Fleet ships
      const r1 = await c.query('DELETE FROM fleet_ships WHERE fleet_id = ANY($1)', [fleetIds]);
      console.log(`fleet_ships eliminados: ${r1.rowCount}`);

      // ACS participants for user's fleets
      const r2a = await c.query('DELETE FROM acs_participants WHERE fleet_id = ANY($1)', [fleetIds]);
      const r2b = await c.query('DELETE FROM acs_participants WHERE user_id = $1', [userId]);
      console.log(`acs_participants eliminados: ${r2a.rowCount + r2b.rowCount}`);

      // Fleet restoration log
      const r3a = await c.query('DELETE FROM fleet_restoration_log WHERE fleet_id = ANY($1)', [fleetIds]);
      const r3b = await c.query('DELETE FROM fleet_restoration_log WHERE user_id = $1', [userId]);
      console.log(`fleet_restoration_log eliminados: ${r3a.rowCount + r3b.rowCount}`);

      // Fleets
      const r4 = await c.query('DELETE FROM fleets WHERE user_id = $1', [userId]);
      console.log(`fleets eliminados: ${r4.rowCount}`);
    }

    // ACS fleets created by user
    const r5 = await c.query('DELETE FROM acs_fleets WHERE creator_id = $1', [userId]);
    console.log(`acs_fleets eliminados: ${r5.rowCount}`);

    // ===== PLANET RELATED =====
    if (planetIds.length > 0) {
      // Shipyard queue
      const r6 = await c.query('DELETE FROM shipyard_queue WHERE planet_id = ANY($1)', [planetIds]);
      console.log(`shipyard_queue eliminados: ${r6.rowCount}`);

      // Building queue
      const r7 = await c.query('DELETE FROM building_queue WHERE planet_id = ANY($1)', [planetIds]);
      console.log(`building_queue eliminados: ${r7.rowCount}`);

      // Planet ships
      const r8 = await c.query('DELETE FROM planet_ships WHERE planet_id = ANY($1)', [planetIds]);
      console.log(`planet_ships eliminados: ${r8.rowCount}`);

      // Planet defenses
      const r9 = await c.query('DELETE FROM planet_defenses WHERE planet_id = ANY($1)', [planetIds]);
      console.log(`planet_defenses eliminados: ${r9.rowCount}`);

      // Planet buildings
      const r10 = await c.query('DELETE FROM planet_buildings WHERE planet_id = ANY($1)', [planetIds]);
      console.log(`planet_buildings eliminados: ${r10.rowCount}`);

      // Planet resources
      const r11 = await c.query('DELETE FROM planet_resources WHERE planet_id = ANY($1)', [planetIds]);
      console.log(`planet_resources eliminados: ${r11.rowCount}`);

      // Planets
      const r12 = await c.query('DELETE FROM planets WHERE user_id = $1', [userId]);
      console.log(`planets eliminados: ${r12.rowCount}`);
    }

    // ===== USER DATA =====
    // Research queue
    const r13 = await c.query('DELETE FROM research_queue WHERE user_id = $1', [userId]);
    console.log(`research_queue eliminados: ${r13.rowCount}`);

    // User technologies
    const r14 = await c.query('DELETE FROM user_technologies WHERE user_id = $1', [userId]);
    console.log(`user_technologies eliminados: ${r14.rowCount}`);

    // User officers
    const r15 = await c.query('DELETE FROM user_officers WHERE user_id = $1', [userId]);
    console.log(`user_officers eliminados: ${r15.rowCount}`);

    // Battle reports
    const r16 = await c.query('DELETE FROM battle_reports WHERE attacker_id = $1 OR defender_id = $1', [userId]);
    console.log(`battle_reports eliminados: ${r16.rowCount}`);

    // Attack log
    const r17 = await c.query('DELETE FROM attack_log WHERE attacker_id = $1 OR defender_id = $1', [userId]);
    console.log(`attack_log eliminados: ${r17.rowCount}`);

    // Messages
    const r18 = await c.query('DELETE FROM messages WHERE sender_id = $1 OR recipient_id = $1', [userId]);
    console.log(`messages eliminados: ${r18.rowCount}`);

    // Public chat messages
    const r19 = await c.query('DELETE FROM public_chat_messages WHERE user_id = $1', [userId]);
    console.log(`public_chat_messages eliminados: ${r19.rowCount}`);

    // Market listings
    const r20 = await c.query('DELETE FROM market_listings WHERE seller_id = $1', [userId]);
    console.log(`market_listings eliminados: ${r20.rowCount}`);

    // Market transactions (no borrar, solo nullificar para no romper historial de otros)
    const r21a = await c.query('UPDATE market_transactions SET buyer_id = NULL WHERE buyer_id = $1', [userId]);
    const r21b = await c.query('UPDATE market_transactions SET seller_id = NULL WHERE seller_id = $1', [userId]);
    console.log(`market_transactions actualizados: buyer=${r21a.rowCount}, seller=${r21b.rowCount}`);

    // Wallet transactions
    const r22 = await c.query('DELETE FROM wallet_transactions WHERE user_id = $1', [userId]);
    console.log(`wallet_transactions eliminados: ${r22.rowCount}`);

    // User wallets
    const r23 = await c.query('DELETE FROM user_wallets WHERE user_id = $1', [userId]);
    console.log(`user_wallets eliminados: ${r23.rowCount}`);

    // Alliance members
    const r24 = await c.query('DELETE FROM alliance_members WHERE user_id = $1', [userId]);
    console.log(`alliance_members eliminados: ${r24.rowCount}`);

    // Alliance applications
    const r25 = await c.query('DELETE FROM alliance_applications WHERE user_id = $1', [userId]);
    console.log(`alliance_applications eliminados: ${r25.rowCount}`);

    // Jackpot history
    const r26 = await c.query('DELETE FROM jackpot_history WHERE user_id = $1', [userId]);
    console.log(`jackpot_history eliminados: ${r26.rowCount}`);

    // Plus subscriptions & rewards
    const r27a = await c.query('DELETE FROM plus_commission_rewards WHERE user_id = $1', [userId]);
    console.log(`plus_commission_rewards eliminados: ${r27a.rowCount}`);
    const r27b = await c.query('DELETE FROM plus_subscriptions WHERE user_id = $1', [userId]);
    console.log(`plus_subscriptions eliminados: ${r27b.rowCount}`);

    // Login sessions
    const r28 = await c.query('DELETE FROM login_sessions WHERE user_id = $1', [userId]);
    console.log(`login_sessions eliminados: ${r28.rowCount}`);

    // Email verification tokens
    const r29 = await c.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
    console.log(`email_verification_tokens eliminados: ${r29.rowCount}`);

    // Telegram links
    try {
      await c.query('SAVEPOINT sp_telegram_links');
      const r30 = await c.query('DELETE FROM telegram_links WHERE user_id = $1', [userId]);
      console.log(`telegram_links eliminados: ${r30.rowCount}`);
    } catch(e) { await c.query('ROLLBACK TO SAVEPOINT sp_telegram_links'); console.log('telegram_links: skipped'); }

    // Telegram task rewards
    try {
      await c.query('SAVEPOINT sp_telegram_task_rewards');
      const r31 = await c.query('DELETE FROM telegram_task_rewards WHERE user_id = $1', [userId]);
      console.log(`telegram_task_rewards eliminados: ${r31.rowCount}`);
    } catch(e) { await c.query('ROLLBACK TO SAVEPOINT sp_telegram_task_rewards'); console.log('telegram_task_rewards: skipped'); }

    // Suspicious accounts
    try {
      await c.query('SAVEPOINT sp_suspicious');
      const r32 = await c.query('DELETE FROM suspicious_accounts WHERE user_id = $1 OR linked_user_id = $1', [userId]);
      console.log(`suspicious_accounts eliminados: ${r32.rowCount}`);
    } catch(e) { await c.query('ROLLBACK TO SAVEPOINT sp_suspicious'); console.log('suspicious_accounts: skipped'); }

    // Referral commissions
    try {
      await c.query('SAVEPOINT sp_referral');
      const r33 = await c.query('DELETE FROM referral_commissions WHERE referrer_id = $1 OR seller_id = $1', [userId]);
      console.log(`referral_commissions eliminados: ${r33.rowCount}`);
    } catch(e) { await c.query('ROLLBACK TO SAVEPOINT sp_referral'); console.log('referral_commissions: skipped'); }

    // Internal transfers
    try {
      await c.query('SAVEPOINT sp_internal');
      const r34 = await c.query('DELETE FROM internal_transfers WHERE sender_id = $1 OR receiver_id = $1', [userId]);
      console.log(`internal_transfers eliminados: ${r34.rowCount}`);
    } catch(e) { await c.query('ROLLBACK TO SAVEPOINT sp_internal'); console.log('internal_transfers: skipped'); }

    // ===== AUTO-DETECT: Find ALL remaining FK references to profiles and clean them =====
    const fkQuery = await c.query(`
      SELECT tc.table_name, kcu.column_name, tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'profiles'
        AND ccu.column_name = 'id'
        AND tc.table_schema = 'public'
    `);
    console.log(`\n=== FK REFERENCES TO PROFILES: ${fkQuery.rows.length} ===`);
    
    for (const fk of fkQuery.rows) {
      const tbl = fk.table_name;
      const col = fk.column_name;
      try {
        await c.query(`SAVEPOINT sp_fk_${tbl}_${col}`);
        const r = await c.query(`DELETE FROM "${tbl}" WHERE "${col}" = $1`, [userId]);
        if (r.rowCount > 0) {
          console.log(`  ${tbl}.${col}: ${r.rowCount} eliminados`);
        }
      } catch(e) {
        await c.query(`ROLLBACK TO SAVEPOINT sp_fk_${tbl}_${col}`);
        // Try nullifying instead
        try {
          await c.query(`SAVEPOINT sp_null_${tbl}_${col}`);
          const r2 = await c.query(`UPDATE "${tbl}" SET "${col}" = NULL WHERE "${col}" = $1`, [userId]);
          if (r2.rowCount > 0) {
            console.log(`  ${tbl}.${col}: ${r2.rowCount} nullified`);
          }
        } catch(e2) {
          await c.query(`ROLLBACK TO SAVEPOINT sp_null_${tbl}_${col}`);
          console.log(`  ${tbl}.${col}: skipped (${e.message.substring(0, 50)})`);
        }
      }
    }

    // ===== FINALLY: DELETE PROFILE =====
    const r_final = await c.query('DELETE FROM profiles WHERE id = $1', [userId]);
    console.log(`\n✅ PERFIL ELIMINADO: ${r_final.rowCount}`);

    await c.query('COMMIT');
    console.log('\n🎉 CUENTA ELIMINADA COMPLETAMENTE: jennierfs@gmail.com (Zeratul)');

  } catch (err) {
    await c.query('ROLLBACK');
    console.error('\n❌ ERROR - Se hizo ROLLBACK, nada fue eliminado:', err.message);
    console.error(err);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
