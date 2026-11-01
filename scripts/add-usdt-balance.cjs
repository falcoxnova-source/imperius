const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

const EMAIL = 'bloodfox0014@gmail.com';
const USDT_TO_ADD = 5;

async function main() {
  await c.connect();

  // 1. Find user
  const find = await c.query(
    `SELECT p.id, p.username, p.usdt_balance, a.email
     FROM profiles p
     JOIN auth.users a ON p.id = a.id
     WHERE a.email = $1`,
    [EMAIL]
  );

  if (find.rows.length === 0) {
    console.log('❌ Usuario no encontrado:', EMAIL);
    await c.end();
    return;
  }

  const user = find.rows[0];
  console.log('✅ Usuario encontrado:');
  console.table(find.rows);

  // 2. Add USDT balance
  const update = await c.query(
    `UPDATE profiles
     SET usdt_balance = COALESCE(usdt_balance, 0) + $1
     WHERE id = $2
     RETURNING id, username, usdt_balance`,
    [USDT_TO_ADD, user.id]
  );

  console.log('✅ Saldo actualizado:');
  console.table(update.rows);

  // 3. Send notification message
  await c.query(
    `INSERT INTO messages (recipient_id, subject, body, message_type)
     VALUES ($1, $2, $3, 'system')`,
    [
      user.id,
      'Saldo USDT acreditado',
      `Se han acreditado ${USDT_TO_ADD} USDT a tu cuenta. Tu nuevo saldo es ${update.rows[0].usdt_balance} USDT. ¡Disfruta el juego!`
    ]
  );

  console.log('✅ Notificación enviada al usuario');
  await c.end();
}

main().catch(e => {
  console.error('Error:', e.message);
  c.end();
});
