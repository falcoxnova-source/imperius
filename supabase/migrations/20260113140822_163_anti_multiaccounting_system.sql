/*
  # Sistema Anti-Multicuentas
  
  Sistema de deteccion de multicuentas que NO bloquea automaticamente,
  solo detecta patrones sospechosos y los marca para revision del admin.
  
  1. Nuevas Tablas:
    - `login_sessions`: Registra cada login con IP, fingerprint, user agent
    - `suspicious_accounts`: Cuentas marcadas como sospechosas con evidencia
    - `account_interaction_log`: Log de interacciones entre cuentas (transporte, market)
    - `multiaccounting_reports`: Reportes de la comunidad
  
  2. Funciones:
    - `log_login_session`: Registra cada login
    - `analyze_suspicious_patterns`: Analiza patrones y marca sospechosos
    - `get_shared_ip_accounts`: Obtiene cuentas con IPs compartidas
    - `get_suspicious_interactions`: Obtiene interacciones unidireccionales sospechosas
    - `submit_multiaccounting_report`: Para reportes de jugadores
  
  3. Seguridad:
    - RLS en todas las tablas
    - Solo admins pueden ver datos sensibles
    - Jugadores solo pueden crear reportes
*/

-- Login sessions table
CREATE TABLE IF NOT EXISTS login_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address text NOT NULL,
  user_agent text,
  fingerprint text,
  country_code text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_ip_address ON login_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_sessions_fingerprint ON login_sessions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_login_sessions_created_at ON login_sessions(created_at DESC);

ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all login sessions"
  ON login_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "System can insert login sessions"
  ON login_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Suspicious accounts table
CREATE TABLE IF NOT EXISTS suspicious_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  linked_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  suspicion_type text NOT NULL CHECK (suspicion_type IN ('shared_ip', 'shared_fingerprint', 'unidirectional_transfers', 'same_device', 'timing_pattern')),
  evidence jsonb DEFAULT '{}',
  severity text DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_reviewed boolean DEFAULT false,
  reviewed_by uuid REFERENCES profiles(id),
  review_notes text,
  reviewed_at timestamptz,
  is_confirmed_multi boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, linked_user_id, suspicion_type)
);

