const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  
  console.log('=== SHIP TECH REQUIREMENTS ===');
  const ships = await c.query(`
    SELECT st.code as ship, tt.code as tech, sr.required_tech_level as lvl
    FROM ship_requirements sr 
    JOIN ship_types st ON st.id=sr.ship_type_id 
    JOIN technology_types tt ON tt.id=sr.required_tech_id 
    WHERE sr.required_tech_id IS NOT NULL 
    ORDER BY st.code, tt.code
  `);
  console.table(ships.rows);
  
  console.log('\n=== DEFENSE TECH REQUIREMENTS ===');
  const defs = await c.query(`
    SELECT dt.code as defense, tt.code as tech, dr.required_tech_level as lvl
    FROM defense_requirements dr 
    JOIN defense_types dt ON dt.id=dr.defense_type_id 
    JOIN technology_types tt ON tt.id=dr.required_tech_id 
    WHERE dr.required_tech_id IS NOT NULL 
    ORDER BY dt.code, tt.code
  `);
  console.table(defs.rows);
  
  await c.end();
})();
