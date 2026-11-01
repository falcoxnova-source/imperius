/*
  # Update images for research lab, missile silo, and deathstar

  1. Changes
    - research_lab (Laboratorio de Investigacion): new PNG image
    - missile_silo (Silo de Misiles): new PNG image
    - deathstar (Estrella de la Muerte): new PNG image
*/

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772007951599-1e5165fab44de40607f73c5221f371f4.png' WHERE code = 'research_lab';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772007980893-6a9787882dbffc02f59157f80230a63b.png' WHERE code = 'missile_silo';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772008011261-5d2077a08cc128ed5427ebe5c66a0c13.png' WHERE code = 'deathstar';
