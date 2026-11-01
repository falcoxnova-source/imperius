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
  const minPtsNeeded = Math.ceil(top1pts / 3); // ratio=3
  
  console.log(`#1 ${r.rows[0].username}: ${top1pts} pts`);
  console.log(`Protection ratio: 3:1`);
  console.log(`Min pts to be attackable by #1: ${minPtsNeeded}\n`);
  
  for (const row of r.rows) {
    const pts = parseInt(row.points_total);
    const ratio = (top1pts / pts).toFixed(2);
    const blocked = top1pts > pts * 3;
    const marker = blocked ? '❌ BLOCKED' : '✅ OK';
    if (parseInt(row.rank) <= 10 || parseInt(row.rank) >= 48 && parseInt(row.rank) <= 60 || blocked && parseInt(row.rank) <= 80) {
      console.log(`  #${row.rank} ${row.username.padEnd(25)} ${String(pts).padStart(7)} pts | ratio ${ratio}x | ${marker}`);
    }
  }
  
  // Find exact cutoff rank
  for (let i = 0; i < r.rows.length; i++) {
    const pts = parseInt(r.rows[i].points_total);
    if (top1pts > pts * 3) {
      console.log(`\n=== CUTOFF ===`);
      if (i > 0) {
        console.log(`  Last attackable:  #${i} ${r.rows[i-1].username} (${r.rows[i-1].points_total} pts)`);
      }
      console.log(`  First BLOCKED:    #${i+1} ${r.rows[i].username} (${pts} pts)`);
      console.log(`  Total attackable by #1: ${i} players`);
      break;
    }
    if (i === r.rows.length - 1) {
      console.log(`\n=== #1 can attack ALL ${r.rows.length} ranked players ===`);
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
