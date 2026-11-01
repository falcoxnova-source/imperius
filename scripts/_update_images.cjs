const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const buildings = [
    ['metal_mine',            '1776993337563-8e18c2ae7d5177edc9314cd4d9a87c5a'],
    ['crystal_mine',          '1776993224661-ff5af9842b4a67e8f0071f5f1a89ea6e'],
    ['deuterium_synthesizer', '1776993285854-802de110e9e46993b12bc4c3983b3433'],
    ['solar_plant',           '1776993369830-83426d960074ae08fa8056bd47af9041'],
    ['fusion_reactor',        '1776993401189-e7d496cf34f237a135231d8622e72f3a'],
    ['metal_storage',         '1776994591453-5a7d659fec7f09c94c4d23718d2c1615'],
    ['crystal_storage',       '1776994504292-0f5882df5a9c2365235bcda17b1c9ac4'],
    ['deuterium_tank',        '1776994610160-b31c5430a01ec3bde8a91323df7f2921'],
    ['lunar_base',            '1776998724657-a523d3c52b584d483eb68ec8a7077a4b'],
    ['alliance_depot',        '1776998796962-4cbadc8f9fec2fd129314b7f2b8ecf8f'],
    ['nanite_factory',        '1776998833074-f35a6b0fc613c8bbccee3fdc8dc4ceaf'],
    ['robotics_factory',      '1776998875741-04b981262397026bfa42f83e69c7b60e'],
    ['shipyard',              '1776998932023-f0f39943349c2cb04c16f84e1ed2ff62'],
    ['research_lab',          '1776998980441-94c9ee15b4d68cc02b1f18d44b307f8a'],
    ['jump_gate',             '1776999049934-9cca9b3cfd543be1e8559d2b09a371e7'],
    ['sensor_phalanx',        '1776999093457-58262db9795b0ad6e2e834d3b8e43886'],
    ['missile_silo',          '1776999124921-affe8bd891fd9cf68a035e1dfe05e3a9'],
    ['terraformer',           '1776999165345-bf6634af4466d097d5c058fe9f31d029'],
  ];

  const defenses = [
    ['light_laser',     '1777010960466-c931d4e600d6b018271ea2aeb7bf9568'],
    ['rocket_launcher', '1777010993537-53a53cb8e5ac692442fbe915407599f4'],
    ['gauss_cannon',    '1777011039595-a69abe7c73c2992688c35481134e0c55'],
    ['ion_cannon',      '1777011066348-3a0d516ec5108fb101ec56c695a0036f'],
    ['plasma_turret',   '1777011101730-3044b44903da6c19d960f641de231bb2'],
    ['heavy_laser',     '1777011154969-71aa4629b6755d83e624491de5718ab2'],
  ];

  const base = 'https://photos.pinksale.finance/file/pinksale-logo-upload/';

  try {
    await c.query('BEGIN');
    let okB=0, missB=[];
    for (const [code, hash] of buildings) {
      const r = await c.query(`UPDATE building_types SET image_url=$1 WHERE code=$2`, [base+hash+'.png', code]);
      if (r.rowCount) okB++; else missB.push(code);
    }
    let okD=0, missD=[];
    for (const [code, hash] of defenses) {
      const r = await c.query(`UPDATE defense_types SET image_url=$1 WHERE code=$2`, [base+hash+'.png', code]);
      if (r.rowCount) okD++; else missD.push(code);
    }
    console.log(`Edificios actualizados: ${okB}/${buildings.length}`, missB.length?'no encontrados: '+missB.join(','):'');
    console.log(`Defensas actualizadas:  ${okD}/${defenses.length}`, missD.length?'no encontrados: '+missD.join(','):'');
    await c.query('COMMIT');
    console.log('✓ COMMIT');
  } catch(e) {
    await c.query('ROLLBACK');
    console.error('ROLLBACK:', e.message);
    process.exitCode=1;
  } finally { await c.end(); }
})();
