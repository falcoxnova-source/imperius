const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  await c.connect();
  const { rows } = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'admin_distribute_destruction_pool'`);
  const body = rows[0].prosrc;

  // Check for actual UPDATE statement with counted_for_ranking (ignoring comments)
  const codeLines = body.split('\n').filter(l => !l.trim().startsWith('--'));
  const hasBugInCode = codeLines.some(l => l.toLowerCase().includes('counted_for_ranking') && l.toLowerCase().includes('update'));
  console.log('Bug UPDATE counted_for_ranking en codigo activo:', hasBugInCode ? '❌ SÍ (PROBLEMA)' : '✅ NO (ELIMINADO)');

  // Show the end of the function to confirm
  const lastPart = body.substring(body.length - 500);
  console.log('\n--- Últimas líneas de la función ---');
  console.log(lastPart);

  await c.end();
}

main().catch(e => console.error(e));
