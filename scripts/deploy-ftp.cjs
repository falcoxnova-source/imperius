const ftp = require('basic-ftp');
const path = require('path');

async function deploy() {
  const client = new ftp.Client();
  client.ftp.verbose = true;

  try {
    await client.access({
      host: '92.112.189.119',
      user: 'u469245519.falcox.net',
      password: 'Jfs.samsung1989*',
      secure: false,
    });

    console.log('Connected to FTP server');

    // Upload dist folder contents to root
    const distPath = path.join(__dirname, '..', 'dist');
    console.log(`Uploading from: ${distPath}`);

    await client.uploadFromDir(distPath, '/');

    console.log('✅ Deploy complete!');
  } catch (err) {
    console.error('Deploy error:', err);
    process.exit(1);
  } finally {
    client.close();
  }
}

deploy();
