const { Client } = require('pg');
const fs = require('fs');

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

  const sql = fs.readFileSync('supabase/migrations/20260316010000_fix_acs_join_race_condition.sql', 'utf8');
  
  console.log('Applying migration: fix_acs_join_race_condition...');
  try {
    await c.query(sql);
    console.log('✅ Migration applied successfully!');
  } catch (err) {
    console.error('❌ Error applying migration:', err.message);
    // Try each statement separately
    const statements = sql.split(/;\s*\n/).filter(s => s.trim());
    console.log(`\nRetrying ${statements.length} statements individually...`);
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt || stmt.startsWith('--')) continue;
      try {
        await c.query(stmt);
        console.log(`  ✅ Statement ${i+1} OK`);
      } catch (e) {
        console.error(`  ❌ Statement ${i+1} FAILED:`, e.message);
        console.error(`     SQL: ${stmt.substring(0, 100)}...`);
      }
    }
  }

  // Verify the functions have FOR UPDATE
  console.log('\n=== VERIFICATION ===');
  
  console.log('\n--- join_acs_with_fleet: checking FOR UPDATE ---');
  const fn1 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'join_acs_with_fleet'`);
  const src1 = fn1.rows[0].prosrc;
  const forUpdateCount1 = (src1.match(/FOR UPDATE/gi) || []).length;
  console.log(`  FOR UPDATE count: ${forUpdateCount1}`);
  if (src1.includes('FOR UPDATE')) {
    const lines = src1.split('\n');
    lines.forEach((line, i) => {
      if (line.toUpperCase().includes('FOR UPDATE')) {
        console.log(`  Line ${i}: ${line.trim()}`);
      }
    });
  }

  console.log('\n--- send_fleet: checking FOR UPDATE ---');
  const fn2 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'send_fleet'`);
  const src2 = fn2.rows[0].prosrc;
  const forUpdateCount2 = (src2.match(/FOR UPDATE/gi) || []).length;
  console.log(`  FOR UPDATE count: ${forUpdateCount2}`);
  if (src2.includes('FOR UPDATE')) {
    const lines = src2.split('\n');
    lines.forEach((line, i) => {
      if (line.toUpperCase().includes('FOR UPDATE')) {
        console.log(`  Line ${i}: ${line.trim()}`);
      }
    });
  }

  // Check constraints
  console.log('\n--- CHECK constraints on planet_ships ---');
  const cs = await c.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'planet_ships'::regclass AND contype = 'c'`);
  console.log(cs.rows.map(r => r.conname).join(', '));

  await c.end();
}

main().catch(e => { console.error('FATAL:', e.message); c.end(); });
