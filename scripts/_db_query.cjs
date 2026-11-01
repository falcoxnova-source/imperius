// Helper para lanzar consultas ad-hoc desde el chat contra la BD de Supabase.
// Uso:  node scripts/_db_query.cjs "select 1"
const { Client } = require('pg');

const sql = process.argv.slice(2).join(' ');
if (!sql.trim()) {
  console.error('Falta SQL. Uso: node scripts/_db_query.cjs "select ..."');
  process.exit(1);
}

const c = new Client({
  host: process.env.PGHOST || 'aws-1-eu-north-1.pooler.supabase.com',
  port: Number(process.env.PGPORT || 6543),
  user: process.env.PGUSER || 'postgres.hhrgcnvydmjqcevgmlhj',
  password: process.env.PGPASSWORD || 'Jfs.samsung1989*',
  database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    await c.connect();
    const r = await c.query(sql);
    if (Array.isArray(r)) {
      r.forEach((rs, i) => {
        console.log(`-- result ${i + 1} (${rs.rowCount} rows) --`);
        console.table(rs.rows);
      });
    } else {
      console.log(`rows: ${r.rowCount}`);
      console.table(r.rows);
    }
  } catch (e) {
    console.error('ERR:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
})();
