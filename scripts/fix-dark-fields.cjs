// Ajusta las colonias de dark@gmail.com:
// - fields_max aleatorio entre 220 y 500 (planetas grandes)
// - fields_used recalculado según edificios reales (sum de levels)

const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const userRes = await client.query(`SELECT id, username FROM profiles WHERE email='dark@gmail.com'`);
  const userId = userRes.rows[0].id;
  console.log(`✅ Usuario: ${userRes.rows[0].username}\n`);

  const planetsRes = await client.query(
    `SELECT id, name, is_main_planet, fields_max, fields_used
     FROM planets WHERE user_id = $1 AND is_destroyed = false
     ORDER BY is_main_planet DESC, created_at ASC`,
    [userId]
  );

  for (const planet of planetsRes.rows) {
    // Calcular fields_used real = suma de niveles de edificios
    const sumRes = await client.query(
      `SELECT COALESCE(SUM(level),0)::int AS used FROM planet_buildings WHERE planet_id = $1`,
      [planet.id]
    );
    const realUsed = sumRes.rows[0].used;

    // fields_max aleatorio 220-500 solo para colonias; principal se mantiene (o también se sube)
    const newMax = Math.floor(Math.random() * (500 - 220 + 1)) + 220;

    await client.query(
      `UPDATE planets SET fields_max = $1, fields_used = $2 WHERE id = $3`,
      [newMax, realUsed, planet.id]
    );

    const tag = planet.is_main_planet ? '🌍 PRINCIPAL' : '🛰️  colonia  ';
    console.log(`${tag} ${planet.name}`);
    console.log(`   fields_max: ${planet.fields_max} → ${newMax}`);
    console.log(`   fields_used: ${planet.fields_used} → ${realUsed} (real)\n`);
  }

  console.log('='.repeat(60));
  console.log(`✅ ${planetsRes.rows.length} planetas corregidos`);
  console.log('='.repeat(60));

  await client.end();
}

main().catch(async (e) => {
  console.error('❌', e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
