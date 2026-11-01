const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1. Read current function source
  const r = await c.query(
    "SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_shipyard_queue' AND pronamespace='public'::regnamespace"
  );
  let src = r.rows[0]?.prosrc;
  if (!src) { console.error('Function not found!'); process.exit(1); }

  // 2. Idempotency check
  if (src.includes('VIP Plus: -10% shipyard construction time')) {
    console.log('✅ VIP bonus already present in secure_add_to_shipyard_queue — nothing to do.');
    await c.end();
    return;
  }

  // 3. Find the exact anchor — confirmed: "/ v_game_speed\n));\nEND IF;" (LF only, no leading spaces)
  const anchor = '/ v_game_speed\n));\nEND IF;';
  
  // Count occurrences
  let count = 0;
  let pos = 0;
  while ((pos = src.indexOf(anchor, pos)) !== -1) { count++; pos += anchor.length; }
  console.log(`Anchor found ${count} time(s) in function source.`);

  if (count === 0) {
    console.error('❌ Anchor text not found!');
    process.exit(1);
  }

  // The anchor appears once — after the ELSE branch (defense), at the END IF that closes the IF/ELSE.
  // We want to INSERT the VIP bonus AFTER the END IF, so it applies to BOTH ship and defense.
  const replacement = anchor + '\n\n-- VIP Plus: -10% shipyard construction time\nIF is_user_plus(auth.uid()) THEN\n  v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * 0.90));\nEND IF;';

  const newSrc = src.replace(anchor, replacement);

  // 4. Verify patch
  if (!newSrc.includes('VIP Plus: -10% shipyard construction time')) {
    console.error('❌ Patch failed — replacement did not inject VIP code!');
    process.exit(1);
  }

  // 5. Recreate function with patched source
  const createSQL = `
    CREATE OR REPLACE FUNCTION secure_add_to_shipyard_queue(p_planet_id uuid, p_item_type text, p_type_id integer, p_quantity integer)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = 'public'
    AS $fn$${newSrc}$fn$
  `;
  await c.query(createSQL);

  // 6. Verify by re-reading
  const r2 = await c.query(
    "SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_shipyard_queue' AND pronamespace='public'::regnamespace"
  );
  const finalSrc = r2.rows[0]?.prosrc || '';
  if (finalSrc.includes('VIP Plus: -10% shipyard construction time')) {
    console.log('✅ VIP -10% shipyard bonus successfully applied!');
  } else {
    console.error('❌ Verification failed — bonus not found after CREATE OR REPLACE!');
    process.exit(1);
  }

  // 7. Final status of ALL VIP functions
  const funcs = [
    'calculate_planet_resources',
    'secure_add_to_building_queue',
    'secure_add_to_shipyard_queue',
    'secure_start_research',
    'secure_send_fleet',
    'join_acs_with_fleet'
  ];
  console.log('\n=== Final VIP Bonus Status ===');
  for (const fname of funcs) {
    const r3 = await c.query("SELECT prosrc FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace", [fname]);
    const s = r3.rows[0]?.prosrc || '';
    const hasVip = s.includes('is_user_plus') || s.includes('VIP Plus');
    console.log(`  ${fname}: ${hasVip ? '✅ VIP bonus present' : '❌ MISSING'}`);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
