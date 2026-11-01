/*
  # Fix espionage function ambiguity

  ## Problem
  There were two versions of generate_espionage_report causing ambiguity:
  - (uuid, uuid, uuid) - old version
  - (uuid, uuid, uuid, integer) - new version with probe count

  ## Solution
  Drop the old 3-parameter version, keep only the 4-parameter version with DEFAULT
*/

DROP FUNCTION IF EXISTS generate_espionage_report(uuid, uuid, uuid);

GRANT EXECUTE ON FUNCTION generate_espionage_report(uuid, uuid, uuid, integer) TO authenticated;
