const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const BOT_IDS = `SELECT id FROM profiles WHERE is_bot=true`;

  // 1. Flotas HUMANAS apuntando a planetas de bots
  const humanFleetsToBots = await c.query(`
    SELECT COUNT(*)::int n FROM fleets f
    WHERE f.user_id NOT IN (${BOT_IDS})
      AND f.target_planet_id IN (SELECT id FROM planets WHERE user_id IN (${BOT_IDS}))
  `).catch(e=>{ console.log('target_planet_id no existe'); return {rows:[{n:'?'}]}; });
  console.log('Flotas humanas con target=planeta bot:', humanFleetsToBots.rows[0].n);

  // 2. Participación de bots en tablas bloqueantes (NO ACTION)
  const checks = [
    ['acs_fleets', 'creator_id'],
    ['alliance_diplomacy', 'proposed_by'],
    ['alliance_diplomacy', 'responded_by'],
    ['destruction_ranking_rewards', 'user_id'],
    ['internal_transfers', 'sender_id'],
    ['internal_transfers', 'receiver_id'],
    ['jackpot_history', 'user_id'],
    ['lottery_tickets', 'user_id'],
    ['lottery_winners', 'user_id'],
    ['monthly_ranking_rewards', 'user_id'],
    ['p2p_audit_log', 'actor_id'],
    ['p2p_disputes', 'opened_by'],
    ['p2p_messages', 'sender_id'],
    ['p2p_orders', 'seller_id'],
    ['p2p_orders', 'buyer_id'],
    ['plus_commission_rewards', 'user_id'],
    ['social_ranking_rewards', 'user_id'],
    ['suspicious_accounts', 'reviewed_by'],
  ];
  console.log('\n=== Participación bots en tablas bloqueantes (NO ACTION) ===');
  for (const [t, col] of checks) {
    try {
      const r = await c.query(`SELECT COUNT(*)::int n FROM ${t} WHERE ${col} IN (${BOT_IDS})`);
      if (r.rows[0].n > 0) console.log(`  ⚠ ${t}.${col} = ${r.rows[0].n}`);
    } catch(e) { console.log(`  (${t} no existe)`); }
  }

  // 3. Alianzas donde el líder/fundador es bot
  const aLead = await c.query(`SELECT COUNT(*)::int n FROM alliances WHERE leader_id IN (${BOT_IDS}) OR founder_id IN (${BOT_IDS})`);
  console.log('\nAlianzas con bot como leader/founder:', aLead.rows[0].n);

  // 4. Batle reports donde humanos pelearon contra bots
  const brHuman = await c.query(`
    SELECT COUNT(*)::int n FROM battle_reports
    WHERE (attacker_id IN (${BOT_IDS}) AND defender_id NOT IN (${BOT_IDS}))
       OR (defender_id IN (${BOT_IDS}) AND attacker_id NOT IN (${BOT_IDS}))
  `);
  console.log('Reportes batalla humano<->bot (quedarán con SET NULL, se conservan):', brHuman.rows[0].n);

  // 5. Mensajes humanos recibidos/enviados contra bots
  const msg = await c.query(`SELECT COUNT(*)::int n FROM messages WHERE sender_id IN (${BOT_IDS}) OR recipient_id IN (${BOT_IDS})`);
  console.log('Mensajes con bots:', msg.rows[0].n);

  // 6. Referidos: hay humanos referidos por bots?
  const refByBot = await c.query(`SELECT COUNT(*)::int n FROM profiles WHERE is_bot=false AND referred_by IN (${BOT_IDS})`);
  console.log('Humanos referidos por bots (referred_by pasa a NULL):', refByBot.rows[0].n);

  await c.end();
})();
