const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await c.connect();
  console.log('Connected');

  // Step 1: Add percentage columns (DEFAULT 100, all existing rows get 100 automatically)
  await c.query(`
    ALTER TABLE planet_resources 
      ADD COLUMN IF NOT EXISTS metal_mine_percent smallint NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS crystal_mine_percent smallint NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS deuterium_synth_percent smallint NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS solar_plant_percent smallint NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS fusion_reactor_percent smallint NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS solar_satellite_percent smallint NOT NULL DEFAULT 100;
  `);
  console.log('✅ 6 percentage columns added (DEFAULT 100)');

  // Step 2: Add CHECK constraints
  await c.query(`
    DO $$ BEGIN
      BEGIN ALTER TABLE planet_resources ADD CONSTRAINT chk_metal_mine_pct CHECK (metal_mine_percent BETWEEN 0 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END;
      BEGIN ALTER TABLE planet_resources ADD CONSTRAINT chk_crystal_mine_pct CHECK (crystal_mine_percent BETWEEN 0 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END;
      BEGIN ALTER TABLE planet_resources ADD CONSTRAINT chk_deut_synth_pct CHECK (deuterium_synth_percent BETWEEN 0 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END;
      BEGIN ALTER TABLE planet_resources ADD CONSTRAINT chk_solar_plant_pct CHECK (solar_plant_percent BETWEEN 0 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END;
      BEGIN ALTER TABLE planet_resources ADD CONSTRAINT chk_fusion_reactor_pct CHECK (fusion_reactor_percent BETWEEN 0 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END;
      BEGIN ALTER TABLE planet_resources ADD CONSTRAINT chk_solar_satellite_pct CHECK (solar_satellite_percent BETWEEN 0 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END;
    END $$;
  `);
  console.log('✅ CHECK constraints added (0-100)');

  // Step 3: Verify all columns exist and all rows have 100
  const cols = await c.query(`
    SELECT column_name, column_default, is_nullable 
    FROM information_schema.columns 
    WHERE table_name='planet_resources' AND column_name LIKE '%percent' 
    ORDER BY ordinal_position
  `);
  console.log('\nNew columns:');
  console.table(cols.rows);

  const verify = await c.query(`
    SELECT COUNT(*) as total,
      COUNT(*) FILTER (WHERE metal_mine_percent = 100) as metal_100,
      COUNT(*) FILTER (WHERE crystal_mine_percent = 100) as crystal_100,
      COUNT(*) FILTER (WHERE deuterium_synth_percent = 100) as deut_100,
      COUNT(*) FILTER (WHERE solar_plant_percent = 100) as solar_100,
      COUNT(*) FILTER (WHERE fusion_reactor_percent = 100) as fusion_100,
      COUNT(*) FILTER (WHERE solar_satellite_percent = 100) as satellite_100
    FROM planet_resources
  `);
  console.log('\nVerification (all should match total):');
  console.table(verify.rows);

  await c.end();
  console.log('\n✅ Migration complete - zero impact on existing production');
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
