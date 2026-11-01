const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();

  // ═══════════════════════════════════════════════════════════════
  // TEST 1: get_market_fee_for_user para todos los tiers de ranking
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('TEST 1: get_market_fee_for_user - Verificar TODOS los tiers');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const ranking = await client.query(`
    SELECT p.id, p.username, p.points_total, p.rank_position,
           CASE 
             WHEN EXISTS (
               SELECT 1 FROM plus_subscriptions ps 
               WHERE ps.user_id = p.id AND ps.is_active = true AND ps.expires_at > now()
             ) THEN true ELSE false
           END as is_vip
    FROM profiles p
    WHERE p.rank_position IS NOT NULL AND p.rank_position > 0
    ORDER BY p.rank_position ASC
  `);

  console.log(`Total jugadores con ranking: ${ranking.rows.length}\n`);

  const tierBoundaries = [1, 2, 10, 25, 49, 50, 51, 52, 75, 99, 100, 101, 102, 150, 199, 200, 201, 202, 250, 300];
  const testUsers = [];

  for (const target of tierBoundaries) {
    const user = ranking.rows.find(r => parseInt(r.rank_position) === target);
    if (user) testUsers.push(user);
  }
  if (ranking.rows.length > 0) {
    testUsers.push(ranking.rows[ranking.rows.length - 1]);
  }

  console.log('Rank  | Username           | Points      | VIP  | Expected | Actual | Status');
  console.log('------|--------------------|-----------:|------|----------|--------|-------');

  let allPass = true;
  for (const user of testUsers) {
    const rank = parseInt(user.rank_position);
    const isVip = user.is_vip;
    let expectedFee;
    if (isVip) {
      expectedFee = 7.5;
    } else if (rank <= 50) {
      expectedFee = 10;
    } else if (rank <= 100) {
      expectedFee = 15;
    } else if (rank <= 200) {
      expectedFee = 25;
    } else {
      expectedFee = 30;
    }

    const result = await client.query(`SELECT get_market_fee_for_user($1) as fee`, [user.id]);
    const actualFee = parseFloat(result.rows[0].fee);
    const pass = actualFee === expectedFee;
    if (!pass) allPass = false;
    const status = pass ? '✅' : '❌ BUG';
    const username = (user.username || '???').substring(0, 18).padEnd(18);
    console.log(`#${String(rank).padStart(4)} | ${username} | ${String(user.points_total).padStart(9)} | ${isVip ? 'YES ' : 'NO  '} | ${String(expectedFee).padStart(6)}% | ${String(actualFee).padStart(5)}% | ${status}`);
  }
  console.log(`\nTEST 1: ${allPass ? '✅ TODOS LOS TIERS CORRECTOS' : '❌ HAY ERRORES'}`);

  // ═══════════════════════════════════════════════════════════════
  // TEST 2: is_user_plus
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('TEST 2: is_user_plus - Verificar deteccion VIP');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const plusSubs = await client.query(`
    SELECT ps.user_id, p.username, ps.is_active, ps.expires_at
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    ORDER BY ps.expires_at DESC
    LIMIT 10
  `);

  if (plusSubs.rows.length === 0) {
    console.log('No hay suscripciones Plus en la BD. is_user_plus siempre sera false.');
    const randomUser = ranking.rows[0];
    const isPlus = await client.query(`SELECT is_user_plus($1) as result`, [randomUser.id]);
    console.log(`  ${randomUser.username} (sin suscripcion) -> is_user_plus: ${isPlus.rows[0].result} ${isPlus.rows[0].result === false ? '✅' : '❌'}`);
  } else {
    console.log('User              | Active | Expires At          | Expired? | is_user_plus | OK?');
    console.log('------------------|--------|---------------------|----------|--------------|----');
    for (const sub of plusSubs.rows) {
      const isPlus = await client.query(`SELECT is_user_plus($1) as result`, [sub.user_id]);
      const expired = new Date(sub.expires_at) < new Date();
      const expectedPlus = sub.is_active === true && !expired;
      const actualPlus = isPlus.rows[0].result;
      const ok = expectedPlus === actualPlus ? '✅' : '❌';
      const username = (sub.username || '???').substring(0, 16).padEnd(16);
      const endDate = sub.expires_at ? new Date(sub.expires_at).toISOString().slice(0, 19) : 'NULL';
      console.log(`${username} | ${String(sub.is_active).padEnd(6)} | ${endDate} | ${expired ? 'YES     ' : 'NO      '} | ${String(actualPlus).padEnd(12)} | ${ok}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 3: purchase_market_listing usa fee dinamico
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('TEST 3: purchase_market_listing - Verificar fee dinamico');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const purchaseBody = await client.query(`
    SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'purchase_market_listing'
  `);
  const code = purchaseBody.rows[0].def;

  const checks = [
    { label: 'Llama a get_market_fee_for_user()', test: code.includes('get_market_fee_for_user') },
    { label: 'Usa seller_id para el fee', test: code.includes('get_market_fee_for_user(v_listing.seller_id)') },
    { label: 'Variable v_market_fee_percent existe', test: code.includes('v_market_fee_percent') },
    { label: 'Fee aplicado: v_total_price * (v_market_fee_percent / 100)', test: code.includes('v_market_fee_percent / 100') },
    { label: 'Retorna fee_percent en la respuesta', test: code.includes("'fee_percent'") },
  ];

  let allChecksPass = true;
  for (const check of checks) {
    const ok = check.test ? '✅' : '❌';
    if (!check.test) allChecksPass = false;
    console.log(`  ${ok} ${check.label}`);
  }
  console.log(`\nTEST 3: ${allChecksPass ? '✅ PURCHASE USA FEE DINAMICO CORRECTAMENTE' : '❌ HAY PROBLEMAS'}`);

  // ═══════════════════════════════════════════════════════════════
  // TEST 4: Edge cases
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('TEST 4: Edge cases');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const nullRankUsers = await client.query(`
    SELECT id, username FROM profiles WHERE rank_position IS NULL LIMIT 2
  `);
  for (const u of nullRankUsers.rows) {
    const result = await client.query(`SELECT get_market_fee_for_user($1) as fee`, [u.id]);
    const fee = parseFloat(result.rows[0].fee);
    console.log(`  ${(u.username || 'NULL').padEnd(18)} (rank NULL) -> fee: ${fee}% ${fee === 30 ? '✅ (Resto=30%)' : '❌ deberia ser 30%'}`);
  }

  try {
    const result = await client.query(`SELECT get_market_fee_for_user('00000000-0000-0000-0000-000000000000') as fee`);
    const fee = parseFloat(result.rows[0].fee);
    console.log(`  UUID inexistente             -> fee: ${fee}% ${fee === 30 ? '✅ (Resto=30%)' : '❌'}`);
  } catch (e) {
    console.log(`  UUID inexistente -> ERROR: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 5: Ultimas transacciones
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('TEST 5: Ultimas transacciones del market');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const recentTx = await client.query(`
    SELECT mt.id, mt.buyer_id, mt.seller_id, mt.total_price, mt.quantity, mt.item_code,
           mt.created_at,
           pb.username as buyer_name, ps.username as seller_name,
           ps.rank_position as seller_rank
    FROM market_transactions mt
    JOIN profiles pb ON pb.id = mt.buyer_id
    JOIN profiles ps ON ps.id = mt.seller_id
    ORDER BY mt.created_at DESC
    LIMIT 5
  `);

  if (recentTx.rows.length === 0) {
    console.log('No hay transacciones recientes.');
  } else {
    for (const tx of recentTx.rows) {
      const sellerFee = await client.query(`SELECT get_market_fee_for_user($1) as fee`, [tx.seller_id]);
      const fee = parseFloat(sellerFee.rows[0].fee);
      const feeAmount = (tx.total_price * fee / 100).toFixed(2);
      const sellerReceives = (tx.total_price * (1 - fee / 100)).toFixed(2);
      console.log(`  TX ${tx.id.substring(0, 8)}... | ${new Date(tx.created_at).toISOString().slice(0, 16)}`);
      console.log(`    Comprador: ${tx.buyer_name} -> Vendedor: ${tx.seller_name} (Rank #${tx.seller_rank})`);
      console.log(`    Item: ${tx.quantity}x ${tx.item_code} | Total: ${tx.total_price} FXU`);
      console.log(`    Fee del vendedor: ${fee}% -> Comision: ${feeAmount} FXU -> Recibe: ${sellerReceives} FXU`);
      console.log('');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RESUMEN
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('RESUMEN FINAL');
  console.log('═══════════════════════════════════════════════════════════════');

  const tierCounts = await client.query(`
    SELECT 
      COUNT(*) FILTER (WHERE rank_position <= 50) as top_50,
      COUNT(*) FILTER (WHERE rank_position > 50 AND rank_position <= 100) as top_100,
      COUNT(*) FILTER (WHERE rank_position > 100 AND rank_position <= 200) as top_200,
      COUNT(*) FILTER (WHERE rank_position > 200) as rest,
      COUNT(*) as total
    FROM profiles
    WHERE rank_position IS NOT NULL AND rank_position > 0
  `);
  const tc = tierCounts.rows[0];
  console.log(`\n  Jugadores por tier:`);
  console.log(`    Top 50  (10% fee): ${tc.top_50} jugadores`);
  console.log(`    Top 100 (15% fee): ${tc.top_100} jugadores`);
  console.log(`    Top 200 (25% fee): ${tc.top_200} jugadores`);
  console.log(`    Resto   (30% fee): ${tc.rest} jugadores`);
  console.log(`    Total con ranking: ${tc.total}`);

  await client.end();
  console.log('\n✅ Tests completados');
})().catch(e => { console.error(e); process.exit(1); });
