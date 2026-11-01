const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

const names = ['MarinaAR72','LuisKR','Natalia88','CamilaAR77','RubenRD','CarlosKR54','SergioJR','AndresJR','CarlosJR','PabloJR'];

(async()=>{
  await c.connect();
  await c.query('BEGIN');
  try {
    await c.query(`SET LOCAL session_replication_role = 'replica'`);

    // Copiar auth.users.created_at -> profiles.created_at para estos 10 usuarios
    const res = await c.query(`
      UPDATE profiles p
      SET created_at = u.created_at,
          updated_at = u.created_at
      FROM auth.users u
      WHERE p.id = u.id AND p.username = ANY($1::text[])
      RETURNING p.username, p.created_at
    `, [names]);

    // También alinear created_at de planets y recursos
    await c.query(`
      UPDATE planets pl
      SET created_at = u.created_at,
          last_update = now() - interval '2 hours'
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE pl.user_id = p.id AND p.username = ANY($1::text[])
    `, [names]);

    await c.query(`
      UPDATE planet_resources pr
      SET last_update = now() - interval '2 hours'
      FROM planets pl
      JOIN profiles p ON p.id = pl.user_id
      WHERE pr.planet_id = pl.id AND p.username = ANY($1::text[])
    `, [names]);

    await c.query(`
      UPDATE planet_buildings pb
      SET created_at = u.created_at
      FROM planets pl
      JOIN profiles p ON p.id = pl.user_id
      JOIN auth.users u ON u.id = p.id
      WHERE pb.planet_id = pl.id AND p.username = ANY($1::text[])
    `, [names]);

    await c.query(`
      UPDATE planet_ships s
      SET created_at = u.created_at
      FROM planets pl
      JOIN profiles p ON p.id = pl.user_id
      JOIN auth.users u ON u.id = p.id
      WHERE s.planet_id = pl.id AND p.username = ANY($1::text[])
    `, [names]);

    await c.query(`
      UPDATE planet_defenses d
      SET created_at = u.created_at
      FROM planets pl
      JOIN profiles p ON p.id = pl.user_id
      JOIN auth.users u ON u.id = p.id
      WHERE d.planet_id = pl.id AND p.username = ANY($1::text[])
    `, [names]);

    await c.query(`
      UPDATE user_technologies t
      SET created_at = u.created_at
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE t.user_id = p.id AND p.username = ANY($1::text[])
    `, [names]);

    await c.query('COMMIT');

    console.log('✅ Fechas corregidas:');
    res.rows.forEach(r => console.log(`  - ${r.username}: ${r.created_at.toISOString()}`));
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
  await c.end();
})();
