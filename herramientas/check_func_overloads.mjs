import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Check if there are multiple overloads
const r = await c.query("SELECT oid::regprocedure FROM pg_proc WHERE proname = 'secure_add_to_building_queue'");
console.log('Overloads:', r.rows.map(r => r.oid).join(', '));

// Also check the function prosrc for is_moon references
const r2 = await c.query("SELECT proname, prosrc FROM pg_proc WHERE proname = 'secure_add_to_building_queue'");
for (const row of r2.rows) {
  if (row.prosrc.includes('is_moon')) {
    console.log('Found is_moon in function!');
    // Find the actual reference
    const lines = row.prosrc.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('is_moon')) {
        console.log(`  Line ${i+1}: ${lines[i].trim()}`);
      }
    }
  } else {
    console.log('No is_moon reference found in function body');
  }
}

await c.end();
