const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });
c.connect().then(() => c.query("SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name LIKE 'points%' ORDER BY column_name"))
  .then(r => { console.log(r.rows); c.end(); });