CREATE INDEX IF NOT EXISTS idx_suspicious_accounts_user_id ON suspicious_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_accounts_linked_user_id ON suspicious_accounts(linked_user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_accounts_is_reviewed ON suspicious_accounts(is_reviewed);
CREATE INDEX IF NOT EXISTS idx_suspicious_accounts_severity ON suspicious_accounts(severity);

ALTER TABLE suspicious_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view suspicious accounts"
  ON suspicious_accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can update suspicious accounts"
  ON suspicious_accounts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "System can insert suspicious accounts"
  ON suspicious_accounts FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Account interaction log (for tracking resource transfers)
CREATE TABLE IF NOT EXISTS account_interaction_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interaction_type text NOT NULL CHECK (interaction_type IN ('transport', 'market_sale', 'attack', 'espionage')),
  metal_amount numeric DEFAULT 0,
  crystal_amount numeric DEFAULT 0,
  deuterium_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interaction_log_from_user ON account_interaction_log(from_user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_log_to_user ON account_interaction_log(to_user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_log_type ON account_interaction_log(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interaction_log_created_at ON account_interaction_log(created_at DESC);

ALTER TABLE account_interaction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view interaction log"
  ON account_interaction_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "System can insert interaction log"
  ON account_interaction_log FOR INSERT
  TO authenticated
  WITH CHECK (from_user_id = auth.uid());

-- Multiaccounting reports from players
CREATE TABLE IF NOT EXISTS multiaccounting_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  suspected_linked_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  evidence_description text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'confirmed', 'dismissed')),
  reviewed_by uuid REFERENCES profiles(id),
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON multiaccounting_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON multiaccounting_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON multiaccounting_reports(status);

ALTER TABLE multiaccounting_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can create reports"
  ON multiaccounting_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Players can view their own reports"
  ON multiaccounting_reports FOR SELECT
  TO authenticated
  USING (
    reporter_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can update reports"
  ON multiaccounting_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Function to log login session
CREATE OR REPLACE FUNCTION log_login_session(
  p_ip_address text,
  p_user_agent text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL,
  p_country_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO login_sessions (user_id, ip_address, user_agent, fingerprint, country_code)
  VALUES (auth.uid(), p_ip_address, p_user_agent, p_fingerprint, p_country_code);
END;
$$;

-- Function to log interactions between accounts
CREATE OR REPLACE FUNCTION log_account_interaction(
  p_to_user_id uuid,
  p_interaction_type text,
  p_metal numeric DEFAULT 0,
  p_crystal numeric DEFAULT 0,
  p_deuterium numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_to_user_id IS NOT NULL AND p_to_user_id != auth.uid() THEN
    INSERT INTO account_interaction_log (from_user_id, to_user_id, interaction_type, metal_amount, crystal_amount, deuterium_amount)
    VALUES (auth.uid(), p_to_user_id, p_interaction_type, p_metal, p_crystal, p_deuterium);
  END IF;
END;
$$;

-- Function to get accounts sharing IPs (for admin)
CREATE OR REPLACE FUNCTION get_shared_ip_accounts()
RETURNS TABLE (
  ip_address text,
  user_count bigint,
  users jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    ls.ip_address,
    COUNT(DISTINCT ls.user_id) as user_count,
    jsonb_agg(DISTINCT jsonb_build_object(
      'user_id', ls.user_id,
      'username', p.username,
      'last_login', MAX(ls.created_at)
    )) as users
  FROM login_sessions ls
  JOIN profiles p ON p.id = ls.user_id
  WHERE ls.created_at > now() - interval '30 days'
  GROUP BY ls.ip_address
  HAVING COUNT(DISTINCT ls.user_id) > 1
  ORDER BY user_count DESC
  LIMIT 100;
END;
$$;

-- Function to get accounts sharing fingerprints (for admin)
CREATE OR REPLACE FUNCTION get_shared_fingerprint_accounts()
RETURNS TABLE (
  fingerprint text,
  user_count bigint,
  users jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    ls.fingerprint,
    COUNT(DISTINCT ls.user_id) as user_count,
    jsonb_agg(DISTINCT jsonb_build_object(
      'user_id', ls.user_id,
      'username', p.username,
      'last_login', MAX(ls.created_at)
    )) as users
  FROM login_sessions ls
  JOIN profiles p ON p.id = ls.user_id
  WHERE ls.fingerprint IS NOT NULL 
    AND ls.fingerprint != ''
    AND ls.created_at > now() - interval '30 days'
  GROUP BY ls.fingerprint
  HAVING COUNT(DISTINCT ls.user_id) > 1
  ORDER BY user_count DESC
  LIMIT 100;
END;
$$;

-- Function to get suspicious unidirectional transfers
CREATE OR REPLACE FUNCTION get_suspicious_interactions()
RETURNS TABLE (
  from_user_id uuid,
  from_username text,
  to_user_id uuid,
  to_username text,
  total_sent_metal numeric,
  total_sent_crystal numeric,
  total_sent_deuterium numeric,
  total_received_metal numeric,
  total_received_crystal numeric,
  total_received_deuterium numeric,
  transfer_count bigint,
  suspicion_score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  WITH sent AS (
    SELECT 
      ail.from_user_id,
      ail.to_user_id,
      SUM(ail.metal_amount) as total_metal,
      SUM(ail.crystal_amount) as total_crystal,
      SUM(ail.deuterium_amount) as total_deuterium,
      COUNT(*) as cnt
    FROM account_interaction_log ail
    WHERE ail.interaction_type = 'transport'
      AND ail.created_at > now() - interval '30 days'
    GROUP BY ail.from_user_id, ail.to_user_id
  ),
  received AS (
    SELECT 
      ail.to_user_id as from_user_id,
      ail.from_user_id as to_user_id,
      SUM(ail.metal_amount) as total_metal,
      SUM(ail.crystal_amount) as total_crystal,
      SUM(ail.deuterium_amount) as total_deuterium
    FROM account_interaction_log ail
    WHERE ail.interaction_type = 'transport'
      AND ail.created_at > now() - interval '30 days'
    GROUP BY ail.to_user_id, ail.from_user_id
  )
  SELECT 
    s.from_user_id,
    p1.username as from_username,
    s.to_user_id,
    p2.username as to_username,
    s.total_metal as total_sent_metal,
    s.total_crystal as total_sent_crystal,
    s.total_deuterium as total_sent_deuterium,
    COALESCE(r.total_metal, 0) as total_received_metal,
    COALESCE(r.total_crystal, 0) as total_received_crystal,
    COALESCE(r.total_deuterium, 0) as total_received_deuterium,
    s.cnt as transfer_count,
    CASE 
      WHEN COALESCE(r.total_metal, 0) + COALESCE(r.total_crystal, 0) + COALESCE(r.total_deuterium, 0) = 0 
      THEN 100
      ELSE ROUND(
        (s.total_metal + s.total_crystal + s.total_deuterium) / 
        NULLIF(COALESCE(r.total_metal, 0) + COALESCE(r.total_crystal, 0) + COALESCE(r.total_deuterium, 0), 0) * 10,
        2
      )
    END as suspicion_score
  FROM sent s
  JOIN profiles p1 ON p1.id = s.from_user_id
  JOIN profiles p2 ON p2.id = s.to_user_id
  LEFT JOIN received r ON r.from_user_id = s.from_user_id AND r.to_user_id = s.to_user_id
  WHERE s.cnt >= 3
  ORDER BY suspicion_score DESC NULLS LAST
  LIMIT 100;
END;
$$;

-- Function to submit a multiaccounting report
CREATE OR REPLACE FUNCTION submit_multiaccounting_report(
  p_reported_user_id uuid,
  p_suspected_linked_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT '',
  p_evidence_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF p_reported_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot report yourself');
  END IF;
  
  IF p_suspected_linked_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot report yourself');
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM multiaccounting_reports
    WHERE reporter_id = auth.uid()
      AND reported_user_id = p_reported_user_id
      AND status = 'pending'
      AND created_at > now() - interval '7 days'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have a pending report for this player');
  END IF;
  
  INSERT INTO multiaccounting_reports (
    reporter_id,
    reported_user_id,
    suspected_linked_user_id,
    reason,
    evidence_description
  ) VALUES (
    auth.uid(),
    p_reported_user_id,
    p_suspected_linked_user_id,
    p_reason,
    p_evidence_description
  )
  RETURNING id INTO v_report_id;
  
  RETURN jsonb_build_object('success', true, 'report_id', v_report_id);
END;
$$;

-- Function to review a report (admin only)
CREATE OR REPLACE FUNCTION review_multiaccounting_report(
  p_report_id uuid,
  p_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  UPDATE multiaccounting_reports
  SET 
    status = p_status,
    review_notes = p_review_notes,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = p_report_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to mark/unmark suspicious account (admin only)
CREATE OR REPLACE FUNCTION update_suspicious_account(
  p_suspicious_id uuid,
  p_is_reviewed boolean DEFAULT NULL,
  p_is_confirmed_multi boolean DEFAULT NULL,
  p_review_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  UPDATE suspicious_accounts
  SET 
    is_reviewed = COALESCE(p_is_reviewed, is_reviewed),
    is_confirmed_multi = COALESCE(p_is_confirmed_multi, is_confirmed_multi),
    review_notes = COALESCE(p_review_notes, review_notes),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_suspicious_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to get anti-multi dashboard stats (admin only)
CREATE OR REPLACE FUNCTION get_anti_multi_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  SELECT jsonb_build_object(
    'shared_ips_count', (
      SELECT COUNT(*) FROM (
        SELECT ip_address FROM login_sessions
        WHERE created_at > now() - interval '30 days'
        GROUP BY ip_address
        HAVING COUNT(DISTINCT user_id) > 1
      ) x
    ),
    'shared_fingerprints_count', (
      SELECT COUNT(*) FROM (
        SELECT fingerprint FROM login_sessions
        WHERE fingerprint IS NOT NULL AND fingerprint != ''
          AND created_at > now() - interval '30 days'
        GROUP BY fingerprint
        HAVING COUNT(DISTINCT user_id) > 1
      ) x
    ),
    'pending_reports', (
      SELECT COUNT(*) FROM multiaccounting_reports WHERE status = 'pending'
    ),
    'confirmed_multis', (
      SELECT COUNT(*) FROM suspicious_accounts WHERE is_confirmed_multi = true
    ),
    'unreviewed_suspicious', (
      SELECT COUNT(*) FROM suspicious_accounts WHERE is_reviewed = false
    ),
    'total_logins_today', (
      SELECT COUNT(*) FROM login_sessions WHERE created_at > now() - interval '1 day'
    ),
    'unique_users_today', (
      SELECT COUNT(DISTINCT user_id) FROM login_sessions WHERE created_at > now() - interval '1 day'
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Automatic detection trigger: when a login comes from an IP that has other users
CREATE OR REPLACE FUNCTION check_login_for_multiaccount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_user_id uuid;
  v_other_username text;
BEGIN
  FOR v_other_user_id, v_other_username IN
    SELECT DISTINCT ls.user_id, p.username
    FROM login_sessions ls
    JOIN profiles p ON p.id = ls.user_id
    WHERE ls.ip_address = NEW.ip_address
      AND ls.user_id != NEW.user_id
      AND ls.created_at > now() - interval '30 days'
    LIMIT 5
  LOOP
    INSERT INTO suspicious_accounts (
      user_id, 
      linked_user_id, 
      suspicion_type, 
      evidence,
      severity
    )
    VALUES (
      NEW.user_id,
      v_other_user_id,
      'shared_ip',
      jsonb_build_object(
        'ip_address', NEW.ip_address,
        'detected_at', now(),
        'other_username', v_other_username
      ),
      'medium'
    )
    ON CONFLICT (user_id, linked_user_id, suspicion_type) 
    DO UPDATE SET 
      evidence = suspicious_accounts.evidence || jsonb_build_object('last_seen', now()),
      updated_at = now();
  END LOOP;
  
  IF NEW.fingerprint IS NOT NULL AND NEW.fingerprint != '' THEN
    FOR v_other_user_id, v_other_username IN
      SELECT DISTINCT ls.user_id, p.username
      FROM login_sessions ls
      JOIN profiles p ON p.id = ls.user_id
      WHERE ls.fingerprint = NEW.fingerprint
        AND ls.user_id != NEW.user_id
        AND ls.created_at > now() - interval '30 days'
      LIMIT 5
    LOOP
      INSERT INTO suspicious_accounts (
        user_id, 
        linked_user_id, 
        suspicion_type, 
        evidence,
        severity
      )
      VALUES (
        NEW.user_id,
        v_other_user_id,
        'shared_fingerprint',
        jsonb_build_object(
          'fingerprint', NEW.fingerprint,
          'detected_at', now(),
          'other_username', v_other_username
        ),
        'high'
      )
      ON CONFLICT (user_id, linked_user_id, suspicion_type) 
      DO UPDATE SET 
        evidence = suspicious_accounts.evidence || jsonb_build_object('last_seen', now()),
        updated_at = now(),
        severity = 'high';
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_check_login_multiaccount
  AFTER INSERT ON login_sessions
  FOR EACH ROW
  EXECUTE FUNCTION check_login_for_multiaccount();
