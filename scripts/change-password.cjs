const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

const EMAIL = 'alfonsolaura446@gmail.com';
const NEW_PASSWORD = '12345678';

async function main() {
  await c.connect();
  
  // 1. Find user
  const findResult = await c.query(
    `SELECT id, email, created_at FROM auth.users WHERE email = $1`,
    [EMAIL]
  );
  
  if (findResult.rows.length === 0) {
    console.log('❌ Usuario no encontrado con email:', EMAIL);
    await c.end();
    return;
  }
  
  console.log('✅ Usuario encontrado:');
  console.table(findResult.rows);
  
  // 2. Update password using bcrypt (pgcrypto)
  const updateResult = await c.query(
    `UPDATE auth.users 
     SET encrypted_password = crypt($1, gen_salt('bf')),
         updated_at = now()
     WHERE email = $2
     RETURNING id, email`,
    [NEW_PASSWORD, EMAIL]
  );
  
  if (updateResult.rows.length > 0) {
    console.log('✅ Contraseña cambiada exitosamente para:', updateResult.rows[0].email);
    console.log('   Nueva contraseña: ' + NEW_PASSWORD);
    console.log('   ⚠️  Dile al usuario que la cambie desde el juego lo antes posible.');
  } else {
    console.log('❌ No se pudo actualizar la contraseña');
  }
  
  await c.end();
}

main().catch(e => {
  console.error('Error:', e.message);
  c.end();
});
