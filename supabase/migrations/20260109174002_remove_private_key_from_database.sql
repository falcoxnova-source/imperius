/*
  # Security Fix: Remove Private Key from Database
  
  1. Changes
    - Remove the server_private_key column from wallet_config table
    - Private keys should ONLY be stored in Supabase Edge Function secrets
    
  2. Security
    - This prevents the private key from being exposed through SQL injection
    - Prevents exposure through database backups
    - Follows security best practices
*/

-- First clear any existing private key data
UPDATE wallet_config SET server_private_key = NULL WHERE server_private_key IS NOT NULL;

-- Then drop the column entirely
ALTER TABLE wallet_config DROP COLUMN IF EXISTS server_private_key;
