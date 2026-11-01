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

  const r = await c.query(
    `SELECT p.id, p.name, p.galaxy, p.solar_system, p.position, p.fields_max, p.fields_used, p.diameter, pr.username
     FROM planets p
     JOIN profiles pr ON pr.id = p.user_id
     JOIN auth.users a ON a.id = p.user_id
     WHERE LOWER(a.email) = LOWER($1)
       AND p.galaxy = 2 AND p.solar_system = 78 AND p.position = 1`,
    ['zero.iluminatti@gmail.com']
  );

  if (r.rows.length === 0) {
    console.log('❌ Planeta no encontrado');
    await c.end();
    return;
  }

  const p = r.rows[0];
  console.log('🌍 Planeta:', p.name, `[${p.galaxy}:${p.solar_system}:${p.position}]`);
  console.log('👤 Usuario:', p.username);
  console.log('📐 Campos actuales:', p.fields_used, '/', p.fields_max);

  await c.query('UPDATE planets SET fields_max = 163 WHERE id = $1', [p.id]);

  const v = await c.query('SELECT fields_max FROM planets WHERE id = $1', [p.id]);
  console.log('✅ Campos actualizados:', p.fields_used, '/', v.rows[0].fields_max);

  await c.end();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
