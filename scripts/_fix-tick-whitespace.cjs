const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
c.connect().then(async()=>{
  const r=await c.query("SELECT p.prosrc, pg_get_function_result(p.oid) AS result, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'");
  let src=r.rows[0].prosrc;
  const before=src.length;
  // Limpiar líneas en blanco al inicio
  src=src.replace(/^\s*\n+/, '\n');
  console.log('Trimmed',before-src.length,'chars from start');
  await c.query(`CREATE OR REPLACE FUNCTION public.bot_ai_tick(${r.rows[0].args}) RETURNS ${r.rows[0].result} LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$${src}$func$`);
  console.log('✅ bot_ai_tick limpiada');
  require('fs').writeFileSync('scripts/_bot_ai_tick_current.sql',src);
  await c.end();
});
