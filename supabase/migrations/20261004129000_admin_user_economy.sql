-- [USERECON1] Admin: economia completa de un usuario (solo lectura, solo admin)
SET client_encoding TO 'UTF8';

CREATE OR REPLACE FUNCTION public.admin_user_economy(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile jsonb;
  v_totals jsonb;
  v_deposit_wallets jsonb;
  v_withdraw_wallets jsonb;
  v_assigned jsonb;
  v_txs jsonb;
  v_ledger jsonb;
  v_ledger_recent jsonb;
  v_p2p jsonb;
  v_refs jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'email', COALESCE(p.email, u.email),
    'tung_balance', COALESCE(p.fxu_balance, 0),
    'usdt_balance', COALESCE(p.usdt_balance, 0),
    'created_at', p.created_at,
    'last_activity', p.last_activity,
    'is_banned', COALESCE(p.is_banned, false),
    'is_admin', COALESCE(p.is_admin, false),
    'kyc_status', p.kyc_status,
    'referred_by', r.username
  ) INTO v_profile
  FROM profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN profiles r ON r.id = p.referred_by
  WHERE p.id = p_user_id;

  SELECT jsonb_build_object(
    'dep_tung',      COALESCE(SUM(amount) FILTER (WHERE tx_type='deposit' AND status='confirmed' AND token_type='TUNG'),0),
    'dep_tung_count',COUNT(*) FILTER (WHERE tx_type='deposit' AND status='confirmed' AND token_type='TUNG'),
    'dep_tung_offchain', COALESCE(SUM(amount) FILTER (WHERE tx_type='deposit' AND status='confirmed' AND token_type='TUNG' AND wallet_address NOT ILIKE '0x%'),0),
    'dep_usdt',      COALESCE(SUM(amount) FILTER (WHERE tx_type='deposit' AND status='confirmed' AND token_type='USDT'),0),
    'dep_usdt_count',COUNT(*) FILTER (WHERE tx_type='deposit' AND status='confirmed' AND token_type='USDT'),
    'wd_tung_net',   COALESCE(SUM(amount) FILTER (WHERE tx_type='withdrawal' AND status='confirmed' AND token_type='TUNG'),0),
    'wd_tung_gross', COALESCE(SUM(COALESCE(fxu_amount, amount)) FILTER (WHERE tx_type='withdrawal' AND status='confirmed' AND token_type='TUNG'),0),
    'wd_tung_count', COUNT(*) FILTER (WHERE tx_type='withdrawal' AND status='confirmed' AND token_type='TUNG'),
    'wd_usdt_net',   COALESCE(SUM(amount) FILTER (WHERE tx_type='withdrawal' AND status='confirmed' AND token_type='USDT'),0),
    'wd_usdt_gross', COALESCE(SUM(COALESCE(fxu_amount, amount)) FILTER (WHERE tx_type='withdrawal' AND status='confirmed' AND token_type='USDT'),0),
    'wd_usdt_count', COUNT(*) FILTER (WHERE tx_type='withdrawal' AND status='confirmed' AND token_type='USDT'),
    'failed_count',  COUNT(*) FILTER (WHERE status='failed'),
    'failed_amount', COALESCE(SUM(COALESCE(fxu_amount, amount)) FILTER (WHERE status='failed'),0),
    'first_tx_at',   MIN(created_at),
    'last_tx_at',    MAX(created_at)
  ) INTO v_totals
  FROM wallet_transactions WHERE user_id = p_user_id;

  -- Direcciones de deposito asignadas al usuario (hijas HD)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('address', address, 'created_at', created_at) ORDER BY created_at), '[]'::jsonb)
    INTO v_assigned
  FROM deposit_addresses WHERE user_id = p_user_id;

  -- Depositos agrupados por la direccion registrada (hija asignada o wallet origen en depositos antiguos)
  SELECT COALESCE(jsonb_agg(w ORDER BY (w->>'total_tung')::numeric DESC, (w->>'total_usdt')::numeric DESC), '[]'::jsonb)
    INTO v_deposit_wallets
  FROM (
    SELECT jsonb_build_object(
      'address', wt.wallet_address,
      'is_assigned', EXISTS (SELECT 1 FROM deposit_addresses d WHERE lower(d.address) = lower(wt.wallet_address)),
      'count', COUNT(*),
      'total_tung', COALESCE(SUM(wt.amount) FILTER (WHERE wt.token_type='TUNG'),0),
      'total_usdt', COALESCE(SUM(wt.amount) FILTER (WHERE wt.token_type='USDT'),0),
      'first_at', MIN(wt.created_at),
      'last_at', MAX(wt.created_at)
    ) AS w
    FROM wallet_transactions wt
    WHERE wt.user_id = p_user_id AND wt.tx_type = 'deposit' AND wt.status = 'confirmed'
    GROUP BY wt.wallet_address
  ) s;

  -- Wallets destino de retiros + otros usuarios que retiraron a la misma wallet
  SELECT COALESCE(jsonb_agg(w ORDER BY (w->>'total_tung')::numeric DESC, (w->>'total_usdt')::numeric DESC), '[]'::jsonb)
    INTO v_withdraw_wallets
  FROM (
    SELECT jsonb_build_object(
      'address', g.addr,
      'count', g.cnt,
      'total_tung', g.t_tung,
      'total_usdt', g.t_usdt,
      'fees_tung', g.f_tung,
      'failed', g.failed,
      'first_at', g.first_at,
      'last_at', g.last_at,
      'shared_with', COALESCE((
        SELECT jsonb_agg(DISTINCT op.username)
        FROM wallet_transactions o
        JOIN profiles op ON op.id = o.user_id
        WHERE lower(o.wallet_address) = lower(g.addr)
          AND o.user_id <> p_user_id
      ), '[]'::jsonb)
    ) AS w
    FROM (
      SELECT wt.wallet_address AS addr,
             COUNT(*) FILTER (WHERE wt.status='confirmed') AS cnt,
             COALESCE(SUM(wt.amount) FILTER (WHERE wt.status='confirmed' AND wt.token_type='TUNG'),0) AS t_tung,
             COALESCE(SUM(wt.amount) FILTER (WHERE wt.status='confirmed' AND wt.token_type='USDT'),0) AS t_usdt,
             COALESCE(SUM(COALESCE(wt.fxu_amount, wt.amount) - wt.amount) FILTER (WHERE wt.status='confirmed' AND wt.token_type='TUNG'),0) AS f_tung,
             COUNT(*) FILTER (WHERE wt.status='failed') AS failed,
             MIN(wt.created_at) AS first_at,
             MAX(wt.created_at) AS last_at
      FROM wallet_transactions wt
      WHERE wt.user_id = p_user_id AND wt.tx_type = 'withdrawal'
      GROUP BY wt.wallet_address
    ) g
  ) s;

  -- Movimientos on-chain (ultimos 300)
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'created_at') DESC), '[]'::jsonb) INTO v_txs
  FROM (
    SELECT jsonb_build_object(
      'id', wt.id,
      'tx_type', wt.tx_type,
      'token', COALESCE(wt.token_type, 'TUNG'),
      'amount', wt.amount,
      'gross', COALESCE(wt.fxu_amount, wt.amount),
      'status', wt.status,
      'wallet', wt.wallet_address,
      'tx_hash', wt.tx_hash,
      'contract_tx_hash', wt.contract_tx_hash,
      'error', wt.error_message,
      'created_at', wt.created_at
    ) AS t
    FROM wallet_transactions wt
    WHERE wt.user_id = p_user_id
    ORDER BY wt.created_at DESC
    LIMIT 300
  ) s;

  -- Economia interna (fxu_ledger) por categoria
  SELECT COALESCE(jsonb_agg(c ORDER BY abs((c->>'income')::numeric) + abs((c->>'spent')::numeric) DESC), '[]'::jsonb) INTO v_ledger
  FROM (
    SELECT jsonb_build_object(
      'category', COALESCE(category, 'sin_categoria'),
      'income', COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0),
      'spent',  COALESCE(-SUM(delta) FILTER (WHERE delta < 0), 0),
      'count', COUNT(*),
      'last_at', MAX(created_at)
    ) AS c
    FROM fxu_ledger
    WHERE user_id = p_user_id
    GROUP BY COALESCE(category, 'sin_categoria')
  ) s;

  SELECT COALESCE(jsonb_agg(l ORDER BY (l->>'id')::bigint DESC), '[]'::jsonb) INTO v_ledger_recent
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'delta', delta,
      'balance_after', balance_after,
      'category', category,
      'description', description,
      'created_at', created_at
    ) AS l
    FROM fxu_ledger
    WHERE user_id = p_user_id
    ORDER BY id DESC
    LIMIT 100
  ) s;

  -- P2P (como comprador y vendedor)
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_p2p
  FROM (
    SELECT jsonb_build_object(
      'role', CASE WHEN o.seller_id = p_user_id THEN 'seller' ELSE 'buyer' END,
      'asset', o.asset,
      'status', o.status,
      'count', COUNT(*),
      'asset_amount', COALESCE(SUM(o.asset_amount),0),
      'fiat_amount', COALESCE(SUM(o.fiat_amount),0),
      'fiat_currency', MIN(o.fiat_currency)
    ) AS x
    FROM p2p_orders o
    WHERE o.seller_id = p_user_id OR o.buyer_id = p_user_id
    GROUP BY CASE WHEN o.seller_id = p_user_id THEN 'seller' ELSE 'buyer' END, o.asset, o.status
  ) s;

  SELECT jsonb_build_object(
    'earned_tung', COALESCE(SUM(fxu_amount) FILTER (WHERE COALESCE(resource_type,'fxu') = 'fxu'),0),
    'earned_usdt', COALESCE(SUM(fxu_amount) FILTER (WHERE resource_type = 'usdt'),0),
    'count', COUNT(*),
    'referrals', (SELECT COUNT(*) FROM profiles WHERE referred_by = p_user_id)
  ) INTO v_refs
  FROM referral_commissions WHERE referrer_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'generated_at', now(),
    'profile', v_profile,
    'totals', v_totals,
    'assigned_addresses', v_assigned,
    'deposit_wallets', v_deposit_wallets,
    'withdraw_wallets', v_withdraw_wallets,
    'transactions', v_txs,
    'ledger_by_category', v_ledger,
    'ledger_recent', v_ledger_recent,
    'p2p', v_p2p,
    'referrals', v_refs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_economy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_economy(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
