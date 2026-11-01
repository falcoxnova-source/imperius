import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const userId = 'fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6';

// Check table structure
const schema = await c.query(`
  SELECT column_name, data_type FROM information_schema.columns 
  WHERE table_name = 'game_settings' ORDER BY ordinal_position
`);
console.log('game_settings columns:', schema.rows);

const schema2 = await c.query(`
  SELECT column_name, data_type FROM information_schema.columns 
  WHERE table_name = 'hero_ship_active_expedition' ORDER BY ordinal_position
`);
console.log('hero_ship_active_expedition columns:', schema2.rows);

// Now run 100 expeditions and count items
let kitCount = 0;
let equipCount = 0;
let noneCount = 0;

await c.query("DELETE FROM user_hero_ship_inventory WHERE user_id = $1", [userId]);

for (let i = 1; i <= 100; i++) {
  const exps = await c.query("SELECT id FROM hero_ship_expeditions ORDER BY duration_minutes LIMIT 1");
  await c.query("SELECT start_hero_expedition($1, $2)", [userId, exps.rows[0].id]);
  await c.query("UPDATE hero_ship_active_expedition SET returns_at = now() - interval '1 minute' WHERE user_id = $1 AND claimed = false", [userId]);
  const r = await c.query("SELECT claim_hero_expedition($1)", [userId]);
  const result = r.rows[0].claim_hero_expedition;
  if (result.items_found && result.items_found.length > 0) {
    const item = result.items_found[0];
    if (item.type === 'repair_kit') kitCount++;
    else equipCount++;
  } else {
    noneCount++;
  }
}

console.log(`\nResults after 100 expeditions:`);
console.log(`Kits: ${kitCount}`);
console.log(`Equipment: ${equipCount}`);
console.log(`Nothing: ${noneCount}`);

// Show inventory
const inv = await c.query("SELECT get_hero_inventory($1)", [userId]);
console.log('\nInventory:', JSON.stringify(inv.rows[0].get_hero_inventory));

await c.end();
