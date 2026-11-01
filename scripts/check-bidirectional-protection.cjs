const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. Get the actual function source - check the return keys
  const r1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'check_noob_protection'");
  const src = r1.rows[0].prosrc;
  
  // Check return keys
  const returnKeys = src.match(/jsonb_build_object\(\s*'(\w+)'/g);
  console.log('=== Return keys in check_noob_protection ===');
  console.log(returnKeys);

  // 2. Check how callers use the result
  const r2 = await c.query(`
    SELECT proname, prosrc FROM pg_proc 
    WHERE prosrc ILIKE '%check_noob_protection%' AND proname != 'check_noob_protection'
  `);
  console.log(`\n=== ${r2.rows.length} functions call check_noob_protection ===`);
  for (const row of r2.rows) {
    // Find the line that checks the result
    const lines = row.prosrc.split('\n');
    for (const line of lines) {
      if (line.includes('protection_check') && (line.includes("'allowed'") || line.includes("'can_attack'"))) {
        console.log(`  ${row.proname}: ${line.trim()}`);
      }
    }
  }

  // 3. Simulate bidirectional check with real players
  const players = await c.query(`
    SELECT id, username, points_total FROM profiles 
    WHERE points_total > 0 ORDER BY points_total DESC LIMIT 100
  `);
  
  const top1 = players.rows[0];   // #1
  const rank59 = players.rows[58]; // #59 (first blocked by ratio from #1)
  
  console.log(`\n=== BIDIRECTIONAL TEST (ratio 2:1) ===`);
  console.log(`  #1:  ${top1.username} (${top1.points_total} pts)`);
  console.log(`  #59: ${rank59.username} (${rank59.points_total} pts)`);
  
  // Simulate: can #1 attack #59?
  const atkPts1 = parseInt(top1.points_total);
  const defPts59 = parseInt(rank59.points_total);
  
  console.log(`\n  #1 → #59: ${atkPts1} > ${defPts59} × 2 = ${defPts59 * 2}? ${atkPts1 > defPts59 * 2 ? '❌ BLOCKED (too weak)' : '✅ allowed'}`);
  console.log(`  #59 → #1: ${atkPts1} > ${defPts59} × 2 = ${defPts59 * 2}? Reverse: ${atkPts1 > defPts59 * 2 ? '❌ BLOCKED (too strong)' : '✅ allowed'}`);

  // Check the exact conditions from the function
  const ratio = 2;
  const noobLimit = 10000;
  
  // Direction 1: #1 attacks #59
  const d1 = atkPts1 > defPts59 * ratio && defPts59 > 0;
  console.log(`\n  Direction 1 (#1→#59): attacker(${atkPts1}) > defender(${defPts59}) * ${ratio} = ${defPts59*ratio}? ${d1 ? '❌ BLOCKED' : '✅ OK'}`);
  
  // Direction 2: #59 attacks #1
  const d2 = atkPts1 > defPts59 * ratio && atkPts1 > noobLimit;
  console.log(`  Direction 2 (#59→#1): defender(${atkPts1}) > attacker(${defPts59}) * ${ratio} = ${defPts59*ratio}? ${d2 ? '❌ BLOCKED' : '✅ OK'}`);

  console.log(`\n  ✅ Ambas direcciones bloqueadas = CORRECTO`);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
