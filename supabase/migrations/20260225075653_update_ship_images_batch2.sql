/*
  # Update ship images batch 2

  1. Changes
    - cruiser: new JPG image
    - espionage_probe: new PNG image
    - battleship: new PNG image
    - bomber: new PNG image
    - battlecruiser: new PNG image
    - death_star: new PNG image
    - colony_ship: new PNG image
*/

UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005928404-72af69d26b51ea1d9e168a0902a9b08c.jpg' WHERE code = 'cruiser';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005964328-2c917750bfdc0644e0689f2d9cabbbcb.png' WHERE code = 'espionage_probe';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005990615-99e56e79d4658a86feac2eb4cdaf6cdc.png' WHERE code = 'battleship';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772006022235-fde453e6d825a8717af8cbc24683f0cd.png' WHERE code = 'bomber';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772006055917-c104718cefd4e73fe062111a20e030e3.png' WHERE code = 'battlecruiser';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772006091556-ff5638b1296a9565dac6b6176706583b.png' WHERE code = 'death_star';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772006152297-8ced656ca34885dd6866b792cf0a851f.png' WHERE code = 'colony_ship';
