const fs = require('fs');
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const sql = fs.readFileSync('supabase/migrations/20260507_secure_profile_columns.sql', 'utf8');
  await c.query(sql);
  console.log('✅ Migración aplicada');
  // Verificar trigger creado
  const t = await c.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='protect_sensitive_profile_columns_trigger'`);
  console.log(t.rows.length ? '✅ Trigger activo' : '❌ Trigger ausente');
  await c.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
