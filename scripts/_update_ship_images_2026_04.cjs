const { Client } = require('pg');

const updates = [
  ['large_frigate',   'https://photos.pinksale.finance/file/pinksale-logo-upload/1777140210279-755991bc5f72b322e9f21a6a654f253b.png'],
  ['mega_recycler',   'https://photos.pinksale.finance/file/pinksale-logo-upload/1777140264935-5b02d13132fa1a23cb402e9fd78a0164.png'],
  ['colony_ship',     'https://photos.pinksale.finance/file/pinksale-logo-upload/1777140293831-bed79912c73b2e19fc39c78d7752bdd7.png'],
  ['large_cargo',     'https://photos.pinksale.finance/file/pinksale-logo-upload/1777140315371-e3f18a15c2390a65036bada34444dc6a.png'],
  ['small_cargo',     'https://photos.pinksale.finance/file/pinksale-logo-upload/1777140346842-1f8597759bab1e6ddc51b68447e992b8.png'],
  ['recycler',        'https://photos.pinksale.finance/file/pinksale-logo-upload/1777140391632-8a08fbad3df180daab028673882f5cd9.png'],
  ['solar_satellite', 'https://photos.pinksale.finance/file/pinksale-logo-upload/1777140436298-a50f0d76ab6ef08353d4072b17857201.png'],
  ['espionage_probe', 'https://photos.pinksale.finance/file/pinksale-logo-upload/1777140452107-6c48f774b30eb2755e9c04c72f959f71.png'],
];

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    for (const [code, url] of updates) {
      const r = await c.query(
        'UPDATE ship_types SET image_url = $1 WHERE code = $2 RETURNING code, name',
        [url, code]
      );
      if (r.rows[0]) {
        console.log('✓', r.rows[0].code, '->', r.rows[0].name);
      } else {
        console.log('✗ no encontrado:', code);
      }
    }
  } finally {
    await c.end();
  }
})();
