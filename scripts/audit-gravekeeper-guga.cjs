const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  const accounts = [
    { name: 'gravekeeper', id: '6516fcdc-95f9-47db-8479-eef6a7d09898' },
    { name: 'Guga73', id: 'b0c0fb80-8d95-4451-a21b-a87d4649a79b' }
  ];

  for (const acct of accounts) {
    console.log('\n' + '='.repeat(80));
    console.log(`🔍 AUDITORÍA COMPLETA: ${acct.name} (${acct.id})`);
    console.log('='.repeat(80));

    // 1. Perfil del usuario
    const profile = await c.query(`SELECT * FROM profiles WHERE id = $1`, [acct.id]);
    if (profile.rows.length > 0) {
      const p = profile.rows[0];
      console.log('\n📋 PERFIL:');
      console.log(`  Username: ${p.username}`);
      console.log(`  Email: ${p.email}`);
      console.log(`  USDT Balance: ${p.usdt_balance}`);
      console.log(`  Created: ${p.created_at}`);
      console.log(`  Role: ${p.role}`);
      console.log(`  Referral Code: ${p.referral_code || 'N/A'}`);
      console.log(`  Referred By: ${p.referred_by || 'N/A'}`);
    }

    // 2. Planetas del usuario
    const planets = await c.query(`SELECT id, name, galaxy, solar_system, position, planet_type FROM planets WHERE user_id = $1 ORDER BY galaxy, solar_system, position`, [acct.id]);
    console.log(`\n🌍 PLANETAS (${planets.rows.length}):`);
    planets.rows.forEach(p => {
      console.log(`  ${p.name} [${p.galaxy}:${p.solar_system}:${p.position}] (${p.planet_type})`);
    });

    // 3. Recursos actuales en todos los planetas
    const resources = await c.query(`
      SELECT pr.*, p.name as planet_name, p.galaxy, p.solar_system, p.position 
      FROM planet_resources pr 
      JOIN planets p ON p.id = pr.planet_id 
      WHERE p.user_id = $1
    `, [acct.id]);
    console.log(`\n💎 RECURSOS ACTUALES:`);
    resources.rows.forEach(r => {
      console.log(`  ${r.planet_name} [${r.galaxy}:${r.solar_system}:${r.position}]:`);
      console.log(`    Metal: ${Number(r.metal || 0).toLocaleString()} | Crystal: ${Number(r.crystal || 0).toLocaleString()} | Deuterium: ${Number(r.deuterium || 0).toLocaleString()}`);
      console.log(`    Prod/h → Metal: ${Number(r.metal_per_hour||0).toLocaleString()} | Crystal: ${Number(r.crystal_per_hour||0).toLocaleString()} | Deut: ${Number(r.deuterium_per_hour||0).toLocaleString()}`);
    });

    // Total produccion crystal por hora
    const totalCrystalPerHour = resources.rows.reduce((s,r) => s + Number(r.crystal_per_hour||0), 0);
    const totalCrystalPerDay = totalCrystalPerHour * 24;
    console.log(`\n  📈 Producción crystal total: ${totalCrystalPerHour.toLocaleString()}/hora = ${totalCrystalPerDay.toLocaleString()}/día`);

    // 4. Minas de crystal
    const buildings = await c.query(`
      SELECT pb.*, p.name as planet_name, bt.name as building_name
      FROM planet_buildings pb
      JOIN planets p ON p.id = pb.planet_id
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE p.user_id = $1
        AND LOWER(bt.name) LIKE '%crystal%'
      ORDER BY p.name
    `, [acct.id]);
    console.log(`\n⛏️ MINAS DE CRYSTAL:`);
    buildings.rows.forEach(b => {
      console.log(`  ${b.planet_name}: ${b.building_name} nivel ${b.level}`);
    });

    // 5. Tecnologías
    const techs = await c.query(`
      SELECT ut.level, tt.name 
      FROM user_technologies ut 
      JOIN technology_types tt ON tt.id = ut.technology_type_id
      WHERE ut.user_id = $1
      ORDER BY tt.name
    `, [acct.id]);
    console.log(`\n🔬 TECNOLOGÍAS:`);
    techs.rows.forEach(t => {
      console.log(`  ${t.name}: nivel ${t.level}`);
    });

    // 6. VENTAS en el mercado (últimos 7 días)
    const sales = await c.query(`
      SELECT 
        mt.quantity, mt.total_price, mt.created_at, mt.item_code,
        buyer.username as buyer_name
      FROM market_transactions mt
      LEFT JOIN profiles buyer ON buyer.id = mt.buyer_id
      WHERE mt.seller_id = $1
        AND mt.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY mt.created_at DESC
    `, [acct.id]);
    console.log(`\n📤 VENTAS EN MERCADO (últimos 7 días): ${sales.rows.length} transacciones`);
    let totalSoldCrystal = 0, totalUSDTFromSales = 0;
    sales.rows.forEach((s, i) => {
      const qty = Number(s.quantity);
      const price = Number(s.total_price);
      if (s.item_code === 'crystal') { totalSoldCrystal += qty; totalUSDTFromSales += price; }
      console.log(`  ${i+1}. ${s.item_code} ${qty.toLocaleString()} → ${s.buyer_name} | ${price} USDT | ${s.created_at}`);
    });

    // 7. COMPRAS en el mercado (últimos 7 días)
    const purchases = await c.query(`
      SELECT 
        mt.quantity, mt.total_price, mt.created_at, mt.item_code,
        seller.username as seller_name
      FROM market_transactions mt
      LEFT JOIN profiles seller ON seller.id = mt.seller_id
      WHERE mt.buyer_id = $1
        AND mt.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY mt.created_at DESC
    `, [acct.id]);
    console.log(`\n📥 COMPRAS EN MERCADO (últimos 7 días): ${purchases.rows.length} transacciones`);
    let totalBoughtCrystal = 0;
    purchases.rows.forEach((s, i) => {
      const qty = Number(s.quantity);
      if (s.item_code === 'crystal') totalBoughtCrystal += qty;
      console.log(`  ${i+1}. ${s.item_code} ${qty.toLocaleString()} de ${s.seller_name} | ${Number(s.total_price)} USDT | ${s.created_at}`);
    });

    // 8. Listings en mercado
    const listings = await c.query(`
      SELECT * FROM market_listings 
      WHERE seller_id = $1 
      ORDER BY created_at DESC LIMIT 20
    `, [acct.id]);
    console.log(`\n🏪 LISTINGS EN MERCADO (últimos 20):`);
    listings.rows.forEach((l, i) => {
      console.log(`  ${i+1}. ${l.item_code} | Qty: ${Number(l.quantity).toLocaleString()} | Precio/u: ${l.price_per_unit} | Status: ${l.status} | ${l.created_at}`);
    });

    // 9. Wallet transactions
    const wallet = await c.query(`
      SELECT * FROM wallet_transactions 
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
    `, [acct.id]);
    console.log(`\n💰 TRANSACCIONES WALLET (últimos 7 días): ${wallet.rows.length}`);
    wallet.rows.forEach((w, i) => {
      console.log(`  ${i+1}. Tipo: ${w.type} | Monto: ${w.amount} | Balance: ${w.balance_after || 'N/A'} | ${w.description || ''} | ${w.created_at}`);
    });

    // 10. Flotas enviadas/recibidas
    const fleets = await c.query(`
      SELECT f.*, 
        src.username as src_user,
        tgt_p.name as tgt_planet_name
      FROM fleets f
      LEFT JOIN profiles src ON src.id = f.user_id
      LEFT JOIN planets tgt_p ON (tgt_p.galaxy = f.target_galaxy AND tgt_p.solar_system = f.target_system AND tgt_p.position = f.target_position)
      WHERE f.user_id = $1
        AND f.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY f.created_at DESC
      LIMIT 30
    `, [acct.id]);
    console.log(`\n🚀 FLOTAS ENVIADAS (últimos 7 días): ${fleets.rows.length}`);
    fleets.rows.forEach((f, i) => {
      console.log(`  ${i+1}. Misión: ${f.mission_type} | Destino: [${f.target_galaxy}:${f.target_system}:${f.target_position}] | Crystal carga: ${Number(f.cargo_crystal || 0).toLocaleString()} | Completed: ${f.is_completed} | ${f.created_at}`);
    });

    // Flotas recibidas (transportes de otros hacia este usuario)
    const planetIds = planets.rows.map(p => p.id);
    if (planetIds.length > 0) {
      const fleetsReceived = await c.query(`
        SELECT f.*, sender.username as sender_name
        FROM fleets f
        JOIN profiles sender ON sender.id = f.user_id
        JOIN planets target_p ON (target_p.galaxy = f.target_galaxy AND target_p.solar_system = f.target_system AND target_p.position = f.target_position)
        WHERE target_p.user_id = $1
          AND f.user_id != $1
          AND f.mission_type IN ('transport', 'deploy')
          AND f.created_at >= NOW() - INTERVAL '7 days'
        ORDER BY f.created_at DESC
      `, [acct.id]);
      console.log(`\n📦 TRANSPORTES RECIBIDOS (últimos 7 días): ${fleetsReceived.rows.length}`);
      fleetsReceived.rows.forEach((f, i) => {
        console.log(`  ${i+1}. De: ${f.sender_name} | Crystal: ${Number(f.cargo_crystal||0).toLocaleString()} | Metal: ${Number(f.cargo_metal||0).toLocaleString()} | Deut: ${Number(f.cargo_deuterium||0).toLocaleString()} | ${f.created_at}`);
      });
    }

    // 11. Reportes de batalla
    const battles = await c.query(`
      SELECT br.*, 
        att.username as attacker_name, 
        def.username as defender_name
      FROM battle_reports br
      LEFT JOIN profiles att ON att.id = br.attacker_id
      LEFT JOIN profiles def ON def.id = br.defender_id
      WHERE (br.attacker_id = $1 OR br.defender_id = $1)
        AND br.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY br.created_at DESC LIMIT 20
    `, [acct.id]);
    console.log(`\n⚔️ BATALLAS (últimos 7 días): ${battles.rows.length}`);
    let totalLootCrystal = 0;
    battles.rows.forEach((b, i) => {
      const isAttacker = b.attacker_id === acct.id;
      const lootC = Number(b.loot_crystal || 0);
      if (isAttacker) totalLootCrystal += lootC;
      console.log(`  ${i+1}. ${isAttacker ? '⚔️ Atacó a' : '🛡️ Defendió de'} ${isAttacker ? b.defender_name : b.attacker_name} | Coords: ${b.coordinates} | Resultado: ${b.result} | Loot crystal: ${lootC.toLocaleString()} | ${b.created_at}`);
    });

    // 12. Sesiones
    const sessions = await c.query(`
      SELECT ip_address, user_agent, fingerprint, country_code, created_at
      FROM login_sessions 
      WHERE user_id = $1 
      ORDER BY created_at DESC LIMIT 15
    `, [acct.id]);
    console.log(`\n🔐 ÚLTIMAS SESIONES:`);
    sessions.rows.forEach((s, i) => {
      console.log(`  ${i+1}. IP: ${s.ip_address || 'N/A'} | País: ${s.country_code || 'N/A'} | FP: ${s.fingerprint || 'N/A'} | ${s.created_at}`);
    });

    // 13. ANÁLISIS DE VIABILIDAD
    console.log('\n' + '-'.repeat(60));
    console.log('📊 ANÁLISIS DE ORIGEN DEL CRYSTAL:');
    console.log(`  Crystal vendido (7d): ${totalSoldCrystal.toLocaleString()}`);
    console.log(`  USDT ganado por ventas crystal: ${totalUSDTFromSales.toFixed(2)}`);
    console.log(`  Crystal comprado (7d): ${totalBoughtCrystal.toLocaleString()}`);
    console.log(`  Crystal saqueado en batallas (7d): ${totalLootCrystal.toLocaleString()}`);
    console.log(`  Crystal en planetas ahora: ${resources.rows.reduce((sum, r) => sum + Number(r.crystal || 0), 0).toLocaleString()}`);
    console.log(`  Producción crystal/día: ${totalCrystalPerDay.toLocaleString()}`);
    console.log(`  Producción crystal/7días: ${(totalCrystalPerDay * 7).toLocaleString()}`);
    
    const produced7d = totalCrystalPerDay * 7;
    const currentCrystal = resources.rows.reduce((sum, r) => sum + Number(r.crystal || 0), 0);
    const totalAccountedFor = produced7d + totalBoughtCrystal + totalLootCrystal;
    const totalOutput = totalSoldCrystal + currentCrystal;
    
    console.log(`\n  🧮 BALANCE:`);
    console.log(`    Entradas estimadas (prod+compras+saqueo): ${totalAccountedFor.toLocaleString()}`);
    console.log(`    Salidas (vendido+en mano): ${totalOutput.toLocaleString()}`);
    
    if (totalSoldCrystal > totalAccountedFor * 1.2) {
      console.log(`\n  ⚠️ ALERTA: Vendió más crystal del que pudo producir/obtener legítimamente!`);
      console.log(`    Diferencia inexplicada: ${(totalSoldCrystal - totalAccountedFor).toLocaleString()} crystal`);
    } else {
      console.log(`\n  ✅ El crystal vendido es consistente con la producción y obtención del jugador`);
    }
  }

  // 14. Comparar IPs entre las 3 cuentas
  console.log('\n' + '='.repeat(80));
  console.log('🔍 COMPARACIÓN DE IPs ENTRE CUENTAS (gravekeeper, Guga73, MAIKOL)');
  console.log('='.repeat(80));
  
  const maikolId = '9fa72d04-58e4-4297-bcc3-11b136b42493';
  const allAccounts = [...accounts, { name: 'MAIKOL', id: maikolId }];
  const ipSets = {};
  
  for (const acct of allAccounts) {
    const ips = await c.query(`SELECT DISTINCT ip_address, fingerprint FROM login_sessions WHERE user_id = $1`, [acct.id]);
    ipSets[acct.name] = {
      ips: new Set(ips.rows.map(r => r.ip_address).filter(Boolean)),
      fps: new Set(ips.rows.map(r => r.fingerprint).filter(Boolean))
    };
    console.log(`\n  ${acct.name} IPs: ${[...ipSets[acct.name].ips].join(', ')}`);
    console.log(`  ${acct.name} Fingerprints: ${[...ipSets[acct.name].fps].join(', ')}`);
  }
  
  // Comparar cada par
  const pairs = [['gravekeeper','Guga73'],['gravekeeper','MAIKOL'],['Guga73','MAIKOL']];
  console.log('\n  --- Comparación de IPs ---');
  for (const [a, b] of pairs) {
    const sharedIPs = [...ipSets[a].ips].filter(ip => ipSets[b].ips.has(ip));
    const sharedFPs = [...ipSets[a].fps].filter(fp => ipSets[b].fps.has(fp));
    if (sharedIPs.length > 0) {
      console.log(`  ⚠️ ${a} ↔ ${b} COMPARTEN IPs: ${sharedIPs.join(', ')}`);
    } else {
      console.log(`  ✅ ${a} ↔ ${b} NO comparten IPs`);
    }
    if (sharedFPs.length > 0) {
      console.log(`  ⚠️ ${a} ↔ ${b} COMPARTEN Fingerprints: ${sharedFPs.join(', ')}`);
    }
  }

  await c.end();
})();
