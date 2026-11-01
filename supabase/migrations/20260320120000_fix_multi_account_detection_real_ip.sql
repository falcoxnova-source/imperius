/*
  # Fix Multi-Account Detection - Capture Real IP

  PROBLEM: The multi-account detection system isn't working because:
  1. The IP address was always being passed as 'client' (hardcoded string)
  2. The real IP was never being captured from request headers

  FIX:
  1. Modify log_login_session to extract real IP from request headers
  2. Use Supabase's current_setting to get client IP from request
  3. Fallback chain: X-Forwarded-For -> X-Real-IP -> parameter -> 'unknown'

  This enables the system to properly detect users sharing IPs.
*/

CREATE OR REPLACE FUNCTION log_login_session(
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL,
  p_country_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real_ip text;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Try to get real IP from request headers (Supabase passes these)
  BEGIN
    -- X-Forwarded-For contains the original client IP when behind proxy/load balancer
    v_real_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
    
    -- X-Forwarded-For can contain multiple IPs, take the first one (original client)
    IF v_real_ip IS NOT NULL AND v_real_ip LIKE '%,%' THEN
      v_real_ip := split_part(v_real_ip, ',', 1);
    END IF;
    
    -- Fallback to X-Real-IP if X-Forwarded-For not available
    IF v_real_ip IS NULL OR v_real_ip = '' THEN
      v_real_ip := current_setting('request.headers', true)::json->>'x-real-ip';
    END IF;
    
    -- Fallback to CF-Connecting-IP (Cloudflare)
    IF v_real_ip IS NULL OR v_real_ip = '' THEN
      v_real_ip := current_setting('request.headers', true)::json->>'cf-connecting-ip';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_real_ip := NULL;
  END;

  -- Final fallback: use parameter if provided and valid, otherwise 'unknown'
  IF v_real_ip IS NULL OR v_real_ip = '' OR v_real_ip = 'client' THEN
    IF p_ip_address IS NOT NULL AND p_ip_address != '' AND p_ip_address != 'client' THEN
      v_real_ip := p_ip_address;
    ELSE
      v_real_ip := 'unknown';
    END IF;
  END IF;

  -- Trim whitespace
  v_real_ip := TRIM(v_real_ip);

  INSERT INTO login_sessions (user_id, ip_address, user_agent, fingerprint, country_code)
  VALUES (v_user_id, v_real_ip, p_user_agent, p_fingerprint, p_country_code);
END;
$$;

-- Also improve fingerprint detection by ensuring it's stored properly
-- Add an index on fingerprint+user_id for faster lookups if not exists
CREATE INDEX IF NOT EXISTS idx_login_sessions_fingerprint_user 
ON login_sessions(fingerprint, user_id) 
WHERE fingerprint IS NOT NULL AND fingerprint != '';

-- Reindex existing sessions that have 'client' as IP (mark them for re-detection)
-- We can't recover the real IP for old sessions, but at least new ones will work
COMMENT ON FUNCTION log_login_session IS 
'Logs user login sessions with real IP detection for multi-account analysis. 
IP is extracted from request headers (X-Forwarded-For, X-Real-IP, CF-Connecting-IP).';
