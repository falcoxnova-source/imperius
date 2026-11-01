const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  // Borrar los NPCs que se crearon mal (profiles + auth.users por email pattern)
  const emails = ['vortex','nebula','phantom','stryker','eclipse','nova','titan','spectra','zenith','pulsar'].map(n => n + '@npc.falcoxnova.com');
  for (const email of emails) {
    const r = await c.query(`SELECT id FROM auth.users WHERE email = $1`, [email]);
    if (r.rows.length > 0) {
      const uid = r.rows[0].id;
      await c.query(`DELETE FROM planet_resources WHERE planet_id IN (SELECT id FROM planets WHERE user_id = $1)`, [uid]);
      await c.query(`DELETE FROM planets WHERE user_id = $1`, [uid]);
      await c.query(`DELETE FROM profiles WHERE id = $1`, [uid]);
      await c.query(`DELETE FROM auth.users WHERE id = $1`, [uid]);
      console.log(`🗑️  Limpiado: ${email}`);
    }
  }
  console.log('✅ Limpieza completa');
  await c.end();
})();
