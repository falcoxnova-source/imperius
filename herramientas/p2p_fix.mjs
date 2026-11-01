import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// 1. Change default to 7 days
await c.query("ALTER TABLE p2p_offers ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days')");
console.log('Default cambiado a 7 dias');

// 2. Extend existing ACTIVE offers to 7 days from now (if they still have less than 7 days remaining)
const r = await c.query(`
  UPDATE p2p_offers
  SET expires_at = now() + interval '7 days',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at < now() + interval '7 days'
  RETURNING id
`);
console.log('Ofertas activas extendidas:', r.rowCount);

// Also extend paused offers
const r2 = await c.query(`
  UPDATE p2p_offers
  SET expires_at = now() + interval '7 days',
      updated_at = now()
  WHERE status = 'paused'
    AND expires_at < now() + interval '7 days'
  RETURNING id
`);
console.log('Ofertas pausadas extendidas:', r2.rowCount);

await c.end();
