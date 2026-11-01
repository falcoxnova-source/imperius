const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://hhrgcnvydmjqcevgmlhj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocmdjbnZ5ZG1qcWNldmdtbGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczOTE2MDEsImV4cCI6MjA4Mjk2NzYwMX0.YYoUqIuz9GS-pgkqkSz33W6K7TCYSyayc1yHtUCryUU'
);

const uid = '6516fcdc-95f9-47db-8479-eef6a7d09898';

(async () => {
  // 1. Check is_user_plus
  const { data: isPlus } = await c.rpc('is_user_plus', { p_user_id: uid });
  console.log('1. is_user_plus:', isPlus);

  // 2. Check plus_subscriptions directly
  const { data: subs, error: subsErr } = await c.from('plus_subscriptions').select('*').eq('user_id', uid);
  console.log('2. plus_subscriptions (anon key):', subs, subsErr?.message || '');

  // 3. Check function source via admin SQL
  const { data: funcSrc, error: funcErr } = await c.rpc('admin_execute_sql', {
    sql_query: "SELECT LEFT(prosrc, 500) as src FROM pg_proc WHERE proname = 'get_my_monthly_market_sales' LIMIT 1"
  });
  console.log('3. Function source (first 500 chars):');
  if (funcSrc) {
    if (Array.isArray(funcSrc)) {
      funcSrc.forEach(r => console.log(r.src || JSON.stringify(r)));
    } else {
      console.log(JSON.stringify(funcSrc));
    }
  }
  if (funcErr) console.log('  ERR:', funcErr.message);

  // 4. Check VIP subscription details via SQL
  const { data: subDetails, error: subErr } = await c.rpc('admin_execute_sql', {
    sql_query: "SELECT id, user_id, is_active, expires_at, started_at, plan_id FROM plus_subscriptions WHERE user_id = '6516fcdc-95f9-47db-8479-eef6a7d09898'"
  });
  console.log('4. Subscription via SQL:', JSON.stringify(subDetails));
  if (subErr) console.log('  ERR:', subErr.message);

  // 5. Check the create_market_listing source for VIP check  
  const { data: createSrc, error: createErr } = await c.rpc('admin_execute_sql', {
    sql_query: "SELECT LEFT(prosrc, 300) as src FROM pg_proc WHERE proname = 'create_market_listing' LIMIT 1"
  });
  console.log('5. create_market_listing source (first 300):');
  if (createSrc) {
    if (Array.isArray(createSrc)) {
      createSrc.forEach(r => console.log(r.src || JSON.stringify(r)));
    } else {
      console.log(JSON.stringify(createSrc));
    }
  }
  if (createErr) console.log('  ERR:', createErr.message);
})();
