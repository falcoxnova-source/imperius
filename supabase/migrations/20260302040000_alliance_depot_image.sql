/*
  # Add Alliance Depot Image

  1. Changes
    - Sets image_url for alliance_depot building type

  2. Safety
    - Simple UPDATE, no function changes
    - Only affects image_url column for one building
*/

UPDATE building_types
SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772433597753-6ccd20fe5379e3d5c6783f2f5d01d515.png'
WHERE code = 'alliance_depot';
