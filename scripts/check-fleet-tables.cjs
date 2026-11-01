const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();
  
  let r;
  r = await c.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='fleets' ORDER BY ordinal_position");
  console.log('=== fleets columns ===');
  r.rows.forEach(x => console.log('  ' + x.column_name + ' (' + x.data_type + ')'));

  r = await c.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='fleet_ships' ORDER BY ordinal_position");
  console.log('\n=== fleet_ships columns ===');
  r.rows.forEach(x => console.log('  ' + x.column_name + ' (' + x.data_type + ')'));

  // Check technology_types codes
  r = await c.query("SELECT id, code, name FROM technology_types ORDER BY id");
  console.log('\n=== technology_types ===');
  r.rows.forEach(x => console.log('  id=' + x.id + ' ' + x.code + ' (' + x.name + ')'));

  // Check bot techs using join
  r = await c.query(`
    SELECT p.username, tt.code, ut.level 
    FROM profiles p 
    JOIN user_technologies ut ON ut.user_id = p.id 
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE p.is_bot = true AND p.username = 'JPablo_'
    ORDER BY tt.id
  `);
  console.log('\n=== JPablo_ technologies ===');
  r.rows.forEach(x => console.log('  ' + x.code + ': lvl ' + x.level));

  // Check bot resources
  r = await c.query(`
    SELECT p.username, pr.metal, pr.crystal, pr.deuterium
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id
    JOIN planet_resources pr ON pr.planet_id = pl.id
    WHERE p.is_bot = true
    ORDER BY p.username
    LIMIT 5
  `);
  console.log('\n=== Bot resources (sample) ===');
  r.rows.forEach(x => console.log('  ' + x.username + ': M=' + Math.floor(x.metal) + ' C=' + Math.floor(x.crystal) + ' D=' + Math.floor(x.deuterium)));

  await c.end();
}
main().catch(e => console.error(e));
