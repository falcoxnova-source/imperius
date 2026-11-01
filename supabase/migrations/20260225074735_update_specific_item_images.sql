/*
  # Update specific item images

  1. Changes
    - metal_mine: new PNG image
    - large_cargo: new PNG image
    - small_cargo: new PNG image
    - metal_storage: new PNG image
    - star_destroyer: new JPG image
    - computer_tech: new PNG image
    - recycler: new PNG image
    - solar_satellite: new PNG image
    - destroyer: new PNG image
*/

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772004794969-e29e33f7ef2d9442f84835c0eaa6bec9.png' WHERE code = 'metal_mine';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005031713-bf72837ff5025247eff70a6e7017b50e.png' WHERE code = 'large_cargo';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005075088-d168213e2b6ff2721f7e15138acce396.png' WHERE code = 'small_cargo';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005263456-0ee2eb48a217819e76331661a20a2fa1.png' WHERE code = 'metal_storage';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005354104-101b69e5b11592c274998ca8b9b37290.jpg' WHERE code = 'star_destroyer';
UPDATE technology_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005463772-98504cca55d501fa1dc2f2b4e2fa9255.png' WHERE code = 'computer_tech';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005504931-cfccc3f60cecf96ed34f2ed91568fcec.png' WHERE code = 'recycler';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005533412-3ff3e5ef477536fb3561de5f22b1f103.png' WHERE code = 'solar_satellite';
UPDATE ship_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772005569450-0c8abf127694ce2a855dc6fbd8cfc186.png' WHERE code = 'destroyer';
