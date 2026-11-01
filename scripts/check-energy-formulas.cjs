const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
c.connect().then(async()=>{
  const {rows}=await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_planet_resources'");
  const src = rows[0].prosrc;
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (l.match(/solar|fusion|energy_tech|satellite|energia|v_energy|plant/i)) {
      console.log((i+1) + ': ' + l.trim());
    }
  });
  await c.end();
}).catch(e=>console.error(e));
