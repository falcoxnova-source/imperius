const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('=== BOTS ACTUALES ===');
  const bots = await c.query(`SELECT id, username, email, points_total, is_admin, created_at FROM profiles WHERE is_bot=true ORDER BY points_total DESC`);
  console.log('Total bots:', bots.rows.length);
  console.log('Admins dentro de bots:', bots.rows.filter(b=>b.is_admin).length);
  console.log('Top 10:');
  bots.rows.slice(0,10).forEach(b=>console.log(`  ${b.username} pts=${b.points_total} admin=${b.is_admin}`));
  console.log('\nÚltimos 5:');
  bots.rows.slice(-5).forEach(b=>console.log(`  ${b.username} pts=${b.points_total}`));

  // Planets owned by bots
  console.log('\n=== PLANETAS DE BOTS ===');
  const pl = await c.query(`SELECT COUNT(*)::int n FROM planets WHERE user_id IN (SELECT id FROM profiles WHERE is_bot=true)`);
  console.log('Planetas:', pl.rows[0].n);

  // Fleets en vuelo de bots (peligroso: impactarían humanos)
  const fl = await c.query(`SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE returning=false AND arrival_time>now()) pendientes FROM fleets WHERE user_id IN (SELECT id FROM profiles WHERE is_bot=true)`);
  console.log('Flotas bot totales:', fl.rows[0].n, 'en vuelo activas:', fl.rows[0].pendientes);

  // Flotas humanas apuntando a planetas de bots (no deben romperse)
  const flTo = await c.query(`
    SELECT COUNT(*)::int n
    FROM fleets f
    WHERE f.user_id NOT IN (SELECT id FROM profiles WHERE is_bot=true)
      AND f.target_planet_id IN (SELECT id FROM planets WHERE user_id IN (SELECT id FROM profiles WHERE is_bot=true))
      AND f.arrival_time>now() AND f.returning=false
  `);
  console.log('Flotas HUMANAS atacando bots (cuidado, hay que gestionarlas):', flTo.rows[0].n);

  // Alianzas con bots
  const al = await c.query(`SELECT COUNT(*)::int n FROM alliance_members WHERE user_id IN (SELECT id FROM profiles WHERE is_bot=true)`);
  console.log('Miembros de alianza que son bots:', al.rows[0].n);

  // P2P listings/orders bots
  const p2pL = await c.query(`SELECT COUNT(*)::int n FROM p2p_listings WHERE seller_id IN (SELECT id FROM profiles WHERE is_bot=true) OR buyer_id IN (SELECT id FROM profiles WHERE is_bot=true)`).catch(()=>({rows:[{n:'N/A'}]}));
  console.log('P2P listings con bots:', p2pL.rows[0].n);

  // Saldos bots (no importan, son ficticios)
  const bal = await c.query(`SELECT COALESCE(SUM(fxu_balance),0) fxu, COALESCE(SUM(usdt_balance),0) usdt FROM profiles WHERE is_bot=true`);
  console.log('Saldos bots: FXU', bal.rows[0].fxu, ' USDT', bal.rows[0].usdt);

  // Descubrir tablas con FK a profiles
  console.log('\n=== FKs que referencian profiles ===');
  const fks = await c.query(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='profiles'
    ORDER BY tc.table_name
  `);
  fks.rows.forEach(f=>console.log(`  ${f.table_name}.${f.column_name}`));

  await c.end();
})();
