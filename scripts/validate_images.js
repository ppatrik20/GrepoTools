const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function validate() {
  const dirs = ['public/map/islands', 'public/map/towns', 'public/map/slots'];
  for (const d of dirs) {
    const p = path.join(__dirname, '..', d);
    if (!fs.existsSync(p)) {
      console.log('Dir does not exist:', p);
      continue;
    }
    const files = fs.readdirSync(p);
    console.log(`Testing ${d}: ${files.length} files`);
    for (const f of files) {
      try {
        const meta = await sharp(path.join(p, f)).metadata();
        if (!meta.width || !meta.height) throw new Error('Invalid dimensions');
      } catch (e) {
        console.error('FAILED file:', d, f, e.message);
      }
    }
  }
  console.log('Validation complete!');
}

validate().catch(console.error);
