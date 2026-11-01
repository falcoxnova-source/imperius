/*
  # Revert WebM videos back to original PNG/JPG images

  1. Changes
    - Restores all image_url values that had PNG/JPG images before the webm migrations (364, 365, 381, 382)
    - Buildings: 16 items restored to PNG
    - Ships: 3 items restored to PNG/JPG (light_fighter, heavy_fighter, falco_x_clasica)
    - Technologies: 16 items restored to PNG
    - Officers: image_url set to NULL (column was added by webm migration, no prior images existed)

  2. Important Notes
    - Items that never had PNG/JPG images (went from NULL to webm) are left with webm
    - This includes: metal_mine (building), most ships, and all defenses
    - Defense types are left unchanged as they never had non-webm images
*/

-- BUILDINGS: Restore to pre-webm PNG images
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767500260583-1c1e0a10de931c83cc726ce66240f2ad.png' WHERE code = 'crystal_mine';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767500235362-91a4fe51d8300c933ea35868e78eac4a.png' WHERE code = 'deuterium_synthesizer';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767500401927-33ce3855ed015a7a0b437bba4de0847f.png' WHERE code = 'solar_plant';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767500503379-fd4ed8645949e07e276a4a0973c3c166.png' WHERE code = 'fusion_reactor';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502821125-a843b893886a606871cb6f5b30e033.png' WHERE code = 'metal_storage';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502961467-17f08b20f19b9a5c51962facfc9065f1.png' WHERE code = 'crystal_storage';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503019429-ddf7501ef54b3bbed52480a9a7489b5b.png' WHERE code = 'deuterium_tank';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502145079-240689fa22a5bc42afbd193baaccce74.png' WHERE code = 'robotics_factory';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502283746-a15ddfa3b43bfe961e17aff33ed781eb.png' WHERE code = 'nanite_factory';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502513822-7990f11fe28476739344d0387f543cb0.png' WHERE code = 'shipyard';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502694109-94c9ee15b4d68cc02b1f18d44b307f8a.png' WHERE code = 'research_lab';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503253509-affe8bd891fd9cf68a035e1dfe05e3a9.png' WHERE code = 'missile_silo';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503329428-a7d9deac277f359453970d4b18402c19.png' WHERE code = 'terraformer';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503420021-9541928d996a5aacb043512685d16cf6.png' WHERE code = 'sensor_phalanx';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503487251-65ec91445d0413452b0ffca54c417ae7.png' WHERE code = 'lunar_base';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503581192-65c66dd4ec463c9aa6875576b9be85ed.png' WHERE code = 'jump_gate';

-- SHIPS: Restore only the ones that had PNG/JPG
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503130589-9ecf502404b4890cd0e21f59b5f8ec3d.png' WHERE code = 'light_fighter';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503164868-fa367af46b9d9278cd60a95c889ae3c6.png' WHERE code = 'heavy_fighter';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1770714305421-e92fafc9777f9b43ae15adb556175ae3.jpg' WHERE code = 'falco_x_clasica';

-- TECHNOLOGIES: Restore all 16 to PNG
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

-- OFFICERS: Set to NULL (no images existed before webm migration added the column)
UPDATE officer_types SET image_url = NULL;
