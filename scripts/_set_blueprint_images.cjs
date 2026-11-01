/* Actualiza image_url de los planos de naves */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');

const updates = [
  {
    code: 'bp_falco_x_clasica',
    url: 'https://photos.pinksale.finance/file/pinksale-logo-upload/1777176590989-e563889137544a659a7a6b3d3a488c59.png',
  },
  {
    code: 'bp_mega_recycler',
    url: 'https://photos.pinksale.finance/file/pinksale-logo-upload/1777176819423-93a7d42bbc57ad4db5ad134c1874d122.png',
  },
];

(async () => {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const u of updates) {
      const r = await client.query(
        'UPDATE ship_blueprints SET image_url = $1 WHERE code = $2 RETURNING code, name, image_url',
        [u.url, u.code]
      );
      console.log('OK ->', r.rows[0]);
    }
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
