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

  // Get protection settings
  const r1 = await c.query(`
    SELECT key, value FROM game_settings 
    WHERE key IN ('newbie_protection_points', 'protection_ratio')
    ORDER BY key
  `);
  console.log('=== PROTECTION SETTINGS ===');
  for (const row of r1.rows) {
    console.log(`  ${row.key} = ${row.value}`);
  }

  // Get top 51 players by points to simulate the scenario
  const r2 = await c.query(`
    SELECT ROW_NUMBER() OVER (ORDER BY points_total DESC) as rank, 
           username, points_total
    FROM profiles
    WHERE points_total > 0
    ORDER BY points_total DESC
    LIMIT 55
  `);
  
  const top1 = r2.rows[0];
  const top51 = r2.rows.length >= 51 ? r2.rows[50] : null;
  
  console.log(`\n=== TOP PLAYERS ===`);
  console.log(`  #1:  ${top1.username} - ${top1.points_total} pts`);
  if (top51) {
    console.log(`  #51: ${top51.username} - ${top51.points_total} pts`);
  } else {
    console.log(`  #51: No existe (solo hay ${r2.rows.length} jugadores con puntos)`);
  }

  // Simulate protection check
  const noobLimit = parseInt((r1.rows.find(r => r.key === 'newbie_protection_points') || {}).value || '5000');
  const ratio = parseInt((r1.rows.find(r => r.key === 'protection_ratio') || {}).value || '5');
  
  console.log(`\n=== SIMULATION: Can #1 attack #51? ===`);
  console.log(`  Noob limit: ${noobLimit} pts`);
  console.log(`  Protection ratio: ${ratio}:1`);
  
  if (top51) {
    const atkPts = parseInt(top1.points_total);
    const defPts = parseInt(top51.points_total);
    
    // Check 1: Noob protection
    if (defPts <= noobLimit && atkPts > noobLimit) {
      console.log(`  ❌ BLOCKED: Defender (${defPts} pts) is under noob protection (≤${noobLimit})`);
    }
    // Check 2: Ratio protection (attacker too strong)
    else if (atkPts > defPts * ratio && defPts > 0) {
      console.log(`  ❌ BLOCKED: Attacker is ${(atkPts / defPts).toFixed(1)}x stronger (limit: ${ratio}x)`);
      console.log(`    #1 (${atkPts}) > #51 (${defPts}) × ${ratio} = ${defPts * ratio}`);
    }
    // Check 3: Ratio protection (defender too strong)  
    else if (defPts > atkPts * ratio && defPts > noobLimit) {
      console.log(`  ❌ BLOCKED: Defender is ${(defPts / atkPts).toFixed(1)}x stronger (limit: ${ratio}x)`);
    }
    else {
      console.log(`  ✅ ALLOWED: Ratio is ${(atkPts / defPts).toFixed(1)}x (within ${ratio}x limit)`);
      console.log(`    #1 (${atkPts}) ≤ #51 (${defPts}) × ${ratio} = ${defPts * ratio} ? ${atkPts <= defPts * ratio}`);
    }
    
    // Show some players around the boundary
    console.log(`\n=== WHERE DOES #1 GET BLOCKED? ===`);
    console.log(`  #1 has ${atkPts} pts, needs defender with at least ${Math.ceil(atkPts / ratio)} pts`);
    
    let lastAllowed = null;
    for (let i = 0; i < r2.rows.length; i++) {
      const pts = parseInt(r2.rows[i].points_total);
      if (atkPts > pts * ratio && pts > 0) {
        if (!lastAllowed) {
          console.log(`  First blocked at rank #${i + 1}: ${r2.rows[i].username} (${pts} pts) - ratio ${(atkPts/pts).toFixed(1)}x`);
        }
        lastAllowed = r2.rows[i];
      }
    }
    if (lastAllowed) {
      // Find the exact cutoff
      for (let i = 0; i < r2.rows.length; i++) {
        const pts = parseInt(r2.rows[i].points_total);
        const blocked = atkPts > pts * ratio && pts > 0;
        const prevBlocked = i > 0 ? (atkPts > parseInt(r2.rows[i-1].points_total) * ratio) : false;
        if (blocked && !prevBlocked) {
          console.log(`  → Cutoff: #1 can attack down to rank #${i} but NOT #${i+1}+`);
          console.log(`    Last attackable: #${i} ${r2.rows[i-1].username} (${r2.rows[i-1].points_total} pts)`);
          console.log(`    First blocked:   #${i+1} ${r2.rows[i].username} (${pts} pts)`);
          break;
        }
      }
    } else {
      console.log(`  #1 can attack ALL listed players (none exceed ${ratio}x ratio)`);
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
