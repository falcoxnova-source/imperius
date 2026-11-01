const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const PIPI = '50da268b-d729-4f06-b8af-e03aa0437c1f';

  // 1) Perfil completo
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' ORDER BY column_name`);
  console.log('profile cols:', cols.rows.map(r => r.column_name).join(', '));

  const p = await c.query(`SELECT * FROM profiles WHERE id=$1`, [PIPI]);
  console.log('\n=== PERFIL PIPI ===');
  console.log(p.rows[0]);

  // 2) ¿Tabla profile history / updated?
  const histTables = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%profile%' OR table_name ILIKE '%referral%' OR table_name ILIKE '%bonus%' OR table_name ILIKE '%reward%' OR table_name ILIKE '%gift%' OR table_name ILIKE '%promo%' OR table_name ILIKE '%mission%' OR table_name ILIKE '%task%' OR table_name ILIKE '%presale%') ORDER BY table_name`);
  console.log('\n=== tablas candidatas ===');
  for (const r of histTables.rows) console.log(' ', r.table_name);

  // 3) Todo lo que apunte a este user_id
  const refs = await c.query(`
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema='public'
       AND column_name IN ('user_id','from_user_id','to_user_id','referrer_id','referred_id','recipient_id','sender_id','owner_id')
     ORDER BY table_name`);
  let hits = [];
  for (const r of refs.rows) {
    try {
      const q = await c.query(`SELECT COUNT(*)::int AS n FROM public.${r.table_name} WHERE ${r.column_name}=$1`, [PIPI]);
      if (q.rows[0].n > 0) hits.push({ ...r, n: q.rows[0].n });
    } catch (e) { /* skip */ }
  }
  console.log('\n=== Tablas con filas de PIPI ===');
  for (const h of hits) console.log(h);

  // 4) created_at de profile vs primer registro en wallet_transactions con su wallet si existe
  console.log('\n=== PIPI created_at:', p.rows[0].created_at);

  await c.end();
})();
