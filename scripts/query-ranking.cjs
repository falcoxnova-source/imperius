const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. Ranking completo
  const r = await c.query('SELECT username, points_total, is_bot, is_admin FROM profiles ORDER BY COALESCE(points_total,0) DESC');
  console.log('TOTAL:', r.rows.length, '| Bots:', r.rows.filter(p=>p.is_bot).length, '| Reales:', r.rows.filter(p=>!p.is_bot).length);
  console.log('\n=== RANKING COMPLETO ===');
  r.rows.forEach((p, i) => {
    console.log(`#${i+1} ${p.username}: ${p.points_total || 0}${p.is_bot ? ' [BOT]' : ''}${p.is_admin ? ' [ADM]' : ''}`);
  });

  // 2. Galaxias
  const g = await c.query(`SELECT galaxy, COUNT(*) as cnt FROM planets WHERE planet_type='planet' AND NOT is_destroyed GROUP BY galaxy ORDER BY galaxy`);
  console.log('\n=== GALAXIAS ===');
  g.rows.forEach(r => console.log(`  G${r.galaxy}: ${r.cnt} planetas`));

  // 3. Noob protection function definition
  const np = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'check_noob_protection'`);
  if (np.rows.length > 0) {
    console.log('\n=== NOOB PROTECTION (primeras 30 lineas) ===');
    const lines = np.rows[0].prosrc.split('\n').slice(0, 30);
    lines.forEach(l => console.log(l));
  }

  // 4. Game speed
  const gs = await c.query(`SELECT * FROM get_game_speed()`).catch(() => null);
  if (gs) console.log('\nGame speed:', gs.rows[0]);

  // 5. Auth users count
  const au = await c.query(`SELECT COUNT(*) FROM auth.users`).catch(() => null);
  if (au) console.log('Auth users:', au.rows[0].count);

  await c.end();
}
main().catch(console.error);
