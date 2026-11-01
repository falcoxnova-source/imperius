const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const email = 'frostmannarsel15@gmail.com';
  const username = 'Narsel15';
  const newPassword = '123456';

  const check = await client.query(
    `
    SELECT au.id, au.email, p.username
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE LOWER(au.email) = LOWER($1)
       OR LOWER(p.username) = LOWER($2)
    LIMIT 1
    `,
    [email, username]
  );

  if (check.rows.length === 0) {
    console.log('NO_USER_FOUND');
    await client.end();
    return;
  }

  const user = check.rows[0];

  await client.query(
    `
    UPDATE auth.users
    SET encrypted_password = crypt($1, gen_salt('bf')),
        updated_at = now(),
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = $2
    `,
    [newPassword, user.id]
  );

  console.log(JSON.stringify({
    success: true,
    user_id: user.id,
    email: user.email,
    username: user.username,
    password_set: true
  }, null, 2));

  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
