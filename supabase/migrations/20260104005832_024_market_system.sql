/*
  # Market System and FXU Currency

  1. New Columns in `profiles`
    - `fxu_balance` (numeric) - User's FXU governance token balance

  2. New Tables
    - `market_listings`
      - `id` (uuid, primary key)
      - `seller_id` (uuid, references profiles)
      - `listing_type` (text) - 'resource' or 'ship'
      - `item_code` (text) - resource type (metal, crystal, deuterium) or ship code
      - `quantity` (bigint) - amount for sale
      - `price_per_unit` (numeric) - FXU price per unit
      - `total_price` (numeric) - total FXU price
      - `planet_id` (uuid) - source planet for ships
      - `status` (text) - 'active', 'sold', 'cancelled'
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `market_transactions`
      - `id` (uuid, primary key)
      - `listing_id` (uuid, references market_listings)
      - `buyer_id` (uuid, references profiles)
      - `seller_id` (uuid, references profiles)
      - `item_type` (text)
      - `item_code` (text)
      - `quantity` (bigint)
      - `total_price` (numeric)
      - `created_at` (timestamptz)

  3. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'fxu_balance'
  ) THEN
    ALTER TABLE profiles ADD COLUMN fxu_balance numeric DEFAULT 1000;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  listing_type text NOT NULL CHECK (listing_type IN ('resource', 'ship')),
  item_code text NOT NULL,
  quantity bigint NOT NULL CHECK (quantity > 0),
  price_per_unit numeric NOT NULL CHECK (price_per_unit > 0),
  total_price numeric NOT NULL CHECK (total_price > 0),
  planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES market_listings(id) ON DELETE SET NULL,
  buyer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  item_type text NOT NULL,
  item_code text NOT NULL,
  quantity bigint NOT NULL,
  total_price numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all active listings" ON market_listings;
CREATE POLICY "Users can view all active listings"
  ON market_listings
  FOR SELECT
  TO authenticated
  USING (status = 'active' OR seller_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own listings" ON market_listings;
CREATE POLICY "Users can create own listings"
  ON market_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own listings" ON market_listings;
CREATE POLICY "Users can update own listings"
  ON market_listings
  FOR UPDATE
  TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own transactions" ON market_transactions;
CREATE POLICY "Users can view own transactions"
  ON market_transactions
  FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

DROP POLICY IF EXISTS "Users can create transactions" ON market_transactions;
CREATE POLICY "Users can create transactions"
  ON market_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (buyer_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status);
CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON market_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_type ON market_listings(listing_type);
CREATE INDEX IF NOT EXISTS idx_market_transactions_buyer ON market_transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_market_transactions_seller ON market_transactions(seller_id);