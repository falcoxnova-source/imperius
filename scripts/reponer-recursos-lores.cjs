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

  const userId = 'a77c7689-a422-4a7f-8c86-0395c7dcaa2f'; // Lores
  const planet4Id = 'c3504490-cfba-46aa-a584-f6891caa51b0'; // Lores 4

  // Resources from fleet 618ff5de (Lores 5 -> Lores 4)
  const addMetal = 2521763;
  const addCrystal = 349175;
  const addDeuterium = 2476707;

  await c.query('BEGIN');

  const before = await c.query(
    `SELECT metal, crystal, deuterium FROM planet_resources WHERE planet_id = $1 FOR UPDATE`,
    [planet4Id]
  );

  if (!before.rows.length) {
    throw new Error('planet_resources not found for Lores 4');
  }

  const upd = await c.query(
    `UPDATE planet_resources
     SET metal = metal + $2,
         crystal = crystal + $3,
         deuterium = deuterium + $4
     WHERE planet_id = $1
     RETURNING metal, crystal, deuterium`,
    [planet4Id, addMetal, addCrystal, addDeuterium]
  );

  // optional notification
  const admin = await c.query(`SELECT id FROM profiles WHERE is_admin = true LIMIT 1`);
  if (admin.rows.length) {
    await c.query(
      `INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
       VALUES ($1, $2, $3, $4, 'system')`,
      [
        userId,
        admin.rows[0].id,
        'Compensación de recursos aplicada',
        `Se aplicó compensación manual por incidencia de transporte a Lores 4: +${addMetal} metal, +${addCrystal} cristal, +${addDeuterium} deuterio.`,
      ]
    );
  }

  await c.query('COMMIT');

  console.log('Before:', before.rows[0]);
  console.log('After :', upd.rows[0]);
  console.log('Compensación aplicada correctamente.');

  await c.end();
}

main().catch(async (e) => {
  try { await c.query('ROLLBACK'); } catch {}
  console.error(e);
  process.exit(1);
});
