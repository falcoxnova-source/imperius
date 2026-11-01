import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Check current balance
const before = await c.query("SELECT destruction_balance, destruction_total FROM jackpot_pools WHERE id = 1");
console.log('Antes:', JSON.stringify(before.rows[0]));

// Add 40,000 FXU
await c.query("UPDATE jackpot_pools SET destruction_balance = destruction_balance + 40000, destruction_total = destruction_total + 40000, updated_at = now() WHERE id = 1");

const after = await c.query("SELECT destruction_balance, destruction_total FROM jackpot_pools WHERE id = 1");
console.log('Despues:', JSON.stringify(after.rows[0]));

await c.end();
