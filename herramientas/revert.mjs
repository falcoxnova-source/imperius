import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
await c.query("UPDATE jackpot_pools SET destruction_balance = 0, destruction_total = 991845 WHERE id = 1");
await c.query("UPDATE jackpot SET balance = balance - 1000, total_contributed = total_contributed - 1000 WHERE id = 1");
await c.query("DELETE FROM jackpot_history WHERE source = 'test_fix'");
console.log('revertido');
await c.end();
