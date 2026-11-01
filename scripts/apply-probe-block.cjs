const {Client}=require('pg');
const fs=require('fs');
const path=require('path');
(async()=>{
  const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
  await c.connect();
  const src=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260618180000_block_probe_only_attacks_and_npc_spy_filter.sql'),'utf8');
  try{
    const r=await c.query(src);
    console.log('✅ Migration applied');

    // Verify
    const v=await c.query(`SELECT prosrc FROM pg_proc WHERE proname='secure_send_fleet' AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')`);
    console.log('Has probe-only attack block:', /No puedes atacar solo con sondas/.test(v.rows[0].prosrc));

    // Test: simulate attack-only-probe call (should fail validation)
    try {
      await c.query(`SELECT secure_send_fleet(
        '00000000-0000-0000-0000-000000000000'::uuid, 1, 1, 1, 'attack',
        '[{"ship_type_id": 1, "quantity": 1}]'::jsonb
      )`);
    } catch(e) {
      console.log('(test call error expected since fake ids:', e.message.substring(0,80),')');
    }
  }catch(e){
    console.error('❌',e.message);
    process.exit(1);
  }finally{
    await c.end();
  }
})();
