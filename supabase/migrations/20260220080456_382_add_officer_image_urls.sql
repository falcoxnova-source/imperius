/*
  # Add image URLs to officer types

  1. Modified Tables
    - `officer_types`
      - Added `image_url` (text, nullable) - URL to the officer's webm video

  2. Data Updates
    - Set webm video URLs for all 5 officer types from CDN
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'officer_types' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE officer_types ADD COLUMN image_url text;
  END IF;
END $$;

UPDATE officer_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/oficiales/comandante.webm' WHERE code = 'commander';
UPDATE officer_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/oficiales/almirante.webm' WHERE code = 'admiral';
UPDATE officer_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/oficiales/ingeniero.webm' WHERE code = 'engineer';
UPDATE officer_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/oficiales/geologo.webm' WHERE code = 'geologist';
UPDATE officer_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/oficiales/tecnocrata.webm' WHERE code = 'technocrat';
