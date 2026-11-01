/*
  # Update Building and Ship Images
  
  1. Changes
    - Update image_url for various buildings
    - Update image_url for ships
    - Add new building images for special structures
*/

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502145079-240689fa22a5bc42afbd193baaccce74.png' WHERE code = 'robot_factory';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502283746-a15ddfa3b43bfe961e17aff33ed781eb.png' WHERE code = 'nanite_factory';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502513822-7990f11fe28476739344d0387f543cb0.png' WHERE code = 'shipyard';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502694109-94c9ee15b4d68cc02b1f18d44b307f8a.png' WHERE code = 'research_lab';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502821125-a843b893886a606871cb6f5b30e033.png' WHERE code = 'metal_storage';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502961467-17f08b20f19b9a5c51962facfc9065f1.png' WHERE code = 'crystal_storage';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503019429-ddf7501ef54b3bbed52480a9a7489b5b.png' WHERE code = 'deuterium_tank';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503253509-affe8bd891fd9cf68a035e1dfe05e3a9.png' WHERE code = 'missile_silo';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503329428-a7d9deac277f359453970d4b18402c19.png' WHERE code = 'terraformer';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503420021-9541928d996a5aacb043512685d16cf6.png' WHERE code = 'sensor_phalanx';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503487251-65ec91445d0413452b0ffca54c417ae7.png' WHERE code = 'lunar_base';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503581192-65c66dd4ec463c9aa6875576b9be85ed.png' WHERE code = 'jump_gate';

UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503130589-9ecf502404b4890cd0e21f59b5f8ec3d.png' WHERE code = 'light_fighter';

UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767503164868-fa367af46b9d9278cd60a95c889ae3c6.png' WHERE code = 'heavy_fighter';
