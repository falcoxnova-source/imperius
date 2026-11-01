import { Client } from 'pg';
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
await client.connect();

// Verificar que la funcion existe
const fn = await client.query(
  "SELECT routine_name, external_language FROM information_schema.routines WHERE routine_name = 'purchase_market_listing'"
);
console.log('Funcion purchase_market_listing:', fn.rows.length > 0 ? '✅ EXISTE' : '❌ NO EXISTE');

// Estado de las ofertas del mercado
const listings = await client.query(
  'SELECT status, COUNT(*) as total FROM market_listings GROUP BY status ORDER BY status'
);
console.log('\nEstado de market_listings:');
listings.rows.forEach(r => console.log(' ', r.status, ':', r.total));

// Cuantas ofertas activas quedaron (deberian ser las validas)
const active = await client.query(
  "SELECT COUNT(*) as total FROM market_listings WHERE status = 'active'"
);
console.log('\nOfertas activas restantes:', active.rows[0].total);

// Cuantas fueron canceladas hoy
const cancelled_today = await client.query(
  "SELECT COUNT(*) as total FROM market_listings WHERE status = 'cancelled' AND updated_at >= now() - interval '1 hour'"
);
console.log('Ofertas canceladas en la ultima hora (stale cleanup):', cancelled_today.rows[0].total);

await client.end();
