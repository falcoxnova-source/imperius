const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const fns = ['toggle_autopilot'];
  for (const f of fns) {
    const r = await client.query(`SELECT prosrc FROM pg_proc WHERE proname=$1`, [f]);
    console.log(`\n=== ${f} ===\n${r.rows[0]?.prosrc || '(no existe)'}`);
  }

  // Buscar el WHERE clause en bot_ai_tick que filtra usuarios
  const r2 = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick'`);
  const src = r2.rows[0].prosrc;
  const lines = src.split('\n');
  console.log('\n=== bot_ai_tick: líneas con autopilot o is_bot ===');
  lines.forEach((l, i) => {
    if (/autopilot|is_bot/i.test(l)) console.log(`L${i+1}: ${l.trim()}`);
  });

  await client.end();
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
