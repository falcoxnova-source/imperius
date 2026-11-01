/*
  # Restore Resource Building Images
  
  1. Changes
    - Restores image_url for metal_mine, crystal_mine, deuterium_synthesizer, solar_plant, and fusion_reactor
    - These images were previously set but got cleared
*/

UPDATE building_types SET image_url = 'https://falcox.net/xnova/metal.webm' WHERE code = 'metal_mine';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767500260583-1c1e0a10de931c83cc726ce66240f2ad.png' WHERE code = 'crystal_mine';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767500235362-91a4fe51d8300c933ea35868e78eac4a.png' WHERE code = 'deuterium_synthesizer';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767500401927-33ce3855ed015a7a0b437bba4de0847f.png' WHERE code = 'solar_plant';

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767500503379-fd4ed8645949e07e276a4a0973c3c166.png' WHERE code = 'fusion_reactor';