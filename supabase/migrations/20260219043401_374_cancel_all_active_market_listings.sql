/*
  # Cancel All Active Market Listings

  ## Summary
  Cancels ALL currently active market listings (resources, ships, and dark matter)
  so that all sellers must re-list under the new market rules with minimum prices
  and monthly limits.

  ## Changes
  - Cancels all active resource listings
  - Cancels all active ship listings
  - Cancels all active dark_matter listings
  - Returns dark matter to sellers who had active dark_matter listings

  ## Important Notes
  - Resource and ship listings already keep items on the planet, so no return needed
  - Dark matter listings deducted DM on creation, so it must be returned
*/

-- Return dark matter to sellers who have active dark_matter listings
UPDATE profiles
SET dark_matter = dark_matter + ml.quantity
FROM market_listings ml
WHERE ml.seller_id = profiles.id
  AND ml.status = 'active'
  AND ml.listing_type = 'dark_matter';

-- Cancel ALL active listings
UPDATE market_listings
SET status = 'cancelled', updated_at = now()
WHERE status = 'active';
