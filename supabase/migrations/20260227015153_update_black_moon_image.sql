/*
  # Update Black Moon image

  1. Changes
    - Update the `image_url` of the Black Moon ship to a new PNG image
*/

UPDATE ship_types
SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772157015032-9e15cad10b784a6285d1610771f2524d.png'
WHERE code = 'black_moon';