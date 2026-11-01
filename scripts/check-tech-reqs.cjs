const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

const userId = 'e11e6baa-c599-440c-aaaa-b98008182b4b';

(async () => {
  await c.connect();

  // Check tech requirements for terraformer
  // required_tech_id=1 with level 12 - what is tech id 1?
  const tech = await c.query(`SELECT * FROM technology_types WHERE id = 1`);
  console.log('=== TECH ID 1 ===');
  console.log(JSON.stringify(tech.rows[0]));

  // Check all tech types
  const allTech = await c.query(`SELECT id, code, name FROM technology_types ORDER BY id`);
  console.log('\n=== ALL TECHNOLOGY TYPES ===');
  allTech.rows.forEach(t => console.log(`${t.id} | ${t.code} | ${t.name}`));

  // Check user's technologies
  const userTech = await c.query(`
    SELECT tt.code, tt.name, ut.level
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_id
    WHERE ut.user_id = $1
    ORDER BY tt.code
  `, [userId]);
  console.log('\n=== USER TECHNOLOGIES ===');
  userTech.rows.forEach(t => console.log(`  ${t.code} (${t.name}) = nivel ${t.level}`));

  // Find energy technology specifically
  const energyTech = await c.query(`
    SELECT * FROM technology_types WHERE code ILIKE '%energy%' OR name ILIKE '%energ%'
  `);
  console.log('\n=== ENERGY TECH ===');
  energyTech.rows.forEach(t => console.log(JSON.stringify(t)));

  await c.end();
})();
