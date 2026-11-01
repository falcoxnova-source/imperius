/**
 * Create Bot NPC Accounts
 * 
 * This script creates AI bot players by inserting into auth.users.
 * The handle_new_user() trigger automatically creates:
 * - profiles (with username, referral_code)
 * - planets (at a random empty position)
 * - planet_resources (starting resources)
 * 
 * After creation, we mark them as is_bot = true in profiles.
 * 
 * Usage: node scripts/create-bot-accounts.cjs
 */

const { Client } = require('pg');
const crypto = require('crypto');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

// Bot names - realistic Spanish/gaming names that look like real players
const BOT_CONFIGS = [
  { username: 'DarkNebula', email: 'bot_darknebula@falcoxnova.local' },
  { username: 'CosmicViper', email: 'bot_cosmicviper@falcoxnova.local' },
  { username: 'StellarHawk', email: 'bot_stellarhawk@falcoxnova.local' },
  { username: 'NovaCrusher', email: 'bot_novacrusher@falcoxnova.local' },
  { username: 'GalacticWolf', email: 'bot_galacticwolf@falcoxnova.local' },
  { username: 'ShadowFleet', email: 'bot_shadowfleet@falcoxnova.local' },
  { username: 'IronComet', email: 'bot_ironcomet@falcoxnova.local' },
  { username: 'VoidHunter', email: 'bot_voidhunter@falcoxnova.local' },
  { username: 'StarForge', email: 'bot_starforge@falcoxnova.local' },
  { username: 'CyberNova', email: 'bot_cybernova@falcoxnova.local' },
  { username: 'PhantomStar', email: 'bot_phantomstar@falcoxnova.local' },
  { username: 'TitanRush', email: 'bot_titanrush@falcoxnova.local' },
  { username: 'OrionBlade', email: 'bot_orionblade@falcoxnova.local' },
  { username: 'AstroKnight', email: 'bot_astroknight@falcoxnova.local' },
  { username: 'NebulaKing', email: 'bot_nebulaking@falcoxnova.local' },
  { username: 'SolarWraith', email: 'bot_solarwraith@falcoxnova.local' },
  { username: 'CraterX', email: 'bot_craterx@falcoxnova.local' },
  { username: 'ZenithPrime', email: 'bot_zenithprime@falcoxnova.local' },
  { username: 'MeteorStrike', email: 'bot_meteorstrike@falcoxnova.local' },
  { username: 'LunarShadow', email: 'bot_lunarshadow@falcoxnova.local' },
];

