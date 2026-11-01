const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const query = `
    SELECT
      p.id,
      p.username,
      p.email,
      COALESCE(SUM(
        CASE
          WHEN wt.tx_type = 'deposit'
           AND wt.token_type = 'USDT'
           AND wt.status = 'confirmed'
          THEN wt.amount
          ELSE 0
        END
      ), 0) AS usdt_depositado
    FROM profiles p
    LEFT JOIN wallet_transactions wt ON wt.user_id = p.id
    WHERE LOWER(p.username) = LOWER('Diablo')
    GROUP BY p.id, p.username, p.email;
  `;

  const result = await client.query(query);
  console.log(JSON.stringify(result.rows, null, 2));

  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
