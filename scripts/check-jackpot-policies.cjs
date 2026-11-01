const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  
  // Check RLS policies
  const policies = await client.query(`
    SELECT tablename, policyname, cmd, permissive 
    FROM pg_policies 
    WHERE tablename = 'jackpot_pools'
  `);
  console.log('Políticas RLS actuales:', policies.rows);
  
  // Check if RLS is enabled
  const rls = await client.query(`
    SELECT relname, relrowsecurity 
    FROM pg_class 
    WHERE relname = 'jackpot_pools'
  `);
  console.log('RLS habilitado:', rls.rows);
  
  await client.end();
}

main().catch(console.error);
