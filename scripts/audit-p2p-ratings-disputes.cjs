const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  console.log('=== p2p_ratings recientes ===');
  const r = await client.query(`
    SELECT r.id, r.order_id, r.ratee_id, p.username AS ratee, r.rater_id, r.stars, r.created_at
    FROM p2p_ratings r
    LEFT JOIN profiles p ON p.id = r.ratee_id
    ORDER BY r.created_at DESC LIMIT 30;
  `);
  console.table(r.rows.map(x => ({...x, created_at: x.created_at.toISOString()})));

  console.log('\n=== p2p_reputation (top con calificaciones) ===');
  const rep = await client.query(`
    SELECT rep.user_id, p.username, rep.rating_sum, rep.rating_count,
           CASE WHEN rep.rating_count > 0 THEN round((rep.rating_sum::numeric / rep.rating_count)::numeric, 2) ELSE 0 END AS avg_calc,
           rep.total_orders, rep.is_banned
    FROM p2p_reputation rep
    LEFT JOIN profiles p ON p.id = rep.user_id
    WHERE rep.rating_count > 0
    ORDER BY rep.updated_at DESC LIMIT 30;
  `);
  console.table(rep.rows);

  console.log('\n=== Vista usada por el front (p2p_offers_with_reputation o similar) ===');
  const views = await client.query(`
    SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname ILIKE '%p2p%';
  `);
  console.table(views.rows);

  console.log('\n=== p2p_disputes recientes ===');
  const d = await client.query(`
    SELECT d.id, d.order_id, d.opener_id, d.status, d.reason, d.created_at, o.status AS order_status
    FROM p2p_disputes d
    LEFT JOIN p2p_orders o ON o.id = d.order_id
    ORDER BY d.created_at DESC LIMIT 20;
  `).catch(e => ({ error: e.message }));
  if (d.error) console.log('ERROR:', d.error);
  else console.table(d.rows.map(x => ({...x, created_at: x.created_at?.toISOString(), reason: (x.reason||'').slice(0,40)})));

  console.log('\n=== Función p2p_admin_list_disputes ===');
  const fn = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname='p2p_admin_list_disputes';
  `);
  if (fn.rows.length === 0) console.log('NO EXISTE');
  else console.log(fn.rows[0].prosrc.slice(0, 1500));

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
