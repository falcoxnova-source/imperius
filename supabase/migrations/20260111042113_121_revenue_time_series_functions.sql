/*
  # Revenue Time Series Functions
  
  Funciones para obtener ingresos agregados por periodos:
  - Diario (ultimos 30 dias)
  - Semanal (ultimas 12 semanas)  
  - Mensual (ultimos 12 meses)
  
  Usado para graficas en el Dashboard Financiero.
*/

-- Funcion: Ingresos diarios (ultimos 30 dias)
CREATE OR REPLACE FUNCTION get_daily_revenue(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'date', d.day::date,
            'amount', COALESCE(r.total, 0)
          )
          ORDER BY d.day
        )
        FROM generate_series(
          CURRENT_DATE - (p_days - 1),
          CURRENT_DATE,
          '1 day'::interval
        ) AS d(day)
        LEFT JOIN (
          SELECT DATE(created_at) as day, SUM(amount) as total
          FROM admin_revenue
          WHERE created_at >= CURRENT_DATE - p_days
          GROUP BY DATE(created_at)
        ) r ON d.day::date = r.day
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Funcion: Ingresos semanales (ultimas N semanas)
CREATE OR REPLACE FUNCTION get_weekly_revenue(p_weeks integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'week_start', w.week_start::date,
            'week_number', EXTRACT(WEEK FROM w.week_start),
            'amount', COALESCE(r.total, 0)
          )
          ORDER BY w.week_start
        )
        FROM generate_series(
          DATE_TRUNC('week', CURRENT_DATE) - ((p_weeks - 1) * INTERVAL '1 week'),
          DATE_TRUNC('week', CURRENT_DATE),
          '1 week'::interval
        ) AS w(week_start)
        LEFT JOIN (
          SELECT DATE_TRUNC('week', created_at) as week_start, SUM(amount) as total
          FROM admin_revenue
          WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE) - (p_weeks * INTERVAL '1 week')
          GROUP BY DATE_TRUNC('week', created_at)
        ) r ON w.week_start = r.week_start
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Funcion: Ingresos mensuales (ultimos N meses)
CREATE OR REPLACE FUNCTION get_monthly_revenue(p_months integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'month_start', m.month_start::date,
            'month', EXTRACT(MONTH FROM m.month_start),
            'year', EXTRACT(YEAR FROM m.month_start),
            'amount', COALESCE(r.total, 0)
          )
          ORDER BY m.month_start
        )
        FROM generate_series(
          DATE_TRUNC('month', CURRENT_DATE) - ((p_months - 1) * INTERVAL '1 month'),
          DATE_TRUNC('month', CURRENT_DATE),
          '1 month'::interval
        ) AS m(month_start)
        LEFT JOIN (
          SELECT DATE_TRUNC('month', created_at) as month_start, SUM(amount) as total
          FROM admin_revenue
          WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) - (p_months * INTERVAL '1 month')
          GROUP BY DATE_TRUNC('month', created_at)
        ) r ON m.month_start = r.month_start
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Funcion: Resumen de ingresos de hoy, esta semana, este mes
CREATE OR REPLACE FUNCTION get_revenue_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_today numeric;
  v_yesterday numeric;
  v_this_week numeric;
  v_last_week numeric;
  v_this_month numeric;
  v_last_month numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Hoy
  SELECT COALESCE(SUM(amount), 0) INTO v_today
  FROM admin_revenue
  WHERE DATE(created_at) = CURRENT_DATE;

  -- Ayer
  SELECT COALESCE(SUM(amount), 0) INTO v_yesterday
  FROM admin_revenue
  WHERE DATE(created_at) = CURRENT_DATE - 1;

  -- Esta semana
  SELECT COALESCE(SUM(amount), 0) INTO v_this_week
  FROM admin_revenue
  WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE);

  -- Semana pasada
  SELECT COALESCE(SUM(amount), 0) INTO v_last_week
  FROM admin_revenue
  WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '1 week'
    AND created_at < DATE_TRUNC('week', CURRENT_DATE);

  -- Este mes
  SELECT COALESCE(SUM(amount), 0) INTO v_this_month
  FROM admin_revenue
  WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE);

  -- Mes pasado
  SELECT COALESCE(SUM(amount), 0) INTO v_last_month
  FROM admin_revenue
  WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
    AND created_at < DATE_TRUNC('month', CURRENT_DATE);

  RETURN jsonb_build_object(
    'success', true,
    'today', v_today,
    'yesterday', v_yesterday,
    'today_change', CASE WHEN v_yesterday > 0 THEN ((v_today - v_yesterday) / v_yesterday * 100) ELSE 0 END,
    'this_week', v_this_week,
    'last_week', v_last_week,
    'week_change', CASE WHEN v_last_week > 0 THEN ((v_this_week - v_last_week) / v_last_week * 100) ELSE 0 END,
    'this_month', v_this_month,
    'last_month', v_last_month,
    'month_change', CASE WHEN v_last_month > 0 THEN ((v_this_month - v_last_month) / v_last_month * 100) ELSE 0 END
  );
END;
$$;
