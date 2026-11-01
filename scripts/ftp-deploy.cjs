const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');

async function deploy() {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: '92.112.189.119',
      user: 'u469245519.falcox.net',
      password: 'Jfs.samsung1989*',
      secure: false
    });
    console.log('✅ Connected to FTP');

    // List root to find the right directory
    const rootList = await client.list('/');
    console.log('Root dirs:', rootList.filter(f => f.isDirectory).map(f => f.name).join(', '));

    // Navigate to public_html or root
    const targetDir = rootList.find(f => f.name === 'public_html') ? '/public_html' : '/';
    console.log('Target:', targetDir);

    // Upload dist folder contents
    const distPath = path.join(__dirname, '..', 'dist');
    console.log('Uploading from:', distPath);

    await client.ensureDir(targetDir);
    await client.clearWorkingDir(); // Clean old files
    await client.uploadFromDir(distPath);

    console.log('✅ Upload complete!');
  } catch (err) {
    console.error('❌ FTP Error:', err.message);
  } finally {
    client.close();
  }
}

deploy();
