/*
  # Remove Defense from Market Listing Types

  1. Changes
    - Update market_listings listing_type constraint to only allow 'resource', 'ship', and 'dark_matter'
    - Defenses should NOT be tradeable in the market

  2. Security
    - No RLS changes needed
*/

-- Drop and recreate the constraint to remove defense option
ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_listing_type_check;

ALTER TABLE market_listings ADD CONSTRAINT market_listings_listing_type_check 
  CHECK (listing_type = ANY (ARRAY['resource'::text, 'ship'::text, 'dark_matter'::text]));
