/*
  # Fix Robotics Factory Image
  
  1. Changes
    - Update image_url for robotics_factory (was using wrong code)
*/

UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1767502145079-240689fa22a5bc42afbd193baaccce74.png' WHERE code = 'robotics_factory';
