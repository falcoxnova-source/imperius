/*
  # Fix: Plus USDT revenue not converted to FXU equivalent in weekly snapshots

  The admin_revenue table stores Plus USDT payments as raw USDT (e.g., 10 for $10),
  but the weekly snapshot functions treat all amounts as FXU. Only withdrawal_fee
  had USDT→FXU conversion (×10000). This adds the same conversion for
  plus_subscription paid in USDT (identified by description containing '(USDT)').

  Affects:
  - get_weekly_revenue_snapshots (live current week display)
  - take_weekly_revenue_snapshot (historical snapshot storage)
*/

-- Fix 1: get_weekly_revenue_snapshots
CREATE OR REPLACE FUNCTION get_weekly_revenue_snapshots(p_limit integer DEFAULT 52)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin boolean;
  v_snapshots jsonb;
  v_current_week_breakdown jsonb;
  v_current_week_total numeric;
  v_current_week_start date;
  v_current_week_end date;
  v_current_week_number integer;
  v_current_year integer;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_current_week_start := DATE_TRUNC('week', CURRENT_DATE)::date;
  v_current_week_end := (v_current_week_start + INTERVAL '6 days')::date;
  v_current_week_number := EXTRACT(WEEK FROM v_current_week_start);
  v_current_year := EXTRACT(YEAR FROM v_current_week_start);

  -- Calculate current week breakdown
  -- Convert USDT-denominated amounts to FXU equivalent (×10000)
  SELECT
    COALESCE(jsonb_object_agg(revenue_type, type_total), '{}'::jsonb),
    COALESCE(SUM(type_total), 0)
  INTO v_current_week_breakdown, v_current_week_total
  FROM (
    SELECT
      revenue_type,
      SUM(
        CASE
          WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000
          WHEN description LIKE '%(USDT)%' THEN amount * 10000
          ELSE amount
        END
      ) AS type_total
    FROM public.admin_revenue
    WHERE created_at >= v_current_week_start::timestamptz
      AND created_at < (v_current_week_end + INTERVAL '1 day')::timestamptz
    GROUP BY revenue_type
  ) sub;

  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.week_start DESC), '[]'::jsonb)
  INTO v_snapshots
  FROM (
    SELECT
      id,
      week_start,
      week_end,
      week_number,
      year,
      breakdown,
      total::float,
      created_at
    FROM public.weekly_revenue_snapshots
    ORDER BY week_start DESC
    LIMIT p_limit
  ) s;

  RETURN jsonb_build_object(
    'success', true,
    'current_week', jsonb_build_object(
      'week_start', v_current_week_start,
      'week_end', v_current_week_end,
      'week_number', v_current_week_number,
      'year', v_current_year,
      'breakdown', v_current_week_breakdown,
      'total', v_current_week_total::float,
      'is_current', true
    ),
    'snapshots', v_snapshots
  );
END;
$$;

-- Fix 2: take_weekly_revenue_snapshot
CREATE OR REPLACE FUNCTION take_weekly_revenue_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_week_start date;
  v_week_end date;
  v_week_number integer;
  v_year integer;
  v_breakdown jsonb;
  v_total numeric;
  v_existing_id uuid;
BEGIN
  v_week_start := DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 day')::date;
  v_week_end := (v_week_start + INTERVAL '6 days')::date;
  v_week_number := EXTRACT(WEEK FROM v_week_start);
  v_year := EXTRACT(YEAR FROM v_week_start);

  SELECT id INTO v_existing_id
  FROM public.weekly_revenue_snapshots
  WHERE week_start = v_week_start AND year = v_year;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Snapshot already exists for week ' || v_week_number || ' of ' || v_year
    );
  END IF;

  -- Aggregate with USDT-denominated amounts converted to FXU (×10000)
  SELECT
    COALESCE(jsonb_object_agg(revenue_type, type_total), '{}'::jsonb),
    COALESCE(SUM(type_total), 0)
  INTO v_breakdown, v_total
  FROM (
    SELECT
      revenue_type,
      SUM(
        CASE
          WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000
          WHEN description LIKE '%(USDT)%' THEN amount * 10000
          ELSE amount
        END
      ) AS type_total
    FROM public.admin_revenue
    WHERE created_at >= v_week_start::timestamptz
      AND created_at < (v_week_end + INTERVAL '1 day')::timestamptz
    GROUP BY revenue_type
  ) sub;

  INSERT INTO public.weekly_revenue_snapshots (week_start, week_end, week_number, year, breakdown, total)
  VALUES (v_week_start, v_week_end, v_week_number, v_year, v_breakdown, v_total);

  RETURN jsonb_build_object(
    'success', true,
    'week_start', v_week_start,
    'week_end', v_week_end,
    'week_number', v_week_number,
    'year', v_year,
    'total', v_total
  );
END;
$$;
