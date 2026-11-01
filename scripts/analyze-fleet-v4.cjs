const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://hhrgcnvydmjqcevgmlhj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocmdjbnZ5ZG1qcWNldmdtbGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczOTE2MDEsImV4cCI6MjA4Mjk2NzYwMX0.YYoUqIuz9GS-pgkqkSz33W6K7TCYSyayc1yHtUCryUU'
);

async function main() {
  console.log('=== 1. fleets table ===');
  const { data: f1, error: ef1 } = await supabase.from('fleets').select('*').limit(1);
  if (ef1) console.log('fleets error:', ef1.message);
  else if (f1 && f1.length > 0) { console.log('columns:', Object.keys(f1[0]).join(', ')); console.log(JSON.stringify(f1[0], null, 2)); }
  else console.log('fleets empty');

  console.log('\n=== 2. fleet_ships ===');
  const { data: fs1, error: efs } = await supabase.from('fleet_ships').select('*').limit(1);
  if (efs) console.log('error:', efs.message);
  else if (fs1 && fs1.length > 0) console.log('columns:', Object.keys(fs1[0]).join(', '));
  else console.log('empty');

  console.log('\n=== 3. ship_types ===');
  const { data: ships } = await supabase.from('ship_types').select('id,code,base_speed,fuel_consumption,cargo_capacity').order('id');
  if (ships) ships.forEach(s => console.log(`  ${s.id} ${s.code} spd=${s.base_speed} fuel=${s.fuel_consumption} cargo=${s.cargo_capacity}`));

  console.log('\n=== 4. Bot ships ===');
  const { data: bots } = await supabase.from('profiles').select('id,username').eq('is_bot', true);
  if (bots) {
    const botIds = bots.map(b=>b.id);
    const { data: planets } = await supabase.from('planets').select('id,galaxy,system,position,user_id').in('user_id', botIds);
    if (planets) {
      const pids = planets.map(p=>p.id);
      const { data: ps } = await supabase.from('planet_ships').select('planet_id,ship_type_id,quantity').in('planet_id', pids).gt('quantity', 0);
      if (ps) {
        const nameMap = {}; bots.forEach(b => nameMap[b.id]=b.username);
        const pMap = {}; planets.forEach(p => pMap[p.id]=p);
        ps.forEach(s => { const p=pMap[s.planet_id]; console.log(`  ${nameMap[p.user_id]} [${p.galaxy}:${p.system}:${p.position}] type=${s.ship_type_id} x${s.quantity}`); });
      }
    }
  }

  console.log('\n=== 5. Bot resources (3 samples) ===');
  if (bots) {
    for (const bot of bots.slice(0,3)) {
      const { data: pl } = await supabase.from('planets').select('id,galaxy,system,position').eq('user_id', bot.id);
      if (pl) for (const p of pl) {
        const { data: r } = await supabase.from('planet_resources').select('metal,crystal,deuterium').eq('planet_id', p.id).single();
        if (r) console.log(`  ${bot.username} [${p.galaxy}:${p.system}:${p.position}] M=${Math.floor(r.metal)} C=${Math.floor(r.crystal)} D=${Math.floor(r.deuterium)}`);
      }
    }
  }

  console.log('\n=== 6. Bot techs (1st bot) ===');
  if (bots && bots[0]) {
    const { data: techs } = await supabase.from('user_technologies').select('technology_type_id,level,is_researching').eq('user_id', bots[0].id);
    const { data: tt } = await supabase.from('technology_types').select('id,code');
    if (techs && tt) { const m={}; tt.forEach(t=>m[t.id]=t.code); techs.forEach(t=>console.log(`  ${m[t.technology_type_id]}=${t.level}${t.is_researching?' RESEARCHING':''}}`)); }
  }

  console.log('\n=== 7. profiles check ===');
  const { data: prof } = await supabase.from('profiles').select('id,username,is_bot,is_admin,points_total,vacation_mode').eq('is_bot', true).limit(1);
  if (prof && prof[0]) console.log(JSON.stringify(prof[0]));

  console.log('\n=== 8. Active fleets ===');
  const { count } = await supabase.from('fleets').select('*', { count: 'exact', head: true }).eq('is_completed', false);
  console.log('Active fleets:', count);

  console.log('\n=== 9. Non-bot players ===');
  const { data: players } = await supabase.from('profiles').select('username,points_total').eq('is_bot', false).order('points_total', { ascending: false }).limit(10);
  if (players) players.forEach(p => console.log(`  ${p.username} pts=${p.points_total}`));
}
main().catch(console.error);
