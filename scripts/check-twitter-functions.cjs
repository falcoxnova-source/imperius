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
  
  // 1. Get current functions
  const funcs = [
    'admin_distribute_social_ranking_pool',
    'get_active_twitter_missions',
    'get_twitter_social_ranking',
    'get_twitter_task_status'
  ];
  
  for (const f of funcs) {
    const result = await client.query(`
      SELECT proname, prosrc, pg_get_function_arguments(oid) as args 
      FROM pg_proc WHERE proname = $1
    `, [f]);
    
    console.log(`\n===== ${f} (args: ${result.rows[0]?.args}) =====`);
    console.log(result.rows[0]?.prosrc || 'NOT FOUND');
    console.log('=====\n');
  }

  // 2. Check twitter_social_config columns
  const cols = await client.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'twitter_social_config'
    ORDER BY ordinal_position
  `);
  console.log('\n===== twitter_social_config columns =====');
  console.log(cols.rows);

  await client.end();
}

main().catch(console.error);
