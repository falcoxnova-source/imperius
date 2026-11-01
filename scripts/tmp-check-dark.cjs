const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
c.connect().then(async()=>{
  const r = await c.query("SELECT username, autopilot_eligible, autopilot_active FROM profiles WHERE username = 'dark'");
  console.log('dark profile:', r.rows[0]);
  
  // Also check RLS policies on profiles
  const rls = await c.query("SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'SELECT'");
  console.log('\nRLS SELECT policies on profiles:');
  rls.rows.forEach(p => console.log(`  ${p.policyname}: ${p.qual}`));
  
  await c.end();
});
