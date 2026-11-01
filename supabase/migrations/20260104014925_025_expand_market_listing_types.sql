/*
  # Expand Market Listing Types

  1. Changes
    - Update market_listings listing_type constraint to allow 'dark_matter' and 'defense'
    - This enables players to trade dark matter and defensive structures

  2. Security
    - No RLS changes needed - existing policies apply
*/

-- Drop and recreate the constraint to allow new listing types
ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_listing_type_check;

ALTER TABLE market_listings ADD CONSTRAINT market_listings_listing_type_check 
  CHECK (listing_type = ANY (ARRAY['resource'::text, 'ship'::text, 'dark_matter'::text, 'defense'::text]));