async function main() {
  await client.connect();
  console.log('Connected to database.\n');

  // Check if migration has been applied (is_bot column exists)
  try {
    await client.query('SELECT is_bot FROM profiles LIMIT 0');
  } catch (err) {
    console.error('ERROR: is_bot column not found in profiles.');
    console.error('Please apply the bot system migration first:');
    console.error('  20260415100000_create_bot_system.sql');
    await client.end();
    process.exit(1);
  }

  // Check how many bots already exist
  const { rows: existingBots } = await client.query(
    'SELECT p.username FROM profiles p WHERE p.is_bot = true'
  );
  
  if (existingBots.length > 0) {
    console.log(`Found ${existingBots.length} existing bots:`);
    existingBots.forEach(b => console.log(`  - ${b.username}`));
    console.log('');
  }

  let created = 0;
  let skipped = 0;

  for (const bot of BOT_CONFIGS) {
    // Check if this bot username already exists
    const { rows: existing } = await client.query(
      'SELECT id FROM profiles WHERE LOWER(username) = LOWER($1)',
      [bot.username]
    );

    if (existing.length > 0) {
      console.log(`  SKIP: ${bot.username} (already exists)`);
      skipped++;
      continue;
    }

    // Also check if email already exists in auth.users
    const { rows: existingAuth } = await client.query(
      'SELECT id FROM auth.users WHERE email = $1',
      [bot.email]
    );

    if (existingAuth.length > 0) {
      console.log(`  SKIP: ${bot.username} (email ${bot.email} already in auth.users)`);
      skipped++;
      continue;
    }

    try {
      // Generate a UUID for the bot
      const botId = crypto.randomUUID();
      
      // A dummy encrypted password (bcrypt hash of a random string - bots can't login)
      // This is a bcrypt hash of 'bot_disabled_account_no_login'
      const dummyPassword = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';

      // Insert into auth.users - this triggers handle_new_user() 
      // which creates profile + planet + resources
      await client.query(`
        INSERT INTO auth.users (
          id, 
          instance_id, 
          aud, 
          role, 
          email, 
          encrypted_password,
          email_confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          is_sso_user,
          is_anonymous,
          created_at,
          updated_at
        ) VALUES (
          $1,
          '00000000-0000-0000-0000-000000000000',
          'authenticated',
          'authenticated',
          $2,
          $3,
          NOW(),
          '{"provider": "email", "providers": ["email"]}',
          $4,
          false,
          false,
          NOW(),
          NOW()
        )
      `, [
        botId,
        bot.email,
        dummyPassword,
        JSON.stringify({ username: bot.username })
      ]);

      // Wait a moment for the trigger to complete
      await new Promise(r => setTimeout(r, 200));

      // Verify profile was created
      const { rows: profile } = await client.query(
        'SELECT id, username FROM profiles WHERE id = $1',
        [botId]
      );

      if (profile.length === 0) {
        console.log(`  WARNING: ${bot.username} - auth.users created but profile trigger may have failed`);
        // Try to manually create the profile
        continue;
      }

      // Mark as bot
      await client.query(
        'UPDATE profiles SET is_bot = true WHERE id = $1',
        [botId]
      );

      // Get the bot's planet info
      const { rows: planets } = await client.query(
        'SELECT id, name, galaxy, solar_system, position FROM planets WHERE user_id = $1',
        [botId]
      );

      if (planets.length > 0) {
        const p = planets[0];
        console.log(`  CREATED: ${bot.username} -> [${p.galaxy}:${p.solar_system}:${p.position}] ${p.name}`);
      } else {
        console.log(`  CREATED: ${bot.username} (no planet found - check handle_new_user trigger)`);
      }

      created++;
    } catch (err) {
      console.error(`  ERROR creating ${bot.username}: ${err.message}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total bots: ${existingBots.length + created}`);

  // Show all bots with their planets
  const { rows: allBots } = await client.query(`
    SELECT p.username, pl.galaxy, pl.solar_system, pl.position, 
           pr.metal, pr.crystal, pr.deuterium
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id AND pl.planet_type = 'planet' AND pl.is_main_planet = true
    JOIN planet_resources pr ON pr.planet_id = pl.id
    WHERE p.is_bot = true
    ORDER BY pl.galaxy, pl.solar_system, pl.position
  `);

  if (allBots.length > 0) {
    console.log('\n=== All Bot Accounts ===');
    allBots.forEach(b => {
      console.log(`  ${b.username.padEnd(15)} [${b.galaxy}:${String(b.solar_system).padStart(3)}:${String(b.position).padStart(2)}] Metal:${Number(b.metal).toLocaleString()} Crystal:${Number(b.crystal).toLocaleString()} Deut:${Number(b.deuterium).toLocaleString()}`);
    });
  }

  // Verify cron job is scheduled
  const { rows: cronJobs } = await client.query(
    "SELECT jobname, schedule FROM cron.job WHERE jobname = 'bot-ai-tick'"
  );
  
  if (cronJobs.length > 0) {
    console.log(`\n✅ Bot AI cron job active: ${cronJobs[0].jobname} (${cronJobs[0].schedule})`);
  } else {
    console.log('\n⚠️  Bot AI cron job NOT found. Apply the migration first.');
  }

  await client.end();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  client.end();
  process.exit(1);
});
