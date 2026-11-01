import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

await c.query(`
CREATE OR REPLACE FUNCTION contribute_to_jackpot(
  p_amount numeric,
  p_source text,
  p_user_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expedition_amount numeric;
  v_monthly_amount numeric;
  v_plus_amount numeric;
  v_destruction_amount numeric;
  v_expedition_percent int;
  v_monthly_percent int;
  v_plus_percent int;
  v_destruction_percent int;
  v_new_total numeric;
BEGIN
  IF p_amount <= 0 THEN
    RETURN 0;
  END IF;

  SELECT expedition_percent, monthly_percent, plus_percent, destruction_percent
  INTO v_expedition_percent, v_monthly_percent, v_plus_percent, v_destruction_percent
  FROM jackpot_pools WHERE id = 1;

  IF v_expedition_percent IS NULL THEN
    v_expedition_percent := 20;
    v_monthly_percent := 20;
    v_plus_percent := 20;
    v_destruction_percent := 0;
  END IF;

  v_expedition_amount := FLOOR(p_amount * v_expedition_percent / 100);
  v_monthly_amount := FLOOR(p_amount * v_monthly_percent / 100);
  v_plus_amount := FLOOR(p_amount * v_plus_percent / 100);
  v_destruction_amount := FLOOR(p_amount * v_destruction_percent / 100);

  UPDATE jackpot_pools
  SET
    expedition_balance = expedition_balance + v_expedition_amount,
    expedition_total = expedition_total + v_expedition_amount,
    monthly_balance = monthly_balance + v_monthly_amount,
    monthly_total = monthly_total + v_monthly_amount,
    plus_balance = plus_balance + v_plus_amount,
    plus_total = plus_total + v_plus_amount,
    destruction_balance = destruction_balance + v_destruction_amount,
    destruction_total = destruction_total + v_destruction_amount,
    updated_at = now()
  WHERE id = 1;

  UPDATE jackpot
  SET
    balance = balance + p_amount,
    total_contributed = total_contributed + p_amount,
    updated_at = now()
  WHERE id = 1;

  SELECT expedition_balance + monthly_balance + plus_balance + destruction_balance
  INTO v_new_total
  FROM jackpot_pools WHERE id = 1;

  INSERT INTO jackpot_history (user_id, type, amount, source, jackpot_balance_after)
  VALUES (p_user_id, 'contribution', p_amount, p_source, v_new_total);

  RETURN v_new_total;
END;
$$;
`);

console.log('OK');
await c.end();
