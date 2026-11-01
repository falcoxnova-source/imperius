const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  // 1. Full source of ALL market functions
  const funcs = ['create_market_listing', 'cancel_market_listing', 'purchase_market_listing'];
  for (const fname of funcs) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== ${fname} ===`);
    console.log('='.repeat(60));
    const res = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fname]);
    if (res.rows.length > 0) {
      const lines = res.rows[0].prosrc.split('\n');
      lines.forEach((line, i) => {
        console.log(`${(i+1).toString().padStart(4)}: ${line}`);
      });
    } else {
      console.log('NOT FOUND');
    }
  }

  // 2. market_listings table columns
  console.log(`\n${'='.repeat(60)}`);
  console.log('=== market_listings COLUMNS ===');
  const res2 = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'market_listings'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(res2.rows, null, 2));

  // 3. Recent cancelled listings
  console.log(`\n${'='.repeat(60)}`);
  console.log('=== RECENT CANCELLED LISTINGS ===');
  const res3 = await client.query(`
    SELECT ml.id, ml.seller_id, pr.username, ml.listing_type, ml.item_name, 
           ml.quantity, ml.price_fxu, ml.planet_id,
           p.name as planet_name, p.is_main_planet,
           p.galaxy || ':' || p.solar_system || ':' || p.position as planet_coords,
           ml.status, ml.created_at, ml.updated_at
    FROM market_listings ml
    JOIN profiles pr ON ml.seller_id = pr.id
    LEFT JOIN planets p ON ml.planet_id = p.id
    WHERE ml.status = 'cancelled'
    ORDER BY ml.updated_at DESC
    LIMIT 15
  `);
  console.log(JSON.stringify(res3.rows, null, 2));

  await client.end();
}

main().catch(console.error);
