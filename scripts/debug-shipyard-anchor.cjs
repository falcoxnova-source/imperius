const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_shipyard_queue' AND pronamespace='public'::regnamespace");
  const src = r.rows[0]?.prosrc || '';
  
  // Find END IF; near line 165
  const lines = src.split('\n');
  console.log('=== Lines 145-175 with char codes ===');
  for (let i = 144; i < Math.min(175, lines.length); i++) {
    const line = lines[i];
    const escaped = line.replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    const charCodes = [...line].map(c => c.charCodeAt(0));
    console.log(`L${i+1}: [${escaped}] chars=[${charCodes.join(',')}]`);
  }
  
  // Also show the exact text around the END IF we need
  const endIfIndex = src.indexOf('END IF;', src.indexOf('v_game_speed'));
  if (endIfIndex >= 0) {
    const before = src.substring(Math.max(0, endIfIndex - 100), endIfIndex);
    const after = src.substring(endIfIndex, endIfIndex + 50);
    console.log('\n=== Context around END IF after v_game_speed ===');
    console.log('BEFORE:', JSON.stringify(before));
    console.log('AFTER:', JSON.stringify(after));
  }
  
  // Try to find the pattern we need
  const patterns = [
    '/ v_game_speed\n));\nEND IF;',
    '/ v_game_speed\r\n));\r\nEND IF;',
    '/v_game_speed\n));\nEND IF;',
    '/ v_game_speed \n));\nEND IF;',
  ];
  for (const p of patterns) {
    if (src.includes(p)) {
      console.log(`\nFOUND pattern: ${JSON.stringify(p)}`);
    }
  }
  
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
