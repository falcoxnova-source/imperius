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

  const r = await c.query(`
    SELECT ROW_NUMBER() OVER (ORDER BY points_total DESC) as rank,
           username, points_total
    FROM profiles
    WHERE points_total > 0
    ORDER BY points_total DESC
  `);

  const top1pts = parseInt(r.rows[0].points_total);

  console.log(`#1 ${r.rows[0].username}: ${top1pts} pts\n`);

  // Compare ratio 3 vs ratio 2
  for (const ratio of [3, 2]) {
    const minPts = Math.ceil(top1pts / ratio);
    let cutoff = r.rows.length; // can attack all
    for (let i = 0; i < r.rows.length; i++) {
      if (top1pts > parseInt(r.rows[i].points_total) * ratio && parseInt(r.rows[i].points_total) > 0) {
        cutoff = i;
        break;
      }
    }
    console.log(`=== RATIO ${ratio}:1 ===`);
    console.log(`  Min pts para ser atacado por #1: ${minPts}`);
    console.log(`  #1 puede atacar: ${cutoff} jugadores (hasta #${cutoff})`);
    if (cutoff < r.rows.length) {
      console.log(`  Último atacable:  #${cutoff} ${r.rows[cutoff-1].username} (${r.rows[cutoff-1].points_total} pts)`);
      console.log(`  Primer bloqueado: #${cutoff+1} ${r.rows[cutoff].username} (${r.rows[cutoff].points_total} pts)`);
    }
    console.log('');
  }

  // Show detailed list for ratio=2
  console.log('=== DETALLE CON RATIO 2:1 ===\n');
  let lastOk = null;
  for (const row of r.rows) {
    const pts = parseInt(row.points_total);
    const ratio2 = (top1pts / pts).toFixed(2);
    const blocked2 = top1pts > pts * 2;
    const blocked3 = top1pts > pts * 3;
    const rank = parseInt(row.rank);

    // Show top 15, and around the cutoff zones
    const show = rank <= 15 || (rank >= 20 && rank <= 35) || (rank >= 55 && rank <= 65);
    if (show) {
      const status3 = blocked3 ? '❌' : '✅';
      const status2 = blocked2 ? '❌' : '✅';
      console.log(`  #${String(rank).padStart(2)} ${row.username.padEnd(25)} ${String(pts).padStart(7)} pts | ${ratio2}x | ratio3:${status3} ratio2:${status2}`);
    }
  }

  // Count impact
  let attackable3 = 0, attackable2 = 0;
  for (const row of r.rows) {
    const pts = parseInt(row.points_total);
    if (!(top1pts > pts * 3) || pts === 0) attackable3++;
    if (!(top1pts > pts * 2) || pts === 0) attackable2++;
  }
  
  console.log(`\n=== RESUMEN COMPARATIVO ===`);
  console.log(`  Ratio 3:1 → #1 ataca a ${attackable3} jugadores`);
  console.log(`  Ratio 2:1 → #1 ataca a ${attackable2} jugadores`);
  console.log(`  Diferencia: ${attackable3 - attackable2} jugadores menos atacables`);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
