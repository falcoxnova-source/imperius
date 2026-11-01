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
  
  // Ver estructura de twitter_actions
  const actions = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'twitter_actions'
    ORDER BY ordinal_position
  `);
  console.log('=== twitter_actions ===');
  console.log(actions.rows);
  
  // Ver estructura de user_twitter_completions
  const completions = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'user_twitter_completions'
    ORDER BY ordinal_position
  `);
  console.log('\n=== user_twitter_completions ===');
  console.log(completions.rows);
  
  // Ver las acciones actuales
  const currentActions = await client.query(`
    SELECT id, action_type, tweet_url, points_reward, is_active, created_at
    FROM twitter_actions
    WHERE is_active = true
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log('\n=== Acciones activas (últimas 10) ===');
  currentActions.rows.forEach(a => {
    console.log(`ID: ${a.id}, Tipo: ${a.action_type}, Puntos: ${a.points_reward}, Creada: ${a.created_at}`);
  });
  
  // Ver ranking actual
  const ranking = await client.query(`
    SELECT user_id, total_points, created_at
    FROM user_social_rankings
    ORDER BY total_points DESC
    LIMIT 5
  `);
  console.log('\n=== Top 5 ranking social ===');
  console.log(ranking.rows);
  
  await client.end();
}

main().catch(console.error);
