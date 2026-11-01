const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});

async function main() {
  await c.connect();

  // Check process_expedition
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_expedition'");
  if (r.rows.length) {
    const src = r.rows[0].prosrc;
    const inserts = src.match(/INSERT INTO messages/gi);
    console.log('process_expedition INSERT INTO messages count:', inserts ? inserts.length : 0);
    const returning = src.match(/is_returning\s*=\s*true/gi);
    console.log('process_expedition is_returning = true count:', returning ? returning.length : 0);
    
    console.log('\n--- process_expedition FULL SOURCE ---');
    console.log(src);
  }

  // Check perform_combat allied section
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'perform_combat'");
  if (r2.rows.length) {
    const src = r2.rows[0].prosrc;
    // Find the allied fleet section
    const idx = src.indexOf('deploy');
    if (idx > -1) {
      const start = Math.max(0, idx - 200);
      console.log('\n--- perform_combat allied fleet section ---');
      console.log(src.substring(start, idx + 600));
    }
  }

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
