/*
  # Update Technology Research Images

  This migration updates the image_url for all research technologies
  with new custom artwork images.

  ## Technologies Updated:
  1. Energy Technology - New energy orb image
  2. Laser Technology - New laser beam image
  3. Ion Technology - New ion particle image
  4. Hyperspace Technology - New warp vortex image
  5. Plasma Technology - New plasma sphere image
  6. Combustion Drive - New rocket thruster image
  7. Impulse Drive - New ion engine image
  8. Hyperspace Drive - New warp drive image
  9. Espionage Technology - New stealth probe image
  10. Computer Technology - New quantum processor image
  11. Weapons Technology - New weapons array image
  12. Shielding Technology - New force field image
  13. Armour Technology - New armor plating image
  14. Graviton Technology - New gravity manipulation image
  15. Astrophysics - New galaxy map image
  16. Intergalactic Research Network - New network nodes image
*/

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768094422068-903df590ab0a1561de5a6a9fcd1da2db.png' WHERE code = 'energy_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768094568554-7595b85ef6a1836b6ce872e4d0c494bc.png' WHERE code = 'laser_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768094722950-2a8266504358975d6541b5715c9f23ad.png' WHERE code = 'ion_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768094849357-e4245e7c34453e0688c532f7a747ae85.png' WHERE code = 'hyperspace_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768094978209-e607f5daa337f11d02c595989d44bc55.png' WHERE code = 'plasma_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768095298090-53b3176af553b4fc2184e3f1be2494ee.png' WHERE code = 'combustion_drive';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768095402379-259f3ffdcd623bbac75003c3071fea4e.png' WHERE code = 'impulse_drive';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768096833280-2064a8dfd8b6919c09473c9aca0d8f8e.png' WHERE code = 'hyperspace_drive';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768097834926-5f634696706cf5577fd528c0a9ec3b8a.png' WHERE code = 'espionage_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768097982421-98504cca55d501fa9dc2f2b4e2fa9255.png' WHERE code = 'computer_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768098104873-2eaa0bccb262afcbb34d00660dcd028f.png' WHERE code = 'weapons_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768098214309-02318c35a5f648329e740e357fd9646d.png' WHERE code = 'shielding_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768098307515-a358843a045a1bb8ee614bf4efc8d589.png' WHERE code = 'armour_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768098499106-62e286786b9b4ff4f5e34e26698a8919.png' WHERE code = 'graviton_tech';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768098637153-e9ca0d8910b9dd11d6291c7def3b30b8.png' WHERE code = 'astrophysics';

UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1768098750276-a977e9315b761567348719aeb288b16e.png' WHERE code = 'intergalactic_research_network';
