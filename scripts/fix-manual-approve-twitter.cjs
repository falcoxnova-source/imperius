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
  console.log('Connected\n');

  await c.query(`
CREATE OR REPLACE FUNCTION admin_manual_approve_twitter_action(
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_action record;
BEGIN
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT * INTO v_action
  FROM twitter_actions
  WHERE id = p_action_id;

  IF v_action IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accion no encontrada');
  END IF;

  IF v_action.validated THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya estaba aprobada', 'already_validated', true);
  END IF;

  UPDATE twitter_actions
  SET validated = true
  WHERE id = p_action_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Aprobado manualmente',
    'username', (SELECT username FROM profiles WHERE id = v_action.user_id),
    'points', v_action.points_awarded
  );
END;
$$;
  `);

  console.log('✅ admin_manual_approve_twitter_action FIXED');
  console.log('   - admin_users → profiles (is_admin)');
  console.log('   - twitter_user_actions → twitter_actions');
  console.log('   - is_validated → validated');
  console.log('   - Removed social_statistics (no existe)');
  console.log('   - Removed validated_at (no existe)');

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
