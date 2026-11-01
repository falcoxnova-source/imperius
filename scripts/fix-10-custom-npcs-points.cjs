const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

const targets = [
  ['MarinaAR72', 235000],
  ['LuisKR', 201630],
  ['Natalia88', 187000],
  ['CamilaAR77', 171006],
  ['RubenRD', 153080],
  ['CarlosKR54', 147068],
  ['SergioJR', 132762],
  ['AndresJR', 121136],
  ['CarlosJR', 101369],
  ['PabloJR', 97541]
];

function splitPoints(total) {
  const b = Math.floor(total * 0.34);
  const r = Math.floor(total * 0.20);
  const f = Math.floor(total * 0.36);
  const d = total - b - r - f;
  return { b, r, f, d };
}

(async()=>{
  await client.connect();
  await client.query('BEGIN');
  try {
    const usernames = targets.map(x => x[0]);

    const users = await client.query(
      `SELECT id, username FROM profiles WHERE username = ANY($1::text[])`,
      [usernames]
    );

    if (users.rowCount !== 10) {
      throw new Error(`Se encontraron ${users.rowCount} perfiles de 10 esperados`);
    }

    const byName = new Map(users.rows.map(r => [r.username, r.id]));

    for (const [username, total] of targets) {
      const id = byName.get(username);
      const p = splitPoints(total);
      await client.query(
        `UPDATE profiles
         SET points_total = $2,
             points_buildings = $3,
             points_research = $4,
             points_fleet = $5,
             points_defense = $6,
             updated_at = now()
         WHERE id = $1`,
        [id, total, p.b, p.r, p.f, p.d]
      );
    }

    await client.query(
      `DELETE FROM points_update_queue
       WHERE user_id = ANY($1::uuid[])`,
      [users.rows.map(r => r.id)]
    );

    await client.query('COMMIT');

    const check = await client.query(
      `SELECT username, points_total
       FROM profiles
       WHERE username = ANY($1::text[])
       ORDER BY points_total DESC`,
      [usernames]
    );

    console.log('Puntos ajustados:');
    check.rows.forEach(r => console.log(`- ${r.username}: ${r.points_total}`));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
})();
