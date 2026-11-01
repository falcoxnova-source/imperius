-- =====================================================================
-- CRITICAL SECURITY FIX: Block queue exploits
-- =====================================================================

-- STEP 1: Drop old unsecured add_to_shipyard_queue RPC
-- (The frontend uses secure_add_to_shipyard_queue which IS secure)
DROP FUNCTION IF EXISTS add_to_shipyard_queue(uuid, text, integer, integer, integer);

-- STEP 2: Drop legacy start_research (unsecured)
DROP FUNCTION IF EXISTS start_research(uuid, integer);

-- STEP 3: Revoke direct INSERT on queue tables for authenticated users
-- (Secure RPC functions use SECURITY DEFINER and bypass this restriction)
DROP POLICY IF EXISTS "Users can insert to own building queues" ON building_queue;
DROP POLICY IF EXISTS "Users can insert to own planet shipyard queue" ON shipyard_queue;  
DROP POLICY IF EXISTS "Users can insert own research queue" ON research_queue;
