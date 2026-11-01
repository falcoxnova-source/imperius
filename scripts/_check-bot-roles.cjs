const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });
(async()=>{
  await c.connect();
  const r = await c.query(`
    SELECT COALESCE(p.autopilot_role,'balanced') AS role, COUNT(*) AS n
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE pr.is_bot = true AND p.planet_type='planet' AND NOT p.is_destroyed
    GROUP BY 1 ORDER BY n DESC
  `);
  console.log('Distribución de roles en planetas de NPCs (bots):');
  r.rows.forEach(x => console.log('  ' + x.role.padEnd(12), ':', x.n, 'planetas'));
  const total = r.rows.reduce((a,x)=>a+Number(x.n),0);
  console.log('  TOTAL      :', total);
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
