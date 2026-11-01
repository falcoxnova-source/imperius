/*
  # Weekly Revenue Snapshots System

  1. New Tables
    - `weekly_revenue_snapshots`
      - `id` (uuid, primary key)
      - `week_start` (date, start of the week - Monday)
      - `week_end` (date, end of the week - Sunday)
      - `week_number` (integer, ISO week number)
      - `year` (integer, year)
      - `breakdown` (jsonb, revenue by type e.g. {"market_fee": 1234, "swap_fee": 567})
      - `total` (numeric, total revenue for the week)
      - `created_at` (timestamptz)

  2. New Functions
    - `take_weekly_revenue_snapshot()` - Takes a snapshot of the previous week's revenue
    - `get_weekly_revenue_snapshots(p_limit)` - Returns weekly snapshots for admin view
    - `admin_take_weekly_snapshot_now()` - Allows admin to manually trigger a snapshot

  3. Security
    - RLS enabled on `weekly_revenue_snapshots`
    - Only admins can SELECT
    - Cron job runs every Monday at 00:05 UTC to capture the previous week

  4. Notes
    - This is purely additive - no existing tables or functions are modified
    - Snapshots are permanent records that never get deleted
    - Each snapshot captures the full breakdown by revenue type for that week
*/

CREATE TABLE IF NOT EXISTS weekly_revenue_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  week_end date NOT NULL,
  week_number integer NOT NULL,
  year integer NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  total numeric(20,8) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_week_year UNIQUE (week_start, year)
);

CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_year ON weekly_revenue_snapshots(year DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_week_start ON weekly_revenue_snapshots(week_start DESC);

ALTER TABLE weekly_revenue_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view weekly snapshots"
  ON weekly_revenue_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE OR REPLACE FUNCTION take_weekly_revenue_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  FROM weekly_revenue_snapshots
  WHERE week_start = v_week_start AND year = v_year;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Snapshot already exists for week ' || v_week_number || ' of ' || v_year
    );
  END IF;

  SELECT
    COALESCE(jsonb_object_agg(revenue_type, type_total), '{}'::jsonb),
    COALESCE(SUM(type_total), 0)
  INTO v_breakdown, v_total
  FROM (
    SELECT
      revenue_type,
      SUM(amount) AS type_total
    FROM admin_revenue
    WHERE created_at >= v_week_start::timestamptz
      AND created_at < (v_week_end + INTERVAL '1 day')::timestamptz
    GROUP BY revenue_type
  ) sub;

  INSERT INTO weekly_revenue_snapshots (week_start, week_end, week_number, year, breakdown, total)
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

CREATE OR REPLACE FUNCTION get_weekly_revenue_snapshots(p_limit integer DEFAULT 52)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_current_week_start := DATE_TRUNC('week', CURRENT_DATE)::date;
  v_current_week_end := (v_current_week_start + INTERVAL '6 days')::date;
  v_current_week_number := EXTRACT(WEEK FROM v_current_week_start);
  v_current_year := EXTRACT(YEAR FROM v_current_week_start);

  SELECT
    COALESCE(jsonb_object_agg(revenue_type, type_total), '{}'::jsonb),
    COALESCE(SUM(type_total), 0)
  INTO v_current_week_breakdown, v_current_week_total
  FROM (
    SELECT
      revenue_type,
      SUM(amount) AS type_total
    FROM admin_revenue
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
    FROM weekly_revenue_snapshots
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

CREATE OR REPLACE FUNCTION admin_take_weekly_snapshot_now()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  RETURN take_weekly_revenue_snapshot();
END;
$$;

SELECT cron.schedule(
  'weekly-revenue-snapshot',
  '5 0 * * 1',
  $$SELECT take_weekly_revenue_snapshot()$$
);
